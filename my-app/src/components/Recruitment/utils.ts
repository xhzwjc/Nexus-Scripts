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
    objectLabels: {
        candidate: string;
        position: string;
        skill: string;
        systemTask: string;
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
        fallback: "兜底完成",
        running: "执行中",
        cancelling: "停止中",
        cancelled: "已停止",
        queued: "排队中",
        pending: "待执行",
        invalid_result: "结果无效",
        json_parse_failed: "JSON 失败",
        rate_limited: "接口限流",
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
    objectLabels: {
        candidate: "候选人",
        position: "岗位",
        skill: "Skill",
        systemTask: "系统任务",
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
    objectLabels: {
        candidate: "Candidate",
        position: "Position",
        skill: "Skill",
        systemTask: "System Task",
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
        age: "",
        city: "",
        notes: "",
        tagsText: "",
        manualOverrideScore: "",
        manualOverrideReason: "",
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

export function formatSkillNames(skillIds: number[] | undefined | null, skillMap: Map<number, RecruitmentSkill>) {
    const ids = skillIds || [];
    if (!ids.length) {
        return "未关联 Skills";
    }
    return ids
        .map((skillId) => skillMap.get(skillId)?.name || `Skill #${skillId}`)
        .join("、");
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
    return ["success", "fallback", "failed", "invalid_result", "json_parse_failed", "timeout", "retry_exhausted", "cancelled"].includes(status || "");
}

export function labelForMemorySource(source?: string | null) {
    switch (source) {
        case "explicit_request":
        case "manual_override":
        case "manual":
            return "手动指定 Skills";
        case "candidate_memory":
            return "候选人工作记忆";
        case "position":
        case "position_default":
        case "position_binding":
            return "岗位绑定 Skills";
        case "system_builtin_base":
        case "system_base":
        case "builtin_base":
            return "系统通用基座";
        case "global":
        case "enabled_global_fallback":
            return "全局启用 Skills";
        case "task_snapshot":
            return "任务快照";
        case "none":
            return "未命中 Skills";
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
        if (value === "invalid_result") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
        if (value === "json_parse_failed" || value === "timeout" || value === "retry_exhausted" || value === "rate_limited" || value === "upstream_timeout" || value === "request_failed") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
        if (value === "failed") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
    }
    if (kind === "position") {
        if (value === "recruiting") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
        if (value === "paused") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
        if (value === "closed") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
    }
    if (kind === "candidate") {
        if (value === "screening_running") {
            return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200";
        }
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
    if (
        candidate.active_screening_task_status
        && ["pending", "queued", "running", "cancelling"].includes(candidate.active_screening_task_status)
    ) {
        return "screening_running";
    }
    if (candidate.display_status) {
        return candidate.display_status;
    }
    if (candidate.status === "pending_screening") {
        return candidate.ai_recommended_status || candidate.status || "";
    }
    return candidate.status || "";
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
