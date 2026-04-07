from app.services.recruitment_service_impl import (
    SCREENING_PAYLOAD_SCHEMA_CONFIG,
    _validate_screening_payload_warnings,
)


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
