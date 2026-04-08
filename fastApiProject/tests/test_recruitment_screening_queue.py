from types import SimpleNamespace
from unittest.mock import Mock

from app.services.recruitment_prompts import (
    RESUME_SCORE_SYSTEM_PROMPT,
    SCORE_ONLY_OUTPUT_SCHEMA,
    SCREENING_OUTPUT_SCHEMA,
)
from app.services.recruitment_service_impl import (
    RecruitmentService,
    SCREENING_PAYLOAD_SCHEMA_CONFIG,
    _validate_screening_payload_warnings,
    _classify_screening_score_validity,
    sanitize_screening_score_payload,
    sanitize_dimensions,
)


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
        "task_type": "resume_score",
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
        "task_type": "resume_score",
        "related_candidate_id": 1,
        "related_position_id": 11,
        "reused_existing_task": False,
    }
    reused = {
        "task_id": 202,
        "status": "running",
        "task_type": "resume_score",
        "related_candidate_id": 2,
        "related_position_id": 11,
        "reused_existing_task": True,
    }
    service.enqueue_screen_candidate = Mock(side_effect=[queued, reused])
    service._dispatch_screening_queue = Mock(return_value={"started_count": 1, "active_count": 1, "max_concurrency": 3})

    payload = service.batch_start_screen_candidates([1, 2], "tester")

    assert payload["queued_count"] == 1
    assert payload["skipped_existing_live_task_count"] == 1
    assert payload["failed_count"] == 0
    assert payload["task_ids"] == [201, 202]


def test_screen_candidate_prefers_existing_parse_before_score():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None)
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success")
    score_row = SimpleNamespace(id=41)
    root_log = SimpleNamespace(id=91, screening_run_id="run-91", root_task_id=91, validation_meta_json=None, error_message=None)
    score_log = SimpleNamespace(id=41, status="success", output_summary="初筛完成", validation_meta_json=None, error_message=None)

    service._get_candidate = Mock(return_value=candidate)
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=parse_row)
    service._score_candidate = Mock(return_value=score_row)
    service._get_latest_screening_run_task = Mock(side_effect=[None, score_log])
    service._build_screening_run_timing_breakdown = Mock(return_value={})
    service._build_screening_persisted_result_refs = Mock(return_value={})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._screen_candidate_with_single_ai_call = Mock(side_effect=AssertionError("should not call one-pass"))
    service._save_screening_workflow_memory = Mock()
    service.get_candidate_detail = Mock(return_value={"candidate": {"id": 5}})

    payload = service.screen_candidate(5, "tester")

    assert payload == {"candidate": {"id": 5}}
    service._score_candidate.assert_called_once()
    service._screen_candidate_with_single_ai_call.assert_not_called()


def test_screen_candidate_parses_then_scores_when_parse_missing():
    service = RecruitmentService(Mock())
    candidate = SimpleNamespace(id=5, position_id=9, latest_resume_file_id=12, updated_by=None)
    parse_row = SimpleNamespace(id=31, resume_file_id=12, status="success")
    score_row = SimpleNamespace(id=41)
    root_log = SimpleNamespace(id=91, screening_run_id="run-91", root_task_id=91, validation_meta_json=None, error_message=None)
    parse_log = SimpleNamespace(id=32, status="success")
    score_log = SimpleNamespace(id=41, status="success", output_summary="初筛完成", validation_meta_json=None, error_message=None)

    service._get_candidate = Mock(side_effect=[candidate, candidate])
    service._resolve_screening_skills = Mock(return_value=([], "position", "position_binding", {}))
    service._prepare_screening_task_context = Mock(return_value=([], [], ""))
    service._ensure_screening_root_task = Mock(return_value=root_log)
    service._update_ai_task_log = Mock(return_value=root_log)
    service._get_current_parse_result = Mock(return_value=None)
    service._parse_latest_resume = Mock(return_value=parse_row)
    service._score_candidate = Mock(return_value=score_row)
    service._get_latest_screening_run_task = Mock(side_effect=[parse_log, score_log])
    service._build_screening_run_timing_breakdown = Mock(return_value={})
    service._build_screening_persisted_result_refs = Mock(return_value={})
    service._finish_ai_task_log = Mock(return_value=root_log)
    service._screen_candidate_with_single_ai_call = Mock(side_effect=AssertionError("should not call one-pass"))
    service._save_screening_workflow_memory = Mock()
    service.get_candidate_detail = Mock(return_value={"candidate": {"id": 5}})

    payload = service.screen_candidate(5, "tester")

    assert payload == {"candidate": {"id": 5}}
    service._parse_latest_resume.assert_called_once()
    service._score_candidate.assert_called_once()
    service._screen_candidate_with_single_ai_call.assert_not_called()


def test_resume_score_prompt_uses_score_only_schema():
    assert SCORE_ONLY_OUTPUT_SCHEMA in RESUME_SCORE_SYSTEM_PROMPT
    assert SCREENING_OUTPUT_SCHEMA not in RESUME_SCORE_SYSTEM_PROMPT
    assert "Do not return parsed_resume in resume_score tasks." in RESUME_SCORE_SYSTEM_PROMPT
    assert "The top-level object must contain only total_score, match_percent, advantages, concerns, recommendation, suggested_status, and dimensions." in RESUME_SCORE_SYSTEM_PROMPT


def test_extract_model_score_payload_warns_on_nested_score_response():
    payload = {
        "parsed_resume": {
            "basic_info": {
                "name": "岳珊珊",
            },
        },
        "score": {
            "total_score": 7.8,
            "match_percent": 78,
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

    score_payload, meta = sanitize_screening_score_payload(payload, SCREENING_PAYLOAD_SCHEMA_CONFIG)

    assert score_payload["total_score"] == 7.8
    assert score_payload["dimensions"][0]["label"] == "IoT通信协议"
    assert meta["model_schema_violation"] is True
    assert meta["model_schema_violation_reason"] == "resume_score task returned nested parsed_resume+score payload; expected score-only schema"
    assert "模型未遵循 resume_score score-only schema，已降级提取 score 字段。" in meta["warnings"]


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
