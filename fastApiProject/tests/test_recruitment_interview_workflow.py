from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.recruitment_models import (
    RecruitmentCandidate,
    RecruitmentCandidateStatusHistory,
    RecruitmentFollowUp,
    RecruitmentInterviewAvailabilitySlot,
    RecruitmentInterviewResult,
    RecruitmentInterviewSchedule,
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


def _add_candidate(db, *, code: str = "C-INT-1", status: str = "department_review_passed") -> RecruitmentCandidate:
    candidate = RecruitmentCandidate(
        candidate_code=code,
        org_code="group",
        position_id=101,
        name="面试候选人",
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


def _seed_interviewers(db, *user_codes: str):
    permission = ScriptHubPermission(
        permission_key="recruitment-interview-act",
        name="面试处理",
        category="recruitment",
        description="可处理面试任务",
        sort_order=219,
        is_active=True,
    )
    role = ScriptHubRole(
        role_code="recruitment-interviewer",
        name="面试官",
        description="处理候选人面试",
        sort_order=36,
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


def test_interviewer_availability_rejects_overlapping_slots():
    db = _build_test_db()
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)

    with pytest.raises(ValueError, match="不能互相重叠"):
        service.replace_my_interview_availability(
            {
                "range_start": (start - timedelta(hours=1)).isoformat(),
                "range_end": (start + timedelta(days=1)).isoformat(),
                "slots": [
                    {"start_at": start.isoformat(), "end_at": (start + timedelta(hours=2)).isoformat()},
                    {"start_at": (start + timedelta(hours=1)).isoformat(), "end_at": (start + timedelta(hours=3)).isoformat()},
                ],
            },
            "interviewer-a",
        )


def test_create_interview_schedule_books_availability_and_updates_candidate():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)
    availability = service.replace_my_interview_availability(
        {
            "range_start": (start - timedelta(hours=1)).isoformat(),
            "range_end": (start + timedelta(days=1)).isoformat(),
            "slots": [{"start_at": start.isoformat(), "end_at": (start + timedelta(hours=2)).isoformat()}],
        },
        "interviewer-a",
    )
    slot_id = availability["items"][0]["id"]

    schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "初试",
            "round_index": 1,
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": start.isoformat(),
            "duration_minutes": 60,
            "availability_slot_id": slot_id,
        },
        "hr",
    )

    db.refresh(candidate)
    slot = db.query(RecruitmentInterviewAvailabilitySlot).filter_by(id=slot_id).one()
    follow_up = db.query(RecruitmentFollowUp).filter_by(candidate_id=candidate.id, follow_up_type="interview_notification").one()
    assert schedule["status"] == "scheduled"
    assert schedule["notification_status"] == "sent"
    assert candidate.status == "pending_interview"
    assert slot.status == "booked"
    assert slot.schedule_id == schedule["id"]
    assert "已同步面试安排" in follow_up.content

    with pytest.raises(ValueError, match="已有面试安排"):
        service.create_interview_schedule(
            {
                "candidate_id": candidate.id,
                "round_name": "复试",
                "interviewer_user_code": "interviewer-a",
                "scheduled_at": (start + timedelta(minutes=30)).isoformat(),
                "duration_minutes": 60,
            },
            "hr",
        )


def test_create_interview_schedule_requires_interviewer_and_time():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)

    with pytest.raises(ValueError, match="请选择面试官"):
        service.create_interview_schedule(
            {
                "candidate_id": candidate.id,
                "round_name": "初试",
                "scheduled_at": (datetime.now().replace(microsecond=0) + timedelta(days=1)).isoformat(),
                "duration_minutes": 60,
            },
            "hr",
        )

    with pytest.raises(ValueError, match="请选择面试时间"):
        service.create_interview_schedule(
            {
                "candidate_id": candidate.id,
                "round_name": "初试",
                "interviewer_user_code": "interviewer-a",
                "duration_minutes": 60,
            },
            "hr",
        )


def test_list_interview_tasks_includes_candidates_waiting_for_schedule():
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-WAIT-SCHEDULE", status="department_review_passed")
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)

    todo_tasks = service.list_interview_tasks(status="todo")
    today_tasks = service.list_interview_tasks(status="today")

    assert todo_tasks["counts"]["todo"] == 1
    assert today_tasks["counts"]["todo"] == 1
    assert todo_tasks["total"] == 1
    assert todo_tasks["items"][0]["task_type"] == "needs_scheduling"
    assert todo_tasks["items"][0]["schedule"] is None
    assert todo_tasks["items"][0]["candidate"]["id"] == candidate.id

    service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "初试",
            "round_index": 1,
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": (datetime.now().replace(microsecond=0) + timedelta(days=1)).isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )

    refreshed_tasks = service.list_interview_tasks(status="todo")
    assert refreshed_tasks["counts"]["todo"] == 1
    assert refreshed_tasks["total"] == 1
    assert refreshed_tasks["items"][0]["task_type"] == "scheduled"


def test_scheduled_interview_is_visible_to_assigned_interviewer():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_interviewers(db, "interviewer-a", "interviewer-b")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)

    schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "初试",
            "round_index": 1,
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": start.isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )

    interviewer_tasks = service.list_my_interview_tasks("interviewer-a", status="todo")
    other_interviewer_tasks = service.list_my_interview_tasks("interviewer-b", status="todo")

    assert interviewer_tasks["total"] == 1
    assert interviewer_tasks["items"][0]["schedule"]["id"] == schedule["id"]
    assert interviewer_tasks["items"][0]["schedule"]["notification_status"] == "sent"
    assert other_interviewer_tasks["total"] == 0
    assert service.get_interview_candidate_detail(candidate.id, "interviewer-a")["candidate"]["id"] == candidate.id
    with pytest.raises(ValueError, match="只能查看分配给自己的面试候选人"):
        service.get_interview_candidate_detail(candidate.id, "interviewer-b")


def test_update_interview_schedule_reassigns_interviewer_and_notifies():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_interviewers(db, "interviewer-a", "interviewer-b")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)
    slot_a = service.replace_my_interview_availability(
        {
            "range_start": (start - timedelta(hours=1)).isoformat(),
            "range_end": (start + timedelta(days=2)).isoformat(),
            "slots": [{"start_at": start.isoformat(), "end_at": (start + timedelta(hours=1)).isoformat()}],
        },
        "interviewer-a",
    )["items"][0]
    slot_b = service.replace_my_interview_availability(
        {
            "range_start": (start - timedelta(hours=1)).isoformat(),
            "range_end": (start + timedelta(days=2)).isoformat(),
            "slots": [{"start_at": (start + timedelta(hours=2)).isoformat(), "end_at": (start + timedelta(hours=3)).isoformat()}],
        },
        "interviewer-b",
    )["items"][0]
    schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "初试",
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": start.isoformat(),
            "duration_minutes": 60,
            "availability_slot_id": slot_a["id"],
        },
        "hr",
    )

    updated = service.update_interview_schedule(
        schedule["id"],
        {
            "interviewer_user_code": "interviewer-b",
            "scheduled_at": (start + timedelta(hours=2)).isoformat(),
            "duration_minutes": 60,
            "availability_slot_id": slot_b["id"],
        },
        "hr",
    )

    old_slot = db.query(RecruitmentInterviewAvailabilitySlot).filter_by(id=slot_a["id"]).one()
    new_slot = db.query(RecruitmentInterviewAvailabilitySlot).filter_by(id=slot_b["id"]).one()
    follow_up_count = db.query(RecruitmentFollowUp).filter_by(candidate_id=candidate.id, follow_up_type="interview_notification").count()
    assert updated["interviewer_user_code"] == "interviewer-b"
    assert old_slot.status == "available"
    assert old_slot.schedule_id is None
    assert new_slot.status == "booked"
    assert new_slot.schedule_id == schedule["id"]
    assert follow_up_count == 2
    assert service.list_my_interview_tasks("interviewer-a", status="todo")["total"] == 0
    assert service.list_my_interview_tasks("interviewer-b", status="todo")["total"] == 1


def test_no_show_interview_counts_as_completed_not_cancelled():
    db = _build_test_db()
    candidate = _add_candidate(db, status="pending_interview")
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)
    schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "初试",
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": start.isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )

    service.submit_interview_schedule_result(
        schedule["id"],
        {"result_status": "no_show", "result_comment": "候选人未到场"},
        "interviewer-a",
    )

    completed = service.list_my_interview_tasks("interviewer-a", status="completed")
    cancelled = service.list_my_interview_tasks("interviewer-a", status="cancelled")
    assert completed["counts"]["completed"] == 1
    assert completed["counts"]["cancelled"] == 0
    assert completed["total"] == 1
    assert completed["items"][0]["schedule"]["status"] == "no_show"
    assert cancelled["total"] == 0


def test_submit_interview_result_writes_result_and_candidate_status():
    db = _build_test_db()
    candidate = _add_candidate(db, status="pending_interview")
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)
    schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "初试",
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": start.isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )

    result = service.submit_interview_schedule_result(
        schedule["id"],
        {"result_status": "next_round", "result_comment": "基础扎实，建议复试", "next_round_name": "复试"},
        "interviewer-a",
    )

    db.refresh(candidate)
    schedule_row = db.query(RecruitmentInterviewSchedule).filter_by(id=schedule["id"]).one()
    result_row = db.query(RecruitmentInterviewResult).filter_by(candidate_id=candidate.id).one()
    history_rows = (
        db.query(RecruitmentCandidateStatusHistory)
        .filter_by(candidate_id=candidate.id)
        .order_by(RecruitmentCandidateStatusHistory.id.asc())
        .all()
    )
    assert result["schedule"]["result_status"] == "next_round"
    assert schedule_row.status == "completed"
    assert schedule_row.result_comment == "基础扎实，建议复试"
    assert result_row.final_recommendation == "next_round"
    assert candidate.status == "pending_interview"
    assert history_rows[-1].reason == "初试通过，待安排复试"
