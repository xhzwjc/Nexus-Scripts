import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Callable, Dict, Optional, Sequence

from fastapi import HTTPException, Request, status

DEFAULT_SESSION_SECRET = "script-hub-dev-session-secret-change-me"
DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000


def _get_session_secret() -> bytes:
    configured = (os.getenv("SCRIPT_HUB_SESSION_SECRET") or "").strip()
    if configured:
        return configured.encode("utf-8")

    if (os.getenv("ENVIRONMENT") or "local").lower() != "local":
        raise RuntimeError("Missing SCRIPT_HUB_SESSION_SECRET environment variable")

    return DEFAULT_SESSION_SECRET.encode("utf-8")


def _base64url_decode(value: str) -> bytes:
    normalized = value.replace("-", "+").replace("_", "/")
    padding = "=" * ((4 - len(normalized) % 4) % 4)
    return base64.b64decode(f"{normalized}{padding}")


def _sign(payload_segment: str) -> str:
    digest = hmac.new(_get_session_secret(), payload_segment.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def get_script_hub_token_from_request(request: Request) -> Optional[str]:
    authorization = request.headers.get("authorization", "")
    if not authorization.startswith("Bearer "):
        return None
    return authorization[len("Bearer "):].strip()


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _get_session_ttl_ms() -> int:
    raw = os.getenv("SCRIPT_HUB_SESSION_TTL_MS") or ""
    try:
        parsed = int(raw) if raw else DEFAULT_SESSION_TTL_MS
    except ValueError:
        parsed = DEFAULT_SESSION_TTL_MS
    return parsed if parsed > 0 else DEFAULT_SESSION_TTL_MS


def create_script_hub_session(user: Dict[str, Any]) -> Dict[str, Any]:
    now = int(time.time() * 1000)
    payload = {
        **user,
        "iat": now,
        "exp": now + _get_session_ttl_ms(),
    }

    payload_segment = _base64url_encode(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    signature = _sign(payload_segment)
    token = f"{payload_segment}.{signature}"
    return {
        "token": token,
        "user": {
            "id": payload.get("id"),
            "role": payload.get("role"),
            "roles": payload.get("roles") or [],
            "name": payload.get("name"),
            "permissions": payload.get("permissions") or {},
            "teamResourcesLoginKeyEnabled": bool(payload.get("teamResourcesLoginKeyEnabled")),
        },
        "expiresAt": payload["exp"],
    }


def verify_script_hub_session(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload_segment, signature = token.split(".", 1)
    except ValueError:
        return None

    expected = _sign(payload_segment)
    if not hmac.compare_digest(signature, expected):
        return None

    try:
        payload = json.loads(_base64url_decode(payload_segment).decode("utf-8"))
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None

    expires_at = payload.get("exp")
    if not isinstance(expires_at, (int, float)) or int(time.time() * 1000) > int(expires_at):
        return None

    return payload


def require_script_hub_permission(permission: Optional[str] = None) -> Callable[[Request], Dict[str, Any]]:
    async def dependency(request: Request) -> Dict[str, Any]:
        token = get_script_hub_token_from_request(request)
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

        session = verify_script_hub_session(token)
        if not session:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

        permissions = session.get("permissions") or {}
        if permission and not permissions.get(permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        request.state.script_hub_session = session
        return session

    return dependency


def require_script_hub_any_permission(permissions: Sequence[str]) -> Callable[[Request], Dict[str, Any]]:
    required = tuple(permission for permission in permissions if permission)

    async def dependency(request: Request) -> Dict[str, Any]:
        token = get_script_hub_token_from_request(request)
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

        session = verify_script_hub_session(token)
        if not session:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

        session_permissions = session.get("permissions") or {}
        if required and not any(session_permissions.get(permission) for permission in required):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        request.state.script_hub_session = session
        return session

    return dependency
