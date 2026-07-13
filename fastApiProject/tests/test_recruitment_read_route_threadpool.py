import asyncio
import inspect
import threading
import time

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import recruitment
from app.script_hub_session import create_script_hub_session


def _auth_headers() -> dict[str, str]:
    token = create_script_hub_session(
        {
            "id": "recruitment-read-route-tester",
            "role": "tester",
            "roles": ["tester"],
            "name": "Recruitment Read Route Tester",
            "permissions": {"recruitment-dashboard-view": True},
        }
    )["token"]
    return {"Authorization": f"Bearer {token}"}


class _ReadService:
    def __init__(self):
        self.calls: list[tuple[str, dict[str, object]]] = []

    def list_positions(self, **kwargs):
        self.calls.append(("positions", kwargs))
        return [{"id": 1, "title": "Backend Engineer"}]

    def get_candidate_stats(self, **kwargs):
        self.calls.append(("stats", kwargs))
        return {"total": 12}

    def get_recruitment_funnel(self, **kwargs):
        self.calls.append(("funnel", kwargs))
        return {"screening": 7}

    def get_source_stats(self, **kwargs):
        self.calls.append(("source-stats", kwargs))
        return {"referral": 3}

    def list_candidates(self, **kwargs):
        self.calls.append(("candidates", kwargs))
        return {"items": [{"id": 11, "name": "Candidate A"}], "total": 1}


def _build_app(service) -> FastAPI:
    app = FastAPI()
    app.include_router(recruitment.recruitment_router)
    app.dependency_overrides[recruitment.get_recruitment_service] = lambda: service
    return app


def test_high_frequency_read_routes_are_sync_endpoints():
    endpoints = (
        recruitment.list_positions,
        recruitment.get_candidate_stats,
        recruitment.get_recruitment_funnel,
        recruitment.get_source_stats,
        recruitment.list_candidates,
    )

    assert all(not inspect.iscoroutinefunction(endpoint) for endpoint in endpoints)


def test_high_frequency_read_routes_keep_request_and_response_semantics(monkeypatch):
    monkeypatch.setenv("SCRIPT_HUB_SESSION_SECRET", "read-route-threadpool-test-secret")
    service = _ReadService()

    with TestClient(_build_app(service)) as client:
        headers = _auth_headers()

        positions_response = client.get(
            "/recruitment/positions",
            params={"query": "Backend", "status": "open"},
            headers=headers,
        )
        stats_response = client.get(
            "/recruitment/candidates/stats",
            params={"position_id": 7, "org_code": "company-a"},
            headers=headers,
        )
        funnel_response = client.get(
            "/recruitment/candidates/funnel",
            params={"position_id": 7, "org_code": "company-a"},
            headers=headers,
        )
        source_response = client.get(
            "/recruitment/candidates/source-stats",
            params={"position_id": 7, "org_code": "company-a"},
            headers=headers,
        )
        default_candidates_response = client.get(
            "/recruitment/candidates",
            headers=headers,
        )
        filtered_candidates_response = client.get(
            "/recruitment/candidates",
            params={
                "query": "Alice",
                "status": "screening_pending",
                "position_id": 7,
                "tag": "priority",
                "limit": 15,
                "offset": 30,
                "org_code": "company-a",
                "compact": "true",
                "sort_by": "updated_at",
                "sort_order": "desc",
                "source": "referral",
                "time_filter": "week",
                "match_min": 75.5,
            },
            headers=headers,
        )

    assert positions_response.status_code == 200
    assert positions_response.json()["data"] == [{"id": 1, "title": "Backend Engineer"}]
    assert positions_response.json()["total"] == 1
    assert stats_response.json()["data"] == {"total": 12}
    assert funnel_response.json()["data"] == {"screening": 7}
    assert source_response.json()["data"] == {"referral": 3}
    assert default_candidates_response.json()["data"] == {
        "items": [{"id": 11, "name": "Candidate A"}],
        "total": 1,
    }
    assert filtered_candidates_response.json()["data"] == {
        "items": [{"id": 11, "name": "Candidate A"}],
        "total": 1,
    }
    assert service.calls == [
        ("positions", {"query": "Backend", "status": "open"}),
        ("stats", {"position_id": 7, "org_code": "company-a"}),
        ("funnel", {"position_id": 7, "org_code": "company-a"}),
        ("source-stats", {"position_id": 7, "org_code": "company-a"}),
        (
            "candidates",
            {
                "query": None,
                "status": None,
                "position_id": None,
                "tag": None,
                "limit": 0,
                "offset": 0,
                "org_code": None,
                "compact": False,
                "sort_by": None,
                "sort_order": None,
                "source": None,
                "time_filter": None,
                "match_min": None,
            },
        ),
        (
            "candidates",
            {
                "query": "Alice",
                "status": "screening_pending",
                "position_id": 7,
                "tag": "priority",
                "limit": 15,
                "offset": 30,
                "org_code": "company-a",
                "compact": True,
                "sort_by": "updated_at",
                "sort_order": "desc",
                "source": "referral",
                "time_filter": "week",
                "match_min": 75.5,
            },
        ),
    ]


def test_blocking_candidate_query_does_not_block_async_routes(monkeypatch):
    monkeypatch.setenv("SCRIPT_HUB_SESSION_SECRET", "read-route-concurrency-test-secret")
    started = threading.Event()
    release = threading.Event()

    class _BlockingReadService:
        def list_candidates(self, **_kwargs):
            started.set()
            release.wait(timeout=2.0)
            return {"items": [], "total": 0}

    app = _build_app(_BlockingReadService())

    @app.get("/event-loop-probe")
    async def event_loop_probe():
        return {"responsive": True}

    async def run_scenario():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            started_at = time.perf_counter()
            slow_request = asyncio.create_task(
                client.get("/recruitment/candidates", headers=_auth_headers())
            )
            while not started.is_set():
                if time.perf_counter() - started_at > 2.5:
                    raise AssertionError("candidate request did not reach the service")
                await asyncio.sleep(0.01)
            try:
                probe_response = await client.get("/event-loop-probe")
                probe_elapsed = time.perf_counter() - started_at
            finally:
                release.set()
            slow_response = await slow_request
            return probe_response, probe_elapsed, slow_response

    probe_response, probe_elapsed, slow_response = asyncio.run(run_scenario())

    assert probe_response.status_code == 200
    assert probe_response.json() == {"responsive": True}
    assert probe_elapsed < 1.0
    assert slow_response.status_code == 200


def test_request_database_dependency_closes_after_sync_endpoint(monkeypatch):
    monkeypatch.setenv("SCRIPT_HUB_SESSION_SECRET", "read-route-session-test-secret")
    lifecycle: list[str] = []

    class _FakeDb:
        closed = False

    db = _FakeDb()

    def override_get_db():
        lifecycle.append("db-open")
        try:
            yield db
        finally:
            db.closed = True
            lifecycle.append("db-close")

    class _LifecycleService:
        def __init__(self, service_db):
            assert service_db is db
            lifecycle.append("service-created")

        def set_permission_context(self, _session):
            lifecycle.append("context-set")
            return self

        def list_candidates(self, **_kwargs):
            assert not db.closed
            lifecycle.append("service-call")
            return {"items": [], "total": 0}

    monkeypatch.setattr(recruitment, "RecruitmentService", _LifecycleService)
    app = FastAPI()
    app.include_router(recruitment.recruitment_router)
    app.dependency_overrides[recruitment.get_db] = override_get_db

    with TestClient(app) as client:
        response = client.get("/recruitment/candidates", headers=_auth_headers())

    assert response.status_code == 200
    assert db.closed is True
    assert lifecycle == [
        "db-open",
        "service-created",
        "context-set",
        "service-call",
        "db-close",
    ]


def test_request_database_dependency_closes_when_sync_endpoint_raises(monkeypatch):
    monkeypatch.setenv("SCRIPT_HUB_SESSION_SECRET", "read-route-error-test-secret")
    lifecycle: list[str] = []

    class _FakeDb:
        closed = False

    db = _FakeDb()

    def override_get_db():
        lifecycle.append("db-open")
        try:
            yield db
        finally:
            db.closed = True
            lifecycle.append("db-close")

    class _FailingService:
        def __init__(self, service_db):
            assert service_db is db
            lifecycle.append("service-created")

        def set_permission_context(self, _session):
            lifecycle.append("context-set")
            return self

        def list_candidates(self, **_kwargs):
            assert not db.closed
            lifecycle.append("service-call")
            raise RuntimeError("database read failed")

    monkeypatch.setattr(recruitment, "RecruitmentService", _FailingService)
    app = FastAPI()
    app.include_router(recruitment.recruitment_router)
    app.dependency_overrides[recruitment.get_db] = override_get_db

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/recruitment/candidates", headers=_auth_headers())

    assert response.status_code == 500
    assert db.closed is True
    assert lifecycle == [
        "db-open",
        "service-created",
        "context-set",
        "service-call",
        "db-close",
    ]
