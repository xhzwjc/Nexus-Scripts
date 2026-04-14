import logging
import os
import time as _time
import uuid
import zipfile
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
    PlatformReportRequest,
    PlatformReportResponse,
)
from ..reports import TaxReportGenerator, PlatformReportGenerator
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
            "city_tax_rate": request.city_tax_rate,
            "education_surcharge_rate": request.education_surcharge_rate,
            "local_education_surcharge_rate": request.local_education_surcharge_rate,
            "lang": request.lang,
        }

        results = calculator.calculate_tax_by_batch(**params)

        if results is None:
            raise ValueError("计算结果为空")

        total_tax = float(sum(result.get('tax', 0) for result in results)) if results else 0.0
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


@tax_tools_router.post("/platform/report/generate", tags=["平台报送"])
async def generate_platform_report(
    http_request: Request,
    request: PlatformReportRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("tax-reporting")),
):
    """生成平台内经营者和从业人员报送表（收入信息表 + 身份信息表，ZIP格式下载）"""
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    enterprise_count = len(request.enterprise_ids) if request.enterprise_ids else 0
    logger.info(f"[平台报送] 开始 | 请求ID: {request_id}")
    logger.info(f"[平台报送] 参数: 日期范围={request.start_date}至{request.end_date}, 企业数={enterprise_count}")

    try:
        db_config = get_db_config(request.environment)
        generator = PlatformReportGenerator(db_config)

        date_str = request.start_date.replace('-', '') + '_' + request.end_date.replace('-', '')

        # 生成收入信息表
        income_output_path = Path("/tmp") / f"income_{request_id}.xlsx"
        income_path, record_count = generator.generate_income_report(
            output_path=income_output_path,
            start_date=request.start_date,
            end_date=request.end_date,
            platform_company=request.platform_company,
            platform_name=request.platform_name,
            credit_code=request.credit_code,
            enterprise_ids=request.enterprise_ids,
            amount_type=request.amount_type,
        )

        # 生成身份信息表
        identity_output_path = Path("/tmp") / f"identity_{request_id}.xlsx"
        generator.generate_identity_report(
            output_path=identity_output_path,
            start_date=request.start_date,
            end_date=request.end_date,
            platform_company=request.platform_company,
            platform_name=request.platform_name,
            credit_code=request.credit_code,
            enterprise_ids=request.enterprise_ids,
            amount_type=request.amount_type,
        )

        # 创建ZIP文件
        zip_file_name = f"平台报送表_{date_str}.zip"
        zip_output_path = Path("/tmp") / f"platform_{request_id}.zip"

        with zipfile.ZipFile(zip_output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.write(income_output_path, f"收入信息表_{date_str}.xlsx")
            zipf.write(identity_output_path, f"身份信息表_{date_str}.xlsx")

        # 读取ZIP内容
        with open(zip_output_path, "rb") as f:
            zip_content = f.read()
        zip_buffer = BytesIO(zip_content)

        # 删除临时文件
        try:
            os.remove(income_output_path)
            os.remove(identity_output_path)
            os.remove(zip_output_path)
        except Exception as exc:
            logger.warning(f"[平台报送] 删除临时文件失败: {str(exc)}")

        elapsed = round(_time.time() - start_time, 2)
        zip_size_kb = round(len(zip_content) / 1024, 2)
        logger.info(f"[平台报送] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 记录数: {record_count} | ZIP大小: {zip_size_kb}KB")
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="platform.report.generate",
            target_type="platform-report",
            target_code=f"{request.start_date}_{request.end_date}",
            details={
                "environment": request.environment,
                "start_date": request.start_date,
                "end_date": request.end_date,
                "enterprise_count": enterprise_count,
                "record_count": record_count,
                "zip_size_kb": zip_size_kb,
            },
        )

        encoded_zip_filename = quote(zip_file_name.encode('utf-8'))
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_zip_filename}",
                "X-Request-ID": request_id,
            },
        )
    except ValueError as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.warning(f"[平台报送] 参数错误 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}")
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[平台报送] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@tax_tools_router.post("/platform/report/combined", tags=["平台报送"])
async def generate_combined_report(
    http_request: Request,
    request: PlatformReportRequest,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("tax-reporting")),
):
    """生成组合报表（收入信息表+身份信息表在一个Excel文件中，不同sheet）用于手动复制到模板"""
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    enterprise_count = len(request.enterprise_ids) if request.enterprise_ids else 0
    logger.info(f"[组合报表] 开始 | 请求ID: {request_id}")
    logger.info(f"[组合报表] 参数: 日期范围={request.start_date}至{request.end_date}, 企业数={enterprise_count}")

    try:
        db_config = get_db_config(request.environment)
        generator = PlatformReportGenerator(db_config)

        date_str = request.start_date.replace('-', '') + '_' + request.end_date.replace('-', '')
        temp_output_path = Path("/tmp") / f"combined_{request_id}.xlsx"

        file_path, record_count = generator.generate_combined_report(
            output_path=temp_output_path,
            start_date=request.start_date,
            end_date=request.end_date,
            platform_company=request.platform_company,
            platform_name=request.platform_name,
            credit_code=request.credit_code,
            enterprise_ids=request.enterprise_ids,
            amount_type=request.amount_type,
        )

        with open(file_path, "rb") as f:
            file_content = f.read()

        buffer = BytesIO(file_content)

        try:
            os.remove(file_path)
        except Exception as exc:
            logger.warning(f"[组合报表] 删除临时文件失败: {str(exc)}")

        elapsed = round(_time.time() - start_time, 2)
        file_size_kb = round(len(file_content) / 1024, 2)
        filename = f"平台报送数据_{date_str}.xlsx"
        encoded_filename = quote(filename.encode('utf-8'))
        logger.info(f"[组合报表] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 记录数: {record_count} | 文件大小: {file_size_kb}KB")
        write_audit_log(
            db,
            actor=session,
            request=http_request,
            action="platform.report.combined",
            target_type="platform-report",
            target_code=f"{request.start_date}_{request.end_date}",
            details={
                "environment": request.environment,
                "start_date": request.start_date,
                "end_date": request.end_date,
                "enterprise_count": enterprise_count,
                "record_count": record_count,
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
        logger.warning(f"[组合报表] 参数错误 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}")
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[组合报表] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@tax_tools_router.get("/platform/report/data", response_model=PlatformReportResponse, tags=["平台报送"])
async def get_platform_report_data(
    start_date: str = Query(..., description="开始日期 YYYY-MM-DD"),
    end_date: str = Query(..., description="结束日期 YYYY-MM-DD"),
    enterprise_ids: Optional[str] = Query(None, description="企业ID，逗号分隔"),
    amount_type: int = Query(1, ge=1, le=3, description="金额类型：1=含服务费, 2=不含服务费, 3=账单金额"),
    environment: Optional[str] = Query(None, description="环境: test-测试, prod-生产, local-本地"),
    _session: Dict[str, Any] = Depends(require_script_hub_permission("tax-reporting")),
):
    """获取平台报送数据（查询数据但不生成报表）"""
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    logger.info(f"[平台报送数据] 开始 | 请求ID: {request_id}")
    logger.info(f"[平台报送数据] 参数: 日期范围={start_date}至{end_date}, 金额类型={amount_type}")

    try:
        db_config = get_db_config(environment)
        generator = PlatformReportGenerator(db_config)

        # 解析enterprise_ids
        parsed_ids = None
        if enterprise_ids:
            parsed_ids = [int(eid.strip()) for eid in enterprise_ids.split(',') if eid.strip()]

        data = generator.query_platform_data(
            start_date=start_date,
            end_date=end_date,
            enterprise_ids=parsed_ids,
            amount_type=amount_type,
        )

        elapsed = round(_time.time() - start_time, 2)
        logger.info(f"[平台报送数据] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 记录数: {len(data)}")

        return {
            "success": True,
            "message": "获取平台报送数据成功",
            "data": data,
            "request_id": request_id,
            "total": len(data),
        }
    except Exception as exc:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[平台报送数据] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(exc)}")
        raise HTTPException(status_code=500, detail=str(exc))
