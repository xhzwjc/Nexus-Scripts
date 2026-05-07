from app.services.recruitment_utils import extract_screening_dimension_rules


PROMPT_STYLE_IOT_SCREENING_SKILL = """你负责对 IoT测试工程师 / 软硬件测试工程师候选人做简历初筛评分。
事实来源：只能使用岗位 JD 原文、简历原文和系统传入的结构化信息；没有直接证据就判为简历未提及，不得虚构。
硬性规则：
1. 必须逐维度评分，不得跳过任何维度。
2. 智能家居生态和 IoT通信协议任一缺失时，concerns 不得为空，suggested_status 不得为 screening_passed。
3. 仅出现 OTA 升级专项测试时，嵌入式/固件经验最高只能给 0.4 分；只有出现固件刷写、串口、烧录、嵌入式调试等直接证据时，才能给 0.7 分以上。
评分维度与满分：
1. 智能家居生态：满分 2.5 分。核心第一优先，重点看米家、鸿蒙、HomeKit、涂鸦等真实联动测试经历。
2. IoT通信协议：满分 2.5 分。核心第一优先，重点看 Wi-Fi、BLE、ZigBee、Thread、MQTT、星闪等协议测试证据。
3. 软件测试基础：满分 1.5 分。重点看 App测试、接口测试、用例设计、缺陷定位与测试方案能力。
4. 嵌入式/固件经验：满分 1.0 分。重点看 OTA、固件升级验证、串口、烧录、嵌入式调试等直接证据。
5. 硬件测试经验：满分 1.0 分。重点看真实设备上手测试、问题复现、系统联调，不要求仪器操作深度。
6. 自动化测试：满分 0.5 分。重点看 Appium、Python、Selenium、Requests 或其他自动化测试经验。
7. 学历/专业匹配：满分 0.5 分。重点看本科及以上，以及计算机、电子、自动化、软件工程等相关专业。
8. 文档输出能力：满分 0.3 分。重点看测试报告、缺陷报告、测试用例、复盘文档等证据。
9. 加分项：满分 0.2 分。重点看头部企业、Linux/Shell、功耗/射频、CI/CD、认证、AI工具使用。
判定规则：
- total_score 必须等于所有维度分数之和。
- advantages 只能来自得分大于 0 的维度。
- concerns 只能来自低分、零分或核心缺口维度。
"""


def test_extract_screening_dimension_rules_supports_prompt_style_skill():
    rules = extract_screening_dimension_rules([{"content": PROMPT_STYLE_IOT_SCREENING_SKILL}])

    assert [item["label"] for item in rules] == [
        "智能家居生态",
        "IoT通信协议",
        "软件测试基础",
        "嵌入式/固件经验",
        "硬件测试经验",
        "自动化测试",
        "学历/专业匹配",
        "文档输出能力",
        "加分项",
    ]
    assert [item["max_score"] for item in rules] == [2.5, 2.5, 1.5, 1.0, 1.0, 0.5, 0.5, 0.3, 0.2]
    assert rules[0]["is_core"] is True
    assert rules[1]["is_core"] is True
