import uuid
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..database import get_db
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
from ..services.recruitment_service import RecruitmentConflictError, RecruitmentService, run_resume_pipeline_background
from ..services.script_hub_audit_service import write_audit_log
recruitment_router = APIRouter(prefix="/recruitment", tags=["AI 招聘自动化管理"])


def get_recruitment_service(db: Session = Depends(get_db)) -> RecruitmentService:
    ensure_recruitment_schema()
    return RecruitmentService(db)


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
async def generate_jd(position_id: int, payload: JDGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.generate_jd(position_id, payload.extra_prompt or "", _session.get("id") or "unknown", auto_activate=payload.auto_activate)
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except RecruitmentConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
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
async def upload_resumes(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...), position_id: Optional[int] = Query(None), _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    uploaded_files = []
    for item in files:
        uploaded_files.append({"file_name": item.filename or "resume.bin", "content_type": item.content_type, "content": await item.read()})
    try:
        data = service.upload_resume_files(uploaded_files, position_id, _session.get("id") or "unknown")
        for row in data:
            if row.get("latest_resume_file_id") and row.get("auto_screen_enabled"):
                background_tasks.add_task(run_resume_pipeline_background, row["id"], row["latest_resume_file_id"], _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/parse")
async def trigger_candidate_parse(candidate_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.trigger_latest_parse(candidate_id, _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/screen")
async def screen_candidate(candidate_id: int, payload: CandidateScreenRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.screen_candidate(candidate_id, _session.get("id") or "unknown", skill_ids=payload.skill_ids, use_position_skills=payload.use_position_skills, use_candidate_memory=payload.use_candidate_memory)
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@recruitment_router.post("/candidates/{candidate_id}/score")
async def trigger_candidate_score(candidate_id: int, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.trigger_latest_score(candidate_id, _session.get("id") or "unknown")
        return {"success": True, "data": data, "request_id": str(uuid.uuid4())}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@recruitment_router.post("/candidates/{candidate_id}/interview-questions")
async def generate_interview_questions(candidate_id: int, payload: InterviewQuestionGenerateRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.generate_interview_questions(candidate_id, payload.round_name, payload.custom_requirements or "", payload.skill_ids, _session.get("id") or "unknown", use_candidate_memory=payload.use_candidate_memory)
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
        service.delete_skill(skill_id)
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
async def send_resume_mail_dispatch(payload: RecruitmentResumeMailSendRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    try:
        data = service.send_resume_mail_dispatch(payload.model_dump(), _session.get("id") or "unknown")
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
async def chat(payload: RecruitmentChatRequest, _session: Dict[str, Any] = Depends(require_script_hub_permission("ai-recruitment")), service: RecruitmentService = Depends(get_recruitment_service)):
    data = service.chat(_session.get("id") or "unknown", _session.get("name") or "unknown", payload.message, payload.context)
    return {"success": True, "data": data, "request_id": str(uuid.uuid4())}

