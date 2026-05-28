"use client";

import React from "react";
import {Check, ChevronDown, ClipboardCheck, Loader2, RefreshCw, Search, X} from "lucide-react";

import type {DepartmentReviewTask} from "@/lib/recruitment-api";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Textarea} from "@/components/ui/textarea";
import {toast} from "@/lib/toast";
import {cn} from "@/lib/utils";
import {useI18n} from "@/lib/i18n";
import {formatActionError, formatDateTime, labelForCandidateStatus} from "../utils";

type ReviewStatusFilter = "todo" | "completed" | "pending" | "deferred" | "passed" | "rejected";
type ReviewResultFilter = "all" | "pending" | "deferred" | "passed" | "rejected";
type ReviewDateFilter = "all" | "overdue" | "today" | "week" | "none";
type ReviewCreatedFilter = "all" | "today" | "week";
type FilterOption = {value: string; label: string; count?: number};

type ReviewWorkbenchPageProps = {
    panelClass: string;
    tasks: DepartmentReviewTask[];
    counts: {pending: number; deferred: number; completed: number; todo: number};
    loading: boolean;
    activeFilter: ReviewStatusFilter;
    setActiveFilter: (filter: ReviewStatusFilter) => void;
    onRefresh: () => Promise<void>;
    onOpenCandidate: (task: DepartmentReviewTask) => void;
    onDecision: (assignmentId: number, status: "passed" | "rejected", comment: string) => Promise<void>;
};

const decisionLabels = {
    passed: {zh: "通过", en: "Pass"},
    rejected: {zh: "淘汰", en: "Reject"},
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

function reviewBadgeClass(status?: string | null) {
    switch (status) {
        case "passed":
            return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200";
        case "rejected":
            return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200";
        case "deferred":
            return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200";
        default:
            return "border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
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

function FilterMenu({
    value,
    label,
    options,
    onChange,
    disabled,
    className,
}: {
    value: string;
    label: string;
    options: FilterOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}) {
    const selected = options.find((option) => option.value === value) || options[0];
    const active = value !== "all";
    const [open, setOpen] = React.useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                        "inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition",
                        active
                            ? "border border-[#171717]/20 bg-neutral-100 text-[#171717] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                            : "border border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200",
                        disabled && "cursor-not-allowed opacity-45",
                        className,
                    )}
                >
                    <span className="truncate">{active ? selected?.label : label}</span>
                    {selected?.count !== undefined && active ? (
                        <span className="text-xs text-neutral-500">{selected.count}</span>
                    ) : null}
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-current opacity-60"/>
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-52 rounded-xl border-gray-100 p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-950">
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
                                    "flex h-9 w-full items-center justify-between gap-3 rounded-[6px] px-2.5 text-left text-sm transition",
                                    checked
                                        ? "bg-neutral-100 text-[#171717] dark:bg-slate-800 dark:text-slate-100"
                                        : "text-gray-600 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-900",
                                )}
                            >
                                <span className="min-w-0 truncate">{option.label}</span>
                                <span className="inline-flex shrink-0 items-center gap-1.5">
                                    {option.count !== undefined ? <span className="text-xs text-slate-400">{option.count}</span> : null}
                                    {checked ? <Check className="h-3.5 w-3.5"/> : null}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export function ReviewWorkbenchPage({
    panelClass,
    tasks,
    counts,
    loading,
    activeFilter,
    setActiveFilter,
    onRefresh,
    onOpenCandidate,
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
    const visibleTasks = React.useMemo(() => {
        return tasks.filter((task) => {
            const assignment = task.assignment;
            const batch = task.batch;
            const candidate = task.candidate;
            const position = task.position;
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
        });
    }, [createdFilter, creatorFilter, dueFilter, isZh, normalizedQuery, positionFilter, resultFilter, tasks]);

    const filters: Array<{key: ReviewStatusFilter; label: string; count: number}> = [
        {key: "todo", label: isZh ? "待评审" : "Todo", count: counts.todo || 0},
        {key: "completed", label: isZh ? "已完成" : "Completed", count: counts.completed || 0},
        {key: "pending", label: isZh ? "未处理" : "Pending", count: counts.pending || 0},
        {key: "deferred", label: isZh ? "暂缓" : "Deferred", count: counts.deferred || 0},
    ];

    const submitDecision = async (assignmentId: number, status: "passed" | "rejected") => {
        const key = `${assignmentId}:${status}`;
        setSubmittingKey(key);
        try {
            await onDecision(assignmentId, status, commentByAssignment[assignmentId] || "");
            setCommentByAssignment((current) => ({...current, [assignmentId]: ""}));
        } catch (error) {
            toast.error(isZh ? `提交评审结果失败：${formatActionError(error)}` : `Failed to submit review result: ${formatActionError(error)}`);
        } finally {
            setSubmittingKey(null);
        }
    };
    const hasLocalFilters = Boolean(
        query.trim()
        || creatorFilter !== "all"
        || resultFilter !== "all"
        || dueFilter !== "all"
        || createdFilter !== "all"
        || positionFilter !== "all"
    );
    const resetLocalFilters = () => {
        setQuery("");
        setCreatorFilter("all");
        setResultFilter("all");
        setDueFilter("all");
        setCreatedFilter("all");
        setPositionFilter("all");
    };
    const changeStatusTab = (nextFilter: ReviewStatusFilter) => {
        setActiveFilter(nextFilter);
        setResultFilter("all");
    };

    return (
        <section className={cn(panelClass, "h-full min-h-0 overflow-hidden !border-0 !bg-gray-50 !p-0 !shadow-none dark:!bg-slate-950")}>
            <div className="flex h-full min-h-0 flex-col bg-gray-50 px-5 py-4 dark:bg-slate-950">
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="shrink-0 rounded-xl rounded-b-none border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex items-center gap-2 px-3.5">
                            {filters.map((filter) => {
                                const active = activeFilter === filter.key;
                                return (
                                    <button
                                        key={filter.key}
                                        type="button"
                                        onClick={() => changeStatusTab(filter.key)}
                                        className={cn(
                                            "relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition",
                                            active ? "text-[#171717] dark:text-slate-100" : "text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300",
                                        )}
                                    >
                                        <span>{filter.label}</span>
                                        <span className={cn(
                                            "rounded-full px-1.5 py-0.5 text-xs leading-none",
                                            active ? "bg-neutral-100 text-[#171717] dark:bg-slate-800 dark:text-slate-100" : "bg-gray-100 text-gray-400 dark:bg-slate-900 dark:text-slate-500",
                                        )}>
                                            {filter.count}
                                        </span>
                                        {active ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#171717] dark:bg-slate-100"/> : null}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-3.5 py-2.5 dark:border-slate-800">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                                <FilterMenu
                                    value={creatorFilter}
                                    label={isZh ? "发起人" : "Creator"}
                                    options={filterMenus.creators}
                                    onChange={setCreatorFilter}
                                />
                                <FilterMenu
                                    value={resultFilter}
                                    label={isZh ? "评审结果" : "Result"}
                                    options={filterMenus.results}
                                    onChange={(nextValue) => setResultFilter(nextValue as ReviewResultFilter)}
                                />
                                <FilterMenu
                                    value={dueFilter}
                                    label={isZh ? "到期时间" : "Due date"}
                                    options={filterMenus.due}
                                    onChange={(nextValue) => setDueFilter(nextValue as ReviewDateFilter)}
                                />
                                <FilterMenu
                                    value={createdFilter}
                                    label={isZh ? "创建时间" : "Created"}
                                    options={filterMenus.created}
                                    onChange={(nextValue) => setCreatedFilter(nextValue as ReviewCreatedFilter)}
                                />
                                <FilterMenu
                                    value={positionFilter}
                                    label={isZh ? "应聘岗位" : "Position"}
                                    options={filterMenus.positions}
                                    onChange={setPositionFilter}
                                    className="max-w-[240px]"
                                />
                                <button
                                    type="button"
                                    onClick={resetLocalFilters}
                                    disabled={!hasLocalFilters}
                                    className={cn(
                                        "h-8 rounded-lg px-2.5 text-xs font-medium transition",
                                        hasLocalFilters
                                            ? "cursor-pointer text-[#171717] hover:bg-neutral-100 dark:text-slate-100 dark:hover:bg-slate-800"
                                            : "cursor-default text-slate-300 dark:text-slate-600",
                                    )}
                                >
                                    {isZh ? "清空筛选" : "Clear"}
                                </button>
                                <span className="ml-1 text-xs text-gray-400 dark:text-slate-500">
                                    {isZh ? `显示 ${visibleTasks.length} / ${tasks.length}` : `${visibleTasks.length} / ${tasks.length}`}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative w-[300px] max-w-full">
                                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300 dark:text-slate-500"/>
                                    <Input
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        className="h-8 rounded-lg border-gray-100 bg-gray-50 pl-8 text-xs text-gray-600 shadow-none placeholder:text-gray-300 focus-visible:ring-1 focus-visible:ring-[#171717]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-500/30"
                                        placeholder={isZh ? "搜索候选人、岗位、联系方式" : "Search candidate, position, contact"}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void onRefresh()}
                                    disabled={loading}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-100 bg-white text-[#171717] transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                                    title={isZh ? "刷新" : "Refresh"}
                                >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-auto rounded-xl rounded-t-none border border-t-0 border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-950">
                        {loading ? (
                            <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-gray-500 dark:text-slate-400">
                                <div className="inline-flex items-center">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#171717] dark:text-slate-100"/>
                                    {isZh ? "正在加载评审任务..." : "Loading review tasks..."}
                                </div>
                            </div>
                        ) : visibleTasks.length ? (
                            <div className="min-w-[980px]">
                                <div className="grid grid-cols-[minmax(260px,1.2fr)_minmax(240px,1fr)_minmax(210px,0.8fr)_minmax(300px,1fr)] bg-gray-50 px-5 py-2 text-xs font-normal text-gray-400 dark:bg-slate-900/80 dark:text-slate-500">
                                    <span>{isZh ? "候选人" : "Candidate"}</span>
                                    <span>{isZh ? "评审信息" : "Review"}</span>
                                    <span>{isZh ? "发起信息" : "Created"}</span>
                                    <span className="text-right">{isZh ? "操作" : "Actions"}</span>
                                </div>
                                {visibleTasks.map((task) => {
                                    const assignment = task.assignment;
                                    const candidate = task.candidate;
                                    const comment = commentByAssignment[assignment.id] || "";
                                    const positionTitle = task.position?.title || candidate.position_title || (isZh ? "未分配岗位" : "Unassigned");
                                    return (
                                        <article
                                            key={assignment.id}
                                            className="grid grid-cols-[minmax(260px,1.2fr)_minmax(240px,1fr)_minmax(210px,0.8fr)_minmax(300px,1fr)] items-start gap-4 border-b border-gray-50 px-5 py-3 transition last:border-b-0 hover:bg-gray-50/50 dark:border-slate-800/70 dark:hover:bg-slate-900/60"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                        <button type="button" onClick={() => onOpenCandidate(task)} className="truncate text-left text-sm font-semibold text-gray-900 hover:text-[#171717] dark:text-slate-100 dark:hover:text-white">
                                                        {candidate.name}
                                                    </button>
                                                    <span className="text-xs text-gray-400 dark:text-slate-500">{candidate.age ? `${candidate.age}${isZh ? "岁" : ""}` : candidate.candidate_code}</span>
                                                </div>
                                                <p className="mt-1 truncate text-xs text-gray-500 dark:text-slate-400">
                                                    {candidate.education || "-"} · {candidate.years_of_experience || "-"} · {candidate.city || candidate.expected_city || "-"}
                                                </p>
                                                <p className="mt-1 truncate text-xs text-gray-400 dark:text-slate-500">{candidate.phone || candidate.email || (isZh ? "未填写联系方式" : "No contact")}</p>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap gap-1.5">
                                                    <Badge className={cn("rounded-[4px] border text-xs", reviewBadgeClass(assignment.status))}>
                                                        {labelForReviewAssignmentStatus(assignment.status, isZh)}
                                                    </Badge>
                                                    <Badge variant="outline" className="rounded-[4px] bg-white text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                                        {labelForCandidateStatus(candidate.display_status || candidate.status)}
                                                    </Badge>
                                                </div>
                                                <p className="mt-2 truncate text-xs text-gray-600 dark:text-slate-300">{positionTitle}</p>
                                                {task.batch.message ? (
                                                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-slate-400">{task.batch.message}</p>
                                                ) : null}
                                            </div>
                                            <div className="min-w-0 space-y-1 text-xs text-gray-500 dark:text-slate-400">
                                                <p className="truncate">{isZh ? "发起人" : "Created by"}：{task.batch.created_by || "-"}</p>
                                                <p className="truncate">{formatDateTime(task.batch.created_at)}</p>
                                                {task.batch.due_at ? <p className="truncate text-amber-600 dark:text-amber-300">{isZh ? "截止" : "Due"}：{formatDateTime(task.batch.due_at)}</p> : null}
                                            </div>
                                            <div className="space-y-2">
                                                <Textarea
                                                    value={comment}
                                                    onChange={(event) => setCommentByAssignment((current) => ({...current, [assignment.id]: event.target.value}))}
                                                    rows={2}
                                                    placeholder={isZh ? "填写评审意见" : "Add review comments"}
                                                    className="min-h-0 resize-none rounded-lg border-gray-100 bg-gray-50 text-xs shadow-none focus-visible:ring-[#171717]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-500/30"
                                                />
                                                <div className="flex flex-wrap justify-end gap-1.5">
                                                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg border-gray-100 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => onOpenCandidate(task)}>
                                                        {isZh ? "详情" : "Details"}
                                                    </Button>
                                                    <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg border-rose-100 bg-white px-2 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-900/70 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/30" onClick={() => void submitDecision(assignment.id, "rejected")} disabled={Boolean(submittingKey)}>
                                                        {submittingKey === `${assignment.id}:rejected` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <X className="mr-1 h-3.5 w-3.5"/>}
                                                        {decisionLabels.rejected[isZh ? "zh" : "en"]}
                                                    </Button>
                                                    <Button type="button" size="sm" className="h-7 rounded-lg bg-[#171717] px-2.5 text-xs text-white hover:bg-[#262626] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200" onClick={() => void submitDecision(assignment.id, "passed")} disabled={Boolean(submittingKey)}>
                                                        {submittingKey === `${assignment.id}:passed` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Check className="mr-1 h-3.5 w-3.5"/>}
                                                        {decisionLabels.passed[isZh ? "zh" : "en"]}
                                                    </Button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex h-full min-h-[430px] flex-col items-center justify-center gap-2.5 py-16">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-slate-900">
                                    <ClipboardCheck className="h-5 w-5 text-[#171717] dark:text-slate-200"/>
                                </div>
                                <p className="text-sm font-medium text-gray-700 dark:text-slate-200">{isZh ? "暂无评审任务" : "No review tasks"}</p>
                                <p className="text-xs text-gray-400 dark:text-slate-500">
                                    {isZh ? "当前筛选条件下没有待处理的评审，试试调整筛选条件" : "No tasks match the current filters."}
                                </p>
                                <button
                                    type="button"
                                    onClick={resetLocalFilters}
                                    className="mt-1 rounded-lg border border-[#171717] px-4 py-1.5 text-xs text-[#171717] transition-colors hover:bg-neutral-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-900"
                                >
                                    {isZh ? "清空筛选，查看全部" : "Clear filters"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
