#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from bootstrap_local_mysql_data import (
    ensure_env_loaded,
    ensure_fastapi_path,
    ensure_local_database,
    maybe_reexec_with_project_python,
)


ROOT = Path(__file__).resolve().parent
DEFAULT_OUTPUT = ROOT / "fastApiProject" / "data" / "script_hub_rbac_seed.json"


def _parse_csv(raw: str) -> set[str]:
    return {
        item.strip().lower()
        for item in str(raw or "").split(",")
        if item.strip()
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export the current Script Hub RBAC users/roles from MySQL into a safe seed JSON.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="Target RBAC seed JSON path.",
    )
    parser.add_argument(
        "--exclude-user-codes",
        default="",
        help="Comma-separated user_code list to exclude.",
    )
    parser.add_argument(
        "--exclude-role-codes",
        default="",
        help="Comma-separated role_code list to exclude.",
    )
    parser.add_argument(
        "--include-inactive",
        action="store_true",
        help="Include inactive users and custom roles.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print the exported payload without writing the output file.",
    )
    return parser.parse_args()


def build_seed(
    *,
    exclude_user_codes: set[str],
    exclude_role_codes: set[str],
    include_inactive: bool,
) -> dict[str, object]:
    ensure_fastapi_path()

    from app.database import SessionLocal
    from app.services.script_hub_admin_service import list_rbac_overview

    db = SessionLocal()
    try:
        overview = list_rbac_overview(db)
    finally:
        db.close()

    roles = []
    for role in overview["catalog"]["roles"]:
        role_code = str(role["code"]).strip().lower()
        if role["is_system"]:
            continue
        if role_code in exclude_role_codes:
            continue
        if not include_inactive and not role["is_active"]:
            continue

        roles.append(
            {
                "code": role_code,
                "name": role["name"],
                "description": role["description"] or "",
                "permission_keys": role["permission_keys"],
                "is_active": bool(role["is_active"]),
            }
        )

    role_codes_in_seed = {role["code"] for role in roles}
    users = []
    for user in overview["users"]:
        user_code = str(user["user_code"]).strip().lower()
        if user_code in exclude_user_codes:
            continue
        if any(role_code in exclude_role_codes for role_code in user["role_codes"]):
            continue
        if not include_inactive and not user["is_active"]:
            continue

        missing_custom_roles = [
            role_code
            for role_code in user["role_codes"]
            if role_code not in role_codes_in_seed and role_code not in {r["code"] for r in overview["catalog"]["roles"] if r["is_system"]}
        ]
        if missing_custom_roles:
            raise RuntimeError(
                f"User '{user_code}' references custom roles excluded from the seed: {', '.join(missing_custom_roles)}"
            )

        users.append(
            {
                "user_code": user_code,
                "display_name": user["display_name"],
                "role_codes": user["role_codes"],
                "granted_permissions": user["granted_overrides"],
                "revoked_permissions": user["revoked_overrides"],
                "team_resources_login_key_enabled": bool(user["team_resources_login_key_enabled"]),
                "is_active": bool(user["is_active"]),
                "is_super_admin": bool(user["is_super_admin"]),
                "notes": user["notes"],
            }
        )

    return {
        "version": 1,
        "roles": roles,
        "users": users,
    }


def main() -> int:
    args = parse_args()

    try:
        maybe_reexec_with_project_python()
        ensure_env_loaded()
        ensure_local_database()

        output_path = Path(args.output).expanduser().resolve()
        seed = build_seed(
            exclude_user_codes=_parse_csv(args.exclude_user_codes),
            exclude_role_codes=_parse_csv(args.exclude_role_codes),
            include_inactive=args.include_inactive,
        )

        print(
            "RBAC seed summary: "
            f"custom_roles={len(seed['roles'])}, users={len(seed['users'])}, output={output_path}"
        )

        if args.dry_run:
            print(json.dumps(seed, ensure_ascii=False, indent=2))
            return 0

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(seed, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote RBAC seed to {output_path}")
        return 0
    except Exception as exc:
        print(f"RBAC seed export failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
