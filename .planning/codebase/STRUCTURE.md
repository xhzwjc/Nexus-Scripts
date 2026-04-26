# Codebase Structure

**Analysis Date:** 2026-04-19

## Directory Layout

```
Nexus-Scripts/
├── fastApiProject/
│   └── app/
│       ├── routers/
│       │   └── recruitment.py          # API endpoints (994 lines)
│       ├── services/
│       │   ├── recruitment_service_impl.py  # Main business logic (13,235 lines)
│       │   ├── recruitment_ai_gateway.py    # LLM interaction (2,086 lines)
│       │   ├── recruitment_prompts.py      # Prompt utilities (358 lines)
│       │   ├── recruitment_mailer.py       # Email sending
│       │   ├── recruitment_publish_adapters.py  # Job posting adapters
│       │   └── recruitment_task_control.py # Task cancellation
│       ├── recruitment_models.py       # SQLAlchemy models (412 lines)
│       ├── recruitment_schemas.py      # Pydantic schemas (228 lines)
│       └── recruitment_skill_templates/  # AI prompt templates
│           ├── iot_screening_score_skill.md
│           ├── iot_interview_question_skill.md
│           └── iot_resume_screener.md
└── my-app/
    └── src/
        ├── components/Recruitment/
        │   ├── RecruitmentAutomationContainer.tsx  # Main layout
        │   ├── types.ts              # Frontend TypeScript types (673 lines)
        │   ├── utils.ts              # Shared utilities
        │   ├── components/
        │   │   └── SharedComponents.tsx
        │   └── pages/
        │       ├── WorkspacePage.tsx      # Dashboard (22KB)
        │       ├── CandidatesPage.tsx     # Candidate list (168KB)
        │       ├── AuditPage.tsx         # AI task audit (76KB)
        │       ├── AssistantPage.tsx      # Chat assistant
        │       ├── SkillSettingsPage.tsx  # Skill CRUD
        │       ├── ModelSettingsPage.tsx  # LLM config
        │       └── MailSettingsPage.tsx   # Email config
        └── lib/
            ├── recruitment-api.ts         # API client
            └── recruitment-assistant-protocol.ts  # Assistant protocol
```

## Directory Purposes

**`fastApiProject/app/routers/`:**
- Purpose: HTTP API endpoint definitions
- Contains: `recruitment.py` with 40+ endpoints
- Key patterns: Depends injection for service and auth

**`fastApiProject/app/services/`:**
- Purpose: Business logic and AI orchestration
- Contains: 6 service files
- Key file: `recruitment_service_impl.py` (13,235 lines - very large single file)

**`fastApiProject/app/recruitment_skill_templates/`:**
- Purpose: AI prompt templates (skills)
- Contains: 3 markdown skill templates
- Pattern: Loaded as content into `RecruitmentSkill` records

**`my-app/src/components/Recruitment/pages/`:**
- Purpose: React page components
- Contains: 8 page components
- Largest: `CandidatesPage.tsx` (168,260 bytes)

**`my-app/src/lib/`:**
- Purpose: Frontend API client and shared types
- Contains: `recruitment-api.ts`, `recruitment-assistant-protocol.ts`

## Key File Locations

**Entry Points:**
- Frontend container: `my-app/src/components/Recruitment/RecruitmentAutomationContainer.tsx`
- Backend router: `fastApiProject/app/routers/recruitment.py`

**Configuration:**
- Pydantic schemas: `fastApiProject/app/recruitment_schemas.py`
- Frontend types: `my-app/src/components/Recruitment/types.ts`

**Core Logic (recruitment_service_impl.py):**
- Position CRUD: lines 7058-7142 (`list_positions`, `create_position`, `update_position`, `delete_position`, `get_position_detail`)
- JD generation: lines 11575-11750 (`_run_generate_jd_task`, `start_generate_jd`, `generate_jd`, `save_jd_version`, `activate_jd_version`)
- Screening flow: lines ~7600-8000 (`upload_resume_files`, `_get_position_screening_payload`, `_screening_one_pass_flow`)
- Interview questions: lines 11224-11520 (`generate_interview_questions`, `stream_interview_question_preview`, `_build_interview_question_prompt`)
- Skills: lines 6224-6289 (`_get_position_skill_rows`, `_get_position_task_skill_ids`, `_sync_position_skill_links`)

**Testing:**
- Test file: `fastApiProject/tests/test_recruitment_screening_queue.py`
- Bootstrap: `bootstrap_resources_recruitment.py`

## Naming Conventions

**Files:**
- Python: `snake_case.py`
- TypeScript/React: `PascalCase.tsx` for components, `camelCase.ts` for utilities
- Skill templates: `kebab-case.md`

**Database Models:**
- Python class: `PascalCase` (e.g., `RecruitmentPosition`)
- Table name: `snake_case` (e.g., `recruitment_positions`)

**API Endpoints:**
- RESTful: `/positions`, `/candidates/{id}/screen`

## Where to Add New Code

**New Position Field:**
1. Add to `PositionCreateRequest`/`PositionUpdateRequest` in `recruitment_schemas.py`
2. Add column to `RecruitmentPosition` in `recruitment_models.py`
3. Update `_serialize_position` in `recruitment_service_impl.py`
4. Add to `PositionFormState` in `types.ts` if frontend needed

**New AI Task Type:**
1. Create skill template in `recruitment_skill_templates/*.md`
2. Add skill to database via bootstrap or admin UI
3. Add skill IDs to position's `jd_skill_ids`/`screening_skill_ids`/`interview_skill_ids`
4. Implement task runner method in `recruitment_service_impl.py`
5. Add endpoint in `routers/recruitment.py`

**New Page:**
1. Create component in `my-app/src/components/Recruitment/pages/`
2. Add route to `RecruitmentAutomationContainer.tsx`
3. Add locale strings to `types.ts` (`pageMeta`, `toast`)

**New API Endpoint:**
1. Add schema to `recruitment_schemas.py` if request/response
2. Add endpoint to `routers/recruitment.py`
3. Implement in `recruitment_service_impl.py`

## Special Directories

**`recruitment_skill_templates/`:**
- Purpose: Markdown-based AI prompt templates
- Generated: No (manually authored)
- Committed: Yes

**`.next/` (generated):**
- Purpose: Next.js build output
- Generated: Yes (on build)
- Committed: No (in .gitignore)

**`__pycache__/` (generated):**
- Purpose: Python bytecode cache
- Generated: Yes (on import)
- Committed: No (in .gitignore)

## Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/positions` | GET/POST | List/create positions |
| `/positions/{id}` | GET/PATCH/DELETE | Position CRUD |
| `/positions/{id}/generate-jd/start` | POST | Start JD generation async |
| `/positions/{id}/jd-versions` | GET/POST | JD version management |
| `/candidates` | GET | List candidates |
| `/candidates/{id}/screen/start` | POST | Start screening async |
| `/candidates/{id}/interview-questions/start` | POST | Generate interview questions |
| `/skills` | GET/POST | List/create skills |
| `/skills/{id}` | PATCH/DELETE | Update/delete skill |
| `/llm-configs` | GET/POST/PATCH/DELETE | LLM provider config |
| `/mail-senders` | GET/POST | Email sender config |
| `/chat` | POST | Chat assistant |
| `/ai-task-logs` | GET | Audit log viewing |

---

*Structure analysis: 2026-04-19*
