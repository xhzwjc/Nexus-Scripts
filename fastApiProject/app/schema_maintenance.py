import json
import logging
import os
import re
from threading import Lock

from sqlalchemy import inspect, text

from .database import Base, SessionLocal, engine
from .rbac_catalog import PERMISSION_DEFINITIONS, ROLE_DEFINITIONS
from .rbac_models import ScriptHubPermission, ScriptHubRole, ScriptHubRolePermission
from .recruitment_models import (
    RecruitmentLLMConfig,
    RecruitmentMailRecipient,
    RecruitmentMailSenderConfig,
    RecruitmentPosition,
    RecruitmentPositionSkillLink,
    RecruitmentResumeMailDispatch,
    RecruitmentRuleConfig,
    RecruitmentSkill,
)
from .secret_crypto import encrypt_secret
from .services.recruitment_utils import DEFAULT_RULE_CONFIGS, DEFAULT_SKILLS

logger = logging.getLogger(__name__)

_schema_lock = Lock()
_schema_ensured = False
_recruitment_schema_ensured = False

_SCHEMA_SKILL_TASK_KEYWORDS = {
    "screening": {"screening", "score", "scoring", "resume_score", "resume-screening", "初筛", "评分", "筛选"},
    "interview": {"interview", "question", "questions", "interview-question", "面试", "面试题", "出题"},
    "jd": {"jd", "job_description", "job-description", "岗位jd", "职位jd", "jd生成", "生成jd", "岗位描述", "职位描述"},
}


def _build_default_recruitment_llm_seed() -> dict:
    if (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_AI_STUDIO_API_KEY")):
        return {
            "config_key": "default-gemini",
            "provider": "gemini",
            "model_name": (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip(),
            "base_url": (os.getenv("GEMINI_API_BASE") or "https://generativelanguage.googleapis.com").strip(),
            "api_key_env": "GEMINI_API_KEY",
        }

    return {
        "config_key": "default-openai-compatible",
        "provider": "openai-compatible",
        "model_name": (os.getenv("RECRUITMENT_LLM_MODEL") or "gpt-4o-mini").strip(),
        "base_url": (os.getenv("RECRUITMENT_LLM_BASE_URL") or os.getenv("OPENAI_BASE_URL") or None),
        "api_key_env": "AI_API_KEY",
    }


def _build_glm_template_seed() -> dict:
    placeholder_key = "1021021902920901"
    ciphertext = None
    try:
        ciphertext = encrypt_secret(placeholder_key)
    except Exception as exc:
        logger.warning("Failed to seed stored GLM placeholder key: %s", exc)

    return {
        "config_key": "glm-flash-template",
        "task_type": "default",
        "provider": "glm",
        "model_name": (os.getenv("GLM_MODEL") or os.getenv("ZHIPUAI_MODEL") or "glm-4-flash").strip(),
        "base_url": (os.getenv("GLM_BASE_URL") or os.getenv("ZHIPUAI_BASE_URL") or "https://open.bigmodel.cn/api/paas/v4").strip(),
        "api_key_env": "GLM_API_KEY",
        "api_key_ciphertext": ciphertext,
        "extra_config_json": json.dumps({}, ensure_ascii=False),
        "is_active": True,
        "priority": 99,
    }


def _needs_legacy_default_skill_refresh(row: RecruitmentSkill) -> bool:
    if row.skill_code != "skill-iot-resume-screener":
        return False
    text = f"{row.description or ''}\n{row.content or ''}"
    legacy_markers = [
        "面试分析 Skill",
        "模块三",
        "面试结果分析",
        "个人信息卡片时机",
        "全流程招聘助手，分三个模块",
        "专用筛选、出题与面试分析 Skill",
    ]
    return any(marker in text for marker in legacy_markers)


def _parse_skill_frontmatter(content: str) -> dict[str, str]:
    match = re.match(r"^\s*---\s*\r?\n(.*?)\r?\n---\s*(?:\r?\n|$)", content or "", re.DOTALL)
    if not match:
        return {}
    result: dict[str, str] = {}
    for raw_line in match.group(1).splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = value.strip().strip("'").strip('"')
        if key and value:
            result[key] = value
    return result


def _normalize_schema_skill_task_name(value: str) -> str | None:
    text = (value or "").strip().lower()
    if not text:
        return None
    for task_kind, keywords in _SCHEMA_SKILL_TASK_KEYWORDS.items():
        if text == task_kind or text in keywords:
            return task_kind
    return None


def _extract_schema_skill_tasks(row: RecruitmentSkill) -> list[str]:
    tags = json.loads(row.tags_json or "[]") if row.tags_json else []
    if not isinstance(tags, list):
        tags = []
    tag_texts = [str(item or "").strip() for item in tags if str(item or "").strip()]
    frontmatter = _parse_skill_frontmatter(row.content or "")
    task_candidates: list[str] = []
    for field_name in ["applies_to", "task", "tasks", "task_type"]:
        raw_value = frontmatter.get(field_name)
        if raw_value:
            task_candidates.extend(re.split(r"[,/|，、\s]+", raw_value))
    for tag in tag_texts:
        lower_tag = tag.lower()
        if lower_tag.startswith("task:"):
            task_candidates.append(tag.split(":", 1)[1].strip())
        else:
            task_candidates.append(tag)
    haystacks = [str(row.skill_code or "").lower(), str(row.name or "").lower(), *[tag.lower() for tag in tag_texts]]
    tasks: list[str] = []
    for raw_value in task_candidates:
        normalized = _normalize_schema_skill_task_name(raw_value)
        if normalized and normalized not in tasks:
            tasks.append(normalized)
    if not tasks:
        for task_kind, keywords in _SCHEMA_SKILL_TASK_KEYWORDS.items():
            if any(any(keyword in haystack for keyword in keywords) for haystack in haystacks if haystack):
                tasks.append(task_kind)
    return tasks
def _sync_script_hub_catalog() -> None:
    db = SessionLocal()
    try:
        permission_rows = {
            row.permission_key: row
            for row in db.query(ScriptHubPermission).all()
        }
        for definition in PERMISSION_DEFINITIONS:
            row = permission_rows.get(definition.key)
            if row is None:
                row = ScriptHubPermission(
                    permission_key=definition.key,
                    name=definition.name,
                    category=definition.category,
                    description=definition.description,
                    sort_order=definition.sort_order,
                    is_active=True,
                )
                db.add(row)
                permission_rows[definition.key] = row
            else:
                row.name = definition.name
                row.category = definition.category
                row.description = definition.description
                row.sort_order = definition.sort_order
                row.is_active = True

        db.flush()

        role_rows = {
            row.role_code: row
            for row in db.query(ScriptHubRole).all()
        }
        for definition in ROLE_DEFINITIONS:
            row = role_rows.get(definition.code)
            if row is None:
                row = ScriptHubRole(
                    role_code=definition.code,
                    name=definition.name,
                    description=definition.description,
                    sort_order=definition.sort_order,
                    is_system=True,
                    is_active=True,
                    is_deleted=False,
                    deleted_at=None,
                )
                db.add(row)
                role_rows[definition.code] = row
            else:
                row.name = definition.name
                row.description = definition.description
                row.sort_order = definition.sort_order
                row.is_system = True
                row.is_active = True
                row.is_deleted = False
                row.deleted_at = None

        db.flush()

        permission_id_by_key = {
            row.permission_key: row.id
            for row in db.query(ScriptHubPermission).all()
        }
        existing_links = {
            (row.role_id, row.permission_id)
            for row in db.query(ScriptHubRolePermission).all()
        }
        for definition in ROLE_DEFINITIONS:
            role = role_rows.get(definition.code)
            if role is None:
                continue
            for permission_key in definition.permissions:
                permission_id = permission_id_by_key.get(permission_key)
                if permission_id is None:
                    continue
                link_key = (role.id, permission_id)
                if link_key in existing_links:
                    continue
                db.add(ScriptHubRolePermission(role_id=role.id, permission_id=permission_id))
                existing_links.add(link_key)

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def ensure_script_hub_schema() -> None:
    global _schema_ensured

    if _schema_ensured:
        return

    with _schema_lock:
        if _schema_ensured:
            return

        Base.metadata.create_all(bind=engine)
        inspector = inspect(engine)
        if not inspector.has_table("script_hub_users"):
            _schema_ensured = True
            return

        columns = {column["name"] for column in inspector.get_columns("script_hub_users")}
        if "team_resources_access_enabled" not in columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE script_hub_users ADD COLUMN team_resources_access_enabled BOOLEAN NOT NULL DEFAULT TRUE"))
            logger.info("Added script_hub_users.team_resources_access_enabled column")

        if "is_deleted" not in columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE script_hub_users ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE"))
            logger.info("Added script_hub_users.is_deleted column")

        if "deleted_at" not in columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE script_hub_users ADD COLUMN deleted_at DATETIME NULL"))
            logger.info("Added script_hub_users.deleted_at column")

        role_columns = {column["name"] for column in inspector.get_columns("script_hub_roles")}
        if "is_deleted" not in role_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE script_hub_roles ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE"))
            logger.info("Added script_hub_roles.is_deleted column")

        if "deleted_at" not in role_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE script_hub_roles ADD COLUMN deleted_at DATETIME NULL"))
            logger.info("Added script_hub_roles.deleted_at column")

        _sync_script_hub_catalog()
        _schema_ensured = True


def ensure_recruitment_schema() -> None:
    global _recruitment_schema_ensured

    if _recruitment_schema_ensured:
        return

    with _schema_lock:
        if _recruitment_schema_ensured:
            return

        Base.metadata.create_all(bind=engine)
        inspector = inspect(engine)
        if not inspector.has_table("recruitment_rule_configs"):
            _recruitment_schema_ensured = True
            return

        jd_columns = {column["name"] for column in inspector.get_columns("recruitment_jd_versions")}
        if "publish_text" not in jd_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_jd_versions ADD COLUMN publish_text TEXT NULL"))
            logger.info("Added recruitment_jd_versions.publish_text column")

        position_columns = {column["name"] for column in inspector.get_columns("recruitment_positions")}
        if "auto_screen_on_upload" not in position_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_positions ADD COLUMN auto_screen_on_upload BOOLEAN NOT NULL DEFAULT FALSE"))
            logger.info("Added recruitment_positions.auto_screen_on_upload column")
        if "auto_advance_on_screening" not in position_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_positions ADD COLUMN auto_advance_on_screening BOOLEAN NOT NULL DEFAULT TRUE"))
            logger.info("Added recruitment_positions.auto_advance_on_screening column")
        if "jd_skill_ids_json" not in position_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_positions ADD COLUMN jd_skill_ids_json TEXT NULL"))
            logger.info("Added recruitment_positions.jd_skill_ids_json column")
        if "screening_skill_ids_json" not in position_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_positions ADD COLUMN screening_skill_ids_json TEXT NULL"))
            logger.info("Added recruitment_positions.screening_skill_ids_json column")
        if "interview_skill_ids_json" not in position_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_positions ADD COLUMN interview_skill_ids_json TEXT NULL"))
            logger.info("Added recruitment_positions.interview_skill_ids_json column")

        ai_task_columns = {column["name"] for column in inspector.get_columns("recruitment_ai_task_logs")}
        if "related_skill_ids_json" not in ai_task_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs ADD COLUMN related_skill_ids_json TEXT NULL"))
            logger.info("Added recruitment_ai_task_logs.related_skill_ids_json column")
        if "related_skill_snapshots_json" not in ai_task_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs ADD COLUMN related_skill_snapshots_json TEXT NULL"))
            logger.info("Added recruitment_ai_task_logs.related_skill_snapshots_json column")

        if "memory_source" not in ai_task_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs ADD COLUMN memory_source VARCHAR(80) NULL"))
            logger.info("Added recruitment_ai_task_logs.memory_source column")
        if "request_hash" not in ai_task_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs ADD COLUMN request_hash VARCHAR(120) NULL"))
            logger.info("Added recruitment_ai_task_logs.request_hash column")
        if "output_snapshot" not in ai_task_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs ADD COLUMN output_snapshot TEXT NULL"))
            logger.info("Added recruitment_ai_task_logs.output_snapshot column")
        if "full_request_snapshot" not in ai_task_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs ADD COLUMN full_request_snapshot TEXT NULL"))
            logger.info("Added recruitment_ai_task_logs.full_request_snapshot column")
        if engine.dialect.name == "mysql":
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN related_skill_snapshots_json LONGTEXT NULL"))
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN prompt_snapshot LONGTEXT NULL"))
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN full_request_snapshot LONGTEXT NULL"))
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN output_summary LONGTEXT NULL"))
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN output_snapshot LONGTEXT NULL"))
            logger.info("Expanded recruitment_ai_task_logs large text columns to LONGTEXT")

        score_columns = {column["name"]: column for column in inspector.get_columns("recruitment_candidate_scores")}
        recommendation_column = score_columns.get("recommendation")
        recommendation_length = None
        if recommendation_column is not None:
            recommendation_length = getattr(recommendation_column.get("type"), "length", None)
        if recommendation_column is not None and recommendation_length and recommendation_length < 255:
            if engine.dialect.name == "mysql":
                with engine.begin() as connection:
                    connection.execute(text("ALTER TABLE recruitment_candidate_scores MODIFY COLUMN recommendation VARCHAR(255) NULL"))
                logger.info("Expanded recruitment_candidate_scores.recommendation to VARCHAR(255)")
            else:
                logger.info("Skipped expanding recruitment_candidate_scores.recommendation on dialect %s", engine.dialect.name)

        llm_columns = {column["name"] for column in inspector.get_columns("recruitment_llm_configs")}
        if "api_key_ciphertext" not in llm_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_llm_configs ADD COLUMN api_key_ciphertext TEXT NULL"))
            logger.info("Added recruitment_llm_configs.api_key_ciphertext column")

        mail_dispatch_columns = {column["name"] for column in inspector.get_columns("recruitment_resume_mail_dispatches")}
        if "position_id" not in mail_dispatch_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_resume_mail_dispatches ADD COLUMN position_id INTEGER NULL"))
            logger.info("Added recruitment_resume_mail_dispatches.position_id column")
        if "screening_score_id" not in mail_dispatch_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_resume_mail_dispatches ADD COLUMN screening_score_id INTEGER NULL"))
            logger.info("Added recruitment_resume_mail_dispatches.screening_score_id column")
        if "cc_recipient_ids_json" not in mail_dispatch_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_resume_mail_dispatches ADD COLUMN cc_recipient_ids_json TEXT NULL"))
            logger.info("Added recruitment_resume_mail_dispatches.cc_recipient_ids_json column")
        if "cc_recipient_emails_json" not in mail_dispatch_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_resume_mail_dispatches ADD COLUMN cc_recipient_emails_json TEXT NULL"))
            logger.info("Added recruitment_resume_mail_dispatches.cc_recipient_emails_json column")
        if "bcc_recipient_ids_json" not in mail_dispatch_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_resume_mail_dispatches ADD COLUMN bcc_recipient_ids_json TEXT NULL"))
            logger.info("Added recruitment_resume_mail_dispatches.bcc_recipient_ids_json column")
        if "bcc_recipient_emails_json" not in mail_dispatch_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_resume_mail_dispatches ADD COLUMN bcc_recipient_emails_json TEXT NULL"))
            logger.info("Added recruitment_resume_mail_dispatches.bcc_recipient_emails_json column")
        if "send_mode" not in mail_dispatch_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_resume_mail_dispatches ADD COLUMN send_mode VARCHAR(50) NOT NULL DEFAULT 'manual'"))
            logger.info("Added recruitment_resume_mail_dispatches.send_mode column")
        if "trigger_type" not in mail_dispatch_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_resume_mail_dispatches ADD COLUMN trigger_type VARCHAR(80) NULL"))
            logger.info("Added recruitment_resume_mail_dispatches.trigger_type column")
        if "candidate_status" not in mail_dispatch_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_resume_mail_dispatches ADD COLUMN candidate_status VARCHAR(50) NULL"))
            logger.info("Added recruitment_resume_mail_dispatches.candidate_status column")
        if "dedup_key" not in mail_dispatch_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_resume_mail_dispatches ADD COLUMN dedup_key VARCHAR(255) NULL"))
            logger.info("Added recruitment_resume_mail_dispatches.dedup_key column")
        if "trigger_rule_json" not in mail_dispatch_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_resume_mail_dispatches ADD COLUMN trigger_rule_json TEXT NULL"))
            logger.info("Added recruitment_resume_mail_dispatches.trigger_rule_json column")

        db = SessionLocal()
        try:
            for config_key, config_value in DEFAULT_RULE_CONFIGS.items():
                exists = db.query(RecruitmentRuleConfig).filter(RecruitmentRuleConfig.config_key == config_key, RecruitmentRuleConfig.scope == "global").first()
                if not exists:
                    db.add(RecruitmentRuleConfig(config_key=config_key, config_type="json", scope="global", scope_id=None, config_value=json.dumps(config_value, ensure_ascii=False), description=f"Default recruitment config: {config_key}"))

            for skill in DEFAULT_SKILLS:
                exists = db.query(RecruitmentSkill).filter(RecruitmentSkill.skill_code == skill["skill_code"]).first()
                if not exists:
                    db.add(RecruitmentSkill(skill_code=skill["skill_code"], name=skill["name"], description=skill.get("description"), content=skill["content"], tags_json=json.dumps(skill.get("tags") or [], ensure_ascii=False), sort_order=skill.get("sort_order") or 99, is_enabled=True, created_by="system", updated_by="system", deleted=False))
                elif exists.deleted:
                    continue
                elif (exists.updated_by or "system") == "system" or _needs_legacy_default_skill_refresh(exists):
                    exists.name = skill["name"]
                    exists.description = skill.get("description")
                    exists.content = skill["content"]
                    exists.tags_json = json.dumps(skill.get("tags") or [], ensure_ascii=False)
                    exists.sort_order = skill.get("sort_order") or 99
                    exists.is_enabled = bool(exists.is_enabled)
                    exists.updated_by = "system"

            legacy_combined_skill = db.query(RecruitmentSkill).filter(RecruitmentSkill.skill_code == "skill-iot-resume-screener").first()
            split_screening_skill = db.query(RecruitmentSkill).filter(RecruitmentSkill.skill_code == "skill-iot-screening-score", RecruitmentSkill.deleted.is_(False)).first()
            split_interview_skill = db.query(RecruitmentSkill).filter(RecruitmentSkill.skill_code == "skill-iot-interview-question", RecruitmentSkill.deleted.is_(False)).first()
            if legacy_combined_skill and split_screening_skill and split_interview_skill and not legacy_combined_skill.deleted and (legacy_combined_skill.updated_by or "system") == "system":
                legacy_combined_skill.is_enabled = False
                legacy_combined_skill.updated_by = "system"

            default_seed = _build_default_recruitment_llm_seed()
            llm_exists = db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.config_key == default_seed["config_key"]).first()
            if not llm_exists:
                legacy_default = db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.config_key == "default-openai-compatible").first()
                if legacy_default and default_seed["provider"] == "gemini":
                    legacy_default.config_key = default_seed["config_key"]
                    legacy_default.provider = default_seed["provider"]
                    legacy_default.model_name = default_seed["model_name"]
                    legacy_default.base_url = default_seed["base_url"]
                    legacy_default.api_key_env = default_seed["api_key_env"]
                    legacy_default.priority = 1
                    legacy_default.is_active = True
                else:
                    db.add(
                        RecruitmentLLMConfig(
                            config_key=default_seed["config_key"],
                            task_type="default",
                            provider=default_seed["provider"],
                            model_name=default_seed["model_name"],
                            base_url=default_seed["base_url"],
                            api_key_env=default_seed["api_key_env"],
                            extra_config_json=None,
                            is_active=True,
                            priority=1,
                        ),
                    )

            glm_seed = _build_glm_template_seed()
            glm_exists = db.query(RecruitmentLLMConfig).filter(RecruitmentLLMConfig.config_key == glm_seed["config_key"]).first()
            if not glm_exists:
                db.add(
                    RecruitmentLLMConfig(
                        config_key=glm_seed["config_key"],
                        task_type=glm_seed["task_type"],
                        provider=glm_seed["provider"],
                        model_name=glm_seed["model_name"],
                        base_url=glm_seed["base_url"],
                        api_key_env=glm_seed["api_key_env"],
                        api_key_ciphertext=glm_seed["api_key_ciphertext"],
                        extra_config_json=glm_seed["extra_config_json"],
                        is_active=glm_seed["is_active"],
                        priority=glm_seed["priority"],
                    ),
                )

            db.commit()

            default_position_links = [
                ("IoT测试工程师", ["skill-iot-screening-score"]),
            ]
            skill_rows = {
                row.skill_code: row
                for row in db.query(RecruitmentSkill).filter(RecruitmentSkill.deleted.is_(False)).all()
            }
            for title, skill_codes in default_position_links:
                position = db.query(RecruitmentPosition).filter(RecruitmentPosition.deleted.is_(False), RecruitmentPosition.title == title).first()
                if not position:
                    continue
                existing_ids = {
                    row.skill_id
                    for row in db.query(RecruitmentPositionSkillLink).filter(RecruitmentPositionSkillLink.position_id == position.id).all()
                }
                for skill_code in skill_codes:
                    skill = skill_rows.get(skill_code)
                    if skill and skill.id not in existing_ids:
                        db.add(RecruitmentPositionSkillLink(position_id=position.id, skill_id=skill.id, created_by="system", updated_by="system"))
                legacy_skill = skill_rows.get("skill-iot-resume-screener")
                if legacy_skill:
                    db.query(RecruitmentPositionSkillLink).filter(
                        RecruitmentPositionSkillLink.position_id == position.id,
                        RecruitmentPositionSkillLink.skill_id == legacy_skill.id,
                    ).delete(synchronize_session=False)
                db.commit()

            all_skill_rows = {
                row.id: row
                for row in db.query(RecruitmentSkill).filter(RecruitmentSkill.deleted.is_(False)).all()
            }
            positions = db.query(RecruitmentPosition).filter(RecruitmentPosition.deleted.is_(False)).all()
            for position in positions:
                if (
                    position.jd_skill_ids_json is not None
                    and position.screening_skill_ids_json is not None
                    and position.interview_skill_ids_json is not None
                ):
                    continue
                linked_ids = [
                    row.skill_id
                    for row in db.query(RecruitmentPositionSkillLink)
                    .filter(RecruitmentPositionSkillLink.position_id == position.id)
                    .order_by(RecruitmentPositionSkillLink.id.asc())
                    .all()
                ]
                jd_ids: list[int] = []
                screening_ids: list[int] = []
                interview_ids: list[int] = []
                for skill_id in linked_ids:
                    skill = all_skill_rows.get(skill_id)
                    if not skill:
                        continue
                    tasks = _extract_schema_skill_tasks(skill)
                    if "jd" in tasks and skill_id not in jd_ids:
                        jd_ids.append(skill_id)
                    if "screening" in tasks and skill_id not in screening_ids:
                        screening_ids.append(skill_id)
                    if "interview" in tasks and skill_id not in interview_ids:
                        interview_ids.append(skill_id)
                if position.jd_skill_ids_json is None:
                    position.jd_skill_ids_json = json.dumps(jd_ids, ensure_ascii=False)
                if position.screening_skill_ids_json is None:
                    position.screening_skill_ids_json = json.dumps(screening_ids, ensure_ascii=False)
                if position.interview_skill_ids_json is None:
                    position.interview_skill_ids_json = json.dumps(interview_ids, ensure_ascii=False)
                db.add(position)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        _recruitment_schema_ensured = True
