import json
import logging
import os
import re
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Callable, Deque, Dict, List, Optional, Sequence

import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..permission_governance import PermissionContext, resource_is_visible_to_context
from ..recruitment_models import RecruitmentLLMConfig
from ..secret_crypto import decrypt_secret, mask_secret
from .recruitment_task_control import RecruitmentTaskCancelled, RecruitmentTaskControl

logger = logging.getLogger(__name__)

JSON_REPAIR_MAX_ROUNDS = 2
JSON_RETRYABLE_MIN_EMPTY_LENGTH = 32
SCREENING_TOTAL_TIMEOUT_SECONDS = 300
SCREENING_STAGE_MIN_TIMEOUT_SECONDS = 20
REQUEST_HEADER_SNAPSHOT_LIMIT = 20
OPENAI_STREAM_JSON_TASK_WHITELIST: frozenset[str] = frozenset({
    "resume_screening_one_pass",
    "resume_score",
    "resume_parse",
})
STRICT_JSON_TASK_TYPES: frozenset[str] = frozenset({"resume_parse", "resume_score", "resume_screening_one_pass", "interview_question_generation"})
STRICT_JSON_RECOVERY_RETRY_TASK_TYPES: frozenset[str] = frozenset({"resume_parse", "resume_score", "resume_screening_one_pass", "interview_question_generation", "ai_position_match"})
STRICT_SCORE_REQUIRED_FIELDS: tuple[str, ...] = (
    "total_score",
    "match_percent",
    "advantages",
    "concerns",
    "recommendation",
    "suggested_status",
    "dimensions",
)
STRICT_PARSE_PRIMARY_FIELDS: tuple[str, ...] = (
    "basic_info",
    "work_experiences",
    "education_experiences",
    "skills",
    "projects",
    "summary",
)


class RecruitmentAIJSONParseError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        raw_response_text: str = "",
        provider_payload: Any = None,
        error_code: str = "json_parse_failed",
        debug_meta: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.raw_response_text = raw_response_text or ""
        self.provider_payload = provider_payload
        self.error_code = str(error_code or "json_parse_failed").strip() or "json_parse_failed"
        self.debug_meta = dict(debug_meta or {})


class RecruitmentAITimeoutError(RuntimeError):
    def __init__(self, message: str, *, last_error: Optional[Exception] = None):
        super().__init__(message)
        self.last_error = last_error


class RecruitmentAIScreeningTotalTimeoutError(RecruitmentAITimeoutError):
    def __init__(
        self,
        message: str,
        *,
        total_timeout_seconds: float,
        remaining_budget_seconds: Optional[float] = None,
        last_error: Optional[Exception] = None,
    ):
        super().__init__(message, last_error=last_error)
        self.total_timeout_seconds = float(total_timeout_seconds)
        self.remaining_budget_seconds = remaining_budget_seconds


class RecruitmentAIRetryExhaustedError(RuntimeError):
    def __init__(self, message: str, *, last_error: Optional[Exception] = None, attempts: int = 0):
        super().__init__(message)
        self.last_error = last_error
        self.attempts = attempts


def _truncate(value: Any, limit: int = 1000) -> str:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}..."


def _strip_json_fences(value: str) -> str:
    text = (value or "").strip()
    fenced_match = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.IGNORECASE | re.DOTALL)
    if fenced_match:
        text = fenced_match.group(1).strip()
    text = re.sub(r"^\s*```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```\s*$", "", text)
    return text.strip()


def _normalize_json_candidate_text(value: str) -> str:
    text = str(value or '').strip()
    if not text:
        return '{}'
    text = text.replace('\ufeff', '').replace('\u2019', "'")
    # 修复中文逗号和冒号：AI 模型有时会在 JSON 中使用中文标点
    text = text.replace('\uff0c', ',')
    text = text.replace('\uff1a', ':')
    text = re.sub(r'^\s*(?:json|JSON)\s*[:\uff1a]\s*', '', text)
    text = re.sub(r"^\s*Here(?:'s| is)?\s+the\s+JSON\s*[:\uff1a]\s*", '', text, flags=re.IGNORECASE)
    text = re.sub(r'^\s*以下是(?:结果|JSON)?\s*[:\uff1a]\s*', '', text)
    return text


def _extract_json_candidate(value: str) -> str:
    text = _normalize_json_candidate_text(_strip_json_fences(value))
    start = -1
    for index, char in enumerate(text):
        if char in "{[":
            start = index
            break
    if start != -1:
        stack: list[str] = []
        in_string = False
        escape = False
        for index in range(start, len(text)):
            char = text[index]
            if escape:
                escape = False
                continue
            if char == "\\":
                escape = True
                continue
            if char == "\"":
                in_string = not in_string
                continue
            if in_string:
                continue
            if char == "{":
                stack.append("}")
                continue
            if char == "[":
                stack.append("]")
                continue
            if char in "}]" and stack:
                expected = stack[-1]
                if char == expected:
                    stack.pop()
                    if not stack:
                        return text[start:index + 1]
    object_start = text.find("{")
    object_end = text.rfind("}")
    if object_start != -1 and object_end != -1 and object_end > object_start:
        return text[object_start:object_end + 1]
    list_start = text.find("[")
    list_end = text.rfind("]")
    if list_start != -1 and list_end != -1 and list_end > list_start:
        return text[list_start:list_end + 1]
    return text


def _balance_json_closers(value: str) -> str:
    text = str(value or "")
    if not text:
        return ""
    stack: list[str] = []
    in_string = False
    escape = False
    for char in text:
        if escape:
            escape = False
            continue
        if char == "\\":
            escape = True
            continue
        if char == "\"":
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == "{":
            stack.append("}")
        elif char == "[":
            stack.append("]")
        elif char in "}]" and stack and char == stack[-1]:
            stack.pop()
    balanced = text
    if in_string:
        balanced = f'{balanced}"'
    if stack:
        balanced = f"{balanced}{''.join(reversed(stack))}"
    return balanced


def _repair_missing_commas_globally(value: str) -> str:
    repaired = str(value or "")
    pattern = r'("(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?|\}|\])(\s*)(?="(?:\\.|[^"\\])*"\s*:)'
    for _ in range(2):
        previous = repaired
        repaired = re.sub(pattern, r"\1,\2", repaired, flags=re.IGNORECASE)
        if repaired == previous:
            break
    return repaired


def _repair_json_candidate(value: str) -> str:
    repaired = _normalize_json_candidate_text(_extract_json_candidate(value or "{}").strip() or "{}")
    repaired = _escape_control_chars_in_json_strings(repaired)
    repaired = _repair_missing_commas_globally(repaired)
    repaired = re.sub(r",(\s*[}\]])", r"\1", repaired)
    repaired = _balance_json_closers(repaired)
    return repaired


def _escape_control_chars_in_json_strings(value: str) -> str:
    result: list[str] = []
    in_string = False
    escape = False
    for char in value:
        if escape:
            result.append(char)
            escape = False
            continue
        if char == "\\":
            result.append(char)
            escape = True
            continue
        if char == "\"":
            result.append(char)
            in_string = not in_string
            continue
        if in_string:
            if char == "\n":
                result.append("\\n")
                continue
            if char == "\r":
                result.append("\\r")
                continue
            if char == "\t":
                result.append("\\t")
                continue
            if ord(char) < 0x20:
                result.append(f"\\u{ord(char):04x}")
                continue
        result.append(char)
    return "".join(result)


def _next_nonspace_index(value: str, start: int) -> Optional[int]:
    for index in range(max(0, start), len(value)):
        if not value[index].isspace():
            return index
    return None


def _repair_missing_comma_from_error(value: str, exc: json.JSONDecodeError) -> Optional[str]:
    if "Expecting ',' delimiter" not in str(exc):
        return None
    position = getattr(exc, "pos", None)
    if position is None:
        return None
    next_index = _next_nonspace_index(value, position)
    if next_index is None:
        return None
    before = value[:next_index]
    after = value[next_index:]
    if not re.search(r'(?:\"|\}|\]|\d|true|false|null)\s*$', before):
        return None
    if not re.match(r'^\s*(?:\"|\{|\[|-?\d|true\b|false\b|null\b)', after):
        return None
    return f"{value[:next_index]},{value[next_index:]}"


def _repair_unterminated_string_from_error(value: str, exc: json.JSONDecodeError) -> Optional[str]:
    message = str(exc)
    if "Unterminated string" not in message and "Invalid control character" not in message:
        return None
    if value.count("\"") % 2 == 0:
        return None
    return _balance_json_closers(f'{value}"')


def _parse_llm_json_response(raw_text: str) -> Dict[str, Any]:
    repaired = _repair_json_candidate(raw_text or "{}")
    last_error: Optional[json.JSONDecodeError] = None
    for _ in range(JSON_REPAIR_MAX_ROUNDS):
        try:
            return json.loads(repaired)
        except json.JSONDecodeError as exc:
            last_error = exc
            missing_comma_repaired = _repair_missing_comma_from_error(repaired, exc)
            if missing_comma_repaired and missing_comma_repaired != repaired:
                repaired = _repair_json_candidate(missing_comma_repaired)
                continue
            unterminated_string_repaired = _repair_unterminated_string_from_error(repaired, exc)
            if unterminated_string_repaired and unterminated_string_repaired != repaired:
                repaired = _repair_json_candidate(unterminated_string_repaired)
                continue
            narrowed = _extract_json_candidate(repaired).strip() or repaired
            if narrowed != repaired:
                repaired = _repair_json_candidate(narrowed)
                continue
            balanced = _balance_json_closers(repaired)
            if balanced != repaired:
                repaired = _repair_json_candidate(balanced)
                continue
            break
    if last_error is not None:
        raise RecruitmentAIJSONParseError(
            f"AI screening JSON 解析失败: {last_error}",
            raw_response_text=str(raw_text or ""),
            provider_payload={"repaired_candidate": repaired},
        ) from last_error
    try:
        return json.loads(repaired)
    except json.JSONDecodeError as exc:
        raise RecruitmentAIJSONParseError(
            f"AI screening JSON 解析失败: {exc}",
            raw_response_text=str(raw_text or ""),
            provider_payload={"repaired_candidate": repaired},
        ) from exc


def _strip_reasoning_blocks(value: Any) -> str:
    text = str(value or "")
    if not text:
        return ""
    text = re.sub(r"<think\b[^>]*>.*?</think>", " ", text, flags=re.IGNORECASE | re.DOTALL)
    return text


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
        char = value[index]
        if escape:
            escape = False
            continue
        if char == "\\":
            escape = True
            continue
        if char == "\"":
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == "{":
            stack.append("}")
        elif char == "[":
            stack.append("]")
        elif char in "}]" and stack and char == stack[-1]:
            stack.pop()
            if not stack:
                candidate = value[start:index + 1].strip()
                return candidate or None
    return None


def _extract_top_level_json_candidates(raw_text: Any, *, limit: int = 6) -> List[str]:
    text = _normalize_json_candidate_text(_strip_reasoning_blocks(raw_text))
    if not text:
        return []
    candidate_ranges: List[tuple[int, int, str]] = []
    for index, char in enumerate(text):
        if char not in "{[":
            continue
        candidate = _extract_balanced_json_candidate_from_index(text, index)
        if not candidate:
            continue
        end = index + len(candidate)
        candidate_ranges.append((index, end, candidate.strip()))
    candidate_ranges.sort(key=lambda item: (item[0], -(item[1] - item[0])))
    top_level_ranges: List[tuple[int, int, str]] = []
    seen: set[str] = set()
    for start, end, candidate in candidate_ranges:
        if not candidate or candidate in seen:
            continue
        if any(start >= kept_start and end <= kept_end for kept_start, kept_end, _kept in top_level_ranges):
            continue
        seen.add(candidate)
        top_level_ranges.append((start, end, candidate))
        if len(top_level_ranges) >= limit:
            break
    candidates = [candidate for _start, _end, candidate in sorted(top_level_ranges, key=lambda item: item[0])]
    fallback_candidate = _extract_json_candidate(text).strip()
    if fallback_candidate and fallback_candidate not in seen:
        candidates.append(fallback_candidate)
    return candidates[:limit]


def _parse_numeric_score(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_status_token(value: Any) -> str:
    return str(value or "").strip().lower()


def _normalize_dimension_label_set(dimensions: Any) -> tuple[str, ...]:
    labels: List[str] = []
    for item in dimensions if isinstance(dimensions, list) else []:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        labels.append(label)
    return tuple(sorted(dict.fromkeys(labels)))


def _has_meaningful_field(payload: Dict[str, Any], field: str) -> bool:
    if not isinstance(payload, dict):
        return False
    value = payload.get(field)
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, dict):
        return len(value) > 0
    return bool(str(value or "").strip()) if value is not None else False


def _build_resume_score_candidate_record(record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    payload = record.get("payload")
    if not isinstance(payload, dict):
        return None
    has_top_level_score_fields = any(field in payload for field in STRICT_SCORE_REQUIRED_FIELDS)
    has_parsed_resume = isinstance(payload.get("parsed_resume"), dict)
    nested_score = payload.get("score") if isinstance(payload.get("score"), dict) else None
    source = "score_only"
    score_payload = payload
    source_priority = 3
    if has_parsed_resume and nested_score:
        source = "nested_score"
        score_payload = nested_score or {}
        source_priority = 1
    elif has_parsed_resume and has_top_level_score_fields:
        source = "embedded_top_level_score"
        source_priority = 2
    completeness = sum(1 for field in STRICT_SCORE_REQUIRED_FIELDS if _has_meaningful_field(score_payload, field))
    if completeness <= 0:
        return None
    return {
        **record,
        "score_payload": score_payload if isinstance(score_payload, dict) else {},
        "source": source,
        "source_priority": source_priority,
        "completeness": completeness,
        "dimension_labels": _normalize_dimension_label_set((score_payload or {}).get("dimensions")),
        "normalized_status": _normalize_status_token((score_payload or {}).get("suggested_status")),
        "normalized_total_score": (
            round(_parse_numeric_score((score_payload or {}).get("total_score")) + 1e-9, 1)
            if _parse_numeric_score((score_payload or {}).get("total_score")) is not None
            else None
        ),
    }


def _select_resume_score_candidate(records: Sequence[Dict[str, Any]], *, raw_text: str) -> Dict[str, Any]:
    score_records = [item for item in (_build_resume_score_candidate_record(record) for record in records) if item]
    if not score_records:
        raise RecruitmentAIJSONParseError(
            "AI screening JSON 解析失败: 未找到合法的 score-only JSON 候选",
            raw_response_text=raw_text,
            error_code="json_parse_failed",
            debug_meta={
                "candidate_count": len(records),
                "parsed_candidate_count": len(records),
                "task_type": "resume_score",
            },
        )
    best_priority = max(item.get("source_priority") or 0 for item in score_records)
    preferred_records = [item for item in score_records if (item.get("source_priority") or 0) == best_priority]
    status_set = {item.get("normalized_status") for item in preferred_records if item.get("normalized_status")}
    total_score_set = {item.get("normalized_total_score") for item in preferred_records if item.get("normalized_total_score") is not None}
    dimension_label_sets = {item.get("dimension_labels") for item in preferred_records if item.get("dimension_labels")}
    reasons: List[str] = []
    if len(status_set) > 1:
        reasons.append("suggested_status 在同次模型返回中发生漂移")
    if len(total_score_set) > 1:
        reasons.append("total_score 在同次模型返回中发生漂移")
    if len(dimension_label_sets) > 1:
        reasons.append("dimensions label 集在同次模型返回中发生漂移")
    if reasons:
        raise RecruitmentAIJSONParseError(
            f"AI screening JSON 存在冲突版本：{'；'.join(reasons)}",
            raw_response_text=raw_text,
            error_code="invalid_json_variant_conflict",
            debug_meta={
                "task_type": "resume_score",
                "candidate_count": len(records),
                "parsed_candidate_count": len(score_records),
                "preferred_candidate_count": len(preferred_records),
                "preferred_sources": [item.get("source") for item in preferred_records],
                "variant_statuses": sorted(status_set),
                "variant_total_scores": sorted(total_score_set),
                "variant_dimension_labels": [list(item) for item in sorted(dimension_label_sets)],
                "reasons": reasons,
            },
        )
    selected = max(
        preferred_records,
        key=lambda item: ((item.get("completeness") or 0), len(str(item.get("candidate_text") or ""))),
    )
    warnings: List[str] = []
    if len(records) > 1:
        warnings.append(f"resume_score 检测到 {len(records)} 个顶层 JSON 候选，已选用最完整的 score-only 对象")
    if selected.get("source") != "score_only":
        warnings.append("resume_score 未直接返回 score-only JSON，已安全提取 score 字段继续处理")
    return {
        "content": dict(selected.get("score_payload") or {}),
        "warnings": warnings,
        "debug_meta": {
            "candidate_count": len(records),
            "parsed_candidate_count": len(score_records),
            "selected_candidate_index": selected.get("index"),
            "selected_candidate_source": selected.get("source"),
            "selected_candidate_completeness": selected.get("completeness"),
        },
    }


def _select_resume_parse_candidate(records: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    def completeness(payload: Dict[str, Any]) -> int:
        score = 0
        for field in STRICT_PARSE_PRIMARY_FIELDS:
            if _has_meaningful_field(payload, field):
                score += 1
        if isinstance(payload.get("basic_info"), dict):
            score += sum(1 for item in payload.get("basic_info", {}).values() if str(item or "").strip())
        return score

    selected = max(
        records,
        key=lambda item: (completeness(item.get("payload") or {}), len(str(item.get("candidate_text") or ""))),
    )
    warnings = []
    if len(records) > 1:
        warnings.append(f"resume_parse 检测到 {len(records)} 个顶层 JSON 候选，已跳过异常片段并选用最完整对象")
    return {
        "content": dict(selected.get("payload") or {}),
        "warnings": warnings,
        "debug_meta": {
            "candidate_count": len(records),
            "parsed_candidate_count": len(records),
            "selected_candidate_index": selected.get("index"),
            "selected_candidate_source": "top_level_object",
        },
    }


def _select_one_pass_candidate(records: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    BASIC_INFO_SUBFIELDS = ("name", "phone", "email", "years_of_experience", "education", "location")

    def completeness(payload: Dict[str, Any]) -> tuple[int, int, int, int]:
        parsed_resume = payload.get("parsed_resume") if isinstance(payload.get("parsed_resume"), dict) else {}
        nested_score = payload.get("score") if isinstance(payload.get("score"), dict) else {}
        top_level_score_fields = sum(1 for field in STRICT_SCORE_REQUIRED_FIELDS if _has_meaningful_field(payload, field))
        nested_score_fields = sum(1 for field in STRICT_SCORE_REQUIRED_FIELDS if _has_meaningful_field(nested_score, field))
        parsed_resume_fields = sum(1 for field in STRICT_PARSE_PRIMARY_FIELDS if _has_meaningful_field(parsed_resume, field))
        basic_info = parsed_resume.get("basic_info") if isinstance(parsed_resume, dict) else None
        basic_info_subfield_count = (
            sum(1 for field in BASIC_INFO_SUBFIELDS if _has_meaningful_field(basic_info, field))
            if isinstance(basic_info, dict) else 0
        )
        return (
            1 if isinstance(payload.get("parsed_resume"), dict) else 0,
            nested_score_fields or top_level_score_fields,
            parsed_resume_fields,
            basic_info_subfield_count,
        )

    eligible = []
    for record in records:
        payload = record.get("payload")
        if not isinstance(payload, dict):
            continue
        if not isinstance(payload.get("parsed_resume"), dict):
            continue
        if not isinstance(payload.get("score"), dict) and not any(field in payload for field in STRICT_SCORE_REQUIRED_FIELDS):
            continue
        eligible.append(record)
    selected_pool = eligible or list(records)
    selected = max(
        selected_pool,
        key=lambda item: (*completeness(item.get("payload") or {}), len(str(item.get("candidate_text") or ""))),
    )
    warnings: List[str] = []
    if len(records) > 1:
        warnings.append(f"one-pass 检测到 {len(records)} 个顶层 JSON 候选，已选用 parsed_resume + score 最完整的对象")
    return {
        "content": dict(selected.get("payload") or {}),
        "warnings": warnings,
        "debug_meta": {
            "candidate_count": len(records),
            "parsed_candidate_count": len(records),
            "selected_candidate_index": selected.get("index"),
            "selected_candidate_source": "top_level_object",
        },
    }


def _parse_strict_json_response(
    raw_text: str,
    *,
    task_type: str,
    provider_payload: Any = None,
    response_debug: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    # --- FAST PATH: skip full repair pipeline when raw text is already valid JSON ---
    _fast_stripped = (raw_text or "").strip()
    if _fast_stripped and _fast_stripped[0] == "{":
        try:
            _fast_parsed = json.loads(_fast_stripped)
            if isinstance(_fast_parsed, dict):
                _fast_records = [{"index": 0, "candidate_text": _fast_stripped, "payload": _fast_parsed}]
                if task_type == "resume_score":
                    _fast_selected = _select_resume_score_candidate(_fast_records, raw_text=raw_text)
                elif task_type == "resume_parse":
                    _fast_selected = _select_resume_parse_candidate(_fast_records)
                else:
                    _fast_selected = _select_one_pass_candidate(_fast_records)
                return {
                    "content": _fast_selected.get("content") or {},
                    "warnings": [*list(_fast_selected.get("warnings") or []), "fast_path_json_parse"],
                    "debug_meta": {
                        **dict(response_debug or {}),
                        **dict(_fast_selected.get("debug_meta") or {}),
                        "task_type": task_type,
                        "fast_path": True,
                    },
                }
        except (json.JSONDecodeError, ValueError):
            pass  # fall through to full repair pipeline

    # --- FULL PIPELINE: extract candidates, repair, and select ---
    candidate_texts = _extract_top_level_json_candidates(raw_text, limit=6)
    stripped_raw_text = str(raw_text or "").strip()
    if not candidate_texts and stripped_raw_text:
        candidate_texts = [stripped_raw_text]
    parsed_records: List[Dict[str, Any]] = []
    parse_errors: List[Dict[str, Any]] = []
    for index, candidate_text in enumerate(candidate_texts):
        try:
            parsed_payload = _parse_llm_json_response(candidate_text)
        except RecruitmentAIJSONParseError as exc:
            parse_errors.append(
                {
                    "candidate_index": index,
                    "error_code": getattr(exc, "error_code", "json_parse_failed"),
                    "error_message": str(exc),
                    "repaired_candidate": dict(getattr(exc, "provider_payload", {}) or {}).get("repaired_candidate"),
                }
            )
            continue
        if not isinstance(parsed_payload, dict):
            parse_errors.append(
                {
                    "candidate_index": index,
                    "error_code": "invalid_json_root_type",
                    "error_message": "解析后的 JSON 根节点不是对象",
                }
            )
            continue
        parsed_records.append(
            {
                "index": index,
                "candidate_text": candidate_text,
                "payload": parsed_payload,
            }
        )
    if not parsed_records:
        debug_meta = {
            **dict(response_debug or {}),
            "task_type": task_type,
            "candidate_count": len(candidate_texts),
            "parsed_candidate_count": 0,
            "candidate_parse_errors": parse_errors,
        }
        provider_payload_snapshot = (
            {
                "provider_payload": provider_payload,
                "candidate_parse_errors": parse_errors,
                "candidate_texts": candidate_texts,
            }
            if provider_payload is not None
            else {"candidate_parse_errors": parse_errors, "candidate_texts": candidate_texts}
        )
        raise RecruitmentAIJSONParseError(
            "AI screening JSON 解析失败: 未找到可解析的 JSON 对象",
            raw_response_text=raw_text,
            error_code="json_parse_failed",
            debug_meta=debug_meta,
            provider_payload=provider_payload_snapshot,
        )
    if task_type == "resume_score":
        selected = _select_resume_score_candidate(parsed_records, raw_text=raw_text)
    elif task_type == "resume_parse":
        selected = _select_resume_parse_candidate(parsed_records)
    else:
        selected = _select_one_pass_candidate(parsed_records)
    return {
        "content": selected.get("content") or {},
        "warnings": list(selected.get("warnings") or []),
        "debug_meta": {
            **dict(response_debug or {}),
            **dict(selected.get("debug_meta") or {}),
            "task_type": task_type,
            "candidate_count": len(candidate_texts),
            "parsed_candidate_count": len(parsed_records),
            "candidate_parse_errors": parse_errors,
        },
    }


def _should_retry_strict_json_recovery(task_type: str, exc: Exception) -> bool:
    if task_type not in STRICT_JSON_RECOVERY_RETRY_TASK_TYPES:
        return False
    if not isinstance(exc, RecruitmentAIJSONParseError):
        return False
    error_code = str(getattr(exc, "error_code", "") or "json_parse_failed").strip() or "json_parse_failed"
    return error_code in {"json_parse_failed", "invalid_provider_payload", "empty_response", "invalid_json_variant_conflict"}


def _dump_request_snapshot(value: Dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


def _format_http_error(exc: Exception) -> str:
    if isinstance(exc, RecruitmentAIJSONParseError):
        return str(exc)

    if isinstance(exc, httpx.HTTPStatusError):
        response = exc.response
        status = response.status_code
        reason = response.reason_phrase or "HTTP Error"
        body = ""
        try:
            body = (response.text or "").strip()
        except Exception:
            body = ""
        details = _truncate(body, 1200) if body else ""
        if details:
            return f"{status} {reason}: {details}"
        return f"{status} {reason}"

    if isinstance(exc, httpx.RequestError):
        request = exc.request
        target = request.url if request else ""
        if target:
            return f"Request error for {target}: {exc}"
        return f"Request error: {exc}"

    return str(exc)


def _is_glm_json_request(config: "RecruitmentLLMRuntimeConfig", *, response_mode: str) -> bool:
    if response_mode != "json":
        return False
    provider = (config.provider or "").strip().lower()
    model_name = (config.model_name or "").strip().lower()
    if provider in {"glm", "zhipu"}:
        return True
    # 覆盖所有 glm- 前缀模型，包括 glm-5、glm-4.5-air 等新版本
    if model_name.startswith("glm-"):
        return True
    return False


def _resolve_request_temperature(config: "RecruitmentLLMRuntimeConfig", *, response_mode: str) -> float | int:
    if response_mode != "json":
        return 0.3
    return 0


def _resolve_openai_json_response_format(config: "RecruitmentLLMRuntimeConfig", *, response_mode: str) -> Optional[Dict[str, str]]:
    if response_mode != "json":
        return None
    provider = (config.provider or "").strip().lower()
    model_name = (config.model_name or "").strip().lower()
    if bool((config.extra_config or {}).get("force_json_object_response")) and config.runtime_provider == "openai-compatible":
        return {"type": "json_object"}
    openai_model_prefixes = ("gpt-", "o1", "o3", "o4", "gpt-4.1", "gpt-5", "minimax-", "abab")
    glm_model_prefixes = ("glm-",)
    if provider == "openai" and model_name.startswith(openai_model_prefixes):
        return {"type": "json_object"}
    if provider in {"glm", "zhipu"} and model_name.startswith(glm_model_prefixes):
        return {"type": "json_object"}
    if provider == "openai-compatible" and model_name.startswith((*openai_model_prefixes, *glm_model_prefixes)):
        return {"type": "json_object"}
    return None


def _compact_response_headers(headers: Any) -> Dict[str, str]:
    if headers is None:
        return {}
    try:
        items = list(headers.items())
    except Exception:
        return {}
    result: Dict[str, str] = {}
    for key, value in items[:REQUEST_HEADER_SNAPSHOT_LIMIT]:
        normalized_key = str(key or "").strip()
        normalized_value = _truncate(str(value or "").strip(), 240)
        if normalized_key:
            result[normalized_key] = normalized_value
    return result


def _derive_primary_timeout_seconds(config: "RecruitmentLLMRuntimeConfig") -> float:
    raw_value = config.extra_config.get("read_timeout_seconds")
    try:
        numeric = float(raw_value)
    except (TypeError, ValueError):
        numeric = float(SCREENING_TOTAL_TIMEOUT_SECONDS)
    return numeric


def _compute_effective_stage_timeout(
    remaining_budget_seconds: Optional[float],
    configured_timeout_seconds: Optional[float],
) -> float:
    try:
        configured_timeout = float(configured_timeout_seconds)
    except (TypeError, ValueError):
        configured_timeout = float(SCREENING_TOTAL_TIMEOUT_SECONDS)
    configured_timeout = max(1.0, configured_timeout)
    if remaining_budget_seconds is None:
        return configured_timeout
    try:
        remaining_budget = float(remaining_budget_seconds)
    except (TypeError, ValueError):
        remaining_budget = 0.0
    if remaining_budget <= 0 or remaining_budget < float(SCREENING_STAGE_MIN_TIMEOUT_SECONDS):
        raise RecruitmentAIScreeningTotalTimeoutError(
            f"初筛总耗时超过 {int(SCREENING_TOTAL_TIMEOUT_SECONDS)} 秒，已终止",
            total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
            remaining_budget_seconds=max(0.0, remaining_budget),
        )
    return min(configured_timeout, remaining_budget)


def _should_stream_openai_json(config: "RecruitmentLLMRuntimeConfig", *, task_type: str) -> bool:
    extra_config = config.extra_config or {}
    if task_type not in OPENAI_STREAM_JSON_TASK_WHITELIST:
        return False
    if "use_stream_json" in extra_config:
        return bool(extra_config.get("use_stream_json"))
    return True


def _classify_attempt_failure_reason(exc: Exception) -> str:
    if isinstance(exc, RecruitmentAIJSONParseError):
        error_code = str(getattr(exc, "error_code", "") or "").strip()
        if error_code == "empty_response":
            return "empty_response"
        return "invalid_json"
    if isinstance(exc, (RecruitmentAITimeoutError, httpx.TimeoutException)):
        return "timeout"
    if isinstance(exc, httpx.HTTPStatusError):
        return "upstream_http_error"
    if isinstance(exc, httpx.RequestError):
        return "upstream_http_error"
    return "request_error"


def _build_timeout_debug_meta(
    *,
    configured_timeout_seconds: Optional[float],
    effective_timeout_seconds: Optional[float],
    screening_total_timeout_seconds: Optional[float],
    remaining_budget_seconds: Optional[float],
    is_stream_mode: bool,
) -> Dict[str, Any]:
    return {
        "configured_read_timeout_seconds": configured_timeout_seconds,
        "effective_timeout_seconds": effective_timeout_seconds,
        "screening_total_timeout_seconds": screening_total_timeout_seconds,
        "remaining_budget_seconds": remaining_budget_seconds,
        "is_stream_mode": is_stream_mode,
    }


def _clone_runtime_config_with_task_overrides(
    config: "RecruitmentLLMRuntimeConfig",
    *,
    task_type: str,
    response_mode: str,
) -> "RecruitmentLLMRuntimeConfig":
    extra_config = dict(config.extra_config or {})
    if task_type in STRICT_JSON_TASK_TYPES and response_mode == "json":
        try:
            existing_timeout = float(extra_config.get("read_timeout_seconds"))
        except (TypeError, ValueError):
            existing_timeout = float(SCREENING_TOTAL_TIMEOUT_SECONDS)
        extra_config["read_timeout_seconds"] = max(1.0, existing_timeout)
        extra_config["max_retries"] = 0
        extra_config["use_stream_json"] = False
        extra_config["force_json_object_response"] = True
    return RecruitmentLLMRuntimeConfig(
        provider=config.provider,
        runtime_provider=config.runtime_provider,
        model_name=config.model_name,
        base_url=config.base_url,
        api_key=config.api_key,
        source=config.source,
        api_key_masked=config.api_key_masked,
        extra_config=extra_config,
    )


def _build_request_snapshot(config: "RecruitmentLLMRuntimeConfig", *, response_mode: str, system_prompt: str, user_prompt: str) -> str:
    temperature = _resolve_request_temperature(config, response_mode=response_mode)
    response_format: Optional[Dict[str, str]] = None
    json_user_prompt = _compose_json_user_prompt(user_prompt) if response_mode == "json" else user_prompt
    if config.runtime_provider == "gemini":
        request_body = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": json_user_prompt}]}],
            "generationConfig": {"temperature": temperature, **({"responseMimeType": "application/json"} if response_mode == "json" else {})},
        }
        endpoint = f"{(config.base_url or 'https://generativelanguage.googleapis.com').rstrip('/')}/v1beta/models/{config.model_name}:generateContent"
    elif config.runtime_provider == "anthropic":
        request_body = {
            "model": config.model_name,
            "max_tokens": 16000,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": json_user_prompt}],
        }
        endpoint = f"{(config.base_url or 'https://api.anthropic.com').rstrip('/')}/v1/messages"
    else:
        request_body = {
            "model": config.model_name,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json_user_prompt},
            ],
        }
        if response_mode == "json":
            request_body["stream"] = bool(config.extra_config.get("use_stream_json", True))
        response_format = _resolve_openai_json_response_format(config, response_mode=response_mode)
        if response_format:
            request_body["response_format"] = response_format
        endpoint = f"{(config.base_url or '').rstrip('/')}/chat/completions" if config.base_url else None
    return _dump_request_snapshot(
        {
            "provider": config.provider,
            "runtime_provider": config.runtime_provider,
            "model_name": config.model_name,
            "source": config.source,
            "base_url": config.base_url,
            "endpoint": endpoint,
            "response_mode": response_mode,
            "temperature": temperature,
            "response_format": response_format,
            "request_body": request_body,
        }
    )


_JSON_ONLY_USER_PROMPT_SUFFIX = "只返回 strict JSON，不要 markdown，不要解释。"
_JSON_ONLY_DUPLICATE_SUFFIXES = (
    _JSON_ONLY_USER_PROMPT_SUFFIX,
    "请仅返回有效 JSON。",
    "Please return valid JSON only.",
    "Return valid JSON only.",
)


def _compose_json_user_prompt(user_prompt: str) -> str:
    prompt = str(user_prompt or "").rstrip()
    stripped = prompt.rstrip()
    while stripped:
        matched = False
        for suffix in _JSON_ONLY_DUPLICATE_SUFFIXES:
            if stripped.endswith(suffix):
                stripped = stripped[: -len(suffix)].rstrip()
                matched = True
                break
        if not matched:
            break
    return f"{stripped}\n\n{_JSON_ONLY_USER_PROMPT_SUFFIX}" if stripped else _JSON_ONLY_USER_PROMPT_SUFFIX


def _is_retryable_error(exc: Exception) -> bool:
    if isinstance(exc, RecruitmentAIJSONParseError):
        raw_response_text = str(exc.raw_response_text or "").strip()
        return len(raw_response_text) < JSON_RETRYABLE_MIN_EMPTY_LENGTH
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status in {408, 409, 425, 429} or status >= 500:
            return True
        try:
            body = (exc.response.text or "").strip()
        except Exception:
            body = ""
        if "速率限制" in body or "rate limit" in body.lower():
            return True
        return False
    if isinstance(exc, httpx.RequestError):
        return True
    message = str(exc or "").lower()
    return "rate limit" in message or "速率限制" in message or "too many requests" in message


@dataclass(frozen=True)
class ProviderDefinition:
    provider: str
    runtime_provider: str
    label: str
    default_base_url: Optional[str]
    default_model: str
    env_names: tuple[str, ...]
    model_env_names: tuple[str, ...]
    base_url_env_names: tuple[str, ...]


PROVIDER_CATALOG: Dict[str, ProviderDefinition] = {
    "openai-compatible": ProviderDefinition("openai-compatible", "openai-compatible", "OpenAI Compatible", None, "gpt-4o-mini", ("RECRUITMENT_LLM_API_KEY", "OPENAI_API_KEY", "AI_API_KEY"), ("RECRUITMENT_LLM_MODEL", "OPENAI_MODEL", "AI_MODEL_NAME"), ("RECRUITMENT_LLM_BASE_URL", "OPENAI_BASE_URL", "AI_BASE_URL")),
    "openai": ProviderDefinition("openai", "openai-compatible", "OpenAI", "https://api.openai.com/v1", "gpt-4o-mini", ("OPENAI_API_KEY", "AI_API_KEY"), ("OPENAI_MODEL", "AI_MODEL_NAME"), ("OPENAI_BASE_URL", "AI_BASE_URL")),
    "deepseek": ProviderDefinition("deepseek", "openai-compatible", "DeepSeek", "https://api.deepseek.com/v1", "deepseek-chat", ("DEEPSEEK_API_KEY",), ("DEEPSEEK_MODEL",), ("DEEPSEEK_BASE_URL",)),
    "kimi": ProviderDefinition("kimi", "openai-compatible", "Kimi / Moonshot", "https://api.moonshot.cn/v1", "moonshot-v1-8k", ("KIMI_API_KEY", "MOONSHOT_API_KEY"), ("KIMI_MODEL", "MOONSHOT_MODEL"), ("KIMI_BASE_URL", "MOONSHOT_BASE_URL")),
    "moonshot": ProviderDefinition("moonshot", "openai-compatible", "Moonshot", "https://api.moonshot.cn/v1", "moonshot-v1-8k", ("MOONSHOT_API_KEY", "KIMI_API_KEY"), ("MOONSHOT_MODEL", "KIMI_MODEL"), ("MOONSHOT_BASE_URL", "KIMI_BASE_URL")),
    "glm": ProviderDefinition("glm", "openai-compatible", "GLM / Zhipu", "https://open.bigmodel.cn/api/paas/v4", "glm-4-flash", ("GLM_API_KEY", "ZHIPUAI_API_KEY"), ("GLM_MODEL", "ZHIPUAI_MODEL"), ("GLM_BASE_URL", "ZHIPUAI_BASE_URL")),
    "zhipu": ProviderDefinition("zhipu", "openai-compatible", "Zhipu", "https://open.bigmodel.cn/api/paas/v4", "glm-4-flash", ("ZHIPUAI_API_KEY", "GLM_API_KEY"), ("ZHIPUAI_MODEL", "GLM_MODEL"), ("ZHIPUAI_BASE_URL", "GLM_BASE_URL")),
    "anthropic": ProviderDefinition("anthropic", "anthropic", "Anthropic Claude", "https://api.anthropic.com", "claude-3-5-sonnet-latest", ("ANTHROPIC_API_KEY", "CLAUDE_API_KEY"), ("ANTHROPIC_MODEL", "CLAUDE_MODEL"), ("ANTHROPIC_BASE_URL",)),
    "claude": ProviderDefinition("claude", "anthropic", "Claude", "https://api.anthropic.com", "claude-3-5-sonnet-latest", ("CLAUDE_API_KEY", "ANTHROPIC_API_KEY"), ("CLAUDE_MODEL", "ANTHROPIC_MODEL"), ("ANTHROPIC_BASE_URL",)),
    "gemini": ProviderDefinition("gemini", "gemini", "Google Gemini", "https://generativelanguage.googleapis.com", "gemini-2.5-flash", ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_STUDIO_API_KEY"), ("GEMINI_MODEL",), ("GEMINI_API_BASE",)),
}

PROVIDER_PRIORITY = ["gemini", "anthropic", "claude", "deepseek", "kimi", "glm", "openai", "openai-compatible"]


def get_provider_definition(provider: Optional[str]) -> ProviderDefinition:
    normalized = (provider or "openai-compatible").strip().lower()
    return PROVIDER_CATALOG.get(normalized, PROVIDER_CATALOG["openai-compatible"])


def get_provider_options() -> list[dict[str, str]]:
    keys = ["gemini", "openai", "anthropic", "deepseek", "kimi", "glm", "openai-compatible"]
    return [{"value": PROVIDER_CATALOG[key].provider, "label": PROVIDER_CATALOG[key].label} for key in keys]


@dataclass
class RecruitmentLLMRuntimeConfig:
    provider: str
    runtime_provider: str
    model_name: str
    base_url: Optional[str]
    api_key: Optional[str]
    source: str
    api_key_masked: str
    extra_config: Dict[str, Any]


class RecruitmentAIGateway:
    _round_robin_counters: Dict[str, int] = {}
    _round_robin_lock = threading.Lock()

    def __init__(self, db: Session):
        self.db = db
        self.permission_context: Optional[PermissionContext] = None

    def _pick_round_robin(
        self,
        task_type: str,
        configs: List[RecruitmentLLMConfig],
    ) -> Optional[RecruitmentLLMConfig]:
        if not configs:
            return None
        if len(configs) == 1:
            return configs[0]
        # 所有传入的 configs 已经过 _config_visible 过滤，直接轮询
        org_code = getattr(configs[0], "org_code", None) or "global"
        counter_key = f"{org_code}:{task_type}"
        with RecruitmentAIGateway._round_robin_lock:
            counter = RecruitmentAIGateway._round_robin_counters.get(counter_key, 0)
            selected = configs[counter % len(configs)]
            RecruitmentAIGateway._round_robin_counters[counter_key] = counter + 1
        return selected

    def set_permission_context(self, context: Optional[PermissionContext]) -> "RecruitmentAIGateway":
        self.permission_context = context
        return self

    def _config_visible(self, config: RecruitmentLLMConfig) -> bool:
        if not self.permission_context:
            return True
        from ..permission_governance import ROOT_ORG_CODE
        return resource_is_visible_to_context(
            self.db,
            self.permission_context,
            resource_org_code=getattr(config, "org_code", None) or ROOT_ORG_CODE,
            share_policy=getattr(config, "share_policy", "PRIVATE"),
            allow_sub_org_use=getattr(config, "allow_sub_org_use", False),
            scope_level=getattr(config, "scope_level", None),
        )

    def _resolve_api_key_from_provider(self, definition: ProviderDefinition) -> Optional[str]:
        for env_name in definition.env_names:
            value = (os.getenv(env_name) or "").strip()
            if value:
                return value
        return None

    def _resolve_model_name(self, definition: ProviderDefinition, configured: Optional[str]) -> str:
        value = (configured or "").strip()
        if value:
            return value
        for env_name in definition.model_env_names:
            env_value = (os.getenv(env_name) or "").strip()
            if env_value:
                return env_value
        return definition.default_model

    def _resolve_base_url(self, definition: ProviderDefinition, configured: Optional[str]) -> Optional[str]:
        value = (configured or "").strip()
        if value:
            return value.rstrip("/")
        for env_name in definition.base_url_env_names:
            env_value = (os.getenv(env_name) or "").strip()
            if env_value:
                return env_value.rstrip("/")
        if definition.provider == "openai-compatible" and settings.AI_BASE_URL:
            return settings.AI_BASE_URL.rstrip("/")
        return definition.default_base_url.rstrip("/") if definition.default_base_url else None

    def _build_runtime_config(self, definition: ProviderDefinition, *, model_name: Optional[str], base_url: Optional[str], api_key: Optional[str], source: str, extra_config: Optional[Dict[str, Any]] = None) -> RecruitmentLLMRuntimeConfig:
        resolved_model = self._resolve_model_name(definition, model_name)
        resolved_base = self._resolve_base_url(definition, base_url)
        resolved_key = (api_key or "").strip() or self._resolve_api_key_from_provider(definition)
        return RecruitmentLLMRuntimeConfig(definition.provider, definition.runtime_provider, resolved_model, resolved_base, resolved_key or None, source, mask_secret(resolved_key or ""), extra_config or {})

    def resolve_config_by_id(self, config_id: int) -> Optional[RecruitmentLLMRuntimeConfig]:
        """根据数据库 ID 解析运行时配置（供调度器使用）"""
        row = self.db.query(RecruitmentLLMConfig).filter(
            RecruitmentLLMConfig.id == config_id,
            RecruitmentLLMConfig.is_active.is_(True),
        ).first()
        if not row:
            return None
        return self.resolve_runtime_config_for_row(row)

    def resolve_runtime_config_for_row(self, config: RecruitmentLLMConfig) -> RecruitmentLLMRuntimeConfig:
        definition = get_provider_definition(config.provider)
        plaintext_key = decrypt_secret(config.api_key_ciphertext or "")
        if not plaintext_key and (config.api_key_env or "").strip():
            plaintext_key = (os.getenv((config.api_key_env or "").strip()) or "").strip()
        extra_config = json.loads(config.extra_config_json) if config.extra_config_json else {}
        return self._build_runtime_config(
            definition,
            model_name=config.model_name,
            base_url=config.base_url,
            api_key=plaintext_key,
            source=f"db:{config.config_key}",
            extra_config=extra_config,
        )

    def resolve_config(self, task_type: str) -> RecruitmentLLMRuntimeConfig:
        configs = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.is_active.is_(True), RecruitmentLLMConfig.task_type == task_type).order_by(RecruitmentLLMConfig.priority.asc(), RecruitmentLLMConfig.id.asc()).all()
        visible_configs = [row for row in configs if self._config_visible(row)]
        config = self._pick_round_robin(task_type, visible_configs)
        if not config:
            default_configs = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.is_active.is_(True), RecruitmentLLMConfig.task_type == "default").order_by(RecruitmentLLMConfig.priority.asc(), RecruitmentLLMConfig.id.asc()).all()
            visible_default_configs = [row for row in default_configs if self._config_visible(row)]
            config = self._pick_round_robin("default", visible_default_configs)
        if config:
            return self.resolve_runtime_config_for_row(config)

        forced_provider = (os.getenv("RECRUITMENT_LLM_PROVIDER") or "").strip().lower()
        if forced_provider:
            definition = get_provider_definition(forced_provider)
            return self._build_runtime_config(definition, model_name=os.getenv("RECRUITMENT_LLM_MODEL") or None, base_url=os.getenv("RECRUITMENT_LLM_BASE_URL") or None, api_key=os.getenv("RECRUITMENT_LLM_API_KEY") or None, source="env:forced")

        # 数据库没有任何当前用户可见的 LLM 配置时，直接报错
        # 避免用户未配置模型时静默调用外部模型
        all_active_configs = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.is_active.is_(True)).all()
        has_visible_config = any(self._config_visible(c) for c in all_active_configs)
        if not has_visible_config:
            raise ValueError("未配置 AI 模型，请先在「模型配置」中添加可用的 LLM 配置。")

        for provider_name in PROVIDER_PRIORITY:
            definition = get_provider_definition(provider_name)
            api_key = self._resolve_api_key_from_provider(definition)
            if api_key:
                model_override = settings.AI_MODEL_NAME if provider_name == "openai-compatible" else None
                base_override = settings.AI_BASE_URL if provider_name == "openai-compatible" else None
                return self._build_runtime_config(definition, model_name=model_override, base_url=base_override, api_key=api_key, source=f"env:auto:{definition.provider}")

        return self._build_runtime_config(get_provider_definition("openai-compatible"), model_name=settings.AI_MODEL_NAME, base_url=settings.AI_BASE_URL, api_key=settings.AI_API_KEY, source="env:fallback")

    def prepare_json_request_context(
        self,
        *,
        task_type: str,
        system_prompt: str,
        user_prompt: str,
        timeout_seconds_override: Optional[float] = None,
        screening_total_timeout_seconds: Optional[float] = None,
        remaining_budget_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        config = _clone_runtime_config_with_task_overrides(
            self.resolve_config(task_type),
            task_type=task_type,
            response_mode="json",
        )
        configured_timeout_seconds = _derive_primary_timeout_seconds(config)
        effective_timeout_seconds = _compute_effective_stage_timeout(
            timeout_seconds_override if timeout_seconds_override is not None else remaining_budget_seconds,
            configured_timeout_seconds,
        )
        config.extra_config["read_timeout_seconds"] = effective_timeout_seconds
        full_request_snapshot = _build_request_snapshot(
            config,
            response_mode="json",
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )
        endpoint = None
        if config.runtime_provider == "openai-compatible":
            endpoint = self._build_openai_compatible_endpoint(config)
        elif config.runtime_provider == "gemini":
            endpoint = f"{(config.base_url or 'https://generativelanguage.googleapis.com').rstrip('/')}/v1beta/models/{config.model_name}:generateContent"
        elif config.runtime_provider == "anthropic":
            endpoint = f"{(config.base_url or 'https://api.anthropic.com').rstrip('/')}/v1/messages"
        max_retries = max(
            0,
            int(config.extra_config.get("max_retries") if "max_retries" in config.extra_config else (0 if task_type in STRICT_JSON_TASK_TYPES else 2)),
        )
        return {
            "runtime_config": config,
            "provider": config.provider,
            "model_name": config.model_name,
            "endpoint": endpoint,
            "timeout_seconds": effective_timeout_seconds,
            "configured_read_timeout_seconds": configured_timeout_seconds,
            "effective_timeout_seconds": effective_timeout_seconds,
            "screening_total_timeout_seconds": screening_total_timeout_seconds or SCREENING_TOTAL_TIMEOUT_SECONDS,
            "remaining_budget_seconds": remaining_budget_seconds,
            "retry_count": max_retries,
            "is_stream_mode": config.runtime_provider == "openai-compatible" and _should_stream_openai_json(config, task_type=task_type),
            "full_request_snapshot": full_request_snapshot,
            "input_summary": _truncate(user_prompt, 600),
            "prompt_snapshot": f"SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}",
        }

    def _build_httpx_client(
        self,
        config: RecruitmentLLMRuntimeConfig,
        *,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        read_timeout_override: Optional[float] = None,
    ) -> httpx.Client:
        connect_timeout = float(config.extra_config.get("connect_timeout_seconds") or 10)
        read_timeout = float(read_timeout_override if read_timeout_override is not None else (config.extra_config.get("read_timeout_seconds") or SCREENING_TOTAL_TIMEOUT_SECONDS))
        write_timeout = float(config.extra_config.get("write_timeout_seconds") or 20)
        pool_timeout = float(config.extra_config.get("pool_timeout_seconds") or 10)
        client = httpx.Client(
            timeout=httpx.Timeout(
                connect=connect_timeout,
                read=read_timeout,
                write=write_timeout,
                pool=pool_timeout,
            )
        )
        if cancel_control:
            cancel_control.register_closer(client.close)
        return client

    def _build_openai_compatible_endpoint(self, config: RecruitmentLLMRuntimeConfig) -> str:
        base_url = (config.base_url or "").strip().rstrip("/")
        if not base_url:
            raise RuntimeError("Missing base URL for OpenAI compatible provider")
        return f"{base_url}/chat/completions"

    def _extract_usage_from_openai_stream_chunk(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        usage = payload.get("usage") or {}
        if not usage:
            return None
        return {
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "total_tokens": usage.get("total_tokens"),
        }

    def _extract_usage_from_openai_response_payload(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        usage = payload.get("usage") or {}
        if not usage:
            return None
        return {
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "total_tokens": usage.get("total_tokens"),
        }

    def _extract_text_from_openai_compatible_response_payload(self, payload: Dict[str, Any]) -> str:
        chunks: list[str] = []
        for choice in payload.get("choices") or []:
            message = choice.get("message") or {}
            message_content = message.get("content")
            if isinstance(message_content, str) and message_content:
                chunks.append(message_content)
            elif isinstance(message_content, list):
                for item in message_content:
                    if isinstance(item, dict) and item.get("text"):
                        chunks.append(str(item.get("text")))
            delta = choice.get("delta") or {}
            delta_content = delta.get("content")
            if isinstance(delta_content, str) and delta_content:
                chunks.append(delta_content)
            elif isinstance(delta_content, list):
                for item in delta_content:
                    if isinstance(item, dict) and item.get("text"):
                        chunks.append(str(item.get("text")))
            elif isinstance(delta_content, dict) and delta_content.get("text"):
                chunks.append(str(delta_content.get("text")))
        return "".join(chunks).strip()

    def _extract_text_from_anthropic(self, payload: Dict[str, Any]) -> str:
        chunks = []
        for item in payload.get("content") or []:
            if item.get("type") == "text" and item.get("text"):
                chunks.append(item["text"])
        return "\n".join(chunks).strip()

    def _build_openai_compatible_messages(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        response_mode: str,
    ) -> list[dict[str, Any]]:
        composed_user_prompt = _compose_json_user_prompt(user_prompt) if response_mode == "json" else user_prompt
        return [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": composed_user_prompt,
            },
        ]

    def _build_openai_compatible_request_body(
        self,
        config: RecruitmentLLMRuntimeConfig,
        *,
        system_prompt: str,
        user_prompt: str,
        response_mode: str,
        stream: bool,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "model": config.model_name,
            "temperature": _resolve_request_temperature(config, response_mode=response_mode),
            "messages": self._build_openai_compatible_messages(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_mode=response_mode,
            ),
            "stream": bool(stream),
        }
        if stream:
            body["stream_options"] = {"include_usage": True}
        response_format = _resolve_openai_json_response_format(config, response_mode=response_mode)
        if response_format:
            body["response_format"] = response_format
        max_tokens_override = config.extra_config.get("max_tokens_override")
        if max_tokens_override:
            body["max_tokens"] = max_tokens_override
        return body

    def _stream_openai_compatible_completion(
        self,
        config: RecruitmentLLMRuntimeConfig,
        *,
        system_prompt: str,
        user_prompt: str,
        response_mode: str,
        task_type: str = "",
        on_delta: Optional[Callable[[str], None]] = None,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        read_timeout_override: Optional[float] = None,
        screening_total_timeout_seconds: Optional[float] = None,
        remaining_budget_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for OpenAI compatible provider")
        endpoint = self._build_openai_compatible_endpoint(config)
        configured_timeout_seconds = _derive_primary_timeout_seconds(config)
        body = self._build_openai_compatible_request_body(
            config,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_mode=response_mode,
            stream=True,
        )
        client = self._build_httpx_client(
            config,
            cancel_control=cancel_control,
            read_timeout_override=read_timeout_override,
        )
        headers = {
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        }
        chunks: list[str] = []
        raw_lines_seen: list[str] = []
        token_usage: Optional[Dict[str, Any]] = None
        response_status_code: Optional[int] = None
        response_headers: Dict[str, str] = {}
        recovered_from_non_sse_body = False
        try:
            with client.stream("POST", endpoint, headers=headers, json=body) as response:
                response_status_code = response.status_code
                response_headers = _compact_response_headers(response.headers)
                response.raise_for_status()
                for raw_line in response.iter_lines():
                    if cancel_control:
                        cancel_control.raise_if_cancelled()
                    if not raw_line:
                        continue
                    line = raw_line.decode("utf-8", errors="ignore") if isinstance(raw_line, bytes) else str(raw_line)
                    raw_lines_seen.append(line)
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if not data:
                        continue
                    if data == "[DONE]":
                        break
                    payload = json.loads(data)
                    usage_payload = self._extract_usage_from_openai_stream_chunk(payload)
                    if usage_payload:
                        token_usage = usage_payload
                    for choice in payload.get("choices") or []:
                        delta = choice.get("delta") or {}
                        delta_content = delta.get("content")
                        if isinstance(delta_content, str) and delta_content:
                            chunks.append(delta_content)
                            if on_delta:
                                on_delta(delta_content)
                        elif isinstance(delta_content, list):
                            for item in delta_content:
                                if isinstance(item, dict) and item.get("text"):
                                    text_value = str(item.get("text"))
                                    chunks.append(text_value)
                                    if on_delta:
                                        on_delta(text_value)
            if cancel_control:
                cancel_control.raise_if_cancelled()
        except Exception as exc:
            if cancel_control and cancel_control.is_cancelled():
                raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
            raise
        finally:
            try:
                client.close()
            except Exception:
                pass
        raw_text = "".join(chunks).strip()
        if response_mode == "json" and not raw_text:
            fallback_body_text = "\n".join([line for line in raw_lines_seen if line]).strip()
            if fallback_body_text:
                try:
                    provider_payload = json.loads(fallback_body_text)
                except Exception:
                    provider_payload = None
                if isinstance(provider_payload, dict):
                    raw_text = self._extract_text_from_openai_compatible_response_payload(provider_payload)
                    token_usage = token_usage or self._extract_usage_from_openai_response_payload(provider_payload)
                    if raw_text:
                        recovered_from_non_sse_body = True
                        logger.warning(
                            "OpenAI-compatible JSON stream returned no SSE delta content; recovered content from non-SSE response body for model=%s",
                            config.model_name,
                        )
        response_debug = {
            "status_code": response_status_code,
            "response_headers": response_headers,
            "stream_raw_line_count": len(raw_lines_seen),
            "recovered_from_non_sse_body": recovered_from_non_sse_body,
            "raw_response_text_length": len(raw_text or ""),
            **_build_timeout_debug_meta(
                configured_timeout_seconds=configured_timeout_seconds,
                effective_timeout_seconds=read_timeout_override or configured_timeout_seconds,
                screening_total_timeout_seconds=screening_total_timeout_seconds,
                remaining_budget_seconds=remaining_budget_seconds,
                is_stream_mode=True,
            ),
        }
        if response_mode == "json":
            if not raw_text:
                raise RecruitmentAIJSONParseError(
                    "AI screening JSON 解析失败: 模型返回了空响应内容",
                    raw_response_text="",
                    error_code="empty_response",
                    debug_meta=response_debug,
                    provider_payload={
                        "response_status_code": response_status_code,
                        "response_headers": response_headers,
                        "raw_lines_seen_count": len(raw_lines_seen),
                        "recovered_from_non_sse_body": recovered_from_non_sse_body,
                    },
                )
            if task_type in STRICT_JSON_TASK_TYPES:
                strict_json_result = _parse_strict_json_response(
                    raw_text,
                    task_type=task_type or "",
                    response_debug=response_debug,
                    provider_payload={
                        "response_status_code": response_status_code,
                        "response_headers": response_headers,
                        "raw_lines_seen_count": len(raw_lines_seen),
                        "recovered_from_non_sse_body": recovered_from_non_sse_body,
                    },
                )
                content = strict_json_result.get("content") or {}
                debug_meta = dict(strict_json_result.get("debug_meta") or response_debug)
                warnings = list(strict_json_result.get("warnings") or [])
            else:
                content = _parse_llm_json_response(raw_text or "{}")
                debug_meta = response_debug
                warnings = []
            return {
                "content": content,
                "token_usage": token_usage,
                "raw_response_text": raw_text,
                "response_debug": debug_meta,
                "warnings": warnings,
            }
        return {
            "content": {"markdown": raw_text, "html": raw_text.replace("\n", "<br />")},
            "token_usage": token_usage,
            "response_debug": response_debug,
        }

    def _call_openai_compatible_json_non_stream(
        self,
        config: RecruitmentLLMRuntimeConfig,
        system_prompt: str,
        user_prompt: str,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        *,
        task_type: str = "",
        read_timeout_override: Optional[float] = None,
        screening_total_timeout_seconds: Optional[float] = None,
        remaining_budget_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for OpenAI compatible provider")
        endpoint = self._build_openai_compatible_endpoint(config)
        configured_timeout_seconds = _derive_primary_timeout_seconds(config)
        body = self._build_openai_compatible_request_body(
            config,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_mode="json",
            stream=False,
        )
        client = self._build_httpx_client(
            config,
            cancel_control=cancel_control,
            read_timeout_override=read_timeout_override,
        )
        response_status_code: Optional[int] = None
        response_headers: Dict[str, str] = {}
        try:
            response = client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {config.api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response_status_code = response.status_code
            response_headers = _compact_response_headers(response.headers)
            response.raise_for_status()
            if cancel_control:
                cancel_control.raise_if_cancelled()
            payload = response.json()
        except Exception as exc:
            if cancel_control and cancel_control.is_cancelled():
                raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
            raise
        finally:
            try:
                client.close()
            except Exception:
                pass
        if not isinstance(payload, dict):
            raw_response_text = ""
            try:
                raw_response_text = str(getattr(response, "text", "") or "").strip()
            except Exception:
                raw_response_text = ""
            raise RecruitmentAIJSONParseError(
                "AI screening JSON 解析失败: 上游返回的 JSON 不是对象",
                raw_response_text=raw_response_text,
                error_code="invalid_provider_payload",
                debug_meta={
                    "status_code": response_status_code,
                    "response_headers": response_headers,
                    **_build_timeout_debug_meta(
                        configured_timeout_seconds=configured_timeout_seconds,
                        effective_timeout_seconds=read_timeout_override or configured_timeout_seconds,
                        screening_total_timeout_seconds=screening_total_timeout_seconds,
                        remaining_budget_seconds=remaining_budget_seconds,
                        is_stream_mode=False,
                    ),
                },
                provider_payload=payload,
            )
        raw_text = self._extract_text_from_openai_compatible_response_payload(payload)
        response_debug = {
            "status_code": response_status_code,
            "response_headers": response_headers,
            "stream_raw_line_count": 0,
            "recovered_from_non_sse_body": False,
            "raw_response_text_length": len(raw_text or ""),
            **_build_timeout_debug_meta(
                configured_timeout_seconds=configured_timeout_seconds,
                effective_timeout_seconds=read_timeout_override or configured_timeout_seconds,
                screening_total_timeout_seconds=screening_total_timeout_seconds,
                remaining_budget_seconds=remaining_budget_seconds,
                is_stream_mode=False,
            ),
        }
        if not raw_text:
            raise RecruitmentAIJSONParseError(
                "AI screening JSON 解析失败: 模型返回了空响应内容",
                raw_response_text="",
                error_code="empty_response",
                debug_meta=response_debug,
                provider_payload=payload,
            )
        if task_type in STRICT_JSON_TASK_TYPES:
            strict_json_result = _parse_strict_json_response(
                raw_text,
                task_type=task_type or "",
                provider_payload=payload,
                response_debug=response_debug,
            )
            content = strict_json_result.get("content") or {}
            debug_meta = dict(strict_json_result.get("debug_meta") or response_debug)
            warnings = list(strict_json_result.get("warnings") or [])
        else:
            content = _parse_llm_json_response(raw_text)
            debug_meta = response_debug
            warnings = []
        return {
            "content": content,
            "token_usage": self._extract_usage_from_openai_response_payload(payload),
            "raw_response_text": raw_text,
            "response_debug": debug_meta,
            "warnings": warnings,
        }

    def _call_openai_compatible_json(
        self,
        config: RecruitmentLLMRuntimeConfig,
        system_prompt: str,
        user_prompt: str,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        *,
        task_type: str = "",
        read_timeout_override: Optional[float] = None,
        screening_total_timeout_seconds: Optional[float] = None,
        remaining_budget_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        if not _should_stream_openai_json(config, task_type=task_type):
            return self._call_openai_compatible_json_non_stream(
                config,
                system_prompt,
                user_prompt,
                cancel_control=cancel_control,
                task_type=task_type,
                read_timeout_override=read_timeout_override,
                screening_total_timeout_seconds=screening_total_timeout_seconds,
                remaining_budget_seconds=remaining_budget_seconds,
            )
        try:
            return self._stream_openai_compatible_completion(
                config,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                response_mode="json",
                task_type=task_type,
                cancel_control=cancel_control,
                read_timeout_override=read_timeout_override,
                screening_total_timeout_seconds=screening_total_timeout_seconds,
                remaining_budget_seconds=remaining_budget_seconds,
            )
        except RecruitmentAIJSONParseError as exc:
            if getattr(exc, "error_code", "") != "empty_response" or task_type != "resume_parse":
                raise
            logger.warning(
                "OpenAI-compatible JSON stream returned empty response for task=%s model=%s; retrying once with non-stream request",
                task_type,
                config.model_name,
            )
            recovered = self._call_openai_compatible_json_non_stream(
                config,
                system_prompt,
                user_prompt,
                cancel_control=cancel_control,
                task_type=task_type,
                read_timeout_override=read_timeout_override,
                screening_total_timeout_seconds=screening_total_timeout_seconds,
                remaining_budget_seconds=remaining_budget_seconds,
            )
            response_debug = dict(recovered.get("response_debug") or {})
            response_debug["recovered_from_stream_empty_retry"] = True
            warnings = ["stream empty, recovered by non-stream retry"]
            recovered["response_debug"] = response_debug
            recovered["warnings"] = warnings
            return recovered

    def _call_openai_compatible_text(self, config: RecruitmentLLMRuntimeConfig, system_prompt: str, user_prompt: str, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        return self._stream_openai_compatible_completion(
            config,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_mode="text",
            cancel_control=cancel_control,
        )

    def stream_text(
        self,
        *,
        task_type: str,
        system_prompt: str,
        user_prompt: str,
        on_delta: Callable[[str], None],
        cancel_control: Optional[RecruitmentTaskControl] = None,
    ) -> Dict[str, Any]:
        # Stateful filter to strip <think>...</think> reasoning blocks from streaming deltas,
        # since they may span multiple chunks.
        _think_buffer = ""
        _in_think = False

        def _filtered_on_delta(delta: str) -> None:
            nonlocal _think_buffer, _in_think
            text = _think_buffer + delta
            _think_buffer = ""
            if _in_think:
                end_match = re.search(r"</think>", text, flags=re.IGNORECASE)
                if end_match:
                    _in_think = False
                    remainder = text[end_match.end():]
                    if remainder:
                        on_delta(remainder)
                return
            start_match = re.search(r"<think\b[^>]*>", text, flags=re.IGNORECASE)
            if start_match:
                _in_think = True
                before = text[:start_match.start()]
                after_tag = text[start_match.end():]
                end_match = re.search(r"</think>", after_tag, flags=re.IGNORECASE)
                if end_match:
                    _in_think = False
                    remainder = after_tag[end_match.end():]
                    if before:
                        on_delta(before)
                    if remainder:
                        on_delta(remainder)
                else:
                    if before:
                        on_delta(before)
                    _think_buffer = after_tag
                return
            on_delta(delta)

        config = self.resolve_config(task_type)
        prompt_snapshot = f"SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}"
        full_request_snapshot = _build_request_snapshot(config, response_mode="text", system_prompt=system_prompt, user_prompt=user_prompt)
        max_retries = max(0, int(config.extra_config.get("max_retries") or 1))
        retry_delay = float(config.extra_config.get("retry_delay_seconds") or 1.0)
        last_error: Exception | None = None
        for attempt in range(max_retries + 1):
            _think_buffer = ""
            _in_think = False
            try:
                if config.runtime_provider == "openai-compatible":
                    response_payload = self._stream_openai_compatible_completion(
                        config,
                        system_prompt=system_prompt,
                        user_prompt=user_prompt,
                        response_mode="text",
                        on_delta=_filtered_on_delta,
                        cancel_control=cancel_control,
                    )
                elif config.runtime_provider == "gemini":
                    response_payload = self._stream_gemini_text(config, system_prompt, user_prompt, _filtered_on_delta, cancel_control=cancel_control)
                else:
                    response_payload = self._stream_anthropic_text(config, system_prompt, user_prompt, _filtered_on_delta, cancel_control=cancel_control)
                content = response_payload["content"]
                output_summary = content.get("markdown") if isinstance(content, dict) else content
                return {
                    "content": content,
                    "provider": config.provider,
                    "model_name": config.model_name,
                    "source": config.source,
                    "used_fallback": False,
                    "prompt_snapshot": prompt_snapshot,
                    "full_request_snapshot": full_request_snapshot,
                    "input_summary": _truncate(user_prompt, 600),
                    "output_summary": _truncate(output_summary, 600),
                    "token_usage": response_payload.get("token_usage"),
                    "error_message": None,
                }
            except RecruitmentTaskCancelled:
                raise
            except Exception as exc:
                last_error = exc
                if cancel_control and cancel_control.is_cancelled():
                    raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
                if attempt < max_retries and _is_retryable_error(exc):
                    sleep_seconds = retry_delay * (attempt + 1)
                    logger.warning("Recruitment stream text task %s hit retryable error, retrying in %.1fs: %s", task_type, sleep_seconds, exc)
                    if cancel_control:
                        if cancel_control.wait(sleep_seconds):
                            raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
                    else:
                        time.sleep(sleep_seconds)
                    continue
                raise
        raise RuntimeError(_format_http_error(last_error or RuntimeError("Unknown AI stream task failure")))

    def _call_gemini_json(
        self,
        config: RecruitmentLLMRuntimeConfig,
        system_prompt: str,
        user_prompt: str,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        *,
        task_type: str = "",
        read_timeout_override: Optional[float] = None,
        screening_total_timeout_seconds: Optional[float] = None,
        remaining_budget_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for Gemini")
        base_url = (config.base_url or "https://generativelanguage.googleapis.com").rstrip("/")
        url = f"{base_url}/v1beta/models/{config.model_name}:generateContent"
        generation_config: Dict[str, Any] = {"temperature": 0, "responseMimeType": "application/json"}
        max_tokens_override = config.extra_config.get("max_tokens_override")
        if max_tokens_override:
            generation_config["maxOutputTokens"] = max_tokens_override
        body = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": _compose_json_user_prompt(user_prompt)}]}],
            "generationConfig": generation_config,
        }
        configured_timeout_seconds = _derive_primary_timeout_seconds(config)
        client = self._build_httpx_client(
            config,
            cancel_control=cancel_control,
            read_timeout_override=read_timeout_override,
        )
        try:
            response = client.post(url, params={"key": config.api_key}, json=body)
            response.raise_for_status()
            if cancel_control:
                cancel_control.raise_if_cancelled()
            payload = response.json()
        except Exception as exc:
            if cancel_control and cancel_control.is_cancelled():
                raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
            raise
        finally:
            try:
                client.close()
            except Exception:
                pass
        parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        raw_text = "\n".join([part.get("text", "") for part in parts if part.get("text")]).strip() or "{}"
        usage = payload.get("usageMetadata") or {}
        response_debug = _build_timeout_debug_meta(
            configured_timeout_seconds=configured_timeout_seconds,
            effective_timeout_seconds=read_timeout_override or configured_timeout_seconds,
            screening_total_timeout_seconds=screening_total_timeout_seconds,
            remaining_budget_seconds=remaining_budget_seconds,
            is_stream_mode=False,
        )
        if task_type in STRICT_JSON_TASK_TYPES:
            strict_json_result = _parse_strict_json_response(
                raw_text,
                task_type=task_type or "",
                provider_payload=payload,
                response_debug=response_debug,
            )
            content = strict_json_result.get("content") or {}
            debug_meta = dict(strict_json_result.get("debug_meta") or response_debug)
            warnings = list(strict_json_result.get("warnings") or [])
        else:
            content = _parse_llm_json_response(raw_text)
            debug_meta = response_debug
            warnings = []
        return {
            "content": content,
            "token_usage": {"prompt_tokens": usage.get("promptTokenCount"), "completion_tokens": usage.get("candidatesTokenCount"), "total_tokens": usage.get("totalTokenCount")},
            "raw_response_text": raw_text,
            "response_debug": debug_meta,
            "warnings": warnings,
        }

    def _call_gemini_text(self, config: RecruitmentLLMRuntimeConfig, system_prompt: str, user_prompt: str, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for Gemini")
        base_url = (config.base_url or "https://generativelanguage.googleapis.com").rstrip("/")
        url = f"{base_url}/v1beta/models/{config.model_name}:generateContent"
        body = {"system_instruction": {"parts": [{"text": system_prompt}]}, "contents": [{"role": "user", "parts": [{"text": user_prompt}]}], "generationConfig": {"temperature": 0.3}}
        client = self._build_httpx_client(config, cancel_control=cancel_control)
        try:
            response = client.post(url, params={"key": config.api_key}, json=body)
            response.raise_for_status()
            if cancel_control:
                cancel_control.raise_if_cancelled()
            payload = response.json()
        except Exception as exc:
            if cancel_control and cancel_control.is_cancelled():
                raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
            raise
        finally:
            try:
                client.close()
            except Exception:
                pass
        parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        raw_text = "\n".join([part.get("text", "") for part in parts if part.get("text")]).strip()
        usage = payload.get("usageMetadata") or {}
        return {"content": {"markdown": raw_text, "html": raw_text.replace("\n", "<br />")}, "token_usage": {"prompt_tokens": usage.get("promptTokenCount"), "completion_tokens": usage.get("candidatesTokenCount"), "total_tokens": usage.get("totalTokenCount")}}

    def _stream_gemini_text(
        self,
        config: RecruitmentLLMRuntimeConfig,
        system_prompt: str,
        user_prompt: str,
        on_delta: Callable[[str], None],
        cancel_control: Optional[RecruitmentTaskControl] = None,
    ) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for Gemini")
        base_url = (config.base_url or "https://generativelanguage.googleapis.com").rstrip("/")
        url = f"{base_url}/v1beta/models/{config.model_name}:streamGenerateContent"
        body = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {"temperature": 0.3},
        }
        client = self._build_httpx_client(config, cancel_control=cancel_control)
        full_text = ""
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0
        try:
            with client.stream("POST", url, params={"key": config.api_key, "alt": "sse"}, json=body, timeout=180) as response:
                response.raise_for_status()
                buffer = ""
                for chunk in response.iter_text():
                    if cancel_control and cancel_control.is_cancelled():
                        raise RecruitmentTaskCancelled("任务已被用户停止。")
                    buffer += chunk
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.strip()
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if not data_str or data_str == "[DONE]":
                            continue
                        try:
                            event = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        candidates = event.get("candidates") or []
                        for cand in candidates:
                            parts = cand.get("content", {}).get("parts") or []
                            for part in parts:
                                text = part.get("text", "")
                                if text:
                                    full_text += text
                                    on_delta(text)
                        usage = event.get("usageMetadata")
                        if usage:
                            prompt_tokens = usage.get("promptTokenCount") or prompt_tokens
                            completion_tokens = usage.get("candidatesTokenCount") or completion_tokens
                            total_tokens = usage.get("totalTokenCount") or total_tokens
        except RecruitmentTaskCancelled:
            raise
        except Exception as exc:
            if cancel_control and cancel_control.is_cancelled():
                raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
            raise
        finally:
            try:
                client.close()
            except Exception:
                pass
        return {
            "content": {"markdown": full_text, "html": full_text.replace("\n", "<br />")},
            "token_usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "total_tokens": total_tokens},
        }

    def _stream_anthropic_text(
        self,
        config: RecruitmentLLMRuntimeConfig,
        system_prompt: str,
        user_prompt: str,
        on_delta: Callable[[str], None],
        cancel_control: Optional[RecruitmentTaskControl] = None,
    ) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for Anthropic")
        base_url = (config.base_url or "https://api.anthropic.com").rstrip("/")
        client = self._build_httpx_client(config, cancel_control=cancel_control)
        full_text = ""
        input_tokens = 0
        output_tokens = 0
        try:
            with client.stream(
                "POST",
                f"{base_url}/v1/messages",
                headers={"x-api-key": config.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={
                    "model": config.model_name,
                    "max_tokens": 16000,
                    "temperature": 0.3,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                    "stream": True,
                },
                timeout=180,
            ) as response:
                response.raise_for_status()
                buffer = ""
                for chunk in response.iter_text():
                    if cancel_control and cancel_control.is_cancelled():
                        raise RecruitmentTaskCancelled("任务已被用户停止。")
                    buffer += chunk
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.strip()
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if not data_str:
                            continue
                        try:
                            event = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        event_type = event.get("type")
                        if event_type == "content_block_delta":
                            delta = event.get("delta") or {}
                            text = delta.get("text", "")
                            if text:
                                full_text += text
                                on_delta(text)
                        elif event_type == "message_delta":
                            usage = event.get("usage") or {}
                            output_tokens = usage.get("output_tokens") or output_tokens
                        elif event_type == "message_start":
                            usage = (event.get("message") or {}).get("usage") or {}
                            input_tokens = usage.get("input_tokens") or input_tokens
        except RecruitmentTaskCancelled:
            raise
        except Exception as exc:
            if cancel_control and cancel_control.is_cancelled():
                raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
            raise
        finally:
            try:
                client.close()
            except Exception:
                pass
        return {
            "content": {"markdown": full_text, "html": full_text.replace("\n", "<br />")},
            "token_usage": {"prompt_tokens": input_tokens, "completion_tokens": output_tokens, "total_tokens": input_tokens + output_tokens},
        }

    def _call_anthropic_json(
        self,
        config: RecruitmentLLMRuntimeConfig,
        system_prompt: str,
        user_prompt: str,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        *,
        task_type: str = "",
        read_timeout_override: Optional[float] = None,
        screening_total_timeout_seconds: Optional[float] = None,
        remaining_budget_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for Anthropic")
        base_url = (config.base_url or "https://api.anthropic.com").rstrip("/")
        configured_timeout_seconds = _derive_primary_timeout_seconds(config)
        client = self._build_httpx_client(
            config,
            cancel_control=cancel_control,
            read_timeout_override=read_timeout_override,
        )
        try:
            response = client.post(
                f"{base_url}/v1/messages",
                headers={"x-api-key": config.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={
                    "model": config.model_name,
                    "max_tokens": config.extra_config.get("max_tokens_override") or 16000,
                    "temperature": 0,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": _compose_json_user_prompt(user_prompt)}],
                },
            )
            response.raise_for_status()
            if cancel_control:
                cancel_control.raise_if_cancelled()
            payload = response.json()
        except Exception as exc:
            if cancel_control and cancel_control.is_cancelled():
                raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
            raise
        finally:
            try:
                client.close()
            except Exception:
                pass
        raw_text = self._extract_text_from_anthropic(payload) or "{}"
        usage = payload.get("usage") or {}
        response_debug = _build_timeout_debug_meta(
            configured_timeout_seconds=configured_timeout_seconds,
            effective_timeout_seconds=read_timeout_override or configured_timeout_seconds,
            screening_total_timeout_seconds=screening_total_timeout_seconds,
            remaining_budget_seconds=remaining_budget_seconds,
            is_stream_mode=False,
        )
        if task_type in STRICT_JSON_TASK_TYPES:
            strict_json_result = _parse_strict_json_response(
                raw_text,
                task_type=task_type or "",
                provider_payload=payload,
                response_debug=response_debug,
            )
            content = strict_json_result.get("content") or {}
            debug_meta = dict(strict_json_result.get("debug_meta") or response_debug)
            warnings = list(strict_json_result.get("warnings") or [])
        else:
            content = _parse_llm_json_response(raw_text)
            debug_meta = response_debug
            warnings = []
        return {
            "content": content,
            "token_usage": {"prompt_tokens": usage.get("input_tokens"), "completion_tokens": usage.get("output_tokens"), "total_tokens": (usage.get("input_tokens") or 0) + (usage.get("output_tokens") or 0)},
            "raw_response_text": raw_text,
            "response_debug": debug_meta,
            "warnings": warnings,
        }

    def _call_anthropic_text(self, config: RecruitmentLLMRuntimeConfig, system_prompt: str, user_prompt: str, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for Anthropic")
        base_url = (config.base_url or "https://api.anthropic.com").rstrip("/")
        client = self._build_httpx_client(config, cancel_control=cancel_control)
        try:
            response = client.post(f"{base_url}/v1/messages", headers={"x-api-key": config.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, json={"model": config.model_name, "max_tokens": 16000, "temperature": 0.3, "system": system_prompt, "messages": [{"role": "user", "content": user_prompt}]})
            response.raise_for_status()
            if cancel_control:
                cancel_control.raise_if_cancelled()
            payload = response.json()
        except Exception as exc:
            if cancel_control and cancel_control.is_cancelled():
                raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
            raise
        finally:
            try:
                client.close()
            except Exception:
                pass
        raw_text = self._extract_text_from_anthropic(payload)
        usage = payload.get("usage") or {}
        return {"content": {"markdown": raw_text, "html": raw_text.replace("\n", "<br />")}, "token_usage": {"prompt_tokens": usage.get("input_tokens"), "completion_tokens": usage.get("output_tokens"), "total_tokens": (usage.get("input_tokens") or 0) + (usage.get("output_tokens") or 0)}}

    def generate_json(
        self,
        *,
        task_type: str,
        system_prompt: str,
        user_prompt: str,
        fallback_builder: Optional[Callable[[], Dict[str, Any]]] = None,
        cancel_control: Optional[RecruitmentTaskControl] = None,
        runtime_config: Optional[RecruitmentLLMRuntimeConfig] = None,
        timeout_seconds_override: Optional[float] = None,
        screening_total_timeout_seconds: Optional[float] = None,
        remaining_budget_seconds: Optional[float] = None,
        max_tokens_override: Optional[int] = None,
    ) -> Dict[str, Any]:
        config = _clone_runtime_config_with_task_overrides(
            runtime_config or self.resolve_config(task_type),
            task_type=task_type,
            response_mode="json",
        )
        configured_timeout_seconds = _derive_primary_timeout_seconds(config)
        effective_timeout_seconds = _compute_effective_stage_timeout(
            timeout_seconds_override if timeout_seconds_override is not None else remaining_budget_seconds,
            configured_timeout_seconds,
        )
        config.extra_config["read_timeout_seconds"] = effective_timeout_seconds
        if max_tokens_override is not None:
            config.extra_config["max_tokens_override"] = max_tokens_override
        prompt_snapshot = f"SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}"
        full_request_snapshot = _build_request_snapshot(config, response_mode="json", system_prompt=system_prompt, user_prompt=user_prompt)
        default_max_retries = 0 if task_type in STRICT_JSON_TASK_TYPES else 2
        max_retries = max(0, int(config.extra_config.get("max_retries") if "max_retries" in config.extra_config else default_max_retries))
        retry_delay = float(config.extra_config.get("retry_delay_seconds") or 1.2)
        last_error: Exception | None = None
        first_attempt_failed_reason: Optional[str] = None
        strict_json_recovery_retry_count = 0
        strict_json_recovery_budget = 1 if task_type in STRICT_JSON_RECOVERY_RETRY_TASK_TYPES else 0
        standard_retry_attempts = 0
        request_attempt_limit = max_retries + 1 + strict_json_recovery_budget
        for _request_attempt in range(request_attempt_limit):
            try:
                if config.runtime_provider == "gemini":
                    response_payload = self._call_gemini_json(
                        config,
                        system_prompt,
                        user_prompt,
                        cancel_control=cancel_control,
                        task_type=task_type,
                        read_timeout_override=effective_timeout_seconds,
                        screening_total_timeout_seconds=screening_total_timeout_seconds or SCREENING_TOTAL_TIMEOUT_SECONDS,
                        remaining_budget_seconds=remaining_budget_seconds,
                    )
                elif config.runtime_provider == "anthropic":
                    response_payload = self._call_anthropic_json(
                        config,
                        system_prompt,
                        user_prompt,
                        cancel_control=cancel_control,
                        task_type=task_type,
                        read_timeout_override=effective_timeout_seconds,
                        screening_total_timeout_seconds=screening_total_timeout_seconds or SCREENING_TOTAL_TIMEOUT_SECONDS,
                        remaining_budget_seconds=remaining_budget_seconds,
                    )
                else:
                    response_payload = self._call_openai_compatible_json(
                        config,
                        system_prompt,
                        user_prompt,
                        cancel_control=cancel_control,
                        task_type=task_type,
                        read_timeout_override=effective_timeout_seconds,
                        screening_total_timeout_seconds=screening_total_timeout_seconds or SCREENING_TOTAL_TIMEOUT_SECONDS,
                        remaining_budget_seconds=remaining_budget_seconds,
                    )
                content = response_payload["content"]
                return {
                    "content": content,
                    "provider": config.provider,
                    "model_name": config.model_name,
                    "source": config.source,
                    "used_fallback": False,
                    "prompt_snapshot": prompt_snapshot,
                    "full_request_snapshot": full_request_snapshot,
                    "input_summary": _truncate(user_prompt, 600),
                    "output_summary": _truncate(content, 600),
                    "token_usage": response_payload.get("token_usage"),
                    "error_message": None,
                    "raw_response_text": response_payload.get("raw_response_text"),
                    "response_debug": {
                        **_build_timeout_debug_meta(
                            configured_timeout_seconds=configured_timeout_seconds,
                            effective_timeout_seconds=effective_timeout_seconds,
                            screening_total_timeout_seconds=screening_total_timeout_seconds or SCREENING_TOTAL_TIMEOUT_SECONDS,
                            remaining_budget_seconds=remaining_budget_seconds,
                            is_stream_mode=bool(dict(response_payload.get("response_debug") or {}).get("is_stream_mode")),
                        ),
                        **dict(response_payload.get("response_debug") or {}),
                        **({"first_attempt_failed_reason": first_attempt_failed_reason} if first_attempt_failed_reason else {}),
                        **({"strict_json_recovery_retry_count": strict_json_recovery_retry_count} if strict_json_recovery_retry_count else {}),
                    },
                    "warnings": [
                        *list(response_payload.get("warnings") or []),
                        *(
                            ["strict JSON 首次解析失败，已自动进行一次同 prompt 恢复重试"]
                            if strict_json_recovery_retry_count
                            else []
                        ),
                    ],
                }
            except RecruitmentAIScreeningTotalTimeoutError:
                raise
            except RecruitmentTaskCancelled:
                raise
            except Exception as exc:
                last_error = exc
                if _request_attempt == 0:
                    first_attempt_failed_reason = _classify_attempt_failure_reason(exc)
                    if isinstance(exc, RecruitmentAIJSONParseError):
                        exc.debug_meta = {
                            **dict(getattr(exc, "debug_meta", {}) or {}),
                            "first_attempt_failed_reason": first_attempt_failed_reason,
                        }
                if cancel_control and cancel_control.is_cancelled():
                    raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
                if _should_retry_strict_json_recovery(task_type, exc) and strict_json_recovery_retry_count < 1:
                    strict_json_recovery_retry_count += 1
                    logger.warning(
                        "Recruitment JSON task %s hit malformed strict JSON, retrying once with the same prompt: %s",
                        task_type,
                        exc,
                    )
                    continue
                if standard_retry_attempts < max_retries and _is_retryable_error(exc):
                    sleep_seconds = retry_delay * (standard_retry_attempts + 1)
                    standard_retry_attempts += 1
                    logger.warning("Recruitment JSON task %s hit retryable error, retrying in %.1fs: %s", task_type, sleep_seconds, exc)
                    if cancel_control:
                        if cancel_control.wait(sleep_seconds):
                            raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
                    else:
                        time.sleep(sleep_seconds)
                    continue
                logger.warning("Recruitment JSON task %s failed: %s", task_type, exc)
                break
        if fallback_builder is None:
            if isinstance(last_error, RecruitmentAIScreeningTotalTimeoutError):
                raise last_error
            if isinstance(last_error, RecruitmentAIJSONParseError):
                if first_attempt_failed_reason or strict_json_recovery_retry_count:
                    last_error.debug_meta = {
                        **dict(getattr(last_error, "debug_meta", {}) or {}),
                        **({"first_attempt_failed_reason": first_attempt_failed_reason} if first_attempt_failed_reason else {}),
                        **({"strict_json_recovery_retry_count": strict_json_recovery_retry_count} if strict_json_recovery_retry_count else {}),
                    }
                raise last_error
            if isinstance(last_error, httpx.TimeoutException):
                raise RecruitmentAITimeoutError(_format_http_error(last_error), last_error=last_error) from last_error
            if last_error and _is_retryable_error(last_error) and max_retries > 0:
                raise RecruitmentAIRetryExhaustedError(_format_http_error(last_error), last_error=last_error, attempts=max_retries + 1) from last_error
            raise RuntimeError(_format_http_error(last_error or RuntimeError("Unknown AI task failure")))
        fallback = fallback_builder()
        return {
            "content": fallback,
            "provider": config.provider,
            "model_name": config.model_name,
            "source": config.source,
            "used_fallback": True,
            "prompt_snapshot": prompt_snapshot,
            "full_request_snapshot": full_request_snapshot,
            "input_summary": _truncate(user_prompt, 600),
            "output_summary": _truncate(fallback, 600),
            "token_usage": None,
            "error_message": _format_http_error(last_error or RuntimeError("Unknown AI task failure")),
            "raw_response_text": getattr(last_error, "raw_response_text", None) if last_error else None,
        }

    def generate_text(self, *, task_type: str, system_prompt: str, user_prompt: str, fallback_builder: Callable[[], Dict[str, str]], cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        config = self.resolve_config(task_type)
        prompt_snapshot = f"SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}"
        full_request_snapshot = _build_request_snapshot(config, response_mode="text", system_prompt=system_prompt, user_prompt=user_prompt)
        max_retries = max(0, int(config.extra_config.get("max_retries") or 2))
        retry_delay = float(config.extra_config.get("retry_delay_seconds") or 1.2)
        last_error: Exception | None = None
        for attempt in range(max_retries + 1):
            try:
                if config.runtime_provider == "gemini":
                    response_payload = self._call_gemini_text(config, system_prompt, user_prompt, cancel_control=cancel_control)
                elif config.runtime_provider == "anthropic":
                    response_payload = self._call_anthropic_text(config, system_prompt, user_prompt, cancel_control=cancel_control)
                else:
                    response_payload = self._call_openai_compatible_text(config, system_prompt, user_prompt, cancel_control=cancel_control)
                content = response_payload["content"]
                output_summary = content.get("markdown") if isinstance(content, dict) else content
                return {"content": content, "provider": config.provider, "model_name": config.model_name, "source": config.source, "used_fallback": False, "prompt_snapshot": prompt_snapshot, "full_request_snapshot": full_request_snapshot, "input_summary": _truncate(user_prompt, 600), "output_summary": _truncate(output_summary, 600), "token_usage": response_payload.get("token_usage"), "error_message": None}
            except RecruitmentTaskCancelled:
                raise
            except Exception as exc:
                last_error = exc
                if cancel_control and cancel_control.is_cancelled():
                    raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
                if attempt < max_retries and _is_retryable_error(exc):
                    sleep_seconds = retry_delay * (attempt + 1)
                    logger.warning("Recruitment text task %s hit retryable error, retrying in %.1fs: %s", task_type, sleep_seconds, exc)
                    if cancel_control:
                        if cancel_control.wait(sleep_seconds):
                            raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
                    else:
                        time.sleep(sleep_seconds)
                    continue
                logger.warning("Recruitment text task %s failed, falling back: %s", task_type, exc)
                break
        fallback = fallback_builder()
        return {"content": fallback, "provider": config.provider, "model_name": config.model_name, "source": config.source, "used_fallback": True, "prompt_snapshot": prompt_snapshot, "full_request_snapshot": full_request_snapshot, "input_summary": _truncate(user_prompt, 600), "output_summary": _truncate(fallback, 600), "token_usage": None, "error_message": _format_http_error(last_error or RuntimeError("Unknown AI task failure"))}

    def match_position(self, candidate_id: int, resume_content: str, positions: List[Dict[str, Any]], *, key_id: Optional[str] = None, runtime_config: Optional[RecruitmentLLMRuntimeConfig] = None) -> Dict[str, Any]:
        """
        使用 AI 匹配最合适的岗位。

        Args:
            candidate_id: 候选人 ID
            resume_content: 简历文本
            positions: 候选岗位列表
            key_id: 指定使用哪个 key（由调度器传入），为 None 时使用默认 round-robin
            runtime_config: 预解析的运行时配置（由调度器传入），为 None 时自动解析
        """
        if not positions:
            return {
                "position_id": None,
                "position_title": None,
                "confidence": None,
                "provider": None,
                "model_name": None,
                "source": None,
                "used_fallback": True,
                "error_message": "No positions available",
                "prompt_snapshot": None,
                "full_request_snapshot": None,
                "input_summary": None,
                "output_summary": "No positions available",
                "raw_response_text": None,
                "parsed_response": {
                    "position_id": None,
                    "position_title": None,
                    "confidence": None,
                    "potential_position": None,
                    "potential_reason": None,
                },
                "reason": "无可用岗位",
                "potential_position": None,
                "potential_reason": None,
            }

        # 构建结构化岗位列表（比 JSON 更省 token）
        position_list = "\n".join(
            f"{p.get('id')}. {p.get('title')}（{p.get('department') or ''}）：{(p.get('key_requirements') or p.get('summary') or '')[:150]}"
            for p in positions
        )

        system_prompt = "你是招聘岗位匹配助手。根据候选人简历原文，从给定岗位列表中找出最匹配的岗位，并判断可培养的转岗潜力方向。\n输出严格遵守JSON格式，禁止输出任何JSON以外的内容。"

        user_prompt = f"""## 系统岗位列表
{position_list}

## 候选人简历（已截取前半段）
{resume_content}

## 规则
1. 以简历原文中的实际工作经历、项目经历、技能和教育背景为主要依据，求职意向仅作参考
2. 必须从岗位列表中选择，不能创造新岗位
3. **必须有明确的匹配证据才能返回岗位ID**：候选人的核心技能、工作经历或专业方向与岗位要求有直接关联。"没有明显不匹配"不等于匹配
4. 岗位描述模糊、无法判断是否匹配时，返回 null
5. 无匹配时 position_id 返回 null，不要强行匹配
6. confidence 返回 0-100 的整数，表示对“主匹配岗位”的把握；无匹配时返回 0
7. potential_position 用中文概括候选人的“转岗潜力方向”，可以是岗位列表中的某个岗位名称，也可以是概括性方向；没有明显潜力时返回 null
8. potential_reason 用中文，50字以内，说明为什么认为候选人具备该转岗潜力；没有明显潜力时返回 null
9. reason 用中文，50字以内，说明匹配或不匹配的原因

## 输出格式
匹配成功：{{"position_id": 17, "position_title": "税务会计", "confidence": 88, "reason": "候选人有3年增值税申报经验，与岗位核心要求高度吻合", "potential_position": "财务分析", "potential_reason": "具备报表和数据分析基础，可向财务分析延展"}}
无匹配：{{"position_id": null, "position_title": null, "confidence": 0, "reason": "候选人为产品经理背景，系统现有岗位均为财务和技术类，无对应方向", "potential_position": "售前解决方案", "potential_reason": "跨团队沟通和需求分析能力较强，可培养为售前方向"}}"""

        try:
            result = self.generate_json(
                task_type="ai_position_match",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                runtime_config=runtime_config,
                max_tokens_override=800,
                fallback_builder=lambda: {
                    "position_id": None,
                    "position_title": None,
                    "confidence": 0,
                    "reason": "AI匹配失败",
                    "potential_position": None,
                    "potential_reason": None,
                },
            )

            content = result.get("content") or {}
            parsed = content if isinstance(content, dict) else {}
            position_id = parsed.get("position_id")
            normalized_position_id: Optional[int] = None
            if position_id not in (None, ""):
                try:
                    normalized_position_id = int(position_id)
                except (TypeError, ValueError):
                    normalized_position_id = None
            position_title = parsed.get("position_title")
            normalized_position_title = str(position_title or "").strip() or None
            confidence = parsed.get("confidence")
            normalized_confidence: Optional[float] = None
            if confidence not in (None, ""):
                try:
                    normalized_confidence = max(0.0, min(100.0, float(confidence)))
                except (TypeError, ValueError):
                    normalized_confidence = None
            reason = str(parsed.get("reason") or "").strip() or "AI自动匹配"
            potential_position = str(parsed.get("potential_position") or "").strip() or None
            potential_reason = str(parsed.get("potential_reason") or "").strip() or None

            return {
                "position_id": normalized_position_id,
                "position_title": normalized_position_title,
                "confidence": normalized_confidence,
                "reason": reason,
                "potential_position": potential_position,
                "potential_reason": potential_reason,
                "provider": result.get("provider"),
                "model_name": result.get("model_name"),
                "source": result.get("source"),
                "used_fallback": bool(result.get("used_fallback")),
                "error_message": result.get("error_message"),
                "prompt_snapshot": result.get("prompt_snapshot"),
                "full_request_snapshot": result.get("full_request_snapshot"),
                "input_summary": result.get("input_summary"),
                "output_summary": result.get("output_summary"),
                "raw_response_text": result.get("raw_response_text"),
                "parsed_response": {
                    "position_id": normalized_position_id,
                    "position_title": normalized_position_title,
                    "confidence": normalized_confidence,
                    "reason": reason,
                    "potential_position": potential_position,
                    "potential_reason": potential_reason,
                },
            }

        except Exception as exc:
            logger.error(f"AI position matching failed for candidate {candidate_id}: {exc}")
            return {
                "position_id": None,
                "position_title": None,
                "confidence": None,
                "reason": f"匹配异常：{str(exc)[:100]}",
                "potential_position": None,
                "potential_reason": None,
                "provider": None,
                "model_name": None,
                "source": None,
                "used_fallback": True,
                "error_message": str(exc),
                "prompt_snapshot": None,
                "full_request_snapshot": None,
                "input_summary": _truncate(resume_content, 600),
                "output_summary": "AI matching failed",
                "raw_response_text": None,
                "parsed_response": {
                    "position_id": None,
                    "position_title": None,
                    "confidence": None,
                    "reason": f"匹配异常：{str(exc)[:100]}",
                    "potential_position": None,
                    "potential_reason": None,
                },
            }
