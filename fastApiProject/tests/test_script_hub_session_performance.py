import inspect
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from app import database, script_hub_session
from app.services import script_hub_auth_service


def _session_user(user_code: str = "session-performance-user") -> dict[str, object]:
    return {
        "id": user_code,
        "role": "admin",
        "roles": ["admin"],
        "name": "Session Performance User",
        "permissions": {"rbac-manage": True},
        "isSuperAdmin": True,
        "primaryOrgCode": "group",
        "dataScope": "ALL",
        "customOrgCodes": [],
        "authorizationBoundary": {},
        "permissionVersion": 7,
        "accessKeyVersion": 3,
        "teamResourcesLoginKeyEnabled": False,
    }


def test_created_session_preheats_version_cache(monkeypatch):
    monkeypatch.setenv("SCRIPT_HUB_SESSION_SECRET", "session-performance-secret")
    user = _session_user()
    script_hub_session.invalidate_script_hub_session_refresh_cache(str(user["id"]))
    token = script_hub_session.create_script_hub_session(user)["token"]
    payload = script_hub_session.verify_script_hub_session(token)
    assert payload is not None

    def _unexpected_session_factory():
        raise AssertionError("preheated session must not open a database connection")

    monkeypatch.setattr(database, "SessionLocal", _unexpected_session_factory)
    refreshed = script_hub_session._refresh_versioned_session(payload)

    assert refreshed["id"] == user["id"]
    assert refreshed["permissionVersion"] == 7


def test_concurrent_cold_session_refresh_uses_singleflight(monkeypatch):
    monkeypatch.setenv("SCRIPT_HUB_SESSION_SECRET", "session-performance-secret")
    user = _session_user("singleflight-user")
    token = script_hub_session.create_script_hub_session(user)["token"]
    payload = script_hub_session.verify_script_hub_session(token)
    assert payload is not None
    script_hub_session.invalidate_script_hub_session_refresh_cache(str(user["id"]))

    calls = 0
    calls_lock = threading.Lock()

    class _FakeDb:
        def close(self):
            return None

    def _fake_session_factory():
        return _FakeDb()

    def _fake_get_session_user_by_code(_db, user_code):
        nonlocal calls
        with calls_lock:
            calls += 1
        time.sleep(0.05)
        assert user_code == user["id"]
        return dict(user)

    monkeypatch.setattr(database, "SessionLocal", _fake_session_factory)
    monkeypatch.setattr(script_hub_auth_service, "get_session_user_by_code", _fake_get_session_user_by_code)

    with ThreadPoolExecutor(max_workers=12) as executor:
        results = list(executor.map(lambda _index: script_hub_session._refresh_versioned_session(payload), range(12)))

    assert calls == 1
    assert all(result["id"] == user["id"] for result in results)


def test_permission_dependencies_are_sync_for_fastapi_threadpool():
    permission_dependency = script_hub_session.require_script_hub_permission("rbac-manage")
    any_permission_dependency = script_hub_session.require_script_hub_any_permission(["rbac-manage"])

    assert not inspect.iscoroutinefunction(permission_dependency)
    assert not inspect.iscoroutinefunction(any_permission_dependency)
