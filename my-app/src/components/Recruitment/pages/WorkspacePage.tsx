"use client";

import React from "react";
import {
    ArrowRight,
    BarChart3,
    BriefcaseBusiness,
    CalendarDays,
    CheckCircle2,
    ClipboardCheck,
    Clock,
    FileSearch,
    Loader2,
    NotebookText,
    Plus,
    Rocket,
    RotateCcw,
    Search,
    Upload,
    Users,
    Wand2,
} from "lucide-react";

import type {
    CandidateSummary,
    DashboardData,
    PositionSummary,
    RecruitmentFunnelData,
    SourceStatsData,
} from "@/lib/recruitment-api";
import {useI18n} from "@/lib/i18n";
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
import {Input} from "@/components/ui/input";

import type {RecruitmentPage} from "../types";
import {EmptyState} from "../components/SharedComponents";
import {INTERVIEW_TODO_STATUS_VALUES} from "../workflowStages";
import {
    formatDateTime,
    formatPercent,
    labelForCandidateStatus,
    labelForPositionStatus,
    resolveCandidateDisplayStatus,
    statusBadgeClass,
} from "../utils";

type WorkspacePageStats = {
    cards: {
        positions_recruiting: number;
        screening_passed: number;
    };
    todo: {
        pendingPublish: number;
        pendingScreening: number;
        pendingInterview: number;
        pendingDecision: number;
    };
};

type WorkspacePageProps = {
    dashboard: DashboardData | null;
    positions: PositionSummary[];
    todayNewResumes: number;
    stats: WorkspacePageStats;
    recentCandidates: CandidateSummary[];
    funnelData: RecruitmentFunnelData | null;
    sourceStatsData: SourceStatsData | null;
    setActivePage: (page: RecruitmentPage) => void;
    setCandidateQuery: (query: string) => void;
    setCandidateStatusFilter: React.Dispatch<React.SetStateAction<string[]>>;
    setSelectedCandidateId: (candidateId: number) => void;
    openCreatePosition: () => void;
    onRefresh?: () => Promise<void>;
    setResumeUploadOpen: (open: boolean) => void;
};

type WorkspaceAction = {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
};

type TodoTileProps = {
    title: string;
    value: number | string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    tone?: "default" | "blue" | "green" | "amber" | "rose";
    onClick: () => void;
};

const WORKSPACE_INTERVIEW_TODO_STATUS_VALUES = [...INTERVIEW_TODO_STATUS_VALUES];
const WORKSPACE_INTERVIEW_QUESTION_STATUS_VALUES = ["screening_passed", ...INTERVIEW_TODO_STATUS_VALUES];

function TodoTile({title, value, description, icon: Icon, tone = "default", onClick}: TodoTileProps) {
    const toneClass = {
        default: "text-slate-700 bg-slate-50 border-slate-200",
        blue: "text-[#171717] bg-[#171717]/5 border-[#171717]/20",
        green: "text-emerald-700 bg-emerald-50 border-emerald-200",
        amber: "text-amber-700 bg-amber-50 border-amber-200",
        rose: "text-rose-700 bg-rose-50 border-rose-200",
    }[tone];

    return (
        <button
            type="button"
            className="group min-w-0 border-r border-slate-200 bg-white px-4 py-3 text-left transition last:border-r-0 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
            onClick={onClick}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm text-slate-500 dark:text-slate-400">{title}</p>
                    <p className="mt-1 text-2xl font-semibold leading-none tabular-nums text-slate-950 dark:text-slate-50">{value}</p>
                </div>
                <span className={cn("shrink-0 rounded-md border p-1.5", toneClass)}>
                    <Icon className="h-4 w-4"/>
                </span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </button>
    );
}

function WorkspacePanel({
                            title,
                            description,
                            children,
                            action,
                        }: {
    title: string;
    description?: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) {
    return (
        <Card className="gap-0 rounded-md border border-[#e5e5e5] bg-white py-0 shadow-none dark:border-slate-800 dark:bg-slate-950">
            <CardHeader className="flex flex-row items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                    <CardTitle className="text-base font-semibold text-slate-950 dark:text-slate-50">{title}</CardTitle>
                    {description ? <CardDescription className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</CardDescription> : null}
                </div>
                {action}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>
        </Card>
    );
}

function ActionButton({title, description, icon: Icon, onClick}: WorkspaceAction) {
    return (
        <button
            type="button"
            className="flex min-w-0 items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-[#171717]/40 hover:bg-[#171717]/5 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
            onClick={onClick}
        >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <Icon className="h-4 w-4"/>
            </span>
            <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-950 dark:text-slate-50">{title}</span>
                <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>
            </span>
        </button>
    );
}

export function WorkspacePage({
                                  dashboard,
                                  positions,
                                  todayNewResumes,
                                  stats,
                                  recentCandidates,
                                  funnelData,
                                  sourceStatsData,
                                  setActivePage,
                                  setCandidateQuery,
                                  setCandidateStatusFilter,
                                  setSelectedCandidateId,
                                  openCreatePosition,
                                  onRefresh,
                                  setResumeUploadOpen,
                              }: WorkspacePageProps) {
    const {language} = useI18n();
    const isZh = language === "zh-CN";
    const [refreshing, setRefreshing] = React.useState(false);
    const [workspaceSearch, setWorkspaceSearch] = React.useState("");

    const recentPositions = React.useMemo(
        () => [...positions]
            .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime())
            .slice(0, 5),
        [positions],
    );

    const candidateTotal = dashboard?.cards.candidates_total ?? 0;
    const activePositionTotal = dashboard?.cards.positions_recruiting ?? 0;
    const talentPoolTotal = funnelData?.talent_pool_count ?? 0;
    const rejectedTotal = funnelData?.rejected_count ?? 0;
    const totalHeadcount = React.useMemo(
        () => positions.reduce((total, position) => total + Math.max(0, Number(position.headcount || 0)), 0),
        [positions],
    );
    const assignedCandidateTotal = React.useMemo(
        () => positions.reduce((total, position) => total + Math.max(0, Number(position.candidate_count || 0)), 0),
        [positions],
    );

    const openCandidates = React.useCallback((statuses?: string[], query?: string) => {
        setCandidateQuery(query ?? "");
        setCandidateStatusFilter(statuses ?? []);
        setActivePage("candidates");
    }, [setActivePage, setCandidateQuery, setCandidateStatusFilter]);

    const tr = React.useMemo(() => ({
        workspaceTitle: isZh ? "招聘工作台" : "Recruiting Workspace",
        workspaceDesc: isZh ? "待办、日程、候选人和招聘数据集中在一个入口。" : "Todos, schedule, candidates, and recruiting data in one place.",
        searchPlaceholder: isZh ? "搜索候选人、招聘需求、职位" : "Search candidates, requests, positions",
        search: isZh ? "搜索" : "Search",
        refresh: isZh ? "刷新" : "Refresh",
        createRequest: isZh ? "新增招聘需求" : "New Hiring Request",
        todoCenter: isZh ? "待办中心" : "Todo Center",
        pendingScreening: isZh ? "待初筛" : "To Screen",
        pendingScreeningDesc: isZh ? "优先处理新简历" : "Review new resumes first",
        pendingInterview: isZh ? "待面试" : "To Interview",
        pendingInterviewDesc: isZh ? "需要安排或跟进" : "Schedule or follow up",
        pendingDecision: isZh ? "待确认" : "To Decide",
        pendingDecisionDesc: isZh ? "Offer 或最终结果" : "Offer or final result",
        todayNew: isZh ? "今日新增" : "New Today",
        todayNewDesc: isZh ? "今天导入的简历" : "Imported today",
        activeRequests: isZh ? "招聘中需求" : "Active Requests",
        activeRequestsDesc: isZh ? "当前推进中的需求" : "Open hiring requests",
        candidatesTotal: isZh ? "候选人总量" : "Total Candidates",
        candidatesTotalDesc: isZh ? "当前可用候选人数据" : "Candidates in the pipeline",
        screeningPassed: isZh ? "初筛通过" : "Screening Passed",
        screeningPassedDesc: isZh ? "可继续推进面试" : "Ready for next steps",
        talentPoolDesc: isZh ? "沉淀可复用人才" : "Reusable candidates",
        rejectedDesc: isZh ? "保留淘汰原因和记录" : "Reasons and records kept",
        processRhythm: isZh ? "流程节奏" : "Process Rhythm",
        processRhythmDesc: isZh ? "用现有数据替代空日程，优先看今天要推进的环节。" : "Current workflow numbers without empty calendar space.",
        positionProgress: isZh ? "岗位进展" : "Position Progress",
        positionProgressDesc: isZh ? "按最近更新展示招聘中岗位。" : "Recently updated open positions.",
        todayWork: isZh ? "今日要处理" : "Today",
        todayWorkDesc: isZh ? "按业务动作聚合，不展示技术字段。" : "Grouped by business actions.",
        schedule: isZh ? "招聘日程" : "Recruiting Schedule",
        scheduleDesc: isZh ? "本周流程提醒" : "This week's workflow reminders",
        searchImport: isZh ? "搜索与导入" : "Search & Import",
        recentRequests: isZh ? "最近招聘需求" : "Recent Requests",
        quickActions: isZh ? "快捷入口" : "Shortcuts",
        savedFilters: isZh ? "我的筛选" : "My Filters",
        latestCandidates: isZh ? "最新候选人" : "Latest Candidates",
        latestCandidatesDesc: isZh ? "最近进入系统的人选。" : "Recently added candidates.",
        dataReview: isZh ? "数据复盘" : "Data Review",
        statusDistribution: isZh ? "状态分布" : "Status Distribution",
        recruitmentFunnel: isZh ? "招聘漏斗" : "Recruitment Funnel",
        sourceDistribution: isZh ? "来源分布" : "Source Distribution",
        noCandidates: isZh ? "暂无候选人" : "No Candidates Yet",
        noCandidatesDesc: isZh ? "上传简历后，这里会显示最新进入系统的候选人。" : "Latest candidates will appear here after upload.",
        noPositions: isZh ? "暂无招聘需求" : "No Hiring Requests",
        noStats: isZh ? "暂无统计" : "No Stats Yet",
        noFunnel: isZh ? "暂无漏斗数据" : "No Funnel Data",
        noSourceStats: isZh ? "暂无来源数据" : "No Source Data",
        uploadResume: isZh ? "上传简历" : "Upload Resumes",
        uploadResumeDesc: isZh ? "批量导入 PDF / DOC / DOCX" : "Batch import PDF / DOC / DOCX",
        generateJd: isZh ? "生成 JD" : "Generate JD",
        generateJdDesc: isZh ? "进入职位 JD 工作区" : "Open position JD workspace",
        batchScreening: isZh ? "批量初筛" : "Batch Screening",
        batchScreeningDesc: isZh ? "进入候选人列表处理" : "Process from candidate list",
        interviewQuestions: isZh ? "生成面试题" : "Interview Questions",
        interviewQuestionsDesc: isZh ? "从候选人详情生成题目" : "Generate from candidate profiles",
        positionNotLinked: isZh ? "未关联职位" : "Unassigned",
        total: isZh ? "总计" : "Total",
        rejected: isZh ? "已淘汰" : "Rejected",
        talentPool: isZh ? "人才库" : "Talent Pool",
        headcount: isZh ? "需求人数" : "Headcount",
        assignedCandidates: isZh ? "已关联候选人" : "Assigned Candidates",
        manualUpload: isZh ? "手动上传" : "Manual Upload",
        unknown: isZh ? "未知来源" : "Unknown",
        viewAll: isZh ? "查看全部" : "View All",
    }), [isZh]);

    const todoTiles = [
        {
            title: tr.activeRequests,
            value: activePositionTotal,
            description: tr.activeRequestsDesc,
            icon: BriefcaseBusiness,
            tone: "blue" as const,
            onClick: () => setActivePage("positions"),
        },
        {
            title: tr.candidatesTotal,
            value: candidateTotal,
            description: tr.candidatesTotalDesc,
            icon: Users,
            tone: "default" as const,
            onClick: () => openCandidates(),
        },
        {
            title: tr.pendingScreening,
            value: stats.todo.pendingScreening,
            description: tr.pendingScreeningDesc,
            icon: FileSearch,
            tone: "amber" as const,
            onClick: () => openCandidates(["new_imported", "pending_screening", "screening_failed"]),
        },
        {
            title: tr.screeningPassed,
            value: stats.cards.screening_passed,
            description: tr.screeningPassedDesc,
            icon: CheckCircle2,
            tone: "green" as const,
            onClick: () => openCandidates(["screening_passed", "interview_passed", "offer_sent", "hired"]),
        },
        {
            title: tr.pendingInterview,
            value: stats.todo.pendingInterview,
            description: tr.pendingInterviewDesc,
            icon: NotebookText,
            tone: "default" as const,
            onClick: () => openCandidates(WORKSPACE_INTERVIEW_TODO_STATUS_VALUES),
        },
        {
            title: tr.talentPool,
            value: talentPoolTotal,
            description: tr.talentPoolDesc,
            icon: ClipboardCheck,
            tone: "default" as const,
            onClick: () => setActivePage("talent-pool"),
        },
    ];

    const quickActions: WorkspaceAction[] = [
        {title: tr.createRequest, description: tr.activeRequestsDesc, icon: Plus, onClick: openCreatePosition},
        {title: tr.uploadResume, description: tr.uploadResumeDesc, icon: Upload, onClick: () => setResumeUploadOpen(true)},
        {title: tr.batchScreening, description: tr.batchScreeningDesc, icon: ClipboardCheck, onClick: () => openCandidates(["new_imported", "pending_screening", "screening_failed"])},
        {title: tr.generateJd, description: tr.generateJdDesc, icon: Wand2, onClick: () => setActivePage("positions")},
        {title: tr.interviewQuestions, description: tr.interviewQuestionsDesc, icon: NotebookText, onClick: () => openCandidates(WORKSPACE_INTERVIEW_QUESTION_STATUS_VALUES)},
    ];

    const todayWorkItems = [
        {title: tr.pendingScreening, count: stats.todo.pendingScreening, icon: FileSearch, statuses: ["new_imported", "pending_screening", "screening_failed"]},
        {title: tr.pendingInterview, count: stats.todo.pendingInterview, icon: CalendarDays, statuses: WORKSPACE_INTERVIEW_TODO_STATUS_VALUES},
        {title: tr.pendingDecision, count: stats.todo.pendingDecision, icon: CheckCircle2, statuses: ["pending_offer", "offer_sent"]},
        {title: tr.todayNew, count: todayNewResumes, icon: Upload, page: "candidates" as RecruitmentPage},
    ];

    const scheduleItems = [
        {label: tr.todayNew, count: todayNewResumes, icon: Upload, page: "candidates" as RecruitmentPage},
        {label: tr.pendingInterview, count: stats.todo.pendingInterview, icon: CalendarDays, statuses: WORKSPACE_INTERVIEW_TODO_STATUS_VALUES},
        {label: tr.pendingDecision, count: stats.todo.pendingDecision, icon: Clock, statuses: ["pending_offer", "offer_sent"]},
        {label: tr.rejected, count: rejectedTotal, icon: ClipboardCheck, statuses: ["rejected", "eliminated"]},
    ];

    const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        openCandidates(undefined, workspaceSearch.trim());
    };

    return (
        <div className="min-h-full space-y-3 bg-[#f5f7fb] p-0 text-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <div className="rounded-md border border-[#e5e5e5] bg-white p-4 shadow-none dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="rounded-md border-[#171717]/30 bg-[#171717]/5 text-[#171717]">
                                {tr.todoCenter}
                            </Badge>
                            <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">{tr.workspaceTitle}</h2>
                        </div>
                        <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{tr.workspaceDesc}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {onRefresh ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-md px-3 text-sm"
                                disabled={refreshing}
                                onClick={async () => {
                                    setRefreshing(true);
                                    try {
                                        await onRefresh();
                                    } finally {
                                        setRefreshing(false);
                                    }
                                }}
                            >
                                {refreshing ? <Loader2 className="h-4 w-4 animate-spin"/> : <RotateCcw className="h-4 w-4"/>}
                                {tr.refresh}
                            </Button>
                        ) : null}
                        <Button type="button" size="sm" className="h-8 rounded-md px-3 text-sm" onClick={openCreatePosition}>
                            <Plus className="h-4 w-4"/>
                            {tr.createRequest}
                        </Button>
                    </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-md border border-[#e5e5e5]">
                    <div className="grid divide-y divide-slate-200 dark:divide-slate-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
                        {todoTiles.map((item) => (
                            <TodoTile key={item.title} {...item}/>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
                <div className="space-y-3">
                    <WorkspacePanel
                        title={tr.todayWork}
                        description={tr.todayWorkDesc}
                        action={<Button variant="ghost" size="sm" className="h-8 px-2 text-sm" onClick={() => openCandidates()}>{tr.viewAll}<ArrowRight className="h-4 w-4"/></Button>}
                    >
                        <div className="grid gap-2 md:grid-cols-2">
                            {todayWorkItems.map(({title, count, icon: Icon, page, statuses}) => (
                                <button
                                    key={title}
                                    type="button"
                                    className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-[#171717]/40 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900"
                                    onClick={() => page ? setActivePage(page) : openCandidates(statuses)}
                                >
                                    <span className="flex min-w-0 items-center gap-3">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-slate-700 dark:bg-slate-950 dark:text-slate-200">
                                            <Icon className="h-4 w-4"/>
                                        </span>
                                        <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{title}</span>
                                    </span>
                                    <span className="shrink-0 text-xl font-semibold tabular-nums text-slate-950 dark:text-slate-50">{count}</span>
                                </button>
                            ))}
                        </div>
                    </WorkspacePanel>

                    <WorkspacePanel title={tr.processRhythm} description={tr.processRhythmDesc}>
                        <div className="grid gap-2 md:grid-cols-4">
                            {scheduleItems.map(({label, count, icon: Icon, page, statuses}) => (
                                <button
                                    key={label}
                                    type="button"
                                    className="rounded-md border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-[#171717]/40 hover:bg-[#171717]/5 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                                    onClick={() => page ? setActivePage(page) : openCandidates(statuses)}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <Icon className="h-4 w-4 text-slate-500"/>
                                        <span className="text-xl font-semibold tabular-nums text-slate-950 dark:text-slate-50">{count}</span>
                                    </div>
                                    <p className="mt-2 truncate text-sm text-slate-600 dark:text-slate-300">{label}</p>
                                </button>
                            ))}
                        </div>
                    </WorkspacePanel>

                    <WorkspacePanel
                        title={tr.latestCandidates}
                        description={tr.latestCandidatesDesc}
                        action={<Button variant="ghost" size="sm" className="h-8 px-2 text-sm" onClick={() => openCandidates()}>{tr.viewAll}<ArrowRight className="h-4 w-4"/></Button>}
                    >
                        <div className="space-y-2">
                            {recentCandidates.length ? recentCandidates.slice(0, 6).map((candidate) => (
                                <button
                                    key={candidate.id}
                                    type="button"
                                    className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2.5 text-left transition hover:border-[#171717]/40 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                                    onClick={() => {
                                        openCandidates();
                                        setSelectedCandidateId(candidate.id);
                                    }}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium text-slate-950 dark:text-slate-50">{candidate.name}</span>
                                        <span className="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">
                                            {candidate.position_title || tr.positionNotLinked} · {isZh ? "匹配度" : "Match"} {formatPercent(candidate.match_percent)}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <Badge className={cn("rounded-md border", statusBadgeClass("candidate", resolveCandidateDisplayStatus(candidate)))}>
                                            {labelForCandidateStatus(resolveCandidateDisplayStatus(candidate))}
                                        </Badge>
                                        <span className="mt-1 block text-xs text-slate-400">{formatDateTime(candidate.updated_at || candidate.created_at)}</span>
                                    </span>
                                </button>
                            )) : (
                                <EmptyState title={tr.noCandidates} description={tr.noCandidatesDesc}/>
                            )}
                        </div>
                    </WorkspacePanel>
                </div>

                <div className="space-y-3">
                    <WorkspacePanel title={tr.searchImport}>
                        <form className="space-y-3" onSubmit={handleSearchSubmit}>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
                                <Input
                                    value={workspaceSearch}
                                    onChange={(event) => setWorkspaceSearch(event.target.value)}
                                    placeholder={tr.searchPlaceholder}
                                    className="h-9 rounded-md border-[#d8e0ee] bg-white pl-9 shadow-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Button type="submit" variant="outline" className="h-9 rounded-md">
                                    <Search className="h-4 w-4"/>
                                    {tr.search}
                                </Button>
                                <Button type="button" className="h-9 rounded-md" onClick={() => setResumeUploadOpen(true)}>
                                    <Upload className="h-4 w-4"/>
                                    {tr.uploadResume}
                                </Button>
                            </div>
                        </form>
                    </WorkspacePanel>

                    <WorkspacePanel
                        title={tr.recentRequests}
                        action={<Button variant="ghost" size="sm" className="h-8 px-2 text-sm" onClick={() => setActivePage("positions")}>{tr.viewAll}<ArrowRight className="h-4 w-4"/></Button>}
                    >
                        <div className="space-y-2">
                            {recentPositions.length ? recentPositions.map((position) => (
                                <button
                                    key={position.id}
                                    type="button"
                                    className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-left transition hover:border-[#171717]/40 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                                    onClick={() => setActivePage("positions")}
                                >
                                    <div className="flex min-w-0 items-center justify-between gap-3">
                                        <span className="truncate text-sm font-medium text-slate-950 dark:text-slate-50">{position.title}</span>
                                        <Badge className={cn("shrink-0 rounded-md border", statusBadgeClass("position", position.status))}>
                                            {labelForPositionStatus(position.status)}
                                        </Badge>
                                    </div>
                                    <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                        {position.department || "-"} · {position.location || "-"} · {isZh ? `${position.candidate_count} 位候选人` : `${position.candidate_count} candidates`}
                                    </p>
                                </button>
                            )) : (
                                <EmptyState title={tr.noPositions} description={tr.activeRequestsDesc}/>
                            )}
                        </div>
                    </WorkspacePanel>

                    <WorkspacePanel title={tr.quickActions}>
                        <div className="grid gap-2">
                            {quickActions.map((action) => (
                                <ActionButton key={action.title} {...action}/>
                            ))}
                        </div>
                    </WorkspacePanel>

                    <WorkspacePanel title={tr.savedFilters}>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                {label: tr.pendingScreening, value: stats.todo.pendingScreening, statuses: ["new_imported", "pending_screening", "screening_failed"]},
                                {label: tr.pendingInterview, value: stats.todo.pendingInterview, statuses: WORKSPACE_INTERVIEW_TODO_STATUS_VALUES},
                                {label: tr.talentPool, value: funnelData?.talent_pool_count || 0, page: "talent-pool" as RecruitmentPage},
                                {label: tr.rejected, value: rejectedTotal, statuses: ["rejected", "eliminated"]},
                            ].map((item) => (
                                <button
                                    key={item.label}
                                    type="button"
                                    className="rounded-md border border-slate-200 px-3 py-2 text-left transition hover:border-[#171717]/40 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                                    onClick={() => item.page ? setActivePage(item.page) : openCandidates(item.statuses)}
                                >
                                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
                                    <span className="mt-1 block text-lg font-semibold tabular-nums text-slate-950 dark:text-slate-50">{item.value}</span>
                                </button>
                            ))}
                        </div>
                    </WorkspacePanel>
                </div>
            </div>

            <WorkspacePanel title={tr.dataReview}>
                <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-4">
                    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                        <div className="mb-3 flex items-center gap-2">
                            <BriefcaseBusiness className="h-4 w-4 text-slate-500"/>
                            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{tr.positionProgress}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 border-b border-slate-200 pb-3 text-sm dark:border-slate-800">
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{tr.headcount}</p>
                                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950 dark:text-slate-50">{totalHeadcount}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{tr.assignedCandidates}</p>
                                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950 dark:text-slate-50">{assignedCandidateTotal}</p>
                            </div>
                        </div>
                        <div className="mt-3 space-y-2">
                            {recentPositions.length ? recentPositions.slice(0, 4).map((position) => {
                                const target = Math.max(1, Number(position.headcount || 0));
                                const progress = Math.min(100, Math.round((Number(position.candidate_count || 0) / target) * 100));
                                return (
                                    <button
                                        key={position.id}
                                        type="button"
                                        className="w-full text-left"
                                        onClick={() => setActivePage("positions")}
                                    >
                                        <div className="flex items-center justify-between gap-2 text-sm">
                                            <span className="truncate text-slate-600 dark:text-slate-300">{position.title}</span>
                                            <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{position.candidate_count}/{position.headcount}</span>
                                        </div>
                                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                            <div className="h-full rounded-full bg-[#171717]" style={{width: `${progress}%`}}/>
                                        </div>
                                    </button>
                                );
                            }) : (
                                <EmptyState title={tr.noPositions} description={tr.positionProgressDesc}/>
                            )}
                        </div>
                    </div>

                    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                        <div className="mb-3 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-slate-500"/>
                            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{tr.statusDistribution}</p>
                        </div>
                        <div className="space-y-2">
                            {dashboard?.status_distribution?.length ? dashboard.status_distribution.slice(0, 6).map((item) => (
                                <div key={item.status} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="truncate text-slate-500 dark:text-slate-400">{labelForCandidateStatus(item.status)}</span>
                                    <span className="font-semibold tabular-nums text-slate-950 dark:text-slate-50">{item.count}</span>
                                </div>
                            )) : (
                                <EmptyState title={tr.noStats} description=""/>
                            )}
                        </div>
                    </div>

                    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                        <div className="mb-3 flex items-center gap-2">
                            <ClipboardCheck className="h-4 w-4 text-slate-500"/>
                            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{tr.recruitmentFunnel}</p>
                        </div>
                        {funnelData?.stages?.length ? (
                            <div className="space-y-2">
                                {funnelData.stages.slice(0, 6).map((stage) => {
                                    const maxCount = funnelData.stages[0]?.count || 1;
                                    const widthPercent = maxCount > 0 && stage.count > 0 ? (stage.count / maxCount) * 100 : 0;
                                    const label = isZh ? stage.label_zh : stage.label_en;
                                    return (
                                        <div key={stage.key}>
                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className="truncate text-slate-500 dark:text-slate-400">{label}</span>
                                                <span className="font-semibold tabular-nums text-slate-950 dark:text-slate-50">{stage.count}</span>
                                            </div>
                                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                                <div className="h-full rounded-full bg-[#171717]" style={{width: `${widthPercent}%`}}/>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-2 text-xs dark:border-slate-800">
                                    <span className="text-rose-600">{tr.rejected} {funnelData.rejected_count}</span>
                                    <span className="text-amber-600">{tr.talentPool} {funnelData.talent_pool_count}</span>
                                </div>
                            </div>
                        ) : (
                            <EmptyState title={tr.noFunnel} description=""/>
                        )}
                    </div>

                    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                        <div className="mb-3 flex items-center gap-2">
                            <Rocket className="h-4 w-4 text-slate-500"/>
                            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{tr.sourceDistribution}</p>
                        </div>
                        {sourceStatsData?.sources?.length ? (
                            <div className="space-y-2">
                                {sourceStatsData.sources.slice(0, 6).map((item) => {
                                    const maxCount = sourceStatsData.sources[0]?.count || 1;
                                    const widthPercent = maxCount > 0 && item.count > 0 ? (item.count / maxCount) * 100 : 0;
                                    const label = item.source === "manual_upload" ? tr.manualUpload : item.source === "unknown" ? tr.unknown : item.source;
                                    return (
                                        <div key={item.source}>
                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className="truncate text-slate-500 dark:text-slate-400">{label}</span>
                                                <span className="font-semibold tabular-nums text-slate-950 dark:text-slate-50">{item.count}</span>
                                            </div>
                                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                                <div className="h-full rounded-full bg-emerald-500" style={{width: `${widthPercent}%`}}/>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="border-t border-slate-200 pt-2 text-sm dark:border-slate-800">
                                    <span className="text-slate-500 dark:text-slate-400">{tr.total}</span>
                                    <span className="float-right font-semibold tabular-nums text-slate-950 dark:text-slate-50">{sourceStatsData.total}</span>
                                </div>
                            </div>
                        ) : (
                            <EmptyState title={tr.noSourceStats} description=""/>
                        )}
                    </div>
                </div>
            </WorkspacePanel>
        </div>
    );
}
