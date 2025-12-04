import os
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
import logging
import uuid
from typing import Optional, List, Dict, Any

from starlette.responses import StreamingResponse

from . import config
from .models import (
    SettlementRequest, SettlementResponse,
    BalanceVerificationRequest, BalanceVerificationResponse, CommissionCalculationRequest,
    CommissionCalculationResponse, MobileTaskRequest, MobileTaskResponse, SMSResendResponse, SMSResendRequest,
    SMSSendResponse, SMSBatchSendRequest, SMSSendSingleRequest, SMSBaseRequest, SMSTemplateResponse,
    MobileParseResponse, MobileParseRequest, TaxCalculationResponse, TaxCalculationRequest
)
from .services import EnterpriseSettlementService, AccountBalanceService, CommissionCalculationService, \
    MobileTaskService, SMSService
from .config import settings

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

@app.post("/settlement/process", response_model=SettlementResponse, tags=["结算处理"])
async def process_settlement(
        request: SettlementRequest,
        service: EnterpriseSettlementService = Depends(get_settlement_service)
):
    """
    处理企业结算任务

    支持并发或顺序处理多个企业的结算任务，包括：
    - 发起结算
    - 重新发起结算
    - 批次下结算单单独发起
    """
    try:
        logger.info(f"收到结算请求: {request.dict(exclude={'enterprises': {'__all__': ['token']}})}")  # 不打印token
        result = service.process_settlement(request)
        return result
    except Exception as e:
        logger.error(f"结算API处理出错: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"处理结算请求时发生错误: {str(e)}")

# 账户核对接口（新增）
@app.post("/balance/verify", response_model=BalanceVerificationResponse, tags=["账户核对"])
async def verify_balance(
    request: BalanceVerificationRequest,
    # Use the helper function as dependency
    service: AccountBalanceService = Depends(get_balance_service)
):
    try:
        logger.info(f"收到余额核对请求: 企业ID={request.tenant_id}, 环境={request.environment}, 超时={request.timeout}秒")
        # 调用服务时传入租户ID和超时时间
        result = service.verify_balances_with_timeout(
            tenant_id=request.tenant_id,
            timeout=request.timeout
        )
        return {
            "success": True,
            "message": "核对完成" if result else "未找到企业数据",
            "data": result,
            "request_id": str(uuid.uuid4()),
            "enterprise_id": request.tenant_id
        }
    except TimeoutError as e:
        raise HTTPException(status_code=408, detail=str(e))
    except Exception as e:
        logger.error(f"余额核对出错: {str(e)}", exc_info=True)
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
    try:
        request_id = str(uuid.uuid4())
        logger.info(
            f"收到佣金计算请求: 渠道ID={request.channel_id}, 环境={request.environment}, "
            f"请求ID={request_id}"
        )

        # 传递分页参数到服务层
        result = service.calculate_commission(
            channel_id=request.channel_id,
            timeout=request.timeout,
        )
        return {
            "success": True,
            "message": "佣金计算完成",
            "data": result,
            "request_id": request_id,
            "channel_id": request.channel_id
        }
    except TimeoutError as e:
        raise HTTPException(status_code=408, detail=str(e))
    except Exception as e:
        logger.error(f"佣金计算出错: {str(e)}", exc_info=True)
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
    """
    处理手机号批量任务

    支持两种输入模式：
    - 文件上传模式：通过file_content传递base64编码的TXT内容，可通过range指定处理范围
    - 手动输入模式：通过mobiles参数传递手机号列表

    操作模式：
    - None：完整流程（登录→报名→提交交付物）
    - 1：登录→报名
    - 2：登录→提交交付物
    - 3：登录→确认结算
    """
    try:
        logger.info(f"收到手机号任务请求: 模式={request.mode}, 手机号数量={len(request.mobiles)}, "
                    f"是否有文件={bool(request.file_content)}, 范围={request.range}")
        result = service.process_mobile_tasks(request)
        return result
    except Exception as e:
        logger.error(f"手机号任务API处理出错: {str(e)}", exc_info=True)
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

        result = service.update_templates()
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
            params=request.params
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
            random_send=request.random_send
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
        update_result = service.update_templates()
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
        resend_result = service.resend_sms(workers)

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


# 1. 获取企业列表接口（已存在，保持不变）
@app.get("/enterprises/list", response_model=EnterpriseListResponse, tags=["企业管理"])
async def list_enterprises(
        environment: Optional[str] = Query(None, description="环境: test-测试, prod-生产, local-本地"),
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"获取企业列表，请求ID: {request_id}")

        db_config = get_db_config(environment)
        enterprises = get_enterprise_list(db_config)

        return {
            "success": True,
            "message": "已加载企业信息！",
            "data": enterprises,
            "request_id": request_id,
            "total": len(enterprises)
        }
    except Exception as e:
        logger.error(f"获取企业列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# 2. 获取完税数据接口
@app.post("/tax/data", response_model=TaxDataResponse, tags=["税务报表"])
async def get_tax_data(
        request: TaxDataRequest,
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"获取完税数据，年月: {request.year_month}, 请求ID: {request_id}")

        db_config = get_db_config(request.environment)
        generator = TaxReportGenerator(db_config)
        tax_data = generator.query_tax_data(
            year_month=request.year_month,
            enterprise_ids=request.enterprise_ids,
            amount_type=request.amount_type
        )


        return {
            "success": True,
            "message": "获取完税数据成功",
            "data": tax_data,
            "request_id": request_id,
            "total": len(tax_data)
        }
    except Exception as e:
        logger.error(f"获取完税数据失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

from urllib.parse import quote
# 3. 生成税务报表接口
@app.post("/tax/report/generate", response_model=TaxReportGenerateResponse, tags=["税务报表"])
async def generate_tax_report(
    request: TaxReportGenerateRequest,
):
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"生成税务报表，年月: {request.year_month}, 请求ID: {request_id}")

        # 使用统一的环境配置获取方式
        db_config = get_db_config(request.environment)
        generator = TaxReportGenerator(db_config)

        # 生成临时文件路径
        temp_file_name = f"tax_report_{request.year_month.replace('-', '_')}_{request_id}.xlsx"
        temp_output_path = Path("/tmp") / temp_file_name  # 使用系统临时目录

        # 调用生成报表方法
        file_path = generator.generate_tax_report(
            year_month=request.year_month,
            output_path=temp_output_path,
            enterprise_ids=request.enterprise_ids,
            amount_type=request.amount_type,
            platform_company=request.platform_company,
            credit_code=request.credit_code
        )

        # 读取文件内容为字节流
        with open(file_path, "rb") as f:
            file_content = f.read()

        # 创建字节流缓冲区
        buffer = BytesIO(file_content)

        # 构建文件名
        filename = f"完税报表_{request.year_month.replace('-', '_')}.xlsx"

        # 关键修改：对中文文件名进行UTF-8编码并URL转义
        encoded_filename = quote(filename.encode('utf-8'))

        # 删除临时文件
        try:
            os.remove(file_path)
        except Exception as e:
            logger.warning(f"删除临时文件失败: {str(e)}")

        # 返回文件流响应
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "X-Request-ID": request_id
            }
        )

    except ValueError as e:
        logger.warning(f"生成税务报表警告: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"生成税务报表失败: {str(e)}")
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
    try:
        request_id = str(uuid.uuid4())
        logger.info(f"开始税额计算，请求ID: {request_id}, 参数: {request.dict()}")

        # 验证参数合法性
        # 模拟数据模式下放宽验证条件
        print(request.use_mock)
        if not request.use_mock:
            if not request.batch_no and (not request.credential_num or request.credential_num.strip() == ""):
                raise ValueError("必须提供批次号或身份证号")
        else:
            # 模拟数据模式下，允许不提供批次号和身份证号
            # 自动生成一个临时身份证号用于计算
            if not request.credential_num or request.credential_num.strip() == "":
                request.credential_num = f"MOCK_{uuid.uuid4().hex[:10]}"
                logger.info(f"模拟数据模式自动生成临时身份证号: {request.credential_num}")

        # 获取数据库配置
        db_config = get_db_config(request.environment)

        # 初始化计算器（支持模拟数据模式）
        calculator = TaxCalculator(
            db_config=db_config,
            mock_data=request.mock_data if request.use_mock else None
        )

        # 准备计算参数
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

        # 执行计算
        results = calculator.calculate_tax_by_batch(**params)

        # 检查计算结果
        if results is None:
            raise ValueError("计算结果为空")

        total_tax = sum(r.get('tax', 0) for r in results) if results else 0.0

        return {
            "success": True,
            "message": f"计算完成，共返回 {len(results)} 条记录",
            "data": results,
            "request_id": request_id,
            "total_tax": round(total_tax, 2)
        }

    except ValueError as e:
        logger.warning(f"参数错误: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"税额计算失败: {str(e)}", exc_info=True)  # 记录完整堆栈信息
        # 生产环境中可以返回更通用的错误信息
        raise HTTPException(status_code=500, detail=f"计算过程中发生错误: {str(e)}")


# ================= OCR处理接口 =================
from .ocr_service import run_ocr_process
from .models import OCRProcessRequest, OCRProcessResponse


@app.post("/ocr/process", response_model=OCRProcessResponse, tags=["OCR处理"])
async def process_ocr(request: OCRProcessRequest):
    """
    个人信息OCR比对处理

    支持两种运行模式：
    - mode=1：按 Excel 顺序匹配附件（默认）
    - mode=2：按 附件识别 → 反查匹配 Excel
    """
    try:
        logger.info(f"收到OCR处理请求: excel_path={request.excel_path}, mode={request.mode}")

        success, logs, message = run_ocr_process(
            excel_path=request.excel_path,
            source_folder=request.source_folder,
            target_excel_path=request.target_excel_path,
            mode=request.mode
        )

        return OCRProcessResponse(
            success=success,
            message=message,
            logs=logs
        )
    except Exception as e:
        logger.error(f"OCR处理出错: {str(e)}", exc_info=True)
        return OCRProcessResponse(
            success=False,
            message=f"处理出错: {str(e)}",
            logs=[f"❌ 处理出错: {str(e)}"]
        )

