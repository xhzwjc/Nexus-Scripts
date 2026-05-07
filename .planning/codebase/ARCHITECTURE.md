# Architecture

**Analysis Date:** 2026-04-19

## Pattern Overview

**Overall:** Client-Server with AI Gateway Pattern

**Key Characteristics:**
- Split architecture: Next.js frontend (`my-app/`) + FastAPI backend (`fastApiProject/`)
- AI orchestration through a dedicated gateway service (`RecruitmentAIGateway`)
- Skill-based prompt templating system for different AI tasks
- Task-based async processing with logging and retry support
- Multi-stage pipeline: JD Generation -> Resume Screening -> Interview Questions

## Layers

**Frontend (Next.js):**
- Purpose: UI for recruitment management
- Location: `my-app/src/components/Recruitment/`
- Contains: Pages (Workspace, Candidates, Audit, Assistant, Settings), SharedComponents, types
- Depends on: Backend REST API via `recruitment-api.ts`

**API Router:**
- Purpose: HTTP endpoint definitions and request validation
- Location: `fastApiProject/app/routers/recruitment.py`
- Contains: 40+ endpoints for positions, candidates, skills, AI tasks, mail, chat
- Depends on: RecruitmentService

**Service Layer:**
- Purpose: Business logic orchestration
- Location: `fastApiProject/app/services/recruitment_service_impl.py` (13,235 lines)
- Contains: Position CRUD, candidate management, screening orchestration, JD generation, interview question generation
- Depends on: RecruitmentAIGateway, database models

**AI Gateway:**
- Purpose: LLM interaction abstraction with retry, timeout, and JSON parsing
- Location: `fastApiProject/app/services/recruitment_ai_gateway.py`
- Contains: Multi-provider support (OpenAI, Claude, Gemini, DeepSeek, etc.), streaming, fallback handling
- Depends on: External LLM APIs

**Data Models:**
- Purpose: Database schema definitions
- Location: `fastApiProject/app/recruitment_models.py`
- Contains: 20+ SQLAlchemy models for positions, candidates, skills, scores, mail, etc.

**Prompt Templates:**
- Purpose: Skill-based prompt templates for AI tasks
- Location: `fastApiProject/app/recruitment_skill_templates/`
- Contains: Markdown-based skill definitions (screening, interview questions, resume)

## Data Flow

**Position Creation Flow:**
1. POST `/positions` with `PositionCreateRequest`
2. Service creates `RecruitmentPosition` record
3. Skill links created via `RecruitmentPositionSkillLink`

**JD Generation Flow:**
1. POST `/positions/{id}/generate-jd/start`
2. Service creates `RecruitmentAITaskLog` entry
3. Background thread runs `_run_generate_jd_task`:
   - Loads position data via `_serialize_position_for_jd_prompt`
   - Resolves JD skills via `_resolve_jd_skills`
   - Calls `RecruitmentAIGateway` to generate content
   - Saves result as `RecruitmentJDVersion`
   - Optionally activates version

**Resume Screening Flow:**
1. POST `/candidates/{id}/screen/start`
2. Service creates screening task with `_screening_one_pass_flow`:
   - Parses resume via `_run_resume_parse_task`
   - Scores via `_run_resume_score_task` using screening skills
   - Auto-advances if enabled

**Interview Question Generation Flow:**
1. POST `/candidates/{id}/interview-questions/start`
2. Service builds prompt via `_build_interview_question_prompt`:
   - Uses candidate parse results, screening scores, position context
   - Resolves interview skills via `_resolve_interview_skills`
   - Generates HTML and Markdown output

**State Management:**
- Positions: `status` field (draft, recruiting, paused, closed)
- Candidates: `status` field (pending_screening, screening_passed, interview_passed, etc.)
- Tasks: Tracked via `RecruitmentAITaskLog` with `screening_run_id` for batch grouping

## Key Abstractions

**Skill System:**
- Purpose: Configurable prompt building blocks for AI tasks
- Examples: `iot_screening_score_skill.md`, `iot_interview_question_skill.md`
- Pattern: Markdown files with structured sections loaded into `RecruitmentSkill.content`
- Three skill types per position: `jd_skill_ids`, `screening_skill_ids`, `interview_skill_ids`

**AI Task Logging:**
- Purpose: Audit trail for all AI operations
- Location: `RecruitmentAITaskLog` model
- Pattern: Logs prompt snapshots, raw responses, parsed outputs, timing, token usage

**Workflow Memory:**
- Purpose: Per-candidate persistent context across screening stages
- Location: `RecruitmentCandidateWorkflowMemory` model
- Pattern: Stores latest parse/score IDs, skill configurations for reuse

## Entry Points

**Frontend Container:**
- Location: `my-app/src/components/Recruitment/RecruitmentAutomationContainer.tsx`
- Triggers: User navigation to recruitment module
- Responsibilities: Page routing, layout, global state

**Backend API:**
- Location: `fastApiProject/app/routers/recruitment.py`
- Triggers: HTTP requests from frontend
- Responsibilities: Auth, validation, service delegation

**Background Tasks:**
- Location: `recruitment_service_impl.py` methods starting with `_run_*`
- Triggers: Async task start endpoints
- Responsibilities: Long-running AI operations (JD generation, screening)

## Error Handling

**Strategy:** Task-level error tracking with fallback responses

**Patterns:**
- AI timeout: `RecruitmentAITimeoutError` triggers fallback in gateway
- Retry exhaustion: `RecruitmentAIRetryExhaustedError` logged to task
- JSON parse failure: `RecruitmentAIJSONParseError` with raw text captured
- All errors stored in `RecruitmentAITaskLog.error_message`

## Cross-Cutting Concerns

**Logging:** `RecruitmentAITaskLog` for AI operations, standard logging for service
**Validation:** Pydantic schemas (`recruitment_schemas.py`) for all requests
**Authentication:** `require_script_hub_permission` dependency on all endpoints
**i18n:** Full zh-CN/en-US support in frontend types and locale bundles

---

*Architecture analysis: 2026-04-19*
