"""Migrate pending_match status to unmatched.

背景：pending_match 状态拆分为 matching + unmatched。
- matching: AI 匹配进行中（瞬态，新上传的候选人）
- unmatched: 匹配完成无岗位（原 pending_match 的最终状态）

现有数据库中 pending_match 的数据都是已完成匹配但无结果的，应迁移到 unmatched。
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import engine

SQL = [
    "UPDATE recruitment_candidates SET status = 'unmatched' WHERE status = 'pending_match'",
]


def main():
    with engine.begin() as conn:
        for stmt in SQL:
            print(f"Executing: {stmt}")
            result = conn.execute(__import__("sqlalchemy").text(stmt))
            print(f"  Rows affected: {result.rowcount}")
    print("Done.")


if __name__ == "__main__":
    main()
