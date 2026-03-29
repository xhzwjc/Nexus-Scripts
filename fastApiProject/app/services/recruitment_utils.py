from __future__ import annotations

import html
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import pypdfium2 as pdfium

FASTAPI_ROOT = Path(__file__).resolve().parents[2]
RECRUITMENT_UPLOAD_ROOT = FASTAPI_ROOT / "data" / "recruitment_uploads" / "resumes"
CHAT_CONTEXT_STORE: Dict[str, Dict[str, Any]] = {}

CANDIDATE_STATUS_OPTIONS = [
    {"value": "new_imported", "label": "新导入"},
    {"value": "pending_screening", "label": "待初筛"},
    {"value": "screening_passed", "label": "初筛通过"},
    {"value": "screening_rejected", "label": "初筛淘汰"},
    {"value": "pending_interview", "label": "待面试"},
    {"value": "interview_passed", "label": "面试通过"},
    {"value": "interview_rejected", "label": "面试淘汰"},
    {"value": "pending_offer", "label": "待 Offer"},
    {"value": "offer_sent", "label": "已发 Offer"},
    {"value": "hired", "label": "已入职"},
    {"value": "talent_pool", "label": "人才库"},
]

POSITION_STATUS_OPTIONS = [
    {"value": "draft", "label": "草稿"},
    {"value": "recruiting", "label": "招聘中"},
    {"value": "paused", "label": "暂停中"},
    {"value": "closed", "label": "已关闭"},
]

DEFAULT_RULE_CONFIGS = {
    "resume_score_weights": {
        "experience": 0.25,
        "skills": 0.35,
        "education": 0.15,
        "stability": 0.10,
        "communication": 0.15,
    },
    "resume_disqualifiers": {"keywords": ["频繁跳槽", "履历造假", "无法到岗"]},
    "default_jd_template": {"sections": ["岗位概述", "岗位职责", "任职要求", "加分项"]},
    "default_interview_template": {"sections": ["技术题", "场景题", "行为题"]},
    "default_status_rules": {"pass_threshold": 75, "pool_threshold": 55},
}

IOT_INTERVIEW_CAPABILITY_DOMAINS = [
    "智能家居生态与联动测试",
    "IoT 通信协议测试",
    "软件测试基础",
    "硬件测试与系统联调",
    "嵌入式/固件/OTA",
    "AI 工具使用",
    "综合匹配度与转型意愿",
]

INTERVIEW_RULE_LEAK_MARKERS = (
    "全程铁律",
    "强制出题",
    "软件测试不为零",
    "ai工具必出",
    "规则变更原则",
    "模块二：面试题生成",
    "触发方式",
    "html 输出规范",
    "输出规范",
    "系统强制指令",
    "本轮 skill 关注点",
)

INTERVIEW_DOMAIN_KEYWORDS = {
    "智能家居生态与联动测试": ["智能家居", "米家", "homekit", "鸿蒙", "涂鸦", "联动", "互联互通", "门锁", "灯具", "网关", "app", "小程序"],
    "IoT 通信协议测试": ["iot", "wi-fi", "wifi", "ble", "蓝牙", "zigbee", "thread", "mqtt", "星闪", "配网", "组网", "协议", "uwb"],
    "软件测试基础": ["测试用例", "功能测试", "回归测试", "接口测试", "app测试", "app 测试", "缺陷", "bug", "jira", "postman", "apifox", "charles", "测试方案", "测试指导书", "自动化测试"],
    "硬件测试与系统联调": ["硬件", "联调", "系统联调", "设备", "整机", "稳定性", "可靠性", "电源", "串口", "问题复现", "cadence", "pads", "pcb", "buck", "boost", "ldo", "信号"],
    "嵌入式/固件/OTA": ["嵌入式", "固件", "ota", "烧录", "升级", "bootloader", "版本回退", "日志抓取"],
    "AI 工具使用": ["ai", "gpt", "claude", "copilot", "cursor", "prompt", "大模型", "自动生成用例"],
    "综合匹配度与转型意愿": ["转型", "匹配度", "职业规划", "岗位理解", "稳定", "沟通", "协作", "成长"],
}

INTERVIEW_DOMAIN_GUIDANCE = {
    "智能家居生态与联动测试": {
        "nature": "死穴验证区",
        "minutes": 12,
        "focus": "真实联动链路、设备生态、观察指标、问题闭环",
        "followups": [
            "如果同一设备在两个生态里表现不一致，你会先比对哪几类日志或观测点？",
            "联动偶现失败时，你如何区分是设备端、云端、协议层还是 App 编排问题？",
        ],
        "explain": "用于验证候选人是否真正做过智能家居生态联动测试，而不是只停留在单点功能验证。",
    },
    "IoT 通信协议测试": {
        "nature": "重点验证区",
        "minutes": 10,
        "focus": "协议场景、抓包/日志、异常注入、消息可靠性",
        "followups": [
            "如果配网成功率波动，你会如何拆分协议、环境和设备状态三个排查面？",
            "遇到消息丢失或重复上报时，你会如何设计复现步骤和验收标准？",
        ],
        "explain": "用于验证候选人对 IoT 协议测试的真实理解深度，而不是只会罗列协议名称。",
    },
    "软件测试基础": {
        "nature": "基本功验证",
        "minutes": 8,
        "focus": "测试设计、边界覆盖、缺陷定位、回归闭环",
        "followups": [
            "如果这次回归时间被压缩一半，你会如何保留最关键的回归集合？",
            "当研发认为问题无法复现时，你会如何组织证据推动问题闭环？",
        ],
        "explain": "用于验证候选人是否具备稳定的软件测试基本功，这一项不能被硬件或协议经历替代。",
    },
    "硬件测试与系统联调": {
        "nature": "核心强项",
        "minutes": 5,
        "focus": "设备上手、系统联调、问题复现、跨团队协作",
        "followups": [
            "如果问题只在特定批次设备出现，你会如何缩小硬件差异与软件版本差异的范围？",
            "联调阶段研发、硬件、测试结论不一致时，你会如何推进统一结论？",
        ],
        "explain": "用于验证候选人是否能在真实设备环境里推进系统联调，而不是只会看软件表象。",
    },
    "嵌入式/固件/OTA": {
        "nature": "边界核实",
        "minutes": 3,
        "focus": "版本升级链路、异常回退、日志抓取、风险控制",
        "followups": [
            "如果 OTA 升级失败率突然上升，你会先排查升级包、设备状态还是网络条件？为什么？",
            "你会如何验证一次固件升级既成功又没有引入隐性回归？",
        ],
        "explain": "用于验证候选人对固件和 OTA 风险的基本认知，重点看是否理解升级链路与验证闭环。",
    },
    "AI 工具使用": {
        "nature": "加分项",
        "minutes": 2,
        "focus": "AI 工具落地场景、质量校验、提示词设计、效率收益",
        "followups": [
            "如果 AI 生成的用例明显不贴合设备场景，你会如何修正提示词和验收规则？",
            "你如何确保 AI 提升效率的同时，不把错误带进测试结论？",
        ],
        "explain": "用于验证候选人是否真正把 AI 工具融入测试工作流，而不是停留在概念层面。",
    },
    "综合匹配度与转型意愿": {
        "nature": "匹配校准",
        "minutes": 5,
        "focus": "岗位理解、优势短板、转型动机、稳定性预期",
        "followups": [
            "如果入职后前两个月发现工作重心和预期不同，你会如何调适并保证交付？",
            "这份岗位最吸引你和最让你担心的部分分别是什么？",
        ],
        "explain": "用于验证候选人与岗位方向的真实匹配度，以及后续稳定投入的可能性。",
    },
}


def _load_recruitment_skill_template(file_name: str) -> str:
    template_path = FASTAPI_ROOT / "app" / "recruitment_skill_templates" / file_name
    return template_path.read_text(encoding="utf-8")


DEFAULT_SKILLS = [
    {
        "skill_code": "skill-testing-rule",
        "name": "测试岗位评分规则",
        "description": "适用于 QA、IoT 测试、系统测试岗位的统一筛选与评分规则。",
        "content": "优先关注测试基础、问题定位能力、跨团队协作与稳定交付记录；所有评分结论都必须能回溯到简历原文。",
        "tags": ["测试", "评分规则"],
        "sort_order": 10,
    },
    {
        "skill_code": "skill-interview-structure",
        "name": "结构化面试模板",
        "description": "用于生成技术题、场景题、行为题与追问框架。",
        "content": "出题时默认覆盖技术能力、真实项目经历、问题拆解方式、协作沟通与复盘意识，并保留至少一个可深挖追问点。",
        "tags": ["面试", "模板"],
        "sort_order": 20,
    },
    {
        "skill_code": "skill-iot-screening-score",
        "name": "IoT 测试工程师初筛评分 Skill",
        "description": "针对 IoT/软硬件测试工程师招聘的专用简历初筛评分 Skill。",
        "content": _load_recruitment_skill_template("iot_screening_score_skill.md"),
        "tags": ["IoT", "测试", "招聘", "智能家居", "初筛", "评分", "screening"],
        "sort_order": 30,
    },
    {
        "skill_code": "skill-iot-interview-question",
        "name": "IoT 测试工程师面试题 Skill",
        "description": "针对 IoT/软硬件测试工程师招聘的专用面试题生成 Skill。",
        "content": _load_recruitment_skill_template("iot_interview_question_skill.md"),
        "tags": ["IoT", "测试", "招聘", "智能家居", "面试", "出题", "interview"],
        "sort_order": 31,
    },
]

KNOWN_SKILLS = [
    "python", "java", "go", "javascript", "typescript", "sql", "linux", "docker", "k8s",
    "selenium", "playwright", "pytest", "jmeter", "postman", "api", "iot", "测试", "自动化",
    "性能", "嵌入式", "网络", "web", "app", "git", "质量", "需求分析", "沟通",
    "硬件", "硬件测试", "软硬件", "电子", "固件", "驱动", "设备", "可靠性", "稳定性",
]


def json_loads_safe(value: Optional[str], default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def json_dumps_safe(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def isoformat_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def truncate_text(value: Any, limit: int = 500) -> str:
    text = value if isinstance(value, str) else json_dumps_safe(value)
    return text if len(text) <= limit else f"{text[:limit]}..."


def markdown_to_html(markdown: str) -> str:
    parts: List[str] = []
    list_mode: Optional[str] = None
    for raw_line in (markdown or "").splitlines():
        line = raw_line.strip()
        if not line:
            if list_mode == "ul":
                parts.append("</ul>")
                list_mode = None
            elif list_mode == "ol":
                parts.append("</ol>")
                list_mode = None
            continue
        if line.startswith("### "):
            if list_mode == "ul":
                parts.append("</ul>")
                list_mode = None
            elif list_mode == "ol":
                parts.append("</ol>")
                list_mode = None
            parts.append(f"<h3>{html.escape(line[4:])}</h3>")
        elif line.startswith("## "):
            if list_mode == "ul":
                parts.append("</ul>")
                list_mode = None
            elif list_mode == "ol":
                parts.append("</ol>")
                list_mode = None
            parts.append(f"<h2>{html.escape(line[3:])}</h2>")
        elif line.startswith("# "):
            if list_mode == "ul":
                parts.append("</ul>")
                list_mode = None
            elif list_mode == "ol":
                parts.append("</ol>")
                list_mode = None
            parts.append(f"<h1>{html.escape(line[2:])}</h1>")
        elif line.startswith("- "):
            if list_mode == "ol":
                parts.append("</ol>")
                list_mode = None
            if list_mode != "ul":
                parts.append("<ul>")
                list_mode = "ul"
            parts.append(f"<li>{html.escape(line[2:])}</li>")
        elif re.match(r"^\d+[.)]\s+", line):
            if list_mode == "ul":
                parts.append("</ul>")
                list_mode = None
            if list_mode != "ol":
                parts.append("<ol>")
                list_mode = "ol"
            parts.append(f"<li>{html.escape(re.sub(r'^\d+[.)]\s+', '', line))}</li>")
        else:
            if list_mode == "ul":
                parts.append("</ul>")
                list_mode = None
            elif list_mode == "ol":
                parts.append("</ol>")
                list_mode = None
            parts.append(f"<p>{html.escape(line)}</p>")
    if list_mode == "ul":
        parts.append("</ul>")
    elif list_mode == "ol":
        parts.append("</ol>")
    return "".join(parts)


def looks_like_full_html_document(value: str) -> bool:
    text = str(value or "").lstrip().lower()
    return text.startswith("<!doctype html") or text.startswith("<html")


def build_single_file_html_document(title: str, body_html: str) -> str:
    safe_title = html.escape(title or "Interview Questions")
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{safe_title}</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #475569;
      --border: #dbe4f0;
      --accent: #0f172a;
      --soft: #eef4ff;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
      background: linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
      color: var(--text);
    }}
    main {{
      max-width: 1120px;
      margin: 0 auto;
      padding: 28px 20px 48px;
    }}
    article {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 28px 28px 12px;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
    }}
    h1, h2, h3 {{
      color: var(--accent);
      margin: 0 0 14px;
      line-height: 1.35;
    }}
    h1 {{
      font-size: 28px;
      margin-bottom: 20px;
    }}
    h2 {{
      font-size: 20px;
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }}
    h3 {{
      font-size: 16px;
      margin-top: 20px;
    }}
    p, li {{
      font-size: 14px;
      line-height: 1.9;
      color: var(--text);
    }}
    p {{
      margin: 0 0 12px;
    }}
    ul, ol {{
      margin: 0 0 14px 20px;
      padding: 0;
    }}
    li + li {{
      margin-top: 6px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 18px;
      font-size: 13px;
    }}
    th, td {{
      border: 1px solid var(--border);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }}
    th {{
      background: var(--soft);
      color: var(--accent);
    }}
    blockquote {{
      margin: 14px 0;
      padding: 12px 14px;
      border-left: 4px solid #94a3b8;
      background: #f8fafc;
      color: var(--muted);
    }}
    .hint {{
      color: var(--muted);
      font-size: 12px;
    }}
    @media (max-width: 768px) {{
      main {{ padding: 16px 12px 32px; }}
      article {{ padding: 18px 16px 8px; border-radius: 18px; }}
      h1 {{ font-size: 22px; }}
      h2 {{ font-size: 18px; }}
    }}
  </style>
</head>
<body>
  <main>
    <article>
      {body_html}
    </article>
  </main>
</body>
</html>"""


def ensure_interview_html_document(title: str, html_content: str = "", markdown_content: str = "") -> str:
    if looks_like_full_html_document(html_content):
        return html_content
    body_html = str(html_content or "").strip() or markdown_to_html(markdown_content or "")
    return build_single_file_html_document(title, body_html)


def strip_markdown(markdown: str) -> str:
    text = (markdown or "").replace("\r\n", "\n")
    text = re.sub(r"^\s*---+\s*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-*+]\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"__(.*?)__", r"\1", text)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_jd_text_block(value: Any) -> str:
    text = strip_markdown(str(value or "")).strip()
    lines = [line.strip() for line in text.splitlines()]
    cleaned: List[str] = []
    lead_patterns = (
        r"^(\u597d\u7684[\uff0c,]?\s*)",
        r"^(\u5f53\u7136[\uff0c,]?\s*)",
        r"^(\u4ee5\u4e0b\u662f[\uff1a: ]*)",
        r"^(\u4e0b\u9762\u662f[\uff1a: ]*)",
        r"^(\u8fd9\u662f[\u4e00\u4efd\u4e2a\u6761]?[\uff1a: ]*)",
        r"^(\u8fd9\u662f\u4e00\u4efd[\uff1a: ]*)",
        r"^(\u6839\u636e\u60a8\u63d0\u4f9b\u7684\u4fe1\u606f[\uff0c,]?\s*)",
        r"^(\u57fa\u4e8e\u60a8\u63d0\u4f9b\u7684\u4fe1\u606f[\uff0c,]?\s*)",
        r"^(\u6211\u4e3a\u60a8\u6574\u7406\u4e86[\uff1a: ]*)",
    )
    for index, line in enumerate(lines):
        current = line
        if index == 0:
            for pattern in lead_patterns:
                current = re.sub(pattern, "", current, flags=re.IGNORECASE)
        current = current.strip("\uff1a: ")
        if current:
            cleaned.append(current)
    return "\n".join(cleaned).strip()


def normalize_jd_list(value: Any) -> List[str]:
    if isinstance(value, list):
        items = value
    else:
        raw = normalize_jd_text_block(value)
        items = re.split(r"(?:\n+|[\uff1b;])", raw)

    normalized: List[str] = []
    excluded_markers = [
        "简历筛选",
        "初筛结果",
        "筛选结果",
        "招聘流程",
        "最终结论",
        "发送简历",
        "招聘助手",
    ]
    for item in items:
        text = normalize_jd_text_block(item).strip()
        text = re.sub(r"^[0-9]+[.)\u3001]\s*", "", text)
        if text and not any(marker in text for marker in excluded_markers):
            normalized.append(text)
    return normalized


def build_jd_structured_fallback(position: Any) -> Dict[str, Any]:
    title = position.title
    work_location = position.location or "\u9762\u8bae"
    salary_range = position.salary_range or "\u9762\u8bae"
    department = position.department or "\u76f8\u5173\u4e1a\u52a1\u56e2\u961f"
    office_location = position.location or "\u6307\u5b9a\u529e\u516c\u5730\u70b9"
    return {
        "job_title": title,
        "department": department,
        "work_location": work_location,
        "salary_range": salary_range,
        "headcount": f"{getattr(position, 'headcount', 1) or 1}\u4eba",
        "job_overview": (
            f"\u6211\u4eec\u6b63\u5728\u5bfb\u627e\u4e00\u4f4d\u80fd\u591f\u652f\u6491\u6838\u5fc3\u4e1a\u52a1\u4ea4\u4ed8\u7684 {title}\uff0c"
            f"\u52a0\u5165 {department}\uff0c"
            f"\u5728 {office_location} \u63a8\u52a8\u5c97\u4f4d\u76ee\u6807\u843d\u5730\u3002"
        ),
        "responsibilities": [
            f"\u8d1f\u8d23 {title} \u76f8\u5173\u5de5\u4f5c\u7684\u89c4\u5212\u3001\u6267\u884c\u4e0e\u7ed3\u679c\u4ea4\u4ed8\u3002",
            "\u4e0e\u4ea7\u54c1\u3001\u7814\u53d1\u3001\u6d4b\u8bd5\u6216\u4e1a\u52a1\u56e2\u961f\u534f\u540c\u63a8\u8fdb\u91cd\u70b9\u4e8b\u9879\u843d\u5730\u3002",
            "\u6301\u7eed\u6c89\u6dc0\u65b9\u6cd5\u8bba\u4e0e\u590d\u7528\u7ecf\u9a8c\uff0c\u63d0\u5347\u56e2\u961f\u6574\u4f53\u6548\u7387\u4e0e\u8d28\u91cf\u3002",
        ],
        "requirements": [
            normalize_jd_text_block(position.key_requirements or "\u5177\u5907\u4e0e\u5c97\u4f4d\u76f8\u5339\u914d\u7684\u4e13\u4e1a\u7ecf\u9a8c\u4e0e\u6267\u884c\u80fd\u529b\u3002"),
            "\u5177\u5907\u826f\u597d\u7684\u6c9f\u901a\u534f\u4f5c\u80fd\u529b\uff0c\u80fd\u591f\u72ec\u7acb\u63a8\u8fdb\u590d\u6742\u4e8b\u9879\u3002",
            "\u7ed3\u679c\u5bfc\u5411\uff0c\u80fd\u591f\u517c\u987e\u9879\u76ee\u8fdb\u5ea6\u3001\u98ce\u9669\u8bc6\u522b\u4e0e\u4ea4\u4ed8\u8d28\u91cf\u3002",
        ],
        "bonus_points": normalize_jd_list(position.bonus_points or "\u5177\u5907\u884c\u4e1a\u9879\u76ee\u7ecf\u9a8c\u3001\u81ea\u52a8\u5316\u5efa\u8bbe\u7ecf\u9a8c\u6216\u8de8\u56e2\u961f\u534f\u4f5c\u7ecf\u9a8c\u8005\u4f18\u5148\u3002"),
    }


def normalize_structured_jd(payload: Dict[str, Any], position: Any) -> Dict[str, Any]:
    fallback = build_jd_structured_fallback(position)
    return {
        "job_title": normalize_jd_text_block(payload.get("job_title") or payload.get("title") or fallback["job_title"]),
        "department": normalize_jd_text_block(payload.get("department") or fallback["department"]),
        "work_location": normalize_jd_text_block(payload.get("work_location") or payload.get("location") or fallback["work_location"]),
        "salary_range": normalize_jd_text_block(payload.get("salary_range") or fallback["salary_range"]),
        "headcount": normalize_jd_text_block(payload.get("headcount") or fallback["headcount"]),
        "job_overview": normalize_jd_text_block(payload.get("job_overview") or payload.get("job_description") or payload.get("summary") or fallback["job_overview"]),
        "responsibilities": normalize_jd_list(payload.get("responsibilities") or fallback["responsibilities"]),
        "requirements": normalize_jd_list(payload.get("requirements") or fallback["requirements"]),
        "bonus_points": normalize_jd_list(payload.get("bonus_points") or fallback["bonus_points"]),
    }


def render_publish_ready_jd(jd_payload: Dict[str, Any]) -> str:
    title = normalize_jd_text_block(jd_payload.get("job_title") or jd_payload.get("title") or "")
    department = normalize_jd_text_block(jd_payload.get("department") or "")
    location = normalize_jd_text_block(jd_payload.get("work_location") or jd_payload.get("location") or "")
    salary = normalize_jd_text_block(jd_payload.get("salary_range") or "")
    headcount = normalize_jd_text_block(jd_payload.get("headcount") or "")
    responsibilities = normalize_jd_list(jd_payload.get("responsibilities") or [])
    requirements = normalize_jd_list(jd_payload.get("requirements") or [])
    bonus_points = normalize_jd_list(jd_payload.get("bonus_points") or [])

    blocks: List[str] = []
    if title:
        blocks.append(f"\u5c97\u4f4d\u540d\u79f0\uff1a{title}")
    if department:
        blocks.append(f"\u90e8\u95e8\uff1a{department}")
    if location:
        blocks.append(f"\u5de5\u4f5c\u5730\u70b9\uff1a{location}")
    if salary:
        blocks.append(f"\u85aa\u8d44\u8303\u56f4\uff1a{salary}")
    if headcount:
        blocks.append(f"\u62db\u8058\u4eba\u6570\uff1a{headcount}")
    if responsibilities:
        blocks.append("\u4e00\uff0e\u5c97\u4f4d\u804c\u8d23\n" + "\n".join(f"{index + 1}. {item}" for index, item in enumerate(responsibilities)))
    if requirements:
        blocks.append("\u4e8c\uff0e\u4efb\u804c\u8981\u6c42\n" + "\n".join(f"{index + 1}. {item}" for index, item in enumerate(requirements)))
    if bonus_points:
        blocks.append("\u4e09\uff0e\u52a0\u5206\u9879\n" + "\n".join(f"{index + 1}. {item}" for index, item in enumerate(bonus_points)))
    return "\n\n".join(blocks).strip()


def render_jd_markdown_source(jd_payload: Dict[str, Any]) -> str:
    title = normalize_jd_text_block(jd_payload.get("job_title") or jd_payload.get("title") or "")
    department = normalize_jd_text_block(jd_payload.get("department") or "")
    location = normalize_jd_text_block(jd_payload.get("work_location") or jd_payload.get("location") or "")
    salary = normalize_jd_text_block(jd_payload.get("salary_range") or "")
    headcount = normalize_jd_text_block(jd_payload.get("headcount") or "")
    responsibilities = normalize_jd_list(jd_payload.get("responsibilities") or [])
    requirements = normalize_jd_list(jd_payload.get("requirements") or [])
    bonus_points = normalize_jd_list(jd_payload.get("bonus_points") or [])

    sections: List[str] = []
    if title:
        sections.append(f"# {title}")
    meta_lines: List[str] = []
    if department:
        meta_lines.append(f"**部门**：{department}")
    if location:
        meta_lines.append(f"**工作地点**：{location}")
    if salary:
        meta_lines.append(f"**薪资范围**：{salary}")
    if headcount:
        meta_lines.append(f"**招聘人数**：{headcount}")
    if meta_lines:
        sections.append("\n".join(meta_lines))
    if responsibilities:
        sections.append("## 一．岗位职责\n" + "\n".join(f"{index + 1}. {item}" for index, item in enumerate(responsibilities)))
    if requirements:
        sections.append("## 二．任职要求\n" + "\n".join(f"{index + 1}. {item}" for index, item in enumerate(requirements)))
    if bonus_points:
        sections.append("## 三．加分项\n" + "\n".join(f"{index + 1}. {item}" for index, item in enumerate(bonus_points)))
    return "\n\n".join(section for section in sections if section).strip()


def safe_file_stem(file_name: str) -> str:
    stem = Path(file_name).stem
    stem = re.sub(r"[_\-]+", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip()
    return stem or "未命名候选人"


def extract_text_from_docx(file_path: Path) -> str:
    with zipfile.ZipFile(file_path) as archive:
        xml_bytes = archive.read("word/document.xml")
    root = ET.fromstring(xml_bytes)
    chunks = [node.text.strip() for node in root.iter() if node.tag.endswith("}t") and node.text and node.text.strip()]
    return "\n".join(chunks)


def extract_text_from_pdf(file_path: Path) -> str:
    document = pdfium.PdfDocument(str(file_path))
    chunks: List[str] = []
    for index in range(len(document)):
        page = document[index]
        text_page = page.get_textpage()
        try:
            chunks.append(text_page.get_text_range())
        finally:
            try:
                text_page.close()
            except Exception:
                pass
            try:
                page.close()
            except Exception:
                pass
    try:
        document.close()
    except Exception:
        pass
    return "\n".join(chunk for chunk in chunks if chunk).strip()


def extract_resume_text(file_path: Path, file_ext: str) -> str:
    ext = (file_ext or file_path.suffix or "").lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    if ext == ".docx":
        return extract_text_from_docx(file_path)
    return file_path.read_text(encoding="utf-8", errors="ignore")


def extract_keywords(text: str) -> List[str]:
    tokens = re.split(r"[\s,，。；;、|/]+", (text or "").lower())
    result: List[str] = []
    for token in tokens:
        normalized = token.strip()
        if len(normalized) >= 2 and normalized not in result:
            result.append(normalized)
    return result[:20]


def extract_basic_info(raw_text: str, fallback_name: str) -> Dict[str, Any]:
    phone_match = re.search(r"(?<!\d)1[3-9]\d{9}(?!\d)", raw_text)
    email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", raw_text)
    name_match = re.search(r"(?:姓名|Name)[:：\s]+([^\n]{2,20})", raw_text, re.IGNORECASE)
    years_match = re.search(r"(\d{1,2})\s*年", raw_text)
    education = "未知"
    for keyword in ["博士", "硕士", "本科", "大专", "高中"]:
        if keyword in raw_text:
            education = keyword
            break
    return {
        "name": (name_match.group(1).strip() if name_match else "") or fallback_name,
        "phone": phone_match.group(0) if phone_match else "",
        "email": email_match.group(0) if email_match else "",
        "years_of_experience": years_match.group(1) + "年" if years_match else "",
        "education": education,
    }


def extract_resume_structured_data(raw_text: str, fallback_name: str) -> Dict[str, Any]:
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    education_markers = ["大学", "学院", "本科", "硕士", "博士", "专业"]
    work_experiences = [line for line in lines if re.search(r"20\d{2}|有限公司|公司|科技|集团|Inc|Ltd", line) and not any(keyword in line for keyword in education_markers)][:8]
    education_items = [line for line in lines if any(keyword in line for keyword in education_markers)][:6]
    project_items = [line for line in lines if "项目" in line or "Project" in line][:6]
    discovered_skills = [skill for skill in KNOWN_SKILLS if skill.lower() in raw_text.lower()]
    return {
        "basic_info": extract_basic_info(raw_text, fallback_name),
        "work_experiences": work_experiences,
        "education_experiences": education_items,
        "skills": discovered_skills[:20],
        "projects": project_items,
        "summary": "；".join(lines[:5])[:500],
    }


def build_jd_fallback(position: Any) -> Dict[str, str]:
    structured = build_jd_structured_fallback(position)
    markdown = render_jd_markdown_source(structured)
    return {
        "markdown": markdown,
        "html": markdown_to_html(markdown),
        "publish_text": render_publish_ready_jd(structured),
    }


def _extract_skill_focus_points(skills: Iterable[Any], limit: int = 6) -> Dict[str, List[str]]:
    names: List[str] = []
    focus_points: List[str] = []
    skip_keywords = ["触发方式", "初筛报告输出格式", "skill", "name:", "description:", "模块一", "模块二", "输出格式"]
    for skill in skills or []:
        if isinstance(skill, dict):
            name = str(skill.get("name") or "").strip()
            description = str(skill.get("description") or "").strip()
            content = str(skill.get("content") or "").strip()
        else:
            name = str(skill or "").strip()
            description = ""
            content = ""
        if name and name not in names:
            names.append(name)
        for source in [content, description]:
            if not source:
                continue
            plain = strip_markdown(source)
            segments = re.split(r"[\n\r。；;]+", plain)

            for segment in segments:
                cleaned = re.sub(r"^[\-\*\d\.\s•]+", "", segment).strip()
                if cleaned.startswith("|") or cleaned.endswith("|"):
                    continue
                if cleaned.startswith("#"):
                    continue
                if any(keyword.lower() in cleaned.lower() for keyword in skip_keywords):
                    continue
                if len(cleaned) < 8:
                    continue
                point = cleaned[:60]
                if point not in focus_points:
                    focus_points.append(point)
                if len(focus_points) >= limit:
                    break
            if len(focus_points) >= limit:
                break
        if len(focus_points) >= limit:
            break
    return {"names": names, "points": focus_points}


def _extract_focus_point_tokens(point: Any, *, limit: int = 12) -> List[str]:
    text = strip_markdown(str(point or "")).strip()
    if not text:
        return []
    label = ""
    detail = text
    if "：" in text:
        label, detail = text.split("：", 1)
    elif ":" in text:
        label, detail = text.split(":", 1)
    noise_keywords = {
        "招聘助手", "skill", "核心第一优先", "第一优先", "非一票否决项", "一票否决项", "不作否决项",
        "不要求", "即可", "具备", "能力", "经验", "相关", "原文依据", "引用简历具体内容", "简历未提及",
        "打分", "权重", "优先", "要求", "说明", "维度", "场景", "支撑能力", "弱不作否决项",
    }
    result: List[str] = []

    def push(token: str) -> None:
        normalized = str(token or "").strip().lower()
        normalized = normalized.strip("：:()（）[]【】,.，。；;!！?？")
        normalized = re.sub(r"(等真实联动测试经历|真实联动测试经历|测试经验|相关专业|系统测试核心支撑能力|基础认知即可|非一票否决项)$", "", normalized).strip()
        if (
            len(normalized) < 2
            or len(normalized) > 24
            or normalized in result
            or any(noise in normalized for noise in noise_keywords)
        ):
            return
        result.append(normalized)

    for candidate in [label, *re.findall(r"[A-Za-z][A-Za-z0-9+_.-]{1,24}", detail)]:
        push(candidate)
    for piece in re.split(r"[\s,，。；;、|/（）()]+", detail):
        push(piece)
        for keyword in extract_keywords(piece):
            push(keyword)
        if len(result) >= limit:
            break
    return result[:limit]


def _join_resume_search_text(parsed: Dict[str, Any]) -> str:
    chunks: List[str] = []
    for item in parsed.get("skills") or []:
        chunks.append(str(item or ""))
    for section in ["summary", "raw_text"]:
        chunks.append(str(parsed.get(section) or ""))
    for collection_key in ["work_experiences", "projects", "education_experiences"]:
        for item in parsed.get(collection_key) or []:
            chunks.append(str(item or ""))
    basic_info = parsed.get("basic_info") or {}
    for value in basic_info.values():
        chunks.append(str(value or ""))
    return " ".join(chunk for chunk in chunks if chunk).lower()


def _resume_item_to_text(item: Any) -> str:
    if isinstance(item, dict):
        preferred_keys = [
            "company", "position", "school", "degree", "major", "name", "title",
            "start_date", "end_date", "description",
        ]
        parts: List[str] = []
        for key in preferred_keys:
            value = str(item.get(key) or "").strip()
            if value and value not in parts:
                parts.append(value)
        for key, value in item.items():
            text = str(value or "").strip()
            if text and text not in parts:
                parts.append(text)
        return strip_markdown(" · ".join(parts)).strip()
    return strip_markdown(str(item or "")).strip()


def _collect_resume_lines(parsed_resume: Optional[Dict[str, Any]], *, limit: int = 24) -> List[str]:
    parsed = parsed_resume or {}
    lines: List[str] = []
    basic_info = parsed.get("basic_info") or {}
    basic_summary = " / ".join(
        value
        for value in [
            str(basic_info.get("name") or "").strip(),
            str(basic_info.get("years_of_experience") or "").strip(),
            str(basic_info.get("education") or "").strip(),
            str(basic_info.get("location") or "").strip(),
        ]
        if value
    )
    if basic_summary:
        lines.append(basic_summary)
    summary = strip_markdown(str(parsed.get("summary") or "")).strip()
    if summary:
        lines.append(summary)
    for key in ["skills", "projects", "work_experiences", "education_experiences"]:
        for item in parsed.get(key) or []:
            text = _resume_item_to_text(item)
            if text and text not in lines:
                lines.append(text)
            if len(lines) >= limit:
                return lines[:limit]
    return lines[:limit]


def _filter_interview_focus_points(points: Iterable[str], *, limit: int = 6) -> List[str]:
    ignored_keywords = {
        "触发", "用户说", "收到此类请求", "输出格式", "系统强制指令", "全程铁律", "规则变更原则",
        "不得拒绝", "不得覆盖", "html 输出规范", "视觉风格", "判定色块", "点击定位", "卡片折叠",
        "边框关键原则", "布局", "sticky", "scroll", "css", "js", "header", "总计约40分钟",
    }
    result: List[str] = []
    for point in points:
        cleaned = strip_markdown(str(point or "")).strip()
        normalized = cleaned.lower()
        if (
            not cleaned
            or len(cleaned) < 4
            or any(keyword in normalized for keyword in ignored_keywords)
        ):
            continue
        label = cleaned.split("：", 1)[0].split(":", 1)[0].strip()
        if len(label) >= 4 and label not in result:
            result.append(label)
        elif cleaned not in result:
            result.append(cleaned)
        if len(result) >= limit:
            break
    return result[:limit]


def _find_resume_evidence(lines: Iterable[str], topic: str, *, limit: int = 2) -> List[str]:
    tokens = _extract_focus_point_tokens(topic, limit=8) or [strip_markdown(topic).strip().lower()]
    results: List[str] = []
    for line in lines:
        lowered = str(line or "").lower()
        if not lowered:
            continue
        if any(token and token in lowered for token in tokens):
            candidate = strip_markdown(str(line or "")).strip()
            if candidate and candidate not in results:
                results.append(candidate)
        if len(results) >= limit:
            break
    return results[:limit]


def _infer_interview_topics(parsed_resume: Optional[Dict[str, Any]]) -> List[str]:
    searchable_text = _join_resume_search_text(parsed_resume or {})
    topics: List[str] = []
    mapping = [
        ("智能家居生态", ["米家", "homekit", "鸿蒙", "涂鸦", "联动", "互联互通"]),
        ("IoT通信协议", ["wi-fi", "wifi", "ble", "zigbee", "thread", "mqtt", "蓝牙", "星闪"]),
        ("软件测试基础", ["接口测试", "app测试", "测试用例", "回归测试", "postman", "apifox", "charles", "jmeter", "jira"]),
        ("硬件能力", ["硬件", "手控器", "升降桌", "联调", "稳定性测试", "安全测试"]),
        ("嵌入式/固件测试", ["ota", "固件", "串口", "烧录"]),
        ("AI工具使用", ["ai", "prompt", "测试集", "数据标注", "模型"]),
    ]
    for label, keywords in mapping:
        if any(keyword.lower() in searchable_text for keyword in keywords):
            topics.append(label)
    return topics[:6]


def _is_iot_interview_role(position_title: str, skills: Iterable[Any], parsed_resume: Optional[Dict[str, Any]]) -> bool:
    searchable_parts = [str(position_title or "")]
    searchable_parts.extend(
        str(part or "")
        for skill in skills or []
        for part in (
            skill.get("name") if isinstance(skill, dict) else skill,
            skill.get("description") if isinstance(skill, dict) else "",
            skill.get("content") if isinstance(skill, dict) else "",
        )
    )
    searchable_parts.append(_join_resume_search_text(parsed_resume or {}))
    searchable = " ".join(searchable_parts).lower()
    return any(keyword in searchable for keyword in ["iot", "智能家居", "zigbee", "ble", "mqtt", "homekit", "鸿蒙", "涂鸦"]) and "测试" in searchable


def infer_interview_capability_domains(
    position_title: str,
    skills: Iterable[Any],
    parsed_resume: Optional[Dict[str, Any]] = None,
) -> List[str]:
    if _is_iot_interview_role(position_title, skills, parsed_resume):
        return list(IOT_INTERVIEW_CAPABILITY_DOMAINS)
    inferred = _infer_interview_topics(parsed_resume)
    generic_domains = [
        "核心项目经历与角色边界",
        "测试设计与用例策略",
        "问题定位与缺陷闭环",
        "自动化与效率工具",
        "跨团队协作与风险沟通",
        "综合匹配度与转型意愿",
    ]
    merged: List[str] = []
    for item in [*inferred, *generic_domains]:
        label = str(item or "").strip()
        if label and label not in merged:
            merged.append(label)
    return merged[:7]


def extract_interview_generation_constraints(
    skills: Iterable[Any],
    custom_requirements: str = "",
) -> List[str]:
    picked: List[str] = []
    seen_keys: set[str] = set()
    meaningful_markers = (
        "严禁虚构",
        "强制出题",
        "软件测试不为零",
        "ai工具必出",
        "规则变更",
    )
    ignored_markers = (
        "触发方式",
        "模块二",
        "输出规范",
        "时长分配",
        "建议时长",
        "用户无需重复发送",
        "岗位 jd",
        "html 输出规范",
        "专业词释义规范",
        "每道题必须包含的五个部分",
        "判定区",
        ".block-",
        "css规范",
        "视觉风格",
        "布局",
        "sticky",
        "scrollintoview",
        "js实现",
        "skill_group",
        "applies_to",
        "description:",
        "name:",
        "岗位 jd",
        "岗位职责",
        "任职要求",
        "加分项",
        "岗位名称",
        "专业词释义规范",
    )

    def canonical_rule_key(text: str) -> str:
        cleaned = strip_markdown(str(text or "")).strip()
        label = cleaned.split("：", 1)[0].split(":", 1)[0].strip().lower()
        if 2 <= len(label) <= 20:
            return label
        return re.sub(r"\s+", "", cleaned.lower())[:48]

    def push(line: str) -> None:
        cleaned = strip_markdown(str(line or "")).strip()
        cleaned = re.sub(r"^[\-\*\d\.\s•]+", "", cleaned)
        cleaned = cleaned.strip("：: ")
        rule_key = canonical_rule_key(cleaned)
        if (
            not cleaned
            or len(cleaned) < 6
            or rule_key in seen_keys
            or any(marker.lower() in cleaned.lower() for marker in ignored_markers)
        ):
            return
        seen_keys.add(rule_key)
        picked.append(cleaned)

    for skill in skills or []:
        content = str(skill.get("content") or skill.get("description") or "") if isinstance(skill, dict) else str(skill or "")
        for line in re.split(r"[\n\r]+", content):
            plain = strip_markdown(line).strip()
            if not plain:
                continue
            lowered = plain.lower()
            if any(marker.lower() in lowered for marker in meaningful_markers):
                push(plain)
            elif re.match(r"^(所有|每份|必须|不得|如果简历没有直接证据)", plain):
                push(plain)
            if len(picked) >= 10:
                break
        if len(picked) >= 10:
            break
    if custom_requirements.strip():
        push(f"用户附加要求：{custom_requirements.strip()}")
    if not picked:
        picked.extend([
            "所有题目必须先绑定简历、岗位 JD 和初筛结论中的真实证据。",
            "技能规则只作为生成约束，不能出现在模块标题、题干或参考答案里。",
            "如果简历没有直接证据，只能以待核实风险点设计追问。",
        ])
    return picked[:10]


def _find_resume_evidence_for_domain(lines: Iterable[str], domain: str, *, limit: int = 2) -> List[str]:
    keywords = INTERVIEW_DOMAIN_KEYWORDS.get(domain) or _extract_focus_point_tokens(domain, limit=8)
    results: List[str] = []
    for line in lines:
        lowered = str(line or "").lower()
        if not lowered:
            continue
        if any(keyword.lower() in lowered for keyword in keywords):
            candidate = strip_markdown(str(line or "")).strip()
            if candidate and candidate not in results:
                results.append(candidate)
        if len(results) >= limit:
            break
    return results[:limit]


def _find_domain_risk_points(domain: str, concerns: Iterable[str], *, limit: int = 2) -> List[str]:
    keywords = INTERVIEW_DOMAIN_KEYWORDS.get(domain) or [domain]
    results: List[str] = []
    for concern in concerns:
        cleaned = strip_markdown(str(concern or "")).strip()
        lowered = cleaned.lower()
        if cleaned and any(keyword.lower() in lowered for keyword in keywords):
            results.append(cleaned)
        if len(results) >= limit:
            break
    return results[:limit]


def detect_interview_rule_leakage(markdown: str, html_content: str = "") -> Optional[str]:
    searchable = "\n".join(filter(None, [str(markdown or ""), strip_markdown(str(html_content or ""))])).lower()
    if not searchable.strip():
        return "模型没有返回有效面试题正文。"
    for marker in INTERVIEW_RULE_LEAK_MARKERS:
        if marker.lower() in searchable:
            return f"模型输出混入了 Skill 规则主题：{marker}"
    return None


def _normalize_string_list(value: Any, *, limit: int, min_length: int = 2) -> List[str]:
    if isinstance(value, list):
        source = value
    elif isinstance(value, str):
        source = re.split(r"[\n\r]+", value)
    else:
        source = []
    result: List[str] = []
    for item in source:
        text = strip_markdown(str(item or "")).strip()
        text = re.sub(r"\s+", " ", text)
        text = text.strip("•- ")
        if len(text) < min_length or text in result:
            continue
        result.append(text)
        if len(result) >= limit:
            break
    return result


def _split_summary_sentences(value: Any, *, limit: int = 4) -> List[str]:
    parts = re.split(r"[。；;\n\r]+", strip_markdown(str(value or "")))
    return _normalize_string_list(parts, limit=limit, min_length=6)


def _build_interview_evidence_pool(parsed_resume: Optional[Dict[str, Any]], screening_result: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    pool: List[Dict[str, Any]] = []
    seen: set[str] = set()

    def push(text: Any, source: str, base_score: int) -> None:
        cleaned = strip_markdown(str(text or "")).strip()
        cleaned = re.sub(r"\s+", " ", cleaned)
        if len(cleaned) < 4 or cleaned in seen:
            return
        seen.add(cleaned)
        pool.append({"text": cleaned[:320], "source": source, "base_score": base_score})

    parsed = parsed_resume or {}
    score = screening_result or {}
    for item in score.get("advantages") or []:
        push(item, "screening_advantage", 9)
    for item in parsed.get("projects") or []:
        push(_resume_item_to_text(item), "project", 7)
    for item in parsed.get("work_experiences") or []:
        push(_resume_item_to_text(item), "work_experience", 5)
    for item in parsed.get("skills") or []:
        push(item, "resume_skill", 4)
    for item in _split_summary_sentences(parsed.get("summary"), limit=6):
        push(item, "summary", 4)
    return pool


def _score_interview_evidence_entry(entry: Dict[str, Any], domain: str) -> float:
    text = str(entry.get("text") or "").strip()
    lowered = text.lower()
    keywords = INTERVIEW_DOMAIN_KEYWORDS.get(domain) or _extract_focus_point_tokens(domain, limit=8)
    concrete_tokens = [
        "uwb", "cadence", "pads", "pcb", "buck", "boost", "ldo", "测试用例", "测试方案", "测试指导书",
        "自动化测试", "自动化", "性能测试", "功能测试", "电源", "信号", "问题定位", "项目交付", "联调",
    ]
    score = float(entry.get("base_score") or 0)
    score += sum(1 for keyword in keywords if keyword and keyword.lower() in lowered) * 4.5
    score += sum(1 for token in concrete_tokens if token.lower() in lowered) * 1.3
    if entry.get("source") == "screening_advantage":
        score += 2.2
    if entry.get("source") == "project":
        score += 1.0
    if re.fullmatch(r"20\d{2}.*", text):
        score -= 4
    if any(marker in lowered for marker in ["本科", "候选人", "期望城市", "女 |", "男 |"]):
        score -= 3
    if re.fullmatch(r".*(有限公司|公司|科技|集团)(\s+[^\s]+工程师)?", text) and "测试" not in lowered:
        score -= 3
    return score


def _domain_keyword_hit_count(text: str, domain: str) -> int:
    lowered = str(text or "").lower()
    keywords = INTERVIEW_DOMAIN_KEYWORDS.get(domain) or _extract_focus_point_tokens(domain, limit=8)
    return sum(1 for keyword in keywords if keyword and keyword.lower() in lowered)


def _select_domain_evidence(
    domain: str,
    parsed_resume: Optional[Dict[str, Any]],
    screening_result: Optional[Dict[str, Any]],
    *,
    limit: int = 2,
) -> List[str]:
    pool = _build_interview_evidence_pool(parsed_resume, screening_result)
    ranked = sorted(
        pool,
        key=lambda entry: (_score_interview_evidence_entry(entry, domain), len(str(entry.get("text") or ""))),
        reverse=True,
    )
    results: List[str] = []
    for entry in ranked:
        text = str(entry.get("text") or "").strip()
        if not text:
            continue
        keyword_hits = _domain_keyword_hit_count(text, domain)
        if _score_interview_evidence_entry(entry, domain) < 6:
            continue
        if domain != "综合匹配度与转型意愿" and keyword_hits == 0:
            continue
        if text not in results:
            results.append(text)
        if len(results) >= limit:
            break
    return results[:limit]


def _default_domain_risk(domain: str, concerns: Sequence[str]) -> str:
    risk_lines = _find_domain_risk_points(domain, concerns, limit=2)
    if risk_lines:
        return "；".join(risk_lines)
    return f"待核实候选人在“{domain}”上是否有可复述的真实项目、测试路径和问题闭环证据。"


def _build_interview_overview(
    candidate_name: str,
    position_title: str,
    round_name: str,
    custom_requirements: str,
    parsed_resume: Optional[Dict[str, Any]],
    screening_result: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    parsed = parsed_resume or {}
    basic_info = parsed.get("basic_info") or {}
    score = screening_result or {}
    highlights = _normalize_string_list(score.get("advantages"), limit=4, min_length=4)
    risks = _normalize_string_list(score.get("concerns"), limit=4, min_length=4)
    summary_parts = [
        str(candidate_name or basic_info.get("name") or "未命名候选人").strip(),
        str(position_title or "当前岗位").strip(),
        str(basic_info.get("years_of_experience") or "工作年限待核实").strip(),
        str(basic_info.get("education") or "学历待核实").strip(),
        str(round_name or "初试").strip(),
    ]
    return {
        "candidate_summary": "｜".join([part for part in summary_parts if part]),
        "screening_status": _screening_status_label(score),
        "highlights": highlights or ["暂无明确亮点，建议结合简历原文继续核实。"],
        "risks_to_verify": risks or ["暂无明确风险点，建议继续核实岗位匹配度与真实项目深度。"],
        "custom_focus": (custom_requirements or "本轮重点关注候选人与岗位的真实匹配度、执行力与成长空间。").strip(),
    }


def _build_interview_domain_blueprint(
    domain: str,
    parsed_resume: Optional[Dict[str, Any]],
    screening_result: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    guidance = INTERVIEW_DOMAIN_GUIDANCE.get(domain, {
        "nature": "重点核实区",
        "minutes": 5,
        "focus": f"{domain} 相关真实经历、方法和风险判断",
        "followups": [
            f"如果让你复盘一次“{domain}”相关项目，你最想补哪一个风险场景？",
            "这类问题你会如何区分是需求、实现、环境还是测试设计导致的？",
        ],
        "explain": f"用于验证候选人在“{domain}”上的真实经历深度与方法论完整性。",
    })
    concerns = _normalize_string_list((screening_result or {}).get("concerns"), limit=6, min_length=4)
    evidence_basis = _select_domain_evidence(domain, parsed_resume, screening_result, limit=2)
    evidence_type = "direct_evidence" if evidence_basis else "risk_to_verify"
    evidence_display = evidence_basis or [_default_domain_risk(domain, concerns)]
    if evidence_type == "direct_evidence":
        primary_question = (
            f"请结合你简历里提到的“{evidence_basis[0]}”，讲清你在“{domain}”场景里实际负责的测试对象、"
            "测试设计、关键观测指标、问题定位路径以及最终闭环。"
        )
    else:
        primary_question = (
            f"简历目前没有直接体现“{domain}”的实战证据。请不要默认自己做过这类场景，而是结合你最接近的一段真实项目，"
            f"说明哪些能力可以迁移到“{domain}”，哪些部分仍然需要在面试里继续核实。"
        )
    answer_points = [
        f"先交代真实项目背景、测试对象、角色边界，以及你本人实际负责到哪一步。",
        f"围绕“{guidance['focus']}”讲清测试路径、关键指标、缺陷定位和复盘闭环。",
        (
            f"把“{evidence_basis[0]}”这类已知证据落到可核实的动作、方法和结果上。"
            if evidence_basis
            else "明确哪些内容来自真实经历，哪些只是迁移判断或待核实风险，不能把未做过的内容说成做过。"
        ),
    ]
    return {
        "domain_title": domain,
        "domain_nature": guidance.get("nature") or "重点核实区",
        "recommended_minutes": int(guidance.get("minutes") or 5),
        "evidence_basis": evidence_display,
        "evidence_type": evidence_type,
        "primary_question": primary_question,
        "answer_points": answer_points,
        "verdict_pass": "能给出真实项目证据、测试路径、关键指标、问题闭环和复盘结论，且前后细节自洽。",
        "verdict_caution": "回答停留在原则层面，缺少测试对象、输入输出、日志/指标或缺陷闭环证据，需要继续深挖。",
        "verdict_fail": "把未做过的内容说成做过，或核心细节明显前后矛盾，无法自证真实经历。",
        "followups": list(guidance.get("followups") or [])[:2],
        "interviewer_explanation": str(guidance.get("explain") or "").strip(),
    }


def build_interview_structured_fallback(
    candidate_name: str,
    position_title: str,
    round_name: str,
    skills: Iterable[Any],
    custom_requirements: str,
    parsed_resume: Optional[Dict[str, Any]] = None,
    screening_result: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    domains = infer_interview_capability_domains(position_title, skills, parsed_resume)
    structured_domains = [
        _build_interview_domain_blueprint(domain, parsed_resume, screening_result)
        for domain in domains
    ]
    return {
        "title": f"{candidate_name} - {round_name} 面试题",
        "candidate_name": candidate_name,
        "position_title": position_title,
        "round_name": round_name,
        "overview": _build_interview_overview(
            candidate_name,
            position_title,
            round_name,
            custom_requirements,
            parsed_resume,
            screening_result,
        ),
        "domains": structured_domains,
    }


def _find_payload_domain(payload_domains: Sequence[Dict[str, Any]], expected_title: str) -> Optional[Dict[str, Any]]:
    expected = str(expected_title or "").strip().lower()
    for item in payload_domains:
        title = str(item.get("domain_title") or item.get("title") or "").strip().lower()
        if title == expected:
            return item
    for item in payload_domains:
        title = str(item.get("domain_title") or item.get("title") or "").strip().lower()
        if expected and expected in title:
            return item
    return None


def normalize_structured_interview(
    payload: Optional[Dict[str, Any]],
    *,
    candidate_name: str,
    position_title: str,
    round_name: str,
    skills: Iterable[Any],
    custom_requirements: str,
    parsed_resume: Optional[Dict[str, Any]] = None,
    screening_result: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    fallback = build_interview_structured_fallback(
        candidate_name,
        position_title,
        round_name,
        skills,
        custom_requirements,
        parsed_resume=parsed_resume,
        screening_result=screening_result,
    )
    raw_payload = payload if isinstance(payload, dict) else {}
    raw_overview = raw_payload.get("overview") if isinstance(raw_payload.get("overview"), dict) else {}
    raw_domains = raw_payload.get("domains") if isinstance(raw_payload.get("domains"), list) else []

    overview = {
        "candidate_summary": str(raw_overview.get("candidate_summary") or fallback["overview"]["candidate_summary"]).strip(),
        "screening_status": str(raw_overview.get("screening_status") or fallback["overview"]["screening_status"]).strip(),
        "highlights": _normalize_string_list(raw_overview.get("highlights"), limit=4, min_length=4) or list(fallback["overview"]["highlights"]),
        "risks_to_verify": _normalize_string_list(raw_overview.get("risks_to_verify"), limit=4, min_length=4) or list(fallback["overview"]["risks_to_verify"]),
        "custom_focus": str(raw_overview.get("custom_focus") or fallback["overview"]["custom_focus"]).strip(),
    }

    normalized_domains: List[Dict[str, Any]] = []
    for fallback_domain in fallback["domains"]:
        raw_domain = _find_payload_domain(raw_domains, fallback_domain["domain_title"]) or {}
        evidence_basis = _normalize_string_list(raw_domain.get("evidence_basis"), limit=3, min_length=4) or list(fallback_domain["evidence_basis"])
        evidence_type = str(raw_domain.get("evidence_type") or fallback_domain["evidence_type"]).strip()
        if evidence_type not in {"direct_evidence", "risk_to_verify"}:
            evidence_type = fallback_domain["evidence_type"]
        answer_points = _normalize_string_list(raw_domain.get("answer_points"), limit=5, min_length=6)
        followups = _normalize_string_list(raw_domain.get("followups"), limit=4, min_length=6)
        primary_question = str(raw_domain.get("primary_question") or "").strip()
        if evidence_type == "risk_to_verify":
            if not primary_question or "没有直接" not in primary_question and "未" not in primary_question and "待核实" not in primary_question:
                primary_question = fallback_domain["primary_question"]
        elif not primary_question or len(primary_question) < 24:
            primary_question = fallback_domain["primary_question"]

        normalized_domains.append({
            "domain_title": fallback_domain["domain_title"],
            "domain_nature": fallback_domain["domain_nature"],
            "recommended_minutes": fallback_domain["recommended_minutes"],
            "evidence_basis": evidence_basis,
            "evidence_type": evidence_type,
            "primary_question": primary_question,
            "answer_points": answer_points[:5] or list(fallback_domain["answer_points"]),
            "verdict_pass": str(raw_domain.get("verdict_pass") or fallback_domain["verdict_pass"]).strip(),
            "verdict_caution": str(raw_domain.get("verdict_caution") or fallback_domain["verdict_caution"]).strip(),
            "verdict_fail": str(raw_domain.get("verdict_fail") or fallback_domain["verdict_fail"]).strip(),
            "followups": followups[:4] or list(fallback_domain["followups"]),
            "interviewer_explanation": str(raw_domain.get("interviewer_explanation") or fallback_domain["interviewer_explanation"]).strip(),
        })

    return {
        "title": str(raw_payload.get("title") or fallback["title"]).strip() or fallback["title"],
        "candidate_name": candidate_name,
        "position_title": position_title,
        "round_name": round_name,
        "overview": overview,
        "domains": normalized_domains,
    }


def _screening_status_label(score_payload: Optional[Dict[str, Any]]) -> str:
    status = str((score_payload or {}).get("suggested_status") or "").strip()
    mapping = {
        "screening_passed": "初筛通过",
        "pending_interview": "待面试",
        "talent_pool": "进入人才库",
        "screening_rejected": "初筛未达标",
    }
    return mapping.get(status, "待进一步核实")


def build_interview_fallback(
    candidate_name: str,
    position_title: str,
    round_name: str,
    skills: Iterable[Any],
    custom_requirements: str,
    parsed_resume: Optional[Dict[str, Any]] = None,
    screening_result: Optional[Dict[str, Any]] = None,
) -> Dict[str, str]:
    structured = build_interview_structured_fallback(
        candidate_name,
        position_title,
        round_name,
        skills,
        custom_requirements,
        parsed_resume=parsed_resume,
        screening_result=screening_result,
    )
    return {
        "markdown": render_interview_markdown(structured),
        "html": render_interview_html(structured),
    }


def render_interview_markdown(structured: Dict[str, Any]) -> str:
    overview = structured.get("overview") if isinstance(structured.get("overview"), dict) else {}
    domains = structured.get("domains") if isinstance(structured.get("domains"), list) else []
    lines: List[str] = [
        f"# {structured.get('title') or '结构化面试题'}",
        "",
        "## 候选人背景",
        f"- 候选人摘要：{overview.get('candidate_summary') or '-'}",
        f"- 初筛状态：{overview.get('screening_status') or '-'}",
        f"- 本轮关注点：{overview.get('custom_focus') or '-'}",
        f"- 已识别亮点：{'；'.join(_normalize_string_list(overview.get('highlights'), limit=4, min_length=2)) or '暂无'}",
        f"- 待核实风险：{'；'.join(_normalize_string_list(overview.get('risks_to_verify'), limit=4, min_length=2)) or '暂无'}",
    ]
    for index, raw_domain in enumerate(domains, 1):
        if not isinstance(raw_domain, dict):
            continue
        evidence_items = _normalize_string_list(raw_domain.get("evidence_basis"), limit=3, min_length=2)
        answer_points = _normalize_string_list(raw_domain.get("answer_points"), limit=5, min_length=2)
        followups = _normalize_string_list(raw_domain.get("followups"), limit=4, min_length=2)
        lines.extend([
            "",
            f"## 模块 {index} · {raw_domain.get('domain_title') or '未命名模块'}",
            f"- 模块性质：{raw_domain.get('domain_nature') or '重点核实区'}",
            f"- 建议时长：{raw_domain.get('recommended_minutes') or 5} 分钟",
            f"- 证据类型：{'直接证据' if raw_domain.get('evidence_type') == 'direct_evidence' else '待核实风险'}",
            f"- 证据锚点：{'；'.join(evidence_items) or '暂无'}",
            f"- 面试题正题：{raw_domain.get('primary_question') or '-'}",
            "- 参考答案要点：",
            *[f"  {idx}. {item}" for idx, item in enumerate(answer_points, 1)],
            "- 通过 / 注意 / 一票否决判定：",
            f"  - 通过：{raw_domain.get('verdict_pass') or '-'}",
            f"  - 注意：{raw_domain.get('verdict_caution') or '-'}",
            f"  - 一票否决：{raw_domain.get('verdict_fail') or '-'}",
            "- 追问环节：",
            *[f"  {idx}. {item}" for idx, item in enumerate(followups, 1)],
            f"- 答不出时·面试官解释：{raw_domain.get('interviewer_explanation') or '-'}",
        ])
    return "\n".join(lines).strip()


def render_interview_html(structured: Dict[str, Any]) -> str:
    overview = structured.get("overview") if isinstance(structured.get("overview"), dict) else {}
    domains = [item for item in (structured.get("domains") or []) if isinstance(item, dict)]

    def esc(value: Any) -> str:
        return html.escape(str(value or ""))

    highlight_items = "".join(
        f"<li>{esc(item)}</li>"
        for item in _normalize_string_list(overview.get("highlights"), limit=6, min_length=2)
    ) or "<li>暂无明确亮点，建议继续核实。</li>"
    risk_items = "".join(
        f"<li>{esc(item)}</li>"
        for item in _normalize_string_list(overview.get("risks_to_verify"), limit=6, min_length=2)
    ) or "<li>暂无明确风险点，建议继续核实。</li>"

    nav_items: List[str] = []
    question_cards: List[str] = []
    for index, domain in enumerate(domains, 1):
        anchor = f"domain-{index}"
        title = str(domain.get("domain_title") or "未命名模块").strip()
        evidence_type = "直接证据" if domain.get("evidence_type") == "direct_evidence" else "待核实风险"
        evidence_badge_class = "pill-direct" if domain.get("evidence_type") == "direct_evidence" else "pill-risk"
        evidence_items = "".join(
            f"<li>{esc(item)}</li>"
            for item in _normalize_string_list(domain.get("evidence_basis"), limit=4, min_length=2)
        )
        answer_items = "".join(
            f"<li>{esc(item)}</li>"
            for item in _normalize_string_list(domain.get("answer_points"), limit=5, min_length=2)
        )
        followup_items = "".join(
            f"<li>{esc(item)}</li>"
            for item in _normalize_string_list(domain.get("followups"), limit=4, min_length=2)
        )
        nav_items.append(
            f"<a class=\"side-link\" href=\"#{anchor}\"><span>模块 {index}</span><strong>{esc(title)}</strong></a>"
        )
        question_cards.append(
            f"""
            <section id="{anchor}" class="qcard">
              <button type="button" class="qcard-top">
                <div class="qcard-heading">
                  <span class="qindex">模块 {index}</span>
                  <h2>{esc(title)}</h2>
                  <p>{esc(domain.get("domain_nature") or "重点核实区")} · 建议 {esc(domain.get("recommended_minutes") or 5)} 分钟</p>
                </div>
                <div class="qcard-meta">
                  <span class="pill {evidence_badge_class}">{evidence_type}</span>
                  <span class="toggle-arrow">▾</span>
                </div>
              </button>
              <div class="qcard-body">
                <div class="content-block block-evidence">
                  <h3>证据锚点</h3>
                  <ul>{evidence_items}</ul>
                </div>
                <div class="content-block block-question">
                  <h3>面试题正题</h3>
                  <p>{esc(domain.get("primary_question"))}</p>
                </div>
                <div class="content-block block-answer">
                  <h3>参考答案要点</h3>
                  <ol>{answer_items}</ol>
                </div>
                <div class="content-block">
                  <h3>判定规则</h3>
                  <div class="block-verdict">
                    <div class="verdict-card verdict-pass"><strong>通过</strong><p>{esc(domain.get("verdict_pass"))}</p></div>
                    <div class="verdict-card verdict-caution"><strong>注意</strong><p>{esc(domain.get("verdict_caution"))}</p></div>
                    <div class="verdict-card verdict-fail"><strong>一票否决</strong><p>{esc(domain.get("verdict_fail"))}</p></div>
                  </div>
                </div>
                <div class="content-block block-followup">
                  <h3>追问环节</h3>
                  <ol>{followup_items}</ol>
                </div>
                <div class="content-block block-explain">
                  <h3>答不出时·面试官解释</h3>
                  <p>{esc(domain.get("interviewer_explanation"))}</p>
                </div>
              </div>
            </section>
            """
        )

    title = esc(structured.get("title") or "结构化面试题")
    candidate_summary = esc(overview.get("candidate_summary") or "-")
    screening_status = esc(overview.get("screening_status") or "-")
    custom_focus = esc(overview.get("custom_focus") or "-")
    domains_html = "".join(question_cards)
    nav_html = "".join(nav_items)
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #07111f;
      --panel: rgba(12, 24, 42, 0.78);
      --panel-strong: rgba(11, 20, 35, 0.94);
      --border: rgba(148, 163, 184, 0.18);
      --text: #e5eef9;
      --muted: #9fb2c8;
      --accent: #76b8ff;
      --accent-soft: rgba(118, 184, 255, 0.16);
      --success-bg: #064e3b;
      --success-border: #10b981;
      --warning-bg: #451a03;
      --warning-border: #f59e0b;
      --danger-bg: #7f1d1d;
      --danger-border: #ef4444;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 28%),
        radial-gradient(circle at top right, rgba(59, 130, 246, 0.10), transparent 24%),
        linear-gradient(180deg, #081223 0%, #07111f 55%, #050b16 100%);
    }}
    .page {{
      max-width: 1440px;
      margin: 0 auto;
      padding: 32px 36px 48px;
    }}
    .hero {{
      display: grid;
      gap: 16px;
      grid-template-columns: minmax(0, 1fr);
      padding: 28px;
      border-radius: 28px;
      border: 1px solid var(--border);
      background: linear-gradient(180deg, rgba(10, 24, 42, 0.96), rgba(8, 18, 34, 0.88));
      box-shadow: 0 20px 60px rgba(2, 8, 23, 0.45);
      backdrop-filter: blur(16px);
    }}
    .hero h1 {{
      margin: 0;
      font-size: 30px;
      line-height: 1.25;
    }}
    .hero-meta {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }}
    .pill {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      background: rgba(15, 23, 42, 0.48);
      font-size: 12px;
      color: var(--muted);
    }}
    .pill-direct {{
      background: rgba(16, 185, 129, 0.14);
      border-color: rgba(16, 185, 129, 0.34);
      color: #d1fae5;
    }}
    .pill-risk {{
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.30);
      color: #fde68a;
    }}
    .layout {{
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 20px;
      margin-top: 22px;
      align-items: start;
    }}
    .main {{
      display: flex;
      flex-direction: column;
      gap: 18px;
    }}
    .sidebar {{
      position: sticky;
      top: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }}
    .side-card, .qcard {{
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 24px;
      backdrop-filter: blur(16px);
      box-shadow: 0 16px 44px rgba(2, 8, 23, 0.36);
    }}
    .side-card {{
      padding: 18px;
    }}
    .side-card h2, .side-card h3 {{
      margin: 0 0 12px;
      font-size: 14px;
      color: #f8fbff;
    }}
    .side-card ul {{
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
      line-height: 1.8;
      font-size: 13px;
    }}
    .side-card p {{
      margin: 0;
      color: var(--muted);
      line-height: 1.8;
      font-size: 13px;
    }}
    .side-link {{
      display: flex;
      flex-direction: column;
      gap: 4px;
      text-decoration: none;
      color: var(--text);
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 18px;
      padding: 12px 14px;
      background: rgba(8, 15, 28, 0.52);
      transition: border-color 0.2s ease, transform 0.2s ease;
    }}
    .side-link:hover {{
      border-color: rgba(118, 184, 255, 0.42);
      transform: translateY(-1px);
    }}
    .side-link span {{
      font-size: 11px;
      color: var(--muted);
    }}
    .side-link strong {{
      font-size: 13px;
      line-height: 1.5;
    }}
    .qcard {{
      overflow: hidden;
    }}
    .qcard-top {{
      width: 100%;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 22px 24px;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      text-align: left;
    }}
    .qcard-heading h2 {{
      margin: 6px 0 6px;
      font-size: 22px;
      line-height: 1.35;
    }}
    .qcard-heading p {{
      margin: 0;
      font-size: 13px;
      color: var(--muted);
    }}
    .qindex {{
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: #cfe6ff;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }}
    .qcard-meta {{
      display: flex;
      align-items: flex-start;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }}
    .toggle-arrow {{
      transition: transform 0.25s ease;
      color: var(--muted);
      font-size: 16px;
    }}
    .qcard.collapsed .toggle-arrow {{
      transform: rotate(-90deg);
    }}
    .qcard-body {{
      display: grid;
      gap: 14px;
      padding: 0 24px 24px;
      max-height: 2400px;
      opacity: 1;
      transition: max-height 0.35s ease, opacity 0.25s ease;
    }}
    .qcard.collapsed .qcard-body {{
      max-height: 0;
      opacity: 0;
      overflow: hidden;
      padding-bottom: 0;
    }}
    .content-block {{
      border-radius: 20px;
      border: 1px solid rgba(148, 163, 184, 0.16);
      background: rgba(8, 15, 28, 0.62);
      padding: 16px 18px;
    }}
    .content-block h3 {{
      margin: 0 0 10px;
      font-size: 14px;
      color: #f8fbff;
    }}
    .content-block p, .content-block li {{
      margin: 0;
      font-size: 14px;
      line-height: 1.9;
      color: var(--muted);
    }}
    .content-block ul, .content-block ol {{
      margin: 0;
      padding-left: 20px;
    }}
    .block-evidence {{
      border-left: 3px solid #60a5fa;
    }}
    .block-question {{
      border-left: 3px solid #38bdf8;
    }}
    .block-answer {{
      border-left: 3px solid #34d399;
    }}
    .block-followup {{
      border-left: 3px solid #a78bfa;
    }}
    .block-explain {{
      border-left: 3px solid #f59e0b;
    }}
    .block-verdict {{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }}
    .verdict-card {{
      border-radius: 16px !important;
      padding: 12px 14px;
      min-height: 112px;
    }}
    .verdict-card strong {{
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
    }}
    .verdict-card p {{
      margin: 0;
      font-size: 13px;
      line-height: 1.75;
    }}
    .verdict-pass {{
      background: var(--success-bg);
      border: 1px solid var(--success-border);
      color: #d1fae5;
    }}
    .verdict-caution {{
      background: var(--warning-bg);
      border: 1px solid var(--warning-border);
      color: #fef3c7;
    }}
    .verdict-fail {{
      background: var(--danger-bg);
      border: 1px solid var(--danger-border);
      color: #fee2e2;
    }}
    @media (max-width: 1080px) {{
      .layout {{
        grid-template-columns: 1fr;
      }}
      .sidebar {{
        position: static;
      }}
    }}
    @media (max-width: 720px) {{
      .page {{
        padding: 18px 12px 28px;
      }}
      .hero {{
        padding: 18px;
        border-radius: 20px;
      }}
      .qcard-top, .qcard-body {{
        padding-left: 16px;
        padding-right: 16px;
      }}
      .block-verdict {{
        grid-template-columns: 1fr;
      }}
    }}
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <h1>{title}</h1>
      <div class="hero-meta">
        <span class="pill">{candidate_summary}</span>
        <span class="pill">初筛状态：{screening_status}</span>
      </div>
      <p class="hero-focus">{custom_focus}</p>
    </section>
    <div class="layout">
      <main class="main">
        {domains_html}
      </main>
      <aside class="sidebar">
        <section class="side-card">
          <h2>候选人概览</h2>
          <p>{candidate_summary}</p>
          <p style="margin-top:8px;">当前结论：{screening_status}</p>
        </section>
        <section class="side-card">
          <h3>已识别亮点</h3>
          <ul>{highlight_items}</ul>
        </section>
        <section class="side-card">
          <h3>待核实风险</h3>
          <ul>{risk_items}</ul>
        </section>
        <section class="side-card">
          <h3>能力域导航</h3>
          <div style="display:flex;flex-direction:column;gap:10px;">{nav_html}</div>
        </section>
      </aside>
    </div>
  </div>
  <script>
    document.querySelectorAll('.qcard-top').forEach(function(button) {{
      button.addEventListener('click', function() {{
        var card = button.closest('.qcard');
        if (card) {{
          card.classList.toggle('collapsed');
        }}
      }});
    }});
  </script>
</body>
</html>"""


def score_candidate_fallback(position: Any, parsed: Dict[str, Any], weights: Dict[str, float], status_rules: Dict[str, Any], skills: Optional[Iterable[Any]] = None) -> Dict[str, Any]:
    generic_tokens = {
        "负责", "相关", "工作", "能力", "经验", "熟悉", "具备", "要求", "岗位", "工程师", "测试", "研发",
        "团队", "项目", "流程", "质量", "问题", "平台", "模块", "业务", "支持", "沟通", "输出", "独立",
        "招聘助手", "技能", "skills", "skill", "优先", "说明", "维度", "重点", "原文", "依据", "内容",
    }

    def filter_keywords(tokens: Iterable[str], limit: int = 18) -> List[str]:
        result: List[str] = []
        for token in tokens:
            normalized = str(token or "").strip().lower()
            if (
                len(normalized) < 2
                or normalized in generic_tokens
                or normalized in result
                or normalized.isdigit()
            ):
                continue
            result.append(normalized)
            if len(result) >= limit:
                break
        return result

    def focus_point_keywords(points: Iterable[str], limit: int = 16) -> List[str]:
        result: List[str] = []
        for point in points:
            for token in _extract_focus_point_tokens(point, limit=limit):
                if token not in result and token not in generic_tokens:
                    result.append(token)
                if len(result) >= limit:
                    return result
        return result[:limit]

    def is_focus_point_hit(point: str) -> bool:
        cleaned = strip_markdown(str(point or "")).strip().lower()
        if not cleaned:
            return False
        if cleaned in searchable_resume_text:
            return True
        tokens = filter_keywords(extract_keywords(cleaned), limit=6)
        if not tokens:
            return False
        matched = [token for token in tokens if token in searchable_resume_text]
        return len(matched) >= max(1, min(len(tokens), 2))

    def summarize_points(points: Iterable[str]) -> str:
        items = [strip_markdown(str(point or "")).strip() for point in points if str(point or "").strip()]
        return "；".join(item[:18] for item in items[:2]) or "暂无"

    basic_info = parsed.get("basic_info") or {}
    raw_skills = parsed.get("skills") or []
    work_experiences = parsed.get("work_experiences") or []
    searchable_resume_text = _join_resume_search_text(parsed)
    requirement_text = " ".join(filter(None, [position.title, getattr(position, "key_requirements", "") or "", getattr(position, "bonus_points", "") or ""]))
    requirement_keywords = filter_keywords(extract_keywords(requirement_text), limit=12)
    matched_keywords = [keyword for keyword in requirement_keywords if keyword and keyword in searchable_resume_text]
    skill_meta = _extract_skill_focus_points(skills or [], limit=8)
    skill_text = " ".join(
        str(part or "")
        for skill in skills or []
        for part in (
            skill.get("name") if isinstance(skill, dict) else skill,
            skill.get("description") if isinstance(skill, dict) else "",
            skill.get("content") if isinstance(skill, dict) else "",
        )
    ).lower()
    known_skill_hits = [item.lower() for item in KNOWN_SKILLS if item.lower() in skill_text and item.lower() not in generic_tokens]
    required_skill_keywords = filter_keywords(
        [*focus_point_keywords(skill_meta["points"]), *known_skill_hits],
        limit=16,
    )
    matched_skill_keywords = [keyword for keyword in required_skill_keywords if keyword in searchable_resume_text]
    missing_skill_keywords = [keyword for keyword in required_skill_keywords if keyword not in searchable_resume_text]
    focus_point_hits = [point for point in skill_meta["points"] if is_focus_point_hit(point)]
    focus_point_misses = [point for point in skill_meta["points"] if point not in focus_point_hits]

    years = 0
    years_match = re.search(r"(\d{1,2})", str(basic_info.get("years_of_experience") or ""))
    if years_match:
        years = int(years_match.group(1))

    experience_score = min(100.0, 35.0 + years * 11.0) if years else 42.0
    focus_ratio = len(focus_point_hits) / max(len(skill_meta["points"]), 1) if skill_meta["points"] else 0.0
    coverage_ratio = len(matched_skill_keywords) / max(len(required_skill_keywords), 1) if required_skill_keywords else 0.0
    skills_score = 26.0 + len(matched_keywords) * 7.0 + len(raw_skills) * 1.5 + coverage_ratio * 30.0 + focus_ratio * 28.0
    if required_skill_keywords and not matched_skill_keywords:
        skills_score -= 18.0
    if focus_point_misses:
        skills_score -= min(24.0, len(focus_point_misses) * 5.0)
    skills_score = max(8.0, min(100.0, skills_score))
    education_score = {"博士": 98.0, "硕士": 88.0, "本科": 78.0, "大专": 65.0, "高中": 45.0}.get(str(basic_info.get("education") or ""), 60.0)
    stability_score = 80.0 if len(work_experiences) >= 3 else 68.0 if len(work_experiences) >= 1 else 55.0
    communication_score = 78.0 if parsed.get("summary") else 60.0
    dimensions = [
        {"key": "experience", "label": "经验匹配", "score": round(experience_score, 1)},
        {"key": "skills", "label": "技能匹配", "score": round(skills_score, 1)},
        {"key": "education", "label": "教育背景", "score": round(education_score, 1)},
        {"key": "stability", "label": "履历稳定性", "score": round(stability_score, 1)},
        {"key": "communication", "label": "沟通表达", "score": round(communication_score, 1)},
    ]
    weight_sum = sum(weights.values()) or 1
    total_score = sum(item["score"] * weights.get(item["key"], 0) for item in dimensions) / weight_sum
    hard_penalty = 0.0
    if required_skill_keywords:
        hard_penalty += max(0.0, (1 - coverage_ratio) * 18.0)
    if focus_point_misses:
        hard_penalty += min(20.0, len(focus_point_misses) * 4.0)
    total_score = max(0.0, total_score - hard_penalty)
    match_percent = round(total_score)
    advantages = []
    if matched_keywords:
        advantages.append(f"命中岗位关键词：{', '.join(matched_keywords[:6])}")
    if matched_skill_keywords:
        advantages.append(f"命中 Skills 硬性要求：{', '.join(matched_skill_keywords[:6])}")
    if focus_point_hits:
        advantages.append(f"命中 Skills 重点：{summarize_points(focus_point_hits[:2])}")
    if years >= 3:
        advantages.append(f"具备 {years} 年相关经验")
    if basic_info.get("education") in {"本科", "硕士", "博士"}:
        advantages.append(f"教育背景为 {basic_info.get('education')}")
    if not advantages:
        advantages.append("简历基础信息较完整，具备进一步人工筛查价值")
    concerns = []
    if not matched_keywords:
        concerns.append("与岗位要求的显式关键词匹配较少")
    if required_skill_keywords and not matched_skill_keywords:
        concerns.append("未体现当前 Skills 中强调的硬性要求")
    elif missing_skill_keywords:
        concerns.append(f"部分 Skills 关注点证据不足：{', '.join(missing_skill_keywords[:4])}")
    if focus_point_misses:
        concerns.append(f"未充分覆盖关键 Skills 场景：{summarize_points(focus_point_misses[:2])}")
    if years < 2:
        concerns.append("相关经验年限偏少")
    if not basic_info.get("phone"):
        concerns.append("缺少手机号信息")
    if not concerns:
        concerns.append("暂未发现明显一票否决项，建议结合人工面试判断")
    pass_threshold = int(status_rules.get("pass_threshold", 75))
    pool_threshold = int(status_rules.get("pool_threshold", 55))
    if match_percent >= pass_threshold:
        recommendation = "进入下一轮"
        suggested_status = "screening_passed"
    elif match_percent >= pool_threshold:
        recommendation = "保留观察"
        suggested_status = "talent_pool"
    else:
        recommendation = "淘汰"
        suggested_status = "screening_rejected"
    return {
        "dimensions": dimensions,
        "matched_keywords": matched_keywords,
        "matched_skill_keywords": matched_skill_keywords,
        "missing_skill_keywords": missing_skill_keywords,
        "focus_point_hits": focus_point_hits,
        "focus_point_misses": focus_point_misses,
        "skill_focus_points": skill_meta["points"],
        "advantages": advantages,
        "concerns": concerns,
        "recommendation": recommendation,
        "suggested_status": suggested_status,
        "match_percent": match_percent,
        "total_score": round(total_score, 1),
        "weights": weights,
    }
