#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
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
RECRUITMENT_TABLES = (
    "recruitment_positions",
    "recruitment_candidates",
    "recruitment_skills",
    "recruitment_rule_configs",
    "recruitment_llm_configs",
)

DEFAULT_USERS = (
    {"id": "admin", "name": "System Administrator", "role": "admin"},
    {"id": "resource_manager", "name": "Resource Manager", "role": "resource-manager"},
    {"id": "recruitment_operator", "name": "Recruitment Operator", "role": "operator"},
)


def _generate_access_key() -> str:
    return f"sh_{secrets.token_urlsafe(24).replace('-', 'A').replace('_', 'B')[:28]}"


def _build_role_permissions(role_code: str) -> dict[str, bool]:
    ensure_fastapi_path()

    from app.rbac_catalog import ALL_PERMISSION_KEYS, ROLE_INDEX

    granted = set(ALL_PERMISSION_KEYS) if role_code == "admin" else set(ROLE_INDEX[role_code].permissions)
    return {permission_key: True for permission_key in sorted(granted)}


def _normalize_users_payload(payload: Any) -> dict[str, Any]:
    users = payload.get("users") if isinstance(payload, dict) else None
    if not isinstance(users, dict):
        raise RuntimeError("Bootstrap users file must be a JSON object with a top-level 'users' object")

    normalized: dict[str, Any] = {"users": {}}
    for access_key, raw_user in users.items():
        if not isinstance(raw_user, dict):
            continue
        role_code = str(raw_user.get("role") or "operator").strip()
        normalized["users"][str(access_key).strip()] = {
            "id": str(raw_user.get("id") or "").strip(),
            "name": str(raw_user.get("name") or raw_user.get("id") or "").strip(),
            "role": role_code,
            "permissions": raw_user.get("permissions") or _build_role_permissions(role_code),
        }
    return normalized


def load_or_create_bootstrap_users(users_file: Path, regenerate_keys: bool) -> tuple[dict[str, Any], bool]:
    if users_file.exists() and not regenerate_keys:
        payload = _normalize_users_payload(json.loads(users_file.read_text(encoding="utf-8")))
        users_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return payload, True

    payload: dict[str, Any] = {"users": {}}
    for user in DEFAULT_USERS:
        access_key = _generate_access_key()
        payload["users"][access_key] = {
            "id": user["id"],
            "name": user["name"],
            "role": user["role"],
            "permissions": _build_role_permissions(user["role"]),
        }

    users_file.parent.mkdir(parents=True, exist_ok=True)
    users_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload, False


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


def bootstrap_rbac_with_users(
    db_config: dict[str, object],
    dry_run: bool,
    users_file: Path,
    users_payload: dict[str, Any],
    run_rbac,
) -> None:
    counts = fetch_table_counts(db_config, ("script_hub_permissions", "script_hub_roles", "script_hub_users"))
    print_table_counts("Script Hub RBAC table status:", counts)
    print_bootstrap_users(users_payload, users_file)

    previous_users_file = os.getenv("SCRIPT_HUB_BOOTSTRAP_USERS_FILE")
    os.environ["SCRIPT_HUB_BOOTSTRAP_USERS_FILE"] = str(users_file)

    try:
        success = run_action(
            "Bootstrapping Script Hub users / roles / permissions...",
            dry_run,
            run_rbac,
        )
        if not success:
            raise RuntimeError("Script Hub bootstrap reported failure.")

        if not dry_run:
            after = fetch_table_counts(db_config, ("script_hub_permissions", "script_hub_roles", "script_hub_users"))
            print_table_counts("Script Hub RBAC table status after bootstrap:", after)
    finally:
        if previous_users_file is None:
            os.environ.pop("SCRIPT_HUB_BOOTSTRAP_USERS_FILE", None)
        else:
            os.environ["SCRIPT_HUB_BOOTSTRAP_USERS_FILE"] = previous_users_file


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bootstrap only team resources, AI resources, recruitment schema, and a minimal Script Hub user set.",
    )
    parser.add_argument(
        "--mode",
        choices=("fill-empty", "overwrite"),
        default="fill-empty",
        help="fill-empty: import into empty table groups only; overwrite: refresh AI/team resources and rewrite bootstrap users file when combined with --regenerate-keys.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would run without modifying the database.",
    )
    parser.add_argument(
        "--users-file",
        default=str(DEFAULT_USERS_FILE),
        help="Where to store or read the bootstrap user access-key JSON file.",
    )
    parser.add_argument(
        "--regenerate-keys",
        action="store_true",
        help="Regenerate default access keys instead of reusing the existing bootstrap users file.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        maybe_reexec_with_project_python()
        ensure_env_loaded()
        db_config = ensure_local_database()
        run_ai, run_team, run_rbac = load_actions()

        users_file = Path(args.users_file).expanduser().resolve()
        users_payload, reused_existing = load_or_create_bootstrap_users(users_file, args.regenerate_keys)

        print(f"Using Python: {sys.executable}")
        print(f"Bootstrap mode: {args.mode}")
        if reused_existing:
            print("Reusing existing bootstrap access keys.")
        else:
            print("Created bootstrap access keys file.")
        if args.dry_run:
            print("Dry-run mode enabled. No data will be changed.")

        bootstrap_ai_resources(db_config, args.mode, args.dry_run, run_ai)
        bootstrap_team_resources(db_config, args.mode, args.dry_run, run_team)
        bootstrap_recruitment_schema(db_config, args.dry_run)
        bootstrap_rbac_with_users(db_config, args.dry_run, users_file, users_payload, run_rbac)

        if not args.dry_run:
            print("Minimal resources + recruitment bootstrap completed.")
        else:
            print("Dry-run completed.")
        return 0
    except Exception as exc:
        print(f"Bootstrap failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
