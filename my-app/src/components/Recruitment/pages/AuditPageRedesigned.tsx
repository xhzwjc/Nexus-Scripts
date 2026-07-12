"use client";

import React from "react";
import {Check, ChevronDown, ChevronUp, Circle, Clock3, Loader2, RefreshCw, X} from "lucide-react";

import type {AITaskLog, CandidateSummary, PositionSummary, RecruitmentSkill} from "@/lib/recruitment-api";
import {getCurrentLanguage, useI18n} from "@/lib/i18n";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";

import {NativeSelect} from "../components/SharedComponents";
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
    resolveCandidateFacingErrorContext,
    resolveLogSkillSnapshots,
    sanitizeCandidateFacingErrorText,
} from "../utils";
import {buildScreeningFlowAuditView} from "./auditFlowDetails";
import {resolveAuditNoticePresentation} from "./auditNotice";

type AuditListDisplayColumnWidths = {
    taskType: number;
    object: number;
    status: number;
    model: number;
    duration: number;
    time: number;
};

type AuditTaskLogWithRunLogs = AITaskLog & {run_logs?: AITaskLog[] | null};
type AuditTechnicalSection = "request" | "response" | "structured" | "persisted";

type AuditPageProps = {
    auditFiltersCollapsed: boolean;
    auditFilterSummary: string;
    logsLoading: boolean;
    logTaskTypeFilter: string;
    logStatusFilter: string;
    aiLogs: AITaskLog[];
    aiLogTotal: number;
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

function getLocale(language = getCurrentLanguage()) {
    const isZh = language !== "en-US";
    return {
        title: isZh ? "任务审计中心" : "Task Audit Center",
        description: isZh ? "展示任务类型、关联对象、状态、使用模型和执行时间。" : "Show task type, related object, status, model, and execution time.",
        filterDescription: isZh ? "任务筛选条：按任务类型和状态收拢 AI 任务，便于排查与复盘。" : "Filter AI tasks by type and status for debugging and review.",
        refresh: isZh ? "刷新任务" : "Refresh Tasks",
        refreshing: isZh ? "刷新中..." : "Refreshing...",
        expandFilters: isZh ? "展开筛选" : "Expand Filters",
        collapseFilters: isZh ? "收起筛选" : "Collapse Filters",
        allTaskTypes: isZh ? "全部任务类型" : "All Task Types",
        allStatuses: isZh ? "全部状态" : "All Statuses",
        taskType: isZh ? "任务类型" : "Task Type",
        relatedObject: isZh ? "关联对象" : "Related Object",
        status: isZh ? "状态" : "Status",
        model: isZh ? "模型" : "Model",
        duration: isZh ? "耗时" : "Duration",
        notStarted: isZh ? "未开始" : "Not Started",
        inProgress: isZh ? "进行中" : "In Progress",
        stopping: isZh ? "停止中" : "Stopping",
        taskTime: isZh ? "任务时间" : "Task Time",
        loadedCount: (loaded: number, total: number) => isZh ? `已加载 ${loaded} / 共 ${total} 条` : `${loaded} of ${total} loaded`,
        scrollForMore: isZh ? "向下滚动自动加载更多" : "Scroll down to load more",
        loadingLogs: isZh ? "正在加载 AI 审计日志" : "Loading AI audit logs",
        noLogs: isZh ? "暂无 AI 审计记录" : "No AI Audit Logs",
        noLogsDescription: isZh ? "当招聘模块调用模型后，这里会沉淀成可追踪的任务日志。" : "Audit logs will appear after recruiting tasks call a model.",
        loadingDetail: isZh ? "正在加载日志详情" : "Loading log details",
        selectTask: isZh ? "请选择一条任务记录" : "Select a Task Record",
        selectTaskDescription: isZh ? "左侧点开任务后，这里会展示输入摘要、输出摘要、错误信息和评估方案使用情况。" : "Select a task to inspect its input, output, errors, and assessment plan usage.",
        taskDetail: (task: string) => isZh ? `任务详情 · ${task}` : `Task Details · ${task}`,
        currentStage: isZh ? "当前阶段" : "Current Stage",
        runId: "Run ID",
        skillUsage: isZh ? "评估方案使用情况" : "Assessment Plan Usage",
        memorySource: isZh ? "记忆来源" : "Memory Source",
        dimensionCount: isZh ? "提炼维度数" : "Derived Dimensions",
        dimensionCountSuffix: isZh ? "个" : "",
        taskFlow: isZh ? "任务链路" : "Task Flow",
        noTaskFlow: isZh ? "本次未记录可展示的任务链路" : "No task flow was recorded for this run",
        inferredTerminal: isZh ? "主流程状态未及时收口，已按子阶段结果推断展示。" : "The root flow did not settle in time; the terminal state is inferred from child stages.",
        retryQueued: isZh ? "排队重试中" : "Retry Queued",
        waitingRetry: isZh ? "等待重试" : "Waiting to Retry",
        retryInformation: isZh ? "重试信息" : "Retry Information",
        retryCount: isZh ? "已重试次数" : "Retry Count",
        retryAfter: isZh ? "下次重试间隔" : "Next Retry Delay",
        nextRetryTime: isZh ? "下次重试时间" : "Next Retry Time",
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
        unrecorded: isZh ? "未记录" : "Unrecorded",
        notApplicable: isZh ? "不适用" : "N/A",
        yes: isZh ? "是" : "Yes",
        no: isZh ? "否" : "No",
        technicalDetails: isZh ? "技术明细" : "Technical Details",
        fullModelRequest: isZh ? "完整模型请求" : "Full Model Request",
        rawResponse: isZh ? "模型原始响应" : "Raw Model Response",
        parsedJson: isZh ? "解析后 JSON" : "Parsed JSON",
        persistedResult: isZh ? "最终写库结果" : "Persisted Result",
        promptSnapshot: "Prompt Snapshot",
        sanitizedJson: isZh ? "清洗后 JSON" : "Sanitized JSON",
        fullOutput: isZh ? "完整输出" : "Full Output",
        validationMeta: isZh ? "状态解释与校验信息" : "State and Validation Metadata",
        skillResolution: isZh ? "评估方案解析结果" : "Assessment Plan Resolution",
        scoreRuleSnapshot: isZh ? "评分维度快照" : "Score Rule Snapshot",
        noTechnicalData: isZh ? "本次任务未记录该项内容" : "This task did not record this content",
        noSkillResolution: isZh ? "暂无评估方案解析详情" : "No assessment plan resolution details",
        noRuleSnapshot: isZh ? "本次未记录评分维度快照" : "No score rule snapshot was recorded",
        parseStage: isZh ? "阶段 1 · 简历解析" : "Stage 1 · Resume Parse",
        scoreStage: isZh ? "阶段 2 · 初筛评分" : "Stage 2 · Screening Score",
        rootStage: isZh ? "任务主记录" : "Root Task Record",
        finalSource: isZh ? "最终来源" : "Final Source",
        candidateStatus: isZh ? "候选人状态" : "Candidate Status",
        source: isZh ? "来源" : "Source",
        injectedPrompt: isZh ? "已注入评分 Prompt" : "Injected into Score Prompt",
        skillsApplied: (names: string[]) => isZh ? `已使用：${names.join("、")}` : `Used: ${names.join(", ")}`,
        parseNoSkills: isZh ? "简历解析任务不使用岗位初筛评估方案" : "Resume parsing does not use screening assessment plans",
        skillsMissing: isZh ? "本次未解析到有效评估方案" : "No valid assessment plan was resolved",
        positionMatch: isZh ? "岗位匹配" : "Position Match",
    };
}

function toRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
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

function isAutoRetryQueuedLog(log?: AITaskLog | null) {
    if (!log || log.status !== "queued") return false;
    const validation = toRecord(log.validation_meta);
    const output = toRecord(log.output_snapshot);
    return validation?.auto_requeue_scheduled === true || output?.auto_requeue_scheduled === true;
}

function labelForAuditTask(log: AITaskLog | null | undefined, isZh: boolean) {
    if (!log) return labelForTaskType();
    if (log.task_type === "screening_flow") return isZh ? "初筛流程" : "Screening Flow";
    if (log.task_type === "ai_position_match") return isZh ? "岗位匹配" : "Position Match";
    const isRootScreeningLog = Boolean(log.screening_run_id) && (
        (typeof log.root_task_id === "number" && log.id === log.root_task_id)
        || (log.root_task_id == null && log.parent_task_id == null && log.task_type === "resume_score")
    );
    return isRootScreeningLog ? (isZh ? "初筛流程" : "Screening Flow") : labelForTaskType(log.task_type);
}

function isUserVisibleAuditLog(log: AITaskLog) {
    if (log.task_type === "screening_flow") return true;
    if (log.parent_task_id != null) return false;
    if (log.task_type === "resume_parse" || log.task_type === "resume_score") return !log.screening_run_id;
    return true;
}

function formatDurationValue(value: unknown) {
    if (value == null || value === "") return "-";
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return "-";
    return numeric >= 1000 ? `${(numeric / 1000).toFixed(1)}s` : `${Math.round(numeric)}ms`;
}

function formatDurationLabel(log: Pick<AITaskLog, "duration_ms" | "status">, labels: ReturnType<typeof getLocale>) {
    if (log.status === "pending" || log.status === "queued") return labels.notStarted;
    if (log.status === "running") return labels.inProgress;
    if (log.status === "cancelling") return labels.stopping;
    return typeof log.duration_ms === "number" ? formatDurationValue(log.duration_ms) : labels.unrecorded;
}

function formatDisplayTime(log: Pick<AITaskLog, "status" | "stage_started_at" | "stage_completed_at" | "created_at" | "updated_at">) {
    const status = String(log.status || "").trim().toLowerCase();
    const terminal = new Set(["success", "fallback", "failed", "invalid_result", "json_parse_failed", "timeout", "retry_exhausted", "cancelled"]);
    if (terminal.has(status)) return log.stage_completed_at || log.updated_at || log.created_at || null;
    if (status === "running" || status === "cancelling") return log.stage_started_at || log.updated_at || log.created_at || null;
    return log.created_at || log.stage_started_at || log.updated_at || null;
}

function formatModelLabel(log: Pick<AITaskLog, "model_provider" | "model_name" | "model_source">, fallback: string) {
    const provider = log.model_provider ? labelForProvider(log.model_provider) : "";
    const model = log.model_name?.trim() || "";
    const source = log.model_source?.trim().replace(/^db:/, "") || "";
    return [provider, model, source].filter(Boolean).join(" · ") || fallback;
}

function formatListModelLabel(log: AITaskLog, fallback: string) {
    return log.model_name?.trim() || (log.model_provider ? labelForProvider(log.model_provider) : fallback);
}

function statusTone(status?: string | null) {
    const normalized = String(status || "").trim().toLowerCase();
    if (["success", "completed", "fallback", "reused"].includes(normalized)) return "bg-[rgba(12,201,145,0.1)] text-[#0A9C71]";
    if (["running", "cancelling"].includes(normalized)) return "bg-[rgba(46,156,255,0.1)] text-[#2E9CFF]";
    if (["pending", "queued", "retry_queued", "unmatched"].includes(normalized)) return "bg-[rgba(255,171,36,0.12)] text-[#D48806]";
    if (["failed", "invalid_result", "json_parse_failed", "timeout", "retry_exhausted"].includes(normalized)) return "bg-[rgba(245,63,63,0.08)] text-[#F53F3F]";
    return "bg-[rgba(176,178,184,0.12)] text-[#86888F]";
}

function isStageComplete(status?: string | null) {
    return ["success", "completed", "fallback", "reused"].includes(String(status || "").trim().toLowerCase());
}

function isStageRunning(status?: string | null) {
    return ["running", "cancelling"].includes(String(status || "").trim().toLowerCase());
}

function isStageFailed(status?: string | null) {
    return ["failed", "invalid_result", "json_parse_failed", "timeout", "retry_exhausted", "cancelled"].includes(String(status || "").trim().toLowerCase());
}

function flowStatusLabel(status: string | null | undefined, isZh: boolean) {
    const normalized = String(status || "").trim().toLowerCase();
    if (normalized === "reused") return isZh ? "已复用" : "Reused";
    if (normalized === "pending") return isZh ? "待执行" : "Pending";
    if (normalized === "running") return isZh ? "执行中" : "Running";
    if (normalized === "completed" || normalized === "success") return isZh ? "已完成" : "Completed";
    if (normalized === "failed") return isZh ? "失败" : "Failed";
    if (normalized === "cancelled") return isZh ? "已停止" : "Stopped";
    return labelForTaskExecutionStatus(status || "pending");
}

function MetaItem({label, value, accent = false}: {label: React.ReactNode; value: React.ReactNode; accent?: boolean}) {
    return (
        <div className="min-w-0 space-y-1">
            <p className="text-[11px] leading-4 text-[#B0B2B8]">{label}</p>
            <div className={cn("break-words text-[12px] leading-5 text-[#0F1014]", accent && "text-[#0F23D9]")}>{value}</div>
        </div>
    );
}

function SectionTitle({children}: {children: React.ReactNode}) {
    return <h4 className="text-[13px] font-semibold leading-5 text-[#0E1114]">{children}</h4>;
}

function CodePanel({label, value}: {label: React.ReactNode; value: React.ReactNode}) {
    return (
        <section className="space-y-2">
            <p className="text-[12px] font-medium text-[#33353D]">{label}</p>
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-[6px] border border-[#EBEEF5] bg-[#F7F8FA] px-3.5 py-3 text-[11px] leading-5 text-[#33353D]">{value}</pre>
        </section>
    );
}

function EmptyPanel({title, description}: {title: string; description: string}) {
    return (
        <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center px-8 text-center">
            <Clock3 className="h-7 w-7 text-[#B0B2B8]"/>
            <p className="mt-3 text-[13px] font-medium text-[#0E1114]">{title}</p>
            <p className="mt-1 max-w-[420px] text-[11px] leading-5 text-[#86888F]">{description}</p>
        </div>
    );
}

export function AuditPage({
    auditFiltersCollapsed,
    auditFilterSummary,
    logsLoading,
    logTaskTypeFilter,
    logStatusFilter,
    aiLogs,
    aiLogTotal,
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
    const {language} = useI18n();
    const isZh = language !== "en-US";
    const tr = React.useMemo(() => getLocale(language), [language]);
    const [openTechnicalSection, setOpenTechnicalSection] = React.useState<AuditTechnicalSection | null>(null);
    const visibleAuditLogs = React.useMemo(() => {
        const seen = new Set<number>();
        return aiLogs.filter((log) => {
            if (!isUserVisibleAuditLog(log) || seen.has(log.id)) {
                return false;
            }
            seen.add(log.id);
            return true;
        });
    }, [aiLogs]);
    const firstVisibleLogId = visibleAuditLogs[0]?.id ?? null;

    React.useEffect(() => {
        if (firstVisibleLogId == null) {
            if (selectedLogId != null) setSelectedLogId(null);
            return;
        }
        if (selectedLogId == null || !visibleAuditLogs.some((log) => log.id === selectedLogId)) {
            setSelectedLogId(firstVisibleLogId);
        }
    }, [firstVisibleLogId, selectedLogId, setSelectedLogId, visibleAuditLogs]);

    React.useEffect(() => setOpenTechnicalSection(null), [selectedLogId]);

    const taskTypeOptions = React.useMemo(() => ({
        screening_flow: isZh ? "初筛流程" : "Screening Flow",
        ai_position_match: tr.positionMatch,
        ...aiTaskLabels,
    }), [isZh, language, tr.positionMatch]);
    const statusOptions = React.useMemo(() => [
        "pending", "queued", "success", "fallback", "running", "cancelling", "cancelled",
        "invalid_result", "json_parse_failed", "timeout", "retry_exhausted", "failed",
    ], []);

    const detailWithRunLogs = selectedLogDetail as AuditTaskLogWithRunLogs | null;
    const selectedRunLogs = React.useMemo(() => {
        if (Array.isArray(detailWithRunLogs?.run_logs) && detailWithRunLogs.run_logs.length) {
            return detailWithRunLogs.run_logs.slice().sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime() || left.id - right.id);
        }
        if (!selectedLogDetail?.screening_run_id) return selectedLogDetail ? [selectedLogDetail] : [];
        return aiLogs
            .filter((log) => log.screening_run_id === selectedLogDetail.screening_run_id)
            .sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime() || left.id - right.id);
    }, [aiLogs, detailWithRunLogs?.run_logs, selectedLogDetail]);
    const outputSnapshot = React.useMemo(() => parseStructuredLogOutput(selectedLogDetail?.output_snapshot), [selectedLogDetail?.output_snapshot]);
    const outputRecord = React.useMemo(() => toRecord(outputSnapshot), [outputSnapshot]);
    const validationMeta = React.useMemo(() => toRecord(selectedLogDetail?.validation_meta), [selectedLogDetail?.validation_meta]);
    const invalidReasons = React.useMemo(() => readStringList(validationMeta?.invalid_result_reasons), [validationMeta]);
    const modelSchemaReason = typeof validationMeta?.model_schema_violation_reason === "string" ? validationMeta.model_schema_violation_reason.trim() : "";
    const invalidSummary = (
        (typeof outputRecord?.invalid_result_summary === "string" ? outputRecord.invalid_result_summary.trim() : "")
        || (typeof validationMeta?.invalid_result_summary === "string" ? validationMeta.invalid_result_summary.trim() : "")
        || invalidReasons[0]
        || ""
    );
    const auditNotice = React.useMemo(() => resolveAuditNoticePresentation({
        screeningResultState: typeof validationMeta?.screening_result_state === "string" ? validationMeta.screening_result_state : null,
        screeningResultValid: typeof validationMeta?.screening_result_valid === "boolean" ? validationMeta.screening_result_valid : null,
        invalidResultReasons: invalidReasons,
        invalidResultSummary: invalidSummary,
        modelSchemaViolationReason: modelSchemaReason,
    }), [invalidReasons, invalidSummary, modelSchemaReason, validationMeta]);
    const scoreRuleSnapshot = React.useMemo(() => toRecordList(selectedLogDetail?.score_rule_snapshot || outputRecord?.score_rule_snapshot), [outputRecord, selectedLogDetail?.score_rule_snapshot]);
    const timingBreakdown = React.useMemo(() => toRecord(selectedLogDetail?.timing_breakdown || outputRecord?.timing_breakdown), [outputRecord, selectedLogDetail?.timing_breakdown]);
    const persistedResultRefs = React.useMemo(() => toRecord(selectedLogDetail?.persisted_result_refs || outputRecord?.persisted_result_refs), [outputRecord, selectedLogDetail?.persisted_result_refs]);
    const skillResolutionDetail = React.useMemo(() => toRecord(selectedLogDetail?.skill_resolution_detail || outputRecord?.skill_resolution_detail), [outputRecord, selectedLogDetail?.skill_resolution_detail]);
    const skillSnapshots = selectedLogDetail ? resolveLogSkillSnapshots(selectedLogDetail, skillMap) : [];
    const skillNames = skillSnapshots.length
        ? skillSnapshots.map((skill) => skill.name || `评估方案 #${skill.id}`)
        : readStringList(skillResolutionDetail?.resolved_skill_names);
    const skillUsageText = !selectedLogDetail
        ? tr.unrecorded
        : selectedLogDetail.task_type === "resume_parse"
            ? tr.parseNoSkills
            : skillNames.length
                ? tr.skillsApplied(skillNames)
                : tr.skillsMissing;
    const promptDimensionCount = (() => {
        const direct = outputRecord?.prompt_rule_dimension_count;
        const numeric = typeof direct === "number" ? direct : Number(direct);
        return Number.isFinite(numeric) ? numeric : scoreRuleSnapshot.length;
    })();
    const skillsAppliedToPrompt = typeof outputRecord?.skills_applied_to_prompt === "boolean"
        ? outputRecord.skills_applied_to_prompt
        : scoreRuleSnapshot.length > 0;
    const flowAuditView = React.useMemo(() => selectedLogDetail?.task_type === "screening_flow" ? buildScreeningFlowAuditView(selectedLogDetail, selectedRunLogs) : null, [selectedLogDetail, selectedRunLogs]);
    const displayStatus = flowAuditView?.effectiveRootStatus || selectedLogDetail?.status || "pending";
    const displayStage = flowAuditView?.effectiveRootStage || selectedLogDetail?.stage || null;
    const displayStatusLabel = flowAuditView?.autoRequeueScheduled ? tr.retryQueued : labelForTaskExecutionStatus(displayStatus);
    const displayStageLabel = flowAuditView?.autoRequeueScheduled ? tr.waitingRetry : (displayStage ? labelForScreeningTaskStage(displayStage) : tr.unrecorded);
    const modelLabel = selectedLogDetail ? formatModelLabel({
        model_provider: selectedLogDetail.model_provider || flowAuditView?.scoreDetailLog?.model_provider || null,
        model_name: selectedLogDetail.model_name || flowAuditView?.scoreDetailLog?.model_name || null,
        model_source: selectedLogDetail.model_source || flowAuditView?.scoreDetailLog?.model_source || null,
    }, tr.unrecorded) : tr.unrecorded;
    const flowItems = React.useMemo(() => {
        if (flowAuditView?.stages?.length) {
            return flowAuditView.stages.map((stage, index) => ({key: `${stage.key}-${index}`, title: stage.title, detail: stage.detail, status: stage.status, duration: stage.duration}));
        }
        return selectedRunLogs.map((log) => ({
            key: String(log.id),
            title: labelForAuditTask(log, isZh),
            detail: log.stage ? labelForScreeningTaskStage(log.stage) : `#${log.id}`,
            status: log.status,
            duration: log.duration_ms,
        }));
    }, [flowAuditView?.stages, isZh, selectedRunLogs]);
    const traceEntries = React.useMemo(() => {
        if (!selectedLogDetail) return [];
        if (selectedLogDetail.task_type !== "screening_flow") return [{key: `root-${selectedLogDetail.id}`, label: tr.rootStage, log: selectedLogDetail}];
        const entries = [
            flowAuditView?.parseDetailLog ? {key: `parse-${flowAuditView.parseDetailLog.id}`, label: tr.parseStage, log: flowAuditView.parseDetailLog} : null,
            flowAuditView?.scoreDetailLog ? {key: `score-${flowAuditView.scoreDetailLog.id}`, label: tr.scoreStage, log: flowAuditView.scoreDetailLog} : null,
        ].filter((entry): entry is {key: string; label: string; log: AITaskLog} => Boolean(entry));
        return entries.length ? entries : [{key: `root-${selectedLogDetail.id}`, label: tr.rootStage, log: selectedLogDetail}];
    }, [flowAuditView?.parseDetailLog, flowAuditView?.scoreDetailLog, selectedLogDetail, tr.parseStage, tr.rootStage, tr.scoreStage]);

    const sanitizeMessage = React.useCallback((value?: string | null) => sanitizeCandidateFacingErrorText(value, {
        context: resolveCandidateFacingErrorContext(selectedLogDetail?.task_type, {autoRetry: isAutoRetryQueuedLog(selectedLogDetail)}),
        language,
    }), [language, selectedLogDetail]);

    const totalCount = Math.max(aiLogTotal, visibleAuditLogs.length);
    const selectedObjectLabel = selectedLogDetail ? buildLogObjectLabel(selectedLogDetail, positionMap, candidateMap, skillMap) : tr.unrecorded;
    const timingItems: Array<[string, unknown, boolean]> = [
        [tr.queueWait, timingBreakdown?.queue_wait_ms, false],
        [tr.parseDuration, timingBreakdown?.parse_duration_ms, false],
        [tr.scoreDuration, timingBreakdown?.score_duration_ms, false],
        [tr.validationDuration, timingBreakdown?.validation_duration_ms, false],
        [tr.saveDuration, timingBreakdown?.save_duration_ms, false],
        [tr.totalDuration, timingBreakdown?.total_duration_ms ?? selectedLogDetail?.duration_ms, true],
    ];

    const technicalButtons: Array<{key: AuditTechnicalSection; label: string}> = [
        {key: "request", label: tr.fullModelRequest},
        {key: "response", label: tr.rawResponse},
        {key: "structured", label: tr.parsedJson},
        {key: "persisted", label: tr.persistedResult},
    ];

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white px-5 pb-5 pt-5 text-[#0E1114] dark:bg-slate-950 lg:px-8">
            <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#1E3BFA] text-white">
                        <Clock3 className="h-[15px] w-[15px]" strokeWidth={1.8}/>
                    </span>
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h1 className="text-[18px] font-semibold leading-7 text-[#0E1114] dark:text-white">{tr.title}</h1>
                        <p className="text-[12px] leading-5 text-[#B0B2B8]">{tr.description}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="h-9 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[13px] font-normal text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-[#F7F8FA] hover:text-[#0F23D9]" onClick={() => void refreshLogsWithFeedback()} disabled={logsLoading}>
                        {logsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5"/>}
                        {logsLoading ? tr.refreshing : tr.refresh}
                    </Button>
                    <button type="button" className="inline-flex h-8 items-center gap-1 text-[12px] text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => setAuditFiltersCollapsed((current) => !current)}>
                        {auditFiltersCollapsed ? <ChevronDown className="h-3.5 w-3.5"/> : <ChevronUp className="h-3.5 w-3.5"/>}
                        {auditFiltersCollapsed ? tr.expandFilters : tr.collapseFilters}
                    </button>
                </div>
            </header>

            <section className="mb-4 flex min-h-12 shrink-0 flex-wrap items-center gap-x-6 gap-y-2 rounded-[6px] bg-[#F7F8FA] px-4 py-2.5">
                <p className="text-[12px] leading-5 text-[#86888F]">{auditFiltersCollapsed ? auditFilterSummary : tr.filterDescription}</p>
                {!auditFiltersCollapsed ? (
                    <div className="flex flex-wrap items-center gap-6">
                        <NativeSelect aria-label={tr.taskType} className="h-7 w-auto min-w-[132px] rounded-[4px] border-[#E6E7EB] bg-white px-3 py-0 text-[12px] text-[#33353D] shadow-none" value={logTaskTypeFilter} onChange={(event) => setLogTaskTypeFilter(event.target.value)}>
                            <option value="all">{tr.allTaskTypes}</option>
                            {Object.entries(taskTypeOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </NativeSelect>
                        <NativeSelect aria-label={tr.status} className="h-7 w-auto min-w-[112px] rounded-[4px] border-[#E6E7EB] bg-white px-3 py-0 text-[12px] text-[#33353D] shadow-none" value={logStatusFilter} onChange={(event) => setLogStatusFilter(event.target.value)}>
                            <option value="all">{tr.allStatuses}</option>
                            {statusOptions.map((status) => <option key={status} value={status}>{labelForTaskExecutionStatus(status)}</option>)}
                        </NativeSelect>
                    </div>
                ) : null}
            </section>

            <div className="grid min-h-0 flex-1 items-stretch gap-5 overflow-auto xl:grid-cols-[minmax(620px,1fr)_minmax(500px,560px)] xl:overflow-hidden">
                <section aria-label={tr.title} className="flex min-h-[520px] min-w-0 flex-col overflow-hidden bg-white dark:bg-slate-950">
                    {logsLoading && !visibleAuditLogs.length ? (
                        <div className="flex min-h-[320px] flex-1 items-center justify-center gap-2 text-[12px] text-[#86888F]"><Loader2 className="h-4 w-4 animate-spin"/>{tr.loadingLogs}</div>
                    ) : visibleAuditLogs.length ? (
                        <>
                            <div ref={auditListScrollRef} className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
                                <div style={{width: auditListTableWidth, minWidth: auditListTableWidth}}>
                                    <Table className="table-fixed text-[12px]" style={{width: auditListTableWidth, minWidth: auditListTableWidth}}>
                                        <TableHeader>
                                            <TableRow className="h-10 border-b border-[#F2F3F5] hover:bg-transparent">
                                                <TableHead className="h-10 px-2.5 text-[12px] font-normal text-[#86888F]" style={{width: auditListDisplayColumnWidths.taskType}}>{tr.taskType}</TableHead>
                                                <TableHead className="h-10 px-2.5 text-[12px] font-normal text-[#86888F]" style={{width: auditListDisplayColumnWidths.object}}>{tr.relatedObject}</TableHead>
                                                <TableHead className="h-10 px-2.5 text-[12px] font-normal text-[#86888F]" style={{width: auditListDisplayColumnWidths.status}}>{tr.status}</TableHead>
                                                <TableHead className="h-10 px-2.5 text-[12px] font-normal text-[#86888F]" style={{width: auditListDisplayColumnWidths.model}}>{tr.model}</TableHead>
                                                <TableHead className="h-10 px-2.5 text-[12px] font-normal text-[#86888F]" style={{width: auditListDisplayColumnWidths.duration}}>{tr.duration}</TableHead>
                                                <TableHead className="h-10 px-2.5 text-right text-[12px] font-normal text-[#86888F]" style={{width: auditListDisplayColumnWidths.time}}>{tr.taskTime}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {visibleAuditLogs.map((log) => {
                                                const selected = selectedLogId === log.id;
                                                const objectLabel = buildLogObjectLabel(log, positionMap, candidateMap, skillMap);
                                                const fullModelLabel = formatModelLabel(log, tr.unrecorded);
                                                const displayTime = formatDisplayTime(log);
                                                return (
                                                    <TableRow
                                                        key={`audit-log-${log.id}`}
                                                        tabIndex={0}
                                                        aria-selected={selected}
                                                        className={cn("h-[45px] cursor-pointer border-b border-[#F2F3F5] text-[#0F1014] outline-none transition-colors hover:bg-[#F8F8F9] focus-visible:bg-[rgba(30,59,250,0.04)]", selected && "bg-[rgba(30,59,250,0.04)] hover:bg-[rgba(30,59,250,0.04)]")}
                                                        onClick={() => setSelectedLogId(log.id)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                setSelectedLogId(log.id);
                                                            }
                                                        }}
                                                    >
                                                        <TableCell className="h-[45px] truncate px-2.5 py-0" title={labelForAuditTask(log, isZh)}>{labelForAuditTask(log, isZh)}</TableCell>
                                                        <TableCell className="h-[45px] truncate px-2.5 py-0 text-[#0F23D9]" title={objectLabel}>{objectLabel}</TableCell>
                                                        <TableCell className="h-[45px] px-2.5 py-0" title={log.stage ? labelForScreeningTaskStage(log.stage) : undefined}>
                                                            <span className={cn("inline-flex h-[22px] items-center rounded-[4px] px-2 text-[11px]", statusTone(log.status))}>{labelForTaskExecutionStatus(log.status)}</span>
                                                        </TableCell>
                                                        <TableCell className="h-[45px] truncate px-2.5 py-0 text-[#33353D]" title={fullModelLabel}>{formatListModelLabel(log, tr.unrecorded)}</TableCell>
                                                        <TableCell className="h-[45px] px-2.5 py-0 tabular-nums">{formatDurationLabel(log, tr)}</TableCell>
                                                        <TableCell className="h-[45px] whitespace-nowrap px-2.5 py-0 text-right tabular-nums text-[#86888F]">{displayTime ? formatDateTime(displayTime) : tr.unrecorded}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                            <div className="shrink-0 border-t border-[#F2F3F5] pt-2">
                                <div ref={auditListHorizontalRailRef} className="overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"><div style={{width: auditListTableWidth, height: 1}}/></div>
                                <div className="flex items-center justify-between py-2 text-[11px] text-[#86888F]">
                                    <span>{tr.loadedCount(visibleAuditLogs.length, totalCount)}</span>
                                    {visibleAuditLogs.length < totalCount ? <span>{tr.scrollForMore}</span> : null}
                                </div>
                            </div>
                        </>
                    ) : (
                        <EmptyPanel title={tr.noLogs} description={tr.noLogsDescription}/>
                    )}
                </section>

                <aside aria-label={selectedLogDetail ? tr.taskDetail(labelForAuditTask(selectedLogDetail, isZh)) : tr.selectTask} className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-[8px] border border-[#EBEEF5] bg-white dark:border-slate-800 dark:bg-slate-950">
                    {logDetailLoading ? (
                        <div className="flex min-h-[320px] flex-1 items-center justify-center gap-2 text-[12px] text-[#86888F]"><Loader2 className="h-4 w-4 animate-spin"/>{tr.loadingDetail}</div>
                    ) : selectedLogDetail ? (
                        <div className="h-full min-h-0 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <h2 className="text-[15px] font-semibold leading-6 text-[#0E1114]">{tr.taskDetail(labelForAuditTask(selectedLogDetail, isZh))}</h2>
                                    <p className="mt-1 truncate text-[11px] leading-5 text-[#86888F]" title={`${modelLabel} · ${formatLongDateTime(formatDisplayTime(selectedLogDetail))}`}>{modelLabel} · {formatLongDateTime(formatDisplayTime(selectedLogDetail))}</p>
                                </div>
                                <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-[4px] px-2 text-[11px]", statusTone(displayStatus))}>{displayStatusLabel}</span>
                            </div>

                            {flowAuditView?.rootNotice ? <div className="mt-4 rounded-[6px] bg-[rgba(255,171,36,0.12)] px-3 py-2 text-[11px] leading-5 text-[#D48806]">{flowAuditView.rootNotice}</div> : null}
                            {!flowAuditView?.rootNotice && invalidSummary ? <div className="mt-4 rounded-[6px] bg-[rgba(255,171,36,0.12)] px-3 py-2 text-[11px] leading-5 text-[#D48806]">{invalidSummary}</div> : null}

                            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
                                <MetaItem label={tr.relatedObject} value={selectedObjectLabel} accent/>
                                <MetaItem label={tr.currentStage} value={displayStageLabel}/>
                                <MetaItem label={tr.model} value={modelLabel}/>
                                <MetaItem label={tr.memorySource} value={labelForMemorySource(selectedLogDetail.memory_source)}/>
                                <MetaItem label={tr.skillUsage} value={skillUsageText}/>
                                <MetaItem label={tr.dimensionCount} value={selectedLogDetail.task_type === "resume_parse" ? tr.notApplicable : `${promptDimensionCount}${tr.dimensionCountSuffix}`}/>
                                {selectedLogDetail.screening_run_id ? <MetaItem label={tr.runId} value={selectedLogDetail.screening_run_id}/> : null}
                                <MetaItem label={tr.injectedPrompt} value={selectedLogDetail.task_type === "resume_parse" ? tr.notApplicable : skillsAppliedToPrompt ? tr.yes : tr.no}/>
                            </div>

                            {flowAuditView?.autoRequeueScheduled ? (
                                <section className="mt-5 space-y-2">
                                    <SectionTitle>{tr.retryInformation}</SectionTitle>
                                    <div className="grid grid-cols-3 gap-2">
                                        <MetaItem label={tr.retryCount} value={flowAuditView.infraRetryCount ?? tr.unrecorded}/>
                                        <MetaItem label={tr.retryAfter} value={flowAuditView.retryAfterSeconds != null ? `${flowAuditView.retryAfterSeconds}s` : tr.unrecorded}/>
                                        <MetaItem label={tr.nextRetryTime} value={flowAuditView.nextRetryAt ? formatLongDateTime(flowAuditView.nextRetryAt) : tr.unrecorded}/>
                                    </div>
                                </section>
                            ) : null}

                            <section className="mt-5 space-y-3">
                                <SectionTitle>{tr.taskFlow}</SectionTitle>
                                {flowAuditView?.inferredFromChildTerminal ? <div className="rounded-[6px] bg-[rgba(255,171,36,0.12)] px-3 py-2 text-[11px] leading-5 text-[#D48806]">{tr.inferredTerminal}</div> : null}
                                {flowItems.length ? (
                                    <div className="flex min-w-[460px] items-start overflow-x-auto pb-1">
                                        {flowItems.map((stage, index) => {
                                            const completed = isStageComplete(stage.status);
                                            const running = isStageRunning(stage.status);
                                            const failed = isStageFailed(stage.status);
                                            return (
                                                <React.Fragment key={stage.key}>
                                                    <div className="flex min-w-[76px] flex-1 flex-col items-center text-center">
                                                        <span className={cn("flex h-6 w-6 items-center justify-center rounded-full", completed ? "bg-[rgba(12,201,145,0.12)] text-[#0A9C71]" : running ? "bg-[rgba(46,156,255,0.1)] text-[#2E9CFF]" : failed ? "bg-[rgba(245,63,63,0.08)] text-[#F53F3F]" : "bg-[#F2F3F5] text-[#86888F]")}>{completed ? <Check className="h-3.5 w-3.5"/> : running ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : failed ? <X className="h-3.5 w-3.5"/> : <Circle className="h-2.5 w-2.5"/>}</span>
                                                        <span className="mt-1 text-[11px] leading-4 text-[#33353D]">{stage.title}</span>
                                                        <span className="text-[10px] leading-4 text-[#B0B2B8]" title={stage.detail}>{formatDurationValue(stage.duration) !== "-" ? formatDurationValue(stage.duration) : flowStatusLabel(stage.status, isZh)}</span>
                                                    </div>
                                                    {index < flowItems.length - 1 ? <div className="mt-3 h-px min-w-5 flex-1 bg-[#E6E7EB]"/> : null}
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                ) : <p className="rounded-[6px] bg-[#F7F8FA] px-3 py-2 text-[11px] text-[#86888F]">{tr.noTaskFlow}</p>}
                            </section>

                            <section className="mt-5 space-y-3">
                                <SectionTitle>{tr.timingBreakdown}</SectionTitle>
                                <div className="grid grid-cols-3 gap-2">
                                    {timingItems.map(([label, value, accent]) => (
                                        <div key={label} className="rounded-[6px] bg-[#F7F8FA] px-2 py-2.5 text-center">
                                            <p className={cn("text-[13px] font-semibold tabular-nums text-[#0E1114]", accent && "text-[#1E3BFA]")}>{formatDurationValue(value)}</p>
                                            <p className="mt-0.5 text-[10px] text-[#86888F]">{label}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="mt-5 space-y-2">
                                <SectionTitle>{tr.inputSummary}</SectionTitle>
                                <div className="max-h-[150px] overflow-auto rounded-[6px] bg-[#F7F8FA] px-3.5 py-3 text-[12px] leading-5 text-[#33353D]">{selectedLogDetail.input_summary || tr.unrecorded}</div>
                            </section>
                            <section className="mt-4 space-y-2">
                                <SectionTitle>{tr.outputSummary}</SectionTitle>
                                <div className="max-h-[150px] overflow-auto rounded-[6px] bg-[#F7F8FA] px-3.5 py-3 text-[12px] leading-5 text-[#33353D]">{sanitizeMessage(selectedLogDetail.output_summary) || tr.unrecorded}</div>
                            </section>
                            {sanitizeMessage(selectedLogDetail.error_message) ? (
                                <section className="mt-4 space-y-2">
                                    <SectionTitle>{tr.errorMessage}</SectionTitle>
                                    <div className="rounded-[6px] bg-[rgba(245,63,63,0.08)] px-3.5 py-3 text-[12px] leading-5 text-[#F53F3F]">{sanitizeMessage(selectedLogDetail.error_message)}</div>
                                </section>
                            ) : null}

                            <section className="mt-5 border-t border-[#F2F3F5] pt-4">
                                <SectionTitle>{tr.technicalDetails}</SectionTitle>
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                                    {technicalButtons.map((item) => (
                                        <button key={item.key} type="button" aria-expanded={openTechnicalSection === item.key} className={cn("text-[12px] text-[#0F23D9] hover:text-[#1E3BFA]", openTechnicalSection === item.key && "font-medium text-[#1E3BFA]")} onClick={() => setOpenTechnicalSection((current) => current === item.key ? null : item.key)}>{item.label}</button>
                                    ))}
                                </div>

                                {openTechnicalSection ? (
                                    <div className="mt-4 space-y-4 border-t border-[#F2F3F5] pt-4">
                                        {openTechnicalSection === "request" ? traceEntries.map((entry) => (
                                            <div key={entry.key} className="space-y-3">
                                                <p className="text-[12px] font-semibold text-[#0E1114]">{entry.label}</p>
                                                <CodePanel label={tr.promptSnapshot} value={entry.log.prompt_snapshot || tr.noTechnicalData}/>
                                                <CodePanel label={tr.fullModelRequest} value={entry.log.full_request_snapshot || tr.noTechnicalData}/>
                                            </div>
                                        )) : null}

                                        {openTechnicalSection === "response" ? traceEntries.map((entry) => (
                                            <div key={entry.key} className="space-y-3">
                                                <p className="text-[12px] font-semibold text-[#0E1114]">{entry.label}</p>
                                                <CodePanel label={tr.rawResponse} value={entry.log.raw_response_text || tr.noTechnicalData}/>
                                                <CodePanel label={tr.fullOutput} value={formatStructuredValue(entry.log.output_snapshot, entry.log.output_summary || tr.noTechnicalData)}/>
                                            </div>
                                        )) : null}

                                        {openTechnicalSection === "structured" ? (
                                            <>
                                                {auditNotice.show ? (
                                                    <div className={cn(auditNotice.containerClassName, "rounded-[6px] px-3 py-2 text-[11px] leading-5")}>
                                                        {invalidSummary ? <p className="font-medium">{invalidSummary}</p> : null}
                                                        {auditNotice.showSchemaReason && modelSchemaReason ? <p>{modelSchemaReason}</p> : null}
                                                        {auditNotice.showInvalidReasons ? invalidReasons.map((reason, index) => <p key={`${reason}-${index}`}>{index + 1}. {reason}</p>) : null}
                                                    </div>
                                                ) : null}
                                                <CodePanel label={tr.parsedJson} value={formatStructuredValue(selectedLogDetail.parsed_response_json, tr.noTechnicalData)}/>
                                                <CodePanel label={tr.sanitizedJson} value={formatStructuredValue(selectedLogDetail.sanitized_response_json, tr.noTechnicalData)}/>
                                                <CodePanel label={tr.validationMeta} value={formatStructuredValue(validationMeta, tr.noTechnicalData)}/>
                                                <section className="space-y-2">
                                                    <p className="text-[12px] font-medium text-[#33353D]">{tr.skillResolution}</p>
                                                    <div className="rounded-[6px] border border-[#EBEEF5] bg-[#F7F8FA] px-3.5 py-3 text-[11px] leading-5 text-[#33353D]">
                                                        <p>{skillUsageText}</p>
                                                        <p className="mt-1 text-[#86888F]">{tr.source}: {labelForSkillResolutionSource(selectedLogDetail.skill_resolution_source)} · {labelForMemorySource(selectedLogDetail.memory_source)}</p>
                                                        {skillResolutionDetail ? <pre className="mt-2 whitespace-pre-wrap break-words">{formatStructuredValue(skillResolutionDetail, tr.noSkillResolution)}</pre> : null}
                                                    </div>
                                                </section>
                                                <section className="space-y-2">
                                                    <p className="text-[12px] font-medium text-[#33353D]">{tr.scoreRuleSnapshot}</p>
                                                    {scoreRuleSnapshot.length ? (
                                                        <div className="grid gap-2 sm:grid-cols-2">
                                                            {scoreRuleSnapshot.map((item, index) => (
                                                                <div key={`${String(item.label || "rule")}-${index}`} className="rounded-[6px] border border-[#EBEEF5] bg-white px-3 py-2.5 text-[11px] leading-5 text-[#33353D]">
                                                                    <p className="font-medium text-[#0E1114]">{String(item.label || "-")} · {String(item.max_score || "-")}</p>
                                                                    <p className="text-[#86888F]">{String(item.skill_name || tr.unrecorded)}</p>
                                                                    <p>{String(item.note || tr.none)}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : <p className="rounded-[6px] bg-[#F7F8FA] px-3 py-2 text-[11px] text-[#86888F]">{tr.noRuleSnapshot}</p>}
                                                </section>
                                                {skillSnapshots.map((skill) => <CodePanel key={`${skill.skill_code}-${skill.id}`} label={skill.name} value={skill.content || tr.noTechnicalData}/>) }
                                            </>
                                        ) : null}

                                        {openTechnicalSection === "persisted" ? (
                                            <>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <MetaItem label="parse_result_id" value={String(persistedResultRefs?.parse_result_id || tr.unrecorded)}/>
                                                    <MetaItem label="score_result_id" value={String(persistedResultRefs?.score_result_id || tr.unrecorded)}/>
                                                    <MetaItem label={tr.finalSource} value={String(validationMeta?.final_response_source || outputRecord?.final_response_source || tr.unrecorded)}/>
                                                    <MetaItem label={tr.candidateStatus} value={String(persistedResultRefs?.candidate_status_after || tr.unrecorded)}/>
                                                </div>
                                                <CodePanel label={tr.persistedResult} value={formatStructuredValue(persistedResultRefs, tr.noTechnicalData)}/>
                                            </>
                                        ) : null}
                                    </div>
                                ) : null}
                            </section>
                        </div>
                    ) : (
                        <EmptyPanel title={tr.selectTask} description={tr.selectTaskDescription}/>
                    )}
                </aside>
            </div>
        </div>
    );
}
