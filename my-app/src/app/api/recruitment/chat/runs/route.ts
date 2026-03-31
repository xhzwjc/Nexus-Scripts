import {NextRequest, NextResponse} from "next/server";

import {getBackendBaseUrl} from "@/lib/server/backendBaseUrl";
import {requireScriptHubPermission} from "@/lib/server/scriptHubSession";
import type {
    AITaskLog,
    CandidateSummary,
    InterviewQuestion,
    PositionSummary,
    RecruitmentResumeMailDispatch,
    RecruitmentMailSenderConfig,
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
    type RecruitmentAssistantPrepareResumeMailArgs,
    type RecruitmentAssistantPreparedResumeMail,
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
    | { kind: "query_candidate_screening_status"; args: { candidate_id?: number | null } }
    | { kind: "query_positions"; args: RecruitmentAssistantQueryPositionsArgs }
    | { kind: "query_mail_recipients"; args: RecruitmentAssistantQueryMailRecipientsArgs }
    | { kind: "prepare_resume_mail"; args: RecruitmentAssistantPrepareResumeMailArgs }
    | { kind: "chat_orchestrator"; args: { reason: string } }
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
type CandidateRecord = Pick<CandidateSummary, "id" | "name" | "position_id" | "position_title" | "status" | "match_percent" | "updated_at" | "source" | "email" | "latest_resume_file_id" | "latest_score_id" | "latest_total_score">;
type RecipientRecord = Pick<RecruitmentMailRecipient, "id" | "name" | "email" | "department" | "role_title" | "is_enabled">;
type SkillRecord = Pick<RecruitmentSkill, "id" | "name" | "description" | "is_enabled">;
type SenderRecord = Pick<RecruitmentMailSenderConfig, "id" | "name" | "from_name" | "from_email" | "is_default" | "is_enabled">;

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

    const timeoutSignal = AbortSignal.timeout(120000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    const response = await fetch(`${getBackendBaseUrl()}/recruitment/${path}`, {
        ...init,
        headers,
        cache: "no-store",
        signal,
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

async function backendRecruitmentStream(
    request: NextRequest,
    path: string,
    init: RequestInit = {},
) {
    const headers = new Headers(init.headers);
    const authorization = request.headers.get("authorization");
    if (authorization) {
        headers.set("Authorization", authorization);
    }
    headers.set("Accept", "text/event-stream");

    const timeoutSignal = AbortSignal.timeout(240000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    const response = await fetch(`${getBackendBaseUrl()}/recruitment/${path}`, {
        ...init,
        headers,
        cache: "no-store",
        signal,
    });

    if (!response.ok || !response.body) {
        const raw = await response.text().catch(() => "");
        throw new Error(raw || `Stream request failed (${response.status})`);
    }

    return response;
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

function computeEditDistance(left: string, right: string) {
    if (left === right) {
        return 0;
    }
    const rows = left.length + 1;
    const cols = right.length + 1;
    const dp = Array.from({length: rows}, () => Array<number>(cols).fill(0));
    for (let row = 0; row < rows; row += 1) {
        dp[row][0] = row;
    }
    for (let col = 0; col < cols; col += 1) {
        dp[0][col] = col;
    }
    for (let row = 1; row < rows; row += 1) {
        for (let col = 1; col < cols; col += 1) {
            const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
            dp[row][col] = Math.min(
                dp[row - 1][col] + 1,
                dp[row][col - 1] + 1,
                dp[row - 1][col - 1] + substitutionCost,
            );
        }
    }
    return dp[rows - 1][cols - 1];
}

function scoreCandidateAliasMatch(normalizedQuery: string, normalizedAlias: string) {
    if (!normalizedQuery || !normalizedAlias || normalizedAlias.length < 2) {
        return null;
    }
    if (normalizedQuery.includes(normalizedAlias)) {
        return {
            score: Number((normalizedAlias.length / Math.max(normalizedQuery.length, normalizedAlias.length)).toFixed(4)),
            source: "explicit" as const,
        };
    }
    if (normalizedAlias.includes(normalizedQuery)) {
        return {
            score: Number((normalizedQuery.length / Math.max(normalizedQuery.length, normalizedAlias.length)).toFixed(4)),
            source: "explicit" as const,
        };
    }
    if (normalizedQuery.length > 8 || normalizedAlias.length > 8) {
        return null;
    }

    const distance = computeEditDistance(normalizedQuery, normalizedAlias);
    const maxLength = Math.max(normalizedQuery.length, normalizedAlias.length);
    let sharedAtSameIndex = 0;
    for (let index = 0; index < Math.min(normalizedQuery.length, normalizedAlias.length); index += 1) {
        if (normalizedQuery[index] === normalizedAlias[index]) {
            sharedAtSameIndex += 1;
        }
    }

    if (distance === 1 && sharedAtSameIndex >= Math.min(normalizedQuery.length, normalizedAlias.length) - 1) {
        return {
            score: Number((0.92 - (maxLength - sharedAtSameIndex) * 0.02).toFixed(4)),
            source: "inferred" as const,
        };
    }
    if (distance === 1 && sharedAtSameIndex >= Math.max(1, Math.min(normalizedQuery.length, normalizedAlias.length) - 2)) {
        return {score: 0.84, source: "inferred" as const};
    }
    if (distance === 2 && maxLength >= 4 && sharedAtSameIndex >= maxLength - 2) {
        return {score: 0.72, source: "inferred" as const};
    }
    return null;
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

function extractCandidateAliases(candidate: CandidateRecord) {
    const aliases = new Set<string>();
    const fullName = String(candidate.name || "").trim();
    if (fullName) {
        aliases.add(fullName);
        const afterBracket = fullName.includes("】") ? fullName.split("】").pop()?.trim() || "" : fullName;
        const leadingChineseName = afterBracket.match(/^([\u4e00-\u9fa5]{2,4})/);
        if (leadingChineseName?.[1]) {
            aliases.add(leadingChineseName[1]);
        }
    }
    return Array.from(aliases);
}

function findCandidateMatches(
    message: string,
    candidates: CandidateRecord[],
    source: RecruitmentAssistantMatchSource,
) {
    const normalizedMessage = normalizeText(message);
    const bestMatchByCandidate = new Map<number, RecruitmentAssistantEntityMatch>();
    candidates.forEach((candidate) => {
        extractCandidateAliases(candidate).forEach((alias) => {
            const normalizedAlias = normalizeText(alias);
            const matchMeta = scoreCandidateAliasMatch(normalizedMessage, normalizedAlias);
            if (matchMeta === null) {
                return;
            }
            const nextMatch = buildMatch(candidate.name, candidate.id, Number(matchMeta.score.toFixed(4)), matchMeta.source === "inferred" ? "inferred" : source);
            const current = bestMatchByCandidate.get(candidate.id);
            if (!current || nextMatch.score > current.score) {
                bestMatchByCandidate.set(candidate.id, nextMatch);
            }
        });
    });
    return Array.from(bestMatchByCandidate.values()).sort((left, right) => right.score - left.score);
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
    if (normalized.includes("新导入")) {
        statusIn.add("new_imported");
    }
    if (normalized.includes("已通过初筛") || normalized.includes("初筛通过")) {
        statusIn.add("screening_passed");
    }
    if (normalized.includes("未初筛") || normalized.includes("待初筛")) {
        statusIn.add("pending_screening");
    }
    if (normalized.includes("初筛淘汰") || normalized.includes("初筛未通过")) {
        statusIn.add("screening_rejected");
    }
    if (normalized.includes("待面试")) {
        statusIn.add("pending_interview");
    }
    if (normalized.includes("面试通过")) {
        statusIn.add("interview_passed");
    }
    if (normalized.includes("面试淘汰") || normalized.includes("面试未通过")) {
        statusIn.add("interview_rejected");
    }
    if (normalized.includes("待offer") || normalized.includes("待发offer")) {
        statusIn.add("pending_offer");
    }
    if (normalized.includes("已发offer") || normalized.includes("offer已发")) {
        statusIn.add("offer_sent");
    }
    if (normalized.includes("已录用") || normalized.includes("已入职")) {
        statusIn.add("hired");
    }
    if (normalized.includes("人才库")) {
        statusIn.add("talent_pool");
    }
    return Array.from(statusIn);
}

function extractEmailAddresses(message: string) {
    return Array.from(new Set((String(message || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((item) => item.trim())));
}

function stripEmailAddresses(message: string) {
    return String(message || "").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ");
}

function extractRecipientTokens(message: string) {
    const match = String(message || "").match(/(?:发送给|发给|发到|邮件给|寄给|转给)\s*(.+)$/);
    if (!match?.[1]) {
        return [];
    }
    const tail = stripEmailAddresses(match[1])
        .replace(/当前邮箱中的|邮箱中的|内部收件人中的|收件人中的/g, " ")
        .replace(/一位|一个|即可|就行|帮我|请/g, " ");
    return tail
        .split(/(?:，|,|、|；|;|\s+和\s+|\s+以及\s+|\s+及\s+)/)
        .map((item) => item.trim().replace(/^给/, "").replace(/的+$/, ""))
        .filter((item) => item.length >= 2);
}

function resolveExplicitRecipientsFromTokens(
    message: string,
    recipients: RecipientRecord[],
    forcedRecipientId: string | number | undefined,
) {
    const explicitRecipientEmails = extractEmailAddresses(message).map((item) => item.toLowerCase());
    const enabledRecipients = recipients.filter((item) => item.is_enabled);
    const tokens = extractRecipientTokens(message)
        .filter((token) => !explicitRecipientEmails.includes(token.toLowerCase()));

    const matchedRecipients = new Map<number, RecruitmentAssistantEntityMatch>();
    const ambiguousMatches = new Map<number, RecruitmentAssistantEntityMatch>();

    if (forcedRecipientId !== undefined) {
        const forcedRecipient = enabledRecipients.find((item) => Number(item.id) === Number(forcedRecipientId));
        if (forcedRecipient) {
            matchedRecipients.set(
                Number(forcedRecipient.id),
                buildMatch(forcedRecipient.name, forcedRecipient.id, 1, "clarification"),
            );
        }
    }

    tokens.forEach((token) => {
        const tokenMatches = findMatchesByContainment(
            token,
            enabledRecipients.map((item) => ({id: item.id, label: item.name})),
            "explicit",
        );
        if (!tokenMatches.length) {
            return;
        }
        if (tokenMatches.length === 1) {
            matchedRecipients.set(Number(tokenMatches[0].id), tokenMatches[0]);
            return;
        }
        tokenMatches.forEach((item) => ambiguousMatches.set(Number(item.id), item));
    });

    explicitRecipientEmails.forEach((email) => {
        const matchedRecipient = enabledRecipients.find((item) => item.email.toLowerCase() === email);
        if (matchedRecipient) {
            matchedRecipients.set(
                Number(matchedRecipient.id),
                buildMatch(matchedRecipient.name, matchedRecipient.id, 1, "explicit"),
            );
        }
    });

    return {
        explicitRecipientEmails,
        matchedRecipients: Array.from(matchedRecipients.values()),
        ambiguousRecipientMatches: Array.from(ambiguousMatches.values()),
    };
}

function isResumeMailIntent(message: string) {
    if (/(哪些|哪位|谁|列出|列表|看看|查询|还有哪些|还有谁)/.test(message) && /未发送邮件|没发送邮件|未发过邮件|没发过邮件/.test(message)) {
        return false;
    }
    return /(发送给|发给|发到|邮件给|寄给|转给)/.test(message) && /(简历|候选人|人选)/.test(message);
}

function inferResumeMailCandidateScope(message: string, context: RecruitmentAssistantRunRequest["context"]) {
    const wantsAll = /(所有|全部).*(简历|候选人|人选)|目前所有简历|全部简历/.test(message);
    if (/当前候选人|当前人选|这位候选人|这个候选人/.test(message)) {
        return "current_candidate" as const;
    }
    if (wantsAll && /人才库/.test(message)) {
        return "talent_pool_all" as const;
    }
    if (wantsAll && /当前岗位|当前职位|本岗位|该岗位/.test(message) && hasCurrentPositionContext(context)) {
        return "current_position_all" as const;
    }
    if (wantsAll) {
        return "global_filtered_all" as const;
    }
    return "auto" as const;
}

function inferResumeMailStatusFilters(message: string, candidateScope: RecruitmentAssistantPrepareResumeMailArgs["candidate_scope"]) {
    const filters = parseStatusFilters(message);
    if (/人才库/.test(message) && candidateScope === "talent_pool_all" && !filters.length) {
        return ["talent_pool"];
    }
    return filters;
}

function inferResumeMailUnsentOnly(message: string) {
    return /未(有)?发送邮件|未发送过|还没发过|未发过|没有发过邮件/.test(message);
}

function isScreeningStatusQuery(message: string) {
    const asksStatus = /(通过了吗|过了吗|是否通过|有没有通过|结果|状态|情况|结论|淘汰了吗|还在人才库吗|是人才库吗|\?|？|吗|呢)/.test(message);
    return /初筛/.test(message)
        && asksStatus
        && !/(重新|重筛|复筛|再次筛选|重新评估|帮我筛|重新对|加强|硬性要求|发送给|发给|发到|邮件给|寄给|转给)/.test(message);
}

function extractCandidateQueryFromMessage(message: string) {
    const patterns = [
        /(?:把|将|给|对)\s*([\u4e00-\u9fa5A-Za-z0-9·_\-]{2,30})\s*的?(?:简历|候选人|人选)/,
        /([\u4e00-\u9fa5A-Za-z0-9·_\-]{2,30})\s*的?(?:简历|候选人|人选).*(?:发送给|发给|发到|邮件给|寄给|转给|初筛|面试题|通过了吗|结果|状态)/,
        /([\u4e00-\u9fa5A-Za-z0-9·_\-]{2,30})\s*的?(?:简历)?初筛(?:通过|淘汰|结果|状态|过了吗)/,
    ];
    for (const pattern of patterns) {
        const match = message.match(pattern);
        const name = match?.[1]?.trim().replace(/的+$/, "");
        if (
            name
            && !["当前候选人", "当前人选", "这位候选人", "这个候选人", "当前岗位", "人才库", "所有", "全部"].includes(name)
            && !parseStatusFilters(name).length
            && !/(所有|全部|人才库|当前岗位|当前职位|本岗位|该岗位|未发送邮件|未发过邮件|没发过邮件)/.test(name)
        ) {
            return name;
        }
    }
    return "";
}

const CANDIDATE_STATUS_LABELS: Record<string, string> = {
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

function buildResumeMailSubject(candidates: CandidateRecord[]) {
    return `候选人简历推荐 - ${candidates.map((item) => item.name).slice(0, 3).join(", ")}`;
}

function buildResumeMailBody(candidates: CandidateRecord[]) {
    return [
        "你好，",
        "",
        "这里附上候选人简历，供你评估：",
        ...candidates.map((item) => `- 候选人：${item.name} / 岗位：${item.position_title || "未关联岗位"}`),
        "",
        "如需安排下一步，请直接回复我。",
    ].join("\n");
}

function pickPreferredSender(senders: SenderRecord[]) {
    return senders.find((item) => item.is_enabled && item.is_default)
        || senders.find((item) => item.is_enabled)
        || null;
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
    const wantsJdDraft = /(jd|岗位jd|职位jd|招聘jd|岗位描述|职位描述)/i.test(message) && /(生成|写|起草|撰写|整理|出一份|来一份|帮我)/.test(message);
    const wantsResumeMail = isResumeMailIntent(message);
    const wantsScreeningStatus = isScreeningStatusQuery(message);
    const unsentOnly = inferResumeMailUnsentOnly(message);
    const wantsCurrentPosition = /当前岗位|当前职位|本岗位|该岗位/.test(message);
    const resolvedScope = wantsCurrentPosition && hasCurrentPositionContext(context) ? "current_position" : "global";
    const requestedCurrentPosition = wantsCurrentPosition ? "current_position" : resolvedScope;

    if (wantsResumeMail) {
        const candidateScope = inferResumeMailCandidateScope(message, context);
        return {
            kind: "prepare_resume_mail",
            args: {
                candidate_id: coerceNumericId(context.candidate_id),
                candidate_scope: candidateScope,
                status_in: inferResumeMailStatusFilters(message, candidateScope),
                unsent_only: inferResumeMailUnsentOnly(message),
                recipient_emails: extractEmailAddresses(message),
            },
        };
    }

    if (wantsScreeningStatus) {
        return {
            kind: "query_candidate_screening_status",
            args: {
                candidate_id: coerceNumericId(context.candidate_id),
            },
        };
    }

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

    if (wantsJdDraft) {
        return {
            kind: "chat_orchestrator",
            args: {
                reason: "jd_draft_request",
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
                unsent_only: unsentOnly,
                fields: ["id", "name", "position_title", "status", "match_percent", "updated_at"],
                sort: {field: "updated_at", order: "desc"},
                pagination: {limit: DEFAULT_QUERY_CANDIDATES_LIMIT},
                resolved_skill_filter: {skill_ids: [], skill_names: [], source: "none"},
            },
        };
    }

    return {
        kind: "chat_orchestrator",
        args: {
            reason: "generic_chat",
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
        || intent.kind === "prepare_resume_mail"
        || intent.kind === "query_candidate_screening_status"
        || hasCurrentCandidateContext(runRequest.context)
        || /当前候选人|当前人选|这位候选人|这个候选人/.test(runRequest.message);
    const candidates = shouldResolveCandidates
        ? await backendRecruitmentApi<CandidateRecord[]>(request, "candidates")
        : [];
    const candidateQuery = extractCandidateQueryFromMessage(runRequest.message);

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

    const candidateMatches = findCandidateMatches(
        candidateQuery || runRequest.message,
        candidates,
        "explicit",
    );
    const exactCandidateMatches = candidateMatches.filter((item) => item.source === "explicit");
    const inferredCandidateMatches = candidateMatches.filter((item) => item.source === "inferred");

    const candidateFallback = candidateQuery
        ? undefined
        : (defaultCandidate ? buildMatch(defaultCandidate.name, defaultCandidate.id, 1, "default_context") : undefined);

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
        : candidateQuery && !exactCandidateMatches.length && inferredCandidateMatches.length
            ? {
                entity_type: "candidate" as const,
                query: runRequest.message,
                resolution_status: "ambiguous" as const,
                matches: inferredCandidateMatches.slice(0, 5),
            }
            : createResolvedEntity(
                "candidate",
                runRequest.message,
                candidateMatches,
                candidateFallback,
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
    if (intent.kind === "generate_interview_questions" || intent.kind === "prepare_resume_mail" || candidateMatches.length || defaultCandidate) {
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

    if (intent.kind === "query_mail_recipients" || intent.kind === "prepare_resume_mail") {
        const recipients = await backendRecruitmentApi<RecipientRecord[]>(request, "mail-recipients");
        const recipientResolution = resolveExplicitRecipientsFromTokens(
            runRequest.message,
            recipients,
            forcedSelections.get("recipient"),
        );
        const recipientMatches = recipientResolution.matchedRecipients;
        const ambiguousRecipientMatches = recipientResolution.ambiguousRecipientMatches;
        if (recipientMatches.length || ambiguousRecipientMatches.length || forcedSelections.has("recipient")) {
            const resolvedRecipient = ambiguousRecipientMatches.length
                ? {
                    entity_type: "recipient" as const,
                    query: runRequest.message,
                    resolution_status: "ambiguous" as const,
                    matches: ambiguousRecipientMatches.slice(0, 5),
                }
                : {
                    entity_type: "recipient" as const,
                    query: runRequest.message,
                    resolution_status: recipientMatches.length ? "unique" as const : "none" as const,
                    selected_id: recipientMatches[0]?.id,
                    selected_label: recipientMatches.map((item) => item.label).join("、"),
                    matches: recipientMatches,
                    source: recipientMatches.length === 1 ? recipientMatches[0].source : "explicit" as const,
                };
            resolved.push(resolvedRecipient);
        }
    }

    const clarificationTarget = resolved.find((item) => item.entity_type !== "skill" && item.resolution_status === "ambiguous");
    console.info("[recruitment][assistant][stream][resolve]", JSON.stringify({
        message: runRequest.message,
        raw_context_position_id: runRequest.context.position_id ?? null,
        raw_context_position_title: runRequest.context.position_title ?? null,
        raw_context_candidate_id: runRequest.context.candidate_id ?? null,
        candidate_query: candidateQuery || null,
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
    const allInferred = target.matches.length > 0 && target.matches.every((item) => item.source === "inferred");
    return {
        clarification_id: crypto.randomUUID(),
        entity_type: target.entity_type,
        question: allInferred && target.entity_type === "candidate"
            ? "我没有找到完全一致的候选人，但发现了相似人员，请先确认你指的是哪一位。"
            : `我匹配到了多个${target.entity_type === "position" ? "岗位" : target.entity_type === "recipient" ? "联系人" : target.entity_type === "candidate" ? "候选人" : "对象"}，请先确认你指的是哪一个。`,
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
    options?: { unsentCandidateIds?: Set<number> },
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
        if (args.unsent_only && options?.unsentCandidateIds && !options.unsentCandidateIds.has(Number(item.id))) {
            return false;
        }
        return true;
    });
}

function filterResumeMailCandidates(
    candidates: CandidateRecord[],
    options: {
        scope: NonNullable<RecruitmentAssistantPrepareResumeMailArgs["candidate_scope"]>;
        contextPositionId: number | null;
        explicitCandidateId: number | null;
        statusIn: string[];
        unsentCandidateIds: Set<number>;
        unsentOnly: boolean;
    },
) {
    return candidates.filter((item) => {
        if (options.scope === "current_candidate") {
            if (options.explicitCandidateId === null || Number(item.id) !== options.explicitCandidateId) {
                return false;
            }
        } else if (options.scope === "named_candidates") {
            if (options.explicitCandidateId === null || Number(item.id) !== options.explicitCandidateId) {
                return false;
            }
        } else if (options.scope === "talent_pool_all") {
            if (item.status !== "talent_pool") {
                return false;
            }
        } else if (options.scope === "current_position_all") {
            if (options.contextPositionId === null || Number(item.position_id) !== options.contextPositionId) {
                return false;
            }
        }

        if (options.statusIn.length && !options.statusIn.includes(item.status)) {
            return false;
        }
        if (options.unsentOnly && !options.unsentCandidateIds.has(Number(item.id))) {
            return false;
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
    message: string,
    pagination?: RecruitmentAssistantRunRequest["pagination"],
) {
    const explicitCandidateQuery = extractCandidateQueryFromMessage(message);
    const referencesCurrentCandidate = /当前候选人|当前人选|这位候选人|这个候选人/.test(message);
    const resolvedPositionEntity = resolution.resolved.find((item) => item.entity_type === "position" && item.selected_id);
    const resolvedCandidateEntity = resolution.resolved.find((item) => item.entity_type === "candidate" && item.selected_id);
    const resolvedPositionIds = resolution.resolved
        .filter((item) => item.entity_type === "position" && item.selected_id)
        .map((item) => Number(item.selected_id));
    const fallbackContextPositionId = coerceNumericId(context.position_id);
    const fallbackContextCandidateId = coerceNumericId(context.candidate_id);
    const allowCandidateContextFallback = !explicitCandidateQuery || referencesCurrentCandidate;
    const effectiveCandidateId = intent.kind === "generate_interview_questions" || intent.kind === "prepare_resume_mail" || intent.kind === "query_candidate_screening_status"
        ? (resolvedCandidateEntity?.selected_id
            ? Number(resolvedCandidateEntity.selected_id)
            : (allowCandidateContextFallback ? fallbackContextCandidateId : null))
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
            : intent.kind === "prepare_resume_mail"
                ? (effectiveCandidateId !== null ? "prepare_resume_mail:trusted_candidate_context" : "prepare_resume_mail:missing_candidate")
            : intent.kind === "query_candidate_screening_status"
                ? (effectiveCandidateId !== null ? "query_candidate_screening_status:resolved_candidate" : "query_candidate_screening_status:missing_candidate")
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

    if (intent.kind === "prepare_resume_mail") {
        const candidates = await backendRecruitmentApi<CandidateRecord[]>(request, "candidates");
        const recipients = await backendRecruitmentApi<RecipientRecord[]>(request, "mail-recipients");
        const senders = await backendRecruitmentApi<SenderRecord[]>(request, "mail-senders");
        const dispatches = await backendRecruitmentApi<RecruitmentResumeMailDispatch[]>(request, "resume-mail-dispatches");
        const explicitRecipientEmails = intent.args.recipient_emails || [];
        const resolvedRecipientIds = Array.from(new Set(
            (resolution.resolved.find((item) => item.entity_type === "recipient")?.matches || [])
                .map((item) => Number(item.id))
                .filter((item) => Number.isFinite(item)),
        ));
        const resolvedRecipients = recipients.filter((item) => resolvedRecipientIds.includes(Number(item.id)));
        const preferredSender = pickPreferredSender(senders);
        const unsentCandidateIds = new Set(
            candidates
                .map((item) => Number(item.id))
                .filter((candidateId) => !dispatches.some((dispatch) => dispatch.status === "sent" && dispatch.candidate_ids.includes(candidateId))),
        );
        const candidateScope = intent.args.candidate_scope || "auto";
        const resolvedCandidateSource = resolvedCandidateEntity?.source || null;
        const effectiveCandidateScope = candidateScope === "auto"
            ? (explicitCandidateQuery ? "named_candidates" : (resolvedCandidateEntity?.selected_id && resolvedCandidateSource !== "default_context" ? "named_candidates" : "current_candidate"))
            : candidateScope;
        const candidateSelection = filterResumeMailCandidates(candidates, {
            scope: effectiveCandidateScope,
            contextPositionId: coerceNumericId(context.position_id),
            explicitCandidateId: effectiveCandidateId,
            statusIn: intent.args.status_in || [],
            unsentCandidateIds,
            unsentOnly: Boolean(intent.args.unsent_only),
        });

        if (!candidateSelection.length) {
            return {
                toolName: "prepare_resume_mail" as const,
                toolArgs: intent.args,
                toolResult: {
                    prepared_mail: null,
                    debug: {
                        ...executionDebug,
                        candidate_scope: effectiveCandidateScope,
                        status_in: intent.args.status_in || [],
                        unsent_only: Boolean(intent.args.unsent_only),
                        explicit_recipient_emails: explicitRecipientEmails,
                        resolved_recipient_ids: resolvedRecipientIds,
                    },
                },
                message: explicitCandidateQuery
                    ? `我没有匹配到名为“${explicitCandidateQuery}”的候选人，所以这次没有继续回退到当前候选人。请确认姓名是否正确，或先在候选人中心搜索后再发送。`
                    : "这次没有筛到可发送的候选人。你可以直接说候选人姓名，或明确说“把人才库所有简历发给 xxx”“把所有初筛通过且未发送过邮件的简历发给 xxx”。",
            };
        }

        if (!preferredSender) {
            return {
                toolName: "prepare_resume_mail" as const,
                toolArgs: intent.args,
                toolResult: {
                    prepared_mail: null,
                    debug: {
                        ...executionDebug,
                        explicit_recipient_emails: explicitRecipientEmails,
                        resolved_recipient_ids: resolvedRecipientIds,
                    },
                },
                message: "当前还没有可用的发件箱配置。请先到“管理设置 -> 邮件中心”配置并启用至少一个发件箱，再让我帮你发送简历。",
            };
        }

        if (!resolvedRecipients.length && !explicitRecipientEmails.length) {
            return {
                toolName: "prepare_resume_mail" as const,
                toolArgs: intent.args,
                toolResult: {
                    prepared_mail: null,
                    debug: {
                        ...executionDebug,
                        explicit_recipient_emails: explicitRecipientEmails,
                        resolved_recipient_ids: resolvedRecipientIds,
                    },
                },
                message: "我还没有定位到收件人。你可以直接说“发给张三”或“发给 xxx@example.com”，我会先准备预览再让你确认发送。",
            };
        }

        const recipientEmails = Array.from(new Set([
            ...resolvedRecipients.map((item) => item.email),
            ...explicitRecipientEmails,
        ]));
        const candidatesWithResume = candidateSelection.filter((item) => Boolean(item.latest_resume_file_id));
        const preparedMail: RecruitmentAssistantPreparedResumeMail = {
            sender_config_id: preferredSender.id,
            sender: {
                id: preferredSender.id,
                name: preferredSender.name,
                from_name: preferredSender.from_name || null,
                from_email: preferredSender.from_email,
                is_default: Boolean(preferredSender.is_default),
            },
            candidate_ids: candidateSelection.map((item) => item.id),
            candidates: candidateSelection.map((item) => ({
                id: item.id,
                name: item.name,
                position_id: item.position_id ?? null,
                position_title: item.position_title ?? null,
                email: item.email ?? null,
                latest_resume_file_id: item.latest_resume_file_id ?? null,
            })),
            recipient_ids: resolvedRecipients.map((item) => item.id),
            recipients: [
                ...resolvedRecipients.map((resolvedRecipient) => ({
                    id: resolvedRecipient.id,
                    name: resolvedRecipient.name,
                    email: resolvedRecipient.email,
                    department: resolvedRecipient.department ?? null,
                    role_title: resolvedRecipient.role_title ?? null,
                    source: "internal_recipient" as const,
                })),
                ...explicitRecipientEmails
                    .filter((email) => !resolvedRecipients.some((item) => item.email === email))
                    .map((email) => ({
                        id: null,
                        name: null,
                        email,
                        department: null,
                        role_title: null,
                        source: "direct_email" as const,
                    })),
            ],
            recipient_emails: recipientEmails,
            subject: buildResumeMailSubject(candidateSelection),
            body_text: buildResumeMailBody(candidateSelection),
            body_html: null,
            attachment_count: candidatesWithResume.length,
            missing_resume_candidate_ids: candidateSelection.filter((item) => !item.latest_resume_file_id).map((item) => item.id),
            requires_confirmation: true,
            can_confirm: Boolean(candidatesWithResume.length),
            blocking_reason: candidatesWithResume.length ? null : "当前命中的候选人都还没有可发送的最新简历附件。",
        };

        return {
            toolName: "prepare_resume_mail" as const,
            toolArgs: {
                ...intent.args,
                candidate_id: candidateSelection[0]?.id ?? null,
                candidate_ids: candidateSelection.map((item) => item.id),
                candidate_scope: effectiveCandidateScope,
                recipient_id: resolvedRecipients[0]?.id ?? null,
                recipient_ids: resolvedRecipients.map((item) => item.id),
            },
            toolResult: {
                prepared_mail: preparedMail,
                debug: {
                    ...executionDebug,
                    candidate_scope: effectiveCandidateScope,
                    candidate_ids: candidateSelection.map((item) => item.id),
                    status_in: intent.args.status_in || [],
                    unsent_only: Boolean(intent.args.unsent_only),
                    explicit_recipient_emails: explicitRecipientEmails,
                    resolved_recipient_ids: resolvedRecipients.map((item) => item.id),
                    sender_config_id: preferredSender.id,
                    candidate_has_resume: Boolean(candidatesWithResume.length),
                },
            },
            message: preparedMail.can_confirm
                ? `我已经为你准备好一封简历推荐邮件。\n- 候选人：${candidateSelection.length} 位（${candidateSelection.slice(0, 3).map((item) => item.name).join("、")}${candidateSelection.length > 3 ? " 等" : ""}）\n- 发件箱：${preferredSender.name} <${preferredSender.from_email}>\n- 收件人：${recipientEmails.join("、")}\n- 附件：${preparedMail.attachment_count} 份简历\n请先确认发送；如果你想改标题或正文，也可以先点“编辑后发送”。`
                : `我已经准备好了邮件预览，但当前命中的候选人都没有可发送的最新简历附件，所以暂时不能直接发送。你可以先上传/关联简历后再试，或点“编辑后发送”检查内容。`,
        };
    }

    if (intent.kind === "query_candidate_screening_status") {
        const candidates = await backendRecruitmentApi<CandidateRecord[]>(request, "candidates");
        const effectiveCandidate = effectiveCandidateId !== null
            ? candidates.find((item) => Number(item.id) === effectiveCandidateId) || null
            : null;
        if (!effectiveCandidate) {
            return {
                toolName: "query_candidate_screening_status" as const,
                toolArgs: intent.args,
                toolResult: {
                    candidate: null,
                    debug: executionDebug,
                },
                message: "我还没有定位到你要问的候选人。请直接写候选人姓名，或先在右侧把当前候选人切到目标人选。",
            };
        }
        const statusLabel = CANDIDATE_STATUS_LABELS[effectiveCandidate.status] || effectiveCandidate.status || "未知状态";
        const passedStatuses = new Set(["screening_passed", "pending_interview", "interview_passed", "pending_offer", "offer_sent", "hired"]);
        const rejectedStatuses = new Set(["screening_rejected", "interview_rejected"]);
        const screeningConclusion = passedStatuses.has(effectiveCandidate.status)
            ? "通过"
            : rejectedStatuses.has(effectiveCandidate.status)
                ? "未通过"
                : effectiveCandidate.status === "talent_pool"
                    ? "进入人才库，属于保留观察"
                    : effectiveCandidate.status === "pending_screening"
                        ? "还未完成初筛"
                        : "当前无法直接判断";
        return {
            toolName: "query_candidate_screening_status" as const,
            toolArgs: intent.args,
            toolResult: {
                candidate: {
                    id: effectiveCandidate.id,
                    name: effectiveCandidate.name,
                    status: effectiveCandidate.status,
                    status_label: statusLabel,
                    latest_total_score: effectiveCandidate.latest_total_score ?? null,
                    latest_score_id: effectiveCandidate.latest_score_id ?? null,
                },
                debug: executionDebug,
            },
            message: [
                `${effectiveCandidate.name} 的初筛结论：${screeningConclusion}。`,
                `当前状态：${statusLabel}。`,
                effectiveCandidate.latest_total_score !== null && effectiveCandidate.latest_total_score !== undefined
                    ? `最近一次评分：${effectiveCandidate.latest_total_score}。`
                    : "目前还没有可读的评分记录。",
            ].join("\n"),
        };
    }

    if (intent.kind === "count_candidates") {
        const candidates = await backendRecruitmentApi<CandidateRecord[]>(request, "candidates");
        const sentDispatches = intent.args.unsent_only
            ? await backendRecruitmentApi<RecruitmentResumeMailDispatch[]>(request, "resume-mail-dispatches")
            : [];
        const effectiveUnsentCandidateIds = intent.args.unsent_only
            ? new Set(
                candidates
                    .map((item) => Number(item.id))
                    .filter((candidateId) => !sentDispatches.some((dispatch) => dispatch.status === "sent" && dispatch.candidate_ids.includes(candidateId))),
            )
            : undefined;
        const filtered = filterCandidates(candidates, {
            ...intent.args,
            position_ids: effectivePositionIds.length ? effectivePositionIds : intent.args.position_ids,
            resolved_skill_filter: resolvedSkillFilter,
        }, {unsentCandidateIds: effectiveUnsentCandidateIds});
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
        const sentDispatches = intent.args.unsent_only
            ? await backendRecruitmentApi<RecruitmentResumeMailDispatch[]>(request, "resume-mail-dispatches")
            : [];
        const effectiveUnsentCandidateIds = intent.args.unsent_only
            ? new Set(
                candidates
                    .map((item) => Number(item.id))
                    .filter((candidateId) => !sentDispatches.some((dispatch) => dispatch.status === "sent" && dispatch.candidate_ids.includes(candidateId))),
            )
            : undefined;
        const filtered = filterCandidates(candidates, {
            ...intent.args,
            position_ids: effectivePositionIds.length ? effectivePositionIds : intent.args.position_ids,
            resolved_skill_filter: resolvedSkillFilter,
        }, {unsentCandidateIds: effectiveUnsentCandidateIds});
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

    if (intent.kind === "query_mail_recipients") {
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

    throw new Error(`Unsupported assistant intent: ${intent.kind}`);
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
    const routeAbortController = new AbortController();
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

                if (intent.kind === "chat_orchestrator" || (isExecutionLikeMessage(runRequest.message) && intent.kind !== "generate_interview_questions" && intent.kind !== "prepare_resume_mail")) {
                    const toolCallId = `chat_orchestrator-${Date.now()}`;
                    const routeTiming: Record<string, unknown> = {
                        route_request_started_at_ms: Date.now(),
                        backend_stream_request_started_at_ms: null,
                        backend_response_headers_at_ms: null,
                        backend_first_chunk_at_ms: null,
                        backend_first_preview_delta_at_ms: null,
                        route_first_message_delta_enqueued_at_ms: null,
                        preview_completed_at_ms: null,
                        route_final_completed_at_ms: null,
                    };
                    let previewContent = "";
                    let backendPreviewPayload: Record<string, unknown> | null = null;
                    let finalPayload: Record<string, unknown> | null = null;

                    send("message.started", {
                        message_id: messageId,
                        role: "assistant",
                        block_type: "text",
                    });
                    send("tool.started", {
                        tool_call_id: toolCallId,
                        name: "chat_orchestrator",
                        arguments: {
                            message: runRequest.message,
                            context: runRequest.context,
                        },
                    });

                    routeTiming.backend_stream_request_started_at_ms = Date.now();
                    const streamResponse = await backendRecruitmentStream(
                        request,
                        "chat/stream",
                        {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            signal: routeAbortController.signal,
                            body: JSON.stringify({
                                message: runRequest.message,
                                context: runRequest.context,
                            }),
                        },
                    );
                    routeTiming.backend_response_headers_at_ms = Date.now();
                    routeTiming.backend_stream_content_type = streamResponse.headers.get("content-type");
                    const backendReader = streamResponse.body?.getReader();
                    if (!backendReader) {
                        throw new Error("Chat stream body is empty");
                    }
                    const decoder = new TextDecoder();
                    let backendBuffer = "";

                    while (true) {
                        const {done, value} = await backendReader.read();
                        if (done) {
                            break;
                        }
                        if (routeTiming.backend_first_chunk_at_ms === null) {
                            routeTiming.backend_first_chunk_at_ms = Date.now();
                        }
                        routeTiming.backend_chunk_length = value.byteLength;
                        backendBuffer += decoder.decode(value, {stream: true});
                        let separatorIndex = backendBuffer.indexOf("\n\n");
                        while (separatorIndex !== -1) {
                            const rawEvent = backendBuffer.slice(0, separatorIndex);
                            backendBuffer = backendBuffer.slice(separatorIndex + 2);
                            separatorIndex = backendBuffer.indexOf("\n\n");

                            const lines = rawEvent.split("\n");
                            const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
                            const dataLines = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
                            if (!eventName || !dataLines) {
                                continue;
                            }
                            let payload: Record<string, unknown> | null = null;
                            try {
                                payload = JSON.parse(dataLines) as Record<string, unknown>;
                            } catch {
                                payload = null;
                            }
                            if (!payload) {
                                continue;
                            }
                            if (eventName === "preview.started") {
                                routeTiming.backend_preview_started_at_ms = payload.backend_started_at_ms ?? Date.now();
                                continue;
                            }
                            if (eventName === "preview.delta") {
                                const delta = typeof payload.delta === "string" ? payload.delta : "";
                                if (!delta) {
                                    continue;
                                }
                                if (routeTiming.backend_first_preview_delta_at_ms === null) {
                                    routeTiming.backend_first_preview_delta_at_ms = payload.emitted_at_ms ?? Date.now();
                                }
                                if (routeTiming.route_first_message_delta_enqueued_at_ms === null) {
                                    routeTiming.route_first_message_delta_enqueued_at_ms = Date.now();
                                }
                                previewContent += delta;
                                send("message.delta", {
                                    message_id: messageId,
                                    delta,
                                });
                                continue;
                            }
                            if (eventName === "preview.completed") {
                                backendPreviewPayload = payload;
                                routeTiming.preview_completed_at_ms = Date.now();
                                continue;
                            }
                            if (eventName === "final.result") {
                                finalPayload = payload;
                                continue;
                            }
                            if (eventName === "run.cancelled") {
                                send("run.cancelled", {
                                    reason: "connection_closed",
                                });
                                controller.close();
                                return;
                            }
                            if (eventName === "run.error") {
                                throw new Error(String(payload.message || "Chat stream failed"));
                            }
                        }
                    }

                    routeTiming.route_final_completed_at_ms = Date.now();
                    const finalReply = typeof finalPayload?.reply === "string" && finalPayload.reply
                        ? finalPayload.reply
                        : previewContent;
                    const taskLogResult = finalPayload ? {
                        id: typeof finalPayload.log_id === "number" ? finalPayload.log_id : null,
                        status: finalPayload.used_fallback ? "fallback" : "success",
                        model_provider: typeof finalPayload.model_provider === "string" ? finalPayload.model_provider : null,
                        model_name: typeof finalPayload.model_name === "string" ? finalPayload.model_name : null,
                        memory_source: typeof finalPayload.memory_source === "string" ? finalPayload.memory_source : null,
                        error_message: typeof finalPayload.fallback_error === "string" ? finalPayload.fallback_error : null,
                        related_skill_snapshots: Array.isArray(finalPayload.used_skills) ? finalPayload.used_skills : [],
                    } : null;

                    send("tool.result", {
                        tool_call_id: toolCallId,
                        name: "chat_orchestrator",
                        result: {
                            reply: finalReply,
                            actions: Array.isArray(finalPayload?.actions) ? finalPayload.actions : [],
                            context: finalPayload?.context ?? runRequest.context,
                            task_log: taskLogResult,
                            debug: {
                                route_streaming: routeTiming,
                                backend_preview: backendPreviewPayload,
                                backend_result: finalPayload,
                            },
                        },
                    });
                    send("message.completed", {
                        message_id: messageId,
                        content: finalReply,
                    });
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
                    const resolvedCandidateEntity = resolution.resolved.find((item) => item.entity_type === "candidate" && item.selected_id);
                    const fallbackContextCandidateId = coerceNumericId(runRequest.context.candidate_id);
                    const effectiveCandidateId = resolvedCandidateEntity?.selected_id
                        ? Number(resolvedCandidateEntity.selected_id)
                        : fallbackContextCandidateId;
                    const resolvedSkillFilter = resolveSkillFilter(resolution);

                    if (effectiveCandidateId === null) {
                        const unresolvedMessage = "当前没有定位到候选人。请先在候选人中心选中一位候选人，或在消息里直接写明候选人姓名后再生成面试题。";
                        await streamTextWithDelay(send, messageId, unresolvedMessage, {chunkSize: 18, delayMs: 18});
                        send("run.completed", {
                            message_id: messageId,
                            finish_reason: "completed",
                        });
                        controller.close();
                        return;
                    }

                    const toolCallId = `generate_interview_questions-${Date.now()}`;
                    const toolArgs = {
                        ...intent.args,
                        candidate_id: effectiveCandidateId,
                        skill_ids: resolvedSkillFilter.skill_ids,
                        use_candidate_memory: !resolvedSkillFilter.skill_ids.length,
                        use_position_skills: !resolvedSkillFilter.skill_ids.length,
                        resolved_skill_filter: resolvedSkillFilter,
                    };
                    const routeTiming: Record<string, unknown> = {
                        route_request_started_at_ms: Date.now(),
                        backend_stream_request_started_at_ms: null,
                        backend_response_headers_at_ms: null,
                        backend_first_chunk_at_ms: null,
                        backend_first_preview_delta_at_ms: null,
                        route_first_message_delta_enqueued_at_ms: null,
                        preview_completed_at_ms: null,
                        route_final_completed_at_ms: null,
                    };
                    let previewContent = "";
                    let backendPreviewPayload: Record<string, unknown> | null = null;
                    let finalPayload: Record<string, unknown> | null = null;

                    send("message.started", {
                        message_id: messageId,
                        role: "assistant",
                        block_type: "text",
                    });
                    send("tool.started", {
                        tool_call_id: toolCallId,
                        name: "generate_interview_questions",
                        arguments: toolArgs,
                    });

                    routeTiming.backend_stream_request_started_at_ms = Date.now();
                    const previewResponse = await backendRecruitmentStream(
                        request,
                        `candidates/${effectiveCandidateId}/interview-questions/preview-stream`,
                        {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            signal: routeAbortController.signal,
                            body: JSON.stringify({
                                round_name: intent.args.round_name,
                                custom_requirements: intent.args.custom_requirements || null,
                                skill_ids: resolvedSkillFilter.skill_ids,
                                use_candidate_memory: !resolvedSkillFilter.skill_ids.length,
                                use_position_skills: !resolvedSkillFilter.skill_ids.length,
                            }),
                        },
                    );
                    routeTiming.backend_response_headers_at_ms = Date.now();
                    routeTiming.backend_stream_content_type = previewResponse.headers.get("content-type");
                    if (!previewResponse.body) {
                        throw new Error("Interview preview stream body is empty");
                    }
                    const backendReader = previewResponse.body.getReader();
                    const decoder = new TextDecoder();
                    let backendBuffer = "";

                    while (true) {
                        const {done, value} = await backendReader.read();
                        if (done) {
                            break;
                        }
                        if (routeTiming.backend_first_chunk_at_ms === null) {
                            routeTiming.backend_first_chunk_at_ms = Date.now();
                        }
                        routeTiming.backend_chunk_length = value.byteLength;
                        backendBuffer += decoder.decode(value, {stream: true});
                        let separatorIndex = backendBuffer.indexOf("\n\n");
                        while (separatorIndex !== -1) {
                            const rawEvent = backendBuffer.slice(0, separatorIndex);
                            backendBuffer = backendBuffer.slice(separatorIndex + 2);
                            separatorIndex = backendBuffer.indexOf("\n\n");

                            const lines = rawEvent.split("\n");
                            const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
                            const dataLines = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
                            if (!eventName || !dataLines) {
                                continue;
                            }
                            let payload: Record<string, unknown> | null = null;
                            try {
                                payload = JSON.parse(dataLines) as Record<string, unknown>;
                            } catch {
                                payload = null;
                            }
                            if (!payload) {
                                continue;
                            }
                            if (eventName === "preview.started") {
                                routeTiming.backend_preview_started_at_ms = payload.backend_started_at_ms ?? Date.now();
                                routeTiming.preview_task_log_id = payload.task_log_id ?? null;
                                continue;
                            }
                            if (eventName === "preview.delta") {
                                const delta = typeof payload.delta === "string" ? payload.delta : "";
                                if (!delta) {
                                    continue;
                                }
                                if (routeTiming.backend_first_preview_delta_at_ms === null) {
                                    routeTiming.backend_first_preview_delta_at_ms = payload.emitted_at_ms ?? Date.now();
                                }
                                if (routeTiming.route_first_message_delta_enqueued_at_ms === null) {
                                    routeTiming.route_first_message_delta_enqueued_at_ms = Date.now();
                                }
                                previewContent += delta;
                                send("message.delta", {
                                    message_id: messageId,
                                    delta,
                                });
                                continue;
                            }
                            if (eventName === "preview.completed") {
                                backendPreviewPayload = payload;
                                routeTiming.preview_completed_at_ms = Date.now();
                                continue;
                            }
                            if (eventName === "final.result") {
                                finalPayload = payload;
                                continue;
                            }
                            if (eventName === "run.error") {
                                throw new Error(String(payload.message || "Interview preview stream failed"));
                            }
                        }
                    }

                    if (!finalPayload) {
                        throw new Error("Interview preview stream completed without final result");
                    }

                    routeTiming.route_final_completed_at_ms = Date.now();
                    const finalQuestion = finalPayload.question && typeof finalPayload.question === "object"
                        ? finalPayload.question as Record<string, unknown>
                        : null;
                    const finalTaskLog = finalPayload.task_log && typeof finalPayload.task_log === "object"
                        ? finalPayload.task_log as Record<string, unknown>
                        : null;
                    const toolResultPayload = {
                        ...finalPayload,
                        resolved_skill_filter: resolvedSkillFilter,
                        debug: {
                            candidate_id: effectiveCandidateId,
                            route_streaming: routeTiming,
                            backend_preview: backendPreviewPayload,
                        },
                    };

                    send("tool.result", {
                        tool_call_id: toolCallId,
                        name: "generate_interview_questions",
                        result: toolResultPayload,
                    });
                    send("message.completed", {
                        message_id: messageId,
                        content: (typeof finalQuestion?.markdown_content === "string" && finalQuestion.markdown_content) ? finalQuestion.markdown_content : previewContent,
                    });
                    send("run.completed", {
                        message_id: messageId,
                        finish_reason: "completed",
                    });

                    console.info("[recruitment][assistant][stream][interview-route]", JSON.stringify({
                        candidate_id: effectiveCandidateId,
                        model_provider: finalTaskLog?.model_provider ?? null,
                        model_name: finalTaskLog?.model_name ?? null,
                        timing: routeTiming,
                    }));
                    controller.close();
                    return;
                }

                const execution = await executeIntent(request, intent, resolution, runRequest.context, runRequest.message, runRequest.pagination);
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
            routeAbortController.abort();
        },
    });

    return new Response(responseStream, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
