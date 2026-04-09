import assert from "node:assert/strict";
import test from "node:test";

import {buildScreeningFlowAuditView} from "./auditFlowDetails.ts";

test("screening_flow detail view falls back to parse and score child logs when root lacks model details", () => {
    const rootLog = {
        id: 1001,
        task_type: "screening_flow",
        screening_run_id: "run-1001",
        parent_task_id: null,
        root_task_id: 1001,
        stage: "parsing",
        status: "running",
        full_request_snapshot: null,
        raw_response_text: null,
        parsed_response_json: null,
        sanitized_response_json: null,
        output_snapshot: {
            parse_status: "running",
            score_status: "pending",
            persist_status: "pending",
            parse_strategy: "parse_then_score",
            reused_existing_parse: false,
        },
        timing_breakdown: {
            parse_duration_ms: 180,
            score_duration_ms: 320,
            save_duration_ms: 60,
        },
        persisted_result_refs: {
            parse_result_id: 31,
            score_result_id: 41,
            candidate_status_after: "screening_passed",
        },
        validation_meta: {
            final_response_source: "primary_score_model",
        },
    };
    const parseChild = {
        id: 1002,
        task_type: "resume_parse",
        screening_run_id: "run-1001",
        parent_task_id: 1001,
        root_task_id: 1001,
        stage: "parsed",
        status: "success",
        output_summary: "简历解析完成",
        full_request_snapshot: "{\"task\":\"parse\"}",
        raw_response_text: "{\"basic_info\":{\"name\":\"岳珊珊\"}}",
        parsed_response_json: {basic_info: {name: "岳珊珊"}},
        sanitized_response_json: {basic_info: {name: "岳珊珊"}},
        output_snapshot: {parse_result_id: 31},
        duration_ms: 180,
        created_at: "2026-04-08T16:25:01",
        updated_at: "2026-04-08T16:25:02",
    };
    const scoreChild = {
        id: 1003,
        task_type: "resume_score",
        screening_run_id: "run-1001",
        parent_task_id: 1001,
        root_task_id: 1001,
        stage: "completed",
        status: "success",
        output_summary: "初筛评分完成",
        full_request_snapshot: "{\"task\":\"score\"}",
        raw_response_text: "{\"total_score\":8.1}",
        parsed_response_json: {total_score: 8.1},
        sanitized_response_json: {total_score: 8.1, match_percent: 81},
        output_snapshot: {score_result_id: 41},
        duration_ms: 320,
        created_at: "2026-04-08T16:25:03",
        updated_at: "2026-04-08T16:25:04",
    };

    const view = buildScreeningFlowAuditView(rootLog, [rootLog, parseChild, scoreChild]);

    assert.equal(view.parseDetailLog?.id, 1002);
    assert.equal(view.scoreDetailLog?.id, 1003);
    assert.equal(view.stages[0]?.status, "completed");
    assert.equal(view.stages[1]?.status, "completed");
    assert.equal(view.inferredFromChildTerminal, true);
    assert.equal(view.effectiveRootStatus, "success");
    assert.equal(view.effectiveRootStage, "completed");
});

test("screening_flow detail view keeps root queued when infra retry is scheduled", () => {
    const rootLog = {
        id: 2001,
        task_type: "screening_flow",
        screening_run_id: "run-2001",
        parent_task_id: null,
        root_task_id: 2001,
        stage: "queued",
        status: "queued",
        output_snapshot: {
            parse_status: "running",
            score_status: "pending",
            persist_status: "pending",
            auto_requeue_scheduled: true,
            failure_code: "upstream_timeout",
            next_retry_at: "2026-04-08T16:40:00",
        },
        validation_meta: {
            screening_result_valid: false,
            screening_result_state: "upstream_timeout",
            auto_requeue_scheduled: true,
            failure_code: "upstream_timeout",
            next_retry_at: "2026-04-08T16:40:00",
        },
        persisted_result_refs: null,
    };
    const parseChild = {
        id: 2002,
        task_type: "resume_parse",
        screening_run_id: "run-2001",
        parent_task_id: 2001,
        root_task_id: 2001,
        stage: "failed",
        status: "upstream_timeout",
        output_summary: "上游超时，稍后自动重试",
        created_at: "2026-04-08T16:25:01",
        updated_at: "2026-04-08T16:26:02",
    };

    const view = buildScreeningFlowAuditView(rootLog, [rootLog, parseChild]);

    assert.equal(view.effectiveRootStatus, "queued");
    assert.equal(view.effectiveRootStage, "queued");
    assert.equal(view.rootNotice, "接口超时，系统稍后自动重试");
    assert.equal(view.nextRetryAt, "2026-04-08T16:40:00");
    assert.equal(view.stages[0]?.detail, "上游超时，稍后自动重试；系统已安排自动重试。");
    assert.equal(view.inferredFromChildTerminal, false);
});

test("screening_flow detail view marks total timeout as failed", () => {
    const rootLog = {
        id: 3001,
        task_type: "screening_flow",
        screening_run_id: "run-3001",
        parent_task_id: null,
        root_task_id: 3001,
        stage: "failed",
        status: "failed",
        validation_meta: {
            screening_result_state: "screening_total_timeout",
            screening_result_valid: false,
            failure_code: "screening_total_timeout",
            invalid_result_summary: "初筛总耗时超过 300 秒，已终止",
        },
        output_snapshot: {
            parse_status: "completed",
            score_status: "failed",
            persist_status: "failed",
        },
        persisted_result_refs: null,
    };

    const view = buildScreeningFlowAuditView(rootLog, [rootLog]);

    assert.equal(view.effectiveRootStatus, "failed");
    assert.equal(view.effectiveRootStage, "failed");
    assert.equal(view.rootNotice, "初筛总耗时超过 300 秒，已终止");
});
