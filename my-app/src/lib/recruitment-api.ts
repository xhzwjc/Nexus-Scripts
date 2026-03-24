"use client";

import { authenticatedFetch } from "@/lib/auth";

export interface RecruitmentOption {
  value: string;
  label: string;
}

export interface RecruitmentMetadata {
  candidate_statuses: RecruitmentOption[];
  position_statuses: RecruitmentOption[];
  publish_platforms: RecruitmentOption[];
  publish_modes: RecruitmentOption[];
  ai_task_types: string[];
  llm_provider_options: RecruitmentOption[];
  llm_task_types: RecruitmentOption[];
}

export interface PositionSummary {
  id: number;
  position_code: string;
  title: string;
  department?: string | null;
  location?: string | null;
  employment_type?: string | null;
  salary_range?: string | null;
  headcount: number;
  key_requirements?: string | null;
  bonus_points?: string | null;
  summary?: string | null;
  status: string;
  auto_screen_on_upload?: boolean;
  auto_advance_on_screening?: boolean;
  jd_skill_ids?: number[];
  jd_skills?: RecruitmentSkill[];
  screening_skill_ids?: number[];
  screening_skills?: RecruitmentSkill[];
  interview_skill_ids?: number[];
  interview_skills?: RecruitmentSkill[];
  tags: string[];
  current_jd_version_id?: number | null;
  current_jd_title?: string | null;
  jd_version_count: number;
  candidate_count: number;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface JDVersion {
  id: number;
  position_id: number;
  version_no: number;
  title: string;
  prompt_snapshot?: string | null;
  jd_markdown: string;
  jd_html?: string | null;
  publish_text?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_by?: string | null;
  created_at?: string | null;
}

export interface JDGenerationState {
  status: string;
  task_id?: number | null;
  last_generated_at?: string | null;
  started_at?: string | null;
  error_message?: string | null;
  model_provider?: string | null;
  model_name?: string | null;
}

export interface PublishTask {
  id: number;
  position_id: number;
  target_platform: string;
  mode: string;
  adapter_code?: string | null;
  status: string;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
  published_url?: string | null;
  screenshot_path?: string | null;
  retry_count?: number | null;
  error_message?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CandidateSummary {
  id: number;
  candidate_code: string;
  position_id?: number | null;
  position_title?: string | null;
  position_auto_screen_on_upload?: boolean;
  position_jd_skill_ids?: number[];
  position_jd_skills?: RecruitmentSkill[];
  position_screening_skill_ids?: number[];
  position_screening_skills?: RecruitmentSkill[];
  position_interview_skill_ids?: number[];
  position_interview_skills?: RecruitmentSkill[];
  name: string;
  phone?: string | null;
  email?: string | null;
  current_company?: string | null;
  years_of_experience?: string | null;
  education?: string | null;
  source?: string | null;
  source_detail?: string | null;
  status: string;
  ai_recommended_status?: string | null;
  match_percent?: number | null;
  tags: string[];
  notes?: string | null;
  latest_resume_file_id?: number | null;
  latest_parse_result_id?: number | null;
  latest_score_id?: number | null;
  latest_total_score?: number | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ResumeFile {
  id: number;
  candidate_id: number;
  original_name: string;
  stored_name: string;
  file_ext?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  parse_status: string;
  parse_error?: string | null;
  created_at?: string | null;
}

export interface ResumeParseResult {
  id: number;
  candidate_id: number;
  resume_file_id: number;
  raw_text: string;
  basic_info: Record<string, unknown>;
  work_experiences: unknown[];
  education_experiences: unknown[];
  skills: unknown[];
  projects: unknown[];
  summary?: string | null;
  status: string;
  error_message?: string | null;
  created_at?: string | null;
}

export interface CandidateScore {
  id: number;
  candidate_id: number;
  parse_result_id: number;
  total_score?: number | null;
  total_score_scale?: number | null;
  match_percent?: number | null;
  advantages?: string[];
  concerns?: string[];
  advantages_text?: string | null;
  concerns_text?: string | null;
  recommendation?: string | null;
  suggested_status?: string | null;
  manual_override_score?: number | null;
  manual_override_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface CandidateStatusHistory {
  id: number;
  candidate_id: number;
  from_status?: string | null;
  to_status: string;
  reason?: string | null;
  changed_by?: string | null;
  source?: string | null;
  created_at?: string | null;
}

export interface InterviewQuestion {
  id: number;
  round_name: string;
  custom_requirements?: string | null;
  skill_ids?: number[];
  html_content: string;
  markdown_content: string;
  status: string;
  created_by?: string | null;
  created_at?: string | null;
}

export interface RecruitmentSkill {
  id: number;
  skill_code: string;
  name: string;
  description?: string | null;
  content: string;
  tags: string[];
  sort_order: number;
  is_enabled: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RecruitmentLLMConfig {
  id: number;
  config_key: string;
  task_type: string;
  provider: string;
  model_name: string;
  base_url?: string | null;
  api_key_env?: string | null;
  api_key_masked?: string | null;
  has_stored_api_key: boolean;
  has_runtime_api_key: boolean;
  extra_config?: Record<string, unknown> | null;
  is_active: boolean;
  priority: number;
  resolved_provider?: string | null;
  resolved_model_name?: string | null;
  resolved_base_url?: string | null;
  resolved_source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AITaskLog {
  id: number;
  task_type: string;
  related_position_id?: number | null;
  related_candidate_id?: number | null;
  related_skill_id?: number | null;
  related_skill_ids?: number[];
  related_skill_snapshots?: RecruitmentSkill[];
  related_resume_file_id?: number | null;
  related_publish_task_id?: number | null;
  memory_source?: string | null;
  request_hash?: string | null;
  model_provider?: string | null;
  model_name?: string | null;
  prompt_snapshot?: string | null;
  full_request_snapshot?: string | null;
  input_summary?: string | null;
  output_summary?: string | null;
  output_snapshot?: unknown;
  duration_ms?: number | null;
  status: string;
  error_message?: string | null;
  token_usage?: Record<string, unknown> | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DashboardData {
  cards: {
    positions_total: number;
    positions_recruiting: number;
    candidates_total: number;
    pending_screening: number;
    screening_passed: number;
    recent_ai_tasks: number;
  };
  status_distribution: Array<{ status: string; count: number }>;
  recent_candidates: CandidateSummary[];
}

export interface PositionDetail {
  position: PositionSummary;
  current_jd_version?: JDVersion | null;
  jd_versions: JDVersion[];
  jd_generation?: JDGenerationState | null;
  publish_tasks: PublishTask[];
  candidates: CandidateSummary[];
}

export interface CandidateWorkflowMemory {
  id: number;
  candidate_id: number;
  position_id?: number | null;
  screening_skill_ids: number[];
  screening_skills: RecruitmentSkill[];
  screening_memory_source?: string | null;
  screening_rule_snapshot?: Record<string, unknown> | null;
  latest_parse_result_id?: number | null;
  latest_score_id?: number | null;
  last_screened_at?: string | null;
  interview_skill_ids: number[];
  interview_skills: RecruitmentSkill[];
  last_interview_question_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CandidateDetail {
  candidate: CandidateSummary;
  resume_files: ResumeFile[];
  parse_result?: ResumeParseResult | null;
  score?: CandidateScore | null;
  workflow_memory?: CandidateWorkflowMemory | null;
  status_history: CandidateStatusHistory[];
  interview_questions: InterviewQuestion[];
  activity: AITaskLog[];
}

export interface ChatContext {
  position_id?: number | null;
  position_title?: string | null;
  candidate_id?: number | null;
  skill_ids: number[];
  skills: RecruitmentSkill[];
  updated_at?: string | null;
}

export interface ChatResponse {
  reply: string;
  context: ChatContext;
  actions?: string[];
  question?: InterviewQuestion | null;
  log_id?: number | null;
  memory_source?: string | null;
  model_provider?: string | null;
  model_name?: string | null;
  used_skill_ids?: number[];
  used_skills?: RecruitmentSkill[];
  used_fallback?: boolean;
  fallback_error?: string | null;
}

export interface RecruitmentMailSenderConfig {
  id: number;
  name: string;
  from_name?: string | null;
  from_email: string;
  smtp_host: string;
  smtp_port: number;
  username: string;
  password_masked?: string | null;
  has_password: boolean;
  use_ssl: boolean;
  use_starttls: boolean;
  is_default: boolean;
  is_enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RecruitmentMailRecipient {
  id: number;
  name: string;
  email: string;
  department?: string | null;
  role_title?: string | null;
  tags: string[];
  notes?: string | null;
  is_enabled: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RecruitmentResumeMailDispatch {
  id: number;
  sender_config_id?: number | null;
  sender_name?: string | null;
  candidate_ids: number[];
  recipient_ids: number[];
  recipient_emails: string[];
  subject?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  attachment_count: number;
  status: string;
  error_message?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  detail?: string;
}

function stringifyApiError(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stringifyApiError(item)).filter(Boolean).join("; ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.msg === "string" && Array.isArray(record.loc)) {
      return `${record.loc.join(".")}: ${record.msg}`;
    }
    return (
      stringifyApiError(record.error)
      || stringifyApiError(record.detail)
      || stringifyApiError(record.message)
      || JSON.stringify(record)
    );
  }
  return String(value);
}

async function parseError(response: Response, payload: ApiEnvelope<unknown> | null, rawText: string) {
  const message = stringifyApiError(payload?.error) || stringifyApiError(payload?.detail);
  if (message) {
    return message;
  }

  if (rawText) {
    if (!payload) {
      try {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        const parsedMessage = stringifyApiError(parsed.error) || stringifyApiError(parsed.detail) || stringifyApiError(parsed.message);
        if (parsedMessage) {
          return parsedMessage;
        }
      } catch {
        // Keep the original raw text when the response is not JSON.
      }
    }
    return rawText;
  }

  return `Request failed (${response.status})`;
}

export async function recruitmentApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers = new Headers(init.headers);

  if (!isFormData && init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await authenticatedFetch(`/api/recruitment${path}`, {
    ...init,
    headers,
    cache: "no-store",
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
    throw new Error(await parseError(response, payload, raw));
  }

  if (!payload || typeof payload !== "object") {
    return undefined as T;
  }

  if (!("data" in payload)) {
    if (payload.success !== false) {
      return undefined as T;
    }
    throw new Error("Invalid recruitment response");
  }

  return payload.data as T;
}

export function joinTags(value: string[] | null | undefined) {
  return (value || []).join(", ");
}

export function splitTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
