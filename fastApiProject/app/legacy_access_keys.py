import json
import os
import secrets
from pathlib import Path
from typing import Any, Dict

from .rbac_catalog import ALL_PERMISSION_KEYS, normalize_role_code


def _normalize_bootstrap_entries(parsed: Any, *, source_label: str) -> Dict[str, Dict[str, Any]]:
    payload = parsed.get("users") if isinstance(parsed, dict) and isinstance(parsed.get("users"), dict) else parsed
    if not isinstance(payload, dict):
        raise RuntimeError(f"{source_label} must be an object")

    result: Dict[str, Dict[str, Any]] = {}
    for access_key, value in payload.items():
        if not isinstance(value, dict):
            continue
        user_code = str(value.get("id") or "").strip()
        if not user_code:
            continue
        permissions = value.get("permissions") or {}
        result[str(access_key).strip()] = {
            "id": user_code,
            "name": str(value.get("name") or user_code),
            "role": normalize_role_code(str(value.get("role") or "")),
            "permissions": {
                permission_key: bool(is_granted)
                for permission_key, is_granted in permissions.items()
                if permission_key in ALL_PERMISSION_KEYS
            },
        }

    return {key: value for key, value in result.items() if key}


def parse_legacy_access_keys_from_env() -> Dict[str, Dict[str, Any]]:
    raw = (os.getenv("SCRIPT_HUB_ACCESS_KEYS_JSON") or "").strip()
    if not raw:
        return {}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid SCRIPT_HUB_ACCESS_KEYS_JSON: {exc}") from exc

    return _normalize_bootstrap_entries(parsed, source_label="SCRIPT_HUB_ACCESS_KEYS_JSON")


def parse_bootstrap_access_keys_from_file(file_path: str) -> Dict[str, Dict[str, Any]]:
    resolved = Path(file_path).expanduser().resolve()
    if not resolved.exists():
        raise RuntimeError(f"Bootstrap user file not found: {resolved}")

    try:
        parsed = json.loads(resolved.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid bootstrap user JSON in {resolved}: {exc}") from exc

    return _normalize_bootstrap_entries(parsed, source_label=f"bootstrap file {resolved}")


def load_bootstrap_access_keys() -> tuple[Dict[str, Dict[str, Any]], str | None]:
    file_path = (os.getenv("SCRIPT_HUB_BOOTSTRAP_USERS_FILE") or "").strip()
    if file_path:
        return parse_bootstrap_access_keys_from_file(file_path), "bootstrap_users_file"

    legacy = parse_legacy_access_keys_from_env()
    if legacy:
        return legacy, "deprecated_env"

    return {}, None


def get_bootstrap_admin_key() -> str | None:
    configured = (os.getenv("SCRIPT_HUB_BOOTSTRAP_ADMIN_KEY") or "").strip()
    return configured or None


def generate_bootstrap_admin_key() -> str:
    return f"sh_{secrets.token_urlsafe(24).replace('-', 'A').replace('_', 'B')[:28]}"
