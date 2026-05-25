from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.recruitment_models import (
    RecruitmentAITaskLog,
    RecruitmentCandidate,
    RecruitmentCandidateStatusHistory,
)
from app.services.recruitment_service_impl import RecruitmentService


def _build_test_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    return testing_session_local()


def _add_candidate(db, *, code: str, name: str, status: str, position_id: int | None = None) -> RecruitmentCandidate:
    candidate = RecruitmentCandidate(
        candidate_code=code,
        org_code="group",
        position_id=position_id,
        name=name,
        source="manual_upload",
        status=status,
        created_by="tester",
        updated_by="tester",
        deleted=False,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


def _status_history_rows(db, candidate_id: int):
    return (
        db.query(RecruitmentCandidateStatusHistory)
        .filter(RecruitmentCandidateStatusHistory.candidate_id == candidate_id)
        .order_by(RecruitmentCandidateStatusHistory.id.asc())
        .all()
    )


def test_update_candidate_status_persists_pass_and_history():
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-PASS", name="通过候选人", status="pending_screening")
    service = RecruitmentService(db)

    result = service.update_candidate_status(candidate.id, "screening_passed", "人工通过", "hr-user")

    db.refresh(candidate)
    history_rows = _status_history_rows(db, candidate.id)
    assert result["status"] == "screening_passed"
    assert candidate.status == "screening_passed"
    assert candidate.updated_by == "hr-user"
    assert candidate.talent_pool_reason is None
    assert len(history_rows) == 1
    assert history_rows[0].from_status == "pending_screening"
    assert history_rows[0].to_status == "screening_passed"
    assert history_rows[0].reason == "人工通过"
    assert history_rows[0].changed_by == "hr-user"


def test_batch_update_status_to_talent_pool_marks_pool_metadata_and_history():
    db = _build_test_db()
    first = _add_candidate(db, code="C-POOL-1", name="人才库候选人一", status="screening_passed")
    second = _add_candidate(db, code="C-POOL-2", name="人才库候选人二", status="screening_rejected")
    service = RecruitmentService(db)

    result = service.batch_update_candidates_status(
        [first.id, second.id],
        "talent_pool",
        "批量归入",
        "hr-user",
    )

    assert result["updated_count"] == 2
    for candidate, source_status in ((first, "screening_passed"), (second, "screening_rejected")):
        db.refresh(candidate)
        history_rows = _status_history_rows(db, candidate.id)
        assert candidate.status == "talent_pool"
        assert candidate.talent_pool_reason == "moved_by_hr"
        assert candidate.talent_pool_source_status == source_status
        assert candidate.talent_pool_moved_by == "hr-user"
        assert candidate.talent_pool_moved_at is not None
        assert len(history_rows) == 1
        assert history_rows[0].from_status == source_status
        assert history_rows[0].to_status == "talent_pool"
        assert history_rows[0].reason == "批量归入"


def test_batch_update_status_persists_reject_and_history():
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-REJECT", name="淘汰候选人", status="screening_passed")
    service = RecruitmentService(db)

    result = service.batch_update_candidates_status(
        [candidate.id],
        "screening_rejected",
        "批量淘汰",
        "hr-user",
    )

    db.refresh(candidate)
    history_rows = _status_history_rows(db, candidate.id)
    assert result["updated_count"] == 1
    assert candidate.status == "screening_rejected"
    assert candidate.updated_by == "hr-user"
    assert candidate.talent_pool_reason is None
    assert len(history_rows) == 1
    assert history_rows[0].from_status == "screening_passed"
    assert history_rows[0].to_status == "screening_rejected"
    assert history_rows[0].reason == "批量淘汰"


def test_move_to_talent_pool_uses_status_transition_history_and_audit_log():
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-MOVE", name="移入候选人", status="pending_interview")
    service = RecruitmentService(db)

    service.move_to_talent_pool(candidate.id, "hr-user")

    db.refresh(candidate)
    history_rows = _status_history_rows(db, candidate.id)
    log_row = db.query(RecruitmentAITaskLog).filter(
        RecruitmentAITaskLog.related_candidate_id == candidate.id,
        RecruitmentAITaskLog.task_type == "move_to_talent_pool",
    ).first()
    assert candidate.status == "talent_pool"
    assert candidate.talent_pool_reason == "moved_by_hr"
    assert candidate.talent_pool_source_status == "pending_interview"
    assert candidate.talent_pool_moved_by == "hr-user"
    assert len(history_rows) == 1
    assert history_rows[0].from_status == "pending_interview"
    assert history_rows[0].to_status == "talent_pool"
    assert history_rows[0].reason == "人工归入人才库"
    assert log_row is not None
    assert "pending_interview" in log_row.output_summary


def test_batch_move_to_talent_pool_uses_status_transition_history():
    db = _build_test_db()
    first = _add_candidate(db, code="C-BATCH-MOVE-1", name="批量入库一", status="pending_interview")
    second = _add_candidate(db, code="C-BATCH-MOVE-2", name="批量入库二", status="screening_passed")
    service = RecruitmentService(db)

    result = service.batch_move_to_talent_pool([first.id, second.id], "hr-user")

    assert result["moved_count"] == 2
    for candidate, source_status in ((first, "pending_interview"), (second, "screening_passed")):
        db.refresh(candidate)
        history_rows = _status_history_rows(db, candidate.id)
        assert candidate.status == "talent_pool"
        assert candidate.talent_pool_reason == "moved_by_hr"
        assert candidate.talent_pool_source_status == source_status
        assert candidate.talent_pool_moved_by == "hr-user"
        assert len(history_rows) == 1
        assert history_rows[0].from_status == source_status
        assert history_rows[0].to_status == "talent_pool"
        assert history_rows[0].reason == "人工归入人才库"


def test_position_candidate_compact_item_displays_auto_archived_talent_pool_status():
    db = _build_test_db()
    candidate = _add_candidate(
        db,
        code="C-AUTO-POOL",
        name="自动入库候选人",
        status="unmatched",
        position_id=1001,
    )
    candidate.talent_pool_reason = "auto_archived"
    candidate.talent_pool_source_status = "screening_passed"
    db.add(candidate)
    db.commit()

    service = RecruitmentService(db)
    result = service.list_candidates(position_id=1001, compact=True)

    assert result["total"] == 1
    assert result["items"][0]["display_status"] == "talent_pool"
    assert result["items"][0]["talent_pool_reason"] == "auto_archived"
