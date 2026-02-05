import json
import os
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Request, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
import logging
import uuid
from typing import Optional, List, Dict, Any
import asyncio

from starlette.responses import StreamingResponse

from . import config
from .models import (
    SettlementRequest, SettlementResponse,
    BalanceVerificationRequest, BalanceVerificationResponse, CommissionCalculationRequest,
    CommissionCalculationResponse, MobileTaskRequest, MobileTaskResponse, SMSResendResponse, SMSResendRequest,
    SMSSendResponse, SMSBatchSendRequest, SMSSendSingleRequest, SMSBaseRequest, SMSTemplateResponse,
    MobileParseResponse, MobileParseRequest, TaxCalculationResponse, TaxCalculationRequest,
    PaymentStatsRequest, PaymentStatsResponse,
    DeliveryLoginRequest, DeliveryTaskRequest, DeliverySubmitRequest, DeliveryWorkerInfoRequest,
    AdminLoginRequest, SMSLogRequest,
    AIResourcesDataResponse, AIResourcesSaveRequest
)
from .services import EnterpriseSettlementService, AccountBalanceService, CommissionCalculationService, \
    MobileTaskService, SMSService, PaymentStatsService
from .services.monitoring_service import check_and_alert, load_servers, fetch_server_metrics, get_server_by_id, add_server as add_server_config, update_server, delete_server, check_server_health, ServerConfig
from .services.ai_resource_service import AiResourceService
from .config import settings
from .database import get_db
from sqlalchemy.orm import Session

# 配置日志
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# 创建FastAPI应用
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description=settings.DESCRIPTION,
    # 关闭默认的docs和redoc，使用自定义路由
    docs_url=None,
    redoc_url=None
)

@app.on_event("startup")
async def startup_event():
    """启动时初始化"""
    logger.info("Starting background tasks...")
    asyncio.create_task(background_monitoring_loop())

async def background_monitoring_loop():
    """后台监控循环"""
    while True:
        try:
            # 首次启动等待 10 秒
            await asyncio.sleep(10)
            await check_and_alert()
        except Exception as e:
            logger.error(f"Error in monitoring loop: {e}")
        # 每 5 分钟检查一次
        await asyncio.sleep(300)


# 挂载静态文件目录（关键：让FastAPI能访问本地资源）
app.mount("/static", StaticFiles(directory="static"), name="static")

# 配置CORS（保持不变）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境中应指定具体的 origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 自定义Swagger UI路由（使用本地资源）
@app.get("/docs", include_in_schema=False, tags=["文档"])
async def custom_swagger_ui():
    return get_swagger_ui_html(
        openapi_url="/openapi.json",  # 指向自动生成的API规范
        title="春苗系统结算API - 文档",
        # 本地资源路径（对应static/swagger目录下的文件）
        swagger_js_url="/static/swagger/swagger-ui-bundle.js",
        swagger_css_url="/static/swagger/swagger-ui.css",
        swagger_favicon_url="",  # 可选：移除favicon避免额外请求
    )


# 自定义ReDoc路由（可选，如需修复redoc空白页）
from fastapi.openapi.docs import get_redoc_html


@app.get("/redoc", include_in_schema=False, tags=["文档"])
async def custom_redoc_ui():
    return get_redoc_html(
        openapi_url="/openapi.json",
        title="春苗系统结算API - ReDoc",
        redoc_js_url="/static/swagger/redoc.standalone.js",  # 需提前下载redoc文件
    )


# 其他路由（保持不变）
def get_settlement_service():
    return EnterpriseSettlementService()

# 关键修改：账户核对服务依赖，接收接口传入的environment
def get_balance_service(request: BalanceVerificationRequest):
    """根据请求中的environment创建AccountBalanceService实例"""
    return AccountBalanceService(environment=request.environment)

import time as _time

@app.post("/settlement/process", response_model=SettlementResponse, tags=["结算处理"])
async def process_settlement(
        request: SettlementRequest,
        service: EnterpriseSettlementService = Depends(get_settlement_service)
):
    """
    处理企业结算任务
    """
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    logger.info(f"[结算处理] 开始 | 请求ID: {request_id}")
    logger.info(f"[结算处理] 参数: 企业数量={len(request.enterprises)}, 并发={request.concurrent}")
    
    try:
        result = service.process_settlement(request)
        elapsed = round(_time.time() - start_time, 2)
        logger.info(f"[结算处理] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 成功: {result.success}")
        return result
    except Exception as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[结算处理] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"处理结算请求时发生错误: {str(e)}")

# 账户核对接口（新增）
@app.post("/balance/verify", response_model=BalanceVerificationResponse, tags=["账户核对"])
async def verify_balance(
    request: BalanceVerificationRequest,
    service: AccountBalanceService = Depends(get_balance_service)
):
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    logger.info(f"[余额核对] 开始 | 请求ID: {request_id}")
    logger.info(f"[余额核对] 参数: 企业ID={request.tenant_id}, 环境={request.environment}, 超时={request.timeout}秒")
    
    try:
        result = service.verify_balances_with_timeout(
            tenant_id=request.tenant_id,
            timeout=request.timeout
        )
        elapsed = round(_time.time() - start_time, 2)
        data_count = len(result) if result else 0
        logger.info(f"[余额核对] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 数据条数: {data_count}")
        
        # 记录响应数据摘要
        if result:
            for item in result[:3]:  # 最多记录前3条
                logger.info(f"[余额核对] 响应数据: 账户={item.get('enterprise_name', 'N/A') + '_' + item.get('tax_address', 'N/A')}, 余额={item.get('actual_balance', 'N/A')}")
            if len(result) > 3:
                logger.info(f"[余额核对] ... 共 {len(result)} 条数据")
        
        return {
            "success": True,
            "message": "核对完成" if result else "未找到企业数据",
            "data": result,
            "request_id": request_id,
            "enterprise_id": request.tenant_id
        }
    except TimeoutError as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.warning(f"[余额核对] 超时 | 请求ID: {request_id} | 耗时: {elapsed}秒")
        raise HTTPException(status_code=408, detail=str(e))
    except Exception as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[余额核对] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# 在app/main.py中添加（保持原有代码不变）
# 佣金计算服务依赖
def get_commission_service(request: CommissionCalculationRequest):
    """根据请求中的environment创建CommissionCalculationService实例"""
    return CommissionCalculationService(environment=request.environment)


# 佣金计算接口（新增）
@app.post("/commission/calculate", response_model=CommissionCalculationResponse, tags=["佣金计算"])
async def calculate_commission(
        request: CommissionCalculationRequest,
        service: CommissionCalculationService = Depends(get_commission_service)
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
            "channel_id": request.channel_id
        }
    except TimeoutError as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.warning(f"[佣金计算] 超时 | 请求ID: {request_id} | 耗时: {elapsed}秒")
        raise HTTPException(status_code=408, detail=str(e))
    except Exception as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[佣金计算] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# 在文件中添加依赖和路由

# 手机号任务服务依赖
def get_mobile_task_service(request: MobileTaskRequest):
    """根据请求中的environment创建MobileTaskService实例"""
    return MobileTaskService(environment=request.environment)

# 为手机号解析接口创建专用的依赖注入函数
def get_mobile_parse_service(request: MobileParseRequest):
    """根据请求创建MobileTaskService实例（用于解析接口）"""
    # 如果MobileParseRequest没有environment字段，可以设置默认值
    return MobileTaskService(environment=getattr(request, 'environment', 'test'))


@app.post("/mobile/parse", response_model=MobileParseResponse, tags=["手机号任务"])
async def parse_mobile_numbers(
        request: MobileParseRequest,
        service: MobileTaskService = Depends(get_mobile_parse_service)
):
    """
    单独解析手机号（仅解析，不执行后续任务）

    仅需要两个参数：
    - file_content: base64编码的TXT文件内容
    - range: 可选，处理范围，如1-50
    """
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"收到手机号解析请求: 请求ID={request_id}, 是否有文件={bool(request.file_content)}, 范围={request.range}")

        # 仅执行解析操作，只传入需要的参数
        mobiles = service.parse_mobile_numbers(
            file_content=request.file_content,
            range_str=request.range
        )

        return {
            "success": True,
            "message": f"成功解析{len(mobiles)}个有效手机号",
            "data": {
                "mobiles": mobiles,
                "count": len(mobiles)
            },
            "request_id": request_id
        }
    except Exception as e:
        logger.error(f"手机号解析出错: {str(e)}", exc_info=True)
        return {
            "success": False,
            "message": f"解析失败: {str(e)}",
            "data": None,
            "request_id": str(uuid.uuid4())
        }



# 手机号任务接口（新增）
@app.post("/mobile/task/process", response_model=MobileTaskResponse, tags=["手机号任务"])
async def process_mobile_tasks(
        request: MobileTaskRequest,
        service: MobileTaskService = Depends(get_mobile_task_service)
):
    """处理手机号批量任务"""
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
        return result
    except Exception as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[手机号任务] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"处理手机号任务时发生错误: {str(e)}")


# 短信服务依赖
def get_sms_service(request: SMSBaseRequest):
    """根据请求中的environment创建SMSService实例"""
    return SMSService(environment=request.environment)


# 1. 获取模板列表
@app.post("/sms/templates", response_model=SMSTemplateResponse, tags=["短信服务"])
async def get_sms_templates(
        request: SMSBaseRequest,
        service: SMSService = Depends(get_sms_service)
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"获取短信模板列表，环境: {request.environment}, 请求ID: {request_id}")

        result = service.get_templates()
        return {
            "success": result["success"],
            "message": result["message"],
            "data": result["data"],
            "request_id": request_id
        }
    except Exception as e:
        logger.error(f"获取短信模板失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# 2. 更新模板配置
@app.post("/sms/templates/update", response_model=SMSTemplateResponse, tags=["短信服务"])
async def update_sms_templates(
        request: SMSBaseRequest,
        service: SMSService = Depends(get_sms_service)
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"更新短信模板，环境: {request.environment}, 请求ID: {request_id}")

        result = service.update_templates(token=request.token)
        return {
            "code": result.get("code",0),
            "success": result["success"],
            "message": result["message"],
            "data": result.get("data", {}).get("list", []),
            "request_id": request_id
        }
    except Exception as e:
        logger.error(f"更新短信模板失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# 3. 获取允许的模板列表
@app.post("/sms/templates/allowed", response_model=SMSTemplateResponse, tags=["短信服务"])
async def get_allowed_templates(
        request: SMSBaseRequest,
        service: SMSService = Depends(get_sms_service)
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"获取允许的短信模板，环境: {request.environment}, 请求ID: {request_id}")

        templates = service.get_allowed_templates()
        return {
            "success": True,
            "message": f"获取到 {len(templates)} 个允许的模板",
            "data": templates,
            "request_id": request_id
        }
    except Exception as e:
        logger.error(f"获取允许的模板失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# 4. 单模板发送
@app.post("/sms/send/single", response_model=SMSSendResponse, tags=["短信服务"])
async def send_single_sms(
        request: SMSSendSingleRequest,
        service: SMSService = Depends(get_sms_service)
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"单模板发送短信，模板: {request.template_code}, 请求ID: {request_id}")

        # 确定手机号
        mobiles = settings.PRESET_MOBILES if request.use_preset_mobiles else request.mobiles
        if not mobiles:
            raise HTTPException(status_code=400, detail="手机号不能为空")

        result = service.send_single(
            template_code=request.template_code,
            mobiles=mobiles,
            params=request.params,
            token=request.token
        )

        return {
            "success": result["success"],
            "message": result["message"],
            "data": result.get("data", []),
            "request_id": request_id,
            "total": result.get("total", 0),
            "success_count": result.get("success_count", 0),
            "failure_count": result.get("failure_count", 0)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"单模板发送失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# 5. 批量发送允许的模板
@app.post("/sms/send/batch", response_model=SMSSendResponse, tags=["短信服务"])
async def batch_send_sms(
        request: SMSBatchSendRequest,
        service: SMSService = Depends(get_sms_service)
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"批量发送短信，模板数量: {len(request.template_codes)}, 请求ID: {request_id}")

        # 确定手机号
        mobiles = settings.PRESET_MOBILES if request.use_preset_mobiles else request.mobiles
        if not mobiles:
            raise HTTPException(status_code=400, detail="手机号不能为空")

        result = service.batch_send(
            template_codes=request.template_codes,
            mobiles=mobiles,
            random_send=request.random_send,
            token=request.token
        )

        return {
            "success": result["success"],
            "message": result["message"],
            "data": result.get("data", []),
            "request_id": request_id,
            "total": result.get("total", 0),
            "success_count": result.get("success_count", 0),
            "failure_count": result.get("failure_count", 0)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"批量发送失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# 6. 补发短信流程
@app.post("/sms/resend", response_model=SMSResendResponse, tags=["短信服务"])
async def resend_sms(
        request: SMSResendRequest,
        service: SMSService = Depends(get_sms_service)
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"补发短信，批次号: {request.batch_no}, 手机号：{request.mobiles}，请求ID: {request_id}")

        # 验证参数：确保批次号和手机号不同时为空
        if not request.batch_no and not request.mobiles:
            raise HTTPException(status_code=400, detail="批次号和手机号不能同时为空")

        # 1. 更新模板
        update_result = service.update_templates(token=request.token)
        if not update_result["success"]:
            raise HTTPException(status_code=500, detail=update_result["message"])

        # 2. 查询工人信息
        fetch_result = service.fetch_workers(
            batch_no=request.batch_no,
            mobiles=request.mobiles,
            tax_id=request.tax_id
        )
        if not fetch_result["success"]:
            raise HTTPException(status_code=500, detail=fetch_result["message"])

        workers = fetch_result["data"]
        if not workers:
            return {
                "success": False,
                "message": "没有找到需要补发的人员",
                "data": [],  # 改为空列表
                "request_id": request_id,
                "workers": []
            }

        # 3. 补发短信
        resend_result = service.resend_sms(workers, token=request.token)

        return {
            "success": resend_result["success"],
            "message": resend_result["message"],
            "data": resend_result.get("data", []),
            "request_id": request_id,
            "workers": workers
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"补发短信失败: {str(e)}")
        # 异常情况下也确保data是列表
        return {
            "success": False,
            "message": f"服务器处理错误: {str(e)}",
            "data": [],  # 异常时返回空列表
            "request_id": str(uuid.uuid4()),
            "workers": []
        }


# 7. Admin Login
@app.post("/system/auth/login", tags=["Admin Auth"])
async def admin_login(request: AdminLoginRequest):
    service = SMSService(environment=request.environment)
    result = service.admin_login()
    return result


# 8. SMS Logs
@app.post("/sms/logs", tags=["SMS Logs"])
async def get_sms_logs(request: SMSLogRequest):
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
        template_id=request.templateId
    )


from .reports import TaxReportGenerator
from .utils import get_enterprise_list
from .models import (
    EnterpriseListResponse,
    TaxDataRequest,
    TaxDataResponse,
    TaxReportGenerateRequest,
    TaxReportGenerateResponse
)
import uuid
from fastapi import HTTPException, Depends


# 依赖项：获取数据库配置（与现有保持一致）
def get_db_config(environment: Optional[str] = None):
    return settings.get_db_config(environment)


# 1. 获取企业列表接口
@app.get("/enterprises/list", response_model=EnterpriseListResponse, tags=["企业管理"])
async def list_enterprises(
        environment: Optional[str] = Query(None, description="环境: test-测试, prod-生产, local-本地"),
):
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    logger.info(f"[企业列表] 开始 | 请求ID: {request_id} | 环境: {environment or 'default'}")
    
    try:
        db_config = get_db_config(environment)
        enterprises = get_enterprise_list(db_config)
        elapsed = round(_time.time() - start_time, 2)
        logger.info(f"[企业列表] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 企业数量: {len(enterprises)}")
        
        # 记录前几个企业名称
        if enterprises:
            names = [e.get('name', e.get('enterprise_name', 'N/A')) for e in enterprises[:5]]
            logger.info(f"[企业列表] 响应数据预览: {names}{'...' if len(enterprises) > 5 else ''}")
        
        return {
            "success": True,
            "message": "已加载企业信息！",
            "data": enterprises,
            "request_id": request_id,
            "total": len(enterprises)
        }
    except Exception as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[企业列表] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 2. 获取完税数据接口
@app.post("/tax/data", response_model=TaxDataResponse, tags=["税务报表"])
async def get_tax_data(
        request: TaxDataRequest,
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
            amount_type=request.amount_type
        )
        elapsed = round(_time.time() - start_time, 2)
        logger.info(f"[完税数据] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 数据条数: {len(tax_data)}")
        
        # 记录数据摘要
        if tax_data:
            total_amount = sum(float(d.get('营业额_元', 0) or 0) for d in tax_data)
            logger.info(f"[完税数据] 响应汇总: 总金额={total_amount:.2f}, 记录数={len(tax_data)}")

        return {
            "success": True,
            "message": "获取完税数据成功",
            "data": tax_data,
            "request_id": request_id,
            "total": len(tax_data)
        }
    except Exception as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[完税数据] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

from urllib.parse import quote
# 3. 生成税务报表接口
@app.post("/tax/report/generate", response_model=TaxReportGenerateResponse, tags=["税务报表"])
async def generate_tax_report(
    request: TaxReportGenerateRequest,
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
            credit_code=request.credit_code
        )

        with open(file_path, "rb") as f:
            file_content = f.read()

        buffer = BytesIO(file_content)
        filename = f"完税报表_{request.year_month.replace('-', '_')}.xlsx"
        encoded_filename = quote(filename.encode('utf-8'))

        try:
            os.remove(file_path)
        except Exception as e:
            logger.warning(f"[税务报表] 删除临时文件失败: {str(e)}")

        elapsed = round(_time.time() - start_time, 2)
        file_size_kb = round(len(file_content) / 1024, 2)
        logger.info(f"[税务报表] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 文件大小: {file_size_kb}KB")

        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "X-Request-ID": request_id
            }
        )

    except ValueError as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.warning(f"[税务报表] 参数错误 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[税务报表] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 在文件中添加必要的导入
from .tax_calculator import TaxCalculator
from .models import TaxCalculationRequest, TaxCalculationResponse
import uuid

# 添加税额计算接口
@app.post("/tax/calculate", response_model=TaxCalculationResponse, tags=["税务计算"])
async def calculate_tax(
        request: TaxCalculationRequest,
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
            mock_data=request.mock_data if request.use_mock else None
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
            "accumulated_donation_deduction": request.accumulated_donation_deduction
        }

        results = calculator.calculate_tax_by_batch(**params)

        if results is None:
            raise ValueError("计算结果为空")

        total_tax = sum(r.get('tax', 0) for r in results) if results else 0.0
        elapsed = round(_time.time() - start_time, 2)
        logger.info(f"[税额计算] 完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 记录数: {len(results)} | 总税额: {round(total_tax, 2)}")

        return {
            "success": True,
            "message": f"计算完成，共返回 {len(results)} 条记录",
            "data": results,
            "request_id": request_id,
            "total_tax": round(total_tax, 2)
        }

    except ValueError as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.warning(f"[税额计算] 参数错误 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        elapsed = round(_time.time() - start_time, 2)
        logger.error(f"[税额计算] 失败 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 错误: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"计算过程中发生错误: {str(e)}")


# ================= OCR处理接口 =================
from .ocr_service import run_ocr_process, set_abort_signal
from .models import OCRProcessRequest


@app.post("/ocr/process", tags=["OCR处理"])
async def process_ocr(request: OCRProcessRequest):
    """本地路径模式（仅限本地运行，Docker中无法使用）"""
    request_id = str(uuid.uuid4())
    logger.info(f"[OCR本地模式] 开始 | 请求ID: {request_id}")
    logger.info(f"[OCR本地模式] 参数: Excel={request.excel_path}, 附件={request.source_folder}, 模式={request.mode}")
    
    return StreamingResponse(
        run_ocr_process(
            excel_path=request.excel_path,
            source_folder=request.source_folder,
            target_excel_path=request.target_excel_path,
            mode=request.mode
        ),
        media_type="application/x-ndjson"
    )


# ================= OCR 文件上传模式（Docker专用）=================
import shutil
import tempfile

# 输出目录（持久化，用于下载结果）
OUTPUTS_DIR = os.path.join(os.path.dirname(__file__), "..", "outputs")
if not os.path.exists(OUTPUTS_DIR):
    os.makedirs(OUTPUTS_DIR)
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")


@app.post("/ocr/process-upload", tags=["OCR处理"])
async def process_ocr_upload(
    mode: int = Form(1),
    excel_file: UploadFile = File(...),
    image_files: List[UploadFile] = File(...)
):
    """上传模式：接收 Excel 和图片文件，处理后返回结果下载链接"""
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    total_size_mb = round(sum(len(await img.read()) for img in image_files) / 1024 / 1024, 2) if False else 0
    
    logger.info(f"[OCR上传模式] 开始 | 请求ID: {request_id}")
    logger.info(f"[OCR上传模式] 参数: Excel={excel_file.filename}, 图片数={len(image_files)}, 模式={mode}")
    
    # 关键：在 generator 开始前读取所有文件内容到内存
    excel_content = await excel_file.read()
    excel_filename = excel_file.filename or "upload.xlsx"
    
    # 读取所有图片文件
    image_data_list = []
    for img in image_files:
        if img.filename:
            content = await img.read()
            image_data_list.append({
                "filename": img.filename,
                "content": content
            })
    
    total_size_mb = round(sum(len(d["content"]) for d in image_data_list) / 1024 / 1024, 2)
    logger.info(f"[OCR上传模式] 文件接收完成 | 请求ID: {request_id} | 图片总大小: {total_size_mb}MB")
    
    # 打印第一个文件名看看目录结构
    if image_data_list:
        logger.info(f"[OCR上传模式] 图片路径示例: {image_data_list[0]['filename']}")
    
    def process_generator():
        # 创建临时目录
        temp_dir = tempfile.mkdtemp()
        try:
            temp_path = Path(temp_dir)
            source_folder = temp_path / "source_images"
            source_folder.mkdir()
            
            # 保存 Excel
            excel_path = temp_path / excel_filename
            with open(excel_path, "wb") as f:
                f.write(excel_content)
            
            yield json.dumps({"type": "log", "content": f"已接收 Excel: {excel_filename}"}, ensure_ascii=False) + "\n"
            yield json.dumps({"type": "log", "content": f"mode 参数值: {mode}"}, ensure_ascii=False) + "\n"
            
            # 保存图片（保持完整的子目录结构）
            # webkitdirectory 上传时：附件信息/张三/photo.jpg
            count = 0
            first_folder_logged = False
            for img_data in image_data_list:
                original_path = img_data["filename"]
                # 解析完整的路径结构
                parts = original_path.replace("\\", "/").split("/")
                
                # 处理路径结构：
                # - 如果路径包含多层，直接使用完整结构（保留所有子目录）
                # - 例如：附件信息/附件信息/王京川/111111.jpg → 保持完整结构
                new_path = "/".join(parts)
                
                if not first_folder_logged:
                    yield json.dumps({"type": "log", "content": f"原始路径: {original_path} → 映射为: {new_path}"}, ensure_ascii=False) + "\n"
                    first_folder_logged = True
                
                target_path = source_folder / new_path
                target_path.parent.mkdir(parents=True, exist_ok=True)
                with open(target_path, "wb") as f:
                    f.write(img_data["content"])
                count += 1
            
            yield json.dumps({"type": "log", "content": f"已接收图片文件: {count} 个"}, ensure_ascii=False) + "\n"

            # 准备输出路径
            output_filename = f"ocr_result_{uuid.uuid4().hex[:8]}.xlsx"
            target_excel_path = os.path.join(OUTPUTS_DIR, output_filename)
            
            # 调用 OCR
            ocr_gen = run_ocr_process(
                excel_path=str(excel_path),
                source_folder=str(source_folder),
                target_excel_path=target_excel_path,
                mode=mode,
                request_id=request_id
            )
            
            # 转发 OCR 日志
            for item in ocr_gen:
                yield item
            
            # 返回下载链接
            if os.path.exists(target_excel_path):
                yield json.dumps({
                    "type": "result", 
                    "success": True, 
                    "message": "处理完成", 
                    "download_url": f"outputs/{output_filename}"
                }, ensure_ascii=False) + "\n"
            else:
                yield json.dumps({
                    "type": "result", 
                    "success": False, 
                    "message": "未生成结果文件"
                }, ensure_ascii=False) + "\n"
        finally:
            # 清理临时目录
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                pass

    return StreamingResponse(process_generator(), media_type="application/x-ndjson")


# ================= OCR 中止接口 =================
@app.post("/ocr/abort/{request_id}", tags=["OCR处理"])
async def abort_ocr(request_id: str):
    """
    中止指定的 OCR 处理任务
    
    前端在收到 init 消息中的 request_id 后，可调用此接口发送中止请求。
    后端会在处理下一个人员/文件夹前检查该信号并提前结束。
    """
    logger.info(f"[OCR中止] 收到中止请求 | 请求ID: {request_id}")
    set_abort_signal(request_id)
    return {"success": True, "message": f"已发送中止信号: {request_id}"}

# 支付统计相关接口
@app.post("/stats/payment/enterprises", response_model=PaymentStatsResponse, tags=["支付统计"])
async def get_payment_enterprises(request: PaymentStatsRequest):
    """获取用于支付统计的正常企业列表"""
    request_id = str(uuid.uuid4())
    try:
        service = PaymentStatsService(environment=request.environment)
        enterprises = service.get_normal_enterprises()
        return {
            "success": True,
            "message": "获取成功",
            "data": {"enterprises": enterprises},
            "request_id": request_id
        }
    except Exception as e:
        logger.error(f"获取企业列表失败: {e}")
        return {
            "success": False,
            "message": str(e),
            "request_id": request_id
        }


@app.post("/stats/payment/calculate", response_model=PaymentStatsResponse, tags=["支付统计"])
async def calculate_payment_stats(request: PaymentStatsRequest):
    """计算支付统计数据"""
    request_id = str(uuid.uuid4())
    try:
        service = PaymentStatsService(environment=request.environment)
        stats = service.calculate_stats(enterprise_ids=request.enterprise_ids)
        return {
            "success": True, 
            "message": "计算成功", 
            "data": stats, 
            "request_id": request_id
        }
    except Exception as e:
        logger.error(f"计算统计失败: {e}")
        return {
            "success": False, 
            "message": str(e), 
            "request_id": request_id
        }


# 交付物工具接口
@app.post("/delivery/login", tags=["交付物工具"])
async def delivery_login(request: DeliveryLoginRequest):
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[交付物-登录] 手机号: {request.mobile}")
    service = MobileTaskService(environment=request.environment, silent=True)
    result = service.delivery_login(request.mobile, request.code)
    if result.get("success"):
        logger.info(f"[交付物-登录] ✅ 登录成功")
    else:
        logger.warning(f"[交付物-登录] ❌ 登录失败: {result.get('msg')}")
    return result

@app.post("/delivery/tasks", tags=["交付物工具"])
async def delivery_tasks(request: DeliveryTaskRequest):
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[交付物-任务列表] 获取任务列表, status={request.status}")
    service = MobileTaskService(environment=request.environment, silent=True)
    return service.delivery_get_tasks(request.token, request.status)

@app.post("/delivery/upload", tags=["交付物工具"])
async def delivery_upload(
    environment: str = Form(...),
    token: str = Form(...),
    file: UploadFile = File(...)
):
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[交付物-上传] 文件名: {file.filename}")
    service = MobileTaskService(environment=environment, silent=True)
    content = await file.read()
    result = service.delivery_upload(token, content, file.filename)
    if result.get("code") == 0:
        logger.info(f"[交付物-上传] ✅ 上传成功, URL: {result.get('data', '无')}")
    else:
        logger.warning(f"[交付物-上传] ❌ 上传失败: {result.get('msg')}")
    return result

@app.post("/delivery/submit", tags=["交付物工具"])
async def delivery_submit(request: DeliverySubmitRequest):
    # delivery_submit 内部已有详细日志，这里不需要额外日志
    service = MobileTaskService(environment=request.environment, silent=True)
    return service.delivery_submit(request.token, request.payload)

@app.post("/delivery/worker-info", tags=["交付物工具"])
async def delivery_worker_info(request: DeliveryWorkerInfoRequest):
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[交付物-用户信息] 获取用户信息")
    service = MobileTaskService(environment=request.environment, silent=True)
    return service.delivery_worker_info(request.token)



# ================= AI 助手接口 =================
from .services.ai_service import AiService
from .models import ChatRequest, ChatResponse

def get_ai_service():
    return AiService()

@app.post('/ai/chat', tags=['AI助手'])
async def chat_with_ai(
    request: ChatRequest,
    service: AiService = Depends(get_ai_service)
):
    """
    与AI助手对话 (流式响应)
    支持可选的图片输入用于页面截图分析
    """
    return StreamingResponse(
        service.generate_response_stream(
            message=request.message,
            history=request.history,
            context=request.context,
            image_data=request.image
        ),
        media_type='text/event-stream'
    )


# ================= 服务器监控接口 =================
from .services.monitoring_service import (
    load_servers, save_servers, get_all_metrics, fetch_server_metrics,
    get_server_by_id, add_server as add_server_config, update_server, delete_server,
    check_server_health, ServerConfig
)

@app.get("/api/monitoring/servers", tags=["服务器监控"])
async def list_monitoring_servers():
    """获取所有服务器配置列表"""
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 获取服务器列表 | 请求ID: {request_id}")
    servers = load_servers()
    return {
        "success": True,
        "data": [s.dict() for s in servers],
        "total": len(servers),
        "request_id": request_id
    }


@app.post("/api/monitoring/servers", tags=["服务器监控"])
async def add_monitoring_server(server: ServerConfig):
    """添加服务器"""
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 添加服务器 | 请求ID: {request_id} | 名称: {server.name} | 主机: {server.host}")
    
    if not add_server_config(server):
        raise HTTPException(status_code=400, detail=f"服务器 ID '{server.id}' 已存在")
    
    return {
        "success": True,
        "message": f"服务器 '{server.name}' 添加成功",
        "request_id": request_id
    }


@app.put("/api/monitoring/servers/{server_id}", tags=["服务器监控"])
async def update_monitoring_server(server_id: str, server: ServerConfig):
    """更新服务器配置"""
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 更新服务器 | 请求ID: {request_id} | ID: {server_id}")
    
    if not update_server(server_id, server):
        raise HTTPException(status_code=404, detail=f"服务器 '{server_id}' 不存在")
    
    return {
        "success": True,
        "message": f"服务器 '{server.name}' 更新成功",
        "request_id": request_id
    }


@app.delete("/api/monitoring/servers/{server_id}", tags=["服务器监控"])
async def delete_monitoring_server(server_id: str):
    """删除服务器"""
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 删除服务器 | 请求ID: {request_id} | ID: {server_id}")
    
    if not delete_server(server_id):
        raise HTTPException(status_code=404, detail=f"服务器 '{server_id}' 不存在")
    
    return {
        "success": True,
        "message": "服务器删除成功",
        "request_id": request_id
    }


@app.get("/api/monitoring/metrics", tags=["服务器监控"])
async def get_monitoring_metrics():
    """获取所有服务器实时指标"""
    request_id = str(uuid.uuid4())
    start_time = _time.time()
    logger.info(f"[服务器监控] 获取所有指标 | 请求ID: {request_id}")
    
    metrics = await get_all_metrics()
    elapsed = round(_time.time() - start_time, 2)
    
    online_count = sum(1 for m in metrics if m.online)
    logger.info(f"[服务器监控] 指标获取完成 | 请求ID: {request_id} | 耗时: {elapsed}秒 | 在线: {online_count}/{len(metrics)}")
    
    return {
        "success": True,
        "data": [m.dict() for m in metrics],
        "summary": {
            "total": len(metrics),
            "online": online_count,
            "offline": len(metrics) - online_count
        },
        "request_id": request_id
    }


@app.get("/api/monitoring/servers/{server_id}/metrics", tags=["服务器监控"])
async def get_server_detail_metrics(server_id: str):
    """获取单台服务器详细指标"""
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 获取服务器详情 | 请求ID: {request_id} | ID: {server_id}")
    
    server = get_server_by_id(server_id)
    if not server:
        raise HTTPException(status_code=404, detail=f"服务器 '{server_id}' 不存在")
    
    metrics = await fetch_server_metrics(server)
    
    return {
        "success": True,
        "data": metrics.dict(),
        "request_id": request_id
    }


@app.get("/api/monitoring/servers/{server_id}/health", tags=["服务器监控"])
async def check_server_health_status(server_id: str):
    """检查服务器健康状态（无需Agent鉴权）"""
    request_id = str(uuid.uuid4())
    logger.info(f"[服务器监控] 健康检查 | 请求ID: {request_id} | ID: {server_id}")
    
    server = get_server_by_id(server_id)
    if not server:
        raise HTTPException(status_code=404, detail=f"服务器 '{server_id}' 不存在")
    
    health = await check_server_health(server)
    
    return {
        "success": True,
        "data": health,
        "request_id": request_id
    }


# AI 资源管理接口
@app.get("/ai-resources/data", response_model=AIResourcesDataResponse, tags=["AI资源"])
async def get_ai_resources(db: Session = Depends(get_db)):
    """获取所有 AI 资源数据"""
    service = AiResourceService(db)
    return service.get_all_data()

@app.post("/ai-resources/save", tags=["AI资源"])
async def save_ai_resources(request: AIResourcesSaveRequest, db: Session = Depends(get_db)):
    """保存 AI 资源数据（同步模式）"""
    service = AiResourceService(db)
    try:
        service.save_all_data(request.categories, request.resources)
        return {"success": True}
    except Exception as e:
        logger.error(f"Error saving AI resources: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/ai-resources/{resource_id}", tags=["AI资源"])
async def delete_ai_resource(resource_id: str, db: Session = Depends(get_db)):
    """删除 AI 资源"""
    service = AiResourceService(db)
    if service.delete_resource(resource_id):
        return {"success": True}
    else:
        raise HTTPException(status_code=404, detail="Resource not found")
