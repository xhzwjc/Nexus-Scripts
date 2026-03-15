import json
import logging
from typing import Any, Dict, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from ..rbac_models import ScriptHubAuditLog

logger = logging.getLogger("script_hub_audit")

REDACTED_FIELDS = {"access_key", "generated_access_key", "token"}


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
    result: str = "success",
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
    message = {
        "actor_user_code": actor_user_code,
        "actor_display_name": actor_display_name,
        "action": action,
        "target_type": target_type,
        "target_code": target_code,
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
