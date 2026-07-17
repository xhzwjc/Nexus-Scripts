from types import SimpleNamespace

from app.services.recruitment_service_impl import RecruitmentService, SCREENING_FLOW_TASK_TYPE


def test_resolve_initial_ai_task_runtime_prefills_llm_tasks():
    service = RecruitmentService(None)
    service.ai_gateway.resolve_config = lambda task_type: SimpleNamespace(  # type: ignore[assignment]
        provider="openai-compatible",
        model_name=f"{task_type}-model",
    )

    runtime = service._resolve_initial_ai_task_runtime("interview_question_generation")

    assert runtime == {
        "provider": "openai-compatible",
        "model_name": "interview_question_generation-model",
        "source": None,
    }


def test_resolve_initial_ai_task_runtime_skips_non_llm_root_tasks():
    service = RecruitmentService(None)

    runtime = service._resolve_initial_ai_task_runtime(SCREENING_FLOW_TASK_TYPE)

    assert runtime == {"provider": None, "model_name": None}
