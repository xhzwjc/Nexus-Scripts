import logging
import time as _time
import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..script_hub_session import require_script_hub_permission
from ..services.script_hub_audit_service import write_audit_log
from ..services.monitoring_service import (
    ServerConfig,
    add_server as add_server_config,
    check_server_health,
    delete_server,
    fetch_server_metrics,
    get_all_metrics,
    get_server_by_id,
    load_servers,
    update_server,
)

logger = logging.getLogger(__name__)
monitoring_router = APIRouter(prefix="/api/monitoring", tags=["服务器监控"])


@monitoring_router.get("/servers")
async def list_monitoring_servers(
    _session: Dict[str, Any] = Depends(require_script_hub_permission("server-monitoring")),
):
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 获取服务器列表 | 请求ID: {request_id}")
    servers = load_servers()
    return {
        "success": True,
        "data": [s.model_dump() for s in servers],
        "total": len(servers),
        "request_id": request_id,
    }


@monitoring_router.post("/servers")
async def add_monitoring_server(
    request: Request,
    server: ServerConfig,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("server-monitoring")),
):
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 添加服务器 | 请求ID: {request_id} | 名称: {server.name} | 主机: {server.host}")

    if not add_server_config(server):
        raise HTTPException(status_code=400, detail=f"服务器 ID '{server.id}' 已存在")

    write_audit_log(
        db,
        actor=session,
        request=request,
        action="monitoring.server.create",
        target_type="monitoring-server",
        target_code=server.id,
        details={"name": server.name, "host": server.host, "port": server.port},
    )

    return {
        "success": True,
        "message": f"服务器 '{server.name}' 添加成功",
        "request_id": request_id,
    }


@monitoring_router.put("/servers/{server_id}")
async def update_monitoring_server(
    server_id: str,
    request: Request,
    server: ServerConfig,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("server-monitoring")),
):
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 更新服务器 | 请求ID: {request_id} | ID: {server_id}")

    if not update_server(server_id, server):
        raise HTTPException(status_code=404, detail=f"服务器 '{server_id}' 不存在")

    write_audit_log(
        db,
        actor=session,
        request=request,
        action="monitoring.server.update",
        target_type="monitoring-server",
        target_code=server_id,
        details={"name": server.name, "host": server.host, "port": server.port},
    )

    return {
        "success": True,
        "message": f"服务器 '{server.name}' 更新成功",
        "request_id": request_id,
    }


@monitoring_router.delete("/servers/{server_id}")
async def delete_monitoring_server(
    server_id: str,
    request: Request,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("server-monitoring")),
):
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 删除服务器 | 请求ID: {request_id} | ID: {server_id}")

    if not delete_server(server_id):
        raise HTTPException(status_code=404, detail=f"服务器 '{server_id}' 不存在")

    write_audit_log(
        db,
        actor=session,
        request=request,
        action="monitoring.server.delete",
        target_type="monitoring-server",
        target_code=server_id,
        details={},
    )

    return {
        "success": True,
        "message": "服务器删除成功",
        "request_id": request_id,
    }


@monitoring_router.get("/metrics")
async def get_monitoring_metrics(
    _session: Dict[str, Any] = Depends(require_script_hub_permission("server-monitoring")),
):
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    logger.info(f"[服务器监控] 获取所有指标 | 请求ID: {request_id}")

    metrics = await get_all_metrics()
    elapsed = round(_time.time() - start_time, 2)

    online_count = sum(1 for metric in metrics if metric.online)
    logger.info(
        f"[服务器监控] 指标获取完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 在线: {online_count}/{len(metrics)}"
    )

    return {
        "success": True,
        "data": [metric.model_dump() for metric in metrics],
        "summary": {
            "total": len(metrics),
            "online": online_count,
            "offline": len(metrics) - online_count,
        },
        "request_id": request_id,
    }


@monitoring_router.get("/servers/{server_id}/metrics")
async def get_server_detail_metrics(
    server_id: str,
    _session: Dict[str, Any] = Depends(require_script_hub_permission("server-monitoring")),
):
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 获取服务器详情 | 请求ID: {request_id} | ID: {server_id}")

    server = get_server_by_id(server_id)
    if not server:
        raise HTTPException(status_code=404, detail=f"服务器 '{server_id}' 不存在")

    metrics = await fetch_server_metrics(server)
    return {"success": True, "data": metrics.model_dump(), "request_id": request_id}


@monitoring_router.get("/servers/{server_id}/health")
async def check_server_health_status(
    server_id: str,
    _session: Dict[str, Any] = Depends(require_script_hub_permission("server-monitoring")),
):
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 健康检查 | 请求ID: {request_id} | ID: {server_id}")

    server = get_server_by_id(server_id)
    if not server:
        raise HTTPException(status_code=404, detail=f"服务器 '{server_id}' 不存在")

    health = await check_server_health(server)
    return {"success": True, "data": health, "request_id": request_id}
