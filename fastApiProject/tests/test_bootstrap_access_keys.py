import json

from app.legacy_access_keys import (
    generate_bootstrap_admin_key,
    load_bootstrap_access_keys,
    parse_bootstrap_access_keys_from_file,
)


def test_parse_bootstrap_access_keys_from_file_supports_wrapped_users_payload(tmp_path):
    file_path = tmp_path / "bootstrap-users.json"
    file_path.write_text(
        json.dumps(
            {
                "users": {
                    "seed-admin-key": {
                        "id": "admin",
                        "name": "Admin",
                        "role": "admin",
                        "permissions": {
                            "settlement": True,
                            "unknown-permission": True,
                        },
                    }
                }
            }
        ),
        encoding="utf-8",
    )

    result = parse_bootstrap_access_keys_from_file(str(file_path))

    assert list(result.keys()) == ["seed-admin-key"]
    assert result["seed-admin-key"]["id"] == "admin"
    assert result["seed-admin-key"]["role"] == "admin"
    assert result["seed-admin-key"]["permissions"] == {"settlement": True}


def test_load_bootstrap_access_keys_prefers_file_over_deprecated_env(tmp_path, monkeypatch):
    file_path = tmp_path / "bootstrap-users.json"
    file_path.write_text(
        json.dumps(
            {
                "users": {
                    "file-key": {
                        "id": "operator",
                        "name": "Operator",
                        "role": "operator",
                        "permissions": {"balance": True},
                    }
                }
            }
        ),
        encoding="utf-8",
    )

    monkeypatch.setenv("SCRIPT_HUB_BOOTSTRAP_USERS_FILE", str(file_path))
    monkeypatch.setenv(
        "SCRIPT_HUB_ACCESS_KEYS_JSON",
        json.dumps(
            {
                "legacy-key": {
                    "id": "legacy",
                    "name": "Legacy",
                    "role": "admin",
                    "permissions": {"settlement": True},
                }
            }
        ),
    )

    users, source = load_bootstrap_access_keys()

    assert source == "bootstrap_users_file"
    assert list(users.keys()) == ["file-key"]


def test_generate_bootstrap_admin_key_uses_script_hub_prefix():
    generated = generate_bootstrap_admin_key()
    assert generated.startswith("sh_")
    assert len(generated) > 10
