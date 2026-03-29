import {NextRequest, NextResponse} from "next/server";

import {getBackendBaseUrl} from "@/lib/server/backendBaseUrl";
import {requireScriptHubPermission} from "@/lib/server/scriptHubSession";
import type {
    AITaskLog,
    CandidateSummary,
    InterviewQuestion,
    PositionSummary,
    RecruitmentMailRecipient,
    RecruitmentSkill,
} from "@/lib/recruitment-api";
import {
    DEFAULT_QUERY_CANDIDATES_LIMIT,
    MAX_QUERY_CANDIDATES_LIMIT,
    type RecruitmentAssistantClarificationRequest,
    type RecruitmentAssistantCountCandidatesArgs,
    type RecruitmentAssistantCountCandidatesResult,
    type RecruitmentAssistantEntityMatch,
    type RecruitmentAssistantEntityType,
    type RecruitmentAssistantMatchSource,
    type RecruitmentAssistantPageInfo,
    type RecruitmentAssistantQueryCandidatesArgs,
    type RecruitmentAssistantQueryCandidatesResult,
    type RecruitmentAssistantQueryMailRecipientsArgs,
    type RecruitmentAssistantQueryPositionsArgs,
    type RecruitmentAssistantResolveEntitiesResult,
    type RecruitmentAssistantResolvedEntity,
    type RecruitmentAssistantRunRequest,
    type RecruitmentAssistantStreamEventType,
} from "@/lib/recruitment-assistant-protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ApiEnvelope<T> {
    success?: boolean;
    data?: T;
    error?: string;
    detail?: string;
}

type AssistantIntent =
    | { kind: "count_candidates"; args: RecruitmentAssistantCountCandidatesArgs }
    | { kind: "query_candidates"; args: RecruitmentAssistantQueryCandidatesArgs }
    | { kind: "query_positions"; args: RecruitmentAssistantQueryPositionsArgs }
    | { kind: "query_mail_recipients"; args: RecruitmentAssistantQueryMailRecipientsArgs }
    | {
        kind: "generate_interview_questions";
        args: {
            round_name: string;
            custom_requirements: string;
            resolved_skill_filter: {
                skill_ids: number[];
                skill_names: string[];
                source: "explicit" | "default_context" | "resolved_entity" | "none";
            };
        };
    };

type PositionRecord = Pick<PositionSummary, "id" | "title" | "department" | "status" | "updated_at">;
type CandidateRecord = Pick<CandidateSummary, "id" | "name" | "position_id" | "position_title" | "status" | "match_percent" | "updated_at" | "source">;
type RecipientRecord = Pick<RecruitmentMailRecipient, "id" | "name" | "email" | "department" | "role_title" | "is_enabled">;
type SkillRecord = Pick<RecruitmentSkill, "id" | "name" | "description" | "is_enabled">;

function stringifyError(value: unknown): string {
    if (!value) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        return stringifyError(record.error) || stringifyError(record.detail) || stringifyError(record.message) || JSON.stringify(record);
    }
    return String(value);
}

async function backendRecruitmentApi<T>(
    request: NextRequest,
    path: string,
    init: RequestInit = {},
) {
    const headers = new Headers(init.headers);
    const authorization = request.headers.get("authorization");
    if (authorization) {
        headers.set("Authorization", authorization);
    }
    headers.set("Accept", "application/json");

    const response = await fetch(`${getBackendBaseUrl()}/recruitment/${path}`, {
        ...init,
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(120000),
    });
    const raw = await response.text();
    let payload: ApiEnvelope<T> | null = null;
    if (raw) {
        try {
            payload = JSON.parse(raw) as ApiEnvelope<T>;
        } catch {
            payload = null;
        }
    }
    if (!response.ok || (payload && payload.success === false)) {
        throw new Error(stringifyError(payload?.error) || stringifyError(payload?.detail) || raw || `Request failed (${response.status})`);
    }
    return payload?.data as T;
}

function normalizeText(value: string | null | undefined) {
    return String(value || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[，。、“”"'`~!@#$%^&*()_+\-={}[\]|\\:;<>?,./]/g, "");
}

function buildMatch(label: string, id: string | number, score: number, source: RecruitmentAssistantMatchSource): RecruitmentAssistantEntityMatch {
    return {id, label, score, source};
}

function findMatchesByContainment<T extends { id: string | number; label: string }>(
    message: string,
    entries: T[],
    source: RecruitmentAssistantMatchSource,
) {
    const normalizedMessage = normalizeText(message);
    return entries
        .map((entry) => {
            const normalizedLabel = normalizeText(entry.label);
            if (!normalizedLabel || normalizedLabel.length < 2 || !normalizedMessage.includes(normalizedLabel)) {
                return null;
            }
            const score = normalizedLabel.length / Math.max(normalizedMessage.length, normalizedLabel.length);
            return buildMatch(entry.label, entry.id, Number(score.toFixed(4)), source);
        })
        .filter(Boolean) as RecruitmentAssistantEntityMatch[];
}

function createResolvedEntity(
    entityType: RecruitmentAssistantEntityType,
    query: string,
    matches: RecruitmentAssistantEntityMatch[],
    fallback?: RecruitmentAssistantEntityMatch,
): RecruitmentAssistantResolvedEntity {
    if (matches.length === 1) {
        return {
            entity_type: entityType,
            query,
            resolution_status: "unique",
            selected_id: matches[0].id,
            selected_label: matches[0].label,
            matches,
            source: matches[0].source,
        };
    }
    if (matches.length > 1) {
        return {
            entity_type: entityType,
            query,
            resolution_status: "ambiguous",
            matches,
        };
    }
    if (fallback) {
        return {
            entity_type: entityType,
            query,
            resolution_status: "unique",
            selected_id: fallback.id,
            selected_label: fallback.label,
            matches: [fallback],
            source: fallback.source,
        };
    }
    return {
        entity_type: entityType,
        query,
        resolution_status: "none",
        matches: [],
    };
}

function parseStatusFilters(message: string) {
    const normalized = normalizeText(message);
    const statusIn = new Set<string>();
    if (normalized.includes("已通过初筛") || normalized.includes("初筛通过")) {
        statusIn.add("screening_passed");
    }
    if (normalized.includes("未初筛") || normalized.includes("待初筛")) {
        statusIn.add("pending_screening");
    }
    if (normalized.includes("初筛淘汰")) {
        statusIn.add("screening_rejected");
    }
    if (normalized.includes("待面试")) {
        statusIn.add("pending_interview");
    }
    if (normalized.includes("已录用") || normalized.includes("已入职")) {
        statusIn.add("hired");
    }
    return Array.from(statusIn);
}

function isExecutionLikeMessage(message: string) {
    return /(生成|初筛|面试题|发送|发给|保存|创建|新建|覆盖|推进|更新状态|批量|写一份|起草|撰写|产出|整理)/i.test(message);
}

function encodeCursor(offset: number, limit: number) {
    return Buffer.from(JSON.stringify({offset, limit}), "utf8").toString("base64");
}

function decodeCursor(cursor?: string | null) {
    if (!cursor) {
        return {offset: 0, limit: DEFAULT_QUERY_CANDIDATES_LIMIT};
    }
    try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf8")) as { offset?: number; limit?: number };
        return {
            offset: Number.isFinite(parsed.offset) ? Math.max(0, Number(parsed.offset)) : 0,
            limit: Number.isFinite(parsed.limit) ? Math.min(MAX_QUERY_CANDIDATES_LIMIT, Math.max(1, Number(parsed.limit))) : DEFAULT_QUERY_CANDIDATES_LIMIT,
        };
    } catch {
        return {offset: 0, limit: DEFAULT_QUERY_CANDIDATES_LIMIT};
    }
}

function coerceNumericId(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function hasCurrentPositionContext(context: RecruitmentAssistantRunRequest["context"]) {
    return coerceNumericId(context.position_id) !== null || Boolean(normalizeText(context.position_title || ""));
}

function hasCurrentCandidateContext(context: RecruitmentAssistantRunRequest["context"]) {
    return coerceNumericId(context.candidate_id) !== null;
}

function isCurrentPositionIntent(intent: AssistantIntent) {
    return (intent.kind === "count_candidates" || intent.kind === "query_candidates")
        && intent.args.scope === "current_position";
}

function findCandidateFromContext(
    candidates: CandidateRecord[],
    context: RecruitmentAssistantRunRequest["context"],
) {
    const contextCandidateId = coerceNumericId(context.candidate_id);
    if (contextCandidateId === null) {
        return null;
    }
    return candidates.find((item) => Number(item.id) === contextCandidateId) || null;
}

function extractInterviewRequest(message: string) {
    const text = String(message || "").trim();
    const interviewKeywords = ["面试题", "初试题", "复试题", "面试问题", "出几道题", "来一套题", "出题", "生成题"];
    if (!text || !interviewKeywords.some((keyword) => text.includes(keyword))) {
        return null;
    }
    let customRequirements = "";
    for (const marker of ["硬性条件", "硬性要求", "重点", "侧重", "补充要求", "要求", "并且", "同时"]) {
        if (!text.includes(marker)) {
            continue;
        }
        const tail = text.split(marker, 2)[1]?.trim().replace(/^[：:，,.。；;\s]+/, "");
        if (tail) {
            customRequirements = tail;
            break;
        }
    }
    return {
        round_name: /复试|二面|第二轮/.test(text) ? "复试" : "初试",
        custom_requirements: customRequirements,
    };
}

function findPositionFromContext(
    positions: PositionRecord[],
    context: RecruitmentAssistantRunRequest["context"],
) {
    const contextPositionId = coerceNumericId(context.position_id);
    if (contextPositionId !== null) {
        const byId = positions.find((item) => Number(item.id) === contextPositionId);
        if (byId) {
            return byId;
        }
    }
    const normalizedTitle = normalizeText(context.position_title || "");
    if (!normalizedTitle) {
        return null;
    }
    return positions.find((item) => normalizeText(item.title) === normalizedTitle)
        || positions.find((item) => normalizeText(item.title).includes(normalizedTitle))
        || null;
}

function detectIntent(
    message: string,
    context: RecruitmentAssistantRunRequest["context"],
): AssistantIntent {
    const interviewRequest = extractInterviewRequest(message);
    if (interviewRequest) {
        return {
            kind: "generate_interview_questions",
            args: {
                round_name: interviewRequest.round_name,
                custom_requirements: interviewRequest.custom_requirements,
                resolved_skill_filter: {skill_ids: [], skill_names: [], source: "none"},
            },
        };
    }
    const statusIn = parseStatusFilters(message);
    const mentionsCandidates = /候选人|简历|人员|人选/.test(message);
    const mentionsPositions = /岗位|职位/.test(message);
    const mentionsRecipients = /收件人|邮箱|联系人/.test(message);
    const wantsCount = /多少|几位|几人|人数|总数/.test(message);
    const wantsList = /列出|列表|查看|看看|展示|有哪些|有谁/.test(message);
    const wantsCurrentPosition = /当前岗位|当前职位|本岗位|该岗位/.test(message);
    const resolvedScope = wantsCurrentPosition && hasCurrentPositionContext(context) ? "current_position" : "global";
    const requestedCurrentPosition = wantsCurrentPosition ? "current_position" : resolvedScope;

    if (mentionsRecipients) {
        return {
            kind: "query_mail_recipients",
            args: {
                fields: ["id", "name", "email", "department", "role_title"],
                limit: 8,
            },
        };
    }

    if (mentionsCandidates && wantsCount) {
        return {
            kind: "count_candidates",
            args: {
                scope: requestedCurrentPosition,
                status_in: statusIn,
                resolved_skill_filter: {skill_ids: [], skill_names: [], source: "none"},
            },
        };
    }

    if (mentionsPositions && !mentionsCandidates) {
        return {
            kind: "query_positions",
            args: {
                fields: ["id", "title", "department", "status", "updated_at"],
                limit: 8,
            },
        };
    }

    if (mentionsCandidates || (wantsList && wantsCurrentPosition)) {
        return {
            kind: "query_candidates",
            args: {
                scope: requestedCurrentPosition,
                status_in: statusIn,
                fields: ["id", "name", "position_title", "status", "match_percent", "updated_at"],
                sort: {field: "updated_at", order: "desc"},
                pagination: {limit: DEFAULT_QUERY_CANDIDATES_LIMIT},
                resolved_skill_filter: {skill_ids: [], skill_names: [], source: "none"},
            },
        };
    }

    return {
        kind: "count_candidates",
        args: {
            scope: requestedCurrentPosition,
            status_in: statusIn,
            resolved_skill_filter: {skill_ids: [], skill_names: [], source: "none"},
        },
    };
}

function getMissingCurrentPositionMessage(
    intent: AssistantIntent,
    resolution: RecruitmentAssistantResolveEntitiesResult,
    context: RecruitmentAssistantRunRequest["context"],
) {
    const needsCurrentPosition = isCurrentPositionIntent(intent);
    if (!needsCurrentPosition) {
        return null;
    }
    if (hasCurrentPositionContext(context)) {
        return null;
    }
    const hasResolvedPosition = resolution.resolved.some(
        (item) => item.entity_type === "position" && item.resolution_status === "unique" && item.selected_id,
    );
    if (hasResolvedPosition) {
        return null;
    }
    return "你提到了“当前岗位”，但当前还没有选定岗位。请先在顶部岗位上下文里选择一个岗位，或直接在消息里写明岗位名称。";
}

async function resolveEntities(
    request: NextRequest,
    runRequest: RecruitmentAssistantRunRequest,
    intent: AssistantIntent,
) {
    const positions = await backendRecruitmentApi<PositionRecord[]>(request, "positions");
    const skills = await backendRecruitmentApi<SkillRecord[]>(request, "skills");
    const shouldResolveCandidates = intent.kind === "generate_interview_questions"
        || hasCurrentCandidateContext(runRequest.context)
        || /当前候选人|当前人选|这位候选人|这个候选人/.test(runRequest.message);
    const candidates = shouldResolveCandidates
        ? await backendRecruitmentApi<CandidateRecord[]>(request, "candidates")
        : [];

    const positionMatches = findMatchesByContainment(
        runRequest.message,
        positions.map((item) => ({id: item.id, label: item.title})),
        "explicit",
    );

    const forcedSelections = new Map(
        (runRequest.clarification_response?.selections || []).map((selection) => [selection.entity_type, selection.selected_id]),
    );

    const defaultPosition = findPositionFromContext(positions, runRequest.context);
    const defaultCandidate = findCandidateFromContext(candidates, runRequest.context);

    const resolvedPosition = forcedSelections.has("position")
        ? createResolvedEntity(
            "position",
            runRequest.message,
            positionMatches.filter((item) => item.id === forcedSelections.get("position")),
            positions.find((item) => item.id === forcedSelections.get("position"))
                ? buildMatch(
                    positions.find((item) => item.id === forcedSelections.get("position"))!.title,
                    positions.find((item) => item.id === forcedSelections.get("position"))!.id,
                    1,
                    "clarification",
                )
                : (defaultPosition ? buildMatch(defaultPosition.title, defaultPosition.id, 1, "default_context") : undefined),
        )
        : createResolvedEntity(
            "position",
            runRequest.message,
            positionMatches,
            defaultPosition ? buildMatch(defaultPosition.title, defaultPosition.id, 1, "default_context") : undefined,
        );

    const candidateMatches = findMatchesByContainment(
        runRequest.message,
        candidates.map((item) => ({id: item.id, label: item.name})),
        "explicit",
    );

    const resolvedCandidate = forcedSelections.has("candidate")
        ? createResolvedEntity(
            "candidate",
            runRequest.message,
            candidateMatches.filter((item) => item.id === forcedSelections.get("candidate")),
            candidates.find((item) => item.id === forcedSelections.get("candidate"))
                ? buildMatch(
                    candidates.find((item) => item.id === forcedSelections.get("candidate"))!.name,
                    candidates.find((item) => item.id === forcedSelections.get("candidate"))!.id,
                    1,
                    "clarification",
                )
                : (defaultCandidate ? buildMatch(defaultCandidate.name, defaultCandidate.id, 1, "default_context") : undefined),
        )
        : createResolvedEntity(
            "candidate",
            runRequest.message,
            candidateMatches,
            defaultCandidate ? buildMatch(defaultCandidate.name, defaultCandidate.id, 1, "default_context") : undefined,
        );

    const explicitSkillMatches = findMatchesByContainment(
        runRequest.message,
        skills.filter((item) => item.is_enabled).map((item) => ({id: item.id, label: item.name})),
        "explicit",
    );

    const defaultSkillMatches = skills
        .filter((item) => runRequest.context.skill_ids.includes(item.id))
        .map((item) => buildMatch(item.name, item.id, 1, "default_context"));

    const resolvedSkills = explicitSkillMatches.length
        ? explicitSkillMatches
        : defaultSkillMatches;

    const resolved: RecruitmentAssistantResolvedEntity[] = [];
    if (positionMatches.length || defaultPosition) {
        resolved.push(resolvedPosition);
    }
    if (intent.kind === "generate_interview_questions" || candidateMatches.length || defaultCandidate) {
        resolved.push(resolvedCandidate);
    }
    if (resolvedSkills.length) {
        resolved.push({
            entity_type: "skill",
            query: runRequest.message,
            resolution_status: "unique",
            matches: resolvedSkills,
            selected_id: resolvedSkills[0]?.id,
            selected_label: resolvedSkills.map((item) => item.label).join(", "),
            source: explicitSkillMatches.length ? "explicit" : "default_context",
        });
    }

    if (intent.kind === "query_mail_recipients") {
        const recipients = await backendRecruitmentApi<RecipientRecord[]>(request, "mail-recipients");
        const recipientMatches = findMatchesByContainment(
            runRequest.message,
            recipients.filter((item) => item.is_enabled).flatMap((item) => ([
                {id: item.id, label: item.name},
                {id: item.id, label: item.email},
            ])),
            "explicit",
        );
        if (recipientMatches.length) {
            resolved.push(createResolvedEntity("recipient", runRequest.message, recipientMatches));
        }
    }

    const clarificationTarget = resolved.find((item) => item.entity_type !== "skill" && item.resolution_status === "ambiguous");
    console.info("[recruitment][assistant][stream][resolve]", JSON.stringify({
        message: runRequest.message,
        raw_context_position_id: runRequest.context.position_id ?? null,
        raw_context_position_title: runRequest.context.position_title ?? null,
        raw_context_candidate_id: runRequest.context.candidate_id ?? null,
        default_position: defaultPosition ? {id: defaultPosition.id, title: defaultPosition.title} : null,
        default_candidate: defaultCandidate ? {id: defaultCandidate.id, name: defaultCandidate.name} : null,
        resolved,
        scope: "scope" in intent.args ? intent.args.scope : null,
    }));
    return {
        resolution: {
            resolved,
            requires_clarification: Boolean(clarificationTarget),
        } satisfies RecruitmentAssistantResolveEntitiesResult,
        positions,
        skills,
        candidates,
        clarificationTarget,
    };
}

function buildClarificationRequest(
    target: RecruitmentAssistantResolvedEntity,
    originalMessage: string,
): RecruitmentAssistantClarificationRequest {
    return {
        clarification_id: crypto.randomUUID(),
        entity_type: target.entity_type,
        question: `我匹配到了多个${target.entity_type === "position" ? "岗位" : target.entity_type === "recipient" ? "联系人" : target.entity_type === "candidate" ? "候选人" : "对象"}，请先确认你指的是哪一个。`,
        options: target.matches.slice(0, 5),
        allow_multiple: false,
        original_message: originalMessage,
    };
}

function buildPageInfo(total: number, offset: number, limit: number, returned: number): RecruitmentAssistantPageInfo {
    const hasMore = offset + returned < total;
    return {
        limit,
        offset,
        returned,
        total,
        has_more: hasMore,
        next_cursor: hasMore ? encodeCursor(offset + returned, limit) : null,
    };
}

function filterCandidates(
    candidates: CandidateRecord[],
    args: RecruitmentAssistantCountCandidatesArgs | RecruitmentAssistantQueryCandidatesArgs,
) {
    return candidates.filter((item) => {
        if (args.position_ids?.length && !args.position_ids.includes(item.position_id || -1)) {
            return false;
        }
        if (args.status_in?.length && !args.status_in.includes(item.status)) {
            return false;
        }
        if (args.status_not_in?.length && args.status_not_in.includes(item.status)) {
            return false;
        }
        if (args.keyword) {
            const keyword = normalizeText(args.keyword);
            if (!normalizeText(item.name).includes(keyword) && !normalizeText(item.position_title).includes(keyword)) {
                return false;
            }
        }
        return true;
    });
}

function resolveSkillFilter(resolution: RecruitmentAssistantResolveEntitiesResult) {
    const skillEntity = resolution.resolved.find((item) => item.entity_type === "skill");
    return {
        skill_ids: skillEntity?.matches.map((item) => Number(item.id)) || [],
        skill_names: skillEntity?.matches.map((item) => item.label) || [],
        source: skillEntity?.source === "explicit"
            ? "explicit"
            : skillEntity?.source === "default_context"
                ? "default_context"
                : skillEntity?.source === "clarification"
                    ? "resolved_entity"
                    : "none",
    } as const;
}

function describeResolutionContext(
    resolution: RecruitmentAssistantResolveEntitiesResult,
    context: RecruitmentAssistantRunRequest["context"],
    options?: { positionLabel?: string | null },
) {
    const positionLabel = options?.positionLabel ?? null;
    const skillEntity = resolution.resolved.find((item) => item.entity_type === "skill");
    const skillNames = skillEntity?.matches.map((item) => item.label).filter(Boolean) || [];

    const parts: string[] = [];
    parts.push(positionLabel ? `范围：${positionLabel}` : "范围：全局");
    if (skillNames.length) {
        parts.push(`Skills：${skillNames.join("、")}（${skillEntity?.source === "explicit" ? "本轮显式指定" : "默认上下文"}）`);
    }
    return parts.join("；");
}

function buildExecutionDebug(
    intent: AssistantIntent,
    context: RecruitmentAssistantRunRequest["context"],
    resolution: RecruitmentAssistantResolveEntitiesResult,
    options: {
        resolvedPositionIds: number[];
        fallbackContextPositionId: number | null;
        finalQueryPositionIds: number[];
        branch: string;
        resolvedCandidateId?: number | null;
        fallbackContextCandidateId?: number | null;
    },
) {
    const resolvedCurrentPosition = resolution.resolved.find((item) => item.entity_type === "position") || null;
    const resolvedCurrentCandidate = resolution.resolved.find((item) => item.entity_type === "candidate") || null;
    return {
        raw_context_position_id: context.position_id ?? null,
        raw_context_position_title: context.position_title ?? null,
        raw_context_candidate_id: context.candidate_id ?? null,
        resolved_current_position: resolvedCurrentPosition
            ? {
                selected_id: resolvedCurrentPosition.selected_id ?? null,
                selected_label: resolvedCurrentPosition.selected_label ?? null,
                resolution_status: resolvedCurrentPosition.resolution_status,
                source: resolvedCurrentPosition.source ?? null,
                matches: resolvedCurrentPosition.matches,
            }
            : null,
        resolved_current_candidate: resolvedCurrentCandidate
            ? {
                selected_id: resolvedCurrentCandidate.selected_id ?? null,
                selected_label: resolvedCurrentCandidate.selected_label ?? null,
                resolution_status: resolvedCurrentCandidate.resolution_status,
                source: resolvedCurrentCandidate.source ?? null,
                matches: resolvedCurrentCandidate.matches,
            }
            : null,
        resolvedPositionIds: options.resolvedPositionIds,
        fallbackContextPositionId: options.fallbackContextPositionId,
        fallbackContextCandidateId: options.fallbackContextCandidateId ?? null,
        final_query_candidate_id: options.resolvedCandidateId ?? null,
        scope: "scope" in intent.args ? intent.args.scope : null,
        final_query_position_ids: options.finalQueryPositionIds,
        branch: options.branch,
    };
}

async function executeIntent(
    request: NextRequest,
    intent: AssistantIntent,
    resolution: RecruitmentAssistantResolveEntitiesResult,
    context: RecruitmentAssistantRunRequest["context"],
    pagination?: RecruitmentAssistantRunRequest["pagination"],
) {
    const resolvedPositionEntity = resolution.resolved.find((item) => item.entity_type === "position" && item.selected_id);
    const resolvedCandidateEntity = resolution.resolved.find((item) => item.entity_type === "candidate" && item.selected_id);
    const resolvedPositionIds = resolution.resolved
        .filter((item) => item.entity_type === "position" && item.selected_id)
        .map((item) => Number(item.selected_id));
    const fallbackContextPositionId = coerceNumericId(context.position_id);
    const fallbackContextCandidateId = coerceNumericId(context.candidate_id);
    const effectiveCandidateId = intent.kind === "generate_interview_questions"
        ? (resolvedCandidateEntity?.selected_id ? Number(resolvedCandidateEntity.selected_id) : fallbackContextCandidateId)
        : null;
    const effectivePositionIds = isCurrentPositionIntent(intent)
        ? (fallbackContextPositionId !== null
            ? [fallbackContextPositionId]
            : resolvedPositionIds)
        : resolvedPositionIds;
    const resolvedSkillFilter = resolveSkillFilter(resolution);
    const resolvedPositionLabel = effectivePositionIds.length
        ? (context.position_title || resolvedPositionEntity?.selected_label || null)
        : null;
    const contextDescription = describeResolutionContext(resolution, context, {
        positionLabel: resolvedPositionLabel,
    });
    const executionDebug = buildExecutionDebug(intent, context, resolution, {
        resolvedPositionIds,
        fallbackContextPositionId,
        fallbackContextCandidateId,
        resolvedCandidateId: effectiveCandidateId,
        finalQueryPositionIds: effectivePositionIds.length ? effectivePositionIds : [],
        branch: isCurrentPositionIntent(intent)
            ? (fallbackContextPositionId !== null ? "current_position:trusted_context_id" : resolvedPositionIds.length ? "current_position:resolved_entity" : "current_position:missing_id")
            : intent.kind === "generate_interview_questions"
                ? (effectiveCandidateId !== null ? "generate_interview_questions:trusted_candidate_context" : "generate_interview_questions:missing_candidate")
            : (resolvedPositionIds.length ? "resolved_entity" : "no_position_scope"),
    });

    console.info("[recruitment][assistant][stream][backend]", JSON.stringify({
        message: intent.kind,
        debug: executionDebug,
    }));

    if (isCurrentPositionIntent(intent) && !effectivePositionIds.length) {
        const visiblePosition = context.position_title || "当前岗位";
        return {
            toolName: "resolve_entities" as const,
            toolArgs: {
                scope: "current_position" as const,
                context_position_id: context.position_id ?? null,
                context_position_title: context.position_title ?? null,
            },
            toolResult: {
                resolved: resolution.resolved,
                requires_clarification: false,
                unresolved_current_position: true,
                debug: executionDebug,
            },
            message: `你当前界面显示的岗位是“${visiblePosition}”，但这次查询没有把它解析成有效的岗位 ID，所以我没有继续返回可能误导的“0 位”结果。请重新选择一次岗位上下文后重试，或直接在消息里写完整岗位名称。`,
        };
    }

    if (intent.kind === "generate_interview_questions") {
        if (effectiveCandidateId === null) {
            return {
                toolName: "resolve_entities" as const,
                toolArgs: {
                    candidate_id: context.candidate_id ?? null,
                    candidate_label: resolvedCandidateEntity?.selected_label ?? null,
                    round_name: intent.args.round_name,
                },
                toolResult: {
                    resolved: resolution.resolved,
                    requires_clarification: false,
                    unresolved_current_candidate: true,
                    debug: executionDebug,
                },
                message: "当前没有定位到候选人。请先在候选人中心选中一位候选人，或在消息里直接写明候选人姓名后再生成面试题。",
            };
        }

        const requestPayload = {
            round_name: intent.args.round_name,
            custom_requirements: intent.args.custom_requirements || null,
            skill_ids: resolvedSkillFilter.skill_ids,
            use_candidate_memory: !resolvedSkillFilter.skill_ids.length,
            use_position_skills: !resolvedSkillFilter.skill_ids.length,
        };
        const question = await backendRecruitmentApi<InterviewQuestion>(
            request,
            `candidates/${effectiveCandidateId}/interview-questions`,
            {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(requestPayload),
            },
        );
        const logs = await backendRecruitmentApi<AITaskLog[]>(
            request,
            "ai-task-logs?task_type=interview_question_generation",
        );
        const taskLogSummary = logs.find((item) => item.related_candidate_id === effectiveCandidateId) || null;
        const taskLog = taskLogSummary?.id
            ? await backendRecruitmentApi<AITaskLog>(request, `ai-task-logs/${taskLogSummary.id}`)
            : null;
        const candidateLabel = resolvedCandidateEntity?.selected_label || `候选人 #${effectiveCandidateId}`;
        return {
            toolName: "generate_interview_questions" as const,
            toolArgs: {
                ...intent.args,
                candidate_id: effectiveCandidateId,
                skill_ids: resolvedSkillFilter.skill_ids,
                use_candidate_memory: !resolvedSkillFilter.skill_ids.length,
                use_position_skills: !resolvedSkillFilter.skill_ids.length,
                resolved_skill_filter: resolvedSkillFilter,
            },
            toolResult: {
                candidate: {
                    id: effectiveCandidateId,
                    label: candidateLabel,
                },
                question: {
                    id: question.id,
                    round_name: question.round_name,
                    status: question.status,
                },
                task_log: taskLog ? {
                    id: taskLog.id,
                    status: taskLog.status,
                    model_provider: taskLog.model_provider,
                    model_name: taskLog.model_name,
                    memory_source: taskLog.memory_source,
                    error_message: taskLog.error_message,
                    prompt_snapshot: taskLog.prompt_snapshot,
                    full_request_snapshot: taskLog.full_request_snapshot,
                    input_summary: taskLog.input_summary,
                    output_summary: taskLog.output_summary,
                    output_snapshot: taskLog.output_snapshot,
                    related_skill_snapshots: taskLog.related_skill_snapshots || [],
                    created_at: taskLog.created_at,
                    duration_ms: taskLog.duration_ms,
                } : null,
                resolved_skill_filter: resolvedSkillFilter,
                debug: {
                    ...executionDebug,
                    round_name: intent.args.round_name,
                    custom_requirements: intent.args.custom_requirements || null,
                    final_candidate_id: effectiveCandidateId,
                    final_skill_ids: resolvedSkillFilter.skill_ids,
                },
            },
            message: question.markdown_content || `已为 ${candidateLabel} 生成${intent.args.round_name}面试题。`,
        };
    }

    if (intent.kind === "count_candidates") {
        const candidates = await backendRecruitmentApi<CandidateRecord[]>(request, "candidates");
        const filtered = filterCandidates(candidates, {
            ...intent.args,
            position_ids: effectivePositionIds.length ? effectivePositionIds : intent.args.position_ids,
            resolved_skill_filter: resolvedSkillFilter,
        });
        return {
            toolName: "count_candidates" as const,
            toolArgs: {
                ...intent.args,
                position_ids: effectivePositionIds.length ? effectivePositionIds : intent.args.position_ids,
                resolved_skill_filter: resolvedSkillFilter,
            },
            toolResult: {
                total: filtered.length,
                resolved_skill_filter: resolvedSkillFilter,
                debug: executionDebug,
            } satisfies RecruitmentAssistantCountCandidatesResult,
            message: `${contextDescription}\n当前共有 ${filtered.length} 位候选人符合条件。`,
        };
    }

    if (intent.kind === "query_candidates") {
        const candidates = await backendRecruitmentApi<CandidateRecord[]>(request, "candidates");
        const filtered = filterCandidates(candidates, {
            ...intent.args,
            position_ids: effectivePositionIds.length ? effectivePositionIds : intent.args.position_ids,
            resolved_skill_filter: resolvedSkillFilter,
        });
        const cursor = decodeCursor(pagination?.cursor || intent.args.pagination?.cursor);
        const limit = Math.min(
            MAX_QUERY_CANDIDATES_LIMIT,
            Math.max(1, pagination?.limit || intent.args.pagination?.limit || cursor.limit || DEFAULT_QUERY_CANDIDATES_LIMIT),
        );
        const pageItems = filtered.slice(cursor.offset, cursor.offset + limit);
        const page = buildPageInfo(filtered.length, cursor.offset, limit, pageItems.length);
        const lines = pageItems.map((item, index) => `${cursor.offset + index + 1}. ${item.name}｜${item.position_title || "未分配岗位"}｜${item.status}`);
        const summary = page.total > page.returned
            ? `共匹配 ${page.total} 位，当前先展示前 ${page.returned} 位。`
            : `共匹配 ${page.total} 位。`;
        return {
            toolName: "query_candidates" as const,
            toolArgs: {
                ...intent.args,
                position_ids: effectivePositionIds.length ? effectivePositionIds : intent.args.position_ids,
                pagination: {cursor: pagination?.cursor || intent.args.pagination?.cursor || null, limit},
                resolved_skill_filter: resolvedSkillFilter,
            },
            toolResult: {
                items: pageItems,
                page,
                resolved_skill_filter: resolvedSkillFilter,
                debug: executionDebug,
            } satisfies RecruitmentAssistantQueryCandidatesResult<CandidateRecord>,
            message: `${contextDescription}\n${summary}\n${lines.join("\n")}${page.has_more ? "\n如需继续查看下一页，请继续发送“继续查看下一页”。" : ""}`,
            page,
        };
    }

    if (intent.kind === "query_positions") {
        const positions = await backendRecruitmentApi<PositionRecord[]>(request, "positions");
        const keyword = normalizeText(intent.args.keyword || "");
        const filtered = positions.filter((item) => !keyword || normalizeText(item.title).includes(keyword));
        const items = filtered.slice(0, intent.args.limit || 8);
        return {
            toolName: "query_positions" as const,
            toolArgs: intent.args,
            toolResult: {items},
            message: items.length
                ? `当前匹配到以下岗位：\n${items.map((item, index) => `${index + 1}. ${item.title}｜${item.department || "未填写部门"}｜${item.status}`).join("\n")}`
                : "当前没有匹配到岗位。",
        };
    }

    const recipients = await backendRecruitmentApi<RecipientRecord[]>(request, "mail-recipients");
    const keyword = normalizeText(intent.args.keyword || "");
    const filtered = recipients
        .filter((item) => item.is_enabled)
        .filter((item) => !keyword || normalizeText(`${item.name}${item.email}${item.department || ""}${item.role_title || ""}`).includes(keyword))
        .slice(0, intent.args.limit || 8);
    return {
        toolName: "query_mail_recipients" as const,
        toolArgs: intent.args,
        toolResult: {items: filtered},
        message: filtered.length
            ? `当前可用收件人如下：\n${filtered.map((item, index) => `${index + 1}. ${item.name}｜${item.email}`).join("\n")}`
            : "当前没有匹配到可用收件人。",
    };
}

async function streamTextWithDelay(
    emit: (event: RecruitmentAssistantStreamEventType, payload: unknown) => void,
    messageId: string,
    content: string,
    options?: { chunkSize?: number; delayMs?: number; page?: RecruitmentAssistantPageInfo },
) {
    emit("message.started", {
        message_id: messageId,
        role: "assistant",
        block_type: "text",
    });

    const chunkSize = options?.chunkSize || 20;
    const delayMs = options?.delayMs || 20;

    for (let index = 0; index < content.length; index += chunkSize) {
        emit("message.delta", {
            message_id: messageId,
            delta: content.slice(index, index + chunkSize),
        });
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    emit("message.completed", {
        message_id: messageId,
        content,
        page: options?.page,
    });
}

export async function POST(request: NextRequest) {
    const auth = requireScriptHubPermission(request, "ai-recruitment");
    if ("response" in auth) {
        return auth.response;
    }

    let runRequest: RecruitmentAssistantRunRequest;
    try {
        runRequest = await request.json() as RecruitmentAssistantRunRequest;
    } catch {
        return NextResponse.json({error: "Invalid request body"}, {status: 400});
    }

    if (!runRequest?.message?.trim()) {
        return NextResponse.json({error: "message is required"}, {status: 400});
    }

    const runId = crypto.randomUUID();
    const responseStream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            let seq = 0;
            const send = (event: RecruitmentAssistantStreamEventType, payload: unknown) => {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify({
                    run_id: runId,
                    seq: seq += 1,
                    event,
                    ts: new Date().toISOString(),
                    payload,
                })}\n\n`));
            };

            try {
                const messageId = `a-${Date.now()}`;
                const intent = detectIntent(runRequest.message, runRequest.context);
                send("run.started", {
                    user_message_id: `u-${Date.now()}`,
                    mode: "stream",
                });
                send("context.snapshot", {
                    defaults: runRequest.context,
                });

                if (isExecutionLikeMessage(runRequest.message) && intent.kind !== "generate_interview_questions") {
                    await streamTextWithDelay(
                        send,
                        messageId,
                        "这条消息属于生成或执行动作，不应该走只读查询流。它会交给完整 AI 助手处理，而不是被当成岗位或候选人查询。",
                        {chunkSize: 18, delayMs: 18},
                    );
                    send("run.completed", {
                        message_id: messageId,
                        finish_reason: "completed",
                    });
                    controller.close();
                    return;
                }

                const {resolution, clarificationTarget} = await resolveEntities(request, runRequest, intent);
                send("resolution.result", resolution);

                if (clarificationTarget) {
                    const clarification = buildClarificationRequest(clarificationTarget, runRequest.message);
                    await streamTextWithDelay(send, messageId, clarification.question, {chunkSize: 18, delayMs: 18});
                    send("clarification.required", clarification);
                    controller.close();
                    return;
                }

                const missingCurrentPositionMessage = getMissingCurrentPositionMessage(intent, resolution, runRequest.context);
                if (missingCurrentPositionMessage) {
                    await streamTextWithDelay(send, messageId, missingCurrentPositionMessage, {chunkSize: 18, delayMs: 18});
                    send("run.completed", {
                        message_id: messageId,
                        finish_reason: "completed",
                    });
                    controller.close();
                    return;
                }

                if (intent.kind === "generate_interview_questions") {
                    send("message.started", {
                        message_id: messageId,
                        role: "assistant",
                        block_type: "summary",
                    });
                    send("message.delta", {
                        message_id: messageId,
                        delta: "正在读取当前候选人简历、岗位上下文和激活 Skills，并生成结构化面试题...\n",
                    });
                }

                const execution = await executeIntent(request, intent, resolution, runRequest.context, runRequest.pagination);
                const toolCallId = `${execution.toolName}-${Date.now()}`;
                send("tool.started", {
                    tool_call_id: toolCallId,
                    name: execution.toolName,
                    arguments: execution.toolArgs,
                });
                send("tool.result", {
                    tool_call_id: toolCallId,
                    name: execution.toolName,
                    result: execution.toolResult,
                });
                await streamTextWithDelay(send, messageId, execution.message, {
                    chunkSize: 20,
                    delayMs: 18,
                    page: execution.page,
                });
                send("run.completed", {
                    message_id: messageId,
                    finish_reason: "completed",
                    page: execution.page,
                });
                controller.close();
            } catch (error) {
                send("run.error", {
                    code: "assistant_run_failed",
                    message: error instanceof Error ? error.message : "Unknown assistant error",
                    retryable: true,
                });
                controller.close();
            }
        },
        cancel() {
            // no-op
        },
    });

    return new Response(responseStream, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}
