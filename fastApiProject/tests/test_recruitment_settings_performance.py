import inspect
import json
from typing import Callable, TypeVar

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.recruitment_models import (
    RecruitmentCandidate,
    RecruitmentMailSenderConfig,
    RecruitmentPosition,
    RecruitmentResumeMailDispatch,
    RecruitmentSkill,
)
from app.routers import recruitment
from app.rbac_models import ScriptHubOrganization
from app.services.recruitment_service_impl import RecruitmentService


T = TypeVar("T")


def _build_test_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        bind=engine,
    )
    Base.metadata.create_all(bind=engine)
    return engine, testing_session_local()


def _capture_sql(engine: Engine, operation: Callable[[], T]) -> tuple[T, list[str]]:
    statements: list[str] = []

    def _before_cursor_execute(_connection, _cursor, statement, _parameters, _context, _executemany):
        statements.append(str(statement))

    event.listen(engine, "before_cursor_execute", _before_cursor_execute)
    try:
        return operation(), statements
    finally:
        event.remove(engine, "before_cursor_execute", _before_cursor_execute)


def _add_position(db, index: int) -> RecruitmentPosition:
    row = RecruitmentPosition(
        position_code=f"P-SETTINGS-{index}",
        org_code="group",
        title=f"岗位 {index}",
        status="active",
        deleted=False,
    )
    db.add(row)
    db.flush()
    return row


def _add_candidate(db, index: int, position_id: int) -> RecruitmentCandidate:
    row = RecruitmentCandidate(
        candidate_code=f"C-SETTINGS-{index}",
        org_code="group",
        position_id=position_id,
        name=f"候选人 {index}",
        status="pending_screening",
        tags_json="[]",
        deleted=False,
    )
    db.add(row)
    db.flush()
    return row


def test_skill_summary_query_is_batched_and_preserves_cross_page_filters():
    engine, db = _build_test_db()
    for index in range(30):
        position = _add_position(db, index)
        task_type = "screening" if index % 2 == 0 else "interview"
        db.add(
            RecruitmentSkill(
                skill_code=f"skill-settings-{index}",
                org_code="group",
                name=f"性能方案 {index}",
                description=f"描述 {index}",
                content=(
                    "评分维度与满分：\n1. 技术能力：满分 10 分。证据充分\n判定规则：\n1. 按证据评分"
                    if task_type == "screening" else "面试方案正文"
                ),
                tags_json=json.dumps([f"标签-{index}"], ensure_ascii=False),
                task_types_json=json.dumps([task_type], ensure_ascii=False),
                bound_position_id=position.id,
                sort_order=index,
                is_enabled=True,
                deleted=False,
            )
        )
    db.commit()
    service = RecruitmentService(db)

    page, statements = _capture_sql(
        engine,
        lambda: service.list_skills(summary=True, limit=15, offset=0),
    )

    assert page["total"] == 30
    assert len(page["items"]) == 15
    assert len(statements) <= 3
    assert all("content" not in item for item in page["items"])
    assert all(len(item["content_preview"]) <= 150 for item in page["items"])
    assert all(item["bound_position_title"] for item in page["items"])
    assert page["items"][0]["dimension_count"] == 1

    filtered = service.list_skills(
        summary=True,
        query="岗位 28",
        task_type="screening",
        limit=10,
    )
    assert filtered["total"] == 1
    assert filtered["items"][0]["name"] == "性能方案 28"

    legacy = service.list_skills()
    assert isinstance(legacy, list)
    assert len(legacy) == 30
    assert all("content" in item for item in legacy)


def test_mail_dispatch_page_has_fixed_sql_budget_and_slim_summary():
    engine, db = _build_test_db()
    sender = RecruitmentMailSenderConfig(
        org_code="group",
        name="默认发件箱",
        from_email="sender@example.com",
        smtp_host="smtp.example.com",
        smtp_port=465,
        username="sender@example.com",
        is_default=True,
        is_enabled=True,
        deleted=False,
    )
    db.add(sender)
    db.flush()
    position = _add_position(db, 100)
    candidates = [_add_candidate(db, index, position.id) for index in range(30)]
    for index in range(100):
        candidate = candidates[index % len(candidates)]
        db.add(
            RecruitmentResumeMailDispatch(
                org_code="group",
                sender_config_id=sender.id,
                position_id=position.id,
                candidate_ids_json=json.dumps([candidate.id]),
                recipient_ids_json="[]",
                recipient_emails_json=json.dumps(["recipient@example.com"]),
                subject=f"候选人简历 {index}",
                body_text="正文" * 1024,
                body_html="<p>正文</p>" * 1024,
                trigger_rule_json=json.dumps({"large": "x" * 4096}),
                attachment_count=1,
                status="sent",
                send_mode="manual",
            )
        )
    db.commit()
    service = RecruitmentService(db)

    page, statements = _capture_sql(
        engine,
        lambda: service.list_resume_mail_dispatches(summary=True, limit=20),
    )

    assert page["total"] == 100
    assert len(page["items"]) == 20
    assert len(statements) <= 5
    assert all("body_text" not in item for item in page["items"])
    assert all("body_html" not in item for item in page["items"])
    assert all("trigger_rule" not in item for item in page["items"])
    assert page["items"][0]["candidate_names"][0]
    assert page["items"][0]["position_title"] == "岗位 100"
    summary_select = next(
        statement.lower()
        for statement in statements
        if "from recruitment_resume_mail_dispatches" in statement.lower()
        and "order by" in statement.lower()
    )
    assert "body_text" not in summary_select
    assert "body_html" not in summary_select
    assert "trigger_rule_json" not in summary_select

    safe_default_page = service.list_resume_mail_dispatches(summary=True)
    assert safe_default_page["limit"] == 50
    assert len(safe_default_page["items"]) == 50

    full_list, full_statements = _capture_sql(
        engine,
        service.list_resume_mail_dispatches,
    )
    assert len(full_list) == 100
    assert len(full_statements) == 2
    assert "body_text" in full_list[0]
    assert len(json.dumps(page, ensure_ascii=False)) < len(json.dumps(full_list, ensure_ascii=False)) / 10

    detail = service.get_resume_mail_dispatch(full_list[0]["id"])
    assert detail["body_text"]
    assert detail["body_html"]
    assert detail["trigger_rule"] == {"large": "x" * 4096}


def test_skill_page_filters_authorization_and_selected_organization_before_paging():
    engine, db = _build_test_db()
    for org_code, parent_org_code, path in [
        ("group", None, "group"),
        ("company", "group", "group/company"),
        ("dept", "company", "group/company/dept"),
        ("sibling", "group", "group/sibling"),
    ]:
        db.add(ScriptHubOrganization(
            org_code=org_code,
            name=org_code,
            parent_org_code=parent_org_code,
            path=path,
            is_active=True,
            is_deleted=False,
        ))

    skill_specs = [
        ("dept-private", "dept", "PRIVATE", False, "ORG"),
        ("group-private-shared-flag", "group", "PRIVATE", True, "ORG"),
        ("group-invalid-shared-flag", "group", "INVALID", True, "ORG"),
        ("company-shared", "company", "SHARED_READONLY", True, "ORG"),
        ("sibling-public", "sibling", "PUBLIC_IN_GROUP", False, "ORG"),
        ("sibling-global", "sibling", "PRIVATE", False, "GLOBAL"),
        ("sibling-private", "sibling", "PRIVATE", False, "ORG"),
    ]
    for index, (skill_code, org_code, share_policy, allow_sub_org_use, scope_level) in enumerate(skill_specs):
        db.add(RecruitmentSkill(
            skill_code=skill_code,
            org_code=org_code,
            scope_level=scope_level,
            share_policy=share_policy,
            allow_sub_org_use=allow_sub_org_use,
            name=skill_code,
            content="正文",
            task_types_json='["screening"]',
            sort_order=index,
            is_enabled=True,
            deleted=False,
        ))
    db.commit()

    unrestricted = RecruitmentService(db).list_skills(
        summary=True,
        org_codes=["dept"],
        limit=50,
    )
    assert {item["skill_code"] for item in unrestricted["items"]} == {
        "dept-private",
        "group-private-shared-flag",
        "group-invalid-shared-flag",
        "company-shared",
        "sibling-public",
        "sibling-global",
    }

    scoped_service = RecruitmentService(db).set_permission_context({
        "id": "dept-user",
        "primaryOrgCode": "dept",
        "dataScope": "ORG_ONLY",
        "permissions": {"recruitment-skill-view": True},
    })
    scoped, statements = _capture_sql(
        engine,
        lambda: scoped_service.list_skills(summary=True, org_codes=["dept"], limit=50),
    )
    assert {item["skill_code"] for item in scoped["items"]} == {
        "dept-private",
        "company-shared",
        "sibling-public",
        "sibling-global",
    }
    assert len(statements) <= 3


def test_mail_dispatch_page_applies_selected_organization_before_count():
    _engine, db = _build_test_db()
    db.add(RecruitmentResumeMailDispatch(
        org_code="group",
        candidate_ids_json="[]",
        recipient_ids_json="[]",
        recipient_emails_json="[]",
        subject="group mail",
        status="sent",
        send_mode="manual",
    ))
    db.add(RecruitmentResumeMailDispatch(
        org_code="dept",
        candidate_ids_json="[]",
        recipient_ids_json="[]",
        recipient_emails_json="[]",
        subject="dept mail",
        status="sent",
        send_mode="manual",
    ))
    db.commit()

    page = RecruitmentService(db).list_resume_mail_dispatches(
        org_codes=["dept"],
        summary=True,
        limit=20,
    )
    assert page["total"] == 1
    assert [item["subject"] for item in page["items"]] == ["dept mail"]


def test_settings_read_routes_run_outside_the_event_loop():
    endpoints = (
        recruitment.list_skills,
        recruitment.get_skill_detail,
        recruitment.list_llm_configs,
        recruitment.list_mail_senders,
        recruitment.list_mail_recipients,
        recruitment.get_mail_auto_push_global_config,
        recruitment.list_resume_mail_dispatches,
        recruitment.get_resume_mail_dispatch,
    )

    assert all(not inspect.iscoroutinefunction(endpoint) for endpoint in endpoints)
