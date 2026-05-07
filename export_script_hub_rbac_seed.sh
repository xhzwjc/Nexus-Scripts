#!/bin/bash

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT="$ROOT/export_script_hub_rbac_seed.py"

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
        exec "$candidate" "$SCRIPT" "$@"
    fi
done

if command -v python3 >/dev/null 2>&1; then
    exec python3 "$SCRIPT" "$@"
fi

if command -v python >/dev/null 2>&1; then
    exec python "$SCRIPT" "$@"
fi

echo "Unable to find a usable Python interpreter." >&2
exit 1
