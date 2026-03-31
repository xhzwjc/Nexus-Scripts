import json
import queue
import threading
import time
import uuid
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..recruitment_schemas import (
    CandidateStatusUpdateRequest,
    CandidateScreenRequest,
    CandidateUpdateRequest,
    InterviewQuestionGenerateRequest,
    JDGenerateRequest,
    PositionCreateRequest,
    PositionUpdateRequest,
    PublishTaskCreateRequest,
    RecruitmentChatContextUpdateRequest,
    RecruitmentChatRequest,
    RecruitmentLLMConfigUpsertRequest,
    RecruitmentMailRecipientUpsertRequest,
    RecruitmentMailSenderUpsertRequest,
    RecruitmentResumeMailSendRequest,
    SaveJDVersionRequest,
    SkillUpsertRequest,
)
from ..schema_maintenance import ensure_recruitment_schema
from ..script_hub_session import require_script_hub_permission
from ..services.recruitment_service import RecruitmentConflictError, RecruitmentService
from ..services.recruitment_task_control import RecruitmentTaskCancelled
from ..services.script_hub_audit_service import write_audit_log
recruitment_router = APIRouter(prefix="/recruitment", tags=["AI 招聘自动化管理"])


def get_recruitment_service(db: Session = Depends(get_db)) -> RecruitmentService:
    ensure_recruitment_schema()
    return RecruitmentService(db)


def _run_recruitment_service_call(method_name: str, *args: Any, **kwargs: Any) -> Any:
    ensure_recruitment_schema()
    db = SessionLocal()
    try:
        service = RecruitmentService(db)
        method = getattr(service, method_name)
        return method(*args, **kwargs)
    finally:
        db.close()


def _encode_sse_event(event: str, payload: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@recruitment_router.get("/metadata")
async def get_metadata(_session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    return {"success": True, "data": service.get_metadata(), "request_id": str(uuid.uuid4())}


@recruitment_router.get("/dashboard")
async def get_dashboard(_session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    return {"success": True, "data": service.get_dashboard(), "request_id": str(uuid.uuid4())}


@recruitment_router.get("/positions")
async def list_positions(query: Optional[str] = Query(None), status: Optional[str] = Query(None), _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_positions(query=query, status=status)
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/positions")
async def create_position(http_request: Request, payload: PositionCreateRequest, db: Session = Depends(get_db), session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.create_position(payload.model_dump(), session.get("id") or "unknown")
    write_audit_log(db, actor=session, request=http_request, action="recruitment.position.create", target_type="recruitment-position", target_code=data["position_code"], details={"title": data["title"]})
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}


@recruitment_router.get("/positions/{position_id}")
async def get_position_detail(position_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        return {"success": True, "data": service.get_position_detail(position_id), "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.patch("/positions/{position_id}")
async def update_position(http_request: Request, position_id: int, payload: PositionUpdateRequest, db: Session = Depends(get_db), session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_position(position_id, payload.model_dump(exclude_none=True), session.get("id") or "unknown")
        write_audit_log(db, actor=session, request=http_request, action="recruitment.position.update", target_type="recruitment-position", target_code=data["position_code"], details={"position_id": position_id})
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.delete("/positions/{position_id}")
async def delete_position(http_request: Request, position_id: int, db: Session = Depends(get_db), session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        service.delete_position(position_id, session.get("id") or "unknown")
        try:
            write_audit_log(db, actor=session, request=http_request, action="recruitment.position.delete", target_type="recruitment-position", target_code=str(position_id), details={"position_id": position_id})
        except Exception:
            pass
        return {"success": True, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

@recruitment_router.post("/positions/{position_id}/generate-jd")
async def generate_jd(position_id: int, payload: JDGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "generate_jd",
            position_id,
            payload.extra_prompt or "",
            _session.get("id") or "unknown",
            auto_activate=payload.auto_activate,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except RecruitmentConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/positions/{position_id}/generate-jd/start")
async def start_generate_jd(position_id: int, payload: JDGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "start_generate_jd",
            position_id,
            payload.extra_prompt or "",
            _session.get("id") or "unknown",
            auto_activate=payload.auto_activate,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/positions/{position_id}/jd-versions")
async def save_jd_version(position_id: int, payload: SaveJDVersionRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.save_jd_version(position_id, payload.model_dump(), _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/positions/{position_id}/jd-versions")
async def list_jd_versions(position_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        detail = service.get_position_detail(position_id)
        return {"success": True, "data": detail["jd_versions"], "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/positions/{position_id}/jd-versions/{version_id}/activate")
async def activate_jd_version(position_id: int, version_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.activate_jd_version(position_id, version_id, _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/candidates")
async def list_candidates(query: Optional[str] = Query(None), status: Optional[str] = Query(None), position_id: Optional[int] = Query(None), tag: Optional[str] = Query(None), _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_candidates(query=query, status=status, position_id=position_id, tag=tag)
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.get("/candidates/{candidate_id}")
async def get_candidate_detail(candidate_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        return {"success": True, "data": service.get_candidate_detail(candidate_id), "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.patch("/candidates/{candidate_id}")
async def update_candidate(candidate_id: int, payload: CandidateUpdateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_candidate(candidate_id, payload.model_dump(exclude_none=True), _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/status")
async def update_candidate_status(candidate_id: int, payload: CandidateStatusUpdateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_candidate_status(candidate_id, payload.status, payload.reason or "", _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/candidates/{candidate_id}/status-history")
async def get_candidate_status_history(candidate_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.get_candidate_status_history(candidate_id)
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/upload-resumes")
async def upload_resumes(files: List[UploadFile] = File(...), position_id: Optional[int] = Query(None), _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    uploaded_files = []
    for item in files:
        uploaded_files.append({"file_name": item.filename or "resume.bin", "content_type": item.content_type, "content": await item.read()})
    try:
        data = service.upload_resume_files(uploaded_files, position_id, _session.get("id") or "unknown")
        for row in data:
            row["auto_screen_started"] = False
            row["auto_screen_task_id"] = None
            row["auto_screen_task_status"] = None
            row["auto_screen_error"] = None
            if row.get("latest_resume_file_id") and row.get("auto_screen_enabled"):
                try:
                    task = service.start_screen_candidate(
                        row["id"],
                        _session.get("id") or "unknown",
                        skill_ids=[],
                        use_position_skills=True,
                        use_candidate_memory=True,
                        custom_requirements="",
                    )
                    row["auto_screen_started"] = True
                    row["auto_screen_task_id"] = task.get("task_id")
                    row["auto_screen_task_status"] = task.get("status")
                except Exception as exc:
                    row["auto_screen_error"] = str(exc)
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/parse")
async def trigger_candidate_parse(candidate_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "trigger_latest_parse",
            candidate_id,
            _session.get("id") or "unknown",
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/screen")
async def screen_candidate(candidate_id: int, payload: CandidateScreenRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "screen_candidate",
            candidate_id,
            _session.get("id") or "unknown",
            skill_ids=payload.skill_ids,
            use_position_skills=payload.use_position_skills,
            use_candidate_memory=payload.use_candidate_memory,
            custom_requirements=payload.custom_requirements or "",
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/screen/start")
async def start_screen_candidate(candidate_id: int, payload: CandidateScreenRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "start_screen_candidate",
            candidate_id,
            _session.get("id") or "unknown",
            skill_ids=payload.skill_ids,
            use_position_skills=payload.use_position_skills,
            use_candidate_memory=payload.use_candidate_memory,
            custom_requirements=payload.custom_requirements or "",
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@recruitment_router.post("/candidates/{candidate_id}/score")
async def trigger_candidate_score(candidate_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "trigger_latest_score",
            candidate_id,
            _session.get("id") or "unknown",
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/interview-questions")
async def generate_interview_questions(candidate_id: int, payload: InterviewQuestionGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "generate_interview_questions",
            candidate_id,
            payload.round_name,
            payload.custom_requirements or "",
            payload.skill_ids,
            _session.get("id") or "unknown",
            use_candidate_memory=payload.use_candidate_memory,
            use_position_skills=payload.use_position_skills,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/interview-questions/preview-stream")
async def stream_generate_interview_questions(candidate_id: int, payload: InterviewQuestionGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    actor_id = _session.get("id") or "unknown"
    event_queue: "queue.Queue[Optional[str]]" = queue.Queue()
    backend_started_at_ms = int(time.time() * 1000)

    def push(event_name: str, payload_data: Dict[str, Any]) -> None:
        event_queue.put(_encode_sse_event(event_name, payload_data))

    def worker() -> None:
        db = SessionLocal()
        service = RecruitmentService(db)
        try:
            candidate = service._get_candidate(candidate_id)
            skill_rows, memory_source = service._resolve_interview_skills(
                candidate,
                payload.skill_ids,
                use_candidate_memory=payload.use_candidate_memory,
                use_position_skills=payload.use_position_skills,
            )
            skill_snapshots = service._tailor_skill_snapshots_for_task(service._build_skill_snapshots(skill_rows), "interview")
            related_skill_ids = service._extract_related_skill_ids(skill_snapshots)
            request_hash = service._build_request_hash(
                "interview_question_generation",
                candidate.id,
                payload.round_name,
                payload.custom_requirements or "",
                related_skill_ids,
                memory_source,
            )
            task_log = service._create_ai_task_log(
                "interview_question_generation",
                created_by=actor_id,
                related_position_id=candidate.position_id,
                related_candidate_id=candidate.id,
                related_skill_ids=related_skill_ids,
                related_skill_snapshots=skill_snapshots,
                memory_source=memory_source,
                request_hash=request_hash,
            )
            first_preview_delta_at_ms: Optional[int] = None

            push("preview.started", {
                "candidate_id": candidate_id,
                "task_log_id": task_log.id,
                "backend_started_at_ms": backend_started_at_ms,
                "memory_source": memory_source,
                "skill_ids": related_skill_ids,
            })

            def on_delta(delta: str) -> None:
                nonlocal first_preview_delta_at_ms
                now_ms = int(time.time() * 1000)
                if first_preview_delta_at_ms is None:
                    first_preview_delta_at_ms = now_ms
                push("preview.delta", {
                    "delta": delta,
                    "delta_length": len(delta),
                    "emitted_at_ms": now_ms,
                })

            preview = service.stream_interview_question_preview(
                candidate_id,
                payload.round_name,
                payload.custom_requirements or "",
                payload.skill_ids,
                actor_id,
                on_delta,
                use_candidate_memory=payload.use_candidate_memory,
                use_position_skills=payload.use_position_skills,
            )
            push("preview.completed", {
                "preview": preview,
                "task_log_id": task_log.id,
                "backend_first_preview_delta_at_ms": first_preview_delta_at_ms,
                "backend_preview_completed_at_ms": int(time.time() * 1000),
            })

            question = service.generate_interview_questions(
                candidate_id,
                payload.round_name,
                payload.custom_requirements or "",
                payload.skill_ids,
                actor_id,
                use_candidate_memory=payload.use_candidate_memory,
                use_position_skills=payload.use_position_skills,
                existing_task_id=task_log.id,
            )
            task_log_payload = service.get_ai_task_log(task_log.id)
            push("final.result", {
                "candidate": service._serialize_candidate_summary(candidate),
                "question": question,
                "task_log": task_log_payload,
                "preview": preview,
                "stream_timing": {
                    "backend_started_at_ms": backend_started_at_ms,
                    "backend_first_preview_delta_at_ms": first_preview_delta_at_ms,
                    "backend_finalized_at_ms": int(time.time() * 1000),
                },
            })
        except Exception as exc:
            push("run.error", {
                "message": str(exc),
                "backend_failed_at_ms": int(time.time() * 1000),
            })
        finally:
            try:
                db.close()
            finally:
                event_queue.put(None)

    threading.Thread(target=worker, daemon=True).start()

    def stream_events():
        while True:
            chunk = event_queue.get()
            if chunk is None:
                break
            yield chunk

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@recruitment_router.post("/candidates/{candidate_id}/interview-questions/start")
async def start_generate_interview_questions(candidate_id: int, payload: InterviewQuestionGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "start_generate_interview_questions",
            candidate_id,
            payload.round_name,
            payload.custom_requirements or "",
            payload.skill_ids,
            _session.get("id") or "unknown",
            use_candidate_memory=payload.use_candidate_memory,
            use_position_skills=payload.use_position_skills,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@recruitment_router.get("/interview-questions/{question_id}/download")
async def download_interview_question(question_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        payload = service.get_interview_question_download(question_id)
        quoted_name = quote(payload["file_name"])
        headers = {"Content-Disposition": f"attachment; filename=\"interview-question.html\"; filename*=UTF-8''{quoted_name}"}
        return Response(content=payload["html_content"], media_type="text/html; charset=utf-8", headers=headers)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@recruitment_router.get("/resume-files/{resume_file_id}/download")
async def download_resume_file(resume_file_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        payload = service.get_resume_file_download(resume_file_id)
        file_name = payload["file_name"] or "resume.bin"
        file_extension = f".{file_name.rsplit('.', 1)[1]}" if "." in file_name and not file_name.endswith(".") else ".bin"
        quoted_name = quote(file_name)
        headers = {"Content-Disposition": f"inline; filename=\"resume{file_extension}\"; filename*=UTF-8''{quoted_name}"}
        return Response(content=payload["content"], media_type=payload["media_type"], headers=headers)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/skills")
async def list_skills(_session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_skills()
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/skills")
async def create_skill(payload: SkillUpsertRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.create_skill(payload.model_dump(), _session.get("id") or "unknown")
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}


@recruitment_router.patch("/skills/{skill_id}")
async def update_skill(skill_id: int, payload: SkillUpsertRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_skill(skill_id, payload.model_dump(), _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        service.delete_skill(skill_id, _session.get("id") or "unknown")
        return {"success": True, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/skills/{skill_id}/toggle")
async def toggle_skill(skill_id: int, enabled: bool = Query(...), _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.toggle_skill(skill_id, enabled, _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/llm-configs")
async def list_llm_configs(_session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_llm_configs()
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/llm-configs")
async def create_llm_config(payload: RecruitmentLLMConfigUpsertRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.create_llm_config(payload.model_dump())
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@recruitment_router.patch("/llm-configs/{config_id}")
async def update_llm_config(config_id: int, payload: RecruitmentLLMConfigUpsertRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_llm_config(config_id, payload.model_dump(exclude_none=True))
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.delete("/llm-configs/{config_id}")
async def delete_llm_config(config_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        service.delete_llm_config(config_id)
        return {"success": True, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/mail-senders")
async def list_mail_senders(_session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_mail_senders()
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/mail-senders")
async def create_mail_sender(payload: RecruitmentMailSenderUpsertRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.create_mail_sender(payload.model_dump(), _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@recruitment_router.patch("/mail-senders/{sender_id}")
async def update_mail_sender(sender_id: int, payload: RecruitmentMailSenderUpsertRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_mail_sender(sender_id, payload.model_dump(exclude_none=True), _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.delete("/mail-senders/{sender_id}")
async def delete_mail_sender(sender_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        service.delete_mail_sender(sender_id, _session.get("id") or "unknown")
        return {"success": True, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/mail-recipients")
async def list_mail_recipients(_session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_mail_recipients()
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/mail-recipients")
async def create_mail_recipient(payload: RecruitmentMailRecipientUpsertRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.create_mail_recipient(payload.model_dump(), _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@recruitment_router.patch("/mail-recipients/{recipient_id}")
async def update_mail_recipient(recipient_id: int, payload: RecruitmentMailRecipientUpsertRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_mail_recipient(recipient_id, payload.model_dump(exclude_none=True), _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.delete("/mail-recipients/{recipient_id}")
async def delete_mail_recipient(recipient_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        service.delete_mail_recipient(recipient_id, _session.get("id") or "unknown")
        return {"success": True, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/resume-mail-dispatches")
async def list_resume_mail_dispatches(_session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_resume_mail_dispatches()
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/resume-mail-dispatches/send")
async def send_resume_mail_dispatch(payload: RecruitmentResumeMailSendRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "send_resume_mail_dispatch",
            payload.model_dump(),
            _session.get("id") or "unknown",
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@recruitment_router.get("/ai-task-logs")
async def list_ai_task_logs(task_type: Optional[str] = Query(None), status: Optional[str] = Query(None), _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_ai_task_logs(task_type=task_type, status=status)
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.get("/ai-task-logs/{task_id}")
async def get_ai_task_log(task_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        return {"success": True, "data": service.get_ai_task_log(task_id), "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/ai-task-logs/{task_id}/cancel")
async def cancel_ai_task(task_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        return {"success": True, "data": service.cancel_ai_task(task_id, _session.get("id") or "unknown"), "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/publish-tasks")
async def create_publish_task(payload: PublishTaskCreateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.create_publish_task(payload.position_id, payload.target_platform, payload.mode, _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/publish-tasks")
async def list_publish_tasks(position_id: Optional[int] = Query(None), _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_publish_tasks(position_id=position_id)
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.get("/chat/context")
async def get_chat_context(_session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    return {"success": True, "data": service.get_chat_context(_session.get("id") or "unknown"), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/chat/context")
async def update_chat_context(payload: RecruitmentChatContextUpdateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.update_chat_context(_session.get("id") or "unknown", payload.position_id, payload.skill_ids, payload.candidate_id)
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}


@recruitment_router.post("/chat")
async def chat(payload: RecruitmentChatRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    data = await run_in_threadpool(
        _run_recruitment_service_call,
        "chat",
        _session.get("id") or "unknown",
        _session.get("name") or "unknown",
        payload.message,
        payload.context,
    )
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}


@recruitment_router.post("/chat/start")
async def start_chat(payload: RecruitmentChatRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    data = await run_in_threadpool(
        _run_recruitment_service_call,
        "start_chat",
        _session.get("id") or "unknown",
        _session.get("name") or "unknown",
        payload.message,
        payload.context,
    )
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}


@recruitment_router.post("/chat/stream")
async def stream_chat(payload: RecruitmentChatRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment"))):
    actor_id = _session.get("id") or "unknown"
    actor_name = _session.get("name") or "unknown"
    event_queue: "queue.Queue[Optional[str]]" = queue.Queue()
    backend_started_at_ms = int(time.time() * 1000)

    def push(event_name: str, payload_data: Dict[str, Any]) -> None:
        event_queue.put(_encode_sse_event(event_name, payload_data))

    def worker() -> None:
        db = SessionLocal()
        service = RecruitmentService(db)
        try:
            current_context = payload.context or {}
            skill_ids = current_context.get("skill_ids") or []
            push("preview.started", {
                "backend_started_at_ms": backend_started_at_ms,
                "position_id": current_context.get("position_id"),
                "candidate_id": current_context.get("candidate_id"),
                "skill_ids": skill_ids,
            })
            first_preview_delta_at_ms: Optional[int] = None
            preview_chunks: List[str] = []

            def on_delta(delta: str) -> None:
                nonlocal first_preview_delta_at_ms
                now_ms = int(time.time() * 1000)
                if first_preview_delta_at_ms is None:
                    first_preview_delta_at_ms = now_ms
                preview_chunks.append(delta)
                push("preview.delta", {
                    "delta": delta,
                    "delta_length": len(delta),
                    "emitted_at_ms": now_ms,
                })

            result = service.stream_chat(
                actor_id,
                actor_name,
                payload.message,
                payload.context,
                on_delta,
            )
            push("preview.completed", {
                "reply_length": len("".join(preview_chunks)),
                "first_preview_delta_at_ms": first_preview_delta_at_ms,
                "completed_at_ms": int(time.time() * 1000),
            })
            push("final.result", result)
        except RecruitmentTaskCancelled:
            push("run.cancelled", {
                "reason": "user_cancelled",
            })
        except Exception as exc:
            push("run.error", {
                "message": str(exc),
                "retryable": False,
            })
        finally:
            event_queue.put(None)
            db.close()

    threading.Thread(target=worker, name="recruitment-chat-stream", daemon=True).start()

    async def event_generator():
        while True:
            item = await run_in_threadpool(event_queue.get)
            if item is None:
                break
            yield item

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
