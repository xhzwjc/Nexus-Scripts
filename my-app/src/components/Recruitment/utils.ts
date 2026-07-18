import type {
    AITaskLog,
    CandidateSummary,
    PositionSummary,
    RecruitmentSkill,
} from "@/lib/recruitment-api";
import {getCurrentLanguage} from "@/lib/i18n";

import {
    aiTaskLabels,
    candidateListColumnMaxWidths,
    candidateListColumnMinWidths,
    candidateStatusLabels,
    mailSenderPresets,
    positionStatusLabels,
    providerLabels,
    type CandidateEditorState,
    type CandidateListColumnKey,
    type LLMFormState,
    type MailRecipientFormState,
    type MailSenderFormState,
    type MailSenderPreset,
    type PositionFormState,
    type ResumeMailFormState,
    type ScreeningSkillDimension,
    type ScreeningSkillFormData,
    type SkillFormState,
} from "./types";

type RecruitmentUiLocale = {
    dateLocale: string;
    unknownError: string;
    unknownStatus: string;
    genericLabels: {
        pending: string;
        running: string;
        completed: string;
        failed: string;
        stopped: string;
        fallbackCompleted: string;
        queueing: string;
        stopping: string;
    };
    jdGenerationStatusLabels: Record<string, string>;
    taskExecutionStatusLabels: Record<string, string>;
    screeningTaskStageLabels: Record<string, string>;
    skillResolutionSourceLabels: Record<string, string>;
    resumeMailDispatchStatusLabels: Record<string, string>;
    candidateSourceLabels: Record<string, string>;
    objectLabels: {
        candidate: string;
        position: string;
        skill: string;
        systemTask: string;
    };
    skillDimensionValidation: {
        needAtLeastOneDimension: string;
        needMorePoints: string;
        exceedPoints: string;
        totalScoreValid: string;
    };
};

const zhRecruitmentUiLocale: RecruitmentUiLocale = {
    dateLocale: "zh-CN",
    unknownError: "未知错误",
    unknownStatus: "未知状态",
    genericLabels: {
        pending: "待执行",
        running: "执行中",
        completed: "已完成",
        failed: "失败",
        stopped: "已停止",
        fallbackCompleted: "兜底完成",
        queueing: "排队中",
        stopping: "停止中",
    },
    jdGenerationStatusLabels: {
        pending: "排队中",
        running: "生成中",
        generating: "生成中",
        cancelling: "停止中",
        cancelled: "已停止",
        syncing: "同步中",
        success: "已完成",
        fallback: "已完成",
        failed: "失败",
        queued: "排队中",
        default: "待生成",
    },
    taskExecutionStatusLabels: {
        success: "已完成",
        no_match: "未匹配",
        fallback: "兜底完成",
        running: "执行中",
        cancelling: "停止中",
        cancelled: "已停止",
        queued: "排队中",
        pending: "待执行",
        invalid_result: "结果无效",
        json_parse_failed: "JSON 失败",
        rate_limited: "接口限流",
        quota_exceeded: "额度不足",
        upstream_timeout: "接口超时",
        request_failed: "请求失败",
        timeout: "超时",
        retry_exhausted: "重试耗尽",
        failed: "失败",
    },
    screeningTaskStageLabels: {
        queued: "已入队",
        parsing: "解析中",
        parsed: "解析完成",
        scoring: "评分中",
        validating: "校验中",
        saving: "保存中",
        completed: "已完成",
        failed: "失败",
        cancelled: "已停止",
    },
    skillResolutionSourceLabels: {
        position_binding: "岗位绑定",
        system_builtin_base: "系统通用基座",
        candidate_memory: "候选人工作记忆",
        explicit_request: "显式指定",
        task_snapshot: "任务快照",
        none: "未命中",
        default: "未记录",
    },
    resumeMailDispatchStatusLabels: {
        sent: "已发送",
        failed: "发送失败",
        pending: "发送中",
        skipped_no_recipient_source: "跳过：未配置任何收件人来源",
        skipped_global_disabled: "跳过：使用全局收件人但全局能力未开启",
        skipped_status_not_allowed: "跳过：状态未命中允许列表",
        skipped_duplicate_blocked: "跳过：重复发送已拦截",
        skipped_no_recipients: "跳过：无有效收件人",
        skipped_no_sender: "跳过：无可用发件箱",
    },
    candidateSourceLabels: {
        manual_upload: "手动上传",
        unknown: "未知来源",
    },
    objectLabels: {
        candidate: "候选人",
        position: "岗位",
        skill: "评估方案",
        systemTask: "系统任务",
    },
    skillDimensionValidation: {
        needAtLeastOneDimension: "至少需要一个评分维度",
        needMorePoints: "还需分配",
        exceedPoints: "超出",
        totalScoreValid: "总分校验通过",
    },
};

const enRecruitmentUiLocale: RecruitmentUiLocale = {
    dateLocale: "en-US",
    unknownError: "Unknown error",
    unknownStatus: "Unknown status",
    genericLabels: {
        pending: "Pending",
        running: "Running",
        completed: "Completed",
        failed: "Failed",
        stopped: "Stopped",
        fallbackCompleted: "Fallback Completed",
        queueing: "Queued",
        stopping: "Stopping",
    },
    jdGenerationStatusLabels: {
        pending: "Queued",
        running: "Generating",
        generating: "Generating",
        cancelling: "Stopping",
        cancelled: "Stopped",
        syncing: "Syncing",
        success: "Completed",
        fallback: "Completed",
        failed: "Failed",
        queued: "Queued",
        default: "Pending",
    },
    taskExecutionStatusLabels: {
        success: "Completed",
        no_match: "No Match",
        fallback: "Fallback Completed",
        running: "Running",
        cancelling: "Stopping",
        cancelled: "Stopped",
        queued: "Queued",
        pending: "Pending",
        invalid_result: "Invalid Result",
        json_parse_failed: "JSON Failed",
        rate_limited: "Rate Limited",
        upstream_timeout: "Upstream Timeout",
        request_failed: "Request Failed",
        timeout: "Timed Out",
        retry_exhausted: "Retries Exhausted",
        failed: "Failed",
    },
    screeningTaskStageLabels: {
        queued: "Queued",
        parsing: "Parsing",
        parsed: "Parsed",
        scoring: "Scoring",
        validating: "Validating",
        saving: "Saving",
        completed: "Completed",
        failed: "Failed",
        cancelled: "Stopped",
    },
    skillResolutionSourceLabels: {
        position_binding: "Position Binding",
        system_builtin_base: "System Base",
        candidate_memory: "Candidate Memory",
        explicit_request: "Explicit Request",
        task_snapshot: "Task Snapshot",
        none: "No Match",
        default: "Unrecorded",
    },
    resumeMailDispatchStatusLabels: {
        sent: "Sent",
        failed: "Send Failed",
        pending: "Sending",
        skipped_no_recipient_source: "Skipped: no recipient source configured",
        skipped_global_disabled: "Skipped: global recipient mode is disabled",
        skipped_status_not_allowed: "Skipped: status not allowed",
        skipped_duplicate_blocked: "Skipped: duplicate delivery blocked",
        skipped_no_recipients: "Skipped: no valid recipients",
        skipped_no_sender: "Skipped: no sender available",
    },
    candidateSourceLabels: {
        manual_upload: "Manual Upload",
        unknown: "Unknown",
    },
    objectLabels: {
        candidate: "Candidate",
        position: "Position",
        skill: "Assessment Plan",
        systemTask: "System Task",
    },
    skillDimensionValidation: {
        needAtLeastOneDimension: "At least one scoring dimension is required",
        needMorePoints: "Need more",
        exceedPoints: "Exceeds by",
        totalScoreValid: "Total score validated",
    },
};

function getRecruitmentUiLocale(): RecruitmentUiLocale {
    return getCurrentLanguage() === "en-US" ? enRecruitmentUiLocale : zhRecruitmentUiLocale;
}

export function formatNavBadgeCount(count?: number): string | null {
    if (typeof count !== "number" || !Number.isFinite(count)) {
        return null;
    }
    return count > 99 ? "99+" : String(Math.max(0, count));
}

export function inferMailSenderPreset(email?: string | null): MailSenderPreset | null {
    const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
    if (!domain) {
        return null;
    }
    return mailSenderPresets.find((preset) => preset.domains.includes(domain)) || null;
}

export function looksLikeFullHtmlDocument(value?: string | null): boolean {
    const html = String(value || "").trim();
    if (!html) {
        return false;
    }
    return /<!doctype\s+html/i.test(html) || /<html[\s>]/i.test(html) || /<head[\s>]/i.test(html) || /<body[\s>]/i.test(html);
}

export function clampCandidateListColumnWidth(key: CandidateListColumnKey, width: number): number {
    const min = candidateListColumnMinWidths[key];
    const max = candidateListColumnMaxWidths[key];
    return Math.min(max, Math.max(min, Math.round(width)));
}

export function expandTableColumnWidths<T extends string>(
    baseWidths: Record<T, number>,
    availableWidth: number,
    reservedWidth: number,
    weights: Record<T, number>,
): Record<T, number> {
    const entries = Object.entries(baseWidths) as Array<[T, number]>;
    const baseTotal = reservedWidth + entries.reduce((sum, [, width]) => sum + width, 0);
    if (!availableWidth || availableWidth <= baseTotal) {
        return baseWidths;
    }

    const extra = availableWidth - baseTotal;
    const totalWeight = entries.reduce((sum, [key]) => sum + (weights[key] || 1), 0);
    if (totalWeight <= 0) {
        return baseWidths;
    }

    let distributed = 0;
    return entries.reduce((acc, [key, width], index) => {
        const isLast = index === entries.length - 1;
        const growth = isLast
            ? extra - distributed
            : Math.round((extra * (weights[key] || 1)) / totalWeight);
        distributed += growth;
        acc[key] = width + growth;
        return acc;
    }, {} as Record<T, number>);
}

export function emptyPositionForm(): PositionFormState {
    return {
        orgCode: "",
        title: "",
        department: "",
        location: "",
        employmentType: "社招全职",
        jobType: "",
        jobTypePath: [],
        experience: "不限",
        education: "不限",
        salaryMinK: null,
        salaryMaxK: null,
        salaryMonths: "12个月",
        salaryRange: "",
        headcount: "1",
        keyRequirements: "",
        bonusPoints: "",
        summary: "",
        status: "recruiting",
        tagsText: "",
        autoPublish: false,
        autoScreenOnUpload: false,
        autoAdvanceOnScreening: true,
        autoMailEnabled: false,
        autoMailUseGlobalRecipients: false,
        autoMailUsePositionRecipients: false,
        autoMailPositionRecipientIds: [],
        autoMailAllowedCandidateStatuses: ["screening_passed"],
        autoMailTemplateId: "",
        autoMailDedupMode: "once_per_candidate_per_status",
        autoMailCcRecipientIds: [],
        autoMailBccRecipientIds: [],
        jdSkillIds: [],
        screeningSkillIds: [],
        interviewSkillIds: [],
    };
}

export function emptySkillForm(): SkillFormState {
    return {
        name: "",
        description: "",
        content: "",
        tagsText: "",
        taskTypes: [],
        sortOrder: "99",
        isEnabled: true,
    };
}

let _dimIdCounter = 0;
function newDimId(): string {
    return `dim-${Date.now()}-${++_dimIdCounter}`;
}

export function emptyScreeningSkillForm(): ScreeningSkillFormData {
    return {
        roleName: "",
        roleBackground: "",
        hardRules: "",
        dimensions: [],
        judgmentRules: "",
        name: "",
        description: "",
        tagsText: "",
        taskTypes: ["screening"],
        sortOrder: "99",
        isEnabled: true,
    };
}

export function newDimension(): ScreeningSkillDimension {
    return {
        id: newDimId(),
        name: "",
        maxScore: 1.0,
        priority: "secondary",
        description: "",
        isHardRequirement: false,
    };
}

const PRIORITY_LABELS: Record<string, string> = {
    core: "核心",
    secondary: "次要",
    auxiliary: "辅助",
    bonus: "加分",
};

export function generateSkillContent(form: ScreeningSkillFormData): string {
    const lines: string[] = [];
    lines.push(`你负责对 ${form.roleName || "{岗位名称}"} 候选人做简历初筛评分。`);
    if (form.roleBackground.trim()) {
        lines.push(`岗位背景：${form.roleBackground.trim()}`);
    }
    lines.push("事实来源：只能使用岗位 JD 原文、简历原文和系统传入的结构化信息。没有直接证据就写\u201C简历未提及\u201D并给 0 分，不得虚构或脑补经历。");

    lines.push("硬性规则：");
    let ruleIdx = 1;
    lines.push(`${ruleIdx++}. 必须逐维度评分，不得跳过任何维度。`);
    const hardDims = form.dimensions.filter((d) => d.isHardRequirement && d.name.trim());
    if (hardDims.length >= 2) {
        lines.push(`${ruleIdx++}. ${hardDims.map((d) => d.name.trim()).join("和")}任一缺失时，concerns 不得为空，suggested_status 不得为 screening_passed。`);
    } else if (hardDims.length === 1) {
        lines.push(`${ruleIdx++}. ${hardDims[0].name.trim()}缺失时，concerns 不得为空，suggested_status 不得为 screening_passed。`);
    }
    if (form.hardRules.trim()) {
        for (const rule of form.hardRules.split("\n").map((r) => r.trim()).filter(Boolean)) {
            lines.push(`${ruleIdx++}. ${rule}`);
        }
    }
    lines.push(`${ruleIdx++}. 不得给拍脑袋圆整分，总分必须严格等于所有维度分数之和。`);
    lines.push(`${ruleIdx++}. 每个维度的 reason 必须具体说明：满分情况解释为什么满分，扣分情况逐项说明扣了多少、为什么扣。不要笼统概括，要有具体依据。`);

    lines.push("评分维度与满分：");
    form.dimensions.forEach((dim, i) => {
        const prefix = dim.priority === "core" ? "核心第一优先，" : "";
        lines.push(`${i + 1}. ${dim.name || "{维度名}"}：满分 ${dim.maxScore} 分。${prefix}${dim.description || "{评估重点}"}`);
    });

    lines.push("判定规则：");
    lines.push("1. total_score 必须等于所有维度分数之和。");
    lines.push("2. match_percent 必须按 total_score 换算，不得另给一套与维度不一致的印象分。");
    lines.push("3. advantages 只能来自得分大于 0 的维度，且必须是招聘视角的自然语言总结。");
    lines.push("4. concerns 只能来自低分、零分或核心缺口维度，必须具体到可用于后续追问。");
    lines.push("5. recommendation 用一句话说明是否建议进入面试，suggested_status 只能从 screening_passed、talent_pool、screening_rejected 中选择。");
    if (form.judgmentRules.trim()) {
        let jIdx = 6;
        for (const rule of form.judgmentRules.split("\n").map((r) => r.trim()).filter(Boolean)) {
            lines.push(`${jIdx++}. ${rule}`);
        }
    }

    return lines.join("\n");
}

export function parseSkillContent(content: string): Partial<ScreeningSkillFormData> {
    const result: Partial<ScreeningSkillFormData> = {
        dimensions: [],
    };

    const roleMatch = content.match(/你负责对\s*(.+?)\s*候选人做简历初筛评分/);
    if (roleMatch) result.roleName = roleMatch[1].trim();

    const bgMatch = content.match(/岗位背景[：:]\s*([\s\S]+?)(?=\n事实来源[：:])/);
    if (bgMatch) result.roleBackground = bgMatch[1].trim();

    const hardSection = content.match(/硬性规则[：:]\n([\s\S]+?)(?=\n评分维度与满分[：:])/);
    if (hardSection) {
        const rules = hardSection[1].split("\n")
            .map((l) => l.replace(/^\d+\.\s*/, "").trim())
            .filter(Boolean);
        const customRules = rules.filter((r) =>
            r !== "必须逐维度评分，不得跳过任何维度。" &&
            !r.includes("不得给拍脑袋圆整分") &&
            !r.includes("缺失时，concerns") &&
            !r.includes("每个维度的 reason 必须具体说明")
        );
        result.hardRules = customRules.join("\n");
    }

    const dimSection = content.match(/评分维度与满分[：:]?\n([\s\S]+?)(?=\n判定规则[：:]?)/);
    if (dimSection) {
        const dims: ScreeningSkillDimension[] = [];
        const dimLines = dimSection[1].split("\n");
        for (const line of dimLines) {
            const normalizedLine = line.trim();
            const m = normalizedLine.match(/^\d+[.、)]\s*(.+?)[：:]\s*满分\s*([\d.]+)\s*分(?:[。.．]?\s*)(.*)$/);
            if (m) {
                const desc = m[3].trim();
                const isCore = desc.startsWith("核心第一优先");
                dims.push({
                    id: newDimId(),
                    name: m[1].trim(),
                    maxScore: parseFloat(m[2]),
                    priority: isCore ? "core" : (parseFloat(m[2]) >= 1.0 ? "secondary" : parseFloat(m[2]) >= 0.3 ? "auxiliary" : "bonus"),
                    description: isCore ? desc.replace(/^核心第一优先[，,]\s*/, "") : desc,
                    isHardRequirement: false,
                });
            }
        }
        const hardRules = (result.hardRules || "")
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
        const hardDimensionNames = new Set<string>();
        for (const rule of hardRules) {
            if (!rule.includes("缺失")) continue;
            dims.forEach((dim) => {
                if (dim.name && rule.includes(dim.name)) {
                    hardDimensionNames.add(dim.name);
                }
            });
        }
        dims.forEach((dim) => {
            if (hardDimensionNames.has(dim.name)) {
                dim.isHardRequirement = true;
            }
        });
        result.dimensions = dims;
    }

    const judgeSection = content.match(/判定规则[：:]\n([\s\S]+)$/);
    if (judgeSection) {
        const rules = judgeSection[1].split("\n")
            .map((l) => l.replace(/^\d+\.\s*/, "").trim())
            .filter(Boolean);
        const fixedRules = [
            "total_score 必须等于所有维度分数之和。",
            "match_percent 必须按 total_score 换算",
            "advantages 只能来自得分大于 0 的维度",
            "concerns 只能来自低分、零分或核心缺口维度",
            "recommendation 用一句话说明",
        ];
        const customRules = rules.filter((r) => !fixedRules.some((f) => r.includes(f)));
        result.judgmentRules = customRules.join("\n");
    }

    return result;
}

export function validateSkillDimensions(dimensions: ScreeningSkillDimension[]): { valid: boolean; total: number; message: string } {
    const locale = getRecruitmentUiLocale().skillDimensionValidation;
    if (dimensions.length === 0) {
        return { valid: false, total: 0, message: locale.needAtLeastOneDimension };
    }
    const total = Math.round(dimensions.reduce((sum, d) => sum + d.maxScore, 0) * 100) / 100;
    const diff = Math.abs(total - 10.0);
    if (diff > 0.01) {
        const msg = total < 10 ? locale.needMorePoints : locale.exceedPoints;
        return { valid: false, total, message: `Current total: ${total.toFixed(1)}, ${msg} ${Math.abs(10 - total).toFixed(1)} points` };
    }
    return { valid: true, total: 10.0, message: locale.totalScoreValid };
}

export function normalizeDimensionScores(dimensions: ScreeningSkillDimension[]): ScreeningSkillDimension[] {
    if (dimensions.length === 0) return dimensions;
    const total = dimensions.reduce((sum, d) => sum + d.maxScore, 0);
    if (Math.abs(total - 10.0) < 0.01) return dimensions;
    const scale = 10.0 / total;
    const scaled = dimensions.map((d) => ({...d, maxScore: Math.round(d.maxScore * scale * 10) / 10}));
    const scaledTotal = scaled.reduce((sum, d) => sum + d.maxScore, 0);
    const diff = Math.round((10.0 - scaledTotal) * 10) / 10;
    if (diff !== 0 && scaled.length > 0) {
        scaled[scaled.length - 1].maxScore = Math.round((scaled[scaled.length - 1].maxScore + diff) * 10) / 10;
    }
    return scaled;
}

export function emptyLLMForm(): LLMFormState {
    return {
        configKey: "",
        taskType: "default",
        provider: "gemini",
        modelName: "",
        baseUrl: "",
        apiKeyEnv: "",
        apiKeyValue: "",
        maxConcurrent: "4",
        maxQps: "10",
        priority: "99",
        isActive: true,
        extraConfigText: "{}",
    };
}

export function emptyCandidateEditor(): CandidateEditorState {
    return {
        name: "",
        phone: "",
        email: "",
        currentCompany: "",
        yearsOfExperience: "",
        education: "",
        age: "",
        city: "",
        expectedCity: "",
        notes: "",
        tagsText: "",
        manualOverrideScore: "",
        manualOverrideReason: "",
        hrFeedback: "",
        hrFeedbackReason: "",
        ownerId: "",
        positionId: "",
    };
}

export function emptyMailSenderForm(): MailSenderFormState {
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

export function emptyMailRecipientForm(): MailRecipientFormState {
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

export function emptyResumeMailForm(): ResumeMailFormState {
    return {
        candidateIds: [],
        senderConfigId: "",
        recipientIds: [],
        extraRecipientEmails: "",
        subject: "",
        bodyText: "",
    };
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
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

export function formatDateTime(value?: string | null) {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(getRecruitmentUiLocale().dateLocale, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export function formatLongDateTime(value?: string | null) {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(getRecruitmentUiLocale().dateLocale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export function shortText(value?: string | null, limit = 120) {
    if (!value) {
        return "-";
    }
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

export function formatSkillNames(skillIds: number[] | undefined | null, skillMap: Map<number, RecruitmentSkill>, language?: string) {
    const isZh = language ? language === "zh-CN" : getCurrentLanguage() !== "en-US";
    const ids = skillIds || [];
    if (!ids.length) {
        return isZh ? "未关联评估方案" : "No assessment plans linked";
    }
    return ids
        .map((skillId) => skillMap.get(skillId)?.name || `评估方案 #${skillId}`)
        .join(isZh ? "、" : ", ");
}

export type SkillTaskKind = "jd" | "screening" | "interview";

export type SkillPackOption = {
    id: number;
    key: string;
    group: string;
    version: string;
    label: string;
    description?: string | null;
    modules: Record<SkillTaskKind, RecruitmentSkill | null>;
};

export function parseSkillFrontmatter(content?: string | null) {
    const text = content || "";
    const match = text.match(/^\s*---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!match) {
        return {} as Record<string, string>;
    }
    const result: Record<string, string> = {};
    match[1].split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || !line.includes(":")) {
            return;
        }
        const [rawKey, ...rest] = line.split(":");
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(":").trim().replace(/^['"]|['"]$/g, "");
        if (key && value) {
            result[key] = value;
        }
    });
    return result;
}

export function normalizeSkillTaskName(value?: string | null): SkillTaskKind | null {
    const text = (value || "").trim().toLowerCase();
    if (!text) {
        return null;
    }
    if (["jd", "job_description", "job-description", "岗位jd", "职位jd", "jd生成", "生成jd", "岗位描述", "职位描述"].includes(text)) {
        return "jd";
    }
    if (["screening", "score", "scoring", "resume_score", "resume-screening", "初筛", "评分", "筛选"].includes(text)) {
        return "screening";
    }
    if (["interview", "question", "questions", "interview-question", "面试", "面试题", "出题"].includes(text)) {
        return "interview";
    }
    return null;
}

export function extractSkillRuntimeMeta(skill: Partial<RecruitmentSkill> | null | undefined) {
    const frontmatter = parseSkillFrontmatter(skill?.content || "");
    const tags = Array.isArray(skill?.tags) ? skill.tags.filter((tag): tag is string => typeof tag === "string") : [];
    let group = String(skill?.skill_group || frontmatter.skill_group || frontmatter.group || "").trim();
    if (!group) {
        const groupTag = tags.find((tag) => tag.toLowerCase().startsWith("group:"));
        if (groupTag) {
            group = groupTag.split(":").slice(1).join(":").trim();
        }
    }
    let version = String(skill?.version || frontmatter.version || frontmatter.skill_version || "").trim();
    if (!version) {
        const versionTag = tags.find((tag) => tag.toLowerCase().startsWith("version:"));
        if (versionTag) {
            version = versionTag.split(":").slice(1).join(":").trim();
        }
    }
    const rawTaskValues: string[] = [];
    if (Array.isArray(skill?.task_types)) {
        rawTaskValues.push(...skill.task_types);
    }
    ["applies_to", "task", "tasks", "task_type"].forEach((fieldName) => {
        const rawValue = frontmatter[fieldName];
        if (rawValue) {
            rawTaskValues.push(...rawValue.split(/[,/|，、\s]+/).filter(Boolean));
        }
    });
    tags.forEach((tag) => {
        if (tag.toLowerCase().startsWith("task:")) {
            rawTaskValues.push(tag.split(":").slice(1).join(":").trim());
        } else {
            rawTaskValues.push(tag);
        }
    });
    const tasks = Array.from(
        new Set(
            rawTaskValues
                .map((item) => normalizeSkillTaskName(item))
                .filter((item): item is SkillTaskKind => Boolean(item)),
        ),
    );
    return {group, version, tasks};
}

function buildSkillPackKey(group?: string | null, version?: string | null) {
    const normalizedGroup = String(group || "").trim();
    if (!normalizedGroup) {
        return "";
    }
    return `${normalizedGroup}::${String(version || "").trim()}`;
}

function sortSkillRows(source: RecruitmentSkill[]) {
    return [...source].sort((left, right) => {
        const leftOrder = Number.isFinite(Number(left.sort_order)) ? Number(left.sort_order) : 999;
        const rightOrder = Number.isFinite(Number(right.sort_order)) ? Number(right.sort_order) : 999;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }
        if (left.id !== right.id) {
            return left.id - right.id;
        }
        return String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans-CN");
    });
}

export function buildSkillPackOptions(source: RecruitmentSkill[]): SkillPackOption[] {
    const packMap = new Map<string, RecruitmentSkill[]>();
    source.forEach((skill) => {
        if (skill.is_enabled === false) {
            return;
        }
        const meta = extractSkillRuntimeMeta(skill);
        const packKey = buildSkillPackKey(meta.group, meta.version);
        if (!packKey) {
            return;
        }
        const current = packMap.get(packKey) || [];
        current.push(skill);
        packMap.set(packKey, current);
    });
    return Array.from(packMap.entries())
        .map(([packKey, rows]) => {
            const sortedRows = sortSkillRows(rows);
            const sampleMeta = extractSkillRuntimeMeta(sortedRows[0]);
            const modules: Record<SkillTaskKind, RecruitmentSkill | null> = {
                jd: null,
                screening: null,
                interview: null,
            };
            sortedRows.forEach((skill) => {
                const meta = extractSkillRuntimeMeta(skill);
                meta.tasks.forEach((taskKind) => {
                    if (!modules[taskKind]) {
                        modules[taskKind] = skill;
                    }
                });
            });
            const preferredSkill = modules.jd || modules.screening || modules.interview || sortedRows[0];
            return {
                id: preferredSkill.id,
                key: packKey,
                group: sampleMeta.group,
                version: sampleMeta.version,
                label: sampleMeta.group,
                description: preferredSkill.description || null,
                modules,
            };
        })
        .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN"));
}

export function resolveSkillPackTaskIds(
    skillPackIds: number[] | undefined | null,
    skillMap: Map<number, RecruitmentSkill>,
): Record<SkillTaskKind, number[]> {
    const selectedId = (skillPackIds || []).find((item): item is number => typeof item === "number");
    const emptyValue: Record<SkillTaskKind, number[]> = {jd: [], screening: [], interview: []};
    if (!selectedId) {
        return emptyValue;
    }
    const selectedSkill = skillMap.get(selectedId);
    if (!selectedSkill) {
        return emptyValue;
    }
    const selectedMeta = extractSkillRuntimeMeta(selectedSkill);
    const selectedPackKey = buildSkillPackKey(selectedMeta.group, selectedMeta.version);
    if (!selectedPackKey) {
        return selectedMeta.tasks.reduce((acc, taskKind) => {
            acc[taskKind] = [selectedSkill.id];
            return acc;
        }, emptyValue);
    }
    return sortSkillRows(
        Array.from(skillMap.values()).filter((skill) => {
            if (skill.is_enabled === false) {
                return false;
            }
            const meta = extractSkillRuntimeMeta(skill);
            return buildSkillPackKey(meta.group, meta.version) === selectedPackKey;
        }),
    ).reduce((acc, skill) => {
        extractSkillRuntimeMeta(skill).tasks.forEach((taskKind) => {
            if (!acc[taskKind].includes(skill.id)) {
                acc[taskKind].push(skill.id);
            }
        });
        return acc;
    }, emptyValue);
}

export function inferSkillPackIdsFromTaskSelections(
    payload: Partial<Record<SkillTaskKind, number[]>>,
    skillMap: Map<number, RecruitmentSkill>,
) {
    const packScoreMap = new Map<string, {id: number; taskCount: number; score: number}>();
    (["jd", "screening", "interview"] as SkillTaskKind[]).forEach((taskKind, taskIndex) => {
        (payload[taskKind] || []).forEach((skillId) => {
            const skill = skillMap.get(skillId);
            if (!skill) {
                return;
            }
            const meta = extractSkillRuntimeMeta(skill);
            const packKey = buildSkillPackKey(meta.group, meta.version);
            if (!packKey) {
                return;
            }
            const current = packScoreMap.get(packKey) || {id: skill.id, taskCount: 0, score: 0};
            packScoreMap.set(packKey, {
                id: current.id,
                taskCount: current.taskCount + 1,
                score: current.score + (10 - taskIndex),
            });
        });
    });
    const bestMatch = Array.from(packScoreMap.values()).sort((left, right) => {
        if (left.taskCount !== right.taskCount) {
            return right.taskCount - left.taskCount;
        }
        if (left.score !== right.score) {
            return right.score - left.score;
        }
        return left.id - right.id;
    })[0];
    return bestMatch ? [bestMatch.id] : [];
}

export function resolveTaskSkillIds(
    skillIds: number[] | undefined | null,
    taskKind: SkillTaskKind,
    skillMap: Map<number, RecruitmentSkill>,
) {
    const ids = (skillIds || []).filter((item): item is number => typeof item === "number");
    if (!ids.length) {
        return [];
    }
    const directMatches = ids.filter((skillId) => {
        const skill = skillMap.get(skillId);
        return skill?.is_enabled !== false && extractSkillRuntimeMeta(skill).tasks.includes(taskKind);
    });
    if (directMatches.length) {
        return Array.from(new Set(directMatches));
    }
    const packKeys = Array.from(
        new Set(
            ids
                .map((skillId) => {
                    const meta = extractSkillRuntimeMeta(skillMap.get(skillId));
                    return buildSkillPackKey(meta.group, meta.version);
                })
                .filter((value): value is string => Boolean(value)),
        ),
    );
    if (!packKeys.length) {
        return ids;
    }
    const relatedIds = Array.from(
        new Set(
            Array.from(skillMap.values())
                .filter((skill) => {
                    const meta = extractSkillRuntimeMeta(skill);
                    return skill.is_enabled !== false && packKeys.includes(buildSkillPackKey(meta.group, meta.version)) && meta.tasks.includes(taskKind);
                })
                .map((skill) => skill.id),
        ),
    );
    return relatedIds.length ? relatedIds : ids;
}

export function toggleSingleSkillId(current: number[], targetId: number) {
    return current.includes(targetId) ? [] : [targetId];
}

export function sortSkillsForTaskPreference(
    source: RecruitmentSkill[],
    taskKind: SkillTaskKind,
) {
    return [...source].sort((left, right) => {
        const leftMeta = extractSkillRuntimeMeta(left);
        const rightMeta = extractSkillRuntimeMeta(right);
        const leftMatch = leftMeta.tasks.includes(taskKind) ? 1 : 0;
        const rightMatch = rightMeta.tasks.includes(taskKind) ? 1 : 0;
        if (leftMatch !== rightMatch) {
            return rightMatch - leftMatch;
        }
        const leftOrder = Number.isFinite(Number(left.sort_order)) ? Number(left.sort_order) : 999;
        const rightOrder = Number.isFinite(Number(right.sort_order)) ? Number(right.sort_order) : 999;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }
        const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
        if (leftTime !== rightTime) {
            return rightTime - leftTime;
        }
        if (left.id !== right.id) {
            return right.id - left.id;
        }
        return String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans-CN");
    });
}

export function normalizeSkillSnapshot(skill: Partial<RecruitmentSkill> | null | undefined, fallbackIndex = 0): RecruitmentSkill {
    const fallbackId = typeof skill?.id === "number" ? skill.id : -(fallbackIndex + 1);
    const normalizedTags = Array.isArray(skill?.tags)
        ? skill.tags.filter((tag): tag is string => typeof tag === "string")
        : [];
    return {
        id: fallbackId,
        skill_code: skill?.skill_code || `snapshot-${Math.abs(fallbackId) || fallbackIndex + 1}`,
        name: skill?.name || `评估方案 #${Math.abs(fallbackId) || fallbackIndex + 1}`,
        description: skill?.description || null,
        content: skill?.content || "",
        tags: normalizedTags,
        sort_order: Number.isFinite(Number(skill?.sort_order)) ? Number(skill?.sort_order) : 999,
        is_enabled: skill?.is_enabled !== false,
        skill_group: skill?.skill_group || null,
        version: skill?.version || null,
        task_types: Array.isArray(skill?.task_types) ? skill.task_types : extractSkillRuntimeMeta(skill).tasks,
        created_by: skill?.created_by || null,
        updated_by: skill?.updated_by || null,
        created_at: skill?.created_at || null,
        updated_at: skill?.updated_at || null,
    };
}

export function resolveLogSkillSnapshots(
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
            name: `评估方案 #${skillId}`,
            content: "",
            tags: [],
            sort_order: 999,
            is_enabled: true,
        },
        index,
    ));
}

export function formatSkillSnapshotNames(skillSnapshots: RecruitmentSkill[], language?: string) {
    const isZh = language ? language === "zh-CN" : getCurrentLanguage() !== "en-US";
    if (!skillSnapshots.length) {
        return isZh ? "未关联评估方案" : "No assessment plans linked";
    }
    return skillSnapshots.map((skill) => skill.name || `评估方案 #${skill.id}`).join(isZh ? "、" : ", ");
}

export function formatStructuredValue(value: unknown, fallback: string) {
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

export function parseStructuredLogOutput(value: unknown) {
    if (typeof value !== "string") {
        return value;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    if (
        (trimmed.startsWith("{") && trimmed.endsWith("}"))
        || (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return trimmed;
        }
    }
    return trimmed;
}

export function isLiveTaskStatus(status?: string | null) {
    return ["queued", "pending", "running", "cancelling"].includes(status || "");
}

export function isTerminalTaskStatus(status?: string | null) {
    return [
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
    ].includes(status || "");
}

export function labelForMemorySource(source?: string | null) {
    switch (source) {
        case "explicit_request":
        case "manual_override":
        case "manual":
            return "手动指定评估方案";
        case "candidate_memory":
            return "候选人工作记忆";
        case "position":
        case "position_default":
        case "position_binding":
            return "岗位绑定评估方案";
        case "system_builtin_base":
        case "system_base":
        case "builtin_base":
            return "系统通用基座";
        case "global":
        case "enabled_global_fallback":
            return "全局启用评估方案";
        case "task_snapshot":
            return "任务快照";
        case "none":
            return "未命中评估方案";
        case "guardrail":
            return "非招聘拒答规则";
        default:
            return source || "未记录";
    }
}

export function parseEmailList(value: string) {
    return Array.from(
        new Set(
            value
                .split(/[\n,;，；\s]+/)
                .map((item) => item.trim())
                .filter(Boolean),
        ),
    );
}

export function extractFileNameFromDisposition(value: string | null, fallback: string) {
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

export function formatActionError(error: unknown) {
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
    return getRecruitmentUiLocale().unknownError;
}

export function toggleIdInList(current: number[], targetId: number, nextChecked?: boolean) {
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

export function formatPercent(value?: number | null) {
    if (value === undefined || value === null || Number.isNaN(value)) {
        return "-";
    }
    return `${Math.round(value)}%`;
}

export function formatScoreValue(value?: number | null, scale?: number | null) {
    if (value === undefined || value === null || Number.isNaN(value)) {
        return "-";
    }
    const normalized = Number(value);
    const text = Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1).replace(/\.0$/, "");
    return scale === 10 ? `${text} / 10` : text;
}

export function extractPublishText(markdown?: string | null, publishText?: string | null) {
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

export function labelForJDGenerationStatus(status?: string | null) {
    const locale = getRecruitmentUiLocale();
    return locale.jdGenerationStatusLabels[status || ""] || locale.jdGenerationStatusLabels.default;
}

export function labelForTaskExecutionStatus(status?: string | null) {
    const locale = getRecruitmentUiLocale();
    return locale.taskExecutionStatusLabels[status || ""] || status || "-";
}

export function labelForScreeningTaskStage(stage?: string | null) {
    const locale = getRecruitmentUiLocale();
    return locale.screeningTaskStageLabels[stage || ""] || stage || "-";
}

export function labelForSkillResolutionSource(source?: string | null) {
    const locale = getRecruitmentUiLocale();
    return locale.skillResolutionSourceLabels[source || ""] || source || locale.skillResolutionSourceLabels.default;
}

export function labelForCandidateSource(source?: string | null) {
    const normalized = String(source || "").trim();
    if (!normalized) {
        return "-";
    }
    const locale = getRecruitmentUiLocale();
    return locale.candidateSourceLabels[normalized] || normalized;
}

export function isToday(value?: string | null) {
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

export function withinDays(value?: string | null, days = 7) {
    if (!value) {
        return false;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return false;
    }
    return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

export function statusBadgeClass(kind: "position" | "candidate" | "task", value?: string | null) {
    if (kind === "task") {
        if (value === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
        if (value === "no_match") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
        if (value === "fallback") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
        if (value === "pending" || value === "queued") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200";
        if (value === "running") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200";
        if (value === "cancelling") return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200";
        if (value === "cancelled") return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
        if (value === "invalid_result") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
        if (value === "quota_exceeded") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
        if (value === "json_parse_failed" || value === "timeout" || value === "retry_exhausted" || value === "rate_limited" || value === "upstream_timeout" || value === "request_failed") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
        if (value === "failed") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
    }
    if (kind === "position") {
        if (value === "recruiting") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
        if (value === "paused") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
        if (value === "closed") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
    }
    if (kind === "candidate") {
        if (value === "screening_running" || value === "interview_first_active" || value === "interview_second_active") {
            return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200";
        }
        if (value === "screening_passed" || value === "department_review_passed" || value === "interview_passed" || value === "offer_sent" || value === "hired") {
            return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
        }
        if (value === "screening_rejected" || value === "department_review_rejected" || value === "interview_rejected" || value === "interview_first_rejected" || value === "interview_second_rejected") {
            return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
        }
        if (value === "matching") {
            return "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 animate-pulse";
        }
        if (value === "unmatched") {
            return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
        }
        if (value === "pending_screening" || value === "department_review_pending" || value === "pending_interview" || value === "pending_offer" || value === "interview_first_pending" || value === "interview_second_pending") {
            return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200";
        }
        if (value === "talent_pool") {
            return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200";
        }
    }
    return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300";
}

export function labelForPositionStatus(status?: string | null) {
    return positionStatusLabels[status || ""] || status || getRecruitmentUiLocale().unknownStatus;
}

export function labelForCandidateStatus(status?: string | null) {
    return candidateStatusLabels[status || ""] || status || getRecruitmentUiLocale().unknownStatus;
}

function resolveCandidateMatchPercentForDisplay(candidate?: CandidateSummary | null) {
    if (!candidate) {
        return null;
    }
    const directMatchPercent = typeof candidate.match_percent === "number"
        ? candidate.match_percent
        : candidate.match_percent != null
            ? Number(candidate.match_percent)
            : null;
    return directMatchPercent !== null && Number.isFinite(directMatchPercent) ? directMatchPercent : null;
}

export function resolveCandidateDisplayStatus(candidate?: CandidateSummary | null) {
    if (!candidate) {
        return "";
    }
    const normalizedStatus = String(candidate.status || "").trim().toLowerCase();
    const talentPoolReason = String(candidate.talent_pool_reason || "").trim().toLowerCase();
    const queuedForAutoRetry = Boolean(
        candidate.active_screening_task_status === "queued"
        && candidate.active_screening_auto_retry_scheduled,
    );
    if (
        candidate.active_screening_task_status
        && ["pending", "queued", "running", "cancelling"].includes(candidate.active_screening_task_status)
        && !queuedForAutoRetry
    ) {
        return "screening_running";
    }
    if (
        normalizedStatus === "unmatched"
        && Boolean(candidate.position_id)
        && (talentPoolReason === "auto_archived" || talentPoolReason === "moved_by_hr" || talentPoolReason === "evidence_review_required")
    ) {
        return "talent_pool";
    }
    if (candidate.display_status) {
        return candidate.display_status;
    }
    if (candidate.status === "pending_screening") {
        return candidate.ai_recommended_status || candidate.status || "";
    }
    return candidate.status || "";
}

export function resolveTalentPoolDisplayStatus(candidate?: CandidateSummary | null) {
    if (!candidate) {
        return "";
    }
    const normalizedStatus = String(candidate.status || "").trim().toLowerCase();
    if (normalizedStatus === "matching") {
        return "matching";
    }
    const reason = String(candidate.talent_pool_reason || "").trim().toLowerCase();
    if (reason === "unmatched_by_ai" || reason === "ai_error") {
        return "unmatched";
    }
    if (normalizedStatus === "talent_pool") {
        return "talent_pool";
    }
    if (reason === "auto_archived" || reason === "moved_by_hr" || reason === "evidence_review_required") {
        return "talent_pool";
    }
    return normalizedStatus || "talent_pool";
}

export function isTalentPoolReidentifiable(candidate?: CandidateSummary | null) {
    const reason = String(candidate?.talent_pool_reason || "").trim().toLowerCase();
    return reason === "unmatched_by_ai" || reason === "ai_error";
}

function isLikelyTimeoutText(value: string) {
    const text = value.toLowerCase();
    return text.includes("timed out")
        || text.includes("timeout")
        || text.includes("upstream_timeout")
        || text.includes("handshake operation timed out")
        || text.includes("readtimeout")
        || text.includes("connecttimeout")
        || value.includes("超时");
}

function isLikelyRateLimitText(value: string) {
    const text = value.toLowerCase();
    return text.includes("rate limit")
        || text.includes("rate_limited")
        || text.includes("too many requests")
        || text.includes("429")
        || value.includes("限流");
}

function isLikelyQuotaText(value: string) {
    const text = value.toLowerCase();
    return text.includes("quota exceeded")
        || text.includes("quota_exceeded")
        || text.includes("usage limit exceeded")
        || text.includes("insufficient_quota")
        || value.includes("额度不足");
}

export function sanitizeCandidateFacingErrorText(
    value?: string | null,
    options?: {
        context?: "screening" | "screening_auto_retry" | "position_match";
        language?: string;
    },
) {
    const normalized = String(value || "").trim();
    if (!normalized) {
        return "";
    }
    const language = options?.language || getCurrentLanguage();
    const isZh = language !== "en-US";
    const context = options?.context || "screening";

    if (isLikelyQuotaText(normalized)) {
        return isZh
            ? "模型额度不足，请充值或更换模型后重试。"
            : "Model quota is exhausted. Please recharge or switch models and try again.";
    }
    if (normalized.toLowerCase().includes("retry_exhausted")) {
        if (context === "position_match") {
            return isZh
                ? "模型请求多次重试后仍失败，请稍后重试识别。"
                : "Model API failed after multiple retries. Please retry identification later.";
        }
        return isZh
            ? "模型请求多次重试后仍失败，请稍后重试。"
            : "Model API failed after multiple retries. Please retry later.";
    }
    if (normalized.toLowerCase().includes("request_failed")) {
        if (context === "position_match") {
            return isZh
                ? "模型请求失败，请稍后重试识别。"
                : "Model API request failed. Please retry identification later.";
        }
        if (context === "screening_auto_retry") {
            return isZh
                ? "模型请求失败，系统将自动重试，请稍候。"
                : "Model API request failed. The system will retry automatically. Please wait.";
        }
        return isZh
            ? "模型请求失败，请稍后重试。"
            : "Model API request failed. Please retry later.";
    }
    if (isLikelyRateLimitText(normalized)) {
        if (context === "position_match") {
            return isZh
                ? "模型接口限流，请稍后重试识别。"
                : "Model API is rate limited. Please retry identification later.";
        }
        return isZh
            ? "模型接口限流，系统将自动重试，请稍候。"
            : "Model API is rate limited. The system will retry automatically. Please wait.";
    }
    if (isLikelyTimeoutText(normalized)) {
        if (context === "position_match") {
            return isZh
                ? "模型接口超时，请稍后重试识别。"
                : "Model API timed out, please retry identification later.";
        }
        if (context === "screening_auto_retry") {
            return isZh
                ? "模型接口超时，系统将自动重试，请稍候。"
                : "Model API timed out, the system will retry automatically. Please wait.";
        }
        return isZh
            ? "模型接口超时，请稍后重试。"
            : "Model API timed out. Please retry later.";
    }
    if (normalized.toLowerCase().includes("resume_text_unavailable")) {
        return isZh
            ? "简历未提取到可识别文本，请上传文本版 PDF 或 Word 后重试。"
            : "No readable text was extracted from the resume. Please upload a text-based PDF or Word file and retry.";
    }
    if (normalized.toLowerCase().includes("screening_rule_invalid")) {
        return isZh
            ? "初筛 Skill 未能解析出有效评分维度，请检查岗位绑定的初筛规则表。"
            : "The screening skill produced no valid scoring dimensions. Please check the position's screening rule table.";
    }
    if (context === "screening_auto_retry" && (normalized.includes("自动重试") || normalized.toLowerCase().includes("retry automatically"))) {
        return normalized;
    }
    return normalized;
}

export function resolveCandidateFacingErrorContext(
    taskType?: string | null,
    options?: {
        autoRetry?: boolean;
    },
): "screening" | "screening_auto_retry" | "position_match" {
    if (String(taskType || "").startsWith("ai_position")) {
        return "position_match";
    }
    if (options?.autoRetry) {
        return "screening_auto_retry";
    }
    return "screening";
}

export function labelForTaskType(taskType?: string | null) {
    return aiTaskLabels[taskType || ""] || taskType || "AI 任务";
}

export function labelForProvider(provider?: string | null) {
    return providerLabels[provider || ""] || provider || "-";
}

export function labelForResumeMailDispatchStatus(status?: string | null) {
    const locale = getRecruitmentUiLocale();
    return locale.resumeMailDispatchStatusLabels[status || ""] || status || locale.unknownStatus;
}

export function buildLogObjectLabel(
    log: AITaskLog,
    positionMap: Map<number, PositionSummary>,
    candidateMap: Map<number, CandidateSummary>,
    skillMap: Map<number, RecruitmentSkill>,
) {
    const locale = getRecruitmentUiLocale();
    if (log.related_candidate_id) {
        return candidateMap.get(log.related_candidate_id)?.name || `${locale.objectLabels.candidate} #${log.related_candidate_id}`;
    }
    if (log.related_position_id) {
        return positionMap.get(log.related_position_id)?.title || `${locale.objectLabels.position} #${log.related_position_id}`;
    }
    if (log.related_skill_id) {
        return skillMap.get(log.related_skill_id)?.name || `${locale.objectLabels.skill} #${log.related_skill_id}`;
    }
    return locale.objectLabels.systemTask;
}
