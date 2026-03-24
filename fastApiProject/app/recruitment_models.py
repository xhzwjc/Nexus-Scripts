from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

from .database import Base


class RecruitmentPosition(Base):
    __tablename__ = "recruitment_positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position_code = Column(String(64), unique=True, index=True, nullable=False)
    title = Column(String(200), nullable=False, index=True)
    department = Column(String(120))
    location = Column(String(120))
    employment_type = Column(String(60))
    salary_range = Column(String(120))
    headcount = Column(Integer, default=1, nullable=False)
    key_requirements = Column(Text)
    bonus_points = Column(Text)
    summary = Column(Text)
    status = Column(String(50), default="draft", nullable=False, index=True)
    auto_screen_on_upload = Column(Boolean, default=False, nullable=False)
    auto_advance_on_screening = Column(Boolean, default=True, nullable=False)
    current_jd_version_id = Column(Integer, index=True)
    tags_json = Column(Text)
    created_by = Column(String(100))
    updated_by = Column(String(100))
    deleted = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentJDVersion(Base):
    __tablename__ = "recruitment_jd_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position_id = Column(Integer, nullable=False, index=True)
    version_no = Column(Integer, nullable=False)
    title = Column(String(200), nullable=False)
    prompt_snapshot = Column(Text)
    jd_markdown = Column(Text)
    jd_html = Column(Text)
    publish_text = Column(Text)
    notes = Column(Text)
    is_active = Column(Boolean, default=False, nullable=False, index=True)
    created_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class RecruitmentCandidate(Base):
    __tablename__ = "recruitment_candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_code = Column(String(64), unique=True, index=True, nullable=False)
    position_id = Column(Integer, index=True)
    name = Column(String(120), nullable=False, index=True)
    phone = Column(String(40), index=True)
    email = Column(String(180), index=True)
    current_company = Column(String(180))
    years_of_experience = Column(String(60))
    education = Column(String(120))
    source = Column(String(50), default="manual_upload", nullable=False, index=True)
    source_detail = Column(String(255))
    status = Column(String(50), default="pending_screening", nullable=False, index=True)
    ai_recommended_status = Column(String(50), index=True)
    match_percent = Column(Float)
    tags_json = Column(Text)
    notes = Column(Text)
    latest_resume_file_id = Column(Integer, index=True)
    latest_parse_result_id = Column(Integer, index=True)
    latest_score_id = Column(Integer, index=True)
    created_by = Column(String(100))
    updated_by = Column(String(100))
    deleted = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentResumeFile(Base):
    __tablename__ = "recruitment_resume_files"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, nullable=False, index=True)
    original_name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    file_ext = Column(String(20))
    mime_type = Column(String(100))
    file_size = Column(Integer, default=0, nullable=False)
    storage_path = Column(String(500), nullable=False)
    parse_status = Column(String(50), default="pending", nullable=False, index=True)
    parse_error = Column(Text)
    uploaded_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class RecruitmentResumeParseResult(Base):
    __tablename__ = "recruitment_resume_parse_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, nullable=False, index=True)
    resume_file_id = Column(Integer, nullable=False, index=True)
    raw_text = Column(Text)
    basic_info_json = Column(Text)
    work_experiences_json = Column(Text)
    education_experiences_json = Column(Text)
    skills_json = Column(Text)
    projects_json = Column(Text)
    summary_text = Column(Text)
    status = Column(String(50), default="success", nullable=False, index=True)
    error_message = Column(Text)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class RecruitmentCandidateScore(Base):
    __tablename__ = "recruitment_candidate_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, nullable=False, index=True)
    parse_result_id = Column(Integer, nullable=False, index=True)
    score_json = Column(Text)
    total_score = Column(Float)
    match_percent = Column(Float)
    advantages_text = Column(Text)
    concerns_text = Column(Text)
    recommendation = Column(String(255))
    suggested_status = Column(String(50), index=True)
    manual_override_score = Column(Float)
    manual_override_reason = Column(Text)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentCandidateStatusHistory(Base):
    __tablename__ = "recruitment_candidate_status_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, nullable=False, index=True)
    from_status = Column(String(50))
    to_status = Column(String(50), nullable=False, index=True)
    reason = Column(Text)
    changed_by = Column(String(100))
    source = Column(String(50), default="manual", nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class RecruitmentSkill(Base):
    __tablename__ = "recruitment_skills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    skill_code = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(120), nullable=False, index=True)
    description = Column(String(255))
    content = Column(Text, nullable=False)
    tags_json = Column(Text)
    sort_order = Column(Integer, default=99, nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False, index=True)
    created_by = Column(String(100))
    updated_by = Column(String(100))
    deleted = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentPositionSkillLink(Base):
    __tablename__ = "recruitment_position_skill_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position_id = Column(Integer, nullable=False, index=True)
    skill_id = Column(Integer, nullable=False, index=True)
    created_by = Column(String(100))
    updated_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentAITaskLog(Base):
    __tablename__ = "recruitment_ai_task_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_type = Column(String(80), nullable=False, index=True)
    related_position_id = Column(Integer, index=True)
    related_candidate_id = Column(Integer, index=True)
    related_skill_id = Column(Integer, index=True)
    related_skill_ids_json = Column(Text)
    related_skill_snapshots_json = Column(Text)
    related_resume_file_id = Column(Integer, index=True)
    related_publish_task_id = Column(Integer, index=True)
    memory_source = Column(String(80))
    request_hash = Column(String(120), index=True)
    model_provider = Column(String(80))
    model_name = Column(String(120))
    prompt_snapshot = Column(Text)
    input_summary = Column(Text)
    output_summary = Column(Text)
    output_snapshot = Column(Text)
    status = Column(String(50), default="pending", nullable=False, index=True)
    error_message = Column(Text)
    token_usage_json = Column(Text)
    created_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentRuleConfig(Base):
    __tablename__ = "recruitment_rule_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    config_key = Column(String(120), nullable=False, index=True)
    config_type = Column(String(50), nullable=False)
    scope = Column(String(50), default="global", nullable=False, index=True)
    scope_id = Column(String(120), index=True)
    config_value = Column(Text, nullable=False)
    description = Column(String(255))
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentLLMConfig(Base):
    __tablename__ = "recruitment_llm_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    config_key = Column(String(120), unique=True, index=True, nullable=False)
    task_type = Column(String(80), nullable=False, index=True)
    provider = Column(String(80), nullable=False)
    model_name = Column(String(120), nullable=False)
    base_url = Column(String(255))
    api_key_env = Column(String(120))
    api_key_ciphertext = Column(Text)
    extra_config_json = Column(Text)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    priority = Column(Integer, default=99, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentInterviewQuestion(Base):
    __tablename__ = "recruitment_interview_questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, nullable=False, index=True)
    position_id = Column(Integer, index=True)
    skill_ids_json = Column(Text)
    round_name = Column(String(80), default="初试", nullable=False)
    custom_requirements = Column(Text)
    html_content = Column(Text)
    markdown_content = Column(Text)
    status = Column(String(50), default="generated", nullable=False)
    created_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentCandidateWorkflowMemory(Base):
    __tablename__ = "recruitment_candidate_workflow_memories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, nullable=False, unique=True, index=True)
    position_id = Column(Integer, index=True)
    screening_skill_ids_json = Column(Text)
    screening_memory_source = Column(String(80))
    screening_rule_snapshot_json = Column(Text)
    latest_parse_result_id = Column(Integer, index=True)
    latest_score_id = Column(Integer, index=True)
    last_screened_at = Column(DateTime)
    interview_skill_ids_json = Column(Text)
    last_interview_question_id = Column(Integer, index=True)
    created_by = Column(String(100))
    updated_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentChatContextMemory(Base):
    __tablename__ = "recruitment_chat_context_memories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(100), nullable=False, unique=True, index=True)
    position_id = Column(Integer, index=True)
    candidate_id = Column(Integer, index=True)
    skill_ids_json = Column(Text)
    context_json = Column(Text)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentMailSenderConfig(Base):
    __tablename__ = "recruitment_mail_sender_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False, index=True)
    from_name = Column(String(120))
    from_email = Column(String(180), nullable=False, index=True)
    smtp_host = Column(String(255), nullable=False)
    smtp_port = Column(Integer, default=465, nullable=False)
    username = Column(String(180), nullable=False)
    password_ciphertext = Column(Text)
    use_ssl = Column(Boolean, default=True, nullable=False)
    use_starttls = Column(Boolean, default=False, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False, index=True)
    is_enabled = Column(Boolean, default=True, nullable=False, index=True)
    created_by = Column(String(100))
    updated_by = Column(String(100))
    deleted = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentMailRecipient(Base):
    __tablename__ = "recruitment_mail_recipients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False, index=True)
    email = Column(String(180), nullable=False, index=True)
    department = Column(String(120))
    role_title = Column(String(120))
    tags_json = Column(Text)
    notes = Column(Text)
    is_enabled = Column(Boolean, default=True, nullable=False, index=True)
    created_by = Column(String(100))
    updated_by = Column(String(100))
    deleted = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentResumeMailDispatch(Base):
    __tablename__ = "recruitment_resume_mail_dispatches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sender_config_id = Column(Integer, index=True)
    candidate_ids_json = Column(Text)
    recipient_ids_json = Column(Text)
    recipient_emails_json = Column(Text)
    subject = Column(String(255))
    body_text = Column(Text)
    body_html = Column(Text)
    attachment_count = Column(Integer, default=0, nullable=False)
    status = Column(String(50), default="pending", nullable=False, index=True)
    error_message = Column(Text)
    sent_at = Column(DateTime)
    created_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentInterviewResult(Base):
    __tablename__ = "recruitment_interview_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    candidate_id = Column(Integer, nullable=False, index=True)
    position_id = Column(Integer, index=True)
    interviewer_name = Column(String(120))
    round_name = Column(String(80), default="初试", nullable=False)
    notes_text = Column(Text)
    transcript_text = Column(Text)
    analysis_json = Column(Text)
    final_recommendation = Column(String(80))
    created_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class RecruitmentPublishTask(Base):
    __tablename__ = "recruitment_publish_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    position_id = Column(Integer, nullable=False, index=True)
    target_platform = Column(String(80), nullable=False, index=True)
    mode = Column(String(50), nullable=False)
    adapter_code = Column(String(80), nullable=False)
    status = Column(String(50), default="pending", nullable=False, index=True)
    request_payload = Column(Text)
    response_payload = Column(Text)
    published_url = Column(String(500))
    screenshot_path = Column(String(500))
    retry_count = Column(Integer, default=0, nullable=False)
    error_message = Column(Text)
    created_by = Column(String(100))
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
