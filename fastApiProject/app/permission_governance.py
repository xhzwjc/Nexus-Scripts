import json
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional, Sequence, Set

from sqlalchemy.orm import Session


ROOT_ORG_CODE = "group"

DATA_SCOPE_ALL = "ALL"
DATA_SCOPE_ORG_AND_CHILDREN = "ORG_AND_CHILDREN"
DATA_SCOPE_ORG_ONLY = "ORG_ONLY"
DATA_SCOPE_CUSTOM_ORGS = "CUSTOM_ORGS"
DATA_SCOPE_SELF = "SELF"

DATA_SCOPE_VALUES = {
    DATA_SCOPE_ALL,
    DATA_SCOPE_ORG_AND_CHILDREN,
    DATA_SCOPE_ORG_ONLY,
    DATA_SCOPE_CUSTOM_ORGS,
    DATA_SCOPE_SELF,
}

SHARE_POLICY_PRIVATE = "PRIVATE"
SHARE_POLICY_SHARED_READONLY = "SHARED_READONLY"
SHARE_POLICY_SHARED_COPYABLE = "SHARED_COPYABLE"
SHARE_POLICY_PUBLIC_IN_GROUP = "PUBLIC_IN_GROUP"

SHARE_POLICY_VALUES = {
    SHARE_POLICY_PRIVATE,
    SHARE_POLICY_SHARED_READONLY,
    SHARE_POLICY_SHARED_COPYABLE,
    SHARE_POLICY_PUBLIC_IN_GROUP,
}

LEGACY_RECRUITMENT_VIEW_PERMISSIONS = {
    "recruitment-dashboard-view",
    "recruitment-position-manage",
    "recruitment-candidate-manage",
    "recruitment-process-execute",
    "recruitment-log-view",
    "recruitment-skill-view",
    "recruitment-skill-bind",
    "recruitment-mail-view",
    "recruitment-mail-send",
}

LEGACY_RECRUITMENT_MANAGE_PERMISSIONS = {
    "recruitment-skill-manage",
    "recruitment-mail-config-manage",
    "recruitment-mail-sender-manage",
    "recruitment-llm-config-view",
    "recruitment-llm-config-manage",
    "resource-sharing-manage",
}

SENSITIVE_AUDIT_ACTION_MARKERS = (
    "rotate_key",
    "smtp",
    "mail-sender",
    "llm",
    "api_key",
    "password",
)


@dataclass(frozen=True)
class PermissionContext:
    actor_user_code: str
    primary_org_code: str
    data_scope: str
    custom_org_codes: tuple[str, ...]
    visible_org_codes: Optional[tuple[str, ...]]
    is_self_scope: bool
    permissions: Dict[str, bool]

    @property
    def has_all_orgs(self) -> bool:
        return self.visible_org_codes is None


def _loads_json(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        parsed = json.loads(str(value or ""))
    except Exception:
        return fallback
    return parsed


def normalize_org_code(value: Any) -> str:
    text = str(value or "").strip()
    return text or ROOT_ORG_CODE


def normalize_data_scope(value: Any) -> str:
    text = str(value or "").strip().upper()
    return text if text in DATA_SCOPE_VALUES else DATA_SCOPE_ORG_ONLY


def normalize_share_policy(value: Any) -> str:
    text = str(value or "").strip().upper()
    return text if text in SHARE_POLICY_VALUES else SHARE_POLICY_PRIVATE


def normalize_org_code_list(values: Any) -> list[str]:
    parsed = _loads_json(values, values)
    if isinstance(parsed, str):
        parsed = [item.strip() for item in parsed.split(",")]
    if not isinstance(parsed, Iterable):
        return []
    result: list[str] = []
    seen: Set[str] = set()
    for value in parsed:
        item = normalize_org_code(value)
        if item and item not in seen:
            result.append(item)
            seen.add(item)
    return result


def expand_permission_aliases(permissions: Dict[str, bool]) -> Dict[str, bool]:
    expanded = {key: bool(value) for key, value in (permissions or {}).items() if value}

    if expanded.get("ai-recruitment"):
        expanded.update({key: True for key in LEGACY_RECRUITMENT_VIEW_PERMISSIONS})

    if expanded.get("ai-recruitment-manage"):
        expanded["ai-recruitment"] = True
        expanded.update({key: True for key in LEGACY_RECRUITMENT_VIEW_PERMISSIONS})
        expanded.update({key: True for key in LEGACY_RECRUITMENT_MANAGE_PERMISSIONS})

    if expanded.get("rbac-manage"):
        expanded["audit-log-view"] = True

    return expanded


def has_permission(session: Optional[Dict[str, Any]], permission: Optional[str]) -> bool:
    if not permission:
        return True
    permissions = expand_permission_aliases(dict((session or {}).get("permissions") or {}))
    return bool(permissions.get(permission))


def has_any_permission(session: Optional[Dict[str, Any]], permissions: Sequence[str]) -> bool:
    required = [permission for permission in permissions if permission]
    if not required:
        return True
    expanded = expand_permission_aliases(dict((session or {}).get("permissions") or {}))
    return any(expanded.get(permission) for permission in required)


def _get_all_org_codes(db: Session) -> list[str]:
    from .rbac_models import ScriptHubOrganization

    rows = (
        db.query(ScriptHubOrganization.org_code)
        .filter(ScriptHubOrganization.is_active.is_(True))
        .order_by(ScriptHubOrganization.path.asc(), ScriptHubOrganization.org_code.asc())
        .all()
    )
    return [org_code for org_code, in rows] or [ROOT_ORG_CODE]


def get_descendant_org_codes(db: Session, org_code: str) -> list[str]:
    from .rbac_models import ScriptHubOrganization

    normalized = normalize_org_code(org_code)
    org = (
        db.query(ScriptHubOrganization)
        .filter(ScriptHubOrganization.org_code == normalized, ScriptHubOrganization.is_active.is_(True))
        .first()
    )
    if not org:
        return [normalized]

    prefix = f"{org.path}/"
    rows = (
        db.query(ScriptHubOrganization.org_code)
        .filter(
            ScriptHubOrganization.is_active.is_(True),
            (ScriptHubOrganization.org_code == normalized) | ScriptHubOrganization.path.like(f"{prefix}%"),
        )
        .order_by(ScriptHubOrganization.path.asc(), ScriptHubOrganization.org_code.asc())
        .all()
    )
    return [item for item, in rows] or [normalized]


def is_ancestor_org(db: Session, ancestor_org_code: str, descendant_org_code: str) -> bool:
    from .rbac_models import ScriptHubOrganization

    ancestor = normalize_org_code(ancestor_org_code)
    descendant = normalize_org_code(descendant_org_code)
    if ancestor == descendant:
        return True

    ancestor_row = (
        db.query(ScriptHubOrganization)
        .filter(ScriptHubOrganization.org_code == ancestor, ScriptHubOrganization.is_active.is_(True))
        .first()
    )
    descendant_row = (
        db.query(ScriptHubOrganization)
        .filter(ScriptHubOrganization.org_code == descendant, ScriptHubOrganization.is_active.is_(True))
        .first()
    )
    if not ancestor_row or not descendant_row:
        return False
    return str(descendant_row.path or "").startswith(f"{ancestor_row.path}/")


def build_permission_context(db: Session, session: Optional[Dict[str, Any]]) -> PermissionContext:
    payload = session or {}
    primary_org_code = normalize_org_code(payload.get("primaryOrgCode") or payload.get("primary_org_code"))
    data_scope = normalize_data_scope(payload.get("dataScope") or payload.get("data_scope"))
    role_codes = {str(item or "").strip() for item in (payload.get("roles") or [])}
    if bool(payload.get("isSuperAdmin")) or str(payload.get("role") or "").strip() == "admin" or "admin" in role_codes:
        data_scope = DATA_SCOPE_ALL
    custom_org_codes = tuple(normalize_org_code_list(payload.get("customOrgCodes") or payload.get("custom_org_codes")))
    permissions = expand_permission_aliases(dict(payload.get("permissions") or {}))

    if data_scope == DATA_SCOPE_ALL:
        visible_org_codes: Optional[tuple[str, ...]] = None
    elif data_scope == DATA_SCOPE_ORG_AND_CHILDREN:
        visible_org_codes = tuple(get_descendant_org_codes(db, primary_org_code))
    elif data_scope == DATA_SCOPE_CUSTOM_ORGS:
        visible_org_codes = tuple(custom_org_codes or (primary_org_code,))
    else:
        visible_org_codes = (primary_org_code,)

    return PermissionContext(
        actor_user_code=str(payload.get("id") or ""),
        primary_org_code=primary_org_code,
        data_scope=data_scope,
        custom_org_codes=custom_org_codes,
        visible_org_codes=visible_org_codes,
        is_self_scope=data_scope == DATA_SCOPE_SELF,
        permissions=permissions,
    )


def resource_is_visible_to_context(
    db: Session,
    context: PermissionContext,
    *,
    resource_org_code: Any,
    share_policy: Any = SHARE_POLICY_PRIVATE,
    allow_sub_org_use: Any = False,
) -> bool:
    org_code = normalize_org_code(resource_org_code)
    policy = normalize_share_policy(share_policy)
    if context.has_all_orgs:
        return True
    visible_orgs = set(context.visible_org_codes or ())
    if org_code in visible_orgs:
        return True
    if not bool(allow_sub_org_use) or policy == SHARE_POLICY_PRIVATE:
        return False
    return any(is_ancestor_org(db, org_code, visible_org) for visible_org in visible_orgs)


def is_sensitive_audit_action(action: Any, target_type: Any = None, details: Optional[Dict[str, Any]] = None) -> bool:
    haystack = " ".join(
        [
            str(action or ""),
            str(target_type or ""),
            " ".join(str(key or "") for key in (details or {}).keys()),
        ]
    ).lower()
    return any(marker in haystack for marker in SENSITIVE_AUDIT_ACTION_MARKERS)
