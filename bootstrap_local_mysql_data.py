#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Callable, Iterable


ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"
FASTAPI_ROOT = ROOT / "fastApiProject"
REEXEC_ENV_VAR = "BOOTSTRAP_LOCAL_MYSQL_REEXEC"
PROJECT_ENV_DIRS = (".venv", "venv", "ven")
LOCAL_HOST_ALIASES = ("127.0.0.1", "localhost", "::1")

AI_TABLES = ("ai_categories", "ai_resources")
TEAM_RESOURCE_TABLES = (
    "team_resource_groups",
    "team_resource_systems",
    "team_resource_environments",
    "team_resource_credentials",
)
RBAC_TABLES = ("script_hub_permissions", "script_hub_roles", "script_hub_users")
VERIFY_TABLES = AI_TABLES + TEAM_RESOURCE_TABLES + RBAC_TABLES + ("script_hub_audit_logs",)


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


def _same_path(left: Path, right: Path) -> bool:
    try:
        return left.resolve() == right.resolve()
    except OSError:
        return os.path.abspath(str(left)) == os.path.abspath(str(right))


def iter_project_python_candidates() -> Iterable[Path]:
    relative_candidates = (
        Path("Scripts") / "python.exe",
        Path("bin") / "python3",
        Path("bin") / "python",
    )

    for base_dir in (FASTAPI_ROOT, ROOT):
        for env_dir_name in PROJECT_ENV_DIRS:
            env_dir = base_dir / env_dir_name
            for relative_path in relative_candidates:
                candidate = env_dir / relative_path
                if candidate.exists():
                    yield candidate


def maybe_reexec_with_project_python() -> None:
    if os.getenv(REEXEC_ENV_VAR):
        return

    current_python = Path(sys.executable)
    for candidate in iter_project_python_candidates():
        if _same_path(candidate, current_python):
            return

        os.environ[REEXEC_ENV_VAR] = "1"
        print(f"Re-running bootstrap with project Python: {candidate}")
        os.execv(str(candidate), [str(candidate), str(Path(__file__).resolve()), *sys.argv[1:]])


def running_in_docker() -> bool:
    return Path("/.dockerenv").exists()


def normalize_local_db_host(host: str | None) -> str:
    normalized = _strip_quotes(host) or "127.0.0.1"
    docker_host = _strip_quotes(os.getenv("DB_LOCAL_HOST_DOCKER")) or "host.docker.internal"

    if normalized == docker_host and not running_in_docker():
        return "127.0.0.1"

    if normalized in LOCAL_HOST_ALIASES and running_in_docker():
        return docker_host

    return normalized


def build_local_db_host_candidates(host: str | None) -> list[str]:
    docker_host = _strip_quotes(os.getenv("DB_LOCAL_HOST_DOCKER")) or "host.docker.internal"
    primary = normalize_local_db_host(host)
    candidates = [primary]

    if primary == docker_host:
        fallbacks = ("127.0.0.1", "localhost")
    elif primary in LOCAL_HOST_ALIASES:
        fallbacks = (docker_host,)
    else:
        fallbacks = ()

    for fallback in fallbacks:
        if fallback not in candidates:
            candidates.append(fallback)

    return candidates


def connect_local_mysql(
    *,
    user: str,
    password: str,
    port: int,
    database: str | None = None,
    configured_host: str | None = None,
):
    pymysql = _require_import("pymysql")
    hosts = build_local_db_host_candidates(configured_host)
    errors: list[str] = []

    for host in hosts:
        try:
            connection = pymysql.connect(
                host=host,
                port=port,
                user=user,
                password=password,
                database=database,
                charset="utf8mb4",
                autocommit=True,
                connect_timeout=5,
                read_timeout=30,
                write_timeout=30,
            )
            return connection, host
        except Exception as exc:
            errors.append(f"{host}: {exc}")

    tried_hosts = ", ".join(hosts)
    raise RuntimeError(f"Could not connect to local MySQL. Tried hosts: {tried_hosts}. Errors: {'; '.join(errors)}")


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


def ensure_fastapi_path() -> None:
    fastapi_path = str(FASTAPI_ROOT)
    if fastapi_path not in sys.path:
        sys.path.insert(0, fastapi_path)


def ensure_local_database() -> dict[str, object]:
    ensure_cryptography()

    configured_host = _strip_quotes(os.getenv("DB_LOCAL_HOST"))
    port = int(_strip_quotes(os.getenv("DB_LOCAL_PORT")) or "3306")
    user = require_env("DB_LOCAL_USER")
    password = require_env("DB_LOCAL_PASSWORD")
    database = require_env("DB_LOCAL_DATABASE")

    connection, resolved_host = connect_local_mysql(
        user=user,
        password=password,
        port=port,
        configured_host=configured_host,
    )

    print(f"Ensuring local MySQL database {database} exists via host {resolved_host}...")

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
        "host": resolved_host,
        "port": port,
        "user": user,
        "password": password,
        "database": database,
    }


def fetch_table_counts(db_config: dict[str, object], tables: Iterable[str]) -> dict[str, int | None]:
    database = str(db_config["database"])
    counts: dict[str, int | None] = {}

    connection, resolved_host = connect_local_mysql(
        user=str(db_config["user"]),
        password=str(db_config["password"]),
        port=int(db_config["port"]),
        database=database,
        configured_host=str(db_config["host"]),
    )
    try:
        if resolved_host != str(db_config["host"]):
            print(f"MySQL host fallback succeeded: {db_config['host']} -> {resolved_host}")
        with connection.cursor() as cursor:
            for table_name in tables:
                cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM information_schema.tables
                    WHERE table_schema = %s AND table_name = %s
                    """,
                    (database, table_name),
                )
                exists = cursor.fetchone()[0] > 0
                if not exists:
                    counts[table_name] = None
                    continue

                cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                counts[table_name] = int(cursor.fetchone()[0])
    finally:
        connection.close()

    return counts


def print_table_counts(title: str, counts: dict[str, int | None]) -> None:
    print(title)
    for table_name, count in counts.items():
        label = "missing" if count is None else str(count)
        print(f"  - {table_name}: {label}")


def dataset_has_rows(counts: dict[str, int | None]) -> bool:
    return any((count or 0) > 0 for count in counts.values())


def dataset_all_populated(counts: dict[str, int | None]) -> bool:
    return all((count or 0) > 0 for count in counts.values())


def dataset_all_empty_or_missing(counts: dict[str, int | None]) -> bool:
    return all(count in (None, 0) for count in counts.values())


def dataset_has_missing_or_empty(counts: dict[str, int | None]) -> bool:
    return any(count in (None, 0) for count in counts.values())


def run_action(title: str, dry_run: bool, action: Callable[[], bool | None]) -> bool:
    if dry_run:
        print(f"[dry-run] {title}")
        return True

    print(title)
    result = action()
    return True if result is None else bool(result)


def load_actions() -> tuple[Callable[[bool], bool | None], Callable[[bool], bool | None], Callable[[], bool | None]]:
    ensure_fastapi_path()

    from migrate_resources import migrate as migrate_resources
    from migrate_team_resources import migrate as migrate_team_resources
    from bootstrap_script_hub_rbac import main as bootstrap_rbac

    def run_ai(force_recreate: bool) -> bool | None:
        return migrate_resources(force_recreate=force_recreate)

    def run_team(force_recreate: bool) -> bool | None:
        return migrate_team_resources(force_recreate=force_recreate)

    def run_rbac() -> bool | None:
        return bootstrap_rbac()

    return run_ai, run_team, run_rbac


def bootstrap_ai_resources(
    db_config: dict[str, object],
    mode: str,
    dry_run: bool,
    run_ai: Callable[[bool], bool | None],
) -> None:
    counts = fetch_table_counts(db_config, AI_TABLES)
    print_table_counts("AI resources table status:", counts)

    if mode == "fill-empty":
        if dataset_all_populated(counts):
            print("Skipping AI resources import because the target tables already contain data.")
            return
        if not dataset_all_empty_or_missing(counts):
            print(
                "Detected partially populated AI resource tables. "
                "Skipping in fill-empty mode to avoid overwriting existing rows. "
                "Use --mode overwrite to rebuild this dataset."
            )
            return

    success = run_action(
        "Migrating AI resources into local MySQL...",
        dry_run,
        lambda: run_ai(force_recreate=(mode == "overwrite")),
    )
    if not success:
        raise RuntimeError("AI resources migration reported failure.")

    if not dry_run:
        after = fetch_table_counts(db_config, AI_TABLES)
        print_table_counts("AI resources table status after migration:", after)
        if not dataset_has_rows(after):
            raise RuntimeError("AI resources migration completed but no rows were imported.")


def bootstrap_team_resources(
    db_config: dict[str, object],
    mode: str,
    dry_run: bool,
    run_team: Callable[[bool], bool | None],
) -> None:
    counts = fetch_table_counts(db_config, TEAM_RESOURCE_TABLES)
    print_table_counts("Team resources table status:", counts)

    if mode == "fill-empty":
        if dataset_all_populated(counts):
            print("Skipping team resources import because the target tables already contain data.")
            return
        if not dataset_all_empty_or_missing(counts):
            print(
                "Detected partially populated team resources tables. "
                "Skipping in fill-empty mode to avoid overwriting existing rows. "
                "Use --mode overwrite to rebuild this dataset."
            )
            return

    success = run_action(
        "Migrating team resources into local MySQL...",
        dry_run,
        lambda: run_team(force_recreate=(mode == "overwrite")),
    )
    if not success:
        raise RuntimeError("Team resources migration reported failure.")

    if not dry_run:
        after = fetch_table_counts(db_config, TEAM_RESOURCE_TABLES)
        print_table_counts("Team resources table status after migration:", after)
        if not dataset_has_rows(after):
            raise RuntimeError("Team resources migration completed but no rows were imported.")


def bootstrap_rbac(
    db_config: dict[str, object],
    mode: str,
    dry_run: bool,
    run_rbac: Callable[[], bool | None],
) -> None:
    counts = fetch_table_counts(db_config, RBAC_TABLES)
    print_table_counts("Script Hub RBAC table status:", counts)

    if mode == "fill-empty" and not dataset_has_missing_or_empty(counts):
        print("Skipping Script Hub RBAC bootstrap because the core RBAC tables already contain data.")
        return

    success = run_action(
        "Bootstrapping Script Hub RBAC into local MySQL...",
        dry_run,
        run_rbac,
    )
    if not success:
        raise RuntimeError("Script Hub RBAC bootstrap reported failure.")

    if not dry_run:
        after = fetch_table_counts(db_config, RBAC_TABLES)
        print_table_counts("Script Hub RBAC table status after bootstrap:", after)
        if dataset_has_missing_or_empty(after):
            raise RuntimeError("Script Hub RBAC bootstrap completed but some core tables are still empty.")


def verify_counts(db_config: dict[str, object]) -> None:
    counts = fetch_table_counts(db_config, VERIFY_TABLES)
    print_table_counts("Verifying imported row counts...", counts)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bootstrap local MySQL data for Nexus Scripts.",
    )
    parser.add_argument(
        "--mode",
        choices=("fill-empty", "overwrite"),
        default="fill-empty",
        help="fill-empty: only import into empty table groups; overwrite: force refresh AI/team resources and rerun RBAC bootstrap.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would run without modifying the database.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        maybe_reexec_with_project_python()
        ensure_env_loaded()
        db_config = ensure_local_database()
        run_ai, run_team, run_rbac = load_actions()

        print(f"Using Python: {sys.executable}")
        print(f"Bootstrap mode: {args.mode}")
        if args.dry_run:
            print("Dry-run mode enabled. No data will be changed.")

        bootstrap_ai_resources(db_config, args.mode, args.dry_run, run_ai)
        bootstrap_team_resources(db_config, args.mode, args.dry_run, run_team)
        bootstrap_rbac(db_config, args.mode, args.dry_run, run_rbac)

        if not args.dry_run:
            verify_counts(db_config)
            print("Local MySQL bootstrap completed.")
        else:
            print("Dry-run completed.")
        return 0
    except Exception as exc:
        print(f"Bootstrap failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
