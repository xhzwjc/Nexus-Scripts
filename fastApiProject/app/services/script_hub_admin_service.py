import secrets
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from ..rbac_models import (
    ScriptHubPermission,
    ScriptHubRole,
    ScriptHubRolePermission,
    ScriptHubUser,
    ScriptHubUserPermission,
    ScriptHubUserRole,
)
from .script_hub_auth_service import (
    build_permission_map,
    create_access_key_material,
    load_roles_for_user,
    load_user_permission_overrides,
    resolve_primary_role,
)
from .script_hub_audit_service import list_recent_audit_logs
from ..rbac_schemas import ROLE_CODE_RE, USER_CODE_RE


def _normalize_user_code(user_code: str) -> str:
    normalized = (user_code or "").strip().lower()
    if not USER_CODE_RE.match(normalized):
        raise ValueError("User code must use lowercase letters, numbers, dots, underscores, or hyphens")
    return normalized


def _normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _generate_access_key() -> str:
    return f"sh_{secrets.token_urlsafe(24).replace('-', 'A').replace('_', 'B')[:28]}"


def _permission_rows(db: Session) -> Dict[str, ScriptHubPermission]:
    return {
        permission.permission_key: permission
        for permission in db.query(ScriptHubPermission).filter(ScriptHubPermission.is_active.is_(True)).all()
    }


def _role_rows(db: Session) -> Dict[str, ScriptHubRole]:
    return {
        role.role_code: role
        for role in db.query(ScriptHubRole).filter(
            ScriptHubRole.is_active.is_(True),
            ScriptHubRole.is_deleted.is_(False),
        ).all()
    }


def _normalize_role_codes(role_codes: Iterable[str], available_roles: Dict[str, ScriptHubRole]) -> List[str]:
    normalized = sorted({str(role_code).strip() for role_code in role_codes if str(role_code).strip()})
    if not normalized:
        raise ValueError("At least one role is required")

    invalid = [role_code for role_code in normalized if role_code not in available_roles]
    if invalid:
        raise ValueError(f"Unknown roles: {', '.join(invalid)}")
    return normalized


def _normalize_permission_keys(permission_keys: Iterable[str], available_permissions: Dict[str, ScriptHubPermission]) -> List[str]:
    normalized = sorted({str(permission_key).strip() for permission_key in permission_keys if str(permission_key).strip()})
    invalid = [permission_key for permission_key in normalized if permission_key not in available_permissions]
    if invalid:
        raise ValueError(f"Unknown permissions: {', '.join(invalid)}")
    return normalized


def _normalize_role_code(role_code: str) -> str:
    normalized = (role_code or "").strip().lower()
    if not ROLE_CODE_RE.match(normalized):
        raise ValueError("Role code must use lowercase letters, numbers, dots, underscores, or hyphens")
    return normalized


def _set_user_roles(db: Session, user_id: int, role_codes: List[str], role_rows: Dict[str, ScriptHubRole]):
    db.query(ScriptHubUserRole).filter(ScriptHubUserRole.user_id == user_id).delete()
    for role_code in role_codes:
        db.add(ScriptHubUserRole(user_id=user_id, role_id=role_rows[role_code].id))


def _set_user_permission_overrides(
    db: Session,
    user_id: int,
    granted_permissions: List[str],
    revoked_permissions: List[str],
    permission_rows: Dict[str, ScriptHubPermission],
):
    overlap = sorted(set(granted_permissions) & set(revoked_permissions))
    if overlap:
        raise ValueError(f"Permissions cannot be both granted and revoked: {', '.join(overlap)}")

    db.query(ScriptHubUserPermission).filter(ScriptHubUserPermission.user_id == user_id).delete()

    for permission_key in granted_permissions:
        db.add(
            ScriptHubUserPermission(
                user_id=user_id,
                permission_id=permission_rows[permission_key].id,
                is_granted=True,
            )
        )

    for permission_key in revoked_permissions:
        db.add(
            ScriptHubUserPermission(
                user_id=user_id,
                permission_id=permission_rows[permission_key].id,
                is_granted=False,
            )
        )


def _serialize_role_permission_keys(db: Session, role_ids: List[int]) -> List[str]:
    if not role_ids:
        return []

    rows = (
        db.query(ScriptHubPermission.permission_key)
        .join(ScriptHubRolePermission, ScriptHubRolePermission.permission_id == ScriptHubPermission.id)
        .filter(ScriptHubRolePermission.role_id.in_(role_ids))
        .distinct()
        .all()
    )
    return sorted(permission_key for permission_key, in rows)


def _get_assigned_user_count(db: Session, role_id: int) -> int:
    return (
        db.query(ScriptHubUserRole)
        .join(ScriptHubUser, ScriptHubUser.id == ScriptHubUserRole.user_id)
        .filter(
            ScriptHubUserRole.role_id == role_id,
            ScriptHubUser.is_deleted.is_(False),
        )
        .count()
    )


def serialize_admin_role(db: Session, role: ScriptHubRole) -> Dict[str, object]:
    return {
        "code": role.role_code,
        "name": role.name,
        "description": role.description or "",
        "sort_order": role.sort_order,
        "permission_keys": _serialize_role_permission_keys(db, [role.id]),
        "is_system": bool(role.is_system),
        "is_active": bool(role.is_active),
        "assigned_user_count": _get_assigned_user_count(db, role.id),
    }


def serialize_admin_user(db: Session, user: ScriptHubUser) -> Dict[str, object]:
    roles = load_roles_for_user(db, user.id)
    role_codes = [role.role_code for role in roles]
    role_permission_keys = _serialize_role_permission_keys(db, [role.id for role in roles])
    overrides = load_user_permission_overrides(db, user.id)
    granted_overrides = sorted(permission_key for permission_key, is_granted in overrides if is_granted)
    revoked_overrides = sorted(permission_key for permission_key, is_granted in overrides if not is_granted)
    effective_permission_keys = sorted(build_permission_map(db, user).keys())

    return {
        "user_code": user.user_code,
        "display_name": user.display_name,
        "primary_role": resolve_primary_role(role_codes),
        "role_codes": role_codes,
        "role_permission_keys": role_permission_keys,
        "granted_overrides": granted_overrides,
        "revoked_overrides": revoked_overrides,
        "effective_permission_keys": effective_permission_keys,
        "team_resources_login_key_enabled": bool(user.team_resources_access_enabled),
        "is_active": bool(user.is_active),
        "is_super_admin": bool(user.is_super_admin),
        "notes": user.notes,
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


def _is_admin_capable(db: Session, user: ScriptHubUser, role_codes: Optional[Iterable[str]] = None, is_super_admin: Optional[bool] = None) -> bool:
    effective_is_super_admin = user.is_super_admin if is_super_admin is None else bool(is_super_admin)
    effective_role_codes = set(role_codes or [role.role_code for role in load_roles_for_user(db, user.id)])
    return effective_is_super_admin or "admin" in effective_role_codes


def _count_other_active_admins(db: Session, excluded_user_id: int) -> int:
    count = 0
    users = db.query(ScriptHubUser).filter(ScriptHubUser.is_active.is_(True), ScriptHubUser.id != excluded_user_id).all()
    users = [
        user for user in users
        if not bool(user.is_deleted)
    ]
    for user in users:
        if _is_admin_capable(db, user):
            count += 1
    return count


def _guard_last_admin(db: Session, user: ScriptHubUser, next_is_active: bool, next_is_super_admin: bool, next_role_codes: List[str]):
    if next_is_active and _is_admin_capable(db, user, next_role_codes, next_is_super_admin):
        return

    if _count_other_active_admins(db, user.id) == 0:
        raise ValueError("At least one active administrator must remain in the system")


def list_rbac_overview(db: Session) -> Dict[str, object]:
    permissions = [
        {
            "key": permission.permission_key,
            "name": permission.name,
            "category": permission.category,
            "description": permission.description or "",
            "sort_order": permission.sort_order,
        }
        for permission in db.query(ScriptHubPermission)
        .filter(ScriptHubPermission.is_active.is_(True))
        .order_by(ScriptHubPermission.sort_order.asc(), ScriptHubPermission.permission_key.asc())
        .all()
    ]
    roles = [
        serialize_admin_role(db, role)
        for role in db.query(ScriptHubRole)
        .filter(ScriptHubRole.is_deleted.is_(False))
        .order_by(
            ScriptHubRole.is_active.desc(),
            ScriptHubRole.is_system.desc(),
            ScriptHubRole.sort_order.asc(),
            ScriptHubRole.role_code.asc(),
        )
        .all()
    ]
    users = [
        serialize_admin_user(db, user)
        for user in db.query(ScriptHubUser)
        .filter(ScriptHubUser.is_deleted.is_(False))
        .order_by(ScriptHubUser.created_at.asc(), ScriptHubUser.user_code.asc())
        .all()
    ]

    return {
        "catalog": {
            "permissions": permissions,
            "roles": roles,
        },
        "users": users,
        "audit_logs": list_recent_audit_logs(db, limit=60),
    }


def _set_role_permissions(db: Session, role_id: int, permission_keys: List[str], permission_rows: Dict[str, ScriptHubPermission]):
    db.query(ScriptHubRolePermission).filter(ScriptHubRolePermission.role_id == role_id).delete()
    for permission_key in permission_keys:
        db.add(
            ScriptHubRolePermission(
                role_id=role_id,
                permission_id=permission_rows[permission_key].id,
            )
        )


def create_rbac_role(
    db: Session,
    *,
    code: str,
    name: str,
    description: Optional[str],
    permission_keys: Iterable[str],
) -> Dict[str, object]:
    normalized_code = _normalize_role_code(code)
    if db.query(ScriptHubRole).filter(
        ScriptHubRole.role_code == normalized_code,
    ).first():
        raise ValueError("Role code already exists")

    normalized_name = (name or "").strip()
    if not normalized_name:
        raise ValueError("Role name is required")

    permission_rows = _permission_rows(db)
    normalized_permission_keys = _normalize_permission_keys(permission_keys, permission_rows)
    if not normalized_permission_keys:
        raise ValueError("At least one permission is required")

    max_sort_order = db.query(ScriptHubRole.sort_order).order_by(ScriptHubRole.sort_order.desc()).limit(1).scalar()
    next_sort_order = (max_sort_order or 0) + 10

    role = ScriptHubRole(
        role_code=normalized_code,
        name=normalized_name,
        description=_normalize_text(description),
        sort_order=next_sort_order,
        is_system=False,
        is_active=True,
    )
    db.add(role)
    db.flush()
    _set_role_permissions(db, role.id, normalized_permission_keys, permission_rows)
    db.commit()
    db.refresh(role)
    return serialize_admin_role(db, role)


def update_rbac_role(
    db: Session,
    role_code: str,
    *,
    name: Optional[str] = None,
    description: Optional[str] = None,
    permission_keys: Optional[Iterable[str]] = None,
    is_active: Optional[bool] = None,
) -> Dict[str, object]:
    normalized_role_code = _normalize_role_code(role_code)
    role = db.query(ScriptHubRole).filter(
        ScriptHubRole.role_code == normalized_role_code,
        ScriptHubRole.is_deleted.is_(False),
    ).first()
    if not role:
        raise ValueError("Role not found")
    if role.is_system:
        raise ValueError("System roles are read-only")

    permission_rows = _permission_rows(db)
    normalized_permission_keys = (
        _normalize_permission_keys(permission_keys, permission_rows)
        if permission_keys is not None else
        _serialize_role_permission_keys(db, [role.id])
    )
    if not normalized_permission_keys:
        raise ValueError("At least one permission is required")

    next_is_active = role.is_active if is_active is None else bool(is_active)
    if not next_is_active and _get_assigned_user_count(db, role.id) > 0:
        raise ValueError("This role is still assigned to users. Reassign users before disabling it")

    if name is not None:
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("Role name is required")
        role.name = normalized_name

    if description is not None:
        role.description = _normalize_text(description)

    role.is_active = next_is_active
    _set_role_permissions(db, role.id, normalized_permission_keys, permission_rows)
    db.commit()
    db.refresh(role)
    return serialize_admin_role(db, role)


def create_rbac_user(
    db: Session,
    *,
    user_code: str,
    display_name: str,
    access_key: Optional[str],
    role_codes: Iterable[str],
    granted_permissions: Iterable[str],
    revoked_permissions: Iterable[str],
    team_resources_login_key_enabled: bool,
    is_active: bool,
    is_super_admin: bool,
    notes: Optional[str],
) -> Tuple[Dict[str, object], str]:
    normalized_user_code = _normalize_user_code(user_code)
    if db.query(ScriptHubUser).filter(
        ScriptHubUser.user_code == normalized_user_code,
    ).first():
        raise ValueError("User code already exists")

    normalized_display_name = (display_name or "").strip()
    if not normalized_display_name:
        raise ValueError("Display name is required")

    permission_rows = _permission_rows(db)
    role_rows = _role_rows(db)
    normalized_role_codes = _normalize_role_codes(role_codes, role_rows)
    normalized_granted_permissions = _normalize_permission_keys(granted_permissions, permission_rows)
    normalized_revoked_permissions = _normalize_permission_keys(revoked_permissions, permission_rows)

    plain_access_key = (access_key or "").strip() or _generate_access_key()
    material = create_access_key_material(plain_access_key)

    if db.query(ScriptHubUser).filter(
        ScriptHubUser.access_key_lookup_hash == material["lookup_hash"],
    ).first():
        raise ValueError("Access key already exists, please choose another one")

    user = ScriptHubUser(
        user_code=normalized_user_code,
        display_name=normalized_display_name,
        access_key_lookup_hash=material["lookup_hash"],
        access_key_salt=material["salt"],
        access_key_hash=material["hash"],
        team_resources_access_enabled=bool(team_resources_login_key_enabled),
        is_active=bool(is_active),
        is_super_admin=bool(is_super_admin),
        notes=_normalize_text(notes),
    )
    db.add(user)
    db.flush()

    _set_user_roles(db, user.id, normalized_role_codes, role_rows)
    _set_user_permission_overrides(
        db,
        user.id,
        normalized_granted_permissions,
        normalized_revoked_permissions,
        permission_rows,
    )

    db.commit()
    db.refresh(user)
    return serialize_admin_user(db, user), plain_access_key


def update_rbac_user(
    db: Session,
    user_code: str,
    *,
    display_name: Optional[str] = None,
    role_codes: Optional[Iterable[str]] = None,
    granted_permissions: Optional[Iterable[str]] = None,
    revoked_permissions: Optional[Iterable[str]] = None,
    team_resources_login_key_enabled: Optional[bool] = None,
    is_active: Optional[bool] = None,
    is_super_admin: Optional[bool] = None,
    notes: Optional[str] = None,
) -> Dict[str, object]:
    normalized_user_code = _normalize_user_code(user_code)
    user = db.query(ScriptHubUser).filter(
        ScriptHubUser.user_code == normalized_user_code,
        ScriptHubUser.is_deleted.is_(False),
    ).first()
    if not user:
        raise ValueError("User not found")

    permission_rows = _permission_rows(db)
    role_rows = _role_rows(db)
    next_role_codes = _normalize_role_codes(role_codes, role_rows) if role_codes is not None else [role.role_code for role in load_roles_for_user(db, user.id)]
    next_granted_permissions = (
        _normalize_permission_keys(granted_permissions, permission_rows)
        if granted_permissions is not None else
        [permission_key for permission_key, granted in load_user_permission_overrides(db, user.id) if granted]
    )
    next_revoked_permissions = (
        _normalize_permission_keys(revoked_permissions, permission_rows)
        if revoked_permissions is not None else
        [permission_key for permission_key, granted in load_user_permission_overrides(db, user.id) if not granted]
    )
    next_is_active = user.is_active if is_active is None else bool(is_active)
    next_is_super_admin = user.is_super_admin if is_super_admin is None else bool(is_super_admin)

    _guard_last_admin(db, user, next_is_active, next_is_super_admin, next_role_codes)

    if display_name is not None:
        normalized_display_name = display_name.strip()
        if not normalized_display_name:
            raise ValueError("Display name cannot be empty")
        user.display_name = normalized_display_name

    user.is_active = next_is_active
    user.is_super_admin = next_is_super_admin
    if team_resources_login_key_enabled is not None:
        user.team_resources_access_enabled = bool(team_resources_login_key_enabled)
    if notes is not None:
        user.notes = _normalize_text(notes)

    _set_user_roles(db, user.id, next_role_codes, role_rows)
    _set_user_permission_overrides(
        db,
        user.id,
        next_granted_permissions,
        next_revoked_permissions,
        permission_rows,
    )

    db.commit()
    db.refresh(user)
    return serialize_admin_user(db, user)


def rotate_user_access_key(db: Session, user_code: str, access_key: Optional[str] = None) -> Tuple[Dict[str, object], str]:
    normalized_user_code = _normalize_user_code(user_code)
    user = db.query(ScriptHubUser).filter(
        ScriptHubUser.user_code == normalized_user_code,
        ScriptHubUser.is_deleted.is_(False),
    ).first()
    if not user:
        raise ValueError("User not found")

    plain_access_key = (access_key or "").strip() or _generate_access_key()
    material = create_access_key_material(plain_access_key)

    existing = (
        db.query(ScriptHubUser)
        .filter(
            ScriptHubUser.access_key_lookup_hash == material["lookup_hash"],
            ScriptHubUser.id != user.id,
        )
        .first()
    )
    if existing:
        raise ValueError("Access key already exists, please choose another one")

    user.access_key_lookup_hash = material["lookup_hash"]
    user.access_key_salt = material["salt"]
    user.access_key_hash = material["hash"]

    db.commit()
    db.refresh(user)
    return serialize_admin_user(db, user), plain_access_key


def delete_rbac_user(db: Session, user_code: str) -> Dict[str, object]:
    normalized_user_code = _normalize_user_code(user_code)
    user = db.query(ScriptHubUser).filter(
        ScriptHubUser.user_code == normalized_user_code,
        ScriptHubUser.is_deleted.is_(False),
    ).first()
    if not user:
        raise ValueError("User not found")

    current_role_codes = [role.role_code for role in load_roles_for_user(db, user.id)]
    _guard_last_admin(db, user, False, False, current_role_codes)

    user.is_active = False
    user.team_resources_access_enabled = False
    user.is_deleted = True
    user.deleted_at = datetime.utcnow()

    db.commit()
    return {
        "user_code": user.user_code,
        "display_name": user.display_name,
    }


def delete_rbac_role(db: Session, role_code: str) -> Dict[str, object]:
    normalized_role_code = _normalize_role_code(role_code)
    role = db.query(ScriptHubRole).filter(
        ScriptHubRole.role_code == normalized_role_code,
        ScriptHubRole.is_deleted.is_(False),
    ).first()
    if not role:
        raise ValueError("Role not found")
    if role.is_system:
        raise ValueError("System roles are read-only")
    if _get_assigned_user_count(db, role.id) > 0:
        raise ValueError("This role is still assigned to users. Reassign users before deleting it")

    role.is_active = False
    role.is_deleted = True
    role.deleted_at = datetime.utcnow()

    db.commit()
    return {
        "code": role.role_code,
        "name": role.name,
    }
