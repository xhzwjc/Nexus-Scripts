import json
import logging
from typing import Any, Dict, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from ..permission_governance import (
    build_permission_context,
    is_sensitive_audit_action,
    resource_is_visible_to_context,
)
from ..rbac_models import ScriptHubAuditLog

logger = logging.getLogger("script_hub_audit")

REDACTED_FIELDS = {"access_key", "generated_access_key", "token", "password", "api_key_value", "api_key"}


def sanitize_audit_payload(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not payload:
        return {}

    sanitized: Dict[str, Any] = {}
    for key, value in payload.items():
        if key in REDACTED_FIELDS:
            sanitized[key] = "***redacted***"
        else:
            sanitized[key] = value
    return sanitized


def _parse_details(details: Optional[str]) -> Dict[str, Any]:
    if not details:
        return {}
    try:
        parsed = json.loads(details)
    except json.JSONDecodeError:
        return {"raw": details}
    return parsed if isinstance(parsed, dict) else {"value": parsed}


def serialize_audit_log(entry: ScriptHubAuditLog) -> Dict[str, Any]:
    return {
        "id": entry.id,
        "actor_user_code": entry.actor_user_code,
        "actor_display_name": entry.actor_display_name,
        "action": entry.action,
        "target_type": entry.target_type,
        "target_code": entry.target_code,
        "target_org_code": entry.target_org_code,
        "sensitivity": entry.sensitivity,
        "result": entry.result,
        "ip_address": entry.ip_address,
        "user_agent": entry.user_agent,
        "details": _parse_details(entry.details),
        "created_at": entry.created_at,
    }


def write_audit_log(
    db: Session,
    *,
    actor: Optional[Dict[str, Any]],
    request: Optional[Request],
    action: str,
    target_type: str,
    target_code: str,
    target_org_code: Optional[str] = None,
    result: str = "success",
    sensitivity: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    actor_user_code = str((actor or {}).get("id") or "")
    actor_display_name = str((actor or {}).get("name") or "")
    ip_address = None
    user_agent = None

    if request is not None:
        forwarded_for = request.headers.get("x-forwarded-for", "")
        ip_address = forwarded_for.split(",")[0].strip() or (
            request.client.host if request.client else None
        )
        user_agent = request.headers.get("user-agent") or None

    payload = sanitize_audit_payload(details)
    resolved_sensitivity = (
        sensitivity
        or ("sensitive" if is_sensitive_audit_action(action, target_type, payload) else "normal")
    )
    message = {
        "actor_user_code": actor_user_code,
        "actor_display_name": actor_display_name,
        "action": action,
        "target_type": target_type,
        "target_code": target_code,
        "target_org_code": target_org_code,
        "sensitivity": resolved_sensitivity,
        "result": result,
        "ip_address": ip_address,
        "details": payload,
    }

    if result == "success":
        logger.info("[ScriptHubAudit] %s", json.dumps(message, ensure_ascii=False))
    else:
        logger.warning("[ScriptHubAudit] %s", json.dumps(message, ensure_ascii=False))

    db.add(
        ScriptHubAuditLog(
            actor_user_code=actor_user_code or None,
            actor_display_name=actor_display_name or None,
            action=action,
            target_type=target_type,
            target_code=target_code,
            target_org_code=target_org_code,
            sensitivity=resolved_sensitivity,
            result=result,
            ip_address=ip_address,
            user_agent=user_agent,
            details=json.dumps(payload, ensure_ascii=False) if payload else None,
        )
    )
    db.commit()


def list_recent_audit_logs(db: Session, limit: int = 50) -> list[Dict[str, Any]]:
    rows = (
        db.query(ScriptHubAuditLog)
        .order_by(ScriptHubAuditLog.created_at.desc(), ScriptHubAuditLog.id.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    return [serialize_audit_log(row) for row in rows]


def list_recent_audit_logs_for_session(
    db: Session,
    *,
    session: Optional[Dict[str, Any]],
    limit: int = 50,
) -> list[Dict[str, Any]]:
    context = build_permission_context(db, session)
    can_view_sensitive = bool(context.permissions.get("audit-log-sensitive-view"))
    rows = (
        db.query(ScriptHubAuditLog)
        .order_by(ScriptHubAuditLog.created_at.desc(), ScriptHubAuditLog.id.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    result: list[Dict[str, Any]] = []
    for row in rows:
        if row.target_org_code and not resource_is_visible_to_context(
            db,
            context,
            resource_org_code=row.target_org_code,
        ):
            continue
        if not context.permissions.get("audit-log-view") and row.actor_user_code != context.actor_user_code:
            continue
        payload = serialize_audit_log(row)
        if row.sensitivity == "sensitive" and not can_view_sensitive:
            payload["details"] = {"sensitive": "***redacted***"}
        result.append(payload)
    return result
