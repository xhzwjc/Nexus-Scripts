import type {AITaskLog} from "../../../lib/recruitment-api";

export type ScreeningFlowStageView = {
    key: "parse" | "score" | "persist";
    title: string;
    status: string;
    detail: string;
    duration?: number | null;
};

export type ScreeningFlowAuditView = {
    parseChild: AITaskLog | null;
    scoreChild: AITaskLog | null;
    parseDetailLog: AITaskLog | null;
    scoreDetailLog: AITaskLog | null;
    autoRequeueScheduled: boolean;
    inferredFromChildTerminal: boolean;
    effectiveRootStatus: string;
    effectiveRootStage: string;
    rootNotice: string | null;
    infraRetryCount: number | null;
    retryAfterSeconds: number | null;
    nextRetryAt: string | null;
    stages: ScreeningFlowStageView[];
};

function toRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function readNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim()) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
    }
    return null;
}

function hasStageDebugContent(log?: AITaskLog | null) {
    if (!log) {
        return false;
    }
    return Boolean(
        log.prompt_snapshot
        || log.full_request_snapshot
        || log.raw_response_text
        || log.parsed_response_json
        || log.sanitized_response_json
        || log.output_snapshot,
    );
}

function pickLatestChildLog(runLogs: AITaskLog[], taskType: string, rootTaskId?: number | null) {
    return runLogs
        .filter((log) => (
            log.task_type === taskType
            && (rootTaskId == null || log.parent_task_id === rootTaskId || log.root_task_id === rootTaskId)
        ))
        .sort((left, right) => {
            const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
            const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
            return rightTime - leftTime || right.id - left.id;
        })[0] || null;
}

function normalizeChildStageStatus(log: AITaskLog | null, fallbackStatus: string) {
    if (!log) {
        return fallbackStatus;
    }
    if (log.status === "success" || log.status === "fallback") {
        return "completed";
    }
    if (log.status === "cancelled" || log.stage === "cancelled") {
        return "cancelled";
    }
    if (["failed", "invalid_result", "json_parse_failed", "timeout", "retry_exhausted", "rate_limited", "upstream_timeout", "request_failed"].includes(log.status) || log.stage === "failed") {
        return "failed";
    }
    if (log.status === "queued" || log.status === "pending") {
        return "pending";
    }
    return "running";
}

export function buildScreeningFlowAuditView(rootLog: AITaskLog | null, runLogs: AITaskLog[]): ScreeningFlowAuditView {
    if (!rootLog) {
        return {
            parseChild: null,
            scoreChild: null,
            parseDetailLog: null,
            scoreDetailLog: null,
            autoRequeueScheduled: false,
            inferredFromChildTerminal: false,
            effectiveRootStatus: "pending",
            effectiveRootStage: "pending",
            rootNotice: null,
            infraRetryCount: null,
            retryAfterSeconds: null,
            nextRetryAt: null,
            stages: [],
        };
    }
    const rootOutput = toRecord(rootLog.output_snapshot);
    const rootTiming = toRecord(rootLog.timing_breakdown || rootOutput?.timing_breakdown);
    const rootPersistedRefs = toRecord(rootLog.persisted_result_refs || rootOutput?.persisted_result_refs);
    const rootValidation = toRecord(rootLog.validation_meta);
    const rootFailureCode = String(rootValidation?.failure_code || rootOutput?.failure_code || "").trim();
    const autoRequeueScheduled = rootLog.status === "queued"
        && (rootValidation?.auto_requeue_scheduled === true || rootOutput?.auto_requeue_scheduled === true);
    const infraRetryCount = readNumber(rootValidation?.infra_retry_count ?? rootOutput?.infra_retry_count);
    const retryAfterSeconds = readNumber(rootValidation?.retry_after_seconds ?? rootOutput?.retry_after_seconds);
    const nextRetryAt = typeof (rootValidation?.next_retry_at ?? rootOutput?.next_retry_at) === "string"
        ? String(rootValidation?.next_retry_at ?? rootOutput?.next_retry_at)
        : null;
    const retrySummary = rootFailureCode === "rate_limited"
        ? "接口限流，系统稍后自动重试"
        : rootFailureCode === "upstream_timeout"
            ? "接口超时，系统稍后自动重试"
            : "等待重试中";
    const rootNotice = autoRequeueScheduled
        ? retrySummary
        : (String(rootValidation?.screening_result_state || rootFailureCode) === "screening_total_timeout"
            ? "初筛总耗时超过 300 秒，已终止"
            : null);
    const parseChild = pickLatestChildLog(runLogs, "resume_parse", rootLog.id);
    const scoreChild = pickLatestChildLog(runLogs, "resume_score", rootLog.id);
    const reusedExistingParse = rootOutput?.reused_existing_parse === true || rootValidation?.reused_existing_parse === true;
    const parseResultId = readNumber(
        rootOutput?.parse_result_id
        ?? rootPersistedRefs?.parse_result_id
        ?? toRecord(parseChild?.persisted_result_refs)?.parse_result_id,
    );
    const scoreResultId = readNumber(
        rootOutput?.score_result_id
        ?? rootPersistedRefs?.score_result_id
        ?? toRecord(scoreChild?.persisted_result_refs)?.score_result_id,
    );
    const hasFinalPersistedWrite = Boolean(
        scoreResultId != null
        || rootPersistedRefs?.candidate_status_after
        || rootPersistedRefs?.candidate_ai_recommended_status_after
    );
    const parseFallbackStatus = typeof rootOutput?.parse_status === "string"
        ? rootOutput.parse_status
        : (reusedExistingParse ? "reused" : (parseResultId ? "completed" : (rootLog.stage === "parsing" ? "running" : "pending")));
    const scoreFallbackStatus = typeof rootOutput?.score_status === "string"
        ? rootOutput.score_status
        : (scoreResultId ? "completed" : ((rootLog.stage === "scoring" || rootLog.stage === "validating") ? "running" : "pending"));
    const parseStatus = reusedExistingParse && !parseChild
        ? "reused"
        : normalizeChildStageStatus(parseChild, parseFallbackStatus);
    const scoreStatus = normalizeChildStageStatus(scoreChild, scoreFallbackStatus);
    const persistStatus = hasFinalPersistedWrite
        ? (rootLog.status === "cancelled"
            ? "cancelled"
            : (["failed", "invalid_result", "json_parse_failed", "timeout", "retry_exhausted", "rate_limited", "upstream_timeout", "request_failed"].includes(rootLog.status) ? "failed" : "completed"))
        : (typeof rootOutput?.persist_status === "string"
            ? rootOutput.persist_status
            : (rootLog.stage === "saving"
                ? "running"
                : (rootPersistedRefs ? (rootLog.status === "cancelled" ? "cancelled" : (["failed", "invalid_result", "json_parse_failed", "timeout", "retry_exhausted", "rate_limited", "upstream_timeout", "request_failed"].includes(rootLog.status) ? "failed" : "completed")) : "pending")));
    const parseDuration = readNumber(parseChild?.duration_ms) ?? readNumber(rootTiming?.parse_duration_ms);
    const scoreDuration = readNumber(scoreChild?.duration_ms) ?? readNumber(rootTiming?.score_duration_ms);
    const persistDuration = readNumber(rootTiming?.save_duration_ms);
    const inferredFromChildTerminal = Boolean(
        !autoRequeueScheduled
        &&
        !["success", "fallback", "failed", "invalid_result", "json_parse_failed", "timeout", "retry_exhausted", "cancelled"].includes(rootLog.status)
        && ((parseChild && ["success", "fallback", "failed", "cancelled", "rate_limited", "upstream_timeout", "request_failed"].includes(parseChild.status)) || (scoreChild && ["success", "fallback", "failed", "invalid_result", "cancelled", "rate_limited", "upstream_timeout", "request_failed"].includes(scoreChild.status)))
    );
    let effectiveRootStatus = String(rootLog.status || "pending");
    let effectiveRootStage = String(rootLog.stage || "pending");
    if (autoRequeueScheduled) {
        effectiveRootStatus = "queued";
        effectiveRootStage = "queued";
    } else if (persistStatus === "completed") {
        effectiveRootStatus = "success";
        effectiveRootStage = "completed";
    } else if (persistStatus === "failed" || scoreStatus === "failed" || parseStatus === "failed") {
        effectiveRootStatus = "failed";
        effectiveRootStage = "failed";
    } else if (persistStatus === "cancelled" || scoreStatus === "cancelled" || parseStatus === "cancelled") {
        effectiveRootStatus = "cancelled";
        effectiveRootStage = "cancelled";
    } else if (scoreStatus === "completed" && persistStatus === "running") {
        effectiveRootStatus = "running";
        effectiveRootStage = "saving";
    } else if (scoreStatus === "completed") {
        effectiveRootStatus = "running";
        effectiveRootStage = "saving";
    } else if (scoreStatus === "running") {
        effectiveRootStatus = "running";
        effectiveRootStage = "scoring";
    } else if (parseStatus === "completed" || parseStatus === "reused") {
        effectiveRootStatus = "running";
        effectiveRootStage = "scoring";
    } else if (parseStatus === "running") {
        effectiveRootStatus = "running";
        effectiveRootStage = "parsing";
    }

    return {
        parseChild,
        scoreChild,
        parseDetailLog: hasStageDebugContent(parseChild) ? parseChild : null,
        scoreDetailLog: hasStageDebugContent(scoreChild) ? scoreChild : (hasStageDebugContent(rootLog) ? rootLog : null),
        autoRequeueScheduled,
        inferredFromChildTerminal,
        effectiveRootStatus,
        effectiveRootStage,
        rootNotice,
        infraRetryCount,
        retryAfterSeconds,
        nextRetryAt,
        stages: [
            {
                key: "parse",
                title: reusedExistingParse ? "阶段1：复用已解析结果" : "阶段1：简历解析",
                status: parseStatus,
                detail: autoRequeueScheduled
                    ? (parseChild?.output_summary
                        ? `${parseChild.output_summary}；系统已安排自动重试。`
                        : retrySummary)
                    : reusedExistingParse && !parseChild
                    ? "本次默认复用了候选人的最新成功解析结果。"
                    : (parseChild?.output_summary || (parseResultId ? `已生成 parse_result_id = ${parseResultId}` : "尚未生成 parse_result。")),
                duration: parseDuration,
            },
            {
                key: "score",
                title: "阶段2：初筛评分",
                status: scoreStatus,
                detail: autoRequeueScheduled
                    ? (scoreChild?.output_summary
                        ? `${scoreChild.output_summary}；系统已安排自动重试。`
                        : retrySummary)
                    : (scoreChild?.output_summary || (scoreResultId ? `已生成 score_result_id = ${scoreResultId}` : "正在等待评分结果。")),
                duration: scoreDuration,
            },
            {
                key: "persist",
                title: "阶段3：结果写库",
                status: persistStatus,
                detail: autoRequeueScheduled
                    ? "本次尚未完成最终写库，系统已安排自动重试。"
                    : rootPersistedRefs
                    ? `候选人状态：${String(rootPersistedRefs.candidate_status_after || "未记录")}；最终来源：${String(rootValidation?.final_response_source || rootOutput?.final_response_source || "未记录")}`
                    : "尚未写入最终结果。",
                duration: persistDuration,
            },
        ],
    };
}
