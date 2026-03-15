import logging
from threading import Lock

from sqlalchemy import inspect, text

from .database import Base, engine

logger = logging.getLogger(__name__)

_schema_lock = Lock()
_schema_ensured = False


def ensure_script_hub_schema() -> None:
    global _schema_ensured

    if _schema_ensured:
        return

    with _schema_lock:
        if _schema_ensured:
            return

        Base.metadata.create_all(bind=engine)

        inspector = inspect(engine)
        if not inspector.has_table("script_hub_users"):
            _schema_ensured = True
            return

        columns = {column["name"] for column in inspector.get_columns("script_hub_users")}
        if "team_resources_access_enabled" not in columns:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        """
                        ALTER TABLE script_hub_users
                        ADD COLUMN team_resources_access_enabled BOOLEAN NOT NULL DEFAULT TRUE
                        """
                    )
                )
            logger.info("Added script_hub_users.team_resources_access_enabled column")

        if "is_deleted" not in columns:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        """
                        ALTER TABLE script_hub_users
                        ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE
                        """
                    )
                )
            logger.info("Added script_hub_users.is_deleted column")

        if "deleted_at" not in columns:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        """
                        ALTER TABLE script_hub_users
                        ADD COLUMN deleted_at DATETIME NULL
                        """
                    )
                )
            logger.info("Added script_hub_users.deleted_at column")

        role_columns = {column["name"] for column in inspector.get_columns("script_hub_roles")}
        if "is_deleted" not in role_columns:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        """
                        ALTER TABLE script_hub_roles
                        ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE
                        """
                    )
                )
            logger.info("Added script_hub_roles.is_deleted column")

        if "deleted_at" not in role_columns:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        """
                        ALTER TABLE script_hub_roles
                        ADD COLUMN deleted_at DATETIME NULL
                        """
                    )
                )
            logger.info("Added script_hub_roles.deleted_at column")

        _schema_ensured = True
