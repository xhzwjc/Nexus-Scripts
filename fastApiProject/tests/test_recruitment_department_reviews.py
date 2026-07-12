import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import pytest

from app.database import Base
from app.permission_governance import DATA_SCOPE_SELF, PermissionContext
from app.recruitment_models import (
    RecruitmentCandidate,
    RecruitmentCandidateStatusHistory,
    RecruitmentCandidateScore,
    RecruitmentCandidateWorkflowMemory,
    RecruitmentAITaskLog,
    RecruitmentDepartmentReviewAssignment,
    RecruitmentDepartmentReviewBatch,
    RecruitmentInterviewQuestion,
    RecruitmentInterviewSchedule,
    RecruitmentResumeParseResult,
    RecruitmentResumeFile,
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


def _add_resume_file(db, candidate: RecruitmentCandidate, tmp_path, *, name: str = "resume.pdf") -> RecruitmentResumeFile:
    storage_path = tmp_path / f"{candidate.candidate_code}-{name}"
    storage_path.write_bytes(b"resume-bytes")
    resume_file = RecruitmentResumeFile(
        org_code=candidate.org_code,
        candidate_id=candidate.id,
        original_name=name,
        stored_name=storage_path.name,
        file_ext=".pdf",
        mime_type="application/pdf",
        file_size=storage_path.stat().st_size,
        storage_path=str(storage_path),
        parse_status="success",
        uploaded_by="hr",
    )
    db.add(resume_file)
    db.commit()
    db.refresh(resume_file)
    candidate.latest_resume_file_id = resume_file.id
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return resume_file


def _add_candidate_detail_artifacts(db, candidate: RecruitmentCandidate, resume_file: RecruitmentResumeFile):
    parse_row = RecruitmentResumeParseResult(
        candidate_id=candidate.id,
        resume_file_id=resume_file.id,
        org_code=candidate.org_code,
        raw_text="raw resume text",
        basic_info_json=json.dumps({"name": candidate.name}, ensure_ascii=False),
        work_experiences_json=json.dumps([{"company": "示例公司"}], ensure_ascii=False),
        education_experiences_json=json.dumps([{"school": "示例大学"}], ensure_ascii=False),
        skills_json=json.dumps(["Python"], ensure_ascii=False),
        projects_json=json.dumps([], ensure_ascii=False),
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
        match_percent=92,
        recommendation="pass",
        suggested_status="screening_passed",
    )
    db.add(score_row)
    db.flush()
    candidate.latest_parse_result_id = parse_row.id
    candidate.latest_score_id = score_row.id
    candidate.match_percent = 92
    candidate.ai_recommended_status = "screening_passed"
    db.add(candidate)
    db.add(
        RecruitmentCandidateStatusHistory(
            candidate_id=candidate.id,
            org_code=candidate.org_code,
            from_status="pending_screening",
            to_status="screening_passed",
            reason="AI 初筛通过",
            changed_by="hr",
            source="screening",
        )
    )
    db.add(
        RecruitmentCandidateWorkflowMemory(
            candidate_id=candidate.id,
            position_id=candidate.position_id,
            org_code=candidate.org_code,
            screening_skill_ids_json=json.dumps([1]),
            screening_memory_source="candidate",
            latest_parse_result_id=parse_row.id,
            latest_score_id=score_row.id,
            interview_skill_ids_json=json.dumps([2]),
        )
    )
    db.add(
        RecruitmentAITaskLog(
            task_type="screening_flow",
            org_code=candidate.org_code,
            related_candidate_id=candidate.id,
            status="success",
            prompt_snapshot="prompt with hidden score",
            input_summary="input includes resume and score context",
            output_summary="初筛通过",
            output_snapshot=json.dumps({"score": {"total_score": 88, "match_percent": 92}}, ensure_ascii=False),
            parsed_response_json=json.dumps({"score": {"total_score": 88}}, ensure_ascii=False),
            sanitized_response_json=json.dumps({"score": {"total_score": 88}}, ensure_ascii=False),
            validation_meta_json=json.dumps({"screening_result_valid": True, "score_visible": True}, ensure_ascii=False),
            created_by="hr",
        )
    )
    db.add(
        RecruitmentAITaskLog(
            task_type="chat_orchestrator",
            org_code=candidate.org_code,
            related_candidate_id=candidate.id,
            status="success",
            output_summary="助手记录",
            created_by="hr",
        )
    )
    db.add(
        RecruitmentInterviewQuestion(
            candidate_id=candidate.id,
            position_id=candidate.position_id,
            org_code=candidate.org_code,
            skill_ids_json=json.dumps([2]),
            round_name="初试",
            markdown_content="问题",
            status="generated",
            created_by="hr",
        )
    )
    db.commit()
    db.refresh(candidate)
    return parse_row, score_row


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


def test_review_task_list_sanitizes_candidate_by_visible_sections(tmp_path):
    db = _build_test_db()
    candidate = _add_candidate(db)
    resume_file = _add_resume_file(db, candidate, tmp_path, name="candidate.pdf")
    _add_candidate_detail_artifacts(db, candidate, resume_file)
    candidate.notes = "仅招聘负责人可见"
    candidate.ai_match_position_id = 999
    candidate.ai_match_position_title = "秘密岗位"
    candidate.ai_match_confidence = 99
    candidate.ai_match_reason = "内部匹配原因"
    candidate.ai_match_alternatives = json.dumps([{"position_title": "替代秘密岗位"}], ensure_ascii=False)
    db.add(candidate)
    db.commit()
    _seed_reviewers(db, "manager-a")
    service = RecruitmentService(db)
    service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}],
            "visible_sections": ["standard_resume"],
        },
        "hr",
    )

    task = service.list_my_department_review_tasks("manager-a")["items"][0]

    assert task["candidate"]["latest_parse_result_id"] is not None
    assert task["candidate"]["latest_score_id"] is None
    assert task["candidate"]["latest_total_score"] is None
    assert task["candidate"]["match_percent"] is None
    assert task["candidate"]["ai_match_reason"] is None
    assert task["candidate"]["ai_match_alternatives"] is None
    assert task["candidate"]["notes"] is None
    assert task["candidate"]["position_screening_skills"] == []


def test_review_visible_sections_never_return_skill_prompt_bodies():
    service = RecruitmentService(_build_test_db())
    payload = {
        "position_jd_skill_ids": [1],
        "position_jd_skills": [{"id": 1, "name": "JD", "content": "JD-SECRET"}],
        "position_screening_skill_ids": [2],
        "position_screening_skills": [{"id": 2, "name": "Screen", "content": "SCREEN-SECRET"}],
        "position_interview_skill_ids": [3],
        "position_interview_skills": [{"id": 3, "name": "Interview", "content": "INTERVIEW-SECRET"}],
    }

    sanitized = service._sanitize_department_review_candidate_payload(
        payload,
        {"standard_resume", "screening_result", "assessment_result", "interview_feedback"},
    )

    assert sanitized["position_jd_skill_ids"] == []
    assert sanitized["position_jd_skills"] == []
    assert sanitized["position_screening_skill_ids"] == []
    assert sanitized["position_screening_skills"] == []
    assert sanitized["position_interview_skill_ids"] == []
    assert sanitized["position_interview_skills"] == []
    assert "SECRET" not in json.dumps(sanitized, ensure_ascii=False)


def test_assigned_self_scope_reviewer_can_read_only_within_visible_org():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_reviewers(db, "manager-a")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {"candidate_id": candidate.id, "reviewers": [{"user_code": "manager-a"}]},
        "hr",
    )
    assignment_id = created["batch"]["assignments"][0]["id"]
    service.permission_context = PermissionContext(
        actor_user_code="manager-a",
        primary_org_code="group",
        data_scope=DATA_SCOPE_SELF,
        custom_org_codes=(),
        visible_org_codes=("group",),
        is_self_scope=True,
        permissions={"recruitment-review-act": True},
    )

    detail = service.get_department_review_candidate_detail(assignment_id, "manager-a")
    assert detail["candidate"]["id"] == candidate.id
    assert service.list_my_department_review_tasks("manager-a")["total"] == 1

    service.permission_context = PermissionContext(
        actor_user_code="manager-a",
        primary_org_code="other-org",
        data_scope=DATA_SCOPE_SELF,
        custom_org_codes=(),
        visible_org_codes=("other-org",),
        is_self_scope=True,
        permissions={"recruitment-review-act": True},
    )
    assert service.list_my_department_review_tasks("manager-a")["total"] == 0
    with pytest.raises(ValueError, match="无权访问此资源"):
        service.get_department_review_candidate_detail(assignment_id, "manager-a")


def test_department_review_candidate_detail_enforces_assignee_scope():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_reviewers(db, "manager-a", "manager-b")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}],
        },
        "hr",
    )
    assignment_id = created["batch"]["assignments"][0]["id"]

    detail = service.get_department_review_candidate_detail(assignment_id, "manager-a")

    assert detail["candidate"]["id"] == candidate.id
    assert detail["department_review_context"]["assignment"]["id"] == assignment_id
    with pytest.raises(ValueError, match="只能查看分配给自己的部门评审候选人"):
        service.get_department_review_candidate_detail(assignment_id, "manager-b")


def test_department_review_candidate_detail_applies_visible_sections_crop(tmp_path):
    db = _build_test_db()
    candidate = _add_candidate(db)
    resume_file = _add_resume_file(db, candidate, tmp_path, name="candidate.pdf")
    parse_row, _score_row = _add_candidate_detail_artifacts(db, candidate, resume_file)
    _seed_reviewers(db, "manager-a")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}],
            "visible_sections": ["standard_resume"],
        },
        "hr",
    )
    assignment_id = created["batch"]["assignments"][0]["id"]

    detail = service.get_department_review_candidate_detail(assignment_id, "manager-a")

    assert detail["department_review_context"]["batch"]["visible_sections"] == ["standard_resume"]
    assert detail["candidate"]["latest_resume_file_id"] is None
    assert detail["resume_files"] == []
    assert detail["candidate"]["latest_parse_result_id"] == parse_row.id
    assert detail["parse_result"]["id"] == parse_row.id
    assert detail["screening"]["parsed_resume"]["summary"] == "标准简历摘要"
    assert detail["candidate"]["latest_score_id"] is None
    assert detail["candidate"]["latest_total_score"] is None
    assert detail["candidate"]["match_percent"] is None
    assert detail["score"] is None
    assert detail["screening"]["score"] is None
    assert detail["screening"]["meta"] is None
    assert detail["workflow_memory"] is None
    assert detail["status_history"] == []
    assert detail["interview_questions"] == []
    assert detail["activity"] == []
    assert detail["activity_meta"]["returned_count"] == 0
    with pytest.raises(ValueError, match="当前部门评审未开放原始简历查看"):
        service.get_department_review_resume_file_download(assignment_id, resume_file.id, "manager-a")


def test_department_review_candidate_detail_respects_explicit_empty_visible_sections(tmp_path):
    db = _build_test_db()
    candidate = _add_candidate(db)
    resume_file = _add_resume_file(db, candidate, tmp_path, name="candidate.pdf")
    _add_candidate_detail_artifacts(db, candidate, resume_file)
    _seed_reviewers(db, "manager-a")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}],
            "visible_sections": [],
        },
        "hr",
    )
    assignment_id = created["batch"]["assignments"][0]["id"]

    detail = service.get_department_review_candidate_detail(assignment_id, "manager-a")

    assert created["batch"]["visible_sections"] == []
    assert detail["department_review_context"]["batch"]["visible_sections"] == []
    assert detail["candidate"]["latest_resume_file_id"] is None
    assert detail["candidate"]["latest_parse_result_id"] is None
    assert detail["candidate"]["latest_score_id"] is None
    assert detail["candidate"]["latest_total_score"] is None
    assert detail["candidate"]["match_percent"] is None
    assert detail["resume_files"] == []
    assert detail["parse_result"] is None
    assert detail["score"] is None
    assert detail["screening"]["parsed_resume"] is None
    assert detail["screening"]["score"] is None
    assert detail["screening"]["meta"] is None
    assert detail["workflow_memory"] is None
    assert detail["status_history"] == []
    assert detail["interview_questions"] == []
    assert detail["activity"] == []


def test_department_review_candidate_detail_redacts_screening_activity_outputs(tmp_path):
    db = _build_test_db()
    candidate = _add_candidate(db)
    resume_file = _add_resume_file(db, candidate, tmp_path, name="candidate.pdf")
    _add_candidate_detail_artifacts(db, candidate, resume_file)
    _seed_reviewers(db, "manager-a")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}],
            "visible_sections": ["screening_result"],
        },
        "hr",
    )
    assignment_id = created["batch"]["assignments"][0]["id"]

    detail = service.get_department_review_candidate_detail(assignment_id, "manager-a")

    assert detail["score"] is None
    assert detail["candidate"]["latest_score_id"] is None
    assert detail["activity"]
    activity = detail["activity"][0]
    assert activity["task_type"] == "screening_flow"
    assert activity["status"] == "success"
    assert activity["output_summary"] is None
    for hidden_key in (
        "prompt_snapshot",
        "input_summary",
        "output_snapshot",
        "raw_response_text",
        "parsed_response_json",
        "sanitized_response_json",
        "validation_meta",
        "persisted_result_refs",
        "score_rule_snapshot",
    ):
        assert hidden_key not in activity


def test_department_review_candidate_detail_exposes_only_interview_feedback_fields():
    db = _build_test_db()
    candidate = _add_candidate(db)
    db.add(
        RecruitmentInterviewSchedule(
            candidate_id=candidate.id,
            position_id=candidate.position_id,
            org_code=candidate.org_code,
            round_name="初试",
            round_index=1,
            interviewer_user_code="interviewer-a",
            interviewer_name="面试官A",
            meeting_link="https://secret.example.test/room",
            contact_phone="13800000000",
            notes="内部安排备注",
            result_status="passed",
            result_comment="技术基础扎实",
            status="completed",
            created_by="hr",
        )
    )
    db.commit()
    _seed_reviewers(db, "manager-a")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}],
            "visible_sections": ["interview_feedback"],
        },
        "hr",
    )
    assignment_id = created["batch"]["assignments"][0]["id"]

    detail = service.get_department_review_candidate_detail(assignment_id, "manager-a")

    assert detail["interview_schedules"] == [
        {
            "id": detail["interview_schedules"][0]["id"],
            "candidate_id": candidate.id,
            "position_id": candidate.position_id,
            "round_name": "初试",
            "round_index": 1,
            "interviewer_name": "面试官A",
            "scheduled_at": None,
            "result_status": "passed",
            "result_comment": "技术基础扎实",
            "result_submitted_at": None,
            "status": "completed",
        }
    ]
    serialized = json.dumps(detail["interview_schedules"], ensure_ascii=False)
    assert "secret.example.test" not in serialized
    assert "13800000000" not in serialized
    assert "内部安排备注" not in serialized


def test_department_review_assignment_history_returns_only_actor_assignments():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_reviewers(db, "manager-a", "manager-b")
    service = RecruitmentService(db)
    first = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}, {"user_code": "manager-b"}],
            "visible_sections": ["screening_result"],
        },
        "hr",
    )
    first_assignment_id = next(
        item["id"]
        for item in first["batch"]["assignments"]
        if item["reviewer_user_code"] == "manager-a"
    )
    first_other_assignment_id = next(
        item["id"]
        for item in first["batch"]["assignments"]
        if item["reviewer_user_code"] == "manager-b"
    )
    service.decide_department_review_assignment(first_assignment_id, {"status": "passed", "comment": "可进入面试"}, "manager-a")
    service.decide_department_review_assignment(first_other_assignment_id, {"status": "passed"}, "manager-b")
    second = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}],
            "visible_sections": ["standard_resume"],
        },
        "hr",
    )
    second_assignment_id = second["batch"]["assignments"][0]["id"]

    history = service.list_department_review_assignment_history(second_assignment_id, "manager-a")

    assert [row["id"] for row in history] == [second["batch"]["id"], first["batch"]["id"]]
    assert all(len(row["assignments"]) == 1 for row in history)
    assert all(row["assignments"][0]["reviewer_user_code"] == "manager-a" for row in history)
    assert history[0]["visible_sections"] == ["standard_resume"]
    assert history[1]["visible_sections"] == ["screening_result"]
    with pytest.raises(ValueError, match="只能查看分配给自己的部门评审候选人"):
        service.list_department_review_assignment_history(second_assignment_id, "manager-b")


def test_department_review_resume_download_enforces_assignment_scope(tmp_path):
    db = _build_test_db()
    candidate = _add_candidate(db)
    other_candidate = _add_candidate(db, code="C-DEPT-OTHER")
    resume_file = _add_resume_file(db, candidate, tmp_path, name="candidate.pdf")
    other_resume_file = _add_resume_file(db, other_candidate, tmp_path, name="other.pdf")
    _seed_reviewers(db, "manager-a", "manager-b")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {
            "candidate_id": candidate.id,
            "reviewers": [{"user_code": "manager-a"}],
            "visible_sections": ["original_resume", "screening_result"],
        },
        "hr",
    )
    assignment_id = created["batch"]["assignments"][0]["id"]

    payload = service.get_department_review_resume_file_download(assignment_id, resume_file.id, "manager-a")

    assert payload["file_name"] == "candidate.pdf"
    assert payload["content"] == b"resume-bytes"
    with pytest.raises(ValueError, match="只能下载分配给自己的部门评审候选人简历"):
        service.get_department_review_resume_file_download(assignment_id, other_resume_file.id, "manager-a")
    with pytest.raises(ValueError, match="只能查看分配给自己的部门评审候选人"):
        service.get_department_review_resume_file_download(assignment_id, resume_file.id, "manager-b")


def test_completed_department_review_is_idempotent_but_cannot_be_changed():
    db = _build_test_db()
    candidate = _add_candidate(db)
    _seed_reviewers(db, "manager-a")
    service = RecruitmentService(db)
    created = service.create_department_review(
        {"candidate_id": candidate.id, "reviewers": [{"user_code": "manager-a"}]},
        "hr",
    )
    assignment_id = created["batch"]["assignments"][0]["id"]

    first = service.decide_department_review_assignment(
        assignment_id,
        {"status": "passed", "comment": "可以进入面试"},
        "manager-a",
    )
    replay = service.decide_department_review_assignment(
        assignment_id,
        {"status": "passed", "comment": "重复请求不应覆盖"},
        "manager-a",
    )

    assert first["assignment"]["status"] == "passed"
    assert replay["assignment"]["status"] == "passed"
    assert replay["assignment"]["comment"] == "可以进入面试"
    with pytest.raises(ValueError, match="已完成的评审不能修改"):
        service.decide_department_review_assignment(
            assignment_id,
            {"status": "rejected", "comment": "改判"},
            "manager-a",
        )
    db.refresh(candidate)
    assert candidate.status == "department_review_passed"


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
