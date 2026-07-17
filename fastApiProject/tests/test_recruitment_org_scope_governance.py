import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import migrations.repair_candidate_org_consistency as candidate_org_repair

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
    RecruitmentFollowUp,
    RecruitmentInterviewAvailabilitySlot,
    RecruitmentInterviewQuestion,
    RecruitmentInterviewResult,
    RecruitmentInterviewSchedule,
    RecruitmentLLMConfig,
    RecruitmentMailRecipient,
    RecruitmentMailSenderConfig,
    RecruitmentPosition,
    RecruitmentOffer,
    RecruitmentResumeFile,
    RecruitmentResumeParseResult,
)
from migrations.repair_candidate_org_consistency import (
    audit_candidate_org_consistency,
    main as repair_candidate_org_main,
    repair_candidate_org_consistency,
)
from app.services.recruitment_service import RecruitmentService
from app.services.script_hub_admin_service import create_rbac_user, update_organization
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


class _TrackedSession:
    def __init__(self, session):
        self._session = session
        self.commit_calls = 0
        self.flush_calls = 0
        self.rollback_calls = 0

    def __getattr__(self, name):
        return getattr(self._session, name)

    def commit(self):
        self.commit_calls += 1
        return self._session.commit()

    def flush(self):
        self.flush_calls += 1
        return self._session.flush()

    def rollback(self):
        self.rollback_calls += 1
        return self._session.rollback()


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
    if isinstance(rows, dict):
        rows = rows.get("items", [])
    return {row["title"] if "title" in row else row["name"] for row in rows}


def _orgs(rows):
    if isinstance(rows, dict):
        rows = rows.get("items", [])
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


def test_candidate_and_talent_pool_stats_intersect_requested_org_with_visible_scope():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        _, candidates = _seed_recruitment_dataset(db)

        candidates["chunmiao-rd-other"].status = "unmatched"
        candidates["chunmiao-rd-other"].talent_pool_reason = "unmatched_by_ai"
        candidates["haoshi"].status = "unmatched"
        candidates["haoshi"].talent_pool_reason = "unmatched_by_ai"
        db.commit()

        rd_user = _service(db, _session("rd-user", "chunmiao-rd", DATA_SCOPE_ORG_ONLY))
        candidate_page = rd_user.list_candidates(org_code="group", limit=50)
        assert candidate_page["total"] == 1
        assert _names(candidate_page) == {"研发候选人"}

        candidate_stats = rd_user.get_candidate_stats(org_code="group")
        assert candidate_stats["total"] == candidate_page["total"]
        assert candidate_stats["status_counts"] == {"pending_screening": 1}

        funnel = rd_user.get_recruitment_funnel(org_code="group")
        assert next(item for item in funnel["stages"] if item["key"] == "total")["count"] == candidate_page["total"]

        source_stats = rd_user.get_source_stats(org_code="group")
        assert source_stats["total"] == candidate_page["total"]

        talent_pool_page = rd_user.get_talent_pool_candidates(
            org_code="group",
            paginated=True,
            stat_filter="pending",
            limit=15,
            offset=0,
        )
        assert talent_pool_page["total"] == 1
        assert talent_pool_page["stats"]["total"] == 1
        assert talent_pool_page["stats"]["pending_action"] == 1
        assert _names(talent_pool_page) == {"研发其他候选人"}

        group_all = _service(db, _session("group-admin", "group", DATA_SCOPE_ALL, super_admin=True))
        admin_talent_pool_page = group_all.get_talent_pool_candidates(
            org_code="group",
            paginated=True,
            stat_filter="pending",
            limit=15,
            offset=0,
        )
        assert admin_talent_pool_page["total"] == 2
    finally:
        db.close()


def test_ai_position_match_pool_follows_self_data_scope():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        admin = _session("group-admin", "group", DATA_SCOPE_ALL, super_admin=True)
        own_position = _service(db, admin).create_position(
            {
                "org_code": "group",
                "title": "本人可见岗位",
                "headcount": 1,
                "status": "recruiting",
            },
            "self-user",
        )
        _service(db, admin).create_position(
            {
                "org_code": "group",
                "title": "同组织他人岗位",
                "headcount": 1,
                "status": "recruiting",
            },
            "other-user",
        )
        _service(db, admin).create_position(
            {
                "org_code": "haoshi",
                "title": "其他组织岗位",
                "headcount": 1,
                "status": "recruiting",
            },
            "self-user",
        )
        for status, title in [
            ("draft", "本人草稿岗位"),
            ("paused", "本人暂停岗位"),
            ("closed", "本人关闭岗位"),
        ]:
            _service(db, admin).create_position(
                {
                    "org_code": "group",
                    "title": title,
                    "headcount": 1,
                    "status": status,
                },
                "self-user",
            )
        candidate = _add_candidate(
            db,
            org_code="group",
            position_id=own_position["id"],
            name="智能匹配候选人",
            created_by="self-user",
        )
        _add_candidate(
            db,
            org_code="group",
            position_id=own_position["id"],
            name="同岗位他人候选人",
            created_by="other-user",
        )

        self_scope_service = _service(db, _session("self-user", "group", DATA_SCOPE_SELF))
        self_position_summary = next(position for position in self_scope_service.list_positions() if position["id"] == own_position["id"])
        assert self_position_summary["candidate_count"] == 1
        self_scope_titles = {position.title for position in self_scope_service._get_position_match_pool(org_code="group")}
        assert self_scope_titles == {"本人可见岗位"}
        assert self_scope_service._get_position_match_pool(org_code="group", require_auto_screen_ready=True) == []
        available_positions_text = self_scope_service._build_available_positions_text(candidate)
        assert "本人可见岗位" in available_positions_text
        assert "同组织他人岗位" not in available_positions_text
        assert "其他组织岗位" not in available_positions_text
        assert "本人草稿岗位" not in available_positions_text
        assert "本人暂停岗位" not in available_positions_text
        assert "本人关闭岗位" not in available_positions_text

        org_scope_service = _service(db, _session("self-user", "group", DATA_SCOPE_ORG_ONLY))
        org_position_summary = next(position for position in org_scope_service.list_positions() if position["id"] == own_position["id"])
        assert org_position_summary["candidate_count"] == 2
        org_scope_titles = {position.title for position in org_scope_service._get_position_match_pool(org_code="group")}
        assert org_scope_titles == {"本人可见岗位", "同组织他人岗位"}
    finally:
        db.close()


def test_smart_match_enqueues_visible_positions_without_auto_screen(monkeypatch):
    db = _build_test_db()

    class FakeMatchScheduler:
        running = False

        def __init__(self):
            self.enqueued_batches = []
            self.callbacks_set = False
            self.live_candidate_ids = set()

        def is_candidate_live(self, candidate_id):
            return int(candidate_id) in self.live_candidate_ids

        def clear_cancelled(self, candidate_id):
            return None

        def set_callbacks(self, **kwargs):
            self.callbacks_set = True

        async def enqueue_batch(self, *, user_id, batch_id, candidates, position_summaries, session_token=None, task_type="ai_position_match"):
            self.live_candidate_ids.update(candidate.id for candidate in candidates)
            self.enqueued_batches.append(
                {
                    "user_id": user_id,
                    "batch_id": batch_id,
                    "candidate_ids": [candidate.id for candidate in candidates],
                    "position_summaries": position_summaries,
                }
            )

    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        admin = _session("group-admin", "group", DATA_SCOPE_ALL, super_admin=True)
        own_position = _service(db, admin).create_position(
            {
                "org_code": "group",
                "title": "本人未开自动初筛岗位",
                "headcount": 1,
                "status": "recruiting",
                "auto_screen_on_upload": False,
            },
            "self-user",
        )
        _service(db, admin).create_position(
            {
                "org_code": "group",
                "title": "同组织他人未开自动初筛岗位",
                "headcount": 1,
                "status": "recruiting",
                "auto_screen_on_upload": False,
            },
            "other-user",
        )
        for status, title in [
            ("draft", "本人草稿未开自动初筛岗位"),
            ("paused", "本人暂停未开自动初筛岗位"),
            ("closed", "本人关闭未开自动初筛岗位"),
        ]:
            _service(db, admin).create_position(
                {
                    "org_code": "group",
                    "title": title,
                    "headcount": 1,
                    "status": status,
                    "auto_screen_on_upload": False,
                },
                "self-user",
            )
        candidate = _add_candidate(
            db,
            org_code="group",
            position_id=None,
            name="待智能匹配候选人",
            created_by="self-user",
        )
        candidate.status = "matching"
        candidate.age = 31
        candidate.expected_city = "深圳"
        candidate.source_detail = "人才库列表测试"
        candidate.tags_json = '["测试开发", "CI/CD"]'
        candidate.ai_match_confidence = 87.0
        db.add(candidate)
        db.commit()

        fake_scheduler = FakeMatchScheduler()
        import app.services.match_scheduler as match_scheduler_module

        monkeypatch.setattr(match_scheduler_module, "scheduler", fake_scheduler)

        service = _service(db, _session("self-user", "group", DATA_SCOPE_SELF))
        result = asyncio.run(service.trigger_ai_position_match([candidate.id], "self-user"))

        assert result["total_candidates"] == 1
        assert len(fake_scheduler.enqueued_batches) == 1
        enqueued = fake_scheduler.enqueued_batches[0]
        assert enqueued["candidate_ids"] == [candidate.id]
        assert [item["id"] for item in enqueued["position_summaries"]] == [own_position["id"]]
        assert [item["title"] for item in enqueued["position_summaries"]] == ["本人未开自动初筛岗位"]

        db.refresh(candidate)
        assert candidate.status == "matching"
        talent_pool_page = service.get_talent_pool_candidates(
            org_code="group",
            paginated=True,
            stat_filter="matching",
        )
        assert talent_pool_page["total"] == 1
        assert [item["id"] for item in talent_pool_page["items"]] == [candidate.id]
        talent_pool_item = talent_pool_page["items"][0]
        assert talent_pool_item["candidate_code"] == candidate.candidate_code
        assert talent_pool_item["age"] == 31
        assert talent_pool_item["expected_city"] == "深圳"
        assert talent_pool_item["source_detail"] == "人才库列表测试"
        assert talent_pool_item["tags"] == ["测试开发", "CI/CD"]
        assert talent_pool_item["ai_match_confidence"] == 87.0
        assert talent_pool_item["created_by"] == "self-user"
        assert talent_pool_item["updated_by"] == "self-user"
    finally:
        db.close()


def test_smart_match_uses_visible_positions_and_prefers_primary_org_duplicate_titles(monkeypatch):
    db = _build_test_db()

    class FakeMatchScheduler:
        running = False

        def __init__(self):
            self.enqueued_batches = []
            self.live_candidate_ids = set()

        def is_candidate_live(self, candidate_id):
            return int(candidate_id) in self.live_candidate_ids

        def clear_cancelled(self, candidate_id):
            return None

        def set_callbacks(self, **kwargs):
            return None

        async def enqueue_batch(self, *, user_id, batch_id, candidates, position_summaries, session_token=None, task_type="ai_position_match"):
            self.live_candidate_ids.update(candidate.id for candidate in candidates)
            self.enqueued_batches.append(
                {
                    "candidate_ids": [candidate.id for candidate in candidates],
                    "position_summaries": position_summaries,
                }
            )

    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        admin = _session("group-admin", "group", DATA_SCOPE_ALL, super_admin=True)
        group_product = _service(db, admin).create_position(
            {
                "org_code": "group",
                "title": "产品经理",
                "headcount": 1,
                "status": "recruiting",
            },
            "group-user",
        )
        child_product = _service(db, admin).create_position(
            {
                "org_code": "haoshi",
                "title": "产品经理",
                "headcount": 1,
                "status": "recruiting",
            },
            "haoshi-user",
        )
        child_unique = _service(db, admin).create_position(
            {
                "org_code": "haoshi",
                "title": "门店运营",
                "headcount": 1,
                "status": "recruiting",
            },
            "haoshi-user",
        )
        candidate = _add_candidate(
            db,
            org_code="group",
            position_id=None,
            name="跨组织可见岗位匹配候选人",
            created_by="group-user",
        )
        candidate.status = "matching"
        db.add(candidate)
        db.commit()

        fake_scheduler = FakeMatchScheduler()
        import app.services.match_scheduler as match_scheduler_module

        monkeypatch.setattr(match_scheduler_module, "scheduler", fake_scheduler)

        service = _service(db, _session("group-user", "group", DATA_SCOPE_ORG_AND_CHILDREN))
        result = asyncio.run(service.trigger_ai_position_match([candidate.id], "group-user"))

        assert result["total_candidates"] == 1
        assert len(fake_scheduler.enqueued_batches) == 1
        position_ids = [item["id"] for item in fake_scheduler.enqueued_batches[0]["position_summaries"]]
        assert group_product["id"] in position_ids
        assert child_product["id"] not in position_ids
        assert child_unique["id"] in position_ids
    finally:
        db.close()


def test_position_title_is_unique_only_inside_same_org():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        admin = _session("group-admin", "group", DATA_SCOPE_ALL, super_admin=True)
        service = _service(db, admin)

        group_position = service.create_position(
            {"org_code": "group", "title": "硬件工程师", "headcount": 1},
            "group-admin",
        )
        same_title_other_org = service.create_position(
            {"org_code": "haoshi", "title": "硬件工程师", "headcount": 1},
            "group-admin",
        )
        assert same_title_other_org["org_code"] == "haoshi"

        with pytest.raises(ValueError, match="当前组织下已存在岗位"):
            service.create_position(
                {"org_code": "group", "title": " 硬件工程师 ", "headcount": 1},
                "group-admin",
            )

        another_group_position = service.create_position(
            {"org_code": "group", "title": "软件工程师", "headcount": 1},
            "group-admin",
        )
        updated = service.update_position(group_position["id"], {"title": "硬件工程师"}, "group-admin")
        assert updated["title"] == "硬件工程师"
        with pytest.raises(ValueError, match="当前组织下已存在岗位"):
            service.update_position(another_group_position["id"], {"title": "硬件工程师"}, "group-admin")
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


def test_org_boundary_allows_disabling_managed_child_without_parent_boundary():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        actor = _grantor_session(
            "rd-manager",
            "chunmiao-rd",
            DATA_SCOPE_ORG_ONLY,
            managed_orgs=["chunmiao-rd"],
        )

        updated = update_organization(db, "chunmiao-rd", actor=actor, is_active=False)

        assert updated["org_code"] == "chunmiao-rd"
        assert updated["is_active"] is False
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
        rd_position_candidate = rd_position_detail["candidates"][0]
        assert rd_position_candidate["created_by"] == "rd-user"
        assert "updated_by" in rd_position_candidate

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


def test_candidate_reassignment_moves_terminal_candidate_owned_records_to_target_org():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        positions, candidates = _seed_recruitment_dataset(db)
        candidate = candidates["chunmiao-rd"]
        old_position_id = positions["chunmiao-rd"]["id"]
        scheduled_at = datetime.now().replace(microsecond=0) - timedelta(days=1)

        completed_schedule = RecruitmentInterviewSchedule(
            candidate_id=candidate.id,
            position_id=old_position_id,
            org_code="chunmiao-rd",
            subject="研发岗初试",
            round_name="初试",
            round_index=1,
            interviewer_user_code="rd-interviewer",
            interviewer_name="研发面试官",
            scheduled_at=scheduled_at,
            duration_minutes=60,
            status="completed",
            result_status="passed",
            result_submitted_at=scheduled_at + timedelta(hours=1),
            created_by="rd-user",
            updated_by="rd-user",
        )
        cancelled_schedule = RecruitmentInterviewSchedule(
            candidate_id=candidate.id,
            position_id=old_position_id,
            org_code="chunmiao-rd",
            subject="研发岗复试",
            round_name="复试",
            round_index=2,
            interviewer_user_code="rd-interviewer",
            interviewer_name="研发面试官",
            scheduled_at=scheduled_at + timedelta(days=1),
            duration_minutes=60,
            status="cancelled",
            created_by="rd-user",
            updated_by="rd-user",
        )
        availability = RecruitmentInterviewAvailabilitySlot(
            interviewer_user_code="rd-interviewer",
            interviewer_name="研发面试官",
            org_code="chunmiao-rd",
            start_at=scheduled_at + timedelta(days=2),
            end_at=scheduled_at + timedelta(days=2, hours=1),
            status="available",
            created_by="rd-interviewer",
            updated_by="rd-interviewer",
        )
        db.add_all([completed_schedule, cancelled_schedule, availability])
        db.flush()
        db.add_all([
            RecruitmentInterviewResult(
                candidate_id=candidate.id,
                position_id=old_position_id,
                org_code="chunmiao-rd",
                interviewer_name="研发面试官",
                round_name="初试",
                final_recommendation="passed",
                created_by="rd-interviewer",
            ),
            RecruitmentFollowUp(
                candidate_id=candidate.id,
                org_code="chunmiao-rd",
                content="研发岗面试已通过",
                follow_up_type="note",
                created_by="rd-user",
            ),
            RecruitmentOffer(
                candidate_id=candidate.id,
                position_id=old_position_id,
                org_code="chunmiao-rd",
                offer_title="研发工程师 Offer",
                status="draft",
                created_by="rd-user",
                updated_by="rd-user",
            ),
        ])
        db.commit()

        moved = _service(
            db,
            _session("chunmiao-leader", "chunmiao", DATA_SCOPE_ORG_AND_CHILDREN),
        ).update_candidate(
            candidate.id,
            {"position_id": positions["chunmiao-fin"]["id"]},
            "chunmiao-leader",
        )

        assert moved["org_code"] == "chunmiao-fin"
        assert {
            row.org_code
            for row in db.query(RecruitmentInterviewSchedule).filter_by(candidate_id=candidate.id)
        } == {"chunmiao-fin"}
        assert {
            row.org_code
            for row in db.query(RecruitmentInterviewResult).filter_by(candidate_id=candidate.id)
        } == {"chunmiao-fin"}
        assert {
            row.org_code
            for row in db.query(RecruitmentFollowUp).filter_by(candidate_id=candidate.id)
        } == {"chunmiao-fin"}
        assert {
            row.org_code
            for row in db.query(RecruitmentOffer).filter_by(candidate_id=candidate.id)
        } == {"chunmiao-fin"}
        assert db.get(RecruitmentInterviewAvailabilitySlot, availability.id).org_code == "chunmiao-rd"
        assert db.get(RecruitmentInterviewSchedule, completed_schedule.id).position_id == old_position_id
        assert db.query(RecruitmentInterviewResult).filter_by(candidate_id=candidate.id).one().position_id == old_position_id
        assert db.query(RecruitmentOffer).filter_by(candidate_id=candidate.id).one().position_id == old_position_id

        rd_tasks = _service(
            db,
            _session("rd-manager", "chunmiao-rd", DATA_SCOPE_ORG_ONLY),
        ).list_interview_tasks(status="completed")
        assert rd_tasks["items"] == []
        assert rd_tasks["counts"]["completed"] == 0

        fin_tasks = _service(
            db,
            _session("fin-manager", "chunmiao-fin", DATA_SCOPE_ORG_ONLY),
        ).list_interview_tasks(status="completed")
        assert fin_tasks["total"] == 1
        assert fin_tasks["items"][0]["candidate"]["id"] == candidate.id
        assert fin_tasks["items"][0]["position"] is None
    finally:
        db.close()


def test_candidate_cross_org_reassignment_rejects_active_interviews_without_partial_updates():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        positions, candidates = _seed_recruitment_dataset(db)
        candidate = candidates["chunmiao-rd"]
        start_at = datetime.now().replace(microsecond=0) + timedelta(days=1)
        availability = RecruitmentInterviewAvailabilitySlot(
            interviewer_user_code="rd-interviewer",
            interviewer_name="研发面试官",
            org_code="chunmiao-rd",
            start_at=start_at,
            end_at=start_at + timedelta(hours=1),
            status="booked",
            created_by="rd-interviewer",
            updated_by="rd-interviewer",
        )
        db.add(availability)
        db.flush()
        schedule = RecruitmentInterviewSchedule(
            candidate_id=candidate.id,
            position_id=positions["chunmiao-rd"]["id"],
            org_code="chunmiao-rd",
            subject="研发岗初试",
            round_name="初试",
            round_index=1,
            interviewer_user_code="rd-interviewer",
            interviewer_name="研发面试官",
            scheduled_at=start_at,
            duration_minutes=60,
            availability_slot_id=availability.id,
            status="scheduled",
            created_by="rd-user",
            updated_by="rd-user",
        )
        db.add(schedule)
        db.flush()
        availability.schedule_id = schedule.id
        db.commit()

        service = _service(
            db,
            _session("chunmiao-leader", "chunmiao", DATA_SCOPE_ORG_AND_CHILDREN),
        )
        blocked_position_ids = [
            positions["chunmiao-rd-other"]["id"],
            positions["chunmiao-fin"]["id"],
            None,
        ]
        for blocked_position_id in blocked_position_ids:
            with pytest.raises(ValueError, match="先取消后再调整岗位"):
                service.update_candidate(
                    candidate.id,
                    {"position_id": blocked_position_id},
                    "chunmiao-leader",
                )

        db.expire_all()
        unchanged_candidate = db.get(RecruitmentCandidate, candidate.id)
        unchanged_schedule = db.get(RecruitmentInterviewSchedule, schedule.id)
        unchanged_slot = db.get(RecruitmentInterviewAvailabilitySlot, availability.id)
        assert unchanged_candidate.org_code == "chunmiao-rd"
        assert unchanged_candidate.position_id == positions["chunmiao-rd"]["id"]
        assert unchanged_schedule.org_code == "chunmiao-rd"
        assert unchanged_schedule.status == "scheduled"
        assert unchanged_slot.org_code == "chunmiao-rd"
        assert unchanged_slot.status == "booked"
        assert unchanged_slot.schedule_id == schedule.id

        service.update_interview_schedule(schedule.id, {"status": "cancelled"}, "chunmiao-leader")
        moved = service.update_candidate(
            candidate.id,
            {"position_id": positions["chunmiao-fin"]["id"]},
            "chunmiao-leader",
        )
        db.expire_all()
        assert moved["org_code"] == "chunmiao-fin"
        assert db.get(RecruitmentInterviewSchedule, schedule.id).org_code == "chunmiao-fin"
        assert db.get(RecruitmentInterviewSchedule, schedule.id).status == "cancelled"
        assert db.get(RecruitmentInterviewAvailabilitySlot, availability.id).org_code == "chunmiao-rd"
        assert db.get(RecruitmentInterviewAvailabilitySlot, availability.id).status == "available"
        assert db.get(RecruitmentInterviewAvailabilitySlot, availability.id).schedule_id is None
    finally:
        db.close()


def test_self_scope_interviewer_can_view_assigned_schedule_created_by_hr():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        positions, candidates = _seed_recruitment_dataset(db)
        candidate = candidates["chunmiao-fin"]
        schedule = RecruitmentInterviewSchedule(
            candidate_id=candidate.id,
            position_id=positions["chunmiao-fin"]["id"],
            org_code="chunmiao-fin",
            subject="财务岗初试",
            round_name="初试",
            round_index=1,
            interviewer_user_code="fin-interviewer",
            interviewer_name="财务面试官",
            scheduled_at=datetime.now().replace(microsecond=0) + timedelta(days=1),
            duration_minutes=60,
            status="scheduled",
            created_by="fin-user",
            updated_by="fin-user",
        )
        db.add(schedule)
        db.commit()

        interviewer = _service(
            db,
            _session("fin-interviewer", "chunmiao-fin", DATA_SCOPE_SELF),
        )
        rows = interviewer.list_interview_schedules(
            candidate.id,
            actor_id="fin-interviewer",
            schedule_id=schedule.id,
        )

        assert [row["id"] for row in rows] == [schedule.id]
    finally:
        db.close()


def test_active_interview_writes_reject_position_mismatch_but_allow_cancellation():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        positions, candidates = _seed_recruitment_dataset(db)
        candidate = candidates["chunmiao-fin"]
        schedule = RecruitmentInterviewSchedule(
            candidate_id=candidate.id,
            position_id=positions["chunmiao-rd"]["id"],
            org_code="chunmiao-rd",
            subject="历史错绑面试",
            round_name="初试",
            round_index=1,
            interviewer_user_code="fin-interviewer",
            interviewer_name="财务面试官",
            scheduled_at=datetime.now().replace(microsecond=0) + timedelta(days=1),
            duration_minutes=60,
            status="scheduled",
            created_by="rd-user",
            updated_by="rd-user",
        )
        db.add(schedule)
        db.commit()

        fin_manager = _service(
            db,
            _session("fin-manager", "chunmiao-fin", DATA_SCOPE_ORG_ONLY),
        )
        with pytest.raises(ValueError, match="岗位与候选人当前岗位不一致"):
            fin_manager.create_interview_schedule(
                {
                    "candidate_id": candidate.id,
                    "position_id": positions["chunmiao-rd"]["id"],
                },
                "fin-manager",
            )
        with pytest.raises(ValueError, match="岗位与候选人当前岗位不一致"):
            fin_manager.update_interview_schedule(
                schedule.id,
                {"notes": "不应继续处理错绑任务"},
                "fin-manager",
            )
        db.rollback()

        interviewer = _service(
            db,
            _session("fin-interviewer", "chunmiao-fin", DATA_SCOPE_SELF),
        )
        with pytest.raises(ValueError, match="岗位与候选人当前岗位不一致"):
            interviewer.submit_interview_schedule_result(
                schedule.id,
                {"result_status": "passed"},
                "fin-interviewer",
            )
        db.rollback()

        cancelled = fin_manager.update_interview_schedule(
            schedule.id,
            {"status": "cancelled"},
            "fin-manager",
        )
        assert cancelled["status"] == "cancelled"
        assert cancelled["org_code"] == "chunmiao-fin"
    finally:
        db.close()


def test_submit_interview_result_refreshes_schedule_after_candidate_lock(monkeypatch):
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        positions, candidates = _seed_recruitment_dataset(db)
        candidate = candidates["chunmiao-fin"]
        schedule = RecruitmentInterviewSchedule(
            candidate_id=candidate.id,
            position_id=positions["chunmiao-fin"]["id"],
            org_code="chunmiao-fin",
            subject="并发取消面试",
            round_name="初试",
            round_index=1,
            interviewer_user_code="fin-interviewer",
            interviewer_name="财务面试官",
            scheduled_at=datetime.now().replace(microsecond=0) + timedelta(days=1),
            duration_minutes=60,
            status="scheduled",
            created_by="fin-user",
            updated_by="fin-user",
        )
        db.add(schedule)
        db.commit()

        interviewer = _service(
            db,
            _session("fin-interviewer", "chunmiao-fin", DATA_SCOPE_SELF),
        )
        original_get_candidate = interviewer._get_candidate

        def cancel_before_candidate_lock(candidate_id, **kwargs):
            db.query(RecruitmentInterviewSchedule).filter(
                RecruitmentInterviewSchedule.id == schedule.id,
            ).update(
                {RecruitmentInterviewSchedule.status: "cancelled"},
                synchronize_session=False,
            )
            return original_get_candidate(candidate_id, **kwargs)

        monkeypatch.setattr(interviewer, "_get_candidate", cancel_before_candidate_lock)

        with pytest.raises(ValueError, match="已结束或已取消"):
            interviewer.submit_interview_schedule_result(
                schedule.id,
                {"result_status": "passed"},
                "fin-interviewer",
            )

        assert schedule.status == "cancelled"
        assert db.query(RecruitmentInterviewResult).filter_by(candidate_id=candidate.id).count() == 0
    finally:
        db.rollback()
        db.close()


def test_interview_queue_and_actions_use_candidate_scope_when_schedule_org_is_stale():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        positions, candidates = _seed_recruitment_dataset(db)
        candidate = candidates["chunmiao-fin"]
        now = datetime.now().replace(microsecond=0)
        active_schedule = RecruitmentInterviewSchedule(
            candidate_id=candidate.id,
            position_id=positions["chunmiao-rd"]["id"],
            org_code="chunmiao-rd",
            subject="脏数据面试",
            round_name="初试",
            round_index=1,
            interviewer_user_code="rd-interviewer",
            interviewer_name="研发面试官",
            scheduled_at=now,
            duration_minutes=60,
            status="scheduled",
            created_by="rd-manager",
            updated_by="rd-manager",
        )
        completed_schedule = RecruitmentInterviewSchedule(
            candidate_id=candidate.id,
            position_id=positions["chunmiao-rd"]["id"],
            org_code="chunmiao-rd",
            subject="脏数据历史面试",
            round_name="初试",
            round_index=1,
            interviewer_user_code="rd-interviewer",
            interviewer_name="研发面试官",
            scheduled_at=now - timedelta(days=1),
            duration_minutes=60,
            status="completed",
            result_status="passed",
            created_by="rd-manager",
            updated_by="rd-manager",
        )
        stale_follow_up = RecruitmentFollowUp(
            candidate_id=candidate.id,
            org_code="chunmiao-rd",
            content="旧组织跟进",
            follow_up_type="note",
            created_by="rd-manager",
        )
        stale_offer = RecruitmentOffer(
            candidate_id=candidate.id,
            position_id=positions["chunmiao-rd"]["id"],
            org_code="chunmiao-rd",
            offer_title="旧组织 Offer",
            status="draft",
            created_by="rd-manager",
            updated_by="rd-manager",
        )
        db.add_all([active_schedule, completed_schedule, stale_follow_up, stale_offer])
        db.commit()

        rd_manager = _service(db, _session("rd-manager", "chunmiao-rd", DATA_SCOPE_ORG_ONLY))
        assert rd_manager.list_interview_tasks(status="todo")["total"] == 0
        assert rd_manager.list_interview_tasks(status="today")["counts"]["today"] == 0
        assert rd_manager.list_interview_tasks(status="completed")["counts"]["completed"] == 0
        assert rd_manager.list_my_interview_tasks("rd-interviewer", status="todo")["total"] == 0
        with pytest.raises(ValueError, match="无权访问"):
            rd_manager.update_interview_schedule(active_schedule.id, {"notes": "越界修改"}, "rd-manager")
        with pytest.raises(ValueError, match="无权访问"):
            rd_manager.submit_interview_schedule_result(
                active_schedule.id,
                {"result_status": "passed", "result_comment": "越界提交"},
                "rd-interviewer",
            )
        with pytest.raises(ValueError, match="无权访问"):
            rd_manager.delete_follow_up(stale_follow_up.id, "rd-manager")
        with pytest.raises(ValueError, match="无权访问"):
            rd_manager.update_offer(stale_offer.id, {"notes": "越界修改"}, "rd-manager")

        fin_manager = _service(db, _session("fin-manager", "chunmiao-fin", DATA_SCOPE_ORG_ONLY))
        fin_todo = fin_manager.list_interview_tasks(status="todo")
        assert fin_todo["total"] == 1
        assert fin_todo["counts"]["today"] == 1
        assert fin_todo["items"][0]["candidate"]["id"] == candidate.id
        assert fin_todo["items"][0]["position"] is None
        assert fin_manager.list_interview_tasks(status="completed")["counts"]["completed"] == 1
        assert fin_manager.update_offer(stale_offer.id, {"notes": "财务组织接管"}, "fin-manager")["org_code"] == "chunmiao-fin"
        fin_manager.delete_follow_up(stale_follow_up.id, "fin-manager")
        assert db.get(RecruitmentFollowUp, stale_follow_up.id) is None
    finally:
        db.close()


def test_candidate_org_repair_is_idempotent_and_preserves_orphans_and_history():
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        _seed_catalog(db)
        positions, candidates = _seed_recruitment_dataset(db)
        candidate = candidates["chunmiao-fin"]
        now = datetime.now().replace(microsecond=0)
        schedule = RecruitmentInterviewSchedule(
            candidate_id=candidate.id,
            position_id=positions["chunmiao-rd"]["id"],
            org_code="chunmiao-rd",
            subject="待修复面试",
            round_name="初试",
            round_index=1,
            interviewer_user_code="rd-interviewer",
            scheduled_at=now,
            duration_minutes=60,
            status="completed",
            created_by="rd-manager",
            updated_by="rd-manager",
        )
        orphan_follow_up = RecruitmentFollowUp(
            candidate_id=999999,
            org_code="chunmiao-rd",
            content="孤儿记录",
            follow_up_type="note",
            created_by="rd-manager",
        )
        interview_result = RecruitmentInterviewResult(
            candidate_id=candidate.id,
            position_id=positions["chunmiao-rd"]["id"],
            org_code="chunmiao-rd",
            interviewer_name="研发面试官",
            round_name="初试",
            final_recommendation="passed",
            created_by="rd-interviewer",
        )
        offer = RecruitmentOffer(
            candidate_id=candidate.id,
            position_id=positions["chunmiao-rd"]["id"],
            org_code="chunmiao-rd",
            offer_title="待修复 Offer",
            status="draft",
            created_by="rd-manager",
            updated_by="rd-manager",
        )
        db.add_all([
            schedule,
            interview_result,
            RecruitmentFollowUp(
                candidate_id=candidate.id,
                org_code="chunmiao-rd",
                content="待修复跟进",
                follow_up_type="note",
                created_by="rd-manager",
            ),
            offer,
            orphan_follow_up,
        ])
        db.commit()

        before = audit_candidate_org_consistency(db)
        assert before["tables"]["interview_schedules"]["mismatches"] == 1
        assert before["tables"]["interview_results"]["mismatches"] == 1
        assert before["tables"]["follow_ups"] == {"mismatches": 1, "orphans": 1}
        assert before["tables"]["offers"]["mismatches"] == 1
        assert before["active_schedule_position_mismatches"] == 0
        assert before["invalid_candidate_org_codes"] == 0

        assert repair_candidate_org_consistency(db) == {
            "interview_schedules": 1,
            "interview_results": 1,
            "follow_ups": 1,
            "offers": 1,
        }
        db.commit()
        after = audit_candidate_org_consistency(db)
        assert all(item["mismatches"] == 0 for item in after["tables"].values())
        assert after["tables"]["follow_ups"]["orphans"] == 1
        assert after["active_schedule_position_mismatches"] == 0
        assert db.get(RecruitmentInterviewSchedule, schedule.id).position_id == positions["chunmiao-rd"]["id"]
        assert db.get(RecruitmentInterviewResult, interview_result.id).position_id == positions["chunmiao-rd"]["id"]
        assert db.get(RecruitmentOffer, offer.id).position_id == positions["chunmiao-rd"]["id"]
        assert db.get(RecruitmentFollowUp, orphan_follow_up.id).org_code == "chunmiao-rd"
        assert repair_candidate_org_consistency(db) == {
            "interview_schedules": 0,
            "interview_results": 0,
            "follow_ups": 0,
            "offers": 0,
        }
    finally:
        db.close()


def test_candidate_org_repair_uses_exact_python_comparison_for_case_differences():
    db = _build_test_db()
    try:
        candidate = _add_candidate(
            db,
            org_code="Case-Org",
            position_id=101,
            name="大小写候选人",
            created_by="tester",
        )
        follow_up = RecruitmentFollowUp(
            candidate_id=candidate.id,
            org_code="case-org",
            content="大小写不一致",
            follow_up_type="note",
            created_by="tester",
        )
        db.add(follow_up)
        db.commit()

        before = audit_candidate_org_consistency(db)
        assert before["invalid_candidate_org_codes"] == 0
        assert before["tables"]["follow_ups"]["mismatches"] == 1

        assert repair_candidate_org_consistency(db)["follow_ups"] == 1
        db.flush()
        assert follow_up.org_code == "Case-Org"
        assert audit_candidate_org_consistency(db)["tables"]["follow_ups"]["mismatches"] == 0
        assert repair_candidate_org_consistency(db)["follow_ups"] == 0
    finally:
        db.rollback()
        db.close()


def test_candidate_org_repair_apply_rejects_blank_candidate_org_code():
    db = _build_test_db()
    engine = db.get_bind()
    candidate = _add_candidate(
        db,
        org_code="   ",
        position_id=101,
        name="空组织候选人",
        created_by="tester",
    )
    follow_up = RecruitmentFollowUp(
        candidate_id=candidate.id,
        org_code="chunmiao-rd",
        content="不应被修复",
        follow_up_type="note",
        created_by="tester",
    )
    db.add(follow_up)
    db.commit()
    follow_up_id = follow_up.id
    tracked = _TrackedSession(db)

    report = audit_candidate_org_consistency(db)
    assert report["invalid_candidate_org_codes"] == 1
    with pytest.raises(RuntimeError, match="blank or non-canonical org_code"):
        repair_candidate_org_main(
            argv=["--apply"],
            session_factory=lambda: tracked,
        )

    assert tracked.commit_calls == 0
    assert tracked.flush_calls == 0
    assert tracked.rollback_calls == 1
    verify_db = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    try:
        assert verify_db.get(RecruitmentFollowUp, follow_up_id).org_code == "chunmiao-rd"
    finally:
        verify_db.close()


def test_candidate_org_audit_counts_null_safe_active_position_mismatches():
    db = _build_test_db()
    engine = db.get_bind()
    candidate_with_position = _add_candidate(
        db,
        org_code="chunmiao-rd",
        position_id=101,
        name="候选人岗位非空",
        created_by="tester",
    )
    candidate_without_position = _add_candidate(
        db,
        org_code="chunmiao-rd",
        position_id=None,
        name="候选人岗位为空",
        created_by="tester",
    )
    schedule_without_position = RecruitmentInterviewSchedule(
        candidate_id=candidate_with_position.id,
        position_id=None,
        org_code="chunmiao-rd",
        round_name="初试",
        status="scheduled",
        created_by="tester",
        updated_by="tester",
    )
    schedule_with_position = RecruitmentInterviewSchedule(
        candidate_id=candidate_without_position.id,
        position_id=202,
        org_code="chunmiao-rd",
        round_name="初试",
        status="confirmed",
        created_by="tester",
        updated_by="tester",
    )
    db.add_all([schedule_without_position, schedule_with_position])
    db.commit()
    schedule_without_position_id = schedule_without_position.id
    schedule_with_position_id = schedule_with_position.id

    report = audit_candidate_org_consistency(db)
    assert report["active_schedule_position_mismatches"] == 2
    with pytest.raises(RuntimeError, match="active interview schedules"):
        repair_candidate_org_consistency(db)

    tracked = _TrackedSession(db)
    with pytest.raises(RuntimeError, match="active interview schedules"):
        repair_candidate_org_main(
            argv=["--apply"],
            session_factory=lambda: tracked,
        )

    assert tracked.commit_calls == 0
    assert tracked.flush_calls == 0
    assert tracked.rollback_calls == 1
    verify_db = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    try:
        assert verify_db.get(RecruitmentInterviewSchedule, schedule_without_position_id).position_id is None
        assert verify_db.get(RecruitmentInterviewSchedule, schedule_with_position_id).position_id == 202
    finally:
        verify_db.close()


def test_candidate_org_repair_main_dry_run_does_not_flush_or_commit():
    db = _build_test_db()
    engine = db.get_bind()
    candidate = _add_candidate(
        db,
        org_code="chunmiao-fin",
        position_id=101,
        name="Dry Run 候选人",
        created_by="tester",
    )
    follow_up = RecruitmentFollowUp(
        candidate_id=candidate.id,
        org_code="chunmiao-rd",
        content="Dry run 保持不变",
        follow_up_type="note",
        created_by="tester",
    )
    db.add(follow_up)
    db.commit()
    follow_up_id = follow_up.id
    tracked = _TrackedSession(db)

    repair_candidate_org_main(argv=[], session_factory=lambda: tracked)

    assert tracked.commit_calls == 0
    assert tracked.flush_calls == 0
    assert tracked.rollback_calls == 0
    verify_db = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    try:
        assert verify_db.get(RecruitmentFollowUp, follow_up_id).org_code == "chunmiao-rd"
    finally:
        verify_db.close()


def test_candidate_org_repair_main_rolls_back_when_postcheck_fails(monkeypatch):
    db = _build_test_db()
    engine = db.get_bind()
    candidate = _add_candidate(
        db,
        org_code="chunmiao-fin",
        position_id=101,
        name="回滚候选人",
        created_by="tester",
    )
    follow_up = RecruitmentFollowUp(
        candidate_id=candidate.id,
        org_code="chunmiao-rd",
        content="失败后回滚",
        follow_up_type="note",
        created_by="tester",
    )
    db.add(follow_up)
    db.commit()
    follow_up_id = follow_up.id
    tracked = _TrackedSession(db)
    real_audit = candidate_org_repair.audit_candidate_org_consistency
    audit_call_count = 0

    def fail_postcheck(session):
        nonlocal audit_call_count
        audit_call_count += 1
        report = real_audit(session)
        if audit_call_count == 2:
            report["tables"]["follow_ups"]["mismatches"] = 1
        return report

    monkeypatch.setattr(candidate_org_repair, "audit_candidate_org_consistency", fail_postcheck)

    with pytest.raises(RuntimeError, match="repair incomplete"):
        candidate_org_repair.main(
            argv=["--apply"],
            session_factory=lambda: tracked,
        )

    assert tracked.flush_calls == 1
    assert tracked.commit_calls == 0
    assert tracked.rollback_calls == 1
    verify_db = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    try:
        assert verify_db.get(RecruitmentFollowUp, follow_up_id).org_code == "chunmiao-rd"
    finally:
        verify_db.close()


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


def test_export_candidates_blocks_cross_org_ids(monkeypatch):
    """P0-2：受限组织用户导出跨组织候选人 ID 时必须被拒绝，不得导出他人 PII。"""
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        own = _add_candidate(
            db, org_code="chunmiao-rd", position_id=None, name="本部门候选人", created_by="rd-user"
        )
        cross = _add_candidate(
            db, org_code="haoshi", position_id=None, name="他组织候选人", created_by="haoshi-hr"
        )
        rd_user = _service(db, _session("rd-user", "chunmiao-rd", DATA_SCOPE_ORG_ONLY))

        # 仅导出本组织候选人：允许
        zip_path = rd_user.export_candidates([own.id], include_resumes=False)
        assert zip_path

        # 携带跨组织候选人 ID：整体拒绝，不静默跳过
        with pytest.raises(ValueError) as exc_info:
            rd_user.export_candidates([own.id, cross.id], include_resumes=False)
        assert "可见范围" in str(exc_info.value)

        # 仅跨组织候选人 ID：拒绝
        with pytest.raises(ValueError):
            rd_user.export_candidates([cross.id], include_resumes=False)
    finally:
        db.close()


def test_batch_move_to_talent_pool_blocks_cross_org_ids():
    """P0-2：批量移入人才库携带跨组织候选人 ID 时整体拒绝。"""
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        own = _add_candidate(
            db, org_code="chunmiao-rd", position_id=None, name="本部门候选人", created_by="rd-user"
        )
        cross = _add_candidate(
            db, org_code="haoshi", position_id=None, name="他组织候选人", created_by="haoshi-hr"
        )
        rd_user = _service(db, _session("rd-user", "chunmiao-rd", DATA_SCOPE_ORG_ONLY))

        result = rd_user.batch_move_to_talent_pool([own.id], "rd-user")
        assert result["moved_count"] == 1

        with pytest.raises(ValueError) as exc_info:
            rd_user.batch_move_to_talent_pool([own.id, cross.id], "rd-user")
        assert "可见范围" in str(exc_info.value)
    finally:
        db.close()


def test_get_screening_batch_status_scopes_by_candidate_org():
    """P0-3：批次状态查询必须按候选人组织可见范围过滤，跨组织 batch_id 读不到任务。"""
    from app.recruitment_models import RecruitmentAITaskLog
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        own = _add_candidate(
            db, org_code="chunmiao-rd", position_id=None, name="本部门候选人", created_by="rd-user"
        )
        cross = _add_candidate(
            db, org_code="haoshi", position_id=None, name="他组织候选人", created_by="haoshi-hr"
        )
        batch_id = "batch-xorg-1"
        for cand, org in [(own, "chunmiao-rd"), (cross, "haoshi")]:
            db.add(RecruitmentAITaskLog(
                task_type="screening_flow",
                org_code=org,
                batch_id=batch_id,
                status="success",
                related_candidate_id=cand.id,
                created_by="rd-user" if org == "chunmiao-rd" else "haoshi-hr",
                output_summary="done",
            ))
        db.commit()

        rd_user = _service(db, _session("rd-user", "chunmiao-rd", DATA_SCOPE_ORG_ONLY))
        status = rd_user.get_screening_batch_status(batch_id)
        # 只应看到本组织的 1 条任务，跨组织候选人任务被过滤
        assert status["total"] == 1
        assert [row["candidate_id"] for row in status["per_candidate_status"]] == [own.id]

        # 全组织管理员能看到全部 2 条
        admin = _service(db, _session("group-admin", "group", DATA_SCOPE_ALL, super_admin=True))
        admin_status = admin.get_screening_batch_status(batch_id)
        assert admin_status["total"] == 2
    finally:
        db.close()


def test_save_score_result_skips_authoritative_promotion_when_resume_changed_midrun():
    """P1 generation/CAS：评分晋级前若发现候选人 latest_resume_file_id 已变（运行期换简历），
    结果只留档、不晋级为权威（不写 latest_score_id、不推进状态、不改 ai_recommended_status）。"""
    from app.recruitment_models import RecruitmentResumeFile, RecruitmentResumeParseResult
    from app.services.recruitment_service_impl import RAW_SCREENING_SCORE_STORAGE_FORMAT
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        candidate = _add_candidate(
            db, org_code="chunmiao-rd", position_id=None, name="CAS候选人", created_by="rd-user"
        )
        old_resume = RecruitmentResumeFile(candidate_id=candidate.id, org_code="chunmiao-rd", original_name="old.pdf", stored_name="old.pdf", storage_path="/tmp/old.pdf", parse_status="success", uploaded_by="rd-user")
        db.add(old_resume)
        db.flush()
        parse = RecruitmentResumeParseResult(candidate_id=candidate.id, resume_file_id=old_resume.id, org_code="chunmiao-rd", raw_text="old raw", status="success")
        db.add(parse)
        db.flush()
        # 运行期间：候选人换了新简历 → latest_resume_file_id 指向新文件
        new_resume = RecruitmentResumeFile(candidate_id=candidate.id, org_code="chunmiao-rd", original_name="new.pdf", stored_name="new.pdf", storage_path="/tmp/new.pdf", parse_status="pending", uploaded_by="rd-user")
        db.add(new_resume)
        db.flush()
        candidate.latest_resume_file_id = new_resume.id
        candidate.status = "pending_screening"
        candidate.ai_recommended_status = None
        candidate.latest_score_id = None
        db.commit()

        service = RecruitmentService(db)
        content = {
            "_storage_format": RAW_SCREENING_SCORE_STORAGE_FORMAT,
            "score": {
                "total_score": 8.0,
                "match_percent": 80,
                "advantages": ["强"],
                "concerns": [],
                "recommendation": "建议面试",
                "suggested_status": "screening_passed",
                "dimensions": [],
            },
        }
        score_row = service._save_score_result(candidate, parse, "rd-user", content, allow_status_advance=True)
        db.commit()
        db.refresh(candidate)

        # 评分行留档，但候选人权威状态未被过期结果覆盖
        assert getattr(score_row, "_superseded_reason", None) == "resume_changed"
        assert candidate.latest_score_id is None
        assert candidate.ai_recommended_status is None
        assert candidate.status == "pending_screening"

        # 对照：简历未变时正常晋级
        candidate.latest_resume_file_id = old_resume.id
        db.commit()
        score_row2 = service._save_score_result(candidate, parse, "rd-user", content, allow_status_advance=True)
        db.commit()
        db.refresh(candidate)
        assert getattr(score_row2, "_superseded_reason", None) is None
        assert candidate.latest_score_id == score_row2.id
        assert candidate.ai_recommended_status == "screening_passed"
    finally:
        db.close()


def test_screening_generation_out_of_order_only_latest_run_promotes():
    """Commit 2 generation/CAS：后发起的初筛 bump generation 抢占 active run；
    先前 run（乱序完成）晋级时被判 generation_changed，只留档不写权威；最新 run 正常晋级。"""
    from app.recruitment_models import RecruitmentResumeFile, RecruitmentResumeParseResult, RecruitmentCandidateScreeningRun
    from app.services.recruitment_service_impl import RAW_SCREENING_SCORE_STORAGE_FORMAT
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        position = _create_position(db, _session("group-admin", "group", DATA_SCOPE_ALL, super_admin=True), org_code="chunmiao-rd", title="测试岗", actor_id="rd-user")
        candidate = _add_candidate(db, org_code="chunmiao-rd", position_id=position["id"], name="代次候选人", created_by="rd-user")
        resume = RecruitmentResumeFile(candidate_id=candidate.id, org_code="chunmiao-rd", original_name="r.pdf", stored_name="r.pdf", storage_path="/tmp/r.pdf", parse_status="success", uploaded_by="rd-user")
        db.add(resume)
        db.flush()
        candidate.latest_resume_file_id = resume.id
        candidate.status = "pending_screening"
        parse_row = RecruitmentResumeParseResult(candidate_id=candidate.id, resume_file_id=resume.id, org_code="chunmiao-rd", raw_text="raw", status="success")
        db.add(parse_row)
        db.flush()
        db.commit()

        service = RecruitmentService(db)
        req_meta = {"request_hash": "h", "position_id": position["id"]}
        run1 = service._open_screening_run(candidate=candidate, root_task_id=101, screening_run_key="k1", request_meta=req_meta, actor_id="rd-user")
        db.commit()
        run2 = service._open_screening_run(candidate=candidate, root_task_id=102, screening_run_key="k2", request_meta=req_meta, actor_id="rd-user")
        db.commit()
        db.refresh(candidate)
        assert candidate.screening_generation == 2
        assert candidate.active_screening_run_id == run2.id
        assert run1.generation == 1 and run2.generation == 2

        content = {
            "_storage_format": RAW_SCREENING_SCORE_STORAGE_FORMAT,
            "score": {"total_score": 8.0, "match_percent": 80, "advantages": ["强"], "concerns": [], "recommendation": "建议面试", "suggested_status": "screening_passed", "dimensions": []},
        }

        # T1（旧 run）乱序完成 → 被判 generation_changed，不晋级
        service._current_screening_run_id = run1.id
        score_row_1 = service._save_score_result(candidate, parse_row, "rd-user", content, allow_status_advance=True)
        db.commit()
        db.refresh(candidate)
        assert getattr(score_row_1, "_superseded_reason", None) == "generation_changed"
        assert candidate.latest_score_id is None
        db.refresh(run1)
        assert run1.status == "superseded" and run1.superseded_reason == "generation_changed"

        # T2（最新 run）正常晋级
        service._current_screening_run_id = run2.id
        score_row_2 = service._save_score_result(candidate, parse_row, "rd-user", content, allow_status_advance=True)
        db.commit()
        db.refresh(candidate)
        assert getattr(score_row_2, "_superseded_reason", None) is None
        assert candidate.latest_score_id == score_row_2.id
        assert candidate.latest_screening_run_id == run2.id
        assert score_row_2.screening_run_id == run2.id
        db.refresh(run2)
        assert run2.status == "promoted"
    finally:
        db.close()


def test_screening_run_unique_generation_and_cancel_marks_run():
    """Commit 2：UNIQUE(candidate_id, generation) 生效；取消 root 任务在其 run 上打取消标记。"""
    from sqlalchemy.exc import IntegrityError
    from app.recruitment_models import RecruitmentCandidateScreeningRun, RecruitmentAITaskLog
    db = _build_test_db()
    try:
        _seed_org_tree(db)
        candidate = _add_candidate(db, org_code="chunmiao-rd", position_id=None, name="取消候选人", created_by="rd-user")
        db.commit()
        service = RecruitmentService(db)
        run1 = service._open_screening_run(candidate=candidate, root_task_id=201, screening_run_key="k1", request_meta={}, actor_id="rd-user")
        db.commit()

        # 同 (candidate, generation) 再插一行应违反唯一约束
        dup = RecruitmentCandidateScreeningRun(candidate_id=candidate.id, org_code="chunmiao-rd", generation=1, status="queued")
        db.add(dup)
        try:
            db.commit()
            assert False, "expected UNIQUE(candidate_id, generation) violation"
        except IntegrityError:
            db.rollback()

        # 取消 root 任务 → run 打取消标记
        task = RecruitmentAITaskLog(task_type="screening_flow", org_code="chunmiao-rd", status="running", related_candidate_id=candidate.id, created_by="rd-user")
        db.add(task)
        db.flush()
        run_for_task = service._open_screening_run(candidate=candidate, root_task_id=task.id, screening_run_key="k2", request_meta={}, actor_id="rd-user")
        db.commit()
        service.cancel_ai_task(task.id, "rd-user")
        db.refresh(run_for_task)
        assert run_for_task.status == "cancelled"
        assert run_for_task.cancel_requested_at is not None
        assert run_for_task.cancel_requested_by == "rd-user"
    finally:
        db.close()
