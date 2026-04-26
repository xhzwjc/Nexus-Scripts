#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from bootstrap_local_mysql_data import (
    AI_TABLES,
    TEAM_RESOURCE_TABLES,
    ensure_env_loaded,
    ensure_fastapi_path,
    ensure_local_database,
    fetch_table_counts,
    maybe_reexec_with_project_python,
    print_table_counts,
)


ROOT = Path(__file__).resolve().parent
AI_BACKUP_FILE = ROOT / "my-app" / "data" / "ai-resources.json"
TEAM_BACKUP_FILE = ROOT / "my-app" / "data" / "team-resources.enc.json"


def export_ai_resources() -> tuple[int, int]:
    ensure_fastapi_path()

    from app.database import SessionLocal
    from app.services.ai_resource_service import AiResourceService

    db = SessionLocal()
    try:
        service = AiResourceService(db)
        payload = service.get_all_data()
    finally:
        db.close()

    AI_BACKUP_FILE.parent.mkdir(parents=True, exist_ok=True)
    AI_BACKUP_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(payload.get("categories", [])), len(payload.get("resources", []))


def export_team_resources() -> None:
    ensure_fastapi_path()

    from app.database import SessionLocal
    from app.services.team_resource_service import TeamResourceService

    db = SessionLocal()
    try:
        service = TeamResourceService(db)
        service.save_json_backup()
    finally:
        db.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync team-resources.enc.json and ai-resources.json from the current database.",
    )
    parser.add_argument(
        "--only",
        choices=("all", "team", "ai"),
        default="all",
        help="Choose which backup set to export.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only show database row counts and target files without writing.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        maybe_reexec_with_project_python()
        ensure_env_loaded()
        db_config = ensure_local_database()

        print(f"Using Python: {sys.executable}")

        if args.only in ("all", "ai"):
            ai_counts = fetch_table_counts(db_config, AI_TABLES)
            print_table_counts("AI resources table status:", ai_counts)
            print(f"AI backup target: {AI_BACKUP_FILE}")

        if args.only in ("all", "team"):
            team_counts = fetch_table_counts(db_config, TEAM_RESOURCE_TABLES)
            print_table_counts("Team resources table status:", team_counts)
            print(f"Team backup target: {TEAM_BACKUP_FILE}")

        if args.dry_run:
            print("Dry-run completed. No backup files were written.")
            return 0

        if args.only in ("all", "ai"):
            category_count, resource_count = export_ai_resources()
            print(f"Exported AI resources backup: categories={category_count}, resources={resource_count}")

        if args.only in ("all", "team"):
            export_team_resources()
            file_size = TEAM_BACKUP_FILE.stat().st_size if TEAM_BACKUP_FILE.exists() else 0
            print(f"Exported team resources backup: bytes={file_size}")

        print("Resource backup sync completed.")
        return 0
    except Exception as exc:
        print(f"Resource backup sync failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
