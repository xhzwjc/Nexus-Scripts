from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
import re
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..recruitment_models import (
    RecruitmentAITaskLog,
    RecruitmentCandidate,
    RecruitmentCandidateScore,
    RecruitmentCandidateStatusHistory,
    RecruitmentCandidateWorkflowMemory,
    RecruitmentChatContextMemory,
    RecruitmentInterviewQuestion,
    RecruitmentJDVersion,
    RecruitmentLLMConfig,
    RecruitmentMailRecipient,
    RecruitmentMailSenderConfig,
    RecruitmentPosition,
    RecruitmentPositionSkillLink,
    RecruitmentPublishTask,
    RecruitmentResumeFile,
    RecruitmentResumeMailDispatch,
    RecruitmentResumeParseResult,
    RecruitmentRuleConfig,
    RecruitmentSkill,
)
from ..secret_crypto import decrypt_secret, encrypt_secret, mask_secret
from .recruitment_ai_gateway import RecruitmentAIGateway, get_provider_options
from .recruitment_mailer import RecruitmentMailSenderRuntime, build_resume_email, load_attachment_from_path, send_email_via_smtp
from .recruitment_prompts import INTERVIEW_QUESTION_SYSTEM_PROMPT, RESUME_PARSE_SYSTEM_PROMPT, RESUME_SCORE_SYSTEM_PROMPT
from .recruitment_publish_adapters import build_publish_adapter
from .recruitment_utils import CANDIDATE_STATUS_OPTIONS, DEFAULT_RULE_CONFIGS, POSITION_STATUS_OPTIONS, RECRUITMENT_UPLOAD_ROOT, build_interview_fallback, build_jd_fallback, extract_resume_structured_data, extract_resume_text, isoformat_or_none, json_dumps_safe, json_loads_safe, markdown_to_html, render_publish_ready_jd, safe_file_stem, score_candidate_fallback, strip_markdown, truncate_text

KNOWN_AI_TASK_TYPES = ["jd_generation", "resume_parse", "resume_score", "interview_question_generation", "chat_orchestrator", "resume_mail_dispatch", "publish_task"]
LLM_TASK_TYPE_OPTIONS = [{"value": "default", "label": "默认模型"}, {"value": "jd_generation", "label": "JD 生成"}, {"value": "resume_parse", "label": "简历解析"}, {"value": "resume_score", "label": "简历评分"}, {"value": "interview_question_generation", "label": "面试题生成"}, {"value": "chat_orchestrator", "label": "AI 助手"}]

class RecruitmentConflictError(RuntimeError):
    pass


def _dedupe_ints(values: Iterable[Any]) -> List[int]:
    result: List[int] = []
    for value in values:
        try:
            item = int(value)
        except (TypeError, ValueError):
            continue
        if item not in result:
            result.append(item)
    return result


def _dedupe_texts(values: Iterable[Any]) -> List[str]:
    result: List[str] = []
    for value in values:
        text = str(value or "").strip()
        if text and text not in result:
            result.append(text)
    return result


def _slugify(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9]+", "-", value or "").strip("-").lower()
    return text[:40] if text else uuid.uuid4().hex[:8]


def _snapshot_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json_dumps_safe(value)


def _truncate_utf8_text(value: Optional[str], max_bytes: int) -> Optional[str]:
    if value is None:
        return None
    raw = value.encode("utf-8")
    if len(raw) <= max_bytes:
        return value
    clipped = raw[: max_bytes - 3]
    while clipped:
        try:
            return clipped.decode("utf-8") + "..."
        except UnicodeDecodeError:
            clipped = clipped[:-1]
    return "..."


class RecruitmentService:
    def __init__(self, db: Session):
        self.db = db
        self.ai_gateway = RecruitmentAIGateway(db)

    def _build_request_hash(self, *parts: Any) -> str:
        raw = "||".join([str(part or "") for part in parts])
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]

    def _safe_encrypt_secret(self, plaintext: str) -> str:
        try:
            return encrypt_secret(plaintext)
        except RuntimeError as exc:
            raise ValueError("敏感信息加密失败，请检查服务端密钥配置。") from exc

    def _get_rule_config(self, config_key: str, default: Any) -> Any:
        row = self.db.query(RecruitmentRuleConfig).filter(RecruitmentRuleConfig.config_key == config_key, RecruitmentRuleConfig.scope == "global").first()
        if not row:
            return DEFAULT_RULE_CONFIGS.get(config_key, default)
        return json_loads_safe(row.config_value, default) if row.config_type == "json" else row.config_value or default

    def _get_position(self, position_id: int) -> RecruitmentPosition:
        row = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == position_id, RecruitmentPosition.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        return row

    def _get_candidate(self, candidate_id: int) -> RecruitmentCandidate:
        row = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == candidate_id, RecruitmentCandidate.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        return row

    def _get_skill(self, skill_id: int) -> RecruitmentSkill:
        row = self.db.query(RecruitmentSkill).filter(RecruitmentSkill.id == skill_id, RecruitmentSkill.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        return row

    def _get_resume_file(self, resume_file_id: int) -> RecruitmentResumeFile:
        row = self.db.query(RecruitmentResumeFile).filter(RecruitmentResumeFile.id == resume_file_id).first()
        if not row:
            raise ValueError("绠€鍘嗘枃浠朵笉瀛樺湪")
        return row

    def _get_workflow_memory(self, candidate_id: int) -> Optional[RecruitmentCandidateWorkflowMemory]:
        return self.db.query(RecruitmentCandidateWorkflowMemory).filter(RecruitmentCandidateWorkflowMemory.candidate_id == candidate_id).first()

    def _get_or_create_workflow_memory(self, candidate: RecruitmentCandidate, actor_id: str) -> RecruitmentCandidateWorkflowMemory:
        row = self._get_workflow_memory(candidate.id)
        if row:
            return row
        row = RecruitmentCandidateWorkflowMemory(candidate_id=candidate.id, position_id=candidate.position_id, screening_skill_ids_json=json_dumps_safe([]), interview_skill_ids_json=json_dumps_safe([]), created_by=actor_id, updated_by=actor_id)
        self.db.add(row)
        self.db.flush()
        return row

    def _load_skill_rows(self, skill_ids: Iterable[Any], *, enabled_only: bool = False) -> List[RecruitmentSkill]:
        normalized = _dedupe_ints(skill_ids)
        if not normalized:
            return []
        query = self.db.query(RecruitmentSkill).filter(RecruitmentSkill.id.in_(normalized), RecruitmentSkill.deleted.is_(False))
        if enabled_only:
            query = query.filter(RecruitmentSkill.is_enabled.is_(True))
        rows = query.order_by(RecruitmentSkill.sort_order.asc(), RecruitmentSkill.id.asc()).all()
        order_map = {skill_id: index for index, skill_id in enumerate(normalized)}
        rows.sort(key=lambda item: order_map.get(item.id, 9999))
        return rows

    def _load_enabled_skills(self) -> List[RecruitmentSkill]:
        return self.db.query(RecruitmentSkill).filter(RecruitmentSkill.deleted.is_(False), RecruitmentSkill.is_enabled.is_(True)).order_by(RecruitmentSkill.sort_order.asc(), RecruitmentSkill.id.asc()).all()

    def _get_position_skill_rows(self, position_id: Optional[int]) -> List[RecruitmentSkill]:
        if not position_id:
            return []
        links = self.db.query(RecruitmentPositionSkillLink).filter(RecruitmentPositionSkillLink.position_id == position_id).order_by(RecruitmentPositionSkillLink.id.asc()).all()
        return self._load_skill_rows([link.skill_id for link in links], enabled_only=True)

    def _sync_position_skill_links(self, position_id: int, skill_ids: Iterable[Any], actor_id: str) -> None:
        self.db.query(RecruitmentPositionSkillLink).filter(RecruitmentPositionSkillLink.position_id == position_id).delete(synchronize_session=False)
        for skill_id in _dedupe_ints(skill_ids):
            self.db.add(RecruitmentPositionSkillLink(position_id=position_id, skill_id=skill_id, created_by=actor_id, updated_by=actor_id))
        self.db.flush()
    def _create_status_history(self, candidate: RecruitmentCandidate, to_status: str, reason: str, actor_id: str, source: str) -> None:
        self.db.add(RecruitmentCandidateStatusHistory(candidate_id=candidate.id, from_status=candidate.status, to_status=to_status, reason=reason or None, changed_by=actor_id, source=source))
        candidate.status = to_status
        candidate.updated_by = actor_id
        self.db.flush()

    def _create_ai_task_log(self, task_type: str, *, created_by: str, related_position_id: Optional[int] = None, related_candidate_id: Optional[int] = None, related_skill_ids: Optional[Iterable[Any]] = None, related_skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None, related_resume_file_id: Optional[int] = None, related_publish_task_id: Optional[int] = None, memory_source: Optional[str] = None, request_hash: Optional[str] = None) -> RecruitmentAITaskLog:
        row = RecruitmentAITaskLog(task_type=task_type, related_position_id=related_position_id, related_candidate_id=related_candidate_id, related_skill_id=None, related_skill_ids_json=json_dumps_safe(_dedupe_ints(related_skill_ids or [])), related_skill_snapshots_json=json_dumps_safe(list(related_skill_snapshots or [])), related_resume_file_id=related_resume_file_id, related_publish_task_id=related_publish_task_id, memory_source=memory_source, request_hash=request_hash, status="pending", created_by=created_by)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def _update_ai_task_log(self, row: RecruitmentAITaskLog, *, status: Optional[str] = None, prompt_snapshot: Optional[str] = None, input_summary: Optional[str] = None, output_summary: Optional[str] = None, output_snapshot: Optional[Any] = None, error_message: Optional[str] = None) -> RecruitmentAITaskLog:
        if status is not None:
            row.status = status
        if prompt_snapshot is not None:
            row.prompt_snapshot = _truncate_utf8_text(prompt_snapshot, 24000)
        if input_summary is not None:
            row.input_summary = _truncate_utf8_text(input_summary, 12000)
        if output_summary is not None:
            row.output_summary = _truncate_utf8_text(output_summary, 12000)
        if output_snapshot is not None:
            row.output_snapshot = _truncate_utf8_text(_snapshot_text(output_snapshot), 24000)
        if error_message is not None:
            row.error_message = _truncate_utf8_text(error_message, 12000)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def _finish_ai_task_log(self, row: RecruitmentAITaskLog, *, status: str, provider: Optional[str] = None, model_name: Optional[str] = None, prompt_snapshot: Optional[str] = None, input_summary: Optional[str] = None, output_summary: Optional[str] = None, output_snapshot: Optional[Any] = None, error_message: Optional[str] = None, token_usage: Optional[Dict[str, Any]] = None, memory_source: Optional[str] = None, related_skill_ids: Optional[Iterable[Any]] = None, related_skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None) -> RecruitmentAITaskLog:
        row.status = status
        row.model_provider = provider
        row.model_name = model_name
        row.prompt_snapshot = _truncate_utf8_text(prompt_snapshot, 24000)
        row.input_summary = _truncate_utf8_text(input_summary, 12000)
        row.output_summary = _truncate_utf8_text(output_summary, 12000)
        row.output_snapshot = _truncate_utf8_text(_snapshot_text(output_snapshot), 24000)
        row.error_message = _truncate_utf8_text(error_message, 12000)
        row.token_usage_json = json_dumps_safe(token_usage or {}) if token_usage else None
        if memory_source is not None:
            row.memory_source = memory_source
        if related_skill_ids is not None:
            row.related_skill_ids_json = json_dumps_safe(_dedupe_ints(related_skill_ids))
        if related_skill_snapshots is not None:
            row.related_skill_snapshots_json = json_dumps_safe(list(related_skill_snapshots))
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def _serialize_skill(self, row: RecruitmentSkill) -> Dict[str, Any]:
        return {"id": row.id, "skill_code": row.skill_code, "name": row.name, "description": row.description, "content": row.content, "tags": json_loads_safe(row.tags_json, []), "sort_order": row.sort_order, "is_enabled": bool(row.is_enabled), "created_by": row.created_by, "updated_by": row.updated_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _serialize_skill_snapshot(self, skill: Any, fallback_index: int = 0) -> Dict[str, Any]:
        if isinstance(skill, dict):
            tags = skill.get("tags") or []
            return {
                "id": int(skill.get("id") or (-(fallback_index + 1))),
                "skill_code": str(skill.get("skill_code") or f"snapshot-{fallback_index + 1}"),
                "name": str(skill.get("name") or f"Skill #{fallback_index + 1}"),
                "description": skill.get("description"),
                "content": str(skill.get("content") or ""),
                "tags": tags if isinstance(tags, list) else [],
                "sort_order": int(skill.get("sort_order") or 999),
                "is_enabled": bool(skill.get("is_enabled", True)),
            }
        if isinstance(skill, RecruitmentSkill):
            return {
                "id": skill.id,
                "skill_code": skill.skill_code,
                "name": skill.name,
                "description": skill.description,
                "content": skill.content,
                "tags": json_loads_safe(skill.tags_json, []),
                "sort_order": skill.sort_order,
                "is_enabled": bool(skill.is_enabled),
            }
        text = str(skill or "").strip()
        return {
            "id": -(fallback_index + 1),
            "skill_code": f"snapshot-{fallback_index + 1}",
            "name": text or f"Skill #{fallback_index + 1}",
            "description": None,
            "content": text,
            "tags": [],
            "sort_order": 999,
            "is_enabled": True,
        }

    def _build_skill_snapshots(self, skill_rows: Sequence[RecruitmentSkill], custom_requirements: str = "", *, custom_name: str = "附加硬性要求") -> List[Dict[str, Any]]:
        snapshots = [self._serialize_skill_snapshot(skill, index) for index, skill in enumerate(skill_rows)]
        extra_requirement = str(custom_requirements or "").strip()
        if extra_requirement:
            snapshots.append(
                self._serialize_skill_snapshot(
                    {
                        "id": -(len(snapshots) + 1),
                        "skill_code": "custom-hard-requirement",
                        "name": custom_name,
                        "description": "本次临时追加的招聘硬性条件",
                        "content": extra_requirement,
                        "tags": ["临时条件", "硬性要求"],
                        "sort_order": 10000,
                        "is_enabled": True,
                    },
                    len(snapshots),
                )
            )
        return snapshots

    def _extract_related_skill_ids(self, skill_snapshots: Sequence[Dict[str, Any]]) -> List[int]:
        ids: List[int] = []
        for skill in skill_snapshots:
            try:
                skill_id = int(skill.get("id") or 0)
            except (TypeError, ValueError, AttributeError):
                continue
            if skill_id > 0 and skill_id not in ids:
                ids.append(skill_id)
        return ids

    def _serialize_ai_task_log(self, row: RecruitmentAITaskLog) -> Dict[str, Any]:
        return {"id": row.id, "task_type": row.task_type, "related_position_id": row.related_position_id, "related_candidate_id": row.related_candidate_id, "related_skill_id": row.related_skill_id, "related_skill_ids": json_loads_safe(row.related_skill_ids_json, []), "related_skill_snapshots": json_loads_safe(row.related_skill_snapshots_json, []), "related_resume_file_id": row.related_resume_file_id, "related_publish_task_id": row.related_publish_task_id, "memory_source": row.memory_source, "request_hash": row.request_hash, "model_provider": row.model_provider, "model_name": row.model_name, "prompt_snapshot": row.prompt_snapshot, "input_summary": row.input_summary, "output_summary": row.output_summary, "output_snapshot": row.output_snapshot, "status": row.status, "error_message": row.error_message, "token_usage": json_loads_safe(row.token_usage_json, None), "created_by": row.created_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _serialize_jd_version(self, row: RecruitmentJDVersion) -> Dict[str, Any]:
        return {"id": row.id, "position_id": row.position_id, "version_no": row.version_no, "title": row.title, "prompt_snapshot": row.prompt_snapshot, "jd_markdown": row.jd_markdown or "", "jd_html": row.jd_html, "publish_text": row.publish_text, "notes": row.notes, "is_active": bool(row.is_active), "created_by": row.created_by, "created_at": isoformat_or_none(row.created_at)}

    def _serialize_publish_task(self, row: RecruitmentPublishTask) -> Dict[str, Any]:
        return {"id": row.id, "position_id": row.position_id, "target_platform": row.target_platform, "mode": row.mode, "adapter_code": row.adapter_code, "status": row.status, "request_payload": json_loads_safe(row.request_payload, None), "response_payload": json_loads_safe(row.response_payload, None), "published_url": row.published_url, "screenshot_path": row.screenshot_path, "retry_count": row.retry_count, "error_message": row.error_message, "created_by": row.created_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _serialize_position(self, row: RecruitmentPosition) -> Dict[str, Any]:
        skill_rows = self._get_position_skill_rows(row.id)
        current_jd = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.id == row.current_jd_version_id).first() if row.current_jd_version_id else None
        if not current_jd:
            current_jd = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == row.id, RecruitmentJDVersion.is_active.is_(True)).order_by(RecruitmentJDVersion.version_no.desc(), RecruitmentJDVersion.id.desc()).first()
        jd_version_count = self.db.query(func.count(RecruitmentJDVersion.id)).filter(RecruitmentJDVersion.position_id == row.id).scalar() or 0
        candidate_count = self.db.query(func.count(RecruitmentCandidate.id)).filter(RecruitmentCandidate.position_id == row.id, RecruitmentCandidate.deleted.is_(False)).scalar() or 0
        return {"id": row.id, "position_code": row.position_code, "title": row.title, "department": row.department, "location": row.location, "employment_type": row.employment_type, "salary_range": row.salary_range, "headcount": row.headcount, "key_requirements": row.key_requirements, "bonus_points": row.bonus_points, "summary": row.summary, "status": row.status, "auto_screen_on_upload": bool(row.auto_screen_on_upload), "auto_advance_on_screening": bool(row.auto_advance_on_screening), "screening_skill_ids": [skill.id for skill in skill_rows], "screening_skills": [self._serialize_skill(skill) for skill in skill_rows], "tags": json_loads_safe(row.tags_json, []), "current_jd_version_id": row.current_jd_version_id, "current_jd_title": current_jd.title if current_jd else None, "jd_version_count": int(jd_version_count), "candidate_count": int(candidate_count), "created_by": row.created_by, "updated_by": row.updated_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _serialize_resume_file(self, row: RecruitmentResumeFile) -> Dict[str, Any]:
        return {"id": row.id, "candidate_id": row.candidate_id, "original_name": row.original_name, "stored_name": row.stored_name, "file_ext": row.file_ext, "mime_type": row.mime_type, "file_size": row.file_size, "parse_status": row.parse_status, "parse_error": row.parse_error, "created_at": isoformat_or_none(row.created_at)}

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "candidate_statuses": CANDIDATE_STATUS_OPTIONS,
            "position_statuses": POSITION_STATUS_OPTIONS,
            "publish_platforms": [
                {"value": "boss", "label": "BOSS 鐩磋仒"},
                {"value": "zhilian", "label": "鏅鸿仈鎷涜仒"},
                {"value": "mock", "label": "Mock"},
            ],
            "publish_modes": [
                {"value": "mock", "label": "妯℃嫙鍙戝竷"},
                {"value": "live", "label": "瀹為檯鍙戝竷"},
            ],
            "ai_task_types": KNOWN_AI_TASK_TYPES,
            "llm_provider_options": get_provider_options(),
            "llm_task_types": LLM_TASK_TYPE_OPTIONS,
        }

    def get_dashboard(self) -> Dict[str, Any]:
        positions = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.deleted.is_(False)).all()
        candidates = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.deleted.is_(False)).all()
        recent_candidates = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.deleted.is_(False)).order_by(RecruitmentCandidate.created_at.desc(), RecruitmentCandidate.id.desc()).limit(8).all()
        distribution: Dict[str, int] = {}
        for candidate in candidates:
            distribution[candidate.status] = distribution.get(candidate.status, 0) + 1
        return {"cards": {"positions_total": len(positions), "positions_recruiting": len([item for item in positions if item.status == "recruiting"]), "candidates_total": len(candidates), "pending_screening": len([item for item in candidates if item.status == "pending_screening"]), "screening_passed": len([item for item in candidates if item.status in {"screening_passed", "pending_interview", "interview_passed", "pending_offer", "offer_sent", "hired"}]), "recent_ai_tasks": self.db.query(RecruitmentAITaskLog).count()}, "status_distribution": [{"status": key, "count": value} for key, value in sorted(distribution.items(), key=lambda item: item[0])], "recent_candidates": [self._serialize_candidate_summary(item) for item in recent_candidates]}

    def list_positions(self, query: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        builder = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.deleted.is_(False))
        if status:
            builder = builder.filter(RecruitmentPosition.status == status)
        if query:
            keyword = f"%{query.strip()}%"
            builder = builder.filter(or_(RecruitmentPosition.title.like(keyword), RecruitmentPosition.department.like(keyword), RecruitmentPosition.location.like(keyword), RecruitmentPosition.summary.like(keyword)))
        return [self._serialize_position(row) for row in builder.order_by(RecruitmentPosition.updated_at.desc(), RecruitmentPosition.id.desc()).all()]

    def create_position(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = RecruitmentPosition(position_code=f"TMP-{uuid.uuid4().hex[:8]}", title=str(payload.get("title") or "").strip(), department=payload.get("department"), location=payload.get("location"), employment_type=payload.get("employment_type"), salary_range=payload.get("salary_range"), headcount=int(payload.get("headcount") or 1), key_requirements=payload.get("key_requirements"), bonus_points=payload.get("bonus_points"), summary=payload.get("summary"), status=payload.get("status") or "draft", auto_screen_on_upload=bool(payload.get("auto_screen_on_upload")), auto_advance_on_screening=payload.get("auto_advance_on_screening") is not False, tags_json=json_dumps_safe(payload.get("tags") or []), created_by=actor_id, updated_by=actor_id, deleted=False)
        self.db.add(row)
        self.db.flush()
        row.position_code = f"POS-{row.id:05d}"
        self._sync_position_skill_links(row.id, payload.get("screening_skill_ids") or [], actor_id)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_position(row)

    def update_position(self, position_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = self._get_position(position_id)
        for field in ["title", "department", "location", "employment_type", "salary_range", "headcount", "key_requirements", "bonus_points", "summary", "status", "auto_screen_on_upload", "auto_advance_on_screening"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "tags" in payload:
            row.tags_json = json_dumps_safe(payload.get("tags") or [])
        if "screening_skill_ids" in payload:
            self._sync_position_skill_links(position_id, payload.get("screening_skill_ids") or [], actor_id)
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_position(row)

    def delete_position(self, position_id: int, actor_id: str) -> None:
        row = self._get_position(position_id)
        row.deleted = True
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()

    def get_position_detail(self, position_id: int) -> Dict[str, Any]:
        row = self._get_position(position_id)
        jd_versions = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == row.id).order_by(RecruitmentJDVersion.version_no.desc(), RecruitmentJDVersion.id.desc()).all()
        current_jd = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.id == row.current_jd_version_id).first() if row.current_jd_version_id else None
        if not current_jd:
            current_jd = next((item for item in jd_versions if item.is_active), None)
        latest_log = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.task_type == "jd_generation", RecruitmentAITaskLog.related_position_id == row.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).first()
        jd_generation = None if not latest_log else {"status": latest_log.status, "task_id": latest_log.id, "last_generated_at": isoformat_or_none(latest_log.updated_at or latest_log.created_at), "started_at": isoformat_or_none(latest_log.created_at), "error_message": latest_log.error_message, "model_provider": latest_log.model_provider, "model_name": latest_log.model_name}
        publish_tasks = self.db.query(RecruitmentPublishTask).filter(RecruitmentPublishTask.position_id == row.id).order_by(RecruitmentPublishTask.created_at.desc(), RecruitmentPublishTask.id.desc()).all()
        candidates = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.position_id == row.id, RecruitmentCandidate.deleted.is_(False)).order_by(RecruitmentCandidate.updated_at.desc(), RecruitmentCandidate.id.desc()).all()
        return {"position": self._serialize_position(row), "current_jd_version": self._serialize_jd_version(current_jd) if current_jd else None, "jd_versions": [self._serialize_jd_version(item) for item in jd_versions], "jd_generation": jd_generation, "publish_tasks": [self._serialize_publish_task(item) for item in publish_tasks], "candidates": [self._serialize_candidate_summary(item) for item in candidates]}

    def list_skills(self) -> List[Dict[str, Any]]:
        return [self._serialize_skill(row) for row in self.db.query(RecruitmentSkill).filter(RecruitmentSkill.deleted.is_(False)).order_by(RecruitmentSkill.sort_order.asc(), RecruitmentSkill.id.asc()).all()]

    def create_skill(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = RecruitmentSkill(skill_code=f"skill-{_slugify(str(payload.get('name') or 'skill'))}-{uuid.uuid4().hex[:4]}", name=str(payload.get("name") or "").strip(), description=payload.get("description"), content=str(payload.get("content") or "").strip(), tags_json=json_dumps_safe(payload.get("tags") or []), sort_order=int(payload.get("sort_order") or 99), is_enabled=payload.get("is_enabled") is not False, created_by=actor_id, updated_by=actor_id, deleted=False)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_skill(row)

    def update_skill(self, skill_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = self._get_skill(skill_id)
        for field in ["name", "description", "content", "sort_order", "is_enabled"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "tags" in payload:
            row.tags_json = json_dumps_safe(payload.get("tags") or [])
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_skill(row)

    def delete_skill(self, skill_id: int) -> None:
        row = self._get_skill(skill_id)
        row.deleted = True
        self.db.add(row)
        self.db.commit()

    def toggle_skill(self, skill_id: int, enabled: bool, actor_id: str) -> Dict[str, Any]:
        row = self._get_skill(skill_id)
        row.is_enabled = bool(enabled)
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_skill(row)
    def _serialize_parse_result(self, row: RecruitmentResumeParseResult) -> Dict[str, Any]:
        return {"id": row.id, "candidate_id": row.candidate_id, "resume_file_id": row.resume_file_id, "raw_text": row.raw_text or "", "basic_info": json_loads_safe(row.basic_info_json, {}), "work_experiences": json_loads_safe(row.work_experiences_json, []), "education_experiences": json_loads_safe(row.education_experiences_json, []), "skills": json_loads_safe(row.skills_json, []), "projects": json_loads_safe(row.projects_json, []), "summary": row.summary_text, "status": row.status, "error_message": row.error_message, "created_at": isoformat_or_none(row.created_at)}

    def _serialize_score(self, row: RecruitmentCandidateScore) -> Dict[str, Any]:
        payload = json_loads_safe(row.score_json, {})
        return {"id": row.id, "candidate_id": row.candidate_id, "parse_result_id": row.parse_result_id, "total_score": row.total_score, "match_percent": row.match_percent, "advantages": payload.get("advantages") or [], "concerns": payload.get("concerns") or [], "advantages_text": row.advantages_text, "concerns_text": row.concerns_text, "recommendation": row.recommendation, "suggested_status": row.suggested_status, "manual_override_score": row.manual_override_score, "manual_override_reason": row.manual_override_reason, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at), **payload}

    def _serialize_workflow_memory(self, row: RecruitmentCandidateWorkflowMemory) -> Dict[str, Any]:
        screening_skill_ids = json_loads_safe(row.screening_skill_ids_json, [])
        interview_skill_ids = json_loads_safe(row.interview_skill_ids_json, [])
        return {"id": row.id, "candidate_id": row.candidate_id, "position_id": row.position_id, "screening_skill_ids": screening_skill_ids, "screening_skills": [self._serialize_skill(skill) for skill in self._load_skill_rows(screening_skill_ids)], "screening_memory_source": row.screening_memory_source, "screening_rule_snapshot": json_loads_safe(row.screening_rule_snapshot_json, None), "latest_parse_result_id": row.latest_parse_result_id, "latest_score_id": row.latest_score_id, "last_screened_at": isoformat_or_none(row.last_screened_at), "interview_skill_ids": interview_skill_ids, "interview_skills": [self._serialize_skill(skill) for skill in self._load_skill_rows(interview_skill_ids)], "last_interview_question_id": row.last_interview_question_id, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _serialize_status_history(self, row: RecruitmentCandidateStatusHistory) -> Dict[str, Any]:
        return {"id": row.id, "candidate_id": row.candidate_id, "from_status": row.from_status, "to_status": row.to_status, "reason": row.reason, "changed_by": row.changed_by, "source": row.source, "created_at": isoformat_or_none(row.created_at)}

    def _serialize_interview_question(self, row: RecruitmentInterviewQuestion) -> Dict[str, Any]:
        return {"id": row.id, "round_name": row.round_name, "custom_requirements": row.custom_requirements, "skill_ids": json_loads_safe(row.skill_ids_json, []), "html_content": row.html_content or "", "markdown_content": row.markdown_content or "", "status": row.status, "created_by": row.created_by, "created_at": isoformat_or_none(row.created_at)}

    def _serialize_candidate_summary(self, row: RecruitmentCandidate) -> Dict[str, Any]:
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == row.position_id, RecruitmentPosition.deleted.is_(False)).first() if row.position_id else None
        score_row = self.db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.id == row.latest_score_id).first() if row.latest_score_id else None
        position_skill_rows = self._get_position_skill_rows(position.id) if position else []
        return {"id": row.id, "candidate_code": row.candidate_code, "position_id": row.position_id, "position_title": position.title if position else None, "position_auto_screen_on_upload": bool(position.auto_screen_on_upload) if position else False, "position_screening_skill_ids": [skill.id for skill in position_skill_rows], "position_screening_skills": [self._serialize_skill(skill) for skill in position_skill_rows], "name": row.name, "phone": row.phone, "email": row.email, "current_company": row.current_company, "years_of_experience": row.years_of_experience, "education": row.education, "source": row.source, "source_detail": row.source_detail, "status": row.status, "ai_recommended_status": row.ai_recommended_status, "match_percent": row.match_percent, "tags": json_loads_safe(row.tags_json, []), "notes": row.notes, "latest_resume_file_id": row.latest_resume_file_id, "latest_parse_result_id": row.latest_parse_result_id, "latest_score_id": row.latest_score_id, "latest_total_score": score_row.total_score if score_row else None, "created_by": row.created_by, "updated_by": row.updated_by, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_candidates(self, query: Optional[str] = None, status: Optional[str] = None, position_id: Optional[int] = None, tag: Optional[str] = None) -> List[Dict[str, Any]]:
        builder = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.deleted.is_(False))
        if status:
            builder = builder.filter(RecruitmentCandidate.status == status)
        if position_id:
            builder = builder.filter(RecruitmentCandidate.position_id == position_id)
        if query:
            keyword = f"%{query.strip()}%"
            builder = builder.filter(or_(RecruitmentCandidate.name.like(keyword), RecruitmentCandidate.phone.like(keyword), RecruitmentCandidate.email.like(keyword), RecruitmentCandidate.current_company.like(keyword)))
        rows = builder.order_by(RecruitmentCandidate.updated_at.desc(), RecruitmentCandidate.id.desc()).all()
        if tag:
            rows = [row for row in rows if tag in json_loads_safe(row.tags_json, [])]
        return [self._serialize_candidate_summary(row) for row in rows]

    def get_candidate_detail(self, candidate_id: int) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        resume_files = self.db.query(RecruitmentResumeFile).filter(RecruitmentResumeFile.candidate_id == candidate.id).order_by(RecruitmentResumeFile.created_at.desc(), RecruitmentResumeFile.id.desc()).all()
        parse_row = self.db.query(RecruitmentResumeParseResult).filter(RecruitmentResumeParseResult.id == candidate.latest_parse_result_id).first() if candidate.latest_parse_result_id else None
        score_row = self.db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.id == candidate.latest_score_id).first() if candidate.latest_score_id else None
        workflow_memory = self._get_workflow_memory(candidate.id)
        status_history = self.db.query(RecruitmentCandidateStatusHistory).filter(RecruitmentCandidateStatusHistory.candidate_id == candidate.id).order_by(RecruitmentCandidateStatusHistory.created_at.desc(), RecruitmentCandidateStatusHistory.id.desc()).all()
        questions = self.db.query(RecruitmentInterviewQuestion).filter(RecruitmentInterviewQuestion.candidate_id == candidate.id).order_by(RecruitmentInterviewQuestion.created_at.desc(), RecruitmentInterviewQuestion.id.desc()).all()
        activity = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.related_candidate_id == candidate.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).limit(50).all()
        return {"candidate": self._serialize_candidate_summary(candidate), "resume_files": [self._serialize_resume_file(item) for item in resume_files], "parse_result": self._serialize_parse_result(parse_row) if parse_row else None, "score": self._serialize_score(score_row) if score_row else None, "workflow_memory": self._serialize_workflow_memory(workflow_memory) if workflow_memory else None, "status_history": [self._serialize_status_history(item) for item in status_history], "interview_questions": [self._serialize_interview_question(item) for item in questions], "activity": [self._serialize_ai_task_log(item) for item in activity]}

    def update_candidate(self, candidate_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        for field in ["position_id", "name", "phone", "email", "current_company", "years_of_experience", "education", "notes"]:
            if field in payload:
                setattr(candidate, field, payload.get(field))
        if "tags" in payload:
            candidate.tags_json = json_dumps_safe(payload.get("tags") or [])
        candidate.updated_by = actor_id
        if ("manual_override_score" in payload or "manual_override_reason" in payload) and candidate.latest_score_id:
            score_row = self.db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.id == candidate.latest_score_id).first()
            if score_row:
                if "manual_override_score" in payload:
                    score_row.manual_override_score = payload.get("manual_override_score")
                if "manual_override_reason" in payload:
                    score_row.manual_override_reason = payload.get("manual_override_reason")
                self.db.add(score_row)
        self.db.add(candidate)
        self.db.commit()
        self.db.refresh(candidate)
        return self._serialize_candidate_summary(candidate)

    def update_candidate_status(self, candidate_id: int, status: str, reason: str, actor_id: str) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        self._create_status_history(candidate, status, reason, actor_id, "manual")
        self.db.add(candidate)
        self.db.commit()
        self.db.refresh(candidate)
        return self._serialize_candidate_summary(candidate)

    def get_candidate_status_history(self, candidate_id: int) -> List[Dict[str, Any]]:
        self._get_candidate(candidate_id)
        rows = self.db.query(RecruitmentCandidateStatusHistory).filter(RecruitmentCandidateStatusHistory.candidate_id == candidate_id).order_by(RecruitmentCandidateStatusHistory.created_at.desc(), RecruitmentCandidateStatusHistory.id.desc()).all()
        return [self._serialize_status_history(row) for row in rows]

    def upload_resume_files(self, uploaded_files: List[Dict[str, Any]], position_id: Optional[int], actor_id: str) -> List[Dict[str, Any]]:
        position = self._get_position(position_id) if position_id else None
        target_dir = RECRUITMENT_UPLOAD_ROOT / uuid.uuid4().hex[:8]
        target_dir.mkdir(parents=True, exist_ok=True)
        results: List[Dict[str, Any]] = []
        for item in uploaded_files:
            file_name = str(item.get("file_name") or "resume.bin")
            ext = Path(file_name).suffix.lower()
            stored_name = f"{uuid.uuid4().hex}{ext}"
            storage_path = target_dir / stored_name
            storage_path.write_bytes(item.get("content") or b"")
            candidate = RecruitmentCandidate(candidate_code=f"TMP-{uuid.uuid4().hex[:8]}", position_id=position.id if position else None, name=safe_file_stem(file_name), source="manual_upload", source_detail=file_name, status="pending_screening", tags_json=json_dumps_safe([]), created_by=actor_id, updated_by=actor_id, deleted=False)
            self.db.add(candidate)
            self.db.flush()
            candidate.candidate_code = f"CAD-{candidate.id:05d}"
            resume_file = RecruitmentResumeFile(candidate_id=candidate.id, original_name=file_name, stored_name=stored_name, file_ext=ext, mime_type=item.get("content_type") or None, file_size=len(item.get("content") or b""), storage_path=str(storage_path), parse_status="pending", uploaded_by=actor_id)
            self.db.add(resume_file)
            self.db.flush()
            candidate.latest_resume_file_id = resume_file.id
            self.db.add(candidate)
            self.db.commit()
            self.db.refresh(candidate)
            payload = self._serialize_candidate_summary(candidate)
            payload["auto_screen_enabled"] = bool(position.auto_screen_on_upload) if position else False
            results.append(payload)
        return results

    def _resolve_screening_skills(self, candidate: RecruitmentCandidate, explicit_skill_ids: Optional[Iterable[Any]], *, use_position_skills: bool = True, use_candidate_memory: bool = True) -> Tuple[List[RecruitmentSkill], str]:
        manual_rows = self._load_skill_rows(explicit_skill_ids or [], enabled_only=True)
        if manual_rows:
            return manual_rows, "manual"
        position_rows = self._get_position_skill_rows(candidate.position_id) if use_position_skills else []
        if position_rows:
            return position_rows, "position"
        workflow = self._get_workflow_memory(candidate.id)
        if use_candidate_memory and workflow:
            screening_skill_ids = json_loads_safe(workflow.screening_skill_ids_json, [])
            memory_rows = self._load_skill_rows(screening_skill_ids, enabled_only=True)
            if memory_rows:
                return memory_rows, workflow.screening_memory_source or "candidate_memory"
        enabled_rows = self._load_enabled_skills()
        return enabled_rows, "global"
    def _parse_latest_resume(self, candidate: RecruitmentCandidate, actor_id: str) -> RecruitmentResumeParseResult:
        if not candidate.latest_resume_file_id:
            raise ValueError("鎿嶄綔澶辫触")
        resume_file = self._get_resume_file(candidate.latest_resume_file_id)
        request_hash = self._build_request_hash("resume_parse", candidate.id, resume_file.id, resume_file.storage_path)
        log_row = self._create_ai_task_log("resume_parse", created_by=actor_id, related_position_id=candidate.position_id, related_candidate_id=candidate.id, related_resume_file_id=resume_file.id, request_hash=request_hash)
        resume_file.parse_status = "processing"
        self.db.add(resume_file)
        self.db.commit()
        raw_text = extract_resume_text(Path(resume_file.storage_path), resume_file.file_ext or "")
        prompt = json_dumps_safe({"candidate_name": candidate.name, "resume_text": raw_text[:30000]})
        self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(raw_text, 600), output_summary="正在解析简历文本")
        task = self.ai_gateway.generate_json(task_type="resume_parse", system_prompt=RESUME_PARSE_SYSTEM_PROMPT, user_prompt=prompt, fallback_builder=lambda: extract_resume_structured_data(raw_text, candidate.name))
        content = task.get("content") or {}
        parse_row = RecruitmentResumeParseResult(candidate_id=candidate.id, resume_file_id=resume_file.id, raw_text=raw_text, basic_info_json=json_dumps_safe(content.get("basic_info") or {}), work_experiences_json=json_dumps_safe(content.get("work_experiences") or []), education_experiences_json=json_dumps_safe(content.get("education_experiences") or []), skills_json=json_dumps_safe(content.get("skills") or []), projects_json=json_dumps_safe(content.get("projects") or []), summary_text=content.get("summary") or "", status="success", error_message=task.get("error_message"))
        self.db.add(parse_row)
        self.db.flush()
        basic_info = content.get("basic_info") or {}
        candidate.name = str(basic_info.get("name") or candidate.name).strip() or candidate.name
        candidate.phone = basic_info.get("phone") or candidate.phone
        candidate.email = basic_info.get("email") or candidate.email
        candidate.years_of_experience = basic_info.get("years_of_experience") or candidate.years_of_experience
        candidate.education = basic_info.get("education") or candidate.education
        candidate.latest_parse_result_id = parse_row.id
        candidate.updated_by = actor_id
        resume_file.parse_status = "success"
        resume_file.parse_error = task.get("error_message")
        self.db.add(candidate)
        self.db.add(resume_file)
        self.db.commit()
        self.db.refresh(parse_row)
        self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot=content, error_message=task.get("error_message"), token_usage=task.get("token_usage"))
        return parse_row

    def _score_candidate(self, candidate: RecruitmentCandidate, parse_row: RecruitmentResumeParseResult, actor_id: str, skill_rows: Sequence[RecruitmentSkill], memory_source: str, custom_requirements: str = "") -> RecruitmentCandidateScore:
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == candidate.position_id, RecruitmentPosition.deleted.is_(False)).first() if candidate.position_id else None
        parsed_payload = self._serialize_parse_result(parse_row)
        weights = self._get_rule_config("resume_score_weights", DEFAULT_RULE_CONFIGS["resume_score_weights"])
        status_rules = self._get_rule_config("default_status_rules", DEFAULT_RULE_CONFIGS["default_status_rules"])
        skill_snapshots = self._build_skill_snapshots(skill_rows, custom_requirements, custom_name="附加初筛要求")
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        prompt = json_dumps_safe({"position": None if not position else {"title": position.title, "department": position.department, "location": position.location, "employment_type": position.employment_type, "salary_range": position.salary_range, "key_requirements": position.key_requirements, "bonus_points": position.bonus_points, "summary": position.summary}, "parsed_resume": parsed_payload, "weights": weights, "status_rules": status_rules, "custom_requirements": custom_requirements or None, "skills": [{"id": skill.get("id"), "name": skill.get("name"), "description": skill.get("description"), "content": truncate_text(skill.get("content") or "", 1200)} for skill in skill_snapshots]})
        request_hash = self._build_request_hash("resume_score", candidate.id, parse_row.id, related_skill_ids, memory_source, custom_requirements)
        log_row = self._create_ai_task_log("resume_score", created_by=actor_id, related_position_id=candidate.position_id, related_candidate_id=candidate.id, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, related_resume_file_id=parse_row.resume_file_id, memory_source=memory_source, request_hash=request_hash)
        self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(prompt, 600), output_summary="正在根据岗位与 Skills 进行初筛评分")
        task = self.ai_gateway.generate_json(task_type="resume_score", system_prompt=RESUME_SCORE_SYSTEM_PROMPT, user_prompt=prompt, fallback_builder=lambda: score_candidate_fallback(position or candidate, parsed_payload, weights, status_rules, skill_snapshots))
        content = task.get("content") or {}
        score_row = RecruitmentCandidateScore(candidate_id=candidate.id, parse_result_id=parse_row.id, score_json=json_dumps_safe(content), total_score=content.get("total_score"), match_percent=content.get("match_percent"), advantages_text="\n".join(content.get("advantages") or []), concerns_text="\n".join(content.get("concerns") or []), recommendation=content.get("recommendation"), suggested_status=content.get("suggested_status"), created_at=None)
        self.db.add(score_row)
        self.db.flush()
        candidate.latest_score_id = score_row.id
        candidate.match_percent = content.get("match_percent")
        candidate.ai_recommended_status = content.get("suggested_status")
        candidate.updated_by = actor_id
        self.db.add(candidate)
        self.db.commit()
        self.db.refresh(score_row)
        self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot=content, error_message=task.get("error_message"), token_usage=task.get("token_usage"), memory_source=memory_source, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots)
        return score_row

    def trigger_latest_parse(self, candidate_id: int, actor_id: str) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        return self._serialize_parse_result(self._parse_latest_resume(candidate, actor_id))

    def trigger_latest_score(self, candidate_id: int, actor_id: str) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        parse_row = self.db.query(RecruitmentResumeParseResult).filter(RecruitmentResumeParseResult.id == candidate.latest_parse_result_id).first() if candidate.latest_parse_result_id else None
        if not parse_row:
            parse_row = self._parse_latest_resume(candidate, actor_id)
        skill_rows, memory_source = self._resolve_screening_skills(candidate, [], use_position_skills=True, use_candidate_memory=True)
        return self._serialize_score(self._score_candidate(candidate, parse_row, actor_id, skill_rows, memory_source, ""))

    def screen_candidate(self, candidate_id: int, actor_id: str, skill_ids: Optional[Iterable[Any]] = None, use_position_skills: bool = True, use_candidate_memory: bool = True, custom_requirements: str = "") -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        parse_row = self._parse_latest_resume(candidate, actor_id)
        skill_rows, memory_source = self._resolve_screening_skills(candidate, skill_ids, use_position_skills=use_position_skills, use_candidate_memory=use_candidate_memory)
        score_row = self._score_candidate(candidate, parse_row, actor_id, skill_rows, memory_source, custom_requirements)
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == candidate.position_id, RecruitmentPosition.deleted.is_(False)).first() if candidate.position_id else None
        workflow = self._get_or_create_workflow_memory(candidate, actor_id)
        workflow.position_id = candidate.position_id
        workflow.screening_skill_ids_json = json_dumps_safe([skill.id for skill in skill_rows])
        workflow.screening_memory_source = memory_source
        workflow.screening_rule_snapshot_json = json_dumps_safe({"weights": self._get_rule_config("resume_score_weights", DEFAULT_RULE_CONFIGS["resume_score_weights"]), "status_rules": self._get_rule_config("default_status_rules", DEFAULT_RULE_CONFIGS["default_status_rules"]), "custom_requirements": custom_requirements or None})
        workflow.latest_parse_result_id = parse_row.id
        workflow.latest_score_id = score_row.id
        workflow.last_screened_at = func.now()
        workflow.updated_by = actor_id
        self.db.add(workflow)
        next_status = score_row.suggested_status or candidate.status
        reason = score_row.recommendation or "AI 初筛完成"
        if next_status == "screening_passed" and position and position.auto_advance_on_screening:
            next_status = "pending_interview"
            reason = f"{reason}；岗位配置为通过后自动推进到待面试"
        if next_status and next_status != candidate.status:
            self._create_status_history(candidate, next_status, reason, actor_id, "auto_screening")
        candidate.updated_by = actor_id
        self.db.add(candidate)
        self.db.commit()
        return self.get_candidate_detail(candidate.id)

    def _resolve_interview_skills(self, candidate: RecruitmentCandidate, explicit_skill_ids: Optional[Iterable[Any]], *, use_candidate_memory: bool = True) -> Tuple[List[RecruitmentSkill], str]:
        manual_rows = self._load_skill_rows(explicit_skill_ids or [], enabled_only=True)
        if manual_rows:
            return manual_rows, "manual"
        position_rows = self._get_position_skill_rows(candidate.position_id)
        if position_rows:
            return position_rows, "position"
        workflow = self._get_workflow_memory(candidate.id)
        if use_candidate_memory and workflow:
            interview_skill_ids = json_loads_safe(workflow.interview_skill_ids_json, []) or json_loads_safe(workflow.screening_skill_ids_json, [])
            memory_rows = self._load_skill_rows(interview_skill_ids, enabled_only=True)
            if memory_rows:
                return memory_rows, workflow.screening_memory_source or "candidate_memory"
        return self._load_enabled_skills(), "global"

    def _build_interview_skill_prompt_block(self, skill_rows: Sequence[RecruitmentSkill]) -> str:
        if not skill_rows:
            return "No active skills."
        blocks: List[str] = []
        for index, skill in enumerate(skill_rows, 1):
            blocks.append("\n".join([f"[SKILL {index}]", f"id: {skill.id}", f"name: {skill.name}", f"description: {skill.description or 'N/A'}", "content:", truncate_text(skill.content or '', 3000)]))
        return "\n\n".join(blocks)

    def _build_interview_question_prompt(self, *, candidate_payload: Dict[str, Any], position_payload: Optional[Dict[str, Any]], workflow_payload: Optional[Dict[str, Any]], round_name: str, custom_requirements: str, skill_rows: Sequence[RecruitmentSkill], memory_source: str) -> str:
        structured_payload = {"candidate": candidate_payload, "position": position_payload, "workflow_memory": workflow_payload, "round_name": round_name, "custom_requirements": custom_requirements or None, "memory_source": memory_source, "skills": [{"id": skill.id, "name": skill.name, "description": skill.description, "content": truncate_text(skill.content or '', 3000)} for skill in skill_rows]}
        skill_names = "、".join([skill.name for skill in skill_rows]) if skill_rows else "无"
        return "\n\n".join([
            "TASK: 为候选人生成一套严格贴合 ACTIVE_SKILLS 的面试题。",
            "PRIORITY_RULES:",
            "1. ACTIVE_SKILLS 是最高优先级硬约束，必须完整覆盖。",
            "2. custom_requirements 只能补充，不能覆盖 ACTIVE_SKILLS。",
            "3. candidate / position / workflow_memory 只用于让题目更贴合场景。",
            "4. 输出不得退化成泛化题库；每个模块都必须明显对应 ACTIVE_SKILLS。",
            f"ROUND_NAME: {round_name or '初试'}",
            f"CUSTOM_REQUIREMENTS: {custom_requirements or '无'}",
            f"MEMORY_SOURCE: {memory_source or 'unknown'}",
            f"ACTIVE_SKILL_NAMES: {skill_names}",
            "ACTIVE_SKILL_DETAILS:",
            self._build_interview_skill_prompt_block(skill_rows),
            "STRUCTURED_CONTEXT_JSON:",
            json_dumps_safe(structured_payload),
        ])

    def generate_interview_questions(self, candidate_id: int, round_name: str, custom_requirements: str, skill_ids: Optional[Iterable[Any]], actor_id: str, use_candidate_memory: bool = True) -> Dict[str, Any]:
        candidate = self._get_candidate(candidate_id)
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == candidate.position_id, RecruitmentPosition.deleted.is_(False)).first() if candidate.position_id else None
        workflow = self._get_workflow_memory(candidate.id)
        skill_rows, memory_source = self._resolve_interview_skills(candidate, skill_ids, use_candidate_memory=use_candidate_memory)
        skill_snapshots = self._build_skill_snapshots(skill_rows)
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        candidate_payload = self._serialize_candidate_summary(candidate)
        position_payload = None if not position else self._serialize_position(position)
        workflow_payload = self._serialize_workflow_memory(workflow) if workflow else None
        prompt = self._build_interview_question_prompt(candidate_payload=candidate_payload, position_payload=position_payload, workflow_payload=workflow_payload, round_name=round_name, custom_requirements=custom_requirements, skill_rows=skill_rows, memory_source=memory_source)
        request_hash = self._build_request_hash("interview_question_generation", candidate.id, round_name, custom_requirements, related_skill_ids, memory_source)
        log_row = self._create_ai_task_log("interview_question_generation", created_by=actor_id, related_position_id=candidate.position_id, related_candidate_id=candidate.id, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, memory_source=memory_source, request_hash=request_hash)
        self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(prompt, 600), output_summary="正在生成面试题")
        task = self.ai_gateway.generate_json(task_type="interview_question_generation", system_prompt=INTERVIEW_QUESTION_SYSTEM_PROMPT, user_prompt=prompt, fallback_builder=lambda: build_interview_fallback(candidate.name, position.title if position else "当前岗位", round_name, [{"name": skill.name, "description": skill.description, "content": truncate_text(skill.content, 1200)} for skill in skill_rows], custom_requirements))
        content = task.get("content") or {}
        markdown = str(content.get("markdown") or "").strip()
        html = str(content.get("html") or "").strip()
        if not markdown and html:
            markdown = strip_markdown(html)
        if not html and markdown:
            html = markdown_to_html(markdown)
        row = RecruitmentInterviewQuestion(candidate_id=candidate.id, position_id=candidate.position_id, skill_ids_json=json_dumps_safe([skill.id for skill in skill_rows]), round_name=round_name or "初试", custom_requirements=custom_requirements or None, html_content=html, markdown_content=markdown, status="generated", created_by=actor_id)
        self.db.add(row)
        self.db.flush()
        workflow_row = self._get_or_create_workflow_memory(candidate, actor_id)
        workflow_row.interview_skill_ids_json = json_dumps_safe([skill.id for skill in skill_rows])
        workflow_row.last_interview_question_id = row.id
        workflow_row.updated_by = actor_id
        self.db.add(workflow_row)
        self.db.commit()
        self.db.refresh(row)
        self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot=content, error_message=task.get("error_message"), token_usage=task.get("token_usage"), memory_source=memory_source, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots)
        return self._serialize_interview_question(row)

    def get_interview_question_download(self, question_id: int) -> Dict[str, Any]:
        row = self.db.query(RecruitmentInterviewQuestion).filter(RecruitmentInterviewQuestion.id == question_id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        candidate = self._get_candidate(row.candidate_id)
        file_name = f"interview-question-{safe_file_stem(candidate.name)}-{safe_file_stem(row.round_name)}.html".replace(" ", "-")
        return {"file_name": file_name, "html_content": row.html_content or markdown_to_html(row.markdown_content or "")}

    def get_resume_file_download(self, resume_file_id: int) -> Dict[str, Any]:
        resume_file = self._get_resume_file(resume_file_id)
        path = Path(resume_file.storage_path)
        if not path.exists():
            raise ValueError("鎿嶄綔澶辫触")
        return {"file_name": resume_file.original_name, "content": path.read_bytes(), "media_type": resume_file.mime_type or "application/octet-stream"}
    def generate_jd(self, position_id: int, extra_prompt: str, actor_id: str, auto_activate: bool = True) -> Dict[str, Any]:
        position = self._get_position(position_id)
        skill_rows = self._get_position_skill_rows(position.id)
        skill_snapshots = self._build_skill_snapshots(skill_rows)
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        request_hash = self._build_request_hash("jd_generation", position.id, extra_prompt, related_skill_ids)
        log_row = self._create_ai_task_log("jd_generation", created_by=actor_id, related_position_id=position.id, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, request_hash=request_hash)
        prompt = json_dumps_safe({"position": self._serialize_position(position), "skills": [{"id": skill.id, "name": skill.name, "description": skill.description, "content": truncate_text(skill.content, 800)} for skill in skill_rows], "extra_prompt": extra_prompt or None})
        task = self.ai_gateway.generate_text(task_type="jd_generation", system_prompt="You are a recruitment JD generation assistant. Return practical Chinese markdown only, with no code fences.", user_prompt=prompt, fallback_builder=lambda: build_jd_fallback(position))
        content = task.get("content") or {}
        markdown = str(content.get("markdown") or "").strip()
        html = str(content.get("html") or "").strip()
        if not markdown and html:
            markdown = strip_markdown(html)
        if not html and markdown:
            html = markdown_to_html(markdown)
        publish_text = strip_markdown(markdown) or render_publish_ready_jd({"title": position.title, "summary": markdown})
        version_no = (self.db.query(func.max(RecruitmentJDVersion.version_no)).filter(RecruitmentJDVersion.position_id == position.id).scalar() or 0) + 1
        row = RecruitmentJDVersion(position_id=position.id, version_no=version_no, title=f"{position.title} V{version_no}", prompt_snapshot=task.get("prompt_snapshot"), jd_markdown=markdown, jd_html=html, publish_text=publish_text, notes=extra_prompt or None, is_active=bool(auto_activate), created_by=actor_id)
        self.db.add(row)
        self.db.flush()
        if auto_activate:
            self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == position.id, RecruitmentJDVersion.id != row.id).update({RecruitmentJDVersion.is_active: False}, synchronize_session=False)
            position.current_jd_version_id = row.id
            position.updated_by = actor_id
            self.db.add(position)
        self.db.commit()
        self.db.refresh(row)
        self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot=content, error_message=task.get("error_message"), token_usage=task.get("token_usage"), related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots)
        return self._serialize_jd_version(row)

    def save_jd_version(self, position_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        position = self._get_position(position_id)
        version_no = (self.db.query(func.max(RecruitmentJDVersion.version_no)).filter(RecruitmentJDVersion.position_id == position.id).scalar() or 0) + 1
        row = RecruitmentJDVersion(position_id=position.id, version_no=version_no, title=str(payload.get("title") or position.title).strip(), prompt_snapshot=None, jd_markdown=str(payload.get("jd_markdown") or ""), jd_html=payload.get("jd_html") or markdown_to_html(str(payload.get("jd_markdown") or "")), publish_text=payload.get("publish_text") or strip_markdown(str(payload.get("jd_markdown") or "")), notes=payload.get("notes"), is_active=bool(payload.get("auto_activate")), created_by=actor_id)
        self.db.add(row)
        self.db.flush()
        if payload.get("auto_activate"):
            self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == position.id, RecruitmentJDVersion.id != row.id).update({RecruitmentJDVersion.is_active: False}, synchronize_session=False)
            position.current_jd_version_id = row.id
            position.updated_by = actor_id
            self.db.add(position)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_jd_version(row)

    def activate_jd_version(self, position_id: int, version_id: int, actor_id: str) -> Dict[str, Any]:
        position = self._get_position(position_id)
        row = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.id == version_id, RecruitmentJDVersion.position_id == position.id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.position_id == position.id).update({RecruitmentJDVersion.is_active: False}, synchronize_session=False)
        row.is_active = True
        position.current_jd_version_id = row.id
        position.updated_by = actor_id
        self.db.add(row)
        self.db.add(position)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_jd_version(row)

    def _serialize_llm_config(self, row: RecruitmentLLMConfig) -> Dict[str, Any]:
        runtime = self.ai_gateway.resolve_runtime_config_for_row(row)
        return {"id": row.id, "config_key": row.config_key, "task_type": row.task_type, "provider": row.provider, "model_name": row.model_name, "base_url": row.base_url, "api_key_env": row.api_key_env, "api_key_masked": runtime.api_key_masked, "has_stored_api_key": bool(row.api_key_ciphertext), "has_runtime_api_key": bool(runtime.api_key), "extra_config": json_loads_safe(row.extra_config_json, None), "is_active": bool(row.is_active), "priority": row.priority, "resolved_provider": runtime.provider, "resolved_model_name": runtime.model_name, "resolved_base_url": runtime.base_url, "resolved_source": runtime.source, "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_llm_configs(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentLLMConfig).order_by(RecruitmentLLMConfig.task_type.asc(), RecruitmentLLMConfig.priority.asc(), RecruitmentLLMConfig.id.asc()).all()
        return [self._serialize_llm_config(row) for row in rows]

    def create_llm_config(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        row = RecruitmentLLMConfig(config_key=str(payload.get("config_key") or "").strip(), task_type=payload.get("task_type") or "default", provider=str(payload.get("provider") or "openai-compatible").strip(), model_name=str(payload.get("model_name") or "").strip(), base_url=payload.get("base_url"), api_key_env=payload.get("api_key_env"), api_key_ciphertext=self._safe_encrypt_secret(str(payload.get("api_key_value") or "")) if payload.get("api_key_value") else None, extra_config_json=json_dumps_safe(payload.get("extra_config") or {}), is_active=payload.get("is_active") is not False, priority=int(payload.get("priority") or 99))
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_llm_config(row)

    def update_llm_config(self, config_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        row = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.id == config_id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        for field in ["config_key", "task_type", "provider", "model_name", "base_url", "api_key_env", "is_active", "priority"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "extra_config" in payload:
            row.extra_config_json = json_dumps_safe(payload.get("extra_config") or {})
        api_key_value = str(payload.get("api_key_value") or "").strip()
        if api_key_value:
            row.api_key_ciphertext = self._safe_encrypt_secret(api_key_value)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_llm_config(row)

    def delete_llm_config(self, config_id: int) -> None:
        row = self.db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.id == config_id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        self.db.delete(row)
        self.db.commit()

    def _serialize_mail_sender(self, row: RecruitmentMailSenderConfig) -> Dict[str, Any]:
        password = decrypt_secret(row.password_ciphertext or "")
        return {"id": row.id, "name": row.name, "from_name": row.from_name, "from_email": row.from_email, "smtp_host": row.smtp_host, "smtp_port": row.smtp_port, "username": row.username, "password_masked": mask_secret(password), "has_password": bool(password), "use_ssl": bool(row.use_ssl), "use_starttls": bool(row.use_starttls), "is_default": bool(row.is_default), "is_enabled": bool(row.is_enabled), "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_mail_senders(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False)).order_by(RecruitmentMailSenderConfig.is_default.desc(), RecruitmentMailSenderConfig.id.asc()).all()
        return [self._serialize_mail_sender(row) for row in rows]

    def create_mail_sender(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        if payload.get("is_default"):
            self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False)).update({RecruitmentMailSenderConfig.is_default: False}, synchronize_session=False)
        row = RecruitmentMailSenderConfig(name=str(payload.get("name") or "").strip(), from_name=payload.get("from_name"), from_email=str(payload.get("from_email") or "").strip(), smtp_host=str(payload.get("smtp_host") or "").strip(), smtp_port=int(payload.get("smtp_port") or 465), username=str(payload.get("username") or "").strip(), password_ciphertext=self._safe_encrypt_secret(str(payload.get("password") or "")) if payload.get("password") else None, use_ssl=payload.get("use_ssl") is not False, use_starttls=bool(payload.get("use_starttls")), is_default=bool(payload.get("is_default")), is_enabled=payload.get("is_enabled") is not False, created_by=actor_id, updated_by=actor_id, deleted=False)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_sender(row)

    def update_mail_sender(self, sender_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == sender_id, RecruitmentMailSenderConfig.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        if payload.get("is_default"):
            self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False), RecruitmentMailSenderConfig.id != sender_id).update({RecruitmentMailSenderConfig.is_default: False}, synchronize_session=False)
        for field in ["name", "from_name", "from_email", "smtp_host", "smtp_port", "username", "use_ssl", "use_starttls", "is_default", "is_enabled"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        password = str(payload.get("password") or "").strip()
        if password:
            row.password_ciphertext = self._safe_encrypt_secret(password)
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_sender(row)

    def delete_mail_sender(self, sender_id: int, actor_id: str) -> None:
        row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == sender_id, RecruitmentMailSenderConfig.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        row.deleted = True
        row.updated_by = actor_id
        row.is_default = False
        self.db.add(row)
        self.db.commit()

    def _serialize_mail_recipient(self, row: RecruitmentMailRecipient) -> Dict[str, Any]:
        return {"id": row.id, "name": row.name, "email": row.email, "department": row.department, "role_title": row.role_title, "tags": json_loads_safe(row.tags_json, []), "notes": row.notes, "is_enabled": bool(row.is_enabled), "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def list_mail_recipients(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.deleted.is_(False)).order_by(RecruitmentMailRecipient.id.asc()).all()
        return [self._serialize_mail_recipient(row) for row in rows]

    def create_mail_recipient(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = RecruitmentMailRecipient(name=str(payload.get("name") or "").strip(), email=str(payload.get("email") or "").strip(), department=payload.get("department"), role_title=payload.get("role_title"), tags_json=json_dumps_safe(payload.get("tags") or []), notes=payload.get("notes"), is_enabled=payload.get("is_enabled") is not False, created_by=actor_id, updated_by=actor_id, deleted=False)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_recipient(row)

    def update_mail_recipient(self, recipient_id: int, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        row = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.id == recipient_id, RecruitmentMailRecipient.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        for field in ["name", "email", "department", "role_title", "notes", "is_enabled"]:
            if field in payload:
                setattr(row, field, payload.get(field))
        if "tags" in payload:
            row.tags_json = json_dumps_safe(payload.get("tags") or [])
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_mail_recipient(row)

    def delete_mail_recipient(self, recipient_id: int, actor_id: str) -> None:
        row = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.id == recipient_id, RecruitmentMailRecipient.deleted.is_(False)).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        row.deleted = True
        row.updated_by = actor_id
        self.db.add(row)
        self.db.commit()
    def _serialize_mail_dispatch(self, row: RecruitmentResumeMailDispatch) -> Dict[str, Any]:
        sender = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == row.sender_config_id).first() if row.sender_config_id else None
        return {"id": row.id, "sender_config_id": row.sender_config_id, "sender_name": sender.name if sender else None, "candidate_ids": json_loads_safe(row.candidate_ids_json, []), "recipient_ids": json_loads_safe(row.recipient_ids_json, []), "recipient_emails": json_loads_safe(row.recipient_emails_json, []), "subject": row.subject, "body_text": row.body_text, "body_html": row.body_html, "attachment_count": row.attachment_count, "status": row.status, "error_message": row.error_message, "sent_at": isoformat_or_none(row.sent_at), "created_at": isoformat_or_none(row.created_at), "updated_at": isoformat_or_none(row.updated_at)}

    def _build_sender_runtime(self, row: RecruitmentMailSenderConfig) -> RecruitmentMailSenderRuntime:
        password = decrypt_secret(row.password_ciphertext or "")
        if not password:
            raise ValueError("鎿嶄綔澶辫触")
        return RecruitmentMailSenderRuntime(from_email=row.from_email, from_name=row.from_name, smtp_host=row.smtp_host, smtp_port=row.smtp_port, username=row.username, password=password, use_ssl=bool(row.use_ssl), use_starttls=bool(row.use_starttls))

    def list_resume_mail_dispatches(self) -> List[Dict[str, Any]]:
        rows = self.db.query(RecruitmentResumeMailDispatch).order_by(RecruitmentResumeMailDispatch.created_at.desc(), RecruitmentResumeMailDispatch.id.desc()).all()
        return [self._serialize_mail_dispatch(row) for row in rows]

    def send_resume_mail_dispatch(self, payload: Dict[str, Any], actor_id: str) -> Dict[str, Any]:
        sender_row = None
        if payload.get("sender_config_id"):
            sender_row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.id == int(payload.get("sender_config_id")), RecruitmentMailSenderConfig.deleted.is_(False), RecruitmentMailSenderConfig.is_enabled.is_(True)).first()
        if not sender_row:
            sender_row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False), RecruitmentMailSenderConfig.is_enabled.is_(True), RecruitmentMailSenderConfig.is_default.is_(True)).first()
        if not sender_row:
            sender_row = self.db.query(RecruitmentMailSenderConfig).filter(RecruitmentMailSenderConfig.deleted.is_(False), RecruitmentMailSenderConfig.is_enabled.is_(True)).order_by(RecruitmentMailSenderConfig.id.asc()).first()
        if not sender_row:
            raise ValueError("鎿嶄綔澶辫触")
        candidate_ids = _dedupe_ints(payload.get("candidate_ids") or [])
        if not candidate_ids:
            raise ValueError("鎿嶄綔澶辫触")
        candidates = [self._get_candidate(candidate_id) for candidate_id in candidate_ids]
        recipient_ids = _dedupe_ints(payload.get("recipient_ids") or [])
        recipient_rows = self._load_mail_recipient_rows(recipient_ids)
        recipient_emails = _dedupe_texts([row.email for row in recipient_rows] + list(payload.get("recipient_emails") or []))
        if not recipient_emails:
            raise ValueError("鎿嶄綔澶辫触")
        subject = str(payload.get("subject") or "").strip() or f"候选人简历推荐 - {', '.join([item.name for item in candidates][:3])}"
        body_text = str(payload.get("body_text") or "").strip() or "\n".join([
            f"候选人：{item.name} / 岗位：{self._serialize_candidate_summary(item).get('position_title') or '未关联岗位'}"
            for item in candidates
        ])
        body_html = payload.get("body_html") or None
        dispatch = RecruitmentResumeMailDispatch(sender_config_id=sender_row.id, candidate_ids_json=json_dumps_safe(candidate_ids), recipient_ids_json=json_dumps_safe(recipient_ids), recipient_emails_json=json_dumps_safe(recipient_emails), subject=subject, body_text=body_text, body_html=body_html, attachment_count=0, status="pending", created_by=actor_id)
        self.db.add(dispatch)
        self.db.flush()
        attachments = []
        for candidate in candidates:
            if not candidate.latest_resume_file_id:
                continue
            resume_file = self._get_resume_file(candidate.latest_resume_file_id)
            attachments.append(load_attachment_from_path(resume_file.storage_path, resume_file.original_name, resume_file.mime_type))
        dispatch.attachment_count = len(attachments)
        self.db.add(dispatch)
        self.db.commit()
        runtime = self._build_sender_runtime(sender_row)
        try:
            message = build_resume_email(sender=runtime, recipients=recipient_emails, subject=subject, body_text=body_text, body_html=body_html, attachments=attachments)
            send_email_via_smtp(runtime, message)
            dispatch.status = "sent"
            dispatch.error_message = None
            dispatch.sent_at = func.now()
        except Exception as exc:
            dispatch.status = "failed"
            dispatch.error_message = str(exc)
            self.db.add(dispatch)
            self.db.commit()
            raise ValueError(str(exc)) from exc
        self.db.add(dispatch)
        self.db.commit()
        self.db.refresh(dispatch)
        return self._serialize_mail_dispatch(dispatch)

    def _load_mail_recipient_rows(self, recipient_ids: Iterable[Any]) -> List[RecruitmentMailRecipient]:
        normalized = _dedupe_ints(recipient_ids)
        if not normalized:
            return []
        rows = self.db.query(RecruitmentMailRecipient).filter(RecruitmentMailRecipient.id.in_(normalized), RecruitmentMailRecipient.deleted.is_(False), RecruitmentMailRecipient.is_enabled.is_(True)).all()
        order_map = {item: index for index, item in enumerate(normalized)}
        rows.sort(key=lambda row: order_map.get(row.id, 9999))
        return rows

    def list_ai_task_logs(self, task_type: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        builder = self.db.query(RecruitmentAITaskLog)
        if task_type:
            builder = builder.filter(RecruitmentAITaskLog.task_type == task_type)
        if status:
            builder = builder.filter(RecruitmentAITaskLog.status == status)
        rows = builder.order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).limit(200).all()
        stale_before = datetime.utcnow() - timedelta(minutes=30)
        touched = False
        for row in rows:
            if row.status not in {"pending", "running"}:
                continue
            checkpoint = row.updated_at or row.created_at
            if checkpoint and checkpoint < stale_before:
                row.status = "failed"
                row.error_message = row.error_message or "任务长时间未完成，系统已自动标记为失败。"
                self.db.add(row)
                touched = True
        if touched:
            self.db.commit()
            for row in rows:
                self.db.refresh(row)
        return [self._serialize_ai_task_log(row) for row in rows]

    def get_ai_task_log(self, task_id: int) -> Dict[str, Any]:
        row = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.id == task_id).first()
        if not row:
            raise ValueError("鎿嶄綔澶辫触")
        return self._serialize_ai_task_log(row)

    def create_publish_task(self, position_id: int, target_platform: str, mode: str, actor_id: str) -> Dict[str, Any]:
        position = self._get_position(position_id)
        current_jd = self.db.query(RecruitmentJDVersion).filter(RecruitmentJDVersion.id == position.current_jd_version_id).first() if position.current_jd_version_id else None
        payload = {"position_id": position.id, "target_platform": target_platform, "mode": mode, "title": position.title, "department": position.department, "location": position.location, "publish_text": current_jd.publish_text if current_jd else None}
        adapter = build_publish_adapter(target_platform, mode)
        row = RecruitmentPublishTask(position_id=position.id, target_platform=target_platform, mode=mode, adapter_code=adapter.adapter_code, status="pending", request_payload=json_dumps_safe(payload), created_by=actor_id)
        self.db.add(row)
        self.db.flush()
        try:
            result = adapter.publish_job(payload)
            row.status = result.get("status") or "success"
            row.response_payload = json_dumps_safe(result)
            row.published_url = result.get("published_url")
            row.error_message = None
        except Exception as exc:
            row.status = "failed"
            row.error_message = str(exc)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_publish_task(row)

    def list_publish_tasks(self, position_id: Optional[int] = None) -> List[Dict[str, Any]]:
        builder = self.db.query(RecruitmentPublishTask)
        if position_id:
            builder = builder.filter(RecruitmentPublishTask.position_id == position_id)
        rows = builder.order_by(RecruitmentPublishTask.created_at.desc(), RecruitmentPublishTask.id.desc()).all()
        return [self._serialize_publish_task(row) for row in rows]

    def _serialize_chat_context_row(self, row: Optional[RecruitmentChatContextMemory]) -> Dict[str, Any]:
        if not row:
            return {"position_id": None, "position_title": None, "candidate_id": None, "skill_ids": [], "skills": [], "updated_at": None}
        position = self.db.query(RecruitmentPosition).filter(RecruitmentPosition.id == row.position_id, RecruitmentPosition.deleted.is_(False)).first() if row.position_id else None
        skill_ids = json_loads_safe(row.skill_ids_json, [])
        return {"position_id": row.position_id, "position_title": position.title if position else None, "candidate_id": row.candidate_id, "skill_ids": skill_ids, "skills": [self._serialize_skill(skill) for skill in self._load_skill_rows(skill_ids)], "updated_at": isoformat_or_none(row.updated_at)}

    def get_chat_context(self, user_id: str) -> Dict[str, Any]:
        row = self.db.query(RecruitmentChatContextMemory).filter(RecruitmentChatContextMemory.user_id == user_id).first()
        return self._serialize_chat_context_row(row)

    def update_chat_context(self, user_id: str, position_id: Optional[int], skill_ids: Iterable[Any], candidate_id: Optional[int]) -> Dict[str, Any]:
        row = self.db.query(RecruitmentChatContextMemory).filter(RecruitmentChatContextMemory.user_id == user_id).first()
        if not row:
            row = RecruitmentChatContextMemory(user_id=user_id, position_id=position_id, candidate_id=candidate_id, skill_ids_json=json_dumps_safe(_dedupe_ints(skill_ids)), context_json=json_dumps_safe({}))
            self.db.add(row)
        else:
            row.position_id = position_id
            row.candidate_id = candidate_id
            row.skill_ids_json = json_dumps_safe(_dedupe_ints(skill_ids))
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._serialize_chat_context_row(row)

    # NOTE:
    # The legacy chat helper block that used to live here had multiple encoding-corrupted
    # string literals and is intentionally removed. Updated chat handlers are defined below.

    def _format_chat_candidate_list_reply(self, position: RecruitmentPosition, candidates: Sequence[Dict[str, Any]]) -> str:
        if not candidates:
            return f"当前岗位“{position.title}”下暂时没有查到候选人。"
        status_label_map = {item["value"]: item["label"] for item in CANDIDATE_STATUS_OPTIONS}
        lines = [f"当前岗位“{position.title}”共有 {len(candidates)} 位候选人："]
        for index, candidate in enumerate(candidates[:10], 1):
            match_percent = candidate.get("match_percent")
            match_text = f"{match_percent}%" if isinstance(match_percent, (int, float)) else "暂无"
            status_text = status_label_map.get(str(candidate.get("status") or ""), str(candidate.get("status") or "未知状态"))
            candidate_name = candidate.get("name") or f"候选人 #{candidate.get('id')}"
            source_text = candidate.get("source") or "未知"
            lines.append(f"{index}. {candidate_name} | 状态：{status_text} | 匹配度：{match_text} | 来源：{source_text}")
        if len(candidates) > 10:
            lines.append(f"其余 {len(candidates) - 10} 位候选人请到候选人中心继续查看。")
        return "\n".join(lines)

    def _get_chat_skill_snapshots(self, current_context: Dict[str, Any]) -> List[Dict[str, Any]]:
        skill_rows = self._load_skill_rows(current_context.get("skill_ids") or [], enabled_only=True)
        return self._build_skill_snapshots(skill_rows)

    def _record_chat_reply(self, *, user_id: str, message: str, current_context: Dict[str, Any], reply: str, model_provider: str, model_name: str, memory_source: Optional[str] = None, used_skill_snapshots: Optional[Sequence[Dict[str, Any]]] = None, output_snapshot: Optional[Any] = None) -> RecruitmentAITaskLog:
        skill_snapshots = list(used_skill_snapshots or self._get_chat_skill_snapshots(current_context))
        related_skill_ids = self._extract_related_skill_ids(skill_snapshots)
        prompt_snapshot = json_dumps_safe({"message": message, "context": current_context, "mode": "structured"})
        log_row = self._create_ai_task_log("chat_orchestrator", created_by=user_id, related_position_id=current_context.get("position_id"), related_candidate_id=current_context.get("candidate_id"), related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots, memory_source=memory_source, request_hash=self._build_request_hash("chat_orchestrator", user_id, message, current_context, reply))
        return self._finish_ai_task_log(log_row, status="success", provider=model_provider, model_name=model_name, prompt_snapshot=prompt_snapshot, input_summary=truncate_text(message, 600), output_summary=truncate_text(reply, 600), output_snapshot=output_snapshot or {"reply": reply}, memory_source=memory_source, related_skill_ids=related_skill_ids, related_skill_snapshots=skill_snapshots)

    def _resolve_chat_candidate(self, message: str, current_context: Dict[str, Any]) -> Optional[RecruitmentCandidate]:
        candidate_id = current_context.get("candidate_id")
        if candidate_id:
            try:
                return self._get_candidate(int(candidate_id))
            except (TypeError, ValueError):
                pass
        text = (message or "").strip()
        if any(token in text for token in ["当前候选人", "当前人选", "这位候选人", "这个候选人"]) and current_context.get("candidate_id"):
            try:
                return self._get_candidate(int(current_context["candidate_id"]))
            except (TypeError, ValueError):
                return None
        patterns = [
            r"(?:给|对|帮我给|帮我对|重新对|重新给)\s*(?P<name>[\u4e00-\u9fffA-Za-z0-9_\-·]{1,40})\s*(?:重新)?(?:初筛|筛选|筛一下|重筛|复筛|生成|出|安排)?",
            r"(?P<name>[\u4e00-\u9fffA-Za-z0-9_\-·]{2,40})\s*(?:重新)?(?:初筛|筛选|筛一下|重筛|复筛|生成面试题|生成初试题|生成复试题)",
        ]
        candidate_name = ""
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                candidate_name = (match.group("name") or "").strip()
                break
        if not candidate_name or candidate_name in {"当前候选人", "当前人选", "这位候选人", "这个候选人", "当前岗位"}:
            return None
        rows = self.db.query(RecruitmentCandidate).filter(RecruitmentCandidate.deleted.is_(False), RecruitmentCandidate.name.like(f"%{candidate_name}%")).order_by(RecruitmentCandidate.updated_at.desc(), RecruitmentCandidate.id.desc()).limit(20).all()
        if not rows:
            return None
        current_position_id = current_context.get("position_id")
        if current_position_id:
            scoped = [row for row in rows if row.position_id == current_position_id]
            if scoped:
                return scoped[0]
        exact = [row for row in rows if row.name == candidate_name]
        return exact[0] if exact else rows[0]

    def _extract_chat_interview_request(self, message: str) -> Optional[Dict[str, str]]:
        text = (message or "").strip()
        if not text or not any(keyword in text for keyword in ["面试题", "初试题", "复试题", "面试问题"]):
            return None
        round_name = "复试" if any(keyword in text for keyword in ["复试", "二面", "第二轮"]) else "初试"
        custom_requirements = ""
        for marker in ["硬性条件", "硬性要求", "重点", "侧重", "补充要求", "要求", "并且", "同时"]:
            if marker not in text:
                continue
            tail = text.split(marker, 1)[1].strip("：:，,.。；; ")
            if tail:
                custom_requirements = tail
                break
        return {"round_name": round_name, "custom_requirements": custom_requirements}

    def _extract_chat_screening_request(self, message: str) -> Optional[Dict[str, str]]:
        text = (message or "").strip()
        screening_keywords = ["初筛", "筛选", "筛一下", "重新筛", "重新初筛", "重筛", "复筛", "再次筛选", "重新评估"]
        if not text or not any(keyword in text for keyword in screening_keywords):
            return None
        custom_requirements = ""
        for marker in ["硬性条件", "硬性要求", "附加条件", "新增条件", "重点看", "重点关注", "更看重", "要求加强", "加强"]:
            if marker not in text:
                continue
            tail = text.split(marker, 1)[1].strip("：:，,.。；; ")
            if tail:
                custom_requirements = tail
                break
        if not custom_requirements and any(keyword in text for keyword in ["硬性", "加强", "重点"]):
            custom_requirements = text
        return {"custom_requirements": custom_requirements}

    def _is_recruitment_related(self, message: str, current_context: Dict[str, Any]) -> bool:
        compact_message = re.sub(r"\s+", "", (message or "").strip().lower())
        recruitment_keywords = [
            "招聘", "岗位", "jd", "候选人", "简历", "初筛", "筛选", "重筛", "复筛", "面试",
            "offer", "人才库", "skills", "skill", "模型", "model", "provider", "邮件", "发件箱",
            "收件人", "薪资", "匹配度", "评估", "录用", "淘汰", "入职", "boss", "智联",
        ]
        if any(keyword in compact_message for keyword in recruitment_keywords):
            return True
        contextual_keywords = ["当前候选人", "当前岗位", "这位候选人", "这个候选人", "重新来一版", "再筛一次", "再出一版", "为什么", "怎么处理"]
        if (current_context.get("candidate_id") or current_context.get("position_id")) and any(keyword in compact_message for keyword in contextual_keywords):
            return True
        non_recruitment_keywords = ["天气", "温度", "下雨", "股价", "股票", "新闻", "电影", "旅游", "做饭", "翻译", "几点", "时间", "星座"]
        if any(keyword in compact_message for keyword in non_recruitment_keywords):
            return False
        return False

    def _handle_structured_chat_command(self, user_id: str, message: str, current_context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        compact_message = re.sub(r"\s+", "", (message or "").strip().lower())
        skill_keywords = ["列出当前skills", "查看当前skills", "当前skills", "当前skill", "现在用了哪些skills", "本次用了哪些skills"]
        candidate_keywords = ["查看当前岗位候选人", "查看当前岗位候选人列表", "列出当前岗位候选人", "当前岗位候选人列表"]
        if any(keyword in compact_message for keyword in skill_keywords):
            skill_rows = self._load_skill_rows(current_context.get("skill_ids") or [], enabled_only=True)
            if not skill_rows:
                return {"reply": "当前还没有激活任何 Skills。你可以先在助手右侧选择 Skills，再让我基于这些规则进行初筛、重筛或生成面试题。", "context": current_context, "actions": [], "memory_source": "manual", "used_skill_snapshots": []}
            lines = ["当前激活的 Skills 如下："]
            for index, skill in enumerate(skill_rows, 1):
                description = f"：{skill.description}" if skill.description else ""
                lines.append(f"{index}. {skill.name}{description}")
            return {"reply": "\n".join(lines), "context": current_context, "actions": [], "memory_source": "manual", "used_skill_snapshots": self._build_skill_snapshots(skill_rows)}
        if any(keyword in compact_message for keyword in candidate_keywords):
            position_id = current_context.get("position_id")
            if not position_id:
                return {"reply": "当前还没有指定岗位上下文。请先在右侧选择岗位，或先打开某个岗位详情。", "context": current_context, "actions": [], "memory_source": None, "used_skill_snapshots": self._get_chat_skill_snapshots(current_context)}
            position = self._get_position(int(position_id))
            candidates = self.list_candidates(position_id=position.id)
            return {"reply": self._format_chat_candidate_list_reply(position, candidates), "context": current_context, "actions": [], "memory_source": None, "used_skill_snapshots": self._get_chat_skill_snapshots(current_context)}

        screening_request = self._extract_chat_screening_request(message)
        if screening_request:
            candidate = self._resolve_chat_candidate(message, current_context)
            if not candidate:
                return {"reply": "当前没有定位到需要初筛的候选人。请先在候选人中心选中一位候选人，或直接说“重新对张三进行初筛”。", "context": current_context, "actions": [], "memory_source": None, "used_skill_snapshots": self._get_chat_skill_snapshots(current_context)}
            next_context = current_context
            if current_context.get("candidate_id") != candidate.id or current_context.get("position_id") != candidate.position_id:
                next_context = self.update_chat_context(user_id, candidate.position_id, current_context.get("skill_ids") or [], candidate.id)
            explicit_skill_ids = next_context.get("skill_ids") or []
            self.screen_candidate(candidate.id, user_id, skill_ids=explicit_skill_ids, use_position_skills=not bool(explicit_skill_ids), use_candidate_memory=not bool(explicit_skill_ids), custom_requirements=screening_request["custom_requirements"])
            latest_score_log = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.task_type == "resume_score", RecruitmentAITaskLog.related_candidate_id == candidate.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).first()
            score_detail = self.get_candidate_detail(candidate.id)
            score_payload = score_detail.get("score") or {}
            used_skill_snapshots = json_loads_safe(latest_score_log.related_skill_snapshots_json, []) if latest_score_log else self._build_skill_snapshots(self._load_skill_rows(score_detail.get("workflow_memory", {}).get("screening_skill_ids") or []), screening_request["custom_requirements"])
            skill_names = "、".join(skill.get("name") or f"Skill #{skill.get('id')}" for skill in used_skill_snapshots) or "未记录"
            reply_lines = [
                f"已完成 {candidate.name} 的初筛。",
                f"本次规则来源：{(latest_score_log.memory_source if latest_score_log else score_detail.get('workflow_memory', {}).get('screening_memory_source')) or '未记录'}。",
                f"本次使用 Skills：{skill_names}。",
            ]
            if screening_request["custom_requirements"]:
                reply_lines.append(f"附加硬性条件：{screening_request['custom_requirements']}")
            reply_lines.append(f"匹配度：{score_payload.get('match_percent') if score_payload.get('match_percent') is not None else '-'}%")
            reply_lines.append(f"建议状态：{score_payload.get('suggested_status') or '未给出'}")
            advantages = score_payload.get("advantages") or []
            concerns = score_payload.get("concerns") or []
            if advantages:
                reply_lines.append(f"优势：{'；'.join([str(item) for item in advantages[:3]])}")
            if concerns:
                reply_lines.append(f"关注点：{'；'.join([str(item) for item in concerns[:3]])}")
            return {"reply": "\n".join(reply_lines), "context": next_context, "actions": ["已完成初筛"], "memory_source": latest_score_log.memory_source if latest_score_log else score_detail.get("workflow_memory", {}).get("screening_memory_source"), "used_skill_snapshots": used_skill_snapshots}

        interview_request = self._extract_chat_interview_request(message)
        if not interview_request:
            return None
        candidate = self._resolve_chat_candidate(message, current_context)
        if not candidate:
            return {"reply": "当前没有定位到候选人。请先在候选人中心选中一位候选人，或直接说“给张三生成初试题”。", "context": current_context, "actions": [], "memory_source": None, "used_skill_snapshots": self._get_chat_skill_snapshots(current_context)}
        next_context = current_context
        if current_context.get("candidate_id") != candidate.id or current_context.get("position_id") != candidate.position_id:
            next_context = self.update_chat_context(user_id, candidate.position_id, current_context.get("skill_ids") or [], candidate.id)
        question = self.generate_interview_questions(candidate.id, interview_request["round_name"], interview_request["custom_requirements"], next_context.get("skill_ids") or [], user_id, use_candidate_memory=True)
        latest_interview_log = self.db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.task_type == "interview_question_generation", RecruitmentAITaskLog.related_candidate_id == candidate.id).order_by(RecruitmentAITaskLog.created_at.desc(), RecruitmentAITaskLog.id.desc()).first()
        used_skill_snapshots = json_loads_safe(latest_interview_log.related_skill_snapshots_json, []) if latest_interview_log else self._build_skill_snapshots(self._load_skill_rows(question.get("skill_ids") or []))
        skill_names = "、".join(skill.get("name") or f"Skill #{skill.get('id')}" for skill in used_skill_snapshots) or "未记录"
        reply_lines = [
            f"已为 {candidate.name} 生成{question.get('round_name') or '面试'}题。",
            f"本次规则来源：{(latest_interview_log.memory_source if latest_interview_log else '未记录')}。",
            f"本次使用 Skills：{skill_names}。",
        ]
        if interview_request["custom_requirements"]:
            reply_lines.append(f"附加要求：{interview_request['custom_requirements']}")
        reply_lines.extend(["", question.get("markdown_content") or "面试题已生成，请到候选人详情查看。"])
        return {"reply": "\n".join(reply_lines), "context": next_context, "actions": ["已生成面试题"], "memory_source": latest_interview_log.memory_source if latest_interview_log else None, "used_skill_snapshots": used_skill_snapshots}

    def chat(self, user_id: str, user_name: str, message: str, context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        if context is not None:
            self.update_chat_context(user_id, context.get("position_id"), context.get("skill_ids") or [], context.get("candidate_id"))
        current_context = self.get_chat_context(user_id)
        lower_message = (message or "").strip().lower()
        resolved = self.ai_gateway.resolve_config("chat_orchestrator")
        model_keywords = ["你是什么模型", "你现在是什么模型", "当前使用什么模型", "使用什么模型", "model", "provider"]
        switch_keywords = ["怎么切模型", "如何切模型", "怎么换模型", "如何换模型", "切到小米", "小米模型", "切到mimo", "mimo"]
        if any(keyword in lower_message for keyword in model_keywords):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = f"当前 AI 助手使用的模型是 {resolved.provider} / {resolved.model_name}。如果你想切换模型，可以到“管理设置 -> 模型配置”里把对应模型设为当前使用。"
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider=resolved.provider, model_name=resolved.model_name, memory_source="manual", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "manual", "model_provider": resolved.provider, "model_name": resolved.model_name, "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots}
        if any(keyword in lower_message for keyword in switch_keywords):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = "要切换到新模型，请打开“管理设置 -> 模型配置”，找到对应任务类型下的模型，点击“设为当前使用”。系统会按 priority 从小到大路由，所以设为当前使用后，该模型会排到当前任务的最高优先级。"
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider="system", model_name="structured-router", memory_source="manual", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "manual", "model_provider": "system", "model_name": "structured-router", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots}

        structured_response = self._handle_structured_chat_command(user_id, message, current_context)
        if structured_response is not None:
            next_context = structured_response.get("context") or current_context
            used_skill_snapshots = list(structured_response.get("used_skill_snapshots") or self._get_chat_skill_snapshots(next_context))
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=next_context, reply=structured_response["reply"], model_provider="system", model_name="structured-router", memory_source=structured_response.get("memory_source"), used_skill_snapshots=used_skill_snapshots, output_snapshot={"reply": structured_response["reply"], "actions": structured_response.get("actions") or []})
            return {"reply": structured_response["reply"], "context": next_context, "actions": structured_response.get("actions") or [], "log_id": log_row.id, "memory_source": structured_response.get("memory_source"), "model_provider": "system", "model_name": "structured-router", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots}

        if not self._is_recruitment_related(message, current_context):
            used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
            reply = "这里是 AI 招聘工作台助手，我只处理招聘相关任务，例如岗位、JD、Skills、候选人、初筛、面试题、Offer 和招聘邮件流转。像天气这类非招聘问题，请到通用助手里处理。"
            log_row = self._record_chat_reply(user_id=user_id, message=message, current_context=current_context, reply=reply, model_provider="system", model_name="recruitment-guard", memory_source="guardrail", used_skill_snapshots=used_skill_snapshots)
            return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "guardrail", "model_provider": "system", "model_name": "recruitment-guard", "used_skill_ids": self._extract_related_skill_ids(used_skill_snapshots), "used_skills": used_skill_snapshots}

        used_skill_snapshots = self._get_chat_skill_snapshots(current_context)
        related_skill_ids = self._extract_related_skill_ids(used_skill_snapshots)
        prompt = json_dumps_safe({"user": user_name, "message": message, "context": current_context, "guardrail": "Only handle recruitment-related requests. Refuse unrelated queries briefly and redirect the user to a general assistant."})
        log_row = self._create_ai_task_log("chat_orchestrator", created_by=user_id, related_position_id=current_context.get("position_id"), related_candidate_id=current_context.get("candidate_id"), related_skill_ids=related_skill_ids, related_skill_snapshots=used_skill_snapshots, request_hash=self._build_request_hash("chat_orchestrator", user_id, message, current_context))
        self._update_ai_task_log(log_row, status="running", prompt_snapshot=prompt, input_summary=truncate_text(prompt, 600), output_summary="正在生成对话回复")
        task = self.ai_gateway.generate_text(task_type="chat_orchestrator", system_prompt="You are an AI recruitment workbench assistant. Reply in concise Chinese. Only handle recruitment-related requests such as positions, JDs, candidates, screening, interview questions, offers, skills, model settings, and recruitment email workflows. If the user asks for unrelated topics such as weather, finance, or general trivia, politely refuse and remind them that this workspace only serves recruitment operations. When the user asks about screening or interview quality, make the active skills and hard constraints explicit.", user_prompt=prompt, fallback_builder=lambda: {"markdown": "我可以帮你处理招聘工作台中的岗位、候选人、Skills、初筛、面试题、模型配置和招聘邮件。如果你需要非招聘问题，请到通用助手处理。", "html": ""})
        content = task.get("content") or {}
        reply = str(content.get("markdown") or "").strip() or "我可以帮你处理招聘工作台中的岗位、候选人、Skills、初筛、面试题、模型配置和招聘邮件。如果你需要非招聘问题，请到通用助手处理。"
        self._finish_ai_task_log(log_row, status="fallback" if task.get("used_fallback") else "success", provider=task.get("provider"), model_name=task.get("model_name"), prompt_snapshot=task.get("prompt_snapshot"), input_summary=task.get("input_summary"), output_summary=task.get("output_summary"), output_snapshot={"reply": reply}, error_message=task.get("error_message"), token_usage=task.get("token_usage"), related_skill_ids=related_skill_ids, related_skill_snapshots=used_skill_snapshots)
        return {"reply": reply, "context": current_context, "actions": [], "log_id": log_row.id, "memory_source": "manual", "model_provider": task.get("provider"), "model_name": task.get("model_name"), "used_skill_ids": related_skill_ids, "used_skills": used_skill_snapshots}

def run_resume_pipeline_background(candidate_id: int, resume_file_id: int, actor_id: str) -> None:
    db = SessionLocal()
    try:
        service = RecruitmentService(db)
        candidate = service._get_candidate(candidate_id)
        if resume_file_id and candidate.latest_resume_file_id != resume_file_id:
            candidate.latest_resume_file_id = resume_file_id
            db.add(candidate)
            db.commit()
        service.screen_candidate(candidate_id, actor_id, skill_ids=[], use_position_skills=True, use_candidate_memory=True)
    finally:
        db.close()
