"use client";

import React from "react";
import {createPortal} from "react-dom";
import {
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    FileText,
    Loader2,
    RefreshCw,
    Search,
    X,
} from "lucide-react";

import type {CandidateDetail, DepartmentReviewTask} from "@/lib/recruitment-api";
import {recruitmentApi} from "@/lib/recruitment-api";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {toast} from "@/lib/toast";
import {cn} from "@/lib/utils";
import {useI18n} from "@/lib/i18n";
import {formatActionError, formatDateTime} from "../utils";
import {resolveCandidateIdentity} from "../candidateIdentity";
import {CandidateAvatar} from "../components/CandidateAvatar";

type ReviewStatusFilter = "todo" | "completed" | "pending" | "deferred" | "passed" | "rejected";
type ReviewResultFilter = "all" | "pending" | "deferred" | "passed" | "rejected";
type ReviewDateFilter = "all" | "overdue" | "today" | "week" | "none";
type ReviewCreatedFilter = "all" | "today" | "week";
type ReviewDecision = "passed" | "rejected" | "deferred";
type FilterOption = {value: string; label: string; count?: number};

type ReviewWorkbenchPageProps = {
    panelClass: string;
    tasks: DepartmentReviewTask[];
    counts: {pending: number; deferred: number; completed: number; todo: number};
    loading: boolean;
    loadError?: string | null;
    activeFilter: ReviewStatusFilter;
    setActiveFilter: (filter: ReviewStatusFilter) => void;
    onRefresh: () => Promise<void>;
    canActReview: boolean;
    onDecision: (assignmentId: number, status: ReviewDecision, comment: string) => Promise<void>;
};

const PAGE_SIZE = 10;
const AVATAR_COLORS = ["#1E3BFA", "#2E9CFF", "#0CC991", "#FFAB24"];

const VISIBLE_SECTION_LABELS: Record<string, {zh: string; en: string}> = {
    original_resume: {zh: "原始简历", en: "Original resume"},
    standard_resume: {zh: "标准简历", en: "Structured resume"},
    screening_result: {zh: "初筛结果", en: "Screening result"},
    assessment_result: {zh: "测评结果", en: "Assessment result"},
    interview_feedback: {zh: "面试反馈", en: "Interview feedback"},
    attachments: {zh: "附件", en: "Attachments"},
};

function labelForReviewAssignmentStatus(status?: string | null, isZh = true) {
    switch (status) {
        case "passed":
            return isZh ? "已通过" : "Passed";
        case "rejected":
            return isZh ? "已淘汰" : "Rejected";
        case "deferred":
            return isZh ? "暂缓" : "Deferred";
        default:
            return isZh ? "待评审" : "Pending";
    }
}

function reviewBadgeStyle(status?: string | null) {
    switch (status) {
        case "passed":
            return {background: "rgba(12,201,145,0.1)", color: "#0CC991"};
        case "rejected":
            return {background: "rgba(245,63,63,0.08)", color: "#F53F3F"};
        case "deferred":
            return {background: "rgba(255,171,36,0.12)", color: "#D48806"};
        default:
            return {background: "rgba(255,171,36,0.12)", color: "#D48806"};
    }
}

function parseTimestamp(value?: string | null) {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function startOfTodayTimestamp() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function isWithinToday(value?: string | null) {
    const timestamp = parseTimestamp(value);
    if (timestamp === null) return false;
    const start = startOfTodayTimestamp();
    return timestamp >= start && timestamp < start + 24 * 60 * 60 * 1000;
}

function isWithinNextWeek(value?: string | null) {
    const timestamp = parseTimestamp(value);
    if (timestamp === null) return false;
    const now = Date.now();
    return timestamp >= now && timestamp <= now + 7 * 24 * 60 * 60 * 1000;
}

function isWithinRecentWeek(value?: string | null) {
    const timestamp = parseTimestamp(value);
    if (timestamp === null) return false;
    return timestamp >= Date.now() - 7 * 24 * 60 * 60 * 1000;
}

function uniqueOptions(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function countByValue(values: string[]) {
    return values.reduce<Record<string, number>>((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
}

function maskedContact(phone?: string | null, email?: string | null) {
    const normalizedPhone = String(phone || "").trim();
    if (normalizedPhone.length >= 7) {
        return `${normalizedPhone.slice(0, 3)}****${normalizedPhone.slice(-4)}`;
    }
    const normalizedEmail = String(email || "").trim();
    if (!normalizedEmail.includes("@")) return normalizedEmail || "-";
    const [name, domain] = normalizedEmail.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
}

function scoreText(value?: number | null, scale?: number | null) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
    const numericValue = Number(value);
    const numericScale = Number(scale);
    const normalized = Number.isFinite(numericScale) && numericScale > 0 && numericScale !== 10
        ? (numericValue / numericScale) * 10
        : numericValue > 10
            ? numericValue / 10
            : numericValue;
    return normalized.toFixed(1).replace(/\.0$/, ".0");
}

function matchText(value?: number | null) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
    return `${Math.round(Number(value))}%`;
}

function readStructuredText(source: unknown, keys: string[]): string | null {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    const record = source as Record<string, unknown>;
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" || typeof value === "number") {
            const text = String(value).trim();
            if (text) return text;
        }
    }
    return null;
}

function structuredRecords(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)));
}

function formatSkill(value: unknown) {
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
    return readStructuredText(value, ["name", "skill", "label", "title", "value"]) || "";
}

function FilterMenu({
    value,
    label,
    options,
    onChange,
}: {
    value: string;
    label: string;
    options: FilterOption[];
    onChange: (value: string) => void;
}) {
    const selected = options.find((option) => option.value === value) || options[0];
    const active = value !== "all";
    const [open, setOpen] = React.useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-[6px] px-2 text-[12px] transition-colors",
                        active ? "bg-[#F2F3F5] text-[#0E1114]" : "text-[#33353D] hover:bg-[#F7F8FA]",
                    )}
                >
                    <span className="truncate">{active ? selected?.label : label}</span>
                    {active && selected?.count !== undefined ? <span className="text-[#86888F]">{selected.count}</span> : null}
                    <ChevronDown className="h-3 w-3 shrink-0 text-[#86888F]"/>
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-52 rounded-[8px] border-[#E6E7EB] bg-white p-1.5 text-[#0E1114] shadow-[0_8px_24px_rgba(14,17,20,0.12)]">
                <div className="max-h-72 overflow-auto">
                    {options.map((option) => {
                        const checked = option.value === value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                    onChange(option.value);
                                    setOpen(false);
                                }}
                                className={cn(
                                    "flex h-9 w-full items-center justify-between gap-3 rounded-[6px] px-2.5 text-left text-[13px] transition-colors",
                                    checked ? "bg-[#F2F3F5] text-[#0E1114]" : "text-[#33353D] hover:bg-[#F7F8FA]",
                                )}
                            >
                                <span className="min-w-0 truncate">{option.label}</span>
                                <span className="inline-flex shrink-0 items-center gap-1.5">
                                    {option.count !== undefined ? <span className="text-[11px] text-[#86888F]">{option.count}</span> : null}
                                    {checked ? <Check className="h-3.5 w-3.5 text-[#1E3BFA]"/> : null}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function DetailField({label, value}: {label: string; value: React.ReactNode}) {
    return (
        <div className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-start gap-3 text-[12px] leading-5">
            <span className="text-[#86888F]">{label}</span>
            <span className="min-w-0 break-words text-[#0F1014]">{value || "-"}</span>
        </div>
    );
}

function interviewResultLabel(status?: string | null, isZh = true) {
    switch (status) {
        case "passed": return isZh ? "通过" : "Passed";
        case "rejected": return isZh ? "淘汰" : "Rejected";
        case "next_round": return isZh ? "进入下一轮" : "Next round";
        case "no_show": return isZh ? "未到场" : "No show";
        case "completed": return isZh ? "已完成" : "Completed";
        default: return isZh ? "待反馈" : "Pending feedback";
    }
}

export function ReviewWorkbenchPage({
    panelClass,
    tasks,
    counts,
    loading,
    loadError,
    activeFilter,
    setActiveFilter,
    onRefresh,
    canActReview,
    onDecision,
}: ReviewWorkbenchPageProps) {
    const {language} = useI18n();
    const isZh = language !== "en-US";
    const [query, setQuery] = React.useState("");
    const [creatorFilter, setCreatorFilter] = React.useState("all");
    const [resultFilter, setResultFilter] = React.useState<ReviewResultFilter>("all");
    const [dueFilter, setDueFilter] = React.useState<ReviewDateFilter>("all");
    const [createdFilter, setCreatedFilter] = React.useState<ReviewCreatedFilter>("all");
    const [positionFilter, setPositionFilter] = React.useState("all");
    const [commentByAssignment, setCommentByAssignment] = React.useState<Record<number, string>>({});
    const [submittingKey, setSubmittingKey] = React.useState<string | null>(null);
    const [page, setPage] = React.useState(1);
    const [detailTask, setDetailTask] = React.useState<DepartmentReviewTask | null>(null);
    const [detail, setDetail] = React.useState<CandidateDetail | null>(null);
    const [detailLoading, setDetailLoading] = React.useState(false);
    const [detailError, setDetailError] = React.useState<string | null>(null);
    const detailRequestIdRef = React.useRef(0);

    React.useEffect(() => {
        setCommentByAssignment((current) => {
            const next = {...current};
            for (const task of tasks) {
                if (next[task.assignment.id] === undefined) {
                    next[task.assignment.id] = task.assignment.comment || "";
                }
            }
            return next;
        });
    }, [tasks]);

    React.useEffect(() => {
        if (!detailTask) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !submittingKey) setDetailTask(null);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [detailTask, submittingKey]);

    const normalizedQuery = query.trim().toLowerCase();
    const creatorValues = React.useMemo(() => uniqueOptions(tasks.map((task) => task.batch.created_by)), [tasks]);
    const positionValues = React.useMemo(() => uniqueOptions(tasks.map((task) => (
        task.position?.title || task.candidate.position_title || (isZh ? "未分配岗位" : "Unassigned")
    ))), [isZh, tasks]);
    const creatorCounts = React.useMemo(() => countByValue(tasks.map((task) => String(task.batch.created_by || "").trim()).filter(Boolean)), [tasks]);
    const positionCounts = React.useMemo(() => countByValue(tasks.map((task) => (
        task.position?.title || task.candidate.position_title || (isZh ? "未分配岗位" : "Unassigned")
    ))), [isZh, tasks]);
    const resultCounts = React.useMemo(() => countByValue(tasks.map((task) => task.assignment.status || "pending")), [tasks]);
    const filterMenus = React.useMemo(() => ({
        creators: [
            {value: "all", label: isZh ? "发起人" : "Creator", count: tasks.length},
            ...creatorValues.map((creator) => ({value: creator, label: creator, count: creatorCounts[creator] || 0})),
        ],
        results: [
            {value: "all", label: isZh ? "评审结果" : "Result", count: tasks.length},
            {value: "pending", label: isZh ? "待评审" : "Pending", count: resultCounts.pending || 0},
            {value: "deferred", label: isZh ? "暂缓" : "Deferred", count: resultCounts.deferred || 0},
            {value: "passed", label: isZh ? "已通过" : "Passed", count: resultCounts.passed || 0},
            {value: "rejected", label: isZh ? "已淘汰" : "Rejected", count: resultCounts.rejected || 0},
        ],
        due: [
            {value: "all", label: isZh ? "到期时间" : "Due date"},
            {value: "overdue", label: isZh ? "已逾期" : "Overdue"},
            {value: "today", label: isZh ? "今日到期" : "Due today"},
            {value: "week", label: isZh ? "7天内到期" : "Due in 7 days"},
            {value: "none", label: isZh ? "未设置到期" : "No due date"},
        ],
        created: [
            {value: "all", label: isZh ? "创建时间" : "Created"},
            {value: "today", label: isZh ? "今天创建" : "Today"},
            {value: "week", label: isZh ? "近7天创建" : "Last 7 days"},
        ],
        positions: [
            {value: "all", label: isZh ? "应聘岗位" : "Position", count: tasks.length},
            ...positionValues.map((position) => ({value: position, label: position, count: positionCounts[position] || 0})),
        ],
    }), [creatorCounts, creatorValues, isZh, positionCounts, positionValues, resultCounts, tasks.length]);

    const visibleTasks = React.useMemo(() => tasks.filter((task) => {
        const {assignment, batch, candidate, position} = task;
        const positionTitle = position?.title || candidate.position_title || (isZh ? "未分配岗位" : "Unassigned");
        if (creatorFilter !== "all" && batch.created_by !== creatorFilter) return false;
        if (resultFilter !== "all" && assignment.status !== resultFilter) return false;
        if (positionFilter !== "all" && positionTitle !== positionFilter) return false;
        if (dueFilter === "overdue") {
            const dueAt = parseTimestamp(batch.due_at);
            if (dueAt === null || dueAt >= Date.now()) return false;
        }
        if (dueFilter === "today" && !isWithinToday(batch.due_at)) return false;
        if (dueFilter === "week" && !isWithinNextWeek(batch.due_at)) return false;
        if (dueFilter === "none" && batch.due_at) return false;
        if (createdFilter === "today" && !isWithinToday(batch.created_at)) return false;
        if (createdFilter === "week" && !isWithinRecentWeek(batch.created_at)) return false;
        if (!normalizedQuery) return true;
        return [
            candidate.name,
            candidate.phone,
            candidate.email,
            candidate.candidate_code,
            candidate.position_title,
            position?.title,
            batch.created_by,
            assignment.reviewer_name,
            assignment.reviewer_user_code,
        ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    }), [createdFilter, creatorFilter, dueFilter, isZh, normalizedQuery, positionFilter, resultFilter, tasks]);

    const pageCount = Math.max(1, Math.ceil(visibleTasks.length / PAGE_SIZE));
    const pagedTasks = visibleTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    React.useEffect(() => setPage(1), [activeFilter, createdFilter, creatorFilter, dueFilter, normalizedQuery, positionFilter, resultFilter]);
    React.useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount]);

    const tabs: Array<{key: ReviewStatusFilter; label: string; count: number}> = [
        {key: "todo", label: isZh ? "待评审" : "Todo", count: counts.todo || 0},
        {key: "completed", label: isZh ? "已完成" : "Completed", count: counts.completed || 0},
        {key: "pending", label: isZh ? "未处理" : "Pending", count: counts.pending || 0},
        {key: "deferred", label: isZh ? "暂缓" : "Deferred", count: counts.deferred || 0},
    ];

    const hasLocalFilters = Boolean(query.trim() || creatorFilter !== "all" || resultFilter !== "all" || dueFilter !== "all" || createdFilter !== "all" || positionFilter !== "all");
    const resetLocalFilters = () => {
        setQuery("");
        setCreatorFilter("all");
        setResultFilter("all");
        setDueFilter("all");
        setCreatedFilter("all");
        setPositionFilter("all");
    };

    const openDetail = React.useCallback(async (task: DepartmentReviewTask) => {
        const requestId = detailRequestIdRef.current + 1;
        detailRequestIdRef.current = requestId;
        setDetailTask(task);
        setDetail(null);
        setDetailError(null);
        setDetailLoading(true);
        try {
            const data = await recruitmentApi<CandidateDetail>(`/department-reviews/assignments/${task.assignment.id}/candidate`);
            if (detailRequestIdRef.current !== requestId) return;
            setDetail(data);
            setCommentByAssignment((current) => ({
                ...current,
                [task.assignment.id]: current[task.assignment.id] ?? data.department_review_context?.assignment.comment ?? "",
            }));
        } catch (error) {
            if (detailRequestIdRef.current !== requestId) return;
            setDetailError(formatActionError(error));
        } finally {
            if (detailRequestIdRef.current === requestId) setDetailLoading(false);
        }
    }, []);

    const closeDetail = () => {
        detailRequestIdRef.current += 1;
        setDetailTask(null);
        setDetail(null);
        setDetailError(null);
        setDetailLoading(false);
    };

    const submitDecision = async (task: DepartmentReviewTask, status: ReviewDecision, closeAfter = false) => {
        if (!canActReview || !["pending", "deferred"].includes(task.assignment.status)) return;
        const key = `${task.assignment.id}:${status}`;
        setSubmittingKey(key);
        try {
            await onDecision(task.assignment.id, status, commentByAssignment[task.assignment.id] || "");
            setCommentByAssignment((current) => ({...current, [task.assignment.id]: ""}));
            if (closeAfter) closeDetail();
        } catch (error) {
            toast.error(isZh ? `提交评审结果失败：${formatActionError(error)}` : `Failed to submit review result: ${formatActionError(error)}`);
        } finally {
            setSubmittingKey(null);
        }
    };

    const detailCandidate = detail?.candidate || detailTask?.candidate || null;
    const detailIdentity = resolveCandidateIdentity(detailCandidate || {});
    const detailAssignment = detail?.department_review_context?.assignment || detailTask?.assignment || null;
    const detailBatch = detail?.department_review_context?.batch || detailTask?.batch || null;
    const detailPosition = detailTask?.position?.title || detailCandidate?.position_title || (isZh ? "未分配岗位" : "Unassigned");
    const detailVisibleSections = detailBatch?.visible_sections || [];
    const workRecords = structuredRecords(detail?.parse_result?.work_experiences).slice(0, 3);
    const educationRecords = structuredRecords(detail?.parse_result?.education_experiences).slice(0, 2);
    const skills = Array.isArray(detail?.parse_result?.skills)
        ? detail.parse_result.skills.map(formatSkill).filter(Boolean).slice(0, 12)
        : [];
    const recommendation = detail?.score?.recommendation || detailCandidate?.display_status_reason || (isZh ? "暂无 AI 初筛建议" : "No AI recommendation available");
    const aiSummary = [
        ...(detail?.score?.advantages || []).slice(0, 2),
        ...(detail?.score?.concerns || []).slice(0, 1),
    ].filter(Boolean).join(isZh ? "；" : "; ") || detail?.parse_result?.summary || (isZh ? "暂无可展示的初筛摘要。" : "No screening summary is available.");
    const resumeFile = detail?.resume_files?.[0] || null;
    const canDecideDetail = Boolean(canActReview && detailAssignment && ["pending", "deferred"].includes(detailAssignment.status));

    return (
        <section className={cn(panelClass, "h-full min-h-0 overflow-hidden !border-0 !bg-white !p-0 !shadow-none")}>
            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white px-8 pb-12 pt-5 font-[Inter,'PingFang_SC','Microsoft_YaHei',-apple-system,sans-serif] text-[#0E1114]">
                <div className="flex shrink-0 items-start justify-between gap-8">
                    <div className="flex h-10 items-start gap-7">
                        {tabs.map((tab, index) => {
                            const active = activeFilter === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => {
                                        setActiveFilter(tab.key);
                                        setResultFilter("all");
                                    }}
                                    className={cn(
                                        "relative inline-flex h-10 items-center gap-2 text-[15px] transition-colors",
                                        active ? "font-semibold text-[#0E1114]" : "font-normal text-[#33353D] hover:text-[#0E1114]",
                                    )}
                                >
                                    {index === 0 ? (
                                        <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#1E3BFA] text-white">
                                            <ClipboardCheck className="h-4 w-4" strokeWidth={1.8}/>
                                        </span>
                                    ) : null}
                                    <span>{tab.label}</span>
                                    <span className="text-[11px] font-normal text-[#86888F]">{tab.count}</span>
                                    {active ? <span className="absolute bottom-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-full bg-[#1E3BFA]"/> : null}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="relative block w-[340px] max-w-[32vw]">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B0B2B8]" strokeWidth={1.7}/>
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                className="h-9 w-full rounded-[6px] border border-[#E6E7EB] bg-white pl-9 pr-3 text-[12px] text-[#33353D] outline-none transition-colors placeholder:text-[#B0B2B8] focus:border-[#1E3BFA]"
                                placeholder={isZh ? "搜索候选人、岗位、联系方式" : "Search candidate, position or contact"}
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => void onRefresh()}
                            disabled={loading}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#E6E7EB] bg-white text-[#33353D] transition-colors hover:border-[#1E3BFA] hover:text-[#1E3BFA] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={isZh ? "刷新评审任务" : "Refresh review tasks"}
                            title={isZh ? "刷新" : "Refresh"}
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4" strokeWidth={1.7}/>}
                        </button>
                    </div>
                </div>

                <div className="mt-3 flex h-8 shrink-0 items-center gap-2">
                    <FilterMenu value={creatorFilter} label={isZh ? "发起人" : "Creator"} options={filterMenus.creators} onChange={setCreatorFilter}/>
                    <FilterMenu value={resultFilter} label={isZh ? "评审结果" : "Result"} options={filterMenus.results} onChange={(value) => setResultFilter(value as ReviewResultFilter)}/>
                    <FilterMenu value={dueFilter} label={isZh ? "到期时间" : "Due date"} options={filterMenus.due} onChange={(value) => setDueFilter(value as ReviewDateFilter)}/>
                    <FilterMenu value={createdFilter} label={isZh ? "创建时间" : "Created"} options={filterMenus.created} onChange={(value) => setCreatedFilter(value as ReviewCreatedFilter)}/>
                    <FilterMenu value={positionFilter} label={isZh ? "应聘岗位" : "Position"} options={filterMenus.positions} onChange={setPositionFilter}/>
                    <button
                        type="button"
                        onClick={resetLocalFilters}
                        disabled={!hasLocalFilters}
                        className="h-8 rounded-[6px] px-2 text-[12px] text-[#0F23D9] transition-colors hover:bg-[rgba(30,59,250,0.06)] disabled:cursor-default disabled:text-[#B0B2B8] disabled:hover:bg-transparent"
                    >
                        {isZh ? "清空筛选" : "Clear filters"}
                    </button>
                </div>

                <div className="mt-2 min-h-0 flex-1 overflow-auto">
                    <div className="min-w-[1100px]">
                        <div className="grid h-10 grid-cols-[300px_minmax(300px,1fr)_280px_220px] items-center border-b border-[#EBEEF5] text-[12px] text-[#86888F]">
                            <span className="pl-3">{isZh ? "候选人" : "Candidate"}</span>
                            <span>{isZh ? "评审信息" : "Review"}</span>
                            <span>{isZh ? "发起信息" : "Created"}</span>
                            <span>{isZh ? "操作" : "Actions"}</span>
                        </div>

                        {loading && !tasks.length ? (
                            <div className="flex min-h-[420px] items-center justify-center gap-2 text-[13px] text-[#86888F]">
                                <Loader2 className="h-4 w-4 animate-spin text-[#1E3BFA]"/>
                                {isZh ? "正在加载评审任务..." : "Loading review tasks..."}
                            </div>
                        ) : loadError ? (
                            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(245,63,63,0.08)] text-[#F53F3F]">
                                    <X className="h-5 w-5"/>
                                </div>
                                <p className="text-[14px] font-medium text-[#0E1114]">{isZh ? "评审任务加载失败" : "Failed to load review tasks"}</p>
                                <p className="max-w-lg text-[12px] text-[#86888F]">{loadError}</p>
                                <button type="button" onClick={() => void onRefresh()} className="h-8 rounded-[6px] bg-[#1E3BFA] px-4 text-[12px] text-white hover:bg-[#0F23D9]">
                                    {isZh ? "重新加载" : "Retry"}
                                </button>
                            </div>
                        ) : pagedTasks.length ? pagedTasks.map((task) => {
                            const {assignment, candidate, batch} = task;
                            const identity = resolveCandidateIdentity(candidate);
                            const positionTitle = task.position?.title || candidate.position_title || (isZh ? "未分配岗位" : "Unassigned");
                            const comment = commentByAssignment[assignment.id] || "";
                            const actionable = canActReview && ["pending", "deferred"].includes(assignment.status);
                            const dueTimestamp = parseTimestamp(batch.due_at);
                            const dueColor = dueTimestamp !== null && dueTimestamp < Date.now() && actionable ? "#F53F3F" : batch.due_at ? "#86888F" : "#B0B2B8";
                            return (
                                <article key={assignment.id} className="grid min-h-[104px] grid-cols-[300px_minmax(300px,1fr)_280px_220px] items-center border-b border-[#EBEEF5] py-2.5 transition-colors hover:bg-[#F8F8F9]">
                                    <div className="flex min-w-0 items-center gap-3 pl-3 pr-5">
                                        <CandidateAvatar identity={identity} className="h-9 w-9 text-[13px] font-medium text-white" style={{background: AVATAR_COLORS[candidate.id % AVATAR_COLORS.length]}}/>
                                        <div className="min-w-0">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <button type="button" onClick={() => void openDetail(task)} className="truncate text-left text-[13px] font-medium text-[#0F23D9] hover:underline">
                                                    {identity.displayName}
                                                </button>
                                                <span className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px]" style={reviewBadgeStyle(assignment.status)}>
                                                    {labelForReviewAssignmentStatus(assignment.status, isZh)}
                                                </span>
                                            </div>
                                            <p className="mt-1 truncate text-[11px] text-[#86888F]">{positionTitle} · {maskedContact(candidate.phone, candidate.email)}</p>
                                        </div>
                                    </div>
                                    <div className="min-w-0 pr-7">
                                        <div className="flex items-center gap-2 text-[12px] text-[#33353D]">
                                            <span>{isZh ? "AI 匹配度" : "AI match"} <strong className="font-medium text-[#0CC991]">{matchText(candidate.match_percent)}</strong></span>
                                            <span className="text-[#86888F]">{isZh ? "总分" : "Score"} {scoreText(candidate.latest_total_score)} / 10</span>
                                        </div>
                                        {actionable ? (
                                            <textarea
                                                value={comment}
                                                onChange={(event) => setCommentByAssignment((current) => ({...current, [assignment.id]: event.target.value}))}
                                                rows={2}
                                                placeholder={isZh ? "填写评审意见" : "Add review comments"}
                                                className="mt-2 h-[52px] w-full resize-none rounded-[6px] border border-[#E6E7EB] bg-white px-3 py-2 text-[12px] leading-5 text-[#33353D] outline-none placeholder:text-[#B0B2B8] focus:border-[#1E3BFA]"
                                            />
                                        ) : (
                                            <p className="mt-2 line-clamp-2 min-h-[20px] text-[12px] leading-5 text-[#33353D]">{assignment.comment || (isZh ? "未填写评审意见" : "No review comment")}</p>
                                        )}
                                    </div>
                                    <div className="min-w-0 space-y-1 pr-7 text-[11px] leading-5 text-[#86888F]">
                                        <p className="truncate">{isZh ? "发起人" : "Creator"}：<span className="text-[#33353D]">{batch.created_by || "-"}</span></p>
                                        <p className="truncate">{isZh ? "创建" : "Created"}：{formatDateTime(batch.created_at)}</p>
                                        <p className="truncate" style={{color: dueColor}}>{isZh ? "截止" : "Due"}：{batch.due_at ? formatDateTime(batch.due_at) : (isZh ? "未设置" : "Not set")}</p>
                                    </div>
                                    <div className="flex items-center gap-2 pr-3">
                                        <button type="button" onClick={() => void openDetail(task)} className="h-7 rounded-[6px] border border-[#E6E7EB] bg-white px-3.5 text-[12px] text-[#33353D] transition-colors hover:border-[#1E3BFA] hover:text-[#1E3BFA]">
                                            {isZh ? "详情" : "Details"}
                                        </button>
                                        {actionable ? (
                                            <>
                                                <button type="button" onClick={() => void submitDecision(task, "rejected")} disabled={Boolean(submittingKey)} className="h-7 rounded-[6px] border border-[rgba(245,63,63,0.4)] bg-white px-3.5 text-[12px] text-[#F53F3F] transition-colors hover:bg-[rgba(245,63,63,0.06)] disabled:opacity-50">
                                                    {submittingKey === `${assignment.id}:rejected` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : (isZh ? "淘汰" : "Reject")}
                                                </button>
                                                <button type="button" onClick={() => void submitDecision(task, "passed")} disabled={Boolean(submittingKey)} className="h-7 rounded-[6px] bg-[#1E3BFA] px-3.5 text-[12px] text-white transition-colors hover:bg-[#0F23D9] disabled:opacity-50">
                                                    {submittingKey === `${assignment.id}:passed` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : (isZh ? "通过" : "Pass")}
                                                </button>
                                            </>
                                        ) : null}
                                    </div>
                                </article>
                            );
                        }) : (
                            <div className="flex min-h-[420px] flex-col items-center justify-center gap-2.5 py-16 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F2F3F5] text-[#1E3BFA]">
                                    <ClipboardCheck className="h-5 w-5" strokeWidth={1.7}/>
                                </div>
                                <p className="text-[14px] font-medium text-[#0E1114]">{isZh ? "暂无评审任务" : "No review tasks"}</p>
                                <p className="text-[12px] text-[#86888F]">{hasLocalFilters ? (isZh ? "当前筛选条件下没有匹配结果" : "No tasks match the current filters") : (isZh ? "当前状态下没有评审任务" : "There are no tasks in this state")}</p>
                                {hasLocalFilters ? <button type="button" onClick={resetLocalFilters} className="mt-1 h-8 rounded-[6px] border border-[#1E3BFA] px-4 text-[12px] text-[#1E3BFA] hover:bg-[rgba(30,59,250,0.06)]">{isZh ? "清空筛选" : "Clear filters"}</button> : null}
                            </div>
                        )}
                    </div>
                </div>

                {!loading && !loadError && visibleTasks.length ? (
                    <div className="flex h-12 shrink-0 items-end justify-between text-[12px] text-[#86888F]">
                        <span>{isZh ? `共 ${visibleTasks.length} 条` : `${visibleTasks.length} total`}</span>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-[#E6E7EB] px-3 text-[#33353D] hover:border-[#1E3BFA] hover:text-[#1E3BFA] disabled:cursor-not-allowed disabled:text-[#B0B2B8]">
                                <ChevronLeft className="h-3.5 w-3.5"/>{isZh ? "上一页" : "Previous"}
                            </button>
                            <span className="flex h-8 min-w-8 items-center justify-center rounded-[6px] bg-[#1E3BFA] px-2 text-white">{page}</span>
                            <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount} className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-[#E6E7EB] px-3 text-[#33353D] hover:border-[#1E3BFA] hover:text-[#1E3BFA] disabled:cursor-not-allowed disabled:text-[#B0B2B8]">
                                {isZh ? "下一页" : "Next"}<ChevronRight className="h-3.5 w-3.5"/>
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            {detailTask && detailCandidate && detailAssignment && detailBatch ? createPortal((
                <div className="fixed inset-0 z-[200] font-[Inter,'PingFang_SC','Microsoft_YaHei',-apple-system,sans-serif]">
                    <button type="button" aria-label={isZh ? "关闭评审详情" : "Close review details"} onClick={closeDetail} className="absolute inset-0 h-full w-full bg-[rgba(14,17,20,0.45)]"/>
                    <aside className="absolute inset-y-0 right-0 flex w-[min(820px,100vw)] flex-col bg-white text-[#0E1114] shadow-[-8px_0_24px_rgba(14,17,20,0.12)]">
                        <header className="flex h-[88px] shrink-0 items-center gap-3 border-b border-[#F2F3F5] px-7">
                            <CandidateAvatar identity={detailIdentity} className="h-[46px] w-[46px] text-[15px] font-semibold text-white" style={{background: AVATAR_COLORS[detailCandidate.id % AVATAR_COLORS.length]}}/>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="truncate text-[16px] font-semibold text-[#0E1114]">{detailIdentity.displayName}</h2>
                                    <span className="rounded-[4px] px-1.5 py-0.5 text-[10px]" style={reviewBadgeStyle(detailAssignment.status)}>{labelForReviewAssignmentStatus(detailAssignment.status, isZh)}</span>
                                    <span className="rounded-[4px] bg-[rgba(30,59,250,0.08)] px-1.5 py-0.5 text-[10px] text-[#0F23D9]">{isZh ? "AI 匹配度" : "AI match"} {matchText(detailCandidate.match_percent)}</span>
                                </div>
                                <p className="mt-1 truncate text-[11px] text-[#86888F]">{detailPosition} · {detailCandidate.education || "-"} · {detailCandidate.years_of_experience || "-"} · {detailCandidate.city || detailCandidate.expected_city || "-"} · {maskedContact(detailCandidate.phone, detailCandidate.email)}</p>
                            </div>
                            <button type="button" onClick={closeDetail} disabled={Boolean(submittingKey)} className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#86888F] hover:bg-[#F2F3F5] hover:text-[#0E1114] disabled:opacity-50" aria-label={isZh ? "关闭" : "Close"}>
                                <X className="h-4 w-4"/>
                            </button>
                        </header>

                        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
                            {detailLoading ? (
                                <div className="flex min-h-[480px] items-center justify-center gap-2 text-[13px] text-[#86888F]"><Loader2 className="h-4 w-4 animate-spin text-[#1E3BFA]"/>{isZh ? "正在加载评审资料..." : "Loading review details..."}</div>
                            ) : detailError ? (
                                <div className="flex min-h-[480px] flex-col items-center justify-center gap-3 text-center">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(245,63,63,0.08)] text-[#F53F3F]"><X className="h-5 w-5"/></div>
                                    <p className="text-[14px] font-medium">{isZh ? "评审资料加载失败" : "Failed to load review details"}</p>
                                    <p className="max-w-md text-[12px] text-[#86888F]">{detailError}</p>
                                    <button type="button" onClick={() => void openDetail(detailTask)} className="h-8 rounded-[6px] bg-[#1E3BFA] px-4 text-[12px] text-white hover:bg-[#0F23D9]">{isZh ? "重新加载" : "Retry"}</button>
                                </div>
                            ) : detail ? (
                                <div className="space-y-6">
                                    <section className="flex min-h-[84px] items-center rounded-[10px] bg-[#F7F8FA] px-5 py-4">
                                        <div className="flex w-[86px] shrink-0 flex-col items-center justify-center border-r border-[#E6E7EB] pr-5">
                                            <strong className="text-[30px] font-semibold leading-8 text-[#0CC991]">{scoreText(detail.score?.total_score ?? detailCandidate.latest_total_score, detail.score?.total_score_scale)}</strong>
                                            <span className="mt-1 text-[10px] text-[#86888F]">{isZh ? "初筛总分 / 10" : "Screening / 10"}</span>
                                        </div>
                                        <div className="min-w-0 pl-5">
                                            <p className="text-[13px] font-semibold text-[#0E1114]">{isZh ? "AI 初筛建议：" : "AI recommendation: "}{recommendation}</p>
                                            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#33353D]">{aiSummary}</p>
                                        </div>
                                    </section>

                                    <section>
                                        <h3 className="mb-3 text-[14px] font-semibold text-[#0E1114]">{isZh ? "发起信息" : "Review request"}</h3>
                                        <div className="grid grid-cols-2 gap-x-10 gap-y-2">
                                            <DetailField label={isZh ? "发起人" : "Creator"} value={detailBatch.created_by || "-"}/>
                                            <DetailField label={isZh ? "应聘岗位" : "Position"} value={detailPosition}/>
                                            <DetailField label={isZh ? "创建时间" : "Created"} value={formatDateTime(detailBatch.created_at)}/>
                                            <DetailField label={isZh ? "评审截止" : "Due"} value={detailBatch.due_at ? formatDateTime(detailBatch.due_at) : (isZh ? "未设置" : "Not set")}/>
                                        </div>
                                        <p className="mt-3 rounded-[6px] bg-[#F7F8FA] px-3 py-2 text-[12px] leading-5 text-[#33353D]">{detailBatch.message || (isZh ? "发起人未填写额外说明，请结合开放的初筛结果与简历评估。" : "No additional note was provided. Please review the shared screening results and resume.")}</p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {detailVisibleSections.map((section) => <span key={section} className="rounded-[4px] bg-[#F2F3F5] px-2 py-1 text-[10px] text-[#86888F]">{VISIBLE_SECTION_LABELS[section]?.[isZh ? "zh" : "en"] || section}</span>)}
                                        </div>
                                    </section>

                                    <section>
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <h3 className="text-[14px] font-semibold text-[#0E1114]">{isZh ? "候选人资料" : "Candidate profile"}</h3>
                                            {resumeFile && detailVisibleSections.includes("original_resume") ? (
                                                <a href={`/api/recruitment/department-reviews/assignments/${detailAssignment.id}/resume-files/${resumeFile.id}/download`} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[#E6E7EB] px-3 text-[12px] text-[#33353D] hover:border-[#1E3BFA] hover:text-[#1E3BFA]">
                                                    <FileText className="h-3.5 w-3.5"/>{isZh ? "查看原始简历" : "View original resume"}
                                                </a>
                                            ) : null}
                                        </div>
                                        {detail.parse_result ? (
                                            <div className="rounded-[10px] border border-[#E6E7EB] p-4">
                                                {workRecords.length ? (
                                                    <div>
                                                        <h4 className="text-[13px] font-medium text-[#33353D]">{isZh ? "工作经历" : "Work experience"}</h4>
                                                        <div className="mt-3 space-y-4">
                                                            {workRecords.map((work, index) => {
                                                                const company = readStructuredText(work, ["company", "company_name", "employer", "organization"]);
                                                                const role = readStructuredText(work, ["position", "title", "job_title", "role"]);
                                                                const start = readStructuredText(work, ["start_date", "start", "from"]);
                                                                const end = readStructuredText(work, ["end_date", "end", "to"]);
                                                                const description = readStructuredText(work, ["description", "responsibilities", "summary", "highlights", "content"]);
                                                                return (
                                                                    <div key={`${company || "work"}-${index}`} className={cn(index > 0 && "border-t border-[#F2F3F5] pt-4")}>
                                                                        <p className="text-[12px] font-medium text-[#0F1014]">{[company, role, [start, end].filter(Boolean).join(" – ")].filter(Boolean).join(" · ") || (isZh ? "工作经历" : "Work experience")}</p>
                                                                        {description ? <p className="mt-1 text-[12px] leading-[1.8] text-[#33353D]">{description}</p> : null}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ) : educationRecords.length ? (
                                                    <div>
                                                        <h4 className="text-[13px] font-medium text-[#33353D]">{isZh ? "教育经历" : "Education"}</h4>
                                                        <div className="mt-3 space-y-2">{educationRecords.map((education, index) => <p key={index} className="text-[12px] text-[#33353D]">{[readStructuredText(education, ["school", "school_name", "institution"]), readStructuredText(education, ["degree", "education", "qualification"]), readStructuredText(education, ["major", "field", "specialization"])].filter(Boolean).join(" · ") || "-"}</p>)}</div>
                                                    </div>
                                                ) : <p className="text-[12px] text-[#86888F]">{detail.parse_result.summary || (isZh ? "标准简历中暂无结构化经历信息" : "No structured experience is available")}</p>}
                                                {skills.length ? <div className="mt-4 flex flex-wrap gap-2">{skills.map((skill) => <span key={skill} className="rounded-[4px] bg-[#F2F3F5] px-2 py-1 text-[10px] text-[#33353D]">{skill}</span>)}</div> : null}
                                            </div>
                                        ) : (
                                            <div className="rounded-[10px] border border-dashed border-[#E6E7EB] px-4 py-7 text-center text-[12px] text-[#86888F]">{isZh ? "本次评审未开放标准简历，或暂无可展示的结构化简历。" : "The structured resume is not shared for this review or is unavailable."}</div>
                                        )}
                                    </section>

                                    {detailVisibleSections.includes("interview_feedback") ? (
                                        <section>
                                            <h3 className="mb-3 text-[14px] font-semibold text-[#0E1114]">{isZh ? "面试反馈" : "Interview feedback"}</h3>
                                            {detail.interview_schedules?.length ? (
                                                <div className="space-y-2">
                                                    {detail.interview_schedules.map((schedule) => (
                                                        <div key={schedule.id} className="rounded-[10px] border border-[#E6E7EB] px-4 py-3">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <p className="text-[12px] font-medium text-[#0F1014]">{schedule.round_name || (isZh ? "面试" : "Interview")} · {schedule.interviewer_name || "-"}</p>
                                                                <span className="rounded-[4px] bg-[#F2F3F5] px-2 py-1 text-[10px] text-[#33353D]">{interviewResultLabel(schedule.result_status || schedule.status, isZh)}</span>
                                                            </div>
                                                            <p className="mt-1 text-[11px] text-[#86888F]">{schedule.scheduled_at ? formatDateTime(schedule.scheduled_at) : "-"}</p>
                                                            <p className="mt-2 text-[12px] leading-5 text-[#33353D]">{schedule.result_comment || (isZh ? "暂无面试反馈" : "No interview feedback")}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : <div className="rounded-[10px] border border-dashed border-[#E6E7EB] px-4 py-7 text-center text-[12px] text-[#86888F]">{isZh ? "暂无面试反馈" : "No interview feedback"}</div>}
                                        </section>
                                    ) : null}

                                    <section>
                                        <h3 className="mb-3 text-[14px] font-semibold text-[#0E1114]">{isZh ? "评审意见" : "Review comment"}</h3>
                                        {canDecideDetail ? (
                                            <textarea
                                                value={commentByAssignment[detailAssignment.id] || ""}
                                                onChange={(event) => setCommentByAssignment((current) => ({...current, [detailAssignment.id]: event.target.value}))}
                                                rows={4}
                                                placeholder={isZh ? "填写评审意见（结论将同步给发起人）" : "Add a review comment (the requester will be notified)"}
                                                className="h-24 w-full resize-none rounded-[6px] border border-[#E6E7EB] px-3 py-2 text-[12px] leading-5 text-[#33353D] outline-none placeholder:text-[#B0B2B8] focus:border-[#1E3BFA]"
                                            />
                                        ) : (
                                            <div className="min-h-20 rounded-[6px] border border-[#E6E7EB] bg-[#F7F8FA] px-3 py-2 text-[12px] leading-5 text-[#33353D]">{detailAssignment.comment || (isZh ? "未填写评审意见" : "No review comment")}</div>
                                        )}
                                    </section>
                                </div>
                            ) : null}
                        </div>

                        <footer className="flex h-[68px] shrink-0 items-center justify-between border-t border-[#F2F3F5] px-7">
                            <p className="text-[11px] text-[#86888F]">{isZh ? "评审结论将同步给发起人并写入审计中心" : "The decision is shared with the requester and recorded in Audit"}</p>
                            {canDecideDetail ? (
                                <div className="flex items-center gap-3">
                                    <button type="button" disabled={Boolean(submittingKey)} onClick={() => void submitDecision(detailTask, "deferred", true)} className="h-9 rounded-[6px] border border-[rgba(255,171,36,0.5)] px-[18px] text-[13px] text-[#D48806] hover:bg-[rgba(255,171,36,0.08)] disabled:opacity-50">{submittingKey === `${detailAssignment.id}:deferred` ? <Loader2 className="h-4 w-4 animate-spin"/> : (isZh ? "暂缓" : "Defer")}</button>
                                    <button type="button" disabled={Boolean(submittingKey)} onClick={() => void submitDecision(detailTask, "rejected", true)} className="h-9 rounded-[6px] border border-[rgba(245,63,63,0.4)] px-[18px] text-[13px] text-[#F53F3F] hover:bg-[rgba(245,63,63,0.06)] disabled:opacity-50">{submittingKey === `${detailAssignment.id}:rejected` ? <Loader2 className="h-4 w-4 animate-spin"/> : (isZh ? "淘汰" : "Reject")}</button>
                                    <button type="button" disabled={Boolean(submittingKey)} onClick={() => void submitDecision(detailTask, "passed", true)} className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[#1E3BFA] px-[18px] text-[13px] text-white hover:bg-[#0F23D9] disabled:opacity-50">{submittingKey === `${detailAssignment.id}:passed` ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Check className="h-4 w-4"/>{isZh ? "通过评审" : "Pass review"}</>}</button>
                                </div>
                            ) : <span className="text-[12px] text-[#86888F]">{isZh ? "该评审已完成或当前账号仅可查看" : "This review is completed or read-only"}</span>}
                        </footer>
                    </aside>
                </div>
            ), document.body) : null}
        </section>
    );
}
