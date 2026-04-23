from __future__ import annotations

import ast
from collections import deque
from contextlib import contextmanager
import hashlib
import json
import logging
import mimetypes
import os
import shutil
import threading
import time
from datetime import datetime, timedelta
import re
from types import SimpleNamespace
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

import httpx
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import DataError, SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..permission_governance import (
    PermissionContext,
    ROOT_ORG_CODE,
    SHARE_POLICY_SHARED_COPYABLE,
    build_permission_context,
    normalize_org_code,
    normalize_share_policy,
    resource_is_visible_to_context,
)
from ..recruitment_models import (
    RecruitmentAITaskLog,
    RecruitmentCandidate,
    RecruitmentCandidateScore,
    RecruitmentCandidateStatusHistory,
    RecruitmentCandidateWorkflowMemory,
    RecruitmentChatContextMemory,
    RecruitmentInterviewResult,
    RecruitmentInterviewQuestion,
    RecruitmentJDVersion,
    RecruitmentLLMConfig,
    RecruitmentMailRecipient,
    RecruitmentMailSenderConfig,
    RecruitmentPosition,
    RecruitmentPositionSkillLink,
    RecruitmentPublishTask,
    RecruitmentResumeFile,
    RecruitmentResumeMailDispatch,
    RecruitmentResumeParseResult,
    RecruitmentRuleConfig,
    RecruitmentSkill,
)
from ..secret_crypto import decrypt_secret, encrypt_secret, mask_secret
from .recruitment_ai_gateway import RecruitmentAIGateway, RecruitmentAIJSONParseError, RecruitmentAIRetryExhaustedError, RecruitmentAIScreeningTotalTimeoutError, RecruitmentAITimeoutError, SCREENING_STAGE_MIN_TIMEOUT_SECONDS, SCREENING_TOTAL_TIMEOUT_SECONDS, _parse_llm_json_response, get_provider_options
from .recruitment_mailer import RecruitmentMailSenderRuntime, build_resume_email, load_attachment_from_path, send_email_via_smtp
from .recruitment_prompts import INTERVIEW_QUESTION_STREAM_PREVIEW_SYSTEM_PROMPT, INTERVIEW_QUESTION_SYSTEM_PROMPT, JD_GENERATION_STREAM_PREVIEW_SYSTEM_PROMPT, JD_GENERATION_SYSTEM_PROMPT, RESUME_PARSE_SYSTEM_PROMPT, RESUME_SCORE_PROMPT_VERSION, RESUME_SCORE_SYSTEM_PROMPT, RESUME_SCREENING_PROMPT_VERSION, RESUME_SCREENING_SYSTEM_PROMPT
from .recruitment_publish_adapters import build_publish_adapter
from .recruitment_task_control import RecruitmentTaskCancelled, RecruitmentTaskControl, recruitment_task_registry
from .recruitment_utils import CANDIDATE_STATUS_OPTIONS, DEFAULT_RULE_CONFIGS, POSITION_STATUS_OPTIONS, RECRUITMENT_UPLOAD_ROOT, build_jd_structured_fallback, detect_interview_rule_leakage, ensure_interview_html_document, extract_keywords, extract_resume_structured_data, extract_resume_text, extract_screening_dimension_rules, isoformat_or_none, json_dumps_safe, json_loads_safe, markdown_to_html, normalize_resume_fallback_name, normalize_structured_interview, normalize_structured_jd, render_interview_html, render_interview_markdown, render_jd_markdown_source, render_publish_ready_jd, safe_file_stem, score_candidate_fallback, strip_markdown, truncate_text, validate_structured_interview_payload

SCREENING_FLOW_TASK_TYPE = "screening_flow"
SCREENING_DEBUG_TASK_TYPE = "resume_screening_debug"
SCREENING_ONE_PASS_TASK_TYPE = "resume_screening_one_pass"
SCREENING_SCORE_TASK_TYPES = ("resume_score", SCREENING_ONE_PASS_TASK_TYPE)
KNOWN_AI_TASK_TYPES = [SCREENING_FLOW_TASK_TYPE, "jd_generation", "resume_parse", "resume_score", SCREENING_ONE_PASS_TASK_TYPE, "interview_question_generation", "chat_orchestrator", "resume_mail_dispatch", "publish_task"]
LLM_TASK_TYPE_OPTIONS = [{"value": "default", "label": "默认模型"}, {"value": "jd_generation", "label": "JD 生成"}, {"value": "resume_parse", "label": "简历解析"}, {"value": "resume_score", "label": "简历评分"}, {"value": SCREENING_ONE_PASS_TASK_TYPE, "label": "一体化初筛"}, {"value": "interview_question_generation", "label": "面试题生成"}, {"value": "chat_orchestrator", "label": "AI 助手"}]
SCREENING_STATUS_LABELS = {item["value"]: item["label"] for item in CANDIDATE_STATUS_OPTIONS}
STRICT_RESUME_SCORE_FIELDS = (
    "total_score",
    "match_percent",
    "advantages",
    "concerns",
    "recommendation",
    "suggested_status",
    "dimensions",
)
RAW_SCREENING_SCORE_STORAGE_FORMAT = "raw_screening_v1"
VALID_SCREENING_SUGGESTED_STATUSES = {"screening_passed", "talent_pool", "screening_rejected"}
VALID_SCREENING_MODES = {"default", "rerank_from_existing_parse", "fallback_parse_then_score"}
SCREENING_PAYLOAD_SCHEMA_CONFIG = {
    "parsed_resume": {
        "basic_info_fields": ("name", "phone", "email", "years_of_experience", "education", "location"),
        "list_fields": ("work_experiences", "education_experiences", "skills", "projects"),
        "string_fields": ("summary",),
    },
    "score": {
        "number_fields": ("total_score", "match_percent"),
        "text_list_fields": ("advantages", "concerns"),
        "string_fields": ("recommendation",),
        "enum_fields": {
            "suggested_status": VALID_SCREENING_SUGGESTED_STATUSES,
        },
        "dimension_fields": ("label", "score", "max_score", "reason", "evidence", "is_inferred"),
    },
}
MAIL_AUTO_PUSH_GLOBAL_CONFIG_KEY = "mail_auto_push_defaults"
POSITION_AUTO_MAIL_CONFIG_KEY = "position_auto_mail_config"
VALID_AUTO_MAIL_DEDUP_MODES = {"once_per_candidate", "once_per_candidate_per_status", "allow_repeat"}
VALID_CANDIDATE_STATUS_VALUES = {item["value"] for item in CANDIDATE_STATUS_OPTIONS}
DEFAULT_POSITION_AUTO_MAIL_CONFIG = {
    "auto_mail_enabled": False,
    "auto_mail_use_global_recipients": False,
    "auto_mail_use_position_recipients": False,
    "auto_mail_position_recipient_ids": [],
    "auto_mail_allowed_candidate_statuses": ["screening_passed"],
    "auto_mail_template_id": None,
    "auto_mail_dedup_mode": "once_per_candidate_per_status",
    "auto_mail_cc_recipient_ids": [],
    "auto_mail_bcc_recipient_ids": [],
}
SKILL_TASK_KEYWORDS = {
    "screening": {"screening", "score", "scoring", "resume_score", "resume-screening", "初筛", "评分", "筛选"},
    "interview": {"interview", "question", "questions", "interview-question", "面试", "面试题", "出题"},
    "jd": {"jd", "job_description", "job-description", "岗位jd", "职位jd", "jd生成", "生成jd", "岗位描述", "职位描述"},
}
SYSTEM_BASE_SKILL_CODES = {
    "jd": "skill-jd-base",
    "screening": "skill-testing-rule",
    "interview": "skill-interview-structure",
}
logger = logging.getLogger(__name__)
PROCESS_BOOTED_AT = datetime.now()
SCREENING_WORKER_MAX_CONCURRENCY = max(1, int(os.getenv("SCREENING_WORKER_MAX_CONCURRENCY", "4")))
SCREENING_PROVIDER_MAX_CONCURRENCY = max(1, int(os.getenv("SCREENING_PROVIDER_MAX_CONCURRENCY", "3")))


class RecruitmentInterviewResultValidationError(Exception):
    """Raised when interview output violates the required schema or leaks prompt rules."""


def _classify_interview_generation_failure_status(exc: Exception) -> str:
    if isinstance(exc, RecruitmentInterviewResultValidationError):
        return "invalid_result"
    if isinstance(exc, RecruitmentAIJSONParseError):
        return "json_parse_failed"
    if isinstance(exc, RecruitmentAITimeoutError):
        return "timeout"
    if isinstance(exc, RecruitmentAIRetryExhaustedError):
        return "retry_exhausted"
    return "failed"
SCREENING_PROVIDER_QPS = max(1, int(os.getenv("SCREENING_PROVIDER_QPS", "2")))
SCREENING_BATCH_MAX_SIZE = max(1, int(os.getenv("SCREENING_BATCH_MAX_SIZE", "100")))
SCREENING_ONE_PASS_MAX_RETRIES = max(0, int(os.getenv("SCREENING_ONE_PASS_MAX_RETRIES", "1")))
SCREENING_FALLBACK_MAX_RETRIES = max(0, int(os.getenv("SCREENING_FALLBACK_MAX_RETRIES", "0")))
SCREENING_PROVIDER_COOLDOWN_THRESHOLD = max(1, int(os.getenv("SCREENING_PROVIDER_COOLDOWN_THRESHOLD", "3")))
SCREENING_PROVIDER_COOLDOWN_SECONDS = max(30, int(os.getenv("SCREENING_PROVIDER_COOLDOWN_SECONDS", "45")))
SCREENING_LIVE_TASK_STATUSES = ("pending", "queued", "running", "cancelling")
SCREENING_ORPHAN_STALE_MINUTES = 10
SCREENING_ROOT_RECOVERY_GRACE_SECONDS = 8
SCREENING_INFRA_MAX_RETRIES = 3
SCREENING_HEARTBEAT_INTERVAL_SECONDS = 5
_screening_worker_lock = threading.Lock()
_screening_worker_active_task_ids: set[int] = set()
_screening_enqueue_lock = threading.Lock()
_screening_provider_lock = threading.Lock()
_screening_provider_semaphore = threading.BoundedSemaphore(SCREENING_PROVIDER_MAX_CONCURRENCY)
_screening_provider_recent_request_started_at: deque[float] = deque()
_screening_provider_consecutive_retryable_failures = 0
_screening_provider_cooldown_until: Optional[datetime] = None

AI_TASK_LOG_PROMPT_LIMIT = 24000
AI_TASK_LOG_REQUEST_LIMIT = 120000
AI_TASK_LOG_SUMMARY_LIMIT = 12000
AI_TASK_LOG_OUTPUT_SNAPSHOT_LIMIT = 240000
AI_TASK_LOG_OUTPUT_SNAPSHOT_RETRY_LIMIT = 60000
AI_TASK_LOG_JSON_FIELD_LIMIT = 240000
CANDIDATE_DETAIL_ACTIVITY_LIMIT = max(10, int(os.getenv("CANDIDATE_DETAIL_ACTIVITY_LIMIT", "20")))
CANDIDATE_DETAIL_TEXT_PREVIEW_BYTES = max(1024, int(os.getenv("CANDIDATE_DETAIL_TEXT_PREVIEW_BYTES", "16000")))
CANDIDATE_DETAIL_JSON_PREVIEW_BYTES = max(2048, int(os.getenv("CANDIDATE_DETAIL_JSON_PREVIEW_BYTES", "24000")))
CANDIDATE_DETAIL_COLLECTION_LIMIT = max(5, int(os.getenv("CANDIDATE_DETAIL_COLLECTION_LIMIT", "24")))
TERMINAL_AI_TASK_STATUSES = {"success", "fallback", "failed", "invalid_result", "json_parse_failed", "invalid_json_variant_conflict", "timeout", "retry_exhausted", "cancelled", "rate_limited", "upstream_timeout", "request_failed", "screening_total_timeout"}
TERMINAL_SCREENING_STAGES = {"parsed", "completed", "failed", "cancelled"}

class RecruitmentConflictError(RuntimeError):
    pass


def _dedupe_ints(values: Iterable[Any]) -> List[int]:
    result: List[int] = []
    for value in values:
        try:
            item = int(value)
        except (TypeError, ValueError):
            continue
        if item not in result:
            result.append(item)
    return result


def _dedupe_texts(values: Iterable[Any]) -> List[str]:
    result: List[str] = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in result:
            result.append(text)
    return result


def _slugify(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9]+", "-", value or "").strip("-").lower()
    return text[:40] if text else uuid.uuid4().hex[:8]


def _looks_like_email(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", text))


def _dedupe_email_texts(values: Iterable[Any]) -> List[str]:
    result: List[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not _looks_like_email(text):
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        result.append(text)
    return result


def _snapshot_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json_dumps_safe(value)


def _normalize_ai_gateway_warning_text(value: Any) -> str:
    text = str(value or "").strip()
    if text == "stream empty, recovered by non-stream retry":
        return "resume_parse 流式空响应，已通过非流式重试恢复"
    if text == "strict JSON 首次解析失败，已自动进行一次同 prompt 恢复重试":
        return "strict JSON 首次解析失败，已自动进行一次同 prompt 恢复重试"
    return text


def _is_rate_limited_error(exc: Exception) -> bool:
    text = str(exc or "").lower()
    if isinstance(exc, httpx.HTTPStatusError):
        if exc.response is not None and exc.response.status_code == 429:
            return True
        try:
            body = (exc.response.text or "").lower()
        except Exception:
            body = ""
        if "rate limit" in body or "速率限制" in body or "too many requests" in body:
            return True
    return "429" in text or "rate limit" in text or "速率限制" in text or "too many requests" in text


def _is_timeout_error(exc: Exception) -> bool:
    return isinstance(exc, (httpx.TimeoutException, TimeoutError, RecruitmentAITimeoutError))


def _classify_infra_failure(exc: Exception) -> Tuple[str, str]:
    if _is_rate_limited_error(exc):
        return ("rate_limited", f"上游模型接口限流：{exc}")
    if _is_timeout_error(exc):
        return ("upstream_timeout", f"上游模型接口响应超时：{exc}")
    if isinstance(exc, (httpx.RequestError, RecruitmentAIRetryExhaustedError)):
        return ("request_failed", str(exc) or "上游模型接口请求失败。")
    return ("failed", str(exc) or "AI 任务执行失败。")


def _is_retryable_infra_failure_code(failure_code: Optional[str]) -> bool:
    return str(failure_code or "").strip() in {"rate_limited", "upstream_timeout", "request_failed"}


def _compute_infra_retry_delay_seconds(failure_code: str, retry_count: int) -> int:
    if failure_code == "rate_limited":
        if retry_count <= 1:
            return 20
        if retry_count == 2:
            return 45
        return 90
    if retry_count <= 1:
        return 15
    if retry_count == 2:
        return 30
    return 60


def _should_mark_candidate_screening_failed(failure_status: str) -> bool:
    return False


def _compute_screening_deadline_at(started_at: Optional[datetime] = None) -> datetime:
    origin = started_at or datetime.now()
    return origin + timedelta(seconds=SCREENING_TOTAL_TIMEOUT_SECONDS)


def _compute_screening_remaining_budget_seconds(deadline_at: Optional[datetime]) -> Optional[float]:
    if not deadline_at:
        return None
    return max(0.0, (deadline_at - datetime.now()).total_seconds())


def _ensure_screening_budget_available(deadline_at: Optional[datetime]) -> float:
    remaining_budget_seconds = _compute_screening_remaining_budget_seconds(deadline_at)
    if remaining_budget_seconds is None:
        return float(SCREENING_TOTAL_TIMEOUT_SECONDS)
    if remaining_budget_seconds <= 0 or remaining_budget_seconds < float(SCREENING_STAGE_MIN_TIMEOUT_SECONDS):
        raise RecruitmentAIScreeningTotalTimeoutError(
            f"初筛总耗时超过 {int(SCREENING_TOTAL_TIMEOUT_SECONDS)} 秒，已终止",
            total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
            remaining_budget_seconds=remaining_budget_seconds,
        )
    return remaining_budget_seconds


def _parse_iso_datetime_value(value: Any) -> Optional[datetime]:
    text = str(value or "").strip()
    if not text:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except Exception:
        return None
    if parsed.tzinfo is not None:
        try:
            return parsed.astimezone().replace(tzinfo=None)
        except Exception:
            return parsed.replace(tzinfo=None)
    return parsed


def _extract_json_parse_failure_meta(exc: Exception, *, default_source: str) -> Dict[str, Any]:
    if isinstance(exc, RecruitmentAIJSONParseError):
        raw_response_text = str(exc.raw_response_text or "").strip()
        error_code = str(getattr(exc, "error_code", "") or "json_parse_failed").strip() or "json_parse_failed"
        if default_source == "parse_request_failed":
            if error_code == "empty_response":
                final_response_source = "parse_empty_response"
            elif error_code == "invalid_json_variant_conflict":
                final_response_source = "parse_invalid_json_variant_conflict"
            else:
                final_response_source = "parse_json_parse_failed"
        elif default_source == "screening_request_failed":
            if error_code == "empty_response":
                final_response_source = "screening_empty_response"
            elif error_code == "invalid_json_variant_conflict":
                final_response_source = "screening_invalid_json_variant_conflict"
            else:
                final_response_source = "screening_json_parse_failed"
        else:
            if error_code == "empty_response":
                final_response_source = "score_empty_response"
            elif error_code == "invalid_json_variant_conflict":
                final_response_source = "score_invalid_json_variant_conflict"
            else:
                final_response_source = "score_json_parse_failed"
        return {
            "primary_model_call_succeeded": bool(raw_response_text),
            "final_response_source": final_response_source,
            "screening_result_state": (
                "empty_response"
                if error_code == "empty_response"
                else "invalid_json_variant_conflict"
                if error_code == "invalid_json_variant_conflict"
                else "json_parse_failed"
            ),
            "raw_response_text": raw_response_text,
            "output_summary": truncate_text(raw_response_text, 600) if raw_response_text else "AI screening JSON 解析失败",
            "failure_code": error_code,
            "debug_meta": dict(getattr(exc, "debug_meta", {}) or {}),
        }
    return {
        "primary_model_call_succeeded": False,
        "final_response_source": default_source,
        "screening_result_state": "request_failed",
        "raw_response_text": None,
        "output_summary": "AI screening JSON 解析失败",
        "failure_code": "request_failed",
        "debug_meta": {},
    }


def _copy_json_like(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _copy_json_like(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_copy_json_like(item) for item in value]
    return value


def _compact_output_snapshot_payload(value: Any, *, drop_raw: bool = False) -> Any:
    payload = _copy_json_like(value)
    if not isinstance(payload, dict):
        return payload

    def prune_parsed_resume(block: Any) -> None:
        if not isinstance(block, dict):
            return
        if block.pop("raw_text", None):
            block["raw_text_omitted"] = True

    prune_parsed_resume(payload.get("parsed_resume"))

    raw_block = payload.get("raw")
    if isinstance(raw_block, dict):
        prune_parsed_resume(raw_block.get("parsed_resume"))
        if raw_block.pop("raw_text", None):
            raw_block["raw_text_omitted"] = True
    elif raw_block is not None and drop_raw:
        payload.pop("raw", None)

    if drop_raw and "raw" in payload:
        payload.pop("raw", None)
    return payload


def _prepare_ai_task_output_snapshot(value: Any, *, max_bytes: int) -> Optional[str]:
    if value is None:
        return None
    source_value = value
    if isinstance(source_value, str):
        parsed = json_loads_safe(source_value, None)
        if isinstance(parsed, dict):
            source_value = parsed
    compacted = _compact_output_snapshot_payload(source_value, drop_raw=False)
    text = _snapshot_text(compacted)
    if len(text.encode("utf-8")) <= max_bytes:
        return text

    more_compacted = _compact_output_snapshot_payload(compacted, drop_raw=True)
    compact_text = _snapshot_text(more_compacted)
    if len(compact_text.encode("utf-8")) <= max_bytes:
        return compact_text

    return _truncate_utf8_text(compact_text, max_bytes)


def _prepare_ai_task_json_text(value: Any, *, max_bytes: int = AI_TASK_LOG_JSON_FIELD_LIMIT) -> Optional[str]:
    if value is None:
        return None
    return _truncate_utf8_text(_snapshot_text(value), max_bytes)


def _decode_ai_task_json_text(value: Any, default: Any = None) -> Any:
    if value is None:
        return default
    if isinstance(value, str):
        return json_loads_safe(value, value if default is None else default)
    return value


def _normalize_skill_resolution_source(value: Optional[str], *, from_task_snapshot: bool = False) -> str:
    if from_task_snapshot:
        return "task_snapshot"
    normalized = str(value or "").strip().lower()
    if normalized in {"manual", "manual_override", "explicit_request"}:
        return "explicit_request"
    if normalized in {"position", "position_default", "position_binding"}:
        return "position_binding"
    if normalized in {"system_builtin_base", "builtin_base", "system_base"}:
        return "system_builtin_base"
    if normalized in {"candidate_memory", "workflow_memory"}:
        return "candidate_memory"
    if normalized == "task_snapshot":
        return "task_snapshot"
    return "none"


def _build_screening_run_id(candidate_id: Optional[int]) -> str:
    date_prefix = datetime.now().strftime("%Y%m%d-%H%M%S")
    candidate_part = f"c{int(candidate_id)}" if candidate_id else "c0"
    return f"screening-{date_prefix}-{candidate_part}-{uuid.uuid4().hex[:8]}"


def _build_resume_content_hash(raw_text: Any) -> str:
    normalized = str(raw_text or "").strip()
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]


def _build_json_content_hash(value: Any) -> str:
    try:
        normalized = json.dumps(value, ensure_ascii=False, sort_keys=True)
    except Exception:
        normalized = json_dumps_safe(value)
    normalized = str(normalized or "").strip()
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]


def _normalize_screening_mode(value: Any, *, force_fallback: bool = False) -> str:
    if force_fallback:
        return "fallback_parse_then_score"
    normalized = str(value or "").strip()
    if normalized in VALID_SCREENING_MODES:
        return normalized
    return "default"


def _compute_screening_provider_cooldown_seconds(consecutive_failures: int) -> int:
    if consecutive_failures <= SCREENING_PROVIDER_COOLDOWN_THRESHOLD:
        return SCREENING_PROVIDER_COOLDOWN_SECONDS
    scaled = SCREENING_PROVIDER_COOLDOWN_SECONDS * max(1, consecutive_failures - SCREENING_PROVIDER_COOLDOWN_THRESHOLD + 1)
    return max(30, min(120, scaled))


def _compute_percentile_ms(values: Sequence[int], percentile: float) -> Optional[int]:
    normalized = sorted(int(max(0, value)) for value in values if isinstance(value, (int, float)))
    if not normalized:
        return None
    if len(normalized) == 1:
        return normalized[0]
    rank = max(0.0, min(1.0, float(percentile))) * (len(normalized) - 1)
    lower = int(rank)
    upper = min(len(normalized) - 1, lower + 1)
    if lower == upper:
        return normalized[lower]
    ratio = rank - lower
    return int(round((normalized[lower] * (1 - ratio)) + (normalized[upper] * ratio)))


RESUME_SECTION_HEADING_ALIASES = {
    "基本信息": "基本信息",
    "个人信息": "基本信息",
    "教育背景": "教育背景",
    "教育经历": "教育背景",
    "教育信息": "教育背景",
    "工作经验": "工作经验",
    "工作经历": "工作经验",
    "项目经历": "项目经历",
    "项目经验": "项目经历",
    "技能特长": "技能特长",
    "专业技能": "技能特长",
    "技能标签": "技能特长",
    "荣誉证书": "荣誉证书",
}
RESUME_SECTION_SPLIT_RE = re.compile(
    r"(基本信息|个人信息|教育背景|教育经历|教育信息|工作经验|工作经历|项目经历|项目经验|技能特长|专业技能|技能标签|荣誉证书)\s*[:：]?"
)
RESUME_CONTACT_FIELD_RE = re.compile(r"(?:邮箱|email|e-mail|联系电话|联系方式|电话|手机)[:：]?\s*[^\s]+", re.IGNORECASE)
RESUME_EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
RESUME_PHONE_RE = re.compile(r"(?:(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4})")
RESUME_ENTITY_HINT_RE = re.compile(r"(大学|学院|学校|研究生|公司|集团|科技|有限|股份|研究院)")


def _normalize_resume_section_heading(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    if not text:
        return None
    normalized = re.sub(r"[\s:：·•\-_/()（）【】\[\]<>《》,，.;；]+", "", text)
    return RESUME_SECTION_HEADING_ALIASES.get(normalized)


def _normalize_resume_date_tokens(value: Any) -> str:
    text = str(value or "")
    if not text:
        return ""

    def replace_month(match: re.Match[str]) -> str:
        return f"{match.group(1)}-{int(match.group(2)):02d}"

    normalized = re.sub(r"(\d{4})\s*[-./年]\s*(\d{1,2})", replace_month, text)
    normalized = re.sub(r"(\d{4})-(\d{2})\s*月", r"\1-\2", normalized)
    return normalized


def _strip_resume_contact_noise_from_line(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    cleaned = RESUME_CONTACT_FIELD_RE.sub(" ", text)
    cleaned = RESUME_EMAIL_RE.sub(" ", cleaned)
    cleaned = RESUME_PHONE_RE.sub(" ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,，;；")
    return cleaned


def _deterministic_preclean_resume_text(raw_text: Any) -> str:
    original = _normalize_resume_date_tokens(raw_text)
    if not original.strip():
        return ""
    split_source = RESUME_SECTION_SPLIT_RE.sub(lambda match: f"\n{match.group(1)}\n", original)
    cleaned_lines: List[str] = []
    seen_headings: set[str] = set()
    current_section: Optional[str] = None

    for raw_line in split_source.splitlines():
        line = re.sub(r"\s+", " ", str(raw_line or "")).strip()
        if not line:
            cleaned_lines.append("")
            continue
        canonical_heading = _normalize_resume_section_heading(line)
        if canonical_heading:
            current_section = canonical_heading
            if canonical_heading in seen_headings:
                continue
            seen_headings.add(canonical_heading)
            if cleaned_lines and cleaned_lines[-1] != "":
                cleaned_lines.append("")
            cleaned_lines.append(canonical_heading)
            cleaned_lines.append("")
            continue
        if current_section in {"教育背景", "工作经验", "项目经历"} or RESUME_ENTITY_HINT_RE.search(line):
            line = _strip_resume_contact_noise_from_line(line)
        line = _normalize_resume_date_tokens(line)
        if not line:
            continue
        cleaned_lines.append(line)

    while cleaned_lines and cleaned_lines[-1] == "":
        cleaned_lines.pop()
    return "\n".join(cleaned_lines)


def _prepare_resume_text_for_parse_prompt(raw_text: Any, *, max_chars: int = 14000) -> str:
    original = _deterministic_preclean_resume_text(raw_text)
    if not original.strip():
        return ""
    compact_lines: List[str] = []
    previous_non_empty = ""
    blank_pending = False
    for raw_line in original.splitlines():
        line = re.sub(r"\s+", " ", str(raw_line or "")).strip()
        if not line:
            blank_pending = True
            continue
        if line == previous_non_empty:
            continue
        if blank_pending and compact_lines and compact_lines[-1] != "":
            compact_lines.append("")
        compact_lines.append(line)
        previous_non_empty = line
        blank_pending = False
    compacted = "\n".join(compact_lines).strip()
    if len(compacted) <= max_chars:
        return compacted
    head_size = max(8000, int(max_chars * 0.68))
    tail_size = max(3000, max_chars - head_size - 32)
    return f"{compacted[:head_size].rstrip()}\n...\n{compacted[-tail_size:].lstrip()}".strip()


def _truncate_utf8_text(value: Optional[str], max_bytes: int) -> Optional[str]:
    if value is None:
        return None
    raw = value.encode("utf-8")
    if len(raw) <= max_bytes:
        return value
    clipped = raw[: max_bytes - 3]
    while clipped:
        try:
            return clipped.decode("utf-8") + "..."
        except UnicodeDecodeError:
            clipped = clipped[:-1]
    return "..."


def _compact_candidate_detail_value(
    value: Any,
    *,
    max_text_bytes: int = CANDIDATE_DETAIL_TEXT_PREVIEW_BYTES,
    max_json_text_bytes: int = CANDIDATE_DETAIL_JSON_PREVIEW_BYTES,
    max_items: int = CANDIDATE_DETAIL_COLLECTION_LIMIT,
    max_depth: int = 5,
    _depth: int = 0,
) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        limit = max_json_text_bytes if (value.startswith("{") or value.startswith("[") or "\n" in value) else max_text_bytes
        return _truncate_utf8_text(value, limit)
    if isinstance(value, dict):
        items = list(value.items())
        compacted: Dict[str, Any] = {}
        for key, item_value in items[:max_items]:
            compacted[str(key)] = (
                _truncate_utf8_text(_snapshot_text(item_value), max_json_text_bytes)
                if _depth >= max_depth
                else _compact_candidate_detail_value(
                    item_value,
                    max_text_bytes=max_text_bytes,
                    max_json_text_bytes=max_json_text_bytes,
                    max_items=max_items,
                    max_depth=max_depth,
                    _depth=_depth + 1,
                )
            )
        if len(items) > max_items:
            compacted["_truncated_fields"] = len(items) - max_items
        return compacted
    if isinstance(value, (list, tuple, set)):
        sequence = list(value)
        if _depth >= max_depth:
            return [_truncate_utf8_text(_snapshot_text(item), max_json_text_bytes) for item in sequence[:max_items]]
        return [
            _compact_candidate_detail_value(
                item,
                max_text_bytes=max_text_bytes,
                max_json_text_bytes=max_json_text_bytes,
                max_items=max_items,
                max_depth=max_depth,
                _depth=_depth + 1,
            )
            for item in sequence[:max_items]
        ]
    return _truncate_utf8_text(_snapshot_text(value), max_json_text_bytes)


def _compact_recommendation(value: Any, max_length: int = 240) -> Optional[str]:
    text = str(value or "").strip()
    if not text:
        return None
    if not re.search(r"[A-Za-z0-9\u4e00-\u9fff]", text):
        return None
    sentence = re.split(r"[。！？!?;\n]+", text, maxsplit=1)[0].strip()
    compact = re.sub(r"\s+", " ", sentence or text).strip()
    if not re.search(r"[A-Za-z0-9\u4e00-\u9fff]", compact):
        return None
    if len(compact) <= max_length:
        return compact
    return f"{compact[: max_length - 3].rstrip()}..."


def _parse_score_number(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        numeric = float(value)
        if numeric != numeric:
            return None
        return numeric
    text = str(value or "").strip()
    if not text:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


_GENERIC_EMPTY_STRING_MARKERS = {"", ",", "，", ";", "；", "-", "--"}
_GENERIC_EMPTY_STRING_MARKERS_LOWER = {"null", "none", "n/a"}


def sanitize_string(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list, tuple, set)):
        return ""
    text = str(value).strip()
    if not text:
        return ""
    lowered = text.lower()
    if text in _GENERIC_EMPTY_STRING_MARKERS or lowered in _GENERIC_EMPTY_STRING_MARKERS_LOWER:
        return ""
    text = re.sub(r"^[,，;；\s]+", "", text)
    text = re.sub(r"[,，;；\s]+$", "", text)
    if not text:
        return ""
    lowered = text.lower()
    if text in _GENERIC_EMPTY_STRING_MARKERS or lowered in _GENERIC_EMPTY_STRING_MARKERS_LOWER:
        return ""
    return text


def _is_meaningful_sanitized_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, bool):
        return True
    if isinstance(value, list):
        return any(_is_meaningful_sanitized_value(item) for item in value)
    if isinstance(value, dict):
        return any(_is_meaningful_sanitized_value(item) for item in value.values())
    return bool(value)


def _sanitize_json_like(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: Dict[str, Any] = {}
        for key, item in value.items():
            sanitized_item = _sanitize_json_like(item)
            if _is_meaningful_sanitized_value(sanitized_item):
                sanitized[str(key)] = sanitized_item
        return sanitized
    if isinstance(value, list):
        sanitized_items = [_sanitize_json_like(item) for item in value]
        return [item for item in sanitized_items if _is_meaningful_sanitized_value(item)]
    if isinstance(value, str):
        return sanitize_string(value)
    if value is None:
        return ""
    return value


def sanitize_string_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    result: List[str] = []
    for item in value:
        text = sanitize_string(item)
        if text:
            result.append(text)
    return result


def sanitize_number(value: Any, default: float = 0.0) -> float:
    numeric = _parse_score_number(value)
    return float(numeric) if numeric is not None else float(default)


def sanitize_enum(value: Any, allowed_values: Sequence[str] | set[str]) -> str:
    normalized = sanitize_string(value)
    return normalized if normalized in set(allowed_values) else ""


def _sanitize_dimensions_with_meta(value: Any, schema_config: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[str]]:
    if not isinstance(value, list):
        return [], []
    allowed_fields = tuple(schema_config.get("dimension_fields") or ())
    result: List[Dict[str, Any]] = []
    warnings: List[str] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        evidence_value = item.get("evidence")
        if isinstance(evidence_value, list):
            evidence: str | List[str] = sanitize_string_list(evidence_value)
        else:
            evidence = sanitize_string(evidence_value)
        label = sanitize_string(item.get("label"))
        score = sanitize_number(item.get("score"), default=0.0)
        max_score = sanitize_number(item.get("max_score"), default=0.0)
        if max_score > 0 and score > max_score:
            warnings.append(f"维度[{label or '未命名维度'}]得分超过上限，已自动裁剪")
            score = max_score
        normalized: Dict[str, Any] = {
            "label": label,
            "score": score,
            "max_score": max_score,
            "reason": sanitize_string(item.get("reason")),
            "evidence": evidence,
            "is_inferred": item.get("is_inferred") is True,
        }
        sanitized = {key: normalized.get(key) for key in allowed_fields}
        if _is_meaningful_sanitized_value(sanitized.get("label")):
            result.append(sanitized)
    return result, _normalize_score_warning_items(warnings, limit=12)


def sanitize_dimensions(value: Any, schema_config: Dict[str, Any]) -> List[Dict[str, Any]]:
    return _sanitize_dimensions_with_meta(value, schema_config)[0]


def _one_pass_score_field_has_usable_value(
    field: str,
    value: Any,
    score_config: Dict[str, Any],
) -> bool:
    number_fields = set(score_config.get("number_fields") or [])
    text_list_fields = set(score_config.get("text_list_fields") or [])
    string_fields = set(score_config.get("string_fields") or [])
    enum_fields = score_config.get("enum_fields") or {}
    if field in number_fields:
        return _parse_score_number(value) is not None
    if field in text_list_fields:
        return bool(_normalize_score_text_items(value, limit=5))
    if field in string_fields:
        return bool(sanitize_string(value))
    if field in enum_fields:
        if field == "suggested_status":
            return bool(_normalize_suggested_status(value))
        return bool(sanitize_enum(value, enum_fields.get(field) or []))
    if field == "dimensions":
        return bool(sanitize_dimensions(value, score_config))
    return bool(_is_meaningful_sanitized_value(value))


def _normalize_one_pass_score_field_for_merge(
    field: str,
    value: Any,
    score_config: Dict[str, Any],
) -> Any:
    if field in set(score_config.get("text_list_fields") or []):
        return _normalize_score_text_items(value, limit=5)
    return value


def _merge_top_level_one_pass_score_fields(payload: Any, score_config: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    source_payload = dict(payload if isinstance(payload, dict) else {})
    score_payload = dict(source_payload.get("score") if isinstance(source_payload.get("score"), dict) else {})
    recovered_fields: List[str] = []
    for field in STRICT_RESUME_SCORE_FIELDS:
        if _one_pass_score_field_has_usable_value(field, score_payload.get(field), score_config):
            continue
        top_level_value = source_payload.get(field)
        if not _one_pass_score_field_has_usable_value(field, top_level_value, score_config):
            continue
        score_payload[field] = _normalize_one_pass_score_field_for_merge(field, top_level_value, score_config)
        recovered_fields.append(field)
    if recovered_fields or "score" in source_payload:
        source_payload["score"] = score_payload
    warnings = (
        [f"检测到 top-level stray score 字段，已收拢到 score：{'、'.join(recovered_fields)}"]
        if recovered_fields
        else []
    )
    return source_payload, warnings


def _sanitize_screening_payload_structure(
    payload: Any,
    schema_config: Dict[str, Any],
    *,
    allow_one_pass_top_level_score_fields: bool = False,
) -> Dict[str, Any]:
    parsed_resume_config = schema_config.get("parsed_resume") or {}
    score_config = schema_config.get("score") or {}
    source_payload = payload if isinstance(payload, dict) else {}
    structure_warnings: List[str] = []
    if allow_one_pass_top_level_score_fields:
        source_payload, structure_warnings = _merge_top_level_one_pass_score_fields(source_payload, score_config)
    parsed_resume_payload = source_payload.get("parsed_resume") if isinstance(source_payload.get("parsed_resume"), dict) else {}
    basic_info_payload = parsed_resume_payload.get("basic_info") if isinstance(parsed_resume_payload.get("basic_info"), dict) else {}
    score_payload = source_payload.get("score") if isinstance(source_payload.get("score"), dict) else {}

    sanitized_parsed_resume: Dict[str, Any] = {
        "basic_info": {
            field: sanitize_string(basic_info_payload.get(field))
            for field in parsed_resume_config.get("basic_info_fields") or []
        },
        "summary": sanitize_string(parsed_resume_payload.get("summary")),
    }
    for field in parsed_resume_config.get("list_fields") or []:
        sanitized_parsed_resume[field] = _sanitize_json_like(parsed_resume_payload.get(field)) if isinstance(parsed_resume_payload.get(field), list) else []

    sanitized_score: Dict[str, Any] = {
        field: sanitize_number(score_payload.get(field), default=0.0)
        for field in score_config.get("number_fields") or []
    }
    for field in score_config.get("text_list_fields") or []:
        sanitized_score[field] = sanitize_string_list(score_payload.get(field))
    for field in score_config.get("string_fields") or []:
        sanitized_score[field] = sanitize_string(score_payload.get(field))
    enum_fields = score_config.get("enum_fields") or {}
    for field, allowed_values in enum_fields.items():
        sanitized_score[field] = sanitize_enum(score_payload.get(field), allowed_values)
    sanitized_dimensions, dimension_warnings = _sanitize_dimensions_with_meta(score_payload.get("dimensions"), score_config)
    sanitized_score["dimensions"] = sanitized_dimensions

    return {
        "parsed_resume": sanitized_parsed_resume,
        "score": sanitized_score,
        "_sanitize_meta": {
            "dimension_warnings": dimension_warnings,
            "structure_warnings": structure_warnings,
        },
    }


def _resolve_dimension_max_possible_score(
    value: Any,
    *,
    fallback_max_possible_score: Optional[float] = None,
) -> Optional[float]:
    dimensions = value if isinstance(value, list) else []
    total_max_score = 0.0
    has_dimension_max_score = False
    for item in dimensions:
        if not isinstance(item, dict):
            continue
        numeric_max_score = _parse_score_number(item.get("max_score"))
        if numeric_max_score is None:
            continue
        total_max_score += float(numeric_max_score)
        has_dimension_max_score = True
    if has_dimension_max_score and total_max_score > 0:
        return round(total_max_score + 1e-9, 1)
    fallback = _parse_score_number(fallback_max_possible_score)
    if fallback is not None and fallback > 0:
        return round(float(fallback) + 1e-9, 1)
    return None


def _calculate_match_percent_from_total_score(
    total_score: Optional[float],
    *,
    max_possible_score: Optional[float] = None,
) -> Optional[int]:
    numeric_total_score = _parse_score_number(total_score)
    numeric_max_possible_score = _parse_score_number(max_possible_score)
    if numeric_total_score is None:
        return None
    if numeric_max_possible_score is None or numeric_max_possible_score <= 0:
        return int(max(0, min(100, round((float(numeric_total_score) * 10) + 1e-9))))
    return int(max(0, min(100, round((float(numeric_total_score) / float(numeric_max_possible_score) * 100) + 1e-9))))


def _auto_correct_score_metrics_from_dimensions(
    score_payload: Any,
    *,
    fallback_max_possible_score: Optional[float] = None,
) -> Tuple[Dict[str, Any], List[str]]:
    payload = dict(score_payload if isinstance(score_payload, dict) else {})
    dimensions = payload.get("dimensions") if isinstance(payload.get("dimensions"), list) else []
    if not dimensions:
        return payload, []

    dimension_scores: List[float] = []
    for item in dimensions:
        if not isinstance(item, dict):
            return payload, []
        numeric_score = _parse_score_number(item.get("score"))
        if numeric_score is None:
            return payload, []
        dimension_scores.append(float(numeric_score))

    dimension_total = round(sum(dimension_scores) + 1e-9, 1)
    max_possible_score = _parse_score_number(fallback_max_possible_score)
    expected_match_percent = _calculate_match_percent_from_total_score(
        dimension_total,
        max_possible_score=max_possible_score,
    )
    warnings: List[str] = []

    current_total_score = _parse_score_number(payload.get("total_score"))
    if current_total_score is None or abs(current_total_score - dimension_total) > 0.1:
        warnings.append("score.total_score 已按 dimensions 自动校正")
    payload["total_score"] = dimension_total

    current_match_percent = _parse_score_number(payload.get("match_percent"))
    if expected_match_percent is not None:
        if current_match_percent is None or abs(current_match_percent - expected_match_percent) > 0.5:
            warnings.append("score.match_percent 已按 total_score 自动校正")
        payload["match_percent"] = expected_match_percent

    return payload, warnings


def _validate_screening_payload_warnings(payload: Dict[str, Any], schema_config: Dict[str, Any]) -> List[str]:
    warnings: List[str] = []
    parsed_resume = payload.get("parsed_resume") if isinstance(payload.get("parsed_resume"), dict) else {}
    score_payload = payload.get("score") if isinstance(payload.get("score"), dict) else {}
    parsed_resume_config = schema_config.get("parsed_resume") or {}
    score_config = schema_config.get("score") or {}

    missing_basic_fields = [
        field for field in parsed_resume_config.get("basic_info_fields") or []
        if field not in (parsed_resume.get("basic_info") or {})
    ]
    if missing_basic_fields:
        warnings.append(f"parsed_resume.basic_info 缺少字段：{'、'.join(missing_basic_fields)}")

    for field in parsed_resume_config.get("list_fields") or []:
        if not isinstance(parsed_resume.get(field), list):
            warnings.append(f"parsed_resume.{field} 不是数组，已按空数组清洗。")

    dimensions = score_payload.get("dimensions") if isinstance(score_payload.get("dimensions"), list) else []
    if not dimensions:
        warnings.append("score.dimensions 缺失或为空。")
    required_dimension_labels = [
        str(item or "").strip()
        for item in (score_config.get("required_dimension_labels") or [])
        if str(item or "").strip()
    ]
    if required_dimension_labels:
        actual_dimension_labels = {
            str(item.get("label") or "").strip()
            for item in dimensions
            if isinstance(item, dict) and str(item.get("label") or "").strip()
        }
        missing_dimension_labels = [label for label in required_dimension_labels if label not in actual_dimension_labels]
        if missing_dimension_labels:
            warnings.append(f"score.dimensions 缺少维度：{'、'.join(missing_dimension_labels[:8])}")

    total_score = _parse_score_number(score_payload.get("total_score"))
    match_percent = _parse_score_number(score_payload.get("match_percent"))
    dimension_total = round(sum((_parse_score_number(item.get("score")) or 0.0) for item in dimensions) + 1e-9, 1)
    if total_score is not None and abs(total_score - dimension_total) > 0.1:
        warnings.append(f"score.total_score 与 dimensions 求和不一致：当前为 {total_score:.1f}，维度求和为 {dimension_total:.1f}。")
    if total_score is not None and match_percent is not None:
        configured_max_possible_score = _parse_score_number(score_config.get("max_possible_score"))
        expected_match_percent = _calculate_match_percent_from_total_score(
            total_score,
            max_possible_score=configured_max_possible_score,
        )
        if expected_match_percent is not None and abs(match_percent - expected_match_percent) > 0.1:
            if configured_max_possible_score is not None and configured_max_possible_score > 0:
                formula = "round(total_score / max_possible_score * 100)"
                expected_hint = "按维度满分应为"
            else:
                formula = "round(total_score * 10)"
                expected_hint = "按 10 分制应为"
            warnings.append(
                f"score.match_percent 与 {formula} 不一致：当前为 {match_percent:.1f}，{expected_hint} {expected_match_percent:.1f}。"
            )

    current_status = _normalize_suggested_status(score_payload.get("suggested_status"))
    current_recommendation = _compact_recommendation(score_payload.get("recommendation"))
    if current_status and current_recommendation and not _recommendation_matches_status(current_status, current_recommendation):
        warnings.append("score.recommendation 与 suggested_status 不一致。")

    for field, allowed_values in (score_config.get("enum_fields") or {}).items():
        value = str(score_payload.get(field) or "").strip()
        if value and value not in set(allowed_values):
            warnings.append(f"score.{field} 不在合法枚举内。")
        if not value:
            warnings.append(f"score.{field} 缺失或无效。")
    if not _compact_recommendation(score_payload.get("recommendation")):
        warnings.append("score.recommendation 缺失或无效。")

    if not isinstance(score_payload.get("advantages"), list):
        warnings.append("score.advantages 不是数组，已按空数组清洗。")
    if not isinstance(score_payload.get("concerns"), list):
        warnings.append("score.concerns 不是数组，已按空数组清洗。")

    # 校验：score > 0 但 evidence 为空
    for dim in dimensions:
        if not isinstance(dim, dict):
            continue
        dim_score = _parse_score_number(dim.get("score")) or 0.0
        dim_evidence = dim.get("evidence")
        dim_label = str(dim.get("label") or "").strip()
        evidence_is_empty = (
            dim_evidence is None
            or (isinstance(dim_evidence, str) and not dim_evidence.strip())
            or (isinstance(dim_evidence, list) and len(dim_evidence) == 0)
        )
        if dim_score > 0 and evidence_is_empty:
            warnings.append(f"维度[{dim_label}]得分>{dim_score}但evidence为空，疑似推断评分。")

    # 校验：evidence 里混入了判断句
    PSEUDO_EVIDENCE_PATTERNS = ["简历未提及", "未见", "缺乏", "不足", "无相关经验", "未明确说明", "候选人具备", "体现了", "说明其"]
    dimension_rule_notes = [
        str(item or "").strip()
        for item in ((schema_config.get("score") or {}).get("dimension_rule_notes") or [])
        if str(item or "").strip()
    ]
    RULE_TEXT_PATTERNS = [
        "核心第一优先",
        "岗位要求",
        "加分项",
        "硬性要求",
        "评分说明",
        "评分标准",
        "满分",
    ]
    for dim in dimensions:
        if not isinstance(dim, dict):
            continue
        dim_label = str(dim.get("label") or "").strip()
        dim_evidence = dim.get("evidence")
        evidence_texts = []
        if isinstance(dim_evidence, str):
            evidence_texts = [dim_evidence]
        elif isinstance(dim_evidence, list):
            evidence_texts = [str(e) for e in dim_evidence if e]
        for ev in evidence_texts:
            if any(pattern in ev for pattern in PSEUDO_EVIDENCE_PATTERNS):
                warnings.append(f"维度[{dim_label}]的evidence包含判断句而非原文摘录。")
                break
            if any(pattern in ev for pattern in RULE_TEXT_PATTERNS):
                warnings.append(f"维度[{dim_label}]的evidence疑似引用了 Skill/JD 规则文本。")
                break
            if any(note and len(note) >= 8 and note in ev for note in dimension_rule_notes):
                warnings.append(f"维度[{dim_label}]的evidence疑似复用了评分规则说明文本。")
                break

    return warnings[:12]


def _build_expected_one_pass_dimensions(
    *,
    skill_snapshots: Sequence[Dict[str, Any]],
    schema_config: Dict[str, Any],
) -> List[Dict[str, Any]]:
    expected_dimensions = _build_expected_score_dimensions_from_rules(skill_snapshots, limit=12)
    expected_labels = {
        str(item.get("label") or "").strip()
        for item in expected_dimensions
        if isinstance(item, dict) and str(item.get("label") or "").strip()
    }
    for label in (
        str(item or "").strip()
        for item in ((schema_config.get("score") or {}).get("required_dimension_labels") or [])
    ):
        if not label or label in expected_labels:
            continue
        expected_dimensions.append(
            {
                "label": label,
                "score": None,
                "max_score": 0.0,
                "reason": "",
                "evidence": [],
            }
        )
        expected_labels.add(label)
    return expected_dimensions[:12]


def _backfill_missing_required_dimensions_as_zero_score(
    score_payload: Any,
    *,
    expected_dimensions: Sequence[Dict[str, Any]],
    fallback_max_possible_score: Optional[float] = None,
) -> Tuple[Dict[str, Any], List[str]]:
    payload = dict(score_payload if isinstance(score_payload, dict) else {})
    actual_dimensions = [dict(item) for item in (payload.get("dimensions") or []) if isinstance(item, dict)]
    actual_by_label: Dict[str, Dict[str, Any]] = {}
    extra_dimensions: List[Dict[str, Any]] = []
    for item in actual_dimensions:
        label = str(item.get("label") or "").strip()
        if not label:
            extra_dimensions.append(item)
            continue
        if label not in actual_by_label:
            actual_by_label[label] = item
        else:
            extra_dimensions.append(item)

    rebuilt_dimensions: List[Dict[str, Any]] = []
    backfilled_labels: List[str] = []
    for expected in expected_dimensions:
        label = str(expected.get("label") or "").strip()
        if not label:
            continue
        existing = actual_by_label.pop(label, None)
        if existing is not None:
            rebuilt_dimensions.append(existing)
            continue
        rebuilt_dimensions.append(
            {
                "label": label,
                "score": 0.0,
                "max_score": round(float(_parse_score_number(expected.get("max_score")) or 0.0), 1),
                "reason": "简历未提及",
                "evidence": [],
                "is_inferred": False,
            }
        )
        backfilled_labels.append(label)
    rebuilt_dimensions.extend(actual_by_label.values())
    rebuilt_dimensions.extend(extra_dimensions)
    payload["dimensions"] = rebuilt_dimensions

    warnings: List[str] = []
    if backfilled_labels:
        warnings.append(f"score.dimensions 缺少维度，已按规则补零：{'、'.join(backfilled_labels[:8])}")
        payload, metric_warnings = _auto_correct_score_metrics_from_dimensions(
            payload,
            fallback_max_possible_score=fallback_max_possible_score,
        )
        warnings.extend(metric_warnings)
    return payload, _normalize_score_warning_items(warnings, limit=12)


def _dimension_has_effective_evidence(value: Any) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return any(str(item or "").strip() for item in value)
    return False


def _derive_deterministic_suggested_status(
    score_payload: Any,
    schema_config: Dict[str, Any],
) -> Tuple[Optional[str], List[str]]:
    payload = dict(score_payload if isinstance(score_payload, dict) else {})
    dimensions = payload.get("dimensions") if isinstance(payload.get("dimensions"), list) else []
    required_dimension_labels = [
        str(item or "").strip()
        for item in ((schema_config.get("score") or {}).get("required_dimension_labels") or [])
        if str(item or "").strip()
    ]
    actual_by_label = {
        str(item.get("label") or "").strip(): item
        for item in dimensions
        if isinstance(item, dict) and str(item.get("label") or "").strip()
    }
    if any(label not in actual_by_label for label in required_dimension_labels):
        return None, []

    total_score = _parse_score_number(payload.get("total_score"))
    match_percent = _parse_score_number(payload.get("match_percent"))
    if total_score is None and match_percent is None:
        return None, []
    max_possible_score = _parse_score_number((schema_config.get("score") or {}).get("max_possible_score"))
    if total_score is None and match_percent is not None and max_possible_score is not None:
        total_score = round((float(match_percent) / 100.0 * max_possible_score) + 1e-9, 1)
    if match_percent is None and total_score is not None:
        match_percent = _calculate_match_percent_from_total_score(
            total_score,
            max_possible_score=max_possible_score,
        )
    if total_score is None or match_percent is None:
        return None, []

    thresholds = (schema_config.get("score") or {}).get("status_thresholds") or {}
    pass_threshold = _parse_score_number(thresholds.get("pass_threshold")) or 75.0
    pool_threshold = _parse_score_number(thresholds.get("pool_threshold")) or 55.0
    required_core_labels = [
        str(item or "").strip()
        for item in ((schema_config.get("score") or {}).get("required_core_dimension_labels") or [])
        if str(item or "").strip()
    ]
    missing_core_evidence = [
        label
        for label in required_core_labels
        if label in actual_by_label and not _dimension_has_effective_evidence(actual_by_label[label].get("evidence"))
    ]
    if match_percent >= pass_threshold:
        status = "screening_passed"
    elif match_percent >= pool_threshold:
        status = "talent_pool"
    else:
        status = "screening_rejected"
    if status == "screening_passed" and missing_core_evidence:
        status = "talent_pool" if match_percent >= pool_threshold else "screening_rejected"
    return status, missing_core_evidence


def sanitize_screening_payload(
    payload: Any,
    schema_config: Dict[str, Any],
    *,
    one_pass_compat: bool = False,
    skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
    extra_warnings: Optional[Sequence[Any]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    sanitized_payload = _sanitize_screening_payload_structure(
        payload,
        schema_config,
        allow_one_pass_top_level_score_fields=one_pass_compat,
    )
    raw_model_suggested_status = _normalize_suggested_status((sanitized_payload.get("score") or {}).get("suggested_status"))
    sanitize_meta = sanitized_payload.get("_sanitize_meta") if isinstance(sanitized_payload.get("_sanitize_meta"), dict) else {}
    sanitized_score = dict(sanitized_payload.get("score") if isinstance(sanitized_payload.get("score"), dict) else {})
    repair_warnings: List[str] = []
    normalized_final_suggested_status = raw_model_suggested_status

    if sanitized_score.get("dimensions"):
        sanitized_score, metric_warnings = _auto_correct_score_metrics_from_dimensions(
            sanitized_score,
            fallback_max_possible_score=(schema_config.get("score") or {}).get("max_possible_score"),
        )
        repair_warnings.extend(metric_warnings)
        sanitized_payload["score"] = sanitized_score

    if one_pass_compat:
        expected_dimensions = _build_expected_one_pass_dimensions(
            skill_snapshots=list(skill_snapshots or []),
            schema_config=schema_config,
        )
        if expected_dimensions:
            sanitized_score, backfill_warnings = _backfill_missing_required_dimensions_as_zero_score(
                sanitized_score,
                expected_dimensions=expected_dimensions,
                fallback_max_possible_score=(schema_config.get("score") or {}).get("max_possible_score"),
            )
            repair_warnings.extend(backfill_warnings)
        if (
            not _normalize_suggested_status(sanitized_score.get("suggested_status"))
            and sanitized_score.get("dimensions")
            and not _score_payload_reuses_rule_text_as_evidence(
                dimensions=sanitized_score.get("dimensions") or [],
                skill_snapshots=list(skill_snapshots or []),
            )
        ):
            derived_status, _missing_core_evidence = _derive_deterministic_suggested_status(
                sanitized_score,
                schema_config,
            )
            if derived_status:
                sanitized_score["suggested_status"] = derived_status
                normalized_final_suggested_status = derived_status
                repair_warnings.append("score.suggested_status 缺失，已按最终分数规则自动推导")
        sanitized_payload["score"] = sanitized_score

    warnings = _normalize_score_warning_items(
        [
            *(sanitize_meta.get("dimension_warnings") or []),
            *(sanitize_meta.get("structure_warnings") or []),
            *(extra_warnings or []),
            *repair_warnings,
            *_validate_screening_payload_warnings(sanitized_payload, schema_config),
        ],
        limit=12,
    )
    return sanitized_payload, {
        "warnings": warnings,
        "raw_model_suggested_status": raw_model_suggested_status,
        "normalized_final_suggested_status": normalized_final_suggested_status,
    }


def sanitize_screening_payload_fast(
    payload: Any,
    schema_config: Dict[str, Any],
    *,
    skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Critical-path-only sanitization for one-pass screening.

    Performs ONLY the business-critical steps:
    1. Structure/type sanitization
    2. Score metric auto-correction (total_score / match_percent from dimensions)
    3. Missing required dimension backfill (zero-score)
    4. Deterministic suggested_status derivation

    Skips (deferred to background or omitted):
    - _validate_screening_payload_warnings
    - _score_payload_reuses_rule_text_as_evidence
    - _analyze_ai_score_payload_quality
    - Pseudo-evidence pattern detection
    """
    sanitized_payload = _sanitize_screening_payload_structure(
        payload,
        schema_config,
        allow_one_pass_top_level_score_fields=True,
    )
    raw_model_suggested_status = _normalize_suggested_status(
        (sanitized_payload.get("score") or {}).get("suggested_status")
    )
    sanitized_score = dict(
        sanitized_payload.get("score")
        if isinstance(sanitized_payload.get("score"), dict)
        else {}
    )
    repair_warnings: List[str] = []
    normalized_final_suggested_status = raw_model_suggested_status

    # Step 1: auto-correct total_score and match_percent from dimensions
    if sanitized_score.get("dimensions"):
        sanitized_score, metric_warnings = _auto_correct_score_metrics_from_dimensions(
            sanitized_score,
            fallback_max_possible_score=(schema_config.get("score") or {}).get("max_possible_score"),
        )
        repair_warnings.extend(metric_warnings)
        sanitized_payload["score"] = sanitized_score

    # Step 2: backfill missing required dimensions as zero-score
    expected_dimensions = _build_expected_one_pass_dimensions(
        skill_snapshots=list(skill_snapshots or []),
        schema_config=schema_config,
    )
    if expected_dimensions:
        sanitized_score, backfill_warnings = _backfill_missing_required_dimensions_as_zero_score(
            sanitized_score,
            expected_dimensions=expected_dimensions,
            fallback_max_possible_score=(schema_config.get("score") or {}).get("max_possible_score"),
        )
        repair_warnings.extend(backfill_warnings)
        sanitized_payload["score"] = sanitized_score

    # Step 3: derive suggested_status if missing
    if not _normalize_suggested_status(sanitized_score.get("suggested_status")):
        derived_status, _missing = _derive_deterministic_suggested_status(
            sanitized_score,
            schema_config,
        )
        if derived_status:
            sanitized_score["suggested_status"] = derived_status
            normalized_final_suggested_status = derived_status
            repair_warnings.append("score.suggested_status 缺失，已按最终分数规则自动推导")
            sanitized_payload["score"] = sanitized_score

    return sanitized_payload, {
        "warnings": repair_warnings,
        "raw_model_suggested_status": raw_model_suggested_status,
        "normalized_final_suggested_status": normalized_final_suggested_status,
        "fast_path": True,
    }


def sanitize_screening_score_payload(payload: Any, schema_config: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    score_payload, extraction_meta = _extract_model_score_payload_with_meta(payload)
    sanitized_wrapper, meta = sanitize_screening_payload({"parsed_resume": {}, "score": score_payload}, schema_config)
    warnings = _normalize_score_warning_items(
        [*(extraction_meta.get("warnings") or []), *(meta.get("warnings") or [])],
        limit=12,
    )
    return sanitized_wrapper.get("score") or {}, {
        **meta,
        "warnings": warnings,
        "model_schema_violation": bool(extraction_meta.get("model_schema_violation")),
        "model_schema_violation_reason": extraction_meta.get("model_schema_violation_reason"),
    }


def _build_screening_schema_config(
    skill_snapshots: Sequence[Dict[str, Any]],
    *,
    status_rules: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    dimension_rules = _distill_dimension_rules(skill_snapshots, limit=32)
    required_dimension_labels = tuple(
        str(item.get("label") or "").strip()
        for item in dimension_rules
        if isinstance(item, dict) and str(item.get("label") or "").strip()
    )
    required_core_dimension_labels = tuple(
        str(item.get("label") or "").strip()
        for item in dimension_rules
        if isinstance(item, dict) and str(item.get("label") or "").strip() and bool(item.get("is_core"))
    )
    normalized_status_rules = status_rules if isinstance(status_rules, dict) else {}
    return {
        "parsed_resume": dict(SCREENING_PAYLOAD_SCHEMA_CONFIG.get("parsed_resume") or {}),
        "score": {
            **dict(SCREENING_PAYLOAD_SCHEMA_CONFIG.get("score") or {}),
            "required_dimension_labels": required_dimension_labels,
            "required_core_dimension_labels": required_core_dimension_labels,
            "max_possible_score": _resolve_dimension_max_possible_score(dimension_rules),
            "dimension_rule_notes": tuple(
                str(item.get("note") or "").strip()
                for item in dimension_rules
                if isinstance(item, dict) and str(item.get("note") or "").strip()
            ),
            "status_thresholds": {
                "pass_threshold": _parse_score_number(normalized_status_rules.get("pass_threshold")) or 75.0,
                "pool_threshold": _parse_score_number(normalized_status_rules.get("pool_threshold")) or 55.0,
            },
        },
    }


def _contains_cjk_text(value: Any) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", str(value or "")))


def _normalize_suggested_status(value: Any) -> Optional[str]:
    text = str(value or "").strip().lower()
    mapping = {
        "screening_passed": "screening_passed",
        "pass": "screening_passed",
        "passed": "screening_passed",
        "interview": "screening_passed",
        "talent_pool": "talent_pool",
        "pool": "talent_pool",
        "hold": "talent_pool",
        "review": "talent_pool",
        "conditionally_passed": "talent_pool",
        "conditional_passed": "talent_pool",
        "conditional pass": "talent_pool",
        "screening_rejected": "screening_rejected",
        "reject": "screening_rejected",
        "rejected": "screening_rejected",
        "淘汰": "screening_rejected",
        "通过": "screening_passed",
        "人才库": "talent_pool",
        "条件性通过": "talent_pool",
        "待定": "talent_pool",
    }
    normalized = mapping.get(text, text)
    return normalized if normalized in {"screening_passed", "talent_pool", "screening_rejected"} else None


def _build_expected_score_dimensions_from_rules(skill_snapshots: Sequence[Dict[str, Any]], *, limit: int = 12) -> List[Dict[str, Any]]:
    rules = extract_screening_dimension_rules(skill_snapshots, limit=limit)
    result: List[Dict[str, Any]] = []
    for rule in rules:
        label = str(rule.get("label") or "").strip()
        if not label:
            continue
        result.append(
            {
                "label": label,
                "score": None,
                "max_score": rule.get("max_score"),
                "weight_text": rule.get("weight_text"),
                "is_core": bool(rule.get("is_core")),
                "reason": "",
                "evidence": [],
            }
        )
        if len(result) >= limit:
            break
    return result


def _normalize_rule_reference_text(value: Any) -> str:
    text = strip_markdown(str(value or ""))
    return re.sub(r"\s+", "", text).strip().lower()


def _score_payload_reuses_rule_text_as_evidence(
    *,
    dimensions: Sequence[Dict[str, Any]],
    skill_snapshots: Sequence[Dict[str, Any]],
) -> bool:
    rules = extract_screening_dimension_rules(skill_snapshots, limit=12)
    if not rules:
        return False
    note_by_label = {
        str(rule.get("label") or "").strip(): _normalize_rule_reference_text(rule.get("note"))
        for rule in rules
        if str(rule.get("label") or "").strip()
    }
    all_rule_notes = [note for note in note_by_label.values() if note]
    for item in dimensions:
        label = str(item.get("label") or "").strip()
        normalized_note = note_by_label.get(label, "")
        for evidence in _normalize_score_text_items(item.get("evidence"), limit=3):
            normalized_evidence = _normalize_rule_reference_text(evidence)
            if not normalized_evidence or normalized_evidence == _normalize_rule_reference_text("简历未提及"):
                continue
            if normalized_note and (normalized_evidence in normalized_note or normalized_note in normalized_evidence):
                return True
            if any(len(note) >= 12 and (normalized_evidence in note or note in normalized_evidence) for note in all_rule_notes):
                return True
    return False


def _analyze_ai_score_payload_quality(
    *,
    score_payload: Dict[str, Any],
    skill_snapshots: Sequence[Dict[str, Any]],
) -> List[str]:
    issues: List[str] = []
    dimensions = _normalize_score_dimensions(score_payload.get("dimensions"), limit=12)
    expected_dimensions = _build_expected_score_dimensions_from_rules(skill_snapshots, limit=12)
    expected_labels = [str(item.get("label") or "").strip() for item in expected_dimensions if str(item.get("label") or "").strip()]
    actual_labels = {str(item.get("label") or "").strip() for item in dimensions if str(item.get("label") or "").strip()}
    missing_labels = [label for label in expected_labels if label not in actual_labels]
    if missing_labels:
        issues.append(f"dimensions 缺少必填维度：{'、'.join(missing_labels[:8])}")

    derived_total_score, derived_match_percent = _derive_score_metrics_from_dimensions(dimensions)
    raw_total_score = _parse_score_number(score_payload.get("total_score"))
    raw_match_percent = _parse_score_number(score_payload.get("match_percent"))
    if derived_total_score is not None and raw_total_score is None:
        issues.append("total_score 缺失")
    elif derived_total_score is not None and abs((raw_total_score or 0.0) - derived_total_score) > 0.1:
        issues.append("total_score 与 dimensions 求和不一致")
    if derived_match_percent is not None and raw_match_percent is None:
        issues.append("match_percent 缺失")
    elif derived_match_percent is not None and abs((raw_match_percent or 0.0) - derived_match_percent) > 0.5:
        issues.append("match_percent 与 dimensions 求和不一致")

    if not _compact_recommendation(score_payload.get("recommendation")):
        issues.append("recommendation 无效或缺失")
    if not _normalize_suggested_status(score_payload.get("suggested_status")):
        issues.append("suggested_status 无效或缺失")
    if not _normalize_score_text_items(score_payload.get("advantages"), limit=4):
        issues.append("advantages 缺失")
    if not _normalize_score_text_items(score_payload.get("concerns"), limit=4):
        issues.append("concerns 缺失")
    if _score_payload_reuses_rule_text_as_evidence(dimensions=dimensions, skill_snapshots=skill_snapshots):
        issues.append("evidence 疑似引用了 Skill/JD 规则文本，而不是简历证据")
    return _dedupe_texts(issues)


def _score_payload_issue_penalty(issue: Any) -> int:
    text = str(issue or "").strip()
    if not text:
        return 0
    if text.startswith("dimensions 缺少必填维度"):
        return 60
    if text.startswith("total_score "):
        return 50
    if text.startswith("match_percent "):
        return 50
    if text.startswith("suggested_status "):
        return 40
    if text.startswith("recommendation "):
        return 35
    if text.startswith("evidence 疑似引用了 Skill/JD 规则文本"):
        return 35
    if text.startswith("advantages "):
        return 25
    if text.startswith("concerns "):
        return 25
    return 10


def _score_payload_issue_priority(issues: Sequence[Any]) -> Tuple[int, int]:
    normalized = [str(item or "").strip() for item in issues if str(item or "").strip()]
    return sum(_score_payload_issue_penalty(item) for item in normalized), len(normalized)


def _normalize_report_number(value: Any) -> str:
    numeric = _parse_score_number(value)
    if numeric is None:
        return "-"
    if abs(numeric - round(numeric)) < 1e-9:
        return str(int(round(numeric)))
    return f"{numeric:.1f}".rstrip("0").rstrip(".")


def _infer_score_scale(value: Any) -> int:
    numeric = _parse_score_number(value)
    if numeric is not None and numeric <= 10:
        return 10
    return 100


def _contains_cjk(text: Any) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", str(text or "")))


def _has_latin_letters(text: Any) -> bool:
    return bool(re.search(r"[A-Za-z]", str(text or "")))


def _normalize_score_text_items(value: Any, *, limit: int = 5) -> List[str]:
    if isinstance(value, list):
        source = value
    elif isinstance(value, str):
        source = re.split(r"[\n\r]+", value)
    else:
        source = []
    result: List[str] = []
    for item in source:
        text = strip_markdown(str(item or "")).strip()
        text = re.sub(r"\s+", " ", text)
        if text and not re.search(r"[A-Za-z0-9\u4e00-\u9fff]", text):
            continue
        if not text or text in result:
            continue
        result.append(text[:120])
        if len(result) >= limit:
            break
    return result


def _merge_score_text_lists(primary: Any, fallback: Any, *, limit: int = 5) -> List[str]:
    result: List[str] = []
    for source in [_normalize_score_text_items(primary, limit=limit), _normalize_score_text_items(fallback, limit=limit)]:
        for item in source:
            if item not in result:
                result.append(item)
            if len(result) >= limit:
                return result
    return result


def _shape_resume_score_payload(payload: Any) -> Dict[str, Any]:
    normalized = _normalize_resume_score_payload(payload)
    return {
        "total_score": normalized.get("total_score"),
        "match_percent": normalized.get("match_percent"),
        "advantages": _normalize_score_text_items(normalized.get("advantages"), limit=5),
        "concerns": _normalize_score_text_items(normalized.get("concerns"), limit=5),
        "recommendation": _compact_recommendation(normalized.get("recommendation")),
        "suggested_status": normalized.get("suggested_status"),
    }


def _extract_model_score_payload_with_meta(content: Any) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    payload = content if isinstance(content, dict) else {}
    schema_violation_reason = None
    warnings: List[str] = []
    if isinstance(payload.get("score"), dict):
        schema_violation_reason = "resume_score task returned nested parsed_resume+score payload; expected score-only schema"
        warnings.append("模型未遵循 resume_score score-only schema，已降级提取 score 字段。")
        payload = payload.get("score") or {}
    return (
        payload if isinstance(payload, dict) else {},
        {
            "model_schema_violation": bool(schema_violation_reason),
            "model_schema_violation_reason": schema_violation_reason,
            "warnings": warnings,
        },
    )


def _extract_model_score_payload(content: Any) -> Dict[str, Any]:
    payload, _meta = _extract_model_score_payload_with_meta(content)
    return payload


def _extract_balanced_json_candidate_from_index(value: str, start: int) -> Optional[str]:
    if start < 0 or start >= len(value):
        return None
    opener = value[start]
    if opener not in "{[":
        return None
    stack: list[str] = ["}" if opener == "{" else "]"]
    in_string = False
    escape = False
    for index in range(start + 1, len(value)):
        current = value[index]
        if escape:
            escape = False
            continue
        if current == "\\":
            escape = True
            continue
        if current == "\"":
            in_string = not in_string
            continue
        if in_string:
            continue
        if current == "{":
            stack.append("}")
        elif current == "[":
            stack.append("]")
        elif current in "}]" and stack and current == stack[-1]:
            stack.pop()
            if not stack:
                candidate = value[start:index + 1].strip()
                return candidate or None
    return None


def _extract_top_level_json_candidates(raw_text: Any, *, limit: int = 4) -> List[str]:
    text = re.sub(r"<think\b[^>]*>.*?</think>", " ", str(raw_text or ""), flags=re.IGNORECASE | re.DOTALL)
    if not text:
        return []
    candidate_ranges: List[Tuple[int, int, str]] = []
    for index, char in enumerate(text):
        if char not in "{[":
            continue
        candidate = _extract_balanced_json_candidate_from_index(text, index)
        if not candidate:
            continue
        candidate_ranges.append((index, index + len(candidate), candidate.strip()))
    candidate_ranges.sort(key=lambda item: (item[0], -(item[1] - item[0])))
    candidates: List[str] = []
    kept_ranges: List[Tuple[int, int]] = []
    seen: set[str] = set()
    for start, end, candidate in candidate_ranges:
        if not candidate or candidate in seen:
            continue
        if any(start >= kept_start and end <= kept_end for kept_start, kept_end in kept_ranges):
            continue
        kept_ranges.append((start, end))
        seen.add(candidate)
        candidates.append(candidate)
        if len(candidates) >= limit:
            break
    return candidates


def _detect_score_json_variant_conflict(raw_response_text: Any, authoritative_payload: Any) -> Optional[Dict[str, Any]]:
    score_payload = _extract_model_score_payload(authoritative_payload)
    reasons: List[str] = []
    candidate_texts = _extract_top_level_json_candidates(raw_response_text, limit=4)
    variant_payloads: List[Dict[str, Any]] = []
    for candidate_text in candidate_texts:
        try:
            candidate_payload = _parse_llm_json_response(candidate_text)
        except Exception:
            continue
        extracted = _extract_model_score_payload(candidate_payload)
        if _has_resume_score_content(extracted):
            variant_payloads.append(extracted)

    if len(variant_payloads) > 1:
        reasons.append("检测到多个顶层 JSON 候选")

    variant_statuses = {
        _normalize_suggested_status(item.get("suggested_status"))
        for item in variant_payloads
        if _normalize_suggested_status(item.get("suggested_status"))
    }
    if len(variant_statuses) > 1:
        reasons.append("suggested_status 在同次模型返回中发生漂移")

    variant_total_scores = {
        round((_parse_score_number(item.get("total_score")) or 0.0) + 1e-9, 1)
        for item in variant_payloads
        if _parse_score_number(item.get("total_score")) is not None
    }
    if len(variant_total_scores) > 1:
        reasons.append("total_score 在同次模型返回中发生漂移")

    authoritative_total_score = _parse_score_number(score_payload.get("total_score"))
    derived_total_score, derived_match_percent = _derive_score_metrics_from_dimensions(score_payload.get("dimensions"))
    if (
        authoritative_total_score is not None
        and derived_total_score is not None
        and abs(authoritative_total_score - derived_total_score) > 0.1
    ):
        reasons.append("total_score 与 dimensions 求和不一致")

    authoritative_match_percent = _parse_score_number(score_payload.get("match_percent"))
    if (
        authoritative_match_percent is not None
        and derived_match_percent is not None
        and abs(authoritative_match_percent - derived_match_percent) > 0.5
    ):
        reasons.append("match_percent 与 dimensions 求和不一致")

    normalized_reasons = _dedupe_texts(reasons)
    if not normalized_reasons:
        return None
    return {
        "failure_code": "invalid_json_variant_conflict",
        "variant_candidate_count": len(variant_payloads),
        "variant_statuses": sorted(item for item in variant_statuses if item),
        "variant_total_scores": sorted(variant_total_scores),
        "derived_total_score_from_dimensions": derived_total_score,
        "derived_match_percent_from_dimensions": derived_match_percent,
        "reasons": normalized_reasons,
        "message": "；".join(normalized_reasons),
    }


def _looks_like_one_pass_screening_payload(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    if isinstance(payload.get("parsed_resume"), dict) and (
        isinstance(payload.get("score"), dict)
        or any(field in payload for field in STRICT_RESUME_SCORE_FIELDS)
    ):
        return True
    return False


def _build_one_pass_json_candidate_meta(
    payload: Dict[str, Any],
    *,
    schema_config: Dict[str, Any],
    source: str,
    index: int,
    skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    merged_payload, merge_warnings = _merge_top_level_one_pass_score_fields(payload, schema_config.get("score") or {})
    merged_score = merged_payload.get("score") if isinstance(merged_payload.get("score"), dict) else {}
    dimensions = sanitize_dimensions(merged_score.get("dimensions"), (schema_config.get("score") or {}))
    score_field_count = sum(
        1
        for field in STRICT_RESUME_SCORE_FIELDS
        if _one_pass_score_field_has_usable_value(field, merged_score.get(field), schema_config.get("score") or {})
    )
    candidate_score = 0
    if isinstance(merged_payload.get("parsed_resume"), dict):
        candidate_score += 8
    if isinstance(merged_score, dict):
        candidate_score += 6
    candidate_score += score_field_count * 2
    candidate_score += min(len(dimensions), 6)
    if _normalize_suggested_status(merged_score.get("suggested_status")):
        candidate_score += 2
    sanitized_payload, sanitize_meta = sanitize_screening_payload(
        merged_payload,
        schema_config,
        one_pass_compat=True,
        skill_snapshots=list(skill_snapshots or []),
    )
    sanitized_score = sanitized_payload.get("score") if isinstance(sanitized_payload.get("score"), dict) else {}
    required_dimension_labels = [
        str(item or "").strip()
        for item in ((schema_config.get("score") or {}).get("required_dimension_labels") or [])
        if str(item or "").strip()
    ]
    actual_dimension_labels = {
        str(item.get("label") or "").strip()
        for item in (sanitized_score.get("dimensions") or [])
        if isinstance(item, dict) and str(item.get("label") or "").strip()
    }
    missing_required_dimension_labels = [label for label in required_dimension_labels if label not in actual_dimension_labels]
    nonzero_dimension_count = 0
    nonzero_evidenced_dimension_count = 0
    for item in (sanitized_score.get("dimensions") or []):
        if not isinstance(item, dict):
            continue
        numeric_score = _parse_score_number(item.get("score")) or 0.0
        if numeric_score <= 0:
            continue
        nonzero_dimension_count += 1
        if _dimension_has_effective_evidence(item.get("evidence")):
            nonzero_evidenced_dimension_count += 1
    predicted_valid, predicted_invalid_reasons = _classify_screening_score_validity(
        sanitized_score,
        schema_config,
        validation_warnings=sanitize_meta.get("warnings"),
    )
    looks_like_empty_score = _looks_like_empty_screening_score_payload(
        sanitized_score,
        schema_config,
        validation_warnings=sanitize_meta.get("warnings"),
    )
    salvageable_invalid = (not predicted_valid) and _can_salvage_invalid_one_pass_result(
        validation_meta={
            "screening_result_valid": predicted_valid,
            "invalid_result_reasons": predicted_invalid_reasons,
            "validation_warnings": sanitize_meta.get("warnings"),
            "primary_model_call_succeeded": True,
            "final_response_source": "primary_screening_model_invalid",
        },
        score_payload=sanitized_score,
        schema_config=schema_config,
        parse_row_available=True,
        allow_score_only_rerun=True,
    )
    validity_rank = 2 if predicted_valid else 1 if salvageable_invalid else 0
    return {
        "payload": merged_payload,
        "source": source,
        "index": index,
        "candidate_score": candidate_score,
        "score_field_count": score_field_count,
        "dimension_count": len(dimensions),
        "has_parsed_resume": isinstance(merged_payload.get("parsed_resume"), dict),
        "has_score_like": isinstance(merged_score, dict) and bool(merged_score),
        "merge_warnings": merge_warnings,
        "normalized_status": _normalize_suggested_status(merged_score.get("suggested_status")),
        "normalized_total_score": round((_parse_score_number(merged_score.get("total_score")) or 0.0) + 1e-9, 1)
        if _parse_score_number(merged_score.get("total_score")) is not None
        else None,
        "dimension_labels": tuple(
            str(item.get("label") or "").strip()
            for item in dimensions
            if isinstance(item, dict) and str(item.get("label") or "").strip()
        ),
        "predicted_valid": predicted_valid,
        "predicted_invalid_reasons": predicted_invalid_reasons,
        "validity_rank": validity_rank,
        "has_valid_recommendation": bool(_compact_recommendation(sanitized_score.get("recommendation"))),
        "has_valid_suggested_status": bool(_normalize_suggested_status(sanitized_score.get("suggested_status"))),
        "required_dimension_present_count": len(required_dimension_labels) - len(missing_required_dimension_labels),
        "required_dimension_missing_count": len(missing_required_dimension_labels),
        "required_dimensions_complete": not missing_required_dimension_labels,
        "nonzero_dimension_count": nonzero_dimension_count,
        "nonzero_evidenced_dimension_count": nonzero_evidenced_dimension_count,
        "looks_like_empty_score": looks_like_empty_score,
        "salvageable_invalid": salvageable_invalid,
        "sanitize_warnings": _normalize_score_warning_items(sanitize_meta.get("warnings"), limit=12),
    }


def _detect_one_pass_json_variant_conflict(candidate_metas: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if len(candidate_metas) <= 1:
        return None
    reasons: List[str] = []
    statuses = {
        str(item.get("normalized_status") or "").strip()
        for item in candidate_metas
        if str(item.get("normalized_status") or "").strip()
    }
    total_scores = {
        round(float(item.get("normalized_total_score")) + 1e-9, 1)
        for item in candidate_metas
        if item.get("normalized_total_score") is not None
    }
    dimension_label_sets = {
        tuple(item.get("dimension_labels") or ())
        for item in candidate_metas
        if tuple(item.get("dimension_labels") or ())
    }
    if len(candidate_metas) > 1:
        reasons.append("检测到多个顶层 JSON 候选")
    if len(statuses) > 1:
        reasons.append("suggested_status 在同次模型返回中发生漂移")
    if len(total_scores) > 1:
        reasons.append("total_score 在同次模型返回中发生漂移")
    if len(dimension_label_sets) > 1:
        reasons.append("dimensions 在同次模型返回中发生漂移")
    normalized_reasons = _dedupe_texts(reasons)
    if not normalized_reasons:
        return None
    return {
        "failure_code": "invalid_json_variant_conflict",
        "variant_candidate_count": len(candidate_metas),
        "variant_statuses": sorted(statuses),
        "variant_total_scores": sorted(total_scores),
        "variant_dimension_label_sets": [list(item) for item in sorted(dimension_label_sets)],
        "reasons": normalized_reasons,
        "message": "；".join(normalized_reasons),
    }


def _select_one_pass_json_candidate(
    raw_response_text: Any,
    authoritative_payload: Any,
    *,
    schema_config: Dict[str, Any],
    skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    candidate_metas: List[Dict[str, Any]] = []
    candidate_texts = _extract_top_level_json_candidates(raw_response_text, limit=4)
    for index, candidate_text in enumerate(candidate_texts):
        try:
            candidate_payload = _parse_llm_json_response(candidate_text)
        except Exception:
            continue
        if isinstance(candidate_payload, dict) and _looks_like_one_pass_screening_payload(candidate_payload):
            candidate_metas.append(
                _build_one_pass_json_candidate_meta(
                    candidate_payload,
                    schema_config=schema_config,
                    source="raw_response_text",
                    index=index,
                    skill_snapshots=skill_snapshots,
                )
            )
    if isinstance(authoritative_payload, dict) and _looks_like_one_pass_screening_payload(authoritative_payload):
        merged_payload, _merge_warnings = _merge_top_level_one_pass_score_fields(authoritative_payload, schema_config.get("score") or {})
        if not any(meta.get("payload") == merged_payload for meta in candidate_metas):
            candidate_metas.append(
                _build_one_pass_json_candidate_meta(
                    authoritative_payload,
                    schema_config=schema_config,
                    source="parsed_content",
                    index=len(candidate_metas),
                    skill_snapshots=skill_snapshots,
                )
            )
    if not candidate_metas:
        payload = authoritative_payload if isinstance(authoritative_payload, dict) else {}
        return payload, {
            "warnings": [],
            "candidate_count": len(candidate_texts),
            "selected_candidate_index": None,
            "selected_candidate_source": None,
        }

    preferred_candidates = [item for item in candidate_metas if item.get("has_parsed_resume") and item.get("has_score_like")]
    ranked_candidates = sorted(
        preferred_candidates or candidate_metas,
        key=lambda item: (
            int(item.get("validity_rank") or 0),
            int(item.get("required_dimensions_complete") is True),
            int(item.get("required_dimension_present_count") or 0),
            int(item.get("has_valid_recommendation") is True),
            int(item.get("has_valid_suggested_status") is True),
            int(item.get("nonzero_evidenced_dimension_count") or 0),
            int(item.get("nonzero_dimension_count") or 0),
            -int(item.get("looks_like_empty_score") is True),
            int(item.get("candidate_score") or 0),
            int(item.get("score_field_count") or 0),
            int(item.get("dimension_count") or 0),
            -int(item.get("index") or 0),
        ),
        reverse=True,
    )
    selected = ranked_candidates[0]
    best_validity_rank = int(selected.get("validity_rank") or 0)
    conflict_candidates = [
        item
        for item in (preferred_candidates or candidate_metas)
        if not item.get("looks_like_empty_score") and int(item.get("validity_rank") or 0) == best_validity_rank
    ]
    conflict_meta = _detect_one_pass_json_variant_conflict(conflict_candidates)
    if conflict_meta:
        raise RecruitmentAIJSONParseError(
            f"AI screening JSON 存在冲突版本：{conflict_meta.get('message') or 'invalid_json_variant_conflict'}",
            raw_response_text=str(raw_response_text or "").strip(),
            error_code="invalid_json_variant_conflict",
            debug_meta=conflict_meta,
        )

    warnings = list(selected.get("merge_warnings") or [])
    total_candidate_count = max(len(candidate_texts), len(candidate_metas))
    if total_candidate_count > 1:
        warnings.append(f"one-pass 检测到 {total_candidate_count} 个 JSON 候选，已选择最终可用性最高的一份")
    return dict(selected.get("payload") or {}), {
        "warnings": _normalize_score_warning_items(warnings, limit=12),
        "candidate_count": total_candidate_count,
        "selected_candidate_index": selected.get("index"),
        "selected_candidate_source": selected.get("source"),
        "selected_candidate_validity_rank": selected.get("validity_rank"),
        "selected_candidate_predicted_valid": bool(selected.get("predicted_valid")),
        "selected_candidate_empty_score": bool(selected.get("looks_like_empty_score")),
    }


def _humanize_invalid_result_reason(value: Any) -> str:
    text = str(value or "").strip().rstrip("。")
    if not text:
        return ""
    if text.startswith("score.total_score 与 dimensions 求和不一致"):
        return "总分与维度求和不一致"
    if text.startswith("score.match_percent 与 round(total_score / max_possible_score * 100) 不一致"):
        return "匹配度与总分不一致"
    if text.startswith("score.match_percent 与 round(total_score * 10) 不一致"):
        return "匹配度与总分不一致"
    if text.startswith("score.total_score 已按 dimensions 自动校正") or text.startswith("score.total_score 已按 dimensions 求和自动归一化"):
        return "总分已按维度求和归一化"
    if text.startswith("score.match_percent 已按 total_score 自动校正"):
        return "匹配度已按总分归一化"
    if text.startswith("score.match_percent 已按维度满分自动校正") or text.startswith("score.match_percent 已按维度满分自动归一化"):
        return "匹配度已按维度满分归一化"
    if text.startswith("score.suggested_status 缺失或无效"):
        return "建议状态缺失或无效"
    if text.startswith("score.recommendation 缺失或无效"):
        return "推荐语缺失或无效"
    if text.startswith("score.dimensions 缺失或为空"):
        return "评分维度缺失"
    if text.startswith("score.dimensions 缺少维度"):
        return "评分维度不完整"
    if text.startswith("模型未遵循 resume_score score-only schema"):
        return "模型未遵循 score-only 输出结构"
    if text.startswith("score helper sanitized from parse result before scoring"):
        return "评分辅助上下文已先清洗"
    if "nested parsed_resume+score payload" in text:
        return "模型返回了 nested parsed_resume+score 结构"
    return text


def _build_invalid_result_summary(
    *,
    invalid_result_reasons: Optional[Sequence[Any]] = None,
    validation_warnings: Optional[Sequence[Any]] = None,
    model_schema_violation_reason: Optional[str] = None,
) -> str:
    summary_items: List[str] = []
    for source in [
        [model_schema_violation_reason] if model_schema_violation_reason else [],
        list(invalid_result_reasons or []),
        list(validation_warnings or []),
    ]:
        for item in source:
            if _is_score_metric_auto_correction_warning(item):
                continue
            normalized = _humanize_invalid_result_reason(item)
            if normalized and normalized not in summary_items:
                summary_items.append(normalized)
            if len(summary_items) >= 3:
                break
        if len(summary_items) >= 3:
            break
    return "；".join(summary_items[:3])


def _is_score_metric_consistency_warning(value: Any) -> bool:
    text = str(value or "").strip()
    return (
        text.startswith("score.total_score 与 dimensions 求和不一致")
        or text.startswith("score.match_percent 与 round(total_score / max_possible_score * 100) 不一致")
        or text.startswith("score.match_percent 与 round(total_score * 10) 不一致")
    )


def _is_score_metric_auto_correction_warning(value: Any) -> bool:
    text = str(value or "").strip()
    return (
        text.startswith("score.total_score 已按 dimensions 自动校正")
        or text.startswith("score.match_percent 已按 total_score 自动校正")
        or text.startswith("score.match_percent 已按维度满分自动校正")
        or text.startswith("score.total_score 已按 dimensions 求和自动归一化")
        or text.startswith("score.match_percent 已按维度满分自动归一化")
    )


def _build_business_normalized_score_payload(score_payload: Any) -> Dict[str, Any]:
    normalized = _normalize_resume_score_payload(score_payload)
    return {
        "total_score": normalized.get("total_score"),
        "match_percent": normalized.get("match_percent"),
        "advantages": _normalize_score_text_items(normalized.get("advantages"), limit=5),
        "concerns": _normalize_score_text_items(normalized.get("concerns"), limit=5),
        "recommendation": _compact_recommendation(normalized.get("recommendation")),
        "suggested_status": normalized.get("suggested_status"),
        "dimensions": sanitize_dimensions((score_payload or {}).get("dimensions"), SCREENING_PAYLOAD_SCHEMA_CONFIG.get("score") or {}),
    }


def _build_score_normalization_warnings(
    raw_score_payload: Dict[str, Any],
    normalized_score_payload: Dict[str, Any],
) -> List[str]:
    warnings: List[str] = []
    raw_total_score = _parse_score_number(raw_score_payload.get("total_score"))
    normalized_total_score = _parse_score_number(normalized_score_payload.get("total_score"))
    if (
        raw_total_score is not None
        and normalized_total_score is not None
        and abs(raw_total_score - normalized_total_score) > 0.1
    ):
        warnings.append("score.total_score 已按 dimensions 自动校正")
    raw_match_percent = _parse_score_number(raw_score_payload.get("match_percent"))
    normalized_match_percent = _parse_score_number(normalized_score_payload.get("match_percent"))
    if (
        raw_match_percent is not None
        and normalized_match_percent is not None
        and abs(raw_match_percent - normalized_match_percent) > 0.1
    ):
        warnings.append("score.match_percent 已按 total_score 自动校正")
    return warnings


def _merge_score_validation_warnings(
    warnings: Optional[Sequence[Any]],
    *,
    normalization_warnings: Optional[Sequence[Any]] = None,
) -> List[str]:
    filtered = [
        str(item or "").strip()
        for item in (warnings or [])
        if str(item or "").strip() and not _is_score_metric_consistency_warning(item)
    ]
    return _normalize_score_warning_items(
        [*filtered, *(normalization_warnings or [])],
        limit=12,
    )


def _sanitize_score_helper_text(value: Any, *, max_length: int = 240) -> Tuple[str, bool]:
    if isinstance(value, (list, tuple)):
        flattened = sanitize_string_list(list(value))
        text = "；".join(flattened[:3]).strip()
        if not text:
            return "", True
        if len(text) > max_length:
            return text[:max_length].strip(), True
        return text, True
    original = str(value or "")
    text = original.strip()
    changed = text != original
    if not text:
        return "", changed
    parsed = json_loads_safe(text, None) if text.startswith("[") and text.endswith("]") else None
    if isinstance(parsed, list):
        flattened = _dedupe_texts(parsed)
        text = "；".join(flattened[:3])
        changed = True
    normalized_spacing = re.sub(r"(?<=\d)\s*-\s*(?=\d)", "-", text)
    normalized_spacing = re.sub(r"\s*~\s*", " ~ ", normalized_spacing)
    normalized_spacing = re.sub(r"\s+", " ", normalized_spacing).strip()
    if normalized_spacing != text:
        text = normalized_spacing
        changed = True
    text = re.sub(r"[，,;；]+$", "", text).strip()
    if text in {",", "，", ";", "；", "[]", "[ ]"}:
        return "", True
    if len(text) > max_length:
        text = text[:max_length].strip()
        changed = True
    return text, changed


def _normalize_helper_semantic_text(value: Any) -> str:
    text = _compact_recommendation(value)
    if not text:
        return ""
    text = strip_markdown(text).strip().lower()
    text = re.sub(r"[\s\u3000,，。！？!?:：;；、“”\"'‘’（）()【】\[\]<>《》\-—_/]+", "", text)
    return text


def _contains_any_semantic_keyword(text: str, keywords: Sequence[str]) -> bool:
    return any(keyword and keyword in text for keyword in keywords)


def _looks_like_noisy_helper_school(value: Any) -> bool:
    text = str(value or "").strip()
    normalized = _normalize_helper_semantic_text(text)
    if not text:
        return False
    if "@" in text:
        return True
    if re.search(r"\d{11}", text):
        return True
    if any(token in normalized for token in ["联系电话", "邮箱", "email", "个人简历", "personalresume", "出生年月", "求职岗位", "婚姻状况", "自我评价", "英语四级", "英语六级", "普通话", "证书", "荣誉", "奖学金"]):
        return True
    if len(text) > 80 and re.search(r"\d{4}", text):
        return True
    if re.search(r"\d{4}[-/.]\d{1,2}.*\d{4}[-/.]\d{1,2}", text):
        return True
    return False


def _looks_like_responsibility_position(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    if len(text) > 36:
        return True
    return bool(re.search(r"(主要负责|负责.+|参与.+|协助.+|测试执行|项目交付|实验室设备管理|编写.+|搭建.+|维护.+)", text))


def _looks_like_resume_header_summary(value: Any) -> bool:
    text = str(value or "").strip()
    normalized = _normalize_helper_semantic_text(text)
    if not text:
        return False
    if any(token in normalized for token in ["联系电话", "邮箱", "email", "个人简历", "personalresume", "出生年月", "求职岗位", "婚姻状况", "入职时间", "自我评价"]):
        return True
    if text.count("：") >= 4 and len(text) > 80:
        return True
    if re.search(r"\d{11}", text) and "@" in text:
        return True
    return False


def _trim_helper_project_name(value: str, *, limit: int = 80) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    text = re.sub(r"^(项目名称[:：]\s*)", "", text).strip()
    if len(text) <= limit:
        return text
    for separator in ["，", ",", "。", "；", ";", "（", "("]:
        if separator in text:
            candidate = text.split(separator, 1)[0].strip()
            if candidate:
                text = candidate
                break
    if len(text) > limit:
        text = text[:limit].rstrip("：:，,;；。 ")
    return text.strip()


GENERIC_SCORE_HELPER_SKILL_STOPWORDS = {
    "sql",
    "测试",
    "iot",
    "网络",
    "web",
    "app",
    "项目管理",
    "团队管理",
}
GENERIC_SCORE_HELPER_SKILL_STOPWORD_KEYS = tuple(
    _normalize_helper_semantic_text(item) for item in GENERIC_SCORE_HELPER_SKILL_STOPWORDS
)

TECHNICAL_SCORE_HELPER_SKILL_MARKERS = (
    "自动化测试",
    "硬件测试",
    "接口测试",
    "性能测试",
    "系统测试",
    "嵌入式",
    "固件",
    "脚本",
    "数据库",
    "协议",
    "linux",
    "mysql",
    "jira",
    "postman",
    "fiddler",
    "testrail",
    "python",
    "selenium",
    "appium",
    "iot测试",
)


def _normalize_helper_dedupe_key(*parts: Any) -> Tuple[str, ...]:
    return tuple(_normalize_helper_semantic_text(part) for part in parts)


def _is_generic_score_helper_skill(skill: str) -> bool:
    normalized = _normalize_helper_semantic_text(skill)
    if not normalized:
        return True
    return normalized in GENERIC_SCORE_HELPER_SKILL_STOPWORD_KEYS


def _looks_like_tool_or_technical_skill(skill: str) -> bool:
    lowered = str(skill or "").strip().lower()
    compact = _normalize_helper_semantic_text(skill)
    if not compact:
        return False
    if re.search(r"[a-z0-9]", lowered):
        return True
    return any(marker in lowered or marker in compact for marker in TECHNICAL_SCORE_HELPER_SKILL_MARKERS)


def _trim_helper_project_description(value: Any, *, limit: int = 160) -> Tuple[str, bool]:
    text, changed = _sanitize_score_helper_text(value, max_length=max(240, limit))
    if not text:
        return "", changed
    if len(text) <= limit:
        return text, changed
    for separator in ["。", "；", ";", "，", ","]:
        candidate = text[:limit]
        if separator in candidate:
            trimmed = candidate.rsplit(separator, 1)[0].strip()
            if trimmed and len(trimmed) >= max(20, limit // 3):
                return trimmed.rstrip("：:，,;；。 "), True
    return text[:limit].rstrip("：:，,;；。 "), True


def _build_ai_raw_score_payload(content: Any) -> Optional[Dict[str, Any]]:
    payload = _extract_model_score_payload(content)
    if not payload:
        return None
    raw_status = payload.get("suggested_status")
    original_status = str(raw_status or "").strip() or None
    return {
        "total_score": payload.get("total_score"),
        "match_percent": payload.get("match_percent"),
        "advantages": _normalize_score_text_items(payload.get("advantages"), limit=5),
        "concerns": _normalize_score_text_items(payload.get("concerns"), limit=5),
        "recommendation": str(payload.get("recommendation") or "").strip(),
        "suggested_status_raw": raw_status,
        "suggested_status_original": original_status,
        "dimensions": _normalize_score_dimensions(payload.get("dimensions"), limit=12),
    }


def _build_normalized_score_payload(content: Any) -> Dict[str, Any]:
    return _shape_resume_score_payload(content)


def _append_score_risk_flag(
    risk_flags: List[Dict[str, Any]],
    *,
    code: str,
    message: str,
    severity: str = "warning",
) -> None:
    normalized_message = str(message or "").strip()
    if not normalized_message:
        return
    if any(flag.get("code") == code and flag.get("message") == normalized_message for flag in risk_flags):
        return
    risk_flags.append(
        {
            "code": code,
            "severity": severity,
            "message": normalized_message,
        }
    )

def _normalize_score_warning_items(value: Any, *, limit: int = 8) -> List[str]:
    if isinstance(value, list):
        source = value
    elif isinstance(value, str):
        source = re.split(r"[\n\r]+", value)
    else:
        source = []
    result: List[str] = []
    for item in source:
        text = str(item or "").strip()
        text = re.sub(r"\s+", " ", text)
        if not text or text in result:
            continue
        result.append(text[:240])
        if len(result) >= limit:
            break
    return result


def _merge_warning_items(*values: Any, limit: int = 8) -> List[str]:
    merged: List[str] = []
    for value in values:
        for item in _normalize_score_warning_items(value, limit=limit):
            if item not in merged:
                merged.append(item)
            if len(merged) >= limit:
                return merged
    return merged


def _derive_score_metrics_from_dimensions(
    value: Any,
    *,
    fallback_max_possible_score: Optional[float] = None,
) -> Tuple[Optional[float], Optional[float]]:
    dimensions = _normalize_score_dimensions(value, limit=32)
    total_score = 0.0
    has_dimension_score = False
    for item in dimensions:
        numeric = _parse_score_number(item.get("score"))
        if numeric is None:
            continue
        total_score += numeric
        has_dimension_score = True
    if not has_dimension_score:
        return None, None
    total_score = round(total_score + 1e-9, 1)
    match_percent = _calculate_match_percent_from_total_score(
        total_score,
        max_possible_score=_parse_score_number(fallback_max_possible_score),
    )
    return total_score, match_percent


def _looks_like_positive_screening_recommendation(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    if re.search(r"(不安排|不通过|淘汰|拒绝|不建议)", text):
        return False
    return bool(re.search(r"(安排|建议).{0,8}(面试|首面|复试)|条件性通过|可以推进|建议推进|建议约面", text))


def _build_score_quality_warnings(
    *,
    ai_raw_score: Optional[Dict[str, Any]],
    normalized_score: Dict[str, Any],
    derived_total_score_from_dimensions: Optional[float],
    derived_match_percent_from_dimensions: Optional[float],
    missing_core_labels: Sequence[Any],
) -> List[str]:
    warnings: List[str] = []
    raw_total_score = _parse_score_number(ai_raw_score.get("total_score")) if ai_raw_score else None
    raw_match_percent = _parse_score_number(ai_raw_score.get("match_percent")) if ai_raw_score else None
    normalized_total_score = _parse_score_number(normalized_score.get("total_score"))
    normalized_match_percent = _parse_score_number(normalized_score.get("match_percent"))
    if (
        raw_total_score is not None
        and derived_total_score_from_dimensions is not None
        and abs(raw_total_score - derived_total_score_from_dimensions) > 0.1
    ):
        warnings.append(
            f"模型原始 total_score 与最终 dimensions 汇总不一致，当前展示按最终维度汇总值标准化：原始为 {raw_total_score:.1f}，维度汇总为 {derived_total_score_from_dimensions:.1f}。"
        )
    if (
        raw_match_percent is not None
        and derived_match_percent_from_dimensions is not None
        and abs(raw_match_percent - derived_match_percent_from_dimensions) > 0.5
    ):
        warnings.append(
            f"模型原始 match_percent 与最终 dimensions 汇总不一致，当前展示按最终维度汇总值标准化：原始为 {raw_match_percent:.1f}，维度汇总应为 {derived_match_percent_from_dimensions:.1f}。"
        )
    if (
        derived_total_score_from_dimensions is not None
        and normalized_total_score is not None
        and abs(normalized_total_score - derived_total_score_from_dimensions) > 0.1
    ):
        warnings.append(
            f"标准化后的 total_score 与 dimensions 汇总仍不一致：当前为 {normalized_total_score:.1f}，维度汇总为 {derived_total_score_from_dimensions:.1f}。"
        )
    if normalized_total_score is not None and normalized_match_percent is not None:
        expected_match_percent = _calculate_match_percent_from_total_score(
            normalized_total_score,
            max_possible_score=None,
        )
        if expected_match_percent is not None and abs(normalized_match_percent - expected_match_percent) > 0.5:
            warnings.append(
                f"标准化后的 match_percent 与 round(total_score * 10) 不一致：当前为 {normalized_match_percent:.1f}，按 10 分制应为 {expected_match_percent:.1f}。"
            )
    elif (
        derived_match_percent_from_dimensions is not None
        and normalized_match_percent is not None
        and abs(normalized_match_percent - derived_match_percent_from_dimensions) > 0.5
    ):
        warnings.append(
            f"标准化后的 match_percent 与 dimensions 汇总仍不一致：当前为 {normalized_match_percent:.1f}，维度汇总应为 {derived_match_percent_from_dimensions:.1f}。"
        )

    normalized_status = str(normalized_score.get("suggested_status") or "").strip()
    recommendation = str(normalized_score.get("recommendation") or "").strip()
    has_core_gaps = any(str(item or "").strip() for item in missing_core_labels)
    if has_core_gaps and normalized_status == "screening_passed":
        warnings.append("suggested_status 与维度明细存在偏差：存在核心维度缺失，但当前建议状态仍为 screening_passed。")
    if has_core_gaps and _looks_like_positive_screening_recommendation(recommendation):
        warnings.append("recommendation 与维度明细存在偏差：存在核心维度缺失，但当前建议仍倾向继续推进。")

    return _normalize_score_warning_items(_dedupe_texts(warnings), limit=8)


def _build_score_consistency_metadata(
    *,
    ai_raw_score: Optional[Dict[str, Any]],
    normalized_score: Dict[str, Any],
    dimensions: Any,
    missing_core_labels: Sequence[Any],
) -> Dict[str, Any]:
    derived_total_score_from_dimensions, derived_match_percent_from_dimensions = _derive_score_metrics_from_dimensions(dimensions)
    score_quality_warnings = _build_score_quality_warnings(
        ai_raw_score=ai_raw_score,
        normalized_score=normalized_score,
        derived_total_score_from_dimensions=derived_total_score_from_dimensions,
        derived_match_percent_from_dimensions=derived_match_percent_from_dimensions,
        missing_core_labels=missing_core_labels,
    )
    return {
        "derived_total_score_from_dimensions": derived_total_score_from_dimensions,
        "derived_match_percent_from_dimensions": derived_match_percent_from_dimensions,
        "score_quality_warnings": score_quality_warnings,
    }


def _merge_model_dimensions_with_fallback(
    model_dimensions: Any,
    fallback_dimensions: Any,
    *,
    limit: int = 12,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    normalized_model = _normalize_score_dimensions(model_dimensions, limit=limit * 2)
    normalized_fallback = _normalize_score_dimensions(fallback_dimensions, limit=limit * 2)
    if not normalized_fallback:
        return normalized_model[:limit], []
    if not normalized_model:
        return normalized_fallback[:limit], ["AI 原始 dimensions 缺失，已按 Skill 维度补全完整评分明细。"]

    fallback_by_label = {str(item.get("label") or "").strip(): item for item in normalized_fallback if str(item.get("label") or "").strip()}
    model_by_label = {str(item.get("label") or "").strip(): item for item in normalized_model if str(item.get("label") or "").strip()}
    merged: List[Dict[str, Any]] = []
    missing_labels: List[str] = []

    for label, fallback_item in fallback_by_label.items():
        model_item = model_by_label.get(label)
        if not model_item:
            merged.append(dict(fallback_item))
            missing_labels.append(label)
            continue
        merged.append(
            {
                "label": label,
                "score": model_item.get("score") if model_item.get("score") is not None else fallback_item.get("score"),
                "max_score": model_item.get("max_score") if model_item.get("max_score") is not None else fallback_item.get("max_score"),
                "weight_text": model_item.get("weight_text") or fallback_item.get("weight_text"),
                "is_core": bool(fallback_item.get("is_core") or model_item.get("is_core")),
                "reason": model_item.get("reason") or fallback_item.get("reason"),
                "evidence": model_item.get("evidence") or fallback_item.get("evidence") or [],
            }
        )

    for item in normalized_model:
        label = str(item.get("label") or "").strip()
        if label and label not in fallback_by_label:
            merged.append(item)

    warnings: List[str] = []
    if missing_labels:
        warnings.append(f"AI 原始 dimensions 缺少 {len(missing_labels)} 个维度（{'、'.join(missing_labels[:6])}），已进入后处理校验并补齐结构。")
    elif len(normalized_model) < len(normalized_fallback):
        warnings.append("AI 原始 dimensions 数量少于 Skill 维度要求，已按 Skill 维度补全完整评分明细。")

    return merged[:limit], warnings


def _annotate_model_dimensions_with_expected_metadata(
    model_dimensions: Any,
    expected_dimensions: Any,
    *,
    limit: int = 12,
) -> Tuple[List[Dict[str, Any]], List[str], List[str], List[str]]:
    normalized_model = _normalize_score_dimensions(model_dimensions, limit=limit * 2)
    normalized_expected = _normalize_score_dimensions(expected_dimensions, limit=limit * 2)

    expected_by_label = {
        str(item.get("label") or "").strip(): item
        for item in normalized_expected
        if str(item.get("label") or "").strip()
    }
    raw_labels: List[str] = []
    enriched: List[Dict[str, Any]] = []
    scores_by_label: Dict[str, float] = {}

    for item in normalized_model:
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        raw_labels.append(label)
        meta = expected_by_label.get(label) or {}
        score_value = _parse_score_number(item.get("score"))
        if score_value is not None:
            scores_by_label[label] = score_value
        enriched.append(
            {
                "label": label,
                "score": item.get("score"),
                "max_score": item.get("max_score") if item.get("max_score") is not None else meta.get("max_score"),
                "weight_text": item.get("weight_text") or meta.get("weight_text"),
                "is_core": bool(item.get("is_core") or meta.get("is_core")),
                "reason": item.get("reason"),
                "evidence": item.get("evidence") or [],
            }
        )

    raw_label_set = set(raw_labels)
    missing_labels = [label for label in expected_by_label if label not in raw_label_set]
    missing_core_labels = [
        label
        for label, meta in expected_by_label.items()
        if meta.get("is_core") and (label in missing_labels or scores_by_label.get(label, 0.0) <= 0)
    ]

    warnings: List[str] = []
    if missing_labels:
        warnings.append(
            f"AI 原始 dimensions 缺少 {len(missing_labels)} 个维度（{'、'.join(missing_labels[:6])}），当前结果已进入后处理校验。"
        )

    return enriched[:limit], missing_labels, missing_core_labels, warnings


def _build_score_compat_payload(normalized_score: Dict[str, Any], score_enhancements: Dict[str, Any]) -> Dict[str, Any]:
    normalized_payload = _shape_resume_score_payload(normalized_score)
    derived_total_score = _parse_score_number(score_enhancements.get("derived_total_score_from_dimensions"))
    derived_match_percent = _parse_score_number(score_enhancements.get("derived_match_percent_from_dimensions"))
    if derived_total_score is not None:
        normalized_payload["total_score"] = derived_total_score
    if derived_match_percent is not None:
        normalized_payload["match_percent"] = derived_match_percent
    missing_core_labels = [str(item or "").strip() for item in score_enhancements.get("missing_core_labels") or [] if str(item or "").strip()]
    return {
        **normalized_payload,
        "dimensions": sanitize_dimensions(score_enhancements.get("dimensions"), SCREENING_PAYLOAD_SCHEMA_CONFIG.get("score") or {}),
        "dimensions_mode": score_enhancements.get("dimensions_mode"),
        "missing_core_labels": missing_core_labels,
        "score_cap_reason": score_enhancements.get("score_cap_reason"),
        "derived_total_score_from_dimensions": derived_total_score,
        "derived_match_percent_from_dimensions": derived_match_percent,
        "score_quality_warnings": _normalize_score_warning_items(score_enhancements.get("score_quality_warnings"), limit=8),
        "repair_reason": score_enhancements.get("repair_reason"),
        "report_markdown": str(score_enhancements.get("report_markdown") or "").strip() or None,
    }


def _build_layered_score_payload(
    *,
    ai_raw_score: Optional[Dict[str, Any]],
    normalized_score: Dict[str, Any],
    score_enhancements: Dict[str, Any],
) -> Dict[str, Any]:
    normalized_payload = _shape_resume_score_payload(normalized_score)
    return {
        "ai_raw_score": ai_raw_score,
        "normalized_score": normalized_payload,
        "score_enhancements": score_enhancements,
        "score": _build_score_compat_payload(normalized_payload, score_enhancements),
    }


def _build_authoritative_fallback_score_payload(
    *,
    position_or_candidate: Any,
    parsed_payload: Dict[str, Any],
    weights: Dict[str, Any],
    status_rules: Dict[str, Any],
    skill_snapshots: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    fallback_result = score_candidate_fallback(position_or_candidate, parsed_payload, weights, status_rules, skill_snapshots)
    strict_payload = _shape_resume_score_payload(fallback_result)
    normalized_dimensions = _normalize_score_dimensions(fallback_result.get("dimensions"), limit=12)
    derived_total_score, derived_match_percent = _derive_score_metrics_from_dimensions(normalized_dimensions)
    if derived_total_score is not None:
        strict_payload["total_score"] = derived_total_score
    if derived_match_percent is not None:
        strict_payload["match_percent"] = derived_match_percent
    return {
        **strict_payload,
        "dimensions": sanitize_dimensions(normalized_dimensions, SCREENING_PAYLOAD_SCHEMA_CONFIG.get("score") or {}),
        "dimensions_mode": fallback_result.get("dimensions_mode"),
        "missing_core_labels": list(fallback_result.get("missing_core_labels") or []),
        "score_cap_reason": fallback_result.get("score_cap_reason"),
    }


def _build_score_log_snapshot(
    *,
    ai_raw_score: Optional[Dict[str, Any]],
    normalized_score: Dict[str, Any],
    score_enhancements: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "ai_raw_score": ai_raw_score,
        "normalized_score": _shape_resume_score_payload(normalized_score),
        "score": _build_score_compat_payload(normalized_score, score_enhancements),
        "score_enhancements": {
            **score_enhancements,
            "dimensions": sanitize_dimensions(score_enhancements.get("dimensions"), SCREENING_PAYLOAD_SCHEMA_CONFIG.get("score") or {}),
            "missing_core_labels": list(score_enhancements.get("missing_core_labels") or []),
            "risk_flags": list(score_enhancements.get("risk_flags") or []),
            "score_quality_warnings": _normalize_score_warning_items(score_enhancements.get("score_quality_warnings"), limit=8),
            "report_markdown": str(score_enhancements.get("report_markdown") or "").strip() or None,
        },
    }


def _normalize_score_dimensions(value: Any, *, limit: int = 12) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    result: List[Dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or item.get("key") or "").strip()
        if not label:
            continue
        numeric_score = _parse_score_number(item.get("score"))
        numeric_max_score = _parse_score_number(item.get("max_score"))
        evidence = _normalize_score_text_items(item.get("evidence"), limit=2)
        if any(text == "简历未提及" for text in evidence):
            evidence = []
        result.append(
            {
                "label": label,
                "score": numeric_score,
                "max_score": numeric_max_score,
                "weight_text": str(item.get("weight_text") or "").strip() or None,
                "is_core": bool(item.get("is_core")),
                "is_inferred": bool(item.get("is_inferred")),
                "reason": _build_dimension_reason_summary(
                    label,
                    score=numeric_score or 0.0,
                    max_score=numeric_max_score or 0.0,
                    raw_reason=item.get("reason"),
                    evidence=evidence,
                ),
                "evidence": evidence,
            }
        )
        if len(result) >= limit:
            break
    return result


INVALID_SCORE_SUMMARY_MARKERS = (
    "暂无明显亮点",
    "暂无优势",
    "暂无风险点",
    "暂无明显风险",
    "暂无优点",
)


def _looks_like_structured_repr_text(text: str) -> bool:
    normalized = str(text or "").strip()
    if not normalized:
        return False
    if re.search(r"\{[^{}]*[:：][^{}]*\}", normalized):
        return True
    return normalized.count("{") > 0 and normalized.count("}") > 0


def _normalize_score_summary_text(text: Any) -> str:
    normalized = re.sub(r"\s+", " ", strip_markdown(str(text or ""))).strip()
    if not normalized:
        return ""
    if any(marker in normalized for marker in INVALID_SCORE_SUMMARY_MARKERS):
        return ""
    if _looks_like_structured_repr_text(normalized):
        return ""
    normalized = re.sub(r"(学历信息|文档与缺陷闭环|加分项命中|自动化/脚本相关|测试设计与缺陷闭环|固件/烧录相关|硬件测试证据|相关证据|命中证据)\s*[：:]\s*", "", normalized)
    normalized = re.sub(r"[；;]\s*证据[:：].*$", "", normalized)
    normalized = normalized.strip("；;，,：: ")
    if any(marker in normalized for marker in INVALID_SCORE_SUMMARY_MARKERS):
        return ""
    if _looks_like_structured_repr_text(normalized):
        return ""
    return normalized


def _dimension_label_for_summary(label: Any) -> str:
    return str(label or "").strip().replace("/", "与") or "该维度"


def _build_dimension_reason_summary(
    label: str,
    *,
    score: float,
    max_score: float,
    raw_reason: Any,
    evidence: Sequence[str],
) -> str:
    normalized_reason = _normalize_score_summary_text(raw_reason)
    if normalized_reason:
        return normalized_reason
    meaningful_evidence = [str(item or "").strip() for item in evidence if str(item or "").strip()]
    score_ratio = (score / max_score) if max_score > 0 else (1.0 if score > 0 else 0.0)
    if score <= 0:
        return "简历未提及" if label in {"学历/专业匹配", "教育背景", "专业匹配"} else "未见与该维度直接对应的简历证据"
    if meaningful_evidence and score_ratio >= 0.6:
        return "该维度存在简历证据支撑"
    return "该维度有一定相关证据，建议结合面试继续核实"


def _build_dimension_advantage_summary(item: Dict[str, Any]) -> str:
    label = _dimension_label_for_summary(item.get("label"))
    raw_reason = _normalize_score_summary_text(item.get("reason"))
    if raw_reason and raw_reason != "简历未提及":
        return raw_reason
    evidence = item.get("evidence") if isinstance(item.get("evidence"), list) else []
    score = _parse_score_number(item.get("score")) or 0.0
    max_score = _parse_score_number(item.get("max_score")) or 0.0
    score_ratio = (score / max_score) if max_score > 0 else (1.0 if score > 0 else 0.0)
    if evidence and score_ratio >= 0.8:
        return f"{label}方面匹配较好，有简历证据支撑。"
    if evidence:
        return f"{label}方面存在一定匹配优势。"
    return f"{label}方面有一定相关性，建议结合面试继续核实。"


def _build_dimension_concern_summary(item: Dict[str, Any]) -> str:
    label = _dimension_label_for_summary(item.get("label"))
    score = _parse_score_number(item.get("score")) or 0.0
    max_score = _parse_score_number(item.get("max_score")) or 0.0
    if score <= 0:
        return f"{label}方面缺少直接证据。"
    if max_score > 0 and score / max_score < 0.6:
        return f"{label}方面匹配度偏弱，建议面试继续核实。"
    return ""


def _build_dimension_score_summaries(dimensions: Sequence[Dict[str, Any]]) -> Tuple[List[str], List[str]]:
    advantages: List[str] = []
    concerns: List[str] = []
    indexed_dimensions = list(enumerate(dimensions))

    def score_ratio(item: Dict[str, Any]) -> float:
        score = _parse_score_number(item.get("score")) or 0.0
        max_score = _parse_score_number(item.get("max_score")) or 0.0
        if max_score > 0:
            return score / max_score
        return 1.0 if score > 0 else 0.0

    positive_dimensions = [
        (index, item)
        for index, item in indexed_dimensions
        if (_parse_score_number(item.get("score")) or 0.0) > 0
    ]
    issue_dimensions = [
        (index, item)
        for index, item in indexed_dimensions
        if (_parse_score_number(item.get("score")) or 0.0) <= 0
        or (
            (_parse_score_number(item.get("max_score")) or 0.0) > 0
            and score_ratio(item) < 0.6
        )
    ]
    positive_dimensions.sort(
        key=lambda pair: (
            int(not bool(pair[1].get("is_core"))),
            -score_ratio(pair[1]),
            -((_parse_score_number(pair[1].get("score")) or 0.0)),
            pair[0],
        )
    )
    issue_dimensions.sort(
        key=lambda pair: (
            int(not bool(pair[1].get("is_core"))),
            score_ratio(pair[1]),
            pair[0],
        )
    )
    for _, item in positive_dimensions:
        summary = _build_dimension_advantage_summary(item)
        if summary and summary not in advantages:
            advantages.append(summary)
        if len(advantages) >= 4:
            break
    for _, item in issue_dimensions:
        summary = _build_dimension_concern_summary(item)
        if summary and summary not in concerns:
            concerns.append(summary)
        if len(concerns) >= 4:
            break
    return advantages, concerns


def _merge_score_texts_with_dimension_fallback(
    raw_items: Any,
    generated_items: Sequence[str],
    *,
    min_required: int,
    empty_fallback: str,
    limit: int = 4,
) -> List[str]:
    normalized_raw = [
        item
        for item in [_normalize_score_summary_text(text) for text in _normalize_score_text_items(raw_items, limit=limit)]
        if item
    ]
    result: List[str] = []
    for item in normalized_raw:
        if item not in result:
            result.append(item)
        if len(result) >= limit:
            return result
    if len(result) < min_required:
        for item in generated_items:
            normalized = _normalize_score_summary_text(item)
            if normalized and normalized not in result:
                result.append(normalized)
            if len(result) >= limit:
                break
    if not result and empty_fallback:
        result.append(empty_fallback)
    return result[:limit]


def _score_payload_has_language_drift(payload: Dict[str, Any]) -> bool:
    texts = [
        *(_normalize_score_text_items(payload.get("advantages"), limit=5)),
        *(_normalize_score_text_items(payload.get("concerns"), limit=5)),
        str(payload.get("recommendation") or "").strip(),
    ]
    meaningful = [text for text in texts if text]
    if not meaningful:
        return False
    return any(_has_latin_letters(text) and not _contains_cjk(text) for text in meaningful)


def _score_payload_has_hard_rule_mismatch(model_payload: Dict[str, Any], fallback_payload: Dict[str, Any]) -> bool:
    model_status = _normalize_suggested_status(model_payload.get("suggested_status"))
    fallback_status = _normalize_suggested_status(fallback_payload.get("suggested_status"))
    if model_status == "screening_passed" and fallback_status != "screening_passed":
        return True
    fallback_hard_misses = _normalize_score_text_items(fallback_payload.get("concerns"), limit=5)
    return any("核心要求证据不足" in item or "未体现当前 Skills 中强调的硬性要求" in item for item in fallback_hard_misses) and model_status == "screening_passed"


def _normalize_resume_parse_error_text(error_message: Any) -> Optional[str]:
    if isinstance(error_message, dict):
        detail = error_message.get("detail")
        text = str(detail or "").strip() if detail is not None else json_dumps_safe(error_message)
    else:
        text = str(error_message or "").strip()
    return truncate_text(text, 240) if text else None


def _resume_parse_has_warning(parsed_payload: Dict[str, Any], error_message: Any, fallback_name: str) -> bool:
    if _normalize_resume_parse_error_text(error_message):
        return True
    basic_info = parsed_payload.get("basic_info") if isinstance(parsed_payload.get("basic_info"), dict) else {}
    candidate_name = str(basic_info.get("name") or "").strip()
    normalized_fallback = normalize_resume_fallback_name(fallback_name)
    if candidate_name and (len(candidate_name) > 12 or re.search(r"[【】\d]", candidate_name)):
        return True
    if normalized_fallback and candidate_name == fallback_name and normalized_fallback != fallback_name:
        return True
    suspicious_pattern = re.compile(r"[A-Za-z0-9]{18,}")
    for section in ["summary"]:
        if suspicious_pattern.search(str(parsed_payload.get(section) or "")):
            return True
    for key in ["work_experiences", "projects", "education_experiences", "skills"]:
        for item in parsed_payload.get(key) or []:
            text = str(item or "")
            if suspicious_pattern.search(text):
                return True
    return False


def _build_resume_parse_warning_message(parsed_payload: Dict[str, Any], fallback_name: str, error_message: Any = None) -> Optional[str]:
    normalized_error = _normalize_resume_parse_error_text(error_message)
    if normalized_error:
        return f"主模型结构化输出失败，已切换兜底解析：{normalized_error}"
    if not _resume_parse_has_warning(parsed_payload, None, fallback_name):
        return None
    return "解析结果存在异常片段，建议人工复核。"


def _detect_parse_field_mixed_types(items: Any) -> bool:
    if not isinstance(items, list) or not items:
        return False
    seen_types = {type(item) for item in items if item is not None}
    return len(seen_types) > 1


def _extract_parse_quality_warnings(
    parsed_payload: Dict[str, Any],
    *,
    extra_warnings: Optional[Sequence[Any]] = None,
) -> List[str]:
    warnings: List[str] = _dedupe_texts(extra_warnings or [])
    suspicious_pattern = re.compile(r"[A-Za-z0-9]{18,}")
    work_experiences = parsed_payload.get("work_experiences") if isinstance(parsed_payload.get("work_experiences"), list) else []
    education_experiences = parsed_payload.get("education_experiences") if isinstance(parsed_payload.get("education_experiences"), list) else []
    projects = parsed_payload.get("projects") if isinstance(parsed_payload.get("projects"), list) else []
    raw_text = str(parsed_payload.get("raw_text") or "")

    if _detect_parse_field_mixed_types(work_experiences):
        warnings.append("work_experiences 同时包含结构化对象与裸文本条目")
    if _detect_parse_field_mixed_types(education_experiences):
        warnings.append("education_experiences 同时包含结构化对象与裸文本条目")
    if _detect_parse_field_mixed_types(projects):
        warnings.append("projects 同时包含结构化对象与裸文本条目")
    if any(isinstance(item, str) for item in work_experiences):
        warnings.append("work_experiences 中仍包含未完全结构化的裸文本条目")
    if any(isinstance(item, str) for item in education_experiences):
        warnings.append("education_experiences 中仍包含未完全结构化的裸文本条目")
    if any(isinstance(item, str) for item in projects):
        warnings.append("projects 中仍包含未完全结构化的裸文本条目")

    if any(isinstance(item, str) and suspicious_pattern.search(item) for item in work_experiences + education_experiences + projects):
        warnings.append("解析结果中仍包含疑似 OCR / hash 异常片段")
    if any(isinstance(item, str) and re.search(r"(英语四级|普通话|证书|荣誉)", item) for item in education_experiences):
        warnings.append("education_experiences 中混入了证书或荣誉类文本")
    if any(
        isinstance(item, str)
        and (
            re.match(r"^\d+[、.]", item.strip())
            or "测试指导书" in item
            or "项目交付" in item
        )
        for item in projects
    ):
        warnings.append("projects 中混入了非标准项目条目")
    if any(isinstance(item, str) and re.match(r"^\d{4}", item.strip()) for item in work_experiences):
        warnings.append("work_experiences 中仍包含未完全结构化的日期文本")
    if any(isinstance(item, dict) and not _is_valid_work_resume_item(item) for item in work_experiences):
        warnings.append("work_experiences 中仍存在结构异常的工作经历条目")
    if any(isinstance(item, dict) and not _is_valid_education_resume_item(item) for item in education_experiences):
        warnings.append("education_experiences 中仍存在结构异常的教育条目")
    if any(isinstance(item, dict) and not _is_valid_project_resume_item(item) for item in projects):
        warnings.append("projects 中仍存在结构异常的项目条目")
    if any(
        isinstance(item, dict)
        and re.search(r"(Cadence|PADS|Protel|OrCAD|PCB)", str(item.get("company_name") or item.get("company") or ""), re.IGNORECASE)
        for item in work_experiences
    ):
        warnings.append("work_experiences 中混入了工具名或非公司主体文本")
    if any(
        isinstance(item, dict)
        and re.search(r"(主要负责|测试执行|项目交付|实验室设备管理|负责.+测试|负责.+开发)", str(item.get("position") or item.get("title") or ""))
        for item in work_experiences
    ):
        warnings.append("work_experiences 中存在职位字段混入职责描述的情况")
    if len(work_experiences) >= 3 and sum(1 for item in work_experiences if isinstance(item, dict) and not str(item.get("duration") or "").strip()) >= 2:
        warnings.append("work_experiences 中有多条工作经历缺少 duration，时间切分可能仍不稳定")
    if raw_text and "项目经历" in raw_text and not projects:
        warnings.append("简历原文存在项目经历，但 projects 未成功提取出结构化项目")
    if (
        raw_text
        and re.search(r"(大学|学院).{0,12}(本科|硕士|博士).{0,18}(电子|计算机|自动化|软件工程|通信)", raw_text)
        and not any(isinstance(item, dict) and str(item.get("major") or "").strip() for item in education_experiences)
    ):
        warnings.append("education_experiences 未完整保留专业字段")
    return _dedupe_texts(warnings)


HIGH_RISK_PARSE_WARNING_MARKERS = (
    "education_experiences 中仍存在结构异常的教育条目",
    "work_experiences 中仍存在结构异常的工作经历条目",
    "projects 中仍存在结构异常的项目条目",
    "education_experiences 中混入了证书或荣誉类文本",
    "work_experiences 中存在职位字段混入职责描述的情况",
)


def _has_high_risk_parse_quality_warnings(warnings: Optional[Sequence[Any]]) -> bool:
    normalized_warnings = [str(item or "").strip() for item in (warnings or []) if str(item or "").strip()]
    return any(
        any(marker in warning for marker in HIGH_RISK_PARSE_WARNING_MARKERS)
        for warning in normalized_warnings
    )


def _build_parse_output_summary(parse_quality_warnings: Optional[Sequence[Any]]) -> str:
    normalized_warnings = _dedupe_texts(parse_quality_warnings or [])
    if not normalized_warnings:
        return "简历解析完成"
    return truncate_text(
        f"简历解析完成，但存在结构化告警：{'；'.join(normalized_warnings[:2])}",
        240,
    )


def _derive_parse_execution_status(status: Optional[str], error_message: Any = None) -> str:
    normalized_error = _normalize_resume_parse_error_text(error_message)
    normalized_status = str(status or "").strip().lower()
    if normalized_status in {"cancelled", "failed"}:
        return normalized_status
    if normalized_error and "已切换兜底解析" in normalized_error:
        return "fallback"
    if normalized_status in {"success", "warning"}:
        return "success"
    return normalized_status or "success"


def _parse_skill_frontmatter(content: Any) -> Dict[str, str]:
    text = str(content or "")
    match = re.match(r"^\s*---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n|$)", text, re.DOTALL)
    if not match:
        return {}
    result: Dict[str, str] = {}
    for raw_line in match.group(1).splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        normalized_key = key.strip().lower()
        normalized_value = value.strip().strip("'").strip('"')
        if normalized_key and normalized_value:
            result[normalized_key] = normalized_value
    return result


def _normalize_skill_task_name(value: Any) -> Optional[str]:
    text = str(value or "").strip().lower()
    for task_kind, keywords in SKILL_TASK_KEYWORDS.items():
        if text == task_kind or text in keywords:
            return task_kind
    return None


def _extract_skill_runtime_meta(skill: Any) -> Dict[str, Any]:
    if isinstance(skill, RecruitmentSkill):
        skill_code = str(skill.skill_code or "").strip().lower()
        name = str(skill.name or "").strip().lower()
        tags = json_loads_safe(skill.tags_json, [])
        explicit_group = str(getattr(skill, "skill_group", "") or "").strip()
        explicit_version = str(getattr(skill, "version", "") or "").strip()
        content = skill.content
    elif isinstance(skill, dict):
        skill_code = str(skill.get("skill_code") or "").strip().lower()
        name = str(skill.get("name") or "").strip().lower()
        tags = skill.get("tags") or []
        explicit_group = str(skill.get("skill_group") or "").strip()
        explicit_version = str(skill.get("version") or skill.get("skill_version") or "").strip()
        content = skill.get("content")
    else:
        skill_code = ""
        name = str(skill or "").strip().lower()
        tags = []
        explicit_group = ""
        explicit_version = ""
        content = ""
    tag_texts = [str(item or "").strip() for item in tags if str(item or "").strip()]
    frontmatter = _parse_skill_frontmatter(content)
    group = explicit_group or str(frontmatter.get("skill_group") or frontmatter.get("group") or "").strip()
    version = explicit_version or str(frontmatter.get("version") or frontmatter.get("skill_version") or "").strip()
    for tag in tag_texts:
        if not group and tag.lower().startswith("group:"):
            group = tag.split(":", 1)[1].strip()
        if not version and tag.lower().startswith("version:"):
            version = tag.split(":", 1)[1].strip()
    task_candidates: List[str] = []
    for field_name in ["applies_to", "task", "tasks", "task_type"]:
        raw_value = frontmatter.get(field_name)
        if raw_value:
            task_candidates.extend(re.split(r"[,/|，、\s]+", raw_value))
    for tag in tag_texts:
        lower_tag = tag.lower()
        if lower_tag.startswith("task:"):
            task_candidates.append(tag.split(":", 1)[1].strip())
        else:
            task_candidates.append(tag)
    haystacks = [skill_code, name, *[tag.lower() for tag in tag_texts]]
    tasks: List[str] = []
    for raw_value in task_candidates:
        normalized = _normalize_skill_task_name(raw_value)
        if normalized and normalized not in tasks:
            tasks.append(normalized)
    if not tasks:
        for task_kind, keywords in SKILL_TASK_KEYWORDS.items():
            if any(any(keyword in haystack for keyword in keywords) for haystack in haystacks if haystack):
                tasks.append(task_kind)
    return {"tasks": tasks, "group": group, "version": version}


def _extract_skill_task_types(skill: Any) -> List[str]:
    return list(_extract_skill_runtime_meta(skill).get("tasks") or [])


def _resume_item_to_report_text(item: Any) -> str:
    def normalize_value(value: Any) -> str:
        if isinstance(value, list):
            return "；".join(sanitize_string_list(value)[:3])
        text = strip_markdown(str(value or "")).strip()
        return re.sub(r"\s+", " ", text)

    if isinstance(item, dict):
        preferred_keys = [
            "company_name",
            "company",
            "employer",
            "organization",
            "title",
            "role",
            "position",
            "name",
            "project_name",
            "school",
            "degree",
            "major",
            "content",
            "description",
            "summary",
        ]
        values: List[str] = []
        for key in preferred_keys:
            text = normalize_value(item.get(key))
            if text and text not in values:
                values.append(text)
        if not values:
            for value in item.values():
                text = normalize_value(value)
                if text and text not in values:
                    values.append(text)
        return " / ".join(values[:3])
    text = strip_markdown(str(item or "")).strip()
    return re.sub(r"\s+", " ", text)


def _resume_report_lines(items: Any, *, limit: int, empty_text: str = "未提及") -> List[str]:
    lines: List[str] = []
    iterable = items if isinstance(items, list) else []
    for item in iterable:
        text = _resume_item_to_report_text(item)
        if text and text not in lines:
            lines.append(text)
        if len(lines) >= limit:
            break
    return lines or [empty_text]


def _coerce_report_text_list(value: Any) -> List[str]:
    if isinstance(value, list):
        source = value
    elif isinstance(value, str):
        source = re.split(r"[\n\r]+", value)
    else:
        source = []
    result: List[str] = []
    for item in source:
        text = strip_markdown(str(item or "")).strip()
        text = re.sub(r"\s+", " ", text)
        if text and text not in result:
            result.append(text)
    return result


def _build_screening_report_markdown(candidate: RecruitmentCandidate, parsed_payload: Dict[str, Any], score_payload: Dict[str, Any]) -> str:
    basic_info = parsed_payload.get("basic_info") if isinstance(parsed_payload.get("basic_info"), dict) else {}
    candidate_name = str(basic_info.get("name") or candidate.name or "简历未提供").strip() or "简历未提供"
    normalized_candidate_name = normalize_resume_fallback_name(candidate_name)
    if normalized_candidate_name:
        candidate_name = normalized_candidate_name
    years_of_experience = str(basic_info.get("years_of_experience") or candidate.years_of_experience or "简历未提供").strip() or "简历未提供"
    education = str(basic_info.get("education") or candidate.education or "简历未提供").strip() or "简历未提供"
    location = str(basic_info.get("location") or "简历未提供").strip() or "简历未提供"
    contact = str(basic_info.get("phone") or basic_info.get("email") or candidate.phone or candidate.email or "简历未提供").strip() or "简历未提供"
    skills = _resume_report_lines(parsed_payload.get("skills"), limit=8)
    work_experiences = _resume_report_lines(parsed_payload.get("work_experiences"), limit=3)
    projects = _resume_report_lines(parsed_payload.get("projects"), limit=3)
    dimensions = _normalize_score_dimensions(score_payload.get("dimensions"), limit=12)
    advantages = _normalize_score_text_items(score_payload.get("advantages") or score_payload.get("advantages_text"), limit=4)
    concerns = _normalize_score_text_items(score_payload.get("concerns") or score_payload.get("concerns_text"), limit=4)
    summary = strip_markdown(str(parsed_payload.get("summary") or "")).strip() or "暂无简历摘要。"
    status_value = _normalize_suggested_status(score_payload.get("suggested_status"))
    status_text = SCREENING_STATUS_LABELS.get(status_value or "", str(score_payload.get("suggested_status") or "未给出"))
    recommendation = _compact_recommendation(score_payload.get("recommendation")) or "AI 原始 recommendation 缺失，请重新触发初筛。"
    total_score_value = _parse_score_number(score_payload.get("total_score"))
    match_percent_value = _parse_score_number(score_payload.get("match_percent"))
    derived_total_score = _parse_score_number(score_payload.get("derived_total_score_from_dimensions"))
    derived_match_percent = _parse_score_number(score_payload.get("derived_match_percent_from_dimensions"))
    if derived_total_score is not None:
        total_score_value = derived_total_score
    if derived_match_percent is not None:
        match_percent_value = derived_match_percent
    total_score_text = _normalize_report_number(total_score_value)
    match_percent_text = _normalize_report_number(match_percent_value)
    total_score_scale = _infer_score_scale(total_score_value)

    lines = [
        "# 候选人初筛报告",
        "",
        "## 候选人基本信息",
        f"- 姓名：{candidate_name}",
        f"- 工作年限：{years_of_experience}",
        f"- 学历：{education}",
        f"- 联系方式：{contact}",
        f"- 所在地：{location}",
        "",
        "## 关键信息提取",
        f"- 简历技能：{'；'.join(skills)}",
        f"- 工作经历：{'；'.join(work_experiences)}",
        f"- 项目经历：{'；'.join(projects)}",
        "",
        "## 评分结论",
        f"- 综合评分：{total_score_text} / {total_score_scale}",
        f"- 匹配度：{match_percent_text}%",
        f"- 建议状态：{status_text}",
        f"- 推荐结论：{recommendation}",
    ]
    if dimensions:
        lines.extend([
            "",
            "## 逐维度评分",
        ])
        for item in dimensions:
            label = str(item.get("label") or "未命名维度")
            score_text = _normalize_report_number(item.get("score"))
            max_score_text = _normalize_report_number(item.get("max_score"))
            suffix: List[str] = []
            if item.get("weight_text"):
                suffix.append(str(item.get("weight_text")))
            if item.get("is_core"):
                suffix.append("核心")
            meta_text = f"（{' · '.join(suffix)}）" if suffix else ""
            reason = _normalize_score_summary_text(item.get("reason")) or "简历未提及"
            evidence = _normalize_score_text_items(item.get("evidence"), limit=2)
            if evidence:
                reason = f"{reason}；证据：{'；'.join(evidence)}"
            lines.append(f"- {label}：{score_text} / {max_score_text}{meta_text} — {reason}")

    lines.extend([
        "",
        "## 候选人亮点",
    ])
    if advantages:
        lines.extend([f"{index}. {item}" for index, item in enumerate(advantages[:5], 1)])
    else:
        lines.append("1. -")
    lines.extend([
        "",
        "## 风险点 / 待核实项",
    ])
    if concerns:
        lines.extend([f"{index}. {item}" for index, item in enumerate(concerns[:5], 1)])
    else:
        lines.append("1. -")
    lines.extend([
        "",
        "## 简历摘要",
        summary,
        "",
        "_本报告由结构化简历解析与评分结果自动生成，便于复盘与留痕。_",
    ])
    return "\n".join(lines).strip()


def _build_screening_skill_prompt_block(skill_snapshots: Sequence[Dict[str, Any]]) -> str:
    if not skill_snapshots:
        return "No active skills."
    blocks: List[str] = []
    for index, skill in enumerate(skill_snapshots, 1):
        blocks.append(
            "\n".join(
                [
                    f"[SKILL {index}]",
                    f"id: {skill.get('id')}",
                    f"name: {skill.get('name')}",
                    f"description: {skill.get('description') or 'N/A'}",
                    "content:",
                    str(skill.get("content") or ""),
                ]
            )
        )
    return "\n\n".join(blocks)


def _strip_skill_frontmatter(value: Any) -> str:
    text = str(value or "").strip()
    if text.startswith("---"):
        parts = text.split("\n---", 1)
        if len(parts) == 2:
            text = parts[1].lstrip("\n")
    return text.strip()


def _extract_markdown_block(text: str, heading: str, next_headings: Sequence[str]) -> str:
    start = text.find(heading)
    if start < 0:
        return ""
    end = len(text)
    for marker in next_headings:
        index = text.find(marker, start + len(heading))
        if index >= 0:
            end = min(end, index)
    return text[start:end].strip()


def _collapse_blank_lines(text: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", text or "").strip()


def _tailor_skill_content_for_task(content: Any, task_kind: str) -> str:
    text = _strip_skill_frontmatter(content)
    if not text:
        return ""
    if "## 模块一" not in text and "## 模块二" not in text:
        return text

    def normalize_line(line: str) -> str:
        cleaned = strip_markdown(line or "").strip()
        cleaned = re.sub(r"\s+", " ", cleaned)
        return cleaned

    def compact_lines(block: str, *, mode: str) -> str:
        lines: List[str] = []
        current_section = ""
        for line in block.splitlines():
            stripped = line.strip()
            if not stripped or stripped == "---" or stripped.startswith("```"):
                continue
            if stripped.startswith("## ") or stripped.startswith("### "):
                current_section = normalize_line(stripped)
                continue
            if stripped.startswith("|"):
                cells = [cell.strip() for cell in stripped.strip("|").split("|")]
                if len(cells) >= 4 and cells[0] not in {"维度", "------"}:
                    lines.append(f"{cells[0]}：{cells[3]}")
                continue
            normalized = normalize_line(stripped)
            if not normalized:
                continue
            if mode == "screening":
                if any(normalized.startswith(prefix) for prefix in ["岗位职责：", "任职要求：", "加分项：", "补充说明"]):
                    lines.append(normalized)
                    continue
                if any(keyword in current_section for keyword in ["补充说明", "打分规则", "打分维度"]) and (stripped.startswith("-") or re.match(r"^\d+\.", stripped)):
                    lines.append(normalized)
                    continue
            elif mode == "interview":
                if any(keyword in normalized for keyword in ["强制出题", "软件测试不为零", "AI工具必出"]):
                    lines.append(normalized)
                    continue
                if "模块二" in current_section or "面试题" in current_section:
                    if stripped.startswith("-") or re.match(r"^\d+\.", stripped) or stripped.startswith("**"):
                        lines.append(normalized)
                        continue
        return "\n".join(_dedupe_texts(lines))

    module1 = _extract_markdown_block(text, "## 模块一", ["## 模块二"])
    module2 = _extract_markdown_block(text, "## 模块二", [])
    intro_end_candidates = [index for index in [text.find("## 模块一"), text.find("## 模块二")] if index >= 0]
    intro = text[: min(intro_end_candidates)] if intro_end_candidates else text

    if task_kind == "screening":
        compact_intro = compact_lines(intro, mode="screening")
        compact_module1 = compact_lines(module1.split("### 初筛报告输出格式", 1)[0].strip() if "### 初筛报告输出格式" in module1 else module1, mode="screening")
        return _collapse_blank_lines("\n".join(part for part in [compact_intro, compact_module1] if part.strip()))

    if task_kind == "interview":
        compact_intro = compact_lines(intro, mode="interview")
        compact_module2 = compact_lines(module2, mode="interview")
        return _collapse_blank_lines("\n".join(part for part in [compact_intro, compact_module2] if part.strip()))

    return text


def _unsupported_claim_labels(statement: str, raw_text: str, work_experiences: Optional[Iterable[Any]] = None) -> List[str]:
    lowered_statement = str(statement or "").lower()
    lowered_raw = str(raw_text or "").lower()
    lowered_work = " ".join(str(item or "") for item in (work_experiences or [])).lower()
    checks = [
        ("AI 工具", ["ai工具", "ai 工具", "chatgpt", "copilot", "大模型", "aigc"], ["ai工具", "ai 工具", "chatgpt", "copilot", "大模型", "aigc"]),
        ("自动化测试", ["自动化测试", "自动化"], ["自动化测试", "自动化", "appium", "selenium", "uiautomator", "espresso"]),
    ]
    result: List[str] = []
    for label, triggers, evidences in checks:
        if any(trigger in lowered_statement for trigger in triggers) and not any(evidence.lower() in lowered_raw for evidence in evidences):
            result.append(label)
    if any(trigger in lowered_statement for trigger in ["大厂", "头部企业", "头部厂商"]) and not any(
        brand in lowered_work for brand in ["小米", "华为", "美的", "海尔", "阿里", "腾讯", "百度", "字节", "京东", "美团", "滴滴", "快手", "网易", "小红书"]
    ):
        result.append("大厂/头部企业")
    return result


def _resume_search_text(raw_text: Any) -> str:
    return re.sub(r"\s+", " ", str(raw_text or "")).lower()


def _parse_stringified_resume_list(value: Any) -> List[str]:
    text = sanitize_string(value)
    if not text:
        return []
    if not (
        (text.startswith("[") and text.endswith("]"))
        or (text.startswith("(") and text.endswith(")"))
    ):
        return []
    parsed = None
    try:
        parsed = ast.literal_eval(text)
    except (ValueError, SyntaxError):
        parsed = json_loads_safe(text, None)
    if isinstance(parsed, (list, tuple)):
        return sanitize_string_list(list(parsed))
    return []


def _normalize_resume_item_field_key(key: Any) -> str:
    normalized = str(key or "").strip()
    if normalized == "start_time":
        return "start_date"
    if normalized == "end_time":
        return "end_date"
    return normalized


def _normalize_resume_item_field_value(value: Any) -> Any:
    if isinstance(value, list):
        normalized_list = sanitize_string_list(value)
        return normalized_list or None
    normalized_list = _parse_stringified_resume_list(value)
    if normalized_list:
        return normalized_list
    text = strip_markdown(str(value or "")).strip()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"(?<=\d)\s*-\s*(?=\d)", "-", text)
    text = re.sub(r"\s*~\s*", " ~ ", text)
    return text or None


def _resume_item_supported(item: Any, raw_text: str, *, allow_short: bool = False) -> bool:
    text = _resume_item_to_report_text(item)
    if not text:
        return False
    searchable = _resume_search_text(raw_text)
    lowered = text.lower()
    if lowered in searchable:
        return True
    segments = [
        segment.strip().lower()
        for segment in re.split(r"[\n\r,，。；;、|/（）()]+", lowered)
        if segment.strip()
    ]
    result_tokens: List[str] = []
    generic_tokens = {
        "负责", "相关", "经验", "能力", "项目", "工作", "参与", "支持", "协作", "测试", "研发",
        "系统", "平台", "流程", "模块", "优化", "输出", "问题", "管理", "推动", "具备",
    }

    def push(token: str) -> None:
        normalized = str(token or "").strip().lower()
        normalized = normalized.strip("：:()（）[]【】,.，。；;!！?？")
        min_length = 2 if allow_short else 3
        if (
            len(normalized) < min_length
            or len(normalized) > 24
            or normalized in result_tokens
            or normalized in generic_tokens
        ):
            return
        result_tokens.append(normalized)

    for token in re.findall(r"[A-Za-z][A-Za-z0-9+_.-]{1,24}", lowered):
        push(token)
    for segment in segments:
        push(segment)
        for token in extract_keywords(segment):
            push(token)
    if not result_tokens:
        return False
    matched = [token for token in result_tokens if token in searchable]
    return len(matched) >= max(1, min(len(result_tokens), 2))


def _normalize_resume_item(item: Any) -> Any:
    if isinstance(item, dict):
        cleaned: Dict[str, Any] = {}
        for key, value in item.items():
            normalized_key = _normalize_resume_item_field_key(key)
            if not normalized_key:
                continue
            normalized_value = _normalize_resume_item_field_value(value)
            if normalized_value is None:
                continue
            if (
                normalized_key in {"start_date", "end_date"}
                and normalized_key in cleaned
                and str(cleaned.get(normalized_key) or "").strip()
            ):
                continue
            cleaned[normalized_key] = normalized_value
        return cleaned or None
    text = strip_markdown(str(item or "")).strip()
    text = re.sub(r"\s+", " ", text)
    return text or None


def _resume_item_signature(item: Any) -> str:
    return _resume_item_to_report_text(item).strip().lower()


def _is_education_resume_item(item: Any) -> bool:
    text = _resume_item_to_report_text(item)
    if not text:
        return False
    has_education_marker = any(keyword in text for keyword in ["大学", "学院", "本科", "硕士", "博士", "专业"])
    has_company_marker = any(keyword in text for keyword in ["有限公司", "公司", "科技", "集团", "Inc", "Ltd"])
    has_year = bool(re.search(r"20\d{2}", text))
    return has_education_marker and has_year and not has_company_marker


def _looks_like_invalid_work_company_name(value: Any) -> bool:
    text = str(value or "").strip()
    normalized = _normalize_helper_semantic_text(text)
    if not text:
        return True
    if text in {"至今", "现在", "今"}:
        return True
    if text.isdigit() or len(text) < 3 or len(text) > 40:
        return True
    if re.fullmatch(r"[\d.\-~至今现在 ]+", text):
        return True
    if any(separator in text for separator in ["，", "。", "；", ";", "\n", "\r"]):
        return True
    if _looks_like_responsibility_position(text):
        return True
    if re.search(r"(Cadence|PADS|Protel|OrCAD|PCB)", text, re.IGNORECASE):
        return True
    if any(
        token in normalized
        for token in [
            "查看原理图",
            "测试方案",
            "建立新机软件",
            "深度参与整机测试",
            "负责关键软件",
            "负责关键软件测试",
            "项目交付",
            "实验室设备管理",
            "主要负责",
            "深度参与",
            "参与整机测试",
            "负责整机测试",
            "建立软件",
        ]
    ):
        return True
    if re.search(r"(负责|参与|协助|建立|搭建|维护|编写|跟进|推进).{0,12}(测试|软件|硬件|项目|方案|文档|平台)", text):
        return True
    if not any(keyword in text for keyword in ["公司", "有限公司", "集团", "科技", "软件", "中心", "研究院", "通信", "电子", "股份", "实验室", "研究所", "事业部"]):
        if len(text) >= 10 or len(normalized) >= 16:
            return True
    return False


def _is_valid_work_resume_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    company = str(item.get("company_name") or item.get("company") or "").strip()
    position = str(item.get("position") or item.get("title") or "").strip()
    duration = str(item.get("duration") or "").strip()
    start_date = str(item.get("start_date") or "").strip()
    end_date = str(item.get("end_date") or "").strip()
    if _looks_like_invalid_work_company_name(company):
        return False
    if duration and not re.search(r"(?:19|20)\d{2}", duration):
        return False
    if position and len(position) > 60:
        return False
    has_date = bool(start_date or end_date)
    if not duration and not (position and has_date):
        return False
    return True


def _is_valid_education_resume_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    school = str(item.get("school") or "").strip()
    degree = str(item.get("degree") or "").strip()
    major = str(item.get("major") or "").strip()
    if _looks_like_noisy_helper_school(school):
        return False
    if "@" in major or any(token in major for token in ["联系电话", "邮箱", "Email", "email"]):
        return False
    if any(keyword in school for keyword in ["英语四级", "英语六级", "普通话", "证书", "荣誉", "资格证"]):
        return False
    return bool(school or degree or major)


def _is_valid_project_resume_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    project_name = str(item.get("project_name") or item.get("name") or "").strip()
    if not project_name or project_name in {"项目经历", "项目经验", "项目名称"}:
        return False
    if any(marker in project_name for marker in ["项目描述", "职责描述", "项目环境", "产品介绍", "项目简介"]):
        return False
    if re.match(r"^\d+[、.．]\s*(项目交付|编写测试指导书|测试指导书)\b", project_name):
        return False
    return True


def _reconcile_resume_sections(work_items: List[Any], education_items: List[Any]) -> Tuple[List[Any], List[Any]]:
    moved_signatures = {_resume_item_signature(item) for item in work_items if _is_education_resume_item(item)}
    next_work = [item for item in work_items if _resume_item_signature(item) not in moved_signatures]
    next_education = list(education_items)
    education_signatures = {_resume_item_signature(item) for item in next_education}
    for item in work_items:
        signature = _resume_item_signature(item)
        if signature not in moved_signatures or signature in education_signatures:
            continue
        next_education.append(item)
        education_signatures.add(signature)
    return next_work, next_education


def _sanitize_resume_list(
    primary_items: Any,
    raw_text: str,
    secondary_items: Any,
    *,
    limit: int,
    allow_short: bool = False,
    validator: Optional[Callable[[Any], bool]] = None,
    check_primary_support: bool = False,
) -> List[Any]:
    result: List[Any] = []
    seen_signatures: List[str] = []
    primary_collection = primary_items if isinstance(primary_items, list) else []
    secondary_collection = secondary_items if isinstance(secondary_items, list) else []
    for collection, should_check_support in [(primary_collection, check_primary_support), (secondary_collection, True)]:
        for item in collection:
            normalized_item = _normalize_resume_item(item)
            if normalized_item is None:
                continue
            if validator and not validator(normalized_item):
                continue
            if should_check_support and not _resume_item_supported(normalized_item, raw_text, allow_short=allow_short):
                continue
            signature = _resume_item_signature(normalized_item)
            if not signature or signature in seen_signatures:
                continue
            seen_signatures.append(signature)
            result.append(normalized_item)
            if len(result) >= limit:
                return result
    return result[:limit]


GENERIC_EDUCATION_LABELS = {"博士", "硕士", "本科", "大专", "专科", "中专", "高中"}


def _build_education_summary_from_experiences(items: Any) -> str:
    candidates: List[str] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        school = sanitize_string(item.get("school"))
        degree = sanitize_string(item.get("degree"))
        major = sanitize_string(item.get("major"))
        if _looks_like_noisy_helper_school(school):
            continue
        parts = [part for part in [school, degree, major] if part]
        if len(parts) < 2:
            continue
        candidates.append(" ".join(parts[:3]).strip())
    if not candidates:
        return ""
    candidates.sort(key=lambda value: (len(value), value), reverse=True)
    return candidates[0]


def _sanitize_resume_basic_info(
    ai_basic_info: Any,
    fallback_basic_info: Any,
    raw_text: str,
    education_experiences: Any = None,
) -> Dict[str, Any]:
    ai_info = ai_basic_info if isinstance(ai_basic_info, dict) else {}
    fallback = dict(fallback_basic_info if isinstance(fallback_basic_info, dict) else {})
    searchable = _resume_search_text(raw_text)
    for field in ["name", "phone", "email", "years_of_experience", "education", "location"]:
        value = str(ai_info.get(field) or "").strip()
        if not value:
            continue
        if field in {"phone", "email"}:
            if value.lower() in searchable:
                fallback[field] = value
        elif field == "name":
            if value in str(raw_text or "") or not fallback.get(field):
                fallback[field] = value
        elif value.lower() in searchable or value in str(raw_text or ""):
            fallback[field] = value
    education_summary = _build_education_summary_from_experiences(education_experiences)
    current_education = str(fallback.get("education") or "").strip()
    if education_summary and (
        not current_education
        or current_education in GENERIC_EDUCATION_LABELS
        or len(education_summary) > len(current_education) + 2
    ):
        fallback["education"] = education_summary
    return fallback


GENERIC_PARSE_SKILL_STOPWORD_KEYS = set(GENERIC_SCORE_HELPER_SKILL_STOPWORD_KEYS) | {
    _normalize_helper_semantic_text("iot测试"),
    _normalize_helper_semantic_text("质量"),
    _normalize_helper_semantic_text("沟通"),
    _normalize_helper_semantic_text("硬件"),
    _normalize_helper_semantic_text("软硬件"),
    _normalize_helper_semantic_text("驱动"),
    _normalize_helper_semantic_text("测试"),
    _normalize_helper_semantic_text("网络"),
    _normalize_helper_semantic_text("web"),
    _normalize_helper_semantic_text("app"),
    _normalize_helper_semantic_text("sql"),
    _normalize_helper_semantic_text("iot"),
}


def _build_resume_duration_from_dates(start_date: Any, end_date: Any) -> str:
    start = sanitize_string(start_date)
    end = sanitize_string(end_date)
    if start and end:
        return f"{start} ~ {end}"
    return start or end


def _sanitize_work_experiences_for_storage(items: Any) -> Tuple[List[Any], List[str]]:
    warnings: List[str] = []
    result: List[Any] = []
    seen_keys: set[Tuple[str, ...]] = set()
    duplicate_removed = False
    normalized_description = False
    invalid_removed = False
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            invalid_removed = True
            continue
        cleaned = dict(item)
        company = sanitize_string(cleaned.get("company_name") or cleaned.get("company"))
        if company:
            if cleaned.get("company_name") is not None:
                cleaned["company_name"] = company
            elif cleaned.get("company") is not None:
                cleaned["company"] = company
            else:
                cleaned["company_name"] = company
        duration = sanitize_string(cleaned.get("duration"))
        if not duration:
            duration = _build_resume_duration_from_dates(cleaned.get("start_date"), cleaned.get("end_date"))
            if duration:
                cleaned["duration"] = duration
        cleaned.pop("start_time", None)
        cleaned.pop("end_time", None)
        description_list = _parse_stringified_resume_list(cleaned.get("description"))
        if description_list:
            cleaned["description"] = description_list
            normalized_description = True
        position = sanitize_string(cleaned.get("position") or cleaned.get("title"))
        if position and _looks_like_responsibility_position(position):
            if "position" in cleaned:
                cleaned["position"] = ""
            if "title" in cleaned:
                cleaned["title"] = ""
            position = ""
        if _looks_like_invalid_work_company_name(company):
            invalid_removed = True
            continue
        dedupe_key = _normalize_helper_dedupe_key(duration, company, position)
        if any(dedupe_key):
            if dedupe_key in seen_keys:
                duplicate_removed = True
                continue
            seen_keys.add(dedupe_key)
        normalized_item = {
            key: value
            for key, value in cleaned.items()
            if (
                isinstance(value, list)
                and len(value) > 0
            ) or str(value or "").strip()
        }
        if not normalized_item or not _is_valid_work_resume_item(normalized_item):
            invalid_removed = True
            continue
        result.append(normalized_item)
    if duplicate_removed:
        warnings.append("work_experiences 存在重复结构，已去重")
    if normalized_description:
        warnings.append("work_experiences.description 为字符串化列表，已归一")
    if invalid_removed:
        warnings.append("work_experiences 中存在结构异常的工作经历条目，已过滤")
    return result, warnings


def _has_duplicate_work_experience_structure(items: Any) -> bool:
    seen_keys: set[Tuple[str, ...]] = set()
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        company = sanitize_string(item.get("company_name") or item.get("company"))
        duration = sanitize_string(item.get("duration")) or _build_resume_duration_from_dates(item.get("start_date"), item.get("end_date"))
        position = sanitize_string(item.get("position") or item.get("title"))
        if position and _looks_like_responsibility_position(position):
            position = ""
        dedupe_key = _normalize_helper_dedupe_key(duration, company, position)
        if not any(dedupe_key):
            continue
        if dedupe_key in seen_keys:
            return True
        seen_keys.add(dedupe_key)
    return False


def _has_stringified_resume_list_field(items: Any, field_name: str) -> bool:
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        if _parse_stringified_resume_list(item.get(field_name)):
            return True
    return False


def _sanitize_parse_skills_for_storage(items: Any) -> Tuple[List[str], List[str]]:
    warnings: List[str] = []
    result: List[str] = []
    seen_keys: set[str] = set()
    filtered_generic = False
    for item in items if isinstance(items, list) else []:
        text = sanitize_string(item.get("name") if isinstance(item, dict) else item)
        if not text:
            continue
        normalized = _normalize_helper_semantic_text(text)
        if not normalized:
            continue
        if normalized in GENERIC_PARSE_SKILL_STOPWORD_KEYS:
            filtered_generic = True
            continue
        if normalized in seen_keys:
            continue
        seen_keys.add(normalized)
        result.append(text)
    if filtered_generic:
        warnings.append("skills 存在泛词污染，已过滤")
    return result[:20], warnings


def _normalize_project_highlights_for_storage(value: Any) -> Tuple[List[str], bool]:
    if isinstance(value, list):
        return sanitize_string_list(value), False
    text = sanitize_string(value)
    if not text:
        return [], False
    parsed_list: List[str] = []
    parsed = None
    looked_like_list = (
        (text.startswith("[") and text.endswith("]"))
        or (text.startswith("(") and text.endswith(")"))
    )
    if looked_like_list:
        try:
            parsed = ast.literal_eval(text)
        except (ValueError, SyntaxError):
            parsed = json_loads_safe(text, None)
    if isinstance(parsed, (list, tuple)):
        parsed_list = sanitize_string_list(list(parsed))
    return parsed_list, looked_like_list


def _sanitize_projects_for_storage(items: Any) -> Tuple[List[Any], List[str]]:
    warnings: List[str] = []
    result: List[Any] = []
    normalized_highlights = False
    normalized_description = False
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            result.append(item)
            continue
        cleaned = {
            key: value
            for key, value in dict(item).items()
            if str(value or "").strip()
        }
        project_name = sanitize_string(cleaned.get("project_name") or cleaned.get("name") or cleaned.get("title"))
        if project_name:
            cleaned["project_name"] = _trim_helper_project_name(project_name, limit=120)
        cleaned.pop("start_time", None)
        cleaned.pop("end_time", None)
        description_list = _parse_stringified_resume_list(cleaned.get("description"))
        if description_list:
            cleaned["description"] = description_list
            normalized_description = True
        highlights, was_stringified = _normalize_project_highlights_for_storage(cleaned.get("highlights"))
        if was_stringified:
            normalized_highlights = True
        if highlights:
            cleaned["highlights"] = highlights
        else:
            cleaned.pop("highlights", None)
        result.append(cleaned)
    if normalized_highlights:
        warnings.append("projects.highlights 为字符串化列表，已归一")
    if normalized_description:
        warnings.append("projects.description 为字符串化列表，已归一")
    return result, warnings


def _sanitize_ai_parsed_resume_with_meta(
    parsed_resume: Dict[str, Any],
    raw_text: str,
    fallback_name: str,
) -> Tuple[Dict[str, Any], List[str]]:
    warnings: List[str] = []
    normalized = _normalize_resume_parse_payload(parsed_resume)
    raw_based = _normalize_resume_parse_payload(extract_resume_structured_data(raw_text, fallback_name))
    raw_work_items = normalized.get("work_experiences") if isinstance(normalized.get("work_experiences"), list) else []
    invalid_work_items_detected = False
    for raw_item in raw_work_items:
        normalized_item = _normalize_resume_item(raw_item)
        if normalized_item is None:
            continue
        if not isinstance(normalized_item, dict) or not _is_valid_work_resume_item(normalized_item):
            invalid_work_items_detected = True
            break
    work_structure_was_duplicated = _has_duplicate_work_experience_structure(normalized.get("work_experiences"))
    work_description_was_stringified = _has_stringified_resume_list_field(
        parsed_resume.get("work_experiences") if isinstance(parsed_resume, dict) else [],
        "description",
    )
    project_description_was_stringified = _has_stringified_resume_list_field(
        parsed_resume.get("projects") if isinstance(parsed_resume, dict) else [],
        "description",
    )
    project_highlights_were_stringified = _has_stringified_resume_list_field(
        parsed_resume.get("projects") if isinstance(parsed_resume, dict) else [],
        "highlights",
    )
    work_experiences = _sanitize_resume_list(
        normalized.get("work_experiences"),
        raw_text,
        raw_based.get("work_experiences"),
        limit=8,
        validator=_is_valid_work_resume_item,
        check_primary_support=True,
    )
    education_experiences = _sanitize_resume_list(
        normalized.get("education_experiences"),
        raw_text,
        raw_based.get("education_experiences"),
        limit=6,
        validator=_is_valid_education_resume_item,
        check_primary_support=True,
    )
    work_experiences, work_warnings = _sanitize_work_experiences_for_storage(work_experiences)
    warnings.extend(work_warnings)
    if invalid_work_items_detected and "work_experiences 中存在结构异常的工作经历条目，已过滤" not in warnings:
        warnings.append("work_experiences 中存在结构异常的工作经历条目，已过滤")
    if work_structure_was_duplicated and "work_experiences 存在重复结构，已去重" not in warnings:
        warnings.append("work_experiences 存在重复结构，已去重")
    if work_description_was_stringified and "work_experiences.description 为字符串化列表，已归一" not in warnings:
        warnings.append("work_experiences.description 为字符串化列表，已归一")
    work_experiences, education_experiences = _reconcile_resume_sections(work_experiences, education_experiences)
    skills = _sanitize_resume_list(
        normalized.get("skills"),
        raw_text,
        raw_based.get("skills"),
        limit=20,
        allow_short=True,
        check_primary_support=True,
    )
    skills, skill_warnings = _sanitize_parse_skills_for_storage(skills)
    warnings.extend(skill_warnings)
    projects = _sanitize_resume_list(
        normalized.get("projects"),
        raw_text,
        raw_based.get("projects"),
        limit=6,
        validator=_is_valid_project_resume_item,
        check_primary_support=True,
    )
    projects, project_warnings = _sanitize_projects_for_storage(projects)
    warnings.extend(project_warnings)
    if project_description_was_stringified and "projects.description 为字符串化列表，已归一" not in warnings:
        warnings.append("projects.description 为字符串化列表，已归一")
    if project_highlights_were_stringified and "projects.highlights 为字符串化列表，已归一" not in warnings:
        warnings.append("projects.highlights 为字符串化列表，已归一")
    sanitized_payload = {
        "basic_info": _sanitize_resume_basic_info(
            normalized.get("basic_info"),
            raw_based.get("basic_info"),
            raw_text,
            education_experiences,
        ),
        "work_experiences": work_experiences,
        "education_experiences": education_experiences,
        "skills": skills,
        "projects": projects,
        "summary": normalized.get("summary") or raw_based.get("summary") or "",
    }
    return sanitized_payload, _dedupe_texts(warnings)


def _sanitize_ai_parsed_resume(parsed_resume: Dict[str, Any], raw_text: str, fallback_name: str) -> Dict[str, Any]:
    sanitized_payload, _warnings = _sanitize_ai_parsed_resume_with_meta(parsed_resume, raw_text, fallback_name)
    return sanitized_payload


def _normalize_resume_attachment_name(file_name: Any, file_ext: Any, fallback_stem: str) -> str:
    normalized_name = Path(str(file_name or "").strip() or fallback_stem).name or fallback_stem
    normalized_ext = str(file_ext or "").strip().lower()
    if normalized_ext and not normalized_ext.startswith("."):
        normalized_ext = f".{normalized_ext}"
    current_ext = Path(normalized_name).suffix.lower()
    if normalized_ext and current_ext in {"", ".bin", ".dat", ".tmp"}:
        stem = safe_file_stem(Path(normalized_name).stem or fallback_stem) or fallback_stem
        return f"{stem}{normalized_ext}"
    return normalized_name


def _resolve_resume_attachment_extension(file_name: Any, file_ext: Any, mime_type: Any) -> str:
    normalized_name = _normalize_resume_attachment_name(file_name, file_ext, "resume")
    extension = Path(normalized_name).suffix.lower()
    if extension and extension not in {".bin", ".dat", ".tmp"}:
        return extension
    normalized_mime = str(mime_type or "").strip().lower()
    if normalized_mime:
        guessed_ext = mimetypes.guess_extension(normalized_mime, strict=False)
        if guessed_ext:
            return guessed_ext.lower()
    normalized_ext = str(file_ext or "").strip().lower()
    if normalized_ext:
        return normalized_ext if normalized_ext.startswith(".") else f".{normalized_ext}"
    return ".pdf" if normalized_mime == "application/pdf" else ".bin"


def _normalize_resume_parse_payload(content: Any) -> Dict[str, Any]:
    payload = content if isinstance(content, dict) else {}
    basic_info = payload.get("basic_info") if isinstance(payload.get("basic_info"), dict) else {}
    return {
        "basic_info": basic_info,
        "work_experiences": payload.get("work_experiences") if isinstance(payload.get("work_experiences"), list) else [],
        "education_experiences": payload.get("education_experiences") if isinstance(payload.get("education_experiences"), list) else [],
        "skills": payload.get("skills") if isinstance(payload.get("skills"), list) else [],
        "projects": payload.get("projects") if isinstance(payload.get("projects"), list) else [],
        "summary": str(payload.get("summary") or "").strip(),
    }


def _normalize_resume_score_payload(content: Any) -> Dict[str, Any]:
    payload = content if isinstance(content, dict) else {}
    if isinstance(payload.get("score"), dict):
        payload = payload.get("score") or {}
    advantages = payload.get("advantages")
    concerns = payload.get("concerns")
    dimensions = _normalize_score_dimensions(payload.get("dimensions"), limit=12)
    total_score = _parse_score_number(payload.get("total_score"))
    match_percent = _parse_score_number(payload.get("match_percent"))
    derived_total_score, derived_match_percent = _derive_score_metrics_from_dimensions(dimensions)
    declared_scale = _parse_score_number(payload.get("total_score_scale"))
    total_score_scale = 10 if declared_scale == 10 else 100
    if derived_total_score is not None:
        total_score_scale = 10
        total_score = derived_total_score
        match_percent = derived_match_percent
    if total_score is not None and (declared_scale == 10 or total_score <= 10):
        total_score_scale = 10
        total_score = max(0.0, min(10.0, total_score))
        if match_percent is None:
            match_percent = total_score * 10
        elif match_percent <= 10:
            match_percent = match_percent * 10
    elif total_score is not None:
        total_score_scale = 100
        total_score = max(0.0, min(100.0, total_score))
        if match_percent is None:
            match_percent = total_score
    if match_percent is not None:
        match_percent = max(0.0, min(100.0, match_percent))
    if total_score is None and match_percent is not None:
        if declared_scale == 100:
            total_score_scale = 100
            total_score = match_percent
        else:
            total_score_scale = 10
            total_score = round(match_percent / 10, 1)
    return {
        "total_score": total_score,
        "match_percent": match_percent,
        "advantages": _normalize_score_text_items(advantages, limit=5),
        "concerns": _normalize_score_text_items(concerns, limit=5),
        "recommendation": str(payload.get("recommendation") or "").strip(),
        "suggested_status": _normalize_suggested_status(payload.get("suggested_status")),
    }


DIRTY_BASIC_INFO_VALUES = {",", "，", "-", "--", "null", "none", "未提及", "n/a"}
SUMMARY_EVIDENCE_MARKERS = ("简历中提及", "候选人具备", "体现了", "说明其", "反映出", "可以看出")


def _sanitize_basic_info_value(field: str, value: Any) -> str:
    text = re.sub(r"\s+", " ", strip_markdown(str(value or ""))).strip()
    if not text:
        return ""
    if text.lower() in DIRTY_BASIC_INFO_VALUES or text in DIRTY_BASIC_INFO_VALUES:
        return ""
    if field == "phone":
        compact = re.sub(r"[\s\-()（）]+", "", text)
        if not re.fullmatch(r"\+?\d{6,20}", compact):
            return ""
    if field == "email" and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", text):
        return ""
    return text


def _sanitize_screening_basic_info_payload(basic_info: Any) -> Dict[str, Any]:
    source = basic_info if isinstance(basic_info, dict) else {}
    return {
        field: _sanitize_basic_info_value(field, source.get(field))
        for field in ["name", "phone", "email", "years_of_experience", "education", "location"]
    }


def _extract_resume_text_lines(raw_resume_text: str, *, limit: int = 400) -> List[str]:
    result: List[str] = []

    def push(text: Any) -> None:
        normalized = re.sub(r"\s+", " ", str(text or "")).strip(" \t\r\n,，；;")
        if not normalized:
            return
        if len(normalized) > 240:
            normalized = normalized[:240].rstrip()
        if len(normalized) < 4 or normalized in result:
            return
        result.append(normalized)

    for raw_line in str(raw_resume_text or "").splitlines():
        if len(result) >= limit:
            break
        push(raw_line)
        for segment in re.split(r"[；;]", str(raw_line or "")):
            if len(result) >= limit:
                break
            push(segment)
    return result


def _looks_like_summary_evidence_text(text: Any) -> bool:
    normalized = re.sub(r"\s+", " ", str(text or "")).strip()
    if not normalized:
        return False
    if any(marker in normalized for marker in SUMMARY_EVIDENCE_MARKERS):
        return True
    return bool(re.match(r"^(简历|候选人|该候选人)", normalized))


def _build_dimension_evidence_keywords(label: str, reason: Any, evidence: Sequence[str]) -> List[str]:
    keywords: List[str] = []
    generic_tokens = {
        "经验", "能力", "基础", "相关", "说明", "体现", "具备", "测试", "候选人", "简历",
        "工作", "项目", "系统", "平台", "流程", "问题", "输出", "匹配", "维度", "原文",
    }

    def push(token: Any) -> None:
        normalized = str(token or "").strip().lower()
        normalized = normalized.strip("：:()（）[]【】,.，。；;!！?？\"' ")
        if (
            len(normalized) < 2
            or len(normalized) > 24
            or normalized in generic_tokens
            or normalized in keywords
        ):
            return
        keywords.append(normalized)

    for text in [label, str(reason or ""), *list(evidence or [])]:
        for token in extract_keywords(text):
            push(token)
        for token in re.findall(r"[A-Za-z][A-Za-z0-9+_.-]{1,24}", str(text or "")):
            push(token)
    return keywords[:12]


def _recover_resume_evidence_snippets(
    raw_resume_text: str,
    *,
    label: str,
    reason: Any,
    evidence: Sequence[str],
    limit: int = 2,
) -> List[str]:
    lines = _extract_resume_text_lines(raw_resume_text, limit=500)
    if not lines:
        return []
    keywords = _build_dimension_evidence_keywords(label, reason, evidence)
    if not keywords:
        return []

    ranked: List[Tuple[int, int, str]] = []
    for line in lines:
        lowered_line = _resume_search_text(line)
        hits = [keyword for keyword in keywords if keyword in lowered_line]
        if not hits:
            continue
        ranked.append((len(hits), len(line), line))

    ranked.sort(key=lambda item: (-item[0], item[1]))
    result: List[str] = []
    for _, _, line in ranked:
        if line not in result:
            result.append(line)
        if len(result) >= limit:
            break
    return result


def _recommendation_matches_status(status: Optional[str], recommendation: Optional[str]) -> bool:
    normalized_status = _normalize_suggested_status(status)
    text = _normalize_helper_semantic_text(recommendation)
    if not normalized_status or not text:
        return False
    positive_keywords = {
        "screening_passed": (
            "建议通过初筛",
            "建议安排首面",
            "建议进入下一轮",
            "建议推进",
            "建议面试",
            "建议通过",
        ),
        "talent_pool": (
            "建议进入人才池",
            "建议保留观察",
            "建议后续评估",
            "建议储备",
            "建议暂缓",
        ),
        "screening_rejected": (
            "建议不安排面试",
            "建议淘汰",
            "建议不通过",
            "本次不建议推进",
        ),
    }
    conflict_keywords = {
        "screening_passed": (
            "不建议",
            "不通过",
            "淘汰",
            "保留观察",
            "人才池",
            "人才库",
        ),
        "talent_pool": (
            "通过初筛",
            "安排首面",
            "不安排面试",
            "淘汰",
        ),
        "screening_rejected": (
            "通过初筛",
            "安排首面",
            "人才池",
            "人才库",
            "保留观察",
        ),
    }
    if _contains_any_semantic_keyword(text, conflict_keywords.get(normalized_status, ())):
        return False
    if _contains_any_semantic_keyword(text, positive_keywords.get(normalized_status, ())):
        return True
    return True


def _sanitize_dimension_against_resume(
    item: Dict[str, Any],
    *,
    raw_resume_text: str,
) -> Tuple[Dict[str, Any], List[str]]:
    label = str(item.get("label") or "").strip() or "未命名维度"
    score = _parse_score_number(item.get("score")) or 0.0
    max_score = _parse_score_number(item.get("max_score")) or 0.0
    reason = _normalize_score_summary_text(item.get("reason")) or ""
    evidence_items = _normalize_score_text_items(item.get("evidence"), limit=2)
    warnings: List[str] = []

    if reason == "简历未提及":
        evidence_items = []

    valid_evidence: List[str] = []
    suspicious_evidence: List[str] = []
    for evidence in evidence_items:
        if evidence == "简历未提及":
            continue
        if _looks_like_summary_evidence_text(evidence) or not _resume_item_supported(evidence, raw_resume_text, allow_short=True):
            suspicious_evidence.append(evidence)
        elif evidence not in valid_evidence:
            valid_evidence.append(evidence)

    if suspicious_evidence or (score > 0 and not valid_evidence):
        recovered = _recover_resume_evidence_snippets(
            raw_resume_text,
            label=label,
            reason=reason,
            evidence=[*valid_evidence, *suspicious_evidence],
            limit=2,
        )
        for snippet in recovered:
            if snippet not in valid_evidence:
                valid_evidence.append(snippet)
        if suspicious_evidence and recovered:
            warnings.append(f"{label} 的 evidence 不是简历原文摘录，已尝试替换为 resume_text 原文片段。")

    if score > 0 and not valid_evidence:
        warnings.append(f"{label} 缺少可验证的简历原文 evidence，当前已按“简历未提及”回退该维度。")
        score = 0.0
        reason = "简历未提及"
    elif score <= 0 and reason == "简历未提及":
        valid_evidence = []
    elif score <= 0 and not valid_evidence:
        reason = "简历未提及"
    elif score > 0 and (not reason or reason == "简历未提及"):
        reason = _build_dimension_reason_summary(label, score=score, max_score=max_score, raw_reason="", evidence=valid_evidence)

    if reason == "简历未提及":
        valid_evidence = []

    return {
        "label": label,
        "score": round(score + 1e-9, 1),
        "max_score": max_score,
        "weight_text": item.get("weight_text"),
        "is_core": bool(item.get("is_core")),
        "reason": reason or "简历未提及",
        "evidence": valid_evidence[:2],
    }, warnings


def sanitize_and_validate_screening_result(
    *,
    parsed_resume: Dict[str, Any],
    score_payload: Dict[str, Any],
    raw_resume_text: str,
    expected_dimensions: Sequence[Dict[str, Any]],
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    sanitized_payload, meta = sanitize_screening_payload(
        {
            "parsed_resume": parsed_resume,
            "score": score_payload,
        },
        SCREENING_PAYLOAD_SCHEMA_CONFIG,
    )
    return (
        sanitized_payload.get("parsed_resume") or {},
        sanitized_payload.get("score") or {},
        {
            "warnings": _normalize_score_warning_items(meta.get("warnings"), limit=12),
        },
    )


def _has_resume_parse_content(content: Any) -> bool:
    return isinstance(content, dict) and any(key in content for key in ["basic_info", "work_experiences", "education_experiences", "skills", "projects", "summary"])


def _has_resume_score_content(content: Any) -> bool:
    return isinstance(content, dict) and any(key in content for key in ["total_score", "match_percent", "advantages", "concerns", "recommendation", "suggested_status"])


def _is_json_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _validate_screening_basic_info_payload(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("AI 返回的 screening JSON 非法：parsed_resume.basic_info 不是对象")
    result: Dict[str, Any] = {}
    for field in ["name", "phone", "email", "years_of_experience", "education", "location"]:
        item = value.get(field)
        if not isinstance(item, str):
            raise ValueError(f"AI 返回的 screening JSON 非法：parsed_resume.basic_info.{field} 类型错误")
        result[field] = item
    return result


def _validate_screening_parsed_resume_payload(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("AI 返回的 screening JSON 非法：parsed_resume 不是对象")
    basic_info = _validate_screening_basic_info_payload(value.get("basic_info"))
    work_experiences = value.get("work_experiences")
    education_experiences = value.get("education_experiences")
    skills = value.get("skills")
    projects = value.get("projects")
    summary = value.get("summary")
    if not isinstance(work_experiences, list):
        raise ValueError("AI 返回的 screening JSON 非法：parsed_resume.work_experiences 不是数组")
    if not isinstance(education_experiences, list):
        raise ValueError("AI 返回的 screening JSON 非法：parsed_resume.education_experiences 不是数组")
    if not isinstance(skills, list):
        raise ValueError("AI 返回的 screening JSON 非法：parsed_resume.skills 不是数组")
    if not isinstance(projects, list):
        raise ValueError("AI 返回的 screening JSON 非法：parsed_resume.projects 不是数组")
    if not isinstance(summary, str):
        raise ValueError("AI 返回的 screening JSON 非法：parsed_resume.summary 类型错误")
    return {
        "basic_info": basic_info,
        "work_experiences": work_experiences,
        "education_experiences": education_experiences,
        "skills": skills,
        "projects": projects,
        "summary": summary,
    }


def _validate_screening_dimension_item(value: Any, *, index: int) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"AI 返回的 screening JSON 非法：score.dimensions[{index}] 不是对象")
    label = value.get("label")
    score = value.get("score")
    max_score = value.get("max_score")
    reason = value.get("reason")
    evidence = value.get("evidence")
    if not isinstance(label, str):
        raise ValueError(f"AI 返回的 screening JSON 非法：score.dimensions[{index}].label 类型错误")
    if not _is_json_number(score):
        raise ValueError(f"AI 返回的 screening JSON 非法：score.dimensions[{index}].score 类型错误")
    if not _is_json_number(max_score):
        raise ValueError(f"AI 返回的 screening JSON 非法：score.dimensions[{index}].max_score 类型错误")
    if not isinstance(reason, str):
        raise ValueError(f"AI 返回的 screening JSON 非法：score.dimensions[{index}].reason 类型错误")
    if not (
        isinstance(evidence, str)
        or (
            isinstance(evidence, list)
            and all(isinstance(item, str) for item in evidence)
        )
    ):
        raise ValueError(f"AI 返回的 screening JSON 非法：score.dimensions[{index}].evidence 类型错误")
    normalized: Dict[str, Any] = {
        "label": label,
        "score": float(score),
        "max_score": float(max_score),
        "reason": reason,
        "evidence": evidence,
    }
    if "is_inferred" in value:
        normalized["is_inferred"] = bool(value.get("is_inferred"))
    if "weight_text" in value:
        normalized["weight_text"] = value.get("weight_text")
    if "is_core" in value:
        normalized["is_core"] = bool(value.get("is_core"))
    return normalized


def _validate_screening_score_payload(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("AI 返回的 screening JSON 非法：score 不是对象")
    total_score = value.get("total_score")
    match_percent = value.get("match_percent")
    advantages = value.get("advantages")
    concerns = value.get("concerns")
    recommendation = value.get("recommendation")
    suggested_status = value.get("suggested_status")
    dimensions = value.get("dimensions")
    if not _is_json_number(total_score):
        raise ValueError("AI 返回的 screening JSON 非法：score.total_score 类型错误")
    if not _is_json_number(match_percent):
        raise ValueError("AI 返回的 screening JSON 非法：score.match_percent 类型错误")
    if not isinstance(advantages, list) or not all(isinstance(item, str) for item in advantages):
        raise ValueError("AI 返回的 screening JSON 非法：score.advantages 类型错误")
    if not isinstance(concerns, list) or not all(isinstance(item, str) for item in concerns):
        raise ValueError("AI 返回的 screening JSON 非法：score.concerns 类型错误")
    if not isinstance(recommendation, str):
        raise ValueError("AI 返回的 screening JSON 非法：score.recommendation 类型错误")
    if not isinstance(suggested_status, str) or suggested_status not in VALID_SCREENING_SUGGESTED_STATUSES:
        raise ValueError("AI 返回的 screening JSON 非法：score.suggested_status 不在合法枚举内")
    if not isinstance(dimensions, list):
        raise ValueError("AI 返回的 screening JSON 非法：score.dimensions 不是数组")
    normalized_dimensions = [
        _validate_screening_dimension_item(item, index=index)
        for index, item in enumerate(dimensions)
    ]
    return {
        "total_score": float(total_score),
        "match_percent": float(match_percent),
        "advantages": list(advantages),
        "concerns": list(concerns),
        "recommendation": recommendation,
        "suggested_status": suggested_status,
        "dimensions": normalized_dimensions,
    }


def _validate_primary_screening_response(value: Any) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    if not isinstance(value, dict):
        raise ValueError("AI 返回的 screening JSON 非法：根对象不是 JSON object")
    parsed_resume = _validate_screening_parsed_resume_payload(value.get("parsed_resume"))
    score = _validate_screening_score_payload(value.get("score"))
    return parsed_resume, score


def _validate_primary_score_only_response(value: Any) -> Dict[str, Any]:
    payload = _extract_model_score_payload(value)
    return _validate_screening_score_payload(payload)


def _looks_like_empty_screening_score_payload(
    score_payload: Any,
    schema_config: Dict[str, Any],
    *,
    validation_warnings: Optional[Sequence[Any]] = None,
) -> bool:
    if not isinstance(score_payload, dict):
        return False
    total_score = _parse_score_number(score_payload.get("total_score")) or 0.0
    match_percent = _parse_score_number(score_payload.get("match_percent")) or 0.0
    advantages = _normalize_score_text_items(score_payload.get("advantages"), limit=5)
    concerns = _normalize_score_text_items(score_payload.get("concerns"), limit=5)
    recommendation = _compact_recommendation(score_payload.get("recommendation"))
    dimensions = score_payload.get("dimensions") if isinstance(score_payload.get("dimensions"), list) else []
    nonzero_dimension_count = 0
    nonzero_evidenced_dimension_count = 0
    for item in dimensions:
        if not isinstance(item, dict):
            continue
        numeric_score = _parse_score_number(item.get("score")) or 0.0
        if numeric_score <= 0:
            continue
        nonzero_dimension_count += 1
        if _dimension_has_effective_evidence(item.get("evidence")):
            nonzero_evidenced_dimension_count += 1
    required_dimension_labels = {
        str(item or "").strip()
        for item in ((schema_config.get("score") or {}).get("required_dimension_labels") or [])
        if str(item or "").strip()
    }
    actual_dimension_labels = {
        str(item.get("label") or "").strip()
        for item in dimensions
        if isinstance(item, dict) and str(item.get("label") or "").strip()
    }
    missing_required_dimensions = bool(required_dimension_labels - actual_dimension_labels)
    blocking_warning_present = any(
        "Skill/JD 规则文本" in str(item or "")
        or "评分规则说明文本" in str(item or "")
        for item in _normalize_score_warning_items(validation_warnings, limit=12)
    )
    return (
        total_score <= 0.0
        and match_percent <= 0.0
        and not recommendation
        and not advantages
        and not concerns
        and nonzero_dimension_count == 0
        and nonzero_evidenced_dimension_count == 0
        and not blocking_warning_present
        and (missing_required_dimensions or bool(dimensions))
    )


def _is_salvageable_one_pass_invalid_reason(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    salvageable_prefixes = (
        "score.dimensions 缺失或为空",
        "score.dimensions 缺少维度",
        "score.suggested_status 缺失或无效",
        "score.recommendation 缺失或无效",
        "score 为结构完整但内容空壳",
    )
    if any(text.startswith(prefix) for prefix in salvageable_prefixes):
        return True
    if text.startswith("AI 返回的 screening JSON 非法："):
        return any(fragment in text for fragment in salvageable_prefixes)
    return False


def _can_salvage_invalid_one_pass_result(
    *,
    validation_meta: Optional[Dict[str, Any]],
    score_payload: Any,
    schema_config: Dict[str, Any],
    parse_row_available: bool,
    allow_score_only_rerun: bool,
) -> bool:
    if not allow_score_only_rerun or not parse_row_available:
        return False
    normalized_meta = validation_meta if isinstance(validation_meta, dict) else {}
    if normalized_meta.get("screening_result_valid") is True:
        return False
    if normalized_meta.get("primary_model_call_succeeded") is not True:
        return False
    failure_code = str(
        normalized_meta.get("failure_code")
        or normalized_meta.get("screening_result_state")
        or ""
    ).strip()
    if failure_code in {
        "json_parse_failed",
        "invalid_json_variant_conflict",
        "timeout",
        "request_failed",
        "rate_limited",
        "upstream_timeout",
        "retry_exhausted",
        "screening_total_timeout",
    }:
        return False
    reasons = _normalize_score_warning_items(
        [
            *(normalized_meta.get("invalid_result_reasons") or []),
            *(normalized_meta.get("validation_warnings") or []),
            normalized_meta.get("model_schema_violation_reason"),
        ],
        limit=16,
    )
    if any(
        "Skill/JD 规则文本" in item
        or "评分规则说明文本" in item
        for item in reasons
    ):
        return False
    if _looks_like_empty_screening_score_payload(
        score_payload,
        schema_config,
        validation_warnings=reasons,
    ):
        return True
    salvageable_reasons = [item for item in reasons if _is_salvageable_one_pass_invalid_reason(item)]
    return bool(salvageable_reasons) and len(salvageable_reasons) == len(reasons)


def _classify_screening_score_validity(
    score_payload: Any,
    schema_config: Dict[str, Any],
    *,
    validation_warnings: Optional[Sequence[Any]] = None,
) -> Tuple[bool, List[str]]:
    reasons: List[str] = []
    if not isinstance(score_payload, dict):
        return False, ["score 对象缺失或不是合法 JSON object"]

    dimensions = score_payload.get("dimensions") if isinstance(score_payload.get("dimensions"), list) else []
    if not dimensions:
        reasons.append("score.dimensions 缺失或为空")

    required_dimension_labels = [
        str(item or "").strip()
        for item in ((schema_config.get("score") or {}).get("required_dimension_labels") or [])
        if str(item or "").strip()
    ]
    if required_dimension_labels:
        actual_dimension_labels = {
            str(item.get("label") or "").strip()
            for item in dimensions
            if isinstance(item, dict) and str(item.get("label") or "").strip()
        }
        missing_dimension_labels = [label for label in required_dimension_labels if label not in actual_dimension_labels]
        if missing_dimension_labels:
            reasons.append(f"score.dimensions 缺少维度：{'、'.join(missing_dimension_labels[:8])}")

    if not _normalize_suggested_status(score_payload.get("suggested_status")):
        reasons.append("score.suggested_status 缺失或无效")
    if not _compact_recommendation(score_payload.get("recommendation")):
        reasons.append("score.recommendation 缺失或无效")
    if _looks_like_empty_screening_score_payload(
        score_payload,
        schema_config,
        validation_warnings=validation_warnings,
    ):
        reasons.append("score 为结构完整但内容空壳")

    for warning in _normalize_score_warning_items(validation_warnings, limit=8):
        if (
            warning.startswith("score.dimensions 缺失或为空")
            or warning.startswith("score.dimensions 缺少维度")
            or warning.startswith("score.suggested_status 缺失或无效")
            or warning.startswith("score.recommendation 缺失或无效")
            or warning.startswith("score 为结构完整但内容空壳")
            or "Skill/JD 规则文本" in warning
            or "评分规则说明文本" in warning
        ):
            reasons.append(warning)

    normalized_reasons: List[str] = []
    seen_reason_keys: set[str] = set()
    for item in reasons:
        text = str(item or "").strip()
        normalized_key = re.sub(r"[。；;，,\s]+$", "", text)
        if not normalized_key or normalized_key in seen_reason_keys:
            continue
        seen_reason_keys.add(normalized_key)
        normalized_reasons.append(normalized_key)
    return (not normalized_reasons), normalized_reasons


def _extract_screening_score_payload_from_row(score_row: Any) -> Dict[str, Any]:
    payload = _decode_ai_task_json_text(getattr(score_row, "score_json", None), {})
    if isinstance(payload, dict) and payload.get("_storage_format") == RAW_SCREENING_SCORE_STORAGE_FORMAT:
        return dict(payload.get("score") or {})
    if isinstance(payload, dict):
        score_payload = payload.get("score")
        if isinstance(score_payload, dict):
            return dict(score_payload)
    return {}


def _build_raw_screening_storage_payload(
    *,
    score_payload: Dict[str, Any],
    score_source: str,
    primary_model_call_succeeded: bool,
    final_response_source: str,
    validation_warnings: Optional[Sequence[Any]] = None,
    raw_response_text: Optional[str] = None,
    parsed_response_payload: Optional[Dict[str, Any]] = None,
    sanitized_score_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_validation_warnings = _normalize_score_warning_items(validation_warnings, limit=8)
    return {
        "_storage_format": RAW_SCREENING_SCORE_STORAGE_FORMAT,
        "score": score_payload,
        "authoritative": {
            "raw_response_text": str(raw_response_text or "").strip() or None,
            "parsed_response": parsed_response_payload if isinstance(parsed_response_payload, dict) else None,
            "sanitized_score": sanitized_score_payload if isinstance(sanitized_score_payload, dict) else None,
        },
        "debug": {
            "score_source": str(score_source or "").strip() or None,
            "primary_model_call_succeeded": bool(primary_model_call_succeeded),
            "final_response_source": str(final_response_source or "").strip() or None,
            "score_validation_passed": not bool(normalized_validation_warnings),
            "validation_warnings": normalized_validation_warnings,
        },
    }


def _build_screening_output_summary(
    *,
    parsed_resume: Optional[Dict[str, Any]] = None,
    score_payload: Optional[Dict[str, Any]] = None,
) -> str:
    summary_payload: Dict[str, Any] = {}
    if isinstance(parsed_resume, dict):
        summary_payload["parsed_resume"] = parsed_resume
    if isinstance(score_payload, dict):
        summary_payload["score"] = score_payload
    if not summary_payload:
        return ""
    return truncate_text(json_dumps_safe(summary_payload), 600)


def _distill_dimension_rules(
    skill_snapshots: Sequence[Dict[str, Any]],
    *,
    limit: int = 12,
) -> List[Dict[str, Any]]:
    distilled: List[Dict[str, Any]] = []
    for item in extract_screening_dimension_rules(skill_snapshots, limit=limit):
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        distilled.append(
            {
                "label": label,
                "max_score": round(float(_parse_score_number(item.get("max_score")) or 0.0), 1),
                "is_core": bool(item.get("is_core")),
                "note": str(item.get("note") or "").strip(),
            }
        )
        if len(distilled) >= limit:
            break
    return distilled


def _build_score_rule_snapshot(
    skill_snapshots: Sequence[Dict[str, Any]],
    *,
    limit: int = 12,
) -> List[Dict[str, Any]]:
    snapshots: List[Dict[str, Any]] = []
    seen_labels: set[str] = set()
    for skill in skill_snapshots or []:
        if not isinstance(skill, dict):
            continue
        skill_rules = extract_screening_dimension_rules([skill], limit=limit)
        for item in skill_rules:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or "").strip()
            if not label or label in seen_labels:
                continue
            seen_labels.add(label)
            try:
                skill_id = int(skill.get("id") or 0)
            except (TypeError, ValueError, AttributeError):
                skill_id = 0
            snapshots.append(
                {
                    "skill_id": skill_id or None,
                    "skill_name": str(skill.get("name") or "").strip() or None,
                    "label": label,
                    "max_score": round(float(_parse_score_number(item.get("max_score")) or 0.0), 1),
                    "is_core": bool(item.get("is_core")),
                    "note": str(item.get("note") or "").strip(),
                }
            )
            if len(snapshots) >= limit:
                return snapshots[:limit]
    return snapshots[:limit]


def _build_skill_resolution_detail(
    *,
    requested_skill_ids: Optional[Iterable[Any]] = None,
    resolved_skill_rows: Optional[Sequence[RecruitmentSkill]] = None,
    resolved_skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
    position_screening_skill_ids: Optional[Iterable[Any]] = None,
    workflow_memory_skill_ids: Optional[Iterable[Any]] = None,
    task_snapshot_skill_ids: Optional[Iterable[Any]] = None,
    used_position_skills: bool = False,
    used_candidate_memory: bool = False,
    used_task_snapshot: bool = False,
    explicit_skill_ids_empty: bool = False,
) -> Dict[str, Any]:
    resolved_skill_ids: List[int] = []
    resolved_skill_names: List[str] = []
    if resolved_skill_rows is not None:
        for row in resolved_skill_rows:
            if row.id and row.id not in resolved_skill_ids:
                resolved_skill_ids.append(int(row.id))
            name = str(row.name or "").strip()
            if name and name not in resolved_skill_names:
                resolved_skill_names.append(name)
    else:
        for item in resolved_skill_snapshots or []:
            if not isinstance(item, dict):
                continue
            try:
                skill_id = int(item.get("id") or 0)
            except (TypeError, ValueError, AttributeError):
                skill_id = 0
            if skill_id > 0 and skill_id not in resolved_skill_ids:
                resolved_skill_ids.append(skill_id)
            skill_name = str(item.get("name") or "").strip()
            if skill_name and skill_name not in resolved_skill_names:
                resolved_skill_names.append(skill_name)

    detail = {
        "requested_skill_ids": _dedupe_ints(requested_skill_ids or []),
        "resolved_skill_ids": resolved_skill_ids,
        "resolved_skill_names": resolved_skill_names,
        "position_screening_skill_ids": _dedupe_ints(position_screening_skill_ids or []),
        "workflow_memory_skill_ids": _dedupe_ints(workflow_memory_skill_ids or []),
        "task_snapshot_skill_ids": _dedupe_ints(task_snapshot_skill_ids or []),
        "used_position_skills": bool(used_position_skills),
        "used_candidate_memory": bool(used_candidate_memory),
        "used_task_snapshot": bool(used_task_snapshot),
    }
    empty_reasons: List[str] = []
    if not resolved_skill_ids:
        if explicit_skill_ids_empty:
            empty_reasons.append("显式 skill_ids 为空")
        if not detail["position_screening_skill_ids"]:
            empty_reasons.append("岗位未绑定 screening skills")
        if not detail["workflow_memory_skill_ids"]:
            empty_reasons.append("workflow memory 无 screening skills")
        if used_task_snapshot and not detail["task_snapshot_skill_ids"]:
            empty_reasons.append("task snapshot 无 skill data")
        if not empty_reasons:
            empty_reasons.append("最终解析结果为空")
    detail["empty_reasons"] = empty_reasons
    return detail


def _build_status_threshold_payload(status_rules: Optional[Dict[str, Any]]) -> Dict[str, float]:
    rules = status_rules if isinstance(status_rules, dict) else {}
    return {
        "pass_threshold": round(float(_parse_score_number(rules.get("pass_threshold")) or 75.0), 1),
        "pool_threshold": round(float(_parse_score_number(rules.get("pool_threshold")) or 55.0), 1),
    }


def _extract_custom_requirements_from_skill_snapshots(skill_snapshots: Sequence[Dict[str, Any]]) -> str:
    for item in skill_snapshots:
        if not isinstance(item, dict):
            continue
        skill_code = str(item.get("skill_code") or "").strip().lower()
        if skill_code == "custom-hard-requirement":
            return str(item.get("content") or "").strip()
    return ""


def _build_screening_task_progress_snapshot(
    stage: str,
    *,
    message: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "stage": str(stage or "").strip() or "running",
        "heartbeat_at": datetime.now().isoformat(),
    }
    if message:
        payload["message"] = str(message).strip()
        payload["current_stage_message"] = str(message).strip()
    if isinstance(extra, dict):
        for key, value in extra.items():
            if value is None:
                continue
            payload[key] = value
    return payload


def _classify_screening_task_failure(exc: Exception) -> Tuple[str, str]:
    if isinstance(exc, RecruitmentAIScreeningTotalTimeoutError):
        return "screening_total_timeout", str(exc) or f"初筛总耗时超过 {int(SCREENING_TOTAL_TIMEOUT_SECONDS)} 秒，已终止"
    if isinstance(exc, RecruitmentAIJSONParseError):
        if str(getattr(exc, "error_code", "") or "").strip() == "invalid_json_variant_conflict":
            return "invalid_json_variant_conflict", str(exc) or "AI 返回了冲突的 JSON 版本。"
        if str(getattr(exc, "error_code", "") or "").strip() == "empty_response":
            return "json_parse_failed", str(exc) or "AI 返回了空响应内容。"
        return "json_parse_failed", str(exc) or "AI 返回了无法解析的 JSON。"
    failure_code, failure_message = _classify_infra_failure(exc)
    if failure_code == "rate_limited":
        return "rate_limited", failure_message
    if failure_code == "upstream_timeout":
        return "upstream_timeout", failure_message
    if failure_code == "request_failed":
        return "request_failed", failure_message
    if isinstance(exc, RecruitmentAIRetryExhaustedError):
        return "retry_exhausted", str(exc) or "AI 请求重试后仍失败。"
    return "failed", str(exc) or "AI 任务执行失败。"


class RecruitmentService:
    def __init__(self, db: Session):
        self.db = db
        self.ai_gateway = RecruitmentAIGateway(db)
        self.permission_context: Optional[PermissionContext] = None

    def set_permission_context(self, session: Optional[Dict[str, Any]]) -> "RecruitmentService":
        self.permission_context = build_permission_context(self.db, session)
        self.ai_gateway.set_permission_context(self.permission_context)
        return self

    def _current_org_code(self) -> str:
        if self.permission_context:
            return self.permission_context.primary_org_code
        return ROOT_ORG_CODE

    def _can_access_org_resource(self, row: Any) -> bool:
        if not self.permission_context:
            return True
        return resource_is_visible_to_context(
            self.db,
            self.permission_context,
            resource_org_code=getattr(row, "org_code", ROOT_ORG_CODE),
            share_policy=getattr(row, "share_policy", "PRIVATE"),
            allow_sub_org_use=getattr(row, "allow_sub_org_use", False),
        )

    def _apply_business_org_filter(self, builder: Any, model: Any) -> Any:
        if not self.permission_context or self.permission_context.has_all_orgs:
            return builder
        org_codes = list(self.permission_context.visible_org_codes or ())
        if hasattr(model, "org_code"):
            builder = builder.filter(model.org_code.in_(org_codes))
        if self.permission_context.is_self_scope and hasattr(model, "created_by"):
            builder = builder.filter(model.created_by == self.permission_context.actor_user_code)
        return builder

    def _assert_business_row_visible(self, row: Any) -> None:
        if not self.permission_context or self.permission_context.has_all_orgs:
            return
        row_org_code = normalize_org_code(getattr(row, "org_code", None))
        if row_org_code not in set(self.permission_context.visible_org_codes or ()):
            raise ValueError("操作失败")
        owner = getattr(row, "created_by", None) or getattr(row, "uploaded_by", None)
        if self.permission_context.is_self_scope and owner != self.permission_context.actor_user_code:
            raise ValueError("操作失败")

    def _assert_resource_manageable(self, row: Any, actor_id: str) -> None:
        if not self.permission_context or self.permission_context.has_all_orgs:
            return
        row_org_code = normalize_org_code(getattr(row, "org_code", None))
        if row_org_code in set(self.permission_context.visible_org_codes or ()):
            return
        if getattr(row, "created_by", None) == actor_id:
            return
        raise ValueError("鎿嶄綔澶辫触")

    def _assert_resource_copyable(self, row: Any) -> None:
        if not self._can_access_org_resource(row):
            raise ValueError("鎿嶄綔澶辫触")
        if normalize_share_policy(getattr(row, "share_policy", None)) != SHARE_POLICY_SHARED_COPYABLE:
            raise ValueError("资源不允许复制")
        if not bool(getattr(row, "allow_copy", False)):
            raise ValueError("资源不允许复制")

    def _assert_can_create_in_org(self, org_code: str) -> None:
        if not self.permission_context or self.permission_context.has_all_orgs:
            return
        if normalize_org_code(org_code) not in set(self.permission_context.visible_org_codes or ()):
            raise ValueError("鎿嶄綔澶辫触")

    def _build_request_hash(self, *parts: Any) -> str:
        raw = "||".join([str(part or "") for part in parts])
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]

    def _get_ai_task_log_row(self, task_id: int) -> RecruitmentAITaskLog:
        row = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.id == task_id).first()
        if not row:
            raise ValueError("操作失败")
        return row

    def _raise_if_cancelled(self, cancel_control: Optional[RecruitmentTaskControl]) -> None:
        if cancel_control:
            cancel_control.raise_if_cancelled()

    def _get_screening_runtime_signature(self, *, task_type: str = "resume_score") -> Dict[str, Any]:
        runtime = self.ai_gateway.resolve_config(task_type)
        return {
            "provider": str(getattr(runtime, "provider", "") or "").strip() or None,
            "model_name": str(getattr(runtime, "model_name", "") or "").strip() or None,
            "temperature": 0,
        }

    def _resolve_initial_ai_task_runtime(self, task_type: Optional[str]) -> Dict[str, Optional[str]]:
        normalized_task_type = str(task_type or "").strip()
        if not normalized_task_type or normalized_task_type in {
            SCREENING_FLOW_TASK_TYPE,
            "resume_mail_dispatch",
            "publish_task",
        }:
            return {"provider": None, "model_name": None}
        try:
            runtime = self.ai_gateway.resolve_config(normalized_task_type)
        except Exception:
            logger.exception("Failed to resolve initial AI task runtime for task_type=%s", normalized_task_type)
            return {"provider": None, "model_name": None}
        return {
            "provider": str(getattr(runtime, "provider", "") or "").strip() or None,
            "model_name": str(getattr(runtime, "model_name", "") or "").strip() or None,
        }

    def _build_screening_request_meta(
        self,
        *,
        candidate: RecruitmentCandidate,
        resume_file_id: int,
        raw_resume_text: str,
        score_rule_snapshot: Sequence[Dict[str, Any]],
        custom_requirements: str,
        prompt_version: str,
        screening_mode: str,
        request_scope: str,
        model_task_type: str = "resume_score",
    ) -> Dict[str, Any]:
        position_snapshot = self._get_position_screening_payload(candidate) or {}
        runtime_signature = self._get_screening_runtime_signature(task_type=model_task_type)
        resume_text_hash = _build_resume_content_hash(raw_resume_text)
        position_snapshot_hash = _build_json_content_hash(position_snapshot)
        score_rule_snapshot_hash = _build_json_content_hash(list(score_rule_snapshot or []))
        custom_requirements_hash = _build_resume_content_hash(custom_requirements)
        request_hash = self._build_request_hash(
            request_scope,
            resume_file_id,
            resume_text_hash,
            candidate.position_id or 0,
            position_snapshot_hash,
            score_rule_snapshot_hash,
            custom_requirements_hash,
            prompt_version,
            runtime_signature.get("model_name") or "",
            runtime_signature.get("temperature") or 0,
        )
        return {
            "request_hash": request_hash,
            "request_scope": request_scope,
            "screening_mode": screening_mode,
            "resume_file_id": int(resume_file_id),
            "raw_resume_text_hash": resume_text_hash,
            "position_id": candidate.position_id,
            "position_snapshot_hash": position_snapshot_hash,
            "position_snapshot": position_snapshot,
            "score_rule_snapshot_hash": score_rule_snapshot_hash,
            "custom_requirements_hash": custom_requirements_hash,
            "prompt_version": prompt_version,
            "provider": runtime_signature.get("provider"),
            "model_name": runtime_signature.get("model_name"),
            "temperature": runtime_signature.get("temperature"),
        }

    def _extract_screening_request_meta_from_task(self, row: Optional[RecruitmentAITaskLog]) -> Dict[str, Any]:
        if not row:
            return {}
        snapshot = _decode_ai_task_json_text(getattr(row, "output_snapshot", None), {})
        if not isinstance(snapshot, dict):
            return {}
        request_meta = snapshot.get("request_meta")
        return dict(request_meta) if isinstance(request_meta, dict) else {}

    def _load_reusable_screening_result(
        self,
        *,
        request_hash: str,
        candidate_id: Optional[int] = None,
        limit: int = 8,
    ) -> Optional[Dict[str, Any]]:
        if not request_hash:
            return None
        builder = self.db.query(RecruitmentAITaskLog).filter(
            self._screening_root_task_filter(),
            RecruitmentAITaskLog.request_hash == request_hash,
        )
        if candidate_id:
            builder = builder.filter(RecruitmentAITaskLog.related_candidate_id == candidate_id)
        rows = builder.order_by(
            RecruitmentAITaskLog.created_at.desc(),
            RecruitmentAITaskLog.id.desc(),
        ).limit(max(1, limit)).all()
        for row in rows:
            validation_meta = _decode_ai_task_json_text(getattr(row, "validation_meta_json", None), {})
            if not isinstance(validation_meta, dict) or validation_meta.get("screening_result_valid") is not True:
                continue
            persisted_refs = _decode_ai_task_json_text(getattr(row, "persisted_result_refs_json", None), {})
            if not isinstance(persisted_refs, dict):
                persisted_refs = {}
            try:
                parse_result_id = int(persisted_refs.get("parse_result_id") or 0)
            except Exception:
                parse_result_id = 0
            try:
                score_result_id = int(persisted_refs.get("score_result_id") or 0)
            except Exception:
                score_result_id = 0
            if not parse_result_id or not score_result_id:
                continue
            parse_row = self.db.query(RecruitmentResumeParseResult).filter(
                RecruitmentResumeParseResult.id == parse_result_id,
            ).first()
            score_row = self.db.query(RecruitmentCandidateScore).filter(
                RecruitmentCandidateScore.id == score_result_id,
            ).first()
            if not parse_row or not score_row:
                continue
            return {
                "root_log": row,
                "parse_row": parse_row,
                "score_row": score_row,
                "validation_meta": validation_meta,
                "request_meta": self._extract_screening_request_meta_from_task(row),
            }
        return None

    def _get_latest_valid_screening_result_for_candidate(
        self,
        candidate_id: int,
        *,
        limit: int = 8,
    ) -> Optional[Dict[str, Any]]:
        rows = self.db.query(RecruitmentAITaskLog).filter(
            self._screening_root_task_filter(),
            RecruitmentAITaskLog.related_candidate_id == candidate_id,
        ).order_by(
            RecruitmentAITaskLog.created_at.desc(),
            RecruitmentAITaskLog.id.desc(),
        ).limit(max(1, limit)).all()
        for row in rows:
            validation_meta = _decode_ai_task_json_text(getattr(row, "validation_meta_json", None), {})
            if isinstance(validation_meta, dict) and validation_meta.get("screening_result_valid") is True:
                return {
                    "root_log": row,
                    "validation_meta": validation_meta,
                    "request_meta": self._extract_screening_request_meta_from_task(row),
                }
        return None

    def _should_rerank_from_existing_parse(
        self,
        *,
        allow_score_only_rerun: bool,
        parse_row: Optional[RecruitmentResumeParseResult],
        current_request_meta: Dict[str, Any],
        previous_request_meta: Dict[str, Any],
    ) -> bool:
        if not allow_score_only_rerun or not parse_row:
            return False
        if not current_request_meta or not previous_request_meta:
            return False
        stable_keys = (
            "resume_file_id",
            "raw_resume_text_hash",
            "position_id",
            "position_snapshot_hash",
            "model_name",
            "temperature",
        )
        if any(current_request_meta.get(key) != previous_request_meta.get(key) for key in stable_keys):
            return False
        changed_score_context = any(
            current_request_meta.get(key) != previous_request_meta.get(key)
            for key in ("score_rule_snapshot_hash", "custom_requirements_hash")
        )
        return changed_score_context

    @contextmanager
    def _acquire_screening_provider_slot(
        self,
        *,
        cancel_control: Optional[RecruitmentTaskControl] = None,
    ) -> Iterable[None]:
        acquired = False
        while not acquired:
            self._raise_if_cancelled(cancel_control)
            acquired = _screening_provider_semaphore.acquire(timeout=0.25)
        try:
            while True:
                self._raise_if_cancelled(cancel_control)
                wait_seconds = 0.0
                with _screening_provider_lock:
                    now = time.monotonic()
                    while _screening_provider_recent_request_started_at and (now - _screening_provider_recent_request_started_at[0]) >= 1.0:
                        _screening_provider_recent_request_started_at.popleft()
                    if len(_screening_provider_recent_request_started_at) < SCREENING_PROVIDER_QPS:
                        _screening_provider_recent_request_started_at.append(now)
                        break
                    wait_seconds = max(0.01, 1.0 - (now - _screening_provider_recent_request_started_at[0]))
                time.sleep(min(wait_seconds, 0.25))
            yield
        finally:
            _screening_provider_semaphore.release()

    def _record_screening_provider_result(self, *, failure_code: Optional[str] = None) -> None:
        global _screening_provider_cooldown_until
        global _screening_provider_consecutive_retryable_failures
        normalized_failure_code = str(failure_code or "").strip()
        if normalized_failure_code in {"rate_limited", "upstream_timeout"}:
            with _screening_provider_lock:
                _screening_provider_consecutive_retryable_failures += 1
                if _screening_provider_consecutive_retryable_failures >= SCREENING_PROVIDER_COOLDOWN_THRESHOLD:
                    cooldown_seconds = _compute_screening_provider_cooldown_seconds(_screening_provider_consecutive_retryable_failures)
                    next_retry_at = datetime.now() + timedelta(seconds=cooldown_seconds)
                    if _screening_provider_cooldown_until is None or next_retry_at > _screening_provider_cooldown_until:
                        _screening_provider_cooldown_until = next_retry_at
            return
        with _screening_provider_lock:
            _screening_provider_consecutive_retryable_failures = 0

    def _run_screening_provider_json_request(
        self,
        *,
        task_type: str,
        system_prompt: str,
        user_prompt: str,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        runtime_config: Optional[Any] = None,
        timeout_seconds_override: Optional[float] = None,
        screening_total_timeout_seconds: Optional[float] = None,
        remaining_budget_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        try:
            with self._acquire_screening_provider_slot(cancel_control=cancel_control):
                task = self.ai_gateway.generate_json(
                    task_type=task_type,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    cancel_control=cancel_control,
                    runtime_config=runtime_config,
                    timeout_seconds_override=timeout_seconds_override,
                    screening_total_timeout_seconds=screening_total_timeout_seconds,
                    remaining_budget_seconds=remaining_budget_seconds,
                )
            self._record_screening_provider_result()
            return task
        except RecruitmentTaskCancelled:
            raise
        except Exception as exc:
            failure_code, _failure_message = _classify_infra_failure(exc)
            self._record_screening_provider_result(failure_code=failure_code)
            raise

    def _mark_ai_task_cancelled(self, task_id: int, *, actor_id: Optional[str] = None, reason: Optional[str] = None) -> None:
        row = self._get_ai_task_log_row(task_id)
        row.status = "cancelled"
        row.stage = "cancelled"
        row.stage_started_at = row.stage_started_at or row.created_at or datetime.now()
        row.stage_completed_at = datetime.now()
        row.duration_ms = max(0, int((row.stage_completed_at - row.stage_started_at).total_seconds() * 1000))
        row.error_message = _truncate_utf8_text(reason or "任务已被用户停止。", 12000)
        row.output_summary = _truncate_utf8_text("已停止生成", 12000)
        if actor_id:
            row.created_by = row.created_by or actor_id
        self._commit_ai_task_log(row)

    def _mark_ai_task_failed(self, task_id: int, message: str) -> None:
        row = self._get_ai_task_log_row(task_id)
        if row.status in TERMINAL_AI_TASK_STATUSES:
            return
        row.status = "failed"
        row.stage = "failed"
        row.stage_started_at = row.stage_started_at or row.created_at or datetime.now()
        row.stage_completed_at = datetime.now()
        row.duration_ms = max(0, int((row.stage_completed_at - row.stage_started_at).total_seconds() * 1000))
        row.error_message = _truncate_utf8_text(message, 12000)
        self._commit_ai_task_log(row)

    def _settle_orphaned_cancelling_task(self, row: RecruitmentAITaskLog) -> bool:
        if row.status != "cancelling":
            return False
        if recruitment_task_registry.get(row.id):
            return False
        row.status = "cancelled"
        row.stage = "cancelled"
        row.stage_started_at = row.stage_started_at or row.created_at or datetime.now()
        row.stage_completed_at = datetime.now()
        row.duration_ms = max(0, int((row.stage_completed_at - row.stage_started_at).total_seconds() * 1000))
        row.error_message = _truncate_utf8_text("任务已被用户停止。", 12000)
        row.output_summary = _truncate_utf8_text("已停止生成", 12000)
        self.db.add(row)
        return True

    def _is_orphaned_live_task(self, row: RecruitmentAITaskLog) -> bool:
        if row.status not in {"pending", "queued", "running"}:
            return False
        if recruitment_task_registry.get(row.id):
            return False
        checkpoint = row.updated_at or row.created_at
        if not checkpoint:
            return False
        if getattr(checkpoint, "tzinfo", None) is not None:
            checkpoint = checkpoint.replace(tzinfo=None)
        if checkpoint < PROCESS_BOOTED_AT:
            return True
        stale_before = datetime.now() - timedelta(minutes=SCREENING_ORPHAN_STALE_MINUTES)
        return checkpoint < stale_before

    def _get_screening_flow_child_logs(
        self,
        row: RecruitmentAITaskLog,
    ) -> Tuple[Optional[RecruitmentAITaskLog], Optional[RecruitmentAITaskLog]]:
        if row.task_type != SCREENING_FLOW_TASK_TYPE or row.parent_task_id is not None:
            return None, None
        return (
            self._get_latest_screening_run_task(row.screening_run_id, task_type="resume_parse", parent_task_id=row.id),
            self._get_latest_screening_score_run_task(row.screening_run_id, parent_task_id=row.id),
        )

    def _settle_orphaned_screening_flow_root(self, row: RecruitmentAITaskLog) -> bool:
        if row.task_type != SCREENING_FLOW_TASK_TYPE or row.parent_task_id is not None:
            return False
        if row.status in TERMINAL_AI_TASK_STATUSES:
            return False
        parse_log, score_log = self._get_screening_flow_child_logs(row)
        now = datetime.now()
        current_output = _decode_ai_task_json_text(getattr(row, "output_snapshot", None), None)
        current_output_record = dict(current_output) if isinstance(current_output, dict) else {}
        current_validation = _decode_ai_task_json_text(getattr(row, "validation_meta_json", None), None)
        current_validation_record = dict(current_validation) if isinstance(current_validation, dict) else {}
        latest_child: Optional[RecruitmentAITaskLog] = None
        for child in [parse_log, score_log]:
            if not child:
                continue
            if latest_child is None:
                latest_child = child
                continue
            latest_checkpoint = latest_child.updated_at or latest_child.stage_completed_at or latest_child.created_at or now
            child_checkpoint = child.updated_at or child.stage_completed_at or child.created_at or now
            if child_checkpoint >= latest_checkpoint:
                latest_child = child

        def _normalize_checkpoint(value: Optional[datetime]) -> Optional[datetime]:
            if value is None:
                return None
            return value.replace(tzinfo=None) if getattr(value, "tzinfo", None) is not None else value

        child_terminal_grace_before = now - timedelta(seconds=SCREENING_ROOT_RECOVERY_GRACE_SECONDS)
        latest_child_checkpoint = _normalize_checkpoint(
            latest_child.updated_at or latest_child.stage_completed_at or latest_child.created_at
        ) if latest_child else None
        should_finalize_from_child = bool(
            latest_child
            and latest_child.status in TERMINAL_AI_TASK_STATUSES
            and latest_child_checkpoint is not None
            and latest_child_checkpoint < child_terminal_grace_before
        )
        is_stale_root = self._is_orphaned_live_task(row)
        if not should_finalize_from_child and not is_stale_root:
            return False

        candidate = self.db.query(RecruitmentCandidate).filter(
            RecruitmentCandidate.id == row.related_candidate_id,
            RecruitmentCandidate.deleted.is_(False),
        ).first() if row.related_candidate_id else None
        parse_row = self._get_current_parse_result(candidate) if candidate else None
        score_row = self.db.query(RecruitmentCandidateScore).filter(
            RecruitmentCandidateScore.candidate_id == candidate.id,
            RecruitmentCandidateScore.id == candidate.latest_score_id,
        ).first() if candidate and candidate.latest_score_id else None
        source_log = score_log or parse_log or latest_child
        source_meta = _decode_ai_task_json_text(getattr(source_log, "validation_meta_json", None), None) if source_log else None
        source_meta_record = dict(source_meta) if isinstance(source_meta, dict) else {}

        if score_log and score_log.status in {"success", "fallback"}:
            final_status = "success"
            final_stage = "completed"
            output_summary = str(score_log.output_summary or row.output_summary or "初筛流程已完成").strip() or "初筛流程已完成"
            error_message = None
            screening_result_valid = True
            screening_result_state = str(source_meta_record.get("screening_result_state") or "success")
        elif score_log and score_log.status == "invalid_result":
            final_status = "invalid_result"
            final_stage = "failed"
            output_summary = str(score_log.output_summary or source_meta_record.get("invalid_result_summary") or "AI 返回了无效初筛结果").strip() or "AI 返回了无效初筛结果"
            error_message = output_summary
            screening_result_valid = False
            screening_result_state = str(source_meta_record.get("screening_result_state") or "invalid")
        elif score_log and score_log.status == "cancelled":
            final_status = "cancelled"
            final_stage = "cancelled"
            output_summary = str(score_log.output_summary or "初筛流程已停止").strip() or "初筛流程已停止"
            error_message = str(score_log.error_message or "任务已被用户停止。").strip() or "任务已被用户停止。"
            screening_result_valid = False
            screening_result_state = "cancelled"
        elif score_log and score_log.status in TERMINAL_AI_TASK_STATUSES:
            final_status = score_log.status
            final_stage = "failed"
            output_summary = str(score_log.output_summary or score_log.error_message or "初筛评分执行失败").strip() or "初筛评分执行失败"
            error_message = str(score_log.error_message or output_summary).strip() or output_summary
            screening_result_valid = False
            screening_result_state = str(source_meta_record.get("screening_result_state") or score_log.status or "failed")
        elif parse_log and parse_log.status == "cancelled":
            final_status = "cancelled"
            final_stage = "cancelled"
            output_summary = str(parse_log.output_summary or "初筛流程已停止").strip() or "初筛流程已停止"
            error_message = str(parse_log.error_message or "任务已被用户停止。").strip() or "任务已被用户停止。"
            screening_result_valid = False
            screening_result_state = "cancelled"
        elif parse_log and parse_log.status in {"success", "fallback"} and is_stale_root:
            final_status = "failed"
            final_stage = "failed"
            output_summary = "简历解析已完成，但初筛评分未完成，系统已按异常中断处理。"
            error_message = output_summary
            screening_result_valid = False
            screening_result_state = "failed"
        else:
            final_status = "failed"
            final_stage = "failed"
            output_summary = str(
                row.error_message
                or (parse_log.error_message if parse_log else "")
                or "初筛流程长时间未完成，已按异常中断处理。"
            ).strip() or "初筛流程长时间未完成，已按异常中断处理。"
            error_message = output_summary
            screening_result_valid = False
            screening_result_state = "failed"

        validation_warnings = _normalize_score_warning_items(
            source_meta_record.get("validation_warnings") or current_validation_record.get("validation_warnings"),
            limit=12,
        )
        invalid_result_reasons = _normalize_score_warning_items(
            source_meta_record.get("invalid_result_reasons") or current_validation_record.get("invalid_result_reasons") or ([error_message] if error_message else []),
            limit=12,
        )
        invalid_result_summary = str(
            source_meta_record.get("invalid_result_summary")
            or current_validation_record.get("invalid_result_summary")
            or ""
        ).strip() or None
        if not invalid_result_summary and final_status not in {"success", "fallback"}:
            invalid_result_summary = _build_invalid_result_summary(
                invalid_result_reasons=invalid_result_reasons,
                validation_warnings=validation_warnings,
                model_schema_violation_reason=str(source_meta_record.get("model_schema_violation_reason") or "").strip() or None,
            ) or error_message
        validation_meta = {
            "validation_warnings": validation_warnings,
            "invalid_result_reasons": invalid_result_reasons,
            "invalid_result_summary": invalid_result_summary,
            "model_schema_violation": bool(source_meta_record.get("model_schema_violation") or current_validation_record.get("model_schema_violation")),
            "model_schema_violation_reason": str(source_meta_record.get("model_schema_violation_reason") or current_validation_record.get("model_schema_violation_reason") or "").strip() or None,
            "screening_result_valid": screening_result_valid,
            "screening_result_state": screening_result_state,
            "parse_strategy": str(source_meta_record.get("parse_strategy") or current_validation_record.get("parse_strategy") or current_output_record.get("parse_strategy") or "parse_then_score"),
            "reused_existing_parse": bool(source_meta_record.get("reused_existing_parse") or current_validation_record.get("reused_existing_parse") or current_output_record.get("reused_existing_parse")),
        }
        final_response_source = str(source_meta_record.get("final_response_source") or current_validation_record.get("final_response_source") or "").strip() or None
        if final_response_source:
            validation_meta["final_response_source"] = final_response_source
        if "primary_model_call_succeeded" in source_meta_record or "primary_model_call_succeeded" in current_validation_record:
            validation_meta["primary_model_call_succeeded"] = bool(
                source_meta_record.get("primary_model_call_succeeded")
                if "primary_model_call_succeeded" in source_meta_record
                else current_validation_record.get("primary_model_call_succeeded")
            )

        def _child_status(child: Optional[RecruitmentAITaskLog], fallback_status: str) -> str:
            if not child:
                return fallback_status
            if child.status in {"success", "fallback"}:
                return "completed"
            if child.status == "cancelled":
                return "cancelled"
            if child.status in TERMINAL_AI_TASK_STATUSES:
                return "failed"
            return "running"

        parse_status = "reused" if validation_meta.get("reused_existing_parse") and not parse_log else _child_status(parse_log, str(current_output_record.get("parse_status") or "pending"))
        score_status = _child_status(score_log, str(current_output_record.get("score_status") or ("completed" if score_row else "pending")))
        persist_status = (
            "completed" if final_status in {"success", "fallback"}
            else "cancelled" if final_status == "cancelled"
            else "failed"
        )
        timing_breakdown = self._build_screening_run_timing_breakdown(root_log=row, parse_log=parse_log, score_log=score_log)
        persisted_result_refs = self._build_screening_persisted_result_refs(
            candidate=candidate,
            parse_row=parse_row,
            score_row=score_row,
            screening_result_valid=screening_result_valid,
        )
        output_snapshot = {
            **current_output_record,
            "task_type": SCREENING_FLOW_TASK_TYPE,
            "task_role": "root",
            "screening_run_id": row.screening_run_id,
            "parse_status": parse_status,
            "score_status": score_status,
            "persist_status": persist_status,
            "parse_result_id": parse_row.id if parse_row else current_output_record.get("parse_result_id"),
            "score_result_id": score_row.id if score_row else current_output_record.get("score_result_id"),
            "final_response_source": final_response_source or current_output_record.get("final_response_source"),
            "stage": final_stage,
            "timing_breakdown": timing_breakdown,
            "persisted_result_refs": persisted_result_refs,
        }
        old_status = row.status
        self._finish_ai_task_log(
            row,
            status=final_status,
            stage=final_stage,
            output_summary=output_summary,
            output_snapshot=output_snapshot,
            error_message=error_message,
            validation_meta=validation_meta,
            persisted_result_refs=persisted_result_refs,
            timing_breakdown=timing_breakdown,
        )
        logger.warning(
            "screening_flow orphan settled run_id=%s task_id=%s old_status=%s new_status=%s",
            row.screening_run_id,
            row.id,
            old_status,
            final_status,
        )
        return True

    def _settle_orphaned_live_task(self, row: RecruitmentAITaskLog) -> bool:
        if self._settle_orphaned_cancelling_task(row):
            return True
        if self._settle_orphaned_screening_flow_root(row):
            return True
        if not self._is_orphaned_live_task(row):
            return False
        row.status = "failed"
        row.stage = "failed"
        row.stage_started_at = row.stage_started_at or row.created_at or datetime.now()
        row.stage_completed_at = datetime.now()
        row.duration_ms = max(0, int((row.stage_completed_at - row.stage_started_at).total_seconds() * 1000))
        row.error_message = _truncate_utf8_text(
            row.error_message or "任务执行上下文已丢失，系统已自动标记为失败。",
            12000,
        )
        row.output_summary = _truncate_utf8_text(
            "AI 初筛任务执行已中断，系统已自动标记为失败。",
            12000,
        )
        self.db.add(row)
        logger.warning(
            "Settled orphaned AI task task_id=%s task_type=%s status=%s related_candidate_id=%s",
            row.id,
            row.task_type,
            row.status,
            row.related_candidate_id,
        )
        return True

    def _start_background_ai_task(self, task_id: int, runner: Callable[[RecruitmentTaskControl], None]) -> None:
        control = RecruitmentTaskControl(task_id)
        recruitment_task_registry.register(task_id, control)

        def _target() -> None:
            try:
                runner(control)
            finally:
                recruitment_task_registry.pop(task_id)

        thread = threading.Thread(target=_target, name=f"recruitment-ai-task-{task_id}", daemon=True)
        thread.start()

    def _screening_root_task_filter(self) -> Any:
        return and_(
            RecruitmentAITaskLog.task_type == SCREENING_FLOW_TASK_TYPE,
            RecruitmentAITaskLog.parent_task_id.is_(None),
        )

    def _user_visible_ai_task_log_filter(self) -> Any:
        return or_(
            RecruitmentAITaskLog.task_type == SCREENING_FLOW_TASK_TYPE,
            and_(
                RecruitmentAITaskLog.task_type == "resume_parse",
                RecruitmentAITaskLog.parent_task_id.is_(None),
                RecruitmentAITaskLog.screening_run_id.is_(None),
            ),
            and_(
                RecruitmentAITaskLog.task_type.in_(SCREENING_SCORE_TASK_TYPES),
                RecruitmentAITaskLog.parent_task_id.is_(None),
                or_(
                    RecruitmentAITaskLog.screening_run_id.is_(None),
                    RecruitmentAITaskLog.id == RecruitmentAITaskLog.root_task_id,
                ),
            ),
            and_(
                RecruitmentAITaskLog.task_type.notin_(["resume_parse", *SCREENING_SCORE_TASK_TYPES, SCREENING_FLOW_TASK_TYPE]),
            ),
        )

    def _extract_resume_file_raw_text(self, resume_file: RecruitmentResumeFile) -> str:
        return extract_resume_text(Path(resume_file.storage_path), resume_file.file_ext or "")

    def _can_reuse_existing_parse_result(
        self,
        candidate: RecruitmentCandidate,
        parse_row: Optional[RecruitmentResumeParseResult],
    ) -> bool:
        if not parse_row:
            return False
        if parse_row.status != "success":
            return False
        if parse_row.resume_file_id != candidate.latest_resume_file_id:
            return False
        if not getattr(parse_row, "raw_text", None) or not candidate.latest_resume_file_id:
            return True
        try:
            resume_file = self._get_resume_file(candidate.latest_resume_file_id)
            current_raw_text = self._extract_resume_file_raw_text(resume_file)
        except Exception:
            logger.warning(
                "Failed to compare latest resume text for parse reuse candidate_id=%s parse_result_id=%s; fallback to resume_file_id match",
                candidate.id,
                parse_row.id,
            )
            return True
        return _build_resume_content_hash(current_raw_text) == _build_resume_content_hash(parse_row.raw_text)

    def _find_live_screening_task(
        self,
        candidate_id: int,
        *,
        settle_orphans: bool = True,
    ) -> Optional[RecruitmentAITaskLog]:
        while True:
            row = self.db.query(RecruitmentAITaskLog).filter(
                RecruitmentAITaskLog.related_candidate_id == candidate_id,
                self._screening_root_task_filter(),
                RecruitmentAITaskLog.status.in_(SCREENING_LIVE_TASK_STATUSES),
            ).order_by(
                RecruitmentAITaskLog.updated_at.desc(),
                RecruitmentAITaskLog.id.desc(),
            ).first()
            if not row or not settle_orphans:
                return row
            if not self._settle_orphaned_live_task(row):
                return row
            self.db.commit()

    def _build_screening_queue_runner(self, task_id: int, actor_id: str) -> Callable[[RecruitmentTaskControl], None]:
        def _runner(control: RecruitmentTaskControl) -> None:
            db = SessionLocal()
            service = RecruitmentService(db)
            try:
                service._run_queued_screening_task(task_id, actor_id, cancel_control=control)
            except RecruitmentTaskCancelled:
                pass
            except Exception as exc:
                db.rollback()
                try:
                    log_row = service._get_ai_task_log_row(task_id)
                    failure_status, failure_message = _classify_screening_task_failure(exc)
                    if _is_retryable_infra_failure_code(failure_status):
                        current_validation = _decode_ai_task_json_text(getattr(log_row, "validation_meta_json", None), {})
                        current_retry_count = 0
                        if isinstance(current_validation, dict):
                            try:
                                current_retry_count = int(current_validation.get("infra_retry_count") or 0)
                            except Exception:
                                current_retry_count = 0
                        if current_retry_count < SCREENING_INFRA_MAX_RETRIES:
                            service._schedule_screening_infra_retry(
                                log_row,
                                failure_code=failure_status,
                                failure_message=failure_message,
                            )
                            return
                        failure_status = "retry_exhausted"
                        failure_message = f"上游模型接口持续不可用，自动重试已达上限：{failure_message}"
                    if log_row.status in TERMINAL_AI_TASK_STATUSES:
                        return
                    if log_row.related_candidate_id and _should_mark_candidate_screening_failed(failure_status):
                        candidate = service._get_candidate(log_row.related_candidate_id)
                        service._mark_candidate_screening_failed_if_needed(
                            candidate,
                            actor_id=actor_id,
                            reason="AI 初筛执行失败，请重新发起初筛。",
                            source="ai_screening_failed",
                        )
                        service.db.add(candidate)
                        service.db.commit()
                    service._finish_ai_task_log(
                        log_row,
                        status=failure_status,
                        output_summary=failure_message,
                        output_snapshot=_build_screening_task_progress_snapshot(
                            "failed",
                            message=failure_message,
                            extra={"failure_status": failure_status},
                        ),
                        error_message=failure_message,
                        validation_meta={
                            "screening_result_valid": False,
                            "screening_result_state": failure_status,
                            "failure_code": failure_status,
                        },
                    )
                except Exception:
                    db.rollback()
                logger.exception("Queued screening task %s failed", task_id)
            finally:
                db.close()
                with _screening_worker_lock:
                    _screening_worker_active_task_ids.discard(task_id)
                try:
                    service._dispatch_screening_queue()
                except Exception:
                    logger.exception("Failed to continue screening queue dispatch after task %s", task_id)

        return _runner

    def _dispatch_screening_queue(self) -> Dict[str, int]:
        scheduled_tasks: List[Tuple[int, str]] = []
        with _screening_worker_lock:
            global _screening_provider_cooldown_until
            if _screening_provider_cooldown_until and _screening_provider_cooldown_until > datetime.now():
                return {
                    "started_count": 0,
                    "active_count": len(_screening_worker_active_task_ids),
                    "max_concurrency": SCREENING_WORKER_MAX_CONCURRENCY,
                    "cooldown_until": _screening_provider_cooldown_until.isoformat(),
                }
            if _screening_provider_cooldown_until and _screening_provider_cooldown_until <= datetime.now():
                _screening_provider_cooldown_until = None
            available_slots = max(0, SCREENING_WORKER_MAX_CONCURRENCY - len(_screening_worker_active_task_ids))
            if available_slots <= 0:
                return {
                    "started_count": 0,
                    "active_count": len(_screening_worker_active_task_ids),
                    "max_concurrency": SCREENING_WORKER_MAX_CONCURRENCY,
                    "cooldown_until": _screening_provider_cooldown_until.isoformat() if _screening_provider_cooldown_until else None,
                }
            dispatch_db = SessionLocal()
            try:
                dispatch_service = RecruitmentService(dispatch_db)
                stale_live_rows = dispatch_db.query(RecruitmentAITaskLog).filter(
                    dispatch_service._screening_root_task_filter(),
                    RecruitmentAITaskLog.status.in_(SCREENING_LIVE_TASK_STATUSES),
                    RecruitmentAITaskLog.status != "queued",
                ).order_by(
                    RecruitmentAITaskLog.updated_at.asc(),
                    RecruitmentAITaskLog.id.asc(),
                ).all()
                stale_rows_touched = False
                for row in stale_live_rows:
                    if dispatch_service._settle_orphaned_live_task(row):
                        stale_rows_touched = True
                if stale_rows_touched:
                    dispatch_db.commit()
                claim_now = datetime.now()
                queued_query = dispatch_db.query(RecruitmentAITaskLog).filter(
                    dispatch_service._screening_root_task_filter(),
                    RecruitmentAITaskLog.status == "queued",
                ).order_by(
                    RecruitmentAITaskLog.created_at.asc(),
                    RecruitmentAITaskLog.id.asc(),
                )
                queued_limit = min(SCREENING_BATCH_MAX_SIZE, max(available_slots * 4, max(available_slots, 1)))
                locked_query = queued_query.with_for_update(skip_locked=True)
                queued_rows = locked_query.limit(queued_limit).all()
                if not isinstance(queued_rows, list):
                    queued_rows = queued_query.limit(queued_limit).all()
                for row in queued_rows:
                    if not dispatch_service._task_is_ready_for_dispatch(row):
                        continue
                    dispatch_service._mark_screening_task_claimed(row, claimed_at=claim_now)
                    scheduled_tasks.append((row.id, row.created_by or "system"))
                    if len(scheduled_tasks) >= available_slots:
                        break
                if scheduled_tasks:
                    dispatch_db.commit()
            finally:
                dispatch_db.close()
            for task_id, _actor_id in scheduled_tasks:
                _screening_worker_active_task_ids.add(task_id)
        for task_id, actor_id in scheduled_tasks:
            self._start_background_ai_task(task_id, self._build_screening_queue_runner(task_id, actor_id))
        return {
            "started_count": len(scheduled_tasks),
            "active_count": len(_screening_worker_active_task_ids),
            "max_concurrency": SCREENING_WORKER_MAX_CONCURRENCY,
            "cooldown_until": _screening_provider_cooldown_until.isoformat() if _screening_provider_cooldown_until else None,
        }

    def process_next_screening_task(self) -> Dict[str, int]:
        return self._dispatch_screening_queue()

    def cancel_ai_task(self, task_id: int, actor_id: str) -> Dict[str, Any]:
        row = self._get_ai_task_log_row(task_id)
        if row.status in {"success", "fallback", "failed", "cancelled"}:
            return self._serialize_ai_task_log(row, include_full_request_snapshot=True)
        if row.status == "cancelling":
            control = recruitment_task_registry.get(task_id)
            if control:
                control.cancel()
            else:
                self._mark_ai_task_cancelled(task_id, actor_id=actor_id, reason="任务已停止，未继续生成。")
            refreshed = self._get_ai_task_log_row(task_id)
            return self._serialize_ai_task_log(refreshed, include_full_request_snapshot=True)
        self._mark_ai_task_cancelled(task_id, actor_id=actor_id, reason=f"用户 {actor_id} 已停止生成。")
        control = recruitment_task_registry.get(task_id)
        if control:
            control.cancel()
        refreshed = self._get_ai_task_log_row(task_id)
        return self._serialize_ai_task_log(refreshed, include_full_request_snapshot=True)

    def _safe_encrypt_secret(self, plaintext: str) -> str:
        try:
            return encrypt_secret(plaintext)
        except RuntimeError as exc:
            raise ValueError("敏感信息加密失败，请检查服务端密钥配置。") from exc

    def _get_rule_config(self, config_key: str, default: Any) -> Any:
        row = self.db.query(RecruitmentRuleConfig).filter(RecruitmentRuleConfig.config_key == config_key, RecruitmentRuleConfig.scope == "global").first()
        if not row:
            return DEFAULT_RULE_CONFIGS.get(config_key, default)
        return json_loads_safe(row.config_value, default) if row.config_type == "json" else row.config_value or default

    def _get_scoped_rule_config(self, config_key: str, default: Any, *, scope: str = "global", scope_id: Optional[Any] = None) -> Any:
        builder = self.db.query(RecruitmentRuleConfig).filter(
            RecruitmentRuleConfig.config_key == config_key,
            RecruitmentRuleConfig.scope == scope,
        )
        normalized_scope_id = str(scope_id) if scope != "global" and scope_id is not None else None
        if scope != "global":
            builder = builder.filter(RecruitmentRuleConfig.scope_id == normalized_scope_id)
        row = builder.first()
        if not row:
            if scope == "global":
                return DEFAULT_RULE_CONFIGS.get(config_key, default)
            return _copy_json_like(default)
        return json_loads_safe(row.config_value, default) if row.config_type == "json" else row.config_value or default

    def _upsert_json_rule_config(
        self,
        config_key: str,
        value: Dict[str, Any],
        *,
        scope: str = "global",
        scope_id: Optional[Any] = None,
        description: Optional[str] = None,
    ) -> RecruitmentRuleConfig:
        builder = self.db.query(RecruitmentRuleConfig).filter(
            RecruitmentRuleConfig.config_key == config_key,
            RecruitmentRuleConfig.scope == scope,
        )
        normalized_scope_id = str(scope_id) if scope != "global" and scope_id is not None else None
        if scope != "global":
            builder = builder.filter(RecruitmentRuleConfig.scope_id == normalized_scope_id)
        row = builder.first()
        if not row:
            row = RecruitmentRuleConfig(
                config_key=config_key,
                config_type="json",
                scope=scope,
                scope_id=normalized_scope_id,
                config_value=json_dumps_safe(value),
                description=description,
            )
        else:
            row.config_type = "json"
            row.scope_id = normalized_scope_id
            row.config_value = json_dumps_safe(value)
            if description is not None:
                row.description = description
        self.db.add(row)
        self.db.flush()
        return row

    def _normalize_global_auto_mail_config(self, value: Any) -> Dict[str, Any]:
        source = value if isinstance(value, dict) else {}
        recipient_ids = _dedupe_ints(source.get("global_default_recipient_ids") or [])
        return {
            "global_default_recipient_ids": recipient_ids,
            "global_auto_push_enabled": bool(source.get("global_auto_push_enabled")),
        }

    def _normalize_position_auto_mail_config(self, value: Any) -> Dict[str, Any]:
        source = value if isinstance(value, dict) else {}
        allowed_statuses = [
            item
            for item in _dedupe_texts(source.get("auto_mail_allowed_candidate_statuses") or DEFAULT_POSITION_AUTO_MAIL_CONFIG["auto_mail_allowed_candidate_statuses"])
            if item in VALID_CANDIDATE_STATUS_VALUES
        ]
        if not allowed_statuses:
            allowed_statuses = list(DEFAULT_POSITION_AUTO_MAIL_CONFIG["auto_mail_allowed_candidate_statuses"])
        dedup_mode = str(source.get("auto_mail_dedup_mode") or DEFAULT_POSITION_AUTO_MAIL_CONFIG["auto_mail_dedup_mode"]).strip()
        if dedup_mode not in VALID_AUTO_MAIL_DEDUP_MODES:
            dedup_mode = DEFAULT_POSITION_AUTO_MAIL_CONFIG["auto_mail_dedup_mode"]
        template_id = str(source.get("auto_mail_template_id") or "").strip() or None
        return {
            "auto_mail_enabled": bool(source.get("auto_mail_enabled")),
            "auto_mail_use_global_recipients": bool(source.get("auto_mail_use_global_recipients")),
            "auto_mail_use_position_recipients": bool(source.get("auto_mail_use_position_recipients")),
            "auto_mail_position_recipient_ids": _dedupe_ints(source.get("auto_mail_position_recipient_ids") or []),
            "auto_mail_allowed_candidate_statuses": allowed_statuses,
            "auto_mail_template_id": template_id,
            "auto_mail_dedup_mode": dedup_mode,
            "auto_mail_cc_recipient_ids": _dedupe_ints(source.get("auto_mail_cc_recipient_ids") or []),
            "auto_mail_bcc_recipient_ids": _dedupe_ints(source.get("auto_mail_bcc_recipient_ids") or []),
        }

    def _get_global_auto_mail_config(self) -> Dict[str, Any]:
        payload = self._get_scoped_rule_config(
            MAIL_AUTO_PUSH_GLOBAL_CONFIG_KEY,
            DEFAULT_RULE_CONFIGS.get(MAIL_AUTO_PUSH_GLOBAL_CONFIG_KEY, {}),
            scope="global",
        )
        return self._normalize_global_auto_mail_config(payload)

    def _get_position_auto_mail_config(self, position_id: int) -> Dict[str, Any]:
        payload = self._get_scoped_rule_config(
            POSITION_AUTO_MAIL_CONFIG_KEY,
            DEFAULT_POSITION_AUTO_MAIL_CONFIG,
            scope="position",
            scope_id=position_id,
        )
        return self._normalize_position_auto_mail_config(payload)

    def _serialize_global_auto_mail_config(self, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        normalized = self._normalize_global_auto_mail_config(config if config is not None else self._get_global_auto_mail_config())
        recipient_rows = self._load_mail_recipient_rows(normalized.get("global_default_recipient_ids") or [])
        return {
            **normalized,
            "global_default_recipient_emails": [row.email for row in recipient_rows],
        }

    def get_mail_auto_push_global_config(self) -> Dict[str, Any]:
        return self._serialize_global_auto_mail_config()

    def update_mail_auto_push_global_config(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized = self._normalize_global_auto_mail_config(payload)
        self._upsert_json_rule_config(
            MAIL_AUTO_PUSH_GLOBAL_CONFIG_KEY,
            normalized,
            scope="global",
            description="邮件自动推送全局默认配置",
        )
        self.db.commit()
        return self._serialize_global_auto_mail_config(normalized)

    def _get_position(self, position_id: int) -> RecruitmentPosition:
        row = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == position_id, RecruitmentPosition.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_business_row_visible(row)
        return row

    def _get_candidate(self, candidate_id: int) -> RecruitmentCandidate:
        row = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == candidate_id, RecruitmentCandidate.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_business_row_visible(row)
        return row

    def _get_skill(self, skill_id: int) -> RecruitmentSkill:
        row = self.db.query(RecruitmentSkill).filter(RecruitmentSkill.id == skill_id, RecruitmentSkill.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        if not self._can_access_org_resource(row):
            raise ValueError("鎿嶄綔澶辫触")
        return row

    def _get_resume_file(self, resume_file_id: int) -> RecruitmentResumeFile:
        row = self.db.query(RecruitmentResumeFile).filter(RecruitmentResumeFile.id == resume_file_id).first()
        if not row:
            raise ValueError("绠€鍘嗘枃浠朵笉瀛樺湪")
        self._assert_business_row_visible(row)
        return row

    def _rebuild_candidate_resume_references(self, candidate: RecruitmentCandidate, actor_id: str) -> None:
        latest_resume = self.db.query(RecruitmentResumeFile).filter(
            RecruitmentResumeFile.candidate_id == candidate.id,
        ).order_by(RecruitmentResumeFile.created_at.desc(), RecruitmentResumeFile.id.desc()).first()

        latest_parse = None
        latest_score = None

        if latest_resume:
            latest_score = self.db.query(RecruitmentCandidateScore).join(
                RecruitmentResumeParseResult,
                RecruitmentCandidateScore.parse_result_id == RecruitmentResumeParseResult.id,
            ).filter(
                RecruitmentCandidateScore.candidate_id == candidate.id,
                RecruitmentResumeParseResult.candidate_id == candidate.id,
                RecruitmentResumeParseResult.resume_file_id == latest_resume.id,
            ).order_by(
                RecruitmentCandidateScore.updated_at.desc(),
                RecruitmentCandidateScore.id.desc(),
            ).first()

            if latest_score:
                latest_parse = self.db.query(RecruitmentResumeParseResult).filter(
                    RecruitmentResumeParseResult.id == latest_score.parse_result_id,
                ).first()

            if not latest_parse:
                latest_parse = self.db.query(RecruitmentResumeParseResult).filter(
                    RecruitmentResumeParseResult.candidate_id == candidate.id,
                    RecruitmentResumeParseResult.resume_file_id == latest_resume.id,
                ).order_by(
                    RecruitmentResumeParseResult.created_at.desc(),
                    RecruitmentResumeParseResult.id.desc(),
                ).first()

        candidate.latest_resume_file_id = latest_resume.id if latest_resume else None
        candidate.latest_parse_result_id = latest_parse.id if latest_parse else None
        candidate.latest_score_id = latest_score.id if latest_score else None
        candidate.match_percent = latest_score.match_percent if latest_score else None
        candidate.ai_recommended_status = latest_score.suggested_status if latest_score else None
        candidate.source_detail = latest_resume.original_name if latest_resume else None
        candidate.updated_by = actor_id
        self.db.add(candidate)

        workflow = self._get_workflow_memory(candidate.id)
        if workflow:
            workflow.position_id = candidate.position_id
            workflow.latest_parse_result_id = latest_parse.id if latest_parse else None
            workflow.latest_score_id = latest_score.id if latest_score else None
            workflow.last_screened_at = (latest_score.updated_at or latest_score.created_at) if latest_score else None
            workflow.updated_by = actor_id
            self.db.add(workflow)

    def delete_resume_file(self, resume_file_id: int, actor_id: str) -> Dict[str, Any]:
        resume_file = self._get_resume_file(resume_file_id)
        candidate = self._get_candidate(resume_file.candidate_id)

        active_resume_task = self.db.query(RecruitmentAITaskLog).filter(
            RecruitmentAITaskLog.related_resume_file_id == resume_file.id,
            RecruitmentAITaskLog.task_type.in_(["resume_parse", *SCREENING_SCORE_TASK_TYPES, SCREENING_FLOW_TASK_TYPE]),
            RecruitmentAITaskLog.status.in_(["pending", "queued", "running", "cancelling"]),
        ).order_by(RecruitmentAITaskLog.updated_at.desc(), RecruitmentAITaskLog.id.desc()).first()
        if active_resume_task:
            raise RecruitmentConflictError("当前简历仍在解析或初筛中，请等待任务结束后再删除。")

        parse_rows = self.db.query(RecruitmentResumeParseResult).filter(
            RecruitmentResumeParseResult.resume_file_id == resume_file.id,
            RecruitmentResumeParseResult.candidate_id == candidate.id,
        ).all()
        parse_ids = [row.id for row in parse_rows]

        if parse_ids:
            self.db.query(RecruitmentCandidateScore).filter(
                RecruitmentCandidateScore.candidate_id == candidate.id,
                RecruitmentCandidateScore.parse_result_id.in_(parse_ids),
            ).delete(synchronize_session=False)
            self.db.query(RecruitmentResumeParseResult).filter(
                RecruitmentResumeParseResult.id.in_(parse_ids),
            ).delete(synchronize_session=False)

        storage_path = Path(resume_file.storage_path)
        storage_dir = storage_path.parent

        self.db.delete(resume_file)
        self.db.flush()
        self._rebuild_candidate_resume_references(candidate, actor_id)
        self.db.commit()

        try:
            if storage_path.exists():
                storage_path.unlink()
            if storage_dir.exists() and not any(storage_dir.iterdir()):
                storage_dir.rmdir()
        except OSError:
            logger.warning("Failed to cleanup resume storage for resume_file_id=%s", resume_file_id, exc_info=True)

        remaining_resume_count = self.db.query(RecruitmentResumeFile).filter(
            RecruitmentResumeFile.candidate_id == candidate.id,
        ).count()
        return {
            "candidate_id": candidate.id,
            "deleted_resume_file_id": resume_file_id,
            "remaining_resume_count": remaining_resume_count,
            "latest_resume_file_id": candidate.latest_resume_file_id,
            "latest_parse_result_id": candidate.latest_parse_result_id,
            "latest_score_id": candidate.latest_score_id,
        }

    def delete_candidate(self, candidate_id: int, actor_id: str) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        resume_rows = self.db.query(RecruitmentResumeFile).filter(
            RecruitmentResumeFile.candidate_id == candidate.id,
        ).all()
        resume_file_ids = [row.id for row in resume_rows]
        parse_rows = self.db.query(RecruitmentResumeParseResult).filter(
            RecruitmentResumeParseResult.candidate_id == candidate.id,
        ).all()
        parse_ids = [row.id for row in parse_rows]

        active_task_query = self.db.query(RecruitmentAITaskLog).filter(
            RecruitmentAITaskLog.status.in_(["pending", "queued", "running", "cancelling"]),
        )
        if resume_file_ids:
            active_task_query = active_task_query.filter(
                or_(
                    RecruitmentAITaskLog.related_candidate_id == candidate.id,
                    RecruitmentAITaskLog.related_resume_file_id.in_(resume_file_ids),
                )
            )
        else:
            active_task_query = active_task_query.filter(
                RecruitmentAITaskLog.related_candidate_id == candidate.id,
            )
        active_task = active_task_query.order_by(
            RecruitmentAITaskLog.updated_at.desc(),
            RecruitmentAITaskLog.id.desc(),
        ).first()
        if active_task:
            raise RecruitmentConflictError("当前候选人仍有进行中的 AI 任务，请等待任务结束后再删除。")

        storage_paths = [Path(row.storage_path) for row in resume_rows if row.storage_path]

        if parse_ids:
            self.db.query(RecruitmentCandidateScore).filter(
                RecruitmentCandidateScore.candidate_id == candidate.id,
                RecruitmentCandidateScore.parse_result_id.in_(parse_ids),
            ).delete(synchronize_session=False)

        self.db.query(RecruitmentCandidateStatusHistory).filter(
            RecruitmentCandidateStatusHistory.candidate_id == candidate.id,
        ).delete(synchronize_session=False)
        self.db.query(RecruitmentInterviewQuestion).filter(
            RecruitmentInterviewQuestion.candidate_id == candidate.id,
        ).delete(synchronize_session=False)
        self.db.query(RecruitmentInterviewResult).filter(
            RecruitmentInterviewResult.candidate_id == candidate.id,
        ).delete(synchronize_session=False)
        self.db.query(RecruitmentCandidateWorkflowMemory).filter(
            RecruitmentCandidateWorkflowMemory.candidate_id == candidate.id,
        ).delete(synchronize_session=False)
        self.db.query(RecruitmentResumeParseResult).filter(
            RecruitmentResumeParseResult.candidate_id == candidate.id,
        ).delete(synchronize_session=False)
        self.db.query(RecruitmentResumeFile).filter(
            RecruitmentResumeFile.candidate_id == candidate.id,
        ).delete(synchronize_session=False)
        ai_log_filters = [RecruitmentAITaskLog.related_candidate_id == candidate.id]
        if resume_file_ids:
            ai_log_filters.append(RecruitmentAITaskLog.related_resume_file_id.in_(resume_file_ids))
        for log_row in self.db.query(RecruitmentAITaskLog).filter(or_(*ai_log_filters)).all():
            self.db.delete(log_row)

        chat_context_rows = self.db.query(RecruitmentChatContextMemory).filter(
            RecruitmentChatContextMemory.candidate_id == candidate.id,
        ).all()
        for context_row in chat_context_rows:
            context_row.candidate_id = None
            self.db.add(context_row)

        deleted_candidate_snapshot = {
            "candidate_id": candidate.id,
            "candidate_code": candidate.candidate_code,
            "candidate_name": candidate.name,
            "position_id": candidate.position_id,
            "removed_resume_count": len(resume_rows),
            "removed_parse_result_count": len(parse_rows),
        }
        self.db.delete(candidate)
        self.db.commit()

        for storage_path in storage_paths:
            try:
                storage_dir = storage_path.parent
                if storage_path.exists():
                    storage_path.unlink()
                if storage_dir.exists() and not any(storage_dir.iterdir()):
                    storage_dir.rmdir()
            except OSError:
                logger.warning("Failed to cleanup resume storage for candidate_id=%s", candidate_id, exc_info=True)

        return deleted_candidate_snapshot

    def _get_workflow_memory(self, candidate_id: int) -> Optional[RecruitmentCandidateWorkflowMemory]:
        return self.db.query(RecruitmentCandidateWorkflowMemory).filter(RecruitmentCandidateWorkflowMemory.candidate_id == candidate_id).first()

    def _get_or_create_workflow_memory(self, candidate: RecruitmentCandidate, actor_id: str) -> RecruitmentCandidateWorkflowMemory:
        row = self._get_workflow_memory(candidate.id)
        if row:
            return row
        row = RecruitmentCandidateWorkflowMemory(org_code=normalize_org_code(getattr(candidate, "org_code", None)), candidate_id=candidate.id, position_id=candidate.position_id, screening_skill_ids_json=json_dumps_safe([]), interview_skill_ids_json=json_dumps_safe([]), created_by=actor_id, updated_by=actor_id)
        self.db.add(row)
        self.db.flush()
        return row

    def _load_skill_rows(self, skill_ids: Iterable[Any], *, enabled_only: bool = False) -> List[RecruitmentSkill]:
        normalized = _dedupe_ints(skill_ids)
        if not normalized:
            return []
        query = self.db.query(RecruitmentSkill).filter(RecruitmentSkill.id.in_(normalized), RecruitmentSkill.deleted.is_(False))
        if enabled_only:
            query = query.filter(RecruitmentSkill.is_enabled.is_(True))
        rows = query.order_by(RecruitmentSkill.sort_order.asc(), RecruitmentSkill.id.asc()).all()
        rows = [row for row in rows if self._can_access_org_resource(row)]
        order_map = {skill_id: index for index, skill_id in enumerate(normalized)}
        rows.sort(key=lambda item: order_map.get(item.id, 9999))
        return rows

    def _load_enabled_skills(self) -> List[RecruitmentSkill]:
        rows = self.db.query(RecruitmentSkill).filter(RecruitmentSkill.deleted.is_(False), RecruitmentSkill.is_enabled.is_(True)).order_by(RecruitmentSkill.sort_order.asc(), RecruitmentSkill.id.asc()).all()
        return [row for row in rows if self._can_access_org_resource(row)]

    def _load_system_base_skill_rows(self, task_kind: str) -> List[RecruitmentSkill]:
        skill_code = SYSTEM_BASE_SKILL_CODES.get(task_kind)
        if not skill_code:
            return []
        rows = self.db.query(RecruitmentSkill).filter(
            RecruitmentSkill.skill_code == skill_code,
            RecruitmentSkill.deleted.is_(False),
            RecruitmentSkill.is_enabled.is_(True),
        ).order_by(
            RecruitmentSkill.sort_order.asc(),
            RecruitmentSkill.id.asc(),
        ).all()
        return self._filter_skill_rows_for_task(rows, task_kind)

    def _filter_skill_rows_for_task(self, skill_rows: Sequence[RecruitmentSkill], task_kind: str) -> List[RecruitmentSkill]:
        rows = list(skill_rows or [])
        if not rows:
            return []
        matched = [row for row in rows if task_kind in _extract_skill_task_types(row)]
        return matched or rows

    def _get_position_skill_rows(self, position_id: Optional[int]) -> List[RecruitmentSkill]:
        if not position_id:
            return []
        links = self.db.query(RecruitmentPositionSkillLink).filter(RecruitmentPositionSkillLink.position_id == position_id).order_by(RecruitmentPositionSkillLink.id.asc()).all()
        return self._load_skill_rows([link.skill_id for link in links], enabled_only=True)

    def _get_position_task_skill_ids(self, position: Optional[RecruitmentPosition], task_kind: str) -> List[int]:
        if not position:
            return []
        field_map = {
            "jd": "jd_skill_ids_json",
            "screening": "screening_skill_ids_json",
            "interview": "interview_skill_ids_json",
        }
        field_name = field_map.get(task_kind)
        raw_value = getattr(position, field_name, None) if field_name else None
        if raw_value is not None:
            return _dedupe_ints(json_loads_safe(raw_value, []))
        legacy_rows = self._filter_skill_rows_for_task(self._get_position_skill_rows(position.id), task_kind)
        return [row.id for row in legacy_rows]

    def _get_position_task_skill_rows(self, position_id: Optional[int], task_kind: str) -> List[RecruitmentSkill]:
        if not position_id:
            return []
        position = self._get_position(position_id)
        return self._load_skill_rows(self._get_position_task_skill_ids(position, task_kind), enabled_only=True)

    def _sync_position_task_skill_bindings(
        self,
        row: RecruitmentPosition,
        *,
        actor_id: str,
        jd_skill_ids: Optional[Iterable[Any]] = None,
        screening_skill_ids: Optional[Iterable[Any]] = None,
        interview_skill_ids: Optional[Iterable[Any]] = None,
    ) -> None:
        current_jd_ids = _dedupe_ints(json_loads_safe(row.jd_skill_ids_json, []))
        current_screening_ids = _dedupe_ints(json_loads_safe(row.screening_skill_ids_json, []))
        current_interview_ids = _dedupe_ints(json_loads_safe(row.interview_skill_ids_json, []))
        if jd_skill_ids is not None:
            current_jd_ids = _dedupe_ints(jd_skill_ids)
        if screening_skill_ids is not None:
            current_screening_ids = _dedupe_ints(screening_skill_ids)
        if interview_skill_ids is not None:
            current_interview_ids = _dedupe_ints(interview_skill_ids)
        row.jd_skill_ids_json = json_dumps_safe(current_jd_ids)
        row.screening_skill_ids_json = json_dumps_safe(current_screening_ids)
        row.interview_skill_ids_json = json_dumps_safe(current_interview_ids)
        self._sync_position_skill_links(row.id, [*current_jd_ids, *current_screening_ids, *current_interview_ids], actor_id)

    def _resolve_jd_skills(self, position: RecruitmentPosition, explicit_skill_ids: Optional[Iterable[Any]] = None, *, use_position_skills: bool = True, use_global_skills: bool = True) -> Tuple[List[RecruitmentSkill], str]:
        manual_rows = [row for row in self._load_skill_rows(explicit_skill_ids or [], enabled_only=True) if "jd" in _extract_skill_task_types(row)]
        if manual_rows:
            return manual_rows, "manual"
        position_rows = self._get_position_task_skill_rows(position.id, "jd") if use_position_skills else []
        if position_rows:
            return position_rows, "position"
        base_rows = self._load_system_base_skill_rows("jd")
        if base_rows:
            return base_rows, "system_builtin_base"
        global_rows = [row for row in self._load_enabled_skills() if "jd" in _extract_skill_task_types(row)] if use_global_skills else []
        if global_rows:
            return global_rows, "global"
        return [], "none"

    def _sync_position_skill_links(self, position_id: int, skill_ids: Iterable[Any], actor_id: str) -> None:
        self.db.query(RecruitmentPositionSkillLink).filter(RecruitmentPositionSkillLink.position_id == position_id).delete(synchronize_session=False)
        for skill_id in _dedupe_ints(skill_ids):
            self.db.add(RecruitmentPositionSkillLink(position_id=position_id, skill_id=skill_id, created_by=actor_id, updated_by=actor_id))
        self.db.flush()
    def _create_status_history(self, candidate: RecruitmentCandidate, to_status: str, reason: str, actor_id: str, source: str) -> None:
        self.db.add(RecruitmentCandidateStatusHistory(org_code=normalize_org_code(getattr(candidate, "org_code", None)), candidate_id=candidate.id, from_status=candidate.status, to_status=to_status, reason=reason or None, changed_by=actor_id, source=source))
        candidate.status = to_status
        candidate.updated_by = actor_id
        self.db.flush()

    def _auto_advance_candidate_after_screening(
        self,
        candidate: RecruitmentCandidate,
        *,
        actor_id: str,
    ) -> None:
        if candidate.status not in {"pending_screening", "screening_failed"}:
            return
        suggested_status = _normalize_suggested_status(candidate.ai_recommended_status)
        if not suggested_status or suggested_status == candidate.status:
            return
        position = self._get_position(candidate.position_id) if candidate.position_id else None
        if position and not bool(position.auto_advance_on_screening):
            return
        self._create_status_history(
            candidate,
            suggested_status,
            "AI 初筛完成，按 AI 建议自动更新候选人状态。",
            actor_id,
            "ai_screening",
        )

    def _mark_candidate_screening_failed_if_needed(
        self,
        candidate: RecruitmentCandidate,
        *,
        actor_id: str,
        reason: str,
        source: str,
    ) -> None:
        if candidate.status not in {"pending_screening", "screening_running", "screening_failed", "talent_pool"}:
            return
        self._create_status_history(
            candidate,
            "screening_failed",
            reason,
            actor_id,
            source,
        )
        candidate.latest_score_id = None
        candidate.match_percent = None
        candidate.ai_recommended_status = None
        candidate.updated_by = actor_id

    def _create_ai_task_log(
        self,
        task_type: str,
        *,
        created_by: str,
        related_position_id: Optional[int] = None,
        related_candidate_id: Optional[int] = None,
        related_skill_ids: Optional[Iterable[Any]] = None,
        related_skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
        related_resume_file_id: Optional[int] = None,
        related_publish_task_id: Optional[int] = None,
        memory_source: Optional[str] = None,
        request_hash: Optional[str] = None,
        batch_id: Optional[str] = None,
        status: str = "pending",
        screening_run_id: Optional[str] = None,
        parent_task_id: Optional[int] = None,
        root_task_id: Optional[int] = None,
        stage: Optional[str] = None,
        skill_resolution_source: Optional[str] = None,
        skill_resolution_detail: Optional[Dict[str, Any]] = None,
        score_rule_snapshot: Optional[Sequence[Dict[str, Any]]] = None,
        timing_breakdown: Optional[Dict[str, Any]] = None,
        provider: Optional[str] = None,
        model_name: Optional[str] = None,
    ) -> RecruitmentAITaskLog:
        now = datetime.now()
        initial_runtime = self._resolve_initial_ai_task_runtime(task_type)
        org_code = self._current_org_code()
        if related_candidate_id:
            candidate_row = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == related_candidate_id).first()
            if candidate_row:
                org_code = normalize_org_code(getattr(candidate_row, "org_code", None))
        elif related_position_id:
            position_row = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == related_position_id).first()
            if position_row:
                org_code = normalize_org_code(getattr(position_row, "org_code", None))
        row = RecruitmentAITaskLog(
            task_type=task_type,
            org_code=org_code,
            screening_run_id=screening_run_id,
            batch_id=batch_id,
            parent_task_id=parent_task_id,
            root_task_id=root_task_id,
            stage=str(stage or "").strip() or None,
            stage_started_at=now if stage else None,
            related_position_id=related_position_id,
            related_candidate_id=related_candidate_id,
            related_skill_id=None,
            related_skill_ids_json=json_dumps_safe(_dedupe_ints(related_skill_ids or [])),
            related_skill_snapshots_json=json_dumps_safe(list(related_skill_snapshots or [])),
            related_resume_file_id=related_resume_file_id,
            related_publish_task_id=related_publish_task_id,
            memory_source=memory_source,
            skill_resolution_source=skill_resolution_source,
            skill_resolution_detail_json=_prepare_ai_task_json_text(skill_resolution_detail),
            score_rule_snapshot_json=_prepare_ai_task_json_text(score_rule_snapshot),
            timing_breakdown_json=_prepare_ai_task_json_text(timing_breakdown),
            request_hash=request_hash,
            model_provider=provider if provider is not None else initial_runtime.get("provider"),
            model_name=model_name if model_name is not None else initial_runtime.get("model_name"),
            status=status,
            created_by=created_by,
        )
        self.db.add(row)
        self._commit_ai_task_log(row)
        if row.root_task_id in {None, 0} and parent_task_id is None:
            row.root_task_id = row.id
            self._commit_ai_task_log(row)
        return row

    def _commit_ai_task_log(self, row: RecruitmentAITaskLog) -> RecruitmentAITaskLog:
        self.db.add(row)
        try:
            self.db.commit()
            self.db.refresh(row)
            return row
        except DataError as exc:
            self.db.rollback()
            logger.warning("AI task log payload exceeded current column capacity, retrying with compacted fields: %s", exc)
            row.prompt_snapshot = _truncate_utf8_text(row.prompt_snapshot, 60000)
            row.full_request_snapshot = _truncate_utf8_text(row.full_request_snapshot, 60000)
            row.output_summary = _truncate_utf8_text(row.output_summary, 60000)
            row.output_snapshot = _prepare_ai_task_output_snapshot(row.output_snapshot, max_bytes=AI_TASK_LOG_OUTPUT_SNAPSHOT_RETRY_LIMIT)
            row.related_skill_snapshots_json = _truncate_utf8_text(row.related_skill_snapshots_json, 60000)
            row.skill_resolution_detail_json = _truncate_utf8_text(row.skill_resolution_detail_json, 60000)
            row.score_rule_snapshot_json = _truncate_utf8_text(row.score_rule_snapshot_json, 60000)
            row.timing_breakdown_json = _truncate_utf8_text(row.timing_breakdown_json, 60000)
            row.raw_response_text = _truncate_utf8_text(row.raw_response_text, 60000)
            row.parsed_response_json = _truncate_utf8_text(row.parsed_response_json, 60000)
            row.sanitized_response_json = _truncate_utf8_text(row.sanitized_response_json, 60000)
            row.validation_meta_json = _truncate_utf8_text(row.validation_meta_json, 60000)
            row.persisted_result_refs_json = _truncate_utf8_text(row.persisted_result_refs_json, 60000)
            self.db.add(row)
            try:
                self.db.commit()
                self.db.refresh(row)
                return row
            except SQLAlchemyError as retry_exc:
                self.db.rollback()
                logger.warning("AI task log retry failed; continue without blocking main flow: %s", retry_exc)
                return row
        except SQLAlchemyError as exc:
            self.db.rollback()
            logger.warning("AI task log persistence failed; continue without blocking main flow: %s", exc)
            return row

    def _update_ai_task_log(
        self,
        row: RecruitmentAITaskLog,
        *,
        provider: Optional[str] = None,
        model_name: Optional[str] = None,
        status: Optional[str] = None,
        stage: Optional[str] = None,
        prompt_snapshot: Optional[str] = None,
        full_request_snapshot: Optional[Any] = None,
        input_summary: Optional[str] = None,
        output_summary: Optional[str] = None,
        output_snapshot: Optional[Any] = None,
        error_message: Optional[str] = None,
        memory_source: Optional[str] = None,
        batch_id: Optional[str] = None,
        screening_run_id: Optional[str] = None,
        parent_task_id: Optional[int] = None,
        root_task_id: Optional[int] = None,
        related_skill_ids: Optional[Iterable[Any]] = None,
        related_skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
        skill_resolution_source: Optional[str] = None,
        skill_resolution_detail: Optional[Any] = None,
        score_rule_snapshot: Optional[Any] = None,
        raw_response_text: Optional[str] = None,
        parsed_response_json: Optional[Any] = None,
        sanitized_response_json: Optional[Any] = None,
        validation_meta: Optional[Any] = None,
        persisted_result_refs: Optional[Any] = None,
        timing_breakdown: Optional[Any] = None,
    ) -> RecruitmentAITaskLog:
        try:
            self.db.refresh(row)
        except Exception:
            pass
        if row.status == "cancelled" and status not in {None, "cancelled"}:
            return row
        now = datetime.now()
        if provider is not None:
            row.model_provider = provider
        if model_name is not None:
            row.model_name = model_name
        if status is not None:
            row.status = status
        if stage is not None:
            normalized_stage = str(stage or "").strip() or None
            if normalized_stage:
                row.stage = normalized_stage
                row.stage_started_at = row.stage_started_at or now
                if normalized_stage in TERMINAL_SCREENING_STAGES:
                    row.stage_completed_at = now
        if prompt_snapshot is not None:
            row.prompt_snapshot = _truncate_utf8_text(prompt_snapshot, AI_TASK_LOG_PROMPT_LIMIT)
        if full_request_snapshot is not None:
            row.full_request_snapshot = _truncate_utf8_text(_snapshot_text(full_request_snapshot), AI_TASK_LOG_REQUEST_LIMIT)
        if input_summary is not None:
            row.input_summary = _truncate_utf8_text(input_summary, AI_TASK_LOG_SUMMARY_LIMIT)
        if output_summary is not None:
            row.output_summary = _truncate_utf8_text(output_summary, AI_TASK_LOG_SUMMARY_LIMIT)
        if output_snapshot is not None:
            row.output_snapshot = _prepare_ai_task_output_snapshot(output_snapshot, max_bytes=AI_TASK_LOG_OUTPUT_SNAPSHOT_LIMIT)
        if error_message is not None:
            row.error_message = _truncate_utf8_text(error_message, AI_TASK_LOG_SUMMARY_LIMIT)
        if memory_source is not None:
            row.memory_source = memory_source
        if batch_id is not None:
            row.batch_id = batch_id
        if screening_run_id is not None:
            row.screening_run_id = screening_run_id
        if parent_task_id is not None:
            row.parent_task_id = parent_task_id
        if root_task_id is not None:
            row.root_task_id = root_task_id
        if related_skill_ids is not None:
            row.related_skill_ids_json = json_dumps_safe(_dedupe_ints(related_skill_ids))
        if related_skill_snapshots is not None:
            row.related_skill_snapshots_json = json_dumps_safe(list(related_skill_snapshots))
        if skill_resolution_source is not None:
            row.skill_resolution_source = skill_resolution_source
        if skill_resolution_detail is not None:
            row.skill_resolution_detail_json = _prepare_ai_task_json_text(skill_resolution_detail)
        if score_rule_snapshot is not None:
            row.score_rule_snapshot_json = _prepare_ai_task_json_text(score_rule_snapshot)
        if raw_response_text is not None:
            row.raw_response_text = _truncate_utf8_text(raw_response_text, AI_TASK_LOG_JSON_FIELD_LIMIT)
        if parsed_response_json is not None:
            row.parsed_response_json = _prepare_ai_task_json_text(parsed_response_json)
        if sanitized_response_json is not None:
            row.sanitized_response_json = _prepare_ai_task_json_text(sanitized_response_json)
        if validation_meta is not None:
            row.validation_meta_json = _prepare_ai_task_json_text(validation_meta)
        if persisted_result_refs is not None:
            row.persisted_result_refs_json = _prepare_ai_task_json_text(persisted_result_refs)
        if timing_breakdown is not None:
            row.timing_breakdown_json = _prepare_ai_task_json_text(timing_breakdown)
        if row.status in TERMINAL_AI_TASK_STATUSES:
            row.stage_completed_at = row.stage_completed_at or now
            anchor = row.stage_started_at or row.created_at or now
            row.duration_ms = max(0, int((row.stage_completed_at - anchor).total_seconds() * 1000))
        return self._commit_ai_task_log(row)

    def _finish_ai_task_log(
        self,
        row: RecruitmentAITaskLog,
        *,
        status: str,
        stage: Optional[str] = None,
        provider: Optional[str] = None,
        model_name: Optional[str] = None,
        prompt_snapshot: Optional[str] = None,
        full_request_snapshot: Optional[Any] = None,
        input_summary: Optional[str] = None,
        output_summary: Optional[str] = None,
        output_snapshot: Optional[Any] = None,
        error_message: Optional[str] = None,
        token_usage: Optional[Dict[str, Any]] = None,
        memory_source: Optional[str] = None,
        batch_id: Optional[str] = None,
        related_skill_ids: Optional[Iterable[Any]] = None,
        related_skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
        screening_run_id: Optional[str] = None,
        parent_task_id: Optional[int] = None,
        root_task_id: Optional[int] = None,
        skill_resolution_source: Optional[str] = None,
        skill_resolution_detail: Optional[Any] = None,
        score_rule_snapshot: Optional[Any] = None,
        raw_response_text: Optional[str] = None,
        parsed_response_json: Optional[Any] = None,
        sanitized_response_json: Optional[Any] = None,
        validation_meta: Optional[Any] = None,
        persisted_result_refs: Optional[Any] = None,
        timing_breakdown: Optional[Any] = None,
    ) -> RecruitmentAITaskLog:
        try:
            self.db.refresh(row)
        except Exception:
            pass
        if row.status == "cancelled":
            return row
        now = datetime.now()
        row.status = status
        terminal_stage = str(stage or "").strip() or (
            "cancelled"
            if status == "cancelled"
            else "failed"
            if status in {"failed", "invalid_result", "json_parse_failed", "timeout", "retry_exhausted", "rate_limited", "upstream_timeout", "request_failed", "screening_total_timeout"}
            else "completed"
        )
        row.stage = terminal_stage
        row.stage_started_at = row.stage_started_at or row.created_at or now
        row.stage_completed_at = now
        row.duration_ms = max(0, int((row.stage_completed_at - row.stage_started_at).total_seconds() * 1000))
        row.model_provider = provider
        row.model_name = model_name
        row.prompt_snapshot = _truncate_utf8_text(prompt_snapshot, AI_TASK_LOG_PROMPT_LIMIT)
        row.full_request_snapshot = _truncate_utf8_text(_snapshot_text(full_request_snapshot), AI_TASK_LOG_REQUEST_LIMIT)
        row.input_summary = _truncate_utf8_text(input_summary, AI_TASK_LOG_SUMMARY_LIMIT)
        row.output_summary = _truncate_utf8_text(output_summary, AI_TASK_LOG_SUMMARY_LIMIT)
        row.output_snapshot = _prepare_ai_task_output_snapshot(output_snapshot, max_bytes=AI_TASK_LOG_OUTPUT_SNAPSHOT_LIMIT)
        row.error_message = _truncate_utf8_text(error_message, AI_TASK_LOG_SUMMARY_LIMIT)
        row.token_usage_json = json_dumps_safe(token_usage or {}) if token_usage else None
        if memory_source is not None:
            row.memory_source = memory_source
        if batch_id is not None:
            row.batch_id = batch_id
        if screening_run_id is not None:
            row.screening_run_id = screening_run_id
        if parent_task_id is not None:
            row.parent_task_id = parent_task_id
        if root_task_id is not None:
            row.root_task_id = root_task_id
        if related_skill_ids is not None:
            row.related_skill_ids_json = json_dumps_safe(_dedupe_ints(related_skill_ids))
        if related_skill_snapshots is not None:
            row.related_skill_snapshots_json = json_dumps_safe(list(related_skill_snapshots))
        if skill_resolution_source is not None:
            row.skill_resolution_source = skill_resolution_source
        if skill_resolution_detail is not None:
            row.skill_resolution_detail_json = _prepare_ai_task_json_text(skill_resolution_detail)
        if score_rule_snapshot is not None:
            row.score_rule_snapshot_json = _prepare_ai_task_json_text(score_rule_snapshot)
        if raw_response_text is not None:
            row.raw_response_text = _truncate_utf8_text(raw_response_text, AI_TASK_LOG_JSON_FIELD_LIMIT)
        if parsed_response_json is not None:
            row.parsed_response_json = _prepare_ai_task_json_text(parsed_response_json)
        if sanitized_response_json is not None:
            row.sanitized_response_json = _prepare_ai_task_json_text(sanitized_response_json)
        if validation_meta is not None:
            row.validation_meta_json = _prepare_ai_task_json_text(validation_meta)
        if persisted_result_refs is not None:
            row.persisted_result_refs_json = _prepare_ai_task_json_text(persisted_result_refs)
        if timing_breakdown is not None:
            row.timing_breakdown_json = _prepare_ai_task_json_text(timing_breakdown)
        return self._commit_ai_task_log(row)

    def _append_ai_task_warning(self, row: RecruitmentAITaskLog, warning: str) -> RecruitmentAITaskLog:
        text = str(warning or "").strip()
        if not text:
            return row
        current_meta = _decode_ai_task_json_text(row.validation_meta_json, {})
        if not isinstance(current_meta, dict):
            current_meta = {}
        validation_warnings = _normalize_score_warning_items(
            [*(current_meta.get("validation_warnings") or []), text],
            limit=12,
        )
        current_meta["validation_warnings"] = validation_warnings
        current_snapshot = _decode_ai_task_json_text(row.output_snapshot, {})
        if isinstance(current_snapshot, dict):
            current_snapshot["warning_messages"] = _dedupe_texts([*(current_snapshot.get("warning_messages") or []), text])
        return self._update_ai_task_log(
            row,
            validation_meta=current_meta,
            output_snapshot=current_snapshot if isinstance(current_snapshot, dict) else None,
        )

    def _touch_ai_task_heartbeat(
        self,
        task_id: int,
        *,
        stage: str,
        message: str,
    ) -> None:
        heartbeat_db = SessionLocal()
        try:
            heartbeat_service = RecruitmentService(heartbeat_db)
            row = heartbeat_service._get_ai_task_log_row(task_id)
            if row.status in TERMINAL_AI_TASK_STATUSES:
                return
            current_snapshot = _decode_ai_task_json_text(getattr(row, "output_snapshot", None), {})
            if not isinstance(current_snapshot, dict):
                current_snapshot = {}
            heartbeat_service._update_ai_task_log(
                row,
                status=row.status or "running",
                stage=stage,
                output_summary=message,
                output_snapshot={
                    **current_snapshot,
                    "stage": stage,
                    "heartbeat_at": datetime.now().isoformat(),
                    "current_stage_message": message,
                },
            )
        except Exception:
            heartbeat_db.rollback()
        finally:
            heartbeat_db.close()

    @contextmanager
    def _screening_stage_heartbeat(
        self,
        *,
        root_task_id: Optional[int],
        stage: str,
        message: str,
    ):
        stop_event = threading.Event()
        thread: Optional[threading.Thread] = None

        def _loop() -> None:
            while not stop_event.wait(SCREENING_HEARTBEAT_INTERVAL_SECONDS):
                if root_task_id is None:
                    continue
                self._touch_ai_task_heartbeat(
                    root_task_id,
                    stage=stage,
                    message=message,
                )

        if root_task_id is not None:
            thread = threading.Thread(
                target=_loop,
                name=f"screening-heartbeat-{root_task_id}",
                daemon=True,
            )
            thread.start()
        try:
            yield
        finally:
            stop_event.set()
            if thread is not None:
                thread.join(timeout=0.2)

    def _task_is_ready_for_dispatch(self, row: RecruitmentAITaskLog) -> bool:
        snapshot = _decode_ai_task_json_text(getattr(row, "output_snapshot", None), {}) if getattr(row, "output_snapshot", None) else {}
        next_retry_at = None
        if isinstance(snapshot, dict):
            next_retry_at = snapshot.get("next_retry_at")
        parsed_next_retry_at = _parse_iso_datetime_value(next_retry_at)
        if not parsed_next_retry_at:
            return True
        return parsed_next_retry_at <= datetime.now()

    def _mark_screening_task_claimed(self, row: RecruitmentAITaskLog, *, claimed_at: Optional[datetime] = None) -> None:
        now = claimed_at or datetime.now()
        current_snapshot = _decode_ai_task_json_text(getattr(row, "output_snapshot", None), {})
        if not isinstance(current_snapshot, dict):
            current_snapshot = {}
        row.status = "pending"
        row.stage = "pending"
        row.stage_started_at = now
        row.stage_completed_at = None
        row.duration_ms = None
        row.error_message = None
        row.output_summary = _truncate_utf8_text("任务已领取，等待执行。", AI_TASK_LOG_SUMMARY_LIMIT)
        row.output_snapshot = _prepare_ai_task_output_snapshot(
            {
                **current_snapshot,
                "task_type": SCREENING_FLOW_TASK_TYPE,
                "stage": "pending",
                "dispatch_claimed_at": now.isoformat(),
                "auto_requeue_scheduled": False,
                "run_completed": False,
            },
            max_bytes=AI_TASK_LOG_OUTPUT_SNAPSHOT_LIMIT,
        )
        self.db.add(row)

    def _requeue_screening_root_task(self, row: RecruitmentAITaskLog, *, reason: str, requeued_at: Optional[datetime] = None) -> None:
        now = requeued_at or datetime.now()
        current_snapshot = _decode_ai_task_json_text(getattr(row, "output_snapshot", None), {})
        current_validation = _decode_ai_task_json_text(getattr(row, "validation_meta_json", None), {})
        if not isinstance(current_snapshot, dict):
            current_snapshot = {}
        if not isinstance(current_validation, dict):
            current_validation = {}
        row.status = "queued"
        row.stage = "queued"
        row.stage_started_at = now
        row.stage_completed_at = None
        row.duration_ms = None
        row.error_message = None
        row.output_summary = _truncate_utf8_text("检测到任务中断，系统已重新入队。", AI_TASK_LOG_SUMMARY_LIMIT)
        row.output_snapshot = _prepare_ai_task_output_snapshot(
            {
                **current_snapshot,
                "task_type": SCREENING_FLOW_TASK_TYPE,
                "stage": "queued",
                "startup_resume_scheduled": reason == "startup_resume",
                "startup_resumed_at": now.isoformat() if reason == "startup_resume" else current_snapshot.get("startup_resumed_at"),
                "dispatch_claimed_at": None,
                "run_completed": False,
            },
            max_bytes=AI_TASK_LOG_OUTPUT_SNAPSHOT_LIMIT,
        )
        row.validation_meta_json = _prepare_ai_task_json_text(
            {
                **current_validation,
                "startup_resume_scheduled": reason == "startup_resume",
            }
        )
        self.db.add(row)

    def resume_screening_queue_on_startup(self) -> Dict[str, Any]:
        stale_before = datetime.now() - timedelta(minutes=SCREENING_ORPHAN_STALE_MINUTES)
        rows = self.db.query(RecruitmentAITaskLog).filter(
            self._screening_root_task_filter(),
            RecruitmentAITaskLog.status.in_(["pending", "queued", "running"]),
        ).order_by(
            RecruitmentAITaskLog.updated_at.asc(),
            RecruitmentAITaskLog.id.asc(),
        ).all()
        requeued_ids: List[int] = []
        for row in rows:
            checkpoint = row.updated_at or row.stage_started_at or row.created_at or datetime.now()
            if checkpoint >= stale_before:
                continue
            self._requeue_screening_root_task(row, reason="startup_resume")
            requeued_ids.append(int(row.id))
        if requeued_ids:
            self.db.commit()
        with _screening_worker_lock:
            for task_id in requeued_ids:
                _screening_worker_active_task_ids.discard(task_id)
        dispatch_payload = self._dispatch_screening_queue()
        return {
            "requeued_task_ids": requeued_ids,
            "requeued_count": len(requeued_ids),
            "dispatch": dispatch_payload,
        }

    def _schedule_screening_infra_retry(
        self,
        row: RecruitmentAITaskLog,
        *,
        failure_code: str,
        failure_message: str,
    ) -> RecruitmentAITaskLog:
        now = datetime.now()
        current_snapshot = _decode_ai_task_json_text(getattr(row, "output_snapshot", None), {})
        current_validation = _decode_ai_task_json_text(getattr(row, "validation_meta_json", None), {})
        if not isinstance(current_snapshot, dict):
            current_snapshot = {}
        if not isinstance(current_validation, dict):
            current_validation = {}
        previous_retry_count = 0
        for source in (current_validation, current_snapshot):
            try:
                previous_retry_count = max(previous_retry_count, int(source.get("infra_retry_count") or 0))
            except Exception:
                continue
        next_retry_count = previous_retry_count + 1
        retry_after_seconds = _compute_infra_retry_delay_seconds(failure_code, next_retry_count)
        next_retry_at = now + timedelta(seconds=retry_after_seconds)
        retry_message = (
            "上游限流，稍后自动重试"
            if failure_code == "rate_limited"
            else "上游超时，稍后自动重试"
            if failure_code == "upstream_timeout"
            else "上游请求失败，稍后自动重试"
        )
        global _screening_provider_cooldown_until
        if failure_code == "rate_limited":
            with _screening_worker_lock:
                if _screening_provider_cooldown_until is None or next_retry_at > _screening_provider_cooldown_until:
                    _screening_provider_cooldown_until = next_retry_at
        row.status = "queued"
        row.stage = "queued"
        row.stage_started_at = now
        row.stage_completed_at = None
        row.duration_ms = None
        row.error_message = None
        row.output_summary = _truncate_utf8_text(retry_message, AI_TASK_LOG_SUMMARY_LIMIT)
        row.output_snapshot = _prepare_ai_task_output_snapshot(
            {
                **current_snapshot,
                "task_type": SCREENING_FLOW_TASK_TYPE,
                "stage": "queued",
                "failure_code": failure_code,
                "auto_requeue_scheduled": True,
                "infra_retry_count": next_retry_count,
                "retry_after_seconds": retry_after_seconds,
                "next_retry_at": next_retry_at.isoformat(),
                "last_infra_error": failure_message,
                "run_completed": False,
            },
            max_bytes=AI_TASK_LOG_OUTPUT_SNAPSHOT_LIMIT,
        )
        row.validation_meta_json = _prepare_ai_task_json_text(
            {
                **current_validation,
                "screening_result_valid": False,
                "screening_result_state": failure_code,
                "failure_code": failure_code,
                "auto_requeue_scheduled": True,
                "infra_retry_count": next_retry_count,
                "retry_after_seconds": retry_after_seconds,
                "next_retry_at": next_retry_at.isoformat(),
                "last_infra_error": failure_message,
                "invalid_result_reasons": _normalize_score_warning_items([failure_message], limit=12),
                "invalid_result_summary": retry_message,
            }
        )
        self.db.add(row)
        self._commit_ai_task_log(row)
        logger.warning(
            "screening_flow infra retry scheduled task_id=%s run_id=%s failure_code=%s retry_count=%s next_retry_at=%s",
            row.id,
            row.screening_run_id,
            failure_code,
            next_retry_count,
            next_retry_at.isoformat(),
        )
        return row

    def _serialize_skill(self, row: RecruitmentSkill) -> Dict[str, Any]:
        meta = _extract_skill_runtime_meta(row)
        return {"id": row.id, "skill_code": row.skill_code, "org_code": normalize_org_code(getattr(row, "org_code", None)), "scope_level": getattr(row, "scope_level", None) or "ORG", "share_policy": normalize_share_policy(getattr(row, "share_policy", None)), "allow_sub_org_use": bool(getattr(row, "allow_sub_org_use", False)), "allow_copy": bool(getattr(row, "allow_copy", False)), "is_system_base": bool(getattr(row, "is_system_base", False)), "name": row.name, "description": row.description, "skill_group": row.skill_group or meta.get("group"), "version": row.version or meta.get("version"), "task_types": list(meta.get("tasks") or []), "content": row.content, "tags": json_loads_safe(row.tags_json, []), "sort_order": row.sort_order, "is_enabled": bool(row.is_enabled), "created_by": row.created_by, "updated_by": row.updated_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _serialize_skill_snapshot(self, skill: Any, fallback_index: int = 0) -> Dict[str, Any]:
        if isinstance(skill, dict):
            tags = skill.get("tags") or []
            meta = _extract_skill_runtime_meta(skill)
            return {
                "id": int(skill.get("id") or (-(fallback_index + 1))),
                "skill_code": str(skill.get("skill_code") or f"snapshot-{fallback_index + 1}"),
                "name": str(skill.get("name") or f"Skill #{fallback_index + 1}"),
                "description": skill.get("description"),
                "skill_group": skill.get("skill_group") or meta.get("group"),
                "version": skill.get("version") or meta.get("version"),
                "task_types": list(skill.get("task_types") or meta.get("tasks") or []),
                "content": str(skill.get("content") or ""),
                "tags": tags if isinstance(tags, list) else [],
                "sort_order": int(skill.get("sort_order") or 999),
                "is_enabled": bool(skill.get("is_enabled", True)),
            }
        if isinstance(skill, RecruitmentSkill):
            meta = _extract_skill_runtime_meta(skill)
            return {
                "id": skill.id,
                "skill_code": skill.skill_code,
                "name": skill.name,
                "description": skill.description,
                "skill_group": skill.skill_group or meta.get("group"),
                "version": skill.version or meta.get("version"),
                "task_types": list(meta.get("tasks") or []),
                "content": skill.content,
                "tags": json_loads_safe(skill.tags_json, []),
                "sort_order": skill.sort_order,
                "is_enabled": bool(skill.is_enabled),
            }
        text = str(skill or "").strip()
        return {
            "id": -(fallback_index + 1),
            "skill_code": f"snapshot-{fallback_index + 1}",
            "name": text or f"Skill #{fallback_index + 1}",
            "description": None,
            "skill_group": None,
            "version": None,
            "task_types": [],
            "content": text,
            "tags": [],
            "sort_order": 999,
            "is_enabled": True,
        }

    def _build_skill_snapshots(self, skill_rows: Sequence[RecruitmentSkill], custom_requirements: str = "", *, custom_name: str = "附加硬性要求") -> List[Dict[str, Any]]:
        snapshots = [self._serialize_skill_snapshot(skill, index) for index, skill in enumerate(skill_rows)]
        extra_requirement = str(custom_requirements or "").strip()
        if extra_requirement:
            snapshots.append(
                self._serialize_skill_snapshot(
                    {
                        "id": -(len(snapshots) + 1),
                        "skill_code": "custom-hard-requirement",
                        "name": custom_name,
                        "description": "本次临时追加的招聘硬性条件",
                        "content": extra_requirement,
                        "tags": ["临时条件", "硬性要求"],
                        "sort_order": 10000,
                        "is_enabled": True,
                    },
                    len(snapshots),
                )
            )
        return snapshots

    def _tailor_skill_snapshots_for_task(self, skill_snapshots: Sequence[Dict[str, Any]], task_kind: str) -> List[Dict[str, Any]]:
        # Preserve the authored Skill body exactly as configured so the model
        # receives the same rules the user sees in the Skill editor.
        return [dict(item) for item in skill_snapshots]

    def _extract_related_skill_ids(self, skill_snapshots: Sequence[Dict[str, Any]]) -> List[int]:
        ids: List[int] = []
        for skill in skill_snapshots:
            try:
                skill_id = int(skill.get("id") or 0)
            except (TypeError, ValueError, AttributeError):
                continue
            if skill_id > 0 and skill_id not in ids:
                ids.append(skill_id)
        return ids

    def _calculate_ai_task_duration_ms(self, row: RecruitmentAITaskLog) -> Optional[int]:
        if isinstance(row.duration_ms, int) and row.duration_ms >= 0:
            return row.duration_ms
        if not row.created_at or not row.updated_at:
            return None
        delta = row.updated_at - row.created_at
        duration_ms = int(delta.total_seconds() * 1000)
        if duration_ms < 0:
            return None
        return duration_ms

    def _serialize_ai_task_log(
        self,
        row: RecruitmentAITaskLog,
        *,
        include_full_request_snapshot: bool = False,
        compact: bool = False,
    ) -> Dict[str, Any]:
        payload = {
            "id": row.id,
            "task_type": row.task_type,
            "screening_run_id": row.screening_run_id,
            "batch_id": getattr(row, "batch_id", None),
            "parent_task_id": row.parent_task_id,
            "root_task_id": row.root_task_id,
            "stage": row.stage,
            "stage_started_at": isoformat_or_none(row.stage_started_at),
            "stage_completed_at": isoformat_or_none(row.stage_completed_at),
            "related_position_id": row.related_position_id,
            "related_candidate_id": row.related_candidate_id,
            "related_skill_id": row.related_skill_id,
            "related_skill_ids": json_loads_safe(row.related_skill_ids_json, []),
            "related_skill_snapshots": json_loads_safe(row.related_skill_snapshots_json, []),
            "related_resume_file_id": row.related_resume_file_id,
            "related_publish_task_id": row.related_publish_task_id,
            "memory_source": row.memory_source,
            "skill_resolution_source": row.skill_resolution_source,
            "skill_resolution_detail": _decode_ai_task_json_text(row.skill_resolution_detail_json, {}),
            "score_rule_snapshot": _decode_ai_task_json_text(row.score_rule_snapshot_json, []),
            "timing_breakdown": _decode_ai_task_json_text(row.timing_breakdown_json, None),
            "request_hash": row.request_hash,
            "model_provider": row.model_provider,
            "model_name": row.model_name,
            "prompt_snapshot": row.prompt_snapshot,
            "input_summary": row.input_summary,
            "output_summary": row.output_summary,
            "output_snapshot": _decode_ai_task_json_text(row.output_snapshot, row.output_snapshot),
            "raw_response_text": row.raw_response_text,
            "parsed_response_json": _decode_ai_task_json_text(row.parsed_response_json, None),
            "sanitized_response_json": _decode_ai_task_json_text(row.sanitized_response_json, None),
            "validation_meta": _decode_ai_task_json_text(row.validation_meta_json, None),
            "persisted_result_refs": _decode_ai_task_json_text(row.persisted_result_refs_json, None),
            "duration_ms": self._calculate_ai_task_duration_ms(row),
            "status": row.status,
            "error_message": row.error_message,
            "token_usage": json_loads_safe(row.token_usage_json, None),
            "created_by": row.created_by,
            "created_at": isoformat_or_none(row.created_at),
            "updated_at": isoformat_or_none(row.updated_at),
        }
        if include_full_request_snapshot:
            payload["full_request_snapshot"] = row.full_request_snapshot
        if compact:
            payload["prompt_snapshot"] = _truncate_utf8_text(payload.get("prompt_snapshot"), CANDIDATE_DETAIL_TEXT_PREVIEW_BYTES)
            payload["input_summary"] = _truncate_utf8_text(payload.get("input_summary"), min(CANDIDATE_DETAIL_TEXT_PREVIEW_BYTES, 6000))
            payload["output_summary"] = _truncate_utf8_text(payload.get("output_summary"), min(CANDIDATE_DETAIL_TEXT_PREVIEW_BYTES, 6000))
            payload["error_message"] = _truncate_utf8_text(payload.get("error_message"), min(CANDIDATE_DETAIL_TEXT_PREVIEW_BYTES, 6000))
            payload["raw_response_text"] = _truncate_utf8_text(payload.get("raw_response_text"), CANDIDATE_DETAIL_JSON_PREVIEW_BYTES)
            payload["related_skill_snapshots"] = _compact_candidate_detail_value(payload.get("related_skill_snapshots"))
            payload["skill_resolution_detail"] = _compact_candidate_detail_value(payload.get("skill_resolution_detail"))
            payload["score_rule_snapshot"] = _compact_candidate_detail_value(payload.get("score_rule_snapshot"))
            payload["timing_breakdown"] = _compact_candidate_detail_value(payload.get("timing_breakdown"), max_items=16)
            payload["output_snapshot"] = _compact_candidate_detail_value(payload.get("output_snapshot"))
            payload["parsed_response_json"] = _compact_candidate_detail_value(payload.get("parsed_response_json"))
            payload["sanitized_response_json"] = _compact_candidate_detail_value(payload.get("sanitized_response_json"))
            payload["validation_meta"] = _compact_candidate_detail_value(payload.get("validation_meta"))
            payload["persisted_result_refs"] = _compact_candidate_detail_value(payload.get("persisted_result_refs"), max_items=16)
            payload["token_usage"] = _compact_candidate_detail_value(payload.get("token_usage"), max_items=12)
            if include_full_request_snapshot:
                payload["full_request_snapshot"] = _truncate_utf8_text(payload.get("full_request_snapshot"), CANDIDATE_DETAIL_JSON_PREVIEW_BYTES)
        return payload

    def _serialize_jd_version(self, row: RecruitmentJDVersion) -> Dict[str, Any]:
        return {"id": row.id, "position_id": row.position_id, "version_no": row.version_no, "title": row.title, "prompt_snapshot": row.prompt_snapshot, "jd_markdown": row.jd_markdown or "", "jd_html": row.jd_html, "publish_text": row.publish_text, "notes": row.notes, "is_active": bool(row.is_active), "created_by": row.created_by, "created_at": isoformat_or_none(row.created_at)}

    def _serialize_publish_task(self, row: RecruitmentPublishTask) -> Dict[str, Any]:
        return {"id": row.id, "position_id": row.position_id, "target_platform": row.target_platform, "mode": row.mode, "adapter_code": row.adapter_code, "status": row.status, "request_payload": json_loads_safe(row.request_payload, None), "response_payload": json_loads_safe(row.response_payload, None), "published_url": row.published_url, "screenshot_path": row.screenshot_path, "retry_count": row.retry_count, "error_message": row.error_message, "created_by": row.created_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _get_active_jd_version_for_position(self, row: RecruitmentPosition) -> Optional[RecruitmentJDVersion]:
        current_jd = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.id == row.current_jd_version_id).first() if row.current_jd_version_id else None
        if current_jd:
            return current_jd
        return self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == row.id, RecruitmentJDVersion.is_active.is_(True)).order_by(RecruitmentJDVersion.version_no.desc(), RecruitmentJDVersion.id.desc()).first()

    def _serialize_active_jd_snapshot(self, row: RecruitmentPosition) -> Optional[Dict[str, Any]]:
        current_jd = self._get_active_jd_version_for_position(row)
        if not current_jd:
            return None
        payload = {
            "id": current_jd.id,
            "title": current_jd.title,
            "version_no": current_jd.version_no,
            "notes": current_jd.notes,
        }
        jd_markdown = str(current_jd.jd_markdown or "").strip()
        publish_text = str(current_jd.publish_text or "").strip()
        if jd_markdown:
            payload["jd_markdown"] = truncate_text(jd_markdown, 12000)
        if publish_text:
            payload["publish_text"] = truncate_text(publish_text, 6000)
        return payload

    def _serialize_position(self, row: RecruitmentPosition) -> Dict[str, Any]:
        jd_skill_rows = self._get_position_task_skill_rows(row.id, "jd")
        screening_skill_rows = self._get_position_task_skill_rows(row.id, "screening")
        interview_skill_rows = self._get_position_task_skill_rows(row.id, "interview")
        auto_mail_config = self._get_position_auto_mail_config(row.id)
        current_jd = self._get_active_jd_version_for_position(row)
        jd_version_count = self.db.query(func.count(RecruitmentJDVersion.id)).filter(RecruitmentJDVersion.position_id == row.id).scalar() or 0
        candidate_count = self.db.query(func.count(RecruitmentCandidate.id)).filter(RecruitmentCandidate.position_id == row.id, RecruitmentCandidate.deleted.is_(False)).scalar() or 0
        return {"id": row.id, "position_code": row.position_code, "org_code": normalize_org_code(getattr(row, "org_code", None)), "title": row.title, "department": row.department, "location": row.location, "employment_type": row.employment_type, "salary_range": row.salary_range, "headcount": row.headcount, "key_requirements": row.key_requirements, "bonus_points": row.bonus_points, "summary": row.summary, "status": row.status, "auto_screen_on_upload": bool(row.auto_screen_on_upload), "auto_advance_on_screening": bool(row.auto_advance_on_screening), "auto_mail_enabled": bool(auto_mail_config.get("auto_mail_enabled")), "auto_mail_use_global_recipients": bool(auto_mail_config.get("auto_mail_use_global_recipients")), "auto_mail_use_position_recipients": bool(auto_mail_config.get("auto_mail_use_position_recipients")), "auto_mail_position_recipient_ids": list(auto_mail_config.get("auto_mail_position_recipient_ids") or []), "auto_mail_allowed_candidate_statuses": list(auto_mail_config.get("auto_mail_allowed_candidate_statuses") or []), "auto_mail_template_id": auto_mail_config.get("auto_mail_template_id"), "auto_mail_dedup_mode": auto_mail_config.get("auto_mail_dedup_mode"), "auto_mail_cc_recipient_ids": list(auto_mail_config.get("auto_mail_cc_recipient_ids") or []), "auto_mail_bcc_recipient_ids": list(auto_mail_config.get("auto_mail_bcc_recipient_ids") or []), "jd_skill_ids": [skill.id for skill in jd_skill_rows], "jd_skills": [self._serialize_skill(skill) for skill in jd_skill_rows], "screening_skill_ids": [skill.id for skill in screening_skill_rows], "screening_skills": [self._serialize_skill(skill) for skill in screening_skill_rows], "interview_skill_ids": [skill.id for skill in interview_skill_rows], "interview_skills": [self._serialize_skill(skill) for skill in interview_skill_rows], "tags": json_loads_safe(row.tags_json, []), "current_jd_version_id": row.current_jd_version_id, "current_jd_title": current_jd.title if current_jd else None, "active_jd_snapshot": self._serialize_active_jd_snapshot(row), "jd_version_count": int(jd_version_count), "candidate_count": int(candidate_count), "created_by": row.created_by, "updated_by": row.updated_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _serialize_resume_file(self, row: RecruitmentResumeFile) -> Dict[str, Any]:
        parse_status = row.parse_status
        parse_error = row.parse_error
        if parse_status == "warning":
            parse_row = (
                self.db.query(RecruitmentResumeParseResult)
                .filter(RecruitmentResumeParseResult.resume_file_id == row.id)
                .order_by(RecruitmentResumeParseResult.created_at.desc(), RecruitmentResumeParseResult.id.desc())
                .first()
            )
            if parse_row:
                parsed_payload = self._serialize_parse_result(parse_row)
                if not _resume_parse_has_warning(parsed_payload, parse_row.error_message or parse_error, ""):
                    parse_status = "success"
                    parse_error = None
        return {"id": row.id, "candidate_id": row.candidate_id, "original_name": row.original_name, "stored_name": row.stored_name, "file_ext": row.file_ext, "mime_type": row.mime_type, "file_size": row.file_size, "parse_status": parse_status, "parse_error": parse_error, "created_at": isoformat_or_none(row.created_at)}

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "candidate_statuses": CANDIDATE_STATUS_OPTIONS,
            "position_statuses": POSITION_STATUS_OPTIONS,
            "publish_platforms": [
                {"value": "boss", "label": "BOSS 鐩磋仒"},
                {"value": "zhilian", "label": "鏅鸿仈鎷涜仒"},
                {"value": "mock", "label": "Mock"},
            ],
            "publish_modes": [
                {"value": "mock", "label": "妯℃嫙鍙戝竷"},
                {"value": "live", "label": "瀹為檯鍙戝竷"},
            ],
            "ai_task_types": KNOWN_AI_TASK_TYPES,
            "llm_provider_options": get_provider_options(),
            "llm_task_types": LLM_TASK_TYPE_OPTIONS,
        }

    def get_dashboard(self) -> Dict[str, Any]:
        position_builder = self._apply_business_org_filter(self.db.query(RecruitmentPosition).filter(RecruitmentPosition.deleted.is_(False)), RecruitmentPosition)
        candidate_builder = self._apply_business_org_filter(self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.deleted.is_(False)), RecruitmentCandidate)
        positions = position_builder.all()
        candidates = candidate_builder.all()
        recent_candidates = candidate_builder.order_by(RecruitmentCandidate.created_at.desc(), RecruitmentCandidate.id.desc()).limit(8).all()
        today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow_start = today_start + timedelta(days=1)
        today_ai_task_count = (
            self.db.query(RecruitmentAITaskLog)
            .filter(
                RecruitmentAITaskLog.created_at >= today_start,
                RecruitmentAITaskLog.created_at < tomorrow_start,
            )
            .count()
        )
        distribution: Dict[str, int] = {}
        for candidate in candidates:
            distribution[candidate.status] = distribution.get(candidate.status, 0) + 1
        return {
            "cards": {
                "positions_total": len(positions),
                "positions_recruiting": len([item for item in positions if item.status == "recruiting"]),
                "candidates_total": len(candidates),
                "pending_screening": len([item for item in candidates if item.status == "pending_screening"]),
                "screening_passed": len(
                    [
                        item
                        for item in candidates
                        if item.status in {"screening_passed", "pending_interview", "interview_passed", "pending_offer", "offer_sent", "hired"}
                    ]
                ),
                "recent_ai_tasks": today_ai_task_count,
            },
            "status_distribution": [{"status": key, "count": value} for key, value in sorted(distribution.items(), key=lambda item: item[0])],
            "recent_candidates": [self._serialize_candidate_summary(item) for item in recent_candidates],
        }

    def list_positions(self, query: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        builder = self._apply_business_org_filter(self.db.query(RecruitmentPosition).filter(RecruitmentPosition.deleted.is_(False)), RecruitmentPosition)
        if status:
            builder = builder.filter(RecruitmentPosition.status == status)
        if query:
            keyword = f"%{query.strip()}%"
            builder = builder.filter(or_(RecruitmentPosition.title.like(keyword), RecruitmentPosition.department.like(keyword), RecruitmentPosition.location.like(keyword), RecruitmentPosition.summary.like(keyword)))
        return [self._serialize_position(row) for row in builder.order_by(RecruitmentPosition.updated_at.desc(), RecruitmentPosition.id.desc()).all()]

    def create_position(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        org_code = normalize_org_code(payload.get("org_code") or self._current_org_code())
        self._assert_can_create_in_org(org_code)
        row = RecruitmentPosition(position_code=f"TMP-{uuid.uuid4().hex[:8]}", org_code=org_code, title=str(payload.get("title") or "").strip(), department=payload.get("department"), location=payload.get("location"), employment_type=payload.get("employment_type"), salary_range=payload.get("salary_range"), headcount=int(payload.get("headcount") or 1), key_requirements=payload.get("key_requirements"), bonus_points=payload.get("bonus_points"), summary=payload.get("summary"), status=payload.get("status") or "draft", auto_screen_on_upload=bool(payload.get("auto_screen_on_upload")), auto_advance_on_screening=payload.get("auto_advance_on_screening") is not False, jd_skill_ids_json=json_dumps_safe(_dedupe_ints(payload.get("jd_skill_ids") or [])), screening_skill_ids_json=json_dumps_safe(_dedupe_ints(payload.get("screening_skill_ids") or [])), interview_skill_ids_json=json_dumps_safe(_dedupe_ints(payload.get("interview_skill_ids") or [])), tags_json=json_dumps_safe(payload.get("tags") or []), created_by=actor_id, updated_by=actor_id, deleted=False)
        self.db.add(row)
        self.db.flush()
        row.position_code = f"POS-{row.id:05d}"
        self._sync_position_task_skill_bindings(
            row,
            actor_id=actor_id,
            jd_skill_ids=payload.get("jd_skill_ids") or [],
            screening_skill_ids=payload.get("screening_skill_ids") or [],
            interview_skill_ids=payload.get("interview_skill_ids") or [],
        )
        auto_mail_config = self._normalize_position_auto_mail_config(payload)
        self._upsert_json_rule_config(
            POSITION_AUTO_MAIL_CONFIG_KEY,
            auto_mail_config,
            scope="position",
            scope_id=row.id,
            description="岗位级初筛自动邮件推送配置",
        )
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_position(row)

    def update_position(self, position_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = self._get_position(position_id)
        for field in ["title", "department", "location", "employment_type", "salary_range", "headcount", "key_requirements", "bonus_points", "summary", "status", "auto_screen_on_upload", "auto_advance_on_screening"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "tags" in payload:
            row.tags_json = json_dumps_safe(payload.get("tags") or [])
        if any(field in payload for field in ["jd_skill_ids", "screening_skill_ids", "interview_skill_ids"]):
            self._sync_position_task_skill_bindings(
                row,
                actor_id=actor_id,
                jd_skill_ids=payload.get("jd_skill_ids") if "jd_skill_ids" in payload else None,
                screening_skill_ids=payload.get("screening_skill_ids") if "screening_skill_ids" in payload else None,
                interview_skill_ids=payload.get("interview_skill_ids") if "interview_skill_ids" in payload else None,
            )
        auto_mail_payload_fields = {
            "auto_mail_enabled",
            "auto_mail_use_global_recipients",
            "auto_mail_use_position_recipients",
            "auto_mail_position_recipient_ids",
            "auto_mail_allowed_candidate_statuses",
            "auto_mail_template_id",
            "auto_mail_dedup_mode",
            "auto_mail_cc_recipient_ids",
            "auto_mail_bcc_recipient_ids",
        }
        if any(field in payload for field in auto_mail_payload_fields):
            merged_auto_mail_config = {
                **self._get_position_auto_mail_config(row.id),
                **{field: payload.get(field) for field in auto_mail_payload_fields if field in payload},
            }
            self._upsert_json_rule_config(
                POSITION_AUTO_MAIL_CONFIG_KEY,
                self._normalize_position_auto_mail_config(merged_auto_mail_config),
                scope="position",
                scope_id=row.id,
                description="岗位级初筛自动邮件推送配置",
            )
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_position(row)

    def delete_position(self, position_id: int, actor_id: str) -> None:
        row = self._get_position(position_id)
        row.deleted = True
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()

    def get_position_detail(self, position_id: int) -> Dict[str, Any]:
        row = self._get_position(position_id)
        jd_versions = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == row.id).order_by(RecruitmentJDVersion.version_no.desc(), RecruitmentJDVersion.id.desc()).all()
        current_jd = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.id == row.current_jd_version_id).first() if row.current_jd_version_id else None
        if not current_jd:
            current_jd = next((item for item in jd_versions if item.is_active), None)
        latest_log = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.task_type == "jd_generation", RecruitmentAITaskLog.related_position_id == row.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).first()
        jd_generation = None if not latest_log else {"status": latest_log.status, "task_id": latest_log.id, "last_generated_at": isoformat_or_none(latest_log.updated_at or latest_log.created_at), "started_at": isoformat_or_none(latest_log.created_at), "error_message": latest_log.error_message, "model_provider": latest_log.model_provider, "model_name": latest_log.model_name}
        publish_tasks = self.db.query(RecruitmentPublishTask).filter(RecruitmentPublishTask.position_id == row.id).order_by(RecruitmentPublishTask.created_at.desc(), RecruitmentPublishTask.id.desc()).all()
        candidate_builder = self._apply_business_org_filter(
            self.db.query(RecruitmentCandidate).filter(
                RecruitmentCandidate.position_id == row.id,
                RecruitmentCandidate.deleted.is_(False),
            ),
            RecruitmentCandidate,
        )
        candidates = candidate_builder.order_by(RecruitmentCandidate.updated_at.desc(), RecruitmentCandidate.id.desc()).all()
        return {"position": self._serialize_position(row), "current_jd_version": self._serialize_jd_version(current_jd) if current_jd else None, "jd_versions": [self._serialize_jd_version(item) for item in jd_versions], "jd_generation": jd_generation, "publish_tasks": [self._serialize_publish_task(item) for item in publish_tasks], "candidates": [self._serialize_candidate_summary(item) for item in candidates]}

    def list_skills(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentSkill).filter(RecruitmentSkill.deleted.is_(False)).order_by(RecruitmentSkill.sort_order.asc(), RecruitmentSkill.id.asc()).all()
        return [self._serialize_skill(row) for row in rows if self._can_access_org_resource(row)]

    def create_skill(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        meta = _extract_skill_runtime_meta(payload)
        org_code = normalize_org_code(payload.get("org_code") or self._current_org_code())
        self._assert_can_create_in_org(org_code)
        row = RecruitmentSkill(skill_code=f"skill-{_slugify(str(payload.get('name') or 'skill'))}-{uuid.uuid4().hex[:4]}", org_code=org_code, scope_level=str(payload.get("scope_level") or "ORG").strip().upper() or "ORG", share_policy=normalize_share_policy(payload.get("share_policy")), allow_sub_org_use=bool(payload.get("allow_sub_org_use")), allow_copy=bool(payload.get("allow_copy")), is_system_base=False, name=str(payload.get("name") or "").strip(), description=payload.get("description"), skill_group=str(payload.get("skill_group") or meta.get("group") or "").strip() or None, version=str(payload.get("version") or meta.get("version") or "").strip() or None, content=str(payload.get("content") or "").strip(), tags_json=json_dumps_safe(payload.get("tags") or []), sort_order=int(payload.get("sort_order") or 99), is_enabled=payload.get("is_enabled") is not False, created_by=actor_id, updated_by=actor_id, deleted=False)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_skill(row)

    def update_skill(self, skill_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = self._get_skill(skill_id)
        self._assert_resource_manageable(row, actor_id)
        for field in ["name", "description", "content", "sort_order", "is_enabled", "scope_level", "allow_sub_org_use", "allow_copy"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "share_policy" in payload:
            row.share_policy = normalize_share_policy(payload.get("share_policy"))
        if "org_code" in payload:
            next_org_code = normalize_org_code(payload.get("org_code"))
            self._assert_can_create_in_org(next_org_code)
            row.org_code = next_org_code
        if "tags" in payload:
            row.tags_json = json_dumps_safe(payload.get("tags") or [])
        runtime_meta = _extract_skill_runtime_meta(
            {
                "skill_code": row.skill_code,
                "name": payload.get("name") if "name" in payload else row.name,
                "description": payload.get("description") if "description" in payload else row.description,
                "content": payload.get("content") if "content" in payload else row.content,
                "tags": payload.get("tags") if "tags" in payload else json_loads_safe(row.tags_json, []),
                "skill_group": payload.get("skill_group") if "skill_group" in payload else row.skill_group,
                "version": payload.get("version") if "version" in payload else row.version,
            }
        )
        if "skill_group" in payload or "content" in payload or "tags" in payload:
            row.skill_group = str(payload.get("skill_group") or runtime_meta.get("group") or "").strip() or None
        if "version" in payload or "content" in payload or "tags" in payload:
            row.version = str(payload.get("version") or runtime_meta.get("version") or "").strip() or None
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_skill(row)

    def copy_skill(self, skill_id: int, actor_id: str, target_org_code: Optional[str] = None) -> Dict[str, Any]:
        source = self._get_skill(skill_id)
        self._assert_resource_copyable(source)
        org_code = normalize_org_code(target_org_code or self._current_org_code())
        self._assert_can_create_in_org(org_code)
        row = RecruitmentSkill(
            skill_code=f"skill-{_slugify(str(source.name or 'skill'))}-{uuid.uuid4().hex[:4]}",
            org_code=org_code,
            scope_level="ORG",
            share_policy="PRIVATE",
            allow_sub_org_use=False,
            allow_copy=False,
            is_system_base=False,
            name=f"{source.name} Copy",
            description=source.description,
            skill_group=source.skill_group,
            version=source.version,
            content=source.content,
            tags_json=source.tags_json,
            sort_order=source.sort_order,
            is_enabled=bool(source.is_enabled),
            created_by=actor_id,
            updated_by=actor_id,
            deleted=False,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_skill(row)

    def delete_skill(self, skill_id: int, actor_id: str) -> None:
        row = self._get_skill(skill_id)
        self._assert_resource_manageable(row, actor_id)
        row.deleted = True
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()

    def toggle_skill(self, skill_id: int, enabled: bool, actor_id: str) -> Dict[str, Any]:
        row = self._get_skill(skill_id)
        self._assert_resource_manageable(row, actor_id)
        row.is_enabled = bool(enabled)
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_skill(row)
    def _serialize_parse_result(self, row: RecruitmentResumeParseResult, *, compact: bool = False) -> Dict[str, Any]:
        parsed_resume = {
            "basic_info": json_loads_safe(row.basic_info_json, {}),
            "work_experiences": json_loads_safe(row.work_experiences_json, []),
            "education_experiences": json_loads_safe(row.education_experiences_json, []),
            "skills": json_loads_safe(row.skills_json, []),
            "projects": json_loads_safe(row.projects_json, []),
            "summary": row.summary_text,
        }
        payload = {
            "id": row.id,
            "candidate_id": row.candidate_id,
            "resume_file_id": row.resume_file_id,
            "raw_text": row.raw_text or "",
            **parsed_resume,
            "status": row.status,
            "error_message": row.error_message,
            "created_at": isoformat_or_none(row.created_at),
        }
        if compact:
            payload["raw_text"] = _truncate_utf8_text(payload.get("raw_text"), CANDIDATE_DETAIL_JSON_PREVIEW_BYTES)
            payload["basic_info"] = _compact_candidate_detail_value(payload.get("basic_info"), max_items=12)
            payload["work_experiences"] = _compact_candidate_detail_value(payload.get("work_experiences"))
            payload["education_experiences"] = _compact_candidate_detail_value(payload.get("education_experiences"))
            payload["skills"] = _compact_candidate_detail_value(payload.get("skills"))
            payload["projects"] = _compact_candidate_detail_value(payload.get("projects"))
            payload["summary"] = _truncate_utf8_text(payload.get("summary"), CANDIDATE_DETAIL_TEXT_PREVIEW_BYTES)
        return payload

    def _serialize_score(self, row: RecruitmentCandidateScore) -> Dict[str, Any]:
        payload = json_loads_safe(row.score_json, {})
        if isinstance(payload, dict) and payload.get("_storage_format") == RAW_SCREENING_SCORE_STORAGE_FORMAT:
            raw_score = payload.get("score") if isinstance(payload.get("score"), dict) else {}
            debug_payload = payload.get("debug") if isinstance(payload.get("debug"), dict) else {}
            row_total_score = _parse_score_number(row.total_score)
            row_match_percent = _parse_score_number(row.match_percent)
            return {
                "id": row.id,
                "candidate_id": row.candidate_id,
                "parse_result_id": row.parse_result_id,
                "total_score": row_total_score if row_total_score is not None else raw_score.get("total_score"),
                "total_score_scale": 10,
                "match_percent": row_match_percent if row_match_percent is not None else raw_score.get("match_percent"),
                "advantages": _normalize_score_text_items(raw_score.get("advantages"), limit=5),
                "concerns": _normalize_score_text_items(raw_score.get("concerns"), limit=5),
                "recommendation": row.recommendation if row.recommendation is not None else raw_score.get("recommendation"),
                "suggested_status": row.suggested_status or raw_score.get("suggested_status"),
                "dimensions": sanitize_dimensions(raw_score.get("dimensions"), SCREENING_PAYLOAD_SCHEMA_CONFIG.get("score") or {}),
                "score_validation_passed": debug_payload.get("score_validation_passed"),
                "validation_warnings": _normalize_score_warning_items(debug_payload.get("validation_warnings"), limit=8),
                "manual_override_score": row.manual_override_score,
                "manual_override_reason": row.manual_override_reason,
                "created_at": isoformat_or_none(row.created_at),
                "updated_at": isoformat_or_none(row.updated_at),
            }
        normalized_score = payload.get("normalized_score") if isinstance(payload.get("normalized_score"), dict) else None
        score_enhancements = payload.get("score_enhancements") if isinstance(payload.get("score_enhancements"), dict) else None
        if normalized_score is None:
            normalized_score = _shape_resume_score_payload(payload)
        if score_enhancements is None:
            score_enhancements = {
                "dimensions": _normalize_score_dimensions(payload.get("dimensions"), limit=12),
                "dimensions_mode": payload.get("dimensions_mode"),
                "missing_core_labels": list(payload.get("missing_core_labels") or []),
                "score_cap_reason": payload.get("score_cap_reason"),
                "derived_total_score_from_dimensions": _parse_score_number(payload.get("derived_total_score_from_dimensions")),
                "derived_match_percent_from_dimensions": _parse_score_number(payload.get("derived_match_percent_from_dimensions")),
                "score_quality_warnings": _normalize_score_warning_items(payload.get("score_quality_warnings"), limit=8),
                "repair_reason": payload.get("repair_reason"),
                "report_markdown": str(payload.get("report_markdown") or "").strip() or None,
                "risk_flags": list(payload.get("risk_flags") or []),
                "decision_note": payload.get("decision_note"),
                "score_source": payload.get("score_source"),
            }
        if score_enhancements.get("score_source") == "fallback_builder":
            score_enhancements["score_quality_warnings"] = _merge_warning_items(
                ["当前评分来自 fallback_builder，非主模型直接结构化结果"],
                score_enhancements.get("score_quality_warnings"),
                limit=8,
            )
        compatibility_score = _build_score_compat_payload(normalized_score, score_enhancements)
        row_total_score = _parse_score_number(row.total_score)
        row_match_percent = _parse_score_number(row.match_percent)
        return {
            "id": row.id,
            "candidate_id": row.candidate_id,
            "parse_result_id": row.parse_result_id,
            "total_score": row_total_score if row_total_score is not None else compatibility_score.get("total_score"),
            "total_score_scale": _infer_score_scale(row_total_score if row_total_score is not None else compatibility_score.get("total_score")),
            "match_percent": row_match_percent if row_match_percent is not None else compatibility_score.get("match_percent"),
            "advantages": _normalize_score_text_items(compatibility_score.get("advantages"), limit=5),
            "concerns": _normalize_score_text_items(compatibility_score.get("concerns"), limit=5),
            "recommendation": row.recommendation or compatibility_score.get("recommendation"),
            "suggested_status": row.suggested_status or compatibility_score.get("suggested_status"),
            "dimensions": sanitize_dimensions(compatibility_score.get("dimensions"), SCREENING_PAYLOAD_SCHEMA_CONFIG.get("score") or {}),
            "manual_override_score": row.manual_override_score,
            "manual_override_reason": row.manual_override_reason,
            "created_at": isoformat_or_none(row.created_at),
            "updated_at": isoformat_or_none(row.updated_at),
        }

    def _serialize_candidate_for_interview_prompt(self, row: RecruitmentCandidate) -> Dict[str, Any]:
        return {
            "id": row.id,
            "candidate_code": row.candidate_code,
            "position_id": row.position_id,
            "name": row.name,
            "phone": row.phone,
            "email": row.email,
            "current_company": row.current_company,
            "years_of_experience": row.years_of_experience,
            "education": row.education,
            "source": row.source,
            "source_detail": row.source_detail,
            "status": row.status,
            "ai_recommended_status": row.ai_recommended_status,
            "match_percent": row.match_percent,
            "latest_resume_file_id": row.latest_resume_file_id,
            "latest_parse_result_id": row.latest_parse_result_id,
            "latest_score_id": row.latest_score_id,
        }

    def _serialize_position_for_interview_prompt(self, row: RecruitmentPosition) -> Dict[str, Any]:
        return {
            "id": row.id,
            "position_code": row.position_code,
            "title": row.title,
            "department": row.department,
            "location": row.location,
            "employment_type": row.employment_type,
            "salary_range": row.salary_range,
            "headcount": row.headcount,
            "key_requirements": row.key_requirements,
            "bonus_points": row.bonus_points,
            "summary": row.summary,
            "status": row.status,
            "auto_screen_on_upload": bool(row.auto_screen_on_upload),
            "auto_advance_on_screening": bool(row.auto_advance_on_screening),
            "current_jd_version_id": row.current_jd_version_id,
            "active_jd_snapshot": self._serialize_active_jd_snapshot(row),
        }

    def _serialize_position_for_jd_prompt(self, row: RecruitmentPosition) -> Dict[str, Any]:
        return {
            "id": row.id,
            "position_code": row.position_code,
            "title": row.title,
            "department": row.department,
            "location": row.location,
            "employment_type": row.employment_type,
            "salary_range": row.salary_range,
            "headcount": row.headcount,
            "key_requirements": row.key_requirements,
            "bonus_points": row.bonus_points,
            "summary": row.summary,
            "status": row.status,
            "auto_screen_on_upload": bool(row.auto_screen_on_upload),
            "auto_advance_on_screening": bool(row.auto_advance_on_screening),
            "current_jd_version_id": row.current_jd_version_id,
            "active_jd_snapshot": self._serialize_active_jd_snapshot(row),
        }

    def _serialize_parse_result_for_interview_prompt(self, row: RecruitmentResumeParseResult) -> Dict[str, Any]:
        payload = self._serialize_parse_result(row)
        payload.pop("raw_text", None)
        payload.pop("created_at", None)
        return payload

    def _serialize_score_for_interview_prompt(self, row: RecruitmentCandidateScore) -> Dict[str, Any]:
        payload = self._serialize_score(row)
        return {
            "id": payload.get("id"),
            "candidate_id": payload.get("candidate_id"),
            "parse_result_id": payload.get("parse_result_id"),
            "total_score": payload.get("total_score"),
            "total_score_scale": payload.get("total_score_scale"),
            "match_percent": payload.get("match_percent"),
            "advantages": payload.get("advantages") or [],
            "concerns": payload.get("concerns") or [],
            "recommendation": payload.get("recommendation"),
            "suggested_status": payload.get("suggested_status"),
            "manual_override_score": payload.get("manual_override_score"),
            "manual_override_reason": payload.get("manual_override_reason"),
        }

    def _serialize_workflow_for_interview_prompt(self, row: RecruitmentCandidateWorkflowMemory) -> Dict[str, Any]:
        return {
            "id": row.id,
            "candidate_id": row.candidate_id,
            "position_id": row.position_id,
            "screening_memory_source": row.screening_memory_source,
            "latest_parse_result_id": row.latest_parse_result_id,
            "latest_score_id": row.latest_score_id,
            "last_screened_at": isoformat_or_none(row.last_screened_at),
            "last_interview_question_id": row.last_interview_question_id,
            "created_at": isoformat_or_none(row.created_at),
            "updated_at": isoformat_or_none(row.updated_at),
        }

    def _serialize_workflow_memory(self, row: RecruitmentCandidateWorkflowMemory, *, compact: bool = False) -> Dict[str, Any]:
        screening_skill_ids = json_loads_safe(row.screening_skill_ids_json, [])
        interview_skill_ids = json_loads_safe(row.interview_skill_ids_json, [])
        payload = {"id": row.id, "candidate_id": row.candidate_id, "position_id": row.position_id, "screening_skill_ids": screening_skill_ids, "screening_skills": [self._serialize_skill(skill) for skill in self._load_skill_rows(screening_skill_ids)], "screening_memory_source": row.screening_memory_source, "screening_rule_snapshot": json_loads_safe(row.screening_rule_snapshot_json, None), "latest_parse_result_id": row.latest_parse_result_id, "latest_score_id": row.latest_score_id, "last_screened_at": isoformat_or_none(row.last_screened_at), "interview_skill_ids": interview_skill_ids, "interview_skills": [self._serialize_skill(skill) for skill in self._load_skill_rows(interview_skill_ids)], "last_interview_question_id": row.last_interview_question_id, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}
        if compact:
            payload["screening_skills"] = _compact_candidate_detail_value(payload.get("screening_skills"))
            payload["interview_skills"] = _compact_candidate_detail_value(payload.get("interview_skills"))
            payload["screening_rule_snapshot"] = _compact_candidate_detail_value(payload.get("screening_rule_snapshot"))
        return payload

    def _serialize_status_history(self, row: RecruitmentCandidateStatusHistory) -> Dict[str, Any]:
        return {"id": row.id, "candidate_id": row.candidate_id, "from_status": row.from_status, "to_status": row.to_status, "reason": row.reason, "changed_by": row.changed_by, "source": row.source, "created_at": isoformat_or_none(row.created_at)}

    def _serialize_interview_question(self, row: RecruitmentInterviewQuestion) -> Dict[str, Any]:
        return {"id": row.id, "round_name": row.round_name, "custom_requirements": row.custom_requirements, "skill_ids": json_loads_safe(row.skill_ids_json, []), "html_content": row.html_content or "", "markdown_content": row.markdown_content or "", "status": row.status, "created_by": row.created_by, "created_at": isoformat_or_none(row.created_at)}

    def _build_candidate_screening_state_summary(self, row: RecruitmentCandidate) -> Dict[str, Any]:
        def _query_active_root_task() -> Optional[RecruitmentAITaskLog]:
            return self.db.query(RecruitmentAITaskLog).filter(
                RecruitmentAITaskLog.related_candidate_id == row.id,
                self._screening_root_task_filter(),
                RecruitmentAITaskLog.status.in_(SCREENING_LIVE_TASK_STATUSES),
            ).order_by(
                RecruitmentAITaskLog.updated_at.desc(),
                RecruitmentAITaskLog.id.desc(),
            ).first()

        active_root = _query_active_root_task()
        if active_root and self._settle_orphaned_live_task(active_root):
            self.db.commit()
            active_root = _query_active_root_task()

        latest_completed_parse_task = self.db.query(RecruitmentAITaskLog).filter(
            RecruitmentAITaskLog.related_candidate_id == row.id,
            RecruitmentAITaskLog.task_type == "resume_parse",
            RecruitmentAITaskLog.status == "success",
        ).order_by(
            RecruitmentAITaskLog.created_at.desc(),
            RecruitmentAITaskLog.id.desc(),
        ).first()

        latest_completed_score_task = self.db.query(RecruitmentAITaskLog).filter(
            RecruitmentAITaskLog.related_candidate_id == row.id,
            self._screening_root_task_filter(),
            RecruitmentAITaskLog.status.in_(list(TERMINAL_AI_TASK_STATUSES)),
        ).order_by(
            RecruitmentAITaskLog.created_at.desc(),
            RecruitmentAITaskLog.id.desc(),
        ).first()

        display_status_reason = None
        if active_root:
            active_snapshot = _decode_ai_task_json_text(active_root.output_snapshot, {}) if active_root.output_snapshot else {}
            active_validation = _decode_ai_task_json_text(active_root.validation_meta_json, {}) if active_root.validation_meta_json else {}
            parse_status = str((active_snapshot or {}).get("parse_status") or "").strip()
            reused_existing_parse = bool((active_snapshot or {}).get("reused_existing_parse"))
            parse_strategy = str(
                ((active_validation or {}).get("parse_strategy"))
                or ((active_snapshot or {}).get("parse_strategy"))
                or ""
            ).strip()
            failure_code = str(
                ((active_validation or {}).get("failure_code"))
                or ((active_snapshot or {}).get("failure_code"))
                or ""
            ).strip()
            if active_root.status == "queued" and ((active_validation or {}).get("auto_requeue_scheduled") or (active_snapshot or {}).get("auto_requeue_scheduled")):
                if failure_code == "rate_limited":
                    display_status_reason = "接口限流，系统稍后自动重试"
                elif failure_code == "upstream_timeout":
                    display_status_reason = "接口超时，系统稍后自动重试"
                else:
                    display_status_reason = str(active_root.output_summary or "等待重试中").strip() or "等待重试中"
            elif active_root.stage == "parsing" and reused_existing_parse:
                display_status_reason = "已复用解析结果，正在准备初筛评分"
            elif active_root.stage == "parsing":
                display_status_reason = "正在提取简历原文并准备 one-pass 初筛" if parse_strategy == "combined_parse_and_score" else "正在解析简历"
            elif active_root.stage == "scoring":
                display_status_reason = "已提取简历原文，正在执行 one-pass 初筛" if parse_strategy == "combined_parse_and_score" else "简历解析已完成，正在初筛评分"
            elif active_root.stage == "validating":
                display_status_reason = "评分已生成，正在校验结果"
            elif active_root.stage == "saving":
                display_status_reason = "评分校验已完成，正在写入最终结果"
            elif parse_status == "reused":
                display_status_reason = "已复用解析结果，初筛流程执行中"
            else:
                display_status_reason = "存在未结束的 screening_flow 任务"

        return {
            "active_screening_run_id": active_root.screening_run_id if active_root else None,
            "active_screening_task_id": active_root.id if active_root else None,
            "active_screening_task_type": active_root.task_type if active_root else None,
            "active_screening_stage": active_root.stage if active_root else None,
            "active_screening_status": active_root.status if active_root else None,
            "active_screening_started_at": isoformat_or_none(active_root.created_at) if active_root else None,
            "latest_completed_parse_task_id": latest_completed_parse_task.id if latest_completed_parse_task else None,
            "latest_completed_score_task_id": latest_completed_score_task.id if latest_completed_score_task else None,
            "display_status_reason": display_status_reason,
        }

    def _serialize_candidate_summary(self, row: RecruitmentCandidate) -> Dict[str, Any]:
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == row.position_id, RecruitmentPosition.deleted.is_(False)).first() if row.position_id else None
        score_row = self.db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.id == row.latest_score_id).first() if row.latest_score_id else None
        serialized_score = self._serialize_score(score_row) if score_row else None
        display_match_percent = _parse_score_number(serialized_score.get("match_percent")) if serialized_score else _parse_score_number(row.match_percent)
        display_total_score = _parse_score_number(serialized_score.get("total_score")) if serialized_score else _parse_score_number(score_row.total_score if score_row else None)
        screening_state = self._build_candidate_screening_state_summary(row)
        score_suggested_status = str(serialized_score.get("suggested_status") or "").strip() if serialized_score else ""
        ai_recommended_status = score_suggested_status or str(row.ai_recommended_status or "").strip() or None
        if screening_state.get("active_screening_task_id"):
            display_status = "screening_running"
        elif row.status == "pending_screening" and ai_recommended_status:
            display_status = ai_recommended_status
        else:
            display_status = row.status or ""
        position_screening_skill_rows = self._get_position_task_skill_rows(position.id, "screening") if position else []
        position_interview_skill_rows = self._get_position_task_skill_rows(position.id, "interview") if position else []
        position_jd_skill_rows = self._get_position_task_skill_rows(position.id, "jd") if position else []
        return {"id": row.id, "candidate_code": row.candidate_code, "org_code": normalize_org_code(getattr(row, "org_code", None)), "position_id": row.position_id, "position_title": position.title if position else None, "position_auto_screen_on_upload": bool(position.auto_screen_on_upload) if position else False, "position_jd_skill_ids": [skill.id for skill in position_jd_skill_rows], "position_jd_skills": [self._serialize_skill(skill) for skill in position_jd_skill_rows], "position_screening_skill_ids": [skill.id for skill in position_screening_skill_rows], "position_screening_skills": [self._serialize_skill(skill) for skill in position_screening_skill_rows], "position_interview_skill_ids": [skill.id for skill in position_interview_skill_rows], "position_interview_skills": [self._serialize_skill(skill) for skill in position_interview_skill_rows], "name": row.name, "phone": row.phone, "email": row.email, "current_company": row.current_company, "years_of_experience": row.years_of_experience, "education": row.education, "source": row.source, "source_detail": row.source_detail, "status": row.status, "display_status": display_status, "display_status_reason": screening_state.get("display_status_reason"), "active_screening_run_id": screening_state.get("active_screening_run_id"), "active_screening_task_id": screening_state.get("active_screening_task_id"), "active_screening_task_type": screening_state.get("active_screening_task_type"), "active_screening_stage": screening_state.get("active_screening_stage"), "active_screening_status": screening_state.get("active_screening_status"), "active_screening_task_status": screening_state.get("active_screening_status"), "active_screening_started_at": screening_state.get("active_screening_started_at"), "latest_completed_parse_task_id": screening_state.get("latest_completed_parse_task_id"), "latest_completed_score_task_id": screening_state.get("latest_completed_score_task_id"), "ai_recommended_status": ai_recommended_status, "match_percent": display_match_percent, "tags": json_loads_safe(row.tags_json, []), "notes": row.notes, "latest_resume_file_id": row.latest_resume_file_id, "latest_parse_result_id": row.latest_parse_result_id, "latest_score_id": row.latest_score_id, "latest_total_score": display_total_score, "created_by": row.created_by, "updated_by": row.updated_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_candidates(self, query: Optional[str] = None, status: Optional[str] = None, position_id: Optional[int] = None, tag: Optional[str] = None) -> List[Dict[str, Any]]:
        builder = self._apply_business_org_filter(self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.deleted.is_(False)), RecruitmentCandidate)
        if position_id:
            builder = builder.filter(RecruitmentCandidate.position_id == position_id)
        if query:
            keyword = f"%{query.strip()}%"
            builder = builder.filter(or_(RecruitmentCandidate.name.like(keyword), RecruitmentCandidate.phone.like(keyword), RecruitmentCandidate.email.like(keyword), RecruitmentCandidate.current_company.like(keyword)))
        rows = builder.order_by(RecruitmentCandidate.updated_at.desc(), RecruitmentCandidate.id.desc()).all()
        if tag:
            rows = [row for row in rows if tag in json_loads_safe(row.tags_json, [])]
        serialized_rows = [self._serialize_candidate_summary(row) for row in rows]
        if status:
            serialized_rows = [
                item
                for item in serialized_rows
                if str(item.get("display_status") or item.get("status") or "").strip() == status
            ]
        return serialized_rows

    def get_candidate_detail(self, candidate_id: int) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        resume_files = self.db.query(RecruitmentResumeFile).filter(RecruitmentResumeFile.candidate_id == candidate.id).order_by(RecruitmentResumeFile.created_at.desc(), RecruitmentResumeFile.id.desc()).all()
        parse_row = self.db.query(RecruitmentResumeParseResult).filter(RecruitmentResumeParseResult.id == candidate.latest_parse_result_id).first() if candidate.latest_parse_result_id else None
        score_row = self.db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.id == candidate.latest_score_id).first() if candidate.latest_score_id else None
        workflow_memory = self._get_workflow_memory(candidate.id)
        status_history = self.db.query(RecruitmentCandidateStatusHistory).filter(RecruitmentCandidateStatusHistory.candidate_id == candidate.id).order_by(RecruitmentCandidateStatusHistory.created_at.desc(), RecruitmentCandidateStatusHistory.id.desc()).all()
        questions = self.db.query(RecruitmentInterviewQuestion).filter(RecruitmentInterviewQuestion.candidate_id == candidate.id).order_by(RecruitmentInterviewQuestion.created_at.desc(), RecruitmentInterviewQuestion.id.desc()).all()
        activity = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.related_candidate_id == candidate.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).limit(CANDIDATE_DETAIL_ACTIVITY_LIMIT).all()
        activity_touched = False
        for item in activity:
            try:
                if self._settle_orphaned_live_task(item):
                    activity_touched = True
            except Exception:
                logger.exception("Failed to settle live AI task while building candidate detail task_id=%s", getattr(item, "id", None))
        if activity_touched:
            self.db.commit()
            self.db.refresh(candidate)
            activity = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.related_candidate_id == candidate.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).limit(CANDIDATE_DETAIL_ACTIVITY_LIMIT).all()
        latest_screening_log = self.db.query(RecruitmentAITaskLog).filter(
            self._screening_root_task_filter(),
            RecruitmentAITaskLog.related_candidate_id == candidate.id,
        ).order_by(
            RecruitmentAITaskLog.created_at.desc(),
            RecruitmentAITaskLog.id.desc(),
        ).first()
        latest_screening_validation_meta = _decode_ai_task_json_text(getattr(latest_screening_log, "validation_meta_json", None), {}) if latest_screening_log else {}
        serialized_parse = self._serialize_parse_result(parse_row, compact=True) if parse_row else None
        screening_parsed_resume = None
        if isinstance(serialized_parse, dict):
            screening_parsed_resume = {
                "basic_info": serialized_parse.get("basic_info") or {},
                "work_experiences": serialized_parse.get("work_experiences") or [],
                "education_experiences": serialized_parse.get("education_experiences") or [],
                "skills": serialized_parse.get("skills") or [],
                "projects": serialized_parse.get("projects") or [],
                "summary": serialized_parse.get("summary") or "",
            }
        screening_score = self._serialize_score(score_row) if score_row else None
        screening_meta = {
            "screening_result_valid": latest_screening_validation_meta.get("screening_result_valid") if isinstance(latest_screening_validation_meta, dict) else None,
            "screening_result_state": latest_screening_validation_meta.get("screening_result_state") if isinstance(latest_screening_validation_meta, dict) else None,
            "parse_strategy": latest_screening_validation_meta.get("parse_strategy") if isinstance(latest_screening_validation_meta, dict) else None,
            "final_response_source": latest_screening_validation_meta.get("final_response_source") if isinstance(latest_screening_validation_meta, dict) else None,
            "reused_existing_parse": latest_screening_validation_meta.get("reused_existing_parse") if isinstance(latest_screening_validation_meta, dict) else None,
            "reused_existing_score": latest_screening_validation_meta.get("reused_existing_score") if isinstance(latest_screening_validation_meta, dict) else None,
        }
        candidate_payload = _compact_candidate_detail_value(self._serialize_candidate_summary(candidate), max_items=48)
        workflow_memory_payload = self._serialize_workflow_memory(workflow_memory, compact=True) if workflow_memory else None
        serialized_activity: List[Dict[str, Any]] = []
        for item in activity:
            try:
                serialized_activity.append(self._serialize_ai_task_log(item, compact=True))
            except Exception as exc:
                logger.exception(
                    "Failed to serialize candidate activity log candidate_id=%s task_id=%s",
                    candidate.id,
                    getattr(item, "id", None),
                )
                serialized_activity.append(
                    {
                        "id": getattr(item, "id", None),
                        "task_type": getattr(item, "task_type", None),
                        "screening_run_id": getattr(item, "screening_run_id", None),
                        "status": getattr(item, "status", None),
                        "stage": getattr(item, "stage", None),
                        "created_at": isoformat_or_none(getattr(item, "created_at", None)),
                        "updated_at": isoformat_or_none(getattr(item, "updated_at", None)),
                        "output_summary": "该条日志序列化失败，已返回精简兜底信息。",
                        "error_message": _truncate_utf8_text(str(exc or "").strip() or "日志序列化失败。", 2000),
                        "output_snapshot": None,
                        "raw_response_text": None,
                        "parsed_response_json": None,
                        "sanitized_response_json": None,
                        "validation_meta": {
                            "detail_log_serialization_failed": True,
                        },
                        "persisted_result_refs": None,
                    }
                )
        return {
            "candidate": candidate_payload,
            "resume_files": [self._serialize_resume_file(item) for item in resume_files],
            "parse_result": serialized_parse,
            "score": screening_score,
            "screening": {
                "parsed_resume": screening_parsed_resume,
                "score": screening_score,
                "meta": screening_meta,
            },
            "workflow_memory": workflow_memory_payload,
            "status_history": [self._serialize_status_history(item) for item in status_history],
            "interview_questions": [self._serialize_interview_question(item) for item in questions],
            "activity": serialized_activity,
            "activity_meta": {
                "returned_count": len(serialized_activity),
                "limit": CANDIDATE_DETAIL_ACTIVITY_LIMIT,
            },
        }

    def update_candidate(self, candidate_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        if "position_id" in payload:
            next_position_id = payload.get("position_id")
            if next_position_id:
                next_position = self._get_position(int(next_position_id))
                candidate.position_id = next_position.id
                next_org_code = normalize_org_code(getattr(next_position, "org_code", None))
                if normalize_org_code(getattr(candidate, "org_code", None)) != next_org_code:
                    self.db.query(RecruitmentResumeFile).filter(RecruitmentResumeFile.candidate_id == candidate.id).update({RecruitmentResumeFile.org_code: next_org_code}, synchronize_session=False)
                    self.db.query(RecruitmentResumeParseResult).filter(RecruitmentResumeParseResult.candidate_id == candidate.id).update({RecruitmentResumeParseResult.org_code: next_org_code}, synchronize_session=False)
                    self.db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.candidate_id == candidate.id).update({RecruitmentCandidateScore.org_code: next_org_code}, synchronize_session=False)
                    self.db.query(RecruitmentCandidateStatusHistory).filter(RecruitmentCandidateStatusHistory.candidate_id == candidate.id).update({RecruitmentCandidateStatusHistory.org_code: next_org_code}, synchronize_session=False)
                    self.db.query(RecruitmentCandidateWorkflowMemory).filter(RecruitmentCandidateWorkflowMemory.candidate_id == candidate.id).update({RecruitmentCandidateWorkflowMemory.org_code: next_org_code}, synchronize_session=False)
                    self.db.query(RecruitmentInterviewQuestion).filter(RecruitmentInterviewQuestion.candidate_id == candidate.id).update({RecruitmentInterviewQuestion.org_code: next_org_code}, synchronize_session=False)
                    self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.related_candidate_id == candidate.id).update({RecruitmentAITaskLog.org_code: next_org_code}, synchronize_session=False)
                    candidate.org_code = next_org_code
            else:
                candidate.position_id = None
        for field in ["name", "phone", "email", "current_company", "years_of_experience", "education", "notes"]:
            if field in payload:
                setattr(candidate, field, payload.get(field))
        if "tags" in payload:
            candidate.tags_json = json_dumps_safe(payload.get("tags") or [])
        candidate.updated_by = actor_id
        if ("manual_override_score" in payload or "manual_override_reason" in payload) and candidate.latest_score_id:
            score_row = self.db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.id == candidate.latest_score_id).first()
            if score_row:
                if "manual_override_score" in payload:
                    score_row.manual_override_score = payload.get("manual_override_score")
                if "manual_override_reason" in payload:
                    score_row.manual_override_reason = payload.get("manual_override_reason")
                self.db.add(score_row)
        self.db.add(candidate)
        self.db.commit()
        self.db.refresh(candidate)
        return self._serialize_candidate_summary(candidate)

    def update_candidate_status(self, candidate_id: int, status: str, reason: str, actor_id: str) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        self._create_status_history(candidate, status, reason, actor_id, "manual")
        self.db.add(candidate)
        self.db.commit()
        self.db.refresh(candidate)
        return self._serialize_candidate_summary(candidate)

    def get_candidate_status_history(self, candidate_id: int) -> List[Dict[str, Any]]:
        self._get_candidate(candidate_id)
        rows = self.db.query(RecruitmentCandidateStatusHistory).filter(RecruitmentCandidateStatusHistory.candidate_id == candidate_id).order_by(RecruitmentCandidateStatusHistory.created_at.desc(), RecruitmentCandidateStatusHistory.id.desc()).all()
        return [self._serialize_status_history(row) for row in rows]

    def upload_resume_files(self, uploaded_files: List[Dict[str, Any]], position_id: Optional[int], actor_id: str) -> List[Dict[str, Any]]:
        position = self._get_position(position_id) if position_id else None
        target_dir = RECRUITMENT_UPLOAD_ROOT / uuid.uuid4().hex[:8]
        target_dir.mkdir(parents=True, exist_ok=True)
        results: List[Dict[str, Any]] = []
        for item in uploaded_files:
            file_name = str(item.get("file_name") or "resume.bin")
            ext = Path(file_name).suffix.lower()
            stored_name = f"{uuid.uuid4().hex}{ext}"
            storage_path = target_dir / stored_name
            staged_path_text = str(item.get("staged_path") or "").strip()
            file_size = int(item.get("file_size") or 0)
            if staged_path_text:
                staged_path = Path(staged_path_text)
                if not staged_path.exists():
                    raise ValueError(f"上传文件暂存失败：{file_name}")
                storage_path.parent.mkdir(parents=True, exist_ok=True)
                if staged_path.resolve() != storage_path.resolve():
                    shutil.move(str(staged_path), str(storage_path))
                else:
                    storage_path = staged_path
                if file_size <= 0:
                    file_size = int(storage_path.stat().st_size)
            else:
                content = item.get("content") or b""
                storage_path.write_bytes(content)
                file_size = len(content)
            candidate_org_code = normalize_org_code(getattr(position, "org_code", None) if position else self._current_org_code())
            candidate = RecruitmentCandidate(candidate_code=f"TMP-{uuid.uuid4().hex[:8]}", org_code=candidate_org_code, position_id=position.id if position else None, name=safe_file_stem(file_name), source="manual_upload", source_detail=file_name, status="pending_screening", tags_json=json_dumps_safe([]), created_by=actor_id, updated_by=actor_id, deleted=False)
            self.db.add(candidate)
            self.db.flush()
            candidate.candidate_code = f"CAD-{candidate.id:05d}"
            upload_mime_type = str(item.get("content_type") or "").strip()
            if not upload_mime_type or upload_mime_type in {"application/octet-stream", "binary/octet-stream"}:
                upload_mime_type = mimetypes.guess_type(file_name)[0] or None
            resume_file = RecruitmentResumeFile(org_code=candidate_org_code, candidate_id=candidate.id, original_name=file_name, stored_name=stored_name, file_ext=ext, mime_type=upload_mime_type or None, file_size=file_size, storage_path=str(storage_path), parse_status="pending", uploaded_by=actor_id)
            self.db.add(resume_file)
            self.db.flush()
            candidate.latest_resume_file_id = resume_file.id
            self.db.add(candidate)
            self.db.commit()
            self.db.refresh(candidate)
            payload = self._serialize_candidate_summary(candidate)
            payload["auto_screen_enabled"] = bool(position.auto_screen_on_upload) if position else False
            results.append(payload)
        return results

    def _resolve_screening_skills(
        self,
        candidate: RecruitmentCandidate,
        explicit_skill_ids: Optional[Iterable[Any]],
        *,
        use_position_skills: bool = True,
        use_candidate_memory: bool = True,
    ) -> Tuple[List[RecruitmentSkill], str, str, Dict[str, Any]]:
        requested_skill_ids = _dedupe_ints(explicit_skill_ids or [])
        position_screening_skill_ids = self._get_position_task_skill_ids(self._get_position(candidate.position_id), "screening") if candidate.position_id else []
        workflow = self._get_workflow_memory(candidate.id)
        workflow_memory_skill_ids = _dedupe_ints(json_loads_safe(workflow.screening_skill_ids_json, [])) if workflow else []

        manual_rows = self._filter_skill_rows_for_task(self._load_skill_rows(requested_skill_ids, enabled_only=True), "screening")
        if manual_rows:
            return (
                manual_rows,
                "manual",
                "explicit_request",
                _build_skill_resolution_detail(
                    requested_skill_ids=requested_skill_ids,
                    resolved_skill_rows=manual_rows,
                    position_screening_skill_ids=position_screening_skill_ids,
                    workflow_memory_skill_ids=workflow_memory_skill_ids,
                    used_position_skills=False,
                    used_candidate_memory=False,
                ),
            )
        position_rows = self._get_position_task_skill_rows(candidate.position_id, "screening") if use_position_skills else []
        if position_rows:
            return (
                position_rows,
                "position",
                "position_binding",
                _build_skill_resolution_detail(
                    requested_skill_ids=requested_skill_ids,
                    resolved_skill_rows=position_rows,
                    position_screening_skill_ids=position_screening_skill_ids,
                    workflow_memory_skill_ids=workflow_memory_skill_ids,
                    used_position_skills=True,
                    used_candidate_memory=False,
                    explicit_skill_ids_empty=explicit_skill_ids is not None and not requested_skill_ids,
                ),
            )
        base_rows = self._load_system_base_skill_rows("screening")
        if base_rows:
            return (
                base_rows,
                "system_builtin_base",
                "system_builtin_base",
                _build_skill_resolution_detail(
                    requested_skill_ids=requested_skill_ids,
                    resolved_skill_rows=base_rows,
                    position_screening_skill_ids=position_screening_skill_ids,
                    workflow_memory_skill_ids=workflow_memory_skill_ids,
                    used_position_skills=False,
                    used_candidate_memory=False,
                    explicit_skill_ids_empty=explicit_skill_ids is not None and not requested_skill_ids,
                ),
            )
        if use_candidate_memory and workflow:
            memory_rows = self._filter_skill_rows_for_task(self._load_skill_rows(workflow_memory_skill_ids, enabled_only=True), "screening")
            if memory_rows:
                return (
                    memory_rows,
                    workflow.screening_memory_source or "candidate_memory",
                    "candidate_memory",
                    _build_skill_resolution_detail(
                        requested_skill_ids=requested_skill_ids,
                        resolved_skill_rows=memory_rows,
                        position_screening_skill_ids=position_screening_skill_ids,
                        workflow_memory_skill_ids=workflow_memory_skill_ids,
                        used_position_skills=False,
                        used_candidate_memory=True,
                        explicit_skill_ids_empty=explicit_skill_ids is not None and not requested_skill_ids,
                    ),
                )
        return (
            [],
            "none",
            "none",
            _build_skill_resolution_detail(
                requested_skill_ids=requested_skill_ids,
                resolved_skill_rows=[],
                position_screening_skill_ids=position_screening_skill_ids,
                workflow_memory_skill_ids=workflow_memory_skill_ids,
                used_position_skills=False,
                used_candidate_memory=False,
                explicit_skill_ids_empty=explicit_skill_ids is not None and not requested_skill_ids,
            ),
        )

    def _get_position_screening_payload(self, candidate: RecruitmentCandidate) -> Optional[Dict[str, Any]]:
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == candidate.position_id, RecruitmentPosition.deleted.is_(False)).first() if candidate.position_id else None
        if not position:
            return None
        return {
            "title": position.title,
            "department": position.department,
            "location": position.location,
            "employment_type": position.employment_type,
            "salary_range": position.salary_range,
            "key_requirements": position.key_requirements,
            "bonus_points": position.bonus_points,
            "summary": position.summary,
            "active_jd_snapshot": self._serialize_active_jd_snapshot(position),
        }

    def _save_score_result(self, candidate: RecruitmentCandidate, parse_row: RecruitmentResumeParseResult, actor_id: str, content: Dict[str, Any], *, allow_status_advance: bool = True) -> RecruitmentCandidateScore:
        if isinstance(content, dict) and content.get("_storage_format") == RAW_SCREENING_SCORE_STORAGE_FORMAT:
            raw_score = content.get("score") if isinstance(content.get("score"), dict) else {}
            total_score = raw_score.get("total_score") if _is_json_number(raw_score.get("total_score")) else None
            match_percent = raw_score.get("match_percent") if _is_json_number(raw_score.get("match_percent")) else None
            recommendation = raw_score.get("recommendation") if isinstance(raw_score.get("recommendation"), str) else None
            suggested_status = raw_score.get("suggested_status") if isinstance(raw_score.get("suggested_status"), str) else None
            advantages = raw_score.get("advantages") if isinstance(raw_score.get("advantages"), list) else []
            concerns = raw_score.get("concerns") if isinstance(raw_score.get("concerns"), list) else []
            score_row = RecruitmentCandidateScore(
                org_code=normalize_org_code(getattr(candidate, "org_code", None)),
                candidate_id=candidate.id,
                parse_result_id=parse_row.id,
                score_json=json_dumps_safe(content),
                total_score=total_score,
                match_percent=match_percent,
                advantages_text="\n".join([str(item).strip() for item in advantages if isinstance(item, str) and str(item).strip()]),
                concerns_text="\n".join([str(item).strip() for item in concerns if isinstance(item, str) and str(item).strip()]),
                recommendation=recommendation,
                suggested_status=suggested_status,
                created_at=None,
            )
            self.db.add(score_row)
            self.db.flush()
            if allow_status_advance:
                candidate.latest_score_id = score_row.id
                candidate.match_percent = match_percent
                candidate.ai_recommended_status = suggested_status
                self._auto_advance_candidate_after_screening(candidate, actor_id=actor_id)
            candidate.updated_by = actor_id
            self.db.add(candidate)
            return score_row
        ai_raw_score = content.get("ai_raw_score") if isinstance(content.get("ai_raw_score"), dict) else None
        normalized_score = content.get("normalized_score") if isinstance(content.get("normalized_score"), dict) else _build_normalized_score_payload(content)
        raw_enhancements = content.get("score_enhancements") if isinstance(content.get("score_enhancements"), dict) else {}
        score_enhancements = {
            "dimensions": _normalize_score_dimensions(raw_enhancements.get("dimensions"), limit=12),
            "dimensions_mode": raw_enhancements.get("dimensions_mode"),
            "missing_core_labels": list(raw_enhancements.get("missing_core_labels") or []),
            "score_cap_reason": raw_enhancements.get("score_cap_reason"),
            "derived_total_score_from_dimensions": _parse_score_number(raw_enhancements.get("derived_total_score_from_dimensions")),
            "derived_match_percent_from_dimensions": _parse_score_number(raw_enhancements.get("derived_match_percent_from_dimensions")),
            "score_quality_warnings": _normalize_score_warning_items(raw_enhancements.get("score_quality_warnings"), limit=8),
            "report_markdown": str(raw_enhancements.get("report_markdown") or "").strip() or None,
            "score_source": raw_enhancements.get("score_source"),
            "decision_note": raw_enhancements.get("decision_note"),
            "risk_flags": list(raw_enhancements.get("risk_flags") or []),
            "repair_reason": raw_enhancements.get("repair_reason"),
        }
        payload = _build_layered_score_payload(
            ai_raw_score=ai_raw_score,
            normalized_score=normalized_score,
            score_enhancements=score_enhancements,
        )
        compatibility_score = payload.get("score") if isinstance(payload.get("score"), dict) else _build_score_compat_payload(normalized_score, score_enhancements)
        normalized = _normalize_resume_score_payload(compatibility_score)
        score_row = RecruitmentCandidateScore(
            org_code=normalize_org_code(getattr(candidate, "org_code", None)),
            candidate_id=candidate.id,
            parse_result_id=parse_row.id,
            score_json=json_dumps_safe(payload),
            total_score=normalized.get("total_score"),
            match_percent=normalized.get("match_percent"),
            advantages_text="\n".join(normalized.get("advantages") or []),
            concerns_text="\n".join(normalized.get("concerns") or []),
            recommendation=_compact_recommendation(normalized.get("recommendation")),
            suggested_status=normalized.get("suggested_status"),
            created_at=None,
        )
        self.db.add(score_row)
        self.db.flush()
        if allow_status_advance:
            candidate.latest_score_id = score_row.id
            candidate.match_percent = normalized.get("match_percent")
            candidate.ai_recommended_status = normalized.get("suggested_status")
            self._auto_advance_candidate_after_screening(candidate, actor_id=actor_id)
        candidate.updated_by = actor_id
        self.db.add(candidate)
        return score_row

    def _build_score_resume_helper_payload(
        self,
        parsed_payload: Dict[str, Any],
        *,
        parse_quality_warnings: Optional[Sequence[Any]] = None,
    ) -> Tuple[Dict[str, Any], List[str]]:
        warnings: List[str] = []
        sanitized_changed = False
        high_risk_parse_warnings = _has_high_risk_parse_quality_warnings(parse_quality_warnings)
        basic_info = parsed_payload.get("basic_info") if isinstance(parsed_payload.get("basic_info"), dict) else {}

        helper_basic_info: Dict[str, str] = {}
        for field in ("name", "years_of_experience", "education"):
            cleaned, changed = _sanitize_score_helper_text(basic_info.get(field))
            if cleaned:
                helper_basic_info[field] = cleaned
            sanitized_changed = sanitized_changed or changed
        for dropped_field in ("phone", "email", "location"):
            if _sanitize_score_helper_text(basic_info.get(dropped_field))[0]:
                sanitized_changed = True

        if high_risk_parse_warnings:
            if any(
                parsed_payload.get(field)
                for field in ("work_experiences", "education_experiences", "skills", "projects", "summary")
            ):
                sanitized_changed = True
            warnings.append("high-risk parse result detected; score helper downgraded to basic_info only")
            if sanitized_changed:
                warnings.append("score helper sanitized from parse result before scoring")
            return {
                "basic_info": helper_basic_info,
                "work_experiences": [],
                "education_experiences": [],
                "skills": [],
                "projects": [],
                "summary": "",
            }, _dedupe_texts(warnings)

        helper_work_experiences: List[Dict[str, str]] = []
        seen_work_experiences: set[Tuple[str, ...]] = set()
        raw_work_experiences = parsed_payload.get("work_experiences") or []
        for item in raw_work_experiences:
            if not isinstance(item, dict):
                sanitized_changed = True
                continue
            duration, duration_changed = _sanitize_score_helper_text(item.get("duration"))
            if not duration:
                start_date, start_changed = _sanitize_score_helper_text(item.get("start_date"), max_length=40)
                end_date, end_changed = _sanitize_score_helper_text(item.get("end_date"), max_length=40)
                duration = " ~ ".join([part for part in [start_date, end_date] if part])
                duration_changed = duration_changed or start_changed or end_changed or bool(duration)
            company, company_changed = _sanitize_score_helper_text(item.get("company"), max_length=120)
            position, position_changed = _sanitize_score_helper_text(item.get("position"), max_length=120)
            if position and _looks_like_responsibility_position(position):
                position = ""
                position_changed = True
            entry = {key: value for key, value in {"duration": duration, "company": company, "position": position}.items() if value}
            meaningful_source_keys = {
                key
                for key, value in item.items()
                if key in {"duration", "company", "position", "start_date", "end_date", "description", "raw_text"}
                and str(value or "").strip()
            }
            sanitized_changed = sanitized_changed or duration_changed or company_changed or position_changed
            if meaningful_source_keys - {"duration", "company", "position", "start_date", "end_date"}:
                sanitized_changed = True
            dedupe_key = _normalize_helper_dedupe_key(duration, company, position)
            if entry and any(dedupe_key):
                if dedupe_key in seen_work_experiences:
                    sanitized_changed = True
                    continue
                seen_work_experiences.add(dedupe_key)
                helper_work_experiences.append(entry)
                if len(helper_work_experiences) >= 6:
                    if len(raw_work_experiences) > len(helper_work_experiences):
                        sanitized_changed = True
                    break

        helper_education_experiences: List[Dict[str, str]] = []
        seen_education_experiences: set[Tuple[str, ...]] = set()
        raw_education_experiences = parsed_payload.get("education_experiences") or []
        for item in raw_education_experiences:
            if not isinstance(item, dict):
                sanitized_changed = True
                continue
            school, school_changed = _sanitize_score_helper_text(item.get("school"), max_length=120)
            degree, degree_changed = _sanitize_score_helper_text(item.get("degree"), max_length=80)
            start_date, start_changed = _sanitize_score_helper_text(item.get("start_date"), max_length=40)
            end_date, end_changed = _sanitize_score_helper_text(item.get("end_date"), max_length=40)
            if school and _looks_like_noisy_helper_school(school):
                sanitized_changed = True
                continue
            entry = {
                key: value
                for key, value in {
                    "school": school,
                    "degree": degree,
                    "start_date": start_date,
                    "end_date": end_date,
                }.items()
                if value
            }
            sanitized_changed = sanitized_changed or school_changed or degree_changed or start_changed or end_changed
            if any(str(item.get(field) or "").strip() for field in ("major", "description", "raw_text")):
                sanitized_changed = True
            dedupe_key = _normalize_helper_dedupe_key(school, degree, start_date, end_date)
            if entry and any(dedupe_key):
                if dedupe_key in seen_education_experiences:
                    sanitized_changed = True
                    continue
                seen_education_experiences.add(dedupe_key)
                helper_education_experiences.append(entry)
                if len(helper_education_experiences) >= 4:
                    if len(raw_education_experiences) > len(helper_education_experiences):
                        sanitized_changed = True
                    break

        technical_skills: List[str] = []
        raw_skills = parsed_payload.get("skills") or []
        for item in raw_skills:
            raw_value = item
            if isinstance(item, dict):
                raw_value = item.get("name") or item.get("skill") or item.get("label") or item.get("title") or item.get("content")
            cleaned, changed = _sanitize_score_helper_text(raw_value, max_length=120)
            sanitized_changed = sanitized_changed or changed or isinstance(item, dict)
            if not cleaned or cleaned in {",", "，", ";", "；"}:
                continue
            if _is_generic_score_helper_skill(cleaned):
                sanitized_changed = True
                continue
            if not _looks_like_tool_or_technical_skill(cleaned):
                sanitized_changed = True
                continue
            if cleaned in technical_skills:
                sanitized_changed = True
                continue
            technical_skills.append(cleaned)
        helper_skills = list(technical_skills)
        if len(helper_skills) > 20:
            sanitized_changed = True
            helper_skills = helper_skills[:20]

        helper_projects: List[Dict[str, str]] = []
        raw_projects = parsed_payload.get("projects") or []
        for index, item in enumerate(raw_projects):
            if not isinstance(item, dict):
                sanitized_changed = True
                continue
            if index >= 6:
                sanitized_changed = True
                break
            project_name, name_changed = _sanitize_score_helper_text(item.get("project_name") or item.get("name") or item.get("title"), max_length=240)
            description, description_changed = _trim_helper_project_description(item.get("description"), limit=160)
            project_name = re.sub(r"^(项目名称[:：]\s*)", "", project_name).strip()
            if "项目描述：" in project_name or "项目描述:" in project_name:
                parts = re.split(r"项目描述[:：]", project_name, maxsplit=1)
                candidate_name = _trim_helper_project_name(parts[0])
                candidate_description = _trim_helper_project_description(parts[1] if len(parts) > 1 else "", limit=160)[0]
                if candidate_name != project_name:
                    name_changed = True
                project_name = candidate_name
                if not description and candidate_description:
                    description = candidate_description
                    description_changed = True
            project_name = _trim_helper_project_name(project_name)
            if description.startswith("项目描述：") or description.startswith("项目描述:"):
                description = re.sub(r"^项目描述[:：]\s*", "", description).strip()
                description_changed = True
            entry = {
                key: value
                for key, value in {
                    "project_name": project_name,
                    "description": description,
                }.items()
                if value
            }
            sanitized_changed = sanitized_changed or name_changed or description_changed
            if any(str(item.get(field) or "").strip() for field in ("raw_text", "project_role")):
                sanitized_changed = True
            if entry:
                helper_projects.append(entry)

        summary = ""
        summary_changed = bool(str(parsed_payload.get("summary") or "").strip())
        sanitized_changed = sanitized_changed or summary_changed
        if sanitized_changed:
            warnings.append("score helper sanitized from parse result before scoring")

        return {
            "basic_info": helper_basic_info,
            "work_experiences": helper_work_experiences[:6],
            "education_experiences": helper_education_experiences[:4],
            "skills": helper_skills[:20],
            "projects": helper_projects[:6],
            "summary": summary,
        }, warnings

    def _build_resume_parse_prompt(self, *, raw_text: str) -> str:
        prepared_raw_text = _prepare_resume_text_for_parse_prompt(raw_text)
        return "\n\n".join([
            "TASK: 请从原始简历文本中提取结构化简历信息。",
            "RAW_RESUME_TEXT:",
            prepared_raw_text,
            "只返回 strict JSON，不要 markdown，不要解释。",
        ])

    def _build_resume_screening_prompt(self, *, candidate: RecruitmentCandidate, raw_text: str, skill_snapshots: Sequence[Dict[str, Any]], custom_requirements: str, status_rules: Dict[str, Any]) -> str:
        dimension_rules = _distill_dimension_rules(skill_snapshots, limit=12)
        position_payload = self._get_position_screening_payload(candidate)
        return "\n\n".join([
            "TASK: 请先解析简历，再基于岗位要求和评分维度完成初筛评分。",
            f"CANDIDATE_NAME: {candidate.name or '未提供'}",
            "POSITION_SUMMARY:",
            json_dumps_safe(position_payload or {}),
            f"CUSTOM_REQUIREMENTS: {custom_requirements or '无'}",
            "DIMENSION_RULES:",
            json_dumps_safe(dimension_rules),
            "RAW_RESUME_TEXT:",
            raw_text[:30000],
            "只返回 strict JSON，不要 markdown，不要解释。",
        ])

    def _build_resume_score_prompt(self, *, candidate: RecruitmentCandidate, parsed_resume_helper_payload: Dict[str, Any], raw_resume_text: str, skill_snapshots: Sequence[Dict[str, Any]], custom_requirements: str, status_rules: Dict[str, Any]) -> str:
        dimension_rules = _distill_dimension_rules(skill_snapshots, limit=12)
        max_possible_score = _resolve_dimension_max_possible_score(dimension_rules) or 0.0
        position_payload = self._get_position_screening_payload(candidate)
        return "\n\n".join([
            "TASK: 请基于岗位要求和评分维度，对候选人进行简历评分。",
            "POSITION_SUMMARY:",
            json_dumps_safe(position_payload or {}),
            f"CUSTOM_REQUIREMENTS: {custom_requirements or '无'}",
            "DIMENSION_RULES:",
            json_dumps_safe(dimension_rules),
            f"MAX_POSSIBLE_SCORE: {max_possible_score:.1f}",
            "PARSED_RESUME_HELPER:",
            json_dumps_safe(parsed_resume_helper_payload),
            "RAW_RESUME_TEXT:",
            raw_resume_text[:30000],
            "只返回 strict JSON，不要 markdown，不要解释。",
        ])

    def _get_current_parse_result(self, candidate: RecruitmentCandidate) -> Optional[RecruitmentResumeParseResult]:
        if not candidate.latest_parse_result_id or not candidate.latest_resume_file_id:
            return None
        parse_row = self.db.query(RecruitmentResumeParseResult).filter(RecruitmentResumeParseResult.id == candidate.latest_parse_result_id).first()
        if not parse_row:
            return None
        if parse_row.resume_file_id != candidate.latest_resume_file_id:
            return None
        if parse_row.status != "success":
            return None
        return parse_row

    def _prepare_screening_task_context(
        self,
        *,
        skill_rows: Optional[Sequence[RecruitmentSkill]] = None,
        skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
        custom_requirements: str = "",
    ) -> Tuple[List[Dict[str, Any]], List[int], str]:
        if skill_snapshots is not None:
            snapshots = [dict(item) for item in skill_snapshots if isinstance(item, dict)]
            derived_custom_requirements = _extract_custom_requirements_from_skill_snapshots(snapshots)
            return snapshots, self._extract_related_skill_ids(snapshots), derived_custom_requirements
        snapshots = self._tailor_skill_snapshots_for_task(
            self._build_skill_snapshots(skill_rows or [], custom_requirements, custom_name="附加初筛要求"),
            "screening",
        )
        return snapshots, self._extract_related_skill_ids(snapshots), str(custom_requirements or "").strip()

    def _build_screening_persisted_result_refs(
        self,
        *,
        candidate: RecruitmentCandidate,
        parse_row: Optional[RecruitmentResumeParseResult] = None,
        score_row: Optional[RecruitmentCandidateScore] = None,
        screening_result_valid: Optional[bool] = None,
        raw_model_suggested_status: Optional[str] = None,
        normalized_final_suggested_status: Optional[str] = None,
    ) -> Dict[str, Any]:
        normalized_screening_result_valid = screening_result_valid if isinstance(screening_result_valid, bool) else None
        return {
            "parse_result_id": parse_row.id if parse_row else candidate.latest_parse_result_id,
            "score_result_id": score_row.id if score_row else candidate.latest_score_id,
            "candidate_status_after": candidate.status,
            "candidate_match_percent_after": None if normalized_screening_result_valid is False else _parse_score_number(candidate.match_percent),
            "candidate_ai_recommended_status_after": None if normalized_screening_result_valid is False else candidate.ai_recommended_status,
            "raw_model_suggested_status": str(raw_model_suggested_status or "").strip() or None,
            "normalized_final_suggested_status": str(normalized_final_suggested_status or "").strip() or None,
        }

    def _ensure_screening_root_task(
        self,
        *,
        candidate: RecruitmentCandidate,
        actor_id: str,
        related_skill_ids: Sequence[int],
        skill_snapshots: Sequence[Dict[str, Any]],
        memory_source: str,
        skill_resolution_source: str,
        skill_resolution_detail: Dict[str, Any],
        score_rule_snapshot: Sequence[Dict[str, Any]],
        existing_task_id: Optional[int] = None,
        request_hash: Optional[str] = None,
        batch_id: Optional[str] = None,
        request_meta: Optional[Dict[str, Any]] = None,
        screening_mode: str = "default",
        force_fallback: bool = False,
        allow_reuse_parse: bool = True,
        allow_score_only_rerun: bool = True,
    ) -> RecruitmentAITaskLog:
        related_skill_names = _dedupe_texts(item.get("name") for item in skill_snapshots if isinstance(item, dict))
        skills_applied_to_prompt = bool(score_rule_snapshot)
        prompt_rule_dimension_count = len(score_rule_snapshot)
        request_meta_payload = dict(request_meta or {})
        if existing_task_id:
            row = self._get_ai_task_log_row(existing_task_id)
            if request_hash:
                row.request_hash = request_hash
            screening_run_id = row.screening_run_id or _build_screening_run_id(candidate.id)
            current_output_snapshot = _decode_ai_task_json_text(getattr(row, "output_snapshot", None), {})
            if not isinstance(current_output_snapshot, dict):
                current_output_snapshot = {}
            return self._update_ai_task_log(
                row,
                screening_run_id=screening_run_id,
                batch_id=batch_id,
                parent_task_id=None,
                root_task_id=row.root_task_id or row.id,
                memory_source=memory_source,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
                skill_resolution_source=skill_resolution_source,
                skill_resolution_detail=skill_resolution_detail,
                score_rule_snapshot=score_rule_snapshot,
                input_summary=_truncate_utf8_text(f"{candidate.name} · {candidate.position_id or '-'}", AI_TASK_LOG_SUMMARY_LIMIT),
                output_snapshot=_build_screening_task_progress_snapshot(
                    row.stage or "queued",
                    message=row.output_summary or "任务已创建",
                    extra={
                        **current_output_snapshot,
                        "screening_run_id": screening_run_id,
                        "task_type": SCREENING_FLOW_TASK_TYPE,
                        "batch_id": batch_id or current_output_snapshot.get("batch_id"),
                        "skills_expected": True,
                        "related_skill_ids": list(related_skill_ids),
                        "related_skill_names": related_skill_names,
                        "score_rule_snapshot": list(score_rule_snapshot),
                        "skills_applied_to_prompt": skills_applied_to_prompt,
                        "prompt_rule_dimension_count": prompt_rule_dimension_count,
                        "memory_source": memory_source,
                        "skill_resolution_source": skill_resolution_source,
                        "skill_resolution_detail": skill_resolution_detail,
                        "request_meta": request_meta_payload or current_output_snapshot.get("request_meta") or {},
                        "screening_mode": screening_mode or current_output_snapshot.get("screening_mode") or "default",
                        "force_fallback": bool(force_fallback),
                        "allow_reuse_parse": bool(allow_reuse_parse),
                        "allow_score_only_rerun": bool(allow_score_only_rerun),
                    },
                ),
            )

        screening_run_id = _build_screening_run_id(candidate.id)
        row = self._create_ai_task_log(
            SCREENING_FLOW_TASK_TYPE,
            created_by=actor_id,
            related_position_id=candidate.position_id,
            related_candidate_id=candidate.id,
            related_skill_ids=related_skill_ids,
            related_skill_snapshots=skill_snapshots,
            related_resume_file_id=candidate.latest_resume_file_id,
            memory_source=memory_source,
            request_hash=request_hash,
            batch_id=batch_id,
            status="queued",
            screening_run_id=screening_run_id,
            stage="queued",
            skill_resolution_source=skill_resolution_source,
            skill_resolution_detail=skill_resolution_detail,
            score_rule_snapshot=score_rule_snapshot,
            timing_breakdown={"queue_wait_ms": 0, "total_duration_ms": 0},
        )
        return self._update_ai_task_log(
            row,
            status="queued",
            stage="queued",
            screening_run_id=screening_run_id,
            batch_id=batch_id,
            root_task_id=row.id,
            provider=request_meta_payload.get("provider"),
            model_name=request_meta_payload.get("model_name"),
            input_summary=_truncate_utf8_text(f"{candidate.name} · {candidate.position_id or '-'}", AI_TASK_LOG_SUMMARY_LIMIT),
            output_summary="任务已入队，等待执行",
            output_snapshot=_build_screening_task_progress_snapshot(
                "queued",
                message="任务已入队，等待执行",
                extra={
                    "task_type": SCREENING_FLOW_TASK_TYPE,
                    "screening_run_id": screening_run_id,
                    "batch_id": batch_id,
                    "skills_expected": True,
                    "related_skill_ids": list(related_skill_ids),
                    "related_skill_names": related_skill_names,
                    "score_rule_snapshot": list(score_rule_snapshot),
                    "skills_applied_to_prompt": skills_applied_to_prompt,
                    "prompt_rule_dimension_count": prompt_rule_dimension_count,
                    "memory_source": memory_source,
                    "skill_resolution_source": skill_resolution_source,
                    "skill_resolution_detail": skill_resolution_detail,
                    "request_meta": request_meta_payload,
                    "screening_mode": screening_mode,
                    "force_fallback": bool(force_fallback),
                    "allow_reuse_parse": bool(allow_reuse_parse),
                    "allow_score_only_rerun": bool(allow_score_only_rerun),
                },
            ),
        )

    def _get_latest_screening_run_task(
        self,
        screening_run_id: Optional[str],
        *,
        task_type: Optional[str] = None,
        parent_task_id: Optional[int] = None,
    ) -> Optional[RecruitmentAITaskLog]:
        if not screening_run_id:
            return None
        builder = self.db.query(RecruitmentAITaskLog).filter(
            RecruitmentAITaskLog.screening_run_id == screening_run_id,
        )
        if task_type:
            builder = builder.filter(RecruitmentAITaskLog.task_type == task_type)
        if parent_task_id is None:
            builder = builder.filter(RecruitmentAITaskLog.parent_task_id.is_(None))
        else:
            builder = builder.filter(RecruitmentAITaskLog.parent_task_id == parent_task_id)
        return builder.order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).first()

    def _get_latest_screening_score_run_task(
        self,
        screening_run_id: Optional[str],
        *,
        parent_task_id: Optional[int] = None,
    ) -> Optional[RecruitmentAITaskLog]:
        latest_row: Optional[RecruitmentAITaskLog] = None
        for task_type in SCREENING_SCORE_TASK_TYPES:
            candidate = self._get_latest_screening_run_task(
                screening_run_id,
                task_type=task_type,
                parent_task_id=parent_task_id,
            )
            if not candidate:
                continue
            if latest_row is None:
                latest_row = candidate
                continue
            latest_checkpoint = latest_row.created_at or datetime.min
            candidate_checkpoint = candidate.created_at or datetime.min
            if candidate_checkpoint >= latest_checkpoint:
                latest_row = candidate
        return latest_row

    def _build_screening_run_timing_breakdown(
        self,
        *,
        root_log: RecruitmentAITaskLog,
        parse_log: Optional[RecruitmentAITaskLog] = None,
        score_log: Optional[RecruitmentAITaskLog] = None,
    ) -> Dict[str, Any]:
        def _timing_value(source: Any, key: str) -> Optional[int]:
            if not isinstance(source, dict):
                return None
            parsed = _parse_score_number(source.get(key))
            if parsed is None:
                return None
            return max(0, int(round(float(parsed))))

        root_timing = _decode_ai_task_json_text(root_log.timing_breakdown_json, {}) if root_log else {}
        score_timing = _decode_ai_task_json_text(score_log.timing_breakdown_json, {}) if score_log else (root_timing if isinstance(root_timing, dict) else {})
        root_output_snapshot = _decode_ai_task_json_text(getattr(root_log, "output_snapshot", None), {}) if root_log else {}
        root_validation_meta = _decode_ai_task_json_text(getattr(root_log, "validation_meta_json", None), {}) if root_log else {}
        parse_strategy = str(
            (
                root_output_snapshot.get("parse_strategy")
                if isinstance(root_output_snapshot, dict)
                else None
            )
            or (
                root_validation_meta.get("parse_strategy")
                if isinstance(root_validation_meta, dict)
                else None
            )
            or ""
        ).strip()
        first_started_at = None
        for checkpoint in [
            parse_log.stage_started_at if parse_log else None,
            score_log.stage_started_at if score_log else None,
            root_log.stage_started_at,
        ]:
            if checkpoint is not None:
                first_started_at = checkpoint
                break
        queue_wait_ms = 0
        if root_log.created_at and first_started_at:
            queue_wait_ms = max(0, int((first_started_at - root_log.created_at).total_seconds() * 1000))
        root_total_duration_ms = self._calculate_ai_task_duration_ms(root_log) or 0
        if not root_total_duration_ms and root_log.created_at:
            terminal_at = root_log.stage_completed_at or (datetime.now() if root_log.status not in TERMINAL_AI_TASK_STATUSES else root_log.updated_at) or datetime.now()
            root_total_duration_ms = max(0, int((terminal_at - root_log.created_at).total_seconds() * 1000))
        parse_duration_ms = self._calculate_ai_task_duration_ms(parse_log) if parse_log else _timing_value(root_timing, "parse_duration_ms")
        if parse_log is None and parse_strategy == "combined_parse_and_score":
            parse_duration_ms = None
        score_duration_ms = _timing_value(score_timing, "score_duration_ms")
        validation_duration_ms = _timing_value(score_timing, "validation_duration_ms")
        save_duration_ms = _timing_value(score_timing, "save_duration_ms")
        score_total_duration_ms = _timing_value(score_timing, "total_duration_ms")
        child_execution_duration_ms = 0
        for value in [parse_duration_ms, score_duration_ms, validation_duration_ms, save_duration_ms]:
            if value is not None:
                child_execution_duration_ms += value
        if score_total_duration_ms is not None:
            if parse_duration_ms is not None and parse_log:
                child_execution_duration_ms = max(child_execution_duration_ms, parse_duration_ms + score_total_duration_ms)
            else:
                child_execution_duration_ms = max(child_execution_duration_ms, score_total_duration_ms)
        total_duration_ms = max(root_total_duration_ms, queue_wait_ms + child_execution_duration_ms)
        return {
            "queue_wait_ms": queue_wait_ms,
            "parse_duration_ms": parse_duration_ms,
            "score_duration_ms": score_duration_ms,
            "validation_duration_ms": validation_duration_ms,
            "save_duration_ms": save_duration_ms,
            "total_duration_ms": total_duration_ms,
        }

    def _screen_candidate_with_single_ai_call(
        self,
        candidate: RecruitmentCandidate,
        actor_id: str,
        skill_rows: Optional[Sequence[RecruitmentSkill]],
        memory_source: str,
        custom_requirements: str = "",
        *,
        skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
        existing_task_id: Optional[int] = None,
        screening_run_id: Optional[str] = None,
        parent_task_id: Optional[int] = None,
        root_task_id: Optional[int] = None,
        request_hash: Optional[str] = None,
        request_meta: Optional[Dict[str, Any]] = None,
        raw_text_override: Optional[str] = None,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        deadline_at: Optional[datetime] = None,
        batch_id: Optional[str] = None,
    ) -> Tuple[RecruitmentResumeParseResult, RecruitmentCandidateScore]:
        if not candidate.latest_resume_file_id:
            raise ValueError("鎿嶄綔澶辫触")
        resume_file = self._get_resume_file(candidate.latest_resume_file_id)
        resume_file.parse_status = "processing"
        self.db.add(resume_file)
        self.db.commit()

        shared_flow_log = bool(screening_run_id and parent_task_id)
        task_type = SCREENING_ONE_PASS_TASK_TYPE
        raw_text = str(raw_text_override or "").strip() or extract_resume_text(Path(resume_file.storage_path), resume_file.file_ext or "")
        status_rules = self._get_rule_config("default_status_rules", DEFAULT_RULE_CONFIGS["default_status_rules"])
        skill_snapshots, related_skill_ids, prepared_custom_requirements = self._prepare_screening_task_context(
            skill_rows=skill_rows,
            skill_snapshots=skill_snapshots,
            custom_requirements=custom_requirements,
        )
        screening_schema_config = _build_screening_schema_config(
            skill_snapshots,
            status_rules=status_rules,
        )
        prompt = self._build_resume_screening_prompt(
            candidate=candidate,
            raw_text=raw_text,
            skill_snapshots=skill_snapshots,
            custom_requirements=prepared_custom_requirements,
            status_rules=status_rules,
        )
        logger.debug("Screening user prompt preview candidate_id=%s: %s", candidate.id, truncate_text(prompt, 2000))
        resolved_request_hash = request_hash or self._build_request_hash("resume_screening", resume_file.id, related_skill_ids, memory_source, prepared_custom_requirements)
        resolved_request_meta = dict(request_meta or {})
        log_row = (
            self._get_ai_task_log_row(existing_task_id)
            if existing_task_id
            else self._create_ai_task_log(
                task_type,
                created_by=actor_id,
                related_position_id=candidate.position_id,
                related_candidate_id=candidate.id,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
                related_resume_file_id=resume_file.id,
                memory_source=memory_source,
                request_hash=resolved_request_hash,
                batch_id=batch_id,
                status="running" if shared_flow_log else "pending",
                screening_run_id=screening_run_id,
                parent_task_id=parent_task_id,
                root_task_id=root_task_id or parent_task_id,
                stage="scoring",
                timing_breakdown={"parse_duration_ms": None, "score_duration_ms": 0, "validation_duration_ms": 0, "save_duration_ms": 0, "total_duration_ms": 0},
            )
        )
        task: Optional[Dict[str, Any]] = None
        request_context: Dict[str, Any] = {}
        one_pass_json_meta: Dict[str, Any] = {}
        started_at = time.perf_counter()
        score_duration_ms = 0
        validation_duration_ms = 0
        save_duration_ms = 0
        try:
            self._raise_if_cancelled(cancel_control)
            remaining_budget_seconds = _ensure_screening_budget_available(deadline_at) if deadline_at else None
            request_context = self.ai_gateway.prepare_json_request_context(
                task_type=task_type,
                system_prompt=RESUME_SCREENING_SYSTEM_PROMPT,
                user_prompt=prompt,
                timeout_seconds_override=remaining_budget_seconds,
                screening_total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
                remaining_budget_seconds=remaining_budget_seconds,
            )
            self._update_ai_task_log(
                log_row,
                status="running",
                stage="scoring",
                provider=str(request_context.get("provider") or "").strip() or None,
                model_name=str(request_context.get("model_name") or "").strip() or None,
                prompt_snapshot=str(request_context.get("prompt_snapshot") or prompt),
                full_request_snapshot=request_context.get("full_request_snapshot"),
                input_summary=str(request_context.get("input_summary") or truncate_text(prompt, 600)),
                output_summary="正在执行 one-pass 初筛",
                output_snapshot=_build_screening_task_progress_snapshot(
                    "scoring",
                    message="正在执行 one-pass 初筛",
                    extra={
                        "task_type": task_type,
                        "screening_run_id": screening_run_id,
                        "parse_strategy": "combined_parse_and_score",
                        "request_meta": resolved_request_meta,
                        "raw_text_chars": len(str(raw_text or "")),
                        "prompt_chars": len(prompt),
                        "endpoint": request_context.get("endpoint"),
                        "timeout_seconds": request_context.get("timeout_seconds"),
                        "configured_read_timeout_seconds": request_context.get("configured_read_timeout_seconds"),
                        "effective_timeout_seconds": request_context.get("effective_timeout_seconds"),
                        "screening_total_timeout_seconds": request_context.get("screening_total_timeout_seconds"),
                        "remaining_budget_seconds": request_context.get("remaining_budget_seconds"),
                        "screening_deadline_at": deadline_at.isoformat() if deadline_at else None,
                        "retry_count": request_context.get("retry_count"),
                        "is_stream_mode": request_context.get("is_stream_mode"),
                    },
                ),
            )
            score_started_at = time.perf_counter()
            task = self._run_screening_provider_json_request(
                task_type=task_type,
                system_prompt=RESUME_SCREENING_SYSTEM_PROMPT,
                user_prompt=prompt,
                cancel_control=cancel_control,
                runtime_config=request_context.get("runtime_config"),
                timeout_seconds_override=request_context.get("effective_timeout_seconds"),
                screening_total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
                remaining_budget_seconds=request_context.get("remaining_budget_seconds"),
            )
            score_duration_ms = max(0, int((time.perf_counter() - score_started_at) * 1000))
            self._raise_if_cancelled(cancel_control)
            authoritative_raw_text = str(task.get("raw_response_text") or "").strip()
            parsed_task_payload = dict(task.get("content") or {}) if isinstance(task.get("content"), dict) else _parse_llm_json_response(authoritative_raw_text or json_dumps_safe(task.get("content") or {}))
            authoritative_payload, one_pass_json_meta = _select_one_pass_json_candidate(
                authoritative_raw_text,
                parsed_task_payload,
                schema_config=screening_schema_config,
                skill_snapshots=skill_snapshots,
            )
            gateway_warnings = _normalize_score_warning_items(
                [_normalize_ai_gateway_warning_text(item) for item in (task.get("warnings") or [])],
                limit=6,
            )
            sanitized_payload, validation_meta = sanitize_screening_payload_fast(
                authoritative_payload,
                screening_schema_config,
                skill_snapshots=skill_snapshots,
            )
            parsed_resume = sanitized_payload.get("parsed_resume") if isinstance(sanitized_payload.get("parsed_resume"), dict) else {}
            raw_score_payload = sanitized_payload.get("score") if isinstance(sanitized_payload.get("score"), dict) else {}
            model_schema_violation = False
            model_schema_violation_reason = None
            validation_started_at = time.perf_counter()
            try:
                parsed_resume, raw_score_payload = _validate_primary_screening_response(sanitized_payload)
                validation_warnings = _normalize_score_warning_items(validation_meta.get("warnings"), limit=12)
            except ValueError as exc:
                model_schema_violation = True
                model_schema_violation_reason = str(exc)
                validation_warnings = _normalize_score_warning_items(
                    [*(validation_meta.get("warnings") or []), str(exc)],
                    limit=12,
                )
            screening_result_valid, invalid_result_reasons = _classify_screening_score_validity(
                raw_score_payload,
                screening_schema_config,
                validation_warnings=validation_warnings,
            )
            if model_schema_violation and model_schema_violation_reason:
                screening_result_valid = False
                invalid_result_reasons = _normalize_score_warning_items(
                    [model_schema_violation_reason, *invalid_result_reasons],
                    limit=12,
                )
            validation_duration_ms = max(0, int((time.perf_counter() - validation_started_at) * 1000))
            if validation_warnings:
                logger.warning(
                    "Screening payload validation warnings candidate_id=%s: %s",
                    candidate.id,
                    " ".join(validation_warnings),
                )
            storage_payload = _build_raw_screening_storage_payload(
                score_payload=raw_score_payload,
                score_source="primary_screening_model",
                primary_model_call_succeeded=True,
                final_response_source="primary_screening_model",
                validation_warnings=validation_warnings,
                raw_response_text=task.get("raw_response_text"),
                parsed_response_payload=authoritative_payload if isinstance(authoritative_payload, dict) else None,
                sanitized_score_payload=raw_score_payload,
            )
        except RecruitmentTaskCancelled:
            self.db.rollback()
            resume_file = self._get_resume_file(candidate.latest_resume_file_id)
            resume_file.parse_status = "cancelled"
            resume_file.parse_error = "任务已被用户停止。"
            self.db.add(resume_file)
            self.db.commit()
            self._mark_ai_task_cancelled(log_row.id, actor_id=actor_id, reason="任务已被用户停止，初筛未继续生成。")
            raise
        except Exception as exc:
            self.db.rollback()
            resume_file = self._get_resume_file(candidate.latest_resume_file_id)
            failure_status, failure_message = _classify_screening_task_failure(exc)
            resume_file.parse_status = failure_status
            resume_file.parse_error = failure_message
            self.db.add(resume_file)
            self.db.commit()
            logger.info(
                "Screening completed candidate_id=%s primary_model_call_succeeded=%s final_status=%s",
                candidate.id,
                False,
                failure_status,
            )
            self._finish_ai_task_log(
                log_row,
                status=failure_status,
                provider=task.get("provider") if task else str(request_context.get("provider") or "").strip() or None,
                model_name=task.get("model_name") if task else str(request_context.get("model_name") or "").strip() or None,
                prompt_snapshot=task.get("prompt_snapshot") if task else request_context.get("prompt_snapshot") or prompt,
                full_request_snapshot=task.get("full_request_snapshot") if task else request_context.get("full_request_snapshot"),
                input_summary=task.get("input_summary") if task else request_context.get("input_summary") or truncate_text(prompt, 600),
                output_summary=failure_message,
                output_snapshot=_build_screening_task_progress_snapshot(
                    "failed",
                    message=failure_message,
                    extra={
                        "failure_status": failure_status,
                        "parse_strategy": "combined_parse_and_score",
                        "request_meta": resolved_request_meta,
                        "response_debug": dict((task.get("response_debug") if task else {}) or getattr(exc, "debug_meta", {}) or {}),
                    },
                ),
                error_message=failure_message,
                token_usage=task.get("token_usage") if task else None,
                memory_source=memory_source,
                batch_id=batch_id,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
                screening_run_id=screening_run_id,
                parent_task_id=parent_task_id,
                root_task_id=root_task_id or parent_task_id,
                validation_meta={
                    "screening_result_valid": False,
                    "screening_result_state": failure_status,
                    "failure_code": failure_status,
                    "parse_strategy": "combined_parse_and_score",
                    "reused_existing_parse": False,
                    "reused_existing_score": False,
                    "request_meta": resolved_request_meta,
                    "final_response_source": "screening_request_failed",
                    "response_debug": dict((task.get("response_debug") if task else {}) or getattr(exc, "debug_meta", {}) or {}),
                },
                timing_breakdown={
                    "score_duration_ms": score_duration_ms,
                    "validation_duration_ms": validation_duration_ms,
                    "save_duration_ms": save_duration_ms,
                    "total_duration_ms": max(0, int((time.perf_counter() - started_at) * 1000)),
                },
            )
            raise

        parse_row = RecruitmentResumeParseResult(
            org_code=normalize_org_code(getattr(candidate, "org_code", None)),
            candidate_id=candidate.id,
            resume_file_id=resume_file.id,
            raw_text=raw_text,
            basic_info_json=json_dumps_safe(parsed_resume.get("basic_info") or {}),
            work_experiences_json=json_dumps_safe(parsed_resume.get("work_experiences") or []),
            education_experiences_json=json_dumps_safe(parsed_resume.get("education_experiences") or []),
            skills_json=json_dumps_safe(parsed_resume.get("skills") or []),
            projects_json=json_dumps_safe(parsed_resume.get("projects") or []),
            summary_text=parsed_resume.get("summary") or "",
            status="success",
            error_message=None,
        )
        self.db.add(parse_row)
        self.db.flush()
        basic_info = parsed_resume.get("basic_info") or {}
        candidate.name = str(basic_info.get("name") or candidate.name).strip() or candidate.name
        candidate.phone = str(basic_info.get("phone") or "").strip() or None
        candidate.email = str(basic_info.get("email") or "").strip() or None
        candidate.years_of_experience = str(basic_info.get("years_of_experience") or "").strip() or None
        candidate.education = str(basic_info.get("education") or "").strip() or None
        candidate.latest_parse_result_id = parse_row.id
        candidate.updated_by = actor_id
        resume_file.parse_status = "success"
        resume_file.parse_error = None
        self.db.add(candidate)
        self.db.add(resume_file)
        save_started_at = time.perf_counter()
        score_row = self._save_score_result(
            candidate,
            parse_row,
            actor_id,
            storage_payload,
            allow_status_advance=screening_result_valid,
        )
        final_task_status = "success" if screening_result_valid else "invalid_result"
        final_response_source = "primary_screening_model" if screening_result_valid else "primary_screening_model_invalid"
        final_output_summary = _build_screening_output_summary(
            parsed_resume=parsed_resume,
            score_payload=raw_score_payload,
        ) or task.get("output_summary") or ("初筛流程已完成" if screening_result_valid else "AI 返回了无效初筛结果")
        screening_result_state = "success" if screening_result_valid else "invalid"
        self.db.commit()
        self.db.refresh(parse_row)
        self.db.refresh(score_row)
        self.db.refresh(candidate)
        save_duration_ms = max(0, int((time.perf_counter() - save_started_at) * 1000))
        if screening_result_valid:
            try:
                self._maybe_send_auto_resume_mail_after_screening(candidate, score_row, actor_id=actor_id)
            except Exception:
                logger.exception("Automatic screening mail dispatch failed candidate_id=%s score_id=%s", candidate.id, score_row.id)
        logger.info(
            "Screening completed candidate_id=%s primary_model_call_succeeded=%s final_response_source=%s",
            candidate.id,
            True,
            final_response_source,
        )
        self._finish_ai_task_log(
            log_row,
            status=final_task_status,
            provider=task.get("provider"),
            model_name=task.get("model_name"),
            prompt_snapshot=task.get("prompt_snapshot"),
            full_request_snapshot=task.get("full_request_snapshot"),
            input_summary=task.get("input_summary"),
            output_summary=final_output_summary,
            output_snapshot={
                "task_type": task_type,
                "screening_run_id": screening_run_id,
                "request_meta": resolved_request_meta,
                "parsed_resume": {
                    **parsed_resume,
                    "raw_text_omitted": bool(raw_text),
                },
                "score": raw_score_payload,
                "raw_response_text": task.get("raw_response_text"),
                "meta": {
                    "stage": "completed" if screening_result_valid else "failed",
                    "parse_status": "completed",
                    "parse_strategy": "combined_parse_and_score",
                    "reused_existing_parse": False,
                    "reused_existing_score": False,
                    "primary_model_call_succeeded": True,
                    "final_response_source": final_response_source,
                    "screening_result_state": screening_result_state,
                    "screening_result_valid": screening_result_valid,
                    "invalid_result_reasons": invalid_result_reasons,
                    "validation_warnings": validation_warnings,
                    "model_schema_violation": model_schema_violation,
                    "model_schema_violation_reason": model_schema_violation_reason,
                    "json_candidate_count": one_pass_json_meta.get("candidate_count"),
                    "selected_json_candidate_index": one_pass_json_meta.get("selected_candidate_index"),
                    "selected_json_candidate_source": one_pass_json_meta.get("selected_candidate_source"),
                    "response_debug": task.get("response_debug"),
                },
            },
            error_message=None if screening_result_valid else "AI 返回了无效初筛结果",
            token_usage=task.get("token_usage"),
            memory_source=memory_source,
            batch_id=batch_id,
            related_skill_ids=related_skill_ids,
            related_skill_snapshots=skill_snapshots,
            screening_run_id=screening_run_id,
            parent_task_id=parent_task_id,
            root_task_id=root_task_id or parent_task_id,
            validation_meta={
                "validation_warnings": validation_warnings,
                "invalid_result_reasons": invalid_result_reasons,
                "screening_result_valid": screening_result_valid,
                "screening_result_state": screening_result_state,
                "parse_strategy": "combined_parse_and_score",
                "reused_existing_parse": False,
                "reused_existing_score": False,
                "final_response_source": final_response_source,
                "primary_model_call_succeeded": True,
                "raw_model_suggested_status": validation_meta.get("raw_model_suggested_status"),
                "normalized_final_suggested_status": validation_meta.get("normalized_final_suggested_status") or raw_score_payload.get("suggested_status"),
                "model_schema_violation": model_schema_violation,
                "model_schema_violation_reason": model_schema_violation_reason,
                "json_candidate_count": one_pass_json_meta.get("candidate_count"),
                "selected_json_candidate_index": one_pass_json_meta.get("selected_candidate_index"),
                "selected_json_candidate_source": one_pass_json_meta.get("selected_candidate_source"),
                "response_debug": task.get("response_debug"),
                "request_meta": resolved_request_meta,
            },
            persisted_result_refs=self._build_screening_persisted_result_refs(
                candidate=candidate,
                parse_row=parse_row,
                score_row=score_row,
                screening_result_valid=screening_result_valid,
                raw_model_suggested_status=validation_meta.get("raw_model_suggested_status"),
                normalized_final_suggested_status=validation_meta.get("normalized_final_suggested_status") or raw_score_payload.get("suggested_status"),
            ),
            timing_breakdown={
                "parse_duration_ms": None,
                "score_duration_ms": score_duration_ms,
                "validation_duration_ms": validation_duration_ms,
                "save_duration_ms": save_duration_ms,
                "total_duration_ms": max(0, int((time.perf_counter() - started_at) * 1000)),
            },
        )
        return parse_row, score_row

    def _parse_latest_resume(
        self,
        candidate: RecruitmentCandidate,
        actor_id: str,
        *,
        screening_run_id: Optional[str] = None,
        parent_task_id: Optional[int] = None,
        root_task_id: Optional[int] = None,
        task_log_row: Optional[RecruitmentAITaskLog] = None,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        deadline_at: Optional[datetime] = None,
    ) -> RecruitmentResumeParseResult:
        if not candidate.latest_resume_file_id:
            raise ValueError("鎿嶄綔澶辫触")
        resume_file = self._get_resume_file(candidate.latest_resume_file_id)
        shared_flow_log = task_log_row is not None
        request_hash = self._build_request_hash("resume_parse", candidate.id, resume_file.id, resume_file.storage_path)
        log_row = task_log_row or self._create_ai_task_log(
            "resume_parse",
            created_by=actor_id,
            related_position_id=candidate.position_id,
            related_candidate_id=candidate.id,
            related_resume_file_id=resume_file.id,
            request_hash=request_hash,
            status="running",
            screening_run_id=screening_run_id,
            parent_task_id=parent_task_id,
            root_task_id=root_task_id,
            stage="parsing",
            skill_resolution_source="none",
            skill_resolution_detail={"requested_skill_ids": [], "resolved_skill_ids": [], "resolved_skill_names": [], "used_position_skills": False, "used_candidate_memory": False, "empty_reasons": ["本任务为简历解析，不使用岗位初筛 Skills"]},
            timing_breakdown={"parse_duration_ms": 0, "total_duration_ms": 0},
        )
        resume_file.parse_status = "processing"
        self.db.add(resume_file)
        self.db.commit()
        task: Optional[Dict[str, Any]] = None
        request_context: Dict[str, Any] = {}
        prompt = ""
        raw_text = ""
        started_at = time.perf_counter()
        try:
            remaining_budget_seconds = _ensure_screening_budget_available(deadline_at) if deadline_at else None
            raw_text = extract_resume_text(Path(resume_file.storage_path), resume_file.file_ext or "")
            prompt = self._build_resume_parse_prompt(raw_text=raw_text)
            logger.info(
                "resume_parse prompt prepared candidate_id=%s raw_chars=%s prompt_chars=%s",
                candidate.id,
                len(str(raw_text or "")),
                len(prompt),
            )
            request_context = self.ai_gateway.prepare_json_request_context(
                task_type="resume_parse",
                system_prompt=RESUME_PARSE_SYSTEM_PROMPT,
                user_prompt=prompt,
                timeout_seconds_override=remaining_budget_seconds,
                screening_total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
                remaining_budget_seconds=remaining_budget_seconds,
            )
            self._update_ai_task_log(
                log_row,
                provider=str(request_context.get("provider") or "").strip() or None,
                model_name=str(request_context.get("model_name") or "").strip() or None,
                status="running",
                stage="parsing",
                prompt_snapshot=str(request_context.get("prompt_snapshot") or prompt),
                full_request_snapshot=request_context.get("full_request_snapshot"),
                input_summary=str(request_context.get("input_summary") or truncate_text(raw_text, 600)),
                output_summary="正在解析简历文本",
                output_snapshot=_build_screening_task_progress_snapshot(
                    "parsing",
                    message="正在解析简历文本",
                    extra={
                        "task_type": SCREENING_FLOW_TASK_TYPE if shared_flow_log else "resume_parse",
                        "screening_run_id": screening_run_id,
                        "parse_strategy": "parse_then_score" if shared_flow_log else "parse_only",
                        "score_started": False,
                        "skills_expected": False,
                        "reused_existing_parse": False,
                        "raw_text_chars": len(str(raw_text or "")),
                        "prompt_chars": len(prompt),
                        "provider": request_context.get("provider"),
                        "model_name": request_context.get("model_name"),
                        "endpoint": request_context.get("endpoint"),
                        "timeout_seconds": request_context.get("timeout_seconds"),
                        "configured_read_timeout_seconds": request_context.get("configured_read_timeout_seconds"),
                        "effective_timeout_seconds": request_context.get("effective_timeout_seconds"),
                        "screening_total_timeout_seconds": request_context.get("screening_total_timeout_seconds"),
                        "remaining_budget_seconds": request_context.get("remaining_budget_seconds"),
                        "screening_deadline_at": deadline_at.isoformat() if deadline_at else None,
                        "retry_count": request_context.get("retry_count"),
                        "is_stream_mode": request_context.get("is_stream_mode"),
                    },
                ),
            )
            with self._screening_stage_heartbeat(
                root_task_id=root_task_id,
                stage="parsing",
                message="正在解析简历...",
            ):
                task = self._run_screening_provider_json_request(
                    task_type="resume_parse",
                    system_prompt=RESUME_PARSE_SYSTEM_PROMPT,
                    user_prompt=prompt,
                    cancel_control=cancel_control,
                    runtime_config=request_context.get("runtime_config"),
                    timeout_seconds_override=request_context.get("effective_timeout_seconds"),
                    screening_total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
                    remaining_budget_seconds=request_context.get("remaining_budget_seconds"),
                )
            content = task.get("content") or {}
            gateway_warnings = _normalize_score_warning_items(
                [_normalize_ai_gateway_warning_text(item) for item in (task.get("warnings") or [])],
                limit=12,
            )
            sanitized_resume, sanitize_warnings = _sanitize_ai_parsed_resume_with_meta(
                content if isinstance(content, dict) else {},
                raw_text,
                candidate.name,
            )
            parse_error_message = _build_resume_parse_warning_message(sanitized_resume, candidate.name, None)
            parse_quality_warnings = _extract_parse_quality_warnings(
                sanitized_resume,
                extra_warnings=[*sanitize_warnings, *gateway_warnings],
            )
            parse_row = RecruitmentResumeParseResult(org_code=normalize_org_code(getattr(candidate, "org_code", None)), candidate_id=candidate.id, resume_file_id=resume_file.id, raw_text=raw_text, basic_info_json=json_dumps_safe(sanitized_resume.get("basic_info") or {}), work_experiences_json=json_dumps_safe(sanitized_resume.get("work_experiences") or []), education_experiences_json=json_dumps_safe(sanitized_resume.get("education_experiences") or []), skills_json=json_dumps_safe(sanitized_resume.get("skills") or []), projects_json=json_dumps_safe(sanitized_resume.get("projects") or []), summary_text=sanitized_resume.get("summary") or "", status="success", error_message=parse_error_message)
            self.db.add(parse_row)
            self.db.flush()
            basic_info = sanitized_resume.get("basic_info") or {}
            candidate.name = str(basic_info.get("name") or candidate.name).strip() or candidate.name
            candidate.phone = str(basic_info.get("phone") or "").strip() or None
            candidate.email = str(basic_info.get("email") or "").strip() or None
            candidate.years_of_experience = str(basic_info.get("years_of_experience") or "").strip() or None
            candidate.education = str(basic_info.get("education") or "").strip() or None
            candidate.latest_parse_result_id = parse_row.id
            candidate.updated_by = actor_id
            resume_file.parse_status = "success"
            resume_file.parse_error = parse_error_message
            self.db.add(candidate)
            self.db.add(resume_file)
            self.db.commit()
            self.db.refresh(parse_row)
            parse_duration_ms = max(0, int((time.perf_counter() - started_at) * 1000))
            parse_output_summary = _build_parse_output_summary(parse_quality_warnings)
            response_debug = dict(task.get("response_debug") or {})
            first_attempt_failed_reason = str(response_debug.get("first_attempt_failed_reason") or "").strip() or None
            validation_meta = {
                "validation_warnings": parse_quality_warnings,
                "invalid_result_reasons": [],
                "screening_result_valid": True,
                "screening_result_state": "parsed_with_warnings" if parse_quality_warnings else "parsed",
                "final_response_source": "primary_parse_model",
                "primary_model_call_succeeded": True,
            }
            persisted_result_refs = self._build_screening_persisted_result_refs(candidate=candidate, parse_row=parse_row)
            if shared_flow_log:
                self._update_ai_task_log(
                    log_row,
                    provider=task.get("provider") or str(request_context.get("provider") or "").strip() or None,
                    model_name=task.get("model_name") or str(request_context.get("model_name") or "").strip() or None,
                    status="running",
                    stage="parsed",
                    output_summary="简历解析完成，准备进入评分",
                    output_snapshot=_build_screening_task_progress_snapshot(
                        "parsed",
                        message="简历解析完成，准备进入评分",
                        extra={
                            "task_type": SCREENING_FLOW_TASK_TYPE,
                            "screening_run_id": screening_run_id,
                            "parse_strategy": "parse_then_score",
                            "reused_existing_parse": False,
                            "parse_status": "completed",
                            "parse_result_id": parse_row.id,
                            "endpoint": request_context.get("endpoint"),
                            "timeout_seconds": request_context.get("timeout_seconds"),
                            "configured_read_timeout_seconds": request_context.get("configured_read_timeout_seconds"),
                            "effective_timeout_seconds": request_context.get("effective_timeout_seconds"),
                            "screening_total_timeout_seconds": request_context.get("screening_total_timeout_seconds"),
                            "remaining_budget_seconds": request_context.get("remaining_budget_seconds"),
                            "screening_deadline_at": deadline_at.isoformat() if deadline_at else None,
                            "retry_count": request_context.get("retry_count"),
                            "is_stream_mode": request_context.get("is_stream_mode"),
                            "response_debug": response_debug,
                            "first_attempt_failed_reason": first_attempt_failed_reason,
                        },
                    ),
                    validation_meta=validation_meta,
                    persisted_result_refs=persisted_result_refs,
                    timing_breakdown={"parse_duration_ms": parse_duration_ms},
                    raw_response_text=task.get("raw_response_text"),
                    parsed_response_json=content if isinstance(content, dict) else None,
                    sanitized_response_json=sanitized_resume,
                )
                return parse_row
            self._finish_ai_task_log(
                log_row,
                status="success",
                stage="parsed",
                provider=task.get("provider") or str(request_context.get("provider") or "").strip() or None,
                model_name=task.get("model_name") or str(request_context.get("model_name") or "").strip() or None,
                prompt_snapshot=task.get("prompt_snapshot") or str(request_context.get("prompt_snapshot") or prompt),
                full_request_snapshot=task.get("full_request_snapshot") or request_context.get("full_request_snapshot"),
                input_summary=task.get("input_summary") or str(request_context.get("input_summary") or truncate_text(raw_text, 600)),
                output_summary=parse_output_summary,
                output_snapshot={
                    "task_type": "resume_parse",
                    "screening_run_id": screening_run_id,
                    "stage": "parsed",
                    "parse_strategy": "parse_only",
                    "score_started": False,
                    "skills_expected": False,
                    "parsed_resume": {
                        **sanitized_resume,
                        "raw_text_omitted": bool(raw_text),
                    },
                    "reused_existing_parse": False,
                    "parse_quality_warnings": parse_quality_warnings,
                    "parse_warning_severity": "high" if _has_high_risk_parse_quality_warnings(parse_quality_warnings) else ("warning" if parse_quality_warnings else "none"),
                    "parse_warning_message": parse_error_message,
                    "raw_text_chars": len(str(raw_text or "")),
                    "prompt_chars": len(prompt),
                    "endpoint": request_context.get("endpoint"),
                    "timeout_seconds": request_context.get("timeout_seconds"),
                    "configured_read_timeout_seconds": request_context.get("configured_read_timeout_seconds"),
                    "effective_timeout_seconds": request_context.get("effective_timeout_seconds"),
                    "screening_total_timeout_seconds": request_context.get("screening_total_timeout_seconds"),
                    "remaining_budget_seconds": request_context.get("remaining_budget_seconds"),
                    "screening_deadline_at": deadline_at.isoformat() if deadline_at else None,
                    "retry_count": request_context.get("retry_count"),
                    "is_stream_mode": request_context.get("is_stream_mode"),
                    "response_debug": response_debug,
                    "first_attempt_failed_reason": first_attempt_failed_reason,
                },
                error_message=parse_error_message,
                token_usage=task.get("token_usage"),
                raw_response_text=task.get("raw_response_text"),
                parsed_response_json=content if isinstance(content, dict) else None,
                sanitized_response_json=sanitized_resume,
                validation_meta=validation_meta,
                persisted_result_refs=persisted_result_refs,
                timing_breakdown={"parse_duration_ms": parse_duration_ms, "total_duration_ms": parse_duration_ms},
            )
            return parse_row
        except RecruitmentTaskCancelled:
            self.db.rollback()
            resume_file = self._get_resume_file(candidate.latest_resume_file_id)
            resume_file.parse_status = "cancelled"
            resume_file.parse_error = "任务已被用户停止。"
            self.db.add(resume_file)
            self.db.commit()
            if shared_flow_log:
                raise
            safe_task = task if isinstance(task, dict) else {}
            self._finish_ai_task_log(
                log_row,
                status="cancelled",
                stage="cancelled",
                provider=safe_task.get("provider") or str(request_context.get("provider") or "").strip() or None,
                model_name=safe_task.get("model_name") or str(request_context.get("model_name") or "").strip() or None,
                prompt_snapshot=safe_task.get("prompt_snapshot") or str(request_context.get("prompt_snapshot") or prompt),
                full_request_snapshot=safe_task.get("full_request_snapshot") or request_context.get("full_request_snapshot"),
                input_summary=safe_task.get("input_summary") or str(request_context.get("input_summary") or truncate_text(prompt, 600)),
                output_summary="任务已被用户停止，简历解析未继续生成。",
                output_snapshot={
                    "task_type": "resume_parse",
                    "screening_run_id": screening_run_id,
                    "stage": "cancelled",
                    "parse_strategy": "parse_only",
                    "score_started": False,
                    "skills_expected": False,
                    "raw_text_chars": len(str(raw_text or "")),
                    "prompt_chars": len(prompt),
                    "endpoint": request_context.get("endpoint"),
                    "timeout_seconds": request_context.get("timeout_seconds"),
                    "retry_count": request_context.get("retry_count"),
                    "is_stream_mode": request_context.get("is_stream_mode"),
                },
                error_message="任务已被用户停止，简历解析未继续生成。",
                raw_response_text=safe_task.get("raw_response_text"),
                timing_breakdown={"parse_duration_ms": max(0, int((time.perf_counter() - started_at) * 1000)), "total_duration_ms": max(0, int((time.perf_counter() - started_at) * 1000))},
            )
            raise
        except Exception as exc:
            self.db.rollback()
            resume_file = self._get_resume_file(candidate.latest_resume_file_id)
            failure_status, failure_message = _classify_screening_task_failure(exc)
            resume_file.parse_status = failure_status
            resume_file.parse_error = failure_message
            self.db.add(resume_file)
            self.db.commit()
            parse_duration_ms = max(0, int((time.perf_counter() - started_at) * 1000))
            parse_failure_meta = _extract_json_parse_failure_meta(exc, default_source="parse_request_failed")
            safe_task = task if isinstance(task, dict) else {}
            response_debug = dict(safe_task.get("response_debug") or parse_failure_meta.get("debug_meta") or {})
            first_attempt_failed_reason = str(response_debug.get("first_attempt_failed_reason") or "").strip() or None
            provider = safe_task.get("provider") or str(request_context.get("provider") or "").strip() or None
            model_name = safe_task.get("model_name") or str(request_context.get("model_name") or "").strip() or None
            prompt_snapshot = safe_task.get("prompt_snapshot") or str(request_context.get("prompt_snapshot") or prompt)
            full_request_snapshot = safe_task.get("full_request_snapshot") or request_context.get("full_request_snapshot")
            input_summary = safe_task.get("input_summary") or str(request_context.get("input_summary") or truncate_text(prompt, 600))
            token_usage = safe_task.get("token_usage")
            raw_response_text = safe_task.get("raw_response_text") or parse_failure_meta.get("raw_response_text")
            parsed_response_json = safe_task.get("content") if isinstance(safe_task.get("content"), dict) else None
            validation_meta = {
                "validation_warnings": [],
                "invalid_result_reasons": [failure_message],
                "screening_result_valid": False,
                "screening_result_state": parse_failure_meta.get("screening_result_state") or failure_status,
                "final_response_source": parse_failure_meta.get("final_response_source"),
                "primary_model_call_succeeded": parse_failure_meta.get("primary_model_call_succeeded"),
                "failure_code": parse_failure_meta.get("failure_code"),
            }
            if shared_flow_log:
                self._update_ai_task_log(
                    log_row,
                    provider=provider,
                    model_name=model_name,
                    status="running",
                    stage="failed",
                    prompt_snapshot=prompt_snapshot,
                    full_request_snapshot=full_request_snapshot,
                    input_summary=input_summary,
                    output_summary=failure_message,
                    output_snapshot=_build_screening_task_progress_snapshot(
                        "failed",
                        message=failure_message,
                        extra={
                            "task_type": SCREENING_FLOW_TASK_TYPE,
                            "screening_run_id": screening_run_id,
                            "parse_strategy": "parse_then_score",
                            "reused_existing_parse": False,
                            "parse_status": "failed",
                            "failure_status": failure_status,
                            "raw_text_chars": len(str(raw_text or "")),
                            "prompt_chars": len(prompt),
                            "endpoint": request_context.get("endpoint"),
                            "timeout_seconds": request_context.get("timeout_seconds"),
                            "configured_read_timeout_seconds": request_context.get("configured_read_timeout_seconds"),
                            "effective_timeout_seconds": request_context.get("effective_timeout_seconds"),
                            "screening_total_timeout_seconds": request_context.get("screening_total_timeout_seconds"),
                            "remaining_budget_seconds": request_context.get("remaining_budget_seconds"),
                            "screening_deadline_at": deadline_at.isoformat() if deadline_at else None,
                            "retry_count": request_context.get("retry_count"),
                            "is_stream_mode": request_context.get("is_stream_mode"),
                            "response_debug": response_debug,
                            "first_attempt_failed_reason": first_attempt_failed_reason,
                        },
                    ),
                    validation_meta=validation_meta,
                    persisted_result_refs=self._build_screening_persisted_result_refs(candidate=candidate),
                    timing_breakdown={"parse_duration_ms": parse_duration_ms, "total_duration_ms": parse_duration_ms},
                    raw_response_text=raw_response_text,
                    parsed_response_json=parsed_response_json,
                )
                raise
            self._finish_ai_task_log(
                log_row,
                status=failure_status,
                stage="failed",
                provider=provider,
                model_name=model_name,
                prompt_snapshot=prompt_snapshot,
                full_request_snapshot=full_request_snapshot,
                input_summary=input_summary,
                output_summary=failure_message,
                output_snapshot={
                    "task_type": "resume_parse",
                    "screening_run_id": screening_run_id,
                    "stage": "failed",
                    "parse_strategy": "parse_only",
                    "score_started": False,
                    "skills_expected": False,
                    "failure_status": failure_status,
                    "raw_text_chars": len(str(raw_text or "")),
                    "prompt_chars": len(prompt),
                    "endpoint": request_context.get("endpoint"),
                    "timeout_seconds": request_context.get("timeout_seconds"),
                    "configured_read_timeout_seconds": request_context.get("configured_read_timeout_seconds"),
                    "effective_timeout_seconds": request_context.get("effective_timeout_seconds"),
                    "screening_total_timeout_seconds": request_context.get("screening_total_timeout_seconds"),
                    "remaining_budget_seconds": request_context.get("remaining_budget_seconds"),
                    "screening_deadline_at": deadline_at.isoformat() if deadline_at else None,
                    "retry_count": request_context.get("retry_count"),
                    "is_stream_mode": request_context.get("is_stream_mode"),
                    "response_debug": response_debug,
                    "first_attempt_failed_reason": first_attempt_failed_reason,
                },
                error_message=failure_message,
                token_usage=token_usage,
                raw_response_text=raw_response_text,
                parsed_response_json=parsed_response_json,
                validation_meta=validation_meta,
                persisted_result_refs=self._build_screening_persisted_result_refs(candidate=candidate),
                timing_breakdown={"parse_duration_ms": parse_duration_ms, "total_duration_ms": parse_duration_ms},
            )
            raise

    def _score_candidate(
        self,
        candidate: RecruitmentCandidate,
        parse_row: RecruitmentResumeParseResult,
        actor_id: str,
        skill_rows: Optional[Sequence[RecruitmentSkill]],
        memory_source: str,
        custom_requirements: str = "",
        *,
        skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
        screening_run_id: Optional[str] = None,
        parent_task_id: Optional[int] = None,
        root_task_id: Optional[int] = None,
        skill_resolution_source: Optional[str] = None,
        skill_resolution_detail: Optional[Dict[str, Any]] = None,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        task_log_row: Optional[RecruitmentAITaskLog] = None,
        reused_existing_parse: bool = True,
        deadline_at: Optional[datetime] = None,
    ) -> RecruitmentCandidateScore:
        parsed_payload = self._serialize_parse_result(parse_row)
        parse_quality_warnings = _extract_parse_quality_warnings(parsed_payload)
        status_rules = self._get_rule_config("default_status_rules", DEFAULT_RULE_CONFIGS["default_status_rules"])
        skill_snapshots, related_skill_ids, prepared_custom_requirements = self._prepare_screening_task_context(
            skill_rows=skill_rows,
            skill_snapshots=skill_snapshots,
            custom_requirements=custom_requirements,
        )
        score_rule_snapshot = _build_score_rule_snapshot(skill_snapshots)
        related_skill_names = _dedupe_texts(item.get("name") for item in skill_snapshots if isinstance(item, dict))
        parsed_resume_helper_payload, score_helper_warnings = self._build_score_resume_helper_payload(
            parsed_payload,
            parse_quality_warnings=parse_quality_warnings,
        )
        raw_resume_text = str(parsed_payload.get("raw_text") or getattr(parse_row, "raw_text", "") or "")
        resolved_skill_source = skill_resolution_source or _normalize_skill_resolution_source(memory_source)
        skills_applied_to_prompt = bool(score_rule_snapshot)
        prompt_rule_dimension_count = len(score_rule_snapshot)
        screening_schema_config = _build_screening_schema_config(
            skill_snapshots,
            status_rules=status_rules,
        )
        prompt = self._build_resume_score_prompt(
            candidate=candidate,
            parsed_resume_helper_payload=parsed_resume_helper_payload,
            raw_resume_text=raw_resume_text,
            skill_snapshots=skill_snapshots,
            custom_requirements=prepared_custom_requirements,
            status_rules=status_rules,
        )
        logger.debug("Resume score user prompt preview candidate_id=%s: %s", candidate.id, truncate_text(prompt, 2000))
        request_hash = self._build_request_hash("resume_score", candidate.id, parse_row.id, related_skill_ids, memory_source, prepared_custom_requirements)
        score_task_snapshot_base = {
            "task_type": SCREENING_FLOW_TASK_TYPE if task_log_row is not None else "resume_score",
            "screening_run_id": screening_run_id,
            "parse_result_id": parse_row.id,
            "reused_existing_parse": reused_existing_parse,
            "skills_expected": True,
            "related_skill_ids": related_skill_ids,
            "related_skill_names": related_skill_names,
            "memory_source": memory_source,
            "skill_resolution_source": resolved_skill_source,
            "skill_resolution_detail": skill_resolution_detail,
            "score_rule_snapshot": score_rule_snapshot,
            "skills_applied_to_prompt": skills_applied_to_prompt,
            "prompt_rule_dimension_count": prompt_rule_dimension_count,
        }
        shared_flow_log = task_log_row is not None
        log_row = task_log_row or self._create_ai_task_log(
            "resume_score",
            created_by=actor_id,
            related_position_id=candidate.position_id,
            related_candidate_id=candidate.id,
            related_skill_ids=related_skill_ids,
            related_skill_snapshots=skill_snapshots,
            related_resume_file_id=parse_row.resume_file_id,
            memory_source=memory_source,
            request_hash=request_hash,
            status="running",
            screening_run_id=screening_run_id,
            parent_task_id=parent_task_id,
            root_task_id=root_task_id or parent_task_id,
            stage="scoring",
            skill_resolution_source=resolved_skill_source,
            skill_resolution_detail=skill_resolution_detail,
            score_rule_snapshot=score_rule_snapshot,
            timing_breakdown={"score_duration_ms": 0, "validation_duration_ms": 0, "save_duration_ms": 0, "total_duration_ms": 0},
        )
        task: Optional[Dict[str, Any]] = None
        request_context: Dict[str, Any] = {}
        started_at = time.perf_counter()
        score_duration_ms = 0
        validation_duration_ms = 0
        save_duration_ms = 0
        parse_strategy = "reuse_parse_then_score" if reused_existing_parse else "parse_then_score"
        parse_status_label = "reused" if reused_existing_parse else "completed"
        score_retry_warnings: List[str] = []
        score_response_debug: Dict[str, Any] = {}
        score_model_retry_count = 0
        try:
            remaining_budget_seconds = _ensure_screening_budget_available(deadline_at) if deadline_at else None
            request_context = self.ai_gateway.prepare_json_request_context(
                task_type="resume_score",
                system_prompt=RESUME_SCORE_SYSTEM_PROMPT,
                user_prompt=prompt,
                timeout_seconds_override=remaining_budget_seconds,
                screening_total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
                remaining_budget_seconds=remaining_budget_seconds,
            )
            score_task_snapshot_base.update({
                "endpoint": request_context.get("endpoint"),
                "timeout_seconds": request_context.get("timeout_seconds"),
                "configured_read_timeout_seconds": request_context.get("configured_read_timeout_seconds"),
                "effective_timeout_seconds": request_context.get("effective_timeout_seconds"),
                "screening_total_timeout_seconds": request_context.get("screening_total_timeout_seconds"),
                "remaining_budget_seconds": request_context.get("remaining_budget_seconds"),
                "screening_deadline_at": deadline_at.isoformat() if deadline_at else None,
                "retry_count": request_context.get("retry_count"),
                "is_stream_mode": request_context.get("is_stream_mode"),
            })
            self._raise_if_cancelled(cancel_control)
            self._update_ai_task_log(
                log_row,
                status="running",
                stage="scoring",
                prompt_snapshot=str(request_context.get("prompt_snapshot") or prompt),
                full_request_snapshot=request_context.get("full_request_snapshot"),
                input_summary=str(request_context.get("input_summary") or truncate_text(prompt, 600)),
                output_summary="正在根据岗位要求进行初筛评分",
                output_snapshot=_build_screening_task_progress_snapshot(
                    "scoring",
                    message="正在根据岗位要求进行初筛评分",
                    extra={
                        **score_task_snapshot_base,
                        "endpoint": request_context.get("endpoint"),
                        "timeout_seconds": request_context.get("timeout_seconds"),
                        "configured_read_timeout_seconds": request_context.get("configured_read_timeout_seconds"),
                        "effective_timeout_seconds": request_context.get("effective_timeout_seconds"),
                        "screening_total_timeout_seconds": request_context.get("screening_total_timeout_seconds"),
                        "remaining_budget_seconds": request_context.get("remaining_budget_seconds"),
                        "screening_deadline_at": deadline_at.isoformat() if deadline_at else None,
                        "retry_count": request_context.get("retry_count"),
                        "is_stream_mode": request_context.get("is_stream_mode"),
                    },
                ),
            )
            score_started_at = time.perf_counter()
            authoritative_payload: Dict[str, Any] = {}
            authoritative_raw_text = ""
            with self._screening_stage_heartbeat(
                root_task_id=root_task_id or parent_task_id,
                stage="scoring",
                message="正在评分...",
            ):
                task = self._run_screening_provider_json_request(
                    task_type="resume_score",
                    system_prompt=RESUME_SCORE_SYSTEM_PROMPT,
                    user_prompt=prompt,
                    cancel_control=cancel_control,
                    runtime_config=request_context.get("runtime_config"),
                    timeout_seconds_override=request_context.get("effective_timeout_seconds"),
                    screening_total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
                    remaining_budget_seconds=request_context.get("remaining_budget_seconds"),
                )
                authoritative_raw_text = str(task.get("raw_response_text") or "").strip()
                authoritative_payload = dict(task.get("content") or {}) if isinstance(task.get("content"), dict) else {}
                score_response_debug = dict(task.get("response_debug") or {})
                score_model_retry_count = max(0, int(score_response_debug.get("strict_json_recovery_retry_count") or 0))
                score_retry_warnings.extend(
                    _normalize_score_warning_items(
                        [_normalize_ai_gateway_warning_text(item) for item in (task.get("warnings") or [])],
                        limit=6,
                    )
                )
            score_duration_ms = max(0, int((time.perf_counter() - score_started_at) * 1000))
            self._raise_if_cancelled(cancel_control)
            validation_started_at = time.perf_counter()
            self._update_ai_task_log(
                log_row,
                stage="validating",
                output_summary="正在校验 AI 初筛结果",
                output_snapshot=_build_screening_task_progress_snapshot(
                    "validating",
                    message="正在校验 AI 初筛结果",
                    extra=score_task_snapshot_base,
                ),
            )
            raw_score_payload, validation_meta = sanitize_screening_score_payload(
                authoritative_payload,
                screening_schema_config,
            )
            validation_warnings = _normalize_score_warning_items(
                [*score_helper_warnings, *score_retry_warnings, *(validation_meta.get("warnings") or [])],
                limit=12,
            )
            model_schema_violation = bool(validation_meta.get("model_schema_violation"))
            model_schema_violation_reason = str(validation_meta.get("model_schema_violation_reason") or "").strip() or None
            screening_result_valid, invalid_result_reasons = _classify_screening_score_validity(
                raw_score_payload,
                screening_schema_config,
                validation_warnings=validation_warnings,
            )
            invalid_result_summary = (
                _build_invalid_result_summary(
                    invalid_result_reasons=invalid_result_reasons,
                    validation_warnings=validation_warnings,
                    model_schema_violation_reason=model_schema_violation_reason,
                )
                if not screening_result_valid
                else ""
            )
            if validation_warnings:
                logger.warning(
                    "Score payload validation warnings candidate_id=%s: %s",
                    candidate.id,
                    " ".join(validation_warnings),
                )
            storage_payload = _build_raw_screening_storage_payload(
                score_payload=raw_score_payload,
                score_source="primary_score_model",
                primary_model_call_succeeded=True,
                final_response_source="primary_score_model",
                validation_warnings=validation_warnings,
                raw_response_text=task.get("raw_response_text"),
                parsed_response_payload=authoritative_payload if isinstance(authoritative_payload, dict) else None,
                sanitized_score_payload=raw_score_payload,
            )
            validation_duration_ms = max(0, int((time.perf_counter() - validation_started_at) * 1000))
            save_started_at = time.perf_counter()
            self._update_ai_task_log(
                log_row,
                stage="saving",
                output_summary="正在保存初筛结果",
                output_snapshot=_build_screening_task_progress_snapshot(
                    "saving",
                    message="正在保存初筛结果",
                    extra=score_task_snapshot_base,
                ),
            )
            score_row = self._save_score_result(
                candidate,
                parse_row,
                actor_id,
                storage_payload,
                allow_status_advance=screening_result_valid,
            )
            final_task_status = "success"
            final_response_source = "primary_score_model"
            final_output_summary = _build_screening_output_summary(
                score_payload=raw_score_payload,
            ) or task.get("output_summary")
            screening_result_state = "success"
            final_error_message = None
            if not screening_result_valid:
                final_task_status = "invalid_result"
                final_response_source = "primary_score_model_invalid"
                final_output_summary = f"AI 返回了无效初筛结果：{invalid_result_summary}" if invalid_result_summary else "AI 返回了无效初筛结果"
                final_error_message = final_output_summary
                screening_result_state = "invalid"
            self.db.commit()
            self.db.refresh(score_row)
            self.db.refresh(candidate)
            save_duration_ms = max(0, int((time.perf_counter() - save_started_at) * 1000))
            if screening_result_valid:
                try:
                    self._maybe_send_auto_resume_mail_after_screening(candidate, score_row, actor_id=actor_id)
                except Exception:
                    logger.exception("Automatic screening mail dispatch failed candidate_id=%s score_id=%s", candidate.id, score_row.id)
            logger.info(
                "Screening completed candidate_id=%s primary_model_call_succeeded=%s final_response_source=%s",
                candidate.id,
                True,
                final_response_source,
            )
            final_validation_meta = {
                "validation_warnings": validation_warnings,
                "invalid_result_reasons": invalid_result_reasons,
                "invalid_result_summary": invalid_result_summary or None,
                "model_schema_violation": model_schema_violation,
                "model_schema_violation_reason": model_schema_violation_reason,
                "screening_result_valid": screening_result_valid,
                "screening_result_state": screening_result_state,
                "parse_strategy": parse_strategy,
                "reused_existing_parse": reused_existing_parse,
                "final_response_source": final_response_source,
                "primary_model_call_succeeded": True,
                "raw_model_suggested_status": validation_meta.get("raw_model_suggested_status"),
                "normalized_final_suggested_status": validation_meta.get("normalized_final_suggested_status")
                or raw_score_payload.get("suggested_status"),
                "score_model_retry_count": score_model_retry_count,
                "response_debug": score_response_debug,
            }
            current_timing = _decode_ai_task_json_text(log_row.timing_breakdown_json, {}) if shared_flow_log else {}
            timing_breakdown = {
                **(current_timing if isinstance(current_timing, dict) else {}),
                "score_duration_ms": score_duration_ms,
                "validation_duration_ms": validation_duration_ms,
                "save_duration_ms": save_duration_ms,
                "total_duration_ms": max(0, int((time.perf_counter() - started_at) * 1000)),
            }
            persisted_result_refs = self._build_screening_persisted_result_refs(
                candidate=candidate,
                parse_row=parse_row,
                score_row=score_row,
                screening_result_valid=screening_result_valid,
                raw_model_suggested_status=validation_meta.get("raw_model_suggested_status")
                or (str(raw_score_payload.get("suggested_status") or "").strip() or None),
                normalized_final_suggested_status=validation_meta.get("normalized_final_suggested_status")
                or (str(raw_score_payload.get("suggested_status") or "").strip() or None),
            )
            if shared_flow_log:
                self._update_ai_task_log(
                    log_row,
                    status="running",
                    stage="saving" if screening_result_valid else "failed",
                    output_summary=final_output_summary,
                    output_snapshot={
                        **score_task_snapshot_base,
                        "stage": "saving" if screening_result_valid else "failed",
                        "parse_strategy": parse_strategy,
                        "parse_status": parse_status_label,
                        "score_status": "completed" if screening_result_valid else "failed",
                        "persist_status": "completed" if screening_result_valid else "failed",
                        "score_result_id": score_row.id,
                        "invalid_result_summary": invalid_result_summary or None,
                        "model_schema_violation": model_schema_violation,
                        "model_schema_violation_reason": model_schema_violation_reason,
                        "screening_result_valid": screening_result_valid,
                        "screening_result_state": screening_result_state,
                        "final_response_source": final_response_source,
                        "response_debug": score_response_debug,
                    },
                    error_message=final_error_message,
                    memory_source=memory_source,
                    related_skill_ids=related_skill_ids,
                    related_skill_snapshots=skill_snapshots,
                    screening_run_id=screening_run_id,
                    root_task_id=root_task_id or parent_task_id,
                    skill_resolution_source=resolved_skill_source,
                    skill_resolution_detail=skill_resolution_detail,
                    score_rule_snapshot=score_rule_snapshot,
                    raw_response_text=task.get("raw_response_text"),
                    parsed_response_json=authoritative_payload if isinstance(authoritative_payload, dict) else None,
                    sanitized_response_json=raw_score_payload,
                    validation_meta=final_validation_meta,
                    persisted_result_refs=persisted_result_refs,
                    timing_breakdown=timing_breakdown,
                )
                return score_row
            self._finish_ai_task_log(
                log_row,
                status=final_task_status,
                stage="completed" if screening_result_valid else "failed",
                provider=task.get("provider"),
                model_name=task.get("model_name"),
                prompt_snapshot=task.get("prompt_snapshot"),
                full_request_snapshot=task.get("full_request_snapshot"),
                input_summary=task.get("input_summary"),
                output_summary=final_output_summary,
                output_snapshot={
                    **score_task_snapshot_base,
                    "stage": "completed" if screening_result_valid else "failed",
                    "invalid_result_summary": invalid_result_summary or None,
                    "model_schema_violation": model_schema_violation,
                    "model_schema_violation_reason": model_schema_violation_reason,
                    "screening_result_valid": screening_result_valid,
                    "screening_result_state": screening_result_state,
                    "score": raw_score_payload,
                    "response_debug": score_response_debug,
                },
                error_message=final_error_message,
                token_usage=task.get("token_usage"),
                memory_source=memory_source,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
                screening_run_id=screening_run_id,
                parent_task_id=parent_task_id,
                root_task_id=root_task_id or parent_task_id,
                skill_resolution_source=resolved_skill_source,
                skill_resolution_detail=skill_resolution_detail,
                score_rule_snapshot=score_rule_snapshot,
                raw_response_text=task.get("raw_response_text"),
                parsed_response_json=authoritative_payload if isinstance(authoritative_payload, dict) else None,
                sanitized_response_json=raw_score_payload,
                validation_meta=final_validation_meta,
                persisted_result_refs=persisted_result_refs,
                timing_breakdown=timing_breakdown,
            )
            return score_row
        except RecruitmentTaskCancelled:
            self.db.rollback()
            cancelled_duration_ms = max(0, int((time.perf_counter() - started_at) * 1000))
            if shared_flow_log:
                current_timing = _decode_ai_task_json_text(log_row.timing_breakdown_json, {})
                self._update_ai_task_log(
                    log_row,
                    status="running",
                    stage="cancelled",
                    output_summary="任务已被用户停止，初筛评分未继续生成。",
                    output_snapshot={
                        **score_task_snapshot_base,
                        "stage": "cancelled",
                        "parse_strategy": parse_strategy,
                        "parse_status": parse_status_label,
                        "score_status": "cancelled",
                        "persist_status": "cancelled",
                    },
                    error_message="任务已被用户停止，初筛评分未继续生成。",
                    raw_response_text=task.get("raw_response_text") if task else None,
                    persisted_result_refs=self._build_screening_persisted_result_refs(candidate=candidate, parse_row=parse_row),
                    timing_breakdown={
                        **(current_timing if isinstance(current_timing, dict) else {}),
                        "score_duration_ms": score_duration_ms,
                        "validation_duration_ms": validation_duration_ms,
                        "save_duration_ms": save_duration_ms,
                        "total_duration_ms": cancelled_duration_ms,
                    },
                )
                raise
            self._finish_ai_task_log(
                log_row,
                status="cancelled",
                stage="cancelled",
                provider=task.get("provider") if task else None,
                model_name=task.get("model_name") if task else None,
                prompt_snapshot=task.get("prompt_snapshot") if task else prompt,
                full_request_snapshot=task.get("full_request_snapshot") if task else None,
                input_summary=task.get("input_summary") if task else truncate_text(prompt, 600),
                output_summary="任务已被用户停止，初筛评分未继续生成。",
                output_snapshot={
                    **score_task_snapshot_base,
                    "stage": "cancelled",
                },
                error_message="任务已被用户停止，初筛评分未继续生成。",
                memory_source=memory_source,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
                screening_run_id=screening_run_id,
                parent_task_id=parent_task_id,
                root_task_id=root_task_id or parent_task_id,
                skill_resolution_source=resolved_skill_source,
                skill_resolution_detail=skill_resolution_detail,
                score_rule_snapshot=score_rule_snapshot,
                raw_response_text=task.get("raw_response_text") if task else None,
                persisted_result_refs=self._build_screening_persisted_result_refs(candidate=candidate, parse_row=parse_row),
                timing_breakdown={
                    "score_duration_ms": score_duration_ms,
                    "validation_duration_ms": validation_duration_ms,
                    "save_duration_ms": save_duration_ms,
                    "total_duration_ms": cancelled_duration_ms,
                },
            )
            raise
        except Exception as exc:
            self.db.rollback()
            failed_candidate = self._get_candidate(candidate.id)
            failure_status, failure_message = _classify_screening_task_failure(exc)
            score_failure_meta = _extract_json_parse_failure_meta(exc, default_source="score_request_failed")
            self.db.add(failed_candidate)
            self.db.commit()
            logger.info(
                "Screening completed candidate_id=%s primary_model_call_succeeded=%s final_status=%s",
                candidate.id,
                False,
                failure_status,
            )
            safe_task = task if isinstance(task, dict) else {}
            failure_validation_meta = {
                "validation_warnings": [],
                "invalid_result_reasons": [failure_message],
                "invalid_result_summary": _build_invalid_result_summary(
                    invalid_result_reasons=[failure_message],
                ) or failure_message,
                "model_schema_violation": False,
                "model_schema_violation_reason": None,
                "screening_result_valid": False,
                "screening_result_state": score_failure_meta.get("screening_result_state") or failure_status,
                "parse_strategy": parse_strategy,
                "reused_existing_parse": reused_existing_parse,
                "final_response_source": score_failure_meta.get("final_response_source") or "score_request_failed",
                "primary_model_call_succeeded": score_failure_meta.get("primary_model_call_succeeded"),
                "failure_code": score_failure_meta.get("failure_code") or failure_status,
                "response_debug": dict(score_failure_meta.get("debug_meta") or safe_task.get("response_debug") or {}),
            }
            provider = safe_task.get("provider") or str(request_context.get("provider") or "").strip() or None
            model_name = safe_task.get("model_name") or str(request_context.get("model_name") or "").strip() or None
            prompt_snapshot = safe_task.get("prompt_snapshot") or str(request_context.get("prompt_snapshot") or prompt)
            full_request_snapshot = safe_task.get("full_request_snapshot") or request_context.get("full_request_snapshot")
            input_summary = safe_task.get("input_summary") or str(request_context.get("input_summary") or truncate_text(prompt, 600))
            token_usage = safe_task.get("token_usage")
            raw_response_text = safe_task.get("raw_response_text") or score_failure_meta.get("raw_response_text") or getattr(exc, "raw_response_text", None)
            parsed_response_json = safe_task.get("content") if isinstance(safe_task.get("content"), dict) else None
            if shared_flow_log:
                current_timing = _decode_ai_task_json_text(log_row.timing_breakdown_json, {})
                self._update_ai_task_log(
                    log_row,
                    status="running",
                    stage="failed",
                    output_summary=failure_message,
                    output_snapshot={
                        **score_task_snapshot_base,
                        "stage": "failed",
                        "parse_strategy": parse_strategy,
                        "parse_status": parse_status_label,
                        "score_status": "failed",
                        "persist_status": "failed",
                        "invalid_result_summary": failure_validation_meta.get("invalid_result_summary"),
                        "failure_status": failure_status,
                        "response_debug": failure_validation_meta.get("response_debug"),
                    },
                    error_message=failure_message,
                    prompt_snapshot=prompt_snapshot,
                    full_request_snapshot=full_request_snapshot,
                    input_summary=input_summary,
                    raw_response_text=raw_response_text,
                    parsed_response_json=parsed_response_json,
                    validation_meta=failure_validation_meta,
                    persisted_result_refs=self._build_screening_persisted_result_refs(candidate=failed_candidate, parse_row=parse_row),
                    timing_breakdown={
                        **(current_timing if isinstance(current_timing, dict) else {}),
                        "score_duration_ms": score_duration_ms,
                        "validation_duration_ms": validation_duration_ms,
                        "save_duration_ms": save_duration_ms,
                        "total_duration_ms": max(0, int((time.perf_counter() - started_at) * 1000)),
                    },
                )
                raise
            self._finish_ai_task_log(
                log_row,
                status=failure_status,
                stage="failed",
                provider=provider,
                model_name=model_name,
                prompt_snapshot=prompt_snapshot,
                full_request_snapshot=full_request_snapshot,
                input_summary=input_summary,
                output_summary=failure_message,
                output_snapshot={
                    **score_task_snapshot_base,
                    "stage": "failed",
                    "invalid_result_summary": failure_validation_meta.get("invalid_result_summary"),
                    "failure_status": failure_status,
                    "response_debug": failure_validation_meta.get("response_debug"),
                },
                error_message=failure_message,
                token_usage=token_usage,
                memory_source=memory_source,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
                screening_run_id=screening_run_id,
                parent_task_id=parent_task_id,
                root_task_id=root_task_id or parent_task_id,
                skill_resolution_source=resolved_skill_source,
                skill_resolution_detail=skill_resolution_detail,
                score_rule_snapshot=score_rule_snapshot,
                raw_response_text=raw_response_text,
                parsed_response_json=parsed_response_json,
                validation_meta=failure_validation_meta,
                persisted_result_refs=self._build_screening_persisted_result_refs(candidate=failed_candidate, parse_row=parse_row),
                timing_breakdown={
                    "score_duration_ms": score_duration_ms,
                    "validation_duration_ms": validation_duration_ms,
                    "save_duration_ms": save_duration_ms,
                    "total_duration_ms": max(0, int((time.perf_counter() - started_at) * 1000)),
                },
            )
            raise

    def trigger_latest_parse(self, candidate_id: int, actor_id: str, *, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        return self._serialize_parse_result(self._parse_latest_resume(candidate, actor_id, cancel_control=cancel_control))

    def trigger_latest_score(self, candidate_id: int, actor_id: str, *, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        skill_rows, memory_source, skill_resolution_source, skill_resolution_detail = self._resolve_screening_skills(candidate, None, use_position_skills=True, use_candidate_memory=True)
        parse_row = self._get_current_parse_result(candidate)
        if not parse_row:
            parse_row = self._parse_latest_resume(candidate, actor_id, cancel_control=cancel_control)
        return self._serialize_score(
            self._score_candidate(
                candidate,
                parse_row,
                actor_id,
                skill_rows,
                memory_source,
                "",
                skill_resolution_source=skill_resolution_source,
                skill_resolution_detail=skill_resolution_detail,
                cancel_control=cancel_control,
            )
        )

    def _save_screening_workflow_memory(
        self,
        *,
        candidate: RecruitmentCandidate,
        actor_id: str,
        parse_row: RecruitmentResumeParseResult,
        score_row: RecruitmentCandidateScore,
        memory_source: str,
        related_skill_ids: Sequence[int],
        custom_requirements: str,
    ) -> None:
        workflow = self._get_or_create_workflow_memory(candidate, actor_id)
        workflow.position_id = candidate.position_id
        workflow.screening_skill_ids_json = json_dumps_safe(list(related_skill_ids))
        workflow.screening_memory_source = memory_source
        workflow.screening_rule_snapshot_json = json_dumps_safe(
            {
                "score_rule_snapshot": _build_score_rule_snapshot([self._serialize_skill_snapshot(skill, index) for index, skill in enumerate(self._load_skill_rows(related_skill_ids, enabled_only=True))]),
                "custom_requirements": custom_requirements or None,
                "weight_source": "dimension_rules",
            }
        )
        workflow.latest_parse_result_id = parse_row.id
        workflow.latest_score_id = score_row.id
        workflow.last_screened_at = func.now()
        workflow.updated_by = actor_id
        self.db.add(workflow)
        candidate.updated_by = actor_id
        self.db.add(candidate)
        self.db.commit()

    def _run_queued_screening_task(self, task_id: int, actor_id: str, *, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        log_row = self._get_ai_task_log_row(task_id)
        if log_row.status not in {"queued", "pending", "running"}:
            return self.get_ai_task_log(task_id)
        if not log_row.related_candidate_id:
            raise ValueError("初筛任务缺少候选人信息。")
        task_snapshot = _decode_ai_task_json_text(getattr(log_row, "output_snapshot", None), {})
        task_skill_snapshots = json_loads_safe(log_row.related_skill_snapshots_json, [])
        task_memory_source = str(log_row.memory_source or "").strip() or "task_snapshot"
        custom_requirements = _extract_custom_requirements_from_skill_snapshots(task_skill_snapshots)
        screening_mode = "default"
        force_fallback = False
        allow_reuse_parse = True
        allow_score_only_rerun = True
        if isinstance(task_snapshot, dict):
            screening_mode = _normalize_screening_mode(
                task_snapshot.get("screening_mode"),
                force_fallback=bool(task_snapshot.get("force_fallback")),
            )
            force_fallback = bool(task_snapshot.get("force_fallback"))
            allow_reuse_parse = bool(task_snapshot.get("allow_reuse_parse", True))
            allow_score_only_rerun = bool(task_snapshot.get("allow_score_only_rerun", True))
        return self.screen_candidate(
            log_row.related_candidate_id,
            actor_id,
            skill_ids=[],
            use_position_skills=False,
            use_candidate_memory=False,
            custom_requirements=custom_requirements,
            force_one_pass=True,
            force_fallback=force_fallback,
            allow_reuse_parse=allow_reuse_parse,
            allow_score_only_rerun=allow_score_only_rerun,
            screening_mode=screening_mode,
            existing_task_id=task_id,
            cancel_control=cancel_control,
            task_skill_snapshots=task_skill_snapshots,
            task_memory_source=task_memory_source,
        )

    def screen_candidate(
        self,
        candidate_id: int,
        actor_id: str,
        skill_ids: Optional[Iterable[Any]] = None,
        use_position_skills: bool = True,
        use_candidate_memory: bool = True,
        custom_requirements: str = "",
        *,
        force_one_pass: bool = True,
        force_fallback: bool = False,
        allow_reuse_parse: bool = True,
        allow_score_only_rerun: bool = True,
        screening_mode: str = "default",
        existing_task_id: Optional[int] = None,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        task_skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None,
        task_memory_source: Optional[str] = None,
    ) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        if not candidate.latest_resume_file_id:
            raise ValueError("候选人暂无可用简历，无法发起初筛。")
        normalized_screening_mode = _normalize_screening_mode(screening_mode, force_fallback=force_fallback)
        if not force_one_pass and normalized_screening_mode == "default":
            normalized_screening_mode = "fallback_parse_then_score"

        if task_skill_snapshots is not None:
            skill_rows = self._load_skill_rows(self._extract_related_skill_ids(task_skill_snapshots), enabled_only=True)
            memory_source = task_memory_source or "task_snapshot"
            skill_snapshots, related_skill_ids, prepared_custom_requirements = self._prepare_screening_task_context(
                skill_snapshots=task_skill_snapshots,
                custom_requirements=custom_requirements,
            )
            workflow = self._get_workflow_memory(candidate.id)
            workflow_memory_skill_ids = _dedupe_ints(json_loads_safe(workflow.screening_skill_ids_json, [])) if workflow else []
            position_screening_skill_ids = self._get_position_task_skill_ids(self._get_position(candidate.position_id), "screening") if candidate.position_id else []
            skill_resolution_source = "task_snapshot"
            skill_resolution_detail = _build_skill_resolution_detail(
                requested_skill_ids=related_skill_ids,
                resolved_skill_snapshots=skill_snapshots,
                position_screening_skill_ids=position_screening_skill_ids,
                workflow_memory_skill_ids=workflow_memory_skill_ids,
                task_snapshot_skill_ids=related_skill_ids,
                used_position_skills=False,
                used_candidate_memory=False,
                used_task_snapshot=True,
            )
        else:
            skill_rows, memory_source, skill_resolution_source, skill_resolution_detail = self._resolve_screening_skills(
                candidate,
                skill_ids,
                use_position_skills=use_position_skills,
                use_candidate_memory=use_candidate_memory,
            )
            skill_snapshots, related_skill_ids, prepared_custom_requirements = self._prepare_screening_task_context(
                skill_rows=skill_rows,
                custom_requirements=custom_requirements,
            )

        score_rule_snapshot = _build_score_rule_snapshot(skill_snapshots)
        parse_row: Optional[RecruitmentResumeParseResult] = self._get_current_parse_result(candidate)
        had_existing_parse = allow_reuse_parse and self._can_reuse_existing_parse_result(candidate, parse_row)
        if not had_existing_parse:
            parse_row = None
        resume_file = self._get_resume_file(candidate.latest_resume_file_id)
        request_raw_text = (
            str(getattr(parse_row, "raw_text", "") or "").strip()
            if parse_row and getattr(parse_row, "raw_text", None)
            else self._extract_resume_file_raw_text(resume_file)
        )

        default_request_meta = self._build_screening_request_meta(
            candidate=candidate,
            resume_file_id=candidate.latest_resume_file_id or 0,
            raw_resume_text=request_raw_text,
            score_rule_snapshot=score_rule_snapshot,
            custom_requirements=prepared_custom_requirements,
            prompt_version=RESUME_SCREENING_PROMPT_VERSION,
            screening_mode="default",
            request_scope="screening_one_pass",
            model_task_type=SCREENING_ONE_PASS_TASK_TYPE,
        )
        cached_result = (
            self._load_reusable_screening_result(
                request_hash=str(default_request_meta.get("request_hash") or "").strip(),
                candidate_id=candidate.id,
            )
            if normalized_screening_mode == "default"
            else None
        )
        previous_valid_result = None
        if normalized_screening_mode == "default" and not cached_result and had_existing_parse:
            previous_valid_result = self._get_latest_valid_screening_result_for_candidate(candidate.id)
            if previous_valid_result and self._should_rerank_from_existing_parse(
                allow_score_only_rerun=allow_score_only_rerun,
                parse_row=parse_row,
                current_request_meta=default_request_meta,
                previous_request_meta=previous_valid_result.get("request_meta") or {},
            ):
                normalized_screening_mode = "rerank_from_existing_parse"

        if normalized_screening_mode == "rerank_from_existing_parse" and not parse_row:
            normalized_screening_mode = "fallback_parse_then_score"

        request_scope = (
            "screening_score_only"
            if normalized_screening_mode == "rerank_from_existing_parse"
            else "screening_fallback"
            if normalized_screening_mode == "fallback_parse_then_score"
            else "screening_one_pass"
        )
        prompt_version = (
            RESUME_SCORE_PROMPT_VERSION
            if normalized_screening_mode == "rerank_from_existing_parse"
            else f"{RESUME_SCORE_PROMPT_VERSION}:fallback"
            if normalized_screening_mode == "fallback_parse_then_score"
            else RESUME_SCREENING_PROMPT_VERSION
        )
        request_meta = (
            default_request_meta
            if normalized_screening_mode == "default"
            else self._build_screening_request_meta(
                candidate=candidate,
                resume_file_id=candidate.latest_resume_file_id or 0,
                raw_resume_text=request_raw_text,
                score_rule_snapshot=score_rule_snapshot,
                custom_requirements=prepared_custom_requirements,
                prompt_version=prompt_version,
                screening_mode=normalized_screening_mode,
                request_scope=request_scope,
                model_task_type=SCREENING_ONE_PASS_TASK_TYPE if normalized_screening_mode == "default" else "resume_score",
            )
        )
        request_hash = str(request_meta.get("request_hash") or "").strip() or None
        if not cached_result and request_hash:
            cached_result = self._load_reusable_screening_result(
                request_hash=request_hash,
                candidate_id=candidate.id,
            )

        root_log = self._ensure_screening_root_task(
            candidate=candidate,
            actor_id=actor_id,
            related_skill_ids=related_skill_ids,
            skill_snapshots=skill_snapshots,
            memory_source=memory_source,
            skill_resolution_source=skill_resolution_source,
            skill_resolution_detail=skill_resolution_detail,
            score_rule_snapshot=score_rule_snapshot,
            existing_task_id=existing_task_id,
            request_hash=request_hash,
            request_meta=request_meta,
            screening_mode=normalized_screening_mode,
            force_fallback=force_fallback,
            allow_reuse_parse=allow_reuse_parse,
            allow_score_only_rerun=allow_score_only_rerun,
        )
        screening_run_id = root_log.screening_run_id or _build_screening_run_id(candidate.id)
        root_task_id = root_log.root_task_id or root_log.id
        root_output_snapshot = _decode_ai_task_json_text(getattr(root_log, "output_snapshot", None), {})
        existing_screening_started_at = _parse_iso_datetime_value(root_output_snapshot.get("screening_started_at")) if isinstance(root_output_snapshot, dict) else None
        existing_screening_deadline_at = _parse_iso_datetime_value(root_output_snapshot.get("screening_deadline_at")) if isinstance(root_output_snapshot, dict) else None
        screening_started_at = existing_screening_started_at or datetime.now()
        screening_deadline_at = existing_screening_deadline_at or _compute_screening_deadline_at(screening_started_at)
        related_skill_names = _dedupe_texts(item.get("name") for item in skill_snapshots if isinstance(item, dict))
        skills_applied_to_prompt = bool(score_rule_snapshot)
        prompt_rule_dimension_count = len(score_rule_snapshot)
        parse_row = parse_row if had_existing_parse else None
        score_row: Optional[RecruitmentCandidateScore] = None
        batch_id = getattr(root_log, "batch_id", None)

        flow_state: Dict[str, Any] = {
            "parse_strategy": (
                "rerank_from_existing_parse"
                if normalized_screening_mode == "rerank_from_existing_parse"
                else "fallback_parse_then_score"
                if normalized_screening_mode == "fallback_parse_then_score"
                else "combined_parse_and_score"
            ),
            "parse_status": "pending",
            "score_status": "pending",
            "persist_status": "pending",
            "reused_existing_parse": had_existing_parse,
            "reused_existing_score": False,
            "parse_result_id": parse_row.id if parse_row else None,
            "score_result_id": None,
            "final_response_source": None,
            "primary_model_call_succeeded": None,
            "raw_model_suggested_status": None,
            "normalized_final_suggested_status": None,
            "one_pass_salvage_attempted": False,
            "one_pass_salvage_succeeded": False,
        }

        def build_root_task_snapshot_extra() -> Dict[str, Any]:
            return {
                "task_type": SCREENING_FLOW_TASK_TYPE,
                "task_role": "root",
                "screening_run_id": screening_run_id,
                "batch_id": batch_id,
                "screening_mode": normalized_screening_mode,
                "parse_strategy": flow_state.get("parse_strategy"),
                "parse_status": flow_state.get("parse_status"),
                "score_status": flow_state.get("score_status"),
                "persist_status": flow_state.get("persist_status"),
                "reused_existing_parse": bool(flow_state.get("reused_existing_parse")),
                "reused_existing_score": bool(flow_state.get("reused_existing_score")),
                "parse_result_id": flow_state.get("parse_result_id"),
                "score_result_id": flow_state.get("score_result_id"),
                "final_response_source": flow_state.get("final_response_source"),
                "primary_model_call_succeeded": flow_state.get("primary_model_call_succeeded"),
                "raw_model_suggested_status": flow_state.get("raw_model_suggested_status"),
                "normalized_final_suggested_status": flow_state.get("normalized_final_suggested_status"),
                "one_pass_salvage_attempted": bool(flow_state.get("one_pass_salvage_attempted")),
                "one_pass_salvage_succeeded": bool(flow_state.get("one_pass_salvage_succeeded")),
                "screening_started_at": screening_started_at.isoformat(),
                "screening_deadline_at": screening_deadline_at.isoformat(),
                "remaining_budget_seconds": round(_compute_screening_remaining_budget_seconds(screening_deadline_at) or 0.0, 2),
                "related_skill_ids": related_skill_ids,
                "related_skill_names": related_skill_names,
                "score_rule_snapshot": score_rule_snapshot,
                "skills_applied_to_prompt": skills_applied_to_prompt,
                "prompt_rule_dimension_count": prompt_rule_dimension_count,
                "memory_source": memory_source,
                "skill_resolution_source": skill_resolution_source,
                "skill_resolution_detail": skill_resolution_detail,
                "request_meta": request_meta,
                "force_fallback": bool(force_fallback),
                "allow_reuse_parse": bool(allow_reuse_parse),
                "allow_score_only_rerun": bool(allow_score_only_rerun),
            }

        def load_run_logs() -> Tuple[Optional[RecruitmentAITaskLog], Optional[RecruitmentAITaskLog]]:
            return (
                self._get_latest_screening_run_task(screening_run_id, task_type="resume_parse", parent_task_id=root_log.id),
                self._get_latest_screening_score_run_task(screening_run_id, parent_task_id=root_log.id),
            )

        def build_root_validation_meta(
            *,
            parse_log: Optional[RecruitmentAITaskLog],
            score_log: Optional[RecruitmentAITaskLog],
            fallback_state: str,
            fallback_valid: bool,
            fallback_reasons: Optional[Sequence[Any]] = None,
            fallback_summary: Optional[str] = None,
        ) -> Dict[str, Any]:
            source_meta: Dict[str, Any] = {}
            for meta_candidate in [
                _decode_ai_task_json_text(getattr(score_log, "validation_meta_json", None), None) if score_log else None,
                _decode_ai_task_json_text(getattr(parse_log, "validation_meta_json", None), None) if parse_log else None,
                _decode_ai_task_json_text(getattr(root_log, "validation_meta_json", None), None),
            ]:
                if isinstance(meta_candidate, dict):
                    source_meta = meta_candidate
                    break
            validation_warnings = _normalize_score_warning_items(source_meta.get("validation_warnings"), limit=12)
            invalid_result_reasons = _normalize_score_warning_items(source_meta.get("invalid_result_reasons") or fallback_reasons, limit=12)
            invalid_result_summary = str(source_meta.get("invalid_result_summary") or fallback_summary or "").strip() or None
            model_schema_violation_reason = str(source_meta.get("model_schema_violation_reason") or "").strip() or None
            screening_result_valid = source_meta.get("screening_result_valid") if isinstance(source_meta.get("screening_result_valid"), bool) else fallback_valid
            screening_result_state = str(source_meta.get("screening_result_state") or fallback_state or "").strip() or fallback_state
            if not invalid_result_summary:
                invalid_result_summary = _build_invalid_result_summary(
                    invalid_result_reasons=invalid_result_reasons,
                    validation_warnings=validation_warnings,
                    model_schema_violation_reason=model_schema_violation_reason,
                ) or None
            result: Dict[str, Any] = {
                "validation_warnings": validation_warnings,
                "invalid_result_reasons": invalid_result_reasons,
                "invalid_result_summary": invalid_result_summary,
                "model_schema_violation": bool(source_meta.get("model_schema_violation")),
                "model_schema_violation_reason": model_schema_violation_reason,
                "screening_result_valid": screening_result_valid,
                "screening_result_state": screening_result_state,
                "parse_strategy": str(source_meta.get("parse_strategy") or flow_state.get("parse_strategy") or "combined_parse_and_score"),
                "reused_existing_parse": bool(source_meta.get("reused_existing_parse")) or bool(flow_state.get("reused_existing_parse")),
                "reused_existing_score": bool(source_meta.get("reused_existing_score")) or bool(flow_state.get("reused_existing_score")),
                "request_meta": dict(source_meta.get("request_meta")) if isinstance(source_meta.get("request_meta"), dict) else dict(request_meta),
            }
            if "final_response_source" in source_meta:
                result["final_response_source"] = source_meta.get("final_response_source")
            elif flow_state.get("final_response_source"):
                result["final_response_source"] = flow_state.get("final_response_source")
            if "primary_model_call_succeeded" in source_meta:
                result["primary_model_call_succeeded"] = bool(source_meta.get("primary_model_call_succeeded"))
            elif isinstance(flow_state.get("primary_model_call_succeeded"), bool):
                result["primary_model_call_succeeded"] = bool(flow_state.get("primary_model_call_succeeded"))
            failure_code = str(source_meta.get("failure_code") or "").strip()
            if failure_code:
                result["failure_code"] = failure_code
            elif fallback_state == "screening_total_timeout":
                result["failure_code"] = "screening_total_timeout"
            if flow_state.get("one_pass_salvage_attempted"):
                result["parse_strategy"] = "combined_parse_and_score"
                result["reused_existing_parse"] = False
                result["reused_existing_score"] = False
                result["primary_model_call_succeeded"] = True
                result["one_pass_salvage_attempted"] = True
                result["one_pass_salvage_succeeded"] = bool(flow_state.get("one_pass_salvage_succeeded"))
                if not flow_state.get("one_pass_salvage_succeeded") and failure_code in {
                    "json_parse_failed",
                    "invalid_json_variant_conflict",
                    "timeout",
                    "request_failed",
                    "rate_limited",
                    "upstream_timeout",
                    "retry_exhausted",
                    "screening_total_timeout",
                }:
                    result["screening_result_valid"] = fallback_valid
                    result["screening_result_state"] = fallback_state
                    result["invalid_result_reasons"] = _normalize_score_warning_items(fallback_reasons, limit=12)
                    result["invalid_result_summary"] = fallback_summary or result.get("invalid_result_summary")
                    result["final_response_source"] = flow_state.get("final_response_source") or "primary_screening_model_invalid"
                    result.pop("failure_code", None)
                if flow_state.get("one_pass_salvage_succeeded"):
                    result["final_response_source"] = flow_state.get("final_response_source") or "primary_screening_model_salvaged"
            return result

        def finish_root_task(
            *,
            candidate_ref: RecruitmentCandidate,
            status: str,
            stage: str,
            output_summary: str,
            error_message: Optional[str] = None,
            fallback_state: str,
            fallback_valid: bool,
            fallback_reasons: Optional[Sequence[Any]] = None,
            fallback_summary: Optional[str] = None,
        ) -> None:
            parse_log, score_log = load_run_logs()
            timing_breakdown = self._build_screening_run_timing_breakdown(root_log=root_log, parse_log=parse_log, score_log=score_log)
            validation_meta = build_root_validation_meta(
                parse_log=parse_log,
                score_log=score_log,
                fallback_state=fallback_state,
                fallback_valid=fallback_valid,
                fallback_reasons=fallback_reasons,
                fallback_summary=fallback_summary,
            )
            persisted_result_refs = self._build_screening_persisted_result_refs(
                candidate=candidate_ref,
                parse_row=parse_row,
                score_row=score_row,
                screening_result_valid=validation_meta.get("screening_result_valid") if isinstance(validation_meta.get("screening_result_valid"), bool) else None,
                raw_model_suggested_status=flow_state.get("raw_model_suggested_status"),
                normalized_final_suggested_status=flow_state.get("normalized_final_suggested_status"),
            )
            flow_state["final_response_source"] = validation_meta.get("final_response_source") or flow_state.get("final_response_source")
            if isinstance(validation_meta.get("primary_model_call_succeeded"), bool):
                flow_state["primary_model_call_succeeded"] = validation_meta.get("primary_model_call_succeeded")
            source_log = score_log or parse_log or root_log
            source_output_snapshot = _decode_ai_task_json_text(getattr(source_log, "output_snapshot", None), {}) if source_log else {}
            resolved_provider = str(
                getattr(score_log, "model_provider", None)
                or getattr(parse_log, "model_provider", None)
                or getattr(root_log, "model_provider", None)
                or ""
            ).strip() or None
            resolved_model_name = str(
                getattr(score_log, "model_name", None)
                or getattr(parse_log, "model_name", None)
                or getattr(root_log, "model_name", None)
                or ""
            ).strip() or None
            resolved_prompt_snapshot = getattr(source_log, "prompt_snapshot", None) if source_log else None
            resolved_full_request_snapshot = getattr(source_log, "full_request_snapshot", None) if source_log else None
            resolved_input_summary = getattr(source_log, "input_summary", None) if source_log else None
            resolved_raw_response_text = getattr(source_log, "raw_response_text", None) if source_log else None
            resolved_parsed_response_json = _decode_ai_task_json_text(getattr(source_log, "parsed_response_json", None), None) if source_log else None
            resolved_sanitized_response_json = _decode_ai_task_json_text(getattr(source_log, "sanitized_response_json", None), None) if source_log else None
            resolved_parsed_resume = (
                source_output_snapshot.get("parsed_resume")
                if isinstance(source_output_snapshot, dict) and isinstance(source_output_snapshot.get("parsed_resume"), dict)
                else self._serialize_parse_result(parse_row) if parse_row else None
            )
            resolved_score = (
                source_output_snapshot.get("score")
                if isinstance(source_output_snapshot, dict) and isinstance(source_output_snapshot.get("score"), dict)
                else self._serialize_score(score_row) if score_row else None
            )
            resolved_meta = (
                source_output_snapshot.get("meta")
                if isinstance(source_output_snapshot, dict) and isinstance(source_output_snapshot.get("meta"), dict)
                else {}
            )
            self._finish_ai_task_log(
                root_log,
                status=status,
                stage=stage,
                provider=resolved_provider,
                model_name=resolved_model_name,
                prompt_snapshot=resolved_prompt_snapshot,
                full_request_snapshot=resolved_full_request_snapshot,
                input_summary=resolved_input_summary,
                output_summary=output_summary,
                output_snapshot={
                    **build_root_task_snapshot_extra(),
                    "stage": stage,
                    "run_completed": status in TERMINAL_AI_TASK_STATUSES,
                    "timing_breakdown": timing_breakdown,
                    "persisted_result_refs": persisted_result_refs,
                    "parsed_resume": resolved_parsed_resume,
                    "score": resolved_score,
                    "meta": {
                        **resolved_meta,
                        "screening_result_valid": validation_meta.get("screening_result_valid"),
                        "screening_result_state": validation_meta.get("screening_result_state"),
                        "parse_strategy": validation_meta.get("parse_strategy"),
                        "reused_existing_parse": validation_meta.get("reused_existing_parse"),
                        "reused_existing_score": validation_meta.get("reused_existing_score"),
                        "final_response_source": validation_meta.get("final_response_source"),
                        "primary_model_call_succeeded": validation_meta.get("primary_model_call_succeeded"),
                    },
                },
                error_message=error_message,
                memory_source=memory_source,
                batch_id=batch_id,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
                screening_run_id=screening_run_id,
                root_task_id=root_task_id,
                skill_resolution_source=skill_resolution_source,
                skill_resolution_detail=skill_resolution_detail,
                score_rule_snapshot=score_rule_snapshot,
                raw_response_text=resolved_raw_response_text,
                parsed_response_json=resolved_parsed_response_json,
                sanitized_response_json=resolved_sanitized_response_json,
                validation_meta=validation_meta,
                persisted_result_refs=persisted_result_refs,
                timing_breakdown=timing_breakdown,
            )
            logger.info(
                "screening_flow finalized run_id=%s candidate_id=%s status=%s stage=%s parse_status=%s score_status=%s persist_status=%s",
                screening_run_id,
                candidate_ref.id,
                status,
                stage,
                flow_state.get("parse_status"),
                flow_state.get("score_status"),
                flow_state.get("persist_status"),
            )

        try:
            self._update_ai_task_log(
                root_log,
                status="running",
                stage="running",
                batch_id=batch_id,
                output_summary="初筛流程开始执行",
                output_snapshot=_build_screening_task_progress_snapshot(
                    "running",
                    message="初筛流程开始执行",
                    extra=build_root_task_snapshot_extra(),
                ),
            )
            logger.info(
                "screening_flow started run_id=%s candidate_id=%s root_task_id=%s screening_mode=%s parse_strategy=%s",
                screening_run_id,
                candidate.id,
                root_task_id,
                normalized_screening_mode,
                flow_state.get("parse_strategy"),
            )

            if cached_result:
                parse_row = cached_result.get("parse_row")
                score_row = cached_result.get("score_row")
                cached_validation_meta = cached_result.get("validation_meta") if isinstance(cached_result.get("validation_meta"), dict) else {}
                flow_state["parse_status"] = "reused"
                flow_state["score_status"] = "reused"
                flow_state["persist_status"] = "completed"
                flow_state["reused_existing_parse"] = True
                flow_state["reused_existing_score"] = True
                flow_state["parse_result_id"] = parse_row.id if parse_row else None
                flow_state["score_result_id"] = score_row.id if score_row else None
                flow_state["final_response_source"] = cached_validation_meta.get("final_response_source") or "reused_existing_result"
                flow_state["primary_model_call_succeeded"] = cached_validation_meta.get("primary_model_call_succeeded")
                flow_state["raw_model_suggested_status"] = cached_validation_meta.get("raw_model_suggested_status") or (score_row.suggested_status if score_row else None)
                flow_state["normalized_final_suggested_status"] = cached_validation_meta.get("normalized_final_suggested_status") or (score_row.suggested_status if score_row else None)
                self._update_ai_task_log(
                    root_log,
                    status="running",
                    stage="saving",
                    batch_id=batch_id,
                    output_summary="命中可复用初筛结果，正在回填引用",
                    output_snapshot=_build_screening_task_progress_snapshot(
                        "saving",
                        message="命中可复用初筛结果，正在回填引用",
                        extra=build_root_task_snapshot_extra(),
                    ),
                )
                if parse_row:
                    candidate.latest_parse_result_id = parse_row.id
                if score_row:
                    candidate.latest_score_id = score_row.id
                    candidate.match_percent = score_row.match_percent
                    candidate.ai_recommended_status = score_row.suggested_status
                    self._auto_advance_candidate_after_screening(candidate, actor_id=actor_id)
                candidate.updated_by = actor_id
                self.db.add(candidate)
                self.db.commit()
                self.db.refresh(candidate)
                if parse_row and score_row:
                    self._save_screening_workflow_memory(
                        candidate=candidate,
                        actor_id=actor_id,
                        parse_row=parse_row,
                        score_row=score_row,
                        memory_source=memory_source,
                        related_skill_ids=related_skill_ids,
                        custom_requirements=prepared_custom_requirements,
                    )
                    candidate = self._get_candidate(candidate_id)
                finish_root_task(
                    candidate_ref=candidate,
                    status="success",
                    stage="completed",
                    output_summary="命中可复用初筛结果，已直接返回",
                    fallback_state="success",
                    fallback_valid=True,
                )
                return self.get_candidate_detail(candidate.id)

            if normalized_screening_mode == "default":
                flow_state["parse_strategy"] = "combined_parse_and_score"
                one_pass_attempt_limit = max(1, SCREENING_ONE_PASS_MAX_RETRIES + 1)
                for attempt in range(1, one_pass_attempt_limit + 1):
                    try:
                        _ensure_screening_budget_available(screening_deadline_at)
                        flow_state["parse_status"] = "running"
                        flow_state["score_status"] = "running"
                        self._update_ai_task_log(
                            root_log,
                            status="running",
                            stage="scoring",
                            batch_id=batch_id,
                            output_summary="正在执行 one-pass 初筛",
                            output_snapshot=_build_screening_task_progress_snapshot(
                                "scoring",
                                message="正在执行 one-pass 初筛",
                                extra={
                                    **build_root_task_snapshot_extra(),
                                    "one_pass_attempt": attempt,
                                },
                            ),
                        )
                        parse_row, score_row = self._screen_candidate_with_single_ai_call(
                            candidate,
                            actor_id,
                            skill_rows,
                            memory_source,
                            prepared_custom_requirements,
                            skill_snapshots=skill_snapshots,
                            screening_run_id=screening_run_id,
                            parent_task_id=root_log.id,
                            root_task_id=root_task_id,
                            request_hash=request_hash,
                            request_meta=request_meta,
                            raw_text_override=request_raw_text,
                            cancel_control=cancel_control,
                            deadline_at=screening_deadline_at,
                            batch_id=batch_id,
                        )
                        candidate = self._get_candidate(candidate_id)
                        flow_state["parse_status"] = "completed"
                        flow_state["persist_status"] = "completed"
                        flow_state["parse_result_id"] = parse_row.id
                        flow_state["score_result_id"] = score_row.id
                        score_log_for_root = self._get_latest_screening_score_run_task(
                            screening_run_id,
                            parent_task_id=root_log.id,
                        )
                        score_validation_meta = _decode_ai_task_json_text(
                            getattr(score_log_for_root, "validation_meta_json", None),
                            {},
                        ) if score_log_for_root else {}
                        if isinstance(score_validation_meta, dict):
                            flow_state["final_response_source"] = score_validation_meta.get("final_response_source") or flow_state.get("final_response_source")
                            if isinstance(score_validation_meta.get("primary_model_call_succeeded"), bool):
                                flow_state["primary_model_call_succeeded"] = score_validation_meta.get("primary_model_call_succeeded")
                            flow_state["raw_model_suggested_status"] = score_validation_meta.get("raw_model_suggested_status") or flow_state.get("raw_model_suggested_status")
                            flow_state["normalized_final_suggested_status"] = score_validation_meta.get("normalized_final_suggested_status") or flow_state.get("normalized_final_suggested_status")
                        screening_result_valid = score_validation_meta.get("screening_result_valid")
                        is_valid_result = screening_result_valid if isinstance(screening_result_valid, bool) else True
                        flow_state["score_status"] = "completed" if is_valid_result else "failed"
                        if (
                            not is_valid_result
                            and _can_salvage_invalid_one_pass_result(
                                validation_meta=score_validation_meta,
                                score_payload=_extract_screening_score_payload_from_row(score_row),
                                schema_config=_build_screening_schema_config(
                                    skill_snapshots,
                                    status_rules=self._get_rule_config("default_status_rules", DEFAULT_RULE_CONFIGS["default_status_rules"]),
                                ),
                                parse_row_available=bool(parse_row),
                                allow_score_only_rerun=allow_score_only_rerun,
                            )
                        ):
                            flow_state["one_pass_salvage_attempted"] = True
                            self._update_ai_task_log(
                                root_log,
                                status="running",
                                stage="scoring",
                                batch_id=batch_id,
                                output_summary="one-pass 结果可部分复用，正在基于已有解析结果补充评分",
                                output_snapshot=_build_screening_task_progress_snapshot(
                                    "scoring",
                                    message="one-pass 结果可部分复用，正在基于已有解析结果补充评分",
                                    extra={
                                        **build_root_task_snapshot_extra(),
                                        "one_pass_attempt": attempt,
                                        "one_pass_salvage": True,
                                    },
                                ),
                            )
                            try:
                                score_row = self._score_candidate(
                                    candidate,
                                    parse_row,
                                    actor_id,
                                    skill_rows,
                                    memory_source,
                                    prepared_custom_requirements,
                                    skill_snapshots=skill_snapshots,
                                    screening_run_id=screening_run_id,
                                    parent_task_id=root_log.id,
                                    root_task_id=root_task_id,
                                    skill_resolution_source=skill_resolution_source,
                                    skill_resolution_detail=skill_resolution_detail,
                                    cancel_control=cancel_control,
                                    reused_existing_parse=True,
                                    deadline_at=screening_deadline_at,
                                )
                                flow_state["score_result_id"] = score_row.id
                                score_log_for_root = self._get_latest_screening_score_run_task(
                                    screening_run_id,
                                    parent_task_id=root_log.id,
                                )
                                score_validation_meta = _decode_ai_task_json_text(
                                    getattr(score_log_for_root, "validation_meta_json", None),
                                    {},
                                ) if score_log_for_root else {}
                                if isinstance(score_validation_meta, dict):
                                    if isinstance(score_validation_meta.get("primary_model_call_succeeded"), bool):
                                        flow_state["primary_model_call_succeeded"] = True
                                    flow_state["raw_model_suggested_status"] = score_validation_meta.get("raw_model_suggested_status") or flow_state.get("raw_model_suggested_status")
                                    flow_state["normalized_final_suggested_status"] = score_validation_meta.get("normalized_final_suggested_status") or flow_state.get("normalized_final_suggested_status")
                                screening_result_valid = score_validation_meta.get("screening_result_valid")
                                is_valid_result = screening_result_valid if isinstance(screening_result_valid, bool) else True
                                flow_state["score_status"] = "completed" if is_valid_result else "failed"
                                if is_valid_result:
                                    flow_state["one_pass_salvage_succeeded"] = True
                                    flow_state["final_response_source"] = "primary_screening_model_salvaged"
                                candidate = self._get_candidate(candidate_id)
                            except RecruitmentTaskCancelled:
                                raise
                            except Exception as salvage_exc:
                                logger.warning(
                                    "screening one-pass salvage failed candidate_id=%s error=%s",
                                    candidate.id,
                                    salvage_exc,
                                )
                        self._save_screening_workflow_memory(
                            candidate=candidate,
                            actor_id=actor_id,
                            parse_row=parse_row,
                            score_row=score_row,
                            memory_source=memory_source,
                            related_skill_ids=related_skill_ids,
                            custom_requirements=prepared_custom_requirements,
                        )
                        candidate = self._get_candidate(candidate_id)
                        final_output_summary = str(
                            getattr(score_log_for_root, "output_summary", None)
                            or root_log.output_summary
                            or ""
                        ).strip() or _build_screening_output_summary(
                            parsed_resume=self._serialize_parse_result(parse_row) if parse_row else None,
                            score_payload=self._serialize_score(score_row) if score_row else None,
                        ) or "初筛流程已完成"
                        finish_root_task(
                            candidate_ref=candidate,
                            status="success" if is_valid_result else "invalid_result",
                            stage="completed" if is_valid_result else "failed",
                            output_summary=final_output_summary,
                            error_message=(getattr(score_log_for_root, "error_message", None) or root_log.error_message) if not is_valid_result else None,
                            fallback_state=str(score_validation_meta.get("screening_result_state") or ("success" if is_valid_result else "invalid")),
                            fallback_valid=is_valid_result,
                            fallback_reasons=_normalize_score_warning_items(
                                score_validation_meta.get("invalid_result_reasons")
                                or ([getattr(score_log_for_root, "error_message", None) or root_log.error_message] if not is_valid_result and (getattr(score_log_for_root, "error_message", None) or root_log.error_message) else []),
                                limit=12,
                            ),
                            fallback_summary=final_output_summary if not is_valid_result else None,
                        )
                        return self.get_candidate_detail(candidate.id)
                    except RecruitmentTaskCancelled:
                        raise
                    except Exception as exc:
                        failure_status, failure_message = _classify_screening_task_failure(exc)
                        should_retry = _is_retryable_infra_failure_code(failure_status) and attempt < one_pass_attempt_limit
                        if should_retry:
                            self._update_ai_task_log(
                                root_log,
                                status="running",
                                stage="scoring",
                                batch_id=batch_id,
                                output_summary=f"one-pass 请求失败，正在进行第 {attempt + 1} 次重试",
                                output_snapshot=_build_screening_task_progress_snapshot(
                                    "scoring",
                                    message=f"one-pass 请求失败，正在进行第 {attempt + 1} 次重试",
                                    extra={
                                        **build_root_task_snapshot_extra(),
                                        "one_pass_attempt": attempt,
                                        "one_pass_retry_scheduled": True,
                                        "failure_code": failure_status,
                                    },
                                ),
                            )
                            logger.warning(
                                "screening one-pass retry scheduled candidate_id=%s attempt=%s failure=%s",
                                candidate.id,
                                attempt,
                                failure_status,
                            )
                            time.sleep(min(3.0, float(attempt)))
                            continue
                        if SCREENING_FALLBACK_MAX_RETRIES > 0:
                            normalized_screening_mode = "fallback_parse_then_score"
                            flow_state["parse_strategy"] = "fallback_parse_then_score"
                            request_meta = self._build_screening_request_meta(
                                candidate=candidate,
                                resume_file_id=candidate.latest_resume_file_id or 0,
                                raw_resume_text=request_raw_text,
                                score_rule_snapshot=score_rule_snapshot,
                                custom_requirements=prepared_custom_requirements,
                                prompt_version=f"{RESUME_SCORE_PROMPT_VERSION}:fallback",
                                screening_mode=normalized_screening_mode,
                                request_scope="screening_fallback",
                            )
                            request_hash = str(request_meta.get("request_hash") or "").strip() or request_hash
                            self._update_ai_task_log(
                                root_log,
                                status="running",
                                stage="running",
                                batch_id=batch_id,
                                output_summary=f"one-pass 失败，进入降级链路：{failure_message}",
                                output_snapshot=_build_screening_task_progress_snapshot(
                                    "running",
                                    message="one-pass 失败，进入 parse_then_score 降级",
                                    extra={
                                        **build_root_task_snapshot_extra(),
                                        "one_pass_failure_code": failure_status,
                                        "one_pass_failure_message": failure_message,
                                    },
                                ),
                            )
                            break
                        raise

            reused_existing_parse_for_score = bool(parse_row)
            flow_state["reused_existing_parse"] = reused_existing_parse_for_score
            flow_state["parse_strategy"] = (
                "rerank_from_existing_parse"
                if normalized_screening_mode == "rerank_from_existing_parse"
                else "fallback_parse_then_score"
            )
            if parse_row is None:
                _ensure_screening_budget_available(screening_deadline_at)
                flow_state["parse_status"] = "running"
                self._update_ai_task_log(
                    root_log,
                    status="running",
                    stage="parsing",
                    batch_id=batch_id,
                    output_summary="正在解析最新简历",
                    output_snapshot=_build_screening_task_progress_snapshot(
                        "parsing",
                        message="正在解析最新简历",
                        extra=build_root_task_snapshot_extra(),
                    ),
                )
                parse_row = self._parse_latest_resume(
                    candidate,
                    actor_id,
                    screening_run_id=screening_run_id,
                    parent_task_id=root_log.id,
                    root_task_id=root_task_id,
                    cancel_control=cancel_control,
                    deadline_at=screening_deadline_at,
                )
                candidate = self._get_candidate(candidate_id)
                flow_state["parse_status"] = "completed"
            else:
                flow_state["parse_status"] = "reused"
                self._update_ai_task_log(
                    root_log,
                    status="running",
                    stage="parsing",
                    batch_id=batch_id,
                    output_summary="已复用解析结果，准备开始评分",
                    output_snapshot=_build_screening_task_progress_snapshot(
                        "parsing",
                        message="已复用解析结果，准备开始评分",
                        extra=build_root_task_snapshot_extra(),
                    ),
                    timing_breakdown={"parse_duration_ms": 0},
                )
            flow_state["parse_result_id"] = parse_row.id if parse_row else None

            _ensure_screening_budget_available(screening_deadline_at)
            flow_state["score_status"] = "running"
            self._update_ai_task_log(
                root_log,
                status="running",
                stage="scoring",
                batch_id=batch_id,
                output_summary="正在根据解析结果进行评分",
                output_snapshot=_build_screening_task_progress_snapshot(
                    "scoring",
                    message="正在根据解析结果进行评分",
                    extra=build_root_task_snapshot_extra(),
                ),
            )
            score_row = self._score_candidate(
                candidate,
                parse_row,
                actor_id,
                skill_rows,
                memory_source,
                prepared_custom_requirements,
                skill_snapshots=skill_snapshots,
                screening_run_id=screening_run_id,
                parent_task_id=root_log.id,
                root_task_id=root_task_id,
                skill_resolution_source=skill_resolution_source,
                skill_resolution_detail=skill_resolution_detail,
                cancel_control=cancel_control,
                reused_existing_parse=reused_existing_parse_for_score,
                deadline_at=screening_deadline_at,
            )
            flow_state["score_result_id"] = score_row.id
            score_log_for_root = self._get_latest_screening_run_task(
                screening_run_id,
                task_type="resume_score",
                parent_task_id=root_log.id,
            )
            score_validation_meta = _decode_ai_task_json_text(
                getattr(score_log_for_root, "validation_meta_json", None),
                {},
            ) if score_log_for_root else {}
            if isinstance(score_validation_meta, dict):
                flow_state["final_response_source"] = score_validation_meta.get("final_response_source") or flow_state.get("final_response_source")
                if isinstance(score_validation_meta.get("primary_model_call_succeeded"), bool):
                    flow_state["primary_model_call_succeeded"] = score_validation_meta.get("primary_model_call_succeeded")
                flow_state["raw_model_suggested_status"] = score_validation_meta.get("raw_model_suggested_status") or flow_state.get("raw_model_suggested_status")
                flow_state["normalized_final_suggested_status"] = score_validation_meta.get("normalized_final_suggested_status") or flow_state.get("normalized_final_suggested_status")
            screening_result_valid = score_validation_meta.get("screening_result_valid")
            is_valid_result = screening_result_valid if isinstance(screening_result_valid, bool) else True
            flow_state["score_status"] = "completed" if is_valid_result else "failed"
            flow_state["persist_status"] = "running"
            self._update_ai_task_log(
                root_log,
                status="running",
                stage="saving",
                batch_id=batch_id,
                output_summary="正在写入初筛结果",
                output_snapshot=_build_screening_task_progress_snapshot(
                    "saving",
                    message="正在写入初筛结果",
                    extra=build_root_task_snapshot_extra(),
                ),
            )
            self._save_screening_workflow_memory(
                candidate=candidate,
                actor_id=actor_id,
                parse_row=parse_row,
                score_row=score_row,
                memory_source=memory_source,
                related_skill_ids=related_skill_ids,
                custom_requirements=prepared_custom_requirements,
            )
            candidate = self._get_candidate(candidate_id)
            flow_state["persist_status"] = "completed"
            final_output_summary = str(
                getattr(score_log_for_root, "output_summary", None)
                or root_log.output_summary
                or ""
            ).strip() or _build_screening_output_summary(
                score_payload=self._serialize_score(score_row) if score_row else None,
            ) or "初筛流程已完成"
            finish_root_task(
                candidate_ref=candidate,
                status="success" if is_valid_result else "invalid_result",
                stage="completed" if is_valid_result else "failed",
                output_summary=final_output_summary,
                error_message=(getattr(score_log_for_root, "error_message", None) or root_log.error_message) if not is_valid_result else None,
                fallback_state=str(score_validation_meta.get("screening_result_state") or ("success" if is_valid_result else "invalid")),
                fallback_valid=is_valid_result,
                fallback_reasons=_normalize_score_warning_items(
                    score_validation_meta.get("invalid_result_reasons")
                    or ([getattr(score_log_for_root, "error_message", None) or root_log.error_message] if not is_valid_result and (getattr(score_log_for_root, "error_message", None) or root_log.error_message) else []),
                    limit=12,
                ),
                fallback_summary=final_output_summary if not is_valid_result else None,
            )
            return self.get_candidate_detail(candidate.id)
        except RecruitmentTaskCancelled:
            self.db.rollback()
            candidate = self._get_candidate(candidate_id)
            if flow_state.get("score_status") == "running":
                flow_state["score_status"] = "cancelled"
            elif flow_state.get("parse_status") in {"pending", "running"}:
                flow_state["parse_status"] = "cancelled"
            flow_state["persist_status"] = "cancelled"
            finish_root_task(
                candidate_ref=candidate,
                status="cancelled",
                stage="cancelled",
                output_summary="初筛流程已停止",
                error_message="任务已被用户停止。",
                fallback_state="cancelled",
                fallback_valid=False,
                fallback_reasons=["任务已被用户停止。"],
                fallback_summary="任务已被用户停止。",
            )
            raise
        except Exception as exc:
            self.db.rollback()
            candidate = self._get_candidate(candidate_id)
            failure_status, failure_message = _classify_screening_task_failure(exc)
            if flow_state.get("score_status") == "running":
                flow_state["score_status"] = "failed"
            elif flow_state.get("parse_status") in {"pending", "running"}:
                flow_state["parse_status"] = "failed"
            flow_state["persist_status"] = "failed"
            finish_root_task(
                candidate_ref=candidate,
                status=failure_status,
                stage="failed",
                output_summary=failure_message,
                error_message=failure_message,
                fallback_state=failure_status,
                fallback_valid=False,
                fallback_reasons=[failure_message],
                fallback_summary=_build_invalid_result_summary(
                    invalid_result_reasons=[failure_message],
                ) or failure_message,
            )
            raise

    def enqueue_screen_candidate(
        self,
        candidate_id: int,
        actor_id: str,
        skill_ids: Optional[Iterable[Any]] = None,
        use_position_skills: bool = True,
        use_candidate_memory: bool = True,
        custom_requirements: str = "",
        *,
        dispatch: bool = True,
        force_one_pass: bool = True,
        force_fallback: bool = False,
        allow_reuse_parse: bool = True,
        allow_score_only_rerun: bool = True,
        screening_mode: str = "default",
        batch_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        with _screening_enqueue_lock:
            candidate = self._get_candidate(candidate_id)
            if not candidate.latest_resume_file_id:
                raise ValueError("候选人暂无可用简历，无法发起初筛。")
            existing_live_task = self._find_live_screening_task(candidate.id)
            if existing_live_task:
                return {
                    "task_id": existing_live_task.id,
                    "status": existing_live_task.status,
                    "task_type": SCREENING_FLOW_TASK_TYPE,
                    "related_candidate_id": candidate.id,
                    "related_position_id": candidate.position_id,
                    "screening_run_id": existing_live_task.screening_run_id,
                    "reused_existing_task": True,
                    "reused_existing_result": False,
                    "batch_id": getattr(existing_live_task, "batch_id", None) or batch_id,
                }
            normalized_screening_mode = _normalize_screening_mode(screening_mode, force_fallback=force_fallback)
            if not force_one_pass and normalized_screening_mode == "default":
                normalized_screening_mode = "fallback_parse_then_score"
            skill_rows, memory_source, skill_resolution_source, skill_resolution_detail = self._resolve_screening_skills(candidate, skill_ids, use_position_skills=use_position_skills, use_candidate_memory=use_candidate_memory)
            skill_snapshots, related_skill_ids, prepared_custom_requirements = self._prepare_screening_task_context(
                skill_rows=skill_rows,
                custom_requirements=custom_requirements,
            )
            score_rule_snapshot = _build_score_rule_snapshot(skill_snapshots)
            parse_row = self._get_current_parse_result(candidate)
            had_existing_parse = allow_reuse_parse and self._can_reuse_existing_parse_result(candidate, parse_row)
            if not had_existing_parse:
                parse_row = None
            resume_file = self._get_resume_file(candidate.latest_resume_file_id)
            request_raw_text = (
                str(getattr(parse_row, "raw_text", "") or "").strip()
                if parse_row and getattr(parse_row, "raw_text", None)
                else self._extract_resume_file_raw_text(resume_file)
            )
            default_request_meta = self._build_screening_request_meta(
                candidate=candidate,
                resume_file_id=candidate.latest_resume_file_id or 0,
                raw_resume_text=request_raw_text,
                score_rule_snapshot=score_rule_snapshot,
                custom_requirements=prepared_custom_requirements,
                prompt_version=RESUME_SCREENING_PROMPT_VERSION,
                screening_mode="default",
                request_scope="screening_one_pass",
                model_task_type=SCREENING_ONE_PASS_TASK_TYPE,
            )
            if normalized_screening_mode == "default" and had_existing_parse:
                previous_valid_result = self._get_latest_valid_screening_result_for_candidate(candidate.id)
                if previous_valid_result and self._should_rerank_from_existing_parse(
                    allow_score_only_rerun=allow_score_only_rerun,
                    parse_row=parse_row,
                    current_request_meta=default_request_meta,
                    previous_request_meta=previous_valid_result.get("request_meta") or {},
                ):
                    normalized_screening_mode = "rerank_from_existing_parse"
            if normalized_screening_mode == "rerank_from_existing_parse" and not parse_row:
                normalized_screening_mode = "fallback_parse_then_score"
            request_scope = (
                "screening_score_only"
                if normalized_screening_mode == "rerank_from_existing_parse"
                else "screening_fallback"
                if normalized_screening_mode == "fallback_parse_then_score"
                else "screening_one_pass"
            )
            prompt_version = (
                RESUME_SCORE_PROMPT_VERSION
                if normalized_screening_mode == "rerank_from_existing_parse"
                else f"{RESUME_SCORE_PROMPT_VERSION}:fallback"
                if normalized_screening_mode == "fallback_parse_then_score"
                else RESUME_SCREENING_PROMPT_VERSION
            )
            request_meta = (
                default_request_meta
                if normalized_screening_mode == "default"
                else self._build_screening_request_meta(
                    candidate=candidate,
                    resume_file_id=candidate.latest_resume_file_id or 0,
                    raw_resume_text=request_raw_text,
                    score_rule_snapshot=score_rule_snapshot,
                    custom_requirements=prepared_custom_requirements,
                    prompt_version=prompt_version,
                    screening_mode=normalized_screening_mode,
                    request_scope=request_scope,
                    model_task_type=SCREENING_ONE_PASS_TASK_TYPE if normalized_screening_mode == "default" else "resume_score",
                )
            )
            request_hash = str(request_meta.get("request_hash") or "").strip() or None
            reusable_result = (
                self._load_reusable_screening_result(request_hash=request_hash, candidate_id=candidate.id)
                if request_hash
                else None
            )
            if reusable_result:
                reusable_root_log = reusable_result.get("root_log")
                reusable_parse_row = reusable_result.get("parse_row")
                reusable_score_row = reusable_result.get("score_row")
                reusable_validation_meta = reusable_result.get("validation_meta") if isinstance(reusable_result.get("validation_meta"), dict) else {}
                log_row = self._ensure_screening_root_task(
                    candidate=candidate,
                    actor_id=actor_id,
                    related_skill_ids=related_skill_ids,
                    skill_snapshots=skill_snapshots,
                    memory_source=memory_source,
                    skill_resolution_source=skill_resolution_source,
                    skill_resolution_detail=skill_resolution_detail,
                    score_rule_snapshot=score_rule_snapshot,
                    request_hash=request_hash,
                    batch_id=batch_id,
                    request_meta=request_meta,
                    screening_mode=normalized_screening_mode,
                    force_fallback=force_fallback,
                    allow_reuse_parse=allow_reuse_parse,
                    allow_score_only_rerun=allow_score_only_rerun,
                )
                self._finish_ai_task_log(
                    log_row,
                    status="success",
                    stage="completed",
                    output_summary="命中可复用初筛结果，未重复调用模型",
                    output_snapshot={
                        "task_type": SCREENING_FLOW_TASK_TYPE,
                        "screening_run_id": log_row.screening_run_id,
                        "batch_id": batch_id,
                        "screening_mode": normalized_screening_mode,
                        "request_meta": request_meta,
                        "reused_existing_parse": True,
                        "reused_existing_score": True,
                        "parsed_resume": self._serialize_parse_result(reusable_parse_row) if reusable_parse_row else None,
                        "score": self._serialize_score(reusable_score_row) if reusable_score_row else None,
                        "meta": {
                            "screening_result_valid": True,
                            "screening_result_state": "success",
                            "parse_strategy": reusable_validation_meta.get("parse_strategy") or "reused_existing_result",
                            "final_response_source": reusable_validation_meta.get("final_response_source") or "reused_existing_result",
                            "reused_existing_parse": True,
                            "reused_existing_score": True,
                            "primary_model_call_succeeded": reusable_validation_meta.get("primary_model_call_succeeded"),
                        },
                    },
                    memory_source=memory_source,
                    batch_id=batch_id,
                    related_skill_ids=related_skill_ids,
                    related_skill_snapshots=skill_snapshots,
                    screening_run_id=log_row.screening_run_id,
                    root_task_id=log_row.root_task_id or log_row.id,
                    skill_resolution_source=skill_resolution_source,
                    skill_resolution_detail=skill_resolution_detail,
                    score_rule_snapshot=score_rule_snapshot,
                    validation_meta={
                        **reusable_validation_meta,
                        "screening_result_valid": True,
                        "screening_result_state": reusable_validation_meta.get("screening_result_state") or "success",
                        "parse_strategy": reusable_validation_meta.get("parse_strategy") or "reused_existing_result",
                        "reused_existing_parse": True,
                        "reused_existing_score": True,
                        "request_meta": request_meta,
                    },
                    persisted_result_refs=self._build_screening_persisted_result_refs(
                        candidate=candidate,
                        parse_row=reusable_parse_row,
                        score_row=reusable_score_row,
                        screening_result_valid=True,
                        raw_model_suggested_status=reusable_validation_meta.get("raw_model_suggested_status"),
                        normalized_final_suggested_status=reusable_validation_meta.get("normalized_final_suggested_status"),
                    ),
                    timing_breakdown={"queue_wait_ms": 0, "total_duration_ms": 0},
                )
                return {
                    "task_id": log_row.id,
                    "status": "success",
                    "task_type": SCREENING_FLOW_TASK_TYPE,
                    "related_candidate_id": candidate.id,
                    "related_position_id": candidate.position_id,
                    "screening_run_id": log_row.screening_run_id or getattr(reusable_root_log, "screening_run_id", None),
                    "reused_existing_task": False,
                    "reused_existing_result": True,
                    "batch_id": batch_id,
                }
            log_row = self._ensure_screening_root_task(
                candidate=candidate,
                actor_id=actor_id,
                related_skill_ids=related_skill_ids,
                skill_snapshots=skill_snapshots,
                memory_source=memory_source,
                skill_resolution_source=skill_resolution_source,
                skill_resolution_detail=skill_resolution_detail,
                score_rule_snapshot=score_rule_snapshot,
                request_hash=request_hash,
                batch_id=batch_id,
                request_meta=request_meta,
                screening_mode=normalized_screening_mode,
                force_fallback=force_fallback,
                allow_reuse_parse=allow_reuse_parse,
                allow_score_only_rerun=allow_score_only_rerun,
            )
        if dispatch:
            self._dispatch_screening_queue()
        return {
            "task_id": log_row.id,
            "status": "queued",
            "task_type": SCREENING_FLOW_TASK_TYPE,
            "related_candidate_id": candidate.id,
            "related_position_id": candidate.position_id,
            "screening_run_id": log_row.screening_run_id,
            "reused_existing_task": False,
            "reused_existing_result": False,
            "batch_id": batch_id,
        }

    def batch_start_screen_candidates(
        self,
        candidate_ids: Iterable[Any],
        actor_id: str,
        skill_ids: Optional[Iterable[Any]] = None,
        use_position_skills: bool = True,
        use_candidate_memory: bool = True,
        custom_requirements: str = "",
        *,
        force_one_pass: bool = True,
        force_fallback: bool = False,
        allow_reuse_parse: bool = True,
        allow_score_only_rerun: bool = True,
        screening_mode: str = "default",
    ) -> Dict[str, Any]:
        tasks: List[Dict[str, Any]] = []
        candidate_id_list = _dedupe_ints(candidate_ids)
        batch_id = uuid.uuid4().hex[:16]
        skipped_existing_live_task_count = 0
        duplicated_count = 0
        failed_count = 0
        for candidate_id in candidate_id_list:
            try:
                task_payload = self.enqueue_screen_candidate(
                    candidate_id,
                    actor_id,
                    skill_ids=skill_ids,
                    use_position_skills=use_position_skills,
                    use_candidate_memory=use_candidate_memory,
                    custom_requirements=custom_requirements,
                    dispatch=False,
                    force_one_pass=force_one_pass,
                    force_fallback=force_fallback,
                    allow_reuse_parse=allow_reuse_parse,
                    allow_score_only_rerun=allow_score_only_rerun,
                    screening_mode=screening_mode,
                    batch_id=batch_id,
                )
                if task_payload.get("reused_existing_task"):
                    skipped_existing_live_task_count += 1
                elif task_payload.get("reused_existing_result"):
                    duplicated_count += 1
                tasks.append(task_payload)
            except Exception:
                failed_count += 1
        self._dispatch_screening_queue()
        queued_count = len([item for item in tasks if not item.get("reused_existing_task") and not item.get("reused_existing_result")])
        return {
            "batch_id": batch_id,
            "total_count": len(candidate_id_list),
            "queued_count": queued_count,
            "duplicated_count": duplicated_count,
            "skipped_existing_live_task_count": skipped_existing_live_task_count,
            "failed_count": failed_count,
            "task_ids": [int(item["task_id"]) for item in tasks if item.get("task_id")],
            "tasks": tasks,
        }

    def get_screening_batch_status(self, batch_id: str) -> Dict[str, Any]:
        rows = self.db.query(RecruitmentAITaskLog).filter(
            self._screening_root_task_filter(),
            RecruitmentAITaskLog.batch_id == batch_id,
        ).order_by(
            RecruitmentAITaskLog.created_at.asc(),
            RecruitmentAITaskLog.id.asc(),
        ).all()
        duration_values = [self._calculate_ai_task_duration_ms(row) or 0 for row in rows if row.status in TERMINAL_AI_TASK_STATUSES]
        per_candidate_status: List[Dict[str, Any]] = []
        queued = 0
        running = 0
        success = 0
        failed = 0
        invalid = 0
        cancelled = 0
        for row in rows:
            validation_meta = _decode_ai_task_json_text(getattr(row, "validation_meta_json", None), {})
            if row.status == "queued":
                queued += 1
            elif row.status in {"pending", "running", "cancelling"}:
                running += 1
            elif row.status == "success":
                success += 1
            elif row.status == "invalid_result":
                invalid += 1
            elif row.status == "cancelled":
                cancelled += 1
            else:
                failed += 1
            per_candidate_status.append(
                {
                    "task_id": row.id,
                    "candidate_id": row.related_candidate_id,
                    "position_id": row.related_position_id,
                    "status": row.status,
                    "stage": row.stage,
                    "screening_run_id": row.screening_run_id,
                    "duration_ms": self._calculate_ai_task_duration_ms(row),
                    "screening_result_valid": validation_meta.get("screening_result_valid") if isinstance(validation_meta, dict) else None,
                    "screening_result_state": validation_meta.get("screening_result_state") if isinstance(validation_meta, dict) else None,
                    "failure_code": validation_meta.get("failure_code") if isinstance(validation_meta, dict) else None,
                    "output_summary": row.output_summary,
                    "updated_at": isoformat_or_none(row.updated_at),
                }
            )
        avg_duration_ms = round(sum(duration_values) / len(duration_values), 2) if duration_values else 0
        return {
            "batch_id": batch_id,
            "total": len(rows),
            "queued": queued,
            "running": running,
            "success": success,
            "failed": failed,
            "invalid": invalid,
            "cancelled": cancelled,
            "avg_duration_ms": avg_duration_ms,
            "p95_duration_ms": _compute_percentile_ms(duration_values, 95),
            "cooldown_until": _screening_provider_cooldown_until.isoformat() if _screening_provider_cooldown_until else None,
            "per_candidate_status": per_candidate_status,
        }

    def cancel_screening_batch(self, batch_id: str, actor_id: str) -> Dict[str, Any]:
        rows = self.db.query(RecruitmentAITaskLog).filter(
            self._screening_root_task_filter(),
            RecruitmentAITaskLog.batch_id == batch_id,
        ).order_by(
            RecruitmentAITaskLog.created_at.asc(),
            RecruitmentAITaskLog.id.asc(),
        ).all()
        cancelled_count = 0
        already_terminal_count = 0
        results: List[Dict[str, Any]] = []
        for row in rows:
            if row.status in TERMINAL_AI_TASK_STATUSES:
                already_terminal_count += 1
                continue
            results.append(self.cancel_ai_task(row.id, actor_id))
            cancelled_count += 1
        return {
            "batch_id": batch_id,
            "total": len(rows),
            "cancelled_count": cancelled_count,
            "already_terminal_count": already_terminal_count,
            "results": results,
        }

    def start_screen_candidate(
        self,
        candidate_id: int,
        actor_id: str,
        skill_ids: Optional[Iterable[Any]] = None,
        use_position_skills: bool = True,
        use_candidate_memory: bool = True,
        custom_requirements: str = "",
        *,
        force_one_pass: bool = True,
        force_fallback: bool = False,
        allow_reuse_parse: bool = True,
        allow_score_only_rerun: bool = True,
        screening_mode: str = "default",
    ) -> Dict[str, Any]:
        return self.enqueue_screen_candidate(
            candidate_id,
            actor_id,
            skill_ids=skill_ids,
            use_position_skills=use_position_skills,
            use_candidate_memory=use_candidate_memory,
            custom_requirements=custom_requirements,
            dispatch=True,
            force_one_pass=force_one_pass,
            force_fallback=force_fallback,
            allow_reuse_parse=allow_reuse_parse,
            allow_score_only_rerun=allow_score_only_rerun,
            screening_mode=screening_mode,
        )

    def _resolve_interview_skills(self, candidate: RecruitmentCandidate, explicit_skill_ids: Optional[Iterable[Any]], *, use_candidate_memory: bool = True, use_position_skills: bool = True) -> Tuple[List[RecruitmentSkill], str]:
        manual_rows = self._filter_skill_rows_for_task(self._load_skill_rows(explicit_skill_ids or [], enabled_only=True), "interview")
        if manual_rows:
            return manual_rows, "manual"
        position_rows = self._get_position_task_skill_rows(candidate.position_id, "interview") if use_position_skills else []
        if position_rows:
            return position_rows, "position"
        base_rows = self._load_system_base_skill_rows("interview")
        if base_rows:
            return base_rows, "system_builtin_base"
        workflow = self._get_workflow_memory(candidate.id)
        if use_candidate_memory and workflow:
            interview_skill_ids = json_loads_safe(workflow.interview_skill_ids_json, [])
            memory_rows = self._filter_skill_rows_for_task(self._load_skill_rows(interview_skill_ids, enabled_only=True), "interview")
            if memory_rows:
                return memory_rows, workflow.screening_memory_source or "candidate_memory"
        return [], "none"

    def _build_interview_skill_prompt_block(self, skill_snapshots: Sequence[Dict[str, Any]], custom_requirements: str) -> str:
        blocks: List[str] = []
        for index, skill in enumerate(skill_snapshots, 1):
            blocks.append(
                "\n".join(
                    [
                        f"[INTERVIEW_SKILL {index}]",
                        f"id: {skill.get('id')}",
                        f"name: {skill.get('name')}",
                        f"description: {skill.get('description') or 'N/A'}",
                        "content:",
                        str(skill.get("content") or ""),
                    ]
                )
            )
        custom_text = str(custom_requirements or "").strip()
        if custom_text:
            blocks.append(
                "\n".join(
                    [
                        "[CUSTOM_REQUIREMENTS]",
                        "content:",
                        custom_text,
                    ]
                )
            )
        return "\n\n".join(blocks) if blocks else "No active skill prompt."

    def _get_interview_raw_resume_text(self, candidate: RecruitmentCandidate, parse_row: Optional[RecruitmentResumeParseResult]) -> str:
        raw_text = str(getattr(parse_row, "raw_text", "") or "").strip()
        if not raw_text and candidate.latest_resume_file_id:
            try:
                resume_file = self._get_resume_file(candidate.latest_resume_file_id)
                raw_text = self._extract_resume_file_raw_text(resume_file)
            except Exception:
                raw_text = ""
        return _truncate_utf8_text(raw_text, 30000) or ""

    def _build_interview_context_payload(self, *, candidate_payload: Dict[str, Any], parsed_resume_payload: Optional[Dict[str, Any]], latest_screening_result_payload: Optional[Dict[str, Any]], position_payload: Optional[Dict[str, Any]], workflow_payload: Optional[Dict[str, Any]], round_name: str, custom_requirements: str, skill_snapshots: Sequence[Dict[str, Any]], memory_source: str) -> Dict[str, Any]:
        return {
            "candidate": candidate_payload,
            "position": position_payload,
            "parsed_resume_helper": parsed_resume_payload,
            "latest_screening_result": latest_screening_result_payload,
            "workflow_memory": workflow_payload,
            "round_name": round_name or "初试",
            "custom_requirements": custom_requirements or None,
            "memory_source": memory_source,
            "active_skills": [
                {
                    "id": skill.get("id"),
                    "name": skill.get("name"),
                    "description": skill.get("description"),
                }
                for skill in skill_snapshots
            ],
        }

    def _build_interview_question_prompt(self, *, candidate_payload: Dict[str, Any], parsed_resume_payload: Optional[Dict[str, Any]], latest_screening_result_payload: Optional[Dict[str, Any]], position_payload: Optional[Dict[str, Any]], workflow_payload: Optional[Dict[str, Any]], raw_resume_text: str, round_name: str, custom_requirements: str, skill_snapshots: Sequence[Dict[str, Any]], memory_source: str) -> str:
        context_payload = self._build_interview_context_payload(
            candidate_payload=candidate_payload,
            parsed_resume_payload=parsed_resume_payload,
            latest_screening_result_payload=latest_screening_result_payload,
            position_payload=position_payload,
            workflow_payload=workflow_payload,
            round_name=round_name,
            custom_requirements=custom_requirements,
            skill_snapshots=skill_snapshots,
            memory_source=memory_source,
        )
        skill_names = "、".join([str(skill.get("name") or "") for skill in skill_snapshots]) if skill_snapshots else "无"
        return "\n\n".join([
            "TASK: 根据岗位 JD、简历原文和用户提供的 skill prompt，生成结构化面试题 JSON。",
            "OUTPUT_REQUIREMENTS:",
            "1. 只返回 strict JSON，不要返回 markdown、html、代码块或解释文字。",
            "2. 返回的顶层结构必须满足 system prompt 中约定的 overview + domains schema。",
            "3. 优先遵循 ACTIVE_SKILL_PROMPTS 中定义的模块标题、顺序、必考点和强调方向；如果 skill 没有定义模块，再根据 JD 与简历原文自行组织 domains。",
            "4. 所有问题必须先锚定 JD 或简历原文证据；没有直接证据时，用 risk_to_verify 明确标记，而不是假设候选人做过。",
            "5. 不要把规则标题、编辑说明、输出规范、HTML 规范、触发方式等元指令写进可见题目内容。",
            f"ROUND_NAME: {round_name or '初试'}",
            f"MEMORY_SOURCE: {memory_source or 'unknown'}",
            f"ACTIVE_SKILL_NAMES: {skill_names}",
            "POSITION_JD_JSON:",
            json_dumps_safe(position_payload or {}),
            "RAW_RESUME_TEXT:",
            raw_resume_text or "无",
            "ACTIVE_SKILL_PROMPTS:",
            self._build_interview_skill_prompt_block(skill_snapshots, custom_requirements),
            "HELPER_CONTEXT_JSON:",
            json_dumps_safe(context_payload),
        ])

    def _build_interview_preview_prompt(self, *, candidate_payload: Dict[str, Any], parsed_resume_payload: Optional[Dict[str, Any]], latest_screening_result_payload: Optional[Dict[str, Any]], position_payload: Optional[Dict[str, Any]], workflow_payload: Optional[Dict[str, Any]], raw_resume_text: str, round_name: str, custom_requirements: str, skill_snapshots: Sequence[Dict[str, Any]], memory_source: str) -> str:
        context_payload = self._build_interview_context_payload(
            candidate_payload=candidate_payload,
            parsed_resume_payload=parsed_resume_payload,
            latest_screening_result_payload=latest_screening_result_payload,
            position_payload=position_payload,
            workflow_payload=workflow_payload,
            round_name=round_name,
            custom_requirements=custom_requirements,
            skill_snapshots=skill_snapshots,
            memory_source=memory_source,
        )
        skill_names = "、".join([str(skill.get("name") or "") for skill in skill_snapshots]) if skill_snapshots else "无"
        return "\n\n".join([
            "TASK: 根据岗位 JD、简历原文和用户提供的 skill prompt，生成可逐步流式显示的 markdown 面试题预览。",
            "PREVIEW_REQUIREMENTS:",
            "1. 只输出 markdown，不要输出 HTML，不要解释系统规则。",
            "2. 优先遵循 ACTIVE_SKILL_PROMPTS 中定义的模块标题、顺序、必考点和强调方向；如果 skill 没有定义模块，再根据 JD 与简历原文自行组织模块。",
            "3. 每个模块都必须包含：证据类型、证据锚点、面试题正题、参考答案要点、通过/注意/一票否决、追问环节、答不出时面试官解释。",
            "4. 如果简历缺少直接证据，必须明确写成风险核实型问题，不能默认候选人做过。",
            "5. 不要输出规则名、输出规范名、HTML 规范、触发方式等元指令。",
            f"ROUND_NAME: {round_name or '初试'}",
            f"MEMORY_SOURCE: {memory_source or 'unknown'}",
            f"ACTIVE_SKILL_NAMES: {skill_names}",
            "POSITION_JD_JSON:",
            json_dumps_safe(position_payload or {}),
            "RAW_RESUME_TEXT:",
            raw_resume_text or "无",
            "ACTIVE_SKILL_PROMPTS:",
            self._build_interview_skill_prompt_block(skill_snapshots, custom_requirements),
            "HELPER_CONTEXT_JSON:",
            json_dumps_safe(context_payload),
        ])

    def stream_interview_question_preview(self, candidate_id: int, round_name: str, custom_requirements: str, skill_ids: Optional[Iterable[Any]], actor_id: str, on_delta: Callable[[str], None], use_candidate_memory: bool = True, use_position_skills: bool = True, *, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == candidate.position_id, RecruitmentPosition.deleted.is_(False)).first() if candidate.position_id else None
        workflow = self._get_workflow_memory(candidate.id)
        skill_rows, memory_source = self._resolve_interview_skills(candidate, skill_ids, use_candidate_memory=use_candidate_memory, use_position_skills=use_position_skills)
        skill_snapshots = self._tailor_skill_snapshots_for_task(self._build_skill_snapshots(skill_rows), "interview")
        parse_row = self._get_current_parse_result(candidate)
        score_row = self.db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.id == candidate.latest_score_id).first() if candidate.latest_score_id else None
        candidate_payload = self._serialize_candidate_for_interview_prompt(candidate)
        parsed_resume_payload = self._serialize_parse_result_for_interview_prompt(parse_row) if parse_row else None
        raw_resume_text = self._get_interview_raw_resume_text(candidate, parse_row)
        latest_screening_result_payload = self._serialize_score_for_interview_prompt(score_row) if score_row else None
        position_payload = None if not position else self._serialize_position_for_interview_prompt(position)
        workflow_payload = self._serialize_workflow_for_interview_prompt(workflow) if workflow else None
        prompt = self._build_interview_preview_prompt(
            candidate_payload=candidate_payload,
            parsed_resume_payload=parsed_resume_payload,
            latest_screening_result_payload=latest_screening_result_payload,
            position_payload=position_payload,
            workflow_payload=workflow_payload,
            raw_resume_text=raw_resume_text,
            round_name=round_name,
            custom_requirements=custom_requirements,
            skill_snapshots=skill_snapshots,
            memory_source=memory_source,
        )
        started_at = time.perf_counter()
        first_delta_at: Optional[float] = None
        preview_chunks: List[str] = []

        def _handle_delta(chunk: str) -> None:
            nonlocal first_delta_at
            if cancel_control:
                cancel_control.raise_if_cancelled()
            if first_delta_at is None:
                first_delta_at = time.perf_counter()
            preview_chunks.append(chunk)
            on_delta(chunk)

        task = self.ai_gateway.stream_text(
            task_type="interview_question_generation",
            system_prompt=INTERVIEW_QUESTION_STREAM_PREVIEW_SYSTEM_PROMPT,
            user_prompt=prompt,
            on_delta=_handle_delta,
            cancel_control=cancel_control,
        )
        completed_at = time.perf_counter()
        return {
            "preview_markdown": "".join(preview_chunks).strip(),
            "provider": task.get("provider"),
            "model_name": task.get("model_name"),
            "source": task.get("source"),
            "prompt_snapshot": task.get("prompt_snapshot"),
            "full_request_snapshot": task.get("full_request_snapshot"),
            "input_summary": task.get("input_summary"),
            "output_summary": task.get("output_summary"),
            "token_usage": task.get("token_usage"),
            "memory_source": memory_source,
            "related_skill_snapshots": skill_snapshots,
            "timing": {
                "service_started_at_ms": int(started_at * 1000),
                "model_call_started_at_ms": int(started_at * 1000),
                "first_model_delta_at_ms": int(first_delta_at * 1000) if first_delta_at is not None else None,
                "completed_at_ms": int(completed_at * 1000),
                "time_to_first_delta_ms": int((first_delta_at - started_at) * 1000) if first_delta_at is not None else None,
                "total_generation_ms": int((completed_at - started_at) * 1000),
            },
        }

    def generate_interview_questions(self, candidate_id: int, round_name: str, custom_requirements: str, skill_ids: Optional[Iterable[Any]], actor_id: str, use_candidate_memory: bool = True, use_position_skills: bool = True, *, existing_task_id: Optional[int] = None, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == candidate.position_id, RecruitmentPosition.deleted.is_(False)).first() if candidate.position_id else None
        workflow = self._get_workflow_memory(candidate.id)
        skill_rows, memory_source = self._resolve_interview_skills(candidate, skill_ids, use_candidate_memory=use_candidate_memory, use_position_skills=use_position_skills)
        skill_snapshots = self._tailor_skill_snapshots_for_task(self._build_skill_snapshots(skill_rows), "interview")
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        parse_row = self._get_current_parse_result(candidate)
        score_row = self.db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.id == candidate.latest_score_id).first() if candidate.latest_score_id else None
        candidate_payload = self._serialize_candidate_for_interview_prompt(candidate)
        parsed_resume_payload = self._serialize_parse_result_for_interview_prompt(parse_row) if parse_row else None
        raw_resume_text = self._get_interview_raw_resume_text(candidate, parse_row)
        latest_screening_result_payload = self._serialize_score_for_interview_prompt(score_row) if score_row else None
        position_payload = None if not position else self._serialize_position_for_interview_prompt(position)
        workflow_payload = self._serialize_workflow_for_interview_prompt(workflow) if workflow else None
        prompt = self._build_interview_question_prompt(
            candidate_payload=candidate_payload,
            parsed_resume_payload=parsed_resume_payload,
            latest_screening_result_payload=latest_screening_result_payload,
            position_payload=position_payload,
            workflow_payload=workflow_payload,
            raw_resume_text=raw_resume_text,
            round_name=round_name,
            custom_requirements=custom_requirements,
            skill_snapshots=skill_snapshots,
            memory_source=memory_source,
        )
        request_hash = self._build_request_hash("interview_question_generation", candidate.id, round_name, custom_requirements, related_skill_ids, memory_source)
        log_row = self._get_ai_task_log_row(existing_task_id) if existing_task_id else self._create_ai_task_log("interview_question_generation", created_by=actor_id, related_position_id=candidate.position_id, related_candidate_id=candidate.id, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, memory_source=memory_source, request_hash=request_hash)
        task: Optional[Dict[str, Any]] = None
        content: Dict[str, Any] = {}
        structured: Optional[Dict[str, Any]] = None
        markdown: Optional[str] = None
        html: Optional[str] = None
        validation_errors: List[str] = []
        postprocess_reason: Optional[str] = None
        resolved_runtime = self.ai_gateway.resolve_config("interview_question_generation")
        try:
            self._raise_if_cancelled(cancel_control)
            self._update_ai_task_log(
                log_row,
                provider=resolved_runtime.provider,
                model_name=resolved_runtime.model_name,
                status="running",
                prompt_snapshot=prompt,
                input_summary=truncate_text(prompt, 600),
                output_summary="正在生成面试题",
            )
            task = self.ai_gateway.generate_json(
                task_type="interview_question_generation",
                system_prompt=INTERVIEW_QUESTION_SYSTEM_PROMPT,
                user_prompt=prompt,
                cancel_control=cancel_control,
            )
            self._raise_if_cancelled(cancel_control)
            content = task.get("content") or {}
            if not isinstance(content, dict):
                raise RecruitmentInterviewResultValidationError("面试题结果不是有效的 JSON object。")
            validation_errors = validate_structured_interview_payload(content)
            if validation_errors:
                raise RecruitmentInterviewResultValidationError(
                    "面试题结构校验失败：" + "；".join(validation_errors[:6])
                )
            structured = normalize_structured_interview(
                content,
                candidate_name=candidate.name,
                position_title=position.title if position else "当前岗位",
                round_name=round_name,
                skills=skill_snapshots,
                custom_requirements=custom_requirements,
                parsed_resume=parsed_resume_payload,
                screening_result=latest_screening_result_payload,
            )
            markdown = render_interview_markdown(structured)
            html = render_interview_html(structured)
            postprocess_reason = detect_interview_rule_leakage(markdown, html)
            if postprocess_reason:
                raise RecruitmentInterviewResultValidationError(
                    f"面试题结果包含规则泄漏内容：{postprocess_reason}"
                )
        except RecruitmentTaskCancelled:
            self.db.rollback()
            self._mark_ai_task_cancelled(log_row.id, actor_id=actor_id, reason="任务已被用户停止，面试题未继续生成。")
            raise
        except Exception as exc:
            self.db.rollback()
            self._finish_ai_task_log(
                log_row,
                status=_classify_interview_generation_failure_status(exc),
                provider=(task or {}).get("provider") or resolved_runtime.provider,
                model_name=(task or {}).get("model_name") or resolved_runtime.model_name,
                prompt_snapshot=(task or {}).get("prompt_snapshot") or prompt,
                full_request_snapshot=(task or {}).get("full_request_snapshot"),
                input_summary=(task or {}).get("input_summary") or truncate_text(prompt, 600),
                output_summary=truncate_text(str(exc), 600),
                output_snapshot={
                    "raw": content,
                    "normalized": structured,
                    "rendered": {"markdown": markdown, "html": html} if markdown or html else None,
                    "postprocess_reason": postprocess_reason,
                },
                error_message=str(exc),
                token_usage=(task or {}).get("token_usage"),
                memory_source=memory_source,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
                raw_response_text=(task or {}).get("raw_response_text"),
                parsed_response_json=content if content else None,
                sanitized_response_json=structured,
                validation_meta={
                    "schema_errors": validation_errors,
                    "postprocess_reason": postprocess_reason,
                },
            )
            raise
        row = RecruitmentInterviewQuestion(org_code=normalize_org_code(getattr(candidate, "org_code", None)), candidate_id=candidate.id, position_id=candidate.position_id, skill_ids_json=json_dumps_safe([skill.id for skill in skill_rows]), round_name=round_name or "初试", custom_requirements=custom_requirements or None, html_content=html, markdown_content=markdown, status="generated", created_by=actor_id)
        self.db.add(row)
        self.db.flush()
        workflow_row = self._get_or_create_workflow_memory(candidate, actor_id)
        workflow_row.interview_skill_ids_json = json_dumps_safe([skill.id for skill in skill_rows])
        workflow_row.last_interview_question_id = row.id
        workflow_row.updated_by = actor_id
        self.db.add(workflow_row)
        self.db.commit()
        self.db.refresh(row)
        self._finish_ai_task_log(
            log_row,
            status="success",
            provider=task.get("provider"),
            model_name=task.get("model_name"),
            prompt_snapshot=task.get("prompt_snapshot"),
            full_request_snapshot=task.get("full_request_snapshot"),
            input_summary=task.get("input_summary"),
            output_summary=truncate_text(markdown, 600),
            output_snapshot={
                "raw": content,
                "normalized": structured,
                "rendered": {"markdown": markdown, "html": html},
                "postprocess_reason": postprocess_reason,
            },
            error_message=task.get("error_message"),
            token_usage=task.get("token_usage"),
            memory_source=memory_source,
            related_skill_ids=related_skill_ids,
            related_skill_snapshots=skill_snapshots,
            raw_response_text=task.get("raw_response_text"),
            parsed_response_json=content,
            sanitized_response_json=structured,
            validation_meta={
                "schema_errors": validation_errors,
                "postprocess_reason": postprocess_reason,
            },
        )
        return self._serialize_interview_question(row)

    def start_generate_interview_questions(self, candidate_id: int, round_name: str, custom_requirements: str, skill_ids: Optional[Iterable[Any]], actor_id: str, use_candidate_memory: bool = True, use_position_skills: bool = True) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        skill_rows, memory_source = self._resolve_interview_skills(candidate, skill_ids, use_candidate_memory=use_candidate_memory, use_position_skills=use_position_skills)
        skill_snapshots = self._tailor_skill_snapshots_for_task(self._build_skill_snapshots(skill_rows), "interview")
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        request_hash = self._build_request_hash("interview_question_generation", candidate.id, round_name, custom_requirements, related_skill_ids, memory_source)
        log_row = self._create_ai_task_log("interview_question_generation", created_by=actor_id, related_position_id=candidate.position_id, related_candidate_id=candidate.id, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, memory_source=memory_source, request_hash=request_hash)

        def _runner(control: RecruitmentTaskControl) -> None:
            db = SessionLocal()
            service = RecruitmentService(db)
            try:
                service.generate_interview_questions(candidate_id, round_name, custom_requirements, skill_ids, actor_id, use_candidate_memory=use_candidate_memory, use_position_skills=use_position_skills, existing_task_id=log_row.id, cancel_control=control)
            except RecruitmentTaskCancelled:
                pass
            except Exception as exc:
                db.rollback()
                try:
                    if control.is_cancelled():
                        service._mark_ai_task_cancelled(log_row.id, actor_id=actor_id, reason="任务已被用户停止，面试题未继续生成。")
                    else:
                        service._mark_ai_task_failed(log_row.id, str(exc))
                except Exception:
                    db.rollback()
                logger.exception("Background interview generation task %s failed", log_row.id)
            finally:
                db.close()

        self._start_background_ai_task(log_row.id, _runner)
        return {
            "task_id": log_row.id,
            "status": "pending",
            "task_type": "interview_question_generation",
            "related_candidate_id": candidate.id,
            "related_position_id": candidate.position_id,
        }

    def get_interview_question_download(self, question_id: int) -> Dict[str, Any]:
        row = self.db.query(RecruitmentInterviewQuestion).filter(RecruitmentInterviewQuestion.id == question_id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        candidate = self._get_candidate(row.candidate_id)
        file_name = f"interview-question-{safe_file_stem(candidate.name)}-{safe_file_stem(row.round_name)}.html".replace(" ", "-")
        return {"file_name": file_name, "html_content": ensure_interview_html_document(file_name, html_content=row.html_content or "", markdown_content=row.markdown_content or "")}

    def get_resume_file_download(self, resume_file_id: int) -> Dict[str, Any]:
        resume_file = self._get_resume_file(resume_file_id)
        path = Path(resume_file.storage_path)
        if not path.exists():
            raise ValueError("鎿嶄綔澶辫触")
        media_type = (resume_file.mime_type or "").strip()
        if not media_type or media_type in {"application/octet-stream", "binary/octet-stream"}:
            media_type = mimetypes.guess_type(resume_file.original_name or "")[0] or "application/octet-stream"
        return {"file_name": resume_file.original_name, "content": path.read_bytes(), "media_type": media_type}

    def _run_generate_jd_task(self, task_id: int, position_id: int, extra_prompt: str, actor_id: str, auto_activate: bool, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        log_row = self._get_ai_task_log_row(task_id)
        try:
            position = self._get_position(position_id)
            skill_rows, memory_source = self._resolve_jd_skills(position, [], use_position_skills=True, use_global_skills=False)
            skill_snapshots = self._build_skill_snapshots(skill_rows)
            related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
            prompt = json_dumps_safe({
                "position": self._serialize_position_for_jd_prompt(position),
                "skills": [
                    {
                        "id": skill.get("id"),
                        "name": skill.get("name"),
                        "description": skill.get("description"),
                        "content": str(skill.get("content") or ""),
                    }
                    for skill in skill_snapshots
                ],
                "extra_prompt": extra_prompt or None,
            })
            self._raise_if_cancelled(cancel_control)
            resolved_runtime = self.ai_gateway.resolve_config("jd_generation")
            self._update_ai_task_log(
                log_row,
                provider=resolved_runtime.provider,
                model_name=resolved_runtime.model_name,
                status="running",
                prompt_snapshot=prompt,
                input_summary=truncate_text(prompt, 600),
                output_summary="正在生成 JD",
            )
            task = self.ai_gateway.generate_json(
                task_type="jd_generation",
                system_prompt=JD_GENERATION_SYSTEM_PROMPT,
                user_prompt=prompt,
                fallback_builder=lambda: build_jd_structured_fallback(position),
                cancel_control=cancel_control,
            )
            self._raise_if_cancelled(cancel_control)
            content = task.get("content") or {}
            structured = normalize_structured_jd(content if isinstance(content, dict) else {}, position)
            markdown = render_jd_markdown_source(structured)
            html = markdown_to_html(markdown)
            publish_text = render_publish_ready_jd(structured)
            version_no = (self.db.query(func.max(RecruitmentJDVersion.version_no)).filter(RecruitmentJDVersion.position_id == position.id).scalar() or 0) + 1
            row = RecruitmentJDVersion(org_code=normalize_org_code(getattr(position, "org_code", None)), position_id=position.id, version_no=version_no, title=f"{position.title} V{version_no}", prompt_snapshot=task.get("prompt_snapshot"), jd_markdown=markdown, jd_html=html, publish_text=publish_text, notes=extra_prompt or None, is_active=bool(auto_activate), created_by=actor_id)
            self.db.add(row)
            self.db.flush()
            if auto_activate:
                self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == position.id, RecruitmentJDVersion.id != row.id).update({RecruitmentJDVersion.is_active: False}, synchronize_session=False)
                position.current_jd_version_id = row.id
                position.updated_by = actor_id
                self.db.add(position)
            self.db.commit()
            self.db.refresh(row)
            self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), full_request_snapshot=task.get("full_request_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot={"raw": content, "normalized": structured}, error_message=task.get("error_message"), token_usage=task.get("token_usage"), memory_source=memory_source, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots)
            return self._serialize_jd_version(row)
        except RecruitmentTaskCancelled:
            self.db.rollback()
            self._mark_ai_task_cancelled(task_id, actor_id=actor_id, reason="任务已被用户停止，JD 未继续生成。")
            raise
        except Exception as exc:
            self.db.rollback()
            self._mark_ai_task_failed(task_id, str(exc))
            raise

    def start_generate_jd(self, position_id: int, extra_prompt: str, actor_id: str, auto_activate: bool = True) -> Dict[str, Any]:
        position = self._get_position(position_id)
        skill_rows, memory_source = self._resolve_jd_skills(position, [], use_position_skills=True, use_global_skills=False)
        skill_snapshots = self._build_skill_snapshots(skill_rows)
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        request_hash = self._build_request_hash("jd_generation", position.id, extra_prompt, related_skill_ids)
        log_row = self._create_ai_task_log("jd_generation", created_by=actor_id, related_position_id=position.id, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, memory_source=memory_source, request_hash=request_hash)

        def _runner(control: RecruitmentTaskControl) -> None:
            db = SessionLocal()
            service = RecruitmentService(db)
            try:
                service._run_generate_jd_task(log_row.id, position_id, extra_prompt, actor_id, auto_activate, cancel_control=control)
            except RecruitmentTaskCancelled:
                pass
            except Exception as exc:
                db.rollback()
                try:
                    if control.is_cancelled():
                        service._mark_ai_task_cancelled(log_row.id, actor_id=actor_id, reason="任务已被用户停止，JD 未继续生成。")
                    else:
                        service._mark_ai_task_failed(log_row.id, str(exc))
                except Exception:
                    db.rollback()
                logger.exception("Background JD generation task %s failed", log_row.id)
            finally:
                db.close()

        self._start_background_ai_task(log_row.id, _runner)
        return {
            "task_id": log_row.id,
            "status": "pending",
            "task_type": "jd_generation",
            "related_position_id": position.id,
        }

    def generate_jd(self, position_id: int, extra_prompt: str, actor_id: str, auto_activate: bool = True) -> Dict[str, Any]:
        position = self._get_position(position_id)
        skill_rows, memory_source = self._resolve_jd_skills(position, [], use_position_skills=True, use_global_skills=False)
        skill_snapshots = self._build_skill_snapshots(skill_rows)
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        request_hash = self._build_request_hash("jd_generation", position.id, extra_prompt, related_skill_ids)
        log_row = self._create_ai_task_log("jd_generation", created_by=actor_id, related_position_id=position.id, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, memory_source=memory_source, request_hash=request_hash)
        prompt = json_dumps_safe({
            "position": self._serialize_position_for_jd_prompt(position),
            "skills": [
                {
                    "id": skill.get("id"),
                    "name": skill.get("name"),
                    "description": skill.get("description"),
                    "content": str(skill.get("content") or ""),
                }
                for skill in skill_snapshots
            ],
            "extra_prompt": extra_prompt or None,
        })
        task = self.ai_gateway.generate_json(
            task_type="jd_generation",
            system_prompt=JD_GENERATION_SYSTEM_PROMPT,
            user_prompt=prompt,
            fallback_builder=lambda: build_jd_structured_fallback(position),
        )
        content = task.get("content") or {}
        structured = normalize_structured_jd(content if isinstance(content, dict) else {}, position)
        markdown = render_jd_markdown_source(structured)
        html = markdown_to_html(markdown)
        publish_text = render_publish_ready_jd(structured)
        version_no = (self.db.query(func.max(RecruitmentJDVersion.version_no)).filter(RecruitmentJDVersion.position_id == position.id).scalar() or 0) + 1
        row = RecruitmentJDVersion(org_code=normalize_org_code(getattr(position, "org_code", None)), position_id=position.id, version_no=version_no, title=f"{position.title} V{version_no}", prompt_snapshot=task.get("prompt_snapshot"), jd_markdown=markdown, jd_html=html, publish_text=publish_text, notes=extra_prompt or None, is_active=bool(auto_activate), created_by=actor_id)
        self.db.add(row)
        self.db.flush()
        if auto_activate:
            self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == position.id, RecruitmentJDVersion.id != row.id).update({RecruitmentJDVersion.is_active: False}, synchronize_session=False)
            position.current_jd_version_id = row.id
            position.updated_by = actor_id
            self.db.add(position)
        self.db.commit()
        self.db.refresh(row)
        self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), full_request_snapshot=task.get("full_request_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot={"raw": content, "normalized": structured}, error_message=task.get("error_message"), token_usage=task.get("token_usage"), memory_source=memory_source, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots)
        return self._serialize_jd_version(row)

    def save_jd_version(self, position_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        position = self._get_position(position_id)
        version_no = (self.db.query(func.max(RecruitmentJDVersion.version_no)).filter(RecruitmentJDVersion.position_id == position.id).scalar() or 0) + 1
        row = RecruitmentJDVersion(org_code=normalize_org_code(getattr(position, "org_code", None)), position_id=position.id, version_no=version_no, title=str(payload.get("title") or position.title).strip(), prompt_snapshot=None, jd_markdown=str(payload.get("jd_markdown") or ""), jd_html=payload.get("jd_html") or markdown_to_html(str(payload.get("jd_markdown") or "")), publish_text=payload.get("publish_text") or strip_markdown(str(payload.get("jd_markdown") or "")), notes=payload.get("notes"), is_active=bool(payload.get("auto_activate")), created_by=actor_id)
        self.db.add(row)
        self.db.flush()
        if payload.get("auto_activate"):
            self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == position.id, RecruitmentJDVersion.id != row.id).update({RecruitmentJDVersion.is_active: False}, synchronize_session=False)
            position.current_jd_version_id = row.id
            position.updated_by = actor_id
            self.db.add(position)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_jd_version(row)

    def activate_jd_version(self, position_id: int, version_id: int, actor_id: str) -> Dict[str, Any]:
        position = self._get_position(position_id)
        row = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.id == version_id, RecruitmentJDVersion.position_id == position.id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == position.id).update({RecruitmentJDVersion.is_active: False}, synchronize_session=False)
        row.is_active = True
        position.current_jd_version_id = row.id
        position.updated_by = actor_id
        self.db.add(row)
        self.db.add(position)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_jd_version(row)

    def _serialize_llm_config(self, row: RecruitmentLLMConfig) -> Dict[str, Any]:
        runtime = self.ai_gateway.resolve_runtime_config_for_row(row)
        return {"id": row.id, "config_key": row.config_key, "org_code": normalize_org_code(getattr(row, "org_code", None)), "scope_level": getattr(row, "scope_level", None) or "ORG", "share_policy": normalize_share_policy(getattr(row, "share_policy", None)), "allow_sub_org_use": bool(getattr(row, "allow_sub_org_use", False)), "allow_copy": bool(getattr(row, "allow_copy", False)), "task_type": row.task_type, "provider": row.provider, "model_name": row.model_name, "base_url": row.base_url, "api_key_env": row.api_key_env, "api_key_masked": runtime.api_key_masked, "has_stored_api_key": bool(row.api_key_ciphertext), "has_runtime_api_key": bool(runtime.api_key), "extra_config": json_loads_safe(row.extra_config_json, None), "is_active": bool(row.is_active), "priority": row.priority, "resolved_provider": runtime.provider, "resolved_model_name": runtime.model_name, "resolved_base_url": runtime.base_url, "resolved_source": runtime.source, "created_by": getattr(row, "created_by", None), "updated_by": getattr(row, "updated_by", None), "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_llm_configs(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentLLMConfig).order_by(RecruitmentLLMConfig.task_type.asc(), RecruitmentLLMConfig.priority.asc(), RecruitmentLLMConfig.id.asc()).all()
        return [self._serialize_llm_config(row) for row in rows if self._can_access_org_resource(row)]

    def create_llm_config(self, payload: Dict[str, Any], actor_id: str = "unknown") -> Dict[str, Any]:
        org_code = normalize_org_code(payload.get("org_code") or self._current_org_code())
        self._assert_can_create_in_org(org_code)
        row = RecruitmentLLMConfig(config_key=str(payload.get("config_key") or "").strip(), org_code=org_code, scope_level=str(payload.get("scope_level") or "ORG").strip().upper() or "ORG", share_policy=normalize_share_policy(payload.get("share_policy")), allow_sub_org_use=bool(payload.get("allow_sub_org_use")), allow_copy=bool(payload.get("allow_copy")), task_type=payload.get("task_type") or "default", provider=str(payload.get("provider") or "openai-compatible").strip(), model_name=str(payload.get("model_name") or "").strip(), base_url=payload.get("base_url"), api_key_env=payload.get("api_key_env"), api_key_ciphertext=self._safe_encrypt_secret(str(payload.get("api_key_value") or "")) if payload.get("api_key_value") else None, extra_config_json=json_dumps_safe(payload.get("extra_config") or {}), is_active=payload.get("is_active") is not False, priority=int(payload.get("priority") or 99), created_by=actor_id, updated_by=actor_id)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_llm_config(row)

    def update_llm_config(self, config_id: int, payload: Dict[str, Any], actor_id: str = "unknown") -> Dict[str, Any]:
        row = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.id == config_id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        if not self._can_access_org_resource(row):
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_resource_manageable(row, actor_id)
        for field in ["config_key", "task_type", "provider", "model_name", "base_url", "api_key_env", "is_active", "priority", "scope_level", "allow_sub_org_use", "allow_copy"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "share_policy" in payload:
            row.share_policy = normalize_share_policy(payload.get("share_policy"))
        if "org_code" in payload:
            next_org_code = normalize_org_code(payload.get("org_code"))
            self._assert_can_create_in_org(next_org_code)
            row.org_code = next_org_code
        if "extra_config" in payload:
            row.extra_config_json = json_dumps_safe(payload.get("extra_config") or {})
        api_key_value = str(payload.get("api_key_value") or "").strip()
        if api_key_value:
            row.api_key_ciphertext = self._safe_encrypt_secret(api_key_value)
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_llm_config(row)

    def copy_llm_config(self, config_id: int, actor_id: str = "unknown", target_org_code: Optional[str] = None) -> Dict[str, Any]:
        source = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.id == config_id).first()
        if not source:
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_resource_copyable(source)
        org_code = normalize_org_code(target_org_code or self._current_org_code())
        self._assert_can_create_in_org(org_code)
        row = RecruitmentLLMConfig(
            config_key=f"{source.config_key}-copy-{uuid.uuid4().hex[:4]}",
            org_code=org_code,
            scope_level="ORG",
            share_policy="PRIVATE",
            allow_sub_org_use=False,
            allow_copy=False,
            task_type=source.task_type,
            provider=source.provider,
            model_name=source.model_name,
            base_url=source.base_url,
            api_key_env=source.api_key_env,
            api_key_ciphertext=source.api_key_ciphertext,
            extra_config_json=source.extra_config_json,
            is_active=bool(source.is_active),
            priority=source.priority,
            created_by=actor_id,
            updated_by=actor_id,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_llm_config(row)

    def delete_llm_config(self, config_id: int, actor_id: str = "unknown") -> None:
        row = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.id == config_id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        if not self._can_access_org_resource(row):
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_resource_manageable(row, actor_id)
        self.db.delete(row)
        self.db.commit()

    def _serialize_mail_sender(self, row: RecruitmentMailSenderConfig) -> Dict[str, Any]:
        password = decrypt_secret(row.password_ciphertext or "")
        return {"id": row.id, "org_code": normalize_org_code(getattr(row, "org_code", None)), "scope_level": getattr(row, "scope_level", None) or "ORG", "share_policy": normalize_share_policy(getattr(row, "share_policy", None)), "allow_sub_org_use": bool(getattr(row, "allow_sub_org_use", False)), "allow_copy": bool(getattr(row, "allow_copy", False)), "name": row.name, "from_name": row.from_name, "from_email": row.from_email, "smtp_host": row.smtp_host, "smtp_port": row.smtp_port, "username": row.username, "password_masked": mask_secret(password), "has_password": bool(password), "use_ssl": bool(row.use_ssl), "use_starttls": bool(row.use_starttls), "is_default": bool(row.is_default), "is_enabled": bool(row.is_enabled), "created_by": row.created_by, "updated_by": row.updated_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_mail_senders(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False)).order_by(RecruitmentMailSenderConfig.is_default.desc(), RecruitmentMailSenderConfig.id.asc()).all()
        return [self._serialize_mail_sender(row) for row in rows if self._can_access_org_resource(row)]

    def create_mail_sender(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        org_code = normalize_org_code(payload.get("org_code") or self._current_org_code())
        self._assert_can_create_in_org(org_code)
        if payload.get("is_default"):
            self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False), RecruitmentMailSenderConfig.org_code == org_code).update({RecruitmentMailSenderConfig.is_default: False}, synchronize_session=False)
        row = RecruitmentMailSenderConfig(org_code=org_code, scope_level=str(payload.get("scope_level") or "ORG").strip().upper() or "ORG", share_policy=normalize_share_policy(payload.get("share_policy")), allow_sub_org_use=bool(payload.get("allow_sub_org_use")), allow_copy=bool(payload.get("allow_copy")), name=str(payload.get("name") or "").strip(), from_name=payload.get("from_name"), from_email=str(payload.get("from_email") or "").strip(), smtp_host=str(payload.get("smtp_host") or "").strip(), smtp_port=int(payload.get("smtp_port") or 465), username=str(payload.get("username") or "").strip(), password_ciphertext=self._safe_encrypt_secret(str(payload.get("password") or "")) if payload.get("password") else None, use_ssl=payload.get("use_ssl") is not False, use_starttls=bool(payload.get("use_starttls")), is_default=bool(payload.get("is_default")), is_enabled=payload.get("is_enabled") is not False, created_by=actor_id, updated_by=actor_id, deleted=False)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_sender(row)

    def update_mail_sender(self, sender_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == sender_id, RecruitmentMailSenderConfig.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        if not self._can_access_org_resource(row):
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_resource_manageable(row, actor_id)
        if payload.get("is_default"):
            self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False), RecruitmentMailSenderConfig.org_code == row.org_code, RecruitmentMailSenderConfig.id != sender_id).update({RecruitmentMailSenderConfig.is_default: False}, synchronize_session=False)
        for field in ["name", "from_name", "from_email", "smtp_host", "smtp_port", "username", "use_ssl", "use_starttls", "is_default", "is_enabled", "scope_level", "allow_sub_org_use", "allow_copy"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "share_policy" in payload:
            row.share_policy = normalize_share_policy(payload.get("share_policy"))
        if "org_code" in payload:
            next_org_code = normalize_org_code(payload.get("org_code"))
            self._assert_can_create_in_org(next_org_code)
            row.org_code = next_org_code
        password = str(payload.get("password") or "").strip()
        if password:
            row.password_ciphertext = self._safe_encrypt_secret(password)
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_sender(row)

    def copy_mail_sender(self, sender_id: int, actor_id: str, target_org_code: Optional[str] = None) -> Dict[str, Any]:
        source = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == sender_id, RecruitmentMailSenderConfig.deleted.is_(False)).first()
        if not source:
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_resource_copyable(source)
        org_code = normalize_org_code(target_org_code or self._current_org_code())
        self._assert_can_create_in_org(org_code)
        row = RecruitmentMailSenderConfig(
            org_code=org_code,
            scope_level="ORG",
            share_policy="PRIVATE",
            allow_sub_org_use=False,
            allow_copy=False,
            name=f"{source.name} Copy",
            from_name=source.from_name,
            from_email=source.from_email,
            smtp_host=source.smtp_host,
            smtp_port=source.smtp_port,
            username=source.username,
            password_ciphertext=source.password_ciphertext,
            use_ssl=bool(source.use_ssl),
            use_starttls=bool(source.use_starttls),
            is_default=False,
            is_enabled=bool(source.is_enabled),
            created_by=actor_id,
            updated_by=actor_id,
            deleted=False,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_sender(row)

    def delete_mail_sender(self, sender_id: int, actor_id: str) -> None:
        row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == sender_id, RecruitmentMailSenderConfig.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        if not self._can_access_org_resource(row):
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_resource_manageable(row, actor_id)
        row.deleted = True
        row.updated_by = actor_id
        row.is_default = False
        self.db.add(row)
        self.db.commit()

    def _serialize_mail_recipient(self, row: RecruitmentMailRecipient) -> Dict[str, Any]:
        return {"id": row.id, "org_code": normalize_org_code(getattr(row, "org_code", None)), "scope_level": getattr(row, "scope_level", None) or "ORG", "share_policy": normalize_share_policy(getattr(row, "share_policy", None)), "allow_sub_org_use": bool(getattr(row, "allow_sub_org_use", False)), "allow_copy": bool(getattr(row, "allow_copy", False)), "name": row.name, "email": row.email, "department": row.department, "role_title": row.role_title, "tags": json_loads_safe(row.tags_json, []), "notes": row.notes, "is_enabled": bool(row.is_enabled), "created_by": row.created_by, "updated_by": row.updated_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_mail_recipients(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.deleted.is_(False)).order_by(RecruitmentMailRecipient.id.asc()).all()
        return [self._serialize_mail_recipient(row) for row in rows if self._can_access_org_resource(row)]

    def create_mail_recipient(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        org_code = normalize_org_code(payload.get("org_code") or self._current_org_code())
        self._assert_can_create_in_org(org_code)
        row = RecruitmentMailRecipient(org_code=org_code, scope_level=str(payload.get("scope_level") or "ORG").strip().upper() or "ORG", share_policy=normalize_share_policy(payload.get("share_policy")), allow_sub_org_use=bool(payload.get("allow_sub_org_use")), allow_copy=bool(payload.get("allow_copy")), name=str(payload.get("name") or "").strip(), email=str(payload.get("email") or "").strip(), department=payload.get("department"), role_title=payload.get("role_title"), tags_json=json_dumps_safe(payload.get("tags") or []), notes=payload.get("notes"), is_enabled=payload.get("is_enabled") is not False, created_by=actor_id, updated_by=actor_id, deleted=False)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_recipient(row)

    def update_mail_recipient(self, recipient_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.id == recipient_id, RecruitmentMailRecipient.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        if not self._can_access_org_resource(row):
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_resource_manageable(row, actor_id)
        for field in ["name", "email", "department", "role_title", "notes", "is_enabled", "scope_level", "allow_sub_org_use", "allow_copy"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "share_policy" in payload:
            row.share_policy = normalize_share_policy(payload.get("share_policy"))
        if "org_code" in payload:
            next_org_code = normalize_org_code(payload.get("org_code"))
            self._assert_can_create_in_org(next_org_code)
            row.org_code = next_org_code
        if "tags" in payload:
            row.tags_json = json_dumps_safe(payload.get("tags") or [])
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_recipient(row)

    def copy_mail_recipient(self, recipient_id: int, actor_id: str, target_org_code: Optional[str] = None) -> Dict[str, Any]:
        source = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.id == recipient_id, RecruitmentMailRecipient.deleted.is_(False)).first()
        if not source:
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_resource_copyable(source)
        org_code = normalize_org_code(target_org_code or self._current_org_code())
        self._assert_can_create_in_org(org_code)
        row = RecruitmentMailRecipient(
            org_code=org_code,
            scope_level="ORG",
            share_policy="PRIVATE",
            allow_sub_org_use=False,
            allow_copy=False,
            name=f"{source.name} Copy",
            email=source.email,
            department=source.department,
            role_title=source.role_title,
            tags_json=source.tags_json,
            notes=source.notes,
            is_enabled=bool(source.is_enabled),
            created_by=actor_id,
            updated_by=actor_id,
            deleted=False,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_recipient(row)

    def delete_mail_recipient(self, recipient_id: int, actor_id: str) -> None:
        row = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.id == recipient_id, RecruitmentMailRecipient.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        if not self._can_access_org_resource(row):
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_resource_manageable(row, actor_id)
        row.deleted = True
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()

    def _resolve_mail_sender_row(self, sender_config_id: Optional[Any] = None) -> Optional[RecruitmentMailSenderConfig]:
        sender_row = None
        if sender_config_id:
            try:
                normalized_sender_id = int(sender_config_id)
            except (TypeError, ValueError):
                normalized_sender_id = 0
            if normalized_sender_id > 0:
                sender_row = self.db.query(RecruitmentMailSenderConfig).filter(
                    RecruitmentMailSenderConfig.id == normalized_sender_id,
                    RecruitmentMailSenderConfig.deleted.is_(False),
                    RecruitmentMailSenderConfig.is_enabled.is_(True),
                ).first()
                if sender_row and not self._can_access_org_resource(sender_row):
                    sender_row = None
        if not sender_row:
            sender_rows = self.db.query(RecruitmentMailSenderConfig).filter(
                RecruitmentMailSenderConfig.deleted.is_(False),
                RecruitmentMailSenderConfig.is_enabled.is_(True),
                RecruitmentMailSenderConfig.is_default.is_(True),
            ).order_by(RecruitmentMailSenderConfig.id.asc()).all()
            sender_row = next((row for row in sender_rows if self._can_access_org_resource(row)), None)
        if not sender_row:
            sender_rows = self.db.query(RecruitmentMailSenderConfig).filter(
                RecruitmentMailSenderConfig.deleted.is_(False),
                RecruitmentMailSenderConfig.is_enabled.is_(True),
            ).order_by(RecruitmentMailSenderConfig.id.asc()).all()
            sender_row = next((row for row in sender_rows if self._can_access_org_resource(row)), None)
        return sender_row

    def _normalize_mail_address_groups(
        self,
        *,
        recipient_rows: Sequence[RecruitmentMailRecipient] = (),
        direct_emails: Iterable[Any] = (),
        cc_rows: Sequence[RecruitmentMailRecipient] = (),
        cc_direct_emails: Iterable[Any] = (),
        bcc_rows: Sequence[RecruitmentMailRecipient] = (),
        bcc_direct_emails: Iterable[Any] = (),
    ) -> Dict[str, List[str]]:
        used: set[str] = set()

        def consume(values: Iterable[Any]) -> List[str]:
            resolved: List[str] = []
            for email in _dedupe_email_texts(values):
                lowered = email.lower()
                if lowered in used:
                    continue
                used.add(lowered)
                resolved.append(email)
            return resolved

        to_emails = consume([row.email for row in recipient_rows] + list(direct_emails or []))
        cc_emails = consume([row.email for row in cc_rows] + list(cc_direct_emails or []))
        bcc_emails = consume([row.email for row in bcc_rows] + list(bcc_direct_emails or []))
        return {
            "to_emails": to_emails,
            "cc_emails": cc_emails,
            "bcc_emails": bcc_emails,
            "all_emails": [*to_emails, *cc_emails, *bcc_emails],
        }

    def _prepare_resume_mail_attachments(self, candidates: Sequence[RecruitmentCandidate]) -> List[Any]:
        attachments: List[Any] = []
        for candidate in candidates:
            if not candidate.latest_resume_file_id:
                continue
            resume_file = self._get_resume_file(candidate.latest_resume_file_id)
            attachment_name = _normalize_resume_attachment_name(
                resume_file.original_name,
                resume_file.file_ext,
                f"resume-{candidate.id}",
            )
            attachments.append(load_attachment_from_path(resume_file.storage_path, attachment_name, resume_file.mime_type))
        return attachments

    def _build_resume_mail_default_subject(
        self,
        candidates: Sequence[RecruitmentCandidate],
        *,
        send_mode: str,
        position: Optional[RecruitmentPosition] = None,
    ) -> str:
        candidate_names = "、".join([item.name for item in candidates[:3]])
        if send_mode == "automatic" and len(candidates) == 1:
            status_label = SCREENING_STATUS_LABELS.get(candidates[0].status, candidates[0].status or "初筛完成")
            position_title = position.title if position else "未关联岗位"
            return f"【自动推送】{candidate_names} - {position_title} - {status_label}"
        return f"候选人简历推荐 - {candidate_names}"

    def _build_resume_mail_default_body(
        self,
        candidates: Sequence[RecruitmentCandidate],
        *,
        send_mode: str,
        position: Optional[RecruitmentPosition] = None,
        score_row: Optional[RecruitmentCandidateScore] = None,
    ) -> str:
        if send_mode != "automatic" or len(candidates) != 1:
            return "\n".join([
                f"候选人：{item.name} / 岗位：{self._serialize_candidate_summary(item).get('position_title') or '未关联岗位'}"
                for item in candidates
            ])
        candidate = candidates[0]
        serialized_score = self._serialize_score(score_row) if score_row else {}
        match_percent = serialized_score.get("match_percent")
        recommendation = str(serialized_score.get("recommendation") or "").strip()
        advantages = [str(item).strip() for item in (serialized_score.get("advantages") or []) if str(item).strip()]
        concerns = [str(item).strip() for item in (serialized_score.get("concerns") or []) if str(item).strip()]
        body_lines = [
            "系统已完成候选人初筛，以下为自动推送摘要：",
            f"候选人：{candidate.name}",
            f"岗位：{position.title if position else '未关联岗位'}",
            f"当前状态：{SCREENING_STATUS_LABELS.get(candidate.status, candidate.status or '-')}",
        ]
        if match_percent is not None:
            body_lines.append(f"匹配度：{int(match_percent) if float(match_percent).is_integer() else match_percent}%")
        if recommendation:
            body_lines.append(f"推荐结论：{recommendation}")
        if advantages:
            body_lines.append(f"亮点：{'；'.join(advantages[:3])}")
        if concerns:
            body_lines.append(f"风险点：{'；'.join(concerns[:3])}")
        body_lines.append("附件中包含候选人当前简历，请及时查阅。")
        return "\n".join(body_lines)

    def _create_mail_dispatch_row(
        self,
        *,
        sender_row: Optional[RecruitmentMailSenderConfig],
        candidate_ids: Sequence[int],
        recipient_ids: Sequence[int],
        recipient_emails: Sequence[str],
        cc_recipient_ids: Sequence[int] = (),
        cc_recipient_emails: Sequence[str] = (),
        bcc_recipient_ids: Sequence[int] = (),
        bcc_recipient_emails: Sequence[str] = (),
        subject: Optional[str],
        body_text: Optional[str],
        body_html: Optional[str],
        attachment_count: int,
        status: str,
        created_by: str,
        error_message: Optional[str] = None,
        sent_at: Any = None,
        position_id: Optional[int] = None,
        screening_score_id: Optional[int] = None,
        send_mode: str = "manual",
        trigger_type: Optional[str] = None,
        candidate_status: Optional[str] = None,
        dedup_key: Optional[str] = None,
        trigger_rule_payload: Optional[Dict[str, Any]] = None,
    ) -> RecruitmentResumeMailDispatch:
        org_code = self._current_org_code()
        candidate_id_values = list(candidate_ids)
        if candidate_id_values:
            first_candidate = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == int(candidate_id_values[0])).first()
            if first_candidate:
                org_code = normalize_org_code(getattr(first_candidate, "org_code", None))
        elif position_id:
            position_row = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == position_id).first()
            if position_row:
                org_code = normalize_org_code(getattr(position_row, "org_code", None))
        row = RecruitmentResumeMailDispatch(
            org_code=org_code,
            sender_config_id=sender_row.id if sender_row else None,
            position_id=position_id,
            screening_score_id=screening_score_id,
            candidate_ids_json=json_dumps_safe(candidate_id_values),
            recipient_ids_json=json_dumps_safe(list(recipient_ids)),
            recipient_emails_json=json_dumps_safe(list(recipient_emails)),
            cc_recipient_ids_json=json_dumps_safe(list(cc_recipient_ids)),
            cc_recipient_emails_json=json_dumps_safe(list(cc_recipient_emails)),
            bcc_recipient_ids_json=json_dumps_safe(list(bcc_recipient_ids)),
            bcc_recipient_emails_json=json_dumps_safe(list(bcc_recipient_emails)),
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            attachment_count=int(attachment_count or 0),
            status=status,
            error_message=error_message,
            sent_at=sent_at,
            send_mode=send_mode,
            trigger_type=trigger_type,
            candidate_status=candidate_status,
            dedup_key=dedup_key,
            trigger_rule_json=json_dumps_safe(trigger_rule_payload or {}),
            created_by=created_by,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def _send_resume_mail_dispatch_internal(
        self,
        *,
        sender_row: RecruitmentMailSenderConfig,
        candidates: Sequence[RecruitmentCandidate],
        recipient_ids: Sequence[int],
        recipient_emails: Sequence[str],
        cc_recipient_ids: Sequence[int] = (),
        cc_recipient_emails: Sequence[str] = (),
        bcc_recipient_ids: Sequence[int] = (),
        bcc_recipient_emails: Sequence[str] = (),
        subject: Optional[str],
        body_text: Optional[str],
        body_html: Optional[str],
        created_by: str,
        position_id: Optional[int] = None,
        screening_score_id: Optional[int] = None,
        send_mode: str = "manual",
        trigger_type: Optional[str] = None,
        candidate_status: Optional[str] = None,
        dedup_key: Optional[str] = None,
        trigger_rule_payload: Optional[Dict[str, Any]] = None,
    ) -> RecruitmentResumeMailDispatch:
        recipient_rows = self._load_mail_recipient_rows(recipient_ids)
        cc_rows = self._load_mail_recipient_rows(cc_recipient_ids)
        bcc_rows = self._load_mail_recipient_rows(bcc_recipient_ids)
        grouped_emails = self._normalize_mail_address_groups(
            recipient_rows=recipient_rows,
            direct_emails=recipient_emails,
            cc_rows=cc_rows,
            cc_direct_emails=cc_recipient_emails,
            bcc_rows=bcc_rows,
            bcc_direct_emails=bcc_recipient_emails,
        )
        if not grouped_emails["all_emails"]:
            raise ValueError("未解析到有效收件人")
        attachments = self._prepare_resume_mail_attachments(candidates)
        dispatch = self._create_mail_dispatch_row(
            sender_row=sender_row,
            candidate_ids=[item.id for item in candidates],
            recipient_ids=[row.id for row in recipient_rows],
            recipient_emails=grouped_emails["to_emails"],
            cc_recipient_ids=[row.id for row in cc_rows],
            cc_recipient_emails=grouped_emails["cc_emails"],
            bcc_recipient_ids=[row.id for row in bcc_rows],
            bcc_recipient_emails=grouped_emails["bcc_emails"],
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            attachment_count=len(attachments),
            status="pending",
            created_by=created_by,
            position_id=position_id,
            screening_score_id=screening_score_id,
            send_mode=send_mode,
            trigger_type=trigger_type,
            candidate_status=candidate_status,
            dedup_key=dedup_key,
            trigger_rule_payload=trigger_rule_payload,
        )
        self.db.commit()
        runtime = self._build_sender_runtime(sender_row)
        try:
            message = build_resume_email(
                sender=runtime,
                recipients=grouped_emails["to_emails"],
                cc_recipients=grouped_emails["cc_emails"],
                bcc_recipients=grouped_emails["bcc_emails"],
                subject=subject or "",
                body_text=body_text or "",
                body_html=body_html,
                attachments=attachments,
            )
            send_email_via_smtp(runtime, message, grouped_emails["all_emails"])
            dispatch.status = "sent"
            dispatch.error_message = None
            dispatch.sent_at = func.now()
        except Exception as exc:
            dispatch.status = "failed"
            dispatch.error_message = str(exc)
            self.db.add(dispatch)
            self.db.commit()
            self.db.refresh(dispatch)
            return dispatch
        self.db.add(dispatch)
        self.db.commit()
        self.db.refresh(dispatch)
        return dispatch

    def _record_mail_dispatch_skip(
        self,
        *,
        status: str,
        created_by: str,
        candidate_ids: Sequence[int],
        recipient_ids: Sequence[int] = (),
        recipient_emails: Sequence[str] = (),
        cc_recipient_ids: Sequence[int] = (),
        cc_recipient_emails: Sequence[str] = (),
        bcc_recipient_ids: Sequence[int] = (),
        bcc_recipient_emails: Sequence[str] = (),
        subject: Optional[str] = None,
        body_text: Optional[str] = None,
        position_id: Optional[int] = None,
        screening_score_id: Optional[int] = None,
        send_mode: str = "automatic",
        trigger_type: Optional[str] = None,
        candidate_status: Optional[str] = None,
        dedup_key: Optional[str] = None,
        trigger_rule_payload: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None,
    ) -> RecruitmentResumeMailDispatch:
        row = self._create_mail_dispatch_row(
            sender_row=None,
            candidate_ids=candidate_ids,
            recipient_ids=recipient_ids,
            recipient_emails=recipient_emails,
            cc_recipient_ids=cc_recipient_ids,
            cc_recipient_emails=cc_recipient_emails,
            bcc_recipient_ids=bcc_recipient_ids,
            bcc_recipient_emails=bcc_recipient_emails,
            subject=subject,
            body_text=body_text,
            body_html=None,
            attachment_count=0,
            status=status,
            created_by=created_by,
            error_message=error_message,
            position_id=position_id,
            screening_score_id=screening_score_id,
            send_mode=send_mode,
            trigger_type=trigger_type,
            candidate_status=candidate_status,
            dedup_key=dedup_key,
            trigger_rule_payload=trigger_rule_payload,
        )
        self.db.commit()
        self.db.refresh(row)
        return row

    def _build_auto_mail_dedup_key(self, candidate_id: int, candidate_status: str, dedup_mode: str) -> Optional[str]:
        if dedup_mode == "allow_repeat":
            return None
        if dedup_mode == "once_per_candidate":
            return f"screening_completed:candidate:{candidate_id}"
        return f"screening_completed:candidate:{candidate_id}:status:{candidate_status}"

    def _has_duplicate_auto_mail_dispatch(self, dedup_key: Optional[str]) -> bool:
        if not dedup_key:
            return False
        row = self.db.query(RecruitmentResumeMailDispatch).filter(
            RecruitmentResumeMailDispatch.send_mode == "automatic",
            RecruitmentResumeMailDispatch.trigger_type == "screening_completed",
            RecruitmentResumeMailDispatch.dedup_key == dedup_key,
            RecruitmentResumeMailDispatch.status.in_(["pending", "sent"]),
        ).order_by(RecruitmentResumeMailDispatch.id.desc()).first()
        return bool(row)

    def _maybe_send_auto_resume_mail_after_screening(
        self,
        candidate: RecruitmentCandidate,
        score_row: RecruitmentCandidateScore,
        *,
        actor_id: str,
    ) -> Optional[RecruitmentResumeMailDispatch]:
        if not candidate.position_id:
            return None
        position = self._get_position(candidate.position_id)
        position_config = self._get_position_auto_mail_config(position.id)
        if not bool(position_config.get("auto_mail_enabled")):
            logger.debug(
                "Auto mail skipped: auto_mail_enabled=False candidate_id=%s position_id=%s",
                candidate.id, position.id,
            )
            return None
        global_config = self._get_global_auto_mail_config()
        # 触发状态解析优先级:
        # 1. AI 初筛 score 的 suggested_status（screening_passed / talent_pool / screening_rejected）
        # 2. 候选人已更新的 status 字段（可能是 screening_failed / screening_rejected / screening_passed / talent_pool 等）
        # 注意：screening_failed 不在 _normalize_suggested_status 映射内，需直接取 candidate.status
        trigger_candidate_status = (
            _normalize_suggested_status(score_row.suggested_status)
            or str(candidate.status or "").strip()
            or _normalize_suggested_status(candidate.ai_recommended_status)
            or ""
        )
        trigger_rule_payload = {
            "position_auto_mail_config": position_config,
            "global_auto_mail_config": global_config,
            "trigger_type": "screening_completed",
            "resolved_candidate_status": trigger_candidate_status,
            "global_auto_push_enabled": bool(global_config.get("global_auto_push_enabled")),
        }
        # global_auto_push_enabled 只是「系统层面是否允许自动推送能力」的能力开关
        # 只有当岗位使用的是「全局默认收件人」时才需要全局开关也为 true
        # 如果岗位配置了「岗位专属收件人」则不受全局开关限制，岗位自己决定
        use_position_recipients = bool(position_config.get("auto_mail_use_position_recipients")) and bool(
            position_config.get("auto_mail_position_recipient_ids")
        )
        use_global_recipients = bool(position_config.get("auto_mail_use_global_recipients"))
        if not use_position_recipients and not use_global_recipients:
            return self._record_mail_dispatch_skip(
                status="skipped_no_recipient_source",
                created_by=actor_id,
                candidate_ids=[candidate.id],
                position_id=position.id,
                screening_score_id=score_row.id,
                trigger_type="screening_completed",
                candidate_status=trigger_candidate_status,
                trigger_rule_payload=trigger_rule_payload,
                error_message="岗位未启用任何收件人来源（岗位专属 / 全局默认均未开启）",
            )
        if not use_position_recipients and use_global_recipients and not bool(global_config.get("global_auto_push_enabled")):
            return self._record_mail_dispatch_skip(
                status="skipped_global_disabled",
                created_by=actor_id,
                candidate_ids=[candidate.id],
                position_id=position.id,
                screening_score_id=score_row.id,
                trigger_type="screening_completed",
                candidate_status=trigger_candidate_status,
                trigger_rule_payload=trigger_rule_payload,
                error_message="岗位未配置专属收件人，且全局自动推送能力未启用",
            )
        allowed_statuses = list(position_config.get("auto_mail_allowed_candidate_statuses") or [])
        if trigger_candidate_status not in allowed_statuses:
            return self._record_mail_dispatch_skip(
                status="skipped_status_not_allowed",
                created_by=actor_id,
                candidate_ids=[candidate.id],
                position_id=position.id,
                screening_score_id=score_row.id,
                trigger_type="screening_completed",
                candidate_status=trigger_candidate_status,
                trigger_rule_payload=trigger_rule_payload,
                error_message=f"候选人触发状态[{trigger_candidate_status or '未识别'}]未命中岗位允许自动发送的状态列表",
            )
        position_recipient_ids = _dedupe_ints(
            position_config.get("auto_mail_position_recipient_ids") or []
        ) if position_config.get("auto_mail_use_position_recipients") else []
        global_recipient_ids = _dedupe_ints(
            global_config.get("global_default_recipient_ids") or []
        ) if position_config.get("auto_mail_use_global_recipients") else []
        if position_recipient_ids:
            to_recipient_ids = list(position_recipient_ids)
            trigger_rule_payload["resolved_recipient_strategy"] = "position_only"
        else:
            to_recipient_ids = list(global_recipient_ids)
            trigger_rule_payload["resolved_recipient_strategy"] = "global_only" if global_recipient_ids else "none"
        to_rows = self._load_mail_recipient_rows(to_recipient_ids)
        cc_rows = self._load_mail_recipient_rows(position_config.get("auto_mail_cc_recipient_ids") or [])
        bcc_rows = self._load_mail_recipient_rows(position_config.get("auto_mail_bcc_recipient_ids") or [])
        grouped_emails = self._normalize_mail_address_groups(
            recipient_rows=to_rows,
            cc_rows=cc_rows,
            bcc_rows=bcc_rows,
        )
        dedup_key = self._build_auto_mail_dedup_key(
            candidate.id,
            trigger_candidate_status or "",
            str(position_config.get("auto_mail_dedup_mode") or DEFAULT_POSITION_AUTO_MAIL_CONFIG["auto_mail_dedup_mode"]),
        )
        if self._has_duplicate_auto_mail_dispatch(dedup_key):
            return self._record_mail_dispatch_skip(
                status="skipped_duplicate_blocked",
                created_by=actor_id,
                candidate_ids=[candidate.id],
                recipient_ids=[row.id for row in to_rows],
                recipient_emails=grouped_emails["to_emails"],
                cc_recipient_ids=[row.id for row in cc_rows],
                cc_recipient_emails=grouped_emails["cc_emails"],
                bcc_recipient_ids=[row.id for row in bcc_rows],
                bcc_recipient_emails=grouped_emails["bcc_emails"],
                position_id=position.id,
                screening_score_id=score_row.id,
                trigger_type="screening_completed",
                candidate_status=trigger_candidate_status,
                dedup_key=dedup_key,
                trigger_rule_payload=trigger_rule_payload,
                error_message="命中自动邮件去重策略，已跳过重复发送",
            )
        if not grouped_emails["all_emails"]:
            return self._record_mail_dispatch_skip(
                status="skipped_no_recipients",
                created_by=actor_id,
                candidate_ids=[candidate.id],
                position_id=position.id,
                screening_score_id=score_row.id,
                trigger_type="screening_completed",
                candidate_status=trigger_candidate_status,
                dedup_key=dedup_key,
                trigger_rule_payload=trigger_rule_payload,
                error_message="未解析到有效收件人",
            )
        sender_row = self._resolve_mail_sender_row()
        if not sender_row:
            return self._record_mail_dispatch_skip(
                status="skipped_no_sender",
                created_by=actor_id,
                candidate_ids=[candidate.id],
                recipient_ids=[row.id for row in to_rows],
                recipient_emails=grouped_emails["to_emails"],
                cc_recipient_ids=[row.id for row in cc_rows],
                cc_recipient_emails=grouped_emails["cc_emails"],
                bcc_recipient_ids=[row.id for row in bcc_rows],
                bcc_recipient_emails=grouped_emails["bcc_emails"],
                position_id=position.id,
                screening_score_id=score_row.id,
                trigger_type="screening_completed",
                candidate_status=trigger_candidate_status,
                dedup_key=dedup_key,
                trigger_rule_payload=trigger_rule_payload,
                error_message="未找到可用发件箱",
            )
        subject = self._build_resume_mail_default_subject([candidate], send_mode="automatic", position=position)
        body_text = self._build_resume_mail_default_body([candidate], send_mode="automatic", position=position, score_row=score_row)
        return self._send_resume_mail_dispatch_internal(
            sender_row=sender_row,
            candidates=[candidate],
            recipient_ids=[row.id for row in to_rows],
            recipient_emails=grouped_emails["to_emails"],
            cc_recipient_ids=[row.id for row in cc_rows],
            cc_recipient_emails=grouped_emails["cc_emails"],
            bcc_recipient_ids=[row.id for row in bcc_rows],
            bcc_recipient_emails=grouped_emails["bcc_emails"],
            subject=subject,
            body_text=body_text,
            body_html=None,
            created_by=actor_id,
            position_id=position.id,
            screening_score_id=score_row.id,
            send_mode="automatic",
            trigger_type="screening_completed",
            candidate_status=trigger_candidate_status,
            dedup_key=dedup_key,
            trigger_rule_payload=trigger_rule_payload,
        )

    def _serialize_mail_dispatch(self, row: RecruitmentResumeMailDispatch) -> Dict[str, Any]:
        sender = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == row.sender_config_id).first() if row.sender_config_id else None
        return {
            "id": row.id,
            "sender_config_id": row.sender_config_id,
            "sender_name": sender.name if sender else None,
            "position_id": row.position_id,
            "screening_score_id": row.screening_score_id,
            "candidate_ids": json_loads_safe(row.candidate_ids_json, []),
            "recipient_ids": json_loads_safe(row.recipient_ids_json, []),
            "recipient_emails": json_loads_safe(row.recipient_emails_json, []),
            "cc_recipient_ids": json_loads_safe(row.cc_recipient_ids_json, []),
            "cc_recipient_emails": json_loads_safe(row.cc_recipient_emails_json, []),
            "bcc_recipient_ids": json_loads_safe(row.bcc_recipient_ids_json, []),
            "bcc_recipient_emails": json_loads_safe(row.bcc_recipient_emails_json, []),
            "subject": row.subject,
            "body_text": row.body_text,
            "body_html": row.body_html,
            "attachment_count": row.attachment_count,
            "status": row.status,
            "error_message": row.error_message,
            "send_mode": row.send_mode,
            "trigger_type": row.trigger_type,
            "candidate_status": row.candidate_status,
            "dedup_key": row.dedup_key,
            "trigger_rule": json_loads_safe(row.trigger_rule_json, {}),
            "sent_at": isoformat_or_none(row.sent_at),
            "created_at": isoformat_or_none(row.created_at),
            "updated_at": isoformat_or_none(row.updated_at),
        }

    def _build_sender_runtime(self, row: RecruitmentMailSenderConfig) -> RecruitmentMailSenderRuntime:
        password = decrypt_secret(row.password_ciphertext or "")
        if not password:
            raise ValueError("鎿嶄綔澶辫触")
        return RecruitmentMailSenderRuntime(from_email=row.from_email, from_name=row.from_name, smtp_host=row.smtp_host, smtp_port=row.smtp_port, username=row.username, password=password, use_ssl=bool(row.use_ssl), use_starttls=bool(row.use_starttls))

    def list_resume_mail_dispatches(self) -> List[Dict[str, Any]]:
        builder = self._apply_business_org_filter(self.db.query(RecruitmentResumeMailDispatch), RecruitmentResumeMailDispatch)
        rows = builder.order_by(RecruitmentResumeMailDispatch.created_at.desc(), RecruitmentResumeMailDispatch.id.desc()).all()
        return [self._serialize_mail_dispatch(row) for row in rows]

    def send_resume_mail_dispatch(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        sender_row = self._resolve_mail_sender_row(payload.get("sender_config_id"))
        if not sender_row:
            raise ValueError("鎿嶄綔澶辫触")
        candidate_ids = _dedupe_ints(payload.get("candidate_ids") or [])
        if not candidate_ids:
            raise ValueError("鎿嶄綔澶辫触")
        candidates = [self._get_candidate(candidate_id) for candidate_id in candidate_ids]
        recipient_ids = _dedupe_ints(payload.get("recipient_ids") or [])
        recipient_emails = _dedupe_email_texts(payload.get("recipient_emails") or [])
        cc_recipient_ids = _dedupe_ints(payload.get("cc_recipient_ids") or [])
        cc_recipient_emails = _dedupe_email_texts(payload.get("cc_recipient_emails") or [])
        bcc_recipient_ids = _dedupe_ints(payload.get("bcc_recipient_ids") or [])
        bcc_recipient_emails = _dedupe_email_texts(payload.get("bcc_recipient_emails") or [])
        if not recipient_ids and not recipient_emails and not cc_recipient_ids and not cc_recipient_emails and not bcc_recipient_ids and not bcc_recipient_emails:
            raise ValueError("鎿嶄綔澶辫触")
        subject = str(payload.get("subject") or "").strip() or self._build_resume_mail_default_subject(candidates, send_mode="manual")
        body_text = str(payload.get("body_text") or "").strip() or self._build_resume_mail_default_body(candidates, send_mode="manual")
        body_html = payload.get("body_html") or None
        dispatch = self._send_resume_mail_dispatch_internal(
            sender_row=sender_row,
            candidates=candidates,
            recipient_ids=recipient_ids,
            recipient_emails=recipient_emails,
            cc_recipient_ids=cc_recipient_ids,
            cc_recipient_emails=cc_recipient_emails,
            bcc_recipient_ids=bcc_recipient_ids,
            bcc_recipient_emails=bcc_recipient_emails,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            created_by=actor_id,
            send_mode="manual",
            trigger_type="manual_send",
            candidate_status=candidates[0].status if len(candidates) == 1 else None,
        )
        if dispatch.status == "failed":
            raise ValueError(dispatch.error_message or "邮件发送失败")
        return self._serialize_mail_dispatch(dispatch)

    def _load_mail_recipient_rows(self, recipient_ids: Iterable[Any]) -> List[RecruitmentMailRecipient]:
        normalized = _dedupe_ints(recipient_ids)
        if not normalized:
            return []
        rows = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.id.in_(normalized), RecruitmentMailRecipient.deleted.is_(False), RecruitmentMailRecipient.is_enabled.is_(True)).all()
        rows = [row for row in rows if self._can_access_org_resource(row)]
        order_map = {item: index for index, item in enumerate(normalized)}
        rows.sort(key=lambda row: order_map.get(row.id, 9999))
        return rows

    def list_ai_task_logs(self, task_type: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        builder = self._apply_business_org_filter(self.db.query(RecruitmentAITaskLog), RecruitmentAITaskLog)
        if task_type:
            builder = builder.filter(RecruitmentAITaskLog.task_type == task_type)
        else:
            builder = builder.filter(self._user_visible_ai_task_log_filter())
        if status:
            builder = builder.filter(RecruitmentAITaskLog.status == status)
        rows = builder.order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).limit(200).all()
        touched = False
        for row in rows:
            if self._settle_orphaned_live_task(row):
                touched = True
                continue
        if touched:
            self.db.commit()
            for row in rows:
                self.db.refresh(row)
        return [self._serialize_ai_task_log(row) for row in rows]

    def get_ai_task_log(self, task_id: int) -> Dict[str, Any]:
        row = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.id == task_id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        self._assert_business_row_visible(row)
        if self._settle_orphaned_live_task(row):
            self.db.commit()
            self.db.refresh(row)
        payload = self._serialize_ai_task_log(row, include_full_request_snapshot=True)
        if row.task_type == SCREENING_FLOW_TASK_TYPE and row.parent_task_id is None and row.screening_run_id:
            run_rows = self.db.query(RecruitmentAITaskLog).filter(
                RecruitmentAITaskLog.screening_run_id == row.screening_run_id,
            ).order_by(
                RecruitmentAITaskLog.created_at.asc(),
                RecruitmentAITaskLog.id.asc(),
            ).all()
            payload["run_logs"] = [
                self._serialize_ai_task_log(item, include_full_request_snapshot=True)
                for item in run_rows
            ]
        return payload

    def create_publish_task(self, position_id: int, target_platform: str, mode: str, actor_id: str) -> Dict[str, Any]:
        position = self._get_position(position_id)
        current_jd = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.id == position.current_jd_version_id).first() if position.current_jd_version_id else None
        payload = {"position_id": position.id, "target_platform": target_platform, "mode": mode, "title": position.title, "department": position.department, "location": position.location, "publish_text": current_jd.publish_text if current_jd else None}
        adapter = build_publish_adapter(target_platform, mode)
        row = RecruitmentPublishTask(org_code=normalize_org_code(getattr(position, "org_code", None)), position_id=position.id, target_platform=target_platform, mode=mode, adapter_code=adapter.adapter_code, status="pending", request_payload=json_dumps_safe(payload), created_by=actor_id)
        self.db.add(row)
        self.db.flush()
        try:
            result = adapter.publish_job(payload)
            row.status = result.get("status") or "success"
            row.response_payload = json_dumps_safe(result)
            row.published_url = result.get("published_url")
            row.error_message = None
        except Exception as exc:
            row.status = "failed"
            row.error_message = str(exc)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_publish_task(row)

    def list_publish_tasks(self, position_id: Optional[int] = None) -> List[Dict[str, Any]]:
        builder = self._apply_business_org_filter(self.db.query(RecruitmentPublishTask), RecruitmentPublishTask)
        if position_id:
            builder = builder.filter(RecruitmentPublishTask.position_id == position_id)
        rows = builder.order_by(RecruitmentPublishTask.created_at.desc(), RecruitmentPublishTask.id.desc()).all()
        return [self._serialize_publish_task(row) for row in rows]

    def _serialize_chat_context_row(self, row: Optional[RecruitmentChatContextMemory]) -> Dict[str, Any]:
        if not row:
            return {"position_id": None, "position_title": None, "candidate_id": None, "skill_ids": [], "skills": [], "updated_at": None}
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == row.position_id, RecruitmentPosition.deleted.is_(False)).first() if row.position_id else None
        skill_ids = json_loads_safe(row.skill_ids_json, [])
        return {"position_id": row.position_id, "position_title": position.title if position else None, "candidate_id": row.candidate_id, "skill_ids": skill_ids, "skills": [self._serialize_skill(skill) for skill in self._load_skill_rows(skill_ids)], "updated_at": isoformat_or_none(row.updated_at)}

    def get_chat_context(self, user_id: str) -> Dict[str, Any]:
        row = self.db.query(RecruitmentChatContextMemory).filter(RecruitmentChatContextMemory.user_id == user_id).first()
        return self._serialize_chat_context_row(row)

    def update_chat_context(self, user_id: str, position_id: Optional[int], skill_ids: Iterable[Any], candidate_id: Optional[int]) -> Dict[str, Any]:
        row = self.db.query(RecruitmentChatContextMemory).filter(RecruitmentChatContextMemory.user_id == user_id).first()
        if not row:
            row = RecruitmentChatContextMemory(org_code=self._current_org_code(), user_id=user_id, position_id=position_id, candidate_id=candidate_id, skill_ids_json=json_dumps_safe(_dedupe_ints(skill_ids)), context_json=json_dumps_safe({}))
            self.db.add(row)
        else:
            row.position_id = position_id
            row.candidate_id = candidate_id
            row.skill_ids_json = json_dumps_safe(_dedupe_ints(skill_ids))
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_chat_context_row(row)

    # NOTE:
    # The legacy chat helper block that used to live here had multiple encoding-corrupted
    # string literals and is intentionally removed. Updated chat handlers are defined below.

    def _format_chat_candidate_list_reply(self, position: RecruitmentPosition, candidates: Sequence[Dict[str, Any]]) -> str:
        if not candidates:
            return f"当前岗位“{position.title}”下暂时没有查到候选人。"
        status_label_map = {item["value"]: item["label"] for item in CANDIDATE_STATUS_OPTIONS}
        lines = [f"当前岗位“{position.title}”共有 {len(candidates)} 位候选人："]
        for index, candidate in enumerate(candidates[:10], 1):
            match_percent = candidate.get("match_percent")
            match_text = f"{match_percent}%" if isinstance(match_percent, (int, float)) else "暂无"
            status_text = status_label_map.get(str(candidate.get("status") or ""), str(candidate.get("status") or "未知状态"))
            candidate_name = candidate.get("name") or f"候选人 #{candidate.get('id')}"
            source_text = candidate.get("source") or "未知"
            lines.append(f"{index}. {candidate_name} | 状态：{status_text} | 匹配度：{match_text} | 来源：{source_text}")
        if len(candidates) > 10:
            lines.append(f"其余 {len(candidates) - 10} 位候选人请到候选人中心继续查看。")
        return "\n".join(lines)

    def _get_chat_skill_snapshots(self, current_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        skill_rows = self._load_skill_rows(current_context.get("skill_ids") or [], enabled_only=True)
        return self._build_skill_snapshots(skill_rows)

    def _build_chat_skill_system_prompt(self, skill_snapshots: Sequence[Dict[str, Any]]) -> str:
        if not skill_snapshots:
            return ""
        blocks: List[str] = []
        for index, skill in enumerate(skill_snapshots, 1):
            blocks.append(
                "\n".join(
                        [
                            f"[ACTIVE_SKILL {index}]",
                            f"name: {skill.get('name') or f'Skill #{index}'}",
                            f"description: {skill.get('description') or 'N/A'}",
                            "rules:",
                            str(skill.get("content") or ""),
                        ]
                    )
                )
        return "\n\n".join(
            [
                "ACTIVE_SKILLS are binding operating rules for this assistant.",
                "If the user intent matches a screening or interview workflow, follow the matching skill directly instead of replying generically.",
                *blocks,
            ]
        )

    def _record_chat_reply(self, *, user_id: str, message: str, current_context: Dict[str, Any], reply: str, model_provider: str, model_name: str, memory_source: Optional[str] = None, used_skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None, output_snapshot: Optional[Any] = None) -> RecruitmentAITaskLog:
        skill_snapshots = list(used_skill_snapshots or self._get_chat_skill_snapshots(current_context))
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        prompt_snapshot = json_dumps_safe({"message": message, "context": current_context, "mode": "structured"})
        log_row = self._create_ai_task_log("chat_orchestrator", created_by=user_id, related_position_id=current_context.get("position_id"), related_candidate_id=current_context.get("candidate_id"), related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, memory_source=memory_source, request_hash=self._build_request_hash("chat_orchestrator", user_id, message, current_context, reply))
        return self._finish_ai_task_log(log_row, status="success", provider=model_provider, model_name=model_name, prompt_snapshot=prompt_snapshot, input_summary=truncate_text(message, 600), output_summary=truncate_text(reply, 600), output_snapshot=output_snapshot or {"reply": reply}, memory_source=memory_source, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots)

    def _stream_plain_text(self, text: str, on_delta: Callable[[str], None], *, cancel_control: Optional[RecruitmentTaskControl] = None, chunk_size: int = 24) -> None:
        content = str(text or "")
        if not content:
            return
        for index in range(0, len(content), chunk_size):
            self._raise_if_cancelled(cancel_control)
            on_delta(content[index:index + chunk_size])

    def _resolve_chat_candidate(self, message: str, current_context: Dict[str, Any]) -> Optional[RecruitmentCandidate]:
        candidate_id = current_context.get("candidate_id")
        if candidate_id:
            try:
                return self._get_candidate(int(candidate_id))
            except (TypeError, ValueError):
                pass
        text = (message or "").strip()
        if any(token in text for token in ["当前候选人", "当前人选", "这位候选人", "这个候选人"]) and current_context.get("candidate_id"):
            try:
                return self._get_candidate(int(current_context["candidate_id"]))
            except (TypeError, ValueError):
                return None
        patterns = [
            r"(?:给|对|帮我给|帮我对|重新对|重新给)\s*(?P<name>[\u4e00-\u9fffA-Za-z0-9_\-·]{1,40})\s*(?:重新)?(?:初筛|筛选|筛一下|重筛|复筛|生成|出|安排)?",
            r"(?P<name>[\u4e00-\u9fffA-Za-z0-9_\-·]{2,40})\s*(?:重新)?(?:初筛|筛选|筛一下|重筛|复筛|生成面试题|生成初试题|生成复试题)",
        ]
        candidate_name = ""
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                candidate_name = (match.group("name") or "").strip()
                break
        if not candidate_name or candidate_name in {"当前候选人", "当前人选", "这位候选人", "这个候选人", "当前岗位"}:
            return None
        rows = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.deleted.is_(False), RecruitmentCandidate.name.like(f"%{candidate_name}%")).order_by(RecruitmentCandidate.updated_at.desc(), RecruitmentCandidate.id.desc()).limit(20).all()
        if not rows:
            return None
        current_position_id = current_context.get("position_id")
        if current_position_id:
            scoped = [row for row in rows if row.position_id == current_position_id]
            if scoped:
                return scoped[0]
        exact = [row for row in rows if row.name == candidate_name]
        return exact[0] if exact else rows[0]

    def _extract_chat_interview_request(self, message: str) -> Optional[Dict[str, str]]:
        text = (message or "").strip()
        interview_keywords = ["面试题", "初试题", "复试题", "面试问题", "出几道题", "来一套题", "出题", "生成题"]
        if not text or not any(keyword in text for keyword in interview_keywords):
            return None
        round_name = "复试" if any(keyword in text for keyword in ["复试", "二面", "第二轮"]) else "初试"
        custom_requirements = ""
        for marker in ["硬性条件", "硬性要求", "重点", "侧重", "补充要求", "要求", "并且", "同时"]:
            if marker not in text:
                continue
            tail = text.split(marker, 1)[1].strip("：:，,.。；; ")
            if tail:
                custom_requirements = tail
                break
        return {"round_name": round_name, "custom_requirements": custom_requirements}

    def _extract_chat_screening_request(self, message: str) -> Optional[Dict[str, str]]:
        text = (message or "").strip()
        screening_keywords = ["初筛", "筛选", "筛一下", "重新筛", "重新初筛", "重筛", "复筛", "再次筛选", "重新评估", "筛简历", "看简历", "看这份简历", "帮我看简历", "帮我看这份简历", "候选人评估", "简历评估", "评估一下"]
        if not text or not any(keyword in text for keyword in screening_keywords):
            return None
        custom_requirements = ""
        for marker in ["硬性条件", "硬性要求", "附加条件", "新增条件", "重点看", "重点关注", "更看重", "要求加强", "加强"]:
            if marker not in text:
                continue
            tail = text.split(marker, 1)[1].strip("：:，,.。；; ")
            if tail:
                custom_requirements = tail
                break
        if not custom_requirements and any(keyword in text for keyword in ["硬性", "加强", "重点"]):
            custom_requirements = text
        return {"custom_requirements": custom_requirements}

    def _is_skill_and_model_summary_request(self, message: str) -> bool:
        compact = re.sub(r"\s+", "", (message or "").strip().lower())
        return (
            ("skill" in compact or "skills" in compact or "模型" in compact or "model" in compact)
            and any(keyword in compact for keyword in ["用了哪些", "使用了哪些", "说明这次", "本次对话", "当前对话", "这次对话"])
        )

    def _build_chat_runtime_summary_reply(self, current_context: Dict[str, Any], resolved_config: Any) -> Dict[str, Any]:
        skill_snapshots = self._get_chat_skill_snapshots(current_context)
        position_title = current_context.get("position_title") or None
        if not position_title and current_context.get("position_id"):
            try:
                position_title = self._get_position(int(current_context["position_id"])).title
            except Exception:
                position_title = None
        candidate_name = None
        if current_context.get("candidate_id"):
            try:
                candidate_name = self._get_candidate(int(current_context["candidate_id"])).name
            except Exception:
                candidate_name = None
        lines = [
            "本次助手对话默认会使用以下上下文：",
            f"- 当前岗位：{position_title or '未指定'}",
            f"- 当前候选人：{candidate_name or '未指定'}",
            f"- 当前模型：{resolved_config.provider} / {resolved_config.model_name}",
        ]
        if skill_snapshots:
            lines.append("- 当前激活 Skills：")
            lines.extend([f"  - {skill.get('name') or f'Skill #{index + 1}'}" for index, skill in enumerate(skill_snapshots)])
        else:
            lines.append("- 当前激活 Skills：无")
        lines.append("")
        lines.append("这些信息来自当前助手上下文与当前生效模型配置，不是模型猜测结果。")
        return {
            "reply": "\n".join(lines),
            "used_skill_snapshots": skill_snapshots,
            "memory_source": "manual",
        }

    def _extract_chat_jd_request(self, message: str, current_context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        text = str(message or "").strip()
        compact = re.sub(r"\s+", "", text.lower())
        jd_keywords = ["jd", "岗位jd", "职位jd", "招聘jd", "岗位描述", "职位描述"]
        if not text or not any(keyword in compact for keyword in jd_keywords):
            return None
        if any(keyword in text for keyword in ["当前岗位", "当前职位", "本岗位", "该岗位"]) and current_context.get("position_id"):
            return {
                "mode": "current_position",
                "position_id": int(current_context["position_id"]),
                "title": current_context.get("position_title") or None,
                "extra_prompt": "",
            }
        title = ""
        patterns = [
            r"(?:帮我|请|麻烦)?(?:生成|写|起草|撰写|整理|给我|来一份|出一份)?(?:一份|一个|一版)?(?P<title>[\u4e00-\u9fffA-Za-z0-9·/\-]{2,30})(?:的)?(?:招聘)?(?:岗位|职位)?\s*jd",
            r"(?P<title>[\u4e00-\u9fffA-Za-z0-9·/\-]{2,30})(?:岗位|职位)?(?:的)?(?:招聘)?\s*jd",
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                title = str(match.group("title") or "").strip(" ：:，,.。；;")
                break
        title = re.sub(r"^(帮我|请|麻烦|生成|写|起草|撰写|整理|给我|来一份|出一份|一份)+", "", title).strip()
        if not title:
            return None
        extra_prompt = ""
        for marker in ["要求", "并且", "同时", "重点", "侧重", "补充"]:
            if marker not in text:
                continue
            tail = text.split(marker, 1)[1].strip("：:，,.。；; ")
            if tail:
                extra_prompt = tail
                break
        return {
            "mode": "ad_hoc_role",
            "position_id": None,
            "title": title,
            "extra_prompt": extra_prompt,
        }

    def _build_virtual_position_for_jd(self, title: str) -> Any:
        clean_title = str(title or "未命名岗位").strip() or "未命名岗位"
        return SimpleNamespace(
            id=None,
            position_code=None,
            title=clean_title,
            department="业务团队",
            location="面议",
            employment_type=None,
            salary_range="面议",
            headcount=1,
            key_requirements="",
            bonus_points="",
            summary="",
            status="draft",
            auto_screen_on_upload=False,
            auto_advance_on_screening=False,
            current_jd_version_id=None,
        )

    def _build_jd_preview_prompt(self, position_payload: Dict[str, Any], skill_snapshots: Sequence[Dict[str, Any]], extra_prompt: str) -> str:
        return json_dumps_safe({
            "position": position_payload,
            "skills": [
                {
                    "id": skill.get("id"),
                    "name": skill.get("name"),
                    "description": skill.get("description"),
                    "content": str(skill.get("content") or ""),
                }
                for skill in skill_snapshots
            ],
            "extra_prompt": extra_prompt or None,
        })

    def _is_recruitment_related(self, message: str, current_context: Dict[str, Any]) -> bool:
        compact_message = re.sub(r"\s+", "", (message or "").strip().lower())
        recruitment_keywords = [
            "招聘", "岗位", "jd", "候选人", "简历", "初筛", "筛选", "重筛", "复筛", "面试",
            "offer", "人才库", "skills", "skill", "模型", "model", "provider", "邮件", "发件箱",
            "收件人", "薪资", "匹配度", "评估", "录用", "淘汰", "入职", "boss", "智联",
        ]
        if any(keyword in compact_message for keyword in recruitment_keywords):
            return True
        contextual_keywords = ["当前候选人", "当前岗位", "这位候选人", "这个候选人", "重新来一版", "再筛一次", "再出一版", "为什么", "怎么处理"]
        if (current_context.get("candidate_id") or current_context.get("position_id")) and any(keyword in compact_message for keyword in contextual_keywords):
            return True
        non_recruitment_keywords = ["天气", "温度", "下雨", "股价", "股票", "新闻", "电影", "旅游", "做饭", "翻译", "几点", "时间", "星座"]
        if any(keyword in compact_message for keyword in non_recruitment_keywords):
            return False
        return False

    def _handle_structured_chat_command(self, user_id: str, message: str, current_context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        compact_message = re.sub(r"\s+", "", (message or "").strip().lower())
        skill_keywords = ["列出当前skills", "查看当前skills", "当前skills", "当前skill", "现在用了哪些skills", "本次用了哪些skills"]
        candidate_keywords = ["查看当前岗位候选人", "查看当前岗位候选人列表", "列出当前岗位候选人", "当前岗位候选人列表"]
        if any(keyword in compact_message for keyword in skill_keywords):
            skill_rows = self._load_skill_rows(current_context.get("skill_ids") or [], enabled_only=True)
            if not skill_rows:
                return {"reply": "当前还没有激活任何 Skills。你可以先在助手右侧选择 Skills，再让我基于这些规则进行初筛、重筛或生成面试题。", "context": current_context, "actions": [], "memory_source": "manual", "used_skill_snapshots": []}
            lines = ["当前激活的 Skills 如下："]
            for index, skill in enumerate(skill_rows, 1):
                description = f"：{skill.description}" if skill.description else ""
                lines.append(f"{index}. {skill.name}{description}")
            return {"reply": "\n".join(lines), "context": current_context, "actions": [], "memory_source": "manual", "used_skill_snapshots": self._build_skill_snapshots(skill_rows)}
        if any(keyword in compact_message for keyword in candidate_keywords):
            position_id = current_context.get("position_id")
            if not position_id:
                return {"reply": "当前还没有指定岗位上下文。请先在右侧选择岗位，或先打开某个岗位详情。", "context": current_context, "actions": [], "memory_source": None, "used_skill_snapshots": self._get_chat_skill_snapshots(current_context)}
            position = self._get_position(int(position_id))
            candidates = self.list_candidates(position_id=position.id)
            return {"reply": self._format_chat_candidate_list_reply(position, candidates), "context": current_context, "actions": [], "memory_source": None, "used_skill_snapshots": self._get_chat_skill_snapshots(current_context)}

        screening_request = self._extract_chat_screening_request(message)
        if screening_request:
            candidate = self._resolve_chat_candidate(message, current_context)
            if not candidate:
                return {"reply": "当前没有定位到需要初筛的候选人。请先在候选人中心选中一位候选人，或直接说“重新对张三进行初筛”。", "context": current_context, "actions": [], "memory_source": None, "used_skill_snapshots": self._get_chat_skill_snapshots(current_context)}
            next_context = current_context
            if current_context.get("candidate_id") != candidate.id or current_context.get("position_id") != candidate.position_id:
                next_context = self.update_chat_context(user_id, candidate.position_id, current_context.get("skill_ids") or [], candidate.id)
            explicit_skill_ids = next_context.get("skill_ids") or []
            self.screen_candidate(candidate.id, user_id, skill_ids=explicit_skill_ids, use_position_skills=not bool(explicit_skill_ids), use_candidate_memory=not bool(explicit_skill_ids), custom_requirements=screening_request["custom_requirements"])
            latest_score_log = self.db.query(RecruitmentAITaskLog).filter(self._screening_root_task_filter(), RecruitmentAITaskLog.related_candidate_id == candidate.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).first()
            score_detail = self.get_candidate_detail(candidate.id)
            parse_payload = score_detail.get("parse_result") or {}
            score_payload = score_detail.get("score") or {}
            used_skill_snapshots = json_loads_safe(latest_score_log.related_skill_snapshots_json, []) if latest_score_log else self._build_skill_snapshots(self._load_skill_rows(score_detail.get("workflow_memory", {}).get("screening_skill_ids") or []), screening_request["custom_requirements"])
            skill_names = "、".join(skill.get("name") or f"Skill #{skill.get('id')}" for skill in used_skill_snapshots) or "未记录"
            report_markdown = str(score_payload.get("report_markdown") or _build_screening_report_markdown(candidate, parse_payload if isinstance(parse_payload, dict) else {}, score_payload if isinstance(score_payload, dict) else {})).strip()
            reply_lines = [
                f"已完成 {candidate.name} 的初筛。",
                f"本次规则来源：{(latest_score_log.memory_source if latest_score_log else score_detail.get('workflow_memory', {}).get('screening_memory_source')) or '未记录'}。",
                f"本次使用 Skills：{skill_names}。",
            ]
            if screening_request["custom_requirements"]:
                reply_lines.append(f"附加硬性条件：{screening_request['custom_requirements']}")
            reply_lines.extend(["", report_markdown])
            return {"reply": "\n".join(reply_lines), "context": next_context, "actions": ["已完成初筛"], "memory_source": latest_score_log.memory_source if latest_score_log else score_detail.get("workflow_memory", {}).get("screening_memory_source"), "used_skill_snapshots": used_skill_snapshots}

        interview_request = self._extract_chat_interview_request(message)
        if not interview_request:
            return None
        candidate = self._resolve_chat_candidate(message, current_context)
        if not candidate:
            return {"reply": "当前没有定位到候选人。请先在候选人中心选中一位候选人，或直接说“给张三生成初试题”。", "context": current_context, "actions": [], "memory_source": None, "used_skill_snapshots": self._get_chat_skill_snapshots(current_context)}
        next_context = current_context
        if current_context.get("candidate_id") != candidate.id or current_context.get("position_id") != candidate.position_id:
            next_context = self.update_chat_context(user_id, candidate.position_id, current_context.get("skill_ids") or [], candidate.id)
        question = self.generate_interview_questions(candidate.id, interview_request["round_name"], interview_request["custom_requirements"], next_context.get("skill_ids") or [], user_id, use_candidate_memory=True)
        latest_interview_log = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.task_type == "interview_question_generation", RecruitmentAITaskLog.related_candidate_id == candidate.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).first()
        used_skill_snapshots = json_loads_safe(latest_interview_log.related_skill_snapshots_json, []) if latest_interview_log else self._build_skill_snapshots(self._load_skill_rows(question.get("skill_ids") or []))
        skill_names = "、".join(skill.get("name") or f"Skill #{skill.get('id')}" for skill in used_skill_snapshots) or "未记录"
        reply_lines = [
            f"已为 {candidate.name} 生成{question.get('round_name') or '面试'}题。",
            f"本次规则来源：{(latest_interview_log.memory_source if latest_interview_log else '未记录')}。",
            f"本次使用 Skills：{skill_names}。",
        ]
        if interview_request["custom_requirements"]:
            reply_lines.append(f"附加要求：{interview_request['custom_requirements']}")
        reply_lines.extend(["", question.get("markdown_content") or "面试题已生成，请到候选人详情查看。"])
        return {"reply": "\n".join(reply_lines), "context": next_context, "actions": ["已生成面试题"], "memory_source": latest_interview_log.memory_source if latest_interview_log else None, "used_skill_snapshots": used_skill_snapshots}

    def stream_chat(self, user_id: str, user_name: str, message: str, context: Optional[Dict[str, Any]], on_delta: Callable[[str], None], *, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        if context is not None:
            self.update_chat_context(user_id, context.get("position_id"), context.get("skill_ids") or [], context.get("candidate_id"))
        current_context = self.get_chat_context(user_id)
        lower_message = (message or "").strip().lower()
        resolved = self.ai_gateway.resolve_config("chat_orchestrator")
        model_keywords = ["你是什么模型", "你现在是什么模型", "当前使用什么模型", "使用什么模型", "model", "provider"]
        switch_keywords = ["怎么切模型", "如何切模型", "怎么换模型", "如何换模型", "切到小米", "小米模型", "切到mimo", "mimo"]
        started_at = time.perf_counter()

        if any(keyword in lower_message for keyword in model_keywords):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = f"当前 AI 助手使用的模型是 {resolved.provider} / {resolved.model_name}。如果你想切换模型，可以到“管理设置 -> 模型配置”里把对应模型设为当前使用。"
            self._stream_plain_text(reply, on_delta, cancel_control=cancel_control)
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider=resolved.provider, model_name=resolved.model_name, memory_source="manual", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "manual", "model_provider": resolved.provider, "model_name": resolved.model_name, "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None, "timing": {"service_started_at_ms": int(started_at * 1000), "completed_at_ms": int(time.perf_counter() * 1000)}}

        if any(keyword in lower_message for keyword in switch_keywords):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = "要切换到新模型，请打开“管理设置 -> 模型配置”，找到对应任务类型下的模型，点击“设为当前使用”。系统会按 priority 从小到大路由，所以设为当前使用后，该模型会排到当前任务的最高优先级。"
            self._stream_plain_text(reply, on_delta, cancel_control=cancel_control)
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider="system", model_name="structured-router", memory_source="manual", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "manual", "model_provider": "system", "model_name": "structured-router", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None, "timing": {"service_started_at_ms": int(started_at * 1000), "completed_at_ms": int(time.perf_counter() * 1000)}}

        if self._is_skill_and_model_summary_request(message):
            summary = self._build_chat_runtime_summary_reply(current_context, resolved)
            reply = str(summary.get("reply") or "").strip()
            used_skill_snapshots = list(summary.get("used_skill_snapshots") or [])
            self._stream_plain_text(reply, on_delta, cancel_control=cancel_control)
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider=resolved.provider, model_name=resolved.model_name, memory_source=summary.get("memory_source"), used_skill_snapshots=used_skill_snapshots, output_snapshot={"reply": reply})
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": summary.get("memory_source"), "model_provider": resolved.provider, "model_name": resolved.model_name, "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None, "timing": {"service_started_at_ms": int(started_at * 1000), "completed_at_ms": int(time.perf_counter() * 1000)}}

        jd_request = self._extract_chat_jd_request(message, current_context)
        if jd_request:
            position = self._get_position(int(jd_request["position_id"])) if jd_request.get("position_id") else self._build_virtual_position_for_jd(str(jd_request.get("title") or "新岗位"))
            manual_skill_rows = [row for row in self._load_skill_rows(current_context.get("skill_ids") or [], enabled_only=True) if "jd" in _extract_skill_task_types(row)]
            if manual_skill_rows:
                skill_rows = manual_skill_rows
                memory_source = "manual"
            elif getattr(position, "id", None):
                skill_rows, memory_source = self._resolve_jd_skills(position, [], use_position_skills=True, use_global_skills=True)
            else:
                skill_rows = [row for row in self._load_enabled_skills() if "jd" in _extract_skill_task_types(row)]
                memory_source = "global" if skill_rows else "none"
            skill_snapshots = self._build_skill_snapshots(skill_rows)
            related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
            position_payload = self._serialize_position_for_jd_prompt(position)
            prompt = self._build_jd_preview_prompt(position_payload, skill_snapshots, str(jd_request.get("extra_prompt") or ""))
            log_row = self._create_ai_task_log("jd_generation", created_by=user_id, related_position_id=getattr(position, "id", None), related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, memory_source=memory_source, request_hash=self._build_request_hash("jd_generation", getattr(position, "id", None), position.title, jd_request.get("extra_prompt") or "", related_skill_ids))
            first_delta_at: Optional[float] = None
            preview_chunks: List[str] = []

            def _handle_jd_delta(chunk: str) -> None:
                nonlocal first_delta_at
                self._raise_if_cancelled(cancel_control)
                if first_delta_at is None:
                    first_delta_at = time.perf_counter()
                preview_chunks.append(chunk)
                on_delta(chunk)

            try:
                prefix = (
                    f"已定位当前岗位：{position.title}\n正在生成 JD 草稿，请稍候...\n\n"
                    if getattr(position, "id", None)
                    else f"正在为“{position.title}”起草岗位 JD，请稍候...\n\n"
                )
                self._stream_plain_text(prefix, on_delta, cancel_control=cancel_control)
                self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(prompt, 600), output_summary="正在生成 JD 草稿")
                self.ai_gateway.stream_text(task_type="jd_generation", system_prompt=JD_GENERATION_STREAM_PREVIEW_SYSTEM_PROMPT, user_prompt=prompt, on_delta=_handle_jd_delta, cancel_control=cancel_control)
                task = self.ai_gateway.generate_json(task_type="jd_generation", system_prompt=JD_GENERATION_SYSTEM_PROMPT, user_prompt=prompt, fallback_builder=lambda: build_jd_structured_fallback(position), cancel_control=cancel_control)
                content = task.get("content") or {}
                structured = normalize_structured_jd(content if isinstance(content, dict) else {}, position)
                markdown = render_jd_markdown_source(structured)
                html = markdown_to_html(markdown)
                publish_text = render_publish_ready_jd(structured)
                reply_lines = [
                    f"已为“{position.title}”生成岗位 JD 草稿。",
                    "这是一份未落库的草稿，如果你确认内容合适，我可以继续帮你保存为新岗位或覆盖当前岗位版本。",
                    "",
                    markdown,
                ]
                reply = "\n".join(reply_lines).strip()
                finished_log = self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), full_request_snapshot=task.get("full_request_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot={"raw": content, "normalized": structured, "preview_markdown": "".join(preview_chunks).strip(), "reply": reply, "html": html, "publish_text": publish_text}, error_message=task.get("error_message"), token_usage=task.get("token_usage"), memory_source=memory_source, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots)
                return {"reply": reply, "context": current_context, "actions": ["已生成 JD 草稿（未保存）"], "log_id": finished_log.id, "memory_source": memory_source, "model_provider": task.get("provider"), "model_name": task.get("model_name"), "used_skill_ids": related_skill_ids, "used_skills": skill_snapshots, "used_fallback": bool(task.get("used_fallback")), "fallback_error": task.get("error_message"), "timing": {"service_started_at_ms": int(started_at * 1000), "first_model_delta_at_ms": int(first_delta_at * 1000) if first_delta_at is not None else None, "completed_at_ms": int(time.perf_counter() * 1000), "time_to_first_delta_ms": int((first_delta_at - started_at) * 1000) if first_delta_at is not None else None}}
            except RecruitmentTaskCancelled:
                self.db.rollback()
                self._mark_ai_task_cancelled(log_row.id, actor_id=user_id, reason="任务已被用户停止，JD 草稿未继续生成。")
                raise
            except Exception as exc:
                self.db.rollback()
                fallback_structured = build_jd_structured_fallback(position)
                fallback_markdown = render_jd_markdown_source(fallback_structured)
                reply = f"已为“{position.title}”生成岗位 JD 草稿。\n\n{fallback_markdown}".strip()
                self._stream_plain_text(reply, on_delta, cancel_control=cancel_control)
                finished_log = self._finish_ai_task_log(log_row, status="fallback", provider=resolved.provider, model_name=resolved.model_name, prompt_snapshot=f"SYSTEM:\n{JD_GENERATION_SYSTEM_PROMPT}\n\nUSER:\n{prompt}", full_request_snapshot=None, input_summary=truncate_text(prompt, 600), output_summary=truncate_text(reply, 600), output_snapshot={"normalized": fallback_structured, "reply": reply, "preview_markdown": "".join(preview_chunks).strip()}, error_message=str(exc), memory_source=memory_source, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots)
                return {"reply": reply, "context": current_context, "actions": ["已生成 JD 草稿（未保存）"], "log_id": finished_log.id, "memory_source": memory_source, "model_provider": resolved.provider, "model_name": resolved.model_name, "used_skill_ids": related_skill_ids, "used_skills": skill_snapshots, "used_fallback": True, "fallback_error": str(exc), "timing": {"service_started_at_ms": int(started_at * 1000), "completed_at_ms": int(time.perf_counter() * 1000)}}

        screening_request = self._extract_chat_screening_request(message)
        if screening_request:
            candidate = self._resolve_chat_candidate(message, current_context)
            if candidate:
                progress_lines = [
                    f"已定位候选人：{candidate.name}",
                    "正在读取当前岗位与激活 Skills...",
                    "正在执行初筛，请稍候...",
                    "",
                ]
                self._stream_plain_text("\n".join(progress_lines), on_delta, cancel_control=cancel_control)
            structured_response = self._handle_structured_chat_command(user_id, message, current_context)
            if structured_response is not None:
                next_context = structured_response.get("context") or current_context
                used_skill_snapshots = list(structured_response.get("used_skill_snapshots") or self._get_chat_skill_snapshots(next_context))
                reply = str(structured_response.get("reply") or "").strip() or "初筛已完成。"
                self._stream_plain_text(reply, on_delta, cancel_control=cancel_control)
                log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=next_context, reply=reply, model_provider="system", model_name="structured-router", memory_source=structured_response.get("memory_source"), used_skill_snapshots=used_skill_snapshots, output_snapshot={"reply": reply, "actions": structured_response.get("actions") or []})
                return {"reply": reply, "context": next_context, "actions": structured_response.get("actions") or [], "log_id": log_row.id, "memory_source": structured_response.get("memory_source"), "model_provider": "system", "model_name": "structured-router", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None, "timing": {"service_started_at_ms": int(started_at * 1000), "completed_at_ms": int(time.perf_counter() * 1000)}}

        structured_response = self._handle_structured_chat_command(user_id, message, current_context)
        if structured_response is not None:
            next_context = structured_response.get("context") or current_context
            used_skill_snapshots = list(structured_response.get("used_skill_snapshots") or self._get_chat_skill_snapshots(next_context))
            reply = str(structured_response.get("reply") or "").strip()
            self._stream_plain_text(reply, on_delta, cancel_control=cancel_control)
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=next_context, reply=reply, model_provider="system", model_name="structured-router", memory_source=structured_response.get("memory_source"), used_skill_snapshots=used_skill_snapshots, output_snapshot={"reply": reply, "actions": structured_response.get("actions") or []})
            return {"reply": reply, "context": next_context, "actions": structured_response.get("actions") or [], "log_id": log_row.id, "memory_source": structured_response.get("memory_source"), "model_provider": "system", "model_name": "structured-router", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None, "timing": {"service_started_at_ms": int(started_at * 1000), "completed_at_ms": int(time.perf_counter() * 1000)}}

        if not self._is_recruitment_related(message, current_context):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = "这里是 AI 招聘工作台助手，我只处理招聘相关任务，例如岗位、JD、Skills、候选人、初筛、面试题、Offer 和招聘邮件流转。像天气这类非招聘问题，请到通用助手里处理。"
            self._stream_plain_text(reply, on_delta, cancel_control=cancel_control)
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider="system", model_name="recruitment-guard", memory_source="guardrail", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "guardrail", "model_provider": "system", "model_name": "recruitment-guard", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None, "timing": {"service_started_at_ms": int(started_at * 1000), "completed_at_ms": int(time.perf_counter() * 1000)}}

        used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
        related_skill_ids = self._extract_related_skill_ids(used_skill_snapshots)
        prompt = json_dumps_safe({"user": user_name, "message": message, "context": current_context, "guardrail": "Only handle recruitment-related requests. Refuse unrelated queries briefly and redirect the user to a general assistant."})
        system_prompt = "\n\n".join(
            [
                "You are an AI recruitment workbench assistant. Reply in concise Chinese. Only handle recruitment-related requests such as positions, JDs, candidates, screening, interview questions, offers, skills, model settings, and recruitment email workflows. If the user asks for unrelated topics such as weather, finance, or general trivia, politely refuse and remind them that this workspace only serves recruitment operations. When the user asks about screening or interview quality, make the active skills and hard constraints explicit.",
                self._build_chat_skill_system_prompt(used_skill_snapshots),
            ]
        ).strip()
        log_row = self._create_ai_task_log("chat_orchestrator", created_by=user_id, related_position_id=current_context.get("position_id"), related_candidate_id=current_context.get("candidate_id"), related_skill_ids=related_skill_ids, related_skill_snapshots=used_skill_snapshots, request_hash=self._build_request_hash("chat_orchestrator", user_id, message, current_context))
        first_delta_at: Optional[float] = None

        def _handle_delta(chunk: str) -> None:
            nonlocal first_delta_at
            self._raise_if_cancelled(cancel_control)
            if first_delta_at is None:
                first_delta_at = time.perf_counter()
            on_delta(chunk)

        try:
            self._raise_if_cancelled(cancel_control)
            self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(prompt, 600), output_summary="正在生成对话回复")
            task = self.ai_gateway.stream_text(task_type="chat_orchestrator", system_prompt=system_prompt, user_prompt=prompt, on_delta=_handle_delta, cancel_control=cancel_control)
            self._raise_if_cancelled(cancel_control)
            content = task.get("content") or {}
            reply = str(content.get("markdown") or "").strip() or "我可以帮你处理招聘工作台中的岗位、候选人、Skills、初筛、面试题、模型配置和招聘邮件。如果你需要非招聘问题，请到通用助手处理。"
            finished_log = self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), full_request_snapshot=task.get("full_request_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot={"reply": reply}, error_message=task.get("error_message"), token_usage=task.get("token_usage"), related_skill_ids=related_skill_ids, related_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": finished_log.id, "memory_source": "manual", "model_provider": task.get("provider"), "model_name": task.get("model_name"), "used_skill_ids": related_skill_ids, "used_skills": used_skill_snapshots, "used_fallback": bool(task.get("used_fallback")), "fallback_error": task.get("error_message"), "timing": {"service_started_at_ms": int(started_at * 1000), "first_model_delta_at_ms": int(first_delta_at * 1000) if first_delta_at is not None else None, "completed_at_ms": int(time.perf_counter() * 1000), "time_to_first_delta_ms": int((first_delta_at - started_at) * 1000) if first_delta_at is not None else None}}
        except RecruitmentTaskCancelled:
            self.db.rollback()
            self._mark_ai_task_cancelled(log_row.id, actor_id=user_id, reason="任务已被用户停止，对话回复未继续生成。")
            raise
        except Exception as exc:
            self.db.rollback()
            fallback_reply = "我可以帮你处理招聘工作台中的岗位、候选人、Skills、初筛、面试题、模型配置和招聘邮件。如果你需要非招聘问题，请到通用助手处理。"
            self._stream_plain_text(fallback_reply, on_delta, cancel_control=cancel_control)
            finished_log = self._finish_ai_task_log(log_row, status="fallback", provider=resolved.provider, model_name=resolved.model_name, prompt_snapshot=f"SYSTEM:\n{system_prompt}\n\nUSER:\n{prompt}", full_request_snapshot=None, input_summary=truncate_text(prompt, 600), output_summary=truncate_text(fallback_reply, 600), output_snapshot={"reply": fallback_reply}, error_message=str(exc), related_skill_ids=related_skill_ids, related_skill_snapshots=used_skill_snapshots)
            return {"reply": fallback_reply, "context": current_context, "actions": [], "log_id": finished_log.id, "memory_source": "manual", "model_provider": resolved.provider, "model_name": resolved.model_name, "used_skill_ids": related_skill_ids, "used_skills": used_skill_snapshots, "used_fallback": True, "fallback_error": str(exc), "timing": {"service_started_at_ms": int(started_at * 1000), "completed_at_ms": int(time.perf_counter() * 1000)}}

    def _run_generic_chat_task(self, task_id: int, user_id: str, user_name: str, message: str, current_context: Dict[str, Any], used_skill_snapshots: Sequence[Dict[str, Any]], cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        log_row = self._get_ai_task_log_row(task_id)
        related_skill_ids = self._extract_related_skill_ids(used_skill_snapshots)
        prompt = json_dumps_safe({"user": user_name, "message": message, "context": current_context, "guardrail": "Only handle recruitment-related requests. Refuse unrelated queries briefly and redirect the user to a general assistant."})
        system_prompt = "\n\n".join(
            [
                "You are an AI recruitment workbench assistant. Reply in concise Chinese. Only handle recruitment-related requests such as positions, JDs, candidates, screening, interview questions, offers, skills, model settings, and recruitment email workflows. If the user asks for unrelated topics such as weather, finance, or general trivia, politely refuse and remind them that this workspace only serves recruitment operations. When the user asks about screening or interview quality, make the active skills and hard constraints explicit.",
                self._build_chat_skill_system_prompt(used_skill_snapshots),
            ]
        ).strip()
        try:
            self._raise_if_cancelled(cancel_control)
            self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(prompt, 600), output_summary="正在生成对话回复")
            task = self.ai_gateway.generate_text(task_type="chat_orchestrator", system_prompt=system_prompt, user_prompt=prompt, fallback_builder=lambda: {"markdown": "我可以帮你处理招聘工作台中的岗位、候选人、Skills、初筛、面试题、模型配置和招聘邮件。如果你需要非招聘问题，请到通用助手处理。", "html": ""}, cancel_control=cancel_control)
            self._raise_if_cancelled(cancel_control)
            content = task.get("content") or {}
            reply = str(content.get("markdown") or "").strip() or "我可以帮你处理招聘工作台中的岗位、候选人、Skills、初筛、面试题、模型配置和招聘邮件。如果你需要非招聘问题，请到通用助手处理。"
            self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), full_request_snapshot=task.get("full_request_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot={"reply": reply}, error_message=task.get("error_message"), token_usage=task.get("token_usage"), related_skill_ids=related_skill_ids, related_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "manual", "model_provider": task.get("provider"), "model_name": task.get("model_name"), "used_skill_ids": related_skill_ids, "used_skills": used_skill_snapshots, "used_fallback": bool(task.get("used_fallback")), "fallback_error": task.get("error_message")}
        except RecruitmentTaskCancelled:
            self.db.rollback()
            self._mark_ai_task_cancelled(task_id, actor_id=user_id, reason="任务已被用户停止，对话回复未继续生成。")
            raise
        except Exception as exc:
            self.db.rollback()
            self._mark_ai_task_failed(task_id, str(exc))
            raise

    def start_chat(self, user_id: str, user_name: str, message: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if context is not None:
            self.update_chat_context(user_id, context.get("position_id"), context.get("skill_ids") or [], context.get("candidate_id"))
        current_context = self.get_chat_context(user_id)
        lower_message = (message or "").strip().lower()
        resolved = self.ai_gateway.resolve_config("chat_orchestrator")
        model_keywords = ["你是什么模型", "你现在是什么模型", "当前使用什么模型", "使用什么模型", "model", "provider"]
        switch_keywords = ["怎么切模型", "如何切模型", "怎么换模型", "如何换模型", "切到小米", "小米模型", "切到mimo", "mimo"]
        if any(keyword in lower_message for keyword in model_keywords):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = f"当前 AI 助手使用的模型是 {resolved.provider} / {resolved.model_name}。如果你想切换模型，可以到“管理设置 -> 模型配置”里把对应模型设为当前使用。"
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider=resolved.provider, model_name=resolved.model_name, memory_source="manual", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "manual", "model_provider": resolved.provider, "model_name": resolved.model_name, "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None, "pending": False, "task_id": None}
        if any(keyword in lower_message for keyword in switch_keywords):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = "要切换到新模型，请打开“管理设置 -> 模型配置”，找到对应任务类型下的模型，点击“设为当前使用”。系统会按 priority 从小到大路由，所以设为当前使用后，该模型会排到当前任务的最高优先级。"
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider="system", model_name="structured-router", memory_source="manual", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "manual", "model_provider": "system", "model_name": "structured-router", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None, "pending": False, "task_id": None}

        structured_response = self._handle_structured_chat_command(user_id, message, current_context)
        if structured_response is not None:
            next_context = structured_response.get("context") or current_context
            used_skill_snapshots = list(structured_response.get("used_skill_snapshots") or self._get_chat_skill_snapshots(next_context))
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=next_context, reply=structured_response["reply"], model_provider="system", model_name="structured-router", memory_source=structured_response.get("memory_source"), used_skill_snapshots=used_skill_snapshots, output_snapshot={"reply": structured_response["reply"], "actions": structured_response.get("actions") or []})
            return {"reply": structured_response["reply"], "context": next_context, "actions": structured_response.get("actions") or [], "log_id": log_row.id, "memory_source": structured_response.get("memory_source"), "model_provider": "system", "model_name": "structured-router", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None, "pending": False, "task_id": None}

        if not self._is_recruitment_related(message, current_context):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = "这里是 AI 招聘工作台助手，我只处理招聘相关任务，例如岗位、JD、Skills、候选人、初筛、面试题、Offer 和招聘邮件流转。像天气这类非招聘问题，请到通用助手里处理。"
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider="system", model_name="recruitment-guard", memory_source="guardrail", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "guardrail", "model_provider": "system", "model_name": "recruitment-guard", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None, "pending": False, "task_id": None}

        used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
        related_skill_ids = self._extract_related_skill_ids(used_skill_snapshots)
        log_row = self._create_ai_task_log("chat_orchestrator", created_by=user_id, related_position_id=current_context.get("position_id"), related_candidate_id=current_context.get("candidate_id"), related_skill_ids=related_skill_ids, related_skill_snapshots=used_skill_snapshots, request_hash=self._build_request_hash("chat_orchestrator", user_id, message, current_context))

        def _runner(control: RecruitmentTaskControl) -> None:
            db = SessionLocal()
            service = RecruitmentService(db)
            try:
                service._run_generic_chat_task(log_row.id, user_id, user_name, message, current_context, used_skill_snapshots, cancel_control=control)
            except RecruitmentTaskCancelled:
                pass
            except Exception as exc:
                db.rollback()
                try:
                    if control.is_cancelled():
                        service._mark_ai_task_cancelled(log_row.id, actor_id=user_id, reason="任务已被用户停止，对话回复未继续生成。")
                    else:
                        service._mark_ai_task_failed(log_row.id, str(exc))
                except Exception:
                    db.rollback()
                logger.exception("Background chat task %s failed", log_row.id)
            finally:
                db.close()

        self._start_background_ai_task(log_row.id, _runner)
        return {
            "reply": "",
            "context": current_context,
            "actions": [],
            "log_id": log_row.id,
            "task_id": log_row.id,
            "memory_source": None,
            "model_provider": resolved.provider,
            "model_name": resolved.model_name,
            "used_skill_ids": related_skill_ids,
            "used_skills": used_skill_snapshots,
            "used_fallback": False,
            "fallback_error": None,
            "pending": True,
        }

    def chat(self, user_id: str, user_name: str, message: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if context is not None:
            self.update_chat_context(user_id, context.get("position_id"), context.get("skill_ids") or [], context.get("candidate_id"))
        current_context = self.get_chat_context(user_id)
        lower_message = (message or "").strip().lower()
        resolved = self.ai_gateway.resolve_config("chat_orchestrator")
        model_keywords = ["你是什么模型", "你现在是什么模型", "当前使用什么模型", "使用什么模型", "model", "provider"]
        switch_keywords = ["怎么切模型", "如何切模型", "怎么换模型", "如何换模型", "切到小米", "小米模型", "切到mimo", "mimo"]
        if any(keyword in lower_message for keyword in model_keywords):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = f"当前 AI 助手使用的模型是 {resolved.provider} / {resolved.model_name}。如果你想切换模型，可以到“管理设置 -> 模型配置”里把对应模型设为当前使用。"
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider=resolved.provider, model_name=resolved.model_name, memory_source="manual", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "manual", "model_provider": resolved.provider, "model_name": resolved.model_name, "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None}
        if any(keyword in lower_message for keyword in switch_keywords):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = "要切换到新模型，请打开“管理设置 -> 模型配置”，找到对应任务类型下的模型，点击“设为当前使用”。系统会按 priority 从小到大路由，所以设为当前使用后，该模型会排到当前任务的最高优先级。"
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider="system", model_name="structured-router", memory_source="manual", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "manual", "model_provider": "system", "model_name": "structured-router", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None}

        structured_response = self._handle_structured_chat_command(user_id, message, current_context)
        if structured_response is not None:
            next_context = structured_response.get("context") or current_context
            used_skill_snapshots = list(structured_response.get("used_skill_snapshots") or self._get_chat_skill_snapshots(next_context))
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=next_context, reply=structured_response["reply"], model_provider="system", model_name="structured-router", memory_source=structured_response.get("memory_source"), used_skill_snapshots=used_skill_snapshots, output_snapshot={"reply": structured_response["reply"], "actions": structured_response.get("actions") or []})
            return {"reply": structured_response["reply"], "context": next_context, "actions": structured_response.get("actions") or [], "log_id": log_row.id, "memory_source": structured_response.get("memory_source"), "model_provider": "system", "model_name": "structured-router", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None}

        if not self._is_recruitment_related(message, current_context):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = "这里是 AI 招聘工作台助手，我只处理招聘相关任务，例如岗位、JD、Skills、候选人、初筛、面试题、Offer 和招聘邮件流转。像天气这类非招聘问题，请到通用助手里处理。"
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider="system", model_name="recruitment-guard", memory_source="guardrail", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "guardrail", "model_provider": "system", "model_name": "recruitment-guard", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots, "used_fallback": False, "fallback_error": None}

        used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
        related_skill_ids = self._extract_related_skill_ids(used_skill_snapshots)
        prompt = json_dumps_safe({"user": user_name, "message": message, "context": current_context, "guardrail": "Only handle recruitment-related requests. Refuse unrelated queries briefly and redirect the user to a general assistant."})
        log_row = self._create_ai_task_log("chat_orchestrator", created_by=user_id, related_position_id=current_context.get("position_id"), related_candidate_id=current_context.get("candidate_id"), related_skill_ids=related_skill_ids, related_skill_snapshots=used_skill_snapshots, request_hash=self._build_request_hash("chat_orchestrator", user_id, message, current_context))
        self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(prompt, 600), output_summary="正在生成对话回复")
        system_prompt = "\n\n".join(
            [
                "You are an AI recruitment workbench assistant. Reply in concise Chinese. Only handle recruitment-related requests such as positions, JDs, candidates, screening, interview questions, offers, skills, model settings, and recruitment email workflows. If the user asks for unrelated topics such as weather, finance, or general trivia, politely refuse and remind them that this workspace only serves recruitment operations. When the user asks about screening or interview quality, make the active skills and hard constraints explicit.",
                self._build_chat_skill_system_prompt(used_skill_snapshots),
            ]
        ).strip()
        task = self.ai_gateway.generate_text(task_type="chat_orchestrator", system_prompt=system_prompt, user_prompt=prompt, fallback_builder=lambda: {"markdown": "我可以帮你处理招聘工作台中的岗位、候选人、Skills、初筛、面试题、模型配置和招聘邮件。如果你需要非招聘问题，请到通用助手处理。", "html": ""})
        content = task.get("content") or {}
        reply = str(content.get("markdown") or "").strip() or "我可以帮你处理招聘工作台中的岗位、候选人、Skills、初筛、面试题、模型配置和招聘邮件。如果你需要非招聘问题，请到通用助手处理。"
        self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), full_request_snapshot=task.get("full_request_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot={"reply": reply}, error_message=task.get("error_message"), token_usage=task.get("token_usage"), related_skill_ids=related_skill_ids, related_skill_snapshots=used_skill_snapshots)
        return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "manual", "model_provider": task.get("provider"), "model_name": task.get("model_name"), "used_skill_ids": related_skill_ids, "used_skills": used_skill_snapshots, "used_fallback": bool(task.get("used_fallback")), "fallback_error": task.get("error_message")}

def run_resume_pipeline_background(candidate_id: int, resume_file_id: int, actor_id: str) -> None:
    db = SessionLocal()
    try:
        service = RecruitmentService(db)
        candidate = service._get_candidate(candidate_id)
        if resume_file_id and candidate.latest_resume_file_id != resume_file_id:
            candidate.latest_resume_file_id = resume_file_id
            db.add(candidate)
            db.commit()
        service.screen_candidate(candidate_id, actor_id, skill_ids=[], use_position_skills=True, use_candidate_memory=True)
    finally:
        db.close()
