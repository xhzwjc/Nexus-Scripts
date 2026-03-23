from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
import logging
import asyncio

from . import config
from .services.monitoring_service import check_and_alert
from .config import settings
from .schema_maintenance import ensure_script_hub_schema
from .routers import (
    OUTPUTS_DIR,
    ai_resources_router,
    auth_router,
    business_core_router,
    mobile_sms_router,
    monitoring_router,
    rbac_router,
    recruitment_router,
    tax_tools_router,
    team_resources_router,
    workbench_router,
)

# 配置日志
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
APP_ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = APP_ROOT / "static"

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
    try:
        ensure_script_hub_schema()
    except Exception as exc:
        logger.error("Failed to ensure Script Hub schema on startup: %s", exc, exc_info=True)
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
        # 每 1 小时检查一次
        await asyncio.sleep(3600)


# 挂载静态文件目录（关键：让FastAPI能访问本地资源）
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# 配置CORS（保持不变）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_origin_regex=settings.cors_allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(rbac_router)
app.include_router(monitoring_router)
app.include_router(ai_resources_router)
app.include_router(team_resources_router)
app.include_router(business_core_router)
app.include_router(tax_tools_router)
app.include_router(mobile_sms_router)
app.include_router(recruitment_router)
app.include_router(workbench_router)


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

app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")
