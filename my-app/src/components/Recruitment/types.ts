/**
 * AI 招聘模块 - 类型定义与常量
 *
 * 从 RecruitmentAutomationContainer.tsx 中提取，供各子模块共享。
 */

import type { RecruitmentSkill } from "@/lib/recruitment-api";

/* ─────────────── 页面 & 视图模式 ─────────────── */

export type RecruitmentPage =
    | "workspace"
    | "positions"
    | "candidates"
    | "audit"
    | "assistant"
    | "settings-skills"
    | "settings-models"
    | "settings-mail";

export type CandidateViewMode = "list" | "board";
export type JDViewMode = "publish" | "markdown" | "preview";
export type AssistantDisplayMode = "page" | "fullscreen";
export type ResumeMailDialogMode = "send" | "resend";

/* ─────────────── 表单状态 ─────────────── */

export type PositionFormState = {
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
    jdSkillIds: number[];
    screeningSkillIds: number[];
    interviewSkillIds: number[];
};

export type SkillFormState = {
    name: string;
    description: string;
    content: string;
    tagsText: string;
    sortOrder: string;
    isEnabled: boolean;
};

export type LLMFormState = {
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

export type CandidateEditorState = {
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

export type MailSenderFormState = {
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

export type MailRecipientFormState = {
    name: string;
    email: string;
    department: string;
    roleTitle: string;
    tagsText: string;
    notes: string;
    isEnabled: boolean;
};

export type ResumeMailFormState = {
    candidateIds: number[];
    senderConfigId: string;
    recipientIds: number[];
    extraRecipientEmails: string;
    subject: string;
    bodyText: string;
};

/* ─────────────── 聊天消息 ─────────────── */

export type ChatMessage = {
    id: string;
    role: "assistant" | "user";
    content: string;
    createdAt: string;
    pending?: boolean;
    taskId?: number | null;
    actions?: string[];
    logId?: number;
    memorySource?: string | null;
    modelProvider?: string | null;
    modelName?: string | null;
    usedSkillIds?: number[];
    usedSkills?: RecruitmentSkill[];
    usedFallback?: boolean;
    fallbackError?: string | null;
};

/* ─────────────── 表格列 ─────────────── */

export type CandidateListColumnKey = "candidate" | "position" | "status" | "match" | "source" | "updated";
export type AuditListColumnKey = "taskType" | "object" | "status" | "model" | "duration" | "time";

/* ─────────────── 邮件预设 ─────────────── */

export type MailSenderPresetKey = "163" | "outlook";

export type MailSenderPreset = {
    key: MailSenderPresetKey;
    label: string;
    smtpHost: string;
    smtpPort: string;
    useSsl: boolean;
    useStarttls: boolean;
    domains: string[];
};

/* ─────────────── 容器 Props ─────────────── */

export interface RecruitmentAutomationContainerProps {
    onBack: () => void;
}

/* ═══════════════ 常量 ═══════════════ */

export const pageMeta: Record<RecruitmentPage, { title: string; description: string }> = {
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
        description: "追踪 JD 生成、初筛评分和面试题生成，兼容展示历史简历解析记录，支持失败排查与留痕复盘。",
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

export const positionStatusLabels: Record<string, string> = {
    draft: "草稿",
    recruiting: "招聘中",
    paused: "暂停中",
    closed: "已关闭",
};

export const candidateStatusLabels: Record<string, string> = {
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

export const aiTaskLabels: Record<string, string> = {
    jd_generation: "JD 生成",
    resume_parse: "简历解析（手动/历史）",
    resume_score: "简历评分",
    interview_question_generation: "面试题生成",
    chat_orchestrator: "对话助手",
};

export const providerLabels: Record<string, string> = {
    gemini: "Gemini",
    openai: "GPT / OpenAI",
    anthropic: "Claude",
    deepseek: "DeepSeek",
    kimi: "Kimi",
    glm: "GLM",
    "openai-compatible": "OpenAI Compatible",
};

export const mailSenderPresets: MailSenderPreset[] = [
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

/* ─────────────── 表格列宽配置 ─────────────── */

export const candidateListColumnDefaultWidths: Record<CandidateListColumnKey, number> = {
    candidate: 260,
    position: 148,
    status: 96,
    match: 84,
    source: 128,
    updated: 156,
};

export const candidateListColumnMinWidths: Record<CandidateListColumnKey, number> = {
    candidate: 220,
    position: 120,
    status: 88,
    match: 72,
    source: 104,
    updated: 136,
};

export const candidateListColumnMaxWidths: Record<CandidateListColumnKey, number> = {
    candidate: 420,
    position: 260,
    status: 180,
    match: 140,
    source: 240,
    updated: 240,
};

export const candidateListColumnFillWeights: Record<CandidateListColumnKey, number> = {
    candidate: 3.4,
    position: 1.8,
    status: 1,
    match: 1,
    source: 1.5,
    updated: 1.3,
};

export const auditListColumnBaseWidths: Record<AuditListColumnKey, number> = {
    taskType: 110,
    object: 150,
    status: 84,
    model: 140,
    duration: 72,
    time: 120,
};

export const auditListColumnFillWeights: Record<AuditListColumnKey, number> = {
    taskType: 1.4,
    object: 2.4,
    status: 1,
    model: 2.1,
    duration: 0.8,
    time: 1.1,
};

/* ─────────────── 样式常量 ─────────────── */

export const panelClass =
    "rounded-[24px] border border-slate-200/80 bg-white/95 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-800/90 dark:bg-slate-950/85";
