import re

from app.services import mobile_task_service as service_module
from app.services.mobile_task_service import MobileTaskService, TaskAutomation


def test_delivery_payload_preserves_oss_key_when_display_filename_differs():
    payload = {
        "attachments": [
            {
                "fileName": "需求确认问题清单.xlsx",
                "tempPath": "wxfile://tmp_6243396165a6895f5dc743367d285a18.xlsx",
                "fileType": ".xlsx",
                "uploadTime": 1780630634828,
                "fileLength": 13583,
                "isPic": 0,
                "isWx": 1,
                "filePath": "app/2026-06-05/tmp_6243396165a6895f5dc743367d285a18.xlsx",
            }
        ]
    }

    normalized = service_module._normalize_delivery_payload(payload)

    attachment = normalized["attachments"][0]
    assert attachment["fileName"] == "需求确认问题清单.xlsx"
    assert attachment["tempPath"] == "wxfile://tmp_6243396165a6895f5dc743367d285a18.xlsx"
    assert attachment["filePath"] == "app/2026-06-05/tmp_6243396165a6895f5dc743367d285a18.xlsx"


def test_delivery_upload_posts_to_oss_and_returns_submit_file_path(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 204
        text = ""

    def fake_post(url, data=None, files=None, timeout=None):
        captured["url"] = url
        captured["data"] = data
        captured["files"] = files
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setenv("DELIVERY_OSS_HOST_PROD", "https://oss.example.com")
    monkeypatch.setenv("DELIVERY_OSS_ACCESS_KEY_ID", "oss-id")
    monkeypatch.setenv("DELIVERY_OSS_POLICY", "oss-policy")
    monkeypatch.setenv("DELIVERY_OSS_SIGNATURE", "oss-signature")
    monkeypatch.setattr(service_module.requests, "post", fake_post)

    service = MobileTaskService(environment="prod", silent=True)
    result = service.delivery_upload("token-value", b"file-bytes", "需求确认问题清单.xlsx")

    assert result["code"] == 0
    file_path = result["data"]["filePath"]
    assert re.match(r"^app/\d{4}-\d{2}-\d{2}/tmp_[0-9a-f]{32}\.xlsx$", file_path)
    assert result["data"]["tempPath"] == f"wxfile://{file_path.split('/')[-1]}"

    assert captured["url"] == "https://oss.example.com"
    assert captured["data"]["key"] == file_path
    assert captured["data"]["success_action_status"] == "204"
    assert captured["data"]["OSSAccessKeyId"] == "oss-id"
    assert captured["data"]["policy"] == "oss-policy"
    assert captured["data"]["Signature"] == "oss-signature"
    assert captured["files"]["file"][0] == file_path.split("/")[-1]
    assert captured["files"]["file"][1] == b"file-bytes"
    assert captured["timeout"] == 30


def test_delivery_detail_resolves_rejected_task_detail_id(monkeypatch):
    captured = {}

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, sql, params):
            captured["sql"] = sql
            captured["params"] = params

        def fetchone(self):
            return {"id": 235}

    class FakeConnection:
        def cursor(self):
            return FakeCursor()

        def close(self):
            captured["closed"] = True

    class FakeResponse:
        def json(self):
            return {"code": 0, "data": {"id": 235, "taskAssignId": "assign-1"}}

    def fake_connect(**kwargs):
        captured["db_config"] = kwargs
        return FakeConnection()

    def fake_get(_session, url, params=None, timeout=None):
        captured["detail_url"] = url
        captured["detail_params"] = params
        captured["detail_timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(service_module.pymysql, "connect", fake_connect)
    service = MobileTaskService(environment="prod", silent=True)
    monkeypatch.setattr(service_module.requests.Session, "get", fake_get)

    result = service.delivery_detail(
        "token-value",
        task_assign_id="assign-1",
        task_staff_id="staff-1",
        task_id="task-1",
    )

    assert result["code"] == 0
    assert result["data"]["id"] == 235
    assert captured["params"] == ["assign-1", "staff-1", "task-1"]
    assert captured["detail_params"] == {"id": 235}
    assert captured["detail_timeout"] == 10
    assert captured["closed"] is True


def test_delivery_submit_uses_update_endpoint_when_detail_id_exists(monkeypatch):
    captured = {}

    class FakeResponse:
        def json(self):
            return {"code": 0, "data": True}

    def fake_post(_session, url, json=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(service_module.requests.Session, "post", fake_post)

    automator = TaskAutomation("https://api.example.com", environment="prod")
    automator.access_token = "token-value"
    result = automator.submit_delivery(
        {
            "id": 234,
            "taskId": "task-1",
            "taskStaffId": "staff-1",
            "taskAssignId": "assign-1",
            "attachments": [
                {
                    "fileName": "tmp_8db0686b5d00c13193bdf1bad06deab7.jpg",
                    "fileType": ".jpg",
                    "uploadTime": 1780629985466,
                    "fileLength": 238705,
                    "isPic": 1,
                    "isWx": 0,
                    "tempPath": "wxfile://tmp_8db0686b5d00c13193bdf1bad06deab7.jpg",
                    "filePath": "app/2026-06-05/tmp_8db0686b5d00c13193bdf1bad06deab7.jpg",
                }
            ],
        }
    )

    assert result["code"] == 0
    assert captured["url"] == "https://api.example.com/app-api/applet/delivery/update"
    assert captured["json"]["id"] == 234
    assert captured["json"]["attachments"][0]["filePath"] == "app/2026-06-05/tmp_8db0686b5d00c13193bdf1bad06deab7.jpg"
    assert captured["timeout"] == 10


def test_worker_index_uses_live_cert_endpoint(monkeypatch):
    captured = {}

    class FakeResponse:
        def json(self):
            return {"code": 0, "data": {"liveCertStatus": 0}}

    def fake_get(_session, url, timeout=None):
        captured["url"] = url
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(service_module.requests.Session, "get", fake_get)

    service = MobileTaskService(environment="prod", silent=True)
    result = service.delivery_worker_index("token-value")

    assert result["code"] == 0
    assert result["data"]["liveCertStatus"] == 0
    assert captured["url"] == "https://smp-api.seedlingintl.com/app-api/applet/worker/index"
    assert captured["timeout"] == 10
