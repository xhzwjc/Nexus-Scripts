import json
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.recruitment_models import (
    RecruitmentCandidate,
    RecruitmentCandidateScore,
    RecruitmentCandidateStatusHistory,
    RecruitmentFollowUp,
    RecruitmentInterviewAvailabilitySlot,
    RecruitmentInterviewResult,
    RecruitmentInterviewSchedule,
    RecruitmentResumeFile,
    RecruitmentResumeParseResult,
)
from app.rbac_models import (
    ScriptHubPermission,
    ScriptHubRole,
    ScriptHubRolePermission,
    ScriptHubUser,
    ScriptHubUserRole,
)
from app.services.recruitment_service_impl import RecruitmentService
from app.services.task_event_bus import TaskEventBus


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


def _add_candidate_detail_artifacts(db, candidate: RecruitmentCandidate, tmp_path):
    resume_path = tmp_path / f"{candidate.candidate_code}.pdf"
    resume_path.write_bytes(b"resume-bytes")
    resume_file = RecruitmentResumeFile(
        candidate_id=candidate.id,
        org_code=candidate.org_code,
        original_name=resume_path.name,
        stored_name=resume_path.name,
        file_ext=".pdf",
        mime_type="application/pdf",
        file_size=len(b"resume-bytes"),
        storage_path=str(resume_path),
        parse_status="success",
        uploaded_by="hr",
    )
    db.add(resume_file)
    db.flush()
    parse_row = RecruitmentResumeParseResult(
        candidate_id=candidate.id,
        resume_file_id=resume_file.id,
        org_code=candidate.org_code,
        raw_text="候选人原文",
        basic_info_json=json.dumps({"name": candidate.name}, ensure_ascii=False),
        summary_text="标准简历摘要",
        status="success",
    )
    db.add(parse_row)
    db.flush()
    score_row = RecruitmentCandidateScore(
        candidate_id=candidate.id,
        parse_result_id=parse_row.id,
        org_code=candidate.org_code,
        score_json=json.dumps({"dimensions": []}, ensure_ascii=False),
        total_score=88,
        match_percent=88,
        recommendation="建议面试",
        suggested_status="screening_passed",
    )
    db.add(score_row)
    db.flush()
    candidate.latest_resume_file_id = resume_file.id
    candidate.latest_parse_result_id = parse_row.id
    candidate.latest_score_id = score_row.id
    candidate.latest_total_score = score_row.total_score
    candidate.match_percent = score_row.match_percent
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return resume_file, parse_row, score_row


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


def test_interviewer_availability_saves_unavailable_slots():
    db = _build_test_db()
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)

    result = service.replace_my_interview_availability(
        {
            "range_start": (start - timedelta(hours=1)).isoformat(),
            "range_end": (start + timedelta(days=1)).isoformat(),
            "slots": [
                {
                    "start_at": start.isoformat(),
                    "end_at": (start + timedelta(hours=1)).isoformat(),
                    "status": "available",
                },
                {
                    "start_at": (start + timedelta(hours=2)).isoformat(),
                    "end_at": (start + timedelta(hours=3)).isoformat(),
                    "status": "unavailable",
                    "notes": "内部会议",
                },
            ],
        },
        "interviewer-a",
    )

    slots_by_status = {slot["status"]: slot for slot in result["items"]}
    assert set(slots_by_status) == {"available", "unavailable"}
    assert slots_by_status["unavailable"]["notes"] == "内部会议"


def test_create_interview_schedule_rejects_unavailable_time():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)

    service.replace_my_interview_availability(
        {
            "range_start": (start - timedelta(hours=1)).isoformat(),
            "range_end": (start + timedelta(days=1)).isoformat(),
            "slots": [
                {
                    "start_at": start.isoformat(),
                    "end_at": (start + timedelta(hours=2)).isoformat(),
                    "status": "unavailable",
                }
            ],
        },
        "interviewer-a",
    )

    with pytest.raises(ValueError, match="不可面试时间冲突"):
        service.create_interview_schedule(
            {
                "candidate_id": candidate.id,
                "round_name": "初试",
                "interviewer_user_code": "interviewer-a",
                "scheduled_at": (start + timedelta(minutes=30)).isoformat(),
                "duration_minutes": 60,
            },
            "hr",
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


def test_create_interview_schedule_saves_subject_method_and_visible_sections():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)

    schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "subject": "周思霖的视频面试",
            "round_name": "复试",
            "round_index": 2,
            "interview_method": "video",
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": start.isoformat(),
            "duration_minutes": 60,
            "video_tool": "腾讯会议",
            "meeting_link": "https://meeting.example.com/abc",
            "visible_sections": ["standard_resume", "screening_result"],
        },
        "hr",
    )

    row = db.query(RecruitmentInterviewSchedule).filter_by(id=schedule["id"]).one()
    assert schedule["subject"] == "周思霖的视频面试"
    assert schedule["round_name"] == "复试"
    assert schedule["round_index"] == 2
    assert schedule["interview_method"] == "video"
    assert schedule["video_tool"] == "腾讯会议"
    assert schedule["meeting_link"] == "https://meeting.example.com/abc"
    assert schedule["visible_sections"] == ["standard_resume", "screening_result"]
    assert json.loads(row.visible_sections_json) == ["standard_resume", "screening_result"]


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
    assert todo_tasks["items"][0]["next_round_index"] == 1
    assert todo_tasks["items"][0]["next_round_name"] == "初试"

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
    assert service.get_interview_candidate_detail(candidate.id, "interviewer-a", schedule["id"])["candidate"]["id"] == candidate.id
    with pytest.raises(ValueError, match="必须指定当前面试任务"):
        service.get_interview_candidate_detail(candidate.id, "interviewer-a")
    with pytest.raises(ValueError, match="只能查看分配给自己的当前面试任务"):
        service.get_interview_candidate_detail(candidate.id, "interviewer-b", schedule["id"])


def test_interview_candidate_detail_uses_schedule_visible_sections(tmp_path):
    db = _build_test_db()
    candidate = _add_candidate(db)
    resume_file, parse_row, _score_row = _add_candidate_detail_artifacts(db, candidate, tmp_path)
    _seed_interviewers(db, "interviewer-a", "interviewer-b")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)
    schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "初试",
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": start.isoformat(),
            "duration_minutes": 60,
            "visible_sections": ["standard_resume"],
        },
        "hr",
    )
    other_schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "复试",
            "round_index": 2,
            "interviewer_user_code": "interviewer-b",
            "scheduled_at": (start + timedelta(hours=2)).isoformat(),
            "duration_minutes": 60,
            "visible_sections": ["original_resume", "assessment_result"],
        },
        "hr",
    )

    detail = service.get_interview_candidate_detail(candidate.id, "interviewer-a", schedule["id"])

    assert detail["interview_context"]["schedule"]["id"] == schedule["id"]
    assert detail["interview_context"]["schedule"]["visible_sections"] == ["standard_resume"]
    assert detail["candidate"]["latest_resume_file_id"] is None
    assert detail["resume_files"] == []
    assert detail["parse_result"]["id"] == parse_row.id
    assert detail["score"] is None
    assert detail["screening"]["score"] is None
    with pytest.raises(ValueError, match="当前面试安排未开放原始简历查看"):
        service.get_interview_resume_file_download(resume_file.id, "interviewer-a", schedule["id"])
    with pytest.raises(ValueError, match="当前面试任务"):
        service.get_interview_candidate_detail(candidate.id, "interviewer-a", other_schedule["id"])

    with pytest.raises(ValueError, match="必须指定当前面试任务"):
        service.get_interview_resume_file_download(resume_file.id, "interviewer-a")

    scoped_schedules = service.list_interview_schedules(
        candidate.id,
        actor_id="interviewer-a",
        schedule_id=schedule["id"],
    )
    assert [item["id"] for item in scoped_schedules] == [schedule["id"]]
    with pytest.raises(ValueError, match="必须指定当前面试任务"):
        service.list_interview_schedules(candidate.id, actor_id="interviewer-a")
    with pytest.raises(ValueError, match="当前面试任务"):
        service.list_interview_schedules(
            candidate.id,
            actor_id="interviewer-a",
            schedule_id=other_schedule["id"],
        )

    manager_detail = service.get_interview_candidate_detail(
        candidate.id,
        "interview-manager",
        can_manage=True,
    )
    assert manager_detail["candidate"]["latest_resume_file_id"] == resume_file.id
    assert manager_detail["resume_files"][0]["id"] == resume_file.id
    assert manager_detail["score"] is not None
    assert service.get_interview_resume_file_download(
        resume_file.id,
        "interview-manager",
        can_manage=True,
    )["content"] == b"resume-bytes"
    assert {item["id"] for item in service.list_interview_schedules(candidate.id)} == {
        schedule["id"],
        other_schedule["id"],
    }


def test_update_interview_schedule_reassigns_interviewer_and_notifies(monkeypatch):
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_interviewers(db, "interviewer-a", "interviewer-b")
    service = RecruitmentService(db)
    emitted_events = []
    monkeypatch.setattr(
        TaskEventBus,
        "emit_to_all",
        classmethod(lambda _cls, event_type, payload: emitted_events.append((event_type, payload))),
    )
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
    emitted_events.clear()

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
    assert len(emitted_events) == 1
    event_type, event_payload = emitted_events[0]
    assert event_type == "candidate_updated"
    assert event_payload["interviewer_user_code"] == "interviewer-b"
    assert event_payload["previous_interviewer_user_code"] == "interviewer-a"
    assert event_payload["assignment_changed"] is True


def test_self_scope_interviewer_uses_assignment_not_creator_ownership(tmp_path):
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-SELF-ASSIGNED", status="pending_interview")
    resume_file, _, _ = _add_candidate_detail_artifacts(db, candidate, tmp_path)
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    schedule = service.create_interview_schedule(
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
    interviewer_service = RecruitmentService(db).set_permission_context({
        "id": "interviewer-a",
        "primaryOrgCode": "group",
        "dataScope": "SELF",
        "permissions": {"recruitment-interview-act": True},
    })

    tasks = interviewer_service.list_my_interview_tasks("interviewer-a", status="todo")
    detail = interviewer_service.get_interview_candidate_detail(
        candidate.id,
        "interviewer-a",
        schedule_id=schedule["id"],
    )
    download = interviewer_service.get_interview_resume_file_download(
        resume_file.id,
        "interviewer-a",
        schedule_id=schedule["id"],
    )

    assert tasks["total"] == 1
    assert tasks["counts"]["todo"] == 1
    assert detail["candidate"]["id"] == candidate.id
    assert download["content"] == b"resume-bytes"

    self_manager_service = RecruitmentService(db).set_permission_context({
        "id": "manager-a",
        "primaryOrgCode": "group",
        "dataScope": "SELF",
        "permissions": {"recruitment-interview-manage": True},
    })
    with pytest.raises(ValueError, match="仅能访问自己创建的数据"):
        self_manager_service.get_interview_candidate_detail(candidate.id, "manager-a", can_manage=True)


def test_delete_interview_schedule_event_keeps_scope_metadata(monkeypatch):
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)
    emitted_events = []
    monkeypatch.setattr(
        TaskEventBus,
        "emit_to_all",
        classmethod(lambda _cls, event_type, payload: emitted_events.append((event_type, payload))),
    )
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
    emitted_events.clear()

    service.delete_interview_schedule(schedule["id"], "hr")

    assert len(emitted_events) == 1
    event_type, payload = emitted_events[0]
    assert event_type == "candidate_updated"
    assert payload["task_type"] == "interview_schedule"
    assert payload["org_code"] == candidate.org_code
    assert payload["interviewer_user_code"] == "interviewer-a"
    assert payload["schedule_status"] == "deleted"
    assert payload["candidate_snapshot"]["id"] == candidate.id


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

    todo_tasks = service.list_interview_tasks(status="todo")
    assert todo_tasks["total"] == 1
    assert todo_tasks["items"][0]["task_type"] == "needs_scheduling"
    assert todo_tasks["items"][0]["next_round_index"] == 2
    assert todo_tasks["items"][0]["next_round_name"] == "复试"
    assert todo_tasks["items"][0]["last_completed_schedule"]["id"] == schedule["id"]


def test_submit_interview_result_rejects_repeat_submission_without_duplicate_history():
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-RESULT-ONCE", status="pending_interview")
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    schedule = service.create_interview_schedule(
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

    service.submit_interview_schedule_result(
        schedule["id"],
        {"result_status": "passed", "result_comment": "通过"},
        "interviewer-a",
    )

    with pytest.raises(ValueError, match="不能重复提交"):
        service.submit_interview_schedule_result(
            schedule["id"],
            {"result_status": "rejected", "result_comment": "重复请求"},
            "interviewer-a",
        )

    assert db.query(RecruitmentInterviewResult).filter_by(candidate_id=candidate.id).count() == 1
    db.refresh(candidate)
    assert candidate.status == "interview_passed"


def test_submit_interview_result_rejects_cancelled_schedule_and_final_round_next_round():
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-RESULT-CLOSED", status="pending_interview")
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)
    cancelled_schedule = service.create_interview_schedule(
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
    service.update_interview_schedule(cancelled_schedule["id"], {"status": "cancelled"}, "hr")

    with pytest.raises(ValueError, match="已结束或已取消"):
        service.submit_interview_schedule_result(
            cancelled_schedule["id"],
            {"result_status": "passed"},
            "interviewer-a",
        )

    final_schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "终试",
            "round_index": 4,
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": (start + timedelta(days=1)).isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )
    with pytest.raises(ValueError, match="终试不能进入下一轮"):
        service.submit_interview_schedule_result(
            final_schedule["id"],
            {"result_status": "next_round", "next_round_name": "终试"},
            "interviewer-a",
        )

    final_row = db.query(RecruitmentInterviewSchedule).filter_by(id=final_schedule["id"]).one()
    assert final_row.status == "scheduled"
    assert final_row.result_status is None
    assert db.query(RecruitmentInterviewResult).filter_by(candidate_id=candidate.id).count() == 0


def test_candidate_list_exposes_first_and_second_interview_pipeline_statuses():
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-PIPELINE-1", status="department_review_passed")
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)

    assert service.list_candidates(status="interview_first_pending")["total"] == 1
    assert service.get_candidate_stats()["status_counts"]["interview_first_pending"] == 1
    funnel = service.get_recruitment_funnel()
    assert next(item["count"] for item in funnel["stages"] if item["key"] == "interview") == 1

    first_schedule = service.create_interview_schedule(
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
    assert service.list_candidates(status="interview_first_active")["total"] == 1
    assert service.list_candidates(status="interview_first_active")["items"][0]["display_status"] == "interview_first_active"

    service.submit_interview_schedule_result(
        first_schedule["id"],
        {"result_status": "next_round", "result_comment": "进入复试", "next_round_name": "复试"},
        "interviewer-a",
    )
    assert service.list_candidates(status="interview_second_pending")["total"] == 1

    second_schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "复试",
            "round_index": 2,
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": (start + timedelta(days=1)).isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )
    assert service.list_candidates(status="interview_second_active")["total"] == 1

    service.submit_interview_schedule_result(
        second_schedule["id"],
        {"result_status": "rejected", "result_comment": "复试淘汰"},
        "interviewer-a",
    )
    assert service.list_candidates(status="interview_second_rejected")["total"] == 1
    assert service.get_candidate_stats()["status_counts"]["interview_second_rejected"] == 1
    funnel = service.get_recruitment_funnel()
    assert next(item["count"] for item in funnel["stages"] if item["key"] == "interview") == 0
    assert funnel["rejected_count"] == 1


def test_interview_next_round_sequence_enters_extra_then_final_round():
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-ROUND-SEQUENCE", status="pending_interview")
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)

    second_schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "复试",
            "round_index": 2,
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": start.isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )
    service.submit_interview_schedule_result(
        second_schedule["id"],
        {"result_status": "next_round", "result_comment": "建议加试", "next_round_name": "加试"},
        "interviewer-a",
    )
    todo_tasks = service.list_interview_tasks(status="todo")
    assert todo_tasks["items"][0]["next_round_index"] == 3
    assert todo_tasks["items"][0]["next_round_name"] == "加试"

    extra_schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "加试",
            "round_index": 3,
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": (start + timedelta(days=1)).isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )
    service.submit_interview_schedule_result(
        extra_schedule["id"],
        {"result_status": "next_round", "result_comment": "建议终试", "next_round_name": "终试"},
        "interviewer-a",
    )
    todo_tasks = service.list_interview_tasks(status="todo")
    assert todo_tasks["items"][0]["next_round_index"] == 4
    assert todo_tasks["items"][0]["next_round_name"] == "终试"


def test_unscheduled_next_round_context_prefers_highest_completed_round_over_latest_time():
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-ROUND-ORDER", status="pending_interview")
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)

    final_schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "终试",
            "round_index": 4,
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": start.isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )
    service.submit_interview_schedule_result(
        final_schedule["id"],
        {"result_status": "hold", "result_comment": "终试暂缓"},
        "interviewer-a",
    )
    extra_schedule = service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "加试",
            "round_index": 3,
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": (start + timedelta(days=5)).isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )
    service.submit_interview_schedule_result(
        extra_schedule["id"],
        {"result_status": "hold", "result_comment": "乱序补录"},
        "interviewer-a",
    )

    todo_tasks = service.list_interview_tasks(status="todo")
    assert todo_tasks["total"] == 1
    assert todo_tasks["items"][0]["task_type"] == "needs_scheduling"
    assert todo_tasks["items"][0]["last_completed_schedule"]["id"] == final_schedule["id"]
    assert todo_tasks["items"][0]["next_round_index"] == 4
    assert todo_tasks["items"][0]["next_round_name"] == "终试"


def test_active_interview_schedule_does_not_override_closed_candidate_status():
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-CLOSED-WITH-SCHEDULE", status="hired")
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)

    service.create_interview_schedule(
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

    assert service.list_candidates(status="interview_first_active")["total"] == 0
    hired_result = service.list_candidates(status="hired")
    assert hired_result["total"] == 1
    assert hired_result["items"][0]["display_status"] == "hired"
    assert service.get_candidate_stats()["status_counts"]["hired"] == 1


def test_multiple_active_interview_schedules_use_highest_round_for_display_status():
    db = _build_test_db()
    candidate = _add_candidate(db, code="C-MULTI-ACTIVE", status="pending_interview")
    _seed_interviewers(db, "interviewer-a")
    service = RecruitmentService(db)
    start = datetime.now().replace(microsecond=0) + timedelta(days=1)

    service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "初试",
            "round_index": 1,
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": (start + timedelta(days=1)).isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )
    service.create_interview_schedule(
        {
            "candidate_id": candidate.id,
            "round_name": "复试",
            "round_index": 2,
            "interviewer_user_code": "interviewer-a",
            "scheduled_at": start.isoformat(),
            "duration_minutes": 60,
        },
        "hr",
    )

    result = service.list_candidates(status="interview_second_active")
    assert result["total"] == 1
    assert result["items"][0]["display_status"] == "interview_second_active"
    assert service.get_candidate_stats()["status_counts"]["interview_second_active"] == 1
