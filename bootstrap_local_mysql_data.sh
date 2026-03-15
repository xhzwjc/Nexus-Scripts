#!/bin/bash

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE="$ROOT/.env"
VENV_PY="$ROOT/fastApiProject/venv/bin/python"
VENV_PIP="$ROOT/fastApiProject/venv/bin/pip"

if [ ! -f "$ENV_FILE" ]; then
    echo "Missing $ENV_FILE"
    exit 1
fi

if [ ! -x "$VENV_PY" ]; then
    echo "Missing Python venv at $VENV_PY"
    exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${DB_LOCAL_USER:?Missing DB_LOCAL_USER in .env}"
: "${DB_LOCAL_PASSWORD:?Missing DB_LOCAL_PASSWORD in .env}"
: "${DB_LOCAL_DATABASE:?Missing DB_LOCAL_DATABASE in .env}"

MYSQL_ARGS=()
if [[ "${DB_LOCAL_HOST:-localhost}" == "localhost" || "${DB_LOCAL_HOST:-}" == "127.0.0.1" ]] && [ -S /tmp/mysql.sock ]; then
    MYSQL_ARGS=(--socket /tmp/mysql.sock)
else
    MYSQL_ARGS=(--protocol TCP "-h${DB_LOCAL_HOST:-127.0.0.1}" "-P${DB_LOCAL_PORT:-3306}")
fi

echo "Ensuring local MySQL database ${DB_LOCAL_DATABASE} exists..."
MYSQL_PWD="$DB_LOCAL_PASSWORD" mysql "${MYSQL_ARGS[@]}" "-u${DB_LOCAL_USER}" \
    -e "CREATE DATABASE IF NOT EXISTS \`${DB_LOCAL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "Ensuring Python dependency cryptography is installed..."
if ! "$VENV_PIP" show cryptography >/dev/null 2>&1; then
    "$VENV_PIP" install cryptography
fi

echo "Migrating AI resources into local MySQL..."
(cd "$ROOT" && "$VENV_PY" fastApiProject/migrate_resources.py)

echo "Migrating team resources into local MySQL..."
(cd "$ROOT" && "$VENV_PY" fastApiProject/migrate_team_resources.py)

echo "Bootstrapping Script Hub RBAC into local MySQL..."
(cd "$ROOT" && "$VENV_PY" fastApiProject/bootstrap_script_hub_rbac.py)

echo "Verifying imported row counts..."
VERIFY_SQL="
SELECT 'ai_categories', COUNT(*) FROM ${DB_LOCAL_DATABASE}.ai_categories
UNION ALL
SELECT 'ai_resources', COUNT(*) FROM ${DB_LOCAL_DATABASE}.ai_resources
UNION ALL
SELECT 'team_resource_groups', COUNT(*) FROM ${DB_LOCAL_DATABASE}.team_resource_groups
UNION ALL
SELECT 'team_resource_systems', COUNT(*) FROM ${DB_LOCAL_DATABASE}.team_resource_systems
UNION ALL
SELECT 'team_resource_environments', COUNT(*) FROM ${DB_LOCAL_DATABASE}.team_resource_environments
UNION ALL
SELECT 'team_resource_credentials', COUNT(*) FROM ${DB_LOCAL_DATABASE}.team_resource_credentials
UNION ALL
SELECT 'script_hub_permissions', COUNT(*) FROM ${DB_LOCAL_DATABASE}.script_hub_permissions
UNION ALL
SELECT 'script_hub_roles', COUNT(*) FROM ${DB_LOCAL_DATABASE}.script_hub_roles
UNION ALL
SELECT 'script_hub_users', COUNT(*) FROM ${DB_LOCAL_DATABASE}.script_hub_users;
"
MYSQL_PWD="$DB_LOCAL_PASSWORD" mysql "${MYSQL_ARGS[@]}" "-u${DB_LOCAL_USER}" -N -e "$VERIFY_SQL"

echo "Local MySQL bootstrap completed."
