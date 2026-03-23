"use client";

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  ClipboardCheck,
  Download,
  ExternalLink,
  FilePlus2,
  FileSearch,
  FolderKanban,
  History,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  NotebookText,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { authenticatedFetch, getStoredScriptHubSession } from "@/lib/auth";
import {
  joinTags,
  recruitmentApi,
  splitTags,
  type AITaskLog,
  type CandidateDetail,
  type CandidateWorkflowMemory,
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
} from "@/lib/recruitment-api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type RecruitmentPage =
    | "workspace"
    | "positions"
    | "candidates"
    | "audit"
    | "assistant"
    | "settings-skills"
    | "settings-models"
    | "settings-mail";

type CandidateViewMode = "list" | "board";
type JDViewMode = "publish" | "markdown" | "preview";
type AssistantDisplayMode = "page" | "drawer" | "fullscreen";

type PositionFormState = {
  title: string;
  department: string;
  location: string;
  employmentType: string;
  salaryRange: string;
  headcount: string;
  keyRequirements: string;
  bonusPoints: string;
  summary: string;
  status: string;
  tagsText: string;
  autoScreenOnUpload: boolean;
  autoAdvanceOnScreening: boolean;
  screeningSkillIds: number[];
};

type SkillFormState = {
  name: string;
  description: string;
  content: string;
  tagsText: string;
  sortOrder: string;
  isEnabled: boolean;
};

type LLMFormState = {
  configKey: string;
  taskType: string;
  provider: string;
  modelName: string;
  baseUrl: string;
  apiKeyEnv: string;
  apiKeyValue: string;
  priority: string;
  isActive: boolean;
  extraConfigText: string;
};

type CandidateEditorState = {
  name: string;
  phone: string;
  email: string;
  currentCompany: string;
  yearsOfExperience: string;
  education: string;
  notes: string;
  tagsText: string;
  manualOverrideScore: string;
  manualOverrideReason: string;
};

type MailSenderFormState = {
  name: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: string;
  username: string;
  password: string;
  useSsl: boolean;
  useStarttls: boolean;
  isDefault: boolean;
  isEnabled: boolean;
};

type MailRecipientFormState = {
  name: string;
  email: string;
  department: string;
  roleTitle: string;
  tagsText: string;
  notes: string;
  isEnabled: boolean;
};

type ResumeMailFormState = {
  candidateIds: number[];
  senderConfigId: string;
  recipientIds: number[];
  extraRecipientEmails: string;
  subject: string;
  bodyText: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
  actions?: string[];
  logId?: number;
  memorySource?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
  usedSkillIds?: number[];
  usedSkills?: RecruitmentSkill[];
};

const pageMeta: Record<RecruitmentPage, { title: string; description: string }> = {
  workspace: {
    title: "招聘工作台",
    description: "聚合指标、待办、快捷动作和近期进展，一眼看清招聘推进状态。",
  },
  positions: {
    title: "岗位管理",
    description: "以岗位为主线查看基本信息、当前 JD、历史版本、发布状态和关联候选人。",
  },
  candidates: {
    title: "候选人中心",
    description: "按 ATS 视角筛选、推进和查看候选人，右侧详情区承接 AI 评估和状态流转。",
  },
  audit: {
    title: "AI 审计中心",
    description: "追踪 JD 生成、简历解析、评分和面试题生成，支持失败排查与留痕复盘。",
  },
  assistant: {
    title: "AI 招聘助手",
    description: "把岗位上下文、启用 Skill 和自然语言操作收拢到显眼且高频可用的工作区。",
  },
  "settings-skills": {
    title: "招聘 Skill 管理",
    description: "Skills 是管理员配置项，因此入口隐藏在管理设置中，不占用主工作流视线。",
  },
  "settings-models": {
    title: "模型配置中心",
    description: "按任务类型管理供应商、模型、环境变量和 API key，支撑随时切换模型。",
  },
  "settings-mail": {
    title: "邮件中心",
    description: "统一维护发件箱、收件人和发送记录，并支持候选人简历单发与批量发送。",
  },
};

const positionStatusLabels: Record<string, string> = {
  draft: "草稿",
  recruiting: "招聘中",
  paused: "暂停中",
  closed: "已关闭",
};

const candidateStatusLabels: Record<string, string> = {
  new_imported: "新导入",
  pending_screening: "待初筛",
  screening_passed: "初筛通过",
  screening_rejected: "初筛淘汰",
  pending_interview: "待面试",
  interview_passed: "面试通过",
  interview_rejected: "面试淘汰",
  pending_offer: "待 Offer",
  offer_sent: "已发 Offer",
  hired: "已入职",
  talent_pool: "人才库",
};

const aiTaskLabels: Record<string, string> = {
  jd_generation: "JD 生成",
  resume_parse: "简历解析",
  resume_score: "简历评分",
  interview_question_generation: "面试题生成",
  chat_orchestrator: "对话助手",
};

const providerLabels: Record<string, string> = {
  gemini: "Gemini",
  openai: "GPT / OpenAI",
  anthropic: "Claude",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  glm: "GLM",
  "openai-compatible": "OpenAI Compatible",
};

type MailSenderPresetKey = "163" | "outlook";

type MailSenderPreset = {
  key: MailSenderPresetKey;
  label: string;
  smtpHost: string;
  smtpPort: string;
  useSsl: boolean;
  useStarttls: boolean;
  domains: string[];
};

const mailSenderPresets: MailSenderPreset[] = [
  {
    key: "163",
    label: "163 默认",
    smtpHost: "smtp.163.com",
    smtpPort: "465",
    useSsl: true,
    useStarttls: false,
    domains: ["163.com"],
  },
  {
    key: "outlook",
    label: "Outlook 默认",
    smtpHost: "smtp-mail.outlook.com",
    smtpPort: "587",
    useSsl: false,
    useStarttls: true,
    domains: ["outlook.com", "hotmail.com", "live.com", "office365.com", "microsoft.com"],
  },
];

function inferMailSenderPreset(email?: string | null): MailSenderPreset | null {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  if (!domain) {
    return null;
  }
  return mailSenderPresets.find((preset) => preset.domains.includes(domain)) || null;
}

const panelClass =
    "rounded-[24px] border border-slate-200/80 bg-white/95 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-800/90 dark:bg-slate-950/85";

function emptyPositionForm(): PositionFormState {
  return {
    title: "",
    department: "",
    location: "",
    employmentType: "",
    salaryRange: "",
    headcount: "1",
    keyRequirements: "",
    bonusPoints: "",
    summary: "",
    status: "draft",
    tagsText: "",
    autoScreenOnUpload: false,
    autoAdvanceOnScreening: true,
    screeningSkillIds: [],
  };
}

function emptySkillForm(): SkillFormState {
  return {
    name: "",
    description: "",
    content: "",
    tagsText: "",
    sortOrder: "99",
    isEnabled: true,
  };
}

function emptyLLMForm(): LLMFormState {
  return {
    configKey: "",
    taskType: "default",
    provider: "gemini",
    modelName: "",
    baseUrl: "",
    apiKeyEnv: "",
    apiKeyValue: "",
    priority: "99",
    isActive: true,
    extraConfigText: "{}",
  };
}

function emptyCandidateEditor(): CandidateEditorState {
  return {
    name: "",
    phone: "",
    email: "",
    currentCompany: "",
    yearsOfExperience: "",
    education: "",
    notes: "",
    tagsText: "",
    manualOverrideScore: "",
    manualOverrideReason: "",
  };
}

function emptyMailSenderForm(): MailSenderFormState {
  return {
    name: "",
    fromName: "",
    fromEmail: "",
    smtpHost: "",
    smtpPort: "465",
    username: "",
    password: "",
    useSsl: true,
    useStarttls: false,
    isDefault: false,
    isEnabled: true,
  };
}

function emptyMailRecipientForm(): MailRecipientFormState {
  return {
    name: "",
    email: "",
    department: "",
    roleTitle: "",
    tagsText: "",
    notes: "",
    isEnabled: true,
  };
}

function emptyResumeMailForm(): ResumeMailFormState {
  return {
    candidateIds: [],
    senderConfigId: "",
    recipientIds: [],
    extraRecipientEmails: "",
    subject: "",
    bodyText: "",
  };
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "all") {
      return;
    }
    search.set(key, String(value));
  });
  const output = search.toString();
  return output ? `?${output}` : "";
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatLongDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shortText(value?: string | null, limit = 120) {
  if (!value) {
    return "-";
  }
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function formatSkillNames(skillIds: number[] | undefined | null, skillMap: Map<number, RecruitmentSkill>) {
  const ids = skillIds || [];
  if (!ids.length) {
    return "未关联 Skills";
  }
  return ids
      .map((skillId) => skillMap.get(skillId)?.name || `Skill #${skillId}`)
      .join("、");
}

function normalizeSkillSnapshot(skill: Partial<RecruitmentSkill> | null | undefined, fallbackIndex = 0): RecruitmentSkill {
  const fallbackId = typeof skill?.id === "number" ? skill.id : -(fallbackIndex + 1);
  const normalizedTags = Array.isArray(skill?.tags)
    ? skill.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  return {
    id: fallbackId,
    skill_code: skill?.skill_code || `snapshot-${Math.abs(fallbackId) || fallbackIndex + 1}`,
    name: skill?.name || `Skill #${Math.abs(fallbackId) || fallbackIndex + 1}`,
    description: skill?.description || null,
    content: skill?.content || "",
    tags: normalizedTags,
    sort_order: Number.isFinite(Number(skill?.sort_order)) ? Number(skill?.sort_order) : 999,
    is_enabled: skill?.is_enabled !== false,
    created_by: skill?.created_by || null,
    updated_by: skill?.updated_by || null,
    created_at: skill?.created_at || null,
    updated_at: skill?.updated_at || null,
  };
}

function resolveLogSkillSnapshots(
    log: Pick<AITaskLog, "related_skill_snapshots" | "related_skill_ids" | "related_skill_id">,
    skillMap: Map<number, RecruitmentSkill>,
) {
  if (log.related_skill_snapshots?.length) {
    return log.related_skill_snapshots.map((skill, index) => normalizeSkillSnapshot(skill, index));
  }
  const ids = log.related_skill_ids?.length
    ? log.related_skill_ids
    : (log.related_skill_id ? [log.related_skill_id] : []);
  return ids.map((skillId, index) => normalizeSkillSnapshot(
      skillMap.get(skillId) || {
        id: skillId,
        skill_code: `skill-${skillId}`,
        name: `Skill #${skillId}`,
        content: "",
        tags: [],
        sort_order: 999,
        is_enabled: true,
      },
      index,
  ));
}

function formatSkillSnapshotNames(skillSnapshots: RecruitmentSkill[]) {
  if (!skillSnapshots.length) {
    return "未关联 Skills";
  }
  return skillSnapshots.map((skill) => skill.name || `Skill #${skill.id}`).join("、");
}

function formatStructuredValue(value: unknown, fallback: string) {
  if (typeof value === "string") {
    return value.trim() ? value : fallback;
  }
  if (value == null) {
    return fallback;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function labelForMemorySource(source?: string | null) {
  switch (source) {
    case "manual_override":
    case "manual":
      return "手动指定 Skills";
    case "candidate_memory":
      return "候选人工作记忆";
    case "position":
    case "position_default":
      return "岗位绑定 Skills";
    case "global":
    case "enabled_global_fallback":
      return "全局启用 Skills";
    case "guardrail":
      return "非招聘拒答规则";
    default:
      return source || "未记录";
  }
}

function parseEmailList(value: string) {
  return Array.from(
      new Set(
          value
              .split(/[\n,;，；\s]+/)
              .map((item) => item.trim())
              .filter(Boolean),
      ),
  );
}

function extractFileNameFromDisposition(value: string | null, fallback: string) {
  if (!value) {
    return fallback;
  }
  const encodedMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].replace(/"/g, ""));
    } catch {
      return encodedMatch[1].replace(/"/g, "");
    }
  }

  const quotedMatch = value.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = value.match(/filename=([^;]+)/i);
  if (!plainMatch?.[1]) {
    return fallback;
  }
  try {
    return decodeURIComponent(plainMatch[1].replace(/"/g, ""));
  } catch {
    return plainMatch[1].replace(/"/g, "");
  }
}

function formatActionError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return "\u672a\u77e5\u9519\u8bef";
}

function toggleIdInList(current: number[], targetId: number, nextChecked?: boolean) {
  const exists = current.includes(targetId);
  if (nextChecked === true && !exists) {
    return [...current, targetId];
  }
  if (nextChecked === false && exists) {
    return current.filter((item) => item !== targetId);
  }
  if (nextChecked === undefined) {
    return exists ? current.filter((item) => item !== targetId) : [...current, targetId];
  }
  return current;
}

function formatPercent(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "-";
  }
  return `${Math.round(value)}%`;
}

function extractPublishText(markdown?: string | null, publishText?: string | null) {
  if (publishText?.trim()) {
    return publishText.trim();
  }
  const plain = (markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*---+\s*$/gm, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*(好的|当然|以下是|下面是|这是一份|这是)\s*[：:，,]?\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return plain;
}

function labelForJDGenerationStatus(status?: string | null) {
  switch (status) {
    case "running":
      return "生成中";
    case "syncing":
      return "同步中";
    case "success":
      return "已完成";
    case "fallback":
      return "已完成";
    case "failed":
      return "失败";
    case "queued":
      return "排队中";
    default:
      return "待生成";
  }
}

function isToday(value?: string | null) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const now = new Date();
  return (
      date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate()
  );
}

function withinDays(value?: string | null, days = 7) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function statusBadgeClass(kind: "position" | "candidate" | "task", value?: string | null) {
  if (kind === "task") {
    if (value === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
    if (value === "fallback") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
    if (value === "running") return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200";
    if (value === "failed") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
  }
  if (kind === "position") {
    if (value === "recruiting") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
    if (value === "paused") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
    if (value === "closed") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
  }
  if (kind === "candidate") {
    if (value === "screening_passed" || value === "interview_passed" || value === "offer_sent" || value === "hired") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
    }
    if (value === "screening_rejected" || value === "interview_rejected") {
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
    }
    if (value === "pending_screening" || value === "pending_interview" || value === "pending_offer") {
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
    }
  }
  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300";
}

function labelForPositionStatus(status?: string | null) {
  return positionStatusLabels[status || ""] || status || "未知状态";
}

function labelForCandidateStatus(status?: string | null) {
  return candidateStatusLabels[status || ""] || status || "未知状态";
}

function labelForTaskType(taskType?: string | null) {
  return aiTaskLabels[taskType || ""] || taskType || "AI 任务";
}

function labelForProvider(provider?: string | null) {
  return providerLabels[provider || ""] || provider || "-";
}

interface RecruitmentAutomationContainerProps {
  onBack: () => void;
}

export default function RecruitmentAutomationContainer({ onBack }: RecruitmentAutomationContainerProps) {
  const sessionUser = useMemo(() => getStoredScriptHubSession()?.user ?? null, []);
  const jdGenerationInFlightRef = useRef(false);
  const canManageRecruitment = Boolean(
      sessionUser?.permissions["ai-recruitment-manage"]
      || sessionUser?.permissions["rbac-manage"],
  );

  const [activePage, setActivePage] = useState<RecruitmentPage>("workspace");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

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
  const deferredCandidateQuery = useDeferredValue(candidateQuery);

  const [logTaskTypeFilter, setLogTaskTypeFilter] = useState("all");
  const [logStatusFilter, setLogStatusFilter] = useState("all");

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
  const [chatSending, setChatSending] = useState(false);

  const [positionDialogOpen, setPositionDialogOpen] = useState(false);
  const [positionDialogMode, setPositionDialogMode] = useState<"create" | "edit">("create");
  const [positionForm, setPositionForm] = useState<PositionFormState>(emptyPositionForm);

  const [resumeUploadOpen, setResumeUploadOpen] = useState(false);
  const [resumeUploadFiles, setResumeUploadFiles] = useState<File[]>([]);
  const [resumeUploadPositionId, setResumeUploadPositionId] = useState("all");

  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishPlatform, setPublishPlatform] = useState("boss");
  const [publishMode, setPublishMode] = useState("mock");

  const [jdExtraPrompt, setJdExtraPrompt] = useState("");
  const [jdViewMode, setJdViewMode] = useState<JDViewMode>("publish");
  const [jdGenerationStatus, setJdGenerationStatus] = useState<"idle" | "generating" | "syncing" | "failed">("idle");
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
      content: "我是 AI 招聘工作台助手。你可以直接让我生成 JD、查看岗位候选人、重新初筛某位候选人并追加硬性条件，或者说明这次对话实际使用了哪些 Skills。",
      createdAt: new Date().toISOString(),
    },
  ]);

  const assistantScrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const assistantScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const assistantInputRef = useRef<HTMLTextAreaElement | null>(null);

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
  const [resumeMailForm, setResumeMailForm] = useState<ResumeMailFormState>(emptyResumeMailForm);
  const [interviewSkillSelectionDirty, setInterviewSkillSelectionDirty] = useState(false);

  const positionMap = useMemo(() => new Map(positions.map((item) => [item.id, item])), [positions]);
  const candidateMap = useMemo(() => new Map(candidates.map((item) => [item.id, item])), [candidates]);
  const skillMap = useMemo(() => new Map(skills.map((item) => [item.id, item])), [skills]);
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
  const isJDGenerating = jdGenerationStatus === "generating" || jdGenerationStatus === "syncing";
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
  const chatContextCandidateLabel = useMemo(() => {
    if (!chatContext.candidate_id) {
      return "未指定候选人";
    }
    return candidateMap.get(chatContext.candidate_id)?.name || `候选人 #${chatContext.candidate_id}`;
  }, [candidateMap, chatContext.candidate_id]);
  const assistantModelLabel = assistantActiveLLMConfig
    ? `${labelForProvider(assistantActiveLLMConfig.resolved_provider || assistantActiveLLMConfig.provider)} / ${assistantActiveLLMConfig.resolved_model_name || assistantActiveLLMConfig.model_name}`
    : "暂未识别";
  const positionScreeningSkillIds = candidateDetail?.candidate.position_screening_skill_ids || [];
  const workflowScreeningSkillIds = candidateDetail?.workflow_memory?.screening_skill_ids || [];
  const workflowInterviewSkillIds = candidateDetail?.workflow_memory?.interview_skill_ids || [];
  const candidateAssistantActivity = useMemo(() => {
    return (candidateDetail?.activity || []).filter((item) => item.task_type === "chat_orchestrator");
  }, [candidateDetail?.activity]);
  const candidateProcessActivity = useMemo(() => {
    return (candidateDetail?.activity || []).filter((item) => item.task_type !== "chat_orchestrator");
  }, [candidateDetail?.activity]);
  const preferredInterviewSkillIds = useMemo(() => {
    if (workflowInterviewSkillIds.length) {
      return workflowInterviewSkillIds;
    }
    if (workflowScreeningSkillIds.length) {
      return workflowScreeningSkillIds;
    }
    const positionSkillIds = candidateDetail?.candidate.position_screening_skill_ids || [];
    if (positionSkillIds.length) {
      return positionSkillIds;
    }
    return chatContext.skill_ids || [];
  }, [candidateDetail, chatContext.skill_ids, workflowInterviewSkillIds, workflowScreeningSkillIds]);
  const preferredInterviewSkillSourceLabel = workflowInterviewSkillIds.length
    ? "工作记忆中的面试题 Skills"
    : workflowScreeningSkillIds.length
      ? "工作记忆中的初筛 Skills"
      : (candidateDetail?.candidate.position_screening_skill_ids?.length
        ? "岗位绑定 Skills"
        : (chatContext.skill_ids?.length ? "助手当前激活 Skills" : "系统默认 Skills"));
  const effectiveScreeningSkillIds = useMemo(() => {
    if (positionScreeningSkillIds.length) {
      return positionScreeningSkillIds;
    }
    if (workflowScreeningSkillIds.length) {
      return workflowScreeningSkillIds;
    }
    return [];
  }, [positionScreeningSkillIds, workflowScreeningSkillIds]);
  const effectiveScreeningSkillSourceLabel = positionScreeningSkillIds.length
    ? "岗位绑定 Skills"
    : (workflowScreeningSkillIds.length ? "初筛工作记忆 Skills" : "全局默认 Skills");
  const autoInterviewSkillIds = useMemo(() => {
    if (positionScreeningSkillIds.length) {
      return positionScreeningSkillIds;
    }
    if (workflowInterviewSkillIds.length) {
      return workflowInterviewSkillIds;
    }
    if (workflowScreeningSkillIds.length) {
      return workflowScreeningSkillIds;
    }
    return [];
  }, [positionScreeningSkillIds, workflowInterviewSkillIds, workflowScreeningSkillIds]);
  const autoInterviewSkillSourceLabel = positionScreeningSkillIds.length
    ? "岗位绑定 Skills"
    : workflowInterviewSkillIds.length
      ? "面试题工作记忆 Skills"
      : (workflowScreeningSkillIds.length ? "初筛工作记忆 Skills" : "全局默认 Skills");
  const effectiveInterviewSkillIds = interviewSkillSelectionDirty ? selectedInterviewSkillIds : autoInterviewSkillIds;
  const effectiveInterviewSkillSourceLabel = interviewSkillSelectionDirty ? "手动选择 Skills" : autoInterviewSkillSourceLabel;
  const hasLiveLogActivity = useMemo(() => {
    return aiLogs.some((item) => ["queued", "pending", "running"].includes(item.status));
  }, [aiLogs]);
  const hasLiveCandidateActivity = useMemo(() => {
    return (candidateDetail?.activity || []).some((item) => ["queued", "pending", "running"].includes(item.status));
  }, [candidateDetail?.activity]);
  const resumeMailTargetCandidates = useMemo(() => {
    return resumeMailForm.candidateIds
        .map((candidateId) => (
            candidateMap.get(candidateId)
            || (candidateDetail?.candidate.id === candidateId ? candidateDetail.candidate : null)
        ))
        .filter((item): item is CandidateSummary => Boolean(item));
  }, [candidateDetail, candidateMap, resumeMailForm.candidateIds]);

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
    const viewport = assistantScrollAreaRef.current?.querySelector("[data-slot='scroll-area-viewport']") as HTMLDivElement | null;
    if (!viewport || !assistantScrollAnchorRef.current) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: chatSending ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [assistantDisplayMode, assistantOpen, chatMessages, chatSending]);

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
      try {
        await Promise.all([
          loadMetadata(),
          loadDashboard(),
          loadPositions(),
          loadCandidates(),
          loadLogs(),
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
    if (!bootstrapping) {
      void loadPositions();
    }
  }, [bootstrapping, deferredPositionQuery, positionStatusFilter]);

  useEffect(() => {
    if (!bootstrapping) {
      void loadCandidates();
    }
  }, [bootstrapping, deferredCandidateQuery, candidatePositionFilter, candidateStatusFilter]);

  useEffect(() => {
    if (!bootstrapping) {
      void loadLogs();
    }
  }, [bootstrapping, logStatusFilter, logTaskTypeFilter]);

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
    const shouldPollLogDetail = activePage === "audit";
    const hasVisibleLiveActivity = (
      (shouldPollLogs && hasLiveLogActivity)
      || (shouldPollCandidateDetail && hasLiveCandidateActivity)
    );
    if (!screeningSubmitting && !interviewGenerating && !chatSending && !resumeMailSubmitting && jdGenerationStatus === "idle" && !hasVisibleLiveActivity) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      if (shouldPollLogs) {
        void loadLogs({ silent: true });
      }
      if (shouldPollCandidateDetail && selectedCandidateId) {
        void loadCandidateDetail(selectedCandidateId, { silent: true });
      }
      if (shouldPollLogDetail && selectedLogId) {
        void loadLogDetail(selectedLogId, { silent: true });
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [
    activePage,
    screeningSubmitting,
    interviewGenerating,
    chatSending,
    resumeMailSubmitting,
    jdGenerationStatus,
    hasLiveLogActivity,
    hasLiveCandidateActivity,
    selectedCandidateId,
    selectedLogId,
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
  }, [selectedCandidateId]);

  async function loadMetadata() {
    const data = await recruitmentApi<RecruitmentMetadata>("/metadata");
    setMetadata(data);
    return data;
  }

  async function loadDashboard() {
    const data = await recruitmentApi<DashboardData>("/dashboard");
    setDashboard(data);
    return data;
  }

  async function loadPositions() {
    setPositionsLoading(true);
    try {
      const data = await recruitmentApi<PositionSummary[]>(
          `/positions${buildQuery({ query: deferredPositionQuery, status: positionStatusFilter })}`,
      );
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
      setPositionsLoading(false);
    }
  }

  async function loadPositionDetail(positionId: number) {
    setPositionDetailLoading(true);
    try {
      const data = await recruitmentApi<PositionDetail>(`/positions/${positionId}`);
      setPositionDetail(data);
      return data;
    } catch (error) {
      toast.error(`加载岗位详情失败：${error instanceof Error ? error.message : "未知错误"}`);
      return null;
    } finally {
      setPositionDetailLoading(false);
    }
  }

  async function loadCandidates() {
    setCandidatesLoading(true);
    try {
      const data = await recruitmentApi<CandidateSummary[]>(
          `/candidates${buildQuery({
            query: deferredCandidateQuery,
            status: candidateStatusFilter,
            position_id: candidatePositionFilter === "all" ? null : candidatePositionFilter,
          })}`,
      );
      setCandidates(data);
      setSelectedCandidateId((current) => {
        if (current && data.some((item) => item.id === current)) {
          return current;
        }
        return data[0]?.id || null;
      });
      return data;
    } catch (error) {
      toast.error(`加载候选人失败：${error instanceof Error ? error.message : "未知错误"}`);
      throw error;
    } finally {
      setCandidatesLoading(false);
    }
  }

  async function loadCandidateDetail(candidateId: number, options?: { silent?: boolean }) {
    if (!options?.silent) {
      setCandidateDetailLoading(true);
    }
    try {
      const data = await recruitmentApi<CandidateDetail>(`/candidates/${candidateId}`);
      setCandidateDetail(data);
      const nextPositionId = data.candidate.position_id ?? null;
      if (
        data.candidate.id !== (chatContext.candidate_id ?? null)
        || nextPositionId !== (chatContext.position_id ?? null)
      ) {
        void saveChatContext(nextPositionId, chatContext.skill_ids, data.candidate.id, { quiet: true });
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
      const data = await recruitmentApi<AITaskLog[]>(
          `/ai-task-logs${buildQuery({ task_type: logTaskTypeFilter, status: logStatusFilter })}`,
      );
      setAiLogs(data);
      setSelectedLogId((current) => {
        if (current && data.some((item) => item.id === current)) {
          return current;
        }
        return data[0]?.id || null;
      });
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
      const data = await recruitmentApi<AITaskLog>(`/ai-task-logs/${taskId}`);
      setSelectedLogDetail(data);
    } catch (error) {
      if (!options?.silent) {
        toast.error(`\u52a0\u8f7d\u4efb\u52a1\u8be6\u60c5\u5931\u8d25\uff1a${error instanceof Error ? error.message : "\u672a\u77e5\u9519\u8bef"}`);
      }
    } finally {
      if (!options?.silent) {
        setLogDetailLoading(false);
      }
    }
  }

  async function loadSkills() {
    setSkillsLoading(true);
    try {
      const data = await recruitmentApi<RecruitmentSkill[]>("/skills");
      setSkills(data);
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
      const data = await recruitmentApi<RecruitmentLLMConfig[]>("/llm-configs");
      setLlmConfigs(data);
      return data;
    } catch (error) {
      toast.error(`加载模型配置失败：${error instanceof Error ? error.message : "未知错误"}`);
      throw error;
    } finally {
      setModelsLoading(false);
    }
  }

  async function loadChatContext() {
    const data = await recruitmentApi<ChatContext>("/chat/context");
    setChatContext(data);
    return data;
  }

  async function loadMailSettings() {
    setMailSettingsLoading(true);
    try {
      const [senders, recipients, dispatches] = await Promise.all([
        recruitmentApi<RecruitmentMailSenderConfig[]>("/mail-senders"),
        recruitmentApi<RecruitmentMailRecipient[]>("/mail-recipients"),
        recruitmentApi<RecruitmentResumeMailDispatch[]>("/resume-mail-dispatches"),
      ]);
      setMailSenderConfigs(senders);
      setMailRecipients(recipients);
      setResumeMailDispatches(dispatches);
      return { senders, recipients, dispatches };
    } catch (error) {
      toast.error(`加载邮件配置失败：${error instanceof Error ? error.message : "未知错误"}`);
      throw error;
    } finally {
      setMailSettingsLoading(false);
    }
  }

  async function refreshCoreData() {
    await Promise.all([loadDashboard(), loadPositions(), loadCandidates(), loadLogs(), loadMailSettings()]);
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

  function openTaskLogDetail(logId?: number | null) {
    if (!logId) {
      return;
    }
    setActivePage("audit");
    setSelectedLogId(logId);
  }

  async function waitForJDVersionSync(positionId: number, expectedVersionId?: number | null) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const detail = await loadPositionDetail(positionId);
      if (!detail) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      if (!expectedVersionId || detail.current_jd_version?.id === expectedVersionId) {
        return detail;
      }
      if (detail.jd_versions.some((version) => version.id === expectedVersionId)) {
        return detail;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("JD 已生成，但页面暂未同步到最新版本，请稍后刷新重试。");
  }

  function openAssistantMode(mode: AssistantDisplayMode) {
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
    input.focus({ preventScroll: true });
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

  function applyAssistantPrompt(prompt: string) {
    setChatInput(prompt);
    queueAssistantInputFocus(true);
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
      screeningSkillIds: positionDetail.position.screening_skill_ids || [],
    });
    setPositionDialogOpen(true);
  }

  async function submitPosition() {
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
      screening_skill_ids: positionForm.screeningSkillIds,
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
      toast.error(`保存岗位失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  async function deletePosition() {
    if (!selectedPositionId || !positionDetail?.position) {
      return;
    }
    setPositionDeleting(true);
    try {
      await recruitmentApi(`/positions/${selectedPositionId}`, { method: "DELETE" });
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
    if (!selectedPositionId || isJDGenerating || jdGenerationInFlightRef.current) {
      return;
    }
    jdGenerationInFlightRef.current = true;
    setJdGenerationStatus("generating");
    setJdGenerationError("");
    try {
      const version = await recruitmentApi<JDVersion>(`/positions/${selectedPositionId}/generate-jd`, {
        method: "POST",
        body: JSON.stringify({
          extra_prompt: jdExtraPrompt.trim() || null,
          auto_activate: jdDraft.autoActivate,
        }),
      });

      setJdGenerationStatus("syncing");
      await waitForJDVersionSync(selectedPositionId, version.id);
      await Promise.all([loadDashboard(), loadLogs(), loadPositions()]);
      setJdExtraPrompt("");
      setJdViewMode("publish");
      setJdGenerationStatus("idle");
      toast.success("岗位 JD 已生成并同步到当前页面");
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
      await recruitmentApi(`/candidates/upload-resumes${query}`, {
        method: "POST",
        body: formData,
      });
      toast.success("简历已上传。若岗位已开启自动初筛，系统会继续执行初筛；否则可在候选人页手动开始初筛。");
      setResumeUploadOpen(false);
      setResumeUploadFiles([]);
      await refreshCoreData();
      setActivePage("candidates");
    } catch (error) {
      toast.error(`上传简历失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
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
    if (!selectedCandidateId) {
      return;
    }
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
    const candidateIds = Array.from(new Set(
        (targetCandidateIds?.length ? targetCandidateIds : (selectedCandidateId ? [selectedCandidateId] : []))
            .filter(Boolean),
    ));
    if (!candidateIds.length) {
      toast.error("请先选择需要初筛的候选人");
      return;
    }
    setScreeningSubmitting(true);
    const failures: string[] = [];
    try {
      for (const candidateId of candidateIds) {
        try {
          await recruitmentApi(`/candidates/${candidateId}/screen`, {
            method: "POST",
            body: JSON.stringify({
              skill_ids: [],
              use_candidate_memory: true,
              use_position_skills: true,
            }),
          });
        } catch (error) {
          failures.push(`候选人 #${candidateId}: ${error instanceof Error ? error.message : "未知错误"}`);
        }
      }
      if (selectedCandidateId) {
        await loadCandidateDetail(selectedCandidateId);
      }
      await Promise.all([loadCandidates(), loadDashboard(), loadLogs()]);
      if (failures.length) {
        toast.error(`初筛完成，但有 ${failures.length} 份失败：${failures[0]}`);
      } else {
        toast.success(candidateIds.length > 1 ? `已完成 ${candidateIds.length} 份简历初筛` : "初筛已完成");
      }
    } finally {
      setScreeningSubmitting(false);
    }
  }

  async function generateInterviewQuestions() {
    if (!selectedCandidateId || interviewGenerating) {
      return;
    }
    const manualSkillIds = interviewSkillSelectionDirty ? selectedInterviewSkillIds : [];
    setInterviewGenerating(true);
    try {
      await recruitmentApi(`/candidates/${selectedCandidateId}/interview-questions`, {
        method: "POST",
        body: JSON.stringify({
          round_name: interviewRoundName.trim() || "初试",
          custom_requirements: interviewCustomRequirements.trim() || null,
          skill_ids: manualSkillIds,
          use_candidate_memory: !interviewSkillSelectionDirty,
        }),
      });
      toast.success("面试题已生成");
      await Promise.all([loadCandidateDetail(selectedCandidateId), loadLogs()]);
    } catch (error) {
      toast.error(`生成面试题失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setInterviewGenerating(false);
    }
  }

  async function sendChatMessage() {
    if (chatSending) {
      return;
    }
    const message = chatInput.trim();
    if (!message) {
      return;
    }
    setChatMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: "user", content: message, createdAt: new Date().toISOString() },
    ]);
    setChatInput("");
    setChatSending(true);
    try {
      const response = await recruitmentApi<ChatResponse>("/chat", {
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
        },
      ]);
      await Promise.all([loadLogs(), loadDashboard()]);
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
      setChatSending(false);
    }
  }

  async function saveChatContext(
      nextPositionId: number | null,
      nextSkillIds: number[],
      nextCandidateId: number | null = null,
      options?: { quiet?: boolean },
  ) {
    try {
      const response = await recruitmentApi<ChatContext>("/chat/context", {
        method: "POST",
        body: JSON.stringify({
          position_id: nextPositionId,
          candidate_id: nextCandidateId,
          skill_ids: nextSkillIds,
        }),
      });
      setChatContext(response);
      if (options?.quiet) {
        return;
      }
      toast.success("AI 助手上下文已更新");
    } catch (error) {
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
      await recruitmentApi(`/mail-senders/${senderId}`, { method: "DELETE" });
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
      await recruitmentApi(`/mail-recipients/${recipientId}`, { method: "DELETE" });
      setMailRecipientDeleteTarget(null);
      toast.success("收件人已删除");
      await loadMailSettings();
    } catch (error) {
      toast.error(`删除收件人失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setDeleteActionKey((current) => (current === actionKey ? null : current));
    }
  }

  function openResumeMailDialog(candidateIds?: number[]) {
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
    setResumeMailForm({
      candidateIds: nextCandidateIds,
      senderConfigId: defaultMailSenderId,
      recipientIds: [],
      extraRecipientEmails: "",
      subject: "",
      bodyText: "",
    });
    setResumeMailDialogOpen(true);
  }

  async function submitResumeMail() {
    if (!resumeMailForm.candidateIds.length) {
      toast.error("\u8bf7\u5148\u9009\u62e9\u9700\u8981\u53d1\u9001\u7684\u5019\u9009\u4eba");
      return;
    }
    const extraEmails = parseEmailList(resumeMailForm.extraRecipientEmails);
    if (!resumeMailForm.recipientIds.length && !extraEmails.length) {
      toast.error("\u8bf7\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u6536\u4ef6\u4eba\u6216\u586b\u5199\u4e00\u4e2a\u90ae\u7bb1");
      return;
    }
    setResumeMailSubmitting(true);
    try {
      await recruitmentApi(`/resume-mail-dispatches/send`, {
        method: "POST",
        body: JSON.stringify({
          sender_config_id: resumeMailForm.senderConfigId ? Number(resumeMailForm.senderConfigId) : null,
          candidate_ids: resumeMailForm.candidateIds,
          recipient_ids: resumeMailForm.recipientIds,
          recipient_emails: extraEmails,
          subject: resumeMailForm.subject.trim() || null,
          body_text: resumeMailForm.bodyText.trim() || null,
        }),
      });
      toast.success("\u7b80\u5386\u90ae\u4ef6\u5df2\u53d1\u9001");
      setResumeMailDialogOpen(false);
      try {
        await loadMailSettings();
      } catch (refreshError) {
        toast.error(`\u7b80\u5386\u90ae\u4ef6\u5df2\u53d1\u9001\uff0c\u4f46\u90ae\u4ef6\u4e2d\u5fc3\u5237\u65b0\u5931\u8d25\uff1a${formatActionError(refreshError)}`);
      }
    } catch (error) {
      toast.error(`\u53d1\u9001\u7b80\u5386\u90ae\u4ef6\u5931\u8d25\uff1a${formatActionError(error)}`);
    } finally {
      setResumeMailSubmitting(false);
    }
  }

  async function openResumeFile(file: ResumeFile, download = false) {
    try {
      const response = await authenticatedFetch(`/api/recruitment/resume-files/${file.id}/download`, { method: "GET", cache: "no-store" });
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
      await recruitmentApi(`/skills/${skillId}`, { method: "DELETE" });
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
      await recruitmentApi(`/skills/${skillId}/toggle${buildQuery({ enabled })}`, { method: "POST" });
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
      await recruitmentApi(`/llm-configs/${configId}`, { method: "DELETE" });
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
    const suggestionPrompts = [
      "生成当前岗位 JD",
      "查看当前岗位候选人",
      "重新对当前候选人初筛，硬性要求加强硬件测试",
      "给当前候选人生成面试题",
      "说明这次对话用了哪些 Skills",
      "当前使用什么模型",
    ];

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-sky-600" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">AI 招聘助手</p>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              当前岗位：{chatContext.position_title || "未指定"} · 当前候选人：{chatContextCandidateLabel} · 激活 Skills：{chatContext.skills?.length || 0} · 当前模型：{assistantModelLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={isPage ? "default" : "outline"} size="sm" onClick={() => openAssistantMode("page")}>
              侧栏模式
            </Button>
            <Button variant={mode === "drawer" ? "default" : "outline"} size="sm" onClick={() => openAssistantMode("drawer")}>
              宽抽屉模式
            </Button>
            <Button variant={isFullscreen ? "default" : "outline"} size="sm" onClick={() => openAssistantMode("fullscreen")}>
              全屏模式
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "grid min-h-0 flex-1",
            isFullscreen
              ? "grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px]"
              : isPage
                ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]"
                : "grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px]",
          )}
        >
          <div className="flex min-h-0 flex-col">
            <div className="shrink-0 flex flex-wrap gap-2 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
              {suggestionPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onMouseDown={preventAssistantActionFocusLoss}
                  onClick={() => applyAssistantPrompt(prompt)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-slate-100"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div ref={assistantScrollAreaRef} className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full min-h-0">
              <div className="space-y-4 px-5 py-5">
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
                    {message.role === "assistant" && (message.usedSkills?.length || message.logId) ? (
                      <details className="mt-3 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                        <summary className="cursor-pointer select-none font-medium text-slate-700 dark:text-slate-200">查看本次上下文</summary>
                        <div className="mt-3 space-y-3">
                          <p className="leading-6">
                            模型：{labelForProvider(message.modelProvider)} / {message.modelName || "-"}
                            <br />
                            规则来源：{labelForMemorySource(message.memorySource)}
                          </p>
                          {message.usedSkills?.length ? (
                            <div className="space-y-2">
                              {message.usedSkills.map((skill) => (
                                <div key={skill.id} className="rounded-2xl border border-slate-200/80 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                                  <p className="font-medium text-slate-900 dark:text-slate-100">{skill.name}</p>
                                  {skill.description ? <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{skill.description}</p> : null}
                                  <pre className="mt-2 whitespace-pre-wrap break-words leading-6 text-slate-600 dark:text-slate-300">{skill.content || "暂无内容"}</pre>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {message.logId ? (
                            <div className="flex justify-end">
                              <Button size="sm" variant="outline" onClick={() => openTaskLogDetail(message.logId)}>查看完整日志</Button>
                            </div>
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                    <p className="mt-2 text-[11px] opacity-70">{formatDateTime(message.createdAt)}</p>
                  </div>
                ))}
                {chatSending ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    助手正在思考...
                  </div>
                ) : null}
                <div ref={assistantScrollAnchorRef} />
              </div>
            </ScrollArea>
            </div>

            <div className="shrink-0 border-t border-slate-200/80 px-5 py-5 dark:border-slate-800">
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
                rows={isFullscreen ? 10 : 7}
                placeholder="例如：重新对当前候选人初筛，硬性要求加强硬件测试经验；或说明这次用了哪些 Skills"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  助手会自动携带当前岗位与启用 Skill 上下文，适合连续执行筛选、生成和查询操作。按 Ctrl/Cmd + Enter 可直接发送。
                </p>
                <Button onClick={() => void sendChatMessage()} disabled={chatSending}>
                  <Send className="h-4 w-4" />
                  发送
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200/80 px-5 py-5 2xl:border-t-0 2xl:border-l dark:border-slate-800">
            <div className="space-y-5">
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

              <Field label="推荐问题">
                <div className="space-y-2">
                  {[
                    "帮我生成 IoT 测试工程师 JD",
                    "查看当前岗位候选人列表",
                    "重新对当前候选人初筛，硬性要求加强硬件测试经验",
                    "给当前候选人生成初试题，重点考察硬件联调",
                    "说明这次对话用了哪些 Skills 和模型",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onMouseDown={preventAssistantActionFocusLoss}
                      onClick={() => applyAssistantPrompt(prompt)}
                      className="w-full rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-left text-xs text-slate-600 transition hover:border-slate-400 dark:border-slate-800 dark:text-slate-300"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderAssistantSuspendedState() {
    const modeLabel = assistantDisplayMode === "fullscreen" ? "全屏模式" : "宽抽屉模式";
    return (
      <div className="flex min-h-[520px] flex-col items-center justify-center gap-4 px-8 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <Bot className="h-6 w-6" />
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
        <div className="space-y-6">
          <Card className={cn(panelClass, "overflow-hidden border-0 bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_50%,#38bdf8_100%)] text-white")}>
            <CardContent className="flex flex-col gap-5 px-7 py-7 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <Badge className="rounded-full border-white/20 bg-white/10 text-white shadow-none">
                  Recruiting Workbench
                </Badge>
                <div>
                  <h2 className="text-3xl font-semibold tracking-tight">招聘流程统一工作台</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-100/80">
                    统一管理岗位、候选人、招聘流程与 AI 任务，快速掌握当前招聘推进状态。
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button className="bg-white text-slate-900 hover:bg-slate-100" onClick={() => openAssistantMode("drawer")}>
                  <Bot className="h-4 w-4" />
                  打开 AI 招聘助手
                </Button>
                <Button variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/15" onClick={openCreatePosition}>
                  <Plus className="h-4 w-4" />
                  新建岗位
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard title="招聘中岗位" value={dashboard?.cards.positions_recruiting ?? 0} description="当前在推进的岗位" icon={BriefcaseBusiness} />
            <MetricCard title="今日新增简历" value={todayNewResumes} description="今天导入的候选人数量" icon={Upload} />
            <MetricCard title="待初筛人数" value={dashboard?.cards.pending_screening ?? 0} description="优先需要处理的简历" icon={FileSearch} />
            <MetricCard title="初筛通过人数" value={dashboard?.cards.screening_passed ?? 0} description="已进入后续流程" icon={ClipboardCheck} />
            <MetricCard title="今日 AI 处理数" value={dashboard?.cards.recent_ai_tasks ?? 0} description="今天触发的 AI 任务" icon={Sparkles} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(480px,0.9fr)] 2xl:grid-cols-[minmax(0,1.25fr)_560px]">
            <div className="space-y-6">
              <Card className={panelClass}>
                <CardHeader className="pb-0">
                  <CardTitle className="text-lg">今日待办</CardTitle>
                  <CardDescription>根据岗位和候选人状态自动归纳今天最值得处理的工作。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-4">
                  <TodoCard title="待发布岗位" value={todoSummary.pendingPublish} description="草稿或尚未完成发布的岗位" />
                  <TodoCard title="待筛选简历" value={todoSummary.pendingScreening} description="需要快速初筛的候选人" />
                  <TodoCard title="待安排面试" value={todoSummary.pendingInterview} description="已通过初筛但未安排面试" />
                  <TodoCard title="待确认结果" value={todoSummary.pendingDecision} description="需要确认 Offer 或后续结果" />
                </CardContent>
              </Card>

              <Card className={panelClass}>
                <CardHeader className="pb-0">
                  <CardTitle className="text-lg">快捷操作</CardTitle>
                  <CardDescription>把高频动作前置成工作按钮，不再埋在二级标签页里。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-3">
                  <QuickActionCard title="新建岗位" description="录入岗位并进入详情工作区" icon={Plus} onClick={openCreatePosition} />
                  <QuickActionCard title="生成 JD" description="直接跳到当前岗位的 JD 工作区" icon={Wand2} onClick={() => setActivePage("positions")} />
                  <QuickActionCard title="上传简历" description="批量上传 PDF / DOC / DOCX 简历" icon={Upload} onClick={() => setResumeUploadOpen(true)} />
                  <QuickActionCard title="批量初筛" description="进入候选人页集中触发 AI 初筛" icon={ClipboardCheck} onClick={() => setActivePage("candidates")} />
                  <QuickActionCard title="生成面试题" description="在候选人详情区生成个性化题目" icon={NotebookText} onClick={() => setActivePage("candidates")} />
                  <QuickActionCard title="打开 AI 助手" description="自然语言驱动整个招聘流程" icon={Bot} onClick={() => openAssistantMode("drawer")} />
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card className={panelClass}>
                  <CardHeader>
                    <CardTitle className="text-lg">最新候选人</CardTitle>
                    <CardDescription>快速查看最近进入系统的人选。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recentCandidates.length ? recentCandidates.map((candidate) => (
                        <button
                            key={candidate.id}
                            type="button"
                            className="flex w-full items-start justify-between rounded-2xl border border-slate-200/80 px-4 py-4 text-left transition hover:border-slate-400 dark:border-slate-800"
                            onClick={() => {
                              setActivePage("candidates");
                              setSelectedCandidateId(candidate.id);
                            }}
                        >
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{candidate.name}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                              {candidate.position_title || "未分配岗位"} · 匹配度 {formatPercent(candidate.match_percent)}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge className={cn("rounded-full border", statusBadgeClass("candidate", candidate.status))}>
                              {labelForCandidateStatus(candidate.status)}
                            </Badge>
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(candidate.created_at)}</p>
                          </div>
                        </button>
                    )) : (
                        <EmptyState title="暂无候选人" description="上传简历后，这里会显示最新进入系统的候选人。" />
                    )}
                  </CardContent>
                </Card>

                <Card className={panelClass}>
                  <CardHeader>
                    <CardTitle className="text-lg">最近 AI 任务</CardTitle>
                    <CardDescription>用于汇报与排障的近期处理记录。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recentLogs.length ? recentLogs.map((log) => (
                        <button
                            key={log.id}
                            type="button"
                            className="flex w-full items-start justify-between rounded-2xl border border-slate-200/80 px-4 py-4 text-left transition hover:border-slate-400 dark:border-slate-800"
                            onClick={() => {
                              setActivePage("audit");
                              setSelectedLogId(log.id);
                            }}
                        >
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{labelForTaskType(log.task_type)}</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{shortText(log.input_summary, 48)}</p>
                          </div>
                          <div className="text-right">
                            <Badge className={cn("rounded-full border", statusBadgeClass("task", log.status))}>
                              {log.status}
                            </Badge>
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(log.created_at)}</p>
                          </div>
                        </button>
                    )) : (
                        <EmptyState title="暂无 AI 记录" description="触发 JD 生成、简历解析和评分后，这里会开始出现任务记录。" />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="space-y-6">
              <Card className={cn(panelClass, "overflow-hidden")}>
                {assistantOpen ? renderAssistantSuspendedState() : renderAssistantConsole("drawer")}
              </Card>

              <Card className={panelClass}>
                <CardHeader>
                  <CardTitle className="text-lg">状态分布</CardTitle>
                  <CardDescription>帮助领导和 HR 快速判断流程积压位置。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dashboard?.status_distribution?.length ? dashboard.status_distribution.map((item) => (
                      <div key={item.status} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{labelForCandidateStatus(item.status)}</p>
                          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{item.count}</p>
                        </div>
                      </div>
                  )) : (
                      <EmptyState title="暂无统计" description="候选人进入系统后，这里会展示各状态的人数分布。" />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
    );
  }

  function renderPositionsPage() {
    return (
        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className={cn(panelClass, "overflow-hidden")}>
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">岗位列表</CardTitle>
                  <CardDescription>左侧列岗位，右侧进入详情工作区。</CardDescription>
                </div>
                <Button size="sm" onClick={openCreatePosition}>
                  <Plus className="h-4 w-4" />
                  新建
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <SearchField value={positionQuery} onChange={setPositionQuery} placeholder="搜索岗位、部门或地点" />
              <NativeSelect value={positionStatusFilter} onChange={(event) => setPositionStatusFilter(event.target.value)}>
                <option value="all">全部状态</option>
                {Object.entries(positionStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                ))}
              </NativeSelect>
              <ScrollArea className="h-[700px]">
                <div className="space-y-3">
                  {positionsLoading ? (
                      <LoadingCard label="正在加载岗位列表" />
                  ) : positions.length ? positions.map((position) => (
                      <button
                          key={position.id}
                          type="button"
                          onClick={() => setSelectedPositionId(position.id)}
                          className={cn(
                              "w-full rounded-[22px] border px-4 py-4 text-left transition",
                              selectedPositionId === position.id
                                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                  : "border-slate-200/80 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950",
                          )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{position.title}</p>
                            <p className="mt-1 text-xs opacity-80">{position.department || "未设置部门"} · {position.location || "未设置地点"}</p>
                          </div>
                          <Badge className={cn("rounded-full border", selectedPositionId === position.id ? "border-white/20 bg-white/10 text-white dark:border-slate-300 dark:bg-slate-200 dark:text-slate-900" : statusBadgeClass("position", position.status))}>
                            {labelForPositionStatus(position.status)}
                          </Badge>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-xs opacity-85">
                          <div>
                            <p>JD 版本</p>
                            <p className="mt-1 font-medium">{position.jd_version_count}</p>
                          </div>
                          <div>
                            <p>候选人</p>
                            <p className="mt-1 font-medium">{position.candidate_count}</p>
                          </div>
                          <div>
                            <p>更新时间</p>
                            <p className="mt-1 font-medium">{formatDateTime(position.updated_at)}</p>
                          </div>
                        </div>
                      </button>
                  )) : (
                      <EmptyState title="暂无岗位" description="先新建一个岗位，再由 AI 生成 JD 并进入招聘流程。" />
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {positionDetailLoading ? <LoadingPanel label="正在加载岗位详情" /> : positionDetail ? (
                <>
                  <Card className={cn(panelClass, "overflow-hidden")}>
                    <CardContent className="px-7 py-7">
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={cn("rounded-full border", statusBadgeClass("position", positionDetail.position.status))}>
                              {labelForPositionStatus(positionDetail.position.status)}
                            </Badge>
                            <Badge variant="outline" className="rounded-full">代码 {positionDetail.position.position_code}</Badge>
                            <Badge variant="outline" className="rounded-full">{positionDetail.position.department || "未设置部门"}</Badge>
                          </div>
                          <div>
                            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{positionDetail.position.title}</h2>
                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                              {positionDetail.position.location || "未设置地点"} · {positionDetail.position.employment_type || "未设置用工类型"} · {positionDetail.position.salary_range || "未设置薪资"}
                            </p>
                          </div>
                          <p className="max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                            {positionDetail.position.summary || "这个岗位还没有补充摘要，建议先由 HR 或 AI 完善岗位背景和关键目标。"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 xl:max-w-[460px] xl:justify-end">
                          <Button onClick={() => void generateJD()} disabled={isJDGenerating}>
                            <Wand2 className="h-4 w-4" />
                            {isJDGenerating ? "JD 生成中..." : "AI 生成 JD"}
                          </Button>
                          <Button variant="outline" onClick={openEditPosition}>
                            <FilePlus2 className="h-4 w-4" />
                            编辑岗位
                          </Button>
                          <Button variant="outline" onClick={() => setPositionDeleteConfirmOpen(true)} disabled={positionDeleting}>
                            <Trash2 className="h-4 w-4" />
                            {positionDeleting ? "删除中..." : "删除岗位"}
                          </Button>
                          <Button variant="outline" onClick={() => setPublishDialogOpen(true)}>
                            <Rocket className="h-4 w-4" />
                            发布岗位
                          </Button>
                          <Button
                              variant="outline"
                              onClick={() => {
                                setCandidatePositionFilter(String(positionDetail.position.id));
                                setActivePage("candidates");
                              }}
                          >
                            <Users className="h-4 w-4" />
                            查看候选人
                          </Button>
                          <Button
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
                            <NotebookText className="h-4 w-4" />
                            生成面试题模板
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
                    <Card className={panelClass}>
                      <CardHeader className="space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-lg">当前 JD</CardTitle>
                            <CardDescription>默认展示可直接复制发布的岗位文案，Markdown 源文本和预览版放在次级视图。</CardDescription>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge className={cn("rounded-full border", statusBadgeClass("task", currentJDGenerationStatus === "syncing" ? "running" : currentJDGenerationStatus))}>
                              {labelForJDGenerationStatus(currentJDGenerationStatus)}
                            </Badge>
                            <Badge variant="outline" className="rounded-full">
                              当前版本 {currentJDVersion ? `V${currentJDVersion.version_no}` : "未生成"}
                            </Badge>
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <InfoTile label="最近生成时间" value={formatLongDateTime(positionDetail.jd_generation?.last_generated_at || currentJDVersion?.created_at)} />
                          <InfoTile label="当前生效版本" value={currentJDVersion ? `${currentJDVersion.title} · V${currentJDVersion.version_no}` : "暂无生效版本"} />
                          <InfoTile label="最近使用模型" value={positionDetail.jd_generation?.model_name || positionDetail.jd_generation?.model_provider || "暂未记录"} />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Field label="岗位信息速览">
                          <div className="grid gap-3 md:grid-cols-2">
                            <InfoTile label="招聘人数" value={`${positionDetail.position.headcount} 人`} />
                            <InfoTile label="标签" value={joinTags(positionDetail.position.tags) || "未设置"} />
                            <InfoTile label="关键要求" value={shortText(positionDetail.position.key_requirements, 100)} />
                            <InfoTile label="加分项" value={shortText(positionDetail.position.bonus_points, 100)} />
                            <InfoTile label="上传自动初筛" value={positionDetail.position.auto_screen_on_upload ? "已开启" : "未开启"} />
                            <InfoTile label="初筛绑定 Skills" value={formatSkillNames(positionDetail.position.screening_skill_ids || [], skillMap)} />
                            <InfoTile label="通过后自动推进" value={positionDetail.position.auto_advance_on_screening === false ? "关闭" : "开启"} />
                          </div>
                        </Field>

                        <Field label="AI 生成附加要求">
                          <Textarea value={jdExtraPrompt} onChange={(event) => setJdExtraPrompt(event.target.value)} rows={3} placeholder="补充本次 JD 生成时的个性化要求，例如强调 IoT 场景、自动化测试、设备联调经验等。" />
                        </Field>

                        <div className="grid gap-4 xl:grid-cols-2">
                          <Field label="版本标题">
                            <Input value={jdDraft.title} onChange={(event) => setJdDraft((current) => ({ ...current, title: event.target.value }))} />
                          </Field>
                          <Field label="版本备注">
                            <Input value={jdDraft.notes} onChange={(event) => setJdDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="例如：偏向 IoT 自动化测试" />
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
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {jdGenerationStatus === "syncing" ? "正在同步最新 JD 到页面..." : "正在生成 JD，请稍候..."}
                            </div>
                            <div className="mt-4 grid gap-3">
                              <div className="h-4 rounded-full bg-sky-100 dark:bg-sky-900/60" />
                              <div className="h-4 w-11/12 rounded-full bg-sky-100 dark:bg-sky-900/60" />
                              <div className="h-24 rounded-[18px] bg-white/80 dark:bg-slate-900/70" />
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
                            <ClipboardCheck className="h-4 w-4" />
                            一键复制发布文案
                          </Button>
                        </div>

                        {jdViewMode === "publish" ? (
                          <div className="min-h-[420px] whitespace-pre-wrap rounded-2xl border border-slate-200/80 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                            {currentPublishText || "当前还没有可直接发布的 JD 文案，点击“AI 生成 JD”后会在这里展示。"}
                          </div>
                        ) : null}

                        {jdViewMode === "markdown" ? (
                          <Field label="JD Markdown 源文本">
                            <Textarea value={jdDraft.jdMarkdown} onChange={(event) => setJdDraft((current) => ({ ...current, jdMarkdown: event.target.value }))} rows={18} />
                          </Field>
                        ) : null}

                        {jdViewMode === "preview" ? (
                          <Field label="预览版">
                            <div
                              className="min-h-[420px] rounded-2xl border border-slate-200/80 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                              dangerouslySetInnerHTML={{
                                __html: currentPreviewHtml,
                              }}
                            />
                          </Field>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                            <input type="checkbox" checked={jdDraft.autoActivate} onChange={(event) => setJdDraft((current) => ({ ...current, autoActivate: event.target.checked }))} />
                            保存后设为生效版本
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => void generateJD()} disabled={isJDGenerating}>
                              <Sparkles className="h-4 w-4" />
                              {isJDGenerating ? "生成中..." : "重新生成"}
                            </Button>
                            <Button onClick={() => void saveJDVersion()}>
                              <Save className="h-4 w-4" />
                              保存新版本
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="space-y-6">
                      <Card className={panelClass}>
                        <CardHeader>
                          <CardTitle className="text-lg">JD 历史版本</CardTitle>
                          <CardDescription>保留版本轨迹，并支持随时切换当前生效版本。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {positionDetail.jd_versions.length ? positionDetail.jd_versions.map((version) => (
                              <div key={version.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-medium text-slate-900 dark:text-slate-100">{version.title}</p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      版本 V{version.version_no} · {formatDateTime(version.created_at)}
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
                              <EmptyState title="暂无 JD 版本" description="点击 AI 生成 JD 或保存新版本后，这里会形成完整版本轨迹。" />
                          )}
                        </CardContent>
                      </Card>

                      <Card className={panelClass}>
                        <CardHeader>
                          <CardTitle className="text-lg">发布状态</CardTitle>
                          <CardDescription>发布能力已解耦成任务轨迹和适配层接口。</CardDescription>
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
                                    {task.status}
                                  </Badge>
                                </div>
                                {task.published_url ? (
                                    <a className="mt-3 inline-flex items-center gap-1 text-sm text-sky-600 hover:underline" href={task.published_url} target="_blank" rel="noreferrer">
                                      查看发布链接
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                ) : null}
                                {task.error_message ? <p className="mt-3 text-sm text-rose-600">{task.error_message}</p> : null}
                              </div>
                          )) : (
                              <EmptyState title="暂无发布任务" description="先完成 JD，再创建发布任务，后续可接入真实 BOSS / 智联适配器。" />
                          )}
                        </CardContent>
                      </Card>

                      <Card className={panelClass}>
                        <CardHeader>
                          <CardTitle className="text-lg">关联候选人</CardTitle>
                          <CardDescription>按岗位直接看到候选人进度，避免来回跳页找人。</CardDescription>
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
                              <EmptyState title="暂无候选人" description="上传简历并关联到这个岗位后，这里会出现最新候选人列表。" />
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </>
            ) : (
                <EmptyState title="请选择一个岗位" description="左侧选择岗位后，右侧会进入完整的岗位详情工作区。" />
            )}
          </div>
        </div>
    );
  }

  function renderCandidatesPage() {
    return (
        <div className="space-y-6">
          <Card className={panelClass}>
            <CardContent className="px-6 py-6">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">候选人筛选条</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">围绕岗位、状态、匹配度和来源过滤，保持 ATS 使用效率。</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                    <Button size="sm" variant={candidateViewMode === "list" ? "default" : "ghost"} onClick={() => setCandidateViewMode("list")}>
                      <List className="h-4 w-4" />
                      列表
                    </Button>
                    <Button size="sm" variant={candidateViewMode === "board" ? "default" : "ghost"} onClick={() => setCandidateViewMode("board")}>
                      <LayoutGrid className="h-4 w-4" />
                      看板
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 xl:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))]">
                  <SearchField value={candidateQuery} onChange={setCandidateQuery} placeholder="搜索候选人、手机号、邮箱、公司" />
                  <NativeSelect value={candidatePositionFilter} onChange={(event) => setCandidatePositionFilter(event.target.value)}>
                    <option value="all">全部岗位</option>
                    {positions.map((position) => (
                        <option key={position.id} value={position.id}>
                          {position.title}
                        </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect value={candidateStatusFilter} onChange={(event) => setCandidateStatusFilter(event.target.value)}>
                    <option value="all">全部状态</option>
                    {Object.entries(candidateStatusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect value={candidateMatchFilter} onChange={(event) => setCandidateMatchFilter(event.target.value)}>
                    <option value="all">全部匹配度</option>
                    <option value="80+">80% 以上</option>
                    <option value="60+">60% 以上</option>
                    <option value="40+">40% 以上</option>
                  </NativeSelect>
                  <NativeSelect value={candidateSourceFilter} onChange={(event) => setCandidateSourceFilter(event.target.value)}>
                    <option value="all">全部来源</option>
                    {sourceOptions.map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect value={candidateTimeFilter} onChange={(event) => setCandidateTimeFilter(event.target.value)}>
                    <option value="all">全部时间</option>
                    <option value="today">今天</option>
                    <option value="7d">近 7 天</option>
                    <option value="30d">近 30 天</option>
                  </NativeSelect>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,440px)]">
            <Card className={cn(panelClass, "overflow-hidden")}>
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">候选人列表</CardTitle>
                    <CardDescription>支持列表视图与状态看板视图，选中后右侧展示完整档案。</CardDescription>
                  </div>
                  <Badge variant="outline" className="rounded-full">{visibleCandidates.length} 人</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    已选中 <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedCandidateIds.length}</span> 位候选人
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setSelectedCandidateIds([])} disabled={!selectedCandidateIds.length}>
                      清空选择
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void triggerScreening(selectedCandidateIds)} disabled={!selectedCandidateIds.length || screeningSubmitting}>
                      <Sparkles className="h-4 w-4" />
                      {screeningSubmitting ? "初筛中..." : "批量开始初筛"}
                    </Button>
                    <Button size="sm" onClick={() => openResumeMailDialog(selectedCandidateIds)} disabled={!selectedCandidateIds.length}>
                      <Mail className="h-4 w-4" />
                      批量发送简历
                    </Button>
                  </div>
                </div>
                {candidatesLoading ? (
                    <LoadingCard label="正在加载候选人列表" />
                ) : candidateViewMode === "list" ? (
                    <ScrollArea className="h-[min(760px,calc(100vh-320px))]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">
                              <input
                                type="checkbox"
                                checked={visibleCandidates.length > 0 && visibleCandidates.every((candidate) => selectedCandidateIds.includes(candidate.id))}
                                onChange={(event) => setSelectedCandidateIds(event.target.checked ? visibleCandidates.map((candidate) => candidate.id) : [])}
                                aria-label="全选候选人"
                              />
                            </TableHead>
                            <TableHead>候选人</TableHead>
                            <TableHead>岗位</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>匹配度</TableHead>
                            <TableHead>来源</TableHead>
                            <TableHead>更新时间</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleCandidates.length ? visibleCandidates.map((candidate) => (
                              <TableRow
                                  key={candidate.id}
                                  className={cn("cursor-pointer", selectedCandidateId === candidate.id && "bg-slate-100 dark:bg-slate-900")}
                                  onClick={() => setSelectedCandidateId(candidate.id)}
                              >
                                <TableCell onClick={(event) => event.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selectedCandidateIds.includes(candidate.id)}
                                    onChange={(event) => toggleCandidateSelection(candidate.id, event.target.checked)}
                                    aria-label={`选择候选人 ${candidate.name}`}
                                  />
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-slate-900 dark:text-slate-100">{candidate.name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{candidate.phone || candidate.email || "未填写联系方式"}</p>
                                  </div>
                                </TableCell>
                                <TableCell>{candidate.position_title || "未分配岗位"}</TableCell>
                                <TableCell>
                                  <Badge className={cn("rounded-full border", statusBadgeClass("candidate", candidate.status))}>
                                    {labelForCandidateStatus(candidate.status)}
                                  </Badge>
                                </TableCell>
                                <TableCell>{formatPercent(candidate.match_percent)}</TableCell>
                                <TableCell>{candidate.source || "-"}</TableCell>
                                <TableCell>{formatDateTime(candidate.updated_at)}</TableCell>
                              </TableRow>
                          )) : (
                              <TableRow>
                                <TableCell colSpan={7}>
                                  <EmptyState title="没有符合条件的候选人" description="调整筛选条件，或先上传一批简历进入系统。" />
                                </TableCell>
                              </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                ) : (
                    <ScrollArea className="h-[min(760px,calc(100vh-320px))]">
                      <div className="grid gap-4 xl:grid-cols-3">
                        {groupedCandidates.map((group) => (
                            <div key={group.status} className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                              <div className="mb-4 flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.label}</p>
                                <Badge variant="outline" className="rounded-full">{group.items.length}</Badge>
                              </div>
                              <div className="space-y-3">
                                {group.items.length ? group.items.map((candidate) => (
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
                                          <p className="font-medium">{candidate.name}</p>
                                          <p className="mt-1 text-xs opacity-80">{candidate.position_title || "未分配岗位"}</p>
                                          <div className="mt-3 flex items-center justify-between text-xs opacity-80">
                                            <span>匹配度 {formatPercent(candidate.match_percent)}</span>
                                            <span>{formatDateTime(candidate.updated_at)}</span>
                                          </div>
                                        </button>
                                        <input
                                            type="checkbox"
                                            checked={selectedCandidateIds.includes(candidate.id)}
                                            onChange={(event) => toggleCandidateSelection(candidate.id, event.target.checked)}
                                            aria-label={`选择候选人 ${candidate.name}`}
                                        />
                                      </div>
                                    </div>
                                )) : (
                                    <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                      当前状态暂无候选人
                                    </p>
                                )}
                              </div>
                            </div>
                        ))}
                      </div>
                    </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card className={cn(panelClass, "min-w-0 overflow-hidden")}>
              {candidateDetailLoading ? <LoadingPanel label="正在加载候选人详情" /> : candidateDetail ? (
                  <div className="flex h-full min-h-0 min-w-0 flex-col">
                    <div className="border-b border-slate-200/80 px-6 py-5 dark:border-slate-800">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={cn("rounded-full border", statusBadgeClass("candidate", candidateDetail.candidate.status))}>
                              {labelForCandidateStatus(candidateDetail.candidate.status)}
                            </Badge>
                            <Badge variant="outline" className="rounded-full">
                              匹配度 {formatPercent(candidateDetail.candidate.match_percent)}
                            </Badge>
                          </div>
                          <h3 className="mt-3 break-words text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{candidateDetail.candidate.name}</h3>
                          <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
                            {candidateDetail.candidate.position_title || "未分配岗位"} · {candidateDetail.candidate.phone || candidateDetail.candidate.email || "未填写联系方式"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => void triggerScreening()} disabled={screeningSubmitting}>
                            <Sparkles className="h-4 w-4" />
                            {screeningSubmitting ? "\u521d\u7b5b\u4e2d..." : "\u5f00\u59cb\u521d\u7b5b"}
                          </Button>
                          {candidateDetail.resume_files[0] ? (
                            <Button size="sm" variant="outline" onClick={() => void openResumeFile(candidateDetail.resume_files[0])}>
                              <ExternalLink className="h-4 w-4" />
                              {"\u67e5\u770b\u7b80\u5386"}
                            </Button>
                          ) : null}
                          <Button size="sm" variant="outline" onClick={() => openResumeMailDialog([candidateDetail.candidate.id])}>
                            <Mail className="h-4 w-4" />
                            {"\u53d1\u9001\u7b80\u5386"}
                          </Button>
                          <Button size="sm" onClick={() => void generateInterviewQuestions()} disabled={interviewGenerating}>
                            <NotebookText className="h-4 w-4" />
                            {interviewGenerating ? "\u9762\u8bd5\u9898\u751f\u6210\u4e2d..." : "\u9762\u8bd5\u9898"}
                          </Button>
                        </div>
                      </div>
                      </div>

                    <ScrollArea className="h-[min(780px,calc(100vh-280px))]">
                      <div className="space-y-6 px-6 py-6">
                        <Field label="基础信息">
                          <div className="grid gap-3">
                            <Input value={candidateEditor.name} onChange={(event) => setCandidateEditor((current) => ({ ...current, name: event.target.value }))} placeholder="姓名" />
                            <Input value={candidateEditor.phone} onChange={(event) => setCandidateEditor((current) => ({ ...current, phone: event.target.value }))} placeholder="手机号" />
                            <Input value={candidateEditor.email} onChange={(event) => setCandidateEditor((current) => ({ ...current, email: event.target.value }))} placeholder="邮箱" />
                            <Input value={candidateEditor.currentCompany} onChange={(event) => setCandidateEditor((current) => ({ ...current, currentCompany: event.target.value }))} placeholder="当前公司" />
                            <Input value={candidateEditor.yearsOfExperience} onChange={(event) => setCandidateEditor((current) => ({ ...current, yearsOfExperience: event.target.value }))} placeholder="工作年限" />
                            <Input value={candidateEditor.education} onChange={(event) => setCandidateEditor((current) => ({ ...current, education: event.target.value }))} placeholder="学历" />
                          </div>
                        </Field>

                        <Field label="AI 评分与建议">
                          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                                  {candidateDetail.score?.total_score ?? "-"}
                                </p>
                                <p className="mt-1 break-words text-sm text-slate-500 dark:text-slate-400">
                                  AI 建议：{candidateDetail.score?.recommendation || "尚未生成"} · 推荐状态 {labelForCandidateStatus(candidateDetail.score?.suggested_status || "")}
                                </p>
                              </div>
                              <Badge variant="outline" className="rounded-full">
                                匹配度 {formatPercent(candidateDetail.score?.match_percent ?? candidateDetail.candidate.match_percent)}
                              </Badge>
                            </div>
                            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                              <p>
                                <span className="font-medium text-slate-900 dark:text-slate-100">优势：</span>
                                {candidateDetail.score?.advantages_text
                                    || joinTags(Array.isArray(candidateDetail.score?.advantages) ? candidateDetail.score.advantages as string[] : [])
                                    || "暂无"}
                              </p>
                              <p>
                                <span className="font-medium text-slate-900 dark:text-slate-100">风险点：</span>
                                {candidateDetail.score?.concerns_text
                                    || joinTags(Array.isArray(candidateDetail.score?.concerns) ? candidateDetail.score.concerns as string[] : [])
                                    || "暂无"}
                              </p>
                            </div>
                          </div>
                        </Field>

                        <Field label="初筛工作记忆">
                          {candidateDetail.workflow_memory ? (
                            <div className="grid gap-3">
                              <InfoTile label="记忆来源" value={labelForMemorySource(candidateDetail.workflow_memory.screening_memory_source)} />
                              <InfoTile label="最近初筛时间" value={formatLongDateTime(candidateDetail.workflow_memory.last_screened_at)} />
                              <InfoTile label="初筛 Skills" value={formatSkillNames(candidateDetail.workflow_memory.screening_skill_ids, skillMap)} />
                              <InfoTile label="面试题 Skills" value={formatSkillNames(candidateDetail.workflow_memory.interview_skill_ids, skillMap)} />
                            </div>
                          ) : (
                            <EmptyState title="暂无初筛工作记忆" description="完成一次初筛后，这里会显示本次初筛使用的 Skills、来源和时间，便于后续生成面试题时复用。" />
                          )}
                          <p className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400">
                            {`点击“开始初筛”时，会按“岗位绑定 Skills > 初筛工作记忆 > 全局默认 Skills”继续执行；当前预计来源：${effectiveScreeningSkillSourceLabel}。`}
                          </p>
                          <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
                            {`当前预计使用：${formatSkillNames(effectiveScreeningSkillIds, skillMap)}`}
                          </p>
                        </Field>

                        <div className="grid gap-4">
                          <Field label="人工修正分数">
                            <Input value={candidateEditor.manualOverrideScore} onChange={(event) => setCandidateEditor((current) => ({ ...current, manualOverrideScore: event.target.value }))} placeholder="例如 88" />
                          </Field>
                          <Field label="修正原因">
                            <Input value={candidateEditor.manualOverrideReason} onChange={(event) => setCandidateEditor((current) => ({ ...current, manualOverrideReason: event.target.value }))} placeholder="为什么要修正这次 AI 评分" />
                          </Field>
                        </div>

                        <Field label="标签与备注">
                          <div className="space-y-3">
                            <Input value={candidateEditor.tagsText} onChange={(event) => setCandidateEditor((current) => ({ ...current, tagsText: event.target.value }))} placeholder="标签，使用英文逗号分隔" />
                            <Textarea value={candidateEditor.notes} onChange={(event) => setCandidateEditor((current) => ({ ...current, notes: event.target.value }))} rows={4} placeholder="例如：沟通不错，但对设备联调经验需要进一步核实" />
                            <Button onClick={() => void saveCandidate()}>
                              <Save className="h-4 w-4" />
                              保存候选人信息
                            </Button>
                          </div>
                        </Field>

                        <Field label="状态流转">
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(candidateStatusLabels).map(([value, label]) => (
                                  <Button key={value} size="sm" variant={candidateDetail.candidate.status === value ? "default" : "outline"} onClick={() => void updateCandidateStatus(value)}>
                                    {label}
                                  </Button>
                              ))}
                            </div>
                            <Textarea value={statusUpdateReason} onChange={(event) => setStatusUpdateReason(event.target.value)} rows={3} placeholder="状态变更原因，例如：AI 初筛通过，安排技术面试" />
                            <div className="space-y-3">
                              {candidateDetail.status_history.length ? candidateDetail.status_history.map((history) => (
                                  <div key={history.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                        {labelForCandidateStatus(history.from_status || "")} → {labelForCandidateStatus(history.to_status)}
                                      </p>
                                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(history.created_at)}</p>
                                    </div>
                                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{history.reason || "未填写原因"}</p>
                                  </div>
                              )) : (
                                  <EmptyState title="暂无状态记录" description="候选人发生流转后，这里会记录完整状态历史。" />
                              )}
                            </div>
                          </div>
                        </Field>

                        <Field label="AI 助手">
                          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{"对话记录已收纳到独立助手面板"}</p>
                                <p className="mt-1 break-words text-sm leading-6 text-slate-500 dark:text-slate-400">
                                  {candidateAssistantActivity.length
                                    ? `当前候选人已有 ${candidateAssistantActivity.length} 条助手对话留痕。为避免详情页被聊天卡片刷满，这里改为收纳展示。`
                                    : "这里不再逐条展开助手对话，避免右侧详情被聊天记录挤满。"}
                                </p>
                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{`面试题默认使用：${preferredInterviewSkillSourceLabel}`}</p>
                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{`当前实际来源：${effectiveInterviewSkillSourceLabel}`}</p>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => openAssistantMode("drawer")}>
                                <Bot className="h-4 w-4" />
                                {"打开 AI 助手"}
                              </Button>
                            </div>
                          </div>
                        </Field>

                        <Field label="AI 执行日志">
                          <div className="space-y-3">
                            {candidateProcessActivity.length ? candidateProcessActivity.map((log) => {
                              const logSkillSnapshots = resolveLogSkillSnapshots(log, skillMap);
                              return (
                              <div key={log.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{labelForTaskType(log.task_type)}</p>
                                    <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{labelForProvider(log.model_provider)} {"·"} {log.model_name || "-"} {"·"} {formatLongDateTime(log.created_at)}</p>
                                  </div>
                                  <Badge className={cn("rounded-full border", statusBadgeClass("task", log.status))}>
                                    {log.status}
                                  </Badge>
                                </div>
                                <div className="mt-3 grid gap-3">
                                  <InfoTile
                                    label="Skills"
                                    value={formatSkillSnapshotNames(logSkillSnapshots)}
                                  />
                                  <InfoTile label="记忆来源" value={labelForMemorySource(log.memory_source)} />
                                </div>
                                {log.error_message ? <p className="mt-3 break-all text-sm text-rose-600">{log.error_message}</p> : null}
                                <div className="mt-3 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                  <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-600 dark:text-slate-300">{formatStructuredValue(log.output_snapshot, log.output_summary || "执行中，等待模型返回...")}</pre>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button size="sm" variant="outline" onClick={() => openTaskLogDetail(log.id)}>查看完整日志</Button>
                                </div>
                              </div>
                              );
                            }) : (
                              <EmptyState title="暂无 AI 执行日志" description="开始初筛、生成面试题后，这里会显示候选人的流程任务留痕与输出内容。" />
                            )}
                          </div>
                        </Field>


                        <Field label="简历与面试题">
                          <div className="space-y-4">
                            <div className="space-y-3">
                              {candidateDetail.resume_files.length ? candidateDetail.resume_files.map((file) => (
                                  <div key={file.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                                    <p className="font-medium text-slate-900 dark:text-slate-100">{file.original_name}</p>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      {file.file_ext || "-"} {"·"} {file.file_size || 0} bytes {"·"} {"解析状态"} {file.parse_status}
                                    </p>
                                    {file.parse_error ? <p className="mt-2 break-all text-sm text-rose-600">{file.parse_error}</p> : null}
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <Button size="sm" variant="outline" onClick={() => void openResumeFile(file)}>{"查看原件"}</Button>
                                      <Button size="sm" variant="outline" onClick={() => void openResumeFile(file, true)}>{"下载简历"}</Button>
                                    </div>
                                  </div>
                              )) : (
                                  <EmptyState title="暂无简历附件" description="这个候选人还没有已上传的简历文件。" />
                              )}
                            </div>

                            <Separator />

                            <div className="space-y-3">
                              <div className="grid gap-3">
                                <Input value={interviewRoundName} onChange={(event) => setInterviewRoundName(event.target.value)} placeholder="轮次，例如 初试 / 复试" />
                                <Input value={joinTags(effectiveInterviewSkillIds.map((id) => skillMap.get(id)?.name || ""))} readOnly placeholder="当前使用的 Skills" />
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{`当前默认来源：${preferredInterviewSkillSourceLabel}`}</p>
                              <Textarea value={interviewCustomRequirements} onChange={(event) => setInterviewCustomRequirements(event.target.value)} rows={3} placeholder="补充要求，例如：偏向 IoT 设备联调、自动化稳定性、跨部门协作追问" />
                              <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                                {`当前实际 Skills：${formatSkillNames(effectiveInterviewSkillIds, skillMap)}`}
                              </p>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-slate-500 dark:text-slate-400">{`当前实际来源：${effectiveInterviewSkillSourceLabel}`}</p>
                                {interviewSkillSelectionDirty ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setSelectedInterviewSkillIds([]);
                                      setInterviewSkillSelectionDirty(false);
                                    }}
                                  >
                                    恢复默认 Skills
                                  </Button>
                                ) : null}
                              </div>
                              <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                                {!interviewSkillSelectionDirty
                                  ? "未手动选择时，生成面试题会按“岗位绑定 Skills > 面试题工作记忆 > 初筛工作记忆 > 全局默认 Skills”执行。"
                                  : "当前已手动选择 Skills，本次会以手动选择为准。"}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {skills.map((skill) => (
                                    <button
                                        key={skill.id}
                                        type="button"
                                        className={cn(
                                            "rounded-full border px-3 py-2 text-xs transition",
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
                              {candidateDetail.interview_questions.length ? (
                                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                      <p className="font-medium text-slate-900 dark:text-slate-100">
                                        {"最近一份面试题："}{candidateDetail.interview_questions[0].round_name}
                                      </p>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => void downloadInterviewQuestion(candidateDetail.interview_questions[0].id)}
                                      >
                                        <Download className="h-4 w-4" />
                                        {"下载 HTML"}
                                      </Button>
                                    </div>
                                    <div className="prose prose-slate max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: candidateDetail.interview_questions[0].html_content }} />
                                  </div>
                              ) : (
                                  <EmptyState title="暂无面试题" description="点击上方按钮后，系统会结合岗位 JD、候选人简历和 Skills 生成定制化题目。" />
                              )}
                            </div>
                          </div>
                        </Field>

                      </div>
                    </ScrollArea>
                  </div>
              ) : (
                  <EmptyState title="请选择一个候选人" description="左侧列表或看板选中候选人后，右侧会打开完整档案与 AI 评估区。" />
              )}
            </Card>
          </div>
        </div>
    );
  }

  function renderAuditPage() {
    const selectedLogSkillSnapshots = selectedLogDetail ? resolveLogSkillSnapshots(selectedLogDetail, skillMap) : [];

    return (
        <div className="space-y-6">
          <Card className={panelClass}>
            <CardContent className="grid gap-3 px-6 py-6 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_auto]">
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
                <option value="success">success</option>
                <option value="fallback">fallback</option>
                <option value="running">running</option>
                <option value="failed">failed</option>
              </NativeSelect>
              <Button variant="outline" onClick={() => void refreshLogsWithFeedback()} disabled={logsLoading}>
                {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {logsLoading ? "刷新中..." : "刷新任务"}
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_420px]">
            <Card className={cn(panelClass, "overflow-hidden")}>
              <CardHeader className="pb-0">
                <CardTitle className="text-lg">任务审计中心</CardTitle>
                <CardDescription>展示任务类型、关联对象、状态、使用模型和执行时间。</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {logsLoading ? (
                    <LoadingCard label="正在加载 AI 审计日志" />
                ) : (
                    <ScrollArea className="h-[760px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>任务类型</TableHead>
                            <TableHead>关联对象</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>模型</TableHead>
                            <TableHead>时间</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {aiLogs.length ? aiLogs.map((log) => (
                              <TableRow
                                  key={log.id}
                                  className={cn("cursor-pointer", selectedLogId === log.id && "bg-slate-100 dark:bg-slate-900")}
                                  onClick={() => setSelectedLogId(log.id)}
                              >
                                <TableCell>{labelForTaskType(log.task_type)}</TableCell>
                                <TableCell>{buildLogObjectLabel(log, positionMap, candidateMap, skillMap)}</TableCell>
                                <TableCell>
                                  <Badge className={cn("rounded-full border", statusBadgeClass("task", log.status))}>
                                    {log.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{labelForProvider(log.model_provider)} · {log.model_name || "-"}</TableCell>
                                <TableCell>{formatDateTime(log.created_at)}</TableCell>
                              </TableRow>
                          )) : (
                              <TableRow>
                                <TableCell colSpan={5}>
                                  <EmptyState title="暂无 AI 审计记录" description="当招聘模块调用模型后，这里会沉淀成可追踪的任务日志。" />
                                </TableCell>
                              </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card className={cn(panelClass, "overflow-hidden")}>
              {logDetailLoading ? <LoadingPanel label="正在加载日志详情" /> : selectedLogDetail ? (
                  <div className="space-y-5 px-6 py-6">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={cn("rounded-full border", statusBadgeClass("task", selectedLogDetail.status))}>
                          {selectedLogDetail.status}
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

                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoTile
                        label="技能使用情况"
                        value={formatSkillSnapshotNames(selectedLogSkillSnapshots)}
                      />
                      <InfoTile label="记忆来源" value={labelForMemorySource(selectedLogDetail.memory_source)} />
                    </div>
                    <InfoTile label="输入摘要" value={selectedLogDetail.input_summary || "暂无"} />
                    <InfoTile label="输出摘要" value={selectedLogDetail.output_summary || "暂无"} />
                    <InfoTile label="错误信息" value={selectedLogDetail.error_message || "无"} />
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
                              <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-600 dark:text-slate-300">{skill.content || "暂无内容"}</pre>
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
                        <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap">{selectedLogDetail.prompt_snapshot || "暂无 Prompt 快照"}</pre>
                      </div>
                    </Field>
                    <Field label="完整输出">
                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap">{formatStructuredValue(selectedLogDetail.output_snapshot, selectedLogDetail.output_summary || "暂无完整输出")}</pre>
                      </div>
                    </Field>
                  </div>
              ) : (
                  <EmptyState title="请选择一条任务记录" description="左侧点开任务后，这里会展示输入摘要、输出摘要、错误信息和 Skill 使用情况。" />
              )}
            </Card>
          </div>
        </div>
    );
  }

  function renderAssistantPage() {
    return (
        <Card className={cn(panelClass, "overflow-hidden")}>
          {assistantOpen ? renderAssistantSuspendedState() : renderAssistantConsole("page")}
        </Card>
    );
  }

  function renderSkillsPage() {
    return (
        <div className="space-y-6">
          <Card className={panelClass}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-6">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Skills 属于管理员设置</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">入口已收进管理设置，避免主工作台被配置项干扰。</p>
              </div>
              <Button onClick={() => openSkillEditor()}>
                <Plus className="h-4 w-4" />
                新增 Skill
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {skillsLoading ? <LoadingPanel label="正在加载 Skills" /> : skills.length ? skills.map((skill) => (
                <Card key={skill.id} className={panelClass}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{skill.name}</CardTitle>
                        <CardDescription className="mt-2">{skill.description || "未填写说明"}</CardDescription>
                      </div>
                      <Badge className={cn("rounded-full border", skill.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                        {skill.is_enabled ? "启用中" : "已停用"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{shortText(skill.content, 220)}</p>
                    <div className="flex flex-wrap gap-2">
                      {skill.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="rounded-full">{tag}</Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openSkillEditor(skill)}>编辑</Button>
                      <Button size="sm" variant="outline" onClick={() => void toggleSkill(skill.id, !skill.is_enabled)}>
                        {skill.is_enabled ? "停用" : "启用"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSkillDeleteTarget(skill)}>删除</Button>
                    </div>
                  </CardContent>
                </Card>
            )) : <EmptyState title="暂无 Skills" description="管理员可以在这里维护招聘领域 Skills，供 AI 评估和题目生成使用。" />}
          </div>
        </div>
    );
  }
  function renderModelsPage() {
    const groupedConfigs = Array.from(
      llmConfigs.reduce((map, item) => {
        const current = map.get(item.task_type) || [];
        current.push(item);
        map.set(item.task_type, current);
        return map;
      }, new Map<string, RecruitmentLLMConfig[]>()).entries(),
    );

    return (
      <div className="space-y-6">
        <Card className={panelClass}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-6">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">模型配置中心</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">同一任务类型会按优先级数字从小到大生效。要切到你新加的小米模型，直接把它设为当前使用即可。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void refreshLLMConfigsWithFeedback()} disabled={modelsLoading}>
                {modelsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {modelsLoading ? "刷新中..." : "刷新模型"}
              </Button>
              <Button onClick={() => openLLMEditor()}>
                <Plus className="h-4 w-4" />
                新增模型
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoTile label="当前对话模型" value={assistantModelLabel} />
          <InfoTile label="当前对话来源" value={assistantActiveLLMConfig?.resolved_source || "暂未识别"} />
          <InfoTile label="已启用模型数" value={String(llmConfigs.filter((item) => item.is_active).length)} />
          <InfoTile label="模型总数" value={String(llmConfigs.length)} />
        </div>

        {groupedConfigs.length ? groupedConfigs.map(([taskType, configs]) => (
          <Card key={taskType} className={panelClass}>
            <CardHeader>
              <CardTitle className="text-lg">{labelForTaskType(taskType)}</CardTitle>
              <CardDescription>当前任务会优先命中标记为“当前生效”的模型；若它被停用或删除，系统会自动回退到同任务下一个可用配置。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {configs.map((config) => {
                const isCurrent = preferredLLMConfigIds.has(config.id);
                const resolvedProvider = labelForProvider(config.resolved_provider || config.provider);
                const resolvedModelName = config.resolved_model_name || config.model_name || "-";
                return (
                  <div key={config.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{config.config_key}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{resolvedProvider} / {resolvedModelName}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {isCurrent ? <Badge className="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">当前生效</Badge> : null}
                        <Badge className={cn("rounded-full border", config.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                          {config.is_active ? "已启用" : "已停用"}
                        </Badge>
                        <Badge variant="outline" className="rounded-full">优先级 {config.priority}</Badge>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <InfoTile label="Provider" value={labelForProvider(config.provider)} />
                      <InfoTile label="模型名" value={config.model_name} />
                      <InfoTile label="解析后来源" value={config.resolved_source || "-"} />
                      <InfoTile label="Base URL" value={config.resolved_base_url || config.base_url || "-"} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" variant={isCurrent ? "default" : "outline"} onClick={() => void setPreferredLLMConfig(config)} disabled={isCurrent}>
                        {isCurrent ? "当前使用中" : "设为当前使用"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openLLMEditor(config)}>编辑</Button>
                      <Button size="sm" variant="outline" onClick={() => setLlmDeleteTarget(config)}>删除</Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )) : (
          <EmptyState title="暂无模型配置" description="先新增至少一个模型配置，系统才会按任务类型进行路由。" />
        )}
      </div>
    );
  }

  function renderMailSettingsPage() {
    const hasMailData = mailSenderConfigs.length || mailRecipients.length || resumeMailDispatches.length;

    if (mailSettingsLoading && !hasMailData) {
      return <LoadingPanel label="正在加载邮件中心" />;
    }

    return (
      <div className="space-y-6">
        <Card className={panelClass}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 px-6 py-6">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">邮件配置与投递中心</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">统一维护发件箱、收件人和发送记录，并支持从当前候选人上下文直接发简历。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void refreshMailSettingsWithFeedback()} disabled={mailSettingsLoading}>
                {mailSettingsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {mailSettingsLoading ? "刷新中..." : "刷新邮件配置"}
              </Button>
              <Button
                variant="outline"
                onClick={() => openResumeMailDialog()}
                disabled={!selectedCandidateIds.length && !selectedCandidateId}
              >
                <Send className="h-4 w-4" />
                发送当前候选人
              </Button>
              <Button variant="outline" onClick={() => openMailRecipientEditor()}>
                <Plus className="h-4 w-4" />
                新增收件人
              </Button>
              <Button onClick={() => openMailSenderEditor()}>
                <Plus className="h-4 w-4" />
                新增发件箱
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className={panelClass}>
            <CardHeader>
              <CardTitle className="text-lg">发件箱</CardTitle>
              <CardDescription>支持个人邮箱、163、Outlook 和后续企业邮箱。默认发件箱会作为简历发送时的首选。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mailSenderConfigs.length ? mailSenderConfigs.map((sender) => (
                <div key={sender.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{sender.name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sender.from_name || sender.name} &lt;{sender.from_email}&gt;</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sender.is_default ? <Badge className="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">默认</Badge> : null}
                      <Badge className={cn("rounded-full border", sender.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                        {sender.is_enabled ? "启用中" : "已停用"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <InfoTile label="SMTP" value={`${sender.smtp_host}:${sender.smtp_port}`} />
                    <InfoTile label="登录账号" value={sender.username} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openMailSenderEditor(sender)}>编辑</Button>
                    <Button size="sm" variant="outline" onClick={() => setMailSenderDeleteTarget(sender)}>删除</Button>
                  </div>
                </div>
              )) : <EmptyState title="暂无发件箱" description="先配置至少一个发件箱，后续才能把简历发送给 HR、面试官或管理层。" />}
            </CardContent>
          </Card>

          <Card className={panelClass}>
            <CardHeader>
              <CardTitle className="text-lg">收件人</CardTitle>
              <CardDescription>统一维护公司内部可选收件人，发送时支持单选、多选，并允许临时补充外部邮箱。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mailRecipients.length ? mailRecipients.map((recipient) => (
                <div key={recipient.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{recipient.name}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{recipient.email}</p>
                    </div>
                    <Badge className={cn("rounded-full border", recipient.is_enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                      {recipient.is_enabled ? "可选择" : "已停用"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {recipient.department || "未设置部门"} / {recipient.role_title || "未设置岗位"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recipient.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="rounded-full">{tag}</Badge>
                    ))}
                  </div>
                  {recipient.notes ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{recipient.notes}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openMailRecipientEditor(recipient)}>编辑</Button>
                    <Button size="sm" variant="outline" onClick={() => setMailRecipientDeleteTarget(recipient)}>删除</Button>
                  </div>
                </div>
              )) : <EmptyState title="暂无收件人" description="先维护公司内部收件人名单，发送简历时就能直接多选。" />}
            </CardContent>
          </Card>
        </div>

        <Card className={panelClass}>
          <CardHeader>
            <CardTitle className="text-lg">发送记录</CardTitle>
            <CardDescription>保留每次简历发送的发件箱、候选人、收件人、主题和状态，便于追踪是否已送达。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {resumeMailDispatches.length ? resumeMailDispatches.map((dispatch) => {
              const recipientSummary = [
                ...dispatch.recipient_ids.map((recipientId) => mailRecipientMap.get(recipientId)?.name || `收件人 #${recipientId}`),
                ...dispatch.recipient_emails,
              ].join("、");
              const candidateSummary = dispatch.candidate_ids
                .map((candidateId) => candidateMap.get(candidateId)?.name || `候选人 #${candidateId}`)
                .join("、");

              return (
                <div key={dispatch.id} className="rounded-2xl border border-slate-200/80 px-4 py-4 dark:border-slate-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{dispatch.subject || "未自定义标题（将使用系统默认标题）"}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {mailSenderMap.get(dispatch.sender_config_id || 0)?.name || dispatch.sender_name || "默认发件箱"} / {formatLongDateTime(dispatch.sent_at || dispatch.created_at)}
                      </p>
                    </div>
                    <Badge className={cn("rounded-full border", statusBadgeClass("task", dispatch.status === "sent" ? "success" : dispatch.status))}>
                      {dispatch.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <InfoTile label="候选人" value={shortText(candidateSummary || "未记录", 120)} />
                    <InfoTile label="收件人" value={shortText(recipientSummary || "未记录", 120)} />
                  </div>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{shortText(dispatch.body_text || "正文留空时，系统会使用默认邮件正文模板。", 180)}</p>
                  {dispatch.error_message ? (
                    <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{dispatch.error_message}</p>
                  ) : null}
                </div>
              );
            }) : <EmptyState title="暂无发送记录" description="从候选人中心发送简历后，这里会沉淀完整的发送审计记录。" />}
          </CardContent>
        </Card>
      </div>
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
        <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_42%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_42%),linear-gradient(180deg,#020617_0%,#0f172a_100%)]">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载 AI 招聘工作台...
          </div>
        </div>
    );
  }

  return (
      <div className="relative flex h-full min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.10),_transparent_35%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-slate-700 dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] dark:text-slate-300">
        <div className="border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div className="flex items-start gap-4">
              <Button variant="outline" size="icon" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-full border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                    AI 招聘自动化管理
                  </Badge>
                  <Badge variant="outline" className="rounded-full">正式工作台模式</Badge>
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{pageMeta[activePage].title}</h1>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500 dark:text-slate-400">{pageMeta[activePage].description}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => void refreshCoreDataWithFeedback()} disabled={coreRefreshing}>
                {coreRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {coreRefreshing ? "刷新中..." : "刷新"}
              </Button>
              <Button variant="outline" onClick={() => setResumeUploadOpen(true)}>
                <Upload className="h-4 w-4" />
                上传简历
              </Button>
              <Button onClick={openCreatePosition}>
                <Plus className="h-4 w-4" />
                新建岗位
              </Button>
              <Button className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200" onClick={() => openAssistantMode("drawer")}>
                <Bot className="h-4 w-4" />
                打开 AI 助手
              </Button>
              {canManageRecruitment ? (
                  <Popover open={settingsPopoverOpen} onOpenChange={setSettingsPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline">
                        <Settings2 className="h-4 w-4" />
                        管理设置
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 rounded-2xl border-slate-200 p-2 dark:border-slate-800">
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

        <div className="grid min-h-0 flex-1 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-r border-slate-200/80 bg-white/70 px-4 py-5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/50">
            <div className="space-y-2">
              <SectionNavButton active={activePage === "workspace"} icon={FolderKanban} title="招聘工作台" description="首页指标、待办、快捷操作与近期活动" count={dashboard?.cards.positions_recruiting ?? 0} onClick={() => setActivePage("workspace")} />
              <SectionNavButton active={activePage === "positions"} icon={BriefcaseBusiness} title="岗位管理" description="岗位列表 + 详情工作区 + JD 版本" count={positions.length} onClick={() => setActivePage("positions")} />
              <SectionNavButton active={activePage === "candidates"} icon={Users} title="候选人中心" description="ATS 列表、筛选、状态推进与档案查看" count={visibleCandidates.length} onClick={() => setActivePage("candidates")} />
              <SectionNavButton active={activePage === "audit"} icon={History} title="AI 审计中心" description="看 AI 处理记录、模型、错误与留痕" count={aiLogs.length} onClick={() => setActivePage("audit")} />
              <SectionNavButton active={activePage === "assistant"} icon={Bot} title="AI 招聘助手" description="自然语言驱动岗位、候选人和 Skill 上下文" onClick={() => setActivePage("assistant")} />
            </div>

            <Separator className="my-5" />

            <div className="rounded-[24px] border border-slate-200/80 bg-white/85 px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">今日关注</p>
              <div className="mt-4 space-y-3 text-sm">
                <MiniStat label="待筛选简历" value={todoSummary.pendingScreening} />
                <MiniStat label="待安排面试" value={todoSummary.pendingInterview} />
                <MiniStat label="今日新增简历" value={todayNewResumes} />
              </div>
            </div>
          </aside>

          <div className="min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-6">{renderPage()}</div>
            </ScrollArea>
          </div>
        </div>

        <Button
            className="fixed bottom-6 right-6 z-30 h-14 rounded-full bg-slate-900 px-5 text-white shadow-[0_20px_40px_-18px_rgba(15,23,42,0.5)] hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            onClick={() => openAssistantMode("drawer")}
        >
          <Bot className="h-4 w-4" />
          AI 助手
        </Button>

        <Dialog open={assistantOpen} onOpenChange={setAssistantOpen}>
          <DialogContent
            className={cn(
              "left-auto top-0 h-screen max-w-none translate-y-0 rounded-none p-0 sm:max-w-none",
              assistantDisplayMode === "fullscreen"
                ? "right-0 w-screen translate-x-0 border-0"
                : "right-0 w-[min(1040px,100vw)] translate-x-0 border-l",
            )}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              queueAssistantInputFocus(true);
            }}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>AI 招聘助手</DialogTitle>
              <DialogDescription>用于生成 JD、查看岗位候选人、筛选简历和生成面试题的招聘助手对话面板。</DialogDescription>
            </DialogHeader>
            {renderAssistantConsole(assistantDisplayMode)}
          </DialogContent>
        </Dialog>

        <Dialog open={positionDialogOpen} onOpenChange={setPositionDialogOpen}>
          <DialogContent className="flex h-[min(88vh,900px)] max-h-[88vh] flex-col overflow-hidden sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>{positionDialogMode === "create" ? "新建岗位" : "编辑岗位"}</DialogTitle>
              <DialogDescription>岗位基础信息放在弹窗中维护，详情操作回到岗位工作区完成。</DialogDescription>
            </DialogHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 px-1 py-1">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="岗位名称"><Input value={positionForm.title} onChange={(event) => setPositionForm((current) => ({ ...current, title: event.target.value }))} /></Field>
                  <Field label="部门"><Input value={positionForm.department} onChange={(event) => setPositionForm((current) => ({ ...current, department: event.target.value }))} /></Field>
                  <Field label="地点"><Input value={positionForm.location} onChange={(event) => setPositionForm((current) => ({ ...current, location: event.target.value }))} /></Field>
                  <Field label="用工类型"><Input value={positionForm.employmentType} onChange={(event) => setPositionForm((current) => ({ ...current, employmentType: event.target.value }))} /></Field>
                  <Field label="薪资范围"><Input value={positionForm.salaryRange} onChange={(event) => setPositionForm((current) => ({ ...current, salaryRange: event.target.value }))} /></Field>
                  <Field label="招聘人数"><Input type="number" value={positionForm.headcount} onChange={(event) => setPositionForm((current) => ({ ...current, headcount: event.target.value }))} /></Field>
                  <Field label="岗位状态">
                    <NativeSelect value={positionForm.status} onChange={(event) => setPositionForm((current) => ({ ...current, status: event.target.value }))}>
                      {Object.entries(positionStatusLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="标签"><Input value={positionForm.tagsText} onChange={(event) => setPositionForm((current) => ({ ...current, tagsText: event.target.value }))} placeholder="标签，使用英文逗号分隔" /></Field>
                  <Field label="关键要求"><Textarea value={positionForm.keyRequirements} onChange={(event) => setPositionForm((current) => ({ ...current, keyRequirements: event.target.value }))} rows={4} /></Field>
                  <Field label="加分项"><Textarea value={positionForm.bonusPoints} onChange={(event) => setPositionForm((current) => ({ ...current, bonusPoints: event.target.value }))} rows={4} /></Field>
                  <Field label="初筛配置" className="md:col-span-2">
                    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={positionForm.autoScreenOnUpload}
                          onChange={(event) => setPositionForm((current) => ({ ...current, autoScreenOnUpload: event.target.checked }))}
                        />
                        上传简历后自动进入初筛
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={positionForm.autoAdvanceOnScreening}
                          onChange={(event) => setPositionForm((current) => ({ ...current, autoAdvanceOnScreening: event.target.checked }))}
                        />
                        初筛通过后自动推进候选人状态
                      </label>
                      <div className="space-y-3">
                        <p className="text-sm text-slate-600 dark:text-slate-300">绑定 Skills，作为该岗位默认初筛规则和后续面试题上下文。</p>
                        <div className="flex flex-wrap gap-2">
                          {skills.length ? skills.map((skill) => (
                            <button
                              key={skill.id}
                              type="button"
                              className={cn(
                                "rounded-full border px-3 py-2 text-xs transition",
                                positionForm.screeningSkillIds.includes(skill.id)
                                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                  : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
                              )}
                              onClick={() => setPositionForm((current) => ({
                                ...current,
                                screeningSkillIds: toggleIdInList(current.screeningSkillIds, skill.id),
                              }))}
                            >
                              {skill.name}
                            </button>
                          )) : (
                            <p className="text-sm text-slate-500 dark:text-slate-400">暂无可绑定 Skill，请先到管理设置里创建。</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Field>
                </div>
                <Field label="岗位摘要">
                  <Textarea value={positionForm.summary} onChange={(event) => setPositionForm((current) => ({ ...current, summary: event.target.value }))} rows={5} />
                </Field>
              </div>
            </ScrollArea>
            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => setPositionDialogOpen(false)}>取消</Button>
              <Button onClick={() => void submitPosition()}>保存岗位</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={resumeUploadOpen} onOpenChange={setResumeUploadOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>上传简历</DialogTitle>
              <DialogDescription>支持批量上传 PDF / DOC / DOCX / TXT。若岗位开启“上传自动初筛”，系统会自动进入新的初筛流程；否则可在候选人页手动触发。</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Field label="关联岗位">
                <NativeSelect value={resumeUploadPositionId} onChange={(event) => setResumeUploadPositionId(event.target.value)}>
                  <option value="all">暂不关联岗位</option>
                  {positions.map((position) => (
                      <option key={position.id} value={position.id}>{position.title}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="选择文件">
                <Input type="file" multiple onChange={(event) => setResumeUploadFiles(Array.from(event.target.files || []))} />
              </Field>
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
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

        <Dialog open={Boolean(llmDeleteTarget)} onOpenChange={(open) => { if (!open) setLlmDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>确认删除模型配置</DialogTitle>
              <DialogDescription>删除后将不再参与任务路由。如果它是当前生效模型，系统会自动回落到其他可用配置。</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLlmDeleteTarget(null)} disabled={deleteActionKey === `llm-${llmDeleteTarget?.id}`}>取消</Button>
              <Button variant="destructive" onClick={() => llmDeleteTarget && void deleteLLMConfig(llmDeleteTarget.id)} disabled={deleteActionKey === `llm-${llmDeleteTarget?.id}`}>
                {deleteActionKey === `llm-${llmDeleteTarget?.id}` ? "删除中..." : "确认删除"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(skillDeleteTarget)} onOpenChange={(open) => { if (!open) setSkillDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>确认删除 Skill</DialogTitle>
              <DialogDescription>删除后该规则将不再参与新的招聘流程，但历史对话和任务日志仍会保留这次使用痕迹。</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSkillDeleteTarget(null)} disabled={deleteActionKey === `skill-${skillDeleteTarget?.id}`}>取消</Button>
              <Button variant="destructive" onClick={() => skillDeleteTarget && void deleteSkill(skillDeleteTarget.id)} disabled={deleteActionKey === `skill-${skillDeleteTarget?.id}`}>
                {deleteActionKey === `skill-${skillDeleteTarget?.id}` ? "删除中..." : "确认删除"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(mailSenderDeleteTarget)} onOpenChange={(open) => { if (!open) setMailSenderDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>确认删除发件箱</DialogTitle>
              <DialogDescription>删除后它将无法继续发送简历邮件；已有发送记录会继续保留。</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMailSenderDeleteTarget(null)} disabled={deleteActionKey === `mail-sender-${mailSenderDeleteTarget?.id}`}>取消</Button>
              <Button variant="destructive" onClick={() => mailSenderDeleteTarget && void deleteMailSender(mailSenderDeleteTarget.id)} disabled={deleteActionKey === `mail-sender-${mailSenderDeleteTarget?.id}`}>
                {deleteActionKey === `mail-sender-${mailSenderDeleteTarget?.id}` ? "删除中..." : "确认删除"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(mailRecipientDeleteTarget)} onOpenChange={(open) => { if (!open) setMailRecipientDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>确认删除收件人</DialogTitle>
              <DialogDescription>删除后发送简历时将不再出现在可选名单里，历史发送记录不会受影响。</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMailRecipientDeleteTarget(null)} disabled={deleteActionKey === `mail-recipient-${mailRecipientDeleteTarget?.id}`}>取消</Button>
              <Button variant="destructive" onClick={() => mailRecipientDeleteTarget && void deleteMailRecipient(mailRecipientDeleteTarget.id)} disabled={deleteActionKey === `mail-recipient-${mailRecipientDeleteTarget?.id}`}>
                {deleteActionKey === `mail-recipient-${mailRecipientDeleteTarget?.id}` ? "删除中..." : "确认删除"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>创建发布任务</DialogTitle>
              <DialogDescription>首期保留 mock / adapter 架构，不把平台发布能力写死在业务主流程里。</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <Field label="目标平台">
                <NativeSelect value={publishPlatform} onChange={(event) => setPublishPlatform(event.target.value)}>
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
              <DialogDescription>Skills 是管理员配置项，因此入口收在管理设置里，不占用主工作台主路径。</DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-1 py-1">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="名称"><Input value={skillForm.name} onChange={(event) => setSkillForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                <Field label="排序"><Input type="number" value={skillForm.sortOrder} onChange={(event) => setSkillForm((current) => ({ ...current, sortOrder: event.target.value }))} /></Field>
              </div>
              <Field label="描述"><Input value={skillForm.description} onChange={(event) => setSkillForm((current) => ({ ...current, description: event.target.value }))} /></Field>
              <Field label="标签"><Input value={skillForm.tagsText} onChange={(event) => setSkillForm((current) => ({ ...current, tagsText: event.target.value }))} placeholder="标签，使用英文逗号分隔" /></Field>
              <Field label="内容" className="flex min-h-0 flex-1 flex-col">
                <Textarea className="h-full min-h-[260px] flex-1 resize-none overflow-y-auto [field-sizing:fixed]" value={skillForm.content} onChange={(event) => setSkillForm((current) => ({ ...current, content: event.target.value }))} rows={16} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={skillForm.isEnabled} onChange={(event) => setSkillForm((current) => ({ ...current, isEnabled: event.target.checked }))} />
                保存后立即启用
              </label>
            </div>
            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => setSkillDialogOpen(false)} disabled={skillSubmitting}>取消</Button>
              <Button onClick={() => void submitSkill()} disabled={skillSubmitting}>{skillSubmitting ? "保存中..." : "保存 Skill"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={llmDialogOpen} onOpenChange={setLlmDialogOpen}>
          <DialogContent className="flex h-[min(85vh,840px)] max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{llmEditingId ? "编辑模型配置" : "新增模型配置"}</DialogTitle>
              <DialogDescription>按任务类型维护 provider、model、API key 和运行时环境变量，支持随时切换供应商。</DialogDescription>
            </DialogHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="grid gap-4 px-1 py-1 md:grid-cols-2">
                <Field label="配置键"><Input value={llmForm.configKey} onChange={(event) => setLlmForm((current) => ({ ...current, configKey: event.target.value }))} /></Field>
                <Field label="任务类型"><Input value={llmForm.taskType} onChange={(event) => setLlmForm((current) => ({ ...current, taskType: event.target.value }))} /></Field>
                <Field label="Provider">
                  <NativeSelect value={llmForm.provider} onChange={(event) => setLlmForm((current) => ({ ...current, provider: event.target.value }))}>
                    {Object.entries(providerLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="模型名称"><Input value={llmForm.modelName} onChange={(event) => setLlmForm((current) => ({ ...current, modelName: event.target.value }))} /></Field>
                <Field label="Base URL"><Input value={llmForm.baseUrl} onChange={(event) => setLlmForm((current) => ({ ...current, baseUrl: event.target.value }))} /></Field>
                <Field label="API Key 环境变量"><Input value={llmForm.apiKeyEnv} onChange={(event) => setLlmForm((current) => ({ ...current, apiKeyEnv: event.target.value }))} placeholder="例如 GEMINI_API_KEY" /></Field>
                <Field label="API Key 值"><Input value={llmForm.apiKeyValue} onChange={(event) => setLlmForm((current) => ({ ...current, apiKeyValue: event.target.value }))} placeholder="可选，留空则使用环境变量" /></Field>
                <Field label="优先级"><Input type="number" value={llmForm.priority} onChange={(event) => setLlmForm((current) => ({ ...current, priority: event.target.value }))} /></Field>
              </div>
              <Field label="Extra Config" className="mt-4">
                <Textarea value={llmForm.extraConfigText} onChange={(event) => setLlmForm((current) => ({ ...current, extraConfigText: event.target.value }))} rows={10} />
              </Field>
              <label className="mt-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={llmForm.isActive} onChange={(event) => setLlmForm((current) => ({ ...current, isActive: event.target.checked }))} />
                保存后立即启用
              </label>
            </ScrollArea>
            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => setLlmDialogOpen(false)} disabled={llmSubmitting}>取消</Button>
              <Button onClick={() => void submitLLMConfig()} disabled={llmSubmitting}>{llmSubmitting ? "保存中..." : "保存配置"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={mailSenderDialogOpen} onOpenChange={setMailSenderDialogOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{mailSenderEditingId ? "编辑发件箱" : "新增发件箱"}</DialogTitle>
              <DialogDescription>支持配置 163、Outlook、企业邮箱等 SMTP 发件箱。编辑已有发件箱时，密码可留空以继续使用当前密码。</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[65vh]">
              <div className="grid gap-4 px-1 py-1 md:grid-cols-2">
                <Field label="名称"><Input value={mailSenderForm.name} onChange={(event) => setMailSenderForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                <Field label="发件人名称"><Input value={mailSenderForm.fromName} onChange={(event) => setMailSenderForm((current) => ({ ...current, fromName: event.target.value }))} placeholder="例如：某某科技招聘中心" /></Field>
                <Field label="发件邮箱"><Input value={mailSenderForm.fromEmail} onChange={(event) => setMailSenderForm((current) => ({ ...current, fromEmail: event.target.value }))} placeholder="name@example.com" /></Field>
                <Field label="登录账号"><Input value={mailSenderForm.username} onChange={(event) => setMailSenderForm((current) => ({ ...current, username: event.target.value }))} /></Field>
                <Field label="SMTP Host"><Input value={mailSenderForm.smtpHost} onChange={(event) => setMailSenderForm((current) => ({ ...current, smtpHost: event.target.value }))} placeholder="smtp.163.com" /></Field>
                <Field label="SMTP Port"><Input type="number" value={mailSenderForm.smtpPort} onChange={(event) => setMailSenderForm((current) => ({ ...current, smtpPort: event.target.value }))} /></Field>
                <div className="md:col-span-2 flex flex-wrap gap-2 px-1 py-1">
                  {mailSenderPresets.map((preset) => (
                    <Button key={preset.key} type="button" size="sm" variant="outline" onClick={() => applyMailSenderPreset(preset.key)}>
                      {preset.label}
                    </Button>
                  ))}
                  <p className="self-center text-xs text-slate-500 dark:text-slate-400">如果 SMTP Host 留空，系统会尝试根据发件邮箱自动识别 163 / Outlook 默认配置。</p>
                </div>
                <Field label={mailSenderEditingId ? "密码（留空则不修改）" : "密码"}>
                  <Input type="password" value={mailSenderForm.password} onChange={(event) => setMailSenderForm((current) => ({ ...current, password: event.target.value }))} />
                </Field>
              </div>
              <div className="mt-4 grid gap-3 px-1 py-1 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={mailSenderForm.useSsl} onChange={(event) => setMailSenderForm((current) => ({ ...current, useSsl: event.target.checked }))} />
                  使用 SSL
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={mailSenderForm.useStarttls} onChange={(event) => setMailSenderForm((current) => ({ ...current, useStarttls: event.target.checked }))} />
                  使用 STARTTLS
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={mailSenderForm.isDefault} onChange={(event) => setMailSenderForm((current) => ({ ...current, isDefault: event.target.checked }))} />
                  设为默认发件箱
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={mailSenderForm.isEnabled} onChange={(event) => setMailSenderForm((current) => ({ ...current, isEnabled: event.target.checked }))} />
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
              <DialogDescription>可维护公司 HR、面试官、部门负责人等收件人，发送简历时支持多选和复用。</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[65vh]">
              <div className="space-y-4 px-1 py-1">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="姓名"><Input value={mailRecipientForm.name} onChange={(event) => setMailRecipientForm((current) => ({ ...current, name: event.target.value }))} /></Field>
                  <Field label="邮箱"><Input value={mailRecipientForm.email} onChange={(event) => setMailRecipientForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@example.com" /></Field>
                  <Field label="部门"><Input value={mailRecipientForm.department} onChange={(event) => setMailRecipientForm((current) => ({ ...current, department: event.target.value }))} /></Field>
                  <Field label="岗位"><Input value={mailRecipientForm.roleTitle} onChange={(event) => setMailRecipientForm((current) => ({ ...current, roleTitle: event.target.value }))} /></Field>
                </div>
                <Field label="标签">
                  <Input value={mailRecipientForm.tagsText} onChange={(event) => setMailRecipientForm((current) => ({ ...current, tagsText: event.target.value }))} placeholder="例如：HR，技术面试官，老板" />
                </Field>
                <Field label="备注">
                  <Textarea className="resize-y" value={mailRecipientForm.notes} onChange={(event) => setMailRecipientForm((current) => ({ ...current, notes: event.target.value }))} rows={4} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={mailRecipientForm.isEnabled} onChange={(event) => setMailRecipientForm((current) => ({ ...current, isEnabled: event.target.checked }))} />
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

        <Dialog open={resumeMailDialogOpen} onOpenChange={setResumeMailDialogOpen}>
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>发送简历邮件</DialogTitle>
              <DialogDescription>支持单个或批量发送给一个或多个收件人。邮件标题和正文都允许留空，留空时由系统按默认模板生成。</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-5 px-1 py-1">
                <Field label="本次发送的候选人">
                  <div className="flex flex-wrap gap-2">
                    {resumeMailTargetCandidates.length ? resumeMailTargetCandidates.map((candidate) => (
                      <Badge key={candidate.id} variant="outline" className="rounded-full">
                        {candidate.name} / {candidate.position_title || "未关联岗位"}
                      </Badge>
                    )) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400">未找到候选人详情，请返回候选人中心重新选择。</p>
                    )}
                  </div>
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="发件箱">
                    <NativeSelect value={resumeMailForm.senderConfigId} onChange={(event) => setResumeMailForm((current) => ({ ...current, senderConfigId: event.target.value }))}>
                      <option value="">使用默认发件箱</option>
                      {mailSenderConfigs.filter((sender) => sender.is_enabled).map((sender) => (
                        <option key={sender.id} value={sender.id}>
                          {sender.name} / {sender.from_email}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="补充邮箱（可选）">
                    <Input
                      value={resumeMailForm.extraRecipientEmails}
                      onChange={(event) => setResumeMailForm((current) => ({ ...current, extraRecipientEmails: event.target.value }))}
                      placeholder="多个邮箱请用英文逗号分隔"
                    />
                  </Field>
                </div>

                <Field label="选择内部收件人">
                  <div className="grid gap-3 md:grid-cols-2">
                    {mailRecipients.filter((recipient) => recipient.is_enabled).length ? mailRecipients.filter((recipient) => recipient.is_enabled).map((recipient) => (
                      <label key={recipient.id} className="flex items-start gap-3 rounded-2xl border border-slate-200/80 px-4 py-4 text-sm dark:border-slate-800">
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
                      <EmptyState title="暂无可选收件人" description="可以直接填写补充邮箱，也可以先在邮件中心维护公司内部收件人。" />
                    )}
                  </div>
                </Field>

                <Field label="邮件标题（可留空）">
                  <Input value={resumeMailForm.subject} onChange={(event) => setResumeMailForm((current) => ({ ...current, subject: event.target.value }))} placeholder="例如：候选人简历推荐 / IoT 测试工程师" />
                </Field>
                <Field label="邮件正文（可留空）">
                  <Textarea value={resumeMailForm.bodyText} onChange={(event) => setResumeMailForm((current) => ({ ...current, bodyText: event.target.value }))} rows={10} placeholder="可填写本次推荐理由、安排建议等；留空时将使用系统默认正文。" />
                </Field>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResumeMailDialogOpen(false)}>取消</Button>
              <Button onClick={() => void submitResumeMail()} disabled={resumeMailSubmitting}>
                <Send className="h-4 w-4" />
                {resumeMailSubmitting ? "发送中..." : "发送简历"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}

function SearchField({
                       value,
                       onChange,
                       placeholder,
                     }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      </div>
  );
}

function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
      <select
          {...props}
          className={cn(
              "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px]",
              props.className,
          )}
      />
  );
}

function Field({
                 label,
                 children,
                 className,
               }: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
      <div className={cn("space-y-2", className)}>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</p>
        {children}
      </div>
  );
}

function MetricCard({
                      title,
                      value,
                      description,
                      icon: Icon,
                    }: {
  title: string;
  value: number | string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
      <Card className={cn(panelClass, "gap-4 px-0 py-0")}>
        <CardContent className="flex items-start justify-between px-5 py-5">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{value}</p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{description}</p>
          </div>
          <div className="rounded-2xl bg-slate-100 p-3 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <Icon className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
  );
}

function TodoCard({
                    title,
                    value,
                    description,
                  }: {
  title: string;
  value: number;
  description: string;
}) {
  return (
      <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{value}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
  );
}

function QuickActionCard({
                           title,
                           description,
                           icon: Icon,
                           onClick,
                         }: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
      <button
          type="button"
          onClick={onClick}
          className="rounded-[22px] border border-slate-200/80 bg-white px-5 py-5 text-left transition hover:-translate-y-0.5 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
          </div>
          <div className="rounded-2xl bg-slate-100 p-3 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </button>
  );
}

function SectionNavButton({
                            active,
                            icon: Icon,
                            title,
                            description,
                            count,
                            onClick,
                          }: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  count?: number;
  onClick: () => void;
}) {
  return (
      <button
          type="button"
          onClick={onClick}
          className={cn(
              "w-full rounded-[22px] border px-4 py-4 text-left transition",
              active
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-200/80 bg-white/80 hover:border-slate-400 dark:border-slate-800 dark:bg-slate-950/70",
          )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={cn("rounded-2xl p-2", active ? "bg-white/10 dark:bg-slate-200" : "bg-slate-100 dark:bg-slate-900")}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold">{title}</p>
              <p className={cn("mt-1 text-xs leading-5", active ? "text-white/75 dark:text-slate-700" : "text-slate-500 dark:text-slate-400")}>
                {description}
              </p>
            </div>
          </div>
          {typeof count === "number" ? (
              <Badge className={cn("rounded-full border", active ? "border-white/20 bg-white/10 text-white dark:border-slate-300 dark:bg-slate-200 dark:text-slate-900" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300")}>
                {count}
              </Badge>
          ) : null}
        </div>
      </button>
  );
}

function SettingsEntry({
                         title,
                         description,
                         onClick,
                       }: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
      <button
          type="button"
          className="w-full rounded-2xl px-4 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
          onClick={onClick}
      >
        <p className="font-medium text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      </button>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{value}</span>
      </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-2 break-words text-sm leading-6 text-slate-700 dark:text-slate-200">{value}</p>
      </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
      <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}
      </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
      <div className="flex h-full min-h-[320px] items-center justify-center">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          {label}
        </div>
      </div>
  );
}

function EmptyState({
                      title,
                      description,
                    }: {
  title: string;
  description: string;
}) {
  return (
      <div className="rounded-[22px] border border-dashed border-slate-200 px-5 py-8 text-center dark:border-slate-800">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
  );
}

function buildLogObjectLabel(
    log: AITaskLog,
    positionMap: Map<number, PositionSummary>,
    candidateMap: Map<number, CandidateSummary>,
    skillMap: Map<number, RecruitmentSkill>,
) {
  if (log.related_candidate_id) {
    return candidateMap.get(log.related_candidate_id)?.name || `候选人 #${log.related_candidate_id}`;
  }
  if (log.related_position_id) {
    return positionMap.get(log.related_position_id)?.title || `岗位 #${log.related_position_id}`;
  }
  if (log.related_skill_id) {
    return skillMap.get(log.related_skill_id)?.name || `Skill #${log.related_skill_id}`;
  }
  return "系统任务";
}
