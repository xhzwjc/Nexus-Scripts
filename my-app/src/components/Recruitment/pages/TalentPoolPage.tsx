"use client";

import React from "react";
import {
    Briefcase,
    Building2,
    Clock3,
    Check,
    Eye,
    GraduationCap,
    Loader2,
    Phone,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    Square,
    Trash2,
    Upload,
    Users,
} from "lucide-react";

import {
    type CandidateSummary,
    type PositionSummary,
    triggerAIPositionMatch,
} from "@/lib/recruitment-api";
import {getCurrentLanguage, useI18n} from "@/lib/i18n";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
    isTalentPoolReidentifiable,
    formatDateTime,
    resolveTalentPoolDisplayStatus,
    sanitizeCandidateFacingErrorText,
} from "../utils";

function getTalentPoolLocale(language = getCurrentLanguage()) {
    const isZh = language !== "en-US";
    return {
        title: isZh ? "人才库" : "Talent Pool",
        description: isZh ? "未分配岗位的候选人，可按 AI 识别标签批量分配岗位" : "Candidates without assigned positions, batch assign by AI-recognized tags",
        uploadResume: isZh ? "上传简历" : "Upload Resume",
        refresh: isZh ? "刷新" : "Refresh",
        totalCandidates: isZh ? "总候选人" : "Total Candidates",
        totalHint: isZh ? "当前人才库" : "Current talent pool",
        matchingStat: isZh ? "识别中" : "Identifying",
        matchingStatHint: isZh ? "AI处理中" : "AI in progress",
        pendingAction: isZh ? "待处理" : "Action Needed",
        pendingActionHint: isZh ? "未匹配+异常" : "No match + errors",
        noSystemPosition: isZh ? "未匹配岗位" : "No Position Match",
        noSystemPositionHint: isZh ? "需手动分配" : "Manual assignment",
        identifyError: isZh ? "识别异常" : "AI Errors",
        identifyErrorHint: isZh ? "可重新识别" : "Can re-identify",
        newThisWeek: isZh ? "本周入库" : "Added This Week",
        newThisWeekHint: isZh ? "最近 7 天入库" : "Added in last 7 days",
        activeStatFilter: (label: string) => isZh ? `正在查看：${label}` : `Viewing: ${label}`,
        clearStatFilter: isZh ? "再次点击指标可恢复全部" : "Click the metric again to show all",
        statSelectHint: isZh ? "点击指标筛选列表，选中后再次点击恢复全部" : "Click a metric to filter; click it again to show all",
        statFiltering: isZh ? "筛选中" : "Filtering",
        updatingList: isZh ? "正在更新列表" : "Updating list",
        searchPlaceholder: isZh ? "搜索候选人姓名、技能…" : "Search candidates by name, skills...",
        allSources: isZh ? "全部来源" : "All Sources",
        allTags: isZh ? "全部标签" : "All Tags",
        sortByTime: isZh ? "入库时间 ↓" : "Talent Pool Time ↓",
        sortByName: isZh ? "姓名 A-Z" : "Name A-Z",
        sortByNameDesc: isZh ? "姓名 Z-A" : "Name Z-A",
        selectedCount: (n: number) => isZh ? `已选 ${n} 人` : `${n} selected`,
        clearSelection: isZh ? "清空选择" : "Clear Selection",
        batchAssign: isZh ? "批量分配岗位" : "Batch Assign Position",
        batchReIdentify: isZh ? "批量重新识别" : "Batch Re-identify",
        batchDelete: isZh ? "批量删除" : "Batch Delete",
        reIdentifyConfirmTitle: isZh ? "确认重新识别岗位" : "Confirm Re-identification",
        reIdentifyConfirmDescription: (count: number) => isZh
            ? `将对 ${count} 位人才重新识别匹配岗位。`
            : `Re-identify matching positions for ${count} talent record(s).`,
        reIdentifyConfirmWarning: isZh
            ? "已选择的数据中包含非待识别人才。确认后这些人才也会重新进入岗位识别流程，原有来源阶段可能随新的识别结果更新。"
            : "The selection includes records that are not pending identification. Confirming will send them through position matching again, and their source stage may update with the new result.",
        reIdentifyConfirmIncludes: isZh ? "本次包含" : "Included",
        reIdentifyConfirmCandidates: isZh ? "涉及人才" : "Candidates",
        reIdentifyConfirmMore: (count: number) => isZh ? `等 ${count} 人` : `and ${count} more`,
        confirmReIdentify: isZh ? "确认重新识别" : "Confirm Re-identify",
        aiRecognized: isZh ? "AI 识别" : "AI Match",
        unmatchedGroup: isZh ? "无法识别岗位" : "Unmatched",
        selectAllGroup: isZh ? "全选此分组" : "Select All",
        oneClickAssign: isZh ? "一键分配到此岗位" : "Assign to This Position",
        confirmMatch: isZh ? "确认归岗" : "Confirm",
        changePosition: isZh ? "换岗位" : "Reassign",
        reIdentify: isZh ? "重新识别" : "Re-identify",
        reIdentifying: isZh ? "识别中…" : "Identifying...",
        manualAssign: isZh ? "手动分配" : "Manual Assign",
        view: isZh ? "查看" : "View",
        aiIdentified: isZh ? "AI 已识别" : "AI Matched",
        pendingIdentify: isZh ? "待识别" : "Pending",
        matching: isZh ? "匹配中" : "Matching",
        aiMatchingGroup: isZh ? "AI 匹配中" : "AI Matching",
        aiMatchingHint: isZh ? "AI 正在分析简历匹配岗位，请稍候…" : "AI is analyzing resume to match positions...",
        aiRecommendInto: (title: string) => isZh ? `AI 推荐归入：${title}` : `AI recommends: ${title}`,
        aiNoMatch: isZh ? "AI 未能匹配到系统现有岗位，请手动分配" : "AI could not match to existing positions, please assign manually",
        aiStillNoMatch: isZh ? "重新识别后仍未找到匹配岗位" : "Still no match after re-identification",
        stopMatch: isZh ? "停止匹配" : "Stop",
        pendingGroup: isZh ? "待处理" : "Pending",
        archivedGroup: isZh ? "人才库中" : "In Talent Pool",
        pendingGroupDesc: isZh ? "AI 未找到岗位，可重新识别或手动分配" : "AI did not find a position. Re-identify or assign manually.",
        archivedGroupDesc: isZh ? "已进入人才库，可按来源阶段继续分配岗位" : "Already in the talent pool and ready for reassignment.",
        archived: isZh ? "人才库中" : "In Talent Pool",
        aiErrorDesc: isZh ? "AI 识别异常，请重新识别" : "AI error, please re-identify",
        autoArchivedDesc: isZh ? "初筛完成，系统自动归入" : "Auto-archived after screening",
        movedByHRDesc: (by: string, date: string, from: string) => isZh
            ? `由 ${by} 于 ${date} 归入，来自：${from}`
            : `Moved by ${by} on ${date}, from: ${from}`,
        sourceStage: isZh ? "来源阶段" : "Source Stage",
        enteredAt: isZh ? "入库时间" : "Added",
        uploadedAt: isZh ? "上传时间" : "Uploaded",
        sourceAiUnmatched: isZh ? "AI 未识别岗位" : "AI Unmatched",
        sourceAiError: isZh ? "AI 识别异常" : "AI Error",
        sourceScreeningArchived: isZh ? "初筛完成后入库" : "Archived After Screening",
        sourceLegacyArchived: isZh ? "历史人才库数据" : "Legacy Talent Pool Record",
        candidatesCount: (count: number) => isZh ? `${count} 人` : `${count}`,
        noCandidates: isZh ? "人才库暂无候选人" : "No candidates in talent pool",
        noCandidatesDesc: isZh ? '上传简历时选择「暂不选择岗位」或「AI智能匹配」，未匹配的候选人将出现在这里' : 'Candidates will appear here when uploaded with "No Position" or "AI Smart Match" mode',
        noFilteredCandidates: isZh ? "当前指标下暂无候选人" : "No candidates for this metric",
        noFilteredCandidatesDesc: isZh ? "再次点击上方指标可恢复全部人才库" : "Click the selected metric again to show all candidates",
        currentView: isZh ? "当前工作列表" : "Current Worklist",
        visibleResultCount: (shown: number, total: number) => isZh ? `已显示 ${shown} / ${total} 人` : `${shown} / ${total} shown`,
        selectAllVisible: isZh ? "全选当前列表" : "Select visible",
        pageRange: (start: number, end: number, total: number) => (
            isZh ? `${start}-${end} / 共 ${total} 条` : `${start}-${end} of ${total}`
        ),
        rowsPerPage: isZh ? "条/页" : "Rows/Page",
        previousPage: isZh ? "上一页" : "Previous",
        nextPage: isZh ? "下一页" : "Next",
        manualUpload: isZh ? "手动上传" : "Manual",
        bossZhipin: isZh ? "Boss直聘" : "Boss",
        liepin: isZh ? "猎聘" : "Liepin",
        headhunter: isZh ? "猎头推荐" : "Headhunter",
        otherSource: isZh ? "其他" : "Other",
        deleteConfirmTitle: isZh ? "确认删除" : "Confirm Delete",
        deleteConfirmMsg: (n: number) => isZh
            ? `确认删除已选 ${n} 位候选人？此操作不可撤销，简历数据将被永久移除。`
            : `Delete ${n} candidate(s)? This cannot be undone. Resume data will be permanently removed.`,
        cancel: isZh ? "取消" : "Cancel",
        confirm: isZh ? "确认" : "Confirm",
        confirmAssign: isZh ? "确认分配" : "Confirm Assign",
        selectPosition: isZh ? "请选择岗位" : "Select a position",
        drawerTitle: isZh ? "候选人详情" : "Candidate Details",
        experience: isZh ? "经验" : "Experience",
        education: isZh ? "学历" : "Education",
        contact: isZh ? "联系方式" : "Contact",
        workExperience: isZh ? "工作经历" : "Work Experience",
        skills: isZh ? "技能" : "Skills",
        resumeContent: isZh ? "简历内容" : "Resume Content",
        noResumeContent: isZh ? "暂无解析内容" : "No parsed content available",
        screeningPosition: isZh ? "初筛岗位" : "Screening Position",
        aiRecommendedPosition: isZh ? "AI推荐岗位" : "AI Recommended Position",
        potentialDirection: isZh ? "转岗潜力方向" : "Potential Transition Direction",
        potentialReason: isZh ? "潜力原因" : "Potential Reason",
        expandReason: isZh ? "展开原因" : "Show reason",
        collapseReason: isZh ? "收起原因" : "Hide reason",
    };
}

type TalentPoolPageProps = {
    candidates: CandidateSummary[];
    positions: PositionSummary[];
    loading: boolean;
    onAssignPosition: (candidateIds: number[], positionId: number | null) => Promise<void>;
    onCreatePosition: (suggestedTitle: string) => void;
    onViewCandidate: (candidateId: number) => void;
    onDeleteCandidates?: (candidateIds: number[]) => Promise<void>;
    onRefresh?: () => void | Promise<void>;
    onUploadResume?: () => void;
    onReIdentify?: (candidateId: number) => Promise<void>;
    onBatchReIdentify?: (candidateIds: number[]) => Promise<void>;
    onCancelMatch?: (candidateId: number) => Promise<void>;
    total?: number;
    stats?: TalentPoolStats | null;
    availableTags?: string[];
    onQueryChange?: (query: TalentPoolQuery) => void | Promise<void>;
    pageIndex: number;
    pageSize: number;
    pageSizeOptions: number[];
    setPageIndex: (pageIndex: number) => void;
    setPageSize: (pageSize: number) => void;
    panelClass?: string;
    preferredStatFilter?: TalentPoolStatFilter | null;
    onPreferredStatFilterApplied?: () => void;
};

/* ── 人才库头像统一中性色，避免列表里出现随机彩色噪音 ── */
const AVATAR_COLORS = ["av-neutral"] as const;

function avatarColorIndex(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return Math.abs(hash) % AVATAR_COLORS.length;
}

function avatarInitial(name: string) {
    const clean = name.replace(/[^一-龥a-zA-Z\s]/g, "").trim();
    if (!clean) return "?";
    if (/[\u4e00-\u9fff]/.test(clean)) return clean.slice(-1);
    return clean.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const AVATAR_BG: Record<string, string> = {
    "av-neutral": "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
};

function sourceLabel(source: string | null | undefined, tr: ReturnType<typeof getTalentPoolLocale>) {
    if (!source) return tr.manualUpload;
    const map: Record<string, string> = {
        manual_upload: tr.manualUpload,
        boss_zhipin: tr.bossZhipin,
        liepin: tr.liepin,
        headhunter: tr.headhunter,
        other: tr.otherSource,
    };
    return map[source] || source;
}

type TalentPoolStatFilter = "all" | "matching" | "pending" | "no_match" | "ai_error" | "week_new";
type TalentPoolStats = {
    total: number;
    matching: number;
    pending_action: number;
    no_system_position: number;
    identify_error: number;
    week_new: number;
};
type TalentPoolQuery = {
    statFilter: TalentPoolStatFilter;
    searchQuery: string;
    sourceFilter: string;
    tagFilter: string;
    sortBy: "time" | "name" | "name_desc";
};

function isTalentPoolMatching(candidate: CandidateSummary) {
    return String(candidate.status || "").trim().toLowerCase() === "matching";
}

function talentPoolReason(candidate: CandidateSummary) {
    return String(candidate.talent_pool_reason || "").trim().toLowerCase();
}

function isNoSystemPositionCandidate(candidate: CandidateSummary) {
    return talentPoolReason(candidate) === "unmatched_by_ai";
}

function isIdentifyErrorCandidate(candidate: CandidateSummary) {
    return talentPoolReason(candidate) === "ai_error";
}

function isPendingActionCandidate(candidate: CandidateSummary) {
    return isNoSystemPositionCandidate(candidate) || isIdentifyErrorCandidate(candidate);
}

function isTalentPoolReidentifyTarget(candidate?: CandidateSummary | null) {
    return String(candidate?.status || "").trim().toLowerCase() !== "matching";
}

function needsTalentPoolReidentifyConfirmation(candidate?: CandidateSummary | null) {
    return Boolean(candidate && isTalentPoolReidentifyTarget(candidate) && !isTalentPoolReidentifiable(candidate));
}

function talentPoolCandidateName(candidate: CandidateSummary) {
    const name = String(candidate.name || "").trim() || `ID:${candidate.id}`;
    const code = String(candidate.candidate_code || "").trim();
    return code ? `${name}（${code}）` : name;
}

function talentPoolSourceStageLabel(candidate: CandidateSummary, tr: ReturnType<typeof getTalentPoolLocale>) {
    const reason = String(candidate.talent_pool_reason || "").trim().toLowerCase();
    if (reason === "unmatched_by_ai") {
        return tr.sourceAiUnmatched;
    }
    if (reason === "ai_error") {
        return tr.sourceAiError;
    }
    if (reason === "auto_archived") {
        return tr.sourceScreeningArchived;
    }
    if (reason === "moved_by_hr") {
        const sourceLabel = STATUS_LABEL_MAP[candidate.talent_pool_source_status || ""] || candidate.talent_pool_source_status || "";
        return sourceLabel ? sourceLabel : tr.archived;
    }
    return tr.sourceLegacyArchived;
}

function talentPoolReidentifyGroupLabel(candidate: CandidateSummary, tr: ReturnType<typeof getTalentPoolLocale>) {
    const normalizedStatus = String(candidate.status || "").trim().toLowerCase();
    const reason = String(candidate.talent_pool_reason || "").trim().toLowerCase();
    if (normalizedStatus === "matching") {
        return tr.matching;
    }
    if (reason === "unmatched_by_ai") {
        return tr.pendingIdentify;
    }
    if (reason === "ai_error") {
        return tr.identifyError;
    }
    return talentPoolSourceStageLabel(candidate, tr);
}

function resolveTalentPoolEnteredAt(candidate: CandidateSummary) {
    return candidate.talent_pool_moved_at || candidate.created_at || candidate.updated_at || null;
}

function isRecentTalentPoolCandidate(candidate: CandidateSummary, cutoffMs: number) {
    const enteredAt = resolveTalentPoolEnteredAt(candidate);
    const enteredAtMs = enteredAt ? Date.parse(enteredAt) : Number.NaN;
    return Number.isFinite(enteredAtMs) && enteredAtMs >= cutoffMs;
}

function matchesTalentPoolStatFilter(candidate: CandidateSummary, filter: TalentPoolStatFilter, cutoffMs: number) {
    if (filter === "all") return true;
    if (filter === "matching") return isTalentPoolMatching(candidate);
    if (filter === "pending") return isPendingActionCandidate(candidate);
    if (filter === "no_match") return isNoSystemPositionCandidate(candidate);
    if (filter === "ai_error") return isIdentifyErrorCandidate(candidate);
    if (filter === "week_new") return isRecentTalentPoolCandidate(candidate, cutoffMs);
    return true;
}

const STATUS_LABEL_MAP: Record<string, string> = {
    pending_screening: "待初筛",
    screening_running: "初筛中",
    screening_passed: "初筛通过",
    screening_rejected: "初筛淘汰",
    pending_interview: "待面试",
    interview_passed: "面试通过",
    interview_rejected: "面试淘汰",
    pending_offer: "待发offer",
    offer_sent: "已发offer",
    hired: "已入职",
    new_imported: "新导入",
    matching: "匹配中",
    unmatched: "待识别",
    talent_pool: "人才库",
};

/* ════════════════════════════════════════════════════════════════
 * 主组件
 * ════════════════════════════════════════════════════════════════ */
export function TalentPoolPage({
    candidates,
    positions,
    loading,
    onAssignPosition,
    onCreatePosition,
    onViewCandidate,
    onDeleteCandidates,
    onRefresh,
    onUploadResume,
    onReIdentify,
    onBatchReIdentify,
    onCancelMatch,
    total,
    stats: serverStats,
    availableTags: serverAvailableTags,
    onQueryChange,
    pageIndex,
    pageSize,
    pageSizeOptions,
    setPageIndex,
    setPageSize,
    preferredStatFilter,
    onPreferredStatFilterApplied,
}: TalentPoolPageProps) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getTalentPoolLocale(language), [language]);
    const isZh = language === "zh-CN";

    /* ── 筛选/排序状态 ── */
    const [searchQuery, setSearchQuery] = React.useState("");
    const [sourceFilter, setSourceFilter] = React.useState("all");
    const [tagFilter, setTagFilter] = React.useState("all");
    const [sortBy, setSortBy] = React.useState<"time" | "name" | "name_desc">("time");
    const [activeStatFilter, setActiveStatFilter] = React.useState<TalentPoolStatFilter>(() => preferredStatFilter || "pending");
    const [statFilterPending, setStatFilterPending] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
    const [initialLoadComplete, setInitialLoadComplete] = React.useState(candidates.length > 0);
    const statFilterTimerRef = React.useRef<number | null>(null);
    const queryChangeInitializedRef = React.useRef(false);
    const onQueryChangeRef = React.useRef(onQueryChange);
    const hasSeenInitialLoadingRef = React.useRef(false);

    /* ── 弹窗状态 ── */
    const [assignDialogOpen, setAssignDialogOpen] = React.useState(false);
    const [assignPositionId, setAssignPositionId] = React.useState("");
    const [assigning, setAssigning] = React.useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [singleAssignOpen, setSingleAssignOpen] = React.useState(false);
    const [singleAssignCandidateId, setSingleAssignCandidateId] = React.useState<number | null>(null);
    const [singleAssignPositionId, setSingleAssignPositionId] = React.useState("");
    const [singleAssigning, setSingleAssigning] = React.useState(false);
    const [reIdentifyConfirmOpen, setReIdentifyConfirmOpen] = React.useState(false);
    const [reIdentifyConfirmMode, setReIdentifyConfirmMode] = React.useState<"single" | "batch">("batch");
    const [reIdentifyConfirmCandidates, setReIdentifyConfirmCandidates] = React.useState<CandidateSummary[]>([]);
    const [reIdentifyConfirmSubmitting, setReIdentifyConfirmSubmitting] = React.useState(false);

    /* ── 重新识别 loading ── */
    const [reIdentifyingIds, setReIdentifyingIds] = React.useState<Set<number>>(new Set());
    const [reIdentifyFailedIds, setReIdentifyFailedIds] = React.useState<Set<number>>(new Set());

    /* ── 刷新 loading ── */
    const [refreshing, setRefreshing] = React.useState(false);

    /* ── 统计 ── */
    const recentCutoffMs = React.useMemo(() => Date.now() - 7 * 24 * 60 * 60 * 1000, [candidates]);
    const localStats = React.useMemo(() => {
        const total = candidates.length;
        const matching = candidates.filter(isTalentPoolMatching).length;
        const noSystemPosition = candidates.filter(isNoSystemPositionCandidate).length;
        const identifyError = candidates.filter(isIdentifyErrorCandidate).length;
        const pendingAction = noSystemPosition + identifyError;
        const weekNew = candidates.filter(c => isRecentTalentPoolCandidate(c, recentCutoffMs)).length;
        return {
            total,
            matching,
            pending_action: pendingAction,
            no_system_position: noSystemPosition,
            identify_error: identifyError,
            week_new: weekNew,
        };
    }, [candidates, recentCutoffMs]);
    const stats = serverStats || localStats;

    const statCards = React.useMemo(() => ([
        { filter: "pending" as const, label: tr.pendingAction, value: stats.pending_action, hint: tr.pendingActionHint, tone: "amber" as const },
        { filter: "no_match" as const, label: tr.noSystemPosition, value: stats.no_system_position, hint: tr.noSystemPositionHint, tone: "orange" as const },
        { filter: "ai_error" as const, label: tr.identifyError, value: stats.identify_error, hint: tr.identifyErrorHint, tone: "rose" as const },
        { filter: "matching" as const, label: tr.matchingStat, value: stats.matching, hint: tr.matchingStatHint, tone: "sky" as const },
        { filter: "week_new" as const, label: tr.newThisWeek, value: stats.week_new, hint: tr.newThisWeekHint, tone: "emerald" as const },
        { filter: "all" as const, label: tr.totalCandidates, value: stats.total, hint: tr.totalHint, tone: "slate" as const },
    ]), [stats.identify_error, stats.matching, stats.no_system_position, stats.pending_action, stats.total, stats.week_new, tr]);

    const activeStatCard = React.useMemo(
        () => statCards.find((card) => card.filter === activeStatFilter) || statCards[0],
        [activeStatFilter, statCards],
    );

    const handleStatFilterClick = React.useCallback((filter: TalentPoolStatFilter) => {
        const nextFilter = activeStatFilter === filter ? "all" : filter;
        if (statFilterTimerRef.current) {
            window.clearTimeout(statFilterTimerRef.current);
        }
        setStatFilterPending(true);
        React.startTransition(() => {
            setActiveStatFilter(nextFilter);
            setSelectedIds(new Set());
        });
        statFilterTimerRef.current = window.setTimeout(() => {
            setStatFilterPending(false);
            statFilterTimerRef.current = null;
        }, 180);
    }, [activeStatFilter]);

    const availableTags = React.useMemo(() => {
        if (serverAvailableTags?.length) {
            return serverAvailableTags;
        }
        const tags = new Set<string>();
        for (const c of candidates) if (c.ai_match_position_title) tags.add(c.ai_match_position_title);
        return Array.from(tags).sort();
    }, [candidates, serverAvailableTags]);

    React.useEffect(() => () => {
        if (statFilterTimerRef.current) {
            window.clearTimeout(statFilterTimerRef.current);
        }
    }, []);

    React.useEffect(() => {
        if (!preferredStatFilter) {
            return;
        }
        setActiveStatFilter(preferredStatFilter);
        setSelectedIds(new Set());
        onPreferredStatFilterApplied?.();
    }, [onPreferredStatFilterApplied, preferredStatFilter]);

    React.useEffect(() => {
        onQueryChangeRef.current = onQueryChange;
    }, [onQueryChange]);

    React.useEffect(() => {
        if (candidates.length > 0 && !initialLoadComplete) {
            setInitialLoadComplete(true);
            return;
        }
        if (loading) {
            hasSeenInitialLoadingRef.current = true;
            return;
        }
        if (hasSeenInitialLoadingRef.current && !initialLoadComplete) {
            setInitialLoadComplete(true);
        }
    }, [candidates.length, initialLoadComplete, loading]);

    React.useEffect(() => {
        const queryHandler = onQueryChangeRef.current;
        if (!queryHandler) {
            return undefined;
        }
        if (!queryChangeInitializedRef.current) {
            queryChangeInitializedRef.current = true;
            return undefined;
        }
        const timer = window.setTimeout(() => {
            void queryHandler({
                statFilter: activeStatFilter,
                searchQuery,
                sourceFilter,
                tagFilter,
                sortBy,
            });
        }, searchQuery.trim() ? 220 : 0);
        return () => window.clearTimeout(timer);
    }, [activeStatFilter, searchQuery, sourceFilter, tagFilter, sortBy]);

    /* ── 过滤 + 排序 ── */
    const filteredCandidates = React.useMemo(() => {
        let result = candidates.filter((candidate) => matchesTalentPoolStatFilter(candidate, activeStatFilter, recentCutoffMs));
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.phone?.toLowerCase().includes(q) ||
                c.email?.toLowerCase().includes(q) ||
                c.current_company?.toLowerCase().includes(q) ||
                c.ai_match_position_title?.toLowerCase().includes(q)
            );
        }
        if (sourceFilter !== "all") result = result.filter(c => (c.source || "manual_upload") === sourceFilter);
        if (tagFilter !== "all") {
            result = tagFilter === "__none"
                ? result.filter(c => !c.ai_match_position_title)
                : result.filter(c => c.ai_match_position_title === tagFilter);
        }
        if (sortBy === "time") {
            result.sort((a, b) => (resolveTalentPoolEnteredAt(b) || "").localeCompare(resolveTalentPoolEnteredAt(a) || ""));
        }
        else if (sortBy === "name") result.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
        else if (sortBy === "name_desc") result.sort((a, b) => b.name.localeCompare(a.name, "zh-CN"));
        return result;
    }, [activeStatFilter, candidates, recentCutoffMs, searchQuery, sourceFilter, tagFilter, sortBy]);

    const totalForPagination = total ?? filteredCandidates.length;
    const totalPages = Math.max(1, Math.ceil(Math.max(0, totalForPagination) / Math.max(1, pageSize)));
    React.useEffect(() => {
        if (totalForPagination > 0 && pageIndex >= totalPages) {
            setPageIndex(totalPages - 1);
        }
    }, [pageIndex, totalForPagination, totalPages, setPageIndex]);

    const selectedCandidates = React.useMemo(() => (
        Array.from(selectedIds)
            .map((candidateId) => candidates.find((item) => item.id === candidateId))
            .filter((candidate): candidate is CandidateSummary => Boolean(candidate))
    ), [candidates, selectedIds]);
    const selectedReidentifyCandidates = React.useMemo(() => (
        selectedCandidates.filter(isTalentPoolReidentifyTarget)
    ), [selectedCandidates]);
    const selectedReidentifiableCount = React.useMemo(() => (
        selectedReidentifyCandidates.length
    ), [selectedReidentifyCandidates]);
    const reIdentifyConfirmGroups = React.useMemo(() => {
        const groups = new Map<string, {label: string; candidates: CandidateSummary[]}>();
        reIdentifyConfirmCandidates.forEach((candidate) => {
            const label = talentPoolReidentifyGroupLabel(candidate, tr);
            const current = groups.get(label) || {label, candidates: []};
            current.candidates.push(candidate);
            groups.set(label, current);
        });
        return Array.from(groups.values());
    }, [reIdentifyConfirmCandidates, tr]);
    const reIdentifyConfirmHasNonPending = React.useMemo(() => (
        reIdentifyConfirmCandidates.some(needsTalentPoolReidentifyConfirmation)
    ), [reIdentifyConfirmCandidates]);
    const selectedVisibleCount = React.useMemo(() => (
        filteredCandidates.reduce((count, candidate) => count + (selectedIds.has(candidate.id) ? 1 : 0), 0)
    ), [filteredCandidates, selectedIds]);
    const allVisibleSelected = filteredCandidates.length > 0 && selectedVisibleCount === filteredCandidates.length;
    const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
    const selectAllVisibleRef = React.useRef<HTMLInputElement | null>(null);
    React.useEffect(() => {
        if (selectAllVisibleRef.current) {
            selectAllVisibleRef.current.indeterminate = someVisibleSelected;
        }
    }, [someVisibleSelected]);

    // 当候选人离开待处理分组（SSE驱动进入匹配中或从人才库移除），清除 reIdentifying 标记
    React.useEffect(() => {
        const allCurrentIds = new Set(filteredCandidates.map(c => c.id));
        setReIdentifyingIds(prev => {
            if (prev.size === 0) return prev;
            const next = new Set<number>();
            for (const id of prev) {
                // 只保留在人才库中且是 unmatched 状态的候选人
                // 如果候选人已进入 matching 或已从人才库移除，清除标记
                const candidate = filteredCandidates.find(c => c.id === id);
                if (candidate && candidate.status === "unmatched") {
                    next.add(id);
                }
            }
            return next.size === prev.size ? prev : next;
        });
    }, [filteredCandidates]);

    /* ── 选择操作 ── */
    const toggleSelect = React.useCallback((id: number) => {
        setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    }, []);

    const selectGroup = React.useCallback((ids: number[]) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            const allSelected = ids.every(id => next.has(id));
            ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
            return next;
        });
    }, []);

    /* ── 批量分配 ── */
    const handleBatchAssign = React.useCallback(async () => {
        if (!assignPositionId || selectedIds.size === 0) return;
        setAssigning(true);
        try {
            await onAssignPosition(Array.from(selectedIds), Number(assignPositionId));
            setSelectedIds(new Set());
            setAssignDialogOpen(false);
            setAssignPositionId("");
        } finally {
            setAssigning(false);
        }
    }, [assignPositionId, selectedIds, onAssignPosition]);

    /* ── 单个分配（手动分配 / 换岗位） ── */
    const openSingleAssign = React.useCallback((candidateId: number) => {
        setSingleAssignCandidateId(candidateId);
        setSingleAssignPositionId("");
        setSingleAssignOpen(true);
    }, []);

    const handleSingleAssign = React.useCallback(async () => {
        if (!singleAssignPositionId || singleAssignCandidateId === null) return;
        setSingleAssigning(true);
        try {
            await onAssignPosition([singleAssignCandidateId], Number(singleAssignPositionId));
            setSingleAssignOpen(false);
            if (onRefresh) await onRefresh();
        } finally {
            setSingleAssigning(false);
        }
    }, [singleAssignPositionId, singleAssignCandidateId, onAssignPosition, onRefresh]);

    const runReIdentify = React.useCallback(async (
        candidateIds: number[],
        options: {single?: boolean; clearSelection?: boolean} = {},
    ) => {
        const uniqueIds = Array.from(new Set(candidateIds));
        if (!uniqueIds.length) {
            return;
        }
        setReIdentifyingIds(prev => {
            const next = new Set(prev);
            uniqueIds.forEach((candidateId) => next.add(candidateId));
            return next;
        });
        setReIdentifyFailedIds(prev => {
            const next = new Set(prev);
            uniqueIds.forEach((candidateId) => next.delete(candidateId));
            return next;
        });
        try {
            if (options.single && uniqueIds.length === 1 && onReIdentify) {
                await onReIdentify(uniqueIds[0]);
            } else if (onBatchReIdentify) {
                await onBatchReIdentify(uniqueIds);
            } else {
                await triggerAIPositionMatch(uniqueIds);
            }
            if (options.clearSelection) {
                setSelectedIds(new Set());
            }
        } catch {
            setReIdentifyFailedIds(prev => {
                const next = new Set(prev);
                uniqueIds.forEach((candidateId) => next.add(candidateId));
                return next;
            });
            setReIdentifyingIds(prev => {
                const next = new Set(prev);
                uniqueIds.forEach((candidateId) => next.delete(candidateId));
                return next;
            });
            throw new Error("reidentify_failed");
        }
    }, [onBatchReIdentify, onReIdentify]);

    /* ── 重新识别（异步，结果通过SSE推送） ── */
    const requestReIdentify = React.useCallback((targetCandidates: CandidateSummary[], mode: "single" | "batch") => {
        const candidatesToIdentify = targetCandidates.filter(isTalentPoolReidentifyTarget);
        if (!candidatesToIdentify.length) {
            return;
        }
        if (candidatesToIdentify.some(needsTalentPoolReidentifyConfirmation)) {
            setReIdentifyConfirmMode(mode);
            setReIdentifyConfirmCandidates(candidatesToIdentify);
            setReIdentifyConfirmOpen(true);
            return;
        }
        void runReIdentify(candidatesToIdentify.map((candidate) => candidate.id), {
            single: mode === "single",
            clearSelection: mode === "batch",
        }).catch(() => undefined);
    }, [runReIdentify]);

    const handleBatchReIdentify = React.useCallback(async () => {
        requestReIdentify(selectedReidentifyCandidates, "batch");
    }, [requestReIdentify, selectedReidentifyCandidates]);

    const handleConfirmReIdentify = React.useCallback(async () => {
        const candidateIds = reIdentifyConfirmCandidates.filter(isTalentPoolReidentifyTarget).map((candidate) => candidate.id);
        if (!candidateIds.length || reIdentifyConfirmSubmitting) {
            return;
        }
        setReIdentifyConfirmSubmitting(true);
        try {
            await runReIdentify(candidateIds, {
                single: reIdentifyConfirmMode === "single",
                clearSelection: reIdentifyConfirmMode === "batch",
            });
            setReIdentifyConfirmOpen(false);
            setReIdentifyConfirmCandidates([]);
        } catch {
            // runReIdentify 已经标记失败状态，这里保留弹窗让用户确认发生了什么。
        } finally {
            setReIdentifyConfirmSubmitting(false);
        }
    }, [reIdentifyConfirmCandidates, reIdentifyConfirmMode, reIdentifyConfirmSubmitting, runReIdentify]);

    /* ── 批量删除 ── */
    const handleBatchDelete = React.useCallback(async () => {
        if (!onDeleteCandidates || selectedIds.size === 0) return;
        setDeleting(true);
        setDeleteDialogOpen(false);
        try {
            await onDeleteCandidates(Array.from(selectedIds));
            setSelectedIds(new Set());
        } finally {
            setDeleting(false);
        }
    }, [onDeleteCandidates, selectedIds]);

    const showInitialPageLoading = loading && candidates.length === 0 && !initialLoadComplete;
    const showInlineUpdating = loading && !showInitialPageLoading;

    if (showInitialPageLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400"/>
            </div>
        );
    }

    return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-hidden bg-slate-50 p-3 dark:bg-slate-950 xl:grid-cols-[248px_minmax(0,1fr)]">
            <aside className="hidden min-h-0 xl:flex xl:flex-col rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <p className="text-base font-semibold text-slate-950 dark:text-slate-50">{tr.title}</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {statCards.map((card) => (
                        <button
                            key={card.filter}
                            type="button"
                            aria-pressed={activeStatFilter === card.filter}
                            onClick={() => handleStatFilterClick(card.filter)}
                            className={cn(
                                "mb-1 flex w-full min-w-0 items-start justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition",
                                activeStatFilter === card.filter
                                    ? "bg-[#F5F5F5] text-[#171717]"
                                    : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900",
                            )}
                        >
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{card.label}</span>
                                <span className={cn("mt-0.5 block truncate text-xs", activeStatFilter === card.filter ? "text-[#171717]/70" : "text-slate-400")}>
                                    {card.hint}
                                </span>
                            </span>
                            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs tabular-nums", activeStatFilter === card.filter ? "border border-[#D4D4D4] bg-white text-[#171717]" : "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-300")}>
                                {card.value}
                            </span>
                        </button>
                    ))}
                </div>
                <div className="border-t border-slate-200 p-3 dark:border-slate-800">
                    {onUploadResume ? (
                        <Button size="sm" className="w-full rounded-md" onClick={onUploadResume}>
                            <Upload className="mr-1.5 h-3.5 w-3.5"/>
                            {tr.uploadResume}
                        </Button>
                    ) : null}
                </div>
            </aside>
            {/* ── 主内容区 ── */}
            <div className="flex min-h-0 flex-1 flex-col rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                {/* 统计卡片 */}
                <div className="mb-4 shrink-0 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:hidden">
                    {statCards.map((card) => (
                        <StatCard
                            key={card.filter}
                            label={card.label}
                            value={card.value}
                            hint={card.hint}
                            tone={card.tone}
                            active={activeStatFilter === card.filter}
                            loading={statFilterPending && activeStatFilter === card.filter}
                            onClick={() => handleStatFilterClick(card.filter)}
                        />
                    ))}
                </div>

                {/* 工具栏 */}
                <div
                    className={cn(
                        "sticky top-0 z-30 mb-3 flex items-center gap-2 border-b border-slate-100 bg-white/95 pb-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95",
                        selectedIds.size > 0
                            ? "min-h-[44px] rounded-md bg-neutral-100/95 px-2 py-1.5 shadow-sm dark:bg-neutral-900/85"
                            : "flex-wrap justify-between pt-1",
                    )}
                >
                    {selectedIds.size > 0 ? (
                        <>
                            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {filteredCandidates.length > 0 ? (
                                    <label className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900">
                                        <input
                                            ref={selectAllVisibleRef}
                                            type="checkbox"
                                            className="h-3.5 w-3.5 accent-neutral-900"
                                            checked={allVisibleSelected}
                                            onChange={() => selectGroup(filteredCandidates.map(c => c.id))}
                                        />
                                        {tr.selectAllVisible}
                                    </label>
                                ) : null}
                                <span className="inline-flex h-8 shrink-0 items-center rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 dark:border-neutral-800 dark:bg-slate-950 dark:text-neutral-200">
                                    {tr.selectedCount(selectedIds.size)}
                                </span>
                                <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-md border-neutral-300 px-3 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900/50" onClick={() => setAssignDialogOpen(true)}>
                                    <Briefcase className="mr-1 h-3.5 w-3.5"/>
                                    {tr.batchAssign}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 shrink-0 rounded-md border-neutral-300 px-3 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900/50"
                                    onClick={() => void handleBatchReIdentify()}
                                    disabled={selectedReidentifiableCount === 0}
                                >
                                    <RotateCcw className="mr-1 h-3.5 w-3.5"/>
                                    {tr.batchReIdentify}
                                </Button>
                                {onDeleteCandidates ? (
                                    <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-md px-3 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30" onClick={() => setDeleteDialogOpen(true)}>
                                        <Trash2 className="mr-1 h-3.5 w-3.5"/>
                                        {tr.batchDelete}
                                    </Button>
                                ) : null}
                            </div>
                            <div className="ml-auto flex shrink-0 items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 rounded-md px-2 text-xs font-normal text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                                    onClick={() => setSelectedIds(new Set())}
                                >
                                    {tr.clearSelection}
                                </Button>
                                {onRefresh ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 rounded-md px-2 text-xs"
                                        disabled={refreshing || loading}
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
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                <div className="relative w-full max-w-[330px]">
                                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"/>
                                    <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={tr.searchPlaceholder} className="h-8 rounded-lg pl-8 text-[13px]"/>
                                </div>
                                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                    <option value="all">{tr.allSources}</option>
                                    <option value="boss_zhipin">{tr.bossZhipin}</option>
                                    <option value="liepin">{tr.liepin}</option>
                                    <option value="manual_upload">{tr.manualUpload}</option>
                                    <option value="headhunter">{tr.headhunter}</option>
                                </select>
                                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                    <option value="all">{tr.allTags}</option>
                                    {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                                    <option value="__none">{tr.unmatchedGroup}</option>
                                </select>
                                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                    <option value="time">{tr.sortByTime}</option>
                                    <option value="name">{tr.sortByName}</option>
                                    <option value="name_desc">{tr.sortByNameDesc}</option>
                                </select>
                                {activeStatFilter !== "all" ? (
                                    <button
                                        type="button"
                                        onClick={() => handleStatFilterClick(activeStatFilter)}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 text-xs text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-200"
                                        title={tr.clearStatFilter}
                                    >
                                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-900"/>
                                        {activeStatCard.label}
                                    </button>
                                ) : null}
                                {statFilterPending ? (
                                    <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                        <Loader2 className="h-3 w-3 animate-spin"/>
                                        {tr.statFiltering}
                                    </span>
                                ) : null}
                                <span className="text-xs text-slate-400 dark:text-slate-500">
                                    {tr.visibleResultCount(filteredCandidates.length, total ?? filteredCandidates.length)}
                                </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {filteredCandidates.length > 0 ? (
                                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                        <input
                                            ref={selectAllVisibleRef}
                                            type="checkbox"
                                            className="h-3.5 w-3.5 accent-neutral-900"
                                            checked={allVisibleSelected}
                                            onChange={() => selectGroup(filteredCandidates.map(c => c.id))}
                                        />
                                        {tr.selectAllVisible}
                                    </label>
                                ) : null}
                                {onRefresh ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 rounded-md px-2 text-xs"
                                        disabled={refreshing || loading}
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
                            </div>
                        </>
                    )}
                </div>

                {/* 候选人列表 */}
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {showInlineUpdating ? (
                            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/80 px-3 py-1.5 text-sm text-neutral-700 shadow-sm backdrop-blur-xl dark:border-neutral-800 dark:bg-slate-950/75 dark:text-neutral-200">
                                <span className="relative flex h-3 w-3">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neutral-400 opacity-60"/>
                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-neutral-900"/>
                                </span>
                                {tr.updatingList}
                            </div>
                        ) : null}
                        {filteredCandidates.length === 0 ? (
                            <div className="flex h-full items-center justify-center">
                                {showInlineUpdating ? (
                                    <div className="flex flex-col items-center rounded-3xl border border-neutral-200 bg-white/75 px-8 py-7 text-center shadow-[0_18px_48px_-36px_rgba(15,23,42,0.35)] backdrop-blur-2xl dark:border-neutral-800 dark:bg-slate-950/70">
                                        <span className="relative flex h-8 w-8">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neutral-400 opacity-35"/>
                                            <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-white shadow-[0_16px_36px_-22px_rgba(15,23,42,0.65)]">
                                                <Loader2 className="h-4 w-4 animate-spin"/>
                                            </span>
                                        </span>
                                        <span className="mt-3 text-base font-medium text-slate-700 dark:text-slate-200">{tr.updatingList}</span>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <Users className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600"/>
                                        <h3 className="mt-2 text-base font-medium text-slate-900 dark:text-slate-100">
                                            {activeStatFilter === "all" ? tr.noCandidates : tr.noFilteredCandidates}
                                        </h3>
                                        <p className="mt-1 text-base text-slate-500 dark:text-slate-400">
                                            {activeStatFilter === "all" ? tr.noCandidatesDesc : tr.noFilteredCandidatesDesc}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className={cn("transition duration-200 ease-out", statFilterPending && "scale-[0.998] opacity-70")}>
                                <div className="flex flex-col gap-2">
                                    {filteredCandidates.map(candidate => {
                                        const matching = isTalentPoolMatching(candidate);
                                        const archived = !matching && !isPendingActionCandidate(candidate);
                                        return (
                                            <CandidateCard
                                                key={candidate.id}
                                                candidate={candidate}
                                                selected={selectedIds.has(candidate.id)}
                                                reIdentifying={reIdentifyingIds.has(candidate.id)}
                                                reIdentifyFailed={reIdentifyFailedIds.has(candidate.id)}
                                                onToggleSelect={() => toggleSelect(candidate.id)}
                                                onCancelMatch={matching && onCancelMatch ? () => onCancelMatch(candidate.id) : undefined}
                                                onReIdentify={!matching ? () => requestReIdentify([candidate], "single") : undefined}
                                                onManualAssign={!matching ? () => openSingleAssign(candidate.id) : undefined}
                                                onView={() => onViewCandidate(candidate.id)}
                                                tr={tr}
                                                language={language}
                                                isMatching={matching}
                                                isArchived={archived}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                    <PaginationBar
                        total={total ?? filteredCandidates.length}
                        pageIndex={pageIndex}
                        pageSize={pageSize}
                        pageSizeOptions={pageSizeOptions}
                        loading={loading}
                        visibleCount={filteredCandidates.length}
                        setPageIndex={setPageIndex}
                        setPageSize={setPageSize}
                        tr={tr}
                    />
                </div>
            </div>

            {/* ── 批量分配弹窗 ── */}
            {assignDialogOpen && (
                <DialogOverlay onClose={() => setAssignDialogOpen(false)}>
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tr.batchAssign}</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tr.selectedCount(selectedIds.size)}</p>
                        <select value={assignPositionId} onChange={(e) => setAssignPositionId(e.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                            <option value="">{tr.selectPosition}</option>
                            {positions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>{tr.cancel}</Button>
                            <Button onClick={() => void handleBatchAssign()} disabled={!assignPositionId || assigning}>{assigning && <Loader2 className="mr-1 h-4 w-4 animate-spin"/>}{tr.confirmAssign}</Button>
                        </div>
                    </div>
                </DialogOverlay>
            )}

            {/* ── 单个分配弹窗（手动分配 / 换岗位） ── */}
            {singleAssignOpen && (
                <DialogOverlay onClose={() => setSingleAssignOpen(false)}>
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tr.manualAssign}</h2>
                        <select value={singleAssignPositionId} onChange={(e) => setSingleAssignPositionId(e.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
                            <option value="">{tr.selectPosition}</option>
                            {positions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setSingleAssignOpen(false)}>{tr.cancel}</Button>
                            <Button onClick={() => void handleSingleAssign()} disabled={!singleAssignPositionId || singleAssigning}>{singleAssigning && <Loader2 className="mr-1 h-4 w-4 animate-spin"/>}{tr.confirmAssign}</Button>
                        </div>
                    </div>
                </DialogOverlay>
            )}

            {/* ── 重新识别二次确认弹窗 ── */}
            {reIdentifyConfirmOpen && (
                <DialogOverlay
                    onClose={() => {
                        if (reIdentifyConfirmSubmitting) return;
                        setReIdentifyConfirmOpen(false);
                    }}
                >
                    <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                                <RotateCcw className="h-4 w-4"/>
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tr.reIdentifyConfirmTitle}</h2>
                                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                                    {tr.reIdentifyConfirmDescription(reIdentifyConfirmCandidates.length)}
                                </p>
                            </div>
                        </div>
                        {reIdentifyConfirmHasNonPending ? (
                            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                                {tr.reIdentifyConfirmWarning}
                            </div>
                        ) : null}
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                            <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{tr.reIdentifyConfirmIncludes}</div>
                            <div className="space-y-2">
                                {reIdentifyConfirmGroups.map((group) => {
                                    const visibleNames = group.candidates.slice(0, 4).map(talentPoolCandidateName);
                                    const hiddenCount = Math.max(0, group.candidates.length - visibleNames.length);
                                    return (
                                        <div key={group.label} className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-100 dark:bg-slate-950 dark:ring-slate-800">
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="font-medium text-slate-800 dark:text-slate-100">{group.label}</span>
                                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                                    {tr.candidatesCount(group.candidates.length)}
                                                </span>
                                            </div>
                                            <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                                {visibleNames.join("、")}
                                                {hiddenCount > 0 ? `，${tr.reIdentifyConfirmMore(hiddenCount)}` : ""}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setReIdentifyConfirmOpen(false)}
                                disabled={reIdentifyConfirmSubmitting}
                            >
                                {tr.cancel}
                            </Button>
                            <Button onClick={() => void handleConfirmReIdentify()} disabled={reIdentifyConfirmSubmitting}>
                                {reIdentifyConfirmSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <RotateCcw className="mr-1 h-4 w-4"/>}
                                {tr.confirmReIdentify}
                            </Button>
                        </div>
                    </div>
                </DialogOverlay>
            )}

            {/* ── 批量删除确认弹窗 ── */}
            {deleteDialogOpen && (
                <DialogOverlay onClose={() => setDeleteDialogOpen(false)}>
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{tr.deleteConfirmTitle}</h2>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{tr.deleteConfirmMsg(selectedIds.size)}</p>
                        <div className="mt-4 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{tr.cancel}</Button>
                            <Button variant="destructive" onClick={() => void handleBatchDelete()} disabled={deleting}>{deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin"/>}{tr.confirm}</Button>
                        </div>
                    </div>
                </DialogOverlay>
            )}
        </div>
    );
}

/* ════════════════════════════════════════════════════════════════
 * 子组件
 * ════════════════════════════════════════════════════════════════ */

function DialogOverlay({children, onClose}: {children: React.ReactNode; onClose: () => void}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div onClick={e => e.stopPropagation()}>{children}</div>
        </div>
    );
}

/* ── 分页控件 ── */
function PaginationBar({
    total,
    pageIndex,
    pageSize,
    pageSizeOptions,
    loading,
    visibleCount,
    setPageIndex,
    setPageSize,
    tr,
}: {
    total: number;
    pageIndex: number;
    pageSize: number;
    pageSizeOptions: number[];
    loading: boolean;
    visibleCount: number;
    setPageIndex: (pageIndex: number) => void;
    setPageSize: (pageSize: number) => void;
    tr: ReturnType<typeof getTalentPoolLocale>;
}) {
    const totalPages = React.useMemo(() => (
        Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))
    ), [pageSize, total]);
    const paginationPages = React.useMemo(() => {
        const currentPage = Math.min(Math.max(0, pageIndex), totalPages - 1);
        const first = Math.max(0, Math.min(currentPage - 2, totalPages - 5));
        const last = Math.min(totalPages - 1, first + 4);
        const pages: number[] = [];
        for (let i = first; i <= last; i += 1) pages.push(i);
        return pages;
    }, [pageIndex, totalPages]);
    const pageStart = total > 0 ? pageIndex * pageSize + 1 : 0;
    const pageEnd = total > 0 ? Math.min(total, pageIndex * pageSize + visibleCount) : 0;

    return (
        <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>{tr.pageRange(pageStart, pageEnd, total)}</span>
            <div className="flex flex-wrap items-center gap-2.5">
                <select
                    value={String(pageSize)}
                    title={tr.rowsPerPage}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                    className="h-8 w-[118px] shrink-0 rounded-md border border-slate-200 bg-white px-2.5 pr-8 text-sm text-slate-700 shadow-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                >
                    {pageSizeOptions.map((option) => (
                        <option key={option} value={option}>{option}{tr.rowsPerPage}</option>
                    ))}
                </select>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-md px-2.5 text-xs"
                    disabled={pageIndex <= 0 || loading}
                    onClick={() => setPageIndex(pageIndex - 1)}
                >
                    {tr.previousPage}
                </Button>
                {paginationPages.map((p) => (
                    <Button
                        key={p}
                        size="sm"
                        variant={p === pageIndex ? "default" : "outline"}
                        className="h-7 min-w-7 rounded-md px-2 text-sm"
                        disabled={loading}
                        onClick={() => setPageIndex(p)}
                    >
                        {p + 1}
                    </Button>
                ))}
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-md px-2.5 text-xs"
                    disabled={pageIndex >= totalPages - 1 || loading}
                    onClick={() => setPageIndex(pageIndex + 1)}
                >
                    {tr.nextPage}
                </Button>
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    hint,
    tone,
    active,
    loading,
    onClick,
}: {
    label: string;
    value: number;
    hint: string;
    tone: "slate" | "sky" | "amber" | "orange" | "rose" | "emerald";
    active: boolean;
    loading: boolean;
    onClick: () => void;
}) {
    const toneClasses: Record<typeof tone, string> = {
        slate: "from-slate-500/16 via-slate-100/80 to-white dark:from-slate-500/20 dark:via-slate-900/85 dark:to-slate-950",
        sky: "from-neutral-400/14 via-neutral-50/90 to-white dark:from-neutral-400/18 dark:via-slate-900/85 dark:to-slate-950",
        amber: "from-neutral-400/14 via-neutral-50/90 to-white dark:from-neutral-400/18 dark:via-slate-900/85 dark:to-slate-950",
        orange: "from-neutral-400/14 via-neutral-50/90 to-white dark:from-neutral-400/18 dark:via-slate-900/85 dark:to-slate-950",
        rose: "from-neutral-400/14 via-neutral-50/90 to-white dark:from-neutral-400/18 dark:via-slate-900/85 dark:to-slate-950",
        emerald: "from-neutral-400/14 via-neutral-50/90 to-white dark:from-neutral-400/18 dark:via-slate-900/85 dark:to-slate-950",
    };
    const activeToneClasses: Record<typeof tone, string> = {
        slate: "border-slate-700/80 from-slate-700/24 via-slate-100 to-white ring-2 ring-slate-500/25 shadow-[0_22px_62px_-28px_rgba(15,23,42,0.86)] dark:border-slate-300/80 dark:from-slate-300/16 dark:ring-slate-300/20",
        sky: "border-neutral-400 from-neutral-500/20 via-neutral-100 to-white ring-2 ring-neutral-300/40 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.55)] dark:border-neutral-400 dark:from-neutral-400/18 dark:ring-neutral-400/25",
        amber: "border-neutral-400 from-neutral-500/20 via-neutral-100 to-white ring-2 ring-neutral-300/40 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.55)] dark:border-neutral-400 dark:from-neutral-400/18 dark:ring-neutral-400/25",
        orange: "border-neutral-400 from-neutral-500/20 via-neutral-100 to-white ring-2 ring-neutral-300/40 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.55)] dark:border-neutral-400 dark:from-neutral-400/18 dark:ring-neutral-400/25",
        rose: "border-neutral-400 from-neutral-500/20 via-neutral-100 to-white ring-2 ring-neutral-300/40 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.55)] dark:border-neutral-400 dark:from-neutral-400/18 dark:ring-neutral-400/25",
        emerald: "border-neutral-400 from-neutral-500/20 via-neutral-100 to-white ring-2 ring-neutral-300/40 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.55)] dark:border-neutral-400 dark:from-neutral-400/18 dark:ring-neutral-400/25",
    };
    const accentTextClasses: Record<typeof tone, string> = {
        slate: "text-slate-800 dark:text-slate-100",
        sky: "text-neutral-700 dark:text-neutral-200",
        amber: "text-neutral-700 dark:text-neutral-200",
        orange: "text-neutral-700 dark:text-neutral-200",
        rose: "text-neutral-700 dark:text-neutral-200",
        emerald: "text-neutral-700 dark:text-neutral-200",
    };
    const accentFillClasses: Record<typeof tone, string> = {
        slate: "bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-950",
        sky: "bg-neutral-900 text-white dark:bg-neutral-400 dark:text-slate-950",
        amber: "bg-neutral-900 text-white dark:bg-neutral-400 dark:text-slate-950",
        orange: "bg-neutral-900 text-white dark:bg-neutral-400 dark:text-slate-950",
        rose: "bg-neutral-900 text-white dark:bg-neutral-400 dark:text-slate-950",
        emerald: "bg-neutral-900 text-white dark:bg-neutral-400 dark:text-slate-950",
    };
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={cn(
                "group relative overflow-hidden rounded-2xl border px-4 py-3.5 text-left backdrop-blur-2xl transition-all duration-300 ease-out active:scale-[0.985]",
                "bg-gradient-to-br shadow-[0_14px_42px_-30px_rgba(15,23,42,0.55)] hover:-translate-y-0.5 hover:shadow-[0_20px_54px_-34px_rgba(15,23,42,0.7)]",
                toneClasses[tone],
                active
                    ? cn("-translate-y-0.5", activeToneClasses[tone])
                    : "border-white/70 dark:border-slate-800/80",
            )}
        >
            <span className={cn(
                "pointer-events-none absolute inset-y-3 left-0 w-1 rounded-r-full transition-opacity",
                active ? accentFillClasses[tone] : "bg-transparent opacity-0",
            )}/>
            <span className={cn(
                "pointer-events-none absolute inset-x-4 top-2 h-px rounded-full bg-gradient-to-r from-transparent via-white/90 to-transparent transition-opacity",
                active ? "opacity-100" : "opacity-50 group-hover:opacity-90",
            )}/>
            <span className={cn(
                "pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full blur-2xl transition-opacity",
                active ? "bg-neutral-300/30 opacity-100 dark:bg-neutral-900/20" : "bg-white/55 opacity-0 group-hover:opacity-80 dark:bg-white/10",
            )}/>
            {active ? (
                <span className={cn(
                    "pointer-events-none absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full shadow-[0_8px_18px_-10px_rgba(15,23,42,0.9)]",
                    accentFillClasses[tone],
                )}>
                    <Check className="h-3.5 w-3.5"/>
                </span>
            ) : null}
            {loading ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-slate-200/70 dark:bg-slate-700/70">
                    <span className="block h-full w-1/2 animate-pulse rounded-full bg-neutral-400 shadow-[0_0_14px_rgba(15,23,42,0.45)]"/>
                </span>
            ) : null}
            <span className={cn(
                "relative block pr-7 text-sm font-medium transition-colors",
                active ? accentTextClasses[tone] : "text-slate-500 dark:text-slate-400",
            )}>{label}</span>
            <span className={cn(
                "relative mt-1.5 block text-[26px] font-semibold leading-none tabular-nums text-slate-950 transition-all duration-300 group-hover:translate-x-0.5 dark:text-slate-50",
                active && cn("font-bold", accentTextClasses[tone]),
            )}>{value}</span>
            <span className={cn(
                "relative mt-1.5 block text-[15px] transition-colors",
                active ? "font-medium text-slate-600 dark:text-slate-300" : "text-slate-400 dark:text-slate-500",
            )}>{hint}</span>
        </button>
    );
}

/* ── 候选人卡片 ── */
function CandidateCard({
    candidate, selected, reIdentifying, reIdentifyFailed,
    onToggleSelect, onConfirmMatch, onChangePosition, onReIdentify, onCancelMatch, onManualAssign, onView, tr, language,
    isMatching, isArchived,
}: {
    candidate: CandidateSummary;
    selected: boolean;
    reIdentifying: boolean;
    reIdentifyFailed: boolean;
    onToggleSelect: () => void;
    onConfirmMatch?: () => void;
    onChangePosition?: () => void;
    onReIdentify?: () => void;
    onCancelMatch?: () => void;
    onManualAssign?: () => void;
    onView: () => void;
    tr: ReturnType<typeof getTalentPoolLocale>;
    language: string;
    isMatching?: boolean;
    isArchived?: boolean;
}) {
    const hasAIMatch = !!candidate.ai_match_position_title;
    const talentPoolDisplayStatus = resolveTalentPoolDisplayStatus(candidate);
    const screeningPositionTitle = candidate.screened_position_title || candidate.position_title;
    const aiRecommendedTitle = candidate.ai_match_position_title || null;
    const enteredAt = resolveTalentPoolEnteredAt(candidate);
    const enteredAtLabel = candidate.talent_pool_moved_at ? tr.enteredAt : tr.uploadedAt;
    const colorIdx = avatarColorIndex(candidate.name);
    const initial = avatarInitial(candidate.name);
    const sourceStageLabel = React.useMemo(() => {
        const reason = String(candidate.talent_pool_reason || "").trim().toLowerCase();
        if (reason === "unmatched_by_ai") {
            return tr.sourceAiUnmatched;
        }
        if (reason === "ai_error") {
            return tr.sourceAiError;
        }
        if (reason === "auto_archived") {
            return tr.sourceScreeningArchived;
        }
        if (reason === "moved_by_hr") {
            const sourceLabel = STATUS_LABEL_MAP[candidate.talent_pool_source_status || ""] || candidate.talent_pool_source_status || "";
            return sourceLabel ? sourceLabel : tr.archived;
        }
        return tr.sourceLegacyArchived;
    }, [candidate.talent_pool_reason, candidate.talent_pool_source_status, tr]);

    // 根据 talent_pool_reason 决定描述文案
    const getDescription = () => {
        if (isMatching) {
            return (
                <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin"/>
                    {tr.aiMatchingHint}
                </div>
            );
        }
        if (isArchived) {
            if (candidate.talent_pool_reason === "auto_archived") {
                return <div className="text-xs text-slate-400 dark:text-slate-500">{tr.autoArchivedDesc}</div>;
            }
            if (candidate.talent_pool_reason === "moved_by_hr") {
                const sourceLabel = STATUS_LABEL_MAP[candidate.talent_pool_source_status || ""] || candidate.talent_pool_source_status || "";
                const moveDate = candidate.talent_pool_moved_at ? formatDateTime(candidate.talent_pool_moved_at) : "";
                return <div className="text-xs text-slate-400 dark:text-slate-500">{tr.movedByHRDesc(candidate.talent_pool_moved_by || "", moveDate, sourceLabel)}</div>;
            }
            // 旧数据（status=talent_pool 无 reason）
            return <div className="text-xs text-slate-400 dark:text-slate-500">{tr.archivedGroupDesc}</div>;
        }
        // 待处理分组
        if (candidate.talent_pool_reason === "ai_error") {
            return (
                <div className="text-xs text-amber-500 dark:text-amber-400">
                    {sanitizeCandidateFacingErrorText(candidate.ai_match_reason || tr.aiErrorDesc, {
                        context: "position_match",
                        language,
                    })}
                </div>
            );
        }
        // unmatched_by_ai 或无 reason
        if (reIdentifyFailed) {
            return <div className="text-xs text-rose-500 dark:text-rose-400">{tr.aiStillNoMatch}</div>;
        }
        return <div className="text-xs text-slate-400 dark:text-slate-500">{tr.aiNoMatch}</div>;
    };

    return (
        <div className={cn(
            "flex items-start gap-3.5 rounded-xl border px-4 py-3.5 transition-colors",
            selected ? "border-neutral-400 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900/40" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
        )}>
            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="mt-1 h-[15px] w-[15px] flex-shrink-0 accent-neutral-900"/>
            <div className={cn("flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full text-[13px] font-medium", AVATAR_BG[AVATAR_COLORS[colorIdx]])}>
                {initial}
            </div>
            <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{candidate.name}</span>
                    {isMatching ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <Loader2 className="h-3 w-3 animate-spin"/>
                            {tr.matching}
                        </span>
                    ) : talentPoolDisplayStatus === "talent_pool" ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">{tr.archived}</span>
                    ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{tr.pendingIdentify}</span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{sourceLabel(candidate.source, tr)}</span>
                    {!isMatching ? (
                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[15px] font-medium text-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-200">
                            {`${tr.sourceStage}：${sourceStageLabel}`}
                        </span>
                    ) : null}
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {candidate.years_of_experience && <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3"/>{candidate.years_of_experience}</span>}
                    {candidate.education && <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3"/>{candidate.education}</span>}
                    {candidate.city && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3"/>{candidate.city}</span>}
                    {candidate.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3"/>{candidate.phone}</span>}
                </div>
                {getDescription()}
                {isMatching ? (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin"/>
                            <span>AI 正在分析简历，匹配岗位中...</span>
                        </div>
                    </div>
                ) : (screeningPositionTitle || aiRecommendedTitle || candidate.ai_potential_position) ? (
                    <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-200">
                        {screeningPositionTitle ? <div className="font-medium">{`${tr.screeningPosition}：${screeningPositionTitle}`}</div> : null}
                        {aiRecommendedTitle ? (
                            <div className={screeningPositionTitle ? "mt-1" : "font-medium"}>
                                {`${tr.aiRecommendedPosition}：${aiRecommendedTitle}`}
                            </div>
                        ) : null}
                        {aiRecommendedTitle && candidate.ai_match_reason ? (
                            <div className="mt-1 text-neutral-700/90 dark:text-neutral-200/80">
                                {sanitizeCandidateFacingErrorText(candidate.ai_match_reason, {
                                    context: "position_match",
                                    language,
                                })}
                            </div>
                        ) : null}
                        {candidate.ai_potential_position ? (
                            <div className={screeningPositionTitle || aiRecommendedTitle ? "mt-1 border-t border-neutral-200/70 pt-2 dark:border-neutral-800" : ""}>
                                <div className="font-medium">
                                    {`${tr.potentialDirection}：${candidate.ai_potential_position}`}
                                </div>
                                {candidate.ai_potential_reason ? (
                                    <div className="mt-1 text-neutral-700/90 dark:text-neutral-200/80">{candidate.ai_potential_reason}</div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <div className="flex flex-shrink-0 self-stretch flex-col items-end justify-between gap-2">
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {hasAIMatch && onConfirmMatch && (
                        <Button size="sm" variant="outline" className="h-8 rounded-md border-neutral-300 px-3 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900/50" onClick={onConfirmMatch}>
                            <Check className="mr-1 h-3 w-3"/>{tr.confirmMatch}
                        </Button>
                    )}
                    {hasAIMatch && onChangePosition && (
                        <Button size="sm" variant="outline" className="h-8 rounded-md px-3 text-xs" onClick={onChangePosition}>{tr.changePosition}</Button>
                    )}
                    {onReIdentify && !isMatching && (
                        <Button size="sm" variant="outline" className="h-8 rounded-md px-3 text-xs" onClick={onReIdentify} disabled={reIdentifying}>
                            {reIdentifying ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <RefreshCw className="mr-1 h-3 w-3"/>}
                            {reIdentifying ? tr.reIdentifying : tr.reIdentify}
                        </Button>
                    )}
                    {onManualAssign && (
                        <Button size="sm" variant="outline" className="h-8 rounded-md border-neutral-300 px-3 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900/50" onClick={onManualAssign}>
                            <Briefcase className="mr-1 h-3 w-3"/>{tr.manualAssign}
                        </Button>
                    )}
                    {isMatching && onCancelMatch && (
                        <Button size="sm" variant="outline" className="h-8 rounded-md border-rose-300 px-3 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/30" onClick={onCancelMatch}>
                            <Square className="mr-1 h-3 w-3"/>{tr.stopMatch}
                        </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 rounded-md px-3 text-xs" onClick={onView}>
                        <Eye className="mr-1 h-3 w-3"/>{tr.view}
                    </Button>
                </div>
                {enteredAt ? (
                    <div
                        className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-500 dark:bg-slate-800/70 dark:text-slate-400"
                        title={`${enteredAtLabel} ${formatDateTime(enteredAt)}`}
                    >
                        <Clock3 className="h-3 w-3"/>
                        <span>{enteredAtLabel}</span>
                        <span className="font-medium tabular-nums text-slate-700 dark:text-slate-200">{formatDateTime(enteredAt)}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
