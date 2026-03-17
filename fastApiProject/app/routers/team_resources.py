import base64
import hashlib
import json
import logging
import os
import uuid
from typing import Any, Dict

from Crypto.Cipher import AES
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..schema_maintenance import ensure_script_hub_schema
from ..script_hub_session import require_script_hub_permission
from ..services.script_hub_audit_service import write_audit_log
from ..services.team_resource_service import TeamResourceService

logger = logging.getLogger(__name__)
team_resources_router = APIRouter(prefix="/team-resources", tags=["团队资源"])


@team_resources_router.get("/data")
async def get_team_resources(
    db: Session = Depends(get_db),
    _session: Dict[str, Any] = Depends(require_script_hub_permission("team-resources")),
):
    request_id = str(uuid.uuid4())
    logger.info(f"[团队资源] 获取数据 | 请求ID: {request_id}")
    service = TeamResourceService(db)
    data = service.get_all_data(decrypt_pass=True)
    logger.info(f"[团队资源] 获取成功 | 请求ID: {request_id} | 集团数: {len(data)}")
    return {"success": True, "data": data, "request_id": request_id}


@team_resources_router.get("/edit-data")
async def get_team_resources_edit_data(
    db: Session = Depends(get_db),
    _session: Dict[str, Any] = Depends(require_script_hub_permission("team-resources-manage")),
):
    request_id = str(uuid.uuid4())
    logger.info(f"[团队资源] 获取编辑数据 | 请求ID: {request_id}")
    service = TeamResourceService(db)
    data = service.get_all_data(decrypt_pass=True)
    logger.info(f"[团队资源] 获取编辑数据成功 | 请求ID: {request_id} | 集团数: {len(data)}")
    return {"success": True, "data": data, "request_id": request_id}


@team_resources_router.post("/save")
async def save_team_resources(
    request: Request,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("team-resources-manage")),
):
    request_id = str(uuid.uuid4())
    logger.info(f"[团队资源] 保存数据 | 请求ID: {request_id}")
    try:
        body = await request.json()
        groups_data = body.get("groups", [])
        service = TeamResourceService(db)
        service.save_all_data(groups_data)
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="team-resources.save",
            target_type="team-resource-catalog",
            target_code="global",
            details={"group_count": len(groups_data)},
        )
        logger.info(f"[团队资源] 保存成功 | 请求ID: {request_id} | 集团数: {len(groups_data)}")
        return {"success": True, "request_id": request_id}
    except Exception as exc:
        logger.error(f"[团队资源] 保存失败 | 请求ID: {request_id} | 错误: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@team_resources_router.post("/import")
async def import_team_resources(
    request: Request,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("team-resources-manage")),
):
    request_id = str(uuid.uuid4())
    logger.info(f"[团队资源] 导入数据 | 请求ID: {request_id}")
    try:
        body = await request.json()
        groups_data = body.get("groups", [])
        service = TeamResourceService(db)
        stats = service.import_from_json(groups_data)
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="team-resources.import",
            target_type="team-resource-catalog",
            target_code="json-import",
            details={"group_count": len(groups_data), "stats": stats},
        )
        logger.info(f"[团队资源] 导入成功 | 请求ID: {request_id} | 统计: {stats}")
        return {"success": True, "stats": stats, "request_id": request_id}
    except Exception as exc:
        logger.error(f"[团队资源] 导入失败 | 请求ID: {request_id} | 错误: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


def _evp_bytes_to_key(password: bytes, salt: bytes, key_len: int = 32, iv_len: int = 16):
    material = b""
    block = b""
    while len(material) < key_len + iv_len:
        block = hashlib.md5(block + password + salt).digest()
        material += block
    return material[:key_len], material[key_len:key_len + iv_len]


@team_resources_router.post("/migrate-from-encrypted")
async def migrate_from_encrypted(
    request: Request,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("team-resources-manage")),
):
    ensure_script_hub_schema()
    request_id = str(uuid.uuid4())
    logger.info(f"[团队资源] 加密数据迁移 | 请求ID: {request_id}")

    try:
        body = await request.json()
        encrypted_data = body.get("encrypted", "")
        encryption_key = body.get("key") or os.getenv("TEAM_RESOURCES_EXPORT_ENCRYPTION_KEY", "")

        if not encrypted_data:
            raise HTTPException(status_code=400, detail="No encrypted data provided")
        if not encryption_key:
            raise HTTPException(status_code=400, detail="Missing TEAM_RESOURCES_EXPORT_ENCRYPTION_KEY")

        raw = base64.b64decode(encrypted_data)
        if raw[:8] != b"Salted__":
            raise HTTPException(status_code=400, detail="Invalid encrypted data format")

        salt = raw[8:16]
        ciphertext = raw[16:]
        key, iv = _evp_bytes_to_key(encryption_key.encode(), salt)
        cipher = AES.new(key, AES.MODE_CBC, iv)
        decrypted_padded = cipher.decrypt(ciphertext)
        pad_len = decrypted_padded[-1]
        decrypted = decrypted_padded[:-pad_len].decode("utf-8")
        groups_data = json.loads(decrypted)

        service = TeamResourceService(db)
        stats = service.import_from_json(groups_data)
        write_audit_log(
            db,
            actor=session,
            request=request,
            action="team-resources.migrate.encrypted",
            target_type="team-resource-catalog",
            target_code="encrypted-import",
            details={"group_count": len(groups_data), "stats": stats},
        )
        logger.info(f"[团队资源] 加密迁移成功 | 请求ID: {request_id} | 统计: {stats}")
        return {"success": True, "stats": stats, "request_id": request_id}
    except json.JSONDecodeError as exc:
        logger.error(f"[团队资源] JSON解析失败 | 请求ID: {request_id} | 错误: {exc}")
        raise HTTPException(status_code=400, detail=f"JSON parse error: {exc}")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[团队资源] 加密迁移失败 | 请求ID: {request_id} | 错误: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
