from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import pytest

from app.database import Base
from app.recruitment_models import (
    RecruitmentCandidate,
    RecruitmentCandidateStatusHistory,
    RecruitmentDepartmentReviewAssignment,
    RecruitmentDepartmentReviewBatch,
)
from app.rbac_models import (
    ScriptHubPermission,
    ScriptHubRole,
    ScriptHubRolePermission,
    ScriptHubUser,
    ScriptHubUserRole,
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


def _add_candidate(db, *, code: str = "C-DEPT-1", status: str = "screening_passed") -> RecruitmentCandidate:
    candidate = RecruitmentCandidate(
        candidate_code=code,
        org_code="group",
        position_id=101,
        name="部门评审候选人",
        source="manual_upload",
        status=status,
        created_by="hr",
        updated_by="hr",
        deleted=False,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


def _seed_reviewers(db, *user_codes: str):
    permission = ScriptHubPermission(
        permission_key="recruitment-review-act",
        name="部门评审处理",
        category="recruitment",
        description="可处理部门评审任务",
        sort_order=216,
        is_active=True,
    )
    role = ScriptHubRole(
        role_code="recruitment-reviewer",
        name="用人部门评审",
        description="处理候选人部门评审",
        sort_order=35,
        is_system=True,
        is_active=True,
        is_deleted=False,
    )
    db.add_all([permission, role])
    db.flush()
    db.add(ScriptHubRolePermission(role_id=role.id, permission_id=permission.id))
    for user_code in user_codes:
        user = ScriptHubUser(
            user_code=user_code,
            display_name=user_code.replace("-", " ").title(),
            access_key_lookup_hash=f"{user_code}-lookup",
            access_key_salt=f"{user_code}-salt",
            access_key_hash=f"{user_code}-hash",
            primary_org_code="group",
            data_scope="ORG_ONLY",
            is_active=True,
            is_deleted=False,
            team_resources_access_enabled=True,
        )
        db.add(user)
        db.flush()
        db.add(ScriptHubUserRole(user_id=user.id, role_id=role.id))
    db.commit()


def _history_rows(db, candidate_id: int):
    return (
        db.query(RecruitmentCandidateStatusHistory)
        .filter(RecruitmentCandidateStatusHistory.candidate_id == candidate_id)
        .order_by(RecruitmentCandidateStatusHistory.id.asc())
        .all()
    )


def test_create_department_review_sets_candidate_pending_and_assignments():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_reviewers(db, "manager-a", "manager-b")
    service = RecruitmentService(db)

    result = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [
                {"user_code": "manager-a", "name": "负责人A"},
                {"user_code": "manager-b", "name": "负责人B"},
            ],
            "visible_sections": ["original_resume", "screening_result"],
            "message": "请评审技术匹配度",
        },
        "hr",
    )

    db.refresh(candidate)
    rows = db.query(RecruitmentDepartmentReviewAssignment).order_by(RecruitmentDepartmentReviewAssignment.id.asc()).all()
    history_rows = _history_rows(db, candidate.id)
    assert result["batch"]["status"] == "pending"
    assert len(result["batch"]["assignments"]) == 2
    assert [row.reviewer_user_code for row in rows] == ["manager-a", "manager-b"]
    assert candidate.status == "department_review_pending"
    assert history_rows[-1].to_status == "department_review_pending"


def test_create_department_review_reuses_active_batch_and_adds_reviewers():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_reviewers(db, "manager-a", "manager-b")
    service = RecruitmentService(db)

    created = service.create_department_review(
        {"candidate_id": candidate.id, "reviewers": [{"user_code": "manager-a"}]},
        "hr",
    )
    reused = service.create_department_review(
        {"candidate_id": candidate.id, "reviewers": [{"user_code": "manager-b"}]},
        "hr",
    )

    db.refresh(candidate)
    batches = db.query(RecruitmentDepartmentReviewBatch).all()
    rows = db.query(RecruitmentDepartmentReviewAssignment).order_by(RecruitmentDepartmentReviewAssignment.id.asc()).all()
    assert len(batches) == 1
    assert reused["batch"]["id"] == created["batch"]["id"]
    assert [row.reviewer_user_code for row in rows] == ["manager-a", "manager-b"]
    assert [row.status for row in rows] == ["pending", "pending"]
    assert len(reused["batch"]["assignments"]) == 2
    assert candidate.status == "department_review_pending"
    assert len(_history_rows(db, candidate.id)) == 1


def test_create_department_review_can_reopen_existing_reviewer_assignment():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_reviewers(db, "manager-a", "manager-b")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}, {"user_code": "manager-b"}],
        },
        "hr",
    )
    first = created["batch"]["assignments"][0]["id"]
    service.decide_department_review_assignment(first, {"status": "passed", "comment": "同意"}, "manager-a")

    service.create_department_review(
        {"candidate_id": candidate.id, "reviewers": [{"user_code": "manager-a"}]},
        "hr",
    )

    row = db.query(RecruitmentDepartmentReviewAssignment).filter(
        RecruitmentDepartmentReviewAssignment.id == first,
    ).one()
    assert row.status == "pending"
    assert row.comment is None
    assert row.decision_at is None


def test_create_department_review_can_replace_unfinished_reviewers_for_transfer():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_reviewers(db, "manager-a", "manager-b")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {"candidate_id": candidate.id, "reviewers": [{"user_code": "manager-a"}]},
        "hr",
    )

    transferred = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-b"}],
            "replace_existing": True,
        },
        "hr",
    )

    rows = db.query(RecruitmentDepartmentReviewAssignment).order_by(RecruitmentDepartmentReviewAssignment.id.asc()).all()
    assert transferred["batch"]["id"] == created["batch"]["id"]
    assert [row.reviewer_user_code for row in rows] == ["manager-b"]
    assert transferred["batch"]["assignments"][0]["reviewer_user_code"] == "manager-b"


def test_department_review_passes_after_all_reviewers_pass():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_reviewers(db, "manager-a", "manager-b")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}, {"user_code": "manager-b"}],
        },
        "hr",
    )
    first, second = [item["id"] for item in created["batch"]["assignments"]]

    first_result = service.decide_department_review_assignment(first, {"status": "passed", "comment": "可进入面试"}, "manager-a")
    db.refresh(candidate)
    assert first_result["batch"]["status"] == "pending"
    assert candidate.status == "department_review_pending"

    second_result = service.decide_department_review_assignment(second, {"status": "passed"}, "manager-b")
    db.refresh(candidate)
    assert second_result["batch"]["status"] == "passed"
    assert candidate.status == "department_review_passed"
    assert _history_rows(db, candidate.id)[-1].to_status == "department_review_passed"


def test_department_review_reject_dominates_and_reviewer_scope_is_enforced():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_reviewers(db, "manager-a", "manager-b")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}, {"user_code": "manager-b"}],
        },
        "hr",
    )
    first = created["batch"]["assignments"][0]["id"]

    with pytest.raises(ValueError):
        service.decide_department_review_assignment(first, {"status": "rejected"}, "manager-b")

    result = service.decide_department_review_assignment(first, {"status": "rejected", "comment": "不匹配"}, "manager-a")
    db.refresh(candidate)
    assert result["batch"]["status"] == "rejected"
    assert candidate.status == "department_review_rejected"


def test_list_my_department_review_tasks_returns_only_assignee_tasks():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_reviewers(db, "manager-a", "manager-b")
    service = RecruitmentService(db)
    service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}, {"user_code": "manager-b"}],
        },
        "hr",
    )

    result = service.list_my_department_review_tasks("manager-a")

    assert result["total"] == 1
    assert result["counts"]["todo"] == 1
    assert result["items"][0]["assignment"]["reviewer_user_code"] == "manager-a"


def test_list_my_department_review_counts_assignment_rows_by_status():
    db = _build_test_db()
    completed_candidate = _add_candidate(db, code="C-DEPT-DONE")
    pending_candidate = _add_candidate(db, code="C-DEPT-PENDING")
    deferred_candidate = _add_candidate(db, code="C-DEPT-DEFER")
    _seed_reviewers(db, "manager-a")
    service = RecruitmentService(db)

    def create_assignment(candidate: RecruitmentCandidate) -> int:
        created = service.create_department_review(
            {"candidate_id": candidate.id, "reviewers": [{"user_code": "manager-a"}]},
            "hr",
        )
        return created["batch"]["assignments"][0]["id"]

    first_completed = create_assignment(completed_candidate)
    service.decide_department_review_assignment(first_completed, {"status": "passed"}, "manager-a")
    second_completed = create_assignment(completed_candidate)
    service.decide_department_review_assignment(second_completed, {"status": "rejected"}, "manager-a")
    create_assignment(pending_candidate)
    deferred_assignment = create_assignment(deferred_candidate)
    service.decide_department_review_assignment(deferred_assignment, {"status": "deferred"}, "manager-a")

    result = service.list_my_department_review_tasks("manager-a")

    assert result["total"] == 4
    assert result["counts"] == {
        "pending": 1,
        "deferred": 1,
        "completed": 2,
        "todo": 2,
    }


def test_list_department_reviewers_only_returns_users_with_review_permission():
    db = _build_test_db()
    _seed_reviewers(db, "manager-a")
    db.add(
        ScriptHubUser(
            user_code="plain-user",
            display_name="Plain User",
            access_key_lookup_hash="plain-lookup",
            access_key_salt="plain-salt",
            access_key_hash="plain-hash",
            primary_org_code="group",
            data_scope="ORG_ONLY",
            is_active=True,
            is_deleted=False,
            team_resources_access_enabled=True,
        )
    )
    db.commit()
    service = RecruitmentService(db)

    result = service.list_department_reviewers(org_code="group")

    assert [item["user_code"] for item in result] == ["manager-a"]
