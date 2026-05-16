"use client";

import React from "react";
import {
    Briefcase,
    Building2,
    Check,
    Eye,
    GraduationCap,
    Loader2,
    Mail,
    Phone,
    Plus,
    RefreshCw,
    Search,
    Sparkles,
    Square,
    Trash2,
    Upload,
    Users,
    X,
} from "lucide-react";

import {
    type CandidateDetail,
    type CandidateSummary,
    type PositionSummary,
    recruitmentApi,
    triggerAIPositionMatch,
} from "@/lib/recruitment-api";
import {getCurrentLanguage, useI18n} from "@/lib/i18n";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

function getTalentPoolLocale(language = getCurrentLanguage()) {
    const isZh = language !== "en-US";
    return {
        title: isZh ? "人才库" : "Talent Pool",
        description: isZh ? "未分配岗位的候选人，可按 AI 识别标签批量分配岗位" : "Candidates without assigned positions, batch assign by AI-recognized tags",
        uploadResume: isZh ? "上传简历" : "Upload Resume",
        totalCandidates: isZh ? "总候选人" : "Total Candidates",
        totalHint: isZh ? "待处理" : "Pending",
        aiMatched: isZh ? "AI 已识别岗位" : "AI Matched",
        aiMatchedHint: isZh ? "有推荐归岗方向" : "With recommendations",
        unmatched: isZh ? "无法识别" : "Unmatched",
        unmatchedHint: isZh ? "需手动处理" : "Manual action needed",
        newThisWeek: isZh ? "本周新增" : "This Week",
        newThisWeekHint: isZh ? "最近 7 天" : "Last 7 days",
        searchPlaceholder: isZh ? "搜索候选人姓名、技能…" : "Search candidates by name, skills...",
        allSources: isZh ? "全部来源" : "All Sources",
        allTags: isZh ? "全部标签" : "All Tags",
        sortByTime: isZh ? "上传时间 ↓" : "Upload Time ↓",
        sortByName: isZh ? "姓名 A-Z" : "Name A-Z",
        sortByNameDesc: isZh ? "姓名 Z-A" : "Name Z-A",
        selectedCount: (n: number) => isZh ? `已选 ${n} 人` : `${n} selected`,
        batchAssign: isZh ? "批量分配岗位" : "Batch Assign Position",
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
        candidatesCount: (count: number) => isZh ? `${count} 人` : `${count}`,
        noCandidates: isZh ? "人才库暂无候选人" : "No candidates in talent pool",
        noCandidatesDesc: isZh ? '上传简历时选择「暂不选择岗位」或「AI智能匹配」，未匹配的候选人将出现在这里' : 'Candidates will appear here when uploaded with "No Position" or "AI Smart Match" mode',
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

function groupCandidatesByAIMatch(candidates: CandidateSummary[]) {
    const groups: Record<string, { positionTitle: string; positionId: number | null; candidates: CandidateSummary[] }> = {};
    const noMatchGroup: CandidateSummary[] = [];
    const matchingGroup: CandidateSummary[] = [];
    for (const candidate of candidates) {
        if (candidate.status === "matching") {
            matchingGroup.push(candidate);
        } else if (candidate.ai_match_position_title) {
            const key = candidate.ai_match_position_title;
            if (!groups[key]) groups[key] = { positionTitle: key, positionId: candidate.ai_match_position_id || null, candidates: [] };
            groups[key].candidates.push(candidate);
        } else {
            noMatchGroup.push(candidate);
        }
    }
    return { groups: Object.values(groups), noMatchGroup, matchingGroup };
}

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
    const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());

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

    /* ── 抽屉状态 ── */
    const [drawerOpen, setDrawerOpen] = React.useState(false);
    const [drawerCandidate, setDrawerCandidate] = React.useState<CandidateDetail | null>(null);
    const [drawerLoading, setDrawerLoading] = React.useState(false);

    /* ── 统计 ── */
    const stats = React.useMemo(() => {
        const total = candidates.length;
        const matching = candidates.filter(c => c.status === "matching").length;
        const aiMatched = candidates.filter(c => c.status !== "matching" && c.ai_match_position_title).length;
        const unmatched = total - aiMatched - matching;
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const weekNew = candidates.filter(c => c.created_at && new Date(c.created_at) >= oneWeekAgo).length;
        return { total, matching, aiMatched, unmatched, weekNew };
    }, [candidates]);

    const availableTags = React.useMemo(() => {
        const tags = new Set<string>();
        for (const c of candidates) if (c.ai_match_position_title) tags.add(c.ai_match_position_title);
        return Array.from(tags).sort();
    }, [candidates]);

    /* ── 过滤 + 排序 ── */
    const filteredCandidates = React.useMemo(() => {
        let result = [...candidates];
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
    }, [candidates, searchQuery, sourceFilter, tagFilter, sortBy]);

    const { groups, noMatchGroup, matchingGroup } = React.useMemo(
        () => groupCandidatesByAIMatch(filteredCandidates),
        [filteredCandidates]
    );

    // 当候选人离开 noMatchGroup（SSE驱动进入 matchingGroup 或匹配成功被移除），清除 reIdentifying 标记
    React.useEffect(() => {
        const allCurrentIds = new Set(filteredCandidates.map(c => c.id));
        setReIdentifyingIds(prev => {
            if (prev.size === 0) return prev;
            const next = new Set<number>();
            for (const id of prev) {
                // 只保留在 noMatchGroup 中且不是 matching 状态的候选人
                // 如果候选人已进入 matchingGroup 或已从人才库移除，清除标记
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
            // 候选人会从 noMatchGroup 移入 matchingGroup（isMatching=true 显示 loading）
        } catch {
            setReIdentifyFailedIds(prev => new Set(prev).add(candidateId));
            setReIdentifyingIds(prev => { const next = new Set(prev); next.delete(candidateId); return next; });
        }
    }, [onReIdentify]);

    /* ── 批量删除 ── */
    const handleBatchDelete = React.useCallback(async () => {
        if (!onDeleteCandidates || selectedIds.size === 0) return;
        setDeleting(true);
        try {
            await onDeleteCandidates(Array.from(selectedIds));
            setSelectedIds(new Set());
            setDeleteDialogOpen(false);
        } finally {
            setDeleting(false);
        }
    }, [onDeleteCandidates, selectedIds]);

    /* ── 查看抽屉 ── */
    const openDrawer = React.useCallback(async (candidateId: number) => {
        setDrawerOpen(true);
        setDrawerLoading(true);
        setDrawerCandidate(null);
        try {
            const data = await recruitmentApi<CandidateDetail>(`/candidates/${candidateId}`);
            if (data) setDrawerCandidate(data);
        } catch {
            // fallback: 用列表中的 summary 数据
        } finally {
            setDrawerLoading(false);
        }
    }, []);

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
            <div className={cn("flex flex-1 flex-col overflow-y-auto p-6", drawerOpen && "mr-0")}>
                {/* 页面头部 */}
                <div className="mb-6 flex items-start justify-between">
                    <div>
                        <h1 className="text-lg font-medium text-slate-900 dark:text-slate-100">{tr.title}</h1>
                        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">{tr.description}</p>
                    </div>
                    {onUploadResume && (
                        <Button size="sm" className="rounded-lg" onClick={onUploadResume}>
                            <Upload className="mr-1.5 h-3.5 w-3.5"/>
                            {tr.uploadResume}
                        </Button>
                    )}
                </div>

                {/* 统计卡片 */}
                <div className="mb-6 grid grid-cols-4 gap-2.5">
                    <StatCard label={tr.totalCandidates} value={stats.total} hint={tr.totalHint}/>
                    <StatCard label={tr.aiMatched} value={stats.aiMatched} hint={tr.aiMatchedHint}/>
                    <StatCard label={tr.unmatched} value={stats.unmatched} hint={tr.unmatchedHint}/>
                    <StatCard label={tr.newThisWeek} value={stats.weekNew} hint={tr.newThisWeekHint}/>
                </div>

                {/* 工具栏 */}
                <div className="mb-5 flex items-center gap-2.5">
                    <div className="relative max-w-xs flex-1">
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
                </div>

                {/* 批量操作栏 */}
                {selectedIds.size > 0 && (
                    <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-[13px] text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
                        <span className="flex-1">{tr.selectedCount(selectedIds.size)}</span>
                        <Button size="sm" variant="outline" className="h-7 rounded-md border-sky-300 px-3 text-xs text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30" onClick={() => setAssignDialogOpen(true)}>
                            <Briefcase className="mr-1 h-3.5 w-3.5"/>
                            {tr.batchAssign}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 rounded-md px-3 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30" onClick={() => setDeleteDialogOpen(true)}>
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
                            <h3 className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">{tr.noCandidates}</h3>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tr.noCandidatesDesc}</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 space-y-5">
                        {/* 匹配中 loading 组 */}
                        {matchingGroup.length > 0 && (
                            <div>
                                <div className="mb-2.5 flex items-center gap-2 text-[13px] font-medium text-slate-500 dark:text-slate-400">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400"/>
                                    <span>{tr.aiMatchingGroup}</span>
                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">{tr.candidatesCount(matchingGroup.length)}</span>
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
                                            onView={() => openDrawer(candidate.id)}
                                            tr={tr}
                                            isMatching={true}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {groups.map(group => (
                            <div key={group.positionTitle}>
                                <div className="mb-2.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 dark:text-slate-400">
                                        <span>{tr.aiRecognized}：{group.positionTitle}</span>
                                        <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">{tr.candidatesCount(group.candidates.length)}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                            <input type="checkbox" className="h-3.5 w-3.5 accent-sky-600" checked={group.candidates.every(c => selectedIds.has(c.id))} onChange={() => selectGroup(group.candidates.map(c => c.id))}/>
                                            {tr.selectAllGroup}
                                        </label>
                                        {group.positionId ? (
                                            <Button size="sm" variant="outline" className="h-7 rounded-md border-sky-300 px-2.5 text-xs text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30" onClick={async () => { await onAssignPosition(group.candidates.map(c => c.id), group.positionId!); }}>
                                                <Briefcase className="mr-1 h-3 w-3"/>
                                                {tr.oneClickAssign}
                                            </Button>
                                        ) : (
                                            <Button size="sm" variant="outline" className="h-7 rounded-md px-2.5 text-xs" onClick={() => onCreatePosition(group.positionTitle)}>
                                                <Plus className="mr-1 h-3 w-3"/>
                                                {tr.oneClickAssign}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {group.candidates.map(candidate => (
                                        <CandidateCard
                                            key={candidate.id}
                                            candidate={candidate}
                                            selected={selectedIds.has(candidate.id)}
                                            reIdentifying={reIdentifyingIds.has(candidate.id)}
                                            reIdentifyFailed={reIdentifyFailedIds.has(candidate.id)}
                                            onToggleSelect={() => toggleSelect(candidate.id)}
                                            onConfirmMatch={async () => { await onAssignPosition([candidate.id], candidate.ai_match_position_id!); if (onRefresh) await onRefresh(); }}
                                            onChangePosition={() => openSingleAssign(candidate.id)}
                                            onReIdentify={() => handleReIdentify(candidate.id)}
                                            onManualAssign={() => openSingleAssign(candidate.id)}
                                            onView={() => openDrawer(candidate.id)}
                                            tr={tr}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}

                        {noMatchGroup.length > 0 && (
                            <div>
                                {groups.length > 0 && <div className="my-5 h-px bg-slate-200 dark:bg-slate-800"/>}
                                <div className="mb-2.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500 dark:text-slate-400">
                                        <span>{tr.unmatchedGroup}</span>
                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{tr.candidatesCount(noMatchGroup.length)}</span>
                                    </div>
                                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                        <input type="checkbox" className="h-3.5 w-3.5 accent-sky-600" checked={noMatchGroup.every(c => selectedIds.has(c.id))} onChange={() => selectGroup(noMatchGroup.map(c => c.id))}/>
                                        {tr.selectAllGroup}
                                    </label>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {noMatchGroup.map(candidate => (
                                        <CandidateCard
                                            key={candidate.id}
                                            candidate={candidate}
                                            selected={selectedIds.has(candidate.id)}
                                            reIdentifying={reIdentifyingIds.has(candidate.id)}
                                            reIdentifyFailed={reIdentifyFailedIds.has(candidate.id)}
                                            onToggleSelect={() => toggleSelect(candidate.id)}
                                            onReIdentify={() => handleReIdentify(candidate.id)}
                                            onManualAssign={() => openSingleAssign(candidate.id)}
                                            onView={() => openDrawer(candidate.id)}
                                            tr={tr}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── 右侧抽屉 ── */}
            {drawerOpen && (
                <div className="flex w-[400px] flex-shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{tr.drawerTitle}</h3>
                        <button onClick={() => setDrawerOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
                            <X className="h-4 w-4"/>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        {drawerLoading ? (
                            <div className="flex h-40 items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-slate-400"/>
                            </div>
                        ) : drawerCandidate ? (
                            <CandidateDrawerContent detail={drawerCandidate} tr={tr} />
                        ) : (
                            <div className="text-sm text-slate-500">{tr.noResumeContent}</div>
                        )}
                    </div>
                    {!drawerLoading && drawerCandidate && (
                        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                            {drawerCandidate.candidate.ai_match_position_id && (
                                <Button size="sm" className="h-8 rounded-md text-xs" onClick={async () => {
                                    await onAssignPosition([drawerCandidate.candidate.id], drawerCandidate.candidate.ai_match_position_id!);
                                    setDrawerOpen(false);
                                    if (onRefresh) await onRefresh();
                                }}>
                                    <Check className="mr-1 h-3 w-3"/>
                                    {tr.confirmMatch}
                                </Button>
                            )}
                            <Button size="sm" variant="outline" className="h-8 rounded-md text-xs" onClick={() => { setDrawerOpen(false); openSingleAssign(drawerCandidate.candidate.id); }}>
                                <Briefcase className="mr-1 h-3 w-3"/>
                                {tr.manualAssign}
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 rounded-md text-xs" onClick={() => { setDrawerOpen(false); handleReIdentify(drawerCandidate.candidate.id); }}>
                                <RefreshCw className="mr-1 h-3 w-3"/>
                                {tr.reIdentify}
                            </Button>
                        </div>
                    )}
                </div>
            )}

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

function StatCard({label, value, hint}: {label: string; value: number; hint: string}) {
    return (
        <div className="rounded-lg bg-slate-50 px-4 py-3.5 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
            <div className="mt-1.5 text-[22px] font-medium text-slate-900 dark:text-slate-100">{value}</div>
            <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{hint}</div>
        </div>
    );
}

/* ── 候选人卡片 ── */
function CandidateCard({
    candidate, selected, reIdentifying, reIdentifyFailed,
    onToggleSelect, onConfirmMatch, onChangePosition, onReIdentify, onCancelMatch, onManualAssign, onView, tr,
    isMatching,
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
    isMatching?: boolean;
}) {
    const hasAIMatch = !!candidate.ai_match_position_title;
    const colorIdx = avatarColorIndex(candidate.name);
    const initial = avatarInitial(candidate.name);

    return (
        <div className={cn(
            "flex items-start gap-3.5 rounded-xl border px-4 py-3.5 transition-colors",
            selected ? "border-sky-500 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/30" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
        )}>
            <input type="checkbox" checked={selected} onChange={onToggleSelect} className="mt-1 h-[15px] w-[15px] flex-shrink-0 accent-sky-600"/>
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
                    ) : hasAIMatch ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{tr.aiIdentified}</span>
                    ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{tr.pendingIdentify}</span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{sourceLabel(candidate.source, tr)}</span>
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {candidate.years_of_experience && <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3"/>{candidate.years_of_experience}</span>}
                    {candidate.education && <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3"/>{candidate.education}</span>}
                    {candidate.city && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3"/>{candidate.city}</span>}
                    {candidate.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3"/>{candidate.phone}</span>}
                </div>
                {isMatching ? (
                    <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                        <Loader2 className="h-3 w-3 animate-spin"/>
                        {tr.aiMatchingHint}
                    </div>
                ) : hasAIMatch ? (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-sky-300 bg-sky-50 px-2.5 py-1 text-[11px] text-sky-700 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
                        <Sparkles className="h-3 w-3"/>
                        {tr.aiRecommendInto(candidate.ai_match_position_title!)}
                    </div>
                ) : reIdentifyFailed ? (
                    <div className="text-xs text-rose-500 dark:text-rose-400">{tr.aiStillNoMatch}</div>
                ) : (
                    <div className="text-xs text-slate-400 dark:text-slate-500">{tr.aiNoMatch}</div>
                )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
                {hasAIMatch && onConfirmMatch && (
                    <Button size="sm" variant="outline" className="h-8 rounded-md border-sky-300 px-3 text-xs text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30" onClick={onConfirmMatch}>
                        <Check className="mr-1 h-3 w-3"/>{tr.confirmMatch}
                    </Button>
                )}
                {hasAIMatch && onChangePosition && (
                    <Button size="sm" variant="outline" className="h-8 rounded-md px-3 text-xs" onClick={onChangePosition}>{tr.changePosition}</Button>
                )}
                {onReIdentify && (
                    <Button size="sm" variant="outline" className="h-8 rounded-md px-3 text-xs" onClick={onReIdentify} disabled={reIdentifying}>
                        {reIdentifying ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <RefreshCw className="mr-1 h-3 w-3"/>}
                        {reIdentifying ? tr.reIdentifying : tr.reIdentify}
                    </Button>
                )}
                {onManualAssign && (
                    <Button size="sm" variant="outline" className="h-8 rounded-md border-sky-300 px-3 text-xs text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/30" onClick={onManualAssign}>
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
        </div>
    );
}

/* ── 抽屉内容 ── */
function CandidateDrawerContent({detail, tr}: {detail: CandidateDetail; tr: ReturnType<typeof getTalentPoolLocale>}) {
    const c = detail.candidate;
    const hasAIMatch = !!c.ai_match_position_title;
    const parseResult = detail.parse_result;
    const parsed = parseResult || null;

    return (
        <div className="space-y-4">
            {/* 基本信息 */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-base font-medium text-slate-900 dark:text-slate-100">{c.name}</span>
                    {hasAIMatch && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
                            <Sparkles className="h-3 w-3"/>
                            {c.ai_match_position_title}
                        </span>
                    )}
                </div>
                <div className="space-y-1.5 text-[13px] text-slate-600 dark:text-slate-400">
                    {c.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400"/>{c.phone}</div>}
                    {c.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-400"/>{c.email}</div>}
                    {c.education && <div className="flex items-center gap-2"><GraduationCap className="h-3.5 w-3.5 text-slate-400"/>{c.education}</div>}
                    {c.years_of_experience && <div className="flex items-center gap-2"><Briefcase className="h-3.5 w-3.5 text-slate-400"/>{c.years_of_experience}</div>}
                    {c.city && <div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-slate-400"/>{c.city}</div>}
                </div>
            </div>

            <div className="h-px bg-slate-200 dark:bg-slate-800"/>

            {/* 简历解析内容 */}
            {parsed ? (
                <div className="space-y-3">
                    {parsed.work_experiences?.length > 0 && (
                        <div>
                            <h4 className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{tr.workExperience}</h4>
                            <div className="space-y-2">
                                {(parsed.work_experiences as Record<string, string>[]).map((w, i) => (
                                    <div key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-900">
                                        <div className="font-medium text-slate-800 dark:text-slate-200">{w.company || ""} {w.title ? `· ${w.title}` : ""}</div>
                                        {w.period && <div className="text-xs text-slate-500">{w.period}</div>}
                                        {w.description && <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line">{w.description}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {parsed.skills?.length > 0 && (
                        <div>
                            <h4 className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{tr.skills}</h4>
                            <div className="flex flex-wrap gap-1.5">
                                {(parsed.skills as string[]).map((s, i) => (
                                    <span key={i} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">{s}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    {parsed.summary && (
                        <div>
                            <h4 className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{tr.resumeContent}</h4>
                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700 dark:bg-slate-900 dark:text-slate-300 whitespace-pre-line">{parsed.summary}</div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center text-sm text-slate-400 py-8">{tr.noResumeContent}</div>
            )}
        </div>
    );
}
