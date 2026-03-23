from __future__ import annotations

import html
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

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
    "default_jd_template": {"sections": ["职位描述", "岗位职责", "任职要求", "加分项", "薪资说明", "加入我们"]},
    "default_interview_template": {"sections": ["技术题", "场景题", "行为题"]},
    "default_status_rules": {"pass_threshold": 75, "pool_threshold": 55},
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
        "skill_code": "skill-iot-resume-screener",
        "name": "IoT 测试工程师招聘助手",
        "description": "针对 IoT/软硬件测试工程师招聘的专用筛选、出题与面试分析 Skill。",
        "content": _load_recruitment_skill_template("iot_resume_screener.md"),
        "tags": ["IoT", "测试", "招聘", "智能家居"],
        "sort_order": 30,
    },
]

KNOWN_SKILLS = [
    "python", "java", "go", "javascript", "typescript", "sql", "linux", "docker", "k8s",
    "selenium", "playwright", "pytest", "jmeter", "postman", "api", "iot", "测试", "自动化",
    "性能", "嵌入式", "网络", "web", "app", "git", "质量", "需求分析", "沟通",
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
    in_list = False
    for raw_line in (markdown or "").splitlines():
        line = raw_line.strip()
        if not line:
            if in_list:
                parts.append("</ul>")
                in_list = False
            continue
        if line.startswith("### "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<h3>{html.escape(line[4:])}</h3>")
        elif line.startswith("## "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<h2>{html.escape(line[3:])}</h2>")
        elif line.startswith("# "):
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<h1>{html.escape(line[2:])}</h1>")
        elif line.startswith("- "):
            if not in_list:
                parts.append("<ul>")
                in_list = True
            parts.append(f"<li>{html.escape(line[2:])}</li>")
        else:
            if in_list:
                parts.append("</ul>")
                in_list = False
            parts.append(f"<p>{html.escape(line)}</p>")
    if in_list:
        parts.append("</ul>")
    return "".join(parts)


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
    for item in items:
        text = normalize_jd_text_block(item).strip()
        text = re.sub(r"^[0-9]+[.)\u3001]\s*", "", text)
        if text:
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
        "work_location": work_location,
        "salary_range": salary_range,
        "job_description": (
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
        "benefits": [
            "\u53c2\u4e0e\u6838\u5fc3\u4e1a\u52a1\u5efa\u8bbe\uff0c\u63a5\u89e6\u9ad8\u4ef7\u503c\u9879\u76ee\u4e0e\u590d\u6742\u573a\u666f\u3002",
            "\u4e0e\u9ad8\u534f\u540c\u56e2\u961f\u5171\u4e8b\uff0c\u62e5\u6709\u6e05\u6670\u6210\u957f\u8def\u5f84\u4e0e\u53d1\u5c55\u7a7a\u95f4\u3002",
        ],
    }


def normalize_structured_jd(payload: Dict[str, Any], position: Any) -> Dict[str, Any]:
    fallback = build_jd_structured_fallback(position)
    return {
        "job_title": normalize_jd_text_block(payload.get("job_title") or payload.get("title") or fallback["job_title"]),
        "work_location": normalize_jd_text_block(payload.get("work_location") or payload.get("location") or fallback["work_location"]),
        "salary_range": normalize_jd_text_block(payload.get("salary_range") or fallback["salary_range"]),
        "job_description": normalize_jd_text_block(payload.get("job_description") or payload.get("summary") or fallback["job_description"]),
        "responsibilities": normalize_jd_list(payload.get("responsibilities") or fallback["responsibilities"]),
        "requirements": normalize_jd_list(payload.get("requirements") or fallback["requirements"]),
        "bonus_points": normalize_jd_list(payload.get("bonus_points") or fallback["bonus_points"]),
        "benefits": normalize_jd_list(payload.get("benefits") or fallback["benefits"]),
    }


def render_publish_ready_jd(jd_payload: Dict[str, Any]) -> str:
    title = normalize_jd_text_block(jd_payload.get("job_title") or jd_payload.get("title") or "")
    location = normalize_jd_text_block(jd_payload.get("work_location") or jd_payload.get("location") or "")
    salary = normalize_jd_text_block(jd_payload.get("salary_range") or "")
    description = normalize_jd_text_block(jd_payload.get("job_description") or jd_payload.get("summary") or "")
    responsibilities = normalize_jd_list(jd_payload.get("responsibilities") or [])
    requirements = normalize_jd_list(jd_payload.get("requirements") or [])
    bonus_points = normalize_jd_list(jd_payload.get("bonus_points") or [])
    benefits = normalize_jd_list(jd_payload.get("benefits") or [])

    blocks: List[str] = []
    if title:
        blocks.append(f"\u5c97\u4f4d\u540d\u79f0\uff1a{title}")
    if location:
        blocks.append(f"\u5de5\u4f5c\u5730\u70b9\uff1a{location}")
    if salary:
        blocks.append(f"\u85aa\u8d44\u8303\u56f4\uff1a{salary}")
    if description:
        blocks.append(f"\u804c\u4f4d\u63cf\u8ff0\uff1a\n{description}")
    if responsibilities:
        blocks.append("\u5c97\u4f4d\u804c\u8d23\uff1a\n" + "\n".join(f"{index + 1}. {item}" for index, item in enumerate(responsibilities)))
    if requirements:
        blocks.append("\u4efb\u804c\u8981\u6c42\uff1a\n" + "\n".join(f"{index + 1}. {item}" for index, item in enumerate(requirements)))
    if bonus_points:
        blocks.append("\u52a0\u5206\u9879\uff1a\n" + "\n".join(f"{index + 1}. {item}" for index, item in enumerate(bonus_points)))
    if benefits:
        blocks.append("\u798f\u5229\u4eae\u70b9\uff1a\n" + "\n".join(f"{index + 1}. {item}" for index, item in enumerate(benefits)))
    return "\n\n".join(blocks).strip()


def render_jd_markdown_source(jd_payload: Dict[str, Any]) -> str:
    title = normalize_jd_text_block(jd_payload.get("job_title") or jd_payload.get("title") or "")
    location = normalize_jd_text_block(jd_payload.get("work_location") or jd_payload.get("location") or "")
    salary = normalize_jd_text_block(jd_payload.get("salary_range") or "")
    description = normalize_jd_text_block(jd_payload.get("job_description") or jd_payload.get("summary") or "")
    responsibilities = normalize_jd_list(jd_payload.get("responsibilities") or [])
    requirements = normalize_jd_list(jd_payload.get("requirements") or [])
    bonus_points = normalize_jd_list(jd_payload.get("bonus_points") or [])
    benefits = normalize_jd_list(jd_payload.get("benefits") or [])

    sections: List[str] = []
    if title:
        sections.append(f"# {title}")
    if location:
        sections.append(f"## \u5de5\u4f5c\u5730\u70b9\n{location}")
    if salary:
        sections.append(f"## \u85aa\u8d44\u8303\u56f4\n{salary}")
    if description:
        sections.append(f"## \u804c\u4f4d\u63cf\u8ff0\n{description}")
    if responsibilities:
        sections.append("## \u5c97\u4f4d\u804c\u8d23\n" + "\n".join(f"- {item}" for item in responsibilities))
    if requirements:
        sections.append("## \u4efb\u804c\u8981\u6c42\n" + "\n".join(f"- {item}" for item in requirements))
    if bonus_points:
        sections.append("## \u52a0\u5206\u9879\n" + "\n".join(f"- {item}" for item in bonus_points))
    if benefits:
        sections.append("## \u798f\u5229\u4eae\u70b9\n" + "\n".join(f"- {item}" for item in benefits))
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
    work_experiences = [line for line in lines if re.search(r"20\d{2}|有限公司|公司|科技|集团|Inc|Ltd", line)][:8]
    education_items = [line for line in lines if any(keyword in line for keyword in ["大学", "学院", "本科", "硕士", "博士", "专业"] )][:6]
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
        for source in [description, content]:
            if not source:
                continue
            plain = strip_markdown(source)
            segments = re.split(r"[\n\r。；;]+", plain)

            for segment in segments:
                cleaned = re.sub(r"^[\-\*\d\.\s•]+", "", segment).strip()
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


def build_interview_fallback(candidate_name: str, position_title: str, round_name: str, skills: Iterable[Any], custom_requirements: str) -> Dict[str, str]:
    skill_meta = _extract_skill_focus_points(skills)
    skill_text = "、".join(skill_meta["names"][:5]) or "当前启用 Skills"
    focus_points = skill_meta["points"]
    focus_lines = [f"- {point}" for point in focus_points[:4]] or ["- 本轮重点核实候选人与岗位技能要求的真实匹配度。"]
    technical_lines = [
        f"- 请介绍你在 {position_title} 相关项目中的核心职责，以及最有代表性的成果。",
        "- 如果要让你在 2 周内接手一个新模块，你会如何快速完成业务、流程与技术摸底？",
        f"- 结合 {skill_text}，请举例说明你如何建立可复用的方法或规范。",
    ]
    for point in focus_points[:3]:
        technical_lines.append(f"- 请结合真实项目，说明你如何处理“{point}”这类要求或场景。")
    markdown = f"""# {candidate_name} - {round_name} 面试题

## 本次 Skills 关注点
{chr(10).join(focus_lines)}

## 技术题
{chr(10).join(technical_lines)}

## 场景题
- 如果上线前一天出现阻塞问题，你会如何组织排查并向干系人同步风险？
- 当需求频繁变更、资源有限时，你如何判断优先级并保证交付质量？
- 当 Skills 中的规则与项目现状冲突时，你会如何取舍并说明依据？

## 行为题
- 请分享一次你推动跨团队协作并最终达成目标的经历。
- 遇到与上级或合作方意见冲突时，你通常如何处理？

## 追问建议
- 深挖候选人是否真的亲自完成关键工作，而非仅参与配合。
- 判断候选人是否具备复盘意识、风险意识与稳定交付能力。
- 对照本次 Skills 关注点，确认候选人是否给出了具体证据而非泛泛而谈。

## 自定义要求
- {custom_requirements or '本轮重点关注候选人与岗位的真实匹配度、执行力与成长空间。'}"""
    return {"markdown": markdown, "html": markdown_to_html(markdown)}


def score_candidate_fallback(position: Any, parsed: Dict[str, Any], weights: Dict[str, float], status_rules: Dict[str, Any]) -> Dict[str, Any]:
    basic_info = parsed.get("basic_info") or {}
    raw_skills = parsed.get("skills") or []
    work_experiences = parsed.get("work_experiences") or []
    requirement_text = " ".join(filter(None, [position.title, getattr(position, "key_requirements", "") or "", getattr(position, "bonus_points", "") or ""]))
    requirement_keywords = extract_keywords(requirement_text)
    matched_keywords = [keyword for keyword in requirement_keywords if keyword and keyword in (" ".join(raw_skills) + " " + parsed.get("summary", "")).lower()]

    years = 0
    years_match = re.search(r"(\d{1,2})", str(basic_info.get("years_of_experience") or ""))
    if years_match:
        years = int(years_match.group(1))

    experience_score = min(100.0, years * 20.0) if years else 55.0
    skills_score = min(100.0, 45.0 + len(matched_keywords) * 12.0 + len(raw_skills) * 2.0)
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
    match_percent = round(total_score)
    advantages = []
    if matched_keywords:
        advantages.append(f"命中岗位关键词：{', '.join(matched_keywords[:6])}")
    if years >= 3:
        advantages.append(f"具备 {years} 年相关经验")
    if basic_info.get("education") in {"本科", "硕士", "博士"}:
        advantages.append(f"教育背景为 {basic_info.get('education')}")
    if not advantages:
        advantages.append("简历基础信息较完整，具备进一步人工筛查价值")
    concerns = []
    if not matched_keywords:
        concerns.append("与岗位要求的显式关键词匹配较少")
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
        "advantages": advantages,
        "concerns": concerns,
        "recommendation": recommendation,
        "suggested_status": suggested_status,
        "match_percent": match_percent,
        "total_score": round(total_score, 1),
        "weights": weights,
    }

