# Architecture

**Analysis Date:** 2026-04-19

## Pattern Overview

**Overall:** Layered Architecture with Service-Oriented Components

**Key Characteristics:**
- FastAPI backend with router-service-model layered separation
- Next.js 15 frontend with component-based architecture
- MySQL database with SQLAlchemy ORM
- Nginx reverse proxy for container orchestration
- Session-based authentication with API key access

## Layers

**Routers (API Layer):**
- Purpose: Handle HTTP requests, input validation, authentication
- Location: `fastApiProject/app/routers/`
- Contains: `recruitment.py`, `auth_rbac.py`, `ai_resources.py`, `team_resources.py`, `business_core.py`, `tax_tools.py`, `mobile_sms.py`, `monitoring.py`, `workbench.py`, `settlement_sim.py`
- Depends on: Services, Schemas
- Pattern: FastAPI APIRouter with dependency injection for auth

**Services (Business Logic Layer):**
- Purpose: Encapsulate business logic, interact with database
- Location: `fastApiProject/app/services/`
- Contains: `recruitment_service_impl.py`, `ai_resource_service.py`, `commission_service.py`, `settlement_service.py`, `monitoring_service.py`, `sms_service.py`, `team_resource_service.py`, etc.
- Pattern: Transaction script pattern per domain

**Models (Data Layer):**
- Purpose: ORM models and database schema definitions
- Location: `fastApiProject/app/models.py`, `orm_models.py`, `recruitment_models.py`, `rbac_models.py`
- Contains: SQLAlchemy declarative models
- Pattern: Active record pattern via SQLAlchemy

**Schemas (Validation Layer):**
- Purpose: Pydantic models for request/response validation
- Location: `fastApiProject/app/recruitment_schemas.py`, `rbac_schemas.py`
- Pattern: Pydantic BaseModel for DTOs

**Frontend (Presentation Layer):**
- Location: `my-app/src/`
- Pattern: Next.js 15 App Router with React 19 components
- Components: Large single-file components (AiAssistant.tsx, CommissionScript.tsx, etc.)

## Data Flow

**Typical API Request Flow:**

1. Client -> Nginx (port 8090) -> FastAPI (port 8091)
2. Router receives request, applies `require_script_hub_permission` dependency
3. Service layer instantiated via `Depends(get_recruitment_service)`
4. Service executes business logic, queries/updates via SQLAlchemy ORM
5. Response serialized via Pydantic schemas
6. Audit log written via `write_audit_log`

**Authentication Flow:**
- Access key stored in `SCRIPT_HUB_ACCESS_KEYS_JSON` environment variable
- Keys rotated via `rotate_script_hub_access_keys.py`
- Session created via `create_script_hub_session` with JWT-like tokens
- Permission checked via `require_script_hub_permission(permission_code)`

**Database Connection:**
- SQLAlchemy `SessionLocal` created from config
- MySQL with connection pooling (pool_size=5, max_overflow=10)
- `pool_pre_ping=True` for connection health checks
- Database selected based on `ENVIRONMENT` env var (local/test/prod)

## Key Abstractions

**ScriptHubSession:**
- Purpose: Session management for Script Hub users
- File: `fastApiProject/app/script_hub_session.py`
- Pattern: Token-based session with permission checking

**RecruitmentService:**
- Purpose: Core recruitment automation business logic
- File: `fastApiProject/app/services/recruitment_service_impl.py` (711KB - very large)
- Pattern: Transaction script with LLM integration

**RBAC System:**
- Files: `fastApiProject/app/rbac_models.py`, `rbac_schemas.py`
- Components: Roles, permissions, user-access key associations
- Service: `script_hub_admin_service.py`, `script_hub_auth_service.py`

**Commission/Settlement:**
- Files: `commission_service.py`, `settlement_service.py`
- Purpose: Financial calculations for the settlement system

## Entry Points

**Backend:**
- Location: `fastApiProject/run.py`
- Starts uvicorn on configurable host/port
- Production: `server_agent.py` for agent mode

**Frontend:**
- Location: `my-app/src/app/page.tsx`
- Next.js dev server on port 3000
- Docker: nginx on port 8090

**Scripts:**
- Location: `scripts/` and `fastApiProject/` root
- Bootstrap: `bootstrap_script_hub_rbac.py`, `bootstrap_resources_recruitment.py`
- Migration: `migrate_resources.py`, `migrate_team_resources.py`

## Error Handling

**Strategy:** Structured JSON responses with success flag

**Patterns:**
```python
return {"success": True, "data": service.get_metadata(), "request_id": str(uuid.uuid4())}
return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}
```

**Error Types:**
- HTTPException for validation/auth errors
- RecruitmentConflictError for business logic conflicts
- RecruitmentTaskCancelled for async task cancellation

## Cross-Cutting Concerns

**Logging:** Python logging module with structured format
**Validation:** Pydantic schemas for all inputs
**Authentication:** Access key + session token dual mechanism
**CORS:** Configured via `settings.cors_allow_origins` in config.py
**Monitoring:** Background asyncio loop calling `check_and_alert()` hourly

---

*Architecture analysis: 2026-04-19*
