import logging
import os
import time as _time
import uuid
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from ..config import settings
from ..database import get_db
from ..models import (
    EnterpriseListResponse,
    TaxCalculationRequest,
    TaxCalculationResponse,
    TaxDataRequest,
    TaxDataResponse,
    TaxReportGenerateRequest,
    TaxReportGenerateResponse,
)
from ..reports import TaxReportGenerator
from ..script_hub_session import require_script_hub_any_permission, require_script_hub_permission
from ..services.script_hub_audit_service import write_audit_log
from ..tax_calculator import TaxCalculator
from ..utils import get_enterprise_list

logger = logging.getLogger(__name__)
tax_tools_router = APIRouter(tags=["税务工具"])


def get_db_config(environment: Optional[str] = None):
    return settings.get_db_config(environment)


@tax_tools_router.get("/enterprises/list", response_model=EnterpriseListResponse, tags=["企业管理"])
async def list_enterprises(
    environment: Optional[str] = Query(None, description="环境: test-测试, prod-生产, local-本地"),
    _session: Dict[str, Any] = Depends(require_script_hub_any_permission(("balance", "tax-reporting", "payment-stats"))),
):
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    logger.info(f"[企业列表] 开始 | 请求ID: {request_id} | 环境: {environment or 'default'}")

    try:
        db_config = get_db_config(environment)
        enterprises = get_enterprise_list(db_config)
        elapsed = round(_time.time() - start_time, 2)
        logger.info(f"[企业列表] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 企业数量: {len(enterprises)}")

        if enterprises:
            names = [enterprise.get('name', enterprise.get('enterprise_name', 'N/A')) for enterprise in enterprises[:5]]
            logger.info(f"[企业列表] 响应数据预览: {names}{'...' if len(enterprises) > 5 else ''}")

        return {
            "success": True,
            "message": "已加载企业信息！",
            "data": enterprises,
            "request_id": request_id,
            "total": len(enterprises),
        }
    except Exception as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[企业列表] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}")
        raise HTTPException(status_code=500, detail=str(exc))


@tax_tools_router.post("/tax/data", response_model=TaxDataResponse, tags=["税务报表"])
async def get_tax_data(
    request: TaxDataRequest,
    _session: Dict[str, Any] = Depends(require_script_hub_permission("tax-reporting")),
):
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    enterprise_count = len(request.enterprise_ids) if request.enterprise_ids else 0
    logger.info(f"[完税数据] 开始 | 请求ID: {request_id}")
    logger.info(f"[完税数据] 参数: 年月={request.year_month}, 企业数={enterprise_count}, 金额类型={request.amount_type}")

    try:
        db_config = get_db_config(request.environment)
        generator = TaxReportGenerator(db_config)
        tax_data = generator.query_tax_data(
            year_month=request.year_month,
            enterprise_ids=request.enterprise_ids,
            amount_type=request.amount_type,
        )
        elapsed = round(_time.time() - start_time, 2)
        logger.info(f"[完税数据] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 数据条数: {len(tax_data)}")

        if tax_data:
            total_amount = sum(float(item.get('营业额_元', 0) or 0) for item in tax_data)
            logger.info(f"[完税数据] 响应汇总: 总金额={total_amount:.2f}, 记录数={len(tax_data)}")

        return {
            "success": True,
            "message": "获取完税数据成功",
            "data": tax_data,
            "request_id": request_id,
            "total": len(tax_data),
        }
    except Exception as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[完税数据] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}")
        raise HTTPException(status_code=500, detail=str(exc))


@tax_tools_router.post("/tax/report/generate", response_model=TaxReportGenerateResponse, tags=["税务报表"])
async def generate_tax_report(
    http_request: Request,
    request: TaxReportGenerateRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("tax-reporting")),
):
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    enterprise_count = len(request.enterprise_ids) if request.enterprise_ids else 0
    logger.info(f"[税务报表] 开始 | 请求ID: {request_id}")
    logger.info(f"[税务报表] 参数: 年月={request.year_month}, 企业数={enterprise_count}, 金额类型={request.amount_type}")

    try:
        db_config = get_db_config(request.environment)
        generator = TaxReportGenerator(db_config)

        temp_file_name = f"tax_report_{request.year_month.replace('-', '_')}_{request_id}.xlsx"
        temp_output_path = Path("/tmp") / temp_file_name

        file_path = generator.generate_tax_report(
            year_month=request.year_month,
            output_path=temp_output_path,
            enterprise_ids=request.enterprise_ids,
            amount_type=request.amount_type,
            platform_company=request.platform_company,
            credit_code=request.credit_code,
        )

        with open(file_path, "rb") as file_handle:
            file_content = file_handle.read()

        buffer = BytesIO(file_content)
        filename = f"完税报表_{request.year_month.replace('-', '_')}.xlsx"
        encoded_filename = quote(filename.encode('utf-8'))

        try:
            os.remove(file_path)
        except Exception as exc:
            logger.warning(f"[税务报表] 删除临时文件失败: {str(exc)}")

        elapsed = round(_time.time() - start_time, 2)
        file_size_kb = round(len(file_content) / 1024, 2)
        logger.info(f"[税务报表] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 文件大小: {file_size_kb}KB")
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="tax.report.generate",
            target_type="tax-report",
            target_code=request.year_month,
            details={
                "environment": request.environment,
                "enterprise_count": enterprise_count,
                "amount_type": request.amount_type,
                "file_size_kb": file_size_kb,
            },
        )

        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "X-Request-ID": request_id,
            },
        )
    except ValueError as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.warning(f"[税务报表] 参数错误 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}")
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[税务报表] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}")
        raise HTTPException(status_code=500, detail=str(exc))


@tax_tools_router.post("/tax/calculate", response_model=TaxCalculationResponse, tags=["税务计算"])
async def calculate_tax(
    http_request: Request,
    request: TaxCalculationRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("tax-calculation")),
):
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    logger.info(f"[税额计算] 开始 | 请求ID: {request_id}")
    logger.info(f"[税额计算] 参数: 年份={request.year}, 批次号={request.batch_no}, 身份证={(request.credential_num[:6] if request.credential_num else 'None')}***, 模拟={request.use_mock}")

    try:
        if not request.use_mock:
            if not request.batch_no and (not request.credential_num or request.credential_num.strip() == ""):
                raise ValueError("必须提供批次号或身份证号")
        else:
            if not request.credential_num or request.credential_num.strip() == "":
                request.credential_num = f"MOCK_{uuid.uuid4().hex[:10]}"
                logger.info(f"[税额计算] 模拟模式自动生成身份证号: {request.credential_num}")

        db_config = get_db_config(request.environment)
        calculator = TaxCalculator(
            db_config=db_config,
            mock_data=request.mock_data if request.use_mock else None,
        )

        params = {
            "year": request.year,
            "batch_no": request.batch_no,
            "credential_num": request.credential_num,
            "realname": request.realname,
            "income_type": request.income_type,
            "accumulated_special_deduction": request.accumulated_special_deduction,
            "accumulated_additional_deduction": request.accumulated_additional_deduction,
            "accumulated_other_deduction": request.accumulated_other_deduction,
            "accumulated_pension_deduction": request.accumulated_pension_deduction,
            "accumulated_donation_deduction": request.accumulated_donation_deduction,
        }

        results = calculator.calculate_tax_by_batch(**params)

        if results is None:
            raise ValueError("计算结果为空")

        total_tax = sum(result.get('tax', 0) for result in results) if results else 0.0
        elapsed = round(_time.time() - start_time, 2)
        logger.info(f"[税额计算] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 记录数: {len(results)} | 总税额: {round(total_tax, 2)}")
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="tax.calculate",
            target_type="tax-calculation",
            target_code=request.batch_no or request.credential_num or str(request.year),
            details={
                "environment": request.environment,
                "year": request.year,
                "use_mock": request.use_mock,
                "result_count": len(results),
                "total_tax": round(total_tax, 2),
            },
        )

        return {
            "success": True,
            "message": f"计算完成，共返回 {len(results)} 条记录",
            "data": results,
            "request_id": request_id,
            "total_tax": round(total_tax, 2),
        }
    except ValueError as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.warning(f"[税额计算] 参数错误 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}")
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[税额计算] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"计算过程中发生错误: {str(exc)}")
