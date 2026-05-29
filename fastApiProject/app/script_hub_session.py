import base64
import hashlib
import hmac
import json
import os
import threading
import time
from typing import Any, Callable, Dict, Optional, Sequence, Tuple

from fastapi import HTTPException, Request, status

from .permission_governance import has_any_permission, has_permission

DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000
DEFAULT_SESSION_REFRESH_CACHE_TTL_MS = 30 * 1000
DEFAULT_SESSION_REFRESH_CACHE_MAX_ENTRIES = 512

_session_refresh_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_session_refresh_cache_lock = threading.RLock()


def invalidate_script_hub_session_refresh_cache(user_code: Optional[str] = None) -> None:
    normalized_user_code = str(user_code or "").strip()
    with _session_refresh_cache_lock:
        if not normalized_user_code:
            _session_refresh_cache.clear()
            return
        prefix = f"{normalized_user_code}:"
        for cache_key in list(_session_refresh_cache.keys()):
            if cache_key.startswith(prefix):
                _session_refresh_cache.pop(cache_key, None)


def _get_session_secret() -> bytes:
    configured = (os.getenv("SCRIPT_HUB_SESSION_SECRET") or "").strip()
    if configured:
        return configured.encode("utf-8")

    environment = (os.getenv("ENVIRONMENT") or "local").lower()
    if environment != "local":
        raise RuntimeError(
            "SCRIPT_HUB_SESSION_SECRET environment variable is required in non-local environments. "
            "Generated tokens would be insecure with the default secret."
        )

    # Only for local development - warn that this is insecure
    import warnings
    warnings.warn(
        "Using default session secret in local environment. "
        "Set SCRIPT_HUB_SESSION_SECRET for production-like testing.",
        UserWarning,
        stacklevel=2,
    )
    return "script-hub-dev-session-secret-change-me".encode("utf-8")


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


def _get_session_refresh_cache_ttl_ms() -> int:
    raw = os.getenv("SCRIPT_HUB_SESSION_REFRESH_CACHE_TTL_MS") or ""
    try:
        parsed = int(raw) if raw else DEFAULT_SESSION_REFRESH_CACHE_TTL_MS
    except ValueError:
        parsed = DEFAULT_SESSION_REFRESH_CACHE_TTL_MS
    return max(0, parsed)


def _get_session_refresh_cache_max_entries() -> int:
    raw = os.getenv("SCRIPT_HUB_SESSION_REFRESH_CACHE_MAX_ENTRIES") or ""
    try:
        parsed = int(raw) if raw else DEFAULT_SESSION_REFRESH_CACHE_MAX_ENTRIES
    except ValueError:
        parsed = DEFAULT_SESSION_REFRESH_CACHE_MAX_ENTRIES
    return max(0, parsed)


def _get_session_refresh_cache_key(session: Dict[str, Any]) -> str:
    user_code = str(session.get("id") or "").strip()
    permission_version = str(session.get("permissionVersion") or "")
    issued_at = str(session.get("iat") or "")
    expires_at = str(session.get("exp") or "")
    return f"{user_code}:{permission_version}:{issued_at}:{expires_at}"


def _get_cached_versioned_session(cache_key: str, now: float) -> Optional[Dict[str, Any]]:
    if _get_session_refresh_cache_ttl_ms() <= 0:
        return None

    with _session_refresh_cache_lock:
        entry = _session_refresh_cache.get(cache_key)
        if not entry:
            return None

        expires_at, cached_session = entry
        if expires_at <= now:
            _session_refresh_cache.pop(cache_key, None)
            return None

        return dict(cached_session)


def _set_cached_versioned_session(cache_key: str, session: Dict[str, Any], now: float) -> None:
    ttl_ms = _get_session_refresh_cache_ttl_ms()
    max_entries = _get_session_refresh_cache_max_entries()
    if ttl_ms <= 0 or max_entries <= 0:
        return

    expires_at = now + ttl_ms / 1000
    with _session_refresh_cache_lock:
        if len(_session_refresh_cache) >= max_entries:
            expired_keys = [
                key
                for key, (entry_expires_at, _) in _session_refresh_cache.items()
                if entry_expires_at <= now
            ]
            for key in expired_keys:
                _session_refresh_cache.pop(key, None)

        if len(_session_refresh_cache) >= max_entries:
            oldest_key = min(
                _session_refresh_cache,
                key=lambda key: _session_refresh_cache[key][0],
                default=None,
            )
            if oldest_key:
                _session_refresh_cache.pop(oldest_key, None)

        _session_refresh_cache[cache_key] = (expires_at, dict(session))


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
            "isSuperAdmin": bool(payload.get("isSuperAdmin")),
            "primaryOrgCode": payload.get("primaryOrgCode") or "group",
            "dataScope": payload.get("dataScope") or "ORG_ONLY",
            "customOrgCodes": payload.get("customOrgCodes") or [],
            "authorizationBoundary": payload.get("authorizationBoundary") or {},
            "permissionVersion": int(payload.get("permissionVersion") or 1),
            "teamResourcesLoginKeyEnabled": bool(payload.get("teamResourcesLoginKeyEnabled")),
            "landingPage": payload.get("landingPage") or "home",
            "recruitmentMenuGrouped": payload.get("recruitmentMenuGrouped") is not False,
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


def _refresh_versioned_session(session: Dict[str, Any]) -> Dict[str, Any]:
    if "permissionVersion" not in session:
        return session

    user_code = str(session.get("id") or "").strip()
    if not user_code:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session payload")

    cache_key = _get_session_refresh_cache_key(session)
    now = time.monotonic()
    cached_session = _get_cached_versioned_session(cache_key, now)
    if cached_session is not None:
        return cached_session

    from .database import SessionLocal
    from .services.script_hub_auth_service import get_session_user_by_code

    db = SessionLocal()
    try:
        user = get_session_user_by_code(db, user_code)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
        _set_cached_versioned_session(cache_key, user, now)
        return user
    finally:
        db.close()


def require_script_hub_permission(permission: Optional[str] = None) -> Callable[[Request], Dict[str, Any]]:
    async def dependency(request: Request) -> Dict[str, Any]:
        token = get_script_hub_token_from_request(request)
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

        session = verify_script_hub_session(token)
        if not session:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
        session = _refresh_versioned_session(session)

        if permission and not has_permission(session, permission):
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
        session = _refresh_versioned_session(session)

        if required and not has_any_permission(session, required):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

        request.state.script_hub_session = session
        return session

    return dependency
