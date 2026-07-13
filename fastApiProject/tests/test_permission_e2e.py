import ast
from pathlib import Path
from typing import Any, Dict, Iterable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import database, script_hub_session
from app.database import Base
from app.permission_governance import (
    DATA_SCOPE_ALL,
    DATA_SCOPE_CUSTOM_ORGS,
    DATA_SCOPE_ORG_AND_CHILDREN,
    DATA_SCOPE_ORG_ONLY,
    DATA_SCOPE_SELF,
)
from app.rbac_catalog import DEPRECATED_PERMISSION_KEYS, PERMISSION_DEFINITIONS, ROLE_DEFINITIONS
from app.rbac_models import (
    ScriptHubOrganization,
    ScriptHubPermission,
    ScriptHubRole,
    ScriptHubRolePermission,
    ScriptHubUser,
)
from app.recruitment_models import RecruitmentCandidate, RecruitmentPosition
from app.routers import auth_rbac, recruitment
from app.script_hub_session import create_script_hub_session
from app.services import script_hub_audit_service
from app.services.script_hub_admin_service import create_rbac_user
from app.services.script_hub_auth_service import create_access_key_material, serialize_user_session


ALL_RECRUITMENT_CONFIG_PERMISSIONS = [
    "recruitment-dashboard-view",
    "recruitment-position-manage",
    "recruitment-candidate-manage",
    "recruitment-process-execute",
    "recruitment-talent-pool-view",
    "recruitment-assistant-view",
    "recruitment-log-view",
    "recruitment-skill-view",
    "recruitment-skill-bind",
    "recruitment-skill-manage",
    "recruitment-mail-view",
    "recruitment-mail-send",
    "recruitment-mail-config-manage",
    "recruitment-mail-sender-manage",
    "recruitment-llm-config-view",
    "recruitment-llm-config-manage",
    "resource-sharing-manage",
    "audit-log-view",
]


@pytest.fixture()
def permission_app(monkeypatch):
    monkeypatch.setenv("SCRIPT_HUB_SESSION_SECRET", "permission-e2e-session-secret")
    monkeypatch.setenv("RECRUITMENT_LLM_ENCRYPTION_KEY", "permission-e2e-encryption-secret")

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    monkeypatch.setattr(database, "SessionLocal", testing_session_local)
    monkeypatch.setattr(recruitment, "SessionLocal", testing_session_local)
    monkeypatch.setattr(recruitment, "ensure_recruitment_schema", lambda: None, raising=False)
    monkeypatch.setattr(auth_rbac, "ensure_script_hub_schema", lambda: None, raising=False)

    def override_get_db():
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.include_router(auth_rbac.auth_router)
    app.include_router(auth_rbac.rbac_router)
    app.include_router(recruitment.recruitment_router)
    app.dependency_overrides[database.get_db] = override_get_db

    with testing_session_local() as db:
        _seed_catalog(db)
        _seed_org_tree(db)
        _seed_test_roles(db)
        users = _seed_users(db)
        resources = _seed_recruitment_data(db)
        db.commit()

    return {
        "client": TestClient(app),
        "session_factory": testing_session_local,
        "users": users,
        "resources": resources,
    }


def _seed_catalog(db):
    permission_rows = {}
    for definition in PERMISSION_DEFINITIONS:
        permission = ScriptHubPermission(
            permission_key=definition.key,
            name=definition.name,
            category=definition.category,
            description=definition.description,
            sort_order=definition.sort_order,
            is_active=True,
        )
        db.add(permission)
        permission_rows[definition.key] = permission
    for permission_key in DEPRECATED_PERMISSION_KEYS:
        permission = ScriptHubPermission(
            permission_key=permission_key,
            name=permission_key,
            category="deprecated",
            description="deprecated legacy permission",
            sort_order=999,
            is_active=False,
        )
        db.add(permission)
        permission_rows[permission_key] = permission
    db.flush()

    role_rows = {}
    for definition in ROLE_DEFINITIONS:
        role = ScriptHubRole(
            role_code=definition.code,
            name=definition.name,
            description=definition.description,
            sort_order=definition.sort_order,
            is_system=True,
            is_active=True,
            is_deleted=False,
        )
        db.add(role)
        role_rows[definition.code] = role
    db.flush()

    for definition in ROLE_DEFINITIONS:
        for permission_key in definition.permissions:
            db.add(ScriptHubRolePermission(role_id=role_rows[definition.code].id, permission_id=permission_rows[permission_key].id))
    db.commit()


def _seed_org_tree(db):
    orgs = [
        ("group", "集团总部", "group", None, "group", 1),
        ("company-a", "Company A", "company", "group", "group/company-a", 10),
        ("dept-a-rd", "A 研发部", "department", "company-a", "group/company-a/dept-a-rd", 10),
        ("dept-a-fin", "A 财务部", "department", "company-a", "group/company-a/dept-a-fin", 20),
        ("company-b", "Company B", "company", "group", "group/company-b", 20),
        ("company-c", "Company C", "company", "group", "group/company-c", 30),
    ]
    for org_code, name, org_type, parent, path, sort_order in orgs:
        db.add(
            ScriptHubOrganization(
                org_code=org_code,
                name=name,
                org_type=org_type,
                parent_org_code=parent,
                path=path,
                sort_order=sort_order,
                is_active=True,
            )
        )
    db.commit()


def _permission_ids(db, permission_keys: Iterable[str]) -> list[int]:
    rows = db.query(ScriptHubPermission).filter(ScriptHubPermission.permission_key.in_(list(permission_keys))).all()
    return [row.id for row in rows]


def _add_role(db, code: str, permissions: Iterable[str], *, sort_order: int = 500) -> None:
    role = ScriptHubRole(
        role_code=code,
        name=code,
        description=f"E2E role {code}",
        sort_order=sort_order,
        is_system=False,
        is_active=True,
        is_deleted=False,
    )
    db.add(role)
    db.flush()
    for permission_id in _permission_ids(db, permissions):
        db.add(ScriptHubRolePermission(role_id=role.id, permission_id=permission_id))


def _seed_test_roles(db):
    roles = {
        "e2e-blank": [],
        "e2e-viewer": ["recruitment-dashboard-view"],
        "e2e-company-admin": ALL_RECRUITMENT_CONFIG_PERMISSIONS + ["rbac-manage"],
        "e2e-rbac-manager": ["rbac-manage"],
        "e2e-skill-viewer": ["recruitment-skill-view"],
        "e2e-skill-binder": ["recruitment-dashboard-view", "recruitment-skill-bind"],
        "e2e-skill-manager": ["recruitment-skill-view", "recruitment-skill-bind", "recruitment-skill-manage"],
        "e2e-talent-pool-viewer": ["recruitment-talent-pool-view"],
        "e2e-assistant-viewer": ["recruitment-assistant-view"],
        "e2e-mail-viewer": ["recruitment-mail-view"],
        "e2e-mail-sender": ["recruitment-mail-view", "recruitment-mail-send"],
        "e2e-mail-config-manager": ["recruitment-mail-view", "recruitment-mail-config-manage"],
        "e2e-mail-sender-manager": ["recruitment-mail-view", "recruitment-mail-sender-manage"],
        "e2e-llm-viewer": ["recruitment-llm-config-view"],
        "e2e-llm-manager": ["recruitment-llm-config-view", "recruitment-llm-config-manage"],
        "e2e-legacy-view": ["ai-recruitment"],
        "e2e-legacy-manage": ["ai-recruitment-manage"],
    }
    for index, (code, permissions) in enumerate(roles.items(), start=1):
        _add_role(db, code, permissions, sort_order=500 + index)
    db.commit()


def _create_user(
    db,
    code: str,
    *,
    role: str = "e2e-blank",
    org: str = "group",
    data_scope: str = DATA_SCOPE_ORG_ONLY,
    custom_orgs: list[str] | None = None,
    boundary: Dict[str, Any] | None = None,
    granted: list[str] | None = None,
    active: bool = True,
    super_admin: bool = False,
):
    create_rbac_user(
        db,
        user_code=code,
        display_name=code,
        access_key=f"{code}-key",
        primary_org_code=org,
        data_scope=data_scope,
        custom_org_codes=custom_orgs or [],
        authorization_boundary=boundary or {},
        role_codes=[role],
        granted_permissions=granted or [],
        revoked_permissions=[],
        team_resources_login_key_enabled=False,
        is_active=active,
        is_super_admin=super_admin,
        notes=None,
    )
    return code


def _create_no_role_user(db, code: str, *, org: str = "group"):
    material = create_access_key_material(f"{code}-key")
    db.add(
        ScriptHubUser(
            user_code=code,
            display_name=code,
            access_key_lookup_hash=material["lookup_hash"],
            access_key_salt=material["salt"],
            access_key_hash=material["hash"],
            primary_org_code=org,
            data_scope=DATA_SCOPE_ORG_ONLY,
            custom_org_codes_json="[]",
            authorization_boundary_json="{}",
            permission_version=1,
            team_resources_access_enabled=False,
            is_super_admin=False,
            is_active=True,
            is_deleted=False,
        )
    )
    db.commit()
    return code


def _seed_users(db) -> Dict[str, str]:
    orgs_a = ["company-a", "dept-a-rd", "dept-a-fin"]
    all_orgs = ["group", "company-a", "dept-a-rd", "dept-a-fin", "company-b", "company-c"]
    group_boundary = {
        "can_grant": True,
        "managed_org_codes": all_orgs,
        "assignable_role_codes": ["e2e-blank", "e2e-viewer", "e2e-company-admin", "e2e-skill-viewer"],
        "assignable_permission_keys": ["recruitment-dashboard-view", "recruitment-skill-view", "rbac-manage"],
        "max_data_scope": DATA_SCOPE_ALL,
    }
    company_a_boundary = {
        "can_grant": True,
        "managed_org_codes": orgs_a,
        "assignable_role_codes": ["e2e-blank", "e2e-viewer"],
        "assignable_permission_keys": ["recruitment-dashboard-view", "recruitment-skill-view"],
        "max_data_scope": DATA_SCOPE_ORG_ONLY,
    }

    return {
        "group_admin": _create_user(db, "group-admin", role="e2e-company-admin", org="group", data_scope=DATA_SCOPE_ALL, boundary=group_boundary, granted=["audit-log-sensitive-view"], super_admin=True),
        "company_a_admin": _create_user(db, "company-a-admin", role="e2e-company-admin", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN, boundary=company_a_boundary),
        "company_b_admin": _create_user(db, "company-b-admin", role="e2e-company-admin", org="company-b", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "dept_user": _create_user(db, "dept-user", role="e2e-viewer", org="dept-a-rd", data_scope=DATA_SCOPE_ORG_ONLY),
        "self_user": _create_user(db, "self-user", role="e2e-viewer", org="company-a", data_scope=DATA_SCOPE_SELF),
        "cross_admin": _create_user(db, "cross-admin", role="e2e-viewer", org="group", data_scope=DATA_SCOPE_CUSTOM_ORGS, custom_orgs=["company-a", "company-b"]),
        "viewer": _create_user(db, "viewer-user", role="e2e-viewer", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "rbac_manager": _create_user(db, "rbac-manager", role="e2e-rbac-manager", org="group", data_scope=DATA_SCOPE_ALL, boundary=group_boundary),
        "skill_viewer": _create_user(db, "skill-viewer", role="e2e-skill-viewer", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "skill_binder": _create_user(db, "skill-binder", role="e2e-skill-binder", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "skill_manager": _create_user(db, "skill-manager", role="e2e-skill-manager", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "talent_pool_viewer": _create_user(db, "talent-pool-viewer", role="e2e-talent-pool-viewer", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "assistant_viewer": _create_user(db, "assistant-viewer", role="e2e-assistant-viewer", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "mail_viewer": _create_user(db, "mail-viewer", role="e2e-mail-viewer", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "mail_sender": _create_user(db, "mail-sender", role="e2e-mail-sender", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "mail_config_manager": _create_user(db, "mail-config-manager", role="e2e-mail-config-manager", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "mail_sender_manager": _create_user(db, "mail-sender-manager", role="e2e-mail-sender-manager", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "llm_viewer": _create_user(db, "llm-viewer", role="e2e-llm-viewer", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "llm_manager": _create_user(db, "llm-manager", role="e2e-llm-manager", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "legacy_view": _create_user(db, "legacy-view", role="e2e-legacy-view", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "legacy_manage": _create_user(db, "legacy-manage", role="e2e-legacy-manage", org="company-a", data_scope=DATA_SCOPE_ORG_AND_CHILDREN),
        "disabled_user": _create_user(db, "disabled-user", role="e2e-viewer", org="company-a", data_scope=DATA_SCOPE_ORG_ONLY, active=False),
        "no_perm_user": _create_no_role_user(db, "no-perm-user", org="company-a"),
    }


def _seed_position(db, *, org_code: str, title: str, created_by: str):
    row = RecruitmentPosition(
        position_code=f"POS-{org_code}-{title}".replace(" ", "-")[:80],
        org_code=org_code,
        title=title,
        department=org_code,
        headcount=1,
        status="open",
        created_by=created_by,
        updated_by=created_by,
        deleted=False,
    )
    db.add(row)
    db.flush()
    return row


def _seed_candidate(db, *, org_code: str, position_id: int, name: str, created_by: str):
    row = RecruitmentCandidate(
        candidate_code=f"CAD-{org_code}-{name}".replace(" ", "-")[:80],
        org_code=org_code,
        position_id=position_id,
        name=name,
        source="manual_upload",
        status="pending_screening",
        created_by=created_by,
        updated_by=created_by,
        deleted=False,
    )
    db.add(row)
    db.flush()
    return row


def _seed_recruitment_data(db):
    positions = {
        "group": _seed_position(db, org_code="group", title="Group Position", created_by="group-admin"),
        "company-a": _seed_position(db, org_code="company-a", title="Company A Position", created_by="company-a-admin"),
        "company-a-self": _seed_position(db, org_code="company-a", title="Company A Self Position", created_by="self-user"),
        "dept-a-rd": _seed_position(db, org_code="dept-a-rd", title="A RD Position", created_by="dept-user"),
        "dept-a-fin": _seed_position(db, org_code="dept-a-fin", title="A FIN Position", created_by="company-a-admin"),
        "company-b": _seed_position(db, org_code="company-b", title="Company B Position", created_by="company-b-admin"),
        "company-c": _seed_position(db, org_code="company-c", title="Company C Position", created_by="group-admin"),
    }
    candidates = {
        "group": _seed_candidate(db, org_code="group", position_id=positions["group"].id, name="Group Candidate", created_by="group-admin"),
        "company-a": _seed_candidate(db, org_code="company-a", position_id=positions["company-a"].id, name="Company A Candidate", created_by="company-a-admin"),
        "company-a-self": _seed_candidate(db, org_code="company-a", position_id=positions["company-a-self"].id, name="Company A Self Candidate", created_by="self-user"),
        "dept-a-rd": _seed_candidate(db, org_code="dept-a-rd", position_id=positions["dept-a-rd"].id, name="A RD Candidate", created_by="dept-user"),
        "dept-a-fin": _seed_candidate(db, org_code="dept-a-fin", position_id=positions["dept-a-fin"].id, name="A FIN Candidate", created_by="company-a-admin"),
        "company-b": _seed_candidate(db, org_code="company-b", position_id=positions["company-b"].id, name="Company B Candidate", created_by="company-b-admin"),
        "company-c": _seed_candidate(db, org_code="company-c", position_id=positions["company-c"].id, name="Company C Candidate", created_by="group-admin"),
    }
    talent_pool_candidate = _seed_candidate(
        db,
        org_code="company-a",
        position_id=positions["company-a"].id,
        name="Company A Talent Pool Candidate",
        created_by="company-a-admin",
    )
    talent_pool_candidate.position_id = None
    talent_pool_candidate.status = "talent_pool"
    talent_pool_candidate.talent_pool_reason = "moved_by_hr"
    candidates["company-a-talent-pool"] = talent_pool_candidate
    db.commit()
    return {
        "positions": {key: row.id for key, row in positions.items()},
        "candidates": {key: row.id for key, row in candidates.items()},
    }


def _headers(env, user_key: str) -> Dict[str, str]:
    with env["session_factory"]() as db:
        user_code = env["users"][user_key]
        user = db.query(ScriptHubUser).filter(ScriptHubUser.user_code == user_code).one()
        token = create_script_hub_session(serialize_user_session(db, user))["token"]
    return {"Authorization": f"Bearer {token}"}


def _raw_headers(session: Dict[str, Any]) -> Dict[str, str]:
    return {"Authorization": f"Bearer {create_script_hub_session(session)['token']}"}


def _data(response):
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _orgs(items):
    return {item["org_code"] for item in items}


def _candidate_names(items):
    rows = items.get("items", []) if isinstance(items, dict) else items
    return {item["name"] for item in rows}


def _overview_user(response, user_code: str) -> Dict[str, Any]:
    users = response.json()["users"]
    return next(item for item in users if item["user_code"] == user_code)


def test_data_scope_enforces_lists_and_detail_endpoints(permission_app):
    client = permission_app["client"]
    resources = permission_app["resources"]

    group_positions = _data(client.get("/recruitment/positions", headers=_headers(permission_app, "group_admin")))
    assert _orgs(group_positions) == {"group", "company-a", "dept-a-rd", "dept-a-fin", "company-b", "company-c"}

    company_a_positions = _data(client.get("/recruitment/positions", headers=_headers(permission_app, "company_a_admin")))
    assert _orgs(company_a_positions) == {"company-a", "dept-a-rd", "dept-a-fin"}
    assert client.get(f"/recruitment/positions/{resources['positions']['company-b']}", headers=_headers(permission_app, "company_a_admin")).status_code == 403

    company_b_positions = _data(client.get("/recruitment/positions", headers=_headers(permission_app, "company_b_admin")))
    assert _orgs(company_b_positions) == {"company-b"}
    assert client.get(f"/recruitment/candidates/{resources['candidates']['dept-a-rd']}", headers=_headers(permission_app, "company_b_admin")).status_code == 403

    dept_positions = _data(client.get("/recruitment/positions", headers=_headers(permission_app, "dept_user")))
    assert _orgs(dept_positions) == {"dept-a-rd"}

    self_candidates = _data(client.get("/recruitment/candidates", headers=_headers(permission_app, "self_user")))
    assert _candidate_names(self_candidates) == {"Company A Self Candidate"}
    self_candidate_items = self_candidates["items"]
    assert len(self_candidate_items) == 1
    assert self_candidate_items[0]["created_by"] == "self-user"
    assert "updated_by" in self_candidate_items[0]
    assert client.get(f"/recruitment/candidates/{resources['candidates']['company-a']}", headers=_headers(permission_app, "self_user")).status_code == 403

    cross_positions = _data(client.get("/recruitment/positions", headers=_headers(permission_app, "cross_admin")))
    assert _orgs(cross_positions) == {"company-a", "company-b"}

    assert client.get("/recruitment/positions", headers=_headers(permission_app, "no_perm_user")).status_code == 403


def test_functional_permission_points_gate_direct_api_calls(permission_app, monkeypatch):
    client = permission_app["client"]
    candidate_id = permission_app["resources"]["candidates"]["company-a"]
    position_id = permission_app["resources"]["positions"]["company-a"]

    assert client.get("/recruitment/dashboard", headers=_headers(permission_app, "viewer")).status_code == 200
    assert client.get("/recruitment/dashboard", headers=_headers(permission_app, "no_perm_user")).status_code == 403

    assert client.get("/recruitment/candidates/talent-pool", headers=_headers(permission_app, "talent_pool_viewer")).status_code == 200
    assert client.get("/recruitment/candidates/talent-pool", headers=_headers(permission_app, "viewer")).status_code == 403
    assert client.get("/recruitment/dashboard", headers=_headers(permission_app, "talent_pool_viewer")).status_code == 403
    talent_pool_candidate_id = permission_app["resources"]["candidates"]["company-a-talent-pool"]
    assert client.get(f"/recruitment/candidates/talent-pool/{talent_pool_candidate_id}", headers=_headers(permission_app, "talent_pool_viewer")).status_code == 200
    assert client.get(f"/recruitment/candidates/{talent_pool_candidate_id}", headers=_headers(permission_app, "talent_pool_viewer")).status_code == 403
    assert client.get(f"/recruitment/candidates/talent-pool/{candidate_id}", headers=_headers(permission_app, "talent_pool_viewer")).status_code == 404

    assert client.get("/recruitment/metadata", headers=_headers(permission_app, "assistant_viewer")).status_code == 200
    assert client.get("/recruitment/chat/context", headers=_headers(permission_app, "assistant_viewer")).status_code == 200
    assert client.post("/recruitment/chat/context", headers=_headers(permission_app, "assistant_viewer"), json={"position_id": None, "candidate_id": None, "skill_ids": []}).status_code == 200
    assert client.get("/recruitment/dashboard", headers=_headers(permission_app, "assistant_viewer")).status_code == 403

    create_position_payload = {"org_code": "company-a", "title": "Created By Position Manager", "headcount": 1}
    assert client.post("/recruitment/positions", headers=_headers(permission_app, "viewer"), json=create_position_payload).status_code == 403
    assert client.post("/recruitment/positions", headers=_headers(permission_app, "company_a_admin"), json=create_position_payload).status_code == 200

    assert client.patch(f"/recruitment/candidates/{candidate_id}", headers=_headers(permission_app, "viewer"), json={"notes": "blocked"}).status_code == 403
    assert client.patch(f"/recruitment/candidates/{candidate_id}", headers=_headers(permission_app, "company_a_admin"), json={"notes": "allowed"}).status_code == 200

    assert client.get("/recruitment/skills", headers=_headers(permission_app, "skill_viewer")).status_code == 200
    assert client.post("/recruitment/skills", headers=_headers(permission_app, "skill_viewer"), json={"name": "Blocked", "content": "rule"}).status_code == 403
    assert client.patch(f"/recruitment/positions/{position_id}", headers=_headers(permission_app, "skill_binder"), json={"screening_skill_ids": []}).status_code == 200
    assert client.patch(f"/recruitment/positions/{position_id}", headers=_headers(permission_app, "skill_binder"), json={"title": "Must Not Edit Title"}).status_code == 403

    assert client.post("/recruitment/mail-senders", headers=_headers(permission_app, "mail_viewer"), json={"org_code": "company-a", "name": "SMTP", "from_email": "a@example.com", "smtp_host": "smtp.example.com", "username": "u"}).status_code == 403
    assert client.post("/recruitment/mail-senders", headers=_headers(permission_app, "mail_sender_manager"), json={"org_code": "company-a", "name": "SMTP", "from_email": "a@example.com", "smtp_host": "smtp.example.com", "username": "u"}).status_code == 200
    assert client.post("/recruitment/mail-recipients", headers=_headers(permission_app, "mail_config_manager"), json={"org_code": "company-a", "name": "Recipient", "email": "r@example.com"}).status_code == 200

    monkeypatch.setattr(recruitment.RecruitmentService, "send_resume_mail_dispatch", lambda self, payload, actor_id: {"sent_count": 1, "actor_id": actor_id})
    assert client.post("/recruitment/resume-mail-dispatches/send", headers=_headers(permission_app, "mail_viewer"), json={"candidate_ids": [candidate_id]}).status_code == 403
    assert client.post("/recruitment/resume-mail-dispatches/send", headers=_headers(permission_app, "mail_sender"), json={"candidate_ids": [candidate_id]}).status_code == 200

    assert client.get("/recruitment/llm-configs", headers=_headers(permission_app, "llm_viewer")).status_code == 200
    assert client.post("/recruitment/llm-configs", headers=_headers(permission_app, "llm_viewer"), json={"config_key": "blocked", "provider": "openai-compatible", "model_name": "m"}).status_code == 403
    assert client.post("/recruitment/llm-configs", headers=_headers(permission_app, "llm_manager"), json={"config_key": "allowed", "org_code": "company-a", "provider": "openai-compatible", "model_name": "m"}).status_code == 200

    assert client.get("/admin/rbac/overview", headers=_headers(permission_app, "viewer")).status_code == 403
    assert client.get("/admin/rbac/overview", headers=_headers(permission_app, "rbac_manager")).status_code == 200
    for path in (
        "/admin/rbac/catalog",
        "/admin/rbac/summary",
        "/admin/rbac/users?page=1&page_size=10",
        "/admin/rbac/roles",
        "/admin/rbac/organizations",
        "/admin/rbac/audit-logs?page=1&page_size=10",
    ):
        assert client.get(path, headers=_headers(permission_app, "viewer")).status_code == 403
        assert client.get(path, headers=_headers(permission_app, "rbac_manager")).status_code == 200

    user_detail = client.get(
        "/admin/rbac/users/rbac-manager",
        headers=_headers(permission_app, "rbac_manager"),
    )
    assert user_detail.status_code == 200
    assert user_detail.json()["user_code"] == "rbac-manager"

    org_users = client.get(
        "/admin/rbac/organizations/company-a/users?page=1&page_size=2",
        headers=_headers(permission_app, "rbac_manager"),
    )
    assert org_users.status_code == 200
    assert org_users.json()["page_size"] == 2
    assert org_users.json()["total_count"] >= 2


def test_authorization_boundary_blocks_cross_org_and_overpowered_grants(permission_app):
    client = permission_app["client"]

    forbidden_org = client.post(
        "/admin/rbac/users",
        headers=_headers(permission_app, "company_a_admin"),
        json={
            "user_code": "company-b-created-by-a",
            "display_name": "Bad B User",
            "primary_org_code": "company-b",
            "data_scope": DATA_SCOPE_ORG_ONLY,
            "role_codes": ["e2e-viewer"],
        },
    )
    assert forbidden_org.status_code == 403

    forbidden_role = client.post(
        "/admin/rbac/users",
        headers=_headers(permission_app, "company_a_admin"),
        json={
            "user_code": "company-a-admin-overgrant",
            "display_name": "Bad Admin",
            "primary_org_code": "company-a",
            "data_scope": DATA_SCOPE_ORG_ONLY,
            "role_codes": ["admin"],
        },
    )
    assert forbidden_role.status_code == 403

    forbidden_scope = client.post(
        "/admin/rbac/users",
        headers=_headers(permission_app, "company_a_admin"),
        json={
            "user_code": "company-a-wide-overgrant",
            "display_name": "Bad Wide",
            "primary_org_code": "company-a",
            "data_scope": DATA_SCOPE_ORG_AND_CHILDREN,
            "role_codes": ["e2e-viewer"],
        },
    )
    assert forbidden_scope.status_code == 403

    forbidden_super_admin = client.post(
        "/admin/rbac/users",
        headers=_headers(permission_app, "company_a_admin"),
        json={
            "user_code": "company-a-super-overgrant",
            "display_name": "Bad Super",
            "primary_org_code": "company-a",
            "data_scope": DATA_SCOPE_ORG_ONLY,
            "role_codes": ["e2e-viewer"],
            "is_super_admin": True,
        },
    )
    assert forbidden_super_admin.status_code == 403

    forbidden_custom_org = client.post(
        "/admin/rbac/users",
        headers=_headers(permission_app, "company_a_admin"),
        json={
            "user_code": "company-a-custom-overgrant",
            "display_name": "Bad Custom",
            "primary_org_code": "company-a",
            "data_scope": DATA_SCOPE_CUSTOM_ORGS,
            "custom_org_codes": ["company-b"],
            "role_codes": ["e2e-viewer"],
        },
    )
    assert forbidden_custom_org.status_code == 403

    forbidden_target_boundary = client.post(
        "/admin/rbac/users",
        headers=_headers(permission_app, "company_a_admin"),
        json={
            "user_code": "company-a-boundary-overgrant",
            "display_name": "Bad Boundary",
            "primary_org_code": "company-a",
            "data_scope": DATA_SCOPE_ORG_ONLY,
            "role_codes": ["e2e-viewer"],
            "authorization_boundary": {
                "can_grant": True,
                "managed_org_codes": ["company-b"],
                "assignable_role_codes": ["e2e-viewer"],
                "assignable_permission_keys": ["recruitment-dashboard-view"],
                "max_data_scope": DATA_SCOPE_ORG_ONLY,
            },
        },
    )
    assert forbidden_target_boundary.status_code == 403

    forbidden_role_create = client.post(
        "/admin/rbac/roles",
        headers=_headers(permission_app, "company_a_admin"),
        json={
            "code": "company-a-rbac-overgrant",
            "name": "Bad Role",
            "permission_keys": ["rbac-manage"],
        },
    )
    assert forbidden_role_create.status_code == 403

    assert client.get(
        "/admin/rbac/organizations/company-b/users",
        headers=_headers(permission_app, "company_a_admin"),
    ).status_code == 403
    assert client.post(
        "/admin/rbac/users/company-b-admin/rotate-key",
        headers=_headers(permission_app, "company_a_admin"),
        json={},
    ).status_code == 403
    assert client.delete(
        "/admin/rbac/users/company-b-admin",
        headers=_headers(permission_app, "company_a_admin"),
    ).status_code == 403
    assert client.delete(
        "/admin/rbac/roles/e2e-rbac-manager",
        headers=_headers(permission_app, "company_a_admin"),
    ).status_code == 403

    high_privilege_same_org = client.post(
        "/admin/rbac/users",
        headers=_headers(permission_app, "group_admin"),
        json={
            "user_code": "company-a-high-target",
            "display_name": "High Target",
            "primary_org_code": "company-a",
            "data_scope": DATA_SCOPE_ORG_AND_CHILDREN,
            "role_codes": ["e2e-company-admin"],
        },
    )
    assert high_privilege_same_org.status_code == 200, high_privilege_same_org.text
    assert client.post(
        "/admin/rbac/users/company-a-high-target/rotate-key",
        headers=_headers(permission_app, "company_a_admin"),
        json={},
    ).status_code == 403
    assert client.delete(
        "/admin/rbac/users/company-a-high-target",
        headers=_headers(permission_app, "company_a_admin"),
    ).status_code == 403

    group_rotate = client.post(
        "/admin/rbac/users/company-a-high-target/rotate-key",
        headers=_headers(permission_app, "group_admin"),
        json={},
    )
    assert group_rotate.status_code == 200, group_rotate.text
    group_delete = client.delete(
        "/admin/rbac/users/company-a-high-target",
        headers=_headers(permission_app, "group_admin"),
    )
    assert group_delete.status_code == 200, group_delete.text

    company_overview = client.get("/admin/rbac/overview", headers=_headers(permission_app, "company_a_admin"))
    assert company_overview.status_code == 200, company_overview.text
    company_catalog = company_overview.json()["catalog"]
    assert "company-b-admin" not in {item["user_code"] for item in company_overview.json()["users"]}
    assert "company-b" not in {item["org_code"] for item in company_catalog["organizations"]}

    allowed = client.post(
        "/admin/rbac/users",
        headers=_headers(permission_app, "company_a_admin"),
        json={
            "user_code": "company-a-allowed-grant",
            "display_name": "Allowed User",
            "primary_org_code": "company-a",
            "data_scope": DATA_SCOPE_ORG_ONLY,
            "role_codes": ["e2e-viewer"],
            "granted_permissions": ["recruitment-dashboard-view"],
        },
    )
    assert allowed.status_code == 200, allowed.text

    group_allowed = client.post(
        "/admin/rbac/users",
        headers=_headers(permission_app, "group_admin"),
        json={
            "user_code": "company-b-granted-by-group",
            "display_name": "Group Granted",
            "primary_org_code": "company-b",
            "data_scope": DATA_SCOPE_ORG_ONLY,
            "role_codes": ["e2e-viewer"],
        },
    )
    assert group_allowed.status_code == 200, group_allowed.text


def test_optimistic_locking_rejects_stale_permission_mutation(permission_app):
    client = permission_app["client"]
    overview = client.get("/admin/rbac/overview", headers=_headers(permission_app, "group_admin"))
    target = _overview_user(overview, "dept-user")
    version = target["permission_version"]

    first = client.patch(
        "/admin/rbac/users/dept-user",
        headers=_headers(permission_app, "group_admin"),
        json={"expected_permission_version": version, "notes": "first commit"},
    )
    assert first.status_code == 200, first.text

    stale = client.patch(
        "/admin/rbac/users/dept-user",
        headers=_headers(permission_app, "group_admin"),
        json={"expected_permission_version": version, "notes": "stale overwrite"},
    )
    assert stale.status_code == 409

    refreshed = _overview_user(client.get("/admin/rbac/overview", headers=_headers(permission_app, "group_admin")), "dept-user")
    assert refreshed["notes"] == "first commit"


def test_rotated_access_key_invalidates_existing_token(permission_app):
    client = permission_app["client"]
    stale_headers = _headers(permission_app, "viewer")

    assert client.get("/recruitment/dashboard", headers=stale_headers).status_code == 200
    rotated = client.post(
        "/admin/rbac/users/viewer-user/rotate-key",
        headers=_headers(permission_app, "group_admin"),
        json={},
    )
    assert rotated.status_code == 200, rotated.text
    assert client.get("/auth/session", headers=stale_headers).status_code == 401
    assert client.get("/recruitment/dashboard", headers=stale_headers).status_code == 401

    login = client.post("/auth/session", json={"key": rotated.json()["generated_access_key"]})
    assert login.status_code == 200, login.text
    refreshed_headers = {"Authorization": f"Bearer {login.json()['token']}"}
    assert client.get("/recruitment/dashboard", headers=refreshed_headers).status_code == 200


def test_data_scope_downgrade_requires_confirmation_and_immediately_changes_visibility(permission_app):
    client = permission_app["client"]
    with permission_app["session_factory"]() as db:
        before_org = db.query(RecruitmentPosition).filter(RecruitmentPosition.id == permission_app["resources"]["positions"]["dept-a-rd"]).one().org_code

    assert "dept-a-rd" in _orgs(_data(client.get("/recruitment/positions", headers=_headers(permission_app, "company_a_admin"))))
    overview = client.get("/admin/rbac/overview", headers=_headers(permission_app, "group_admin"))
    target = _overview_user(overview, "company-a-admin")

    rejected = client.patch(
        "/admin/rbac/users/company-a-admin",
        headers=_headers(permission_app, "group_admin"),
        json={"expected_permission_version": target["permission_version"], "data_scope": DATA_SCOPE_ORG_ONLY},
    )
    assert rejected.status_code == 400

    accepted = client.patch(
        "/admin/rbac/users/company-a-admin",
        headers=_headers(permission_app, "group_admin"),
        json={"expected_permission_version": target["permission_version"], "data_scope": DATA_SCOPE_ORG_ONLY, "data_scope_downgrade_confirmed": True},
    )
    assert accepted.status_code == 200, accepted.text
    assert _orgs(_data(client.get("/recruitment/positions", headers=_headers(permission_app, "company_a_admin")))) == {"company-a"}

    upgraded_version = accepted.json()["user"]["permission_version"]
    upgraded = client.patch(
        "/admin/rbac/users/company-a-admin",
        headers=_headers(permission_app, "group_admin"),
        json={"expected_permission_version": upgraded_version, "data_scope": DATA_SCOPE_ORG_AND_CHILDREN},
    )
    assert upgraded.status_code == 200, upgraded.text
    assert "dept-a-rd" in _orgs(_data(client.get("/recruitment/positions", headers=_headers(permission_app, "company_a_admin"))))

    with permission_app["session_factory"]() as db:
        after_org = db.query(RecruitmentPosition).filter(RecruitmentPosition.id == permission_app["resources"]["positions"]["dept-a-rd"]).one().org_code
    assert after_org == before_org == "dept-a-rd"

    audit_actions = [item["action"] for item in client.get("/admin/rbac/overview", headers=_headers(permission_app, "group_admin")).json()["audit_logs"]]
    assert "user.update" in audit_actions


def test_resource_sharing_for_skill_mail_and_llm_respects_visibility_edit_and_copy_rules(permission_app):
    client = permission_app["client"]
    group_headers = _headers(permission_app, "group_admin")
    company_headers = _headers(permission_app, "company_a_admin")

    private_skill = _data(client.post("/recruitment/skills", headers=group_headers, json={"org_code": "group", "name": "G Private Skill", "content": "private"}))
    readonly_skill = _data(client.post("/recruitment/skills", headers=group_headers, json={"org_code": "group", "name": "G Read Skill", "content": "read", "share_policy": "SHARED_READONLY", "allow_sub_org_use": True}))
    copyable_skill = _data(client.post("/recruitment/skills", headers=group_headers, json={"org_code": "group", "name": "G Copy Skill", "content": "copy", "share_policy": "SHARED_COPYABLE", "allow_sub_org_use": True, "allow_copy": True}))

    visible_skill_names = {item["name"] for item in _data(client.get("/recruitment/skills", headers=company_headers))}
    assert "G Private Skill" not in visible_skill_names
    assert {"G Read Skill", "G Copy Skill"}.issubset(visible_skill_names)
    assert client.patch(f"/recruitment/skills/{readonly_skill['id']}", headers=company_headers, json={"name": "G Read Skill", "content": "bad edit"}).status_code in {403, 404}
    copied_skill = _data(client.post(f"/recruitment/resource-governance/skill/{copyable_skill['id']}/copy", headers=company_headers, json={"target_org_code": "company-a"}))
    assert copied_skill["org_code"] == "company-a"
    assert client.post(f"/recruitment/resource-governance/skill/{readonly_skill['id']}/copy", headers=company_headers, json={"target_org_code": "company-a"}).status_code == 403

    tightened = client.patch(f"/recruitment/resource-governance/skill/{readonly_skill['id']}", headers=group_headers, json={"share_policy": "PRIVATE", "allow_sub_org_use": False})
    assert tightened.status_code == 200, tightened.text
    assert "G Read Skill" not in {item["name"] for item in _data(client.get("/recruitment/skills", headers=company_headers))}

    for kind, create_path, list_path, payload, label in [
        ("model", "/recruitment/llm-configs", "/recruitment/llm-configs", {"config_key": "g-llm-copy", "org_code": "group", "provider": "openai-compatible", "model_name": "m", "share_policy": "SHARED_COPYABLE", "allow_sub_org_use": True, "allow_copy": True}, "config_key"),
        ("mail-sender", "/recruitment/mail-senders", "/recruitment/mail-senders", {"org_code": "group", "name": "G SMTP Copy", "from_email": "g@example.com", "smtp_host": "smtp.example.com", "username": "g", "share_policy": "SHARED_COPYABLE", "allow_sub_org_use": True, "allow_copy": True}, "name"),
    ]:
        created = _data(client.post(create_path, headers=group_headers, json=payload))
        visible = _data(client.get(list_path, headers=company_headers))
        assert created[label] in {item[label] for item in visible}
        copied = _data(client.post(f"/recruitment/resource-governance/{kind}/{created['id']}/copy", headers=company_headers, json={"target_org_code": "company-a"}))
        assert copied["org_code"] == "company-a"


def test_audit_visibility_sensitive_redaction_and_failed_actions(permission_app):
    client = permission_app["client"]
    group_headers = _headers(permission_app, "group_admin")
    company_headers = _headers(permission_app, "company_a_admin")

    client.post("/recruitment/llm-configs", headers=group_headers, json={"config_key": "sensitive-audit", "org_code": "company-a", "provider": "openai-compatible", "model_name": "m", "api_key_value": "secret-key"})
    client.post("/admin/rbac/users", headers=company_headers, json={"user_code": "bad-b-audit", "display_name": "Bad", "primary_org_code": "company-b", "data_scope": DATA_SCOPE_ORG_ONLY, "role_codes": ["e2e-viewer"]})

    group_logs = client.get("/admin/rbac/overview", headers=group_headers).json()["audit_logs"]
    company_logs = client.get("/admin/rbac/overview", headers=company_headers).json()["audit_logs"]

    assert any(item["action"] == "recruitment.llm-config.create" and item["sensitivity"] == "sensitive" for item in group_logs)
    assert any(item["action"] == "user.create" and item["result"] == "failed" for item in group_logs)
    assert not any(item.get("target_org_code") == "company-b" for item in company_logs)

    sensitive_for_company = next(item for item in company_logs if item["action"] == "recruitment.llm-config.create")
    assert sensitive_for_company["details"] == {"sensitive": "***redacted***"}

    with permission_app["session_factory"]() as db:
        script_hub_audit_service.write_audit_log(db, actor=serialize_user_session(db, db.query(ScriptHubUser).filter(ScriptHubUser.user_code == "self-user").one()), request=None, action="self.note", target_type="note", target_code="self", target_org_code="company-a", details={"ok": True})
        self_session = serialize_user_session(db, db.query(ScriptHubUser).filter(ScriptHubUser.user_code == "self-user").one())
        self_logs = script_hub_audit_service.list_recent_audit_logs_for_session(db, session=self_session)
    assert {item["actor_user_code"] for item in self_logs} == {"self-user"}


def test_user_disable_delete_and_role_changes_take_effect_for_existing_tokens(permission_app):
    client = permission_app["client"]
    stale_headers = _headers(permission_app, "viewer")

    assert client.get("/recruitment/dashboard", headers=stale_headers).status_code == 200
    overview = client.get("/admin/rbac/overview", headers=_headers(permission_app, "group_admin"))
    viewer = _overview_user(overview, "viewer-user")
    disabled = client.patch(
        "/admin/rbac/users/viewer-user",
        headers=_headers(permission_app, "group_admin"),
        json={"expected_permission_version": viewer["permission_version"], "is_active": False},
    )
    assert disabled.status_code == 200, disabled.text
    assert client.get("/recruitment/dashboard", headers=stale_headers).status_code == 401

    deleted_headers = _headers(permission_app, "dept_user")
    assert client.get("/recruitment/dashboard", headers=deleted_headers).status_code == 200
    deleted = client.delete("/admin/rbac/users/dept-user", headers=_headers(permission_app, "group_admin"))
    assert deleted.status_code == 200, deleted.text
    assert client.get("/recruitment/dashboard", headers=deleted_headers).status_code == 401


def test_legacy_aliases_work_only_through_alias_resolver_and_no_route_raw_checks(permission_app):
    client = permission_app["client"]
    assert client.get("/recruitment/dashboard", headers=_headers(permission_app, "legacy_view")).status_code == 200
    assert client.get("/recruitment/candidates/talent-pool", headers=_headers(permission_app, "legacy_view")).status_code == 200
    assert client.get("/recruitment/chat/context", headers=_headers(permission_app, "legacy_view")).status_code == 200
    assert client.patch(f"/recruitment/candidates/{permission_app['resources']['candidates']['company-a']}", headers=_headers(permission_app, "legacy_view"), json={"notes": "legacy candidate manage"}).status_code == 200
    assert client.post("/recruitment/positions", headers=_headers(permission_app, "legacy_manage"), json={"org_code": "company-a", "title": "Legacy Manage Position", "headcount": 1}).status_code == 200

    forbidden_direct_checks = []
    root = Path(__file__).resolve().parents[1] / "app"
    allowed_files = {
        root / "permission_governance.py",
        root / "rbac_catalog.py",
    }
    for path in root.rglob("*.py"):
        if path in allowed_files:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func_name = getattr(node.func, "id", "") or getattr(node.func, "attr", "")
            if func_name not in {"require_script_hub_permission", "require_script_hub_any_permission", "has_permission", "has_any_permission"}:
                continue
            if "ai-recruitment" in ast.unparse(node):
                forbidden_direct_checks.append(f"{path.relative_to(root)}:{node.lineno}:{ast.unparse(node)}")
    assert forbidden_direct_checks == []
