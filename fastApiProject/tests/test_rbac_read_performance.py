import inspect
import json

from pydantic import TypeAdapter
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.permission_governance import DATA_SCOPE_ALL, DATA_SCOPE_ORG_ONLY
from app.rbac_models import (
    ScriptHubAuditLog,
    ScriptHubOrganization,
    ScriptHubPermission,
    ScriptHubRole,
    ScriptHubRolePermission,
    ScriptHubUser,
    ScriptHubUserPermission,
    ScriptHubUserRole,
)
from app.rbac_schemas import (
    ScriptHubRbacAuditLogsResponse,
    ScriptHubRbacOverviewResponse,
    ScriptHubRbacSummaryResponse,
    ScriptHubRbacUsersResponse,
)
from app.routers import auth_rbac
from app.routers.auth_rbac import (
    create_auth_session,
    get_rbac_catalog_endpoint,
    get_rbac_organization_users_endpoint,
    get_rbac_overview,
    get_rbac_summary_endpoint,
    get_rbac_user_endpoint,
    list_rbac_audit_logs_endpoint,
    list_rbac_organizations_endpoint,
    list_rbac_roles_endpoint,
    list_rbac_users_endpoint,
    verify_auth_session,
)
from app.services.script_hub_admin_service import (
    RBAC_CONFIG_PERMISSION_KEYS,
    get_org_users,
    get_rbac_summary,
    get_rbac_user,
    list_rbac_audit_logs,
    list_rbac_organizations,
    list_rbac_overview,
    list_rbac_users,
    serialize_admin_role,
    serialize_admin_user,
)
from app.services.script_hub_audit_service import list_recent_audit_logs_for_session


RBAC_TABLES = [
    ScriptHubPermission.__table__,
    ScriptHubRole.__table__,
    ScriptHubRolePermission.__table__,
    ScriptHubOrganization.__table__,
    ScriptHubUser.__table__,
    ScriptHubUserRole.__table__,
    ScriptHubUserPermission.__table__,
    ScriptHubAuditLog.__table__,
]


def _create_session(user_count: int):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine, tables=RBAC_TABLES)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = session_factory()
    _seed_rbac_data(db, user_count)
    return engine, db


def _seed_rbac_data(db, user_count: int) -> None:
    permission_keys = [
        "rbac-manage",
        "audit-log-view",
        "ai-recruitment-manage",
        *sorted(RBAC_CONFIG_PERMISSION_KEYS),
    ]
    permissions = {}
    for index, permission_key in enumerate(permission_keys):
        permission = ScriptHubPermission(
            permission_key=permission_key,
            name=permission_key,
            category="test",
            description=f"Permission {permission_key}",
            sort_order=index,
            is_active=True,
        )
        db.add(permission)
        permissions[permission_key] = permission

    roles = {
        "admin": ScriptHubRole(
            role_code="admin",
            name="Admin",
            sort_order=1,
            is_system=True,
            is_active=True,
        ),
        "config": ScriptHubRole(
            role_code="config",
            name="Config Manager",
            sort_order=2,
            is_system=False,
            is_active=True,
        ),
        "viewer": ScriptHubRole(
            role_code="viewer",
            name="Viewer",
            sort_order=3,
            is_system=False,
            is_active=True,
        ),
        "legacy": ScriptHubRole(
            role_code="legacy",
            name="Legacy Recruitment Manager",
            sort_order=4,
            is_system=False,
            is_active=True,
        ),
    }
    db.add_all(list(roles.values()))
    db.flush()
    for permission_key in RBAC_CONFIG_PERMISSION_KEYS:
        db.add(
            ScriptHubRolePermission(
                role_id=roles["config"].id,
                permission_id=permissions[permission_key].id,
            )
        )
    db.add(
        ScriptHubRolePermission(
            role_id=roles["viewer"].id,
            permission_id=permissions["rbac-manage"].id,
        )
    )
    db.add(
        ScriptHubRolePermission(
            role_id=roles["legacy"].id,
            permission_id=permissions["ai-recruitment-manage"].id,
        )
    )

    db.add_all(
        [
            ScriptHubOrganization(
                org_code="group",
                name="Group",
                org_type="group",
                parent_org_code=None,
                path="group",
                sort_order=1,
                is_active=True,
            ),
            ScriptHubOrganization(
                org_code="company-a",
                name="Company A",
                org_type="company",
                parent_org_code="group",
                path="group/company-a",
                sort_order=2,
                is_active=True,
            ),
            ScriptHubOrganization(
                org_code="company-b",
                name="Company B",
                org_type="company",
                parent_org_code="group",
                path="group/company-b",
                sort_order=3,
                is_active=True,
            ),
        ]
    )

    users = []
    for index in range(user_count):
        role_code = (
            "admin"
            if index == 0
            else "legacy"
            if index in {5, 9}
            else "config"
            if index % 2 == 0
            else "viewer"
        )
        primary_org_code = "company-a" if index % 2 == 0 else "company-b"
        custom_org_codes = ["company-a"] if index == 1 else []
        user = ScriptHubUser(
            user_code=f"user-{index:03d}",
            display_name=f"User {index:03d}",
            access_key_lookup_hash=f"lookup-{index:03d}",
            access_key_salt=f"salt-{index:03d}",
            access_key_hash=f"hash-{index:03d}",
            primary_org_code=primary_org_code,
            data_scope=DATA_SCOPE_ORG_ONLY,
            custom_org_codes_json=json.dumps(custom_org_codes),
            authorization_boundary_json="{}",
            permission_version=1,
            access_key_version=1,
            team_resources_access_enabled=index % 2 == 0,
            is_super_admin=index == 0,
            is_active=index % 5 != 4,
            notes=f"Note {index:03d}",
        )
        db.add(user)
        db.flush()
        db.add(ScriptHubUserRole(user_id=user.id, role_id=roles[role_code].id))
        users.append(user)

    if user_count > 2:
        revoked_key = sorted(RBAC_CONFIG_PERMISSION_KEYS)[0]
        db.add(
            ScriptHubUserPermission(
                user_id=users[2].id,
                permission_id=permissions[revoked_key].id,
                is_granted=False,
            )
        )
    if user_count > 3:
        granted_key = sorted(RBAC_CONFIG_PERMISSION_KEYS)[0]
        db.add(
            ScriptHubUserPermission(
                user_id=users[3].id,
                permission_id=permissions[granted_key].id,
                is_granted=True,
            )
        )
    if user_count > 7:
        db.add(
            ScriptHubUserPermission(
                user_id=users[7].id,
                permission_id=permissions["ai-recruitment-manage"].id,
                is_granted=True,
            )
        )
    if user_count > 9:
        db.add(
            ScriptHubUserPermission(
                user_id=users[9].id,
                permission_id=permissions["ai-recruitment-manage"].id,
                is_granted=False,
            )
        )

    for index in range(12):
        db.add(
            ScriptHubAuditLog(
                actor_user_code=f"user-{index % max(1, user_count):03d}",
                actor_display_name=f"User {index % max(1, user_count):03d}",
                action="user.update" if index % 2 == 0 else "role.update",
                target_type="user" if index % 2 == 0 else "role",
                target_code=f"target-{index:03d}",
                target_org_code="company-a" if index % 3 != 1 else "company-b",
                sensitivity="sensitive" if index == 0 else "normal",
                result="failed" if index == 5 else "success",
                details=json.dumps({"index": index}),
            )
        )
    db.commit()


def _all_scope_actor():
    return {
        "id": "user-000",
        "role": "admin",
        "roles": ["admin"],
        "isSuperAdmin": True,
        "primaryOrgCode": "group",
        "dataScope": DATA_SCOPE_ALL,
        "permissions": {
            "rbac-manage": True,
            "audit-log-view": True,
            "audit-log-sensitive-view": True,
        },
    }


def _company_a_actor():
    return {
        "id": "user-000",
        "role": "viewer",
        "roles": ["viewer"],
        "isSuperAdmin": False,
        "primaryOrgCode": "company-a",
        "dataScope": DATA_SCOPE_ORG_ONLY,
        "permissions": {
            "rbac-manage": True,
            "audit-log-view": True,
        },
    }


def test_rbac_overview_sql_count_is_constant_and_excludes_access_key_columns():
    query_counts = []
    for user_count in (15, 60):
        engine, db = _create_session(user_count)
        statements = []

        def capture_statement(_conn, _cursor, statement, _parameters, _context, _executemany):
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", capture_statement)
        try:
            overview = list_rbac_overview(db, actor=_all_scope_actor())
            TypeAdapter(ScriptHubRbacOverviewResponse).validate_python(overview)
        finally:
            event.remove(engine, "before_cursor_execute", capture_statement)
            db.close()
            engine.dispose()

        query_counts.append(len(statements))
        assert len(overview["users"]) == user_count
        assert len(statements) <= 12
        normalized_sql = "\n".join(statements).lower()
        assert "access_key_lookup_hash" not in normalized_sql
        assert "access_key_salt" not in normalized_sql
        assert "access_key_hash" not in normalized_sql

    assert query_counts[0] == query_counts[1]


def test_batched_overview_keeps_legacy_role_user_and_audit_payloads():
    engine, db = _create_session(8)
    actor = _all_scope_actor()
    try:
        overview = list_rbac_overview(db, actor=actor)
        role_rows = (
            db.query(ScriptHubRole)
            .filter(ScriptHubRole.is_deleted.is_(False))
            .order_by(
                ScriptHubRole.is_active.desc(),
                ScriptHubRole.is_system.desc(),
                ScriptHubRole.sort_order.asc(),
                ScriptHubRole.role_code.asc(),
            )
            .all()
        )
        user_rows = (
            db.query(ScriptHubUser)
            .filter(ScriptHubUser.is_deleted.is_(False))
            .order_by(ScriptHubUser.created_at.asc(), ScriptHubUser.user_code.asc())
            .all()
        )
        assert overview["catalog"]["roles"] == [
            serialize_admin_role(db, role) for role in role_rows
        ]
        assert overview["users"] == [
            serialize_admin_user(db, user) for user in user_rows
        ]
        assert overview["audit_logs"] == list_recent_audit_logs_for_session(
            db,
            session=actor,
            limit=60,
        )
    finally:
        db.close()
        engine.dispose()


def test_rbac_users_server_pagination_search_and_filters_keep_correct_totals():
    engine, db = _create_session(30)
    try:
        second_page = list_rbac_users(
            db,
            actor=_all_scope_actor(),
            page=2,
            page_size=5,
        )
        TypeAdapter(ScriptHubRbacUsersResponse).validate_python(second_page)
        assert second_page["total"] == 30
        assert len(second_page["items"]) == 5
        assert second_page["items"][0]["user_code"] == "user-005"

        searched = list_rbac_users(
            db,
            actor=_all_scope_actor(),
            search="User 01",
            page_size=100,
        )
        assert searched["total"] == 10
        assert all("user-01" in user["user_code"] for user in searched["items"])
        assert list_rbac_users(
            db,
            actor=_all_scope_actor(),
            search="%",
            page_size=100,
        )["total"] == 0

        config_role = list_rbac_users(
            db,
            actor=_all_scope_actor(),
            role_code="config",
            page_size=100,
        )
        assert config_role["total"] == 14
        assert all("config" in user["role_codes"] for user in config_role["items"])

        state_totals = {
            state: list_rbac_users(
                db,
                actor=_all_scope_actor(),
                config_state=state,
                page_size=100,
            )["total"]
            for state in ("enabled", "partial", "none")
        }
        assert sum(state_totals.values()) == 30
        assert state_totals["partial"] == 2
        enabled_users = list_rbac_users(
            db,
            actor=_all_scope_actor(),
            config_state="enabled",
            page_size=100,
        )["items"]
        for user_code in ("user-005", "user-007"):
            legacy_user = next(user for user in enabled_users if user["user_code"] == user_code)
            assert RBAC_CONFIG_PERMISSION_KEYS.issubset(
                set(legacy_user["effective_permission_keys"])
            )
        none_users = list_rbac_users(
            db,
            actor=_all_scope_actor(),
            config_state="none",
            page_size=100,
        )["items"]
        assert "user-009" in {user["user_code"] for user in none_users}

        clamped = list_rbac_users(
            db,
            actor=_all_scope_actor(),
            page_size=500,
        )
        assert clamped["page_size"] == 100
    finally:
        db.close()
        engine.dispose()


def test_thousand_user_config_filter_and_summary_keep_bounded_queries_and_responses():
    engine, db = _create_session(1000)
    statements = []

    def capture_statement(_conn, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture_statement)
    try:
        filtered_users = list_rbac_users(
            db,
            actor=_all_scope_actor(),
            config_state="enabled",
            page=1,
            page_size=50,
        )
        user_query_count = len(statements)
        assert len(filtered_users["items"]) == 50
        assert filtered_users["total"] > 50
        assert user_query_count <= 5
        user_sql = "\n".join(statements).lower()
        assert "access_key_lookup_hash" not in user_sql
        assert "access_key_salt" not in user_sql
        assert "access_key_hash" not in user_sql

        statements.clear()
        summary = get_rbac_summary(db, actor=_all_scope_actor())
        assert summary["user_count"] == 1000
        assert len(summary["high_risk_users"]) == 8
        assert len(statements) <= 10
        normalized_sql = "\n".join(statements).lower()
        assert "access_key_lookup_hash" not in normalized_sql
        assert "access_key_salt" not in normalized_sql
        assert "access_key_hash" not in normalized_sql
    finally:
        event.remove(engine, "before_cursor_execute", capture_statement)
        db.close()
        engine.dispose()


def test_scoped_reads_preserve_user_org_and_audit_visibility_and_redaction():
    engine, db = _create_session(12)
    actor = _company_a_actor()
    try:
        users = list_rbac_users(db, actor=actor, page_size=100)
        assert users["total"] == 7
        assert {user["user_code"] for user in users["items"]} == {
            "user-000",
            "user-001",
            "user-002",
            "user-004",
            "user-006",
            "user-008",
            "user-010",
        }
        try:
            get_rbac_user(db, "user-003", actor=actor)
        except ValueError as exc:
            assert str(exc) == "User is outside the actor data scope"
        else:
            raise AssertionError("cross-organization user detail must not be visible")

        organizations = list_rbac_organizations(db, actor=actor)
        assert [item["org_code"] for item in organizations["items"]] == ["company-a"]
        assert organizations["items"][0]["primary_user_count"] == 6

        audit_logs = list_rbac_audit_logs(db, actor=actor, page_size=100)
        TypeAdapter(ScriptHubRbacAuditLogsResponse).validate_python(audit_logs)
        assert audit_logs["total"] == 8
        assert all(item["target_org_code"] == "company-a" for item in audit_logs["items"])
        sensitive = next(item for item in audit_logs["items"] if item["sensitivity"] == "sensitive")
        assert sensitive["details"] == {"sensitive": "***redacted***"}
        assert audit_logs["target_types"] == ["role", "user"]

        filtered_logs = list_rbac_audit_logs(
            db,
            actor=actor,
            actor_search="User 000",
            target_type="user",
            sensitivity="sensitive",
        )
        assert filtered_logs["total"] == 1

        summary = get_rbac_summary(db, actor=actor)
        TypeAdapter(ScriptHubRbacSummaryResponse).validate_python(summary)
        assert summary["user_count"] == 7
        assert summary["organization_count"] == 1
        assert summary["data_scope_counts"][DATA_SCOPE_ORG_ONLY] == 7
    finally:
        db.close()
        engine.dispose()


def test_organization_users_projection_supports_compatible_full_and_paged_results():
    engine, db = _create_session(12)
    try:
        full_result = get_org_users(db, "company-a", actor=_all_scope_actor())
        assert full_result["primary_total_count"] == 6
        assert full_result["data_scope_total_count"] == 1
        assert full_result["total_count"] == 7
        assert len(full_result["primary_users"]) == 6
        assert len(full_result["data_scope_users"]) == 1

        paged_result = get_org_users(
            db,
            "company-a",
            actor=_all_scope_actor(),
            page=2,
            page_size=3,
        )
        assert paged_result["page"] == 2
        assert paged_result["page_size"] == 3
        assert paged_result["total_count"] == 7
        assert len(paged_result["primary_users"]) + len(paged_result["data_scope_users"]) == 3
    finally:
        db.close()
        engine.dispose()


def test_rbac_read_routes_run_sync_database_work_in_fastapi_threadpool():
    sync_endpoints = [
        verify_auth_session,
        get_rbac_overview,
        get_rbac_catalog_endpoint,
        get_rbac_summary_endpoint,
        list_rbac_users_endpoint,
        get_rbac_user_endpoint,
        list_rbac_roles_endpoint,
        list_rbac_organizations_endpoint,
        list_rbac_audit_logs_endpoint,
        get_rbac_organization_users_endpoint,
    ]
    assert all(not inspect.iscoroutinefunction(endpoint) for endpoint in sync_endpoints)
    assert inspect.iscoroutinefunction(create_auth_session)
    assert list(inspect.signature(create_auth_session).parameters) == ["request"]


def test_access_key_authentication_worker_owns_and_closes_its_session(monkeypatch):
    events = []

    class TrackingSession:
        def close(self):
            events.append("closed")

    session = TrackingSession()
    monkeypatch.setattr(auth_rbac.database, "SessionLocal", lambda: session)

    def authenticate(db, access_key):
        assert db is session
        assert access_key == "test-key"
        events.append("authenticated")
        return {"id": "test-user"}

    monkeypatch.setattr(auth_rbac, "authenticate_access_key", authenticate)
    assert auth_rbac._authenticate_access_key_with_owned_session("test-key") == {
        "id": "test-user"
    }
    assert events == ["authenticated", "closed"]
