import json
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx

from app.services.recruitment_ai_gateway import RecruitmentAIGateway, RecruitmentAIJSONParseError, RecruitmentLLMRuntimeConfig
from app.services.recruitment_ai_gateway import RecruitmentAIScreeningTotalTimeoutError, SCREENING_TOTAL_TIMEOUT_SECONDS
from app.services.recruitment_prompts import (
    RESUME_PARSE_SYSTEM_PROMPT,
    RESUME_SCORE_SYSTEM_PROMPT,
    SCORE_ONLY_OUTPUT_SCHEMA,
    SCREENING_OUTPUT_SCHEMA,
)
from app.services.recruitment_service_impl import (
    RAW_SCREENING_SCORE_STORAGE_FORMAT,
    RecruitmentService,
    SCREENING_PAYLOAD_SCHEMA_CONFIG,
    SCREENING_FLOW_TASK_TYPE,
    SCREENING_WORKER_MAX_CONCURRENCY,
    _detect_score_json_variant_conflict,
    _build_score_compat_payload,
    _build_dimension_concern_summary,
    _build_dimension_reason_summary,
    _classify_screening_score_validity,
    _extract_json_parse_failure_meta,
    _extract_model_score_payload_with_meta,
    _prepare_resume_text_for_parse_prompt,
    _sanitize_ai_parsed_resume,
    _sanitize_ai_parsed_resume_with_meta,
    _validate_screening_payload_warnings,
    sanitize_screening_score_payload,
    sanitize_dimensions,
)


def _build_http_status_error(status_code: int, text: str = "") -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "https://example.test/v1/chat/completions")
    response = httpx.Response(status_code, request=request, text=text)
    return httpx.HTTPStatusError(f"{status_code} error", request=request, response=response)


def test_sanitize_dimensions_preserves_evidence_list():
    dimensions = sanitize_dimensions(
        [
            {
                "label": "IoT协议",
                "score": 1.0,
                "max_score": 1.0,
                "reason": "命中",
                "evidence": ["BLE 协议测试", "Zigbee 联调"],
            }
        ],
        SCREENING_PAYLOAD_SCHEMA_CONFIG["score"],
    )

    assert dimensions[0]["evidence"] == ["BLE 协议测试", "Zigbee 联调"]


def test_classify_screening_score_validity_marks_rule_text_evidence_invalid():
    score_payload = {
        "total_score": 1.0,
        "match_percent": 10,
        "advantages": ["有经验"],
        "concerns": ["需补充"],
        "recommendation": "建议继续观察",
        "suggested_status": "talent_pool",
        "dimensions": [
            {
                "label": "IoT协议",
                "score": 1.0,
                "max_score": 1.0,
                "reason": "命中",
                "evidence": ["核心第一优先，要求 BLE/Zigbee 协议经验"],
            }
        ],
    }
    schema_config = {
        "score": {
            **SCREENING_PAYLOAD_SCHEMA_CONFIG["score"],
            "required_dimension_labels": ("IoT协议",),
        }
    }

    valid, reasons = _classify_screening_score_validity(
        score_payload,
        schema_config,
        validation_warnings=["维度[IoT协议]的evidence疑似引用了 Skill/JD 规则文本。"],
    )

    assert valid is False
    assert any("Skill/JD 规则文本" in item for item in reasons)


def test_enqueue_screen_candidate_reuses_existing_live_task():
    service = RecruitmentService(Mock())
    service._get_candidate = Mock(return_value=SimpleNamespace(id=7, position_id=3, latest_resume_file_id=11))
    service._find_live_screening_task = Mock(return_value=SimpleNamespace(id=101, status="running", screening_run_id="run-101"))

    payload = service.enqueue_screen_candidate(7, "tester")

    assert payload == {
        "task_id": 101,
        "status": "running",
        "task_type": SCREENING_FLOW_TASK_TYPE,
        "related_candidate_id": 7,
        "related_position_id": 3,
        "screening_run_id": "run-101",
        "reused_existing_task": True,
    }


def test_batch_start_screen_candidates_reports_queued_and_skipped_counts():
    service = RecruitmentService(Mock())
    queued = {
        "task_id": 201,
        "status": "queued",
        "task_type": SCREENING_FLOW_TASK_TYPE,
        "related_candidate_id": 1,
        "related_position_id": 11,
        "reused_existing_task": False,
        "reused_existing_result": False,
    }
    reused = {
        "task_id": 202,
        "status": "running",
        "task_type": SCREENING_FLOW_TASK_TYPE,
        "related_candidate_id": 2,
        "related_position_id": 11,
        "reused_existing_task": True,
        "reused_existing_result": False,
    }
    service.enqueue_screen_candidate = Mock(side_effect=[queued, reused])
    service._dispatch_screening_queue = Mock(return_value={"started_count": 1, "active_count": 1, "max_concurrency": SCREENING_WORKER_MAX_CONCURRENCY})

    payload = service.batch_start_screen_candidates([1, 2], "tester")

    assert payload["batch_id"]
    assert payload["total_count"] == 2
    assert payload["queued_count"] == 1
    assert payload["duplicated_count"] == 0
    assert payload["skipped_existing_live_task_count"] == 1
    assert payload["failed_count"] == 0
    assert payload["task_ids"] == [201, 202]


def test_dispatch_screening_queue_uses_screening_root_task_filter():
    service = RecruitmentService(Mock())
    stale_query = Mock()
    stale_query.filter.return_value = stale_query
    stale_query.order_by.return_value = stale_query
    stale_query.all.return_value = []
    queued_query = Mock()
    queued_query.filter.return_value = queued_query
    queued_query.order_by.return_value = queued_query
    queued_query.limit.return_value = queued_query
    queued_query.all.return_value = [SimpleNamespace(id=301, created_by="tester")]
    dispatch_db = Mock()
    dispatch_db.query = Mock(side_effect=[stale_query, queued_query])
    service._start_background_ai_task = Mock()
    service._build_screening_queue_runner = Mock(return_value=Mock())

    with patch("app.services.recruitment_service_impl.SessionLocal", return_value=dispatch_db), \
            patch.object(RecruitmentService, "_screening_root_task_filter", return_value="ROOT_FILTER"), \
            patch("app.services.recruitment_service_impl._screening_provider_cooldown_until", None), \
            patch("app.services.recruitment_service_impl._screening_worker_active_task_ids", set()):
        payload = service._dispatch_screening_queue()

    assert payload["started_count"] == 1
    assert "ROOT_FILTER" in queued_query.filter.call_args.args
    service._start_background_ai_task.assert_called_once()


def test_prepare_json_request_context_uses_remaining_budget_as_effective_timeout():
    gateway = RecruitmentAIGateway(Mock())
    gateway.resolve_config = Mock(
        return_value=RecruitmentLLMRuntimeConfig(
            provider="glm",
            runtime_provider="openai-compatible",
            model_name="glm-5",
            base_url="https://example.test/v1",
            api_key="secret",
            source="test",
            api_key_masked="***",
            extra_config={"read_timeout_seconds": 300, "max_retries": 1},
        )
    )

    context = gateway.prepare_json_request_context(
        task_type="resume_parse",
        system_prompt="SYSTEM",
        user_prompt="USER",
        timeout_seconds_override=280,
        screening_total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
        remaining_budget_seconds=280,
    )

    assert context["provider"] == "glm"
    assert context["model_name"] == "glm-5"
    assert context["timeout_seconds"] == 280.0
    assert context["configured_read_timeout_seconds"] == 300.0
    assert context["effective_timeout_seconds"] == 280.0
    assert context["remaining_budget_seconds"] == 280
    assert context["is_stream_mode"] is False
    assert context["runtime_config"].extra_config["use_stream_json"] is False
    assert context["runtime_config"].extra_config["max_retries"] == 0
    assert '"stream": false' in context["full_request_snapshot"].lower()


def test_resume_score_uses_openai_non_stream_json_by_default():
    gateway = RecruitmentAIGateway(Mock())
    gateway.resolve_config = Mock(
        return_value=RecruitmentLLMRuntimeConfig(
            provider="glm",
            runtime_provider="openai-compatible",
            model_name="glm-5",
            base_url="https://example.test/v1",
            api_key="secret",
            source="test",
            api_key_masked="***",
            extra_config={"read_timeout_seconds": 300, "max_retries": 2, "use_stream_json": True},
        )
    )

    context = gateway.prepare_json_request_context(
        task_type="resume_score",
        system_prompt="SYSTEM",
        user_prompt="USER",
        timeout_seconds_override=280,
        screening_total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
        remaining_budget_seconds=280,
    )

    assert context["is_stream_mode"] is False
    assert context["runtime_config"].extra_config["use_stream_json"] is False
    assert context["runtime_config"].extra_config["max_retries"] == 0
    assert '"stream": false' in context["full_request_snapshot"].lower()


def test_prepare_json_request_context_raises_total_timeout_when_budget_too_low():
    gateway = RecruitmentAIGateway(Mock())
    gateway.resolve_config = Mock(
        return_value=RecruitmentLLMRuntimeConfig(
            provider="glm",
            runtime_provider="openai-compatible",
            model_name="glm-5",
            base_url="https://example.test/v1",
            api_key="secret",
            source="test",
            api_key_masked="***",
            extra_config={"read_timeout_seconds": 300, "max_retries": 1},
        )
    )

    try:
        gateway.prepare_json_request_context(
            task_type="resume_parse",
            system_prompt="SYSTEM",
            user_prompt="USER",
            timeout_seconds_override=15,
            screening_total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
            remaining_budget_seconds=15,
        )
        assert False, "expected screening total timeout"
    except RecruitmentAIScreeningTotalTimeoutError as exc:
        assert exc.total_timeout_seconds == SCREENING_TOTAL_TIMEOUT_SECONDS


def test_generate_json_skips_model_call_when_remaining_budget_below_stage_min_timeout():
    gateway = RecruitmentAIGateway(Mock())
    gateway.resolve_config = Mock(
        return_value=RecruitmentLLMRuntimeConfig(
            provider="glm",
            runtime_provider="openai-compatible",
            model_name="glm-5",
            base_url="https://example.test/v1",
            api_key="secret",
            source="test",
            api_key_masked="***",
            extra_config={"read_timeout_seconds": 300, "max_retries": 1},
        )
    )
    gateway._call_openai_compatible_json = Mock()

    try:
        gateway.generate_json(
            task_type="resume_parse",
            system_prompt="SYSTEM",
            user_prompt="USER",
            timeout_seconds_override=15,
            screening_total_timeout_seconds=SCREENING_TOTAL_TIMEOUT_SECONDS,
            remaining_budget_seconds=15,
        )
        assert False, "expected screening total timeout"
    except RecruitmentAIScreeningTotalTimeoutError:
        pass

    gateway._call_openai_compatible_json.assert_not_called()


def test_resume_parse_default_max_retries_is_zero_for_screening():
    gateway = RecruitmentAIGateway(Mock())
    gateway.resolve_config = Mock(
        return_value=RecruitmentLLMRuntimeConfig(
            provider="glm",
            runtime_provider="openai-compatible",
            model_name="glm-5",
            base_url="https://example.test/v1",
            api_key="secret",
            source="test",
            api_key_masked="***",
            extra_config={"read_timeout_seconds": 60},
        )
    )

    context = gateway.prepare_json_request_context(
        task_type="resume_parse",
        system_prompt="SYSTEM",
        user_prompt="USER",
    )

    assert context["retry_count"] == 0
    assert context["runtime_config"].extra_config["max_retries"] == 0
    assert context["runtime_config"].extra_config["use_stream_json"] is False


def test_resume_parse_uses_openai_non_stream_json_by_default():
    gateway = RecruitmentAIGateway(Mock())
    config = RecruitmentLLMRuntimeConfig(
        provider="glm",
        runtime_provider="openai-compatible",
        model_name="glm-5",
        base_url="https://example.test/v1",
        api_key="secret",
        source="test",
        api_key_masked="***",
        extra_config={"read_timeout_seconds": 45, "use_stream_json": False},
    )
    gateway._call_openai_compatible_json_non_stream = Mock(
        return_value={
            "content": {"basic_info": {"name": "李四"}},
            "token_usage": None,
            "raw_response_text": '{"basic_info":{"name":"李四"}}',
            "response_debug": {"is_stream_mode": False, "raw_response_text_length": 28},
        }
    )
    gateway._stream_openai_compatible_completion = Mock(side_effect=AssertionError("resume_parse should not use stream json by default"))

    payload = gateway._call_openai_compatible_json(
        config,
        "SYSTEM",
        "USER",
        task_type="resume_parse",
    )

    assert payload["response_debug"]["is_stream_mode"] is False
    gateway._call_openai_compatible_json_non_stream.assert_called_once()
    gateway._stream_openai_compatible_completion.assert_not_called()


def test_generate_json_records_first_attempt_failed_reason_after_retry():
    gateway = RecruitmentAIGateway(Mock())
    gateway.resolve_config = Mock(
        return_value=RecruitmentLLMRuntimeConfig(
            provider="glm",
            runtime_provider="openai-compatible",
            model_name="glm-5",
            base_url="https://example.test/v1",
            api_key="secret",
            source="test",
            api_key_masked="***",
            extra_config={"read_timeout_seconds": 45, "max_retries": 1, "use_stream_json": False},
        )
    )
    gateway._call_openai_compatible_json = Mock(
        side_effect=[
            httpx.ReadTimeout("timed out"),
            {
                "content": {"basic_info": {"name": "李四"}},
                "token_usage": None,
                "raw_response_text": '{"basic_info":{"name":"李四"}}',
                "response_debug": {"is_stream_mode": False, "raw_response_text_length": 28},
            },
        ]
    )

    payload = gateway.generate_json(
        task_type="chat_orchestrator",
        system_prompt="SYSTEM",
        user_prompt="USER",
    )

    assert payload["response_debug"]["first_attempt_failed_reason"] == "timeout"


def test_openai_non_stream_json_rejects_non_dict_payload():
    gateway = RecruitmentAIGateway(Mock())
    config = RecruitmentLLMRuntimeConfig(
        provider="glm",
        runtime_provider="openai-compatible",
        model_name="glm-5",
        base_url="https://example.test/v1",
        api_key="secret",
        source="test",
        api_key_masked="***",
        extra_config={"read_timeout_seconds": 45, "use_stream_json": False},
    )
    response = Mock()
    response.status_code = 200
    response.headers = {"content-type": "application/json"}
    response.raise_for_status = Mock()
    response.json = Mock(return_value=None)
    response.text = "null"
    client = Mock()
    client.post = Mock(return_value=response)
    client.close = Mock()
    gateway._build_httpx_client = Mock(return_value=client)

    try:
        gateway._call_openai_compatible_json_non_stream(config, "SYSTEM", "USER")
        assert False, "expected invalid provider payload"
    except RecruitmentAIJSONParseError as exc:
        assert exc.error_code == "invalid_provider_payload"


def test_parse_latest_resume_prelogs_request_snapshot_and_passes_cancel_control():
    db = Mock()
    db.add = Mock()
    db.commit = Mock()
    db.refresh = Mock()
    db.flush = Mock()
    db.rollback = Mock()
    service = RecruitmentService(db)
    candidate = SimpleNamespace(
        id=5,
        position_id=9,
        latest_resume_file_id=12,
        name="李四",
        phone=None,
        email=None,
        years_of_experience=None,
        education=None,
        updated_by=None,
    )
    resume_file = SimpleNamespace(
        id=12,
        storage_path="/tmp/demo.pdf",
        file_ext=".pdf",
        parse_status=None,
        parse_error=None,
    )
    log_row = SimpleNamespace(
        id=91,
        status="running",
        created_at=datetime.now(),
        stage_started_at=datetime.now(),
    )
    runtime_config = RecruitmentLLMRuntimeConfig(
        provider="glm",
        runtime_provider="openai-compatible",
        model_name="glm-5",
        base_url="https://example.test/v1",
        api_key="secret",
        source="test",
        api_key_masked="***",
        extra_config={"read_timeout_seconds": 90},
    )
    request_context = {
        "runtime_config": runtime_config,
        "provider": "glm",
        "model_name": "glm-5",
        "endpoint": "https://example.test/v1/chat/completions",
        "timeout_seconds": 90.0,
        "retry_count": 1,
        "is_stream_mode": False,
        "full_request_snapshot": {"body": {"model": "glm-5"}},
        "input_summary": "李四 BLE 测试",
        "prompt_snapshot": "SYSTEM:\nPARSE\n\nUSER:\n李四 BLE 测试",
    }
    sanitized_resume = {
        "basic_info": {"name": "李四"},
        "work_experiences": [],
        "education_experiences": [],
        "skills": ["BLE"],
        "projects": [],
        "summary": "具备 BLE 测试经验。",
    }
    service._get_resume_file = Mock(return_value=resume_file)
    service._build_request_hash = Mock(return_value="hash")
    service._create_ai_task_log = Mock(return_value=log_row)
    service._update_ai_task_log = Mock(return_value=log_row)
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 501})
    service._finish_ai_task_log = Mock(return_value=log_row)
    service.ai_gateway.prepare_json_request_context = Mock(return_value=request_context)
    service.ai_gateway.generate_json = Mock(
        return_value={
            "content": sanitized_resume,
            "provider": "glm",
            "model_name": "glm-5",
            "prompt_snapshot": request_context["prompt_snapshot"],
            "full_request_snapshot": request_context["full_request_snapshot"],
            "input_summary": request_context["input_summary"],
            "token_usage": None,
            "raw_response_text": '{"basic_info":{"name":"李四"}}',
            "response_debug": {"status_code": 200, "stream_raw_line_count": 4, "raw_response_text_length": 24},
            "warnings": [],
        }
    )
    cancel_control = object()

    with patch("app.services.recruitment_service_impl.extract_resume_text", return_value="李四\nBLE 测试"), \
            patch("app.services.recruitment_service_impl._sanitize_ai_parsed_resume_with_meta", return_value=(sanitized_resume, [])):
        service._parse_latest_resume(candidate, "tester", cancel_control=cancel_control)

    pre_request_kwargs = service._update_ai_task_log.call_args_list[0].kwargs
    assert pre_request_kwargs["provider"] == "glm"
    assert pre_request_kwargs["model_name"] == "glm-5"
    assert pre_request_kwargs["full_request_snapshot"] == {"body": {"model": "glm-5"}}
    assert pre_request_kwargs["input_summary"] == "李四 BLE 测试"
    assert pre_request_kwargs["output_snapshot"]["timeout_seconds"] == 90.0
    assert pre_request_kwargs["output_snapshot"]["retry_count"] == 1
    assert pre_request_kwargs["output_snapshot"]["is_stream_mode"] is False
    assert pre_request_kwargs["output_snapshot"]["endpoint"] == "https://example.test/v1/chat/completions"
    assert pre_request_kwargs["output_snapshot"]["raw_text_chars"] == len("李四\nBLE 测试")
    service.ai_gateway.generate_json.assert_called_once()
    assert service.ai_gateway.generate_json.call_args.kwargs["cancel_control"] is cancel_control
    assert service.ai_gateway.generate_json.call_args.kwargs["runtime_config"] is runtime_config


def test_parse_latest_resume_failure_does_not_crash_when_task_is_none():
    db = Mock()
    db.add = Mock()
    db.commit = Mock()
    db.refresh = Mock()
    db.flush = Mock()
    db.rollback = Mock()
    service = RecruitmentService(db)
    candidate = SimpleNamespace(
        id=5,
        position_id=9,
        latest_resume_file_id=12,
        name="李四",
        phone=None,
        email=None,
        years_of_experience=None,
        education=None,
        updated_by=None,
    )
    resume_file = SimpleNamespace(
        id=12,
        storage_path="/tmp/demo.pdf",
        file_ext=".pdf",
        parse_status=None,
        parse_error=None,
    )
    log_row = SimpleNamespace(
        id=91,
        status="running",
        created_at=datetime.now(),
        stage_started_at=datetime.now(),
    )
    runtime_config = RecruitmentLLMRuntimeConfig(
        provider="glm",
        runtime_provider="openai-compatible",
        model_name="glm-5",
        base_url="https://example.test/v1",
        api_key="secret",
        source="test",
        api_key_masked="***",
        extra_config={"read_timeout_seconds": 45, "use_stream_json": False},
    )
    request_context = {
        "runtime_config": runtime_config,
        "provider": "glm",
        "model_name": "glm-5",
        "endpoint": "https://example.test/v1/chat/completions",
        "timeout_seconds": 45.0,
        "retry_count": 1,
        "is_stream_mode": False,
        "full_request_snapshot": {"body": {"model": "glm-5", "stream": False}},
        "input_summary": "李四 BLE 测试",
        "prompt_snapshot": "SYSTEM:\nPARSE\n\nUSER:\n李四 BLE 测试",
    }
    service._get_resume_file = Mock(return_value=resume_file)
    service._build_request_hash = Mock(return_value="hash")
    service._create_ai_task_log = Mock(return_value=log_row)
    service._update_ai_task_log = Mock(return_value=log_row)
    service._finish_ai_task_log = Mock(return_value=log_row)
    service._build_screening_persisted_result_refs = Mock(return_value={})
    service.ai_gateway.prepare_json_request_context = Mock(return_value=request_context)
    service.ai_gateway.generate_json = Mock(side_effect=httpx.ReadTimeout("timed out"))

    with patch("app.services.recruitment_service_impl.extract_resume_text", return_value="李四\nBLE 测试"):
        try:
            service._parse_latest_resume(candidate, "tester")
            assert False, "expected timeout failure"
        except httpx.ReadTimeout as exc:
            assert "NoneType" not in str(exc)

    service._finish_ai_task_log.assert_called_once()
    kwargs = service._finish_ai_task_log.call_args.kwargs
    assert kwargs["status"] == "upstream_timeout"
    assert "timed out" in (kwargs["output_summary"] or "")
    assert kwargs["error_message"] == kwargs["output_summary"]
    assert kwargs["validation_meta"]["screening_result_valid"] is False
    assert kwargs["provider"] == "glm"
    assert kwargs["model_name"] == "glm-5"
    assert kwargs["full_request_snapshot"] == {"body": {"model": "glm-5", "stream": False}}


def test_extract_json_parse_failure_meta_marks_empty_parse_response():
    meta = _extract_json_parse_failure_meta(
        RecruitmentAIJSONParseError(
            "AI screening JSON 解析失败: 模型返回了空响应内容",
            raw_response_text="",
            error_code="empty_response",
            debug_meta={"status_code": 200, "stream_raw_line_count": 7},
        ),
        default_source="parse_request_failed",
    )

    assert meta["final_response_source"] == "parse_empty_response"
    assert meta["screening_result_state"] == "empty_response"
    assert meta["failure_code"] == "empty_response"
    assert meta["debug_meta"]["stream_raw_line_count"] == 7


def test_screen_candidate_reranks_from_existing_parse_when_mode_explicit():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None, status="screening_passed", match_percent=80, ai_recommended_status="screening_passed")
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success", raw_text="候选人简历")
    score_row = SimpleNamespace(id=41)
    score_log = SimpleNamespace(
        id=92,
        validation_meta_json='{"screening_result_valid":true,"screening_result_state":"success","parse_strategy":"rerank_from_existing_parse","reused_existing_parse":true,"final_response_source":"primary_score_model","primary_model_call_succeeded":true}',
        output_summary="初筛评分完成",
        error_message=None,
        status="success",
    )
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary="初筛完成",
        timing_breakdown_json='{"parse_duration_ms":0,"score_duration_ms":120,"save_duration_ms":30}',
        output_snapshot=None,
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=True)
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash"})
    service._load_reusable_screening_result = Mock(return_value=None)
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=parse_row)
    service._parse_latest_resume = Mock(return_value=parse_row)
    service._score_candidate = Mock(return_value=score_row)
    service._get_latest_screening_run_task = Mock(side_effect=lambda screening_run_id, **kwargs: score_log if kwargs.get("task_type") == "resume_score" else None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 1000})
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 31, "score_result_id": 41})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._screen_candidate_with_single_ai_call = Mock(side_effect=AssertionError("should not call one-pass"))
    service._save_screening_workflow_memory = Mock()
    service._serialize_parse_result = Mock(return_value={"basic_info": {}, "work_experiences": [], "education_experiences": [], "skills": [], "projects": [], "summary": ""})
    service._serialize_score = Mock(return_value={"score_result_id": 41})
    service.get_candidate_detail = Mock(return_value={"candidate": {"id": 5}})

    payload = service.screen_candidate(5, "tester", screening_mode="rerank_from_existing_parse")

    assert payload == {"candidate": {"id": 5}}
    service._parse_latest_resume.assert_not_called()
    service._score_candidate.assert_called_once()
    assert service._score_candidate.call_args.kwargs.get("task_log_row") is None
    assert service._score_candidate.call_args.kwargs["parent_task_id"] == root_log.id
    assert service._score_candidate.call_args.kwargs["root_task_id"] == root_log.id
    assert service._score_candidate.call_args.kwargs["reused_existing_parse"] is True
    assert service._score_candidate.call_args.kwargs["deadline_at"] is not None
    service._screen_candidate_with_single_ai_call.assert_not_called()


def test_screen_candidate_uses_one_pass_as_default_path_when_parse_missing():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None)
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success")
    score_row = SimpleNamespace(id=41)
    score_log = SimpleNamespace(
        id=92,
        validation_meta_json='{"screening_result_valid":true,"screening_result_state":"success","parse_strategy":"combined_parse_and_score","reused_existing_parse":false,"final_response_source":"primary_screening_model","primary_model_call_succeeded":true}',
        output_summary="初筛评分完成",
        error_message=None,
        status="success",
    )
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary="初筛完成",
        timing_breakdown_json='{"parse_duration_ms":180,"score_duration_ms":120,"save_duration_ms":30}',
        output_snapshot=None,
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=False)
    service._get_resume_file = Mock(return_value=SimpleNamespace(id=12))
    service._extract_resume_file_raw_text = Mock(return_value="候选人简历")
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash"})
    service._load_reusable_screening_result = Mock(return_value=None)
    service._get_latest_valid_screening_result_for_candidate = Mock(return_value=None)
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=None)
    service._parse_latest_resume = Mock(return_value=parse_row)
    service._score_candidate = Mock(return_value=score_row)
    service._screen_candidate_with_single_ai_call = Mock(return_value=(parse_row, score_row))
    service._get_latest_screening_run_task = Mock(side_effect=lambda screening_run_id, **kwargs: score_log if kwargs.get("task_type") == "resume_score" else None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 1200})
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 31, "score_result_id": 41})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._save_screening_workflow_memory = Mock()
    service._serialize_parse_result = Mock(return_value={"basic_info": {}, "work_experiences": [], "education_experiences": [], "skills": [], "projects": [], "summary": ""})
    service._serialize_score = Mock(return_value={"score_result_id": 41})
    service.get_candidate_detail = Mock(return_value={"candidate": {"id": 5}})

    cancel_control = object()
    payload = service.screen_candidate(5, "tester", cancel_control=cancel_control)

    assert payload == {"candidate": {"id": 5}}
    service._parse_latest_resume.assert_not_called()
    service._score_candidate.assert_not_called()
    service._screen_candidate_with_single_ai_call.assert_called_once()
    assert service._screen_candidate_with_single_ai_call.call_args.kwargs["parent_task_id"] == root_log.id
    assert service._screen_candidate_with_single_ai_call.call_args.kwargs["root_task_id"] == root_log.id
    assert service._screen_candidate_with_single_ai_call.call_args.kwargs["cancel_control"] is cancel_control
    assert service._screen_candidate_with_single_ai_call.call_args.kwargs["deadline_at"] is not None


def test_screen_candidate_reuses_cached_result_without_model_call():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(
        id=5,
        position_id=9,
        latest_resume_file_id=12,
        latest_parse_result_id=None,
        latest_score_id=None,
        status="pending_screening",
        match_percent=None,
        ai_recommended_status=None,
        updated_by=None,
    )
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success", raw_text="候选人简历")
    score_row = SimpleNamespace(id=41, match_percent=86, suggested_status="screening_passed")
    cached_root_log = SimpleNamespace(id=77, screening_run_id="run-cached")
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary="初筛完成",
        timing_breakdown_json="{}",
        output_snapshot=None,
        batch_id=None,
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=True)
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._get_current_parse_result = Mock(return_value=parse_row)
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash-1"})
    service._load_reusable_screening_result = Mock(return_value={
        "root_log": cached_root_log,
        "parse_row": parse_row,
        "score_row": score_row,
        "validation_meta": {
            "screening_result_valid": True,
            "screening_result_state": "success",
            "final_response_source": "reused_existing_result",
            "primary_model_call_succeeded": True,
            "raw_model_suggested_status": "screening_passed",
            "normalized_final_suggested_status": "screening_passed",
        },
    })
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_latest_screening_run_task = Mock(return_value=None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 10})
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 31, "score_result_id": 41})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._save_screening_workflow_memory = Mock()
    service._auto_advance_candidate_after_screening = Mock()
    service._screen_candidate_with_single_ai_call = Mock(side_effect=AssertionError("should not call model"))
    service._score_candidate = Mock(side_effect=AssertionError("should not call score-only"))
    service._serialize_parse_result = Mock(return_value={"basic_info": {}, "work_experiences": [], "education_experiences": [], "skills": [], "projects": [], "summary": ""})
    service._serialize_score = Mock(return_value={"score_result_id": 41})
    service.get_candidate_detail = Mock(return_value={"candidate": {"id": 5}})

    payload = service.screen_candidate(5, "tester")

    assert payload == {"candidate": {"id": 5}}
    assert candidate.latest_parse_result_id == 31
    assert candidate.latest_score_id == 41
    service._screen_candidate_with_single_ai_call.assert_not_called()
    service._score_candidate.assert_not_called()


def test_invalid_one_pass_result_does_not_trigger_second_model_repair():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None, status="pending_screening", match_percent=None, ai_recommended_status=None)
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success")
    score_row = SimpleNamespace(id=41)
    score_log = SimpleNamespace(
        id=92,
        validation_meta_json='{"screening_result_valid":false,"screening_result_state":"invalid","parse_strategy":"combined_parse_and_score","invalid_result_reasons":["total_score mismatch"],"final_response_source":"primary_screening_model_invalid","primary_model_call_succeeded":true}',
        output_summary="AI 返回了无效初筛结果",
        error_message="AI 返回了无效初筛结果",
        status="invalid_result",
        output_snapshot=None,
    )
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary="初筛进行中",
        timing_breakdown_json="{}",
        output_snapshot=None,
        batch_id=None,
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=False)
    service._get_resume_file = Mock(return_value=SimpleNamespace(id=12))
    service._extract_resume_file_raw_text = Mock(return_value="候选人简历")
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash"})
    service._load_reusable_screening_result = Mock(return_value=None)
    service._get_latest_valid_screening_result_for_candidate = Mock(return_value=None)
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=None)
    service._screen_candidate_with_single_ai_call = Mock(return_value=(parse_row, score_row))
    service._score_candidate = Mock(side_effect=AssertionError("should not do score-only repair"))
    service._get_latest_screening_run_task = Mock(side_effect=lambda screening_run_id, **kwargs: score_log if kwargs.get("task_type") == "resume_score" else None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 1200})
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 31, "score_result_id": 41})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._save_screening_workflow_memory = Mock()
    service._serialize_parse_result = Mock(return_value={"basic_info": {}, "work_experiences": [], "education_experiences": [], "skills": [], "projects": [], "summary": ""})
    service._serialize_score = Mock(return_value={"score_result_id": 41})
    service.get_candidate_detail = Mock(return_value={"candidate": {"id": 5}})

    payload = service.screen_candidate(5, "tester")

    assert payload == {"candidate": {"id": 5}}
    service._score_candidate.assert_not_called()
    assert service._finish_ai_task_log.call_args.kwargs["status"] == "invalid_result"


def test_fallback_parse_then_score_does_not_bind_parse_or_score_directly_to_root_log():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None)
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success")
    score_row = SimpleNamespace(id=41)
    score_log = SimpleNamespace(
        id=92,
        validation_meta_json='{"screening_result_valid":true,"screening_result_state":"success"}',
        output_summary="初筛评分完成",
        error_message=None,
        status="success",
    )
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary="初筛完成",
        timing_breakdown_json='{"parse_duration_ms":180,"score_duration_ms":120}',
        output_snapshot=None,
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=False)
    service._get_resume_file = Mock(return_value=SimpleNamespace(id=12))
    service._extract_resume_file_raw_text = Mock(return_value="候选人简历")
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash"})
    service._load_reusable_screening_result = Mock(return_value=None)
    service._get_latest_valid_screening_result_for_candidate = Mock(return_value=None)
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=None)
    service._parse_latest_resume = Mock(return_value=parse_row)
    service._score_candidate = Mock(return_value=score_row)
    service._get_latest_screening_run_task = Mock(side_effect=lambda screening_run_id, **kwargs: score_log if kwargs.get("task_type") == "resume_score" else None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 1200})
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 31, "score_result_id": 41})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._save_screening_workflow_memory = Mock()
    service._serialize_parse_result = Mock(return_value={"basic_info": {}, "work_experiences": [], "education_experiences": [], "skills": [], "projects": [], "summary": ""})
    service._serialize_score = Mock(return_value={"score_result_id": 41})
    service.get_candidate_detail = Mock(return_value={"candidate": {"id": 5}})

    service.screen_candidate(5, "tester", force_one_pass=False)

    assert service._parse_latest_resume.call_args.kwargs["parent_task_id"] == root_log.id
    assert service._parse_latest_resume.call_args.kwargs["root_task_id"] == root_log.id
    assert service._parse_latest_resume.call_args.kwargs.get("task_log_row") is None
    assert service._score_candidate.call_args.kwargs["parent_task_id"] == root_log.id
    assert service._score_candidate.call_args.kwargs["root_task_id"] == root_log.id
    assert service._score_candidate.call_args.kwargs.get("task_log_row") is None


def test_finish_root_task_called_when_parse_raises():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None)
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary=None,
        timing_breakdown_json="{}",
        output_snapshot=None,
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=False)
    service._get_resume_file = Mock(return_value=SimpleNamespace(id=12))
    service._extract_resume_file_raw_text = Mock(return_value="候选人简历")
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash"})
    service._load_reusable_screening_result = Mock(return_value=None)
    service._get_latest_valid_screening_result_for_candidate = Mock(return_value=None)
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=None)
    service._parse_latest_resume = Mock(side_effect=RuntimeError("parse exploded"))
    service._score_candidate = Mock()
    service._get_latest_screening_run_task = Mock(return_value=None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 120})
    service._build_screening_persisted_result_refs = Mock(return_value={})
    service._finish_ai_task_log = Mock(return_value=root_log)

    try:
        service.screen_candidate(5, "tester", force_one_pass=False)
        assert False, "screen_candidate should raise parse failure"
    except RuntimeError as exc:
        assert str(exc) == "parse exploded"

    kwargs = service._finish_ai_task_log.call_args.kwargs
    assert kwargs["status"] == "failed"
    assert kwargs["stage"] == "failed"


def test_root_failure_inherits_parse_child_request_context():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None)
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary=None,
        timing_breakdown_json="{}",
        output_snapshot=None,
    )
    parse_log = SimpleNamespace(
        id=101,
        validation_meta_json='{"screening_result_valid":false,"screening_result_state":"empty_response","final_response_source":"parse_empty_response","primary_model_call_succeeded":false,"failure_code":"empty_response","invalid_result_reasons":["AI screening JSON 解析失败: 模型返回了空响应内容"]}',
        output_summary="AI screening JSON 解析失败: 模型返回了空响应内容",
        error_message="AI screening JSON 解析失败: 模型返回了空响应内容",
        status="json_parse_failed",
        model_provider="GLM",
        model_name="glm-5",
        prompt_snapshot="SYSTEM:\nparse",
        full_request_snapshot='{"model":"glm-5"}',
        input_summary="李四 BLE 测试",
        raw_response_text="",
        parsed_response_json=None,
        sanitized_response_json=None,
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=False)
    service._get_resume_file = Mock(return_value=SimpleNamespace(id=12))
    service._extract_resume_file_raw_text = Mock(return_value="候选人简历")
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash"})
    service._load_reusable_screening_result = Mock(return_value=None)
    service._get_latest_valid_screening_result_for_candidate = Mock(return_value=None)
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=None)
    service._parse_latest_resume = Mock(
        side_effect=RecruitmentAIJSONParseError(
            "AI screening JSON 解析失败: 模型返回了空响应内容",
            raw_response_text="",
            error_code="empty_response",
        )
    )
    service._score_candidate = Mock()
    service._get_latest_screening_run_task = Mock(side_effect=lambda screening_run_id, **kwargs: parse_log if kwargs.get("task_type") == "resume_parse" else None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"parse_duration_ms": 1200, "total_duration_ms": 1200})
    service._build_screening_persisted_result_refs = Mock(return_value={})
    service._finish_ai_task_log = Mock(return_value=root_log)

    try:
        service.screen_candidate(5, "tester", force_one_pass=False)
        assert False, "screen_candidate should raise parse failure"
    except RecruitmentAIJSONParseError as exc:
        assert getattr(exc, "error_code", None) == "empty_response"

    kwargs = service._finish_ai_task_log.call_args.kwargs
    assert kwargs["status"] == "json_parse_failed"
    assert kwargs["provider"] == "GLM"
    assert kwargs["model_name"] == "glm-5"
    assert kwargs["full_request_snapshot"] == '{"model":"glm-5"}'
    assert kwargs["input_summary"] == "李四 BLE 测试"
    assert kwargs["raw_response_text"] == ""
    assert kwargs["validation_meta"]["failure_code"] == "empty_response"


def test_finish_root_task_called_when_score_raises():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None)
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success")
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary=None,
        timing_breakdown_json="{}",
        output_snapshot=None,
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=True)
    service._get_resume_file = Mock(return_value=SimpleNamespace(id=12))
    service._extract_resume_file_raw_text = Mock(return_value="候选人简历")
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash"})
    service._load_reusable_screening_result = Mock(return_value=None)
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=parse_row)
    service._parse_latest_resume = Mock()
    service._score_candidate = Mock(side_effect=RuntimeError("score exploded"))
    service._get_latest_screening_run_task = Mock(return_value=None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 120})
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 31})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._serialize_parse_result = Mock(return_value={"basic_info": {}, "work_experiences": [], "education_experiences": [], "skills": [], "projects": [], "summary": ""})

    try:
        service.screen_candidate(5, "tester", force_one_pass=False)
        assert False, "screen_candidate should raise score failure"
    except RuntimeError as exc:
        assert str(exc) == "score exploded"

    kwargs = service._finish_ai_task_log.call_args.kwargs
    assert kwargs["status"] == "failed"
    assert kwargs["stage"] == "failed"


def test_settle_orphaned_screening_flow_marks_stale_running_root_failed():
    service = RecruitmentService(Mock())
    root_log = SimpleNamespace(
        id=91,
        task_type=SCREENING_FLOW_TASK_TYPE,
        parent_task_id=None,
        root_task_id=91,
        screening_run_id="run-91",
        related_candidate_id=5,
        status="running",
        stage="parsing",
        stage_started_at=datetime.now() - timedelta(minutes=15),
        stage_completed_at=None,
        created_at=datetime.now() - timedelta(minutes=15),
        updated_at=datetime.now() - timedelta(minutes=15),
        output_snapshot='{"parse_status":"running"}',
        validation_meta_json=None,
        timing_breakdown_json="{}",
        error_message=None,
        output_summary="正在解析最新简历",
    )
    candidate = SimpleNamespace(id=5, deleted=False, latest_parse_result_id=None, latest_score_id=None)
    candidate_query = Mock()
    candidate_query.filter.return_value = candidate_query
    candidate_query.first.return_value = candidate
    service.db.query = Mock(return_value=candidate_query)
    service._settle_orphaned_cancelling_task = Mock(return_value=False)
    service._get_latest_screening_run_task = Mock(return_value=None)
    service._is_orphaned_live_task = Mock(return_value=True)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 999})
    service._build_screening_persisted_result_refs = Mock(return_value={})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._mark_candidate_screening_failed_if_needed = Mock()

    settled = service._settle_orphaned_live_task(root_log)

    assert settled is True
    kwargs = service._finish_ai_task_log.call_args.kwargs
    assert kwargs["status"] == "failed"
    assert kwargs["stage"] == "failed"
    assert "长时间未完成" in kwargs["output_summary"]


def test_rate_limited_parse_task_is_requeued_not_failed():
    service = RecruitmentService(Mock())
    db = Mock()
    db.rollback = Mock()
    db.close = Mock()
    db.add = Mock()
    db.commit = Mock()
    db.refresh = Mock()
    log_row = SimpleNamespace(
        id=91,
        status="running",
        stage="parsing",
        related_candidate_id=5,
        validation_meta_json=None,
        output_snapshot=None,
        created_by="tester",
        stage_started_at=datetime.now() - timedelta(seconds=5),
        created_at=datetime.now() - timedelta(seconds=5),
    )
    candidate = SimpleNamespace(id=5, status="pending_screening")
    exc = _build_http_status_error(429, '{"message":"rate limit exceeded"}')

    with patch("app.services.recruitment_service_impl.SessionLocal", return_value=db), \
            patch.object(RecruitmentService, "_run_queued_screening_task", side_effect=exc), \
            patch.object(RecruitmentService, "_get_ai_task_log_row", return_value=log_row), \
            patch.object(RecruitmentService, "_get_candidate", return_value=candidate), \
            patch.object(RecruitmentService, "_dispatch_screening_queue", return_value={"started_count": 0, "active_count": 0, "max_concurrency": 1}), \
            patch.object(RecruitmentService, "_mark_candidate_screening_failed_if_needed") as mark_failed, \
            patch.object(RecruitmentService, "_finish_ai_task_log") as finish_task:
        service._build_screening_queue_runner(91, "tester")(object())

    validation_meta = json.loads(log_row.validation_meta_json)
    output_snapshot = json.loads(log_row.output_snapshot)
    assert log_row.status == "queued"
    assert log_row.stage == "queued"
    assert log_row.output_summary == "上游限流，稍后自动重试"
    assert validation_meta["failure_code"] == "rate_limited"
    assert validation_meta["auto_requeue_scheduled"] is True
    assert validation_meta["infra_retry_count"] == 1
    assert validation_meta["next_retry_at"]
    assert output_snapshot["next_retry_at"]
    assert candidate.status == "pending_screening"
    mark_failed.assert_not_called()
    finish_task.assert_not_called()


def test_timeout_parse_task_is_requeued_not_failed():
    service = RecruitmentService(Mock())
    db = Mock()
    db.rollback = Mock()
    db.close = Mock()
    db.add = Mock()
    db.commit = Mock()
    db.refresh = Mock()
    log_row = SimpleNamespace(
        id=92,
        status="running",
        stage="parsing",
        related_candidate_id=5,
        validation_meta_json=None,
        output_snapshot=None,
        created_by="tester",
        stage_started_at=datetime.now() - timedelta(seconds=5),
        created_at=datetime.now() - timedelta(seconds=5),
    )
    candidate = SimpleNamespace(id=5, status="pending_screening")

    with patch("app.services.recruitment_service_impl.SessionLocal", return_value=db), \
            patch.object(RecruitmentService, "_run_queued_screening_task", side_effect=httpx.ReadTimeout("timed out")), \
            patch.object(RecruitmentService, "_get_ai_task_log_row", return_value=log_row), \
            patch.object(RecruitmentService, "_get_candidate", return_value=candidate), \
            patch.object(RecruitmentService, "_dispatch_screening_queue", return_value={"started_count": 0, "active_count": 0, "max_concurrency": 1}), \
            patch.object(RecruitmentService, "_mark_candidate_screening_failed_if_needed") as mark_failed, \
            patch.object(RecruitmentService, "_finish_ai_task_log") as finish_task:
        service._build_screening_queue_runner(92, "tester")(object())

    validation_meta = json.loads(log_row.validation_meta_json)
    output_snapshot = json.loads(log_row.output_snapshot)
    assert log_row.status == "queued"
    assert log_row.stage == "queued"
    assert log_row.output_summary == "上游超时，稍后自动重试"
    assert validation_meta["failure_code"] == "upstream_timeout"
    assert validation_meta["auto_requeue_scheduled"] is True
    assert validation_meta["infra_retry_count"] == 1
    assert validation_meta["next_retry_at"]
    assert output_snapshot["next_retry_at"]
    assert candidate.status == "pending_screening"
    mark_failed.assert_not_called()
    finish_task.assert_not_called()


def test_screen_candidate_marks_total_timeout_when_remaining_budget_is_exhausted_before_score():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(
        id=5,
        position_id=9,
        latest_resume_file_id=12,
        updated_by=None,
        status="pending_screening",
        match_percent=None,
        ai_recommended_status=None,
    )
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success", raw_text="候选人简历")
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary="初筛进行中",
        timing_breakdown_json="{}",
        output_snapshot=json.dumps({
            "screening_started_at": (datetime.now() - timedelta(seconds=260)).isoformat(),
            "screening_deadline_at": (datetime.now() + timedelta(seconds=15)).isoformat(),
        }),
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=True)
    service._get_resume_file = Mock(return_value=SimpleNamespace(id=12))
    service._extract_resume_file_raw_text = Mock(return_value="候选人简历")
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash"})
    service._load_reusable_screening_result = Mock(return_value=None)
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=parse_row)
    service._score_candidate = Mock(side_effect=AssertionError("score should not start"))
    service._get_latest_screening_run_task = Mock(return_value=None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 300000})
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 31})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._serialize_parse_result = Mock(return_value={"basic_info": {}, "work_experiences": [], "education_experiences": [], "skills": [], "projects": [], "summary": ""})

    try:
        service.screen_candidate(5, "tester", force_one_pass=False)
        assert False, "expected total timeout"
    except RecruitmentAIScreeningTotalTimeoutError as exc:
        assert exc.total_timeout_seconds == SCREENING_TOTAL_TIMEOUT_SECONDS

    kwargs = service._finish_ai_task_log.call_args.kwargs
    assert kwargs["status"] == "screening_total_timeout"
    assert kwargs["stage"] == "failed"
    assert "300 秒" in kwargs["output_summary"]
    assert kwargs["validation_meta"]["failure_code"] == "screening_total_timeout"
    service._score_candidate.assert_not_called()


def test_dispatch_screening_queue_skips_tasks_before_next_retry_at():
    service = RecruitmentService(Mock())
    stale_query = Mock()
    stale_query.filter.return_value = stale_query
    stale_query.order_by.return_value = stale_query
    stale_query.all.return_value = []
    queued_query = Mock()
    queued_query.filter.return_value = queued_query
    queued_query.order_by.return_value = queued_query
    queued_query.limit.return_value = queued_query
    queued_query.all.return_value = [
        SimpleNamespace(
            id=301,
            created_by="tester",
            output_snapshot=json.dumps({"next_retry_at": (datetime.now() + timedelta(minutes=5)).isoformat()}),
        ),
        SimpleNamespace(
            id=302,
            created_by="tester",
            output_snapshot=json.dumps({"next_retry_at": (datetime.now() - timedelta(seconds=5)).isoformat()}),
        ),
    ]
    dispatch_db = Mock()
    dispatch_db.query = Mock(side_effect=[stale_query, queued_query])
    service._start_background_ai_task = Mock()
    service._build_screening_queue_runner = Mock(return_value=Mock())

    with patch("app.services.recruitment_service_impl.SessionLocal", return_value=dispatch_db), \
            patch("app.services.recruitment_service_impl._screening_provider_cooldown_until", None), \
            patch("app.services.recruitment_service_impl._screening_worker_active_task_ids", set()):
        payload = service._dispatch_screening_queue()

    assert payload["started_count"] == 1
    assert payload["max_concurrency"] == 1
    assert service._start_background_ai_task.call_args.args[0] == 302


def test_dispatch_screening_queue_respects_provider_cooldown_after_rate_limit():
    service = RecruitmentService(Mock())
    service._start_background_ai_task = Mock()

    with patch("app.services.recruitment_service_impl._screening_provider_cooldown_until", datetime.now() + timedelta(seconds=30)), \
            patch("app.services.recruitment_service_impl._screening_worker_active_task_ids", set()):
        payload = service._dispatch_screening_queue()

    assert payload["started_count"] == 0
    assert payload["max_concurrency"] == SCREENING_WORKER_MAX_CONCURRENCY
    service._start_background_ai_task.assert_not_called()


def test_batch_screening_queue_respects_single_concurrency():
    service = RecruitmentService(Mock())
    stale_query = Mock()
    stale_query.filter.return_value = stale_query
    stale_query.order_by.return_value = stale_query
    stale_query.all.return_value = []
    queued_query = Mock()
    queued_query.filter.return_value = queued_query
    queued_query.order_by.return_value = queued_query
    queued_query.limit.return_value = queued_query
    queued_query.all.return_value = [
        SimpleNamespace(id=401 + idx, created_by="tester", output_snapshot=None)
        for idx in range(5)
    ]
    dispatch_db = Mock()
    dispatch_db.query = Mock(side_effect=[stale_query, queued_query])
    service._start_background_ai_task = Mock()
    service._build_screening_queue_runner = Mock(return_value=Mock())

    with patch("app.services.recruitment_service_impl.SessionLocal", return_value=dispatch_db), \
            patch("app.services.recruitment_service_impl._screening_provider_cooldown_until", None), \
            patch("app.services.recruitment_service_impl._screening_worker_active_task_ids", set()):
        payload = service._dispatch_screening_queue()

    assert payload["started_count"] == 1
    assert payload["active_count"] == 1
    assert payload["max_concurrency"] == 1
    service._start_background_ai_task.assert_called_once()


def test_infra_failure_does_not_mark_candidate_screening_failed():
    service = RecruitmentService(Mock())
    db = Mock()
    db.rollback = Mock()
    db.close = Mock()
    db.add = Mock()
    db.commit = Mock()
    db.refresh = Mock()
    log_row = SimpleNamespace(
        id=93,
        status="running",
        stage="scoring",
        related_candidate_id=5,
        validation_meta_json=None,
        output_snapshot=None,
        created_by="tester",
        stage_started_at=datetime.now() - timedelta(seconds=5),
        created_at=datetime.now() - timedelta(seconds=5),
    )

    with patch("app.services.recruitment_service_impl.SessionLocal", return_value=db), \
            patch.object(RecruitmentService, "_run_queued_screening_task", side_effect=httpx.ReadTimeout("timed out")), \
            patch.object(RecruitmentService, "_get_ai_task_log_row", return_value=log_row), \
            patch.object(RecruitmentService, "_dispatch_screening_queue", return_value={"started_count": 0, "active_count": 0, "max_concurrency": 1}), \
            patch.object(RecruitmentService, "_mark_candidate_screening_failed_if_needed") as mark_failed:
        service._build_screening_queue_runner(93, "tester")(object())

    mark_failed.assert_not_called()
    assert log_row.status == "queued"


def test_run_queued_screening_task_defaults_to_one_pass_path():
    service = RecruitmentService(Mock())
    log_row = SimpleNamespace(
        id=91,
        status="queued",
        related_candidate_id=5,
        related_skill_snapshots_json="[]",
        memory_source="task_snapshot",
        output_snapshot='{"screening_mode":"default","allow_reuse_parse":true,"allow_score_only_rerun":true}',
    )
    service._get_ai_task_log_row = Mock(return_value=log_row)
    service.screen_candidate = Mock(return_value={"candidate": {"id": 5}})

    cancel_control = object()
    payload = service._run_queued_screening_task(91, "tester", cancel_control=cancel_control)

    assert payload == {"candidate": {"id": 5}}
    service.screen_candidate.assert_called_once()
    assert service.screen_candidate.call_args.kwargs["force_one_pass"] is True
    assert service.screen_candidate.call_args.kwargs["screening_mode"] == "default"
    assert service.screen_candidate.call_args.kwargs["cancel_control"] is cancel_control


def test_score_candidate_retries_once_when_score_json_variant_conflict_detected():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(
        id=5,
        position_id=9,
        latest_resume_file_id=11,
        status="pending_screening",
        match_percent=None,
        ai_recommended_status=None,
    )
    parse_row = SimpleNamespace(id=31, resume_file_id=11, raw_text="候选人简历")
    log_row = SimpleNamespace(id=91, timing_breakdown_json="{}", stage="scoring", status="running")
    score_row = SimpleNamespace(id=41)

    service._serialize_parse_result = Mock(
        return_value={
            "basic_info": {"name": "候选人A", "years_of_experience": "6年", "education": "本科"},
            "work_experiences": [],
            "education_experiences": [],
            "skills": [],
            "projects": [],
            "summary": "",
            "raw_text": "候选人简历",
        }
    )
    service._get_rule_config = Mock(return_value={})
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_score_resume_helper_payload = Mock(
        return_value=(
            {
                "basic_info": {"name": "候选人A", "years_of_experience": "6年", "education": "本科"},
                "work_experiences": [],
                "education_experiences": [],
                "skills": [],
                "projects": [],
                "summary": "",
            },
            [],
        )
    )
    service._build_resume_score_prompt = Mock(return_value="PROMPT")
    service._update_ai_task_log = Mock(return_value=log_row)
    service._save_score_result = Mock(return_value=score_row)
    service._maybe_send_auto_resume_mail_after_screening = Mock()
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 31, "score_result_id": 41})

    request_context = {
        "provider": "glm",
        "model_name": "glm-5",
        "runtime_config": Mock(),
        "endpoint": "https://example.test/v1/chat/completions",
        "timeout_seconds": 300,
        "configured_read_timeout_seconds": 300,
        "effective_timeout_seconds": 300,
        "screening_total_timeout_seconds": 300,
        "remaining_budget_seconds": 300,
        "retry_count": 0,
        "is_stream_mode": False,
        "prompt_snapshot": "SYSTEM\\nUSER",
        "full_request_snapshot": "{\"stream\": false}",
        "input_summary": "PROMPT",
    }
    service.ai_gateway.prepare_json_request_context = Mock(return_value=dict(request_context))
    service.ai_gateway.generate_json = Mock(
        side_effect=[
            {
                "provider": "glm",
                "model_name": "glm-5",
                "prompt_snapshot": "SYSTEM\\nUSER",
                "full_request_snapshot": "{\"stream\": false}",
                "input_summary": "PROMPT",
                "raw_response_text": json.dumps(
                    {
                        "total_score": 7.8,
                        "match_percent": 78,
                        "advantages": ["基础匹配较好"],
                        "concerns": ["仍需面试核实"],
                        "recommendation": "建议继续评估",
                        "suggested_status": "screening_passed",
                        "dimensions": [
                            {
                                "label": "基础匹配",
                                "score": 8.1,
                                "max_score": 10.0,
                                "reason": "命中",
                                "evidence": ["测试经验"],
                                "is_inferred": False,
                            }
                        ],
                    },
                    ensure_ascii=False,
                ),
                "content": {},
                "token_usage": None,
                "response_debug": {"is_stream_mode": False},
            },
            {
                "provider": "glm",
                "model_name": "glm-5",
                "prompt_snapshot": "SYSTEM\\nUSER",
                "full_request_snapshot": "{\"stream\": false}",
                "input_summary": "PROMPT",
                "raw_response_text": json.dumps(
                    {
                        "total_score": 8.1,
                        "match_percent": 81,
                        "advantages": ["基础匹配较好"],
                        "concerns": ["仍需面试核实"],
                        "recommendation": "建议继续评估",
                        "suggested_status": "screening_passed",
                        "dimensions": [
                            {
                                "label": "基础匹配",
                                "score": 8.1,
                                "max_score": 10.0,
                                "reason": "命中",
                                "evidence": ["测试经验"],
                                "is_inferred": False,
                            }
                        ],
                    },
                    ensure_ascii=False,
                ),
                "content": {},
                "token_usage": None,
                "response_debug": {"is_stream_mode": False},
            },
        ]
    )

    payload = service._score_candidate(
        candidate,
        parse_row,
        "tester",
        [],
        "position_binding",
        "",
        screening_run_id="run-1",
        parent_task_id=91,
        root_task_id=91,
        task_log_row=log_row,
        reused_existing_parse=True,
    )

    assert payload is score_row
    assert service.ai_gateway.generate_json.call_count == 2
    final_validation_meta = service._update_ai_task_log.call_args_list[-1].kwargs["validation_meta"]
    assert "score JSON 首次返回存在冲突版本，已自动进行一次 non-stream 重试" in final_validation_meta["validation_warnings"]
    assert final_validation_meta["screening_result_valid"] is True


def test_trigger_latest_parse_propagates_cancel_control():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5)
    parse_row = SimpleNamespace(id=31)
    service._get_candidate = Mock(return_value=candidate)
    service._parse_latest_resume = Mock(return_value=parse_row)
    service._serialize_parse_result = Mock(return_value={"parse_result_id": 31})
    cancel_control = object()

    payload = service.trigger_latest_parse(5, "tester", cancel_control=cancel_control)

    assert payload == {"parse_result_id": 31}
    assert service._parse_latest_resume.call_args.kwargs["cancel_control"] is cancel_control


def test_trigger_latest_score_propagates_cancel_control_when_parse_missing():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5)
    parse_row = SimpleNamespace(id=31)
    score_row = SimpleNamespace(id=41)
    service._get_candidate = Mock(return_value=candidate)
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._get_current_parse_result = Mock(return_value=None)
    service._parse_latest_resume = Mock(return_value=parse_row)
    service._score_candidate = Mock(return_value=score_row)
    service._serialize_score = Mock(return_value={"score_result_id": 41})
    cancel_control = object()

    payload = service.trigger_latest_score(5, "tester", cancel_control=cancel_control)

    assert payload == {"score_result_id": 41}
    assert service._parse_latest_resume.call_args.kwargs["cancel_control"] is cancel_control
    assert service._score_candidate.call_args.kwargs["cancel_control"] is cancel_control


def test_resume_score_prompt_uses_score_only_schema():
    assert SCORE_ONLY_OUTPUT_SCHEMA in RESUME_SCORE_SYSTEM_PROMPT
    assert SCREENING_OUTPUT_SCHEMA not in RESUME_SCORE_SYSTEM_PROMPT
    assert "Do not return parsed_resume in resume_score tasks." in RESUME_SCORE_SYSTEM_PROMPT
    assert "The top-level object must contain only total_score, match_percent, advantages, concerns, recommendation, suggested_status, and dimensions." in RESUME_SCORE_SYSTEM_PROMPT
    assert "Return exactly one final JSON object once." in RESUME_SCORE_SYSTEM_PROMPT
    assert "OTA压测" not in RESUME_SCORE_SYSTEM_PROMPT
    assert "智能家居生态" not in RESUME_SCORE_SYSTEM_PROMPT


def test_extract_model_score_payload_warns_on_nested_score_response():
    payload = {
        "parsed_resume": {
            "basic_info": {
                "name": "岳珊珊",
            },
        },
        "score": {
            "total_score": 1.0,
            "match_percent": 10,
            "advantages": ["有 IoT 相关经验"],
            "concerns": ["自动化测试证据不足"],
            "recommendation": "建议安排初试",
            "suggested_status": "screening_passed",
            "dimensions": [
                {
                    "label": "IoT通信协议",
                    "score": 1.0,
                    "max_score": 1.0,
                    "reason": "命中",
                    "evidence": ["BLE 协议测试"],
                    "is_inferred": False,
                }
            ],
        },
    }

    score_payload, meta = _extract_model_score_payload_with_meta(payload)

    assert score_payload["total_score"] == 1.0
    assert score_payload["dimensions"][0]["label"] == "IoT通信协议"
    assert meta["model_schema_violation"] is True
    assert meta["model_schema_violation_reason"] == "resume_score task returned nested parsed_resume+score payload; expected score-only schema"
    assert "模型未遵循 resume_score score-only schema，已降级提取 score 字段。" in meta["warnings"]


def test_resume_parse_prompt_tightens_duplicate_time_and_skill_rules():
    assert "Do not output the same work experience twice in different granularities." in RESUME_PARSE_SYSTEM_PROMPT
    assert "Do not output start_time or end_time." in RESUME_PARSE_SYSTEM_PROMPT
    assert "Never return a Python-list string or JSON-like string" in RESUME_PARSE_SYSTEM_PROMPT
    assert "skills must only contain concrete, discriminative skills" in RESUME_PARSE_SYSTEM_PROMPT


def test_prepare_resume_text_for_parse_prompt_compacts_duplicate_lines():
    raw_text = "\n".join(["李四", "李四", "", "", "北京智联科技有限公司 测试工程师", "北京智联科技有限公司 测试工程师", "Python 脚本"])

    prepared = _prepare_resume_text_for_parse_prompt(raw_text, max_chars=200)

    assert prepared.count("李四") == 1
    assert prepared.count("北京智联科技有限公司 测试工程师") == 1
    assert "Python 脚本" in prepared


def test_prepare_resume_text_for_parse_prompt_precleans_headings_dates_and_contact_noise():
    raw_text = "\n".join(
        [
            "基本信息",
            "基本信息",
            "教育背景",
            "邮箱：foo@example.com 2024- 09 ~ 至今 北京工业大学（211）",
            "工作经验",
            "电话：138 0013 8000 2024- 04 ~ 2025- 03 北京快手科技有限公司 测试工程师",
            "技能特长",
            "技能特长",
            "Python",
        ]
    )

    prepared = _prepare_resume_text_for_parse_prompt(raw_text, max_chars=400)

    assert prepared.count("基本信息") == 1
    assert prepared.count("技能特长") == 1
    assert "2024-09 ~ 至今 北京工业大学（211）" in prepared
    assert "2024-04 ~ 2025-03 北京快手科技有限公司 测试工程师" in prepared
    assert "foo@example.com" not in prepared
    assert "138 0013 8000" not in prepared


def test_score_payload_total_and_match_percent_auto_corrected_from_dimensions():
    schema_config = {
        "parsed_resume": SCREENING_PAYLOAD_SCHEMA_CONFIG["parsed_resume"],
        "score": {
            **SCREENING_PAYLOAD_SCHEMA_CONFIG["score"],
            "required_dimension_labels": ("智能家居生态", "IoT通信协议", "软件测试基础"),
        },
    }
    payload = {
        "total_score": 7.8,
        "match_percent": 78,
        "advantages": ["IoT 测试经验较匹配"],
        "concerns": ["自动化测试还需继续核实"],
        "recommendation": "建议安排初试",
        "suggested_status": "screening_passed",
        "dimensions": [
            {"label": "智能家居生态", "score": 2.5, "max_score": 2.5, "reason": "命中", "evidence": ["米家联动测试"], "is_inferred": False},
            {"label": "IoT通信协议", "score": 2.6, "max_score": 2.6, "reason": "命中", "evidence": ["BLE 协议测试"], "is_inferred": False},
            {"label": "软件测试基础", "score": 3.0, "max_score": 5.0, "reason": "命中", "evidence": ["接口测试"], "is_inferred": False},
        ],
    }

    score_payload, meta = sanitize_screening_score_payload(payload, schema_config)
    valid, reasons = _classify_screening_score_validity(
        score_payload,
        schema_config,
        validation_warnings=meta["warnings"],
    )

    assert score_payload["total_score"] == 8.1
    assert score_payload["match_percent"] == 81
    assert valid is True
    assert reasons == []
    assert "score.total_score 已按 dimensions 自动校正" in meta["warnings"]
    assert "score.match_percent 已按 total_score 自动校正" in meta["warnings"]


def test_dimension_score_over_max_is_clamped_and_totals_recomputed():
    schema_config = {
        "parsed_resume": SCREENING_PAYLOAD_SCHEMA_CONFIG["parsed_resume"],
        "score": {
            **SCREENING_PAYLOAD_SCHEMA_CONFIG["score"],
            "required_dimension_labels": ("基础匹配", "加分项"),
        },
    }
    payload = {
        "total_score": 5.1,
        "match_percent": 51,
        "advantages": ["基础条件满足"],
        "concerns": ["加分项需进一步核实"],
        "recommendation": "建议继续评估",
        "suggested_status": "talent_pool",
        "dimensions": [
            {"label": "基础匹配", "score": 5.0, "max_score": 5.0, "reason": "命中", "evidence": ["测试经验"], "is_inferred": False},
            {"label": "加分项", "score": 0.3, "max_score": 0.2, "reason": "部分命中", "evidence": ["自动化"], "is_inferred": False},
        ],
    }

    score_payload, meta = sanitize_screening_score_payload(payload, schema_config)

    assert score_payload["dimensions"][1]["score"] == 0.2
    assert score_payload["total_score"] == 5.2
    assert score_payload["match_percent"] == 52
    assert "维度[加分项]得分超过上限，已自动裁剪" in meta["warnings"]
    assert "score.total_score 已按 dimensions 自动校正" in meta["warnings"]
    assert "score.match_percent 已按 total_score 自动校正" in meta["warnings"]


def test_detect_score_json_variant_conflict_on_multiple_candidates_and_total_mismatch():
    raw_text = """{"total_score":7.8,"match_percent":78,"advantages":["A"],"concerns":["B"],"recommendation":"建议继续评估","suggested_status":"screening_passed","dimensions":[{"label":"基础匹配","score":8.1,"max_score":10.0,"reason":"命中","evidence":"测试经验","is_inferred":false}]}
{"total_score":8.1,"match_percent":81,"advantages":["A"],"concerns":["B"],"recommendation":"建议继续评估","suggested_status":"talent_pool","dimensions":[{"label":"基础匹配","score":8.1,"max_score":10.0,"reason":"命中","evidence":"测试经验","is_inferred":false}]}"""
    payload = {
        "total_score": 7.8,
        "match_percent": 78,
        "advantages": ["A"],
        "concerns": ["B"],
        "recommendation": "建议继续评估",
        "suggested_status": "screening_passed",
        "dimensions": [
            {"label": "基础匹配", "score": 8.1, "max_score": 10.0, "reason": "命中", "evidence": "测试经验", "is_inferred": False},
        ],
    }

    conflict = _detect_score_json_variant_conflict(raw_text, payload)

    assert conflict is not None
    assert conflict["failure_code"] == "invalid_json_variant_conflict"
    assert "检测到多个顶层 JSON 候选" in conflict["reasons"]
    assert "suggested_status 在同次模型返回中发生漂移" in conflict["reasons"]
    assert "total_score 在同次模型返回中发生漂移" in conflict["reasons"]
    assert "total_score 与 dimensions 求和不一致" in conflict["reasons"]


def test_sanitize_ai_parsed_resume_prefers_clean_model_parse_over_fallback_noise():
    raw_text = """张三
北京博彦科技有限公司 测试工程师 2022-01 ~ 2024-01
北京工业大学 本科 自动化 2014-09 ~ 2018-06
智能门锁项目 BLE 联调测试
Python BLE
"""
    model_parse = {
        "basic_info": {
            "name": "张三",
            "email": "zhangsan@example.com",
        },
        "work_experiences": [
            {
                "company_name": "北京博彦科技有限公司",
                "position": "测试工程师",
                "duration": "2022-01 ~ 2024-01",
            }
        ],
        "education_experiences": [
            {
                "school": "北京工业大学",
                "degree": "本科",
                "major": "自动化",
                "duration": "2014-09 ~ 2018-06",
            }
        ],
        "skills": ["Python", "BLE"],
        "projects": [
            {
                "project_name": "智能门锁项目",
                "description": "负责 BLE 联调测试",
            }
        ],
        "summary": "5年 IoT 测试经验，具备 BLE 联调经历。",
    }
    fallback_noise = {
        "basic_info": {
            "name": "张三",
            "email": "15210672214@163.com",
        },
        "work_experiences": [
            {
                "company_name": "北京博彦科技有限公司",
                "position": "测试工程师",
                "duration": "2022-01 ~ 2024-01",
            }
        ],
        "education_experiences": [
            {
                "school": "邮箱：15210672214@163.com 2024-09 ~ 至今 北京工业大学",
                "degree": "本科",
                "major": "自动化",
            },
            {
                "school": "北京工业大学",
                "degree": "本科",
                "major": "自动化",
            },
        ],
        "skills": ["Python", "IoT测试"],
        "projects": [
            {
                "project_name": "智能门锁项目项目描述：BLE 联调测试",
                "description": "整段脏文本",
            }
        ],
        "summary": "个人简历PERSONAL RESUME 联系电话：15210672214 邮箱：15210672214@163.com 自我评价：IoT测试",
    }

    with patch("app.services.recruitment_service_impl.extract_resume_structured_data", return_value=fallback_noise):
        sanitized = _sanitize_ai_parsed_resume(model_parse, raw_text, "张三")

    assert sanitized["work_experiences"][0]["company_name"] == "北京博彦科技有限公司"
    assert sanitized["work_experiences"][0]["position"] == "测试工程师"
    assert sanitized["work_experiences"][0]["duration"].replace(" ", "") == "2022-01~2024-01"
    assert len(sanitized["education_experiences"]) == 1
    assert sanitized["education_experiences"][0]["school"] == "北京工业大学"
    assert sanitized["education_experiences"][0]["degree"] == "本科"
    assert sanitized["education_experiences"][0]["major"] == "自动化"
    assert sanitized["education_experiences"][0]["duration"].replace(" ", "") == "2014-09~2018-06"
    assert sanitized["projects"] == model_parse["projects"]
    assert sanitized["summary"] == model_parse["summary"]
    assert "raw_text" not in sanitized


def test_parse_sanitize_dedupes_work_filters_generic_skills_and_normalizes_project_highlights():
    raw_text = """李四
北京智联科技有限公司 测试工程师 2022-01 ~ 2024-01
2022-01 ~ 2024-01 北京智联科技有限公司 测试工程师
智能网关项目
负责网关设备测试
亮点：自动化回归、BLE 联调
Python 脚本
"""
    model_parse = {
        "basic_info": {"name": "李四"},
        "work_experiences": [
            {
                "company_name": "北京智联科技有限公司",
                "position": "测试工程师",
                "duration": "2022-01 ~ 2024-01",
                "description": "['承担测试计划制定', '执行回归测试']",
            },
            {
                "company_name": "北京智联科技有限公司",
                "position": "测试工程师",
                "start_time": "2022-01",
                "end_time": "2024-01",
            },
        ],
        "education_experiences": [],
        "skills": ["IoT", "测试", "SQL", "BLE", "Python"],
        "projects": [
            {
                "project_name": "智能网关项目",
                "description": "['负责网关设备测试', '跟进缺陷闭环']",
                "highlights": "['自动化回归', 'BLE 联调']",
                "start_time": "2023-01",
                "end_time": "2023-12",
            }
        ],
        "summary": "具备智能硬件测试经验。",
    }

    with patch("app.services.recruitment_service_impl.extract_resume_structured_data", return_value={"basic_info": {}, "work_experiences": [], "education_experiences": [], "skills": [], "projects": [], "summary": ""}):
        sanitized, warnings = _sanitize_ai_parsed_resume_with_meta(model_parse, raw_text, "李四")

    assert len(sanitized["work_experiences"]) == 1
    assert sanitized["work_experiences"][0]["company_name"] == "北京智联科技有限公司"
    assert sanitized["work_experiences"][0]["duration"].replace(" ", "") == "2022-01~2024-01"
    assert sanitized["work_experiences"][0]["description"] == ["承担测试计划制定", "执行回归测试"]
    assert "start_time" not in sanitized["work_experiences"][0]
    assert "end_time" not in sanitized["work_experiences"][0]
    assert sanitized["skills"] == ["BLE", "Python"]
    assert sanitized["projects"][0]["description"] == ["负责网关设备测试", "跟进缺陷闭环"]
    assert sanitized["projects"][0]["highlights"] == ["自动化回归", "BLE 联调"]
    assert sanitized["projects"][0]["start_date"] == "2023-01"
    assert sanitized["projects"][0]["end_date"] == "2023-12"
    assert "start_time" not in sanitized["projects"][0]
    assert "end_time" not in sanitized["projects"][0]
    assert "work_experiences 存在重复结构，已去重" in warnings
    assert "work_experiences.description 为字符串化列表，已归一" in warnings
    assert "skills 存在泛词污染，已过滤" in warnings
    assert "projects.highlights 为字符串化列表，已归一" in warnings
    assert "projects.description 为字符串化列表，已归一" in warnings


def test_root_task_completed_snapshot_contains_timing_and_persisted_refs():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None, status="screening_passed", match_percent=81, ai_recommended_status="screening_passed")
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success", raw_text="候选人简历")
    score_row = SimpleNamespace(id=41)
    score_log = SimpleNamespace(
        id=92,
        validation_meta_json='{"validation_warnings":[],"invalid_result_reasons":[],"screening_result_valid":true,"screening_result_state":"success","parse_strategy":"rerank_from_existing_parse","reused_existing_parse":true,"final_response_source":"primary_score_model","primary_model_call_succeeded":true}',
        output_summary="初筛评分完成",
        error_message=None,
        status="success",
    )
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary="初筛完成",
        timing_breakdown_json='{"parse_duration_ms":0,"score_duration_ms":400,"validation_duration_ms":120,"save_duration_ms":80}',
        output_snapshot=None,
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=True)
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash"})
    service._load_reusable_screening_result = Mock(return_value=None)
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=parse_row)
    service._score_candidate = Mock(return_value=score_row)
    service._parse_latest_resume = Mock(return_value=parse_row)
    service._get_latest_screening_run_task = Mock(side_effect=lambda screening_run_id, **kwargs: score_log if kwargs.get("task_type") == "resume_score" else None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 1234})
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 31, "score_result_id": 41, "candidate_status_after": "screening_passed"})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._screen_candidate_with_single_ai_call = Mock(side_effect=AssertionError("should not call one-pass"))
    service._save_screening_workflow_memory = Mock()
    service._serialize_parse_result = Mock(return_value={"basic_info": {}, "work_experiences": [], "education_experiences": [], "skills": [], "projects": [], "summary": ""})
    service._serialize_score = Mock(return_value={"score_result_id": 41})
    service.get_candidate_detail = Mock(return_value={"candidate": {"id": 5}})

    service.screen_candidate(5, "tester", screening_mode="rerank_from_existing_parse")

    kwargs = service._finish_ai_task_log.call_args.kwargs
    assert kwargs["timing_breakdown"] == {"total_duration_ms": 1234}
    assert kwargs["persisted_result_refs"] == {"parse_result_id": 31, "score_result_id": 41, "candidate_status_after": "screening_passed"}


def test_root_task_completed_inherits_model_from_score_log():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None, status="screening_passed", match_percent=81, ai_recommended_status="screening_passed")
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success", raw_text="候选人简历")
    score_row = SimpleNamespace(id=41)
    score_log = SimpleNamespace(
        id=92,
        validation_meta_json='{"screening_result_valid":true,"screening_result_state":"success","parse_strategy":"rerank_from_existing_parse","reused_existing_parse":true}',
        output_summary="初筛评分完成",
        error_message=None,
        status="success",
        model_provider="GLM",
        model_name="glm-5",
    )
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary="初筛完成",
        timing_breakdown_json='{"parse_duration_ms":0,"score_duration_ms":400}',
        output_snapshot=None,
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=True)
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash"})
    service._load_reusable_screening_result = Mock(return_value=None)
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=parse_row)
    service._score_candidate = Mock(return_value=score_row)
    service._parse_latest_resume = Mock(return_value=parse_row)
    service._get_latest_screening_run_task = Mock(side_effect=lambda screening_run_id, **kwargs: score_log if kwargs.get("task_type") == "resume_score" else None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 1234})
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 31, "score_result_id": 41})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._save_screening_workflow_memory = Mock()
    service._serialize_parse_result = Mock(return_value={"basic_info": {}, "work_experiences": [], "education_experiences": [], "skills": [], "projects": [], "summary": ""})
    service._serialize_score = Mock(return_value={"score_result_id": 41})
    service.get_candidate_detail = Mock(return_value={"candidate": {"id": 5}})

    service.screen_candidate(5, "tester", screening_mode="rerank_from_existing_parse")

    kwargs = service._finish_ai_task_log.call_args.kwargs
    assert kwargs["provider"] == "GLM"
    assert kwargs["model_name"] == "glm-5"


def test_root_validation_meta_does_not_embed_full_parsed_resume_and_score():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None, status="screening_passed", match_percent=81, ai_recommended_status="screening_passed")
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success", raw_text="候选人简历")
    score_row = SimpleNamespace(id=41)
    score_log = SimpleNamespace(
        id=92,
        validation_meta_json='{"validation_warnings":["结构校验提醒"],"invalid_result_reasons":[],"invalid_result_summary":null,"model_schema_violation":false,"model_schema_violation_reason":null,"screening_result_valid":true,"screening_result_state":"success","parse_strategy":"rerank_from_existing_parse","reused_existing_parse":true}',
        output_summary="初筛评分完成",
        error_message=None,
        status="success",
    )
    root_log = SimpleNamespace(
        id=91,
        screening_run_id="run-91",
        root_task_id=91,
        validation_meta_json=None,
        error_message=None,
        output_summary="初筛完成",
        timing_breakdown_json='{"parse_duration_ms":0,"score_duration_ms":400,"validation_duration_ms":120,"save_duration_ms":80}',
        output_snapshot=None,
    )

    service._get_candidate = Mock(return_value=candidate)
    service._can_reuse_existing_parse_result = Mock(return_value=True)
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._build_screening_request_meta = Mock(return_value={"request_hash": "hash"})
    service._load_reusable_screening_result = Mock(return_value=None)
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=parse_row)
    service._score_candidate = Mock(return_value=score_row)
    service._parse_latest_resume = Mock(return_value=parse_row)
    service._get_latest_screening_run_task = Mock(side_effect=lambda screening_run_id, **kwargs: score_log if kwargs.get("task_type") == "resume_score" else None)
    service._build_screening_run_timing_breakdown = Mock(return_value={"total_duration_ms": 1234})
    service._build_screening_persisted_result_refs = Mock(return_value={"parse_result_id": 31, "score_result_id": 41})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._screen_candidate_with_single_ai_call = Mock(side_effect=AssertionError("should not call one-pass"))
    service._save_screening_workflow_memory = Mock()
    service._serialize_parse_result = Mock(return_value={"basic_info": {}, "work_experiences": [], "education_experiences": [], "skills": [], "projects": [], "summary": ""})
    service._serialize_score = Mock(return_value={"score_result_id": 41})
    service.get_candidate_detail = Mock(return_value={"candidate": {"id": 5}})

    service.screen_candidate(5, "tester", screening_mode="rerank_from_existing_parse")

    validation_meta = service._finish_ai_task_log.call_args.kwargs["validation_meta"]
    assert "parsed_resume" not in validation_meta
    assert "score" not in validation_meta
    assert "raw_response_text" not in validation_meta
    assert validation_meta["parse_strategy"] == "rerank_from_existing_parse"


def test_suggested_status_conflict_preserves_model_status_before_save():
    service = RecruitmentService(Mock())
    service._auto_advance_candidate_after_screening = Mock(
        side_effect=lambda candidate, actor_id=None: setattr(candidate, "status", candidate.ai_recommended_status)
    )
    candidate = SimpleNamespace(
        id=5,
        latest_score_id=None,
        match_percent=None,
        ai_recommended_status=None,
        status="talent_pool",
        updated_by=None,
    )
    parse_row = SimpleNamespace(id=31)
    schema_config = {
        "parsed_resume": SCREENING_PAYLOAD_SCHEMA_CONFIG["parsed_resume"],
        "score": {
            **SCREENING_PAYLOAD_SCHEMA_CONFIG["score"],
            "required_dimension_labels": ("核心匹配", "经验匹配"),
            "status_thresholds": {"pass_threshold": 75.0, "pool_threshold": 55.0},
        },
    }
    payload = {
        "total_score": 8.0,
        "match_percent": 80,
        "advantages": ["核心维度命中"],
        "concerns": ["需继续核实自动化能力"],
        "recommendation": "建议保留观察",
        "suggested_status": "talent_pool",
        "dimensions": [
            {"label": "核心匹配", "score": 4.0, "max_score": 5.0, "reason": "命中", "evidence": ["核心经验"], "is_inferred": False},
            {"label": "经验匹配", "score": 4.0, "max_score": 5.0, "reason": "命中", "evidence": ["项目经验"], "is_inferred": False},
        ],
    }

    score_payload, meta = sanitize_screening_score_payload(payload, schema_config)
    score_row = service._save_score_result(
        candidate,
        parse_row,
        "tester",
        {
            "_storage_format": RAW_SCREENING_SCORE_STORAGE_FORMAT,
            "score": score_payload,
        },
    )

    assert meta["raw_model_suggested_status"] == "talent_pool"
    assert meta["normalized_final_suggested_status"] == "talent_pool"
    assert "score.suggested_status 已按最终分数规则自动纠正" not in meta["warnings"]
    assert score_payload["suggested_status"] == "talent_pool"
    assert candidate.ai_recommended_status == "talent_pool"
    assert candidate.status == "talent_pool"
    assert score_row.suggested_status == "talent_pool"


def test_final_score_dimensions_do_not_leak_weight_text_or_is_core():
    normalized_score = {
        "total_score": 8.1,
        "match_percent": 81,
        "advantages": ["经验匹配"],
        "concerns": ["自动化能力待核实"],
        "recommendation": "建议安排初试",
        "suggested_status": "screening_passed",
    }
    score_enhancements = {
        "dimensions": [
            {
                "label": "IoT通信协议",
                "score": 2.6,
                "max_score": 2.5,
                "reason": "命中",
                "evidence": ["BLE 协议测试"],
                "is_inferred": False,
                "weight_text": "25%",
                "is_core": True,
            }
        ],
        "dimensions_mode": "strict",
        "missing_core_labels": [],
        "score_cap_reason": None,
        "derived_total_score_from_dimensions": 8.1,
        "derived_match_percent_from_dimensions": 81,
        "score_quality_warnings": [],
        "repair_reason": None,
        "report_markdown": None,
    }

    score_payload = _build_score_compat_payload(normalized_score, score_enhancements)

    assert set(score_payload["dimensions"][0].keys()) == {"label", "score", "max_score", "reason", "evidence", "is_inferred"}


def test_recommendation_matches_screening_passed_semantically():
    payload = {
        "parsed_resume": {
            "basic_info": {
                "name": "",
                "phone": "",
                "email": "",
                "years_of_experience": "",
                "education": "",
                "location": "",
            },
            "work_experiences": [],
            "education_experiences": [],
            "skills": [],
            "projects": [],
            "summary": "",
        },
        "score": {
            "total_score": 8.0,
            "match_percent": 80,
            "advantages": ["核心维度命中"],
            "concerns": ["自动化测试偏弱"],
            "recommendation": "核心维度匹配良好，建议通过初筛",
            "suggested_status": "screening_passed",
            "dimensions": [
                {"label": "智能家居生态", "score": 2.5, "max_score": 2.5, "reason": "命中", "evidence": ["米家联动测试"], "is_inferred": False},
                {"label": "IoT通信协议", "score": 2.5, "max_score": 2.5, "reason": "命中", "evidence": ["BLE 协议测试"], "is_inferred": False},
                {"label": "软件测试基础", "score": 3.0, "max_score": 5.0, "reason": "命中", "evidence": ["接口测试"], "is_inferred": False},
            ],
        },
    }
    schema_config = {
        "parsed_resume": SCREENING_PAYLOAD_SCHEMA_CONFIG["parsed_resume"],
        "score": {
            **SCREENING_PAYLOAD_SCHEMA_CONFIG["score"],
            "status_thresholds": {"pass_threshold": 75.0, "pool_threshold": 55.0},
        },
    }

    warnings = _validate_screening_payload_warnings(payload, schema_config)

    assert "score.recommendation 与 suggested_status 不一致。" not in warnings


def test_recommendation_conflicts_with_screening_rejected():
    payload = {
        "parsed_resume": {
            "basic_info": {
                "name": "",
                "phone": "",
                "email": "",
                "years_of_experience": "",
                "education": "",
                "location": "",
            },
            "work_experiences": [],
            "education_experiences": [],
            "skills": [],
            "projects": [],
            "summary": "",
        },
        "score": {
            "total_score": 4.0,
            "match_percent": 40,
            "advantages": ["基础测试经验"],
            "concerns": ["核心维度缺失"],
            "recommendation": "建议安排首面进一步评估",
            "suggested_status": "screening_rejected",
            "dimensions": [
                {"label": "智能家居生态", "score": 0.0, "max_score": 2.5, "reason": "简历未提及", "evidence": "", "is_inferred": False},
                {"label": "IoT通信协议", "score": 0.0, "max_score": 2.5, "reason": "简历未提及", "evidence": "", "is_inferred": False},
                {"label": "软件测试基础", "score": 4.0, "max_score": 5.0, "reason": "命中", "evidence": ["接口测试"], "is_inferred": False},
            ],
        },
    }
    schema_config = {
        "parsed_resume": SCREENING_PAYLOAD_SCHEMA_CONFIG["parsed_resume"],
        "score": {
            **SCREENING_PAYLOAD_SCHEMA_CONFIG["score"],
            "status_thresholds": {"pass_threshold": 75.0, "pool_threshold": 55.0},
        },
    }

    warnings = _validate_screening_payload_warnings(payload, schema_config)

    assert "score.recommendation 与 suggested_status 不一致。" in warnings


def test_build_parsed_resume_helper_payload_cleans_noisy_fields():
    service = RecruitmentService(Mock())
    helper, warnings = service._build_score_resume_helper_payload(
        {
            "basic_info": {
                "name": "岳珊珊",
                "phone": "15210672214",
                "email": "15210672214@163.com",
                "years_of_experience": "8年",
                "education": "硕士",
                "location": "北京",
            },
            "work_experiences": [
                {
                    "duration": "2024- 04 ~ 2025- 03",
                    "company": "北京博彦科技有限公司",
                    "position": "测试",
                    "description": "负责功能测试",
                }
            ],
            "education_experiences": [
                {
                    "school": "邮 箱 ： 15210672214@163.com 2024- 09 ~ 至今 北京工业大学（211）",
                    "degree": "硕士",
                    "start_date": "2024- 09",
                    "end_date": "至今",
                },
                {
                    "school": "北京工业大学（211）",
                    "degree": "硕士",
                    "start_date": "2024- 09",
                    "end_date": "至今",
                    "major": "计算机",
                },
            ],
            "skills": ["MySQL", ",", "；", "Linux", "MySQL"],
            "projects": [
                {
                    "project_name": "小米智能门锁项目描述：小米门锁业务线，全线品牌的门锁软硬件测试",
                    "description": "",
                }
            ],
            "summary": "个人简历PERSONAL RESUME 联系电话：15210672214 邮箱：15210672214@163.com 出生年月：1993-12 自我评价：8年经验，长期从事IoT测试。",
        }
    )

    assert helper["basic_info"] == {
        "name": "岳珊珊",
        "years_of_experience": "8年",
        "education": "硕士",
    }
    assert helper["education_experiences"] == [
        {
            "school": "北京工业大学（211）",
            "degree": "硕士",
            "start_date": "2024-09",
            "end_date": "至今",
        }
    ]
    assert helper["projects"] == [
        {
            "project_name": "小米智能门锁",
            "description": "小米门锁业务线，全线品牌的门锁软硬件测试",
        }
    ]
    assert helper["summary"] == ""
    assert helper["skills"] == ["MySQL", "Linux"]
    assert warnings == ["score helper sanitized from parse result before scoring"]


def test_dimension_reason_summary_is_generic_for_unknown_label():
    summary = _build_dimension_reason_summary(
        "数据分析能力",
        score=0.0,
        max_score=1.0,
        raw_reason="",
        evidence=[],
    )

    assert summary in {"简历未提及", "未见与该维度直接对应的简历证据"}
    assert "IoT" not in summary
    assert "智能家居" not in summary


def test_dimension_concern_summary_is_generic_for_unknown_label():
    summary = _build_dimension_concern_summary(
        {
            "label": "数据分析能力",
            "score": 0.4,
            "max_score": 1.0,
        }
    )

    assert summary == "数据分析能力方面匹配度偏弱，建议面试继续核实。"
    assert "IoT" not in summary
    assert "智能家居" not in summary


def test_build_parsed_resume_helper_payload_dedupes_work_experiences_and_filters_generic_skills():
    service = RecruitmentService(Mock())
    helper, warnings = service._build_score_resume_helper_payload(
        {
            "basic_info": {
                "name": "候选人A",
                "years_of_experience": "6年",
                "education": "本科",
            },
            "work_experiences": [
                {"duration": "2022-01 ~ 2024-01", "company": "甲公司", "position": "测试工程师"},
                {"duration": "2022-01 ~ 2024-01", "company": "甲公司", "position": "测试工程师", "description": "重复经历"},
                {"duration": "2020-01 ~ 2021-12", "company": "乙公司", "position": "QA"},
            ],
            "education_experiences": [
                {"school": "某大学", "degree": "本科", "start_date": "2014-09", "end_date": "2018-06"},
                {"school": "某大学", "degree": "本科", "start_date": "2014-09", "end_date": "2018-06"},
            ],
            "skills": ["iot", "测试", "web", "app", "MySQL", "Linux", "Postman", "Jira", "自动化测试"],
            "projects": [
                {"project_name": "支付平台升级项目", "description": "负责支付链路改造、接口联调、回归测试与线上问题跟踪。" * 20},
            ],
            "summary": "",
        }
    )

    assert helper["work_experiences"] == [
        {"duration": "2022-01 ~ 2024-01", "company": "甲公司", "position": "测试工程师"},
        {"duration": "2020-01 ~ 2021-12", "company": "乙公司", "position": "QA"},
    ]
    assert helper["education_experiences"] == [
        {"school": "某大学", "degree": "本科", "start_date": "2014-09", "end_date": "2018-06"},
    ]
    assert helper["skills"][:5] == ["MySQL", "Linux", "Postman", "Jira", "自动化测试"]
    assert "iot" not in helper["skills"]
    assert "测试" not in helper["skills"]
    assert "web" not in helper["skills"]
    assert "app" not in helper["skills"]
    assert len(helper["projects"][0]["description"]) <= 160
    assert warnings == ["score helper sanitized from parse result before scoring"]


def test_build_parsed_resume_helper_payload_downgrades_to_basic_info_when_parse_risk_is_high():
    service = RecruitmentService(Mock())
    helper, warnings = service._build_score_resume_helper_payload(
        {
            "basic_info": {
                "name": "候选人A",
                "phone": "13800138000",
                "email": "test@example.com",
                "years_of_experience": "6年",
                "education": "本科",
                "location": "北京",
            },
            "work_experiences": [
                {"duration": "2022-01 ~ 2024-01", "company": "甲公司", "position": "测试工程师"},
            ],
            "education_experiences": [
                {"school": "某大学", "degree": "本科", "start_date": "2014-09", "end_date": "2018-06"},
            ],
            "skills": ["MySQL", "Linux"],
            "projects": [
                {"project_name": "支付平台升级项目", "description": "负责支付链路改造"},
            ],
            "summary": "负责测试。",
        },
        parse_quality_warnings=["work_experiences 中仍存在结构异常的工作经历条目"],
    )

    assert helper == {
        "basic_info": {
            "name": "候选人A",
            "years_of_experience": "6年",
            "education": "本科",
        },
        "work_experiences": [],
        "education_experiences": [],
        "skills": [],
        "projects": [],
        "summary": "",
    }
    assert "high-risk parse result detected; score helper downgraded to basic_info only" in warnings
    assert "score helper sanitized from parse result before scoring" in warnings
