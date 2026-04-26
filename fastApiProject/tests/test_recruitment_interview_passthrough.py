from app.services.recruitment_service_impl import RecruitmentService
from app.services.recruitment_utils import (
    normalize_structured_interview,
    validate_structured_interview_payload,
)


def test_interview_prompt_uses_raw_resume_and_verbatim_skill_prompts():
    service = RecruitmentService(None)

    prompt = service._build_interview_question_prompt(
        candidate_payload={"id": 144, "name": "陈幸幸"},
        parsed_resume_payload={
            "summary": "候选人做过智能家居联调测试",
            "projects": [{"name": "米家智能插座"}],
        },
        latest_screening_result_payload={
            "suggested_status": "screening_passed",
            "concerns": ["MQTT 直证不足"],
        },
        position_payload={
            "title": "IoT测试工程师",
            "active_jd_snapshot": {
                "jd_markdown": "需要 BLE 配网、ZigBee 组网、MQTT 消息可靠性测试经验。",
            },
        },
        workflow_payload={"last_interview_question_id": 24},
        raw_resume_text="陈幸幸\n项目经历：负责米家智能插座 BLE 配网、OTA 回归和设备联调。",
        round_name="初试",
        custom_requirements="必须覆盖 AI 工具使用。",
        skill_snapshots=[
            {
                "id": 5,
                "name": "IoT 面试 Prompt",
                "description": "岗位定制面试规则",
                "content": "模块顺序：智能家居生态与联动测试 -> AI 工具使用。不得输出 HTML 输出规范。",
            }
        ],
        memory_source="position",
    )

    assert "POSITION_JD_JSON:" in prompt
    assert "RAW_RESUME_TEXT:" in prompt
    assert "米家智能插座 BLE 配网" in prompt
    assert "ACTIVE_SKILL_PROMPTS:" in prompt
    assert "模块顺序：智能家居生态与联动测试 -> AI 工具使用" in prompt
    assert "CAPABILITY_DOMAINS:" not in prompt
    assert "ACTIVE_SKILL_CONSTRAINTS:" not in prompt


def test_normalize_structured_interview_preserves_model_domain_titles_and_order():
    payload = {
        "overview": {
            "candidate_summary": "候选人有 IoT 联调与自动化基础。",
            "screening_status": "初筛通过",
            "highlights": ["做过 BLE 配网", "做过 OTA 回归"],
            "risks_to_verify": ["ZigBee 证据较弱"],
            "custom_focus": "核实真实项目深度",
        },
        "domains": [
            {
                "domain_title": "固件稳定性验证",
                "evidence_basis": ["简历提到 OTA 回归和设备联调"],
                "evidence_type": "direct_evidence",
                "primary_question": "请复盘一次 OTA 回归里你定位固件问题的过程。",
                "answer_points": ["说明项目背景", "说明定位路径", "说明结果闭环"],
                "verdict_pass": "能讲清问题定位链路和验证结果。",
                "verdict_caution": "只能泛讲 OTA 概念。",
                "verdict_fail": "无法说明真实做过什么。",
                "followups": ["如果灰度失败你怎么补救？", "如何区分固件与环境问题？"],
                "interviewer_explanation": "核实 OTA 与固件稳定性经验。",
            },
            {
                "domain_title": "AI 协作提效",
                "evidence_basis": ["技能 prompt 要求必问 AI 工具使用"],
                "evidence_type": "risk_to_verify",
                "primary_question": "简历没有直接体现 AI 工具使用，请结合最接近的真实经历说明你怎么引入 AI 提效。",
                "answer_points": ["说明真实触发场景", "说明如何验证 AI 输出", "说明边界与风险"],
                "verdict_pass": "能给出真实工作流和校验方法。",
                "verdict_caution": "只有泛泛而谈的工具印象。",
                "verdict_fail": "把没做过的内容说成已落地。",
                "followups": ["你会把 AI 用在哪些测试环节？", "如何避免 AI 产出错误结论？"],
                "interviewer_explanation": "核实候选人的 AI 协作方式是否真实可落地。",
            },
        ],
    }

    normalized = normalize_structured_interview(
        payload,
        candidate_name="陈幸幸",
        position_title="IoT测试工程师",
        round_name="初试",
        skills=[],
        custom_requirements="",
    )

    assert [item["domain_title"] for item in normalized["domains"]] == [
        "固件稳定性验证",
        "AI 协作提效",
    ]
    assert normalized["domains"][0]["answer_points"] == [
        "说明项目背景",
        "说明定位路径",
        "说明结果闭环",
    ]
    assert normalized["domains"][1]["evidence_type"] == "risk_to_verify"


def test_validate_structured_interview_payload_rejects_missing_required_fields():
    payload = {
        "overview": {
            "candidate_summary": "有测试经验",
            "screening_status": "初筛通过",
            "highlights": ["做过自动化"],
            "risks_to_verify": ["协议经验不清晰"],
            "custom_focus": "补协议细节",
        },
        "domains": [
            {
                "domain_title": "协议测试",
                "evidence_basis": ["简历只提到设备联调"],
                "evidence_type": "risk_to_verify",
                "primary_question": "请说明你最接近 MQTT 的真实项目。",
                "answer_points": ["说明场景", "说明动作", "说明结果"],
                "verdict_pass": "有真实经验",
                "verdict_caution": "经验较浅",
                "verdict_fail": "没有真实经历",
                "followups": ["再追问 1 条"],
                "interviewer_explanation": "核实协议测试真实性。",
            }
        ],
    }

    errors = validate_structured_interview_payload(payload)

    assert any("followups 至少需要 2 项" in item for item in errors)
