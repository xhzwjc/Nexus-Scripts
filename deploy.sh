#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

on_error() {
    local exit_code=$?
    echo "===================================" >&2
    echo "  部署失败，已停止后续操作（退出码：${exit_code}）" >&2
    echo "===================================" >&2
    exit "$exit_code"
}

trap on_error ERR

echo "==================================="
echo "  正在拉取最新代码..."
echo "==================================="
git pull --ff-only

export BUILDKIT_PROGRESS="${BUILDKIT_PROGRESS:-plain}"

echo
echo "==================================="
echo "  正在构建服务镜像..."
echo "==================================="
if [[ "${DEPLOY_NO_CACHE:-0}" == "1" ]]; then
    echo "前端将忽略旧缓存重新构建；FastAPI 仍使用正常缓存。"
    docker-compose build --no-cache frontend
else
    docker-compose build frontend
fi
docker-compose build fastapi

echo
echo "==================================="
echo "  正在更新服务容器..."
echo "==================================="
docker-compose up -d --no-build --force-recreate frontend fastapi nginx

echo
docker-compose ps

echo
echo "==================================="
echo "  部署完成！服务已更新"
echo "==================================="
