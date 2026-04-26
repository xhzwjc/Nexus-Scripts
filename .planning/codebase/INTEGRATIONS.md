# External Integrations

**Analysis Date:** 2026-04-19

## APIs & External Services

**AI/ML Services:**
- Google AI Studio (GEMINI) - AI model inference
  - Auth: `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_AI_STUDIO_API_KEY`
  - Config: `GEMINI_API_BASE`, `GEMINI_TIMEOUT_MS`, `GEMINI_PROXY_URL`
- OpenAI - AI model inference
  - Auth: `AI_API_KEY`
  - Config: `AI_BASE_URL`, `AI_MODEL_NAME`
- HuggingFace Hub - ML model hosting
  - Auth: `HF_TOKEN` (inferred from HuggingFace hub library)

**SMS Services:**
- External SMS API (multiple environments)
  - Test: `SMS_API_BASE_TEST`, `SMS_AUTH_TOKEN_TEST`, `SMS_ORIGIN_TEST`, `SMS_REFERER_TEST`
  - Prod: `SMS_API_BASE_PROD`, `SMS_AUTH_TOKEN_PROD`, `SMS_ORIGIN_PROD`, `SMS_REFERER_PROD`
- SMS Admin Portal (multiple environments)
  - Test: `SMS_ADMIN_API_URL_TEST`, `SMS_ADMIN_TENANT_ID_TEST`, `SMS_ADMIN_USERNAME_TEST`, `SMS_ADMIN_PASSWORD_TEST`
  - Prod: `SMS_ADMIN_API_URL_PROD`, `SMS_ADMIN_TENANT_ID_PROD`, `SMS_ADMIN_USERNAME_PROD`, `SMS_ADMIN_PASSWORD_PROD`
  - Config: `SMS_ADMIN_TENANT_NAME_*`, `SMS_ADMIN_CAPTCHA_CODE`, `SMS_ADMIN_CAPTCHA_ID`

## Data Storage

**Databases:**
- MySQL (multiple instances)
  - Test: `DB_TEST_HOST`, `DB_TEST_PORT`, `DB_TEST_USER`, `DB_TEST_PASSWORD`, `DB_TEST_DATABASE`
  - Prod: `DB_PROD_HOST`, `DB_PROD_PORT`, `DB_PROD_USER`, `DB_PROD_PASSWORD`, `DB_PROD_DATABASE`
  - Local: `DB_LOCAL_HOST`, `DB_LOCAL_PORT`, `DB_LOCAL_USER`, `DB_LOCAL_PASSWORD`, `DB_LOCAL_DATABASE`
  - Driver: PyMySQL 1.1.1 with SQLAlchemy 2.0.41

**File Storage:**
- Local Docker volumes for ML model caching
  - `paddlex_models` - PaddleX model cache at `/root/.paddlex`
  - `paddle_models` - PaddleOCR model cache at `/root/.paddleocr`
- Local filesystem for uploads (via nginx proxy up to 2GB)

**Caching:**
- None detected (no Redis or Memcached in stack)

## Authentication & Identity

**Session Management:**
- Script Hub session secret
  - Env: `SCRIPT_HUB_SESSION_SECRET`
- Access keys system
  - Env: `SCRIPT_HUB_ACCESS_KEYS_JSON` (JSON array of access keys)

**API Authentication:**
- Custom access key authentication (`legacy_access_keys.py`)
- Session-based authentication for web users

**Password Encryption:**
- `TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY` - For encrypting team resource passwords
- `TEAM_RESOURCES_EXPORT_ENCRYPTION_KEY` - For export encryption

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Rollbar, or similar)

**Logs:**
- Server logs: `fastapiProject/server.log`
- Gunicorn/uvicorn access and error logs (stdout/stderr in Docker)

## CI/CD & Deployment

**Hosting:**
- Self-hosted via Docker Compose
- Services: nginx (reverse proxy), frontend (Next.js), fastapi (FastAPI)

**Container Registry:**
- Images tagged: `project-root-frontend:v1.0.0`, `project-root-fastapi:v1.0.0`

## Environment Configuration

**Required env vars:**
- Database: `DB_*_HOST`, `DB_*_PORT`, `DB_*_USER`, `DB_*_PASSWORD`, `DB_*_DATABASE`
- AI: `AI_API_KEY`, `GEMINI_API_KEY`
- SMS: `SMS_API_BASE_*`, `SMS_AUTH_TOKEN_*`
- Session: `SCRIPT_HUB_SESSION_SECRET`, `SCRIPT_HUB_ACCESS_KEYS_JSON`
- Encryption: `TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY`, `TEAM_RESOURCES_EXPORT_ENCRYPTION_KEY`
- Base URLs: `BASE_URL_TEST`, `BASE_URL_PROD`, `BASE_URL_LOCAL`

**Secrets location:**
- `.env` file (exists, not committed - contains actual secrets)
- `.env.example` (committed, no secrets)
- Docker Compose environment sections

## Webhooks & Callbacks

**Incoming:**
- None detected in codebase

**Outgoing:**
- SMS API calls (outbound SMS)
- AI Studio API calls (Gemini, OpenAI)
- HuggingFace Hub (model downloads)

## Service Architecture

**Proxy Routing (nginx):**
- `/api/admin` - Next.js BFF to frontend:3000
- `/api/agent-chat` - Next.js BFF to frontend:3000
- `/api/ai-resources` - Next.js BFF to frontend:3000
- `/api/auth` - Next.js BFF to frontend:3000
- `/api/extract-file` - Next.js BFF to frontend:3000
- `/api/health-check` - Next.js BFF to frontend:3000
- `/api/recruitment` - Next.js BFF to frontend:3000
- `/api/resources` - Next.js BFF to frontend:3000
- `/api/team-resources` - Next.js BFF to frontend:3000
- `/api/*` (other) - FastAPI backend to fastapi:8091
- `/*` (static) - Next.js frontend to frontend:3000

---

*Integration audit: 2026-04-19*
