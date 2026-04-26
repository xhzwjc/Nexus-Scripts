#!/usr/bin/env python3
"""
轮换 Script Hub 用户访问密钥

默认行为：
1. 只轮换内置用户：admin/operator/qa/pm/cs
2. 仅处理数据库中存在且未删除的用户
3. 输出新密钥 JSON，方便管理员分发

用法：
    ./fastApiProject/venv/bin/python fastApiProject/rotate_script_hub_access_keys.py
    ./fastApiProject/venv/bin/python fastApiProject/rotate_script_hub_access_keys.py admin operator
"""

import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent))

from app.database import SessionLocal
from app.rbac_models import ScriptHubUser
from app.schema_maintenance import ensure_script_hub_schema
from app.services.script_hub_admin_service import rotate_user_access_key
from app.services.script_hub_audit_service import write_audit_log
from app.services.script_hub_auth_service import authenticate_access_key

DEFAULT_BUILT_IN_USERS = ("admin", "operator", "qa", "pm", "cs")
SYSTEM_ACTOR = {"id": "system", "name": "Rotation Script"}


def resolve_targets(db, requested_user_codes):
    existing_codes = {
        user.user_code
        for user in db.query(ScriptHubUser)
        .filter(ScriptHubUser.is_deleted.is_(False))
        .all()
    }

    if requested_user_codes:
        targets = [user_code for user_code in requested_user_codes if user_code in existing_codes]
    else:
        targets = [user_code for user_code in DEFAULT_BUILT_IN_USERS if user_code in existing_codes]

    return targets


def main():
    requested_user_codes = [arg.strip().lower() for arg in sys.argv[1:] if arg.strip()]

    ensure_script_hub_schema()
    db = SessionLocal()
    try:
        targets = resolve_targets(db, requested_user_codes)
        if not targets:
            print("No matching Script Hub users found to rotate.", file=sys.stderr)
            sys.exit(1)

        results = []
        for user_code in targets:
            user, generated_access_key = rotate_user_access_key(db, user_code)
            write_audit_log(
                db,
                actor=SYSTEM_ACTOR,
                request=None,
                action="user.rotate_key.system",
                target_type="user",
                target_code=user["user_code"],
                details={"rotation_source": "script", "target_user_code": user["user_code"]},
            )

            verified = authenticate_access_key(db, generated_access_key)
            results.append(
                {
                    "user_code": user["user_code"],
                    "display_name": user["display_name"],
                    "access_key": generated_access_key,
                    "verified": bool(verified and verified.get("id") == user["user_code"]),
                }
            )

        print(json.dumps({"rotated_users": results}, ensure_ascii=False, indent=2))
    finally:
        db.close()


if __name__ == "__main__":
    main()
