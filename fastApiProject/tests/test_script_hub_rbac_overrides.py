from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.rbac_catalog import ALL_PERMISSION_KEYS, PERMISSION_DEFINITIONS, ROLE_DEFINITIONS
from app.rbac_models import (
    ScriptHubPermission,
    ScriptHubRole,
    ScriptHubRolePermission,
    ScriptHubUser,
    ScriptHubUserPermission,
    ScriptHubUserRole,
)
from app.services.script_hub_admin_service import create_rbac_user
from app.services.script_hub_auth_service import build_permission_map


RBAC_TABLES = [
    ScriptHubPermission.__table__,
    ScriptHubRole.__table__,
    ScriptHubRolePermission.__table__,
    ScriptHubUser.__table__,
    ScriptHubUserRole.__table__,
    ScriptHubUserPermission.__table__,
]


def _build_test_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine, tables=RBAC_TABLES)
    return TestingSessionLocal()


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
        role = role_rows[definition.code]
        for permission_key in definition.permissions:
            db.add(
                ScriptHubRolePermission(
                    role_id=role.id,
                    permission_id=permission_rows[permission_key].id,
                )
            )

    db.commit()


def test_super_admin_revoked_overrides_still_take_effect():
    db = _build_test_db()
    try:
        _seed_catalog(db)

        create_rbac_user(
            db,
            user_code="super-admin-revoked",
            display_name="Super Admin Revoked",
            access_key="test-super-admin-revoked",
            role_codes=["operator"],
            granted_permissions=[],
            revoked_permissions=["agent-chat", "rbac-manage"],
            team_resources_login_key_enabled=False,
            is_active=True,
            is_super_admin=True,
            notes=None,
        )

        user = db.query(ScriptHubUser).filter(ScriptHubUser.user_code == "super-admin-revoked").one()
        permission_map = build_permission_map(db, user)

        assert permission_map["sms-admin-login"] is True
        assert "agent-chat" not in permission_map
        assert "rbac-manage" not in permission_map
        assert len(permission_map) == len(ALL_PERMISSION_KEYS) - 2
    finally:
        db.close()


def test_admin_role_revoked_overrides_still_take_effect():
    db = _build_test_db()
    try:
        _seed_catalog(db)

        create_rbac_user(
            db,
            user_code="admin-role-revoked",
            display_name="Admin Role Revoked",
            access_key="test-admin-role-revoked",
            role_codes=["admin"],
            granted_permissions=[],
            revoked_permissions=["agent-chat"],
            team_resources_login_key_enabled=False,
            is_active=True,
            is_super_admin=False,
            notes=None,
        )

        user = db.query(ScriptHubUser).filter(ScriptHubUser.user_code == "admin-role-revoked").one()
        permission_map = build_permission_map(db, user)

        assert permission_map["rbac-manage"] is True
        assert "agent-chat" not in permission_map
        assert len(permission_map) == len(ALL_PERMISSION_KEYS) - 1
    finally:
        db.close()
