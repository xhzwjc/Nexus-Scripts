"""
Migration script: upgrade TEXT columns to MEDIUMTEXT for large JSON storage.
Run once: python -m migrations.upgrade_text_to_mediumtext

MEDIUMTEXT supports up to 16MB, sufficient for any AI response JSON.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import engine
from sqlalchemy import text


ALTER_STATEMENTS = [
    # recruitment_candidate_scores
    "ALTER TABLE recruitment_candidate_scores MODIFY COLUMN score_json MEDIUMTEXT",

    # recruitment_resume_parse_results
    "ALTER TABLE recruitment_resume_parse_results MODIFY COLUMN raw_text MEDIUMTEXT",
    "ALTER TABLE recruitment_resume_parse_results MODIFY COLUMN basic_info_json MEDIUMTEXT",
    "ALTER TABLE recruitment_resume_parse_results MODIFY COLUMN work_experiences_json MEDIUMTEXT",
    "ALTER TABLE recruitment_resume_parse_results MODIFY COLUMN education_experiences_json MEDIUMTEXT",
    "ALTER TABLE recruitment_resume_parse_results MODIFY COLUMN skills_json MEDIUMTEXT",
    "ALTER TABLE recruitment_resume_parse_results MODIFY COLUMN projects_json MEDIUMTEXT",

    # recruitment_ai_task_logs
    "ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN prompt_snapshot MEDIUMTEXT",
    "ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN full_request_snapshot MEDIUMTEXT",
    "ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN output_snapshot MEDIUMTEXT",
    "ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN raw_response_text MEDIUMTEXT",
    "ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN parsed_response_json MEDIUMTEXT",
    "ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN sanitized_response_json MEDIUMTEXT",
    "ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN validation_meta_json MEDIUMTEXT",
    "ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN persisted_result_refs_json MEDIUMTEXT",
    "ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN skill_resolution_detail_json MEDIUMTEXT",
    "ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN score_rule_snapshot_json MEDIUMTEXT",
    "ALTER TABLE recruitment_ai_task_logs MODIFY COLUMN timing_breakdown_json MEDIUMTEXT",
]


def main():
    print("Starting TEXT -> MEDIUMTEXT migration...")
    with engine.connect() as conn:
        for stmt in ALTER_STATEMENTS:
            col = stmt.split("MODIFY COLUMN ")[1].split()[0]
            table = stmt.split()[2]
            try:
                conn.execute(text(stmt))
                conn.commit()
                print(f"  [OK]  {table}.{col}")
            except Exception as e:
                print(f"  [SKIP] {table}.{col}: {e}")
    print("Migration complete.")


if __name__ == "__main__":
    main()
