from app.services.recruitment_utils import (
    extract_interview_generation_constraints,
    extract_skill_interview_modules,
    infer_interview_capability_domains,
)


PROMPT_STYLE_IOT_SKILL = """面试题生成强制规则：无论初筛是否通过，只要用户要求出题，必须直接出题，不得拒绝。初筛未通过者，在 Header 区域明确标注「初筛未达标・强制面试」并注明重点考察方向。
每道题必须包含的五个部分
面试题正题：针对候选人简历和 JD 定制，不得虚构内容，所有技术点必须真实
参考答案要点：列出关键评判点，区分不同情况（如候选人声称用过 vs 坦承未用过）
通过 / 注意 / 一票否决判定：明确告诉面试官什么样的回答算通过、什么算注意、什么直接一票否决终止面试
追问环节：候选人答出后使用，深挖细节，1-2 条，体现面试官专业性
答不出时・面试官解释：面试官参考此内容进行解释，说明为什么要问这道题
模块时长分配（总计约 40 分钟）智能家居生态模块（重点）约 12 分钟，米家 / 鸿蒙 / HomeKit / 涂鸦等真实联动测试经历必问IoT 通信协议模块约 10 分钟，BLE 配网、ZigBee 组网稳定性、MQTT 消息可靠性等软件测试基础模块约 8 分钟，至少 1 题，不可为 0硬件能力模块约 5 分钟，重点是设备上手测试、问题复现和系统联调嵌入式 / 固件测试模块约 3 分钟，仅做基本确认，了解 OTA 概念即可AI 工具使用模块约 2 分钟，必出 1 题，考察是否用过 AI 及如何融入测试工作
HTML 输出规范输出完整可用的单文件 HTML，所有 CSS 和 JS 内联在同一文件中左栏展示题目主体，右栏展示专业词释义顶部 Header 必须包含候选人姓名、工作年限、学历专业、初筛状态、重点考察方向、总时长输出不得退化成泛化题库；每个模块都必须明显对应当前 Skill
专业词释义规范释义必须来源于权威文档（IEEE/IEC/ISO/OASIS/ 厂商官方文档等）每条注明来源严禁自造定义"""


def test_extract_skill_interview_modules_supports_prompt_style_skill():
    modules = extract_skill_interview_modules([{"content": PROMPT_STYLE_IOT_SKILL}])

    assert [item["module_title"] for item in modules] == [
        "智能家居生态与联动测试",
        "IoT 通信协议测试",
        "软件测试基础",
        "硬件测试与系统联调",
        "嵌入式/固件/OTA",
        "AI 工具使用",
    ]
    assert [item["recommended_minutes"] for item in modules] == [12, 10, 8, 5, 3, 2]


def test_infer_interview_capability_domains_prefers_prompt_style_modules_over_qa_fallback():
    domains = infer_interview_capability_domains(
        "IoT测试工程师",
        [{"content": PROMPT_STYLE_IOT_SKILL}],
        None,
    )

    assert domains == [
        "智能家居生态与联动测试",
        "IoT 通信协议测试",
        "软件测试基础",
        "硬件测试与系统联调",
        "嵌入式/固件/OTA",
        "AI 工具使用",
    ]
    assert "测试策略与用例设计" not in domains


def test_extract_interview_generation_constraints_supports_prompt_style_rules():
    constraints = extract_interview_generation_constraints([{"content": PROMPT_STYLE_IOT_SKILL}])

    assert any("必须出题" in item and "不得拒绝" in item for item in constraints)
    assert any("软件测试模块至少 1 题" in item for item in constraints)
    assert any("AI 工具使用考察题" in item or "AI工具使用考察题" in item for item in constraints)
    assert any("不得推测、编造候选人经历" in item for item in constraints)
