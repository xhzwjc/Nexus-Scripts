import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.permission_governance import (
    DATA_SCOPE_ALL,
    DATA_SCOPE_CUSTOM_ORGS,
    DATA_SCOPE_ORG_AND_CHILDREN,
    DATA_SCOPE_ORG_ONLY,
    DATA_SCOPE_SELF,
)
from app.rbac_catalog import PERMISSION_DEFINITIONS, ROLE_DEFINITIONS
from app.rbac_models import (
    ScriptHubOrganization,
    ScriptHubPermission,
    ScriptHubRole,
    ScriptHubRolePermission,
    ScriptHubUser,
)
from app.recruitment_models import (
    RecruitmentCandidate,
    RecruitmentCandidateScore,
    RecruitmentCandidateStatusHistory,
    RecruitmentInterviewQuestion,
    RecruitmentLLMConfig,
    RecruitmentMailRecipient,
    RecruitmentMailSenderConfig,
    RecruitmentPosition,
    RecruitmentResumeFile,
    RecruitmentResumeParseResult,
)
from app.services.recruitment_service import RecruitmentService
from app.services.script_hub_admin_service import create_rbac_user
from app.services.script_hub_auth_service import serialize_user_session


def _build_test_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    return testing_session_local()


def _seed_catalog(db):
    permission_rows = {}
    for definition in PERMISSION_DEFINITIONS:
        permission = ScriptHubPermission(
            permission_key=definition.key,
            name=definition.name,
            category=definition.category,
            description=definition.description,
            sort_order=definition.sort_order,
            is_active=True,
        )
        db.add(permission)
        permission_rows[definition.key] = permission

    db.flush()

    role_rows = {}
    for definition in ROLE_DEFINITIONS:
        role = ScriptHubRole(
            role_code=definition.code,
            name=definition.name,
            description=definition.description,
            sort_order=definition.sort_order,
            is_system=True,
            is_active=True,
            is_deleted=False,
        )
        db.add(role)
        role_rows[definition.code] = role

    db.flush()

    for definition in ROLE_DEFINITIONS:
        for permission_key in definition.permissions:
            db.add(
                ScriptHubRolePermission(
                    role_id=role_rows[definition.code].id,
                    permission_id=permission_rows[permission_key].id,
                )
            )

    db.commit()


def _seed_org_tree(db):
    orgs = [
        ("group", "总集团", "group", None, "group", 1),
        ("haoshi", "好柿公司", "company", "group", "group/haoshi", 10),
        ("chunmiao", "春苗公司", "company", "group", "group/chunmiao", 20),
        ("chunmiao-rd", "春苗研发部", "department", "chunmiao", "group/chunmiao/chunmiao-rd", 10),
        ("chunmiao-fin", "春苗财务部", "department", "chunmiao", "group/chunmiao/chunmiao-fin", 20),
        ("haoshi-ops", "好柿运营部", "department", "haoshi", "group/haoshi/haoshi-ops", 10),
    ]
    for org_code, name, org_type, parent, path, sort_order in orgs:
        db.add(
            ScriptHubOrganization(
                org_code=org_code,
                name=name,
                org_type=org_type,
                parent_org_code=parent,
                path=path,
                sort_order=sort_order,
                is_active=True,
            )
        )
    db.commit()


def _session(user_code, org_code, data_scope, *, custom_orgs=None, super_admin=False, roles=None):
    return {
        "id": user_code,
        "role": "tester",
        "roles": roles or [],
        "name": user_code,
        "permissions": {
            "ai-recruitment": True,
            "ai-recruitment-manage": True,
            "resource-sharing-manage": True,
        },
        "isSuperAdmin": super_admin,
        "primaryOrgCode": org_code,
        "dataScope": data_scope,
        "customOrgCodes": custom_orgs or [],
        "authorizationBoundary": {},
        "teamResourcesLoginKeyEnabled": False,
    }


def _grantor_session(user_code, org_code, data_scope, *, managed_orgs, max_scope=DATA_SCOPE_ORG_ONLY):
    return {
        **_session(user_code, org_code, data_scope),
        "authorizationBoundary": {
            "can_grant": True,
            "managed_org_codes": managed_orgs,
            "assignable_role_codes": ["operator"],
            "assignable_permission_keys": ["recruitment-dashboard-view"],
            "max_data_scope": max_scope,
        },
    }


def _service(db, session):
    return RecruitmentService(db).set_permission_context(session)


def _create_position(db, session, *, org_code, title, actor_id):
    return _service(db, session).create_position(
        {
            "org_code": org_code,
            "title": title,
            "headcount": 1,
            "status": "open",
            "department": org_code,
        },
        actor_id,
    )


def _add_candidate(db, *, org_code, position_id, name, created_by):
    row = RecruitmentCandidate(
        candidate_code=f"CAND-{org_code}-{name}".replace(" ", "-"),
        org_code=org_code,
        position_id=position_id,
        name=name,
        source="manual_upload",
        status="pending_screening",
        created_by=created_by,
        updated_by=created_by,
        deleted=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _names(rows):
    return {row["title"] if "title" in row else row["name"] for row in rows}


def _orgs(rows):
    return {row["org_code"] for row in rows}


def _scope_orgs(scope):
    return {row["org_code"] for row in scope["organizations"]}


def _seed_recruitment_dataset(db):
    admin = _session("group-admin", "group", DATA_SCOPE_ALL, super_admin=True)
    positions = {
        "group": _create_position(db, admin, org_code="group", title="集团人事负责人", actor_id="group-hr"),
        "haoshi": _create_position(db, admin, org_code="haoshi", title="好柿门店运营", actor_id="haoshi-hr"),
        "haoshi-ops": _create_position(db, admin, org_code="haoshi-ops", title="好柿运营专员", actor_id="haoshi-ops"),
        "chunmiao": _create_position(db, admin, org_code="chunmiao", title="春苗公司 HRBP", actor_id="chunmiao-hr"),
        "chunmiao-rd": _create_position(db, admin, org_code="chunmiao-rd", title="春苗研发工程师", actor_id="rd-user"),
        "chunmiao-rd-other": _create_position(db, admin, org_code="chunmiao-rd", title="春苗研发测试岗", actor_id="rd-other"),
        "chunmiao-fin": _create_position(db, admin, org_code="chunmiao-fin", title="春苗财务会计", actor_id="fin-user"),
    }
    candidates = {
        "group": _add_candidate(db, org_code="group", position_id=positions["group"]["id"], name="集团候选人", created_by="group-hr"),
        "haoshi": _add_candidate(db, org_code="haoshi", position_id=positions["haoshi"]["id"], name="好柿候选人", created_by="haoshi-hr"),
        "haoshi-ops": _add_candidate(db, org_code="haoshi-ops", position_id=positions["haoshi-ops"]["id"], name="好柿运营候选人", created_by="haoshi-ops"),
        "chunmiao": _add_candidate(db, org_code="chunmiao", position_id=positions["chunmiao"]["id"], name="春苗公司候选人", created_by="chunmiao-hr"),
        "chunmiao-rd": _add_candidate(db, org_code="chunmiao-rd", position_id=positions["chunmiao-rd"]["id"], name="研发候选人", created_by="rd-user"),
        "chunmiao-rd-other": _add_candidate(db, org_code="chunmiao-rd", position_id=positions["chunmiao-rd-other"]["id"], name="研发其他候选人", created_by="rd-other"),
        "chunmiao-fin": _add_candidate(db, org_code="chunmiao-fin", position_id=positions["chunmiao-fin"]["id"], name="财务候选人", created_by="fin-user"),
    }
    return positions, candidates


def test_recruitment_positions_and_candidates_follow_group_company_department_scopes():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        positions, candidates = _seed_recruitment_dataset(db)

        group_all = _service(db, _session("group-admin", "group", DATA_SCOPE_ALL, super_admin=True))
        assert _orgs(group_all.list_positions()) == {"group", "haoshi", "haoshi-ops", "chunmiao", "chunmiao-rd", "chunmiao-fin"}
        assert _orgs(group_all.list_candidates()) == {"group", "haoshi", "haoshi-ops", "chunmiao", "chunmiao-rd", "chunmiao-fin"}

        raw_super_admin_limited = _service(db, _session("super-admin-raw", "group", DATA_SCOPE_ORG_ONLY, super_admin=True))
        assert _orgs(raw_super_admin_limited.list_positions()) == {"group", "haoshi", "haoshi-ops", "chunmiao", "chunmiao-rd", "chunmiao-fin"}

        raw_admin_role_limited = _service(db, _session("admin-role-raw", "group", DATA_SCOPE_ORG_ONLY, roles=["admin"]))
        assert _orgs(raw_admin_role_limited.list_candidates()) == {"group", "haoshi", "haoshi-ops", "chunmiao", "chunmiao-rd", "chunmiao-fin"}

        group_children = _service(db, _session("group-leader", "group", DATA_SCOPE_ORG_AND_CHILDREN))
        assert _orgs(group_children.list_positions()) == {"group", "haoshi", "haoshi-ops", "chunmiao", "chunmiao-rd", "chunmiao-fin"}

        group_only = _service(db, _session("group-only", "group", DATA_SCOPE_ORG_ONLY))
        assert _names(group_only.list_positions()) == {"集团人事负责人"}
        assert _names(group_only.list_candidates()) == {"集团候选人"}

        chunmiao_only = _service(db, _session("chunmiao-company", "chunmiao", DATA_SCOPE_ORG_ONLY))
        assert _names(chunmiao_only.list_positions()) == {"春苗公司 HRBP"}
        assert _names(chunmiao_only.list_candidates()) == {"春苗公司候选人"}

        chunmiao_leader = _service(db, _session("chunmiao-leader", "chunmiao", DATA_SCOPE_ORG_AND_CHILDREN))
        assert _orgs(chunmiao_leader.list_positions()) == {"chunmiao", "chunmiao-rd", "chunmiao-fin"}
        assert _orgs(chunmiao_leader.list_candidates()) == {"chunmiao", "chunmiao-rd", "chunmiao-fin"}

        rd_user = _service(db, _session("rd-user", "chunmiao-rd", DATA_SCOPE_ORG_ONLY))
        assert _names(rd_user.list_positions()) == {"春苗研发工程师", "春苗研发测试岗"}
        assert _names(rd_user.list_candidates()) == {"研发候选人", "研发其他候选人"}
        with pytest.raises(ValueError):
            rd_user.get_candidate_detail(candidates["chunmiao-fin"].id)
        with pytest.raises(ValueError):
            rd_user.get_position_detail(positions["chunmiao-fin"]["id"])

        rd_self = _service(db, _session("rd-user", "chunmiao-rd", DATA_SCOPE_SELF))
        assert _names(rd_self.list_positions()) == {"春苗研发工程师"}
        assert _names(rd_self.list_candidates()) == {"研发候选人"}

        custom = _service(
            db,
            _session(
                "cross-dept",
                "group",
                DATA_SCOPE_CUSTOM_ORGS,
                custom_orgs=["chunmiao-rd", "haoshi"],
            ),
        )
        assert _orgs(custom.list_positions()) == {"chunmiao-rd", "haoshi"}
        assert _orgs(custom.list_candidates()) == {"chunmiao-rd", "haoshi"}

        with pytest.raises(ValueError):
            _create_position(db, _session("rd-user", "chunmiao-rd", DATA_SCOPE_ORG_ONLY), org_code="chunmiao-fin", title="越权财务岗", actor_id="rd-user")

        created_by_leader = _create_position(
            db,
            _session("chunmiao-leader", "chunmiao", DATA_SCOPE_ORG_AND_CHILDREN),
            org_code="chunmiao-rd",
            title="春苗研发架构师",
            actor_id="chunmiao-leader",
        )
        assert created_by_leader["org_code"] == "chunmiao-rd"
    finally:
        db.close()


def test_recruitment_organization_scope_exposes_only_authorized_nodes_and_ancestors():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)

        group_scope = _service(db, _session("group-admin", "group", DATA_SCOPE_ALL, super_admin=True)).get_organization_scope()
        assert group_scope["has_all_orgs"] is True
        assert set(group_scope["visible_org_codes"]) == {"group", "haoshi", "haoshi-ops", "chunmiao", "chunmiao-rd", "chunmiao-fin"}
        assert _scope_orgs(group_scope) == {"group", "haoshi", "haoshi-ops", "chunmiao", "chunmiao-rd", "chunmiao-fin"}

        chunmiao_scope = _service(db, _session("chunmiao-leader", "chunmiao", DATA_SCOPE_ORG_AND_CHILDREN)).get_organization_scope()
        assert set(chunmiao_scope["visible_org_codes"]) == {"chunmiao", "chunmiao-rd", "chunmiao-fin"}
        assert _scope_orgs(chunmiao_scope) == {"group", "chunmiao", "chunmiao-rd", "chunmiao-fin"}
        assert "haoshi" not in _scope_orgs(chunmiao_scope)
        assert "haoshi-ops" not in _scope_orgs(chunmiao_scope)

        rd_scope = _service(db, _session("rd-user", "chunmiao-rd", DATA_SCOPE_ORG_ONLY)).get_organization_scope()
        assert set(rd_scope["visible_org_codes"]) == {"chunmiao-rd"}
        assert _scope_orgs(rd_scope) == {"group", "chunmiao", "chunmiao-rd"}
        assert "chunmiao-fin" not in _scope_orgs(rd_scope)

        cross_scope = _service(
            db,
            _session("cross-leader", "group", DATA_SCOPE_CUSTOM_ORGS, custom_orgs=["chunmiao-rd", "haoshi"]),
        ).get_organization_scope()
        assert set(cross_scope["visible_org_codes"]) == {"chunmiao-rd", "haoshi"}
        assert _scope_orgs(cross_scope) == {"group", "chunmiao", "chunmiao-rd", "haoshi"}
        assert "chunmiao-fin" not in _scope_orgs(cross_scope)
        assert "haoshi-ops" not in _scope_orgs(cross_scope)
    finally:
        db.close()


def test_candidate_reassignment_is_validated_and_does_not_leak_cross_org_position_detail():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        positions, candidates = _seed_recruitment_dataset(db)

        rd_user = _service(db, _session("rd-user", "chunmiao-rd", DATA_SCOPE_ORG_ONLY))
        with pytest.raises(ValueError):
            rd_user.update_candidate(candidates["chunmiao-rd"].id, {"position_id": positions["chunmiao-fin"]["id"]}, "rd-user")

        leak = _add_candidate(
            db,
            org_code="haoshi",
            position_id=positions["chunmiao-rd"]["id"],
            name="异常跨组织候选人",
            created_by="haoshi-hr",
        )
        rd_position_detail = rd_user.get_position_detail(positions["chunmiao-rd"]["id"])
        assert {item["name"] for item in rd_position_detail["candidates"]} == {"研发候选人"}
        assert leak.name not in {item["name"] for item in rd_position_detail["candidates"]}

        db.add(RecruitmentResumeFile(candidate_id=candidates["chunmiao-rd"].id, org_code="chunmiao-rd", original_name="rd.pdf", stored_name="rd.pdf", storage_path="/tmp/rd.pdf", uploaded_by="rd-user"))
        db.add(RecruitmentResumeParseResult(candidate_id=candidates["chunmiao-rd"].id, resume_file_id=1, org_code="chunmiao-rd", raw_text="raw", status="success"))
        db.add(RecruitmentCandidateScore(candidate_id=candidates["chunmiao-rd"].id, parse_result_id=1, org_code="chunmiao-rd", total_score=80))
        db.add(RecruitmentCandidateStatusHistory(candidate_id=candidates["chunmiao-rd"].id, org_code="chunmiao-rd", to_status="pending_interview", changed_by="rd-user"))
        db.add(RecruitmentInterviewQuestion(candidate_id=candidates["chunmiao-rd"].id, position_id=positions["chunmiao-rd"]["id"], org_code="chunmiao-rd", round_name="初试", html_content="<p/>", markdown_content="q", created_by="rd-user"))
        db.commit()

        moved = _service(db, _session("chunmiao-leader", "chunmiao", DATA_SCOPE_ORG_AND_CHILDREN)).update_candidate(
            candidates["chunmiao-rd"].id,
            {"position_id": positions["chunmiao-fin"]["id"]},
            "chunmiao-leader",
        )
        assert moved["org_code"] == "chunmiao-fin"
        with pytest.raises(ValueError):
            rd_user.get_candidate_detail(candidates["chunmiao-rd"].id)

        fin_user = _service(db, _session("fin-user", "chunmiao-fin", DATA_SCOPE_ORG_ONLY))
        assert fin_user.get_candidate_detail(candidates["chunmiao-rd"].id)["candidate"]["org_code"] == "chunmiao-fin"
        assert {item.org_code for item in db.query(RecruitmentResumeFile).filter(RecruitmentResumeFile.candidate_id == candidates["chunmiao-rd"].id)} == {"chunmiao-fin"}
        assert {item.org_code for item in db.query(RecruitmentResumeParseResult).filter(RecruitmentResumeParseResult.candidate_id == candidates["chunmiao-rd"].id)} == {"chunmiao-fin"}
        assert {item.org_code for item in db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.candidate_id == candidates["chunmiao-rd"].id)} == {"chunmiao-fin"}
        assert {item.org_code for item in db.query(RecruitmentCandidateStatusHistory).filter(RecruitmentCandidateStatusHistory.candidate_id == candidates["chunmiao-rd"].id)} == {"chunmiao-fin"}
        assert {item.org_code for item in db.query(RecruitmentInterviewQuestion).filter(RecruitmentInterviewQuestion.candidate_id == candidates["chunmiao-rd"].id)} == {"chunmiao-fin"}
    finally:
        db.close()


def test_recruitment_config_resources_share_down_without_allowing_child_admin_to_rewrite_parent_policy():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)

        manager = _service(db, _session("chunmiao-manager", "chunmiao", DATA_SCOPE_ORG_ONLY))
        skill = manager.create_skill({"name": "春苗面试 Skill", "content": "score rules", "org_code": "chunmiao"}, "chunmiao-manager")
        llm = manager.create_llm_config({"config_key": "cm-default", "org_code": "chunmiao", "task_type": "screening", "provider": "openai-compatible", "model_name": "test-model"}, "chunmiao-manager")
        sender = manager.create_mail_sender({"org_code": "chunmiao", "name": "春苗邮箱", "from_email": "hr@example.com", "smtp_host": "smtp.example.com", "username": "hr"}, "chunmiao-manager")
        recipient = manager.create_mail_recipient({"org_code": "chunmiao", "name": "春苗收件人", "email": "notify@example.com"}, "chunmiao-manager")

        rd_user = _service(db, _session("rd-user", "chunmiao-rd", DATA_SCOPE_ORG_ONLY))
        assert rd_user.list_skills() == []
        assert rd_user.list_llm_configs() == []
        assert rd_user.list_mail_senders() == []
        assert rd_user.list_mail_recipients() == []

        manager.update_skill(skill["id"], {"share_policy": "SHARED_READONLY", "allow_sub_org_use": True}, "chunmiao-manager")
        manager.update_llm_config(llm["id"], {"share_policy": "SHARED_READONLY", "allow_sub_org_use": True}, "chunmiao-manager")
        manager.update_mail_sender(sender["id"], {"share_policy": "SHARED_READONLY", "allow_sub_org_use": True}, "chunmiao-manager")
        manager.update_mail_recipient(recipient["id"], {"share_policy": "SHARED_READONLY", "allow_sub_org_use": True}, "chunmiao-manager")

        assert [item["name"] for item in rd_user.list_skills()] == ["春苗面试 Skill"]
        assert [item["config_key"] for item in rd_user.list_llm_configs()] == ["cm-default"]
        assert [item["name"] for item in rd_user.list_mail_senders()] == ["春苗邮箱"]
        assert [item["name"] for item in rd_user.list_mail_recipients()] == ["春苗收件人"]

        haoshi_user = _service(db, _session("haoshi-user", "haoshi", DATA_SCOPE_ORG_AND_CHILDREN))
        assert haoshi_user.list_skills() == []
        assert haoshi_user.list_llm_configs() == []
        assert haoshi_user.list_mail_senders() == []
        assert haoshi_user.list_mail_recipients() == []

        with pytest.raises(ValueError):
            rd_user.update_skill(skill["id"], {"share_policy": "PUBLIC_IN_GROUP"}, "rd-user")
        with pytest.raises(ValueError):
            rd_user.update_llm_config(llm["id"], {"share_policy": "PUBLIC_IN_GROUP"}, "rd-user")
        with pytest.raises(ValueError):
            rd_user.update_mail_sender(sender["id"], {"share_policy": "PUBLIC_IN_GROUP"}, "rd-user")
        with pytest.raises(ValueError):
            rd_user.update_mail_recipient(recipient["id"], {"share_policy": "PUBLIC_IN_GROUP"}, "rd-user")

        parent_visible = _service(db, _session("chunmiao-leader", "chunmiao", DATA_SCOPE_ORG_AND_CHILDREN))
        assert parent_visible.update_skill(skill["id"], {"allow_copy": True}, "chunmiao-leader")["allow_copy"] is True
    finally:
        db.close()


def test_rbac_super_admin_admin_role_and_limited_grant_boundaries():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)

        create_rbac_user(
            db,
            user_code="super-limited-display",
            display_name="Super Limited Display",
            access_key="super-limited-display-key",
            primary_org_code="group",
            data_scope=DATA_SCOPE_ORG_ONLY,
            role_codes=["operator"],
            granted_permissions=[],
            revoked_permissions=[],
            team_resources_login_key_enabled=False,
            is_active=True,
            is_super_admin=True,
            notes=None,
        )
        create_rbac_user(
            db,
            user_code="admin-role-display",
            display_name="Admin Role Display",
            access_key="admin-role-display-key",
            primary_org_code="group",
            data_scope=DATA_SCOPE_ORG_ONLY,
            role_codes=["admin"],
            granted_permissions=[],
            revoked_permissions=[],
            team_resources_login_key_enabled=False,
            is_active=True,
            is_super_admin=False,
            notes=None,
        )
        create_rbac_user(
            db,
            user_code="regular-display",
            display_name="Regular Display",
            access_key="regular-display-key",
            primary_org_code="group",
            data_scope=DATA_SCOPE_ORG_ONLY,
            role_codes=["operator"],
            granted_permissions=[],
            revoked_permissions=[],
            team_resources_login_key_enabled=False,
            is_active=True,
            is_super_admin=False,
            notes=None,
        )

        super_user = db.query(ScriptHubUser).filter(ScriptHubUser.user_code == "super-limited-display").one()
        admin_role_user = db.query(ScriptHubUser).filter(ScriptHubUser.user_code == "admin-role-display").one()
        regular_user = db.query(ScriptHubUser).filter(ScriptHubUser.user_code == "regular-display").one()

        assert serialize_user_session(db, super_user)["dataScope"] == DATA_SCOPE_ALL
        assert serialize_user_session(db, admin_role_user)["dataScope"] == DATA_SCOPE_ALL
        assert serialize_user_session(db, regular_user)["dataScope"] == DATA_SCOPE_ORG_ONLY

        grantor = _grantor_session(
            "rd-grantor",
            "chunmiao-rd",
            DATA_SCOPE_ORG_ONLY,
            managed_orgs=["chunmiao-rd"],
            max_scope=DATA_SCOPE_ORG_ONLY,
        )

        created, _ = create_rbac_user(
            db,
            actor=grantor,
            user_code="rd-new-hire",
            display_name="RD New Hire",
            access_key="rd-new-hire-key",
            primary_org_code="chunmiao-rd",
            data_scope=DATA_SCOPE_ORG_ONLY,
            role_codes=["operator"],
            granted_permissions=["recruitment-dashboard-view"],
            revoked_permissions=[],
            team_resources_login_key_enabled=False,
            is_active=True,
            is_super_admin=False,
            notes=None,
        )
        assert created["primary_org_code"] == "chunmiao-rd"

        with pytest.raises(ValueError, match="Target organization"):
            create_rbac_user(
                db,
                actor=grantor,
                user_code="fin-new-hire",
                display_name="FIN New Hire",
                access_key="fin-new-hire-key",
                primary_org_code="chunmiao-fin",
                data_scope=DATA_SCOPE_ORG_ONLY,
                role_codes=["operator"],
                granted_permissions=[],
                revoked_permissions=[],
                team_resources_login_key_enabled=False,
                is_active=True,
                is_super_admin=False,
                notes=None,
            )

        with pytest.raises(ValueError, match="Role assignment"):
            create_rbac_user(
                db,
                actor=grantor,
                user_code="rd-admin-hire",
                display_name="RD Admin Hire",
                access_key="rd-admin-hire-key",
                primary_org_code="chunmiao-rd",
                data_scope=DATA_SCOPE_ORG_ONLY,
                role_codes=["admin"],
                granted_permissions=[],
                revoked_permissions=[],
                team_resources_login_key_enabled=False,
                is_active=True,
                is_super_admin=False,
                notes=None,
            )

        with pytest.raises(ValueError, match="Data scope"):
            create_rbac_user(
                db,
                actor=grantor,
                user_code="rd-wide-hire",
                display_name="RD Wide Hire",
                access_key="rd-wide-hire-key",
                primary_org_code="chunmiao-rd",
                data_scope=DATA_SCOPE_ORG_AND_CHILDREN,
                role_codes=["operator"],
                granted_permissions=[],
                revoked_permissions=[],
                team_resources_login_key_enabled=False,
                is_active=True,
                is_super_admin=False,
                notes=None,
            )
    finally:
        db.close()
