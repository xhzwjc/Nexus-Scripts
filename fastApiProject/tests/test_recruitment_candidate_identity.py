from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.recruitment_models import RecruitmentCandidate
from app.services.recruitment_service_impl import RecruitmentService
from app.services.recruitment_utils import (
    extract_explicit_candidate_name_from_resume,
    extract_high_confidence_candidate_name_from_filename,
    normalize_resume_fallback_name,
    resolve_high_confidence_candidate_name,
)


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = testing_session_local()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def test_filename_identity_accepts_only_unambiguous_person_suffix():
    assert extract_high_confidence_candidate_name_from_filename(
        "【硬件测试工程师_北京 10-15K】冯立娜 3年.pdf"
    ) == "冯立娜"
    assert extract_high_confidence_candidate_name_from_filename(
        "【智能家居技术工程师（兼职_全国各大城市）_西安 500-10000元_月】张柯 10年以上18735365153.pdf"
    ) == "张柯"
    assert extract_high_confidence_candidate_name_from_filename("张三.pdf") == "张三"
    for file_name in (
        "【智能家居技术工程师（兼职 全国各大城市）】.pdf",
        "【岗位】济南.pdf",
        "【岗位】测试工程师.pdf",
        "【岗位】张三简历.pdf",
        "个人简历.pdf",
        "我的简历.pdf",
        "软件研发.pdf",
        "数据分析.pdf",
        "Product Manager.pdf",
        "Software Engineer.pdf",
        "东莞.pdf",
        "佛山.pdf",
        "无锡.pdf",
        "温州.pdf",
        "广东.pdf",
    ):
        assert extract_high_confidence_candidate_name_from_filename(file_name) == ""


def test_resume_identity_does_not_swallow_adjacent_fields():
    raw_text = "个人简历\n姓名：王欢 性别：女 电话：13800138000\n工作经历"

    assert extract_explicit_candidate_name_from_resume(raw_text) == "王欢"
    assert resolve_high_confidence_candidate_name(raw_text=raw_text, proposed_name="测试工程师") == {
        "value": "王欢",
        "source": "resume_text_explicit",
        "confidence": 0.99,
    }
    assert extract_explicit_candidate_name_from_resume("Name: Software Engineer\nPhone: 13800138000") == ""
    assert resolve_high_confidence_candidate_name(
        raw_text="程序员\n负责后端系统开发\n手机：13800138000",
        proposed_name="程序员",
    ) is None
    assert resolve_high_confidence_candidate_name(
        raw_text="王欢\n手机：13800138000\n邮箱：wanghuan@example.com",
        proposed_name="王欢",
    ) == {
        "value": "王欢",
        "source": "resume_parsed",
        "confidence": 0.96,
    }


def test_single_latin_name_requires_resume_header_evidence():
    file_name = "【测试工程师_南昌 8-12K】Alice 10年.pdf"
    collapsed_header = "Alice 女 | 27岁联系方式电话：13072152762 求职信息\n工作时长：7年"

    assert extract_high_confidence_candidate_name_from_filename(file_name) == ""
    assert resolve_high_confidence_candidate_name(
        file_name=file_name,
        raw_text=collapsed_header,
    ) == {
        "value": "Alice",
        "source": "resume_parsed",
        "confidence": 0.96,
    }
    assert resolve_high_confidence_candidate_name(
        raw_text=collapsed_header,
        proposed_name="Alice",
    ) == {
        "value": "Alice",
        "source": "resume_parsed",
        "confidence": 0.96,
    }

    assert resolve_high_confidence_candidate_name(
        file_name=file_name,
        raw_text="工作经历\nAlice 负责自动化测试\n电话：13072152762",
    ) is None
    assert resolve_high_confidence_candidate_name(
        file_name="【测试工程师】Software 10年.pdf",
        raw_text="Software\n电话：13072152762",
    ) is None


def test_explicit_single_latin_name_is_trusted():
    raw_text = "Name: Alice\nPhone: 13072152762"

    assert extract_explicit_candidate_name_from_resume(raw_text) == "Alice"
    assert resolve_high_confidence_candidate_name(raw_text=raw_text) == {
        "value": "Alice",
        "source": "resume_text_explicit",
        "confidence": 0.99,
    }


def test_candidate_name_promotion_accepts_corroborated_single_latin_name(db):
    file_name = "【测试工程师_南昌 8-12K】Alice 10年.pdf"
    candidate = RecruitmentCandidate(
        candidate_code="CAD-ALICE",
        org_code="group",
        name="【测试工程师_南昌 8 12K】Alice 10年",
        name_source="filename_untrusted",
        source="manual_upload",
        source_detail=file_name,
        status="matching",
        created_by="tester",
        updated_by="tester",
        deleted=False,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    promoted = RecruitmentService(db)._apply_resolved_candidate_name(
        candidate,
        file_name=file_name,
        raw_text="Alice 女 | 27岁联系方式电话：13072152762 求职信息\n工作时长：7年",
    )

    assert promoted is True
    assert candidate.name == "Alice"
    assert candidate.name_source == "resume_parsed"
    assert candidate.name_confidence == 0.96


def test_zhaopin_filename_and_glued_header_accept_uncommon_surname(db):
    file_name = "闫长生_39岁_AI产品经理_北京_智联简历_24797.pdf"
    raw_text = (
        "闫长生点击此处联系候选人\n"
        "应聘职位：\nAI 产品经理\n"
        "手机：\n185****8921\n"
        "基本信息\n男｜39 岁｜16 年｜本科\n"
        "工作经历"
    )

    assert extract_high_confidence_candidate_name_from_filename(file_name) == ""
    assert resolve_high_confidence_candidate_name(file_name=file_name, raw_text=raw_text) == {
        "value": "闫长生",
        "source": "resume_parsed",
        "confidence": 0.96,
    }
    assert resolve_high_confidence_candidate_name(
        file_name=file_name,
        raw_text=raw_text,
        proposed_name="闫长生",
    ) == {
        "value": "闫长生",
        "source": "resume_parsed",
        "confidence": 0.96,
    }

    candidate = RecruitmentCandidate(
        candidate_code="CAD-YAN",
        org_code="group",
        name="闫长生 39岁 AI产品经理 北京 智联简历 24797",
        name_source="filename_untrusted",
        source="manual_upload",
        source_detail=file_name,
        status="matching",
        created_by="tester",
        updated_by="tester",
        deleted=False,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    promoted = RecruitmentService(db)._apply_resolved_candidate_name(
        candidate,
        file_name=file_name,
        raw_text=raw_text,
    )

    assert promoted is True
    assert candidate.name == "闫长生"
    assert candidate.name_source == "resume_parsed"
    assert candidate.name_confidence == 0.96


def test_recruitment_filename_variants_require_matching_header_identity():
    raw_text = "闫长生\n手机：185****8921\n基本信息\n39岁"
    for file_name in (
        "闫长生_39岁_AI产品经理_北京_智联简历_24797.pdf",
        "闫长生-39岁-AI产品经理-北京-智联简历.pdf",
        "闫长生 39岁 智联简历.pdf",
        "【AI产品经理】闫长生.pdf",
        "闫长生.pdf",
    ):
        assert resolve_high_confidence_candidate_name(file_name=file_name, raw_text=raw_text) == {
            "value": "闫长生",
            "source": "resume_parsed",
            "confidence": 0.96,
        }

    assert resolve_high_confidence_candidate_name(
        file_name="闫长生_39岁_AI产品经理_北京_智联简历_24797.pdf",
        raw_text="工作经历\n闫长生负责产品设计\n手机：185****8921",
    ) is None
    assert resolve_high_confidence_candidate_name(
        file_name="AI产品经理_39岁_北京_智联简历.pdf",
        raw_text="AI产品经理\n手机：185****8921",
    ) is None
    assert resolve_high_confidence_candidate_name(
        file_name="闫长生.pdf",
        raw_text="• 闫长生\n手机：185****8921\n基本信息\n39岁",
    ) == {
        "value": "闫长生",
        "source": "resume_parsed",
        "confidence": 0.96,
    }


def test_resume_identity_accepts_collapsed_table_pdf_header_only():
    raw_text = "个 人 简 历姓名 罗仕豪 性别 男 年龄 29 岁籍贯 江西南昌 学校 南昌工学院"

    assert extract_explicit_candidate_name_from_resume(raw_text) == "罗仕豪"
    assert resolve_high_confidence_candidate_name(
        file_name="18a0cbd1-e450-4608-bc30-3a00343d91c8.pdf",
        raw_text=raw_text,
        proposed_name="罗仕豪",
    ) == {
        "value": "罗仕豪",
        "source": "resume_text_explicit",
        "confidence": 0.99,
    }

    assert extract_explicit_candidate_name_from_resume(
        "工作内容\n负责登记客户姓名 张三 性别 男"
    ) == ""


def test_legacy_fallback_no_longer_guesses_city_or_job_title():
    assert normalize_resume_fallback_name("【岗位】济南.pdf") == ""
    assert normalize_resume_fallback_name("南京市_张三_简历.pdf") == ""
    assert normalize_resume_fallback_name("【岗位】测试工程师.pdf") == ""
    assert normalize_resume_fallback_name("Product Manager") == ""
    assert normalize_resume_fallback_name("Alice Smith") == "Alice Smith"


def test_upload_persists_trusted_name_without_using_it_as_duplicate_key(db, tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.services.recruitment_service_impl.RECRUITMENT_UPLOAD_ROOT",
        tmp_path,
    )
    service = RecruitmentService(db)

    first = service.upload_resume_files(
        [{"file_name": "【硬件工程师】张三 5年.pdf", "content": b"first"}],
        None,
        "tester",
        match_mode="none",
        duplicate_strategy="skip",
    )[0]
    second = service.upload_resume_files(
        [{"file_name": "【软件工程师】张三 6年.pdf", "content": b"second"}],
        None,
        "tester",
        match_mode="none",
        duplicate_strategy="skip",
    )[0]
    duplicate = service.upload_resume_files(
        [{"file_name": "【硬件工程师】张三 5年.pdf", "content": b"duplicate"}],
        None,
        "tester",
        match_mode="none",
        duplicate_strategy="skip",
    )[0]

    rows = db.query(RecruitmentCandidate).order_by(RecruitmentCandidate.id.asc()).all()
    assert len(rows) == 2
    assert [row.name for row in rows] == ["张三", "张三"]
    assert all(row.name_source == "filename_high_confidence" for row in rows)
    assert first["id"] != second["id"]
    assert duplicate["id"] == first["id"]
    assert duplicate["skipped_duplicate"] is True


def test_manual_name_is_not_overwritten_by_later_automatic_parse(db):
    candidate = RecruitmentCandidate(
        candidate_code="CAD-MANUAL-NAME",
        org_code="group",
        name="【硬件工程师】张三 5年",
        name_source="filename_untrusted",
        source="manual_upload",
        source_detail="【硬件工程师】张三 5年.pdf",
        status="new_imported",
        created_by="tester",
        updated_by="tester",
        deleted=False,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    service = RecruitmentService(db)

    service.update_candidate(candidate.id, {"name": "李四"}, "hr-user")
    db.refresh(candidate)
    promoted = service._apply_resolved_candidate_name(
        candidate,
        file_name=candidate.source_detail or "",
        raw_text="姓名：王五\n电话：13800138000",
        proposed_name="王五",
    )

    assert promoted is False
    assert candidate.name == "李四"
    assert candidate.name_source == "hr_manual"
    assert candidate.name_confidence == 1.0


def test_stale_parse_session_cannot_overwrite_concurrent_hr_name(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'candidate-identity.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    stale_db = session_factory()
    hr_db = session_factory()
    try:
        candidate = RecruitmentCandidate(
            candidate_code="CAD-CONCURRENT-NAME",
            org_code="group",
            name="【硬件工程师】张三 5年",
            name_source="filename_untrusted",
            source="manual_upload",
            source_detail="【硬件工程师】张三 5年.pdf",
            status="new_imported",
            created_by="tester",
            updated_by="tester",
            deleted=False,
        )
        stale_db.add(candidate)
        stale_db.commit()
        stale_candidate = stale_db.query(RecruitmentCandidate).filter_by(id=candidate.id).one()
        stale_db.commit()

        hr_candidate = hr_db.query(RecruitmentCandidate).filter_by(id=candidate.id).one()
        hr_candidate.name = "李四"
        hr_candidate.name_source = "hr_manual"
        hr_candidate.name_confidence = 1.0
        hr_db.commit()

        promoted = RecruitmentService(stale_db)._apply_resolved_candidate_name(
            stale_candidate,
            raw_text="姓名：王五\n电话：13800138000",
            proposed_name="王五",
        )
        stale_db.commit()
        stale_db.expire_all()
        persisted = stale_db.query(RecruitmentCandidate).filter_by(id=candidate.id).one()

        assert promoted is False
        assert persisted.name == "李四"
        assert persisted.name_source == "hr_manual"
    finally:
        stale_db.close()
        hr_db.close()
        engine.dispose()


def test_job_matching_resume_read_promotes_explicit_name_without_extra_ai_call(db, monkeypatch):
    candidate = RecruitmentCandidate(
        candidate_code="CAD-MATCH-NAME",
        org_code="group",
        name="【智能家居工程师】",
        name_source="filename_untrusted",
        source="manual_upload",
        source_detail="【智能家居工程师】.pdf",
        status="matching",
        created_by="tester",
        updated_by="tester",
        deleted=False,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    parse_stub = SimpleNamespace(
        raw_text="姓名：王欢\n手机：13800138000\n工作经历",
        basic_info_json='{"name":"王欢"}',
    )
    service = RecruitmentService(db)
    monkeypatch.setattr(service, "_get_current_parse_result", lambda _candidate: parse_stub)
    monkeypatch.setattr(service, "_build_ai_match_resume_evidence", lambda *_args: "resume-evidence")

    assert service._build_ai_match_resume_text(candidate) == "resume-evidence"
    db.refresh(candidate)
    assert candidate.name == "王欢"
    assert candidate.name_source == "resume_text_explicit"
    assert candidate.name_confidence == 0.99
