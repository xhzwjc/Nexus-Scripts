#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import secrets
import sys
from pathlib import Path
from typing import Any

from bootstrap_local_mysql_data import (
    ensure_env_loaded,
    ensure_fastapi_path,
    ensure_local_database,
    fetch_table_counts,
    load_actions,
    maybe_reexec_with_project_python,
    print_table_counts,
    run_action,
    bootstrap_ai_resources,
    bootstrap_team_resources,
)


ROOT = Path(__file__).resolve().parent
DEFAULT_USERS_FILE = ROOT / "fastApiProject" / "data" / "bootstrap_users.local.json"
DEFAULT_RBAC_SEED_FILE = ROOT / "fastApiProject" / "data" / "script_hub_rbac_seed.json"
RECRUITMENT_TABLES = (
    "recruitment_positions",
    "recruitment_candidates",
    "recruitment_skills",
    "recruitment_rule_configs",
    "recruitment_llm_configs",
)

DEFAULT_RBAC_USERS = (
    {
        "user_code": "admin",
        "display_name": "System Administrator",
        "role_codes": ["admin"],
        "granted_permissions": [],
        "revoked_permissions": [],
        "team_resources_login_key_enabled": True,
        "is_active": True,
        "is_super_admin": True,
        "notes": None,
    },
    {
        "user_code": "resource_manager",
        "display_name": "Resource Manager",
        "role_codes": ["resource-manager"],
        "granted_permissions": [],
        "revoked_permissions": [],
        "team_resources_login_key_enabled": True,
        "is_active": True,
        "is_super_admin": False,
        "notes": None,
    },
    {
        "user_code": "recruitment_operator",
        "display_name": "Recruitment Operator",
        "role_codes": ["operator"],
        "granted_permissions": [],
        "revoked_permissions": [],
        "team_resources_login_key_enabled": True,
        "is_active": True,
        "is_super_admin": False,
        "notes": None,
    },
)


def _generate_access_key() -> str:
    return f"sh_{secrets.token_urlsafe(24).replace('-', 'A').replace('_', 'B')[:28]}"


def _normalize_string(value: Any) -> str:
    return str(value or "").strip()


def _normalize_optional_text(value: Any) -> str | None:
    normalized = _normalize_string(value)
    return normalized or None


def _normalize_string_list(values: Any) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    if not isinstance(values, list):
        return normalized

    for value in values:
        item = _normalize_string(value)
        if not item or item in seen:
            continue
        normalized.append(item)
        seen.add(item)
    return normalized


def _build_role_permissions(role_code: str) -> dict[str, bool]:
    ensure_fastapi_path()

    from app.rbac_catalog import ALL_PERMISSION_KEYS, ROLE_INDEX, normalize_role_code

    normalized_role_code = normalize_role_code(role_code)
    granted = (
        set(ALL_PERMISSION_KEYS)
        if normalized_role_code == "admin"
        else set(ROLE_INDEX[normalized_role_code].permissions)
    )
    return {permission_key: True for permission_key in sorted(granted)}


def _build_role_permission_map(seed_roles: list[dict[str, Any]]) -> dict[str, set[str]]:
    ensure_fastapi_path()

    from app.rbac_catalog import ROLE_INDEX

    role_permission_map = {
        role_code: set(definition.permissions)
        for role_code, definition in ROLE_INDEX.items()
    }
    for role in seed_roles:
        role_permission_map[role["code"]] = set(role["permission_keys"])
    return role_permission_map


def _resolve_primary_role(role_codes: list[str]) -> str:
    ensure_fastapi_path()

    from app.rbac_catalog import ROLE_INDEX

    normalized = [role_code for role_code in role_codes if role_code]
    if not normalized:
        return "custom"
    if "admin" in normalized:
        return "admin"

    ordered = sorted(
        normalized,
        key=lambda role_code: (
            ROLE_INDEX[role_code].sort_order if role_code in ROLE_INDEX else 999,
            role_code,
        ),
    )
    return ordered[0]


def _build_effective_permissions_for_seed_user(
    seed_user: dict[str, Any],
    role_permission_map: dict[str, set[str]],
) -> dict[str, bool]:
    ensure_fastapi_path()

    from app.permission_governance import expand_permission_aliases
    from app.rbac_catalog import ALL_PERMISSION_KEYS

    granted = set()
    if seed_user.get("is_super_admin") or "admin" in seed_user["role_codes"]:
        granted.update(ALL_PERMISSION_KEYS)
    else:
        for role_code in seed_user["role_codes"]:
            granted.update(role_permission_map.get(role_code, set()))

    granted.update(seed_user["granted_permissions"])
    granted.difference_update(seed_user["revoked_permissions"])
    return expand_permission_aliases({permission_key: True for permission_key in sorted(granted)})


def _normalize_rbac_seed_role(raw_role: Any) -> dict[str, Any]:
    ensure_fastapi_path()

    from app.rbac_catalog import ALL_PERMISSION_KEYS

    if not isinstance(raw_role, dict):
        raise RuntimeError("RBAC seed role entries must be objects")

    role_code = _normalize_string(raw_role.get("code")).lower()
    role_name = _normalize_string(raw_role.get("name"))
    permission_keys = [
        permission_key
        for permission_key in _normalize_string_list(raw_role.get("permission_keys"))
        if permission_key in ALL_PERMISSION_KEYS
    ]
    if not role_code or not role_name:
        raise RuntimeError("RBAC seed roles require both code and name")
    if not permission_keys:
        raise RuntimeError(f"RBAC seed role '{role_code}' must include at least one permission")

    return {
        "code": role_code,
        "name": role_name,
        "description": _normalize_optional_text(raw_role.get("description")),
        "permission_keys": permission_keys,
        "is_active": bool(raw_role.get("is_active", True)),
    }


def _normalize_rbac_seed_user(raw_user: Any) -> dict[str, Any]:
    if not isinstance(raw_user, dict):
        raise RuntimeError("RBAC seed user entries must be objects")

    user_code = _normalize_string(raw_user.get("user_code")).lower()
    display_name = _normalize_string(raw_user.get("display_name"))
    role_codes = [role_code.lower() for role_code in _normalize_string_list(raw_user.get("role_codes"))]
    if not user_code or not display_name:
        raise RuntimeError("RBAC seed users require both user_code and display_name")
    if not role_codes:
        raise RuntimeError(f"RBAC seed user '{user_code}' must include at least one role")

    return {
        "user_code": user_code,
        "display_name": display_name,
        "role_codes": role_codes,
        "granted_permissions": _normalize_string_list(raw_user.get("granted_permissions")),
        "revoked_permissions": _normalize_string_list(raw_user.get("revoked_permissions")),
        "team_resources_login_key_enabled": bool(raw_user.get("team_resources_login_key_enabled", True)),
        "is_active": bool(raw_user.get("is_active", True)),
        "is_super_admin": bool(raw_user.get("is_super_admin", False)),
        "notes": _normalize_optional_text(raw_user.get("notes")),
    }


def _default_rbac_seed() -> dict[str, Any]:
    return {
        "version": 1,
        "roles": [],
        "users": [_normalize_rbac_seed_user(user) for user in DEFAULT_RBAC_USERS],
    }


def load_rbac_seed(seed_file: Path | None) -> tuple[dict[str, Any], bool]:
    if seed_file is None or not seed_file.exists():
        return _default_rbac_seed(), False

    payload = json.loads(seed_file.read_text(encoding="utf-8"))
    roles = [_normalize_rbac_seed_role(role) for role in payload.get("roles", [])]
    users = [_normalize_rbac_seed_user(user) for user in payload.get("users", [])]
    if not users:
        raise RuntimeError(f"RBAC seed file {seed_file} must include at least one user")

    custom_role_codes = {role["code"] for role in roles}
    for user in users:
        missing_roles = [
            role_code
            for role_code in user["role_codes"]
            if role_code not in custom_role_codes and not _build_role_permissions(role_code)
        ]
        if missing_roles:
            raise RuntimeError(
                f"RBAC seed user '{user['user_code']}' references unknown roles: {', '.join(missing_roles)}"
            )

    return {"version": int(payload.get("version") or 1), "roles": roles, "users": users}, True


def _normalize_legacy_bootstrap_users_payload(payload: Any) -> dict[str, Any]:
    users = payload.get("users") if isinstance(payload, dict) else None
    if not isinstance(users, dict):
        raise RuntimeError("Bootstrap users file must be a JSON object with a top-level 'users' object")

    normalized: dict[str, Any] = {"users": {}}
    for access_key, raw_user in users.items():
        if not isinstance(raw_user, dict):
            continue
        user_code = _normalize_string(raw_user.get("id")).lower()
        if not user_code:
            continue
        role_codes = [
            role_code.lower()
            for role_code in _normalize_string_list(raw_user.get("role_codes"))
        ]
        primary_role = _normalize_string(raw_user.get("role") or "operator").lower()
        if not role_codes:
            role_codes = [primary_role]

        normalized["users"][_normalize_string(access_key)] = {
            "id": user_code,
            "name": _normalize_string(raw_user.get("name") or user_code),
            "role": _resolve_primary_role(role_codes),
            "role_codes": role_codes,
            "granted_permissions": _normalize_string_list(raw_user.get("granted_permissions")),
            "revoked_permissions": _normalize_string_list(raw_user.get("revoked_permissions")),
            "team_resources_login_key_enabled": bool(raw_user.get("team_resources_login_key_enabled", True)),
            "is_active": bool(raw_user.get("is_active", True)),
            "is_super_admin": bool(raw_user.get("is_super_admin", primary_role == "admin")),
            "notes": _normalize_optional_text(raw_user.get("notes")),
            "permissions": raw_user.get("permissions") or {},
        }
    return normalized


def load_or_create_bootstrap_users(
    users_file: Path,
    seed_payload: dict[str, Any],
    regenerate_keys: bool,
) -> tuple[dict[str, Any], bool]:
    existing_users_by_code: dict[str, tuple[str, dict[str, Any]]] = {}
    reused_existing = False
    if users_file.exists() and not regenerate_keys:
        payload = _normalize_legacy_bootstrap_users_payload(json.loads(users_file.read_text(encoding="utf-8")))
        reused_existing = True
        for access_key, user in payload["users"].items():
            existing_users_by_code[user["id"]] = (access_key, user)

    role_permission_map = _build_role_permission_map(seed_payload["roles"])
    payload: dict[str, Any] = {"users": {}}
    for seed_user in seed_payload["users"]:
        existing = existing_users_by_code.get(seed_user["user_code"])
        access_key = existing[0] if existing else _generate_access_key()
        effective_permissions = _build_effective_permissions_for_seed_user(seed_user, role_permission_map)
        payload["users"][access_key] = {
            "id": seed_user["user_code"],
            "name": seed_user["display_name"],
            "role": _resolve_primary_role(seed_user["role_codes"]),
            "role_codes": seed_user["role_codes"],
            "granted_permissions": seed_user["granted_permissions"],
            "revoked_permissions": seed_user["revoked_permissions"],
            "team_resources_login_key_enabled": seed_user["team_resources_login_key_enabled"],
            "is_active": seed_user["is_active"],
            "is_super_admin": seed_user["is_super_admin"],
            "notes": seed_user["notes"],
            "permissions": effective_permissions,
        }

    users_file.parent.mkdir(parents=True, exist_ok=True)
    users_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload, reused_existing


def print_bootstrap_users(users_payload: dict[str, Any], users_file: Path) -> None:
    print(f"Bootstrap users file: {users_file}")
    print("Generated / reusable access keys:")
    for access_key, user in users_payload["users"].items():
        print(f"  - {user['id']} ({user['role']}): {access_key}")


def bootstrap_recruitment_schema(db_config: dict[str, object], dry_run: bool) -> None:
    counts = fetch_table_counts(db_config, RECRUITMENT_TABLES)
    print_table_counts("Recruitment table status:", counts)

    ensure_fastapi_path()
    from app.schema_maintenance import ensure_recruitment_schema

    success = run_action(
        "Ensuring recruitment schema and default seeds...",
        dry_run,
        lambda: ensure_recruitment_schema() or True,
    )
    if not success:
        raise RuntimeError("Recruitment schema initialization reported failure.")

    if not dry_run:
        after = fetch_table_counts(db_config, RECRUITMENT_TABLES)
        print_table_counts("Recruitment table status after initialization:", after)


def _apply_rbac_seed(
    *,
    seed_payload: dict[str, Any],
    users_payload: dict[str, Any],
    mode: str,
) -> None:
    ensure_fastapi_path()

    from app.database import SessionLocal
    from app.services.script_hub_admin_service import (
        create_rbac_role,
        create_rbac_user,
        delete_rbac_role,
        delete_rbac_user,
        list_rbac_overview,
        rotate_user_access_key,
        update_rbac_role,
        update_rbac_user,
    )
    from bootstrap_script_hub_rbac import ensure_tables, sync_permissions, sync_role_permissions, sync_roles

    access_key_by_user_code = {
        user["id"]: access_key
        for access_key, user in users_payload["users"].items()
    }

    ensure_tables()
    db = SessionLocal()
    try:
        sync_permissions(db)
        sync_roles(db)
        sync_role_permissions(db)
        db.commit()

        current = list_rbac_overview(db)
        existing_roles = {
            role["code"]: role
            for role in current["catalog"]["roles"]
        }
        existing_users = {
            user["user_code"]: user
            for user in current["users"]
        }

        for role in seed_payload["roles"]:
            if role["code"] in existing_roles:
                existing_role = existing_roles[role["code"]]
                if existing_role["is_system"]:
                    continue
                update_rbac_role(
                    db,
                    role["code"],
                    name=role["name"],
                    description=role["description"],
                    permission_keys=role["permission_keys"],
                    is_active=role["is_active"],
                )
            else:
                create_rbac_role(
                    db,
                    code=role["code"],
                    name=role["name"],
                    description=role["description"],
                    permission_keys=role["permission_keys"],
                )
                if not role["is_active"]:
                    update_rbac_role(
                        db,
                        role["code"],
                        is_active=False,
                    )

        for user in seed_payload["users"]:
            access_key = access_key_by_user_code[user["user_code"]]
            if user["user_code"] in existing_users:
                update_rbac_user(
                    db,
                    user["user_code"],
                    display_name=user["display_name"],
                    role_codes=user["role_codes"],
                    granted_permissions=user["granted_permissions"],
                    revoked_permissions=user["revoked_permissions"],
                    team_resources_login_key_enabled=user["team_resources_login_key_enabled"],
                    is_active=user["is_active"],
                    is_super_admin=user["is_super_admin"],
                    notes=user["notes"],
                )
                rotate_user_access_key(db, user["user_code"], access_key=access_key)
            else:
                create_rbac_user(
                    db,
                    user_code=user["user_code"],
                    display_name=user["display_name"],
                    access_key=access_key,
                    role_codes=user["role_codes"],
                    granted_permissions=user["granted_permissions"],
                    revoked_permissions=user["revoked_permissions"],
                    team_resources_login_key_enabled=user["team_resources_login_key_enabled"],
                    is_active=user["is_active"],
                    is_super_admin=user["is_super_admin"],
                    notes=user["notes"],
                )

        if mode == "overwrite":
            desired_user_codes = {user["user_code"] for user in seed_payload["users"]}
            desired_custom_role_codes = {role["code"] for role in seed_payload["roles"]}

            current = list_rbac_overview(db)
            for user in current["users"]:
                if user["user_code"] not in desired_user_codes:
                    delete_rbac_user(db, user["user_code"])

            current = list_rbac_overview(db)
            for role in current["catalog"]["roles"]:
                if not role["is_system"] and role["code"] not in desired_custom_role_codes:
                    delete_rbac_role(db, role["code"])
    finally:
        db.close()


def bootstrap_rbac_with_users(
    db_config: dict[str, object],
    mode: str,
    dry_run: bool,
    seed_payload: dict[str, Any],
    using_seed_file: bool,
    seed_file: Path | None,
    users_file: Path,
    users_payload: dict[str, Any],
) -> None:
    counts = fetch_table_counts(db_config, ("script_hub_permissions", "script_hub_roles", "script_hub_users"))
    print_table_counts("Script Hub RBAC table status:", counts)
    if using_seed_file and seed_file is not None:
        print(f"Using RBAC seed file: {seed_file}")
        print(
            "RBAC seed summary: "
            f"custom_roles={len(seed_payload['roles'])}, users={len(seed_payload['users'])}"
        )
    else:
        print("Using built-in minimal RBAC seed.")
    print_bootstrap_users(users_payload, users_file)

    success = run_action(
        "Bootstrapping Script Hub users / roles / permissions...",
        dry_run,
        lambda: _apply_rbac_seed(seed_payload=seed_payload, users_payload=users_payload, mode=mode),
    )
    if not success:
        raise RuntimeError("Script Hub bootstrap reported failure.")

    if not dry_run:
        after = fetch_table_counts(db_config, ("script_hub_permissions", "script_hub_roles", "script_hub_users"))
        print_table_counts("Script Hub RBAC table status after bootstrap:", after)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bootstrap team resources, AI resources, recruitment schema, and Script Hub RBAC.",
    )
    parser.add_argument(
        "--mode",
        choices=("fill-empty", "overwrite"),
        default="fill-empty",
        help="fill-empty: import into empty table groups only; overwrite: refresh AI/team resources and fully sync RBAC seed users/roles.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would run without modifying the database.",
    )
    parser.add_argument(
        "--users-file",
        default=str(DEFAULT_USERS_FILE),
        help="Where to store or read the generated bootstrap user access-key JSON file.",
    )
    parser.add_argument(
        "--rbac-seed-file",
        default=str(DEFAULT_RBAC_SEED_FILE),
        help="Safe RBAC seed JSON to sync users/roles from. If missing, the script falls back to built-in minimal users.",
    )
    parser.add_argument(
        "--regenerate-keys",
        action="store_true",
        help="Regenerate access keys for the users in the RBAC seed instead of reusing the existing bootstrap users file.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        maybe_reexec_with_project_python()
        ensure_env_loaded()
        db_config = ensure_local_database()
        run_ai, run_team, _run_rbac = load_actions()

        users_file = Path(args.users_file).expanduser().resolve()
        seed_file = Path(args.rbac_seed_file).expanduser().resolve()
        seed_payload, using_seed_file = load_rbac_seed(seed_file if seed_file.exists() else None)
        users_payload, reused_existing = load_or_create_bootstrap_users(users_file, seed_payload, args.regenerate_keys)

        print(f"Using Python: {sys.executable}")
        print(f"Bootstrap mode: {args.mode}")
        if using_seed_file:
            print("Using committed RBAC seed for user / role initialization.")
        else:
            print("RBAC seed file not found. Falling back to built-in minimal users.")
        if reused_existing:
            print("Reusing existing bootstrap access keys where user_code matched.")
        else:
            print("Created bootstrap access keys file.")
        if args.dry_run:
            print("Dry-run mode enabled. No data will be changed.")

        bootstrap_ai_resources(db_config, args.mode, args.dry_run, run_ai)
        bootstrap_team_resources(db_config, args.mode, args.dry_run, run_team)
        bootstrap_recruitment_schema(db_config, args.dry_run)
        bootstrap_rbac_with_users(
            db_config,
            args.mode,
            args.dry_run,
            seed_payload,
            using_seed_file,
            seed_file if using_seed_file else None,
            users_file,
            users_payload,
        )

        if not args.dry_run:
            print("Resources + recruitment bootstrap completed.")
        else:
            print("Dry-run completed.")
        return 0
    except Exception as exc:
        print(f"Bootstrap failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
