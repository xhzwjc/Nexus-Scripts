"use client";

import React from "react";
import {
    Bot,
    BriefcaseBusiness,
    ClipboardCheck,
    FileSearch,
    NotebookText,
    Plus,
    Rocket,
    Sparkles,
    Upload,
    Wand2,
} from "lucide-react";

import type {AITaskLog, CandidateSummary, DashboardData} from "@/lib/recruitment-api";
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

import type {AssistantDisplayMode, RecruitmentPage} from "../types";
import {EmptyState, MetricCard, QuickActionCard} from "../components/SharedComponents";
import {
    formatDateTime,
    formatPercent,
    labelForCandidateStatus,
    labelForTaskExecutionStatus,
    labelForTaskType,
    resolveCandidateDisplayStatus,
    statusBadgeClass,
} from "../utils";

type TodoSummary = {
    pendingPublish: number;
    pendingScreening: number;
    pendingInterview: number;
    pendingDecision: number;
};

type WorkspacePageProps = {
    dashboard: DashboardData | null;
    todayNewResumes: number;
    todoSummary: TodoSummary;
    recentCandidates: CandidateSummary[];
    recentLogs: AITaskLog[];
    panelClass: string;
    assistantOpen: boolean;
    setActivePage: (page: RecruitmentPage) => void;
    setSelectedCandidateId: (candidateId: number) => void;
    setSelectedLogId: (logId: number) => void;
    openAssistantMode: (mode: AssistantDisplayMode) => void;
    openCreatePosition: () => void;
    setResumeUploadOpen: (open: boolean) => void;
    renderAssistantConsole: (mode: AssistantDisplayMode) => React.ReactNode;
    renderAssistantSuspendedState: () => React.ReactNode;
};

export function WorkspacePage({
    dashboard,
    todayNewResumes,
    todoSummary,
    recentCandidates,
    recentLogs,
    panelClass,
    assistantOpen,
    setActivePage,
    setSelectedCandidateId,
    setSelectedLogId,
    openAssistantMode,
    openCreatePosition,
    setResumeUploadOpen,
    renderAssistantConsole,
    renderAssistantSuspendedState,
}: WorkspacePageProps) {
    const {language} = useI18n();
    const isZh = language === "zh-CN";
    const tr = React.useMemo(() => ({
        overviewBadge: isZh ? "今日总览" : "Today",
        overviewTitle: isZh ? "招聘推进总览" : "Recruiting Overview",
        overviewDescription: isZh ? "集中查看岗位、候选人和 AI 任务的当前进度。" : "Track positions, candidates, and AI tasks in one place.",
        recruitingPositions: isZh ? "招聘中岗位" : "Active Positions",
        pendingScreeningCandidates: isZh ? "待初筛候选人" : "Pending Screening",
        todayNewResumes: isZh ? "今日新增简历" : "New Resumes Today",
        openAssistant: isZh ? "打开 AI 招聘助手" : "Open AI Recruiting Assistant",
        createPosition: isZh ? "新建岗位" : "New Position",
        activePositionsDesc: isZh ? "当前在推进的岗位" : "Positions currently in progress",
        todayResumesDesc: isZh ? "今天导入的候选人数量" : "Candidates imported today",
        screeningPassed: isZh ? "初筛通过人数" : "Screening Passed",
        screeningPassedDesc: isZh ? "已进入后续流程" : "Moved into the next stage",
        aiRunsToday: isZh ? "今日 AI 处理数" : "AI Runs Today",
        aiRunsTodayDesc: isZh ? "今天触发的 AI 任务" : "AI tasks triggered today",
        pendingPublish: isZh ? "待发布岗位" : "Pending Publish",
        pendingPublishDesc: isZh ? "草稿或尚未完成发布的岗位" : "Draft positions or ones not fully published yet",
        pendingInterview: isZh ? "待安排面试" : "Pending Interview",
        pendingInterviewDesc: isZh ? "已通过初筛但未安排面试" : "Passed screening but not scheduled for interview",
        pendingDecision: isZh ? "待确认结果" : "Pending Decision",
        pendingDecisionDesc: isZh ? "需要确认 Offer 或后续结果" : "Waiting for offer or final decision",
        quickActions: isZh ? "快捷操作" : "Quick Actions",
        quickActionsDesc: isZh ? "把 JD 生成、上传简历、批量初筛、面试题 和 AI 助手集中在这里，减少来回切页。" : "Keep JD generation, resume upload, batch screening, interview questions, and the AI assistant close at hand.",
        generateJd: isZh ? "生成 JD" : "Generate JD",
        generateJdDesc: isZh ? "直接跳到当前岗位的 JD 工作区" : "Jump straight to the JD workspace for the current position",
        uploadResume: isZh ? "上传简历" : "Upload Resumes",
        uploadResumeDesc: isZh ? "批量上传 PDF / DOC / DOCX 简历" : "Batch upload PDF / DOC / DOCX resumes",
        batchScreening: isZh ? "批量初筛" : "Batch Screening",
        batchScreeningDesc: isZh ? "进入候选人页集中触发 AI 初筛" : "Run AI screening from the candidates page",
        interviewQuestions: isZh ? "生成面试题" : "Generate Interview Questions",
        interviewQuestionsDesc: isZh ? "在候选人详情区生成个性化题目" : "Generate tailored questions from candidate details",
        openAssistantAction: isZh ? "打开 AI 助手" : "Open AI Assistant",
        openAssistantActionDesc: isZh ? "自然语言驱动整个招聘流程" : "Drive the recruiting workflow with natural language",
        latestCandidates: isZh ? "最新候选人" : "Latest Candidates",
        latestCandidatesDesc: isZh ? "快速查看最近进入系统的人选。" : "Quickly review the most recent candidates in the system.",
        unassignedPosition: isZh ? "未分配岗位" : "Unassigned Position",
        noCandidates: isZh ? "暂无候选人" : "No Candidates Yet",
        noCandidatesDesc: isZh ? "上传简历后，这里会显示最新进入系统的候选人。" : "Once resumes are uploaded, the latest candidates will appear here.",
        recentAiTasks: isZh ? "最近 AI 任务" : "Recent AI Tasks",
        recentAiTasksDesc: isZh ? "用于汇报与排障的近期处理记录。" : "Recent execution records for reporting and troubleshooting.",
        noAiRecords: isZh ? "暂无 AI 记录" : "No AI Records Yet",
        noAiRecordsDesc: isZh ? "触发 JD 生成、初筛评分和面试题生成后，这里会开始出现任务记录；历史数据里仍可能看到旧的简历解析记录。" : "Task records will appear after JD generation, screening, or interview-question runs. Older resume parsing logs may still appear in historical data.",
        statusDistribution: isZh ? "状态分布" : "Status Distribution",
        statusDistributionDesc: isZh ? "帮助招聘团队快速判断流程积压位置。" : "Helps the team spot where the funnel is piling up.",
        noStats: isZh ? "暂无统计" : "No Stats Yet",
        noStatsDesc: isZh ? "候选人进入系统后，这里会展示各状态的人数分布。" : "Candidate counts by status will appear here once data starts coming in.",
    }), [isZh]);

    return (
        <div className="space-y-6">
            <Card
                className={cn(panelClass, "overflow-hidden border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(241,245,249,0.95)_100%)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_26%),linear-gradient(135deg,rgba(15,23,42,0.96)_0%,rgba(15,23,42,0.9)_100%)]")}>
                <CardContent className="px-4 py-3 sm:px-5">
                    <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge
                                className="rounded-full border-slate-200 bg-white/90 px-2.5 py-0.5 text-[11px] text-slate-700 shadow-none dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
                                {tr.overviewBadge}
                            </Badge>
                            <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[1.15rem]">
                                {tr.overviewTitle}
                            </h2>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <p className="min-w-[220px] flex-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                {tr.overviewDescription}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/80">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{tr.recruitingPositions}</span>
                                    <span className="font-semibold text-slate-950 dark:text-slate-50">{dashboard?.cards.positions_recruiting ?? 0}</span>
                                </div>
                                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/80">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{tr.pendingScreeningCandidates}</span>
                                    <span className="font-semibold text-slate-950 dark:text-slate-50">{dashboard?.cards.pending_screening ?? 0}</span>
                                </div>
                                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/80">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{tr.todayNewResumes}</span>
                                    <span className="font-semibold text-slate-950 dark:text-slate-50">{todayNewResumes}</span>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    onClick={() => openAssistantMode("drawer")}
                                    size="sm"
                                    className="h-9 rounded-xl px-3.5 text-sm"
                                >
                                    <Bot className="h-4 w-4"/>
                                    {tr.openAssistant}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={openCreatePosition}
                                    size="sm"
                                    className="h-9 rounded-xl px-3.5 text-sm"
                                >
                                    <Plus className="h-4 w-4"/>
                                    {tr.createPosition}
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard title={tr.recruitingPositions} value={dashboard?.cards.positions_recruiting ?? 0}
                            description={tr.activePositionsDesc} icon={BriefcaseBusiness}/>
                <MetricCard title={tr.todayNewResumes} value={todayNewResumes} description={tr.todayResumesDesc}
                            icon={Upload}/>
                <MetricCard title={tr.pendingScreeningCandidates} value={dashboard?.cards.pending_screening ?? 0}
                            description={isZh ? "优先需要处理的简历" : "Resumes that need immediate attention"} icon={FileSearch}/>
                <MetricCard title={tr.screeningPassed} value={dashboard?.cards.screening_passed ?? 0}
                            description={tr.screeningPassedDesc} icon={ClipboardCheck}/>
                <MetricCard title={tr.aiRunsToday} value={dashboard?.cards.recent_ai_tasks ?? 0}
                            description={tr.aiRunsTodayDesc} icon={Sparkles}/>
                <MetricCard title={tr.pendingPublish} value={todoSummary.pendingPublish}
                            description={tr.pendingPublishDesc} icon={Rocket}/>
                <MetricCard title={tr.pendingInterview} value={todoSummary.pendingInterview}
                            description={tr.pendingInterviewDesc} icon={NotebookText}/>
                <MetricCard title={tr.pendingDecision} value={todoSummary.pendingDecision}
                            description={tr.pendingDecisionDesc} icon={ClipboardCheck}/>
            </div>

            <div className="space-y-6">
                <Card className={panelClass}>
                    <CardHeader className="pb-0">
                        <div className="space-y-1.5">
                            <CardTitle className="text-lg">{tr.quickActions}</CardTitle>
                            <CardDescription className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                                {tr.quickActionsDesc}
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 pt-2 sm:grid-cols-2 2xl:grid-cols-3">
                        <QuickActionCard title={tr.createPosition} description={isZh ? "录入岗位并进入详情工作区" : "Create a position and enter its detail workspace"} icon={Plus}
                                         onClick={openCreatePosition}/>
                        <QuickActionCard title={tr.generateJd} description={tr.generateJdDesc} icon={Wand2}
                                         onClick={() => setActivePage("positions")}/>
                        <QuickActionCard title={tr.uploadResume} description={tr.uploadResumeDesc}
                                         icon={Upload} onClick={() => setResumeUploadOpen(true)}/>
                        <QuickActionCard title={tr.batchScreening} description={tr.batchScreeningDesc}
                                         icon={ClipboardCheck} onClick={() => setActivePage("candidates")}/>
                        <QuickActionCard title={tr.interviewQuestions} description={tr.interviewQuestionsDesc}
                                         icon={NotebookText} onClick={() => setActivePage("candidates")}/>
                        <QuickActionCard title={tr.openAssistantAction} description={tr.openAssistantActionDesc} icon={Bot}
                                         onClick={() => openAssistantMode("drawer")}/>
                    </CardContent>
                </Card>

                <div className="grid gap-6 xl:grid-cols-2">
                    <Card className={cn(panelClass, "flex min-h-0 flex-col overflow-hidden xl:h-[660px] 2xl:h-[708px]")}>
                        <CardHeader className="shrink-0">
                            <CardTitle className="text-lg">{tr.latestCandidates}</CardTitle>
                            <CardDescription>{tr.latestCandidatesDesc}</CardDescription>
                        </CardHeader>
                        <CardContent className="min-h-0 flex-1 overflow-y-auto space-y-3">
                            {recentCandidates.length ? recentCandidates.map((candidate) => (
                                <button
                                    key={candidate.id}
                                    type="button"
                                    className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200/80 px-4 py-4 text-left transition hover:border-slate-400 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800"
                                    onClick={() => {
                                        setActivePage("candidates");
                                        setSelectedCandidateId(candidate.id);
                                    }}
                                >
                                    <div className="min-w-0">
                                        <p className="break-words font-medium text-slate-900 dark:text-slate-100">{candidate.name}</p>
                                        <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
                                            {candidate.position_title || tr.unassignedPosition} ·
                                            {isZh ? "匹配度" : "Match"} {formatPercent(candidate.match_percent)}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-left sm:text-right">
                                        <Badge
                                            className={cn("rounded-full border", statusBadgeClass("candidate", resolveCandidateDisplayStatus(candidate)))}>
                                            {labelForCandidateStatus(resolveCandidateDisplayStatus(candidate))}
                                        </Badge>
                                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(candidate.created_at)}</p>
                                    </div>
                                </button>
                            )) : (
                                <EmptyState title={tr.noCandidates}
                                            description={tr.noCandidatesDesc}/>
                            )}
                        </CardContent>
                    </Card>

                    <Card className={cn(panelClass, "flex min-h-0 flex-col overflow-hidden xl:h-[660px] 2xl:h-[708px]")}>
                        <div className="min-h-0 flex-1 overflow-hidden">
                            {assistantOpen ? renderAssistantSuspendedState() : renderAssistantConsole("workspace")}
                        </div>
                    </Card>

                    <Card className={cn(panelClass, "flex min-h-0 flex-col overflow-hidden xl:h-[660px] 2xl:h-[708px]")}>
                        <CardHeader className="shrink-0">
                            <CardTitle className="text-lg">{tr.recentAiTasks}</CardTitle>
                            <CardDescription>{tr.recentAiTasksDesc}</CardDescription>
                        </CardHeader>
                        <CardContent className="min-h-0 flex-1 overflow-y-auto space-y-3">
                            {recentLogs.length ? recentLogs.map((log) => (
                                <button
                                    key={log.id}
                                    type="button"
                                    className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200/80 px-4 py-4 text-left transition hover:border-slate-400 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800"
                                    onClick={() => {
                                        setActivePage("audit");
                                        setSelectedLogId(log.id);
                                    }}
                                >
                                    <div className="min-w-0">
                                        <p className="break-words font-medium text-slate-900 dark:text-slate-100">{labelForTaskType(log.task_type)}</p>
                                        <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{String(log.input_summary || "").trim() ? String(log.input_summary) : "-"}</p>
                                    </div>
                                    <div className="shrink-0 text-left sm:text-right">
                                        <Badge
                                            className={cn("rounded-full border", statusBadgeClass("task", log.status))}>
                                            {labelForTaskExecutionStatus(log.status)}
                                        </Badge>
                                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(log.created_at)}</p>
                                    </div>
                                </button>
                            )) : (
                                <EmptyState title={tr.noAiRecords}
                                            description={tr.noAiRecordsDesc}/>
                            )}
                        </CardContent>
                    </Card>

                    <Card className={cn(panelClass, "flex min-h-0 flex-col overflow-hidden xl:h-[660px] 2xl:h-[708px]")}>
                        <CardHeader className="shrink-0">
                            <CardTitle className="text-lg">{tr.statusDistribution}</CardTitle>
                            <CardDescription>{tr.statusDistributionDesc}</CardDescription>
                        </CardHeader>
                        <CardContent className="min-h-0 flex-1 overflow-y-auto space-y-3">
                            {dashboard?.status_distribution?.length ? dashboard.status_distribution.map((item) => (
                                <div key={item.status}
                                     className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{labelForCandidateStatus(item.status)}</p>
                                        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{item.count}</p>
                                    </div>
                                </div>
                            )) : (
                                <EmptyState title={tr.noStats}
                                            description={tr.noStatsDesc}/>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
