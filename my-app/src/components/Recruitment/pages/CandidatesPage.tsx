"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import ReactMarkdown from "react-markdown";
import {useVirtualizer} from "@tanstack/react-virtual";
import {
    ArrowRightLeft,
    Bot,
    Briefcase,
    Calendar,
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    Download,
    ExternalLink,
    Eye,
    LayoutGrid,
    List,
    Loader2,
    Mail,
    NotebookText,
    Plus,
    RotateCcw,
    Save,
    SlidersHorizontal,
    Sparkles,
    Square,
    Trash2,
    UserCheck,
    Users,
    ZoomIn,
} from "lucide-react";

import {
    joinTags,
    type AITaskLog,
    type CandidateDetail,
    type CandidateScoreDimension,
    type CandidateSummary,
    type PositionSummary,
    type RecruitmentSkill,
    type ResumeFile,
} from "@/lib/recruitment-api";
import {getCurrentLanguage, useI18n} from "@/lib/i18n";
import {cn} from "@/lib/utils";
import {Badge} from "@/components/ui/badge";
import {CandidateRadarChart} from "../components/CandidateRadarChart";
import {Button} from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Textarea} from "@/components/ui/textarea";

import {
    type AssistantDisplayMode,
    type CandidateEditorState,
    type CandidateListColumnKey,
    candidateStatusLabels,
    type CandidateViewMode,
    panelClass as defaultPanelClass,
} from "../types";
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
import {
    formatDateTime,
    formatLongDateTime,
    formatPercent,
    formatScoreValue,
    formatSkillNames,
    formatSkillSnapshotNames,
    formatStructuredValue,
    labelForCandidateStatus,
    labelForMemorySource,
    labelForProvider,
    labelForScreeningTaskStage,
    labelForTaskExecutionStatus,
    labelForTaskType,
    parseStructuredLogOutput,
    resolveCandidateDisplayStatus,
    resolveCandidateFacingErrorContext,
    resolveLogSkillSnapshots,
    sanitizeCandidateFacingErrorText,
    statusBadgeClass,
} from "../utils";

type CandidateBoardGroup = {
    status: string;
    label: string;
    items: CandidateSummary[];
};

type CandidateListDisplayColumnWidths = Record<CandidateListColumnKey, number>;

type CandidateInterviewQuestion = CandidateDetail["interview_questions"][number];

const CANDIDATE_LIST_ESTIMATED_ROW_HEIGHT = 96;
const CANDIDATE_LIST_OVERSCAN = 6;
const SCORE_SUGGESTED_STATUS_VALUES = new Set(["screening_passed", "talent_pool", "screening_rejected"]);

type CandidateRowProps = {
    candidate: CandidateSummary;
    isSelected: boolean;
    selectedCandidateIdSet: ReadonlySet<number>;
    columns: CandidateListColumnKey[];
    columnWidths: CandidateListDisplayColumnWidths;
    onSelect: () => void;
    onToggleCheck: (checked: boolean) => void;
    getResumeMailSummary: (candidateId: number) => string | null;
    getOrganizationLabel: (orgCode: string | null | undefined) => string;
    tr: ReturnType<typeof getCandidatesLocale>;
    language: string;
    measureRef?: (node: HTMLTableRowElement | null) => void;
    dataIndex?: number;
};

const CandidateRow = React.memo(function CandidateRow({
    candidate,
    isSelected,
    selectedCandidateIdSet,
    columns,
    columnWidths,
    onSelect,
    onToggleCheck,
    getResumeMailSummary,
    getOrganizationLabel,
    tr,
    language,
    measureRef,
    dataIndex,
}: CandidateRowProps) {
    const isChecked = selectedCandidateIdSet.has(candidate.id);
    const resumeMailSummary = getResumeMailSummary(candidate.id);
    const displayStatus = resolveCandidateDisplayStatus(candidate);
    const isZh = language !== "en-US";

    return (
        <tr
            ref={measureRef}
            data-index={dataIndex}
            data-candidate-id={candidate.id}
            className={cn("cursor-pointer", isSelected && "bg-slate-100 dark:bg-slate-900")}
            onClick={onSelect}
        >
            <td className="p-2 align-middle whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => onToggleCheck(event.target.checked)}
                    aria-label={tr.selectCandidate(candidate.name)}
                />
            </td>
            {columns.map((columnKey) => {
                if (columnKey === "candidate") {
                    return (
                        <td
                            key={columnKey}
                            style={{
                                width: columnWidths.candidate,
                                minWidth: columnWidths.candidate,
                                maxWidth: columnWidths.candidate,
                            }}
                            className="p-2 align-middle"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <HoverRevealText text={candidate.name + (candidate.age ? ` (${candidate.age}${tr.ageSuffix})` : "")} className="font-medium text-slate-900 dark:text-slate-100"/>
                                    {resumeMailSummary ? (
                                        <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                            {tr.resumeSent}
                                        </Badge>
                                    ) : null}
                                </div>
                                <HoverRevealText
                                    text={candidate.phone || candidate.email || tr.noContact}
                                    className="text-sm text-slate-500 dark:text-slate-400"
                                />
                                {candidate.ai_potential_position ? (
                                    <HoverRevealText
                                        text={`${isZh ? "转岗潜力" : "Potential Transition"}: ${candidate.ai_potential_position}${candidate.ai_potential_reason ? ` · ${candidate.ai_potential_reason}` : ""}`}
                                        className="mt-1 text-sm text-sky-600 dark:text-sky-300"
                                        tooltipClassName="max-w-md"
                                    />
                                ) : null}
                                {resumeMailSummary ? (
                                    <HoverRevealText
                                        text={resumeMailSummary}
                                        className="mt-1 text-sm text-sky-600 dark:text-slate-300"
                                        tooltipClassName="max-w-sm"
                                    />
                                ) : null}
                            </div>
                        </td>
                    );
                }
                if (columnKey === "organization") {
                    return (
                        <td
                            key={columnKey}
                            style={{
                                width: columnWidths.organization,
                                minWidth: columnWidths.organization,
                                maxWidth: columnWidths.organization,
                            }}
                            className="p-2 align-middle"
                        >
                            <HoverRevealText
                                text={getOrganizationLabel(candidate.org_code)}
                                className="text-sm text-slate-600 dark:text-slate-300"
                            />
                        </td>
                    );
                }
                if (columnKey === "position") {
                    return (
                        <td
                            key={columnKey}
                            style={{
                                width: columnWidths.position,
                                minWidth: columnWidths.position,
                                maxWidth: columnWidths.position,
                            }}
                            className="p-2 align-middle"
                        >
                            <HoverRevealText text={candidate.position_title || tr.unassignedPosition}/>
                        </td>
                    );
                }
                if (columnKey === "status") {
                    return (
                        <td
                            key={columnKey}
                            style={{
                                width: columnWidths.status,
                                minWidth: columnWidths.status,
                                maxWidth: columnWidths.status,
                            }}
                            className="p-2 align-middle whitespace-nowrap"
                        >
                            <Badge className={cn("rounded-full border max-w-full", statusBadgeClass("candidate", displayStatus))}>
                                <span className="truncate">{labelForCandidateStatus(displayStatus)}</span>
                            </Badge>
                            {candidate.display_status_reason ? (
                                <HoverRevealText
                                    text={sanitizeCandidateFacingErrorText(candidate.display_status_reason, {
                                        context: resolveCandidateFacingErrorContext(
                                            candidate.active_screening_task_type,
                                            { autoRetry: candidate.active_screening_auto_retry_scheduled },
                                        ),
                                        language,
                                    })}
                                    className="mt-1 text-[15px] leading-4 text-slate-500 dark:text-slate-400"
                                    tooltipClassName="max-w-sm"
                                />
                            ) : null}
                        </td>
                    );
                }
                if (columnKey === "match") {
                    return (
                        <td
                            key={columnKey}
                            style={{
                                width: columnWidths.match,
                                minWidth: columnWidths.match,
                                maxWidth: columnWidths.match,
                            }}
                            className="p-2 align-middle whitespace-nowrap"
                        >
                            {formatPercent(resolveCandidateSummaryMatchPercent(candidate))}
                        </td>
                    );
                }
                if (columnKey === "city") {
                    return (
                        <td
                            key={columnKey}
                            style={{
                                width: columnWidths.city,
                                minWidth: columnWidths.city,
                                maxWidth: columnWidths.city,
                            }}
                            className="p-2 align-middle"
                        >
                            <HoverRevealText text={candidate.city || "-"} className="text-sm text-slate-600 dark:text-slate-300"/>
                        </td>
                    );
                }
                if (columnKey === "expected_city") {
                    return (
                        <td
                            key={columnKey}
                            style={{
                                width: columnWidths.expected_city,
                                minWidth: columnWidths.expected_city,
                                maxWidth: columnWidths.expected_city,
                            }}
                            className="p-2 align-middle"
                        >
                            <HoverRevealText text={candidate.expected_city || "-"} className="text-sm text-slate-600 dark:text-slate-300"/>
                        </td>
                    );
                }
                if (columnKey === "source") {
                    return (
                        <td
                            key={columnKey}
                            style={{
                                width: columnWidths.source,
                                minWidth: columnWidths.source,
                                maxWidth: columnWidths.source,
                            }}
                            className="p-2 align-middle"
                        >
                            <HoverRevealText text={candidate.source || "-"} className="text-sm text-slate-600 dark:text-slate-300"/>
                        </td>
                    );
                }
                if (columnKey === "updated") {
                    return (
                        <td
                            key={columnKey}
                            style={{
                                width: columnWidths.updated,
                                minWidth: columnWidths.updated,
                                maxWidth: columnWidths.updated,
                            }}
                            className="p-2 align-middle"
                        >
                            <HoverRevealText text={formatDateTime(candidate.updated_at)}/>
                        </td>
                    );
                }
                return null;
            })}
        </tr>
    );
}, (prev, next) => {
    return prev.isSelected === next.isSelected
        && prev.selectedCandidateIdSet === next.selectedCandidateIdSet
        && prev.columns === next.columns
        && prev.columnWidths === next.columnWidths
        && prev.candidate.status === next.candidate.status
        && prev.candidate.active_screening_task_status === next.candidate.active_screening_task_status
        && prev.candidate.display_status_reason === next.candidate.display_status_reason
        && prev.candidate.match_percent === next.candidate.match_percent
        && prev.candidate.updated_at === next.candidate.updated_at
        && prev.candidate.name === next.candidate.name
        && prev.candidate.phone === next.candidate.phone
        && prev.candidate.email === next.candidate.email
        && prev.candidate.org_code === next.candidate.org_code
        && prev.candidate.position_title === next.candidate.position_title
        && prev.candidate.source === next.candidate.source
        && prev.candidate.age === next.candidate.age
        && prev.candidate.city === next.candidate.city
        && prev.candidate.expected_city === next.candidate.expected_city
        && prev.language === next.language
        && prev.getResumeMailSummary(prev.candidate.id) === next.getResumeMailSummary(next.candidate.id);
});

function getCandidatesLocale(language = getCurrentLanguage()) {
    const isZh = language !== "en-US";
    return {
        collapse: isZh ? "收起" : "Collapse",
        expandAll: (count: number) => (isZh ? `展开全部（${count} 行）` : `Expand all (${count} lines)`),
        generatedAt: (value: string) => (isZh ? `生成于 ${formatDateTime(value)}` : `Generated ${formatDateTime(value)}`),
        generated: isZh ? "已生成" : "Generated",
        moduleCount: isZh ? "模块数" : "Modules",
        modulesSuffix: isZh ? " 个" : "",
        parsing: isZh ? "解析中" : "Parsing",
        estimatedQuestions: isZh ? "题目数（估）" : "Estimated Questions",
        questionSuffix: isZh ? " 题" : "",
        moduleOutline: isZh ? "模块目录" : "Module Outline",
        extraModules: (count: number) => (isZh ? `+ ${count} 个模块` : `+ ${count} more modules`),
        downloadHtml: isZh ? "下载 HTML" : "Download HTML",
        standalonePreview: isZh ? "独立预览" : "Standalone Preview",
        noAiScoreOutput: isZh ? "暂无 AI 评分输出。" : "No AI screening output yet.",
        aiScreeningResultHeading: isZh ? "# AI 初筛结果" : "# AI Screening Result",
        totalScoreLine: (value: string) => (isZh ? `- 总分：${value}` : `- Total Score: ${value}`),
        matchLine: (value: string) => (isZh ? `- 匹配度：${value}` : `- Match: ${value}`),
        suggestedStatusLine: (value: string) => (isZh ? `- 推荐状态：${value}` : `- Suggested Status: ${value}`),
        aiRecommendationHeading: isZh ? "## AI 建议" : "## AI Recommendation",
        dimensionScoresHeading: isZh ? "## 逐维度评分" : "## Dimension Scores",
        advantagesHeading: isZh ? "## 优势" : "## Strengths",
        concernsHeading: isZh ? "## 风险点" : "## Risks",
        evidenceLabel: isZh ? "证据" : "Evidence",
        delimiter: isZh ? "；" : "; ",
        fullAiOutput: isZh ? "完整 AI 输出" : "Full AI Output",
        modelLabel: isZh ? "模型" : "Model",
        timeLabel: isZh ? "时间" : "Time",
        copied: isZh ? "已复制" : "Copied",
        copyAll: isZh ? "复制全文" : "Copy All",
        viewStructuredRaw: isZh ? "查看结构化原始输出" : "View Structured Raw Output",
        keywordChipPrefix: isZh ? "关键词：" : "Keyword:",
        noKeyword: isZh ? "无关键词" : "No keyword",
        allPrefix: isZh ? "全部" : "All",
        filters: isZh ? "筛选" : "Filters",
        refresh: isZh ? "刷新" : "Refresh",
        listView: isZh ? "列表" : "List",
        boardView: isZh ? "看板" : "Board",
        collapseFilters: isZh ? "收起筛选" : "Collapse Filters",
        search: isZh ? "搜索" : "Search",
        searchPlaceholder: isZh ? "搜索候选人、手机号、邮箱、公司" : "Search candidates, phone, email, or company",
        organization: isZh ? "组织" : "Organization",
        position: isZh ? "岗位" : "Position",
        allPositions: isZh ? "全部岗位" : "All Positions",
        status: isZh ? "状态" : "Status",
        allStatuses: isZh ? "全部状态" : "All Statuses",
        matchPercent: isZh ? "匹配度" : "Match",
        sortingByMatchPercent: isZh ? "正在按匹配度重新排序，当前列表先保留，完成后自动更新。" : "Sorting by match. Keeping the current list visible until the new order is ready.",
        allMatchPercent: isZh ? "全部匹配度" : "All Match Scores",
        above80: isZh ? "80% 以上" : "80%+",
        above60: isZh ? "60% 以上" : "60%+",
        above40: isZh ? "40% 以上" : "40%+",
        source: isZh ? "来源" : "Source",
        allSources: isZh ? "全部来源" : "All Sources",
        selectedLabel: (count: number) => (isZh ? `已选 ${count} 项` : `${count} selected`),
        timeFilter: isZh ? "时间" : "Time",
        allTime: isZh ? "全部时间" : "All Time",
        today: isZh ? "今天" : "Today",
        last7Days: isZh ? "近 7 天" : "Last 7 Days",
        last30Days: isZh ? "近 30 天" : "Last 30 Days",
        matchedCandidates: (count: number) => (isZh ? `共匹配到 ${count} 位候选人` : `${count} candidates matched`),
        reset: isZh ? "重置" : "Reset",
        currentResults: isZh ? "当前结果" : "Current Results",
        pendingScreening: isZh ? "待初筛" : "Pending Screening",
        pendingInterview: isZh ? "待面试" : "Pending Interview",
        talentPoolAndSent: isZh ? "人才库 / 已发简历" : "Talent Pool / Sent Resume",
        peopleSuffix: isZh ? " 人" : "",
        sendCountZero: isZh ? "0 次" : "0 sent",
        sentCountRegex: isZh ? /已发送\s*(\d+)\s*次/ : /(\d+)\s*sent/i,
        sentCountLabel: (count: string) => (isZh ? `${count} 次` : `${count} sent`),
        sentLabel: isZh ? "已发送" : "Sent",
        candidateList: isZh ? "候选人列表" : "Candidate List",
        loadingCandidateList: isZh ? "正在加载候选人列表" : "Loading candidate list",
        loadingCandidateDetail: isZh ? "正在加载候选人详情" : "Loading candidate details",
        splitResizeHint: isZh ? "✨ 列表宽度可自由拖拽调整，找到你最舒适的视图。" : "✨ Drag to resize the list width and find your perfect view.",
        selectedCandidates: (count: number) => (isZh ? `已选中 ${count} 位候选人` : `${count} candidates selected`),
        clearSelection: isZh ? "清空选择" : "Clear Selection",
        stopBatchScreening: isZh ? "停止批量初筛" : "Stop Batch Screening",
        queueBatch: isZh ? "批量入队" : "Queue Batch",
        requeueFreshScreening: isZh ? "批量重新初筛" : "Fresh Screen Batch",
        advancedActions: isZh ? "高级操作" : "Advanced Actions",
        advancedActionsHint: isZh ? "归入人才库、导出、发送简历、设置岗位、变更状态和删除已收起，展开后使用。" : "Move to talent pool, export, send resumes, set position, change status, and delete are collapsed here.",
        sendResumesBatch: isZh ? "发送简历" : "Send Resumes",
        exportCandidates: isZh ? "导出" : "Export",
        exporting: isZh ? "导出中..." : "Exporting...",
        batchDelete: isZh ? "批量删除" : "Batch Delete",
        batchBindPosition: isZh ? "设置岗位" : "Set Position",
        batchBindPositionTitle: isZh ? "设置目标岗位" : "Set Target Position",
        batchBindPositionConfirm: isZh ? "确定" : "OK",
        batchBindPositionCancel: isZh ? "取消" : "Cancel",
        batchUpdateStatus: isZh ? "变更状态" : "Change Status",
        batchUpdateStatusTitle: isZh ? "变更候选人状态" : "Change Candidate Status",
        batchUpdateStatusLabel: isZh ? "目标状态" : "Target Status",
        batchUpdateStatusSelectPlaceholder: isZh ? "请选择状态" : "Select status",
        batchUpdateStatusReason: isZh ? "变更原因（选填）" : "Reason (optional)",
        batchUpdateStatusReasonPlaceholder: isZh ? "填写变更原因" : "Enter reason for status change",
        batchUpdateStatusConfirm: isZh ? "确定变更" : "Confirm Change",
        duplicateWarning: isZh ? "发现重复候选人" : "Duplicate Candidates Found",
        duplicateWarningDesc: (count: number) => isZh ? `检测到 ${count} 位候选人的联系方式与当前候选人相同。` : `${count} candidate(s) have the same contact info.`,
        viewDuplicate: isZh ? "查看" : "View",
        ageSuffix: isZh ? "岁" : "yo",
        cityLabel: isZh ? "所在城市" : "Current City",
        expectedCityLabel: isZh ? "期望城市" : "Expected City",
        selectAllCandidates: isZh ? "全选候选人" : "Select all candidates",
        selectCandidate: (name: string) => (isZh ? `选择候选人 ${name}` : `Select candidate ${name}`),
        stopping: isZh ? "停止中..." : "Stopping...",
        queueing: isZh ? "入队中..." : "Queueing...",
        candidate: isZh ? "候选人" : "Candidate",
        resumeSent: isZh ? "已发简历" : "Resume Sent",
        noContact: isZh ? "未填写联系方式" : "No contact info",
        unassignedPosition: isZh ? "未分配岗位" : "Unassigned Position",
        noCandidatesMatched: isZh ? "没有符合条件的候选人" : "No matching candidates",
        noCandidatesMatchedDesc: isZh ? "调整筛选条件，或先上传一批简历进入系统。" : "Adjust filters or upload resumes first.",
        noCandidatesInStatus: isZh ? "当前状态暂无候选人" : "No candidates in this status",
        originalStatus: isZh ? "原状态" : "Original Status",
        matchBadge: isZh ? "匹配度" : "Match",
        sentBadge: isZh ? "发送" : "Sent",
        profileTab: isZh ? "档案" : "Profile",
        aiAssessmentTab: isZh ? "AI 评估" : "AI Review",
        interviewPrepTab: isZh ? "面试准备" : "Interview Prep",
        startScreening: isZh ? "开始初筛" : "Start Screening",
        restartScreening: isZh ? "重新初筛" : "Re-screen",
        stopScreening: isZh ? "停止初筛" : "Stop Screening",
        viewResume: isZh ? "查看简历" : "View Resume",
        previewResume: isZh ? "预览简历" : "Preview Resume",
        previewOriginal: isZh ? "预览原件" : "Preview Original",
        sendResume: isZh ? "发送简历" : "Send Resume",
        interviewQuestions: isZh ? "面试题" : "Interview Questions",
        stopGeneration: isZh ? "停止生成" : "Stop",
        deleteCandidate: isZh ? "删除候选人" : "Delete Candidate",
        currentScreeningTask: isZh ? "当前初筛任务" : "Current Screening Task",
        taskRunning: isZh ? "任务执行中" : "Task running",
        baseInfo: isZh ? "基础信息" : "Basic Info",
        namePlaceholder: isZh ? "姓名" : "Name",
        phonePlaceholder: isZh ? "手机号" : "Phone",
        emailPlaceholder: isZh ? "邮箱" : "Email",
        companyPlaceholder: isZh ? "当前公司" : "Current Company",
        experiencePlaceholder: isZh ? "工作年限" : "Years of Experience",
        educationPlaceholder: isZh ? "学历" : "Education",
        agePlaceholder: isZh ? "年龄" : "Age",
        cityPlaceholder: isZh ? "所在城市" : "Current City",
        expectedCityPlaceholder: isZh ? "期望城市" : "Expected City",
        tagsAndNotes: isZh ? "标签与备注" : "Tags & Notes",
        tagsPlaceholder: isZh ? "标签，使用英文逗号分隔" : "Tags, separated by commas",
        notesPlaceholder: isZh ? "例如：沟通不错，但对设备联调经验需要进一步核实" : "Example: strong communication, but device integration experience needs follow-up",
        saveCandidateInfo: isZh ? "保存候选人信息" : "Save Candidate Info",
        savingCandidate: isZh ? "保存中..." : "Saving...",
        statusFlow: isZh ? "状态流转" : "Status Flow",
        confirmStatusChange: (label: string) => (isZh ? `确认变更为「${label}」？` : `Change status to "${label}"?`),
        currentStatusLine: (label: string) => (isZh ? `当前：${label}` : `Current: ${label}`),
        confirm: isZh ? "确认" : "Confirm",
        cancel: isZh ? "取消" : "Cancel",
        statusReasonPlaceholder: isZh ? "状态变更原因，例如：AI 初筛通过，安排技术面试" : "Reason for status change, e.g. AI screening passed and a technical interview is scheduled",
        noReasonProvided: isZh ? "未填写原因" : "No reason provided",
        noStatusHistory: isZh ? "暂无状态记录" : "No Status History",
        noStatusHistoryDesc: isZh ? "候选人发生流转后，这里会记录完整状态历史。" : "Status changes will be recorded here once the candidate moves through the process.",
        aiScoreAndAdvice: isZh ? "AI 评分与建议" : "AI Score & Advice",
        viewFullAiOutput: isZh ? "查看完整 AI 输出" : "View Full AI Output",
        aiRecommendationLine: (recommendation: string, status: string) => (isZh ? `AI 建议：${recommendation} · 推荐状态 ${status}` : `AI recommendation: ${recommendation} · Suggested status ${status}`),
        scoreValidationWarnings: isZh ? "评分有校验警告" : "Score validation warnings",
        viewScoreWarnings: isZh ? "查看评分校验警告" : "View Score Validation Warnings",
        strengths: isZh ? "优势" : "Strengths",
        risks: isZh ? "风险点" : "Risks",
        dimensionScores: isZh ? "维度评分" : "Dimension Scores",
        evidence: isZh ? "证据" : "Evidence",
        dimensionReason: isZh ? "评分依据" : "Reasoning",
        inferredDimension: isZh ? "（推断）" : "(inferred)",
        screeningMemory: isZh ? "初筛工作记忆" : "Screening Memory",
        memorySource: isZh ? "记忆来源" : "Memory Source",
        lastScreeningTime: isZh ? "最近初筛时间" : "Last Screening Time",
        screeningSkills: isZh ? "初筛评估方案" : "Screening Assessment Plans",
        interviewSkills: isZh ? "面试题评估方案" : "Interview Assessment Plans",
        noScreeningMemory: isZh ? "暂无初筛工作记忆" : "No Screening Memory",
        noScreeningMemoryDesc: isZh ? "完成一次初筛后，这里会显示本次初筛使用的评估方案、来源和时间，便于后续生成面试题时复用。" : "After a screening run, the used assessment plans, source, and time will appear here for reuse in interview generation.",
        screeningMemoryHint: (source: string) => (isZh ? `点击“开始初筛”时，会按“岗位绑定评估方案 > 初筛工作记忆”继续执行；若均未配置，则本次不会传评估方案。当前预计来源：${source}。` : `When you click "Start Screening", the system uses "position-bound assessment plans > screening memory". If neither exists, no assessment plans are passed. Current expected source: ${source}.`),
        screeningSkillPreview: (skillsText: string) => (isZh ? `当前预计使用：${skillsText}` : `Expected assessment plans: ${skillsText}`),
        manualOverrideScore: isZh ? "人工修正分数" : "Manual Override Score",
        overrideScorePlaceholder: isZh ? "例如 88" : "e.g. 88",
        overrideReason: isZh ? "修正原因" : "Override Reason",
        overrideReasonPlaceholder: isZh ? "为什么要修正这次 AI 评分" : "Why this AI score needs adjustment",
        hrFeedback: isZh ? "HR 反馈" : "HR Feedback",
        hrFeedbackAgree: isZh ? "认同" : "Agree",
        hrFeedbackDisagree: isZh ? "不认同" : "Disagree",
        hrFeedbackNeutral: isZh ? "待定" : "Neutral",
        hrFeedbackReason: isZh ? "反馈原因" : "Feedback Reason",
        hrFeedbackReasonPlaceholder: isZh ? "可选，填写反馈原因" : "Optional, enter reason",
        hrFeedbackSaved: isZh ? "HR 反馈已保存" : "HR feedback saved",
        aiAssistant: isZh ? "AI 助手" : "AI Assistant",
        assistantPackedTitle: isZh ? "对话记录已收纳到独立助手面板" : "Conversation history is grouped in the assistant panel",
        assistantPackedDescWithCount: (count: number) => (isZh ? `当前候选人已有 ${count} 条助手对话留痕。为避免详情页被聊天卡片刷满，这里改为收纳展示。` : `${count} assistant traces already exist for this candidate. To keep the detail panel readable, the conversation is grouped instead of expanded inline.`),
        assistantPackedDescEmpty: isZh ? "这里不再逐条展开助手对话，避免右侧详情被聊天记录挤满。" : "Assistant conversations are no longer expanded inline so the detail panel stays readable.",
        defaultInterviewSource: (source: string) => (isZh ? `面试题默认使用：${source}` : `Default interview source: ${source}`),
        actualSource: (source: string) => (isZh ? `当前实际来源：${source}` : `Actual source: ${source}`),
        openAiAssistant: isZh ? "打开 AI 助手" : "Open AI Assistant",
        aiExecutionLogs: isZh ? "AI 执行日志" : "AI Execution Logs",
        recordedLogs: (count: number) => (isZh ? `已记录 ${count} 条流程日志` : `${count} process logs recorded`),
        logsCollapsedHint: isZh ? "默认收起，避免右侧详情被日志卡片挤满；需要排查时再展开查看。" : "Logs stay collapsed by default so the detail panel does not get crowded. Expand them when you need to investigate.",
        collapseLogs: isZh ? "收起日志" : "Collapse Logs",
        expandLogs: isZh ? "展开日志" : "Expand Logs",
        runningAwaitModel: isZh ? "执行中，等待模型返回..." : "Running, waiting for model output...",
        viewFullLog: isZh ? "查看完整日志" : "View Full Log",
        noAiLogs: isZh ? "暂无 AI 执行日志" : "No AI Execution Logs",
        noAiLogsDesc: isZh ? "开始初筛、生成面试题后，这里会显示候选人的流程任务留痕与输出内容。" : "Process logs and outputs will appear here after screening or interview-question generation starts.",
        noResumeFile: isZh ? "暂无简历文件" : "No resume file",
        resumeFileDesc: (fileExt: string, size: number, status: string) => (isZh ? `${fileExt} · ${size} bytes · 解析状态 ${status}` : `${fileExt} · ${size} bytes · Parse status ${status}`),
        resumeFileEmptyDesc: isZh ? "上传简历后，这里会显示当前文件、类型与解析状态。" : "After a resume is uploaded, its file info, type, and parse status will appear here.",
        viewOriginal: isZh ? "预览原件" : "Preview Original",
        downloadResume: isZh ? "下载简历" : "Download Resume",
        deleteResume: isZh ? "删除简历" : "Delete Resume",
        parseErrorLine: (message: string) => (isZh ? `解析异常：${message}` : `Parse error: ${message}`),
        roundPlaceholder: isZh ? "轮次，例如 初试 / 复试" : "Round, e.g. Round 1 / Final",
        currentSkillsPlaceholder: isZh ? "当前使用的评估方案" : "Current Assessment Plans",
        interviewRequirementsPlaceholder: isZh ? "补充要求，例如：偏向 IoT 设备联调、自动化稳定性、跨部门协作追问" : "Extra requirements, e.g. IoT device integration, automation stability, or cross-team collaboration follow-ups",
        actualSkills: (skillsText: string) => (isZh ? `当前实际评估方案：${skillsText}` : `Actual assessment plans: ${skillsText}`),
        restoreDefaultSkills: isZh ? "恢复默认评估方案" : "Restore Default Assessment Plans",
        interviewSkillHintDefault: isZh ? "未手动选择时，生成面试题会按“岗位绑定评估方案 > 面试题工作记忆”执行；若均未配置，则本次不会传评估方案。" : "Without manual selection, interview generation uses \"position-bound assessment plans > interview memory\". If neither exists, no assessment plans are passed.",
        interviewSkillHintManual: isZh ? "当前已手动选择评估方案，本次会以手动选择为准。" : "Manual assessment plan selection is active and will be used for this run.",
        noInterviewQuestions: isZh ? "暂无面试题" : "No Interview Questions",
        noInterviewQuestionsDesc: isZh ? "点击上方按钮后，系统会结合岗位 JD、候选人简历和评估方案生成定制化题目。" : "After you click the button above, the system will generate tailored questions from the JD, resume, and assessment plans.",
        candidateWorkspace: isZh ? "候选人工作区" : "Candidate Workspace",
        candidateWorkspaceDesc: isZh ? "未选中候选人时，先在这里查看当前筛选结果的概览、最近更新对象和推荐入口。" : "When no candidate is selected, use this area to review the current result set, recent updates, and recommended next actions.",
        recentCandidates: isZh ? "最近更新候选人" : "Recently Updated Candidates",
        noCandidates: isZh ? "暂无候选人" : "No Candidates",
        noCandidatesDesc: isZh ? "当前筛选结果为空，调整筛选条件或先上传简历后再继续处理。" : "The current result set is empty. Adjust filters or upload resumes first.",
        loadingMoreCandidates: isZh ? "加载中…" : "Loading more…",
        allCandidatesLoaded: isZh ? "已加载全部候选人" : "All candidates loaded",
        recommendedActions: isZh ? "推荐操作" : "Recommended Actions",
        continueFiltering: isZh ? "继续筛选列表" : "Continue Filtering",
        continueFilteringDesc: isZh ? "保持当前筛选条件，在左侧列表中选择一位候选人后，右侧会切换到完整档案工作区。" : "Keep the current filters, choose a candidate on the left, and the full workspace will open on the right.",
        batchHandleResults: isZh ? "批量处理当前结果" : "Batch Handle Results",
        batchHandleResultsDesc: isZh ? "可以先在左侧勾选需要处理的候选人，再执行批量初筛或批量发送简历。" : "Select candidates on the left first, then run batch screening or send resumes in batch.",
        zoomHintExpand: isZh ? "双击放大" : "Double-click to expand",
        zoomHintCollapse: isZh ? "双击缩小" : "Double-click to collapse",
        unrecorded: isZh ? "未记录" : "Unrecorded",
        interviewSchedules: isZh ? "面试安排" : "Interview Schedules",
        addSchedule: isZh ? "添加面试安排" : "Add Interview Schedule",
        scheduleRound: isZh ? "面试轮次" : "Round",
        roundNameDefault: isZh ? "初试" : "Round 1",
        scheduleInterviewer: isZh ? "面试官" : "Interviewer",
        scheduleTime: isZh ? "面试时间" : "Scheduled Time",
        scheduleDuration: isZh ? "时长（分钟）" : "Duration (min)",
        scheduleLocation: isZh ? "地点" : "Location",
        scheduleMeetingLink: isZh ? "会议链接" : "Meeting Link",
        scheduleNotes: isZh ? "备注" : "Notes",
        scheduleStatus: isZh ? "状态" : "Status",
        noSchedules: isZh ? "暂无面试安排" : "No interview schedules",
        noSchedulesDesc: isZh ? "点击上方按钮添加面试安排。" : "Click the button above to add an interview schedule.",
        deleteSchedule: isZh ? "删除" : "Delete",
        confirmDeleteSchedule: isZh ? "确认删除此面试安排？" : "Delete this interview schedule?",
        offers: isZh ? "Offer 管理" : "Offer Management",
        addOffer: isZh ? "创建 Offer" : "Create Offer",
        offerTitle: isZh ? "Offer 标题" : "Offer Title",
        offerSalary: isZh ? "薪资" : "Salary",
        offerDepartment: isZh ? "部门" : "Department",
        offerEntryDate: isZh ? "入职日期" : "Entry Date",
        offerContent: isZh ? "Offer 内容" : "Offer Content",
        offerNotes: isZh ? "备注" : "Notes",
        offerStatus: isZh ? "状态" : "Status",
        noOffers: isZh ? "暂无 Offer" : "No offers",
        noOffersDesc: isZh ? "点击上方按钮创建 Offer。" : "Click the button above to create an offer.",
        confirmDeleteOffer: isZh ? "确认删除此 Offer？" : "Delete this offer?",
        offerStatusDraft: isZh ? "草稿" : "Draft",
        offerStatusSent: isZh ? "已发送" : "Sent",
        offerStatusAccepted: isZh ? "已接受" : "Accepted",
        offerStatusRejected: isZh ? "已拒绝" : "Rejected",
        offerStatusCancelled: isZh ? "已撤回" : "Cancelled",
        followUps: isZh ? "跟进记录" : "Follow-ups",
        addFollowUp: isZh ? "添加跟进" : "Add Follow-up",
        followUpContent: isZh ? "跟进内容" : "Content",
        followUpContentPlaceholder: isZh ? "记录跟进内容..." : "Enter follow-up content...",
        followUpType: isZh ? "类型" : "Type",
        followUpTypeNote: isZh ? "备注" : "Note",
        followUpTypeCall: isZh ? "电话" : "Call",
        followUpTypeEmail: isZh ? "邮件" : "Email",
        followUpTypeInterview: isZh ? "面试" : "Interview",
        followUpTypeOther: isZh ? "其他" : "Other",
        noFollowUps: isZh ? "暂无跟进记录" : "No follow-up records",
        noFollowUpsDesc: isZh ? "添加跟进记录，记录与候选人的沟通和进展。" : "Add follow-up records to track communication and progress.",
        confirmDeleteFollowUp: isZh ? "确认删除此跟进记录？" : "Delete this follow-up record?",
        owner: isZh ? "负责人" : "Owner",
        ownerPlaceholder: isZh ? "负责人 ID 或姓名" : "Owner ID or name",
    };
}

function OutputSnippet({content}: { content: string }) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const [expanded, setExpanded] = React.useState(false);
    const lines = React.useMemo(() => content.split("\n"), [content]);
    const preview = React.useMemo(() => lines.slice(0, 3).join("\n"), [lines]);
    const hasMore = lines.length > 3;

    return (
        <div className="mt-3 min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
            <pre className="min-w-0 whitespace-pre-wrap break-all text-sm leading-6 text-slate-600 dark:text-slate-300">
                {expanded ? content : preview}
            </pre>
            {hasMore ? (
                <button
                    type="button"
                    className="mt-2 text-sm text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                    onClick={() => setExpanded((current) => !current)}
                >
                    {expanded ? tr.collapse : tr.expandAll(lines.length)}
                </button>
            ) : null}
        </div>
    );
}

function parseInterviewQuestionMetrics(htmlContent: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const questionCards = Array.from(doc.querySelectorAll(".qcard"));
    const moduleTitles = questionCards
        .map((card) => (
            card.querySelector(".qcard-heading h2")?.textContent?.trim()
            || card.querySelector("h2")?.textContent?.trim()
            || ""
        ))
        .filter(Boolean);
    const fallbackTitles = moduleTitles.length
        ? moduleTitles
        : Array.from(doc.querySelectorAll("section h2"))
            .map((heading) => heading.textContent?.trim() || "")
            .filter(Boolean);

    return {
        modules: fallbackTitles,
        questionCount: questionCards.length || fallbackTitles.length || null,
    };
}

function InterviewQuestionCard({
    question,
    onDownload,
    onPreview,
}: {
    question: CandidateInterviewQuestion;
    onDownload: () => void;
    onPreview: () => void;
}) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const {modules, questionCount} = React.useMemo(
        () => question.html_content
            ? parseInterviewQuestionMetrics(question.html_content)
            : {modules: [], questionCount: null as number | null},
        [question.html_content],
    );

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/85 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 dark:border-slate-800">
                <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{question.round_name}</p>
                    {question.created_at ? (
                        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                            {tr.generatedAt(question.created_at)}
                        </p>
                    ) : null}
                </div>
                <Badge className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                    {tr.generated}
                </Badge>
            </div>

            <div className="grid grid-cols-2 gap-px border-b border-slate-200/80 bg-slate-200/80 dark:border-slate-800 dark:bg-slate-800">
                <div className="bg-white px-4 py-2.5 dark:bg-slate-950">
                    <p className="text-sm text-slate-500 dark:text-slate-400">{tr.moduleCount}</p>
                    <p className="mt-0.5 text-base font-medium text-slate-900 dark:text-slate-100">
                        {modules.length > 0 ? `${modules.length}${tr.modulesSuffix}` : tr.parsing}
                    </p>
                </div>
                <div className="bg-white px-4 py-2.5 dark:bg-slate-950">
                    <p className="text-sm text-slate-500 dark:text-slate-400">{tr.estimatedQuestions}</p>
                    <p className="mt-0.5 text-base font-medium text-slate-900 dark:text-slate-100">
                        {questionCount != null ? `${questionCount}${tr.questionSuffix}` : "-"}
                    </p>
                </div>
            </div>

            {modules.length > 0 ? (
                <div className="space-y-1.5 border-b border-slate-200/80 px-4 py-3 dark:border-slate-800">
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{tr.moduleOutline}</p>
                    {modules.slice(0, 5).map((moduleName, index) => (
                        <div key={`${moduleName}-${index}`} className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-300">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[14px] text-slate-500 dark:bg-slate-800">
                                {index + 1}
                            </span>
                            <span className="truncate">{moduleName}</span>
                        </div>
                    ))}
                    {modules.length > 5 ? (
                        <p className="text-sm text-slate-400 dark:text-slate-500">{tr.extraModules(modules.length - 5)}</p>
                    ) : null}
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Button size="sm" onClick={onDownload}>
                    <Download className="h-4 w-4"/>
                    {tr.downloadHtml}
                </Button>
                <Button size="sm" variant="outline" onClick={onPreview}>
                    <ExternalLink className="h-4 w-4"/>
                    {tr.standalonePreview}
                </Button>
            </div>
        </div>
    );
}

function buildCandidateScoreFallbackMarkdown(score?: CandidateDetail["score"] | null, tr?: ReturnType<typeof getCandidatesLocale>) {
    const localTr = tr ?? getCandidatesLocale();
    if (!score) {
        return localTr.noAiScoreOutput;
    }
    const displayValues = resolveScoreDisplayValues(score as Record<string, unknown>);
    const recommendation = readScoreText(score.recommendation) || "-";
    const suggestedStatus = readSuggestedStatus(score.suggested_status);
    const advantages = readScoreTextArray(score.advantages);
    const concerns = readScoreTextArray(score.concerns);
    const dimensionLines = readScoreDimensions((score as Record<string, unknown>).dimensions)
        .map((d) => buildDimensionMarkdownLine(d, localTr))
        .filter(Boolean);
    const sections = [
        localTr.aiScreeningResultHeading,
        localTr.totalScoreLine(displayValues.totalScore !== null ? formatScoreValue(displayValues.totalScore, displayValues.totalScoreScale) : "-"),
        localTr.matchLine(displayValues.matchPercent !== null ? formatPercent(displayValues.matchPercent) : "-"),
        localTr.suggestedStatusLine(labelForCandidateStatus(suggestedStatus) || "-"),
        "",
        localTr.aiRecommendationHeading,
        recommendation,
        "",
        ...(dimensionLines.length > 0
            ? [
                localTr.dimensionScoresHeading,
                ...dimensionLines,
                "",
            ]
            : []),
        localTr.advantagesHeading,
        ...(advantages.length > 0 ? advantages.map((item, index) => `${index + 1}. ${item}`) : ["-"]),
        "",
        localTr.concernsHeading,
        ...(concerns.length > 0 ? concerns.map((item, index) => `${index + 1}. ${item}`) : ["-"]),
    ];
    return sections.join("\n");
}

function toScoreRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function toScoreNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        const numeric = Number(trimmed.replace(/%$/, ""));
        return Number.isFinite(numeric) ? numeric : null;
    }
    return null;
}

function readScoreNumberStrict(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return value;
}

function readScoreText(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
}

function readScoreTextArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
}

function readSuggestedStatus(value: unknown): string {
    const normalized = readScoreText(value);
    if (!normalized || !SCORE_SUGGESTED_STATUS_VALUES.has(normalized)) {
        return "";
    }
    return normalized;
}

function readScoreDimensions(value: unknown): CandidateScoreDimension[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as CandidateScoreDimension[];
}

function readDimensionEvidenceList(value: unknown): string[] {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
}

function readDimensionEvidence(value: unknown): string | null {
    const items = readDimensionEvidenceList(value);
    return items.length ? items.join(" / ") : null;
}

function extractScreeningTaskStage(log?: AITaskLog | null): string {
    const parsed = parseStructuredLogOutput(log?.output_snapshot);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const payload = parsed as Record<string, unknown>;
        const directStage = typeof payload.stage === "string" ? payload.stage.trim() : "";
        if (directStage) {
            return directStage;
        }
        const meta = payload.meta;
        if (meta && typeof meta === "object" && !Array.isArray(meta)) {
            const metaStage = typeof (meta as Record<string, unknown>).stage === "string"
                ? String((meta as Record<string, unknown>).stage).trim()
                : "";
            if (metaStage) {
                return metaStage;
            }
        }
    }
    switch (log?.status) {
        case "queued":
        case "pending":
            return "queued";
        case "running":
            return "scoring";
        case "success":
        case "fallback":
            return "completed";
        case "cancelled":
            return "cancelled";
        default:
            return log?.status ? "failed" : "";
    }
}

function buildDimensionMarkdownLine(item: CandidateScoreDimension, tr?: ReturnType<typeof getCandidatesLocale>) {
    const localTr = tr ?? getCandidatesLocale();
    const label = readScoreText(item.label) || readScoreText(item.key) || "";
    if (!label) {
        return "";
    }
    const reason = readScoreText(item.reason) || "";
    const evidence = readDimensionEvidence(item.evidence);
    const extra = [reason, evidence ? `${localTr.evidenceLabel}: ${evidence}` : ""].filter(Boolean).join(localTr.delimiter);
    const scoreValue = readScoreNumberStrict(item.score);
    const maxScore = readScoreNumberStrict(item.max_score);
    return `- ${label}：${scoreValue !== null ? scoreValue : "-"} / ${maxScore !== null ? maxScore : "-"}${extra ? ` — ${extra}` : ""}`;
}

function resolveScoreDisplayValues(scoreLike?: Record<string, unknown> | null) {
    return {
        totalScore: readScoreNumberStrict(scoreLike?.total_score),
        matchPercent: readScoreNumberStrict(scoreLike?.match_percent),
        totalScoreScale: typeof scoreLike?.total_score_scale === "number" ? scoreLike.total_score_scale : null,
    };
}

function deriveScoreDecisionValues(scoreLike?: Record<string, unknown> | null) {
    return {
        recommendation: readScoreText(scoreLike?.recommendation) || "",
        suggestedStatus: readSuggestedStatus(scoreLike?.suggested_status),
    };
}

function resolveCandidateSummaryMatchPercent(candidate?: CandidateSummary | null) {
    if (!candidate) {
        return null;
    }
    return toScoreNumber(candidate.match_percent);
}

function buildStructuredAiOutputMarkdown(payload: Record<string, unknown>, tr?: ReturnType<typeof getCandidatesLocale>) {
    const localTr = tr ?? getCandidatesLocale();
    const displayValues = resolveScoreDisplayValues(payload);
    const decisionValues = deriveScoreDecisionValues(payload);
    const recommendation = decisionValues.recommendation;
    const suggestedStatus = decisionValues.suggestedStatus;
    const advantages = readScoreTextArray(payload.advantages);
    const concerns = readScoreTextArray(payload.concerns);
    const dimensionLines = readScoreDimensions(payload.dimensions)
        .map((d) => buildDimensionMarkdownLine(d, localTr))
        .filter(Boolean);

    return [
        localTr.aiScreeningResultHeading,
        localTr.totalScoreLine(displayValues.totalScore !== null ? formatScoreValue(displayValues.totalScore, displayValues.totalScoreScale) : "-"),
        localTr.matchLine(displayValues.matchPercent !== null ? `${displayValues.matchPercent}%` : "-"),
        localTr.suggestedStatusLine(labelForCandidateStatus(suggestedStatus) || "-"),
        "",
        localTr.aiRecommendationHeading,
        recommendation || "-",
        "",
        ...(dimensionLines.length > 0 ? [localTr.dimensionScoresHeading, ...dimensionLines, ""] : []),
        localTr.advantagesHeading,
        ...(advantages.length > 0 ? advantages.map((item, index) => `${index + 1}. ${item}`) : ["-"]),
        "",
        localTr.concernsHeading,
        ...(concerns.length > 0 ? concerns.map((item, index) => `${index + 1}. ${item}`) : ["-"]),
    ].join("\n");
}

function resolveCandidateAiOutputPayload(
    log?: AITaskLog | null,
    score?: CandidateDetail["score"] | null,
    tr?: ReturnType<typeof getCandidatesLocale>,
) {
    const parsed = parseStructuredLogOutput(log?.output_snapshot);
    let markdown = "";
    let raw = "";
    const scoreRecord = score && typeof score === "object" ? score as Record<string, unknown> : null;

    if (score) {
        markdown = buildCandidateScoreFallbackMarkdown(score, tr);
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const payload = parsed as Record<string, unknown>;
        const scorePayload = toScoreRecord(payload.score)
            || (
                "total_score" in payload
                || "match_percent" in payload
                || "advantages" in payload
                || "concerns" in payload
                || "dimensions" in payload
                    ? payload
                    : null
            );
        if (!markdown && scorePayload) {
            markdown = buildStructuredAiOutputMarkdown(scorePayload, tr);
        }
        raw = formatStructuredValue(parsed, log?.output_summary || "");
    } else if (typeof parsed === "string" && parsed.trim()) {
        if (!markdown) {
            markdown = parsed.trim();
        }
        raw = parsed.trim();
    }

    if (!markdown) {
        markdown = buildCandidateScoreFallbackMarkdown(score, tr);
    }
    if (!raw) {
        raw = formatStructuredValue(parsed ?? scoreRecord ?? log?.output_snapshot, log?.output_summary || markdown);
    }

    return {markdown, raw};
}

function CandidateAiOutputDialog({
    open,
    onOpenChange,
    markdown,
    raw,
    modelLabel,
    generatedAt,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    markdown: string;
    raw?: string | null;
    modelLabel?: string | null;
    generatedAt?: string | null;
}) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        if (!open) {
            setCopied(false);
        }
    }, [open]);

    const copyContent = React.useCallback(async () => {
        const content = (markdown || raw || "").trim();
        if (!content) {
            return;
        }
        try {
            // 优先使用 Clipboard API（需要HTTPS或localhost）
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(content);
            } else {
                // Fallback：使用临时 textarea（兼容HTTP环境）
                const textarea = document.createElement("textarea");
                textarea.value = content;
                textarea.style.position = "fixed";
                textarea.style.left = "-9999px";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch (err) {
            console.error("[CandidatesPage] copyContent failed:", err);
            setCopied(false);
        }
    }, [markdown, raw]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(88vh,900px)] max-h-[88vh] flex-col overflow-hidden sm:max-w-5xl">
                <DialogHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <DialogTitle>{tr.fullAiOutput}</DialogTitle>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                                {modelLabel ? <span>{tr.modelLabel}: {modelLabel}</span> : null}
                                {generatedAt ? <span>{tr.timeLabel}: {formatLongDateTime(generatedAt)}</span> : null}
                            </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => void copyContent()} disabled={!(markdown || raw)?.trim()}>
                            {copied ? <Check className="h-4 w-4"/> : <Copy className="h-4 w-4"/>}
                            {copied ? tr.copied : tr.copyAll}
                        </Button>
                    </div>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                    <div className="space-y-4 px-1 pb-2">
                        <div className="rounded-[22px] border border-slate-200/80 bg-white/90 px-5 py-5 dark:border-slate-800 dark:bg-slate-950/70">
                            <div className="prose prose-slate max-w-none text-base leading-7 dark:prose-invert prose-headings:mb-3 prose-headings:mt-5 prose-headings:font-semibold prose-p:my-3 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-pre:rounded-2xl prose-pre:border prose-pre:border-slate-200/80 prose-pre:bg-slate-950 prose-pre:p-4 dark:prose-pre:border-slate-800">
                                <ReactMarkdown>{markdown}</ReactMarkdown>
                            </div>
                        </div>
                        {raw && raw.trim() && raw.trim() !== markdown.trim() ? (
                            <details className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <summary className="cursor-pointer text-base font-medium text-slate-900 dark:text-slate-100">
                                    {tr.viewStructuredRaw}
                                </summary>
                                <pre className="mt-4 whitespace-pre-wrap break-all rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4 text-sm leading-6 text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                                    {raw}
                                </pre>
                            </details>
                        ) : null}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

type MultiSelectProps = {
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    selectedLabel?: (count: number) => string;
};

function MultiSelect({ options, selected, onChange, placeholder, selectedLabel }: MultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const openRef = useRef(open);
    openRef.current = open;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!openRef.current) return;
            const target = e.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (menuRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleOpen = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setMenuStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
                zIndex: 99999,
            });
        }
        setOpen(true);
    };

    const toggleValue = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter((v) => v !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const displayText = selected.length === 0
        ? (placeholder || "")
        : selected.length === 1
            ? options.find((o) => o.value === selected[0])?.label || selected[0]
            : (selectedLabel ? selectedLabel(selected.length) : `${selected.length} selected`);

    const menuContent = open && (
        <div
            ref={menuRef}
            style={menuStyle}
            onMouseDown={(e) => e.stopPropagation()}
            className="max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-950"
        >
            {options.map((option) => (
                <div
                    key={option.value}
                    onClick={() => toggleValue(option.value)}
                    className={cn(
                        "flex cursor-pointer items-center gap-2 overflow-hidden px-3 py-1.5",
                        selected.includes(option.value) ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                >
                    <div className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        selected.includes(option.value) ? "border-slate-500 bg-slate-500" : "border-slate-300"
                    )}>
                        {selected.includes(option.value) && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        )}
                    </div>
                    <span className="truncate block min-w-0 flex-1 text-base text-slate-700 dark:text-slate-300" title={option.label}>
                        {option.label}
                    </span>
                </div>
            ))}
        </div>
    );

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={handleOpen}
                title={displayText}
                className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-base dark:border-slate-800 dark:bg-slate-950"
            >
                <span className={cn(
                    "block w-full truncate",
                    selected.length === 0 ? "text-slate-400" : "text-slate-900 dark:text-slate-100"
                )}>
                    {displayText}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-slate-400 shrink-0", open && "rotate-180")} />
            </button>
            {open && ReactDOM.createPortal(menuContent, document.body)}
        </>
    );
}

function CandidateFilterBar({
    candidateFilterSummary,
    candidateViewMode,
    setCandidateViewMode,
    candidateQuery,
    setCandidateQuery,
    candidatePositionFilter,
    setCandidatePositionFilter,
    candidateStatusFilter,
    setCandidateStatusFilter,
    candidateMatchFilter,
    setCandidateMatchFilter,
    candidateSourceFilter,
    setCandidateSourceFilter,
    candidateTimeFilter,
    setCandidateTimeFilter,
    positions,
    sourceOptions,
    visibleCandidateCount,
    onCollapse,
}: {
    candidateFilterSummary: string;
    candidateViewMode: CandidateViewMode;
    setCandidateViewMode: React.Dispatch<React.SetStateAction<CandidateViewMode>>;
    candidateQuery: string;
    setCandidateQuery: (value: string) => void;
    candidatePositionFilter: string[];
    setCandidatePositionFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateStatusFilter: string[];
    setCandidateStatusFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateMatchFilter: string;
    setCandidateMatchFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateSourceFilter: string[];
    setCandidateSourceFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateTimeFilter: string;
    setCandidateTimeFilter: React.Dispatch<React.SetStateAction<string>>;
    positions: PositionSummary[];
    sourceOptions: string[];
    visibleCandidateCount: number;
    onCollapse: () => void;
}) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const isZh = language !== "en-US";
    const summaryChips = React.useMemo(() => (
        candidateFilterSummary
            .split("·")
            .map((item) => item.trim())
            .filter(Boolean)
    ), [candidateFilterSummary]);

    const hasActiveFilters = React.useMemo(() => (
        candidateQuery.trim().length > 0
        || candidatePositionFilter.length > 0
        || candidateStatusFilter.length > 0
        || candidateMatchFilter !== "all"
        || candidateSourceFilter.length > 0
        || candidateTimeFilter !== "all"
    ), [
        candidateMatchFilter,
        candidatePositionFilter,
        candidateQuery,
        candidateSourceFilter,
        candidateStatusFilter,
        candidateTimeFilter,
    ]);

    const resetFilters = React.useCallback(() => {
        setCandidateQuery("");
        setCandidatePositionFilter([]);
        setCandidateStatusFilter([]);
        setCandidateMatchFilter("all");
        setCandidateSourceFilter([]);
        setCandidateTimeFilter("all");
    }, [
        setCandidateMatchFilter,
        setCandidatePositionFilter,
        setCandidateQuery,
        setCandidateSourceFilter,
        setCandidateStatusFilter,
        setCandidateTimeFilter,
    ]);

    const isChipActive = React.useCallback((chip: string) => (
        chip.startsWith(tr.keywordChipPrefix)
        || (!chip.startsWith(tr.allPrefix) && chip !== tr.noKeyword)
    ), [tr]);

    const fieldLabelClassName = "mb-1 block text-[14px] font-medium tracking-wide text-slate-500 dark:text-slate-400";

    return (
        <Card className={cn(defaultPanelClass, "gap-0 py-0")}>
            <CardContent className="px-4 py-2.5 sm:px-5">
                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            <SlidersHorizontal className="h-3.5 w-3.5"/>
                        </div>
                        <span className="shrink-0 text-base font-medium text-slate-900 dark:text-slate-100">{tr.filters}</span>
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                            {summaryChips.map((chip) => (
                                <span
                                    key={chip}
                                    className={cn(
                                        "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[15px] transition",
                                        isChipActive(chip)
                                            ? "border-slate-400 bg-slate-100/95 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                                            : "border-slate-200/80 bg-white/80 text-slate-500 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-400",
                                    )}
                                >
                                    <span className="truncate">{chip}</span>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                        {/* 快捷筛选按钮 */}
                        <div className="flex items-center gap-1">
                            <Button
                                size="sm"
                                variant={candidateStatusFilter.includes("talent_pool") ? "default" : "outline"}
                                className="rounded-full text-sm"
                                onClick={() => {
                                    if (candidateStatusFilter.includes("talent_pool")) {
                                        setCandidateStatusFilter(candidateStatusFilter.filter(s => s !== "talent_pool"));
                                    } else {
                                        setCandidateStatusFilter(["talent_pool"]);
                                    }
                                }}
                            >
                                <Users className="mr-1 h-3.5 w-3.5"/>
                                {isZh ? "人才库" : "Talent Pool"}
                            </Button>
                        </div>
                        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                            <Button size="sm" variant={candidateViewMode === "list" ? "default" : "ghost"} onClick={() => setCandidateViewMode("list")}>
                                <List className="h-4 w-4"/>
                                {tr.listView}
                            </Button>
                            <Button size="sm" variant={candidateViewMode === "board" ? "default" : "ghost"} onClick={() => setCandidateViewMode("board")}>
                                <LayoutGrid className="h-4 w-4"/>
                                {tr.boardView}
                            </Button>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onCollapse}
                            className="h-8 rounded-full border-slate-200/80 bg-white/90 px-3 dark:border-slate-800 dark:bg-slate-950/90"
                            title={tr.collapseFilters}
                        >
                            <ChevronUp className="h-4 w-4"/>
                            {tr.collapseFilters}
                        </Button>
                    </div>
                </div>

                <div className="mt-2 border-t border-slate-200/80 pt-2 dark:border-slate-800">
                    <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.45fr)_repeat(3,minmax(0,0.9fr))]">
                        <div className="space-y-1">
                            <label className={fieldLabelClassName}>{tr.search}</label>
                            <SearchField value={candidateQuery} onChange={setCandidateQuery} placeholder={tr.searchPlaceholder}/>
                        </div>
                        <div className="space-y-1">
                            <label className={fieldLabelClassName}>{tr.matchPercent}</label>
                            <NativeSelect value={candidateMatchFilter} onChange={(event) => setCandidateMatchFilter(event.target.value)}>
                                <option value="all">{tr.allMatchPercent}</option>
                                <option value="80+">{tr.above80}</option>
                                <option value="60+">{tr.above60}</option>
                                <option value="40+">{tr.above40}</option>
                            </NativeSelect>
                        </div>
                        <div className="space-y-1">
                            <label className={fieldLabelClassName}>{tr.source}</label>
                            <MultiSelect
                                options={sourceOptions.map((s) => ({ value: s, label: s }))}
                                selected={candidateSourceFilter}
                                onChange={setCandidateSourceFilter}
                                placeholder={tr.allSources}
                                selectedLabel={tr.selectedLabel}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className={fieldLabelClassName}>{tr.timeFilter}</label>
                            <NativeSelect value={candidateTimeFilter} onChange={(event) => setCandidateTimeFilter(event.target.value)}>
                                <option value="all">{tr.allTime}</option>
                                <option value="today">{tr.today}</option>
                                <option value="7d">{tr.last7Days}</option>
                                <option value="30d">{tr.last30Days}</option>
                            </NativeSelect>
                        </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-2 dark:border-slate-800">
                        <div className="flex items-center gap-2.5 text-sm text-slate-500 dark:text-slate-400">
                            <span>{tr.matchedCandidates(visibleCandidateCount)}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto px-0 py-0 text-sm text-slate-500 hover:bg-transparent hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                onClick={resetFilters}
                                disabled={!hasActiveFilters}
                            >
                                <RotateCcw className="h-3.5 w-3.5"/>
                                {tr.reset}
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

type CandidatesPageProps = {
    panelClass?: string;
    candidateFilterSummary: string;
    candidateViewMode: CandidateViewMode;
    setCandidateViewMode: React.Dispatch<React.SetStateAction<CandidateViewMode>>;
    candidateQuery: string;
    setCandidateQuery: (value: string) => void;
    candidatePositionFilter: string[];
    setCandidatePositionFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateStatusFilter: string[];
    setCandidateStatusFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateMatchFilter: string;
    setCandidateMatchFilter: React.Dispatch<React.SetStateAction<string>>;
    candidateSourceFilter: string[];
    setCandidateSourceFilter: React.Dispatch<React.SetStateAction<string[]>>;
    candidateTimeFilter: string;
    setCandidateTimeFilter: React.Dispatch<React.SetStateAction<string>>;
    positions: PositionSummary[];
    sourceOptions: string[];
    visibleCandidates: CandidateSummary[];
    selectedCandidateIds: number[];
    setSelectedCandidateIds: React.Dispatch<React.SetStateAction<number[]>>;
    triggerScreening: (candidateIds?: number[]) => Promise<void>;
    triggerFreshScreening: (candidateIds?: number[]) => Promise<void>;
    isBatchScreeningCancelling: boolean;
    screeningSubmitting: boolean;
    isBatchScreeningRunning: boolean;
    openResumeMailDialog: (candidateIds?: number[]) => void;
    candidatesLoading: boolean;
    candidatesInitialLoaded: boolean;
    isLoadingMoreCandidates: boolean;
    candidateMatchSortLoading: boolean;
    allCandidatesCount: number;
    candidateTotal: number;
    candidateListScrollRef: (node: HTMLDivElement | null) => void;
    candidateListHorizontalRailRef: (node: HTMLDivElement | null) => void;
    renderCandidateListHeaderCell: (key: CandidateListColumnKey, label: string) => React.ReactNode;
    selectedCandidateId: number | null;
    setSelectedCandidateId: React.Dispatch<React.SetStateAction<number | null>>;
    toggleCandidateSelection: (candidateId: number, nextChecked?: boolean) => void;
    candidateListDisplayColumnWidths: CandidateListDisplayColumnWidths;
    showOrganizationColumn: boolean;
    getOrganizationLabel: (orgCode?: string | null) => string;
    getCandidateResumeMailSummary: (candidateId: number) => string | null;
    groupedCandidates: CandidateBoardGroup[];
    candidateDetailLoading: boolean;
    candidateDetail: CandidateDetail | null;
    isSelectedCandidateScreeningCancelling: boolean;
    selectedCandidateScreeningTaskId: number | null;
    openResumeFile: (file: ResumeFile, download?: boolean) => Promise<void>;
    previewResumeFile: (file: { id: number; original_name?: string }, candidateName?: string) => void;
    requestDeleteResumeFile: (file: ResumeFile) => void;
    requestDeleteCandidate: (candidate: CandidateSummary) => void;
    generateInterviewQuestions: () => Promise<void>;
    isCurrentInterviewTaskCancelling: boolean;
    currentCandidateInterviewTaskId: number | null;
    candidateEditor: CandidateEditorState;
    setCandidateEditor: React.Dispatch<React.SetStateAction<CandidateEditorState>>;
    saveCandidate: () => Promise<void>;
    candidateSaving: boolean;
    exporting: boolean;
    effectiveScreeningSkillSourceLabel: string;
    effectiveScreeningSkillIds: number[];
    skillMap: Map<number, RecruitmentSkill>;
    pendingStatus: string | null;
    setPendingStatus: React.Dispatch<React.SetStateAction<string | null>>;
    updateCandidateStatus: (nextStatus: string) => Promise<void>;
    statusUpdateReason: string;
    setStatusUpdateReason: React.Dispatch<React.SetStateAction<string>>;
    candidateAssistantActivity: AITaskLog[];
    preferredInterviewSkillSourceLabel: string;
    effectiveInterviewSkillSourceLabel: string;
    openAssistantMode: (mode: AssistantDisplayMode) => void;
    candidateProcessActivity: AITaskLog[];
    candidateProcessLogsExpanded: boolean;
    setCandidateProcessLogsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    openTaskLogDetail: (logId?: number | null) => void;
    interviewRoundName: string;
    setInterviewRoundName: React.Dispatch<React.SetStateAction<string>>;
    effectiveInterviewSkillIds: number[];
    interviewCustomRequirements: string;
    setInterviewCustomRequirements: React.Dispatch<React.SetStateAction<string>>;
    interviewSkillSelectionDirty: boolean;
    setSelectedInterviewSkillIds: React.Dispatch<React.SetStateAction<number[]>>;
    setInterviewSkillSelectionDirty: React.Dispatch<React.SetStateAction<boolean>>;
    skills: RecruitmentSkill[];
    toggleInterviewSkillSelection: (skillId: number) => void;
    downloadInterviewQuestion: (questionId: number) => Promise<void>;
    exportCandidates: (candidateIds: number[], options?: { includeResumes?: boolean; fields?: string[] }) => Promise<void>;
    requestBatchDelete: (candidateIds: number[]) => void;
    batchBindPosition: (candidateIds: number[], positionId: number | null) => Promise<void>;
    onMoveToTalentPool?: (candidateIds: number[]) => Promise<void>;
    onRefresh?: () => Promise<void>;
    batchUpdateStatus: (candidateIds: number[], status: string, reason: string) => Promise<void>;
    duplicateCandidates: Array<{id: number; candidate_code: string; name: string; phone: string | null; email: string | null; status: string}>;
    interviewSchedules: Array<{id: number; candidate_id: number; round_name: string; interviewer_name?: string | null; scheduled_at?: string | null; duration_minutes?: number | null; location?: string | null; meeting_link?: string | null; notes?: string | null; status: string; created_at?: string | null}>;
    createInterviewSchedule: (payload: {candidate_id: number; round_name?: string; interviewer_name?: string; scheduled_at?: string; duration_minutes?: number; location?: string; meeting_link?: string; notes?: string}) => Promise<unknown>;
    deleteInterviewSchedule: (scheduleId: number) => Promise<void>;
    offers: Array<{id: number; candidate_id: number; offer_title?: string | null; salary?: string | null; department?: string | null; entry_date?: string | null; offer_content?: string | null; notes?: string | null; status: string; created_at?: string | null}>;
    createOffer: (payload: {candidate_id: number; offer_title?: string; salary?: string; department?: string; entry_date?: string; offer_content?: string; notes?: string}) => Promise<unknown>;
    updateOffer: (offerId: number, payload: Record<string, unknown>) => Promise<unknown>;
    deleteOffer: (offerId: number) => Promise<void>;
    followUps: Array<{id: number; candidate_id: number; content: string; follow_up_type: string; created_by?: string | null; created_at?: string | null}>;
    createFollowUp: (candidateId: number, content: string, followUpType?: string) => Promise<unknown>;
    deleteFollowUp: (followUpId: number) => Promise<void>;
};

export function CandidatesPage({
    panelClass = defaultPanelClass,
    candidateFilterSummary,
    candidateViewMode,
    setCandidateViewMode,
    candidateQuery,
    setCandidateQuery,
    candidatePositionFilter,
    setCandidatePositionFilter,
    candidateStatusFilter,
    setCandidateStatusFilter,
    candidateMatchFilter,
    setCandidateMatchFilter,
    candidateSourceFilter,
    setCandidateSourceFilter,
    candidateTimeFilter,
    setCandidateTimeFilter,
    positions,
    sourceOptions,
    visibleCandidates,
    selectedCandidateIds,
    setSelectedCandidateIds,
    triggerScreening,
    triggerFreshScreening,
    isBatchScreeningCancelling,
    screeningSubmitting,
    isBatchScreeningRunning,
    openResumeMailDialog,
    candidatesLoading,
    candidatesInitialLoaded,
    isLoadingMoreCandidates,
    candidateMatchSortLoading,
    allCandidatesCount,
    candidateTotal,
    candidateListScrollRef,
    candidateListHorizontalRailRef,
    renderCandidateListHeaderCell,
    selectedCandidateId,
    setSelectedCandidateId,
    toggleCandidateSelection,
    candidateListDisplayColumnWidths,
    showOrganizationColumn,
    getOrganizationLabel,
    getCandidateResumeMailSummary,
    groupedCandidates,
    candidateDetailLoading,
    candidateDetail,
    isSelectedCandidateScreeningCancelling,
    selectedCandidateScreeningTaskId,
    openResumeFile,
    previewResumeFile,
    requestDeleteResumeFile,
    requestDeleteCandidate,
    generateInterviewQuestions,
    isCurrentInterviewTaskCancelling,
    currentCandidateInterviewTaskId,
    candidateEditor,
    setCandidateEditor,
    saveCandidate,
    candidateSaving,
    exporting,
    effectiveScreeningSkillSourceLabel,
    effectiveScreeningSkillIds,
    skillMap,
    pendingStatus,
    setPendingStatus,
    updateCandidateStatus,
    statusUpdateReason,
    setStatusUpdateReason,
    candidateAssistantActivity,
    preferredInterviewSkillSourceLabel,
    effectiveInterviewSkillSourceLabel,
    openAssistantMode,
    candidateProcessActivity,
    candidateProcessLogsExpanded,
    setCandidateProcessLogsExpanded,
    openTaskLogDetail,
    interviewRoundName,
    setInterviewRoundName,
    effectiveInterviewSkillIds,
    interviewCustomRequirements,
    setInterviewCustomRequirements,
    interviewSkillSelectionDirty,
    setSelectedInterviewSkillIds,
    setInterviewSkillSelectionDirty,
    skills,
    toggleInterviewSkillSelection,
    downloadInterviewQuestion,
    exportCandidates,
    requestBatchDelete,
    batchBindPosition,
    onMoveToTalentPool,
    onRefresh,
    batchUpdateStatus,
    duplicateCandidates,
    interviewSchedules,
    createInterviewSchedule,
    deleteInterviewSchedule,
    offers,
    createOffer,
    updateOffer,
    deleteOffer,
    followUps,
    createFollowUp,
    deleteFollowUp,
}: CandidatesPageProps) {
    const {language} = useI18n();
    const isZh = language !== "en-US";
    const tr = React.useMemo(() => getCandidatesLocale(language), [language]);
    const activeQuickStatus = candidateStatusFilter[0] || "";
    const activeQuickScreeningStatus = (
        activeQuickStatus === "screening_passed" || activeQuickStatus === "screening_rejected"
            ? activeQuickStatus
            : ""
    );
    const activeQuickPosition = candidatePositionFilter[0] || "";
    const exportFieldOptions = React.useMemo(() => ([
        { key: "name", label: isZh ? "姓名" : "Name", defaultChecked: true },
        { key: "phone", label: isZh ? "手机号" : "Phone", defaultChecked: true },
        { key: "email", label: isZh ? "邮箱" : "Email", defaultChecked: true },
        { key: "position_title", label: isZh ? "应聘岗位" : "Applied Position", defaultChecked: true },
        { key: "source", label: isZh ? "简历来源" : "Resume Source", defaultChecked: true },
        { key: "current_status", label: isZh ? "当前状态" : "Current Status", defaultChecked: true },
        { key: "screening_score", label: isZh ? "初筛得分" : "Screening Score", defaultChecked: true },
        { key: "uploaded_at", label: isZh ? "上传时间" : "Uploaded At", defaultChecked: true },
        { key: "education", label: isZh ? "学历" : "Education", defaultChecked: false },
        { key: "graduation_school", label: isZh ? "毕业院校" : "Graduation School", defaultChecked: false },
        { key: "major", label: isZh ? "专业" : "Major", defaultChecked: false },
        { key: "work_years", label: isZh ? "工作年限" : "Work Years", defaultChecked: false },
        { key: "expected_salary", label: isZh ? "期望薪资" : "Expected Salary", defaultChecked: false },
        { key: "current_city", label: isZh ? "所在城市" : "Current City", defaultChecked: false },
        { key: "expected_city", label: isZh ? "期望城市" : "Expected City", defaultChecked: false },
        { key: "ai_recommended_position", label: isZh ? "AI推荐岗位" : "AI Recommended Position", defaultChecked: false },
        { key: "screening_conclusion", label: isZh ? "初筛结论" : "Screening Conclusion", defaultChecked: false },
        { key: "screening_dimension_scores", label: isZh ? "初筛维度得分" : "Screening Dimension Scores", defaultChecked: false },
        { key: "audit_operator", label: isZh ? "审计操作人" : "Audit Operator", defaultChecked: false },
        { key: "last_updated_at", label: isZh ? "最后更新时间" : "Last Updated At", defaultChecked: false },
    ]), [isZh]);
    const defaultExportFieldKeys = React.useMemo(
        () => exportFieldOptions.filter((item) => item.defaultChecked).map((item) => item.key),
        [exportFieldOptions],
    );
    const [candidateListViewportEl, setCandidateListViewportEl] = React.useState<HTMLDivElement | null>(null);
    const [candidateListCompactMode, setCandidateListCompactMode] = React.useState(false);
    const [candidateFilterBarExpanded, setCandidateFilterBarExpanded] = React.useState(false);
    const [candidateAdvancedActionsExpanded, setCandidateAdvancedActionsExpanded] = React.useState(false);
    const [refreshing, setRefreshing] = React.useState(false);
    const [candidateAiOutputDialogOpen, setCandidateAiOutputDialogOpen] = React.useState(false);
    const [exportDialogOpen, setExportDialogOpen] = React.useState(false);
    const [exportIncludeResumes, setExportIncludeResumes] = React.useState(true);
    const [exportFieldKeys, setExportFieldKeys] = React.useState<string[]>(defaultExportFieldKeys);
    const [batchBindDialogOpen, setBatchBindDialogOpen] = React.useState(false);
    const [batchBindPositionId, setBatchBindPositionId] = React.useState<string>("");
    const [batchBindSubmitting, setBatchBindSubmitting] = React.useState(false);
    const [batchStatusDialogOpen, setBatchStatusDialogOpen] = React.useState(false);

    useEffect(() => {
        setExportFieldKeys(defaultExportFieldKeys);
    }, [defaultExportFieldKeys]);
    useEffect(() => {
        if (!selectedCandidateIds.length) {
            setCandidateAdvancedActionsExpanded(false);
        }
    }, [selectedCandidateIds.length]);
    const [batchStatusValue, setBatchStatusValue] = React.useState<string>("");
    const [batchStatusReason, setBatchStatusReason] = React.useState<string>("");
    const [batchStatusSubmitting, setBatchStatusSubmitting] = React.useState(false);
    const [scheduleFormOpen, setScheduleFormOpen] = React.useState(false);
    const defaultRoundName = tr.roundNameDefault;
    const [scheduleForm, setScheduleForm] = React.useState({round_name: defaultRoundName, interviewer_name: "", scheduled_at: "", duration_minutes: "60", location: "", meeting_link: "", notes: ""});
    const [scheduleSubmitting, setScheduleSubmitting] = React.useState(false);
    const [offerFormOpen, setOfferFormOpen] = React.useState(false);
    const [offerForm, setOfferForm] = React.useState({offer_title: "", salary: "", department: "", entry_date: "", offer_content: "", notes: ""});
    const [offerSubmitting, setOfferSubmitting] = React.useState(false);
    const [followUpFormOpen, setFollowUpFormOpen] = React.useState(false);
    const [followUpContent, setFollowUpContent] = React.useState("");
    const [followUpType, setFollowUpType] = React.useState("note");
    const [followUpSubmitting, setFollowUpSubmitting] = React.useState(false);
    const candidateDetailToolbarScrollRef = React.useRef<HTMLDivElement | null>(null);
    const candidateDetailToolbarRailRef = React.useRef<HTMLDivElement | null>(null);
    const candidateDetailToolbarSyncSourceRef = React.useRef<"viewport" | "rail" | null>(null);
    const [candidateDetailToolbarRailWidth, setCandidateDetailToolbarRailWidth] = React.useState(0);
    const [candidateDetailToolbarHasOverflow, setCandidateDetailToolbarHasOverflow] = React.useState(false);

    const updateCandidateDetailToolbarMetrics = React.useCallback(() => {
        const node = candidateDetailToolbarScrollRef.current;
        if (!node) {
            setCandidateDetailToolbarRailWidth(0);
            setCandidateDetailToolbarHasOverflow(false);
            return;
        }
        setCandidateDetailToolbarRailWidth(node.scrollWidth);
        setCandidateDetailToolbarHasOverflow(node.scrollWidth > node.clientWidth + 1);
    }, []);

    const syncCandidateDetailToolbarScroll = React.useCallback((left: number, source: "viewport" | "rail") => {
        const viewport = candidateDetailToolbarScrollRef.current;
        const rail = candidateDetailToolbarRailRef.current;

        if (source !== "viewport" && viewport && Math.abs(viewport.scrollLeft - left) > 1) {
            candidateDetailToolbarSyncSourceRef.current = "rail";
            viewport.scrollLeft = left;
        }
        if (source !== "rail" && rail && Math.abs(rail.scrollLeft - left) > 1) {
            candidateDetailToolbarSyncSourceRef.current = "viewport";
            rail.scrollLeft = left;
        }
    }, []);

    const handleCandidateDetailToolbarScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
        if (candidateDetailToolbarSyncSourceRef.current === "rail") {
            candidateDetailToolbarSyncSourceRef.current = null;
            return;
        }
        syncCandidateDetailToolbarScroll(event.currentTarget.scrollLeft, "viewport");
    }, [syncCandidateDetailToolbarScroll]);

    const handleCandidateDetailToolbarRailScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
        if (candidateDetailToolbarSyncSourceRef.current === "viewport") {
            candidateDetailToolbarSyncSourceRef.current = null;
            return;
        }
        syncCandidateDetailToolbarScroll(event.currentTarget.scrollLeft, "rail");
    }, [syncCandidateDetailToolbarScroll]);

    const handleCandidateDetailToolbarWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
        const node = event.currentTarget;
        if (node.scrollWidth <= node.clientWidth + 1) {
            return;
        }
        if (!event.shiftKey && Math.abs(event.deltaX) <= 0) {
            return;
        }
        const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
        if (!delta) {
            return;
        }
        event.preventDefault();
        const nextLeft = node.scrollLeft + delta;
        node.scrollLeft = nextLeft;
        syncCandidateDetailToolbarScroll(nextLeft, "viewport");
    }, [syncCandidateDetailToolbarScroll]);

    React.useEffect(() => {
        if (!candidateListViewportEl) {
            return;
        }

        const syncCompactMode = () => {
            setCandidateListCompactMode(candidateListViewportEl.clientWidth <= 760);
        };

        syncCompactMode();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", syncCompactMode);
            return () => window.removeEventListener("resize", syncCompactMode);
        }

        let rafId: number | null = null;
        const observer = new ResizeObserver(() => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                syncCompactMode();
                rafId = null;
            });
        });
        observer.observe(candidateListViewportEl);
        return () => {
            observer.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [candidateListViewportEl]);

    const mergedCandidateListScrollRef = React.useCallback((node: HTMLDivElement | null) => {
        setCandidateListViewportEl(node);
        candidateListScrollRef(node);
    }, [candidateListScrollRef]);

    const rowVirtualizer = useVirtualizer({
        count: visibleCandidates.length,
        getScrollElement: () => candidateListViewportEl,
        estimateSize: () => CANDIDATE_LIST_ESTIMATED_ROW_HEIGHT,
        overscan: CANDIDATE_LIST_OVERSCAN,
    });

    const candidateListVisibleColumns = React.useMemo<CandidateListColumnKey[]>(
        () => (
            showOrganizationColumn
                ? ["candidate", "status", "match", "city", "expected_city", "position", "organization", "source", "updated"]
                : ["candidate", "status", "match", "city", "expected_city", "position", "source", "updated"]
        ),
        [showOrganizationColumn],
    );

    const candidateListEffectiveColumnWidths = React.useMemo<CandidateListDisplayColumnWidths>(() => (
        candidateListCompactMode
            ? {
                ...candidateListDisplayColumnWidths,
                candidate: 132,
                position: 108,
            }
            : candidateListDisplayColumnWidths
    ), [candidateListCompactMode, candidateListDisplayColumnWidths]);

    const candidateListEffectiveTableWidth = React.useMemo(() => {
        return 56 + candidateListVisibleColumns.reduce(
            (sum, key) => sum + candidateListEffectiveColumnWidths[key],
            0,
        );
    }, [candidateListEffectiveColumnWidths, candidateListVisibleColumns]);

    const selectedCandidateIdSet = React.useMemo(() => new Set(selectedCandidateIds), [selectedCandidateIds]);

    const stableCallbacks = React.useMemo(() => {
        const selectMap = new Map<number, () => void>();
        const toggleMap = new Map<number, (checked: boolean) => void>();
        visibleCandidates.forEach((c) => {
            selectMap.set(c.id, () => setSelectedCandidateId(c.id));
            toggleMap.set(c.id, (checked: boolean) => toggleCandidateSelection(c.id, checked));
        });
        return {selectMap, toggleMap};
    }, [visibleCandidates, setSelectedCandidateId, toggleCandidateSelection]);

    const virtualItems = rowVirtualizer.getVirtualItems();
    const topSpacerHeight = virtualItems.length > 0 ? virtualItems[0].start : 0;

    const getColumnHeaderLabel = React.useCallback((columnKey: string) => {
        switch (columnKey) {
            case "candidate": return tr.candidate;
            case "organization": return tr.organization;
            case "position": return tr.position;
            case "status": return tr.status;
            case "match": return tr.matchPercent;
            case "city": return tr.cityLabel;
            case "expected_city": return tr.expectedCityLabel;
            case "source": return tr.source;
            default: return tr.timeLabel;
        }
    }, [tr]);
    const bottomSpacerHeight = virtualItems.length > 0
        ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1].start + virtualItems[virtualItems.length - 1].size)
        : 0;

    const [candidateDetailPanel, setCandidateDetailPanel] = React.useState<"profile" | "ai" | "interview">("profile");
    const [detailExpanded, setDetailExpanded] = React.useState(false);
    const [potentialReasonExpanded, setPotentialReasonExpanded] = React.useState(false);
    const zoomHintRef = React.useRef<HTMLDivElement>(null);

    // ---- 分栏拖拽调整 (Split Pane Resize) ----
    // 默认保留详情区的最小可见宽度，让用户一进来就知道右侧是详情区。
    const splitRatioRef = React.useRef<number>(60);
    const splitContainerRef = React.useRef<HTMLDivElement>(null);
    const leftPanelRef = React.useRef<HTMLDivElement>(null);
    const rightPanelRef = React.useRef<HTMLDivElement>(null);
    const resizeHandleRef = React.useRef<HTMLDivElement>(null);
    const isResizingRef = React.useRef(false);

    // 首次使用提示
    const [showWidthHint, setShowWidthHint] = React.useState(() =>
        !localStorage.getItem('has-seen-width-hint')
    );
    const widthHintRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        setCandidateDetailPanel("profile");
        setCandidateAiOutputDialogOpen(false);
        setDetailExpanded(false);
        setPotentialReasonExpanded(false);
    }, [selectedCandidateId]);

    React.useEffect(() => {
        updateCandidateDetailToolbarMetrics();

        const node = candidateDetailToolbarScrollRef.current;
        if (!node || typeof ResizeObserver === "undefined") {
            return;
        }

        let rafId: number | null = null;
        const observer = new ResizeObserver(() => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                updateCandidateDetailToolbarMetrics();
                rafId = null;
            });
        });
        observer.observe(node);
        if (node.firstElementChild instanceof HTMLElement) {
            observer.observe(node.firstElementChild);
        }

        return () => {
            observer.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [candidateDetail, candidateDetailPanel, updateCandidateDetailToolbarMetrics]);

    // detailExpanded 恢复时，重新应用存储的分栏宽度
    React.useEffect(() => {
        if (!detailExpanded && leftPanelRef.current) {
            leftPanelRef.current.style.width = `${splitRatioRef.current}%`;
        }
        if (!detailExpanded && rightPanelRef.current) {
            rightPanelRef.current.style.width = `${100 - splitRatioRef.current}%`;
        }
    }, [detailExpanded]);

    // 拖拽分割条：Ref-based，完全绕过 React 渲染
    const handleResizeMouseDown = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizingRef.current = true;
        const container = splitContainerRef.current;
        if (!container) return;

        // 移除容器 transition，避免拖拽时动画延迟
        container.style.transition = 'none';

        // 全局遮罩：捕获鼠标事件，防止 iframe / pointer-events 干扰
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:col-resize;';
        document.body.appendChild(overlay);
        document.body.style.cursor = 'col-resize';

        // will-change 优化
        if (leftPanelRef.current) leftPanelRef.current.style.willChange = 'width';
        if (rightPanelRef.current) rightPanelRef.current.style.willChange = 'width';

        // 关闭首次提示
        if (showWidthHint) {
            setShowWidthHint(false);
            localStorage.setItem('has-seen-width-hint', '1');
        }

        const containerRect = container.getBoundingClientRect();
        const MIN_RATIO = 20;
        const MAX_RATIO = 60;

        const onMove = (ev: MouseEvent) => {
            const ratio = ((ev.clientX - containerRect.left) / containerRect.width) * 100;
            const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
            splitRatioRef.current = clamped;
            // 直接操作 DOM，跳过 React 渲染
            if (leftPanelRef.current) leftPanelRef.current.style.width = `${clamped}%`;
            if (rightPanelRef.current) rightPanelRef.current.style.width = `${100 - clamped}%`;
        };

        const onUp = () => {
            isResizingRef.current = false;
            // 恢复 transition
            container.style.transition = '';
            // 清除 will-change
            if (leftPanelRef.current) leftPanelRef.current.style.willChange = '';
            if (rightPanelRef.current) rightPanelRef.current.style.willChange = '';
            // 移除遮罩
            document.body.removeChild(overlay);
            document.body.style.cursor = '';
            // 持久化
            localStorage.setItem('candidates-split-width', String(splitRatioRef.current));
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [showWidthHint]);

    const candidateOverviewCounts = React.useMemo(() => {
        return visibleCandidates.reduce((acc, candidate) => {
            const status = resolveCandidateDisplayStatus(candidate);
            if (status === "pending_screening") acc.pendingScreening++;
            if (status === "pending_interview") acc.pendingInterview++;
            if (status === "talent_pool") acc.talentPool++;
            if (getCandidateResumeMailSummary(candidate.id)) acc.sent++;
            return acc;
        }, {pendingScreening: 0, pendingInterview: 0, talentPool: 0, sent: 0});
    }, [getCandidateResumeMailSummary, visibleCandidates]);

    const candidateOverviewStats = React.useMemo(() => {
        return [
            {label: tr.currentResults, value: `${visibleCandidates.length}${tr.peopleSuffix}`},
            {label: tr.pendingScreening, value: `${candidateOverviewCounts.pendingScreening}${tr.peopleSuffix}`},
            {label: tr.pendingInterview, value: `${candidateOverviewCounts.pendingInterview}${tr.peopleSuffix}`},
            {label: tr.talentPoolAndSent, value: `${candidateOverviewCounts.talentPool} / ${candidateOverviewCounts.sent}`},
        ];
    }, [candidateOverviewCounts, tr, visibleCandidates]);

    const recentVisibleCandidates = React.useMemo(() => {
        const toTimestamp = (value?: string | null) => (value ? new Date(value).getTime() : 0);
        return [...visibleCandidates]
            .sort((left, right) => toTimestamp(right.updated_at) - toTimestamp(left.updated_at))
            .slice(0, 5);
    }, [visibleCandidates]);

    const selectedCandidateResumeMailSummary = candidateDetail
        ? getCandidateResumeMailSummary(candidateDetail.candidate.id)
        : null;
    const selectedCandidateResumeMailCountLabel = React.useMemo(() => {
        if (!selectedCandidateResumeMailSummary) {
            return tr.sendCountZero;
        }
        const match = selectedCandidateResumeMailSummary.match(tr.sentCountRegex);
        return match ? tr.sentCountLabel(match[1]) : tr.sentLabel;
    }, [selectedCandidateResumeMailSummary, tr]);
    const candidateDetailIdentityMeta = candidateDetail?.candidate.current_company || "";
    const primaryResumeFile = candidateDetail?.resume_files[0] ?? null;
    const latestInterviewQuestion = candidateDetail?.interview_questions[0] ?? null;
    const latestResumeScoreLog = React.useMemo(
        () => candidateProcessActivity.find((log) => log.task_type === "resume_score") || null,
        [candidateProcessActivity],
    );
    const currentScreeningTaskLog = React.useMemo(
        () => (
            selectedCandidateScreeningTaskId
                ? candidateProcessActivity.find((log) => log.id === selectedCandidateScreeningTaskId) || latestResumeScoreLog
                : null
        ),
        [candidateProcessActivity, latestResumeScoreLog, selectedCandidateScreeningTaskId],
    );
    const currentScreeningTaskStage = React.useMemo(
        () => (
            extractScreeningTaskStage(currentScreeningTaskLog)
            || candidateDetail?.candidate.active_screening_stage
            || ""
        ),
        [candidateDetail?.candidate.active_screening_stage, currentScreeningTaskLog],
    );
    const currentScreeningTaskType = React.useMemo(
        () => currentScreeningTaskLog?.task_type || candidateDetail?.candidate.active_screening_task_type || "",
        [candidateDetail?.candidate.active_screening_task_type, currentScreeningTaskLog],
    );
    const currentScreeningTaskStatus = React.useMemo(
        () => currentScreeningTaskLog?.status || candidateDetail?.candidate.active_screening_status || "",
        [candidateDetail?.candidate.active_screening_status, currentScreeningTaskLog],
    );
    const shouldShowCurrentScreeningTask = Boolean(
        currentScreeningTaskLog
        || candidateDetail?.candidate.active_screening_stage
        || candidateDetail?.candidate.display_status_reason,
    );
    const candidateAiOutputPayload = React.useMemo(
        () => resolveCandidateAiOutputPayload(latestResumeScoreLog, candidateDetail?.score, tr),
        [candidateDetail?.score, latestResumeScoreLog],
    );
    const candidateAiOutputAvailable = Boolean(
        candidateAiOutputPayload.markdown.trim()
        || candidateAiOutputPayload.raw.trim(),
    );
    const candidateScoreDisplayValues = React.useMemo(
        () => resolveScoreDisplayValues(toScoreRecord(candidateDetail?.score ?? null)),
        [candidateDetail?.score],
    );
    const candidateScoreDecisionValues = React.useMemo(
        () => deriveScoreDecisionValues(toScoreRecord(candidateDetail?.score ?? null)),
        [candidateDetail?.score],
    );
    const candidateDetailDisplayStatus = resolveCandidateDisplayStatus(candidateDetail?.candidate);
    const candidateDetailHasRuntimeOverride = Boolean(
        candidateDetail?.candidate
        && candidateDetailDisplayStatus
        && candidateDetailDisplayStatus !== candidateDetail.candidate.status,
    );
    const sanitizeTaskMessage = React.useCallback((
        value?: string | null,
        taskType?: string | null,
        autoRetry = false,
    ) => sanitizeCandidateFacingErrorText(value, {
        context: resolveCandidateFacingErrorContext(taskType, { autoRetry }),
        language,
    }), [language]);

    return (
        <>
            <div
                className={cn(
                    "grid h-full min-h-0 overflow-hidden",
                    candidateFilterBarExpanded
                        ? "grid-rows-[auto_minmax(0,1fr)] gap-2"
                        : "grid-rows-[minmax(0,1fr)] gap-0",
                )}
            >
                {candidateFilterBarExpanded ? (
                    <CandidateFilterBar
                        candidateFilterSummary={candidateFilterSummary}
                        candidateViewMode={candidateViewMode}
                        setCandidateViewMode={setCandidateViewMode}
                        candidateQuery={candidateQuery}
                        setCandidateQuery={setCandidateQuery}
                        candidatePositionFilter={candidatePositionFilter}
                        setCandidatePositionFilter={setCandidatePositionFilter}
                        candidateStatusFilter={candidateStatusFilter}
                        setCandidateStatusFilter={setCandidateStatusFilter}
                        candidateMatchFilter={candidateMatchFilter}
                        setCandidateMatchFilter={setCandidateMatchFilter}
                        candidateSourceFilter={candidateSourceFilter}
                        setCandidateSourceFilter={setCandidateSourceFilter}
                        candidateTimeFilter={candidateTimeFilter}
                        setCandidateTimeFilter={setCandidateTimeFilter}
                        positions={positions}
                        sourceOptions={sourceOptions}
                        visibleCandidateCount={visibleCandidates.length}
                        onCollapse={() => setCandidateFilterBarExpanded(false)}
                    />
                ) : null}

                <div
                    ref={splitContainerRef}
                    className="flex min-h-0 items-stretch gap-2 overflow-hidden"
                >
                {/* 左侧列表面板 */}
                <div
                    ref={leftPanelRef}
                    className={cn(
                        "min-h-0 overflow-hidden transition-all duration-200",
                        detailExpanded ? "w-0 opacity-0 pointer-events-none" : ""
                    )}
                    style={!detailExpanded ? { width: `${splitRatioRef.current}%` } : undefined}
                >
                <Card className={cn(panelClass, "h-full !gap-0 overflow-hidden !py-0")}>
                    <CardHeader className="px-4 pt-2 pb-0 sm:px-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <CardTitle className="flex shrink-0 items-center gap-2 text-[19px] leading-none">
                                <span>{tr.candidateList}</span>
                                <Badge variant="outline" className="rounded-full text-sm font-normal">{visibleCandidates.length}{tr.peopleSuffix}</Badge>
                            </CardTitle>
                            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                                <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/80 p-1 dark:border-slate-800 dark:bg-slate-900/60">
                                    <NativeSelect
                                        value={activeQuickScreeningStatus || "__all__"}
                                        title={
                                            activeQuickScreeningStatus
                                                ? (candidateStatusLabels[activeQuickScreeningStatus] || activeQuickScreeningStatus)
                                                : (isZh ? "初筛状态" : "Screening Status")
                                        }
                                        onChange={(event) => {
                                            const nextValue = event.target.value;
                                            setCandidateStatusFilter(nextValue === "__all__" ? [] : [nextValue]);
                                        }}
                                        className="h-7 w-[112px] rounded-md border-transparent bg-white pr-7 text-sm shadow-none dark:bg-slate-950"
                                    >
                                        <option value="__all__">{isZh ? "初筛状态" : "Screening"}</option>
                                        <option value="screening_passed">{candidateStatusLabels.screening_passed || (isZh ? "初筛通过" : "Screening Passed")}</option>
                                        <option value="screening_rejected">{candidateStatusLabels.screening_rejected || (isZh ? "初筛淘汰" : "Screening Rejected")}</option>
                                    </NativeSelect>
                                    <div className="w-[190px] max-w-[190px] min-w-0 shrink-0">
                                        <NativeSelect
                                            value={activeQuickPosition || "__all__"}
                                            title={
                                                activeQuickPosition
                                                    ? (positions.find((position) => String(position.id) === activeQuickPosition)?.title || "")
                                                    : tr.allPositions
                                            }
                                            onChange={(event) => {
                                                const nextValue = event.target.value;
                                                setCandidatePositionFilter(nextValue === "__all__" ? [] : [nextValue]);
                                            }}
                                            className="h-7 w-full max-w-full truncate rounded-md border-transparent bg-white pr-8 text-sm shadow-none dark:bg-slate-950"
                                        >
                                            <option value="__all__">{tr.allPositions}</option>
                                            {positions.map((position) => (
                                                <option key={position.id} value={String(position.id)}>
                                                    {position.title}
                                                </option>
                                            ))}
                                        </NativeSelect>
                                    </div>
                                </div>
                                {onRefresh ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 rounded-md px-2 text-sm"
                                        disabled={refreshing || candidatesLoading}
                                        onClick={async () => {
                                            setRefreshing(true);
                                            try {
                                                await onRefresh();
                                            } finally {
                                                setRefreshing(false);
                                            }
                                        }}
                                    >
                                        <RotateCcw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}/>
                                        {tr.refresh}
                                    </Button>
                                ) : null}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 rounded-md px-2.5 text-sm"
                                    onClick={() => setCandidateFilterBarExpanded((current) => !current)}
                                >
                                    <SlidersHorizontal className="h-4 w-4"/>
                                    {candidateFilterBarExpanded ? tr.collapseFilters : tr.filters}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col px-4 pt-1 pb-2.5 sm:px-5">
                        <div className="mb-0.5 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {tr.selectedCandidates(selectedCandidateIds.length)}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                {selectedCandidateIds.length ? (
                                    <Button size="sm" variant="ghost" className="h-7 rounded-md px-2.5 text-sm" onClick={() => setSelectedCandidateIds([])}>
                                        {tr.clearSelection}
                                    </Button>
                                ) : null}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 rounded-md px-2.5 text-sm"
                                    onClick={() => void triggerScreening(selectedCandidateIds)}
                                    disabled={isBatchScreeningCancelling || (screeningSubmitting && !isBatchScreeningRunning) || (!isBatchScreeningRunning && !selectedCandidateIds.length)}
                                >
                                    {isBatchScreeningCancelling ? <Loader2 className="h-4 w-4 animate-spin"/> : isBatchScreeningRunning ? <Square className="h-4 w-4"/> : screeningSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}
                                    {isBatchScreeningCancelling ? tr.stopping : isBatchScreeningRunning ? tr.stopBatchScreening : screeningSubmitting ? tr.queueing : tr.queueBatch}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 rounded-md px-2.5 text-sm"
                                    onClick={() => void triggerFreshScreening(selectedCandidateIds)}
                                    disabled={screeningSubmitting || !selectedCandidateIds.length}
                                >
                                    <RotateCcw className="h-4 w-4"/>
                                    {tr.requeueFreshScreening}
                                </Button>
                                <div className="group relative inline-flex">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 rounded-md px-2.5 text-sm"
                                        onClick={() => setCandidateAdvancedActionsExpanded((current) => !current)}
                                        disabled={!selectedCandidateIds.length}
                                    >
                                        {candidateAdvancedActionsExpanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                                        {tr.advancedActions}
                                    </Button>
                                    <div className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-72 translate-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                                        {tr.advancedActionsHint}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {selectedCandidateIds.length && candidateAdvancedActionsExpanded ? (
                            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-slate-200/80 bg-slate-50/70 px-2.5 py-2 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 rounded-md px-2.5 text-sm"
                                    onClick={async () => {
                                        if (onMoveToTalentPool) {
                                            await onMoveToTalentPool(selectedCandidateIds);
                                        } else {
                                            await batchBindPosition(selectedCandidateIds, null);
                                        }
                                    }}
                                    disabled={!selectedCandidateIds.length}
                                >
                                    <Users className="h-4 w-4"/>
                                    {isZh ? "归入人才库" : "Move to Talent Pool"}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 rounded-md px-2.5 text-sm" onClick={() => setExportDialogOpen(true)} disabled={!selectedCandidateIds.length || exporting}>
                                    <Download className="h-4 w-4"/>
                                    {exporting ? tr.exporting : tr.exportCandidates}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 rounded-md px-2.5 text-sm" onClick={() => openResumeMailDialog(selectedCandidateIds)} disabled={!selectedCandidateIds.length}>
                                    <Mail className="h-4 w-4"/>
                                    {tr.sendResumesBatch}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 rounded-md px-2.5 text-sm" onClick={() => { setBatchBindPositionId(""); setBatchBindDialogOpen(true); }} disabled={!selectedCandidateIds.length}>
                                    <Briefcase className="h-4 w-4"/>
                                    {tr.batchBindPosition}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 rounded-md px-2.5 text-sm" onClick={() => { setBatchStatusValue(""); setBatchStatusReason(""); setBatchStatusDialogOpen(true); }} disabled={!selectedCandidateIds.length}>
                                    <ArrowRightLeft className="h-4 w-4"/>
                                    {tr.batchUpdateStatus}
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 rounded-md px-2.5 text-sm text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-950/30" onClick={() => requestBatchDelete(selectedCandidateIds)} disabled={!selectedCandidateIds.length}>
                                    <Trash2 className="h-4 w-4"/>
                                </Button>
                            </div>
                        ) : null}
                        {candidateMatchSortLoading ? (
                            <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                                <Loader2 className="h-4 w-4 animate-spin"/>
                                <span>{tr.sortingByMatchPercent}</span>
                            </div>
                        ) : null}
                        {candidatesLoading || !candidatesInitialLoaded ? (
                            <LoadingCard label={tr.loadingCandidateList}/>
                        ) : candidateViewMode === "list" ? (
                            visibleCandidates.length === 0 ? (
                                <div className="flex min-h-0 flex-1 items-center justify-center">
                                    <EmptyState title={tr.noCandidatesMatched} description={tr.noCandidatesMatchedDesc}/>
                                </div>
                            ) : (
                                <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
                                    <div
                                        ref={mergedCandidateListScrollRef}
                                        className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.9)_transparent] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:bg-clip-content hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 dark:[scrollbar-color:rgba(71,85,105,0.95)_transparent] dark:[&::-webkit-scrollbar-thumb]:bg-slate-700 dark:hover:[&::-webkit-scrollbar-thumb]:bg-slate-600"
                                    >
                                        <table style={{width: candidateListEffectiveTableWidth, minWidth: candidateListEffectiveTableWidth}} className="caption-bottom table-fixed text-base">
                                            <thead className="[&_tr]:border-b">
                                                <tr className="border-b bg-white/95 transition-colors dark:bg-slate-950/95">
                                                    <th className="text-foreground sticky top-0 z-10 h-10 w-14 bg-inherit px-2 text-left align-middle font-medium whitespace-nowrap">
                                                        <input
                                                            type="checkbox"
                                                            checked={visibleCandidates.length > 0 && visibleCandidates.every((candidate) => selectedCandidateIdSet.has(candidate.id))}
                                                            onChange={(event) => setSelectedCandidateIds(event.target.checked ? visibleCandidates.map((candidate) => candidate.id) : [])}
                                                            aria-label={tr.selectAllCandidates}
                                                        />
                                                    </th>
                                                    {candidateListVisibleColumns.map((columnKey) => {
                                                        const label = getColumnHeaderLabel(columnKey);

                                                        if (!candidateListCompactMode) {
                                                            return renderCandidateListHeaderCell(columnKey, label);
                                                        }

                                                        return (
                                                            <th
                                                                key={columnKey}
                                                                style={{
                                                                    width: candidateListEffectiveColumnWidths[columnKey],
                                                                    minWidth: candidateListEffectiveColumnWidths[columnKey],
                                                                    maxWidth: candidateListEffectiveColumnWidths[columnKey],
                                                                }}
                                                                className="text-foreground sticky top-0 z-10 h-10 bg-inherit px-2 text-left align-middle text-sm font-medium whitespace-nowrap"
                                                            >
                                                                {label}
                                                            </th>
                                                        );
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody className="[&_tr:last-child]:border-0">
                                                {visibleCandidates.length ? (
                                                    <>
                                                        {topSpacerHeight > 0 ? (
                                                            <tr aria-hidden="true" className="border-0">
                                                                <td
                                                                    colSpan={candidateListVisibleColumns.length + 1}
                                                                    className="h-0 p-0"
                                                                    style={{height: topSpacerHeight, border: 0}}
                                                                />
                                                            </tr>
                                                        ) : null}
                                                        {virtualItems.map((virtualRow) => {
                                                            const candidate = visibleCandidates[virtualRow.index];
                                                            return (
                                                                <CandidateRow
                                                                    key={candidate.id}
                                                                    candidate={candidate}
                                                                    isSelected={selectedCandidateId === candidate.id}
                                                                    selectedCandidateIdSet={selectedCandidateIdSet}
                                                                    columns={candidateListVisibleColumns}
                                                                    columnWidths={candidateListEffectiveColumnWidths}
                                                                    onSelect={stableCallbacks.selectMap.get(candidate.id)!}
                                                                    onToggleCheck={stableCallbacks.toggleMap.get(candidate.id)!}
                                                                    getResumeMailSummary={getCandidateResumeMailSummary}
                                                                    getOrganizationLabel={getOrganizationLabel}
                                                                    tr={tr}
                                                                    language={language}
                                                                    measureRef={rowVirtualizer.measureElement}
                                                                    dataIndex={virtualRow.index}
                                                                />
                                                            )})}
                                                        {bottomSpacerHeight > 0 ? (
                                                            <tr aria-hidden="true" className="border-0">
                                                                <td
                                                                    colSpan={candidateListVisibleColumns.length + 1}
                                                                    className="h-0 p-0"
                                                                    style={{height: bottomSpacerHeight, border: 0}}
                                                                />
                                                            </tr>
                                                        ) : null}
                                                    </>
                                                ) : null}
                                            </tbody>
                                        </table>
                                        {isLoadingMoreCandidates ? (
                                            <div className="flex items-center justify-center gap-2 py-3 text-base text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin"/>
                                                <span>{tr.loadingMoreCandidates}</span>
                                            </div>
                                        ) : !isLoadingMoreCandidates && allCandidatesCount >= candidateTotal && candidateTotal > 0 ? (
                                            <div className="flex items-center justify-center py-3 text-base text-muted-foreground">
                                                <span>{tr.allCandidatesLoaded}</span>
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="shrink-0 border-t border-slate-200/80 pt-2 dark:border-slate-800">
                                        <div
                                            ref={candidateListHorizontalRailRef}
                                            className="overflow-x-auto overflow-y-hidden [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.95)_transparent] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[scrollbar-color:rgba(71,85,105,0.98)_transparent] dark:[&::-webkit-scrollbar-track]:bg-slate-900/80 dark:[&::-webkit-scrollbar-thumb]:border-slate-900 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700"
                                        >
                                            <div style={{width: candidateListEffectiveTableWidth, height: 1}}/>
                                        </div>
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
                                <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                                    {groupedCandidates.map((group) => (
                                        <div key={group.status} className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                            <div className="mb-4 flex items-center justify-between gap-2">
                                                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{group.label}</p>
                                                <Badge variant="outline" className="rounded-full">{group.items.length}</Badge>
                                            </div>
                                            <div className="space-y-3">
                                                {group.items.length ? (group.items.map((candidate) => {
                                                    const mailSummary = getCandidateResumeMailSummary(candidate.id);
                                                    return (
                                                    <div
                                                        key={candidate.id}
                                                        className={cn(
                                                            "w-full rounded-2xl border px-4 py-4 transition",
                                                            selectedCandidateId === candidate.id
                                                                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950",
                                                        )}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedCandidateId(candidate.id)}
                                                                className="min-w-0 flex-1 text-left"
                                                            >
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <p className="line-clamp-2 break-words text-base font-medium leading-6">
                                                                        {candidate.name}
                                                                    </p>
                                                                    {mailSummary ? (
                                                                        <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                                                            {tr.resumeSent}
                                                                        </Badge>
                                                                    ) : null}
                                                                </div>
                                                                <p className="mt-1 line-clamp-2 break-words text-sm leading-5 opacity-80">
                                                                    {candidate.position_title || tr.unassignedPosition}
                                                                </p>
                                                                {mailSummary ? (
                                                                    <p className="mt-2 text-[15px] opacity-80">{mailSummary}</p>
                                                                ) : null}
                                                                <div className="mt-3 flex items-center justify-between text-sm opacity-80">
                                                                    <span>{tr.matchBadge} {formatPercent(resolveCandidateSummaryMatchPercent(candidate))}</span>
                                                                    <span>{formatDateTime(candidate.updated_at)}</span>
                                                                </div>
                                                            </button>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedCandidateIdSet.has(candidate.id)}
                                                                onChange={(event) => toggleCandidateSelection(candidate.id, event.target.checked)}
                                                                aria-label={tr.selectCandidate(candidate.name)}
                                                            />
                                                        </div>
                                                    </div>
                                                    );
                                                })) : (
                                                    <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-base text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                                        {tr.noCandidatesInStatus}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
                </div>

                {/* 拖拽分割条 */}
                {!detailExpanded && (
                    <div
                        ref={resizeHandleRef}
                        onMouseDown={handleResizeMouseDown}
                        className="relative z-10 flex-shrink-0 cursor-col-resize select-none group/handle"
                        style={{ width: '6px' }}
                    >
                        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[3px] rounded-full
                                        bg-slate-300/50 dark:bg-slate-600/50
                                        group-hover/handle:bg-teal-400 dark:group-hover/handle:bg-teal-500
                                        transition-colors duration-150" />
                        {/* 首次使用提示 */}
                        {showWidthHint && (
                            <div
                                ref={widthHintRef}
                                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                                           whitespace-nowrap z-50 pointer-events-none"
                            >
                                <div className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900
                                                text-sm font-medium px-3 py-2 rounded-lg shadow-lg
                                                animate-pulse">
                                    {tr.splitResizeHint}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 右侧详情面板 */}
                <div
                    ref={rightPanelRef}
                    className="min-h-0 min-w-0 flex-1 overflow-hidden"
                >
                <Card className={cn(panelClass, "h-full min-w-0 gap-0 overflow-hidden py-0")}>
                    {candidateDetailLoading ? <LoadingPanel label={tr.loadingCandidateDetail}/> : candidateDetail ? (
                        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                            <div
    className="border-b border-slate-200/80 px-4 py-2 dark:border-slate-800"
    onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, [data-no-zoom]")) return;
        setDetailExpanded(v => !v);
    }}
    onMouseMove={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, [data-no-zoom]")) {
            if (zoomHintRef.current) zoomHintRef.current.style.display = 'none';
            e.currentTarget.style.cursor = "";
            return;
        }
        if (zoomHintRef.current) {
            zoomHintRef.current.style.left = `${e.clientX + 14}px`;
            zoomHintRef.current.style.top = `${e.clientY + 14}px`;
            zoomHintRef.current.style.display = 'flex';
        }
        e.currentTarget.style.cursor = detailExpanded ? "zoom-out" : "zoom-in";
    }}
    onMouseLeave={() => {
        if (zoomHintRef.current) zoomHintRef.current.style.display = 'none';
    }}
>
                                <div className="space-y-1">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div data-no-zoom className="flex flex-wrap items-center gap-2 text-[15px] text-slate-500 dark:text-slate-400 cursor-text select-text">
                                                <span className="text-[1.25rem] font-semibold text-slate-900 dark:text-slate-100">{candidateDetail.candidate.name}</span>
                                                <Badge className={cn("rounded-full border", statusBadgeClass("candidate", candidateDetailDisplayStatus))}>
                                                    {labelForCandidateStatus(candidateDetailDisplayStatus)}
                                                </Badge>
                                                {candidateDetailHasRuntimeOverride ? (
                                                    <Badge variant="outline" className="rounded-full">
                                                        {tr.originalStatus} {labelForCandidateStatus(candidateDetail.candidate.status)}
                                                    </Badge>
                                                ) : null}
                                                <Badge variant="outline" className="rounded-full">
                                                    {tr.matchBadge} {formatPercent(candidateScoreDisplayValues.matchPercent ?? resolveCandidateSummaryMatchPercent(candidateDetail.candidate))}
                                                </Badge>
                                                <Badge variant="outline" className="rounded-full">
                                                    {tr.sentBadge} {selectedCandidateResumeMailCountLabel}
                                                </Badge>
                                                <span>{candidateDetail.candidate.candidate_code}</span>
                                                {selectedCandidateResumeMailSummary ? (
                                                    <Badge className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                                        {selectedCandidateResumeMailSummary}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                            <div data-no-zoom className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400 cursor-text select-text">
                                                {candidateDetailIdentityMeta ? <span>{candidateDetailIdentityMeta}</span> : null}
                                            </div>
                                        </div>
                                        <div data-no-zoom className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                                            <Button size="sm" variant={candidateDetailPanel === "profile" ? "default" : "ghost"} onClick={() => setCandidateDetailPanel("profile")}>
                                                {tr.profileTab}
                                            </Button>
                                            <Button size="sm" variant={candidateDetailPanel === "ai" ? "default" : "ghost"} onClick={() => setCandidateDetailPanel("ai")}>
                                                {tr.aiAssessmentTab}
                                            </Button>
                                            <Button size="sm" variant={candidateDetailPanel === "interview" ? "default" : "ghost"} onClick={() => setCandidateDetailPanel("interview")}>
                                                {tr.interviewPrepTab}
                                            </Button>
                                        </div>
                                    </div>
                                    {(candidateDetail.candidate.ai_potential_position || candidateDetail.candidate.ai_potential_reason) ? (
                                        <div data-no-zoom className="mt-2 w-full rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5 text-sm text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1 font-medium">
                                                    {`${isZh ? "转岗潜力方向" : "Potential Transition"}：`}
                                                    {candidateDetail.candidate.ai_potential_position || (isZh ? "暂无" : "N/A")}
                                                </div>
                                                {candidateDetail.candidate.ai_potential_reason ? (
                                                    <button
                                                        type="button"
                                                        className="shrink-0 rounded-full px-2 py-0.5 text-xs text-sky-500 transition hover:bg-sky-100 hover:text-sky-700 dark:text-sky-400 dark:hover:bg-sky-900/50 dark:hover:text-sky-200"
                                                        onClick={() => setPotentialReasonExpanded((v) => !v)}
                                                    >
                                                        {potentialReasonExpanded ? (isZh ? "收起详情" : "Collapse") : (isZh ? "展开详情" : "Expand")}
                                                    </button>
                                                ) : null}
                                            </div>
                                            {candidateDetail.candidate.ai_potential_reason && potentialReasonExpanded ? (
                                                <div className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white/65 px-2.5 py-2 leading-6 text-sky-700 dark:bg-sky-950/40 dark:text-sky-100/90">
                                                    {candidateDetail.candidate.ai_potential_reason}
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                                {ReactDOM.createPortal(
                                    <div
                                        ref={zoomHintRef}
                                        style={{
                                            position: "fixed",
                                            display: "none",
                                            pointerEvents: "none",
                                            zIndex: 9999,
                                        }}
                                        className="flex items-center gap-1 rounded-md bg-slate-800/90 px-2 py-1 text-[15px] text-white shadow-lg dark:bg-slate-700/90"
                                    >
                                        <ZoomIn className="h-3 w-3 shrink-0" />
                                        <span>{detailExpanded ? tr.zoomHintCollapse : tr.zoomHintExpand}</span>
                                    </div>,
                                    document.body
                                )}
                            </div>
                            <div className="border-b border-slate-200/80 px-4 py-2 dark:border-slate-800">
                                <div className="min-w-0">
                                    <div
                                        ref={candidateDetailToolbarScrollRef}
                                        onScroll={handleCandidateDetailToolbarScroll}
                                        onWheel={handleCandidateDetailToolbarWheel}
                                        className="min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                    >
                                        <div className="flex w-max items-center gap-2 pr-1">
                                            <Button
                                                className="shrink-0"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void triggerScreening()}
                                                disabled={isSelectedCandidateScreeningCancelling || (screeningSubmitting && !selectedCandidateScreeningTaskId)}
                                            >
                                                {isSelectedCandidateScreeningCancelling ? <Loader2 className="h-4 w-4 animate-spin"/> : selectedCandidateScreeningTaskId ? <Square className="h-4 w-4"/> : screeningSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}
                                                {isSelectedCandidateScreeningCancelling ? tr.stopping : selectedCandidateScreeningTaskId ? tr.stopScreening : screeningSubmitting ? tr.queueing : tr.startScreening}
                                            </Button>
                                            <Button
                                                className="shrink-0"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void triggerFreshScreening()}
                                                disabled={screeningSubmitting}
                                            >
                                                <RotateCcw className="h-4 w-4"/>
                                                {tr.restartScreening}
                                            </Button>
                                            {primaryResumeFile ? (
                                                <Button className="shrink-0" size="sm" variant="outline" onClick={() => previewResumeFile({ id: primaryResumeFile.id, original_name: primaryResumeFile.original_name }, candidateDetail.candidate.name)}>
                                                    <Eye className="h-4 w-4"/>
                                                    {tr.previewResume}
                                                </Button>
                                            ) : null}
                                            <Button className="shrink-0" size="sm" variant="outline" onClick={() => openResumeMailDialog([candidateDetail.candidate.id])}>
                                                <Mail className="h-4 w-4"/>
                                                {tr.sendResume}
                                            </Button>
                                            <Button
                                                className="shrink-0"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void generateInterviewQuestions()}
                                                disabled={isCurrentInterviewTaskCancelling}
                                            >
                                                {currentCandidateInterviewTaskId ? <Square className="h-4 w-4"/> : <NotebookText className="h-4 w-4"/>}
                                                {isCurrentInterviewTaskCancelling ? tr.stopping : currentCandidateInterviewTaskId ? tr.stopGeneration : tr.interviewQuestions}
                                            </Button>
                                            {/* 归入人才库 */}
                                            <Button
                                                className="shrink-0"
                                                size="sm"
                                                variant="outline"
                                                onClick={async () => {
                                                    if (onMoveToTalentPool) {
                                                        await onMoveToTalentPool([candidateDetail.candidate.id]);
                                                    } else {
                                                        await batchBindPosition([candidateDetail.candidate.id], null);
                                                    }
                                                }}
                                            >
                                                <Users className="h-4 w-4"/>
                                                {isZh ? "人才库" : "Talent Pool"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="shrink-0 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/40"
                                                onClick={() => requestDeleteCandidate(candidateDetail.candidate)}
                                            >
                                                <Trash2 className="h-4 w-4"/>
                                                {tr.deleteCandidate}
                                            </Button>
                                        </div>
                                    </div>
                                    {shouldShowCurrentScreeningTask ? (
                                        <div className="mt-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-base font-medium text-slate-900 dark:text-slate-100">{tr.currentScreeningTask}</p>
                                                    {(() => {
                                                        const autoRetry = Boolean(candidateDetail?.candidate.active_screening_auto_retry_scheduled);
                                                        const logMsg = sanitizeTaskMessage(
                                                            currentScreeningTaskLog?.output_summary || currentScreeningTaskLog?.error_message || "",
                                                            currentScreeningTaskType || currentScreeningTaskLog?.task_type,
                                                            autoRetry,
                                                        );
                                                        const displayReason = sanitizeTaskMessage(
                                                            candidateDetail?.candidate.display_status_reason || "",
                                                            currentScreeningTaskType || candidateDetail?.candidate.active_screening_task_type,
                                                            autoRetry,
                                                        );
                                                        const primary = displayReason || logMsg || tr.taskRunning;
                                                        const secondary = displayReason && logMsg && logMsg !== displayReason ? logMsg : null;
                                                        return (
                                                            <>
                                                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{primary}</p>
                                                                {secondary ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{secondary}</p> : null}
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {currentScreeningTaskType ? (
                                                        <Badge variant="outline" className="rounded-full">
                                                            {labelForTaskType(currentScreeningTaskType)}
                                                        </Badge>
                                                    ) : null}
                                                    <Badge variant="outline" className="rounded-full">
                                                        {labelForScreeningTaskStage(currentScreeningTaskStage)}
                                                    </Badge>
                                                    {currentScreeningTaskStatus ? (
                                                        <Badge className={cn("rounded-full border", statusBadgeClass("task", currentScreeningTaskStatus))}>
                                                            {labelForTaskExecutionStatus(currentScreeningTaskStatus)}
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}
                                    {candidateDetailToolbarHasOverflow ? (
                                        <div className="mt-1">
                                            <div
                                                ref={candidateDetailToolbarRailRef}
                                                onScroll={handleCandidateDetailToolbarRailScroll}
                                                className="overflow-x-auto overflow-y-hidden [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.95)_transparent] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border [&::-webkit-scrollbar-thumb]:border-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[scrollbar-color:rgba(71,85,105,0.98)_transparent] dark:[&::-webkit-scrollbar-track]:bg-slate-900/80 dark:[&::-webkit-scrollbar-thumb]:border-slate-900 dark:[&::-webkit-scrollbar-thumb]:bg-slate-700"
                                            >
                                                <div style={{width: candidateDetailToolbarRailWidth, height: 1}}/>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 p-4">
                                <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/50">
                                    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.9)_transparent] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:bg-clip-content hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 dark:[scrollbar-color:rgba(71,85,105,0.95)_transparent] dark:[&::-webkit-scrollbar-thumb]:bg-slate-700 dark:hover:[&::-webkit-scrollbar-thumb]:bg-slate-600">
                                        <div className="min-w-0 space-y-4 px-4 py-4">
                                    {candidateDetailPanel === "profile" ? (
                                        <>
                                            {duplicateCandidates.length > 0 && (
                                                <details className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-900/80 dark:bg-amber-950/30">
                                                    <summary className="cursor-pointer text-base font-medium text-amber-800 dark:text-amber-200">
                                                        {tr.duplicateWarning}（{duplicateCandidates.length}）
                                                    </summary>
                                                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">{tr.duplicateWarningDesc(duplicateCandidates.length)}</p>
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {duplicateCandidates.map((dup) => (
                                                            <Button
                                                                key={dup.id}
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-6 rounded-full border-amber-300 px-2 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/40"
                                                                onClick={() => setSelectedCandidateId(dup.id)}
                                                            >
                                                                {dup.name} ({dup.candidate_code})
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </details>
                                            )}

                                            <Field label={tr.baseInfo}>
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <Input value={candidateEditor.name} onChange={(event) => setCandidateEditor((current) => ({...current, name: event.target.value}))} placeholder={tr.namePlaceholder}/>
                                                    <Input value={candidateEditor.phone} onChange={(event) => setCandidateEditor((current) => ({...current, phone: event.target.value}))} placeholder={tr.phonePlaceholder}/>
                                                    <Input value={candidateEditor.email} onChange={(event) => setCandidateEditor((current) => ({...current, email: event.target.value}))} placeholder={tr.emailPlaceholder}/>
                                                    <Input value={candidateEditor.currentCompany} onChange={(event) => setCandidateEditor((current) => ({...current, currentCompany: event.target.value}))} placeholder={tr.companyPlaceholder}/>
                                                    <Input value={candidateEditor.yearsOfExperience} onChange={(event) => setCandidateEditor((current) => ({...current, yearsOfExperience: event.target.value}))} placeholder={tr.experiencePlaceholder}/>
                                                    <Input value={candidateEditor.education} onChange={(event) => setCandidateEditor((current) => ({...current, education: event.target.value}))} placeholder={tr.educationPlaceholder}/>
                                                    <Input value={candidateEditor.age} onChange={(event) => setCandidateEditor((current) => ({...current, age: event.target.value}))} placeholder={tr.agePlaceholder}/>
                                                    <Input value={candidateEditor.city} onChange={(event) => setCandidateEditor((current) => ({...current, city: event.target.value}))} placeholder={tr.cityPlaceholder}/>
                                                    <Input value={candidateEditor.expectedCity} onChange={(event) => setCandidateEditor((current) => ({...current, expectedCity: event.target.value}))} placeholder={tr.expectedCityPlaceholder}/>
                                                </div>
                                            </Field>

                                            <Field label={tr.position}>
                                                <NativeSelect value={candidateEditor.positionId} onChange={(event) => setCandidateEditor((current) => ({...current, positionId: event.target.value}))}>
                                                    <option value="">{tr.unassignedPosition}</option>
                                                    {positions.map((p) => (
                                                        <option key={p.id} value={String(p.id)}>{p.title}</option>
                                                    ))}
                                                </NativeSelect>
                                            </Field>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <Field label={tr.owner}>
                                                    <Input value={candidateEditor.ownerId} onChange={(event) => setCandidateEditor((current) => ({...current, ownerId: event.target.value}))} placeholder={tr.ownerPlaceholder}/>
                                                </Field>
                                            </div>

                                            <Field label={tr.tagsAndNotes}>
                                                <div className="space-y-3">
                                                    <Input value={candidateEditor.tagsText} onChange={(event) => setCandidateEditor((current) => ({...current, tagsText: event.target.value}))} placeholder={tr.tagsPlaceholder}/>
                                                    <Textarea
                                                        value={candidateEditor.notes}
                                                        onChange={(event) => setCandidateEditor((current) => ({...current, notes: event.target.value}))}
                                                        rows={4}
                                                        placeholder={tr.notesPlaceholder}
                                                    />
                                                    <Button onClick={() => void saveCandidate()}>
                                                        <Save className="h-4 w-4"/>
                                                        {tr.saveCandidateInfo}
                                                    </Button>
                                                </div>
                                            </Field>

                                            <Field label={tr.statusFlow}>
                                                <div className="space-y-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        {Object.entries(candidateStatusLabels).map(([value, label]) => {
                                                            const isCurrent = candidateDetail.candidate.status === value;
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
                                                                        <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                                                                            {tr.confirmStatusChange(label)}
                                                                        </p>
                                                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                                            {tr.currentStatusLine(labelForCandidateStatus(resolveCandidateDisplayStatus(candidateDetail.candidate)))}
                                                                        </p>
                                                                        <div className="mt-3 flex gap-2">
                                                                            <Button size="sm" className="flex-1" onClick={() => void updateCandidateStatus(value)}>
                                                                                {tr.confirm}
                                                                            </Button>
                                                                            <Button size="sm" variant="outline" className="flex-1" onClick={() => setPendingStatus(null)}>
                                                                                {tr.cancel}
                                                                            </Button>
                                                                        </div>
                                                                    </PopoverContent>
                                                                </Popover>
                                                            );
                                                        })}
                                                    </div>
                                                    <Textarea
                                                        value={statusUpdateReason}
                                                        onChange={(event) => setStatusUpdateReason(event.target.value)}
                                                        rows={3}
                                                        placeholder={tr.statusReasonPlaceholder}
                                                    />
                                                    <div className="space-y-3">
                                                        {candidateDetail.status_history.length ? candidateDetail.status_history.map((history) => (
                                                            <div key={history.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                                                                        {labelForCandidateStatus(history.from_status || "")} → {labelForCandidateStatus(history.to_status)}
                                                                    </p>
                                                                    <p className="text-sm text-slate-500 dark:text-slate-400">{formatDateTime(history.created_at)}</p>
                                                                </div>
                                                                <p className="mt-2 text-base text-slate-600 dark:text-slate-300">{history.reason || tr.noReasonProvided}</p>
                                                            </div>
                                                        )) : (
                                                            <EmptyState title={tr.noStatusHistory} description={tr.noStatusHistoryDesc}/>
                                                        )}
                                                    </div>
                                                </div>
                                            </Field>

                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-base font-medium text-slate-900 dark:text-slate-100">{tr.offers}</p>
                                                    <Button size="sm" variant="outline" onClick={() => { setOfferForm({offer_title: "", salary: "", department: "", entry_date: "", offer_content: "", notes: ""}); setOfferFormOpen(!offerFormOpen); }}>
                                                        <Plus className="h-4 w-4"/>
                                                        {tr.addOffer}
                                                    </Button>
                                                </div>
                                                {offerFormOpen && candidateDetail && (
                                                    <div className="mt-3 space-y-2 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                                                        <div className="grid gap-2 md:grid-cols-2">
                                                            <Input value={offerForm.offer_title} onChange={(e) => setOfferForm((f) => ({...f, offer_title: e.target.value}))} placeholder={tr.offerTitle}/>
                                                            <Input value={offerForm.salary} onChange={(e) => setOfferForm((f) => ({...f, salary: e.target.value}))} placeholder={tr.offerSalary}/>
                                                            <Input value={offerForm.department} onChange={(e) => setOfferForm((f) => ({...f, department: e.target.value}))} placeholder={tr.offerDepartment}/>
                                                            <Input type="date" value={offerForm.entry_date} onChange={(e) => setOfferForm((f) => ({...f, entry_date: e.target.value}))} placeholder={tr.offerEntryDate}/>
                                                        </div>
                                                        <Textarea value={offerForm.offer_content} onChange={(e) => setOfferForm((f) => ({...f, offer_content: e.target.value}))} rows={3} placeholder={tr.offerContent}/>
                                                        <Input value={offerForm.notes} onChange={(e) => setOfferForm((f) => ({...f, notes: e.target.value}))} placeholder={tr.offerNotes}/>
                                                        <div className="flex justify-end gap-2">
                                                            <Button size="sm" variant="outline" onClick={() => setOfferFormOpen(false)}>{tr.batchBindPositionCancel}</Button>
                                                            <Button size="sm" disabled={offerSubmitting} onClick={async () => {
                                                                setOfferSubmitting(true);
                                                                try {
                                                                    await createOffer({
                                                                        candidate_id: candidateDetail.candidate.id,
                                                                        offer_title: offerForm.offer_title || undefined,
                                                                        salary: offerForm.salary || undefined,
                                                                        department: offerForm.department || undefined,
                                                                        entry_date: offerForm.entry_date || undefined,
                                                                        offer_content: offerForm.offer_content || undefined,
                                                                        notes: offerForm.notes || undefined,
                                                                    });
                                                                    setOfferFormOpen(false);
                                                                } finally {
                                                                    setOfferSubmitting(false);
                                                                }
                                                            }}>
                                                                {offerSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                                                {tr.batchBindPositionConfirm}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="mt-3 space-y-2">
                                                    {offers.length > 0 ? offers.map((offer) => {
                                                        const statusLabels: Record<string, string> = {draft: tr.offerStatusDraft, sent: tr.offerStatusSent, accepted: tr.offerStatusAccepted, rejected: tr.offerStatusRejected, cancelled: tr.offerStatusCancelled};
                                                        return (
                                                            <div key={offer.id} className="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <p className="text-base font-medium text-slate-900 dark:text-slate-100">{offer.offer_title || "-"}</p>
                                                                            <Badge variant="outline" className="rounded-full text-sm">{statusLabels[offer.status] || offer.status}</Badge>
                                                                        </div>
                                                                        {offer.salary && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{offer.salary}</p>}
                                                                        {offer.department && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{offer.department}</p>}
                                                                        {offer.entry_date && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{offer.entry_date}</p>}
                                                                        {offer.offer_content && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{offer.offer_content}</p>}
                                                                    </div>
                                                                    <div className="flex items-center gap-1">
                                                                        <NativeSelect
                                                                            value={offer.status}
                                                                            onChange={(e) => void updateOffer(offer.id, {status: e.target.value})}
                                                                            className="h-6 text-sm"
                                                                        >
                                                                            <option value="draft">{tr.offerStatusDraft}</option>
                                                                            <option value="sent">{tr.offerStatusSent}</option>
                                                                            <option value="accepted">{tr.offerStatusAccepted}</option>
                                                                            <option value="rejected">{tr.offerStatusRejected}</option>
                                                                            <option value="cancelled">{tr.offerStatusCancelled}</option>
                                                                        </NativeSelect>
                                                                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-500 hover:text-rose-700" onClick={() => { if (window.confirm(tr.confirmDeleteOffer)) void deleteOffer(offer.id); }}>
                                                                            <Trash2 className="h-3.5 w-3.5"/>
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    }) : (
                                                        <EmptyState title={tr.noOffers} description={tr.noOffersDesc}/>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-base font-medium text-slate-900 dark:text-slate-100">{tr.followUps}</p>
                                                    <Button size="sm" variant="outline" onClick={() => { setFollowUpContent(""); setFollowUpType("note"); setFollowUpFormOpen(!followUpFormOpen); }}>
                                                        <Plus className="h-4 w-4"/>
                                                        {tr.addFollowUp}
                                                    </Button>
                                                </div>
                                                {followUpFormOpen && candidateDetail && (
                                                    <div className="mt-3 space-y-2 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                                                        <Textarea value={followUpContent} onChange={(e) => setFollowUpContent(e.target.value)} rows={3} placeholder={tr.followUpContentPlaceholder}/>
                                                        <div className="flex items-center gap-2">
                                                            <NativeSelect value={followUpType} onChange={(e) => setFollowUpType(e.target.value)} className="h-8 text-sm">
                                                                <option value="note">{tr.followUpTypeNote}</option>
                                                                <option value="call">{tr.followUpTypeCall}</option>
                                                                <option value="email">{tr.followUpTypeEmail}</option>
                                                                <option value="interview">{tr.followUpTypeInterview}</option>
                                                                <option value="other">{tr.followUpTypeOther}</option>
                                                            </NativeSelect>
                                                            <div className="flex-1"/>
                                                            <Button size="sm" variant="outline" onClick={() => setFollowUpFormOpen(false)}>{tr.batchBindPositionCancel}</Button>
                                                            <Button size="sm" disabled={followUpSubmitting || !followUpContent.trim()} onClick={async () => {
                                                                setFollowUpSubmitting(true);
                                                                try {
                                                                    await createFollowUp(candidateDetail.candidate.id, followUpContent.trim(), followUpType);
                                                                    setFollowUpFormOpen(false);
                                                                    setFollowUpContent("");
                                                                } finally {
                                                                    setFollowUpSubmitting(false);
                                                                }
                                                            }}>
                                                                {followUpSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                                                {tr.batchBindPositionConfirm}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="mt-3 space-y-2">
                                                    {followUps.length > 0 ? followUps.map((fu) => {
                                                        const typeLabels: Record<string, string> = {note: tr.followUpTypeNote, call: tr.followUpTypeCall, email: tr.followUpTypeEmail, interview: tr.followUpTypeInterview, other: tr.followUpTypeOther};
                                                        return (
                                                            <div key={fu.id} className="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge variant="outline" className="rounded-full text-sm">{typeLabels[fu.follow_up_type] || fu.follow_up_type}</Badge>
                                                                            {fu.created_at && <span className="text-sm text-slate-400 dark:text-slate-500">{formatDateTime(fu.created_at)}</span>}
                                                                        </div>
                                                                        <p className="mt-1 text-base text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{fu.content}</p>
                                                                    </div>
                                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-500 hover:text-rose-700" onClick={() => { if (window.confirm(tr.confirmDeleteFollowUp)) void deleteFollowUp(fu.id); }}>
                                                                        <Trash2 className="h-3.5 w-3.5"/>
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        );
                                                    }) : (
                                                        <EmptyState title={tr.noFollowUps} description={tr.noFollowUpsDesc}/>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    ) : null}

                                    {candidateDetailPanel === "ai" ? (
                                        <>
                                            <div className="min-w-0 space-y-2">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <p className="text-base font-medium text-slate-900 dark:text-slate-100">{tr.aiScoreAndAdvice}</p>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setCandidateAiOutputDialogOpen(true)}
                                                        disabled={!candidateAiOutputAvailable}
                                                    >
                                                        <Bot className="h-4 w-4"/>
                                                        {tr.viewFullAiOutput}
                                                    </Button>
                                                </div>
                                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-4xl font-semibold text-slate-900 dark:text-slate-100">
                                                                    {candidateScoreDisplayValues.totalScore !== null
                                                                        ? formatScoreValue(
                                                                            candidateScoreDisplayValues.totalScore,
                                                                            candidateScoreDisplayValues.totalScoreScale,
                                                                        )
                                                                        : "-"}
                                                                </p>
                                                            <p className="mt-1 break-words text-base text-slate-500 dark:text-slate-400">
                                                                {tr.aiRecommendationLine(
                                                                    candidateScoreDecisionValues.recommendation || "-",
                                                                    labelForCandidateStatus(candidateScoreDecisionValues.suggestedStatus) || "-",
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                                            {candidateDetail.score?.score_validation_passed === false ? (
                                                                <Badge variant="outline" className="rounded-full border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                                                    {tr.scoreValidationWarnings}
                                                                </Badge>
                                                            ) : null}
                                                            <Badge variant="outline" className="rounded-full">
                                                                {tr.matchBadge} {candidateScoreDisplayValues.matchPercent !== null
                                                                    ? formatPercent(candidateScoreDisplayValues.matchPercent)
                                                                    : "-"}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    <div className="mt-4 space-y-3 text-base text-slate-600 dark:text-slate-300">
                                                        {Array.isArray(candidateDetail.score?.validation_warnings) && candidateDetail.score.validation_warnings.length > 0 ? (
                                                            <details className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/80 dark:bg-amber-950/30 dark:text-amber-200">
                                                                <summary className="cursor-pointer font-medium">{tr.viewScoreWarnings}</summary>
                                                                <ul className="mt-2 space-y-1">
                                                                    {candidateDetail.score.validation_warnings.map((item, index) => (
                                                                        <li key={`score-warning-${index}`} className="break-words leading-6">
                                                                            {index + 1}. {item}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </details>
                                                        ) : null}
                                                        <div className="space-y-2">
                                                            <p className="font-medium text-slate-900 dark:text-slate-100">{tr.strengths}</p>
                                                            {readScoreTextArray(candidateDetail.score?.advantages).length > 0 ? (
                                                                <ul className="space-y-1">
                                                                    {readScoreTextArray(candidateDetail.score?.advantages).map((item, index) => (
                                                                        <li key={`advantage-${index}`} className="break-words leading-7">
                                                                            {index + 1}. {item}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <p className="break-words leading-7">-</p>
                                                            )}
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="font-medium text-slate-900 dark:text-slate-100">{tr.risks}</p>
                                                            {readScoreTextArray(candidateDetail.score?.concerns).length > 0 ? (
                                                                <ul className="space-y-1">
                                                                    {readScoreTextArray(candidateDetail.score?.concerns).map((item, index) => (
                                                                        <li key={`concern-${index}`} className="break-words leading-7">
                                                                            {index + 1}. {item}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <p className="break-words leading-7">-</p>
                                                            )}
                                                        </div>
                                                        <div className="space-y-2">
                                                            <p className="font-medium text-slate-900 dark:text-slate-100">{isZh ? "综合能力概览" : "Competency Overview"}</p>
                                                            <CandidateRadarChart
                                                                dimensions={readScoreDimensions(candidateDetail.score?.dimensions)}
                                                                radarScores={candidateDetail.score?.radar_scores}
                                                                isZh={isZh}
                                                                mode="aggregated"
                                                                uiText={{
                                                                    scoreDetails: isZh ? "评分详情" : "Score Details",
                                                                    coreSkills: isZh ? "核心能力" : "Core Competencies",
                                                                    otherSkills: isZh ? "其他维度" : "Other Dimensions",
                                                                    noData: isZh ? "AI 尚未完成维度评分" : "No evaluation data",
                                                                    benchmark: isZh ? "岗位基准线" : "Benchmark",
                                                                }}
                                                            />
                                                            <p className="font-medium text-slate-900 dark:text-slate-100 mt-4">{isZh ? "各维度得分" : "Dimension Scores"}</p>
                                                            <CandidateRadarChart
                                                                dimensions={readScoreDimensions(candidateDetail.score?.dimensions)}
                                                                isZh={isZh}
                                                                mode="individual"
                                                                uiText={{
                                                                    scoreDetails: isZh ? "评分详情" : "Score Details",
                                                                    coreSkills: isZh ? "核心能力" : "Core Competencies",
                                                                    otherSkills: isZh ? "其他维度" : "Other Dimensions",
                                                                    noData: isZh ? "AI 尚未完成维度评分" : "No evaluation data",
                                                                    benchmark: isZh ? "岗位基准线" : "Benchmark",
                                                                }}
                                                            />
                                                            <p className="font-medium text-slate-900 dark:text-slate-100 mt-4">{tr.dimensionScores}</p>
                                                            {readScoreDimensions(candidateDetail.score?.dimensions).length > 0 ? (
                                                                <ul className="space-y-2">
                                                                    {readScoreDimensions(candidateDetail.score?.dimensions).map((item, index) => {
                                                                        const label = readScoreText(item.label) || "-";
                                                                        const scoreValue = readScoreNumberStrict(item.score);
                                                                        const maxScore = readScoreNumberStrict(item.max_score);
                                                                        const evidences = readDimensionEvidenceList(item.evidence);
                                                                        const reason = readScoreText(item.reason);
                                                                        const isInferred = item.is_inferred === true;
                                                                        const percent = scoreValue !== null && maxScore !== null && maxScore > 0
                                                                            ? Math.min(100, Math.round((scoreValue / maxScore) * 100))
                                                                            : null;
                                                                        return (
                                                                            <li key={`dimension-${index}`} className="rounded-xl border border-slate-200/70 px-3 py-3 dark:border-slate-800">
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                    <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                                                                                        {label}
                                                                                        {isInferred ? <span className="ml-1 text-sm text-slate-400 dark:text-slate-500">{tr.inferredDimension}</span> : null}
                                                                                    </p>
                                                                                    <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                                                                                        {scoreValue !== null ? scoreValue : "-"} / {maxScore !== null ? maxScore : "-"}
                                                                                    </p>
                                                                                </div>
                                                                                {percent !== null && (
                                                                                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                                                                        <div
                                                                                            className={`h-full rounded-full transition-all ${percent >= 80 ? "bg-emerald-500" : percent >= 60 ? "bg-blue-500" : percent >= 40 ? "bg-amber-500" : "bg-rose-500"}`}
                                                                                            style={{width: `${percent}%`}}
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                                {reason && (
                                                                                    <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                                                                        <p className="font-medium text-slate-700 dark:text-slate-200">{tr.dimensionReason}:</p>
                                                                                        <p className="mt-0.5 break-words">{reason}</p>
                                                                                    </div>
                                                                                )}
                                                                                <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                                                                    <p>{tr.evidence}:</p>
                                                                                    {evidences.length ? (
                                                                                        <ul className="mt-1 space-y-1">
                                                                                            {evidences.map((evidence, evidenceIndex) => (
                                                                                                <li key={`dimension-${index}-evidence-${evidenceIndex}`} className="break-words">
                                                                                                    {evidence}
                                                                                                </li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    ) : (
                                                                                        <p>-</p>
                                                                                    )}
                                                                                </div>
                                                                            </li>
                                                                        );
                                                                    })}
                                                                </ul>
                                                            ) : (
                                                                <p className="break-words leading-7">-</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <Field label={tr.screeningMemory}>
                                                {candidateDetail.workflow_memory ? (
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        <InfoTile label={tr.memorySource} value={labelForMemorySource(candidateDetail.workflow_memory.screening_memory_source)}/>
                                                        <InfoTile label={tr.lastScreeningTime} value={formatLongDateTime(candidateDetail.workflow_memory.last_screened_at)}/>
                                                        <InfoTile label={tr.screeningSkills} value={formatSkillNames(candidateDetail.workflow_memory.screening_skill_ids, skillMap, language)}/>
                                                        <InfoTile label={tr.interviewSkills} value={formatSkillNames(candidateDetail.workflow_memory.interview_skill_ids, skillMap, language)}/>
                                                    </div>
                                                ) : (
                                                    <EmptyState title={tr.noScreeningMemory} description={tr.noScreeningMemoryDesc}/>
                                                )}
                                                <p className="mt-3 break-words text-sm leading-6 text-slate-500 dark:text-slate-400">
                                                    {tr.screeningMemoryHint(effectiveScreeningSkillSourceLabel)}
                                                </p>
                                                <p className="mt-2 break-words text-sm leading-6 text-slate-500 dark:text-slate-400">
                                                    {tr.screeningSkillPreview(formatSkillNames(effectiveScreeningSkillIds, skillMap, language))}
                                                </p>
                                            </Field>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <Field label={tr.manualOverrideScore}>
                                                    <Input value={candidateEditor.manualOverrideScore} onChange={(event) => setCandidateEditor((current) => ({...current, manualOverrideScore: event.target.value}))} placeholder={tr.overrideScorePlaceholder}/>
                                                </Field>
                                                <Field label={tr.overrideReason}>
                                                    <Input value={candidateEditor.manualOverrideReason} onChange={(event) => setCandidateEditor((current) => ({...current, manualOverrideReason: event.target.value}))} placeholder={tr.overrideReasonPlaceholder}/>
                                                </Field>
                                            </div>

                                            <Field label={tr.hrFeedback}>
                                                <div className="space-y-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        {[
                                                            {value: "agree", label: tr.hrFeedbackAgree, activeClass: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"},
                                                            {value: "disagree", label: tr.hrFeedbackDisagree, activeClass: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"},
                                                            {value: "neutral", label: tr.hrFeedbackNeutral, activeClass: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"},
                                                        ].map((opt) => {
                                                            const isActive = candidateEditor.hrFeedback === opt.value;
                                                            return (
                                                                <Button
                                                                    key={opt.value}
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className={isActive ? opt.activeClass : ""}
                                                                    onClick={() => setCandidateEditor((current) => ({...current, hrFeedback: isActive ? "" : opt.value}))}
                                                                >
                                                                    {opt.label}
                                                                </Button>
                                                            );
                                                        })}
                                                    </div>
                                                    {candidateEditor.hrFeedback && (
                                                        <Input
                                                            value={candidateEditor.hrFeedbackReason}
                                                            onChange={(event) => setCandidateEditor((current) => ({...current, hrFeedbackReason: event.target.value}))}
                                                            placeholder={tr.hrFeedbackReasonPlaceholder}
                                                        />
                                                    )}
                                                </div>
                                            </Field>

                                            <Button onClick={() => void saveCandidate()} disabled={candidateSaving}>
                                                <Save className="h-4 w-4"/>
                                                {candidateSaving ? tr.savingCandidate : tr.saveCandidateInfo}
                                            </Button>

                                            <Field label={tr.aiAssistant}>
                                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-base font-medium text-slate-900 dark:text-slate-100">{tr.assistantPackedTitle}</p>
                                                            <p className="mt-1 break-words text-base leading-6 text-slate-500 dark:text-slate-400">
                                                                {candidateAssistantActivity.length
                                                                    ? tr.assistantPackedDescWithCount(candidateAssistantActivity.length)
                                                                    : tr.assistantPackedDescEmpty}
                                                            </p>
                                                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{tr.defaultInterviewSource(preferredInterviewSkillSourceLabel)}</p>
                                                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{tr.actualSource(effectiveInterviewSkillSourceLabel)}</p>
                                                        </div>
                                                        <Button size="sm" variant="outline" onClick={() => openAssistantMode("drawer")}>
                                                            <Bot className="h-4 w-4"/>
                                                            {tr.openAiAssistant}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </Field>

                                            <Field label={tr.aiExecutionLogs}>
                                                <div className="space-y-3">
                                                    {candidateProcessActivity.length ? (
                                                        <>
                                                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                                <div className="min-w-0">
                                                                    <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                                                                        {tr.recordedLogs(candidateProcessActivity.length)}
                                                                    </p>
                                                                    <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
                                                                        {tr.logsCollapsedHint}
                                                                    </p>
                                                                </div>
                                                                <Button size="sm" variant="outline" onClick={() => setCandidateProcessLogsExpanded((current) => !current)}>
                                                                    {candidateProcessLogsExpanded ? tr.collapseLogs : tr.expandLogs}
                                                                </Button>
                                                            </div>
                                                            {candidateProcessLogsExpanded ? candidateProcessActivity.map((log) => {
                                                                const logSkillSnapshots = resolveLogSkillSnapshots(log, skillMap);
                                                                return (
                                                                    <div key={log.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="text-base font-medium text-slate-900 dark:text-slate-100">{labelForTaskType(log.task_type)}</p>
                                                                                <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">{labelForProvider(log.model_provider)} · {log.model_name || "-"} · {formatLongDateTime(log.created_at)}</p>
                                                                            </div>
                                                                            <Badge className={cn("rounded-full border", statusBadgeClass("task", log.status))}>
                                                                                {labelForTaskExecutionStatus(log.status)}
                                                                            </Badge>
                                                                        </div>
                                                                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                                            <InfoTile label={tr.screeningSkills} value={formatSkillSnapshotNames(logSkillSnapshots, language)}/>
                                                                            <InfoTile label={tr.memorySource} value={labelForMemorySource(log.memory_source)}/>
                                                                        </div>
                                                                        {log.error_message ? (
                                                                            <p className="mt-3 break-all text-base text-rose-600">
                                                                                {sanitizeTaskMessage(
                                                                                    log.error_message,
                                                                                    log.task_type,
                                                                                    Boolean(log.status === "queued"),
                                                                                )}
                                                                            </p>
                                                                        ) : null}
                                                                        <OutputSnippet content={formatStructuredValue(
                                                                            log.output_snapshot,
                                                                            sanitizeTaskMessage(
                                                                                log.output_summary || tr.runningAwaitModel,
                                                                                log.task_type,
                                                                                Boolean(log.status === "queued"),
                                                                            ),
                                                                        )}/>
                                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                                            <Button size="sm" variant="outline" onClick={() => openTaskLogDetail(log.id)}>{tr.viewFullLog}</Button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }) : null}
                                                        </>
                                                    ) : (
                                                        <EmptyState title={tr.noAiLogs} description={tr.noAiLogsDesc}/>
                                                    )}
                                                </div>
                                            </Field>
                                        </>
                                    ) : null}

                                    {candidateDetailPanel === "interview" ? (
                                        <div className="space-y-4">
                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                                                            {primaryResumeFile ? primaryResumeFile.original_name : tr.noResumeFile}
                                                        </p>
                                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                            {primaryResumeFile
                                                                ? tr.resumeFileDesc(primaryResumeFile.file_ext || "-", primaryResumeFile.file_size || 0, primaryResumeFile.parse_status)
                                                                : tr.resumeFileEmptyDesc}
                                                        </p>
                                                    </div>
                                                    {primaryResumeFile ? (
                                                        <div className="flex flex-wrap gap-2">
                                                            <Button size="sm" variant="outline" onClick={() => previewResumeFile({ id: primaryResumeFile.id, original_name: primaryResumeFile.original_name }, candidateDetail.candidate.name)}>
                                                                <Eye className="mr-1 h-4 w-4"/>
                                                                {tr.viewOriginal}
                                                            </Button>
                                                            <Button size="sm" variant="outline" onClick={() => void openResumeFile(primaryResumeFile, true)}>{tr.downloadResume}</Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/80 dark:text-rose-200 dark:hover:bg-rose-950/30"
                                                                onClick={() => requestDeleteResumeFile(primaryResumeFile)}
                                                            >
                                                                <Trash2 className="h-4 w-4"/>
                                                                {tr.deleteResume}
                                                            </Button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                                {primaryResumeFile?.parse_error ? (
                                                    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                                                        {tr.parseErrorLine(primaryResumeFile.parse_error)}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70 space-y-3">
                                                <div className="grid gap-3">
                                                    <Input value={interviewRoundName} onChange={(event) => setInterviewRoundName(event.target.value)} placeholder={tr.roundPlaceholder}/>
                                                    <Input value={joinTags(effectiveInterviewSkillIds.map((id) => skillMap.get(id)?.name || ""))} readOnly placeholder={tr.currentSkillsPlaceholder}/>
                                                </div>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">{tr.defaultInterviewSource(preferredInterviewSkillSourceLabel)}</p>
                                                <Textarea
                                                    value={interviewCustomRequirements}
                                                    onChange={(event) => setInterviewCustomRequirements(event.target.value)}
                                                    rows={3}
                                                    placeholder={tr.interviewRequirementsPlaceholder}
                                                />
                                                <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                                                    {tr.actualSkills(formatSkillNames(effectiveInterviewSkillIds, skillMap, language))}
                                                </p>
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <p className="text-sm text-slate-500 dark:text-slate-400">{tr.actualSource(effectiveInterviewSkillSourceLabel)}</p>
                                                    {interviewSkillSelectionDirty ? (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setSelectedInterviewSkillIds([]);
                                                                setInterviewSkillSelectionDirty(false);
                                                            }}
                                                        >
                                                            {tr.restoreDefaultSkills}
                                                        </Button>
                                                    ) : null}
                                                </div>
                                                <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                                                    {!interviewSkillSelectionDirty
                                                        ? tr.interviewSkillHintDefault
                                                        : tr.interviewSkillHintManual}
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {skills.map((skill) => (
                                                        <button
                                                            key={skill.id}
                                                            type="button"
                                                            className={cn(
                                                                "rounded-full border px-3 py-2 text-sm transition",
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
                                            </div>

                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                                                {latestInterviewQuestion ? (
                                                    <InterviewQuestionCard
                                                        question={latestInterviewQuestion}
                                                        onDownload={() => void downloadInterviewQuestion(latestInterviewQuestion.id)}
                                                        onPreview={() => {
                                                            const blob = new Blob([latestInterviewQuestion.html_content], {type: "text/html"});
                                                            const previewUrl = URL.createObjectURL(blob);
                                                            window.open(previewUrl, "_blank", "noopener,noreferrer");
                                                            window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
                                                        }}
                                                    />
                                                ) : (
                                                    <EmptyState title={tr.noInterviewQuestions} description={tr.noInterviewQuestionsDesc}/>
                                                )}
                                            </div>

                                            <div className="rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-base font-medium text-slate-900 dark:text-slate-100">{tr.interviewSchedules}</p>
                                                    <Button size="sm" variant="outline" onClick={() => { setScheduleForm({round_name: interviewRoundName || defaultRoundName, interviewer_name: "", scheduled_at: "", duration_minutes: "60", location: "", meeting_link: "", notes: ""}); setScheduleFormOpen(!scheduleFormOpen); }}>
                                                        <Plus className="h-4 w-4"/>
                                                        {tr.addSchedule}
                                                    </Button>
                                                </div>
                                                {scheduleFormOpen && candidateDetail && (
                                                    <div className="mt-3 space-y-2 rounded-xl border border-slate-200/70 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                                                        <div className="grid gap-2 md:grid-cols-2">
                                                            <Input value={scheduleForm.round_name} onChange={(e) => setScheduleForm((f) => ({...f, round_name: e.target.value}))} placeholder={tr.scheduleRound}/>
                                                            <Input value={scheduleForm.interviewer_name} onChange={(e) => setScheduleForm((f) => ({...f, interviewer_name: e.target.value}))} placeholder={tr.scheduleInterviewer}/>
                                                            <Input type="datetime-local" value={scheduleForm.scheduled_at} onChange={(e) => setScheduleForm((f) => ({...f, scheduled_at: e.target.value}))} placeholder={tr.scheduleTime}/>
                                                            <Input type="number" value={scheduleForm.duration_minutes} onChange={(e) => setScheduleForm((f) => ({...f, duration_minutes: e.target.value}))} placeholder={tr.scheduleDuration}/>
                                                            <Input value={scheduleForm.location} onChange={(e) => setScheduleForm((f) => ({...f, location: e.target.value}))} placeholder={tr.scheduleLocation}/>
                                                            <Input value={scheduleForm.meeting_link} onChange={(e) => setScheduleForm((f) => ({...f, meeting_link: e.target.value}))} placeholder={tr.scheduleMeetingLink}/>
                                                        </div>
                                                        <Textarea value={scheduleForm.notes} onChange={(e) => setScheduleForm((f) => ({...f, notes: e.target.value}))} rows={2} placeholder={tr.scheduleNotes}/>
                                                        <div className="flex justify-end gap-2">
                                                            <Button size="sm" variant="outline" onClick={() => setScheduleFormOpen(false)}>{tr.batchBindPositionCancel}</Button>
                                                            <Button size="sm" disabled={scheduleSubmitting} onClick={async () => {
                                                                setScheduleSubmitting(true);
                                                                try {
                                                                    await createInterviewSchedule({
                                                                        candidate_id: candidateDetail.candidate.id,
                                                                        round_name: scheduleForm.round_name || undefined,
                                                                        interviewer_name: scheduleForm.interviewer_name || undefined,
                                                                        scheduled_at: scheduleForm.scheduled_at ? new Date(scheduleForm.scheduled_at).toISOString() : undefined,
                                                                        duration_minutes: scheduleForm.duration_minutes ? Number(scheduleForm.duration_minutes) : undefined,
                                                                        location: scheduleForm.location || undefined,
                                                                        meeting_link: scheduleForm.meeting_link || undefined,
                                                                        notes: scheduleForm.notes || undefined,
                                                                    });
                                                                    setScheduleFormOpen(false);
                                                                } finally {
                                                                    setScheduleSubmitting(false);
                                                                }
                                                            }}>
                                                                {scheduleSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                                                {tr.batchBindPositionConfirm}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="mt-3 space-y-2">
                                                    {interviewSchedules.length > 0 ? interviewSchedules.map((schedule) => (
                                                        <div key={schedule.id} className="rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-base font-medium text-slate-900 dark:text-slate-100">
                                                                        {schedule.round_name}
                                                                        {schedule.interviewer_name ? ` · ${schedule.interviewer_name}` : ""}
                                                                    </p>
                                                                    {schedule.scheduled_at && (
                                                                        <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                                                                            <Calendar className="h-3 w-3"/>
                                                                            {new Date(schedule.scheduled_at).toLocaleString()}
                                                                            {schedule.duration_minutes ? ` (${schedule.duration_minutes} min)` : ""}
                                                                        </p>
                                                                    )}
                                                                    {schedule.location && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{schedule.location}</p>}
                                                                    {schedule.meeting_link && <p className="mt-0.5 text-sm text-blue-600 dark:text-blue-400 truncate">{schedule.meeting_link}</p>}
                                                                    {schedule.notes && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{schedule.notes}</p>}
                                                                </div>
                                                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-500 hover:text-rose-700" onClick={() => { if (window.confirm(tr.confirmDeleteSchedule)) void deleteInterviewSchedule(schedule.id); }}>
                                                                    <Trash2 className="h-3.5 w-3.5"/>
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )) : (
                                                        <EmptyState title={tr.noSchedules} description={tr.noSchedulesDesc}/>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full min-h-0 flex-1 flex-col">
                            <div className="border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
                                <div className="space-y-1.5">
                                    <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{tr.candidateWorkspace}</h3>
                                    <p className="text-base text-slate-500 dark:text-slate-400">{tr.candidateWorkspaceDesc}</p>
                                </div>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                                <div className="space-y-5 px-5 py-5">
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {candidateOverviewStats.map((item) => (
                                            <InfoTile key={item.label} label={item.label} value={item.value}/>
                                        ))}
                                    </div>

                                    <Field label={tr.recentCandidates}>
                                        <div className="space-y-3">
                                            {candidatesLoading || !candidatesInitialLoaded ? (
                                                <div className="flex items-center justify-center py-8">
                                                    <LoadingPanel label={tr.loadingCandidateList}/>
                                                </div>
                                            ) : recentVisibleCandidates.length ? recentVisibleCandidates.map((candidate) => (
                                                <button
                                                    key={candidate.id}
                                                    type="button"
                                                    className="flex w-full items-start justify-between rounded-2xl border border-slate-200/80 px-4 py-4 text-left transition hover:border-slate-400 dark:border-slate-800"
                                                    onClick={() => setSelectedCandidateId(candidate.id)}
                                                >
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-slate-900 dark:text-slate-100">{candidate.name}</p>
                                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                            {candidate.position_title || tr.unassignedPosition} · {labelForCandidateStatus(resolveCandidateDisplayStatus(candidate))} · {tr.matchBadge} {formatPercent(resolveCandidateSummaryMatchPercent(candidate))}
                                                        </p>
                                                        {candidate.ai_potential_position ? (
                                                            <p className="mt-1 text-sm text-sky-600 dark:text-sky-300">
                                                                {`${isZh ? "转岗潜力" : "Potential Transition"}：${candidate.ai_potential_position}`}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <p className="shrink-0 text-sm text-slate-500 dark:text-slate-400">{formatDateTime(candidate.updated_at)}</p>
                                                </button>
                                            )) : (
                                                <EmptyState title={tr.noCandidates} description={tr.noCandidatesDesc}/>
                                            )}
                                        </div>
                                    </Field>

                                    <Field label={tr.recommendedActions}>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                <p className="text-base font-medium text-slate-900 dark:text-slate-100">{tr.continueFiltering}</p>
                                                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{tr.continueFilteringDesc}</p>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                                <p className="text-base font-medium text-slate-900 dark:text-slate-100">{tr.batchHandleResults}</p>
                                                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{tr.batchHandleResultsDesc}</p>
                                            </div>
                                        </div>
                                    </Field>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>
                </div>
                </div>
            </div>
            <CandidateAiOutputDialog
                open={candidateAiOutputDialogOpen}
                onOpenChange={setCandidateAiOutputDialogOpen}
                markdown={candidateAiOutputPayload.markdown}
                raw={candidateAiOutputPayload.raw}
                modelLabel={latestResumeScoreLog ? `${labelForProvider(latestResumeScoreLog.model_provider)} / ${latestResumeScoreLog.model_name || tr.unrecorded}` : null}
                generatedAt={latestResumeScoreLog?.created_at || candidateDetail?.score?.updated_at || candidateDetail?.score?.created_at}
            />
            <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{isZh ? "导出候选人" : "Export Candidates"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-base text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                            {isZh ? `将导出 ${selectedCandidateIds.length} 位候选人，可自定义字段，并选择是否打包原始简历。` : `Export ${selectedCandidateIds.length} candidates with custom fields and optional resume files.`}
                        </div>
                        <label className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={exportIncludeResumes}
                                onChange={(event) => setExportIncludeResumes(event.target.checked)}
                            />
                            <span>{isZh ? "同时导出原始简历文件" : "Include original resume files"}</span>
                        </label>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-base font-medium text-slate-700 dark:text-slate-300">{isZh ? "导出字段" : "Export Fields"}</p>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setExportFieldKeys(defaultExportFieldKeys)}
                                >
                                    {isZh ? "恢复默认字段" : "Reset Defaults"}
                                </Button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {exportFieldOptions.map((field) => {
                                    const checked = exportFieldKeys.includes(field.key);
                                    return (
                                        <label key={`export-field-${field.key}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-base text-slate-700 dark:border-slate-800 dark:text-slate-300">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(event) => {
                                                    const nextChecked = event.target.checked;
                                                    setExportFieldKeys((current) => {
                                                        if (nextChecked) {
                                                            return Array.from(new Set([...current, field.key]));
                                                        }
                                                        if (current.length <= 1) {
                                                            return current;
                                                        }
                                                        return current.filter((item) => item !== field.key);
                                                    });
                                                }}
                                            />
                                            <span>{field.label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                                {tr.batchBindPositionCancel}
                            </Button>
                            <Button
                                disabled={!exportFieldKeys.length || exporting}
                                onClick={async () => {
                                    await exportCandidates(selectedCandidateIds, {
                                        includeResumes: exportIncludeResumes,
                                        fields: exportFieldKeys,
                                    });
                                    setExportDialogOpen(false);
                                }}
                            >
                                {exporting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                {tr.exportCandidates}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={batchBindDialogOpen} onOpenChange={setBatchBindDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{tr.batchBindPositionTitle}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <NativeSelect value={batchBindPositionId} onChange={(event) => setBatchBindPositionId(event.target.value)}>
                            <option value="">{tr.unassignedPosition}</option>
                            {positions.map((p) => (
                                <option key={p.id} value={String(p.id)}>{p.title}</option>
                            ))}
                        </NativeSelect>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setBatchBindDialogOpen(false)}>
                                {tr.batchBindPositionCancel}
                            </Button>
                            <Button
                                disabled={batchBindSubmitting}
                                onClick={async () => {
                                    setBatchBindSubmitting(true);
                                    try {
                                        await batchBindPosition(selectedCandidateIds, batchBindPositionId ? Number(batchBindPositionId) : null);
                                        setBatchBindDialogOpen(false);
                                    } finally {
                                        setBatchBindSubmitting(false);
                                    }
                                }}
                            >
                                {batchBindSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                {tr.batchBindPositionConfirm}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <Dialog open={batchStatusDialogOpen} onOpenChange={setBatchStatusDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{tr.batchUpdateStatusTitle}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <p className="text-base font-medium text-slate-700 dark:text-slate-300">{tr.batchUpdateStatusLabel}</p>
                            <NativeSelect value={batchStatusValue} onChange={(event) => setBatchStatusValue(event.target.value)}>
                                <option value="" disabled>{tr.batchUpdateStatusSelectPlaceholder}</option>
                                {Object.entries(candidateStatusLabels).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </NativeSelect>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-base font-medium text-slate-700 dark:text-slate-300">{tr.batchUpdateStatusReason}</p>
                            <Textarea
                                value={batchStatusReason}
                                onChange={(event) => setBatchStatusReason(event.target.value)}
                                rows={3}
                                placeholder={tr.batchUpdateStatusReasonPlaceholder}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setBatchStatusDialogOpen(false)}>
                                {tr.batchBindPositionCancel}
                            </Button>
                            <Button
                                disabled={batchStatusSubmitting || !batchStatusValue}
                                onClick={async () => {
                                    setBatchStatusSubmitting(true);
                                    try {
                                        await batchUpdateStatus(selectedCandidateIds, batchStatusValue, batchStatusReason);
                                        setBatchStatusDialogOpen(false);
                                    } finally {
                                        setBatchStatusSubmitting(false);
                                    }
                                }}
                            >
                                {batchStatusSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : null}
                                {tr.batchUpdateStatusConfirm}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
