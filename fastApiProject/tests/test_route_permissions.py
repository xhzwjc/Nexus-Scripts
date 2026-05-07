from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import business_core, mobile_sms, monitoring, tax_tools, workbench
from app.script_hub_session import create_script_hub_session


def _build_client(router) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _auth_headers(**permissions: bool) -> dict[str, str]:
    token = create_script_hub_session(
        {
            "id": "test-user",
            "role": "tester",
            "roles": ["tester"],
            "name": "Route Guard Tester",
            "permissions": permissions,
            "teamResourcesLoginKeyEnabled": False,
        }
    )["token"]
    return {"Authorization": f"Bearer {token}"}


class _FakeBalanceService:
    def verify_balances_with_timeout(self, tenant_id=None, timeout=15):
        return [
            {
                "tax_location_id": 1,
                "tenant_id": tenant_id or 1,
                "tax_address": "Test Tax Address",
                "enterprise_name": "Test Enterprise",
                "is_correct": True,
                "total_deductions": 0.0,
                "total_recharges": 0.0,
                "total_refunds": 0.0,
                "expected_balance": 100.0,
                "actual_balance": 100.0,
                "balance_diff": 0.0,
            }
        ]


class _FakeSMSService:
    def get_templates(self):
        return {
            "success": True,
            "message": "ok",
            "data": [{"code": "TPL001", "name": "Test Template"}],
        }


class _FakeAiService:
    def generate_response_stream(self, **kwargs):
        yield "data: hello\n\n"


def _build_business_core_client() -> TestClient:
    app = FastAPI()
    app.include_router(business_core.business_core_router)
    app.dependency_overrides[business_core.get_balance_service] = lambda request=None: _FakeBalanceService()
    return TestClient(app)


def test_business_core_requires_login_for_balance_route():
    client = _build_business_core_client()
    response = client.post("/balance/verify", json={"tenant_id": 1, "environment": "test", "timeout": 15})
    assert response.status_code == 401


def test_business_core_rejects_wrong_permission_for_balance_route():
    client = _build_business_core_client()
    response = client.post(
        "/balance/verify",
        headers=_auth_headers(commission=True),
        json={"tenant_id": 1, "environment": "test", "timeout": 15},
    )
    assert response.status_code == 403


def test_business_core_allows_balance_route_with_matching_permission():
    client = _build_business_core_client()

    response = client.post(
        "/balance/verify",
        headers=_auth_headers(balance=True),
        json={"tenant_id": 1, "environment": "test", "timeout": 15},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True


def test_tax_tools_any_permission_route_accepts_balance_permission(monkeypatch):
    monkeypatch.setattr(tax_tools, "get_db_config", lambda environment=None: {})
    monkeypatch.setattr(
        tax_tools,
        "get_enterprise_list",
        lambda db_config: [
            {
                "id": 1,
                "enterprise_name": "Test Enterprise",
                "channel_id": None,
                "tenant_id": None,
                "status": 1,
                "create_time": datetime(2026, 1, 1, 12, 0, 0),
                "contact_person": None,
                "contact_phone": None,
            }
        ],
    )

    client = _build_client(tax_tools.tax_tools_router)
    response = client.get("/enterprises/list?environment=test", headers=_auth_headers(balance=True))

    assert response.status_code == 200
    assert response.json()["total"] == 1


def test_tax_tools_any_permission_route_rejects_unrelated_permission():
    client = _build_client(tax_tools.tax_tools_router)
    response = client.get("/enterprises/list?environment=test", headers=_auth_headers(agent_chat=True))
    assert response.status_code == 403


def test_monitoring_route_requires_server_monitoring_permission(monkeypatch):
    monkeypatch.setattr(monitoring, "load_servers", lambda: [])
    client = _build_client(monitoring.monitoring_router)

    forbidden = client.get("/api/monitoring/servers", headers=_auth_headers(balance=True))
    allowed = client.get("/api/monitoring/servers", headers=_auth_headers(**{"server-monitoring": True}))

    assert forbidden.status_code == 403
    assert allowed.status_code == 200
    assert allowed.json()["total"] == 0


def test_sms_templates_route_requires_sms_operations_center_permission():
    app = FastAPI()
    app.include_router(mobile_sms.mobile_sms_router)
    app.dependency_overrides[mobile_sms.get_sms_service] = lambda request=None: _FakeSMSService()
    client = TestClient(app)

    forbidden = client.post("/sms/templates", headers=_auth_headers(balance=True), json={"environment": "test"})
    allowed = client.post(
        "/sms/templates",
        headers=_auth_headers(sms_operations_center=True),
        json={"environment": "test"},
    )

    assert forbidden.status_code == 403
    assert allowed.status_code == 200
    assert allowed.json()["success"] is True


def test_workbench_ai_chat_route_requires_agent_chat_permission():
    app = FastAPI()
    app.include_router(workbench.workbench_router)
    app.dependency_overrides[workbench.get_ai_service] = lambda: _FakeAiService()
    client = TestClient(app)

    payload = {"message": "hello", "history": [], "context": None, "image": None}
    forbidden = client.post("/ai/chat", headers=_auth_headers(balance=True), json=payload)
    allowed = client.post("/ai/chat", headers=_auth_headers(**{"agent-chat": True}), json=payload)

    assert forbidden.status_code == 403
    assert allowed.status_code == 200
    assert "hello" in allowed.text
