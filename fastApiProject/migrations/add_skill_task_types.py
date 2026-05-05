"""Add task_types_json column to recruitment_skills table."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import engine

SQL = [
    "ALTER TABLE recruitment_skills ADD COLUMN task_types_json TEXT AFTER tags_json",
]


def main():
    with engine.begin() as conn:
        for stmt in SQL:
            print(f"Executing: {stmt}")
            conn.execute(__import__("sqlalchemy").text(stmt))
    print("Done.")


if __name__ == "__main__":
    main()
