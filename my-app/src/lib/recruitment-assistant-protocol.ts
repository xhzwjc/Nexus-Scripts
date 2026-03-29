export const DEFAULT_QUERY_CANDIDATES_LIMIT = 10;
export const MAX_QUERY_CANDIDATES_LIMIT = 20;

export type RecruitmentAssistantToolName =
    | "resolve_entities"
    | "count_candidates"
    | "query_candidates"
    | "query_positions"
    | "query_mail_recipients"
    | "generate_interview_questions";

export type RecruitmentAssistantResolutionStatus = "unique" | "ambiguous" | "none";
export type RecruitmentAssistantEntityType = "position" | "candidate" | "skill" | "recipient";
export type RecruitmentAssistantMatchSource = "explicit" | "default_context" | "inferred" | "clarification";
export type RecruitmentAssistantSkillSource = "explicit" | "default_context" | "resolved_entity" | "none";

export interface RecruitmentAssistantEntityMatch {
    id: string | number;
    label: string;
    score: number;
    source: RecruitmentAssistantMatchSource;
}

export interface RecruitmentAssistantResolvedEntity {
    entity_type: RecruitmentAssistantEntityType;
    query: string;
    resolution_status: RecruitmentAssistantResolutionStatus;
    selected_id?: string | number;
    selected_label?: string;
    matches: RecruitmentAssistantEntityMatch[];
    source?: RecruitmentAssistantMatchSource;
}

export interface RecruitmentAssistantResolveEntitiesResult {
    resolved: RecruitmentAssistantResolvedEntity[];
    requires_clarification: boolean;
}

export interface RecruitmentAssistantSkillFilter {
    skill_ids: number[];
    skill_names: string[];
    source: RecruitmentAssistantSkillSource;
}

export interface RecruitmentAssistantClarificationOption extends RecruitmentAssistantEntityMatch {}

export interface RecruitmentAssistantClarificationRequest {
    clarification_id: string;
    entity_type: RecruitmentAssistantEntityType;
    question: string;
    options: RecruitmentAssistantClarificationOption[];
    allow_multiple: boolean;
    original_message: string;
}

export interface RecruitmentAssistantClarificationSelection {
    clarification_id: string;
    entity_type: RecruitmentAssistantEntityType;
    selected_id: string | number;
}

export interface RecruitmentAssistantClarificationResponse {
    selections: RecruitmentAssistantClarificationSelection[];
}

export interface RecruitmentAssistantPaginationInput {
    cursor?: string | null;
    limit?: number;
}

export interface RecruitmentAssistantPageInfo {
    limit: number;
    offset: number;
    returned: number;
    total: number;
    has_more: boolean;
    next_cursor?: string | null;
}

export interface RecruitmentAssistantCountCandidatesArgs {
    scope: "global" | "current_position" | "specified_positions" | "current_filtered_candidates";
    position_ids?: number[];
    status_in?: string[];
    status_not_in?: string[];
    keyword?: string;
    group_by?: "status" | "position" | "source";
    resolved_skill_filter?: RecruitmentAssistantSkillFilter;
}

export interface RecruitmentAssistantCountCandidatesResult {
  total: number;
  breakdown?: Array<{ key: string; count: number }>;
  resolved_skill_filter?: RecruitmentAssistantSkillFilter;
  debug?: unknown;
}

export interface RecruitmentAssistantQueryCandidatesArgs {
    scope: RecruitmentAssistantCountCandidatesArgs["scope"];
    position_ids?: number[];
    status_in?: string[];
    status_not_in?: string[];
    keyword?: string;
    fields: Array<"id" | "name" | "position_title" | "status" | "match_percent" | "updated_at">;
    sort?: { field: "updated_at" | "match_percent" | "created_at"; order: "asc" | "desc" };
    pagination?: RecruitmentAssistantPaginationInput;
    resolved_skill_filter?: RecruitmentAssistantSkillFilter;
}

export interface RecruitmentAssistantQueryCandidatesResult<TItem = unknown> {
  items: TItem[];
  page: RecruitmentAssistantPageInfo;
  resolved_skill_filter?: RecruitmentAssistantSkillFilter;
  debug?: unknown;
}

export interface RecruitmentAssistantQueryPositionsArgs {
    keyword?: string;
    status_in?: string[];
    fields: Array<"id" | "title" | "department" | "status" | "updated_at">;
    limit?: number;
}

export interface RecruitmentAssistantQueryMailRecipientsArgs {
    keyword?: string;
    fields: Array<"id" | "name" | "email" | "department" | "role_title">;
    limit?: number;
}

export interface RecruitmentAssistantRuntimeContext {
    position_id?: number | string | null;
    position_title?: string | null;
    candidate_id?: number | string | null;
    skill_ids: number[];
}

export interface RecruitmentAssistantRunRequest {
    message: string;
    context: RecruitmentAssistantRuntimeContext;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    clarification_response?: RecruitmentAssistantClarificationResponse | null;
    pagination?: RecruitmentAssistantPaginationInput;
}

export type RecruitmentAssistantStreamEventType =
    | "run.started"
    | "context.snapshot"
    | "resolution.result"
    | "tool.started"
    | "tool.result"
    | "message.started"
    | "message.delta"
    | "message.completed"
    | "clarification.required"
    | "run.completed"
    | "run.error"
    | "run.cancelled";

export interface RecruitmentAssistantStreamEvent<T = unknown> {
    run_id: string;
    seq: number;
    event: RecruitmentAssistantStreamEventType;
    ts: string;
    payload: T;
}

export interface RecruitmentAssistantRunStartedPayload {
    user_message_id: string;
    mode: "stream";
}

export interface RecruitmentAssistantContextSnapshotPayload {
    defaults: RecruitmentAssistantRuntimeContext;
    ephemeral_overrides?: Partial<RecruitmentAssistantRuntimeContext>;
}

export interface RecruitmentAssistantToolStartedPayload {
    tool_call_id: string;
    name: RecruitmentAssistantToolName;
    arguments: unknown;
}

export interface RecruitmentAssistantToolResultPayload {
    tool_call_id: string;
    name: RecruitmentAssistantToolName;
    result: unknown;
}

export interface RecruitmentAssistantMessageStartedPayload {
    message_id: string;
    role: "assistant";
    block_type: "text" | "summary" | "clarification";
}

export interface RecruitmentAssistantMessageDeltaPayload {
    message_id: string;
    delta: string;
}

export interface RecruitmentAssistantMessageCompletedPayload {
    message_id: string;
    content: string;
    page?: RecruitmentAssistantPageInfo;
}

export interface RecruitmentAssistantRunCompletedPayload {
    message_id: string;
    finish_reason: "completed";
    page?: RecruitmentAssistantPageInfo;
}

export interface RecruitmentAssistantRunErrorPayload {
    code: string;
    message: string;
    retryable: boolean;
}

export interface RecruitmentAssistantRunCancelledPayload {
    reason: "user_cancelled" | "connection_closed";
}
