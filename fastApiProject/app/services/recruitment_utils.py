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
    "default_jd_template": {"sections": ["岗位概述", "岗位职责", "任职要求", "加分项"]},
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
    skill_meta = _extract_skill_focus_points(skills, limit=24)
    resume_lines = _collect_resume_lines(parsed_resume, limit=28)
    focus_points = _filter_interview_focus_points(skill_meta["points"], limit=6)
    if not focus_points:
        focus_points = _infer_interview_topics(parsed_resume) or ["项目经历核实", "问题定位能力", "测试设计能力", "跨团队协作"]
    advantages = [strip_markdown(str(item or "")).strip() for item in (screening_result or {}).get("advantages") or [] if str(item or "").strip()]
    concerns = [strip_markdown(str(item or "")).strip() for item in (screening_result or {}).get("concerns") or [] if str(item or "").strip()]
    candidate_basic = (parsed_resume or {}).get("basic_info") or {}
    background_lines = [
        f"- 候选人：{candidate_name or candidate_basic.get('name') or '未命名候选人'}",
        f"- 岗位：{position_title or '当前岗位'}",
        f"- 工作年限：{candidate_basic.get('years_of_experience') or '简历未明确'}",
        f"- 学历：{candidate_basic.get('education') or '简历未明确'}",
        f"- 初筛状态：{_screening_status_label(screening_result)}",
    ]
    if advantages:
        background_lines.append(f"- 已识别亮点：{'；'.join(advantages[:3])}")
    if concerns:
        background_lines.append(f"- 重点待核实：{'；'.join(concerns[:3])}")

    module_sections: List[str] = []
    for index, topic in enumerate(focus_points, 1):
        evidence_lines = _find_resume_evidence(resume_lines, topic, limit=2)
        evidence_text = "；".join(evidence_lines[:2]) or "简历中暂无直接证据，需要面试中重点核实。"
        main_question = (
            f"请结合你简历里提到的“{evidence_lines[0]}”，详细说明你在“{topic}”相关场景中实际负责的测试对象、测试步骤、发现的问题以及最终输出。"
            if evidence_lines
            else f"围绕“{topic}”，请结合真实项目说明你会如何搭建测试场景、设计用例、执行验证并定位问题。"
        )
        answer_points = [
            f"- 说明 {topic} 相关的真实项目背景、测试对象和边界。",
            "- 能讲清测试步骤、观测指标、缺陷定位方法和结果闭环。",
            f"- 回答必须与简历原文或岗位 JD 对齐，不能泛泛而谈。{(' 需要补充解释简历未写明的部分。' if not evidence_lines else '')}",
        ]
        verdict_lines = [
            "- 通过：能给出具体项目证据、测试路径、关键问题与复盘结论。",
            "- 注意：只会讲原则，不清楚测试对象、输入输出和缺陷闭环。",
            "- 一票否决：把未做过的内容说成做过，或核心细节前后矛盾。",
        ]
        followups = [
            f"- 如果让你再做一次“{topic}”相关测试，你会优先补哪 2 个风险场景？",
            "- 你如何判断这个问题属于需求、研发实现、协议/环境还是测试设计本身？",
        ]
        explain_line = f"- 这道题用于验证候选人在“{topic}”上的真实经历深度，以及是否能把简历中的项目经验转化成可复盘的测试方法。"
        module_sections.extend([
            f"## 模块 {index} · {topic}",
            f"- 面试题正题：{main_question}",
            "- 参考答案要点：",
            *answer_points,
            "- 通过 / 注意 / 一票否决判定：",
            *verdict_lines,
            "- 追问环节：",
            *followups,
            "- 答不出时·面试官解释：",
            explain_line,
            f"- 简历依据 / 待核实：{evidence_text}",
        ])

    markdown = "\n".join([
        f"# {candidate_name} - {round_name} 面试题",
        "",
        "## 候选人背景",
        *background_lines,
        "",
        "## 本轮 Skill 关注点",
        *[f"- {point}" for point in focus_points],
        "",
        *module_sections,
        "",
        "## 自定义要求",
        f"- {custom_requirements or '本轮重点关注候选人与岗位的真实匹配度、执行力与成长空间。'}",
    ]).strip()
    return {"markdown": markdown, "html": markdown_to_html(markdown)}


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
