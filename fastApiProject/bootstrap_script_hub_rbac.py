#!/usr/bin/env python3
"""
初始化 Script Hub RBAC 数据

功能：
1. 创建 users / roles / permissions 等权限表
2. 写入系统权限目录和默认角色
3. 可选：从 bootstrap seed 导入初始用户
"""

import os
import sys
from pathlib import Path
from typing import Dict, Iterable, Set

sys.path.append(str(Path(__file__).parent))

from app.database import Base, SessionLocal, engine
from app.schema_maintenance import ensure_script_hub_schema
from app.legacy_access_keys import (
    generate_bootstrap_admin_key,
    get_bootstrap_admin_key,
    load_bootstrap_access_keys,
)
from app.rbac_catalog import ALL_PERMISSION_KEYS, PERMISSION_DEFINITIONS, ROLE_DEFINITIONS
from app.rbac_models import (
    ScriptHubPermission,
    ScriptHubRole,
    ScriptHubRolePermission,
    ScriptHubUser,
    ScriptHubUserPermission,
    ScriptHubUserRole,
)
from app.services.script_hub_auth_service import create_access_key_material


def ensure_tables():
    Base.metadata.create_all(bind=engine)
    ensure_script_hub_schema()


def sync_permissions(db):
    permission_by_key: Dict[str, ScriptHubPermission] = {
        permission.permission_key: permission
        for permission in db.query(ScriptHubPermission).all()
    }

    for definition in PERMISSION_DEFINITIONS:
        existing = permission_by_key.get(definition.key)
        if existing:
            existing.name = definition.name
            existing.category = definition.category
            existing.description = definition.description
            existing.sort_order = definition.sort_order
            existing.is_active = True
        else:
            db.add(
                ScriptHubPermission(
                    permission_key=definition.key,
                    name=definition.name,
                    category=definition.category,
                    description=definition.description,
                    sort_order=definition.sort_order,
                    is_active=True,
                )
            )
    db.flush()


def sync_roles(db):
    role_by_code: Dict[str, ScriptHubRole] = {
        role.role_code: role
        for role in db.query(ScriptHubRole).all()
    }

    for definition in ROLE_DEFINITIONS:
        existing = role_by_code.get(definition.code)
        if existing:
            existing.name = definition.name
            existing.description = definition.description
            existing.sort_order = definition.sort_order
            existing.is_system = True
            existing.is_active = True
        else:
            db.add(
                ScriptHubRole(
                    role_code=definition.code,
                    name=definition.name,
                    description=definition.description,
                    sort_order=definition.sort_order,
                    is_system=True,
                    is_active=True,
                )
            )
    db.flush()


def sync_role_permissions(db):
    permission_by_key = {
        permission.permission_key: permission
        for permission in db.query(ScriptHubPermission).all()
    }
    role_by_code = {
        role.role_code: role
        for role in db.query(ScriptHubRole).all()
    }

    for definition in ROLE_DEFINITIONS:
        role = role_by_code[definition.code]
        db.query(ScriptHubRolePermission).filter(ScriptHubRolePermission.role_id == role.id).delete()
        for permission_key in definition.permissions:
            permission = permission_by_key[permission_key]
            db.add(
                ScriptHubRolePermission(
                    role_id=role.id,
                    permission_id=permission.id,
                )
            )
    db.flush()


def _get_role_permissions(role_code: str) -> Set[str]:
    for definition in ROLE_DEFINITIONS:
        if definition.code == role_code:
            return set(definition.permissions)
    return set()


def _reset_user_roles(db, user_id: int, role_id: int):
    db.query(ScriptHubUserRole).filter(ScriptHubUserRole.user_id == user_id).delete()
    db.add(ScriptHubUserRole(user_id=user_id, role_id=role_id))


def _reset_user_permission_overrides(db, user_id: int, permission_rows: Dict[str, ScriptHubPermission], granted: Iterable[str], revoked: Iterable[str]):
    db.query(ScriptHubUserPermission).filter(ScriptHubUserPermission.user_id == user_id).delete()

    for permission_key in sorted(set(granted)):
        db.add(
            ScriptHubUserPermission(
                user_id=user_id,
                permission_id=permission_rows[permission_key].id,
                is_granted=True,
            )
        )

    for permission_key in sorted(set(revoked)):
        db.add(
            ScriptHubUserPermission(
                user_id=user_id,
                permission_id=permission_rows[permission_key].id,
                is_granted=False,
            )
        )


def _seed_initial_admin_user(db):
    if db.query(ScriptHubUser).count() > 0:
        return

    role_rows = {
        role.role_code: role
        for role in db.query(ScriptHubRole).all()
    }
    permission_rows = {
        permission.permission_key: permission
        for permission in db.query(ScriptHubPermission).all()
    }

    access_key = get_bootstrap_admin_key() or generate_bootstrap_admin_key()
    material = create_access_key_material(access_key)
    user = ScriptHubUser(
        user_code="admin",
        display_name="System Administrator",
        access_key_lookup_hash=material["lookup_hash"],
        access_key_salt=material["salt"],
        access_key_hash=material["hash"],
        team_resources_access_enabled=True,
        is_super_admin=True,
        is_active=True,
    )
    db.add(user)
    db.flush()
    _reset_user_roles(db, user.id, role_rows["admin"].id)
    _reset_user_permission_overrides(db, user.id, permission_rows, [], [])
    print("No bootstrap user seed found; created initial admin user.")
    if get_bootstrap_admin_key():
        print("Initial admin access key source: SCRIPT_HUB_BOOTSTRAP_ADMIN_KEY")
    else:
        print(f"Generated initial admin access key: {access_key}")


def sync_bootstrap_users(db):
    bootstrap_users, source = load_bootstrap_access_keys()
    if not bootstrap_users:
        _seed_initial_admin_user(db)
        return

    if source == "deprecated_env":
        print("Warning: SCRIPT_HUB_ACCESS_KEYS_JSON is deprecated. Use SCRIPT_HUB_BOOTSTRAP_USERS_FILE instead.")

    permission_rows = {
        permission.permission_key: permission
        for permission in db.query(ScriptHubPermission).all()
    }
    role_rows = {
        role.role_code: role
        for role in db.query(ScriptHubRole).all()
    }
    users_by_code = {
        user.user_code: user
        for user in db.query(ScriptHubUser).all()
    }

    print(f"Bootstrapping {len(bootstrap_users)} access-key users from {source}...")
    for access_key, bootstrap_user in bootstrap_users.items():
        user_code = bootstrap_user["id"]
        role_code = bootstrap_user["role"]
        material = create_access_key_material(access_key)
        user = users_by_code.get(user_code)

        if user:
            user.display_name = bootstrap_user["name"]
            user.access_key_lookup_hash = material["lookup_hash"]
            user.access_key_salt = material["salt"]
            user.access_key_hash = material["hash"]
            user.is_super_admin = role_code == "admin"
            user.is_active = True
        else:
            user = ScriptHubUser(
                user_code=user_code,
                display_name=bootstrap_user["name"],
                access_key_lookup_hash=material["lookup_hash"],
                access_key_salt=material["salt"],
                access_key_hash=material["hash"],
                is_super_admin=role_code == "admin",
                is_active=True,
            )
            db.add(user)
            db.flush()
            users_by_code[user_code] = user

        role = role_rows[role_code]
        _reset_user_roles(db, user.id, role.id)

        effective_role_permissions = set(ALL_PERMISSION_KEYS) if role_code == "admin" else _get_role_permissions(role_code)
        legacy_permissions = {key for key, granted in bootstrap_user["permissions"].items() if granted}

        granted_overrides = legacy_permissions - effective_role_permissions
        revoked_overrides = effective_role_permissions - legacy_permissions
        _reset_user_permission_overrides(db, user.id, permission_rows, granted_overrides, revoked_overrides)


def main():
    print("=" * 60)
    print("Bootstrapping Script Hub RBAC")
    print("=" * 60)
    ensure_tables()

    db = SessionLocal()
    try:
        sync_permissions(db)
        sync_roles(db)
        sync_role_permissions(db)
        sync_bootstrap_users(db)
        db.commit()

        print("Permissions:", db.query(ScriptHubPermission).count())
        print("Roles:", db.query(ScriptHubRole).count())
        print("Users:", db.query(ScriptHubUser).count())
        print("RBAC bootstrap completed.")
    except Exception as exc:
        db.rollback()
        print(f"RBAC bootstrap failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
