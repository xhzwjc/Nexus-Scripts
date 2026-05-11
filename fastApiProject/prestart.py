"""Prestart script — runs ONCE before Gunicorn boots any worker.

Usage in Dockerfile CMD or entrypoint:
    python prestart.py && gunicorn run:app -w 4 ...
"""
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("prestart")


def main() -> None:
    from app.schema_maintenance import ensure_recruitment_schema, ensure_script_hub_schema

    logger.info("Prestart: initializing script_hub schema ...")
    ensure_script_hub_schema()
    logger.info("Prestart: script_hub schema ready")

    logger.info("Prestart: initializing recruitment schema ...")
    ensure_recruitment_schema()
    logger.info("Prestart: recruitment schema ready")

    logger.info("Prestart: all schemas initialized successfully")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("Prestart failed")
        sys.exit(1)
