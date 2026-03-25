"use client";

import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
    Rocket,
    Settings2,
    Users,
    LayoutDashboard,
    Briefcase,
    ShieldAlert,
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
    type RecruitmentTaskStartResponse,
} from "@/lib/recruitment-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";


import { SkillSettingsDialog } from "./components/SkillSettingsDialog";
import { LLMSettingsDialog } from "./components/LLMSettingsDialog";
import { MailSenderSettingsDialog } from "./components/MailSenderSettingsDialog";
import { MailRecipientSettingsDialog } from "./components/MailRecipientSettingsDialog";
import { SectionNavButton } from "./components/SharedComponents";
import { PositionsPage } from "./pages/PositionsPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { CandidatesPage } from "./pages/CandidatesPage";
import { AuditPage } from "./pages/AuditPage";
import {
    type AssistantDisplayMode,
    type CandidateEditorState,
    type CandidateViewMode,
    type ChatMessage,
    type JDViewMode,
    type MailSenderPreset,
    type PositionFormState,
    type RecruitmentPage,
    type ResumeMailDialogMode,
    type ResumeMailFormState,
    candidateStatusLabels,
    pageMeta,
    positionStatusLabels,
    aiTaskLabels,
    providerLabels,
} from "./types";
import { AssistantPage } from "./pages/AssistantPage";
import { SkillSettingsPage } from "./pages/SkillSettingsPage";
import { ModelSettingsPage } from "./pages/ModelSettingsPage";
import { MailSettingsPage } from "./pages/MailSettingsPage";

/* Shared types and metadata imported from ./types */

function looksLikeFullHtmlDocument(value?: string | null): boolean {
    const html = String(value || "").trim();
    if (!html) {
        return false;
    }
    return /<!doctype\s+html/i.test(html) || /<html[\s>]/i.test(html) || /<head[\s>]/i.test(html) || /<body[\s>]/i.test(html);
}

const panelClass =
    "rounded-[24px] border border-slate-200/80 bg-white/95 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur dark:border-slate-800/90 dark:bg-slate-950/85";

type CandidateListColumnKey = "candidate" | "position" | "status" | "match" | "source" | "updated";
type AuditListColumnKey = "taskType" | "object" | "status" | "model" | "duration" | "time";

const candidateListColumnDefaultWidths: Record<CandidateListColumnKey, number> = {
    candidate: 260,
    position: 148,
    status: 96,
    match: 84,
    source: 128,
    updated: 156,
};

const candidateListColumnMinWidths: Record<CandidateListColumnKey, number> = {
    candidate: 220,
    position: 120,
    status: 88,
    match: 72,
    source: 104,
    updated: 136,
};

const candidateListColumnMaxWidths: Record<CandidateListColumnKey, number> = {
    candidate: 420,
    position: 260,
    status: 180,
    match: 140,
    source: 240,
    updated: 240,
};

const candidateListColumnFillWeights: Record<CandidateListColumnKey, number> = {
    candidate: 3.4,
    position: 1.8,
    status: 1,
    match: 1,
    source: 1.5,
    updated: 1.3,
};

const auditListColumnBaseWidths: Record<AuditListColumnKey, number> = {
    taskType: 110,
    object: 150,
    status: 84,
    model: 140,
    duration: 72,
    time: 120,
};

const auditListColumnFillWeights: Record<AuditListColumnKey, number> = {
    taskType: 1.4,
    object: 2.4,
    status: 1,
    model: 2.1,
    duration: 0.8,
    time: 1.1,
};

function clampCandidateListColumnWidth(key: CandidateListColumnKey, width: number): number {
    const min = candidateListColumnMinWidths[key];
    const max = candidateListColumnMaxWidths[key];
    return Math.min(max, Math.max(min, Math.round(width)));
}

function expandTableColumnWidths<T extends string>(
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

function HoverRevealText({
    text,
    className,
    tooltipClassName,
}: {
    text?: string | number | null;
    className?: string;
    tooltipClassName?: string;
}) {
    const value = String(text ?? "-").trim() || "-";

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className={cn("block min-w-0 truncate", className)}>{value}</span>
            </TooltipTrigger>
            <TooltipContent className={cn("max-w-md whitespace-pre-wrap break-all text-white", tooltipClassName)}>
                {value}
            </TooltipContent>
        </Tooltip>
    );
}

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
        jdSkillIds: [],
        screeningSkillIds: [],
        interviewSkillIds: [],
    };
}

// emptyLLMForm moved to LLMSettingsDialog

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

function parseSkillFrontmatter(content?: string | null) {
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

function normalizeSkillTaskName(value?: string | null) {
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

function extractSkillRuntimeMeta(skill: Partial<RecruitmentSkill> | null | undefined) {
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
    const tasks = Array.from(new Set(rawTaskValues.map((item) => normalizeSkillTaskName(item)).filter((item): item is "jd" | "screening" | "interview" => Boolean(item))));
    return { group, tasks };
}

function resolveTaskSkillIds(
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
    const groups = Array.from(new Set(
        ids
            .map((skillId) => extractSkillRuntimeMeta(skillMap.get(skillId)).group)
            .filter((value): value is string => Boolean(value)),
    ));
    if (!groups.length) {
        return ids;
    }
    const relatedIds = Array.from(new Set(
        Array.from(skillMap.values())
            .filter((skill) => {
                const meta = extractSkillRuntimeMeta(skill);
                return skill.is_enabled !== false && Boolean(meta.group) && groups.includes(meta.group) && meta.tasks.includes(taskKind);
            })
            .map((skill) => skill.id),
    ));
    return relatedIds.length ? relatedIds : ids;
}

function toggleSingleSkillId(current: number[], targetId: number) {
    return current.includes(targetId) ? [] : [targetId];
}

function sortSkillsForTaskPreference(
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

function parseStructuredLogOutput(value: unknown) {
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

function isLiveTaskStatus(status?: string | null) {
    return ["queued", "pending", "running", "cancelling"].includes(status || "");
}

function isTerminalTaskStatus(status?: string | null) {
    return ["success", "fallback", "failed", "cancelled"].includes(status || "");
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

function formatScoreValue(value?: number | null, scale?: number | null) {
    if (value === undefined || value === null || Number.isNaN(value)) {
        return "-";
    }
    const normalized = Number(value);
    const text = Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1).replace(/\.0$/, "");
    return scale === 10 ? `${text} / 10` : text;
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

function labelForTaskExecutionStatus(status?: string | null) {
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

function labelForResumeMailDispatchStatus(status?: string | null) {
    if (status === "sent") return "已发送";
    if (status === "failed") return "发送失败";
    if (status === "pending") return "发送中";
    return status || "未知状态";
}

interface RecruitmentAutomationContainerProps {
    onBack: () => void;
}

export default function RecruitmentAutomationContainer({ onBack }: RecruitmentAutomationContainerProps) {
    const sessionUser = useMemo(() => getStoredScriptHubSession()?.user ?? null, []);
    const jdGenerationInFlightRef = useRef(false);
    const screeningLaunchInFlightRef = useRef(false);
    const taskMonitorTimersRef = useRef<Map<number, number>>(new Map());
    const selectedLogIdRef = useRef<number | null>(null);
    const selectedPositionIdRef = useRef<number | null>(null);
    const selectedCandidateIdRef = useRef<number | null>(null);
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
    const [positionWorkspaceHeaderCollapsed, setPositionWorkspaceHeaderCollapsed] = useState(true);
    const [candidateFiltersCollapsed, setCandidateFiltersCollapsed] = useState(true);
    const [auditFiltersCollapsed, setAuditFiltersCollapsed] = useState(true);
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
    const [candidateListColumnWidths, setCandidateListColumnWidths] = useState<Record<CandidateListColumnKey, number>>(
        candidateListColumnDefaultWidths,
    );
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
    const [glmTemplateCreating, setGlmTemplateCreating] = useState(false);
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
            content: "我是 AI 招聘工作台助手。你可以直接让我生成 JD、查看岗位候选人、重新初筛某位候选人并追加硬性条件，或者说明这次对话实际使用了哪些 Skills。",
            createdAt: new Date().toISOString(),
        },
    ]);

    const [attachedFiles, setAttachedFiles] = useState<{ id: string; name: string; size: number; status: string }[]>([]);
    const [activeSettingsTab, setActiveSettingsTab] = useState<"skills" | "models" | "mail">("skills");

    const assistantScrollAnchorRef = useRef<HTMLDivElement | null>(null);
    const assistantScrollAreaRef = useRef<HTMLDivElement | null>(null);
    const assistantInputRef = useRef<HTMLTextAreaElement | null>(null);

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

    const [llmDialogOpen, setLlmDialogOpen] = useState(false);
    const [llmEditingId, setLlmEditingId] = useState<number | null>(null);
    const [mailSenderDialogOpen, setMailSenderDialogOpen] = useState(false);
    const [mailSenderEditingId, setMailSenderEditingId] = useState<number | null>(null);
    const [mailRecipientDialogOpen, setMailRecipientDialogOpen] = useState(false);
    const [mailRecipientEditingId, setMailRecipientEditingId] = useState<number | null>(null);
    const [resumeMailDialogOpen, setResumeMailDialogOpen] = useState(false);
    const [resumeMailDialogMode, setResumeMailDialogMode] = useState<ResumeMailDialogMode>("send");
    const [resumeMailSourceDispatchId, setResumeMailSourceDispatchId] = useState<number | null>(null);
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
    const existingGlmConfig = useMemo(() => {
        return llmConfigs.find((item) => item.provider === "glm") || null;
    }, [llmConfigs]);
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
    const positionInterviewSkillIds = candidateDetail?.candidate.position_interview_skill_ids || [];
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
            return resolveTaskSkillIds(workflowInterviewSkillIds, "interview", skillMap);
        }
        if (positionInterviewSkillIds.length) {
            return resolveTaskSkillIds(positionInterviewSkillIds, "interview", skillMap);
        }
        return [];
    }, [positionInterviewSkillIds, skillMap, workflowInterviewSkillIds]);
    const preferredInterviewSkillSourceLabel = workflowInterviewSkillIds.length
        ? "工作记忆中的面试题 Skills"
        : (candidateDetail?.candidate.position_interview_skill_ids?.length
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
    const isBatchScreeningCancelling = activeBatchScreeningTaskIds.length > 0
        && activeBatchScreeningTaskIds.every((taskId) => cancellingTaskIds.includes(taskId));
    const hasLiveLogActivity = useMemo(() => {
        return aiLogs.some((item) => isLiveTaskStatus(item.status));
    }, [aiLogs]);
    const hasLiveCandidateActivity = useMemo(() => {
        return (candidateDetail?.activity || []).some((item) => isLiveTaskStatus(item.status));
    }, [candidateDetail?.activity]);
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
                const current = stats.get(candidateId) || { sentCount: 0, failedCount: 0, latestSentAt: null };
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

    const positionSidebarSummary = useMemo(() => {
        return {
            recruiting: positions.filter((position) => position.status === "recruiting").length,
            todayNew: positions.filter((position) => isToday(position.created_at)).length,
        };
    }, [positions]);

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
        selectedPositionIdRef.current = selectedPositionId;
    }, [selectedPositionId]);

    useEffect(() => {
        selectedCandidateIdRef.current = selectedCandidateId;
    }, [selectedCandidateId]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            taskMonitorTimersRef.current.forEach((timerId) => window.clearInterval(timerId));
            taskMonitorTimersRef.current.clear();
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
        setPositionWorkspaceHeaderCollapsed(true);
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
            container.addEventListener("wheel", handleWheel, { passive: false, capture: true });
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

        tableScroller.addEventListener("scroll", syncFromTable, { passive: true });
        horizontalRail.addEventListener("scroll", syncFromRail, { passive: true });
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

        tableScroller.addEventListener("scroll", syncFromTable, { passive: true });
        horizontalRail.addEventListener("scroll", syncFromRail, { passive: true });

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
                style={{ width, minWidth: width, maxWidth: width }}
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
                toast.error(`加载候选人详情失败${error instanceof Error ? error.message : "未知错误"}`);
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
                toast.error(`加载 AI 任务失败${error instanceof Error ? error.message : "未知错误"}`);
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
                toast.error(`加载任务详情失败${error instanceof Error ? error.message : "未知错误"}`);
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
            setMailSenderDeleteTarget(null); // Added missing prop
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

    function navigateToSettingsPage(page: "settings-skills" | "settings-models" | "settings-mail") {
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
            window.clearInterval(timerId);
            taskMonitorTimersRef.current.delete(taskId);
        }
    }

    function updateChatMessage(messageId: string, updater: (message: ChatMessage) => ChatMessage) {
        setChatMessages((current) => current.map((message) => (
            message.id === messageId ? updater(message) : message
        )));
    }

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
        const poll = async () => {
            if (polling || !mountedRef.current) {
                return;
            }
            polling = true;
            try {
                const log = await recruitmentApi<AITaskLog>(`/ai-task-logs/${taskId}`);
                if (!mountedRef.current) {
                    return;
                }
                mergeAiTaskLog(log);
                if (selectedLogIdRef.current === taskId) {
                    setSelectedLogDetail(log);
                }
                onUpdate?.(log);
                if (isTerminalTaskStatus(log.status)) {
                    stopTaskMonitor(taskId);
                    await onFinish?.(log);
                }
            } catch {
                // Ignore transient polling errors and retry on the next tick.
            } finally {
                polling = false;
            }
        };

        void poll();
        const timerId = window.setInterval(() => {
            void poll();
        }, 1200);
        taskMonitorTimersRef.current.set(taskId, timerId);
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
            jdSkillIds: positionDetail.position.jd_skill_ids || [],
            screeningSkillIds: positionDetail.position.screening_skill_ids || [],
            interviewSkillIds: positionDetail.position.interview_skill_ids || [],
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
            toast.success("岗位已删除");
            setPositionDeleteConfirmOpen(false);
            setPositionDetail(null);
            setSelectedPositionId(null);
            try {
                await Promise.all([loadPositions(), loadDashboard(), loadCandidates(), loadLogs()]);
            } catch (refreshError) {
                toast.error(`岗位已删除，但页面刷新失败：${formatActionError(refreshError)}`);
            }
        } catch (error) {
            toast.error(`删除岗位失败：${formatActionError(error)}`);
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
            await loadLogs({ silent: true });
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
                            loadLogs({ silent: true }),
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
                            loadLogs({ silent: true }),
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
                    await loadLogs({ silent: true });
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
                const logs = await Promise.all(activeBatchScreeningTaskIds.map((taskId) => cancelTaskGeneration(taskId, "批量初筛", { silent: true })));
                const cancelledTaskIds = logs
                    .filter((log): log is AITaskLog => Boolean(log && log.status === "cancelled"))
                    .map((log) => log.id);
                if (cancelledTaskIds.length) {
                    cancelledTaskIds.forEach((taskId) => stopTaskMonitor(taskId));
                    setActiveBatchScreeningTaskIds((current) => current.filter((taskId) => !cancelledTaskIds.includes(taskId)));
                    setActiveScreeningTaskMap((current) => {
                        const next = { ...current };
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
                        const next = { ...current };
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
                    setActiveScreeningTaskMap((current) => ({
                        ...current,
                        [candidateId]: task.task_id,
                    }));
                    if (isBatchRequest) {
                        setActiveBatchScreeningTaskIds((current) => Array.from(new Set([...current, task.task_id])));
                    }
                    startTaskMonitor(task.task_id, {
                        onFinish: async (log) => {
                            if (!mountedRef.current) {
                                return;
                            }
                            setActiveScreeningTaskMap((current) => {
                                const next = { ...current };
                                if (next[candidateId] === task.task_id) {
                                    delete next[candidateId];
                                }
                                return next;
                            });
                            setActiveBatchScreeningTaskIds((current) => current.filter((item) => item !== task.task_id));
                            await Promise.all([loadCandidates(), loadDashboard(), loadLogs({ silent: true })]);
                            if (selectedCandidateIdRef.current === candidateId) {
                                await loadCandidateDetail(candidateId, { silent: true });
                            }
                            if (!isBatchRequest) {
                                if (log.status === "success" || log.status === "fallback") {
                                    toast.success(log.status === "fallback" ? "初筛已完成（兜底完成）" : "初筛已完成");
                                } else if (log.status === "cancelled") {
                                    toast.success("已停止初筛");
                                } else if (log.status === "failed") {
                                    toast.error(`初筛失败：${log.error_message || "未知错误"}`);
                                }
                            }
                        },
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
            await loadLogs({ silent: true });
            startTaskMonitor(task.task_id, {
                onFinish: async (log) => {
                    if (!mountedRef.current) {
                        return;
                    }
                    setActiveInterviewTaskId((current) => (current === task.task_id ? null : current));
                    setActiveInterviewCandidateId((current) => (current === candidateId ? null : current));
                    await Promise.all([
                        loadLogs({ silent: true }),
                        selectedCandidateIdRef.current === candidateId
                            ? loadCandidateDetail(candidateId, { silent: true })
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
        if (activeChatTaskId) {
            if (isCurrentChatTaskCancelling) {
                return;
            }
            try {
                if (activeChatMessageId) {
                    updateChatMessage(activeChatMessageId, (message) => ({
                        ...message,
                        content: "正在停止生成...",
                    }));
                }
                const log = await cancelTaskGeneration(activeChatTaskId, "AI 助手");
                if (log?.status === "cancelled") {
                    stopTaskMonitor(activeChatTaskId);
                    if (activeChatMessageId) {
                        updateChatMessage(activeChatMessageId, (message) => ({
                            ...message,
                            content: "已停止生成。",
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
        if (chatSending) {
            return;
        }
        const message = chatInput.trim();
        if (!message) {
            return;
        }
        const userMessageId = `u-${Date.now()}`;
        setChatMessages((current) => [
            ...current,
            { id: userMessageId, role: "user", content: message, createdAt: new Date().toISOString() },
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
                await Promise.all([loadLogs({ silent: true }), loadDashboard()]);
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
            await loadLogs({ silent: true });
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
                    await Promise.all([loadLogs({ silent: true }), loadDashboard()]);
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
        } else {
            setMailSenderEditingId(null);
        }
        setMailSenderDialogOpen(true);
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
        } else {
            setMailRecipientEditingId(null);
        }
        setMailRecipientDialogOpen(true);
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
            await recruitmentApi(`/resume-mail-dispatches/send`, {
                method: "POST",
                body: JSON.stringify(payload),
            });
            toast.success(options?.successMessage || "简历邮件已发送")
            if (options?.closeDialog !== false) {
                setResumeMailDialogOpen(false);
            }
            try {
                await loadMailSettings();
            } catch (refreshError) {
                toast.error(`简历邮件已发送，但邮件中心刷新失败${formatActionError(refreshError)}`);
            }
            return true;
        } catch (error) {
            toast.error(`发送简历邮件失败${formatActionError(error)}`);
            return false;
        }
    }

    async function submitResumeMail() {
        if (!resumeMailForm.candidateIds.length) {
            toast.error("请先选择需要发送的候选人");
            return;
        }
        const extraEmails = parseEmailList(resumeMailForm.extraRecipientEmails);
        if (!resumeMailForm.recipientIds.length && !extraEmails.length) {
            toast.error("请至少选择一个内部收件人或填写一个收件人邮箱");
            return;
        }
        setResumeMailSubmitting(true);
        try {
            await sendResumeMailRequest(
                {
                    sender_config_id: resumeMailForm.senderConfigId ? Number(resumeMailForm.senderConfigId) : null,
                    candidate_ids: resumeMailForm.candidateIds,
                    recipient_ids: resumeMailForm.recipientIds,
                    recipient_emails: extraEmails,
                    subject: resumeMailForm.subject.trim() || null,
                    body_text: resumeMailForm.bodyText.trim() || null,
                },
                { successMessage: resumeMailDialogMode === "resend" ? "简历邮件已再次发送" : "简历邮件已发送" },
            );
        } finally {
            setResumeMailSubmitting(false);
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
                { successMessage: "失败记录已重试发送", closeDialog: false },
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
        } else {
            setSkillEditingId(null);
        }
        setSkillDialogOpen(true);
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
        } else {
        setLlmEditingId(null);
        }
        setLlmDialogOpen(true);
    }

    function renderAssistantConsole(mode: AssistantDisplayMode = "drawer") {
        return (
            <AssistantPage
                chatMessages={chatMessages}
                chatInput={chatInput}
                setChatInput={setChatInput}
                chatSending={chatSending}
                chatContext={chatContext}
                positions={positions}
                skills={skills}
                llmConfigs={llmConfigs}
                attachedFiles={attachedFiles as any}
                addAttachedFiles={(files) => {
                    const fileList = Array.from(files);
                    addAttachedFiles(fileList);
                }}
                removeAttachedFile={(index) => {
                    setAttachedFiles(current => current.filter((_, i) => i !== index));
                }}
                activeChatTaskId={activeChatTaskId}
                isCurrentChatTaskCancelling={isCurrentChatTaskCancelling}
                assistantDisplayMode={mode}
                assistantOpen={assistantOpen}
                activePage={activePage}
                assistantScrollAreaRef={assistantScrollAreaRef}
                assistantScrollAnchorRef={assistantScrollAnchorRef}
                assistantInputRef={assistantInputRef}
                assistantModelLabel={assistantModelLabel}
                chatContextCandidateLabel={chatContextCandidateLabel}
                effectiveLLMConfigs={effectiveLLMConfigs}
                sendChatMessage={sendChatMessage}
                saveChatContext={saveChatContext}
                toggleSkillInAssistant={toggleSkillInAssistant}
                openAssistantMode={openAssistantMode}
                applyAssistantPrompt={applyAssistantPrompt}
                queueAssistantInputFocus={queueAssistantInputFocus}
                openTaskLogDetail={openTaskLogDetail}
                setActivePage={(p) => setActivePage(p)}
            />
        );
    }

    function renderPage() {
        switch (activePage) {
            case "workspace":
                return (
                    <WorkspacePage
                        dashboard={dashboard}
                        todayNewResumes={todayNewResumes}
                        todoSummary={todoSummary}
                        recentCandidates={recentCandidates}
                        recentLogs={recentLogs}
                        panelClass={panelClass}
                        assistantOpen={assistantOpen}
                        setActivePage={(p) => setActivePage(p)}
                        setSelectedCandidateId={setSelectedCandidateId}
                        setSelectedLogId={setSelectedLogId}
                        openAssistantMode={openAssistantMode}
                        openCreatePosition={openCreatePosition}
                        setResumeUploadOpen={setResumeUploadOpen}
                        renderAssistantConsole={renderAssistantConsole}
                        renderAssistantSuspendedState={() => null}
                        labelForCandidateStatus={labelForCandidateStatus}
                    />
                );
            case "positions":
                return (
                    <PositionsPage
                        panelClass={panelClass}
                        positionListCollapsed={positionListCollapsed}
                        setPositionListCollapsed={setPositionListCollapsed}
                        positions={positions}
                        positionsLoading={positionsLoading}
                        positionDetailLoading={positionDetailLoading}
                        positionDetail={positionDetail}
                        selectedPositionId={selectedPositionId}
                        setSelectedPositionId={setSelectedPositionId}
                        openCreatePosition={openCreatePosition}
                        openEditPosition={openEditPosition}
                        setPositionDeleteConfirmOpen={setPositionDeleteConfirmOpen}
                        setPublishDialogOpen={setPublishDialogOpen}
                        jdDraft={jdDraft}
                        setJdDraft={setJdDraft}
                        jdViewMode={jdViewMode}
                        setJdViewMode={setJdViewMode}
                        isJDGenerating={isJDGenerating}
                        jdGenerationStatus={jdGenerationStatus}
                        setJdGenerationStatus={setJdGenerationStatus}
                        latestJDGenerationError={latestJDGenerationError}
                        setJdGenerationError={setJdGenerationError}
                        jdExtraPrompt={jdExtraPrompt}
                        setJdExtraPrompt={setJdExtraPrompt}
                        currentJDVersion={currentJDVersion}
                        currentPreviewHtml={currentPreviewHtml}
                        currentPublishText={currentPublishText}
                        isJDDraftDirty={isJDDraftDirty}
                        currentPositionJDTaskId={currentPositionJDTaskId}
                        activeJDTaskId={activeJDTaskId}
                        setActiveJDTaskId={setActiveJDTaskId}
                        setActiveJDPositionId={setActiveJDPositionId}
                        triggerJDGeneration={triggerJDGeneration}
                        isTaskCancelling={isTaskCancelling}
                        positionDeleting={positionDeleting}
                        canManageRecruitment={canManageRecruitment}
                    />
                );
            case "candidates":
                return (
                    <CandidatesPage
                        panelClass={panelClass}
                        candidateFiltersCollapsed={candidateFiltersCollapsed}
                        setCandidateFiltersCollapsed={setCandidateFiltersCollapsed}
                        candidateFilterSummary={candidateFilterSummary}
                        candidateViewMode={candidateViewMode}
                        setCandidateViewMode={setCandidateViewMode}
                        candidateQuery={candidateQuery}
                        setCandidateQuery={setCandidateQuery}
                        candidatePositionFilter={candidatePositionFilter}
                        setCandidatePositionFilter={setCandidatePositionFilter}
                        positions={positions}
                        candidateStatusFilter={candidateStatusFilter}
                        setCandidateStatusFilter={setCandidateStatusFilter}
                        candidateMatchFilter={candidateMatchFilter}
                        setCandidateMatchFilter={setCandidateMatchFilter}
                        candidateSourceFilter={candidateSourceFilter}
                        setCandidateSourceFilter={setCandidateSourceFilter}
                        sourceOptions={sourceOptions}
                        candidateTimeFilter={candidateTimeFilter}
                        setCandidateTimeFilter={setCandidateTimeFilter}
                        visibleCandidates={visibleCandidates}
                        candidatesLoading={candidatesLoading}
                        selectedCandidateIds={selectedCandidateIds}
                        setSelectedCandidateIds={setSelectedCandidateIds}
                        selectedCandidateId={selectedCandidateId}
                        setSelectedCandidateId={(id) => setSelectedCandidateId(id)}
                        toggleCandidateSelection={toggleCandidateSelection}
                        candidateListScrollRef={candidateListScrollRef}
                        candidateListHorizontalRailRef={candidateListHorizontalRailRef}
                        candidateListTableWidth={candidateListTableWidth}
                        candidateListDisplayColumnWidths={candidateListDisplayColumnWidths}
                        renderCandidateListHeaderCell={renderCandidateListHeaderCell}
                        groupedCandidates={groupedCandidates}
                        triggerScreening={triggerScreening}
                        isBatchScreeningCancelling={isBatchScreeningCancelling}
                        screeningSubmitting={screeningSubmitting}
                        isBatchScreeningRunning={isBatchScreeningRunning}
                        openResumeMailDialog={openResumeMailDialog}
                        isSelectedCandidateScreeningCancelling={isSelectedCandidateScreeningCancelling}
                        selectedCandidateScreeningTaskId={selectedCandidateScreeningTaskId}
                        generateInterviewQuestions={generateInterviewQuestions}
                        isCurrentInterviewTaskCancelling={isCurrentInterviewTaskCancelling}
                        currentCandidateInterviewTaskId={currentCandidateInterviewTaskId}
                        openResumeFile={openResumeFile}
                        downloadInterviewQuestion={downloadInterviewQuestion}
                        candidateDetailLoading={candidateDetailLoading}
                        candidateDetail={candidateDetail}
                        candidateEditor={candidateEditor}
                        setCandidateEditor={setCandidateEditor}
                        saveCandidate={saveCandidate}
                        pendingStatus={pendingCandidateStatus}
                        setPendingStatus={setPendingCandidateStatus}
                        updateCandidateStatus={updateCandidateStatus}
                        statusUpdateReason={candidateStatusUpdateReason}
                        setStatusUpdateReason={setCandidateStatusUpdateReason}
                        labelForCandidateStatus={labelForCandidateStatus}
                    />
                );
            case "audit":
                return (
                    <AuditPage
                        panelClass={panelClass}
                        auditFiltersCollapsed={auditFiltersCollapsed}
                        setAuditFiltersCollapsed={setAuditFiltersCollapsed}
                        auditFilterSummary={auditFilterSummary}
                        logTaskTypeFilter={logTaskTypeFilter}
                        setLogTaskTypeFilter={setLogTaskTypeFilter}
                        logStatusFilter={logStatusFilter}
                        setLogStatusFilter={setLogStatusFilter}
                        aiLogs={recentLogs}
                        logsLoading={logsLoading}
                        selectedLogId={selectedLogId}
                        setSelectedLogId={setSelectedLogId}
                        loadLogs={loadLogs}
                        logDetail={selectedLogDetail}
                        logDetailLoading={logDetailLoading}
                    />
                );
            case "assistant":
                return renderAssistantConsole("page");
            case "settings":
                if (activeSettingsTab === "skills") {
                    return (
                        <SkillSettingsPage
                            panelClass={panelClass}
                            skills={skills}
                            skillsLoading={skillsLoading}
                            openSkillEditor={openSkillEditor}
                            deleteSkill={deleteSkill}
                            loadSkills={loadSkills}
                        />
                    );
                }
                if (activeSettingsTab === "models") {
                    return (
                        <ModelSettingsPage
                            panelClass={panelClass}
                            llmConfigs={llmConfigs}
                            modelsLoading={modelsLoading}
                            openLLMEditor={openLLMEditor}
                            deleteLLMConfig={deleteLLMConfig}
                            setPreferredLLMConfig={setPreferredLLMConfig}
                            loadLLMConfigs={loadLLMConfigs}
                        />
                    );
                }
                if (activeSettingsTab === "mail") {
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
                            mailDispatchActionKey={deleteActionKey || ""}
                            selectedCandidateIds={selectedCandidateIds}
                            selectedCandidateId={selectedCandidateId}
                            openMailSenderEditor={openMailSenderEditor}
                            openMailRecipientEditor={openMailRecipientEditor}
                            openResumeMailDialog={openResumeMailDialog}
                            openResumeMailReplayDialog={openResumeMailReplayDialog}
                            retryResumeMailDispatch={retryResumeMailDispatch}
                            setMailSenderDeleteTarget={(s) => setMailSenderDeleteTarget(s)}
                            setMailRecipientDeleteTarget={(r) => setMailRecipientDeleteTarget(r)}
                            refreshMailSettingsWithFeedback={async () => { await loadMailSettings(); }}
                        />
                    );
                }
                return null;
            default:
                return null;
        }
    }

    async function addAttachedFiles(files: File[]) {
        const newFiles = files.map(file => ({
            id: Math.random().toString(36).substring(7),
            name: file.name,
            size: file.size,
            status: "ready"
        }));
        setAttachedFiles(current => [...current, ...newFiles]);
    }

    async function removeAttachedFile(fileId: string) {
        setAttachedFiles(current => current.filter(f => f.id !== fileId));
    }

    return (
        <div className="flex h-screen max-h-screen min-h-0 min-w-0 bg-[#F9FBFC] text-slate-900 dark:bg-[#020617] dark:text-slate-100">
            <div className={cn(
                "group relative flex flex-col border-r border-slate-200/80 bg-white pt-6 transition-[width] duration-300 dark:border-slate-800 dark:bg-slate-950",
                sidebarCollapsed ? "w-20" : "w-72"
            )}>
                <div className="flex items-center justify-between px-6 pb-6">
                    {!sidebarCollapsed && <h1 className="text-xl font-bold tracking-tight">AI 招聘中心</h1>}
                    <Button variant="ghost" size="icon" onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="mx-auto">
                        <Rocket className="h-5 w-5" />
                    </Button>
                </div>
                <div className="flex-1 space-y-2 px-3 overflow-y-auto">
                    <SectionNavButton icon={LayoutDashboard} title="工作台" description="数据大屏" active={activePage === "workspace"} collapsed={sidebarCollapsed} onClick={() => setActivePage("workspace")} />
                    <SectionNavButton icon={Briefcase} title="岗位" description="JD 与流程" active={activePage === "positions"} count={positions.length} collapsed={sidebarCollapsed} onClick={() => setActivePage("positions")} />
                    <SectionNavButton icon={Users} title="候选人" description="人才库评估" active={activePage === "candidates"} count={candidates.length} collapsed={sidebarCollapsed} onClick={() => setActivePage("candidates")} />
                    <SectionNavButton icon={ShieldAlert} title="日志" description="AI 审计线索" active={activePage === "audit"} collapsed={sidebarCollapsed} onClick={() => setActivePage("audit")} />
                    <SectionNavButton icon={Settings2} title="设置" description="模型与 Skill" active={activePage === "settings"} collapsed={sidebarCollapsed} onClick={() => { setActivePage("settings"); setActiveSettingsTab("skills"); }} />
                </div>
            </div>

            <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex-1 min-h-0 overflow-auto bg-slate-50/50 dark:bg-slate-950/50">
                    {renderPage()}
                </div>
            </main>

            <Dialog open={resumeUploadOpen} onOpenChange={setResumeUploadOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>上传简历</DialogTitle>
                        <DialogDescription>批量上传并关联岗位。</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => setResumeUploadOpen(false)}>关闭</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <SkillSettingsDialog open={skillDialogOpen} onOpenChange={setSkillDialogOpen} skill={skillEditingId ? skillMap.get(skillEditingId) || null : null} onSuccess={loadSkills} />
            <LLMSettingsDialog open={llmDialogOpen} onOpenChange={setLlmDialogOpen} config={llmEditingId ? llmConfigs.find(c => c.id === llmEditingId) || null : null} onSuccess={loadLLMConfigs} />
            <MailSenderSettingsDialog open={mailSenderDialogOpen} onOpenChange={setMailSenderDialogOpen} config={mailSenderEditingId ? mailSenderConfigs.find(c => c.id === mailSenderEditingId) || null : null} onSuccess={async () => { await loadMailSettings(); }} />
            <MailRecipientSettingsDialog open={mailRecipientDialogOpen} onOpenChange={setMailRecipientDialogOpen} recipient={mailRecipientEditingId ? mailRecipients.find(c => c.id === mailRecipientEditingId) || null : null} onSuccess={async () => { await loadMailSettings(); }} />
            
            <Dialog open={positionDeleteConfirmOpen} onOpenChange={setPositionDeleteConfirmOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPositionDeleteConfirmOpen(false)}>取消</Button>
                        <Button variant="destructive" onClick={() => void deletePosition()}>确认删除</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
