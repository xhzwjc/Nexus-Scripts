"use client";

import React, {useCallback, useDeferredValue, useEffect, useMemo, useRef, startTransition, useState} from "react";
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
import {toast} from "@/lib/toast";
import type {ScriptHubOrganizationDefinition} from "@/lib/types";

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
} from "@/lib/recruitment-api";
import {useI18n} from "@/lib/i18n";
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
import {OrgScopeBreadcrumbPicker} from './OrgScopeBreadcrumbPicker';
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
import {StructuredSkillEditor} from "./components/StructuredSkillEditor";
import {AssistantPage} from "./pages/AssistantPage";
import {AuditPage} from "./pages/AuditPage";
import {CandidatesPage} from "./pages/CandidatesPage";
import {MailSettingsPage} from "./pages/MailSettingsPage";
import {ModelSettingsPage} from "./pages/ModelSettingsPage";
import {SkillSettingsPage} from "./pages/SkillSettingsPage";
import {WorkspacePage} from "./pages/WorkspacePage";
import { useOptimizedStats, useCachedListData, useCachedObjectData, useTaskSSE } from "./hooks";

const PAGE_ACTIVITY_POLL_VISIBLE_INTERVAL_MS = 15_000;
const PAGE_ACTIVITY_POLL_HIDDEN_INTERVAL_MS = 60_000;
const PAGE_ACTIVITY_POLL_MAX_INTERVAL_MS = 15_000;
const TASK_MONITOR_VISIBLE_INTERVAL_MS = 30_000;
const TASK_MONITOR_HIDDEN_INTERVAL_MS = 60_000;
const TASK_MONITOR_MAX_INTERVAL_MS = 30_000;
const TASK_MONITOR_BATCH_SCALE_THRESHOLD = 8;
const ALL_COMPANY_DEPARTMENTS_VALUE = "__all_company_departments__";

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

type OrganizationSelectOption = {
    value: string;
    label: string;
    description?: string;
    organization?: ScriptHubOrganizationDefinition;
};

type PositionFormErrors = Partial<Record<"orgCode" | "title" | "headcount", string>>;
type SkillFormErrors = Partial<Record<"name" | "content" | "sortOrder", string>>;
type LLMFormErrors = Partial<Record<"configKey" | "taskType" | "provider" | "modelName" | "priority" | "extraConfigText", string>>;

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
}

export default function RecruitmentAutomationContainer({onBack}: RecruitmentAutomationContainerProps) {
    const {language} = useI18n();
    const isZh = language === "zh-CN";
    const sessionUser = useMemo(() => getStoredScriptHubSession()?.user ?? null, []);
    const defaultOrgScope = normalizeRecruitmentOrgCode(sessionUser?.primaryOrgCode);
    const recruitmentToast = useMemo(() => getRecruitmentToastLocale(language), [language]);
    const recruitmentToastEntities = recruitmentToast.entities;
    const jdGenerationInFlightRef = useRef(false);
    const screeningLaunchInFlightRef = useRef(false);
    const taskMonitorTimersRef = useRef<Map<number, number>>(new Map());
    const taskMonitorTokensRef = useRef<Map<number, symbol>>(new Map());
    const pendingLogUpdatesRef = useRef<AITaskLog[]>([]);
    const logFlushRafRef = useRef<number | null>(null);
    const requestInflightRef = useRef<Map<string, Promise<unknown>>>(new Map());
    const primaryNavScrollRef = useRef<HTMLDivElement | null>(null);
    const primaryNavButtonRefs = useRef<Partial<Record<RecruitmentPage, HTMLButtonElement | null>>>({});
    const selectedLogIdRef = useRef<number | null>(null);
    const selectedPositionIdRef = useRef<number | null>(null);
    const selectedCandidateIdRef = useRef<number | null>(null);
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
        settingsSkillsTitle: isZh ? "Skill 管理" : "Skill Settings",
        settingsSkillsDescription: isZh ? "维护招聘评估和题目生成所用的 Skills。" : "Manage the skills used for screening and interview-question generation.",
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
        skillCreateTitle: isZh ? "新增 Skill" : "New Skill",
        skillEditTitle: isZh ? "编辑 Skill" : "Edit Skill",
        skillDialogDescription: isZh
            ? "Skills 是管理员配置项，因此入口收在管理设置里，不占用主工作台主路径。"
            : "Skills are managed from admin settings so the main workspace stays focused.",
        saveSkill: isZh ? "保存 Skill" : "Save Skill",
        skillNameRequired: isZh ? "请输入 Skill 名称" : "Please enter a skill name",
        skillNameTooLong: isZh ? "Skill 名称不能超过 120 个字符" : "Skill name cannot exceed 120 characters",
        skillContentRequired: isZh ? "请输入 Skill 内容" : "Please enter the skill content",
        skillSortOrderInvalid: isZh ? "排序需为 0 到 9999 之间的整数" : "Sort order must be an integer between 0 and 9999",
        skillDeleteTitle: isZh ? "确认删除 Skill" : "Delete Skill",
        skillDeleteDescription: isZh
            ? "删除后该规则将不再参与新的招聘流程，但历史对话和任务日志仍会保留这次使用痕迹。"
            : "After deletion, this skill will no longer be used in new recruiting flows, while past conversations and task logs will still keep its history.",
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
        priorityLabel: isZh ? "优先级" : "Priority",
        extraConfigLabel: "Extra Config",
        apiKeyEnvPlaceholder: isZh ? "例如 GEMINI_API_KEY" : "For example: GEMINI_API_KEY",
        apiKeyValuePlaceholder: isZh ? "可选，留空则使用环境变量" : "Optional. Leave empty to use the environment variable.",
        modelNameHint: isZh
            ? "这里就是实际调用的大模型标识。如果你要换模型版本，直接编辑这里即可。"
            : "This is the actual model identifier used at runtime. Edit it directly when you want to switch model versions.",
        saveModelConfig: isZh ? "保存配置" : "Save Configuration",
        llmConfigKeyRequired: isZh ? "请输入配置键" : "Please enter a config key",
        llmConfigKeyTooLong: isZh ? "配置键不能超过 120 个字符" : "Config key cannot exceed 120 characters",
        llmConfigKeyDuplicate: (value: string) => (
            isZh ? `配置键“${value}”已存在，请换一个` : `The config key "${value}" already exists. Please use another one.`
        ),
        llmTaskTypeRequired: isZh ? "请输入任务类型" : "Please enter a task type",
        llmTaskTypeTooLong: isZh ? "任务类型不能超过 80 个字符" : "Task type cannot exceed 80 characters",
        llmProviderRequired: isZh ? "请选择 Provider" : "Please choose a provider",
        llmProviderTooLong: isZh ? "Provider 不能超过 80 个字符" : "Provider cannot exceed 80 characters",
        llmModelNameRequired: isZh ? "请输入模型名称" : "Please enter a model name",
        llmModelNameTooLong: isZh ? "模型名称不能超过 120 个字符" : "Model name cannot exceed 120 characters",
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
        assistantNavDescription: isZh ? "自然语言驱动岗位、候选人和 Skill 上下文" : "Natural-language workspace for positions, candidates, and skill context",
        quickAddPosition: isZh ? "新增岗位" : "Add Position",
        pendingScreeningCandidates: isZh ? "待筛候选人" : "Pending Screening",
        pendingInterviewCandidates: isZh ? "待安排面试" : "Pending Interview",
        pendingScreeningShort: isZh ? "待筛" : "Queue",
        pendingInterviewShort: isZh ? "待面" : "Intv",
        todayTodos: isZh ? "今日待办" : "Today's To-Dos",
        pendingPublish: isZh ? "待发布" : "Pending Publish",
        pendingScreening: isZh ? "待初筛" : "Pending Screening",
        pendingInterview: isZh ? "待面试" : "Pending Interview",
        pendingDecision: isZh ? "待决策" : "Pending Decision",
        preferredInterviewSkillFromMemory: isZh ? "工作记忆中的面试题 Skills" : "Interview skills from workflow memory",
        positionBoundSkills: isZh ? "岗位绑定 Skills" : "Position-bound skills",
        noConfiguredSkills: isZh ? "未配置 Skills" : "No skills configured",
        screeningMemorySkills: isZh ? "初筛工作记忆 Skills" : "Screening skills from workflow memory",
        interviewMemorySkills: isZh ? "面试题工作记忆 Skills" : "Interview skills from workflow memory",
        manualSelectedSkills: isZh ? "手动选择 Skills" : "Manually selected skills",
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
        assistantLabel: isZh ? "招聘助手" : "Recruiting Assistant",
        assistantWorkspaceHint: isZh ? "在工作台里快速切上下文、带着推荐问题打开完整助手。" : "Switch context quickly from the workspace and jump into the full assistant with suggested prompts.",
        open: isZh ? "打开" : "Open",
        collapse: isZh ? "收起" : "Collapse",
        more: isZh ? "更多" : "More",
        openFullAssistant: isZh ? "打开完整助手" : "Open Full Assistant",
        assistantContextShort: isZh ? "上下文" : "Context",
        currentPosition: isZh ? "当前岗位" : "Current Position",
        activeSkills: isZh ? "激活 Skills" : "Active Skills",
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
    }), [isZh, recruitmentToast]);
    const localizeCandidateStatusValue = useCallback((value?: string | null, fallback?: string | null) => {
        const normalized = String(value || "").trim();
        if (!normalized) {
            return fallback || "";
        }
        return candidateStatusLabels[normalized] || fallback || normalized;
    }, []);

    const [activePage, setActivePage] = useState<RecruitmentPage>("workspace");
    const [assistantOpen, setAssistantOpen] = useState(false);
    const [navCollapsed, setNavCollapsed] = useState(false);
    const [positionListCollapsed, setPositionListCollapsed] = useState(false);
    const [positionWorkspaceView, setPositionWorkspaceView] = useState<"jd" | "config">("jd");
    const [positionSecondaryPanelOpen, setPositionSecondaryPanelOpen] = useState(false);
    const [auditFiltersCollapsed, setAuditFiltersCollapsed] = useState(true);
    const [bootstrapping, setBootstrapping] = useState(true);
    const activePrimaryNavPage = assistantOpen ? "assistant" : activePage;
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
    const [allSkills, setAllSkills] = useState<RecruitmentSkill[]>([]);
    const [skills, setSkills] = useState<RecruitmentSkill[]>([]);
    const [allAiLogs, setAllAiLogs] = useState<AITaskLog[]>([]);
    const [aiLogs, setAiLogs] = useState<AITaskLog[]>([]);
    const [candidateStats, setCandidateStats] = useState<{total: number; pending_screening: number; status_counts: Record<string, number>; today_total: number; today_status_counts: Record<string, number>} | null>(null);
    const [funnelData, setFunnelData] = useState<import("@/lib/recruitment-api").RecruitmentFunnelData | null>(null);
    const [sourceStatsData, setSourceStatsData] = useState<import("@/lib/recruitment-api").SourceStatsData | null>(null);
    const [candidateTotal, setCandidateTotal] = useState(0);
    const [aiLogStats, setAiLogStats] = useState<{total: number; status_counts: Record<string, number>} | null>(null);
    const [aiLogTotal, setAiLogTotal] = useState(0);
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
    const [candidateDetailLoading, setCandidateDetailLoading] = useState(false);
    const [duplicateCandidates, setDuplicateCandidates] = useState<Array<{id: number; candidate_code: string; name: string; phone: string | null; email: string | null; status: string}>>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logDetailLoading, setLogDetailLoading] = useState(false);
    const [skillsLoading, setSkillsLoading] = useState(false);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [mailSettingsLoading, setMailSettingsLoading] = useState(false);
    const [mailAutoPushConfigSaving, setMailAutoPushConfigSaving] = useState(false);
    const [coreRefreshing, setCoreRefreshing] = useState(false);
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
    const [resumeUploadPositionId, setResumeUploadPositionId] = useState("all");
    const [resumeUploadOrgCode, setResumeUploadOrgCode] = useState(defaultOrgScope);
    const [resumeUploadCity, setResumeUploadCity] = useState("");
    const [resumeUploadCitySource, setResumeUploadCitySource] = useState<"manual" | "auto">("auto");
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
        ? "我是招聘助手。你可以直接让我生成 JD、查看岗位候选人、重新初筛某位候选人并追加硬性条件，或者说明这次对话实际使用了哪些 Skills。"
        : "I'm your recruiting assistant. I can generate a JD, inspect candidates for the current position, re-screen a candidate with stricter requirements, or explain which skills were used in this conversation.";
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
    const [skillEditorDefaultTab, setSkillEditorDefaultTab] = useState<"structured" | "advanced" | "ai">("structured");
    const [skillGenerating, setSkillGenerating] = useState(false);
    const [skillAutoBindCategory, setSkillAutoBindCategory] = useState<"jdSkillIds" | "screeningSkillIds" | "interviewSkillIds" | null>(null);

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
    const positionMap = useMemo(() => new Map(positions.map((item) => [item.id, item])), [positions]);
    const candidateMap = useMemo(() => new Map(candidates.map((item) => [item.id, item])), [candidates]);
    const skillMap = useMemo(() => new Map(skills.map((item) => [item.id, item])), [skills]);
    const enabledSkills = useMemo(() => skills.filter((skill) => skill.is_enabled !== false), [skills]);
    const enabledSkillMap = useMemo(() => new Map(enabledSkills.map((item) => [item.id, item])), [enabledSkills]);
    const jdAuthoringSkills = useMemo(() => sortSkillsForTaskPreference(enabledSkills.filter((s) => !s.task_types?.length || s.task_types.includes("jd")), "jd"), [enabledSkills]);
    const screeningAuthoringSkills = useMemo(() => sortSkillsForTaskPreference(enabledSkills.filter((s) => !s.task_types?.length || s.task_types.includes("screening")), "screening"), [enabledSkills]);
    const interviewAuthoringSkills = useMemo(() => sortSkillsForTaskPreference(enabledSkills.filter((s) => !s.task_types?.length || s.task_types.includes("interview")), "interview"), [enabledSkills]);
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
    const activeScreeningTaskIds = useMemo(() => Object.values(activeScreeningTaskMap), [activeScreeningTaskMap]);
    const selectedCandidateScreeningTaskId = selectedCandidateId
        ? (
            activeScreeningTaskMap[selectedCandidateId]
            || (candidateDetail?.candidate.id === selectedCandidateId ? candidateDetail?.candidate.active_screening_task_id : null)
            || candidateMap.get(selectedCandidateId)?.active_screening_task_id
            || null
        )
        : null;
    const isBatchScreeningRunning = activeBatchScreeningTaskIds.length > 0;
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
        const normalizedQuery = deferredCandidateQuery.trim().toLowerCase();
        return candidates.filter((candidate) => {
            if (candidatePositionFilter.length > 0 && !candidatePositionFilter.includes(String(candidate.position_id || ""))) {
                return false;
            }
            if (candidateStatusFilter.length > 0 && !candidateStatusFilter.includes(resolveCandidateDisplayStatus(candidate))) {
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
    }, [candidateMatchFilter, candidatePositionFilter, candidateSourceFilter, candidateStatusFilter, candidateTimeFilter, candidates, deferredCandidateQuery]);

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
    const todayScreeningPassed = useMemo(() => {
        const tsc = candidateStats?.today_status_counts;
        if (!tsc) return stats.cards.screening_passed;
        return (tsc["screening_passed"] ?? 0) + (tsc["interview_passed"] ?? 0) + (tsc["offer_sent"] ?? 0) + (tsc["hired"] ?? 0);
    }, [candidateStats, stats.cards.screening_passed]);

    const todoSummary = useMemo(() => {
        const sc = candidateStats?.status_counts;
        if (sc && Object.keys(sc).length > 0) {
            return {
                pendingPublish: stats.todo.pendingPublish, // positions 统计仍用前端（positions 全量加载）
                pendingScreening: sc["pending_screening"] ?? 0,
                pendingInterview: sc["pending_interview"] ?? 0,
                pendingDecision: sc["pending_offer"] ?? 0,
            };
        }
        return stats.todo;
    }, [candidateStats, stats.todo]);

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
            if (!current || visibleAiLogs.some((log) => log.id === current)) {
                return current;
            }
            const firstId = visibleAiLogs[0]?.id || null;
            return firstId;
        });
    }, [visibleAiLogs]);

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
            if (logFlushRafRef.current != null) {
                window.cancelAnimationFrame(logFlushRafRef.current);
                logFlushRafRef.current = null;
            }
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

                // 阶段 2: 工作台核心数据 + 统计 (并行，统计秒出)
                const dashboardPromise = loadDashboardWithTimeout(5000);
                const orgCodeParam = selectedDepartmentScope !== ALL_COMPANY_DEPARTMENTS_VALUE ? `&org_code=${encodeURIComponent(selectedDepartmentScope)}` : "";
                const statsPromise = Promise.allSettled([
                    recruitmentApi<{total: number; pending_screening: number; status_counts: Record<string, number>; today_total: number; today_status_counts: Record<string, number>}>(`/candidates/stats${orgCodeParam ? `?${orgCodeParam.slice(1)}` : ""}`).then((d) => { if (!cancelled) setCandidateStats(d); }).catch(() => {}),
                    recruitmentApi<{total: number; status_counts: Record<string, number>}>(`/ai-task-logs/stats${orgCodeParam ? `?${orgCodeParam.slice(1)}` : ""}`).then((d) => { if (!cancelled) { setAiLogStats(d); setAiLogTotal(d.total); } }).catch(() => {}),
                    recruitmentApi<import("@/lib/recruitment-api").RecruitmentFunnelData>(`/candidates/funnel${orgCodeParam ? `?${orgCodeParam.slice(1)}` : ""}`).then((d) => { if (!cancelled) setFunnelData(d); }).catch(() => {}),
                    recruitmentApi<import("@/lib/recruitment-api").SourceStatsData>(`/candidates/source-stats${orgCodeParam ? `?${orgCodeParam.slice(1)}` : ""}`).then((d) => { if (!cancelled) setSourceStatsData(d); }).catch(() => {}),
                ]);

                await Promise.allSettled([dashboardPromise, statsPromise]);

                if (cancelled) return;
                criticalLoaded = true;
                setBootstrapping(false);

                // 阶段 3: 列表数据 (分页首屏，后台加载)
                void loadPositionsWithCache();
                void loadCandidatesFirstPage();
                void loadLogsFirstPage();

                // 阶段 4: 配置数据 (最低优先级，延迟加载)
                if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
                    window.requestIdleCallback(() => {
                        if (!cancelled) {
                            void Promise.allSettled([
                                loadSkills(),
                                loadMailSettings(),
                                loadChatContext(),
                                canManageRecruitment ? loadLLMConfigs() : Promise.resolve(),
                            ]);
                        }
                    }, { timeout: 5000 });
                } else {
                    setTimeout(() => {
                        if (!cancelled) {
                            void Promise.allSettled([
                                loadSkills(),
                                loadMailSettings(),
                                loadChatContext(),
                                canManageRecruitment ? loadLLMConfigs() : Promise.resolve(),
                            ]);
                        }
                    }, 500);
                }
            } catch (error) {
                if (!criticalLoaded && !cancelled) {
                    setBootstrapping(false);
                }
            }
        }

        async function loadDashboardWithTimeout(timeoutMs: number): Promise<void> {
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    resolve();
                }, timeoutMs);
                loadDashboard().finally(() => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
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
                const orgCodeParam = selectedDepartmentScope !== ALL_COMPANY_DEPARTMENTS_VALUE ? `org_code=${encodeURIComponent(selectedDepartmentScope)}` : "";
                const url = orgCodeParam ? `/candidates?limit=50&offset=0&${orgCodeParam}` : "/candidates?limit=50&offset=0";
                const data = await recruitmentApi<{items: CandidateSummary[]; total: number}>(url);
                if (!cancelled) {
                    setAllCandidates(deduplicateCandidates(data?.items || []));
                    setCandidateTotal(data?.total || 0);
                }
            } catch (error) {
                toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.candidates, formatActionError(error)));
            }
        }

        async function loadLogsFirstPage(): Promise<void> {
            try {
                const data = await getCachedLogs(
                    'logs:first-page',
                    () => recruitmentApi<{items: AITaskLog[]; total: number}>("/ai-task-logs?limit=20&offset=0")
                );
                if (!cancelled) {
                    setAllAiLogs(data?.items || []);
                    setAiLogTotal(data?.total || 0);
                }
            } catch (error) {
                toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.aiTasks, formatActionError(error)));
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

    // 切换到审计中心时，拉取最新日志
    useEffect(() => {
        if (activePage === "audit") {
            void loadLogs({ silent: true });
        }
    }, [activePage]);

    const pendingCandidateRefreshRef = useRef<number | null>(null);

    useTaskSSE(
        activePage === "candidates" || activePage === "audit" || activePage === "workspace",
        {
            onTaskCompleted: (event) => {
                if (event.task_id) {
                    stopTaskMonitor(event.task_id);
                    if (event.related_candidate_id) {
                        clearActiveScreeningTask(event.related_candidate_id, event.task_id);
                    }
                }
                if (pendingCandidateRefreshRef.current) {
                    window.clearTimeout(pendingCandidateRefreshRef.current);
                }
                pendingCandidateRefreshRef.current = window.setTimeout(() => {
                    void loadCandidates({ silent: true, force: true });
                    void loadDashboard();
                    void refreshCandidateStats();
                }, 100);
            },
            onCandidateUpdated: (event) => {
                if (event.candidate_id && selectedCandidateIdRef.current === event.candidate_id) {
                    void loadCandidateDetail(event.candidate_id, { silent: true, force: true });
                }
            },
            onTaskProgress: (event) => {
                if (
                    event.task_id &&
                    activePage === "audit" &&
                    selectedLogId === event.task_id
                ) {
                    void recruitmentApi<AITaskLog>(`/ai-task-logs/${event.task_id}`)
                        .then((log) => { mergeAiTaskLog(log); })
                        .catch(() => {});
                }
            },
        },
    );

    useEffect(() => {
        const shouldPollLogs = activePage === "audit" || activePage === "workspace";
        const shouldPollCandidateDetail = activePage === "candidates";
        const shouldPollCandidateList = activePage === "candidates";
        const shouldPollLogDetail = activePage === "audit";
        const hasVisibleLiveActivity = (
            (shouldPollLogs && hasLiveLogActivity)
            || (shouldPollCandidateDetail && hasLiveCandidateActivity)
            || (shouldPollCandidateList && hasLiveCandidateListActivity)
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
        void checkDuplicatesForCandidate(candidateDetail);
    }, [candidateDetail?.candidate.id, candidateDetail?.candidate.phone, candidateDetail?.candidate.email]);

    useEffect(() => {
        setSelectedInterviewSkillIds([]);
        setInterviewSkillSelectionDirty(false);
        setCandidateProcessLogsExpanded(false);
        if (selectedCandidateId) {
            void loadInterviewSchedules(selectedCandidateId);
            void loadOffers(selectedCandidateId);
            void loadFollowUps(selectedCandidateId);
        } else {
            setInterviewSchedules([]);
            setOffers([]);
            setFollowUps([]);
        }
    }, [selectedCandidateId]);

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
            const data = await runDedupedRequest("metadata", () => recruitmentApi<RecruitmentMetadata>("/metadata"));
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
            const data = await runDedupedRequest("organization-catalog", async () => {
                return recruitmentApi<RecruitmentOrganizationScope>("/organization-scope");
            });
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

    async function loadDashboard() {
        try {
            const data = await runDedupedRequest("dashboard", () => recruitmentApi<DashboardData>("/dashboard"));
            return data;
        } catch (error) {
            toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.workspace, formatActionError(error)));
            throw error;
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

    async function loadCandidates(options?: { silent?: boolean; force?: boolean }) {
        const requestId = candidatesLoadRequestIdRef.current + 1;
        candidatesLoadRequestIdRef.current = requestId;
        if (!options?.silent) {
            setCandidatesLoading(true);
        }
        try {
            const orgCodeParam = selectedDepartmentScope !== ALL_COMPANY_DEPARTMENTS_VALUE ? `org_code=${encodeURIComponent(selectedDepartmentScope)}` : "";
            const url = orgCodeParam ? `/candidates?limit=50&offset=0&${orgCodeParam}` : "/candidates?limit=50&offset=0";
            const request = () => recruitmentApi<{items: CandidateSummary[]; total: number}>(url);
            const result = options?.force
                ? await request()
                : await runDedupedRequest(
                    `candidates:first-page${orgCodeParam ? `:${selectedDepartmentScope}` : ""}`,
                    request,
                );
            if (!mountedRef.current || candidatesLoadRequestIdRef.current !== requestId) {
                return result?.items || [];
            }
            setAllCandidates(deduplicateCandidates(result?.items || []));
            setCandidateTotal(result?.total || 0);
            return result?.items || [];
        } catch (error) {
            if (!options?.silent) {
                toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.candidates, formatActionError(error)));
            }
            throw error;
        } finally {
            if (!options?.silent && mountedRef.current && candidatesLoadRequestIdRef.current === requestId) {
                setCandidatesLoading(false);
            }
        }
    }

    const loadingMoreCandidatesRef = useRef(false);
    async function loadMoreCandidates() {
        if (candidatesLoading || loadingMoreCandidatesRef.current || allCandidates.length >= candidateTotal) return;
        loadingMoreCandidatesRef.current = true;
        try {
            const offset = allCandidates.length;
            const orgCodeParam = selectedDepartmentScope !== ALL_COMPANY_DEPARTMENTS_VALUE ? `&org_code=${encodeURIComponent(selectedDepartmentScope)}` : "";
            const data = await recruitmentApi<{items: CandidateSummary[]; total: number}>(`/candidates?limit=50&offset=${offset}${orgCodeParam}`);
            if (mountedRef.current) {
                setAllCandidates(prev => deduplicateCandidates([...prev, ...(data?.items || [])]));
                setCandidateTotal(data?.total || 0);
            }
        } catch (error) {
            console.error("Failed to load more candidates:", error);
        } finally {
            loadingMoreCandidatesRef.current = false;
        }
    }

    async function loadCandidateDetail(candidateId: number, options?: { silent?: boolean; force?: boolean }) {
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

    async function loadLogs(options?: { silent?: boolean }) {
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
            const orgCodeParam = selectedDepartmentScope !== ALL_COMPANY_DEPARTMENTS_VALUE ? `&org_code=${encodeURIComponent(selectedDepartmentScope)}` : "";
            const dedupKey = `logs:${options?.silent ? "silent" : "full"}:${logTaskTypeFilter}:${logStatusFilter}${orgCodeParam ? `:${selectedDepartmentScope}` : ""}`;
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
            const orgCodeParam = selectedDepartmentScope !== ALL_COMPANY_DEPARTMENTS_VALUE ? `&org_code=${encodeURIComponent(selectedDepartmentScope)}` : "";
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
            return data;
        } catch (error) {
            toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.skills, formatActionError(error)));
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
                setAllLlmConfigs(data);
            }
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
            return {senders, recipients, dispatches, autoPushConfig};
        } catch (error) {
            toast.error(recruitmentToast.loadFailed(recruitmentToastEntities.mailSettings, formatActionError(error)));
            throw error;
        } finally {
            setMailSettingsLoading(false);
        }
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

    async function refreshCandidateStats(departmentScope?: string) {
        try {
            const deptScope = departmentScope ?? selectedDepartmentScope;
            const orgCodeParam = deptScope !== ALL_COMPANY_DEPARTMENTS_VALUE
                ? `?org_code=${encodeURIComponent(deptScope)}`
                : selectedOrgScope
                    ? `?org_code=${encodeURIComponent(selectedOrgScope)}`
                    : "";
            const d = await recruitmentApi<{total: number; pending_screening: number; status_counts: Record<string, number>; today_total: number; today_status_counts: Record<string, number>}>(`/candidates/stats${orgCodeParam}`);
            setCandidateStats(d);
            setCandidateTotal(d.total);
        } catch {}
        try {
            const deptScope = departmentScope ?? selectedDepartmentScope;
            const orgCodeParam = deptScope !== ALL_COMPANY_DEPARTMENTS_VALUE
                ? `?org_code=${encodeURIComponent(deptScope)}`
                : selectedOrgScope
                    ? `?org_code=${encodeURIComponent(selectedOrgScope)}`
                    : "";
            const f = await recruitmentApi<import("@/lib/recruitment-api").RecruitmentFunnelData>(`/candidates/funnel${orgCodeParam}`);
            setFunnelData(f);
        } catch {}
        try {
            const deptScope = departmentScope ?? selectedDepartmentScope;
            const orgCodeParam = deptScope !== ALL_COMPANY_DEPARTMENTS_VALUE
                ? `?org_code=${encodeURIComponent(deptScope)}`
                : selectedOrgScope
                    ? `?org_code=${encodeURIComponent(selectedOrgScope)}`
                    : "";
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
        const candidatesPromise = (async () => {
            const orgCodeParam = deptScope !== ALL_COMPANY_DEPARTMENTS_VALUE
                ? `org_code=${encodeURIComponent(deptScope)}`
                : companyScope
                    ? `org_code=${encodeURIComponent(companyScope)}`
                    : "";
            const url = orgCodeParam ? `/candidates?limit=50&offset=0&${orgCodeParam}` : "/candidates?limit=50&offset=0";
            const d = await recruitmentApi<{items: CandidateSummary[]; total: number}>(url);
            setAllCandidates(deduplicateCandidates(d?.items || []));
            setCandidateTotal(d?.total || 0);
        })();

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
            loadDashboard(),
            loadPositions(),
            candidatesPromise,
            logsPromise,
            // 并行刷新统计
            (async () => {
                const orgCodeParam = deptScope !== ALL_COMPANY_DEPARTMENTS_VALUE
                    ? `?org_code=${encodeURIComponent(deptScope)}`
                    : companyScope
                        ? `?org_code=${encodeURIComponent(companyScope)}`
                        : "";
                const d = await recruitmentApi<{total: number; pending_screening: number; status_counts: Record<string, number>; today_total: number; today_status_counts: Record<string, number>}>(`/candidates/stats${orgCodeParam}`);
                setCandidateStats(d);
                setCandidateTotal(d.total);
            })(),
            (async () => {
                const orgCodeParam = deptScope !== ALL_COMPANY_DEPARTMENTS_VALUE
                    ? `?org_code=${encodeURIComponent(deptScope)}`
                    : companyScope
                        ? `?org_code=${encodeURIComponent(companyScope)}`
                        : "";
                const d = await recruitmentApi<{total: number; status_counts: Record<string, number>}>(`/ai-task-logs/stats${orgCodeParam}`);
                setAiLogStats(d);
                setAiLogTotal(d.total);
            })(),
            (async () => {
                const orgCodeParam = deptScope !== ALL_COMPANY_DEPARTMENTS_VALUE
                    ? `?org_code=${encodeURIComponent(deptScope)}`
                    : companyScope
                        ? `?org_code=${encodeURIComponent(companyScope)}`
                        : "";
                const f = await recruitmentApi<import("@/lib/recruitment-api").RecruitmentFunnelData>(`/candidates/funnel${orgCodeParam ? `?${orgCodeParam}` : ""}`);
                setFunnelData(f);
            })(),
            (async () => {
                const orgCodeParam = deptScope !== ALL_COMPANY_DEPARTMENTS_VALUE
                    ? `?org_code=${encodeURIComponent(deptScope)}`
                    : companyScope
                        ? `?org_code=${encodeURIComponent(companyScope)}`
                        : "";
                const s = await recruitmentApi<import("@/lib/recruitment-api").SourceStatsData>(`/candidates/source-stats${orgCodeParam ? `?${orgCodeParam}` : ""}`);
                setSourceStatsData(s);
            })(),
        ];
        if (options?.includeMailSettings) {
            tasks.push(loadMailSettings());
        }
        await Promise.allSettled(tasks);

        // 静默刷新时不显示 toast
        if (!options?.silent) {
            toast.success(isZh ? "数据已刷新" : "Data refreshed");
        }
    }

    async function refreshCoreDataWithFeedback() {
        if (coreRefreshing) {
            return;
        }
        setCoreRefreshing(true);
        try {
            await refreshCoreData();
            toast.success(recruitmentToast.refreshed(recruitmentToastEntities.workspace));
        } catch (error) {
            toast.error(recruitmentToast.refreshFailed(recruitmentToastEntities.workspace, formatActionError(error)));
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
        startTransition(() => {
            setActivePage(page);
        });
    }

    function navigatePrimaryPage(page: RecruitmentPage) {
        startTransition(() => {
            setActivePage(page);
        });
    }

    function openTaskLogDetail(logId?: number | null) {
        if (!logId) {
            return;
        }
        setActivePage("audit");
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
        // Optimistic update: immediately set active_screening_task_status on the candidate
        // so the left list shows "screening_running" without waiting for server refresh
        setAllCandidates((current) =>
            current.map((c) =>
                c.id === candidateId
                    ? { ...c, active_screening_task_id: taskId, active_screening_task_status: "queued" }
                    : c,
            ),
        );
        startTaskMonitor(taskId, {
            onFinish: async (log) => {
                if (!mountedRef.current) {
                    return;
                }
                clearActiveScreeningTask(candidateId, taskId);
                await Promise.all([
                    loadCandidates({silent: true, force: true}),
                    loadDashboard(),
                    loadLogs({silent: true}),
                    loadMailSettings(),
                    refreshCandidateStats(),
                ]);
                if (selectedCandidateIdRef.current === candidateId) {
                    await loadCandidateDetail(candidateId, {silent: true, force: true});
                }
                if (options?.suppressFinishToast) {
                    return;
                }
                if (log.status === "success" || log.status === "fallback") {
                    toast.success(recruitmentToast.screeningCompleted(log.status === "fallback"));
                    return;
                }
                if (log.status === "cancelled") {
                    toast.success(recruitmentUiText.screeningStopped);
                    return;
                }
                if (log.status === "failed") {
                    toast.error(recruitmentUiText.screeningFailed(log.error_message || recruitmentToast.unknownError));
                }
            },
        });
    }

    useEffect(() => {
        candidates.forEach((candidate) => {
            if (!candidate.active_screening_task_id || !candidate.active_screening_task_status || !isLiveTaskStatus(candidate.active_screening_task_status)) {
                return;
            }
            if (taskMonitorTokensRef.current.has(candidate.active_screening_task_id)) {
                return;
            }
            attachScreeningTaskMonitor(candidate.id, candidate.active_screening_task_id, {
                suppressFinishToast: true,
            });
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
                            content: isZh ? `发送失败：${payload.message}` : `Request failed: ${payload.message}`,
                            streamStatus: "error",
                            sourceRunType: "stream",
                            frontendDebug: buildFrontendDebugPayload(),
                        }));
                        toast.error(isZh ? `发送失败：${payload.message}` : `Request failed: ${payload.message}`);
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
                toast.success(isZh ? "已停止助手生成" : "Assistant generation stopped");
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
            toast.error(isZh ? "当前没有可复制的发布文案" : "There is no publish copy to copy right now");
            return;
        }
        try {
            await navigator.clipboard.writeText(currentPublishText);
            toast.success(isZh ? "发布文案已复制" : "Publish copy copied");
        } catch (error) {
            toast.error(isZh ? `复制失败：${error instanceof Error ? error.message : "未知错误"}` : `Copy failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    function openCreatePosition() {
        setPositionDialogMode("create");
        setPositionForm({
            ...emptyPositionForm(),
            orgCode: showOrganizationFields ? "" : activeCreateOrgCode,
        });
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
        } else if (field === "orgCode") {
            setPositionFormErrors((current) => {
                if (!current.orgCode) return current;
                const next = {...current};
                delete next.orgCode;
                return next;
            });
        }
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
                toast.success(isZh ? "岗位已创建" : "Position created");
            } else if (selectedPositionId) {
                await recruitmentApi<PositionSummary>(`/positions/${selectedPositionId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success(isZh ? "岗位已更新" : "Position updated");
            }
            setPositionDialogOpen(false);
            await refreshCoreData();
            if (targetPositionId) {
                await loadPositionDetail(targetPositionId);
            }
            setActivePage("positions");
        } catch (error) {
            setPositionFormSubmitError(isZh ? `保存岗位失败：${error instanceof Error ? error.message : "未知错误"}` : `Failed to save position: ${error instanceof Error ? error.message : "Unknown error"}`);
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
            toast.success(isZh ? "岗位已删除" : "Position deleted");
            setPositionDeleteConfirmOpen(false);
            setPositionDetail(null);
            setSelectedPositionId(null);
            try {
                await Promise.all([loadPositions(), loadDashboard(), loadCandidates(), loadLogs()]);
            } catch (refreshError) {
                toast.error(isZh ? `岗位已删除，但页面刷新失败：${formatActionError(refreshError)}` : `Position deleted, but page refresh failed: ${formatActionError(refreshError)}`);
            }
        } catch (error) {
            toast.error(isZh ? `删除岗位失败：${formatActionError(error)}` : `Failed to delete position: ${formatActionError(error)}`);
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
            });
            if (!response.body) throw new Error("No response body");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let fullContent = "";
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, {stream: true});
                let sep = buffer.indexOf("\n\n");
                while (sep !== -1) {
                    const rawEvent = buffer.slice(0, sep);
                    buffer = buffer.slice(sep + 2);
                    sep = buffer.indexOf("\n\n");
                    const dataMatch = rawEvent.match(/data: (.+)/);
                    if (dataMatch) {
                        try {
                            const data = JSON.parse(dataMatch[1]);
                            if (data.delta) {
                                fullContent += data.delta;
                                setJdStreamingContent(fullContent);
                            }
                        } catch { /* ignore malformed */ }
                    }
                }
            }
            if (!mountedRef.current) return;
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
            setJdStreamingContent("");
            setJdViewMode("publish");
            setJdGenerationStatus("idle");
            toast.success(isZh ? "岗位 JD 已生成" : "JD generated");
        } catch (error) {
            if (!mountedRef.current) return;
            setJdGenerationStatus("failed");
            setJdGenerationError(error instanceof Error ? error.message : (isZh ? "未知错误" : "Unknown error"));
            toast.error(isZh ? `生成 JD 失败：${error instanceof Error ? error.message : "未知错误"}` : `JD generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        } finally {
            jdGenerationInFlightRef.current = false;
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
            toast.success(isZh ? "JD 新版本已保存" : "New JD version saved");
            await Promise.all([loadPositionDetail(selectedPositionId), loadDashboard(), loadPositions()]);
            setJdViewMode("publish");
        } catch (error) {
            toast.error(isZh ? `保存 JD 失败：${error instanceof Error ? error.message : "未知错误"}` : `Failed to save the JD: ${error instanceof Error ? error.message : "Unknown error"}`);
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
            toast.success(isZh ? "已切换生效版本" : "Active version switched");
            await Promise.all([loadPositionDetail(selectedPositionId), loadDashboard(), loadPositions()]);
        } catch (error) {
            toast.error(isZh ? `切换 JD 版本失败：${error instanceof Error ? error.message : "未知错误"}` : `Failed to switch JD version: ${error instanceof Error ? error.message : "Unknown error"}`);
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
        if (resumeUploadPositionId === "all" && !resumeUploadOrgCode.trim()) {
            setResumeUploadError(recruitmentUiText.chooseTargetOrganization);
            return;
        }

        const files = resumeUploadFileList;
        const total = files.length;
        const query = buildQuery({
            position_id: resumeUploadPositionId === "all" ? null : resumeUploadPositionId,
            org_code: resumeUploadPositionId === "all" ? resumeUploadOrgCode : null,
            city: resumeUploadCitySource === "manual" ? (resumeUploadCity || null) : null,
            city_source: resumeUploadCitySource,
        });

        const batches: File[][] = [];
        for (let i = 0; i < total; i += BATCH_SIZE) {
            batches.push(Array.from({ length: Math.min(BATCH_SIZE, total - i) },
                (_, j) => files[i + j]));
        }

        setUploadingResume(true);
        setUploadProgress(0);
        setUploadCompletedCount(0);
        abortControllerRef.current = new AbortController();

        let uploadedCount = 0, autoScreenQueued = 0, autoScreenSkipped = 0, autoScreenFailed = 0;
        const allItems: ResumeUploadResponse["items"] = [];
        let batchIndex = 0;

        async function runOneBatch() {
            while (batchIndex < batches.length) {
                if (abortControllerRef.current?.signal.aborted) return;
                const idx = batchIndex++;
                const batch = batches[idx];
                const formData = new FormData();
                batch.forEach((f) => formData.append("files", f));
                const uploaded = await recruitmentApi<ResumeUploadResponse>(
                    `/candidates/upload-resumes${query}`,
                    { method: "POST", body: formData, signal: abortControllerRef.current?.signal }
                );
                uploadedCount += uploaded.uploaded_count;
                autoScreenQueued += uploaded.auto_screen_queued_count;
                autoScreenSkipped += uploaded.auto_screen_skipped_existing_live_task_count;
                autoScreenFailed += uploaded.auto_screen_failed_count;
                allItems.push(...uploaded.items);
                const completed = Math.min((idx + 1) * BATCH_SIZE, total);
                setUploadCompletedCount(completed);
                setUploadProgress(Math.round(completed / total * 100));
            }
        }

        try {
            await Promise.all(Array.from({ length: CONCURRENCY }, runOneBatch));

            allItems.forEach((item) => {
                if (item.auto_screen_task_id && item.auto_screen_task_status && isLiveTaskStatus(item.auto_screen_task_status)) {
                    attachScreeningTaskMonitor(item.id, item.auto_screen_task_id, {
                        suppressFinishToast: true,
                    });
                }
            });
            toast.success(
                isZh
                    ? `已上传 ${uploadedCount} 份简历，自动初筛已入队 ${autoScreenQueued} 份，已跳过进行中任务 ${autoScreenSkipped} 份${autoScreenFailed > 0 ? `，失败 ${autoScreenFailed} 份` : ""}。`
                    : `${uploadedCount} resumes uploaded. Auto-screen queued ${autoScreenQueued}, skipped ${autoScreenSkipped} active task(s)${autoScreenFailed > 0 ? `, failed ${autoScreenFailed}` : ""}.`,
            );
            setResumeUploadOpen(false);
            setResumeUploadError(null);
            setResumeUploadFileList(null);
            setResumeUploadCity("");
            setResumeUploadCitySource("auto");
            await refreshCoreData();
            setActivePage("candidates");
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                toast.warning(isZh ? "上传已取消" : "Upload cancelled");
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

    async function exportCandidates(candidateIds: number[], includeResumes = true) {
        if (!candidateIds.length) {
            toast.error(isZh ? "请先选择要导出的候选人" : "Please select candidates to export");
            return;
        }
        if (exporting) {
            return;
        }
        setExporting(true);
        const exportToastId = toast.loading(isZh ? "正在导出..." : "Exporting...");
        try {
            const response = await authenticatedFetch("/api/recruitment/candidates/export", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    candidate_ids: candidateIds,
                    include_resumes: includeResumes,
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
            toast.success(isZh ? `已导出 ${candidateIds.length} 位候选人` : `Exported ${candidateIds.length} candidates`, {id: exportToastId});
        } catch (error) {
            toast.error(isZh ? `导出失败：${error instanceof Error ? error.message : "未知错误"}` : `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`, {id: exportToastId});
        } finally {
            setExporting(false);
        }
    }

    function openResumeUploadDialog() {
        if (activePage === "positions" && selectedPositionId) {
            setResumeUploadPositionId(String(selectedPositionId));
            setResumeUploadOrgCode(normalizeRecruitmentOrgCode(positionMap.get(selectedPositionId)?.org_code || activeCreateOrgCode));
        } else {
            setResumeUploadPositionId("all");
            setResumeUploadOrgCode(showOrganizationFields ? "" : activeCreateOrgCode);
        }
        setResumeUploadOpen(true);
    }

    async function saveCandidate() {
        if (!selectedCandidateId || candidateSaving) {
            return;
        }
        setCandidateSaving(true);
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
                    age: (() => { const v = Number(candidateEditor.age.trim()); return v && !isNaN(v) ? v : null; })(),
                    city: candidateEditor.city.trim() || null,
                    notes: candidateEditor.notes.trim() || null,
                    tags: splitTags(candidateEditor.tagsText),
                    manual_override_score: candidateEditor.manualOverrideScore.trim()
                        ? Number(candidateEditor.manualOverrideScore)
                        : null,
                    manual_override_reason: candidateEditor.manualOverrideReason.trim() || null,
                    hr_feedback: candidateEditor.hrFeedback || null,
                    hr_feedback_reason: candidateEditor.hrFeedbackReason.trim() || null,
                    owner_id: candidateEditor.ownerId.trim() || null,
                    position_id: candidateEditor.positionId ? Number(candidateEditor.positionId) : null,
                }),
            });
            toast.success(recruitmentToast.updated(recruitmentToastEntities.candidate));
            await Promise.all([loadCandidateDetail(selectedCandidateId), loadCandidates(), loadDashboard(), refreshCandidateStats()]);
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
                loadDashboard(),
                refreshCandidateStats(),
            ]);
        } catch (error) {
            toast.error(recruitmentToast.updateFailed(recruitmentToastEntities.candidate, formatActionError(error)));
        }
    }

    async function triggerScreening(targetCandidateIds?: number[]) {
        const isBatchRequest = Boolean(targetCandidateIds?.length);
        if (isBatchRequest && activeBatchScreeningTaskIds.length) {
            if (isBatchScreeningCancelling) {
                return;
            }
            try {
                const logs = await Promise.all(activeBatchScreeningTaskIds.map((taskId) => cancelTaskGeneration(taskId, recruitmentUiText.batchScreening, {silent: true})));
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
                response.tasks.forEach((task) => {
                    if (!task.related_candidate_id || !task.task_id) {
                        return;
                    }
                    attachScreeningTaskMonitor(task.related_candidate_id, task.task_id, {
                        batch: true,
                        suppressFinishToast: true,
                    });
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
                attachScreeningTaskMonitor(candidateId, task.task_id, {
                    suppressFinishToast: false,
                });
                toast.success(task.reused_existing_task ? recruitmentToast.screeningTaskReused : recruitmentUiText.queueJoined);
            }
        } catch (error) {
            toast.error(isZh ? `发起初筛失败：${formatActionError(error)}` : `Failed to start screening: ${formatActionError(error)}`);
        } finally {
            screeningLaunchInFlightRef.current = false;
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
                toast.error(isZh ? `停止面试题生成失败：${formatActionError(error)}` : `Failed to stop interview question generation: ${formatActionError(error)}`);
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
                        toast.success(log.status === "fallback" ? (isZh ? "面试题已生成（兜底完成）" : "Interview questions generated with fallback") : (isZh ? "面试题已生成" : "Interview questions generated"));
                        return;
                    }
                    if (log.status === "cancelled") {
                        toast.success(isZh ? "已停止面试题生成" : "Interview question generation stopped");
                        return;
                    }
                    toast.error(isZh ? `生成面试题失败：${log.error_message || "未知错误"}` : `Interview question generation failed: ${log.error_message || "Unknown error"}`);
                },
            });
            toast.success(isZh ? "已开始生成面试题，可随时停止" : "Interview question generation started and can be stopped at any time");
        } catch (error) {
            toast.error(isZh ? `生成面试题失败：${error instanceof Error ? error.message : "未知错误"}` : `Interview question generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
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
                    toast.error(isZh ? `停止助手生成失败：${formatActionError(error)}` : `Failed to stop assistant generation: ${formatActionError(error)}`);
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
                    toast.error(isZh ? `本次 AI 调用已回退到兜底结果：${response.fallback_error || "未返回具体原因"}` : `This AI call fell back to a fallback result: ${response.fallback_error || "No specific reason returned"}`);
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
                    await Promise.all([loadLogs({silent: true}), loadDashboard()]);
                    if (log.status === "fallback") {
                        toast.error(isZh ? `本次 AI 调用已回退到兜底结果：${log.error_message || "未返回具体原因"}` : `This AI call fell back to a fallback result: ${log.error_message || "No specific reason returned"}`);
                    } else if (log.status === "failed") {
                        toast.error(isZh ? `发送失败：${log.error_message || "未知错误"}` : `Request failed: ${log.error_message || "Unknown error"}`);
                    } else if (log.status === "cancelled") {
                        toast.success(isZh ? "已停止助手生成" : "Assistant generation stopped");
                    }
                },
            });
        } catch (error) {
            setChatMessages((current) => [
                ...current,
                {
                    id: `e-${Date.now()}`,
                    role: "assistant",
                    content: isZh ? `发送失败：${error instanceof Error ? error.message : "未知错误"}` : `Request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
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
            toast.success(isZh ? "AI 助手上下文已更新" : "AI assistant context updated");
        } catch (error) {
            chatContextRef.current = previousContext;
            setChatContext(previousContext);
            if (options?.quiet) {
                return;
            }
            toast.error(isZh ? `更新助手上下文失败：${error instanceof Error ? error.message : "未知错误"}` : `Failed to update assistant context: ${error instanceof Error ? error.message : "Unknown error"}`);
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
                toast.error("请填写 SMTP Host；163 常用 smtp.163.com，Outlook 常用 smtp-mail.outlook.com");
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
                toast.success("发件箱已更新");
            } else {
                await recruitmentApi(`/mail-senders`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success("发件箱已创建");
            }
            setMailSenderDialogOpen(false);
            try {
                await loadMailSettings();
            } catch (refreshError) {
                toast.error(`发件箱已保存，但邮件配置刷新失败：${formatActionError(refreshError)}`);
            }
        } catch (error) {
            toast.error(`保存发件箱失败：${formatActionError(error)}`);
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
            toast.success(options?.successMessage || "简历邮件已发送");
            if (options?.closeDialog !== false) {
                setResumeMailDialogOpen(false);
            }
            try {
                await loadMailSettings();
            } catch (refreshError) {
                toast.error(`简历邮件已发送，但邮件中心刷新失败：${formatActionError(refreshError)}`);
            }
            return dispatch;
        } catch (error) {
            const errorMessage = `发送简历邮件失败：${formatActionError(error)}`;
            throw new Error(errorMessage); // 重新抛出以便调用方处理
        }
    }

    async function confirmAssistantPreparedResumeMail(messageId: string, preparedMail: RecruitmentAssistantPreparedResumeMail) {
        if (!preparedMail.can_confirm) {
            setResumeMailError(preparedMail.blocking_reason || "当前邮件预览还不能直接发送");
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
            setResumeMailError("请先选择需要发送的候选人");
            return;
        }
        const extraEmails = parseEmailList(resumeMailForm.extraRecipientEmails);
        if (!resumeMailForm.recipientIds.length && !extraEmails.length) {
            setResumeMailError("请至少选择一个内部收件人或填写一个收件人邮箱");
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
                            content: `${resumeMailDialogMode === "resend" ? "已再次发送简历邮件。" : "已发送简历邮件。"}\n- 发送记录：#${dispatch.id}\n- 收件人：${dispatch.recipient_emails.join("、")}\n- 附件：${dispatch.attachment_count} 份简历`,
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
            toast.error(isZh ? `打开简历失败：${error instanceof Error ? error.message : "未知错误"}` : `Failed to open resume: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

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
            toast.success(isZh ? "候选人已删除" : "Candidate deleted");
            setCandidateDeleteTarget(null);
            setSelectedCandidateIds((current) => current.filter((item) => item !== deletedCandidateId));
            setCandidateDetail(null);
            const nextCandidates = await loadCandidates({silent: true});
            await Promise.all([loadDashboard(), loadLogs({silent: true}), refreshCandidateStats()]);
            const nextCandidateId = nextCandidates[0]?.id ?? null;
            setSelectedCandidateId(nextCandidateId);
            selectedCandidateIdRef.current = nextCandidateId;
            if (nextCandidateId) {
                await loadCandidateDetail(nextCandidateId, {silent: true});
            } else {
                setCandidateDetail(null);
            }
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
        try {
            const result = await recruitmentApi<{ deleted_count: number; skipped: { candidate_id: number; reason: string }[] }>("/candidates/batch-delete", {
                method: "POST",
                body: JSON.stringify({ candidate_ids: batchDeleteTargetIds }),
            });
            const deletedCount = result.deleted_count ?? 0;
            const skipped = result.skipped ?? [];
            if (skipped.length > 0) {
                const names = skipped.map((s) => `ID:${s.candidate_id}`).join(", ");
                toast.warning(
                    isZh
                        ? `已删除 ${deletedCount} 位候选人，${skipped.length} 位因任务进行中已被跳过：${names}`
                        : `Deleted ${deletedCount} candidate(s), ${skipped.length} skipped due to active tasks: ${names}`
                );
            } else {
                toast.success(isZh ? `已删除 ${deletedCount} 位候选人` : `Deleted ${deletedCount} candidate(s)`);
            }
            const nextCandidates = await loadCandidates({silent: true});
            await Promise.all([loadDashboard(), loadLogs({silent: true}), refreshCandidateStats()]);
            const nextCandidateId = nextCandidates[0]?.id ?? null;
            setSelectedCandidateId(nextCandidateId);
            selectedCandidateIdRef.current = nextCandidateId;
            setSelectedCandidateIds((current) => current.filter((id) => !batchDeleteTargetIds!.includes(id)));
            if (batchDeleteTargetIds.includes(selectedCandidateIdRef.current ?? -1)) {
                setCandidateDetail(null);
            }
            if (nextCandidateId) {
                await loadCandidateDetail(nextCandidateId, {silent: true});
            } else {
                setCandidateDetail(null);
            }
        } catch (error) {
            setBatchDeleteError(formatActionError(error) || (isZh ? "批量删除候选人失败，请稍后重试" : "Failed to batch delete candidates. Please try again later."));
        } finally {
            setBatchDeleteTargetIds(null);
            setBatchDeleting(false);
        }
    }

    async function batchBindPosition(candidateIds: number[], positionId: number | null) {
        if (!candidateIds.length) {
            return;
        }
        try {
            const result = await recruitmentApi<{ updated_count: number }>("/candidates/batch-update-position", {
                method: "POST",
                body: JSON.stringify({ candidate_ids: candidateIds, position_id: positionId }),
            });
            toast.success(
                isZh
                    ? `已为 ${result.updated_count} 位候选人更新岗位`
                    : `Updated position for ${result.updated_count} candidate(s)`
            );
            await Promise.all([loadCandidates(), loadDashboard(), refreshCandidateStats()]);
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
            toast.success(
                isZh
                    ? `已为 ${result.updated_count} 位候选人变更状态`
                    : `Updated status for ${result.updated_count} candidate(s)`
            );
            await Promise.all([loadCandidates(), loadDashboard(), refreshCandidateStats()]);
            if (selectedCandidateId && candidateIds.includes(selectedCandidateId)) {
                await loadCandidateDetail(selectedCandidateId);
            }
        } catch (error) {
            toast.error(
                isZh
                    ? `批量变更状态失败：${formatActionError(error)}`
                    : `Failed to batch update status: ${formatActionError(error)}`
            );
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
                    ? (isZh ? "简历已删除，候选人已自动切换到剩余简历" : "Resume deleted, and the candidate was switched to a remaining resume automatically")
                    : (isZh ? "简历已删除" : "Resume deleted"),
            );
            setResumeDeleteTarget(null);
            await Promise.all([
                loadCandidates({silent: true}),
                loadDashboard(),
                loadLogs({silent: true}),
                selectedCandidateIdRef.current === result.candidate_id
                    ? loadCandidateDetail(result.candidate_id, {silent: true})
                    : Promise.resolve(null),
            ]);
        } catch (error) {
            toast.error(isZh ? `删除简历失败：${formatActionError(error)}` : `Failed to delete resume: ${formatActionError(error)}`);
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
            toast.success(isZh ? "面试题 HTML 已开始下载" : "Interview question HTML download started");
        } catch (error) {
            toast.error(isZh ? `下载面试题失败：${error instanceof Error ? error.message : "未知错误"}` : `Failed to download interview questions: ${error instanceof Error ? error.message : "Unknown error"}`);
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
        toast.success(isZh ? "面试安排已创建" : "Interview schedule created");
        if (selectedCandidateId) {
            await loadInterviewSchedules(selectedCandidateId);
        }
        return data;
    }

    async function deleteInterviewSchedule(scheduleId: number) {
        await recruitmentApi(`/interview-schedules/${scheduleId}`, {method: "DELETE"});
        toast.success(isZh ? "面试安排已删除" : "Interview schedule deleted");
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
        toast.success(isZh ? "跟进记录已添加" : "Follow-up added");
        if (selectedCandidateId) {
            await loadFollowUps(selectedCandidateId);
        }
        return data;
    }

    async function deleteFollowUp(followUpId: number) {
        await recruitmentApi(`/follow-ups/${followUpId}`, {method: "DELETE"});
        toast.success(isZh ? "跟进记录已删除" : "Follow-up deleted");
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
        toast.success(isZh ? "Offer 已创建" : "Offer created");
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
        toast.success(isZh ? "Offer 已更新" : "Offer updated");
        if (selectedCandidateId) {
            await loadOffers(selectedCandidateId);
        }
        return data;
    }

    async function deleteOffer(offerId: number) {
        await recruitmentApi(`/offers/${offerId}`, {method: "DELETE"});
        toast.success(isZh ? "Offer 已删除" : "Offer deleted");
        if (selectedCandidateId) {
            await loadOffers(selectedCandidateId);
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
                taskTypes: (skill.task_types || []) as SkillTaskKind[],
                sortOrder: String(skill.sort_order ?? 99),
                isEnabled: skill.is_enabled,
            });
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
                taskTypes: (skill.task_types || []) as SkillTaskKind[],
                sortOrder: String(skill.sort_order ?? 99),
                isEnabled: skill.is_enabled,
            });
        } else {
            setSkillEditingId(null);
            setSkillForm(emptySkillForm());
            setSkillEditorData(emptyScreeningSkillForm());
        }
        setSkillEditorDefaultTab("structured");
        setSkillAutoBindCategory(null);
        setSkillFormErrors({});
        setSkillFormSubmitError(null);
        setSkillDialogOpen(true);
    }

    function openSkillEditorWithAI() {
        setSkillEditingId(null);
        setSkillForm(emptySkillForm());
        setSkillEditorData(emptyScreeningSkillForm());
        setSkillEditorDefaultTab("ai");
        setSkillAutoBindCategory(null);
        setSkillFormErrors({});
        setSkillFormSubmitError(null);
        setSkillDialogOpen(true);
    }

    function openSkillEditorForPosition(taskKind: SkillTaskKind, bindCategory: "jdSkillIds" | "screeningSkillIds" | "interviewSkillIds") {
        const roleName = positionForm.title.trim();
        const empty = emptyScreeningSkillForm();
        empty.taskTypes = [taskKind];
        if (roleName) {
            empty.roleName = roleName;
            empty.name = taskKind === "jd" ? `${roleName} JD Skill` : taskKind === "screening" ? `${roleName}初筛评分 Skill` : `${roleName}面试题 Skill`;
        }
        setSkillEditingId(null);
        const skillFormState = emptySkillForm();
        skillFormState.taskTypes = [taskKind];
        if (roleName) {
            skillFormState.name = empty.name;
        }
        setSkillForm(skillFormState);
        setSkillEditorData(empty);
        setSkillEditorDefaultTab("structured");
        setSkillAutoBindCategory(bindCategory);
        setSkillFormErrors({});
        setSkillFormSubmitError(null);
        setSkillDialogOpen(true);
    }

    async function submitStructuredSkill(data: ScreeningSkillFormData) {
        if (skillSubmitting) return;
        if (!data.name.trim()) {
            setSkillFormSubmitError("请输入 Skill 名称");
            return;
        }
        if (!data.taskTypes.length) {
            setSkillFormSubmitError("请选择适用场景");
            return;
        }
        setSkillFormSubmitError(null);
        setSkillSubmitting(true);
        try {
            const content = generateSkillContent(data);
            const payload = {
                name: data.name.trim(),
                description: data.description.trim() || null,
                content: content.trim(),
                tags: splitTags(data.tagsText),
                task_types: data.taskTypes,
                sort_order: Number(data.sortOrder || "99"),
                is_enabled: data.isEnabled,
            };
            if (skillEditingId) {
                await recruitmentApi(`/skills/${skillEditingId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success(recruitmentToast.updated(recruitmentToastEntities.skill));
            } else {
                const result = await recruitmentApi<{data: RecruitmentSkill}>("/skills", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                const newSkillId = result?.data?.id;
                if (newSkillId && skillAutoBindCategory) {
                    setPositionForm((current) => ({
                        ...current,
                        [skillAutoBindCategory]: [newSkillId],
                    }));
                }
                toast.success(recruitmentToast.created(recruitmentToastEntities.skill));
            }
            setSkillAutoBindCategory(null);
            setSkillDialogOpen(false);
            await loadSkills();
        } catch (error) {
            const resolved = resolveSkillSubmitError(error);
            setSkillFormSubmitError(resolved.submitError);
        }
        setSkillSubmitting(false);
    }

    async function generateSkillWithAI(roleName: string, roleBackground: string, onDelta?: (delta: string) => void): Promise<string> {
        setSkillGenerating(true);
        let fullContent = "";
        try {
            const response = await authenticatedFetch("/api/recruitment/skills/generate-content", {
                method: "POST",
                headers: {"Content-Type": "application/json", Accept: "text/event-stream"},
                body: JSON.stringify({role_name: roleName, role_background: roleBackground || null}),
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
                    const dataMatch = rawEvent.match(/data: (.+)/);
                    if (dataMatch) {
                        try {
                            const data = JSON.parse(dataMatch[1]);
                            if (data.delta) {
                                fullContent += data.delta;
                                onDelta?.(data.delta);
                            }
                        } catch { /* ignore malformed */ }
                    }
                }
            }
        } catch (error) {
            toast.error(formatActionError(error));
        }
        setSkillGenerating(false);
        return fullContent;
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
        try {
            const payload = {
                name: skillForm.name.trim(),
                description: skillForm.description.trim() || null,
                content: skillForm.content.trim(),
                tags: splitTags(skillForm.tagsText),
                sort_order: Number(skillForm.sortOrder || "99"),
                is_enabled: skillForm.isEnabled,
            };
            if (skillEditingId) {
                await recruitmentApi(`/skills/${skillEditingId}`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
                toast.success(recruitmentToast.updated(recruitmentToastEntities.skill));
            } else {
                await recruitmentApi(`/skills`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success(recruitmentToast.created(recruitmentToastEntities.skill));
            }
            setSkillDialogOpen(false);
            await loadSkills();
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
            toast.success(enabled ? (isZh ? "Skill 已启用" : "Skill enabled") : (isZh ? "Skill 已停用" : "Skill disabled"));
            await loadSkills();
        } catch (error) {
            toast.error(recruitmentToast.saveFailed(recruitmentToastEntities.skill, formatActionError(error)));
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
        setLlmFormErrors({});
        setLlmFormSubmitError(null);
        setLlmDialogOpen(true);
    }

    function copyLLMEditor(config: RecruitmentLLMConfig) {
        setLlmEditingId(null);
        setLlmForm({
            configKey: `${config.config_key}-copy`,
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
            isZh ? "说明这次对话用了哪些 Skills" : "Explain which skills this conversation used",
            isZh ? "当前使用什么模型" : "Which model is being used now",
        ];
        const workspaceSuggestionPrompts = [
            isZh ? "帮我生成 IoT 测试工程师 JD" : "Generate an IoT Test Engineer JD",
            isZh ? "查看当前岗位候选人列表" : "Show candidates for the current position",
            isZh ? "重新对当前候选人初筛，硬性要求加强硬件测试经验" : "Re-screen the current candidate with stronger hardware testing requirements",
            isZh ? "给当前候选人生成初试题，重点考察硬件联调" : "Generate first-round interview questions focused on hardware integration",
            isZh ? "说明这次对话用了哪些 Skills 和模型" : "Explain which skills and model this conversation used",
        ];
        const quickActionPrompts = isWorkspace ? workspaceSuggestionPrompts : suggestionPrompts;
        const collapsedQuickActionPrompts = quickActionPrompts.slice(0, Math.min(3, quickActionPrompts.length));
        const visibleQuickActionPrompts = assistantQuickActionsExpanded ? quickActionPrompts : collapsedQuickActionPrompts;
        const hasMoreQuickActions = quickActionPrompts.length > collapsedQuickActionPrompts.length;
        const summaryChips = [
            {key: "position", label: shortText(chatContext.position_title || recruitmentUiText.unspecifiedPosition, 18), dotClassName: "bg-sky-500"},
            {key: "candidate", label: shortText(chatContextCandidateLabel, 18), dotClassName: "bg-amber-500"},
            {key: "skills", label: `${chatContext.skills?.length || 0} Skills`, dotClassName: "bg-emerald-500"},
            {key: "model", label: shortText(assistantActiveLLMConfig?.resolved_model_name || assistantActiveLLMConfig?.model_name || recruitmentUiText.modelUnrecognized, 18), dotClassName: "bg-violet-500"},
        ];
        const assistantContextPanel = (
                <div className="flex h-full min-h-0 flex-col space-y-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{recruitmentUiText.assistantContextShort}</p>
                            <p className="mt-1 hidden text-xs leading-5 text-slate-500 dark:text-slate-400 2xl:block">
                                {isZh ? "按需展开岗位、Skills 和模型配置，不再长期挤压主聊天区。" : "Expand position, skill, and model settings only when needed so the main chat area stays clear."}
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
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{recruitmentUiText.currentPosition}</p>
                        <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{chatContext.position_title || recruitmentUiText.unspecifiedPosition}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{recruitmentUiText.activeSkills}</p>
                        <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{recruitmentUiText.skillCount(assistantContextSkills.length)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{recruitmentUiText.currentModel}</p>
                        <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{assistantActiveLLMConfig?.resolved_model_name || assistantActiveLLMConfig?.model_name || recruitmentUiText.modelUnrecognized}</p>
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
                                    "rounded-full border px-3 py-2 text-xs font-medium transition",
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
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
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
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{recruitmentUiText.assistantLabel}</p>
                                </div>
                                <p className="mt-1 hidden text-xs text-slate-500 dark:text-slate-400 2xl:block">
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
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{recruitmentUiText.assistantLabel}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                            <Button variant={isPage ? "default" : "ghost"} size="sm" className="h-7 rounded-full px-2.5 text-xs"
                                    onClick={() => openAssistantMode("page")}>
                                {isZh ? "页内" : "In Page"}
                            </Button>
                            <Button variant={mode === "drawer" ? "default" : "ghost"} size="sm" className="h-7 rounded-full px-2.5 text-xs"
                                    onClick={() => openAssistantMode("drawer")}>
                                {isZh ? "浮层" : "Drawer"}
                            </Button>
                            <Button variant={isFullscreen ? "default" : "ghost"} size="sm" className="h-7 rounded-full px-2.5 text-xs"
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
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">{isZh ? "邮件发送预览" : "Email Preview"}</p>
                                                                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
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
                                                <p className="mt-2 text-[11px] opacity-70">{formatDateTime(message.createdAt)}</p>
                                            </div>
                                        ))}
                                        {chatSending ? (
                                            <div className="flex items-center gap-2 text-sm text-slate-500">
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
                                    placeholder={isZh ? "例如：重新对当前候选人初筛，硬性要求加强硬件测试经验；或说明这次用了哪些 Skills" : "For example: re-screen the current candidate with stronger hardware-testing requirements, or explain which skills were used this time"}
                                />
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                    <p className="hidden text-xs text-slate-500 dark:text-slate-400 2xl:block">
                                        {isZh ? "助手会自动携带当前岗位与启用 Skill 上下文，适合连续执行筛选、生成和查询操作。按 Ctrl/Cmd + Enter 可直接发送。" : "The assistant automatically carries the current position and enabled skill context, which works well for screening, generation, and lookup flows. Press Ctrl/Cmd + Enter to send."}
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
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{isZh ? `助手已在${modeLabel}打开` : `Assistant is already open in ${modeLabel}`}</h3>
                    <p className="max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">
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
                todayScreeningPassed={todayScreeningPassed}
                todoSummary={todoSummary}
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
                        : "xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]",
                )}
            >
                <div className="position-panel relative min-h-0">
                    <div className={cn("position-panel-header", positionListCollapsed && "collapsed")}>
                        {positionListCollapsed ? (
                            <div className="flex items-center justify-center">
                                <span className="position-panel-title">{isZh ? "岗位" : "Positions"}</span>
                            </div>
                        ) : (
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="position-panel-title">{isZh ? "岗位列表" : "Position List"}</span>
                                    <span className="position-panel-count">({visiblePositions.length}/{positions.length})</span>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-3 h-8 w-full rounded-xl border-slate-200/80 bg-white/80 text-xs text-slate-700 shadow-none hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-900/70"
                                    onClick={openCreatePosition}
                                >
                                    <Plus className="mr-1 h-4 w-4"/>
                                    {isZh ? "新增岗位" : "Add Position"}
                                </Button>
                            </div>
                        )}
                    </div>

                    {!positionListCollapsed ? (
                        <div className="flex-shrink-0 px-4 pb-3">
                            <SearchField
                                value={positionQuery}
                                onChange={setPositionQuery}
                                placeholder={isZh ? "搜索岗位、部门、地点" : "Search positions, departments, locations"}
                                inputClassName="h-9 rounded-xl border-slate-200/80 bg-white/80 text-xs shadow-none placeholder:text-slate-400 focus-visible:ring-2 dark:border-slate-800 dark:bg-slate-950/60 dark:placeholder:text-slate-500"
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
                                            positionListCollapsed && "px-2.5 py-2.5",
                                        )}
                                    >
                                        {isSelected ? <span className="absolute inset-y-3 left-0 w-0.5 rounded-r-full bg-slate-900 dark:bg-slate-100"/> : null}
                                        {positionListCollapsed ? (
                                            <div className="min-w-0 space-y-1 pl-1">
                                                <p className="truncate text-[12px] font-semibold leading-5 text-slate-900 dark:text-slate-100">{position.title}</p>
                                                <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                                                    <span className="truncate">{position.location || position.department || (isZh ? "岗位" : "Position")}</span>
                                                    <span className="h-1 w-1 shrink-0 rounded-full bg-current/45"/>
                                                    <span className="shrink-0">{labelForPositionStatus(position.status)}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="min-w-0 space-y-2">
                                                <p className="line-clamp-2 text-[13px] font-semibold leading-5 text-slate-900 dark:text-slate-100">{position.title}</p>
                                                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                                                    {showOrganizationColumn ? (
                                                        <Badge
                                                            variant="outline"
                                                            className="max-w-full rounded-full border-slate-200/80 bg-slate-50/80 px-2 py-0 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
                                                        >
                                                            <span className="max-w-[160px] truncate">{getOrganizationLabel(position.org_code)}</span>
                                                        </Badge>
                                                    ) : null}
                                                    <Badge className={cn("rounded-full border px-2 py-0 text-[10px]", statusBadgeClass("position", position.status))}>
                                                        {labelForPositionStatus(position.status)}
                                                    </Badge>
                                                    <span className="rounded-full border border-transparent px-1.5 text-[11px] font-medium leading-5 text-slate-500 dark:text-slate-400">
                                                        {isZh ? `候选人 ${position.candidate_count}` : `Candidates ${position.candidate_count}`}
                                                    </span>
                                                </div>
                                                <p
                                                    className="truncate text-[11px] leading-5 text-slate-500 dark:text-slate-400"
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

                <div className="min-h-0 overflow-hidden">
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
                                                className="h-8 rounded-xl px-3 text-xs"
                                                variant={positionWorkspaceView === "jd" ? "default" : "outline"}
                                                onClick={() => setPositionWorkspaceView("jd")}
                                            >
                                                {isZh ? "当前 JD" : "Current JD"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="h-8 rounded-xl px-3 text-xs"
                                                variant={positionWorkspaceView === "config" ? "default" : "outline"}
                                                onClick={() => setPositionWorkspaceView("config")}
                                            >
                                                {isZh ? "岗位配置" : "Position Settings"}
                                            </Button>
                                            <span className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                {positionDetail.position.title}
                                            </span>
                                        </div>
                                        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] leading-none text-slate-500 dark:text-slate-400">
                                            <span className="whitespace-nowrap">{isZh ? `招聘人数 ${positionDetail.position.headcount}` : `Headcount ${positionDetail.position.headcount}`}</span>
                                            <span className="whitespace-nowrap">{isZh ? `JD 版本 ${positionDetail.jd_versions.length}` : `JD Versions ${positionDetail.jd_versions.length}`}</span>
                                            <span className="whitespace-nowrap">{isZh ? `候选人 ${positionDetail.candidates.length}` : `Candidates ${positionDetail.candidates.length}`}</span>
                                            <span className="whitespace-nowrap">{isZh ? `最近更新 ${formatDateTime(positionDetail.position.updated_at)}` : `Updated ${formatDateTime(positionDetail.position.updated_at)}`}</span>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 shrink-0 rounded-xl px-3 text-xs"
                                            onClick={() => setPositionSecondaryPanelOpen((current) => !current)}
                                        >
                                            {positionSecondaryPanelOpen ? (isZh ? "收起次级区" : "Hide Side Panel") : (isZh ? "版本与关联" : "Versions & Links")}
                                        </Button>
                                    </div>

                                    {positionWorkspaceView === "jd" ? (
                                        <Card className={panelClass}>
                                            <CardHeader className="space-y-3">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div className="space-y-2">
                                                        <CardTitle className="text-lg">{isZh ? "当前 JD" : "Current JD"}</CardTitle>
                                                        <div className="flex flex-wrap gap-2">
                                                            <Badge className={cn("rounded-full border", statusBadgeClass("task", currentJDGenerationStatus === "syncing" ? "running" : currentJDGenerationStatus))}>
                                                                {labelForJDGenerationStatus(currentJDGenerationStatus)}
                                                            </Badge>
                                                            <Badge variant="outline" className="rounded-full">
                                                                {isZh ? `当前版本 ${currentJDVersion ? `V${currentJDVersion.version_no}` : "未生成"}` : `Current Version ${currentJDVersion ? `V${currentJDVersion.version_no}` : "Not generated"}`}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => void generateJD()}
                                                            disabled={isJDGenerating}
                                                        >
                                                            <Wand2 className="h-4 w-4"/>
                                                            {isJDGenerating
                                                                ? (isZh ? "生成中..." : "Generating...")
                                                                : (isZh ? "AI 生成 JD" : "Generate JD")}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => {
                                                                setCandidatePositionFilter([String(positionDetail.position.id)]);
                                                                setActivePage("candidates");
                                                            }}
                                                        >
                                                            <Users className="h-4 w-4"/>
                                                            {isZh ? "查看候选人" : "View Candidates"}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => {
                                                                if (positionDetail.candidates[0]) {
                                                                    setSelectedCandidateId(positionDetail.candidates[0].id);
                                                                    setActivePage("candidates");
                                                                } else {
                                                                    toast.error(isZh ? "这个岗位还没有候选人，暂时无法直接生成面试题" : "This position has no candidates yet, so interview questions cannot be generated.");
                                                                }
                                                            }}
                                                        >
                                                            <NotebookText className="h-4 w-4"/>
                                                            {isZh ? "生成面试题模板" : "Generate Interview Template"}
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="grid gap-3 md:grid-cols-3">
                                                    <InfoTile label={isZh ? "最近生成时间" : "Last Generated"} value={formatLongDateTime(positionDetail.jd_generation?.last_generated_at || currentJDVersion?.created_at)}/>
                                                    <InfoTile label={isZh ? "当前生效版本" : "Active Version"} value={currentJDVersion ? `${currentJDVersion.title} · V${currentJDVersion.version_no}` : (isZh ? "暂无生效版本" : "No active version")}/>
                                                    <InfoTile label={isZh ? "最近使用模型" : "Last Model"} value={positionDetail.jd_generation?.model_name || positionDetail.jd_generation?.model_provider || (isZh ? "暂未记录" : "Unrecorded")}/>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                <Field label={isZh ? "AI 生成附加要求" : "AI Generation Notes"}>
                                                    <Textarea
                                                        value={jdExtraPrompt}
                                                        onChange={(event) => setJdExtraPrompt(event.target.value)}
                                                        rows={3}
                                                        placeholder={isZh ? "补充本次 JD 生成时的个性化要求，例如强调 IoT 场景、自动化测试、设备联调经验等。" : "Add generation-specific requirements, for example emphasizing IoT scenarios, automation testing, or device integration experience."}
                                                    />
                                                </Field>

                                                <div className="grid gap-4 lg:grid-cols-2">
                                                    <Field label={isZh ? "版本标题" : "Version Title"}>
                                                        <Input
                                                            value={jdDraft.title}
                                                            onChange={(event) => setJdDraft((current) => ({
                                                                ...current,
                                                                title: event.target.value,
                                                            }))}
                                                        />
                                                    </Field>
                                                    <Field label={isZh ? "版本备注" : "Version Notes"}>
                                                        <Input
                                                            value={jdDraft.notes}
                                                            onChange={(event) => setJdDraft((current) => ({
                                                                ...current,
                                                                notes: event.target.value,
                                                            }))}
                                                            placeholder={isZh ? "例如：偏向 IoT 自动化测试" : "For example: focused on IoT automation testing"}
                                                        />
                                                    </Field>
                                                </div>

                                                {latestJDGenerationError ? (
                                                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                                                        {isZh ? `最近一次生成失败：${latestJDGenerationError}` : `Latest generation failed: ${latestJDGenerationError}`}
                                                    </div>
                                                ) : null}

                                                {isJDGenerating ? (
                                                    <div className="rounded-[22px] border border-sky-200 bg-sky-50/80 px-5 py-5 dark:border-sky-900 dark:bg-sky-950/30">
                                                        <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-200">
                                                            <Loader2 className="h-4 w-4 animate-spin"/>
                                                            {jdGenerationStatus === "syncing"
                                                                ? (isZh ? "正在同步最新 JD 到页面..." : "Syncing the latest JD back to the page...")
                                                                : (isZh ? "正在生成 JD..." : "Generating JD...")}
                                                        </div>
                                                        {jdStreamingContent ? (
                                                            <div className="mt-4 whitespace-pre-wrap rounded-[18px] border bg-white/80 px-4 py-3 text-sm leading-7 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200 max-h-[400px] overflow-y-auto">
                                                                {jdStreamingContent}
                                                            </div>
                                                        ) : (
                                                            <div className="mt-4 grid gap-3">
                                                                <div className="h-4 rounded-full bg-sky-100 dark:bg-sky-900/60"/>
                                                                <div className="h-4 w-11/12 rounded-full bg-sky-100 dark:bg-sky-900/60"/>
                                                                <div className="h-24 rounded-[18px] bg-white/80 dark:bg-slate-900/70"/>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : null}

                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button variant={jdViewMode === "publish" ? "default" : "outline"} size="sm" onClick={() => setJdViewMode("publish")}>
                                                            {isZh ? "可直接发布版" : "Publish Copy"}
                                                        </Button>
                                                        <Button variant={jdViewMode === "markdown" ? "default" : "outline"} size="sm" onClick={() => setJdViewMode("markdown")}>
                                                            {isZh ? "Markdown 源文本" : "Markdown Source"}
                                                        </Button>
                                                        <Button variant={jdViewMode === "preview" ? "default" : "outline"} size="sm" onClick={() => setJdViewMode("preview")}>
                                                            {isZh ? "预览版" : "Preview"}
                                                        </Button>
                                                    </div>
                                                    <Button variant="outline" size="sm" onClick={() => void copyPublishJDText()} disabled={!currentPublishText.trim()}>
                                                        <ClipboardCheck className="h-4 w-4"/>
                                                        {isZh ? "一键复制发布文案" : "Copy Publish Copy"}
                                                    </Button>
                                                </div>

                                                {jdViewMode === "publish" ? (
                                                    <div className="min-h-[360px] whitespace-pre-wrap rounded-2xl border border-slate-200/80 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                                                        {currentPublishText || (isZh ? "当前还没有可直接发布的 JD 文案，点击“AI 生成 JD”后会在这里展示。" : "There is no publish-ready JD copy yet. Click “Generate JD” and it will appear here.")}
                                                    </div>
                                                ) : null}

                                                {jdViewMode === "markdown" ? (
                                                    <Field label={isZh ? "JD Markdown 源文本" : "JD Markdown Source"}>
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
                                                    <Field label={isZh ? "预览版" : "Preview"}>
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
                                                        {isZh ? "保存后设为生效版本" : "Set as Active Version After Saving"}
                                                    </label>
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button variant="outline" onClick={() => void generateJD()} disabled={isJDGenerating}>
                                                            <Sparkles className="h-4 w-4"/>
                                                            {isJDGenerating
                                                                ? (isZh ? "生成中..." : "Generating...")
                                                                : (isZh ? "重新生成" : "Regenerate")}
                                                        </Button>
                                                        <Button onClick={() => void saveJDVersion()} disabled={jdVersionSaving}>
                                                            <Save className="h-4 w-4"/>
                                                            {jdVersionSaving ? (isZh ? "保存中..." : "Saving...") : (isZh ? "保存新版本" : "Save New Version")}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ) : (
                                        <Card className={panelClass}>
                                            <CardHeader className="space-y-3">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <CardTitle className="text-lg">{isZh ? "岗位配置" : "Position Settings"}</CardTitle>
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

                                                <Field label={isZh ? "Skill 与自动化配置" : "Skills & Automation"}>
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        <InfoTile label={isZh ? "JD 生成 Skill" : "JD Skills"} value={(positionDetail.position.jd_skill_ids || []).length ? formatSkillNames(positionDetail.position.jd_skill_ids || [], skillMap) : (isZh ? "未选择，自动使用系统通用基座" : "Not selected, using the system base")}/>
                                                        <InfoTile label={isZh ? "初筛绑定 Skills" : "Screening Skills"} value={(positionDetail.position.screening_skill_ids || []).length ? formatSkillNames(positionDetail.position.screening_skill_ids || [], skillMap) : (isZh ? "未选择，自动使用系统通用基座" : "Not selected, using the system base")}/>
                                                        <InfoTile label={isZh ? "面试题 Skill" : "Interview Skills"} value={(positionDetail.position.interview_skill_ids || []).length ? formatSkillNames(positionDetail.position.interview_skill_ids || [], skillMap) : (isZh ? "未选择，自动使用系统通用基座" : "Not selected, using the system base")}/>
                                                        <InfoTile label={isZh ? "自动流程" : "Automation"} value={`${positionDetail.position.auto_screen_on_upload ? (isZh ? "上传自动初筛已开启" : "Auto-screen on upload is on") : (isZh ? "上传自动初筛未开启" : "Auto-screen on upload is off")} · ${positionDetail.position.auto_advance_on_screening === false ? (isZh ? "通过后自动推进关闭" : "Auto-advance after pass is off") : (isZh ? "通过后自动推进开启" : "Auto-advance after pass is on")}`}/>
                                                    </div>
                                                </Field>

                                                <Field label={isZh ? "岗位摘要" : "Position Summary"}>
                                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 text-sm leading-7 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
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
                                                <CardTitle className="text-lg">{isZh ? "JD 历史版本" : "JD History"}</CardTitle>
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
                                                                {version.is_active ? (isZh ? "当前生效" : "Active") : (isZh ? "历史版本" : "Historical")}
                                                            </Badge>
                                                        </div>
                                                        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{shortText(version.notes || version.prompt_snapshot || version.jd_markdown, 110)}</p>
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
                                                <CardTitle className="text-lg">{isZh ? "关联候选人" : "Linked Candidates"}</CardTitle>
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
                                                                setActivePage("candidates");
                                                            }}
                                                        >
                                                            <div>
                                                                <p className="font-medium text-slate-900 dark:text-slate-100">{candidate.name}</p>
                                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                                    {isZh ? "匹配度" : "Match"} {formatPercent(candidate.match_percent)} · {candidate.phone || (isZh ? "未填写手机号" : "No phone number")}
                                                                </p>
                                                            </div>
                                                            <Badge className={cn("rounded-full border", statusBadgeClass("candidate", displayStatus))}>
                                                                {labelForCandidateStatus(displayStatus)}
                                                            </Badge>
                                                        </button>
                                                    );
                                                }) : (
                                                    <EmptyState title={isZh ? "暂无候选人" : "No Candidates"} description={isZh ? "上传简历并关联到这个岗位后，这里会出现最新候选人列表。" : "Upload resumes and link them to this position to see candidates here."}/>
                                                )}
                                            </CardContent>
                                        </Card>

                                        <Card className={panelClass}>
                                            <CardHeader className="space-y-2">
                                                <CardTitle className="text-lg">{isZh ? "发布状态" : "Publish Status"}</CardTitle>
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
                                                                {isZh ? "查看发布链接" : "Open Published Link"}
                                                                <ExternalLink className="h-4 w-4"/>
                                                            </a>
                                                        ) : null}
                                                        {task.error_message ? <p className="mt-3 text-sm text-rose-600">{task.error_message}</p> : null}
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
                isBatchScreeningCancelling={isBatchScreeningCancelling}
                screeningSubmitting={screeningSubmitting}
                isBatchScreeningRunning={isBatchScreeningRunning}
                openResumeMailDialog={openResumeMailDialog}
                candidatesLoading={candidatesLoading}
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
                canManageRecruitment={canManageRecruitment}
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
                        <Button variant="outline" size="sm" onClick={onBack} className="rounded-xl px-3">
                            <ArrowLeft className="h-4 w-4"/>
                            {recruitmentUiText.back}
                        </Button>
                        <div className="flex min-w-0 items-baseline gap-3">
                            <h1 className="shrink-0 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
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
                            onOrgScopeChange={(orgScope, deptScope) => {
                                setSelectedOrgScope(orgScope);
                                setSelectedDepartmentScope(deptScope);
                                void refreshCoreData({ silent: true, departmentScope: deptScope, orgScope: orgScope });
                            }}
                            allDepartmentsLabel={recruitmentUiText.allVisibleDepartments}
                            disabled={organizationCatalogLoading}
                        />
                        <Button variant="outline" onClick={() => void refreshCoreDataWithFeedback()}
                                disabled={coreRefreshing} className="rounded-xl">
                            {coreRefreshing ? <Loader2 className="h-4 w-4 animate-spin"/> :
                                <RefreshCw className="h-4 w-4"/>}
                            {coreRefreshing ? recruitmentUiText.refreshing : recruitmentUiText.refresh}
                        </Button>
                        <Button variant="outline" onClick={openResumeUploadDialog} className="rounded-xl">
                            <Upload className="h-4 w-4"/>
                            {recruitmentUiText.uploadResume}
                        </Button>
                        <Button onClick={openCreatePosition} className="rounded-xl">
                            <Plus className="h-4 w-4"/>
                            {recruitmentUiText.createPosition}
                        </Button>
                        <Button
                            className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                            onClick={() => openAssistantMode("drawer")}>
                            <Bot className="h-4 w-4"/>
                            {recruitmentUiText.openAssistantDrawer}
                        </Button>
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
                                        <SettingsEntry
                                            title={recruitmentUiText.settingsSkillsTitle}
                                            description={recruitmentUiText.settingsSkillsDescription}
                                            onClick={() => navigateToSettingsPage("settings-skills")}
                                        />
                                        <SettingsEntry
                                            title={recruitmentUiText.settingsModelsTitle}
                                            description={recruitmentUiText.settingsModelsDescription}
                                            onClick={() => navigateToSettingsPage("settings-models")}
                                        />
                                        <SettingsEntry
                                            title={recruitmentUiText.settingsMailTitle}
                                            description={recruitmentUiText.settingsMailDescription}
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
                        "grid min-h-0 flex-1",
                    navCollapsed ? "lg:grid-cols-[56px_minmax(0,1fr)]" : "lg:grid-cols-[176px_minmax(0,1fr)] 2xl:grid-cols-[188px_minmax(0,1fr)]",
                )}
            >
                <div className="relative min-h-0">
                    <aside
                        className={cn(
                            "flex h-full min-h-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white/70 px-2 py-3.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/50",
                            navCollapsed ? "lg:px-1" : "lg:px-2.5",
                        )}
                    >
                        {!navCollapsed ? (
                            <div className="mb-3 flex items-center justify-center">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{recruitmentUiText.workSections}</p>
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
                                title={recruitmentUiText.workspaceTitle}
                                description={recruitmentUiText.workspaceDescription}
                                count={scopedDashboard.cards.positions_recruiting}
                                collapsed={navCollapsed}
                                buttonRef={(node) => {
                                    primaryNavButtonRefs.current.workspace = node;
                                }}
                                onClick={() => navigatePrimaryPage("workspace")}
                            />
                            <SectionNavButton
                                active={activePrimaryNavPage === "positions"}
                                icon={BriefcaseBusiness}
                                title={recruitmentUiText.positionsTitle}
                                description={recruitmentUiText.positionsDescription}
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
                                title={recruitmentUiText.candidatesTitle}
                                description={recruitmentUiText.candidatesDescription}
                                count={candidateStats?.total ?? candidates.length}
                                collapsed={navCollapsed}
                                buttonRef={(node) => {
                                    primaryNavButtonRefs.current.candidates = node;
                                }}
                                onClick={() => navigatePrimaryPage("candidates")}
                            />
                            <SectionNavButton
                                active={activePrimaryNavPage === "audit"}
                                icon={History}
                                title={recruitmentUiText.auditTitle}
                                description={recruitmentUiText.auditDescription}
                                count={aiLogStats?.total ?? allAiLogs.length}
                                collapsed={navCollapsed}
                                buttonRef={(node) => {
                                    primaryNavButtonRefs.current.audit = node;
                                }}
                                onClick={() => navigatePrimaryPage("audit")}
                            />
                            <SectionNavButton
                                active={activePrimaryNavPage === "assistant"}
                                icon={Bot}
                                title={recruitmentUiText.assistantNavTitle}
                                description={recruitmentUiText.assistantNavDescription}
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
                                            title={recruitmentUiText.quickAddPosition}
                                        >
                                            <Plus className="h-4.5 w-4.5" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="rounded-xl px-3 py-2 text-xs">
                                        {recruitmentUiText.quickAddPosition}
                                    </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={openResumeUploadDialog}
                                            className="flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200/80 bg-white/85 text-slate-700 transition hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950/80 dark:text-slate-200"
                                            title={recruitmentUiText.uploadResume}
                                        >
                                            <Upload className="h-4.5 w-4.5" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="rounded-xl px-3 py-2 text-xs">
                                        {recruitmentUiText.uploadResume}
                                    </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div
                                            className="flex h-11 w-full flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200"
                                            title={recruitmentUiText.pendingScreeningCandidates}
                                        >
                                            <span className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">{recruitmentUiText.pendingScreeningShort}</span>
                                            <span className="text-sm font-semibold leading-4">{todoSummary.pendingScreening}</span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="rounded-xl px-3 py-2 text-xs">
                                        {recruitmentUiText.pendingScreeningCandidates} {todoSummary.pendingScreening}
                                    </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div
                                            className="flex h-11 w-full flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200"
                                            title={recruitmentUiText.pendingInterviewCandidates}
                                        >
                                            <span className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">{recruitmentUiText.pendingInterviewShort}</span>
                                            <span className="text-sm font-semibold leading-4">{todoSummary.pendingInterview}</span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="rounded-xl px-3 py-2 text-xs">
                                        {recruitmentUiText.pendingInterviewCandidates} {todoSummary.pendingInterview}
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
                                                <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 2xl:text-[13px]">{recruitmentUiText.todayTodos}</p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-1.5">
                                                <div className="rounded-xl bg-slate-100/80 px-2 py-1.5 dark:bg-slate-900/80 2xl:px-2.5">
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{recruitmentUiText.pendingPublish}</p>
                                                    <p className="mt-0.5 text-[18px] font-semibold leading-none text-slate-800 dark:text-slate-200 2xl:text-[20px]">
                                                        {todoSummary.pendingPublish}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl bg-slate-100/80 px-2 py-1.5 dark:bg-slate-900/80 2xl:px-2.5">
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{recruitmentUiText.pendingScreening}</p>
                                                    <p className="mt-0.5 text-[18px] font-semibold leading-none text-slate-800 dark:text-slate-200 2xl:text-[20px]">
                                                        {todoSummary.pendingScreening}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl bg-slate-100/80 px-2 py-1.5 dark:bg-slate-900/80 2xl:px-2.5">
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{recruitmentUiText.pendingInterview}</p>
                                                    <p className="mt-0.5 text-[18px] font-semibold leading-none text-slate-800 dark:text-slate-200 2xl:text-[20px]">
                                                        {todoSummary.pendingInterview}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl bg-slate-100/80 px-2 py-1.5 dark:bg-slate-900/80 2xl:px-2.5">
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{recruitmentUiText.pendingDecision}</p>
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
                    <div className={cn("h-full min-h-0 p-4 lg:p-5 2xl:p-6", activePage !== "candidates" && "hidden")}>
                        {renderCandidatesPage()}
                    </div>
                    <div className={cn("h-full min-h-0 p-4 lg:p-5 2xl:p-6", activePage !== "positions" && "hidden")}>
                        {renderPositionsPage()}
                    </div>
                    <div className={cn("h-full min-h-0 p-4 lg:p-5 2xl:p-6", activePage !== "audit" && "hidden")}>
                        {renderAuditPage()}
                    </div>
                    <div className={cn("h-full min-h-0 p-4 lg:p-5 2xl:p-6", activePage !== "assistant" && "hidden")}>
                        {renderAssistantPage()}
                    </div>
                    <ScrollArea className={cn("h-full", activePage !== "workspace" && "hidden")}>
                        <div className="p-4 lg:p-5 2xl:p-6">{renderWorkspacePage()}</div>
                    </ScrollArea>
                    <ScrollArea className={cn("h-full", activePage !== "settings-skills" && "hidden")}>
                        <div className="p-4 lg:p-5 2xl:p-6">{renderSkillsPage()}</div>
                    </ScrollArea>
                    <ScrollArea className={cn("h-full", activePage !== "settings-models" && "hidden")}>
                        <div className="p-4 lg:p-5 2xl:p-6">{renderModelsPage()}</div>
                    </ScrollArea>
                    <ScrollArea className={cn("h-full", activePage !== "settings-mail" && "hidden")}>
                        <div className="p-4 lg:p-5 2xl:p-6">{renderMailSettingsPage()}</div>
                    </ScrollArea>
                </div>
            </div>

            <Button
                className="fixed bottom-8 right-0 z-30 h-14 translate-x-[calc(100%-14px)] rounded-l-2xl rounded-r-none bg-slate-900 pl-4 pr-3 text-white shadow-[0_20px_40px_-18px_rgba(15,23,42,0.5)] transition-[transform,background-color] duration-200 hover:translate-x-0 hover:bg-slate-800 focus-visible:translate-x-0 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                onClick={() => openAssistantMode("drawer")}
            >
                <Bot className="h-4 w-4"/>
                {isZh ? "AI 助手" : "AI Assistant"}
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
                        <DialogDescription>{isZh ? "用于生成 JD、查看岗位候选人、筛选简历和生成面试题的招聘助手对话面板。" : "Assistant panel for generating JDs, viewing candidates, screening resumes, and creating interview questions."}</DialogDescription>
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
                                            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{recruitmentUiText.allVisibleCreateHint}</p>
                                        ) : null}
                                    </Field>
                                ) : null}
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
                                            className={cn(
                                                "flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200",
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
                                            上传简历后自动进入初筛
                                        </label>
                                        {positionForm.screeningSkillIds.length === 0 && (
                                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                                请先在下方「初筛Skills」中绑定至少一个初筛Skill，再开启此功能
                                            </p>
                                        )}
                                        <label
                                            className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={positionForm.autoAdvanceOnScreening}
                                                onChange={(event) => updatePositionFormField("autoAdvanceOnScreening", event.target.checked)}
                                            />
                                            初筛通过后自动推进候选人状态
                                        </label>
                                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-950/60">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">初筛完成后自动推送邮件</p>
                                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                                        启用后仅在候选人状态命中允许列表且解析出有效收件人时触发。岗位专属收件人优先，不受全局开关限制；使用全局收件人时需全局能力也开启。手动发送入口始终保留。
                                                    </p>
                                                </div>
                                                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={positionForm.autoMailEnabled}
                                                        onChange={(event) => updatePositionFormField("autoMailEnabled", event.target.checked)}
                                                    />
                                                    启用自动推送
                                                </label>
                                            </div>
                                            <div className={cn("mt-4 grid gap-4 lg:grid-cols-2", !positionForm.autoMailEnabled && "pointer-events-none opacity-40")}>
                                                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={positionForm.autoMailUsePositionRecipients}
                                                        onChange={(event) => updatePositionFormField("autoMailUsePositionRecipients", event.target.checked)}
                                                    />
                                                    使用岗位专属收件人
                                                </label>
                                                <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                                                    <input
                                                        type="checkbox"
                                                        className="mt-0.5 shrink-0"
                                                        checked={positionForm.autoMailUseGlobalRecipients}
                                                        onChange={(event) => updatePositionFormField("autoMailUseGlobalRecipients", event.target.checked)}
                                                    />
                                                    <span>
                                                        叠加全局默认收件人
                                                        <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">（需全局能力也开启）</span>
                                                    </span>
                                                </label>
                                            </div>
                                            <div className="mt-4 space-y-4">
                                                <div className="space-y-2">
                                                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">岗位专属收件人</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {mailRecipients.filter((recipient) => recipient.is_enabled).length ? mailRecipients.filter((recipient) => recipient.is_enabled).map((recipient) => (
                                                            <button
                                                                key={`auto-mail-to-${recipient.id}`}
                                                                type="button"
                                                                className={cn(
                                                                    "rounded-full border px-3 py-2 text-xs transition",
                                                                    positionForm.autoMailPositionRecipientIds.includes(recipient.id)
                                                                        ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                        : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                )}
                                                                onClick={() => updatePositionFormField("autoMailPositionRecipientIds", toggleIdInList(positionForm.autoMailPositionRecipientIds, recipient.id))}
                                                            >
                                                                {recipient.name}
                                                            </button>
                                                        )) : <p className="text-sm text-slate-500 dark:text-slate-400">请先在邮件中心维护收件人</p>}
                                                    </div>
                                                </div>
                                                <div className="grid gap-4 xl:grid-cols-2">
                                                    <div className="space-y-2">
                                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">抄送人（CC）</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {mailRecipients.filter((recipient) => recipient.is_enabled).length ? mailRecipients.filter((recipient) => recipient.is_enabled).map((recipient) => (
                                                                <button
                                                                    key={`auto-mail-cc-${recipient.id}`}
                                                                    type="button"
                                                                    className={cn(
                                                                        "rounded-full border px-3 py-2 text-xs transition",
                                                                        positionForm.autoMailCcRecipientIds.includes(recipient.id)
                                                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                    )}
                                                                    onClick={() => updatePositionFormField("autoMailCcRecipientIds", toggleIdInList(positionForm.autoMailCcRecipientIds, recipient.id))}
                                                                >
                                                                    {recipient.name}
                                                                </button>
                                                            )) : <p className="text-sm text-slate-500 dark:text-slate-400">暂无可选抄送人</p>}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">密送人（BCC）</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {mailRecipients.filter((recipient) => recipient.is_enabled).length ? mailRecipients.filter((recipient) => recipient.is_enabled).map((recipient) => (
                                                                <button
                                                                    key={`auto-mail-bcc-${recipient.id}`}
                                                                    type="button"
                                                                    className={cn(
                                                                        "rounded-full border px-3 py-2 text-xs transition",
                                                                        positionForm.autoMailBccRecipientIds.includes(recipient.id)
                                                                            ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                            : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                    )}
                                                                    onClick={() => updatePositionFormField("autoMailBccRecipientIds", toggleIdInList(positionForm.autoMailBccRecipientIds, recipient.id))}
                                                                >
                                                                    {recipient.name}
                                                                </button>
                                                            )) : <p className="text-sm text-slate-500 dark:text-slate-400">暂无可选密送人</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{recruitmentUiText.allowedAutoMailStatuses}</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {(metadata?.candidate_statuses || []).map((option) => (
                                                            <button
                                                                key={`auto-mail-status-${option.value}`}
                                                                type="button"
                                                                className={cn(
                                                                    "rounded-full border px-3 py-2 text-xs transition",
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
                                                            <option value="allow_repeat">{isZh ? "允许重复发送" : "Allow repeat sending"}</option>
                                                        </NativeSelect>
                                                    </Field>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <p className="text-sm text-slate-600 dark:text-slate-300">每个岗位可以分别绑定 1 条 JD Skill、1 条初筛 Skill、1 条面试题 Skill。若某一类不选择，系统会自动使用该任务的内置通用基座约束。如果没有合适的 Skill，可以点击下方「+」直接新建，创建后会自动绑定到当前岗位。</p>
                                            <div className="grid gap-4 xl:grid-cols-3">
                                                {([["jdAuthoringSkills", "jdSkillIds", "jd", "JD 生成 Skill"], ["screeningAuthoringSkills", "screeningSkillIds", "screening", "初筛 Skill"], ["interviewAuthoringSkills", "interviewSkillIds", "interview", "面试题 Skill"]] as const).map(([skillsKey, formKey, taskKind, label]) => (
                                                    <div key={formKey} className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</p>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-5 w-5"
                                                                title={`新建 ${label.replace(" Skill", "")} Skill`}
                                                                onClick={() => openSkillEditorForPosition(taskKind, formKey)}
                                                            >
                                                                <Plus className="h-3.5 w-3.5"/>
                                                            </Button>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {({jdAuthoringSkills, screeningAuthoringSkills, interviewAuthoringSkills}[skillsKey] as RecruitmentSkill[]).length ? (
                                                                {jdAuthoringSkills, screeningAuthoringSkills, interviewAuthoringSkills}[skillsKey].map((skill: RecruitmentSkill) => (
                                                                    <button
                                                                        key={`${formKey}-${skill.id}`}
                                                                        type="button"
                                                                        className={cn(
                                                                            "rounded-full border px-3 py-2 text-xs transition",
                                                                            (positionForm[formKey] as number[]).includes(skill.id)
                                                                                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                                                : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                                                                        )}
                                                                        onClick={() => setPositionForm((current) => ({
                                                                            ...current,
                                                                            [formKey]: toggleSingleSkillId(current[formKey] as number[], skill.id),
                                                                        }))}
                                                                    >
                                                                        {skill.name}
                                                                    </button>
                                                                ))
                                                            ) : (
                                                                <p className="text-xs text-slate-400">暂无可选 Skill，点击上方「+」新建</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
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

            <Dialog open={resumeUploadOpen} onOpenChange={(open) => {
                setResumeUploadOpen(open);
                if (!open) {
                    setResumeUploadError(null);
                }
            }}>
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
                        {resumeUploadPositionId === "all" && showOrganizationFields && organizationSelectOptions.length > 1 ? (
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
                                {showOrganizationFields ? (
                                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{recruitmentUiText.allVisibleUploadHint}</p>
                                ) : null}
                            </Field>
                        ) : null}
                        <Field label={isZh ? "所在城市" : "City"}>
                            <div className="flex flex-col gap-2">
                                <div className="flex gap-1">
                                    {([
                                        {value: "manual" as const, label: isZh ? "手动指定" : "Manual"},
                                        {value: "auto" as const, label: isZh ? "自动识别" : "Auto Detect"},
                                    ] as const).map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={cn(
                                                "rounded-md border px-2.5 py-1 text-xs transition-colors",
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
                                            placeholder={isZh ? "输入或选择城市" : "Enter or select city"}
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
                                                        "rounded-full border px-2 py-0.5 text-xs transition-colors",
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
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {isZh ? "系统将从文件名中自动提取城市，未识别到的由AI解析兜底" : "System extracts city from filename; AI parsing as fallback if not detected"}
                                    </p>
                                ) : null}
                            </div>
                        </Field>
                        <Field label="选择文件">
                            <Input type="file" multiple accept=".pdf,.docx"
                                   onChange={(event) => { setResumeUploadError(null); setResumeUploadFileList(event.target.files); }}/>
                        </Field>
                        <div
                            className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            已选择 {resumeUploadFileList?.length ?? 0} 个文件
                        </div>
                    </div>
                    <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
                        <span className="min-h-[20px] flex-1 text-sm text-rose-600 dark:text-rose-300">
                            {resumeUploadError ?? ""}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                            {uploadingResume ? (
                                <Button variant="outline" onClick={() => abortControllerRef.current?.abort()}>
                                    {isZh ? "取消上传" : "Cancel Upload"}
                                </Button>
                            ) : (
                                <Button variant="outline" onClick={() => setResumeUploadOpen(false)}>取消</Button>
                            )}
                            <Button onClick={() => void uploadResumes()} disabled={uploadingResume}>
                                {uploadingResume ? (isZh ? "上传中..." : "Uploading...") : (isZh ? "开始上传" : "Start Upload")}
                            </Button>
                        </div>
                    </DialogFooter>
                    {uploadingResume && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                                <span>已上传 {uploadCompletedCount} / {resumeUploadFileList?.length ?? 0} 份</span>
                                <span>{uploadProgress}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                                <div className="h-1.5 rounded-full bg-slate-900 dark:bg-slate-100 transition-all"
                                     style={{ width: `${uploadProgress}%` }}/>
                            </div>
                        </div>
                    )}
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

            <Dialog open={Boolean(candidateDeleteTarget)} onOpenChange={(open) => {
                if (!open && !candidateDeleting) {
                    setCandidateDeleteError(null);
                    setCandidateDeleteTarget(null);
                }
            }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>确认删除候选人</DialogTitle>
                        <DialogDescription>
                            删除后会同步清理该候选人的简历文件、解析结果、初筛评分、面试题、状态流转记录和工作记忆。正在执行中的候选人任务需要先结束后才能删除。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{candidateDeleteTarget?.name || "当前候选人"}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            删除后不可恢复；历史删除审计会保留，但该候选人不会再出现在候选人列表和详情区中。
                        </p>
                    </div>
                    <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
                        <span className="min-h-[20px] flex-1 text-sm text-rose-600 dark:text-rose-300">
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
                            取消
                        </Button>
                        <Button variant="destructive" onClick={() => void deleteCandidate()} disabled={candidateDeleting}>
                            {candidateDeleting ? "删除中..." : "确认删除"}
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
                        <DialogTitle>确认批量删除候选人</DialogTitle>
                        <DialogDescription>
                            将删除选中的 {batchDeleteTargetIds?.length ?? 0} 位候选人及其简历文件、解析结果、初筛评分、面试题、状态流转记录和工作记忆。有活动AI任务（解析或初筛中）的候选人将自动跳过。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
                        <span className="min-h-[20px] flex-1 text-sm text-rose-600 dark:text-rose-300">
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
                            取消
                        </Button>
                        <Button variant="destructive" onClick={() => void batchDeleteCandidates()} disabled={batchDeleting}>
                            {batchDeleting ? "删除中..." : "确认删除"}
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
                        <DialogTitle>确认删除简历</DialogTitle>
                        <DialogDescription>
                            删除后会同步清理这份简历对应的解析结果和初筛评分；如果该候选人还有其他简历，系统会自动切换到下一份可用简历。正在解析或初筛中的简历暂时不能删除。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{resumeDeleteTarget?.original_name || "当前简历"}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">删除后不可恢复，请确认当前候选人不再需要这份原始文件。</p>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setResumeDeleteTarget(null)}
                            disabled={resumeDeleting}
                        >
                            取消
                        </Button>
                        <Button variant="destructive" onClick={() => void deleteResumeFile()} disabled={resumeDeleting}>
                            {resumeDeleting ? "删除中..." : "确认删除"}
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
                        <Button onClick={() => void submitPublishTask()} disabled={publishSubmitting}>{publishSubmitting ? (isZh ? "发布中..." : "Publishing...") : recruitmentUiText.createTask}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={skillDialogOpen} onOpenChange={(open) => {
                setSkillDialogOpen(open);
                if (!open) {
                    setSkillFormErrors({});
                    setSkillFormSubmitError(null);
                    setSkillSubmitting(false);
                }
            }}>
                <DialogContent className="flex h-[min(88vh,840px)] max-h-[88vh] flex-col overflow-hidden sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{skillEditingId ? recruitmentUiText.skillEditTitle : recruitmentUiText.skillCreateTitle}</DialogTitle>
                        <DialogDescription>{recruitmentUiText.skillDialogDescription}</DialogDescription>
                    </DialogHeader>
                    <StructuredSkillEditor
                        initialData={skillEditorData}
                        editingSkillId={skillEditingId}
                        onSubmit={submitStructuredSkill}
                        onCancel={() => setSkillDialogOpen(false)}
                        submitting={skillSubmitting}
                        submitError={skillFormSubmitError}
                        onGenerateAI={generateSkillWithAI}
                        aiGenerating={skillGenerating}
                        defaultTab={skillEditorDefaultTab}
                    />
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
                                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
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
                        <label className="mt-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input type="checkbox" checked={llmForm.isActive}
                                   onChange={(event) => updateLLMFormField("isActive", event.target.checked)}/>
                            {recruitmentUiText.saveAndEnableLabel}
                        </label>
                    </ScrollArea>
                    <DialogFooter className="shrink-0 items-center justify-between gap-3 sm:justify-between">
                        <div className="min-h-5 flex-1 text-sm text-red-600 dark:text-red-400">
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
                        <Button onClick={() => void submitMailSender()} disabled={mailSenderSaving}>{mailSenderSaving ? (isZh ? "保存中..." : "Saving...") : "保存发件箱"}</Button>
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
                        <Button onClick={() => void submitMailRecipient()} disabled={mailRecipientSaving}>{mailRecipientSaving ? (isZh ? "保存中..." : "Saving...") : "保存收件人"}</Button>
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
                        {resumeMailError && (
                            <p className="text-sm text-red-500 flex-1 text-left">{resumeMailError}</p>
                        )}
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
