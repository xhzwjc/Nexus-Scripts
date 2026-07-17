"use client";

import React from "react";
import {createPortal} from "react-dom";
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRightLeft,
    ChevronRight,
    Copy,
    GitCompareArrows,
    Info,
    Loader2,
    ShieldAlert,
    X,
} from "lucide-react";

import {Button} from "@/components/ui/button";
import type {Translations} from "@/lib/i18n/types";
import type {
    CandidateComparisonAlignedDimension,
    CandidateComparisonArtifactState,
    CandidateComparisonMember,
    CandidateComparisonPreview,
    CandidateComparisonReasonCode,
    CandidateSummary,
} from "@/lib/recruitment-api";
import {cn} from "@/lib/utils";

type CandidateComparisonText = Translations["recruitment"]["candidateComparison"];

interface CandidateComparisonTrayProps {
    candidates: CandidateSummary[];
    text: CandidateComparisonText;
    onRemove: (candidateId: number) => void;
    onClear: () => void;
    onStart: () => void;
}

interface CandidateComparisonWorkspaceProps {
    preview: CandidateComparisonPreview | null;
    selectedCandidates: CandidateSummary[];
    detailOpen: boolean;
    text: CandidateComparisonText;
    loading: boolean;
    failed: boolean;
    stale: boolean;
    processing: boolean;
    onBack: () => void;
    onRefresh: () => void;
    onRemoveCandidate: (candidateId: number) => void;
    onOpenCandidate: (candidateId: number) => void;
    resolveCandidateStatus: (status: string) => string;
    resolveCandidateSource: (source?: string | null) => string;
}

interface ComparisonGridRowProps {
    label: React.ReactNode;
    members: CandidateComparisonMember[];
    children: (member: CandidateComparisonMember) => React.ReactNode;
    emphasized?: boolean;
    cellClassName?: (member: CandidateComparisonMember) => string | undefined;
}

interface DifferenceCard {
    key: string;
    kind: "dimension" | "duplicate";
    title: string;
    description: string;
    tag: string;
}

function CandidateComparisonPortal({children}: {children: React.ReactNode}) {
    const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

    React.useEffect(() => {
        setPortalTarget(document.body);
    }, []);

    return portalTarget ? createPortal(children, portalTarget) : null;
}

const artifactTone: Record<CandidateComparisonArtifactState, string> = {
    strict: "bg-[rgba(12,201,145,0.1)] text-[#0A9C71]",
    legacy: "bg-[rgba(255,171,36,0.14)] text-[#D48806]",
    processing: "bg-[rgba(46,156,255,0.12)] text-[#2E9CFF]",
    stale: "bg-[rgba(255,171,36,0.14)] text-[#D48806]",
    missing: "bg-[rgba(134,136,143,0.14)] text-[#5E5F66]",
    failed: "bg-[rgba(245,63,63,0.1)] text-[#F53F3F]",
    invalid: "bg-[rgba(245,63,63,0.1)] text-[#F53F3F]",
};

const avatarPalette = ["#1E3BFA", "#2E9CFF", "#FF9F1C", "#7B61FF", "#0CC991", "#F53F3F"];

function avatarColor(candidateId: number) {
    return avatarPalette[Math.abs(candidateId) % avatarPalette.length];
}

function candidateInitial(name?: string | null) {
    const normalized = String(name || "").trim();
    return normalized ? normalized.slice(0, 1) : "?";
}

function formatComparisonNumber(value: number | null | undefined, maximumFractionDigits = 1) {
    if (value == null || !Number.isFinite(value)) return null;
    return new Intl.NumberFormat(undefined, {maximumFractionDigits}).format(value);
}

function formatComparisonDateTime(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizedAiScore(member: CandidateComparisonMember) {
    const matchPercent = member.screening?.ai.match_percent;
    if (matchPercent != null && Number.isFinite(matchPercent)) {
        return Math.max(0, Math.min(100, matchPercent));
    }
    const total = member.screening?.ai.total_score;
    const scale = member.screening?.ai.total_score_scale;
    if (total == null || scale == null || !Number.isFinite(total) || !Number.isFinite(scale) || scale <= 0) {
        return null;
    }
    return Math.max(0, Math.min(100, total / scale * 100));
}

function scoreBarTone(score: number) {
    if (score >= 80) return "#0CC991";
    if (score >= 60) return "#1E3BFA";
    if (score >= 40) return "#FFAB24";
    return "#F53F3F";
}

function statusTone(status: string) {
    if (["screening_passed", "interview_passed", "offer_accepted", "hired", "talent_pool"].includes(status)) {
        return "bg-[rgba(12,201,145,0.1)] text-[#0A9C71]";
    }
    if (["screening_rejected", "interview_rejected", "offer_rejected", "rejected"].includes(status)) {
        return "bg-[rgba(245,63,63,0.08)] text-[#F53F3F]";
    }
    if (["screening", "screening_in_progress", "interview_scheduled", "interviewing", "department_review"].includes(status)) {
        return "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]";
    }
    return "bg-[rgba(176,178,184,0.12)] text-[#5E5F66]";
}

function reasonLabel(code: CandidateComparisonReasonCode, text: CandidateComparisonText) {
    switch (code) {
        case "artifact_missing": return text.reasonArtifactMissing;
        case "artifact_legacy": return text.reasonArtifactLegacy;
        case "artifact_stale": return text.reasonArtifactStale;
        case "artifact_invalid": return text.reasonArtifactInvalid;
        case "artifact_processing": return text.reasonArtifactProcessing;
        case "artifact_failed": return text.reasonArtifactFailed;
        case "protocol_mismatch": return text.reasonProtocolMismatch;
        case "dimension_mismatch": return text.reasonDimensionMismatch;
        case "score_total_mismatch": return text.reasonScoreTotalMismatch;
        case "position_context_mismatch": return text.reasonPositionContextMismatch;
        case "manual_override_mixed": return text.reasonManualOverrideMixed;
        case "possible_duplicate_contact": return text.reasonPossibleDuplicateContact;
        default: return text.reasonUnknown;
    }
}

function artifactLabel(state: CandidateComparisonArtifactState, text: CandidateComparisonText) {
    switch (state) {
        case "strict": return text.artifactStrict;
        case "legacy": return text.artifactLegacy;
        case "processing": return text.artifactProcessing;
        case "stale": return text.artifactStale;
        case "missing": return text.artifactMissing;
        case "failed": return text.artifactFailed;
        case "invalid": return text.artifactInvalid;
        default: return text.unavailable;
    }
}

function manualModeLabel(preview: CandidateComparisonPreview, text: CandidateComparisonText) {
    switch (preview.manual_override_mode) {
        case "none": return text.manualScoreNone;
        case "partial": return text.manualScorePartial;
        case "complete": return text.manualScoreComplete;
        default: return text.reasonUnknown;
    }
}

const COMPARISON_DIMENSION_COLUMN_WIDTH = 200;
const COMPARISON_MEMBER_MIN_WIDTH = 240;

function comparisonTableStyle(memberCount: number): React.CSSProperties {
    return {
        minWidth: `${COMPARISON_DIMENSION_COLUMN_WIDTH + Math.max(memberCount, 1) * COMPARISON_MEMBER_MIN_WIDTH}px`,
        width: "100%",
    };
}

function comparisonGridStyle(memberCount: number): React.CSSProperties {
    return {
        ...comparisonTableStyle(memberCount),
        gridTemplateColumns: `${COMPARISON_DIMENSION_COLUMN_WIDTH}px repeat(${Math.max(memberCount, 1)}, minmax(${COMPARISON_MEMBER_MIN_WIDTH}px, 1fr))`,
    };
}

function ComparisonGridRow({label, members, children, emphasized = false, cellClassName}: ComparisonGridRowProps) {
    return (
        <div
            role="row"
            className="grid w-full border-b border-[#F2F3F5] bg-white"
            style={comparisonGridStyle(members.length)}
        >
            <div role="rowheader" className="sticky left-0 z-10 border-r border-[#F2F3F5] bg-white px-4 py-3 text-[12px] font-medium leading-5 text-[#0E1114]">
                {label}
            </div>
            {members.map((member) => (
                <div
                    role="cell"
                    key={member.candidate.id}
                    className={cn(
                        "min-w-0 border-r border-[#F2F3F5] px-4 py-3 text-[12px] leading-[1.6] text-[#33353D] last:border-r-0",
                        emphasized && "bg-[#FAFAFB]",
                        cellClassName?.(member),
                    )}
                >
                    {children(member)}
                </div>
            ))}
        </div>
    );
}

function ComparisonSectionTitle({title, members}: {title: string; members: CandidateComparisonMember[]}) {
    return (
        <div className="grid w-full border-y border-[#EBEEF5] bg-[#F7F8FA]" style={comparisonGridStyle(members.length)}>
            <div className="sticky left-0 z-10 px-4 py-2.5 text-[12px] font-semibold text-[#5E5F66]" style={{gridColumn: "1 / -1"}}>
                {title}
            </div>
        </div>
    );
}

function TextList({values, emptyText, dotColor = "#86888F"}: {values: string[]; emptyText: string; dotColor?: string}) {
    if (!values.length) return <span className="text-[#B0B2B8]">{emptyText}</span>;
    return (
        <ul className="space-y-1.5">
            {values.map((value, index) => (
                <li key={`${index}-${value}`} className="flex gap-1.5">
                    <span aria-hidden className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full" style={{backgroundColor: dotColor}}/>
                    <span className="break-words">{value}</span>
                </li>
            ))}
        </ul>
    );
}

function DimensionComparisonRow({
    dimension,
    members,
    text,
    expanded,
    rankingAllowed,
    onToggle,
}: {
    dimension: CandidateComparisonAlignedDimension;
    members: CandidateComparisonMember[];
    text: CandidateComparisonText;
    expanded: boolean;
    rankingAllowed: boolean;
    onToggle: () => void;
}) {
    const availableScores = dimension.values
        .map((value) => value.score)
        .filter((value): value is number => value != null && Number.isFinite(value));
    const highestScore = availableScores.length ? Math.max(...availableScores) : null;

    return (
        <div role="row" className="grid w-full border-b border-[#F2F3F5] bg-white" style={comparisonGridStyle(members.length)}>
            <button
                type="button"
                aria-expanded={expanded}
                className="sticky left-0 z-10 flex flex-col items-start gap-0.5 border-r border-[#F2F3F5] bg-white px-4 py-3 text-left"
                onClick={onToggle}
            >
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-[#0E1114]">
                    {dimension.label}
                    <ChevronRight className={cn("h-3 w-3 text-[#B0B2B8] transition-transform duration-150", expanded && "rotate-90")}/>
                </span>
                <span className="text-[10px] font-normal text-[#B0B2B8]">
                    {text.maxScoreLabel(formatComparisonNumber(dimension.max_score) || "-")}
                    {dimension.is_core ? ` · ${text.coreDimension}` : ""}
                </span>
            </button>
            {members.map((member) => {
                const value = dimension.values.find((candidateValue) => candidateValue.candidate_id === member.candidate.id);
                const score = value?.score;
                const normalizedScore = value?.normalized_score;
                const hasScore = score != null && normalizedScore != null && Number.isFinite(score) && Number.isFinite(normalizedScore);
                const isBest = Boolean(rankingAllowed && value?.is_highest && hasScore);
                const delta = highestScore != null && score != null ? highestScore - score : null;
                return (
                    <div
                        role="cell"
                        key={member.candidate.id}
                        className={cn(
                            "min-w-0 border-r border-[#F2F3F5] px-4 py-3 text-[12px] leading-[1.6] text-[#33353D] last:border-r-0",
                            isBest && "bg-[rgba(30,59,250,0.05)]",
                        )}
                    >
                        {hasScore ? (
                            <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[14px] font-semibold tabular-nums text-[#0E1114]">
                                        {text.scoreValue(formatComparisonNumber(score) || "-", formatComparisonNumber(dimension.max_score) || "-")}
                                    </span>
                                    {isBest ? <span className="rounded-[4px] bg-[rgba(30,59,250,0.1)] px-1.5 py-0.5 text-[10px] text-[#1E3BFA]">{text.highestScore}</span> : null}
                                    {rankingAllowed && !isBest && delta != null && delta > 0 ? <span className="text-[11px] tabular-nums text-[#F53F3F]">-{formatComparisonNumber(delta)}</span> : null}
                                </div>
                                <div className="h-[5px] overflow-hidden rounded-full bg-[#F2F3F5]">
                                    <div className="h-full rounded-full" style={{width: `${Math.max(0, Math.min(100, normalizedScore))}%`, backgroundColor: scoreBarTone(normalizedScore)}}/>
                                </div>
                                {expanded ? (
                                    <div className="space-y-1.5 pt-0.5 text-[11px] leading-[1.6] text-[#86888F]">
                                        {value?.reason ? <p className="italic">“{value.reason}”</p> : null}
                                        {value?.evidence.length ? <TextList values={value.evidence} emptyText={text.noData}/> : (!value?.reason ? <span>{text.noData}</span> : null)}
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <span className={cn("inline-flex h-[22px] items-center rounded-[4px] px-2 text-[11px]", artifactTone[member.artifact_state])}>
                                {artifactLabel(member.artifact_state, text)}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export function CandidateComparisonTray({candidates, text, onRemove, onClear, onStart}: CandidateComparisonTrayProps) {
    if (!candidates.length) return null;
    const count = candidates.length;
    const hint = count < 2
        ? text.trayNeedMore(2 - count)
        : count >= 4
            ? text.trayFull
            : text.trayCanAdd(count);

    return (
        <CandidateComparisonPortal>
        <aside
            className="fixed bottom-6 left-1/2 z-[70] flex h-16 max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-4 overflow-x-auto rounded-[14px] bg-[#0E1114] px-5 shadow-[0_12px_32px_rgba(14,17,20,0.28)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label={text.trayTitle}
        >
            <div className="flex shrink-0 flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-white">{text.trayTitle}</span>
                <span className="text-[11px] text-white/55">{hint}</span>
            </div>
            <span aria-hidden className="h-8 w-px shrink-0 bg-white/15"/>
            <div className="flex shrink-0 items-center gap-2" aria-live="polite">
                {candidates.map((candidate) => (
                    <span key={candidate.id} className="inline-flex h-8 max-w-[170px] items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-2 text-[12px] text-white">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] text-white" style={{backgroundColor: avatarColor(candidate.id)}}>
                            {candidateInitial(candidate.name)}
                        </span>
                        <span className="max-w-[100px] truncate">{candidate.name || text.unknownCandidate}</span>
                        <button
                            type="button"
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                            aria-label={text.removeCandidateAria(candidate.name || text.unknownCandidate)}
                            onClick={() => onRemove(candidate.id)}
                        >
                            <X className="h-3 w-3"/>
                        </button>
                    </span>
                ))}
            </div>
            <span aria-hidden className="h-8 w-px shrink-0 bg-white/15"/>
            <button type="button" className="shrink-0 text-[12px] text-white/55 transition hover:text-white" onClick={onClear}>
                {text.clearSelection}
            </button>
            <button
                type="button"
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] bg-[#1E3BFA] px-5 text-[13px] font-semibold text-white transition hover:bg-[#0F23D9] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={count < 2}
                onClick={onStart}
            >
                <GitCompareArrows className="h-[15px] w-[15px]"/>
                {text.startComparisonCount(count)}
            </button>
        </aside>
        </CandidateComparisonPortal>
    );
}

export function CandidateComparisonWorkspace({
    preview,
    selectedCandidates,
    detailOpen,
    text,
    loading,
    failed,
    stale,
    processing,
    onBack,
    onRefresh,
    onRemoveCandidate,
    onOpenCandidate,
    resolveCandidateStatus,
    resolveCandidateSource,
}: CandidateComparisonWorkspaceProps) {
    const [expandedDimensions, setExpandedDimensions] = React.useState<Set<string>>(() => new Set());
    // GA 无障碍：全屏工作区（region 语义，非伪 modal），进入时聚焦返回按钮，
    // Escape 返回列表，退出时把焦点还给打开前的触发元素。详情浮层打开时不接管键盘。
    const backButtonRef = React.useRef<HTMLButtonElement | null>(null);
    const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);
    React.useEffect(() => {
        previouslyFocusedRef.current = (document.activeElement as HTMLElement) || null;
        backButtonRef.current?.focus();
        return () => {
            const previous = previouslyFocusedRef.current;
            if (previous && typeof previous.focus === "function" && document.contains(previous)) {
                previous.focus();
            }
        };
    }, []);
    React.useEffect(() => {
        if (detailOpen) return;
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.stopPropagation();
                onBack();
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [detailOpen, onBack]);
    const members = React.useMemo(() => preview?.members || [], [preview]);
    const memberNameById = React.useMemo(
        () => new Map(members.map((member) => [member.candidate.id, member.candidate.name || text.unknownCandidate])),
        [members, text.unknownCandidate],
    );
    const keyDimensions = React.useMemo(() => {
        if (!preview) return [];
        const dimensionByKey = new Map(preview.aligned_dimensions.map((dimension) => [dimension.dimension_key, dimension]));
        return preview.key_differences
            .map((dimensionKey) => dimensionByKey.get(dimensionKey))
            .filter((dimension): dimension is CandidateComparisonAlignedDimension => Boolean(dimension))
            .slice(0, 4);
    }, [preview]);
    const coreDimensions = React.useMemo(() => preview?.aligned_dimensions.filter((dimension) => dimension.is_core) || [], [preview]);
    const otherDimensions = React.useMemo(() => preview?.aligned_dimensions.filter((dimension) => !dimension.is_core) || [], [preview]);
    // 有限可比下，就绪成员的优势/风险与其总分同源、同样可背书，应与总分一并展示；
    // 仅当无任何可背书评分（不可比）时整节隐藏。
    const hasAnyScreening = React.useMemo(() => members.some((member) => member.screening != null), [members]);
    const bestOverallScore = React.useMemo(() => {
        if (!preview?.comparability.ranking_allowed || preview.manual_override_mode !== "none") return null;
        const scores = members.map(normalizedAiScore).filter((score): score is number => score != null);
        return scores.length ? Math.max(...scores) : null;
    }, [members, preview]);
    const protocolLabel = React.useMemo(() => {
        const protocol = members.find((member) => member.screening)?.screening?.protocol;
        return [protocol?.prompt_version, protocol?.model_name].filter(Boolean).join(" · ") || text.protocolUnavailable;
    }, [members, text.protocolUnavailable]);
    const latestUpdatedAt = React.useMemo(() => {
        const timestamps = members
            .map((member) => member.revisions.candidate_updated_at)
            .filter((value): value is string => Boolean(value))
            .map((value) => new Date(value))
            .filter((value) => !Number.isNaN(value.getTime()))
            .sort((a, b) => b.getTime() - a.getTime());
        return timestamps.length ? formatComparisonDateTime(timestamps[0].toISOString()) : null;
    }, [members]);
    const differenceCards = React.useMemo<DifferenceCard[]>(() => {
        if (!preview?.comparability.score_deltas_allowed) return [];
        const dimensionCards = keyDimensions.map((dimension) => {
            const values = dimension.values
                .filter((value) => value.score != null)
                .map((value) => ({
                    name: memberNameById.get(value.candidate_id) || text.unknownCandidate,
                    score: value.score as number,
                }))
                .sort((a, b) => b.score - a.score);
            return {
                key: dimension.dimension_key,
                kind: "dimension" as const,
                title: dimension.label,
                description: [
                    ...values.map((value) => `${value.name} ${text.scoreValue(formatComparisonNumber(value.score) || "-", formatComparisonNumber(dimension.max_score) || "-")}`),
                    dimension.spread != null ? text.differenceSpread(formatComparisonNumber(dimension.spread) || "0") : null,
                ].filter(Boolean).join(" · "),
                tag: dimension.is_core ? text.coreDimension : text.dimensionsTitle,
            };
        });
        const duplicateCards = preview.possible_duplicate_groups.map((group, index) => {
            const matchLabel = group.matched_by === "phone" ? text.duplicatePhone : group.matched_by === "email" ? text.duplicateEmail : text.duplicateBoth;
            const names = group.candidate_ids.map((candidateId) => memberNameById.get(candidateId) || text.unknownCandidate).join(" · ");
            return {
                key: `duplicate-${group.matched_by}-${index}`,
                kind: "duplicate" as const,
                title: text.duplicateWarningTitle,
                description: text.duplicateGroup(matchLabel, names),
                tag: matchLabel,
            };
        });
        return [...dimensionCards, ...duplicateCards].slice(0, 4);
    }, [keyDimensions, memberNameById, preview, text]);

    React.useEffect(() => {
        setExpandedDimensions(new Set());
    }, [preview?.snapshot_version]);

    const toggleDimension = React.useCallback((dimensionKey: string) => {
        setExpandedDimensions((current) => {
            const next = new Set(current);
            if (next.has(dimensionKey)) next.delete(dimensionKey);
            else next.add(dimensionKey);
            return next;
        });
    }, []);

    const level = preview?.comparability.level;
    const levelBadge = level === "strict" ? text.strictBadge : level === "limited" ? text.limitedBadge : text.incompatibleBadge;
    const levelColors = level === "strict"
        ? {background: "rgba(12,201,145,0.12)", color: "#0CC991", banner: "rgba(12,201,145,0.06)", border: "rgba(12,201,145,0.3)", accent: "#0CC991"}
        : level === "limited"
            ? {background: "rgba(255,171,36,0.14)", color: "#D48806", banner: "rgba(255,171,36,0.09)", border: "rgba(255,171,36,0.35)", accent: "#D48806"}
            : {background: "rgba(245,63,63,0.1)", color: "#F53F3F", banner: "rgba(245,63,63,0.06)", border: "rgba(245,63,63,0.3)", accent: "#F53F3F"};

    return (
        <CandidateComparisonPortal>
        <section
            role="region"
            aria-label={text.title}
            className={cn(
                "fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-[#F7F8FA]",
                detailOpen ? "z-40" : "z-[10000]",
            )}
        >
            <header className="flex h-[60px] shrink-0 items-center gap-4 border-b border-[#E6E7EB] bg-white px-8">
                <div className="flex min-w-0 items-center gap-4">
                    <button ref={backButtonRef} type="button" className="flex shrink-0 items-center gap-1.5 text-[13px] text-[#33353D] transition hover:text-[#1E3BFA]" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4"/>
                        {text.backToCandidates}
                    </button>
                    <span aria-hidden className="h-5 w-px shrink-0 bg-[#E6E7EB]"/>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                            <h2 className="text-[16px] font-semibold text-[#0E1114]">{text.title}</h2>
                            <span className="text-[12px] text-[#86888F]">{text.comparisonCount(selectedCandidates.length)}</span>
                            {preview ? (
                                <span className="inline-flex h-[22px] items-center rounded-full px-2.5 text-[12px] font-medium" style={{backgroundColor: levelColors.background, color: levelColors.color}}>
                                    {levelBadge}
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-0.5 max-w-[980px] truncate text-[11px] text-[#B0B2B8]" title={preview ? text.snapshotVersion(preview.snapshot_version) : undefined}>
                            {[preview?.target_context.position_title, protocolLabel, latestUpdatedAt ? text.updatedAt(latestUpdatedAt) : null].filter(Boolean).join(" · ")}
                        </p>
                    </div>
                </div>
            </header>

            {loading && !preview ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-[#1E3BFA]"/>
                    <p className="text-[13px] text-[#33353D]">{text.loading}</p>
                    <p className="text-[12px] text-[#86888F]">{selectedCandidates.map((candidate) => candidate.name).join(" · ")}</p>
                </div>
            ) : failed && !preview ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                    <ShieldAlert className="h-8 w-8 text-[#F53F3F]"/>
                    <p className="text-[14px] font-medium text-[#0E1114]">{text.loadFailed}</p>
                    <Button type="button" size="sm" className="bg-[#1E3BFA] hover:bg-[#0F23D9]" onClick={onRefresh}>{text.retry}</Button>
                </div>
            ) : preview ? (
                <div className="min-h-0 flex-1 overflow-auto px-8 pb-12 pt-5">
                    <div className="w-full">
                        {stale ? (
                            <div className="mb-4 flex items-start gap-3 rounded-[8px] border border-[rgba(255,171,36,0.35)] bg-[rgba(255,171,36,0.09)] px-4 py-3 text-[#8A5A00]" role="status">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
                                <div className="min-w-0"><p className="text-[13px] font-medium">{text.staleTitle}</p><p className="mt-0.5 text-[12px]">{text.staleDescription}</p></div>
                            </div>
                        ) : null}
                        {failed ? (
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[rgba(245,63,63,0.3)] bg-[rgba(245,63,63,0.06)] px-4 py-3 text-[#F53F3F]" role="alert">
                                <span className="flex items-center gap-2 text-[12px] font-medium"><ShieldAlert className="h-4 w-4"/>{text.loadFailed}</span>
                                <button type="button" className="text-[12px] text-[#0F23D9]" onClick={onRefresh}>{text.retry}</button>
                            </div>
                        ) : null}
                        {processing ? (
                            <div className="mb-4 flex items-center gap-2 rounded-[8px] border border-[rgba(46,156,255,0.28)] bg-[rgba(46,156,255,0.08)] px-4 py-3 text-[12px] text-[#216EAD]" role="status">
                                <Loader2 className="h-3.5 w-3.5 animate-spin"/>{text.processingReconcile}
                            </div>
                        ) : null}

                        <section className="mb-4 flex gap-3 rounded-[8px] border px-[18px] py-3.5" style={{backgroundColor: levelColors.banner, borderColor: levelColors.border}}>
                            <span aria-hidden className="w-1 shrink-0 rounded-full" style={{backgroundColor: levelColors.accent}}/>
                            <div className="min-w-0">
                                <h3 className="text-[13px] font-semibold text-[#0E1114]">
                                    {level === "strict" ? text.strictTitle : level === "limited" ? text.limitedTitle : text.incompatibleTitle}
                                </h3>
                                <p className="mt-1 text-[12px] leading-[1.7] text-[#33353D]">
                                    {level === "strict"
                                        ? (preview.comparability.ranking_allowed ? text.strictDescription : text.strictNoRankingDescription)
                                        : level === "limited" ? text.limitedDescription : text.incompatibleDescription}
                                </p>
                                {preview.comparability.reasons.length ? (
                                    <ul className="mt-1.5 space-y-0.5 text-[11px] leading-[1.6] text-[#86888F]">
                                        {preview.comparability.reasons.map((reason) => <li key={reason}>· {reasonLabel(reason, text)}</li>)}
                                    </ul>
                                ) : null}
                            </div>
                        </section>

                        {differenceCards.length ? (
                            <section className="mb-4">
                                <h3 className="mb-2.5 text-[14px] font-semibold text-[#0E1114]">{text.keyDifferencesTitle}</h3>
                                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
                                    {differenceCards.map((card) => (
                                        <article key={card.key} className="flex gap-3 rounded-[8px] border border-[#EBEEF5] bg-white px-3.5 py-3">
                                            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]", card.kind === "duplicate" ? "bg-[rgba(255,171,36,0.12)] text-[#D48806]" : "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]") }>
                                                {card.kind === "duplicate" ? <Copy className="h-[15px] w-[15px]"/> : <ArrowRightLeft className="h-[15px] w-[15px]"/>}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h4 className="text-[13px] font-semibold text-[#0E1114]">{card.title}</h4>
                                                    <span className={cn("rounded-[4px] px-1.5 py-0.5 text-[10px]", card.kind === "duplicate" ? "bg-[rgba(255,171,36,0.12)] text-[#D48806]" : "bg-[rgba(30,59,250,0.08)] text-[#1E3BFA]")}>{card.tag}</span>
                                                </div>
                                                <p className="mt-0.5 text-[12px] leading-[1.6] text-[#33353D]">{card.description}</p>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </section>
                        ) : null}

                        {level === "strict" && preview.manual_override_mode !== "none" ? (
                            <div className="mb-4 flex items-center gap-2 rounded-[8px] border border-[rgba(255,171,36,0.3)] bg-[rgba(255,171,36,0.08)] px-3.5 py-2.5 text-[12px] text-[#8A5A00]">
                                <AlertTriangle className="h-[15px] w-[15px] shrink-0 text-[#D48806]"/>{manualModeLabel(preview, text)} · {text.manualScoreIndependent}
                            </div>
                        ) : null}

                        <section className="overflow-x-auto rounded-[10px] border border-[#E6E7EB] bg-white">
                            <div role="table" aria-label={text.title} className="w-full" style={comparisonTableStyle(members.length)}>
                                <div role="row" className="sticky top-0 z-30 grid w-full border-b border-[#E6E7EB] bg-white" style={comparisonGridStyle(members.length)}>
                                    <div role="columnheader" className="sticky left-0 z-40 flex items-end border-r border-[#F2F3F5] bg-white px-4 py-4 text-[12px] text-[#86888F]">{text.comparisonDimension}</div>
                                    {members.map((member) => {
                                        const displayStatus = member.candidate.display_status || member.candidate.status;
                                        const aiScore = normalizedAiScore(member);
                                        const rawScore = member.screening?.ai.total_score;
                                        const rawScale = member.screening?.ai.total_score_scale;
                                        const isBest = bestOverallScore != null && aiScore != null && Math.abs(bestOverallScore - aiScore) < 0.005;
                                        const manualScore = member.manual_review?.score;
                                        return (
                                            <div role="columnheader" key={member.candidate.id} className="relative flex min-w-0 flex-col gap-2.5 border-r border-[#F2F3F5] px-4 py-4 last:border-r-0">
                                                <button type="button" className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded text-[#B0B2B8] transition hover:bg-[#F2F3F5] hover:text-[#F53F3F]" aria-label={text.removeCandidateAria(member.candidate.name || text.unknownCandidate)} onClick={() => onRemoveCandidate(member.candidate.id)}>
                                                    <X className="h-3.5 w-3.5"/>
                                                </button>
                                                <div className="flex min-w-0 items-center gap-2.5 pr-6">
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-normal text-white" style={{backgroundColor: avatarColor(member.candidate.id)}}>{candidateInitial(member.candidate.name)}</span>
                                                    <div className="min-w-0">
                                                        <div className="flex min-w-0 items-center gap-1.5">
                                                            <span className="truncate text-[14px] font-semibold text-[#0E1114]">{member.candidate.name || text.unknownCandidate}</span>
                                                            {isBest ? <span className="shrink-0 rounded-[4px] bg-[rgba(30,59,250,0.1)] px-1.5 py-0.5 text-[10px] text-[#1E3BFA]">{text.totalScoreHighest}</span> : null}
                                                        </div>
                                                        <p className="truncate text-[11px] font-normal text-[#86888F]">{preview.target_context.position_title}</p>
                                                    </div>
                                                </div>
                                                <p className="truncate text-[11px] font-normal text-[#86888F]">{[member.facts.years_of_experience, member.facts.city, member.facts.education].filter(Boolean).join(" · ") || text.noData}</p>
                                                <div className="flex items-end gap-2">
                                                    <span className={cn("text-[28px] font-semibold leading-none tabular-nums", aiScore == null ? "text-[#86888F]" : "text-[#0E1114]")}>{aiScore == null ? "—" : formatComparisonNumber(aiScore, 0)}</span>
                                                    <span className="flex flex-col gap-0.5 pb-0.5 text-[10px] font-normal text-[#B0B2B8]">
                                                        <span>{text.aiNormalizedScore}</span>
                                                        <span>{rawScore == null || rawScale == null ? text.noData : text.rawScore(formatComparisonNumber(rawScore) || "-", formatComparisonNumber(rawScale) || "-")}</span>
                                                    </span>
                                                    {member.artifact_state !== "strict" ? <span className={cn("mb-0.5 inline-flex h-[18px] items-center rounded-[4px] px-1.5 text-[10px] font-normal", artifactTone[member.artifact_state])}>{artifactLabel(member.artifact_state, text)}</span> : null}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={cn("inline-flex h-5 items-center rounded-[4px] px-2 text-[11px] font-normal", statusTone(displayStatus))}>{resolveCandidateStatus(displayStatus)}</span>
                                                    <span className={cn("text-[11px] font-normal", manualScore == null ? "text-[#B0B2B8]" : "text-[#1E3BFA]")}>{manualScore == null ? text.manualScoreMissing : text.manualScoreValue(formatComparisonNumber(manualScore) || "-")}</span>
                                                </div>
                                                <div className="flex gap-3 pt-0.5 text-[12px] font-normal">
                                                    <button type="button" className="text-[#0F23D9] hover:text-[#1E3BFA]" onClick={() => onOpenCandidate(member.candidate.id)}>{text.viewDetails}</button>
                                                    <button type="button" className="text-[#86888F] hover:text-[#F53F3F]" onClick={() => onRemoveCandidate(member.candidate.id)}>{text.removeCandidate}</button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <ComparisonSectionTitle title={text.factsTitle} members={members}/>
                                {[
                                    // GA：所有事实字段以 Preview DTO（member.facts）为唯一权威源，不再混用列表缓存；
                                    // 移除无对比价值且实为"应聘岗位"的"当前/最近职位"行。
                                    {key: "company", label: text.currentCompany, value: (member: CandidateComparisonMember) => member.facts.current_company},
                                    {key: "experience", label: text.experience, value: (member: CandidateComparisonMember) => member.facts.years_of_experience},
                                    {key: "city", label: text.city, value: (member: CandidateComparisonMember) => member.facts.city},
                                    {key: "education", label: text.education, value: (member: CandidateComparisonMember) => member.facts.education},
                                    {key: "source", label: text.source, value: (member: CandidateComparisonMember) => resolveCandidateSource(member.facts.source)},
                                    {key: "status", label: text.currentStage, value: (member: CandidateComparisonMember) => resolveCandidateStatus(member.candidate.display_status || member.candidate.status)},
                                ].map((row) => (
                                    <ComparisonGridRow key={row.key} label={row.label} members={members}>
                                        {(member) => preview.comparability.facts_allowed ? (row.value(member) || text.noData) : text.unavailable}
                                    </ComparisonGridRow>
                                ))}

                                {coreDimensions.length ? <ComparisonSectionTitle title={text.coreDimensionsSection} members={members}/> : null}
                                {coreDimensions.map((dimension) => <DimensionComparisonRow key={dimension.dimension_key} dimension={dimension} members={members} text={text} expanded={expandedDimensions.has(dimension.dimension_key)} rankingAllowed={preview.comparability.ranking_allowed && preview.manual_override_mode === "none"} onToggle={() => toggleDimension(dimension.dimension_key)}/>)}

                                {otherDimensions.length ? <ComparisonSectionTitle title={text.otherDimensionsSection} members={members}/> : null}
                                {otherDimensions.map((dimension) => <DimensionComparisonRow key={dimension.dimension_key} dimension={dimension} members={members} text={text} expanded={expandedDimensions.has(dimension.dimension_key)} rankingAllowed={preview.comparability.ranking_allowed && preview.manual_override_mode === "none"} onToggle={() => toggleDimension(dimension.dimension_key)}/>)}

                                <ComparisonSectionTitle title={text.totalScoresSection} members={members}/>
                                <ComparisonGridRow
                                    label={<div><p>{text.aiScore}</p><p className="mt-0.5 text-[10px] font-normal text-[#B0B2B8]">{preview.manual_override_mode === "none" ? text.aiNormalizedScore : text.manualScoreIndependent}</p></div>}
                                    members={members}
                                    cellClassName={(member) => {
                                        const score = normalizedAiScore(member);
                                        return bestOverallScore != null && score != null && Math.abs(bestOverallScore - score) < 0.005 ? "bg-[rgba(30,59,250,0.05)]" : undefined;
                                    }}
                                >
                                    {(member) => {
                                        const score = normalizedAiScore(member);
                                        const isBest = bestOverallScore != null && score != null && Math.abs(bestOverallScore - score) < 0.005;
                                        if (score == null) return <span className="text-[#B0B2B8]">{text.noData}</span>;
                                        return <div className="space-y-1.5"><div className="flex items-center gap-2"><span className="text-[14px] font-semibold tabular-nums text-[#0E1114]">{formatComparisonNumber(score, 0)} / 100</span>{isBest ? <span className="rounded-[4px] bg-[rgba(30,59,250,0.1)] px-1.5 py-0.5 text-[10px] text-[#1E3BFA]">{text.highestScore}</span> : null}</div><div className="h-[5px] overflow-hidden rounded-full bg-[#F2F3F5]"><div className="h-full rounded-full" style={{width: `${score}%`, backgroundColor: scoreBarTone(score)}}/></div></div>;
                                    }}
                                </ComparisonGridRow>
                                <ComparisonGridRow label={<div><p>{text.manualScoreTitle}</p><p className="mt-0.5 text-[10px] font-normal text-[#B0B2B8]">{text.manualScoreIndependent}</p></div>} members={members} emphasized={preview.manual_override_mode !== "none"}>
                                    {(member) => {
                                        // GA：人工复核独立于 AI 工件（member.manual_review），AI 分被冻结/清除时仍展示；
                                        // 仅当 ranking_basis=manual 时按人工分标最佳，绝不与 AI 分混排。
                                        const review = member.manual_review;
                                        const score = review?.score;
                                        const isBest = Boolean(preview.comparability.ranking_basis === "manual" && review?.is_highest && score != null);
                                        return <div><div className="flex items-center gap-2"><p className="text-[14px] font-semibold tabular-nums text-[#0E1114]">{score == null ? "—" : `${formatComparisonNumber(score)} / 100`}</p>{isBest ? <span className="rounded-[4px] bg-[rgba(30,59,250,0.1)] px-1.5 py-0.5 text-[10px] text-[#1E3BFA]">{text.highestScore}</span> : null}</div><p className="mt-1 text-[10px] text-[#B0B2B8]">{score == null ? text.manualScoreMissing : review?.reason || text.manualScoreIndependent}</p></div>;
                                    }}
                                </ComparisonGridRow>
                                <ComparisonGridRow label={text.recommendation} members={members}>
                                    {(member) => member.screening?.ai.recommendation || text.noData}
                                </ComparisonGridRow>

                                {hasAnyScreening ? <ComparisonSectionTitle title={text.aiAssessmentTitle} members={members}/> : null}
                                {hasAnyScreening ? <ComparisonGridRow label={text.strengthsTitle} members={members}>{(member) => <TextList values={member.screening?.ai.advantages || []} emptyText={text.noData} dotColor="#0CC991"/>}</ComparisonGridRow> : null}
                                {hasAnyScreening ? <ComparisonGridRow label={text.risksTitle} members={members}>{(member) => <TextList values={member.screening?.ai.concerns || []} emptyText={text.noData} dotColor="#FFAB24"/>}</ComparisonGridRow> : null}
                            </div>
                        </section>

                        <div className="mt-3 flex items-start gap-1.5 text-[11px] leading-[1.7] text-[#B0B2B8]">
                            <Info className="mt-0.5 h-[13px] w-[13px] shrink-0"/>
                            <p>{text.readOnlyDecisionNote}</p>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
        </CandidateComparisonPortal>
    );
}
