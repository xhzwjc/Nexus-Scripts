import base64
import hashlib
import hmac
import json
import os
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from ..rbac_catalog import ALL_PERMISSION_KEYS, ROLE_INDEX, normalize_role_code
from ..rbac_models import (
    ScriptHubPermission,
    ScriptHubRole,
    ScriptHubRolePermission,
    ScriptHubUser,
    ScriptHubUserPermission,
    ScriptHubUserRole,
)

PBKDF2_ITERATIONS = 310_000


def _compute_lookup_hash(access_key: str) -> str:
    return hashlib.sha256(access_key.encode("utf-8")).hexdigest()


def _hash_access_key(access_key: str, salt: Optional[bytes] = None) -> Tuple[str, str]:
    salt_bytes = salt or os.urandom(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        access_key.encode("utf-8"),
        salt_bytes,
        PBKDF2_ITERATIONS,
    )
    return (
        base64.b64encode(salt_bytes).decode("utf-8"),
        base64.b64encode(derived).decode("utf-8"),
    )


def create_access_key_material(access_key: str) -> Dict[str, str]:
    salt_b64, hash_b64 = _hash_access_key(access_key)
    return {
        "lookup_hash": _compute_lookup_hash(access_key),
        "salt": salt_b64,
        "hash": hash_b64,
    }


def verify_access_key(access_key: str, salt_b64: str, hash_b64: str) -> bool:
    try:
        salt_bytes = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
    except Exception:
        return False

    actual = hashlib.pbkdf2_hmac(
        "sha256",
        access_key.encode("utf-8"),
        salt_bytes,
        PBKDF2_ITERATIONS,
    )
    return hmac.compare_digest(actual, expected)


def load_roles_for_user(db: Session, user_id: int) -> List[ScriptHubRole]:
    return (
        db.query(ScriptHubRole)
        .join(ScriptHubUserRole, ScriptHubUserRole.role_id == ScriptHubRole.id)
        .filter(
            ScriptHubUserRole.user_id == user_id,
            ScriptHubRole.is_active.is_(True),
            ScriptHubRole.is_deleted.is_(False),
        )
        .order_by(ScriptHubRole.sort_order.asc(), ScriptHubRole.role_code.asc())
        .all()
    )


def load_user_permission_overrides(db: Session, user_id: int) -> List[Tuple[str, bool]]:
    rows = (
        db.query(ScriptHubPermission.permission_key, ScriptHubUserPermission.is_granted)
        .join(ScriptHubUserPermission, ScriptHubUserPermission.permission_id == ScriptHubPermission.id)
        .filter(ScriptHubUserPermission.user_id == user_id)
        .all()
    )
    return [(permission_key, bool(is_granted)) for permission_key, is_granted in rows]


def build_permission_map(db: Session, user: ScriptHubUser) -> Dict[str, bool]:
    roles = load_roles_for_user(db, user.id)
    role_codes = {role.role_code for role in roles}
    if user.is_super_admin or "admin" in role_codes:
        return {permission_key: True for permission_key in ALL_PERMISSION_KEYS}

    granted: Dict[str, bool] = {}
    if roles:
        rows = (
            db.query(ScriptHubPermission.permission_key)
            .join(ScriptHubRolePermission, ScriptHubRolePermission.permission_id == ScriptHubPermission.id)
            .filter(ScriptHubRolePermission.role_id.in_([role.id for role in roles]))
            .distinct()
            .all()
        )
        granted.update({permission_key: True for permission_key, in rows})

    for permission_key, is_granted in load_user_permission_overrides(db, user.id):
        if is_granted:
            granted[permission_key] = True
        else:
            granted.pop(permission_key, None)

    return granted


def resolve_primary_role(role_codes: Iterable[str]) -> str:
    normalized = [role_code for role_code in role_codes if role_code]
    if not normalized:
        return "custom"
    if "admin" in normalized:
        return "admin"

    ordered = sorted(
        normalized,
        key=lambda role_code: (
            ROLE_INDEX.get(role_code).sort_order if role_code in ROLE_INDEX else 999,
            role_code,
        ),
    )
    return ordered[0]


def serialize_user_session(db: Session, user: ScriptHubUser) -> Dict[str, Any]:
    roles = load_roles_for_user(db, user.id)
    role_codes = [role.role_code for role in roles]
    return {
        "id": user.user_code,
        "role": resolve_primary_role(role_codes),
        "roles": role_codes,
        "name": user.display_name,
        "permissions": build_permission_map(db, user),
        "teamResourcesLoginKeyEnabled": bool(user.team_resources_access_enabled),
    }


def get_active_user_by_code(db: Session, user_code: str) -> Optional[ScriptHubUser]:
    return (
        db.query(ScriptHubUser)
        .filter(
            ScriptHubUser.user_code == user_code,
            ScriptHubUser.is_active.is_(True),
            ScriptHubUser.is_deleted.is_(False),
        )
        .first()
    )


def authenticate_access_key(db: Session, access_key: str) -> Optional[Dict[str, Any]]:
    access_key = (access_key or "").strip()
    if not access_key:
        return None

    user = (
        db.query(ScriptHubUser)
        .filter(
            ScriptHubUser.access_key_lookup_hash == _compute_lookup_hash(access_key),
            ScriptHubUser.is_active.is_(True),
            ScriptHubUser.is_deleted.is_(False),
        )
        .first()
    )
    if not user:
        return None

    if not verify_access_key(access_key, user.access_key_salt, user.access_key_hash):
        return None

    user.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return serialize_user_session(db, user)


def get_session_user_by_code(db: Session, user_code: str) -> Optional[Dict[str, Any]]:
    user = get_active_user_by_code(db, user_code)
    if not user:
        return None
    return serialize_user_session(db, user)


def parse_legacy_access_keys_from_env() -> Dict[str, Dict[str, Any]]:
    raw = (os.getenv("SCRIPT_HUB_ACCESS_KEYS_JSON") or "").strip()
    if not raw:
        return {}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid SCRIPT_HUB_ACCESS_KEYS_JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise RuntimeError("SCRIPT_HUB_ACCESS_KEYS_JSON must be an object")

    result: Dict[str, Dict[str, Any]] = {}
    for access_key, value in parsed.items():
        if not isinstance(value, dict):
            continue
        user_code = str(value.get("id") or "").strip()
        if not user_code:
            continue
        permissions = value.get("permissions") or {}
        result[access_key] = {
            "id": user_code,
            "name": str(value.get("name") or user_code),
            "role": normalize_role_code(str(value.get("role") or "")),
            "permissions": {
                permission_key: bool(is_granted)
                for permission_key, is_granted in permissions.items()
                if permission_key in ALL_PERMISSION_KEYS
            },
        }

    return result
