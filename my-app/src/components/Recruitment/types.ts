import type {RecruitmentSkill} from "@/lib/recruitment-api";
import type {
    RecruitmentAssistantClarificationRequest,
    RecruitmentAssistantPageInfo,
    RecruitmentAssistantPreparedResumeMail,
    RecruitmentAssistantToolResultPayload,
} from "@/lib/recruitment-assistant-protocol";
import {getCurrentLanguage, type Language} from "@/lib/i18n";

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
export type AssistantDisplayMode = "page" | "drawer" | "fullscreen" | "workspace";
export type ResumeMailDialogMode = "send" | "resend";

export type PositionFormState = {
    orgCode: string;
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
    autoMailEnabled: boolean;
    autoMailUseGlobalRecipients: boolean;
    autoMailUsePositionRecipients: boolean;
    autoMailPositionRecipientIds: number[];
    autoMailAllowedCandidateStatuses: string[];
    autoMailTemplateId: string;
    autoMailDedupMode: string;
    autoMailCcRecipientIds: number[];
    autoMailBccRecipientIds: number[];
    jdSkillIds: number[];
    screeningSkillIds: number[];
    interviewSkillIds: number[];
};

export type SkillTaskKind = "jd" | "screening" | "interview";

export type SkillFormState = {
    name: string;
    description: string;
    content: string;
    tagsText: string;
    taskTypes: SkillTaskKind[];
    sortOrder: string;
    isEnabled: boolean;
};

export type ScreeningSkillDimension = {
    id: string;
    name: string;
    maxScore: number;
    priority: "core" | "secondary" | "auxiliary" | "bonus";
    description: string;
    isHardRequirement: boolean;
};

export type ScreeningSkillFormData = {
    roleName: string;
    roleBackground: string;
    hardRules: string;
    dimensions: ScreeningSkillDimension[];
    judgmentRules: string;
    name: string;
    description: string;
    tagsText: string;
    taskTypes: SkillTaskKind[];
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
    age: string;
    city: string;
    notes: string;
    tagsText: string;
    manualOverrideScore: string;
    manualOverrideReason: string;
    hrFeedback: string;
    hrFeedbackReason: string;
    ownerId: string;
    positionId: string;
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
    clarificationRequest?: RecruitmentAssistantClarificationRequest;
    queryPageInfo?: RecruitmentAssistantPageInfo;
    toolResults?: RecruitmentAssistantToolResultPayload[];
    mailConfirmationRequest?: RecruitmentAssistantPreparedResumeMail | null;
    frontendDebug?: unknown;
    streamStatus?: "streaming" | "done" | "error";
    sourceRunType?: "legacy" | "stream";
};

type RecruitmentPageMeta = Record<RecruitmentPage, { title: string; description: string }>;

type RecruitmentToastLocale = {
    entities: {
        baseConfig: string;
        workspace: string;
        positions: string;
        positionDetail: string;
        candidates: string;
        candidateDetail: string;
        aiTasks: string;
        taskDetail: string;
        skills: string;
        modelConfigs: string;
        assistantContext: string;
        mailSettings: string;
        globalAutoPushConfig: string;
        taskLogs: string;
        screening: string;
        jd: string;
        interviewQuestions: string;
        assistant: string;
        publishText: string;
        publishTask: string;
        position: string;
        candidate: string;
        resume: string;
        skill: string;
        modelConfig: string;
        currentModel: string;
        mailSender: string;
        mailRecipient: string;
        resumeMail: string;
        interviewHtml: string;
    };
    unknownError: string;
    noReason: string;
    noResumeSelected: string;
    noCandidatesSelected: string;
    noScreeningQueued: string;
    noPublishText: string;
    noPositionCandidatesForInterview: string;
    noResumeMailCandidates: string;
    noRecipientsSelected: string;
    smtpHostRequired: string;
    mailPreviewBlocked: string;
    loadFailed: (entity: string, error: string) => string;
    refreshFailed: (entity: string, error: string) => string;
    saveFailed: (entity: string, error: string) => string;
    createFailed: (entity: string, error: string) => string;
    updateFailed: (entity: string, error: string) => string;
    deleteFailed: (entity: string, error: string) => string;
    stopFailed: (entity: string, error: string) => string;
    sendFailed: (entity: string, error: string) => string;
    copyFailed: (error: string) => string;
    openFailed: (entity: string, error: string) => string;
    downloadFailed: (entity: string, error: string) => string;
    fallbackUsed: (error: string) => string;
    saved: (entity: string) => string;
    refreshed: (entity: string) => string;
    created: (entity: string) => string;
    updated: (entity: string) => string;
    deleted: (entity: string) => string;
    sent: (entity: string) => string;
    deletedButRefreshFailed: (entity: string, error: string) => string;
    savedButRefreshFailed: (entity: string, error: string) => string;
    started: (entity: string) => string;
    stopped: (entity: string) => string;
    stopRequested: (entity: string) => string;
    screeningCompleted: (fallback: boolean) => string;
    screeningQueued: (queued: number, skipped: number, failed: number) => string;
    screeningTaskReused: string;
    copied: (entity: string) => string;
    generated: (entity: string, fallback: boolean) => string;
    generatedWithFallback: (entity: string) => string;
    exported: (count: number) => string;
    generating: (entity: string) => string;
    exporting: string;
    uploadCancelled: string;
    contextUpdated: string;
    contextUpdateFailed: (error: string) => string;
    newJdVersionSaved: string;
    jdVersionSwitched: string;
    fallbackDetected: (error: string) => string;
    assistantGenerationStopped: string;
    dataRefreshed: string;
    selectCandidatesToExport: string;
    interviewScheduleCreated: string;
    interviewScheduleDeleted: string;
    followUpAdded: string;
    followUpDeleted: string;
    offerCreated: string;
    offerUpdated: string;
    offerDeleted: string;
    skillEnabled: string;
    skillDisabled: string;
    batchStatusUpdated: (count: number) => string;
    batchStatusUpdateFailed: (error: string) => string;
    resumeOpenedFailed: (error: string) => string;
    resumePreviewTimeout: string;
    exportFailed: (error: string) => string;
    screeningStartFailed: (error: string) => string;
    interviewQuestionGenerationFailed: (error: string) => string;
    interviewQuestionGenerationStarted: string;
    resumeDeleted: string;
    resumeDeletedWithSwitch: string;
    candidateDeleted: string;
    candidatesDeleted: (count: number) => string;
    candidatesDeletedWithSkipped: (deleted: number, skipped: number, names: string) => string;
    positionUpdated: (count: number) => string;
    interviewQuestionDownloadStarted: string;
    interviewQuestionDownloadFailed: (error: string) => string;
    resumeDeleteFailed: (error: string) => string;
    noCandidatesForInterview: string;
    screeningFallback: (error: string) => string;
};

type RecruitmentLocaleBundle = {
    pageMeta: RecruitmentPageMeta;
    positionStatusLabels: Record<string, string>;
    candidateStatusLabels: Record<string, string>;
    aiTaskLabels: Record<string, string>;
    providerLabels: Record<string, string>;
    toast: RecruitmentToastLocale;
};

const zhRecruitmentLocale: RecruitmentLocaleBundle = {
    pageMeta: {
        workspace: {
            title: "工作台",
            description: "聚合指标、待办、快捷动作和近期进展，一眼看清招聘推进状态。",
        },
        positions: {
            title: "岗位管理",
            description: "以岗位为主线查看基本信息、当前 JD、历史版本、发布状态和关联候选人。",
        },
        candidates: {
            title: "候选人",
            description: "按 ATS 视角筛选、推进和查看候选人，右侧详情区承接 AI 评估和状态流转。",
        },
        audit: {
            title: "AI 审计中心",
            description: "追踪 JD 生成、初筛评分和面试题生成，兼容展示历史简历解析记录，支持失败排查与留痕复盘。",
        },
        assistant: {
            title: "招聘助手",
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
    },
    positionStatusLabels: {
        draft: "草稿",
        recruiting: "招聘中",
        paused: "暂停中",
        closed: "已关闭",
    },
    candidateStatusLabels: {
        new_imported: "新导入",
        pending_screening: "待初筛",
        screening_running: "初筛中",
        screening_failed: "初筛失败",
        screening_passed: "初筛通过",
        screening_rejected: "初筛淘汰",
        pending_interview: "待面试",
        interview_passed: "面试通过",
        interview_rejected: "面试淘汰",
        pending_offer: "待 Offer",
        offer_sent: "已发 Offer",
        hired: "已入职",
        talent_pool: "人才库",
    },
    aiTaskLabels: {
        screening_flow: "初筛流程",
        jd_generation: "JD 生成",
        resume_parse: "简历解析",
        resume_score: "初筛评分",
        resume_screening_one_pass: "一体化初筛",
        interview_question_generation: "面试题生成",
        chat_orchestrator: "对话助手",
    },
    providerLabels: {
        gemini: "Gemini",
        openai: "GPT / OpenAI",
        anthropic: "Claude",
        deepseek: "DeepSeek",
        kimi: "Kimi",
        glm: "GLM",
        minimax: "MiniMax",
        "openai-compatible": "OpenAI Compatible",
    },
    toast: {
        entities: {
            baseConfig: "基础配置",
            workspace: "工作台",
            positions: "岗位列表",
            positionDetail: "岗位详情",
            candidates: "候选人列表",
            candidateDetail: "候选人详情",
            aiTasks: "AI 任务",
            taskDetail: "任务详情",
            skills: "Skills",
            modelConfigs: "模型配置",
            assistantContext: "助手上下文",
            mailSettings: "邮件配置",
            globalAutoPushConfig: "全局自动推送配置",
            taskLogs: "任务日志",
            screening: "初筛",
            jd: "JD",
            interviewQuestions: "面试题",
            assistant: "助手生成",
            publishText: "发布文案",
            publishTask: "发布任务",
            position: "岗位",
            candidate: "候选人",
            resume: "简历",
            skill: "Skill",
            modelConfig: "模型配置",
            currentModel: "当前模型",
            mailSender: "发件箱",
            mailRecipient: "收件人",
            resumeMail: "简历邮件",
            interviewHtml: "面试题 HTML",
        },
        unknownError: "未知错误",
        noReason: "未返回具体原因",
        noResumeSelected: "请先选择要上传的简历文件",
        noCandidatesSelected: "请先选择需要初筛的候选人",
        noScreeningQueued: "没有成功入队任何初筛任务",
        noPublishText: "当前没有可复制的发布文案",
        noPositionCandidatesForInterview: "这个岗位还没有候选人，暂时无法直接生成面试题",
        noResumeMailCandidates: "请先选择需要发送的简历",
        noRecipientsSelected: "请至少选择一个内部收件人或填写一个收件人邮箱",
        smtpHostRequired: "请填写 SMTP Host；163 常用 smtp.163.com，Outlook 常用 smtp-mail.outlook.com",
        mailPreviewBlocked: "当前邮件预览还不能直接发送",
        loadFailed: (entity, error) => `加载${entity}失败：${error}`,
        refreshFailed: (entity, error) => `刷新${entity}失败：${error}`,
        saveFailed: (entity, error) => `保存${entity}失败：${error}`,
        createFailed: (entity, error) => `创建${entity}失败：${error}`,
        updateFailed: (entity, error) => `更新${entity}失败：${error}`,
        deleteFailed: (entity, error) => `删除${entity}失败：${error}`,
        stopFailed: (entity, error) => `停止${entity}失败：${error}`,
        sendFailed: (entity, error) => `发送${entity}失败：${error}`,
        copyFailed: (error) => `复制失败：${error}`,
        openFailed: (entity, error) => `打开${entity}失败：${error}`,
        downloadFailed: (entity, error) => `下载${entity}失败：${error}`,
        fallbackUsed: (error) => `本次 AI 调用已回退到兜底结果：${error}`,
        saved: (entity) => `${entity}已保存`,
        refreshed: (entity) => `${entity}已刷新`,
        created: (entity) => `${entity}已创建`,
        updated: (entity) => `${entity}已更新`,
        deleted: (entity) => `${entity}已删除`,
        sent: (entity) => `${entity}已发送`,
        deletedButRefreshFailed: (entity, error) => `${entity}已删除，但页面刷新失败：${error}`,
        savedButRefreshFailed: (entity, error) => `${entity}已保存，但页面刷新失败：${error}`,
        started: (entity) => `已开始${entity}`,
        stopped: (entity) => `已停止${entity}`,
        stopRequested: (entity) => `${entity}停止请求已发送`,
        screeningCompleted: (fallback) => fallback ? "初筛已完成（兜底完成）" : "初筛已完成",
        screeningQueued: (queued, skipped, failed) => `已入队 ${queued} 个，已跳过进行中的 ${skipped} 个${failed > 0 ? `，失败 ${failed}` : ""}。`,
        screeningTaskReused: "已有初筛任务在执行，已为你定位到现有任务",
        copied: (entity) => `${entity}已复制`,
        generated: (entity, fallback) => fallback ? `${entity}已生成（兜底完成）` : `${entity}已生成`,
        generatedWithFallback: (entity) => `${entity}已生成（兜底完成）`,
        exported: (count) => `已导出 ${count} 位候选人`,
        generating: (entity) => `正在生成${entity}...`,
        exporting: "正在导出...",
        uploadCancelled: "上传已取消",
        contextUpdated: "AI 助手上下文已更新",
        contextUpdateFailed: (error) => `更新助手上下文失败：${error}`,
        newJdVersionSaved: "JD 新版本已保存",
        jdVersionSwitched: "已切换生效版本",
        fallbackDetected: (error) => `本次 AI 调用已回退到兜底结果：${error}`,
        assistantGenerationStopped: "已停止助手生成",
        dataRefreshed: "数据已刷新",
        selectCandidatesToExport: "请先选择要导出的候选人",
        interviewScheduleCreated: "面试安排已创建",
        interviewScheduleDeleted: "面试安排已删除",
        followUpAdded: "跟进记录已添加",
        followUpDeleted: "跟进记录已删除",
        offerCreated: "Offer 已创建",
        offerUpdated: "Offer 已更新",
        offerDeleted: "Offer 已删除",
        skillEnabled: "Skill 已启用",
        skillDisabled: "Skill 已停用",
        batchStatusUpdated: (count) => `已为 ${count} 位候选人变更状态`,
        batchStatusUpdateFailed: (error) => `批量变更状态失败：${error}`,
        resumeOpenedFailed: (error) => `打开简历失败：${error}`,
        resumePreviewTimeout: "简历加载超时，请稍后重试",
        exportFailed: (error) => `导出失败：${error}`,
        screeningStartFailed: (error) => `发起初筛失败：${error}`,
        interviewQuestionGenerationFailed: (error) => `生成面试题失败：${error}`,
        interviewQuestionGenerationStarted: "已开始生成面试题，可随时停止",
        resumeDeleted: "简历已删除",
        resumeDeletedWithSwitch: "简历已删除，候选人已自动切换到剩余简历",
        candidateDeleted: "候选人已删除",
        candidatesDeleted: (count) => `已删除 ${count} 位候选人`,
        candidatesDeletedWithSkipped: (deleted, skipped, names) => `已删除 ${deleted} 位候选人，${skipped} 位因任务进行中已被跳过：${names}`,
        positionUpdated: (count) => `已为 ${count} 位候选人更新岗位`,
        interviewQuestionDownloadStarted: "面试题 HTML 已开始下载",
        interviewQuestionDownloadFailed: (error) => `下载面试题失败：${error}`,
        resumeDeleteFailed: (error) => `删除简历失败：${error}`,
        noCandidatesForInterview: "这个岗位还没有候选人，暂时无法直接生成面试题",
        screeningFallback: (error) => `本次 AI 调用已回退到兜底结果：${error}`,
    },
};

const enRecruitmentLocale: RecruitmentLocaleBundle = {
    pageMeta: {
        workspace: {
            title: "Workspace",
            description: "See hiring metrics, todos, quick actions, and recent progress in one place.",
        },
        positions: {
            title: "Positions",
            description: "Manage position basics, current JD, version history, publish state, and linked candidates.",
        },
        candidates: {
            title: "Candidates",
            description: "Review and move candidates through the pipeline with AI evaluation in the detail panel.",
        },
        audit: {
            title: "AI Audit Center",
            description: "Trace JD generation, screening, and interview question runs with failure diagnostics and audit history.",
        },
        assistant: {
            title: "Recruiting Assistant",
            description: "Bring position context, enabled skills, and natural language operations into one high-frequency workspace.",
        },
        "settings-skills": {
            title: "Skill Settings",
            description: "Manage hiring skills in the admin settings area without crowding the primary workflow.",
        },
        "settings-models": {
            title: "Model Settings",
            description: "Manage providers, models, env vars, and API keys by task type for fast switching.",
        },
        "settings-mail": {
            title: "Mail Center",
            description: "Manage senders, recipients, and delivery history, with single and batch resume sending.",
        },
    },
    positionStatusLabels: {
        draft: "Draft",
        recruiting: "Recruiting",
        paused: "Paused",
        closed: "Closed",
    },
    candidateStatusLabels: {
        new_imported: "New",
        pending_screening: "To Screen",
        screening_running: "Screening",
        screening_failed: "Screen Fail",
        screening_passed: "Screen Pass",
        screening_rejected: "Screen Reject",
        pending_interview: "To Interview",
        interview_passed: "Interview ✓",
        interview_rejected: "Interview ✗",
        pending_offer: "To Offer",
        offer_sent: "Offer Sent",
        hired: "Hired",
        talent_pool: "Talent Pool",
    },
    aiTaskLabels: {
        screening_flow: "Screening Flow",
        jd_generation: "JD Generation",
        resume_parse: "Resume Parsing",
        resume_score: "Screening Score",
        resume_screening_one_pass: "One-pass Screening",
        interview_question_generation: "Interview Questions",
        chat_orchestrator: "Assistant Chat",
    },
    providerLabels: {
        gemini: "Gemini",
        openai: "GPT / OpenAI",
        anthropic: "Claude",
        deepseek: "DeepSeek",
        kimi: "Kimi",
        glm: "GLM",
        minimax: "MiniMax",
        "openai-compatible": "OpenAI Compatible",
    },
    toast: {
        entities: {
            baseConfig: "base config",
            workspace: "workspace",
            positions: "position list",
            positionDetail: "position detail",
            candidates: "candidate list",
            candidateDetail: "candidate detail",
            aiTasks: "AI tasks",
            taskDetail: "task detail",
            skills: "skills",
            modelConfigs: "model configs",
            assistantContext: "assistant context",
            mailSettings: "mail settings",
            globalAutoPushConfig: "global auto-push config",
            taskLogs: "task logs",
            screening: "screening",
            jd: "JD",
            interviewQuestions: "interview questions",
            assistant: "assistant run",
            publishText: "publish copy",
            publishTask: "publish task",
            position: "position",
            candidate: "candidate",
            resume: "resume",
            skill: "skill",
            modelConfig: "model config",
            currentModel: "current model",
            mailSender: "mail sender",
            mailRecipient: "mail recipient",
            resumeMail: "resume mail",
            interviewHtml: "interview HTML",
        },
        unknownError: "Unknown error",
        noReason: "No specific reason returned",
        noResumeSelected: "Please choose a resume file first.",
        noCandidatesSelected: "Please select at least one candidate to screen.",
        noScreeningQueued: "No screening tasks were queued successfully.",
        noPublishText: "There is no publish copy available to copy right now.",
        noPositionCandidatesForInterview: "This position has no candidates yet, so interview questions cannot be generated directly.",
        noResumeMailCandidates: "Please select the resumes to send first.",
        noRecipientsSelected: "Please choose at least one internal recipient or enter an email address.",
        smtpHostRequired: "Please fill in the SMTP host. For 163 use smtp.163.com; for Outlook use smtp-mail.outlook.com.",
        mailPreviewBlocked: "The current mail preview cannot be sent yet.",
        loadFailed: (entity, error) => `Failed to load ${entity}: ${error}`,
        refreshFailed: (entity, error) => `Failed to refresh ${entity}: ${error}`,
        saveFailed: (entity, error) => `Failed to save ${entity}: ${error}`,
        createFailed: (entity, error) => `Failed to create ${entity}: ${error}`,
        updateFailed: (entity, error) => `Failed to update ${entity}: ${error}`,
        deleteFailed: (entity, error) => `Failed to delete ${entity}: ${error}`,
        stopFailed: (entity, error) => `Failed to stop ${entity}: ${error}`,
        sendFailed: (entity, error) => `Failed to send ${entity}: ${error}`,
        copyFailed: (error) => `Copy failed: ${error}`,
        openFailed: (entity, error) => `Failed to open ${entity}: ${error}`,
        downloadFailed: (entity, error) => `Failed to download ${entity}: ${error}`,
        fallbackUsed: (error) => `This AI call fell back to the deterministic result: ${error}`,
        saved: (entity) => `${entity} saved`,
        refreshed: (entity) => `${entity} refreshed`,
        created: (entity) => `${entity} created`,
        updated: (entity) => `${entity} updated`,
        deleted: (entity) => `${entity} deleted`,
        sent: (entity) => `${entity} sent`,
        deletedButRefreshFailed: (entity, error) => `${entity} was deleted, but refreshing the page failed: ${error}`,
        savedButRefreshFailed: (entity, error) => `${entity} was saved, but refreshing the page failed: ${error}`,
        started: (entity) => `${entity} started`,
        stopped: (entity) => `${entity} stopped`,
        stopRequested: (entity) => `Stop request sent for ${entity}`,
        screeningCompleted: (fallback) => fallback ? "Screening completed with fallback" : "Screening completed",
        screeningQueued: (queued, skipped, failed) => `Queued ${queued}, skipped ${skipped} already-running task(s)${failed > 0 ? `, failed ${failed}` : ""}.`,
        screeningTaskReused: "An existing screening task is already running, so the current view jumped to that task.",
        copied: (entity) => `${entity} copied`,
        generated: (entity, fallback) => fallback ? `${entity} generated with fallback` : `${entity} generated`,
        generatedWithFallback: (entity) => `${entity} generated with fallback`,
        exported: (count) => `Exported ${count} candidate(s)`,
        generating: (entity) => `Generating ${entity}...`,
        exporting: "Exporting...",
        uploadCancelled: "Upload cancelled",
        contextUpdated: "AI assistant context updated",
        contextUpdateFailed: (error) => `Failed to update assistant context: ${error}`,
        newJdVersionSaved: "New JD version saved",
        jdVersionSwitched: "Active version switched",
        fallbackDetected: (error) => `This AI call fell back to a fallback result: ${error}`,
        assistantGenerationStopped: "Assistant generation stopped",
        dataRefreshed: "Data refreshed",
        selectCandidatesToExport: "Please select candidates to export",
        interviewScheduleCreated: "Interview schedule created",
        interviewScheduleDeleted: "Interview schedule deleted",
        followUpAdded: "Follow-up added",
        followUpDeleted: "Follow-up deleted",
        offerCreated: "Offer created",
        offerUpdated: "Offer updated",
        offerDeleted: "Offer deleted",
        skillEnabled: "Skill enabled",
        skillDisabled: "Skill disabled",
        batchStatusUpdated: (count) => `Updated status for ${count} candidate(s)`,
        batchStatusUpdateFailed: (error) => `Failed to batch update status: ${error}`,
        resumeOpenedFailed: (error) => `Failed to open resume: ${error}`,
        resumePreviewTimeout: "Resume preview timed out, please try again",
        exportFailed: (error) => `Export failed: ${error}`,
        screeningStartFailed: (error) => `Failed to start screening: ${error}`,
        interviewQuestionGenerationFailed: (error) => `Interview question generation failed: ${error}`,
        interviewQuestionGenerationStarted: "Interview question generation started and can be stopped at any time",
        resumeDeleted: "Resume deleted",
        resumeDeletedWithSwitch: "Resume deleted, and the candidate was switched to a remaining resume automatically",
        candidateDeleted: "Candidate deleted",
        candidatesDeleted: (count) => `Deleted ${count} candidate(s)`,
        candidatesDeletedWithSkipped: (deleted, skipped, names) => `Deleted ${deleted} candidate(s), ${skipped} skipped due to active tasks: ${names}`,
        positionUpdated: (count) => `Updated position for ${count} candidate(s)`,
        interviewQuestionDownloadStarted: "Interview question HTML download started",
        interviewQuestionDownloadFailed: (error) => `Failed to download interview questions: ${error}`,
        resumeDeleteFailed: (error) => `Failed to delete resume: ${error}`,
        noCandidatesForInterview: "This position has no candidates yet, so interview questions cannot be generated.",
        screeningFallback: (error) => `This AI call fell back to a fallback result: ${error}`,
    },
};

const recruitmentLocaleBundles: Record<Language, RecruitmentLocaleBundle> = {
    "zh-CN": zhRecruitmentLocale,
    "en-US": enRecruitmentLocale,
};

function resolveRecruitmentLocale(language?: Language): RecruitmentLocaleBundle {
    return recruitmentLocaleBundles[language || getCurrentLanguage()] || recruitmentLocaleBundles["zh-CN"];
}

function createLocalizedRecord<T extends Record<string, unknown>>(selector: (bundle: RecruitmentLocaleBundle) => T): T {
    return new Proxy({} as T, {
        get(_target, prop) {
            return selector(resolveRecruitmentLocale())[prop as keyof T];
        },
        ownKeys() {
            return Reflect.ownKeys(selector(resolveRecruitmentLocale()));
        },
        getOwnPropertyDescriptor(_target, prop) {
            const value = selector(resolveRecruitmentLocale())[prop as keyof T];
            if (value === undefined) {
                return undefined;
            }
            return {
                configurable: true,
                enumerable: true,
                value,
                writable: false,
            };
        },
    });
}

export function getRecruitmentPageMeta(language?: Language): RecruitmentPageMeta {
    return resolveRecruitmentLocale(language).pageMeta;
}

export function getRecruitmentPositionStatusLabels(language?: Language): Record<string, string> {
    return resolveRecruitmentLocale(language).positionStatusLabels;
}

export function getRecruitmentCandidateStatusLabels(language?: Language): Record<string, string> {
    return resolveRecruitmentLocale(language).candidateStatusLabels;
}

export function getRecruitmentAiTaskLabels(language?: Language): Record<string, string> {
    return resolveRecruitmentLocale(language).aiTaskLabels;
}

export function getRecruitmentProviderLabels(language?: Language): Record<string, string> {
    return resolveRecruitmentLocale(language).providerLabels;
}

export function getRecruitmentToastLocale(language?: Language): RecruitmentToastLocale {
    return resolveRecruitmentLocale(language).toast;
}

export const pageMeta: RecruitmentPageMeta = createLocalizedRecord((bundle) => bundle.pageMeta);
export const positionStatusLabels: Record<string, string> = createLocalizedRecord((bundle) => bundle.positionStatusLabels);
export const candidateStatusLabels: Record<string, string> = createLocalizedRecord((bundle) => bundle.candidateStatusLabels);
export const aiTaskLabels: Record<string, string> = createLocalizedRecord((bundle) => bundle.aiTaskLabels);
export const providerLabels: Record<string, string> = createLocalizedRecord((bundle) => bundle.providerLabels);

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

export const panelClass =
    "rounded-[24px] border border-slate-200/80 bg-white/95 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-800/90 dark:bg-slate-950/85";

export type CandidateListColumnKey = "candidate" | "organization" | "position" | "status" | "match" | "city" | "source" | "updated";
export type AuditListColumnKey = "taskType" | "object" | "status" | "model" | "duration" | "time";

export const candidateListColumnDefaultWidths: Record<CandidateListColumnKey, number> = {
    candidate: 260,
    organization: 132,
    position: 148,
    status: 120,
    match: 84,
    city: 96,
    source: 128,
    updated: 156,
};

export const candidateListColumnMinWidths: Record<CandidateListColumnKey, number> = {
    candidate: 220,
    organization: 112,
    position: 120,
    status: 88,
    match: 72,
    city: 72,
    source: 104,
    updated: 136,
};

export const candidateListColumnMaxWidths: Record<CandidateListColumnKey, number> = {
    candidate: 420,
    organization: 220,
    position: 260,
    status: 180,
    match: 140,
    city: 160,
    source: 240,
    updated: 240,
};

export const candidateListColumnFillWeights: Record<CandidateListColumnKey, number> = {
    candidate: 3.4,
    organization: 1.2,
    position: 1.8,
    status: 1,
    match: 1,
    city: 1,
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
