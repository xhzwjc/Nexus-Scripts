# Codebase Structure

**Analysis Date:** 2026-04-19

## Directory Layout

```
Nexus-Scripts/
├── fastApiProject/           # Python FastAPI backend
│   ├── app/                   # Main application code
│   │   ├── routers/           # API route handlers
│   │   ├── services/         # Business logic layer
│   │   ├── recruitment_skill_templates/  # Template files
│   │   └── templates/         # Jinja2 templates
│   ├── alembic/               # Database migrations
│   ├── tests/                 # Backend tests
│   ├── data/                  # Static data files
│   ├── static/                # Static assets (swagger UI)
│   ├── run.py                 # Backend entry point
│   ├── server_agent.py        # Agent mode entry
│   └── requirements.txt       # Python dependencies
├── my-app/                    # Next.js 15 frontend
│   ├── src/
│   │   ├── app/               # Next.js App Router pages
│   │   ├── components/        # React components
│   │   ├── lib/               # Utilities and API clients
│   │   └── pages/             # Legacy pages (if any)
│   ├── public/                # Static public assets
│   └── package.json           # Node dependencies
├── scripts/                   # Utility scripts
│   └── ai-resources-tools/    # AI resource management tools
├── nginx/                     # Nginx configuration
├── docker-compose.yml         # Container orchestration
└── .env                       # Environment variables (not committed)
```

## Directory Purposes

**fastApiProject/:**
- Purpose: Python FastAPI backend for the "春苗系统" (Chunmiao System)
- Contains: API routes, services, ORM models, schemas

**fastApiProject/app/routers/:**
- Purpose: API endpoint definitions
- Key files:
  - `recruitment.py` - AI recruitment automation endpoints
  - `auth_rbac.py` - Authentication and RBAC endpoints
  - `ai_resources.py` - AI resource management
  - `team_resources.py` - Team resource management
  - `business_core.py` - Business scene/task management
  - `tax_tools.py` - Tax calculation tools
  - `mobile_sms.py` - SMS sending endpoints
  - `monitoring.py` - System monitoring endpoints
  - `workbench.py` - Workbench endpoints
  - `settlement_sim.py` - Settlement simulation

**fastApiProject/app/services/:**
- Purpose: Business logic implementation
- Key files:
  - `recruitment_service_impl.py` - Core recruitment service (711KB, very large)
  - `ai_resource_service.py` - AI resource CRUD
  - `commission_service.py` - Commission calculations
  - `settlement_service.py` - Settlement logic
  - `monitoring_service.py` - Alert/monitoring logic
  - `sms_service.py` - SMS sending logic
  - `team_resource_service.py` - Team resource management
  - `biz_scene_task_service.py` - Business scene/task service

**my-app/src/app/:**
- Purpose: Next.js App Router pages and API routes
- Structure:
  - `page.tsx` - Home page
  - `layout.tsx` - Root layout
  - `api/` - API route handlers (proxy to backend)
  - `globals.css` - Global styles

**my-app/src/components/:**
- Purpose: React components
- Key files:
  - `AiAssistant.tsx` - AI assistant component (18KB)
  - `CommissionScript.tsx` - Commission script UI (59KB)
  - `SettlementScript.tsx` - Settlement UI (31KB)
  - `TaxCalculatorScript.tsx` - Tax calculator UI (72KB)
  - `TaxReportManagement.tsx` - Tax report management (96KB)
  - `BizSceneTaskScript.tsx` - Business task UI (35KB)
  - `DeliveryScript.tsx` - Delivery script UI (70KB)
  - `BatchSmsScript.tsx` - Batch SMS UI (110KB)
  - `AppShell/` - App shell with navigation
  - `Recruitment/` - Recruitment components
  - `AIResources/` - AI resources components
  - `TeamResources/` - Team resources components

**my-app/src/lib/:**
- Purpose: Utilities, API clients, helpers
- Key files:
  - `api.ts` - Main API client
  - `auth.ts` - Authentication helpers
  - `utils.ts` - General utilities
  - `i18n/index.ts` - Internationalization
  - `recruitment-api.ts` - Recruitment API client
  - `server/` - Server-side utilities

## Key File Locations

**Entry Points:**
- `fastApiProject/run.py` - Backend development server
- `fastApiProject/server_agent.py` - Backend agent mode
- `my-app/src/app/page.tsx` - Frontend home page

**Configuration:**
- `fastApiProject/app/config.py` - Environment-based config
- `fastApiProject/app/database.py` - Database connection
- `fastApiProject/app/main.py` - FastAPI app setup
- `my-app/next.config.ts` - Next.js configuration

**Core Models:**
- `fastApiProject/app/models.py` - Main SQLAlchemy models (42KB)
- `fastApiProject/app/orm_models.py` - ORM model definitions
- `fastApiProject/app/rbac_models.py` - RBAC models
- `fastApiProject/app/recruitment_models.py` - Recruitment domain models

**Schemas:**
- `fastApiProject/app/recruitment_schemas.py` - Recruitment Pydantic schemas
- `fastApiProject/app/rbac_schemas.py` - RBAC Pydantic schemas

## Naming Conventions

**Files:**
- Python: `snake_case.py`
- TypeScript/React: `PascalCase.tsx` for components, `camelCase.ts` for utilities

**Directories:**
- `routers/` - Plural, snake_case
- `services/` - Plural, snake_case
- `components/` - PascalCase subdirs per feature

**Functions/Classes:**
- Python: `PascalCase` for classes, `snake_case` for functions
- TypeScript: `camelCase` for functions/variables, `PascalCase` for components

## Where to Add New Code

**New API Endpoint:**
1. Add route in appropriate router file: `fastApiProject/app/routers/{domain}.py`
2. Add service method in: `fastApiProject/app/services/{domain}_service.py`
3. Add schema in: `fastApiProject/app/{domain}_schemas.py`
4. Add model in: `fastApiProject/app/models.py`

**New Frontend Component:**
1. Create in: `my-app/src/components/{Feature}/`
2. Export from: `my-app/src/components/{Feature}/index.ts`
3. Import in parent page

**New API Route (Next.js):**
1. Create file: `my-app/src/app/api/{feature}/route.ts`
2. Use `api.ts` client to proxy to backend

**New Service Logic:**
1. Add method to existing service in `fastApiProject/app/services/`
2. Or create new service file following existing patterns

**Tests:**
1. Backend: `fastApiProject/tests/test_{feature}.py`
2. Frontend: Co-located `*.test.ts` files

## Special Directories

**alembic/:**
- Purpose: Database migration scripts
- Committed: Yes
- Generated via: `alembic revision --autogenerate`

**static/swagger/:**
- Purpose: Local Swagger UI assets
- Committed: Yes
- Used by: Custom `/docs` route in main.py

**node_modules/:**
- Purpose: npm dependencies
- Generated: Yes
- Committed: No (.gitignore)

**venv/:**
- Purpose: Python virtual environment
- Generated: Yes
- Committed: No (.gitignore)

**data/:**
- Purpose: Static JSON data (templates, test data)
- Committed: Yes

**public/ai-logos/:**
- Purpose: AI tool logos/images
- Committed: Yes

---

*Structure analysis: 2026-04-19*
