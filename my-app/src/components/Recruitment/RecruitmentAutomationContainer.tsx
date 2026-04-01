"use client";

import React, {useCallback, useDeferredValue, useEffect, useMemo, useRef, useState} from "react";
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
    FilePlus2,
    FolderKanban,
    History,
    Loader2,
    NotebookText,
    Plus,
    RefreshCw,
    Rocket,
    Save,
    Send,
    Settings2,
    Sparkles,
    Square,
    Trash2,
    Upload,
    Users,
    Wand2,
} from "lucide-react";
import {toast} from "sonner";

import {authenticatedFetch, getStoredScriptHubSession} from "@/lib/auth";
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
    joinTags,
    recruitmentApi,
    splitTags,
    type AITaskLog,
    type CandidateDetail,
    type CandidateSummary,
    type ChatContext,
    type ChatResponse,
    type DashboardData,
    type JDVersion,
    type PositionDetail,
    type PositionSummary,
    type RecruitmentLLMConfig,
    type RecruitmentMailRecipient,
    type RecruitmentMailSenderConfig,
    type RecruitmentResumeMailDispatch,
    type RecruitmentMetadata,
    type RecruitmentSkill,
    type ResumeFile,
    type RecruitmentTaskStartResponse,
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
import {Separator} from "@/components/ui/separator";
import {Textarea} from "@/components/ui/textarea";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
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
    type ResumeMailDialogMode,
    type ResumeMailFormState,
    type SkillFormState,
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
    emptySkillForm,
    extractFileNameFromDisposition,
    extractPublishText,
    formatActionError,
    formatDateTime,
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
    resolveLogSkillSnapshots,
    resolveTaskSkillIds,
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
    SectionNavButton,
    SettingsEntry,
} from "./components/SharedComponents";
import {AssistantPage} from "./pages/AssistantPage";
import {AuditPage} from "./pages/AuditPage";
import {CandidatesPage} from "./pages/CandidatesPage";
import {MailSettingsPage} from "./pages/MailSettingsPage";
import {ModelSettingsPage} from "./pages/ModelSettingsPage";
import {SkillSettingsPage} from "./pages/SkillSettingsPage";
import {WorkspacePage} from "./pages/WorkspacePage";

const PAGE_ACTIVITY_POLL_VISIBLE_INTERVAL_MS = 1500;
const PAGE_ACTIVITY_POLL_HIDDEN_INTERVAL_MS = 6000;
const PAGE_ACTIVITY_POLL_MAX_INTERVAL_MS = 15000;
const TASK_MONITOR_VISIBLE_INTERVAL_MS = 1200;
const TASK_MONITOR_HIDDEN_INTERVAL_MS = 5000;
const TASK_MONITOR_MAX_INTERVAL_MS = 15000;

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
}

export default function RecruitmentAutomationContainer({onBack}: RecruitmentAutomationContainerProps) {
    type PositionFormErrors = Partial<Record<"title" | "headcount", string>>;

    const sessionUser = useMemo(() => getStoredScriptHubSession()?.user ?? null, []);
    const jdGenerationInFlightRef = useRef(false);
    const screeningLaunchInFlightRef = useRef(false);
    const taskMonitorTimersRef = useRef<Map<number, number>>(new Map());
    const taskMonitorTokensRef = useRef<Map<number, symbol>>(new Map());
    const requestInflightRef = useRef<Map<string, Promise<unknown>>>(new Map());
    const primaryNavScrollRef = useRef<HTMLDivElement | null>(null);
    const primaryNavButtonRefs = useRef<Partial<Record<RecruitmentPage, HTMLButtonElement | null>>>({});
    const selectedLogIdRef = useRef<number | null>(null);
    const selectedPositionIdRef = useRef<number | null>(null);
    const selectedCandidateIdRef = useRef<number | null>(null);
    const positionsFiltersInitializedRef = useRef(false);
    const candidatesFiltersInitializedRef = useRef(false);
    const logsFiltersInitializedRef = useRef(false);
    const positionsLoadRequestIdRef = useRef(0);
    const candidatesLoadRequestIdRef = useRef(0);
    const positionDetailLoadRequestIdRef = useRef(0);
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
    const canManageRecruitment = Boolean(
        sessionUser?.permissions["ai-recruitment-manage"]
        || sessionUser?.permissions["rbac-manage"],
    );

    const [activePage, setActivePage] = useState<RecruitmentPage>("workspace");
    const [assistantOpen, setAssistantOpen] = useState(false);
    const [navCollapsed, setNavCollapsed] = useState(false);
    const [positionListCollapsed, setPositionListCollapsed] = useState(false);
    const [positionWorkspaceView, setPositionWorkspaceView] = useState<"jd" | "config">("jd");
    const [positionSecondaryPanelOpen, setPositionSecondaryPanelOpen] = useState(false);
    const [candidateFiltersCollapsed, setCandidateFiltersCollapsed] = useState(true);
    const [auditFiltersCollapsed, setAuditFiltersCollapsed] = useState(true);
    const [bootstrapping, setBootstrapping] = useState(true);
    const activePrimaryNavPage = assistantOpen ? "assistant" : activePage;
    const [pageVisible, setPageVisible] = useState(() => (
        typeof document === "undefined" ? true : document.visibilityState === "visible"
    ));
    const pageVisibleRef = useRef(pageVisible);

    const [metadata, setMetadata] = useState<RecruitmentMetadata | null>(null);
    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [positions, setPositions] = useState<PositionSummary[]>([]);
    const [positionDetail, setPositionDetail] = useState<PositionDetail | null>(null);
    const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
    const [candidateDetail, setCandidateDetail] = useState<CandidateDetail | null>(null);
    const [skills, setSkills] = useState<RecruitmentSkill[]>([]);
    const [aiLogs, setAiLogs] = useState<AITaskLog[]>([]);
    const [selectedLogDetail, setSelectedLogDetail] = useState<AITaskLog | null>(null);
    const [chatContext, setChatContext] = useState<ChatContext>({
        position_id: null,
        position_title: null,
        skill_ids: [],
        skills: [],
    });
    const [llmConfigs, setLlmConfigs] = useState<RecruitmentLLMConfig[]>([]);
    const [mailSenderConfigs, setMailSenderConfigs] = useState<RecruitmentMailSenderConfig[]>([]);
    const [mailRecipients, setMailRecipients] = useState<RecruitmentMailRecipient[]>([]);
    const [resumeMailDispatches, setResumeMailDispatches] = useState<RecruitmentResumeMailDispatch[]>([]);

    const [positionQuery, setPositionQuery] = useState("");
    const [positionStatusFilter, setPositionStatusFilter] = useState("all");
    const deferredPositionQuery = useDeferredValue(positionQuery);

    const [candidateQuery, setCandidateQuery] = useState("");
    const [candidateStatusFilter, setCandidateStatusFilter] = useState("all");
    const [candidatePositionFilter, setCandidatePositionFilter] = useState("all");
    const [candidateSourceFilter, setCandidateSourceFilter] = useState("all");
    const [candidateTimeFilter, setCandidateTimeFilter] = useState("all");
    const [candidateMatchFilter, setCandidateMatchFilter] = useState("all");
    const [candidateViewMode, setCandidateViewMode] = useState<CandidateViewMode>("list");
    const [candidateListColumnWidths, setCandidateListColumnWidths] = useState<Record<CandidateListColumnKey, number>>(
        candidateListColumnDefaultWidths,
    );
    const deferredCandidateQuery = useDeferredValue(candidateQuery);

    const [logTaskTypeFilter, setLogTaskTypeFilter] = useState("all");
    const [logStatusFilter, setLogStatusFilter] = useState("all");
    const positionListRequestKey = `${deferredPositionQuery}::${positionStatusFilter}`;
    const candidateListRequestKey = `${deferredCandidateQuery}::${candidateStatusFilter}::${candidatePositionFilter}`;
    const auditLogRequestKey = `${logStatusFilter}::${logTaskTypeFilter}`;
    const auditLogRequestKeyRef = useRef(auditLogRequestKey);

    const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null);
    const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
    const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>([]);
    const [selectedLogId, setSelectedLogId] = useState<number | null>(null);

    const [positionsLoading, setPositionsLoading] = useState(false);
    const [positionDetailLoading, setPositionDetailLoading] = useState(false);
    const [candidatesLoading, setCandidatesLoading] = useState(false);
    const [candidateDetailLoading, setCandidateDetailLoading] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logDetailLoading, setLogDetailLoading] = useState(false);
    const [skillsLoading, setSkillsLoading] = useState(false);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [mailSettingsLoading, setMailSettingsLoading] = useState(false);
    const [coreRefreshing, setCoreRefreshing] = useState(false);
    const [skillSubmitting, setSkillSubmitting] = useState(false);
    const [llmSubmitting, setLlmSubmitting] = useState(false);
    const [resumeMailSubmitting, setResumeMailSubmitting] = useState(false);
    const [mailDispatchActionKey, setMailDispatchActionKey] = useState<string | null>(null);
    const [chatSending, setChatSending] = useState(false);
    const [interviewPreviewHeight, setInterviewPreviewHeight] = useState(760);
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
    const [resumeUploadFiles, setResumeUploadFiles] = useState<File[]>([]);
    const [resumeUploadPositionId, setResumeUploadPositionId] = useState("all");

    const [publishDialogOpen, setPublishDialogOpen] = useState(false);
    const [publishPlatform, setPublishPlatform] = useState("boss");
    const [publishMode, setPublishMode] = useState("mock");

    const [jdExtraPrompt, setJdExtraPrompt] = useState("");
    const [jdViewMode, setJdViewMode] = useState<JDViewMode>("publish");
    const [jdGenerationStatus, setJdGenerationStatus] = useState<string>("idle");
    const [jdGenerationError, setJdGenerationError] = useState("");
    const [screeningSubmitting, setScreeningSubmitting] = useState(false);
    const [interviewGenerating, setInterviewGenerating] = useState(false);
    const [positionDeleting, setPositionDeleting] = useState(false);
    const [positionDeleteConfirmOpen, setPositionDeleteConfirmOpen] = useState(false);
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

    const [candidateEditor, setCandidateEditor] = useState<CandidateEditorState>(emptyCandidateEditor);
    const [statusUpdateReason, setStatusUpdateReason] = useState("");
    const [pendingStatus, setPendingStatus] = useState<string | null>(null); // ← 新增
    const [interviewRoundName, setInterviewRoundName] = useState("初试");
    const [interviewCustomRequirements, setInterviewCustomRequirements] = useState("");
    const [selectedInterviewSkillIds, setSelectedInterviewSkillIds] = useState<number[]>([]);

    const [chatInput, setChatInput] = useState("");
    const [assistantDisplayMode, setAssistantDisplayMode] = useState<AssistantDisplayMode>("drawer");
    const [settingsPopoverOpen, setSettingsPopoverOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
        {
            id: "intro",
            role: "assistant",
            content: "我是招聘助手。你可以直接让我生成 JD、查看岗位候选人、重新初筛某位候选人并追加硬性条件，或者说明这次对话实际使用了哪些 Skills。",
            createdAt: new Date().toISOString(),
        },
    ]);

    const assistantScrollAnchorRef = useRef<HTMLDivElement | null>(null);
    const assistantScrollAreaRef = useRef<HTMLDivElement | null>(null);
    const assistantInputRef = useRef<HTMLTextAreaElement | null>(null);
    const assistantStreamAbortRef = useRef<AbortController | null>(null);
    const chatContextRef = useRef(chatContext);
    const positionTitleInputRef = useRef<HTMLInputElement | null>(null);
    const positionHeadcountInputRef = useRef<HTMLInputElement | null>(null);

    const syncInterviewPreviewHeight = useCallback((iframe: HTMLIFrameElement | null) => {
        if (!iframe) {
            return;
        }
        const applyHeight = () => {
            try {
                const doc = iframe.contentDocument;
                const body = doc?.body;
                const root = doc?.documentElement;
                const nextHeight = Math.max(
                    body?.scrollHeight || 0,
                    body?.offsetHeight || 0,
                    root?.scrollHeight || 0,
                    root?.offsetHeight || 0,
                    640,
                );
                setInterviewPreviewHeight(nextHeight);
            } catch {
                setInterviewPreviewHeight(760);
            }
        };
        applyHeight();
        window.setTimeout(applyHeight, 120);
        window.setTimeout(applyHeight, 420);
    }, []);

    const [skillDialogOpen, setSkillDialogOpen] = useState(false);
    const [skillEditingId, setSkillEditingId] = useState<number | null>(null);
    const [skillForm, setSkillForm] = useState<SkillFormState>(emptySkillForm);

    const [llmDialogOpen, setLlmDialogOpen] = useState(false);
    const [llmEditingId, setLlmEditingId] = useState<number | null>(null);
    const [llmForm, setLlmForm] = useState<LLMFormState>(emptyLLMForm);
    const [mailSenderDialogOpen, setMailSenderDialogOpen] = useState(false);
    const [mailSenderEditingId, setMailSenderEditingId] = useState<number | null>(null);
    const [mailSenderForm, setMailSenderForm] = useState<MailSenderFormState>(emptyMailSenderForm);
    const [mailRecipientDialogOpen, setMailRecipientDialogOpen] = useState(false);
    const [mailRecipientEditingId, setMailRecipientEditingId] = useState<number | null>(null);
    const [mailRecipientForm, setMailRecipientForm] = useState<MailRecipientFormState>(emptyMailRecipientForm);
    const [resumeMailDialogOpen, setResumeMailDialogOpen] = useState(false);
    const [resumeMailDialogMode, setResumeMailDialogMode] = useState<ResumeMailDialogMode>("send");
    const [resumeMailSourceDispatchId, setResumeMailSourceDispatchId] = useState<number | null>(null);
    const [resumeMailSourceAssistantMessageId, setResumeMailSourceAssistantMessageId] = useState<string | null>(null);
    const [resumeMailForm, setResumeMailForm] = useState<ResumeMailFormState>(emptyResumeMailForm);
    const [interviewSkillSelectionDirty, setInterviewSkillSelectionDirty] = useState(false);
    const [candidateProcessLogsExpanded, setCandidateProcessLogsExpanded] = useState(false);

    const positionMap = useMemo(() => new Map(positions.map((item) => [item.id, item])), [positions]);
    const candidateMap = useMemo(() => new Map(candidates.map((item) => [item.id, item])), [candidates]);
    const skillMap = useMemo(() => new Map(skills.map((item) => [item.id, item])), [skills]);
    const enabledSkills = useMemo(() => skills.filter((skill) => skill.is_enabled !== false), [skills]);
    const jdAuthoringSkills = useMemo(() => sortSkillsForTaskPreference(enabledSkills, "jd"), [enabledSkills]);
    const screeningAuthoringSkills = useMemo(() => sortSkillsForTaskPreference(enabledSkills, "screening"), [enabledSkills]);
    const interviewAuthoringSkills = useMemo(() => sortSkillsForTaskPreference(enabledSkills, "interview"), [enabledSkills]);
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
    const currentPositionJDTaskId = activeJDPositionId === selectedPositionId ? activeJDTaskId : null;
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
            return "未指定候选人";
        }
        return candidateMap.get(chatContext.candidate_id)?.name || `候选人 #${chatContext.candidate_id}`;
    }, [candidateMap, chatContext.candidate_id]);
    const assistantModelLabel = assistantActiveLLMConfig
        ? `${labelForProvider(assistantActiveLLMConfig.resolved_provider || assistantActiveLLMConfig.provider)} / ${assistantActiveLLMConfig.resolved_model_name || assistantActiveLLMConfig.model_name}`
        : "暂未识别";
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
            .map((skillId) => skillMap.get(skillId))
            .filter(Boolean) as RecruitmentSkill[],
        updated_at: new Date().toISOString(),
    }), [positionMap, skillMap]);
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
        ? "工作记忆中的面试题 Skills"
        : (positionInterviewSkillIds.length
                ? "岗位绑定 Skills"
                : "未配置 Skills");
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
        ? "岗位绑定 Skills"
        : (workflowScreeningSkillIds.length ? "初筛工作记忆 Skills" : "未配置 Skills");
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
        ? "岗位绑定 Skills"
        : workflowInterviewSkillIds.length
            ? "面试题工作记忆 Skills"
            : "未配置 Skills";
    const effectiveInterviewSkillIds = interviewSkillSelectionDirty ? selectedInterviewSkillIds : autoInterviewSkillIds;
    const effectiveInterviewSkillSourceLabel = interviewSkillSelectionDirty ? "手动选择 Skills" : autoInterviewSkillSourceLabel;
    const activeScreeningTaskIds = useMemo(() => Object.values(activeScreeningTaskMap), [activeScreeningTaskMap]);
    const selectedCandidateScreeningTaskId = selectedCandidateId ? (activeScreeningTaskMap[selectedCandidateId] || null) : null;
    const isBatchScreeningRunning = activeBatchScreeningTaskIds.length > 0;
    const currentCandidateInterviewTaskId = activeInterviewCandidateId === selectedCandidateId ? activeInterviewTaskId : null;
    const isTaskCancelling = useCallback((taskId?: number | null) => {
        if (!taskId) {
            return false;
        }
        return cancellingTaskIds.includes(taskId);
    }, [cancellingTaskIds]);
    const isCurrentJDTaskCancelling = isTaskCancelling(currentPositionJDTaskId);
    const isSelectedCandidateScreeningCancelling = isTaskCancelling(selectedCandidateScreeningTaskId);
    const isCurrentInterviewTaskCancelling = isTaskCancelling(currentCandidateInterviewTaskId);
    const isCurrentChatTaskCancelling = isTaskCancelling(activeChatTaskId);
    const isStreaming = chatSending;
    const canStopCurrentRun = Boolean(activeChatTaskId || currentAssistantRunId || assistantStreamAbortRef.current);
    const isCurrentRunStopping = isCurrentChatTaskCancelling || assistantStreamStopping;
    const showScrollToBottomButton = isUserScrolledUp && chatMessages.length > 0;
    const isBatchScreeningCancelling = activeBatchScreeningTaskIds.length > 0
        && activeBatchScreeningTaskIds.every((taskId) => cancellingTaskIds.includes(taskId));
    const hasLiveLogActivity = useMemo(() => {
        return aiLogs.some((item) => isLiveTaskStatus(item.status));
    }, [aiLogs]);
    const hasLiveCandidateActivity = useMemo(() => {
        return (candidateDetail?.activity || []).some((item) => isLiveTaskStatus(item.status));
    }, [candidateDetail?.activity]);
    const hasLiveCandidateListActivity = useMemo(() => {
        return candidates.some((candidate) => (
            candidate.active_screening_task_status
            && isLiveTaskStatus(candidate.active_screening_task_status)
        ));
    }, [candidates]);
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
    const resumeMailDialogTitle = resumeMailDialogMode === "resend" ? "再次发送简历邮件" : "发送简历邮件";
    const resumeMailDialogDescription = resumeMailDialogMode === "resend"
        ? `已基于发送记录 #${resumeMailSourceDispatchId || "-"} 预填内容。你可以修改收件人、标题和正文后再次发送。`
        : "支持单个或批量发送给一个或多个收件人。上方可直接填写收件人邮箱，下方可快捷勾选内部收件人。邮件标题和正文都允许留空，留空时由系统按默认模板生成。";
    const resumeMailSubmitLabel = resumeMailSubmitting
        ? (resumeMailDialogMode === "resend" ? "发送中..." : "发送中...")
        : (resumeMailDialogMode === "resend" ? "再次发送" : "发送简历");

    function getCandidateResumeMailSummary(candidateId: number) {
        const stat = candidateResumeMailStats.get(candidateId);
        if (!stat || stat.sentCount <= 0) {
            return null;
        }
        return stat.latestSentAt
            ? `已发送 ${stat.sentCount} 次 · 最近 ${formatDateTime(stat.latestSentAt)}`
            : `已发送 ${stat.sentCount} 次`;
    }

    const sourceOptions = useMemo(() => {
        return Array.from(
            new Set(
                candidates
                    .map((candidate) => candidate.source)
                    .filter((item): item is string => Boolean(item)),
            ),
        );
    }, [candidates]);

    const visibleCandidates = useMemo(() => {
        return candidates.filter((candidate) => {
            if (candidateSourceFilter !== "all" && (candidate.source || "未知来源") !== candidateSourceFilter) {
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
    }, [candidateMatchFilter, candidateSourceFilter, candidateTimeFilter, candidates]);

    const groupedCandidates = useMemo(() => {
        const order = metadata?.candidate_statuses?.map((item) => item.value) || Object.keys(candidateStatusLabels);
        return order.map((status) => ({
            status,
            label: labelForCandidateStatus(status),
            items: visibleCandidates.filter((candidate) => candidate.status === status),
        }));
    }, [metadata, visibleCandidates]);

    const candidateListDisplayColumnWidths = useMemo(() => (
        expandTableColumnWidths(
            candidateListColumnWidths,
            candidateListViewportWidth,
            56,
            candidateListColumnFillWeights,
        )
    ), [candidateListColumnWidths, candidateListViewportWidth]);

    const candidateListTableWidth = useMemo(() => {
        return 56 + Object.values(candidateListDisplayColumnWidths).reduce((sum, width) => sum + width, 0);
    }, [candidateListDisplayColumnWidths]);

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

    const todayNewResumes = useMemo(
        () => candidates.filter((candidate) => isToday(candidate.created_at)).length,
        [candidates],
    );

    const todoSummary = useMemo(() => {
        return {
            pendingPublish: positions.filter((position) => position.status === "draft" || !position.current_jd_version_id).length,
            pendingScreening: candidates.filter((candidate) => candidate.status === "pending_screening").length,
            pendingInterview: candidates.filter((candidate) => candidate.status === "pending_interview").length,
            pendingDecision: candidates.filter((candidate) => candidate.status === "pending_offer").length,
        };
    }, [candidates, positions]);

    const recentCandidates = dashboard?.recent_candidates || [];
    const recentLogs = aiLogs.slice(0, 6);
    const candidateFilterSummary = useMemo(() => {
        const positionLabel = candidatePositionFilter === "all"
            ? "全部岗位"
            : (positions.find((position) => String(position.id) === candidatePositionFilter)?.title || "指定岗位");
        const statusLabel = candidateStatusFilter === "all"
            ? "全部状态"
            : (candidateStatusLabels[candidateStatusFilter] || candidateStatusFilter);
        const matchLabel = ({
            all: "全部匹配度",
            "80+": "80% 以上",
            "60+": "60% 以上",
            "40+": "40% 以上",
        } as Record<string, string>)[candidateMatchFilter] || candidateMatchFilter;
        const timeLabel = ({
            all: "全部时间",
            today: "今天",
            "7d": "近 7 天",
            "30d": "近 30 天",
        } as Record<string, string>)[candidateTimeFilter] || candidateTimeFilter;
        const sourceLabel = candidateSourceFilter === "all" ? "全部来源" : candidateSourceFilter;
        const keywordLabel = candidateQuery.trim() ? `关键词：${candidateQuery.trim()}` : "无关键词";
        return [
            candidateViewMode === "board" ? "看板视图" : "列表视图",
            positionLabel,
            statusLabel,
            matchLabel,
            sourceLabel,
            timeLabel,
            keywordLabel,
        ].join(" · ");
    }, [
        candidateMatchFilter,
        candidatePositionFilter,
        candidateQuery,
        candidateSourceFilter,
        candidateStatusFilter,
        candidateTimeFilter,
        candidateViewMode,
        positions,
    ]);
    const auditFilterSummary = useMemo(() => {
        const taskTypeLabel = logTaskTypeFilter === "all"
            ? "全部任务类型"
            : (aiTaskLabels[logTaskTypeFilter] || logTaskTypeFilter);
        const statusLabel = logStatusFilter === "all" ? "全部状态" : logStatusFilter;
        return `${taskTypeLabel} · ${statusLabel}`;
    }, [logStatusFilter, logTaskTypeFilter]);

    useEffect(() => {
        if (!canManageRecruitment && (
            activePage === "settings-skills"
            || activePage === "settings-models"
            || activePage === "settings-mail"
        )) {
            setActivePage("workspace");
        }
    }, [activePage, canManageRecruitment]);

    useEffect(() => {
        setSettingsPopoverOpen(false);
    }, [activePage]);

    useEffect(() => {
        setSelectedCandidateIds((current) => current.filter((candidateId) => visibleCandidates.some((candidate) => candidate.id === candidateId)));
    }, [visibleCandidates]);

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
        setPositionWorkspaceView("jd");
        setPositionSecondaryPanelOpen(false);
    }, [selectedPositionId]);

    useEffect(() => {
        selectedCandidateIdRef.current = selectedCandidateId;
    }, [selectedCandidateId]);

    useEffect(() => {
        const scrollContainer = primaryNavScrollRef.current;
        const activeButton = primaryNavButtonRefs.current[activePrimaryNavPage];
        if (!scrollContainer || !activeButton) {
            return undefined;
        }
        const frameId = window.requestAnimationFrame(() => {
            activeButton.scrollIntoView({
                block: "nearest",
                inline: "nearest",
                behavior: "smooth",
            });
        });
        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, [activePrimaryNavPage, navCollapsed]);

    useEffect(() => {
        auditLogRequestKeyRef.current = auditLogRequestKey;
    }, [auditLogRequestKey]);

    useEffect(() => {
        pageVisibleRef.current = pageVisible;
    }, [pageVisible]);

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
        };
    }, []);

    useEffect(() => {
        setScreeningSubmitting(activeScreeningTaskIds.length > 0);
    }, [activeScreeningTaskIds.length]);

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

    useEffect(() => {
        let cancelled = false;

        async function bootstrap() {
            setBootstrapping(true);
            positionsFiltersInitializedRef.current = false;
            candidatesFiltersInitializedRef.current = false;
            logsFiltersInitializedRef.current = false;
            try {
                await Promise.allSettled([
                    loadMetadata(),
                    loadDashboard(),
                    loadPositions(),
                    loadCandidates(),
                    loadLogs(),
                ]);
                void Promise.allSettled([
                    loadSkills(),
                    loadMailSettings(),
                    loadChatContext(),
                    canManageRecruitment ? loadLLMConfigs() : Promise.resolve(),
                ]);
            } finally {
                if (!cancelled) {
                    setBootstrapping(false);
                }
            }
        }

        void bootstrap();
        return () => {
            cancelled = true;
        };
    }, [canManageRecruitment]);

    useEffect(() => {
        if (bootstrapping) {
            return;
        }
        if (!positionsFiltersInitializedRef.current) {
            positionsFiltersInitializedRef.current = true;
            return;
        }
        void loadPositions();
    }, [bootstrapping, positionListRequestKey]);

    useEffect(() => {
        if (bootstrapping) {
            return;
        }
        if (!candidatesFiltersInitializedRef.current) {
            candidatesFiltersInitializedRef.current = true;
            return;
        }
        void loadCandidates();
    }, [bootstrapping, candidateListRequestKey]);

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
        void loadPositionDetail(selectedPositionId);
    }, [selectedPositionId]);

    useEffect(() => {
        jdGenerationInFlightRef.current = false;
        setJdGenerationStatus("idle");
        setJdGenerationError("");
    }, [selectedPositionId]);

    useEffect(() => {
        if (!selectedCandidateId) {
            setCandidateDetail(null);
            return;
        }
        void loadCandidateDetail(selectedCandidateId);
    }, [selectedCandidateId]);

    useEffect(() => {
        if (!selectedLogId) {
            setSelectedLogDetail(null);
            return;
        }
        void loadLogDetail(selectedLogId);
    }, [selectedLogId]);

    useEffect(() => {
        const shouldPollLogs = activePage === "audit" || activePage === "workspace";
        const shouldPollCandidateDetail = activePage === "candidates";
        const shouldPollCandidateList = activePage === "candidates";
        const shouldPollLogDetail = activePage === "audit";
        const hasVisibleLiveActivity = (
            (shouldPollLogs && hasLiveLogActivity)
            || (shouldPollCandidateDetail && hasLiveCandidateActivity)
            || (shouldPollCandidateList && (hasLiveCandidateListActivity || activeScreeningTaskIds.length > 0))
        );
        if (!screeningSubmitting && !interviewGenerating && !chatSending && !resumeMailSubmitting && jdGenerationStatus === "idle" && !hasVisibleLiveActivity) {
            return undefined;
        }
        let cancelled = false;
        let polling = false;
        let failureCount = 0;
        let timerId: number | null = null;

        const scheduleNextPoll = (delay: number) => {
            if (cancelled) {
                return;
            }
            timerId = window.setTimeout(() => {
                void poll();
            }, delay);
        };

        const poll = async () => {
            if (cancelled || polling || !mountedRef.current) {
                return;
            }
            polling = true;
            try {
                const tasks: Promise<unknown>[] = [];
                if (shouldPollLogs && !logsLoading) {
                    tasks.push(loadLogs({silent: true}));
                }
                if (shouldPollCandidateList && !candidatesLoading) {
                    tasks.push(loadCandidates({silent: true}));
                }
                if (shouldPollCandidateDetail && selectedCandidateId && !candidateDetailLoading) {
                    tasks.push(loadCandidateDetail(selectedCandidateId, {silent: true}));
                }
                if (shouldPollLogDetail && selectedLogId && !logDetailLoading) {
                    tasks.push(loadLogDetail(selectedLogId, {silent: true}));
                }
                if (tasks.length) {
                    const results = await Promise.allSettled(tasks);
                    failureCount = results.some((result) => result.status === "rejected")
                        ? Math.min(failureCount + 1, 3)
                        : 0;
                } else {
                    failureCount = 0;
                }
            } finally {
                polling = false;
                scheduleNextPoll(getPollingDelay(
                    pageVisibleRef.current,
                    failureCount,
                    PAGE_ACTIVITY_POLL_VISIBLE_INTERVAL_MS,
                    PAGE_ACTIVITY_POLL_HIDDEN_INTERVAL_MS,
                    PAGE_ACTIVITY_POLL_MAX_INTERVAL_MS,
                ));
            }
        };

        void poll();
        return () => {
            cancelled = true;
            if (timerId) {
                window.clearTimeout(timerId);
            }
        };
    }, [
        activePage,
        screeningSubmitting,
        interviewGenerating,
        chatSending,
        resumeMailSubmitting,
        jdGenerationStatus,
        hasLiveLogActivity,
        hasLiveCandidateActivity,
        hasLiveCandidateListActivity,
        activeScreeningTaskIds.length,
        selectedCandidateId,
        selectedLogId,
        pageVisible,
        logsLoading,
        candidatesLoading,
        candidateDetailLoading,
        logDetailLoading,
    ]);

    useEffect(() => {
        const current = positionDetail?.current_jd_version;
        setJdDraft({
            title: current?.title || `${positionDetail?.position.title || "岗位"} JD`,
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
            notes: candidate?.notes || "",
            tagsText: joinTags(candidate?.tags),
            manualOverrideScore: score?.manual_override_score ? String(score.manual_override_score) : "",
            manualOverrideReason: score?.manual_override_reason || "",
        });
    }, [candidateDetail]);

    useEffect(() => {
        setSelectedInterviewSkillIds([]);
        setInterviewSkillSelectionDirty(false);
        setCandidateProcessLogsExpanded(false);
    }, [selectedCandidateId]);

    useEffect(() => {
        setInterviewPreviewHeight(760);
    }, [selectedCandidateId, candidateDetail?.interview_questions?.[0]?.id, candidateDetail?.interview_questions?.[0]?.html_content]);

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

    function renderCandidateListHeaderCell(key: CandidateListColumnKey, label: string) {
        const width = candidateListDisplayColumnWidths[key];
        return (
            <th
                key={key}
                style={{width, minWidth: width, maxWidth: width}}
                className="text-foreground sticky top-0 z-10 bg-inherit px-2 text-left align-middle font-medium whitespace-nowrap"
            >
                <div className="group relative flex items-center gap-2 pr-3">
                    <span className="truncate">{label}</span>
                    <button
                        type="button"
                        className="absolute -right-2 top-1/2 h-7 w-3 -translate-y-1/2 cursor-col-resize rounded-full border border-transparent bg-transparent opacity-0 transition hover:border-slate-300 hover:bg-slate-100/90 group-hover:opacity-100 dark:hover:border-slate-600 dark:hover:bg-slate-800/90"
                        onMouseDown={(event) => beginCandidateColumnResize(key, event)}
                        onDoubleClick={(event) => resetCandidateColumnWidth(key, event)}
                        aria-label={`调整${label}列宽`}
                        title={`拖拽调整${label}列宽，双击恢复默认`}
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
            const data = await runDedupedRequest("metadata", () => recruitmentApi<RecruitmentMetadata>("/metadata"));
            if (mountedRef.current) {
                setMetadata(data);
            }
            return data;
        } catch (error) {
            toast.error(`加载基础配置失败：${error instanceof Error ? error.message : "未知错误"}`);
            throw error;
        }
    }

    async function loadDashboard() {
        try {
            const data = await runDedupedRequest("dashboard", () => recruitmentApi<DashboardData>("/dashboard"));
            if (mountedRef.current) {
                setDashboard(data);
            }
            return data;
        } catch (error) {
            toast.error(`加载工作台失败：${error instanceof Error ? error.message : "未知错误"}`);
            throw error;
        }
    }

    async function loadPositions() {
        const requestId = positionsLoadRequestIdRef.current + 1;
        positionsLoadRequestIdRef.current = requestId;
        setPositionsLoading(true);
        try {
            const query = buildQuery({query: deferredPositionQuery, status: positionStatusFilter});
            const data = await runDedupedRequest(
                `positions:${query}`,
                () => recruitmentApi<PositionSummary[]>(`/positions${query}`),
            );
            if (!mountedRef.current || positionsLoadRequestIdRef.current !== requestId) {
                return data;
            }
            setPositions(data);
            setSelectedPositionId((current) => {
                if (current && data.some((item) => item.id === current)) {
                    return current;
                }
                return data[0]?.id || null;
            });
            return data;
        } catch (error) {
            toast.error(`加载岗位失败：${error instanceof Error ? error.message : "未知错误"}`);
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
            return data;
        } catch (error) {
            toast.error(`加载岗位详情失败：${error instanceof Error ? error.message : "未知错误"}`);
            return null;
        } finally {
            if (mountedRef.current && positionDetailLoadRequestIdRef.current === requestId) {
                setPositionDetailLoading(false);
            }
        }
    }

    async function loadCandidates(options?: { silent?: boolean }) {
        const requestId = candidatesLoadRequestIdRef.current + 1;
        candidatesLoadRequestIdRef.current = requestId;
        if (!options?.silent) {
            setCandidatesLoading(true);
        }
        try {
            const query = buildQuery({
                query: deferredCandidateQuery,
                status: candidateStatusFilter,
                position_id: candidatePositionFilter === "all" ? null : candidatePositionFilter,
            });
            const data = await runDedupedRequest(
                `candidates:${query}`,
                () => recruitmentApi<CandidateSummary[]>(`/candidates${query}`),
            );
            if (!mountedRef.current || candidatesLoadRequestIdRef.current !== requestId) {
                return data;
            }
            setCandidates(data);
            setSelectedCandidateId((current) => {
                if (current && data.some((item) => item.id === current)) {
                    return current;
                }
                return data[0]?.id || null;
            });
            return data;
        } catch (error) {
            if (!options?.silent) {
                toast.error(`加载候选人失败：${error instanceof Error ? error.message : "未知错误"}`);
            }
            throw error;
        } finally {
            if (!options?.silent && mountedRef.current && candidatesLoadRequestIdRef.current === requestId) {
                setCandidatesLoading(false);
            }
        }
    }

    async function loadCandidateDetail(candidateId: number, options?: { silent?: boolean }) {
        if (!options?.silent) {
            setCandidateDetailLoading(true);
        }
        try {
            const data = await runDedupedRequest(
                `candidate-detail:${candidateId}:${options?.silent ? "silent" : "full"}`,
                () => recruitmentApi<CandidateDetail>(`/candidates/${candidateId}`),
            );
            if (!mountedRef.current || selectedCandidateIdRef.current !== candidateId) {
                return data;
            }
            setCandidateDetail(data);
            const nextPositionId = data.candidate.position_id ?? null;
            if (
                data.candidate.id !== (chatContext.candidate_id ?? null)
                || nextPositionId !== (chatContext.position_id ?? null)
            ) {
                void saveChatContext(nextPositionId, chatContext.skill_ids, data.candidate.id, {quiet: true});
            }
            return data;
        } catch (error) {
            if (!options?.silent) {
                toast.error(`\u52a0\u8f7d\u5019\u9009\u4eba\u8be6\u60c5\u5931\u8d25\uff1a${error instanceof Error ? error.message : "\u672a\u77e5\u9519\u8bef"}`);
            }
            return null;
        } finally {
            if (!options?.silent) {
                setCandidateDetailLoading(false);
            }
        }
    }

    async function loadLogs(options?: { silent?: boolean }) {
        if (!options?.silent) {
            setLogsLoading(true);
        }
        try {
            const query = buildQuery({task_type: logTaskTypeFilter, status: logStatusFilter});
            const currentRequestKey = `${logStatusFilter}::${logTaskTypeFilter}`;
            const data = await runDedupedRequest(
                `logs:${options?.silent ? "silent" : "full"}:${query}`,
                () => recruitmentApi<AITaskLog[]>(`/ai-task-logs${query}`),
            );
            if (mountedRef.current && auditLogRequestKeyRef.current === currentRequestKey) {
                setAiLogs(data);
                setSelectedLogId((current) => {
                    if (current && data.some((item) => item.id === current)) {
                        return current;
                    }
                    return data[0]?.id || null;
                });
            }
            return data;
        } catch (error) {
            if (!options?.silent) {
                toast.error(`\u52a0\u8f7d AI \u4efb\u52a1\u5931\u8d25\uff1a${error instanceof Error ? error.message : "\u672a\u77e5\u9519\u8bef"}`);
            }
            throw error;
        } finally {
            if (!options?.silent) {
                setLogsLoading(false);
            }
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
            if (!options?.silent) {
                toast.error(`\u52a0\u8f7d\u4efb\u52a1\u8be6\u60c5\u5931\u8d25\uff1a${error instanceof Error ? error.message : "\u672a\u77e5\u9519\u8bef"}`);
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
                setSkills(data);
            }
            return data;
        } catch (error) {
            toast.error(`加载 Skills 失败：${error instanceof Error ? error.message : "未知错误"}`);
            throw error;
        } finally {
            setSkillsLoading(false);
        }
    }

    async function loadLLMConfigs() {
        if (!canManageRecruitment) {
            return [];
        }
        setModelsLoading(true);
        try {
            const data = await runDedupedRequest("llm-configs", () => recruitmentApi<RecruitmentLLMConfig[]>("/llm-configs"));
            if (mountedRef.current) {
                setLlmConfigs(data);
            }
            return data;
        } catch (error) {
            toast.error(`加载模型配置失败：${error instanceof Error ? error.message : "未知错误"}`);
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
            toast.error(`加载助手上下文失败：${error instanceof Error ? error.message : "未知错误"}`);
            throw error;
        }
    }

    async function loadMailSettings() {
        setMailSettingsLoading(true);
        try {
            const {senders, recipients, dispatches} = await runDedupedRequest("mail-settings", async () => {
                const [nextSenders, nextRecipients, nextDispatches] = await Promise.all([
                    recruitmentApi<RecruitmentMailSenderConfig[]>("/mail-senders"),
                    recruitmentApi<RecruitmentMailRecipient[]>("/mail-recipients"),
                    recruitmentApi<RecruitmentResumeMailDispatch[]>("/resume-mail-dispatches"),
                ]);
                return {
                    senders: nextSenders,
                    recipients: nextRecipients,
                    dispatches: nextDispatches,
                };
            });
            if (mountedRef.current) {
                setMailSenderConfigs(senders);
                setMailRecipients(recipients);
                setResumeMailDispatches(dispatches);
            }
            return {senders, recipients, dispatches};
        } catch (error) {
            toast.error(`加载邮件配置失败：${error instanceof Error ? error.message : "未知错误"}`);
            throw error;
        } finally {
            setMailSettingsLoading(false);
        }
    }

    async function refreshCoreData(options?: { includeMailSettings?: boolean }) {
        const tasks: Promise<unknown>[] = [
            loadDashboard(),
            loadPositions(),
            loadCandidates(),
            loadLogs(),
        ];
        if (options?.includeMailSettings) {
            tasks.push(loadMailSettings());
        }
        await Promise.all(tasks);
    }

    async function refreshCoreDataWithFeedback() {
        if (coreRefreshing) {
            return;
        }
        setCoreRefreshing(true);
        try {
            await refreshCoreData();
            toast.success("工作台数据已刷新");
        } catch (error) {
            toast.error(`刷新工作台失败：${formatActionError(error)}`);
        } finally {
            setCoreRefreshing(false);
        }
    }

    async function refreshLLMConfigsWithFeedback() {
        if (modelsLoading) {
            return;
        }
        try {
            await loadLLMConfigs();
            toast.success("模型配置已刷新");
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
            toast.success("邮件配置已刷新");
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
            toast.success("任务日志已刷新");
        } catch {
            // loadLogs already reports the error toast
        }
    }

    function navigateToSettingsPage(page: Extract<RecruitmentPage, "settings-skills" | "settings-models" | "settings-mail">) {
        setSettingsPopoverOpen(false);
        setActivePage(page);
    }

    function navigatePrimaryPage(page: RecruitmentPage) {
        setActivePage(page);
    }

    function openTaskLogDetail(logId?: number | null) {
        if (!logId) {
            return;
        }
        setActivePage("audit");
        setSelectedLogId(logId);
    }

    function mergeAiTaskLog(log: AITaskLog) {
        setCancellingTaskIds((current) => {
            if (log.status === "cancelling") {
                return current.includes(log.id) ? current : [...current, log.id];
            }
            return current.includes(log.id) ? current.filter((item) => item !== log.id) : current;
        });
        setAiLogs((current) => {
            const index = current.findIndex((item) => item.id === log.id);
            if (index === -1) {
                return [log, ...current];
            }
            const next = [...current];
            next[index] = log;
            return next;
        });
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
            const next = {...current};
            if (next[candidateId] === taskId) {
                delete next[candidateId];
            }
            return next;
        });
        setActiveBatchScreeningTaskIds((current) => current.filter((item) => item !== taskId));
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
        startTaskMonitor(taskId, {
            onFinish: async (log) => {
                if (!mountedRef.current) {
                    return;
                }
                clearActiveScreeningTask(candidateId, taskId);
                await Promise.all([
                    loadCandidates({silent: true}),
                    loadDashboard(),
                    loadLogs({silent: true}),
                ]);
                if (selectedCandidateIdRef.current === candidateId) {
                    await loadCandidateDetail(candidateId, {silent: true});
                }
                if (options?.suppressFinishToast) {
                    return;
                }
                if (log.status === "success" || log.status === "fallback") {
                    toast.success(log.status === "fallback" ? "初筛已完成（兜底完成）" : "初筛已完成");
                    return;
                }
                if (log.status === "cancelled") {
                    toast.success("已停止初筛");
                    return;
                }
                if (log.status === "failed") {
                    toast.error(`初筛失败：${log.error_message || "未知错误"}`);
                }
            },
        });
    }

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
            return "已停止生成。";
        }
        if (log.status === "failed") {
            return `发送失败：${log.error_message || "未知错误"}`;
        }
        return log.output_summary || "已完成";
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
                toast.success(log.status === "cancelled" ? `${taskLabel}已停止` : `${taskLabel}停止请求已发送`);
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
                    scheduleNextPoll(getPollingDelay(
                        pageVisibleRef.current,
                        failureCount,
                        TASK_MONITOR_VISIBLE_INTERVAL_MS,
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
            setActivePage("assistant");
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
                            content: `发送失败：${payload.message}`,
                            streamStatus: "error",
                            sourceRunType: "stream",
                            frontendDebug: buildFrontendDebugPayload(),
                        }));
                        toast.error(`发送失败：${payload.message}`);
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
                    loadDashboard(),
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
                toast.success("已停止助手生成");
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
            toast.error("当前没有可复制的发布文案");
            return;
        }
        try {
            await navigator.clipboard.writeText(currentPublishText);
            toast.success("发布文案已复制");
        } catch (error) {
            toast.error(`复制失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }

    function openCreatePosition() {
        setPositionDialogMode("create");
        setPositionForm(emptyPositionForm());
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
            jdSkillIds: positionDetail.position.jd_skill_ids || [],
            screeningSkillIds: positionDetail.position.screening_skill_ids || [],
            interviewSkillIds: positionDetail.position.interview_skill_ids || [],
        });
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
        }
    }

    function validatePositionForm(form: PositionFormState): PositionFormErrors {
        const errors: PositionFormErrors = {};
        const title = form.title.trim();
        const headcountText = form.headcount.trim();
        const headcountValue = Number(headcountText || "0");

        if (!title) {
            errors.title = "请输入岗位名称";
        } else if (title.length > 200) {
            errors.title = "岗位名称不能超过 200 个字符";
        }

        if (!headcountText) {
            errors.headcount = "请输入招聘人数";
        } else if (!/^\d+$/.test(headcountText)) {
            errors.headcount = "招聘人数只能填写正整数";
        } else if (!Number.isInteger(headcountValue) || headcountValue < 1 || headcountValue > 999) {
            errors.headcount = "招聘人数需在 1 到 999 之间";
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
                toast.success("岗位已创建");
            } else if (selectedPositionId) {
                await recruitmentApi<PositionSummary>(`/positions/${selectedPositionId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("岗位已更新");
            }
            setPositionDialogOpen(false);
            await refreshCoreData();
            if (targetPositionId) {
                await loadPositionDetail(targetPositionId);
            }
            setActivePage("positions");
        } catch (error) {
            setPositionFormSubmitError(`保存岗位失败：${error instanceof Error ? error.message : "未知错误"}`);
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
            toast.success("\u5c97\u4f4d\u5df2\u5220\u9664");
            setPositionDeleteConfirmOpen(false);
            setPositionDetail(null);
            setSelectedPositionId(null);
            try {
                await Promise.all([loadPositions(), loadDashboard(), loadCandidates(), loadLogs()]);
            } catch (refreshError) {
                toast.error(`\u5c97\u4f4d\u5df2\u5220\u9664\uff0c\u4f46\u9875\u9762\u5237\u65b0\u5931\u8d25\uff1a${formatActionError(refreshError)}`);
            }
        } catch (error) {
            toast.error(`\u5220\u9664\u5c97\u4f4d\u5931\u8d25\uff1a${formatActionError(error)}`);
        } finally {
            setPositionDeleting(false);
        }
    }

    async function generateJD() {
        if (!selectedPositionId) {
            return;
        }
        const positionId = selectedPositionId;
        if (currentPositionJDTaskId) {
            if (isCurrentJDTaskCancelling) {
                return;
            }
            setJdGenerationStatus("cancelling");
            try {
                const log = await cancelTaskGeneration(currentPositionJDTaskId, "JD 生成");
                if (log?.status === "cancelled") {
                    stopTaskMonitor(currentPositionJDTaskId);
                    setActiveJDTaskId((current) => (current === currentPositionJDTaskId ? null : current));
                    setActiveJDPositionId((current) => (current === positionId ? null : current));
                    setJdGenerationStatus("cancelled");
                    setJdGenerationError(log.error_message || "已停止生成");
                }
            } catch (error) {
                toast.error(`停止 JD 生成失败：${formatActionError(error)}`);
            }
            return;
        }
        if (isJDGenerating || jdGenerationInFlightRef.current) {
            return;
        }
        jdGenerationInFlightRef.current = true;
        setJdGenerationStatus("pending");
        setJdGenerationError("");
        try {
            const task = await recruitmentApi<RecruitmentTaskStartResponse>(`/positions/${positionId}/generate-jd/start`, {
                method: "POST",
                body: JSON.stringify({
                    extra_prompt: jdExtraPrompt.trim() || null,
                    auto_activate: jdDraft.autoActivate,
                }),
            });
            setActiveJDTaskId(task.task_id);
            setActiveJDPositionId(positionId);
            setJdGenerationStatus(task.status || "pending");
            await loadLogs({silent: true});
            startTaskMonitor(task.task_id, {
                onUpdate: (log) => {
                    setJdGenerationStatus(log.status || "pending");
                },
                onFinish: async (log) => {
                    if (!mountedRef.current) {
                        return;
                    }
                    setActiveJDTaskId((current) => (current === task.task_id ? null : current));
                    setActiveJDPositionId((current) => (current === positionId ? null : current));
                    if (log.status === "success" || log.status === "fallback") {
                        setJdGenerationStatus("syncing");
                        await Promise.all([
                            loadDashboard(),
                            loadLogs({silent: true}),
                            loadPositions(),
                            selectedPositionIdRef.current === positionId
                                ? loadPositionDetail(positionId)
                                : Promise.resolve(null),
                        ]);
                        setJdExtraPrompt("");
                        setJdViewMode("publish");
                        setJdGenerationStatus("idle");
                        toast.success(log.status === "fallback" ? "岗位 JD 已生成（兜底完成）" : "岗位 JD 已生成");
                        return;
                    }
                    if (log.status === "cancelled") {
                        await Promise.all([
                            loadLogs({silent: true}),
                            selectedPositionIdRef.current === positionId
                                ? loadPositionDetail(positionId)
                                : Promise.resolve(null),
                        ]);
                        setJdGenerationStatus("cancelled");
                        setJdGenerationError(log.error_message || "已停止生成");
                        toast.success("已停止 JD 生成");
                        return;
                    }
                    setJdGenerationStatus("failed");
                    setJdGenerationError(log.error_message || "未知错误");
                    await loadLogs({silent: true});
                    toast.error(`生成 JD 失败：${log.error_message || "未知错误"}`);
                },
            });
            toast.success("已开始生成 JD，可随时停止");
        } catch (error) {
            setJdGenerationStatus("failed");
            setJdGenerationError(error instanceof Error ? error.message : "未知错误");
            toast.error(`生成 JD 失败：${error instanceof Error ? error.message : "未知错误"}`);
        } finally {
            jdGenerationInFlightRef.current = false;
        }
    }

    async function saveJDVersion() {
        if (!selectedPositionId) {
            return;
        }
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
            toast.success("JD 新版本已保存");
            await Promise.all([loadPositionDetail(selectedPositionId), loadDashboard(), loadPositions()]);
            setJdViewMode("publish");
        } catch (error) {
            toast.error(`保存 JD 失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }

    async function activateJDVersion(versionId: number) {
        if (!selectedPositionId) {
            return;
        }
        try {
            await recruitmentApi<JDVersion>(`/positions/${selectedPositionId}/jd-versions/${versionId}/activate`, {
                method: "POST",
            });
            toast.success("已切换生效版本");
            await Promise.all([loadPositionDetail(selectedPositionId), loadDashboard(), loadPositions()]);
        } catch (error) {
            toast.error(`切换 JD 版本失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }

    async function submitPublishTask() {
        if (!selectedPositionId) {
            return;
        }
        try {
            await recruitmentApi("/publish-tasks", {
                method: "POST",
                body: JSON.stringify({
                    position_id: selectedPositionId,
                    target_platform: publishPlatform,
                    mode: publishMode,
                }),
            });
            toast.success("发布任务已创建");
            setPublishDialogOpen(false);
            await Promise.all([loadPositionDetail(selectedPositionId), loadLogs()]);
        } catch (error) {
            toast.error(`创建发布任务失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }

    async function uploadResumes() {
        if (!resumeUploadFiles.length) {
            toast.error("请先选择要上传的简历文件");
            return;
        }
        const formData = new FormData();
        resumeUploadFiles.forEach((file) => formData.append("files", file));
        const query = buildQuery({
            position_id: resumeUploadPositionId === "all" ? null : resumeUploadPositionId,
        });
        try {
            const uploaded = await recruitmentApi<Array<{
                id: number;
                auto_screen_enabled?: boolean;
                auto_screen_started?: boolean;
                auto_screen_task_id?: number | null;
                auto_screen_task_status?: string | null;
                auto_screen_error?: string | null;
            }>>(`/candidates/upload-resumes${query}`, {
                method: "POST",
                body: formData,
            });
            const startedCount = uploaded.filter((item) => item.auto_screen_started).length;
            const failedCount = uploaded.filter((item) => item.auto_screen_enabled && !item.auto_screen_started).length;
            uploaded.forEach((item) => {
                if (item.auto_screen_started && item.auto_screen_task_id) {
                    attachScreeningTaskMonitor(item.id, item.auto_screen_task_id, {
                        suppressFinishToast: true,
                    });
                }
            });
            if (startedCount > 0) {
                toast.success(`已上传 ${uploaded.length} 份简历，其中 ${startedCount} 份已自动开始初筛${failedCount > 0 ? `，${failedCount} 份启动失败` : ""}。`);
            } else {
                toast.success("简历已上传。若岗位已开启自动初筛，系统会继续执行初筛；否则可在候选人页手动开始初筛。");
            }
            setResumeUploadOpen(false);
            setResumeUploadFiles([]);
            await refreshCoreData();
            setActivePage("candidates");
        } catch (error) {
            toast.error(`上传简历失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }

    function openResumeUploadDialog() {
        if (activePage === "positions" && selectedPositionId) {
            setResumeUploadPositionId(String(selectedPositionId));
        } else {
            setResumeUploadPositionId("all");
        }
        setResumeUploadOpen(true);
    }

    async function saveCandidate() {
        if (!selectedCandidateId) {
            return;
        }
        try {
            await recruitmentApi(`/candidates/${selectedCandidateId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    name: candidateEditor.name.trim(),
                    phone: candidateEditor.phone.trim() || null,
                    email: candidateEditor.email.trim() || null,
                    current_company: candidateEditor.currentCompany.trim() || null,
                    years_of_experience: candidateEditor.yearsOfExperience.trim() || null,
                    education: candidateEditor.education.trim() || null,
                    notes: candidateEditor.notes.trim() || null,
                    tags: splitTags(candidateEditor.tagsText),
                    manual_override_score: candidateEditor.manualOverrideScore.trim()
                        ? Number(candidateEditor.manualOverrideScore)
                        : null,
                    manual_override_reason: candidateEditor.manualOverrideReason.trim() || null,
                }),
            });
            toast.success("候选人信息已更新");
            await Promise.all([loadCandidateDetail(selectedCandidateId), loadCandidates(), loadDashboard()]);
        } catch (error) {
            toast.error(`保存候选人失败：${error instanceof Error ? error.message : "未知错误"}`);
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
            toast.success("候选人状态已更新");
            setStatusUpdateReason("");
            await Promise.all([loadCandidateDetail(selectedCandidateId), loadCandidates(), loadDashboard()]);
        } catch (error) {
            toast.error(`更新状态失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }

    async function triggerScreening(targetCandidateIds?: number[]) {
        const isBatchRequest = Boolean(targetCandidateIds?.length);
        if (isBatchRequest && activeBatchScreeningTaskIds.length) {
            if (isBatchScreeningCancelling) {
                return;
            }
            try {
                const logs = await Promise.all(activeBatchScreeningTaskIds.map((taskId) => cancelTaskGeneration(taskId, "批量初筛", {silent: true})));
                const cancelledTaskIds = logs
                    .filter((log): log is AITaskLog => Boolean(log && log.status === "cancelled"))
                    .map((log) => log.id);
                if (cancelledTaskIds.length) {
                    cancelledTaskIds.forEach((taskId) => stopTaskMonitor(taskId));
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
                    toast.success(`已停止 ${cancelledTaskIds.length} 个批量初筛任务`);
                } else if (logs.some((log) => log?.status === "cancelling")) {
                    toast.success("批量初筛停止请求已发送");
                }
            } catch (error) {
                toast.error(`停止批量初筛失败：${formatActionError(error)}`);
            }
            return;
        }
        if (!isBatchRequest && selectedCandidateScreeningTaskId) {
            if (isSelectedCandidateScreeningCancelling) {
                return;
            }
            try {
                const log = await cancelTaskGeneration(selectedCandidateScreeningTaskId, "初筛");
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
                toast.error(`停止初筛失败：${formatActionError(error)}`);
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
            toast.error("请先选择需要初筛的候选人");
            return;
        }
        screeningLaunchInFlightRef.current = true;
        setScreeningSubmitting(true);
        const failures: string[] = [];
        const startedTaskIds: number[] = [];
        try {
            for (const candidateId of candidateIds) {
                try {
                    const task = await recruitmentApi<RecruitmentTaskStartResponse>(`/candidates/${candidateId}/screen/start`, {
                        method: "POST",
                        body: JSON.stringify({
                            skill_ids: [],
                            use_candidate_memory: true,
                            use_position_skills: true,
                        }),
                    });
                    startedTaskIds.push(task.task_id);
                    attachScreeningTaskMonitor(candidateId, task.task_id, {
                        batch: isBatchRequest,
                        suppressFinishToast: isBatchRequest,
                    });
                } catch (error) {
                    failures.push(`候选人 #${candidateId}: ${error instanceof Error ? error.message : "未知错误"}`);
                }
            }
            if (failures.length) {
                toast.error(`初筛完成，但有 ${failures.length} 份失败：${failures[0]}`);
            } else if (startedTaskIds.length) {
                toast.success(candidateIds.length > 1 ? `已开始 ${candidateIds.length} 份初筛，可随时停止` : "已开始初筛，可随时停止");
            } else {
                toast.error("没有成功启动任何初筛任务");
            }
        } finally {
            screeningLaunchInFlightRef.current = false;
            if (!startedTaskIds.length) {
                setScreeningSubmitting(false);
            }
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
                const log = await cancelTaskGeneration(currentCandidateInterviewTaskId, "面试题生成");
                if (log?.status === "cancelled") {
                    stopTaskMonitor(currentCandidateInterviewTaskId);
                    setActiveInterviewTaskId((current) => (current === currentCandidateInterviewTaskId ? null : current));
                    setActiveInterviewCandidateId((current) => (current === candidateId ? null : current));
                }
            } catch (error) {
                toast.error(`停止面试题生成失败：${formatActionError(error)}`);
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
                    round_name: interviewRoundName.trim() || "初试",
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
                        toast.success(log.status === "fallback" ? "面试题已生成（兜底完成）" : "面试题已生成");
                        return;
                    }
                    if (log.status === "cancelled") {
                        toast.success("已停止面试题生成");
                        return;
                    }
                    toast.error(`生成面试题失败：${log.error_message || "未知错误"}`);
                },
            });
            toast.success("已开始生成面试题，可随时停止");
        } catch (error) {
            toast.error(`生成面试题失败：${error instanceof Error ? error.message : "未知错误"}`);
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
                    const log = await cancelTaskGeneration(activeChatTaskId, "AI 助手");
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
                    toast.error(`停止助手生成失败：${formatActionError(error)}`);
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
                    toast.error(`本次 AI 调用已回退到兜底结果：${response.fallback_error || "未返回具体原因"}`);
                }
                await Promise.all([loadLogs({silent: true}), loadDashboard()]);
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
                    content: "助手正在思考...",
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
                            content: "正在停止生成...",
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
                    await Promise.all([loadLogs({silent: true}), loadDashboard()]);
                    if (log.status === "fallback") {
                        toast.error(`本次 AI 调用已回退到兜底结果：${log.error_message || "未返回具体原因"}`);
                    } else if (log.status === "failed") {
                        toast.error(`发送失败：${log.error_message || "未知错误"}`);
                    } else if (log.status === "cancelled") {
                        toast.success("已停止助手生成");
                    }
                },
            });
        } catch (error) {
            setChatMessages((current) => [
                ...current,
                {
                    id: `e-${Date.now()}`,
                    role: "assistant",
                    content: `发送失败：${error instanceof Error ? error.message : "未知错误"}`,
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
            toast.success("AI 助手上下文已更新");
        } catch (error) {
            chatContextRef.current = previousContext;
            setChatContext(previousContext);
            if (options?.quiet) {
                return;
            }
            toast.error(`更新助手上下文失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }

    function toggleSkillInAssistant(skillId: number) {
        const nextSkillIds = chatContext.skill_ids.includes(skillId)
            ? chatContext.skill_ids.filter((item) => item !== skillId)
            : [...chatContext.skill_ids, skillId];
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
        try {
            const inferredPreset = inferMailSenderPreset(mailSenderForm.fromEmail || mailSenderForm.username);
            const smtpHost = mailSenderForm.smtpHost.trim() || inferredPreset?.smtpHost || "";
            const smtpPort = Number(mailSenderForm.smtpPort || inferredPreset?.smtpPort || "465");
            const useSsl = mailSenderForm.smtpHost.trim() ? mailSenderForm.useSsl : (inferredPreset?.useSsl ?? mailSenderForm.useSsl);
            const useStarttls = mailSenderForm.smtpHost.trim() ? mailSenderForm.useStarttls : (inferredPreset?.useStarttls ?? mailSenderForm.useStarttls);
            if (!smtpHost) {
                toast.error("\u8bf7\u586b\u5199 SMTP Host\uff1b163 \u5e38\u7528 smtp.163.com\uff0cOutlook \u5e38\u7528 smtp-mail.outlook.com");
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
                toast.success("\u53d1\u4ef6\u7bb1\u5df2\u66f4\u65b0");
            } else {
                await recruitmentApi(`/mail-senders`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("\u53d1\u4ef6\u7bb1\u5df2\u521b\u5efa");
            }
            setMailSenderDialogOpen(false);
            try {
                await loadMailSettings();
            } catch (refreshError) {
                toast.error(`\u53d1\u4ef6\u7bb1\u5df2\u4fdd\u5b58\uff0c\u4f46\u90ae\u4ef6\u914d\u7f6e\u5237\u65b0\u5931\u8d25\uff1a${formatActionError(refreshError)}`);
            }
        } catch (error) {
            toast.error(`\u4fdd\u5b58\u53d1\u4ef6\u7bb1\u5931\u8d25\uff1a${formatActionError(error)}`);
        }
    }

    async function deleteMailSender(senderId: number) {
        const actionKey = `mail-sender-${senderId}`;
        setDeleteActionKey(actionKey);
        try {
            await recruitmentApi(`/mail-senders/${senderId}`, {method: "DELETE"});
            setMailSenderDeleteTarget(null);
            toast.success("发件箱已删除");
            await loadMailSettings();
        } catch (error) {
            toast.error(`删除发件箱失败：${error instanceof Error ? error.message : "未知错误"}`);
        } finally {
            setDeleteActionKey((current) => (current === actionKey ? null : current));
        }
    }

    function openMailRecipientEditor(recipient?: RecruitmentMailRecipient) {
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
                toast.success("收件人已更新");
            } else {
                await recruitmentApi(`/mail-recipients`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("收件人已创建");
            }
            setMailRecipientDialogOpen(false);
            await loadMailSettings();
        } catch (error) {
            toast.error(`保存收件人失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }

    async function deleteMailRecipient(recipientId: number) {
        const actionKey = `mail-recipient-${recipientId}`;
        setDeleteActionKey(actionKey);
        try {
            await recruitmentApi(`/mail-recipients/${recipientId}`, {method: "DELETE"});
            setMailRecipientDeleteTarget(null);
            toast.success("收件人已删除");
            await loadMailSettings();
        } catch (error) {
            toast.error(`删除收件人失败：${error instanceof Error ? error.message : "未知错误"}`);
        } finally {
            setDeleteActionKey((current) => (current === actionKey ? null : current));
        }
    }

    function openResumeMailDialog(
        candidateIds?: number[],
        overrides?: Partial<ResumeMailFormState> & { mode?: ResumeMailDialogMode; sourceDispatchId?: number | null },
    ) {
        const nextCandidateIds = Array.from(new Set(
            (candidateIds?.length
                ? candidateIds
                : (selectedCandidateIds.length ? selectedCandidateIds : (selectedCandidateId ? [selectedCandidateId] : [])))
                .filter(Boolean),
        ));
        if (!nextCandidateIds.length) {
            toast.error("请先选择需要发送的简历");
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
            toast.success(options?.successMessage || "\u7b80\u5386\u90ae\u4ef6\u5df2\u53d1\u9001");
            if (options?.closeDialog !== false) {
                setResumeMailDialogOpen(false);
            }
            try {
                await loadMailSettings();
            } catch (refreshError) {
                toast.error(`\u7b80\u5386\u90ae\u4ef6\u5df2\u53d1\u9001\uff0c\u4f46\u90ae\u4ef6\u4e2d\u5fc3\u5237\u65b0\u5931\u8d25\uff1a${formatActionError(refreshError)}`);
            }
            return dispatch;
        } catch (error) {
            toast.error(`\u53d1\u9001\u7b80\u5386\u90ae\u4ef6\u5931\u8d25\uff1a${formatActionError(error)}`);
            return null;
        }
    }

    async function confirmAssistantPreparedResumeMail(messageId: string, preparedMail: RecruitmentAssistantPreparedResumeMail) {
        if (!preparedMail.can_confirm) {
            toast.error(preparedMail.blocking_reason || "当前邮件预览还不能直接发送");
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
                    content: `已发送简历邮件。\n- 发送记录：#${dispatch.id}\n- 收件人：${dispatch.recipient_emails.join("、")}\n- 附件：${dispatch.attachment_count} 份简历`,
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
            toast.error("\u8bf7\u5148\u9009\u62e9\u9700\u8981\u53d1\u9001\u7684\u5019\u9009\u4eba");
            return;
        }
        const extraEmails = parseEmailList(resumeMailForm.extraRecipientEmails);
        if (!resumeMailForm.recipientIds.length && !extraEmails.length) {
            toast.error("请至少选择一个内部收件人或填写一个收件人邮箱");
            return;
        }
        setResumeMailSubmitting(true);
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
                            content: `${resumeMailDialogMode === "resend" ? "已再次发送简历邮件。" : "已发送简历邮件。"}\n- 发送记录：#${dispatch.id}\n- 收件人：${dispatch.recipient_emails.join("、")}\n- 附件：${dispatch.attachment_count} 份简历`,
                            createdAt: new Date().toISOString(),
                            sourceRunType: "stream",
                        },
                    ]);
                }
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
            toast.error(`打开简历失败：${error instanceof Error ? error.message : "未知错误"}`);
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
            toast.success("面试题 HTML 已开始下载");
        } catch (error) {
            toast.error(`下载面试题失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }

    function openSkillEditor(skill?: RecruitmentSkill) {
        if (skill) {
            setSkillEditingId(skill.id);
            setSkillForm({
                name: skill.name,
                description: skill.description || "",
                content: skill.content,
                tagsText: joinTags(skill.tags),
                sortOrder: String(skill.sort_order ?? 99),
                isEnabled: skill.is_enabled,
            });
        } else {
            setSkillEditingId(null);
            setSkillForm(emptySkillForm());
        }
        setSkillDialogOpen(true);
    }

    async function submitSkill() {
        if (skillSubmitting) {
            return;
        }
        setSkillSubmitting(true);
        try {
            const payload = {
                name: skillForm.name.trim(),
                description: skillForm.description.trim() || null,
                content: skillForm.content,
                tags: splitTags(skillForm.tagsText),
                sort_order: Number(skillForm.sortOrder || "99"),
                is_enabled: skillForm.isEnabled,
            };
            if (skillEditingId) {
                await recruitmentApi(`/skills/${skillEditingId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("Skill 已更新");
            } else {
                await recruitmentApi(`/skills`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("Skill 已创建");
            }
            setSkillDialogOpen(false);
            await loadSkills();
        } catch (error) {
            toast.error(`保存 Skill 失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
        setSkillSubmitting(false);
    }

    async function deleteSkill(skillId: number) {
        const actionKey = `skill-${skillId}`;
        setDeleteActionKey(actionKey);
        try {
            await recruitmentApi(`/skills/${skillId}`, {method: "DELETE"});
            setSkillDeleteTarget(null);
            toast.success("Skill 已删除");
            await loadSkills();
        } catch (error) {
            toast.error(`删除 Skill 失败：${error instanceof Error ? error.message : "未知错误"}`);
        } finally {
            setDeleteActionKey((current) => (current === actionKey ? null : current));
        }
    }

    async function toggleSkill(skillId: number, enabled: boolean) {
        try {
            await recruitmentApi(`/skills/${skillId}/toggle${buildQuery({enabled})}`, {method: "POST"});
            toast.success(enabled ? "Skill 已启用" : "Skill 已停用");
            await loadSkills();
        } catch (error) {
            toast.error(`切换 Skill 状态失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }

    function openLLMEditor(config?: RecruitmentLLMConfig) {
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
                priority: String(config.priority ?? 99),
                isActive: config.is_active,
                extraConfigText: JSON.stringify(config.extra_config || {}, null, 2),
            });
        } else {
            setLlmEditingId(null);
            setLlmForm(emptyLLMForm());
        }
        setLlmDialogOpen(true);
    }

    async function submitLLMConfig() {
        if (llmSubmitting) {
            return;
        }
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
                priority: Number(llmForm.priority || "99"),
                is_active: llmForm.isActive,
                extra_config: llmForm.extraConfigText.trim() ? JSON.parse(llmForm.extraConfigText) : {},
            };
            if (llmEditingId) {
                await recruitmentApi(`/llm-configs/${llmEditingId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success("模型配置已更新");
            } else {
                await recruitmentApi(`/llm-configs`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("模型配置已创建");
            }
            setLlmDialogOpen(false);
            await loadLLMConfigs();
        } catch (error) {
            toast.error(`保存模型配置失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
        setLlmSubmitting(false);
    }

    async function deleteLLMConfig(configId: number) {
        const actionKey = `llm-${configId}`;
        setDeleteActionKey(actionKey);
        try {
            await recruitmentApi(`/llm-configs/${configId}`, {method: "DELETE"});
            setLlmDeleteTarget(null);
            toast.success("\u6a21\u578b\u914d\u7f6e\u5df2\u5220\u9664");
            try {
                await loadLLMConfigs();
            } catch (refreshError) {
                toast.error(`\u6a21\u578b\u914d\u7f6e\u5df2\u5220\u9664\uff0c\u4f46\u5217\u8868\u5237\u65b0\u5931\u8d25\uff1a${formatActionError(refreshError)}`);
            }
        } catch (error) {
            toast.error(`\u5220\u9664\u6a21\u578b\u914d\u7f6e\u5931\u8d25\uff1a${formatActionError(error)}`);
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
            toast.success(`已切换 ${targetConfig.task_type} 的当前模型为 ${targetConfig.model_name}`);
            await loadLLMConfigs();
        } catch (error) {
            toast.error(`切换当前模型失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
    }

    function renderAssistantConsole(mode: AssistantDisplayMode = "page") {
        const isPage = mode === "page";
        const isFullscreen = mode === "fullscreen";
        const isWorkspace = mode === "workspace";
        const suggestionPrompts = [
            "生成当前岗位 JD",
            "查看当前岗位候选人",
            "重新对当前候选人初筛，硬性要求加强硬件测试",
            "给当前候选人生成面试题",
            "说明这次对话用了哪些 Skills",
            "当前使用什么模型",
        ];
        const workspaceSuggestionPrompts = [
            "帮我生成 IoT 测试工程师 JD",
            "查看当前岗位候选人列表",
            "重新对当前候选人初筛，硬性要求加强硬件测试经验",
            "给当前候选人生成初试题，重点考察硬件联调",
            "说明这次对话用了哪些 Skills 和模型",
        ];
        const quickActionPrompts = isWorkspace ? workspaceSuggestionPrompts : suggestionPrompts;
        const collapsedQuickActionPrompts = quickActionPrompts.slice(0, Math.min(3, quickActionPrompts.length));
        const visibleQuickActionPrompts = assistantQuickActionsExpanded ? quickActionPrompts : collapsedQuickActionPrompts;
        const hasMoreQuickActions = quickActionPrompts.length > collapsedQuickActionPrompts.length;
        const summaryChips = [
            {key: "position", label: shortText(chatContext.position_title || "未指定岗位", 18), dotClassName: "bg-sky-500"},
            {key: "candidate", label: shortText(chatContextCandidateLabel, 18), dotClassName: "bg-amber-500"},
            {key: "skills", label: `${chatContext.skills?.length || 0} Skills`, dotClassName: "bg-emerald-500"},
            {key: "model", label: shortText(assistantActiveLLMConfig?.resolved_model_name || assistantActiveLLMConfig?.model_name || "未识别模型", 18), dotClassName: "bg-violet-500"},
        ];
        const assistantContextPanel = (
                <div className="flex h-full min-h-0 flex-col space-y-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">上下文</p>
                            <p className="mt-1 hidden text-xs leading-5 text-slate-500 dark:text-slate-400 2xl:block">
                                按需展开岗位、Skills 和模型配置，不再长期挤压主聊天区。
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
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">当前岗位</p>
                        <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{chatContext.position_title || "未指定岗位"}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">激活 Skills</p>
                        <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{chatContext.skills?.length || 0} 项</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">当前模型</p>
                        <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{assistantActiveLLMConfig?.resolved_model_name || assistantActiveLLMConfig?.model_name || "暂未识别"}</p>
                    </div>
                </div>

                <Field label="岗位上下文">
                    <NativeSelect
                        value={chatContext.position_id ? String(chatContext.position_id) : "none"}
                        onChange={(event) => {
                            const nextPositionId = event.target.value === "none" ? null : Number(event.target.value);
                            void saveChatContext(nextPositionId, chatContext.skill_ids);
                            queueAssistantInputFocus();
                        }}
                    >
                        <option value="none">未指定岗位</option>
                        {positions.map((position) => (
                            <option key={position.id} value={position.id}>
                                {position.title}
                            </option>
                        ))}
                    </NativeSelect>
                </Field>

                <Field label="激活 Skills">
                    <div className="flex flex-wrap gap-2">
                        {skills.map((skill) => (
                            <button
                                key={skill.id}
                                type="button"
                                onMouseDown={preventAssistantActionFocusLoss}
                                onClick={() => toggleSkillInAssistant(skill.id)}
                                className={cn(
                                    "rounded-full border px-3 py-2 text-xs font-medium transition",
                                    chatContext.skill_ids.includes(skill.id)
                                        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                )}
                            >
                                {skill.name}
                            </button>
                        ))}
                    </div>
                </Field>

                <Field label="当前模型">
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
                        {!assistantModelSwitchOptions.length ? <option value="none">暂无可切换模型</option> : null}
                        {assistantModelSwitchOptions.map((config) => (
                            <option key={config.id} value={config.id}>
                                {labelForProvider(config.resolved_provider || config.provider)} / {config.resolved_model_name || config.model_name}
                            </option>
                        ))}
                    </NativeSelect>
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        先为同一任务类型添加多个已启用模型，这里就能像 GPT / Claude 一样直接切换当前使用项。
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
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">招聘助手</p>
                                </div>
                                <p className="mt-1 hidden text-xs text-slate-500 dark:text-slate-400 2xl:block">
                                    在工作台里快速切上下文、带着推荐问题打开完整助手。
                                </p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => openAssistantMode("drawer")}>
                                打开
                            </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {summaryChips.map((chip) => (
                                <button
                                    key={chip.key}
                                    type="button"
                                    onMouseDown={preventAssistantActionFocusLoss}
                                    onClick={() => openAssistantMode("drawer")}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
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
                                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-slate-100"
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
                                        {assistantQuickActionsExpanded ? "收起" : "更多"}
                                        {assistantQuickActionsExpanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                                    </Button>
                                ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => openAssistantMode("drawer")}>
                                    <Bot className="h-4 w-4"/>
                                    打开完整助手
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        setAssistantContextExpanded(true);
                                        openAssistantMode("drawer");
                                    }}
                                >
                                    上下文
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
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">招聘助手</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <Button variant={isPage ? "default" : "ghost"} size="sm" className="h-7 rounded-full px-2.5 text-xs"
                                    onClick={() => openAssistantMode("page")}>
                                页内
                            </Button>
                            <Button variant={mode === "drawer" ? "default" : "ghost"} size="sm" className="h-7 rounded-full px-2.5 text-xs"
                                    onClick={() => openAssistantMode("drawer")}>
                                浮层
                            </Button>
                            <Button variant={isFullscreen ? "default" : "ghost"} size="sm" className="h-7 rounded-full px-2.5 text-xs"
                                    onClick={() => openAssistantMode("fullscreen")}>
                                全屏
                            </Button>
                        </div>
                        <div className="flex min-w-max items-center gap-2">
                            {summaryChips.map((chip) => (
                                <button
                                    key={chip.key}
                                    type="button"
                                    onMouseDown={preventAssistantActionFocusLoss}
                                    onClick={() => setAssistantContextExpanded(true)}
                                    className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                >
                                    <span className={cn("h-2 w-2 rounded-full", chip.dotClassName)}/>
                                    <span>{chip.label}</span>
                                </button>
                            ))}
                        </div>
                        <Button
                            size="sm"
                            variant={assistantContextExpanded ? "default" : "outline"}
                            className="h-7 shrink-0 rounded-full px-2.5 text-xs"
                            onMouseDown={preventAssistantActionFocusLoss}
                            onClick={() => setAssistantContextExpanded((current) => !current)}
                        >
                            上下文
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
                                                    "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm",
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
                                                    <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
                                                        <div className="space-y-3">
                                                            <div>
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">邮件发送预览</p>
                                                                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                                                    先确认发送，再真正触发邮件发送。
                                                                </p>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <p><span className="font-medium text-slate-900 dark:text-slate-100">候选人：</span>{message.mailConfirmationRequest.candidates.map((item) => item.name).join("、")}</p>
                                                                <p><span className="font-medium text-slate-900 dark:text-slate-100">发件箱：</span>{message.mailConfirmationRequest.sender ? `${message.mailConfirmationRequest.sender.name} <${message.mailConfirmationRequest.sender.from_email}>` : "未配置"}</p>
                                                                <p><span className="font-medium text-slate-900 dark:text-slate-100">收件人：</span>{message.mailConfirmationRequest.recipients.map((item) => item.name ? `${item.name} <${item.email}>` : item.email).join("、")}</p>
                                                                <p><span className="font-medium text-slate-900 dark:text-slate-100">附件：</span>{message.mailConfirmationRequest.attachment_count} 份简历</p>
                                                            </div>
                                                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">邮件主题</p>
                                                                <p className="mt-1 whitespace-pre-wrap break-words">{message.mailConfirmationRequest.subject}</p>
                                                            </div>
                                                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">邮件正文</p>
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
                                                                    已进入编辑。你可以在弹窗里修改收件人、标题和正文后再发送。
                                                                </div>
                                                            ) : null}
                                                            {assistantMailActionState[message.id]?.status === "sent" ? (
                                                                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                                                                    已发送成功{assistantMailActionState[message.id]?.dispatchId ? `，发送记录 #${assistantMailActionState[message.id]?.dispatchId}` : ""}。
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
                                                                    {assistantMailActionState[message.id]?.status === "sent" ? "已发送" : assistantMailActionState[message.id]?.status === "sending" ? "发送中..." : "确认发送"}
                                                                </Button>
                                                                {assistantMailActionState[message.id]?.status === "sent" ? (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onMouseDown={preventAssistantActionFocusLoss}
                                                                        onClick={() => openAssistantPreparedResumeMailDialog(message.id, message.mailConfirmationRequest!, "resend")}
                                                                    >
                                                                        <Send className="h-4 w-4"/>
                                                                        再次发送
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
                                                                        编辑后发送
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : null}
                                                <p className="mt-2 text-[11px] opacity-70">{formatDateTime(message.createdAt)}</p>
                                            </div>
                                        ))}
                                        {chatSending ? (
                                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                                <Loader2 className="h-4 w-4 animate-spin"/>
                                                助手正在思考...
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
                                            回到底部
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
                                            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-slate-100"
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
                                            {assistantQuickActionsExpanded ? "收起" : "更多"}
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
                                    placeholder="例如：重新对当前候选人初筛，硬性要求加强硬件测试经验；或说明这次用了哪些 Skills"
                                />
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                    <p className="hidden text-xs text-slate-500 dark:text-slate-400 2xl:block">
                                        助手会自动携带当前岗位与启用 Skill 上下文，适合连续执行筛选、生成和查询操作。按
                                        Ctrl/Cmd + Enter 可直接发送。
                                    </p>
                                    <Button
                                        onClick={() => void sendChatMessage()}
                                        variant={canStopCurrentRun ? "outline" : "default"}
                                        disabled={isCurrentRunStopping || (!canStopCurrentRun && !chatInput.trim())}
                                    >
                                        {canStopCurrentRun ? <Square className="h-4 w-4"/> : <Send className="h-4 w-4"/>}
                                        {isCurrentRunStopping ? "停止中..." : canStopCurrentRun ? "停止生成" : "发送"}
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
        const modeLabel = assistantDisplayMode === "fullscreen" ? "全屏模式" : "宽抽屉模式";
        return (
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-8 py-10 text-center">
                <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <Bot className="h-6 w-6"/>
                </div>
                <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">助手已在{modeLabel}打开</h3>
                    <p className="max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
                        为避免背景页面和弹层同时绑定同一份输入内容，这里已暂停背景助手面板显示。当前会话内容和输入草稿仍保留在前台助手中。
                    </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                    <Button onClick={() => openAssistantMode("page")}>切回页内模式</Button>
                    <Button variant="outline" onClick={() => setAssistantOpen(false)}>关闭弹层</Button>
                </div>
            </div>
        );
    }

    function renderWorkspacePage() {
        return (
            <WorkspacePage
                dashboard={dashboard}
                todayNewResumes={todayNewResumes}
                todoSummary={todoSummary}
                recentCandidates={recentCandidates}
                recentLogs={recentLogs}
                panelClass={panelClass}
                assistantOpen={assistantOpen}
                setActivePage={setActivePage}
                setSelectedCandidateId={setSelectedCandidateId}
                setSelectedLogId={setSelectedLogId}
                openAssistantMode={openAssistantMode}
                openCreatePosition={openCreatePosition}
                setResumeUploadOpen={setResumeUploadOpen}
                renderAssistantConsole={renderAssistantConsole}
                renderAssistantSuspendedState={renderAssistantSuspendedState}
            />
        );
    }

    function renderPositionsPage() {
        return (
            <div
                className={cn(
                    "grid h-full min-h-0 items-stretch gap-4 2xl:gap-6 overflow-hidden transition-all duration-300",
                    positionListCollapsed
                        ? "xl:grid-cols-[104px_minmax(0,1fr)] 2xl:grid-cols-[116px_minmax(0,1fr)]"
                        : "xl:grid-cols-[148px_minmax(0,1fr)] 2xl:grid-cols-[164px_minmax(0,1fr)]",
                )}
            >
                <div className="relative min-h-0">
                    <Card className={cn(panelClass, "h-full min-h-0 overflow-hidden")}>
                        <CardHeader className="space-y-0 px-4 pb-0 pt-4">
                            {positionListCollapsed ? (
                                <div className="flex items-center justify-center">
                                    <CardTitle className="text-[16px] font-semibold tracking-tight whitespace-nowrap">岗位</CardTitle>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="min-w-0">
                                        <CardTitle className="text-[18px] font-semibold tracking-tight whitespace-nowrap">
                                            岗位列表 ({positions.length})
                                        </CardTitle>
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
                        <CardContent className="flex min-h-0 flex-1 flex-col space-y-2 pt-3">
                            {!positionListCollapsed ? (
                                <>
                                    <SearchField
                                        value={positionQuery}
                                        onChange={setPositionQuery}
                                        placeholder="筛选"
                                        inputClassName="h-9 rounded-xl border-slate-200/80 bg-slate-50/70 text-sm shadow-none dark:border-slate-800 dark:bg-slate-900/60"
                                    />
                                    <NativeSelect
                                        value={positionStatusFilter}
                                        className="h-9 rounded-xl border-slate-200/80 bg-slate-50/70 text-sm shadow-none dark:border-slate-800 dark:bg-slate-900/60"
                                        onChange={(event) => setPositionStatusFilter(event.target.value)}
                                    >
                                        <option value="all">全部状态</option>
                                        {Object.entries(positionStatusLabels).map(([value, label]) => (
                                            <option key={value} value={value}>
                                                {label}
                                            </option>
                                        ))}
                                    </NativeSelect>
                                </>
                            ) : null}
                            <div className={cn(
                                "min-h-0 flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0",
                                positionListCollapsed ? "" : "-mx-2 px-2",
                            )}>
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
                                                positionListCollapsed ? "rounded-[18px] px-2.5 py-2.5" : "rounded-2xl px-3 py-3",
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
                                                <div className="space-y-1.5">
                                                    <p className="line-clamp-2 text-[13px] font-semibold leading-5">{position.title}</p>
                                                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                                                        <Badge
                                                            className={cn("rounded-full border px-2 py-0 text-[10px]", selectedPositionId === position.id ? "border-white/20 bg-white/10 text-white dark:border-slate-300 dark:bg-slate-200 dark:text-slate-900" : statusBadgeClass("position", position.status))}>
                                                            {labelForPositionStatus(position.status)}
                                                        </Badge>
                                                        <span className="text-[11px] font-medium leading-none">
                                                            候选人 {position.candidate_count}
                                                        </span>
                                                    </div>
                                                    <p
                                                        className="truncate text-[11px] leading-5 text-slate-500 dark:text-slate-400"
                                                        title={`${position.department || "未设置部门"} · ${position.location || "未设置地点"}`}
                                                    >
                                                        {position.department || "未设置部门"} · {position.location || "未设置地点"}
                                                    </p>
                                                </div>
                                            )}
                                        </button>
                                    )) : (
                                        <EmptyState title="暂无岗位" description="先新建一个岗位，再由 AI 生成 JD 并进入招聘流程。"/>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setPositionListCollapsed((current) => !current)}
                        className="absolute right-0 top-1/2 z-20 h-10 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border-slate-200/80 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
                        title={positionListCollapsed ? "展开岗位列表" : "收起岗位列表"}
                    >
                        {positionListCollapsed ? <ChevronRight className="h-3.5 w-3.5"/> : <ChevronLeft className="h-3.5 w-3.5"/>}
                    </Button>
                </div>

                <div className="min-h-0 overflow-hidden">
                    {positionDetailLoading ? <LoadingPanel label="正在加载岗位详情"/> : positionDetail ? (
                        <div className="flex h-full min-h-0 flex-col gap-4 2xl:gap-6">
                            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-2.5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
                                <Badge className={cn("rounded-full border", statusBadgeClass("position", positionDetail.position.status))}>
                                    {labelForPositionStatus(positionDetail.position.status)}
                                </Badge>
                                <h2 className="text-[1.15rem] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                    {positionDetail.position.title}
                                </h2>
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {positionDetail.position.location || "未设置地点"} · {positionDetail.position.employment_type || "未设置用工类型"} · {positionDetail.position.salary_range || "未设置薪资"}
                                </span>
                            </div>

                            <div
                                className={cn(
                                    "grid min-h-0 gap-4 2xl:gap-6 xl:flex-1",
                                    positionSecondaryPanelOpen
                                        ? "xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_336px]"
                                        : "grid-cols-1",
                                )}
                            >
                                <div className="min-h-0 space-y-4 overflow-y-auto xl:pr-2 xl:[scrollbar-gutter:stable] 2xl:space-y-6">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex flex-wrap gap-2">
                                                <Button size="sm" variant={positionWorkspaceView === "jd" ? "default" : "outline"} onClick={() => setPositionWorkspaceView("jd")}>
                                                    当前 JD
                                                </Button>
                                                <Button size="sm" variant={positionWorkspaceView === "config" ? "default" : "outline"} onClick={() => setPositionWorkspaceView("config")}>
                                                    岗位配置
                                                </Button>
                                            </div>
                                            <Button size="sm" variant="outline" onClick={() => setPositionSecondaryPanelOpen((current) => !current)}>
                                                {positionSecondaryPanelOpen ? "收起次级区" : "版本与关联"}
                                            </Button>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                                            <span>招聘人数 {positionDetail.position.headcount}</span>
                                            <span>JD 版本 {positionDetail.jd_versions.length}</span>
                                            <span>候选人 {positionDetail.candidates.length}</span>
                                            <span>最近更新 {formatDateTime(positionDetail.position.updated_at)}</span>
                                        </div>
                                    </div>

                                    {positionWorkspaceView === "jd" ? (
                                        <Card className={panelClass}>
                                            <CardHeader className="space-y-3">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="space-y-2">
                                                        <CardTitle className="text-lg">当前 JD</CardTitle>
                                                        <div className="flex flex-wrap gap-2">
                                                            <Badge className={cn("rounded-full border", statusBadgeClass("task", currentJDGenerationStatus === "syncing" ? "running" : currentJDGenerationStatus))}>
                                                                {labelForJDGenerationStatus(currentJDGenerationStatus)}
                                                            </Badge>
                                                            <Badge variant="outline" className="rounded-full">
                                                                当前版本 {currentJDVersion ? `V${currentJDVersion.version_no}` : "未生成"}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button
                                                            size="sm"
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
                                                        <Button
                                                            size="sm"
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
                                                            size="sm"
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
                                                    </div>
                                                </div>
                                                <div className="grid gap-3 md:grid-cols-3">
                                                    <InfoTile label="最近生成时间" value={formatLongDateTime(positionDetail.jd_generation?.last_generated_at || currentJDVersion?.created_at)}/>
                                                    <InfoTile label="当前生效版本" value={currentJDVersion ? `${currentJDVersion.title} · V${currentJDVersion.version_no}` : "暂无生效版本"}/>
                                                    <InfoTile label="最近使用模型" value={positionDetail.jd_generation?.model_name || positionDetail.jd_generation?.model_provider || "暂未记录"}/>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                <Field label="AI 生成附加要求">
                                                    <Textarea
                                                        value={jdExtraPrompt}
                                                        onChange={(event) => setJdExtraPrompt(event.target.value)}
                                                        rows={3}
                                                        placeholder="补充本次 JD 生成时的个性化要求，例如强调 IoT 场景、自动化测试、设备联调经验等。"
                                                    />
                                                </Field>

                                                <div className="grid gap-4 lg:grid-cols-2">
                                                    <Field label="版本标题">
                                                        <Input
                                                            value={jdDraft.title}
                                                            onChange={(event) => setJdDraft((current) => ({
                                                                ...current,
                                                                title: event.target.value,
                                                            }))}
                                                        />
                                                    </Field>
                                                    <Field label="版本备注">
                                                        <Input
                                                            value={jdDraft.notes}
                                                            onChange={(event) => setJdDraft((current) => ({
                                                                ...current,
                                                                notes: event.target.value,
                                                            }))}
                                                            placeholder="例如：偏向 IoT 自动化测试"
                                                        />
                                                    </Field>
                                                </div>

                                                {latestJDGenerationError ? (
                                                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                                                        最近一次生成失败：{latestJDGenerationError}
                                                    </div>
                                                ) : null}

                                                {isJDGenerating ? (
                                                    <div className="rounded-[22px] border border-sky-200 bg-sky-50/80 px-5 py-5 dark:border-sky-900 dark:bg-sky-950/30">
                                                        <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-200">
                                                            <Loader2 className="h-4 w-4 animate-spin"/>
                                                            {jdGenerationStatus === "syncing"
                                                                ? "正在同步最新 JD 到页面..."
                                                                : currentJDGenerationStatus === "cancelling"
                                                                    ? "正在停止 JD 生成..."
                                                                    : "正在生成 JD，请稍候..."}
                                                        </div>
                                                        <div className="mt-4 grid gap-3">
                                                            <div className="h-4 rounded-full bg-sky-100 dark:bg-sky-900/60"/>
                                                            <div className="h-4 w-11/12 rounded-full bg-sky-100 dark:bg-sky-900/60"/>
                                                            <div className="h-24 rounded-[18px] bg-white/80 dark:bg-slate-900/70"/>
                                                        </div>
                                                    </div>
                                                ) : null}

                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button variant={jdViewMode === "publish" ? "default" : "outline"} size="sm" onClick={() => setJdViewMode("publish")}>
                                                            可直接发布版
                                                        </Button>
                                                        <Button variant={jdViewMode === "markdown" ? "default" : "outline"} size="sm" onClick={() => setJdViewMode("markdown")}>
                                                            Markdown 源文本
                                                        </Button>
                                                        <Button variant={jdViewMode === "preview" ? "default" : "outline"} size="sm" onClick={() => setJdViewMode("preview")}>
                                                            预览版
                                                        </Button>
                                                    </div>
                                                    <Button variant="outline" size="sm" onClick={() => void copyPublishJDText()} disabled={!currentPublishText.trim()}>
                                                        <ClipboardCheck className="h-4 w-4"/>
                                                        一键复制发布文案
                                                    </Button>
                                                </div>

                                                {jdViewMode === "publish" ? (
                                                    <div className="min-h-[360px] whitespace-pre-wrap rounded-2xl border border-slate-200/80 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                                                        {currentPublishText || "当前还没有可直接发布的 JD 文案，点击“AI 生成 JD”后会在这里展示。"}
                                                    </div>
                                                ) : null}

                                                {jdViewMode === "markdown" ? (
                                                    <Field label="JD Markdown 源文本">
                                                        <Textarea
                                                            value={jdDraft.jdMarkdown}
                                                            onChange={(event) => setJdDraft((current) => ({
                                                                ...current,
                                                                jdMarkdown: event.target.value,
                                                            }))}
                                                            rows={20}
                                                        />
                                                    </Field>
                                                ) : null}

                                                {jdViewMode === "preview" ? (
                                                    <Field label="预览版">
                                                        <div
                                                            className="min-h-[360px] rounded-2xl border border-slate-200/80 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                                            dangerouslySetInnerHTML={{__html: currentPreviewHtml}}
                                                        />
                                                    </Field>
                                                ) : null}

                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={jdDraft.autoActivate}
                                                            onChange={(event) => setJdDraft((current) => ({
                                                                ...current,
                                                                autoActivate: event.target.checked,
                                                            }))}
                                                        />
                                                        保存后设为生效版本
                                                    </label>
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button variant="outline" onClick={() => void generateJD()} disabled={isCurrentJDTaskCancelling || currentJDGenerationStatus === "cancelling"}>
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
                                    ) : (
                                        <Card className={panelClass}>
                                            <CardHeader className="space-y-3">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <CardTitle className="text-lg">岗位配置</CardTitle>
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button variant="outline" size="sm" onClick={openEditPosition}>
                                                            <FilePlus2 className="h-4 w-4"/>
                                                            编辑岗位
                                                        </Button>
                                                        <Button variant="outline" size="sm" onClick={() => setPublishDialogOpen(true)}>
                                                            <Rocket className="h-4 w-4"/>
                                                            发布岗位
                                                        </Button>
                                                        <Button variant="outline" size="sm" onClick={() => setPositionDeleteConfirmOpen(true)} disabled={positionDeleting}>
                                                            <Trash2 className="h-4 w-4"/>
                                                            {positionDeleting ? "删除中..." : "删除岗位"}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-5">
                                                <Field label="岗位基础信息">
                                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                                        <InfoTile label="部门" value={positionDetail.position.department || "未设置部门"}/>
                                                        <InfoTile label="地点 / 用工类型" value={`${positionDetail.position.location || "未设置地点"} · ${positionDetail.position.employment_type || "未设置用工类型"}`}/>
                                                        <InfoTile label="薪资 / 招聘人数" value={`${positionDetail.position.salary_range || "未设置薪资"} · ${positionDetail.position.headcount} 人`}/>
                                                        <InfoTile label="标签" value={joinTags(positionDetail.position.tags) || "未设置"}/>
                                                        <InfoTile label="关键要求" value={shortText(positionDetail.position.key_requirements, 120)}/>
                                                        <InfoTile label="加分项" value={shortText(positionDetail.position.bonus_points, 120)}/>
                                                    </div>
                                                </Field>

                                                <Field label="Skill 与自动化配置">
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        <InfoTile label="JD 生成 Skill" value={formatSkillNames(positionDetail.position.jd_skill_ids || [], skillMap)}/>
                                                        <InfoTile label="初筛绑定 Skills" value={formatSkillNames(positionDetail.position.screening_skill_ids || [], skillMap)}/>
                                                        <InfoTile label="面试题 Skill" value={formatSkillNames(positionDetail.position.interview_skill_ids || [], skillMap)}/>
                                                        <InfoTile label="自动流程" value={`${positionDetail.position.auto_screen_on_upload ? "上传自动初筛已开启" : "上传自动初筛未开启"} · ${positionDetail.position.auto_advance_on_screening === false ? "通过后自动推进关闭" : "通过后自动推进开启"}`}/>
                                                    </div>
                                                </Field>

                                                <Field label="岗位摘要">
                                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 text-sm leading-7 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                                                        {positionDetail.position.summary || "这个岗位还没有补充摘要，建议先由招聘同事或 AI 完善岗位背景和关键目标。"}
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
                                                <CardTitle className="text-lg">JD 历史版本</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                {positionDetail.jd_versions.length ? positionDetail.jd_versions.map((version) => (
                                                    <div key={version.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">{version.title}</p>
                                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                                    V{version.version_no} · {formatDateTime(version.created_at)}
                                                                </p>
                                                            </div>
                                                            <Badge className={cn("rounded-full border", version.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                                                                {version.is_active ? "当前生效" : "历史版本"}
                                                            </Badge>
                                                        </div>
                                                        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{shortText(version.notes || version.prompt_snapshot || version.jd_markdown, 110)}</p>
                                                        {!version.is_active ? (
                                                            <Button size="sm" variant="outline" className="mt-3" onClick={() => void activateJDVersion(version.id)}>
                                                                切换为当前版本
                                                            </Button>
                                                        ) : null}
                                                    </div>
                                                )) : (
                                                    <EmptyState title="暂无 JD 版本" description="点击 AI 生成 JD 或保存新版本后，这里会形成完整版本轨迹。"/>
                                                )}
                                            </CardContent>
                                        </Card>

                                        <Card className={panelClass}>
                                            <CardHeader className="space-y-2">
                                                <CardTitle className="text-lg">关联候选人</CardTitle>
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
                                                        <Badge className={cn("rounded-full border", statusBadgeClass("candidate", candidate.status))}>
                                                            {labelForCandidateStatus(candidate.status)}
                                                        </Badge>
                                                    </button>
                                                )) : (
                                                    <EmptyState title="暂无候选人" description="上传简历并关联到这个岗位后，这里会出现最新候选人列表。"/>
                                                )}
                                            </CardContent>
                                        </Card>

                                        <Card className={panelClass}>
                                            <CardHeader className="space-y-2">
                                                <CardTitle className="text-lg">发布状态</CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                {positionDetail.publish_tasks.length ? positionDetail.publish_tasks.map((task) => (
                                                    <div key={task.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div>
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">
                                                                    {task.target_platform.toUpperCase()} · {task.mode.toUpperCase()}
                                                                </p>
                                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(task.created_at)}</p>
                                                            </div>
                                                            <Badge className={cn("rounded-full border", statusBadgeClass("task", task.status))}>
                                                                {labelForTaskExecutionStatus(task.status)}
                                                            </Badge>
                                                        </div>
                                                        {task.published_url ? (
                                                            <a className="mt-3 inline-flex items-center gap-1 text-sm text-sky-600 hover:underline" href={task.published_url} target="_blank" rel="noreferrer">
                                                                查看发布链接
                                                                <ExternalLink className="h-4 w-4"/>
                                                            </a>
                                                        ) : null}
                                                        {task.error_message ? <p className="mt-3 text-sm text-rose-600">{task.error_message}</p> : null}
                                                    </div>
                                                )) : (
                                                    <EmptyState title="暂无发布任务" description="先完成 JD，再创建发布任务，后续可接入真实 BOSS / 智联适配器。"/>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <EmptyState title="请选择一个岗位" description="左侧选择岗位后，右侧会进入完整的岗位详情工作区。"/>
                    )}
                </div>
            </div>
        );
    }

    function renderCandidatesPage() {
        return (
            <CandidatesPage
                panelClass={panelClass}
                candidateFiltersCollapsed={candidateFiltersCollapsed}
                candidateFilterSummary={candidateFilterSummary}
                candidateViewMode={candidateViewMode}
                setCandidateViewMode={setCandidateViewMode}
                setCandidateFiltersCollapsed={setCandidateFiltersCollapsed}
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
                isBatchScreeningCancelling={isBatchScreeningCancelling}
                screeningSubmitting={screeningSubmitting}
                isBatchScreeningRunning={isBatchScreeningRunning}
                openResumeMailDialog={openResumeMailDialog}
                candidatesLoading={candidatesLoading}
                candidateListScrollRef={candidateListScrollRef}
                candidateListHorizontalRailRef={candidateListHorizontalRailRef}
                candidateListTableWidth={candidateListTableWidth}
                renderCandidateListHeaderCell={renderCandidateListHeaderCell}
                selectedCandidateId={selectedCandidateId}
                setSelectedCandidateId={setSelectedCandidateId}
                toggleCandidateSelection={toggleCandidateSelection}
                candidateListDisplayColumnWidths={candidateListDisplayColumnWidths}
                getCandidateResumeMailSummary={getCandidateResumeMailSummary}
                groupedCandidates={groupedCandidates}
                candidateDetailLoading={candidateDetailLoading}
                candidateDetail={candidateDetail}
                isSelectedCandidateScreeningCancelling={isSelectedCandidateScreeningCancelling}
                selectedCandidateScreeningTaskId={selectedCandidateScreeningTaskId}
                openResumeFile={openResumeFile}
                generateInterviewQuestions={generateInterviewQuestions}
                isCurrentInterviewTaskCancelling={isCurrentInterviewTaskCancelling}
                currentCandidateInterviewTaskId={currentCandidateInterviewTaskId}
                candidateEditor={candidateEditor}
                setCandidateEditor={setCandidateEditor}
                saveCandidate={saveCandidate}
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
                syncInterviewPreviewHeight={syncInterviewPreviewHeight}
                interviewPreviewHeight={interviewPreviewHeight}
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
                aiLogs={aiLogs}
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
                openSkillEditor={openSkillEditor}
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
                assistantModelLabel={assistantModelLabel}
                assistantActiveLLMConfig={assistantActiveLLMConfig}
                preferredLLMConfigIds={preferredLLMConfigIds}
                openLLMEditor={openLLMEditor}
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
                mailSettingsLoading={mailSettingsLoading}
                mailRecipientMap={mailRecipientMap}
                mailSenderMap={mailSenderMap}
                candidateMap={candidateMap}
                mailDispatchActionKey={mailDispatchActionKey}
                selectedCandidateIds={selectedCandidateIds}
                selectedCandidateId={selectedCandidateId}
                openMailSenderEditor={openMailSenderEditor}
                openMailRecipientEditor={openMailRecipientEditor}
                openResumeMailDialog={openResumeMailDialog}
                openResumeMailReplayDialog={openResumeMailReplayDialog}
                retryResumeMailDispatch={retryResumeMailDispatch}
                setMailSenderDeleteTarget={setMailSenderDeleteTarget}
                setMailRecipientDeleteTarget={setMailRecipientDeleteTarget}
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

    if (bootstrapping) {
        return (
            <div
                className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_42%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_42%),linear-gradient(180deg,#020617_0%,#0f172a_100%)]">
                <div
                    className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin"/>
                    正在加载招聘工作台...
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
                        <Button variant="outline" size="sm" onClick={onBack} className="rounded-xl px-3">
                            <ArrowLeft className="h-4 w-4"/>
                            返回
                        </Button>
                        <div className="flex min-w-0 items-baseline gap-3">
                            <h1 className="shrink-0 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                                {pageMeta[activePage].title}
                            </h1>
                            <p className="hidden min-w-0 truncate text-sm text-slate-500 dark:text-slate-400 2xl:block">
                                {pageMeta[activePage].description}
                            </p>
                            <span className="sr-only">{pageMeta[activePage].title}：{pageMeta[activePage].description}</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => void refreshCoreDataWithFeedback()}
                                disabled={coreRefreshing} className="rounded-xl">
                            {coreRefreshing ? <Loader2 className="h-4 w-4 animate-spin"/> :
                                <RefreshCw className="h-4 w-4"/>}
                            {coreRefreshing ? "刷新中..." : "刷新"}
                        </Button>
                        <Button variant="outline" onClick={openResumeUploadDialog} className="rounded-xl">
                            <Upload className="h-4 w-4"/>
                            上传简历
                        </Button>
                        <Button onClick={openCreatePosition} className="rounded-xl">
                            <Plus className="h-4 w-4"/>
                            新建岗位
                        </Button>
                        <Button
                            className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                            onClick={() => openAssistantMode("drawer")}>
                            <Bot className="h-4 w-4"/>
                            打开 AI 助手
                        </Button>
                        {canManageRecruitment ? (
                            <Popover open={settingsPopoverOpen} onOpenChange={setSettingsPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="rounded-xl">
                                        <Settings2 className="h-4 w-4"/>
                                        管理设置
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end"
                                                className="w-80 rounded-2xl border-slate-200 p-2 dark:border-slate-800">
                                    <div className="space-y-1">
                                        <SettingsEntry
                                            title="Skill 管理"
                                            description="维护招聘评估和题目生成所用的 Skills。"
                                            onClick={() => navigateToSettingsPage("settings-skills")}
                                        />
                                        <SettingsEntry
                                            title="模型配置"
                                            description="按任务类型管理 provider、model、base URL 和 key。"
                                            onClick={() => navigateToSettingsPage("settings-models")}
                                        />
                                        <SettingsEntry
                                            title="邮件中心"
                                            description="维护发件箱、收件人和简历邮件发送记录。"
                                            onClick={() => navigateToSettingsPage("settings-mail")}
                                        />
                                    </div>
                                </PopoverContent>
                            </Popover>
                        ) : null}
                    </div>
                </div>
            </div>

                <div
                    className={cn(
                        "grid min-h-0 flex-1 transition-all duration-300",
                    navCollapsed ? "lg:grid-cols-[56px_minmax(0,1fr)]" : "lg:grid-cols-[176px_minmax(0,1fr)] 2xl:grid-cols-[188px_minmax(0,1fr)]",
                )}
            >
                <div className="relative min-h-0">
                    <aside
                        className={cn(
                            "flex h-full min-h-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white/70 px-2 py-3.5 backdrop-blur transition-all duration-300 dark:border-slate-800 dark:bg-slate-950/50",
                            navCollapsed ? "lg:px-1" : "lg:px-2.5",
                        )}
                    >
                        {!navCollapsed ? (
                            <div className="mb-3 flex items-center justify-center">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">工作分区</p>
                            </div>
                        ) : null}

                        <div
                            ref={primaryNavScrollRef}
                            className="min-h-0 flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0"
                        >
                            <div className="space-y-1.5">
                            <SectionNavButton
                                active={activePrimaryNavPage === "workspace"}
                                icon={FolderKanban}
                                title="工作台"
                                description="首页指标、待办、快捷操作与近期活动"
                                count={dashboard?.cards.positions_recruiting ?? 0}
                                collapsed={navCollapsed}
                                buttonRef={(node) => {
                                    primaryNavButtonRefs.current.workspace = node;
                                }}
                                onClick={() => navigatePrimaryPage("workspace")}
                            />
                            <SectionNavButton
                                active={activePrimaryNavPage === "positions"}
                                icon={BriefcaseBusiness}
                                title="岗位管理"
                                description="岗位列表 + 详情工作区 + JD 版本"
                                count={positions.length}
                                collapsed={navCollapsed}
                                buttonRef={(node) => {
                                    primaryNavButtonRefs.current.positions = node;
                                }}
                                onClick={() => navigatePrimaryPage("positions")}
                            />
                            <SectionNavButton
                                active={activePrimaryNavPage === "candidates"}
                                icon={Users}
                                title="候选人"
                                description="ATS 列表、筛选、状态推进与档案查看"
                                count={visibleCandidates.length}
                                collapsed={navCollapsed}
                                buttonRef={(node) => {
                                    primaryNavButtonRefs.current.candidates = node;
                                }}
                                onClick={() => navigatePrimaryPage("candidates")}
                            />
                            <SectionNavButton
                                active={activePrimaryNavPage === "audit"}
                                icon={History}
                                title="审计中心"
                                description="看 AI 处理记录、模型、错误与留痕"
                                count={aiLogs.length}
                                collapsed={navCollapsed}
                                buttonRef={(node) => {
                                    primaryNavButtonRefs.current.audit = node;
                                }}
                                onClick={() => navigatePrimaryPage("audit")}
                            />
                            <SectionNavButton
                                active={activePrimaryNavPage === "assistant"}
                                icon={Bot}
                                title="招聘助手"
                                description="自然语言驱动岗位、候选人和 Skill 上下文"
                                collapsed={navCollapsed}
                                buttonRef={(node) => {
                                    primaryNavButtonRefs.current.assistant = node;
                                }}
                                onClick={() => navigatePrimaryPage("assistant")}
                            />
                            </div>
                        </div>

                        <div className="shrink-0 pt-4">
                            {navCollapsed ? (
                                <div className="space-y-2">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={openCreatePosition}
                                            className="flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200/80 bg-white/85 text-slate-700 transition hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-200"
                                            title="新增岗位"
                                        >
                                            <Plus className="h-4.5 w-4.5" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="rounded-xl px-3 py-2 text-xs">
                                        新增岗位
                                    </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={openResumeUploadDialog}
                                            className="flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200/80 bg-white/85 text-slate-700 transition hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-200"
                                            title="上传简历"
                                        >
                                            <Upload className="h-4.5 w-4.5" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="rounded-xl px-3 py-2 text-xs">
                                        上传简历
                                    </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div
                                            className="flex h-11 w-full flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200"
                                            title="待筛候选人"
                                        >
                                            <span className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">待筛</span>
                                            <span className="text-sm font-semibold leading-4">{todoSummary.pendingScreening}</span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="rounded-xl px-3 py-2 text-xs">
                                        待筛候选人 {todoSummary.pendingScreening}
                                    </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div
                                            className="flex h-11 w-full flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200"
                                            title="待安排面试"
                                        >
                                            <span className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">待面</span>
                                            <span className="text-sm font-semibold leading-4">{todoSummary.pendingInterview}</span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="rounded-xl px-3 py-2 text-xs">
                                        待安排面试 {todoSummary.pendingInterview}
                                    </TooltipContent>
                                </Tooltip>
                                </div>
                            ) : (
                                <>
                                    <Separator className="mb-3" />

                                    <div
                                        className="rounded-[18px] border border-slate-200/80 bg-white/85 px-2 py-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 2xl:px-2.5 2xl:py-2"
                                    >
                                        <div className="space-y-1.5">
                                            <div>
                                                <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 2xl:text-[13px]">今日待办</p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-1.5">
                                                <div className="rounded-xl bg-slate-100/80 px-2 py-1.5 dark:bg-slate-900/80 2xl:px-2.5">
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">待发布</p>
                                                    <p className="mt-0.5 text-[18px] font-semibold leading-none text-slate-800 dark:text-slate-200 2xl:text-[20px]">
                                                        {todoSummary.pendingPublish}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl bg-slate-100/80 px-2 py-1.5 dark:bg-slate-900/80 2xl:px-2.5">
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">待初筛</p>
                                                    <p className="mt-0.5 text-[18px] font-semibold leading-none text-slate-800 dark:text-slate-200 2xl:text-[20px]">
                                                        {todoSummary.pendingScreening}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl bg-slate-100/80 px-2 py-1.5 dark:bg-slate-900/80 2xl:px-2.5">
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">待面试</p>
                                                    <p className="mt-0.5 text-[18px] font-semibold leading-none text-slate-800 dark:text-slate-200 2xl:text-[20px]">
                                                        {todoSummary.pendingInterview}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl bg-slate-100/80 px-2 py-1.5 dark:bg-slate-900/80 2xl:px-2.5">
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">待决策</p>
                                                    <p className="mt-0.5 text-[18px] font-semibold leading-none text-slate-800 dark:text-slate-200 2xl:text-[20px]">
                                                        {todoSummary.pendingDecision}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </aside>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setNavCollapsed((current) => !current)}
                        className="absolute right-0 top-1/2 z-20 h-10 w-5 -translate-y-1/2 translate-x-1/2 rounded-full border-slate-200/80 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
                        title={navCollapsed ? "展开左侧菜单" : "收起左侧菜单"}
                    >
                        {navCollapsed ? <ChevronRight className="h-3.5 w-3.5"/> : <ChevronLeft className="h-3.5 w-3.5"/>}
                    </Button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {activePage === "candidates" || activePage === "audit" || activePage === "positions" || activePage === "assistant" ? (
                        <div className="h-full min-h-0 p-4 lg:p-5 2xl:p-6">
                            {renderPage()}
                        </div>
                    ) : (
                        <ScrollArea className="h-full">
                            <div className="p-4 lg:p-5 2xl:p-6">{renderPage()}</div>
                        </ScrollArea>
                    )}
                </div>
            </div>

            <Button
                className="fixed bottom-8 right-0 z-30 h-14 translate-x-[calc(100%-14px)] rounded-l-2xl rounded-r-none bg-slate-900 pl-4 pr-3 text-white shadow-[0_20px_40px_-18px_rgba(15,23,42,0.5)] transition-[transform,background-color] duration-200 hover:translate-x-0 hover:bg-slate-800 focus-visible:translate-x-0 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                onClick={() => openAssistantMode("drawer")}
            >
                <Bot className="h-4 w-4"/>
                AI 助手
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
                        <DialogTitle>招聘助手</DialogTitle>
                        <DialogDescription>用于生成
                            JD、查看岗位候选人、筛选简历和生成面试题的招聘助手对话面板。</DialogDescription>
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
                        <DialogTitle>{positionDialogMode === "create" ? "新建岗位" : "编辑岗位"}</DialogTitle>
                        <DialogDescription>岗位基础信息放在弹窗中维护，详情操作回到岗位工作区完成。</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="space-y-4 px-1 py-1">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="岗位名称" error={positionFormErrors.title}>
                                    <Input
                                        ref={positionTitleInputRef}
                                        value={positionForm.title}
                                        maxLength={200}
                                        onChange={(event) => updatePositionFormField("title", event.target.value.slice(0, 200))}
                                    />
                                </Field>
                                <Field label="部门"><Input value={positionForm.department}
                                                           maxLength={120}
                                                           onChange={(event) => updatePositionFormField("department", event.target.value.slice(0, 120))}/></Field>
                                <Field label="地点"><Input value={positionForm.location}
                                                           maxLength={120}
                                                           onChange={(event) => updatePositionFormField("location", event.target.value.slice(0, 120))}/></Field>
                                <Field label="用工类型"><Input value={positionForm.employmentType}
                                                               maxLength={120}
                                                               onChange={(event) => updatePositionFormField("employmentType", event.target.value.slice(0, 120))}/></Field>
                                <Field label="薪资范围"><Input value={positionForm.salaryRange}
                                                               maxLength={120}
                                                               onChange={(event) => updatePositionFormField("salaryRange", event.target.value.slice(0, 120))}/></Field>
                                <Field label="招聘人数" error={positionFormErrors.headcount}>
                                    <Input
                                        ref={positionHeadcountInputRef}
                                        type="text"
                                        inputMode="numeric"
                                        value={positionForm.headcount}
                                        onChange={(event) => updatePositionFormField("headcount", event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                                        placeholder="1 - 999"
                                    />
                                </Field>
                                <Field label="岗位状态">
                                    <NativeSelect value={positionForm.status}
                                                  onChange={(event) => updatePositionFormField("status", event.target.value)}>
                                        {Object.entries(positionStatusLabels).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </NativeSelect>
                                </Field>
                                <Field label="标签"><Input value={positionForm.tagsText}
                                                           maxLength={240}
                                                           onChange={(event) => updatePositionFormField("tagsText", event.target.value.slice(0, 240))} placeholder="标签，使用英文逗号分隔"/></Field>
                                <Field label="关键要求"><Textarea value={positionForm.keyRequirements}
                                                                  maxLength={2000}
                                                                  onChange={(event) => updatePositionFormField("keyRequirements", event.target.value.slice(0, 2000))} rows={4}/></Field>
                                <Field label="加分项"><Textarea value={positionForm.bonusPoints}
                                                                maxLength={2000}
                                                                onChange={(event) => updatePositionFormField("bonusPoints", event.target.value.slice(0, 2000))} rows={4}/></Field>
                                <Field label="初筛配置" className="md:col-span-2">
                                    <div
                                        className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                        <label
                                            className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={positionForm.autoScreenOnUpload}
                                                onChange={(event) => updatePositionFormField("autoScreenOnUpload", event.target.checked)}
                                            />
                                            上传简历后自动进入初筛
                                        </label>
                                        <label
                                            className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={positionForm.autoAdvanceOnScreening}
                                                onChange={(event) => updatePositionFormField("autoAdvanceOnScreening", event.target.checked)}
                                            />
                                            初筛通过后自动推进候选人状态
                                        </label>
                                        <div className="space-y-3">
                                            <p className="text-sm text-slate-600 dark:text-slate-300">岗位可分别绑定 JD 生成、初筛、面试题三类 Skill；这里会显示全部已启用 Skill，你可以手动选择。任务标签或 frontmatter 不是必填，只会影响排序提示。每类默认不选，不选时对应链路不会传 Skills。</p>
                                            <div className="grid gap-4 xl:grid-cols-3">
                                                <div className="space-y-2">
                                                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">JD 生成 Skill</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {jdAuthoringSkills.length ? jdAuthoringSkills.map((skill) => (
                                                            <button
                                                                key={`jd-skill-${skill.id}`}
                                                                type="button"
                                                                className={cn(
                                                                    "rounded-full border px-3 py-2 text-xs transition",
                                                                    positionForm.jdSkillIds.includes(skill.id)
                                                                        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                        : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                )}
                                                                onClick={() => setPositionForm((current) => ({
                                                                    ...current,
                                                                    jdSkillIds: toggleSingleSkillId(current.jdSkillIds, skill.id),
                                                                }))}
                                                            >
                                                                {skill.name}
                                                            </button>
                                                        )) : <p className="text-sm text-slate-500 dark:text-slate-400">暂无可用 Skill</p>}
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">初筛 Skill</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {screeningAuthoringSkills.length ? screeningAuthoringSkills.map((skill) => (
                                                            <button
                                                                key={`screening-skill-${skill.id}`}
                                                                type="button"
                                                                className={cn(
                                                                    "rounded-full border px-3 py-2 text-xs transition",
                                                                    positionForm.screeningSkillIds.includes(skill.id)
                                                                        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                        : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                )}
                                                                onClick={() => setPositionForm((current) => ({
                                                                    ...current,
                                                                    screeningSkillIds: toggleSingleSkillId(current.screeningSkillIds, skill.id),
                                                                }))}
                                                            >
                                                                {skill.name}
                                                            </button>
                                                        )) : <p className="text-sm text-slate-500 dark:text-slate-400">暂无可用 Skill</p>}
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">面试题 Skill</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {interviewAuthoringSkills.length ? interviewAuthoringSkills.map((skill) => (
                                                            <button
                                                                key={`interview-skill-${skill.id}`}
                                                                type="button"
                                                                className={cn(
                                                                    "rounded-full border px-3 py-2 text-xs transition",
                                                                    positionForm.interviewSkillIds.includes(skill.id)
                                                                        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                        : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                )}
                                                                onClick={() => setPositionForm((current) => ({
                                                                    ...current,
                                                                    interviewSkillIds: toggleSingleSkillId(current.interviewSkillIds, skill.id),
                                                                }))}
                                                            >
                                                                {skill.name}
                                                            </button>
                                                        )) : <p className="text-sm text-slate-500 dark:text-slate-400">暂无可用 Skill</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Field>
                            </div>
                            <Field label="岗位摘要">
                                <Textarea value={positionForm.summary}
                                          maxLength={4000}
                                          onChange={(event) => updatePositionFormField("summary", event.target.value.slice(0, 4000))} rows={5}/>
                            </Field>
                        </div>
                    </ScrollArea>
                    <DialogFooter className="shrink-0 items-center justify-between gap-3 sm:justify-between">
                        <div className="min-h-5 flex-1 text-sm text-red-600 dark:text-red-400">
                            {positionFormSubmitError ?? ""}
                        </div>
                        <Button variant="outline" onClick={() => setPositionDialogOpen(false)}>取消</Button>
                        <Button disabled={positionSubmitting} onClick={() => void submitPosition()}>
                            {positionSubmitting ? "保存中..." : "保存岗位"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={resumeUploadOpen} onOpenChange={setResumeUploadOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>上传简历</DialogTitle>
                        <DialogDescription>支持批量上传 PDF / DOC / DOCX /
                            TXT。若岗位开启“上传自动初筛”，系统会自动进入新的初筛流程；否则可在候选人页手动触发。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Field label="关联岗位">
                            <NativeSelect value={resumeUploadPositionId}
                                          onChange={(event) => setResumeUploadPositionId(event.target.value)}>
                                <option value="all">暂不关联岗位</option>
                                {positions.map((position) => (
                                    <option key={position.id} value={position.id}>{position.title}</option>
                                ))}
                            </NativeSelect>
                        </Field>
                        <Field label="选择文件">
                            <Input type="file" multiple
                                   onChange={(event) => setResumeUploadFiles(Array.from(event.target.files || []))}/>
                        </Field>
                        <div
                            className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            已选择 {resumeUploadFiles.length} 个文件
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResumeUploadOpen(false)}>取消</Button>
                        <Button onClick={() => void uploadResumes()}>开始上传</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={positionDeleteConfirmOpen} onOpenChange={setPositionDeleteConfirmOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>确认删除岗位</DialogTitle>
                        <DialogDescription>删除后岗位会从工作台隐藏，已关联的候选人与日志仍会保留。请再确认一次。</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPositionDeleteConfirmOpen(false)}>取消</Button>
                        <Button variant="destructive" onClick={() => void deletePosition()} disabled={positionDeleting}>
                            {positionDeleting ? "删除中..." : "确认删除"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(llmDeleteTarget)} onOpenChange={(open) => {
                if (!open) setLlmDeleteTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>确认删除模型配置</DialogTitle>
                        <DialogDescription>删除后将不再参与任务路由。如果它是当前生效模型，系统会自动回落到其他可用配置。</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLlmDeleteTarget(null)}
                                disabled={deleteActionKey === `llm-${llmDeleteTarget?.id}`}>取消</Button>
                        <Button variant="destructive"
                                onClick={() => llmDeleteTarget && void deleteLLMConfig(llmDeleteTarget.id)}
                                disabled={deleteActionKey === `llm-${llmDeleteTarget?.id}`}>
                            {deleteActionKey === `llm-${llmDeleteTarget?.id}` ? "删除中..." : "确认删除"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(skillDeleteTarget)} onOpenChange={(open) => {
                if (!open) setSkillDeleteTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>确认删除 Skill</DialogTitle>
                        <DialogDescription>删除后该规则将不再参与新的招聘流程，但历史对话和任务日志仍会保留这次使用痕迹。</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSkillDeleteTarget(null)}
                                disabled={deleteActionKey === `skill-${skillDeleteTarget?.id}`}>取消</Button>
                        <Button variant="destructive"
                                onClick={() => skillDeleteTarget && void deleteSkill(skillDeleteTarget.id)}
                                disabled={deleteActionKey === `skill-${skillDeleteTarget?.id}`}>
                            {deleteActionKey === `skill-${skillDeleteTarget?.id}` ? "删除中..." : "确认删除"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(mailSenderDeleteTarget)} onOpenChange={(open) => {
                if (!open) setMailSenderDeleteTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>确认删除发件箱</DialogTitle>
                        <DialogDescription>删除后它将无法继续发送简历邮件；已有发送记录会继续保留。</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMailSenderDeleteTarget(null)}
                                disabled={deleteActionKey === `mail-sender-${mailSenderDeleteTarget?.id}`}>取消</Button>
                        <Button variant="destructive"
                                onClick={() => mailSenderDeleteTarget && void deleteMailSender(mailSenderDeleteTarget.id)}
                                disabled={deleteActionKey === `mail-sender-${mailSenderDeleteTarget?.id}`}>
                            {deleteActionKey === `mail-sender-${mailSenderDeleteTarget?.id}` ? "删除中..." : "确认删除"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(mailRecipientDeleteTarget)} onOpenChange={(open) => {
                if (!open) setMailRecipientDeleteTarget(null);
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>确认删除收件人</DialogTitle>
                        <DialogDescription>删除后发送简历时将不再出现在可选名单里，历史发送记录不会受影响。</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMailRecipientDeleteTarget(null)}
                                disabled={deleteActionKey === `mail-recipient-${mailRecipientDeleteTarget?.id}`}>取消</Button>
                        <Button variant="destructive"
                                onClick={() => mailRecipientDeleteTarget && void deleteMailRecipient(mailRecipientDeleteTarget.id)}
                                disabled={deleteActionKey === `mail-recipient-${mailRecipientDeleteTarget?.id}`}>
                            {deleteActionKey === `mail-recipient-${mailRecipientDeleteTarget?.id}` ? "删除中..." : "确认删除"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>创建发布任务</DialogTitle>
                        <DialogDescription>首期保留 mock / adapter
                            架构，不把平台发布能力写死在业务主流程里。</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4">
                        <Field label="目标平台">
                            <NativeSelect value={publishPlatform}
                                          onChange={(event) => setPublishPlatform(event.target.value)}>
                                <option value="boss">BOSS 直聘</option>
                                <option value="zhilian">智联招聘</option>
                            </NativeSelect>
                        </Field>
                        <Field label="执行模式">
                            <NativeSelect value={publishMode} onChange={(event) => setPublishMode(event.target.value)}>
                                <option value="mock">Mock</option>
                                <option value="api">API</option>
                                <option value="rpa">RPA / Playwright</option>
                            </NativeSelect>
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>取消</Button>
                        <Button onClick={() => void submitPublishTask()}>创建任务</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={skillDialogOpen} onOpenChange={setSkillDialogOpen}>
                <DialogContent className="flex h-[min(88vh,840px)] max-h-[88vh] flex-col overflow-hidden sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{skillEditingId ? "编辑 Skill" : "新增 Skill"}</DialogTitle>
                        <DialogDescription>Skills
                            是管理员配置项，因此入口收在管理设置里，不占用主工作台主路径。</DialogDescription>
                    </DialogHeader>
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-1 py-1">
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="名称"><Input value={skillForm.name}
                                                       onChange={(event) => setSkillForm((current) => ({
                                                           ...current,
                                                           name: event.target.value
                                                       }))}/></Field>
                            <Field label="排序"><Input type="number" value={skillForm.sortOrder}
                                                       onChange={(event) => setSkillForm((current) => ({
                                                           ...current,
                                                           sortOrder: event.target.value
                                                       }))}/></Field>
                        </div>
                        <Field label="描述"><Input value={skillForm.description}
                                                   onChange={(event) => setSkillForm((current) => ({
                                                       ...current,
                                                       description: event.target.value
                                                   }))}/></Field>
                        <Field label="标签"><Input value={skillForm.tagsText}
                                                   onChange={(event) => setSkillForm((current) => ({
                                                       ...current,
                                                       tagsText: event.target.value
                                                   }))} placeholder="标签，使用英文逗号分隔"/></Field>
                        <Field label="内容" className="flex min-h-0 flex-1 flex-col">
                            <Textarea
                                className="h-full min-h-[260px] flex-1 resize-none overflow-y-auto [field-sizing:fixed]"
                                value={skillForm.content} onChange={(event) => setSkillForm((current) => ({
                                ...current,
                                content: event.target.value
                            }))} rows={16}/>
                        </Field>
                        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input type="checkbox" checked={skillForm.isEnabled}
                                   onChange={(event) => setSkillForm((current) => ({
                                       ...current,
                                       isEnabled: event.target.checked
                                   }))}/>
                            保存后立即启用
                        </label>
                    </div>
                    <DialogFooter className="shrink-0">
                        <Button variant="outline" onClick={() => setSkillDialogOpen(false)}
                                disabled={skillSubmitting}>取消</Button>
                        <Button onClick={() => void submitSkill()}
                                disabled={skillSubmitting}>{skillSubmitting ? "保存中..." : "保存 Skill"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={llmDialogOpen} onOpenChange={setLlmDialogOpen}>
                <DialogContent className="flex h-[min(85vh,840px)] max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{llmEditingId ? "编辑模型配置" : "新增模型配置"}</DialogTitle>
                        <DialogDescription>按任务类型维护 provider、model、API key
                            和运行时环境变量，支持随时切换供应商。</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="grid gap-4 px-1 py-1 md:grid-cols-2">
                            <Field label="配置键"><Input value={llmForm.configKey}
                                                         onChange={(event) => setLlmForm((current) => ({
                                                             ...current,
                                                             configKey: event.target.value
                                                         }))}/></Field>
                            <Field label="任务类型"><Input value={llmForm.taskType}
                                                           onChange={(event) => setLlmForm((current) => ({
                                                               ...current,
                                                               taskType: event.target.value
                                                           }))}/></Field>
                            <Field label="Provider">
                                <NativeSelect value={llmForm.provider} onChange={(event) => setLlmForm((current) => ({
                                    ...current,
                                    provider: event.target.value
                                }))}>
                                    {Object.entries(providerLabels).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </NativeSelect>
                            </Field>
                            <Field label="模型名称"><Input value={llmForm.modelName}
                                                           onChange={(event) => setLlmForm((current) => ({
                                                               ...current,
                                                               modelName: event.target.value
                                                           }))}/>
                                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                    这里就是实际调用的大模型标识。如果你要换模型版本，直接编辑这里即可。
                                </p>
                            </Field>
                            <Field label="Base URL"><Input value={llmForm.baseUrl}
                                                           onChange={(event) => setLlmForm((current) => ({
                                                               ...current,
                                                               baseUrl: event.target.value
                                                           }))}/></Field>
                            <Field label="API Key 环境变量"><Input value={llmForm.apiKeyEnv}
                                                                   onChange={(event) => setLlmForm((current) => ({
                                                                       ...current,
                                                                       apiKeyEnv: event.target.value
                                                                   }))} placeholder="例如 GEMINI_API_KEY"/></Field>
                            <Field label="API Key 值"><Input value={llmForm.apiKeyValue}
                                                             onChange={(event) => setLlmForm((current) => ({
                                                                 ...current,
                                                                 apiKeyValue: event.target.value
                                                             }))} placeholder="可选，留空则使用环境变量"/></Field>
                            <Field label="优先级"><Input type="number" value={llmForm.priority}
                                                         onChange={(event) => setLlmForm((current) => ({
                                                             ...current,
                                                             priority: event.target.value
                                                         }))}/></Field>
                        </div>
                        <Field label="Extra Config" className="mt-4">
                            <Textarea value={llmForm.extraConfigText} onChange={(event) => setLlmForm((current) => ({
                                ...current,
                                extraConfigText: event.target.value
                            }))} rows={10}/>
                        </Field>
                        <label className="mt-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input type="checkbox" checked={llmForm.isActive}
                                   onChange={(event) => setLlmForm((current) => ({
                                       ...current,
                                       isActive: event.target.checked
                                   }))}/>
                            保存后立即启用
                        </label>
                    </ScrollArea>
                    <DialogFooter className="shrink-0">
                        <Button variant="outline" onClick={() => setLlmDialogOpen(false)}
                                disabled={llmSubmitting}>取消</Button>
                        <Button onClick={() => void submitLLMConfig()}
                                disabled={llmSubmitting}>{llmSubmitting ? "保存中..." : "保存配置"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={mailSenderDialogOpen} onOpenChange={setMailSenderDialogOpen}>
                <DialogContent className="sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{mailSenderEditingId ? "编辑发件箱" : "新增发件箱"}</DialogTitle>
                        <DialogDescription>支持配置 163、Outlook、企业邮箱等 SMTP
                            发件箱。编辑已有发件箱时，密码可留空以继续使用当前密码。</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[65vh]">
                        <div className="grid gap-4 px-1 py-1 md:grid-cols-2">
                            <Field label="名称"><Input value={mailSenderForm.name}
                                                       onChange={(event) => setMailSenderForm((current) => ({
                                                           ...current,
                                                           name: event.target.value
                                                       }))}/></Field>
                            <Field label="发件人名称"><Input value={mailSenderForm.fromName}
                                                             onChange={(event) => setMailSenderForm((current) => ({
                                                                 ...current,
                                                                 fromName: event.target.value
                                                             }))} placeholder="例如：某某科技招聘中心"/></Field>
                            <Field label="发件邮箱"><Input value={mailSenderForm.fromEmail}
                                                           onChange={(event) => setMailSenderForm((current) => ({
                                                               ...current,
                                                               fromEmail: event.target.value
                                                           }))} placeholder="name@example.com"/></Field>
                            <Field label="登录账号"><Input value={mailSenderForm.username}
                                                           onChange={(event) => setMailSenderForm((current) => ({
                                                               ...current,
                                                               username: event.target.value
                                                           }))}/></Field>
                            <Field label="SMTP Host"><Input value={mailSenderForm.smtpHost}
                                                            onChange={(event) => setMailSenderForm((current) => ({
                                                                ...current,
                                                                smtpHost: event.target.value
                                                            }))} placeholder="smtp.163.com"/></Field>
                            <Field label="SMTP Port"><Input type="number" value={mailSenderForm.smtpPort}
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
                                <p className="self-center text-xs text-slate-500 dark:text-slate-400">如果 SMTP Host
                                    留空，系统会尝试根据发件邮箱自动识别 163 / Outlook 默认配置。</p>
                            </div>
                            <Field label={mailSenderEditingId ? "密码（留空则不修改）" : "密码"}>
                                <Input type="password" value={mailSenderForm.password}
                                       onChange={(event) => setMailSenderForm((current) => ({
                                           ...current,
                                           password: event.target.value
                                       }))}/>
                            </Field>
                        </div>
                        <div className="mt-4 grid gap-3 px-1 py-1 md:grid-cols-2">
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={mailSenderForm.useSsl}
                                       onChange={(event) => setMailSenderForm((current) => ({
                                           ...current,
                                           useSsl: event.target.checked
                                       }))}/>
                                使用 SSL
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={mailSenderForm.useStarttls}
                                       onChange={(event) => setMailSenderForm((current) => ({
                                           ...current,
                                           useStarttls: event.target.checked
                                       }))}/>
                                使用 STARTTLS
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={mailSenderForm.isDefault}
                                       onChange={(event) => setMailSenderForm((current) => ({
                                           ...current,
                                           isDefault: event.target.checked
                                       }))}/>
                                设为默认发件箱
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={mailSenderForm.isEnabled}
                                       onChange={(event) => setMailSenderForm((current) => ({
                                           ...current,
                                           isEnabled: event.target.checked
                                       }))}/>
                                启用此发件箱
                            </label>
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMailSenderDialogOpen(false)}>取消</Button>
                        <Button onClick={() => void submitMailSender()}>保存发件箱</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={mailRecipientDialogOpen} onOpenChange={setMailRecipientDialogOpen}>
                <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>{mailRecipientEditingId ? "编辑收件人" : "新增收件人"}</DialogTitle>
                        <DialogDescription>可维护公司招聘团队、面试官、部门负责人等收件人，发送简历时支持多选和复用。</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[65vh]">
                        <div className="space-y-4 px-1 py-1">
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="姓名"><Input value={mailRecipientForm.name}
                                                           onChange={(event) => setMailRecipientForm((current) => ({
                                                               ...current,
                                                               name: event.target.value
                                                           }))}/></Field>
                                <Field label="邮箱"><Input value={mailRecipientForm.email}
                                                           onChange={(event) => setMailRecipientForm((current) => ({
                                                               ...current,
                                                               email: event.target.value
                                                           }))} placeholder="name@example.com"/></Field>
                                <Field label="部门"><Input value={mailRecipientForm.department}
                                                           onChange={(event) => setMailRecipientForm((current) => ({
                                                               ...current,
                                                               department: event.target.value
                                                           }))}/></Field>
                                <Field label="岗位"><Input value={mailRecipientForm.roleTitle}
                                                           onChange={(event) => setMailRecipientForm((current) => ({
                                                               ...current,
                                                               roleTitle: event.target.value
                                                           }))}/></Field>
                            </div>
                            <Field label="标签">
                                <Input value={mailRecipientForm.tagsText}
                                       onChange={(event) => setMailRecipientForm((current) => ({
                                           ...current,
                                           tagsText: event.target.value
                                       }))} placeholder="例如：招聘同事，技术面试官，业务负责人"/>
                            </Field>
                            <Field label="备注">
                                <Textarea className="resize-y" value={mailRecipientForm.notes}
                                          onChange={(event) => setMailRecipientForm((current) => ({
                                              ...current,
                                              notes: event.target.value
                                          }))} rows={4}/>
                            </Field>
                            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={mailRecipientForm.isEnabled}
                                       onChange={(event) => setMailRecipientForm((current) => ({
                                           ...current,
                                           isEnabled: event.target.checked
                                       }))}/>
                                启用此收件人
                            </label>
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMailRecipientDialogOpen(false)}>取消</Button>
                        <Button onClick={() => void submitMailRecipient()}>保存收件人</Button>
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
                            <Field label="本次发送的候选人">
                                <div className="grid gap-3">
                                    {resumeMailTargetCandidates.length ? resumeMailTargetCandidates.map((candidate) => (
                                        <div key={candidate.id}
                                             className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-medium text-slate-900 dark:text-slate-100">{candidate.name}</p>
                                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{candidate.position_title || "未关联岗位"}</p>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {getCandidateResumeMailSummary(candidate.id) ? (
                                                        <Badge
                                                            className="rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                                                            已发送
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline"
                                                               className="rounded-full">首次发送</Badge>
                                                    )}
                                                </div>
                                            </div>
                                            {getCandidateResumeMailSummary(candidate.id) ? (
                                                <p className="mt-2 text-xs text-sky-600 dark:text-sky-300">{getCandidateResumeMailSummary(candidate.id)}</p>
                                            ) : (
                                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">当前候选人还没有成功发送记录。</p>
                                            )}
                                        </div>
                                    )) : (
                                        <p className="text-sm text-slate-500 dark:text-slate-400">未找到候选人详情，请返回候选人中心重新选择。</p>
                                    )}
                                </div>
                            </Field>

                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="发件箱">
                                    <NativeSelect value={resumeMailForm.senderConfigId}
                                                  onChange={(event) => setResumeMailForm((current) => ({
                                                      ...current,
                                                      senderConfigId: event.target.value
                                                  }))}>
                                        <option value="">使用默认发件箱</option>
                                        {mailSenderConfigs.filter((sender) => sender.is_enabled).map((sender) => (
                                            <option key={sender.id} value={sender.id}>
                                                {sender.name} / {sender.from_email}
                                            </option>
                                        ))}
                                    </NativeSelect>
                                </Field>
                                <Field label="收件人邮箱（可选）">
                                    <Input
                                        value={resumeMailForm.extraRecipientEmails}
                                        onChange={(event) => setResumeMailForm((current) => ({
                                            ...current,
                                            extraRecipientEmails: event.target.value
                                        }))}
                                        placeholder="可直接填写一个或多个收件人邮箱，多个请用英文逗号分隔"
                                    />
                                </Field>
                            </div>

                            <Field label="选择内部收件人">
                                <div className="grid gap-3 md:grid-cols-2">
                                    {mailRecipients.filter((recipient) => recipient.is_enabled).length ? mailRecipients.filter((recipient) => recipient.is_enabled).map((recipient) => (
                                        <label key={recipient.id}
                                               className="flex items-start gap-3 rounded-2xl border border-slate-200/80 px-4 py-4 text-sm dark:border-slate-800">
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
                                                <p className="mt-1 text-slate-500 dark:text-slate-400">{recipient.department || "未设置部门"} / {recipient.role_title || "未设置岗位"}</p>
                                            </div>
                                        </label>
                                    )) : (
                                        <EmptyState title="暂无可选收件人"
                                                    description="可以直接填写上方收件人邮箱，也可以先在邮件中心维护公司内部收件人。"/>
                                    )}
                                </div>
                            </Field>

                            <Field label="邮件标题（可留空）">
                                <Input value={resumeMailForm.subject}
                                       onChange={(event) => setResumeMailForm((current) => ({
                                           ...current,
                                           subject: event.target.value
                                       }))} placeholder="例如：候选人简历推荐 / IoT 测试工程师"/>
                            </Field>
                            <Field label="邮件正文（可留空）">
                                <Textarea value={resumeMailForm.bodyText}
                                          onChange={(event) => setResumeMailForm((current) => ({
                                              ...current,
                                              bodyText: event.target.value
                                          }))} rows={10}
                                          placeholder="可填写本次推荐理由、安排建议等；留空时将使用系统默认正文。"/>
                            </Field>
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResumeMailDialogOpen(false)}>取消</Button>
                        <Button onClick={() => void submitResumeMail()} disabled={resumeMailSubmitting}>
                            <Send className="h-4 w-4"/>
                            {resumeMailSubmitLabel}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
