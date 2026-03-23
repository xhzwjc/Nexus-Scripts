import json
import logging
import os
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
from .services.recruitment_utils import DEFAULT_RULE_CONFIGS, DEFAULT_SKILLS

logger = logging.getLogger(__name__)

_schema_lock = Lock()
_schema_ensured = False
_recruitment_schema_ensured = False


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

        ai_task_columns = {column["name"] for column in inspector.get_columns("recruitment_ai_task_logs")}
        if "related_skill_ids_json" not in ai_task_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_ai_task_logs ADD COLUMN related_skill_ids_json TEXT NULL"))
            logger.info("Added recruitment_ai_task_logs.related_skill_ids_json column")

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

        llm_columns = {column["name"] for column in inspector.get_columns("recruitment_llm_configs")}
        if "api_key_ciphertext" not in llm_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE recruitment_llm_configs ADD COLUMN api_key_ciphertext TEXT NULL"))
            logger.info("Added recruitment_llm_configs.api_key_ciphertext column")

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
                elif (exists.updated_by or "system") == "system":
                    exists.name = skill["name"]
                    exists.description = skill.get("description")
                    exists.content = skill["content"]
                    exists.tags_json = json.dumps(skill.get("tags") or [], ensure_ascii=False)
                    exists.sort_order = skill.get("sort_order") or 99
                    exists.deleted = False
                    exists.is_enabled = True
                    exists.updated_by = "system"

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

            db.commit()

            default_position_links = [
                ("IoT测试工程师", ["skill-iot-resume-screener"]),
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
                db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

        _recruitment_schema_ensured = True
