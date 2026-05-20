"use client";

import React, {useCallback, useDeferredValue, useEffect, useMemo, useRef, startTransition, useState} from "react";
import {createPortal} from "react-dom";
import {
    ArrowLeft,
    Bot,
    BriefcaseBusiness,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ClipboardCheck,
    ExternalLink,
    Eye,
    FilePlus2,
    FileText,
    Loader2,
    NotebookText,
    Plus,
    RefreshCw,
    Rocket,
    RotateCcw,
    Save,
    Send,
    Settings2,
    Sparkles,
    Square,
    Trash2,
    Upload,
    Users,
    Wand2,
    X,
} from "lucide-react";
import {toast} from "@/lib/toast";
import type {ScriptHubOrganizationDefinition} from "@/lib/types";

import {authenticatedFetch, getScriptHubAuthHeaderRecord, getStoredScriptHubSession} from "@/lib/auth";
import {
    DEFAULT_QUERY_CANDIDATES_LIMIT,
    type RecruitmentAssistantClarificationOption,
    type RecruitmentAssistantClarificationRequest,
    type RecruitmentAssistantClarificationResponse,
    type RecruitmentAssistantMessageCompletedPayload,
    type RecruitmentAssistantPageInfo,
    type RecruitmentAssistantPreparedResumeMail,
    type RecruitmentAssistantRunRequest,
    type RecruitmentAssistantStreamEvent,
    type RecruitmentAssistantStreamEventType,
    type RecruitmentAssistantToolResultPayload,
} from "@/lib/recruitment-assistant-protocol";
import {
    isRecruitmentRequestAborted,
    joinTags,
    recruitmentApi,
    splitTags,
    type AITaskLog,
    type CandidateDetail,
    type CandidateSummary,
    type ChatContext,
    type InterviewSchedule,
    type FollowUp,
    type RecruitmentOffer,
    type ChatResponse,
    type DashboardData,
    type JDVersion,
    type PositionDetail,
    type PositionSummary,
    type RecruitmentLLMConfig,
    type RecruitmentMailRecipient,
    type RecruitmentMailSenderConfig,
    type RecruitmentMailAutoPushGlobalConfig,
    type RecruitmentOrganizationScope,
    type RecruitmentResumeMailDispatch,
    type RecruitmentMetadata,
    type RecruitmentSkill,
    type RecruitmentTaskBatchStartResponse,
    type ResumeFile,
    type ResumeUploadResponse,
    type RecruitmentTaskStartResponse,
    triggerAIPositionMatch,
} from "@/lib/recruitment-api";
import {useI18n} from "@/lib/i18n";
import {cn} from "@/lib/utils";
import {Badge} from "@/components/ui/badge";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {Button} from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {OrgScopeBreadcrumbPicker} from './OrgScopeBreadcrumbPicker';
import {Textarea} from "@/components/ui/textarea";
import {
    aiTaskLabels,
    type AssistantDisplayMode,
    auditListColumnBaseWidths,
    auditListColumnFillWeights,
    type CandidateEditorState,
    type CandidateListColumnKey,
    candidateListColumnDefaultWidths,
    candidateListColumnFillWeights,
    candidateStatusLabels,
    type CandidateViewMode,
    type ChatMessage,
    type JDViewMode,
    type LLMFormState,
    mailSenderPresets,
    type MailSenderPresetKey,
    type MailRecipientFormState,
    type MailSenderFormState,
    pageMeta,
    panelClass,
    type PositionFormState,
    positionStatusLabels,
    providerLabels,
    type RecruitmentPage,
    getRecruitmentToastLocale,
    type ResumeMailDialogMode,
    type ResumeMailFormState,
    type ScreeningSkillFormData,
    type SkillFormState,
    type SkillTaskKind,
} from "./types";
import {
    buildQuery,
    clampCandidateListColumnWidth,
    expandTableColumnWidths,
    emptyCandidateEditor,
    emptyLLMForm,
    emptyMailRecipientForm,
    emptyMailSenderForm,
    emptyPositionForm,
    emptyResumeMailForm,
    emptyScreeningSkillForm,
    emptySkillForm,
    extractFileNameFromDisposition,
    extractPublishText,
    formatActionError,
    formatDateTime,
    generateSkillContent,
    parseSkillContent,
    formatLongDateTime,
    formatPercent,
    formatSkillNames,
    inferMailSenderPreset,
    isLiveTaskStatus,
    isTerminalTaskStatus,
    isToday,
    labelForCandidateStatus,
    labelForJDGenerationStatus,
    labelForMemorySource,
    labelForPositionStatus,
    labelForProvider,
    labelForTaskExecutionStatus,
    parseEmailList,
    parseStructuredLogOutput,
    resolveCandidateDisplayStatus,
    resolveCandidateFacingErrorContext,
    resolveTalentPoolDisplayStatus,
    resolveLogSkillSnapshots,
    resolveTaskSkillIds,
    sanitizeCandidateFacingErrorText,
    shortText,
    sortSkillsForTaskPreference,
    statusBadgeClass,
    toggleIdInList,
    toggleSingleSkillId,
    withinDays,
} from "./utils";
import {
    EmptyState,
    Field,
    InfoTile,
    LoadingCard,
    LoadingPanel,
    NativeSelect,
    SearchField,
    SettingsEntry,
} from "./components/SharedComponents";
import {StructuredSkillEditor} from "./components/StructuredSkillEditor";
import {CandidateRadarChart} from "./components/CandidateRadarChart";
import {AssistantPage} from "./pages/AssistantPage";
import {AuditPage} from "./pages/AuditPage";
import {CandidatesPage} from "./pages/CandidatesPage";
import {MailSettingsPage} from "./pages/MailSettingsPage";
import {ModelSettingsPage} from "./pages/ModelSettingsPage";
import {SkillSettingsPage} from "./pages/SkillSettingsPage";
import {TalentPoolPage} from "./pages/TalentPoolPage";
import {WorkspacePage} from "./pages/WorkspacePage";
import { useOptimizedStats, useCachedListData, useCachedObjectData, useTaskSSE, type TaskSSEEvent } from "./hooks";
import {
    navigateToRecruitmentPage,
    recruitmentNavBus,
    resolveRecruitmentNavigationDetail,
    syncRecruitmentActivePage,
} from '@/lib/recruitmentNavBus';

const TASK_MONITOR_VISIBLE_INTERVAL_MS = 30_000;
const TASK_MONITOR_HIDDEN_INTERVAL_MS = 60_000;
const TASK_MONITOR_MAX_INTERVAL_MS = 30_000;
const TASK_MONITOR_BATCH_SCALE_THRESHOLD = 8;
const CANDIDATE_SSE_BATCH_WINDOW_MS = 100;
const ALL_COMPANY_DEPARTMENTS_VALUE = "__all_company_departments__";
const TERMINAL_SCREENING_TASK_STATUSES = new Set([
    "success",
    "fallback",
    "failed",
    "invalid_result",
    "json_parse_failed",
    "timeout",
    "retry_exhausted",
    "cancelled",
    "quota_exceeded",
    "rate_limited",
    "upstream_timeout",
    "request_failed",
    "screening_total_timeout",
]);

type CandidateSnapshotBatchUpdate = {
    snapshot: Partial<CandidateSummary>;
    insertIntoCandidateList?: boolean;
};

function mergeCandidatePatch<T extends Partial<CandidateSummary>>(current: T, patch: Partial<CandidateSummary>): T {
    let changed = false;
    const currentRecord = current as Record<string, unknown>;
    const patchRecord = patch as Record<string, unknown>;
    Object.keys(patchRecord).forEach((key) => {
        if (!Object.is(currentRecord[key], patchRecord[key])) {
            changed = true;
        }
    });
    return changed ? ({ ...current, ...patch } as T) : current;
}

function resolveStableCandidateDisplayStatus(candidate: Partial<CandidateSummary>) {
    const explicitDisplayStatus = String(candidate.display_status || "").trim();
    if (explicitDisplayStatus && explicitDisplayStatus !== "screening_running") {
        return explicitDisplayStatus;
    }
    const rawStatus = String(candidate.status || "").trim();
    if (rawStatus === "pending_screening") {
        return String(candidate.ai_recommended_status || rawStatus || "").trim();
    }
    return rawStatus || explicitDisplayStatus;
}

function sanitizeTerminalScreeningCandidateSnapshot(
    candidate?: Partial<CandidateSummary> | null,
    taskStatus?: string | null,
): Partial<CandidateSummary> | null {
    if (!candidate?.id) {
        return null;
    }
    const normalizedTaskStatus = String(taskStatus || "").trim().toLowerCase();
    const nextCandidate: Partial<CandidateSummary> = {
        ...candidate,
        active_screening_run_id: null,
        active_screening_task_id: null,
        active_screening_task_type: null,
        active_screening_stage: null,
        active_screening_status: null,
        active_screening_task_status: null,
        active_screening_auto_retry_scheduled: false,
    };
    if (normalizedTaskStatus === "success" || normalizedTaskStatus === "fallback") {
        nextCandidate.active_screening_failure_code = null;
        nextCandidate.display_status_reason = null;
    }
    // 后端 snapshot 已带明确终态 display_status 时直接保留，不走推导逻辑
    const TERMINAL_DISPLAY_STATUSES = new Set([
        "screening_passed", "screening_rejected", "screening_failed",
        "pending_screening", "unmatched", "talent_pool",
    ]);
    const originalDisplayStatus = String(nextCandidate.display_status || "").trim();
    if (TERMINAL_DISPLAY_STATUSES.has(originalDisplayStatus)) {
        // 保留后端终态值
    } else {
        nextCandidate.display_status = resolveStableCandidateDisplayStatus(nextCandidate);
    }
    return nextCandidate;
}

const POPULAR_CITIES = [
    "北京", "上海", "广州", "深圳", "杭州", "成都", "南京", "武汉",
    "西安", "重庆", "天津", "苏州", "长沙", "郑州", "东莞", "沈阳",
    "青岛", "宁波", "昆明", "厦门", "福州", "无锡", "合肥", "大连",
    "南昌", "哈尔滨", "济南", "佛山", "长春", "石家庄", "贵阳", "兰州",
];

type OrgScopedItem = {
    org_code?: string | null;
    scope_level?: string | null;
    share_policy?: string | null;
    allow_sub_org_use?: boolean | null;
};

type PositionSkillBindingField = "jdSkillIds" | "screeningSkillIds" | "interviewSkillIds";
type PositionSkillSectionExpandedState = Record<PositionSkillBindingField, boolean>;

const DEFAULT_POSITION_SKILL_SECTION_EXPANDED_STATE: PositionSkillSectionExpandedState = {
    jdSkillIds: false,
    screeningSkillIds: false,
    interviewSkillIds: false,
};

type OrganizationSelectOption = {
    value: string;
    label: string;
    description?: string;
    organization?: ScriptHubOrganizationDefinition;
};

type PositionFormErrors = Partial<Record<"orgCode" | "title" | "headcount", string>>;
type SkillFormErrors = Partial<Record<"name" | "content" | "sortOrder", string>>;
type LLMFormErrors = Partial<Record<"configKey" | "taskType" | "provider" | "modelName" | "maxConcurrent" | "maxQps" | "priority" | "extraConfigText", string>>;

function normalizeRecruitmentOrgCode(value?: string | null) {
    const text = String(value || "").trim();
    return text || "group";
}

function getFallbackOrganizationLabel(orgCode?: string | null) {
    const code = normalizeRecruitmentOrgCode(orgCode);
    const knownLabels: Record<string, string> = {
        group: "集团",
        haoshi: "好柿公司",
        chunmiao: "春苗公司",
    };
    return knownLabels[code] || code;
}

function isCompanyLikeOrganization(organization?: ScriptHubOrganizationDefinition | null) {
    const type = String(organization?.org_type || "").toLowerCase();
    return type === "company" || type === "sub_group" || type === "group";
}

function isDepartmentOrganization(organization?: ScriptHubOrganizationDefinition | null) {
    return String(organization?.org_type || "").toLowerCase() === "department";
}

function deduplicateCandidates(candidates: CandidateSummary[]): CandidateSummary[] {
    const seen = new Map<number, CandidateSummary>();
    for (const c of candidates) {
        seen.set(c.id, c);
    }
    return Array.from(seen.values());
}

const CANDIDATE_LIST_EXCLUDED_STATUSES = new Set(["matching", "unmatched", "talent_pool"]);
let sharedRecruitmentMetadataCache: RecruitmentMetadata | null = null;
let sharedRecruitmentMetadataPromise: Promise<RecruitmentMetadata> | null = null;
let sharedOrganizationScopeCache: RecruitmentOrganizationScope | null = null;
let sharedOrganizationScopePromise: Promise<RecruitmentOrganizationScope> | null = null;

function resolveScrollAreaViewport(node: HTMLDivElement | null): HTMLDivElement | null {
    if (!node) {
        return null;
    }
    return (node.querySelector("[data-slot='scroll-area-viewport']") as HTMLDivElement | null) || node;
}

function getOrganizationDepth(organization?: ScriptHubOrganizationDefinition | null) {
    return String(organization?.path || organization?.org_code || "")
        .split("/")
        .filter(Boolean).length;
}

function isOrganizationInScope(
    organizations: Map<string, ScriptHubOrganizationDefinition>,
    scopeCode: string,
    orgCode: string,
) {
    const normalizedScopeCode = normalizeRecruitmentOrgCode(scopeCode);
    const normalizedOrgCode = normalizeRecruitmentOrgCode(orgCode);
    if (normalizedScopeCode === normalizedOrgCode) {
        return true;
    }
    const scope = organizations.get(normalizedScopeCode);
    const organization = organizations.get(normalizedOrgCode);
    return Boolean(scope && organization && String(organization.path || "").startsWith(`${scope.path}/`));
}

function findCompanyScopeCodeForOrg(
    orgCode: string,
    organizations: Map<string, ScriptHubOrganizationDefinition>,
) {
    let current = organizations.get(normalizeRecruitmentOrgCode(orgCode));
    const visited = new Set<string>();
    while (current && !visited.has(current.org_code)) {
        visited.add(current.org_code);
        if (isCompanyLikeOrganization(current)) {
            return current.org_code;
        }
        current = current.parent_org_code ? organizations.get(current.parent_org_code) : undefined;
    }
    return normalizeRecruitmentOrgCode(orgCode);
}

function getOrganizationPathLabel(
    orgCode: string,
    organizations: Map<string, ScriptHubOrganizationDefinition>,
) {
    const organization = organizations.get(normalizeRecruitmentOrgCode(orgCode));
    if (!organization) {
        return getFallbackOrganizationLabel(orgCode);
    }
    const segments: string[] = [];
    let current: ScriptHubOrganizationDefinition | undefined = organization;
    const visited = new Set<string>();
    while (current && !visited.has(current.org_code)) {
        visited.add(current.org_code);
        if (current.org_type !== "group" || current.org_code === organization.org_code) {
            segments.unshift(current.name || current.org_code);
        }
        current = current.parent_org_code ? organizations.get(current.parent_org_code) : undefined;
    }
    return segments.join(" / ") || organization.name || organization.org_code;
}

function getOrganizationRelativePathLabel(
    orgCode: string,
    rootOrgCode: string,
    organizations: Map<string, ScriptHubOrganizationDefinition>,
) {
    const organization = organizations.get(normalizeRecruitmentOrgCode(orgCode));
    if (!organization) {
        return getFallbackOrganizationLabel(orgCode);
    }

    const rootCode = normalizeRecruitmentOrgCode(rootOrgCode);
    const segments: string[] = [];
    let current: ScriptHubOrganizationDefinition | undefined = organization;
    const visited = new Set<string>();
    while (current && !visited.has(current.org_code)) {
        visited.add(current.org_code);
        if (current.org_code === rootCode) {
            break;
        }
        if (current.org_type !== "group" || current.org_code === organization.org_code) {
            segments.unshift(current.name || current.org_code);
        }
        current = current.parent_org_code ? organizations.get(current.parent_org_code) : undefined;
    }
    return segments.join(" / ") || organization.name || organization.org_code;
}

function filterBusinessRowsByOrgCodes<T extends OrgScopedItem>(rows: T[], orgCodes: string[]) {
    const allowedOrgCodes = new Set(orgCodes.map(normalizeRecruitmentOrgCode));
    if (!allowedOrgCodes.size) {
        return [];
    }
    return rows.filter((row) => allowedOrgCodes.has(normalizeRecruitmentOrgCode(row.org_code)));
}

function resourceMatchesAnyOrgCode<T extends OrgScopedItem>(
    row: T,
    orgCodes: string[],
    organizations: Map<string, ScriptHubOrganizationDefinition>,
) {
    const targetOrgCodes = orgCodes.map(normalizeRecruitmentOrgCode);
    if (!targetOrgCodes.length) {
        return false;
    }
    const rowOrgCode = normalizeRecruitmentOrgCode(row.org_code);
    if (targetOrgCodes.includes(rowOrgCode)) {
        return true;
    }
    const scopeLevel = String(row.scope_level || "").toUpperCase();
    if (scopeLevel === "GLOBAL") {
        return true;
    }
    const sharePolicy = String(row.share_policy || "").toUpperCase();
    if (sharePolicy === "PUBLIC_IN_GROUP") {
        return true;
    }
    return Boolean(row.allow_sub_org_use) && targetOrgCodes.some((targetOrgCode) => (
        isOrganizationInScope(organizations, rowOrgCode, targetOrgCode)
    ));
}

function filterResourceRowsByOrgCodes<T extends OrgScopedItem>(
    rows: T[],
    orgCodes: string[],
    organizations: Map<string, ScriptHubOrganizationDefinition>,
) {
    return rows.filter((row) => resourceMatchesAnyOrgCode(row, orgCodes, organizations));
}

function sortOrganizationCodes(
    codes: string[],
    organizations: Map<string, ScriptHubOrganizationDefinition>,
) {
    return [...new Set(codes.map(normalizeRecruitmentOrgCode))].sort((left, right) => {
        const leftOrg = organizations.get(left);
        const rightOrg = organizations.get(right);
        const leftOrder = leftOrg?.sort_order ?? 9999;
        const rightOrder = rightOrg?.sort_order ?? 9999;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return (leftOrg?.path || left).localeCompare(rightOrg?.path || right);
    });
}

function getPollingDelay(
    visible: boolean,
    failureCount: number,
    visibleInterval: number,
    hiddenInterval: number,
    maxInterval: number,
) {
    const baseInterval = visible ? visibleInterval : hiddenInterval;
    return Math.min(baseInterval * (2 ** Math.min(failureCount, 3)), maxInterval);
}

interface RecruitmentAutomationContainerProps {
    onBack: () => void;
    initialPage?: RecruitmentPage;
}

// ---- 岗位内嵌候选人列表：行组件（模块级，稳定引用） ----
const POSITION_CANDIDATE_ROW_HEIGHT = 48;
const POSITION_CANDIDATE_GRID_COLUMNS = "minmax(80px,1.2fr) minmax(120px,1.8fr) minmax(40px,0.5fr) minmax(60px,0.8fr) minmax(40px,0.4fr) minmax(70px,0.8fr) minmax(50px,0.6fr) minmax(50px,0.6fr) minmax(70px,0.9fr)";
const positionCandidateValueClassName = "truncate text-sm font-medium text-slate-700 dark:text-slate-100";
const positionCandidateScalarValueClassName = "text-sm font-medium text-slate-700 dark:text-slate-100";

const PositionCandidateRow = React.memo(function PositionCandidateRow({
    candidate,
    isSelected,
    onSelect,
    onViewResume,
    isZh,
}: {
    candidate: CandidateSummary;
    isSelected: boolean;
    onSelect: (id: number) => void;
    onViewResume: (candidateId: number) => void;
    isZh: boolean;
}) {
    const displayStatus = resolveCandidateDisplayStatus(candidate);
    return (
        <div
            role="button"
            tabIndex={0}
            className={cn(
                "grid w-full items-center gap-6 px-4 text-left transition-colors border-b border-slate-100 dark:border-slate-800/80 cursor-pointer",
                isSelected
                    ? "bg-teal-50/80 dark:bg-teal-900/30"
                    : "hover:bg-slate-50 dark:hover:bg-slate-900/80"
            )}
            style={{ height: POSITION_CANDIDATE_ROW_HEIGHT, gridTemplateColumns: POSITION_CANDIDATE_GRID_COLUMNS }}
            onClick={() => onSelect(candidate.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(candidate.id); }}
        >
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="min-w-0 truncate text-base font-medium text-slate-900 dark:text-slate-100">{candidate.name}</span>
                </TooltipTrigger>
                <TooltipContent side="top"><p>{candidate.name}</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className={positionCandidateValueClassName}>{candidate.phone || candidate.email || "-"}</span>
                </TooltipTrigger>
                <TooltipContent side="top"><p>{candidate.phone || candidate.email || ""}</p></TooltipContent>
            </Tooltip>
            {/* 简历列 */}
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                        onClick={(e) => { e.stopPropagation(); onViewResume(candidate.id); }}
                    >
                        <FileText className="h-4 w-4" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top"><p>{isZh ? "查看简历" : "View Resume"}</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className={positionCandidateValueClassName}>{candidate.city || "-"}</span>
                </TooltipTrigger>
                <TooltipContent side="top"><p>{candidate.city || ""}</p></TooltipContent>
            </Tooltip>
            <span className={positionCandidateScalarValueClassName}>{candidate.age ?? "-"}</span>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className={positionCandidateValueClassName}>{candidate.education || "-"}</span>
                </TooltipTrigger>
                <TooltipContent side="top"><p>{candidate.education || ""}</p></TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className={positionCandidateValueClassName}>{candidate.years_of_experience || "-"}</span>
                </TooltipTrigger>
                <TooltipContent side="top"><p>{candidate.years_of_experience || ""}</p></TooltipContent>
            </Tooltip>
            <span className="text-right text-sm font-semibold text-teal-700 dark:text-teal-200">{formatPercent(candidate.match_percent)}</span>
            <Badge className={cn("rounded-full border shrink-0 text-[14px] w-fit", statusBadgeClass("candidate", displayStatus))}>
                {labelForCandidateStatus(displayStatus)}
            </Badge>
        </div>
    );
}, (prev, next) => {
    return prev.candidate.id === next.candidate.id
        && prev.candidate.status === next.candidate.status
        && prev.candidate.display_status === next.candidate.display_status
        && prev.candidate.name === next.candidate.name
        && prev.candidate.phone === next.candidate.phone
        && prev.candidate.email === next.candidate.email
        && prev.candidate.city === next.candidate.city
        && prev.candidate.age === next.candidate.age
        && prev.candidate.education === next.candidate.education
        && prev.candidate.years_of_experience === next.candidate.years_of_experience
        && prev.candidate.match_percent === next.candidate.match_percent
        && prev.isSelected === next.isSelected
        && prev.isZh === next.isZh;
});

// ---- 岗位内嵌候选人列表：无限滚动哨兵组件 ----
function PositionCandidatesLoadMoreSentinel({ onVisible, label }: { onVisible: () => void; label: string }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                observer.disconnect();
                onVisible();
            }
        }, { rootMargin: "200px" });
        observer.observe(el);
        return () => observer.disconnect();
    }, [onVisible]);
    return (
        <div ref={ref} className="flex items-center justify-center py-3 text-sm text-slate-400">
            {label}
        </div>
    );
}

const PositionCandidateSearchInput = React.memo(function PositionCandidateSearchInput({
    initialValue,
    onChange,
    placeholder,
}: {
    initialValue: string;
    onChange: (v: string) => void;
    placeholder: string;
}) {
    const [localValue, setLocalValue] = React.useState(initialValue);

    React.useEffect(() => {
        setLocalValue(initialValue);
    }, [initialValue]);

    const handleChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalValue(e.target.value);
        onChange(e.target.value);
    }, [onChange]);

    return (
        <div className="relative min-w-0 max-w-[300px] flex-1">
            <Input
                className="h-8 min-w-[120px] rounded-lg text-sm pl-8"
                placeholder={placeholder}
                value={localValue}
                onChange={handleChange}
            />
            <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="11" cy="11" r="8" strokeWidth="2"/>
                <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
            </svg>
        </div>
    );
});

const PositionQuerySearchInput = React.memo(function PositionQuerySearchInput({
    initialValue,
    onChange,
    placeholder,
    inputClassName,
}: {
    initialValue: string;
    onChange: (v: string) => void;
    placeholder: string;
    inputClassName?: string;
}) {
    const [localValue, setLocalValue] = React.useState(initialValue);

    React.useEffect(() => {
        setLocalValue(initialValue);
    }, [initialValue]);

    const handleChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalValue(e.target.value);
        onChange(e.target.value);
    }, [onChange]);

    return (
        <div className="relative">
            <Input
                className={inputClassName}
                placeholder={placeholder}
                value={localValue}
                onChange={handleChange}
            />
            <svg className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="11" cy="11" r="8" strokeWidth="2"/>
                <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
            </svg>
        </div>
    );
});

interface PositionCandidatesViewProps {
    positionDetail: PositionDetail;
    positionCandidatesData: CandidateSummary[];
    positionCandidatesLoading: boolean;
    positionCandidatesInitialLoaded: boolean;
    positionCandidatesTotal: number;
    positionCandidateDetailOpen: boolean;
    positionCandidateStatusFilter: string;
    positionFilteredSortedCandidates: CandidateSummary[];
    onSelectCandidate: (id: number) => void;
    isLoadingMorePositionCandidates: boolean;
    selectedPositionId: number | null;
    selectedCandidateId: number | null;
    candidateDetail: CandidateDetail | null;
    candidateDetailLoading: boolean;
    detailContent: React.ReactNode;
    initialSearchValue: string;
    isZh: boolean;
    recruitmentUiText: { positionCandidatesSearch: string; viewInCandidatePage: string; noCandidates: string; noCandidatesDesc: string };
    candidateStatusLabels: Record<string, string>;
    onSearchChange: (v: string) => void;
    onStatusFilterChange: (v: string) => void;
    onCloseDetail: () => void;
    onViewInCandidatePage: (candidateId: number) => void;
    onViewAllCandidates: () => void;
    onLoadMore: () => void;
    onViewResume: (candidateId: number) => void;
}

const PositionCandidatesView = React.memo(function PositionCandidatesView(props: PositionCandidatesViewProps) {
    const {
        positionDetail,
        positionCandidatesData,
        positionCandidatesLoading,
        positionCandidatesInitialLoaded,
        positionCandidatesTotal,
        positionCandidateDetailOpen,
        positionCandidateStatusFilter,
        positionFilteredSortedCandidates,
        isLoadingMorePositionCandidates,
        selectedPositionId,
        selectedCandidateId,
        detailContent,
        initialSearchValue,
        isZh,
        recruitmentUiText,
        candidateStatusLabels,
        onSearchChange,
        onStatusFilterChange,
        onCloseDetail,
        onSelectCandidate,
        onViewAllCandidates,
        onLoadMore,
        onViewResume,
    } = props;

    const statusOptions = [
        { value: "__all__", label: isZh ? "全部" : "All" },
        ...Object.entries(candidateStatusLabels).map(([k, v]) => ({ value: k, label: v })),
    ];

    return (
        <div className="relative flex h-full min-h-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm dark:border-slate-800 dark:bg-slate-950/85">
        {/* 左侧列表：永远100%宽度 */}
        <div className="flex w-full min-w-0 flex-col">
            {/* 工具栏 */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 px-4 py-2 dark:border-slate-800">
                <PositionCandidateSearchInput
                    initialValue={initialSearchValue}
                    onChange={onSearchChange}
                    placeholder={recruitmentUiText.positionCandidatesSearch}
                />
                <Select value={positionCandidateStatusFilter} onValueChange={onStatusFilterChange}>
                    <SelectTrigger className="h-8 w-fit rounded-lg text-sm">
                        <SelectValue placeholder={isZh ? "筛选状态" : "Filter status"} />
                    </SelectTrigger>
                    <SelectContent>
                        {statusOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className="ml-auto flex items-center gap-2">
                    {positionCandidatesTotal > 0 && (
                        <span className="shrink-0 text-[15px] text-slate-400">
                            {positionCandidateStatusFilter !== "__all__"
                                ? `${positionFilteredSortedCandidates.length}/${positionCandidatesTotal}${isZh ? "人" : " shown"}`
                                : `${positionCandidatesTotal}${isZh ? "人" : " total"}`}
                        </span>
                    )}
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 rounded-lg px-2 text-[14px]"
                        onClick={onViewAllCandidates}
                    >
                        {recruitmentUiText.viewInCandidatePage}
                    </Button>
                </div>
            </div>
            {/* 列头 */}
            <div className="grid items-center gap-6 border-b border-slate-200/80 bg-slate-50/90 px-4 text-[14px] font-semibold uppercase tracking-wider text-slate-600 shadow-[inset_0_-1px_0_rgba(148,163,184,0.12)] dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-slate-100 dark:shadow-[inset_0_-1px_0_rgba(148,163,184,0.18)]" style={{ height: 34, gridTemplateColumns: POSITION_CANDIDATE_GRID_COLUMNS }}>
                <span>{isZh ? "姓名" : "Name"}</span>
                <span>{isZh ? "手机/邮箱" : "Phone/Email"}</span>
                <span>{isZh ? "简历" : "Resume"}</span>
                <span>{isZh ? "所在城市" : "Current City"}</span>
                <span>{isZh ? "年龄" : "Age"}</span>
                <span>{isZh ? "学历" : "Education"}</span>
                <span>{isZh ? "年限" : "Exp"}</span>
                <span className="text-right">{isZh ? "匹配" : "Match"}</span>
                <span>{isZh ? "状态" : "Status"}</span>
            </div>
            {/* 候选人列表 */}
            <div className="min-h-0 flex-1 overflow-y-auto">
            {positionCandidatesLoading || !positionCandidatesInitialLoaded ? (
                <div className="flex items-center justify-center py-12">
                    <LoadingPanel label={isZh ? "加载候选人..." : "Loading candidates..."} />
                </div>
            ) : positionFilteredSortedCandidates.length > 0 ? (
                <>
                    {positionFilteredSortedCandidates.map((c) => (
                        <PositionCandidateRow
                            key={c.id}
                            candidate={c}
                            isSelected={selectedCandidateId === c.id}
                            onSelect={onSelectCandidate}
                            onViewResume={onViewResume}
                            isZh={isZh}
                        />
                    ))}
                    {/* 加载更多指示器 */}
                    {positionCandidatesData.length < positionCandidatesTotal && (
                        <PositionCandidatesLoadMoreSentinel
                            onVisible={onLoadMore}
                            label={isLoadingMorePositionCandidates
                                ? (isZh ? "加载中..." : "Loading...")
                                : (isZh ? "滚动加载更多" : "Scroll to load more")}
                        />
                    )}
                </>
            ) : (
                <div className="flex items-center justify-center py-12">
                    <EmptyState
                        title={positionCandidatesData.length ? (isZh ? "没有匹配的候选人" : "No matching candidates") : recruitmentUiText.noCandidates}
                        description={positionCandidatesData.length ? (isZh ? "尝试调整筛选条件" : "Try adjusting filters") : recruitmentUiText.noCandidatesDesc}
                    />
                </div>
            )}
            </div>
        </div>

        {/* 右侧详情面板：Absolute Overlay */}
        {positionCandidateDetailOpen && (
            <>
                <div
                    className="absolute inset-0 z-10 bg-slate-900/5 backdrop-blur-[1px]"
                    onClick={onCloseDetail}
                />
                <div className="absolute right-0 top-0 bottom-0 z-20 flex w-full flex-col bg-white shadow-2xl ring-1 ring-slate-200 animate-in slide-in-from-right duration-300 dark:bg-slate-950 dark:ring-slate-800 sm:w-[480px] md:w-[560px] lg:w-[50%]">
                    {detailContent}
                </div>
            </>
        )}
        </div>
    );
});

// 简历预览模态窗口组件 - 使用 memo 优化性能
const ResumePreviewModal = React.memo(function ResumePreviewModal({
    previewPdfUrl,
    previewPdfLoading,
    previewCandidateName,
    isZh,
    onClose,
    setPreviewPdfLoading,
}: {
    previewPdfUrl: string;
    previewPdfLoading: boolean;
    previewCandidateName: string;
    isZh: boolean;
    onClose: () => void;
    setPreviewPdfLoading: React.Dispatch<React.SetStateAction<boolean>>;
}) {
    return (
        <div className="fixed inset-0 isolate" style={{ zIndex: 999999 }}>
            {/* 背景遮罩层 - 纯黑色 */}
            <div
                className="absolute inset-0 bg-black/80 animate-in fade-in duration-200"
                onClick={onClose}
            />
            
            {/* 简历预览窗口 */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col w-[90vw] max-w-5xl h-[90vh] bg-white rounded-lg shadow-2xl animate-in zoom-in-95 fade-in duration-200">
                {/* 顶部工具栏 */}
                <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white rounded-t-lg border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-blue-500/20 p-2">
                            <FileText className="h-5 w-5 text-blue-400" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-base font-semibold">
                                {previewCandidateName || (isZh ? "简历预览" : "Resume Preview")}
                            </span>
                            {previewCandidateName && (
                                <span className="text-sm text-slate-400">
                                    {isZh ? "简历预览" : "Resume Preview"}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                            onClick={() => window.open(previewPdfUrl, "_blank")}
                        >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {isZh ? "新窗口打开" : "Open in New Tab"}
                        </Button>
                        <div className="w-px h-6 bg-slate-700 mx-1" />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                            onClick={onClose}
                            title={isZh ? "关闭 (ESC)" : "Close (ESC)"}
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                </div>

                {/* PDF 内容区域 */}
                <div className="relative flex-1 w-full bg-slate-100 rounded-b-lg overflow-hidden">
                    {previewPdfLoading && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-sm">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                            <p className="text-base text-slate-600">
                                {isZh ? "加载中..." : "Loading..."}
                            </p>
                        </div>
                    )}
                    <iframe
                        src={`${previewPdfUrl}#toolbar=0&navpanes=0&view=FitH`}
                        className="h-full w-full border-none"
                        title="Resume Preview"
                        loading="lazy"
                        onLoad={() => {
                            // 使用 startTransition 让加载状态更新不阻塞
                            startTransition(() => {
                                setPreviewPdfLoading(false);
                            });
                        }}
                    />
                </div>
            </div>
        </div>
    );
});

// 人才库搜索组件
function TalentPoolSearch({
    positions,
    onAssignCandidates,
    activeOrgCodes,
    orgCode,
}: {
    positions: PositionSummary[];
    onAssignCandidates: (candidateIds: number[]) => void;
    activeOrgCodes: string[];
    orgCode?: string;
}) {
    const {language} = useI18n();
    const isZh = language === "zh-CN";
    const [searchQuery, setSearchQuery] = useState("");
    const [talentPoolCandidates, setTalentPoolCandidates] = useState<CandidateSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [showDropdown, setShowDropdown] = useState(false);

    // 加载人才库候选人
    const loadTalentPoolCandidates = useCallback(async () => {
        setLoading(true);
        try {
            const query = buildQuery({
                org_code: orgCode || undefined,
            });
            const response = await authenticatedFetch(`/api/recruitment/candidates/talent-pool${query}`);
            const data = await response.json();
            if (data.success && data.data) {
                setTalentPoolCandidates(filterBusinessRowsByOrgCodes(data.data, activeOrgCodes));
            }
        } catch (error) {
            console.error("Failed to load talent pool candidates:", error);
        } finally {
            setLoading(false);
        }
    }, [activeOrgCodes, orgCode]);

    useEffect(() => {
        setTalentPoolCandidates([]);
        setSelectedIds(new Set());
        setShowDropdown(false);
    }, [activeOrgCodes, orgCode]);

    // 搜索过滤
    const filteredCandidates = useMemo(() => {
        if (!searchQuery.trim()) return talentPoolCandidates.slice(0, 20); // 最多显示20个
        const query = searchQuery.toLowerCase();
        return talentPoolCandidates.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.phone?.toLowerCase().includes(query) ||
            c.email?.toLowerCase().includes(query) ||
            c.current_company?.toLowerCase().includes(query) ||
            c.ai_match_position_title?.toLowerCase().includes(query)
        ).slice(0, 20);
    }, [talentPoolCandidates, searchQuery]);

    // 切换选择
    const toggleSelect = useCallback((id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    // 确认选择
    const handleConfirm = useCallback(() => {
        if (selectedIds.size > 0) {
            onAssignCandidates(Array.from(selectedIds));
            setSelectedIds(new Set());
            setShowDropdown(false);
            setSearchQuery("");
        }
    }, [selectedIds, onAssignCandidates]);

    return (
        <div className="relative">
            <div className="flex gap-2">
                <Input
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (!showDropdown) {
                            setShowDropdown(true);
                            if (talentPoolCandidates.length === 0) {
                                loadTalentPoolCandidates();
                            }
                        }
                    }}
                    onFocus={() => {
                        setShowDropdown(true);
                        if (talentPoolCandidates.length === 0) {
                            loadTalentPoolCandidates();
                        }
                    }}
                    placeholder={isZh ? "搜索人才库候选人..." : "Search talent pool candidates..."}
                    className="flex-1"
                />
                {selectedIds.size > 0 && (
                    <Button
                        size="sm"
                        onClick={handleConfirm}
                        className="rounded-xl"
                    >
                        {isZh ? `已选 ${selectedIds.size} 人` : `Selected ${selectedIds.size}`}
                    </Button>
                )}
            </div>

            {/* 下拉列表 */}
            {showDropdown && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950">
                    {loading ? (
                        <div className="flex items-center justify-center p-4">
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400"/>
                            <span className="ml-2 text-base text-slate-500">{isZh ? "加载中..." : "Loading..."}</span>
                        </div>
                    ) : filteredCandidates.length === 0 ? (
                        <div className="p-4 text-center text-base text-slate-500">
                            {isZh ? "人才库暂无候选人" : "No candidates in talent pool"}
                        </div>
                    ) : (
                        filteredCandidates.map(candidate => (
                            <div
                                key={candidate.id}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900",
                                    selectedIds.has(candidate.id) && "bg-sky-50 dark:bg-sky-950/30"
                                )}
                                onClick={() => toggleSelect(candidate.id)}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(candidate.id)}
                                    onChange={() => toggleSelect(candidate.id)}
                                    className="h-4 w-4 rounded border-slate-300"
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-slate-900 dark:text-slate-100">{candidate.name}</span>
                                        {candidate.ai_match_position_title && (
                                            <span className="text-sm text-sky-600 dark:text-sky-400">
                                                <Sparkles className="inline h-3 w-3 mr-0.5"/>
                                                {candidate.ai_match_position_title}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                        {candidate.current_company && <span>{candidate.current_company}</span>}
                                        {candidate.phone && <span>{candidate.phone}</span>}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* 点击外部关闭下拉 */}
            {showDropdown && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowDropdown(false)}
                />
            )}
        </div>
    );
}

export default function RecruitmentAutomationContainer({onBack, initialPage}: RecruitmentAutomationContainerProps) {
    const {language} = useI18n();
    const isZh = language === "zh-CN";
    // Temporary UI toggle: keep the top-right assistant button in code for quick restore later.
    const hideTopRightAssistantEntry = true;
    const sessionUser = useMemo(() => getStoredScriptHubSession()?.user ?? null, []);
    const defaultOrgScope = normalizeRecruitmentOrgCode(sessionUser?.primaryOrgCode);
    const recruitmentToast = useMemo(() => getRecruitmentToastLocale(language), [language]);
    const recruitmentToastEntities = recruitmentToast.entities;
    const jdGenerationInFlightRef = useRef(false);
    const jdAbortControllerRef = useRef<AbortController | null>(null);
    const jdActiveTaskIdRef = useRef<number | null>(null);
    const skillAbortControllerRef = useRef<AbortController | null>(null);
    const skillActiveTaskIdRef = useRef<number | null>(null);
    const screeningLaunchInFlightRef = useRef(false);
    const taskMonitorTimersRef = useRef<Map<number, number>>(new Map());
    const taskMonitorTokensRef = useRef<Map<number, symbol>>(new Map());
    const pendingLogUpdatesRef = useRef<AITaskLog[]>([]);
    const logFlushRafRef = useRef<number | null>(null);
    const pendingCandidateUpdateEventsRef = useRef<TaskSSEEvent[]>([]);
    const candidateUpdateBatchTimerRef = useRef<number | null>(null);
    const requestInflightRef = useRef<Map<string, Promise<unknown>>>(new Map());
    const selectedLogIdRef = useRef<number | null>(null);
    const selectedPositionIdRef = useRef<number | null>(null);
    const selectedCandidateIdRef = useRef<number | null>(null);
    const recentlyCompletedScreeningCandidatesRef = useRef<Map<number, number>>(new Map());
    const logsFiltersInitializedRef = useRef(false);
    const positionsLoadRequestIdRef = useRef(0);
    const candidatesLoadRequestIdRef = useRef(0);
    const positionDetailLoadRequestIdRef = useRef(0);
    const defaultTabSetForPositionRef = useRef<number | null>(null);
    const mountedRef = useRef(true);
    const [candidateListScrollEl, setCandidateListScrollEl] = useState<HTMLDivElement | null>(null);
    const candidateListScrollRef = useCallback((node: HTMLDivElement | null) => {
        setCandidateListScrollEl(node);
    }, []);
    const [candidateListHorizontalRailEl, setCandidateListHorizontalRailEl] = useState<HTMLDivElement | null>(null);
    const candidateListHorizontalRailRef = useCallback((node: HTMLDivElement | null) => {
        setCandidateListHorizontalRailEl(node);
    }, []);
    const [auditListScrollEl, setAuditListScrollEl] = useState<HTMLDivElement | null>(null);
    const auditListScrollRef = useCallback((node: HTMLDivElement | null) => {
        if (!node) {
            setAuditListScrollEl(null);
            return;
        }

        requestAnimationFrame(() => {
            const viewport =
                (node.querySelector("[data-slot='scroll-area-viewport']") as HTMLDivElement | null) ||
                node;
            setAuditListScrollEl(viewport);
        });
    }, []);
    const [auditListHorizontalRailEl, setAuditListHorizontalRailEl] = useState<HTMLDivElement | null>(null);
    const auditListHorizontalRailRef = useCallback((node: HTMLDivElement | null) => setAuditListHorizontalRailEl(node), []);
    const [candidateListViewportWidth, setCandidateListViewportWidth] = useState(0);
    const [auditListViewportWidth, setAuditListViewportWidth] = useState(0);
    const candidateListScrollSyncLockRef = useRef<"table" | "rail" | null>(null);
    const auditListScrollSyncLockRef = useRef<"table" | "rail" | null>(null);
    const candidateListColumnResizeRef = useRef<{
        key: CandidateListColumnKey;
        startX: number;
        startWidth: number;
    } | null>(null);
    // Fine-grained permission checks — each controls specific UI elements
    const perms = sessionUser?.permissions ?? {};
    const canManagePosition = Boolean(perms["recruitment-position-manage"]);
    const canManageCandidate = Boolean(perms["recruitment-candidate-manage"]);
    const canExecuteProcess = Boolean(perms["recruitment-process-execute"]);
    const canViewLog = Boolean(perms["recruitment-log-view"]);
    const canViewSkill = Boolean(perms["recruitment-skill-view"]);
    const canBindSkill = Boolean(perms["recruitment-skill-bind"]);
    const canManageSkill = Boolean(perms["recruitment-skill-manage"]);
    const canViewMail = Boolean(perms["recruitment-mail-view"]);
    const canSendMail = Boolean(perms["recruitment-mail-send"]);
    const canManageMailConfig = Boolean(perms["recruitment-mail-config-manage"] || perms["recruitment-mail-sender-manage"]);
    const canViewLLMConfig = Boolean(perms["recruitment-llm-config-view"]);
    const canManageLLMConfig = Boolean(perms["recruitment-llm-config-manage"]);
    const canManageSharing = Boolean(perms["resource-sharing-manage"]);
    const canManageRBAC = Boolean(perms["rbac-manage"]);
    // Derived: show settings button if any view/manage permission for config pages exists
    const canManageRecruitment = Boolean(
        canViewSkill || canManageSkill
        || canViewMail || canManageMailConfig
        || canViewLLMConfig || canManageLLMConfig
        || canManageSharing || canManageRBAC,
    );
    const recruitmentUiText = useMemo(() => ({
        loadingWorkspace: isZh ? "正在加载招聘工作台..." : "Loading recruiting workspace...",
        back: isZh ? "返回" : "Back",
        refresh: isZh ? "刷新" : "Refresh",
        refreshing: isZh ? "刷新中..." : "Refreshing...",
        uploadResume: isZh ? "上传简历" : "Upload Resume",
        createPosition: isZh ? "新建岗位" : "New Position",
        currentOrganization: isZh ? "当前查看组织" : "Current Organization",
        currentOrgScope: isZh ? "当前组织范围" : "Organization Scope",
        currentDepartment: isZh ? "当前部门范围" : "Department Scope",
        allVisibleDepartments: isZh ? "全部可见部门" : "All Visible Departments",
        organizationField: isZh ? "所属组织/公司" : "Organization / Company",
        targetOrganization: isZh ? "落地组织/公司" : "Target Organization / Company",
        chooseTargetOrganization: isZh ? "请选择落地组织/公司" : "Choose a target organization",
        allVisibleCreateHint: isZh ? "当前范围包含多个可落地组织，请明确选择新岗位归属公司/部门。" : "The current scope contains multiple target organizations. Choose where this position belongs.",
        allVisibleUploadHint: isZh ? "当前范围包含多个可落地组织，未关联岗位时必须选择简历落地公司/部门。" : "The current scope contains multiple target organizations. Choose a target organization when no position is linked.",
        openAssistantDrawer: isZh ? "打开 AI 助手" : "Open AI Assistant",
        manageSettings: isZh ? "管理设置" : "Management Settings",
        settingsSkillsTitle: isZh ? "评估方案管理" : "Assessment Plan Settings",
        settingsSkillsDescription: isZh ? "维护招聘评估和题目生成所用的评估方案。" : "Manage the assessment plans used for screening and interview-question generation.",
        settingsModelsTitle: isZh ? "模型配置" : "Model Settings",
        settingsModelsDescription: isZh ? "按任务类型管理 provider、model、base URL 和 key。" : "Manage provider, model, base URL, and API key by task type.",
        settingsMailTitle: isZh ? "邮件中心" : "Mail Center",
        settingsMailDescription: isZh ? "维护发件箱、收件人和简历邮件发送记录。" : "Manage sender accounts, recipients, and resume delivery records.",
        requiredFieldHint: isZh ? "必填项" : "Required",
        nameLabel: isZh ? "名称" : "Name",
        sortLabel: isZh ? "排序" : "Sort Order",
        descriptionLabel: isZh ? "描述" : "Description",
        tagsLabel: isZh ? "标签" : "Tags",
        contentLabel: isZh ? "内容" : "Content",
        tagsPlaceholder: isZh ? "标签，使用英文逗号分隔" : "Tags, separated by commas",
        saveAndEnableLabel: isZh ? "保存后立即启用" : "Enable immediately after saving",
        saving: isZh ? "保存中..." : "Saving...",
        deleteAction: isZh ? "删除" : "Delete",
        deleting: isZh ? "删除中..." : "Deleting...",
        confirmDelete: isZh ? "确认删除" : "Confirm Delete",
        skillCreateTitle: isZh ? "新增评估方案" : "New Assessment Plan",
        skillEditTitle: isZh ? "编辑评估方案" : "Edit Assessment Plan",
        skillDialogDescription: isZh
            ? "评估方案是管理员配置项，因此入口收在管理设置里，不占用主工作台主路径。"
            : "Assessment plans are managed from admin settings so the main workspace stays focused.",
        saveSkill: isZh ? "保存评估方案" : "Save Assessment Plan",
        skillNameRequired: isZh ? "请输入评估方案名称" : "Please enter an assessment plan name",
        skillNameTooLong: isZh ? "评估方案名称不能超过 120 个字符" : "Assessment plan name cannot exceed 120 characters",
        skillContentRequired: isZh ? "请输入评估方案内容" : "Please enter the assessment plan content",
        skillSortOrderInvalid: isZh ? "排序需为 0 到 9999 之间的整数" : "Sort order must be an integer between 0 and 9999",
        skillDeleteTitle: isZh ? "确认删除评估方案" : "Delete Assessment Plan",
        skillDeleteDescription: isZh
            ? "删除后该规则将不再参与新的招聘流程，但历史对话和任务日志仍会保留这次使用痕迹。"
            : "After deletion, this assessment plan will no longer be used in new recruiting flows, while past conversations and task logs will still keep its history.",
        modelConfigCreateTitle: isZh ? "新增模型配置" : "New Model Configuration",
        modelConfigEditTitle: isZh ? "编辑模型配置" : "Edit Model Configuration",
        modelDialogDescription: isZh
            ? "按任务类型维护 provider、model、API key 和运行时环境变量，支持随时切换供应商。"
            : "Maintain provider, model, API key, and runtime environment variables by task type, and switch providers at any time.",
        configKeyLabel: isZh ? "配置键" : "Config Key",
        taskTypeLabel: isZh ? "任务类型" : "Task Type",
        providerLabel: "Provider",
        modelNameLabel: isZh ? "模型名称" : "Model Name",
        baseUrlLabel: "Base URL",
        apiKeyEnvLabel: isZh ? "API Key 环境变量" : "API Key Environment Variable",
        apiKeyValueLabel: isZh ? "API Key 值" : "API Key Value",
        maxConcurrentLabel: isZh ? "最大并发" : "Max Concurrency",
        maxQpsLabel: isZh ? "每秒请求数" : "Requests Per Second",
        priorityLabel: isZh ? "优先级" : "Priority",
        extraConfigLabel: "Extra Config",
        apiKeyEnvPlaceholder: isZh ? "例如 GEMINI_API_KEY" : "For example: GEMINI_API_KEY",
        apiKeyValuePlaceholder: isZh ? "可选，留空则使用环境变量" : "Optional. Leave empty to use the environment variable.",
        maxConcurrentHint: isZh ? "同一模型配置的并发是全局共享的。填 1 表示所有人共用同一串行队列。" : "Concurrency is shared globally for the same model config. Use 1 to force a single serial queue for everyone.",
        maxQpsHint: isZh ? "同一模型配置的 QPS 也是全局共享。填 0 表示不额外限制。" : "QPS is also shared globally for the same model config. Use 0 to disable the extra cap.",
        modelNameHint: isZh
            ? "这里就是实际调用的大模型标识。如果你要换模型版本，直接编辑这里即可。"
            : "This is the actual model identifier used at runtime. Edit it directly when you want to switch model versions.",
        saveModelConfig: isZh ? "保存配置" : "Save Configuration",
        llmConfigKeyRequired: isZh ? "请输入配置键" : "Please enter a config key",
        llmConfigKeyTooLong: isZh ? "配置键不能超过 120 个字符" : "Config key cannot exceed 120 characters",
        llmConfigKeyDuplicate: (value: string) => (
            isZh ? `配置键"${value}"已存在，请换一个` : `The config key "${value}" already exists. Please use another one.`
        ),
        llmTaskTypeRequired: isZh ? "请输入任务类型" : "Please enter a task type",
        llmTaskTypeTooLong: isZh ? "任务类型不能超过 80 个字符" : "Task type cannot exceed 80 characters",
        llmProviderRequired: isZh ? "请选择 Provider" : "Please choose a provider",
        llmProviderTooLong: isZh ? "Provider 不能超过 80 个字符" : "Provider cannot exceed 80 characters",
        llmModelNameRequired: isZh ? "请输入模型名称" : "Please enter a model name",
        llmModelNameTooLong: isZh ? "模型名称不能超过 120 个字符" : "Model name cannot exceed 120 characters",
        llmMaxConcurrentInvalid: isZh ? "最大并发需为 1 到 100 之间的整数" : "Max concurrency must be an integer between 1 and 100",
        llmMaxQpsInvalid: isZh ? "每秒请求数需为 0 到 1000 之间的整数" : "Requests per second must be an integer between 0 and 1000",
        llmPriorityInvalid: isZh ? "优先级需为 0 到 999 之间的整数" : "Priority must be an integer between 0 and 999",
        llmExtraConfigInvalidJson: isZh ? "Extra Config 必须是合法 JSON" : "Extra Config must be valid JSON",
        llmExtraConfigObjectOnly: isZh ? "Extra Config 必须是 JSON 对象" : "Extra Config must be a JSON object",
        llmDeleteTitle: isZh ? "确认删除模型配置" : "Delete Model Configuration",
        llmDeleteDescription: isZh
            ? "删除后将不再参与任务路由。如果它是当前生效模型，系统会自动回落到其他可用配置。"
            : "After deletion, this config will no longer participate in task routing. If it is currently active, the system will fall back to another available configuration.",
        currentModelSwitched: (taskType: string, modelName: string) => (
            isZh ? `已切换 ${taskType} 的当前模型为 ${modelName}` : `Switched the current model for ${taskType} to ${modelName}`
        ),
        workSections: isZh ? "工作分区" : "Work Areas",
        workspaceTitle: isZh ? "工作台" : "Workspace",
        workspaceDescription: isZh ? "首页指标、待办、快捷操作与近期活动" : "Overview metrics, to-dos, quick actions, and recent activity",
        positionsTitle: isZh ? "岗位管理" : "Positions",
        positionsDescription: isZh ? "岗位列表 + 详情工作区 + JD 版本" : "Position list, detail workspace, and JD versions",
        candidatesTitle: isZh ? "候选人" : "Recruits",
        candidatesDescription: isZh ? "ATS 列表、筛选、状态推进与档案查看" : "ATS list, filtering, status updates, and candidate profiles",
        auditTitle: isZh ? "审计中心" : "Audit Center",
        auditDescription: isZh ? "看 AI 处理记录、模型、错误与留痕" : "Inspect AI task logs, models, errors, and audit traces",
        assistantNavTitle: isZh ? "招聘助手" : "Recruiting Assistant",
        assistantNavDescription: isZh ? "自然语言驱动岗位、候选人和评估方案上下文" : "Natural-language workspace for positions, candidates, and assessment plan context",
        quickAddPosition: isZh ? "新增岗位" : "Add Position",
        preferredInterviewSkillFromMemory: isZh ? "工作记忆中的面试题评估方案" : "Interview assessment plans from workflow memory",
        positionBoundSkills: isZh ? "岗位绑定评估方案" : "Position-bound assessment plans",
        noConfiguredSkills: isZh ? "未配置评估方案" : "No assessment plans configured",
        screeningMemorySkills: isZh ? "初筛工作记忆评估方案" : "Screening assessment plans from workflow memory",
        interviewMemorySkills: isZh ? "面试题工作记忆评估方案" : "Interview assessment plans from workflow memory",
        manualSelectedSkills: isZh ? "手动选择评估方案" : "Manually selected assessment plans",
        unspecifiedCandidate: isZh ? "未指定候选人" : "No candidate selected",
        candidateWithId: (id: number) => (isZh ? `候选人 #${id}` : `Candidate #${id}`),
        modelUnrecognized: isZh ? "暂未识别" : "Unrecognized",
        resendResumeMailTitle: isZh ? "再次发送简历邮件" : "Resend Resume Email",
        sendResumeMailTitle: isZh ? "发送简历邮件" : "Send Resume Email",
        resendResumeMailDescription: (dispatchId: number | null) => (
            isZh
                ? `已基于发送记录 #${dispatchId || "-"} 预填内容。你可以修改收件人、标题和正文后再次发送。`
                : `The form has been prefilled from dispatch #${dispatchId || "-"}. You can edit recipients, subject, and body before sending again.`
        ),
        sendResumeMailDescription: isZh
            ? "支持单个或批量发送给一个或多个收件人。上方可直接填写收件人邮箱，下方可快捷勾选内部收件人。邮件标题和正文都允许留空，留空时由系统按默认模板生成。"
            : "Send one or many resumes to one or more recipients. You can enter email addresses directly or choose internal recipients below. Subject and body may be left blank to use the default template.",
        mailSentMessage: (dispatchId: number, recipientEmails: string[], attachmentCount: number, isResend: boolean) => {
            const title = isResend
                ? (isZh ? "已再次发送简历邮件。" : "Resume email resent.")
                : (isZh ? "已发送简历邮件。" : "Resume email sent.");
            const sep = isZh ? "、" : ", ";
            const dispatchLabel = isZh ? "发送记录" : "Dispatch";
            const recipientsLabel = isZh ? "收件人" : "Recipients";
            const attachmentsLabel = isZh ? "附件" : "Attachments";
            const attachmentText = isZh ? `${attachmentCount} 份简历` : `${attachmentCount} resume(s)`;
            return `${title}\n- ${dispatchLabel}：#${dispatchId}\n- ${recipientsLabel}：${recipientEmails.join(sep)}\n- ${attachmentsLabel}：${attachmentText}`;
        },
        sending: isZh ? "发送中..." : "Sending...",
        resend: isZh ? "再次发送" : "Send Again",
        sendResume: isZh ? "发送简历" : "Send Resume",
        sentCountSummary: (count: number, latestSentAt?: string | null) => (
            latestSentAt
                ? (isZh ? `已发送 ${count} 次 · 最近 ${formatDateTime(latestSentAt)}` : `${count} sent · latest ${formatDateTime(latestSentAt)}`)
                : (isZh ? `已发送 ${count} 次` : `${count} sent`)
        ),
        allPositions: isZh ? "全部岗位" : "All positions",
        specifiedPosition: isZh ? "指定岗位" : "Specific position",
        allStatuses: isZh ? "全部状态" : "All statuses",
        allMatchPercent: isZh ? "全部匹配度" : "All match scores",
        above80: isZh ? "80% 以上" : "80%+",
        above60: isZh ? "60% 以上" : "60%+",
        above40: isZh ? "40% 以上" : "40%+",
        allSources: isZh ? "全部来源" : "All sources",
        allTime: isZh ? "全部时间" : "All time",
        today: isZh ? "今天" : "Today",
        last7Days: isZh ? "近 7 天" : "Last 7 days",
        last30Days: isZh ? "近 30 天" : "Last 30 days",
        noKeyword: isZh ? "无关键词" : "No keyword",
        keywordPrefix: isZh ? "关键词" : "Keyword",
        allTaskTypes: isZh ? "全部任务类型" : "All task types",
        queueJoined: isZh ? "已将初筛任务加入队列" : "Screening task added to the queue",
        screeningStopped: isZh ? "已停止初筛" : "Screening stopped",
        screeningFailed: (error: string) => (isZh ? `初筛失败：${error}` : `Screening failed: ${error}`),
        batchScreening: isZh ? "批量初筛" : "Batch screening",
        screening: isZh ? "初筛" : "Screening",
        createPublishTask: isZh ? "创建发布任务" : "Create Publish Task",
        publishTaskDesc: isZh ? "首期保留 mock / adapter 架构，不把平台发布能力写死在业务主流程里。" : "The first version keeps a mock / adapter architecture so platform publishing is not hard-wired into the core workflow.",
        targetPlatform: isZh ? "目标平台" : "Target Platform",
        executionMode: isZh ? "执行模式" : "Execution Mode",
        bossDirect: isZh ? "BOSS 直聘" : "Boss Zhipin",
        zhilian: isZh ? "智联招聘" : "Zhaopin",
        cancel: isZh ? "取消" : "Cancel",
        createTask: isZh ? "创建任务" : "Create Task",
        allowedAutoMailStatuses: isZh ? "允许自动发送的候选人状态" : "Candidate statuses eligible for auto-send",
        reservedTemplateId: isZh ? "自动发送模板 ID（预留）" : "Auto-send Template ID (reserved)",
        reservedTemplatePlaceholder: isZh ? "为空时使用系统默认模板" : "Use the system default template when left empty",
        dedupMode: isZh ? "重复发送策略" : "Duplicate-send strategy",
        dedupOncePerCandidatePerStatus: isZh ? "同候选人同状态仅一次" : "Once per candidate per status",
        dedupOncePerCandidate: isZh ? "同候选人仅一次" : "Once per candidate",
        autoAdvanceOnScreeningLabel: isZh ? "初筛通过后自动推进候选人状态" : "Auto-advance candidate status after screening",
        autoMailPushTitle: isZh ? "初筛完成后自动推送邮件" : "Auto-send email after screening",
        autoMailPushDescription: isZh ? "启用后仅在候选人状态命中允许列表且解析出有效收件人时触发。岗位专属收件人优先，不受全局开关限制；使用全局收件人时需全局能力也开启。手动发送入口始终保留。" : "Triggers only when candidate status matches allowed list and valid recipient is parsed. Position-specific recipients take priority, unrestricted by global toggle; global recipients require global capability to be enabled. Manual send entry is always available.",
        autoMailEnableToggle: isZh ? "启用自动推送" : "Enable auto-push",
        positionSpecificRecipient: isZh ? "使用岗位专属收件人" : "Use position-specific recipients",
        globalDefaultRecipient: isZh ? "叠加全局默认收件人" : "Stack global default recipients",
        globalDefaultRecipientHint: isZh ? "（需全局能力也开启）" : "(requires global capability to be enabled)",
        noRecipientsInMailCenter: isZh ? "请先在邮件中心维护收件人" : "Maintain recipients in Mail Center first",
        noCCRecipients: isZh ? "暂无可选抄送人" : "No CC recipients available",
        noBCCRecipients: isZh ? "暂无可选密送人" : "No BCC recipients available",
        positionSpecificRecipients: isZh ? "岗位专属收件人" : "Position-specific recipients",
        ccRecipients: isZh ? "抄送人（CC）" : "CC Recipients",
        bccRecipients: isZh ? "密送人（BCC）" : "BCC Recipients",
        autoMailSkillBindingHint: isZh ? "每个岗位可以分别绑定 1 条 JD 分析方案、1 条初筛评估方案、1 条面试题评估方案。若某一类不选择，系统会自动使用该任务的内置通用基座约束。如果没有合适的评估方案，可以点击下方「+」直接新建，创建后会自动绑定到当前岗位。" : "Each position can bind 1 JD analysis plan, 1 screening assessment plan, and 1 interview assessment plan. If none is selected, the system uses the built-in general constraint for that task. If no suitable assessment plan exists, click '+' below to create one, which will be automatically bound to the current position.",
        jdSkillLabel: isZh ? "JD 分析方案" : "JD Analysis Plan",
        screeningSkillLabel: isZh ? "初筛评估方案" : "Screening Assessment Plan",
        interviewSkillLabel: isZh ? "面试题评估方案" : "Interview Assessment Plan",
        noSkillsAvailable: isZh ? "暂无可选评估方案，点击上方「+」新建" : "No available assessment plans, click '+' above to create",
        newSkillTitle: (skillType: string) => (isZh ? `新建 ${skillType} 评估方案` : `New ${skillType} Assessment Plan`),
        positionBasicsDialogHint: isZh ? "岗位基础信息放在弹窗中维护，详情操作回到岗位工作区完成。" : "Maintain position basics in this dialog. For details and operations, go back to the position workspace.",
        cancelButton: isZh ? "取消" : "Cancel",
        savingPosition: isZh ? "保存中..." : "Saving...",
        savePosition: isZh ? "保存岗位" : "Save Position",
        noLinkedPosition: isZh ? "暂不关联岗位" : "Not linked to any position",
        filesSelected: (count: number) => (isZh ? `已选择 ${count} 个文件` : `${count} file(s) selected`),
        cancelUpload: isZh ? "取消上传" : "Cancel Upload",
        loading: isZh ? "加载中..." : "Loading...",
        uploading: isZh ? "上传中..." : "Uploading...",
        startUpload: isZh ? "开始上传" : "Start Upload",
        confirmDeletePosition: isZh ? "确认删除岗位" : "Confirm Delete Position",
        positionDeleteHint: isZh ? "删除后岗位会从工作台隐藏，已关联的候选人与日志仍会保留。请再确认一次。" : "After deletion, the position will be hidden from workspace. Associated candidates and logs will be retained. Please confirm again.",
        deletingPosition: isZh ? "删除中..." : "Deleting...",
        confirmDeletePositionAction: isZh ? "确认删除" : "Confirm Delete",
        confirmDeleteCandidate: isZh ? "确认删除候选人" : "Confirm Delete Candidate",
        candidateDeleteHint: isZh ? "删除后会同步清理该候选人的简历文件、解析结果、初筛评分、面试题、状态流转记录和工作记忆。正在执行中的候选人任务需要先结束后才能删除。" : "Deletion will clean up resume files, parsing results, screening scores, interview questions, status history, and workflow memory. Tasks in progress need to be ended before deletion.",
        saved: isZh ? "已保存" : "Saved",
        savedCandidate: isZh ? "已保存候选人" : "Candidate saved",
        autoAdvanceOnScreeningHint: isZh ? "（需开启岗位初筛配置）" : "(requires position screening config)",
        positionBasics: isZh ? "岗位基础信息" : "Position Basics",
        skillsAutomation: isZh ? "评估方案与自动化配置" : "Assessment Plans & Automation",
        noPublishText: isZh ? "当前还没有可直接发布的 JD 文案，点击\"AI 生成 JD\"后会在这里展示。" : "There is no publish-ready JD copy yet. Click Generate JD and it will appear here.",
        allowRepeatSending: isZh ? "允许重复发送" : "Allow repeat sending",
        // JD dialog fields
        assistantLabel: isZh ? "招聘助手" : "Recruiting Assistant",
        assistantWorkspaceHint: isZh ? "在工作台里快速切上下文、带着推荐问题打开完整助手。" : "Switch context quickly from the workspace and jump into the full assistant with suggested prompts.",
        open: isZh ? "打开" : "Open",
        collapse: isZh ? "收起" : "Collapse",
        more: isZh ? "更多" : "More",
        openFullAssistant: isZh ? "打开完整助手" : "Open Full Assistant",
        assistantContextShort: isZh ? "上下文" : "Context",
        currentPosition: isZh ? "当前岗位" : "Current Position",
        activeSkills: isZh ? "激活评估方案" : "Active Assessment Plans",
        currentModel: isZh ? "当前模型" : "Current Model",
        unspecifiedPosition: isZh ? "未指定岗位" : "No position selected",
        skillCount: (count: number) => (isZh ? `${count} 项` : `${count} selected`),
        noSwitchableModel: isZh ? "暂无可切换模型" : "No switchable model available",
        stopBatchScreeningCompleted: (count: number) => (
            isZh ? `已停止 ${count} 个批量初筛任务` : `Stopped ${count} batch screening task(s)`
        ),
        stopBatchScreeningRequested: isZh ? "批量初筛停止请求已发送" : "Batch screening stop request sent",
        noScreeningTarget: recruitmentToast.noCandidatesSelected,
        noScreeningQueued: recruitmentToast.noScreeningQueued,
        noCandidates: isZh ? "暂无候选人" : "No Candidates",
        noCandidatesDesc: isZh ? "上传简历并关联到这个岗位后，这里会出现最新候选人列表。" : "Upload resumes and link them to this position to see candidates here.",
        loadingMoreCandidates: isZh ? "加载中…" : "Loading more…",
        allCandidatesLoaded: isZh ? "已加载全部候选人" : "All candidates loaded",
        positionCandidates: isZh ? "候选人" : "Candidates",
        viewInCandidatePage: isZh ? "在候选人页中完整查看" : "View in Candidates",
        positionCandidatesSearch: isZh ? "搜索候选人..." : "Search candidates...",
        positionDialogNew: isZh ? "新建岗位" : "New Position",
        positionDialogEdit: isZh ? "编辑岗位" : "Edit Position",
        uploadResumeAutoScreenHint: isZh ? "上传简历后自动进入初筛" : "Auto-enter screening after upload",
        uploadResumeAutoScreenHintNoSkill: isZh ? "请先在下方「初筛评估方案」中绑定至少一个初筛评估方案，再开启此功能" : "Bind at least one screening assessment plan below before enabling this",
        uploadResumeTitle: isZh ? "上传简历" : "Upload Resume",
        uploadResumeDesc: isZh ? "支持批量上传 PDF / DOC / DOCX / TXT。若岗位开启自动初筛，系统会自动进入新的初筛流程；否则可在候选人页手动触发。" : "Supports batch upload of PDF/DOC/DOCX/TXT. If auto-screening is enabled, system will auto-start new screening; otherwise trigger manually from candidates page.",
        // Position form fields
        positionName: isZh ? "岗位名称" : "Position Name",
        department: isZh ? "部门" : "Department",
        location: isZh ? "地点" : "Location",
        employmentType: isZh ? "用工类型" : "Employment Type",
        salaryRange: isZh ? "薪资范围" : "Salary Range",
        headcount: isZh ? "招聘人数" : "Headcount",
        positionStatus: isZh ? "岗位状态" : "Position Status",
        tags: isZh ? "标签" : "Tags",
        keyRequirements: isZh ? "关键要求" : "Key Requirements",
        bonusPoints: isZh ? "加分项" : "Bonus Points",
        screeningConfig: isZh ? "初筛配置" : "Screening Config",
        positionSummary: isZh ? "岗位摘要" : "Position Summary",
        linkPosition: isZh ? "关联岗位" : "Link Position",
        selectFiles: isZh ? "选择文件" : "Select Files",
        city: isZh ? "所在城市" : "City",
        expectedCity: isZh ? "期望城市" : "Expected City",
        manualCityEntry: isZh ? "手动指定" : "Manual",
        autoDetectCity: isZh ? "自动识别" : "Auto Detect",
        cityPlaceholder: isZh ? "输入或选择城市" : "Enter or select city",
        cityAutoHint: isZh ? "系统将从文件名中自动提取城市，未识别到的由AI解析兜底" : "System extracts city from filename; AI parsing as fallback if not detected",
        uploadedProgress: (uploaded: number, total: number) => (isZh ? `已上传 ${uploaded} / ${total} 份` : `Uploaded ${uploaded} / ${total}`),
        currentCandidate: isZh ? "当前候选人" : "Current Candidate",
        candidateDeleteWarning: isZh ? "删除后不可恢复；历史删除审计会保留，但该候选人不会再出现在候选人列表和详情区中。" : "Deletion is irreversible; history will be kept in audit logs, but the candidate will no longer appear in the candidate list or details.",
        // JD dialog fields
        aiGenerationNotes: isZh ? "AI 生成附加要求" : "AI Generation Notes",
        versionTitle: isZh ? "版本标题" : "Version Title",
        versionNotes: isZh ? "版本备注" : "Version Notes",
        jdMarkdownSource: isZh ? "JD Markdown 源文本" : "JD Markdown Source",
        preview: isZh ? "预览版" : "Preview",
        expandMenu: isZh ? "展开左侧菜单" : "Expand left menu",
        collapseMenu: isZh ? "收起左侧菜单" : "Collapse left menu",
        assistantPanelTitle: isZh ? "AI 助手" : "AI Assistant",
        assistantPanelDescription: isZh ? "用于生成 JD、查看岗位候选人、筛选简历和生成面试题的招聘助手对话面板。" : "Assistant panel for generating JDs, viewing candidates, screening resumes, and creating interview questions.",
        resumeUploadDescription: isZh ? '支持批量上传 PDF / DOC / DOCX / TXT。若岗位开启"上传自动初筛"，系统会自动进入新的初筛流程；否则可在候选人页手动触发。' : "Supports batch upload of PDF/DOC/DOCX/TXT. If auto-screening is enabled, system will auto-start new screening; otherwise trigger manually from candidates page.",
        confirmDeleteCandidates: isZh ? "确认批量删除候选人" : "Confirm Batch Delete Candidates",
        batchDeleteDescription: (count: number) => isZh ? `将删除选中的 ${count} 位候选人及其简历文件、解析结果、初筛评分、面试题、状态流转记录和工作记忆。有活动AI任务（解析或初筛中）的候选人将自动跳过。` : `Will delete ${count} selected candidates and their resume files, parsing results, screening scores, interview questions, status history, and workflow memory. Candidates with active AI tasks (parsing or screening) will be skipped automatically.`,
        confirmDeleteResume: isZh ? "确认删除简历" : "Confirm Delete Resume",
        resumeDeleteDescription: isZh ? "删除后会同步清理这份简历对应的解析结果和初筛评分；如果该候选人还有其他简历，系统会自动切换到下一份可用简历。正在解析或初筛中的简历暂时不能删除。" : "Deletion will clean up parsing results and screening scores for this resume; if the candidate has other resumes, the system will automatically switch to the next available one. Resumes being parsed or screened cannot be deleted.",
        currentResume: isZh ? "当前简历" : "Current Resume",
        resumeDeleteWarning: isZh ? "删除后不可恢复，请确认当前候选人不再需要这份原始文件。" : "Deletion is irreversible. Please confirm the current candidate no longer needs this original file.",
        confirmDeleteMailSender: isZh ? "确认删除发件箱" : "Confirm Delete Mail Sender",
        mailSenderDeleteDescription: isZh ? "删除后它将无法继续发送简历邮件；已有发送记录会继续保留。" : "After deletion, it will no longer be able to send resume emails; existing send records will be retained.",
        confirmDeleteMailRecipient: isZh ? "确认删除收件人" : "Confirm Delete Mail Recipient",
        mailRecipientDeleteDescription: isZh ? "删除后发送简历时将不再出现在可选名单里，历史发送记录不会受影响。" : "After deletion, it will no longer appear in the recipient list when sending resumes; historical send records will not be affected.",
        publishing: isZh ? "发布中..." : "Publishing...",
        editMailSender: isZh ? "编辑发件箱" : "Edit Mail Sender",
        newMailSender: isZh ? "新增发件箱" : "New Mail Sender",
        mailSenderDescription: isZh ? "支持配置 163、Outlook、企业邮箱等 SMTP 发件箱。编辑已有发件箱时，密码可留空以继续使用当前密码。" : "Supports configuring SMTP senders like 163, Outlook, corporate email, etc. When editing an existing sender, password can be left empty to keep the current one.",
        mailSenderName: isZh ? "名称" : "Name",
        mailSenderFromName: isZh ? "发件人名称" : "Sender Name",
        mailSenderFromNamePlaceholder: isZh ? "例如：某某科技招聘中心" : "e.g., HR Center of Company",
        mailSenderEmail: isZh ? "发件邮箱" : "Sender Email",
        mailSenderEmailPlaceholder: isZh ? "name@example.com" : "name@example.com",
        mailSenderUsername: isZh ? "登录账号" : "Login Username",
        smtpHost: isZh ? "SMTP Host" : "SMTP Host",
        smtpHostPlaceholder: isZh ? "smtp.163.com" : "smtp.163.com",
        smtpPort: isZh ? "SMTP Port" : "SMTP Port",
        smtpHostAutoHint: isZh ? "如果 SMTP Host 留空，系统会尝试根据发件邮箱自动识别 163 / Outlook 默认配置。" : "If SMTP Host is left empty, the system will try to auto-detect 163/Outlook default settings based on the sender email.",
        mailSenderPassword: isZh ? "密码" : "Password",
        mailSenderPasswordEdit: isZh ? "密码（留空则不修改）" : "Password (leave empty to keep current)",
        useSSL: isZh ? "使用 SSL" : "Use SSL",
        useSTARTTLS: isZh ? "使用 STARTTLS" : "Use STARTTLS",
        setAsDefaultSender: isZh ? "设为默认发件箱" : "Set as default sender",
        enableSender: isZh ? "启用此发件箱" : "Enable this sender",
        editMailRecipient: isZh ? "编辑收件人" : "Edit Recipient",
        newMailRecipient: isZh ? "新增收件人" : "New Recipient",
        mailRecipientDescription: isZh ? "可维护公司招聘团队、面试官、部门负责人等收件人，发送简历时支持多选和复用。" : "Maintain recipients like HR team, interviewers, department heads, etc. Supports multi-select and reuse when sending resumes.",
        recipientName: isZh ? "姓名" : "Name",
        recipientEmail: isZh ? "邮箱" : "Email",
        recipientDepartment: isZh ? "部门" : "Department",
        recipientRoleTitle: isZh ? "岗位" : "Role Title",
        recipientTags: isZh ? "标签" : "Tags",
        recipientTagsPlaceholder: isZh ? "例如：招聘同事，技术面试官，业务负责人" : "e.g., HR colleague, tech interviewer, business lead",
        recipientNotes: isZh ? "备注" : "Notes",
        enableRecipient: isZh ? "启用此收件人" : "Enable this recipient",
        candidatesInThisSend: isZh ? "本次发送的候选人" : "Candidates in this send",
        resumeNoLinkedPosition: isZh ? "未关联岗位" : "Not linked to position",
        alreadySent: isZh ? "已发送" : "Sent",
        firstSend: isZh ? "首次发送" : "First send",
        saveMailSender: isZh ? "保存发件箱" : "Save Mail Sender",
        saveMailRecipient: isZh ? "保存收件人" : "Save Recipient",
        candidatesInThisSendLabel: isZh ? "本次发送的候选人" : "Candidates in this send",
        noSendHistory: isZh ? "当前候选人还没有成功发送记录。" : "This candidate has no successful send history yet.",
        noCandidateDetails: isZh ? "未找到候选人详情，请返回候选人中心重新选择。" : "Candidate details not found. Please go back to candidates center and select again.",
        senderConfig: isZh ? "发件箱" : "Sender",
        useDefaultSender: isZh ? "使用默认发件箱" : "Use default sender",
        recipientEmailsOptional: isZh ? "收件人邮箱（可选）" : "Recipient emails (optional)",
        recipientEmailsPlaceholder: isZh ? "可直接填写一个或多个收件人邮箱，多个请用英文逗号分隔" : "Enter one or more recipient emails, separated by commas",
        selectInternalRecipients: isZh ? "选择内部收件人" : "Select internal recipients",
        noDepartmentSet: isZh ? "未设置部门" : "No department set",
        noRoleSet: isZh ? "未设置岗位" : "No role set",
        noRecipientsAvailable: isZh ? "暂无可选收件人" : "No recipients available",
        noRecipientsAvailableDesc: isZh ? "可以直接填写上方收件人邮箱，也可以先在邮件中心维护公司内部收件人。" : "You can directly fill in recipient emails above, or maintain internal recipients in Mail Center first.",
        emailSubjectOptional: isZh ? "邮件标题（可留空）" : "Email subject (optional)",
        emailSubjectPlaceholder: isZh ? "例如：候选人简历推荐 / IoT 测试工程师" : "e.g., Candidate Resume Referral / IoT Test Engineer",
        emailBodyOptional: isZh ? "邮件正文（可留空）" : "Email body (optional)",
        emailBodyPlaceholder: isZh ? "可填写本次推荐理由、安排建议等；留空时将使用系统默认正文。" : "Fill in referral reasons, scheduling suggestions, etc.; leave empty to use default body.",
    }), [isZh, recruitmentToast]);
    const localizeCandidateStatusValue = useCallback((value?: string | null, fallback?: string | null) => {
        const normalized = String(value || "").trim();
        if (!normalized) {
            return fallback || "";
        }
        return candidateStatusLabels[normalized] || fallback || normalized;
    }, []);

    const [activePage, setActivePage] = useState<RecruitmentPage>(initialPage || "workspace");
    const activePageRef = useRef<RecruitmentPage>(initialPage || "workspace");
    const recruitmentPageHistoryRef = useRef<RecruitmentPage[]>([initialPage || "workspace"]);
    const lastInitialPageRef = useRef<RecruitmentPage | null>(null);

    const applyRecruitmentPageChange = useCallback((
        page: RecruitmentPage,
        mode: "push" | "replace" = "push",
    ) => {
        setActivePage((current) => {
            const baseHistory = recruitmentPageHistoryRef.current.length
                ? recruitmentPageHistoryRef.current
                : [current];
            let nextHistory = baseHistory;

            if (mode === "replace") {
                nextHistory = [...baseHistory.slice(0, -1), page];
                if (!nextHistory.length) {
                    nextHistory = [page];
                } else if (nextHistory.length > 1 && nextHistory[nextHistory.length - 1] === nextHistory[nextHistory.length - 2]) {
                    nextHistory = nextHistory.slice(0, -1);
                }
            } else if (baseHistory[baseHistory.length - 1] !== page) {
                nextHistory = [...baseHistory, page];
            }

            recruitmentPageHistoryRef.current = nextHistory;
            return current === page ? current : page;
        });
    }, []);

    const handleSmartBack = useCallback(() => {
        const history = recruitmentPageHistoryRef.current;
        if (history.length > 1) {
            const nextHistory = history.slice(0, -1);
            const previousPage = nextHistory[nextHistory.length - 1];
            recruitmentPageHistoryRef.current = nextHistory;
            setActivePage(previousPage);
            return;
        }
        onBack();
    }, [onBack]);

    // 从侧边栏切换时同步 initialPage prop，并将其作为模块内导航的一部分纳入历史栈。
    useEffect(() => {
        const targetPage = initialPage || "workspace";
        if (lastInitialPageRef.current === null) {
            lastInitialPageRef.current = targetPage;
            recruitmentPageHistoryRef.current = [targetPage];
            if (activePage !== targetPage) {
                setActivePage(targetPage);
            }
            return;
        }
        if (lastInitialPageRef.current === targetPage) {
            return;
        }
        lastInitialPageRef.current = targetPage;
        if (activePage !== targetPage) {
            applyRecruitmentPageChange(targetPage, "push");
        }
    }, [activePage, applyRecruitmentPageChange, initialPage]);

    useEffect(() => {
        syncRecruitmentActivePage(activePage);
    }, [activePage]);

    const [assistantOpen, setAssistantOpen] = useState(false);
    const [positionListCollapsed, setPositionListCollapsed] = useState(false);
    const [positionWorkspaceView, setPositionWorkspaceView] = useState<"jd" | "config" | "candidates">("candidates");
    const [positionSecondaryPanelOpen, setPositionSecondaryPanelOpen] = useState(false);
    // 岗位内嵌候选人列表状态
    const [positionCandidateSearch, setPositionCandidateSearch] = useState("");
    const [positionCandidateStatusFilter, setPositionCandidateStatusFilter] = useState<string>("__all__");
    const [positionCandidateDetailOpen, setPositionCandidateDetailOpen] = useState(false);
    const [talentPoolCandidateDetailOpen, setTalentPoolCandidateDetailOpen] = useState(false);

    const [positionCandidatesData, setPositionCandidatesData] = useState<CandidateSummary[]>([]);
    const [positionCandidatesLoading, setPositionCandidatesLoading] = useState(false);
    const [positionCandidatesInitialLoaded, setPositionCandidatesInitialLoaded] = useState(false);
    const [positionCandidatesTotal, setPositionCandidatesTotal] = useState(0);
    const [isLoadingMorePositionCandidates, setIsLoadingMorePositionCandidates] = useState(false);
    const loadingMorePositionCandidatesRef = useRef(false);
    const positionCandidatesLoadRequestIdRef = useRef(0);
    const [auditFiltersCollapsed, setAuditFiltersCollapsed] = useState(true);
    const [bootstrapping, setBootstrapping] = useState(true);
    const [pageVisible, setPageVisible] = useState(() => (
        typeof document === "undefined" ? true : document.visibilityState === "visible"
    ));
    const pageVisibleRef = useRef(pageVisible);

    const [metadata, setMetadata] = useState<RecruitmentMetadata | null>(null);
    const [organizationCatalog, setOrganizationCatalog] = useState<ScriptHubOrganizationDefinition[]>([]);
    const [allPositions, setAllPositions] = useState<PositionSummary[]>([]);
    const [positions, setPositions] = useState<PositionSummary[]>([]);
    const [positionDetail, setPositionDetail] = useState<PositionDetail | null>(null);
    const [allCandidates, setAllCandidates] = useState<CandidateSummary[]>([]);
    const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
    const [candidateDetail, setCandidateDetail] = useState<CandidateDetail | null>(null);
    const [allTalentPoolCandidates, setAllTalentPoolCandidates] = useState<CandidateSummary[]>([]);
    const [talentPoolCandidates, setTalentPoolCandidates] = useState<CandidateSummary[]>([]);
    const [talentPoolLoading, setTalentPoolLoading] = useState(false);
    const [allSkills, setAllSkills] = useState<RecruitmentSkill[]>([]);
    const [skills, setSkills] = useState<RecruitmentSkill[]>([]);
    const [allAiLogs, setAllAiLogs] = useState<AITaskLog[]>([]);
    const [aiLogs, setAiLogs] = useState<AITaskLog[]>([]);
    const [funnelData, setFunnelData] = useState<import("@/lib/recruitment-api").RecruitmentFunnelData | null>(null);
    const [sourceStatsData, setSourceStatsData] = useState<import("@/lib/recruitment-api").SourceStatsData | null>(null);
    const [candidateTotal, setCandidateTotal] = useState(0);
    const [aiLogTotal, setAiLogTotal] = useState(0);
    const allCandidatesRef = useRef<CandidateSummary[]>(allCandidates);
    const allTalentPoolCandidatesRef = useRef<CandidateSummary[]>(allTalentPoolCandidates);
    const candidateTotalRef = useRef(candidateTotal);
    const candidateListUsingVisibleFiltersRef = useRef(false);
    const candidateListContextKeyRef = useRef("");
    const candidateListLoadAbortControllerRef = useRef<AbortController | null>(null);
    const candidateListLoadMoreAbortControllerRef = useRef<AbortController | null>(null);
    const skillsLoadedOnceRef = useRef(false);
    const mailSettingsLoadedOnceRef = useRef(false);
    const llmConfigsLoadedOnceRef = useRef(false);
    allCandidatesRef.current = allCandidates;
    allTalentPoolCandidatesRef.current = allTalentPoolCandidates;
    candidateTotalRef.current = candidateTotal;
    const [selectedLogDetail, setSelectedLogDetail] = useState<AITaskLog | null>(null);
    const [chatContext, setChatContext] = useState<ChatContext>({
        position_id: null,
        position_title: null,
        skill_ids: [],
        skills: [],
    });
    const [allLlmConfigs, setAllLlmConfigs] = useState<RecruitmentLLMConfig[]>([]);
    const [llmConfigs, setLlmConfigs] = useState<RecruitmentLLMConfig[]>([]);
    const [allMailSenderConfigs, setAllMailSenderConfigs] = useState<RecruitmentMailSenderConfig[]>([]);
    const [mailSenderConfigs, setMailSenderConfigs] = useState<RecruitmentMailSenderConfig[]>([]);
    const [allMailRecipients, setAllMailRecipients] = useState<RecruitmentMailRecipient[]>([]);
    const [mailRecipients, setMailRecipients] = useState<RecruitmentMailRecipient[]>([]);
    const [allResumeMailDispatches, setAllResumeMailDispatches] = useState<RecruitmentResumeMailDispatch[]>([]);
    const [resumeMailDispatches, setResumeMailDispatches] = useState<RecruitmentResumeMailDispatch[]>([]);
    const [mailAutoPushGlobalConfig, setMailAutoPushGlobalConfig] = useState<RecruitmentMailAutoPushGlobalConfig>({
        global_default_recipient_ids: [],
        global_default_recipient_emails: [],
        global_auto_push_enabled: false,
    });
    const [authorizedOrgCodes, setAuthorizedOrgCodes] = useState<string[]>([defaultOrgScope]);
    const [hasAllOrgScope, setHasAllOrgScope] = useState(false);
    const [selectedOrgScope, setSelectedOrgScope] = useState(defaultOrgScope);
    const [selectedDepartmentScope, setSelectedDepartmentScope] = useState(ALL_COMPANY_DEPARTMENTS_VALUE);
    const [organizationCatalogLoading, setOrganizationCatalogLoading] = useState(false);

    const [positionQuery, setPositionQuery] = useState("");
    const [positionStatusFilter, setPositionStatusFilter] = useState("all");
    const deferredPositionQuery = useDeferredValue(positionQuery);

    const [candidateQuery, setCandidateQuery] = useState("");
    const [candidateStatusFilter, setCandidateStatusFilter] = useState<string[]>([]);
    const [candidatePositionFilter, setCandidatePositionFilter] = useState<string[]>([]);
    const [candidateSourceFilter, setCandidateSourceFilter] = useState<string[]>([]);
    const [candidateTimeFilter, setCandidateTimeFilter] = useState("all");
    const [candidateMatchFilter, setCandidateMatchFilter] = useState("all");
    const [candidateMatchSortOrder, setCandidateMatchSortOrder] = useState<"" | "asc" | "desc">("");
    const [candidateMatchSortLoading, setCandidateMatchSortLoading] = useState(false);
    const candidateMatchSortOrderRef = useRef<"" | "asc" | "desc">("");
    const candidateMatchSortRequestTokenRef = useRef(0);
    const [candidateViewMode, setCandidateViewMode] = useState<CandidateViewMode>("list");
    const [candidateListColumnWidths, setCandidateListColumnWidths] = useState<Record<CandidateListColumnKey, number>>(
        candidateListColumnDefaultWidths,
    );
    const deferredCandidateQuery = useDeferredValue(candidateQuery);

    const [logTaskTypeFilter, setLogTaskTypeFilter] = useState("all");
    const [logStatusFilter, setLogStatusFilter] = useState("all");
    const auditLogRequestKey = `${logStatusFilter}::${logTaskTypeFilter}`;
    const auditLogRequestKeyRef = useRef(auditLogRequestKey);

    const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null);
    const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
    const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>([]);
    const [selectedLogId, setSelectedLogId] = useState<number | null>(null);

    const [positionsLoading, setPositionsLoading] = useState(false);
    const [positionDetailLoading, setPositionDetailLoading] = useState(false);
    const [candidatesLoading, setCandidatesLoading] = useState(false);
    const [candidatesInitialLoaded, setCandidatesInitialLoaded] = useState(false);
    const [isLoadingMoreCandidates, setIsLoadingMoreCandidates] = useState(false);
    const [candidateDetailLoading, setCandidateDetailLoading] = useState(false);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
    const [previewCandidateName, setPreviewCandidateName] = useState<string>("");
    const previewPdfAbortRef = useRef<AbortController | null>(null);
    const [duplicateCandidates, setDuplicateCandidates] = useState<Array<{id: number; candidate_code: string; name: string; phone: string | null; email: string | null; status: string}>>([]);
    const checkedDuplicateCandidateIdRef = useRef<number | null>(null);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logDetailLoading, setLogDetailLoading] = useState(false);
    const [skillsLoading, setSkillsLoading] = useState(false);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [mailSettingsLoading, setMailSettingsLoading] = useState(false);
    const [mailAutoPushConfigSaving, setMailAutoPushConfigSaving] = useState(false);
    const [orgSwitching, setOrgSwitching] = useState(false);
    const [skillSubmitting, setSkillSubmitting] = useState(false);
    const [llmSubmitting, setLlmSubmitting] = useState(false);
    const [resumeMailSubmitting, setResumeMailSubmitting] = useState(false);
    const [mailDispatchActionKey, setMailDispatchActionKey] = useState<string | null>(null);
    const [chatSending, setChatSending] = useState(false);
    const [cancellingTaskIds, setCancellingTaskIds] = useState<number[]>([]);
    const [activeJDTaskId, setActiveJDTaskId] = useState<number | null>(null);
    const [activeJDPositionId, setActiveJDPositionId] = useState<number | null>(null);
    const [activeScreeningTaskMap, setActiveScreeningTaskMap] = useState<Record<number, number>>({});
    const [activeBatchScreeningTaskIds, setActiveBatchScreeningTaskIds] = useState<number[]>([]);
    const [activeInterviewTaskId, setActiveInterviewTaskId] = useState<number | null>(null);
    const [activeInterviewCandidateId, setActiveInterviewCandidateId] = useState<number | null>(null);
    const [activeChatTaskId, setActiveChatTaskId] = useState<number | null>(null);
    const [activeChatMessageId, setActiveChatMessageId] = useState<string | null>(null);
    const [currentAssistantRunId, setCurrentAssistantRunId] = useState<string | null>(null);
    const [assistantStreamStopping, setAssistantStreamStopping] = useState(false);
    const [assistantContextExpanded, setAssistantContextExpanded] = useState(false);
    const [assistantQuickActionsExpanded, setAssistantQuickActionsExpanded] = useState(false);
    const [autoFollowStream, setAutoFollowStream] = useState(true);
    const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
    const [assistantMailActionState, setAssistantMailActionState] = useState<Record<string, {
        status: "idle" | "sending" | "sent" | "error";
        editing?: boolean;
        error?: string | null;
        dispatchId?: number | null;
    }>>({});

    const [positionDialogOpen, setPositionDialogOpen] = useState(false);
    const [positionDialogMode, setPositionDialogMode] = useState<"create" | "edit">("create");
    const [positionForm, setPositionForm] = useState<PositionFormState>(emptyPositionForm);
    const [positionFormErrors, setPositionFormErrors] = useState<PositionFormErrors>({});
    const [positionFormSubmitError, setPositionFormSubmitError] = useState<string | null>(null);
    const [positionSubmitting, setPositionSubmitting] = useState(false);

    const [resumeUploadOpen, setResumeUploadOpen] = useState(false);
    const [uploadingResume, setUploadingResume] = useState(false);
    const [resumeUploadFileList, setResumeUploadFileList] = useState<FileList | null>(null);
    const [resumeUploadMode, setResumeUploadMode] = useState<"position" | "none" | "smart">("smart");
    const [resumeUploadPositionId, setResumeUploadPositionId] = useState("all");
    const [resumeUploadOrgCode, setResumeUploadOrgCode] = useState(defaultOrgScope);
    const [resumeUploadCity, setResumeUploadCity] = useState("");
    const [resumeUploadCitySource, setResumeUploadCitySource] = useState<"manual" | "auto">("auto");
    const [resumeUploadSource, setResumeUploadSource] = useState<"manual" | "boss" | "liepin" | "headhunter" | "other">("manual");
    const [resumeUploadDuplicateStrategy, setResumeUploadDuplicateStrategy] = useState<"skip" | "overwrite" | "prompt">("skip");
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadCompletedCount, setUploadCompletedCount] = useState(0);
    const [resumeUploadError, setResumeUploadError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const [publishDialogOpen, setPublishDialogOpen] = useState(false);
    const [publishPlatform, setPublishPlatform] = useState("boss");
    const [publishMode, setPublishMode] = useState("mock");
    const [publishSubmitting, setPublishSubmitting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [candidateSaving, setCandidateSaving] = useState(false);

    const [jdExtraPrompt, setJdExtraPrompt] = useState("");
    const [jdViewMode, setJdViewMode] = useState<JDViewMode>("publish");
    const [jdGenerationStatus, setJdGenerationStatus] = useState<string>("idle");
    const [jdGenerationError, setJdGenerationError] = useState("");
    const [jdStreamingContent, setJdStreamingContent] = useState("");
    const [jdVersionSaving, setJdVersionSaving] = useState(false);
    const [jdVersionActivating, setJdVersionActivating] = useState(false);
    const [screeningSubmitting, setScreeningSubmitting] = useState(false);
    const [interviewGenerating, setInterviewGenerating] = useState(false);
    const [positionDeleting, setPositionDeleting] = useState(false);
    const [positionDeleteConfirmOpen, setPositionDeleteConfirmOpen] = useState(false);
    const [candidateDeleteTarget, setCandidateDeleteTarget] = useState<CandidateSummary | null>(null);
    const [candidateDeleting, setCandidateDeleting] = useState(false);
    const [candidateDeleteError, setCandidateDeleteError] = useState<string | null>(null);
    const [batchDeleteTargetIds, setBatchDeleteTargetIds] = useState<number[] | null>(null);
    const [batchDeleting, setBatchDeleting] = useState(false);
    const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null);
    const [resumeDeleteTarget, setResumeDeleteTarget] = useState<ResumeFile | null>(null);
    const [resumeDeleting, setResumeDeleting] = useState(false);
    const [skillDeleteTarget, setSkillDeleteTarget] = useState<RecruitmentSkill | null>(null);
    const [llmDeleteTarget, setLlmDeleteTarget] = useState<RecruitmentLLMConfig | null>(null);
    const [mailSenderDeleteTarget, setMailSenderDeleteTarget] = useState<RecruitmentMailSenderConfig | null>(null);
    const [mailRecipientDeleteTarget, setMailRecipientDeleteTarget] = useState<RecruitmentMailRecipient | null>(null);
    const [deleteActionKey, setDeleteActionKey] = useState<string | null>(null);
    const [jdDraft, setJdDraft] = useState({
        title: "",
        jdMarkdown: "",
        notes: "",
        autoActivate: true,
    });

    const assistantIntroText = isZh
        ? "我是招聘助手。你可以直接让我生成 JD、查看岗位候选人、重新初筛某位候选人并追加硬性条件，或者说明这次对话实际使用了哪些评估方案。"
        : "I'm your recruiting assistant. I can generate a JD, inspect candidates for the current position, re-screen a candidate with stricter requirements, or explain which assessment plans were used in this conversation.";
    const localizedInitialInterviewRoundName = isZh ? "初试" : "Round 1";

    const [candidateEditor, setCandidateEditor] = useState<CandidateEditorState>(emptyCandidateEditor);
    const [statusUpdateReason, setStatusUpdateReason] = useState("");
    const [pendingStatus, setPendingStatus] = useState<string | null>(null); // ← 新增
    const [interviewRoundName, setInterviewRoundName] = useState(localizedInitialInterviewRoundName);
    const [interviewCustomRequirements, setInterviewCustomRequirements] = useState("");
    const [selectedInterviewSkillIds, setSelectedInterviewSkillIds] = useState<number[]>([]);
    const [interviewSchedules, setInterviewSchedules] = useState<InterviewSchedule[]>([]);
    const [followUps, setFollowUps] = useState<FollowUp[]>([]);
    const [offers, setOffers] = useState<RecruitmentOffer[]>([]);

    const [chatInput, setChatInput] = useState("");
    const [assistantDisplayMode, setAssistantDisplayMode] = useState<AssistantDisplayMode>("drawer");
    const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
        {
            id: "intro",
            role: "assistant",
            content: assistantIntroText,
            createdAt: new Date().toISOString(),
        },
    ]);

    useEffect(() => {
        setInterviewRoundName((current) => (
            current === "初试" || current === "Round 1" || !current
                ? localizedInitialInterviewRoundName
                : current
        ));
    }, [localizedInitialInterviewRoundName]);

    useEffect(() => {
        setChatMessages((current) => (
            current.length === 1 && current[0]?.id === "intro"
                ? [{...current[0], content: assistantIntroText}]
                : current
        ));
    }, [assistantIntroText]);

    const assistantScrollAnchorRef = useRef<HTMLDivElement | null>(null);
    const assistantScrollAreaRef = useRef<HTMLDivElement | null>(null);
    const assistantInputRef = useRef<HTMLTextAreaElement | null>(null);
    const assistantStreamAbortRef = useRef<AbortController | null>(null);
    const chatContextRef = useRef(chatContext);
    const positionTitleInputRef = useRef<HTMLInputElement | null>(null);
    const positionHeadcountInputRef = useRef<HTMLInputElement | null>(null);
    const skillNameInputRef = useRef<HTMLInputElement | null>(null);
    const skillContentInputRef = useRef<HTMLTextAreaElement | null>(null);
    const llmConfigKeyInputRef = useRef<HTMLInputElement | null>(null);
    const llmTaskTypeInputRef = useRef<HTMLInputElement | null>(null);
    const llmModelNameInputRef = useRef<HTMLInputElement | null>(null);
    const llmExtraConfigInputRef = useRef<HTMLTextAreaElement | null>(null);

    const [skillDialogOpen, setSkillDialogOpen] = useState(false);
    const [skillEditingId, setSkillEditingId] = useState<number | null>(null);
    const [skillForm, setSkillForm] = useState<SkillFormState>(emptySkillForm);
    const [skillFormErrors, setSkillFormErrors] = useState<SkillFormErrors>({});
    const [skillFormSubmitError, setSkillFormSubmitError] = useState<string | null>(null);
    const [skillEditorData, setSkillEditorData] = useState<ScreeningSkillFormData>(emptyScreeningSkillForm());
    const [skillDialogMode, setSkillDialogMode] = useState<"structured" | "basic">("structured");
    const [skillEditorDefaultTab, setSkillEditorDefaultTab] = useState<"structured" | "advanced" | "ai">("structured");
    const [skillEditorPositionId, setSkillEditorPositionId] = useState<number | null>(null);
    const [skillGenerating, setSkillGenerating] = useState(false);
    const [skillAutoBindCategory, setSkillAutoBindCategory] = useState<"jdSkillIds" | "screeningSkillIds" | "interviewSkillIds" | null>(null);
    const [skillBoundPositionId, setSkillBoundPositionId] = useState<string>("");
    const [skillExtraConditions, setSkillExtraConditions] = useState("");
    const [positionSkillSearch, setPositionSkillSearch] = useState("");
    const [positionSkillSectionExpanded, setPositionSkillSectionExpanded] = useState<PositionSkillSectionExpandedState>(DEFAULT_POSITION_SKILL_SECTION_EXPANDED_STATE);

    const [llmDialogOpen, setLlmDialogOpen] = useState(false);
    const [llmEditingId, setLlmEditingId] = useState<number | null>(null);
    const [llmForm, setLlmForm] = useState<LLMFormState>(emptyLLMForm);
    const [llmFormErrors, setLlmFormErrors] = useState<LLMFormErrors>({});
    const [llmFormSubmitError, setLlmFormSubmitError] = useState<string | null>(null);
    const [mailSenderDialogOpen, setMailSenderDialogOpen] = useState(false);
    const [mailSenderEditingId, setMailSenderEditingId] = useState<number | null>(null);
    const [mailSenderForm, setMailSenderForm] = useState<MailSenderFormState>(emptyMailSenderForm);
    const [mailRecipientDialogOpen, setMailRecipientDialogOpen] = useState(false);
    const [mailRecipientEditingId, setMailRecipientEditingId] = useState<number | null>(null);
    const [mailRecipientForm, setMailRecipientForm] = useState<MailRecipientFormState>(emptyMailRecipientForm);
    const [mailSenderSaving, setMailSenderSaving] = useState(false);
    const [mailRecipientSaving, setMailRecipientSaving] = useState(false);
    const [resumeMailDialogOpen, setResumeMailDialogOpen] = useState(false);
    const [resumeMailDialogMode, setResumeMailDialogMode] = useState<ResumeMailDialogMode>("send");
    const [resumeMailSourceDispatchId, setResumeMailSourceDispatchId] = useState<number | null>(null);
    const [resumeMailSourceAssistantMessageId, setResumeMailSourceAssistantMessageId] = useState<string | null>(null);
    const [resumeMailForm, setResumeMailForm] = useState<ResumeMailFormState>(emptyResumeMailForm);
    const [resumeMailError, setResumeMailError] = useState<string | null>(null);
    const [interviewSkillSelectionDirty, setInterviewSkillSelectionDirty] = useState(false);
    const [candidateProcessLogsExpanded, setCandidateProcessLogsExpanded] = useState(false);

    const organizationMap = useMemo(
        () => new Map(organizationCatalog.map((organization) => [organization.org_code, organization])),
        [organizationCatalog],
    );
    const visibleOrgCodes = useMemo(() => (
        sortOrganizationCodes(authorizedOrgCodes.length ? authorizedOrgCodes : [defaultOrgScope], organizationMap)
    ), [authorizedOrgCodes, defaultOrgScope, organizationMap]);
    const orgScopeOptions = useMemo<OrganizationSelectOption[]>(() => {
        const companyCodes = new Set<string>();

        if (hasAllOrgScope) {
            organizationCatalog
                .filter((organization) => (
                    organization.is_active !== false
                    && isCompanyLikeOrganization(organization)
                ))
                .forEach((organization) => companyCodes.add(organization.org_code));
        }

        visibleOrgCodes.forEach((orgCode) => {
            const organization = organizationMap.get(orgCode);
            if (hasAllOrgScope && organization && !isCompanyLikeOrganization(organization)) {
                return;
            }
            companyCodes.add(findCompanyScopeCodeForOrg(orgCode, organizationMap));
        });

        if (!companyCodes.size) {
            companyCodes.add(findCompanyScopeCodeForOrg(defaultOrgScope, organizationMap));
        }

        return sortOrganizationCodes([...companyCodes], organizationMap).map((orgCode) => {
            const organization = organizationMap.get(orgCode);
            return {
                value: orgCode,
                label: organization?.name || getFallbackOrganizationLabel(orgCode),
                description: organization ? getOrganizationPathLabel(orgCode, organizationMap) : undefined,
                organization,
            };
        });
    }, [defaultOrgScope, hasAllOrgScope, organizationCatalog, organizationMap, visibleOrgCodes]);
    const selectedCompanyOrgCodes = useMemo(() => {
        const selectedCompanyCode = normalizeRecruitmentOrgCode(selectedOrgScope);
        const scopedCodes = visibleOrgCodes.filter((orgCode) => (
            orgCode === selectedCompanyCode || isOrganizationInScope(organizationMap, selectedCompanyCode, orgCode)
        ));
        return scopedCodes.length ? scopedCodes : [selectedCompanyCode];
    }, [organizationMap, selectedOrgScope, visibleOrgCodes]);
    const departmentScopeOptions = useMemo<OrganizationSelectOption[]>(() => {
        const departmentCodes = selectedCompanyOrgCodes.filter((orgCode) => isDepartmentOrganization(organizationMap.get(orgCode)));
        const selectedCompanyIsVisible = selectedCompanyOrgCodes.some((orgCode) => orgCode === normalizeRecruitmentOrgCode(selectedOrgScope));
        const options: OrganizationSelectOption[] = [];
        if (departmentCodes.length && (selectedCompanyIsVisible || departmentCodes.length > 1)) {
            options.push({
                value: ALL_COMPANY_DEPARTMENTS_VALUE,
                label: recruitmentUiText.allVisibleDepartments,
            });
        }
        departmentCodes.forEach((orgCode) => {
            const organization = organizationMap.get(orgCode);
            options.push({
                value: orgCode,
                label: getOrganizationRelativePathLabel(orgCode, selectedOrgScope, organizationMap),
                description: organization ? getOrganizationPathLabel(orgCode, organizationMap) : undefined,
                organization,
            });
        });
        return options;
    }, [organizationMap, recruitmentUiText.allVisibleDepartments, selectedCompanyOrgCodes, selectedOrgScope]);
    const activeBusinessOrgCodes = useMemo(() => {
        if (
            selectedDepartmentScope !== ALL_COMPANY_DEPARTMENTS_VALUE
            && selectedCompanyOrgCodes.includes(normalizeRecruitmentOrgCode(selectedDepartmentScope))
        ) {
            const selectedDepartmentCode = normalizeRecruitmentOrgCode(selectedDepartmentScope);
            const scopedDepartmentCodes = selectedCompanyOrgCodes.filter((orgCode) => (
                orgCode === selectedDepartmentCode || isOrganizationInScope(organizationMap, selectedDepartmentCode, orgCode)
            ));
            return scopedDepartmentCodes.length ? scopedDepartmentCodes : [selectedDepartmentCode];
        }
        return selectedCompanyOrgCodes;
    }, [organizationMap, selectedCompanyOrgCodes, selectedDepartmentScope]);
    const organizationSelectOptions = useMemo(
        () => activeBusinessOrgCodes.map((orgCode) => {
            const organization = organizationMap.get(orgCode);
            return {
                value: orgCode,
                label: getOrganizationPathLabel(orgCode, organizationMap),
                organization,
            };
        }),
        [activeBusinessOrgCodes, organizationMap],
    );
    const showOrganizationFields = organizationSelectOptions.length > 1;
    const showOrganizationColumn = orgScopeOptions.length > 1 || organizationSelectOptions.length > 1;
    const getOrganizationLabel = useCallback((orgCode?: string | null) => (
        getOrganizationPathLabel(normalizeRecruitmentOrgCode(orgCode), organizationMap)
    ), [organizationMap]);
    const defaultFormOrgCode = useMemo(() => (
        organizationSelectOptions[0]?.value || activeBusinessOrgCodes[0] || defaultOrgScope
    ), [activeBusinessOrgCodes, defaultOrgScope, organizationSelectOptions]);
    const activeCreateOrgCode = useMemo(() => (
        showOrganizationFields ? defaultFormOrgCode : (activeBusinessOrgCodes[0] || defaultFormOrgCode)
    ), [activeBusinessOrgCodes, defaultFormOrgCode, showOrganizationFields]);
    const currentResumeUploadDefaultOrgCode = useMemo(() => {
        const selectedDepartmentCode = normalizeRecruitmentOrgCode(selectedDepartmentScope);
        if (
            selectedDepartmentCode
            && selectedDepartmentCode !== ALL_COMPANY_DEPARTMENTS_VALUE
            && organizationSelectOptions.some((option) => option.value === selectedDepartmentCode)
        ) {
            return selectedDepartmentCode;
        }
        const selectedCompanyCode = normalizeRecruitmentOrgCode(selectedOrgScope);
        if (organizationSelectOptions.some((option) => option.value === selectedCompanyCode)) {
            return selectedCompanyCode;
        }
        return activeCreateOrgCode;
    }, [activeCreateOrgCode, organizationSelectOptions, selectedDepartmentScope, selectedOrgScope]);
    const positionMap = useMemo(() => new Map(positions.map((item) => [item.id, item])), [positions]);
    const candidateMap = useMemo(() => new Map(candidates.map((item) => [item.id, item])), [candidates]);
    const skillMap = useMemo(() => new Map(skills.map((item) => [item.id, item])), [skills]);
    const enabledSkills = useMemo(() => skills.filter((skill) => skill.is_enabled !== false), [skills]);
    const enabledSkillMap = useMemo(() => new Map(enabledSkills.map((item) => [item.id, item])), [enabledSkills]);
    const normalizedPositionSkillSearch = positionSkillSearch.trim().toLowerCase();
    const activePositionSkillBindingId = positionDialogMode === "edit" ? selectedPositionId : null;
    const positionSkillFieldConfig = useMemo(() => ({
        jdSkillIds: {
            taskKind: "jd" as const,
            label: recruitmentUiText.jdSkillLabel,
            emptyLabel: isZh ? "未选择" : "Not selected",
            selectedPrefix: isZh ? "已选：" : "Selected: ",
            placeholder: isZh ? "搜索可用于当前岗位的 JD 方案" : "Search JD plans for this position",
        },
        screeningSkillIds: {
            taskKind: "screening" as const,
            label: recruitmentUiText.screeningSkillLabel,
            emptyLabel: isZh ? "未选择" : "Not selected",
            selectedPrefix: isZh ? "已选：" : "Selected: ",
            placeholder: isZh ? "搜索可用于当前岗位的初筛方案" : "Search screening plans for this position",
        },
        interviewSkillIds: {
            taskKind: "interview" as const,
            label: recruitmentUiText.interviewSkillLabel,
            emptyLabel: isZh ? "未选择" : "Not selected",
            selectedPrefix: isZh ? "已选：" : "Selected: ",
            placeholder: isZh ? "搜索可用于当前岗位的面试题方案" : "Search interview plans for this position",
        },
    }), [isZh, recruitmentUiText.interviewSkillLabel, recruitmentUiText.jdSkillLabel, recruitmentUiText.screeningSkillLabel]);
    const filterBindableSkillsForPosition = useCallback((taskKind: SkillTaskKind) => (
        enabledSkills.filter((skill) => {
            const matchesTask = !skill.task_types?.length || skill.task_types.includes(taskKind);
            const matchesPosition = !skill.bound_position_id || skill.bound_position_id === activePositionSkillBindingId;
            const searchHaystack = [
                skill.name,
                skill.description,
                skill.bound_position_title,
                ...(skill.tags || []),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            const matchesSearch = !normalizedPositionSkillSearch || searchHaystack.includes(normalizedPositionSkillSearch);
            return matchesTask && matchesPosition && matchesSearch;
        })
    ), [activePositionSkillBindingId, enabledSkills, normalizedPositionSkillSearch]);
    const jdAuthoringSkills = useMemo(() => sortSkillsForTaskPreference(filterBindableSkillsForPosition("jd"), "jd"), [filterBindableSkillsForPosition]);
    const screeningAuthoringSkills = useMemo(() => sortSkillsForTaskPreference(filterBindableSkillsForPosition("screening"), "screening"), [filterBindableSkillsForPosition]);
    const interviewAuthoringSkills = useMemo(() => sortSkillsForTaskPreference(filterBindableSkillsForPosition("interview"), "interview"), [filterBindableSkillsForPosition]);
    const positionSkillChoicesByField = useMemo<Record<PositionSkillBindingField, RecruitmentSkill[]>>(() => ({
        jdSkillIds: jdAuthoringSkills,
        screeningSkillIds: screeningAuthoringSkills,
        interviewSkillIds: interviewAuthoringSkills,
    }), [interviewAuthoringSkills, jdAuthoringSkills, screeningAuthoringSkills]);
    const selectedPositionSkillText = useMemo<Record<PositionSkillBindingField, string>>(() => {
        const formatSelected = (ids: number[], emptyLabel: string) => (
            ids.length ? formatSkillNames(ids.slice(0, 1), skillMap, language) : emptyLabel
        );
        return {
            jdSkillIds: formatSelected(positionForm.jdSkillIds, positionSkillFieldConfig.jdSkillIds.emptyLabel),
            screeningSkillIds: formatSelected(positionForm.screeningSkillIds, positionSkillFieldConfig.screeningSkillIds.emptyLabel),
            interviewSkillIds: formatSelected(positionForm.interviewSkillIds, positionSkillFieldConfig.interviewSkillIds.emptyLabel),
        };
    }, [
        language,
        positionForm.interviewSkillIds,
        positionForm.jdSkillIds,
        positionForm.screeningSkillIds,
        positionSkillFieldConfig.interviewSkillIds.emptyLabel,
        positionSkillFieldConfig.jdSkillIds.emptyLabel,
        positionSkillFieldConfig.screeningSkillIds.emptyLabel,
        skillMap,
    ]);
    const skillDialogBindingTaskKind = skillDialogMode === "structured" ? "screening" : (skillForm.taskTypes[0] || null);
    const bindablePositionsForSkillDialog = useMemo(() => {
        if (!skillDialogBindingTaskKind) {
            return positions;
        }
        const currentBoundPositionId = skillBoundPositionId ? Number(skillBoundPositionId) : null;
        return positions.filter((position) => {
            if ((currentBoundPositionId && position.id === currentBoundPositionId) || (skillEditingId && (
                (skillDialogBindingTaskKind === "jd" && (position.jd_skill_ids || []).includes(skillEditingId))
                || (skillDialogBindingTaskKind === "screening" && (position.screening_skill_ids || []).includes(skillEditingId))
                || (skillDialogBindingTaskKind === "interview" && (position.interview_skill_ids || []).includes(skillEditingId))
            ))) {
                return true;
            }
            const occupiedSkillIds = skillDialogBindingTaskKind === "jd"
                ? (position.jd_skill_ids || [])
                : skillDialogBindingTaskKind === "screening"
                    ? (position.screening_skill_ids || [])
                    : (position.interview_skill_ids || []);
            return occupiedSkillIds.length === 0;
        });
    }, [positions, skillBoundPositionId, skillDialogBindingTaskKind, skillEditingId]);
    const mailSenderMap = useMemo(() => new Map(mailSenderConfigs.map((item) => [item.id, item])), [mailSenderConfigs]);
    const mailRecipientMap = useMemo(() => new Map(mailRecipients.map((item) => [item.id, item])), [mailRecipients]);
    const currentJDVersion = positionDetail?.current_jd_version || null;
    const isJDDraftDirty = jdDraft.jdMarkdown.trim() !== (currentJDVersion?.jd_markdown || "").trim();
    const currentPublishText = useMemo(
        () => (isJDDraftDirty
            ? extractPublishText(jdDraft.jdMarkdown, null)
            : extractPublishText(currentJDVersion?.jd_markdown || jdDraft.jdMarkdown, currentJDVersion?.publish_text)),
        [currentJDVersion?.jd_markdown, currentJDVersion?.publish_text, isJDDraftDirty, jdDraft.jdMarkdown],
    );
    const currentPreviewHtml = isJDDraftDirty
        ? jdDraft.jdMarkdown.replace(/\n/g, "<br />")
        : currentJDVersion?.jd_html || jdDraft.jdMarkdown.replace(/\n/g, "<br />");
    const currentJDGenerationStatus = jdGenerationStatus !== "idle"
        ? jdGenerationStatus
        : positionDetail?.jd_generation?.status || "idle";
    const isJDGenerating = isLiveTaskStatus(currentJDGenerationStatus) || currentJDGenerationStatus === "syncing";
    const latestJDGenerationError = jdGenerationError || positionDetail?.jd_generation?.error_message || "";
    const defaultMailSenderId = useMemo(() => {
        const defaultSender = mailSenderConfigs.find((item) => item.is_default && item.is_enabled);
        return String(defaultSender?.id || mailSenderConfigs.find((item) => item.is_enabled)?.id || "");
    }, [mailSenderConfigs]);
    const effectiveLLMConfigs = useMemo(() => {
        const byTask = new Map<string, RecruitmentLLMConfig>();
        llmConfigs.filter((item) => item.is_active).forEach((item) => {
            const current = byTask.get(item.task_type);
            if (!current || item.priority < current.priority || (item.priority === current.priority && item.id < current.id)) {
                byTask.set(item.task_type, item);
            }
        });
        return byTask;
    }, [llmConfigs]);
    const preferredLLMConfigIds = useMemo(() => {
        const selected = new Set<number>();
        effectiveLLMConfigs.forEach((item) => selected.add(item.id));
        return selected;
    }, [effectiveLLMConfigs]);
    const assistantActiveLLMConfig = useMemo(() => {
        return effectiveLLMConfigs.get("chat_orchestrator") || effectiveLLMConfigs.get("default") || null;
    }, [effectiveLLMConfigs]);
    const interviewActiveLLMConfig = useMemo(() => {
        return effectiveLLMConfigs.get("interview_question_generation") || effectiveLLMConfigs.get("default") || null;
    }, [effectiveLLMConfigs]);
    const assistantModelSwitchOptions = useMemo(() => {
        const preferredTaskType = llmConfigs.some((item) => item.task_type === "chat_orchestrator")
            ? "chat_orchestrator"
            : "default";
        return llmConfigs
            .filter((item) => item.is_active && item.task_type === preferredTaskType)
            .sort((left, right) => {
                if (left.priority !== right.priority) return left.priority - right.priority;
                return left.id - right.id;
            });
    }, [llmConfigs]);
    const chatContextCandidateLabel = useMemo(() => {
        if (!chatContext.candidate_id) {
            return recruitmentUiText.unspecifiedCandidate;
        }
        return candidateMap.get(chatContext.candidate_id)?.name || recruitmentUiText.candidateWithId(chatContext.candidate_id);
    }, [candidateMap, chatContext.candidate_id, recruitmentUiText]);
    const assistantModelLabel = assistantActiveLLMConfig
        ? `${labelForProvider(assistantActiveLLMConfig.resolved_provider || assistantActiveLLMConfig.provider)} / ${assistantActiveLLMConfig.resolved_model_name || assistantActiveLLMConfig.model_name}`
        : recruitmentUiText.modelUnrecognized;
    const buildOptimisticChatContext = useCallback((
        nextPositionId: number | null,
        nextSkillIds: number[],
        nextCandidateId: number | null,
        currentContext: ChatContext,
    ): ChatContext => ({
        ...currentContext,
        position_id: nextPositionId,
        position_title: nextPositionId ? (positionMap.get(nextPositionId)?.title || currentContext.position_title || null) : null,
        candidate_id: nextCandidateId,
        skill_ids: nextSkillIds,
        skills: nextSkillIds
            .map((skillId) => enabledSkillMap.get(skillId))
            .filter(Boolean) as RecruitmentSkill[],
        updated_at: new Date().toISOString(),
    }), [enabledSkillMap, positionMap]);
    const assistantContextSkillIds = useMemo(
        () => chatContext.skill_ids.filter((skillId) => enabledSkillMap.has(skillId)),
        [chatContext.skill_ids, enabledSkillMap],
    );
    const assistantContextSkills = useMemo(
        () => assistantContextSkillIds
            .map((skillId) => enabledSkillMap.get(skillId))
            .filter(Boolean) as RecruitmentSkill[],
        [assistantContextSkillIds, enabledSkillMap],
    );
    const positionScreeningSkillIds = useMemo(
        () => candidateDetail?.candidate.position_screening_skill_ids || [],
        [candidateDetail?.candidate.position_screening_skill_ids],
    );
    const positionInterviewSkillIds = useMemo(
        () => candidateDetail?.candidate.position_interview_skill_ids || [],
        [candidateDetail?.candidate.position_interview_skill_ids],
    );
    const workflowScreeningSkillIds = useMemo(
        () => candidateDetail?.workflow_memory?.screening_skill_ids || [],
        [candidateDetail?.workflow_memory?.screening_skill_ids],
    );
    const workflowInterviewSkillIds = useMemo(
        () => candidateDetail?.workflow_memory?.interview_skill_ids || [],
        [candidateDetail?.workflow_memory?.interview_skill_ids],
    );
    const candidateAssistantActivity = useMemo(() => {
        return (candidateDetail?.activity || []).filter((item) => item.task_type === "chat_orchestrator");
    }, [candidateDetail?.activity]);
    const candidateProcessActivity = useMemo(() => {
        return (candidateDetail?.activity || []).filter((item) => item.task_type !== "chat_orchestrator");
    }, [candidateDetail?.activity]);
    const preferredInterviewSkillSourceLabel = workflowInterviewSkillIds.length
        ? recruitmentUiText.preferredInterviewSkillFromMemory
        : (positionInterviewSkillIds.length
                ? recruitmentUiText.positionBoundSkills
                : recruitmentUiText.noConfiguredSkills);
    const effectiveScreeningSkillIds = useMemo(() => {
        if (positionScreeningSkillIds.length) {
            return resolveTaskSkillIds(positionScreeningSkillIds, "screening", skillMap);
        }
        if (workflowScreeningSkillIds.length) {
            return resolveTaskSkillIds(workflowScreeningSkillIds, "screening", skillMap);
        }
        return [];
    }, [positionScreeningSkillIds, skillMap, workflowScreeningSkillIds]);
    const effectiveScreeningSkillSourceLabel = positionScreeningSkillIds.length
        ? recruitmentUiText.positionBoundSkills
        : (workflowScreeningSkillIds.length ? recruitmentUiText.screeningMemorySkills : recruitmentUiText.noConfiguredSkills);
    const autoInterviewSkillIds = useMemo(() => {
        if (positionInterviewSkillIds.length) {
            return resolveTaskSkillIds(positionInterviewSkillIds, "interview", skillMap);
        }
        if (workflowInterviewSkillIds.length) {
            return resolveTaskSkillIds(workflowInterviewSkillIds, "interview", skillMap);
        }
        return [];
    }, [positionInterviewSkillIds, skillMap, workflowInterviewSkillIds]);
    const autoInterviewSkillSourceLabel = positionInterviewSkillIds.length
        ? recruitmentUiText.positionBoundSkills
        : workflowInterviewSkillIds.length
            ? recruitmentUiText.interviewMemorySkills
            : recruitmentUiText.noConfiguredSkills;
    const effectiveInterviewSkillIds = interviewSkillSelectionDirty ? selectedInterviewSkillIds : autoInterviewSkillIds;
    const effectiveInterviewSkillSourceLabel = interviewSkillSelectionDirty ? recruitmentUiText.manualSelectedSkills : autoInterviewSkillSourceLabel;
    useEffect(() => {
        if (assistantContextSkillIds.length === chatContext.skill_ids.length) {
            return;
        }
        void saveChatContext(
            chatContext.position_id || null,
            assistantContextSkillIds,
            chatContext.candidate_id || null,
            {quiet: true},
        );
    }, [assistantContextSkillIds, chatContext.candidate_id, chatContext.position_id, chatContext.skill_ids.length]);
    const selectedCandidateScreeningTaskId = selectedCandidateId
        ? (
            activeScreeningTaskMap[selectedCandidateId]
            || candidateMap.get(selectedCandidateId)?.active_screening_task_id
            || (candidateDetail?.candidate.id === selectedCandidateId ? candidateDetail?.candidate.active_screening_task_id : null)
            || null
        )
        : null;
    const currentCandidateInterviewTaskId = activeInterviewCandidateId === selectedCandidateId ? activeInterviewTaskId : null;
    const isTaskCancelling = useCallback((taskId?: number | null) => {
        if (!taskId) {
            return false;
        }
        return cancellingTaskIds.includes(taskId);
    }, [cancellingTaskIds]);
    const isSelectedCandidateScreeningCancelling = isTaskCancelling(selectedCandidateScreeningTaskId);
    const isCurrentInterviewTaskCancelling = isTaskCancelling(currentCandidateInterviewTaskId);
    const isCurrentChatTaskCancelling = isTaskCancelling(activeChatTaskId);
    const isStreaming = chatSending;
    const canStopCurrentRun = Boolean(activeChatTaskId || currentAssistantRunId || assistantStreamAbortRef.current);
    const isCurrentRunStopping = isCurrentChatTaskCancelling || assistantStreamStopping;
    const showScrollToBottomButton = isUserScrolledUp && chatMessages.length > 0;
    const resumeMailTargetCandidates = useMemo(() => {
        return resumeMailForm.candidateIds
            .map((candidateId) => (
                candidateMap.get(candidateId)
                || (candidateDetail?.candidate.id === candidateId ? candidateDetail.candidate : null)
            ))
            .filter((item): item is CandidateSummary => Boolean(item));
    }, [candidateDetail, candidateMap, resumeMailForm.candidateIds]);
    const candidateResumeMailStats = useMemo(() => {
        const stats = new Map<number, { sentCount: number; failedCount: number; latestSentAt: string | null }>();
        resumeMailDispatches.forEach((dispatch) => {
            dispatch.candidate_ids.forEach((candidateId) => {
                const current = stats.get(candidateId) || {sentCount: 0, failedCount: 0, latestSentAt: null};
                if (dispatch.status === "sent") {
                    current.sentCount += 1;
                    const candidateSentAt = dispatch.sent_at || dispatch.created_at || null;
                    if (!current.latestSentAt || (candidateSentAt && new Date(candidateSentAt).getTime() > new Date(current.latestSentAt).getTime())) {
                        current.latestSentAt = candidateSentAt;
                    }
                }
                if (dispatch.status === "failed") {
                    current.failedCount += 1;
                }
                stats.set(candidateId, current);
            });
        });
        return stats;
    }, [resumeMailDispatches]);
    const resumeMailDialogTitle = resumeMailDialogMode === "resend" ? recruitmentUiText.resendResumeMailTitle : recruitmentUiText.sendResumeMailTitle;
    const resumeMailDialogDescription = resumeMailDialogMode === "resend"
        ? recruitmentUiText.resendResumeMailDescription(resumeMailSourceDispatchId)
        : recruitmentUiText.sendResumeMailDescription;
    const resumeMailSubmitLabel = resumeMailSubmitting
        ? recruitmentUiText.sending
        : (resumeMailDialogMode === "resend" ? recruitmentUiText.resend : recruitmentUiText.sendResume);

    const getCandidateResumeMailSummary = useCallback((candidateId: number): string | null => {
        const stat = candidateResumeMailStats.get(candidateId);
        if (!stat || stat.sentCount <= 0) {
            return null;
        }
        return recruitmentUiText.sentCountSummary(stat.sentCount, stat.latestSentAt);
    }, [candidateResumeMailStats, recruitmentUiText]);

    const isCandidatePageActive = activePage === "candidates";

    const sourceOptions = useMemo(() => {
        return Array.from(
            new Set(
                candidates
                    .map((candidate) => candidate.source)
                    .filter((item): item is string => Boolean(item)),
            ),
        );
    }, [candidates]);

    const visiblePositions = useMemo(() => {
        const normalizedQuery = deferredPositionQuery.trim().toLowerCase();
        return positions.filter((position) => {
            if (positionStatusFilter !== "all" && position.status !== positionStatusFilter) {
                return false;
            }
            if (!normalizedQuery) {
                return true;
            }
            return [
                position.title,
                position.department,
                position.location,
                position.summary,
            ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
        });
    }, [deferredPositionQuery, positionStatusFilter, positions]);

    const visibleCandidates = useMemo(() => {
        const useServerDrivenPrimaryFilters = isCandidatePageActive;
        const normalizedQuery = useServerDrivenPrimaryFilters ? "" : deferredCandidateQuery.trim().toLowerCase();
        return candidates.filter((candidate) => {
            if (
                !useServerDrivenPrimaryFilters
                && candidatePositionFilter.length > 0
                && !candidatePositionFilter.includes(String(candidate.position_id || ""))
            ) {
                return false;
            }
            if (
                !useServerDrivenPrimaryFilters
                && candidateStatusFilter.length > 0
                && !candidateStatusFilter.includes(resolveCandidateDisplayStatus(candidate))
            ) {
                return false;
            }
            if (normalizedQuery && ![
                candidate.name,
                candidate.phone,
                candidate.email,
                candidate.current_company,
            ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery))) {
                return false;
            }
            if (candidateSourceFilter.length > 0 && !candidateSourceFilter.includes(candidate.source || "未知来源")) {
                return false;
            }
            if (candidateTimeFilter === "today" && !isToday(candidate.created_at)) {
                return false;
            }
            if (candidateTimeFilter === "7d" && !withinDays(candidate.created_at, 7)) {
                return false;
            }
            if (candidateTimeFilter === "30d" && !withinDays(candidate.created_at, 30)) {
                return false;
            }
            const match = candidate.match_percent ?? 0;
            if (candidateMatchFilter === "80+" && match < 80) {
                return false;
            }
            if (candidateMatchFilter === "60+" && match < 60) {
                return false;
            }
            if (candidateMatchFilter === "40+" && match < 40) {
                return false;
            }
            return true;
        });
    }, [candidateMatchFilter, candidatePositionFilter, candidateSourceFilter, candidateStatusFilter, candidateTimeFilter, candidates, deferredCandidateQuery, isCandidatePageActive]);

    function getLiveScreeningTaskId(candidate?: CandidateSummary | null) {
        const taskId = Number(candidate?.active_screening_task_id || 0);
        if (!taskId) {
            return null;
        }
        const taskStatus = candidate?.active_screening_task_status || candidate?.active_screening_status;
        return isLiveTaskStatus(taskStatus) ? taskId : null;
    }

    const visibleLiveScreeningTaskIds = useMemo(() => {
        const taskIds = new Set<number>();
        visibleCandidates.forEach((candidate) => {
            const taskId = getLiveScreeningTaskId(candidate);
            if (taskId) {
                taskIds.add(taskId);
            }
        });
        return Array.from(taskIds);
    }, [visibleCandidates]);

    const batchStopScreeningTaskIds = useMemo(() => (
        Array.from(new Set([...activeBatchScreeningTaskIds, ...visibleLiveScreeningTaskIds]))
    ), [activeBatchScreeningTaskIds, visibleLiveScreeningTaskIds]);

    const isBatchScreeningRunning = batchStopScreeningTaskIds.length > 0;
    const isBatchScreeningCancelling = batchStopScreeningTaskIds.length > 0
        && batchStopScreeningTaskIds.every((taskId) => cancellingTaskIds.includes(taskId));

    const visibleCandidateIdSet = useMemo(
        () => new Set(visibleCandidates.map((c) => c.id)),
        [visibleCandidates]
    );

    const visibleAiLogs = useMemo(() => {
        return aiLogs.filter((log) => {
            if (logTaskTypeFilter !== "all" && log.task_type !== logTaskTypeFilter) {
                return false;
            }
            if (logStatusFilter !== "all" && log.status !== logStatusFilter) {
                return false;
            }
            return true;
        });
    }, [aiLogs, logStatusFilter, logTaskTypeFilter]);

    const groupedCandidates = useMemo(() => {
        const order = metadata?.candidate_statuses?.map((item) => item.value) || Object.keys(candidateStatusLabels);
        return order.map((status) => ({
            status,
            label: labelForCandidateStatus(status),
            items: visibleCandidates.filter((candidate) => candidate.status === status),
        }));
    }, [language, metadata, visibleCandidates]);

    const candidateListDisplayColumnWidths = useMemo(() => (
        expandTableColumnWidths(
            candidateListColumnWidths,
            candidateListViewportWidth,
            56,
            candidateListColumnFillWeights,
        )
    ), [candidateListColumnWidths, candidateListViewportWidth]);

    const auditListDisplayColumnWidths = useMemo(() => (
        expandTableColumnWidths(
            auditListColumnBaseWidths,
            auditListViewportWidth,
            0,
            auditListColumnFillWeights,
        )
    ), [auditListViewportWidth]);

    const auditListTableWidth = useMemo(() => {
        return Object.values(auditListDisplayColumnWidths).reduce((sum, width) => sum + width, 0);
    }, [auditListDisplayColumnWidths]);

    // 使用优化的统计计算 hook (单次遍历完成所有统计)
    const stats = useOptimizedStats(positions, candidates, aiLogs);

    // 兼容原有接口
    const scopedDashboard: DashboardData = useMemo(() => ({
        cards: stats.cards,
        status_distribution: stats.status_distribution,
        recent_candidates: [...candidates]
            .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime())
            .slice(0, 8),
    }), [stats, candidates]);

    const todayNewResumes = stats.todayNewResumes;

    const recentCandidates = scopedDashboard.recent_candidates || [];
    const recentLogs = aiLogs.slice(0, 6);
    const candidateFilterSummary = useMemo(() => {
        const positionLabel = candidatePositionFilter.length === 0
            ? recruitmentUiText.allPositions
            : candidatePositionFilter.map(id => positions.find((p) => String(p.id) === id)?.title).filter(Boolean).join(", ") || recruitmentUiText.specifiedPosition;
        const statusLabel = candidateStatusFilter.length === 0
            ? recruitmentUiText.allStatuses
            : candidateStatusFilter.map(s => candidateStatusLabels[s] || s).join(", ");
        const matchLabel = ({
            all: recruitmentUiText.allMatchPercent,
            "80+": recruitmentUiText.above80,
            "60+": recruitmentUiText.above60,
            "40+": recruitmentUiText.above40,
        } as Record<string, string>)[candidateMatchFilter] || candidateMatchFilter;
        const sourceLabel = candidateSourceFilter.length === 0 ? recruitmentUiText.allSources : candidateSourceFilter.join(", ");
        const timeLabel = ({
            all: recruitmentUiText.allTime,
            today: recruitmentUiText.today,
            "7d": recruitmentUiText.last7Days,
            "30d": recruitmentUiText.last30Days,
        } as Record<string, string>)[candidateTimeFilter] || candidateTimeFilter;
        const keywordLabel = candidateQuery.trim()
            ? `${recruitmentUiText.keywordPrefix}: ${candidateQuery.trim()}`
            : recruitmentUiText.noKeyword;
        return [positionLabel, statusLabel, matchLabel, sourceLabel, timeLabel, keywordLabel].join(" · ");
    }, [
        candidateMatchFilter,
        candidatePositionFilter,
        candidateQuery,
        candidateSourceFilter,
        candidateStatusFilter,
        candidateTimeFilter,
        language,
        positions,
        recruitmentUiText,
    ]);
    const auditFilterSummary = useMemo(() => {
        const taskTypeLabel = logTaskTypeFilter === "all"
            ? recruitmentUiText.allTaskTypes
            : (aiTaskLabels[logTaskTypeFilter] || logTaskTypeFilter);
        const statusLabel = logStatusFilter === "all" ? recruitmentUiText.allStatuses : logStatusFilter;
        return `${taskTypeLabel} · ${statusLabel}`;
    }, [language, logStatusFilter, logTaskTypeFilter, recruitmentUiText]);

    useEffect(() => {
        const optionValues = new Set(orgScopeOptions.map((option) => option.value));
        if (!optionValues.size || optionValues.has(selectedOrgScope)) {
            return;
        }
        const defaultCompanyScope = findCompanyScopeCodeForOrg(defaultOrgScope, organizationMap);
        setSelectedOrgScope(optionValues.has(defaultCompanyScope) ? defaultCompanyScope : orgScopeOptions[0].value);
    }, [defaultOrgScope, orgScopeOptions, organizationMap, selectedOrgScope]);

    useEffect(() => {
        const optionValues = new Set(departmentScopeOptions.map((option) => option.value));
        if (!optionValues.size) {
            if (selectedDepartmentScope !== ALL_COMPANY_DEPARTMENTS_VALUE) {
                setSelectedDepartmentScope(ALL_COMPANY_DEPARTMENTS_VALUE);
            }
            return;
        }
        if (optionValues.has(selectedDepartmentScope)) {
            return;
        }
        const allDepartmentsOption = departmentScopeOptions.find((option) => option.value === ALL_COMPANY_DEPARTMENTS_VALUE);
        setSelectedDepartmentScope((allDepartmentsOption || departmentScopeOptions[0]).value);
    }, [departmentScopeOptions, selectedDepartmentScope]);

    useEffect(() => {
        setPositions(filterBusinessRowsByOrgCodes(allPositions, activeBusinessOrgCodes));
        setCandidates(filterBusinessRowsByOrgCodes(allCandidates, activeBusinessOrgCodes));
        setTalentPoolCandidates(filterBusinessRowsByOrgCodes(allTalentPoolCandidates, activeBusinessOrgCodes));
        setSkills(filterResourceRowsByOrgCodes(allSkills, activeBusinessOrgCodes, organizationMap));
        setAiLogs(filterBusinessRowsByOrgCodes(allAiLogs, activeBusinessOrgCodes));
        setLlmConfigs(filterResourceRowsByOrgCodes(allLlmConfigs, activeBusinessOrgCodes, organizationMap));
        setMailSenderConfigs(filterResourceRowsByOrgCodes(allMailSenderConfigs, activeBusinessOrgCodes, organizationMap));
        setMailRecipients(filterResourceRowsByOrgCodes(allMailRecipients, activeBusinessOrgCodes, organizationMap));
        setResumeMailDispatches(filterBusinessRowsByOrgCodes(allResumeMailDispatches, activeBusinessOrgCodes));
    }, [
        activeBusinessOrgCodes,
        allAiLogs,
        allCandidates,
        allTalentPoolCandidates,
        allLlmConfigs,
        allMailRecipients,
        allMailSenderConfigs,
        allPositions,
        allResumeMailDispatches,
        allSkills,
        organizationMap,
    ]);

    useEffect(() => {
        setSelectedPositionId((current) => {
            if (current && visiblePositions.some((position) => position.id === current)) {
                return current;
            }
            return visiblePositions[0]?.id || null;
        });
    }, [visiblePositions]);

    useEffect(() => {
        setSelectedCandidateId((current) => {
            if (current && visibleCandidateIdSet.has(current)) {
                return current;
            }
            return visibleCandidates[0]?.id || null;
        });
    }, [visibleCandidateIdSet, visibleCandidates]);

    useEffect(() => {
        setSelectedLogId((current) => {
            if (!current) {
                return current;
            }
            if (visibleAiLogs.some((log) => log.id === current)) {
                return current;
            }
            return null;
        });
    }, [visibleAiLogs]);

    useEffect(() => {
        if (activePage === "positions" && !canManagePosition) {
            applyRecruitmentPageChange("workspace", "replace");
        } else if (activePage === "candidates" && !canManageCandidate) {
            applyRecruitmentPageChange("workspace", "replace");
        } else if (activePage === "audit" && !canViewLog) {
            applyRecruitmentPageChange("workspace", "replace");
        } else if (activePage === "settings-skills" && !canViewSkill && !canManageSkill) {
            applyRecruitmentPageChange("workspace", "replace");
        } else if (activePage === "settings-models" && !canViewLLMConfig && !canManageLLMConfig) {
            applyRecruitmentPageChange("workspace", "replace");
        } else if (activePage === "settings-mail" && !canViewMail && !canManageMailConfig) {
            applyRecruitmentPageChange("workspace", "replace");
        }
    }, [
        activePage,
        applyRecruitmentPageChange,
        canManagePosition,
        canManageCandidate,
        canViewLog,
        canViewSkill,
        canManageSkill,
        canViewLLMConfig,
        canManageLLMConfig,
        canViewMail,
        canManageMailConfig,
    ]);

    useEffect(() => {
        setSettingsPopoverOpen(false);
    }, [activePage]);

    // 进入人才库页面时加载数据
    useEffect(() => {
        if (activePage === "talent-pool") {
            loadTalentPoolCandidates();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePage]);

    // 监听顶栏侧边栏的导航事件
    useEffect(() => {
        const handler = (e: Event) => {
            const { page, replace } = resolveRecruitmentNavigationDetail((e as CustomEvent).detail);
            applyRecruitmentPageChange(page as RecruitmentPage, replace ? "replace" : "push");
        };
        recruitmentNavBus.addEventListener('navigate', handler);
        return () => recruitmentNavBus.removeEventListener('navigate', handler);
    }, [applyRecruitmentPageChange]);

    useEffect(() => {
        setSelectedCandidateIds((current) => current.filter((candidateId) => visibleCandidates.some((candidate) => candidate.id === candidateId)));
    }, [visibleCandidates]);

    useEffect(() => {
        if (candidatePositionFilter.length > 0) {
            const validIds = candidatePositionFilter.filter(id =>
                positions.some((position) => String(position.id) === id)
            );
            if (validIds.length !== candidatePositionFilter.length) {
                setCandidatePositionFilter(validIds);
            }
        }
    }, [candidatePositionFilter, positions]);

    useEffect(() => {
        selectedLogIdRef.current = selectedLogId;
    }, [selectedLogId]);

    useEffect(() => {
        chatContextRef.current = chatContext;
    }, [chatContext]);

    useEffect(() => {
        selectedPositionIdRef.current = selectedPositionId;
    }, [selectedPositionId]);

    useEffect(() => {
        setPositionWorkspaceView("candidates");
        defaultTabSetForPositionRef.current = null;
        setPositionSecondaryPanelOpen(false);
        setPositionCandidateDetailOpen(false);
        setPositionCandidateSearch("");
        setPositionCandidateStatusFilter("__all__");
        setPositionCandidatesData([]);
        setPositionCandidatesTotal(0);
        setPositionCandidatesInitialLoaded(false);
    }, [selectedPositionId]);

    useEffect(() => {
        if (activePage !== "talent-pool") {
            setTalentPoolCandidateDetailOpen(false);
        }
    }, [activePage]);

    useEffect(() => {
        if (activePage !== "candidates") {
            return;
        }
        // 如果没有选中候选人，清空详情
        if (!selectedCandidateId) {
            setCandidateDetail(null);
            checkedDuplicateCandidateIdRef.current = null;
        }
        // 如果选中的候选人不在候选人列表中，也清空详情（但从人才库跳转过来的情况除外）
        // 注意：这里不再检查 visibleCandidateIdSet，因为从人才库跳转过来的候选人可能不在候选人列表中
    }, [activePage, selectedCandidateId]);

    useEffect(() => {
        if (
            talentPoolCandidateDetailOpen
            && selectedCandidateId
            && !talentPoolCandidates.some((candidate) => candidate.id === selectedCandidateId)
        ) {
            setTalentPoolCandidateDetailOpen(false);
        }
    }, [selectedCandidateId, talentPoolCandidateDetailOpen, talentPoolCandidates]);

    // 搜索候选人（服务端搜索，防抖 300ms）
    // 只在岗位页面且工作区视图为candidates时才加载
    useEffect(() => {
        if (!selectedPositionId) return;
        if (activePage !== "positions") return; // 只在岗位页面加载
        if (positionWorkspaceView !== "candidates") return; // 只在候选人视图加载
        
        // 如果正在加载，跳过重复请求
        if (positionCandidatesLoading) return;
        
        const timer = window.setTimeout(() => {
            void loadPositionCandidates(
                selectedPositionId,
                positionCandidateSearch || undefined,
                positionCandidateStatusFilter !== "__all__" ? positionCandidateStatusFilter : undefined,
            );
        }, 300);
        return () => window.clearTimeout(timer);
    }, [positionCandidateSearch, positionCandidateStatusFilter, positionWorkspaceView, selectedPositionId, activePage]);

    useEffect(() => {
        if (bootstrapping || activePage === "candidates" || !candidateListUsingVisibleFiltersRef.current) {
            return;
        }
        void loadCandidates({
            silent: true,
            force: true,
            useVisibleFilters: false,
        });
    }, [activePage, bootstrapping]);


    useEffect(() => {
        selectedCandidateIdRef.current = selectedCandidateId;
    }, [selectedCandidateId]);

    useEffect(() => {
        auditLogRequestKeyRef.current = auditLogRequestKey;
    }, [auditLogRequestKey]);

    useEffect(() => {
        pageVisibleRef.current = pageVisible;
    }, [pageVisible]);

    useEffect(() => {
        activePageRef.current = activePage;
    }, [activePage]);

    useEffect(() => {
        if (typeof document === "undefined") {
            return undefined;
        }
        const handleVisibilityChange = () => {
            const visible = document.visibilityState === "visible";
            pageVisibleRef.current = visible;
            setPageVisible(visible);
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        const taskMonitorTimers = taskMonitorTimersRef.current;
        const taskMonitorTokens = taskMonitorTokensRef.current;
        const inflightRequests = requestInflightRef.current;
        return () => {
            mountedRef.current = false;
            taskMonitorTimers.forEach((timerId) => window.clearTimeout(timerId));
            taskMonitorTimers.clear();
            taskMonitorTokens.clear();
            inflightRequests.clear();
            if (logFlushRafRef.current != null) {
                window.cancelAnimationFrame(logFlushRafRef.current);
                logFlushRafRef.current = null;
            }
            if (candidateUpdateBatchTimerRef.current != null) {
                window.clearTimeout(candidateUpdateBatchTimerRef.current);
                candidateUpdateBatchTimerRef.current = null;
            }
            pendingCandidateUpdateEventsRef.current = [];
        };
    }, []);

    useEffect(() => {
        setInterviewGenerating(Boolean(activeInterviewTaskId));
    }, [activeInterviewTaskId]);

    useEffect(() => {
        setChatSending(Boolean(activeChatTaskId));
    }, [activeChatTaskId]);

    useEffect(() => {
        const viewport = assistantScrollAreaRef.current;
        if (!viewport || !assistantScrollAnchorRef.current) {
            return undefined;
        }
        if (!autoFollowStream) {
            return undefined;
        }
        const frameId = window.requestAnimationFrame(() => {
            viewport.scrollTo({
                top: viewport.scrollHeight,
                behavior: chatSending ? "auto" : "smooth",
            });
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [assistantDisplayMode, assistantOpen, autoFollowStream, chatMessages, chatSending]);

    useEffect(() => {
        const shouldFocusAssistantInput = assistantOpen || activePage === "assistant";
        if (!shouldFocusAssistantInput) {
            return undefined;
        }
        const timer = window.setTimeout(() => {
            focusAssistantInput(true);
        }, 50);
        return () => window.clearTimeout(timer);
    }, [activePage, assistantOpen, assistantDisplayMode]);

    // 使用缓存 hook
    const { getCachedOrFetch: getCachedPositions, invalidateCache: invalidatePositionsCache } = useCachedListData<PositionSummary>({ ttl: 60000 });
    const { getCachedOrFetch: getCachedCandidates, invalidateCache: invalidateCandidatesCache } = useCachedObjectData<{items: CandidateSummary[]; total: number}>({ ttl: 60000 });
    const { getCachedOrFetch: getCachedLogs, invalidateCache: invalidateLogsCache } = useCachedObjectData<{items: AITaskLog[]; total: number}>({ ttl: 30000 });

    // 优化的分阶段加载策略
    useEffect(() => {
        let cancelled = false;
        let criticalLoaded = false;

        async function bootstrap() {
            setBootstrapping(true);
            logsFiltersInitializedRef.current = false;

            try {
                // 阶段 1: 关键数据 (阻塞渲染，最高优先级)
                await Promise.allSettled([
                    loadMetadata(),
                    loadOrganizationCatalog(),
                ]);

                if (cancelled) return;

                // 阶段 2: 关键首屏列表尽早开始，避免被统计接口阻塞
                void loadPositionsWithCache();
                void loadCandidatesFirstPage();
                criticalLoaded = true;
                setBootstrapping(false);

                // 阶段 3: 工作台统计延后，避免抢占首屏
                const scheduleDeferredLoad = () => {
                    if (cancelled) {
                        return;
                    }
                    const scopedOrgCode = resolveScopedOrgCode(selectedDepartmentScope, selectedOrgScope);
                    const orgCodeParam = scopedOrgCode ? `?org_code=${encodeURIComponent(scopedOrgCode)}` : "";
                    void Promise.allSettled([
                        recruitmentApi<import("@/lib/recruitment-api").RecruitmentFunnelData>(`/candidates/funnel${orgCodeParam}`)
                            .then((d) => { if (!cancelled) setFunnelData(d); })
                            .catch(() => {}),
                        recruitmentApi<import("@/lib/recruitment-api").SourceStatsData>(`/candidates/source-stats${orgCodeParam}`)
                            .then((d) => { if (!cancelled) setSourceStatsData(d); })
                            .catch(() => {}),
                    ]);
                };
                if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
                    window.requestIdleCallback(() => {
                        scheduleDeferredLoad();
                    }, { timeout: 2000 });
                } else {
                    setTimeout(() => {
                        scheduleDeferredLoad();
                    }, 200);
                }
            } catch (error) {
                if (!criticalLoaded && !cancelled) {
                    setBootstrapping(false);
                }
            }
        }

        async function loadPositionsWithCache(): Promise<void> {
            try {
                const data = await getCachedPositions(
                    'positions:all',
                    () => recruitmentApi<PositionSummary[]>("/positions")
                );
                if (!cancelled) {
                    setAllPositions(data);
                }
            } catch (error) {
                toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.positions, formatActionError(error)));
            }
        }

        async function loadCandidatesFirstPage(): Promise<void> {
            try {
                // 设置 loading 状态，防止显示空状态
                setCandidatesLoading(true);
                candidateListContextKeyRef.current = buildCandidateListContextKey({ useVisibleFilters: false });
                const queryString = buildCandidateListQueryString({
                    useVisibleFilters: false,
                });
                const url = `/candidates?${queryString}`;
                const data = await recruitmentApi<{items: CandidateSummary[]; total: number}>(url, {
                    timeoutMs: 45000,
                });
                if (!cancelled) {
                    candidateListUsingVisibleFiltersRef.current = false;
                    setAllCandidates(deduplicateCandidates(data?.items || []));
                    setCandidateTotal(data?.total || 0);
                    setCandidatesInitialLoaded(true);
                    setCandidatesLoading(false);
                }
            } catch (error) {
                if (!cancelled) {
                    setCandidatesInitialLoaded(true);
                    setCandidatesLoading(false);
                }
                toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.candidates, formatActionError(error)));
            }
        }

        void bootstrap();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (bootstrapping) {
            return;
        }
        if (!logsFiltersInitializedRef.current) {
            logsFiltersInitializedRef.current = true;
            return;
        }
        void loadLogs();
    }, [bootstrapping, auditLogRequestKey]);

    useEffect(() => {
        if (!selectedPositionId) {
            setPositionDetail(null);
            return;
        }
        // 只有在岗位页面时才加载岗位详情，避免不必要的请求
        if (activePage !== "positions") {
            return;
        }
        void loadPositionDetail(selectedPositionId);
    }, [selectedPositionId, activePage]);

    useEffect(() => {
        jdGenerationInFlightRef.current = false;
        jdAbortControllerRef.current?.abort();
        jdAbortControllerRef.current = null;
        jdActiveTaskIdRef.current = null;
        setJdGenerationStatus("idle");
        setJdGenerationError("");
    }, [selectedPositionId, activePage]);

    useEffect(() => {
        if (!selectedCandidateId) {
            setCandidateDetail(null);
            checkedDuplicateCandidateIdRef.current = null;
            return;
        }
        const shouldLoadCandidateDetail = (
            activePage === "candidates"
            || positionCandidateDetailOpen
            || talentPoolCandidateDetailOpen
        );
        if (!shouldLoadCandidateDetail) {
            return;
        }
        // 仅在详情真正可见时加载，避免 workspace 首屏预拉详情
        const shouldCheckDuplicates = checkedDuplicateCandidateIdRef.current !== selectedCandidateId;
        if (shouldCheckDuplicates) {
            checkedDuplicateCandidateIdRef.current = selectedCandidateId;
        }
        void loadCandidateDetail(selectedCandidateId, { includeDuplicates: shouldCheckDuplicates });
    }, [activePage, positionCandidateDetailOpen, selectedCandidateId, talentPoolCandidateDetailOpen]);

    useEffect(() => {
        if (!selectedLogId) {
            setSelectedLogDetail(null);
            return;
        }
        void loadLogDetail(selectedLogId);
    }, [selectedLogId]);

    // 切换到审计中心时，拉取最新日志
    useEffect(() => {
        if (activePage === "audit") {
            void loadLogs({ silent: true });
        }
    }, [activePage]);

    useEffect(() => {
        if (activePage === "settings-skills") {
            void ensureSkillsLoaded();
        }
    }, [activePage]);

    useEffect(() => {
        if (activePage === "settings-mail") {
            void ensureMailSettingsLoaded();
        }
    }, [activePage]);

    useEffect(() => {
        if (activePage === "settings-models" && canManageLLMConfig) {
            void ensureLLMConfigsLoaded();
        }
    }, [activePage, canManageLLMConfig]);

    const scrollCandidateListToTop = useCallback(() => {
        const viewport = resolveScrollAreaViewport(candidateListScrollEl);
        if (!viewport) {
            return;
        }
        viewport.scrollTo({
            top: 0,
            behavior: "auto",
        });
    }, [candidateListScrollEl]);

    useEffect(() => {
        candidateMatchSortOrderRef.current = candidateMatchSortOrder;
    }, [candidateMatchSortOrder]);

    useEffect(() => {
        if (bootstrapping || activePage !== "candidates") {
            return;
        }
        const timer = window.setTimeout(() => {
            scrollCandidateListToTop();
            void loadCandidates({
                silent: true,
                force: true,
                useVisibleFilters: true,
                query: deferredCandidateQuery,
                matchSortOrder: candidateMatchSortOrderRef.current,
            });
        }, 150);
        return () => window.clearTimeout(timer);
    }, [activePage, bootstrapping, candidatePositionFilter, candidateStatusFilter, deferredCandidateQuery, scrollCandidateListToTop]);

    const matchesActiveCandidateListFilters = useCallback((candidate: CandidateSummary) => {
        if (!candidateListUsingVisibleFiltersRef.current || activePageRef.current !== "candidates") {
            return true;
        }
        const activePositionId = candidatePositionFilter[0] || "";
        if (activePositionId && String(candidate.position_id || "") !== activePositionId) {
            return false;
        }
        const activeStatus = candidateStatusFilter[0] || "";
        if (activeStatus && resolveCandidateDisplayStatus(candidate) !== activeStatus) {
            return false;
        }
        const normalizedQuery = candidateQuery.trim().toLowerCase();
        if (!normalizedQuery) {
            return true;
        }
        return [
            candidate.name,
            candidate.phone,
            candidate.email,
            candidate.current_company,
        ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    }, [candidatePositionFilter, candidateQuery, candidateStatusFilter]);

    const syncRealtimeCandidateListsBatch = useCallback((updates: CandidateSnapshotBatchUpdate[]) => {
        const normalizedUpdates = updates
            .map((update) => {
                const candidateId = Number(update.snapshot?.id);
                if (!Number.isFinite(candidateId)) {
                    return null;
                }
                return {
                    ...update,
                    snapshot: { ...update.snapshot, id: candidateId } as CandidateSummary,
                };
            })
            .filter((item): item is CandidateSnapshotBatchUpdate & { snapshot: CandidateSummary } => Boolean(item));
        if (!normalizedUpdates.length) {
            return;
        }

        let nextCandidates = allCandidatesRef.current;
        let nextTalentPoolCandidates = allTalentPoolCandidatesRef.current;
        let candidatesChanged = false;
        let talentPoolChanged = false;
        let candidateTotalDelta = 0;

        const ensureCandidatesCopy = () => {
            if (!candidatesChanged) {
                nextCandidates = [...nextCandidates];
                candidatesChanged = true;
            }
        };
        const ensureTalentPoolCopy = () => {
            if (!talentPoolChanged) {
                nextTalentPoolCandidates = [...nextTalentPoolCandidates];
                talentPoolChanged = true;
            }
        };
        const removeCandidateListItem = (candidateId: number) => {
            const index = nextCandidates.findIndex((candidate) => candidate.id === candidateId);
            if (index === -1) {
                return false;
            }
            ensureCandidatesCopy();
            nextCandidates.splice(index, 1);
            return true;
        };
        const removeTalentPoolItem = (candidateId: number) => {
            const index = nextTalentPoolCandidates.findIndex((candidate) => candidate.id === candidateId);
            if (index === -1) {
                return false;
            }
            ensureTalentPoolCopy();
            nextTalentPoolCandidates.splice(index, 1);
            return true;
        };

        normalizedUpdates.forEach(({ snapshot, insertIntoCandidateList }) => {
            const candidateId = Number(snapshot.id);
            const nextItem = snapshot as CandidateSummary;
            const normalizedStatus = String(nextItem.status || "").trim().toLowerCase();
            const shouldShowInCandidateList = normalizedStatus !== "" && !CANDIDATE_LIST_EXCLUDED_STATUSES.has(normalizedStatus);
            const candidateIndex = nextCandidates.findIndex((candidate) => candidate.id === candidateId);
            const matchesCurrentCandidateList = matchesActiveCandidateListFilters(nextItem);

            if (shouldShowInCandidateList && !matchesCurrentCandidateList) {
                if (removeCandidateListItem(candidateId)) {
                    candidateTotalDelta -= 1;
                }
                removeTalentPoolItem(candidateId);
                return;
            }

            if (shouldShowInCandidateList) {
                if (candidateIndex !== -1) {
                    const merged = mergeCandidatePatch(nextCandidates[candidateIndex], nextItem);
                    if (merged !== nextCandidates[candidateIndex]) {
                        ensureCandidatesCopy();
                        nextCandidates[candidateIndex] = merged;
                    }
                } else if (insertIntoCandidateList) {
                    ensureCandidatesCopy();
                    nextCandidates.unshift(nextItem);
                    candidateTotalDelta += 1;
                }
                removeTalentPoolItem(candidateId);
                return;
            }

            if (removeCandidateListItem(candidateId)) {
                candidateTotalDelta -= 1;
            }

            if (!normalizedStatus || !CANDIDATE_LIST_EXCLUDED_STATUSES.has(normalizedStatus)) {
                return;
            }

            const talentPoolIndex = nextTalentPoolCandidates.findIndex((candidate) => candidate.id === candidateId);
            if (talentPoolIndex !== -1) {
                const merged = mergeCandidatePatch(nextTalentPoolCandidates[talentPoolIndex], nextItem);
                if (merged !== nextTalentPoolCandidates[talentPoolIndex]) {
                    ensureTalentPoolCopy();
                    nextTalentPoolCandidates[talentPoolIndex] = merged;
                }
                return;
            }
            ensureTalentPoolCopy();
            nextTalentPoolCandidates.unshift(nextItem);
        });

        if (candidatesChanged) {
            allCandidatesRef.current = nextCandidates;
            setAllCandidates(nextCandidates);
        }
        if (talentPoolChanged) {
            allTalentPoolCandidatesRef.current = nextTalentPoolCandidates;
            setAllTalentPoolCandidates(nextTalentPoolCandidates);
        }
        if (candidateTotalDelta !== 0) {
            const nextTotal = Math.max(0, candidateTotalRef.current + candidateTotalDelta);
            candidateTotalRef.current = nextTotal;
            setCandidateTotal(nextTotal);
        }
    }, [matchesActiveCandidateListFilters]);

    const syncRealtimeCandidateLists = useCallback((
        snapshot?: Partial<CandidateSummary> | null,
        options?: { insertIntoCandidateList?: boolean },
    ) => {
        if (!snapshot?.id) {
            return;
        }
        syncRealtimeCandidateListsBatch([{
            snapshot,
            insertIntoCandidateList: options?.insertIntoCandidateList,
        }]);
    }, [syncRealtimeCandidateListsBatch]);

    const applyCandidateDetailSnapshot = useCallback((snapshot?: Partial<CandidateSummary> | null) => {
        if (!snapshot?.id) {
            return;
        }
        const candidateId = Number(snapshot.id);
        if (!Number.isFinite(candidateId)) {
            return;
        }
        setCandidateDetail((current) => {
            if (!current || current.candidate.id !== candidateId) {
                return current;
            }
            return {
                ...current,
                candidate: {
                    ...current.candidate,
                    ...snapshot,
                    id: candidateId,
                },
            };
        });
    }, []);

    const applyCandidateDetailSnapshotsBatch = useCallback((snapshots: Partial<CandidateSummary>[]) => {
        if (!snapshots.length) {
            return;
        }
        const latestByCandidateId = new Map<number, Partial<CandidateSummary>>();
        snapshots.forEach((snapshot) => {
            const candidateId = Number(snapshot.id);
            if (Number.isFinite(candidateId)) {
                latestByCandidateId.set(candidateId, { ...snapshot, id: candidateId });
            }
        });
        if (!latestByCandidateId.size) {
            return;
        }
        setCandidateDetail((current) => {
            if (!current) {
                return current;
            }
            const patch = latestByCandidateId.get(current.candidate.id);
            if (!patch) {
                return current;
            }
            const nextCandidate = mergeCandidatePatch(current.candidate, patch);
            if (nextCandidate === current.candidate) {
                return current;
            }
            return {
                ...current,
                candidate: nextCandidate,
            };
        });
    }, []);

    const applyCandidateReasonUpdatesBatch = useCallback((updates: Map<number, string>) => {
        if (!updates.size) {
            return;
        }
        let nextCandidates = allCandidatesRef.current;
        let changed = false;
        updates.forEach((reason, candidateId) => {
            const index = nextCandidates.findIndex((candidate) => candidate.id === candidateId);
            if (index === -1 || nextCandidates[index].display_status_reason === reason) {
                return;
            }
            if (!changed) {
                nextCandidates = [...nextCandidates];
                changed = true;
            }
            nextCandidates[index] = {
                ...nextCandidates[index],
                display_status_reason: reason,
            };
        });
        if (changed) {
            allCandidatesRef.current = nextCandidates;
            setAllCandidates(nextCandidates);
        }
    }, []);

    const applyScreeningAutoRequeueUpdatesBatch = useCallback((updates: Map<number, TaskSSEEvent>) => {
        if (!updates.size) {
            return;
        }
        let nextCandidates = allCandidatesRef.current;
        let changed = false;
        updates.forEach((event, candidateId) => {
            const index = nextCandidates.findIndex((candidate) => candidate.id === candidateId);
            if (index === -1) {
                return;
            }
            const patch: Partial<CandidateSummary> = {
                active_screening_task_id: event.task_id ?? nextCandidates[index].active_screening_task_id,
                active_screening_task_type: event.task_type ?? nextCandidates[index].active_screening_task_type,
                active_screening_task_status: "queued",
                active_screening_status: "queued",
                active_screening_stage: "queued",
                active_screening_auto_retry_scheduled: true,
            };
            const merged = mergeCandidatePatch(nextCandidates[index], patch);
            if (merged === nextCandidates[index]) {
                return;
            }
            if (!changed) {
                nextCandidates = [...nextCandidates];
                changed = true;
            }
            nextCandidates[index] = merged;
        });
        if (changed) {
            allCandidatesRef.current = nextCandidates;
            setAllCandidates(nextCandidates);
        }
    }, []);

    const flushPendingCandidateUpdatedEvents = useCallback(() => {
        candidateUpdateBatchTimerRef.current = null;
        const events = pendingCandidateUpdateEventsRef.current;
        pendingCandidateUpdateEventsRef.current = [];
        if (!events.length) {
            return;
        }

        const listUpdates: CandidateSnapshotBatchUpdate[] = [];
        const detailSnapshots: Partial<CandidateSummary>[] = [];
        const reasonUpdates = new Map<number, string>();
        const autoRequeueUpdates = new Map<number, TaskSSEEvent>();
        const aiPositionNoSnapshotEvents: TaskSSEEvent[] = [];
        const detailLoadCandidateIds = new Set<number>();

        events.forEach((event) => {
            const isRootScreeningTask = event.task_type === "screening_flow";
            const isAIPositionTask = Boolean(event.task_type?.startsWith("ai_position"));
            const isTerminalScreeningTask = isRootScreeningTask
                && TERMINAL_SCREENING_TASK_STATUSES.has(String(event.status || "").trim().toLowerCase());
            const sanitizedCandidateSnapshot = isTerminalScreeningTask
                ? sanitizeTerminalScreeningCandidateSnapshot(event.candidate_snapshot, event.status)
                : event.candidate_snapshot;
            if (sanitizedCandidateSnapshot) {
                const nextSnapshot = event.screening_enqueue_failed
                    ? {
                        ...sanitizedCandidateSnapshot,
                        display_status_reason: event.error_message || "自动初筛入队失败，请稍后重试",
                    }
                    : sanitizedCandidateSnapshot;
                if (isRootScreeningTask || isAIPositionTask) {
                    const nextStatus = String(event.status || sanitizedCandidateSnapshot.status || "").trim().toLowerCase();
                    listUpdates.push({
                        snapshot: nextSnapshot,
                        insertIntoCandidateList: isAIPositionTask
                            ? (nextStatus !== "" && !CANDIDATE_LIST_EXCLUDED_STATUSES.has(nextStatus))
                            : (nextStatus === "pending_screening" || nextStatus === "screening_running"),
                    });
                }
                detailSnapshots.push(nextSnapshot);
            } else if (event.candidate_id && event.screening_enqueue_failed) {
                reasonUpdates.set(
                    event.candidate_id,
                    event.error_message || "自动初筛入队失败，请稍后重试",
                );
            }
            if (event.candidate_id && event.task_type === "screening_flow" && event.auto_requeue_scheduled) {
                if (!event.candidate_snapshot) {
                    autoRequeueUpdates.set(event.candidate_id, event);
                }
                return;
            }
            if (event.candidate_id && event.task_type?.startsWith("ai_position")) {
                if (!event.candidate_snapshot) {
                    aiPositionNoSnapshotEvents.push(event);
                }
                if (
                    selectedCandidateIdRef.current === event.candidate_id
                    && (activePage === "candidates" || positionCandidateDetailOpen || talentPoolCandidateDetailOpen)
                ) {
                    detailLoadCandidateIds.add(event.candidate_id);
                }
            }
        });

        syncRealtimeCandidateListsBatch(listUpdates);
        applyCandidateDetailSnapshotsBatch(detailSnapshots);
        applyCandidateReasonUpdatesBatch(reasonUpdates);
        applyScreeningAutoRequeueUpdatesBatch(autoRequeueUpdates);

        aiPositionNoSnapshotEvents.forEach((event) => {
            const newStatus = event.status;
            if (newStatus === "pending_screening" || newStatus === "screening_running") {
                const existingTalentPoolCandidate = allTalentPoolCandidatesRef.current.find((candidate) => candidate.id === event.candidate_id);
                if (existingTalentPoolCandidate) {
                    syncRealtimeCandidateLists({
                        ...existingTalentPoolCandidate,
                        status: newStatus,
                        ai_match_position_id: event.ai_match_position_id ?? existingTalentPoolCandidate.ai_match_position_id,
                        ai_match_position_title: event.ai_match_position_title ?? existingTalentPoolCandidate.ai_match_position_title,
                        ai_match_reason: event.ai_match_reason ?? existingTalentPoolCandidate.ai_match_reason,
                        ai_potential_position: event.ai_potential_position ?? existingTalentPoolCandidate.ai_potential_position,
                        ai_potential_reason: event.ai_potential_reason ?? existingTalentPoolCandidate.ai_potential_reason,
                    }, { insertIntoCandidateList: true });
                } else {
                    setAllTalentPoolCandidates((current) => current.filter((candidate) => candidate.id !== event.candidate_id));
                }
            } else {
                setAllTalentPoolCandidates((current) => current.map((candidate) => (
                    candidate.id === event.candidate_id
                        ? {
                            ...candidate,
                            status: newStatus ?? candidate.status,
                            ai_match_position_id: event.ai_match_position_id ?? candidate.ai_match_position_id,
                            ai_match_position_title: event.ai_match_position_title ?? candidate.ai_match_position_title,
                            ai_match_reason: event.ai_match_reason ?? candidate.ai_match_reason,
                            ai_potential_position: event.ai_potential_position ?? candidate.ai_potential_position,
                            ai_potential_reason: event.ai_potential_reason ?? candidate.ai_potential_reason,
                        }
                        : candidate
                )));
            }
        });
        detailLoadCandidateIds.forEach((candidateId) => {
            void loadCandidateDetail(candidateId, { silent: true, force: true, skipChatContextSave: true });
        });
    }, [
        activePage,
        applyCandidateDetailSnapshotsBatch,
        applyCandidateReasonUpdatesBatch,
        applyScreeningAutoRequeueUpdatesBatch,
        positionCandidateDetailOpen,
        syncRealtimeCandidateLists,
        syncRealtimeCandidateListsBatch,
        talentPoolCandidateDetailOpen,
    ]);

    const queueCandidateUpdatedEvent = useCallback((event: TaskSSEEvent) => {
        pendingCandidateUpdateEventsRef.current.push(event);
        if (candidateUpdateBatchTimerRef.current != null) {
            return;
        }
        candidateUpdateBatchTimerRef.current = window.setTimeout(
            flushPendingCandidateUpdatedEvents,
            CANDIDATE_SSE_BATCH_WINDOW_MS,
        );
    }, [flushPendingCandidateUpdatedEvents]);

    useTaskSSE(
        activePage === "candidates" || activePage === "audit" || activePage === "workspace" || activePage === "talent-pool",
        {
            onTaskCompleted: (event) => {
                const isRootScreeningTask = event.task_type === "screening_flow";
                const isTerminalScreeningTask = isRootScreeningTask
                    && TERMINAL_SCREENING_TASK_STATUSES.has(String(event.status || "").trim().toLowerCase());
                const sanitizedCandidateSnapshot = isTerminalScreeningTask
                    ? sanitizeTerminalScreeningCandidateSnapshot(event.candidate_snapshot, event.status)
                    : event.candidate_snapshot;
                if (event.task_id) {
                    stopTaskMonitor(event.task_id);
                    if (event.related_candidate_id) {
                        clearActiveScreeningTask(event.related_candidate_id, event.task_id);
                    }
                }
                if (event.related_candidate_id && isTerminalScreeningTask) {
                    recentlyCompletedScreeningCandidatesRef.current.set(event.related_candidate_id, Date.now());
                }
                if (sanitizedCandidateSnapshot) {
                    applyCandidateDetailSnapshot(sanitizedCandidateSnapshot);
                }
                if (event.related_candidate_id && event.task_type === "screening_flow") {
                    const failedLike = new Set(["failed", "invalid_result", "json_parse_failed", "timeout", "retry_exhausted", "quota_exceeded", "rate_limited", "upstream_timeout", "request_failed"]);
                    if (!event.candidate_snapshot) {
                        setAllCandidates((current) => {
                            let changed = false;
                            const next = current.map((candidate) => {
                                if (candidate.id !== event.related_candidate_id) {
                                    return candidate;
                                }
                                const failed = failedLike.has(String(event.status || "").trim());
                                const nextCandidate = mergeCandidatePatch(candidate, {
                                    status: failed ? "screening_failed" : candidate.status,
                                    display_status: failed ? "screening_failed" : candidate.display_status,
                                    display_status_reason: failed
                                        ? sanitizeCandidateFacingErrorText(event.status || "", { context: "screening", language })
                                        : candidate.display_status_reason,
                                    active_screening_task_id: null,
                                    active_screening_task_type: null,
                                    active_screening_task_status: "",
                                    active_screening_status: "",
                                    active_screening_stage: "",
                                    active_screening_auto_retry_scheduled: false,
                                });
                                if (nextCandidate !== candidate) {
                                    changed = true;
                                }
                                return nextCandidate;
                            });
                            return changed ? next : current;
                        });
                        setCandidateDetail((current) => {
                            if (!current || current.candidate.id !== event.related_candidate_id) {
                                return current;
                            }
                            const failed = failedLike.has(String(event.status || "").trim());
                            const nextCandidate = mergeCandidatePatch(current.candidate, {
                                status: failed ? "screening_failed" : current.candidate.status,
                                display_status: failed ? "screening_failed" : current.candidate.display_status,
                                display_status_reason: failed
                                    ? sanitizeCandidateFacingErrorText(event.status || "", { context: "screening", language })
                                    : current.candidate.display_status_reason,
                                active_screening_run_id: null,
                                active_screening_task_id: null,
                                active_screening_task_type: null,
                                active_screening_task_status: null,
                                active_screening_status: null,
                                active_screening_stage: null,
                                active_screening_auto_retry_scheduled: false,
                            });
                            if (nextCandidate === current.candidate) {
                                return current;
                            }
                            return {
                                ...current,
                                candidate: nextCandidate,
                            };
                        });
                    }
                    if (
                        selectedCandidateIdRef.current === event.related_candidate_id
                        && (event.candidate_snapshot || failedLike.has(String(event.status || "").trim()))
                        && (activePage === "candidates" || positionCandidateDetailOpen || talentPoolCandidateDetailOpen)
                    ) {
                        void loadCandidateDetail(event.related_candidate_id, { silent: true, force: true, skipChatContextSave: true });
                    }
                }
            },
            onCandidateUpdated: queueCandidateUpdatedEvent,
            onBatchSummary: () => {
                if (activePage === "workspace") {
                    void refreshCandidateStats();
                }
            },
            // onTaskProgress 移除：审计日志不在初筛过程中实时更新
        },
    );

    useEffect(() => {
        const current = positionDetail?.current_jd_version;
        setJdDraft({
            title: current?.title || `${positionDetail?.position.title || (isZh ? "岗位" : "Position")} JD`,
            jdMarkdown: current?.jd_markdown || "",
            notes: current?.notes || "",
            autoActivate: true,
        });
    }, [positionDetail]);

    useEffect(() => {
        const candidate = candidateDetail?.candidate;
        const score = candidateDetail?.score;
        setCandidateEditor({
            name: candidate?.name || "",
            phone: candidate?.phone || "",
            email: candidate?.email || "",
            currentCompany: candidate?.current_company || "",
            yearsOfExperience: candidate?.years_of_experience || "",
            education: candidate?.education || "",
            age: candidate?.age != null ? String(candidate.age) : "",
            city: candidate?.city || "",
            expectedCity: candidate?.expected_city || "",
            notes: candidate?.notes || "",
            tagsText: joinTags(candidate?.tags),
            manualOverrideScore: score?.manual_override_score ? String(score.manual_override_score) : "",
            manualOverrideReason: score?.manual_override_reason || "",
            hrFeedback: score?.hr_feedback || "",
            hrFeedbackReason: score?.hr_feedback_reason || "",
            ownerId: candidate?.owner_id || "",
            positionId: candidate?.position_id != null ? String(candidate.position_id) : "",
        });
    }, [candidateDetail]);

    useEffect(() => {
        const shouldCheckDuplicates = (
            activePage === "candidates"
            || positionCandidateDetailOpen
            || talentPoolCandidateDetailOpen
        );
        if (!shouldCheckDuplicates) {
            setDuplicateCandidates([]);
        }
    }, [activePage, positionCandidateDetailOpen, talentPoolCandidateDetailOpen]);

    useEffect(() => {
        setSelectedInterviewSkillIds([]);
        setInterviewSkillSelectionDirty(false);
        setCandidateProcessLogsExpanded(false);
        const shouldLoadCandidateSideData = (
            activePage === "candidates"
            || positionCandidateDetailOpen
            || talentPoolCandidateDetailOpen
        );
        if (selectedCandidateId && shouldLoadCandidateSideData) {
            void loadInterviewSchedules(selectedCandidateId);
            void loadOffers(selectedCandidateId);
            void loadFollowUps(selectedCandidateId);
        } else {
            setInterviewSchedules([]);
            setOffers([]);
            setFollowUps([]);
        }
    }, [activePage, positionCandidateDetailOpen, selectedCandidateId, talentPoolCandidateDetailOpen]);

    useEffect(() => {
        if (activePage !== "assistant") {
            return;
        }
        void loadChatContext();
    }, [activePage]);

    useEffect(() => {
        if (candidateViewMode !== "list" || !candidateListScrollEl) {
            setCandidateListViewportWidth(0);
            return;
        }

        const updateWidth = () => setCandidateListViewportWidth(candidateListScrollEl.clientWidth);
        updateWidth();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateWidth);
            return () => window.removeEventListener("resize", updateWidth);
        }

        const observer = new ResizeObserver(() => updateWidth());
        observer.observe(candidateListScrollEl);
        return () => observer.disconnect();
    }, [candidateViewMode, candidateListScrollEl]);

    useEffect(() => {
        if (!auditListScrollEl) {
            setAuditListViewportWidth(0);
            return;
        }

        const updateWidth = () => setAuditListViewportWidth(auditListScrollEl.clientWidth);
        updateWidth();

        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateWidth);
            return () => window.removeEventListener("resize", updateWidth);
        }

        const observer = new ResizeObserver(() => updateWidth());
        observer.observe(auditListScrollEl);
        return () => observer.disconnect();
    }, [auditListScrollEl]);

    useEffect(() => {
        if (candidateViewMode !== "list") return;
        const targets = [candidateListScrollEl, candidateListHorizontalRailEl]
            .filter((node): node is HTMLDivElement => Boolean(node));
        if (!targets.length) return;
        const cleanups = targets.map((container) => {
            const handleWheel = (event: WheelEvent) => {
                if (!event.shiftKey) return;
                event.preventDefault();
                event.stopPropagation();
                if (container.scrollWidth <= container.clientWidth) return;
                const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
                if (!delta) return;
                container.scrollLeft += delta;
            };
            container.addEventListener("wheel", handleWheel, {passive: false, capture: true});
            return () => container.removeEventListener("wheel", handleWheel, true);
        });
        return () => cleanups.forEach((cleanup) => cleanup());
    }, [candidateViewMode, candidateListScrollEl, candidateListHorizontalRailEl]);

    useEffect(() => {
        const tableScroller = candidateListScrollEl;
        const horizontalRail = candidateListHorizontalRailEl;
        if (!tableScroller || !horizontalRail || candidateViewMode !== "list") {
            return;
        }

        const releaseLock = (owner: "table" | "rail") => {
            requestAnimationFrame(() => {
                if (candidateListScrollSyncLockRef.current === owner) {
                    candidateListScrollSyncLockRef.current = null;
                }
            });
        };

        const syncFromTable = () => {
            if (candidateListScrollSyncLockRef.current === "rail") {
                return;
            }
            candidateListScrollSyncLockRef.current = "table";
            horizontalRail.scrollLeft = tableScroller.scrollLeft;
            releaseLock("table");
        };

        const syncFromRail = () => {
            if (candidateListScrollSyncLockRef.current === "table") {
                return;
            }
            candidateListScrollSyncLockRef.current = "rail";
            tableScroller.scrollLeft = horizontalRail.scrollLeft;
            releaseLock("rail");
        };

        tableScroller.addEventListener("scroll", syncFromTable, {passive: true});
        horizontalRail.addEventListener("scroll", syncFromRail, {passive: true});
        horizontalRail.scrollLeft = tableScroller.scrollLeft;

        return () => {
            tableScroller.removeEventListener("scroll", syncFromTable);
            horizontalRail.removeEventListener("scroll", syncFromRail);
        };
    }, [candidateViewMode, candidateListScrollEl, candidateListHorizontalRailEl]);

    useEffect(() => {
        const tableScroller = auditListScrollEl;
        const horizontalRail = auditListHorizontalRailEl;

        if (!tableScroller || !horizontalRail) {
            return;
        }

        const releaseLock = (owner: "table" | "rail") => {
            requestAnimationFrame(() => {
                if (auditListScrollSyncLockRef.current === owner) {
                    auditListScrollSyncLockRef.current = null;
                }
            });
        };

        const handleTableWheel = (event: WheelEvent) => {
            if (!event.shiftKey) return;
            if (tableScroller.scrollWidth <= tableScroller.clientWidth) return;

            const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
            if (!delta) return;

            event.preventDefault();
            event.stopPropagation();
            tableScroller.scrollLeft += delta;
        };

        const handleRailWheel = (event: WheelEvent) => {
            if (!event.shiftKey) return;
            if (horizontalRail.scrollWidth <= horizontalRail.clientWidth) return;

            const delta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
            if (!delta) return;

            event.preventDefault();
            event.stopPropagation();
            horizontalRail.scrollLeft += delta;
        };

        const syncFromTable = () => {
            if (auditListScrollSyncLockRef.current === "rail") return;
            auditListScrollSyncLockRef.current = "table";
            horizontalRail.scrollLeft = tableScroller.scrollLeft;
            releaseLock("table");
        };

        const syncFromRail = () => {
            if (auditListScrollSyncLockRef.current === "table") return;
            auditListScrollSyncLockRef.current = "rail";
            tableScroller.scrollLeft = horizontalRail.scrollLeft;
            releaseLock("rail");
        };

        tableScroller.addEventListener("wheel", handleTableWheel, {
            passive: false,
            capture: true,
        });
        horizontalRail.addEventListener("wheel", handleRailWheel, {
            passive: false,
            capture: true,
        });

        tableScroller.addEventListener("scroll", syncFromTable, {passive: true});
        horizontalRail.addEventListener("scroll", syncFromRail, {passive: true});

        horizontalRail.scrollLeft = tableScroller.scrollLeft;

        return () => {
            tableScroller.removeEventListener("wheel", handleTableWheel, true);
            horizontalRail.removeEventListener("wheel", handleRailWheel, true);
            tableScroller.removeEventListener("scroll", syncFromTable);
            horizontalRail.removeEventListener("scroll", syncFromRail);
        };
    }, [auditListHorizontalRailEl, auditListScrollEl]);

    // ── 无限滚动：候选人列表 ──
    useEffect(() => {
        const el = candidateListScrollEl;
        if (!el) return;
        const viewport = el.querySelector("[data-slot='scroll-area-viewport']") as HTMLDivElement | null || el;
        let ticking = false;
        const handleScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                const { scrollTop, scrollHeight, clientHeight } = viewport;
                if (scrollHeight - scrollTop - clientHeight < 200) {
                    void loadMoreCandidates();
                }
            });
        };
        viewport.addEventListener("scroll", handleScroll, { passive: true });
        return () => viewport.removeEventListener("scroll", handleScroll);
    }, [candidateListScrollEl, allCandidates.length, candidateTotal, candidatesLoading]);

    // ── 无限滚动：审计日志列表 ──
    useEffect(() => {
        const el = auditListScrollEl;
        if (!el) return;
        let ticking = false;
        const handleScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                const { scrollTop, scrollHeight, clientHeight } = el;
                if (scrollHeight - scrollTop - clientHeight < 200) {
                    void loadMoreLogs();
                }
            });
        };
        el.addEventListener("scroll", handleScroll, { passive: true });
        return () => el.removeEventListener("scroll", handleScroll);
    }, [auditListScrollEl, allAiLogs.length, aiLogTotal, logsLoading]);

    useEffect(() => {
        function stopCandidateColumnResize() {
            if (!candidateListColumnResizeRef.current) {
                return;
            }
            candidateListColumnResizeRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }

        function handleCandidateColumnResize(event: MouseEvent) {
            const current = candidateListColumnResizeRef.current;
            if (!current) {
                return;
            }
            const nextWidth = clampCandidateListColumnWidth(current.key, current.startWidth + event.clientX - current.startX);
            setCandidateListColumnWidths((prev) => (
                prev[current.key] === nextWidth
                    ? prev
                    : {
                        ...prev,
                        [current.key]: nextWidth,
                    }
            ));
        }

        window.addEventListener("mousemove", handleCandidateColumnResize);
        window.addEventListener("mouseup", stopCandidateColumnResize);
        return () => {
            window.removeEventListener("mousemove", handleCandidateColumnResize);
            window.removeEventListener("mouseup", stopCandidateColumnResize);
            stopCandidateColumnResize();
        };
    }, []);

    function beginCandidateColumnResize(key: CandidateListColumnKey, event: React.MouseEvent<HTMLButtonElement>) {
        event.preventDefault();
        event.stopPropagation();
        candidateListColumnResizeRef.current = {
            key,
            startX: event.clientX,
            startWidth: candidateListColumnWidths[key],
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }

    function resetCandidateColumnWidth(key: CandidateListColumnKey, event: React.MouseEvent<HTMLButtonElement>) {
        event.preventDefault();
        event.stopPropagation();
        setCandidateListColumnWidths((prev) => ({
            ...prev,
            [key]: candidateListColumnDefaultWidths[key],
        }));
    }

    async function applyCandidateMatchSortOrder(nextMatchSortOrder: "" | "asc" | "desc") {
        if (candidateMatchSortLoading || nextMatchSortOrder === candidateMatchSortOrderRef.current) {
            return;
        }
        const previousMatchSortOrder = candidateMatchSortOrderRef.current;
        const requestToken = candidateMatchSortRequestTokenRef.current + 1;
        candidateMatchSortRequestTokenRef.current = requestToken;
        candidateMatchSortOrderRef.current = nextMatchSortOrder;
        setCandidateMatchSortLoading(true);
        setCandidateMatchSortOrder(nextMatchSortOrder);
        scrollCandidateListToTop();

        try {
            await loadCandidates({
                silent: true,
                force: true,
                useVisibleFilters: true,
                query: deferredCandidateQuery,
                matchSortOrder: nextMatchSortOrder,
            });
        } catch (error) {
            if (!mountedRef.current || candidateMatchSortRequestTokenRef.current !== requestToken) {
                return;
            }
            candidateMatchSortOrderRef.current = previousMatchSortOrder;
            setCandidateMatchSortOrder(previousMatchSortOrder);
            candidateListContextKeyRef.current = buildCandidateListContextKey({
                useVisibleFilters: true,
                query: deferredCandidateQuery,
                matchSortOrder: previousMatchSortOrder,
            });
            if (!isRecruitmentRequestAborted(error)) {
                toast.error(
                    isZh
                        ? `匹配度排序失败，已保留原列表：${formatActionError(error)}`
                        : `Failed to sort by match. Kept the previous list: ${formatActionError(error)}`,
                );
            }
        } finally {
            if (mountedRef.current && candidateMatchSortRequestTokenRef.current === requestToken) {
                setCandidateMatchSortLoading(false);
            }
        }
    }

    function renderCandidateListHeaderCell(key: CandidateListColumnKey, label: string) {
        const width = candidateListDisplayColumnWidths[key];
        const isMatchColumn = key === "match";
        const nextMatchSortOrder = (
            candidateMatchSortOrder === ""
                ? "desc"
                : candidateMatchSortOrder === "desc"
                    ? "asc"
                    : ""
        ) as "" | "asc" | "desc";
        return (
            <th
                key={key}
                style={{width, minWidth: width, maxWidth: width}}
                className="text-foreground sticky top-0 z-10 bg-inherit px-2 text-left align-middle font-medium whitespace-nowrap"
            >
                <div className="group relative flex items-center gap-2 pr-3">
                    {isMatchColumn ? (
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left transition hover:bg-slate-100 disabled:cursor-progress disabled:opacity-75 dark:hover:bg-slate-800"
                            onClick={() => void applyCandidateMatchSortOrder(nextMatchSortOrder)}
                            disabled={candidateMatchSortLoading}
                            aria-busy={candidateMatchSortLoading}
                            title={
                                candidateMatchSortLoading
                                    ? (isZh ? "正在按匹配度重新排序" : "Sorting by match")
                                    : candidateMatchSortOrder === ""
                                    ? (isZh ? "按匹配度降序排序" : "Sort by match descending")
                                    : candidateMatchSortOrder === "desc"
                                        ? (isZh ? "切换为匹配度升序" : "Switch to match ascending")
                                        : (isZh ? "取消匹配度排序" : "Clear match sorting")
                            }
                        >
                            <span className="truncate">{label}</span>
                            {candidateMatchSortLoading ? (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-500"/>
                            ) : candidateMatchSortOrder === "desc" ? (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0"/>
                            ) : candidateMatchSortOrder === "asc" ? (
                                <ChevronUp className="h-3.5 w-3.5 shrink-0"/>
                            ) : (
                                <div className="flex shrink-0 flex-col items-center justify-center text-slate-400">
                                    <ChevronUp className="-mb-1 h-3 w-3"/>
                                    <ChevronDown className="-mt-1 h-3 w-3"/>
                                </div>
                            )}
                        </button>
                    ) : (
                        <span className="truncate">{label}</span>
                    )}
                    <button
                        type="button"
                        className="absolute -right-2 top-1/2 h-7 w-3 -translate-y-1/2 cursor-col-resize rounded-full border border-transparent bg-transparent opacity-0 transition hover:border-slate-300 hover:bg-slate-100/90 group-hover:opacity-100 dark:hover:border-slate-600 dark:hover:bg-slate-800/90"
                        onMouseDown={(event) => beginCandidateColumnResize(key, event)}
                        onDoubleClick={(event) => resetCandidateColumnWidth(key, event)}
                        aria-label={isZh ? `调整${label}列宽` : `Resize ${label} column`}
                        title={isZh ? `拖拽调整${label}列宽，双击恢复默认` : `Drag to resize the ${label} column and double-click to reset`}
                    />
                </div>
            </th>
        );
    }

    async function runDedupedRequest<T>(key: string, request: () => Promise<T>) {
        const inflight = requestInflightRef.current.get(key) as Promise<T> | undefined;
        if (inflight) {
            return inflight;
        }
        const pending = request().finally(() => {
            if (requestInflightRef.current.get(key) === pending) {
                requestInflightRef.current.delete(key);
            }
        });
        requestInflightRef.current.set(key, pending as Promise<unknown>);
        return pending;
    }

    async function loadMetadata() {
        try {
            const data = await (async () => {
                if (sharedRecruitmentMetadataCache) {
                    return sharedRecruitmentMetadataCache;
                }
                if (sharedRecruitmentMetadataPromise) {
                    return sharedRecruitmentMetadataPromise;
                }
                const pending = recruitmentApi<RecruitmentMetadata>("/metadata")
                    .then((result) => {
                        sharedRecruitmentMetadataCache = result;
                        return result;
                    })
                    .finally(() => {
                        sharedRecruitmentMetadataPromise = null;
                    });
                sharedRecruitmentMetadataPromise = pending;
                return pending;
            })();
            if (mountedRef.current) {
                setMetadata(data);
            }
            return data;
        } catch (error) {
            toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.baseConfig, formatActionError(error)));
            throw error;
        }
    }

    async function loadOrganizationCatalog() {
        setOrganizationCatalogLoading(true);
        try {
            const data = await (async () => {
                if (sharedOrganizationScopeCache) {
                    return sharedOrganizationScopeCache;
                }
                if (sharedOrganizationScopePromise) {
                    return sharedOrganizationScopePromise;
                }
                const pending = recruitmentApi<RecruitmentOrganizationScope>("/organization-scope")
                    .then((result) => {
                        sharedOrganizationScopeCache = result;
                        return result;
                    })
                    .finally(() => {
                        sharedOrganizationScopePromise = null;
                    });
                sharedOrganizationScopePromise = pending;
                return pending;
            })();
            if (mountedRef.current) {
                setOrganizationCatalog(data.organizations || []);
                setAuthorizedOrgCodes(
                    (data.visible_org_codes && data.visible_org_codes.length)
                        ? data.visible_org_codes.map(normalizeRecruitmentOrgCode)
                        : [normalizeRecruitmentOrgCode(data.primary_org_code || defaultOrgScope)],
                );
                setHasAllOrgScope(Boolean(data.has_all_orgs));
            }
            return data;
        } catch (error) {
            const dataScope = String(sessionUser?.dataScope || "ORG_ONLY").toUpperCase();
            const fallbackOrgCodes = dataScope === "CUSTOM_ORGS" && sessionUser?.customOrgCodes?.length
                ? sessionUser.customOrgCodes.map(normalizeRecruitmentOrgCode)
                : [defaultOrgScope];
            if (mountedRef.current) {
                setOrganizationCatalog([]);
                setAuthorizedOrgCodes(fallbackOrgCodes);
                setHasAllOrgScope(dataScope === "ALL");
            }
            return {
                primary_org_code: defaultOrgScope,
                data_scope: dataScope,
                has_all_orgs: dataScope === "ALL",
                visible_org_codes: fallbackOrgCodes,
                organizations: [],
            } satisfies RecruitmentOrganizationScope;
        } finally {
            setOrganizationCatalogLoading(false);
        }
    }

    async function loadPositions() {
        const requestId = positionsLoadRequestIdRef.current + 1;
        positionsLoadRequestIdRef.current = requestId;
        setPositionsLoading(true);
        try {
            const data = await runDedupedRequest(
                "positions:all",
                () => recruitmentApi<PositionSummary[]>("/positions"),
            );
            if (!mountedRef.current || positionsLoadRequestIdRef.current !== requestId) {
                return data;
            }
            setAllPositions(data);
            return data;
        } catch (error) {
            toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.positions, formatActionError(error)));
            throw error;
        } finally {
            if (mountedRef.current && positionsLoadRequestIdRef.current === requestId) {
                setPositionsLoading(false);
            }
        }
    }

    async function loadPositionDetail(positionId: number) {
        const requestId = positionDetailLoadRequestIdRef.current + 1;
        positionDetailLoadRequestIdRef.current = requestId;
        setPositionDetailLoading(true);
        try {
            const data = await runDedupedRequest(
                `position-detail:${positionId}`,
                () => recruitmentApi<PositionDetail>(`/positions/${positionId}`),
            );
            if (!mountedRef.current || positionDetailLoadRequestIdRef.current !== requestId) {
                return data;
            }
            setPositionDetail(data);
            // 智能默认 Tab：仅首次加载时设置，后续刷新不重置
            if (defaultTabSetForPositionRef.current !== positionId) {
                defaultTabSetForPositionRef.current = positionId;
                setPositionWorkspaceView("candidates");
            }
            return data;
        } catch (error) {
            toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.positionDetail, formatActionError(error)));
            return null;
        } finally {
            if (mountedRef.current && positionDetailLoadRequestIdRef.current === requestId) {
                setPositionDetailLoading(false);
            }
        }
    }

    function resolveScopedOrgCode(departmentScope?: string, orgScope?: string) {
        const normalizedDepartmentScope = String(departmentScope || "").trim();
        if (normalizedDepartmentScope && normalizedDepartmentScope !== ALL_COMPANY_DEPARTMENTS_VALUE) {
            return normalizeRecruitmentOrgCode(normalizedDepartmentScope);
        }
        const normalizedCompanyScope = String(orgScope || "").trim();
        if (normalizedCompanyScope) {
            return normalizeRecruitmentOrgCode(normalizedCompanyScope);
        }
        return "";
    }

    function abortCandidateListRequests() {
        candidateListLoadAbortControllerRef.current?.abort();
        candidateListLoadAbortControllerRef.current = null;
        candidateListLoadMoreAbortControllerRef.current?.abort();
        candidateListLoadMoreAbortControllerRef.current = null;
        Array.from(requestInflightRef.current.keys()).forEach((key) => {
            if (key.startsWith("candidates:first-page:")) {
                requestInflightRef.current.delete(key);
            }
        });
    }

    function buildCandidateListContextKey(options?: {
        departmentScope?: string;
        orgScope?: string;
        query?: string;
        positionFilter?: string[];
        statusFilter?: string[];
        useVisibleFilters?: boolean;
        matchSortOrder?: "" | "asc" | "desc";
    }) {
        return JSON.stringify({
            departmentScope: options?.departmentScope ?? selectedDepartmentScope,
            orgScope: options?.orgScope ?? selectedOrgScope,
            query: String(options?.query ?? deferredCandidateQuery).trim(),
            positionFilter: options?.positionFilter ?? candidatePositionFilter,
            statusFilter: options?.statusFilter ?? candidateStatusFilter,
            useVisibleFilters: options?.useVisibleFilters ?? activePageRef.current === "candidates",
            matchSortOrder: options?.matchSortOrder ?? candidateMatchSortOrder,
        });
    }

    function buildCandidateListQueryString(options?: {
        departmentScope?: string;
        orgScope?: string;
        query?: string;
        positionFilter?: string[];
        statusFilter?: string[];
        useVisibleFilters?: boolean;
        matchSortOrder?: "" | "asc" | "desc";
        limit?: number;
        offset?: number;
    }) {
        const params = new URLSearchParams();
        params.set("limit", String(options?.limit ?? 25));
        params.set("offset", String(options?.offset ?? 0));
        const scopedOrgCode = resolveScopedOrgCode(options?.departmentScope ?? selectedDepartmentScope, options?.orgScope ?? selectedOrgScope);
        if (scopedOrgCode) {
            params.set("org_code", scopedOrgCode);
        }
        const useVisibleFilters = options?.useVisibleFilters ?? activePageRef.current === "candidates";
        if (useVisibleFilters) {
            const normalizedQuery = String(options?.query ?? deferredCandidateQuery).trim();
            const positionId = String((options?.positionFilter ?? candidatePositionFilter)[0] || "").trim();
            const status = String((options?.statusFilter ?? candidateStatusFilter)[0] || "").trim();
            const matchSortOrder = String(options?.matchSortOrder ?? candidateMatchSortOrder).trim().toLowerCase();
            if (normalizedQuery) {
                params.set("query", normalizedQuery);
            }
            if (positionId) {
                params.set("position_id", positionId);
            }
            if (status) {
                params.set("status", status);
            }
            if (matchSortOrder === "asc" || matchSortOrder === "desc") {
                params.set("sort_by", "match_percent");
                params.set("sort_order", matchSortOrder);
            }
        }
        return params.toString();
    }

    async function loadCandidates(options?: {
        silent?: boolean;
        force?: boolean;
        departmentScope?: string;
        orgScope?: string;
        query?: string;
        positionFilter?: string[];
        statusFilter?: string[];
        useVisibleFilters?: boolean;
        matchSortOrder?: "" | "asc" | "desc";
    }) {
        const requestId = candidatesLoadRequestIdRef.current + 1;
        candidatesLoadRequestIdRef.current = requestId;
        if (!options?.silent) {
            setCandidatesLoading(true);
        }
        try {
            const useVisibleFilters = options?.useVisibleFilters ?? activePageRef.current === "candidates";
            const contextKey = buildCandidateListContextKey({
                departmentScope: options?.departmentScope,
                orgScope: options?.orgScope,
                query: options?.query,
                positionFilter: options?.positionFilter,
                statusFilter: options?.statusFilter,
                useVisibleFilters,
                matchSortOrder: options?.matchSortOrder,
            });
            candidateListContextKeyRef.current = contextKey;
            abortCandidateListRequests();
            const controller = new AbortController();
            candidateListLoadAbortControllerRef.current = controller;
            const queryString = buildCandidateListQueryString({
                departmentScope: options?.departmentScope,
                orgScope: options?.orgScope,
                query: options?.query,
                positionFilter: options?.positionFilter,
                statusFilter: options?.statusFilter,
                useVisibleFilters,
                matchSortOrder: options?.matchSortOrder,
            });
            const url = `/candidates?${queryString}`;
            const request = () => recruitmentApi<{items: CandidateSummary[]; total: number}>(url, {
                signal: controller.signal,
                timeoutMs: 45000,
            });
            const result = options?.force
                ? await request()
                : await runDedupedRequest(
                    `candidates:first-page:${queryString}`,
                    request,
                );
            if (
                !mountedRef.current
                || candidatesLoadRequestIdRef.current !== requestId
                || candidateListContextKeyRef.current !== contextKey
            ) {
                return result?.items || [];
            }
            candidateListUsingVisibleFiltersRef.current = useVisibleFilters;
            setAllCandidates(deduplicateCandidates(result?.items || []));
            setCandidateTotal(result?.total || 0);
            setCandidatesInitialLoaded(true);
            return result?.items || [];
        } catch (error) {
            if (isRecruitmentRequestAborted(error)) {
                return [];
            }
            if (!options?.silent) {
                toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.candidates, formatActionError(error)));
            }
            throw error;
        } finally {
            if (
                candidateListLoadAbortControllerRef.current
                && candidateListLoadAbortControllerRef.current.signal.aborted
            ) {
                candidateListLoadAbortControllerRef.current = null;
            } else if (mountedRef.current && candidatesLoadRequestIdRef.current === requestId) {
                candidateListLoadAbortControllerRef.current = null;
            }
            if (!options?.silent && mountedRef.current && candidatesLoadRequestIdRef.current === requestId) {
                setCandidatesLoading(false);
            }
        }
    }

    async function refreshCandidatesManually() {
        await loadCandidates({ force: true, useVisibleFilters: true });
        scrollCandidateListToTop();
        toast.success(
            isZh
                ? "已刷新，显示当前筛选结果的最新前 25 条"
                : "Refreshed. Showing the latest 25 rows for the current filters.",
        );
    }

    const loadingMoreCandidatesRef = useRef(false);
    async function loadMoreCandidates() {
        if (candidatesLoading || candidateMatchSortLoading || loadingMoreCandidatesRef.current || allCandidates.length >= candidateTotal) return;
        loadingMoreCandidatesRef.current = true;
        setIsLoadingMoreCandidates(true);
        try {
            const offset = allCandidates.length;
            const contextKey = candidateListContextKeyRef.current;
            candidateListLoadMoreAbortControllerRef.current?.abort();
            const controller = new AbortController();
            candidateListLoadMoreAbortControllerRef.current = controller;
            const queryString = buildCandidateListQueryString({
                offset,
                useVisibleFilters: candidateListUsingVisibleFiltersRef.current,
                matchSortOrder: candidateMatchSortOrderRef.current,
            });
            const data = await recruitmentApi<{items: CandidateSummary[]; total: number}>(`/candidates?${queryString}`, {
                signal: controller.signal,
                timeoutMs: 45000,
            });
            if (mountedRef.current && candidateListContextKeyRef.current === contextKey) {
                setAllCandidates(prev => deduplicateCandidates([...prev, ...(data?.items || [])]));
                setCandidateTotal(data?.total || 0);
            }
        } catch (error) {
            if (isRecruitmentRequestAborted(error)) {
                return;
            }
            console.error("Failed to load more candidates:", error);
        } finally {
            loadingMoreCandidatesRef.current = false;
            candidateListLoadMoreAbortControllerRef.current = null;
            setIsLoadingMoreCandidates(false);
        }
    }

    async function loadTalentPoolCandidates(options?: { departmentScope?: string; orgScope?: string; silent?: boolean }) {
        if (!options?.silent) {
            setTalentPoolLoading(true);
        }
        try {
            const scopedOrgCode = resolveScopedOrgCode(options?.departmentScope ?? selectedDepartmentScope, options?.orgScope ?? selectedOrgScope);
            const orgCodeParam = scopedOrgCode ? `?org_code=${encodeURIComponent(scopedOrgCode)}` : "";
            const data = await recruitmentApi<CandidateSummary[]>(`/candidates/talent-pool${orgCodeParam}`, {
                timeoutMs: 45000,
            });
            if (mountedRef.current) {
                setAllTalentPoolCandidates(data || []);
            }
            return data || [];
        } catch (error) {
            console.error("Failed to load talent pool candidates:", error);
            if (!options?.silent) {
                toast.error(isZh ? "加载人才库失败" : "Failed to load talent pool");
            }
            return [];
        } finally {
            if (!options?.silent && mountedRef.current) {
                setTalentPoolLoading(false);
            }
        }
    }

    async function loadCandidateDetail(
        candidateId: number,
        options?: { silent?: boolean; force?: boolean; includeDuplicates?: boolean; skipChatContextSave?: boolean },
    ) {
        if (!options?.silent) {
            setCandidateDetailLoading(true);
        }
        try {
            const request = () => recruitmentApi<CandidateDetail>(`/candidates/${candidateId}`);
            const data = options?.force
                ? await request()
                : await runDedupedRequest(
                    `candidate-detail:${candidateId}:${options?.silent ? "silent" : "full"}`,
                    request,
                );
            const recentCompletedAt = recentlyCompletedScreeningCandidatesRef.current.get(candidateId);
            const shouldSanitizeRecentTerminalScreening = Boolean(
                recentCompletedAt
                && Date.now() - recentCompletedAt < 15_000
                && (
                    isLiveTaskStatus(data?.candidate?.active_screening_task_status)
                    || data?.candidate?.display_status === "screening_running"
                ),
            );
            const normalizedData = shouldSanitizeRecentTerminalScreening
                ? {
                    ...data,
                    candidate: (sanitizeTerminalScreeningCandidateSnapshot(data.candidate, "success") || data.candidate) as CandidateSummary,
                }
                : data;
            if (!isLiveTaskStatus(normalizedData?.candidate?.active_screening_task_status)) {
                recentlyCompletedScreeningCandidatesRef.current.delete(candidateId);
            }
            if (!mountedRef.current || selectedCandidateIdRef.current !== candidateId) {
                return normalizedData;
            }
            setCandidateDetail(normalizedData);
            if (!options?.skipChatContextSave) {
                const nextPositionId = normalizedData.candidate.position_id ?? null;
                if (
                    normalizedData.candidate.id !== (chatContext.candidate_id ?? null)
                    || nextPositionId !== (chatContext.position_id ?? null)
                ) {
                    void saveChatContext(nextPositionId, chatContext.skill_ids, normalizedData.candidate.id, {quiet: true});
                }
            }
            if (options?.includeDuplicates) {
                void checkDuplicatesForCandidate(normalizedData);
            }
            return normalizedData;
        } catch (error) {
            if (!options?.silent) {
                toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.candidateDetail, formatActionError(error)));
            }
            return null;
        } finally {
            if (!options?.silent) {
                setCandidateDetailLoading(false);
            }
        }
    }

    async function checkDuplicatesForCandidate(candidate: CandidateDetail | null) {
        if (!candidate?.candidate) {
            setDuplicateCandidates([]);
            return;
        }
        const phone = candidate.candidate.phone?.trim();
        const email = candidate.candidate.email?.trim();
        if (!phone && !email) {
            setDuplicateCandidates([]);
            return;
        }
        try {
            const params = new URLSearchParams();
            if (phone) params.set("phone", phone);
            if (email) params.set("email", email);
            params.set("exclude_candidate_id", String(candidate.candidate.id));
            const data = await recruitmentApi<Array<{id: number; candidate_code: string; name: string; phone: string | null; email: string | null; status: string}>>(`/candidates/check-duplicates?${params.toString()}`);
            if (mountedRef.current) {
                setDuplicateCandidates(data);
            }
        } catch {
            if (mountedRef.current) {
                setDuplicateCandidates([]);
            }
        }
    }

    async function loadLogs(options?: { silent?: boolean; departmentScope?: string; orgScope?: string }) {
        if (!options?.silent) {
            setLogsLoading(true);
        }
        try {
            const taskTypeParam = logTaskTypeFilter !== "all"
                ? `&task_type=${encodeURIComponent(logTaskTypeFilter)}`
                : "";
            const statusParam = logStatusFilter !== "all"
                ? `&status=${encodeURIComponent(logStatusFilter)}`
                : "";
            const scopedOrgCode = resolveScopedOrgCode(options?.departmentScope ?? selectedDepartmentScope, options?.orgScope ?? selectedOrgScope);
            const orgCodeParam = scopedOrgCode ? `&org_code=${encodeURIComponent(scopedOrgCode)}` : "";
            const dedupKey = `logs:${options?.silent ? "silent" : "full"}:${logTaskTypeFilter}:${logStatusFilter}${scopedOrgCode ? `:${scopedOrgCode}` : ""}`;
            const data = await runDedupedRequest(
                dedupKey,
                () => recruitmentApi<{items: AITaskLog[]; total: number}>(
                    `/ai-task-logs?limit=20&offset=0${taskTypeParam}${statusParam}${orgCodeParam}`
                ),
            );
            if (mountedRef.current) {
                setAllAiLogs(data?.items || []);
                setAiLogTotal(data?.total || 0);
            }
            return data?.items || [];
        } catch (error) {
            if (!options?.silent) {
                toast.error(
                    recruitmentToast.loadFailed(recruitmentToastEntities.aiTasks, formatActionError(error))
                );
            }
            throw error;
        } finally {
            if (!options?.silent) {
                setLogsLoading(false);
            }
        }
    }

    const loadingMoreLogsRef = useRef(false);
    async function loadMoreLogs() {
        if (logsLoading || loadingMoreLogsRef.current || allAiLogs.length >= aiLogTotal) return;
        loadingMoreLogsRef.current = true;
        try {
            const offset = allAiLogs.length;
            const taskTypeParam = logTaskTypeFilter !== "all"
                ? `&task_type=${encodeURIComponent(logTaskTypeFilter)}`
                : "";
            const statusParam = logStatusFilter !== "all"
                ? `&status=${encodeURIComponent(logStatusFilter)}`
                : "";
            const scopedOrgCode = resolveScopedOrgCode(selectedDepartmentScope, selectedOrgScope);
            const orgCodeParam = scopedOrgCode ? `&org_code=${encodeURIComponent(scopedOrgCode)}` : "";
            const data = await recruitmentApi<{items: AITaskLog[]; total: number}>(
                `/ai-task-logs?limit=20&offset=${offset}${taskTypeParam}${statusParam}${orgCodeParam}`
            );
            if (mountedRef.current) {
                setAllAiLogs(prev => [...prev, ...(data?.items || [])]);
                setAiLogTotal(data?.total || 0);
            }
        } catch (error) {
            console.error("Failed to load more logs:", error);
        } finally {
            loadingMoreLogsRef.current = false;
        }
    }

    async function loadLogDetail(taskId: number, options?: { silent?: boolean }) {
        if (!options?.silent) {
            setLogDetailLoading(true);
        }
        try {
            const data = await runDedupedRequest(
                `log-detail:${taskId}:${options?.silent ? "silent" : "full"}`,
                () => recruitmentApi<AITaskLog>(`/ai-task-logs/${taskId}`),
            );
            if (mountedRef.current && selectedLogIdRef.current === taskId) {
                setSelectedLogDetail(data);
            }
            return data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!options?.silent) {
                toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.taskDetail, formatActionError(error)));
            }
            if (errorMessage.includes("404") || errorMessage.includes("Not Found")) {
                if (mountedRef.current && selectedLogIdRef.current === taskId) {
                    setSelectedLogId(null);
                    setSelectedLogDetail(null);
                }
            }
            return null;
        } finally {
            if (!options?.silent) {
                setLogDetailLoading(false);
            }
        }
    }

    async function loadSkills() {
        setSkillsLoading(true);
        try {
            const data = await runDedupedRequest("skills", () => recruitmentApi<RecruitmentSkill[]>("/skills"));
            if (mountedRef.current) {
                setAllSkills(data);
            }
            skillsLoadedOnceRef.current = true;
            return data;
        } catch (error) {
            toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.skills, formatActionError(error)));
            throw error;
        } finally {
            setSkillsLoading(false);
        }
    }

    async function loadLLMConfigs() {
        if (!canManageLLMConfig) {
            return [];
        }
        setModelsLoading(true);
        try {
            const data = await runDedupedRequest("llm-configs", () => recruitmentApi<RecruitmentLLMConfig[]>("/llm-configs"));
            if (mountedRef.current) {
                setAllLlmConfigs(data);
            }
            llmConfigsLoadedOnceRef.current = true;
            return data;
        } catch (error) {
            toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.modelConfigs, formatActionError(error)));
            throw error;
        } finally {
            setModelsLoading(false);
        }
    }

    async function loadChatContext() {
        try {
            const data = await runDedupedRequest("chat-context", () => recruitmentApi<ChatContext>("/chat/context"));
            if (mountedRef.current) {
                setChatContext(data);
            }
            return data;
        } catch (error) {
            toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.assistantContext, formatActionError(error)));
            throw error;
        }
    }

    async function loadMailSettings() {
        setMailSettingsLoading(true);
        try {
            const {senders, recipients, dispatches, autoPushConfig} = await runDedupedRequest("mail-settings", async () => {
                const [nextSenders, nextRecipients, nextDispatches, nextAutoPushConfig] = await Promise.all([
                    recruitmentApi<RecruitmentMailSenderConfig[]>("/mail-senders"),
                    recruitmentApi<RecruitmentMailRecipient[]>("/mail-recipients"),
                    recruitmentApi<RecruitmentResumeMailDispatch[]>("/resume-mail-dispatches"),
                    recruitmentApi<RecruitmentMailAutoPushGlobalConfig>("/mail-auto-config"),
                ]);
                return {
                    senders: nextSenders,
                    recipients: nextRecipients,
                    dispatches: nextDispatches,
                    autoPushConfig: nextAutoPushConfig,
                };
            });
            if (mountedRef.current) {
                setAllMailSenderConfigs(senders);
                setAllMailRecipients(recipients);
                setAllResumeMailDispatches(dispatches);
                setMailAutoPushGlobalConfig(autoPushConfig);
            }
            mailSettingsLoadedOnceRef.current = true;
            return {senders, recipients, dispatches, autoPushConfig};
        } catch (error) {
            toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.mailSettings, formatActionError(error)));
            throw error;
        } finally {
            setMailSettingsLoading(false);
        }
    }

    async function ensureSkillsLoaded(options?: { force?: boolean }) {
        if (!options?.force && skillsLoadedOnceRef.current) {
            return allSkills;
        }
        const data = await loadSkills();
        skillsLoadedOnceRef.current = true;
        return data;
    }

    async function ensureMailSettingsLoaded(options?: { force?: boolean }) {
        if (!options?.force && mailSettingsLoadedOnceRef.current) {
            return {
                senders: allMailSenderConfigs,
                recipients: allMailRecipients,
                dispatches: allResumeMailDispatches,
                autoPushConfig: mailAutoPushGlobalConfig,
            };
        }
        const data = await loadMailSettings();
        mailSettingsLoadedOnceRef.current = true;
        return data;
    }

    async function ensureLLMConfigsLoaded(options?: { force?: boolean }) {
        if (!options?.force && llmConfigsLoadedOnceRef.current) {
            return allLlmConfigs;
        }
        const data = await loadLLMConfigs();
        llmConfigsLoadedOnceRef.current = true;
        return data;
    }

    async function saveMailAutoPushGlobalConfig(nextConfig: RecruitmentMailAutoPushGlobalConfig) {
        if (mailAutoPushConfigSaving) {
            return;
        }
        setMailAutoPushConfigSaving(true);
        try {
            const saved = await recruitmentApi<RecruitmentMailAutoPushGlobalConfig>("/mail-auto-config", {
                method: "PATCH",
                body: JSON.stringify({
                    global_default_recipient_ids: nextConfig.global_default_recipient_ids,
                    global_auto_push_enabled: nextConfig.global_auto_push_enabled,
                }),
            });
            setMailAutoPushGlobalConfig(saved);
            toast.success(recruitmentToast.saved(recruitmentToastEntities.globalAutoPushConfig));
        } catch (error) {
            toast.error(recruitmentToast.saveFailed(recruitmentToastEntities.globalAutoPushConfig, formatActionError(error)));
        } finally {
            setMailAutoPushConfigSaving(false);
        }
    }

    async function refreshCandidateStats(departmentScope?: string, orgScope?: string) {
        try {
            const scopedOrgCode = resolveScopedOrgCode(departmentScope ?? selectedDepartmentScope, orgScope ?? selectedOrgScope);
            const orgCodeParam = scopedOrgCode ? `?org_code=${encodeURIComponent(scopedOrgCode)}` : "";
            const f = await recruitmentApi<import("@/lib/recruitment-api").RecruitmentFunnelData>(`/candidates/funnel${orgCodeParam}`);
            setFunnelData(f);
        } catch {}
        try {
            const scopedOrgCode = resolveScopedOrgCode(departmentScope ?? selectedDepartmentScope, orgScope ?? selectedOrgScope);
            const orgCodeParam = scopedOrgCode ? `?org_code=${encodeURIComponent(scopedOrgCode)}` : "";
            const s = await recruitmentApi<import("@/lib/recruitment-api").SourceStatsData>(`/candidates/source-stats${orgCodeParam}`);
            setSourceStatsData(s);
        } catch {}
    }

    async function refreshCoreData(options?: { includeMailSettings?: boolean; silent?: boolean; departmentScope?: string; orgScope?: string }) {
        // 清除缓存，确保获取最新数据
        invalidatePositionsCache('positions:all');
        invalidateCandidatesCache('candidates:all');
        invalidateLogsCache('logs:all');

        const deptScope = options?.departmentScope ?? selectedDepartmentScope;
        const companyScope = (options as any)?.orgScope ?? selectedOrgScope;

        // 直接调用 API，避免闭包中 selectedDepartmentScope 还是旧值的问题
        const candidatesPromise = loadCandidates({
            silent: true,
            force: true,
            departmentScope: deptScope,
            orgScope: companyScope,
            useVisibleFilters: activePage === "candidates",
        });

        const logsPromise = (async () => {
            const orgCodeParam = deptScope !== ALL_COMPANY_DEPARTMENTS_VALUE
                ? `org_code=${encodeURIComponent(deptScope)}`
                : companyScope
                    ? `org_code=${encodeURIComponent(companyScope)}`
                    : "";
            const url = orgCodeParam ? `/ai-task-logs?limit=20&offset=0&${orgCodeParam}` : "/ai-task-logs?limit=20&offset=0";
            const d = await recruitmentApi<{items: AITaskLog[]; total: number}>(url);
            setAllAiLogs(d?.items || []);
            setAiLogTotal(d?.total || 0);
        })();

        const tasks: Promise<unknown>[] = [
            loadPositions(),
            candidatesPromise,
            logsPromise,
            // 并行刷新漏斗/来源统计
            (async () => {
                const orgCodeParam = deptScope !== ALL_COMPANY_DEPARTMENTS_VALUE
                    ? `?org_code=${encodeURIComponent(deptScope)}`
                    : companyScope
                        ? `?org_code=${encodeURIComponent(companyScope)}`
                        : "";
                const f = await recruitmentApi<import("@/lib/recruitment-api").RecruitmentFunnelData>(`/candidates/funnel${orgCodeParam}`);
                setFunnelData(f);
            })(),
            (async () => {
                const orgCodeParam = deptScope !== ALL_COMPANY_DEPARTMENTS_VALUE
                    ? `?org_code=${encodeURIComponent(deptScope)}`
                    : companyScope
                        ? `?org_code=${encodeURIComponent(companyScope)}`
                        : "";
                const s = await recruitmentApi<import("@/lib/recruitment-api").SourceStatsData>(`/candidates/source-stats${orgCodeParam}`);
                setSourceStatsData(s);
            })(),
        ];
        if (options?.includeMailSettings) {
            tasks.push(loadMailSettings());
        }
        await Promise.allSettled(tasks);

        // 静默刷新时不显示 toast
        if (!options?.silent) {
            toast.success(recruitmentToast.dataRefreshed);
        }
    }

    async function refreshLLMConfigsWithFeedback() {
        if (modelsLoading) {
            return;
        }
        try {
            await loadLLMConfigs();
            toast.success(recruitmentToast.refreshed(recruitmentToastEntities.modelConfigs));
        } catch {
            // loadLLMConfigs already reports the error toast
        }
    }

    async function refreshMailSettingsWithFeedback() {
        if (mailSettingsLoading) {
            return;
        }
        try {
            await loadMailSettings();
            toast.success(recruitmentToast.refreshed(recruitmentToastEntities.mailSettings));
        } catch {
            // loadMailSettings already reports the error toast
        }
    }

    async function refreshLogsWithFeedback() {
        if (logsLoading) {
            return;
        }
        try {
            await loadLogs();
            toast.success(recruitmentToast.refreshed(recruitmentToastEntities.taskLogs));
        } catch {
            // loadLogs already reports the error toast
        }
    }

    function navigateToSettingsPage(page: Extract<RecruitmentPage, "settings-skills" | "settings-models" | "settings-mail">) {
        setSettingsPopoverOpen(false);
        navigateToRecruitmentPage(page);
    }

    function openTaskLogDetail(logId?: number | null) {
        if (!logId) {
            return;
        }
        navigateToRecruitmentPage("audit");
        setSelectedLogId(logId);
    }

    function flushPendingLogUpdates() {
        const updates = pendingLogUpdatesRef.current;
        pendingLogUpdatesRef.current = [];
        logFlushRafRef.current = null;
        if (!updates.length) return;

        setCancellingTaskIds((current) => {
            let next = current;
            for (const log of updates) {
                if (log.status === "cancelling") {
                    if (!next.includes(log.id)) next = [...next, log.id];
                } else {
                    next = next.filter((item) => item !== log.id);
                }
            }
            return next;
        });

        setAllAiLogs((current) => {
            let changed = false;
            const next = [...current];
            for (const log of updates) {
                const index = next.findIndex((item) => item.id === log.id);
                if (index === -1) {
                    next.unshift(log);
                    changed = true;
                } else {
                    const existing = next[index];
                    if (existing.status !== log.status || existing.error_message !== log.error_message) {
                        next[index] = log;
                        changed = true;
                    }
                }
            }
            return changed ? next : current;
        });
    }

    function mergeAiTaskLog(log: AITaskLog) {
        pendingLogUpdatesRef.current.push(log);
        if (!logFlushRafRef.current) {
            logFlushRafRef.current = requestAnimationFrame(flushPendingLogUpdates);
        }
    }

    function stopTaskMonitor(taskId: number) {
        const timerId = taskMonitorTimersRef.current.get(taskId);
        if (timerId) {
            window.clearTimeout(timerId);
        }
        taskMonitorTimersRef.current.delete(taskId);
        taskMonitorTokensRef.current.delete(taskId);
    }

    function clearActiveScreeningTask(candidateId: number, taskId: number) {
        setActiveScreeningTaskMap((current) => {
            if (current[candidateId] !== taskId) {
                return current;
            }
            const next = {...current};
            delete next[candidateId];
            return next;
        });
        setActiveBatchScreeningTaskIds((current) => (
            current.includes(taskId)
                ? current.filter((item) => item !== taskId)
                : current
        ));
    }

    function clearScreeningTaskSnapshotsByTaskIds(taskIds: number[]) {
        if (!taskIds.length) {
            return;
        }
        const taskIdSet = new Set(taskIds);
        setAllCandidates((current) => {
            let changed = false;
            const next = current.map((candidate) => {
                const taskId = Number(candidate.active_screening_task_id || 0);
                if (!taskId || !taskIdSet.has(taskId)) {
                    return candidate;
                }
                const sanitized = sanitizeTerminalScreeningCandidateSnapshot(candidate, "cancelled");
                if (!sanitized) {
                    return candidate;
                }
                changed = true;
                return mergeCandidatePatch(candidate, sanitized);
            });
            return changed ? next : current;
        });
        if (
            candidateDetail?.candidate.active_screening_task_id
            && taskIdSet.has(candidateDetail.candidate.active_screening_task_id)
        ) {
            const sanitized = sanitizeTerminalScreeningCandidateSnapshot(candidateDetail.candidate, "cancelled");
            if (sanitized) {
                applyCandidateDetailSnapshot(sanitized);
            }
        }
    }

    function attachScreeningTaskMonitor(
        candidateId: number,
        taskId: number,
        options?: {
            batch?: boolean;
            suppressFinishToast?: boolean;
        },
    ) {
        setActiveScreeningTaskMap((current) => ({
            ...current,
            [candidateId]: taskId,
        }));
        if (options?.batch) {
            setActiveBatchScreeningTaskIds((current) => Array.from(new Set([...current, taskId])));
        }
        const queuedScreeningSnapshot: Partial<CandidateSummary> = {
            id: candidateId,
            active_screening_task_id: taskId,
            active_screening_task_type: "screening_flow",
            active_screening_task_status: "queued",
            active_screening_status: "queued",
            active_screening_stage: "queued",
            active_screening_auto_retry_scheduled: false,
            display_status_reason: "",
        };
        // Optimistic update: immediately set active_screening_task_status on the candidate
        // so the left list shows "screening_running" without waiting for server refresh
        setAllCandidates((current) => current.map((candidate) => (
            candidate.id === candidateId
                ? { ...candidate, ...queuedScreeningSnapshot }
                : candidate
        )));
        applyCandidateDetailSnapshot(queuedScreeningSnapshot);
        if (options?.batch) {
            // Batch tasks: skip startTaskMonitor polling, rely on SSE events
            // (task_completed / batch_summary) to drive UI updates instead of
            // N independent HTTP poll loops.
        }
    }

    useEffect(() => {
        const liveIds = new Set<number>();
        candidates.forEach((candidate) => {
            if (!candidate.active_screening_task_id || !candidate.active_screening_task_status || !isLiveTaskStatus(candidate.active_screening_task_status)) {
                return;
            }
            liveIds.add(candidate.id);
            if (taskMonitorTokensRef.current.has(candidate.active_screening_task_id)) {
                return;
            }
            if (activeScreeningTaskMap[candidate.id] === candidate.active_screening_task_id) {
                return;
            }
            attachScreeningTaskMonitor(candidate.id, candidate.active_screening_task_id, {
                batch: true,
                suppressFinishToast: true,
            });
        });
        // Clean up stale entries: candidates whose tasks are no longer live
        setActiveScreeningTaskMap((current) => {
            const staleIds = Object.keys(current)
                .map(Number)
                .filter((id) => !liveIds.has(id));
            if (staleIds.length === 0) return current;
            const next = { ...current };
            staleIds.forEach((id) => {
                const staleTaskId = next[id];
                delete next[id];
                if (staleTaskId) {
                    setActiveBatchScreeningTaskIds((batch) => batch.filter((taskId) => taskId !== staleTaskId));
                }
            });
            return next;
        });
    }, [candidates]);

    function updateChatMessage(messageId: string, updater: (message: ChatMessage) => ChatMessage) {
        setChatMessages((current) => current.map((message) => (
            message.id === messageId ? updater(message) : message
        )));
    }

    function isAssistantViewportNearBottom(viewport: HTMLDivElement, threshold = 96) {
        const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
        return distanceFromBottom <= threshold;
    }

    const scrollAssistantToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
        const viewport = assistantScrollAreaRef.current;
        if (!viewport) {
            return;
        }
        setAutoFollowStream(true);
        setIsUserScrolledUp(false);
        window.requestAnimationFrame(() => {
            viewport.scrollTo({
                top: viewport.scrollHeight,
                behavior,
            });
        });
    }, []);

    const handleAssistantScroll = useCallback(() => {
        const viewport = assistantScrollAreaRef.current;
        if (!viewport) {
            return;
        }
        const nearBottom = isAssistantViewportNearBottom(viewport);
        setAutoFollowStream((current) => (current === nearBottom ? current : nearBottom));
        setIsUserScrolledUp((current) => (current === !nearBottom ? current : !nearBottom));
    }, []);

    function extractChatReplyFromLog(log: AITaskLog) {
        const parsed = parseStructuredLogOutput(log.output_snapshot);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const reply = (parsed as Record<string, unknown>).reply;
            if (typeof reply === "string" && reply.trim()) {
                return reply.trim();
            }
        }
        if (typeof parsed === "string" && parsed.trim()) {
            return parsed.trim();
        }
        if (log.status === "cancelled") {
            return isZh ? "已停止生成。" : "Generation stopped.";
        }
        if (log.status === "failed") {
            return isZh ? `发送失败：${log.error_message || "未知错误"}` : `Request failed: ${log.error_message || "Unknown error"}`;
        }
        return log.output_summary || (isZh ? "已完成" : "Completed");
    }

    async function cancelTaskGeneration(taskId: number, taskLabel: string, options?: { silent?: boolean }) {
        if (cancellingTaskIds.includes(taskId)) {
            return null;
        }
        setCancellingTaskIds((current) => (current.includes(taskId) ? current : [...current, taskId]));
        try {
            const log = await recruitmentApi<AITaskLog>(`/ai-task-logs/${taskId}/cancel`, {
                method: "POST",
            });
            mergeAiTaskLog(log);
            if (selectedLogIdRef.current === taskId) {
                setSelectedLogDetail(log);
            }
            if (!options?.silent) {
                toast.success(
                    log.status === "cancelled"
                        ? recruitmentToast.stopped(taskLabel)
                        : recruitmentToast.stopRequested(taskLabel),
                );
            }
            return log;
        } catch (error) {
            setCancellingTaskIds((current) => current.filter((item) => item !== taskId));
            throw error;
        }
    }

    function startTaskMonitor(
        taskId: number,
        {
            onUpdate,
            onFinish,
        }: {
            onUpdate?: (log: AITaskLog) => void;
            onFinish?: (log: AITaskLog) => Promise<void> | void;
        },
    ) {
        stopTaskMonitor(taskId);
        let polling = false;
        let failureCount = 0;
        const token = Symbol(`task-monitor-${taskId}`);
        taskMonitorTokensRef.current.set(taskId, token);

        const scheduleNextPoll = (delay: number) => {
            if (!mountedRef.current || taskMonitorTokensRef.current.get(taskId) !== token) {
                return;
            }
            const timerId = window.setTimeout(() => {
                void poll();
            }, delay);
            taskMonitorTimersRef.current.set(taskId, timerId);
        };

        const poll = async () => {
            if (polling || !mountedRef.current || taskMonitorTokensRef.current.get(taskId) !== token) {
                return;
            }
            polling = true;
            try {
                const log = await recruitmentApi<AITaskLog>(`/ai-task-logs/${taskId}`);
                if (!mountedRef.current || taskMonitorTokensRef.current.get(taskId) !== token) {
                    return;
                }
                failureCount = 0;
                mergeAiTaskLog(log);
                if (selectedLogIdRef.current === taskId) {
                    setSelectedLogDetail(log);
                }
                onUpdate?.(log);
                if (isTerminalTaskStatus(log.status)) {
                    stopTaskMonitor(taskId);
                    await onFinish?.(log);
                    return;
                }
            } catch {
                failureCount = Math.min(failureCount + 1, 3);
            } finally {
                polling = false;
                if (mountedRef.current && taskMonitorTokensRef.current.get(taskId) === token) {
                    const activeCount = taskMonitorTimersRef.current.size;
                    const batchScale = activeCount > TASK_MONITOR_BATCH_SCALE_THRESHOLD
                        ? Math.min(3, 1 + Math.floor(activeCount / TASK_MONITOR_BATCH_SCALE_THRESHOLD))
                        : 1;
                    scheduleNextPoll(getPollingDelay(
                        pageVisibleRef.current,
                        failureCount,
                        TASK_MONITOR_VISIBLE_INTERVAL_MS * batchScale,
                        TASK_MONITOR_HIDDEN_INTERVAL_MS,
                        TASK_MONITOR_MAX_INTERVAL_MS,
                    ));
                }
            }
        };

        void poll();
    }

    function openAssistantMode(mode: AssistantDisplayMode) {
        setAssistantContextExpanded(false);
        setAssistantQuickActionsExpanded(false);
        if (mode === "page") {
            setAssistantOpen(false);
            setAssistantDisplayMode("page");
            navigateToRecruitmentPage("assistant");
            return;
        }
        setAssistantDisplayMode(mode);
        setAssistantOpen(true);
    }

    function focusAssistantInput(moveCursorToEnd = false) {
        const input = assistantInputRef.current;
        if (!input) {
            return;
        }
        input.focus({preventScroll: true});
        if (moveCursorToEnd) {
            const length = input.value.length;
            input.setSelectionRange(length, length);
        }
    }

    function queueAssistantInputFocus(moveCursorToEnd = false) {
        window.requestAnimationFrame(() => {
            focusAssistantInput(moveCursorToEnd);
        });
    }

    function preventAssistantActionFocusLoss(event: React.MouseEvent<HTMLElement>) {
        event.preventDefault();
    }

    function applyAssistantPrompt(prompt: string, options?: { openMode?: AssistantDisplayMode }) {
        setChatInput(prompt);
        if (options?.openMode) {
            openAssistantMode(options.openMode);
        }
        queueAssistantInputFocus(true);
    }

    function shouldUseStreamingAssistant(
        message: string,
        clarificationResponse?: RecruitmentAssistantClarificationResponse | null,
    ) {
        return Boolean(clarificationResponse?.selections?.length || message.trim());
    }

    function getLatestAssistantQueryCursor() {
        for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
            const cursor = chatMessages[index]?.queryPageInfo?.next_cursor;
            if (cursor) {
                return cursor;
            }
        }
        return null;
    }

    function buildStreamingAssistantRuntimeContext(message: string) {
        const currentChatContext = chatContextRef.current;
        const selectedPosition = selectedPositionIdRef.current
            ? positionMap.get(selectedPositionIdRef.current) || null
            : null;
        const selectedCandidate = selectedCandidateIdRef.current
            ? candidateMap.get(selectedCandidateIdRef.current) || null
            : null;
        const wantsCurrentPosition = /当前岗位|当前职位|本岗位|该岗位/.test(message);
        const wantsCurrentCandidate = /当前候选人|当前人选|这位候选人|这个候选人|面试题|初试题|复试题|出题|生成题/.test(message);
        const contextPositionId = currentChatContext.position_id
            || (wantsCurrentPosition ? selectedPositionIdRef.current : null)
            || null;
        const resolvedPosition = contextPositionId ? positionMap.get(contextPositionId) || null : null;

        return {
            position_id: contextPositionId,
            position_title: resolvedPosition?.title
                || currentChatContext.position_title
                || (wantsCurrentPosition ? selectedPosition?.title || null : null),
            candidate_id: currentChatContext.candidate_id
                || (wantsCurrentCandidate ? selectedCandidateIdRef.current : null)
                || null,
            skill_ids: currentChatContext.skill_ids,
        };
    }

    function extractPreparedResumeMail(
        payload: RecruitmentAssistantToolResultPayload,
    ): RecruitmentAssistantPreparedResumeMail | null {
        if (payload.name !== "prepare_resume_mail") {
            return null;
        }
        const payloadRecord = payload.result && typeof payload.result === "object"
            ? payload.result as Record<string, unknown>
            : null;
        const preparedMail = payloadRecord?.prepared_mail;
        if (!preparedMail || typeof preparedMail !== "object") {
            return null;
        }
        return preparedMail as RecruitmentAssistantPreparedResumeMail;
    }

    function openAssistantPreparedResumeMailDialog(
        messageId: string,
        preparedMail: RecruitmentAssistantPreparedResumeMail,
        mode: ResumeMailDialogMode = "send",
    ) {
        setAssistantMailActionState((current) => ({
            ...current,
            [messageId]: {
                status: current[messageId]?.status === "sent" ? "sent" : "idle",
                editing: true,
                error: current[messageId]?.error ?? null,
                dispatchId: current[messageId]?.dispatchId ?? null,
            },
        }));
        setResumeMailSourceAssistantMessageId(messageId);
        openResumeMailDialog(preparedMail.candidate_ids, {
            mode,
            senderConfigId: preparedMail.sender_config_id ? String(preparedMail.sender_config_id) : defaultMailSenderId,
            recipientIds: preparedMail.recipient_ids,
            extraRecipientEmails: preparedMail.recipients
                .filter((item) => item.source === "direct_email")
                .map((item) => item.email)
                .join(", "),
            subject: preparedMail.subject,
            bodyText: preparedMail.body_text,
        });
    }

    async function runStreamingAssistant(
        message: string,
        options?: {
            clarificationResponse?: RecruitmentAssistantClarificationResponse | null;
            appendUserMessage?: boolean;
        },
    ) {
        const trimmedMessage = message.trim();
        if (!trimmedMessage) {
            return;
        }

        if (options?.appendUserMessage !== false) {
            setChatMessages((current) => [
                ...current,
                {id: `u-${Date.now()}`, role: "user", content: trimmedMessage, createdAt: new Date().toISOString()},
            ]);
        }
        setChatInput("");
        setChatSending(true);
        setAssistantStreamStopping(false);
        setCurrentAssistantRunId(null);
        setAutoFollowStream(true);
        setIsUserScrolledUp(false);

        const shouldContinuePaging = /下一页|继续查看/.test(trimmedMessage);
        const isInterviewGenerationMessage = /(面试题|初试题|复试题|面试问题|出几道题|来一套题|出题|生成题)/.test(trimmedMessage);
        const selectedPosition = selectedPositionIdRef.current
            ? positionMap.get(selectedPositionIdRef.current) || null
            : null;
        const selectedCandidate = selectedCandidateIdRef.current
            ? candidateMap.get(selectedCandidateIdRef.current) || null
            : null;
        const requestContext = buildStreamingAssistantRuntimeContext(trimmedMessage);
        const frontendDebugBase = {
            selectedPosition: selectedPosition
                ? {
                    id: selectedPosition.id,
                    title: selectedPosition.title,
                    status: selectedPosition.status,
                }
                : null,
            selectedPositionId: selectedPositionIdRef.current,
            selectedCandidate: selectedCandidate
                ? {
                    id: selectedCandidate.id,
                    name: selectedCandidate.name,
                    position_id: selectedCandidate.position_id,
                    position_title: selectedCandidate.position_title,
                    status: selectedCandidate.status,
                }
                : null,
            selectedCandidateId: selectedCandidateIdRef.current,
            currentChatContext: chatContextRef.current,
            requestPayloadContext: requestContext,
        };
        const streamMetrics = {
            requestStartedAtMs: performance.now(),
            requestStartedAtIso: new Date().toISOString(),
            responseHeadersAtMs: null as number | null,
            firstReaderChunkAtMs: null as number | null,
            firstStateWriteAtMs: null as number | null,
            firstVisiblePaintAtMs: null as number | null,
            completedAtMs: null as number | null,
            responseContentType: null as string | null,
            readerChunks: [] as Array<{index: number; byteLength: number; receivedAtMs: number}>,
        };
        const buildFrontendDebugPayload = () => ({
            ...frontendDebugBase,
            streamMetrics: {
                ...streamMetrics,
                readerChunks: [...streamMetrics.readerChunks],
            },
        });
        const requestBody: RecruitmentAssistantRunRequest = {
            message: trimmedMessage,
            context: requestContext,
            clarification_response: options?.clarificationResponse || null,
            pagination: shouldContinuePaging
                ? {
                    cursor: getLatestAssistantQueryCursor(),
                    limit: DEFAULT_QUERY_CANDIDATES_LIMIT,
                }
                : undefined,
        };

        const abortController = new AbortController();
        assistantStreamAbortRef.current = abortController;
        const predictedModelConfig = isInterviewGenerationMessage ? interviewActiveLLMConfig : assistantActiveLLMConfig;
        let activeAssistantMessageId: string | null = null;

        console.info("[recruitment][assistant][stream][frontend]", {
            message: trimmedMessage,
            ...frontendDebugBase,
            streamMetrics: buildFrontendDebugPayload().streamMetrics,
        });

        try {
            const response = await authenticatedFetch("/api/recruitment/chat/runs", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                },
                body: JSON.stringify(requestBody),
                signal: abortController.signal,
            });

            if (!response.ok || !response.body) {
                const errorText = await response.text().catch(() => "");
                throw new Error(errorText || "流式助手请求失败");
            }

            streamMetrics.responseHeadersAtMs = performance.now();
            streamMetrics.responseContentType = response.headers.get("content-type");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let runCompleted = false;
            let awaitingClarification = false;
            let refreshInterviewCandidateId: number | null = null;
            const pendingToolResults: RecruitmentAssistantToolResultPayload[] = [];
            let readerChunkIndex = 0;
            let firstVisiblePaintScheduled = false;

            const ensureAssistantMessage = (messageId: string) => {
                activeAssistantMessageId = messageId;
                const pendingPreparedMail = pendingToolResults
                    .map((item) => extractPreparedResumeMail(item))
                    .find((item) => Boolean(item)) || null;
                setActiveChatMessageId((current) => (current === messageId ? current : messageId));
                setChatMessages((current) => (
                    current.some((item) => item.id === messageId)
                        ? current
                        : [
                            ...current,
                            {
                                id: messageId,
                                role: "assistant",
                                content: "",
                                createdAt: new Date().toISOString(),
                                streamStatus: "streaming",
                                sourceRunType: "stream",
                                frontendDebug: buildFrontendDebugPayload(),
                                modelProvider: predictedModelConfig?.resolved_provider || predictedModelConfig?.provider || null,
                                modelName: predictedModelConfig?.resolved_model_name || predictedModelConfig?.model_name || null,
                                toolResults: pendingToolResults.length ? [...pendingToolResults] : undefined,
                                mailConfirmationRequest: pendingPreparedMail,
                            },
                        ]
                ));
            };

            const syncFrontendDebug = (messageId: string) => {
                updateChatMessage(messageId, (chatMessage) => ({
                    ...chatMessage,
                    frontendDebug: buildFrontendDebugPayload(),
                }));
            };

            const applyEvent = (event: RecruitmentAssistantStreamEvent) => {
                switch (event.event) {
                    case "run.started": {
                        setCurrentAssistantRunId(event.run_id);
                        break;
                    }
                    case "message.started": {
                        const payload = event.payload as { message_id: string };
                        ensureAssistantMessage(payload.message_id);
                        break;
                    }
                    case "message.delta": {
                        const payload = event.payload as { message_id: string; delta: string };
                        ensureAssistantMessage(payload.message_id);
                        if (streamMetrics.firstStateWriteAtMs === null) {
                            streamMetrics.firstStateWriteAtMs = performance.now();
                        }
                        updateChatMessage(payload.message_id, (chatMessage) => ({
                            ...chatMessage,
                            content: `${chatMessage.content || ""}${payload.delta}`,
                            streamStatus: "streaming",
                            sourceRunType: "stream",
                            frontendDebug: buildFrontendDebugPayload(),
                        }));
                        if (!firstVisiblePaintScheduled) {
                            firstVisiblePaintScheduled = true;
                            requestAnimationFrame(() => {
                                streamMetrics.firstVisiblePaintAtMs = performance.now();
                                syncFrontendDebug(payload.message_id);
                            });
                        }
                        break;
                    }
                    case "message.completed": {
                        const payload = event.payload as RecruitmentAssistantMessageCompletedPayload;
                        ensureAssistantMessage(payload.message_id);
                        updateChatMessage(payload.message_id, (chatMessage) => ({
                            ...chatMessage,
                            content: payload.content,
                            queryPageInfo: payload.page as RecruitmentAssistantPageInfo | undefined,
                            streamStatus: "done",
                            sourceRunType: "stream",
                            frontendDebug: buildFrontendDebugPayload(),
                        }));
                        break;
                    }
                    case "tool.result": {
                        const payload = event.payload as RecruitmentAssistantToolResultPayload;
                        if (!activeAssistantMessageId) {
                            pendingToolResults.push(payload);
                            break;
                        }
                        const payloadRecord = payload.result && typeof payload.result === "object"
                            ? payload.result as Record<string, unknown>
                            : null;
                        const taskLog = payloadRecord?.task_log && typeof payloadRecord.task_log === "object"
                            ? payloadRecord.task_log as Record<string, unknown>
                            : null;
                        const candidateRecord = payloadRecord?.candidate && typeof payloadRecord.candidate === "object"
                            ? payloadRecord.candidate as Record<string, unknown>
                            : null;
                        const preparedMail = extractPreparedResumeMail(payload);
                        updateChatMessage(activeAssistantMessageId, (chatMessage) => ({
                            ...chatMessage,
                            toolResults: [...(chatMessage.toolResults || []), payload],
                            mailConfirmationRequest: preparedMail || chatMessage.mailConfirmationRequest || null,
                            logId: typeof taskLog?.id === "number" ? taskLog.id : chatMessage.logId,
                            memorySource: typeof taskLog?.memory_source === "string" ? taskLog.memory_source : chatMessage.memorySource,
                            modelProvider: typeof taskLog?.model_provider === "string" ? taskLog.model_provider : chatMessage.modelProvider,
                            modelName: typeof taskLog?.model_name === "string" ? taskLog.model_name : chatMessage.modelName,
                            usedSkills: Array.isArray(taskLog?.related_skill_snapshots)
                                ? taskLog.related_skill_snapshots as RecruitmentSkill[]
                                : chatMessage.usedSkills,
                            usedFallback: typeof taskLog?.status === "string"
                                ? (taskLog.status === "fallback")
                                : chatMessage.usedFallback,
                            fallbackError: typeof taskLog?.error_message === "string"
                                ? taskLog.error_message
                                : chatMessage.fallbackError,
                            frontendDebug: buildFrontendDebugPayload(),
                        }));
                        if (payload.name === "generate_interview_questions" && typeof candidateRecord?.id === "number") {
                            refreshInterviewCandidateId = candidateRecord.id;
                        }
                        break;
                    }
                    case "clarification.required": {
                        const payload = event.payload as RecruitmentAssistantClarificationRequest;
                        awaitingClarification = true;
                        if (!activeAssistantMessageId) {
                            const fallbackMessageId = `a-${Date.now()}`;
                            ensureAssistantMessage(fallbackMessageId);
                        }
                        updateChatMessage(activeAssistantMessageId || `a-${Date.now()}`, (chatMessage) => ({
                            ...chatMessage,
                            clarificationRequest: payload,
                            streamStatus: "done",
                            sourceRunType: "stream",
                            frontendDebug: buildFrontendDebugPayload(),
                        }));
                        break;
                    }
                    case "run.completed": {
                        streamMetrics.completedAtMs = performance.now();
                        setCurrentAssistantRunId(null);
                        setAssistantStreamStopping(false);
                        if (activeAssistantMessageId) {
                            syncFrontendDebug(activeAssistantMessageId);
                        }
                        runCompleted = true;
                        break;
                    }
                    case "run.error": {
                        const payload = event.payload as { message: string };
                        const nextMessageId = activeAssistantMessageId || `e-${Date.now()}`;
                        ensureAssistantMessage(nextMessageId);
                        updateChatMessage(nextMessageId, (chatMessage) => ({
                            ...chatMessage,
                            content: isZh ? `发送失败：${payload.message}` : `Request failed: ${payload.message}`,
                            streamStatus: "error",
                            sourceRunType: "stream",
                            frontendDebug: buildFrontendDebugPayload(),
                        }));
                        toast.error(recruitmentToast.sendFailed("发送", payload.message));
                        setCurrentAssistantRunId(null);
                        setAssistantStreamStopping(false);
                        runCompleted = true;
                        break;
                    }
                    default:
                        break;
                }
            };

            while (true) {
                const {done, value} = await reader.read();
                if (done) {
                    break;
                }
                const chunkReceivedAtMs = performance.now();
                if (streamMetrics.firstReaderChunkAtMs === null) {
                    streamMetrics.firstReaderChunkAtMs = chunkReceivedAtMs;
                }
                if (streamMetrics.readerChunks.length < 20) {
                    streamMetrics.readerChunks.push({
                        index: readerChunkIndex += 1,
                        byteLength: value.byteLength,
                        receivedAtMs: chunkReceivedAtMs,
                    });
                }
                buffer += decoder.decode(value, {stream: true});

                let separatorIndex = buffer.indexOf("\n\n");
                while (separatorIndex !== -1) {
                    const rawEvent = buffer.slice(0, separatorIndex);
                    buffer = buffer.slice(separatorIndex + 2);
                    separatorIndex = buffer.indexOf("\n\n");

                    const lines = rawEvent.split("\n");
                    const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() as RecruitmentAssistantStreamEventType | undefined;
                    const dataLines = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
                    if (!eventName || !dataLines) {
                        continue;
                    }
                    try {
                        applyEvent(JSON.parse(dataLines) as RecruitmentAssistantStreamEvent);
                    } catch {
                        // Ignore malformed chunks and continue reading the stream.
                    }
                }
            }

            if (!runCompleted && !awaitingClarification && activeAssistantMessageId) {
                streamMetrics.completedAtMs = performance.now();
                updateChatMessage(activeAssistantMessageId, (chatMessage) => ({
                    ...chatMessage,
                    streamStatus: "done",
                    sourceRunType: "stream",
                    frontendDebug: buildFrontendDebugPayload(),
                }));
            }
            if (refreshInterviewCandidateId !== null) {
                await Promise.all([
                    loadLogs({silent: true}),
                    refreshCandidateStats(),
                    selectedCandidateIdRef.current === refreshInterviewCandidateId
                        ? loadCandidateDetail(refreshInterviewCandidateId, {silent: true})
                        : Promise.resolve(null),
                ]);
            }
        } catch (error) {
            const wasAborted = abortController.signal.aborted
                || (error instanceof DOMException && error.name === "AbortError")
                || (error instanceof Error && /abort/i.test(`${error.name}:${error.message}`));
            if (!wasAborted) {
                throw error;
            }
            if (activeAssistantMessageId) {
                updateChatMessage(activeAssistantMessageId, (chatMessage) => ({
                    ...chatMessage,
                    streamStatus: "done",
                    sourceRunType: "stream",
                    frontendDebug: buildFrontendDebugPayload(),
                }));
            }
            if (mountedRef.current) {
                toast.success(recruitmentToast.assistantGenerationStopped);
            }
        } finally {
            assistantStreamAbortRef.current = null;
            setCurrentAssistantRunId(null);
            setAssistantStreamStopping(false);
            setActiveChatMessageId((current) => (current === activeAssistantMessageId ? null : current));
            setChatSending(false);
        }
    }

    async function submitAssistantClarification(
        originalMessage: string,
        clarificationRequest: RecruitmentAssistantClarificationRequest,
        option: RecruitmentAssistantClarificationOption,
    ) {
        await runStreamingAssistant(originalMessage, {
            clarificationResponse: {
                selections: [
                    {
                        clarification_id: clarificationRequest.clarification_id,
                        entity_type: clarificationRequest.entity_type,
                        selected_id: option.id,
                    },
                ],
            },
            appendUserMessage: false,
        });
    }

    async function copyPublishJDText() {
        if (!currentPublishText.trim()) {
            toast.error(recruitmentToast.noPublishText);
            return;
        }
        try {
            // 优先使用 Clipboard API（需要HTTPS或localhost）
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(currentPublishText);
            } else {
                // Fallback：使用临时 textarea（兼容HTTP环境）
                const textarea = document.createElement("textarea");
                textarea.value = currentPublishText;
                textarea.style.position = "fixed";
                textarea.style.left = "-9999px";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }
            toast.success(recruitmentToast.copied("发布文案"));
        } catch (error) {
            toast.error(recruitmentToast.copyFailed(error instanceof Error ? error.message : recruitmentToast.unknownError));
        }
    }

    // 加载候选人列表数据（点击候选人 Tab 时调用，支持服务端搜索）
    async function loadPositionCandidates(positionId: number, query?: string, status?: string) {
        const requestId = ++positionCandidatesLoadRequestIdRef.current;
        setPositionCandidatesLoading(true);
        try {
            const queryParam = query ? `&query=${encodeURIComponent(query)}` : "";
            const statusParam = status ? `&status=${encodeURIComponent(status)}` : "";
            const data = await recruitmentApi<{items: CandidateSummary[]; total: number}>(
                `/candidates?position_id=${positionId}&limit=25&offset=0&compact=1${queryParam}${statusParam}`
            );
            if (mountedRef.current && positionCandidatesLoadRequestIdRef.current === requestId) {
                setPositionCandidatesData(data?.items || []);
                setPositionCandidatesTotal(data?.total || 0);
                setPositionCandidatesInitialLoaded(true);
            }
        } catch {
            if (
                mountedRef.current
                && positionCandidatesLoadRequestIdRef.current === requestId
                && positionDetail
                && !query
                && !status
            ) {
                setPositionCandidatesData(positionDetail.candidates);
                setPositionCandidatesInitialLoaded(true);
            }
        } finally {
            if (mountedRef.current && positionCandidatesLoadRequestIdRef.current === requestId) {
                setPositionCandidatesLoading(false);
            }
        }
    }

    async function loadMorePositionCandidates(positionId: number) {
        if (positionCandidatesLoading || loadingMorePositionCandidatesRef.current || positionCandidatesData.length >= positionCandidatesTotal) return;
        loadingMorePositionCandidatesRef.current = true;
        setIsLoadingMorePositionCandidates(true);
        const currentRequestId = positionCandidatesLoadRequestIdRef.current;
        try {
            const queryParam = positionCandidateSearch ? `&query=${encodeURIComponent(positionCandidateSearch)}` : "";
            const statusParam = positionCandidateStatusFilter !== "__all__"
                ? `&status=${encodeURIComponent(positionCandidateStatusFilter)}`
                : "";
            const data = await recruitmentApi<{items: CandidateSummary[]; total: number}>(
                `/candidates?position_id=${positionId}&limit=25&offset=${positionCandidatesData.length}&compact=1${queryParam}${statusParam}`
            );
            if (mountedRef.current && positionCandidatesLoadRequestIdRef.current === currentRequestId) {
                setPositionCandidatesData(prev => [...prev, ...(data?.items || [])]);
                setPositionCandidatesTotal(data?.total || positionCandidatesTotal);
            }
        } catch {
            // ignore
        } finally {
            loadingMorePositionCandidatesRef.current = false;
            if (mountedRef.current) {
                setIsLoadingMorePositionCandidates(false);
            }
        }
    }

    const handlePositionCandidateSelect = useCallback((candidateId: number) => {
        setSelectedCandidateId(candidateId);
        setPositionCandidateDetailOpen(true);
    }, []);

    const handleTalentPoolCandidateSelect = useCallback((candidateId: number) => {
        setSelectedCandidateId(candidateId);
        setTalentPoolCandidateDetailOpen(true);
    }, []);

    const handleViewResume = useCallback(async (candidateId: number) => {
        // Use cached resume_files if we already have detail for this candidate
        if (candidateDetail?.candidate.id === candidateId && candidateDetail?.resume_files?.length) {
            await openResumePreview({ id: candidateDetail.resume_files[0].id, original_name: candidateDetail.resume_files[0].original_name }, candidateDetail.candidate.name);
            return;
        }
        // Otherwise fetch candidate detail to get resume_files
        try {
            const data = await recruitmentApi<CandidateDetail>(`/candidates/${candidateId}`);
            if (data?.resume_files?.length) {
                await openResumePreview({ id: data.resume_files[0].id, original_name: data.resume_files[0].original_name }, data.candidate.name);
            } else {
                toast.error(recruitmentUiText.noCandidates || "No resume found");
            }
        } catch (error) {
            toast.error(recruitmentToast.resumeOpenedFailed(error instanceof Error ? error.message : recruitmentToast.unknownError));
        }
    }, [candidateDetail]);

    const handlePositionCandidateSearchChange = useCallback((v: string) => {
        setPositionCandidateSearch(v);
    }, []);

    const handlePositionQueryChange = useCallback((v: string) => {
        setPositionQuery(v);
    }, []);

    function renderSharedCandidateDrawerContent(onClose: () => void) {
        if (
            candidateDetailLoading
            || (selectedCandidateId && candidateDetail?.candidate.id !== selectedCandidateId)
        ) {
            return <LoadingPanel label={isZh ? "加载中..." : "Loading..."} />;
        }
        if (!candidateDetail) {
            return (
                <div className="flex h-full items-center justify-center px-6 text-base text-slate-500 dark:text-slate-400">
                    {isZh ? "暂无候选人详情" : "Candidate details are not available yet"}
                </div>
            );
        }

        const c = candidateDetail.candidate;
        const score = candidateDetail.score;
        const resumeFiles = candidateDetail.resume_files || [];
        const statusHistory = candidateDetail.status_history || [];
        const isTalentPoolDetail = talentPoolCandidateDetailOpen;
        const candidateDisplayStatus = isTalentPoolDetail ? resolveTalentPoolDisplayStatus(c) : resolveCandidateDisplayStatus(c);
        const talentPoolSourceStageText = (() => {
            const reason = String(c.talent_pool_reason || "").trim().toLowerCase();
            if (!isTalentPoolDetail) {
                return null;
            }
            if (candidateDisplayStatus === "matching") {
                return null;
            }
            if (reason === "unmatched_by_ai") {
                return isZh ? "AI 未识别岗位" : "AI Unmatched";
            }
            if (reason === "ai_error") {
                return isZh ? "AI 识别异常" : "AI Error";
            }
            if (reason === "auto_archived") {
                return isZh ? "初筛完成后入库" : "Archived After Screening";
            }
            if (reason === "moved_by_hr") {
                return c.talent_pool_source_status ? labelForCandidateStatus(c.talent_pool_source_status) : (isZh ? "手动归入人才库" : "Moved To Talent Pool");
            }
            return isZh ? "历史人才库数据" : "Legacy Talent Pool Record";
        })();

        return (
            <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/60 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{c.name}</p>
                        <p className="mt-0.5 text-[15px] text-slate-500">{c.candidate_code}</p>
                    </div>
                    <button
                        type="button"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                        onClick={onClose}
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto space-y-5 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge className={cn("rounded-full border", statusBadgeClass("candidate", candidateDisplayStatus))}>
                            {labelForCandidateStatus(candidateDisplayStatus)}
                        </Badge>
                        {talentPoolSourceStageText ? (
                            <Badge variant="outline" className="rounded-full">
                                {`${isZh ? "来源阶段" : "Source Stage"}：${talentPoolSourceStageText}`}
                            </Badge>
                        ) : null}
                        <Badge variant="outline" className="rounded-full">
                            {isZh ? "匹配度" : "Match"} {formatPercent(c.match_percent)}
                        </Badge>
                        {c.position_title && (
                            <Badge variant="outline" className="rounded-full">
                                {c.position_title}
                            </Badge>
                        )}
                    </div>
                    <div className="space-y-1.5 text-base">
                        <p className="mb-2 text-[15px] font-medium uppercase tracking-wider text-slate-400">{isZh ? "基本信息" : "Basic Info"}</p>
                        {[
                            { label: isZh ? "手机号" : "Phone", value: c.phone },
                            { label: isZh ? "邮箱" : "Email", value: c.email },
                            { label: isZh ? "所在城市" : "Current City", value: c.city },
                            { label: isZh ? "期望城市" : "Expected City", value: c.expected_city },
                            { label: isZh ? "年龄" : "Age", value: c.age != null ? String(c.age) : null },
                            { label: isZh ? "公司" : "Company", value: c.current_company },
                            { label: isZh ? "工作年限" : "Experience", value: c.years_of_experience },
                            { label: isZh ? "学历" : "Education", value: c.education },
                            { label: isZh ? "来源" : "Source", value: c.source },
                        ].filter((field) => field.value).map((field) => (
                            <div key={field.label} className="flex items-center justify-between gap-4">
                                <span className="text-slate-500">{field.label}</span>
                                <span className="text-right font-medium text-slate-900 dark:text-slate-100">{field.value}</span>
                            </div>
                        ))}
                    </div>
                    {(c.screened_position_title || c.ai_match_position_title || c.ai_potential_position) ? (
                        <div className="rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-sm text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                            {c.screened_position_title ? (
                                <div className="font-medium">{`${isZh ? "初筛岗位" : "Screening Position"}：${c.screened_position_title}`}</div>
                            ) : null}
                            {c.ai_match_position_title ? (
                                <div className={c.screened_position_title ? "mt-1" : "font-medium"}>{`${isZh ? "AI 主匹配岗位" : "AI Primary Match"}：${c.ai_match_position_title}`}</div>
                            ) : null}
                            {c.ai_match_position_title && c.ai_match_reason ? (
                                <div className="mt-1 text-sky-600 dark:text-sky-200/80">
                                    {sanitizeCandidateFacingErrorText(c.ai_match_reason, {
                                        context: resolveCandidateFacingErrorContext("ai_position_match"),
                                        language,
                                    })}
                                </div>
                            ) : null}
                            {c.ai_potential_position ? (
                                <div className={c.screened_position_title || c.ai_match_position_title ? "mt-2 border-t border-sky-200/70 pt-2 dark:border-sky-900/70" : ""}>
                                    <div className="font-medium">{`${isZh ? "转岗潜力方向" : "Potential Transition"}：${c.ai_potential_position}`}</div>
                                    {c.ai_potential_reason ? (
                                        <div className="mt-1 text-sky-600 dark:text-sky-200/80">{c.ai_potential_reason}</div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    {score && score.dimensions && score.dimensions.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[15px] font-medium uppercase tracking-wider text-slate-400">{isZh ? "综合能力概览" : "Competency Overview"}</p>
                            <CandidateRadarChart
                                dimensions={score.dimensions}
                                radarScores={score.radar_scores}
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
                            <p className="mt-4 text-[15px] font-medium uppercase tracking-wider text-slate-400">{isZh ? "各维度得分" : "Dimension Scores"}</p>
                            <CandidateRadarChart
                                dimensions={score.dimensions}
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
                            <div className="space-y-3">
                                {score.dimensions.map((dim, index) => (
                                    <div
                                        key={index}
                                        data-dim-reason={dim.label || `维度${index + 1}`}
                                        className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30"
                                    >
                                        <div className="mb-1 flex items-center justify-between">
                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                {dim.label || `维度${index + 1}`}
                                            </span>
                                            <div className="flex items-center gap-2 font-mono text-[15px] text-slate-400">
                                                <span>{dim.score ?? "-"}/{dim.max_score ?? "-"}</span>
                                                {dim.is_inferred && (
                                                    <Badge variant="outline" className="h-3.5 bg-slate-100 px-1 py-0 text-[13px]">
                                                        {isZh ? "推断" : "Inf"}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        {dim.reason ? (
                                            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                                                {dim.reason}
                                            </p>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {score && (score.advantages?.length || score.concerns?.length || score.recommendation) ? (
                        <div className="space-y-2">
                            {score.advantages && score.advantages.length > 0 ? (
                                <div>
                                    <p className="text-[15px] text-emerald-600 dark:text-emerald-400">{isZh ? "优势" : "Advantages"}</p>
                                    <ul className="mt-1 space-y-0.5">
                                        {score.advantages.map((item, index) => (
                                            <li key={index} className="text-sm text-slate-600 dark:text-slate-400">{"· "}{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                            {score.concerns && score.concerns.length > 0 ? (
                                <div>
                                    <p className="text-[15px] text-amber-600 dark:text-amber-400">{isZh ? "风险" : "Concerns"}</p>
                                    <ul className="mt-1 space-y-0.5">
                                        {score.concerns.map((item, index) => (
                                            <li key={index} className="text-sm text-slate-600 dark:text-slate-400">{"· "}{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                            {score.recommendation ? (
                                <div>
                                    <p className="text-[15px] text-slate-400">{isZh ? "推荐意见" : "Recommendation"}</p>
                                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{score.recommendation}</p>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    {resumeFiles.length > 0 ? (
                        <div className="space-y-1.5">
                            <p className="text-[15px] font-medium uppercase tracking-wider text-slate-400">{isZh ? "简历文件" : "Resumes"}</p>
                            {resumeFiles.map((resumeFile) => (
                                <div
                                    key={resumeFile.id}
                                    onClick={() => openResumePreview(resumeFile)}
                                    className="group flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-slate-800 dark:hover:border-blue-700 dark:hover:bg-blue-900/20"
                                >
                                    <FileText className="h-4 w-4 shrink-0 text-red-500" />
                                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">{resumeFile.original_name}</span>
                                    <Badge variant="outline" className={cn("shrink-0 text-[14px]", resumeFile.parse_status === "completed" ? "text-emerald-600" : "text-slate-400")}>
                                        {resumeFile.parse_status}
                                    </Badge>
                                    <Eye className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {statusHistory.length > 0 ? (
                        <div className="space-y-1.5">
                            <p className="text-[15px] font-medium uppercase tracking-wider text-slate-400">{isZh ? "状态变更" : "Status History"}</p>
                            {statusHistory.slice(0, 8).map((item) => (
                                <div key={item.id} className="flex items-center gap-2 text-sm">
                                    <span className="text-slate-400">{item.created_at ? formatDateTime(item.created_at) : ""}</span>
                                    <span className="text-slate-500">{item.from_status ? labelForCandidateStatus(item.from_status) : "-"}</span>
                                    <span className="text-slate-300">{"→"}</span>
                                    <span className="font-medium text-slate-700 dark:text-slate-300">{labelForCandidateStatus(item.to_status)}</span>
                                    {item.reason ? <span className="truncate text-slate-400">{item.reason}</span> : null}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
                <div className="shrink-0 border-t border-slate-200/80 p-3 dark:border-slate-800">
                    <Button
                        size="sm"
                        variant="outline"
                        className="w-full rounded-lg"
                        onClick={() => {
                            const candidateId = selectedCandidateId;
                            onClose();
                            if (candidateId) {
                                setSelectedCandidateId(candidateId);
                            }
                            navigateToRecruitmentPage("candidates");
                        }}
                    >
                        {recruitmentUiText.viewInCandidatePage}
                    </Button>
                </div>
            </div>
        );
    }

    function openCreatePosition() {
        setPositionDialogMode("create");
        setPositionForm({
            ...emptyPositionForm(),
            orgCode: showOrganizationFields ? "" : activeCreateOrgCode,
        });
        setPositionSkillSearch("");
        setPositionSkillSectionExpanded(DEFAULT_POSITION_SKILL_SECTION_EXPANDED_STATE);
        setPositionFormErrors({});
        setPositionFormSubmitError(null);
        setPositionDialogOpen(true);
    }

    function openEditPosition() {
        if (!positionDetail?.position) {
            return;
        }
        setPositionDialogMode("edit");
        setPositionForm({
            orgCode: normalizeRecruitmentOrgCode(positionDetail.position.org_code),
            title: positionDetail.position.title,
            department: positionDetail.position.department || "",
            location: positionDetail.position.location || "",
            employmentType: positionDetail.position.employment_type || "",
            salaryRange: positionDetail.position.salary_range || "",
            headcount: String(positionDetail.position.headcount || 1),
            keyRequirements: positionDetail.position.key_requirements || "",
            bonusPoints: positionDetail.position.bonus_points || "",
            summary: positionDetail.position.summary || "",
            status: positionDetail.position.status || "draft",
            tagsText: joinTags(positionDetail.position.tags),
            autoScreenOnUpload: Boolean(positionDetail.position.auto_screen_on_upload),
            autoAdvanceOnScreening: positionDetail.position.auto_advance_on_screening ?? true,
            autoMailEnabled: Boolean(positionDetail.position.auto_mail_enabled),
            autoMailUseGlobalRecipients: Boolean(positionDetail.position.auto_mail_use_global_recipients),
            autoMailUsePositionRecipients: Boolean(positionDetail.position.auto_mail_use_position_recipients),
            autoMailPositionRecipientIds: positionDetail.position.auto_mail_position_recipient_ids || [],
            autoMailAllowedCandidateStatuses: positionDetail.position.auto_mail_allowed_candidate_statuses || ["screening_passed"],
            autoMailTemplateId: positionDetail.position.auto_mail_template_id || "",
            autoMailDedupMode: positionDetail.position.auto_mail_dedup_mode || "once_per_candidate_per_status",
            autoMailCcRecipientIds: positionDetail.position.auto_mail_cc_recipient_ids || [],
            autoMailBccRecipientIds: positionDetail.position.auto_mail_bcc_recipient_ids || [],
            jdSkillIds: (positionDetail.position.jd_skill_ids || []).slice(0, 1),
            screeningSkillIds: (positionDetail.position.screening_skill_ids || []).slice(0, 1),
            interviewSkillIds: (positionDetail.position.interview_skill_ids || []).slice(0, 1),
        });
        setPositionSkillSearch("");
        setPositionSkillSectionExpanded(DEFAULT_POSITION_SKILL_SECTION_EXPANDED_STATE);
        setPositionFormErrors({});
        setPositionFormSubmitError(null);
        setPositionDialogOpen(true);
    }

    function updatePositionFormField<K extends keyof PositionFormState>(field: K, value: PositionFormState[K]) {
        setPositionForm((current) => ({
            ...current,
            [field]: value,
        }));
        setPositionFormSubmitError(null);
        if (field === "title") {
            setPositionFormErrors((current) => {
                if (!current.title) return current;
                const next = {...current};
                delete next.title;
                return next;
            });
        } else if (field === "headcount") {
            setPositionFormErrors((current) => {
                if (!current.headcount) return current;
                const next = {...current};
                delete next.headcount;
                return next;
            });
        } else if (field === "orgCode") {
            setPositionFormErrors((current) => {
                if (!current.orgCode) return current;
                const next = {...current};
                delete next.orgCode;
                return next;
            });
        }
    }

    function updatePositionSkillBinding(
        field: PositionSkillBindingField,
        nextIds: number[],
        options?: { expandSection?: boolean },
    ) {
        const dedupedIds = Array.from(new Set(nextIds)).slice(-1);
        setPositionForm((current) => ({
            ...current,
            [field]: dedupedIds,
            autoScreenOnUpload: field === "screeningSkillIds"
                ? (dedupedIds.length > 0 ? (current.autoScreenOnUpload || current.screeningSkillIds.length === 0) : false)
                : current.autoScreenOnUpload,
        }));
        if (options?.expandSection) {
            setPositionSkillSectionExpanded((current) => ({
                ...current,
                [field]: true,
            }));
        }
        setPositionFormSubmitError(null);
    }

    async function refreshSkillBindingViews(affectedPositionIds: Array<number | null | undefined>) {
        const normalizedIds = Array.from(
            new Set(
                affectedPositionIds
                    .map((value) => Number(value || 0))
                    .filter((value) => Number.isFinite(value) && value > 0),
            ),
        );
        const tasks: Promise<unknown>[] = [loadSkills(), loadPositions()];
        if (selectedPositionId && normalizedIds.includes(selectedPositionId)) {
            tasks.push(loadPositionDetail(selectedPositionId));
        }
        await Promise.all(tasks);
    }

    function upsertSkillInLocalState(skill: RecruitmentSkill) {
        setAllSkills((current) => [
            skill,
            ...current.filter((item) => item.id !== skill.id),
        ]);
    }

    function updateSkillFormField<K extends keyof SkillFormState>(field: K, value: SkillFormState[K]) {
        setSkillForm((current) => ({
            ...current,
            [field]: value,
        }));
        setSkillFormSubmitError(null);
        setSkillFormErrors((current) => {
            if (!current[field as keyof SkillFormErrors]) {
                return current;
            }
            const next = {...current};
            delete next[field as keyof SkillFormErrors];
            return next;
        });
    }

    function findExistingLLMConfigKey(configKey: string) {
        const normalized = configKey.trim().toLowerCase();
        if (!normalized) {
            return null;
        }
        return allLlmConfigs.find((item) => (
            item.id !== llmEditingId
            && item.config_key.trim().toLowerCase() === normalized
        )) || null;
    }

    function updateLLMFormField<K extends keyof LLMFormState>(field: K, value: LLMFormState[K]) {
        setLlmForm((current) => ({
            ...current,
            [field]: value,
        }));
        setLlmFormSubmitError(null);
        setLlmFormErrors((current) => {
            const next = {...current};
            let changed = false;
            if (field === "configKey" && next.configKey) {
                delete next.configKey;
                changed = true;
            }
            if (field === "taskType" && next.taskType) {
                delete next.taskType;
                changed = true;
            }
            if (field === "provider" && next.provider) {
                delete next.provider;
                changed = true;
            }
            if (field === "modelName" && next.modelName) {
                delete next.modelName;
                changed = true;
            }
            if (field === "maxConcurrent" && next.maxConcurrent) {
                delete next.maxConcurrent;
                changed = true;
            }
            if (field === "maxQps" && next.maxQps) {
                delete next.maxQps;
                changed = true;
            }
            if (field === "priority" && next.priority) {
                delete next.priority;
                changed = true;
            }
            if (field === "extraConfigText" && next.extraConfigText) {
                delete next.extraConfigText;
                changed = true;
            }
            return changed ? next : current;
        });
    }

    function validateSkillForm(form: SkillFormState): SkillFormErrors {
        const errors: SkillFormErrors = {};
        const name = form.name.trim();
        const content = form.content.trim();
        const sortOrder = form.sortOrder.trim();
        const sortOrderValue = Number(sortOrder);

        if (!name) {
            errors.name = recruitmentUiText.skillNameRequired;
        } else if (name.length > 120) {
            errors.name = recruitmentUiText.skillNameTooLong;
        }

        if (!content) {
            errors.content = recruitmentUiText.skillContentRequired;
        }

        if (sortOrder && (!/^\d+$/.test(sortOrder) || !Number.isInteger(sortOrderValue) || sortOrderValue < 0 || sortOrderValue > 9999)) {
            errors.sortOrder = recruitmentUiText.skillSortOrderInvalid;
        }

        return errors;
    }

    function validateLLMForm(form: LLMFormState): LLMFormErrors {
        const errors: LLMFormErrors = {};
        const configKey = form.configKey.trim();
        const taskType = form.taskType.trim();
        const provider = form.provider.trim();
        const modelName = form.modelName.trim();
        const maxConcurrent = form.maxConcurrent.trim();
        const maxQps = form.maxQps.trim();
        const priority = form.priority.trim();

        if (!configKey) {
            errors.configKey = recruitmentUiText.llmConfigKeyRequired;
        } else if (configKey.length > 120) {
            errors.configKey = recruitmentUiText.llmConfigKeyTooLong;
        } else if (findExistingLLMConfigKey(configKey)) {
            errors.configKey = recruitmentUiText.llmConfigKeyDuplicate(configKey);
        }

        if (!taskType) {
            errors.taskType = recruitmentUiText.llmTaskTypeRequired;
        } else if (taskType.length > 80) {
            errors.taskType = recruitmentUiText.llmTaskTypeTooLong;
        }

        if (!provider) {
            errors.provider = recruitmentUiText.llmProviderRequired;
        } else if (provider.length > 80) {
            errors.provider = recruitmentUiText.llmProviderTooLong;
        }

        if (!modelName) {
            errors.modelName = recruitmentUiText.llmModelNameRequired;
        } else if (modelName.length > 120) {
            errors.modelName = recruitmentUiText.llmModelNameTooLong;
        }

        if (!/^\d+$/.test(maxConcurrent) || Number(maxConcurrent) < 1 || Number(maxConcurrent) > 100) {
            errors.maxConcurrent = recruitmentUiText.llmMaxConcurrentInvalid;
        }

        if (!/^\d+$/.test(maxQps) || Number(maxQps) < 0 || Number(maxQps) > 1000) {
            errors.maxQps = recruitmentUiText.llmMaxQpsInvalid;
        }

        if (priority && (!/^\d+$/.test(priority) || Number(priority) < 0 || Number(priority) > 999)) {
            errors.priority = recruitmentUiText.llmPriorityInvalid;
        }

        const extraConfigText = form.extraConfigText.trim();
        if (extraConfigText) {
            try {
                const parsed = JSON.parse(extraConfigText);
                if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
                    errors.extraConfigText = recruitmentUiText.llmExtraConfigObjectOnly;
                }
            } catch {
                errors.extraConfigText = recruitmentUiText.llmExtraConfigInvalidJson;
            }
        }

        return errors;
    }

    function resolveSkillSubmitError(error: unknown) {
        const message = formatActionError(error).trim();
        if (/body\.name\b/i.test(message)) {
            return {fieldErrors: {name: recruitmentUiText.skillNameRequired} as SkillFormErrors, submitError: null};
        }
        if (/body\.content\b/i.test(message)) {
            return {fieldErrors: {content: recruitmentUiText.skillContentRequired} as SkillFormErrors, submitError: null};
        }
        return {fieldErrors: null, submitError: message};
    }

    function resolveLLMSubmitError(error: unknown) {
        const message = formatActionError(error).trim();
        const duplicateConfigKey = findExistingLLMConfigKey(llmForm.configKey.trim())?.config_key || llmForm.configKey.trim();
        if (
            /llm config key already exists/i.test(message)
            || /config key already exists/i.test(message)
            || /duplicate entry/i.test(message)
            || /unique constraint/i.test(message)
        ) {
            return {
                fieldErrors: {configKey: recruitmentUiText.llmConfigKeyDuplicate(duplicateConfigKey || llmForm.configKey.trim())} as LLMFormErrors,
                submitError: null,
            };
        }
        if (/body\.config_key\b/i.test(message)) {
            return {fieldErrors: {configKey: recruitmentUiText.llmConfigKeyRequired} as LLMFormErrors, submitError: null};
        }
        if (/body\.task_type\b/i.test(message)) {
            return {fieldErrors: {taskType: recruitmentUiText.llmTaskTypeRequired} as LLMFormErrors, submitError: null};
        }
        if (/body\.provider\b/i.test(message)) {
            return {fieldErrors: {provider: recruitmentUiText.llmProviderRequired} as LLMFormErrors, submitError: null};
        }
        if (/body\.model_name\b/i.test(message)) {
            return {fieldErrors: {modelName: recruitmentUiText.llmModelNameRequired} as LLMFormErrors, submitError: null};
        }
        if (/body\.max_concurrent\b/i.test(message)) {
            return {fieldErrors: {maxConcurrent: recruitmentUiText.llmMaxConcurrentInvalid} as LLMFormErrors, submitError: null};
        }
        if (/body\.max_qps\b/i.test(message)) {
            return {fieldErrors: {maxQps: recruitmentUiText.llmMaxQpsInvalid} as LLMFormErrors, submitError: null};
        }
        return {fieldErrors: null, submitError: message};
    }

    function validatePositionForm(form: PositionFormState): PositionFormErrors {
        const errors: PositionFormErrors = {};
        const title = form.title.trim();
        const headcountText = form.headcount.trim();
        const headcountValue = Number(headcountText || "0");
        const orgCode = normalizeRecruitmentOrgCode(form.orgCode);

        if (positionDialogMode === "create") {
            if (!form.orgCode.trim()) {
                errors.orgCode = recruitmentUiText.chooseTargetOrganization;
            } else if (!organizationSelectOptions.some((option) => option.value === orgCode)) {
                errors.orgCode = isZh ? "请选择可用组织" : "Choose an available organization";
            }
        }

        if (!title) {
            errors.title = isZh ? "请输入岗位名称" : "Please enter a position title";
        } else if (title.length > 200) {
            errors.title = isZh ? "岗位名称不能超过 200 个字符" : "Position title cannot exceed 200 characters";
        }

        if (!headcountText) {
            errors.headcount = isZh ? "请输入招聘人数" : "Please enter the hiring headcount";
        } else if (!/^\d+$/.test(headcountText)) {
            errors.headcount = isZh ? "招聘人数只能填写正整数" : "Headcount must be a positive integer";
        } else if (!Number.isInteger(headcountValue) || headcountValue < 1 || headcountValue > 999) {
            errors.headcount = isZh ? "招聘人数需在 1 到 999 之间" : "Headcount must be between 1 and 999";
        }

        return errors;
    }

    async function submitPosition() {
        const nextErrors = validatePositionForm(positionForm);
        if (Object.keys(nextErrors).length) {
            setPositionFormErrors(nextErrors);
            setPositionFormSubmitError(null);
            requestAnimationFrame(() => {
                if (nextErrors.title) {
                    positionTitleInputRef.current?.focus();
                    return;
                }
                if (nextErrors.headcount) {
                    positionHeadcountInputRef.current?.focus();
                }
            });
            return;
        }

        setPositionFormSubmitError(null);
        setPositionSubmitting(true);

        const payload = {
            ...(positionDialogMode === "create" ? {org_code: normalizeRecruitmentOrgCode(positionForm.orgCode)} : {}),
            title: positionForm.title.trim(),
            department: positionForm.department.trim() || null,
            location: positionForm.location.trim() || null,
            employment_type: positionForm.employmentType.trim() || null,
            salary_range: positionForm.salaryRange.trim() || null,
            headcount: Number(positionForm.headcount || "1"),
            key_requirements: positionForm.keyRequirements.trim() || null,
            bonus_points: positionForm.bonusPoints.trim() || null,
            summary: positionForm.summary.trim() || null,
            status: positionForm.status,
            tags: splitTags(positionForm.tagsText),
            auto_screen_on_upload: positionForm.autoScreenOnUpload,
            auto_advance_on_screening: positionForm.autoAdvanceOnScreening,
            auto_mail_enabled: positionForm.autoMailEnabled,
            auto_mail_use_global_recipients: positionForm.autoMailUseGlobalRecipients,
            auto_mail_use_position_recipients: positionForm.autoMailUsePositionRecipients,
            auto_mail_position_recipient_ids: positionForm.autoMailPositionRecipientIds,
            auto_mail_allowed_candidate_statuses: positionForm.autoMailAllowedCandidateStatuses,
            auto_mail_template_id: positionForm.autoMailTemplateId.trim() || null,
            auto_mail_dedup_mode: positionForm.autoMailDedupMode,
            auto_mail_cc_recipient_ids: positionForm.autoMailCcRecipientIds,
            auto_mail_bcc_recipient_ids: positionForm.autoMailBccRecipientIds,
            jd_skill_ids: positionForm.jdSkillIds,
            screening_skill_ids: positionForm.screeningSkillIds,
            interview_skill_ids: positionForm.interviewSkillIds,
        };

        try {
            let targetPositionId = selectedPositionId;
            if (positionDialogMode === "create") {
                const created = await recruitmentApi<PositionSummary>("/positions", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                setSelectedPositionId(created.id);
                targetPositionId = created.id;
                toast.success(recruitmentToast.created(recruitmentToastEntities.position));

                // 如果有选中的人才库候选人，批量分配到新创建的岗位
                if (positionForm.pendingTalentPoolCandidates && positionForm.pendingTalentPoolCandidates.length > 0 && targetPositionId) {
                    try {
                        await batchBindPosition(positionForm.pendingTalentPoolCandidates, targetPositionId);
                        toast.success(
                            isZh
                                ? `已将 ${positionForm.pendingTalentPoolCandidates.length} 位候选人分配到新岗位`
                                : `Assigned ${positionForm.pendingTalentPoolCandidates.length} candidates to the new position`
                        );
                    } catch (assignError) {
                        console.error("Failed to assign talent pool candidates:", assignError);
                        toast.error(
                            isZh
                                ? `岗位创建成功，但分配候选人失败：${formatActionError(assignError)}`
                                : `Position created, but failed to assign candidates: ${formatActionError(assignError)}`
                        );
                    }
                }
            } else if (selectedPositionId) {
                await recruitmentApi<PositionSummary>(`/positions/${selectedPositionId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success(recruitmentToast.updated(recruitmentToastEntities.position));
            }
            setPositionDialogOpen(false);
            await refreshCoreData();
            if (targetPositionId) {
                await loadPositionDetail(targetPositionId);
            }
            navigateToRecruitmentPage("positions");
        } catch (error) {
            setPositionFormSubmitError(recruitmentToast.saveFailed(recruitmentToastEntities.position, error instanceof Error ? error.message : recruitmentToast.unknownError));
        } finally {
            setPositionSubmitting(false);
        }
    }

    async function deletePosition() {
        if (!selectedPositionId || !positionDetail?.position) {
            return;
        }
        setPositionDeleting(true);
        try {
            await recruitmentApi(`/positions/${selectedPositionId}`, {method: "DELETE"});
            toast.success(recruitmentToast.deleted(recruitmentToastEntities.position));
            setPositionDeleteConfirmOpen(false);
            setPositionDetail(null);
            setSelectedPositionId(null);
            try {
                await Promise.all([loadPositions(), loadCandidates(), loadLogs()]);
            } catch (refreshError) {
                toast.error(recruitmentToast.deletedButRefreshFailed(recruitmentToastEntities.position, formatActionError(refreshError)));
            }
        } catch (error) {
            toast.error(recruitmentToast.deleteFailed(recruitmentToastEntities.position, formatActionError(error)));
        } finally {
            setPositionDeleting(false);
        }
    }

    async function generateJD() {
        if (!selectedPositionId) {
            return;
        }
        const positionId = selectedPositionId;
        if (isJDGenerating || jdGenerationInFlightRef.current) {
            return;
        }
        const abortController = new AbortController();
        jdAbortControllerRef.current = abortController;
        jdActiveTaskIdRef.current = null;
        jdGenerationInFlightRef.current = true;
        setJdGenerationStatus("running");
        setJdGenerationError("");
        setJdStreamingContent("");
        try {
            const response = await authenticatedFetch(`/api/recruitment/positions/${positionId}/generate-jd/stream`, {
                method: "POST",
                headers: {"Content-Type": "application/json", Accept: "text/event-stream"},
                body: JSON.stringify({
                    extra_prompt: jdExtraPrompt.trim() || null,
                    auto_activate: jdDraft.autoActivate,
                }),
                signal: abortController.signal,
            });
            if (!response.body) throw new Error("No response body");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let fullContent = "";
            let completedData: Record<string, unknown> | null = null;
            let errorData: Record<string, unknown> | null = null;
            let cancelledData: Record<string, unknown> | null = null;
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {stream: true});
                let sep = buffer.indexOf("\n\n");
                while (sep !== -1) {
                    const rawEvent = buffer.slice(0, sep);
                    buffer = buffer.slice(sep + 2);
                    sep = buffer.indexOf("\n\n");
                    const eventMatch = rawEvent.match(/^event: (.+)$/m);
                    const eventType = eventMatch ? eventMatch[1].trim() : "message";
                    const dataMatch = rawEvent.match(/data: (.+)/);
                    if (dataMatch) {
                        try {
                            const data = JSON.parse(dataMatch[1]);
                            if (eventType === "task_created") {
                                jdActiveTaskIdRef.current = data.task_id;
                            } else if (eventType === "completed") {
                                completedData = data;
                            } else if (eventType === "cancelled") {
                                cancelledData = data;
                            } else if (eventType === "error") {
                                errorData = data;
                            } else if (data.delta) {
                                fullContent += data.delta;
                                setJdStreamingContent(fullContent);
                            }
                        } catch { /* ignore malformed */ }
                    }
                }
            }
            if (!mountedRef.current) return;
            if (cancelledData) {
                setJdGenerationStatus("idle");
                setJdStreamingContent("");
                return;
            }
            if (errorData) {
                throw new Error(String(errorData.message || (isZh ? "JD 生成失败" : "JD generation failed")));
            }
            setJdGenerationStatus("syncing");
            await Promise.all([
                loadLogs({silent: true}),
                loadPositions(),
                selectedPositionIdRef.current === positionId
                    ? loadPositionDetail(positionId)
                    : Promise.resolve(null),
            ]);
            setJdExtraPrompt("");
            setJdStreamingContent("");
            setJdViewMode("publish");
            setJdGenerationStatus("idle");
            if (completedData?.used_fallback) {
                toast.warning(recruitmentToast.generatedWithFallback("岗位 JD"));
            } else {
                toast.success(recruitmentToast.generated("岗位 JD", false));
            }
        } catch (error) {
            if (!mountedRef.current) return;
            if (abortController.signal.aborted) {
                setJdGenerationStatus("idle");
                setJdStreamingContent("");
                return;
            }
            setJdGenerationStatus("failed");
            setJdGenerationError(error instanceof Error ? error.message : recruitmentToast.unknownError);
            toast.error(recruitmentToast.createFailed("JD 生成", error instanceof Error ? error.message : recruitmentToast.unknownError));
        } finally {
            jdGenerationInFlightRef.current = false;
            jdAbortControllerRef.current = null;
            jdActiveTaskIdRef.current = null;
        }
    }

    async function stopJDGeneration() {
        jdAbortControllerRef.current?.abort();
        const taskId = jdActiveTaskIdRef.current;
        if (taskId) {
            try {
                await cancelTaskGeneration(taskId, isZh ? "JD 生成" : "JD generation", {silent: true});
            } catch { /* ignore */ }
        }
    }

    async function saveJDVersion() {
        if (!selectedPositionId || jdVersionSaving) {
            return;
        }
        setJdVersionSaving(true);
        try {
            await recruitmentApi<JDVersion>(`/positions/${selectedPositionId}/jd-versions`, {
                method: "POST",
                body: JSON.stringify({
                    title: jdDraft.title.trim(),
                    jd_markdown: jdDraft.jdMarkdown,
                    jd_html: null,
                    publish_text: currentPublishText,
                    notes: jdDraft.notes.trim() || null,
                    auto_activate: jdDraft.autoActivate,
                }),
            });
            toast.success(recruitmentToast.newJdVersionSaved);
            await Promise.all([loadPositionDetail(selectedPositionId), loadPositions()]);
            setJdViewMode("publish");
        } catch (error) {
            toast.error(recruitmentToast.saveFailed("JD", error instanceof Error ? error.message : recruitmentToast.unknownError));
        } finally {
            setJdVersionSaving(false);
        }
    }

    async function activateJDVersion(versionId: number) {
        if (!selectedPositionId || jdVersionActivating) {
            return;
        }
        setJdVersionActivating(true);
        try {
            await recruitmentApi<JDVersion>(`/positions/${selectedPositionId}/jd-versions/${versionId}/activate`, {
                method: "POST",
            });
            toast.success(recruitmentToast.jdVersionSwitched);
            await Promise.all([loadPositionDetail(selectedPositionId), loadPositions()]);
        } catch (error) {
            toast.error(recruitmentToast.updateFailed("JD 版本", error instanceof Error ? error.message : recruitmentToast.unknownError));
        } finally {
            setJdVersionActivating(false);
        }
    }

    async function submitPublishTask() {
        if (!selectedPositionId || publishSubmitting) {
            return;
        }
        setPublishSubmitting(true);
        try {
            await recruitmentApi("/publish-tasks", {
                method: "POST",
                body: JSON.stringify({
                    position_id: selectedPositionId,
                    target_platform: publishPlatform,
                    mode: publishMode,
                }),
            });
            toast.success(recruitmentToast.created(recruitmentToastEntities.publishTask));
            setPublishDialogOpen(false);
            await Promise.all([loadPositionDetail(selectedPositionId), loadLogs()]);
        } catch (error) {
            toast.error(recruitmentToast.createFailed(recruitmentToastEntities.publishTask, formatActionError(error)));
        } finally {
            setPublishSubmitting(false);
        }
    }

    const BATCH_SIZE = 50;
    const CONCURRENCY = 4;

    async function uploadResumes() {
        if (!resumeUploadFileList?.length) {
            setResumeUploadError(recruitmentToast.noResumeSelected);
            return;
        }
        // 指定岗位模式需要选择岗位
        if (resumeUploadMode === "position" && !resumeUploadPositionId) {
            setResumeUploadError(isZh ? "请选择目标岗位" : "Please select a target position");
            return;
        }
        // 暂不选择和智能匹配模式需要组织归属
        if ((resumeUploadMode === "none" || resumeUploadMode === "smart") && !resumeUploadOrgCode.trim()) {
            setResumeUploadError(recruitmentUiText.chooseTargetOrganization);
            return;
        }

        const files = resumeUploadFileList;
        const total = files.length;

        // 根据模式构建请求参数
        let positionId: string | null = null;
        let orgCode: string | null = null;

        if (resumeUploadMode === "position") {
            positionId = resumeUploadPositionId || null;
        } else if (resumeUploadMode === "none") {
            orgCode = resumeUploadOrgCode;
        } else if (resumeUploadMode === "smart") {
            orgCode = resumeUploadOrgCode;
        }

        const query = buildQuery({
            position_id: positionId,
            org_code: orgCode,
            city: resumeUploadCitySource === "manual" ? (resumeUploadCity || null) : null,
            city_source: resumeUploadCitySource,
            match_mode: resumeUploadMode === "smart" ? "smart" : (resumeUploadMode === "none" ? "none" : undefined),
            source: resumeUploadSource,
            duplicate_strategy: resumeUploadDuplicateStrategy,
        });

        const batches: File[][] = [];
        for (let i = 0; i < total; i += BATCH_SIZE) {
            batches.push(Array.from({ length: Math.min(BATCH_SIZE, total - i) },
                (_, j) => files[i + j]));
        }

        setUploadingResume(true);
        setUploadProgress(1);
        setUploadCompletedCount(0);
        abortControllerRef.current = new AbortController();

        let uploadedCount = 0, autoScreenQueued = 0, autoScreenSkipped = 0, autoScreenFailed = 0;
        let aiMatchedCount = 0, aiMatchTotal = 0;
        const allItems: ResumeUploadResponse["items"] = [];
        let batchIndex = 0;
        let completedFiles = 0;

        // 使用 XMLHttpRequest 获取真实的上传进度（字节级）
        function uploadBatchWithProgress(formData: FormData, signal: AbortSignal): Promise<ResumeUploadResponse> {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const authHeaders = getScriptHubAuthHeaderRecord();

                // 关联 AbortController
                const onAbort = () => xhr.abort();
                signal.addEventListener("abort", onAbort, { once: true });

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable && batches.length > 0) {
                        // 计算全局进度：已完成批次 + 当批次上传比例
                        const batchProgress = e.loaded / e.total; // 0~1
                        const currentBatchSize = batches[batchIndex - 1]?.length ?? 0;
                        const globalCompleted = completedFiles + batchProgress * currentBatchSize;
                        const pct = Math.max(1, Math.min(99, Math.round(globalCompleted / total * 100)));
                        setUploadProgress(pct);
                        setUploadCompletedCount(Math.floor(globalCompleted));
                    }
                };

                xhr.onload = () => {
                    signal.removeEventListener("abort", onAbort);
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const json = JSON.parse(xhr.responseText);
                            if (json.success === false) {
                                reject(new Error(json.message || json.error || "Request failed"));
                            } else {
                                resolve(json.data ?? json);
                            }
                        } catch {
                            reject(new Error("Invalid JSON response"));
                        }
                    } else if (xhr.status === 401 || xhr.status === 403) {
                        reject(new Error(isZh ? "登录已过期，请刷新页面后重试" : "Session expired, please refresh the page"));
                    } else {
                        try {
                            const json = JSON.parse(xhr.responseText);
                            reject(new Error(json.detail || json.message || `HTTP ${xhr.status}`));
                        } catch {
                            reject(new Error(`HTTP ${xhr.status}`));
                        }
                    }
                };

                xhr.onerror = () => {
                    signal.removeEventListener("abort", onAbort);
                    reject(new Error(isZh ? "网络错误，请检查网络连接" : "Network error"));
                };

                xhr.onabort = () => {
                    signal.removeEventListener("abort", onAbort);
                    reject(new DOMException("Aborted", "AbortError"));
                };

                xhr.open("POST", `/api/recruitment/candidates/upload-resumes${query}`);
                for (const [key, value] of Object.entries(authHeaders)) {
                    xhr.setRequestHeader(key, value);
                }
                xhr.send(formData);
            });
        }

        async function runOneBatch() {
            while (batchIndex < batches.length) {
                if (abortControllerRef.current?.signal.aborted) return;
                const idx = batchIndex++;
                const batch = batches[idx];
                const formData = new FormData();
                batch.forEach((f) => formData.append("files", f));
                const uploaded = await uploadBatchWithProgress(formData, abortControllerRef.current!.signal);
                uploadedCount += uploaded.uploaded_count;
                autoScreenQueued += uploaded.auto_screen_queued_count;
                autoScreenSkipped += uploaded.auto_screen_skipped_existing_live_task_count;
                autoScreenFailed += uploaded.auto_screen_failed_count;
                if (uploaded.ai_match_result) {
                    aiMatchedCount += uploaded.ai_match_result.matched_count || 0;
                    aiMatchTotal += uploaded.ai_match_result.total_candidates || 0;
                }
                allItems.push(...uploaded.items);
                completedFiles += batch.length;
                setUploadCompletedCount(completedFiles);
                setUploadProgress(Math.max(1, Math.round(completedFiles / total * 100)));
            }
        }

        try {
            await Promise.all(Array.from({ length: CONCURRENCY }, runOneBatch));

            allItems.forEach((item) => {
                if (item.auto_screen_task_id && item.auto_screen_task_status && isLiveTaskStatus(item.auto_screen_task_status)) {
                    attachScreeningTaskMonitor(item.id, item.auto_screen_task_id, {
                        batch: true,
                        suppressFinishToast: true,
                    });
                }
            });
            const aiMatchMsg = aiMatchTotal > 0
                ? (isZh ? `，AI 岗位匹配进行中（${aiMatchTotal} 份），结果将实时更新` : `, AI position matching in progress (${aiMatchTotal}), results will update in real-time`)
                : "";
            const screenMsg = autoScreenQueued > 0 || autoScreenSkipped > 0 || autoScreenFailed > 0
                ? (isZh
                    ? `，自动初筛已入队 ${autoScreenQueued} 份，已跳过 ${autoScreenSkipped} 份${autoScreenFailed > 0 ? `，失败 ${autoScreenFailed} 份` : ""}`
                    : `. Auto-screen queued ${autoScreenQueued}, skipped ${autoScreenSkipped}${autoScreenFailed > 0 ? `, failed ${autoScreenFailed}` : ""}`)
                : "";
            toast.success(
                isZh
                    ? `已上传 ${uploadedCount} 份简历${aiMatchMsg}${screenMsg}。`
                    : `${uploadedCount} resumes uploaded${aiMatchMsg}${screenMsg}.`,
            );
            setResumeUploadOpen(false);
            setResumeUploadError(null);
            setResumeUploadFileList(null);
            setResumeUploadCity("");
            setResumeUploadCitySource("auto");
            setResumeUploadMode("smart");
            setResumeUploadSource("manual");
            setResumeUploadDuplicateStrategy("skip");
            setShowAdvancedOptions(false);
            setIsDraggingFile(false);
            // Optimistic update: immediately add uploaded items to candidate list
            // 排除 matching/unmatched 状态的候选人（智能匹配模式下未识别的候选人在人才库中显示）
            if (allItems.length > 0) {
                const optimisticItems = allItems
                    .filter((item) => !["matching", "unmatched"].includes(item.status))
                    .map((item) =>
                        item.auto_screen_queued
                            ? {
                                ...item,
                                display_status: "screening_running",
                                active_screening_task_status: "queued",
                            }
                            : item,
                    );
                if (optimisticItems.length > 0) {
                    setAllCandidates((prev) => deduplicateCandidates([...optimisticItems, ...prev]));
                    setCandidateTotal((prev) => prev + optimisticItems.length);
                }
            }
            // 智能匹配模式跳人才库，指定岗位模式跳候选人列表
            if (resumeUploadMode === "smart") {
                navigateToRecruitmentPage("talent-pool");
                if (activePage === "talent-pool") {
                    void loadTalentPoolCandidates({ silent: true });
                }
            } else {
                navigateToRecruitmentPage("candidates");
                void refreshCoreData();
            }
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                toast.warning(recruitmentToast.uploadCancelled);
            } else {
                setResumeUploadError(recruitmentToast.createFailed(recruitmentToastEntities.resume, formatActionError(error)));
            }
        } finally {
            setUploadingResume(false);
            setUploadProgress(0);
            setUploadCompletedCount(0);
            abortControllerRef.current = null;
        }
    }

    async function exportCandidates(
        candidateIds: number[],
        options?: { includeResumes?: boolean; fields?: string[] },
    ) {
        if (!candidateIds.length) {
            toast.error(recruitmentToast.selectCandidatesToExport);
            return;
        }
        if (exporting) {
            return;
        }
        const includeResumes = options?.includeResumes ?? true;
        const fields = options?.fields ?? [];
        setExporting(true);
        const exportToastId = toast.loading(recruitmentToast.exporting);
        try {
            const response = await authenticatedFetch("/api/recruitment/candidates/export", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    candidate_ids: candidateIds,
                    include_resumes: includeResumes,
                    fields,
                }),
                cache: "no-store",
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText);
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `candidates_export_${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            toast.success(recruitmentToast.exported(candidateIds.length), {id: exportToastId});
        } catch (error) {
            toast.error(recruitmentToast.exportFailed(error instanceof Error ? error.message : recruitmentToast.unknownError), {id: exportToastId});
        } finally {
            setExporting(false);
        }
    }

    const handleResumeFileChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setResumeUploadError(null);
        setResumeUploadFileList(event.target.files);
    }, []);

    const resumeUploadDialogBody = React.useMemo(() => (
        <DialogContent className="flex h-[min(85vh,700px)] max-h-[85vh] flex-col overflow-hidden sm:max-w-xl">
            <DialogHeader>
                <DialogTitle>{recruitmentUiText.uploadResumeTitle}</DialogTitle>
                <DialogDescription>{recruitmentUiText.resumeUploadDescription}</DialogDescription>
            </DialogHeader>
            <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-4 px-1 py-1">
                    {/* 上传模式选择 */}
                <Field label={isZh ? "上传模式" : "Upload Mode"}>
                    <NativeSelect
                        value={resumeUploadMode}
                        onChange={(event) => setResumeUploadMode(event.target.value as typeof resumeUploadMode)}
                    >
                        <option value="smart">{isZh ? "AI 智能匹配 - 自动识别简历匹配的岗位" : "AI Smart Match - Auto match resumes to positions"}</option>
                        <option value="position">{isZh ? "指定岗位 - 手动选择简历归属的岗位" : "Assign Position - Manually select position"}</option>
                        <option value="none">{isZh ? "暂不选择岗位 - 简历仅归入组织，后续手动分配" : "No Position - Add to organization only"}</option>
                    </NativeSelect>
                </Field>

                {/* 指定岗位模式：显示岗位选择 */}
                {resumeUploadMode === "position" ? (
                    <Field label={recruitmentUiText.linkPosition}>
                        <NativeSelect
                            value={resumeUploadPositionId}
                            onChange={(event) => setResumeUploadPositionId(event.target.value)}
                            disabled={positionsLoading}
                        >
                            <option value="">{positionsLoading ? recruitmentUiText.loading : isZh ? "请选择岗位" : "Select position"}</option>
                            {positions.map((position) => (
                                <option key={position.id} value={position.id}>{position.title}</option>
                            ))}
                        </NativeSelect>
                    </Field>
                ) : null}

                {/* 智能匹配模式：显示说明 */}
                {resumeUploadMode === "smart" ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                        {isZh
                            ? "系统将分析每份简历内容，自动匹配到最合适的岗位。无法匹配的简历将归入人才库，您可稍后手动分配。"
                            : "The system will analyze each resume and match it to the best-fitting position. Unmatched resumes will be added to the talent pool for manual assignment later."}
                    </div>
                ) : null}

                {/* 组织归属（智能匹配和暂不选择模式都需要） */}
                {(resumeUploadMode === "smart" || resumeUploadMode === "none") && showOrganizationFields && organizationSelectOptions.length > 1 ? (
                    <Field label={recruitmentUiText.targetOrganization}>
                        <NativeSelect
                            value={resumeUploadOrgCode}
                            onChange={(event) => setResumeUploadOrgCode(event.target.value)}
                        >
                            <option value="">{recruitmentUiText.chooseTargetOrganization}</option>
                            {organizationSelectOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </NativeSelect>
                    </Field>
                ) : null}

                {/* 高级选项（仅智能匹配模式折叠） */}
                {resumeUploadMode === "smart" ? (
                    <>
                        <button
                            type="button"
                            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                            onClick={() => setShowAdvancedOptions((v) => !v)}
                        >
                            {isZh ? "高级选项" : "Advanced Options"}
                            <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvancedOptions && "rotate-180")} />
                        </button>
                        {showAdvancedOptions ? (
                            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                                {/* 简历来源 */}
                                <Field label={isZh ? "简历来源" : "Resume Source"}>
                                    <NativeSelect
                                        value={resumeUploadSource}
                                        onChange={(event) => setResumeUploadSource(event.target.value as typeof resumeUploadSource)}
                                    >
                                        <option value="manual">{isZh ? "手动上传" : "Manual Upload"}</option>
                                        <option value="boss">{isZh ? "Boss直聘" : "Boss Zhipin"}</option>
                                        <option value="liepin">{isZh ? "猎聘" : "Liepin"}</option>
                                        <option value="headhunter">{isZh ? "猎头推荐" : "Headhunter"}</option>
                                        <option value="other">{isZh ? "其他渠道" : "Other"}</option>
                                    </NativeSelect>
                                </Field>
                                {/* 重复处理策略 */}
                                <Field label={isZh ? "重复处理" : "Duplicate Handling"}>
                                    <NativeSelect
                                        value={resumeUploadDuplicateStrategy}
                                        onChange={(event) => setResumeUploadDuplicateStrategy(event.target.value as typeof resumeUploadDuplicateStrategy)}
                                    >
                                        <option value="skip">{isZh ? "跳过重复简历" : "Skip duplicates"}</option>
                                        <option value="overwrite">{isZh ? "覆盖已有记录" : "Overwrite existing"}</option>
                                        <option value="prompt">{isZh ? "提示我确认" : "Prompt me to confirm"}</option>
                                    </NativeSelect>
                                </Field>
                                {/* 城市 */}
                                <Field label={recruitmentUiText.city}>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex gap-1">
                                            {([
                                                {value: "manual" as const, label: recruitmentUiText.manualCityEntry},
                                                {value: "auto" as const, label: recruitmentUiText.autoDetectCity},
                                            ] as const).map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    className={cn(
                                                        "rounded-md border px-2.5 py-1 text-sm transition-colors",
                                                        resumeUploadCitySource === opt.value
                                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-700",
                                                    )}
                                                    onClick={() => setResumeUploadCitySource(opt.value)}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                        {resumeUploadCitySource === "manual" ? (
                                            <div className="flex flex-col gap-1.5">
                                                <Input
                                                    list="city-options"
                                                    placeholder={recruitmentUiText.cityPlaceholder}
                                                    value={resumeUploadCity}
                                                    onChange={(event) => setResumeUploadCity(event.target.value)}
                                                />
                                                <datalist id="city-options">
                                                    {POPULAR_CITIES.map((city) => (
                                                        <option key={city} value={city}/>
                                                    ))}
                                                </datalist>
                                                <div className="flex flex-wrap gap-1">
                                                    {POPULAR_CITIES.slice(0, 8).map((city) => (
                                                        <button
                                                            key={city}
                                                            type="button"
                                                            className={cn(
                                                                "rounded-full border px-2 py-0.5 text-sm transition-colors",
                                                                resumeUploadCity === city
                                                                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-700",
                                                            )}
                                                            onClick={() => setResumeUploadCity(city)}
                                                        >
                                                            {city}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : resumeUploadCitySource === "auto" ? (
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                {recruitmentUiText.cityAutoHint}
                                            </p>
                                        ) : null}
                                    </div>
                                </Field>
                            </div>
                        ) : null}
                    </>
                ) : (
                    <>
                        {/* 非智能匹配模式：直接显示简历来源和重复处理 */}
                        <Field label={isZh ? "简历来源" : "Resume Source"}>
                            <NativeSelect
                                value={resumeUploadSource}
                                onChange={(event) => setResumeUploadSource(event.target.value as typeof resumeUploadSource)}
                            >
                                <option value="manual">{isZh ? "手动上传" : "Manual Upload"}</option>
                                <option value="boss">{isZh ? "Boss直聘" : "Boss Zhipin"}</option>
                                <option value="liepin">{isZh ? "猎聘" : "Liepin"}</option>
                                <option value="headhunter">{isZh ? "猎头推荐" : "Headhunter"}</option>
                                <option value="other">{isZh ? "其他渠道" : "Other"}</option>
                            </NativeSelect>
                        </Field>
                        <Field label={isZh ? "重复处理" : "Duplicate Handling"}>
                            <NativeSelect
                                value={resumeUploadDuplicateStrategy}
                                onChange={(event) => setResumeUploadDuplicateStrategy(event.target.value as typeof resumeUploadDuplicateStrategy)}
                            >
                                <option value="skip">{isZh ? "跳过重复简历" : "Skip duplicates"}</option>
                                <option value="overwrite">{isZh ? "覆盖已有记录" : "Overwrite existing"}</option>
                                <option value="prompt">{isZh ? "提示我确认" : "Prompt me to confirm"}</option>
                            </NativeSelect>
                        </Field>
                        <Field label={recruitmentUiText.city}>
                            <div className="flex flex-col gap-2">
                                <div className="flex gap-1">
                                    {([
                                        {value: "manual" as const, label: recruitmentUiText.manualCityEntry},
                                        {value: "auto" as const, label: recruitmentUiText.autoDetectCity},
                                    ] as const).map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={cn(
                                                "rounded-md border px-2.5 py-1 text-sm transition-colors",
                                                resumeUploadCitySource === opt.value
                                                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-700",
                                            )}
                                            onClick={() => setResumeUploadCitySource(opt.value)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                {resumeUploadCitySource === "manual" ? (
                                    <div className="flex flex-col gap-1.5">
                                        <Input
                                            list="city-options"
                                            placeholder={recruitmentUiText.cityPlaceholder}
                                            value={resumeUploadCity}
                                            onChange={(event) => setResumeUploadCity(event.target.value)}
                                        />
                                        <datalist id="city-options">
                                            {POPULAR_CITIES.map((city) => (
                                                <option key={city} value={city}/>
                                            ))}
                                        </datalist>
                                        <div className="flex flex-wrap gap-1">
                                            {POPULAR_CITIES.slice(0, 8).map((city) => (
                                                <button
                                                    key={city}
                                                    type="button"
                                                    className={cn(
                                                        "rounded-full border px-2 py-0.5 text-sm transition-colors",
                                                        resumeUploadCity === city
                                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-700",
                                                    )}
                                                    onClick={() => setResumeUploadCity(city)}
                                                >
                                                    {city}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : resumeUploadCitySource === "auto" ? (
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {recruitmentUiText.cityAutoHint}
                                    </p>
                                ) : null}
                            </div>
                        </Field>
                    </>
                )}

                {/* 文件上传区域 */}
                <label
                    className={cn(
                        "relative flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-colors",
                        "h-28",
                        isDraggingFile
                            ? "border-slate-900 bg-slate-100 dark:border-slate-100 dark:bg-slate-800"
                            : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800",
                    )}
                    onClick={(e) => { if (resumeUploadFileList && resumeUploadFileList.length > 0) e.preventDefault(); }}
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(false);
                        const files = e.dataTransfer.files;
                        if (files.length > 0) {
                            setResumeUploadError(null);
                            setResumeUploadFileList(files);
                        }
                    }}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf"
                        className="sr-only"
                        onChange={handleResumeFileChange}
                    />
                    {resumeUploadFileList && resumeUploadFileList.length > 0 ? (
                        <>
                            <FileText className="h-10 w-10 text-slate-600 dark:text-slate-300" />
                            <p className="text-base font-medium text-slate-700 dark:text-slate-200 leading-tight">
                                {resumeUploadFileList.length === 1
                                    ? resumeUploadFileList[0].name
                                    : `${resumeUploadFileList.length} ${isZh ? "个文件" : "files"}`}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {recruitmentUiText.filesSelected(resumeUploadFileList.length)}
                            </p>
                            <button
                                type="button"
                                className="absolute right-2 top-2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition-colors"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setResumeUploadFileList(null);
                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                }}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </>
                    ) : (
                        <>
                            <Upload className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                            <p className="text-base text-slate-600 dark:text-slate-300">
                                {isZh ? "点击或拖拽上传简历" : "Click or drag to upload"}
                            </p>
                            <p className="text-sm text-slate-400 dark:text-slate-500">
                                {isZh ? "仅支持 PDF 格式" : "PDF format only"}
                            </p>
                        </>
                    )}
                </label>
                </div>
            </ScrollArea>
            <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
                <span className="min-h-[20px] flex-1 text-base text-rose-600 dark:text-rose-300">
                    {resumeUploadError ?? ""}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                    {uploadingResume ? (
                        <Button variant="outline" onClick={() => abortControllerRef.current?.abort()}>
                            {recruitmentUiText.cancelUpload}
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={() => setResumeUploadOpen(false)}>{recruitmentUiText.cancelButton}</Button>
                    )}
                    <Button onClick={() => void uploadResumes()} disabled={uploadingResume}>
                        {uploadingResume ? recruitmentUiText.uploading : recruitmentUiText.startUpload}
                    </Button>
                </div>
            </DialogFooter>
            {uploadingResume && (
                <div className="space-y-1">
                    <div className="flex justify-between text-sm text-slate-500 dark:text-slate-400">
                        <span>{recruitmentUiText.uploadedProgress(uploadCompletedCount, resumeUploadFileList?.length ?? 0)}</span>
                        <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-1.5 rounded-full bg-slate-900 dark:bg-slate-100 transition-all"
                             style={{ width: `${uploadProgress}%` }}/>
                    </div>
                </div>
            )}
        </DialogContent>
    ), [recruitmentUiText, positionsLoading, positions, resumeUploadPositionId, showOrganizationFields, organizationSelectOptions, resumeUploadOrgCode, resumeUploadCitySource, resumeUploadCity, resumeUploadFileList, resumeUploadError, uploadingResume, uploadCompletedCount, uploadProgress, resumeUploadMode, resumeUploadSource, resumeUploadDuplicateStrategy, isZh, showAdvancedOptions, isDraggingFile]);

    function openResumeUploadDialog() {
        if (activePage === "positions" && selectedPositionId) {
            setResumeUploadPositionId(String(selectedPositionId));
            setResumeUploadOrgCode(normalizeRecruitmentOrgCode(positionMap.get(selectedPositionId)?.org_code || activeCreateOrgCode));
        } else {
            setResumeUploadPositionId("all");
            setResumeUploadOrgCode(currentResumeUploadDefaultOrgCode);
        }
        setResumeUploadOpen(true);
    }

    async function saveCandidate() {
        if (!selectedCandidateId || candidateSaving) {
            return;
        }
        setCandidateSaving(true);
        try {
            const originalPositionId = candidateDetail?.candidate.position_id ?? null;
            const nextPositionId = candidateEditor.positionId ? Number(candidateEditor.positionId) : null;
            const payload: Record<string, unknown> = {
                name: candidateEditor.name.trim(),
                phone: candidateEditor.phone.trim() || null,
                email: candidateEditor.email.trim() || null,
                current_company: candidateEditor.currentCompany.trim() || null,
                years_of_experience: candidateEditor.yearsOfExperience.trim() || null,
                education: candidateEditor.education.trim() || null,
                age: (() => { const v = Number(candidateEditor.age.trim()); return v && !isNaN(v) ? v : null; })(),
                city: candidateEditor.city.trim() || null,
                expected_city: candidateEditor.expectedCity.trim() || null,
                notes: candidateEditor.notes.trim() || null,
                tags: splitTags(candidateEditor.tagsText),
                manual_override_score: candidateEditor.manualOverrideScore.trim()
                    ? Number(candidateEditor.manualOverrideScore)
                    : null,
                manual_override_reason: candidateEditor.manualOverrideReason.trim() || null,
                hr_feedback: candidateEditor.hrFeedback || null,
                hr_feedback_reason: candidateEditor.hrFeedbackReason.trim() || null,
                owner_id: candidateEditor.ownerId.trim() || null,
            };
            if (nextPositionId !== originalPositionId) {
                payload.position_id = nextPositionId;
            }
            await recruitmentApi(`/candidates/${selectedCandidateId}`, {
                method: "PATCH",
                body: JSON.stringify(payload),
            });
            toast.success(recruitmentToast.updated(recruitmentToastEntities.candidate));
            checkedDuplicateCandidateIdRef.current = null;
            await Promise.all([loadCandidateDetail(selectedCandidateId, {includeDuplicates: true}), loadCandidates(), refreshCandidateStats()]);
        } catch (error) {
            toast.error(recruitmentToast.saveFailed(recruitmentToastEntities.candidate, formatActionError(error)));
        } finally {
            setCandidateSaving(false);
        }
    }

    async function updateCandidateStatus(nextStatus: string) {
        if (!selectedCandidateId || !candidateDetail) {
            return;
        }
        setPendingStatus(null);
        try {
            await recruitmentApi(`/candidates/${selectedCandidateId}/status`, {
                method: "POST",
                body: JSON.stringify({
                    status: nextStatus,
                    reason: statusUpdateReason.trim() || null,
                }),
            });
            toast.success(recruitmentToast.updated(recruitmentToastEntities.candidate));
            setStatusUpdateReason("");
            await Promise.all([
                loadCandidateDetail(selectedCandidateId),
                loadCandidates(),
                refreshCandidateStats(),
            ]);
        } catch (error) {
            toast.error(recruitmentToast.updateFailed(recruitmentToastEntities.candidate, formatActionError(error)));
        }
    }

    async function triggerScreening(targetCandidateIds?: number[]) {
        const isBatchRequest = Array.isArray(targetCandidateIds);
        if (isBatchRequest && batchStopScreeningTaskIds.length) {
            if (isBatchScreeningCancelling) {
                return;
            }
            try {
                const taskIdsToStop = batchStopScreeningTaskIds;
                const logs = await Promise.all(taskIdsToStop.map((taskId) => cancelTaskGeneration(taskId, recruitmentUiText.batchScreening, {silent: true})));
                const cancelledTaskIds = logs
                    .filter((log): log is AITaskLog => Boolean(log && log.status === "cancelled"))
                    .map((log) => log.id);
                if (cancelledTaskIds.length) {
                    cancelledTaskIds.forEach((taskId) => stopTaskMonitor(taskId));
                    clearScreeningTaskSnapshotsByTaskIds(cancelledTaskIds);
                    setActiveBatchScreeningTaskIds((current) => current.filter((taskId) => !cancelledTaskIds.includes(taskId)));
                    setActiveScreeningTaskMap((current) => {
                        const next = {...current};
                        Object.entries(next).forEach(([candidateId, taskId]) => {
                            if (cancelledTaskIds.includes(taskId)) {
                                delete next[Number(candidateId)];
                            }
                        });
                        return next;
                    });
                    toast.success(recruitmentUiText.stopBatchScreeningCompleted(cancelledTaskIds.length));
                } else if (logs.some((log) => log?.status === "cancelling")) {
                    toast.success(recruitmentUiText.stopBatchScreeningRequested);
                }
            } catch (error) {
                toast.error(recruitmentToast.stopFailed(recruitmentUiText.batchScreening, formatActionError(error)));
            }
            return;
        }
        if (!isBatchRequest && selectedCandidateScreeningTaskId) {
            if (isSelectedCandidateScreeningCancelling) {
                return;
            }
            try {
                const log = await cancelTaskGeneration(selectedCandidateScreeningTaskId, recruitmentUiText.screening);
                if (log?.status === "cancelled") {
                    stopTaskMonitor(selectedCandidateScreeningTaskId);
                    setActiveScreeningTaskMap((current) => {
                        const next = {...current};
                        if (selectedCandidateId && next[selectedCandidateId] === selectedCandidateScreeningTaskId) {
                            delete next[selectedCandidateId];
                        }
                        return next;
                    });
                }
            } catch (error) {
                toast.error(recruitmentToast.stopFailed(recruitmentUiText.screening, formatActionError(error)));
            }
            return;
        }
        if (screeningLaunchInFlightRef.current) {
            return;
        }
        const candidateIds = Array.from(new Set(
            (targetCandidateIds?.length ? targetCandidateIds : (selectedCandidateId ? [selectedCandidateId] : []))
                .filter(Boolean),
        ));
        if (!candidateIds.length) {
            toast.error(recruitmentUiText.noScreeningTarget);
            return;
        }
        screeningLaunchInFlightRef.current = true;
        setScreeningSubmitting(true);
        try {
            if (isBatchRequest) {
                const response = await recruitmentApi<RecruitmentTaskBatchStartResponse>("/candidates/screen/batch-start", {
                    method: "POST",
                    body: JSON.stringify({
                        candidate_ids: candidateIds,
                        skill_ids: [],
                        use_candidate_memory: true,
                        use_position_skills: true,
                    }),
                });
                // 只对真正新入队或仍在运行的任务挂载 monitor，已完成的复用任务不挂载
                response.tasks.forEach((task) => {
                    if (!task.related_candidate_id || !task.task_id) return;
                    if (task.status && isLiveTaskStatus(task.status)) {
                        attachScreeningTaskMonitor(task.related_candidate_id, task.task_id, {
                            batch: true,
                            suppressFinishToast: true,
                        });
                    }
                });
                if (response.queued_count || response.skipped_existing_live_task_count) {
                    toast.success(
                        recruitmentToast.screeningQueued(
                            response.queued_count,
                            response.skipped_existing_live_task_count,
                            response.failed_count || 0,
                        ),
                    );
                } else {
                    toast.error(recruitmentUiText.noScreeningQueued);
                }
            } else {
                const candidateId = candidateIds[0];
                const task = await recruitmentApi<RecruitmentTaskStartResponse>(`/candidates/${candidateId}/screen/start`, {
                    method: "POST",
                    body: JSON.stringify({
                        skill_ids: [],
                        use_candidate_memory: true,
                        use_position_skills: true,
                    }),
                });
                if (task.status && isLiveTaskStatus(task.status)) {
                    // 新入队或仍在运行的任务：挂载 monitor 轮询
                    attachScreeningTaskMonitor(candidateId, task.task_id, {
                        suppressFinishToast: false,
                    });
                    toast.success(task.reused_existing_task ? recruitmentToast.screeningTaskReused : recruitmentUiText.queueJoined);
                } else {
                    // 已完成的复用任务：不挂载 monitor，直接提示已完成
                    toast.success(recruitmentToast.screeningCompleted(false));
                }
            }
        } catch (error) {
            toast.error(recruitmentToast.screeningStartFailed(formatActionError(error)));
        } finally {
            screeningLaunchInFlightRef.current = false;
            setScreeningSubmitting(false);
        }
    }

    async function triggerFreshScreening(targetCandidateIds?: number[]) {
        const candidateIds = Array.from(new Set(
            (targetCandidateIds?.length ? targetCandidateIds : (selectedCandidateId ? [selectedCandidateId] : []))
                .filter(Boolean),
        ));
        if (!candidateIds.length) {
            toast.error(recruitmentUiText.noScreeningTarget);
            return;
        }
        setScreeningSubmitting(true);
        try {
            if (candidateIds.length > 1) {
                const response = await recruitmentApi<RecruitmentTaskBatchStartResponse>("/candidates/screen/batch-start", {
                    method: "POST",
                    timeoutMs: 45000,
                    body: JSON.stringify({
                        candidate_ids: candidateIds,
                        skill_ids: [],
                        use_candidate_memory: false,
                        use_position_skills: true,
                        allow_reuse_parse: false,
                        allow_score_only_rerun: false,
                    }),
                });
                response.tasks.forEach((task) => {
                    if (!task.related_candidate_id || !task.task_id) return;
                    if (task.status && isLiveTaskStatus(task.status)) {
                        attachScreeningTaskMonitor(task.related_candidate_id, task.task_id, {
                            batch: true,
                            suppressFinishToast: true,
                        });
                    }
                });
                toast.success(
                    isZh
                        ? `已按当前岗位最新规则重新初筛 ${response.queued_count || 0} 位候选人`
                        : `Queued fresh screening for ${response.queued_count || 0} candidate(s).`,
                );
                setSelectedCandidateIds((current) => current.filter((candidateId) => !candidateIds.includes(candidateId)));
                return;
            }

            const candidateId = candidateIds[0];
            const task = await recruitmentApi<RecruitmentTaskStartResponse>(`/candidates/${candidateId}/screen/start`, {
                method: "POST",
                timeoutMs: 45000,
                body: JSON.stringify({
                    skill_ids: [],
                    use_candidate_memory: false,
                    use_position_skills: true,
                    allow_reuse_parse: false,
                    allow_score_only_rerun: false,
                }),
            });
            if (task.status && isLiveTaskStatus(task.status)) {
                attachScreeningTaskMonitor(candidateId, task.task_id, {
                    suppressFinishToast: false,
                });
            }
            toast.success(isZh ? "已按当前岗位最新规则重新初筛" : "Fresh screening queued.");
            setSelectedCandidateIds((current) => current.filter((item) => item !== candidateId));
        } catch (error) {
            toast.error(recruitmentToast.screeningStartFailed(formatActionError(error)));
        } finally {
            setScreeningSubmitting(false);
        }
    }

    async function generateInterviewQuestions() {
        if (!selectedCandidateId) {
            return;
        }
        const candidateId = selectedCandidateId;
        if (currentCandidateInterviewTaskId) {
            if (isCurrentInterviewTaskCancelling) {
                return;
            }
            try {
                const log = await cancelTaskGeneration(currentCandidateInterviewTaskId, isZh ? "面试题生成" : "interview question generation");
                if (log?.status === "cancelled") {
                    stopTaskMonitor(currentCandidateInterviewTaskId);
                    setActiveInterviewTaskId((current) => (current === currentCandidateInterviewTaskId ? null : current));
                    setActiveInterviewCandidateId((current) => (current === candidateId ? null : current));
                }
            } catch (error) {
                toast.error(recruitmentToast.stopFailed("面试题生成", formatActionError(error)));
            }
            return;
        }
        if (interviewGenerating) {
            return;
        }
        const manualSkillIds = interviewSkillSelectionDirty ? selectedInterviewSkillIds : [];
        let started = false;
        setInterviewGenerating(true);
        try {
            const task = await recruitmentApi<RecruitmentTaskStartResponse>(`/candidates/${candidateId}/interview-questions/start`, {
                method: "POST",
                body: JSON.stringify({
                    round_name: interviewRoundName.trim() || localizedInitialInterviewRoundName,
                    custom_requirements: interviewCustomRequirements.trim() || null,
                    skill_ids: manualSkillIds,
                    use_candidate_memory: !interviewSkillSelectionDirty,
                    use_position_skills: !interviewSkillSelectionDirty,
                }),
            });
            started = true;
            setActiveInterviewTaskId(task.task_id);
            setActiveInterviewCandidateId(candidateId);
            await loadLogs({silent: true});
            startTaskMonitor(task.task_id, {
                onFinish: async (log) => {
                    if (!mountedRef.current) {
                        return;
                    }
                    setActiveInterviewTaskId((current) => (current === task.task_id ? null : current));
                    setActiveInterviewCandidateId((current) => (current === candidateId ? null : current));
                    await Promise.all([
                        loadLogs({silent: true}),
                        selectedCandidateIdRef.current === candidateId
                            ? loadCandidateDetail(candidateId, {silent: true})
                            : Promise.resolve(null),
                    ]);
                    if (log.status === "success" || log.status === "fallback") {
                        toast.success(recruitmentToast.generated("面试题", log.status === "fallback"));
                        return;
                    }
                    if (log.status === "cancelled") {
                        toast.success(recruitmentToast.stopped("面试题生成"));
                        return;
                    }
                    toast.error(recruitmentToast.interviewQuestionGenerationFailed(log.error_message || recruitmentToast.unknownError));
                },
            });
            toast.success(recruitmentToast.interviewQuestionGenerationStarted);
        } catch (error) {
            toast.error(recruitmentToast.interviewQuestionGenerationFailed(error instanceof Error ? error.message : recruitmentToast.unknownError));
        } finally {
            if (!started) {
                setInterviewGenerating(false);
            }
        }
    }

    async function sendChatMessage() {
        if (canStopCurrentRun) {
            if (activeChatTaskId) {
                if (isCurrentChatTaskCancelling) {
                    return;
                }
                try {
                    const log = await cancelTaskGeneration(activeChatTaskId, isZh ? "AI 助手" : "AI Assistant");
                    if (log?.status === "cancelled") {
                        stopTaskMonitor(activeChatTaskId);
                        if (activeChatMessageId) {
                            updateChatMessage(activeChatMessageId, (message) => ({
                                ...message,
                                pending: false,
                                taskId: null,
                                logId: log.id,
                            }));
                        }
                        setActiveChatTaskId((current) => (current === activeChatTaskId ? null : current));
                        setActiveChatMessageId((current) => (current === activeChatMessageId ? null : current));
                    }
                } catch (error) {
                    toast.error(recruitmentToast.stopFailed("助手生成", formatActionError(error)));
                }
                return;
            }
            if (assistantStreamStopping) {
                return;
            }
            setAssistantStreamStopping(true);
            assistantStreamAbortRef.current?.abort();
            return;
        }
        if (chatSending) {
            return;
        }
        const message = chatInput.trim();
        if (!message) {
            return;
        }
        setAutoFollowStream(true);
        setIsUserScrolledUp(false);
        if (shouldUseStreamingAssistant(message)) {
            await runStreamingAssistant(message);
            return;
        }
        const userMessageId = `u-${Date.now()}`;
        setChatMessages((current) => [
            ...current,
            {id: userMessageId, role: "user", content: message, createdAt: new Date().toISOString()},
        ]);
        setChatInput("");
        setChatSending(true);
        let startedAsyncTask = false;
        try {
            const response = await recruitmentApi<ChatResponse>("/chat/start", {
                method: "POST",
                body: JSON.stringify({
                    message,
                    context: {
                        position_id: chatContext.position_id,
                        candidate_id: chatContext.candidate_id,
                        skill_ids: chatContext.skill_ids,
                    },
                }),
            });
            setChatContext(response.context);
            if (!response.pending || !response.task_id) {
                setChatMessages((current) => [
                    ...current,
                    {
                        id: `a-${Date.now()}`,
                        role: "assistant",
                        content: response.reply,
                        createdAt: new Date().toISOString(),
                        actions: response.actions,
                        logId: response.log_id ?? undefined,
                        memorySource: response.memory_source,
                        modelProvider: response.model_provider,
                        modelName: response.model_name,
                        usedSkillIds: response.used_skill_ids,
                        usedSkills: response.used_skills,
                        usedFallback: response.used_fallback,
                        fallbackError: response.fallback_error,
                    },
                ]);
                if (response.used_fallback) {
                    toast.error(recruitmentToast.screeningFallback(response.fallback_error || recruitmentToast.noReason));
                }
                await Promise.all([loadLogs({silent: true})]);
                return;
            }
            const pendingMessageId = `a-${Date.now()}`;
            startedAsyncTask = true;
            setActiveChatTaskId(response.task_id);
            setActiveChatMessageId(pendingMessageId);
            setChatMessages((current) => [
                ...current,
                {
                    id: pendingMessageId,
                    role: "assistant",
                    content: isZh ? "助手正在思考..." : "Assistant is thinking...",
                    createdAt: new Date().toISOString(),
                    pending: true,
                    taskId: response.task_id,
                    logId: response.log_id ?? undefined,
                    memorySource: response.memory_source,
                    modelProvider: response.model_provider,
                    modelName: response.model_name,
                },
            ]);
            await loadLogs({silent: true});
            startTaskMonitor(response.task_id, {
                onUpdate: (log) => {
                    if (log.status === "cancelling") {
                        updateChatMessage(pendingMessageId, (chatMessage) => ({
                            ...chatMessage,
                            content: isZh ? "正在停止生成..." : "Stopping generation...",
                        }));
                    }
                },
                onFinish: async (log) => {
                    if (!mountedRef.current) {
                        return;
                    }
                    const usedSkills = resolveLogSkillSnapshots(log, skillMap);
                    const reply = extractChatReplyFromLog(log);
                    updateChatMessage(pendingMessageId, (chatMessage) => ({
                        ...chatMessage,
                        content: reply,
                        pending: false,
                        taskId: null,
                        logId: log.id,
                        memorySource: log.memory_source,
                        modelProvider: log.model_provider,
                        modelName: log.model_name,
                        usedSkillIds: log.related_skill_ids,
                        usedSkills,
                        usedFallback: log.status === "fallback",
                        fallbackError: log.error_message,
                    }));
                    setActiveChatTaskId((current) => (current === response.task_id ? null : current));
                    setActiveChatMessageId((current) => (current === pendingMessageId ? null : current));
                    await Promise.all([loadLogs({silent: true})]);
                    if (log.status === "fallback") {
                        toast.error(recruitmentToast.screeningFallback(log.error_message || recruitmentToast.noReason));
                    } else if (log.status === "failed") {
                        toast.error(recruitmentToast.sendFailed("发送", log.error_message || recruitmentToast.unknownError));
                    } else if (log.status === "cancelled") {
                        toast.success(recruitmentToast.assistantGenerationStopped);
                    }
                },
            });
        } catch (error) {
            setChatMessages((current) => [
                ...current,
                {
                    id: `e-${Date.now()}`,
                    role: "assistant",
                    content: recruitmentToast.sendFailed("发送", error instanceof Error ? error.message : recruitmentToast.unknownError),
                    createdAt: new Date().toISOString(),
                },
            ]);
        } finally {
            if (!startedAsyncTask) {
                setChatSending(false);
            }
        }
    }

    async function saveChatContext(
        nextPositionId: number | null,
        nextSkillIds: number[],
        nextCandidateId: number | null = null,
        options?: { quiet?: boolean },
    ) {
        const previousContext = chatContext;
        const optimisticContext = buildOptimisticChatContext(
            nextPositionId,
            nextSkillIds,
            nextCandidateId,
            previousContext,
        );
        chatContextRef.current = optimisticContext;
        setChatContext(optimisticContext);
        try {
            const response = await recruitmentApi<ChatContext>("/chat/context", {
                method: "POST",
                body: JSON.stringify({
                    position_id: nextPositionId,
                    candidate_id: nextCandidateId,
                    skill_ids: nextSkillIds,
                }),
            });
            chatContextRef.current = response;
            setChatContext(response);
            if (options?.quiet) {
                return;
            }
            toast.success(recruitmentToast.contextUpdated);
        } catch (error) {
            chatContextRef.current = previousContext;
            setChatContext(previousContext);
            if (options?.quiet) {
                return;
            }
            toast.error(recruitmentToast.contextUpdateFailed(error instanceof Error ? error.message : recruitmentToast.unknownError));
        }
    }

    function toggleSkillInAssistant(skillId: number) {
        if (!enabledSkillMap.has(skillId)) {
            return;
        }
        const nextSkillIds = assistantContextSkillIds.includes(skillId)
            ? assistantContextSkillIds.filter((item) => item !== skillId)
            : [...assistantContextSkillIds, skillId];
        void saveChatContext(chatContext.position_id || null, nextSkillIds, chatContext.candidate_id || null);
        queueAssistantInputFocus();
    }

    function toggleCandidateSelection(candidateId: number, nextChecked?: boolean) {
        setSelectedCandidateIds((current) => toggleIdInList(current, candidateId, nextChecked));
    }

    function toggleInterviewSkillSelection(skillId: number) {
        setSelectedInterviewSkillIds((current) => {
            const next = current.includes(skillId)
                ? current.filter((item) => item !== skillId)
                : [...current, skillId];
            setInterviewSkillSelectionDirty(next.length > 0);
            return next;
        });
    }

    function openMailSenderEditor(sender?: RecruitmentMailSenderConfig) {
        void ensureMailSettingsLoaded();
        if (sender) {
            setMailSenderEditingId(sender.id);
            setMailSenderForm({
                name: sender.name,
                fromName: sender.from_name || "",
                fromEmail: sender.from_email,
                smtpHost: sender.smtp_host,
                smtpPort: String(sender.smtp_port),
                username: sender.username,
                password: "",
                useSsl: sender.use_ssl,
                useStarttls: sender.use_starttls,
                isDefault: sender.is_default,
                isEnabled: sender.is_enabled,
            });
        } else {
            setMailSenderEditingId(null);
            setMailSenderForm(emptyMailSenderForm());
        }
        setMailSenderDialogOpen(true);
    }

    function applyMailSenderPreset(presetKey: MailSenderPresetKey) {
        const preset = mailSenderPresets.find((item) => item.key === presetKey);
        if (!preset) {
            return;
        }
        setMailSenderForm((current) => ({
            ...current,
            smtpHost: preset.smtpHost,
            smtpPort: preset.smtpPort,
            useSsl: preset.useSsl,
            useStarttls: preset.useStarttls,
        }));
    }

    async function submitMailSender() {
        if (mailSenderSaving) {
            return;
        }
        setMailSenderSaving(true);
        try {
            const inferredPreset = inferMailSenderPreset(mailSenderForm.fromEmail || mailSenderForm.username);
            const smtpHost = mailSenderForm.smtpHost.trim() || inferredPreset?.smtpHost || "";
            const smtpPort = Number(mailSenderForm.smtpPort || inferredPreset?.smtpPort || "465");
            const useSsl = mailSenderForm.smtpHost.trim() ? mailSenderForm.useSsl : (inferredPreset?.useSsl ?? mailSenderForm.useSsl);
            const useStarttls = mailSenderForm.smtpHost.trim() ? mailSenderForm.useStarttls : (inferredPreset?.useStarttls ?? mailSenderForm.useStarttls);
            if (!smtpHost) {
                toast.error(recruitmentToast.smtpHostRequired);
                return;
            }
            const payload = {
                name: mailSenderForm.name.trim(),
                from_name: mailSenderForm.fromName.trim() || null,
                from_email: mailSenderForm.fromEmail.trim(),
                smtp_host: smtpHost,
                smtp_port: smtpPort,
                username: mailSenderForm.username.trim(),
                password: mailSenderForm.password.trim() || null,
                use_ssl: useSsl,
                use_starttls: useStarttls,
                is_default: mailSenderForm.isDefault,
                is_enabled: mailSenderForm.isEnabled,
            };
            if (mailSenderEditingId) {
                await recruitmentApi(`/mail-senders/${mailSenderEditingId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success(recruitmentToast.updated(recruitmentToastEntities.mailSender));
            } else {
                await recruitmentApi(`/mail-senders`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success(recruitmentToast.created(recruitmentToastEntities.mailSender));
            }
            setMailSenderDialogOpen(false);
            try {
                await loadMailSettings();
            } catch (refreshError) {
                toast.error(recruitmentToast.savedButRefreshFailed(recruitmentToastEntities.mailSender, formatActionError(refreshError)));
            }
        } catch (error) {
            toast.error(recruitmentToast.saveFailed(recruitmentToastEntities.mailSender, formatActionError(error)));
        } finally {
            setMailSenderSaving(false);
        }
    }

    async function deleteMailSender(senderId: number) {
        const actionKey = `mail-sender-${senderId}`;
        setDeleteActionKey(actionKey);
        try {
            await recruitmentApi(`/mail-senders/${senderId}`, {method: "DELETE"});
            setMailSenderDeleteTarget(null);
            toast.success(recruitmentToast.deleted(recruitmentToastEntities.mailSender));
            await loadMailSettings();
        } catch (error) {
            toast.error(recruitmentToast.deleteFailed(recruitmentToastEntities.mailSender, error instanceof Error ? error.message : recruitmentToast.unknownError));
        } finally {
            setDeleteActionKey((current) => (current === actionKey ? null : current));
        }
    }

    function openMailRecipientEditor(recipient?: RecruitmentMailRecipient) {
        void ensureMailSettingsLoaded();
        if (recipient) {
            setMailRecipientEditingId(recipient.id);
            setMailRecipientForm({
                name: recipient.name,
                email: recipient.email,
                department: recipient.department || "",
                roleTitle: recipient.role_title || "",
                tagsText: joinTags(recipient.tags),
                notes: recipient.notes || "",
                isEnabled: recipient.is_enabled,
            });
        } else {
            setMailRecipientEditingId(null);
            setMailRecipientForm(emptyMailRecipientForm());
        }
        setMailRecipientDialogOpen(true);
    }

    async function submitMailRecipient() {
        if (mailRecipientSaving) {
            return;
        }
        setMailRecipientSaving(true);
        try {
            const payload = {
                name: mailRecipientForm.name.trim(),
                email: mailRecipientForm.email.trim(),
                department: mailRecipientForm.department.trim() || null,
                role_title: mailRecipientForm.roleTitle.trim() || null,
                tags: splitTags(mailRecipientForm.tagsText),
                notes: mailRecipientForm.notes.trim() || null,
                is_enabled: mailRecipientForm.isEnabled,
            };
            if (mailRecipientEditingId) {
                await recruitmentApi(`/mail-recipients/${mailRecipientEditingId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success(recruitmentToast.updated(recruitmentToastEntities.mailRecipient));
            } else {
                await recruitmentApi(`/mail-recipients`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success(recruitmentToast.created(recruitmentToastEntities.mailRecipient));
            }
            setMailRecipientDialogOpen(false);
            await loadMailSettings();
        } catch (error) {
            toast.error(recruitmentToast.saveFailed(recruitmentToastEntities.mailRecipient, error instanceof Error ? error.message : recruitmentToast.unknownError));
        } finally {
            setMailRecipientSaving(false);
        }
    }

    async function deleteMailRecipient(recipientId: number) {
        const actionKey = `mail-recipient-${recipientId}`;
        setDeleteActionKey(actionKey);
        try {
            await recruitmentApi(`/mail-recipients/${recipientId}`, {method: "DELETE"});
            setMailRecipientDeleteTarget(null);
            toast.success(recruitmentToast.deleted(recruitmentToastEntities.mailRecipient));
            await loadMailSettings();
        } catch (error) {
            toast.error(recruitmentToast.deleteFailed(recruitmentToastEntities.mailRecipient, error instanceof Error ? error.message : recruitmentToast.unknownError));
        } finally {
            setDeleteActionKey((current) => (current === actionKey ? null : current));
        }
    }

    function openResumeMailDialog(
        candidateIds?: number[],
        overrides?: Partial<ResumeMailFormState> & { mode?: ResumeMailDialogMode; sourceDispatchId?: number | null },
    ) {
        void ensureMailSettingsLoaded();
        const nextCandidateIds = Array.from(new Set(
            (candidateIds?.length
                ? candidateIds
                : (selectedCandidateIds.length ? selectedCandidateIds : (selectedCandidateId ? [selectedCandidateId] : [])))
                .filter(Boolean),
        ));
        if (!nextCandidateIds.length) {
            toast.error(recruitmentToast.noResumeMailCandidates);
            return;
        }
        setResumeMailDialogMode(overrides?.mode || "send");
        setResumeMailSourceDispatchId(overrides?.sourceDispatchId ?? null);
        setResumeMailForm({
            candidateIds: nextCandidateIds,
            senderConfigId: overrides?.senderConfigId ?? defaultMailSenderId,
            recipientIds: overrides?.recipientIds || [],
            extraRecipientEmails: overrides?.extraRecipientEmails || "",
            subject: overrides?.subject || "",
            bodyText: overrides?.bodyText || "",
        });
        setResumeMailDialogOpen(true);
    }

    function openResumeMailReplayDialog(dispatch: RecruitmentResumeMailDispatch) {
        void ensureMailSettingsLoaded();
        openResumeMailDialog(dispatch.candidate_ids, {
            mode: "resend",
            sourceDispatchId: dispatch.id,
            senderConfigId: dispatch.sender_config_id ? String(dispatch.sender_config_id) : defaultMailSenderId,
            recipientIds: dispatch.recipient_ids,
            extraRecipientEmails: dispatch.recipient_emails.join(", "),
            subject: dispatch.subject || "",
            bodyText: dispatch.body_text || "",
        });
    }

    async function sendResumeMailRequest(
        payload: {
            sender_config_id: number | null;
            candidate_ids: number[];
            recipient_ids: number[];
            recipient_emails: string[];
            subject: string | null;
            body_text: string | null;
        },
        options?: { successMessage?: string; closeDialog?: boolean },
    ) {
        try {
            const dispatch = await recruitmentApi<RecruitmentResumeMailDispatch>(`/resume-mail-dispatches/send`, {
                method: "POST",
                body: JSON.stringify(payload),
            });
            toast.success(options?.successMessage || recruitmentToast.sent(recruitmentToastEntities.resumeMail));
            if (options?.closeDialog !== false) {
                setResumeMailDialogOpen(false);
            }
            try {
                await loadMailSettings();
            } catch (refreshError) {
                toast.error(recruitmentToast.savedButRefreshFailed(recruitmentToastEntities.resumeMail, formatActionError(refreshError)));
            }
            return dispatch;
        } catch (error) {
            const errorMessage = recruitmentToast.sendFailed(recruitmentToastEntities.resumeMail, formatActionError(error));
            throw new Error(errorMessage); // 重新抛出以便调用方处理
        }
    }

    async function confirmAssistantPreparedResumeMail(messageId: string, preparedMail: RecruitmentAssistantPreparedResumeMail) {
        if (!preparedMail.can_confirm) {
            setResumeMailError(preparedMail.blocking_reason || recruitmentToast.mailPreviewBlocked);
            return;
        }
        setResumeMailSourceAssistantMessageId(null);
        setAssistantMailActionState((current) => ({
            ...current,
            [messageId]: {
                status: "sending",
                editing: false,
                error: null,
                dispatchId: current[messageId]?.dispatchId ?? null,
            },
        }));
        try {
            const dispatch = await sendResumeMailRequest(
                {
                    sender_config_id: preparedMail.sender_config_id,
                    candidate_ids: preparedMail.candidate_ids,
                    recipient_ids: preparedMail.recipient_ids,
                    recipient_emails: preparedMail.recipients
                        .filter((item) => item.source === "direct_email")
                        .map((item) => item.email),
                    subject: preparedMail.subject.trim() || null,
                    body_text: preparedMail.body_text.trim() || null,
                },
                {successMessage: "简历邮件已发送", closeDialog: false},
            );
            if (!dispatch) {
                throw new Error("邮件发送失败");
            }
            setAssistantMailActionState((current) => ({
                ...current,
                [messageId]: {
                    status: "sent",
                    editing: false,
                    error: null,
                    dispatchId: dispatch.id,
                },
            }));
            setChatMessages((current) => [
                ...current,
                {
                    id: `a-mail-sent-${Date.now()}`,
                    role: "assistant",
                    content: recruitmentUiText.mailSentMessage(dispatch.id, dispatch.recipient_emails, dispatch.attachment_count, false),
                    createdAt: new Date().toISOString(),
                    sourceRunType: "stream",
                },
            ]);
        } catch (error) {
            const message = formatActionError(error);
            setAssistantMailActionState((current) => ({
                ...current,
                [messageId]: {
                    status: "error",
                    editing: false,
                    error: message,
                    dispatchId: current[messageId]?.dispatchId ?? null,
                },
            }));
        }
    }

    async function submitResumeMail() {
        if (!resumeMailForm.candidateIds.length) {
            setResumeMailError(recruitmentToast.noResumeMailCandidates);
            return;
        }
        const extraEmails = parseEmailList(resumeMailForm.extraRecipientEmails);
        if (!resumeMailForm.recipientIds.length && !extraEmails.length) {
            setResumeMailError(recruitmentToast.noRecipientsSelected);
            return;
        }
        setResumeMailSubmitting(true);
        setResumeMailError(null); // 清除之前的错误
        try {
            const sourceAssistantMessageId = resumeMailSourceAssistantMessageId;
            if (sourceAssistantMessageId) {
                setAssistantMailActionState((current) => ({
                    ...current,
                    [sourceAssistantMessageId]: {
                        status: "sending",
                        editing: false,
                        error: null,
                        dispatchId: current[sourceAssistantMessageId]?.dispatchId ?? null,
                    },
                }));
            }
            const dispatch = await sendResumeMailRequest(
                {
                    sender_config_id: resumeMailForm.senderConfigId ? Number(resumeMailForm.senderConfigId) : null,
                    candidate_ids: resumeMailForm.candidateIds,
                    recipient_ids: resumeMailForm.recipientIds,
                    recipient_emails: extraEmails,
                    subject: resumeMailForm.subject.trim() || null,
                    body_text: resumeMailForm.bodyText.trim() || null,
                },
                {successMessage: resumeMailDialogMode === "resend" ? "简历邮件已再次发送" : "简历邮件已发送"},
            );
            if (sourceAssistantMessageId) {
                setAssistantMailActionState((current) => ({
                    ...current,
                    [sourceAssistantMessageId]: dispatch ? {
                        status: "sent",
                        editing: false,
                        error: null,
                        dispatchId: dispatch.id,
                    } : {
                        status: "error",
                        editing: false,
                        error: "邮件发送失败",
                        dispatchId: current[sourceAssistantMessageId]?.dispatchId ?? null,
                    },
                }));
                if (dispatch) {
                    setChatMessages((current) => [
                        ...current,
                        {
                            id: `a-mail-dialog-sent-${Date.now()}`,
                            role: "assistant",
                            content: recruitmentUiText.mailSentMessage(dispatch.id, dispatch.recipient_emails, dispatch.attachment_count, resumeMailDialogMode === "resend"),
                            createdAt: new Date().toISOString(),
                            sourceRunType: "stream",
                        },
                    ]);
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (resumeMailDialogOpen) {
                setResumeMailError(errorMessage);
            }
        } finally {
            setResumeMailSubmitting(false);
            setResumeMailSourceAssistantMessageId(null);
        }
    }

    async function retryResumeMailDispatch(dispatch: RecruitmentResumeMailDispatch) {
        const actionKey = `mail-dispatch-${dispatch.id}`;
        setMailDispatchActionKey(actionKey);
        try {
            await sendResumeMailRequest(
                {
                    sender_config_id: dispatch.sender_config_id ? Number(dispatch.sender_config_id) : null,
                    candidate_ids: dispatch.candidate_ids,
                    recipient_ids: dispatch.recipient_ids,
                    recipient_emails: dispatch.recipient_emails,
                    subject: dispatch.subject?.trim() || null,
                    body_text: dispatch.body_text?.trim() || null,
                },
                {successMessage: "失败记录已重试发送", closeDialog: false},
            );
        } finally {
            setMailDispatchActionKey((current) => (current === actionKey ? null : current));
        }
    }

    async function openResumeFile(file: ResumeFile, download = false) {
        try {
            const response = await authenticatedFetch(`/api/recruitment/resume-files/${file.id}/download`, {
                method: "GET",
                cache: "no-store"
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            if (download) {
                const anchor = document.createElement("a");
                anchor.href = objectUrl;
                anchor.download = extractFileNameFromDisposition(response.headers.get("content-disposition"), file.original_name);
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
            } else {
                window.open(objectUrl, "_blank", "noopener,noreferrer");
            }
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } catch (error) {
            toast.error(recruitmentToast.resumeOpenedFailed(error instanceof Error ? error.message : recruitmentToast.unknownError));
        }
    }

    async function openResumePreview(file: { id: number; original_name?: string }, candidateName?: string) {
        // Abort any in-flight request
        if (previewPdfAbortRef.current) {
            previewPdfAbortRef.current.abort();
            previewPdfAbortRef.current = null;
        }
        if (previewPdfUrl) {
            URL.revokeObjectURL(previewPdfUrl);
        }
        
        // 立即显示加载状态，但使用 startTransition 降低优先级
        startTransition(() => {
            setPreviewPdfUrl(null);
            setPreviewPdfLoading(true);
            setPreviewCandidateName(candidateName || "");
        });
        
        const abortController = new AbortController();
        previewPdfAbortRef.current = abortController;
        const TIMEOUT_MS = 10_000;
        let timedOut = false;
        const timeoutId = window.setTimeout(() => {
            timedOut = true;
            abortController.abort();
        }, TIMEOUT_MS);
        
        try {
            const response = await authenticatedFetch(`/api/recruitment/resume-files/${file.id}/download`, {
                method: "GET",
                cache: "no-store",
                signal: abortController.signal,
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            
            // 使用 startTransition 让 PDF 显示不阻塞 UI
            startTransition(() => {
                setPreviewPdfUrl(objectUrl);
                setPreviewPdfLoading(false);
            });
        } catch (error) {
            if ((error as Error).name === "AbortError") {
                if (timedOut) {
                    toast.error(recruitmentToast.resumePreviewTimeout);
                }
            } else {
                toast.error(recruitmentToast.resumeOpenedFailed(error instanceof Error ? error.message : recruitmentToast.unknownError));
            }
            startTransition(() => {
                setPreviewPdfUrl(null);
                setPreviewPdfLoading(false);
            });
        } finally {
            window.clearTimeout(timeoutId);
            previewPdfAbortRef.current = null;
        }
    }

    const closeResumePreview = useCallback(() => {
        if (previewPdfAbortRef.current) {
            previewPdfAbortRef.current.abort();
            previewPdfAbortRef.current = null;
        }
        if (previewPdfUrl) {
            URL.revokeObjectURL(previewPdfUrl);
            setPreviewPdfUrl(null);
        }
        setPreviewPdfLoading(false);
        setPreviewCandidateName("");
    }, [previewPdfUrl]);

    // ESC 键全局监听 + Body scroll lock
    React.useEffect(() => {
        if (!previewPdfUrl) return;
        
        // 锁定 body 滚动
        const originalOverflow = document.body.style.overflow;
        const originalPaddingRight = document.body.style.paddingRight;
        
        // 计算滚动条宽度，避免内容抖动
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = 'hidden';
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        }
        
        // ESC 键监听
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeResumePreview();
            }
        };
        
        window.addEventListener("keydown", handleEscape);
        
        return () => {
            // 恢复 body 滚动
            document.body.style.overflow = originalOverflow;
            document.body.style.paddingRight = originalPaddingRight;
            window.removeEventListener("keydown", handleEscape);
        };
    }, [previewPdfUrl, closeResumePreview]);

    function requestDeleteResumeFile(file: ResumeFile) {
        setResumeDeleteTarget(file);
    }

    function requestDeleteCandidate(candidate: CandidateSummary) {
        setCandidateDeleteError(null);
        setCandidateDeleteTarget(candidate);
    }

    async function deleteCandidate() {
        if (!candidateDeleteTarget || candidateDeleting) {
            return;
        }
        const deletedCandidateId = candidateDeleteTarget.id;
        setCandidateDeleteError(null);
        setCandidateDeleting(true);
        try {
            await recruitmentApi(`/candidates/${deletedCandidateId}`, {
                method: "DELETE",
            });
            setCandidateDeleteTarget(null);
            setSelectedCandidateIds((current) => current.filter((item) => item !== deletedCandidateId));
            setCandidateDetail(null);
            toast.success(recruitmentToast.candidateDeleted);
            const nextCandidates = await loadCandidates({silent: true});
            const nextCandidateId = nextCandidates[0]?.id ?? null;
            setSelectedCandidateId(nextCandidateId);
            selectedCandidateIdRef.current = nextCandidateId;
            if (nextCandidateId) {
                void loadCandidateDetail(nextCandidateId, {silent: true});
            }
            void Promise.all([loadLogs({silent: true}), refreshCandidateStats()]);
            if ((chatContextRef.current.candidate_id ?? null) === deletedCandidateId) {
                void saveChatContext(chatContextRef.current.position_id ?? null, chatContextRef.current.skill_ids, nextCandidateId, {quiet: true});
            }
        } catch (error) {
            setCandidateDeleteError(formatActionError(error) || (isZh ? "删除候选人失败，请稍后重试" : "Failed to delete the candidate. Please try again later."));
        } finally {
            setCandidateDeleting(false);
        }
    }

    function requestBatchDelete(candidateIds: number[]) {
        setBatchDeleteError(null);
        setBatchDeleteTargetIds(candidateIds);
    }

    async function batchDeleteCandidates() {
        if (!batchDeleteTargetIds || batchDeleting) {
            return;
        }
        setBatchDeleteError(null);
        setBatchDeleting(true);
        const deletedIds = batchDeleteTargetIds;
        try {
            const result = await recruitmentApi<{ deleted_count: number; skipped: { candidate_id: number; reason: string }[] }>("/candidates/batch-delete", {
                method: "POST",
                body: JSON.stringify({ candidate_ids: deletedIds }),
            });
            const deletedCount = result.deleted_count ?? 0;
            const skipped = result.skipped ?? [];
            setBatchDeleteTargetIds(null);
            setSelectedCandidateIds((current) => current.filter((id) => !deletedIds.includes(id)));
            if (deletedIds.includes(selectedCandidateIdRef.current ?? -1)) {
                setCandidateDetail(null);
            }
            if (skipped.length > 0) {
                const names = skipped.map((s) => `ID:${s.candidate_id}`).join(", ");
                toast.warning(
                    recruitmentToast.candidatesDeletedWithSkipped(deletedCount, skipped.length, names)
                );
            } else {
                toast.success(recruitmentToast.candidatesDeleted(deletedCount));
            }
            const nextCandidates = await loadCandidates({silent: true});
            const nextCandidateId = nextCandidates[0]?.id ?? null;
            setSelectedCandidateId(nextCandidateId);
            selectedCandidateIdRef.current = nextCandidateId;
            if (nextCandidateId) {
                void loadCandidateDetail(nextCandidateId, {silent: true});
            }
            void Promise.all([loadLogs({silent: true}), refreshCandidateStats()]);
        } catch (error) {
            setBatchDeleteError(formatActionError(error) || (isZh ? "批量删除候选人失败，请稍后重试" : "Failed to batch delete candidates. Please try again later."));
        } finally {
            setBatchDeleting(false);
        }
    }

    async function batchBindPosition(candidateIds: number[], positionId: number | null) {
        if (!candidateIds.length) {
            return;
        }
        try {
            const result = await recruitmentApi<{ updated_count: number }>(
                `/candidates/batch-assign-position?update_status=true`,
                {
                    method: "POST",
                    body: JSON.stringify({ candidate_ids: candidateIds, position_id: positionId }),
                }
            );
            toast.success(
                recruitmentToast.positionUpdated(result.updated_count)
            );
            await Promise.all([loadCandidates(), refreshCandidateStats(), loadTalentPoolCandidates()]);
            if (selectedCandidateId && candidateIds.includes(selectedCandidateId)) {
                await loadCandidateDetail(selectedCandidateId);
            }
        } catch (error) {
            toast.error(
                isZh
                    ? `批量更新岗位失败：${formatActionError(error)}`
                    : `Failed to batch update position: ${formatActionError(error)}`
            );
        }
    }

    async function batchUpdateStatus(candidateIds: number[], status: string, reason: string) {
        if (!candidateIds.length || !status) {
            return;
        }
        try {
            const result = await recruitmentApi<{ updated_count: number }>("/candidates/batch-update-status", {
                method: "POST",
                body: JSON.stringify({ candidate_ids: candidateIds, status, reason: reason || undefined }),
            });
            toast.success(recruitmentToast.batchStatusUpdated(result.updated_count));
            await Promise.all([loadCandidates(), refreshCandidateStats()]);
            if (selectedCandidateId && candidateIds.includes(selectedCandidateId)) {
                await loadCandidateDetail(selectedCandidateId);
            }
        } catch (error) {
            toast.error(recruitmentToast.batchStatusUpdateFailed(formatActionError(error)));
        }
    }

    async function deleteResumeFile() {
        if (!resumeDeleteTarget || resumeDeleting) {
            return;
        }
        setResumeDeleting(true);
        try {
            const result = await recruitmentApi<{
                candidate_id: number;
                deleted_resume_file_id: number;
                remaining_resume_count: number;
                latest_resume_file_id?: number | null;
                latest_parse_result_id?: number | null;
                latest_score_id?: number | null;
            }>(`/resume-files/${resumeDeleteTarget.id}`, {
                method: "DELETE",
            });
            toast.success(
                result.remaining_resume_count > 0
                    ? recruitmentToast.resumeDeletedWithSwitch
                    : recruitmentToast.resumeDeleted
            );
            setResumeDeleteTarget(null);
            await Promise.all([
                loadCandidates({silent: true}),
                loadLogs({silent: true}),
                selectedCandidateIdRef.current === result.candidate_id
                    ? loadCandidateDetail(result.candidate_id, {silent: true})
                    : Promise.resolve(null),
            ]);
        } catch (error) {
            toast.error(recruitmentToast.resumeDeleteFailed(formatActionError(error)));
        } finally {
            setResumeDeleting(false);
        }
    }

    async function downloadInterviewQuestion(questionId: number) {
        try {
            const response = await authenticatedFetch(`/api/recruitment/interview-questions/${questionId}/download`, {
                method: "GET",
                cache: "no-store",
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = downloadUrl;
            anchor.download = extractFileNameFromDisposition(
                response.headers.get("content-disposition"),
                `interview-question-${questionId}.html`,
            );
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(downloadUrl);
            toast.success(recruitmentToast.interviewQuestionDownloadStarted);
        } catch (error) {
            toast.error(recruitmentToast.interviewQuestionDownloadFailed(error instanceof Error ? error.message : recruitmentToast.unknownError));
        }
    }

    async function loadInterviewSchedules(candidateId: number) {
        try {
            const data = await recruitmentApi<InterviewSchedule[]>(`/candidates/${candidateId}/interview-schedules`);
            if (mountedRef.current) {
                setInterviewSchedules(data);
            }
        } catch {
            if (mountedRef.current) {
                setInterviewSchedules([]);
            }
        }
    }

    async function createInterviewSchedule(payload: {
        candidate_id: number;
        round_name?: string;
        interviewer_name?: string;
        scheduled_at?: string;
        duration_minutes?: number;
        location?: string;
        meeting_link?: string;
        notes?: string;
    }) {
        const data = await recruitmentApi<InterviewSchedule>("/interview-schedules", {
            method: "POST",
            body: JSON.stringify(payload),
        });
        toast.success(recruitmentToast.interviewScheduleCreated);
        if (selectedCandidateId) {
            await loadInterviewSchedules(selectedCandidateId);
        }
        return data;
    }

    async function deleteInterviewSchedule(scheduleId: number) {
        await recruitmentApi(`/interview-schedules/${scheduleId}`, {method: "DELETE"});
        toast.success(recruitmentToast.interviewScheduleDeleted);
        if (selectedCandidateId) {
            await loadInterviewSchedules(selectedCandidateId);
        }
    }

    async function loadFollowUps(candidateId: number) {
        try {
            const data = await recruitmentApi<FollowUp[]>(`/candidates/${candidateId}/follow-ups`);
            if (mountedRef.current) {
                setFollowUps(data);
            }
        } catch {
            if (mountedRef.current) {
                setFollowUps([]);
            }
        }
    }

    async function createFollowUp(candidateId: number, content: string, followUpType: string = "note") {
        const data = await recruitmentApi<FollowUp>("/follow-ups", {
            method: "POST",
            body: JSON.stringify({candidate_id: candidateId, content, follow_up_type: followUpType}),
        });
        toast.success(recruitmentToast.followUpAdded);
        if (selectedCandidateId) {
            await loadFollowUps(selectedCandidateId);
        }
        return data;
    }

    async function deleteFollowUp(followUpId: number) {
        await recruitmentApi(`/follow-ups/${followUpId}`, {method: "DELETE"});
        toast.success(recruitmentToast.followUpDeleted);
        if (selectedCandidateId) {
            await loadFollowUps(selectedCandidateId);
        }
    }

    async function loadOffers(candidateId: number) {
        try {
            const data = await recruitmentApi<RecruitmentOffer[]>(`/candidates/${candidateId}/offers`);
            if (mountedRef.current) {
                setOffers(data);
            }
        } catch {
            if (mountedRef.current) {
                setOffers([]);
            }
        }
    }

    async function createOffer(payload: {
        candidate_id: number;
        offer_title?: string;
        salary?: string;
        department?: string;
        entry_date?: string;
        offer_content?: string;
        notes?: string;
    }) {
        const data = await recruitmentApi<RecruitmentOffer>("/offers", {
            method: "POST",
            body: JSON.stringify(payload),
        });
        toast.success(recruitmentToast.offerCreated);
        if (selectedCandidateId) {
            await loadOffers(selectedCandidateId);
        }
        return data;
    }

    async function updateOffer(offerId: number, payload: Record<string, unknown>) {
        const data = await recruitmentApi<RecruitmentOffer>(`/offers/${offerId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
        });
        toast.success(recruitmentToast.offerUpdated);
        if (selectedCandidateId) {
            await loadOffers(selectedCandidateId);
        }
        return data;
    }

    async function deleteOffer(offerId: number) {
        await recruitmentApi(`/offers/${offerId}`, {method: "DELETE"});
        toast.success(recruitmentToast.offerDeleted);
        if (selectedCandidateId) {
            await loadOffers(selectedCandidateId);
        }
    }

    function openSkillEditor(skill?: RecruitmentSkill) {
        void ensureSkillsLoaded();
        if (skill) {
            const taskTypes = (skill.task_types || []) as SkillTaskKind[];
            const isBasicMode = taskTypes.length > 0 && !taskTypes.includes("screening");
            const contentParts = skill.content.split(/\n{2,}附加条件[:：]\s*\n?/);
            const basicContent = contentParts[0] || "";
            const extraConditions = contentParts.slice(1).join("\n\n").trim();
            setSkillEditingId(skill.id);
            setSkillForm({
                name: skill.name,
                description: skill.description || "",
                content: isBasicMode ? basicContent : skill.content,
                tagsText: joinTags(skill.tags),
                taskTypes,
                sortOrder: String(skill.sort_order ?? 99),
                isEnabled: skill.is_enabled,
            });
            if (isBasicMode) {
                setSkillEditorData(emptyScreeningSkillForm());
            } else {
                const parsed = parseSkillContent(skill.content);
                setSkillEditorData({
                    roleName: parsed.roleName || "",
                    roleBackground: parsed.roleBackground || "",
                    hardRules: parsed.hardRules || "",
                    dimensions: parsed.dimensions || [],
                    judgmentRules: parsed.judgmentRules || "",
                    name: skill.name,
                    description: skill.description || "",
                    tagsText: joinTags(skill.tags),
                    taskTypes,
                    sortOrder: String(skill.sort_order ?? 99),
                    isEnabled: skill.is_enabled,
                });
            }
            setSkillDialogMode(isBasicMode ? "basic" : "structured");
            setSkillExtraConditions(extraConditions);
            setSkillBoundPositionId(skill.bound_position_id ? String(skill.bound_position_id) : "");
            setSkillEditorPositionId(skill.bound_position_id ?? null);
        } else {
            setSkillEditingId(null);
            setSkillForm(emptySkillForm());
            setSkillEditorData(emptyScreeningSkillForm());
            setSkillDialogMode("structured");
            setSkillExtraConditions("");
            setSkillBoundPositionId("");
            setSkillEditorPositionId(null);
        }
        setSkillEditorDefaultTab("structured");
        setSkillAutoBindCategory(null);
        setSkillFormErrors({});
        setSkillFormSubmitError(null);
        setSkillDialogOpen(true);
    }

    function openSkillEditorByTaskKind(taskKind: SkillTaskKind) {
        void ensureSkillsLoaded();
        const nextSkillForm = emptySkillForm();
        nextSkillForm.taskTypes = [taskKind];
        const nextEditorData = emptyScreeningSkillForm();
        nextEditorData.taskTypes = [taskKind];
        setSkillEditingId(null);
        setSkillForm(nextSkillForm);
        setSkillEditorData(nextEditorData);
        setSkillDialogMode(taskKind === "screening" ? "structured" : "basic");
        setSkillEditorDefaultTab(taskKind === "screening" ? "ai" : "advanced");
        setSkillEditorPositionId(null);
        setSkillAutoBindCategory(null);
        setSkillBoundPositionId("");
        setSkillExtraConditions("");
        setSkillFormErrors({});
        setSkillFormSubmitError(null);
        setSkillDialogOpen(true);
    }

    function openSkillEditorWithAI(boundPositionId: number | null = null) {
        void ensureSkillsLoaded();
        setSkillEditingId(null);
        setSkillForm(emptySkillForm());
        setSkillEditorData(emptyScreeningSkillForm());
        setSkillDialogMode("structured");
        setSkillEditorDefaultTab("ai");
        setSkillEditorPositionId(boundPositionId);
        setSkillAutoBindCategory(null);
        setSkillBoundPositionId(boundPositionId ? String(boundPositionId) : "");
        setSkillExtraConditions("");
        setSkillFormErrors({});
        setSkillFormSubmitError(null);
        setSkillDialogOpen(true);
    }

    function openSkillEditorForPosition(taskKind: SkillTaskKind, bindCategory: "jdSkillIds" | "screeningSkillIds" | "interviewSkillIds") {
        void ensureSkillsLoaded();
        const roleName = positionForm.title.trim();
        const bindingPositionId = positionDialogMode === "edit" ? selectedPositionId : null;
        const empty = emptyScreeningSkillForm();
        empty.taskTypes = [taskKind];
        if (roleName) {
            empty.roleName = roleName;
            empty.name = taskKind === "jd" ? `${roleName} JD 分析方案` : taskKind === "screening" ? `${roleName}初筛评分评估方案` : `${roleName}面试题评估方案`;
        }
        setSkillEditingId(null);
        const skillFormState = emptySkillForm();
        skillFormState.taskTypes = [taskKind];
        if (roleName) {
            skillFormState.name = empty.name;
        }
        setSkillForm(skillFormState);
        setSkillEditorData(empty);
        setSkillDialogMode(taskKind === "screening" ? "structured" : "basic");
        setSkillEditorDefaultTab(taskKind === "screening" ? "ai" : "advanced");
        setSkillEditorPositionId(bindingPositionId);
        setSkillAutoBindCategory(bindCategory);
        setSkillBoundPositionId(bindingPositionId ? String(bindingPositionId) : "");
        setSkillExtraConditions("");
        setSkillFormErrors({});
        setSkillFormSubmitError(null);
        setSkillDialogOpen(true);
    }

    async function submitStructuredSkill(data: ScreeningSkillFormData) {
        if (skillSubmitting) return;
        if (!data.name.trim()) {
            setSkillFormSubmitError("请输入评估方案名称");
            return;
        }
        if (!data.taskTypes.length) {
            setSkillFormSubmitError("请选择适用场景");
            return;
        }
        setSkillFormSubmitError(null);
        setSkillSubmitting(true);
        const previousBoundPositionId = skillEditingId ? (skillMap.get(skillEditingId)?.bound_position_id || null) : null;
        const nextBoundPositionId = skillBoundPositionId ? Number(skillBoundPositionId) : null;
        try {
            const content = generateSkillContent(data);
            const payload = {
                name: data.name.trim(),
                description: data.description.trim() || null,
                content: content.trim(),
                tags: splitTags(data.tagsText),
                task_types: data.taskTypes,
                bound_position_id: skillBoundPositionId ? Number(skillBoundPositionId) : null,
                sort_order: Number(data.sortOrder || "99"),
                is_enabled: data.isEnabled,
            };
            if (skillEditingId) {
                const updatedSkill = await recruitmentApi<RecruitmentSkill>(`/skills/${skillEditingId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                upsertSkillInLocalState(updatedSkill);
                toast.success(recruitmentToast.updated(recruitmentToastEntities.skill));
            } else {
                const result = await recruitmentApi<RecruitmentSkill>("/skills", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                upsertSkillInLocalState(result);
                const newSkillId = result?.id;
                if (newSkillId && skillAutoBindCategory) {
                    updatePositionSkillBinding(skillAutoBindCategory, [newSkillId], {expandSection: true});
                }
                toast.success(recruitmentToast.created(recruitmentToastEntities.skill));
            }
            setSkillAutoBindCategory(null);
            setSkillDialogOpen(false);
            await refreshSkillBindingViews([previousBoundPositionId, nextBoundPositionId]);
        } catch (error) {
            const resolved = resolveSkillSubmitError(error);
            setSkillFormSubmitError(resolved.submitError);
        }
        setSkillSubmitting(false);
    }

    async function generateSkillWithAI(
        roleName: string,
        extraRequirements: string,
        positionJd: string | null,
        onDelta?: (delta: string) => void,
    ): Promise<{ content: string; completed: boolean }> {
        const abortController = new AbortController();
        skillAbortControllerRef.current = abortController;
        skillActiveTaskIdRef.current = null;
        setSkillGenerating(true);
        let fullContent = "";
        let completed = false;
        let cancelled = false;
        let streamErrorMessage: string | null = null;
        try {
            const response = await authenticatedFetch("/api/recruitment/skills/generate-content", {
                method: "POST",
                headers: {"Content-Type": "application/json", Accept: "text/event-stream"},
                body: JSON.stringify({role_name: roleName, extra_requirements: extraRequirements || null, position_jd: positionJd || null}),
                signal: abortController.signal,
            });
            if (!response.body) throw new Error("No response body");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {stream: true});
                let sep = buffer.indexOf("\n\n");
                while (sep !== -1) {
                    const rawEvent = buffer.slice(0, sep);
                    buffer = buffer.slice(sep + 2);
                    sep = buffer.indexOf("\n\n");
                    const eventMatch = rawEvent.match(/^event: (.+)$/m);
                    const eventType = eventMatch ? eventMatch[1].trim() : "message";
                    const dataMatch = rawEvent.match(/data: (.+)/);
                    if (dataMatch) {
                        try {
                            const data = JSON.parse(dataMatch[1]);
                            if (eventType === "task_created") {
                                skillActiveTaskIdRef.current = data.task_id;
                            } else if (eventType === "completed") {
                                completed = true;
                                if (typeof data.content === "string") {
                                    fullContent = data.content;
                                }
                            } else if (eventType === "cancelled") {
                                cancelled = true;
                                break;
                            } else if (eventType === "error") {
                                streamErrorMessage = typeof data.message === "string"
                                    ? data.message
                                    : (isZh ? "评估方案生成失败" : "Assessment plan generation failed");
                                break;
                            } else if (data.delta) {
                                fullContent += data.delta;
                                onDelta?.(data.delta);
                            }
                        } catch { /* ignore malformed */ }
                    }
                }
            }
            if (streamErrorMessage) {
                throw new Error(streamErrorMessage);
            }
        } catch (error) {
            if (!abortController.signal.aborted) {
                toast.error(formatActionError(error));
            }
            return {content: fullContent, completed: false};
        } finally {
            setSkillGenerating(false);
            skillAbortControllerRef.current = null;
            skillActiveTaskIdRef.current = null;
        }
        return {content: fullContent, completed: completed && !cancelled};
    }

    async function stopSkillGeneration() {
        skillAbortControllerRef.current?.abort();
        const taskId = skillActiveTaskIdRef.current;
        if (taskId) {
            try {
                await cancelTaskGeneration(taskId, isZh ? "评估方案生成" : "Assessment plan generation", {silent: true});
            } catch { /* ignore */ }
        }
    }

    async function submitSkill() {
        if (skillSubmitting) {
            return;
        }
        const nextErrors = validateSkillForm(skillForm);
        if (Object.keys(nextErrors).length) {
            setSkillFormErrors(nextErrors);
            setSkillFormSubmitError(null);
            requestAnimationFrame(() => {
                if (nextErrors.name) {
                    skillNameInputRef.current?.focus();
                    return;
                }
                if (nextErrors.content) {
                    skillContentInputRef.current?.focus();
                }
            });
            return;
        }
        setSkillFormErrors({});
        setSkillFormSubmitError(null);
        setSkillSubmitting(true);
        const previousBoundPositionId = skillEditingId ? (skillMap.get(skillEditingId)?.bound_position_id || null) : null;
        const nextBoundPositionId = skillBoundPositionId ? Number(skillBoundPositionId) : null;
        try {
            const finalContent = skillExtraConditions.trim()
                ? `${skillForm.content.trim()}\n\n附加条件：\n${skillExtraConditions.trim()}`
                : skillForm.content.trim();
            const payload = {
                name: skillForm.name.trim(),
                description: skillExtraConditions.trim() || skillForm.description.trim() || null,
                content: finalContent,
                tags: splitTags(skillForm.tagsText),
                task_types: skillForm.taskTypes,
                bound_position_id: skillBoundPositionId ? Number(skillBoundPositionId) : null,
                sort_order: Number(skillForm.sortOrder || "99"),
                is_enabled: skillForm.isEnabled,
            };
            if (skillEditingId) {
                const updatedSkill = await recruitmentApi<RecruitmentSkill>(`/skills/${skillEditingId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                upsertSkillInLocalState(updatedSkill);
                toast.success(recruitmentToast.updated(recruitmentToastEntities.skill));
            } else {
                const result = await recruitmentApi<RecruitmentSkill>(`/skills`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                upsertSkillInLocalState(result);
                const newSkillId = result?.id;
                if (newSkillId && skillAutoBindCategory) {
                    updatePositionSkillBinding(skillAutoBindCategory, [newSkillId], {expandSection: true});
                }
                toast.success(recruitmentToast.created(recruitmentToastEntities.skill));
            }
            setSkillAutoBindCategory(null);
            setSkillDialogOpen(false);
            await refreshSkillBindingViews([previousBoundPositionId, nextBoundPositionId]);
        } catch (error) {
            const resolved = resolveSkillSubmitError(error);
            if (resolved.fieldErrors) {
                setSkillFormErrors(resolved.fieldErrors);
                requestAnimationFrame(() => {
                    if (resolved.fieldErrors?.name) {
                        skillNameInputRef.current?.focus();
                        return;
                    }
                    if (resolved.fieldErrors?.content) {
                        skillContentInputRef.current?.focus();
                    }
                });
            }
            setSkillFormSubmitError(resolved.submitError);
        }
        setSkillSubmitting(false);
    }

    async function deleteSkill(skillId: number) {
        const actionKey = `skill-${skillId}`;
        setDeleteActionKey(actionKey);
        try {
            await recruitmentApi(`/skills/${skillId}`, {method: "DELETE"});
            setSkillDeleteTarget(null);
            toast.success(recruitmentToast.deleted(recruitmentToastEntities.skill));
            await loadSkills();
        } catch (error) {
            toast.error(recruitmentToast.deleteFailed(recruitmentToastEntities.skill, formatActionError(error)));
        } finally {
            setDeleteActionKey((current) => (current === actionKey ? null : current));
        }
    }

    async function toggleSkill(skillId: number, enabled: boolean) {
        try {
            await recruitmentApi(`/skills/${skillId}/toggle${buildQuery({enabled})}`, {method: "POST"});
            toast.success(enabled ? recruitmentToast.skillEnabled : recruitmentToast.skillDisabled);
            await loadSkills();
        } catch (error) {
            toast.error(recruitmentToast.saveFailed(recruitmentToastEntities.skill, formatActionError(error)));
        }
    }

    function openLLMEditor(config?: RecruitmentLLMConfig) {
        void ensureLLMConfigsLoaded();
        if (config) {
            setLlmEditingId(config.id);
            setLlmForm({
                configKey: config.config_key,
                taskType: config.task_type,
                provider: config.provider,
                modelName: config.model_name,
                baseUrl: config.base_url || "",
                apiKeyEnv: config.api_key_env || "",
                apiKeyValue: "",
                maxConcurrent: String(config.max_concurrent ?? 4),
                maxQps: String(config.max_qps ?? 10),
                priority: String(config.priority ?? 99),
                isActive: config.is_active,
                extraConfigText: JSON.stringify(config.extra_config || {}, null, 2),
            });
        } else {
            setLlmEditingId(null);
            setLlmForm(emptyLLMForm());
        }
        setLlmFormErrors({});
        setLlmFormSubmitError(null);
        setLlmDialogOpen(true);
    }

    function copyLLMEditor(config: RecruitmentLLMConfig) {
        void ensureLLMConfigsLoaded();
        setLlmEditingId(null);
        setLlmForm({
            configKey: `${config.config_key}-copy`,
            taskType: config.task_type,
            provider: config.provider,
            modelName: config.model_name,
            baseUrl: config.base_url || "",
            apiKeyEnv: config.api_key_env || "",
            apiKeyValue: "",
            maxConcurrent: String(config.max_concurrent ?? 4),
            maxQps: String(config.max_qps ?? 10),
            priority: String(config.priority ?? 99),
            isActive: config.is_active,
            extraConfigText: JSON.stringify(config.extra_config || {}, null, 2),
        });
        setLlmFormErrors({});
        setLlmFormSubmitError(null);
        setLlmDialogOpen(true);
    }

    async function submitLLMConfig() {
        if (llmSubmitting) {
            return;
        }
        const nextErrors = validateLLMForm(llmForm);
        if (Object.keys(nextErrors).length) {
            setLlmFormErrors(nextErrors);
            setLlmFormSubmitError(null);
            requestAnimationFrame(() => {
                if (nextErrors.configKey) {
                    llmConfigKeyInputRef.current?.focus();
                    return;
                }
                if (nextErrors.taskType) {
                    llmTaskTypeInputRef.current?.focus();
                    return;
                }
                if (nextErrors.modelName) {
                    llmModelNameInputRef.current?.focus();
                    return;
                }
                if (nextErrors.maxConcurrent || nextErrors.maxQps) {
                    return;
                }
                if (nextErrors.extraConfigText) {
                    llmExtraConfigInputRef.current?.focus();
                }
            });
            return;
        }
        setLlmFormErrors({});
        setLlmFormSubmitError(null);
        setLlmSubmitting(true);
        try {
            const payload = {
                config_key: llmForm.configKey.trim(),
                task_type: llmForm.taskType.trim(),
                provider: llmForm.provider.trim(),
                model_name: llmForm.modelName.trim(),
                base_url: llmForm.baseUrl.trim() || null,
                api_key_env: llmForm.apiKeyEnv.trim() || null,
                api_key_value: llmForm.apiKeyValue.trim() || null,
                max_concurrent: Number(llmForm.maxConcurrent || "4"),
                max_qps: Number(llmForm.maxQps || "10"),
                priority: Number(llmForm.priority || "99"),
                is_active: llmForm.isActive,
                extra_config: llmForm.extraConfigText.trim() ? JSON.parse(llmForm.extraConfigText) : {},
            };
            if (llmEditingId) {
                await recruitmentApi(`/llm-configs/${llmEditingId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success(recruitmentToast.updated(recruitmentToastEntities.modelConfig));
            } else {
                await recruitmentApi(`/llm-configs`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success(recruitmentToast.created(recruitmentToastEntities.modelConfig));
            }
            setLlmDialogOpen(false);
            await loadLLMConfigs();
        } catch (error) {
            const resolved = resolveLLMSubmitError(error);
            if (resolved.fieldErrors) {
                setLlmFormErrors(resolved.fieldErrors);
                requestAnimationFrame(() => {
                    if (resolved.fieldErrors?.configKey) {
                        llmConfigKeyInputRef.current?.focus();
                        return;
                    }
                    if (resolved.fieldErrors?.taskType) {
                        llmTaskTypeInputRef.current?.focus();
                        return;
                    }
                    if (resolved.fieldErrors?.modelName) {
                        llmModelNameInputRef.current?.focus();
                        return;
                    }
                    if (resolved.fieldErrors?.maxConcurrent || resolved.fieldErrors?.maxQps) {
                        return;
                    }
                    if (resolved.fieldErrors?.extraConfigText) {
                        llmExtraConfigInputRef.current?.focus();
                    }
                });
            }
            setLlmFormSubmitError(resolved.submitError);
        }
        setLlmSubmitting(false);
    }

    async function deleteLLMConfig(configId: number) {
        const actionKey = `llm-${configId}`;
        setDeleteActionKey(actionKey);
        try {
            await recruitmentApi(`/llm-configs/${configId}`, {method: "DELETE"});
            setLlmDeleteTarget(null);
            toast.success(recruitmentToast.deleted(recruitmentToastEntities.modelConfig));
            try {
                await loadLLMConfigs();
            } catch (refreshError) {
                toast.error(recruitmentToast.deletedButRefreshFailed(recruitmentToastEntities.modelConfig, formatActionError(refreshError)));
            }
        } catch (error) {
            toast.error(recruitmentToast.deleteFailed(recruitmentToastEntities.modelConfig, formatActionError(error)));
        } finally {
            setDeleteActionKey((current) => (current === actionKey ? null : current));
        }
    }

    async function setPreferredLLMConfig(targetConfig: RecruitmentLLMConfig) {
        const sameTaskConfigs = llmConfigs
            .filter((item) => item.task_type === targetConfig.task_type)
            .sort((left, right) => {
                if (left.id === targetConfig.id) return -1;
                if (right.id === targetConfig.id) return 1;
                if (left.priority !== right.priority) return left.priority - right.priority;
                return left.id - right.id;
            });
        try {
            for (let index = 0; index < sameTaskConfigs.length; index += 1) {
                const item = sameTaskConfigs[index];
                await recruitmentApi(`/llm-configs/${item.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        config_key: item.config_key,
                        task_type: item.task_type,
                        provider: item.provider,
                        model_name: item.model_name,
                        base_url: item.base_url || null,
                        api_key_env: item.api_key_env || null,
                        api_key_value: null,
                        extra_config: item.extra_config || {},
                        is_active: item.id === targetConfig.id ? true : item.is_active,
                        priority: index,
                    }),
                });
            }
            toast.success(recruitmentUiText.currentModelSwitched(targetConfig.task_type, targetConfig.model_name));
            await loadLLMConfigs();
        } catch (error) {
            toast.error(recruitmentToast.saveFailed(recruitmentToastEntities.currentModel, formatActionError(error)));
        }
    }

    function renderAssistantConsole(mode: AssistantDisplayMode = "page") {
        const isPage = mode === "page";
        const isFullscreen = mode === "fullscreen";
        const isWorkspace = mode === "workspace";
        const suggestionPrompts = [
            isZh ? "生成当前岗位 JD" : "Generate a JD for the current position",
            isZh ? "查看当前岗位候选人" : "Show candidates for the current position",
            isZh ? "重新对当前候选人初筛，硬性要求加强硬件测试" : "Re-screen the current candidate with stronger hardware testing requirements",
            isZh ? "给当前候选人生成面试题" : "Generate interview questions for the current candidate",
            isZh ? "说明这次对话用了哪些评估方案" : "Explain which assessment plans this conversation used",
            isZh ? "当前使用什么模型" : "Which model is being used now",
        ];
        const workspaceSuggestionPrompts = [
            isZh ? "帮我生成 IoT 测试工程师 JD" : "Generate an IoT Test Engineer JD",
            isZh ? "查看当前岗位候选人列表" : "Show candidates for the current position",
            isZh ? "重新对当前候选人初筛，硬性要求加强硬件测试经验" : "Re-screen the current candidate with stronger hardware testing requirements",
            isZh ? "给当前候选人生成初试题，重点考察硬件联调" : "Generate first-round interview questions focused on hardware integration",
            isZh ? "说明这次对话用了哪些评估方案和模型" : "Explain which assessment plans and model this conversation used",
        ];
        const quickActionPrompts = isWorkspace ? workspaceSuggestionPrompts : suggestionPrompts;
        const collapsedQuickActionPrompts = quickActionPrompts.slice(0, Math.min(3, quickActionPrompts.length));
        const visibleQuickActionPrompts = assistantQuickActionsExpanded ? quickActionPrompts : collapsedQuickActionPrompts;
        const hasMoreQuickActions = quickActionPrompts.length > collapsedQuickActionPrompts.length;
        const summaryChips = [
            {key: "position", label: shortText(chatContext.position_title || recruitmentUiText.unspecifiedPosition, 18), dotClassName: "bg-sky-500"},
            {key: "candidate", label: shortText(chatContextCandidateLabel, 18), dotClassName: "bg-amber-500"},
            {key: "skills", label: `${chatContext.skills?.length || 0} ${isZh ? "评估方案" : "Plans"}`, dotClassName: "bg-emerald-500"},
            {key: "model", label: shortText(assistantActiveLLMConfig?.resolved_model_name || assistantActiveLLMConfig?.model_name || recruitmentUiText.modelUnrecognized, 18), dotClassName: "bg-violet-500"},
        ];
        const assistantContextPanel = (
                <div className="flex h-full min-h-0 flex-col space-y-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{recruitmentUiText.assistantContextShort}</p>
                            <p className="mt-1 hidden text-sm leading-5 text-slate-500 dark:text-slate-400 2xl:block">
                                {isZh ? "按需展开岗位、评估方案和模型配置，不再长期挤压主聊天区。" : "Expand position, assessment plan, and model settings only when needed so the main chat area stays clear."}
                            </p>
                        </div>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-full"
                        onMouseDown={preventAssistantActionFocusLoss}
                        onClick={() => {
                            setAssistantContextExpanded(false);
                            queueAssistantInputFocus();
                        }}
                    >
                        <ChevronUp className="h-4 w-4"/>
                    </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-[15px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{recruitmentUiText.currentPosition}</p>
                        <p className="mt-1 text-base font-medium text-slate-900 dark:text-slate-100">{chatContext.position_title || recruitmentUiText.unspecifiedPosition}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-[15px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{recruitmentUiText.activeSkills}</p>
                        <p className="mt-1 text-base font-medium text-slate-900 dark:text-slate-100">{recruitmentUiText.skillCount(assistantContextSkills.length)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-[15px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{recruitmentUiText.currentModel}</p>
                        <p className="mt-1 text-base font-medium text-slate-900 dark:text-slate-100">{assistantActiveLLMConfig?.resolved_model_name || assistantActiveLLMConfig?.model_name || recruitmentUiText.modelUnrecognized}</p>
                    </div>
                </div>

                <Field label={recruitmentUiText.currentPosition}>
                    <NativeSelect
                        value={chatContext.position_id ? String(chatContext.position_id) : "none"}
                        onChange={(event) => {
                            const nextPositionId = event.target.value === "none" ? null : Number(event.target.value);
                            void saveChatContext(nextPositionId, chatContext.skill_ids);
                            queueAssistantInputFocus();
                        }}
                    >
                        <option value="none">{recruitmentUiText.unspecifiedPosition}</option>
                        {positions.map((position) => (
                            <option key={position.id} value={position.id}>
                                {position.title}
                            </option>
                        ))}
                    </NativeSelect>
                </Field>

                <Field label={recruitmentUiText.activeSkills}>
                    <div className="flex flex-wrap gap-2">
                        {enabledSkills.map((skill) => (
                            <button
                                key={skill.id}
                                type="button"
                                onMouseDown={preventAssistantActionFocusLoss}
                                onClick={() => toggleSkillInAssistant(skill.id)}
                                className={cn(
                                    "rounded-full border px-3 py-2 text-sm font-medium transition",
                                    assistantContextSkillIds.includes(skill.id)
                                        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                )}
                            >
                                {skill.name}
                            </button>
                        ))}
                    </div>
                </Field>

                <Field label={recruitmentUiText.currentModel}>
                    <NativeSelect
                        value={assistantActiveLLMConfig ? String(assistantActiveLLMConfig.id) : "none"}
                        onChange={(event) => {
                            const nextConfig = assistantModelSwitchOptions.find((item) => String(item.id) === event.target.value);
                            if (nextConfig) {
                                void setPreferredLLMConfig(nextConfig);
                            }
                            queueAssistantInputFocus();
                        }}
                        disabled={assistantModelSwitchOptions.length <= 1}
                    >
                        {!assistantModelSwitchOptions.length ? <option value="none">{recruitmentUiText.noSwitchableModel}</option> : null}
                        {assistantModelSwitchOptions.map((config) => (
                            <option key={config.id} value={config.id}>
                                {labelForProvider(config.resolved_provider || config.provider)} / {config.resolved_model_name || config.model_name}
                            </option>
                        ))}
                    </NativeSelect>
                    <p className="mt-2 text-sm leading-5 text-slate-500 dark:text-slate-400">
                        {isZh ? "先为同一任务类型添加多个已启用模型，这里就能像 GPT / Claude 一样直接切换当前使用项。" : "Enable multiple models for the same task type first, then switch between them here like GPT or Claude."}
                    </p>
                </Field>
            </div>
        );

        if (isWorkspace) {
            return (
                <div className="flex h-full min-h-0 flex-col">
                    <div className="border-b border-slate-200/80 px-4 py-3 dark:border-slate-800">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Bot className="h-4 w-4 text-sky-600"/>
                                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{recruitmentUiText.assistantLabel}</p>
                                </div>
                                <p className="mt-1 hidden text-sm text-slate-500 dark:text-slate-400 2xl:block">
                                    {recruitmentUiText.assistantWorkspaceHint}
                                </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => openAssistantMode("drawer")}>
                                {recruitmentUiText.open}
                            </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {summaryChips.map((chip) => (
                                <button
                                    key={chip.key}
                                    type="button"
                                    onMouseDown={preventAssistantActionFocusLoss}
                                    onClick={() => openAssistantMode("drawer")}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                >
                                    <span className={cn("h-2 w-2 rounded-full", chip.dotClassName)}/>
                                    <span>{chip.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]">
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {visibleQuickActionPrompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        type="button"
                                        onMouseDown={preventAssistantActionFocusLoss}
                                        onClick={() => applyAssistantPrompt(prompt, {openMode: "drawer"})}
                                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-slate-100"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                                {hasMoreQuickActions ? (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onMouseDown={preventAssistantActionFocusLoss}
                                        onClick={() => setAssistantQuickActionsExpanded((current) => !current)}
                                    >
                                        {assistantQuickActionsExpanded ? recruitmentUiText.collapse : recruitmentUiText.more}
                                        {assistantQuickActionsExpanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                                    </Button>
                                ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => openAssistantMode("drawer")}>
                                    <Bot className="h-4 w-4"/>
                                    {recruitmentUiText.openFullAssistant}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        setAssistantContextExpanded(true);
                                        openAssistantMode("drawer");
                                    }}
                                >
                                    {recruitmentUiText.assistantContextShort}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-slate-200/80 px-4 py-2.5 dark:border-slate-800 sm:px-5">
                        <div className="flex items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            <div className="flex shrink-0 items-center gap-2">
                                <Bot className="h-4 w-4 text-sky-600"/>
                                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{recruitmentUiText.assistantLabel}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                            <Button variant={isPage ? "default" : "ghost"} size="sm" className="h-7 rounded-full px-2.5 text-sm"
                                    onClick={() => openAssistantMode("page")}>
                                {isZh ? "页内" : "In Page"}
                            </Button>
                            <Button variant={mode === "drawer" ? "default" : "ghost"} size="sm" className="h-7 rounded-full px-2.5 text-sm"
                                    onClick={() => openAssistantMode("drawer")}>
                                {isZh ? "浮层" : "Drawer"}
                            </Button>
                            <Button variant={isFullscreen ? "default" : "ghost"} size="sm" className="h-7 rounded-full px-2.5 text-sm"
                                    onClick={() => openAssistantMode("fullscreen")}>
                                {isZh ? "全屏" : "Fullscreen"}
                            </Button>
                        </div>
                        <div className="flex min-w-max items-center gap-2">
                            {summaryChips.map((chip) => (
                                <button
                                    key={chip.key}
                                    type="button"
                                    onMouseDown={preventAssistantActionFocusLoss}
                                    onClick={() => setAssistantContextExpanded(true)}
                                    className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[15px] font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                >
                                    <span className={cn("h-2 w-2 rounded-full", chip.dotClassName)}/>
                                    <span>{chip.label}</span>
                                </button>
                            ))}
                        </div>
                        <Button
                            size="sm"
                            variant={assistantContextExpanded ? "default" : "outline"}
                            className="h-7 shrink-0 rounded-full px-2.5 text-sm"
                            onMouseDown={preventAssistantActionFocusLoss}
                            onClick={() => setAssistantContextExpanded((current) => !current)}
                        >
                            {recruitmentUiText.assistantContextShort}
                            {assistantContextExpanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                        </Button>
                    </div>
                </div>

                <div className="relative min-h-0 flex-1">
                    <div
                        className={cn(
                            "grid h-full min-h-0",
                            assistantContextExpanded
                                ? (isFullscreen
                                    ? "grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px]"
                                    : "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]")
                                : "grid-cols-1",
                        )}
                    >
                        <div className="flex min-h-0 flex-col">
                            <div className="relative min-h-0 flex-1">
                                <div
                                    ref={assistantScrollAreaRef}
                                    onScroll={handleAssistantScroll}
                                    className="min-h-0 h-full flex-1 overflow-y-auto [scrollbar-gutter:stable]"
                                >
                                    <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
                                        {chatMessages.map((message) => (
                                            <div
                                                key={message.id}
                                                className={cn(
                                                    "max-w-[92%] rounded-2xl px-4 py-3 text-base leading-7 shadow-sm",
                                                    message.role === "assistant"
                                                        ? "border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                                        : "ml-auto bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
                                                )}
                                            >
                                                <p className="whitespace-pre-wrap">{message.content}</p>
                                                {message.actions?.length ? (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {message.actions.map((action) => (
                                                            <Badge key={action} variant="outline" className="rounded-full">
                                                                {action}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : null}
                                                {message.clarificationRequest?.options?.length ? (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {message.clarificationRequest.options.map((option) => (
                                                            <Button
                                                                key={`${message.id}-${option.id}`}
                                                                size="sm"
                                                                variant="outline"
                                                                onMouseDown={preventAssistantActionFocusLoss}
                                                                onClick={() => void submitAssistantClarification(
                                                                    message.clarificationRequest?.original_message || message.content,
                                                                    message.clarificationRequest!,
                                                                    option,
                                                                )}
                                                            >
                                                                {option.label}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                ) : null}
                                                {message.mailConfirmationRequest ? (
                                                    <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
                                                        <div className="space-y-3">
                                                            <div>
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">{isZh ? "邮件发送预览" : "Email Preview"}</p>
                                                                <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
                                                                    {isZh ? "先确认发送，再真正触发邮件发送。" : "Confirm first, then actually send the email."}
                                                                </p>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <p><span className="font-medium text-slate-900 dark:text-slate-100">{isZh ? "候选人：" : "Candidates: "}</span>{message.mailConfirmationRequest.candidates.map((item) => item.name).join(isZh ? "、" : ", ")}</p>
                                                                <p><span className="font-medium text-slate-900 dark:text-slate-100">{isZh ? "发件箱：" : "Sender: "}</span>{message.mailConfirmationRequest.sender ? `${message.mailConfirmationRequest.sender.name} <${message.mailConfirmationRequest.sender.from_email}>` : (isZh ? "未配置" : "Not configured")}</p>
                                                                <p><span className="font-medium text-slate-900 dark:text-slate-100">{isZh ? "收件人：" : "Recipients: "}</span>{message.mailConfirmationRequest.recipients.map((item) => item.name ? `${item.name} <${item.email}>` : item.email).join(isZh ? "、" : ", ")}</p>
                                                                <p><span className="font-medium text-slate-900 dark:text-slate-100">{isZh ? "附件：" : "Attachments: "}</span>{isZh ? `${message.mailConfirmationRequest.attachment_count} 份简历` : `${message.mailConfirmationRequest.attachment_count} resume file(s)`}</p>
                                                            </div>
                                                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">{isZh ? "邮件主题" : "Email Subject"}</p>
                                                                <p className="mt-1 whitespace-pre-wrap break-words">{message.mailConfirmationRequest.subject}</p>
                                                            </div>
                                                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">{isZh ? "邮件正文" : "Email Body"}</p>
                                                                <p className="mt-1 whitespace-pre-wrap break-words">{message.mailConfirmationRequest.body_text}</p>
                                                            </div>
                                                            {message.mailConfirmationRequest.blocking_reason ? (
                                                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                                                                    {message.mailConfirmationRequest.blocking_reason}
                                                                </div>
                                                            ) : null}
                                                            {assistantMailActionState[message.id]?.status === "error" && assistantMailActionState[message.id]?.error ? (
                                                                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                                                                    {assistantMailActionState[message.id]?.error}
                                                                </div>
                                                            ) : null}
                                                            {assistantMailActionState[message.id]?.editing ? (
                                                                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                                                    {isZh ? "已进入编辑。你可以在弹窗里修改收件人、标题和正文后再发送。" : "Editing mode is open. You can adjust recipients, subject, and body in the dialog before sending."}
                                                                </div>
                                                            ) : null}
                                                            {assistantMailActionState[message.id]?.status === "sent" ? (
                                                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                                                                    {isZh
                                                                        ? `已发送成功${assistantMailActionState[message.id]?.dispatchId ? `，发送记录 #${assistantMailActionState[message.id]?.dispatchId}` : ""}。`
                                                                        : `Sent successfully${assistantMailActionState[message.id]?.dispatchId ? `, dispatch #${assistantMailActionState[message.id]?.dispatchId}` : ""}.`}
                                                                </div>
                                                            ) : null}
                                                            <div className="flex flex-wrap gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    onMouseDown={preventAssistantActionFocusLoss}
                                                                    onClick={() => void confirmAssistantPreparedResumeMail(message.id, message.mailConfirmationRequest!)}
                                                                    disabled={!message.mailConfirmationRequest.can_confirm || assistantMailActionState[message.id]?.status === "sending" || assistantMailActionState[message.id]?.status === "sent"}
                                                                >
                                                                    {assistantMailActionState[message.id]?.status === "sending" ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}
                                                                    {assistantMailActionState[message.id]?.status === "sent" ? (isZh ? "已发送" : "Sent") : assistantMailActionState[message.id]?.status === "sending" ? (isZh ? "发送中..." : "Sending...") : (isZh ? "确认发送" : "Confirm Send")}
                                                                </Button>
                                                                {assistantMailActionState[message.id]?.status === "sent" ? (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onMouseDown={preventAssistantActionFocusLoss}
                                                                        onClick={() => openAssistantPreparedResumeMailDialog(message.id, message.mailConfirmationRequest!, "resend")}
                                                                    >
                                                                        <Send className="h-4 w-4"/>
                                                                        {isZh ? "再次发送" : "Send Again"}
                                                                    </Button>
                                                                ) : (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onMouseDown={preventAssistantActionFocusLoss}
                                                                        onClick={() => openAssistantPreparedResumeMailDialog(message.id, message.mailConfirmationRequest!)}
                                                                        disabled={assistantMailActionState[message.id]?.status === "sending"}
                                                                    >
                                                                        <ExternalLink className="h-4 w-4"/>
                                                                        {isZh ? "编辑后发送" : "Edit Before Sending"}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : null}
                                                <p className="mt-2 text-[15px] opacity-70">{formatDateTime(message.createdAt)}</p>
                                            </div>
                                        ))}
                                        {chatSending ? (
                                            <div className="flex items-center gap-2 text-base text-slate-500">
                                                <Loader2 className="h-4 w-4 animate-spin"/>
                                                {isZh ? "助手正在思考..." : "Assistant is thinking..."}
                                            </div>
                                        ) : null}
                                        <div ref={assistantScrollAnchorRef}/>
                                    </div>
                                </div>
                                {showScrollToBottomButton ? (
                                    <div className="pointer-events-none absolute bottom-4 right-4 z-10">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="pointer-events-auto rounded-full border-slate-200/80 bg-white/95 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/90"
                                            onMouseDown={preventAssistantActionFocusLoss}
                                            onClick={() => scrollAssistantToBottom("smooth")}
                                        >
                                            <ChevronDown className="h-4 w-4"/>
                                            {isZh ? "回到底部" : "Back to Bottom"}
                                        </Button>
                                    </div>
                                ) : null}
                            </div>

                            <div className="shrink-0 border-t border-slate-200/80 px-4 py-4 dark:border-slate-800 sm:px-5 sm:py-5">
                                <div className="mb-3 flex flex-wrap gap-2">
                                    {visibleQuickActionPrompts.map((prompt) => (
                                        <button
                                            key={prompt}
                                            type="button"
                                            onMouseDown={preventAssistantActionFocusLoss}
                                            onClick={() => applyAssistantPrompt(prompt, {openMode: "drawer"})}
                                            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-slate-100"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                    {hasMoreQuickActions ? (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="rounded-full"
                                            onMouseDown={preventAssistantActionFocusLoss}
                                            onClick={() => setAssistantQuickActionsExpanded((current) => !current)}
                                        >
                                            {assistantQuickActionsExpanded ? recruitmentUiText.collapse : recruitmentUiText.more}
                                            {assistantQuickActionsExpanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                                        </Button>
                                    ) : null}
                                </div>
                                <Textarea
                                    ref={assistantInputRef}
                                    autoFocus={assistantOpen || activePage === "assistant"}
                                    value={chatInput}
                                    onChange={(event) => setChatInput(event.target.value)}
                                    onKeyDown={(event) => {
                                        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                                            event.preventDefault();
                                            void sendChatMessage();
                                        }
                                    }}
                                    rows={isFullscreen ? 7 : isPage ? 4 : 5}
                                    placeholder={isZh ? "例如：重新对当前候选人初筛，硬性要求加强硬件测试经验；或说明这次用了哪些评估方案" : "For example: re-screen the current candidate with stronger hardware-testing requirements, or explain which assessment plans were used this time"}
                                />
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                    <p className="hidden text-sm text-slate-500 dark:text-slate-400 2xl:block">
                                        {isZh ? "助手会自动携带当前岗位与启用评估方案上下文，适合连续执行筛选、生成和查询操作。按 Ctrl/Cmd + Enter 可直接发送。" : "The assistant automatically carries the current position and enabled assessment plan context, which works well for screening, generation, and lookup flows. Press Ctrl/Cmd + Enter to send."}
                                    </p>
                                    <Button
                                        onClick={() => void sendChatMessage()}
                                        variant={canStopCurrentRun ? "outline" : "default"}
                                        disabled={isCurrentRunStopping || (!canStopCurrentRun && !chatInput.trim())}
                                    >
                                        {canStopCurrentRun ? <Square className="h-4 w-4"/> : <Send className="h-4 w-4"/>}
                                        {isCurrentRunStopping ? (isZh ? "停止中..." : "Stopping...") : canStopCurrentRun ? (isZh ? "停止生成" : "Stop") : (isZh ? "发送" : "Send")}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {assistantContextExpanded ? (
                            <div
                                className={cn(
                                    "hidden min-h-0 overflow-y-auto border-l border-slate-200/80 px-4 py-4 dark:border-slate-800 sm:px-5 sm:py-5",
                                    isFullscreen ? "2xl:block" : "xl:block",
                                )}
                            >
                                {assistantContextPanel}
                            </div>
                        ) : null}
                    </div>

                    {assistantContextExpanded ? (
                        <div
                            className={cn(
                                "absolute inset-y-0 right-0 z-20 w-full max-w-[320px] overflow-y-auto border-l border-slate-200/80 bg-white/95 px-4 py-4 shadow-[-16px_0_40px_-24px_rgba(15,23,42,0.4)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5 sm:py-5",
                                isFullscreen ? "2xl:hidden max-w-[360px]" : "xl:hidden",
                            )}
                        >
                            {assistantContextPanel}
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    function renderAssistantSuspendedState() {
        const modeLabel = assistantDisplayMode === "fullscreen" ? (isZh ? "全屏模式" : "fullscreen mode") : (isZh ? "宽抽屉模式" : "wide drawer mode");
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-8 py-10 text-center">
                <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <Bot className="h-6 w-6"/>
                </div>
                <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{isZh ? `助手已在${modeLabel}打开` : `Assistant is already open in ${modeLabel}`}</h3>
                    <p className="max-w-md text-base leading-6 text-slate-500 dark:text-slate-400">
                        {isZh ? "为避免背景页面和弹层同时绑定同一份输入内容，这里已暂停背景助手面板显示。当前会话内容和输入草稿仍保留在前台助手中。" : "To avoid binding the same input state in both the background page and the overlay, the background assistant panel is suspended here. Your current conversation and draft are still preserved in the foreground assistant."}
                    </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                    <Button onClick={() => openAssistantMode("page")}>{isZh ? "切回页内模式" : "Switch to In-Page Mode"}</Button>
                    <Button variant="outline" onClick={() => setAssistantOpen(false)}>{isZh ? "关闭弹层" : "Close Drawer"}</Button>
                </div>
            </div>
        );
    }

    function renderWorkspacePage() {
        return (
            <WorkspacePage
                dashboard={scopedDashboard}
                todayNewResumes={todayNewResumes}
                stats={stats}
                recentCandidates={recentCandidates}
                recentLogs={recentLogs}
                funnelData={funnelData}
                sourceStatsData={sourceStatsData}
                panelClass={panelClass}
                assistantOpen={assistantOpen}
                setActivePage={setActivePage}
                setSelectedCandidateId={setSelectedCandidateId}
                setSelectedLogId={setSelectedLogId}
                openAssistantMode={openAssistantMode}
                openCreatePosition={openCreatePosition}
                onRefresh={async () => {
                    await refreshCoreData();
                    toast.success(recruitmentToast.refreshed(recruitmentToastEntities.workspace));
                }}
                setResumeUploadOpen={setResumeUploadOpen}
                renderAssistantConsole={renderAssistantConsole}
                renderAssistantSuspendedState={renderAssistantSuspendedState}
            />
        );
    }

    // Memoize filtered + sorted candidates for position detail view
    const positionFilteredSortedCandidates = useMemo(() => {
        const filtered = positionCandidatesData.filter((c) =>
            positionCandidateStatusFilter === "__all__" || resolveCandidateDisplayStatus(c) === positionCandidateStatusFilter
        );
        return [...filtered].sort((a, b) => {
            const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return tb - ta;
        });
    }, [positionCandidatesData, positionCandidateStatusFilter]);

    function renderPositionsPage() {
        return (
            <div
                className={cn(
                    "grid h-full min-h-0 items-stretch gap-4 2xl:gap-6 overflow-hidden transition-all duration-300",
                    positionListCollapsed
                        ? "xl:grid-cols-[56px_minmax(0,1fr)] 2xl:grid-cols-[60px_minmax(0,1fr)]"
                        : "xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]",
                )}
            >
                <div className="position-panel relative min-h-0">
                    <div className={cn("position-panel-header", positionListCollapsed && "collapsed")}>
                        {positionListCollapsed ? (
                            <div className="flex items-center justify-center py-1">
                                <BriefcaseBusiness className="h-4 w-4 text-slate-400 dark:text-slate-500"/>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="position-panel-title">{isZh ? "岗位列表" : "Position List"}</span>
                                    <span className="position-panel-count">({visiblePositions.length}/{positions.length})</span>
                                </div>
                                <div className="mt-3 flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 flex-1 rounded-xl border-slate-200/80 bg-white/80 text-sm text-slate-700 shadow-none hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900/70"
                                        onClick={openCreatePosition}
                                    >
                                        <Plus className="mr-1 h-4 w-4"/>
                                        {isZh ? "新增岗位" : "Add Position"}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 rounded-xl border-slate-200/80 bg-white/80 px-2 text-sm text-slate-700 shadow-none hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900/70"
                                        disabled={positionsLoading}
                                        onClick={async () => {
                                            await loadPositions();
                                            toast.success(recruitmentToast.refreshed(recruitmentToastEntities.positions));
                                        }}
                                    >
                                        {positionsLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RotateCcw className="h-4 w-4"/>}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {!positionListCollapsed ? (
                        <div className="flex-shrink-0 px-4 pb-3">
                            <PositionQuerySearchInput
                                initialValue={positionQuery}
                                onChange={handlePositionQueryChange}
                                placeholder={isZh ? "搜索岗位、部门、地点" : "Search positions, departments, locations"}
                                inputClassName="h-9 rounded-xl border-slate-200/80 bg-white/80 text-sm shadow-none placeholder:text-slate-400 focus-visible:ring-2 dark:border-slate-800 dark:bg-slate-950/60 dark:placeholder:text-slate-500"
                            />
                            <div className="filter-chips mt-3">
                                <button
                                    type="button"
                                    className={cn("filter-chip", positionStatusFilter === "all" && "active")}
                                    onClick={() => setPositionStatusFilter("all")}
                                >
                                    {isZh ? "全部" : "All"}
                                </button>
                                {Object.entries(positionStatusLabels).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={cn("filter-chip", positionStatusFilter === value && "active")}
                                        onClick={() => setPositionStatusFilter(value)}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1 [scrollbar-gutter:stable] [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.75)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[scrollbar-color:rgba(71,85,105,0.9)_transparent] dark:[&::-webkit-scrollbar-thumb]:bg-slate-700">
                        <div className={cn(positionListCollapsed ? "space-y-2" : "space-y-2.5")}>
                            {positionsLoading ? (
                                <LoadingCard label={isZh ? "正在加载岗位列表" : "Loading positions"}/>
                            ) : visiblePositions.length ? visiblePositions.map((position) => {
                                const isSelected = selectedPositionId === position.id;
                                return (
                                    <button
                                        key={position.id}
                                        type="button"
                                        onClick={() => setSelectedPositionId(position.id)}
                                        className={cn(
                                            "group relative w-full rounded-2xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 dark:focus-visible:ring-slate-500/50",
                                            isSelected
                                                ? "border-slate-300 bg-slate-100/90 shadow-sm dark:border-slate-700 dark:bg-slate-900/90"
                                                : "border-slate-200/70 bg-white/65 hover:border-slate-300 hover:bg-white/95 dark:border-slate-800 dark:bg-slate-950/45 dark:hover:border-slate-700 dark:hover:bg-slate-900/60",
                                            positionListCollapsed && "flex items-center justify-center px-0 py-2.5 border-transparent bg-transparent hover:bg-slate-100/80 dark:hover:bg-slate-800/60",
                                            positionListCollapsed && isSelected && "border-transparent bg-slate-100 dark:bg-slate-900",
                                        )}
                                    >
                                        {isSelected && !positionListCollapsed ? <span className="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-slate-900 dark:bg-slate-100"/> : null}
                                        {positionListCollapsed ? (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="flex items-center justify-center">
                                                        <span className={cn(
                                                            "h-2.5 w-2.5 rounded-full",
                                                            isSelected
                                                                ? "bg-slate-900 dark:bg-slate-100"
                                                                : "bg-slate-300 dark:bg-slate-600"
                                                        )}/>
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent side="right">
                                                    <p className="text-sm font-medium">{position.title}</p>
                                                    <p className="text-[15px] opacity-70">{labelForPositionStatus(position.status)}</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <div className="min-w-0 space-y-2">
                                                <p className="line-clamp-2 text-[17px] font-semibold leading-5 text-slate-900 dark:text-slate-100">{position.title}</p>
                                                <div className="flex flex-wrap items-center gap-1.5 text-[14px] text-slate-500 dark:text-slate-400">
                                                    {showOrganizationColumn ? (
                                                        <Badge
                                                            variant="outline"
                                                            className="max-w-full rounded-full border-slate-200/80 bg-slate-50/80 px-2 py-0 text-[14px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
                                                        >
                                                            <span className="max-w-[160px] truncate">{getOrganizationLabel(position.org_code)}</span>
                                                        </Badge>
                                                    ) : null}
                                                    <Badge className={cn("rounded-full border px-2 py-0 text-[14px]", statusBadgeClass("position", position.status))}>
                                                        {labelForPositionStatus(position.status)}
                                                    </Badge>
                                                    <span className="rounded-full border border-transparent px-1.5 text-[15px] font-medium leading-5 text-slate-500 dark:text-slate-400">
                                                        {isZh ? `候选人 ${position.candidate_count}` : `Candidates ${position.candidate_count}`}
                                                    </span>
                                                </div>
                                                <p
                                                    className="truncate text-[15px] leading-5 text-slate-500 dark:text-slate-400"
                                                    title={`${position.department || (isZh ? "未设置部门" : "No department")} · ${position.location || (isZh ? "未设置地点" : "No location")}`}
                                                >
                                                    {position.department || (isZh ? "未设置部门" : "No department")} · {position.location || (isZh ? "未设置地点" : "No location")}
                                                </p>
                                            </div>
                                        )}
                                    </button>
                                );
                            }) : (
                                <EmptyState title={isZh ? "暂无岗位" : "No Positions Yet"} description={isZh ? "先新建一个岗位，再由 AI 生成 JD 并进入招聘流程。" : "Create a position first, then generate a JD and enter the recruiting workflow."}/>
                            )}
                            {positionListCollapsed && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-center py-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                            onClick={openCreatePosition}
                                        >
                                            <Plus className="h-4 w-4"/>
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                        <p className="text-sm">{isZh ? "新增岗位" : "Add Position"}</p>
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setPositionListCollapsed((current) => !current)}
                        className="absolute right-0 top-1/2 z-20 h-10 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border-slate-200/80 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
                        title={positionListCollapsed ? (isZh ? "展开岗位列表" : "Expand position list") : (isZh ? "收起岗位列表" : "Collapse position list")}
                    >
                        {positionListCollapsed ? <ChevronRight className="h-3.5 w-3.5"/> : <ChevronLeft className="h-3.5 w-3.5"/>}
                    </Button>
                </div>

                <div className="relative min-h-0 overflow-hidden">
                    {positionDetailLoading ? <LoadingPanel label={isZh ? "正在加载岗位详情" : "Loading position details"}/> : positionDetail ? (
                        <div className="flex h-full min-h-0 flex-col gap-3 2xl:gap-5">
                            <div
                                className={cn(
                                    "grid min-h-0 gap-4 2xl:gap-6 xl:flex-1",
                                    positionSecondaryPanelOpen
                                        ? "xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_336px]"
                                        : "grid-cols-1",
                                )}
                            >
                                <div className="min-h-0 space-y-4 overflow-y-auto xl:pr-2 xl:[scrollbar-gutter:stable] 2xl:space-y-6 [scrollbar-width:auto] [scrollbar-color:rgba(148,163,184,0.9)_transparent] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:bg-clip-content hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 dark:[scrollbar-color:rgba(71,85,105,0.95)_transparent] dark:[&::-webkit-scrollbar-thumb]:bg-slate-700 dark:hover:[&::-webkit-scrollbar-thumb]:bg-slate-600">
                                    <div
                                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/60"
                                    >
                                        <div className="flex min-w-0 shrink flex-wrap items-center gap-2">
                                            <Button
                                                size="sm"
                                                className="h-8 rounded-xl px-3 text-sm"
                                                variant={positionWorkspaceView === "jd" ? "default" : "outline"}
                                                onClick={() => setPositionWorkspaceView("jd")}
                                            >
                                                {isZh ? "当前 JD" : "Current JD"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="h-8 rounded-xl px-3 text-sm"
                                                variant={positionWorkspaceView === "config" ? "default" : "outline"}
                                                onClick={() => setPositionWorkspaceView("config")}
                                            >
                                                {isZh ? "岗位配置" : "Position Settings"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="h-8 rounded-xl px-3 text-sm"
                                                variant={positionWorkspaceView === "candidates" ? "default" : "outline"}
                                                onClick={() => {
                                                    setPositionWorkspaceView("candidates");
                                                    // 数据已加载或正在加载时跳过重复请求
                                                    if (selectedPositionId && positionCandidatesData.length === 0 && !positionCandidatesLoading) {
                                                        loadPositionCandidates(
                                                            selectedPositionId,
                                                            positionCandidateSearch || undefined,
                                                            positionCandidateStatusFilter !== "__all__" ? positionCandidateStatusFilter : undefined,
                                                        );
                                                    }
                                                }}
                                            >
                                                {recruitmentUiText.positionCandidates}
                                            </Button>
                                            <span className="min-w-0 truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                                                {positionDetail.position.title}
                                            </span>
                                        </div>
                                        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[15px] leading-none text-slate-500 dark:text-slate-400">
                                            <span className="whitespace-nowrap">{isZh ? `招聘人数 ${positionDetail.position.headcount}` : `Headcount ${positionDetail.position.headcount}`}</span>
                                            <span className="whitespace-nowrap">{isZh ? `JD 版本 ${positionDetail.jd_versions.length}` : `JD Versions ${positionDetail.jd_versions.length}`}</span>
                                            <span className="whitespace-nowrap">{isZh ? `候选人 ${positionDetail.candidates.length}` : `Candidates ${positionDetail.candidates.length}`}</span>
                                            <span className="whitespace-nowrap">{isZh ? `最近更新 ${formatDateTime(positionDetail.position.updated_at)}` : `Updated ${formatDateTime(positionDetail.position.updated_at)}`}</span>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 shrink-0 rounded-xl px-3 text-sm"
                                            onClick={() => setPositionSecondaryPanelOpen((current) => !current)}
                                        >
                                            {positionSecondaryPanelOpen ? (isZh ? "收起次级区" : "Hide Side Panel") : (isZh ? "版本与关联" : "Versions & Links")}
                                        </Button>
                                    </div>

                                    {positionWorkspaceView === "jd" ? (
                                        <div className="flex min-h-0 flex-1 flex-col gap-3 2xl:gap-4">

                                            {/* ① 顶部状态条 */}
                                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-2.5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
                                                <div className="flex flex-wrap items-center gap-2.5">
                                                    <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                                        {positionDetail.position.title}
                                                    </span>
                                                    <Badge className={cn("rounded-full border text-[14px]", statusBadgeClass("task", currentJDGenerationStatus === "syncing" ? "running" : currentJDGenerationStatus))}>
                                                        {labelForJDGenerationStatus(currentJDGenerationStatus)}
                                                    </Badge>
                                                    <Badge variant="outline" className="rounded-full text-[14px]">
                                                        {currentJDVersion ? `V${currentJDVersion.version_no} 生效中` : (isZh ? "未生成" : "Not generated")}
                                                    </Badge>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-slate-500 dark:text-slate-400">
                                                    <span>{isZh ? `招聘人数 ${positionDetail.position.headcount}` : `Headcount ${positionDetail.position.headcount}`}</span>
                                                    <span>{isZh ? `JD 版本 ${positionDetail.jd_versions.length}` : `JD Versions ${positionDetail.jd_versions.length}`}</span>
                                                    <span>{isZh ? `候选人 ${positionDetail.candidates.length}` : `Candidates ${positionDetail.candidates.length}`}</span>
                                                    <span>{isZh ? `最近更新 ${formatDateTime(positionDetail.position.updated_at)}` : `Updated ${formatDateTime(positionDetail.position.updated_at)}`}</span>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 rounded-xl px-2.5 text-sm"
                                                            onClick={() => {
                                                                setCandidatePositionFilter([String(positionDetail.position.id)]);
                                                                navigateToRecruitmentPage("candidates");
                                                            }}
                                                        >
                                                            <Users className="mr-1 h-3.5 w-3.5"/>
                                                            {isZh ? "候选人" : "Candidates"}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 rounded-xl px-2.5 text-sm"
                                                            onClick={() => {
                                                                if (positionDetail.candidates[0]) {
                                                                    setSelectedCandidateId(positionDetail.candidates[0].id);
                                                                    navigateToRecruitmentPage("candidates");
                                                                } else {
                                                                    toast.error(recruitmentToast.noCandidatesForInterview);
                                                                }
                                                            }}
                                                        >
                                                            <NotebookText className="mr-1 h-3.5 w-3.5"/>
                                                            {isZh ? "面试题" : "Interview Q"}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ② AI 生成区 */}
                                            <div className="rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
                                                        {/* 区块标题行 */}
                                                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800/80">
                                                            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-400">
                                                                <Sparkles className="h-3.5 w-3.5"/>
                                                                {isZh ? "AI 生成 JD" : "AI Generate JD"}
                                                            </span>
                                                            <span className="text-[15px] text-slate-400 dark:text-slate-500">
                                                                {isZh ? "可填写个性化要求，也可直接点击生成" : "Optionally add requirements, or generate directly"}
                                                            </span>
                                                        </div>
                                                        <div className="space-y-3 px-4 py-3">
                                                            <Textarea
                                                                value={jdExtraPrompt}
                                                                onChange={(event) => setJdExtraPrompt(event.target.value)}
                                                                rows={2}
                                                                placeholder={isZh
                                                                    ? "补充本次生成要求（选填），例如：强调 IoT 场景、自动化测试、设备联调经验等"
                                                                    : "Add generation-specific requirements (optional)"}
                                                                className="text-sm resize-none"
                                                            />
                                                            {/* 错误提示 */}
                                                            {latestJDGenerationError ? (
                                                                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                                                                    <span className="shrink-0">⚠</span>
                                                                    <span>{isZh ? `上次生成失败：${latestJDGenerationError}` : `Last generation failed: ${latestJDGenerationError}`}</span>
                                                                </div>
                                                            ) : null}
                                                            {/* 操作行 */}
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="text-[15px] text-slate-400 dark:text-slate-500">
                                                                    {positionDetail.jd_generation?.model_name || positionDetail.jd_generation?.model_provider
                                                                        ? (isZh ? `模型：${positionDetail.jd_generation?.model_name || positionDetail.jd_generation?.model_provider}` : `Model: ${positionDetail.jd_generation?.model_name || positionDetail.jd_generation?.model_provider}`)
                                                                        : ""}
                                                                    {positionDetail.jd_generation?.last_generated_at
                                                                        ? (isZh ? `　上次生成：${formatDateTime(positionDetail.jd_generation.last_generated_at)}` : `　Last: ${formatDateTime(positionDetail.jd_generation.last_generated_at)}`)
                                                                        : ""}
                                                                </span>
                                                                <div className="flex shrink-0 gap-2">
                                                                    {isJDGenerating ? (
                                                                        <Button variant="outline" size="sm" onClick={() => void stopJDGeneration()} className="rounded-xl text-sm">
                                                                            <Square className="mr-1 h-3.5 w-3.5"/>
                                                                            {isZh ? "停止生成" : "Stop"}
                                                                        </Button>
                                                                    ) : (
                                                                        <>
                                                                            {currentJDVersion && (
                                                                                <Button variant="outline" size="sm" onClick={() => void generateJD()} className="rounded-xl text-sm">
                                                                                    <RefreshCw className="mr-1 h-3.5 w-3.5"/>
                                                                                    {isZh ? "重新生成" : "Regenerate"}
                                                                                </Button>
                                                                            )}
                                                                            <Button size="sm" onClick={() => void generateJD()} className="rounded-xl text-sm">
                                                                                <Wand2 className="mr-1 h-3.5 w-3.5"/>
                                                                                {isZh ? "AI 生成 JD" : "Generate JD"}
                                                                            </Button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {/* 生成进度区（生成中时展示） */}
                                                            {isJDGenerating ? (
                                                                <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3.5 dark:border-sky-900 dark:bg-sky-950/30">
                                                                    <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-200">
                                                                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0"/>
                                                                        {jdGenerationStatus === "syncing"
                                                                            ? (isZh ? "正在同步最新 JD 到页面…" : "Syncing the latest JD to page…")
                                                                            : (isZh ? "正在生成 JD…" : "Generating JD…")}
                                                                    </div>
                                                                    {jdStreamingContent ? (
                                                                        <div className="mt-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap rounded-xl border bg-white/80 px-3 py-2.5 text-sm leading-7 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                                                                            {jdStreamingContent}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="mt-3 grid gap-2">
                                                                            <div className="h-3 rounded-full bg-sky-100 dark:bg-sky-900/60"/>
                                                                            <div className="h-3 w-10/12 rounded-full bg-sky-100 dark:bg-sky-900/60"/>
                                                                            <div className="h-16 rounded-xl bg-white/80 dark:bg-slate-900/70"/>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>

                                                    {/* ④ JD 内容区 */}
                                                    <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
                                                        {/* 视图切换 + 复制按钮 */}
                                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800/80">
                                                            <div className="flex gap-1.5">
                                                                <Button
                                                                    variant={jdViewMode === "publish" ? "default" : "outline"}
                                                                    size="sm"
                                                                    className="h-7 rounded-xl px-3 text-sm"
                                                                    onClick={() => setJdViewMode("publish")}
                                                                >
                                                                    {isZh ? "可发布版" : "Publish Copy"}
                                                                </Button>
                                                                <Button
                                                                    variant={jdViewMode === "markdown" ? "default" : "outline"}
                                                                    size="sm"
                                                                    className="h-7 rounded-xl px-3 text-sm"
                                                                    onClick={() => setJdViewMode("markdown")}
                                                                >
                                                                    {isZh ? "编辑源文本" : "Edit Source"}
                                                                </Button>
                                                                <Button
                                                                    variant={jdViewMode === "preview" ? "default" : "outline"}
                                                                    size="sm"
                                                                    className="h-7 rounded-xl px-3 text-sm"
                                                                    onClick={() => setJdViewMode("preview")}
                                                                >
                                                                    {isZh ? "排版预览" : "Preview"}
                                                                </Button>
                                                            </div>
                                                            {jdViewMode === "publish" && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-7 rounded-xl px-3 text-sm"
                                                                    onClick={() => void copyPublishJDText()}
                                                                    disabled={!currentPublishText.trim()}
                                                                >
                                                                    <ClipboardCheck className="mr-1 h-3.5 w-3.5"/>
                                                                    {isZh ? "复制发布文案" : "Copy Publish Copy"}
                                                                </Button>
                                                            )}
                                                        </div>

                                                        {/* 内容区 */}
                                                        {jdViewMode === "publish" ? (
                                                            <div className="min-h-[300px] whitespace-pre-wrap px-5 py-4 text-base leading-7 text-slate-700 dark:text-slate-200">
                                                                {currentPublishText || (
                                                                    <span className="text-slate-400 dark:text-slate-500">
                                                                        {isZh
                                                                            ? '暂无可发布的 JD 文案，点击"AI 生成 JD"后将在此展示。'
                                                                            : 'No publish-ready JD yet. Click "Generate JD" and it will appear here.'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : null}

                                                        {jdViewMode === "markdown" ? (
                                                            <div className="px-4 py-3">
                                                                <Textarea
                                                                    value={jdDraft.jdMarkdown}
                                                                    onChange={(event) => setJdDraft((current) => ({
                                                                        ...current,
                                                                        jdMarkdown: event.target.value,
                                                                    }))}
                                                                    rows={18}
                                                                    className="font-mono text-sm"
                                                                />
                                                                <p className="mt-1.5 text-[15px] text-slate-400 dark:text-slate-500">
                                                                    {isZh ? "编辑完成后点击下方「保存新版本」即可更新" : "Edit and click 'Save New Version' below to update"}
                                                                </p>
                                                            </div>
                                                        ) : null}

                                                        {jdViewMode === "preview" ? (
                                                            <div
                                                                className="min-h-[300px] px-5 py-4 text-base leading-7 text-slate-700 dark:text-slate-200"
                                                                dangerouslySetInnerHTML={{__html: currentPreviewHtml}}
                                                            />
                                                        ) : null}

                                                        {/* 底部操作栏 */}
                                                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 dark:border-slate-800/80 dark:bg-slate-900/30">
                                                            <div className="flex flex-wrap items-center gap-3">
                                                                <label className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={jdDraft.autoActivate}
                                                                        onChange={(event) => setJdDraft((current) => ({
                                                                            ...current,
                                                                            autoActivate: event.target.checked,
                                                                        }))}
                                                                    />
                                                                    {isZh ? "保存后设为生效版本" : "Set as Active After Saving"}
                                                                </label>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-sm text-slate-400 dark:text-slate-500">{isZh ? "版本标题" : "Title"}</span>
                                                                    <input
                                                                        type="text"
                                                                        value={jdDraft.title}
                                                                        onChange={(event) => setJdDraft((current) => ({
                                                                            ...current,
                                                                            title: event.target.value,
                                                                        }))}
                                                                        className="h-7 w-40 rounded-lg border border-slate-200/80 bg-white/80 px-2 text-sm text-slate-700 outline-none focus:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                                                    />
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-sm text-slate-400 dark:text-slate-500">{isZh ? "备注" : "Notes"}</span>
                                                                    <input
                                                                        type="text"
                                                                        value={jdDraft.notes}
                                                                        onChange={(event) => setJdDraft((current) => ({
                                                                            ...current,
                                                                            notes: event.target.value,
                                                                        }))}
                                                                        placeholder={isZh ? "选填" : "Optional"}
                                                                        className="h-7 w-36 rounded-lg border border-slate-200/80 bg-white/80 px-2 text-sm text-slate-700 outline-none focus:border-slate-300 placeholder:text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:placeholder:text-slate-600"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <Button
                                                                onClick={() => void saveJDVersion()}
                                                                disabled={jdVersionSaving}
                                                                size="sm"
                                                                className="rounded-xl text-sm"
                                                            >
                                                                <Save className="mr-1 h-3.5 w-3.5"/>
                                                                {jdVersionSaving
                                                                    ? (isZh ? "保存中…" : "Saving…")
                                                                    : (isZh ? "保存新版本" : "Save New Version")}
                                                            </Button>
                                                        </div>
                                                    </div>

                                            </div>
                                    ) : positionWorkspaceView === "candidates" && positionDetail ? (() => {
                                        const candidates = positionCandidatesData;
                                        const detailContent = positionCandidateDetailOpen
                                            ? renderSharedCandidateDrawerContent(() => setPositionCandidateDetailOpen(false))
                                            : null;
                                        return (
                                            <PositionCandidatesView
                                                positionDetail={positionDetail}
                                                positionCandidatesData={positionCandidatesData}
                                                positionCandidatesLoading={positionCandidatesLoading}
                                                positionCandidatesInitialLoaded={positionCandidatesInitialLoaded}
                                                positionCandidatesTotal={positionCandidatesTotal}
                                                positionCandidateDetailOpen={positionCandidateDetailOpen}
                                                positionCandidateStatusFilter={positionCandidateStatusFilter}
                                                positionFilteredSortedCandidates={positionFilteredSortedCandidates}
                                                onSelectCandidate={handlePositionCandidateSelect}
                                                isLoadingMorePositionCandidates={isLoadingMorePositionCandidates}
                                                selectedPositionId={selectedPositionId}
                                                selectedCandidateId={selectedCandidateId}
                                                candidateDetail={candidateDetail}
                                                candidateDetailLoading={candidateDetailLoading}
                                                detailContent={detailContent}
                                                initialSearchValue={positionCandidateSearch}
                                                isZh={isZh}
                                                recruitmentUiText={recruitmentUiText}
                                                candidateStatusLabels={candidateStatusLabels}
                                                onSearchChange={handlePositionCandidateSearchChange}
                                                onStatusFilterChange={(v) => setPositionCandidateStatusFilter(v)}
                                                onCloseDetail={() => setPositionCandidateDetailOpen(false)}
                                                onViewInCandidatePage={(id) => { setPositionCandidateDetailOpen(false); setSelectedCandidateId(id); navigateToRecruitmentPage("candidates"); }}
                                                onViewAllCandidates={() => {
                                                    setCandidatePositionFilter([String(positionDetail.position.id)]);
                                                    navigateToRecruitmentPage("candidates");
                                                }}
                                                onLoadMore={() => { if (selectedPositionId) void loadMorePositionCandidates(selectedPositionId); }}
                                                onViewResume={handleViewResume}
                                            />
                                        );
                                    })() : (
                                        <Card className={panelClass}>
                                            <CardHeader className="space-y-3">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <CardTitle className="text-xl">{isZh ? "岗位配置" : "Position Settings"}</CardTitle>
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button variant="outline" size="sm" onClick={openEditPosition}>
                                                            <FilePlus2 className="h-4 w-4"/>
                                                            {isZh ? "编辑岗位" : "Edit Position"}
                                                        </Button>
                                                        <Button variant="outline" size="sm" onClick={() => setPublishDialogOpen(true)}>
                                                            <Rocket className="h-4 w-4"/>
                                                            {isZh ? "发布岗位" : "Publish Position"}
                                                        </Button>
                                                        <Button variant="outline" size="sm" onClick={() => setPositionDeleteConfirmOpen(true)} disabled={positionDeleting}>
                                                            <Trash2 className="h-4 w-4"/>
                                                            {positionDeleting ? (isZh ? "删除中..." : "Deleting...") : (isZh ? "删除岗位" : "Delete Position")}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-5">
                                                <Field label={isZh ? "岗位基础信息" : "Position Basics"}>
                                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                                        <InfoTile label={isZh ? "部门" : "Department"} value={positionDetail.position.department || (isZh ? "未设置部门" : "No department")}/>
                                                        <InfoTile label={recruitmentUiText.organizationField} value={getOrganizationLabel(positionDetail.position.org_code)}/>
                                                        <InfoTile label={isZh ? "地点 / 用工类型" : "Location / Employment"} value={`${positionDetail.position.location || (isZh ? "未设置地点" : "No location")} · ${positionDetail.position.employment_type || (isZh ? "未设置用工类型" : "No employment type")}`}/>
                                                        <InfoTile label={isZh ? "薪资 / 招聘人数" : "Salary / Headcount"} value={`${positionDetail.position.salary_range || (isZh ? "未设置薪资" : "No salary set")} · ${positionDetail.position.headcount} ${isZh ? "人" : ""}`}/>
                                                        <InfoTile label={isZh ? "标签" : "Tags"} value={joinTags(positionDetail.position.tags) || (isZh ? "未设置" : "Not set")}/>
                                                        <InfoTile label={isZh ? "关键要求" : "Key Requirements"} value={shortText(positionDetail.position.key_requirements, 120)}/>
                                                        <InfoTile label={isZh ? "加分项" : "Bonus Points"} value={shortText(positionDetail.position.bonus_points, 120)}/>
                                                    </div>
                                                </Field>

                                                <Field label={isZh ? "评估方案与自动化配置" : "Assessment Plans & Automation"}>
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        <InfoTile label={isZh ? "JD 分析方案" : "JD Analysis Plan"} value={(positionDetail.position.jd_skill_ids || []).length ? formatSkillNames(positionDetail.position.jd_skill_ids || [], skillMap, language) : (isZh ? "未选择，自动使用系统通用基座" : "Not selected, using the system base")}/>
                                                        <InfoTile label={isZh ? "初筛评估方案" : "Screening Assessment Plan"} value={(positionDetail.position.screening_skill_ids || []).length ? formatSkillNames(positionDetail.position.screening_skill_ids || [], skillMap, language) : (isZh ? "未选择，自动使用系统通用基座" : "Not selected, using the system base")}/>
                                                        <InfoTile label={isZh ? "面试题评估方案" : "Interview Assessment Plan"} value={(positionDetail.position.interview_skill_ids || []).length ? formatSkillNames(positionDetail.position.interview_skill_ids || [], skillMap, language) : (isZh ? "未选择，自动使用系统通用基座" : "Not selected, using the system base")}/>
                                                        <InfoTile label={isZh ? "自动流程" : "Automation"} value={`${positionDetail.position.auto_screen_on_upload ? (isZh ? "上传自动初筛已开启" : "Auto-screen on upload is on") : (isZh ? "上传自动初筛未开启" : "Auto-screen on upload is off")} · ${positionDetail.position.auto_advance_on_screening === false ? (isZh ? "通过后自动推进关闭" : "Auto-advance after pass is off") : (isZh ? "通过后自动推进开启" : "Auto-advance after pass is on")}`}/>
                                                    </div>
                                                </Field>

                                                <Field label={isZh ? "岗位摘要" : "Position Summary"}>
                                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 text-base leading-7 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                                                        {positionDetail.position.summary || (isZh ? "这个岗位还没有补充摘要，建议先由招聘同事或 AI 完善岗位背景和关键目标。" : "This position does not have a summary yet. It is recommended to add background and key goals with recruiting teammates or AI first.")}
                                                    </div>
                                                </Field>
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>

                                {positionSecondaryPanelOpen ? (
                                    <div className="min-h-0 space-y-4 overflow-y-auto xl:pr-1 xl:[scrollbar-gutter:stable] 2xl:space-y-6">
                                        <Card className={panelClass}>
                                            <CardHeader className="space-y-2">
                                                <CardTitle className="text-xl">{isZh ? "JD 历史版本" : "JD History"}</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                {positionDetail.jd_versions.length ? positionDetail.jd_versions.map((version) => (
                                                    <div key={version.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">{version.title}</p>
                                                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                                    V{version.version_no} · {formatDateTime(version.created_at)}
                                                                </p>
                                                            </div>
                                                            <Badge className={cn("rounded-full border", version.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                                                                {version.is_active ? (isZh ? "当前生效" : "Active") : (isZh ? "历史版本" : "Historical")}
                                                            </Badge>
                                                        </div>
                                                        <p className="mt-3 text-base text-slate-600 dark:text-slate-300">{shortText(version.notes || version.prompt_snapshot || version.jd_markdown, 110)}</p>
                                                        {!version.is_active ? (
                                                            <Button size="sm" variant="outline" className="mt-3" onClick={() => void activateJDVersion(version.id)} disabled={jdVersionActivating}>
                                                                {jdVersionActivating ? (isZh ? "切换中..." : "Switching...") : (isZh ? "切换为当前版本" : "Set as Active Version")}
                                                            </Button>
                                                        ) : null}
                                                    </div>
                                                )) : (
                                                    <EmptyState title={isZh ? "暂无 JD 版本" : "No JD Versions"} description={isZh ? "点击 AI 生成 JD 或保存新版本后，这里会形成完整版本轨迹。" : "Generate a JD or save a new version to build the version history here."}/>
                                                )}
                                            </CardContent>
                                        </Card>

                                        <Card className={panelClass}>
                                            <CardHeader className="space-y-2">
                                                <CardTitle className="text-xl">{isZh ? "关联候选人" : "Linked Candidates"}</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                {positionDetail.candidates.length ? positionDetail.candidates.map((candidate) => {
                                                    const displayStatus = resolveCandidateDisplayStatus(candidate);
                                                    return (
                                                        <button
                                                            key={candidate.id}
                                                            type="button"
                                                            className="flex w-full items-start justify-between rounded-2xl border border-slate-200/80 px-4 py-4 text-left transition hover:border-slate-400 dark:border-slate-800"
                                                            onClick={() => {
                                                                setSelectedCandidateId(candidate.id);
                                                                navigateToRecruitmentPage("candidates");
                                                            }}
                                                        >
                                                            <div>
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">{candidate.name}</p>
                                                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                                    {isZh ? "匹配度" : "Match"} {formatPercent(candidate.match_percent)} · {candidate.phone || (isZh ? "未填写手机号" : "No phone number")}
                                                                </p>
                                                            </div>
                                                            <Badge className={cn("rounded-full border", statusBadgeClass("candidate", displayStatus))}>
                                                                {labelForCandidateStatus(displayStatus)}
                                                            </Badge>
                                                        </button>
                                                    );
                                                }) : (
                                                    <EmptyState title={recruitmentUiText.noCandidates} description={recruitmentUiText.noCandidatesDesc}/>
                                                )}
                                            </CardContent>
                                        </Card>

                                        <Card className={panelClass}>
                                            <CardHeader className="space-y-2">
                                                <CardTitle className="text-xl">{isZh ? "发布状态" : "Publish Status"}</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                {positionDetail.publish_tasks.length ? positionDetail.publish_tasks.map((task) => (
                                                    <div key={task.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div>
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">
                                                                    {task.target_platform.toUpperCase()} · {task.mode.toUpperCase()}
                                                                </p>
                                                                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatDateTime(task.created_at)}</p>
                                                            </div>
                                                            <Badge className={cn("rounded-full border", statusBadgeClass("task", task.status))}>
                                                                {labelForTaskExecutionStatus(task.status)}
                                                            </Badge>
                                                        </div>
                                                        {task.published_url ? (
                                                            <a className="mt-3 inline-flex items-center gap-1 text-base text-sky-600 hover:underline" href={task.published_url} target="_blank" rel="noreferrer">
                                                                {isZh ? "查看发布链接" : "Open Published Link"}
                                                                <ExternalLink className="h-4 w-4"/>
                                                            </a>
                                                        ) : null}
                                                        {task.error_message ? <p className="mt-3 text-base text-rose-600">{task.error_message}</p> : null}
                                                    </div>
                                                )) : (
                                                    <EmptyState title={isZh ? "暂无发布任务" : "No Publish Tasks"} description={isZh ? "先完成 JD，再创建发布任务，后续可接入真实 BOSS / 智联适配器。" : "Finish the JD first, then create a publish task. Real Boss Zhipin / Zhaopin adapters can be connected later."}/>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <EmptyState title={isZh ? "请选择一个岗位" : "Select a Position"} description={isZh ? "左侧选择岗位后，右侧会进入完整的岗位详情工作区。" : "Choose a position on the left to open the full position workspace on the right."}/>
                    )}
                </div>
            </div>
        );
    }

    function renderCandidatesPage() {
        return (
            <CandidatesPage
                panelClass={panelClass}
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
                visibleCandidates={visibleCandidates}
                selectedCandidateIds={selectedCandidateIds}
                setSelectedCandidateIds={setSelectedCandidateIds}
                triggerScreening={triggerScreening}
                triggerFreshScreening={triggerFreshScreening}
                isBatchScreeningCancelling={isBatchScreeningCancelling}
                screeningSubmitting={screeningSubmitting}
                isBatchScreeningRunning={isBatchScreeningRunning}
                openResumeMailDialog={openResumeMailDialog}
                candidatesLoading={candidatesLoading}
                candidatesInitialLoaded={candidatesInitialLoaded}
                isLoadingMoreCandidates={isLoadingMoreCandidates}
                candidateMatchSortLoading={candidateMatchSortLoading}
                allCandidatesCount={allCandidates.length}
                candidateTotal={candidateTotal}
                candidateListScrollRef={candidateListScrollRef}
                candidateListHorizontalRailRef={candidateListHorizontalRailRef}
                renderCandidateListHeaderCell={renderCandidateListHeaderCell}
                selectedCandidateId={selectedCandidateId}
                setSelectedCandidateId={setSelectedCandidateId}
                toggleCandidateSelection={toggleCandidateSelection}
                candidateListDisplayColumnWidths={candidateListDisplayColumnWidths}
                showOrganizationColumn={showOrganizationColumn}
                getOrganizationLabel={getOrganizationLabel}
                getCandidateResumeMailSummary={getCandidateResumeMailSummary}
                groupedCandidates={groupedCandidates}
                candidateDetailLoading={candidateDetailLoading}
                candidateDetail={candidateDetail}
                isSelectedCandidateScreeningCancelling={isSelectedCandidateScreeningCancelling}
                selectedCandidateScreeningTaskId={selectedCandidateScreeningTaskId}
                openResumeFile={openResumeFile}
                previewResumeFile={openResumePreview}
                generateInterviewQuestions={generateInterviewQuestions}
                isCurrentInterviewTaskCancelling={isCurrentInterviewTaskCancelling}
                currentCandidateInterviewTaskId={currentCandidateInterviewTaskId}
                candidateEditor={candidateEditor}
                setCandidateEditor={setCandidateEditor}
                saveCandidate={saveCandidate}
                candidateSaving={candidateSaving}
                exporting={exporting}
                requestDeleteResumeFile={requestDeleteResumeFile}
                requestDeleteCandidate={requestDeleteCandidate}
                effectiveScreeningSkillSourceLabel={effectiveScreeningSkillSourceLabel}
                effectiveScreeningSkillIds={effectiveScreeningSkillIds}
                skillMap={skillMap}
                pendingStatus={pendingStatus}
                setPendingStatus={setPendingStatus}
                updateCandidateStatus={updateCandidateStatus}
                statusUpdateReason={statusUpdateReason}
                setStatusUpdateReason={setStatusUpdateReason}
                candidateAssistantActivity={candidateAssistantActivity}
                preferredInterviewSkillSourceLabel={preferredInterviewSkillSourceLabel}
                effectiveInterviewSkillSourceLabel={effectiveInterviewSkillSourceLabel}
                openAssistantMode={openAssistantMode}
                candidateProcessActivity={candidateProcessActivity}
                candidateProcessLogsExpanded={candidateProcessLogsExpanded}
                setCandidateProcessLogsExpanded={setCandidateProcessLogsExpanded}
                openTaskLogDetail={openTaskLogDetail}
                interviewRoundName={interviewRoundName}
                setInterviewRoundName={setInterviewRoundName}
                effectiveInterviewSkillIds={effectiveInterviewSkillIds}
                interviewCustomRequirements={interviewCustomRequirements}
                setInterviewCustomRequirements={setInterviewCustomRequirements}
                interviewSkillSelectionDirty={interviewSkillSelectionDirty}
                setSelectedInterviewSkillIds={setSelectedInterviewSkillIds}
                setInterviewSkillSelectionDirty={setInterviewSkillSelectionDirty}
                skills={skills}
                toggleInterviewSkillSelection={toggleInterviewSkillSelection}
                downloadInterviewQuestion={downloadInterviewQuestion}
                interviewSchedules={interviewSchedules}
                createInterviewSchedule={createInterviewSchedule}
                deleteInterviewSchedule={deleteInterviewSchedule}
                offers={offers}
                createOffer={createOffer}
                updateOffer={updateOffer}
                deleteOffer={deleteOffer}
                exportCandidates={exportCandidates}
                requestBatchDelete={requestBatchDelete}
                batchBindPosition={batchBindPosition}
                onMoveToTalentPool={async (candidateIds) => {
                    await recruitmentApi("/candidates/batch-move-to-talent-pool", {
                        method: "POST",
                        body: JSON.stringify({ candidate_ids: candidateIds }),
                    });
                    await loadCandidates();
                    await loadTalentPoolCandidates();
                }}
                onRefresh={async () => {
                    await refreshCandidatesManually();
                }}
                batchUpdateStatus={batchUpdateStatus}
                duplicateCandidates={duplicateCandidates}
                followUps={followUps}
                createFollowUp={createFollowUp}
                deleteFollowUp={deleteFollowUp}
            />
        );
    }

    function renderAuditPage() {
        return (
            <AuditPage
                panelClass={panelClass}
                auditFiltersCollapsed={auditFiltersCollapsed}
                auditFilterSummary={auditFilterSummary}
                logsLoading={logsLoading}
                logTaskTypeFilter={logTaskTypeFilter}
                logStatusFilter={logStatusFilter}
                aiLogs={visibleAiLogs}
                selectedLogId={selectedLogId}
                selectedLogDetail={selectedLogDetail}
                logDetailLoading={logDetailLoading}
                auditListTableWidth={auditListTableWidth}
                auditListDisplayColumnWidths={auditListDisplayColumnWidths}
                positionMap={positionMap}
                candidateMap={candidateMap}
                skillMap={skillMap}
                refreshLogsWithFeedback={refreshLogsWithFeedback}
                setAuditFiltersCollapsed={setAuditFiltersCollapsed}
                setLogTaskTypeFilter={setLogTaskTypeFilter}
                setLogStatusFilter={setLogStatusFilter}
                setSelectedLogId={setSelectedLogId}
                auditListScrollRef={auditListScrollRef}
                auditListHorizontalRailRef={auditListHorizontalRailRef}
            />
        );
    }

    async function deleteTalentPoolCandidates(candidateIds: number[]) {
        const result = await recruitmentApi<{ deleted_count: number; skipped: { candidate_id: number; reason: string }[] }>("/candidates/batch-delete", {
            method: "POST",
            body: JSON.stringify({ candidate_ids: candidateIds }),
        });
        const deletedCount = result.deleted_count ?? 0;
        const skipped = result.skipped ?? [];
        if (skipped.length > 0) {
            const names = skipped.map((s) => `ID:${s.candidate_id}`).join(", ");
            toast.warning(recruitmentToast.candidatesDeletedWithSkipped(deletedCount, skipped.length, names));
        } else {
            toast.success(recruitmentToast.candidatesDeleted(deletedCount));
        }
        await Promise.all([loadCandidates({ silent: true }), refreshCandidateStats(), loadTalentPoolCandidates()]);
    }

    function renderTalentPoolPage() {
        return (
            <div className="relative h-full min-h-0 overflow-hidden">
                <TalentPoolPage
                    candidates={talentPoolCandidates}
                    positions={positions}
                    loading={talentPoolLoading}
                    onAssignPosition={batchBindPosition}
                    onCreatePosition={(suggestedTitle) => {
                        setPositionForm((prev) => ({ ...prev, title: suggestedTitle }));
                        setPositionDialogMode("create");
                        setPositionDialogOpen(true);
                        navigateToRecruitmentPage("positions");
                    }}
                    onViewCandidate={handleTalentPoolCandidateSelect}
                    onUploadResume={openResumeUploadDialog}
                    onDeleteCandidates={deleteTalentPoolCandidates}
                    onRefresh={async () => {
                        await loadTalentPoolCandidates();
                        toast.success(recruitmentToast.refreshed(recruitmentToastEntities.talentPool));
                    }}
                    onReIdentify={async (candidateId) => {
                        const result = await triggerAIPositionMatch([candidateId]);
                        if ((result.total_candidates || 0) > 0) {
                            setAllTalentPoolCandidates(prev => prev.map(c =>
                                c.id === candidateId ? { ...c, status: "matching" } : c
                            ));
                        }
                    }}
                    onBatchReIdentify={async (candidateIds) => {
                        const result = await triggerAIPositionMatch(candidateIds);
                        if ((result.total_candidates || 0) > 0) {
                            const idSet = new Set(candidateIds);
                            setAllTalentPoolCandidates(prev => prev.map((candidate) => (
                                idSet.has(candidate.id) ? { ...candidate, status: "matching" } : candidate
                            )));
                        }
                    }}
                    onCancelMatch={async (candidateId) => {
                        await recruitmentApi(`/candidates/${candidateId}/cancel-match`, { method: "POST" });
                        setAllTalentPoolCandidates(prev => prev.map(c =>
                            c.id === candidateId ? { ...c, status: "unmatched" } : c
                        ));
                    }}
                    panelClass={panelClass}
                />
                {talentPoolCandidateDetailOpen && (
                    <>
                        <div
                            className="absolute inset-0 z-10 bg-slate-900/5 backdrop-blur-[1px]"
                            onClick={() => setTalentPoolCandidateDetailOpen(false)}
                        />
                        <div className="absolute right-0 top-0 bottom-0 z-20 flex w-full flex-col bg-white shadow-2xl ring-1 ring-slate-200 animate-in slide-in-from-right duration-300 dark:bg-slate-950 dark:ring-slate-800 sm:w-[480px] md:w-[560px] lg:w-[50%]">
                            {renderSharedCandidateDrawerContent(() => setTalentPoolCandidateDetailOpen(false))}
                        </div>
                    </>
                )}
            </div>
        );
    }

    function renderAssistantPage() {
        return (
            <AssistantPage
                panelClass={panelClass}
                assistantOpen={assistantOpen}
                renderAssistantSuspendedState={renderAssistantSuspendedState}
                renderAssistantConsole={renderAssistantConsole}
            />
        );
    }

    function renderSkillsPage() {
        return (
            <SkillSettingsPage
                panelClass={panelClass}
                skillsLoading={skillsLoading}
                skills={skills}
                canManageSkill={canManageSkill}
                openSkillEditor={openSkillEditor}
                openSkillEditorByTaskKind={openSkillEditorByTaskKind}
                openSkillEditorWithAI={openSkillEditorWithAI}
                toggleSkill={toggleSkill}
                setSkillDeleteTarget={setSkillDeleteTarget}
            />
        );
    }

    function renderModelsPage() {
        return (
            <ModelSettingsPage
                panelClass={panelClass}
                llmConfigs={llmConfigs}
                modelsLoading={modelsLoading}
                canManageLLMConfig={canManageLLMConfig}
                assistantModelLabel={assistantModelLabel}
                assistantActiveLLMConfig={assistantActiveLLMConfig}
                preferredLLMConfigIds={preferredLLMConfigIds}
                openLLMEditor={openLLMEditor}
                copyLLMEditor={copyLLMEditor}
                setPreferredLLMConfig={setPreferredLLMConfig}
                setLlmDeleteTarget={setLlmDeleteTarget}
                refreshLLMConfigsWithFeedback={refreshLLMConfigsWithFeedback}
            />
        );
    }

    function renderMailSettingsPage() {
        return (
            <MailSettingsPage
                panelClass={panelClass}
                mailSenderConfigs={mailSenderConfigs}
                mailRecipients={mailRecipients}
                resumeMailDispatches={resumeMailDispatches}
                mailAutoPushGlobalConfig={mailAutoPushGlobalConfig}
                mailSettingsLoading={mailSettingsLoading}
                mailAutoPushConfigSaving={mailAutoPushConfigSaving}
                mailRecipientMap={mailRecipientMap}
                mailSenderMap={mailSenderMap}
                candidateMap={candidateMap}
                positionMap={positionMap}
                mailDispatchActionKey={mailDispatchActionKey}
                selectedCandidateIds={selectedCandidateIds}
                selectedCandidateId={selectedCandidateId}
                canManageMailConfig={canManageMailConfig}
                openMailSenderEditor={openMailSenderEditor}
                openMailRecipientEditor={openMailRecipientEditor}
                openResumeMailDialog={openResumeMailDialog}
                openResumeMailReplayDialog={openResumeMailReplayDialog}
                retryResumeMailDispatch={retryResumeMailDispatch}
                setMailSenderDeleteTarget={setMailSenderDeleteTarget}
                setMailRecipientDeleteTarget={setMailRecipientDeleteTarget}
                setMailAutoPushGlobalConfig={setMailAutoPushGlobalConfig}
                saveMailAutoPushGlobalConfig={saveMailAutoPushGlobalConfig}
                refreshMailSettingsWithFeedback={refreshMailSettingsWithFeedback}
            />
        );
    }

    function renderPage() {
        switch (activePage) {
            case "workspace":
                return renderWorkspacePage();
            case "positions":
                return renderPositionsPage();
            case "candidates":
                return renderCandidatesPage();
            case "talent-pool":
                return renderTalentPoolPage();
            case "audit":
                return renderAuditPage();
            case "assistant":
                return renderAssistantPage();
            case "settings-skills":
                return renderSkillsPage();
            case "settings-models":
                return renderModelsPage();
            case "settings-mail":
                return renderMailSettingsPage();
            default:
                return null;
        }
    }

    // Memoize page render results to avoid unnecessary re-renders
    const candidatesPageNode = useMemo(
        () => renderCandidatesPage(),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            visibleCandidates, selectedCandidateId, candidateDetail,
            candidatesLoading, candidatesInitialLoaded, isLoadingMoreCandidates,
            selectedCandidateIds, candidateDetailLoading, candidateEditor,
            candidateSaving, exporting, pendingStatus, statusUpdateReason,
            candidateViewMode, candidatePositionFilter, candidateStatusFilter,
            candidateMatchFilter, candidateSourceFilter, candidateTimeFilter,
            candidateQuery, interviewSchedules, followUps, offers,
            screeningSubmitting, isBatchScreeningRunning, isBatchScreeningCancelling,
            batchStopScreeningTaskIds,
            candidateProcessLogsExpanded, interviewRoundName, interviewCustomRequirements,
            interviewSkillSelectionDirty, selectedInterviewSkillIds,
        ]
    );

    const positionsPageNode = renderPositionsPage();

    const auditPageNode = useMemo(
        () => renderAuditPage(),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            visibleAiLogs, selectedLogId, selectedLogDetail, logDetailLoading,
            logsLoading, logTaskTypeFilter, logStatusFilter, auditFiltersCollapsed,
        ]
    );

    const handleOrgScopeChange = useCallback(async (orgScope: string, deptScope: string) => {
        setSelectedOrgScope(orgScope);
        setSelectedDepartmentScope(deptScope);
        setOrgSwitching(true);
        try {
            if (activePage === "workspace") {
                await Promise.allSettled([
                    loadCandidates({ silent: true, force: true, departmentScope: deptScope, orgScope }),
                    refreshCandidateStats(deptScope, orgScope),
                ]);
                return;
            }
            if (activePage === "candidates") {
                await loadCandidates({ silent: true, force: true, departmentScope: deptScope, orgScope });
                return;
            }
            if (activePage === "talent-pool") {
                await loadTalentPoolCandidates({ silent: true, departmentScope: deptScope, orgScope });
                return;
            }
            if (activePage === "audit") {
                await loadLogs({ silent: true, departmentScope: deptScope, orgScope });
                return;
            }
        } finally {
            setOrgSwitching(false);
        }
    }, [activePage, refreshCandidateStats]);

    if (bootstrapping) {
        return (
            <div
                className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_42%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_42%),linear-gradient(180deg,#020617_0%,#0f172a_100%)]">
                <div
                    className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-base text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin"/>
                    {recruitmentUiText.loadingWorkspace}
                </div>
            </div>
        );
    }

    return (
        <div
            className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.10),_transparent_35%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-slate-700 dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] dark:text-slate-300">
            <div
                className="border-b border-slate-200/80 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
                <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 lg:px-5 2xl:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <Button variant="outline" size="sm" onClick={handleSmartBack} className="rounded-xl px-3">
                            <ArrowLeft className="h-4 w-4"/>
                            {recruitmentUiText.back}
                        </Button>
                        <div className="flex min-w-0 items-baseline gap-3">
                            <h1 className="shrink-0 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                                {pageMeta[activePage].title}
                            </h1>
                            <span className="sr-only">{pageMeta[activePage].title}</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <OrgScopeBreadcrumbPicker
                            organizationCatalog={organizationCatalog}
                            visibleOrgCodes={visibleOrgCodes}
                            hasAllOrgScope={hasAllOrgScope}
                            selectedOrgScope={selectedOrgScope}
                            selectedDepartmentScope={selectedDepartmentScope}
                            onOrgScopeChange={handleOrgScopeChange}
                            allDepartmentsLabel={recruitmentUiText.allVisibleDepartments}
                            disabled={organizationCatalogLoading || orgSwitching}
                        />
                        {canManageCandidate && (
                            <Button variant="outline" onClick={openResumeUploadDialog} className="rounded-xl">
                                <Upload className="h-4 w-4"/>
                                {recruitmentUiText.uploadResume}
                            </Button>
                        )}
                        {canManagePosition && (
                            <Button onClick={openCreatePosition} className="rounded-xl">
                                <Plus className="h-4 w-4"/>
                                {recruitmentUiText.createPosition}
                            </Button>
                        )}
                        {!hideTopRightAssistantEntry ? (
                            <Button
                                className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                                onClick={() => openAssistantMode("drawer")}>
                                <Bot className="h-4 w-4"/>
                                {recruitmentUiText.openAssistantDrawer}
                            </Button>
                        ) : null}
                        {canManageRecruitment ? (
                            <Popover open={settingsPopoverOpen} onOpenChange={setSettingsPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="rounded-xl">
                                        <Settings2 className="h-4 w-4"/>
                                        {recruitmentUiText.manageSettings}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end"
                                                className="w-80 rounded-2xl border-slate-200 p-2 dark:border-slate-800">
                                    <div className="space-y-1">
                                        {(canViewSkill || canManageSkill) && (
                                            <SettingsEntry
                                                title={recruitmentUiText.settingsSkillsTitle}
                                                description={recruitmentUiText.settingsSkillsDescription}
                                                onClick={() => navigateToSettingsPage("settings-skills")}
                                            />
                                        )}
                                        {(canViewLLMConfig || canManageLLMConfig) && (
                                            <SettingsEntry
                                                title={recruitmentUiText.settingsModelsTitle}
                                                description={recruitmentUiText.settingsModelsDescription}
                                                onClick={() => navigateToSettingsPage("settings-models")}
                                            />
                                        )}
                                        {(canViewMail || canManageMailConfig) && (
                                            <SettingsEntry
                                                title={recruitmentUiText.settingsMailTitle}
                                                description={recruitmentUiText.settingsMailDescription}
                                                onClick={() => navigateToSettingsPage("settings-mail")}
                                            />
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    {/* candidates/positions/audit 保持挂载，用 hidden 控制 */}
                    {/* 原因：这三个页面有列表滚动位置、选中状态需要保持 */}
                    <div className={cn("h-full min-h-0 p-2", activePage !== "candidates" && "hidden")}>
                        {candidatesPageNode}
                    </div>
                    <div className={cn("h-full min-h-0 p-2", activePage !== "positions" && "hidden")}>
                        {positionsPageNode}
                    </div>
                    <div className={cn("h-full min-h-0 p-2", activePage !== "audit" && "hidden")}>
                        {auditPageNode}
                    </div>

                    {/* 以下改为条件渲染，切换时重新挂载，无需保持状态 */}
                    {activePage === "talent-pool" && (
                        <div className="h-full min-h-0 p-2">
                            {renderTalentPoolPage()}
                        </div>
                    )}
                    {activePage === "assistant" && (
                        <div className="h-full min-h-0 p-2">
                            {renderAssistantPage()}
                        </div>
                    )}
                    {activePage === "workspace" && (
                        <ScrollArea className="h-full">
                            <div className="p-4 lg:p-5 2xl:p-6">{renderWorkspacePage()}</div>
                        </ScrollArea>
                    )}
                    {activePage === "settings-skills" && (
                        <ScrollArea className="h-full">
                            <div className="p-4 lg:p-5 2xl:p-6">{renderSkillsPage()}</div>
                        </ScrollArea>
                    )}
                    {activePage === "settings-models" && (
                        <ScrollArea className="h-full">
                            <div className="p-4 lg:p-5 2xl:p-6">{renderModelsPage()}</div>
                        </ScrollArea>
                    )}
                    {activePage === "settings-mail" && (
                        <ScrollArea className="h-full">
                            <div className="p-4 lg:p-5 2xl:p-6">{renderMailSettingsPage()}</div>
                        </ScrollArea>
                    )}
                </div>

            {orgSwitching && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm transition-opacity duration-300 dark:bg-slate-950/50">
                    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-base text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                        <Loader2 className="h-4 w-4 animate-spin"/>
                        {isZh ? "正在切换组织..." : "Switching organization..."}
                    </div>
                </div>
            )}
            <Button
                className="fixed bottom-8 right-0 z-30 h-14 translate-x-[calc(100%-14px)] rounded-l-2xl rounded-r-none bg-slate-900 pl-4 pr-3 text-white shadow-[0_20px_40px_-18px_rgba(15,23,42,0.5)] transition-[transform,background-color] duration-200 hover:translate-x-0 hover:bg-slate-800 focus-visible:translate-x-0 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                onClick={() => openAssistantMode("drawer")}
            >
                <Bot className="h-4 w-4"/>
                {recruitmentUiText.assistantPanelTitle}
            </Button>

            <Dialog open={assistantOpen} onOpenChange={setAssistantOpen}>
                <DialogContent
                    className={cn(
                        "left-auto top-0 h-screen max-w-none translate-y-0 rounded-none p-0 sm:max-w-none",
                        assistantDisplayMode === "fullscreen"
                            ? "right-0 w-screen translate-x-0 border-0"
                            : "right-0 w-[min(1360px,100vw)] translate-x-0 border-l",
                    )}
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        queueAssistantInputFocus(true);
                    }}
                >
                    <DialogHeader className="sr-only">
                        <DialogTitle>{recruitmentUiText.assistantLabel}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.assistantPanelDescription}</DialogDescription>
                    </DialogHeader>
                    {renderAssistantConsole(assistantDisplayMode)}
                </DialogContent>
            </Dialog>

            <Dialog open={positionDialogOpen} onOpenChange={(open) => {
                setPositionDialogOpen(open);
                if (!open) {
                    setPositionFormErrors({});
                    setPositionFormSubmitError(null);
                    setPositionSubmitting(false);
                }
            }}>
                <DialogContent className="flex h-[min(88vh,900px)] max-h-[88vh] flex-col overflow-hidden sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{positionDialogMode === "create" ? recruitmentUiText.positionDialogNew : recruitmentUiText.positionDialogEdit}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.positionBasicsDialogHint}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="space-y-4 px-1 py-1">
                            <div className="grid gap-4 md:grid-cols-2">
                                {positionDialogMode === "create" && showOrganizationFields && organizationSelectOptions.length > 1 ? (
                                    <Field label={recruitmentUiText.targetOrganization} error={positionFormErrors.orgCode} className="md:col-span-2">
                                        <NativeSelect
                                            value={positionForm.orgCode}
                                            onChange={(event) => updatePositionFormField("orgCode", event.target.value)}
                                        >
                                            <option value="">{recruitmentUiText.chooseTargetOrganization}</option>
                                            {organizationSelectOptions.map((option) => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </NativeSelect>
                                        {showOrganizationFields ? (
                                            <p className="text-sm leading-5 text-slate-500 dark:text-slate-400">{recruitmentUiText.allVisibleCreateHint}</p>
                                        ) : null}
                                    </Field>
                                ) : null}
                                <Field label={recruitmentUiText.positionName} error={positionFormErrors.title}>
                                    <Input
                                        ref={positionTitleInputRef}
                                        value={positionForm.title}
                                        maxLength={200}
                                        onChange={(event) => updatePositionFormField("title", event.target.value.slice(0, 200))}
                                    />
                                </Field>
                                <Field label={recruitmentUiText.department}><Input value={positionForm.department}
                                                           maxLength={120}
                                                           onChange={(event) => updatePositionFormField("department", event.target.value.slice(0, 120))}/></Field>
                                <Field label={recruitmentUiText.location}><Input value={positionForm.location}
                                                           maxLength={120}
                                                           onChange={(event) => updatePositionFormField("location", event.target.value.slice(0, 120))}/></Field>
                                <Field label={recruitmentUiText.employmentType}><Input value={positionForm.employmentType}
                                                               maxLength={120}
                                                               onChange={(event) => updatePositionFormField("employmentType", event.target.value.slice(0, 120))}/></Field>
                                <Field label={recruitmentUiText.salaryRange}><Input value={positionForm.salaryRange}
                                                               maxLength={120}
                                                               onChange={(event) => updatePositionFormField("salaryRange", event.target.value.slice(0, 120))}/></Field>
                                <Field label={recruitmentUiText.headcount} error={positionFormErrors.headcount}>
                                    <Input
                                        ref={positionHeadcountInputRef}
                                        type="text"
                                        inputMode="numeric"
                                        value={positionForm.headcount}
                                        onChange={(event) => updatePositionFormField("headcount", event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                                        placeholder="1 - 999"
                                    />
                                </Field>
                                <Field label={recruitmentUiText.positionStatus}>
                                    <NativeSelect value={positionForm.status}
                                                  onChange={(event) => updatePositionFormField("status", event.target.value)}>
                                        {Object.entries(positionStatusLabels).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </NativeSelect>
                                </Field>
                                <Field label={recruitmentUiText.tags}><Input value={positionForm.tagsText}
                                                           maxLength={240}
                                                           onChange={(event) => updatePositionFormField("tagsText", event.target.value.slice(0, 240))} placeholder={recruitmentUiText.tagsPlaceholder}/></Field>
                                <Field label={recruitmentUiText.keyRequirements}><Textarea value={positionForm.keyRequirements}
                                                                  maxLength={2000}
                                                                  onChange={(event) => updatePositionFormField("keyRequirements", event.target.value.slice(0, 2000))} rows={4}/></Field>
                                <Field label={recruitmentUiText.bonusPoints}><Textarea value={positionForm.bonusPoints}
                                                                maxLength={2000}
                                                                onChange={(event) => updatePositionFormField("bonusPoints", event.target.value.slice(0, 2000))} rows={4}/></Field>
                                {/* 从人才库检索候选人 */}
                                {positionDialogMode === "create" && (
                                    <Field
                                        label={isZh ? "从人才库检索（可选）" : "Search from Talent Pool (Optional)"}
                                        className="md:col-span-2"
                                    >
                                        <TalentPoolSearch
                                            positions={positions}
                                            activeOrgCodes={activeBusinessOrgCodes}
                                            orgCode={selectedDepartmentScope !== ALL_COMPANY_DEPARTMENTS_VALUE ? selectedDepartmentScope : undefined}
                                            onAssignCandidates={(candidateIds) => {
                                                // 将选中的候选人关联到新创建的岗位
                                                // 这里我们先创建岗位，然后在创建成功后批量分配
                                                setPositionForm(prev => ({
                                                    ...prev,
                                                    pendingTalentPoolCandidates: candidateIds
                                                }));
                                            }}
                                        />
                                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                            {isZh ? "从人才库中选择候选人直接关联到新岗位" : "Select candidates from talent pool to link to this position"}
                                        </p>
                                    </Field>
                                )}
                                <Field label={recruitmentUiText.screeningConfig} className="md:col-span-2">
                                    <div
                                        className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                        <label
                                            className={cn(
                                                "flex items-center gap-2 text-base text-slate-700 dark:text-slate-200",
                                                positionForm.screeningSkillIds.length === 0 && "opacity-50 cursor-not-allowed"
                                            )}>
                                            <input
                                                type="checkbox"
                                                checked={positionForm.autoScreenOnUpload}
                                                disabled={positionForm.screeningSkillIds.length === 0}
                                                onChange={(event) => {
                                                    if (positionForm.screeningSkillIds.length === 0) {
                                                        return;
                                                    }
                                                    updatePositionFormField("autoScreenOnUpload", event.target.checked);
                                                }}
                                            />
                                            {recruitmentUiText.uploadResumeAutoScreenHint}
                                        </label>
                                        {positionForm.screeningSkillIds.length === 0 && (
                                            <p className="text-sm text-amber-600 dark:text-amber-400">
                                                {recruitmentUiText.uploadResumeAutoScreenHintNoSkill}
                                            </p>
                                        )}
                                        <label
                                            className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={positionForm.autoAdvanceOnScreening}
                                                onChange={(event) => updatePositionFormField("autoAdvanceOnScreening", event.target.checked)}
                                            />
                                            {recruitmentUiText.autoAdvanceOnScreeningLabel}
                                        </label>
                                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-base font-medium text-slate-900 dark:text-slate-100">{recruitmentUiText.autoMailPushTitle}</p>
                                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                                        {recruitmentUiText.autoMailPushDescription}
                                                    </p>
                                                </div>
                                                <label className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={positionForm.autoMailEnabled}
                                                        onChange={(event) => updatePositionFormField("autoMailEnabled", event.target.checked)}
                                                    />
                                                    {recruitmentUiText.autoMailEnableToggle}
                                                </label>
                                            </div>
                                            <div className={cn("mt-4 grid gap-4 lg:grid-cols-2", !positionForm.autoMailEnabled && "pointer-events-none opacity-40")}>
                                                <label className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={positionForm.autoMailUsePositionRecipients}
                                                        onChange={(event) => updatePositionFormField("autoMailUsePositionRecipients", event.target.checked)}
                                                    />
                                                    {recruitmentUiText.positionSpecificRecipient}
                                                </label>
                                                <label className="flex items-start gap-2 text-base text-slate-700 dark:text-slate-200">
                                                    <input
                                                        type="checkbox"
                                                        className="mt-0.5 shrink-0"
                                                        checked={positionForm.autoMailUseGlobalRecipients}
                                                        onChange={(event) => updatePositionFormField("autoMailUseGlobalRecipients", event.target.checked)}
                                                    />
                                                    <span>
                                                        {recruitmentUiText.globalDefaultRecipient}
                                                        <span className="ml-1 text-sm text-slate-400 dark:text-slate-500">{recruitmentUiText.globalDefaultRecipientHint}</span>
                                                    </span>
                                                </label>
                                            </div>
                                            <div className="mt-4 space-y-4">
                                                <div className="space-y-2">
                                                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{recruitmentUiText.positionSpecificRecipients}</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {mailRecipients.filter((recipient) => recipient.is_enabled).length ? mailRecipients.filter((recipient) => recipient.is_enabled).map((recipient) => (
                                                            <button
                                                                key={`auto-mail-to-${recipient.id}`}
                                                                type="button"
                                                                className={cn(
                                                                    "rounded-full border px-3 py-2 text-sm transition",
                                                                    positionForm.autoMailPositionRecipientIds.includes(recipient.id)
                                                                        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                        : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                )}
                                                                onClick={() => updatePositionFormField("autoMailPositionRecipientIds", toggleIdInList(positionForm.autoMailPositionRecipientIds, recipient.id))}
                                                            >
                                                                {recipient.name}
                                                            </button>
                                                        )) : <p className="text-base text-slate-500 dark:text-slate-400">{recruitmentUiText.noRecipientsInMailCenter}</p>}
                                                    </div>
                                                </div>
                                                <div className="grid gap-4 xl:grid-cols-2">
                                                    <div className="space-y-2">
                                                        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{recruitmentUiText.ccRecipients}</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {mailRecipients.filter((recipient) => recipient.is_enabled).length ? mailRecipients.filter((recipient) => recipient.is_enabled).map((recipient) => (
                                                                <button
                                                                    key={`auto-mail-cc-${recipient.id}`}
                                                                    type="button"
                                                                    className={cn(
                                                                        "rounded-full border px-3 py-2 text-sm transition",
                                                                        positionForm.autoMailCcRecipientIds.includes(recipient.id)
                                                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                    )}
                                                                    onClick={() => updatePositionFormField("autoMailCcRecipientIds", toggleIdInList(positionForm.autoMailCcRecipientIds, recipient.id))}
                                                                >
                                                                    {recipient.name}
                                                                </button>
                                                            )) : <p className="text-base text-slate-500 dark:text-slate-400">{recruitmentUiText.noCCRecipients}</p>}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{recruitmentUiText.bccRecipients}</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {mailRecipients.filter((recipient) => recipient.is_enabled).length ? mailRecipients.filter((recipient) => recipient.is_enabled).map((recipient) => (
                                                                <button
                                                                    key={`auto-mail-bcc-${recipient.id}`}
                                                                    type="button"
                                                                    className={cn(
                                                                        "rounded-full border px-3 py-2 text-sm transition",
                                                                        positionForm.autoMailBccRecipientIds.includes(recipient.id)
                                                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                    )}
                                                                    onClick={() => updatePositionFormField("autoMailBccRecipientIds", toggleIdInList(positionForm.autoMailBccRecipientIds, recipient.id))}
                                                                >
                                                                    {recipient.name}
                                                                </button>
                                                            )) : <p className="text-base text-slate-500 dark:text-slate-400">{recruitmentUiText.noBCCRecipients}</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{recruitmentUiText.allowedAutoMailStatuses}</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {(metadata?.candidate_statuses || []).map((option) => (
                                                            <button
                                                                key={`auto-mail-status-${option.value}`}
                                                                type="button"
                                                                className={cn(
                                                                    "rounded-full border px-3 py-2 text-sm transition",
                                                                    positionForm.autoMailAllowedCandidateStatuses.includes(option.value)
                                                                        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                        : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                )}
                                                                onClick={() => updatePositionFormField(
                                                                    "autoMailAllowedCandidateStatuses",
                                                                    positionForm.autoMailAllowedCandidateStatuses.includes(option.value)
                                                                        ? positionForm.autoMailAllowedCandidateStatuses.filter((item) => item !== option.value)
                                                                        : [...positionForm.autoMailAllowedCandidateStatuses, option.value],
                                                                )}
                                                            >
                                                                {localizeCandidateStatusValue(option.value, option.label)}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="grid gap-4 lg:grid-cols-2">
                                                    <Field label={recruitmentUiText.reservedTemplateId}>
                                                        <Input
                                                            value={positionForm.autoMailTemplateId}
                                                            placeholder={recruitmentUiText.reservedTemplatePlaceholder}
                                                            onChange={(event) => updatePositionFormField("autoMailTemplateId", event.target.value)}
                                                        />
                                                    </Field>
                                                    <Field label={recruitmentUiText.dedupMode}>
                                                        <NativeSelect
                                                            value={positionForm.autoMailDedupMode}
                                                            onChange={(event) => updatePositionFormField("autoMailDedupMode", event.target.value)}
                                                        >
                                                            <option value="once_per_candidate_per_status">{recruitmentUiText.dedupOncePerCandidatePerStatus}</option>
                                                            <option value="once_per_candidate">{recruitmentUiText.dedupOncePerCandidate}</option>
                                                            <option value="allow_repeat">{recruitmentUiText.allowRepeatSending}</option>
                                                        </NativeSelect>
                                                    </Field>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                                                <div className="space-y-1">
                                                    <p className="text-base font-medium text-slate-900 dark:text-slate-100">{recruitmentUiText.skillsAutomation}</p>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                                        {recruitmentUiText.autoMailSkillBindingHint}
                                                    </p>
                                                </div>
                                            </div>
                                            {([
                                                ["jdSkillIds", positionSkillFieldConfig.jdSkillIds],
                                                ["screeningSkillIds", positionSkillFieldConfig.screeningSkillIds],
                                                ["interviewSkillIds", positionSkillFieldConfig.interviewSkillIds],
                                            ] as const).map(([formKey, config]) => {
                                                const skillChoices = positionSkillChoicesByField[formKey];
                                                const isExpanded = positionSkillSectionExpanded[formKey];
                                                const hasSelected = (positionForm[formKey] as number[]).length > 0;
                                                return (
                                                    <div key={formKey} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/50">
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div className="space-y-1">
                                                                <p className="text-base font-medium text-slate-900 dark:text-slate-100">{config.label}</p>
                                                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                                                    {hasSelected
                                                                        ? `${config.selectedPrefix}${selectedPositionSkillText[formKey]}`
                                                                        : (isZh
                                                                            ? "当前未绑定，系统将自动使用该类型的内置通用基座。"
                                                                            : "No plan selected. The system will fall back to the built-in base for this task.")}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    title={isZh ? `新建${config.label}` : `Create ${config.label}`}
                                                                    onClick={() => openSkillEditorForPosition(config.taskKind, formKey)}
                                                                >
                                                                    <Plus className="h-4 w-4"/>
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="gap-1"
                                                                    onClick={() => setPositionSkillSectionExpanded((current) => ({
                                                                        ...current,
                                                                        [formKey]: !current[formKey],
                                                                    }))}
                                                                >
                                                                    {isExpanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                                                                    {isExpanded ? (isZh ? "收起" : "Collapse") : (isZh ? "展开选择" : "Choose")}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        {isExpanded ? (
                                                            <div className="mt-4 space-y-3">
                                                                <div className="max-w-md">
                                                                    <Input
                                                                        value={positionSkillSearch}
                                                                        placeholder={config.placeholder}
                                                                        onChange={(event) => setPositionSkillSearch(event.target.value)}
                                                                    />
                                                                </div>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {skillChoices.length ? skillChoices.map((skill: RecruitmentSkill) => (
                                                                        <button
                                                                            key={`${formKey}-${skill.id}`}
                                                                            type="button"
                                                                            className={cn(
                                                                                "rounded-full border px-3 py-2 text-sm transition",
                                                                                (positionForm[formKey] as number[]).includes(skill.id)
                                                                                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                                    : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                            )}
                                                                            onClick={() => updatePositionSkillBinding(formKey, toggleSingleSkillId(positionForm[formKey] as number[], skill.id), {expandSection: true})}
                                                                        >
                                                                            {skill.name}
                                                                        </button>
                                                                    )) : (
                                                                        <p className="text-sm text-slate-400">{recruitmentUiText.noSkillsAvailable}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </Field>
                            </div>
                            <Field label={recruitmentUiText.positionSummary}>
                                <Textarea value={positionForm.summary}
                                          maxLength={4000}
                                          onChange={(event) => updatePositionFormField("summary", event.target.value.slice(0, 4000))} rows={5}/>
                            </Field>
                        </div>
                    </ScrollArea>
                    <DialogFooter className="shrink-0 items-center justify-between gap-3 sm:justify-between">
                        <div className="min-h-5 flex-1 text-base text-red-600 dark:text-red-400">
                            {positionFormSubmitError ?? ""}
                        </div>
                        <Button variant="outline" onClick={() => setPositionDialogOpen(false)}>{recruitmentUiText.cancelButton}</Button>
                        <Button disabled={positionSubmitting} onClick={() => void submitPosition()}>
                            {positionSubmitting ? recruitmentUiText.savingPosition : recruitmentUiText.savePosition}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={resumeUploadOpen} onOpenChange={(open) => {
                setResumeUploadOpen(open);
                if (!open) {
                    setResumeUploadError(null);
                    setShowAdvancedOptions(false);
                    setIsDraggingFile(false);
                }
            }}>
                {resumeUploadDialogBody}
            </Dialog>

            <Dialog open={positionDeleteConfirmOpen} onOpenChange={setPositionDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{recruitmentUiText.confirmDeletePosition}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.positionDeleteHint}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPositionDeleteConfirmOpen(false)}>{recruitmentUiText.cancelButton}</Button>
                        <Button variant="destructive" onClick={() => void deletePosition()} disabled={positionDeleting}>
                            {positionDeleting ? recruitmentUiText.deletingPosition : recruitmentUiText.confirmDeletePositionAction}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(candidateDeleteTarget)} onOpenChange={(open) => {
                if (!open && !candidateDeleting) {
                    setCandidateDeleteError(null);
                    setCandidateDeleteTarget(null);
                }
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{recruitmentUiText.confirmDeleteCandidate}</DialogTitle>
                        <DialogDescription>
                            {recruitmentUiText.candidateDeleteHint}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-base text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{candidateDeleteTarget?.name || recruitmentUiText.currentCandidate}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {recruitmentUiText.candidateDeleteWarning}
                        </p>
                    </div>
                    <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
                        <span className="min-h-[20px] flex-1 text-base text-rose-600 dark:text-rose-300">
                            {candidateDeleteError ?? ""}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setCandidateDeleteError(null);
                                setCandidateDeleteTarget(null);
                            }}
                            disabled={candidateDeleting}
                        >
                            {recruitmentUiText.cancelButton}
                        </Button>
                        <Button variant="destructive" onClick={() => void deleteCandidate()} disabled={candidateDeleting}>
                            {candidateDeleting ? recruitmentUiText.deletingPosition : recruitmentUiText.confirmDeletePositionAction}
                        </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(batchDeleteTargetIds)} onOpenChange={(open) => {
                if (!open && !batchDeleting) {
                    setBatchDeleteError(null);
                    setBatchDeleteTargetIds(null);
                }
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{recruitmentUiText.confirmDeleteCandidates}</DialogTitle>
                        <DialogDescription>
                            {recruitmentUiText.batchDeleteDescription(batchDeleteTargetIds?.length ?? 0)}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
                        <span className="min-h-[20px] flex-1 text-base text-rose-600 dark:text-rose-300">
                            {batchDeleteError ?? ""}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setBatchDeleteError(null);
                                setBatchDeleteTargetIds(null);
                            }}
                            disabled={batchDeleting}
                        >
                            {recruitmentUiText.cancelButton}
                        </Button>
                        <Button variant="destructive" onClick={() => void batchDeleteCandidates()} disabled={batchDeleting}>
                            {batchDeleting ? recruitmentUiText.deletingPosition : recruitmentUiText.confirmDeletePositionAction}
                        </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(resumeDeleteTarget)} onOpenChange={(open) => {
                if (!open && !resumeDeleting) {
                    setResumeDeleteTarget(null);
                }
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{recruitmentUiText.confirmDeleteResume}</DialogTitle>
                        <DialogDescription>
                            {recruitmentUiText.resumeDeleteDescription}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-base text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{resumeDeleteTarget?.original_name || recruitmentUiText.currentResume}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{recruitmentUiText.resumeDeleteWarning}</p>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setResumeDeleteTarget(null)}
                            disabled={resumeDeleting}
                        >
                            {recruitmentUiText.cancelButton}
                        </Button>
                        <Button variant="destructive" onClick={() => void deleteResumeFile()} disabled={resumeDeleting}>
                            {resumeDeleting ? recruitmentUiText.deletingPosition : recruitmentUiText.confirmDeletePositionAction}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(llmDeleteTarget)} onOpenChange={(open) => {
                if (!open) setLlmDeleteTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{recruitmentUiText.llmDeleteTitle}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.llmDeleteDescription}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLlmDeleteTarget(null)}
                                disabled={deleteActionKey === `llm-${llmDeleteTarget?.id}`}>{recruitmentUiText.cancel}</Button>
                        <Button variant="destructive"
                                onClick={() => llmDeleteTarget && void deleteLLMConfig(llmDeleteTarget.id)}
                                disabled={deleteActionKey === `llm-${llmDeleteTarget?.id}`}>
                            {deleteActionKey === `llm-${llmDeleteTarget?.id}` ? recruitmentUiText.deleting : recruitmentUiText.confirmDelete}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(skillDeleteTarget)} onOpenChange={(open) => {
                if (!open) setSkillDeleteTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{recruitmentUiText.skillDeleteTitle}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.skillDeleteDescription}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSkillDeleteTarget(null)}
                                disabled={deleteActionKey === `skill-${skillDeleteTarget?.id}`}>{recruitmentUiText.cancel}</Button>
                        <Button variant="destructive"
                                onClick={() => skillDeleteTarget && void deleteSkill(skillDeleteTarget.id)}
                                disabled={deleteActionKey === `skill-${skillDeleteTarget?.id}`}>
                            {deleteActionKey === `skill-${skillDeleteTarget?.id}` ? recruitmentUiText.deleting : recruitmentUiText.confirmDelete}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(mailSenderDeleteTarget)} onOpenChange={(open) => {
                if (!open) setMailSenderDeleteTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{recruitmentUiText.confirmDeleteMailSender}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.mailSenderDeleteDescription}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMailSenderDeleteTarget(null)}
                                disabled={deleteActionKey === `mail-sender-${mailSenderDeleteTarget?.id}`}>{recruitmentUiText.cancelButton}</Button>
                        <Button variant="destructive"
                                onClick={() => mailSenderDeleteTarget && void deleteMailSender(mailSenderDeleteTarget.id)}
                                disabled={deleteActionKey === `mail-sender-${mailSenderDeleteTarget?.id}`}>
                            {deleteActionKey === `mail-sender-${mailSenderDeleteTarget?.id}` ? recruitmentUiText.deletingPosition : recruitmentUiText.confirmDeletePositionAction}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(mailRecipientDeleteTarget)} onOpenChange={(open) => {
                if (!open) setMailRecipientDeleteTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{recruitmentUiText.confirmDeleteMailRecipient}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.mailRecipientDeleteDescription}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMailRecipientDeleteTarget(null)}
                                disabled={deleteActionKey === `mail-recipient-${mailRecipientDeleteTarget?.id}`}>{recruitmentUiText.cancelButton}</Button>
                        <Button variant="destructive"
                                onClick={() => mailRecipientDeleteTarget && void deleteMailRecipient(mailRecipientDeleteTarget.id)}
                                disabled={deleteActionKey === `mail-recipient-${mailRecipientDeleteTarget?.id}`}>
                            {deleteActionKey === `mail-recipient-${mailRecipientDeleteTarget?.id}` ? recruitmentUiText.deletingPosition : recruitmentUiText.confirmDeletePositionAction}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{recruitmentUiText.createPublishTask}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.publishTaskDesc}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4">
                        <Field label={recruitmentUiText.targetPlatform}>
                            <NativeSelect value={publishPlatform}
                                          onChange={(event) => setPublishPlatform(event.target.value)}>
                                <option value="boss">{recruitmentUiText.bossDirect}</option>
                                <option value="zhilian">{recruitmentUiText.zhilian}</option>
                            </NativeSelect>
                        </Field>
                        <Field label={recruitmentUiText.executionMode}>
                            <NativeSelect value={publishMode} onChange={(event) => setPublishMode(event.target.value)}>
                                <option value="mock">Mock</option>
                                <option value="api">API</option>
                                <option value="rpa">RPA / Playwright</option>
                            </NativeSelect>
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>{recruitmentUiText.cancel}</Button>
                        <Button onClick={() => void submitPublishTask()} disabled={publishSubmitting}>{publishSubmitting ? recruitmentUiText.publishing : recruitmentUiText.createTask}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={skillDialogOpen} onOpenChange={(open) => {
                setSkillDialogOpen(open);
                if (!open) {
                    setSkillFormErrors({});
                    setSkillFormSubmitError(null);
                    setSkillSubmitting(false);
                    setSkillDialogMode("structured");
                    setSkillBoundPositionId("");
                    setSkillExtraConditions("");
                    skillAbortControllerRef.current?.abort();
                    skillAbortControllerRef.current = null;
                    skillActiveTaskIdRef.current = null;
                }
            }}>
                <DialogContent className="flex h-[min(88vh,840px)] max-h-[88vh] flex-col overflow-hidden sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{skillEditingId ? recruitmentUiText.skillEditTitle : recruitmentUiText.skillCreateTitle}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.skillDialogDescription}</DialogDescription>
                    </DialogHeader>
                    {skillDialogMode === "structured" ? (
                        <div className="flex min-h-0 flex-1 flex-col gap-4">
                            <div className="shrink-0 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                                <Field label={isZh ? "关联岗位" : "Bound Position"}>
                                        <NativeSelect
                                            value={skillBoundPositionId}
                                            onChange={(event) => {
                                                setSkillBoundPositionId(event.target.value);
                                                setSkillEditorPositionId(event.target.value ? Number(event.target.value) : null);
                                            }}
                                        >
                                            <option value="">{isZh ? "通用方案（未绑定岗位）" : "Generic Plan (Unbound)"}</option>
                                            {bindablePositionsForSkillDialog.map((position) => (
                                                <option key={`structured-skill-bound-position-${position.id}`} value={position.id}>
                                                    {position.title}
                                                </option>
                                            ))}
                                        </NativeSelect>
                                </Field>
                            </div>
                            <StructuredSkillEditor
                                initialData={skillEditorData}
                                editingSkillId={skillEditingId}
                                onSubmit={submitStructuredSkill}
                                onCancel={() => setSkillDialogOpen(false)}
                                submitting={skillSubmitting}
                                submitError={skillFormSubmitError}
                                onGenerateAI={generateSkillWithAI}
                                onStopGeneration={stopSkillGeneration}
                                aiGenerating={skillGenerating}
                                defaultTab={skillEditorDefaultTab}
                                positionId={skillEditorPositionId}
                                positionJdContent={skillEditorPositionId ? (positionDetail?.current_jd_version?.jd_markdown || null) : null}
                            />
                        </div>
                    ) : (
                        <>
                            <ScrollArea className="min-h-0 flex-1">
                                <div className="grid gap-4 px-1 py-1">
                                    <Field label={isZh ? "方案标题" : "Plan Title"} required error={skillFormErrors.name}>
                                        <Input
                                            ref={skillNameInputRef}
                                            value={skillForm.name}
                                            maxLength={120}
                                            aria-invalid={Boolean(skillFormErrors.name)}
                                            className={cn(skillFormErrors.name ? "border-rose-500 focus-visible:ring-rose-500/20" : "")}
                                            onChange={(event) => setSkillForm((current) => ({...current, name: event.target.value.slice(0, 120)}))}
                                        />
                                    </Field>
                                    <Field label={isZh ? "关联岗位" : "Bound Position"}>
                                        <NativeSelect
                                            value={skillBoundPositionId}
                                            onChange={(event) => {
                                                setSkillBoundPositionId(event.target.value);
                                                setSkillEditorPositionId(event.target.value ? Number(event.target.value) : null);
                                            }}
                                        >
                                            <option value="">{isZh ? "通用方案（未绑定岗位）" : "Generic Plan (Unbound)"}</option>
                                            {bindablePositionsForSkillDialog.map((position) => (
                                                <option key={`skill-bound-position-${position.id}`} value={position.id}>
                                                    {position.title}
                                                </option>
                                            ))}
                                        </NativeSelect>
                                    </Field>
                                    <div className="space-y-2">
                                        <span className="text-base font-medium text-slate-700 dark:text-slate-300">{isZh ? "适用场景" : "Applies To"}</span>
                                        <div className="flex flex-wrap gap-2">
                                            {([["jd", recruitmentUiText.jdSkillLabel], ["interview", recruitmentUiText.interviewSkillLabel]] as const).map(([taskType, label]) => (
                                                <button
                                                    key={`basic-skill-task-${taskType}`}
                                                    type="button"
                                                    className={cn(
                                                        "rounded-full border px-3 py-1.5 text-sm transition",
                                                        skillForm.taskTypes.includes(taskType)
                                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                    )}
                                                    onClick={() => setSkillForm((current) => ({...current, taskTypes: [taskType]}))}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <Field label={isZh ? "方案内容" : "Plan Content"} required error={skillFormErrors.content}>
                                        <Textarea
                                            ref={skillContentInputRef}
                                            value={skillForm.content}
                                            rows={10}
                                            aria-invalid={Boolean(skillFormErrors.content)}
                                            className={cn(skillFormErrors.content ? "border-rose-500 focus-visible:ring-rose-500/20" : "")}
                                            onChange={(event) => setSkillForm((current) => ({...current, content: event.target.value}))}
                                        />
                                    </Field>
                                    <Field label={isZh ? "附加条件" : "Additional Conditions"}>
                                        <Textarea
                                            value={skillExtraConditions}
                                            rows={4}
                                            placeholder={isZh ? "例如：输出语气、补充限制、必须强调的判断标准" : "Optional constraints, tone, or extra criteria"}
                                            onChange={(event) => setSkillExtraConditions(event.target.value)}
                                        />
                                    </Field>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <Field label={isZh ? "标签" : "Tags"}>
                                            <Input
                                                value={skillForm.tagsText}
                                                onChange={(event) => setSkillForm((current) => ({...current, tagsText: event.target.value}))}
                                            />
                                        </Field>
                                        <Field label={recruitmentUiText.sortLabel} error={skillFormErrors.sortOrder}>
                                            <Input
                                                type="number"
                                                value={skillForm.sortOrder}
                                                aria-invalid={Boolean(skillFormErrors.sortOrder)}
                                                className={cn(skillFormErrors.sortOrder ? "border-rose-500 focus-visible:ring-rose-500/20" : "")}
                                                onChange={(event) => setSkillForm((current) => ({...current, sortOrder: event.target.value}))}
                                            />
                                        </Field>
                                    </div>
                                    <label className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={skillForm.isEnabled}
                                            onChange={(event) => setSkillForm((current) => ({...current, isEnabled: event.target.checked}))}
                                        />
                                        <span>{isZh ? "启用" : "Enabled"}</span>
                                    </label>
                                </div>
                            </ScrollArea>
                            {skillFormSubmitError ? (
                                <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-base text-red-600 dark:bg-red-950/30 dark:text-red-400">
                                    {skillFormSubmitError}
                                </div>
                            ) : null}
                            <DialogFooter className="shrink-0">
                                <Button variant="outline" onClick={() => setSkillDialogOpen(false)} disabled={skillSubmitting}>
                                    {recruitmentUiText.cancel}
                                </Button>
                                <Button onClick={() => void submitSkill()} disabled={skillSubmitting}>
                                    {skillSubmitting ? recruitmentUiText.saving : recruitmentUiText.saveSkill}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={llmDialogOpen} onOpenChange={(open) => {
                setLlmDialogOpen(open);
                if (!open) {
                    setLlmFormErrors({});
                    setLlmFormSubmitError(null);
                    setLlmSubmitting(false);
                }
            }}>
                <DialogContent className="flex h-[min(85vh,840px)] max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{llmEditingId ? recruitmentUiText.modelConfigEditTitle : recruitmentUiText.modelConfigCreateTitle}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.modelDialogDescription}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="grid gap-4 px-1 py-1 md:grid-cols-2">
                            <Field label={recruitmentUiText.configKeyLabel} required error={llmFormErrors.configKey}>
                                <Input
                                    ref={llmConfigKeyInputRef}
                                    value={llmForm.configKey}
                                    maxLength={120}
                                    aria-invalid={Boolean(llmFormErrors.configKey)}
                                    className={cn(llmFormErrors.configKey ? "border-rose-500 focus-visible:ring-rose-500/20" : "")}
                                    onChange={(event) => updateLLMFormField("configKey", event.target.value.slice(0, 120))}
                                />
                            </Field>
                            <Field label={recruitmentUiText.taskTypeLabel} required error={llmFormErrors.taskType}>
                                <Input
                                    ref={llmTaskTypeInputRef}
                                    value={llmForm.taskType}
                                    maxLength={80}
                                    aria-invalid={Boolean(llmFormErrors.taskType)}
                                    className={cn(llmFormErrors.taskType ? "border-rose-500 focus-visible:ring-rose-500/20" : "")}
                                    onChange={(event) => updateLLMFormField("taskType", event.target.value.slice(0, 80))}
                                />
                            </Field>
                            <Field label={recruitmentUiText.providerLabel} required error={llmFormErrors.provider}>
                                <NativeSelect
                                    value={llmForm.provider}
                                    aria-invalid={Boolean(llmFormErrors.provider)}
                                    className={cn(llmFormErrors.provider ? "border-rose-500 focus-visible:ring-rose-500/20" : "")}
                                    onChange={(event) => updateLLMFormField("provider", event.target.value)}
                                >
                                    {Object.entries(providerLabels).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </NativeSelect>
                            </Field>
                            <Field label={recruitmentUiText.modelNameLabel} required error={llmFormErrors.modelName}>
                                <Input
                                    ref={llmModelNameInputRef}
                                    value={llmForm.modelName}
                                    maxLength={120}
                                    aria-invalid={Boolean(llmFormErrors.modelName)}
                                    className={cn(llmFormErrors.modelName ? "border-rose-500 focus-visible:ring-rose-500/20" : "")}
                                    onChange={(event) => updateLLMFormField("modelName", event.target.value.slice(0, 120))}
                                />
                                <p className="mt-2 text-sm leading-5 text-slate-500 dark:text-slate-400">
                                    {recruitmentUiText.modelNameHint}
                                </p>
                            </Field>
                            <Field label={recruitmentUiText.baseUrlLabel}>
                                <Input value={llmForm.baseUrl}
                                       onChange={(event) => updateLLMFormField("baseUrl", event.target.value)}/>
                            </Field>
                            <Field label={recruitmentUiText.apiKeyEnvLabel}>
                                <Input
                                    value={llmForm.apiKeyEnv}
                                    onChange={(event) => updateLLMFormField("apiKeyEnv", event.target.value)}
                                    placeholder={recruitmentUiText.apiKeyEnvPlaceholder}
                                />
                            </Field>
                            <Field label={recruitmentUiText.apiKeyValueLabel}>
                                <Input
                                    value={llmForm.apiKeyValue}
                                    onChange={(event) => updateLLMFormField("apiKeyValue", event.target.value)}
                                    placeholder={recruitmentUiText.apiKeyValuePlaceholder}
                                />
                            </Field>
                            <Field label={recruitmentUiText.maxConcurrentLabel} error={llmFormErrors.maxConcurrent}>
                                <Input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={llmForm.maxConcurrent}
                                    aria-invalid={Boolean(llmFormErrors.maxConcurrent)}
                                    className={cn(llmFormErrors.maxConcurrent ? "border-rose-500 focus-visible:ring-rose-500/20" : "")}
                                    onChange={(event) => updateLLMFormField("maxConcurrent", event.target.value)}
                                />
                                <p className="mt-2 text-sm leading-5 text-slate-500 dark:text-slate-400">
                                    {recruitmentUiText.maxConcurrentHint}
                                </p>
                            </Field>
                            <Field label={recruitmentUiText.maxQpsLabel} error={llmFormErrors.maxQps}>
                                <Input
                                    type="number"
                                    min={0}
                                    max={1000}
                                    value={llmForm.maxQps}
                                    aria-invalid={Boolean(llmFormErrors.maxQps)}
                                    className={cn(llmFormErrors.maxQps ? "border-rose-500 focus-visible:ring-rose-500/20" : "")}
                                    onChange={(event) => updateLLMFormField("maxQps", event.target.value)}
                                />
                                <p className="mt-2 text-sm leading-5 text-slate-500 dark:text-slate-400">
                                    {recruitmentUiText.maxQpsHint}
                                </p>
                            </Field>
                            <Field label={recruitmentUiText.priorityLabel} error={llmFormErrors.priority}>
                                <Input
                                    type="number"
                                    value={llmForm.priority}
                                    aria-invalid={Boolean(llmFormErrors.priority)}
                                    className={cn(llmFormErrors.priority ? "border-rose-500 focus-visible:ring-rose-500/20" : "")}
                                    onChange={(event) => updateLLMFormField("priority", event.target.value)}
                                />
                            </Field>
                        </div>
                        <Field label={recruitmentUiText.extraConfigLabel} error={llmFormErrors.extraConfigText} className="mt-4">
                            <Textarea
                                ref={llmExtraConfigInputRef}
                                value={llmForm.extraConfigText}
                                aria-invalid={Boolean(llmFormErrors.extraConfigText)}
                                className={cn(llmFormErrors.extraConfigText ? "border-rose-500 focus-visible:ring-rose-500/20" : "")}
                                onChange={(event) => updateLLMFormField("extraConfigText", event.target.value)}
                                rows={10}
                            />
                        </Field>
                        <label className="mt-4 flex items-center gap-2 text-base text-slate-600 dark:text-slate-300">
                            <input type="checkbox" checked={llmForm.isActive}
                                   onChange={(event) => updateLLMFormField("isActive", event.target.checked)}/>
                            {recruitmentUiText.saveAndEnableLabel}
                        </label>
                    </ScrollArea>
                    <DialogFooter className="shrink-0 items-center justify-between gap-3 sm:justify-between">
                        <div className="min-h-5 flex-1 text-base text-red-600 dark:text-red-400">
                            {llmFormSubmitError ?? ""}
                        </div>
                        <Button variant="outline" onClick={() => setLlmDialogOpen(false)}
                                disabled={llmSubmitting}>{recruitmentUiText.cancel}</Button>
                        <Button onClick={() => void submitLLMConfig()}
                                disabled={llmSubmitting}>{llmSubmitting ? recruitmentUiText.saving : recruitmentUiText.saveModelConfig}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={mailSenderDialogOpen} onOpenChange={setMailSenderDialogOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{mailSenderEditingId ? recruitmentUiText.editMailSender : recruitmentUiText.newMailSender}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.mailSenderDescription}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[65vh]">
                        <div className="grid gap-4 px-1 py-1 md:grid-cols-2">
                            <Field label={recruitmentUiText.mailSenderName}><Input value={mailSenderForm.name}
                                                       onChange={(event) => setMailSenderForm((current) => ({
                                                           ...current,
                                                           name: event.target.value
                                                       }))}/></Field>
                            <Field label={recruitmentUiText.mailSenderFromName}><Input value={mailSenderForm.fromName}
                                                             onChange={(event) => setMailSenderForm((current) => ({
                                                                 ...current,
                                                                 fromName: event.target.value
                                                             }))} placeholder={recruitmentUiText.mailSenderFromNamePlaceholder}/></Field>
                            <Field label={recruitmentUiText.mailSenderEmail}><Input value={mailSenderForm.fromEmail}
                                                           onChange={(event) => setMailSenderForm((current) => ({
                                                               ...current,
                                                               fromEmail: event.target.value
                                                           }))} placeholder={recruitmentUiText.mailSenderEmailPlaceholder}/></Field>
                            <Field label={recruitmentUiText.mailSenderUsername}><Input value={mailSenderForm.username}
                                                           onChange={(event) => setMailSenderForm((current) => ({
                                                               ...current,
                                                               username: event.target.value
                                                           }))}/></Field>
                            <Field label={recruitmentUiText.smtpHost}><Input value={mailSenderForm.smtpHost}
                                                            onChange={(event) => setMailSenderForm((current) => ({
                                                                ...current,
                                                                smtpHost: event.target.value
                                                            }))} placeholder={recruitmentUiText.smtpHostPlaceholder}/></Field>
                            <Field label={recruitmentUiText.smtpPort}><Input type="number" value={mailSenderForm.smtpPort}
                                                            onChange={(event) => setMailSenderForm((current) => ({
                                                                ...current,
                                                                smtpPort: event.target.value
                                                            }))}/></Field>
                            <div className="md:col-span-2 flex flex-wrap gap-2 px-1 py-1">
                                {mailSenderPresets.map((preset) => (
                                    <Button key={preset.key} type="button" size="sm" variant="outline"
                                            onClick={() => applyMailSenderPreset(preset.key)}>
                                        {preset.label}
                                    </Button>
                                ))}
                                <p className="self-center text-sm text-slate-500 dark:text-slate-400">{recruitmentUiText.smtpHostAutoHint}</p>
                            </div>
                            <Field label={mailSenderEditingId ? recruitmentUiText.mailSenderPasswordEdit : recruitmentUiText.mailSenderPassword}>
                                <Input type="password" value={mailSenderForm.password}
                                       onChange={(event) => setMailSenderForm((current) => ({
                                           ...current,
                                           password: event.target.value
                                       }))}/>
                            </Field>
                        </div>
                        <div className="mt-4 grid gap-3 px-1 py-1 md:grid-cols-2">
                            <label className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={mailSenderForm.useSsl}
                                       onChange={(event) => setMailSenderForm((current) => ({
                                           ...current,
                                           useSsl: event.target.checked
                                       }))}/>
                                {recruitmentUiText.useSSL}
                            </label>
                            <label className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={mailSenderForm.useStarttls}
                                       onChange={(event) => setMailSenderForm((current) => ({
                                           ...current,
                                           useStarttls: event.target.checked
                                       }))}/>
                                {recruitmentUiText.useSTARTTLS}
                            </label>
                            <label className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={mailSenderForm.isDefault}
                                       onChange={(event) => setMailSenderForm((current) => ({
                                           ...current,
                                           isDefault: event.target.checked
                                       }))}/>
                                {recruitmentUiText.setAsDefaultSender}
                            </label>
                            <label className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={mailSenderForm.isEnabled}
                                       onChange={(event) => setMailSenderForm((current) => ({
                                           ...current,
                                           isEnabled: event.target.checked
                                       }))}/>
                                {recruitmentUiText.enableSender}
                            </label>
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMailSenderDialogOpen(false)}>{recruitmentUiText.cancelButton}</Button>
                        <Button onClick={() => void submitMailSender()} disabled={mailSenderSaving}>{mailSenderSaving ? recruitmentUiText.saving : recruitmentUiText.saveMailSender}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={mailRecipientDialogOpen} onOpenChange={setMailRecipientDialogOpen}>
                <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>{mailRecipientEditingId ? recruitmentUiText.editMailRecipient : recruitmentUiText.newMailRecipient}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.mailRecipientDescription}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[65vh]">
                        <div className="space-y-4 px-1 py-1">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label={recruitmentUiText.recipientName}><Input value={mailRecipientForm.name}
                                                           onChange={(event) => setMailRecipientForm((current) => ({
                                                               ...current,
                                                               name: event.target.value
                                                           }))}/></Field>
                                <Field label={recruitmentUiText.recipientEmail}><Input value={mailRecipientForm.email}
                                                           onChange={(event) => setMailRecipientForm((current) => ({
                                                               ...current,
                                                               email: event.target.value
                                                           }))} placeholder="name@example.com"/></Field>
                                <Field label={recruitmentUiText.recipientDepartment}><Input value={mailRecipientForm.department}
                                                           onChange={(event) => setMailRecipientForm((current) => ({
                                                               ...current,
                                                               department: event.target.value
                                                           }))}/></Field>
                                <Field label={recruitmentUiText.recipientRoleTitle}><Input value={mailRecipientForm.roleTitle}
                                                           onChange={(event) => setMailRecipientForm((current) => ({
                                                               ...current,
                                                               roleTitle: event.target.value
                                                           }))}/></Field>
                            </div>
                            <Field label={recruitmentUiText.recipientTags}>
                                <Input value={mailRecipientForm.tagsText}
                                       onChange={(event) => setMailRecipientForm((current) => ({
                                           ...current,
                                           tagsText: event.target.value
                                       }))} placeholder={recruitmentUiText.recipientTagsPlaceholder}/>
                            </Field>
                            <Field label={recruitmentUiText.recipientNotes}>
                                <Textarea className="resize-y" value={mailRecipientForm.notes}
                                          onChange={(event) => setMailRecipientForm((current) => ({
                                              ...current,
                                              notes: event.target.value
                                          }))} rows={4}/>
                            </Field>
                            <label className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={mailRecipientForm.isEnabled}
                                       onChange={(event) => setMailRecipientForm((current) => ({
                                           ...current,
                                           isEnabled: event.target.checked
                                       }))}/>
                                {recruitmentUiText.enableRecipient}
                            </label>
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMailRecipientDialogOpen(false)}>{recruitmentUiText.cancelButton}</Button>
                        <Button onClick={() => void submitMailRecipient()} disabled={mailRecipientSaving}>{mailRecipientSaving ? recruitmentUiText.saving : recruitmentUiText.saveMailRecipient}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={resumeMailDialogOpen}
                onOpenChange={(open) => {
                    setResumeMailDialogOpen(open);
                    if (!open) {
                        if (resumeMailSourceAssistantMessageId) {
                            setAssistantMailActionState((current) => {
                                const currentState = current[resumeMailSourceAssistantMessageId];
                                if (!currentState?.editing) {
                                    return current;
                                }
                                return {
                                    ...current,
                                    [resumeMailSourceAssistantMessageId]: {
                                        ...currentState,
                                        editing: false,
                                    },
                                };
                            });
                        }
                        setResumeMailDialogMode("send");
                        setResumeMailSourceDispatchId(null);
                        setResumeMailSourceAssistantMessageId(null);
                        setResumeMailError(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{resumeMailDialogTitle}</DialogTitle>
                        <DialogDescription>{resumeMailDialogDescription}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[70vh]">
                        <div className="space-y-5 px-1 py-1">
                            <Field label={recruitmentUiText.candidatesInThisSendLabel}>
                                <div className="grid gap-3">
                                    {resumeMailTargetCandidates.length ? resumeMailTargetCandidates.map((candidate) => (
                                        <div key={candidate.id}
                                             className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-medium text-slate-900 dark:text-slate-100">{candidate.name}</p>
                                                    <p className="mt-1 text-base text-slate-500 dark:text-slate-400">{candidate.position_title || recruitmentUiText.resumeNoLinkedPosition}</p>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {getCandidateResumeMailSummary(candidate.id) ? (
                                                        <Badge
                                                            className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                                            {recruitmentUiText.alreadySent}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline"
                                                               className="rounded-full">{recruitmentUiText.firstSend}</Badge>
                                                    )}
                                                </div>
                                            </div>
                                            {getCandidateResumeMailSummary(candidate.id) ? (
                                                <p className="mt-2 text-sm text-sky-600 dark:text-sky-300">{getCandidateResumeMailSummary(candidate.id)}</p>
                                            ) : (
                                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{recruitmentUiText.noSendHistory}</p>
                                            )}
                                        </div>
                                    )) : (
                                        <p className="text-base text-slate-500 dark:text-slate-400">{recruitmentUiText.noCandidateDetails}</p>
                                    )}
                                </div>
                            </Field>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label={recruitmentUiText.senderConfig}>
                                    <NativeSelect value={resumeMailForm.senderConfigId}
                                                  onChange={(event) => setResumeMailForm((current) => ({
                                                      ...current,
                                                      senderConfigId: event.target.value
                                                  }))}>
                                        <option value="">{recruitmentUiText.useDefaultSender}</option>
                                        {mailSenderConfigs.filter((sender) => sender.is_enabled).map((sender) => (
                                            <option key={sender.id} value={sender.id}>
                                                {sender.name} / {sender.from_email}
                                            </option>
                                        ))}
                                    </NativeSelect>
                                </Field>
                                <Field label={recruitmentUiText.recipientEmailsOptional}>
                                    <Input
                                        value={resumeMailForm.extraRecipientEmails}
                                        onChange={(event) => setResumeMailForm((current) => ({
                                            ...current,
                                            extraRecipientEmails: event.target.value
                                        }))}
                                        placeholder={recruitmentUiText.recipientEmailsPlaceholder}
                                    />
                                </Field>
                            </div>

                            <Field label={recruitmentUiText.selectInternalRecipients}>
                                <div className="grid gap-3 md:grid-cols-2">
                                    {mailRecipients.filter((recipient) => recipient.is_enabled).length ? mailRecipients.filter((recipient) => recipient.is_enabled).map((recipient) => (
                                        <label key={recipient.id}
                                               className="flex items-start gap-3 rounded-2xl border border-slate-200/80 px-4 py-4 text-base dark:border-slate-800">
                                            <input
                                                type="checkbox"
                                                checked={resumeMailForm.recipientIds.includes(recipient.id)}
                                                onChange={(event) => setResumeMailForm((current) => ({
                                                    ...current,
                                                    recipientIds: toggleIdInList(current.recipientIds, recipient.id, event.target.checked),
                                                }))}
                                            />
                                            <div>
                                                <p className="font-medium text-slate-900 dark:text-slate-100">{recipient.name}</p>
                                                <p className="mt-1 text-slate-500 dark:text-slate-400">{recipient.email}</p>
                                                <p className="mt-1 text-slate-500 dark:text-slate-400">{recipient.department || recruitmentUiText.noDepartmentSet} / {recipient.role_title || recruitmentUiText.noRoleSet}</p>
                                            </div>
                                        </label>
                                    )) : (
                                        <EmptyState title={recruitmentUiText.noRecipientsAvailable}
                                                    description={recruitmentUiText.noRecipientsAvailableDesc}/>
                                    )}
                                </div>
                            </Field>

                            <Field label={recruitmentUiText.emailSubjectOptional}>
                                <Input value={resumeMailForm.subject}
                                       onChange={(event) => setResumeMailForm((current) => ({
                                           ...current,
                                           subject: event.target.value
                                       }))} placeholder={recruitmentUiText.emailSubjectPlaceholder}/>
                            </Field>
                            <Field label={recruitmentUiText.emailBodyOptional}>
                                <Textarea value={resumeMailForm.bodyText}
                                          onChange={(event) => setResumeMailForm((current) => ({
                                              ...current,
                                              bodyText: event.target.value
                                          }))} rows={10}
                                          placeholder={recruitmentUiText.emailBodyPlaceholder}/>
                            </Field>
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        {resumeMailError && (
                            <p className="text-base text-red-500 flex-1 text-left">{resumeMailError}</p>
                        )}
                        <Button variant="outline" onClick={() => setResumeMailDialogOpen(false)}>{recruitmentUiText.cancelButton}</Button>
                        <Button onClick={() => void submitResumeMail()} disabled={resumeMailSubmitting}>
                            <Send className="h-4 w-4"/>
                            {resumeMailSubmitLabel}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 简历 PDF 预览模态窗口 - 使用 Portal 渲染到 body */}
            {previewPdfUrl && typeof document !== 'undefined' && createPortal(
                <ResumePreviewModal
                    previewPdfUrl={previewPdfUrl}
                    previewPdfLoading={previewPdfLoading}
                    previewCandidateName={previewCandidateName}
                    isZh={isZh}
                    onClose={closeResumePreview}
                    setPreviewPdfLoading={setPreviewPdfLoading}
                />,
                document.body
            )}
        </div>
    );
}
