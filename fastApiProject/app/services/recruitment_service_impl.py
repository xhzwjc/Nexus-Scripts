from __future__ import annotations

import hashlib
import json
import logging
import mimetypes
import threading
import time
from datetime import datetime, timedelta
import re
from types import SimpleNamespace
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from sqlalchemy import func, or_
from sqlalchemy.exc import DataError, SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import SessionLocal
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
from .recruitment_ai_gateway import RecruitmentAIGateway, RecruitmentAIJSONParseError, _parse_llm_json_response, get_provider_options
from .recruitment_mailer import RecruitmentMailSenderRuntime, build_resume_email, load_attachment_from_path, send_email_via_smtp
from .recruitment_prompts import INTERVIEW_QUESTION_STREAM_PREVIEW_SYSTEM_PROMPT, INTERVIEW_QUESTION_SYSTEM_PROMPT, JD_GENERATION_STREAM_PREVIEW_SYSTEM_PROMPT, JD_GENERATION_SYSTEM_PROMPT, RESUME_PARSE_SYSTEM_PROMPT, RESUME_SCORE_SYSTEM_PROMPT, RESUME_SCREENING_SYSTEM_PROMPT
from .recruitment_publish_adapters import build_publish_adapter
from .recruitment_task_control import RecruitmentTaskCancelled, RecruitmentTaskControl, recruitment_task_registry
from .recruitment_utils import CANDIDATE_STATUS_OPTIONS, DEFAULT_RULE_CONFIGS, POSITION_STATUS_OPTIONS, RECRUITMENT_UPLOAD_ROOT, build_interview_structured_fallback, build_jd_structured_fallback, detect_interview_rule_leakage, ensure_interview_html_document, extract_interview_generation_constraints, extract_keywords, extract_resume_structured_data, extract_resume_text, extract_screening_dimension_rules, infer_interview_capability_domains, isoformat_or_none, json_dumps_safe, json_loads_safe, markdown_to_html, normalize_resume_fallback_name, normalize_structured_interview, normalize_structured_jd, render_interview_html, render_interview_markdown, render_jd_markdown_source, render_publish_ready_jd, safe_file_stem, score_candidate_fallback, strip_markdown, truncate_text

KNOWN_AI_TASK_TYPES = ["jd_generation", "resume_parse", "resume_score", "interview_question_generation", "chat_orchestrator", "resume_mail_dispatch", "publish_task"]
LLM_TASK_TYPE_OPTIONS = [{"value": "default", "label": "默认模型"}, {"value": "jd_generation", "label": "JD 生成"}, {"value": "resume_parse", "label": "简历解析"}, {"value": "resume_score", "label": "简历评分"}, {"value": "interview_question_generation", "label": "面试题生成"}, {"value": "chat_orchestrator", "label": "AI 助手"}]
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
SKILL_TASK_KEYWORDS = {
    "screening": {"screening", "score", "scoring", "resume_score", "resume-screening", "初筛", "评分", "筛选"},
    "interview": {"interview", "question", "questions", "interview-question", "面试", "面试题", "出题"},
    "jd": {"jd", "job_description", "job-description", "岗位jd", "职位jd", "jd生成", "生成jd", "岗位描述", "职位描述"},
}
logger = logging.getLogger(__name__)
PROCESS_BOOTED_AT = datetime.now()

AI_TASK_LOG_PROMPT_LIMIT = 24000
AI_TASK_LOG_REQUEST_LIMIT = 120000
AI_TASK_LOG_SUMMARY_LIMIT = 12000
AI_TASK_LOG_OUTPUT_SNAPSHOT_LIMIT = 240000
AI_TASK_LOG_OUTPUT_SNAPSHOT_RETRY_LIMIT = 60000

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


def _snapshot_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json_dumps_safe(value)


def _extract_json_parse_failure_meta(exc: Exception, *, default_source: str) -> Dict[str, Any]:
    if isinstance(exc, RecruitmentAIJSONParseError):
        raw_response_text = str(exc.raw_response_text or "").strip()
        return {
            "primary_model_call_succeeded": bool(raw_response_text),
            "final_response_source": "screening_json_parse_failed" if default_source == "screening_request_failed" else "score_json_parse_failed",
            "screening_result_state": "json_parse_failed",
            "raw_response_text": raw_response_text,
            "output_summary": truncate_text(raw_response_text, 600) if raw_response_text else "AI screening JSON 解析失败",
        }
    return {
        "primary_model_call_succeeded": False,
        "final_response_source": default_source,
        "screening_result_state": "request_failed",
        "raw_response_text": None,
        "output_summary": "AI screening JSON 解析失败",
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


def sanitize_dimensions(value: Any, schema_config: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    allowed_fields = tuple(schema_config.get("dimension_fields") or ())
    result: List[Dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        evidence_value = item.get("evidence")
        if isinstance(evidence_value, list):
            evidence = "；".join(sanitize_string_list(evidence_value))
        else:
            evidence = sanitize_string(evidence_value)
        normalized: Dict[str, Any] = {
            "label": sanitize_string(item.get("label")),
            "score": sanitize_number(item.get("score"), default=0.0),
            "max_score": sanitize_number(item.get("max_score"), default=0.0),
            "reason": sanitize_string(item.get("reason")),
            "evidence": evidence,
            "is_inferred": item.get("is_inferred") is True,
        }
        sanitized = {key: normalized.get(key) for key in allowed_fields}
        if _is_meaningful_sanitized_value(sanitized.get("label")):
            result.append(sanitized)
    return result


def _sanitize_screening_payload_structure(payload: Any, schema_config: Dict[str, Any]) -> Dict[str, Any]:
    parsed_resume_config = schema_config.get("parsed_resume") or {}
    score_config = schema_config.get("score") or {}
    source_payload = payload if isinstance(payload, dict) else {}
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
    sanitized_score["dimensions"] = sanitize_dimensions(score_payload.get("dimensions"), score_config)

    return {
        "parsed_resume": sanitized_parsed_resume,
        "score": sanitized_score,
    }


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
        # 自动修正：用 dimensions 求和值覆盖 total_score 和 match_percent
        score_payload["total_score"] = round(dimension_total, 1)
        corrected_match = round(dimension_total * 10)
        score_payload["match_percent"] = corrected_match
        total_score = _parse_score_number(score_payload.get("total_score"))
        match_percent = _parse_score_number(score_payload.get("match_percent"))
    if total_score is not None and match_percent is not None:
        expected_match_percent = round((total_score * 10) + 1e-9, 1)
        if abs(match_percent - expected_match_percent) > 0.1:
            warnings.append(f"score.match_percent 与 total_score * 10 不一致：当前为 {match_percent:.1f}，按总分应为 {expected_match_percent:.1f}。")
            score_payload["match_percent"] = expected_match_percent
            match_percent = _parse_score_number(score_payload.get("match_percent"))

    current_status = _normalize_suggested_status(score_payload.get("suggested_status"))
    core_gap_labels = [
        label
        for label in PRIMARY_CORE_DIMENSION_LABELS
        if not any(
            isinstance(item, dict)
            and str(item.get("label") or "").strip() == label
            and (_parse_score_number(item.get("score")) or 0.0) > 0
            for item in dimensions
        )
    ]
    status_thresholds = score_config.get("status_thresholds") or {}
    derived_recommendation, derived_status = _derive_screening_decision_from_score(
        match_percent=score_payload.get("match_percent"),
        total_score=score_payload.get("total_score"),
        missing_core_labels=core_gap_labels,
        pass_threshold=_parse_score_number(status_thresholds.get("pass_threshold")) or 75.0,
        pool_threshold=_parse_score_number(status_thresholds.get("pool_threshold")) or 55.0,
    )
    if current_status and derived_status and current_status != derived_status:
        warnings.append(
            f"score.suggested_status 与修正后的分数/核心维度规则不一致：当前为 {current_status}，按最终分数应为 {derived_status}。"
        )
        score_payload["suggested_status"] = derived_status
        current_status = derived_status

    current_recommendation = _compact_recommendation(score_payload.get("recommendation"))
    if current_status and derived_status and current_status == derived_status and derived_recommendation:
        if current_recommendation != derived_recommendation and not _recommendation_matches_status(current_status, current_recommendation):
            warnings.append("score.recommendation 与修正后的 suggested_status 不一致，已按最终状态同步修正。")
            score_payload["recommendation"] = derived_recommendation

    for field, allowed_values in (score_config.get("enum_fields") or {}).items():
        value = str(score_payload.get(field) or "").strip()
        if value and value not in set(allowed_values):
            warnings.append(f"score.{field} 不在合法枚举内。")
        if not value:
            warnings.append(f"score.{field} 缺失或无效。")

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

    return warnings[:12]


def sanitize_screening_payload(payload: Any, schema_config: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    sanitized_payload = _sanitize_screening_payload_structure(payload, schema_config)
    warnings = _validate_screening_payload_warnings(sanitized_payload, schema_config)
    return sanitized_payload, {"warnings": warnings}


def sanitize_screening_score_payload(payload: Any, schema_config: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    score_payload = _extract_model_score_payload(payload)
    sanitized_wrapper, meta = sanitize_screening_payload({"parsed_resume": {}, "score": score_payload}, schema_config)
    return sanitized_wrapper.get("score") or {}, meta


def _build_screening_schema_config(
    skill_snapshots: Sequence[Dict[str, Any]],
    *,
    status_rules: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    dimension_rules = extract_screening_dimension_rules(skill_snapshots, limit=32)
    required_dimension_labels = tuple(
        str(item.get("label") or "").strip()
        for item in dimension_rules
        if isinstance(item, dict) and str(item.get("label") or "").strip()
    )
    normalized_status_rules = status_rules if isinstance(status_rules, dict) else {}
    return {
        "parsed_resume": dict(SCREENING_PAYLOAD_SCHEMA_CONFIG.get("parsed_resume") or {}),
        "score": {
            **dict(SCREENING_PAYLOAD_SCHEMA_CONFIG.get("score") or {}),
            "required_dimension_labels": required_dimension_labels,
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


def _derive_screening_decision_from_score(
    *,
    match_percent: Any,
    total_score: Any,
    missing_core_labels: Sequence[Any],
    pass_threshold: float = 75,
    pool_threshold: float = 55,
) -> Tuple[Optional[str], Optional[str]]:
    normalized_match_percent = _parse_score_number(match_percent)
    normalized_total_score = _parse_score_number(total_score)
    if normalized_match_percent is None and normalized_total_score is not None:
        normalized_match_percent = round(normalized_total_score * 10, 1)
    if normalized_match_percent is None:
        return None, None

    normalized_missing_core_labels = [
        str(item or "").strip()
        for item in missing_core_labels
        if str(item or "").strip()
    ]
    both_primary_cores_missing = all(
        core in normalized_missing_core_labels
        for core in ["智能家居生态", "IoT通信协议"]
    )
    if both_primary_cores_missing:
        return "建议本次不安排面试", "screening_rejected"
    if normalized_match_percent >= pass_threshold and not normalized_missing_core_labels:
        return "建议安排首面", "screening_passed"
    if normalized_match_percent >= pool_threshold:
        return (
            "建议安排面试进一步评估" if normalized_missing_core_labels else "建议保留观察",
            "talent_pool",
        )
    return "建议本次不安排面试", "screening_rejected"


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


def _extract_model_score_payload(content: Any) -> Dict[str, Any]:
    payload = content if isinstance(content, dict) else {}
    if isinstance(payload.get("score"), dict):
        payload = payload.get("score") or {}
    return payload if isinstance(payload, dict) else {}


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


def _derive_score_metrics_from_dimensions(value: Any) -> Tuple[Optional[float], Optional[float]]:
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
    match_percent = round((total_score * 10) + 1e-9, 1)
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
        expected_match_percent = round((normalized_total_score * 10) + 1e-9, 1)
        if abs(normalized_match_percent - expected_match_percent) > 0.5:
            warnings.append(
                f"标准化后的 match_percent 与 total_score * 10 不一致：当前为 {normalized_match_percent:.1f}，按总分应为 {expected_match_percent:.1f}。"
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
        "dimensions": _normalize_score_dimensions(score_enhancements.get("dimensions"), limit=12),
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
        "dimensions": normalized_dimensions,
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
            "dimensions": _normalize_score_dimensions(score_enhancements.get("dimensions"), limit=12),
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
    if score <= 0:
        missing_templates = {
            "智能家居生态": "简历未提及米家、鸿蒙、HomeKit、涂鸦等生态联动测试经历",
            "IoT通信协议": "简历未提及 Wi-Fi、BLE、ZigBee、Thread、MQTT、星闪等协议测试经验",
            "软件测试基础": "简历未明确体现软件测试基础能力",
            "嵌入式/固件经验": "简历未提及嵌入式、固件或 OTA 相关经验",
            "硬件测试经验": "简历未明确体现硬件测试场景",
            "自动化测试": "简历未明确提及自动化测试工具或脚本经验",
            "学历/专业匹配": "简历未提供足够的学历或专业匹配信息",
            "文档输出能力": "简历未明确体现测试报告或用例文档输出能力",
            "加分项": "简历未体现明显的岗位加分项",
        }
        return missing_templates.get(label, "简历未提及")
    positive_templates = {
        "智能家居生态": "简历体现了智能家居生态或设备联动相关经历",
        "IoT通信协议": "简历体现了通信协议或连接场景相关测试经历",
        "软件测试基础": "简历体现了测试设计、问题定位和缺陷闭环能力",
        "嵌入式/固件经验": "简历包含固件、升级或相关测试场景表述",
        "硬件测试经验": "简历体现了较长期的硬件测试背景和多类测试场景",
        "自动化测试": "简历体现了自动化测试或测试效率改进相关经验",
        "学历/专业匹配": "学历和专业背景与岗位要求基本匹配",
        "文档输出能力": "简历体现了测试报告、用例或指导书输出能力",
        "加分项": "简历命中了部分岗位加分项",
    }
    if max_score > 0 and score / max_score < 0.6:
        low_templates = {
            "软件测试基础": "该维度有一定证据，但深度和覆盖范围仍有限",
            "嵌入式/固件经验": "该维度有少量表述，但实际参与深度仍需核实",
            "自动化测试": "该维度有一定表述，但工具使用深度仍需核实",
            "加分项": "该维度有部分命中，但补强作用相对有限",
        }
        return low_templates.get(label, positive_templates.get(label, "简历中有该维度的相关证据"))
    return positive_templates.get(label, "简历中有该维度的相关证据")


def _build_dimension_advantage_summary(item: Dict[str, Any]) -> str:
    label = _dimension_label_for_summary(item.get("label"))
    templates = {
        "智能家居生态": "具备一定智能家居生态或联动测试相关经历。",
        "IoT通信协议": "具备一定通信协议或连接场景测试经历。",
        "软件测试基础": "具备较扎实的软件测试基础，简历体现了测试设计、问题定位和缺陷闭环能力。",
        "嵌入式/固件经验": "具备一定固件、升级链路或相关测试场景经验。",
        "硬件测试经验": "具备较长期的硬件测试背景，覆盖电源、信号、可靠性或整机场景。",
        "自动化测试": "具备自动化测试或测试效率改进相关经验。",
        "学历/专业匹配": "学历和专业背景与岗位要求基本匹配。",
        "文档输出能力": "具备测试报告、用例或指导书等文档输出能力。",
        "加分项": "具备部分岗位加分项经历，可作为补充优势。",
    }
    return templates.get(label, f"{label}方面存在一定匹配优势。")


def _build_dimension_concern_summary(item: Dict[str, Any]) -> str:
    label = _dimension_label_for_summary(item.get("label"))
    score = _parse_score_number(item.get("score")) or 0.0
    max_score = _parse_score_number(item.get("max_score")) or 0.0
    zero_templates = {
        "智能家居生态": "缺少智能家居生态联动测试的直接证据。",
        "IoT通信协议": "缺少 Wi-Fi、BLE、ZigBee、Thread、MQTT、星闪等 IoT 协议测试证据。",
        "软件测试基础": "软件测试基础证据不足，仍需核实测试设计与缺陷闭环能力。",
        "嵌入式/固件经验": "嵌入式、固件或 OTA 相关经验未明确体现。",
        "硬件测试经验": "硬件测试场景证据不足，相关深度仍需核实。",
        "自动化测试": "自动化测试工具和脚本经验未明确体现。",
        "学历/专业匹配": "学历或专业与岗位要求的匹配证据有限。",
        "文档输出能力": "测试报告、用例文档或缺陷闭环能力证据有限。",
        "加分项": "岗位加分项命中有限。",
    }
    low_templates = {
        "软件测试基础": "软件测试基础有一定证据，但覆盖范围和深度仍需继续核实。",
        "嵌入式/固件经验": "嵌入式或固件相关表述较弱，建议面试重点核实参与深度。",
        "硬件测试经验": "硬件测试经历存在，但具体问题定位深度仍需继续核实。",
        "自动化测试": "自动化测试相关表述较少，建议继续核实工具使用深度。",
        "加分项": "岗位加分项有一定命中，但补强作用相对有限。",
    }
    if score <= 0:
        return zero_templates.get(label, f"{label}方面缺少直接证据。")
    if max_score > 0 and score / max_score < 0.6:
        return low_templates.get(label, f"{label}方面匹配度偏弱，建议面试继续核实。")
    return ""


def _build_dimension_score_summaries(dimensions: Sequence[Dict[str, Any]]) -> Tuple[List[str], List[str]]:
    advantages: List[str] = []
    concerns: List[str] = []
    positive_dimensions = [item for item in dimensions if (_parse_score_number(item.get("score")) or 0.0) > 0]
    issue_dimensions = [
        item
        for item in dimensions
        if (_parse_score_number(item.get("score")) or 0.0) <= 0
        or (
            (_parse_score_number(item.get("max_score")) or 0.0) > 0
            and ((_parse_score_number(item.get("score")) or 0.0) / (_parse_score_number(item.get("max_score")) or 1.0)) < 0.6
        )
    ]
    positive_dimensions.sort(key=lambda item: ((_parse_score_number(item.get("score")) or 0.0), (_parse_score_number(item.get("max_score")) or 0.0)), reverse=True)
    for item in positive_dimensions:
        summary = _build_dimension_advantage_summary(item)
        if summary and summary not in advantages:
            advantages.append(summary)
        if len(advantages) >= 4:
            break
    for item in issue_dimensions:
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


def _extract_parse_quality_warnings(parsed_payload: Dict[str, Any]) -> List[str]:
    warnings: List[str] = []
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
    return warnings


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
        content = skill.content
    elif isinstance(skill, dict):
        skill_code = str(skill.get("skill_code") or "").strip().lower()
        name = str(skill.get("name") or "").strip().lower()
        tags = skill.get("tags") or []
        content = skill.get("content")
    else:
        skill_code = ""
        name = str(skill or "").strip().lower()
        tags = []
        content = ""
    tag_texts = [str(item or "").strip() for item in tags if str(item or "").strip()]
    frontmatter = _parse_skill_frontmatter(content)
    group = str(frontmatter.get("skill_group") or frontmatter.get("group") or "").strip()
    for tag in tag_texts:
        if not group and tag.lower().startswith("group:"):
            group = tag.split(":", 1)[1].strip()
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
    return {"tasks": tasks, "group": group}


def _extract_skill_task_types(skill: Any) -> List[str]:
    return list(_extract_skill_runtime_meta(skill).get("tasks") or [])


def _resume_item_to_report_text(item: Any) -> str:
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
            text = strip_markdown(str(item.get(key) or "")).strip()
            text = re.sub(r"\s+", " ", text)
            if text and text not in values:
                values.append(text)
        if not values:
            for value in item.values():
                text = strip_markdown(str(value or "")).strip()
                text = re.sub(r"\s+", " ", text)
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
            text = strip_markdown(str(value or "")).strip()
            text = re.sub(r"\s+", " ", text)
            if text:
                cleaned[str(key)] = text
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


def _is_valid_work_resume_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    company = str(item.get("company_name") or item.get("company") or "").strip()
    position = str(item.get("position") or item.get("title") or "").strip()
    duration = str(item.get("duration") or "").strip()
    if not company or company in {"至今", "现在", "今"}:
        return False
    if company.isdigit() or len(company) < 3:
        return False
    if re.fullmatch(r"[\d.\-~至今现在 ]+", company):
        return False
    if re.search(r"(Cadence|PADS|Protel|OrCAD|PCB)", company, re.IGNORECASE):
        return False
    if "查看原理图" in company or "测试方案" in company:
        return False
    if not any(keyword in company for keyword in ["公司", "有限公司", "集团", "科技", "软件", "中心", "研究院", "通信", "电子", "股份"]):
        return False
    if duration and not re.search(r"(?:19|20)\d{2}", duration):
        return False
    if position and (
        len(position) > 28
        or re.search(r"(主要负责|测试执行|项目交付|实验室设备管理|负责.+测试|负责.+开发)", position)
    ):
        return False
    if not duration and not position:
        return False
    return True


def _is_valid_education_resume_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    school = str(item.get("school") or "").strip()
    degree = str(item.get("degree") or "").strip()
    major = str(item.get("major") or "").strip()
    if any(keyword in school for keyword in ["英语四级", "英语六级", "普通话", "证书", "荣誉", "资格证"]):
        return False
    return bool(school or degree or major)


def _is_valid_project_resume_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    project_name = str(item.get("project_name") or item.get("name") or "").strip()
    if not project_name or project_name in {"项目经历", "项目经验", "项目名称"}:
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
) -> List[Any]:
    result: List[Any] = []
    seen_signatures: List[str] = []
    primary_collection = primary_items if isinstance(primary_items, list) else []
    secondary_collection = secondary_items if isinstance(secondary_items, list) else []
    for collection, should_check_support in [(primary_collection, False), (secondary_collection, True)]:
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


def _sanitize_resume_basic_info(ai_basic_info: Any, fallback_basic_info: Any, raw_text: str) -> Dict[str, Any]:
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
    return fallback


def _sanitize_ai_parsed_resume(parsed_resume: Dict[str, Any], raw_text: str, fallback_name: str) -> Dict[str, Any]:
    normalized = _normalize_resume_parse_payload(parsed_resume)
    raw_based = _normalize_resume_parse_payload(extract_resume_structured_data(raw_text, fallback_name))
    work_experiences = _sanitize_resume_list(
        raw_based.get("work_experiences"),
        raw_text,
        normalized.get("work_experiences"),
        limit=8,
        validator=_is_valid_work_resume_item,
    )
    education_experiences = _sanitize_resume_list(
        raw_based.get("education_experiences"),
        raw_text,
        normalized.get("education_experiences"),
        limit=6,
        validator=_is_valid_education_resume_item,
    )
    work_experiences, education_experiences = _reconcile_resume_sections(work_experiences, education_experiences)
    return {
        "basic_info": _sanitize_resume_basic_info(normalized.get("basic_info"), raw_based.get("basic_info"), raw_text),
        "work_experiences": work_experiences,
        "education_experiences": education_experiences,
        "skills": _sanitize_resume_list(normalized.get("skills"), raw_text, raw_based.get("skills"), limit=20, allow_short=True),
        "projects": _sanitize_resume_list(
            raw_based.get("projects"),
            raw_text,
            normalized.get("projects"),
            limit=6,
            validator=_is_valid_project_resume_item,
        ),
        "summary": raw_based.get("summary") or normalized.get("summary") or "",
        "raw_text": raw_text,
    }


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
PRIMARY_CORE_DIMENSION_LABELS = ("智能家居生态", "IoT通信协议")
SCREENING_DIMENSION_KEYWORDS = {
    "智能家居生态": ["米家", "鸿蒙", "homekit", "涂鸦", "智能家居", "生态链", "联动"],
    "IoT通信协议": ["wi-fi", "wifi", "ble", "zigbee", "thread", "mqtt", "星闪", "蓝牙", "uwb"],
    "软件测试基础": ["测试用例", "测试报告", "问题定位", "问题追踪", "测试方案", "性能测试", "功能测试", "SOP"],
    "嵌入式/固件经验": ["ota", "固件", "烧录", "串口", "升级"],
    "硬件测试经验": ["硬件测试", "电源测试", "信号类测试", "可靠性测试", "ESD", "EMC", "整机测试", "PCBA"],
    "自动化测试": ["自动化", "ATE", "python", "appium", "selenium", "脚本"],
    "学历/专业匹配": ["本科", "硕士", "博士", "电子信息工程", "计算机", "自动化", "软件工程", "通信"],
    "文档输出能力": ["测试报告", "测试用例", "SOP", "指导书", "报告模板", "根本原因的报告"],
    "加分项": ["小米", "华为", "海尔", "美的", "linux", "shell", "功耗", "射频", "ci/cd", "istqb", "slb", "ai"],
}
SCREENING_STATUS_RECOMMENDATIONS = {
    "screening_passed": "建议安排首轮面试",
    "talent_pool": "建议进入人才库，后续有更匹配岗位再跟进",
    "screening_rejected": "建议本次不安排面试",
}


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

    for token in SCREENING_DIMENSION_KEYWORDS.get(label, []):
        push(token)
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
    text = str(recommendation or "").strip()
    if not normalized_status or not text:
        return False
    if normalized_status == "screening_rejected":
        return bool(re.search(r"(不安排|不通过|淘汰|拒绝|不建议)", text))
    if normalized_status == "talent_pool":
        return bool(re.search(r"(人才库|保留|观察|后续有更匹配岗位再跟进|后续跟进)", text))
    return bool(re.search(r"(安排|建议).{0,8}(面试|首面|首轮)", text))


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

    for warning in _normalize_score_warning_items(validation_warnings, limit=8):
        if (
            warning.startswith("score.dimensions 缺失或为空")
            or warning.startswith("score.dimensions 缺少维度")
            or warning.startswith("score.suggested_status 缺失或无效")
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


def _build_raw_screening_storage_payload(
    *,
    score_payload: Dict[str, Any],
    score_source: str,
    primary_model_call_succeeded: bool,
    fallback_score_only_ai_called: bool,
    final_response_source: str,
    validation_warnings: Optional[Sequence[Any]] = None,
) -> Dict[str, Any]:
    normalized_validation_warnings = _normalize_score_warning_items(validation_warnings, limit=8)
    return {
        "_storage_format": RAW_SCREENING_SCORE_STORAGE_FORMAT,
        "score": score_payload,
        "debug": {
            "score_source": str(score_source or "").strip() or None,
            "primary_model_call_succeeded": bool(primary_model_call_succeeded),
            "fallback_score_only_ai_called": bool(fallback_score_only_ai_called),
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


class RecruitmentService:
    def __init__(self, db: Session):
        self.db = db
        self.ai_gateway = RecruitmentAIGateway(db)

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

    def _mark_ai_task_cancelled(self, task_id: int, *, actor_id: Optional[str] = None, reason: Optional[str] = None) -> None:
        row = self._get_ai_task_log_row(task_id)
        row.status = "cancelled"
        row.error_message = _truncate_utf8_text(reason or "任务已被用户停止。", 12000)
        row.output_summary = _truncate_utf8_text("已停止生成", 12000)
        if actor_id:
            row.created_by = row.created_by or actor_id
        self._commit_ai_task_log(row)

    def _mark_ai_task_failed(self, task_id: int, message: str) -> None:
        row = self._get_ai_task_log_row(task_id)
        if row.status == "cancelled":
            return
        row.status = "failed"
        row.error_message = _truncate_utf8_text(message, 12000)
        self._commit_ai_task_log(row)

    def _settle_orphaned_cancelling_task(self, row: RecruitmentAITaskLog) -> bool:
        if row.status != "cancelling":
            return False
        if recruitment_task_registry.get(row.id):
            return False
        row.status = "cancelled"
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
        stale_before = datetime.now() - timedelta(minutes=30)
        return checkpoint < stale_before

    def _settle_orphaned_live_task(self, row: RecruitmentAITaskLog) -> bool:
        if self._settle_orphaned_cancelling_task(row):
            return True
        if not self._is_orphaned_live_task(row):
            return False
        row.status = "failed"
        row.error_message = _truncate_utf8_text(
            row.error_message or "任务执行上下文已丢失，系统已自动标记为失败。",
            12000,
        )
        row.output_summary = _truncate_utf8_text(
            "AI 初筛任务执行已中断，系统已自动标记为失败。",
            12000,
        )
        self.db.add(row)
        if row.task_type == "resume_score" and row.related_candidate_id:
            candidate = self.db.query(RecruitmentCandidate).filter(
                RecruitmentCandidate.id == row.related_candidate_id,
                RecruitmentCandidate.deleted.is_(False),
            ).first()
            if candidate:
                self._mark_candidate_screening_failed_if_needed(
                    candidate,
                    actor_id=row.created_by or "system",
                    reason="AI 初筛任务中断，请重新发起初筛。",
                    source="ai_screening_orphaned",
                )
                self.db.add(candidate)
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

    def _get_position(self, position_id: int) -> RecruitmentPosition:
        row = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == position_id, RecruitmentPosition.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        return row

    def _get_candidate(self, candidate_id: int) -> RecruitmentCandidate:
        row = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == candidate_id, RecruitmentCandidate.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        return row

    def _get_skill(self, skill_id: int) -> RecruitmentSkill:
        row = self.db.query(RecruitmentSkill).filter(RecruitmentSkill.id == skill_id, RecruitmentSkill.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        return row

    def _get_resume_file(self, resume_file_id: int) -> RecruitmentResumeFile:
        row = self.db.query(RecruitmentResumeFile).filter(RecruitmentResumeFile.id == resume_file_id).first()
        if not row:
            raise ValueError("绠€鍘嗘枃浠朵笉瀛樺湪")
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
            RecruitmentAITaskLog.task_type.in_(["resume_parse", "resume_score"]),
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
        row = RecruitmentCandidateWorkflowMemory(candidate_id=candidate.id, position_id=candidate.position_id, screening_skill_ids_json=json_dumps_safe([]), interview_skill_ids_json=json_dumps_safe([]), created_by=actor_id, updated_by=actor_id)
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
        order_map = {skill_id: index for index, skill_id in enumerate(normalized)}
        rows.sort(key=lambda item: order_map.get(item.id, 9999))
        return rows

    def _load_enabled_skills(self) -> List[RecruitmentSkill]:
        return self.db.query(RecruitmentSkill).filter(RecruitmentSkill.deleted.is_(False), RecruitmentSkill.is_enabled.is_(True)).order_by(RecruitmentSkill.sort_order.asc(), RecruitmentSkill.id.asc()).all()

    def _filter_skill_rows_for_task(self, skill_rows: Sequence[RecruitmentSkill], task_kind: str) -> List[RecruitmentSkill]:
        rows = list(skill_rows or [])
        if not rows:
            return []
        matched = [row for row in rows if task_kind in _extract_skill_task_types(row)]
        return matched or rows

    def _find_related_task_skill_rows(self, skill_rows: Sequence[RecruitmentSkill], task_kind: str) -> List[RecruitmentSkill]:
        rows = list(skill_rows or [])
        if not rows:
            return []
        target_groups = {
            str((_extract_skill_runtime_meta(row).get("group") or "")).strip()
            for row in rows
            if str((_extract_skill_runtime_meta(row).get("group") or "")).strip()
        }
        if not target_groups:
            return []
        matched: List[RecruitmentSkill] = []
        seen_ids: set[int] = set()
        for row in self._load_enabled_skills():
            meta = _extract_skill_runtime_meta(row)
            group = str(meta.get("group") or "").strip()
            if group and group in target_groups and task_kind in (meta.get("tasks") or []) and row.id not in seen_ids:
                matched.append(row)
                seen_ids.add(row.id)
        return matched

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
        self.db.add(RecruitmentCandidateStatusHistory(candidate_id=candidate.id, from_status=candidate.status, to_status=to_status, reason=reason or None, changed_by=actor_id, source=source))
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
        if candidate.status != "pending_screening":
            return
        self._create_status_history(
            candidate,
            "screening_failed",
            reason,
            actor_id,
            source,
        )

    def _create_ai_task_log(self, task_type: str, *, created_by: str, related_position_id: Optional[int] = None, related_candidate_id: Optional[int] = None, related_skill_ids: Optional[Iterable[Any]] = None, related_skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None, related_resume_file_id: Optional[int] = None, related_publish_task_id: Optional[int] = None, memory_source: Optional[str] = None, request_hash: Optional[str] = None) -> RecruitmentAITaskLog:
        row = RecruitmentAITaskLog(task_type=task_type, related_position_id=related_position_id, related_candidate_id=related_candidate_id, related_skill_id=None, related_skill_ids_json=json_dumps_safe(_dedupe_ints(related_skill_ids or [])), related_skill_snapshots_json=json_dumps_safe(list(related_skill_snapshots or [])), related_resume_file_id=related_resume_file_id, related_publish_task_id=related_publish_task_id, memory_source=memory_source, request_hash=request_hash, status="pending", created_by=created_by)
        self.db.add(row)
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

    def _update_ai_task_log(self, row: RecruitmentAITaskLog, *, status: Optional[str] = None, prompt_snapshot: Optional[str] = None, full_request_snapshot: Optional[Any] = None, input_summary: Optional[str] = None, output_summary: Optional[str] = None, output_snapshot: Optional[Any] = None, error_message: Optional[str] = None) -> RecruitmentAITaskLog:
        try:
            self.db.refresh(row)
        except Exception:
            pass
        if row.status == "cancelled" and status not in {None, "cancelled"}:
            return row
        if status is not None:
            row.status = status
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
        return self._commit_ai_task_log(row)

    def _finish_ai_task_log(self, row: RecruitmentAITaskLog, *, status: str, provider: Optional[str] = None, model_name: Optional[str] = None, prompt_snapshot: Optional[str] = None, full_request_snapshot: Optional[Any] = None, input_summary: Optional[str] = None, output_summary: Optional[str] = None, output_snapshot: Optional[Any] = None, error_message: Optional[str] = None, token_usage: Optional[Dict[str, Any]] = None, memory_source: Optional[str] = None, related_skill_ids: Optional[Iterable[Any]] = None, related_skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None) -> RecruitmentAITaskLog:
        try:
            self.db.refresh(row)
        except Exception:
            pass
        if row.status == "cancelled":
            return row
        row.status = status
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
        if related_skill_ids is not None:
            row.related_skill_ids_json = json_dumps_safe(_dedupe_ints(related_skill_ids))
        if related_skill_snapshots is not None:
            row.related_skill_snapshots_json = json_dumps_safe(list(related_skill_snapshots))
        return self._commit_ai_task_log(row)

    def _serialize_skill(self, row: RecruitmentSkill) -> Dict[str, Any]:
        return {"id": row.id, "skill_code": row.skill_code, "name": row.name, "description": row.description, "content": row.content, "tags": json_loads_safe(row.tags_json, []), "sort_order": row.sort_order, "is_enabled": bool(row.is_enabled), "created_by": row.created_by, "updated_by": row.updated_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _serialize_skill_snapshot(self, skill: Any, fallback_index: int = 0) -> Dict[str, Any]:
        if isinstance(skill, dict):
            tags = skill.get("tags") or []
            return {
                "id": int(skill.get("id") or (-(fallback_index + 1))),
                "skill_code": str(skill.get("skill_code") or f"snapshot-{fallback_index + 1}"),
                "name": str(skill.get("name") or f"Skill #{fallback_index + 1}"),
                "description": skill.get("description"),
                "content": str(skill.get("content") or ""),
                "tags": tags if isinstance(tags, list) else [],
                "sort_order": int(skill.get("sort_order") or 999),
                "is_enabled": bool(skill.get("is_enabled", True)),
            }
        if isinstance(skill, RecruitmentSkill):
            return {
                "id": skill.id,
                "skill_code": skill.skill_code,
                "name": skill.name,
                "description": skill.description,
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
        if not row.created_at or not row.updated_at:
            return None
        delta = row.updated_at - row.created_at
        duration_ms = int(delta.total_seconds() * 1000)
        if duration_ms < 0:
            return None
        return duration_ms

    def _serialize_ai_task_log(self, row: RecruitmentAITaskLog, *, include_full_request_snapshot: bool = False) -> Dict[str, Any]:
        payload = {"id": row.id, "task_type": row.task_type, "related_position_id": row.related_position_id, "related_candidate_id": row.related_candidate_id, "related_skill_id": row.related_skill_id, "related_skill_ids": json_loads_safe(row.related_skill_ids_json, []), "related_skill_snapshots": json_loads_safe(row.related_skill_snapshots_json, []), "related_resume_file_id": row.related_resume_file_id, "related_publish_task_id": row.related_publish_task_id, "memory_source": row.memory_source, "request_hash": row.request_hash, "model_provider": row.model_provider, "model_name": row.model_name, "prompt_snapshot": row.prompt_snapshot, "input_summary": row.input_summary, "output_summary": row.output_summary, "output_snapshot": row.output_snapshot, "duration_ms": self._calculate_ai_task_duration_ms(row), "status": row.status, "error_message": row.error_message, "token_usage": json_loads_safe(row.token_usage_json, None), "created_by": row.created_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}
        if include_full_request_snapshot:
            payload["full_request_snapshot"] = row.full_request_snapshot
        return payload

    def _serialize_jd_version(self, row: RecruitmentJDVersion) -> Dict[str, Any]:
        return {"id": row.id, "position_id": row.position_id, "version_no": row.version_no, "title": row.title, "prompt_snapshot": row.prompt_snapshot, "jd_markdown": row.jd_markdown or "", "jd_html": row.jd_html, "publish_text": row.publish_text, "notes": row.notes, "is_active": bool(row.is_active), "created_by": row.created_by, "created_at": isoformat_or_none(row.created_at)}

    def _serialize_publish_task(self, row: RecruitmentPublishTask) -> Dict[str, Any]:
        return {"id": row.id, "position_id": row.position_id, "target_platform": row.target_platform, "mode": row.mode, "adapter_code": row.adapter_code, "status": row.status, "request_payload": json_loads_safe(row.request_payload, None), "response_payload": json_loads_safe(row.response_payload, None), "published_url": row.published_url, "screenshot_path": row.screenshot_path, "retry_count": row.retry_count, "error_message": row.error_message, "created_by": row.created_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _serialize_position(self, row: RecruitmentPosition) -> Dict[str, Any]:
        jd_skill_rows = self._get_position_task_skill_rows(row.id, "jd")
        screening_skill_rows = self._get_position_task_skill_rows(row.id, "screening")
        interview_skill_rows = self._get_position_task_skill_rows(row.id, "interview")
        current_jd = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.id == row.current_jd_version_id).first() if row.current_jd_version_id else None
        if not current_jd:
            current_jd = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == row.id, RecruitmentJDVersion.is_active.is_(True)).order_by(RecruitmentJDVersion.version_no.desc(), RecruitmentJDVersion.id.desc()).first()
        jd_version_count = self.db.query(func.count(RecruitmentJDVersion.id)).filter(RecruitmentJDVersion.position_id == row.id).scalar() or 0
        candidate_count = self.db.query(func.count(RecruitmentCandidate.id)).filter(RecruitmentCandidate.position_id == row.id, RecruitmentCandidate.deleted.is_(False)).scalar() or 0
        return {"id": row.id, "position_code": row.position_code, "title": row.title, "department": row.department, "location": row.location, "employment_type": row.employment_type, "salary_range": row.salary_range, "headcount": row.headcount, "key_requirements": row.key_requirements, "bonus_points": row.bonus_points, "summary": row.summary, "status": row.status, "auto_screen_on_upload": bool(row.auto_screen_on_upload), "auto_advance_on_screening": bool(row.auto_advance_on_screening), "jd_skill_ids": [skill.id for skill in jd_skill_rows], "jd_skills": [self._serialize_skill(skill) for skill in jd_skill_rows], "screening_skill_ids": [skill.id for skill in screening_skill_rows], "screening_skills": [self._serialize_skill(skill) for skill in screening_skill_rows], "interview_skill_ids": [skill.id for skill in interview_skill_rows], "interview_skills": [self._serialize_skill(skill) for skill in interview_skill_rows], "tags": json_loads_safe(row.tags_json, []), "current_jd_version_id": row.current_jd_version_id, "current_jd_title": current_jd.title if current_jd else None, "jd_version_count": int(jd_version_count), "candidate_count": int(candidate_count), "created_by": row.created_by, "updated_by": row.updated_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

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
        positions = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.deleted.is_(False)).all()
        candidates = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.deleted.is_(False)).all()
        recent_candidates = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.deleted.is_(False)).order_by(RecruitmentCandidate.created_at.desc(), RecruitmentCandidate.id.desc()).limit(8).all()
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
        builder = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.deleted.is_(False))
        if status:
            builder = builder.filter(RecruitmentPosition.status == status)
        if query:
            keyword = f"%{query.strip()}%"
            builder = builder.filter(or_(RecruitmentPosition.title.like(keyword), RecruitmentPosition.department.like(keyword), RecruitmentPosition.location.like(keyword), RecruitmentPosition.summary.like(keyword)))
        return [self._serialize_position(row) for row in builder.order_by(RecruitmentPosition.updated_at.desc(), RecruitmentPosition.id.desc()).all()]

    def create_position(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = RecruitmentPosition(position_code=f"TMP-{uuid.uuid4().hex[:8]}", title=str(payload.get("title") or "").strip(), department=payload.get("department"), location=payload.get("location"), employment_type=payload.get("employment_type"), salary_range=payload.get("salary_range"), headcount=int(payload.get("headcount") or 1), key_requirements=payload.get("key_requirements"), bonus_points=payload.get("bonus_points"), summary=payload.get("summary"), status=payload.get("status") or "draft", auto_screen_on_upload=bool(payload.get("auto_screen_on_upload")), auto_advance_on_screening=payload.get("auto_advance_on_screening") is not False, jd_skill_ids_json=json_dumps_safe(_dedupe_ints(payload.get("jd_skill_ids") or [])), screening_skill_ids_json=json_dumps_safe(_dedupe_ints(payload.get("screening_skill_ids") or [])), interview_skill_ids_json=json_dumps_safe(_dedupe_ints(payload.get("interview_skill_ids") or [])), tags_json=json_dumps_safe(payload.get("tags") or []), created_by=actor_id, updated_by=actor_id, deleted=False)
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
        candidates = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.position_id == row.id, RecruitmentCandidate.deleted.is_(False)).order_by(RecruitmentCandidate.updated_at.desc(), RecruitmentCandidate.id.desc()).all()
        return {"position": self._serialize_position(row), "current_jd_version": self._serialize_jd_version(current_jd) if current_jd else None, "jd_versions": [self._serialize_jd_version(item) for item in jd_versions], "jd_generation": jd_generation, "publish_tasks": [self._serialize_publish_task(item) for item in publish_tasks], "candidates": [self._serialize_candidate_summary(item) for item in candidates]}

    def list_skills(self) -> List[Dict[str, Any]]:
        return [self._serialize_skill(row) for row in self.db.query(RecruitmentSkill).filter(RecruitmentSkill.deleted.is_(False)).order_by(RecruitmentSkill.sort_order.asc(), RecruitmentSkill.id.asc()).all()]

    def create_skill(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = RecruitmentSkill(skill_code=f"skill-{_slugify(str(payload.get('name') or 'skill'))}-{uuid.uuid4().hex[:4]}", name=str(payload.get("name") or "").strip(), description=payload.get("description"), content=str(payload.get("content") or "").strip(), tags_json=json_dumps_safe(payload.get("tags") or []), sort_order=int(payload.get("sort_order") or 99), is_enabled=payload.get("is_enabled") is not False, created_by=actor_id, updated_by=actor_id, deleted=False)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_skill(row)

    def update_skill(self, skill_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = self._get_skill(skill_id)
        for field in ["name", "description", "content", "sort_order", "is_enabled"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "tags" in payload:
            row.tags_json = json_dumps_safe(payload.get("tags") or [])
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_skill(row)

    def delete_skill(self, skill_id: int, actor_id: str) -> None:
        row = self._get_skill(skill_id)
        row.deleted = True
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()

    def toggle_skill(self, skill_id: int, enabled: bool, actor_id: str) -> Dict[str, Any]:
        row = self._get_skill(skill_id)
        row.is_enabled = bool(enabled)
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_skill(row)
    def _serialize_parse_result(self, row: RecruitmentResumeParseResult) -> Dict[str, Any]:
        parsed_resume = {
            "basic_info": json_loads_safe(row.basic_info_json, {}),
            "work_experiences": json_loads_safe(row.work_experiences_json, []),
            "education_experiences": json_loads_safe(row.education_experiences_json, []),
            "skills": json_loads_safe(row.skills_json, []),
            "projects": json_loads_safe(row.projects_json, []),
            "summary": row.summary_text,
        }
        return {
            "id": row.id,
            "candidate_id": row.candidate_id,
            "resume_file_id": row.resume_file_id,
            "raw_text": row.raw_text or "",
            **parsed_resume,
            "status": row.status,
            "error_message": row.error_message,
            "created_at": isoformat_or_none(row.created_at),
        }

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

    def _serialize_workflow_memory(self, row: RecruitmentCandidateWorkflowMemory) -> Dict[str, Any]:
        screening_skill_ids = json_loads_safe(row.screening_skill_ids_json, [])
        interview_skill_ids = json_loads_safe(row.interview_skill_ids_json, [])
        return {"id": row.id, "candidate_id": row.candidate_id, "position_id": row.position_id, "screening_skill_ids": screening_skill_ids, "screening_skills": [self._serialize_skill(skill) for skill in self._load_skill_rows(screening_skill_ids)], "screening_memory_source": row.screening_memory_source, "screening_rule_snapshot": json_loads_safe(row.screening_rule_snapshot_json, None), "latest_parse_result_id": row.latest_parse_result_id, "latest_score_id": row.latest_score_id, "last_screened_at": isoformat_or_none(row.last_screened_at), "interview_skill_ids": interview_skill_ids, "interview_skills": [self._serialize_skill(skill) for skill in self._load_skill_rows(interview_skill_ids)], "last_interview_question_id": row.last_interview_question_id, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _serialize_status_history(self, row: RecruitmentCandidateStatusHistory) -> Dict[str, Any]:
        return {"id": row.id, "candidate_id": row.candidate_id, "from_status": row.from_status, "to_status": row.to_status, "reason": row.reason, "changed_by": row.changed_by, "source": row.source, "created_at": isoformat_or_none(row.created_at)}

    def _serialize_interview_question(self, row: RecruitmentInterviewQuestion) -> Dict[str, Any]:
        return {"id": row.id, "round_name": row.round_name, "custom_requirements": row.custom_requirements, "skill_ids": json_loads_safe(row.skill_ids_json, []), "html_content": row.html_content or "", "markdown_content": row.markdown_content or "", "status": row.status, "created_by": row.created_by, "created_at": isoformat_or_none(row.created_at)}

    def _serialize_candidate_summary(self, row: RecruitmentCandidate) -> Dict[str, Any]:
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == row.position_id, RecruitmentPosition.deleted.is_(False)).first() if row.position_id else None
        score_row = self.db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.id == row.latest_score_id).first() if row.latest_score_id else None
        serialized_score = self._serialize_score(score_row) if score_row else None
        display_match_percent = _parse_score_number(serialized_score.get("match_percent")) if serialized_score else _parse_score_number(row.match_percent)
        display_total_score = _parse_score_number(serialized_score.get("total_score")) if serialized_score else _parse_score_number(score_row.total_score if score_row else None)
        active_screening_task = self.db.query(RecruitmentAITaskLog).filter(
            RecruitmentAITaskLog.related_candidate_id == row.id,
            RecruitmentAITaskLog.task_type == "resume_score",
            RecruitmentAITaskLog.status.in_(["pending", "queued", "running", "cancelling"]),
        ).order_by(RecruitmentAITaskLog.updated_at.desc(), RecruitmentAITaskLog.id.desc()).first()
        if active_screening_task and self._settle_orphaned_live_task(active_screening_task):
            self.db.commit()
            self.db.refresh(row)
            active_screening_task = self.db.query(RecruitmentAITaskLog).filter(
                RecruitmentAITaskLog.related_candidate_id == row.id,
                RecruitmentAITaskLog.task_type == "resume_score",
                RecruitmentAITaskLog.status.in_(["pending", "queued", "running", "cancelling"]),
            ).order_by(RecruitmentAITaskLog.updated_at.desc(), RecruitmentAITaskLog.id.desc()).first()
        score_suggested_status = str(serialized_score.get("suggested_status") or "").strip() if serialized_score else ""
        ai_recommended_status = score_suggested_status or str(row.ai_recommended_status or "").strip() or None
        if active_screening_task:
            display_status = "screening_running"
        elif row.status == "pending_screening" and ai_recommended_status:
            display_status = ai_recommended_status
        else:
            display_status = row.status or ""
        position_screening_skill_rows = self._get_position_task_skill_rows(position.id, "screening") if position else []
        position_interview_skill_rows = self._get_position_task_skill_rows(position.id, "interview") if position else []
        position_jd_skill_rows = self._get_position_task_skill_rows(position.id, "jd") if position else []
        return {"id": row.id, "candidate_code": row.candidate_code, "position_id": row.position_id, "position_title": position.title if position else None, "position_auto_screen_on_upload": bool(position.auto_screen_on_upload) if position else False, "position_jd_skill_ids": [skill.id for skill in position_jd_skill_rows], "position_jd_skills": [self._serialize_skill(skill) for skill in position_jd_skill_rows], "position_screening_skill_ids": [skill.id for skill in position_screening_skill_rows], "position_screening_skills": [self._serialize_skill(skill) for skill in position_screening_skill_rows], "position_interview_skill_ids": [skill.id for skill in position_interview_skill_rows], "position_interview_skills": [self._serialize_skill(skill) for skill in position_interview_skill_rows], "name": row.name, "phone": row.phone, "email": row.email, "current_company": row.current_company, "years_of_experience": row.years_of_experience, "education": row.education, "source": row.source, "source_detail": row.source_detail, "status": row.status, "display_status": display_status, "active_screening_task_id": active_screening_task.id if active_screening_task else None, "active_screening_task_status": active_screening_task.status if active_screening_task else None, "ai_recommended_status": ai_recommended_status, "match_percent": display_match_percent, "tags": json_loads_safe(row.tags_json, []), "notes": row.notes, "latest_resume_file_id": row.latest_resume_file_id, "latest_parse_result_id": row.latest_parse_result_id, "latest_score_id": row.latest_score_id, "latest_total_score": display_total_score, "created_by": row.created_by, "updated_by": row.updated_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_candidates(self, query: Optional[str] = None, status: Optional[str] = None, position_id: Optional[int] = None, tag: Optional[str] = None) -> List[Dict[str, Any]]:
        builder = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.deleted.is_(False))
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
        activity = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.related_candidate_id == candidate.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).limit(50).all()
        activity_touched = False
        for item in activity:
            if self._settle_orphaned_live_task(item):
                activity_touched = True
        if activity_touched:
            self.db.commit()
            self.db.refresh(candidate)
            activity = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.related_candidate_id == candidate.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).limit(50).all()
        return {"candidate": self._serialize_candidate_summary(candidate), "resume_files": [self._serialize_resume_file(item) for item in resume_files], "parse_result": self._serialize_parse_result(parse_row) if parse_row else None, "score": self._serialize_score(score_row) if score_row else None, "workflow_memory": self._serialize_workflow_memory(workflow_memory) if workflow_memory else None, "status_history": [self._serialize_status_history(item) for item in status_history], "interview_questions": [self._serialize_interview_question(item) for item in questions], "activity": [self._serialize_ai_task_log(item) for item in activity]}

    def update_candidate(self, candidate_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        for field in ["position_id", "name", "phone", "email", "current_company", "years_of_experience", "education", "notes"]:
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
            storage_path.write_bytes(item.get("content") or b"")
            candidate = RecruitmentCandidate(candidate_code=f"TMP-{uuid.uuid4().hex[:8]}", position_id=position.id if position else None, name=safe_file_stem(file_name), source="manual_upload", source_detail=file_name, status="pending_screening", tags_json=json_dumps_safe([]), created_by=actor_id, updated_by=actor_id, deleted=False)
            self.db.add(candidate)
            self.db.flush()
            candidate.candidate_code = f"CAD-{candidate.id:05d}"
            upload_mime_type = str(item.get("content_type") or "").strip()
            if not upload_mime_type or upload_mime_type in {"application/octet-stream", "binary/octet-stream"}:
                upload_mime_type = mimetypes.guess_type(file_name)[0] or None
            resume_file = RecruitmentResumeFile(candidate_id=candidate.id, original_name=file_name, stored_name=stored_name, file_ext=ext, mime_type=upload_mime_type or None, file_size=len(item.get("content") or b""), storage_path=str(storage_path), parse_status="pending", uploaded_by=actor_id)
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

    def _resolve_screening_skills(self, candidate: RecruitmentCandidate, explicit_skill_ids: Optional[Iterable[Any]], *, use_position_skills: bool = True, use_candidate_memory: bool = True) -> Tuple[List[RecruitmentSkill], str]:
        manual_rows = self._filter_skill_rows_for_task(self._load_skill_rows(explicit_skill_ids or [], enabled_only=True), "screening")
        if manual_rows:
            return manual_rows, "manual"
        position_rows = self._get_position_task_skill_rows(candidate.position_id, "screening") if use_position_skills else []
        if position_rows:
            return position_rows, "position"
        workflow = self._get_workflow_memory(candidate.id)
        if use_candidate_memory and workflow:
            screening_skill_ids = json_loads_safe(workflow.screening_skill_ids_json, [])
            memory_rows = self._filter_skill_rows_for_task(self._load_skill_rows(screening_skill_ids, enabled_only=True), "screening")
            if memory_rows:
                return memory_rows, workflow.screening_memory_source or "candidate_memory"
        return [], "none"

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
            candidate.latest_score_id = score_row.id
            candidate.match_percent = match_percent
            candidate.ai_recommended_status = suggested_status
            if allow_status_advance:
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
        candidate.latest_score_id = score_row.id
        candidate.match_percent = normalized.get("match_percent")
        candidate.ai_recommended_status = normalized.get("suggested_status")
        if allow_status_advance:
            self._auto_advance_candidate_after_screening(candidate, actor_id=actor_id)
        candidate.updated_by = actor_id
        self.db.add(candidate)
        return score_row

    def _build_resume_screening_prompt(self, *, candidate: RecruitmentCandidate, raw_text: str, skill_snapshots: Sequence[Dict[str, Any]], custom_requirements: str, status_rules: Dict[str, Any]) -> str:
        structured_payload = {
            "candidate_name": candidate.name,
            "position": self._get_position_screening_payload(candidate),
            "resume_text": raw_text[:30000],
            "status_rules": status_rules,
            "custom_requirements": custom_requirements or None,
            "skills": [
                {
                    "id": skill.get("id"),
                    "name": skill.get("name"),
                }
                for skill in skill_snapshots
            ],
        }
        skill_names = "、".join([str(skill.get("name") or "") for skill in skill_snapshots]) if skill_snapshots else "无"
        return "\n\n".join([
            "TASK: 先解析简历，再基于 ACTIVE_SKILLS 对候选人进行严格初筛评分。",
            "PRIORITY_RULES:",
            "1. ACTIVE_SKILLS 定义了必须逐项核查的评分维度，不能跳过任何一个维度。",
            "2. 任一维度缺少直接简历证据时，必须在 concerns 中明确写出，并显著降分。",
            "3. 标记为“核心第一优先”或硬性要求的维度，不能用泛化亮点替代。",
            "4. advantages 和 concerns 必须直接对应 ACTIVE_SKILLS 维度，不得只是摘抄简历原文。",
            "5. 当多个关键维度缺失时，不得给出 screening_passed。",
            "6. 最终 total_score 必须严格等于各维度 score 求和，不能另行给出与维度不一致的总分。",
            "7. advantages 必须从“得分大于 0 的维度”中提炼，至少输出 2 条；如果命中维度不足 2 个，则输出所有命中维度对应优势。",
            "8. concerns 必须从“缺失、低分、核心缺口维度”中提炼，至少输出 2 条；如果问题不足 2 个，则输出所有真实问题。",
            "9. advantages 和 concerns 必须是招聘视角下的自然语言总结，不得直接输出对象字符串、字段 repr、截断碎片或“暂无明显亮点”。",
            "10. 若两个核心维度都缺失，可判定为不通过；但总分仍必须等于所有维度小分之和，不得再额外压低或改写。",
            "11. 如果某维度已经给分，则该维度信息应优先体现在 advantages 中；如果某维度为 0 分或证据缺失，则该维度信息应优先体现在 concerns 中。",
            f"CANDIDATE_NAME: {candidate.name or '未提供'}",
            f"ACTIVE_SKILL_NAMES: {skill_names}",
            f"CUSTOM_REQUIREMENTS: {custom_requirements or '无'}",
            "ACTIVE_SKILL_DETAILS:",
            _build_screening_skill_prompt_block(skill_snapshots),
            "STRUCTURED_CONTEXT_JSON:",
            json_dumps_safe(structured_payload),
        ])

    def _build_resume_score_prompt(self, *, candidate: RecruitmentCandidate, parsed_payload: Dict[str, Any], skill_snapshots: Sequence[Dict[str, Any]], custom_requirements: str, status_rules: Dict[str, Any]) -> str:
        dimension_rules = extract_screening_dimension_rules(skill_snapshots, limit=12)
        raw_resume_text = str(parsed_payload.get("raw_text") or "")
        parsed_resume_payload = {key: value for key, value in parsed_payload.items() if key != "raw_text"}
        structured_payload = {
            "position": self._get_position_screening_payload(candidate),
            "resume_text": raw_resume_text[:30000],
            "parsed_resume": parsed_resume_payload,
            "status_rules": status_rules,
            "custom_requirements": custom_requirements or None,
            "active_skill_names": [str(skill.get("name") or "").strip() for skill in skill_snapshots if str(skill.get("name") or "").strip()],
            "dimension_rules": dimension_rules,
        }
        skill_names = "、".join([str(skill.get("name") or "") for skill in skill_snapshots]) if skill_snapshots else "无"
        return "\n\n".join([
            "TASK: 基于 ACTIVE_SKILLS 对候选人进行严格初筛评分。",
            "PRIORITY_RULES:",
            "1. ACTIVE_SKILLS 定义了必须逐项核查的评分维度，不能跳过任何一个维度。",
            "2. 任一维度缺少直接简历证据时，必须在 concerns 中明确写出，并显著降分。",
            "3. 标记为“核心第一优先”或硬性要求的维度，不能用泛化亮点替代。",
            "4. advantages 和 concerns 必须直接对应 ACTIVE_SKILLS 维度，不得只是摘抄简历原文。",
            "5. 当多个关键维度缺失时，不得给出 screening_passed。",
            "6. 最终 total_score 必须严格等于各维度 score 求和，不能另行给出与维度不一致的总分。",
            "7. advantages 必须从“得分大于 0 的维度”中提炼，至少输出 2 条；如果命中维度不足 2 个，则输出所有命中维度对应优势。",
            "8. concerns 必须从“缺失、低分、核心缺口维度”中提炼，至少输出 2 条；如果问题不足 2 个，则输出所有真实问题。",
            "9. advantages 和 concerns 必须是招聘视角下的自然语言总结，不得直接输出对象字符串、字段 repr、截断碎片或“暂无明显亮点”。",
            "10. 若两个核心维度都缺失，可判定为不通过；但总分仍必须等于所有维度小分之和，不得再额外压低或改写。",
            "11. 如果某维度已经给分，则该维度信息应优先体现在 advantages 中；如果某维度为 0 分或证据缺失，则该维度信息应优先体现在 concerns 中。",
            "12. recommendation 不能为空、不能只是标点；suggested_status 必须是 screening_passed、talent_pool、screening_rejected 三者之一。",
            f"CANDIDATE_NAME: {candidate.name or '未提供'}",
            f"ACTIVE_SKILL_NAMES: {skill_names}",
            f"CUSTOM_REQUIREMENTS: {custom_requirements or '无'}",
            "SCORING_DIMENSION_RULES:",
            json_dumps_safe(dimension_rules),
            "STRUCTURED_CONTEXT_JSON:",
            json_dumps_safe(structured_payload),
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

    def _screen_candidate_with_single_ai_call(self, candidate: RecruitmentCandidate, actor_id: str, skill_rows: Sequence[RecruitmentSkill], memory_source: str, custom_requirements: str = "", *, existing_task_id: Optional[int] = None, cancel_control: Optional[RecruitmentTaskControl] = None) -> Tuple[RecruitmentResumeParseResult, RecruitmentCandidateScore]:
        if not candidate.latest_resume_file_id:
            raise ValueError("鎿嶄綔澶辫触")
        resume_file = self._get_resume_file(candidate.latest_resume_file_id)
        resume_file.parse_status = "processing"
        self.db.add(resume_file)
        self.db.commit()
        raw_text = extract_resume_text(Path(resume_file.storage_path), resume_file.file_ext or "")
        status_rules = self._get_rule_config("default_status_rules", DEFAULT_RULE_CONFIGS["default_status_rules"])
        skill_snapshots = self._tailor_skill_snapshots_for_task(self._build_skill_snapshots(skill_rows, custom_requirements, custom_name="附加初筛要求"), "screening")
        screening_schema_config = _build_screening_schema_config(
            skill_snapshots,
            status_rules=status_rules,
        )
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        prompt = self._build_resume_screening_prompt(
            candidate=candidate,
            raw_text=raw_text,
            skill_snapshots=skill_snapshots,
            custom_requirements=custom_requirements,
            status_rules=status_rules,
        )
        logger.debug("Screening user prompt preview candidate_id=%s: %s", candidate.id, truncate_text(prompt, 2000))
        request_hash = self._build_request_hash("resume_screening", candidate.id, resume_file.id, related_skill_ids, memory_source, custom_requirements)
        log_row = self._get_ai_task_log_row(existing_task_id) if existing_task_id else self._create_ai_task_log("resume_score", created_by=actor_id, related_position_id=candidate.position_id, related_candidate_id=candidate.id, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, related_resume_file_id=resume_file.id, memory_source=memory_source, request_hash=request_hash)
        task: Optional[Dict[str, Any]] = None
        try:
            self._raise_if_cancelled(cancel_control)
            self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(prompt, 600), output_summary="正在执行简历解析与初筛评分")
            task = self.ai_gateway.generate_json(
                task_type="resume_score",
                system_prompt=RESUME_SCREENING_SYSTEM_PROMPT,
                user_prompt=prompt,
                cancel_control=cancel_control,
            )
            self._raise_if_cancelled(cancel_control)
            authoritative_raw_text = str(task.get("raw_response_text") or "").strip()
            authoritative_payload = _parse_llm_json_response(authoritative_raw_text or json_dumps_safe(task.get("content") or {}))
            sanitized_payload, validation_meta = sanitize_screening_payload(
                authoritative_payload,
                screening_schema_config,
            )
            parsed_resume = sanitized_payload.get("parsed_resume") or {}
            raw_score_payload = sanitized_payload.get("score") or {}
            validation_warnings = _normalize_score_warning_items(validation_meta.get("warnings"), limit=8)
            screening_result_valid, invalid_result_reasons = _classify_screening_score_validity(
                raw_score_payload,
                screening_schema_config,
                validation_warnings=validation_warnings,
            )
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
                fallback_score_only_ai_called=False,
                final_response_source="primary_screening_model",
                validation_warnings=validation_warnings,
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
            failed_candidate = self._get_candidate(candidate.id)
            failure_meta = _extract_json_parse_failure_meta(exc, default_source="screening_request_failed")
            resume_file.parse_status = "failed"
            resume_file.parse_error = str(exc)
            self._mark_candidate_screening_failed_if_needed(
                failed_candidate,
                actor_id=actor_id,
                reason="AI 初筛执行失败，请重新发起初筛。",
                source="ai_screening_failed",
            )
            self.db.add(resume_file)
            self.db.add(failed_candidate)
            self.db.commit()
            logger.info(
                "Screening completed candidate_id=%s primary_model_call_succeeded=%s fallback_score_only_ai_called=%s final_response_source=%s",
                candidate.id,
                failure_meta.get("primary_model_call_succeeded"),
                False,
                failure_meta.get("final_response_source"),
            )
            self._finish_ai_task_log(
                log_row,
                status="failed",
                provider=task.get("provider") if task else None,
                model_name=task.get("model_name") if task else None,
                prompt_snapshot=task.get("prompt_snapshot") if task else prompt,
                full_request_snapshot=task.get("full_request_snapshot") if task else None,
                input_summary=task.get("input_summary") if task else truncate_text(prompt, 600),
                output_summary=task.get("output_summary") if task else failure_meta.get("output_summary"),
                output_snapshot={
                    "raw": task.get("content") if task else None,
                    "raw_response_text": task.get("raw_response_text") if task else failure_meta.get("raw_response_text"),
                    "parse_strategy": "combined_parse_and_score",
                    "reused_existing_parse": False,
                    "primary_model_call_succeeded": bool(task and not task.get("used_fallback")) if task else failure_meta.get("primary_model_call_succeeded"),
                    "fallback_score_only_ai_called": False,
                    "final_response_source": failure_meta.get("final_response_source"),
                    "screening_result_state": failure_meta.get("screening_result_state"),
                },
                error_message=str(exc),
                token_usage=task.get("token_usage") if task else None,
                memory_source=memory_source,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
            )
            raise
        parse_status = "success"
        parse_error_message = None
        parse_quality_warnings: List[str] = []
        execution_status = "success"
        parse_row = RecruitmentResumeParseResult(
            candidate_id=candidate.id,
            resume_file_id=resume_file.id,
            raw_text=raw_text,
            basic_info_json=json_dumps_safe(parsed_resume.get("basic_info") or {}),
            work_experiences_json=json_dumps_safe(parsed_resume.get("work_experiences") or []),
            education_experiences_json=json_dumps_safe(parsed_resume.get("education_experiences") or []),
            skills_json=json_dumps_safe(parsed_resume.get("skills") or []),
            projects_json=json_dumps_safe(parsed_resume.get("projects") or []),
            summary_text=parsed_resume.get("summary") or "",
            status=parse_status,
            error_message=parse_error_message,
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
        resume_file.parse_status = parse_status
        resume_file.parse_error = parse_error_message
        self.db.add(candidate)
        self.db.add(resume_file)
        score_row = self._save_score_result(
            candidate,
            parse_row,
            actor_id,
            storage_payload,
            allow_status_advance=screening_result_valid,
        )
        final_task_status = "success"
        final_response_source = "primary_screening_model"
        final_output_summary = _build_screening_output_summary(
            parsed_resume=parsed_resume,
            score_payload=raw_score_payload,
        ) or task.get("output_summary")
        screening_result_state = "success"
        if not screening_result_valid:
            self._mark_candidate_screening_failed_if_needed(
                candidate,
                actor_id=actor_id,
                reason="AI 已返回结果，但初筛评分无效，请重新发起初筛。",
                source="ai_screening_invalid",
            )
            final_task_status = "failed"
            final_response_source = "primary_screening_model_invalid"
            final_output_summary = "AI 返回了无效初筛结果"
            screening_result_state = "invalid"
        self.db.commit()
        self.db.refresh(parse_row)
        self.db.refresh(score_row)
        logger.info(
            "Screening completed candidate_id=%s primary_model_call_succeeded=%s fallback_score_only_ai_called=%s final_response_source=%s",
            candidate.id,
            True,
            False,
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
                "parsed_resume": parsed_resume,
                "score": raw_score_payload,
                "raw_response_text": task.get("raw_response_text"),
                "meta": {
                    "parse_status": parse_status,
                    "parse_strategy": "combined_parse_and_score",
                    "reused_existing_parse": False,
                    "primary_model_call_succeeded": True,
                    "fallback_score_only_ai_called": False,
                    "final_response_source": final_response_source,
                    "screening_result_state": screening_result_state,
                    "screening_result_valid": screening_result_valid,
                    "invalid_result_reasons": invalid_result_reasons,
                    "validation_warnings": validation_warnings,
                },
            },
            error_message=None if screening_result_valid else "AI 返回了无效初筛结果",
            token_usage=task.get("token_usage"),
            memory_source=memory_source,
            related_skill_ids=related_skill_ids,
            related_skill_snapshots=skill_snapshots,
        )
        return parse_row, score_row

    def _parse_latest_resume(self, candidate: RecruitmentCandidate, actor_id: str) -> RecruitmentResumeParseResult:
        if not candidate.latest_resume_file_id:
            raise ValueError("鎿嶄綔澶辫触")
        resume_file = self._get_resume_file(candidate.latest_resume_file_id)
        request_hash = self._build_request_hash("resume_parse", candidate.id, resume_file.id, resume_file.storage_path)
        log_row = self._create_ai_task_log("resume_parse", created_by=actor_id, related_position_id=candidate.position_id, related_candidate_id=candidate.id, related_resume_file_id=resume_file.id, request_hash=request_hash)
        resume_file.parse_status = "processing"
        self.db.add(resume_file)
        self.db.commit()
        raw_text = extract_resume_text(Path(resume_file.storage_path), resume_file.file_ext or "")
        prompt = json_dumps_safe({"candidate_name": candidate.name, "resume_text": raw_text[:30000]})
        self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(raw_text, 600), output_summary="正在解析简历文本")
        task = self.ai_gateway.generate_json(task_type="resume_parse", system_prompt=RESUME_PARSE_SYSTEM_PROMPT, user_prompt=prompt, fallback_builder=lambda: extract_resume_structured_data(raw_text, candidate.name))
        content = task.get("content") or {}
        sanitized_resume = _sanitize_ai_parsed_resume(content if isinstance(content, dict) else {}, raw_text, candidate.name)
        parse_pipeline_error = task.get("error_message") if task.get("used_fallback") else None
        parse_has_warning = _resume_parse_has_warning(sanitized_resume, parse_pipeline_error, candidate.name)
        parse_status = "warning" if parse_has_warning else "success"
        parse_error_message = _build_resume_parse_warning_message(sanitized_resume, candidate.name, parse_pipeline_error)
        parse_quality_warnings = _extract_parse_quality_warnings(sanitized_resume)
        execution_status = "fallback" if task.get("used_fallback") else "success"
        if execution_status == "fallback":
            parse_quality_warnings = _merge_warning_items(
                ["当前解析来自 fallback_builder，非主模型直接结构化结果"],
                parse_quality_warnings,
                limit=8,
            )
        parse_row = RecruitmentResumeParseResult(candidate_id=candidate.id, resume_file_id=resume_file.id, raw_text=raw_text, basic_info_json=json_dumps_safe(sanitized_resume.get("basic_info") or {}), work_experiences_json=json_dumps_safe(sanitized_resume.get("work_experiences") or []), education_experiences_json=json_dumps_safe(sanitized_resume.get("education_experiences") or []), skills_json=json_dumps_safe(sanitized_resume.get("skills") or []), projects_json=json_dumps_safe(sanitized_resume.get("projects") or []), summary_text=sanitized_resume.get("summary") or "", status=parse_status, error_message=parse_error_message)
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
        resume_file.parse_status = parse_status
        resume_file.parse_error = parse_error_message
        self.db.add(candidate)
        self.db.add(resume_file)
        self.db.commit()
        self.db.refresh(parse_row)
        self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), full_request_snapshot=task.get("full_request_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot={"parsed_resume": sanitized_resume, "normalized_parse": sanitized_resume, "execution_status": execution_status, "parse_quality_warnings": parse_quality_warnings, "raw": content, "parse_status": parse_status, "parse_strategy": "parse_only", "reused_existing_parse": False, "parse_warning_message": parse_error_message}, error_message=task.get("error_message") or parse_error_message, token_usage=task.get("token_usage"))
        return parse_row

    def _score_candidate(self, candidate: RecruitmentCandidate, parse_row: RecruitmentResumeParseResult, actor_id: str, skill_rows: Sequence[RecruitmentSkill], memory_source: str, custom_requirements: str = "", *, existing_task_id: Optional[int] = None, cancel_control: Optional[RecruitmentTaskControl] = None) -> RecruitmentCandidateScore:
        parsed_payload = self._serialize_parse_result(parse_row)
        status_rules = self._get_rule_config("default_status_rules", DEFAULT_RULE_CONFIGS["default_status_rules"])
        skill_snapshots = self._tailor_skill_snapshots_for_task(self._build_skill_snapshots(skill_rows, custom_requirements, custom_name="附加初筛要求"), "screening")
        screening_schema_config = _build_screening_schema_config(
            skill_snapshots,
            status_rules=status_rules,
        )
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        prompt = self._build_resume_score_prompt(
            candidate=candidate,
            parsed_payload=parsed_payload,
            skill_snapshots=skill_snapshots,
            custom_requirements=custom_requirements,
            status_rules=status_rules,
        )
        logger.debug("Resume score user prompt preview candidate_id=%s: %s", candidate.id, truncate_text(prompt, 2000))
        request_hash = self._build_request_hash("resume_score", candidate.id, parse_row.id, related_skill_ids, memory_source, custom_requirements)
        log_row = self._get_ai_task_log_row(existing_task_id) if existing_task_id else self._create_ai_task_log("resume_score", created_by=actor_id, related_position_id=candidate.position_id, related_candidate_id=candidate.id, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, related_resume_file_id=parse_row.resume_file_id, memory_source=memory_source, request_hash=request_hash)
        task: Optional[Dict[str, Any]] = None
        try:
            self._raise_if_cancelled(cancel_control)
            self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(prompt, 600), output_summary="正在根据岗位与 Skills 进行初筛评分")
            task = self.ai_gateway.generate_json(
                task_type="resume_score",
                system_prompt=RESUME_SCORE_SYSTEM_PROMPT,
                user_prompt=prompt,
                cancel_control=cancel_control,
            )
            self._raise_if_cancelled(cancel_control)
            authoritative_raw_text = str(task.get("raw_response_text") or "").strip()
            authoritative_payload = _parse_llm_json_response(authoritative_raw_text or json_dumps_safe(task.get("content") or {}))
            raw_score_payload, validation_meta = sanitize_screening_score_payload(
                authoritative_payload,
                screening_schema_config,
            )
            validation_warnings = _normalize_score_warning_items(validation_meta.get("warnings"), limit=8)
            screening_result_valid, invalid_result_reasons = _classify_screening_score_validity(
                raw_score_payload,
                screening_schema_config,
                validation_warnings=validation_warnings,
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
                fallback_score_only_ai_called=False,
                final_response_source="primary_score_model",
                validation_warnings=validation_warnings,
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
            if not screening_result_valid:
                self._mark_candidate_screening_failed_if_needed(
                    candidate,
                    actor_id=actor_id,
                    reason="AI 已返回结果，但初筛评分无效，请重新发起初筛。",
                    source="ai_screening_invalid",
                )
                final_task_status = "failed"
                final_response_source = "primary_score_model_invalid"
                final_output_summary = "AI 返回了无效初筛结果"
                screening_result_state = "invalid"
            self.db.commit()
            self.db.refresh(score_row)
            logger.info(
                "Screening completed candidate_id=%s primary_model_call_succeeded=%s fallback_score_only_ai_called=%s final_response_source=%s",
                candidate.id,
                True,
                False,
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
                    "score": raw_score_payload,
                    "raw_response_text": task.get("raw_response_text"),
                    "meta": {
                        "parse_strategy": "reuse_existing_parse",
                        "reused_existing_parse": True,
                        "parse_result_id": parse_row.id,
                        "parse_result_status": parse_row.status,
                        "primary_model_call_succeeded": True,
                        "fallback_score_only_ai_called": False,
                        "final_response_source": final_response_source,
                        "screening_result_state": screening_result_state,
                        "screening_result_valid": screening_result_valid,
                        "invalid_result_reasons": invalid_result_reasons,
                        "validation_warnings": validation_warnings,
                    },
                },
                error_message=None if screening_result_valid else "AI 返回了无效初筛结果",
                token_usage=task.get("token_usage"),
                memory_source=memory_source,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
            )
            return score_row
        except RecruitmentTaskCancelled:
            self.db.rollback()
            self._mark_ai_task_cancelled(log_row.id, actor_id=actor_id, reason="任务已被用户停止，初筛评分未继续生成。")
            raise
        except Exception as exc:
            self.db.rollback()
            failed_candidate = self._get_candidate(candidate.id)
            failure_meta = _extract_json_parse_failure_meta(exc, default_source="score_model_failed")
            self._mark_candidate_screening_failed_if_needed(
                failed_candidate,
                actor_id=actor_id,
                reason="AI 初筛执行失败，请重新发起初筛。",
                source="ai_screening_failed",
            )
            self.db.add(failed_candidate)
            self.db.commit()
            logger.info(
                "Screening completed candidate_id=%s primary_model_call_succeeded=%s fallback_score_only_ai_called=%s final_response_source=%s",
                candidate.id,
                failure_meta.get("primary_model_call_succeeded"),
                False,
                failure_meta.get("final_response_source"),
            )
            self._finish_ai_task_log(
                log_row,
                status="failed",
                provider=task.get("provider") if task else None,
                model_name=task.get("model_name") if task else None,
                prompt_snapshot=task.get("prompt_snapshot") if task else prompt,
                full_request_snapshot=task.get("full_request_snapshot") if task else None,
                input_summary=task.get("input_summary") if task else truncate_text(prompt, 600),
                output_summary=task.get("output_summary") if task else failure_meta.get("output_summary"),
                output_snapshot={
                    "raw": task.get("content") if task else None,
                    "raw_response_text": task.get("raw_response_text") if task else failure_meta.get("raw_response_text"),
                    "parse_strategy": "reuse_existing_parse",
                    "reused_existing_parse": True,
                    "parse_result_id": parse_row.id,
                    "parse_result_status": parse_row.status,
                    "primary_model_call_succeeded": bool(task and not task.get("used_fallback")) if task else failure_meta.get("primary_model_call_succeeded"),
                    "fallback_score_only_ai_called": False,
                    "final_response_source": failure_meta.get("final_response_source"),
                    "screening_result_state": failure_meta.get("screening_result_state"),
                },
                error_message=str(exc),
                token_usage=task.get("token_usage") if task else None,
                memory_source=memory_source,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
            )
            raise

    def trigger_latest_parse(self, candidate_id: int, actor_id: str) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        return self._serialize_parse_result(self._parse_latest_resume(candidate, actor_id))

    def trigger_latest_score(self, candidate_id: int, actor_id: str) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        skill_rows, memory_source = self._resolve_screening_skills(candidate, [], use_position_skills=True, use_candidate_memory=True)
        parse_row = self._get_current_parse_result(candidate)
        if not parse_row:
            _parse_row, score_row = self._screen_candidate_with_single_ai_call(candidate, actor_id, skill_rows, memory_source, "")
            return self._serialize_score(score_row)
        return self._serialize_score(self._score_candidate(candidate, parse_row, actor_id, skill_rows, memory_source, ""))

    def screen_candidate(self, candidate_id: int, actor_id: str, skill_ids: Optional[Iterable[Any]] = None, use_position_skills: bool = True, use_candidate_memory: bool = True, custom_requirements: str = "", *, existing_task_id: Optional[int] = None, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        skill_rows, memory_source = self._resolve_screening_skills(candidate, skill_ids, use_position_skills=use_position_skills, use_candidate_memory=use_candidate_memory)
        parse_row = self._get_current_parse_result(candidate)
        if parse_row:
            score_row = self._score_candidate(candidate, parse_row, actor_id, skill_rows, memory_source, custom_requirements, existing_task_id=existing_task_id, cancel_control=cancel_control)
        else:
            parse_row, score_row = self._screen_candidate_with_single_ai_call(candidate, actor_id, skill_rows, memory_source, custom_requirements, existing_task_id=existing_task_id, cancel_control=cancel_control)
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == candidate.position_id, RecruitmentPosition.deleted.is_(False)).first() if candidate.position_id else None
        workflow = self._get_or_create_workflow_memory(candidate, actor_id)
        workflow.position_id = candidate.position_id
        workflow.screening_skill_ids_json = json_dumps_safe([skill.id for skill in skill_rows])
        workflow.screening_memory_source = memory_source
        workflow.screening_rule_snapshot_json = json_dumps_safe({"status_rules": self._get_rule_config("default_status_rules", DEFAULT_RULE_CONFIGS["default_status_rules"]), "custom_requirements": custom_requirements or None, "weight_source": "active_skill_details"})
        workflow.latest_parse_result_id = parse_row.id
        workflow.latest_score_id = score_row.id
        workflow.last_screened_at = func.now()
        workflow.updated_by = actor_id
        self.db.add(workflow)
        candidate.updated_by = actor_id
        self.db.add(candidate)
        self.db.commit()
        return self.get_candidate_detail(candidate.id)

    def start_screen_candidate(self, candidate_id: int, actor_id: str, skill_ids: Optional[Iterable[Any]] = None, use_position_skills: bool = True, use_candidate_memory: bool = True, custom_requirements: str = "") -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        skill_rows, memory_source = self._resolve_screening_skills(candidate, skill_ids, use_position_skills=use_position_skills, use_candidate_memory=use_candidate_memory)
        skill_snapshots = self._tailor_skill_snapshots_for_task(self._build_skill_snapshots(skill_rows, custom_requirements, custom_name="附加初筛要求"), "screening")
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        request_hash = self._build_request_hash("resume_score", candidate.id, candidate.latest_resume_file_id or 0, related_skill_ids, memory_source, custom_requirements)
        log_row = self._create_ai_task_log("resume_score", created_by=actor_id, related_position_id=candidate.position_id, related_candidate_id=candidate.id, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, related_resume_file_id=candidate.latest_resume_file_id, memory_source=memory_source, request_hash=request_hash)

        def _runner(control: RecruitmentTaskControl) -> None:
            db = SessionLocal()
            service = RecruitmentService(db)
            try:
                service.screen_candidate(candidate_id, actor_id, skill_ids=skill_ids, use_position_skills=use_position_skills, use_candidate_memory=use_candidate_memory, custom_requirements=custom_requirements, existing_task_id=log_row.id, cancel_control=control)
            except RecruitmentTaskCancelled:
                pass
            except Exception as exc:
                db.rollback()
                try:
                    if control.is_cancelled():
                        service._mark_ai_task_cancelled(log_row.id, actor_id=actor_id, reason="任务已被用户停止，初筛未继续生成。")
                    else:
                        service._mark_ai_task_failed(log_row.id, str(exc))
                except Exception:
                    db.rollback()
                logger.exception("Background screening task %s failed", log_row.id)
            finally:
                db.close()

        self._start_background_ai_task(log_row.id, _runner)
        return {
            "task_id": log_row.id,
            "status": "pending",
            "task_type": "resume_score",
            "related_candidate_id": candidate.id,
            "related_position_id": candidate.position_id,
        }

    def _resolve_interview_skills(self, candidate: RecruitmentCandidate, explicit_skill_ids: Optional[Iterable[Any]], *, use_candidate_memory: bool = True, use_position_skills: bool = True) -> Tuple[List[RecruitmentSkill], str]:
        manual_rows = self._filter_skill_rows_for_task(self._load_skill_rows(explicit_skill_ids or [], enabled_only=True), "interview")
        if manual_rows:
            return manual_rows, "manual"
        position_rows = self._get_position_task_skill_rows(candidate.position_id, "interview") if use_position_skills else []
        if position_rows:
            return position_rows, "position"
        workflow = self._get_workflow_memory(candidate.id)
        if use_candidate_memory and workflow:
            interview_skill_ids = json_loads_safe(workflow.interview_skill_ids_json, [])
            memory_rows = self._filter_skill_rows_for_task(self._load_skill_rows(interview_skill_ids, enabled_only=True), "interview")
            if memory_rows:
                return memory_rows, workflow.screening_memory_source or "candidate_memory"
        return [], "none"

    def _build_interview_skill_prompt_block(self, skill_snapshots: Sequence[Dict[str, Any]], custom_requirements: str) -> str:
        constraints = extract_interview_generation_constraints(skill_snapshots, custom_requirements)
        if not constraints:
            return "- 无额外约束"
        return "\n".join(f"- {item}" for item in constraints)

    def _build_interview_question_prompt(self, *, candidate_payload: Dict[str, Any], parsed_resume_payload: Optional[Dict[str, Any]], latest_screening_result_payload: Optional[Dict[str, Any]], position_payload: Optional[Dict[str, Any]], workflow_payload: Optional[Dict[str, Any]], round_name: str, custom_requirements: str, skill_snapshots: Sequence[Dict[str, Any]], memory_source: str) -> str:
        capability_domains = infer_interview_capability_domains(
            str((position_payload or {}).get("title") or ""),
            skill_snapshots,
            parsed_resume_payload,
        )
        fallback_structured = build_interview_structured_fallback(
            str(candidate_payload.get("name") or "未命名候选人"),
            str((position_payload or {}).get("title") or "当前岗位"),
            round_name or "初试",
            skill_snapshots,
            custom_requirements,
            parsed_resume=parsed_resume_payload,
            screening_result=latest_screening_result_payload,
        )
        structured_payload = {
            "candidate": candidate_payload,
            "parsed_resume": parsed_resume_payload,
            "latest_screening_result": latest_screening_result_payload,
            "position": position_payload,
            "workflow_memory": workflow_payload,
            "round_name": round_name,
            "custom_requirements": custom_requirements or None,
            "memory_source": memory_source,
            "active_skill_ids": [skill.get("id") for skill in skill_snapshots],
            "capability_domains": capability_domains,
            "hidden_generation_constraints": extract_interview_generation_constraints(skill_snapshots, custom_requirements),
            "domain_evidence_catalog": [
                {
                    "domain_title": item.get("domain_title"),
                    "domain_nature": item.get("domain_nature"),
                    "evidence_type": item.get("evidence_type"),
                    "evidence_basis": item.get("evidence_basis"),
                }
                for item in fallback_structured.get("domains", [])
            ],
        }
        skill_names = "、".join([str(skill.get("name") or "") for skill in skill_snapshots]) if skill_snapshots else "无"
        return "\n\n".join([
            "TASK: 为候选人生成结构化面试题 domain 对象，后端会再统一渲染 markdown/html。",
            "OUTPUT_REQUIREMENTS:",
            "1. 只返回 strict JSON，不要返回 markdown、html、代码块或解释文字。",
            "2. domains 必须严格按 CAPABILITY_DOMAINS 顺序输出，domain_title 必须与提供标题完全一致。",
            "3. 对每个 domain，必须返回：domain_title、evidence_basis[]、evidence_type、primary_question、answer_points[]、verdict_pass、verdict_caution、verdict_fail、followups[]、interviewer_explanation。",
            "4. evidence_type 只能是 direct_evidence 或 risk_to_verify。",
            "5. 如果 DOMAIN_EVIDENCE_CATALOG 里该模块是 risk_to_verify，primary_question 必须明确写出“简历缺少直接证据，需要结合最接近的真实项目或风险继续核实”，绝不能暗示候选人已经做过。",
            "6. 如果 DOMAIN_EVIDENCE_CATALOG 里该模块是 direct_evidence，优先围绕 evidence_basis 里的真实证据点组织问题，不要只绑定公司名或泛化经历。",
            "7. 不要把 Skill 规则名、系统约束名、HTML 规范、触发方式、输出规范写进题目模块、题干、参考答案或判定文案里。",
            "8. 回答不能退化成泛化题库清单，每个模块都要体现该能力域真正要验证的能力与风险。",
            f"ROUND_NAME: {round_name or '初试'}",
            f"CUSTOM_REQUIREMENTS: {custom_requirements or '无'}",
            f"MEMORY_SOURCE: {memory_source or 'unknown'}",
            f"ACTIVE_SKILL_NAMES: {skill_names}",
            "CAPABILITY_DOMAINS:",
            "\n".join(f"- {item}" for item in capability_domains),
            "ACTIVE_SKILL_CONSTRAINTS:",
            self._build_interview_skill_prompt_block(skill_snapshots, custom_requirements),
            "STRUCTURED_CONTEXT_JSON:",
            json_dumps_safe(structured_payload),
        ])

    def _build_interview_preview_prompt(self, *, candidate_payload: Dict[str, Any], parsed_resume_payload: Optional[Dict[str, Any]], latest_screening_result_payload: Optional[Dict[str, Any]], position_payload: Optional[Dict[str, Any]], workflow_payload: Optional[Dict[str, Any]], round_name: str, custom_requirements: str, skill_snapshots: Sequence[Dict[str, Any]], memory_source: str) -> str:
        capability_domains = infer_interview_capability_domains(
            str((position_payload or {}).get("title") or ""),
            skill_snapshots,
            parsed_resume_payload,
        )
        fallback_structured = build_interview_structured_fallback(
            str(candidate_payload.get("name") or "未命名候选人"),
            str((position_payload or {}).get("title") or "当前岗位"),
            round_name or "初试",
            skill_snapshots,
            custom_requirements,
            parsed_resume=parsed_resume_payload,
            screening_result=latest_screening_result_payload,
        )
        structured_payload = {
            "candidate": candidate_payload,
            "parsed_resume": parsed_resume_payload,
            "latest_screening_result": latest_screening_result_payload,
            "position": position_payload,
            "workflow_memory": workflow_payload,
            "round_name": round_name,
            "custom_requirements": custom_requirements or None,
            "memory_source": memory_source,
            "active_skill_ids": [skill.get("id") for skill in skill_snapshots],
            "capability_domains": capability_domains,
            "hidden_generation_constraints": extract_interview_generation_constraints(skill_snapshots, custom_requirements),
            "domain_evidence_catalog": [
                {
                    "domain_title": item.get("domain_title"),
                    "domain_nature": item.get("domain_nature"),
                    "evidence_type": item.get("evidence_type"),
                    "evidence_basis": item.get("evidence_basis"),
                }
                for item in fallback_structured.get("domains", [])
            ],
        }
        skill_names = "、".join([str(skill.get("name") or "") for skill in skill_snapshots]) if skill_snapshots else "无"
        return "\n\n".join([
            "TASK: 为候选人生成可逐步流式显示的 markdown 面试题预览。",
            "PREVIEW_REQUIREMENTS:",
            "1. 只输出 markdown，不要输出 HTML，不要解释系统规则。",
            "2. 严格按 CAPABILITY_DOMAINS 顺序逐个模块展开，保证每个模块都有完整内容，而不是只给一句短问题。",
            "3. 每个模块必须包含：证据类型、证据锚点、面试题正题、参考答案要点、通过/注意/一票否决、追问环节、答不出时面试官解释。",
            "4. 如果 DOMAIN_EVIDENCE_CATALOG 里该模块是 risk_to_verify，题干必须明确说明简历缺少直接证据，需要结合最接近的真实项目继续核实，绝不能默认候选人做过。",
            "5. 如果 DOMAIN_EVIDENCE_CATALOG 里该模块是 direct_evidence，优先围绕 evidence_basis 里的具体证据点展开，不要只引用公司名。",
            "6. 不要输出规则名、输出规范名、HTML 规范、触发方式。",
            f"ROUND_NAME: {round_name or '初试'}",
            f"CUSTOM_REQUIREMENTS: {custom_requirements or '无'}",
            f"MEMORY_SOURCE: {memory_source or 'unknown'}",
            f"ACTIVE_SKILL_NAMES: {skill_names}",
            "CAPABILITY_DOMAINS:",
            "\n".join(f"- {item}" for item in capability_domains),
            "ACTIVE_SKILL_CONSTRAINTS:",
            self._build_interview_skill_prompt_block(skill_snapshots, custom_requirements),
            "STRUCTURED_CONTEXT_JSON:",
            json_dumps_safe(structured_payload),
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
        latest_screening_result_payload = self._serialize_score_for_interview_prompt(score_row) if score_row else None
        position_payload = None if not position else self._serialize_position_for_interview_prompt(position)
        workflow_payload = self._serialize_workflow_for_interview_prompt(workflow) if workflow else None
        prompt = self._build_interview_preview_prompt(
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
        latest_screening_result_payload = self._serialize_score_for_interview_prompt(score_row) if score_row else None
        position_payload = None if not position else self._serialize_position_for_interview_prompt(position)
        workflow_payload = self._serialize_workflow_for_interview_prompt(workflow) if workflow else None
        prompt = self._build_interview_question_prompt(candidate_payload=candidate_payload, parsed_resume_payload=parsed_resume_payload, latest_screening_result_payload=latest_screening_result_payload, position_payload=position_payload, workflow_payload=workflow_payload, round_name=round_name, custom_requirements=custom_requirements, skill_snapshots=skill_snapshots, memory_source=memory_source)
        fallback_structured = build_interview_structured_fallback(
            candidate.name,
            position.title if position else "当前岗位",
            round_name,
            skill_snapshots,
            custom_requirements,
            parsed_resume=parsed_resume_payload,
            screening_result=latest_screening_result_payload,
        )
        request_hash = self._build_request_hash("interview_question_generation", candidate.id, round_name, custom_requirements, related_skill_ids, memory_source)
        log_row = self._get_ai_task_log_row(existing_task_id) if existing_task_id else self._create_ai_task_log("interview_question_generation", created_by=actor_id, related_position_id=candidate.position_id, related_candidate_id=candidate.id, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, memory_source=memory_source, request_hash=request_hash)
        try:
            self._raise_if_cancelled(cancel_control)
            self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(prompt, 600), output_summary="正在生成面试题")
            task = self.ai_gateway.generate_json(task_type="interview_question_generation", system_prompt=INTERVIEW_QUESTION_SYSTEM_PROMPT, user_prompt=prompt, fallback_builder=lambda: fallback_structured, cancel_control=cancel_control)
            self._raise_if_cancelled(cancel_control)
        except RecruitmentTaskCancelled:
            self.db.rollback()
            self._mark_ai_task_cancelled(log_row.id, actor_id=actor_id, reason="任务已被用户停止，面试题未继续生成。")
            raise
        content = task.get("content") or {}
        structured = normalize_structured_interview(
            content if isinstance(content, dict) else {},
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
        used_fallback = bool(task.get("used_fallback"))
        if postprocess_reason:
            structured = fallback_structured
            markdown = render_interview_markdown(fallback_structured)
            html = render_interview_html(fallback_structured)
            used_fallback = True
        row = RecruitmentInterviewQuestion(candidate_id=candidate.id, position_id=candidate.position_id, skill_ids_json=json_dumps_safe([skill.id for skill in skill_rows]), round_name=round_name or "初试", custom_requirements=custom_requirements or None, html_content=html, markdown_content=markdown, status="generated", created_by=actor_id)
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
            status="fallback" if used_fallback else "success",
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
            error_message=postprocess_reason or task.get("error_message"),
            token_usage=task.get("token_usage"),
            memory_source=memory_source,
            related_skill_ids=related_skill_ids,
            related_skill_snapshots=skill_snapshots,
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
            self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(prompt, 600), output_summary="正在生成 JD")
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
            row = RecruitmentJDVersion(position_id=position.id, version_no=version_no, title=f"{position.title} V{version_no}", prompt_snapshot=task.get("prompt_snapshot"), jd_markdown=markdown, jd_html=html, publish_text=publish_text, notes=extra_prompt or None, is_active=bool(auto_activate), created_by=actor_id)
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
        row = RecruitmentJDVersion(position_id=position.id, version_no=version_no, title=f"{position.title} V{version_no}", prompt_snapshot=task.get("prompt_snapshot"), jd_markdown=markdown, jd_html=html, publish_text=publish_text, notes=extra_prompt or None, is_active=bool(auto_activate), created_by=actor_id)
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
        row = RecruitmentJDVersion(position_id=position.id, version_no=version_no, title=str(payload.get("title") or position.title).strip(), prompt_snapshot=None, jd_markdown=str(payload.get("jd_markdown") or ""), jd_html=payload.get("jd_html") or markdown_to_html(str(payload.get("jd_markdown") or "")), publish_text=payload.get("publish_text") or strip_markdown(str(payload.get("jd_markdown") or "")), notes=payload.get("notes"), is_active=bool(payload.get("auto_activate")), created_by=actor_id)
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
        return {"id": row.id, "config_key": row.config_key, "task_type": row.task_type, "provider": row.provider, "model_name": row.model_name, "base_url": row.base_url, "api_key_env": row.api_key_env, "api_key_masked": runtime.api_key_masked, "has_stored_api_key": bool(row.api_key_ciphertext), "has_runtime_api_key": bool(runtime.api_key), "extra_config": json_loads_safe(row.extra_config_json, None), "is_active": bool(row.is_active), "priority": row.priority, "resolved_provider": runtime.provider, "resolved_model_name": runtime.model_name, "resolved_base_url": runtime.base_url, "resolved_source": runtime.source, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_llm_configs(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentLLMConfig).order_by(RecruitmentLLMConfig.task_type.asc(), RecruitmentLLMConfig.priority.asc(), RecruitmentLLMConfig.id.asc()).all()
        return [self._serialize_llm_config(row) for row in rows]

    def create_llm_config(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        row = RecruitmentLLMConfig(config_key=str(payload.get("config_key") or "").strip(), task_type=payload.get("task_type") or "default", provider=str(payload.get("provider") or "openai-compatible").strip(), model_name=str(payload.get("model_name") or "").strip(), base_url=payload.get("base_url"), api_key_env=payload.get("api_key_env"), api_key_ciphertext=self._safe_encrypt_secret(str(payload.get("api_key_value") or "")) if payload.get("api_key_value") else None, extra_config_json=json_dumps_safe(payload.get("extra_config") or {}), is_active=payload.get("is_active") is not False, priority=int(payload.get("priority") or 99))
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_llm_config(row)

    def update_llm_config(self, config_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        row = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.id == config_id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        for field in ["config_key", "task_type", "provider", "model_name", "base_url", "api_key_env", "is_active", "priority"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "extra_config" in payload:
            row.extra_config_json = json_dumps_safe(payload.get("extra_config") or {})
        api_key_value = str(payload.get("api_key_value") or "").strip()
        if api_key_value:
            row.api_key_ciphertext = self._safe_encrypt_secret(api_key_value)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_llm_config(row)

    def delete_llm_config(self, config_id: int) -> None:
        row = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.id == config_id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        self.db.delete(row)
        self.db.commit()

    def _serialize_mail_sender(self, row: RecruitmentMailSenderConfig) -> Dict[str, Any]:
        password = decrypt_secret(row.password_ciphertext or "")
        return {"id": row.id, "name": row.name, "from_name": row.from_name, "from_email": row.from_email, "smtp_host": row.smtp_host, "smtp_port": row.smtp_port, "username": row.username, "password_masked": mask_secret(password), "has_password": bool(password), "use_ssl": bool(row.use_ssl), "use_starttls": bool(row.use_starttls), "is_default": bool(row.is_default), "is_enabled": bool(row.is_enabled), "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_mail_senders(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False)).order_by(RecruitmentMailSenderConfig.is_default.desc(), RecruitmentMailSenderConfig.id.asc()).all()
        return [self._serialize_mail_sender(row) for row in rows]

    def create_mail_sender(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        if payload.get("is_default"):
            self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False)).update({RecruitmentMailSenderConfig.is_default: False}, synchronize_session=False)
        row = RecruitmentMailSenderConfig(name=str(payload.get("name") or "").strip(), from_name=payload.get("from_name"), from_email=str(payload.get("from_email") or "").strip(), smtp_host=str(payload.get("smtp_host") or "").strip(), smtp_port=int(payload.get("smtp_port") or 465), username=str(payload.get("username") or "").strip(), password_ciphertext=self._safe_encrypt_secret(str(payload.get("password") or "")) if payload.get("password") else None, use_ssl=payload.get("use_ssl") is not False, use_starttls=bool(payload.get("use_starttls")), is_default=bool(payload.get("is_default")), is_enabled=payload.get("is_enabled") is not False, created_by=actor_id, updated_by=actor_id, deleted=False)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_sender(row)

    def update_mail_sender(self, sender_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == sender_id, RecruitmentMailSenderConfig.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        if payload.get("is_default"):
            self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False), RecruitmentMailSenderConfig.id != sender_id).update({RecruitmentMailSenderConfig.is_default: False}, synchronize_session=False)
        for field in ["name", "from_name", "from_email", "smtp_host", "smtp_port", "username", "use_ssl", "use_starttls", "is_default", "is_enabled"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        password = str(payload.get("password") or "").strip()
        if password:
            row.password_ciphertext = self._safe_encrypt_secret(password)
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_sender(row)

    def delete_mail_sender(self, sender_id: int, actor_id: str) -> None:
        row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == sender_id, RecruitmentMailSenderConfig.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        row.deleted = True
        row.updated_by = actor_id
        row.is_default = False
        self.db.add(row)
        self.db.commit()

    def _serialize_mail_recipient(self, row: RecruitmentMailRecipient) -> Dict[str, Any]:
        return {"id": row.id, "name": row.name, "email": row.email, "department": row.department, "role_title": row.role_title, "tags": json_loads_safe(row.tags_json, []), "notes": row.notes, "is_enabled": bool(row.is_enabled), "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_mail_recipients(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.deleted.is_(False)).order_by(RecruitmentMailRecipient.id.asc()).all()
        return [self._serialize_mail_recipient(row) for row in rows]

    def create_mail_recipient(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = RecruitmentMailRecipient(name=str(payload.get("name") or "").strip(), email=str(payload.get("email") or "").strip(), department=payload.get("department"), role_title=payload.get("role_title"), tags_json=json_dumps_safe(payload.get("tags") or []), notes=payload.get("notes"), is_enabled=payload.get("is_enabled") is not False, created_by=actor_id, updated_by=actor_id, deleted=False)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_recipient(row)

    def update_mail_recipient(self, recipient_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.id == recipient_id, RecruitmentMailRecipient.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        for field in ["name", "email", "department", "role_title", "notes", "is_enabled"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "tags" in payload:
            row.tags_json = json_dumps_safe(payload.get("tags") or [])
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_recipient(row)

    def delete_mail_recipient(self, recipient_id: int, actor_id: str) -> None:
        row = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.id == recipient_id, RecruitmentMailRecipient.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        row.deleted = True
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
    def _serialize_mail_dispatch(self, row: RecruitmentResumeMailDispatch) -> Dict[str, Any]:
        sender = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == row.sender_config_id).first() if row.sender_config_id else None
        return {"id": row.id, "sender_config_id": row.sender_config_id, "sender_name": sender.name if sender else None, "candidate_ids": json_loads_safe(row.candidate_ids_json, []), "recipient_ids": json_loads_safe(row.recipient_ids_json, []), "recipient_emails": json_loads_safe(row.recipient_emails_json, []), "subject": row.subject, "body_text": row.body_text, "body_html": row.body_html, "attachment_count": row.attachment_count, "status": row.status, "error_message": row.error_message, "sent_at": isoformat_or_none(row.sent_at), "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _build_sender_runtime(self, row: RecruitmentMailSenderConfig) -> RecruitmentMailSenderRuntime:
        password = decrypt_secret(row.password_ciphertext or "")
        if not password:
            raise ValueError("鎿嶄綔澶辫触")
        return RecruitmentMailSenderRuntime(from_email=row.from_email, from_name=row.from_name, smtp_host=row.smtp_host, smtp_port=row.smtp_port, username=row.username, password=password, use_ssl=bool(row.use_ssl), use_starttls=bool(row.use_starttls))

    def list_resume_mail_dispatches(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentResumeMailDispatch).order_by(RecruitmentResumeMailDispatch.created_at.desc(), RecruitmentResumeMailDispatch.id.desc()).all()
        return [self._serialize_mail_dispatch(row) for row in rows]

    def send_resume_mail_dispatch(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        sender_row = None
        if payload.get("sender_config_id"):
            sender_row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == int(payload.get("sender_config_id")), RecruitmentMailSenderConfig.deleted.is_(False), RecruitmentMailSenderConfig.is_enabled.is_(True)).first()
        if not sender_row:
            sender_row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False), RecruitmentMailSenderConfig.is_enabled.is_(True), RecruitmentMailSenderConfig.is_default.is_(True)).first()
        if not sender_row:
            sender_row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False), RecruitmentMailSenderConfig.is_enabled.is_(True)).order_by(RecruitmentMailSenderConfig.id.asc()).first()
        if not sender_row:
            raise ValueError("鎿嶄綔澶辫触")
        candidate_ids = _dedupe_ints(payload.get("candidate_ids") or [])
        if not candidate_ids:
            raise ValueError("鎿嶄綔澶辫触")
        candidates = [self._get_candidate(candidate_id) for candidate_id in candidate_ids]
        recipient_ids = _dedupe_ints(payload.get("recipient_ids") or [])
        recipient_rows = self._load_mail_recipient_rows(recipient_ids)
        recipient_emails = _dedupe_texts([row.email for row in recipient_rows] + list(payload.get("recipient_emails") or []))
        if not recipient_emails:
            raise ValueError("鎿嶄綔澶辫触")
        subject = str(payload.get("subject") or "").strip() or f"候选人简历推荐 - {', '.join([item.name for item in candidates][:3])}"
        body_text = str(payload.get("body_text") or "").strip() or "\n".join([
            f"候选人：{item.name} / 岗位：{self._serialize_candidate_summary(item).get('position_title') or '未关联岗位'}"
            for item in candidates
        ])
        body_html = payload.get("body_html") or None
        dispatch = RecruitmentResumeMailDispatch(sender_config_id=sender_row.id, candidate_ids_json=json_dumps_safe(candidate_ids), recipient_ids_json=json_dumps_safe(recipient_ids), recipient_emails_json=json_dumps_safe(recipient_emails), subject=subject, body_text=body_text, body_html=body_html, attachment_count=0, status="pending", created_by=actor_id)
        self.db.add(dispatch)
        self.db.flush()
        attachments = []
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
        dispatch.attachment_count = len(attachments)
        self.db.add(dispatch)
        self.db.commit()
        runtime = self._build_sender_runtime(sender_row)
        try:
            message = build_resume_email(sender=runtime, recipients=recipient_emails, subject=subject, body_text=body_text, body_html=body_html, attachments=attachments)
            send_email_via_smtp(runtime, message, recipient_emails)
            dispatch.status = "sent"
            dispatch.error_message = None
            dispatch.sent_at = func.now()
        except Exception as exc:
            dispatch.status = "failed"
            dispatch.error_message = str(exc)
            self.db.add(dispatch)
            self.db.commit()
            raise ValueError(str(exc)) from exc
        self.db.add(dispatch)
        self.db.commit()
        self.db.refresh(dispatch)
        return self._serialize_mail_dispatch(dispatch)

    def _load_mail_recipient_rows(self, recipient_ids: Iterable[Any]) -> List[RecruitmentMailRecipient]:
        normalized = _dedupe_ints(recipient_ids)
        if not normalized:
            return []
        rows = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.id.in_(normalized), RecruitmentMailRecipient.deleted.is_(False), RecruitmentMailRecipient.is_enabled.is_(True)).all()
        order_map = {item: index for index, item in enumerate(normalized)}
        rows.sort(key=lambda row: order_map.get(row.id, 9999))
        return rows

    def list_ai_task_logs(self, task_type: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        builder = self.db.query(RecruitmentAITaskLog)
        if task_type:
            builder = builder.filter(RecruitmentAITaskLog.task_type == task_type)
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
        if self._settle_orphaned_live_task(row):
            self.db.commit()
            self.db.refresh(row)
        return self._serialize_ai_task_log(row, include_full_request_snapshot=True)

    def create_publish_task(self, position_id: int, target_platform: str, mode: str, actor_id: str) -> Dict[str, Any]:
        position = self._get_position(position_id)
        current_jd = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.id == position.current_jd_version_id).first() if position.current_jd_version_id else None
        payload = {"position_id": position.id, "target_platform": target_platform, "mode": mode, "title": position.title, "department": position.department, "location": position.location, "publish_text": current_jd.publish_text if current_jd else None}
        adapter = build_publish_adapter(target_platform, mode)
        row = RecruitmentPublishTask(position_id=position.id, target_platform=target_platform, mode=mode, adapter_code=adapter.adapter_code, status="pending", request_payload=json_dumps_safe(payload), created_by=actor_id)
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
        builder = self.db.query(RecruitmentPublishTask)
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
            row = RecruitmentChatContextMemory(user_id=user_id, position_id=position_id, candidate_id=candidate_id, skill_ids_json=json_dumps_safe(_dedupe_ints(skill_ids)), context_json=json_dumps_safe({}))
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
            latest_score_log = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.task_type == "resume_score", RecruitmentAITaskLog.related_candidate_id == candidate.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).first()
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
