import json
from datetime import datetime
from typing import Callable, TypeVar

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.recruitment_models import (
    RecruitmentAITaskLog,
    RecruitmentCandidate,
    RecruitmentCandidateScore,
    RecruitmentPosition,
)
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


def _add_position(db, *, code: str = "P-CANDIDATE-LIST") -> RecruitmentPosition:
    position = RecruitmentPosition(
        position_code=code,
        org_code="group",
        title="测试岗位",
        key_requirements="不应进入候选人列表查询",
        summary="不应进入候选人列表查询",
        status="active",
        deleted=False,
    )
    db.add(position)
    db.flush()
    return position


def _add_candidate(
    db,
    *,
    index: int,
    position_id: int | None,
    status: str = "pending_screening",
) -> RecruitmentCandidate:
    candidate = RecruitmentCandidate(
        candidate_code=f"C-PERF-{index}",
        org_code="group",
        position_id=position_id,
        name=f"候选人{index}",
        phone=f"1380000{index:04d}",
        email=f"candidate-{index}@example.com",
        source="manual_upload",
        status=status,
        tags_json=json.dumps(["性能测试"], ensure_ascii=False),
        notes=f"候选人备注{index}",
        created_by="tester",
        updated_by="tester",
        deleted=False,
    )
    db.add(candidate)
    db.flush()
    return candidate


def test_candidate_list_sql_budget_is_constant_and_wide_fields_are_not_selected():
    engine, db = _build_test_db()
    position = _add_position(db)
    for index in range(30):
        candidate = _add_candidate(db, index=index, position_id=position.id)
        score = RecruitmentCandidateScore(
            candidate_id=candidate.id,
            parse_result_id=1000 + index,
            org_code="group",
            score_json=json.dumps({"large_debug_payload": "x" * 4096}),
            total_score=8.5,
            match_percent=85,
            suggested_status="screening_passed",
        )
        db.add(score)
        db.flush()
        candidate.latest_score_id = score.id
    db.commit()
    service = RecruitmentService(db)

    observed_counts: list[int] = []
    for compact in (False, True):
        for page_size in (15, 30):
            result, statements = _capture_sql(
                engine,
                lambda page_size=page_size, compact=compact: service.list_candidates(
                    limit=page_size,
                    compact=compact,
                ),
            )
            assert len(result["items"]) == page_size
            assert all(item["latest_total_score"] == 8.5 for item in result["items"])
            assert len(statements) <= 8
            observed_counts.append(len(statements))

            normalized_sql = [statement.lower() for statement in statements]
            task_sql = next(statement for statement in normalized_sql if "from recruitment_ai_task_logs" in statement)
            for forbidden_column in (
                "prompt_snapshot",
                "full_request_snapshot",
                "raw_response_text",
                "sanitized_response_json",
                "persisted_result_refs_json",
            ):
                assert forbidden_column not in task_sql

            score_sql = next(statement for statement in normalized_sql if "from recruitment_candidate_scores" in statement)
            assert "score_json" not in score_sql

            position_sql = next(statement for statement in normalized_sql if "from recruitment_positions" in statement)
            position_select = position_sql.split("from", 1)[0]
            assert "key_requirements" not in position_select
            assert "summary" not in position_select

            candidate_sql = next(
                statement
                for statement in normalized_sql
                if "from recruitment_candidates" in statement and "count(" not in statement
            )
            candidate_select = candidate_sql.split("from", 1)[0]
            assert "ai_match_at" not in candidate_select
            assert "ai_match_alternatives" not in candidate_select
            if compact:
                assert "recruitment_candidates.notes" in candidate_select
            else:
                assert "recruitment_candidates.notes" not in candidate_select

    assert len(set(observed_counts)) == 1


def test_candidate_list_legacy_score_json_uses_one_batched_compatibility_query():
    engine, db = _build_test_db()
    position = _add_position(db, code="P-LEGACY-SCORE")
    fallback_position = _add_position(db, code="P-LEGACY-MATCH")
    fallback_position.title = "兼容推荐岗位"
    legacy_candidate = _add_candidate(db, index=101, position_id=position.id)
    legacy_candidate.talent_pool_reason = "unmatched_by_ai"
    legacy_score = RecruitmentCandidateScore(
        candidate_id=legacy_candidate.id,
        parse_result_id=2101,
        org_code="group",
        score_json=json.dumps(
            {
                "_storage_format": "raw_screening_v1",
                "score": {
                    "total_score": 8.4,
                    "match_percent": 88,
                    "suggested_status": "screening_passed",
                },
            }
        ),
    )
    db.add(legacy_score)
    db.flush()
    legacy_candidate.latest_score_id = legacy_score.id

    current_candidate = _add_candidate(db, index=102, position_id=position.id)
    current_score = RecruitmentCandidateScore(
        candidate_id=current_candidate.id,
        parse_result_id=2102,
        org_code="group",
        score_json=None,
        total_score=7.2,
        match_percent=72,
        suggested_status="screening_passed",
    )
    db.add(current_score)
    db.flush()
    current_candidate.latest_score_id = current_score.id
    db.add(
        RecruitmentAITaskLog(
            task_type="ai_position_match",
            related_candidate_id=legacy_candidate.id,
            related_position_id=fallback_position.id,
            status="success",
            parsed_response_json=json.dumps(
                {
                    "position_id": fallback_position.id,
                    "potential_position": "兼容潜力岗位",
                },
                ensure_ascii=False,
            ),
        )
    )
    db.commit()

    result, statements = _capture_sql(engine, lambda: RecruitmentService(db).list_candidates(limit=15))
    items_by_id = {item["id"]: item for item in result["items"]}
    assert items_by_id[legacy_candidate.id]["latest_total_score"] == 8.4
    assert items_by_id[legacy_candidate.id]["match_percent"] == 88
    assert items_by_id[legacy_candidate.id]["display_status"] == "screening_passed"
    assert items_by_id[legacy_candidate.id]["ai_match_position_title"] == "兼容推荐岗位"
    assert items_by_id[legacy_candidate.id]["ai_potential_position"] == "兼容潜力岗位"
    assert items_by_id[current_candidate.id]["latest_total_score"] == 7.2
    assert items_by_id[current_candidate.id]["match_percent"] == 72
    assert len(statements) == 8

    score_statements = [
        statement.lower()
        for statement in statements
        if "from recruitment_candidate_scores" in statement.lower()
    ]
    assert len(score_statements) == 2
    assert "score_json" not in score_statements[0]
    assert "score_json" in score_statements[1]
    position_statements = [
        statement.lower()
        for statement in statements
        if "from recruitment_positions" in statement.lower()
    ]
    assert len(position_statements) == 2
    for position_statement in position_statements:
        position_select = position_statement.split("from", 1)[0]
        assert "key_requirements" not in position_select
        assert "summary" not in position_select


def test_candidate_list_latest_task_rows_are_selected_in_database_with_original_ordering():
    engine, db = _build_test_db()
    position = _add_position(db, code="P-TASK-ORDER")
    candidate = _add_candidate(db, index=201, position_id=position.id, status="pending_screening")
    candidate.talent_pool_reason = "unmatched_by_ai"
    same_time = datetime(2026, 7, 13, 10, 0, 0)

    active_old = RecruitmentAITaskLog(
        task_type="screening_flow",
        related_candidate_id=candidate.id,
        parent_task_id=None,
        status="queued",
        stage="parsing",
        output_summary="旧任务",
        created_at=same_time,
        updated_at=same_time,
    )
    active_new = RecruitmentAITaskLog(
        task_type="screening_flow",
        related_candidate_id=candidate.id,
        parent_task_id=None,
        status="queued",
        stage="scoring",
        output_summary="新任务",
        output_snapshot=json.dumps({"parse_status": "reused"}),
        validation_meta_json=json.dumps(
            {"auto_requeue_scheduled": True, "failure_code": "rate_limited"}
        ),
        created_at=same_time,
        updated_at=same_time,
    )
    parse_old = RecruitmentAITaskLog(
        task_type="resume_parse",
        related_candidate_id=candidate.id,
        status="success",
        created_at=same_time,
        updated_at=same_time,
    )
    parse_new = RecruitmentAITaskLog(
        task_type="resume_parse",
        related_candidate_id=candidate.id,
        status="success",
        created_at=same_time,
        updated_at=same_time,
    )
    terminal_old = RecruitmentAITaskLog(
        task_type="screening_flow",
        related_candidate_id=candidate.id,
        parent_task_id=None,
        status="success",
        created_at=same_time,
        updated_at=same_time,
    )
    terminal_new = RecruitmentAITaskLog(
        task_type="screening_flow",
        related_candidate_id=candidate.id,
        parent_task_id=None,
        status="failed",
        validation_meta_json=json.dumps({"failure_code": "quota_exceeded"}),
        created_at=same_time,
        updated_at=same_time,
    )
    match_old = RecruitmentAITaskLog(
        task_type="ai_position_match",
        related_candidate_id=candidate.id,
        status="success",
        parsed_response_json=json.dumps(
            {"position_title": "旧推荐岗位", "potential_position": "旧潜力岗位"},
            ensure_ascii=False,
        ),
        created_at=same_time,
        updated_at=same_time,
    )
    match_new = RecruitmentAITaskLog(
        task_type="ai_position_match",
        related_candidate_id=candidate.id,
        status="success",
        parsed_response_json=json.dumps(
            {"position_title": "新推荐岗位", "potential_position": "新潜力岗位"},
            ensure_ascii=False,
        ),
        created_at=same_time,
        updated_at=same_time,
    )
    db.add_all(
        [
            active_old,
            active_new,
            parse_old,
            parse_new,
            terminal_old,
            terminal_new,
            match_old,
            match_new,
        ]
    )
    db.commit()
    service = RecruitmentService(db)

    active_map, parse_map, terminal_map, match_map = service._build_candidate_list_task_preload_maps(
        [candidate.id]
    )
    assert active_map[candidate.id].id == active_new.id
    assert parse_map[candidate.id].id == parse_new.id
    assert terminal_map[candidate.id].id == terminal_new.id
    assert match_map[candidate.id].id == match_new.id

    result = service.list_candidates(limit=15)
    item = result["items"][0]
    assert item["active_screening_task_id"] == active_new.id
    assert item["active_screening_auto_retry_scheduled"] is True
    assert item["display_status_reason"] == "模型接口限流，系统将自动重试，请稍候。"
    assert item["ai_match_position_title"] == "新推荐岗位"
    assert item["ai_potential_position"] == "新潜力岗位"


def test_explicit_empty_preloads_do_not_fall_back_to_per_candidate_queries():
    engine, db = _build_test_db()
    candidates = []
    for index in range(15):
        candidate = _add_candidate(db, index=300 + index, position_id=999999)
        candidate.latest_score_id = 888888
        candidates.append(candidate)
    db.commit()
    service = RecruitmentService(db)

    result, statements = _capture_sql(engine, lambda: service.list_candidates(limit=15))
    assert len(result["items"]) == 15
    assert all(item["position_title"] is None for item in result["items"])
    assert all(item["latest_total_score"] is None for item in result["items"])
    assert len(statements) <= 8

    screening_state, screening_statements = _capture_sql(
        engine,
        lambda: service._build_candidate_screening_state_summary(
            candidates[0],
            _preloaded_active_root=None,
            _preloaded_latest_completed_parse=None,
            _preloaded_latest_completed_score=None,
        ),
    )
    assert screening_state["active_screening_task_id"] is None
    assert screening_statements == []

    serialized, serializer_statements = _capture_sql(
        engine,
        lambda: service._serialize_candidate_list_item(
            candidates[0],
            _preloaded_position=None,
            _preloaded_score_row=None,
            _preloaded_screening_state=None,
            _preloaded_interview_state=None,
            _preloaded_ai_match_snapshot=None,
        ),
    )
    assert serialized["position_title"] is None
    assert serialized["active_screening_task_id"] is None
    assert serializer_statements == []
