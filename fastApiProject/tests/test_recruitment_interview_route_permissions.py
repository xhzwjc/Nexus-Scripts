import json
import re
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.routers import recruitment
from app.permission_governance import DATA_SCOPE_ORG_ONLY, DATA_SCOPE_SELF, PermissionContext
from app.script_hub_session import create_script_hub_session, require_script_hub_any_permission


INTERVIEW_SCOPED_PERMISSIONS = [
    "recruitment-interview-view",
    "recruitment-interview-act",
    "recruitment-interview-manage",
]
REVIEW_SCOPED_PERMISSIONS = [
    "recruitment-review-view",
    "recruitment-review-act",
]
TASK_EVENT_PERMISSIONS = [
    "recruitment-process-execute",
    "recruitment-log-view",
    *REVIEW_SCOPED_PERMISSIONS,
    *INTERVIEW_SCOPED_PERMISSIONS,
]
CANDIDATE_INTERVIEW_SCHEDULE_PERMISSIONS = [
    "recruitment-dashboard-view",
    *INTERVIEW_SCOPED_PERMISSIONS,
]


def _auth_headers(permission: str) -> dict[str, str]:
    token = create_script_hub_session(
        {
            "id": f"user-{permission}",
            "role": "tester",
            "roles": ["tester"],
            "name": "Interview Permission Tester",
            "permissions": {permission: True},
            "teamResourcesLoginKeyEnabled": False,
        }
    )["token"]
    return {"Authorization": f"Bearer {token}"}


def _request_with_permission(permission: str) -> Request:
    authorization = _auth_headers(permission)["Authorization"].encode("utf-8")
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/recruitment/task-events",
            "raw_path": b"/recruitment/task-events",
            "query_string": b"",
            "headers": [(b"authorization", authorization)],
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
        }
    )


def _permission_context(
    actor_id: str,
    permission: str,
    *,
    visible_org_codes=("company-a",),
    self_scope=False,
) -> PermissionContext:
    return PermissionContext(
        actor_user_code=actor_id,
        primary_org_code="company-a",
        data_scope=DATA_SCOPE_SELF if self_scope else DATA_SCOPE_ORG_ONLY,
        custom_org_codes=(),
        visible_org_codes=visible_org_codes,
        is_self_scope=self_scope,
        permissions={permission: True},
    )


def _task_event(
    *,
    task_type="interview_schedule",
    interviewer_user_code="interviewer-a",
    previous_interviewer_user_code=None,
    org_code="company-a",
    created_by="hr",
    reviewer_user_codes=None,
) -> str:
    return json.dumps(
        {
            "type": "candidate_updated",
            "task_type": task_type,
            "interviewer_user_code": interviewer_user_code,
            "previous_interviewer_user_code": previous_interviewer_user_code,
            "reviewer_user_codes": reviewer_user_codes or [],
            "org_code": org_code,
            "candidate_snapshot": {
                "id": 11,
                "org_code": org_code,
                "created_by": created_by,
            },
        }
    )


class _FakeInterviewService:
    def __init__(self):
        self.calls: list[tuple] = []

    def get_interview_candidate_detail(
        self,
        candidate_id,
        actor_id,
        schedule_id=None,
        *,
        can_manage=False,
    ):
        self.calls.append(("detail", candidate_id, actor_id, schedule_id, can_manage))
        if not can_manage and not schedule_id:
            raise ValueError("查看面试候选人详情时必须指定当前面试任务")
        return {"candidate": {"id": candidate_id}}

    def get_interview_resume_file_download(
        self,
        resume_file_id,
        actor_id,
        schedule_id=None,
        *,
        can_manage=False,
    ):
        self.calls.append(("resume", resume_file_id, actor_id, schedule_id, can_manage))
        if not can_manage and not schedule_id:
            raise ValueError("查看面试候选人简历时必须指定当前面试任务")
        return {
            "file_name": "candidate.pdf",
            "content": b"resume",
            "media_type": "application/pdf",
        }

    def list_interview_schedules(self, candidate_id, *, actor_id=None, schedule_id=None):
        self.calls.append(("schedules", candidate_id, actor_id, schedule_id))
        if actor_id is not None and not schedule_id:
            raise ValueError("查看自己的面试安排时必须指定当前面试任务")
        return [{"id": schedule_id or 1, "candidate_id": candidate_id}]


@pytest.fixture()
def interview_route_client():
    service = _FakeInterviewService()
    app = FastAPI()
    app.include_router(recruitment.recruitment_router)
    app.dependency_overrides[recruitment.get_recruitment_service] = lambda: service
    return TestClient(app), service


def _extract_typescript_permission_array(source: str, name: str, cache=None) -> list[str]:
    cache = cache or {}
    if name in cache:
        return cache[name]
    match = re.search(
        rf"export const {re.escape(name)}: string\[\] = \[(.*?)\];",
        source,
        flags=re.DOTALL,
    )
    assert match, f"TypeScript permission constant {name} not found"
    values: list[str] = []
    for entry in match.group(1).split(","):
        normalized = entry.strip()
        if not normalized:
            continue
        if normalized.startswith("..."):
            values.extend(_extract_typescript_permission_array(source, normalized[3:], cache))
            continue
        quoted = re.fullmatch(r'["\']([^"\']+)["\']', normalized)
        assert quoted, f"Unsupported TypeScript permission entry: {normalized}"
        values.append(quoted.group(1))
    cache[name] = values
    return values


def test_next_and_fastapi_interview_permission_sets_stay_aligned():
    repository_root = Path(__file__).resolve().parents[2]
    frontend_constants = (
        repository_root
        / "my-app"
        / "src"
        / "lib"
        / "server"
        / "recruitmentRoutePermissions.ts"
    ).read_text(encoding="utf-8")

    assert recruitment.RECRUITMENT_INTERVIEW_SCOPED_PERMISSIONS == INTERVIEW_SCOPED_PERMISSIONS
    assert recruitment.RECRUITMENT_REVIEW_SCOPED_PERMISSIONS == REVIEW_SCOPED_PERMISSIONS
    assert recruitment.RECRUITMENT_TASK_EVENT_PERMISSIONS == TASK_EVENT_PERMISSIONS
    assert recruitment.RECRUITMENT_CANDIDATE_INTERVIEW_SCHEDULE_PERMISSIONS == CANDIDATE_INTERVIEW_SCHEDULE_PERMISSIONS
    assert _extract_typescript_permission_array(
        frontend_constants,
        "RECRUITMENT_INTERVIEW_SCOPED_PERMISSIONS",
    ) == INTERVIEW_SCOPED_PERMISSIONS
    assert _extract_typescript_permission_array(
        frontend_constants,
        "RECRUITMENT_REVIEW_SCOPED_PERMISSIONS",
    ) == REVIEW_SCOPED_PERMISSIONS
    assert _extract_typescript_permission_array(
        frontend_constants,
        "RECRUITMENT_TASK_EVENT_PERMISSIONS",
    ) == TASK_EVENT_PERMISSIONS
    assert _extract_typescript_permission_array(
        frontend_constants,
        "RECRUITMENT_CANDIDATE_INTERVIEW_SCHEDULE_PERMISSIONS",
    ) == CANDIDATE_INTERVIEW_SCHEDULE_PERMISSIONS

    task_event_route = (
        repository_root
        / "my-app"
        / "src"
        / "app"
        / "api"
        / "recruitment"
        / "task-events"
        / "route.ts"
    ).read_text(encoding="utf-8")
    catch_all_route = (
        repository_root
        / "my-app"
        / "src"
        / "app"
        / "api"
        / "recruitment"
        / "[...path]"
        / "route.ts"
    ).read_text(encoding="utf-8")
    assert "requireScriptHubAnyPermission(request, RECRUITMENT_TASK_EVENT_PERMISSIONS)" in task_event_route
    assert 'if (path === "task-events")' in catch_all_route
    assert "return RECRUITMENT_TASK_EVENT_PERMISSIONS;" in catch_all_route
    assert "return RECRUITMENT_CANDIDATE_INTERVIEW_SCHEDULE_PERMISSIONS;" in catch_all_route
    assert "return RECRUITMENT_INTERVIEW_SCOPED_PERMISSIONS;" in catch_all_route
    assert "return RECRUITMENT_REVIEW_SCOPED_PERMISSIONS;" in catch_all_route


@pytest.mark.parametrize("permission", INTERVIEW_SCOPED_PERMISSIONS)
def test_task_event_dependency_accepts_each_pure_interview_permission(permission):
    dependency = require_script_hub_any_permission(recruitment.RECRUITMENT_TASK_EVENT_PERMISSIONS)
    session = dependency(_request_with_permission(permission))
    assert session["permissions"] == {permission: True}


@pytest.mark.parametrize("permission", REVIEW_SCOPED_PERMISSIONS)
def test_task_event_dependency_accepts_each_pure_review_permission(permission):
    dependency = require_script_hub_any_permission(recruitment.RECRUITMENT_TASK_EVENT_PERMISSIONS)
    session = dependency(_request_with_permission(permission))
    assert session["permissions"] == {permission: True}


def test_task_event_dependency_rejects_unrelated_permission():
    dependency = require_script_hub_any_permission(recruitment.RECRUITMENT_TASK_EVENT_PERMISSIONS)
    with pytest.raises(HTTPException) as exc_info:
        dependency(_request_with_permission("recruitment-talent-pool-view"))
    assert exc_info.value.status_code == 403


@pytest.mark.parametrize("permission", ["recruitment-process-execute", "recruitment-log-view"])
def test_full_task_event_permissions_keep_existing_unfiltered_stream(permission):
    session = {"id": "full-user", "permissions": {permission: True}}

    assert recruitment._should_deliver_task_event("not-json", session, None) is True
    assert recruitment._should_deliver_task_event(
        _task_event(task_type="screening_flow", interviewer_user_code="other", org_code="company-b"),
        session,
        None,
    ) is True


@pytest.mark.parametrize("permission", INTERVIEW_SCOPED_PERMISSIONS[:2])
def test_pure_interviewer_task_stream_only_receives_own_interview_events(permission):
    actor_id = "interviewer-a"
    session = {"id": actor_id, "permissions": {permission: True}}
    context = _permission_context(actor_id, permission)

    assert recruitment._should_deliver_task_event(_task_event(), session, context) is True
    assert recruitment._should_deliver_task_event(
        _task_event(interviewer_user_code="interviewer-b"),
        session,
        context,
    ) is False
    assert recruitment._should_deliver_task_event(
        _task_event(interviewer_user_code=""),
        session,
        context,
    ) is False
    assert recruitment._should_deliver_task_event(
        _task_event(task_type="department_review"),
        session,
        context,
    ) is False
    assert recruitment._should_deliver_task_event("not-json", session, context) is False

    scoped_payload = json.loads(recruitment._task_event_for_session(_task_event(), session, context))
    assert "candidate_snapshot" not in scoped_payload


@pytest.mark.parametrize("permission", REVIEW_SCOPED_PERMISSIONS)
def test_pure_reviewer_stream_only_receives_own_org_scoped_review_events(permission):
    actor_id = "reviewer-a"
    session = {"id": actor_id, "permissions": {permission: True}}
    context = _permission_context(actor_id, permission)

    own_event = _task_event(
        task_type="department_review",
        reviewer_user_codes=[actor_id, "reviewer-b"],
    )
    unrelated_event = _task_event(
        task_type="department_review",
        reviewer_user_codes=["reviewer-b"],
    )
    cross_org_event = _task_event(
        task_type="department_review",
        reviewer_user_codes=[actor_id],
        org_code="company-b",
    )

    assert recruitment._should_deliver_task_event(own_event, session, context) is True
    assert recruitment._should_deliver_task_event(unrelated_event, session, context) is False
    assert recruitment._should_deliver_task_event(cross_org_event, session, context) is False
    assert recruitment._should_deliver_task_event(_task_event(), session, context) is False
    scoped_payload = json.loads(recruitment._task_event_for_session(own_event, session, context))
    assert "candidate_snapshot" not in scoped_payload


def test_pure_interviewer_stream_uses_assignment_for_self_scope_and_receives_reassignment_invalidation():
    permission = "recruitment-interview-act"
    actor_id = "interviewer-a"
    session = {"id": actor_id, "permissions": {permission: True}}
    context = _permission_context(actor_id, permission, self_scope=True)

    assigned_event = _task_event(created_by="hr")
    reassigned_event = _task_event(
        interviewer_user_code="interviewer-b",
        previous_interviewer_user_code=actor_id,
        created_by="hr",
    )
    unrelated_event = _task_event(
        interviewer_user_code="interviewer-b",
        previous_interviewer_user_code="interviewer-c",
        created_by="hr",
    )

    assert recruitment._should_deliver_task_event(assigned_event, session, context) is True
    assert recruitment._should_deliver_task_event(reassigned_event, session, context) is True
    assert recruitment._should_deliver_task_event(unrelated_event, session, context) is False
    assert "candidate_snapshot" not in json.loads(
        recruitment._task_event_for_session(reassigned_event, session, context)
    )


def test_pure_interview_manager_stream_is_interview_only_and_org_scoped():
    permission = "recruitment-interview-manage"
    session = {"id": "interview-manager", "permissions": {permission: True}}
    context = _permission_context("interview-manager", permission)

    assert recruitment._should_deliver_task_event(
        _task_event(interviewer_user_code="interviewer-b"),
        session,
        context,
    ) is True
    assert recruitment._should_deliver_task_event(
        _task_event(task_type="screening_flow"),
        session,
        context,
    ) is False
    assert recruitment._should_deliver_task_event(
        _task_event(org_code="company-b"),
        session,
        context,
    ) is False
    manager_payload = recruitment._task_event_for_session(_task_event(), session, context)
    assert json.loads(manager_payload)["candidate_snapshot"]["id"] == 11


def test_interview_task_stream_honors_self_scope_and_fails_closed_without_context():
    permission = "recruitment-interview-manage"
    actor_id = "self-manager"
    session = {"id": actor_id, "permissions": {permission: True}}
    context = _permission_context(actor_id, permission, self_scope=True)

    assert recruitment._should_deliver_task_event(
        _task_event(created_by=actor_id),
        session,
        context,
    ) is True
    assert recruitment._should_deliver_task_event(
        _task_event(created_by="other-user"),
        session,
        context,
    ) is False
    assert recruitment._should_deliver_task_event(_task_event(), session, None) is False


@pytest.mark.parametrize("permission", INTERVIEW_SCOPED_PERMISSIONS[:2])
def test_interviewer_scoped_detail_and_resume_require_schedule_id(interview_route_client, permission):
    client, service = interview_route_client
    headers = _auth_headers(permission)

    assert client.get("/recruitment/interviews/candidates/11", headers=headers).status_code == 403
    detail = client.get(
        "/recruitment/interviews/candidates/11?schedule_id=71",
        headers=headers,
    )
    resume = client.get(
        "/recruitment/interviews/resume-files/21/download?schedule_id=71",
        headers=headers,
    )

    assert detail.status_code == 200
    assert resume.status_code == 200
    assert ("detail", 11, f"user-{permission}", 71, False) in service.calls
    assert ("resume", 21, f"user-{permission}", 71, False) in service.calls


def test_interview_manager_can_read_full_scoped_detail_and_resume_without_schedule(interview_route_client):
    client, service = interview_route_client
    permission = "recruitment-interview-manage"
    headers = _auth_headers(permission)

    detail = client.get("/recruitment/interviews/candidates/11", headers=headers)
    resume = client.get("/recruitment/interviews/resume-files/21/download", headers=headers)

    assert detail.status_code == 200
    assert resume.status_code == 200
    assert ("detail", 11, f"user-{permission}", None, True) in service.calls
    assert ("resume", 21, f"user-{permission}", None, True) in service.calls


def test_candidate_interview_schedules_keep_full_and_self_scoped_callers_separate(interview_route_client):
    client, service = interview_route_client

    manager = client.get(
        "/recruitment/candidates/11/interview-schedules",
        headers=_auth_headers("recruitment-interview-manage"),
    )
    dashboard = client.get(
        "/recruitment/candidates/11/interview-schedules",
        headers=_auth_headers("recruitment-dashboard-view"),
    )
    interviewer_without_schedule = client.get(
        "/recruitment/candidates/11/interview-schedules",
        headers=_auth_headers("recruitment-interview-view"),
    )
    interviewer = client.get(
        "/recruitment/candidates/11/interview-schedules?schedule_id=71",
        headers=_auth_headers("recruitment-interview-view"),
    )
    unrelated = client.get(
        "/recruitment/candidates/11/interview-schedules",
        headers=_auth_headers("recruitment-talent-pool-view"),
    )

    assert manager.status_code == 200
    assert dashboard.status_code == 200
    assert interviewer_without_schedule.status_code == 403
    assert interviewer.status_code == 200
    assert unrelated.status_code == 403
    assert ("schedules", 11, None, None) in service.calls
    assert (
        "schedules",
        11,
        "user-recruitment-interview-view",
        71,
    ) in service.calls


def test_scoped_interview_routes_reject_unrelated_permission(interview_route_client):
    client, _service = interview_route_client
    headers = _auth_headers("recruitment-talent-pool-view")

    assert client.get(
        "/recruitment/interviews/candidates/11?schedule_id=71",
        headers=headers,
    ).status_code == 403
    assert client.get(
        "/recruitment/interviews/resume-files/21/download?schedule_id=71",
        headers=headers,
    ).status_code == 403
