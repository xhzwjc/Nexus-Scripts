#!/bin/bash

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
VENV_PY="$ROOT/fastApiProject/venv/bin/python"

if [ ! -x "$VENV_PY" ]; then
    echo "Missing Python venv at $VENV_PY"
    exit 1
fi

"$VENV_PY" "$ROOT/bootstrap_local_mysql_data.py" "$@"
