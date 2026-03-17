import logging
import time as _time
import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import (
    AdminLoginRequest,
    MobileParseRequest,
    MobileParseResponse,
    MobileTaskRequest,
    MobileTaskResponse,
    SMSBaseRequest,
    SMSBatchSendRequest,
    SMSSendResponse,
    SMSSendSingleRequest,
    SMSTemplateResponse,
    SMSLogRequest,
    SMSResendRequest,
    SMSResendResponse,
)
from ..services import MobileTaskService, SMSService
from ..script_hub_session import require_script_hub_permission
from ..services.script_hub_audit_service import write_audit_log

logger = logging.getLogger(__name__)
mobile_sms_router = APIRouter(tags=["手机号与短信"])


def get_mobile_task_service(request: MobileTaskRequest):
    return MobileTaskService(environment=request.environment)


def get_mobile_parse_service(request: MobileParseRequest):
    return MobileTaskService(environment=getattr(request, 'environment', 'test'))


def get_sms_service(request: SMSBaseRequest):
    return SMSService(environment=request.environment)


@mobile_sms_router.post("/mobile/parse", response_model=MobileParseResponse, tags=["手机号任务"])
async def parse_mobile_numbers(
    request: MobileParseRequest,
    service: MobileTaskService = Depends(get_mobile_parse_service),
    _session: Dict[str, Any] = Depends(require_script_hub_permission("task-automation")),
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"收到手机号解析请求: 请求ID={request_id}, 是否有文件={bool(request.file_content)}, 范围={request.range}")

        mobiles = service.parse_mobile_numbers(
            file_content=request.file_content,
            range_str=request.range,
        )

        return {
            "success": True,
            "message": f"成功解析{len(mobiles)}个有效手机号",
            "data": {
                "mobiles": mobiles,
                "count": len(mobiles),
            },
            "request_id": request_id,
        }
    except Exception as exc:
        logger.error(f"手机号解析出错: {str(exc)}", exc_info=True)
        return {
            "success": False,
            "message": f"解析失败: {str(exc)}",
            "data": None,
            "request_id": str(uuid.uuid4()),
        }


@mobile_sms_router.post("/mobile/task/process", response_model=MobileTaskResponse, tags=["手机号任务"])
async def process_mobile_tasks(
    http_request: Request,
    request: MobileTaskRequest,
    db: Session = Depends(get_db),
    service: MobileTaskService = Depends(get_mobile_task_service),
    session: Dict[str, Any] = Depends(require_script_hub_permission("task-automation")),
):
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    mobile_count = len(request.mobiles) if request.mobiles else 0
    logger.info(f"[手机号任务] 开始 | 请求ID: {request_id}")
    logger.info(f"[手机号任务] 参数: 模式={request.mode}, 手机号数量={mobile_count}, 有文件={bool(request.file_content)}, 范围={request.range}")

    try:
        result = service.process_mobile_tasks(request)
        elapsed = round(_time.time() - start_time, 2)
        success_count = result.success_count if hasattr(result, 'success_count') else 0
        logger.info(f"[手机号任务] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 成功: {success_count}")
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="mobile.task.process",
            target_type="mobile-task-job",
            target_code=request_id,
            details={
                "environment": request.environment,
                "mode": request.mode,
                "mobile_count": mobile_count,
                "concurrent_workers": request.concurrent_workers,
                "interval_seconds": request.interval_seconds,
                "success_count": success_count,
                "failure_count": getattr(result, "failure_count", 0),
            },
        )
        return result
    except Exception as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[手机号任务] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"处理手机号任务时发生错误: {str(exc)}")


@mobile_sms_router.post("/sms/templates", response_model=SMSTemplateResponse, tags=["短信服务"])
async def get_sms_templates(
    request: SMSBaseRequest,
    service: SMSService = Depends(get_sms_service),
    _session: Dict[str, Any] = Depends(require_script_hub_permission("sms_operations_center")),
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"获取短信模板列表，环境: {request.environment}, 请求ID: {request_id}")

        result = service.get_templates()
        return {
            "success": result["success"],
            "message": result["message"],
            "data": result["data"],
            "request_id": request_id,
        }
    except Exception as exc:
        logger.error(f"获取短信模板失败: {str(exc)}")
        raise HTTPException(status_code=500, detail=str(exc))


@mobile_sms_router.post("/sms/templates/update", response_model=SMSTemplateResponse, tags=["短信服务"])
async def update_sms_templates(
    http_request: Request,
    request: SMSBaseRequest,
    db: Session = Depends(get_db),
    service: SMSService = Depends(get_sms_service),
    session: Dict[str, Any] = Depends(require_script_hub_permission("sms_operations_center")),
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"更新短信模板，环境: {request.environment}, 请求ID: {request_id}")

        result = service.update_templates(token=request.token)
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="sms.templates.update",
            target_type="sms-template-catalog",
            target_code=request.environment,
            details={"environment": request.environment, "success": bool(result.get("success"))},
        )
        return {
            "code": result.get("code", 0),
            "success": result["success"],
            "message": result["message"],
            "data": result.get("data", {}).get("list", []),
            "request_id": request_id,
        }
    except Exception as exc:
        logger.error(f"更新短信模板失败: {str(exc)}")
        raise HTTPException(status_code=500, detail=str(exc))


@mobile_sms_router.post("/sms/templates/allowed", response_model=SMSTemplateResponse, tags=["短信服务"])
async def get_allowed_templates(
    request: SMSBaseRequest,
    service: SMSService = Depends(get_sms_service),
    _session: Dict[str, Any] = Depends(require_script_hub_permission("sms_operations_center")),
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"获取允许的短信模板，环境: {request.environment}, 请求ID: {request_id}")

        templates = service.get_allowed_templates()
        return {
            "success": True,
            "message": f"获取到 {len(templates)} 个允许的模板",
            "data": templates,
            "request_id": request_id,
        }
    except Exception as exc:
        logger.error(f"获取允许的模板失败: {str(exc)}")
        raise HTTPException(status_code=500, detail=str(exc))


@mobile_sms_router.post("/sms/send/single", response_model=SMSSendResponse, tags=["短信服务"])
async def send_single_sms(
    http_request: Request,
    request: SMSSendSingleRequest,
    db: Session = Depends(get_db),
    service: SMSService = Depends(get_sms_service),
    session: Dict[str, Any] = Depends(require_script_hub_permission("sms_operations_center")),
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"单模板发送短信，模板: {request.template_code}, 请求ID: {request_id}")

        mobiles = settings.PRESET_MOBILES if request.use_preset_mobiles else request.mobiles
        if not mobiles:
            raise HTTPException(status_code=400, detail="手机号不能为空")

        result = service.send_single(
            template_code=request.template_code,
            mobiles=mobiles,
            params=request.params,
            token=request.token,
        )
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="sms.send.single",
            target_type="sms-template",
            target_code=request.template_code,
            details={
                "environment": request.environment,
                "use_preset_mobiles": request.use_preset_mobiles,
                "mobile_count": len(mobiles),
                "success_count": result.get("success_count", 0),
                "failure_count": result.get("failure_count", 0),
            },
        )

        return {
            "success": result["success"],
            "message": result["message"],
            "data": result.get("data", []),
            "request_id": request_id,
            "total": result.get("total", 0),
            "success_count": result.get("success_count", 0),
            "failure_count": result.get("failure_count", 0),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"单模板发送失败: {str(exc)}")
        raise HTTPException(status_code=500, detail=str(exc))


@mobile_sms_router.post("/sms/send/batch", response_model=SMSSendResponse, tags=["短信服务"])
async def batch_send_sms(
    http_request: Request,
    request: SMSBatchSendRequest,
    db: Session = Depends(get_db),
    service: SMSService = Depends(get_sms_service),
    session: Dict[str, Any] = Depends(require_script_hub_permission("sms_operations_center")),
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"批量发送短信，模板数量: {len(request.template_codes)}, 请求ID: {request_id}")

        mobiles = settings.PRESET_MOBILES if request.use_preset_mobiles else request.mobiles
        if not mobiles:
            raise HTTPException(status_code=400, detail="手机号不能为空")

        result = service.batch_send(
            template_codes=request.template_codes,
            mobiles=mobiles,
            random_send=request.random_send,
            token=request.token,
        )
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="sms.send.batch",
            target_type="sms-template-batch",
            target_code=",".join(request.template_codes),
            details={
                "environment": request.environment,
                "template_count": len(request.template_codes),
                "mobile_count": len(mobiles),
                "random_send": request.random_send,
                "success_count": result.get("success_count", 0),
                "failure_count": result.get("failure_count", 0),
            },
        )

        return {
            "success": result["success"],
            "message": result["message"],
            "data": result.get("data", []),
            "request_id": request_id,
            "total": result.get("total", 0),
            "success_count": result.get("success_count", 0),
            "failure_count": result.get("failure_count", 0),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"批量发送失败: {str(exc)}")
        raise HTTPException(status_code=500, detail=str(exc))


@mobile_sms_router.post("/sms/resend", response_model=SMSResendResponse, tags=["短信服务"])
async def resend_sms(
    http_request: Request,
    request: SMSResendRequest,
    db: Session = Depends(get_db),
    service: SMSService = Depends(get_sms_service),
    session: Dict[str, Any] = Depends(require_script_hub_permission("sms_operations_center")),
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"补发短信，批次号: {request.batch_no}, 手机号：{request.mobiles}，请求ID: {request_id}")

        if not request.batch_no and not request.mobiles:
            raise HTTPException(status_code=400, detail="批次号和手机号不能同时为空")

        update_result = service.update_templates(token=request.token)
        if not update_result["success"]:
            raise HTTPException(status_code=500, detail=update_result["message"])

        fetch_result = service.fetch_workers(
            batch_no=request.batch_no,
            mobiles=request.mobiles,
            tax_id=request.tax_id,
        )
        if not fetch_result["success"]:
            raise HTTPException(status_code=500, detail=fetch_result["message"])

        workers = fetch_result["data"]
        if not workers:
            return {
                "success": False,
                "message": "没有找到需要补发的人员",
                "data": [],
                "request_id": request_id,
                "workers": [],
            }

        resend_result = service.resend_sms(workers, token=request.token)
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="sms.resend",
            target_type="sms-resend-job",
            target_code=request.batch_no or ",".join(request.mobiles or []),
            details={
                "environment": request.environment,
                "worker_count": len(workers),
                "tax_id": request.tax_id,
                "success": bool(resend_result.get("success")),
            },
        )

        return {
            "success": resend_result["success"],
            "message": resend_result["message"],
            "data": resend_result.get("data", []),
            "request_id": request_id,
            "workers": workers,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"补发短信失败: {str(exc)}")
        return {
            "success": False,
            "message": f"服务器处理错误: {str(exc)}",
            "data": [],
            "request_id": str(uuid.uuid4()),
            "workers": [],
        }


@mobile_sms_router.post("/system/auth/login", tags=["Admin Auth"])
async def admin_login(
    request: AdminLoginRequest,
    _session: Dict[str, Any] = Depends(require_script_hub_permission("sms-admin-login")),
):
    service = SMSService(environment=request.environment)
    return service.admin_login()


@mobile_sms_router.post("/sms/logs", tags=["SMS Logs"])
async def get_sms_logs(
    request: SMSLogRequest,
    _session: Dict[str, Any] = Depends(require_script_hub_permission("sms_operations_center")),
):
    service = SMSService(environment=request.environment)
    return service.get_sms_logs(
        token=request.token,
        page=request.page,
        page_size=request.pageSize,
        mobile=request.mobile,
        send_status=request.sendStatus,
        receive_status=request.receiveStatus,
        send_time=request.sendTime,
        template_type=request.templateType,
        template_id=request.templateId,
    )
