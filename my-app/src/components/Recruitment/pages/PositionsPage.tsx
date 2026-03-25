"use client";

import React from "react";

import {
    ChevronDown,
    ChevronUp,
    ClipboardCheck,
    ExternalLink,
    FilePlus2,
    Loader2,
    NotebookText,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
    Rocket,
    Save,
    Sparkles,
    Square,
    Trash2,
    Users,
    Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
    JDVersion,
    PositionDetail,
    PositionSummary,
    RecruitmentSkill,
} from "@/lib/recruitment-api";
import { cn } from "@/lib/utils";

import { positionStatusLabels } from "../types";
import {
    formatDateTime,
    formatLongDateTime,
    formatPercent,
    formatSkillNames,
    joinTags,
    labelForCandidateStatus,
    labelForJDGenerationStatus,
    labelForPositionStatus,
    labelForTaskExecutionStatus,
    shortText,
    statusBadgeClass,
} from "../utils";
import {
    EmptyState,
    Field,
    InfoTile,
    LoadingCard,
    LoadingPanel,
    NativeSelect,
    SearchField,
} from "../components/SharedComponents";

export interface PositionsPageProps {
    panelClass: string;
    
    // Sidebar
    positionListCollapsed: boolean;
    setPositionListCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    positions: PositionSummary[];
    positionSidebarSummary: { recruiting: number; todayNew: number };
    openCreatePosition: () => void;
    positionQuery: string;
    setPositionQuery: (query: string) => void;
    positionStatusFilter: string;
    setPositionStatusFilter: (status: string) => void;
    positionsLoading: boolean;
    selectedPositionId: number | null;
    setSelectedPositionId: (id: number | null) => void;
    
    // Detail View
    positionDetailLoading: boolean;
    positionDetail: PositionDetail | null;
    positionWorkspaceHeaderCollapsed: boolean;
    setPositionWorkspaceHeaderCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    
    // Actions & State
    generateJD: () => Promise<void>;
    isCurrentJDTaskCancelling: boolean;
    currentJDGenerationStatus: string;
    currentPositionJDTaskId: number | null;
    openEditPosition: () => void;
    setCandidatePositionFilter: (positionId: string) => void;
    setActivePage: (page: "workspace" | "positions" | "candidates" | "audit" | "settings") => void;
    setSelectedCandidateId: (id: number | null) => void;
    setPublishDialogOpen: (open: boolean) => void;
    setPositionDeleteConfirmOpen: (open: boolean) => void;
    positionDeleting: boolean;
    
    // JD State
    currentJDVersion: JDVersion | undefined;
    skillMap: Map<number, RecruitmentSkill>;
    jdExtraPrompt: string;
    setJdExtraPrompt: (prompt: string) => void;
    jdDraft: { title: string; notes: string; jdMarkdown: string; autoActivate: boolean };
    setJdDraft: React.Dispatch<React.SetStateAction<{ title: string; notes: string; jdMarkdown: string; autoActivate: boolean }>>;
    latestJDGenerationError: string | null;
    isJDGenerating: boolean;
    jdGenerationStatus: string;
    jdViewMode: string;
    setJdViewMode: (mode: string) => void;
    copyPublishJDText: () => Promise<void>;
    currentPublishText: string;
    currentPreviewHtml: string;
    saveJDVersion: () => Promise<void>;
    activateJDVersion: (versionId: number) => Promise<void>;
}

export function PositionsPage({
    panelClass,
    positionListCollapsed,
    setPositionListCollapsed,
    positions,
    positionSidebarSummary,
    openCreatePosition,
    positionQuery,
    setPositionQuery,
    positionStatusFilter,
    setPositionStatusFilter,
    positionsLoading,
    selectedPositionId,
    setSelectedPositionId,
    positionDetailLoading,
    positionDetail,
    positionWorkspaceHeaderCollapsed,
    setPositionWorkspaceHeaderCollapsed,
    generateJD,
    isCurrentJDTaskCancelling,
    currentJDGenerationStatus,
    currentPositionJDTaskId,
    openEditPosition,
    setCandidatePositionFilter,
    setActivePage,
    setSelectedCandidateId,
    setPublishDialogOpen,
    setPositionDeleteConfirmOpen,
    positionDeleting,
    currentJDVersion,
    skillMap,
    jdExtraPrompt,
    setJdExtraPrompt,
    jdDraft,
    setJdDraft,
    latestJDGenerationError,
    isJDGenerating,
    jdGenerationStatus,
    jdViewMode,
    setJdViewMode,
    copyPublishJDText,
    currentPublishText,
    currentPreviewHtml,
    saveJDVersion,
    activateJDVersion,
}: PositionsPageProps) {
    return (
        <div
            className={cn(
                "grid h-full min-h-0 items-stretch gap-6 overflow-hidden transition-all duration-300",
                positionListCollapsed
                    ? "xl:grid-cols-[146px_minmax(0,1fr)] 2xl:grid-cols-[154px_minmax(0,1fr)]"
                    : "xl:grid-cols-[216px_minmax(0,1fr)] 2xl:grid-cols-[226px_minmax(0,1fr)]",
            )}
        >
            <Card className={cn(panelClass, "min-h-0 overflow-hidden")}>
                <CardHeader className="space-y-0 px-4 pb-0 pt-4">
                    {positionListCollapsed ? (
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-[16px] font-semibold tracking-tight whitespace-nowrap">岗位</CardTitle>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setPositionListCollapsed(false)}
                                className="h-8 w-8 rounded-xl"
                                title="展开岗位列表"
                            >
                                <PanelLeftOpen className="h-4 w-4"/>
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <CardTitle className="text-[18px] font-semibold tracking-tight whitespace-nowrap">
                                        岗位列表 ({positions.length})
                                    </CardTitle>
                                    <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                                        招聘中 {positionSidebarSummary.recruiting} · 今日新增 {positionSidebarSummary.todayNew}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setPositionListCollapsed(true)}
                                        className="h-9 w-9 rounded-xl"
                                        title="收起岗位列表"
                                    >
                                        <PanelLeftClose className="h-4 w-4"/>
                                    </Button>
                                </div>
                            </div>
                            <div className="flex justify-start">
                                <Button
                                    size="sm"
                                    className="h-9 rounded-xl whitespace-nowrap px-4 text-sm font-medium shadow-sm"
                                    onClick={openCreatePosition}
                                >
                                    <Plus className="h-4 w-4"/>
                                    新增岗位
                                </Button>
                            </div>
                        </div>
                    )}
                </CardHeader>
                <CardContent className={cn("flex min-h-0 flex-1 flex-col", positionListCollapsed ? "space-y-2 pt-3" : "space-y-2 pt-3")}>
                    {!positionListCollapsed ? (
                        <>
                            <SearchField value={positionQuery} onChange={setPositionQuery}
                                         placeholder="搜索关键字"
                                         inputClassName="h-9 rounded-xl border-slate-200/80 bg-slate-50/70 text-sm shadow-none dark:border-slate-800 dark:bg-slate-900/60"/>
                            <NativeSelect value={positionStatusFilter}
                                          className="h-9 rounded-xl border-slate-200/80 bg-slate-50/70 text-sm shadow-none dark:border-slate-800 dark:bg-slate-900/60"
                                          onChange={(event) => setPositionStatusFilter(event.target.value)}>
                                <option value="all">全部状态</option>
                                    {Object.entries(positionStatusLabels).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </NativeSelect>
                        </>
                    ) : null}
                    <div
                        className={cn(
                            "min-h-0 flex-1 overflow-y-auto",
                            positionListCollapsed ? "" : "-mx-2 px-2",
                        )}
                    >
                        <div className={cn(positionListCollapsed ? "space-y-2" : "space-y-2.5")}>
                            {positionsLoading ? (
                                <LoadingCard label="正在加载岗位列表"/>
                            ) : positions.length ? positions.map((position) => (
                                <button
                                    key={position.id}
                                    type="button"
                                    onClick={() => setSelectedPositionId(position.id)}
                                    className={cn(
                                        "w-full border text-left transition",
                                        selectedPositionId === position.id
                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                            : "border-slate-200/80 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950",
                                        positionListCollapsed ? "rounded-[18px] px-2.5 py-2.5" : "rounded-2xl px-3.5 py-3.5",
                                    )}
                                >
                                    {positionListCollapsed ? (
                                        <div className="space-y-1">
                                            <p className="truncate text-[12px] font-semibold leading-5">{position.title}</p>
                                            <div className="flex items-center gap-1.5 text-[10px] opacity-75">
                                                <span className="truncate">{position.location || position.department || "岗位"}</span>
                                                <span className="h-1 w-1 shrink-0 rounded-full bg-current/45"/>
                                                <span className="shrink-0">{labelForPositionStatus(position.status)}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                                                    <Badge
                                                        className={cn("rounded-full border px-2 py-0 text-[10px]", selectedPositionId === position.id ? "border-white/20 bg-white/10 text-white dark:border-slate-300 dark:bg-slate-200 dark:text-slate-900" : statusBadgeClass("position", position.status))}>
                                                        {labelForPositionStatus(position.status)}
                                                    </Badge>
                                                    <span className="truncate">{position.department || "未设置部门"} · {position.location || "未设置地点"}</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="line-clamp-2 text-[13px] font-semibold leading-5">{position.title}</p>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                                                <span>JD 版本 {position.jd_version_count}</span>
                                                <span>候选人 {position.candidate_count}</span>
                                                <span>{formatDateTime(position.updated_at)}</span>
                                            </div>
                                        </>
                                    )}
                                </button>
                            )) : (
                                <EmptyState title="暂无岗位"
                                            description="先新建一个岗位，再由 AI 生成 JD 并进入招聘流程。"/>
                            )}
                        </div>
                    </div>
                    <div className="shrink-0 pt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
                        招聘中 {positionSidebarSummary.recruiting} · 今日新增 {positionSidebarSummary.todayNew}
                    </div>
                </CardContent>
            </Card>

            <div className="min-h-0 overflow-y-auto [scrollbar-gutter:stable] pr-1 xl:overflow-hidden xl:pr-0">
                {positionDetailLoading ? <LoadingPanel label="正在加载岗位详情"/> : positionDetail ? (
                    <div className="space-y-6 xl:flex xl:h-full xl:flex-col xl:space-y-0 xl:gap-6">
                        <Card className={cn(panelClass, "overflow-hidden")}>
                            <CardContent className={cn("px-6 transition-all", positionWorkspaceHeaderCollapsed ? "py-4" : "py-5")}>
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                    <div className={cn("min-w-0", positionWorkspaceHeaderCollapsed ? "space-y-2" : "space-y-3")}>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge
                                                className={cn("rounded-full border", statusBadgeClass("position", positionDetail.position.status))}>
                                                {labelForPositionStatus(positionDetail.position.status)}
                                            </Badge>
                                            <Badge variant="outline"
                                                   className="rounded-full">代码 {positionDetail.position.position_code}</Badge>
                                            <Badge variant="outline"
                                                   className="rounded-full">{positionDetail.position.department || "未设置部门"}</Badge>
                                        </div>
                                        {positionWorkspaceHeaderCollapsed ? (
                                            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                                                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                                    {positionDetail.position.title}
                                                </h2>
                                                <p className="min-w-0 text-sm text-slate-500 dark:text-slate-400">
                                                    {positionDetail.position.location || "未设置地点"} · {positionDetail.position.employment_type || "未设置用工类型"} · {positionDetail.position.salary_range || "未设置薪资"}
                                                </p>
                                            </div>
                                        ) : (
                                            <div>
                                                <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{positionDetail.position.title}</h2>
                                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                                    {positionDetail.position.location || "未设置地点"} · {positionDetail.position.employment_type || "未设置用工类型"} · {positionDetail.position.salary_range || "未设置薪资"}
                                                </p>
                                            </div>
                                        )}
                                        {!positionWorkspaceHeaderCollapsed ? (
                                            <p className="max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                {positionDetail.position.summary || "这个岗位还没有补充摘要，建议先由招聘同事或 AI 完善岗位背景和关键目标。"}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div
                                        className={cn(
                                            "flex flex-wrap gap-2 xl:justify-end",
                                            positionWorkspaceHeaderCollapsed ? "xl:max-w-[760px]" : "xl:max-w-[520px]",
                                        )}
                                    >
                                        <Button
                                            onClick={() => void generateJD()}
                                            disabled={isCurrentJDTaskCancelling || currentJDGenerationStatus === "cancelling"}
                                        >
                                            {currentPositionJDTaskId ? <Square className="h-4 w-4"/> : <Wand2 className="h-4 w-4"/>}
                                            {isCurrentJDTaskCancelling || currentJDGenerationStatus === "cancelling"
                                                ? "停止中..."
                                                : currentPositionJDTaskId
                                                    ? "停止生成"
                                                    : "AI 生成 JD"}
                                        </Button>
                                        <Button variant="outline" onClick={openEditPosition}>
                                            <FilePlus2 className="h-4 w-4"/>
                                            编辑岗位
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setCandidatePositionFilter(String(positionDetail.position.id));
                                                setActivePage("candidates");
                                            }}
                                        >
                                            <Users className="h-4 w-4"/>
                                            查看候选人
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                if (positionDetail.candidates[0]) {
                                                    setSelectedCandidateId(positionDetail.candidates[0].id);
                                                    setActivePage("candidates");
                                                } else {
                                                    toast.error("这个岗位还没有候选人，暂时无法直接生成面试题");
                                                }
                                            }}
                                        >
                                            <NotebookText className="h-4 w-4"/>
                                            生成面试题模板
                                        </Button>
                                        {!positionWorkspaceHeaderCollapsed ? (
                                            <>
                                                <Button variant="outline" onClick={() => setPublishDialogOpen(true)}>
                                                    <Rocket className="h-4 w-4"/>
                                                    发布岗位
                                                </Button>
                                                <Button variant="outline" onClick={() => setPositionDeleteConfirmOpen(true)}
                                                        disabled={positionDeleting}>
                                                    <Trash2 className="h-4 w-4"/>
                                                    {positionDeleting ? "删除中..." : "删除岗位"}
                                                </Button>
                                            </>
                                        ) : null}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setPositionWorkspaceHeaderCollapsed((current) => !current)}
                                        >
                                            {positionWorkspaceHeaderCollapsed ? <ChevronDown className="h-4 w-4"/> : <ChevronUp className="h-4 w-4"/>}
                                            {positionWorkspaceHeaderCollapsed ? "展开" : "收起"}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid gap-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.2fr)_360px]">
                            <div className="space-y-6 xl:min-h-0 xl:overflow-y-auto xl:pr-2 xl:[scrollbar-gutter:stable]">
                                <Card className={panelClass}>
                                    <CardHeader className="space-y-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <CardTitle className="text-lg">当前 JD</CardTitle>
                                                <CardDescription>默认展示可直接复制发布的岗位文案，Markdown
                                                    源文本和预览版放在次级视图。</CardDescription>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Badge
                                                    className={cn("rounded-full border", statusBadgeClass("task", currentJDGenerationStatus === "syncing" ? "running" : currentJDGenerationStatus))}>
                                                    {labelForJDGenerationStatus(currentJDGenerationStatus)}
                                                </Badge>
                                                <Badge variant="outline" className="rounded-full">
                                                    当前版本 {currentJDVersion ? `V${currentJDVersion.version_no}` : "未生成"}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <InfoTile label="最近生成时间"
                                                      value={formatLongDateTime(positionDetail.jd_generation?.last_generated_at || currentJDVersion?.created_at)}/>
                                            <InfoTile label="当前生效版本"
                                                      value={currentJDVersion ? `${currentJDVersion.title} · V${currentJDVersion.version_no}` : "暂无生效版本"}/>
                                            <InfoTile label="最近使用模型"
                                                      value={positionDetail.jd_generation?.model_name || positionDetail.jd_generation?.model_provider || "暂未记录"}/>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <Field label="岗位信息速览">
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <InfoTile label="招聘人数"
                                                          value={`${positionDetail.position.headcount} 人`}/>
                                                <InfoTile label="标签"
                                                          value={joinTags(positionDetail.position.tags) || "未设置"}/>
                                                <InfoTile label="关键要求"
                                                          value={shortText(positionDetail.position.key_requirements, 100)}/>
                                                <InfoTile label="加分项"
                                                          value={shortText(positionDetail.position.bonus_points, 100)}/>
                                                <InfoTile label="JD 生成 Skill"
                                                          value={formatSkillNames(positionDetail.position.jd_skill_ids || [], skillMap)}/>
                                                <InfoTile label="上传自动初筛"
                                                          value={positionDetail.position.auto_screen_on_upload ? "已开启" : "未开启"}/>
                                                <InfoTile label="初筛绑定 Skills"
                                                          value={formatSkillNames(positionDetail.position.screening_skill_ids || [], skillMap)}/>
                                                <InfoTile label="面试题 Skill"
                                                          value={formatSkillNames(positionDetail.position.interview_skill_ids || [], skillMap)}/>
                                                <InfoTile label="通过后自动推进"
                                                          value={positionDetail.position.auto_advance_on_screening === false ? "关闭" : "开启"}/>
                                            </div>
                                        </Field>

                                        <Field label="AI 生成附加要求">
                                            <Textarea value={jdExtraPrompt}
                                                      onChange={(event) => setJdExtraPrompt(event.target.value)}
                                                      rows={3}
                                                      placeholder="补充本次 JD 生成时的个性化要求，例如强调 IoT 场景、自动化测试、设备联调经验等。"/>
                                        </Field>

                                        <div className="grid gap-4 xl:grid-cols-2">
                                            <Field label="版本标题">
                                                <Input value={jdDraft.title}
                                                       onChange={(event) => setJdDraft((current) => ({
                                                           ...current,
                                                           title: event.target.value
                                                       }))}/>
                                            </Field>
                                            <Field label="版本备注">
                                                <Input value={jdDraft.notes}
                                                       onChange={(event) => setJdDraft((current) => ({
                                                           ...current,
                                                           notes: event.target.value
                                                       }))} placeholder="例如：偏向 IoT 自动化测试"/>
                                            </Field>
                                        </div>

                                        {latestJDGenerationError ? (
                                            <div
                                                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                                                最近一次生成失败：{latestJDGenerationError}
                                            </div>
                                        ) : null}

                                        {isJDGenerating ? (
                                            <div
                                                className="rounded-[22px] border border-sky-200 bg-sky-50/80 px-5 py-5 dark:border-sky-900 dark:bg-sky-950/30">
                                                <div
                                                    className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-200">
                                                    <Loader2 className="h-4 w-4 animate-spin"/>
                                                    {jdGenerationStatus === "syncing"
                                                        ? "正在同步最新 JD 到页面..."
                                                        : currentJDGenerationStatus === "cancelling"
                                                            ? "正在停止 JD 生成..."
                                                            : "正在生成 JD，请稍候..."}
                                                </div>
                                                <div className="mt-4 grid gap-3">
                                                    <div className="h-4 rounded-full bg-sky-100 dark:bg-sky-900/60"/>
                                                    <div
                                                        className="h-4 w-11/12 rounded-full bg-sky-100 dark:bg-sky-900/60"/>
                                                    <div
                                                        className="h-24 rounded-[18px] bg-white/80 dark:bg-slate-900/70"/>
                                                </div>
                                            </div>
                                        ) : null}

                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex flex-wrap gap-2">
                                                <Button variant={jdViewMode === "publish" ? "default" : "outline"}
                                                        size="sm" onClick={() => setJdViewMode("publish")}>
                                                    可直接发布版
                                                </Button>
                                                <Button variant={jdViewMode === "markdown" ? "default" : "outline"}
                                                        size="sm" onClick={() => setJdViewMode("markdown")}>
                                                    Markdown 源文本
                                                </Button>
                                                <Button variant={jdViewMode === "preview" ? "default" : "outline"}
                                                        size="sm" onClick={() => setJdViewMode("preview")}>
                                                    预览版
                                                </Button>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => void copyPublishJDText()}
                                                    disabled={!currentPublishText.trim()}>
                                                <ClipboardCheck className="h-4 w-4"/>
                                                一键复制发布文案
                                            </Button>
                                        </div>

                                        {jdViewMode === "publish" ? (
                                            <div
                                                className="min-h-[240px] whitespace-pre-wrap rounded-2xl border border-slate-200/80 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                                                {currentPublishText || "当前还没有可直接发布的 JD 文案，点击“AI 生成 JD”后会在这里展示。"}
                                            </div>
                                        ) : null}

                                        {jdViewMode === "markdown" ? (
                                            <Field label="JD Markdown 源文本">
                                                <Textarea value={jdDraft.jdMarkdown}
                                                          onChange={(event) => setJdDraft((current) => ({
                                                              ...current,
                                                              jdMarkdown: event.target.value
                                                          }))} rows={18}/>
                                            </Field>
                                        ) : null}

                                        {jdViewMode === "preview" ? (
                                            <Field label="预览版">
                                                <div
                                                    className="min-h-[240px] rounded-2xl border border-slate-200/80 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                                    dangerouslySetInnerHTML={{
                                                        __html: currentPreviewHtml,
                                                    }}
                                                />
                                            </Field>
                                        ) : null}

                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <label
                                                className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                <input type="checkbox" checked={jdDraft.autoActivate}
                                                       onChange={(event) => setJdDraft((current) => ({
                                                           ...current,
                                                           autoActivate: event.target.checked
                                                       }))}/>
                                                保存后设为生效版本
                                            </label>
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => void generateJD()}
                                                    disabled={isCurrentJDTaskCancelling || currentJDGenerationStatus === "cancelling"}
                                                >
                                                    {currentPositionJDTaskId ? <Square className="h-4 w-4"/> : <Sparkles className="h-4 w-4"/>}
                                                    {isCurrentJDTaskCancelling || currentJDGenerationStatus === "cancelling"
                                                        ? "停止中..."
                                                        : currentPositionJDTaskId
                                                            ? "停止生成"
                                                            : "重新生成"}
                                                </Button>
                                                <Button onClick={() => void saveJDVersion()}>
                                                    <Save className="h-4 w-4"/>
                                                    保存新版本
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="space-y-6 xl:min-h-0 xl:overflow-y-auto xl:pr-1 xl:[scrollbar-gutter:stable]">
                                <Card className={panelClass}>
                                    <CardHeader>
                                        <CardTitle className="text-lg">JD 历史版本</CardTitle>
                                        <CardDescription>保留版本轨迹，并支持随时切换当前生效版本。</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {positionDetail.jd_versions.length ? positionDetail.jd_versions.map((version) => (
                                            <div key={version.id}
                                                 className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <p className="font-medium text-slate-900 dark:text-slate-100">{version.title}</p>
                                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                            版本
                                                            V{version.version_no} · {formatDateTime(version.created_at)}
                                                        </p>
                                                    </div>
                                                    <Badge
                                                        className={cn("rounded-full border", version.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                                                        {version.is_active ? "当前生效" : "历史版本"}
                                                    </Badge>
                                                </div>
                                                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{shortText(version.notes || version.prompt_snapshot || version.jd_markdown, 110)}</p>
                                                {!version.is_active ? (
                                                    <Button size="sm" variant="outline" className="mt-3"
                                                            onClick={() => void activateJDVersion(version.id)}>
                                                        切换为当前版本
                                                    </Button>
                                                ) : null}
                                            </div>
                                        )) : (
                                            <EmptyState title="暂无 JD 版本"
                                                        description="点击 AI 生成 JD 或保存新版本后，这里会形成完整版本轨迹。"/>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card className={panelClass}>
                                    <CardHeader>
                                        <CardTitle className="text-lg">发布状态</CardTitle>
                                        <CardDescription>发布能力已解耦成任务轨迹和适配层接口。</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {positionDetail.publish_tasks.length ? positionDetail.publish_tasks.map((task) => (
                                            <div key={task.id}
                                                 className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="font-medium text-slate-900 dark:text-slate-100">
                                                            {task.target_platform.toUpperCase()} · {task.mode.toUpperCase()}
                                                        </p>
                                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(task.created_at)}</p>
                                                    </div>
                                                    <Badge
                                                        className={cn("rounded-full border", statusBadgeClass("task", task.status))}>
                                                        {labelForTaskExecutionStatus(task.status)}
                                                    </Badge>
                                                </div>
                                                {task.published_url ? (
                                                    <a className="mt-3 inline-flex items-center gap-1 text-sm text-sky-600 hover:underline"
                                                       href={task.published_url} target="_blank" rel="noreferrer">
                                                        查看发布链接
                                                        <ExternalLink className="h-4 w-4"/>
                                                    </a>
                                                ) : null}
                                                {task.error_message ?
                                                    <p className="mt-3 text-sm text-rose-600">{task.error_message}</p> : null}
                                            </div>
                                        )) : (
                                            <EmptyState title="暂无发布任务"
                                                        description="先完成 JD，再创建发布任务，后续可接入真实 BOSS / 智联适配器。"/>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card className={panelClass}>
                                    <CardHeader>
                                        <CardTitle className="text-lg">关联候选人</CardTitle>
                                        <CardDescription>按岗位直接看到候选人进度，避免来回跳页找人。</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {positionDetail.candidates.length ? positionDetail.candidates.map((candidate) => (
                                            <button
                                                key={candidate.id}
                                                type="button"
                                                className="flex w-full items-start justify-between rounded-2xl border border-slate-200/80 px-4 py-4 text-left transition hover:border-slate-400 dark:border-slate-800"
                                                onClick={() => {
                                                    setSelectedCandidateId(candidate.id);
                                                    setActivePage("candidates");
                                                }}
                                            >
                                                <div>
                                                    <p className="font-medium text-slate-900 dark:text-slate-100">{candidate.name}</p>
                                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                        匹配度 {formatPercent(candidate.match_percent)} · {candidate.phone || "未填写手机号"}
                                                    </p>
                                                </div>
                                                <Badge
                                                    className={cn("rounded-full border", statusBadgeClass("candidate", candidate.status))}>
                                                    {labelForCandidateStatus(candidate.status)}
                                                </Badge>
                                            </button>
                                        )) : (
                                            <EmptyState title="暂无候选人"
                                                        description="上传简历并关联到这个岗位后，这里会出现最新候选人列表。"/>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </div>
                ) : (
                    <EmptyState title="请选择一个岗位"
                                description="左侧选择岗位后，右侧会进入完整的岗位详情工作区。"/>
                )}
            </div>
        </div>
    );
}
