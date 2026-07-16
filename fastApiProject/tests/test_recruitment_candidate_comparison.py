import asyncio
import json
from datetime import datetime
from unittest.mock import Mock

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.permission_governance import PermissionContext
from app.recruitment_models import (
    RecruitmentAITaskLog,
    RecruitmentCandidate,
    RecruitmentCandidateScore,
    RecruitmentPosition,
    RecruitmentResumeFile,
    RecruitmentResumeParseResult,
)
from app.recruitment_schemas import CandidateComparisonPreviewRequest, CandidateUpdateRequest
from app.routers import recruitment as recruitment_router
from app.services.recruitment_service_impl import (
    RAW_SCREENING_SCORE_STORAGE_FORMAT,
    RecruitmentService,
    _build_json_content_hash,
    _build_resume_content_hash,
)


def _build_test_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    return testing_session_local()


def _add_position(db, *, position_id: int = 101, org_code: str = "org-a") -> RecruitmentPosition:
    position = RecruitmentPosition(
        id=position_id,
        position_code=f"POS-{position_id}",
        org_code=org_code,
        title="Backend Engineer",
        department="Engineering",
        location="Shanghai",
        employment_type="full_time",
        salary_range="30k-40k",
        key_requirements="Python and distributed systems",
        bonus_points="Recruitment platform experience",
        summary="Build reliable services",
        status="recruiting",
        created_by="owner-a",
        updated_by="owner-a",
        deleted=False,
    )
    db.add(position)
    db.commit()
    db.refresh(position)
    return position


def _position_snapshot(position: RecruitmentPosition) -> dict:
    return {
        "title": position.title,
        "department": position.department,
        "location": position.location,
        "employment_type": position.employment_type,
        "salary_range": position.salary_range,
        "key_requirements": position.key_requirements,
        "bonus_points": position.bonus_points,
        "summary": position.summary,
        "active_jd_snapshot": None,
    }


def _skill_snapshots() -> list[dict]:
    return [
        {
            "id": 11,
            "skill_code": "backend-screening",
            "name": "Backend screening",
            "description": "Backend evaluation rules",
            "skill_group": "screening",
            "version": "1.0.0",
            "task_types": ["screening"],
            "content": "Evaluate engineering and delivery evidence.",
            "tags": ["backend"],
            "sort_order": 1,
            "is_enabled": True,
        },
        {
            "id": -2,
            "skill_code": "custom-hard-requirement",
            "name": "Temporary requirement",
            "description": "Current screening requirement",
            "skill_group": None,
            "version": None,
            "task_types": [],
            "content": "Must have production Python experience.",
            "tags": ["temporary"],
            "sort_order": 10000,
            "is_enabled": True,
        },
    ]


def _score_rules() -> list[dict]:
    return [
        {
            "skill_id": 11,
            "skill_name": "Backend screening",
            "label": "Engineering",
            "max_score": 8.0,
            "is_core": True,
            "note": "Engineering depth",
        },
        {
            "skill_id": 11,
            "skill_name": "Backend screening",
            "label": "Delivery",
            "max_score": 2.0,
            "is_core": False,
            "note": "Delivery evidence",
        },
    ]


def _score_body(engineering_score: float, delivery_score: float) -> dict:
    total_score = engineering_score + delivery_score
    return {
        "_storage_format": RAW_SCREENING_SCORE_STORAGE_FORMAT,
        "score": {
            "total_score": total_score,
            "match_percent": min(100, round(total_score * 10)),
            "advantages": ["Strong engineering evidence"],
            "concerns": ["Limited management evidence"],
            "recommendation": "Proceed to review",
            "suggested_status": "screening_passed",
            "dimensions": [
                {
                    "label": "Engineering",
                    "score": engineering_score,
                    "max_score": 8.0,
                    "reason": "Engineering reason",
                    "evidence": ["Engineering evidence"],
                    "is_inferred": False,
                    "radar_category": "skills",
                },
                {
                    "label": "Delivery",
                    "score": delivery_score,
                    "max_score": 2.0,
                    "reason": "Delivery reason",
                    "evidence": ["Delivery evidence"],
                    "is_inferred": False,
                    "radar_category": "experience",
                },
            ],
        },
        "debug": {
            "score_source": "primary_screening_model",
            "primary_model_call_succeeded": True,
            "final_response_source": "primary_screening_model",
            "score_validation_passed": True,
            "validation_warnings": [],
        },
    }


def _add_strict_candidate(
    db,
    position: RecruitmentPosition,
    *,
    index: int,
    engineering_score: float,
    delivery_score: float,
    phone: str | None = None,
    email: str | None = None,
    created_by: str = "owner-a",
    model_name: str = "model-a",
) -> tuple[RecruitmentCandidate, RecruitmentAITaskLog]:
    candidate = RecruitmentCandidate(
        candidate_code=f"CAND-{index}",
        org_code=position.org_code,
        position_id=position.id,
        name=f"Candidate {index}",
        phone=phone,
        email=email,
        current_company=f"Company {index}",
        years_of_experience=f"{index + 3} years",
        education="Bachelor",
        city="Shanghai",
        source="manual_upload",
        status="screening_passed",
        created_by=created_by,
        updated_by=created_by,
        deleted=False,
    )
    db.add(candidate)
    db.flush()
    resume = RecruitmentResumeFile(
        candidate_id=candidate.id,
        org_code=position.org_code,
        original_name=f"resume-{index}.pdf",
        stored_name=f"resume-{index}.pdf",
        file_ext=".pdf",
        mime_type="application/pdf",
        file_size=1024,
        storage_path=f"test/resume-{index}.pdf",
        parse_status="success",
        uploaded_by=created_by,
    )
    db.add(resume)
    db.flush()
    raw_text = f"PRIVATE RAW RESUME CONTENT {index}"
    parse = RecruitmentResumeParseResult(
        candidate_id=candidate.id,
        resume_file_id=resume.id,
        org_code=position.org_code,
        raw_text=raw_text,
        basic_info_json=json.dumps({"name": candidate.name}),
        work_experiences_json="[]",
        education_experiences_json="[]",
        skills_json="[]",
        projects_json="[]",
        summary_text="summary",
        status="success",
    )
    db.add(parse)
    db.flush()
    score = RecruitmentCandidateScore(
        candidate_id=candidate.id,
        parse_result_id=parse.id,
        org_code=position.org_code,
        score_json=json.dumps(_score_body(engineering_score, delivery_score)),
        total_score=engineering_score + delivery_score,
        match_percent=min(100, round((engineering_score + delivery_score) * 10)),
        recommendation="Proceed to review",
        suggested_status="screening_passed",
    )
    db.add(score)
    db.flush()
    candidate.latest_resume_file_id = resume.id
    candidate.latest_parse_result_id = parse.id
    candidate.latest_score_id = score.id

    rules = _score_rules()
    skills = _skill_snapshots()
    position_payload = _position_snapshot(position)
    request_hash = f"request-{index}"
    request_meta = {
        "request_hash": request_hash,
        "request_scope": "screening_one_pass",
        "screening_mode": "default",
        "resume_file_id": resume.id,
        "raw_resume_text_hash": _build_resume_content_hash(raw_text),
        "position_id": position.id,
        "position_snapshot_hash": _build_json_content_hash(position_payload),
        "position_snapshot": position_payload,
        "score_rule_snapshot_hash": _build_json_content_hash(rules),
        "custom_requirements_hash": _build_resume_content_hash("Must have production Python experience."),
        "prompt_version": "screening-v3",
        "provider": "openai-compatible",
        "model_name": model_name,
        "source": "db:test",
        "temperature": 0,
    }
    response_format = {"type": "json_object"}
    full_request = {
        "provider": "openai-compatible",
        "runtime_provider": "openai-compatible",
        "model_name": model_name,
        "source": "db:test",
        "base_url": "https://model.example.test/v1",
        "endpoint": "https://model.example.test/v1/chat/completions",
        "response_mode": "json",
        "temperature": 0,
        "response_format": response_format,
        "request_body": {
            "model": model_name,
            "temperature": 0,
            "stream": True,
            "response_format": response_format,
            "messages": [
                {"role": "system", "content": "Return the historical screening JSON schema."},
                {"role": "user", "content": raw_text},
            ],
        },
    }
    task = RecruitmentAITaskLog(
        task_type="screening_flow",
        org_code=position.org_code,
        screening_run_id=f"run-{index}",
        parent_task_id=None,
        root_task_id=None,
        related_position_id=position.id,
        related_candidate_id=candidate.id,
        related_resume_file_id=resume.id,
        related_skill_snapshots_json=json.dumps(skills),
        score_rule_snapshot_json=json.dumps(rules),
        request_hash=request_hash,
        model_provider="openai-compatible",
        model_name=model_name,
        model_source="db:test",
        full_request_snapshot=json.dumps(full_request),
        output_snapshot=json.dumps(
            {
                "request_meta": request_meta,
                "final_response_source": "primary_screening_model",
                "primary_model_call_succeeded": True,
                "parse_strategy": "combined_parse_and_score",
                "reused_existing_parse": False,
            }
        ),
        validation_meta_json=json.dumps(
            {
                "screening_result_valid": True,
                "final_response_source": "primary_screening_model",
                "primary_model_call_succeeded": True,
                "parse_strategy": "combined_parse_and_score",
                "reused_existing_parse": False,
            }
        ),
        persisted_result_refs_json=json.dumps(
            {"parse_result_id": parse.id, "score_result_id": score.id}
        ),
        status="success",
        created_by=created_by,
    )
    db.add(task)
    db.commit()
    db.refresh(candidate)
    db.refresh(task)
    return candidate, task


def test_request_schema_requires_two_to_four_unique_positive_strict_integer_ids():
    assert CandidateComparisonPreviewRequest(candidate_ids=[1, 2], expected_position_id=9).candidate_ids == [1, 2]
    assert len(CandidateComparisonPreviewRequest(candidate_ids=[1, 2, 3, 4], expected_position_id=9).candidate_ids) == 4

    invalid_payloads = (
        {"candidate_ids": [1], "expected_position_id": 9},
        {"candidate_ids": [1, 2, 3, 4, 5], "expected_position_id": 9},
        {"candidate_ids": [1, 1], "expected_position_id": 9},
        {"candidate_ids": [0, 2], "expected_position_id": 9},
        {"candidate_ids": [True, 2], "expected_position_id": 9},
        {"candidate_ids": [1, 2], "expected_position_id": 0},
    )
    for payload in invalid_payloads:
        with pytest.raises(ValidationError):
            CandidateComparisonPreviewRequest(**payload)


def test_preview_builds_strict_aligned_dimensions_without_pii_or_writes(monkeypatch):
    db = _build_test_db()
    position = _add_position(db)
    first, _ = _add_strict_candidate(
        db,
        position,
        index=1,
        engineering_score=6.4,
        delivery_score=0.8,
        phone="13800000000",
        email="first@example.test",
    )
    second, _ = _add_strict_candidate(
        db,
        position,
        index=2,
        engineering_score=4,
        delivery_score=1.6,
        phone="13900000000",
        email="second@example.test",
    )
    commit_mock = Mock(side_effect=AssertionError("preview must remain read-only"))
    monkeypatch.setattr(db, "commit", commit_mock)

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    assert result["comparability"] == {
        "level": "strict",
        "facts_allowed": True,
        "score_deltas_allowed": True,
        "ranking_allowed": True,
        "reasons": [],
    }
    assert result["target_context"]["evaluation_protocol_hash"].startswith("protocol:")
    assert result["snapshot_version"].startswith("cmpv1:")
    assert [member["artifact_state"] for member in result["members"]] == ["strict", "strict"]
    assert [dimension["spread"] for dimension in result["aligned_dimensions"]] == [40.0, 30.0]
    assert result["key_differences"] == [result["aligned_dimensions"][0]["dimension_key"], result["aligned_dimensions"][1]["dimension_key"]]
    delivery_values = result["aligned_dimensions"][0]["values"]
    assert delivery_values[0]["score"] == 0.8
    assert delivery_values[0]["normalized_score"] == 40.0
    assert delivery_values[1]["score"] == 1.6
    assert delivery_values[1]["normalized_score"] == 80.0
    assert delivery_values[1]["is_highest"] is True
    serialized = json.dumps(result, ensure_ascii=False)
    assert "13800000000" not in serialized
    assert "first@example.test" not in serialized
    assert "PRIVATE RAW RESUME CONTENT" not in serialized
    assert '"phone"' not in serialized
    assert '"email"' not in serialized
    assert len(serialized.encode("utf-8")) < 200_000
    commit_mock.assert_not_called()


def test_preview_scope_is_all_or_nothing_for_self_scope():
    db = _build_test_db()
    position = _add_position(db)
    visible, _ = _add_strict_candidate(
        db,
        position,
        index=1,
        engineering_score=8,
        delivery_score=2,
        created_by="owner-a",
    )
    hidden, _ = _add_strict_candidate(
        db,
        position,
        index=2,
        engineering_score=7,
        delivery_score=2,
        created_by="owner-b",
    )
    service = RecruitmentService(db)
    service.permission_context = PermissionContext(
        actor_user_code="owner-a",
        primary_org_code="org-a",
        data_scope="SELF",
        custom_org_codes=(),
        visible_org_codes=("org-a",),
        is_self_scope=True,
        permissions={"recruitment-candidate-manage": True},
    )

    with pytest.raises(ValueError, match="^candidate_comparison_scope_violation$"):
        service.preview_candidate_comparison([visible.id, hidden.id], position.id)


def test_preview_rejects_cross_position_selection_with_generic_error():
    db = _build_test_db()
    first_position = _add_position(db, position_id=101)
    second_position = _add_position(db, position_id=202)
    first, _ = _add_strict_candidate(db, first_position, index=1, engineering_score=8, delivery_score=2)
    second, _ = _add_strict_candidate(db, second_position, index=2, engineering_score=7, delivery_score=2)

    with pytest.raises(ValueError, match="^candidate_comparison_scope_violation$"):
        RecruitmentService(db).preview_candidate_comparison([first.id, second.id], first_position.id)


def test_legacy_protocol_is_facts_only_and_does_not_return_screening_values():
    db = _build_test_db()
    position = _add_position(db)
    first, first_task = _add_strict_candidate(db, position, index=1, engineering_score=8, delivery_score=2)
    second, _ = _add_strict_candidate(db, position, index=2, engineering_score=7, delivery_score=2)
    first_task.full_request_snapshot = None
    db.commit()

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    assert result["comparability"]["level"] == "limited"
    assert result["comparability"]["score_deltas_allowed"] is False
    assert "artifact_legacy" in result["comparability"]["reasons"]
    assert result["members"][0]["artifact_state"] == "legacy"
    assert result["members"][0]["screening"] is None
    assert all(member["screening"] is None for member in result["members"])
    assert result["aligned_dimensions"] == []


def test_exact_refs_from_old_position_are_stale_not_legacy():
    db = _build_test_db()
    position = _add_position(db)
    first, first_task = _add_strict_candidate(db, position, index=1, engineering_score=8, delivery_score=2)
    second, _ = _add_strict_candidate(db, position, index=2, engineering_score=7, delivery_score=2)
    first_task.related_position_id = position.id + 999
    db.commit()

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    first_member = result["members"][0]
    assert first_member["artifact_state"] == "stale"
    assert "artifact_stale" in first_member["warnings"]
    assert "position_context_mismatch" in first_member["warnings"]
    assert first_member["screening"] is None
    assert result["comparability"]["level"] == "incompatible"


@pytest.mark.parametrize("anomaly", ["duplicate", "extra", "missing", "max_mismatch"])
def test_dimension_anomalies_disable_horizontal_scores(anomaly):
    db = _build_test_db()
    position = _add_position(db)
    first, _ = _add_strict_candidate(db, position, index=1, engineering_score=8, delivery_score=2)
    second, _ = _add_strict_candidate(db, position, index=2, engineering_score=7, delivery_score=2)
    score = db.query(RecruitmentCandidateScore).filter(
        RecruitmentCandidateScore.id == first.latest_score_id
    ).one()
    stored = json.loads(score.score_json)
    dimensions = stored["score"]["dimensions"]
    if anomaly == "duplicate":
        dimensions[1] = dict(dimensions[0])
    elif anomaly == "extra":
        dimensions.append(
            {
                "label": "Extra",
                "score": 1,
                "max_score": 2,
                "reason": "extra",
                "evidence": [],
            }
        )
    elif anomaly == "missing":
        dimensions.pop()
    else:
        dimensions[0]["max_score"] = 100
    score.score_json = json.dumps(stored)
    db.commit()

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    assert result["members"][0]["artifact_state"] == "invalid"
    assert "dimension_mismatch" in result["members"][0]["warnings"]
    assert result["members"][0]["screening"] is None
    assert result["comparability"]["level"] == "incompatible"
    assert result["comparability"]["score_deltas_allowed"] is False
    assert result["aligned_dimensions"] == []


def test_duplicate_contacts_return_only_ids_and_disable_ranking():
    db = _build_test_db()
    position = _add_position(db)
    first, _ = _add_strict_candidate(
        db,
        position,
        index=1,
        engineering_score=8,
        delivery_score=2,
        phone="138-1234-5678",
        email="same@example.test",
    )
    second, _ = _add_strict_candidate(
        db,
        position,
        index=2,
        engineering_score=7,
        delivery_score=2,
        phone="+86 138 1234 5678",
        email="SAME@example.test",
    )

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    assert result["comparability"]["level"] == "strict"
    assert result["comparability"]["score_deltas_allowed"] is True
    assert result["comparability"]["ranking_allowed"] is False
    assert "possible_duplicate_contact" in result["comparability"]["reasons"]
    assert result["possible_duplicate_groups"] == [
        {"candidate_ids": [first.id, second.id], "matched_by": "both"}
    ]
    serialized_groups = json.dumps(result["possible_duplicate_groups"])
    assert "13812345678" not in serialized_groups
    assert "138-1234-5678" not in serialized_groups
    assert "same@example.test" not in serialized_groups.lower()


@pytest.mark.parametrize(
    ("task_status", "expected_state", "expected_code"),
    (("running", "processing", "artifact_processing"), ("timeout", "failed", "artifact_failed")),
)
def test_newer_current_rescreen_task_controls_processing_or_failed_state(
    task_status,
    expected_state,
    expected_code,
):
    db = _build_test_db()
    position = _add_position(db)
    first, _ = _add_strict_candidate(db, position, index=1, engineering_score=8, delivery_score=2)
    second, _ = _add_strict_candidate(db, position, index=2, engineering_score=7, delivery_score=2)
    newer_task = RecruitmentAITaskLog(
        task_type="screening_flow",
        org_code=position.org_code,
        screening_run_id="newer-run",
        related_position_id=position.id,
        related_candidate_id=first.id,
        related_resume_file_id=first.latest_resume_file_id,
        status=task_status,
        created_by="owner-a",
    )
    db.add(newer_task)
    db.commit()

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    assert result["members"][0]["artifact_state"] == expected_state
    assert expected_code in result["members"][0]["warnings"]
    assert expected_code in result["comparability"]["reasons"]
    assert result["members"][0]["screening"] is None
    assert result["comparability"]["level"] == "incompatible"


def test_newer_success_with_conflicting_persisted_refs_is_stale():
    db = _build_test_db()
    position = _add_position(db)
    first, _ = _add_strict_candidate(db, position, index=1, engineering_score=8, delivery_score=2)
    second, _ = _add_strict_candidate(db, position, index=2, engineering_score=7, delivery_score=2)
    db.add(
        RecruitmentAITaskLog(
            task_type="screening_flow",
            org_code=position.org_code,
            screening_run_id="late-success",
            related_position_id=position.id,
            related_candidate_id=first.id,
            related_resume_file_id=first.latest_resume_file_id,
            persisted_result_refs_json=json.dumps({"parse_result_id": 99991, "score_result_id": 99992}),
            status="success",
            created_by="owner-a",
        )
    )
    db.commit()

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    assert result["members"][0]["artifact_state"] == "stale"
    assert result["members"][0]["screening"] is None
    assert "artifact_stale" in result["comparability"]["reasons"]


def test_total_score_must_match_authoritative_dimension_sum():
    db = _build_test_db()
    position = _add_position(db)
    first, _ = _add_strict_candidate(db, position, index=1, engineering_score=8, delivery_score=2)
    second, _ = _add_strict_candidate(db, position, index=2, engineering_score=7, delivery_score=2)
    score = db.query(RecruitmentCandidateScore).filter(
        RecruitmentCandidateScore.id == first.latest_score_id
    ).one()
    score.total_score = 9
    score.match_percent = 90
    db.commit()

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    assert result["members"][0]["artifact_state"] == "invalid"
    assert "score_total_mismatch" in result["comparability"]["reasons"]
    assert result["members"][0]["screening"]["ai"]["match_percent"] == 90
    assert result["members"][1]["screening"]["ai"]["match_percent"] == 90
    assert len(result["aligned_dimensions"]) == 2
    assert result["comparability"]["level"] == "incompatible"
    assert result["comparability"]["score_deltas_allowed"] is False
    assert result["comparability"]["ranking_allowed"] is False
    assert all(
        value["is_highest"] is False
        for dimension in result["aligned_dimensions"]
        for value in dimension["values"]
    )


def test_comparison_uses_candidate_business_display_status():
    db = _build_test_db()
    position = _add_position(db)
    first, _ = _add_strict_candidate(db, position, index=1, engineering_score=8, delivery_score=2)
    second, _ = _add_strict_candidate(db, position, index=2, engineering_score=7, delivery_score=2)
    first.status = "unmatched"
    first.talent_pool_reason = "auto_archived"
    db.commit()

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    assert result["members"][0]["candidate"]["status"] == "unmatched"
    assert result["members"][0]["candidate"]["display_status"] == "talent_pool"


def test_windowed_root_history_keeps_latest_exact_task_strict():
    db = _build_test_db()
    position = _add_position(db)
    first, first_task = _add_strict_candidate(db, position, index=1, engineering_score=8, delivery_score=2)
    second, _ = _add_strict_candidate(db, position, index=2, engineering_score=7, delivery_score=2)
    for index in range(20):
        db.add(
            RecruitmentAITaskLog(
                task_type="screening_flow",
                org_code=position.org_code,
                screening_run_id=f"old-{index}",
                related_position_id=position.id,
                related_candidate_id=first.id,
                related_resume_file_id=first.latest_resume_file_id,
                status="failed",
                created_by="owner-a",
                created_at=datetime(2000, 1, 1),
            )
        )
    db.commit()
    db.refresh(first_task)

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    assert result["members"][0]["artifact_state"] == "strict"
    assert result["comparability"]["level"] == "strict"


def test_candidate_update_route_preserves_zero_and_explicit_null_only_for_manual_fields():
    class CaptureService:
        def __init__(self):
            self.payloads = []

        def update_candidate(self, candidate_id, payload, actor_id):
            self.payloads.append((candidate_id, payload, actor_id))
            return {"id": candidate_id}

    service = CaptureService()
    asyncio.run(
        recruitment_router.update_candidate(
            1,
            CandidateUpdateRequest(manual_override_score=0),
            _session={"id": "actor"},
            service=service,
        )
    )
    asyncio.run(
        recruitment_router.update_candidate(
            1,
            CandidateUpdateRequest(manual_override_score=None, manual_override_reason=None),
            _session={"id": "actor"},
            service=service,
        )
    )
    asyncio.run(
        recruitment_router.update_candidate(
            1,
            CandidateUpdateRequest(current_company=None),
            _session={"id": "actor"},
            service=service,
        )
    )

    assert service.payloads[0][1] == {"manual_override_score": 0.0}
    assert service.payloads[1][1] == {
        "manual_override_score": None,
        "manual_override_reason": None,
    }
    assert service.payloads[2][1] == {}


def test_service_can_clear_manual_override_with_explicit_null():
    db = _build_test_db()
    position = _add_position(db)
    candidate, _ = _add_strict_candidate(db, position, index=1, engineering_score=8, delivery_score=2)
    score = db.query(RecruitmentCandidateScore).filter(
        RecruitmentCandidateScore.id == candidate.latest_score_id
    ).one()
    score.manual_override_score = 88
    score.manual_override_reason = "manual"
    db.commit()

    RecruitmentService(db).update_candidate(
        candidate.id,
        {"manual_override_score": None, "manual_override_reason": None},
        "actor",
    )

    db.refresh(score)
    assert score.manual_override_score is None
    assert score.manual_override_reason is None


def test_partial_manual_override_disables_ranking_and_highest_markers():
    db = _build_test_db()
    position = _add_position(db)
    first, _ = _add_strict_candidate(db, position, index=1, engineering_score=8, delivery_score=2)
    second, _ = _add_strict_candidate(db, position, index=2, engineering_score=7, delivery_score=2)
    score = db.query(RecruitmentCandidateScore).filter(
        RecruitmentCandidateScore.id == first.latest_score_id
    ).one()
    score.manual_override_score = 90
    db.commit()

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    assert result["manual_override_mode"] == "partial"
    assert result["comparability"]["level"] == "strict"
    assert result["comparability"]["score_deltas_allowed"] is True
    assert result["comparability"]["ranking_allowed"] is False
    assert "manual_override_mixed" in result["comparability"]["reasons"]
    assert all(
        value["is_highest"] is False
        for dimension in result["aligned_dimensions"]
        for value in dimension["values"]
    )


def test_dimension_rule_total_max_must_equal_declared_score_scale():
    dimensions, valid = RecruitmentService(None)._build_candidate_comparison_dimensions(
        score_payload={
            "total_score": 8,
            "total_score_scale": 10,
            "match_percent": 53,
            "dimensions": [
                {"label": "Engineering", "score": 6, "max_score": 10, "reason": "r", "evidence": []},
                {"label": "Delivery", "score": 2, "max_score": 5, "reason": "r", "evidence": []},
            ],
        },
        protocol={
            "hash": "protocol:test",
            "request_scope": "screening_score_only",
            "score_rule_snapshot": [
                {"label": "Engineering", "max_score": 10, "is_core": True},
                {"label": "Delivery", "max_score": 5, "is_core": False},
            ],
        },
    )

    assert valid is False
    assert dimensions == []


def test_conflicting_result_provenance_is_invalid_and_hides_whole_group_scores():
    db = _build_test_db()
    position = _add_position(db)
    first, first_task = _add_strict_candidate(db, position, index=1, engineering_score=8, delivery_score=2)
    second, _ = _add_strict_candidate(db, position, index=2, engineering_score=7, delivery_score=2)
    validation_meta = json.loads(first_task.validation_meta_json)
    validation_meta["final_response_source"] = "primary_score_model"
    first_task.validation_meta_json = json.dumps(validation_meta)
    db.commit()

    result = RecruitmentService(db).preview_candidate_comparison([first.id, second.id], position.id)

    assert result["members"][0]["artifact_state"] == "invalid"
    assert result["comparability"]["level"] == "incompatible"
    assert all(member["screening"] is None for member in result["members"])
