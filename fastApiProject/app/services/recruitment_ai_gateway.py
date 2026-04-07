import json
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..recruitment_models import RecruitmentLLMConfig
from ..secret_crypto import decrypt_secret, mask_secret
from .recruitment_task_control import RecruitmentTaskCancelled, RecruitmentTaskControl

logger = logging.getLogger(__name__)


class RecruitmentAIJSONParseError(RuntimeError):
    def __init__(self, message: str, *, raw_response_text: str = "", provider_payload: Any = None):
        super().__init__(message)
        self.raw_response_text = raw_response_text or ""
        self.provider_payload = provider_payload


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
    text = str(value or "").strip()
    if not text:
        return "{}"
    text = text.replace("\ufeff", "").replace("“", "\"").replace("”", "\"").replace("’", "'")
    text = re.sub(r"^\s*(?:json|JSON)\s*[:：]\s*", "", text)
    text = re.sub(r"^\s*Here(?:'s| is)?\s+the\s+JSON\s*[:：]\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^\s*以下是(?:结果|JSON)?\s*[:：]\s*", "", text)
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
    patterns = (
        (
            r'("(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?|\}|\])(\s*)(?=")',
            r"\1,\2",
        ),
        (
            r'("(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?|\}|\])(\s*)(?=[\{\[])',
            r"\1,\2",
        ),
    )
    for _ in range(4):
        previous = repaired
        for pattern, replacement in patterns:
            repaired = re.sub(pattern, replacement, repaired, flags=re.IGNORECASE)
        if repaired == previous:
            break
    return repaired


def _repair_json_candidate(value: str) -> str:
    repaired = _normalize_json_candidate_text(_extract_json_candidate(value or "{}").strip() or "{}")
    repaired = _escape_control_chars_in_json_strings(repaired)
    repaired = _repair_missing_commas_globally(repaired)
    repaired = re.sub(r'(["\}\]0-9a-zA-Z])(\\n|\n|\r\n?)(\s*")', r"\1,\3", repaired)
    repaired = re.sub(r"(\})(\s*)(\")", r"\1,\2\3", repaired)
    repaired = re.sub(r"(\])(\s*)(\")", r"\1,\2\3", repaired)
    repaired = re.sub(r'("(?:\\.|[^"\\])*")\s*:\s*("(?:\\.|[^"\\])*")\s*("(?:\\.|[^"\\])*")\s*:', r'\1: \2, \3:', repaired)
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
    for _ in range(8):
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
            balanced = _repair_json_candidate(repaired)
            if balanced != repaired:
                repaired = balanced
                continue
            break
    if last_error:
        raise last_error
    return json.loads(repaired)


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
    return provider in {"glm", "zhipu"} or model_name.startswith("glm-4-flash") or model_name.startswith("glm-4-plus")


def _resolve_request_temperature(config: "RecruitmentLLMRuntimeConfig", *, response_mode: str) -> float | int:
    if response_mode != "json":
        return 0.3
    if _is_glm_json_request(config, response_mode=response_mode):
        return 0
    return 0.2


def _resolve_openai_json_response_format(config: "RecruitmentLLMRuntimeConfig", *, response_mode: str) -> Optional[Dict[str, str]]:
    if not _is_glm_json_request(config, response_mode=response_mode):
        return None
    return {"type": "json_object"}


def _build_request_snapshot(config: "RecruitmentLLMRuntimeConfig", *, response_mode: str, system_prompt: str, user_prompt: str) -> str:
    temperature = _resolve_request_temperature(config, response_mode=response_mode)
    if config.runtime_provider == "gemini":
        request_body = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": f"{user_prompt}\n\n请仅返回有效 JSON。"} if response_mode == "json" else {"text": user_prompt}]}],
            "generationConfig": {"temperature": temperature, **({"responseMimeType": "application/json"} if response_mode == "json" else {})},
        }
        endpoint = f"{(config.base_url or 'https://generativelanguage.googleapis.com').rstrip('/')}/v1beta/models/{config.model_name}:generateContent"
    elif config.runtime_provider == "anthropic":
        request_body = {
            "model": config.model_name,
            "max_tokens": 4000,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": f"{user_prompt}\n\nReturn valid JSON only." if response_mode == "json" else user_prompt}],
        }
        endpoint = f"{(config.base_url or 'https://api.anthropic.com').rstrip('/')}/v1/messages"
    else:
        request_body = {
            "model": config.model_name,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"{user_prompt}\n\nPlease return valid JSON only." if response_mode == "json" else user_prompt},
            ],
        }
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
            "request_body": request_body,
        }
    )


def _is_retryable_error(exc: Exception) -> bool:
    if isinstance(exc, RecruitmentAIJSONParseError):
        return False
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
    def __init__(self, db: Session):
        self.db = db

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
        config = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.is_active.is_(True), RecruitmentLLMConfig.task_type == task_type).order_by(RecruitmentLLMConfig.priority.asc(), RecruitmentLLMConfig.id.asc()).first()
        if not config:
            config = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.is_active.is_(True), RecruitmentLLMConfig.task_type == "default").order_by(RecruitmentLLMConfig.priority.asc(), RecruitmentLLMConfig.id.asc()).first()
        if config:
            return self.resolve_runtime_config_for_row(config)

        forced_provider = (os.getenv("RECRUITMENT_LLM_PROVIDER") or "").strip().lower()
        if forced_provider:
            definition = get_provider_definition(forced_provider)
            return self._build_runtime_config(definition, model_name=os.getenv("RECRUITMENT_LLM_MODEL") or None, base_url=os.getenv("RECRUITMENT_LLM_BASE_URL") or None, api_key=os.getenv("RECRUITMENT_LLM_API_KEY") or None, source="env:forced")

        for provider_name in PROVIDER_PRIORITY:
            definition = get_provider_definition(provider_name)
            api_key = self._resolve_api_key_from_provider(definition)
            if api_key:
                model_override = settings.AI_MODEL_NAME if provider_name == "openai-compatible" else None
                base_override = settings.AI_BASE_URL if provider_name == "openai-compatible" else None
                return self._build_runtime_config(definition, model_name=model_override, base_url=base_override, api_key=api_key, source=f"env:auto:{definition.provider}")

        return self._build_runtime_config(get_provider_definition("openai-compatible"), model_name=settings.AI_MODEL_NAME, base_url=settings.AI_BASE_URL, api_key=settings.AI_API_KEY, source="env:fallback")

    def _build_httpx_client(self, config: RecruitmentLLMRuntimeConfig, *, cancel_control: Optional[RecruitmentTaskControl] = None) -> httpx.Client:
        client = httpx.Client(timeout=float(config.extra_config.get("timeout_seconds") or 180))
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

    def _stream_openai_compatible_completion(
        self,
        config: RecruitmentLLMRuntimeConfig,
        *,
        system_prompt: str,
        user_prompt: str,
        response_mode: str,
        on_delta: Optional[Callable[[str], None]] = None,
        cancel_control: Optional[RecruitmentTaskControl] = None,
    ) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for OpenAI compatible provider")
        endpoint = self._build_openai_compatible_endpoint(config)
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"{user_prompt}\n\nPlease return valid JSON only." if response_mode == "json" else user_prompt,
            },
        ]
        body = {
            "model": config.model_name,
            "temperature": _resolve_request_temperature(config, response_mode=response_mode),
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        response_format = _resolve_openai_json_response_format(config, response_mode=response_mode)
        if response_format:
            body["response_format"] = response_format
        client = self._build_httpx_client(config, cancel_control=cancel_control)
        headers = {
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        }
        chunks: list[str] = []
        raw_lines_seen: list[str] = []
        token_usage: Optional[Dict[str, Any]] = None
        try:
            with client.stream("POST", endpoint, headers=headers, json=body) as response:
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
                        logger.warning(
                            "OpenAI-compatible JSON stream returned no SSE delta content; recovered content from non-SSE response body for model=%s",
                            config.model_name,
                        )
        if response_mode == "json":
            if not raw_text:
                raise RecruitmentAIJSONParseError(
                    "AI screening JSON 解析失败: 模型返回了空响应内容",
                    raw_response_text="",
                )
            try:
                content = _parse_llm_json_response(raw_text or "{}")
            except json.JSONDecodeError as exc:
                raise RecruitmentAIJSONParseError(
                    f"AI screening JSON 解析失败: {exc}",
                    raw_response_text=raw_text,
                ) from exc
            return {
                "content": content,
                "token_usage": token_usage,
                "raw_response_text": raw_text,
            }
        return {
            "content": {"markdown": raw_text, "html": raw_text.replace("\n", "<br />")},
            "token_usage": token_usage,
        }

    def _call_openai_compatible_json(self, config: RecruitmentLLMRuntimeConfig, system_prompt: str, user_prompt: str, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        return self._stream_openai_compatible_completion(
            config,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_mode="json",
            cancel_control=cancel_control,
        )

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
        config = self.resolve_config(task_type)
        prompt_snapshot = f"SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}"
        full_request_snapshot = _build_request_snapshot(config, response_mode="text", system_prompt=system_prompt, user_prompt=user_prompt)
        max_retries = max(0, int(config.extra_config.get("max_retries") or 1))
        retry_delay = float(config.extra_config.get("retry_delay_seconds") or 1.0)
        last_error: Exception | None = None
        for attempt in range(max_retries + 1):
            try:
                if config.runtime_provider == "openai-compatible":
                    response_payload = self._stream_openai_compatible_completion(
                        config,
                        system_prompt=system_prompt,
                        user_prompt=user_prompt,
                        response_mode="text",
                        on_delta=on_delta,
                        cancel_control=cancel_control,
                    )
                elif config.runtime_provider == "gemini":
                    response_payload = self._call_gemini_text(config, system_prompt, user_prompt, cancel_control=cancel_control)
                    content = response_payload.get("content") or {}
                    markdown = str(content.get("markdown") or "")
                    for index in range(0, len(markdown), 24):
                        on_delta(markdown[index:index + 24])
                else:
                    response_payload = self._call_anthropic_text(config, system_prompt, user_prompt, cancel_control=cancel_control)
                    content = response_payload.get("content") or {}
                    markdown = str(content.get("markdown") or "")
                    for index in range(0, len(markdown), 24):
                        on_delta(markdown[index:index + 24])
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

    def _call_gemini_json(self, config: RecruitmentLLMRuntimeConfig, system_prompt: str, user_prompt: str, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for Gemini")
        base_url = (config.base_url or "https://generativelanguage.googleapis.com").rstrip("/")
        url = f"{base_url}/v1beta/models/{config.model_name}:generateContent"
        body = {"system_instruction": {"parts": [{"text": system_prompt}]}, "contents": [{"role": "user", "parts": [{"text": f"{user_prompt}\n\n请仅返回有效 JSON。"}]}], "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}}
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
        raw_text = "\n".join([part.get("text", "") for part in parts if part.get("text")]).strip() or "{}"
        try:
            content = _parse_llm_json_response(raw_text)
        except json.JSONDecodeError as exc:
            raise RecruitmentAIJSONParseError(
                f"AI screening JSON 解析失败: {exc}",
                raw_response_text=raw_text,
                provider_payload=payload,
            ) from exc
        usage = payload.get("usageMetadata") or {}
        return {
            "content": content,
            "token_usage": {"prompt_tokens": usage.get("promptTokenCount"), "completion_tokens": usage.get("candidatesTokenCount"), "total_tokens": usage.get("totalTokenCount")},
            "raw_response_text": raw_text,
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

    def _call_anthropic_json(self, config: RecruitmentLLMRuntimeConfig, system_prompt: str, user_prompt: str, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for Anthropic")
        base_url = (config.base_url or "https://api.anthropic.com").rstrip("/")
        client = self._build_httpx_client(config, cancel_control=cancel_control)
        try:
            response = client.post(f"{base_url}/v1/messages", headers={"x-api-key": config.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, json={"model": config.model_name, "max_tokens": 4000, "temperature": 0.2, "system": system_prompt, "messages": [{"role": "user", "content": f"{user_prompt}\n\nReturn valid JSON only."}]})
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
        try:
            content = _parse_llm_json_response(raw_text)
        except json.JSONDecodeError as exc:
            raise RecruitmentAIJSONParseError(
                f"AI screening JSON 解析失败: {exc}",
                raw_response_text=raw_text,
                provider_payload=payload,
            ) from exc
        usage = payload.get("usage") or {}
        return {
            "content": content,
            "token_usage": {"prompt_tokens": usage.get("input_tokens"), "completion_tokens": usage.get("output_tokens"), "total_tokens": (usage.get("input_tokens") or 0) + (usage.get("output_tokens") or 0)},
            "raw_response_text": raw_text,
        }

    def _call_anthropic_text(self, config: RecruitmentLLMRuntimeConfig, system_prompt: str, user_prompt: str, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        if not config.api_key:
            raise RuntimeError("Missing API key for Anthropic")
        base_url = (config.base_url or "https://api.anthropic.com").rstrip("/")
        client = self._build_httpx_client(config, cancel_control=cancel_control)
        try:
            response = client.post(f"{base_url}/v1/messages", headers={"x-api-key": config.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, json={"model": config.model_name, "max_tokens": 4000, "temperature": 0.3, "system": system_prompt, "messages": [{"role": "user", "content": user_prompt}]})
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

    def generate_json(self, *, task_type: str, system_prompt: str, user_prompt: str, fallback_builder: Optional[Callable[[], Dict[str, Any]]] = None, cancel_control: Optional[RecruitmentTaskControl] = None) -> Dict[str, Any]:
        config = self.resolve_config(task_type)
        prompt_snapshot = f"SYSTEM:\n{system_prompt}\n\nUSER:\n{user_prompt}"
        full_request_snapshot = _build_request_snapshot(config, response_mode="json", system_prompt=system_prompt, user_prompt=user_prompt)
        max_retries = max(0, int(config.extra_config.get("max_retries") or 2))
        retry_delay = float(config.extra_config.get("retry_delay_seconds") or 1.2)
        last_error: Exception | None = None
        for attempt in range(max_retries + 1):
            try:
                if config.runtime_provider == "gemini":
                    response_payload = self._call_gemini_json(config, system_prompt, user_prompt, cancel_control=cancel_control)
                elif config.runtime_provider == "anthropic":
                    response_payload = self._call_anthropic_json(config, system_prompt, user_prompt, cancel_control=cancel_control)
                else:
                    response_payload = self._call_openai_compatible_json(config, system_prompt, user_prompt, cancel_control=cancel_control)
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
                }
            except RecruitmentTaskCancelled:
                raise
            except Exception as exc:
                last_error = exc
                if cancel_control and cancel_control.is_cancelled():
                    raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
                if attempt < max_retries and _is_retryable_error(exc):
                    sleep_seconds = retry_delay * (attempt + 1)
                    logger.warning("Recruitment JSON task %s hit retryable error, retrying in %.1fs: %s", task_type, sleep_seconds, exc)
                    if cancel_control:
                        if cancel_control.wait(sleep_seconds):
                            raise RecruitmentTaskCancelled("任务已被用户停止。") from exc
                    else:
                        time.sleep(sleep_seconds)
                    continue
                logger.warning("Recruitment JSON task %s failed, falling back: %s", task_type, exc)
                break
        if fallback_builder is None:
            if isinstance(last_error, RecruitmentAIJSONParseError):
                raise last_error
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
            "raw_response_text": None,
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
