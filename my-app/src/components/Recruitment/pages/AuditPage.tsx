"use client";

import React from "react";
import {ChevronDown, ChevronUp, Loader2, RefreshCw} from "lucide-react";

import type {
    AITaskLog,
    CandidateSummary,
    PositionSummary,
    RecruitmentSkill,
} from "@/lib/recruitment-api";
import {getCurrentLanguage, useI18n} from "@/lib/i18n";
import {cn} from "@/lib/utils";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import {
    EmptyState,
    Field,
    HoverRevealText,
    InfoTile,
    LoadingCard,
    LoadingPanel,
    NativeSelect,
} from "../components/SharedComponents";
import {aiTaskLabels} from "../types";
import {
    buildLogObjectLabel,
    formatDateTime,
    formatLongDateTime,
    formatStructuredValue,
    labelForMemorySource,
    labelForProvider,
    labelForScreeningTaskStage,
    labelForSkillResolutionSource,
    labelForTaskExecutionStatus,
    labelForTaskType,
    parseStructuredLogOutput,
    resolveLogSkillSnapshots,
    statusBadgeClass,
} from "../utils";
import {resolveAuditNoticePresentation} from "./auditNotice";
import {buildScreeningFlowAuditView} from "./auditFlowDetails";

type AuditListDisplayColumnWidths = {
    taskType: number;
    object: number;
    status: number;
    model: number;
    duration: number;
    time: number;
};

type VirtualAuditRowMetric = {
    logId: number;
    start: number;
    size: number;
};

type AuditTaskLogWithRunLogs = AITaskLog & {
    run_logs?: AITaskLog[] | null;
};

const AUDIT_LIST_ESTIMATED_ROW_HEIGHT = 54;
const AUDIT_LIST_OVERSCAN = 8;

function getAuditPageLocale(language = getCurrentLanguage()) {
    const isZh = language !== "en-US";
    return {
        retryQueued: isZh ? "排队重试中" : "Retry Queued",
        waitingRetry: isZh ? "等待重试" : "Waiting to Retry",
        noTaskSelected: isZh ? "未选择任务" : "No task selected",
        parseNoSkills: isZh ? "本任务为简历解析，不使用岗位初筛 Skills" : "Resume parsing does not use screening skills",
        skillsUsed: (names: string[]) => (isZh ? `本任务已使用 Skills：${names.join("、")}` : `Skills used: ${names.join(", ")}`),
        skillsExpectedButMissing: isZh ? "本任务应使用 Skills，但本次未解析到有效 Skills" : "Skills were expected but none were resolved",
        unrecorded: isZh ? "未记录" : "Unrecorded",
        promptSnapshotMissing: isZh ? "暂无 Prompt 快照" : "No prompt snapshot",
        fullRequestMissing: isZh ? "暂无完整模型请求" : "No full model request",
        rawResponseMissing: isZh ? "暂无模型原始响应" : "No raw model response",
        parsedJsonMissing: isZh ? "暂无解析后 JSON" : "No parsed JSON",
        sanitizedJsonMissing: isZh ? "暂无清洗后 JSON" : "No sanitized JSON",
        outputMissing: isZh ? "暂无完整输出" : "No full output",
        filterBarTitle: isZh ? "任务筛选条" : "Task Filter Bar",
        filterBarDesc: isZh ? "按任务类型和状态收拢 AI 任务，便于排查与复盘。" : "Filter AI tasks by type and status for debugging and review.",
        refreshing: isZh ? "刷新中..." : "Refreshing...",
        refreshTasks: isZh ? "刷新任务" : "Refresh Tasks",
        expandFilters: isZh ? "展开筛选" : "Expand Filters",
        collapseFilters: isZh ? "收起筛选" : "Collapse Filters",
        allTaskTypes: isZh ? "全部任务类型" : "All Task Types",
        allStatuses: isZh ? "全部状态" : "All Statuses",
        auditCenterTitle: isZh ? "任务审计中心" : "Task Audit Center",
        auditCenterDesc: isZh ? "展示任务类型、关联对象、状态、使用模型和执行时间。" : "Show task type, related object, status, model, and execution time.",
        loadingAuditLogs: isZh ? "正在加载 AI 审计日志" : "Loading AI audit logs",
        taskType: isZh ? "任务类型" : "Task Type",
        relatedObject: isZh ? "关联对象" : "Related Object",
        status: isZh ? "状态" : "Status",
        model: isZh ? "模型" : "Model",
        duration: isZh ? "耗时" : "Duration",
        time: isZh ? "时间" : "Time",
        noAuditLogs: isZh ? "暂无 AI 审计记录" : "No AI Audit Logs",
        noAuditLogsDesc: isZh ? "当招聘模块调用模型后，这里会沉淀成可追踪的任务日志。" : "Audit logs will appear here after recruiting tasks call the model.",
        loadingLogDetail: isZh ? "正在加载日志详情" : "Loading log details",
        currentStage: isZh ? "当前阶段" : "Current Stage",
        runId: "Run ID",
        skillUsage: isZh ? "技能使用情况" : "Skill Usage",
        memorySource: isZh ? "记忆来源" : "Memory Source",
        retryCount: isZh ? "已重试次数" : "Retry Count",
        retryAfter: isZh ? "下次重试间隔" : "Next Retry Delay",
        nextRetryTime: isZh ? "下次重试时间" : "Next Retry Time",
        taskFlow: isZh ? "任务链路" : "Task Flow",
        inferredTerminal: isZh ? "主流程状态未及时收口，已按子阶段结果推断展示。" : "The root flow did not settle in time; the UI is showing an inferred terminal state from child stages.",
        noRunFlow: isZh ? "本次未找到同 run 的任务链路。" : "No task flow was found for this run.",
        skillResolution: isZh ? "Skills 解析结果" : "Skill Resolution",
        sourceLine: (skillSource: string, memorySource: string) => (isZh ? `来源：${skillSource} · 记忆源：${memorySource}` : `Source: ${skillSource} · Memory: ${memorySource}`),
        dimensionCount: isZh ? "提炼维度数" : "Derived Dimensions",
        notApplicable: isZh ? "不适用" : "N/A",
        injectedPrompt: isZh ? "已注入评分 Prompt" : "Injected into Score Prompt",
        yes: isZh ? "是" : "Yes",
        no: isZh ? "否" : "No",
        source: isZh ? "来源" : "Source",
        noSkillResolutionDetail: isZh ? "暂无 Skills 解析详情" : "No skill resolution details",
        noSkillContent: isZh ? "暂无内容" : "No content",
        scoreRuleSnapshot: isZh ? "评分维度快照" : "Score Rule Snapshot",
        pointsSuffix: isZh ? " 分" : " pts",
        durationNotStarted: isZh ? "未开始" : "Not Started",
        durationInProgress: isZh ? "进行中" : "In Progress",
        durationStopping: isZh ? "停止中" : "Stopping",
        sourceSkillMissing: isZh ? "未记录来源 Skill" : "Source skill missing",
        coreDimension: isZh ? "核心维度" : "Core Dimension",
        nonCoreDimension: isZh ? "非核心维度" : "Non-core Dimension",
        noNotes: isZh ? "暂无说明" : "No notes",
        noRuleSnapshot: isZh ? "本次未记录评分维度快照。" : "No score rule snapshot was recorded.",
        timingBreakdown: isZh ? "耗时拆解" : "Timing Breakdown",
        queueWait: isZh ? "排队等待" : "Queue Wait",
        parseDuration: isZh ? "简历解析" : "Resume Parse",
        scoreDuration: isZh ? "模型评分" : "Model Score",
        validationDuration: isZh ? "结果校验" : "Validation",
        saveDuration: isZh ? "结果保存" : "Save",
        totalDuration: isZh ? "总耗时" : "Total Duration",
        inputSummary: isZh ? "输入摘要" : "Input Summary",
        outputSummary: isZh ? "输出摘要" : "Output Summary",
        errorMessage: isZh ? "错误信息" : "Error Message",
        none: isZh ? "无" : "None",
        schemaViolation: isZh ? "Schema 违规" : "Schema violation",
        stateExplanation: isZh ? "状态解释" : "State Explanation",
        noStateExplanation: isZh ? "暂无状态解释" : "No state explanation",
        persistedResults: isZh ? "最终写库结果" : "Persisted Result",
        noPersistedResults: isZh ? "暂无最终写库结果" : "No persisted result",
        parseStageDetail: isZh ? "阶段1：简历解析详情" : "Stage 1: Resume Parse Detail",
        parseReusedDetail: isZh ? "本次复用了已有解析结果，无单独解析模型调用。" : "An existing parse result was reused, so there was no separate parsing model call.",
        noParseDetail: isZh ? "当前暂无简历解析阶段的模型明细。" : "No model details for the parse stage are available.",
        scoreStageDetail: isZh ? "阶段2：初筛评分详情" : "Stage 2: Screening Score Detail",
        noScoreDetail: isZh ? "当前暂无初筛评分阶段的模型明细。" : "No model details for the scoring stage are available.",
        saveStageDetail: isZh ? "阶段3：结果写库详情" : "Stage 3: Persist Detail",
        finalSource: isZh ? "最终来源" : "Final Source",
        candidateStatus: isZh ? "候选人状态" : "Candidate Status",
        fullModelRequest: isZh ? "完整模型请求" : "Full Model Request",
        modelRawResponse: isZh ? "模型原始响应" : "Raw Model Response",
        parsedJson: isZh ? "解析后 JSON" : "Parsed JSON",
        sanitizedJson: isZh ? "清洗后 JSON" : "Sanitized JSON",
        fullOutput: isZh ? "完整输出" : "Full Output",
        selectTaskRecord: isZh ? "请选择一条任务记录" : "Select a Task Record",
        selectTaskRecordDesc: isZh ? "左侧点开任务后，这里会展示输入摘要、输出摘要、错误信息和 Skill 使用情况。" : "Select a task on the left to view its input, output, errors, and skill usage.",
        sourceLog: isZh ? "来源日志" : "Source Log",
        stage: isZh ? "阶段" : "Stage",
    };
}

function getAuditLocale() {
    const isZh = getCurrentLanguage() !== "en-US";
    return {
        screeningFlow: isZh ? "初筛流程" : "Screening Flow",
        pending: isZh ? "待执行" : "Pending",
        running: isZh ? "执行中" : "Running",
        completed: isZh ? "已完成" : "Completed",
        reused: isZh ? "已复用" : "Reused",
        failed: isZh ? "失败" : "Failed",
        cancelled: isZh ? "已停止" : "Stopped",
    };
}

function toRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function toRecordList(value: unknown) {
    return Array.isArray(value)
        ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        : [];
}

function readStringList(value: unknown) {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
        : [];
}

function labelForAuditLogTask(log?: AITaskLog | null) {
    const locale = getAuditLocale();
    if (!log) {
        return labelForTaskType();
    }
    if (log.task_type === "screening_flow") {
        return locale.screeningFlow;
    }
    const isRootScreeningLog = Boolean(log.screening_run_id) && (
        (typeof log.root_task_id === "number" && log.id === log.root_task_id)
        || (log.root_task_id == null && log.parent_task_id == null && log.task_type === "resume_score")
    );
    return isRootScreeningLog ? locale.screeningFlow : labelForTaskType(log.task_type);
}

function isUserVisibleAuditLog(log: AITaskLog) {
    if (log.task_type === "screening_flow") {
        return true;
    }
    if (log.task_type === "resume_parse") {
        return !log.screening_run_id && (log.parent_task_id == null);
    }
    if (log.task_type === "resume_score") {
        return !log.screening_run_id && (log.parent_task_id == null);
    }
    return true;
}

function labelForFlowStageStatus(status?: string | null) {
    const locale = getAuditLocale();
    switch (status) {
        case "pending":
            return locale.pending;
        case "running":
            return locale.running;
        case "completed":
            return locale.completed;
        case "reused":
            return locale.reused;
        case "failed":
            return locale.failed;
        case "cancelled":
            return locale.cancelled;
        default:
            return status || "-";
    }
}

function formatDurationValue(value: unknown) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return "-";
    }
    if (numeric >= 1000) {
        return `${(numeric / 1000).toFixed(1)}s`;
    }
    return `${Math.round(numeric)}ms`;
}

function hasAuditText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function formatAuditStageLabel(stage?: string | null) {
    return hasAuditText(stage) ? labelForScreeningTaskStage(stage) : null;
}

function formatAuditModelLabel(
    log: Pick<AITaskLog, "model_provider" | "model_name">,
    unrecordedLabel: string,
) {
    const providerLabel = hasAuditText(log.model_provider) ? labelForProvider(log.model_provider) : "";
    const modelName = hasAuditText(log.model_name) ? log.model_name.trim() : "";
    if (providerLabel && modelName) {
        return `${providerLabel} · ${modelName}`;
    }
    return providerLabel || modelName || unrecordedLabel;
}

function formatAuditDurationLabel(
    log: Pick<AITaskLog, "duration_ms" | "status">,
    labels: {
        unrecorded: string;
        notStarted: string;
        inProgress: string;
        stopping: string;
    },
) {
    if (log.status === "pending" || log.status === "queued") {
        return labels.notStarted;
    }
    if (log.status === "running") {
        return labels.inProgress;
    }
    if (log.status === "cancelling") {
        return labels.stopping;
    }
    if (typeof log.duration_ms === "number" && Number.isFinite(log.duration_ms)) {
        return formatDurationValue(log.duration_ms);
    }
    return labels.unrecorded;
}

function findVirtualAuditRowStartIndex(metrics: VirtualAuditRowMetric[], scrollTop: number) {
    let low = 0;
    let high = metrics.length - 1;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const row = metrics[mid];

        if (row.start + row.size < scrollTop) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return Math.max(0, Math.min(metrics.length - 1, low));
}

type AuditPageProps = {
    panelClass: string;
    auditFiltersCollapsed: boolean;
    auditFilterSummary: string;
    logsLoading: boolean;
    logTaskTypeFilter: string;
    logStatusFilter: string;
    aiLogs: AITaskLog[];
    selectedLogId: number | null;
    selectedLogDetail: AITaskLog | null;
    logDetailLoading: boolean;
    auditListTableWidth: number;
    auditListDisplayColumnWidths: AuditListDisplayColumnWidths;
    positionMap: Map<number, PositionSummary>;
    candidateMap: Map<number, CandidateSummary>;
    skillMap: Map<number, RecruitmentSkill>;
    refreshLogsWithFeedback: () => Promise<void>;
    setAuditFiltersCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    setLogTaskTypeFilter: React.Dispatch<React.SetStateAction<string>>;
    setLogStatusFilter: React.Dispatch<React.SetStateAction<string>>;
    setSelectedLogId: React.Dispatch<React.SetStateAction<number | null>>;
    auditListScrollRef: (node: HTMLDivElement | null) => void;
    auditListHorizontalRailRef: (node: HTMLDivElement | null) => void;
};

export function AuditPage({
    panelClass,
    auditFiltersCollapsed,
    auditFilterSummary,
    logsLoading,
    logTaskTypeFilter,
    logStatusFilter,
    aiLogs,
    selectedLogId,
    selectedLogDetail,
    logDetailLoading,
    auditListTableWidth,
    auditListDisplayColumnWidths,
    positionMap,
    candidateMap,
    skillMap,
    refreshLogsWithFeedback,
    setAuditFiltersCollapsed,
    setLogTaskTypeFilter,
    setLogStatusFilter,
    setSelectedLogId,
    auditListScrollRef,
    auditListHorizontalRailRef,
}: AuditPageProps) {
    const { language } = useI18n();
    const tr = React.useMemo(() => getAuditPageLocale(language), [language]);
    const [auditListViewportEl, setAuditListViewportEl] = React.useState<HTMLDivElement | null>(null);
    const [auditListScrollTop, setAuditListScrollTop] = React.useState(0);
    const [auditListViewportHeight, setAuditListViewportHeight] = React.useState(0);
    const [auditListMeasuredRowHeights, setAuditListMeasuredRowHeights] = React.useState<Record<number, number>>({});
    const auditListMetricsFrameRef = React.useRef<number | null>(null);
    const auditListRowObserversRef = React.useRef<Map<number, ResizeObserver>>(new Map());
    const selectedLogSkillSnapshots = selectedLogDetail ? resolveLogSkillSnapshots(selectedLogDetail, skillMap) : [];
    const selectedLogOutputSnapshot = React.useMemo(
        () => parseStructuredLogOutput(selectedLogDetail?.output_snapshot),
        [selectedLogDetail?.output_snapshot],
    );
    const selectedLogOutputRecord = React.useMemo(
        () => toRecord(selectedLogOutputSnapshot),
        [selectedLogOutputSnapshot],
    );
    const visibleAuditLogs = React.useMemo(
        () => aiLogs.filter(isUserVisibleAuditLog),
        [aiLogs],
    );
    const auditTaskTypeOptions = React.useMemo(
        () => ({
            screening_flow: getAuditLocale().screeningFlow,
            ...aiTaskLabels,
        }),
        [language],
    );
    const selectedLogRunLogs = React.useMemo(() => {
        const detail = selectedLogDetail as AuditTaskLogWithRunLogs | null;
        return Array.isArray(detail?.run_logs)
            ? detail.run_logs.filter((item): item is AITaskLog => Boolean(item) && typeof item === "object")
            : [];
    }, [selectedLogDetail]);
    const selectedRunLogs = React.useMemo(() => {
        if (selectedLogRunLogs.length) {
            return selectedLogRunLogs
                .slice()
                .sort((left, right) => {
                    const leftTime = new Date(left.created_at || 0).getTime();
                    const rightTime = new Date(right.created_at || 0).getTime();
                    return leftTime - rightTime || left.id - right.id;
                });
        }
        if (!selectedLogDetail?.screening_run_id) {
            return selectedLogDetail ? [selectedLogDetail] : [];
        }
        return aiLogs
            .filter((log) => log.screening_run_id === selectedLogDetail.screening_run_id)
            .sort((left, right) => {
                const leftTime = new Date(left.created_at || 0).getTime();
                const rightTime = new Date(right.created_at || 0).getTime();
                return leftTime - rightTime || left.id - right.id;
            });
    }, [aiLogs, selectedLogDetail, selectedLogRunLogs]);
    const selectedScoreRuleSnapshot = React.useMemo(
        () => toRecordList(selectedLogDetail?.score_rule_snapshot || selectedLogOutputRecord?.score_rule_snapshot),
        [selectedLogDetail?.score_rule_snapshot, selectedLogOutputRecord],
    );
    const selectedTimingBreakdown = React.useMemo(
        () => toRecord(selectedLogDetail?.timing_breakdown || selectedLogOutputRecord?.timing_breakdown),
        [selectedLogDetail?.timing_breakdown, selectedLogOutputRecord],
    );
    const selectedValidationMeta = React.useMemo(
        () => toRecord(selectedLogDetail?.validation_meta),
        [selectedLogDetail?.validation_meta],
    );
    const selectedInvalidResultReasons = React.useMemo(
        () => readStringList(selectedValidationMeta?.invalid_result_reasons),
        [selectedValidationMeta],
    );
    const selectedModelSchemaViolationReason = React.useMemo(() => {
        const direct = typeof selectedValidationMeta?.model_schema_violation_reason === "string"
            ? selectedValidationMeta.model_schema_violation_reason.trim()
            : "";
        return direct || "";
    }, [selectedValidationMeta]);
    const selectedInvalidResultSummary = React.useMemo(() => {
        const outputSummary = typeof selectedLogOutputRecord?.invalid_result_summary === "string"
            ? selectedLogOutputRecord.invalid_result_summary.trim()
            : "";
        const validationSummary = typeof selectedValidationMeta?.invalid_result_summary === "string"
            ? selectedValidationMeta.invalid_result_summary.trim()
            : "";
        return outputSummary || validationSummary || selectedInvalidResultReasons[0] || "";
    }, [selectedInvalidResultReasons, selectedLogOutputRecord, selectedValidationMeta]);
    const selectedAuditNotice = React.useMemo(() => resolveAuditNoticePresentation({
        screeningResultState: typeof selectedValidationMeta?.screening_result_state === "string"
            ? selectedValidationMeta.screening_result_state
            : null,
        screeningResultValid: typeof selectedValidationMeta?.screening_result_valid === "boolean"
            ? selectedValidationMeta.screening_result_valid
            : null,
        invalidResultReasons: selectedInvalidResultReasons,
        invalidResultSummary: selectedInvalidResultSummary,
        modelSchemaViolationReason: selectedModelSchemaViolationReason,
    }), [
        selectedInvalidResultReasons,
        selectedInvalidResultSummary,
        selectedModelSchemaViolationReason,
        selectedValidationMeta,
    ]);
    const selectedPromptRuleDimensionCount = React.useMemo(() => {
        const direct = selectedLogOutputRecord?.prompt_rule_dimension_count;
        if (typeof direct === "number" && Number.isFinite(direct)) {
            return direct;
        }
        if (typeof direct === "string") {
            const numeric = Number(direct);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }
        return selectedScoreRuleSnapshot.length;
    }, [selectedLogOutputRecord, selectedScoreRuleSnapshot.length]);
    const selectedSkillsAppliedToPrompt = React.useMemo(() => {
        const direct = selectedLogOutputRecord?.skills_applied_to_prompt;
        if (typeof direct === "boolean") {
            return direct;
        }
        return selectedScoreRuleSnapshot.length > 0;
    }, [selectedLogOutputRecord, selectedScoreRuleSnapshot.length]);
    const selectedPersistedResultRefs = React.useMemo(
        () => toRecord(selectedLogDetail?.persisted_result_refs || selectedLogOutputRecord?.persisted_result_refs),
        [selectedLogDetail?.persisted_result_refs, selectedLogOutputRecord],
    );
    const selectedFlowAuditView = React.useMemo(
        () => selectedLogDetail?.task_type === "screening_flow"
            ? buildScreeningFlowAuditView(selectedLogDetail, selectedRunLogs)
            : null,
        [selectedLogDetail, selectedRunLogs],
    );
    const selectedFlowStages = React.useMemo(
        () => selectedFlowAuditView?.stages || [],
        [selectedFlowAuditView],
    );
    const selectedDisplayTaskStatus = selectedFlowAuditView?.effectiveRootStatus || selectedLogDetail?.status || "pending";
    const selectedDisplayTaskStage = selectedFlowAuditView?.effectiveRootStage || selectedLogDetail?.stage || null;
    const selectedDisplayTaskStatusLabel = selectedFlowAuditView?.autoRequeueScheduled
        ? tr.retryQueued
        : labelForTaskExecutionStatus(selectedDisplayTaskStatus);
    const selectedDisplayTaskStageLabel = selectedFlowAuditView?.autoRequeueScheduled
        ? tr.waitingRetry
        : formatAuditStageLabel(selectedDisplayTaskStage);
    const selectedRootNotice = selectedFlowAuditView?.rootNotice || null;
    const selectedRootNoticeClassName = selectedFlowAuditView?.autoRequeueScheduled
        ? "mt-3 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100"
        : "mt-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100";
    const selectedInfraRetryCount = selectedFlowAuditView?.infraRetryCount ?? null;
    const selectedRetryAfterSeconds = selectedFlowAuditView?.retryAfterSeconds ?? null;
    const selectedNextRetryAt = selectedFlowAuditView?.nextRetryAt || null;
    const selectedParseDetailLog = selectedFlowAuditView?.parseDetailLog || null;
    const selectedScoreDetailLog = selectedFlowAuditView?.scoreDetailLog || null;
    const selectedModelLabel = React.useMemo(
        () => formatAuditModelLabel(
            {
                model_provider: selectedLogDetail?.model_provider || selectedScoreDetailLog?.model_provider || null,
                model_name: selectedLogDetail?.model_name || selectedScoreDetailLog?.model_name || null,
            },
            tr.unrecorded,
        ),
        [
            selectedLogDetail?.model_name,
            selectedLogDetail?.model_provider,
            selectedScoreDetailLog?.model_name,
            selectedScoreDetailLog?.model_provider,
            tr.unrecorded,
        ],
    );
    const selectedSkillResolutionDetail = React.useMemo(
        () => toRecord(selectedLogDetail?.skill_resolution_detail || selectedLogOutputRecord?.skill_resolution_detail),
        [selectedLogDetail?.skill_resolution_detail, selectedLogOutputRecord],
    );
    const selectedSkillNames = React.useMemo(() => (
        selectedLogSkillSnapshots.length
            ? selectedLogSkillSnapshots.map((skill) => skill.name || `Skill #${skill.id}`)
            : readStringList(selectedSkillResolutionDetail?.resolved_skill_names)
    ), [selectedLogSkillSnapshots, selectedSkillResolutionDetail]);
    const selectedSkillUsageText = React.useMemo(() => {
        if (!selectedLogDetail) {
            return tr.noTaskSelected;
        }
        if (selectedLogDetail.task_type === "resume_parse") {
            return tr.parseNoSkills;
        }
        if (selectedSkillNames.length > 0) {
            return tr.skillsUsed(selectedSkillNames);
        }
        return tr.skillsExpectedButMissing;
    }, [selectedLogDetail, selectedSkillNames, tr]);
    const isSelectedScreeningFlow = selectedLogDetail?.task_type === "screening_flow";

    function renderStageModelDetails(label: string, log: AITaskLog | null, emptyText: string) {
        return (
            <Field label={label}>
                <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <InfoTile label={tr.sourceLog} value={log ? `#${log.id} / ${labelForAuditLogTask(log)}` : tr.unrecorded}/>
                        <InfoTile label={tr.stage} value={log ? (formatAuditStageLabel(log.stage) || tr.unrecorded) : tr.unrecorded}/>
                        <InfoTile label={tr.status} value={log ? labelForTaskExecutionStatus(log.status) : tr.unrecorded}/>
                        <InfoTile
                            label={tr.duration}
                            value={log ? formatAuditDurationLabel(log, {
                                unrecorded: tr.unrecorded,
                                notStarted: tr.durationNotStarted,
                                inProgress: tr.durationInProgress,
                                stopping: tr.durationStopping,
                            }) : tr.unrecorded}
                        />
                    </div>
                    {log ? (
                        <>
                            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                <pre className="whitespace-pre-wrap break-words">{log.prompt_snapshot || tr.promptSnapshotMissing}</pre>
                            </div>
                            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                <pre className="whitespace-pre-wrap break-words">{log.full_request_snapshot || tr.fullRequestMissing}</pre>
                            </div>
                            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                <pre className="whitespace-pre-wrap break-words">{log.raw_response_text || tr.rawResponseMissing}</pre>
                            </div>
                            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                <pre className="whitespace-pre-wrap break-words">{formatStructuredValue(log.parsed_response_json, tr.parsedJsonMissing)}</pre>
                            </div>
                            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                <pre className="whitespace-pre-wrap break-words">{formatStructuredValue(log.sanitized_response_json, tr.sanitizedJsonMissing)}</pre>
                            </div>
                            <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                <pre className="whitespace-pre-wrap break-words">{formatStructuredValue(log.output_snapshot, log.output_summary || tr.outputMissing)}</pre>
                            </div>
                        </>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            {emptyText}
                        </div>
                    )}
                </div>
            </Field>
        );
    }

    const mergedAuditListScrollRef = React.useCallback((node: HTMLDivElement | null) => {
        setAuditListViewportEl(node);
        auditListScrollRef(node);
    }, [auditListScrollRef]);

    React.useEffect(() => {
        if (!auditListViewportEl) {
            setAuditListScrollTop(0);
            setAuditListViewportHeight(0);
            return;
        }

        const updateMetrics = () => {
            setAuditListScrollTop(auditListViewportEl.scrollTop);
            setAuditListViewportHeight(auditListViewportEl.clientHeight);
        };

        const scheduleMetricsUpdate = () => {
            if (auditListMetricsFrameRef.current != null) {
                return;
            }
            auditListMetricsFrameRef.current = window.requestAnimationFrame(() => {
                auditListMetricsFrameRef.current = null;
                updateMetrics();
            });
        };

        updateMetrics();
        auditListViewportEl.addEventListener("scroll", scheduleMetricsUpdate, {passive: true});

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", scheduleMetricsUpdate);
            return () => {
                auditListViewportEl.removeEventListener("scroll", scheduleMetricsUpdate);
                window.removeEventListener("resize", scheduleMetricsUpdate);
                if (auditListMetricsFrameRef.current != null) {
                    window.cancelAnimationFrame(auditListMetricsFrameRef.current);
                    auditListMetricsFrameRef.current = null;
                }
            };
        }

        const observer = new ResizeObserver(() => scheduleMetricsUpdate());
        observer.observe(auditListViewportEl);

        return () => {
            auditListViewportEl.removeEventListener("scroll", scheduleMetricsUpdate);
            observer.disconnect();
            if (auditListMetricsFrameRef.current != null) {
                window.cancelAnimationFrame(auditListMetricsFrameRef.current);
                auditListMetricsFrameRef.current = null;
            }
        };
    }, [auditListViewportEl]);

    React.useEffect(() => {
        setAuditListMeasuredRowHeights({});
    }, [visibleAuditLogs, auditListTableWidth]);

    React.useEffect(() => {
        if (!visibleAuditLogs.length) {
            if (selectedLogId != null) {
                setSelectedLogId(null);
            }
            return;
        }
        if (selectedLogId == null || !visibleAuditLogs.some((item) => item.id === selectedLogId)) {
            setSelectedLogId(visibleAuditLogs[0].id);
        }
    }, [selectedLogId, setSelectedLogId, visibleAuditLogs]);

    React.useEffect(() => {
        const rowObservers = auditListRowObserversRef.current;
        return () => {
            rowObservers.forEach((observer) => observer.disconnect());
            rowObservers.clear();
        };
    }, []);

    const auditListVirtualMetrics = React.useMemo(() => {
        let totalHeight = 0;
        const metrics: VirtualAuditRowMetric[] = visibleAuditLogs.map((log) => {
            const size = auditListMeasuredRowHeights[log.id] || AUDIT_LIST_ESTIMATED_ROW_HEIGHT;
            const metric = {
                logId: log.id,
                start: totalHeight,
                size,
            };
            totalHeight += size;
            return metric;
        });

        if (!metrics.length) {
            return {
                totalHeight: 0,
                topSpacerHeight: 0,
                bottomSpacerHeight: 0,
                startIndex: 0,
                endIndex: -1,
            };
        }

        const viewportHeight = auditListViewportHeight || Math.min(metrics.length, 12) * AUDIT_LIST_ESTIMATED_ROW_HEIGHT;
        const visibleStartIndex = findVirtualAuditRowStartIndex(metrics, Math.max(0, auditListScrollTop));
        let visibleEndIndex = visibleStartIndex;
        const visibleBottom = auditListScrollTop + viewportHeight;

        while (visibleEndIndex < metrics.length - 1 && metrics[visibleEndIndex].start + metrics[visibleEndIndex].size < visibleBottom) {
            visibleEndIndex += 1;
        }

        const startIndex = Math.max(0, visibleStartIndex - AUDIT_LIST_OVERSCAN);
        const endIndex = Math.min(metrics.length - 1, visibleEndIndex + AUDIT_LIST_OVERSCAN);
        const startMetric = metrics[startIndex];
        const endMetric = metrics[endIndex];
        const topSpacerHeight = startMetric?.start || 0;
        const bottomSpacerHeight = Math.max(0, totalHeight - (endMetric.start + endMetric.size));

        return {
            totalHeight,
            topSpacerHeight,
            bottomSpacerHeight,
            startIndex,
            endIndex,
        };
    }, [visibleAuditLogs, auditListMeasuredRowHeights, auditListScrollTop, auditListViewportHeight]);

    const visibleAuditLogWindow = React.useMemo(() => {
        if (auditListVirtualMetrics.endIndex < auditListVirtualMetrics.startIndex) {
            return [];
        }
        return visibleAuditLogs.slice(auditListVirtualMetrics.startIndex, auditListVirtualMetrics.endIndex + 1);
    }, [visibleAuditLogs, auditListVirtualMetrics.endIndex, auditListVirtualMetrics.startIndex]);

    const createAuditRowMeasureRef = React.useCallback((logId: number) => {
        return (node: HTMLTableRowElement | null) => {
            const existingObserver = auditListRowObserversRef.current.get(logId);
            if (existingObserver) {
                existingObserver.disconnect();
                auditListRowObserversRef.current.delete(logId);
            }

            if (!node) {
                return;
            }

            const measureRow = () => {
                const nextHeight = Math.ceil(node.getBoundingClientRect().height);
                setAuditListMeasuredRowHeights((current) => (
                    current[logId] === nextHeight
                        ? current
                        : {
                            ...current,
                            [logId]: nextHeight,
                        }
                ));
            };

            measureRow();

            if (typeof ResizeObserver === "undefined") {
                return;
            }

            const observer = new ResizeObserver(() => measureRow());
            observer.observe(node);
            auditListRowObserversRef.current.set(logId, observer);
        };
    }, []);

    return (
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6 overflow-hidden">
            <Card className={panelClass}>
                <CardContent className={cn("px-6", auditFiltersCollapsed ? "py-4" : "py-6")}>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tr.filterBarTitle}</p>
                                <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{auditFiltersCollapsed ? auditFilterSummary : tr.filterBarDesc}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" onClick={() => void refreshLogsWithFeedback()} disabled={logsLoading}>
                                    {logsLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
                                    {logsLoading ? tr.refreshing : tr.refreshTasks}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setAuditFiltersCollapsed((current) => !current)}
                                >
                                    {auditFiltersCollapsed ? <ChevronDown className="h-4 w-4"/> : <ChevronUp className="h-4 w-4"/>}
                                    {auditFiltersCollapsed ? tr.expandFilters : tr.collapseFilters}
                                </Button>
                            </div>
                        </div>
                        {!auditFiltersCollapsed ? (
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr]">
                                <NativeSelect value={logTaskTypeFilter} onChange={(event) => setLogTaskTypeFilter(event.target.value)}>
                                    <option value="all">{tr.allTaskTypes}</option>
                                    {Object.entries(auditTaskTypeOptions).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <NativeSelect value={logStatusFilter} onChange={(event) => setLogStatusFilter(event.target.value)}>
                                    <option value="all">{tr.allStatuses}</option>
                                    <option value="pending">pending</option>
                                    <option value="queued">queued</option>
                                    <option value="success">success</option>
                                    <option value="fallback">fallback</option>
                                    <option value="running">running</option>
                                    <option value="cancelling">cancelling</option>
                                    <option value="cancelled">cancelled</option>
                                    <option value="invalid_result">invalid_result</option>
                                    <option value="json_parse_failed">json_parse_failed</option>
                                    <option value="timeout">timeout</option>
                                    <option value="retry_exhausted">retry_exhausted</option>
                                    <option value="failed">failed</option>
                                </NativeSelect>
                            </div>
                        ) : null}
                    </div>
                </CardContent>
            </Card>

            <div className="grid min-h-0 items-stretch gap-6 overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(540px,42%)] 2xl:grid-cols-[minmax(0,1fr)_minmax(680px,45%)]">
                <Card className={cn(panelClass, "flex min-h-0 flex-col overflow-hidden")}>
                    <CardHeader className="pb-0">
                        <CardTitle className="text-lg">{tr.auditCenterTitle}</CardTitle>
                        <CardDescription>{tr.auditCenterDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col pt-6">
                        {logsLoading ? (
                            <LoadingCard label={tr.loadingAuditLogs}/>
                        ) : (
                            <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
                                <div
                                    ref={mergedAuditListScrollRef}
                                    className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.9)_transparent] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:bg-clip-content hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 dark:[scrollbar-color:rgba(71,85,105,0.95)_transparent] dark:[&::-webkit-scrollbar-thumb]:bg-slate-700 dark:hover:[&::-webkit-scrollbar-thumb]:bg-slate-600"
                                >
                                    <div style={{width: auditListTableWidth, minWidth: auditListTableWidth}}>
                                        <Table className="table-fixed" style={{width: auditListTableWidth, minWidth: auditListTableWidth}}>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead style={{width: auditListDisplayColumnWidths.taskType, minWidth: auditListDisplayColumnWidths.taskType, maxWidth: auditListDisplayColumnWidths.taskType}} className="whitespace-nowrap">{tr.taskType}</TableHead>
                                                    <TableHead style={{width: auditListDisplayColumnWidths.object, minWidth: auditListDisplayColumnWidths.object, maxWidth: auditListDisplayColumnWidths.object}} className="whitespace-nowrap">{tr.relatedObject}</TableHead>
                                                    <TableHead style={{width: auditListDisplayColumnWidths.status, minWidth: auditListDisplayColumnWidths.status, maxWidth: auditListDisplayColumnWidths.status}} className="whitespace-nowrap">{tr.status}</TableHead>
                                                    <TableHead style={{width: auditListDisplayColumnWidths.model, minWidth: auditListDisplayColumnWidths.model, maxWidth: auditListDisplayColumnWidths.model}} className="whitespace-nowrap">{tr.model}</TableHead>
                                                    <TableHead style={{width: auditListDisplayColumnWidths.duration, minWidth: auditListDisplayColumnWidths.duration, maxWidth: auditListDisplayColumnWidths.duration}} className="whitespace-nowrap">{tr.duration}</TableHead>
                                                    <TableHead style={{width: auditListDisplayColumnWidths.time, minWidth: auditListDisplayColumnWidths.time, maxWidth: auditListDisplayColumnWidths.time}} className="whitespace-nowrap text-right">{tr.time}</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {visibleAuditLogs.length ? (
                                                    <>
                                                        {auditListVirtualMetrics.topSpacerHeight > 0 ? (
                                                            <TableRow aria-hidden="true" className="border-0">
                                                                <TableCell
                                                                    colSpan={6}
                                                                    className="h-0 p-0"
                                                                    style={{height: auditListVirtualMetrics.topSpacerHeight, border: 0}}
                                                                />
                                                            </TableRow>
                                                        ) : null}
                                                        {visibleAuditLogWindow.map((log) => {
                                                            const stageLabel = formatAuditStageLabel(log.stage);
                                                            const modelLabel = formatAuditModelLabel(log, tr.unrecorded);
                                                            const durationLabel = formatAuditDurationLabel(log, {
                                                                unrecorded: tr.unrecorded,
                                                                notStarted: tr.durationNotStarted,
                                                                inProgress: tr.durationInProgress,
                                                                stopping: tr.durationStopping,
                                                            });
                                                            return (
                                                                <TableRow
                                                                    key={log.id}
                                                                    ref={createAuditRowMeasureRef(log.id)}
                                                                    className={cn("cursor-pointer", selectedLogId === log.id && "bg-slate-100 dark:bg-slate-900")}
                                                                    onClick={() => setSelectedLogId(log.id)}
                                                                >
                                                                    <TableCell style={{width: auditListDisplayColumnWidths.taskType, minWidth: auditListDisplayColumnWidths.taskType, maxWidth: auditListDisplayColumnWidths.taskType}}>
                                                                        <HoverRevealText text={labelForAuditLogTask(log)}/>
                                                                    </TableCell>
                                                                    <TableCell style={{width: auditListDisplayColumnWidths.object, minWidth: auditListDisplayColumnWidths.object, maxWidth: auditListDisplayColumnWidths.object}}>
                                                                        <HoverRevealText text={buildLogObjectLabel(log, positionMap, candidateMap, skillMap)}/>
                                                                    </TableCell>
                                                                    <TableCell style={{width: auditListDisplayColumnWidths.status, minWidth: auditListDisplayColumnWidths.status, maxWidth: auditListDisplayColumnWidths.status}}>
                                                                        <div className="space-y-1">
                                                                            <Badge className={cn("rounded-full border", statusBadgeClass("task", log.status))}>
                                                                                {labelForTaskExecutionStatus(log.status)}
                                                                            </Badge>
                                                                            {stageLabel ? (
                                                                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                                                                    {stageLabel}
                                                                                </p>
                                                                            ) : null}
                                                                        </div>
                                                                    </TableCell>
                                                                    <TableCell style={{width: auditListDisplayColumnWidths.model, minWidth: auditListDisplayColumnWidths.model, maxWidth: auditListDisplayColumnWidths.model}}>
                                                                        <HoverRevealText text={modelLabel}/>
                                                                    </TableCell>
                                                                    <TableCell style={{width: auditListDisplayColumnWidths.duration, minWidth: auditListDisplayColumnWidths.duration, maxWidth: auditListDisplayColumnWidths.duration}} className="tabular-nums">
                                                                        {durationLabel}
                                                                    </TableCell>
                                                                    <TableCell style={{width: auditListDisplayColumnWidths.time, minWidth: auditListDisplayColumnWidths.time, maxWidth: auditListDisplayColumnWidths.time}} className="whitespace-nowrap pr-4 text-right tabular-nums">
                                                                        {formatDateTime(log.created_at)}
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                        {auditListVirtualMetrics.bottomSpacerHeight > 0 ? (
                                                            <TableRow aria-hidden="true" className="border-0">
                                                                <TableCell
                                                                    colSpan={6}
                                                                    className="h-0 p-0"
                                                                    style={{height: auditListVirtualMetrics.bottomSpacerHeight, border: 0}}
                                                                />
                                                            </TableRow>
                                                        ) : null}
                                                    </>
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={6}>
                                                            <EmptyState title={tr.noAuditLogs} description={tr.noAuditLogsDesc}/>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                                <div className="shrink-0 border-t border-slate-200/80 pt-2 dark:border-slate-800">
                                    <div
                                        ref={auditListHorizontalRailRef}
                                        className="overflow-x-auto overflow-y-hidden [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.95)_transparent] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[scrollbar-color:rgba(71,85,105,0.98)_transparent] dark:[&::-webkit-scrollbar-track]:bg-slate-900/80 dark:[&::-webkit-scrollbar-thumb]:border-slate-900 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700"
                                    >
                                        <div style={{width: auditListTableWidth, height: 1}}/>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className={cn(panelClass, "min-h-0 overflow-hidden")}>
                    {logDetailLoading ? <LoadingPanel label={tr.loadingLogDetail}/> : selectedLogDetail ? (
                        <div className="flex h-full min-h-0 flex-1 flex-col">
                            <div className="border-b border-slate-200/80 px-6 py-5 dark:border-slate-800">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge className={cn("rounded-full border", statusBadgeClass("task", selectedDisplayTaskStatus))}>
                                        {selectedDisplayTaskStatusLabel}
                                    </Badge>
                                    <Badge variant="outline" className="rounded-full">{labelForAuditLogTask(selectedLogDetail)}</Badge>
                                    {selectedDisplayTaskStageLabel ? (
                                        <Badge variant="outline" className="rounded-full">{selectedDisplayTaskStageLabel}</Badge>
                                    ) : null}
                                </div>
                                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                    {buildLogObjectLabel(selectedLogDetail, positionMap, candidateMap, skillMap)}
                                </h3>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                    {selectedModelLabel} · {formatLongDateTime(selectedLogDetail.created_at)}
                                </p>
                                {selectedRootNotice ? (
                                    <div className={selectedRootNoticeClassName}>
                                        {selectedRootNotice}
                                    </div>
                                ) : null}
                                {!selectedRootNotice && !selectedFlowAuditView?.autoRequeueScheduled && selectedInvalidResultSummary ? (
                                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                                        {selectedInvalidResultSummary}
                                    </div>
                                ) : null}
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                                <div className="min-w-0 space-y-5 px-6 py-6">
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <InfoTile label={tr.currentStage} value={selectedDisplayTaskStageLabel || tr.unrecorded}/>
                                        <InfoTile label={tr.runId} value={selectedLogDetail.screening_run_id || tr.unrecorded}/>
                                        <InfoTile label={tr.skillUsage} value={selectedSkillUsageText}/>
                                        <InfoTile label={tr.memorySource} value={labelForMemorySource(selectedLogDetail.memory_source)}/>
                                    </div>
                                    {selectedFlowAuditView?.autoRequeueScheduled ? (
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <InfoTile label={tr.retryCount} value={selectedInfraRetryCount != null ? `${selectedInfraRetryCount}` : tr.unrecorded}/>
                                            <InfoTile label={tr.retryAfter} value={selectedRetryAfterSeconds != null ? `${selectedRetryAfterSeconds}s` : tr.unrecorded}/>
                                            <InfoTile label={tr.nextRetryTime} value={selectedNextRetryAt ? formatLongDateTime(selectedNextRetryAt) : tr.unrecorded}/>
                                        </div>
                                    ) : null}
                                    <Field label={tr.taskFlow}>
                                        <div className="space-y-3">
                                            {selectedFlowAuditView?.inferredFromChildTerminal ? (
                                                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                                                    {tr.inferredTerminal}
                                                </div>
                                            ) : null}
                                            {selectedFlowStages.length ? selectedFlowStages.map((stage) => (
                                                <div key={stage.key} className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="space-y-1">
                                                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                                {stage.title}
                                                            </p>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                                {stage.detail}
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Badge variant="outline" className="rounded-full">{formatDurationValue(stage.duration)}</Badge>
                                                            <Badge className={cn("rounded-full border", statusBadgeClass("task", stage.status === "failed" ? "failed" : stage.status === "cancelled" ? "cancelled" : stage.status === "running" ? "running" : "success"))}>
                                                                {labelForFlowStageStatus(stage.status)}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </div>
                                            )) : selectedRunLogs.length ? selectedRunLogs.map((log) => (
                                                <div key={log.id} className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="space-y-1">
                                                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                                {labelForAuditLogTask(log)} / {labelForScreeningTaskStage(log.stage)}
                                                            </p>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                                #{log.id} · {buildLogObjectLabel(log, positionMap, candidateMap, skillMap)}
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Badge variant="outline" className="rounded-full">{labelForScreeningTaskStage(log.stage)}</Badge>
                                                            <Badge className={cn("rounded-full border", statusBadgeClass("task", log.status))}>
                                                                {labelForTaskExecutionStatus(log.status)}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                                    {tr.noRunFlow}
                                                </div>
                                            )}
                                        </div>
                                    </Field>
                                    <Field label={tr.skillResolution}>
                                        <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900">
                                            <p className="font-medium text-slate-900 dark:text-slate-100">{selectedSkillUsageText}</p>
                                            <p className="text-slate-500 dark:text-slate-400">
                                                {tr.sourceLine(labelForSkillResolutionSource(selectedLogDetail.skill_resolution_source), labelForMemorySource(selectedLogDetail.memory_source))}
                                            </p>
                                            <div className="grid gap-3 md:grid-cols-3">
                                                <InfoTile
                                                    label={tr.dimensionCount}
                                                    value={selectedLogDetail.task_type === "resume_parse" ? tr.notApplicable : `${selectedPromptRuleDimensionCount}${language === "en-US" ? "" : " 个"}`}
                                                />
                                                <InfoTile
                                                    label={tr.injectedPrompt}
                                                    value={selectedLogDetail.task_type === "resume_parse" ? tr.notApplicable : selectedSkillsAppliedToPrompt ? tr.yes : tr.no}
                                                />
                                                <InfoTile
                                                    label={tr.source}
                                                    value={`${labelForSkillResolutionSource(selectedLogDetail.skill_resolution_source)} / ${labelForMemorySource(selectedLogDetail.memory_source)}`}
                                                />
                                            </div>
                                            {selectedSkillResolutionDetail ? (
                                                <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-600 dark:text-slate-300">
                                                    {formatStructuredValue(selectedSkillResolutionDetail, tr.noSkillResolutionDetail)}
                                                </pre>
                                            ) : null}
                                            {selectedLogSkillSnapshots.length ? (
                                                <div className="space-y-3">
                                                    {selectedLogSkillSnapshots.map((skill) => (
                                                        <div key={`${skill.skill_code}-${skill.id}`} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-950">
                                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                                <div>
                                                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{skill.name}</p>
                                                                    {skill.description ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{skill.description}</p> : null}
                                                                </div>
                                                                {skill.tags.length ? (
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {skill.tags.map((tag) => (
                                                                            <Badge key={`${skill.skill_code}-${tag}`} variant="outline" className="rounded-full">{tag}</Badge>
                                                                        ))}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                            <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-600 dark:text-slate-300">{skill.content || tr.noSkillContent}</pre>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    </Field>
                                    <Field label={tr.scoreRuleSnapshot}>
                                        <div className="space-y-3">
                                            {selectedScoreRuleSnapshot.length ? selectedScoreRuleSnapshot.map((item, index) => (
                                                <div key={`${item.label || "rule"}-${index}`} className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-sm dark:border-slate-800 dark:bg-slate-900">
                                                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                                                        {String(item.label || "-")} · {String(item.max_score || "-")}{tr.pointsSuffix}
                                                    </p>
                                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                        {String(item.skill_name || tr.sourceSkillMissing)} · {item.is_core ? tr.coreDimension : tr.nonCoreDimension}
                                                    </p>
                                                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{String(item.note || tr.noNotes)}</p>
                                                </div>
                                            )) : (
                                                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                                    {tr.noRuleSnapshot}
                                                </div>
                                            )}
                                        </div>
                                    </Field>
                                    <Field label={tr.timingBreakdown}>
                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                            {[
                                                [tr.queueWait, selectedTimingBreakdown?.queue_wait_ms],
                                                [tr.parseDuration, selectedTimingBreakdown?.parse_duration_ms],
                                                [tr.scoreDuration, selectedTimingBreakdown?.score_duration_ms],
                                                [tr.validationDuration, selectedTimingBreakdown?.validation_duration_ms],
                                                [tr.saveDuration, selectedTimingBreakdown?.save_duration_ms],
                                                [tr.totalDuration, selectedTimingBreakdown?.total_duration_ms ?? selectedLogDetail.duration_ms],
                                            ].map(([label, value]) => (
                                                <InfoTile key={String(label)} label={String(label)} value={formatDurationValue(value)}/>
                                            ))}
                                        </div>
                                    </Field>
                                    <InfoTile label={tr.inputSummary} value={selectedLogDetail.input_summary || tr.unrecorded}/>
                                    <InfoTile label={tr.outputSummary} value={selectedLogDetail.output_summary || tr.unrecorded}/>
                                    <InfoTile label={tr.errorMessage} value={selectedLogDetail.error_message || tr.none}/>
                                    {selectedAuditNotice.show && !selectedFlowAuditView?.autoRequeueScheduled ? (
                                        <Field label={selectedAuditNotice.title}>
                                            <div className={selectedAuditNotice.containerClassName}>
                                                {selectedInvalidResultSummary ? (
                                                    <p className="font-medium">{selectedInvalidResultSummary}</p>
                                                ) : null}
                                                {selectedAuditNotice.showSchemaReason && selectedModelSchemaViolationReason ? (
                                                    <p>{tr.schemaViolation}: {selectedModelSchemaViolationReason}</p>
                                                ) : null}
                                                {selectedAuditNotice.showInvalidReasons && selectedInvalidResultReasons.length ? (
                                                    <div className="space-y-1">
                                                        {selectedInvalidResultReasons.map((reason, index) => (
                                                            <p key={`${reason}-${index}`}>{index + 1}. {reason}</p>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </Field>
                                    ) : null}
                                    <Field label={tr.stateExplanation}>
                                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                            <pre className="whitespace-pre-wrap break-words">{formatStructuredValue(selectedValidationMeta, tr.noStateExplanation)}</pre>
                                        </div>
                                    </Field>
                                    <Field label={tr.persistedResults}>
                                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                            <pre className="whitespace-pre-wrap break-words">{formatStructuredValue(selectedPersistedResultRefs, tr.noPersistedResults)}</pre>
                                        </div>
                                    </Field>
                                    {isSelectedScreeningFlow ? (
                                        <>
                                            {renderStageModelDetails(
                                                tr.parseStageDetail,
                                                selectedParseDetailLog,
                                                selectedFlowStages[0]?.status === "reused"
                                                    ? tr.parseReusedDetail
                                                    : tr.noParseDetail,
                                            )}
                                            {renderStageModelDetails(
                                                tr.scoreStageDetail,
                                                selectedScoreDetailLog,
                                                tr.noScoreDetail,
                                            )}
                                            <Field label={tr.saveStageDetail}>
                                                <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
                                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                                        <InfoTile label="parse_result_id" value={String(selectedPersistedResultRefs?.parse_result_id || tr.unrecorded)}/>
                                                        <InfoTile label="score_result_id" value={String(selectedPersistedResultRefs?.score_result_id || tr.unrecorded)}/>
                                                        <InfoTile label={tr.finalSource} value={String(selectedValidationMeta?.final_response_source || selectedLogOutputRecord?.final_response_source || tr.unrecorded)}/>
                                                        <InfoTile label={tr.candidateStatus} value={String(selectedPersistedResultRefs?.candidate_status_after || tr.unrecorded)}/>
                                                    </div>
                                                    <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                                        <pre className="whitespace-pre-wrap break-words">{formatStructuredValue(selectedPersistedResultRefs, tr.noPersistedResults)}</pre>
                                                    </div>
                                                </div>
                                            </Field>
                                        </>
                                    ) : (
                                        <>
                                            <Field label="Prompt Snapshot">
                                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                    <pre className="whitespace-pre-wrap break-words">{selectedLogDetail.prompt_snapshot || tr.promptSnapshotMissing}</pre>
                                                </div>
                                            </Field>
                                            <Field label={tr.fullModelRequest}>
                                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                    <pre className="whitespace-pre-wrap break-words">{selectedLogDetail.full_request_snapshot || tr.fullRequestMissing}</pre>
                                                </div>
                                            </Field>
                                            <Field label={tr.modelRawResponse}>
                                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                    <pre className="whitespace-pre-wrap break-words">{selectedLogDetail.raw_response_text || tr.rawResponseMissing}</pre>
                                                </div>
                                            </Field>
                                            <Field label={tr.parsedJson}>
                                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                    <pre className="whitespace-pre-wrap break-words">{formatStructuredValue(selectedLogDetail.parsed_response_json, tr.parsedJsonMissing)}</pre>
                                                </div>
                                            </Field>
                                            <Field label={tr.sanitizedJson}>
                                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                    <pre className="whitespace-pre-wrap break-words">{formatStructuredValue(selectedLogDetail.sanitized_response_json, tr.sanitizedJsonMissing)}</pre>
                                                </div>
                                            </Field>
                                            <Field label={tr.fullOutput}>
                                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                    <pre className="whitespace-pre-wrap break-words">{formatStructuredValue(selectedLogDetail.output_snapshot, selectedLogDetail.output_summary || tr.outputMissing)}</pre>
                                                </div>
                                            </Field>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <EmptyState title={tr.selectTaskRecord} description={tr.selectTaskRecordDesc}/>
                    )}
                </Card>
            </div>
        </div>
    );
}
