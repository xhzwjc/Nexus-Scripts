"use client";

import React from "react";
import {
    Bot,
    ChevronDown,
    ChevronUp,
    Download,
    ExternalLink,
    LayoutGrid,
    List,
    Loader2,
    Mail,
    NotebookText,
    Sparkles,
    Square,
    Save,
} from "lucide-react";

// @ts-expect-error react-window types can be tricky with esModuleInterop
import { FixedSizeList } from "react-window";

import {
    DndContext,
    useDraggable,
    useDroppable,
    type DragEndEvent,
} from "@dnd-kit/core";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import type {
    AITaskLog,
    CandidateDetail,
    CandidateSummary,
    PositionSummary,
    RecruitmentSkill,
    ResumeFile,
} from "@/lib/recruitment-api";
import { cn } from "@/lib/utils";

import { candidateStatusLabels, type CandidateEditorState, type ChatMessage } from "../types";
import {
    formatDateTime,
    formatLongDateTime,
    formatPercent,
    formatScoreValue,
    formatSkillNames,
    formatSkillSnapshotNames,
    formatStructuredValue,
    joinTags,
    labelForCandidateStatus,
    labelForMemorySource,
    labelForProvider,
    labelForTaskExecutionStatus,
    labelForTaskType,
    looksLikeFullHtmlDocument,
    resolveLogSkillSnapshots,
    statusBadgeClass,
} from "../utils";
import {
    EmptyState,
    Field,
    HoverRevealText,
    InfoTile,
    LoadingCard,
    LoadingPanel,
    NativeSelect,
    SearchField,
} from "../components/SharedComponents";

export interface CandidatesPageProps {
    panelClass: string;

    // Filters
    candidateFiltersCollapsed: boolean;
    setCandidateFiltersCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    candidateFilterSummary: string;
    candidateViewMode: "list" | "board";
    setCandidateViewMode: (mode: "list" | "board") => void;
    candidateQuery: string;
    setCandidateQuery: (query: string) => void;
    candidatePositionFilter: string;
    setCandidatePositionFilter: (positionId: string) => void;
    positions: PositionSummary[];
    candidateStatusFilter: string;
    setCandidateStatusFilter: (status: string) => void;
    candidateMatchFilter: string;
    setCandidateMatchFilter: (match: string) => void;
    candidateSourceFilter: string;
    setCandidateSourceFilter: (source: string) => void;
    sourceOptions: string[];
    candidateTimeFilter: string;
    setCandidateTimeFilter: (time: string) => void;

    // List/Board
    visibleCandidates: CandidateSummary[];
    candidatesLoading: boolean;
    selectedCandidateIds: number[];
    setSelectedCandidateIds: React.Dispatch<React.SetStateAction<number[]>>;
    selectedCandidateId: number | null;
    setSelectedCandidateId: (id: number | null) => void;
    toggleCandidateSelection: (id: number, checked: boolean) => void;
    candidateListScrollRef: React.RefObject<HTMLDivElement | null>;
    candidateListHorizontalRailRef: React.RefObject<HTMLDivElement | null>;
    candidateListTableWidth: number;
    candidateListDisplayColumnWidths: Record<string, number>;
    renderCandidateListHeaderCell: (key: string, label: string) => React.ReactNode;
    groupedCandidates: { label: string; status: string; items: CandidateSummary[] }[];

    // Actions
    triggerScreening: (candidateIds?: number[]) => Promise<void>;
    isBatchScreeningCancelling: boolean;
    screeningSubmitting: boolean;
    isBatchScreeningRunning: boolean;
    openResumeMailDialog: (candidateIds: number[]) => void;
    isSelectedCandidateScreeningCancelling: boolean;
    selectedCandidateScreeningTaskId: number | null;
    generateInterviewQuestions: () => Promise<void>;
    isCurrentInterviewTaskCancelling: boolean;
    currentCandidateInterviewTaskId: number | null;
    openResumeFile: (file: ResumeFile, download?: boolean) => Promise<void>;
    downloadInterviewQuestion: (id: number) => Promise<void>;

    // Detail Panel
    candidateDetailLoading: boolean;
    candidateDetail: CandidateDetail | null;

    candidateEditor: CandidateEditorState;
    setCandidateEditor: React.Dispatch<React.SetStateAction<CandidateEditorState>>;
    saveCandidate: () => Promise<void>;

    pendingStatus: string | null;
    setPendingStatus: (status: string | null) => void;
    updateCandidateStatus: (status: string) => Promise<void>;
    statusUpdateReason: string;
    setStatusUpdateReason: (reason: string) => void;

    // AI & Logs
    candidateAssistantActivity: ChatMessage[];
    openAssistantMode: (viewSource?: string) => void;
    candidateProcessActivity: AITaskLog[];
    candidateProcessLogsExpanded: boolean;
    setCandidateProcessLogsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    openTaskLogDetail: (logId: number) => void;

    // Interview Prep
    interviewRoundName: string;
    setInterviewRoundName: (name: string) => void;
    effectiveInterviewSkillIds: number[];
    preferredInterviewSkillSourceLabel: string;
    effectiveInterviewSkillSourceLabel: string;
    interviewCustomRequirements: string;
    setInterviewCustomRequirements: (req: string) => void;
    interviewSkillSelectionDirty: boolean;
    setInterviewSkillSelectionDirty: (dirty: boolean) => void;
    setSelectedInterviewSkillIds: React.Dispatch<React.SetStateAction<number[]>>;
    toggleInterviewSkillSelection: (id: number) => void;
    interviewPreviewHeight: number;
    syncInterviewPreviewHeight: (iframe: HTMLIFrameElement) => void;

    // Utils/Mappers
    getCandidateResumeMailSummary: (id: number) => string;
    skillMap: Map<number, RecruitmentSkill>;
    effectiveScreeningSkillSourceLabel: string;
    effectiveScreeningSkillIds: number[];
    skills: RecruitmentSkill[];
}

export function CandidatesPage({
    panelClass,
    candidateFiltersCollapsed,
    setCandidateFiltersCollapsed,
    candidateFilterSummary,
    candidateViewMode,
    setCandidateViewMode,
    candidateQuery,
    setCandidateQuery,
    candidatePositionFilter,
    setCandidatePositionFilter,
    positions,
    candidateStatusFilter,
    setCandidateStatusFilter,
    candidateMatchFilter,
    setCandidateMatchFilter,
    candidateSourceFilter,
    setCandidateSourceFilter,
    sourceOptions,
    candidateTimeFilter,
    setCandidateTimeFilter,
    visibleCandidates,
    candidatesLoading,
    selectedCandidateIds,
    setSelectedCandidateIds,
    selectedCandidateId,
    setSelectedCandidateId,
    toggleCandidateSelection,
    candidateListScrollRef,
    candidateListHorizontalRailRef,
    candidateListTableWidth,
    candidateListDisplayColumnWidths,
    renderCandidateListHeaderCell,
    groupedCandidates,
    triggerScreening,
    isBatchScreeningCancelling,
    screeningSubmitting,
    isBatchScreeningRunning,
    openResumeMailDialog,
    isSelectedCandidateScreeningCancelling,
    selectedCandidateScreeningTaskId,
    generateInterviewQuestions,
    isCurrentInterviewTaskCancelling,
    currentCandidateInterviewTaskId,
    openResumeFile,
    downloadInterviewQuestion,
    candidateDetailLoading,
    candidateDetail,
    candidateEditor,
    setCandidateEditor,
    saveCandidate,
    pendingStatus,
    setPendingStatus,
    updateCandidateStatus,
    statusUpdateReason,
    setStatusUpdateReason,
    candidateAssistantActivity,
    openAssistantMode,
    candidateProcessActivity,
    candidateProcessLogsExpanded,
    setCandidateProcessLogsExpanded,
    openTaskLogDetail,
    interviewRoundName,
    setInterviewRoundName,
    effectiveInterviewSkillIds,
    preferredInterviewSkillSourceLabel,
    effectiveInterviewSkillSourceLabel,
    interviewCustomRequirements,
    setInterviewCustomRequirements,
    interviewSkillSelectionDirty,
    setInterviewSkillSelectionDirty,
    setSelectedInterviewSkillIds,
    toggleInterviewSkillSelection,
    interviewPreviewHeight,
    syncInterviewPreviewHeight,
    getCandidateResumeMailSummary,
    skillMap,
    effectiveScreeningSkillSourceLabel,
    effectiveScreeningSkillIds,
    skills,
}: CandidatesPageProps) {
    const [listHeight, setListHeight] = React.useState(500);
    const tableContainerRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (!tableContainerRef.current) return;
        const observer = new window.ResizeObserver((entries) => {
            if (entries[0] && entries[0].contentRect.height > 0) {
                setListHeight(entries[0].contentRect.height);
            }
        });
        observer.observe(tableContainerRef.current);
        return () => {
            observer.disconnect();
        };
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const VirtualRow = React.useCallback(({ index, style }: any) => {
        const candidate = visibleCandidates[index];
        if (!candidate) return null;
        return (
            <div
                style={{ ...style, width: candidateListTableWidth, display: "flex", alignItems: "center" }}
                className={cn("border-b transition-colors hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer", selectedCandidateId === candidate.id && "bg-slate-100 dark:bg-slate-900")}
                onClick={() => setSelectedCandidateId(candidate.id)}
            >
                <div style={{ width: 56, minWidth: 56, maxWidth: 56 }} className="pl-6 px-2 align-middle whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={selectedCandidateIds.includes(candidate.id)}
                        onChange={(event) => toggleCandidateSelection(candidate.id, event.target.checked)}
                        aria-label={`选择候选人 ${candidate.name}`}
                    />
                </div>
                <div
                    style={{
                        width: candidateListDisplayColumnWidths.candidate,
                        minWidth: candidateListDisplayColumnWidths.candidate,
                        maxWidth: candidateListDisplayColumnWidths.candidate,
                    }}
                    className="px-2 align-middle"
                >
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <HoverRevealText text={candidate.name} className="font-medium text-slate-900 dark:text-slate-100"/>
                            {getCandidateResumeMailSummary(candidate.id) ? (
                                <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                    已发简历
                                </Badge>
                            ) : null}
                        </div>
                        <HoverRevealText text={candidate.phone || candidate.email || "未填写联系方式"} className="text-xs text-slate-500 dark:text-slate-400"/>
                        {getCandidateResumeMailSummary(candidate.id) ? (
                            <HoverRevealText text={getCandidateResumeMailSummary(candidate.id)} className="mt-1 text-xs text-sky-600 dark:text-slate-300" tooltipClassName="max-w-sm"/>
                        ) : null}
                    </div>
                </div>
                <div
                    style={{
                        width: candidateListDisplayColumnWidths.position,
                        minWidth: candidateListDisplayColumnWidths.position,
                        maxWidth: candidateListDisplayColumnWidths.position,
                    }}
                    className="px-2 align-middle text-sm"
                >
                    <HoverRevealText text={candidate.position_title || "未分配岗位"}/>
                </div>
                <div
                    style={{
                        width: candidateListDisplayColumnWidths.status,
                        minWidth: candidateListDisplayColumnWidths.status,
                        maxWidth: candidateListDisplayColumnWidths.status,
                    }}
                    className="px-2 align-middle whitespace-nowrap text-sm"
                >
                    <Badge className={cn("rounded-full border", statusBadgeClass("candidate", candidate.status))}>
                        {labelForCandidateStatus(candidate.status)}
                    </Badge>
                </div>
                <div
                    style={{
                        width: candidateListDisplayColumnWidths.match,
                        minWidth: candidateListDisplayColumnWidths.match,
                        maxWidth: candidateListDisplayColumnWidths.match,
                    }}
                    className="px-2 align-middle whitespace-nowrap text-sm"
                >
                    {formatPercent(candidate.match_percent)}
                </div>
                <div
                    style={{
                        width: candidateListDisplayColumnWidths.source,
                        minWidth: candidateListDisplayColumnWidths.source,
                        maxWidth: candidateListDisplayColumnWidths.source,
                    }}
                    className="px-2 align-middle text-sm"
                >
                    <HoverRevealText text={candidate.source || "-"} className="text-xs text-slate-600 dark:text-slate-300"/>
                </div>
                <div
                    style={{
                        width: candidateListDisplayColumnWidths.updated,
                        minWidth: candidateListDisplayColumnWidths.updated,
                        maxWidth: candidateListDisplayColumnWidths.updated,
                    }}
                    className="px-2 align-middle text-sm"
                >
                    <HoverRevealText text={formatDateTime(candidate.updated_at)}/>
                </div>
            </div>
        );
    }, [visibleCandidates, candidateListDisplayColumnWidths, candidateListTableWidth, selectedCandidateId, selectedCandidateIds, toggleCandidateSelection, getCandidateResumeMailSummary, setSelectedCandidateId]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        const candidateId = Number(active.id);
        const newStatus = String(over.id);
        const candidate = visibleCandidates.find((c) => c.id === candidateId);
        if (candidate && candidate.status !== newStatus) {
            setSelectedCandidateId(candidateId);
            setPendingStatus(newStatus);
        }
    };

    const hasActiveFilters = candidateQuery !== "" || candidatePositionFilter !== "all" || candidateStatusFilter !== "all" || candidateMatchFilter !== "all" || candidateSourceFilter !== "all" || candidateTimeFilter !== "all";

    const handleClearFilters = () => {
        setCandidateQuery("");
        setCandidatePositionFilter("all");
        setCandidateStatusFilter("all");
        setCandidateMatchFilter("all");
        setCandidateSourceFilter("all");
        setCandidateTimeFilter("all");
    };

    return (
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6 overflow-hidden">
            <Card className={panelClass}>
                <CardContent className={cn("px-6", candidateFiltersCollapsed ? "py-4" : "py-6")}>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">候选人筛选条</p>
                                    {hasActiveFilters && (
                                        <Badge variant="secondary" className="rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300">
                                            {visibleCandidates.length} 个结果
                                        </Badge>
                                    )}
                                </div>
                                <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
                                    {candidateFiltersCollapsed
                                        ? candidateFilterSummary
                                        : "围绕岗位、状态、匹配度和来源过滤，保持 ATS 使用效率。"}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {hasActiveFilters && (
                                    <Button size="sm" variant="ghost" onClick={handleClearFilters} className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                                        清除筛选
                                    </Button>
                                )}
                                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                                    <Button size="sm" variant={candidateViewMode === "list" ? "default" : "ghost"}
                                            onClick={() => setCandidateViewMode("list")}>
                                        <List className="h-4 w-4"/>
                                        列表
                                    </Button>
                                    <Button size="sm" variant={candidateViewMode === "board" ? "default" : "ghost"}
                                            onClick={() => setCandidateViewMode("board")}>
                                        <LayoutGrid className="h-4 w-4"/>
                                        看板
                                    </Button>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCandidateFiltersCollapsed((current) => !current)}
                                >
                                    {candidateFiltersCollapsed ? <ChevronDown className="h-4 w-4"/> : <ChevronUp className="h-4 w-4"/>}
                                    {candidateFiltersCollapsed ? "展开筛选" : "收起筛选"}
                                </Button>
                            </div>
                        </div>
                        {!candidateFiltersCollapsed ? (
                            <div className="grid gap-3 xl:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))]">
                                <SearchField value={candidateQuery} onChange={setCandidateQuery} placeholder="搜索候选人、手机号、邮箱、公司"/>
                                <NativeSelect value={candidatePositionFilter} onChange={(event) => setCandidatePositionFilter(event.target.value)}>
                                    <option value="all">全部岗位</option>
                                    {positions.map((position) => (
                                        <option key={position.id} value={String(position.id)}>{position.title}</option>
                                    ))}
                                </NativeSelect>
                                <NativeSelect value={candidateStatusFilter} onChange={(event) => setCandidateStatusFilter(event.target.value)}>
                                    <option value="all">全部状态</option>
                                    {Object.entries(candidateStatusLabels).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </NativeSelect>
                                <NativeSelect value={candidateMatchFilter} onChange={(event) => setCandidateMatchFilter(event.target.value)}>
                                    <option value="all">全部匹配度</option>
                                    <option value="80+">80% 以上</option>
                                    <option value="60+">60% 以上</option>
                                    <option value="40+">40% 以上</option>
                                </NativeSelect>
                                <NativeSelect value={candidateSourceFilter} onChange={(event) => setCandidateSourceFilter(event.target.value)}>
                                    <option value="all">全部来源</option>
                                    {sourceOptions.map((source) => (
                                        <option key={source} value={source}>{source}</option>
                                    ))}
                                </NativeSelect>
                                <NativeSelect value={candidateTimeFilter} onChange={(event) => setCandidateTimeFilter(event.target.value)}>
                                    <option value="all">全部时间</option>
                                    <option value="today">今天</option>
                                    <option value="7d">近 7 天</option>
                                    <option value="30d">近 30 天</option>
                                </NativeSelect>
                            </div>
                        ) : null}
                    </div>
                </CardContent>
            </Card>

            <div className="grid min-h-0 items-stretch gap-6 overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(560px,44%)] 2xl:grid-cols-[minmax(0,1fr)_minmax(700px,46%)]">
                <Card className={cn(panelClass, "min-h-0 overflow-hidden")}>
                    <CardHeader className="pb-0">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <CardTitle className="text-lg">候选人列表</CardTitle>
                                <CardDescription>支持列表视图与状态看板视图，选中后右侧展示完整档案。</CardDescription>
                            </div>
                            <Badge variant="outline" className="rounded-full">{visibleCandidates.length} 人</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col pt-6">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                已选中 <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedCandidateIds.length}</span> 位候选人
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => setSelectedCandidateIds([])} disabled={!selectedCandidateIds.length}>
                                    清空选择
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void triggerScreening(selectedCandidateIds)}
                                    disabled={isBatchScreeningCancelling || (screeningSubmitting && !isBatchScreeningRunning) || (!isBatchScreeningRunning && !selectedCandidateIds.length)}
                                >
                                    {isBatchScreeningCancelling ? <Loader2 className="h-4 w-4 animate-spin"/> : isBatchScreeningRunning ? <Square className="h-4 w-4"/> : screeningSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}
                                    {isBatchScreeningCancelling ? "停止中..." : isBatchScreeningRunning ? "停止批量初筛" : screeningSubmitting ? "启动中..." : "批量开始初筛"}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => openResumeMailDialog(selectedCandidateIds)} disabled={!selectedCandidateIds.length}>
                                    <Mail className="h-4 w-4"/>
                                    批量发送简历
                                </Button>
                            </div>
                        </div>
                        {candidatesLoading ? (
                            <LoadingCard label="正在加载候选人列表"/>
                        ) : candidateViewMode === "list" ? (
                            <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
                                <div
                                    ref={candidateListScrollRef}
                                    className="min-h-0 flex-1 overflow-x-hidden overflow-y-hidden [scrollbar-gutter:stable] [scrollbar-width:auto]"
                                >
                                    <div style={{ width: candidateListTableWidth, minWidth: candidateListTableWidth }} className="flex flex-col h-full min-h-0">
                                        <table className="caption-bottom table-fixed text-sm shrink-0">
                                            <thead className="[&_tr]:border-b">
                                                <tr className="border-b bg-white/95 transition-colors dark:bg-slate-950/95">
                                                    <th className="text-foreground sticky top-0 z-10 h-10 w-14 bg-inherit px-2 text-left align-middle font-medium whitespace-nowrap">
                                                        <input
                                                            type="checkbox"
                                                            checked={visibleCandidates.length > 0 && visibleCandidates.every((candidate) => selectedCandidateIds.includes(candidate.id))}
                                                            onChange={(event) => setSelectedCandidateIds(event.target.checked ? visibleCandidates.map((candidate) => candidate.id) : [])}
                                                            aria-label="全选候选人"
                                                        />
                                                    </th>
                                                    {renderCandidateListHeaderCell("candidate", "候选人")}
                                                    {renderCandidateListHeaderCell("position", "岗位")}
                                                    {renderCandidateListHeaderCell("status", "状态")}
                                                    {renderCandidateListHeaderCell("match", "匹配度")}
                                                    {renderCandidateListHeaderCell("source", "来源")}
                                                    {renderCandidateListHeaderCell("updated", "更新时间")}
                                                </tr>
                                            </thead>
                                        </table>
                                        <div ref={tableContainerRef} className="flex-1 min-h-0 w-full overflow-hidden">
                                            {visibleCandidates.length ? (
                                                <FixedSizeList
                                                    height={listHeight}
                                                    width={candidateListTableWidth}
                                                    itemCount={visibleCandidates.length}
                                                    itemSize={84}
                                                    overscanCount={5}
                                                >
                                                    {VirtualRow}
                                                </FixedSizeList>
                                            ) : (
                                                <EmptyState title="没有符合条件的候选人" description="调整筛选条件，或先上传一批简历进入系统。"/>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="shrink-0 border-t border-slate-200/80 pt-2 dark:border-slate-800">
                                    <div
                                        ref={candidateListHorizontalRailRef}
                                        className="overflow-x-auto overflow-y-hidden [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.95)_transparent] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[scrollbar-color:rgba(71,85,105,0.98)_transparent] dark:[&::-webkit-scrollbar-track]:bg-slate-900/80 dark:[&::-webkit-scrollbar-thumb]:border-slate-900 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700"
                                    >
                                        <div style={{ width: candidateListTableWidth, height: 1 }}/>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
                                <DndContext onDragEnd={handleDragEnd}>
                                    <div className="grid gap-4 xl:grid-cols-3">
                                        {groupedCandidates.map((group) => (
                                            <DroppableColumn key={group.status} status={group.status} label={group.label} count={group.items.length}>
                                                {group.items.length ? group.items.map((candidate) => (
                                                    <DraggableCandidateCard
                                                        key={candidate.id}
                                                        candidate={candidate}
                                                        isSelected={selectedCandidateId === candidate.id}
                                                        onSelect={() => setSelectedCandidateId(candidate.id)}
                                                        isChecked={selectedCandidateIds.includes(candidate.id)}
                                                        toggleSelection={toggleCandidateSelection}
                                                        mailSummary={getCandidateResumeMailSummary(candidate.id)}
                                                    />
                                                )) : (
                                                    <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                                        当前状态暂无候选人
                                                    </p>
                                                )}
                                            </DroppableColumn>
                                        ))}
                                    </div>
                                </DndContext>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className={cn(panelClass, "min-h-0 min-w-0 gap-0 overflow-hidden py-0")}>
                    {candidateDetailLoading ? <LoadingPanel label="正在加载候选人详情"/> : candidateDetail ? (
                        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                            <div className="border-b border-slate-200/80 px-6 py-5 dark:border-slate-800">
                                <div className="space-y-4">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge className={cn("rounded-full border", statusBadgeClass("candidate", candidateDetail.candidate.status))}>
                                                {labelForCandidateStatus(candidateDetail.candidate.status)}
                                            </Badge>
                                            <Badge variant="outline" className="rounded-full">
                                                匹配度 {formatPercent(candidateDetail.candidate.match_percent)}
                                            </Badge>
                                            {getCandidateResumeMailSummary(candidateDetail.candidate.id) ? (
                                                <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                                    {getCandidateResumeMailSummary(candidateDetail.candidate.id)}
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <h3 className="mt-3 break-words text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{candidateDetail.candidate.name}</h3>
                                        <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
                                            {candidateDetail.candidate.position_title || "未分配岗位"} · {candidateDetail.candidate.phone || candidateDetail.candidate.email || "未填写联系方式"}
                                        </p>
                                    </div>
                                    <div className="flex w-full flex-wrap items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => void triggerScreening()}
                                            disabled={isSelectedCandidateScreeningCancelling || (screeningSubmitting && !selectedCandidateScreeningTaskId)}
                                        >
                                            {isSelectedCandidateScreeningCancelling ? <Loader2 className="h-4 w-4 animate-spin"/> : selectedCandidateScreeningTaskId ? <Square className="h-4 w-4"/> : screeningSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}
                                            {isSelectedCandidateScreeningCancelling ? "停止中..." : selectedCandidateScreeningTaskId ? "停止初筛" : screeningSubmitting ? "启动中..." : "开始初筛"}
                                        </Button>
                                        {candidateDetail.resume_files[0] ? (
                                            <Button size="sm" variant="outline" onClick={() => void openResumeFile(candidateDetail.resume_files[0])}>
                                                <ExternalLink className="h-4 w-4"/>
                                                查看简历
                                            </Button>
                                        ) : null}
                                        <Button size="sm" variant="outline" onClick={() => openResumeMailDialog([candidateDetail.candidate.id])}>
                                            <Mail className="h-4 w-4"/>
                                            发送简历
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => void generateInterviewQuestions()}
                                            disabled={isCurrentInterviewTaskCancelling}
                                        >
                                            {currentCandidateInterviewTaskId ? <Square className="h-4 w-4"/> : <NotebookText className="h-4 w-4"/>}
                                            {isCurrentInterviewTaskCancelling ? "停止中..." : currentCandidateInterviewTaskId ? "停止生成" : "面试题"}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                                <div className="min-w-0 space-y-6 px-6 py-6">
                                    <Field label="基础信息">
                                        <div className="grid gap-3">
                                            <Input value={candidateEditor.name} onChange={(event) => setCandidateEditor((current: CandidateEditorState) => ({ ...current, name: event.target.value }))} placeholder="姓名"/>
                                            <Input value={candidateEditor.phone} onChange={(event) => setCandidateEditor((current: CandidateEditorState) => ({ ...current, phone: event.target.value }))} placeholder="手机号"/>
                                            <Input value={candidateEditor.email} onChange={(event) => setCandidateEditor((current: CandidateEditorState) => ({ ...current, email: event.target.value }))} placeholder="邮箱"/>
                                            <Input value={candidateEditor.currentCompany} onChange={(event) => setCandidateEditor((current: CandidateEditorState) => ({ ...current, currentCompany: event.target.value }))} placeholder="当前公司"/>
                                            <Input value={candidateEditor.yearsOfExperience} onChange={(event) => setCandidateEditor((current: CandidateEditorState) => ({ ...current, yearsOfExperience: event.target.value }))} placeholder="工作年限"/>
                                            <Input value={candidateEditor.education} onChange={(event) => setCandidateEditor((current: CandidateEditorState) => ({ ...current, education: event.target.value }))} placeholder="学历"/>
                                        </div>
                                    </Field>

                                    <Field label="AI 评分与建议">
                                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                                                        {formatScoreValue(
                                                            candidateDetail.score?.total_score,
                                                            typeof candidateDetail.score?.total_score_scale === "number"
                                                                ? candidateDetail.score.total_score_scale
                                                                : null,
                                                        )}
                                                    </p>
                                                    <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
                                                        AI 建议：{candidateDetail.score?.recommendation || "尚未生成"} · 推荐状态 {labelForCandidateStatus(candidateDetail.score?.suggested_status || "")}
                                                    </p>
                                                </div>
                                                <Badge variant="outline" className="shrink-0 rounded-full">
                                                    匹配度 {formatPercent(candidateDetail.score?.match_percent ?? candidateDetail.candidate.match_percent)}
                                                </Badge>
                                            </div>
                                            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                                                <p className="break-words leading-7">
                                                    <span className="font-medium text-slate-900 dark:text-slate-100">优势：</span>
                                                    {candidateDetail.score?.advantages_text || joinTags(Array.isArray(candidateDetail.score?.advantages) ? candidateDetail.score.advantages as string[] : []) || "暂无"}
                                                </p>
                                                <p className="break-words leading-7">
                                                    <span className="font-medium text-slate-900 dark:text-slate-100">风险点：</span>
                                                    {candidateDetail.score?.concerns_text || joinTags(Array.isArray(candidateDetail.score?.concerns) ? candidateDetail.score.concerns as string[] : []) || "暂无"}
                                                </p>
                                            </div>
                                        </div>
                                    </Field>

                                    <Field label="初筛工作记忆">
                                        {candidateDetail.workflow_memory ? (
                                            <div className="grid gap-3">
                                                <InfoTile label="记忆来源" value={labelForMemorySource(candidateDetail.workflow_memory.screening_memory_source)}/>
                                                <InfoTile label="最近初筛时间" value={formatLongDateTime(candidateDetail.workflow_memory.last_screened_at)}/>
                                                <InfoTile label="初筛 Skills" value={formatSkillNames(candidateDetail.workflow_memory.screening_skill_ids, skillMap)}/>
                                                <InfoTile label="面试题 Skills" value={formatSkillNames(candidateDetail.workflow_memory.interview_skill_ids, skillMap)}/>
                                            </div>
                                        ) : (
                                            <EmptyState title="暂无初筛工作记忆" description="完成一次初筛后，这里会显示本次初筛使用的 Skills、来源和时间，便于后续生成面试题时复用。"/>
                                        )}
                                        <p className="mt-3 break-words text-xs leading-6 text-slate-500 dark:text-slate-400">
                                            {`点击“开始初筛”时，会按“岗位绑定 Skills > 初筛工作记忆”继续执行；若均未配置，则本次不会传 Skills。当前预计来源：${effectiveScreeningSkillSourceLabel}。`}
                                        </p>
                                        <p className="mt-2 break-words text-xs leading-6 text-slate-500 dark:text-slate-400">
                                            {`当前预计使用：${formatSkillNames(effectiveScreeningSkillIds, skillMap)}`}
                                        </p>
                                    </Field>

                                    <div className="grid gap-4">
                                        <Field label="人工修正分数">
                                            <Input value={candidateEditor.manualOverrideScore} onChange={(event) => setCandidateEditor((current: CandidateEditorState) => ({ ...current, manualOverrideScore: event.target.value }))} placeholder="例如 88"/>
                                        </Field>
                                        <Field label="修正原因">
                                            <Input value={candidateEditor.manualOverrideReason} onChange={(event) => setCandidateEditor((current: CandidateEditorState) => ({ ...current, manualOverrideReason: event.target.value }))} placeholder="为什么要修正这次 AI 评分"/>
                                        </Field>
                                    </div>

                                    <Field label="标签与备注">
                                        <div className="space-y-3">
                                            <Input value={candidateEditor.tagsText} onChange={(event) => setCandidateEditor((current: CandidateEditorState) => ({ ...current, tagsText: event.target.value }))} placeholder="标签，使用英文逗号分隔"/>
                                            <Textarea value={candidateEditor.notes} onChange={(event) => setCandidateEditor((current: CandidateEditorState) => ({ ...current, notes: event.target.value }))} rows={4} placeholder="例如：沟通不错，但对设备联调经验需要进一步核实"/>
                                            <Button onClick={() => void saveCandidate()}>
                                                <Save className="h-4 w-4"/>
                                                保存候选人信息
                                            </Button>
                                        </div>
                                    </Field>

                                    <Field label="状态流转">
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap gap-2">
                                                {Object.entries(candidateStatusLabels).map(([value, label]) => {
                                                    const isCurrent = candidateDetail?.candidate.status === value;
                                                    return (
                                                        <Popover
                                                            key={value}
                                                            open={pendingStatus === value}
                                                            onOpenChange={(open) => {
                                                                if (!open) setPendingStatus(null);
                                                            }}
                                                        >
                                                            <PopoverTrigger asChild>
                                                                <Button
                                                                    size="sm"
                                                                    variant={isCurrent ? "default" : "outline"}
                                                                    onClick={() => {
                                                                        if (!isCurrent) setPendingStatus(value);
                                                                    }}
                                                                >
                                                                    {label}
                                                                </Button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-56 p-3" side="bottom" align="start">
                                                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                    确认变更为「{label}」？
                                                                </p>
                                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                                    当前：{labelForCandidateStatus(candidateDetail.candidate.status)}
                                                                </p>
                                                                <div className="mt-3 flex gap-2">
                                                                    <Button size="sm" className="flex-1" onClick={() => void updateCandidateStatus(value)}>
                                                                        确认
                                                                    </Button>
                                                                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setPendingStatus(null)}>
                                                                        取消
                                                                    </Button>
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                    );
                                                })}
                                            </div>
                                            <Textarea value={statusUpdateReason} onChange={(event) => setStatusUpdateReason(event.target.value)} rows={3} placeholder="状态变更原因，例如：AI 初筛通过，安排技术面试"/>
                                            <div className="space-y-3">
                                                {candidateDetail.status_history.length ? candidateDetail.status_history.map((history) => (
                                                    <div key={history.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                {labelForCandidateStatus(history.from_status || "")} → {labelForCandidateStatus(history.to_status)}
                                                            </p>
                                                            <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(history.created_at)}</p>
                                                        </div>
                                                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{history.reason || "未填写原因"}</p>
                                                    </div>
                                                )) : (
                                                    <EmptyState title="暂无状态记录" description="候选人发生流转后，这里会记录完整状态历史。"/>
                                                )}
                                            </div>
                                        </div>
                                    </Field>

                                    <Field label="AI 助手">
                                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{"对话记录已收纳到独立助手面板"}</p>
                                                    <p className="mt-1 break-words text-sm leading-6 text-slate-500 dark:text-slate-400">
                                                        {candidateAssistantActivity.length
                                                            ? `当前候选人已有 ${candidateAssistantActivity.length} 条助手对话留痕。为避免详情页被聊天卡片刷满，这里改为收纳展示。`
                                                            : "这里不再逐条展开助手对话，避免右侧详情被聊天记录挤满。"}
                                                    </p>
                                                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{`面试题默认使用：${preferredInterviewSkillSourceLabel}`}</p>
                                                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{`当前实际来源：${effectiveInterviewSkillSourceLabel}`}</p>
                                                </div>
                                                <Button size="sm" variant="outline" onClick={() => openAssistantMode("drawer")}>
                                                    <Bot className="h-4 w-4"/>
                                                    {"打开 AI 助手"}
                                                </Button>
                                            </div>
                                        </div>
                                    </Field>

                                    <Field label="AI 执行日志">
                                        <div className="space-y-3">
                                            {candidateProcessActivity.length ? (
                                                <>
                                                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                                已记录 {candidateProcessActivity.length} 条流程日志
                                                            </p>
                                                            <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
                                                                默认收起，避免右侧详情被日志卡片挤满；需要排查时再展开查看。
                                                            </p>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => setCandidateProcessLogsExpanded((current) => !current)}
                                                        >
                                                            {candidateProcessLogsExpanded ? "收起日志" : "展开日志"}
                                                        </Button>
                                                    </div>
                                                    {candidateProcessLogsExpanded ? candidateProcessActivity.map((log) => {
                                                        const logSkillSnapshots = resolveLogSkillSnapshots(log, skillMap);
                                                        return (
                                                            <div key={log.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{labelForTaskType(log.task_type)}</p>
                                                                        <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{labelForProvider(log.model_provider)} {"·"} {log.model_name || "-"} {"·"} {formatLongDateTime(log.created_at)}</p>
                                                                    </div>
                                                                    <Badge className={cn("rounded-full border", statusBadgeClass("task", log.status))}>
                                                                        {labelForTaskExecutionStatus(log.status)}
                                                                    </Badge>
                                                                </div>
                                                                <div className="mt-3 grid gap-3">
                                                                    <InfoTile label="Skills" value={formatSkillSnapshotNames(logSkillSnapshots)}/>
                                                                    <InfoTile label="记忆来源" value={labelForMemorySource(log.memory_source)}/>
                                                                </div>
                                                                {log.error_message ? <p className="mt-3 break-all text-sm text-rose-600">{log.error_message}</p> : null}
                                                                <div className="mt-3 min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                                    <pre className="min-w-0 whitespace-pre-wrap break-all text-xs leading-6 text-slate-600 dark:text-slate-300">{formatStructuredValue(log.output_snapshot, log.output_summary || "执行中，等待模型返回...")}</pre>
                                                                </div>
                                                                <div className="mt-3 flex flex-wrap gap-2">
                                                                    <Button size="sm" variant="outline" onClick={() => openTaskLogDetail(log.id)}>查看完整日志</Button>
                                                                </div>
                                                            </div>
                                                        );
                                                    }) : null}
                                                </>
                                            ) : (
                                                <EmptyState title="暂无 AI 执行日志" description="开始初筛、生成面试题后，这里会显示候选人的流程任务留痕与输出内容。"/>
                                            )}
                                        </div>
                                    </Field>

                                    <Field label="简历与面试题">
                                        <div className="space-y-4">
                                            <div className="space-y-3">
                                                {candidateDetail.resume_files.length ? candidateDetail.resume_files.map((file) => (
                                                    <div key={file.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                        <p className="font-medium text-slate-900 dark:text-slate-100">{file.original_name}</p>
                                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                            {file.file_ext || "-"} {"·"} {file.file_size || 0} bytes {"·"} {"解析状态"} {file.parse_status}
                                                        </p>
                                                        {file.parse_error ? <p className="mt-2 break-all text-sm text-rose-600">{file.parse_error}</p> : null}
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            <Button size="sm" variant="outline" onClick={() => void openResumeFile(file)}>{"查看原件"}</Button>
                                                            <Button size="sm" variant="outline" onClick={() => void openResumeFile(file, true)}>{"下载简历"}</Button>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <EmptyState title="暂无简历附件" description="这个候选人还没有已上传的简历文件。"/>
                                                )}
                                            </div>

                                            <Separator/>

                                            <div className="space-y-3">
                                                <div className="grid gap-3">
                                                    <Input value={interviewRoundName} onChange={(event) => setInterviewRoundName(event.target.value)} placeholder="轮次，例如 初试 / 复试"/>
                                                    <Input value={joinTags(effectiveInterviewSkillIds.map((id) => skillMap.get(id)?.name || ""))} readOnly placeholder="当前使用的 Skills"/>
                                                </div>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">{`当前默认来源：${preferredInterviewSkillSourceLabel}`}</p>
                                                <Textarea value={interviewCustomRequirements} onChange={(event) => setInterviewCustomRequirements(event.target.value)} rows={3} placeholder="补充要求，例如：偏向 IoT 设备联调、自动化稳定性、跨部门协作追问"/>
                                                <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">{`当前实际 Skills：${formatSkillNames(effectiveInterviewSkillIds, skillMap)}`}</p>
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">{`当前实际来源：${effectiveInterviewSkillSourceLabel}`}</p>
                                                    {interviewSkillSelectionDirty ? (
                                                        <Button size="sm" variant="ghost" onClick={() => { setSelectedInterviewSkillIds([]); setInterviewSkillSelectionDirty(false); }}>恢复默认 Skills</Button>
                                                    ) : null}
                                                </div>
                                                <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                                                    {!interviewSkillSelectionDirty
                                                        ? "未手动选择时，生成面试题会按“岗位绑定 Skills > 面试题工作记忆”执行；若均未配置，则本次不会传 Skills。"
                                                        : "当前已手动选择 Skills，本次会以手动选择为准。"}
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {skills.map((skill) => (
                                                        <button
                                                            key={skill.id}
                                                            type="button"
                                                            className={cn(
                                                                "rounded-full border px-3 py-2 text-xs transition",
                                                                effectiveInterviewSkillIds.includes(skill.id)
                                                                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                    : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                            )}
                                                            onClick={() => toggleInterviewSkillSelection(skill.id)}
                                                        >
                                                            {skill.name}
                                                        </button>
                                                    ))}
                                                </div>
                                                {candidateDetail.interview_questions.length ? (
                                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                                            <p className="font-medium text-slate-900 dark:text-slate-100">
                                                                {"最近一份面试题："}{candidateDetail.interview_questions[0].round_name}
                                                            </p>
                                                            <Button size="sm" variant="outline" onClick={() => void downloadInterviewQuestion(candidateDetail.interview_questions[0].id)}>
                                                                <Download className="h-4 w-4"/>
                                                                {"下载 HTML"}
                                                            </Button>
                                                        </div>
                                                        {looksLikeFullHtmlDocument(candidateDetail.interview_questions[0].html_content) ? (
                                                            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-950">
                                                                <iframe
                                                                    title={`${candidateDetail.interview_questions[0].round_name}-preview`}
                                                                    srcDoc={candidateDetail.interview_questions[0].html_content}
                                                                    sandbox="allow-scripts"
                                                                    onLoad={(event) => syncInterviewPreviewHeight(event.currentTarget)}
                                                                    className="w-full border-0 bg-white"
                                                                    style={{ height: interviewPreviewHeight }}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div
                                                                className="prose prose-slate max-w-none dark:prose-invert"
                                                                dangerouslySetInnerHTML={{ __html: candidateDetail.interview_questions[0].html_content }}
                                                            />
                                                        )}
                                                    </div>
                                                ) : (
                                                    <EmptyState title="暂无面试题" description="点击上方按钮后，系统会结合岗位 JD、候选人简历和 Skills 生成定制化题目。"/>
                                                )}
                                            </div>
                                        </div>
                                    </Field>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <EmptyState title="请选择一个候选人" description="左侧列表或看板选中候选人后，右侧会打开完整档案与 AI 评估区。"/>
                    )}
                </Card>
            </div>
        </div>
    );
}

function DroppableColumn({ status, label, count, children }: { status: string; label: string; count: number; children: React.ReactNode }) {
    const { isOver, setNodeRef } = useDroppable({ id: status });
    return (
        <div ref={setNodeRef} className={cn("rounded-2xl border p-4 transition-colors", isOver ? "border-primary bg-primary/5 dark:bg-primary/10" : "border-slate-200/80 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/60")}>
            <div className="mb-4 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
                <Badge variant="outline" className="rounded-full">{count}</Badge>
            </div>
            <div className="space-y-3 min-h-[100px]">
                {children}
            </div>
        </div>
    );
}

interface DraggableCandidateCardProps {
    candidate: CandidateSummary;
    isSelected: boolean;
    onSelect: () => void;
    toggleSelection: (id: number, checked: boolean) => void;
    isChecked: boolean;
    mailSummary: string | null;
}

function DraggableCandidateCard({ 
    candidate, 
    isSelected, 
    onSelect, 
    toggleSelection, 
    isChecked, 
    mailSummary 
}: DraggableCandidateCardProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: String(candidate.id),
        data: { candidate },
    });
    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : 1,
        opacity: isDragging ? 0.8 : 1,
    } : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={cn(
                "w-full rounded-2xl border px-4 py-4 transition cursor-grab active:cursor-grabbing",
                isSelected
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950",
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <button
                    type="button"
                    onClick={() => onSelect()}
                    className="min-w-0 flex-1 text-left"
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{candidate.name}</p>
                        {mailSummary ? (
                            <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                已发简历
                            </Badge>
                        ) : null}
                    </div>
                    <p className="mt-1 text-xs opacity-80">{candidate.position_title || "未分配岗位"}</p>
                    {mailSummary ? (
                        <p className="mt-2 text-[11px] opacity-80">{mailSummary}</p>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between text-xs opacity-80">
                        <span>匹配度 {formatPercent(candidate.match_percent)}</span>
                        <span>{formatDateTime(candidate.updated_at)}</span>
                    </div>
                </button>
                <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => toggleSelection(candidate.id, event.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={`选择候选人 ${candidate.name}`}
                />
            </div>
        </div>
    );
}
