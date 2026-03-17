#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"


def _strip_quotes(value: str | None) -> str:
    raw = (value or "").strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in {"'", '"'}:
        return raw[1:-1]
    return raw


def _require_import(module_name: str, package_name: str | None = None):
    try:
        return __import__(module_name)
    except ModuleNotFoundError as exc:
        package = package_name or module_name
        raise RuntimeError(
            f"Missing Python dependency '{package}'. "
            "Please run this script with the project's virtualenv Python."
        ) from exc


def ensure_env_loaded() -> None:
    dotenv = _require_import("dotenv", "python-dotenv")
    if not ENV_FILE.exists():
        raise RuntimeError(f"Missing {ENV_FILE}")
    dotenv.load_dotenv(dotenv_path=ENV_FILE, override=True)


def require_env(name: str) -> str:
    value = _strip_quotes(os.getenv(name))
    if not value:
        raise RuntimeError(f"Missing {name} in {ENV_FILE}")
    return value


def ensure_cryptography() -> None:
    try:
        __import__("cryptography")
        return
    except ModuleNotFoundError:
        pass

    print("Ensuring Python dependency cryptography is installed...")
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "cryptography"],
        cwd=ROOT,
        check=True,
    )


def ensure_local_database() -> dict[str, object]:
    ensure_cryptography()

    pymysql = _require_import("pymysql")

    host = _strip_quotes(os.getenv("DB_LOCAL_HOST")) or "127.0.0.1"
    port = int(_strip_quotes(os.getenv("DB_LOCAL_PORT")) or "3306")
    user = require_env("DB_LOCAL_USER")
    password = require_env("DB_LOCAL_PASSWORD")
    database = require_env("DB_LOCAL_DATABASE")

    print(f"Ensuring local MySQL database {database} exists...")

    connection = pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        charset="utf8mb4",
        autocommit=True,
    )
    try:
        with connection.cursor() as cursor:
            safe_database = database.replace("`", "``")
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{safe_database}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
    finally:
        connection.close()

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "database": database,
    }


def run_step(title: str, args: Iterable[str]) -> None:
    print(title)
    subprocess.run(list(args), cwd=ROOT, check=True, env=os.environ.copy())


def verify_counts(db_config: dict[str, object]) -> None:
    pymysql = _require_import("pymysql")

    connection = pymysql.connect(
        host=str(db_config["host"]),
        port=int(db_config["port"]),
        user=str(db_config["user"]),
        password=str(db_config["password"]),
        database=str(db_config["database"]),
        charset="utf8mb4",
        autocommit=True,
    )
    tables = [
        "ai_categories",
        "ai_resources",
        "team_resource_groups",
        "team_resource_systems",
        "team_resource_environments",
        "team_resource_credentials",
        "script_hub_permissions",
        "script_hub_roles",
        "script_hub_users",
        "script_hub_audit_logs",
    ]

    try:
        with connection.cursor() as cursor:
            print("Verifying imported row counts...")
            for table_name in tables:
                cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                count = cursor.fetchone()[0]
                print(f"  - {table_name}: {count}")
    finally:
        connection.close()


def main() -> int:
    try:
        ensure_env_loaded()
        db_config = ensure_local_database()
        run_step(
            "Migrating AI resources into local MySQL...",
            [sys.executable, "fastApiProject/migrate_resources.py"],
        )
        run_step(
            "Migrating team resources into local MySQL...",
            [sys.executable, "fastApiProject/migrate_team_resources.py"],
        )
        run_step(
            "Bootstrapping Script Hub RBAC into local MySQL...",
            [sys.executable, "fastApiProject/bootstrap_script_hub_rbac.py"],
        )
        verify_counts(db_config)
        print("Local MySQL bootstrap completed.")
        return 0
    except Exception as exc:
        print(f"Bootstrap failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
