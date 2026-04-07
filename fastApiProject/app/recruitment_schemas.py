from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PositionCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    salary_range: Optional[str] = None
    headcount: int = Field(1, ge=1, le=999)
    key_requirements: Optional[str] = None
    bonus_points: Optional[str] = None
    summary: Optional[str] = None
    status: str = Field("draft")
    tags: List[str] = Field(default_factory=list)
    auto_screen_on_upload: bool = False
    auto_advance_on_screening: bool = True
    auto_mail_enabled: bool = False
    auto_mail_use_global_recipients: bool = False
    auto_mail_use_position_recipients: bool = False
    auto_mail_position_recipient_ids: List[int] = Field(default_factory=list)
    auto_mail_allowed_candidate_statuses: List[str] = Field(default_factory=lambda: ["screening_passed"])
    auto_mail_template_id: Optional[str] = None
    auto_mail_dedup_mode: str = Field("once_per_candidate_per_status")
    auto_mail_cc_recipient_ids: List[int] = Field(default_factory=list)
    auto_mail_bcc_recipient_ids: List[int] = Field(default_factory=list)
    jd_skill_ids: List[int] = Field(default_factory=list)
    screening_skill_ids: List[int] = Field(default_factory=list)
    interview_skill_ids: List[int] = Field(default_factory=list)


class PositionUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    salary_range: Optional[str] = None
    headcount: Optional[int] = Field(None, ge=1, le=999)
    key_requirements: Optional[str] = None
    bonus_points: Optional[str] = None
    summary: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None
    auto_screen_on_upload: Optional[bool] = None
    auto_advance_on_screening: Optional[bool] = None
    auto_mail_enabled: Optional[bool] = None
    auto_mail_use_global_recipients: Optional[bool] = None
    auto_mail_use_position_recipients: Optional[bool] = None
    auto_mail_position_recipient_ids: Optional[List[int]] = None
    auto_mail_allowed_candidate_statuses: Optional[List[str]] = None
    auto_mail_template_id: Optional[str] = None
    auto_mail_dedup_mode: Optional[str] = None
    auto_mail_cc_recipient_ids: Optional[List[int]] = None
    auto_mail_bcc_recipient_ids: Optional[List[int]] = None
    jd_skill_ids: Optional[List[int]] = None
    screening_skill_ids: Optional[List[int]] = None
    interview_skill_ids: Optional[List[int]] = None


class JDGenerateRequest(BaseModel):
    extra_prompt: Optional[str] = None
    auto_activate: bool = True


class SaveJDVersionRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    jd_markdown: str = Field(..., min_length=1)
    jd_html: Optional[str] = None
    publish_text: Optional[str] = None
    notes: Optional[str] = None
    auto_activate: bool = False


class CandidateUpdateRequest(BaseModel):
    position_id: Optional[int] = None
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    phone: Optional[str] = None
    email: Optional[str] = None
    current_company: Optional[str] = None
    years_of_experience: Optional[str] = None
    education: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    manual_override_score: Optional[float] = Field(None, ge=0, le=100)
    manual_override_reason: Optional[str] = None


class CandidateStatusUpdateRequest(BaseModel):
    status: str = Field(..., min_length=1, max_length=50)
    reason: Optional[str] = None


class TriggerCandidateProcessRequest(BaseModel):
    force: bool = False


class CandidateScreenRequest(BaseModel):
    skill_ids: List[int] = Field(default_factory=list)
    use_candidate_memory: bool = True
    use_position_skills: bool = True
    custom_requirements: Optional[str] = None


class SkillUpsertRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None
    content: str = Field(..., min_length=1)
    tags: List[str] = Field(default_factory=list)
    sort_order: int = Field(99, ge=0, le=9999)
    is_enabled: bool = True


class PublishTaskCreateRequest(BaseModel):
    position_id: int = Field(..., ge=1)
    target_platform: str = Field(..., min_length=1, max_length=80)
    mode: str = Field("mock", min_length=1, max_length=50)


class InterviewQuestionGenerateRequest(BaseModel):
    round_name: str = Field("初试", min_length=1, max_length=80)
    custom_requirements: Optional[str] = None
    skill_ids: List[int] = Field(default_factory=list)
    use_candidate_memory: bool = True
    use_position_skills: bool = True


class InterviewResultCreateRequest(BaseModel):
    candidate_id: int = Field(..., ge=1)
    position_id: Optional[int] = None
    interviewer_name: Optional[str] = None
    round_name: str = Field("初试", min_length=1, max_length=80)
    notes_text: Optional[str] = None
    transcript_text: Optional[str] = None


class RecruitmentChatContextUpdateRequest(BaseModel):
    position_id: Optional[int] = None
    candidate_id: Optional[int] = None
    skill_ids: List[int] = Field(default_factory=list)


class RecruitmentChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    context: Optional[Dict[str, Any]] = None


class RecruitmentLLMConfigUpsertRequest(BaseModel):
    config_key: str = Field(..., min_length=1, max_length=120)
    task_type: str = Field("default", min_length=1, max_length=80)
    provider: str = Field(..., min_length=1, max_length=80)
    model_name: str = Field(..., min_length=1, max_length=120)
    base_url: Optional[str] = None
    api_key_env: Optional[str] = None
    api_key_value: Optional[str] = None
    extra_config: Optional[Dict[str, Any]] = None
    is_active: bool = True
    priority: int = Field(99, ge=0, le=999)


class RecruitmentMailSenderUpsertRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    from_name: Optional[str] = None
    from_email: str = Field(..., min_length=3, max_length=180)
    smtp_host: str = Field(..., min_length=1, max_length=255)
    smtp_port: int = Field(465, ge=1, le=65535)
    username: str = Field(..., min_length=1, max_length=180)
    password: Optional[str] = None
    use_ssl: bool = True
    use_starttls: bool = False
    is_default: bool = False
    is_enabled: bool = True


class RecruitmentMailRecipientUpsertRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=180)
    department: Optional[str] = None
    role_title: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    is_enabled: bool = True


class RecruitmentResumeMailSendRequest(BaseModel):
    sender_config_id: Optional[int] = None
    candidate_ids: List[int] = Field(..., min_length=1)
    recipient_ids: List[int] = Field(default_factory=list)
    recipient_emails: List[str] = Field(default_factory=list)
    cc_recipient_ids: List[int] = Field(default_factory=list)
    cc_recipient_emails: List[str] = Field(default_factory=list)
    bcc_recipient_ids: List[int] = Field(default_factory=list)
    bcc_recipient_emails: List[str] = Field(default_factory=list)
    subject: Optional[str] = None
    body_text: Optional[str] = None
    body_html: Optional[str] = None


class RecruitmentMailAutoPushGlobalConfigRequest(BaseModel):
    global_default_recipient_ids: List[int] = Field(default_factory=list)
    global_auto_push_enabled: bool = False
