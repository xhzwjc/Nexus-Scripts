import logging
import time as _time
import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    BalanceVerificationRequest,
    BalanceVerificationResponse,
    CommissionCalculationRequest,
    CommissionCalculationResponse,
    PaymentStatsRequest,
    PaymentStatsResponse,
    SettlementRequest,
    SettlementResponse,
)
from ..services import (
    AccountBalanceService,
    CommissionCalculationService,
    EnterpriseSettlementService,
    PaymentStatsService,
)
from ..script_hub_session import require_script_hub_permission
from ..services.script_hub_audit_service import write_audit_log

logger = logging.getLogger(__name__)
business_core_router = APIRouter(tags=["核心业务"])


def get_settlement_service():
    return EnterpriseSettlementService()


def get_balance_service(request: BalanceVerificationRequest):
    return AccountBalanceService(environment=request.environment)


def get_commission_service(request: CommissionCalculationRequest):
    return CommissionCalculationService(environment=request.environment)


@business_core_router.post("/settlement/process", response_model=SettlementResponse, tags=["结算处理"])
async def process_settlement(
    http_request: Request,
    request: SettlementRequest,
    db: Session = Depends(get_db),
    service: EnterpriseSettlementService = Depends(get_settlement_service),
    session: Dict[str, Any] = Depends(require_script_hub_permission("settlement")),
):
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    logger.info(f"[结算处理] 开始 | 请求ID: {request_id}")
    logger.info(f"[结算处理] 参数: 企业数量={len(request.enterprises)}, 并发={request.concurrent}")

    try:
        result = service.process_settlement(request)
        elapsed = round(_time.time() - start_time, 2)
        logger.info(f"[结算处理] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 成功: {result.success}")
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="business.settlement.process",
            target_type="settlement-job",
            target_code=request_id,
            details={
                "enterprise_count": len(request.enterprises),
                "mode": request.mode,
                "concurrent_workers": request.concurrent_workers,
                "interval_seconds": request.interval_seconds,
                "environment": request.environment,
                "success": bool(getattr(result, "success", False)),
            },
        )
        return result
    except Exception as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[结算处理] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"处理结算请求时发生错误: {str(exc)}")


@business_core_router.post("/balance/verify", response_model=BalanceVerificationResponse, tags=["账户核对"])
async def verify_balance(
    request: BalanceVerificationRequest,
    service: AccountBalanceService = Depends(get_balance_service),
    _session: Dict[str, Any] = Depends(require_script_hub_permission("balance")),
):
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    logger.info(f"[余额核对] 开始 | 请求ID: {request_id}")
    logger.info(f"[余额核对] 参数: 企业ID={request.tenant_id}, 环境={request.environment}, 超时={request.timeout}秒")

    try:
        result = service.verify_balances_with_timeout(
            tenant_id=request.tenant_id,
            timeout=request.timeout,
        )
        elapsed = round(_time.time() - start_time, 2)
        data_count = len(result) if result else 0
        logger.info(f"[余额核对] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 数据条数: {data_count}")

        if result:
            for item in result[:3]:
                logger.info(f"[余额核对] 响应数据: 账户={item.get('enterprise_name', 'N/A') + '_' + item.get('tax_address', 'N/A')}, 余额={item.get('actual_balance', 'N/A')}")
            if len(result) > 3:
                logger.info(f"[余额核对] ... 共 {len(result)} 条数据")

        return {
            "success": True,
            "message": "核对完成" if result else "未找到企业数据",
            "data": result,
            "request_id": request_id,
            "enterprise_id": request.tenant_id,
        }
    except TimeoutError as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.warning(f"[余额核对] 超时 | 请求ID: {request_id} | 耗时: {elapsed}秒")
        raise HTTPException(status_code=408, detail=str(exc))
    except Exception as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[余额核对] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@business_core_router.post("/commission/calculate", response_model=CommissionCalculationResponse, tags=["佣金计算"])
async def calculate_commission(
    request: CommissionCalculationRequest,
    service: CommissionCalculationService = Depends(get_commission_service),
    _session: Dict[str, Any] = Depends(require_script_hub_permission("commission")),
):
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    logger.info(f"[佣金计算] 开始 | 请求ID: {request_id}")
    logger.info(f"[佣金计算] 参数: 渠道ID={request.channel_id}, 环境={request.environment}, 超时={request.timeout}秒")

    try:
        result = service.calculate_commission(
            channel_id=request.channel_id,
            timeout=request.timeout,
        )
        elapsed = round(_time.time() - start_time, 2)
        data_count = len(result) if result else 0
        logger.info(f"[佣金计算] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 结果条数: {data_count}")
        return {
            "success": True,
            "message": "佣金计算完成",
            "data": result,
            "request_id": request_id,
            "channel_id": request.channel_id,
        }
    except TimeoutError as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.warning(f"[佣金计算] 超时 | 请求ID: {request_id} | 耗时: {elapsed}秒")
        raise HTTPException(status_code=408, detail=str(exc))
    except Exception as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[佣金计算] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@business_core_router.post("/stats/payment/enterprises", response_model=PaymentStatsResponse, tags=["支付统计"])
async def get_payment_enterprises(
    request: PaymentStatsRequest,
    _session: Dict[str, Any] = Depends(require_script_hub_permission("payment-stats")),
):
    request_id = str(uuid.uuid4())
    try:
        service = PaymentStatsService(environment=request.environment)
        enterprises = service.get_normal_enterprises()
        return {
            "success": True,
            "message": "获取成功",
            "data": {"enterprises": enterprises},
            "request_id": request_id,
        }
    except Exception as exc:
        logger.error(f"获取企业列表失败: {exc}")
        return {
            "success": False,
            "message": str(exc),
            "request_id": request_id,
        }


@business_core_router.post("/stats/payment/calculate", response_model=PaymentStatsResponse, tags=["支付统计"])
async def calculate_payment_stats(
    request: PaymentStatsRequest,
    _session: Dict[str, Any] = Depends(require_script_hub_permission("payment-stats")),
):
    request_id = str(uuid.uuid4())
    try:
        service = PaymentStatsService(environment=request.environment)
        stats = service.calculate_stats(enterprise_ids=request.enterprise_ids)
        return {
            "success": True,
            "message": "计算成功",
            "data": stats,
            "request_id": request_id,
        }
    except Exception as exc:
        logger.error(f"计算统计失败: {exc}")
        return {
            "success": False,
            "message": str(exc),
            "request_id": request_id,
        }
