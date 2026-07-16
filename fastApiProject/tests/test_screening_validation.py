from app.services.recruitment_service_impl import (
    SCREENING_PAYLOAD_SCHEMA_CONFIG,
    _validate_screening_payload_warnings,
    sanitize_screening_payload,
)


def _empty_parsed_resume():
    return {
        "basic_info": {f: "" for f in ["name", "phone", "email", "years_of_experience", "education", "location"]},
        "work_experiences": [],
        "education_experiences": [],
        "skills": [],
        "projects": [],
        "summary": "",
    }


def _make_dim(label, score, max_score, evidence=""):
    return {
        "label": label,
        "score": score,
        "max_score": max_score,
        "reason": "简历未提及" if score == 0 else "有证据",
        "evidence": evidence,
    }


def test_valid_payload_no_warnings():
    dims = [_make_dim("IoT协议", 2.5, 2.5, "BLE压测"), _make_dim("智能家居", 2.0, 2.5, "米家联动")]
    payload = {
        "parsed_resume": {
            "basic_info": {f: "" for f in ["name", "phone", "email", "years_of_experience", "education", "location"]},
            "work_experiences": [],
            "education_experiences": [],
            "skills": [],
            "projects": [],
            "summary": "",
        },
        "score": {
            "total_score": 4.5,
            "match_percent": 45,
            "advantages": ["有经验"],
            "concerns": ["缺自动化"],
            "recommendation": "建议面试",
            "suggested_status": "screening_passed",
            "dimensions": dims,
        },
    }
    warnings = _validate_screening_payload_warnings(payload, SCREENING_PAYLOAD_SCHEMA_CONFIG)
    assert not warnings, f"期望无 warning，实际：{warnings}"


def test_total_score_mismatch_only_warns():
    dims = [_make_dim("IoT协议", 2.5, 2.5, "BLE压测"), _make_dim("智能家居", 2.0, 2.5, "米家联动")]
    payload = {
        "parsed_resume": {
            "basic_info": {f: "" for f in ["name", "phone", "email", "years_of_experience", "education", "location"]},
            "work_experiences": [],
            "education_experiences": [],
            "skills": [],
            "projects": [],
            "summary": "",
        },
        "score": {
            "total_score": 8.6,
            "match_percent": 86,
            "advantages": ["有经验"],
            "concerns": ["缺项"],
            "recommendation": "建议面试",
            "suggested_status": "talent_pool",
            "dimensions": dims,
        },
    }
    warnings = _validate_screening_payload_warnings(payload, SCREENING_PAYLOAD_SCHEMA_CONFIG)
    assert any("total_score" in w for w in warnings), "期望检测到 total_score 不一致"
    assert payload["score"]["total_score"] == 8.6, "不应修改原始 total_score"


def test_pseudo_evidence_warns():
    dims = [_make_dim("IoT协议", 1.5, 2.5, "简历未提及相关协议测试经验")]
    payload = {
        "parsed_resume": {
            "basic_info": {f: "" for f in ["name", "phone", "email", "years_of_experience", "education", "location"]},
            "work_experiences": [],
            "education_experiences": [],
            "skills": [],
            "projects": [],
            "summary": "",
        },
        "score": {
            "total_score": 1.5,
            "match_percent": 15,
            "advantages": ["有经验"],
            "concerns": ["缺项"],
            "recommendation": "建议面试",
            "suggested_status": "talent_pool",
            "dimensions": dims,
        },
    }
    warnings = _validate_screening_payload_warnings(payload, SCREENING_PAYLOAD_SCHEMA_CONFIG)
    assert any("判断句" in w for w in warnings), "期望检测到伪 evidence"


def test_positive_score_empty_evidence_warns():
    dims = [_make_dim("自动化测试", 0.5, 0.5, "")]
    payload = {
        "parsed_resume": {
            "basic_info": {f: "" for f in ["name", "phone", "email", "years_of_experience", "education", "location"]},
            "work_experiences": [],
            "education_experiences": [],
            "skills": [],
            "projects": [],
            "summary": "",
        },
        "score": {
            "total_score": 0.5,
            "match_percent": 5,
            "advantages": ["有潜力"],
            "concerns": [],
            "recommendation": "建议面试",
            "suggested_status": "talent_pool",
            "dimensions": dims,
        },
    }
    warnings = _validate_screening_payload_warnings(payload, SCREENING_PAYLOAD_SCHEMA_CONFIG)
    assert any("evidence为空" in w for w in warnings), "期望检测到有分无证据"


def test_fail_close_downgrades_permissive_screening_passed():
    """P0-1：模型自报"总分9.9/匹配度99/通过"但维度得分只有 1 分时，
    总分与匹配度按维度重算，suggested_status 被 fail-closed 下调。"""
    schema_config = {
        "parsed_resume": SCREENING_PAYLOAD_SCHEMA_CONFIG["parsed_resume"],
        "score": {
            **SCREENING_PAYLOAD_SCHEMA_CONFIG["score"],
            "required_dimension_labels": ("IoT协议",),
            "status_thresholds": {"pass_threshold": 75.0, "pool_threshold": 55.0},
        },
    }
    payload = {
        "parsed_resume": _empty_parsed_resume(),
        "score": {
            "total_score": 9.9,
            "match_percent": 99,
            "advantages": ["看起来不错"],
            "concerns": ["核心能力欠缺"],
            "recommendation": "建议面试",
            "suggested_status": "screening_passed",
            "dimensions": [
                {"label": "IoT协议", "score": 1.0, "max_score": 10.0, "reason": "部分命中", "evidence": ["BLE 联调"], "is_inferred": False},
            ],
        },
    }
    sanitized, meta = sanitize_screening_payload(payload, schema_config)
    score = sanitized["score"]
    assert score["total_score"] == 1.0
    assert score["match_percent"] == 10
    assert score["suggested_status"] == "screening_rejected"
    assert meta["raw_model_suggested_status"] == "screening_passed"
    assert meta["normalized_final_suggested_status"] == "screening_rejected"
    assert any("已按确定性规则由 screening_passed 下调" in w for w in meta["warnings"])


def test_fail_close_keeps_stricter_model_status():
    """P0-1：模型比确定性推导更严格（分数够通过但模型判淘汰）时尊重模型判断，不上调。"""
    schema_config = {
        "parsed_resume": SCREENING_PAYLOAD_SCHEMA_CONFIG["parsed_resume"],
        "score": {
            **SCREENING_PAYLOAD_SCHEMA_CONFIG["score"],
            "required_dimension_labels": ("IoT协议",),
            "status_thresholds": {"pass_threshold": 75.0, "pool_threshold": 55.0},
        },
    }
    payload = {
        "parsed_resume": _empty_parsed_resume(),
        "score": {
            "total_score": 9.0,
            "match_percent": 90,
            "advantages": ["核心命中"],
            "concerns": ["稳定性存疑"],
            "recommendation": "建议淘汰",
            "suggested_status": "screening_rejected",
            "dimensions": [
                {"label": "IoT协议", "score": 9.0, "max_score": 10.0, "reason": "命中", "evidence": ["BLE 协议测试"], "is_inferred": False},
            ],
        },
    }
    sanitized, meta = sanitize_screening_payload(payload, schema_config)
    assert sanitized["score"]["suggested_status"] == "screening_rejected"
    assert not any("下调" in w for w in meta["warnings"])


def test_fail_close_blocks_pass_when_core_evidence_missing():
    """P0-1：核心维度无简历原文证据时，即使分数达标也不得 screening_passed。"""
    schema_config = {
        "parsed_resume": SCREENING_PAYLOAD_SCHEMA_CONFIG["parsed_resume"],
        "score": {
            **SCREENING_PAYLOAD_SCHEMA_CONFIG["score"],
            "required_dimension_labels": ("IoT协议",),
            "required_core_dimension_labels": ("IoT协议",),
            "status_thresholds": {"pass_threshold": 75.0, "pool_threshold": 55.0},
        },
    }
    payload = {
        "parsed_resume": _empty_parsed_resume(),
        "score": {
            "total_score": 8.0,
            "match_percent": 80,
            "advantages": ["核心命中"],
            "concerns": [],
            "recommendation": "建议面试",
            "suggested_status": "screening_passed",
            "dimensions": [
                {"label": "IoT协议", "score": 8.0, "max_score": 10.0, "reason": "推断命中", "evidence": [], "is_inferred": True},
            ],
        },
    }
    sanitized, meta = sanitize_screening_payload(payload, schema_config)
    assert sanitized["score"]["suggested_status"] == "talent_pool"
    assert meta["normalized_final_suggested_status"] == "talent_pool"
    assert any("核心维度缺少简历原文证据" in w for w in meta["warnings"])
