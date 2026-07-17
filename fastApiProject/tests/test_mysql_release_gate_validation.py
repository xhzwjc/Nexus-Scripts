"""真实 MySQL 双会话验证（AI 初筛 Release Gate 的仓库内可复现证据）。

默认跳过（普通 CI/SQLite 全量不受影响）。在本地 MySQL 环境执行：

    RECRUITMENT_MYSQL_VALIDATION=1 ENVIRONMENT=local PYTHONPATH=. \
    ./venv/bin/python -m pytest tests/test_mysql_release_gate_validation.py -p no:randomly -q

前置：.env 中 DB_LOCAL_* 必须指向可写的本地 MySQL 验证库，绝不可指向生产库。
所有测试数据用 MYSQLGATE 前缀标记，测试自清理。

覆盖复审验收标准：
- 终态提交语义：关会话重开后 run 必须已是终态、active 指针为空；
- 晋级幂等：同一 run 重复执行只产生一份权威 Score；
- 人工决策优先：HR 运行期推进状态后，迟到 AI 结果不得回写候选人；
- /score 双会话乱序：旧评分后完成不得覆盖新评分；
- 原子入队：提交前派单器看不到无 run 的 queued 任务；
- 批量邮件：失败批次即使有历史通过分也不发信。
"""
import os

import pytest

pytestmark = pytest.mark.skipif(
    os.getenv("RECRUITMENT_MYSQL_VALIDATION") != "1",
    reason="需要真实 MySQL：设置 RECRUITMENT_MYSQL_VALIDATION=1 并配置本地 DB_LOCAL_* 后运行",
)

MARKER_PREFIX = "MYSQLGATE"

SCORE_CONTENT_TEMPLATE = {
    "score": {
        "total_score": 8.0,
        "match_percent": 80,
        "recommendation": "建议面试",
        "suggested_status": "screening_passed",
        "advantages": ["强"],
        "concerns": [],
    },
}


def _new_session():
    from app.database import SessionLocal

    return SessionLocal()


def _cleanup(db):
    from app.recruitment_models import (
        RecruitmentAITaskLog,
        RecruitmentCandidate,
        RecruitmentCandidateScore,
        RecruitmentCandidateScreeningRun,
        RecruitmentResumeFile,
        RecruitmentResumeParseResult,
    )

    rows = db.query(RecruitmentCandidate).filter(
        RecruitmentCandidate.candidate_code.like(f"{MARKER_PREFIX}%"),
    ).all()
    for candidate in rows:
        db.query(RecruitmentCandidateScore).filter(RecruitmentCandidateScore.candidate_id == candidate.id).delete()
        db.query(RecruitmentCandidateScreeningRun).filter(RecruitmentCandidateScreeningRun.candidate_id == candidate.id).delete()
        db.query(RecruitmentAITaskLog).filter(RecruitmentAITaskLog.related_candidate_id == candidate.id).delete()
        db.query(RecruitmentResumeParseResult).filter(RecruitmentResumeParseResult.candidate_id == candidate.id).delete()
        db.query(RecruitmentResumeFile).filter(RecruitmentResumeFile.candidate_id == candidate.id).delete()
        db.delete(candidate)
    db.commit()


def _seed_candidate(db, marker: str, *, status: str = "pending_screening", position_id=None):
    from app.recruitment_models import (
        RecruitmentCandidate,
        RecruitmentResumeFile,
        RecruitmentResumeParseResult,
    )

    candidate = RecruitmentCandidate(
        candidate_code=marker, org_code="group", name=marker, position_id=position_id,
        source="manual_upload", status=status, screening_generation=0, deleted=False,
        created_by="mysqlgate",
    )
    db.add(candidate)
    db.flush()
    resume = RecruitmentResumeFile(
        candidate_id=candidate.id, org_code="group", original_name="r.txt", stored_name="r.txt",
        storage_path="/tmp/mysqlgate.txt", file_ext=".txt", parse_status="success", uploaded_by="mysqlgate",
    )
    db.add(resume)
    db.flush()
    candidate.latest_resume_file_id = resume.id
    parse = RecruitmentResumeParseResult(
        candidate_id=candidate.id, resume_file_id=resume.id, org_code="group",
        raw_text="候选人简历：三年 IoT 测试经验，负责 BLE 协议联调与自动化测试。", status="success",
    )
    db.add(parse)
    db.flush()
    candidate.latest_parse_result_id = parse.id
    db.commit()
    return candidate, parse


def _score_content():
    from app.services.recruitment_service_impl import RAW_SCREENING_SCORE_STORAGE_FORMAT

    content = {"_storage_format": RAW_SCREENING_SCORE_STORAGE_FORMAT}
    content.update({k: dict(v) if isinstance(v, dict) else v for k, v in SCORE_CONTENT_TEMPLATE.items()})
    return content


@pytest.fixture()
def mysql_db():
    db = _new_session()
    _cleanup(db)
    try:
        yield db
    finally:
        try:
            db.rollback()
        except Exception:
            pass
        _cleanup(db)
        db.close()


def test_terminal_finalize_survives_session_reopen(mysql_db):
    """P0-2 提交语义：finalize+commit 后，全新 Session 必须看到 run 终态 + active 指针为空。"""
    from app.recruitment_models import RecruitmentCandidate, RecruitmentCandidateScreeningRun
    from app.services.recruitment_service_impl import RecruitmentService

    candidate, _parse = _seed_candidate(mysql_db, f"{MARKER_PREFIX}-FIN")
    service = RecruitmentService(mysql_db)
    run = service._open_screening_run(candidate=candidate, root_task_id=990001, screening_run_key="k", request_meta={}, actor_id="mysqlgate")
    run.status = "running"
    mysql_db.add(run)
    mysql_db.commit()
    run_id, candidate_id = run.id, candidate.id

    service._current_screening_run_id = run_id
    # 与 finish_root_task 生产路径一致：finalize 后必须显式提交
    service._finalize_bound_screening_run("failed", candidate_ref=candidate)
    mysql_db.commit()

    fresh = _new_session()
    try:
        fresh_run = fresh.query(RecruitmentCandidateScreeningRun).filter(RecruitmentCandidateScreeningRun.id == run_id).first()
        fresh_candidate = fresh.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == candidate_id).first()
        assert fresh_run.status == "failed", f"重开会话后 run 必须已终态，实际 {fresh_run.status}"
        assert fresh_run.completed_at is not None
        assert fresh_candidate.active_screening_run_id is None, "重开会话后 active 指针必须为空"
    finally:
        fresh.close()


def test_duplicate_promotion_is_idempotent(mysql_db):
    """P0-2 幂等：同一 promoted run 重复执行 _save_score_result 只产生一份权威 Score。"""
    from app.recruitment_models import RecruitmentCandidateScreeningRun
    from app.services.recruitment_service_impl import RecruitmentService

    candidate, parse = _seed_candidate(mysql_db, f"{MARKER_PREFIX}-IDEM")
    service = RecruitmentService(mysql_db)
    run = service._open_screening_run(candidate=candidate, root_task_id=990002, screening_run_key="k", request_meta={}, actor_id="mysqlgate")
    run.status = "running"
    mysql_db.add(run)
    mysql_db.commit()
    service._current_screening_run_id = run.id

    score_first = service._save_score_result(candidate, parse, "mysqlgate", _score_content(), allow_status_advance=True)
    mysql_db.commit()
    mysql_db.refresh(candidate)
    assert getattr(score_first, "_superseded_reason", None) is None
    assert candidate.latest_score_id == score_first.id

    # 模拟重复回调/重复 worker：同一 run 再执行一次
    score_second = service._save_score_result(candidate, parse, "mysqlgate", _score_content(), allow_status_advance=True)
    mysql_db.commit()
    mysql_db.refresh(candidate)
    run_row = mysql_db.query(RecruitmentCandidateScreeningRun).filter(RecruitmentCandidateScreeningRun.id == run.id).first()
    assert getattr(score_second, "_superseded_reason", None) == "already_promoted"
    assert candidate.latest_score_id == score_first.id, "重复执行不得改写权威评分指针"
    assert run_row.status == "promoted", "promoted 是不可变终态"
    assert run_row.score_result_id == score_first.id, "run 必须保留首次晋级的评分"


def test_hr_status_advance_blocks_late_promotion(mysql_db):
    """P0-3 人工决策优先：HR 在另一会话把候选人推进到部门评审后，迟到 AI 结果不得回写。"""
    from app.recruitment_models import RecruitmentCandidate, RecruitmentCandidateScreeningRun
    from app.services.recruitment_service_impl import RecruitmentService

    candidate, parse = _seed_candidate(mysql_db, f"{MARKER_PREFIX}-HR")
    service = RecruitmentService(mysql_db)
    run = service._open_screening_run(candidate=candidate, root_task_id=990003, screening_run_key="k", request_meta={}, actor_id="mysqlgate")
    run.status = "running"
    mysql_db.add(run)
    mysql_db.commit()
    service._current_screening_run_id = run.id

    # HR 会话：把候选人推进到部门评审通过
    hr_db = _new_session()
    try:
        hr_candidate = hr_db.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == candidate.id).with_for_update().first()
        hr_candidate.status = "department_review_passed"
        hr_candidate.updated_by = "hr-user"
        hr_db.add(hr_candidate)
        hr_db.commit()
    finally:
        hr_db.close()

    # worker 会话：迟到的 AI 评分尝试晋级
    score_row = service._save_score_result(candidate, parse, "mysqlgate", _score_content(), allow_status_advance=True)
    mysql_db.commit()

    fresh = _new_session()
    try:
        fresh_candidate = fresh.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == candidate.id).first()
        fresh_run = fresh.query(RecruitmentCandidateScreeningRun).filter(RecruitmentCandidateScreeningRun.id == run.id).first()
        assert getattr(score_row, "_superseded_reason", None) == "candidate_status_advanced"
        assert fresh_candidate.status == "department_review_passed", "AI 不得把人工推进的状态拉回初筛域"
        assert fresh_candidate.latest_score_id is None, "迟到 AI 结果不得写权威评分指针"
        assert fresh_run.status == "superseded"
    finally:
        fresh.close()


def test_out_of_order_scores_do_not_regress_latest(mysql_db):
    """P0-4 /score 乱序：新评分（gen2, 90）先完成、旧评分（gen1, 60）后完成 → latest 保持 90。"""
    from app.services.recruitment_service_impl import RecruitmentService

    candidate, parse = _seed_candidate(mysql_db, f"{MARKER_PREFIX}-ORDER")
    service = RecruitmentService(mysql_db)
    run_old = service._open_screening_run(candidate=candidate, root_task_id=990004, screening_run_key="k1", request_meta={}, actor_id="mysqlgate")
    mysql_db.commit()
    run_new = service._open_screening_run(candidate=candidate, root_task_id=990005, screening_run_key="k2", request_meta={}, actor_id="mysqlgate")
    mysql_db.commit()

    content_new = _score_content()
    content_new["score"]["total_score"] = 9.0
    content_new["score"]["match_percent"] = 90
    service._current_screening_run_id = run_new.id
    score_new = service._save_score_result(candidate, parse, "mysqlgate", content_new, allow_status_advance=True)
    mysql_db.commit()

    content_old = _score_content()
    content_old["score"]["total_score"] = 6.0
    content_old["score"]["match_percent"] = 60
    service._current_screening_run_id = run_old.id
    score_old = service._save_score_result(candidate, parse, "mysqlgate", content_old, allow_status_advance=True)
    mysql_db.commit()
    mysql_db.refresh(candidate)

    assert getattr(score_old, "_superseded_reason", None) == "generation_changed"
    assert candidate.latest_score_id == score_new.id, "旧评分后完成不得覆盖新评分"
    assert float(candidate.match_percent or 0) == 90.0


def test_atomic_enqueue_dispatcher_cannot_see_runless_task(mysql_db):
    """P0-4 原子入队：defer_commit 提交前，独立会话（派单器视角）看不到 queued 任务；
    提交后 task+run+active 指针同时可见。"""
    from app.recruitment_models import RecruitmentAITaskLog, RecruitmentCandidate, RecruitmentCandidateScreeningRun
    from app.services.recruitment_service_impl import SCREENING_FLOW_TASK_TYPE, RecruitmentService, _build_screening_run_id

    candidate, _parse = _seed_candidate(mysql_db, f"{MARKER_PREFIX}-ATOM")
    service = RecruitmentService(mysql_db)
    run_key = _build_screening_run_id(candidate.id)
    task_row = service._create_ai_task_log(
        SCREENING_FLOW_TASK_TYPE, created_by="mysqlgate", related_candidate_id=candidate.id,
        status="queued", stage="queued", screening_run_id=run_key, defer_commit=True,
    )
    run = service._open_screening_run(candidate=candidate, root_task_id=task_row.id, screening_run_key=run_key, request_meta={}, actor_id="mysqlgate")
    assert run is not None

    dispatcher = _new_session()
    try:
        before = dispatcher.query(RecruitmentAITaskLog).filter(
            RecruitmentAITaskLog.related_candidate_id == candidate.id,
            RecruitmentAITaskLog.status == "queued",
        ).first()
        assert before is None, "提交前派单器不得看到 queued 任务（否则会抢到无 run 任务造成双 run）"

        mysql_db.commit()

        dispatcher.rollback()  # 刷新可重复读快照
        after_task = dispatcher.query(RecruitmentAITaskLog).filter(
            RecruitmentAITaskLog.related_candidate_id == candidate.id,
            RecruitmentAITaskLog.status == "queued",
        ).first()
        after_run = dispatcher.query(RecruitmentCandidateScreeningRun).filter(
            RecruitmentCandidateScreeningRun.root_task_id == task_row.id,
        ).first()
        after_candidate = dispatcher.query(RecruitmentCandidate).filter(RecruitmentCandidate.id == candidate.id).first()
        assert after_task is not None and after_run is not None, "提交后 task 与 run 必须同时可见"
        assert after_candidate.active_screening_run_id == after_run.id
    finally:
        dispatcher.close()


def test_failed_batch_never_emails_even_with_historical_pass(mysql_db):
    """P0-5：本批根任务失败时，即使候选人有历史通过分（latest_score_id 有值）也绝不发信；
    正控：success 根任务 + promoted run + run 评分==latest 才发。"""
    from unittest.mock import Mock

    from app.recruitment_models import RecruitmentAITaskLog
    from app.services.recruitment_service_impl import SCREENING_FLOW_TASK_TYPE, RecruitmentService

    candidate, parse = _seed_candidate(mysql_db, f"{MARKER_PREFIX}-MAIL", position_id=999999)
    service = RecruitmentService(mysql_db)

    # 历史通过分：先跑一个正常晋级 run
    run_hist = service._open_screening_run(candidate=candidate, root_task_id=990006, screening_run_key="k1", request_meta={}, actor_id="mysqlgate")
    mysql_db.commit()
    service._current_screening_run_id = run_hist.id
    score_hist = service._save_score_result(candidate, parse, "mysqlgate", _score_content(), allow_status_advance=True)
    mysql_db.commit()
    mysql_db.refresh(candidate)
    assert candidate.latest_score_id == score_hist.id

    sent_calls = []
    service._send_batch_auto_mail_for_position = Mock(side_effect=lambda **kwargs: sent_calls.append(kwargs))

    # 负例：本批根任务 failed（未开新 run）→ 不发信
    failed_task = RecruitmentAITaskLog(
        task_type=SCREENING_FLOW_TASK_TYPE, org_code="group", status="failed",
        related_candidate_id=candidate.id, created_by="mysqlgate",
    )
    mysql_db.add(failed_task)
    mysql_db.commit()
    service._send_batch_auto_resume_mail_for_batch("batch-neg", [failed_task])
    assert not sent_calls, "失败批次不得复用历史通过分发信"

    # 正控：success 根任务 + promoted run + run 评分 == candidate.latest → 发信
    success_task = RecruitmentAITaskLog(
        task_type=SCREENING_FLOW_TASK_TYPE, org_code="group", status="success",
        related_candidate_id=candidate.id, created_by="mysqlgate",
    )
    mysql_db.add(success_task)
    mysql_db.flush()
    run_hist_row = run_hist
    run_hist_row.root_task_id = success_task.id
    mysql_db.add(run_hist_row)
    mysql_db.commit()
    service._send_batch_auto_resume_mail_for_batch("batch-pos", [success_task])
    assert len(sent_calls) == 1, "完整链条成立时应正常发信（正控）"
