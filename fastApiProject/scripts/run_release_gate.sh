#!/usr/bin/env bash
# AI 初筛 Release Gate 一键执行：SQLite 全量（警告即错）+ 真实 MySQL 双会话验收。
# 本地用法（需可写的本地 MySQL 验证库，绝不可指向生产库）：
#   DB_LOCAL_HOST=localhost DB_LOCAL_PORT=3306 DB_LOCAL_USER=root \
#   DB_LOCAL_PASSWORD=xxx DB_LOCAL_DATABASE=db_fwos_local \
#   bash scripts/run_release_gate.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PY="${PYTHON_BIN:-./venv/bin/python}"
if [ ! -x "$PY" ]; then PY="python3"; fi

echo "=== [1/3] SQLite 全量（固定顺序，警告即错） ==="
"$PY" -m pytest tests/ -p no:randomly -q -W error::Warning

echo "=== [2/3] SQLite 全量（随机顺序，检测顺序依赖） ==="
"$PY" -m pytest tests/ -q -W error::Warning

echo "=== [3/3] 真实 MySQL 双会话验收（Release Gate） ==="
: "${DB_LOCAL_HOST:?需要 DB_LOCAL_HOST（本地/CI MySQL，绝不可指向生产库）}"
: "${DB_LOCAL_DATABASE:?需要 DB_LOCAL_DATABASE}"
echo "--- 迁移执行两次（幂等验证：必须两个独立进程——进程内全局 flag 会短路第二次） ---"
ENVIRONMENT=local PYTHONPATH=. "$PY" -c "from app.schema_maintenance import ensure_recruitment_schema; ensure_recruitment_schema(); print('migration pass 1 OK')"
ENVIRONMENT=local PYTHONPATH=. "$PY" -c "from app.schema_maintenance import ensure_recruitment_schema; ensure_recruitment_schema(); print('migration pass 2 (idempotent) OK')"
RECRUITMENT_MYSQL_VALIDATION=1 ENVIRONMENT=local PYTHONPATH=. \
  "$PY" -m pytest tests/test_mysql_release_gate_validation.py -p no:randomly -q -W error::Warning

echo "=== RELEASE GATE: ALL PASSED ==="
