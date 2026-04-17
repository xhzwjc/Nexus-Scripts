#!/bin/bash

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BOOTSTRAP_SCRIPT="$ROOT/bootstrap_local_mysql_data.py"

declare -a candidates=(
    "$ROOT/fastApiProject/.venv/bin/python3"
    "$ROOT/fastApiProject/.venv/bin/python"
    "$ROOT/fastApiProject/venv/bin/python3"
    "$ROOT/fastApiProject/venv/bin/python"
    "$ROOT/fastApiProject/ven/bin/python3"
    "$ROOT/fastApiProject/ven/bin/python"
    "$ROOT/.venv/bin/python3"
    "$ROOT/.venv/bin/python"
    "$ROOT/venv/bin/python3"
    "$ROOT/venv/bin/python"
    "$ROOT/ven/bin/python3"
    "$ROOT/ven/bin/python"
)

for candidate in "${candidates[@]}"; do
    if [ -x "$candidate" ]; then
        exec "$candidate" "$BOOTSTRAP_SCRIPT" "$@"
    fi
done

if command -v python3 >/dev/null 2>&1; then
    exec python3 "$BOOTSTRAP_SCRIPT" "$@"
fi

if command -v python >/dev/null 2>&1; then
    exec python "$BOOTSTRAP_SCRIPT" "$@"
fi

echo "Unable to find a usable Python interpreter." >&2
echo "Checked project environments under fastApiProject and the repository root: .venv, venv, ven" >&2
echo "You can also install Python and rerun this script; bootstrap_local_mysql_data.py will prefer a project interpreter when one exists." >&2
exit 1
