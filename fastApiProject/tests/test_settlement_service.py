import pytest
from unittest.mock import MagicMock, patch
from app.services.settlement_service import EnterpriseSettlementService

class TestEnterpriseSettlementService:
    
    @patch('app.services.settlement_service.requests.post')
    def test_launch_batch_success(self, mock_post, settlement_service):
        # 模拟成功的API响应
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"code": 0, "msg": "success", "data": "123"}
        mock_post.return_value = mock_response

        headers = {"Authorization": "Bearer token"}
        result = settlement_service._launch_batch(headers, "B001", "Test Ent")

        assert result["batch_no"] == "B001"
        assert result["result"]["success"] is True
        assert result["result"]["data"]["code"] == 0

    @patch('app.services.settlement_service.requests.post')
    def test_launch_batch_failure(self, mock_post, settlement_service):
        # 模拟失败的API响应
        mock_post.side_effect = Exception("Network Error")

        headers = {"Authorization": "Bearer token"}
        result = settlement_service._launch_batch(headers, "B001", "Test Ent")

        assert result["result"]["success"] is False
        assert "Network Error" in result["result"]["error"]

    @patch('app.services.settlement_service.requests.post')
    def test_process_enterprise_full_flow(self, mock_post, settlement_service, sample_settlement_request):
        # 模拟所有API调用成功
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"code": 0, "msg": "success"}
        mock_post.return_value = mock_response

        # 设置服务参数
        settlement_service.mode = sample_settlement_request.mode
        settlement_service.workers = sample_settlement_request.concurrent_workers
        settlement_service.interval = sample_settlement_request.interval_seconds

        task = sample_settlement_request.enterprises[0]
        results = settlement_service._process_enterprise(task)

        assert results["enterprise"] == "Test Enterprise"
        assert len(results["launch_batch_results"]) == 1
        assert results["launch_batch_results"][0]["batch_no"] == "B001"
