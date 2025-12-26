import logging
import time
import uuid
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional

from ..models import EnterpriseTaskBase, SettlementRequest
from ..config import settings

# 配置日志
logger = logging.getLogger(__name__)

class EnterpriseSettlementService:
    """企业结算服务类，处理结算相关业务逻辑"""

    def __init__(self, base_url: str = None):
        """初始化服务，可指定基础URL"""
        self.base_url = base_url or settings.base_url
        logger.info(f"使用基础URL: {self.base_url}")
        self.mode = None
        self.workers = 10
        self.interval = 0.0

    def _get_headers(self, token: str, tenant_id: str, tax_id: str) -> dict:
        """构建请求头"""
        return {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",
            "Authorization": f"Bearer {token}",
            "tenant-id": tenant_id,
            "tax-id": tax_id
        }

    def _post(self, url: str, payload: dict, headers: dict) -> dict:
        """发送POST请求"""
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()  # 抛出HTTP错误状态码
            return {"success": True, "data": response.json(), "status_code": response.status_code}
        except Exception as e:
            return {"success": False, "error": str(e), "status_code": getattr(response, 'status_code', None) if 'response' in locals() else None}

    def _launch_batch(self, headers: dict, batch_no: str, name: str) -> dict:
        """发起结算批次"""
        url = f"{self.base_url}/admin-api/client/balance-batch/launchBalanceBatch"
        payload = {"batchNo": batch_no}
        logger.info(f"[{name}] 发起结算批次: {batch_no}")

        result = self._post(url, payload, headers)
        logger.info(f"[{name}] 批次 {batch_no} 处理结果: {result}")
        return {
            "batch_no": batch_no,
            "enterprise": name,
            "result": result
        }

    def _launch_balance(self, headers: dict, batch_no: str, balance_no: str, name: str) -> dict:
        """发起结算单"""
        url = f"{self.base_url}/admin-api/client/balance-batch/launchBalanceBatch"
        payload = {"batchNo": batch_no, "balanceNo": balance_no}
        logger.info(f"[{name}] 发起结算单: 批次={batch_no}, 结算单={balance_no}")

        result = self._post(url, payload, headers)
        logger.info(f"[{name}] 结算单 {balance_no} 处理结果: {result}")
        return {
            "batch_no": batch_no,
            "balance_no": balance_no,
            "enterprise": name,
            "result": result
        }

    def _process_enterprise(self, task: EnterpriseTaskBase) -> Dict[str, Any]:
        """处理单个企业的结算任务"""
        headers = self._get_headers(task.token, task.tenant_id, task.tax_id)
        results = {
            "enterprise": task.name,
            "launch_batch_results": [],  # 发起结算结果
            "relaunch_batch_results": [],  # 重新发起结算结果
            "launch_balance_results": []  # 发起结算单结果
        }

        # 处理发起结算
        if not self.mode or self.mode == 1:
            logger.info(f"▶ [{task.name}] 开始发起结算")
            batch_results = self._process_batches(task.items1, headers, task.name)
            results["launch_batch_results"].extend(batch_results)

        # 处理重新发起结算
        if not self.mode or self.mode == 2:
            logger.info(f"▶ [{task.name}] 开始重新发起结算")
            relaunch_results = self._process_batches(task.items2, headers, task.name)
            results["relaunch_batch_results"].extend(relaunch_results)

        # 处理发起结算单
        if not self.mode or self.mode == 3:
            logger.info(f"▶ [{task.name}] 开始发起结算单")
            balance_results = self._process_balances(task.items3, headers, task.name)
            results["launch_balance_results"].extend(balance_results)

        logger.info(f"✅ [{task.name}] 所有任务完成")
        return results

    def _process_batches(self, batch_list: List[str], headers: dict, name: str) -> List[dict]:
        """处理批次列表"""
        if self.interval > 0:
            return self._run_sequential_batches(batch_list, headers, name)
        else:
            return self._run_concurrent_batches(batch_list, headers, name)

    def _process_balances(self, balance_map: Dict[str, List[str]], headers: dict, name: str) -> List[dict]:
        """处理结算单列表"""
        if self.interval > 0:
            return self._run_sequential_balances(balance_map, headers, name)
        else:
            return self._run_concurrent_balances(balance_map, headers, name)

    def _run_concurrent_batches(self, batch_list: List[str], headers: dict, name: str) -> List[dict]:
        """并发处理批次"""
        results = []
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            futures = [executor.submit(self._launch_batch, headers, b, name) for b in batch_list]
            for f in as_completed(futures):
                results.append(f.result())
        return results

    def _run_sequential_batches(self, batch_list: List[str], headers: dict, name: str) -> List[dict]:
        """顺序处理批次"""
        results = []
        for idx, batch_no in enumerate(batch_list):
            result = self._launch_batch(headers, batch_no, name)
            results.append(result)
            if idx < len(batch_list) - 1 and self.interval > 0:
                time.sleep(self.interval)
        return results

    def _run_concurrent_balances(self, balance_map: Dict[str, List[str]], headers: dict, name: str) -> List[dict]:
        """并发处理结算单"""
        results = []
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            futures = [
                executor.submit(self._launch_balance, headers, batch_no, balance_no, name)
                for batch_no, balance_list in balance_map.items()
                for balance_no in balance_list
            ]
            for f in as_completed(futures):
                results.append(f.result())
        return results

    def _run_sequential_balances(self, balance_map: Dict[str, List[str]], headers: dict, name: str) -> List[dict]:
        """顺序处理结算单"""
        results = []
        all_tasks = [
            (batch_no, balance_no)
            for batch_no, balance_list in balance_map.items()
            for balance_no in balance_list
        ]

        for idx, (batch_no, balance_no) in enumerate(all_tasks):
            result = self._launch_balance(headers, batch_no, balance_no, name)
            results.append(result)
            if idx != len(all_tasks) - 1 and self.interval > 0:
                time.sleep(self.interval)
        return results

    def process_settlement(self, request: SettlementRequest) -> Dict[str, Any]:
        """处理结算请求的主方法"""
        # 保存请求参数
        self.mode = request.mode
        self.workers = request.concurrent_workers
        self.interval = request.interval_seconds

        # 根据请求中的环境设置基础URL
        base_url = settings.get_base_url(request.environment)
        self.base_url = base_url

        request_id = str(uuid.uuid4())
        logger.info(f"开始处理结算请求，请求ID: {request_id}，企业数量: {len(request.enterprises)}")

        try:
            # 处理所有企业任务
            results = []
            with ThreadPoolExecutor(max_workers=len(request.enterprises)) as executor:
                futures = [executor.submit(self._process_enterprise, e) for e in request.enterprises]
                for f in as_completed(futures):
                    results.append(f.result())

            logger.info(f"🎉 所有企业任务完成，请求ID: {request_id}")
            return {
                "success": True,
                "message": "结算处理完成",
                "data": results,
                "request_id": request_id
            }

        except Exception as e:
            logger.error(f"结算处理出错，请求ID: {request_id}，错误: {str(e)}", exc_info=True)
            return {
                "success": False,
                "message": f"结算处理出错: {str(e)}",
                "data": None,
                "request_id": request_id
            }
