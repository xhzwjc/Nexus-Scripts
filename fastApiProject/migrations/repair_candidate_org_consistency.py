"""Audit and repair candidate-owned organization codes.

The candidate row is the ownership source of truth. This migration repairs
denormalized ``org_code`` values that may have been left behind when a
candidate was reassigned to a position in another organization.

Run without arguments for a read-only audit. Pass ``--apply`` to commit.
Historical ``position_id`` values and interviewer availability slots are
preserved; active schedule/position mismatches are reported and block apply.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Callable, Sequence
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import SessionLocal
from app.permission_governance import normalize_org_code
from app.recruitment_models import (
    RecruitmentCandidate,
    RecruitmentFollowUp,
    RecruitmentInterviewResult,
    RecruitmentInterviewSchedule,
    RecruitmentOffer,
)


CANDIDATE_OWNED_MODELS = (
    ("interview_schedules", RecruitmentInterviewSchedule),
    ("interview_results", RecruitmentInterviewResult),
    ("follow_ups", RecruitmentFollowUp),
    ("offers", RecruitmentOffer),
)
ACTIVE_INTERVIEW_STATUSES = ("scheduled", "confirmed", "in_progress")


def _candidate_org_rows(db: Any, model: Any) -> list[tuple[Any, Any]]:
    return db.query(model, RecruitmentCandidate.org_code).join(
        RecruitmentCandidate,
        RecruitmentCandidate.id == model.candidate_id,
    ).all()


def _mismatch_rows(db: Any, model: Any) -> list[tuple[Any, Any]]:
    # Compare in Python so MySQL's commonly case-insensitive collations and
    # SQLite's case-sensitive comparison produce identical audit results.
    return [
        (row, candidate_org_code)
        for row, candidate_org_code in _candidate_org_rows(db, model)
        if row.org_code != candidate_org_code
    ]


def _invalid_candidate_org_rows(db: Any) -> list[tuple[int, Any]]:
    return [
        (int(candidate_id), org_code)
        for candidate_id, org_code in db.query(
            RecruitmentCandidate.id,
            RecruitmentCandidate.org_code,
        ).all()
        if org_code != normalize_org_code(org_code)
    ]


def _active_schedule_position_mismatch_count(db: Any) -> int:
    active_position_rows = db.query(
        RecruitmentInterviewSchedule.position_id,
        RecruitmentCandidate.position_id,
    ).join(
        RecruitmentCandidate,
        RecruitmentCandidate.id == RecruitmentInterviewSchedule.candidate_id,
    ).filter(
        RecruitmentInterviewSchedule.status.in_(ACTIVE_INTERVIEW_STATUSES),
    ).all()
    return sum(
        1
        for schedule_position_id, candidate_position_id in active_position_rows
        if schedule_position_id != candidate_position_id
    )


def audit_candidate_org_consistency(db: Any) -> dict[str, Any]:
    tables: dict[str, dict[str, int]] = {}
    for label, model in CANDIDATE_OWNED_MODELS:
        mismatch_count = len(_mismatch_rows(db, model))
        orphan_count = db.query(model.id).outerjoin(
            RecruitmentCandidate,
            RecruitmentCandidate.id == model.candidate_id,
        ).filter(RecruitmentCandidate.id.is_(None)).count()
        tables[label] = {
            "mismatches": int(mismatch_count),
            "orphans": int(orphan_count),
        }

    return {
        "tables": tables,
        "active_schedule_position_mismatches": _active_schedule_position_mismatch_count(db),
        "invalid_candidate_org_codes": len(_invalid_candidate_org_rows(db)),
    }


def repair_candidate_org_consistency(db: Any) -> dict[str, int]:
    invalid_candidates = _invalid_candidate_org_rows(db)
    if invalid_candidates:
        raise RuntimeError(
            "Candidate org repair blocked: "
            f"{len(invalid_candidates)} candidate rows have blank or non-canonical org_code values"
        )
    active_position_mismatches = _active_schedule_position_mismatch_count(db)
    if active_position_mismatches:
        raise RuntimeError(
            "Candidate org repair blocked: "
            f"{active_position_mismatches} active interview schedules do not match candidate position_id"
        )
    updated: dict[str, int] = {}
    for label, model in CANDIDATE_OWNED_MODELS:
        rows = _mismatch_rows(db, model)
        for row, candidate_org_code in rows:
            row.org_code = candidate_org_code
            db.add(row)
        updated[label] = len(rows)
    return updated


def _print_report(title: str, report: dict[str, Any]) -> None:
    print(title)
    for label, counts in report["tables"].items():
        print(
            f"  {label}: mismatches={counts['mismatches']} "
            f"orphans={counts['orphans']}"
        )
    print(
        "  active_schedule_position_mismatches="
        f"{report['active_schedule_position_mismatches']}"
    )
    print(
        "  invalid_candidate_org_codes="
        f"{report['invalid_candidate_org_codes']}"
    )


def main(
    argv: Sequence[str] | None = None,
    session_factory: Callable[[], Any] = SessionLocal,
) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit org_code repairs. Without this flag the command is read-only.",
    )
    args = parser.parse_args(argv)

    db = session_factory()
    try:
        before = audit_candidate_org_consistency(db)
        _print_report("Before repair:", before)
        if not args.apply:
            print("Dry run only. Re-run with --apply to commit repairs.")
            return
        if before["invalid_candidate_org_codes"]:
            raise RuntimeError(
                "Candidate org repair blocked: "
                f"{before['invalid_candidate_org_codes']} candidate rows have blank or non-canonical org_code values"
            )
        if before["active_schedule_position_mismatches"]:
            raise RuntimeError(
                "Candidate org repair blocked: "
                f"{before['active_schedule_position_mismatches']} active interview schedules do not match candidate position_id"
            )

        updated = repair_candidate_org_consistency(db)
        db.flush()
        after = audit_candidate_org_consistency(db)
        _print_report("After repair:", after)
        remaining = sum(item["mismatches"] for item in after["tables"].values())
        if after["invalid_candidate_org_codes"]:
            raise RuntimeError(
                "Candidate org repair incomplete: "
                f"{after['invalid_candidate_org_codes']} invalid candidate org_code values remain"
            )
        if after["active_schedule_position_mismatches"]:
            raise RuntimeError(
                "Candidate org repair incomplete: "
                f"{after['active_schedule_position_mismatches']} active interview position mismatches remain"
            )
        if remaining:
            raise RuntimeError(f"Candidate org repair incomplete: {remaining} mismatches remain")
        db.commit()
        print("Updated rows:")
        for label, count in updated.items():
            print(f"  {label}: {count}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
