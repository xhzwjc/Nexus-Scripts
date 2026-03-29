import type {
    AITaskLog,
    CandidateSummary,
    PositionSummary,
    RecruitmentSkill,
} from "@/lib/recruitment-api";

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
    type SkillFormState,
} from "./types";

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
        sortOrder: "99",
        isEnabled: true,
    };
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
        notes: "",
        tagsText: "",
        manualOverrideScore: "",
        manualOverrideReason: "",
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
    return new Intl.DateTimeFormat("zh-CN", {
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
    return new Intl.DateTimeFormat("zh-CN", {
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

export function formatSkillNames(skillIds: number[] | undefined | null, skillMap: Map<number, RecruitmentSkill>) {
    const ids = skillIds || [];
    if (!ids.length) {
        return "未关联 Skills";
    }
    return ids
        .map((skillId) => skillMap.get(skillId)?.name || `Skill #${skillId}`)
        .join("、");
}

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

export function normalizeSkillTaskName(value?: string | null): "jd" | "screening" | "interview" | null {
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
    let group = (frontmatter.skill_group || frontmatter.group || "").trim();
    if (!group) {
        const groupTag = tags.find((tag) => tag.toLowerCase().startsWith("group:"));
        if (groupTag) {
            group = groupTag.split(":").slice(1).join(":").trim();
        }
    }
    const rawTaskValues: string[] = [];
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
                .filter((item): item is "jd" | "screening" | "interview" => Boolean(item)),
        ),
    );
    return {group, tasks};
}

export function resolveTaskSkillIds(
    skillIds: number[] | undefined | null,
    taskKind: "jd" | "screening" | "interview",
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
    const groups = Array.from(
        new Set(
            ids
                .map((skillId) => extractSkillRuntimeMeta(skillMap.get(skillId)).group)
                .filter((value): value is string => Boolean(value)),
        ),
    );
    if (!groups.length) {
        return ids;
    }
    const relatedIds = Array.from(
        new Set(
            Array.from(skillMap.values())
                .filter((skill) => {
                    const meta = extractSkillRuntimeMeta(skill);
                    return skill.is_enabled !== false && Boolean(meta.group) && groups.includes(meta.group) && meta.tasks.includes(taskKind);
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
    taskKind: "jd" | "screening" | "interview",
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
            name: `Skill #${skillId}`,
            content: "",
            tags: [],
            sort_order: 999,
            is_enabled: true,
        },
        index,
    ));
}

export function formatSkillSnapshotNames(skillSnapshots: RecruitmentSkill[]) {
    if (!skillSnapshots.length) {
        return "未关联 Skills";
    }
    return skillSnapshots.map((skill) => skill.name || `Skill #${skill.id}`).join("、");
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
    return ["success", "fallback", "failed", "cancelled"].includes(status || "");
}

export function labelForMemorySource(source?: string | null) {
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
    return "未知错误";
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
    switch (status) {
        case "pending":
            return "排队中";
        case "running":
        case "generating":
            return "生成中";
        case "cancelling":
            return "停止中";
        case "cancelled":
            return "已停止";
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

export function labelForTaskExecutionStatus(status?: string | null) {
    switch (status) {
        case "success":
            return "已完成";
        case "fallback":
            return "兜底完成";
        case "running":
            return "执行中";
        case "cancelling":
            return "停止中";
        case "cancelled":
            return "已停止";
        case "queued":
            return "排队中";
        case "pending":
            return "待执行";
        case "failed":
            return "失败";
        default:
            return status || "-";
    }
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
        if (value === "fallback") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
        if (value === "pending" || value === "queued") return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200";
        if (value === "running") return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200";
        if (value === "cancelling") return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200";
        if (value === "cancelled") return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
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

export function labelForPositionStatus(status?: string | null) {
    return positionStatusLabels[status || ""] || status || "未知状态";
}

export function labelForCandidateStatus(status?: string | null) {
    return candidateStatusLabels[status || ""] || status || "未知状态";
}

export function labelForTaskType(taskType?: string | null) {
    return aiTaskLabels[taskType || ""] || taskType || "AI 任务";
}

export function labelForProvider(provider?: string | null) {
    return providerLabels[provider || ""] || provider || "-";
}

export function labelForResumeMailDispatchStatus(status?: string | null) {
    if (status === "sent") return "已发送";
    if (status === "failed") return "发送失败";
    if (status === "pending") return "发送中";
    return status || "未知状态";
}

export function buildLogObjectLabel(
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
