import importlib.util
import json
from pathlib import Path
import sys


def _load_bootstrap_resources_module():
    repo_root = Path(__file__).resolve().parents[2]
    module_path = repo_root / "bootstrap_resources_recruitment.py"
    repo_root_str = str(repo_root)
    if repo_root_str not in sys.path:
        sys.path.insert(0, repo_root_str)
    spec = importlib.util.spec_from_file_location("bootstrap_resources_recruitment", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load bootstrap_resources_recruitment.py")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_load_rbac_seed_falls_back_to_default_when_file_missing():
    module = _load_bootstrap_resources_module()

    seed, using_seed_file = module.load_rbac_seed(None)

    assert using_seed_file is False
    assert seed["roles"] == []
    assert [user["user_code"] for user in seed["users"]] == [
        "admin",
        "resource_manager",
        "recruitment_operator",
    ]


def test_load_or_create_bootstrap_users_reuses_existing_key_by_user_code(tmp_path):
    module = _load_bootstrap_resources_module()

    users_file = tmp_path / "bootstrap-users.json"
    users_file.write_text(
        json.dumps(
            {
                "users": {
                    "seed-admin-key": {
                        "id": "admin",
                        "name": "Old Admin",
                        "role": "admin",
                        "permissions": {
                            "team-resources": True,
                        },
                    }
                }
            }
        ),
        encoding="utf-8",
    )

    seed_payload = {
        "version": 1,
        "roles": [],
        "users": [
            {
                "user_code": "admin",
                "display_name": "System Administrator",
                "role_codes": ["admin"],
                "granted_permissions": [],
                "revoked_permissions": [],
                "team_resources_login_key_enabled": True,
                "is_active": True,
                "is_super_admin": True,
                "notes": None,
            }
        ],
    }

    payload, reused_existing = module.load_or_create_bootstrap_users(users_file, seed_payload, regenerate_keys=False)

    assert reused_existing is True
    assert list(payload["users"].keys()) == ["seed-admin-key"]
    admin = payload["users"]["seed-admin-key"]
    assert admin["id"] == "admin"
    assert admin["permissions"]["rbac-manage"] is True
    assert admin["permissions"]["ai-recruitment"] is True
    assert admin["permissions"]["ai-recruitment-manage"] is True


def test_load_or_create_bootstrap_users_includes_custom_role_permissions(tmp_path):
    module = _load_bootstrap_resources_module()

    users_file = tmp_path / "bootstrap-users.json"
    seed_payload = {
        "version": 1,
        "roles": [
            {
                "code": "ops-lite",
                "name": "Ops Lite",
                "description": "",
                "permission_keys": ["team-resources", "ai-resources"],
                "is_active": True,
            }
        ],
        "users": [
            {
                "user_code": "opslite",
                "display_name": "Ops Lite User",
                "role_codes": ["ops-lite"],
                "granted_permissions": ["delivery-tool"],
                "revoked_permissions": ["ai-resources"],
                "team_resources_login_key_enabled": True,
                "is_active": True,
                "is_super_admin": False,
                "notes": None,
            }
        ],
    }

    payload, reused_existing = module.load_or_create_bootstrap_users(users_file, seed_payload, regenerate_keys=False)

    assert reused_existing is False
    assert len(payload["users"]) == 1
    user = next(iter(payload["users"].values()))
    assert user["id"] == "opslite"
    assert user["permissions"]["team-resources"] is True
    assert user["permissions"]["delivery-tool"] is True
    assert "ai-resources" not in user["permissions"]
