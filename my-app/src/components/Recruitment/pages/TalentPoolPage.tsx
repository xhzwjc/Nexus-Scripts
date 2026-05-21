"use client";

import React from "react";
import {
    Briefcase,
    Building2,
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
        newThisWeek: isZh ? "本周新增" : "This Week",
        newThisWeekHint: isZh ? "最近 7 天" : "Last 7 days",
        activeStatFilter: (label: string) => isZh ? `正在查看：${label}` : `Viewing: ${label}`,
        clearStatFilter: isZh ? "再次点击指标可恢复全部" : "Click the metric again to show all",
        statSelectHint: isZh ? "点击指标筛选列表，选中后再次点击恢复全部" : "Click a metric to filter; click it again to show all",
        statFiltering: isZh ? "筛选中" : "Filtering",
        searchPlaceholder: isZh ? "搜索候选人姓名、技能…" : "Search candidates by name, skills...",
        allSources: isZh ? "全部来源" : "All Sources",
        allTags: isZh ? "全部标签" : "All Tags",
        sortByTime: isZh ? "上传时间 ↓" : "Upload Time ↓",
        sortByName: isZh ? "姓名 A-Z" : "Name A-Z",
        sortByNameDesc: isZh ? "姓名 Z-A" : "Name Z-A",
        selectedCount: (n: number) => isZh ? `已选 ${n} 人` : `${n} selected`,
        batchAssign: isZh ? "批量分配岗位" : "Batch Assign Position",
        batchReIdentify: isZh ? "批量重新识别" : "Batch Re-identify",
        batchDelete: isZh ? "批量删除" : "Batch Delete",
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
        sourceAiUnmatched: isZh ? "AI 未识别岗位" : "AI Unmatched",
        sourceAiError: isZh ? "AI 识别异常" : "AI Error",
        sourceScreeningArchived: isZh ? "初筛完成后入库" : "Archived After Screening",
        sourceLegacyArchived: isZh ? "历史人才库数据" : "Legacy Talent Pool Record",
        candidatesCount: (count: number) => isZh ? `${count} 人` : `${count}`,
        noCandidates: isZh ? "人才库暂无候选人" : "No candidates in talent pool",
        noCandidatesDesc: isZh ? '上传简历时选择「暂不选择岗位」或「AI智能匹配」，未匹配的候选人将出现在这里' : 'Candidates will appear here when uploaded with "No Position" or "AI Smart Match" mode',
        noFilteredCandidates: isZh ? "当前指标下暂无候选人" : "No candidates for this metric",
        noFilteredCandidatesDesc: isZh ? "再次点击上方指标可恢复全部人才库" : "Click the selected metric again to show all candidates",
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
    panelClass?: string;
};

/* ── 头像颜色 ── */
const AVATAR_COLORS = ["av-blue", "av-teal", "av-purple", "av-coral", "av-amber"] as const;

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
    "av-blue": "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
    "av-teal": "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
    "av-purple": "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
    "av-coral": "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
    "av-amber": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
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

function isRecentTalentPoolCandidate(candidate: CandidateSummary, cutoffMs: number) {
    const createdAtMs = candidate.created_at ? Date.parse(candidate.created_at) : Number.NaN;
    return Number.isFinite(createdAtMs) && createdAtMs >= cutoffMs;
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

function groupCandidatesByAIMatch(candidates: CandidateSummary[]) {
    const matchingGroup: CandidateSummary[] = [];
    const pendingGroup: CandidateSummary[] = [];
    const archivedGroup: CandidateSummary[] = [];
    for (const candidate of candidates) {
        if (candidate.status === "matching") {
            matchingGroup.push(candidate);
        } else if (candidate.talent_pool_reason === "unmatched_by_ai" || candidate.talent_pool_reason === "ai_error") {
            pendingGroup.push(candidate);
        } else {
            // auto_archived, moved_by_hr, 或无 reason 的旧数据（status=talent_pool）
            archivedGroup.push(candidate);
        }
    }
    return { pendingGroup, archivedGroup, matchingGroup };
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
}: TalentPoolPageProps) {
    const {language} = useI18n();
    const tr = React.useMemo(() => getTalentPoolLocale(language), [language]);
    const isZh = language === "zh-CN";

    /* ── 筛选/排序状态 ── */
    const [searchQuery, setSearchQuery] = React.useState("");
    const [sourceFilter, setSourceFilter] = React.useState("all");
    const [tagFilter, setTagFilter] = React.useState("all");
    const [sortBy, setSortBy] = React.useState<"time" | "name" | "name_desc">("time");
    const [activeStatFilter, setActiveStatFilter] = React.useState<TalentPoolStatFilter>("all");
    const [statFilterPending, setStatFilterPending] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());
    const statFilterTimerRef = React.useRef<number | null>(null);

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

    /* ── 重新识别 loading ── */
    const [reIdentifyingIds, setReIdentifyingIds] = React.useState<Set<number>>(new Set());
    const [reIdentifyFailedIds, setReIdentifyFailedIds] = React.useState<Set<number>>(new Set());

    /* ── 刷新 loading ── */
    const [refreshing, setRefreshing] = React.useState(false);

    /* ── 统计 ── */
    const recentCutoffMs = React.useMemo(() => Date.now() - 7 * 24 * 60 * 60 * 1000, [candidates]);
    const stats = React.useMemo(() => {
        const total = candidates.length;
        const matching = candidates.filter(isTalentPoolMatching).length;
        const noSystemPosition = candidates.filter(isNoSystemPositionCandidate).length;
        const identifyError = candidates.filter(isIdentifyErrorCandidate).length;
        const pendingAction = noSystemPosition + identifyError;
        const weekNew = candidates.filter(c => isRecentTalentPoolCandidate(c, recentCutoffMs)).length;
        return { total, matching, pendingAction, noSystemPosition, identifyError, weekNew };
    }, [candidates, recentCutoffMs]);

    const statCards = React.useMemo(() => ([
        { filter: "all" as const, label: tr.totalCandidates, value: stats.total, hint: tr.totalHint, tone: "slate" as const },
        { filter: "matching" as const, label: tr.matchingStat, value: stats.matching, hint: tr.matchingStatHint, tone: "sky" as const },
        { filter: "pending" as const, label: tr.pendingAction, value: stats.pendingAction, hint: tr.pendingActionHint, tone: "amber" as const },
        { filter: "no_match" as const, label: tr.noSystemPosition, value: stats.noSystemPosition, hint: tr.noSystemPositionHint, tone: "orange" as const },
        { filter: "ai_error" as const, label: tr.identifyError, value: stats.identifyError, hint: tr.identifyErrorHint, tone: "rose" as const },
        { filter: "week_new" as const, label: tr.newThisWeek, value: stats.weekNew, hint: tr.newThisWeekHint, tone: "emerald" as const },
    ]), [stats.identifyError, stats.matching, stats.noSystemPosition, stats.pendingAction, stats.total, stats.weekNew, tr]);

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
        const tags = new Set<string>();
        for (const c of candidates) if (c.ai_match_position_title) tags.add(c.ai_match_position_title);
        return Array.from(tags).sort();
    }, [candidates]);

    React.useEffect(() => () => {
        if (statFilterTimerRef.current) {
            window.clearTimeout(statFilterTimerRef.current);
        }
    }, []);

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
        if (sortBy === "time") result.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        else if (sortBy === "name") result.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
        else if (sortBy === "name_desc") result.sort((a, b) => b.name.localeCompare(a.name, "zh-CN"));
        return result;
    }, [activeStatFilter, candidates, recentCutoffMs, searchQuery, sourceFilter, tagFilter, sortBy]);

    const { pendingGroup, archivedGroup, matchingGroup } = React.useMemo(
        () => groupCandidatesByAIMatch(filteredCandidates),
        [filteredCandidates]
    );
    const selectedReidentifiableCount = React.useMemo(() => (
        Array.from(selectedIds).filter((candidateId) => {
            const candidate = candidates.find((item) => item.id === candidateId);
            return Boolean(candidate && isTalentPoolReidentifiable(candidate));
        }).length
    ), [candidates, selectedIds]);

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

    /* ── 重新识别（异步，结果通过SSE推送） ── */
    const handleReIdentify = React.useCallback(async (candidateId: number) => {
        setReIdentifyingIds(prev => new Set(prev).add(candidateId));
        setReIdentifyFailedIds(prev => { const next = new Set(prev); next.delete(candidateId); return next; });
        try {
            if (onReIdentify) {
                await onReIdentify(candidateId);
            } else {
                await triggerAIPositionMatch([candidateId]);
            }
            // API立即返回，匹配在后台执行
            // 不清除 reIdentifyingIds，由 SSE candidate_updated 事件驱动状态变更
            // 候选人会从待处理分组移入匹配中分组（isMatching=true 显示 loading）
        } catch {
            setReIdentifyFailedIds(prev => new Set(prev).add(candidateId));
            setReIdentifyingIds(prev => { const next = new Set(prev); next.delete(candidateId); return next; });
        }
    }, [onReIdentify]);

    const handleBatchReIdentify = React.useCallback(async () => {
        const candidateIds = Array.from(selectedIds).filter((candidateId) => {
            const candidate = candidates.find((item) => item.id === candidateId);
            return Boolean(candidate && isTalentPoolReidentifiable(candidate));
        });
        if (!candidateIds.length) {
            return;
        }
        setReIdentifyingIds((prev) => {
            const next = new Set(prev);
            candidateIds.forEach((candidateId) => next.add(candidateId));
            return next;
        });
        setReIdentifyFailedIds((prev) => {
            const next = new Set(prev);
            candidateIds.forEach((candidateId) => next.delete(candidateId));
            return next;
        });
        try {
            if (onBatchReIdentify) {
                await onBatchReIdentify(candidateIds);
            } else {
                await triggerAIPositionMatch(candidateIds);
            }
            setSelectedIds(new Set());
        } catch {
            setReIdentifyFailedIds((prev) => {
                const next = new Set(prev);
                candidateIds.forEach((candidateId) => next.add(candidateId));
                return next;
            });
            setReIdentifyingIds((prev) => {
                const next = new Set(prev);
                candidateIds.forEach((candidateId) => next.delete(candidateId));
                return next;
            });
        }
    }, [candidates, onBatchReIdentify, selectedIds]);

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

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400"/>
            </div>
        );
    }

    return (
        <div className="flex h-full overflow-hidden">
            {/* ── 主内容区 ── */}
            <div className="flex flex-1 flex-col overflow-y-auto p-6">
                {/* 页面头部 */}
                <div className="mb-6 flex items-start justify-between">
                    <div>
                        <h1 className="text-xl font-medium text-slate-900 dark:text-slate-100">{tr.title}</h1>
                        <p className="mt-1 text-[17px] text-slate-500 dark:text-slate-400">{tr.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {onRefresh ? (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-md px-2 text-sm"
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
                        {onUploadResume && (
                            <Button size="sm" className="rounded-lg" onClick={onUploadResume}>
                                <Upload className="mr-1.5 h-3.5 w-3.5"/>
                                {tr.uploadResume}
                            </Button>
                        )}
                    </div>
                </div>

                {/* 统计卡片 */}
                <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 2xl:grid-cols-6">
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
                {activeStatFilter !== "all" || statFilterPending ? (
                    <div className="mb-4 flex min-h-7 flex-wrap items-center gap-2">
                        {activeStatFilter !== "all" ? (
                            <button
                                type="button"
                                onClick={() => handleStatFilterClick(activeStatFilter)}
                                className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1.5 text-sm text-sky-700 shadow-sm backdrop-blur-xl transition hover:border-sky-300 hover:bg-sky-50 dark:border-sky-800 dark:bg-slate-900/80 dark:text-sky-300 dark:hover:bg-sky-950/40"
                                title={tr.clearStatFilter}
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-sky-500 shadow-[0_0_14px_rgba(14,165,233,0.85)]"/>
                                {tr.activeStatFilter(activeStatCard.label)}
                            </button>
                        ) : null}
                        {statFilterPending ? (
                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-100/80 px-3 py-1.5 text-sm text-slate-500 backdrop-blur-xl dark:bg-slate-800/70 dark:text-slate-300">
                                <span className="relative flex h-3 w-3">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60"/>
                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500"/>
                                </span>
                                {tr.statFiltering}
                            </span>
                        ) : null}
                    </div>
                ) : null}

                <div className="mb-5 text-sm text-slate-400 dark:text-slate-500">
                    {tr.statSelectHint}
                </div>

                {/* 工具栏 */}
                <div className="mb-5 flex items-center gap-2.5">
                    <div className="relative max-w-xs flex-1">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"/>
                        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={tr.searchPlaceholder} className="h-8 rounded-lg pl-8 text-[17px]"/>
                    </div>
                    <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[17px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        <option value="all">{tr.allSources}</option>
                        <option value="boss_zhipin">{tr.bossZhipin}</option>
                        <option value="liepin">{tr.liepin}</option>
                        <option value="manual_upload">{tr.manualUpload}</option>
                        <option value="headhunter">{tr.headhunter}</option>
                    </select>
                    <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[17px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        <option value="all">{tr.allTags}</option>
                        {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                        <option value="__none">{tr.unmatchedGroup}</option>
                    </select>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[17px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        <option value="time">{tr.sortByTime}</option>
                        <option value="name">{tr.sortByName}</option>
                        <option value="name_desc">{tr.sortByNameDesc}</option>
                    </select>
                </div>

                {/* 批量操作栏 */}
                {selectedIds.size > 0 && (
                    <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-[17px] text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
                        <span className="flex-1">{tr.selectedCount(selectedIds.size)}</span>
                        <Button size="sm" variant="outline" className="h-7 rounded-md border-sky-300 px-3 text-sm text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30" onClick={() => setAssignDialogOpen(true)}>
                            <Briefcase className="mr-1 h-3.5 w-3.5"/>
                            {tr.batchAssign}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-md border-sky-300 px-3 text-sm text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30"
                            onClick={() => void handleBatchReIdentify()}
                            disabled={selectedReidentifiableCount === 0}
                        >
                            <RotateCcw className="mr-1 h-3.5 w-3.5"/>
                            {tr.batchReIdentify}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 rounded-md px-3 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30" onClick={() => setDeleteDialogOpen(true)}>
                            <Trash2 className="mr-1 h-3.5 w-3.5"/>
                            {tr.batchDelete}
                        </Button>
                    </div>
                )}

                {/* 候选人列表 */}
                {filteredCandidates.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center">
                        <div className="text-center">
                            <Users className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600"/>
                            <h3 className="mt-2 text-base font-medium text-slate-900 dark:text-slate-100">
                                {activeStatFilter === "all" ? tr.noCandidates : tr.noFilteredCandidates}
                            </h3>
                            <p className="mt-1 text-base text-slate-500 dark:text-slate-400">
                                {activeStatFilter === "all" ? tr.noCandidatesDesc : tr.noFilteredCandidatesDesc}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className={cn("flex-1 space-y-5 transition duration-200 ease-out", statFilterPending && "scale-[0.998] opacity-70")}>
                        {/* 匹配中 loading 组 */}
                        {matchingGroup.length > 0 && (
                            <div>
                                <div className="mb-2.5 flex items-center gap-2 text-[17px] font-medium text-slate-500 dark:text-slate-400">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400"/>
                                    <span>{tr.aiMatchingGroup}</span>
                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[15px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">{tr.candidatesCount(matchingGroup.length)}</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {matchingGroup.map(candidate => (
                                        <CandidateCard
                                            key={candidate.id}
                                            candidate={candidate}
                                            selected={selectedIds.has(candidate.id)}
                                            reIdentifying={false}
                                            reIdentifyFailed={false}
                                            onToggleSelect={() => toggleSelect(candidate.id)}
                                            onCancelMatch={onCancelMatch ? () => onCancelMatch(candidate.id) : undefined}
                                            onView={() => onViewCandidate(candidate.id)}
                                            tr={tr}
                                            language={language}
                                            isMatching={true}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 待处理分组 */}
                        {pendingGroup.length > 0 && (
                            <div>
                                <div className="mb-2.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[17px] font-medium text-slate-500 dark:text-slate-400">
                                        <span>{tr.pendingGroup}</span>
                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[15px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{tr.candidatesCount(pendingGroup.length)}</span>
                                    </div>
                                    <label className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                                        <input type="checkbox" className="h-3.5 w-3.5 accent-sky-600" checked={pendingGroup.every(c => selectedIds.has(c.id))} onChange={() => selectGroup(pendingGroup.map(c => c.id))}/>
                                        {tr.selectAllGroup}
                                    </label>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {pendingGroup.map(candidate => (
                                        <CandidateCard
                                            key={candidate.id}
                                            candidate={candidate}
                                            selected={selectedIds.has(candidate.id)}
                                            reIdentifying={reIdentifyingIds.has(candidate.id)}
                                            reIdentifyFailed={reIdentifyFailedIds.has(candidate.id)}
                                            onToggleSelect={() => toggleSelect(candidate.id)}
                                            onReIdentify={isTalentPoolReidentifiable(candidate) ? () => handleReIdentify(candidate.id) : undefined}
                                            onManualAssign={() => openSingleAssign(candidate.id)}
                                            onView={() => onViewCandidate(candidate.id)}
                                            tr={tr}
                                            language={language}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 归档分组 */}
                        {archivedGroup.length > 0 && (
                            <div>
                                {pendingGroup.length > 0 && <div className="my-5 h-px bg-slate-200 dark:bg-slate-800"/>}
                                <div className="mb-2.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[17px] font-medium text-slate-500 dark:text-slate-400">
                                        <span>{tr.archivedGroup}</span>
                                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[15px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">{tr.candidatesCount(archivedGroup.length)}</span>
                                    </div>
                                    <label className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                                        <input type="checkbox" className="h-3.5 w-3.5 accent-sky-600" checked={archivedGroup.every(c => selectedIds.has(c.id))} onChange={() => selectGroup(archivedGroup.map(c => c.id))}/>
                                        {tr.selectAllGroup}
                                    </label>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {archivedGroup.map(candidate => (
                                        <CandidateCard
                                            key={candidate.id}
                                            candidate={candidate}
                                            selected={selectedIds.has(candidate.id)}
                                            reIdentifying={false}
                                            reIdentifyFailed={false}
                                            onToggleSelect={() => toggleSelect(candidate.id)}
                                            onManualAssign={() => openSingleAssign(candidate.id)}
                                            onView={() => onViewCandidate(candidate.id)}
                                            tr={tr}
                                            language={language}
                                            isArchived={true}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── 批量分配弹窗 ── */}
            {assignDialogOpen && (
                <DialogOverlay onClose={() => setAssignDialogOpen(false)}>
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950">
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{tr.batchAssign}</h2>
                        <p className="mt-1 text-base text-slate-500 dark:text-slate-400">{tr.selectedCount(selectedIds.size)}</p>
                        <select value={assignPositionId} onChange={(e) => setAssignPositionId(e.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base dark:border-slate-800 dark:bg-slate-950">
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
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{tr.manualAssign}</h2>
                        <select value={singleAssignPositionId} onChange={(e) => setSingleAssignPositionId(e.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base dark:border-slate-800 dark:bg-slate-950">
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

            {/* ── 批量删除确认弹窗 ── */}
            {deleteDialogOpen && (
                <DialogOverlay onClose={() => setDeleteDialogOpen(false)}>
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-950">
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{tr.deleteConfirmTitle}</h2>
                        <p className="mt-2 text-base text-slate-600 dark:text-slate-400">{tr.deleteConfirmMsg(selectedIds.size)}</p>
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
        sky: "from-sky-500/18 via-sky-50/90 to-white dark:from-sky-500/20 dark:via-slate-900/85 dark:to-slate-950",
        amber: "from-amber-500/20 via-amber-50/90 to-white dark:from-amber-500/20 dark:via-slate-900/85 dark:to-slate-950",
        orange: "from-orange-500/20 via-orange-50/90 to-white dark:from-orange-500/20 dark:via-slate-900/85 dark:to-slate-950",
        rose: "from-rose-500/18 via-rose-50/90 to-white dark:from-rose-500/20 dark:via-slate-900/85 dark:to-slate-950",
        emerald: "from-emerald-500/18 via-emerald-50/90 to-white dark:from-emerald-500/20 dark:via-slate-900/85 dark:to-slate-950",
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
                    ? "border-sky-300 ring-1 ring-sky-200/80 dark:border-sky-700 dark:ring-sky-800/70"
                    : "border-white/70 dark:border-slate-800/80",
            )}
        >
            <span className={cn(
                "pointer-events-none absolute inset-x-4 top-2 h-px rounded-full bg-gradient-to-r from-transparent via-white/90 to-transparent transition-opacity",
                active ? "opacity-100" : "opacity-50 group-hover:opacity-90",
            )}/>
            <span className={cn(
                "pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full blur-2xl transition-opacity",
                active ? "bg-sky-300/35 opacity-100 dark:bg-sky-500/20" : "bg-white/55 opacity-0 group-hover:opacity-80 dark:bg-white/10",
            )}/>
            {loading ? (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-slate-200/70 dark:bg-slate-700/70">
                    <span className="block h-full w-1/2 animate-pulse rounded-full bg-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.8)]"/>
                </span>
            ) : null}
            <span className="relative block text-sm font-medium text-slate-500 dark:text-slate-400">{label}</span>
            <span className="relative mt-1.5 block text-[26px] font-semibold leading-none tabular-nums text-slate-950 transition-transform duration-300 group-hover:translate-x-0.5 dark:text-slate-50">{value}</span>
            <span className="relative mt-1.5 block text-[15px] text-slate-400 dark:text-slate-500">{hint}</span>
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
                <div className="inline-flex items-center gap-1.5 text-[15px] text-slate-400 dark:text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin"/>
                    {tr.aiMatchingHint}
                </div>
            );
        }
        if (isArchived) {
            if (candidate.talent_pool_reason === "auto_archived") {
                return <div className="text-sm text-slate-400 dark:text-slate-500">{tr.autoArchivedDesc}</div>;
            }
            if (candidate.talent_pool_reason === "moved_by_hr") {
                const sourceLabel = STATUS_LABEL_MAP[candidate.talent_pool_source_status || ""] || candidate.talent_pool_source_status || "";
                const moveDate = candidate.talent_pool_moved_at ? new Date(candidate.talent_pool_moved_at).toLocaleDateString() : "";
                return <div className="text-sm text-slate-400 dark:text-slate-500">{tr.movedByHRDesc(candidate.talent_pool_moved_by || "", moveDate, sourceLabel)}</div>;
            }
            // 旧数据（status=talent_pool 无 reason）
            return <div className="text-sm text-slate-400 dark:text-slate-500">{tr.archivedGroupDesc}</div>;
        }
        // 待处理分组
        if (candidate.talent_pool_reason === "ai_error") {
            return (
                <div className="text-sm text-amber-500 dark:text-amber-400">
                    {sanitizeCandidateFacingErrorText(candidate.ai_match_reason || tr.aiErrorDesc, {
                        context: "position_match",
                        language,
                    })}
                </div>
            );
        }
        // unmatched_by_ai 或无 reason
        if (reIdentifyFailed) {
            return <div className="text-sm text-rose-500 dark:text-rose-400">{tr.aiStillNoMatch}</div>;
        }
        return <div className="text-sm text-slate-400 dark:text-slate-500">{tr.aiNoMatch}</div>;
    };

    return (
        <div className={cn(
            "flex items-start gap-3.5 rounded-xl border px-4 py-3.5 transition-colors",
            selected ? "border-sky-500 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/30" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
        )}>
            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="mt-1 h-[15px] w-[15px] flex-shrink-0 accent-sky-600"/>
            <div className={cn("flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full text-[17px] font-medium", AVATAR_BG[AVATAR_COLORS[colorIdx]])}>
                {initial}
            </div>
            <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                    <span className="text-base font-medium text-slate-900 dark:text-slate-100">{candidate.name}</span>
                    {isMatching ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[15px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <Loader2 className="h-3 w-3 animate-spin"/>
                            {tr.matching}
                        </span>
                    ) : talentPoolDisplayStatus === "talent_pool" ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[15px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">{tr.archived}</span>
                    ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[15px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{tr.pendingIdentify}</span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[15px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{sourceLabel(candidate.source, tr)}</span>
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                    {candidate.years_of_experience && <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3"/>{candidate.years_of_experience}</span>}
                    {candidate.education && <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3"/>{candidate.education}</span>}
                    {candidate.city && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3"/>{candidate.city}</span>}
                    {candidate.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3"/>{candidate.phone}</span>}
                </div>
                {getDescription()}
                {!isMatching ? (
                    <div className="mt-2 text-[15px] text-slate-500 dark:text-slate-400">
                        {`${tr.sourceStage}：${sourceStageLabel}`}
                    </div>
                ) : null}
                {isMatching ? (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin"/>
                            <span>AI 正在分析简历，匹配岗位中...</span>
                        </div>
                    </div>
                ) : (screeningPositionTitle || aiRecommendedTitle || candidate.ai_potential_position) ? (
                    <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-sm text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                        {screeningPositionTitle ? <div className="font-medium">{`${tr.screeningPosition}：${screeningPositionTitle}`}</div> : null}
                        {aiRecommendedTitle ? (
                            <div className={screeningPositionTitle ? "mt-1" : "font-medium"}>
                                {`${tr.aiRecommendedPosition}：${aiRecommendedTitle}`}
                            </div>
                        ) : null}
                        {aiRecommendedTitle && candidate.ai_match_reason ? (
                            <div className="mt-1 text-sky-600/90 dark:text-sky-200/80">
                                {sanitizeCandidateFacingErrorText(candidate.ai_match_reason, {
                                    context: "position_match",
                                    language,
                                })}
                            </div>
                        ) : null}
                        {candidate.ai_potential_position ? (
                            <div className={screeningPositionTitle || aiRecommendedTitle ? "mt-1 border-t border-sky-200/70 pt-2 dark:border-sky-900/70" : ""}>
                                <div className="font-medium">
                                    {`${tr.potentialDirection}：${candidate.ai_potential_position}`}
                                </div>
                                {candidate.ai_potential_reason ? (
                                    <div className="mt-1 text-sky-600/90 dark:text-sky-200/80">{candidate.ai_potential_reason}</div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
                {hasAIMatch && onConfirmMatch && (
                    <Button size="sm" variant="outline" className="h-8 rounded-md border-sky-300 px-3 text-sm text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30" onClick={onConfirmMatch}>
                        <Check className="mr-1 h-3 w-3"/>{tr.confirmMatch}
                    </Button>
                )}
                {hasAIMatch && onChangePosition && (
                    <Button size="sm" variant="outline" className="h-8 rounded-md px-3 text-sm" onClick={onChangePosition}>{tr.changePosition}</Button>
                )}
                {onReIdentify && (
                    <Button size="sm" variant="outline" className="h-8 rounded-md px-3 text-sm" onClick={onReIdentify} disabled={reIdentifying}>
                        {reIdentifying ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <RefreshCw className="mr-1 h-3 w-3"/>}
                        {reIdentifying ? tr.reIdentifying : tr.reIdentify}
                    </Button>
                )}
                {onManualAssign && (
                    <Button size="sm" variant="outline" className="h-8 rounded-md border-sky-300 px-3 text-sm text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30" onClick={onManualAssign}>
                        <Briefcase className="mr-1 h-3 w-3"/>{tr.manualAssign}
                    </Button>
                )}
                {isMatching && onCancelMatch && (
                    <Button size="sm" variant="outline" className="h-8 rounded-md border-rose-300 px-3 text-sm text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/30" onClick={onCancelMatch}>
                        <Square className="mr-1 h-3 w-3"/>{tr.stopMatch}
                    </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 rounded-md px-3 text-sm" onClick={onView}>
                    <Eye className="mr-1 h-3 w-3"/>{tr.view}
                </Button>
            </div>
        </div>
    );
}
