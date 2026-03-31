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
    return (
        <div className="space-y-6">
            <Card
                className={cn(panelClass, "overflow-hidden border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(241,245,249,0.95)_100%)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_26%),linear-gradient(135deg,rgba(15,23,42,0.96)_0%,rgba(15,23,42,0.9)_100%)]")}>
                <CardContent className="px-4 py-3 sm:px-5">
                    <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge
                                className="rounded-full border-slate-200 bg-white/90 px-2.5 py-0.5 text-[11px] text-slate-700 shadow-none dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
                                今日总览
                            </Badge>
                            <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[1.15rem]">
                                招聘推进总览
                            </h2>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <p className="min-w-[220px] flex-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                集中查看岗位、候选人和 AI 任务的当前进度。
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/80">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">招聘中岗位</span>
                                    <span className="font-semibold text-slate-950 dark:text-slate-50">{dashboard?.cards.positions_recruiting ?? 0}</span>
                                </div>
                                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/80">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">待初筛候选人</span>
                                    <span className="font-semibold text-slate-950 dark:text-slate-50">{dashboard?.cards.pending_screening ?? 0}</span>
                                </div>
                                <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950/80">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">今日新增简历</span>
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
                                    打开 AI 招聘助手
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={openCreatePosition}
                                    size="sm"
                                    className="h-9 rounded-xl px-3.5 text-sm"
                                >
                                    <Plus className="h-4 w-4"/>
                                    新建岗位
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="招聘中岗位" value={dashboard?.cards.positions_recruiting ?? 0}
                            description="当前在推进的岗位" icon={BriefcaseBusiness}/>
                <MetricCard title="今日新增简历" value={todayNewResumes} description="今天导入的候选人数量"
                            icon={Upload}/>
                <MetricCard title="待初筛候选人" value={dashboard?.cards.pending_screening ?? 0}
                            description="优先需要处理的简历" icon={FileSearch}/>
                <MetricCard title="初筛通过人数" value={dashboard?.cards.screening_passed ?? 0}
                            description="已进入后续流程" icon={ClipboardCheck}/>
                <MetricCard title="今日 AI 处理数" value={dashboard?.cards.recent_ai_tasks ?? 0}
                            description="今天触发的 AI 任务" icon={Sparkles}/>
                <MetricCard title="待发布岗位" value={todoSummary.pendingPublish}
                            description="草稿或尚未完成发布的岗位" icon={Rocket}/>
                <MetricCard title="待安排面试" value={todoSummary.pendingInterview}
                            description="已通过初筛但未安排面试" icon={NotebookText}/>
                <MetricCard title="待确认结果" value={todoSummary.pendingDecision}
                            description="需要确认 Offer 或后续结果" icon={ClipboardCheck}/>
            </div>

            <div className="space-y-6">
                <Card className={panelClass}>
                    <CardHeader className="pb-0">
                        <div className="space-y-1.5">
                            <CardTitle className="text-lg">快捷操作</CardTitle>
                            <CardDescription className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                                把
                                <span className="mx-1 font-medium text-slate-700 dark:text-slate-200">JD 生成</span>
                                、
                                <span className="mx-1 font-medium text-slate-700 dark:text-slate-200">上传简历</span>
                                、
                                <span className="mx-1 font-medium text-slate-700 dark:text-slate-200">批量初筛</span>
                                、
                                <span className="mx-1 font-medium text-slate-700 dark:text-slate-200">面试题</span>
                                和
                                <span className="mx-1 font-medium text-slate-700 dark:text-slate-200">AI 助手</span>
                                集中在这里，减少来回切页。
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 pt-2 sm:grid-cols-2 2xl:grid-cols-3">
                        <QuickActionCard title="新建岗位" description="录入岗位并进入详情工作区" icon={Plus}
                                         onClick={openCreatePosition}/>
                        <QuickActionCard title="生成 JD" description="直接跳到当前岗位的 JD 工作区" icon={Wand2}
                                         onClick={() => setActivePage("positions")}/>
                        <QuickActionCard title="上传简历" description="批量上传 PDF / DOC / DOCX 简历"
                                         icon={Upload} onClick={() => setResumeUploadOpen(true)}/>
                        <QuickActionCard title="批量初筛" description="进入候选人页集中触发 AI 初筛"
                                         icon={ClipboardCheck} onClick={() => setActivePage("candidates")}/>
                        <QuickActionCard title="生成面试题" description="在候选人详情区生成个性化题目"
                                         icon={NotebookText} onClick={() => setActivePage("candidates")}/>
                        <QuickActionCard title="打开 AI 助手" description="自然语言驱动整个招聘流程" icon={Bot}
                                         onClick={() => openAssistantMode("drawer")}/>
                    </CardContent>
                </Card>

                <div className="grid gap-6 xl:grid-cols-2">
                    <Card className={cn(panelClass, "flex min-h-0 flex-col overflow-hidden xl:h-[660px] 2xl:h-[708px]")}>
                        <CardHeader className="shrink-0">
                            <CardTitle className="text-lg">最新候选人</CardTitle>
                            <CardDescription>快速查看最近进入系统的人选。</CardDescription>
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
                                            {candidate.position_title || "未分配岗位"} ·
                                            匹配度 {formatPercent(candidate.match_percent)}
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
                                <EmptyState title="暂无候选人"
                                            description="上传简历后，这里会显示最新进入系统的候选人。"/>
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
                            <CardTitle className="text-lg">最近 AI 任务</CardTitle>
                            <CardDescription>用于汇报与排障的近期处理记录。</CardDescription>
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
                                <EmptyState title="暂无 AI 记录"
                                            description="触发 JD 生成、初筛评分和面试题生成后，这里会开始出现任务记录；历史数据里仍可能看到旧的简历解析记录。"/>
                            )}
                        </CardContent>
                    </Card>

                    <Card className={cn(panelClass, "flex min-h-0 flex-col overflow-hidden xl:h-[660px] 2xl:h-[708px]")}>
                        <CardHeader className="shrink-0">
                            <CardTitle className="text-lg">状态分布</CardTitle>
                            <CardDescription>帮助招聘团队快速判断流程积压位置。</CardDescription>
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
                                <EmptyState title="暂无统计"
                                            description="候选人进入系统后，这里会展示各状态的人数分布。"/>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
