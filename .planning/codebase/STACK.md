# Technology Stack

**Analysis Date:** 2026-04-19

## Languages

**Primary:**
- Python 3.12 - FastAPI backend, data processing, ML services
- TypeScript - Next.js frontend application
- JavaScript - Next.js frontend (React components)

## Runtime

**Environment:**
- Python 3.12-slim (Docker container)
- Node.js 20+ (Next.js 15.4.4)
- pnpm package manager (frontend)

## Frameworks

**Backend (FastAPI):**
- FastAPI 0.116.1 - REST API framework
- uvicorn 0.35.0 - ASGI server
- gunicorn 21.2.0 - WSGI server (production)
- Starlette 0.47.2 - ASGI framework (FastAPI dependency)

**Frontend (Next.js):**
- Next.js 15.4.4 - React framework with App Router
- React 19.1.0 - UI library
- Tailwind CSS 4 - Utility-first CSS
- Radix UI (multiple packages) - Headless UI components
- Framer Motion 12.23.26 - Animation library
- Recharts 3.7.0 - Chart library
- React Hook Form 7.61.1 - Form management
- Zod 4.0.11 - Schema validation

**Database:**
- SQLAlchemy 2.0.41 - ORM
- Alembic - Database migrations
- PyMySQL 1.1.1 - MySQL driver
- Pandas 2.3.3 - Data analysis

**ML/AI:**
- PaddlePaddle 3.2.2 - Deep learning framework
- PaddleOCR 3.3.2 - OCR library
- PaddleX 3.3.1.0 - ML toolkit
- OpenCV 4.12.0.88 - Computer vision
- HuggingFace Hub 0.21.4 - ML model hosting
- LangChain 0.2.4+ - LLM application framework
- OpenAI 1.63.2 - OpenAI API client
- aistudio-sdk 0.3.8 - AI Studio integration

**Utilities:**
- orjson 3.11.4 - Fast JSON
- python-multipart 0.0.20 - File uploads
- python-dotenv 1.1.1 - Environment variables
- pydantic 2.12.5 - Data validation
- bcrypt - Password hashing (via PyCryptodome)
- ujson 5.11.0 - JSON parsing

## Configuration

**Environment:**
- Python: `.env` files via `python-dotenv`
- Next.js: `NEXT_PUBLIC_*` prefixed variables for client-side
- Docker Compose environment sections for service configuration

**Build:**
- `fastApiProject/Dockerfile` - Python 3.12-slim base, gunicorn+uvicorn
- `my-app/` - Next.js build (npm/pnpm)
- `docker-compose.yml` - Service orchestration

## Platform Requirements

**Development:**
- Docker and Docker Compose
- Python 3.12+ (if running natively)
- Node.js 20+ (if running frontend natively)

**Production:**
- Docker containers orchestrated via docker-compose
- Nginx reverse proxy on port 8090
- Services exposed on internal Docker network

---

*Stack analysis: 2026-04-19*
