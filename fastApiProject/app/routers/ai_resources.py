import logging
import time
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AIResourcesDataResponse, AIResourcesSaveRequest
from ..script_hub_session import require_script_hub_permission
from ..services.ai_resource_service import AiResourceService
from ..services.script_hub_audit_service import write_audit_log

logger = logging.getLogger(__name__)

ai_resources_router = APIRouter(prefix="/ai-resources", tags=["AI资源"])

_ai_resources_cache: Dict[str, Any] = {}
_ai_resources_cache_time: float = 0
_AI_RESOURCES_CACHE_TTL = 60


@ai_resources_router.get("/data", response_model=AIResourcesDataResponse)
async def get_ai_resources(
    db: Session = Depends(get_db),
    _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-resources")),
):
    global _ai_resources_cache, _ai_resources_cache_time

    current_time = time.time()
    if _ai_resources_cache and (current_time - _ai_resources_cache_time) < _AI_RESOURCES_CACHE_TTL:
        return _ai_resources_cache

    service = AiResourceService(db)
    data = service.get_all_data()
    _ai_resources_cache = data
    _ai_resources_cache_time = current_time
    return data


@ai_resources_router.post("/save")
async def save_ai_resources(
    http_request: Request,
    request: AIResourcesSaveRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("ai-resources-manage")),
):
    global _ai_resources_cache, _ai_resources_cache_time

    service = AiResourceService(db)
    try:
        service.save_all_data(request.categories, request.resources)
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="ai-resources.save",
            target_type="ai-resource-catalog",
            target_code="global",
            details={
                "category_count": len(request.categories),
                "resource_count": len(request.resources),
            },
        )
        _ai_resources_cache = {}
        _ai_resources_cache_time = 0
        return {"success": True}
    except Exception as exc:
        logger.error(f"Error saving AI resources: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@ai_resources_router.delete("/{resource_id}")
async def delete_ai_resource(
    http_request: Request,
    resource_id: str,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("ai-resources-manage")),
):
    global _ai_resources_cache, _ai_resources_cache_time

    service = AiResourceService(db)
    if service.delete_resource(resource_id):
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="ai-resources.delete",
            target_type="ai-resource",
            target_code=resource_id,
            details={},
        )
        _ai_resources_cache = {}
        _ai_resources_cache_time = 0
        return {"success": True}
    raise HTTPException(status_code=404, detail="Resource not found")
