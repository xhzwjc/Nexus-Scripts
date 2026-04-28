import json
import queue
import shutil
import threading
import time
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import anyio
from starlette.background import BackgroundTask
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..permission_governance import expand_permission_aliases
from ..recruitment_schemas import (
    CandidateExportRequest,
    CandidateScreenBatchCancelRequest,
    CandidateScreenBatchQueryRequest,
    CandidateScreenBatchStartRequest,
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
    RecruitmentMailAutoPushGlobalConfigRequest,
    RecruitmentMailRecipientUpsertRequest,
    RecruitmentMailSenderUpsertRequest,
    RecruitmentResourceCopyRequest,
    RecruitmentResourceGovernanceUpdateRequest,
    RecruitmentResumeMailSendRequest,
    SaveJDVersionRequest,
    SkillUpsertRequest,
)
from ..schema_maintenance import ensure_recruitment_schema
from ..script_hub_session import (
    get_script_hub_token_from_request,
    require_script_hub_any_permission,
    require_script_hub_permission,
    verify_script_hub_session,
)
from ..services.recruitment_service import RecruitmentConflictError, RecruitmentService
from ..services.recruitment_task_control import RecruitmentTaskCancelled
from ..services.recruitment_utils import RECRUITMENT_UPLOAD_ROOT
from ..services.script_hub_audit_service import write_audit_log
recruitment_router = APIRouter(prefix="/recruitment", tags=["AI 招聘自动化管理"])

UPLOAD_STREAM_CHUNK_SIZE = 1024 * 1024
POSITION_SKILL_BIND_FIELDS = {"jd_skill_ids", "screening_skill_ids", "interview_skill_ids", "skill_pack_ids"}


def _session_has_permission(session: Dict[str, Any], permission: str) -> bool:
    return bool(expand_permission_aliases(dict((session or {}).get("permissions") or {})).get(permission))


def _ensure_position_update_allowed(session: Dict[str, Any], patch: Dict[str, Any]) -> None:
    if _session_has_permission(session, "recruitment-position-manage"):
        return
    if _session_has_permission(session, "recruitment-skill-bind") and patch and set(patch).issubset(POSITION_SKILL_BIND_FIELDS):
        return
    raise HTTPException(status_code=403, detail="Forbidden")


def _ensure_resource_copy_allowed(session: Dict[str, Any], resource_kind: str) -> None:
    required_by_kind = {
        "skill": "recruitment-skill-manage",
        "model": "recruitment-llm-config-manage",
        "mail-sender": "recruitment-mail-sender-manage",
        "mail-recipient": "recruitment-mail-config-manage",
    }
    required = required_by_kind.get(resource_kind)
    if not required:
        raise HTTPException(status_code=400, detail="Unsupported resource kind")
    if not _session_has_permission(session, required):
        raise HTTPException(status_code=403, detail="Forbidden")


def get_recruitment_service(request: Request, db: Session = Depends(get_db)) -> RecruitmentService:
    ensure_recruitment_schema()
    session = getattr(request.state, "script_hub_session", None)
    if not session:
        token = get_script_hub_token_from_request(request)
        session = verify_script_hub_session(token) if token else None
    return RecruitmentService(db).set_permission_context(session)


def _run_recruitment_service_call(
    method_name: str,
    *args: Any,
    governance_session: Optional[Dict[str, Any]] = None,
    **kwargs: Any,
) -> Any:
    ensure_recruitment_schema()
    db = SessionLocal()
    try:
        service = RecruitmentService(db).set_permission_context(governance_session)
        method = getattr(service, method_name)
        return method(*args, **kwargs)
    finally:
        db.close()


def _encode_sse_event(event: str, payload: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _stage_upload_file(item: UploadFile, staging_dir: Path) -> Dict[str, Any]:
    file_name = Path(item.filename or "resume.bin").name or "resume.bin"
    staged_name = f"{uuid.uuid4().hex}{Path(file_name).suffix.lower()}"
    staged_path = staging_dir / staged_name
    file_size = 0
    await item.seek(0)
    async with await anyio.open_file(staged_path, "wb") as file_obj:
        while True:
            chunk = await item.read(UPLOAD_STREAM_CHUNK_SIZE)
            if not chunk:
                break
            file_size += len(chunk)
            await file_obj.write(chunk)
    await item.close()
    return {
        "file_name": file_name,
        "content_type": item.content_type,
        "staged_path": str(staged_path),
        "file_size": file_size,
    }


@recruitment_router.get("/metadata")
async def get_metadata(_session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    return {"success": True, "data": service.get_metadata(), "request_id": str(uuid.uuid4())}


@recruitment_router.get("/organization-scope")
async def get_organization_scope(_session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    return {"success": True, "data": service.get_organization_scope(), "request_id": str(uuid.uuid4())}


@recruitment_router.get("/dashboard")
async def get_dashboard(_session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    return {"success": True, "data": service.get_dashboard(), "request_id": str(uuid.uuid4())}


@recruitment_router.get("/positions")
async def list_positions(query: Optional[str] = Query(None), status: Optional[str] = Query(None), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_positions(query=query, status=status)
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/positions")
async def create_position(http_request: Request, payload: PositionCreateRequest, db: Session = Depends(get_db), session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-position-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.create_position(payload.model_dump(), session.get("id") or "unknown")
    write_audit_log(db, actor=session, request=http_request, action="recruitment.position.create", target_type="recruitment-position", target_code=data["position_code"], details={"title": data["title"]})
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}


@recruitment_router.get("/positions/{position_id}")
async def get_position_detail(position_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        return {"success": True, "data": service.get_position_detail(position_id), "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@recruitment_router.patch("/positions/{position_id}")
async def update_position(http_request: Request, position_id: int, payload: PositionUpdateRequest, db: Session = Depends(get_db), session: Dict[str, Any] = Depends(require_script_hub_any_permission(["recruitment-position-manage", "recruitment-skill-bind"])), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        patch = payload.model_dump(exclude_none=True)
        _ensure_position_update_allowed(session, patch)
        data = service.update_position(position_id, patch, session.get("id") or "unknown")
        write_audit_log(db, actor=session, request=http_request, action="recruitment.position.update", target_type="recruitment-position", target_code=data["position_code"], details={"position_id": position_id})
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.delete("/positions/{position_id}")
async def delete_position(http_request: Request, position_id: int, db: Session = Depends(get_db), session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-position-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
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
async def generate_jd(position_id: int, payload: JDGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-position-manage"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "generate_jd",
            position_id,
            payload.extra_prompt or "",
            _session.get("id") or "unknown",
            governance_session=_session,
            auto_activate=payload.auto_activate,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except RecruitmentConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/positions/{position_id}/generate-jd/start")
async def start_generate_jd(position_id: int, payload: JDGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-position-manage"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "start_generate_jd",
            position_id,
            payload.extra_prompt or "",
            _session.get("id") or "unknown",
            governance_session=_session,
            auto_activate=payload.auto_activate,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/positions/{position_id}/jd-versions")
async def save_jd_version(position_id: int, payload: SaveJDVersionRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-position-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.save_jd_version(position_id, payload.model_dump(), _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/positions/{position_id}/jd-versions")
async def list_jd_versions(position_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        detail = service.get_position_detail(position_id)
        return {"success": True, "data": detail["jd_versions"], "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/positions/{position_id}/jd-versions/{version_id}/activate")
async def activate_jd_version(position_id: int, version_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-position-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.activate_jd_version(position_id, version_id, _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/candidates")
async def list_candidates(query: Optional[str] = Query(None), status: Optional[str] = Query(None), position_id: Optional[int] = Query(None), tag: Optional[str] = Query(None), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_candidates(query=query, status=status, position_id=position_id, tag=tag)
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/candidates/export")
async def export_candidates(payload: CandidateExportRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-candidate-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        zip_path = service.export_candidates(payload.candidate_ids, payload.include_resumes)
        zip_filename = Path(zip_path).name
        zip_dir = str(Path(zip_path).parent)

        def cleanup():
            try:
                shutil.rmtree(zip_dir, ignore_errors=True)
            except Exception:
                pass

        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename=zip_filename,
            background=BackgroundTask(cleanup),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@recruitment_router.get("/candidates/{candidate_id}")
async def get_candidate_detail(candidate_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        return {"success": True, "data": service.get_candidate_detail(candidate_id), "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@recruitment_router.patch("/candidates/{candidate_id}")
async def update_candidate(candidate_id: int, payload: CandidateUpdateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-candidate-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_candidate(candidate_id, payload.model_dump(exclude_none=True), _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.delete("/candidates/{candidate_id}")
async def delete_candidate(
    http_request: Request,
    candidate_id: int,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-candidate-manage")),
    service: RecruitmentService = Depends(get_recruitment_service),
):
    try:
        data = service.delete_candidate(candidate_id, session.get("id") or "unknown")
        try:
            write_audit_log(
                db,
                actor=session,
                request=http_request,
                action="recruitment.candidate.delete",
                target_type="recruitment-candidate",
                target_code=str(data.get("candidate_code") or candidate_id),
                details={
                    "candidate_id": data.get("candidate_id"),
                    "candidate_name": data.get("candidate_name"),
                    "position_id": data.get("position_id"),
                    "removed_resume_count": data.get("removed_resume_count"),
                    "removed_parse_result_count": data.get("removed_parse_result_count"),
                },
            )
        except Exception:
            pass
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except RecruitmentConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/status")
async def update_candidate_status(candidate_id: int, payload: CandidateStatusUpdateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-candidate-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_candidate_status(candidate_id, payload.status, payload.reason or "", _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/candidates/{candidate_id}/status-history")
async def get_candidate_status_history(candidate_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.get_candidate_status_history(candidate_id)
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/upload-resumes")
async def upload_resumes(files: List[UploadFile] = File(...), position_id: Optional[int] = Query(None), org_code: Optional[str] = Query(None), city: Optional[str] = Query(None), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-candidate-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    staging_root = RECRUITMENT_UPLOAD_ROOT / "_staging"
    staging_root.mkdir(parents=True, exist_ok=True)
    staging_dir = Path(tempfile.mkdtemp(prefix="resume-batch-", dir=str(staging_root)))
    uploaded_files: List[Dict[str, Any]] = []
    try:
        for item in files:
            uploaded_files.append(await _stage_upload_file(item, staging_dir))
        rows = service.upload_resume_files(uploaded_files, position_id, _session.get("id") or "unknown", org_code, city)
        auto_screen_queued_count = 0
        auto_screen_skipped_existing_live_task_count = 0
        auto_screen_failed_count = 0
        auto_screen_tasks: List[Dict[str, Any]] = []
        for row in rows:
            row["auto_screen_needed"] = bool(row.get("latest_resume_file_id") and row.get("auto_screen_enabled"))
            row["auto_screen_candidate_id"] = row.get("id")
            row["auto_screen_queued"] = False
            row["auto_screen_task_id"] = None
            row["auto_screen_task_status"] = None
            row["auto_screen_reused_existing_task"] = False
            row["auto_screen_error"] = None
            if not row["auto_screen_needed"]:
                continue
            try:
                task = service.enqueue_screen_candidate(
                    row["id"],
                    _session.get("id") or "unknown",
                    skill_ids=[],
                    use_position_skills=True,
                    use_candidate_memory=True,
                    custom_requirements="",
                    dispatch=False,
                )
                row["auto_screen_task_id"] = task.get("task_id")
                row["auto_screen_task_status"] = task.get("status")
                row["auto_screen_reused_existing_task"] = bool(task.get("reused_existing_task"))
                row["auto_screen_queued"] = not bool(task.get("reused_existing_task"))
                if row["auto_screen_reused_existing_task"]:
                    auto_screen_skipped_existing_live_task_count += 1
                else:
                    auto_screen_queued_count += 1
                auto_screen_tasks.append(task)
            except Exception as exc:
                row["auto_screen_error"] = str(exc)
                auto_screen_failed_count += 1
        if auto_screen_tasks:
            service.process_next_screening_task()
        return {"success": True, "data": {"items": rows, "uploaded_count": len(rows), "auto_screen_queued_count": auto_screen_queued_count, "auto_screen_skipped_existing_live_task_count": auto_screen_skipped_existing_live_task_count, "auto_screen_failed_count": auto_screen_failed_count, "auto_screen_task_ids": [task.get("task_id") for task in auto_screen_tasks if task.get("task_id")], "auto_screen_tasks": auto_screen_tasks}, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    finally:
        await run_in_threadpool(shutil.rmtree, staging_dir, True)


@recruitment_router.post("/candidates/{candidate_id}/parse")
async def trigger_candidate_parse(candidate_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "trigger_latest_parse",
            candidate_id,
            _session.get("id") or "unknown",
            governance_session=_session,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/screen")
async def screen_candidate(candidate_id: int, payload: CandidateScreenRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
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
            force_one_pass=payload.force_one_pass,
            force_fallback=payload.force_fallback,
            allow_reuse_parse=payload.allow_reuse_parse,
            allow_score_only_rerun=payload.allow_score_only_rerun,
            screening_mode=payload.screening_mode,
            governance_session=_session,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/screen/start")
async def start_screen_candidate(candidate_id: int, payload: CandidateScreenRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
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
            force_one_pass=payload.force_one_pass,
            force_fallback=payload.force_fallback,
            allow_reuse_parse=payload.allow_reuse_parse,
            allow_score_only_rerun=payload.allow_score_only_rerun,
            screening_mode=payload.screening_mode,
            governance_session=_session,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@recruitment_router.post("/candidates/screen/batch-start")
@recruitment_router.post("/candidates/screen/batch/start")
async def batch_start_screen_candidates(payload: CandidateScreenBatchStartRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "batch_start_screen_candidates",
            payload.candidate_ids,
            _session.get("id") or "unknown",
            skill_ids=payload.skill_ids,
            use_position_skills=payload.use_position_skills,
            use_candidate_memory=payload.use_candidate_memory,
            custom_requirements=payload.custom_requirements or "",
            force_one_pass=payload.force_one_pass,
            force_fallback=payload.force_fallback,
            allow_reuse_parse=payload.allow_reuse_parse,
            allow_score_only_rerun=payload.allow_score_only_rerun,
            screening_mode=payload.screening_mode,
            governance_session=_session,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@recruitment_router.post("/candidates/screen/batch/query")
async def query_screening_batch(payload: CandidateScreenBatchQueryRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "get_screening_batch_status",
            payload.batch_id,
            governance_session=_session,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@recruitment_router.post("/candidates/screen/batch/cancel")
async def cancel_screening_batch(payload: CandidateScreenBatchCancelRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "cancel_screening_batch",
            payload.batch_id,
            _session.get("id") or "unknown",
            governance_session=_session,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@recruitment_router.post("/candidates/{candidate_id}/score")
async def trigger_candidate_score(candidate_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "trigger_latest_score",
            candidate_id,
            _session.get("id") or "unknown",
            governance_session=_session,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/interview-questions")
async def generate_interview_questions(candidate_id: int, payload: InterviewQuestionGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
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
            governance_session=_session,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/interview-questions/preview-stream")
async def stream_generate_interview_questions(candidate_id: int, payload: InterviewQuestionGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
    actor_id = _session.get("id") or "unknown"
    event_queue: "queue.Queue[Optional[str]]" = queue.Queue()
    backend_started_at_ms = int(time.time() * 1000)

    def push(event_name: str, payload_data: Dict[str, Any]) -> None:
        event_queue.put(_encode_sse_event(event_name, payload_data))

    def worker() -> None:
        db = SessionLocal()
        service = RecruitmentService(db).set_permission_context(_session)
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
            if not candidate.position_id:
                raise ValueError("候选人未绑定岗位，无法生成面试题。请先为候选人分配岗位后再生成面试题。")
            if not skill_snapshots:
                raise ValueError("该岗位未配置面试题Skill，无法生成面试题。请先在岗位配置中绑定面试题Skill后再生成面试题。")
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
async def start_generate_interview_questions(candidate_id: int, payload: InterviewQuestionGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
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
            governance_session=_session,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@recruitment_router.get("/interview-questions/{question_id}/download")
async def download_interview_question(question_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute")), service: RecruitmentService = Depends(get_recruitment_service)):
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
async def download_resume_file(resume_file_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        payload = service.get_resume_file_download(resume_file_id)
        file_name = payload["file_name"] or "resume.bin"
        file_extension = f".{file_name.rsplit('.', 1)[1]}" if "." in file_name and not file_name.endswith(".") else ".bin"
        quoted_name = quote(file_name)
        headers = {"Content-Disposition": f"inline; filename=\"resume{file_extension}\"; filename*=UTF-8''{quoted_name}"}
        return Response(content=payload["content"], media_type=payload["media_type"], headers=headers)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.delete("/resume-files/{resume_file_id}")
async def delete_resume_file(
    http_request: Request,
    resume_file_id: int,
    db: Session = Depends(get_db),
    session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-candidate-manage")),
    service: RecruitmentService = Depends(get_recruitment_service),
):
    try:
        data = service.delete_resume_file(resume_file_id, session.get("id") or "unknown")
        try:
            write_audit_log(
                db,
                actor=session,
                request=http_request,
                action="recruitment.resume-file.delete",
                target_type="recruitment-resume-file",
                target_code=str(resume_file_id),
                details={
                    "resume_file_id": resume_file_id,
                    "candidate_id": data.get("candidate_id"),
                    "remaining_resume_count": data.get("remaining_resume_count"),
                },
            )
        except Exception:
            pass
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except RecruitmentConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/skills")
async def list_skills(_session: Dict[str, Any] = Depends(require_script_hub_any_permission(["recruitment-skill-view", "recruitment-skill-bind", "recruitment-skill-manage"])), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_skills()
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/skills")
async def create_skill(http_request: Request, payload: SkillUpsertRequest, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-skill-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.create_skill(payload.model_dump(), _session.get("id") or "unknown")
    write_audit_log(db, actor=_session, request=http_request, action="recruitment.skill.create", target_type="recruitment-skill", target_code=str(data.get("skill_code") or data.get("id")), target_org_code=data.get("org_code"), details={"name": data.get("name"), "share_policy": data.get("share_policy")})
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}


@recruitment_router.patch("/skills/{skill_id}")
async def update_skill(http_request: Request, skill_id: int, payload: SkillUpsertRequest, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-skill-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_skill(skill_id, payload.model_dump(), _session.get("id") or "unknown")
        write_audit_log(db, actor=_session, request=http_request, action="recruitment.skill.update", target_type="recruitment-skill", target_code=str(data.get("skill_code") or skill_id), target_org_code=data.get("org_code"), details={"skill_id": skill_id, "share_policy": data.get("share_policy")})
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.delete("/skills/{skill_id}")
async def delete_skill(http_request: Request, skill_id: int, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-skill-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        service.delete_skill(skill_id, _session.get("id") or "unknown")
        write_audit_log(db, actor=_session, request=http_request, action="recruitment.skill.delete", target_type="recruitment-skill", target_code=str(skill_id), target_org_code=_session.get("primaryOrgCode"), details={"skill_id": skill_id})
        return {"success": True, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/skills/{skill_id}/toggle")
async def toggle_skill(skill_id: int, enabled: bool = Query(...), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-skill-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.toggle_skill(skill_id, enabled, _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.patch("/resource-governance/{resource_kind}/{resource_id}")
async def update_resource_governance(
    http_request: Request,
    resource_kind: str,
    resource_id: int,
    payload: RecruitmentResourceGovernanceUpdateRequest,
    db: Session = Depends(get_db),
    _session: Dict[str, Any] = Depends(require_script_hub_permission("resource-sharing-manage")),
    service: RecruitmentService = Depends(get_recruitment_service),
):
    patch = payload.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(status_code=400, detail="No governance fields provided")

    try:
        if resource_kind == "skill":
            data = service.update_skill(resource_id, patch, _session.get("id") or "unknown")
            target_type = "recruitment-skill"
            target_code = str(data.get("skill_code") or resource_id)
            sensitivity = "normal"
        elif resource_kind == "model":
            model_patch = dict(patch)
            if "is_enabled" in model_patch:
                model_patch["is_active"] = model_patch.pop("is_enabled")
            data = service.update_llm_config(resource_id, model_patch, _session.get("id") or "unknown")
            target_type = "recruitment-llm-config"
            target_code = str(data.get("config_key") or resource_id)
            sensitivity = "sensitive"
        elif resource_kind == "mail-sender":
            data = service.update_mail_sender(resource_id, patch, _session.get("id") or "unknown")
            target_type = "recruitment-mail-sender"
            target_code = str(resource_id)
            sensitivity = "sensitive"
        elif resource_kind == "mail-recipient":
            data = service.update_mail_recipient(resource_id, patch, _session.get("id") or "unknown")
            target_type = "recruitment-mail-recipient"
            target_code = str(resource_id)
            sensitivity = "normal"
        else:
            raise HTTPException(status_code=400, detail="Unsupported resource kind")

        write_audit_log(
            db,
            actor=_session,
            request=http_request,
            action="recruitment.resource-governance.update",
            target_type=target_type,
            target_code=target_code,
            target_org_code=data.get("org_code"),
            sensitivity=sensitivity,
            details={
                "resource_kind": resource_kind,
                "resource_id": resource_id,
                "org_code": data.get("org_code"),
                "scope_level": data.get("scope_level"),
                "share_policy": data.get("share_policy"),
                "allow_sub_org_use": data.get("allow_sub_org_use"),
                "allow_copy": data.get("allow_copy"),
                "is_enabled": data.get("is_enabled", data.get("is_active")),
            },
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/resource-governance/{resource_kind}/{resource_id}/copy")
async def copy_resource(
    http_request: Request,
    resource_kind: str,
    resource_id: int,
    payload: RecruitmentResourceCopyRequest,
    db: Session = Depends(get_db),
    _session: Dict[str, Any] = Depends(require_script_hub_any_permission(["recruitment-skill-manage", "recruitment-llm-config-manage", "recruitment-mail-sender-manage", "recruitment-mail-config-manage"])),
    service: RecruitmentService = Depends(get_recruitment_service),
):
    _ensure_resource_copy_allowed(_session, resource_kind)
    try:
        if resource_kind == "skill":
            data = service.copy_skill(resource_id, _session.get("id") or "unknown", payload.target_org_code)
            target_type = "recruitment-skill"
            target_code = str(data.get("skill_code") or data.get("id"))
            sensitivity = "normal"
        elif resource_kind == "model":
            data = service.copy_llm_config(resource_id, _session.get("id") or "unknown", payload.target_org_code)
            target_type = "recruitment-llm-config"
            target_code = str(data.get("config_key") or data.get("id"))
            sensitivity = "sensitive"
        elif resource_kind == "mail-sender":
            data = service.copy_mail_sender(resource_id, _session.get("id") or "unknown", payload.target_org_code)
            target_type = "recruitment-mail-sender"
            target_code = str(data.get("id"))
            sensitivity = "sensitive"
        elif resource_kind == "mail-recipient":
            data = service.copy_mail_recipient(resource_id, _session.get("id") or "unknown", payload.target_org_code)
            target_type = "recruitment-mail-recipient"
            target_code = str(data.get("id"))
            sensitivity = "normal"
        else:
            raise HTTPException(status_code=400, detail="Unsupported resource kind")

        write_audit_log(
            db,
            actor=_session,
            request=http_request,
            action="recruitment.resource-governance.copy",
            target_type=target_type,
            target_code=target_code,
            target_org_code=data.get("org_code"),
            sensitivity=sensitivity,
            details={
                "resource_kind": resource_kind,
                "source_resource_id": resource_id,
                "target_org_code": data.get("org_code"),
            },
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@recruitment_router.get("/llm-configs")
async def list_llm_configs(_session: Dict[str, Any] = Depends(require_script_hub_any_permission(["recruitment-llm-config-view", "recruitment-llm-config-manage"])), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_llm_configs()
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/llm-configs")
async def create_llm_config(http_request: Request, payload: RecruitmentLLMConfigUpsertRequest, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-llm-config-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.create_llm_config(payload.model_dump(), _session.get("id") or "unknown")
        write_audit_log(db, actor=_session, request=http_request, action="recruitment.llm-config.create", target_type="recruitment-llm-config", target_code=str(data.get("config_key") or data.get("id")), target_org_code=data.get("org_code"), sensitivity="sensitive", details={"config_key": data.get("config_key"), "provider": data.get("provider"), "share_policy": data.get("share_policy"), "api_key_value": payload.api_key_value})
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@recruitment_router.patch("/llm-configs/{config_id}")
async def update_llm_config(http_request: Request, config_id: int, payload: RecruitmentLLMConfigUpsertRequest, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-llm-config-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_llm_config(config_id, payload.model_dump(exclude_none=True), _session.get("id") or "unknown")
        write_audit_log(db, actor=_session, request=http_request, action="recruitment.llm-config.update", target_type="recruitment-llm-config", target_code=str(data.get("config_key") or config_id), target_org_code=data.get("org_code"), sensitivity="sensitive", details={"config_id": config_id, "share_policy": data.get("share_policy"), "api_key_value": payload.api_key_value})
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        detail = str(exc)
        is_not_found = "不存在" in detail or "不存在或已删除" in detail
        raise HTTPException(status_code=404 if is_not_found else 400, detail=detail)


@recruitment_router.delete("/llm-configs/{config_id}")
async def delete_llm_config(http_request: Request, config_id: int, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-llm-config-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        service.delete_llm_config(config_id, _session.get("id") or "unknown")
        write_audit_log(db, actor=_session, request=http_request, action="recruitment.llm-config.delete", target_type="recruitment-llm-config", target_code=str(config_id), target_org_code=_session.get("primaryOrgCode"), sensitivity="sensitive", details={"config_id": config_id})
        return {"success": True, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/mail-senders")
async def list_mail_senders(_session: Dict[str, Any] = Depends(require_script_hub_any_permission(["recruitment-mail-view", "recruitment-mail-sender-manage"])), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_mail_senders()
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/mail-senders")
async def create_mail_sender(http_request: Request, payload: RecruitmentMailSenderUpsertRequest, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-mail-sender-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.create_mail_sender(payload.model_dump(), _session.get("id") or "unknown")
        write_audit_log(db, actor=_session, request=http_request, action="recruitment.mail-sender.create", target_type="recruitment-mail-sender", target_code=str(data.get("id")), target_org_code=data.get("org_code"), sensitivity="sensitive", details={"name": data.get("name"), "from_email": data.get("from_email"), "share_policy": data.get("share_policy"), "password": payload.password})
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@recruitment_router.patch("/mail-senders/{sender_id}")
async def update_mail_sender(http_request: Request, sender_id: int, payload: RecruitmentMailSenderUpsertRequest, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-mail-sender-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_mail_sender(sender_id, payload.model_dump(exclude_none=True), _session.get("id") or "unknown")
        write_audit_log(db, actor=_session, request=http_request, action="recruitment.mail-sender.update", target_type="recruitment-mail-sender", target_code=str(sender_id), target_org_code=data.get("org_code"), sensitivity="sensitive", details={"sender_id": sender_id, "share_policy": data.get("share_policy"), "password": payload.password})
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.delete("/mail-senders/{sender_id}")
async def delete_mail_sender(http_request: Request, sender_id: int, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-mail-sender-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        service.delete_mail_sender(sender_id, _session.get("id") or "unknown")
        write_audit_log(db, actor=_session, request=http_request, action="recruitment.mail-sender.delete", target_type="recruitment-mail-sender", target_code=str(sender_id), target_org_code=_session.get("primaryOrgCode"), sensitivity="sensitive", details={"sender_id": sender_id})
        return {"success": True, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/mail-recipients")
async def list_mail_recipients(_session: Dict[str, Any] = Depends(require_script_hub_any_permission(["recruitment-mail-view", "recruitment-mail-config-manage"])), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_mail_recipients()
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.get("/mail-auto-config")
async def get_mail_auto_push_global_config(_session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-mail-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    return {"success": True, "data": service.get_mail_auto_push_global_config(), "request_id": str(uuid.uuid4())}


@recruitment_router.patch("/mail-auto-config")
async def update_mail_auto_push_global_config(http_request: Request, payload: RecruitmentMailAutoPushGlobalConfigRequest, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-mail-config-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.update_mail_auto_push_global_config(payload.model_dump())
    write_audit_log(db, actor=_session, request=http_request, action="recruitment.mail-auto-config.update", target_type="recruitment-mail-auto-config", target_code="global", target_org_code=_session.get("primaryOrgCode"), details=data)
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}


@recruitment_router.post("/mail-recipients")
async def create_mail_recipient(http_request: Request, payload: RecruitmentMailRecipientUpsertRequest, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-mail-config-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.create_mail_recipient(payload.model_dump(), _session.get("id") or "unknown")
        write_audit_log(db, actor=_session, request=http_request, action="recruitment.mail-recipient.create", target_type="recruitment-mail-recipient", target_code=str(data.get("id")), target_org_code=data.get("org_code"), details={"name": data.get("name"), "email": data.get("email"), "share_policy": data.get("share_policy")})
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@recruitment_router.patch("/mail-recipients/{recipient_id}")
async def update_mail_recipient(http_request: Request, recipient_id: int, payload: RecruitmentMailRecipientUpsertRequest, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-mail-config-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.update_mail_recipient(recipient_id, payload.model_dump(exclude_none=True), _session.get("id") or "unknown")
        write_audit_log(db, actor=_session, request=http_request, action="recruitment.mail-recipient.update", target_type="recruitment-mail-recipient", target_code=str(recipient_id), target_org_code=data.get("org_code"), details={"recipient_id": recipient_id, "share_policy": data.get("share_policy")})
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.delete("/mail-recipients/{recipient_id}")
async def delete_mail_recipient(http_request: Request, recipient_id: int, db: Session = Depends(get_db), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-mail-config-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        service.delete_mail_recipient(recipient_id, _session.get("id") or "unknown")
        write_audit_log(db, actor=_session, request=http_request, action="recruitment.mail-recipient.delete", target_type="recruitment-mail-recipient", target_code=str(recipient_id), target_org_code=_session.get("primaryOrgCode"), details={"recipient_id": recipient_id})
        return {"success": True, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/resume-mail-dispatches")
async def list_resume_mail_dispatches(_session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-mail-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_resume_mail_dispatches()
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/resume-mail-dispatches/send")
async def send_resume_mail_dispatch(payload: RecruitmentResumeMailSendRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-mail-send"))):
    try:
        data = await run_in_threadpool(
            _run_recruitment_service_call,
            "send_resume_mail_dispatch",
            payload.model_dump(),
            _session.get("id") or "unknown",
            governance_session=_session,
        )
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@recruitment_router.get("/ai-task-logs")
async def list_ai_task_logs(task_type: Optional[str] = Query(None), status: Optional[str] = Query(None), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-log-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_ai_task_logs(task_type=task_type, status=status)
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.get("/ai-task-logs/{task_id}")
async def get_ai_task_log(task_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-log-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        return {"success": True, "data": service.get_ai_task_log(task_id), "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/ai-task-logs/{task_id}/cancel")
async def cancel_ai_task(task_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        return {"success": True, "data": service.cancel_ai_task(task_id, _session.get("id") or "unknown"), "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/publish-tasks")
async def create_publish_task(payload: PublishTaskCreateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-position-manage")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.create_publish_task(payload.position_id, payload.target_platform, payload.mode, _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.get("/publish-tasks")
async def list_publish_tasks(position_id: Optional[int] = Query(None), _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.list_publish_tasks(position_id=position_id)
    return {"success": True, "data": data, "total": len(data), "request_id": str(uuid.uuid4())}


@recruitment_router.get("/chat/context")
async def get_chat_context(_session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-dashboard-view")), service: RecruitmentService = Depends(get_recruitment_service)):
    return {"success": True, "data": service.get_chat_context(_session.get("id") or "unknown"), "request_id": str(uuid.uuid4())}


@recruitment_router.post("/chat/context")
async def update_chat_context(payload: RecruitmentChatContextUpdateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.update_chat_context(_session.get("id") or "unknown", payload.position_id, payload.skill_ids, payload.candidate_id)
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}


@recruitment_router.post("/chat")
async def chat(payload: RecruitmentChatRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
    data = await run_in_threadpool(
        _run_recruitment_service_call,
        "chat",
        _session.get("id") or "unknown",
        _session.get("name") or "unknown",
        payload.message,
        payload.context,
        governance_session=_session,
    )
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}


@recruitment_router.post("/chat/start")
async def start_chat(payload: RecruitmentChatRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
    data = await run_in_threadpool(
        _run_recruitment_service_call,
        "start_chat",
        _session.get("id") or "unknown",
        _session.get("name") or "unknown",
        payload.message,
        payload.context,
        governance_session=_session,
    )
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}


@recruitment_router.post("/chat/stream")
async def stream_chat(payload: RecruitmentChatRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("recruitment-process-execute"))):
    actor_id = _session.get("id") or "unknown"
    actor_name = _session.get("name") or "unknown"
    event_queue: "queue.Queue[Optional[str]]" = queue.Queue()
    backend_started_at_ms = int(time.time() * 1000)

    def push(event_name: str, payload_data: Dict[str, Any]) -> None:
        event_queue.put(_encode_sse_event(event_name, payload_data))

    def worker() -> None:
        db = SessionLocal()
        service = RecruitmentService(db).set_permission_context(_session)
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
