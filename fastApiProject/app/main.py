from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
import logging
import asyncio
import os
import sys
import time
import uuid

from . import config
from .services.monitoring_service import check_and_alert
from .config import settings
from .database import SessionLocal
from .schema_maintenance import ensure_recruitment_schema, ensure_script_hub_schema
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
    settlement_sim_router,
)
from .routers.recruitment import recover_orphaned_tasks_on_startup
from .services.recruitment_service import RecruitmentService
from .services.match_scheduler import key_rotator, scheduler

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


def _request_timing_log_enabled() -> bool:
    value = (os.getenv("REQUEST_TIMING_LOG_ENABLED") or "1").strip().lower()
    return value not in {"0", "false", "no", "off"}


def _request_timing_prefixes() -> tuple[str, ...]:
    raw = os.getenv("REQUEST_TIMING_LOG_PREFIXES") or "/recruitment,/auth/session"
    return tuple(prefix.strip().rstrip("/") for prefix in raw.split(",") if prefix.strip())


def _should_log_request_timing(path: str) -> bool:
    if not _request_timing_log_enabled():
        return False
    prefixes = _request_timing_prefixes()
    return any(path == prefix or path.startswith(f"{prefix}/") for prefix in prefixes)


def _request_query_keys(request: Request) -> list[str]:
    return sorted(set(request.query_params.keys()))


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    path = request.url.path
    if not _should_log_request_timing(path):
        return await call_next(request)

    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    started_at = time.perf_counter()
    client = request.client.host if request.client else "-"
    query_keys = _request_query_keys(request)
    status_code = 500
    error_name = None

    logger.info(
        "[request-timing] start request_id=%s method=%s path=%s query_keys=%s client=%s pid=%s",
        request_id,
        request.method,
        path,
        query_keys,
        client,
        os.getpid(),
    )

    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    except Exception as exc:
        error_name = type(exc).__name__
        logger.exception(
            "[request-timing] exception request_id=%s method=%s path=%s error=%s",
            request_id,
            request.method,
            path,
            error_name,
        )
        raise
    finally:
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        logger.info(
            "[request-timing] finish request_id=%s method=%s path=%s status=%s duration_ms=%s error=%s",
            request_id,
            request.method,
            path,
            status_code,
            duration_ms,
            error_name,
        )


def _resume_recruitment_screening_queue() -> None:
    ensure_recruitment_schema()
    db = SessionLocal()
    try:
        service = RecruitmentService(db)
        result = service.resume_screening_queue_on_startup()
        logger.info(
            "Recruitment screening queue resume finished: requeued=%s dispatched=%s active=%s",
            result.get("requeued_count", 0),
            result.get("dispatch", {}).get("started_count", 0) if isinstance(result.get("dispatch"), dict) else 0,
            result.get("dispatch", {}).get("active_count", 0) if isinstance(result.get("dispatch"), dict) else 0,
        )
    finally:
        db.close()


async def _init_match_scheduler() -> None:
    """从DB加载LLM key配置，初始化匹配调度器并启动worker"""
    from .recruitment_models import RecruitmentLLMConfig
    db = SessionLocal()
    try:
        configs = db.query(RecruitmentLLMConfig).filter(
            RecruitmentLLMConfig.is_active == True
        ).all()
        key_configs = [
            {
                "key_id": f"config_{cfg.id}",
                "config_id": cfg.id,
                "max_concurrent": cfg.max_concurrent or 4,
                "max_qps": cfg.max_qps or 10,
            }
            for cfg in configs
        ]
        key_rotator.reload(key_configs)
        await scheduler.start()
        logger.info("Match scheduler initialized: %d keys, %d workers",
                     len(key_configs), scheduler.stats().get("worker_count", 0))
    except Exception as exc:
        logger.error("Failed to init match scheduler: %s", exc, exc_info=True)
    finally:
        db.close()


def _warmup_recruitment_pdf_ocr() -> None:
    if sys.platform == "darwin":
        logger.info("Recruitment PDF OCR warmup skipped on macOS; Vision OCR is used on demand")
        return
    try:
        from .ocr_service import warmup_ocr_engine

        logger.info(
            "Recruitment PDF OCR warmup started max_pages=%s render_scale=%s",
            os.getenv("RECRUITMENT_PDF_OCR_MAX_PAGES", "1"),
            os.getenv("RECRUITMENT_PDF_OCR_RENDER_SCALE", "2"),
        )
        warmup_ocr_engine()
        logger.info("Recruitment PDF OCR warmup finished")
    except Exception as exc:
        logger.warning("Recruitment PDF OCR warmup skipped or failed: %s", exc, exc_info=True)


@app.on_event("startup")
async def startup_event():
    """启动时初始化"""
    try:
        await run_in_threadpool(ensure_script_hub_schema)
        await recover_orphaned_tasks_on_startup()
        await run_in_threadpool(_resume_recruitment_screening_queue)
        await _init_match_scheduler()
    except Exception as exc:
        logger.error("Failed to initialize schemas or recruitment queue on startup: %s", exc, exc_info=True)
    logger.info("Starting background tasks...")
    asyncio.create_task(background_monitoring_loop())
    if os.getenv("RECRUITMENT_PRELOAD_PDF_OCR", "1").strip() != "0":
        asyncio.create_task(asyncio.to_thread(_warmup_recruitment_pdf_ocr))

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
app.include_router(settlement_sim_router)


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
