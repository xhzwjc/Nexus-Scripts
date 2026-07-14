"use client";

import React from "react";
import {
    BadgeCheck,
    ChevronDown,
    Loader2,
    RefreshCw,
    RotateCcw,
    Search,
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    formatDateTime,
    isTalentPoolReidentifiable,
    sanitizeCandidateFacingErrorText,
} from "../utils";

function getTalentPoolLocale(language = getCurrentLanguage()) {
    const isZh = language !== "en-US";
    return {
        title: isZh ? "人才库" : "Talent Pool",
        description: isZh
            ? "未分配岗位的候选人，可按 AI 识别标签批量分配岗位"
            : "Candidates without assigned positions, batch assign by AI-recognized tags",
        uploadResume: isZh ? "上传简历" : "Upload Resume",
        refresh: isZh ? "刷新" : "Refresh",
        totalCandidates: isZh ? "总候选人" : "Total Candidates",
        totalHint: isZh ? "当前人才库" : "Current talent pool",
        matchingStat: isZh ? "识别中" : "Identifying",
        matchingStatHint: isZh ? "AI 处理中" : "AI in progress",
        pendingAction: isZh ? "待处理" : "Action Needed",
        pendingActionHint: isZh ? "未匹配 + 异常" : "No match + errors",
        noSystemPosition: isZh ? "未匹配岗位" : "No Position Match",
        noSystemPositionHint: isZh ? "需手动分配" : "Manual assignment",
        identifyError: isZh ? "识别异常" : "AI Errors",
        identifyErrorHint: isZh ? "可重新识别" : "Can re-identify",
        newThisWeek: isZh ? "本周入库" : "Added This Week",
        newThisWeekHint: isZh ? "最近 7 天入库" : "Added in last 7 days",
        updatingList: isZh ? "正在更新列表" : "Updating list",
        searchPlaceholder: isZh
            ? "搜索姓名、手机号、邮箱、公司或岗位…"
            : "Search name, phone, email, company, or position...",
        allSources: isZh ? "全部来源" : "All Sources",
        allRecommendedPositions: isZh ? "全部推荐岗位" : "All Recommended Positions",
        sortByTime: isZh ? "入库时间 ↓" : "Talent Pool Time ↓",
        sortByName: isZh ? "姓名 A-Z" : "Name A-Z",
        sortByNameDesc: isZh ? "姓名 Z-A" : "Name Z-A",
        advancedFilter: isZh ? "高级筛选" : "Advanced Filters",
        filterSummary: isZh
            ? "可组合筛选来源、推荐岗位、入库时间，并搜索姓名、手机号、邮箱、公司或岗位。"
            : "Combine source, recommended-position and date sorting with candidate search.",
        resetFilters: isZh ? "重置筛选" : "Reset Filters",
        selectedCount: (count: number) => isZh ? "已选 " + count + " 人" : count + " selected",
        clearSelection: isZh ? "清空选择" : "Clear Selection",
        selectCurrentPage: isZh ? "全选当前页" : "Select Current Page",
        batchAssign: isZh ? "批量分配岗位" : "Batch Assign Position",
        batchReIdentify: isZh ? "批量重新识别" : "Batch Re-identify",
        batchDelete: isZh ? "批量删除" : "Batch Delete",
        activeStatFilter: (label: string) => isZh ? "正在查看：" + label : "Viewing: " + label,
        clearStatFilter: isZh ? "再次点击指标恢复全部" : "Click again to show all",
        statFiltering: isZh ? "筛选中" : "Filtering",
        aiRecognized: isZh ? "AI 识别" : "AI Match",
        aiMatchingGroup: isZh ? "AI 匹配中" : "AI Matching",
        aiMatchingHint: isZh
            ? "AI 正在分析简历匹配岗位，请稍候…"
            : "AI is analyzing resumes to match positions...",
        pendingGroup: isZh ? "待处理" : "Pending",
        unmatchedGroup: isZh ? "无法识别岗位" : "Unmatched",
        pendingGroupDesc: isZh
            ? "AI 未找到岗位，可重新识别或手动分配"
            : "AI did not find a position. Re-identify or assign manually.",
        archivedGroup: isZh ? "人才库中" : "In Talent Pool",
        archivedGroupTitle: isZh ? "已入库人才" : "Talent Pool Records",
        archivedGroupDesc: isZh
            ? "已进入人才库，可按来源阶段继续分配岗位"
            : "Already in the talent pool and ready for reassignment.",
        selectAllGroup: isZh ? "全选此分组" : "Select This Group",
        oneClickAssign: isZh ? "一键分配到此岗位" : "Assign to This Position",
        confirmMatch: isZh ? "确认归岗" : "Confirm Position",
        changePosition: isZh ? "换岗位" : "Change Position",
        manualAssign: isZh ? "手动分配" : "Manual Assign",
        assignPosition: isZh ? "分配岗位" : "Assign Position",
        reIdentify: isZh ? "重新识别" : "Re-identify",
        reIdentifying: isZh ? "识别中…" : "Identifying...",
        stopMatch: isZh ? "停止匹配" : "Stop Matching",
        view: isZh ? "查看" : "View",
        aiNoMatch: isZh
            ? "AI 未能匹配到系统现有岗位，请手动分配"
            : "AI could not match an existing position. Please assign manually.",
        aiStillNoMatch: isZh
            ? "重新识别后仍未找到匹配岗位"
            : "Still no match after re-identification",
        aiErrorDesc: isZh ? "AI 识别异常，请重新识别" : "AI error, please re-identify",
        sourceStage: isZh ? "来源阶段" : "Source Stage",
        sourceAiUnmatched: isZh ? "未匹配系统岗位" : "No System Position Match",
        sourceAiError: isZh ? "AI 识别异常" : "AI Error",
        sourceScreeningArchived: isZh ? "初筛完成后入库" : "Archived After Screening",
        sourceLegacyArchived: isZh ? "历史人才库数据" : "Legacy Talent Pool Record",
        archived: isZh ? "人才库中" : "In Talent Pool",
        matching: isZh ? "匹配中" : "Matching",
        candidatesCount: (count: number) => isZh ? count + " 人" : String(count),
        noCandidates: isZh ? "人才库暂无候选人" : "No candidates in the talent pool",
        noCandidatesDesc: isZh
            ? "上传简历时选择「暂不选择岗位」或「AI 智能匹配」，相关人才会出现在这里"
            : "Candidates uploaded without a position or through AI matching appear here.",
        noFilteredCandidates: isZh ? "当前筛选下暂无候选人" : "No candidates match these filters",
        noFilteredCandidatesDesc: isZh
            ? "调整指标或筛选条件后再试"
            : "Adjust the metric or filters and try again.",
        pageRange: (start: number, end: number, total: number) => isZh
            ? start + "-" + end + " / 共 " + total + " 条"
            : start + "-" + end + " of " + total,
        rowsPerPage: isZh ? "条/页" : "Rows/Page",
        previousPage: isZh ? "上一页" : "Previous",
        nextPage: isZh ? "下一页" : "Next",
        manualUpload: isZh ? "手动上传" : "Manual",
        bossZhipin: isZh ? "Boss直聘" : "Boss",
        liepin: isZh ? "猎聘" : "Liepin",
        headhunter: isZh ? "猎头推荐" : "Headhunter",
        otherSource: isZh ? "其他" : "Other",
        selectPosition: isZh ? "请选择岗位" : "Select a position",
        confirmAssign: isZh ? "确认分配" : "Confirm Assign",
        cancel: isZh ? "取消" : "Cancel",
        confirm: isZh ? "确认" : "Confirm",
        reIdentifyConfirmTitle: isZh ? "确认重新识别岗位" : "Confirm Re-identification",
        reIdentifyConfirmDescription: (count: number) => isZh
            ? "将对 " + count + " 位人才重新识别匹配岗位。"
            : "Re-identify matching positions for " + count + " talent record(s).",
        reIdentifyConfirmWarning: isZh
            ? "所选数据中包含非待识别人才。确认后这些人才也会重新进入岗位识别流程，原有来源阶段可能随新的识别结果更新。"
            : "The selection includes records that are not pending identification. Their source stage may change after re-identification.",
        reIdentifyConfirmIncludes: isZh ? "本次包含" : "Included",
        reIdentifyConfirmMore: (count: number) => isZh ? "等 " + count + " 人" : "and " + count + " more",
        confirmReIdentify: isZh ? "确认重新识别" : "Confirm Re-identify",
        deleteConfirmTitle: isZh ? "确认删除" : "Confirm Delete",
        deleteConfirmMsg: (count: number) => isZh
            ? "确认删除已选 " + count + " 位候选人？此操作不可撤销，简历数据将被永久移除。"
            : "Delete " + count + " candidate(s)? This cannot be undone.",
        potentialPrefix: isZh ? "转岗：" : "Potential: ",
    };
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
type TalentPoolPageProps = {
    candidates: CandidateSummary[];
    positions: PositionSummary[];
    loading: boolean;
    onAssignPosition: (candidateIds: number[], positionId: number | null) => Promise<void>;
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
    canManageCandidates?: boolean;
    preferredStatFilter?: TalentPoolStatFilter | null;
    onPreferredStatFilterApplied?: () => void;
};
type TalentPoolGroupTone = "primary" | "sky" | "amber" | "emerald";
type TalentPoolCandidateGroup = {
    key: string;
    badge: string;
    title: string;
    description: string;
    tone: TalentPoolGroupTone;
    candidates: CandidateSummary[];
    assignPositionId?: number | null;
};

const STATUS_LABEL_MAP: Record<string, string> = {
    pending_screening: "待初筛",
    screening_running: "初筛中",
    screening_passed: "初筛通过",
    screening_rejected: "初筛淘汰",
    pending_interview: "待面试",
    interview_passed: "面试通过",
    interview_rejected: "面试淘汰",
    pending_offer: "待发 Offer",
    offer_sent: "已发 Offer",
    hired: "已入职",
    new_imported: "新导入",
    matching: "匹配中",
    unmatched: "待识别",
    talent_pool: "人才库",
};

function sourceLabel(source: string | null | undefined, tr: ReturnType<typeof getTalentPoolLocale>) {
    if (!source) return tr.manualUpload;
    const labels: Record<string, string> = {
        manual_upload: tr.manualUpload,
        boss_zhipin: tr.bossZhipin,
        liepin: tr.liepin,
        headhunter: tr.headhunter,
        other: tr.otherSource,
    };
    return labels[source] || source;
}

function talentPoolReason(candidate: CandidateSummary) {
    return String(candidate.talent_pool_reason || "").trim().toLowerCase();
}

function isTalentPoolMatching(candidate: CandidateSummary) {
    return String(candidate.status || "").trim().toLowerCase() === "matching";
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

function resolveTalentPoolEnteredAt(candidate: CandidateSummary) {
    return candidate.talent_pool_moved_at || candidate.created_at || candidate.updated_at || null;
}

function isRecentTalentPoolCandidate(candidate: CandidateSummary, cutoffMs: number) {
    const enteredAt = resolveTalentPoolEnteredAt(candidate);
    const timestamp = enteredAt ? Date.parse(enteredAt) : Number.NaN;
    return Number.isFinite(timestamp) && timestamp >= cutoffMs;
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

function talentPoolSourceStageLabel(candidate: CandidateSummary, tr: ReturnType<typeof getTalentPoolLocale>) {
    const reason = talentPoolReason(candidate);
    if (reason === "unmatched_by_ai") return tr.sourceAiUnmatched;
    if (reason === "ai_error") return tr.sourceAiError;
    if (reason === "auto_archived") return tr.sourceScreeningArchived;
    if (reason === "moved_by_hr") {
        return STATUS_LABEL_MAP[candidate.talent_pool_source_status || ""]
            || candidate.talent_pool_source_status
            || tr.archived;
    }
    return tr.sourceLegacyArchived;
}

function talentPoolReidentifyGroupLabel(candidate: CandidateSummary, tr: ReturnType<typeof getTalentPoolLocale>) {
    if (isTalentPoolMatching(candidate)) return tr.matching;
    if (isNoSystemPositionCandidate(candidate)) return tr.unmatchedGroup;
    if (isIdentifyErrorCandidate(candidate)) return tr.identifyError;
    return talentPoolSourceStageLabel(candidate, tr);
}

function talentPoolCandidateName(candidate: CandidateSummary) {
    const name = String(candidate.name || "").trim() || "ID:" + candidate.id;
    const code = String(candidate.candidate_code || "").trim();
    return code ? name + "（" + code + "）" : name;
}

export function TalentPoolPage({
    candidates,
    positions,
    loading,
    onAssignPosition,
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
    canManageCandidates = true,
    preferredStatFilter,
    onPreferredStatFilterApplied,
}: TalentPoolPageProps) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getTalentPoolLocale(language), [language]);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [sourceFilter, setSourceFilter] = React.useState("all");
    const [tagFilter, setTagFilter] = React.useState("all");
    const [sortBy, setSortBy] = React.useState<"time" | "name" | "name_desc">("time");
    const [activeStatFilter, setActiveStatFilter] = React.useState<TalentPoolStatFilter>(() => preferredStatFilter || "all");
    const [statFilterPending, setStatFilterPending] = React.useState(false);
    const [advancedFilterOpen, setAdvancedFilterOpen] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
    const [initialLoadComplete, setInitialLoadComplete] = React.useState(candidates.length > 0);
    const [refreshing, setRefreshing] = React.useState(false);
    const [assignDialogOpen, setAssignDialogOpen] = React.useState(false);
    const [assignPositionId, setAssignPositionId] = React.useState("");
    const [assigning, setAssigning] = React.useState(false);
    const [singleAssignOpen, setSingleAssignOpen] = React.useState(false);
    const [singleAssignCandidateId, setSingleAssignCandidateId] = React.useState<number | null>(null);
    const [singleAssignPositionId, setSingleAssignPositionId] = React.useState("");
    const [singleAssigning, setSingleAssigning] = React.useState(false);
    const [groupAssigningKey, setGroupAssigningKey] = React.useState<string | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [reIdentifyConfirmOpen, setReIdentifyConfirmOpen] = React.useState(false);
    const [reIdentifyConfirmMode, setReIdentifyConfirmMode] = React.useState<"single" | "batch">("batch");
    const [reIdentifyConfirmCandidates, setReIdentifyConfirmCandidates] = React.useState<CandidateSummary[]>([]);
    const [reIdentifyConfirmSubmitting, setReIdentifyConfirmSubmitting] = React.useState(false);
    const [reIdentifyingIds, setReIdentifyingIds] = React.useState<Set<number>>(new Set());
    const [reIdentifyFailedIds, setReIdentifyFailedIds] = React.useState<Set<number>>(new Set());
    const statFilterTimerRef = React.useRef<number | null>(null);
    const queryChangeInitializedRef = React.useRef(false);
    const onQueryChangeRef = React.useRef(onQueryChange);
    const hasSeenInitialLoadingRef = React.useRef(false);
    const listScrollRef = React.useRef<HTMLDivElement | null>(null);
    const selectAllVisibleRef = React.useRef<HTMLInputElement | null>(null);

    const recentCutoffMs = React.useMemo(() => Date.now() - 7 * 24 * 60 * 60 * 1000, [candidates]);
    const localStats = React.useMemo<TalentPoolStats>(() => {
        const matching = candidates.filter(isTalentPoolMatching).length;
        const noSystemPosition = candidates.filter(isNoSystemPositionCandidate).length;
        const identifyError = candidates.filter(isIdentifyErrorCandidate).length;
        return {
            total: candidates.length,
            matching,
            pending_action: noSystemPosition + identifyError,
            no_system_position: noSystemPosition,
            identify_error: identifyError,
            week_new: candidates.filter((candidate) => isRecentTalentPoolCandidate(candidate, recentCutoffMs)).length,
        };
    }, [candidates, recentCutoffMs]);
    const stats = serverStats || localStats;
    const statCards = React.useMemo(() => ([
        {filter: "all" as const, label: tr.totalCandidates, value: stats.total, hint: tr.totalHint, tone: "primary" as const},
        {filter: "matching" as const, label: tr.matchingStat, value: stats.matching, hint: tr.matchingStatHint, tone: "sky" as const},
        {filter: "pending" as const, label: tr.pendingAction, value: stats.pending_action, hint: tr.pendingActionHint, tone: "amber" as const},
        {filter: "no_match" as const, label: tr.noSystemPosition, value: stats.no_system_position, hint: tr.noSystemPositionHint, tone: "orange" as const},
        {filter: "ai_error" as const, label: tr.identifyError, value: stats.identify_error, hint: tr.identifyErrorHint, tone: "rose" as const},
        {filter: "week_new" as const, label: tr.newThisWeek, value: stats.week_new, hint: tr.newThisWeekHint, tone: "emerald" as const},
    ]), [stats, tr]);
    const activeStatCard = React.useMemo(
        () => statCards.find((card) => card.filter === activeStatFilter) || statCards[0],
        [activeStatFilter, statCards],
    );
    const availableTags = React.useMemo(() => {
        if (serverAvailableTags?.length) return serverAvailableTags;
        return Array.from(new Set(candidates
            .map((candidate) => candidate.ai_match_position_title)
            .filter((value): value is string => Boolean(value)))).sort();
    }, [candidates, serverAvailableTags]);

    React.useEffect(() => {
        onQueryChangeRef.current = onQueryChange;
    }, [onQueryChange]);

    React.useEffect(() => () => {
        if (statFilterTimerRef.current) window.clearTimeout(statFilterTimerRef.current);
    }, []);

    React.useEffect(() => {
        if (!preferredStatFilter) return;
        setActiveStatFilter(preferredStatFilter);
        setSelectedIds(new Set());
        onPreferredStatFilterApplied?.();
    }, [onPreferredStatFilterApplied, preferredStatFilter]);

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
        if (!queryHandler) return undefined;
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

    const filteredCandidates = React.useMemo(() => {
        let result = candidates.filter((candidate) => matchesTalentPoolStatFilter(candidate, activeStatFilter, recentCutoffMs));
        const query = searchQuery.trim().toLowerCase();
        if (query) {
            result = result.filter((candidate) => [
                candidate.name,
                candidate.phone,
                candidate.email,
                candidate.current_company,
                candidate.ai_match_position_title,
                candidate.ai_potential_position,
            ].some((value) => String(value || "").toLowerCase().includes(query)));
        }
        if (sourceFilter !== "all") {
            result = result.filter((candidate) => (candidate.source || "manual_upload") === sourceFilter);
        }
        if (tagFilter !== "all") {
            result = tagFilter === "__none"
                ? result.filter((candidate) => !candidate.ai_match_position_title)
                : result.filter((candidate) => candidate.ai_match_position_title === tagFilter);
        }
        if (sortBy === "time") {
            result.sort((left, right) => String(resolveTalentPoolEnteredAt(right) || "").localeCompare(String(resolveTalentPoolEnteredAt(left) || "")));
        } else if (sortBy === "name") {
            result.sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "zh-CN"));
        } else {
            result.sort((left, right) => String(right.name || "").localeCompare(String(left.name || ""), "zh-CN"));
        }
        return result;
    }, [activeStatFilter, candidates, recentCutoffMs, searchQuery, sortBy, sourceFilter, tagFilter]);

    const candidateGroups = React.useMemo<TalentPoolCandidateGroup[]>(() => {
        const recognized = new Map<string, TalentPoolCandidateGroup>();
        const matching: CandidateSummary[] = [];
        const pending: CandidateSummary[] = [];
        const archived: CandidateSummary[] = [];
        filteredCandidates.forEach((candidate) => {
            if (isTalentPoolMatching(candidate)) {
                matching.push(candidate);
                return;
            }
            if (isPendingActionCandidate(candidate)) {
                pending.push(candidate);
                return;
            }
            if (candidate.ai_match_position_id && candidate.ai_match_position_title) {
                const key = "recognized-" + candidate.ai_match_position_id;
                const current = recognized.get(key) || {
                    key,
                    badge: tr.aiRecognized,
                    title: candidate.ai_match_position_title,
                    description: sanitizeCandidateFacingErrorText(candidate.ai_match_reason || "", {
                        context: "position_match",
                        language,
                    }) || tr.aiRecognized,
                    tone: "primary" as const,
                    candidates: [],
                    assignPositionId: candidate.ai_match_position_id,
                };
                current.candidates.push(candidate);
                recognized.set(key, current);
                return;
            }
            archived.push(candidate);
        });
        const groups = Array.from(recognized.values());
        if (matching.length) {
            groups.push({
                key: "matching",
                badge: tr.matchingStat,
                title: tr.aiMatchingGroup,
                description: tr.aiMatchingHint,
                tone: "sky",
                candidates: matching,
            });
        }
        if (pending.length) {
            groups.push({
                key: "pending",
                badge: tr.pendingGroup,
                title: tr.unmatchedGroup,
                description: tr.pendingGroupDesc,
                tone: "amber",
                candidates: pending,
            });
        }
        if (archived.length) {
            groups.push({
                key: "archived",
                badge: tr.archivedGroup,
                title: tr.archivedGroupTitle,
                description: tr.archivedGroupDesc,
                tone: "emerald",
                candidates: archived,
            });
        }
        return groups;
    }, [filteredCandidates, language, tr]);

    const totalForPagination = total ?? filteredCandidates.length;
    const totalPages = Math.max(1, Math.ceil(Math.max(0, totalForPagination) / Math.max(1, pageSize)));
    React.useEffect(() => {
        if (totalForPagination > 0 && pageIndex >= totalPages) {
            setPageIndex(totalPages - 1);
        }
    }, [pageIndex, setPageIndex, totalForPagination, totalPages]);

    React.useEffect(() => {
        listScrollRef.current?.scrollTo({top: 0, behavior: "auto"});
        setSelectedIds((current) => current.size === 0 ? current : new Set());
    }, [activeStatFilter, pageIndex, pageSize, searchQuery, sourceFilter, tagFilter, sortBy]);

    const selectedCandidates = React.useMemo(() => Array.from(selectedIds)
        .map((candidateId) => candidates.find((candidate) => candidate.id === candidateId))
        .filter((candidate): candidate is CandidateSummary => Boolean(candidate)), [candidates, selectedIds]);
    const selectedReidentifyCandidates = React.useMemo(
        () => selectedCandidates.filter(isTalentPoolReidentifyTarget),
        [selectedCandidates],
    );
    const selectedVisibleCount = React.useMemo(
        () => filteredCandidates.reduce((count, candidate) => count + (selectedIds.has(candidate.id) ? 1 : 0), 0),
        [filteredCandidates, selectedIds],
    );
    const allVisibleSelected = filteredCandidates.length > 0 && selectedVisibleCount === filteredCandidates.length;
    const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
    React.useEffect(() => {
        if (selectAllVisibleRef.current) selectAllVisibleRef.current.indeterminate = someVisibleSelected;
    }, [someVisibleSelected]);

    React.useEffect(() => {
        setReIdentifyingIds((current) => {
            if (current.size === 0) return current;
            const next = new Set<number>();
            current.forEach((candidateId) => {
                const candidate = candidates.find((item) => item.id === candidateId);
                if (candidate && String(candidate.status || "").toLowerCase() === "unmatched") {
                    next.add(candidateId);
                }
            });
            return next.size === current.size ? current : next;
        });
    }, [candidates]);

    const handleStatFilterClick = React.useCallback((filter: TalentPoolStatFilter) => {
        const nextFilter = activeStatFilter === filter ? "all" : filter;
        if (statFilterTimerRef.current) window.clearTimeout(statFilterTimerRef.current);
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

    const toggleSelect = React.useCallback((candidateId: number) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(candidateId)) next.delete(candidateId);
            else next.add(candidateId);
            return next;
        });
    }, []);

    const selectGroup = React.useCallback((candidateIds: number[]) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            const allSelected = candidateIds.every((candidateId) => next.has(candidateId));
            candidateIds.forEach((candidateId) => {
                if (allSelected) next.delete(candidateId);
                else next.add(candidateId);
            });
            return next;
        });
    }, []);

    const resetFilters = React.useCallback(() => {
        setSearchQuery("");
        setSourceFilter("all");
        setTagFilter("all");
        setSortBy("time");
        setActiveStatFilter("all");
        setSelectedIds(new Set());
    }, []);

    const handleBatchAssign = React.useCallback(async () => {
        if (!assignPositionId || selectedIds.size === 0) return;
        setAssigning(true);
        try {
            await onAssignPosition(Array.from(selectedIds), Number(assignPositionId));
            setSelectedIds(new Set());
            setAssignDialogOpen(false);
            setAssignPositionId("");
        } catch {
            // 容器负责展示接口错误；保留弹窗和当前选择，便于用户重试。
        } finally {
            setAssigning(false);
        }
    }, [assignPositionId, onAssignPosition, selectedIds]);

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
            setSingleAssignCandidateId(null);
            setSingleAssignPositionId("");
            await onRefresh?.();
        } catch {
            // 容器负责展示接口错误；保留弹窗，避免失败后误判为已分配。
        } finally {
            setSingleAssigning(false);
        }
    }, [onAssignPosition, onRefresh, singleAssignCandidateId, singleAssignPositionId]);

    const handleGroupAssign = React.useCallback(async (group: TalentPoolCandidateGroup) => {
        if (!group.assignPositionId || group.candidates.length === 0 || groupAssigningKey) return;
        setGroupAssigningKey(group.key);
        try {
            await onAssignPosition(group.candidates.map((candidate) => candidate.id), group.assignPositionId);
            setSelectedIds((current) => {
                const next = new Set(current);
                group.candidates.forEach((candidate) => next.delete(candidate.id));
                return next;
            });
        } catch {
            // 容器负责展示接口错误；分组仍保留在当前列表中。
        } finally {
            setGroupAssigningKey(null);
        }
    }, [groupAssigningKey, onAssignPosition]);

    const runReIdentify = React.useCallback(async (
        candidateIds: number[],
        options: {single?: boolean; clearSelection?: boolean} = {},
    ) => {
        const uniqueIds = Array.from(new Set(candidateIds));
        if (!uniqueIds.length) return;
        setReIdentifyingIds((current) => {
            const next = new Set(current);
            uniqueIds.forEach((candidateId) => next.add(candidateId));
            return next;
        });
        setReIdentifyFailedIds((current) => {
            const next = new Set(current);
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
            if (options.clearSelection) setSelectedIds(new Set());
        } catch (error) {
            setReIdentifyFailedIds((current) => {
                const next = new Set(current);
                uniqueIds.forEach((candidateId) => next.add(candidateId));
                return next;
            });
            setReIdentifyingIds((current) => {
                const next = new Set(current);
                uniqueIds.forEach((candidateId) => next.delete(candidateId));
                return next;
            });
            throw error;
        }
    }, [onBatchReIdentify, onReIdentify]);

    const requestReIdentify = React.useCallback((targetCandidates: CandidateSummary[], mode: "single" | "batch") => {
        const candidatesToIdentify = targetCandidates.filter(isTalentPoolReidentifyTarget);
        if (!candidatesToIdentify.length) return;
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

    const handleConfirmReIdentify = React.useCallback(async () => {
        const candidateIds = reIdentifyConfirmCandidates
            .filter(isTalentPoolReidentifyTarget)
            .map((candidate) => candidate.id);
        if (!candidateIds.length || reIdentifyConfirmSubmitting) return;
        setReIdentifyConfirmSubmitting(true);
        try {
            await runReIdentify(candidateIds, {
                single: reIdentifyConfirmMode === "single",
                clearSelection: reIdentifyConfirmMode === "batch",
            });
            setReIdentifyConfirmOpen(false);
            setReIdentifyConfirmCandidates([]);
        } catch {
            // runReIdentify 已记录失败项，保留确认弹窗供用户重试。
        } finally {
            setReIdentifyConfirmSubmitting(false);
        }
    }, [reIdentifyConfirmCandidates, reIdentifyConfirmMode, reIdentifyConfirmSubmitting, runReIdentify]);

    const handleBatchDelete = React.useCallback(async () => {
        if (!onDeleteCandidates || selectedIds.size === 0) return;
        setDeleting(true);
        try {
            await onDeleteCandidates(Array.from(selectedIds));
            setSelectedIds(new Set());
            setDeleteDialogOpen(false);
        } catch {
            // 容器负责展示接口错误；保留确认弹窗和选择。
        } finally {
            setDeleting(false);
        }
    }, [onDeleteCandidates, selectedIds]);

    const reIdentifyConfirmGroups = React.useMemo(() => {
        const groups = new Map<string, {label: string; candidates: CandidateSummary[]}>();
        reIdentifyConfirmCandidates.forEach((candidate) => {
            const label = talentPoolReidentifyGroupLabel(candidate, tr);
            const group = groups.get(label) || {label, candidates: []};
            group.candidates.push(candidate);
            groups.set(label, group);
        });
        return Array.from(groups.values());
    }, [reIdentifyConfirmCandidates, tr]);
    const reIdentifyConfirmHasNonPending = React.useMemo(
        () => reIdentifyConfirmCandidates.some(needsTalentPoolReidentifyConfirmation),
        [reIdentifyConfirmCandidates],
    );
    const showInitialPageLoading = loading && candidates.length === 0 && !initialLoadComplete;
    const showInlineUpdating = loading && !showInitialPageLoading;

    if (showInitialPageLoading) {
        return (
            <div className="flex h-full items-center justify-center bg-white">
                <div className="flex items-center gap-2 text-[12px] text-[#86888F]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#1E3BFA]"/>
                    {tr.updatingList}
                </div>
            </div>
        );
    }

    return (
        <div ref={listScrollRef} data-talent-pool-list-scroll="true" className="h-full min-h-0 overflow-auto bg-white text-[#0E1114]">
            <div className="min-w-0 px-8 pb-12 pt-5">
                <header className="mb-4 flex items-center justify-between gap-6">
                    <div className="flex min-w-0 items-center gap-3.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#1E3BFA] text-white">
                            <BadgeCheck className="h-[15px] w-[15px]" strokeWidth={1.9}/>
                        </span>
                        <div className="flex min-w-0 items-baseline gap-3">
                            <h1 className="shrink-0 text-[18px] font-semibold leading-7 text-[#0E1114]">{tr.title}</h1>
                            <p className="truncate text-[12px] leading-5 text-[#B0B2B8]">{tr.description}</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        {canManageCandidates && onUploadResume ? (
                            <Button className="h-9 rounded-[6px] bg-[#1E3BFA] px-[18px] text-[14px] font-normal text-white shadow-none hover:bg-[#0F23D9]" onClick={onUploadResume}>
                                <Upload className="mr-1.5 h-3.5 w-3.5"/>
                                {tr.uploadResume}
                            </Button>
                        ) : null}
                        {onRefresh ? (
                            <Button
                                variant="outline"
                                className="h-9 rounded-[6px] border-[#E6E7EB] bg-white px-4 text-[14px] font-normal text-[#33353D] shadow-none hover:border-[#1E3BFA]/40 hover:bg-[#F7F8FA] hover:text-[#1E3BFA]"
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
                                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")}/>
                                {tr.refresh}
                            </Button>
                        ) : null}
                    </div>
                </header>

                <section className="mb-4 grid grid-cols-6 gap-4" aria-label={tr.clearStatFilter}>
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
                </section>

                <div className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-x-6 gap-y-3 2xl:flex-nowrap">
                    <div className="flex shrink-0 items-center gap-6">
                        <ToolbarSelect value={sourceFilter} onChange={setSourceFilter} label={tr.allSources}>
                            <option value="all">{tr.allSources}</option>
                            <option value="boss_zhipin">{tr.bossZhipin}</option>
                            <option value="liepin">{tr.liepin}</option>
                            <option value="manual_upload">{tr.manualUpload}</option>
                            <option value="headhunter">{tr.headhunter}</option>
                            <option value="other">{tr.otherSource}</option>
                        </ToolbarSelect>
                        <ToolbarSelect value={tagFilter} onChange={setTagFilter} label={tr.allRecommendedPositions}>
                            <option value="all">{tr.allRecommendedPositions}</option>
                            {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                            <option value="__none">{tr.unmatchedGroup}</option>
                        </ToolbarSelect>
                        <ToolbarSelect value={sortBy} onChange={(value) => setSortBy(value as typeof sortBy)} label={tr.sortByTime}>
                            <option value="time">{tr.sortByTime}</option>
                            <option value="name">{tr.sortByName}</option>
                            <option value="name_desc">{tr.sortByNameDesc}</option>
                        </ToolbarSelect>
                        <button type="button" className="text-[12px] text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => setAdvancedFilterOpen((open) => !open)}>
                            {tr.advancedFilter}
                        </button>
                        {statFilterPending ? (
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-[#86888F]">
                                <Loader2 className="h-3 w-3 animate-spin text-[#1E3BFA]"/>
                                {tr.statFiltering}
                            </span>
                        ) : activeStatFilter !== "all" ? (
                            <button type="button" title={tr.clearStatFilter} className="text-[12px] text-[#86888F] hover:text-[#1E3BFA]" onClick={() => handleStatFilterClick(activeStatFilter)}>
                                {tr.activeStatFilter(activeStatCard.label)}
                            </button>
                        ) : null}
                    </div>
                    <div className="flex min-w-0 items-center gap-4">
                        <div className="relative w-[300px] shrink-0">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#B0B2B8]"/>
                            <Input
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder={tr.searchPlaceholder}
                                className="h-8 rounded-[4px] border-[#E6E7EB] bg-white pl-9 pr-3 text-[12px] text-[#33353D] shadow-none placeholder:text-[#B0B2B8] focus-visible:border-[#1E3BFA] focus-visible:ring-[#1E3BFA]/10"
                            />
                        </div>
                        {canManageCandidates ? (
                            <>
                                <button type="button" disabled={selectedIds.size === 0} className="whitespace-nowrap text-[12px] text-[#0F23D9] hover:text-[#1E3BFA] disabled:cursor-not-allowed disabled:text-[#B0B2B8]" onClick={() => setAssignDialogOpen(true)}>{tr.batchAssign}</button>
                                <button type="button" disabled={selectedReidentifyCandidates.length === 0} className="whitespace-nowrap text-[12px] text-[#0F23D9] hover:text-[#1E3BFA] disabled:cursor-not-allowed disabled:text-[#B0B2B8]" onClick={() => requestReIdentify(selectedReidentifyCandidates, "batch")}>{tr.batchReIdentify}</button>
                                {onDeleteCandidates ? (
                                    <button type="button" disabled={selectedIds.size === 0} className="whitespace-nowrap text-[12px] text-[#F53F3F] hover:text-[#d92d2d] disabled:cursor-not-allowed disabled:text-[#B0B2B8]" onClick={() => setDeleteDialogOpen(true)}>{tr.batchDelete}</button>
                                ) : null}
                            </>
                        ) : null}
                    </div>
                </div>

                {advancedFilterOpen ? (
                    <div className="mb-4 flex h-10 items-center justify-between rounded-[6px] border border-[#EBEEF5] bg-[#F7F8FA] px-4 text-[12px] text-[#86888F]">
                        <span>{tr.filterSummary}</span>
                        <button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA]" onClick={resetFilters}>{tr.resetFilters}</button>
                    </div>
                ) : null}

                {canManageCandidates && filteredCandidates.length > 0 ? (
                    <div className={cn("mb-3 flex h-8 items-center justify-end gap-4 text-[12px]", selectedIds.size > 0 ? "text-[#33353D]" : "text-[#86888F]")}>
                        <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                                ref={selectAllVisibleRef}
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={() => selectGroup(filteredCandidates.map((candidate) => candidate.id))}
                                className="h-3.5 w-3.5 rounded-[3px] border-[#D6D8DD] accent-[#1E3BFA]"
                            />
                            {tr.selectCurrentPage}
                        </label>
                        {selectedIds.size > 0 ? (
                            <>
                                <span className="text-[#1E3BFA]">{tr.selectedCount(selectedIds.size)}</span>
                                <button type="button" className="text-[#86888F] hover:text-[#1E3BFA]" onClick={() => setSelectedIds(new Set())}>{tr.clearSelection}</button>
                            </>
                        ) : null}
                    </div>
                ) : null}

                {showInlineUpdating ? (
                    <div className="mb-3 flex h-8 items-center gap-2 rounded-[6px] border border-[#E6E7EB] bg-[#F7F8FA] px-3 text-[12px] text-[#86888F]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1E3BFA]"/>
                        {tr.updatingList}
                    </div>
                ) : null}

                {filteredCandidates.length === 0 ? (
                    <div className="flex min-h-[360px] items-center justify-center rounded-[8px] border border-[#EBEEF5] bg-white text-center">
                        <div>
                            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(30,59,250,0.06)] text-[#1E3BFA]">
                                <Users className="h-5 w-5"/>
                            </span>
                            <h3 className="mt-3 text-[14px] font-medium text-[#33353D]">{activeStatFilter === "all" ? tr.noCandidates : tr.noFilteredCandidates}</h3>
                            <p className="mt-1 max-w-[520px] text-[12px] leading-5 text-[#86888F]">{activeStatFilter === "all" ? tr.noCandidatesDesc : tr.noFilteredCandidatesDesc}</p>
                            {(activeStatFilter !== "all" || sourceFilter !== "all" || tagFilter !== "all" || searchQuery) ? (
                                <button type="button" className="mt-3 text-[12px] text-[#0F23D9] hover:text-[#1E3BFA]" onClick={resetFilters}>{tr.resetFilters}</button>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className={cn("space-y-5 transition-opacity", statFilterPending && "opacity-60")}>
                        {candidateGroups.map((group) => {
                            const groupIds = group.candidates.map((candidate) => candidate.id);
                            const groupSelected = groupIds.length > 0 && groupIds.every((candidateId) => selectedIds.has(candidateId));
                            return (
                                <section key={group.key} className="overflow-x-auto rounded-[8px] border border-[#EBEEF5] bg-white">
                                    <div className="flex h-[46px] min-w-[1020px] items-center justify-between border-b border-[#F2F3F5] bg-[#F8F8F9] px-5">
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <GroupBadge tone={group.tone}>{group.badge}</GroupBadge>
                                            <h2 className="shrink-0 text-[14px] font-semibold text-[#0E1114]">{group.title}</h2>
                                            <span className="truncate text-[12px] text-[#B0B2B8]">{tr.candidatesCount(group.candidates.length)} · {group.description}</span>
                                        </div>
                                        {canManageCandidates ? (
                                            <div className="flex shrink-0 items-center gap-4">
                                                <button type="button" className={cn("text-[12px] hover:text-[#1E3BFA]", groupSelected ? "text-[#1E3BFA]" : "text-[#0F23D9]")} onClick={() => selectGroup(groupIds)}>{tr.selectAllGroup}</button>
                                                {group.assignPositionId ? (
                                                    <button type="button" disabled={groupAssigningKey !== null} className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-[#1E3BFA] px-3 text-[12px] text-[#1E3BFA] hover:bg-[rgba(30,59,250,0.06)] disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void handleGroupAssign(group)}>
                                                        {groupAssigningKey === group.key ? <Loader2 className="h-3 w-3 animate-spin"/> : null}
                                                        {tr.oneClickAssign}
                                                    </button>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div>
                                        {group.candidates.map((candidate) => {
                                            const matching = isTalentPoolMatching(candidate);
                                            const archived = !matching && !isPendingActionCandidate(candidate);
                                            const recognizedPositionId = candidate.ai_match_position_id || null;
                                            return (
                                                <CandidateRow
                                                    key={candidate.id}
                                                    candidate={candidate}
                                                    selected={selectedIds.has(candidate.id)}
                                                    reIdentifying={reIdentifyingIds.has(candidate.id)}
                                                    reIdentifyFailed={reIdentifyFailedIds.has(candidate.id)}
                                                    onToggleSelect={canManageCandidates ? () => toggleSelect(candidate.id) : undefined}
                                                    onConfirmMatch={canManageCandidates && recognizedPositionId ? () => void onAssignPosition([candidate.id], recognizedPositionId).catch(() => undefined) : undefined}
                                                    onChangePosition={canManageCandidates && recognizedPositionId ? () => openSingleAssign(candidate.id) : undefined}
                                                    onCancelMatch={canManageCandidates && matching && onCancelMatch ? () => void onCancelMatch(candidate.id) : undefined}
                                                    onReIdentify={canManageCandidates && !matching ? () => requestReIdentify([candidate], "single") : undefined}
                                                    onManualAssign={canManageCandidates && !matching && !recognizedPositionId ? () => openSingleAssign(candidate.id) : undefined}
                                                    onView={() => onViewCandidate(candidate.id)}
                                                    tr={tr}
                                                    language={language}
                                                    isMatching={matching}
                                                    isArchived={archived}
                                                />
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}

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

            <AssignmentDialog
                open={assignDialogOpen}
                onOpenChange={(open) => !assigning && setAssignDialogOpen(open)}
                title={tr.batchAssign}
                description={tr.selectedCount(selectedIds.size)}
                value={assignPositionId}
                onValueChange={setAssignPositionId}
                positions={positions}
                placeholder={tr.selectPosition}
                cancelLabel={tr.cancel}
                confirmLabel={tr.confirmAssign}
                submitting={assigning}
                onConfirm={() => void handleBatchAssign()}
            />
            <AssignmentDialog
                open={singleAssignOpen}
                onOpenChange={(open) => !singleAssigning && setSingleAssignOpen(open)}
                title={tr.manualAssign}
                description={tr.selectPosition}
                value={singleAssignPositionId}
                onValueChange={setSingleAssignPositionId}
                positions={positions}
                placeholder={tr.selectPosition}
                cancelLabel={tr.cancel}
                confirmLabel={tr.confirmAssign}
                submitting={singleAssigning}
                onConfirm={() => void handleSingleAssign()}
            />

            <Dialog open={reIdentifyConfirmOpen} onOpenChange={(open) => !reIdentifyConfirmSubmitting && setReIdentifyConfirmOpen(open)}>
                <DialogContent className="max-h-[86vh] gap-0 overflow-hidden rounded-[8px] border-[#EBEEF5] bg-white p-0 text-[#0E1114] shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[600px]">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-6 pb-3.5 pr-14 pt-[18px] text-left">
                        <DialogTitle className="text-[16px] font-semibold text-[#0E1114]">{tr.reIdentifyConfirmTitle}</DialogTitle>
                        <DialogDescription className="text-[12px] text-[#86888F]">{tr.reIdentifyConfirmDescription(reIdentifyConfirmCandidates.length)}</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 overflow-y-auto px-6 py-5">
                        {reIdentifyConfirmHasNonPending ? (
                            <div className="mb-4 rounded-[6px] border border-[rgba(255,171,36,0.35)] bg-[rgba(255,171,36,0.08)] px-3 py-2 text-[12px] leading-5 text-[#D48806]">{tr.reIdentifyConfirmWarning}</div>
                        ) : null}
                        <div className="rounded-[6px] border border-[#EBEEF5] bg-[#F7F8FA] p-3">
                            <div className="mb-2 text-[12px] font-medium text-[#5E5F66]">{tr.reIdentifyConfirmIncludes}</div>
                            <div className="space-y-2">
                                {reIdentifyConfirmGroups.map((group) => {
                                    const visibleNames = group.candidates.slice(0, 4).map(talentPoolCandidateName);
                                    const hiddenCount = Math.max(0, group.candidates.length - visibleNames.length);
                                    return (
                                        <div key={group.label} className="rounded-[6px] border border-[#F2F3F5] bg-white px-3 py-2">
                                            <div className="flex items-center justify-between gap-3 text-[12px]">
                                                <span className="font-medium text-[#33353D]">{group.label}</span>
                                                <span className="text-[#86888F]">{tr.candidatesCount(group.candidates.length)}</span>
                                            </div>
                                            <p className="mt-1 text-[11px] leading-[18px] text-[#86888F]">{visibleNames.join("、")}{hiddenCount > 0 ? "，" + tr.reIdentifyConfirmMore(hiddenCount) : ""}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="h-16 items-center gap-3 border-t border-[#F2F3F5] px-6 sm:justify-end">
                        <Button variant="outline" className="h-9 rounded-[6px] border-[#E6E7EB] px-4 shadow-none" onClick={() => setReIdentifyConfirmOpen(false)} disabled={reIdentifyConfirmSubmitting}>{tr.cancel}</Button>
                        <Button className="h-9 rounded-[6px] bg-[#1E3BFA] px-4 text-white shadow-none hover:bg-[#0F23D9]" onClick={() => void handleConfirmReIdentify()} disabled={reIdentifyConfirmSubmitting}>
                            {reIdentifyConfirmSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <RotateCcw className="mr-1 h-4 w-4"/>}
                            {tr.confirmReIdentify}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteDialogOpen} onOpenChange={(open) => !deleting && setDeleteDialogOpen(open)}>
                <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-[#EBEEF5] bg-white p-0 text-[#0E1114] shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[480px]">
                    <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-6 pb-3.5 pr-14 pt-[18px] text-left">
                        <DialogTitle className="text-[16px] font-semibold text-[#0E1114]">{tr.deleteConfirmTitle}</DialogTitle>
                        <DialogDescription className="text-[12px] leading-5 text-[#86888F]">{tr.deleteConfirmMsg(selectedIds.size)}</DialogDescription>
                    </DialogHeader>
                    <div className="px-6 py-5">
                        <div className="rounded-[6px] border border-[rgba(245,63,63,0.22)] bg-[rgba(245,63,63,0.05)] px-4 py-3 text-[12px] text-[#F53F3F]">{tr.selectedCount(selectedIds.size)}</div>
                    </div>
                    <DialogFooter className="h-16 items-center gap-3 border-t border-[#F2F3F5] px-6 sm:justify-end">
                        <Button variant="outline" className="h-9 rounded-[6px] border-[#E6E7EB] px-4 shadow-none" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>{tr.cancel}</Button>
                        <Button className="h-9 rounded-[6px] bg-[#F53F3F] px-4 text-white shadow-none hover:bg-[#d92d2d]" onClick={() => void handleBatchDelete()} disabled={deleting}>
                            {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <Trash2 className="mr-1 h-4 w-4"/>}
                            {tr.confirm}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function ToolbarSelect({
    value,
    onChange,
    label,
    children,
}: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="relative inline-flex h-8 items-center">
            <span className="sr-only">{label}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 max-w-[180px] appearance-none bg-transparent py-0 pl-0 pr-5 text-[12px] text-[#33353D] outline-none hover:text-[#1E3BFA]">
                {children}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 h-3 w-3 text-[#86888F]"/>
        </label>
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
    tone: "primary" | "sky" | "amber" | "orange" | "rose" | "emerald";
    active: boolean;
    loading: boolean;
    onClick: () => void;
}) {
    const accent: Record<typeof tone, string> = {
        primary: "bg-[#1E3BFA]",
        sky: "bg-[#2E9CFF]",
        amber: "bg-[#FFAB24]",
        orange: "bg-[#FFAB24]",
        rose: "bg-[#F53F3F]",
        emerald: "bg-[#0CC991]",
    };
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={cn(
                "relative min-w-0 rounded-[8px] border bg-white px-5 py-4 text-left transition-colors",
                active ? "border-[#1E3BFA]" : "border-[#EBEEF5] hover:border-[#1E3BFA]/45",
            )}
        >
            {loading ? <span className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-[#1E3BFA]"/> : null}
            <span className="flex items-center gap-2 text-[12px] text-[#33353D]">
                <span className={cn("h-3 w-[3px] rounded-[2px]", accent[tone])}/>
                <span className="truncate">{label}</span>
            </span>
            <span className="mt-1.5 block text-[28px] font-semibold leading-8 tabular-nums text-[#0E1114]">{value}</span>
            <span className="mt-1 block truncate text-[11px] leading-[18px] text-[#B0B2B8]">{hint}</span>
        </button>
    );
}

function GroupBadge({tone, children}: {tone: TalentPoolGroupTone; children: React.ReactNode}) {
    const toneClass: Record<TalentPoolGroupTone, string> = {
        primary: "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]",
        sky: "bg-[rgba(46,156,255,0.10)] text-[#2E9CFF]",
        amber: "bg-[rgba(255,171,36,0.12)] text-[#D48806]",
        emerald: "bg-[rgba(12,201,145,0.10)] text-[#0A9C71]",
    };
    return <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-[4px] px-2 text-[12px]", toneClass[tone])}>{children}</span>;
}

function CandidateRow({
    candidate,
    selected,
    reIdentifying,
    reIdentifyFailed,
    onToggleSelect,
    onConfirmMatch,
    onChangePosition,
    onReIdentify,
    onCancelMatch,
    onManualAssign,
    onView,
    tr,
    language,
    isMatching,
    isArchived,
}: {
    candidate: CandidateSummary;
    selected: boolean;
    reIdentifying: boolean;
    reIdentifyFailed: boolean;
    onToggleSelect?: () => void;
    onConfirmMatch?: () => void;
    onChangePosition?: () => void;
    onReIdentify?: () => void;
    onCancelMatch?: () => void;
    onManualAssign?: () => void;
    onView: () => void;
    tr: ReturnType<typeof getTalentPoolLocale>;
    language: string;
    isMatching: boolean;
    isArchived: boolean;
}) {
    const enteredAt = resolveTalentPoolEnteredAt(candidate);
    const sourceStage = talentPoolSourceStageLabel(candidate, tr);
    const profile = [
        candidate.years_of_experience,
        candidate.education,
        candidate.city,
        candidate.phone || candidate.candidate_code,
    ].filter(Boolean).join(" · ");
    const tags = Array.isArray(candidate.tags) ? candidate.tags.filter(Boolean).slice(0, 3) : [];
    const explanation = reIdentifyFailed
        ? tr.aiStillNoMatch
        : sanitizeCandidateFacingErrorText(candidate.ai_match_reason || "", {
            context: "position_match",
            language,
        }) || (isMatching ? tr.aiMatchingHint : (isPendingActionCandidate(candidate) ? tr.aiNoMatch : ""));
    const sourceTone = isIdentifyErrorCandidate(candidate)
        ? "text-[#F53F3F]"
        : isNoSystemPositionCandidate(candidate)
            ? "text-[#D48806]"
            : isMatching
                ? "text-[#2E9CFF]"
                : talentPoolReason(candidate) === "auto_archived"
                    ? "text-[#0A9C71]"
                    : "text-[#86888F]";
    const avatarColors = ["bg-[#1E3BFA]", "bg-[#2E9CFF]", "bg-[#0CC991]", "bg-[#7B61FF]", "bg-[#FFAB24]", "bg-[#F53F3F]"];
    const avatarClass = avatarColors[Math.abs(candidate.id) % avatarColors.length];
    const actionClass = "whitespace-nowrap text-[12px] text-[#0F23D9] hover:text-[#1E3BFA] disabled:cursor-not-allowed disabled:text-[#B0B2B8]";
    return (
        <div className={cn(
            "grid min-h-14 w-full min-w-[1020px] items-center border-b border-[#F2F3F5] text-[12px] text-[#0F1014] last:border-b-0 hover:bg-[#F8F8F9]",
            "[grid-template-columns:40px_minmax(210px,1.35fr)_minmax(250px,2.2fr)_minmax(132px,.9fr)_minmax(138px,.9fr)_230px]",
            selected && "bg-[rgba(30,59,250,0.025)]",
        )}>
            <div className="flex items-center justify-center">
                {onToggleSelect ? (
                    <input type="checkbox" checked={selected} onChange={onToggleSelect} className="h-3.5 w-3.5 rounded-[3px] border-[#D6D8DD] accent-[#1E3BFA]"/>
                ) : null}
            </div>
            <div className="flex min-w-0 items-center gap-2.5 pr-4">
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] text-white", avatarClass)}>
                    {String(candidate.name || "?").trim().slice(0, 1)}
                </span>
                <div className="min-w-0">
                    <button type="button" className="block max-w-full truncate text-left text-[13px] font-medium text-[#0F23D9] hover:text-[#1E3BFA]" onClick={onView}>
                        {candidate.name || "ID:" + candidate.id}
                    </button>
                    <p className="mt-0.5 truncate text-[11px] leading-4 text-[#B0B2B8]" title={profile}>{profile || sourceLabel(candidate.source, tr)}</p>
                </div>
            </div>
            <div className="min-w-0 pr-5">
                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                    {tags.map((tag) => (
                        <span key={tag} className="inline-flex h-5 max-w-[110px] shrink-0 items-center truncate rounded-[4px] bg-[rgba(30,59,250,0.06)] px-2 text-[11px] text-[#1E3BFA]" title={tag}>{tag}</span>
                    ))}
                    {candidate.ai_potential_position ? (
                        <span className="inline-flex h-5 max-w-[150px] shrink-0 items-center truncate rounded-[4px] bg-[rgba(12,201,145,0.08)] px-2 text-[11px] text-[#0A9C71]" title={candidate.ai_potential_reason || candidate.ai_potential_position}>
                            {tr.potentialPrefix}{candidate.ai_potential_position}
                        </span>
                    ) : null}
                    {!tags.length && !candidate.ai_potential_position ? <span className="text-[#B0B2B8]">—</span> : null}
                </div>
                {explanation ? <p className="mt-0.5 truncate text-[11px] leading-4 text-[#B0B2B8]" title={explanation}>{explanation}</p> : null}
            </div>
            <div className={cn("min-w-0 truncate pr-4 text-[12px]", sourceTone)} title={tr.sourceStage + "：" + sourceStage}>
                {sourceStage}
            </div>
            <div className="min-w-0 truncate pr-4 tabular-nums text-[#86888F]" title={enteredAt ? formatDateTime(enteredAt) : undefined}>
                {enteredAt ? formatDateTime(enteredAt) : "—"}
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3.5 gap-y-1 pr-4">
                {onConfirmMatch ? <button type="button" className={actionClass} onClick={onConfirmMatch}>{tr.confirmMatch}</button> : null}
                {onChangePosition ? <button type="button" className={actionClass} onClick={onChangePosition}>{tr.changePosition}</button> : null}
                {onReIdentify ? (
                    <button type="button" className={actionClass} onClick={onReIdentify} disabled={reIdentifying}>
                        {reIdentifying ? tr.reIdentifying : tr.reIdentify}
                    </button>
                ) : null}
                {onManualAssign ? <button type="button" className={actionClass} onClick={onManualAssign}>{isArchived ? tr.assignPosition : tr.manualAssign}</button> : null}
                {onCancelMatch ? <button type="button" className="whitespace-nowrap text-[12px] text-[#F53F3F] hover:text-[#d92d2d]" onClick={onCancelMatch}>{tr.stopMatch}</button> : null}
                <button type="button" className={actionClass} onClick={onView}>{tr.view}</button>
            </div>
        </div>
    );
}

function PositionSelect({
    value,
    onChange,
    positions,
    placeholder,
}: {
    value: string;
    onChange: (value: string) => void;
    positions: PositionSummary[];
    placeholder: string;
}) {
    return (
        <div className="relative">
            <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-[6px] border border-[#E6E7EB] bg-white px-3 pr-9 text-[13px] text-[#33353D] outline-none focus:border-[#1E3BFA] focus:ring-2 focus:ring-[#1E3BFA]/10">
                <option value="">{placeholder}</option>
                {positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#86888F]"/>
        </div>
    );
}

function AssignmentDialog({
    open,
    onOpenChange,
    title,
    description,
    value,
    onValueChange,
    positions,
    placeholder,
    cancelLabel,
    confirmLabel,
    submitting,
    onConfirm,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    value: string;
    onValueChange: (value: string) => void;
    positions: PositionSummary[];
    placeholder: string;
    cancelLabel: string;
    confirmLabel: string;
    submitting: boolean;
    onConfirm: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-0 overflow-hidden rounded-[8px] border-[#EBEEF5] bg-white p-0 text-[#0E1114] shadow-[0_8px_24px_rgba(14,17,20,0.16)] sm:max-w-[480px]">
                <DialogHeader className="gap-1 border-b border-[#F2F3F5] px-6 pb-3.5 pr-14 pt-[18px] text-left">
                    <DialogTitle className="text-[16px] font-semibold text-[#0E1114]">{title}</DialogTitle>
                    <DialogDescription className="text-[12px] text-[#86888F]">{description}</DialogDescription>
                </DialogHeader>
                <div className="px-6 py-5">
                    <PositionSelect value={value} onChange={onValueChange} positions={positions} placeholder={placeholder}/>
                </div>
                <DialogFooter className="h-16 items-center gap-3 border-t border-[#F2F3F5] px-6 sm:justify-end">
                    <Button variant="outline" className="h-9 rounded-[6px] border-[#E6E7EB] px-4 shadow-none" onClick={() => onOpenChange(false)} disabled={submitting}>{cancelLabel}</Button>
                    <Button className="h-9 rounded-[6px] bg-[#1E3BFA] px-4 text-white shadow-none hover:bg-[#0F23D9]" onClick={onConfirm} disabled={!value || submitting}>
                        {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : null}
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

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
    const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
    const pages = React.useMemo(() => {
        const currentPage = Math.min(Math.max(0, pageIndex), totalPages - 1);
        const first = Math.max(0, Math.min(currentPage - 2, totalPages - 5));
        const last = Math.min(totalPages - 1, first + 4);
        const result: number[] = [];
        for (let index = first; index <= last; index += 1) result.push(index);
        return result;
    }, [pageIndex, totalPages]);
    const pageStart = total > 0 ? pageIndex * pageSize + 1 : 0;
    const pageEnd = total > 0 ? Math.min(total, pageIndex * pageSize + visibleCount) : 0;
    const pageButtonClass = "h-7 min-w-7 rounded-[4px] border border-[#E6E7EB] bg-white px-2 text-[12px] font-normal text-[#33353D] shadow-none hover:border-[#1E3BFA] hover:bg-white hover:text-[#1E3BFA] disabled:border-[#E6E7EB] disabled:text-[#B0B2B8]";
    return (
        <div className="flex items-center justify-between py-4 text-[12px] text-[#86888F]">
            <span>{tr.pageRange(pageStart, pageEnd, total)}</span>
            <div className="flex items-center gap-2">
                <select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))} title={tr.rowsPerPage} className="h-7 rounded-[4px] border border-[#E6E7EB] bg-white px-2 text-[12px] text-[#33353D] outline-none">
                    {pageSizeOptions.map((option) => <option key={option} value={option}>{option}{tr.rowsPerPage}</option>)}
                </select>
                <button type="button" className={pageButtonClass} disabled={pageIndex <= 0 || loading} onClick={() => setPageIndex(pageIndex - 1)}>{tr.previousPage}</button>
                {pages.map((page) => (
                    <button
                        key={page}
                        type="button"
                        disabled={loading}
                        className={cn(pageButtonClass, page === pageIndex && "border-[#1E3BFA] bg-[#1E3BFA] text-white hover:bg-[#1E3BFA] hover:text-white")}
                        onClick={() => setPageIndex(page)}
                    >
                        {page + 1}
                    </button>
                ))}
                <button type="button" className={pageButtonClass} disabled={pageIndex >= totalPages - 1 || loading} onClick={() => setPageIndex(pageIndex + 1)}>{tr.nextPage}</button>
            </div>
        </div>
    );
}
