"use client";

import React from "react";
import {
    ArrowLeft,
    ArrowRight,
    BarChart3,
    Bot,
    ClipboardCheck,
    Loader2,
    NotebookText,
    Plus,
    Rocket,
    RotateCcw,
    Search,
    Upload,
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
import {Input} from "@/components/ui/input";

import type {RecruitmentPage} from "../types";
import {EmptyState} from "../components/SharedComponents";
import {CandidateAvatar} from "../components/CandidateAvatar";
import {resolveCandidateIdentity} from "../candidateIdentity";
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
    userName?: string | null;
    organizationControl?: React.ReactNode;
    canManagePosition?: boolean;
    canManageCandidate?: boolean;
    canViewAudit?: boolean;
    canViewAssistant?: boolean;
    onBack?: () => void;
    onOpenAssistant?: () => void;
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
    tone: "primary" | "info" | "warning" | "success" | "neutral";
    onClick: () => void;
};

const WORKSPACE_INTERVIEW_TODO_STATUS_VALUES = [...INTERVIEW_TODO_STATUS_VALUES];
const WORKSPACE_INTERVIEW_QUESTION_STATUS_VALUES = ["screening_passed", ...INTERVIEW_TODO_STATUS_VALUES];
const WORKSPACE_PENDING_SCREENING_STATUS_VALUES = ["new_imported", "pending_screening", "screening_failed"];
const WORKSPACE_PENDING_DECISION_STATUS_VALUES = ["pending_offer", "offer_sent"];
const WORKSPACE_PASSED_STATUS_VALUES = ["screening_passed", "interview_passed", "offer_sent", "hired"];
// 与后端 rejected_count 的统计口径保持一致（recruitment_service_impl.get_recruitment_funnel）
const WORKSPACE_REJECTED_STATUS_VALUES = ["screening_failed", "screening_rejected", "interview_first_rejected", "interview_second_rejected"];

const CHART_COLORS = ["#1E3BFA", "#2E9CFF", "#0CC991", "#FFAB24", "#7B61FF", "#B0B2B8"];
const AVATAR_COLORS = ["var(--ats-primary)", "#2E9CFF", "#0CC991", "#FFAB24", "#7B61FF"];

function resolveAvatarLabel(name?: string | null) {
    const normalized = String(name || "").trim();
    if (!normalized) return "招";
    const chineseCharacter = Array.from(normalized).find((character) => /[\u3400-\u9fff]/.test(character));
    if (chineseCharacter) return chineseCharacter;
    const parts = normalized.split(/[\s_.-]+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase() || normalized.slice(0, 2).toUpperCase();
}

function formatExperience(value?: string | null, isZh = true) {
    const normalized = String(value || "").trim();
    if (!normalized) return "";
    if (!isZh || /年|届|应届|不限/.test(normalized)) return normalized;
    return `${normalized}年`;
}

function WorkspaceCard({
    title,
    description,
    action,
    children,
    className,
}: {
    title: string;
    description?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("rounded-[8px] border border-[#EBEEF5] bg-white shadow-[0_1px_2px_rgba(14,17,20,0.03)] dark:border-slate-800 dark:bg-slate-950", className)}>
            <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
                <div className="min-w-0">
                    <h3 className="text-[16px] font-semibold leading-6 text-[#0E1114] dark:text-slate-50">{title}</h3>
                    {description ? <p className="mt-1 text-[12px] leading-5 text-[#B0B2B8] dark:text-slate-400">{description}</p> : null}
                </div>
                {action ? <div className="shrink-0">{action}</div> : null}
            </div>
            <div className="px-6 pb-5">{children}</div>
        </section>
    );
}

function LinkButton({children, onClick}: { children: React.ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-[4px] px-2 text-[12px] font-medium text-[#0F23D9] transition hover:bg-[#1E3BFA]/5 hover:text-[#1E3BFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3BFA]/25"
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function DataBar({
    label,
    count,
    maxCount,
    color,
}: {
    label: string;
    count: number;
    maxCount: number;
    color: string;
}) {
    const widthPercent = maxCount > 0 && count > 0 ? Math.max(4, Math.min(100, (count / maxCount) * 100)) : 0;
    return (
        <div className="flex items-center gap-3">
            <span className="w-[88px] shrink-0 truncate text-right text-[12px] text-[#33353D] dark:text-slate-300" title={label}>{label}</span>
            <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-[#F2F3F5] dark:bg-slate-800">
                <div className="h-full rounded-[3px] transition-[width] duration-300" style={{width: `${widthPercent}%`, backgroundColor: color}}/>
            </div>
            <span className="w-8 shrink-0 text-[12px] tabular-nums text-[#0E1114] dark:text-slate-100">{count}</span>
        </div>
    );
}

function QuickAction({title, description, icon: Icon, tone, onClick}: WorkspaceAction) {
    const toneClass = {
        primary: "bg-[#1E3BFA]",
        info: "bg-[#2E9CFF]",
        warning: "bg-[#FFAB24]",
        success: "bg-[#0CC991]",
        neutral: "bg-[#7B61FF]",
    }[tone];

    return (
        <button
            type="button"
            className="group flex min-w-0 items-center gap-3 rounded-[6px] px-1 py-2 text-left transition hover:bg-[#F7F8FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3BFA]/25 dark:hover:bg-slate-900"
            onClick={onClick}
        >
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white", toneClass)}>
                <Icon className="h-[18px] w-[18px]"/>
            </span>
            <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-[#0E1114] dark:text-slate-100">{title} <span className="text-[#86888F] transition group-hover:translate-x-0.5">›</span></span>
                <span className="mt-0.5 block truncate text-[11px] text-[#B0B2B8]">{description}</span>
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
    userName,
    organizationControl,
    canManagePosition = false,
    canManageCandidate = false,
    canViewAudit = false,
    canViewAssistant = false,
    onBack,
    onOpenAssistant,
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
        workspaceDesc: isZh ? "待办、日程、候选人和招聘数据集中在一个入口。" : "Todos, schedule, candidates, and recruiting data in one place.",
        searchPlaceholder: isZh ? "搜索候选人、岗位、手机号、邮箱" : "Search candidates, positions, phone, email",
        search: isZh ? "搜索" : "Search",
        refresh: isZh ? "刷新" : "Refresh",
        createRequest: isZh ? "新建岗位" : "New Position",
        todoCenter: isZh ? "待办中心" : "Todo Center",
        currentData: isZh ? "当前数据" : "Current Data",
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
        positionProgress: isZh ? "岗位进展" : "Position Progress",
        positionProgressDesc: isZh ? "按最近更新展示当前招聘需求。" : "Recently updated hiring requests.",
        latestCandidates: isZh ? "最新候选人" : "Latest Candidates",
        latestCandidatesDesc: isZh ? "最近进入系统的人选。" : "Recently added candidates.",
        dataReview: isZh ? "数据复盘" : "Data Review",
        dataReviewDesc: isZh ? "按业务动作聚合，不展示技术字段。" : "Grouped by business actions.",
        statusDistribution: isZh ? "状态分布" : "Status Distribution",
        recruitmentFunnel: isZh ? "招聘漏斗" : "Recruitment Funnel",
        sourceDistribution: isZh ? "来源分布" : "Source Distribution",
        quickActions: isZh ? "快捷入口" : "Shortcuts",
        savedFilters: isZh ? "我的筛选" : "My Filters",
        noCandidates: isZh ? "暂无候选人" : "No Candidates Yet",
        noCandidatesDesc: isZh ? "上传简历后，这里会显示最新进入系统的候选人。" : "Latest candidates will appear here after upload.",
        noPositions: isZh ? "暂无招聘需求" : "No Hiring Requests",
        noStats: isZh ? "暂无统计" : "No Stats Yet",
        noFunnel: isZh ? "暂无漏斗数据" : "No Funnel Data",
        noSourceStats: isZh ? "暂无来源数据" : "No Source Data",
        uploadResume: isZh ? "上传简历" : "Upload Resumes",
        uploadResumeDesc: isZh ? "批量导入 PDF / DOCX" : "Batch import PDF / DOCX files",
        generateJd: isZh ? "生成 JD" : "Generate JD",
        generateJdDesc: isZh ? "进入职位 JD 工作区" : "Open position JD workspace",
        batchScreening: isZh ? "批量初筛" : "Batch Screening",
        batchScreeningDesc: isZh ? "进入候选人列表处理" : "Process from candidate list",
        interviewQuestions: isZh ? "生成面试题" : "Interview Questions",
        interviewQuestionsDesc: isZh ? "从候选人详情生成题目" : "Generate from candidate profiles",
        positionNotLinked: isZh ? "未关联职位" : "Unassigned",
        rejected: isZh ? "已淘汰" : "Rejected",
        talentPool: isZh ? "人才库" : "Talent Pool",
        headcount: isZh ? "需求人数" : "Headcount",
        assignedCandidates: isZh ? "已关联候选人" : "Assigned Candidates",
        manualUpload: isZh ? "手动上传" : "Manual Upload",
        unknown: isZh ? "未知来源" : "Unknown",
        viewAll: isZh ? "查看全部" : "View All",
        assistantTitle: isZh ? "AI 招聘助手" : "AI Recruiting Assistant",
        assistantDesc: isZh ? "自动携带当前岗位与评估方案上下文，连续执行筛选、生成和查询。" : "Carry position and assessment context across screening, generation, and search.",
        openAssistant: isZh ? "打开助手" : "Open Assistant",
        match: isZh ? "匹配度" : "Match",
        back: isZh ? "返回" : "Back",
    }), [isZh]);

    const now = new Date();
    const hour = now.getHours();
    const greeting = isZh
        ? (hour < 6 ? "夜深了" : hour < 12 ? "上午好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好")
        : (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
    const displayName = String(userName || (isZh ? "招聘同事" : "Recruiter")).trim();
    const dateText = new Intl.DateTimeFormat(language, {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
    }).format(now);

    const todoItems = [
        {title: tr.pendingScreening, value: stats.todo.pendingScreening, description: tr.pendingScreeningDesc, statuses: WORKSPACE_PENDING_SCREENING_STATUS_VALUES},
        {title: tr.pendingInterview, value: stats.todo.pendingInterview, description: tr.pendingInterviewDesc, statuses: WORKSPACE_INTERVIEW_TODO_STATUS_VALUES},
        {title: tr.pendingDecision, value: stats.todo.pendingDecision, description: tr.pendingDecisionDesc, statuses: WORKSPACE_PENDING_DECISION_STATUS_VALUES},
        {title: tr.todayNew, value: todayNewResumes, description: tr.todayNewDesc, page: "candidates" as RecruitmentPage},
    ];

    const dataMetrics = [
        {title: tr.activeRequests, value: activePositionTotal, description: tr.activeRequestsDesc, color: "text-[#0E1114]", onClick: () => setActivePage("positions")},
        {title: tr.candidatesTotal, value: candidateTotal, description: tr.candidatesTotalDesc, color: "text-[#0E1114]", onClick: () => openCandidates()},
        {title: tr.screeningPassed, value: stats.cards.screening_passed, description: tr.screeningPassedDesc, color: "text-[#0CC991]", onClick: () => openCandidates(WORKSPACE_PASSED_STATUS_VALUES)},
        {title: tr.talentPool, value: talentPoolTotal, description: tr.talentPoolDesc, color: "text-[#2E9CFF]", onClick: () => setActivePage("talent-pool")},
    ];

    const quickActions: WorkspaceAction[] = [
        ...(canManageCandidate ? [{title: tr.uploadResume, description: tr.uploadResumeDesc, icon: Upload, tone: "primary" as const, onClick: () => setResumeUploadOpen(true)}] : []),
        ...(canManagePosition ? [{title: tr.generateJd, description: tr.generateJdDesc, icon: Wand2, tone: "info" as const, onClick: () => setActivePage("positions")}] : []),
        ...(canManageCandidate ? [{title: tr.batchScreening, description: tr.batchScreeningDesc, icon: ClipboardCheck, tone: "warning" as const, onClick: () => openCandidates(WORKSPACE_PENDING_SCREENING_STATUS_VALUES)}] : []),
        ...(canManageCandidate ? [{title: tr.interviewQuestions, description: tr.interviewQuestionsDesc, icon: NotebookText, tone: "success" as const, onClick: () => openCandidates(WORKSPACE_INTERVIEW_QUESTION_STATUS_VALUES)}] : []),
    ];

    const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        openCandidates(undefined, workspaceSearch.trim());
    };

    const primaryButtonClass = "h-10 rounded-[6px] bg-[#1E3BFA] px-4 text-[14px] font-medium text-white shadow-none hover:bg-[#0F23D9]";
    const outlineButtonClass = "h-10 rounded-[6px] border-[#1E3BFA] bg-white px-4 text-[14px] font-medium text-[#1E3BFA] shadow-none hover:bg-[#1E3BFA]/5 hover:text-[#1E3BFA] dark:bg-slate-950";

    return (
        <div className="min-h-full bg-white px-5 pb-12 pt-6 text-[#0E1114] dark:bg-slate-950 dark:text-slate-100 md:px-8">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    {onBack ? (
                        <button
                            type="button"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-[#E6E7EB] text-[#86888F] transition hover:border-[#1E3BFA] hover:bg-[#1E3BFA]/5 hover:text-[#1E3BFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3BFA]/25 dark:border-slate-700"
                            onClick={onBack}
                            aria-label={tr.back}
                            title={tr.back}
                        >
                            <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={1.8}/>
                        </button>
                    ) : null}
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1E3BFA] text-[16px] font-medium text-white">
                        {resolveAvatarLabel(displayName)}
                    </div>
                    <div className="min-w-0">
                        <h2 className="truncate text-[22px] font-semibold leading-7 text-[#0E1114] dark:text-slate-50">{displayName}，{greeting}</h2>
                        <p className="mt-1 truncate text-[13px] text-[#86888F] dark:text-slate-400">{dateText} · {tr.workspaceDesc}</p>
                    </div>
                </div>

                <div className="flex flex-1 flex-wrap items-center justify-end gap-3 xl:min-w-[760px]">
                    {organizationControl}
                    <form className="flex h-10 min-w-[280px] flex-1 overflow-hidden rounded-[6px] border border-[#E6E7EB] bg-white sm:max-w-[420px] dark:border-slate-700 dark:bg-slate-950" onSubmit={handleSearchSubmit}>
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B0B2B8]" strokeWidth={2}/>
                            <Input
                                value={workspaceSearch}
                                onChange={(event) => setWorkspaceSearch(event.target.value)}
                                placeholder={tr.searchPlaceholder}
                                className="h-full rounded-none border-0 bg-transparent pl-10 pr-3 text-[13px] shadow-none focus-visible:ring-0"
                            />
                        </div>
                        <button type="submit" className="flex w-[88px] shrink-0 items-center justify-center bg-[#1E3BFA] text-[14px] font-medium text-white transition hover:bg-[#0F23D9]">
                            {tr.search}
                        </button>
                    </form>
                    {canManagePosition ? (
                        <Button type="button" variant="outline" className={outlineButtonClass} onClick={openCreatePosition}>
                            <Plus className="h-4 w-4"/>{tr.createRequest}
                        </Button>
                    ) : null}
                    {canManageCandidate ? (
                        <Button type="button" className={primaryButtonClass} onClick={() => setResumeUploadOpen(true)}>
                            <Upload className="h-4 w-4"/>{tr.uploadResume}
                        </Button>
                    ) : null}
                    {onRefresh ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-[6px] text-[#86888F] hover:bg-[#F7F8FA] hover:text-[#1E3BFA]"
                            disabled={refreshing}
                            onClick={async () => {
                                setRefreshing(true);
                                try {
                                    await onRefresh();
                                } finally {
                                    setRefreshing(false);
                                }
                            }}
                            aria-label={tr.refresh}
                            title={tr.refresh}
                        >
                            {refreshing ? <Loader2 className="h-4 w-4 animate-spin"/> : <RotateCcw className="h-4 w-4"/>}
                        </Button>
                    ) : null}
                </div>
            </div>

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_480px]">
                <div className="min-w-0 space-y-5">
                    <WorkspaceCard
                        title={tr.todoCenter}
                        action={<span className="inline-flex h-7 items-center rounded-[4px] border border-[#E6E7EB] px-2.5 text-[12px] text-[#33353D] dark:border-slate-700 dark:text-slate-300">{tr.currentData}</span>}
                    >
                        <div className="grid overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
                            {todoItems.map((item, index) => (
                                <button
                                    key={item.title}
                                    type="button"
                                    className={cn(
                                        "flex min-w-0 flex-col items-center gap-2 px-3 py-2 text-center transition hover:bg-[#F7F8FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E3BFA]/30 dark:hover:bg-slate-900",
                                        index > 0 && "lg:border-l lg:border-[#F2F3F5]",
                                    )}
                                    onClick={() => item.page ? setActivePage(item.page) : openCandidates(item.statuses)}
                                >
                                    <span className="text-[32px] font-semibold leading-9 tabular-nums text-[#0E1114] dark:text-slate-50">{item.value}</span>
                                    <span className="text-[12px] font-medium text-[#33353D] dark:text-slate-300">{item.title}</span>
                                    <span className="text-[11px] text-[#B0B2B8]">{item.description}</span>
                                </button>
                            ))}
                        </div>
                    </WorkspaceCard>

                    <WorkspaceCard
                        title={tr.dataReview}
                        description={tr.dataReviewDesc}
                        action={canViewAudit ? <LinkButton onClick={() => setActivePage("audit")}>{tr.viewAll}<ArrowRight className="h-3.5 w-3.5"/></LinkButton> : undefined}
                    >
                        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                            {dataMetrics.map((metric) => (
                                <button
                                    key={metric.title}
                                    type="button"
                                    className="flex min-w-0 flex-col gap-1.5 rounded-[6px] bg-[#F7F8FA] px-4 py-3.5 text-left transition hover:bg-[#F2F3F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3BFA]/25 dark:bg-slate-900 dark:hover:bg-slate-800"
                                    onClick={metric.onClick}
                                >
                                    <span className="text-[12px] text-[#86888F]">{metric.title}</span>
                                    <span className={cn("text-[24px] font-semibold leading-7 tabular-nums", metric.color)}>{metric.value}</span>
                                    <span className="truncate text-[11px] text-[#B0B2B8]">{metric.description}</span>
                                </button>
                            ))}
                        </div>

                        <div className="mt-6 grid gap-8 lg:grid-cols-2">
                            <div className="min-w-0">
                                <div className="mb-3 flex items-center gap-2">
                                    <BarChart3 className="h-4 w-4 text-[#86888F]"/>
                                    <h4 className="text-[13px] font-semibold text-[#0E1114] dark:text-slate-100">{tr.recruitmentFunnel}</h4>
                                </div>
                                {funnelData?.stages?.length ? (
                                    <div className="space-y-2.5">
                                        {funnelData.stages.slice(0, 6).map((stage, index) => (
                                            <DataBar
                                                key={stage.key}
                                                label={isZh ? stage.label_zh : stage.label_en}
                                                count={stage.count}
                                                maxCount={funnelData.stages[0]?.count || 1}
                                                color={CHART_COLORS[index % CHART_COLORS.length]}
                                            />
                                        ))}
                                        <div className="flex flex-wrap gap-4 border-t border-[#F2F3F5] pt-2 text-[11px]">
                                            <span className="text-[#F53F3F]">{tr.rejected} {funnelData.rejected_count}</span>
                                            <span className="text-[#D48806]">{tr.talentPool} {funnelData.talent_pool_count}</span>
                                        </div>
                                    </div>
                                ) : <EmptyState title={tr.noFunnel} description=""/>}
                            </div>

                            <div className="min-w-0">
                                <div className="mb-3 flex items-center gap-2">
                                    <Rocket className="h-4 w-4 text-[#86888F]"/>
                                    <h4 className="text-[13px] font-semibold text-[#0E1114] dark:text-slate-100">{tr.sourceDistribution}</h4>
                                </div>
                                {sourceStatsData?.sources?.length ? (
                                    <div className="space-y-2.5">
                                        {sourceStatsData.sources.slice(0, 6).map((item, index) => (
                                            <DataBar
                                                key={item.source}
                                                label={item.source === "manual_upload" ? tr.manualUpload : item.source === "unknown" ? tr.unknown : item.source}
                                                count={item.count}
                                                maxCount={sourceStatsData.sources[0]?.count || 1}
                                                color={CHART_COLORS[index % CHART_COLORS.length]}
                                            />
                                        ))}
                                    </div>
                                ) : <EmptyState title={tr.noSourceStats} description=""/>}
                            </div>
                        </div>

                        {dashboard?.status_distribution?.length ? (
                            <div className="mt-5 border-t border-[#F2F3F5] pt-4 dark:border-slate-800">
                                <div className="mb-3 flex items-center gap-2">
                                    <ClipboardCheck className="h-4 w-4 text-[#86888F]"/>
                                    <h4 className="text-[13px] font-semibold text-[#0E1114] dark:text-slate-100">{tr.statusDistribution}</h4>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {dashboard.status_distribution.slice(0, 6).map((item) => (
                                        <div key={item.status} className="flex items-center justify-between rounded-[6px] bg-[#F7F8FA] px-3 py-2 text-[12px] dark:bg-slate-900">
                                            <span className="truncate text-[#33353D] dark:text-slate-300">{labelForCandidateStatus(item.status)}</span>
                                            <span className="ml-3 font-semibold tabular-nums text-[#0E1114] dark:text-slate-100">{item.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </WorkspaceCard>

                    <WorkspaceCard
                        title={tr.latestCandidates}
                        description={tr.latestCandidatesDesc}
                        action={<LinkButton onClick={() => openCandidates()}>{tr.viewAll}<ArrowRight className="h-3.5 w-3.5"/></LinkButton>}
                    >
                        {recentCandidates.length ? (
                            <div>
                                {recentCandidates.slice(0, 6).map((candidate, index) => {
                                    const identity = resolveCandidateIdentity(candidate);
                                    const status = resolveCandidateDisplayStatus(candidate);
                                    const candidateMeta = [
                                        formatExperience(candidate.years_of_experience, isZh),
                                        candidate.education,
                                        candidate.city || candidate.expected_city,
                                    ].filter(Boolean).join(" · ");
                                    return (
                                        <button
                                            key={candidate.id}
                                            type="button"
                                            className="flex h-14 w-full min-w-0 items-center gap-3.5 border-b border-[#F2F3F5] text-left transition last:border-b-0 hover:bg-[#F7F8FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E3BFA]/25 dark:border-slate-800 dark:hover:bg-slate-900"
                                            onClick={() => {
                                                openCandidates();
                                                setSelectedCandidateId(candidate.id);
                                            }}
                                        >
                                            <CandidateAvatar identity={identity} className="h-8 w-8 text-[12px] font-medium text-white" style={{backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length]}}/>
                                            <span className="w-[180px] min-w-0 shrink-0">
                                                <span className="block truncate text-[13px] font-medium text-[#0F23D9]">{identity.displayName}</span>
                                                <span className="mt-0.5 block truncate text-[11px] text-[#B0B2B8]">{candidateMeta || candidate.candidate_code}</span>
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-[12px] text-[#33353D] dark:text-slate-300">
                                                {candidate.position_title || tr.positionNotLinked} · {tr.match} {formatPercent(candidate.match_percent)}
                                            </span>
                                            <Badge className={cn("shrink-0 rounded-[4px] border px-2 py-0.5 text-[11px]", statusBadgeClass("candidate", status))}>
                                                {labelForCandidateStatus(status)}
                                            </Badge>
                                            <span className="w-[112px] shrink-0 text-right text-[11px] tabular-nums text-[#86888F]">{formatDateTime(candidate.updated_at || candidate.created_at)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : <EmptyState title={tr.noCandidates} description={tr.noCandidatesDesc}/>}
                    </WorkspaceCard>
                </div>

                <div className="space-y-5">
                    <WorkspaceCard
                        title={tr.positionProgress}
                        description={tr.positionProgressDesc}
                        action={canManagePosition ? <LinkButton onClick={openCreatePosition}><Plus className="h-3.5 w-3.5"/>{tr.createRequest}</LinkButton> : undefined}
                    >
                        <div className="mb-3 grid grid-cols-2 gap-3 rounded-[6px] bg-[#F7F8FA] px-4 py-3 dark:bg-slate-900">
                            <div>
                                <p className="text-[11px] text-[#86888F]">{tr.headcount}</p>
                                <p className="mt-1 text-[20px] font-semibold tabular-nums text-[#0E1114] dark:text-slate-100">{totalHeadcount}</p>
                            </div>
                            <div className="border-l border-[#E6E7EB] pl-4 dark:border-slate-700">
                                <p className="text-[11px] text-[#86888F]">{tr.assignedCandidates}</p>
                                <p className="mt-1 text-[20px] font-semibold tabular-nums text-[#0E1114] dark:text-slate-100">{assignedCandidateTotal}</p>
                            </div>
                        </div>
                        {recentPositions.length ? (
                            <div>
                                {recentPositions.map((position) => (
                                    <button
                                        key={position.id}
                                        type="button"
                                        className="flex h-11 w-full min-w-0 items-center justify-between gap-3 border-b border-[#F2F3F5] text-left transition last:border-b-0 hover:bg-[#F7F8FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E3BFA]/25 dark:border-slate-800 dark:hover:bg-slate-900"
                                        onClick={() => setActivePage("positions")}
                                    >
                                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#0F23D9]">{position.title}</span>
                                        <span className="hidden min-w-0 flex-1 truncate text-right text-[11px] text-[#86888F] sm:block">
                                            {position.department || "-"} · {isZh ? `需求 ${position.headcount} 人` : `${position.headcount} openings`} · {isZh ? `候选人 ${position.candidate_count}` : `${position.candidate_count} candidates`}
                                        </span>
                                        <Badge className={cn("shrink-0 rounded-[4px] border px-2 py-0.5 text-[11px]", statusBadgeClass("position", position.status))}>
                                            {labelForPositionStatus(position.status)}
                                        </Badge>
                                    </button>
                                ))}
                            </div>
                        ) : <EmptyState title={tr.noPositions} description={tr.activeRequestsDesc}/>}
                        {recentPositions.length ? (
                            <div className="flex justify-end pt-3">
                                <LinkButton onClick={() => setActivePage("positions")}>{tr.viewAll}<ArrowRight className="h-3.5 w-3.5"/></LinkButton>
                            </div>
                        ) : null}
                    </WorkspaceCard>

                    {quickActions.length ? (
                        <WorkspaceCard title={tr.quickActions}>
                            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                                {quickActions.map((action) => <QuickAction key={action.title} {...action}/>)}
                            </div>
                        </WorkspaceCard>
                    ) : null}

                    {canViewAssistant && onOpenAssistant ? (
                        <WorkspaceCard title={tr.assistantTitle}>
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1E3BFA]/[0.08] text-[#1E3BFA]">
                                    <Bot className="h-5 w-5" strokeWidth={1.8}/>
                                </span>
                                <p className="min-w-0 flex-1 text-[11px] leading-5 text-[#B0B2B8]">{tr.assistantDesc}</p>
                                <Button type="button" variant="outline" className="h-8 shrink-0 rounded-[6px] border-[#1E3BFA] px-3 text-[12px] text-[#1E3BFA] hover:bg-[#1E3BFA]/5" onClick={onOpenAssistant}>
                                    {tr.openAssistant}
                                </Button>
                            </div>
                        </WorkspaceCard>
                    ) : null}

                    <WorkspaceCard title={tr.savedFilters}>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                {label: tr.pendingScreening, value: stats.todo.pendingScreening, statuses: WORKSPACE_PENDING_SCREENING_STATUS_VALUES},
                                {label: tr.pendingInterview, value: stats.todo.pendingInterview, statuses: WORKSPACE_INTERVIEW_TODO_STATUS_VALUES},
                                {label: tr.talentPool, value: talentPoolTotal, page: "talent-pool" as RecruitmentPage},
                                {label: tr.rejected, value: rejectedTotal, statuses: WORKSPACE_REJECTED_STATUS_VALUES},
                            ].map((item) => (
                                <button
                                    key={item.label}
                                    type="button"
                                    className="rounded-[6px] border border-[#EBEEF5] px-3 py-2.5 text-left transition hover:border-[#1E3BFA]/40 hover:bg-[#F7F8FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3BFA]/25 dark:border-slate-800 dark:hover:bg-slate-900"
                                    onClick={() => item.page ? setActivePage(item.page) : openCandidates(item.statuses)}
                                >
                                    <span className="block truncate text-[11px] text-[#86888F]">{item.label}</span>
                                    <span className="mt-1 block text-[18px] font-semibold tabular-nums text-[#0E1114] dark:text-slate-100">{item.value}</span>
                                </button>
                            ))}
                        </div>
                    </WorkspaceCard>
                </div>
            </div>
        </div>
    );
}
