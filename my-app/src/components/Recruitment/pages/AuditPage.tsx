"use client";

import React from "react";
import {ChevronDown, ChevronUp, Loader2, RefreshCw} from "lucide-react";

import type {
    AITaskLog,
    CandidateSummary,
    PositionSummary,
    RecruitmentSkill,
} from "@/lib/recruitment-api";
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
    formatSkillSnapshotNames,
    formatStructuredValue,
    labelForMemorySource,
    labelForProvider,
    labelForTaskExecutionStatus,
    labelForTaskType,
    resolveLogSkillSnapshots,
    statusBadgeClass,
} from "../utils";

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

const AUDIT_LIST_ESTIMATED_ROW_HEIGHT = 54;
const AUDIT_LIST_OVERSCAN = 8;

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
    const [auditListViewportEl, setAuditListViewportEl] = React.useState<HTMLDivElement | null>(null);
    const [auditListScrollTop, setAuditListScrollTop] = React.useState(0);
    const [auditListViewportHeight, setAuditListViewportHeight] = React.useState(0);
    const [auditListMeasuredRowHeights, setAuditListMeasuredRowHeights] = React.useState<Record<number, number>>({});
    const auditListMetricsFrameRef = React.useRef<number | null>(null);
    const auditListRowObserversRef = React.useRef<Map<number, ResizeObserver>>(new Map());
    const selectedLogSkillSnapshots = selectedLogDetail ? resolveLogSkillSnapshots(selectedLogDetail, skillMap) : [];

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
    }, [aiLogs, auditListTableWidth]);

    React.useEffect(() => {
        const rowObservers = auditListRowObserversRef.current;
        return () => {
            rowObservers.forEach((observer) => observer.disconnect());
            rowObservers.clear();
        };
    }, []);

    const auditListVirtualMetrics = React.useMemo(() => {
        let totalHeight = 0;
        const metrics: VirtualAuditRowMetric[] = aiLogs.map((log) => {
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
    }, [aiLogs, auditListMeasuredRowHeights, auditListScrollTop, auditListViewportHeight]);

    const visibleAuditLogWindow = React.useMemo(() => {
        if (auditListVirtualMetrics.endIndex < auditListVirtualMetrics.startIndex) {
            return [];
        }
        return aiLogs.slice(auditListVirtualMetrics.startIndex, auditListVirtualMetrics.endIndex + 1);
    }, [aiLogs, auditListVirtualMetrics.endIndex, auditListVirtualMetrics.startIndex]);

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
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">任务筛选条</p>
                                <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{auditFiltersCollapsed ? auditFilterSummary : "按任务类型和状态收拢 AI 任务，便于排查与复盘。"}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" onClick={() => void refreshLogsWithFeedback()} disabled={logsLoading}>
                                    {logsLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}
                                    {logsLoading ? "刷新中..." : "刷新任务"}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setAuditFiltersCollapsed((current) => !current)}
                                >
                                    {auditFiltersCollapsed ? <ChevronDown className="h-4 w-4"/> : <ChevronUp className="h-4 w-4"/>}
                                    {auditFiltersCollapsed ? "展开筛选" : "收起筛选"}
                                </Button>
                            </div>
                        </div>
                        {!auditFiltersCollapsed ? (
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr]">
                                <NativeSelect value={logTaskTypeFilter} onChange={(event) => setLogTaskTypeFilter(event.target.value)}>
                                    <option value="all">全部任务类型</option>
                                    {Object.entries(aiTaskLabels).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </NativeSelect>
                                <NativeSelect value={logStatusFilter} onChange={(event) => setLogStatusFilter(event.target.value)}>
                                    <option value="all">全部状态</option>
                                    <option value="pending">pending</option>
                                    <option value="success">success</option>
                                    <option value="fallback">fallback</option>
                                    <option value="running">running</option>
                                    <option value="cancelling">cancelling</option>
                                    <option value="cancelled">cancelled</option>
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
                        <CardTitle className="text-lg">任务审计中心</CardTitle>
                        <CardDescription>展示任务类型、关联对象、状态、使用模型和执行时间。</CardDescription>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col pt-6">
                        {logsLoading ? (
                            <LoadingCard label="正在加载 AI 审计日志"/>
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
                                                    <TableHead style={{width: auditListDisplayColumnWidths.taskType, minWidth: auditListDisplayColumnWidths.taskType, maxWidth: auditListDisplayColumnWidths.taskType}} className="whitespace-nowrap">任务类型</TableHead>
                                                    <TableHead style={{width: auditListDisplayColumnWidths.object, minWidth: auditListDisplayColumnWidths.object, maxWidth: auditListDisplayColumnWidths.object}} className="whitespace-nowrap">关联对象</TableHead>
                                                    <TableHead style={{width: auditListDisplayColumnWidths.status, minWidth: auditListDisplayColumnWidths.status, maxWidth: auditListDisplayColumnWidths.status}} className="whitespace-nowrap">状态</TableHead>
                                                    <TableHead style={{width: auditListDisplayColumnWidths.model, minWidth: auditListDisplayColumnWidths.model, maxWidth: auditListDisplayColumnWidths.model}} className="whitespace-nowrap">模型</TableHead>
                                                    <TableHead style={{width: auditListDisplayColumnWidths.duration, minWidth: auditListDisplayColumnWidths.duration, maxWidth: auditListDisplayColumnWidths.duration}} className="whitespace-nowrap">耗时</TableHead>
                                                    <TableHead style={{width: auditListDisplayColumnWidths.time, minWidth: auditListDisplayColumnWidths.time, maxWidth: auditListDisplayColumnWidths.time}} className="whitespace-nowrap text-right">时间</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {aiLogs.length ? (
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
                                                        {visibleAuditLogWindow.map((log) => (
                                                            <TableRow
                                                                key={log.id}
                                                                ref={createAuditRowMeasureRef(log.id)}
                                                                className={cn("cursor-pointer", selectedLogId === log.id && "bg-slate-100 dark:bg-slate-900")}
                                                                onClick={() => setSelectedLogId(log.id)}
                                                            >
                                                                <TableCell style={{width: auditListDisplayColumnWidths.taskType, minWidth: auditListDisplayColumnWidths.taskType, maxWidth: auditListDisplayColumnWidths.taskType}}>
                                                                    <HoverRevealText text={labelForTaskType(log.task_type)}/>
                                                                </TableCell>
                                                                <TableCell style={{width: auditListDisplayColumnWidths.object, minWidth: auditListDisplayColumnWidths.object, maxWidth: auditListDisplayColumnWidths.object}}>
                                                                    <HoverRevealText text={buildLogObjectLabel(log, positionMap, candidateMap, skillMap)}/>
                                                                </TableCell>
                                                                <TableCell style={{width: auditListDisplayColumnWidths.status, minWidth: auditListDisplayColumnWidths.status, maxWidth: auditListDisplayColumnWidths.status}}>
                                                                    <Badge className={cn("rounded-full border", statusBadgeClass("task", log.status))}>
                                                                        {labelForTaskExecutionStatus(log.status)}
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell style={{width: auditListDisplayColumnWidths.model, minWidth: auditListDisplayColumnWidths.model, maxWidth: auditListDisplayColumnWidths.model}}>
                                                                    <HoverRevealText text={`${labelForProvider(log.model_provider)} · ${log.model_name || "-"}`}/>
                                                                </TableCell>
                                                                <TableCell style={{width: auditListDisplayColumnWidths.duration, minWidth: auditListDisplayColumnWidths.duration, maxWidth: auditListDisplayColumnWidths.duration}} className="tabular-nums">
                                                                    {log.duration_ms != null ? `${(log.duration_ms / 1000).toFixed(1)}s` : "-"}
                                                                </TableCell>
                                                                <TableCell style={{width: auditListDisplayColumnWidths.time, minWidth: auditListDisplayColumnWidths.time, maxWidth: auditListDisplayColumnWidths.time}} className="whitespace-nowrap pr-4 text-right tabular-nums">
                                                                    {formatDateTime(log.created_at)}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
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
                                                            <EmptyState title="暂无 AI 审计记录" description="当招聘模块调用模型后，这里会沉淀成可追踪的任务日志。"/>
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
                    {logDetailLoading ? <LoadingPanel label="正在加载日志详情"/> : selectedLogDetail ? (
                        <div className="flex h-full min-h-0 flex-1 flex-col">
                            <div className="border-b border-slate-200/80 px-6 py-5 dark:border-slate-800">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge className={cn("rounded-full border", statusBadgeClass("task", selectedLogDetail.status))}>
                                        {labelForTaskExecutionStatus(selectedLogDetail.status)}
                                    </Badge>
                                    <Badge variant="outline" className="rounded-full">{labelForTaskType(selectedLogDetail.task_type)}</Badge>
                                </div>
                                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                    {buildLogObjectLabel(selectedLogDetail, positionMap, candidateMap, skillMap)}
                                </h3>
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                    {labelForProvider(selectedLogDetail.model_provider)} · {selectedLogDetail.model_name || "-"} · {formatLongDateTime(selectedLogDetail.created_at)}
                                </p>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                                <div className="min-w-0 space-y-5 px-6 py-6">
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <InfoTile label="技能使用情况" value={formatSkillSnapshotNames(selectedLogSkillSnapshots)}/>
                                        <InfoTile label="记忆来源" value={labelForMemorySource(selectedLogDetail.memory_source)}/>
                                    </div>
                                    <InfoTile label="输入摘要" value={selectedLogDetail.input_summary || "暂无"}/>
                                    <InfoTile label="输出摘要" value={selectedLogDetail.output_summary || "暂无"}/>
                                    <InfoTile label="错误信息" value={selectedLogDetail.error_message || "无"}/>
                                    <Field label="完整 Skills">
                                        <div className="space-y-3">
                                            {selectedLogSkillSnapshots.length ? (
                                                selectedLogSkillSnapshots.map((skill) => (
                                                    <div key={`${skill.skill_code}-${skill.id}`} className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
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
                                                        <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-slate-600 dark:text-slate-300">{skill.content || "暂无内容"}</pre>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                                    本次未记录关联 Skills。
                                                </div>
                                            )}
                                        </div>
                                    </Field>
                                    <Field label="Prompt Snapshot">
                                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                            <pre className="whitespace-pre-wrap break-words">{selectedLogDetail.prompt_snapshot || "暂无 Prompt 快照"}</pre>
                                        </div>
                                    </Field>
                                    <Field label="完整模型请求">
                                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                            <pre className="whitespace-pre-wrap break-words">{selectedLogDetail.full_request_snapshot || "暂无完整模型请求"}</pre>
                                        </div>
                                    </Field>
                                    <Field label="完整输出">
                                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                            <pre className="whitespace-pre-wrap break-words">{formatStructuredValue(selectedLogDetail.output_snapshot, selectedLogDetail.output_summary || "暂无完整输出")}</pre>
                                        </div>
                                    </Field>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <EmptyState title="请选择一条任务记录" description="左侧点开任务后，这里会展示输入摘要、输出摘要、错误信息和 Skill 使用情况。"/>
                    )}
                </Card>
            </div>
        </div>
    );
}
