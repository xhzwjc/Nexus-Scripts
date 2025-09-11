import json
import os
import random
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from urllib.parse import quote_plus

import pymysql
import requests
import logging
import time
import uuid
import pandas as pd
import sqlalchemy
from pymysql.cursors import DictCursor
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, InvalidRequestError
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, List, Dict, Optional, Any, Tuple
import base64
from .models import EnterpriseTaskBase, SettlementRequest, MobileTaskInfo, MobileTaskRequest
from .config import settings
from .utils import get_channel_tax_rates, get_tax_region_data, get_enterprise_recharge_data, process_tax_regions, \
    login_and_get_token, get_commission_data_from_api, Environment, DatabaseManager

# 配置日志
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


class EnterpriseSettlementService:
    """企业结算服务类，处理结算相关业务逻辑"""

    def __init__(self, base_url: str = None):
        """初始化服务，可指定基础URL"""
        self.base_url = base_url or settings.base_url
        logger.info(f"使用基础URL: {self.base_url}")

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
            return {"success": False, "error": str(e), "status_code": getattr(response, 'status_code', None)}

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
        base_url = settings.base_url
        if request.environment:
            if request.environment == "prod":
                base_url = settings.BASE_URL_PROD
            elif request.environment == "local":
                base_url = settings.BASE_URL_LOCAL
            else:
                base_url = settings.BASE_URL_TEST
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


# 账户余额核对服务（原脚本核心逻辑在此处）
class AccountBalanceService:
    def __init__(self, environment: str = None):
        self.environment = environment or settings.ENVIRONMENT

        # 2. 临时保存原始环境配置
        original_env = settings.ENVIRONMENT

        try:
            # 3. 根据传入的环境更新配置（关键修复）
            if self.environment:
                settings.ENVIRONMENT = self.environment

            # 4. 获取对应环境的数据库配置
            self.db_config = settings.get_db_config()
            self.engine = self._init_db_connection()

        finally:
            # 5. 无论是否成功，恢复原始环境配置（避免影响全局）
            settings.ENVIRONMENT = original_env

    def _init_db_connection(self):
        """初始化数据库连接（原脚本连接逻辑）"""
        # try:
        db_uri = (
            f"mysql+pymysql://{self.db_config['user']}:{quote_plus(self.db_config['password'])}@"
            f"{self.db_config['host']}:{self.db_config['port']}/{self.db_config['database']}"
            "?charset=utf8mb4&connect_timeout=10"
        )

        engine = sqlalchemy.create_engine(
            db_uri,
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=3600,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 5, "read_timeout": 15}
        )
        # 测试连接
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info(f"数据库连接成功 (环境: {self.environment})")
        return engine
        # except Exception as e:
        #     logger.error(f"数据库连接失败: {str(e)}")
        #     raise ConnectionError(f"数据库连接失败: {str(e)}")

    def _build_query(self, tenant_id: int) -> str:
        """构建查询SQL（原脚本SQL逻辑）"""
        return f"""
        WITH deduction_amounts AS (
            SELECT 
                tax_id as tax_location_id,
                SUM(ROUND(pay_amount, 2)) AS total_deductions
            FROM biz_balance_worker 
            WHERE tenant_id = {tenant_id} 
                AND ((pay_status IN (2, 3)) or (pay_status = 0 and confirm_pay_status = 1))
            GROUP BY tax_id
        ),
        recharge_amounts AS (
            SELECT 
                tax_id as tax_location_id,
                SUM(ROUND(trade_amount, 2)) AS total_recharges
            FROM biz_capital_detail 
            WHERE tenant_id = {tenant_id} AND trade_type = 1 AND deleted = 0
            GROUP BY tax_id
        )
        SELECT 
            e.tax_id as tax_location_id,
            e.enterprise_name,
            e.tax_address,
            COALESCE(d.total_deductions, 0) AS total_deductions,
            COALESCE(r.total_recharges, 0) AS total_recharges,
            ROUND(e.account_balance, 2) AS actual_balance
        FROM biz_enterprise_tax e
        LEFT JOIN deduction_amounts d ON e.tax_id = d.tax_location_id
        LEFT JOIN recharge_amounts r ON e.tax_id = r.tax_location_id
        WHERE e.tenant_id = {tenant_id} AND e.deleted = 0
        """

    def verify_balances(self, tenant_id: int) -> List[dict]:
        """验证余额（原脚本核心计算逻辑）"""

        def run_query():
            query = self._build_query(tenant_id)
            return pd.read_sql(query, self.engine)

        try:
            df = run_query()
        except (OperationalError, InvalidRequestError) as e:
            logger.warning(f"连接异常，尝试重新连接: {str(e)}")
            self.engine.dispose()
            self.engine = self._init_db_connection()
            df = run_query()

        if df.empty:
            logger.info(f"未找到企业ID {tenant_id} 的数据")
            return []

        results = []
        for _, row in df.iterrows():
            expected = round(row['total_recharges'] - row['total_deductions'], 2)
            actual = round(row['actual_balance'], 2)
            results.append({
                "tax_location_id": row['tax_location_id'],
                "tax_address": row['tax_address'],
                "enterprise_name": row['enterprise_name'],
                "is_correct": round(actual - expected, 2) == 0,
                "total_deductions": round(row['total_deductions'], 2),
                "total_recharges": round(row['total_recharges'], 2),
                "expected_balance": expected,
                "actual_balance": actual,
                "balance_diff": round(actual - expected, 2)
            })
        return results

    def verify_balances_with_timeout(self, tenant_id: int, timeout: int = 15) -> List[dict]:
        """带超时的验证（原脚本超时逻辑）"""
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(self.verify_balances, tenant_id)
            try:
                return future.result(timeout=timeout)
            except Exception as e:
                logger.error(f"企业ID {tenant_id} 核对超时: {str(e)}")
                raise TimeoutError(f"查询超时，企业ID {tenant_id}")


class CommissionCalculationService:
    """佣金计算服务类，处理佣金计算相关业务逻辑"""

    def __init__(self, environment: str = None):
        self.environment = environment or settings.ENVIRONMENT
        self.logger = logging.getLogger(__name__)
        self.logger.info(f"初始化佣金计算服务，环境: {self.environment}")

        # 保存原始环境配置
        self.original_env = settings.ENVIRONMENT

        try:
            # 根据传入的环境更新配置
            if self.environment:
                settings.ENVIRONMENT = self.environment

            # 获取数据库配置
            self.db_config = settings.get_db_config()

        finally:
            # 恢复原始环境配置
            settings.ENVIRONMENT = self.original_env

    def _get_db_env(self) -> Environment:
        """转换环境标识"""
        if self.environment == "prod":
            return Environment.PROD
        return Environment.TEST

    def _compare_commission(self, script_results: List[Dict[str, Any]], api_data: Dict[str, Any]) -> List[
        Dict[str, Any]]:
        """
        对比脚本计算的佣金与API返回的佣金
        :param script_results: 脚本计算结果
        :param api_data: API返回的数据
        :return: 融合了对比结果的数据列表
        """
        # 构建API数据的索引映射（使用结算单号作为唯一标识）
        api_commission_map = {}
        if api_data.get('code') == 0 and 'data' in api_data and 'list' in api_data['data']:
            for item in api_data['data']['list']:
                balance_no = item.get('balanceNo')
                if balance_no:
                    api_commission_map[balance_no] = {
                        'commission': Decimal(str(item.get('commission', 0))),
                        'batch_no': item.get('batchNo')
                    }

        # 对比每条数据
        compared_results = []
        # 允许的误差范围（0.01元）
        tolerance = Decimal('0.00')

        for item in script_results:
            balance_no = item['balance_no']
            api_commission_info = api_commission_map.get(balance_no, {})

            # 脚本计算的佣金
            script_commission = Decimal(str(item['channel_profit']))
            # API返回的佣金
            api_commission = api_commission_info.get('commission', Decimal('0'))

            # 计算差值
            difference = script_commission - api_commission
            # 判断是否匹配（在误差范围内）
            is_matched = abs(difference) <= tolerance

            # 融合数据，添加对比字段
            compared_item = {
                **item,
                "api_commission": float(api_commission),  # API返回的佣金
                "is_matched": is_matched,  # 是否匹配
                "difference": float(difference),  # 差值
                "tolerance": float(tolerance)  # 允许误差范围
            }

            compared_results.append(compared_item)

        return compared_results

    def _calculate_summary_metrics(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """计算汇总指标：渠道总利润、本月佣金等"""
        today = datetime.now().date()
        current_month = today.month
        current_year = today.year

        # 初始化统计值
        total_profit = Decimal('0.00')
        monthly_profit = Decimal('0.00')
        daily_profit = Decimal('0.00')
        total_pay_amount = Decimal('0.00')
        daily_pay_amount = Decimal('0.00')
        total_count = 0
        mismatch_count = 0  # 不匹配的记录数

        for item in results:
            # 转换为Decimal进行精确计算
            profit = Decimal(str(item['channel_profit']))
            pay_amount = Decimal(str(item['pay_amount']))

            # 总利润和总发放金额
            total_profit += profit
            total_pay_amount += pay_amount
            total_count += 1

            # 统计不匹配的记录
            if 'is_matched' in item and not item['is_matched']:
                mismatch_count += 1

            # 解析交易时间
            payment_time = datetime.strptime(item['payment_over_time'], "%Y-%m-%d %H:%M:%S")

            # 本月数据
            if payment_time.month == current_month and payment_time.year == current_year:
                monthly_profit += profit

            # 今日数据
            if payment_time.date() == today:
                daily_profit += profit
                daily_pay_amount += pay_amount

        return {
            "total_profit": float(total_profit.quantize(Decimal('0.00'))),
            "monthly_profit": float(monthly_profit.quantize(Decimal('0.00'))),
            "daily_profit": float(daily_profit.quantize(Decimal('0.00'))),
            "is_profitable": total_profit >= 0,
            "total_pay_amount": float(total_pay_amount.quantize(Decimal('0.00'))),
            "daily_pay_amount": float(daily_pay_amount.quantize(Decimal('0.00'))),
            "total_count": total_count,
            "mismatch_count": mismatch_count,  # 新增：不匹配的记录数
            "match_rate": round((total_count - mismatch_count) / total_count * 100, 2) if total_count > 0 else 100
        }

    def _generate_enterprise_dimension_data(self, results: List[Dict[str, Any]], recharge_data: Dict[str, Any]) -> List[
        Dict[str, Any]]:
        """生成企业维度数据：按月份拆分，有充值或交易则展示该月记录"""
        # 1. 按企业+月份聚合交易数据（发放/佣金等）
        enterprise_monthly_trans = defaultdict(lambda: defaultdict(lambda: {
            'pay_amount': Decimal('0.00'),  # 当月发放金额
            'profit': Decimal('0.00'),  # 当月佣金收益
            'count': 0  # 当月交易笔数
        }))

        for item in results:
            enterprise_id = item['enterprise_id']
            month = item['month_str']  # 交易发生的月份（如"2025-07"）

            # 累加当月交易数据
            trans_data = enterprise_monthly_trans[enterprise_id][month]
            trans_data['pay_amount'] += Decimal(str(item['pay_amount']))
            trans_data['profit'] += Decimal(str(item['channel_profit']))
            trans_data['count'] += 1

        # 2. 整理企业充值数据（按企业+月份）
        enterprise_recharge = defaultdict(lambda: defaultdict(Decimal))  # {企业ID: {月份: 充值金额}}
        for (ent_id, month), rdata in recharge_data.get('recharge_data', {}).items():
            enterprise_recharge[ent_id][month] += rdata['amount']

        # 3. 提取所有企业信息
        enterprise_info = recharge_data.get('enterprise_info', {})

        # 4. 按「企业+月份」生成最终数据（核心逻辑）
        all_enterprise_data = []
        for enterprise_id in enterprise_info.keys():
            enterprise_name = enterprise_info[enterprise_id]

            # 收集该企业的所有相关月份（交易月份+充值月份）
            trans_months = set(enterprise_monthly_trans[enterprise_id].keys())  # 有交易的月份
            recharge_months = set(enterprise_recharge[enterprise_id].keys())  # 有充值的月份
            all_months = trans_months.union(recharge_months)  # 合并所有可能有数据的月份

            # 计算企业累计总数据（跨月份）
            total_pay = Decimal('0.00')
            total_profit = Decimal('0.00')
            total_count = 0
            total_recharge = Decimal('0.00')

            # 先累加所有月份的交易和充值总数据
            for month in trans_months:
                trans = enterprise_monthly_trans[enterprise_id][month]
                total_pay += trans['pay_amount']
                total_profit += trans['profit']
                total_count += trans['count']
            for month in recharge_months:
                total_recharge += enterprise_recharge[enterprise_id][month]

            # 按月份生成单独记录
            for month in sorted(all_months):  # 按月份排序展示
                # 当月交易数据
                month_trans = enterprise_monthly_trans[enterprise_id].get(month, {
                    'pay_amount': Decimal('0.00'),
                    'profit': Decimal('0.00'),
                    'count': 0
                })
                # 当月充值数据
                month_recharge = enterprise_recharge[enterprise_id].get(month, Decimal('0.00'))

                # 过滤：既无交易也无充值的月份不展示
                if month_trans['pay_amount'] == 0 and month_trans['profit'] == 0 and month_trans[
                    'count'] == 0 and month_recharge == 0:
                    continue

                # 添加当月记录
                all_enterprise_data.append({
                    'enterprise_name': enterprise_name,
                    'enterprise_id': enterprise_id,
                    # 企业累计数据（跨所有月份）
                    'total_pay_amount': float(total_pay.quantize(Decimal('0.00'))),
                    'total_profit': float(total_profit.quantize(Decimal('0.00'))),
                    'total_count': total_count,
                    'total_recharge_amount': float(total_recharge.quantize(Decimal('0.00'))),  # 累计总充值
                    # 当月数据（单独展示）
                    'month': month,
                    'month_pay_amount': float(month_trans['pay_amount'].quantize(Decimal('0.00'))),  # 当月发放
                    'month_profit': float(month_trans['profit'].quantize(Decimal('0.00'))),  # 当月佣金
                    'month_count': month_trans['count'],  # 当月交易笔数
                    'month_recharge_amount': float(month_recharge.quantize(Decimal('0.00')))  # 当月充值
                })

        return all_enterprise_data

    def _calculate_monthly_accumulation(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """计算本月累计金额"""
        monthly_accumulation = Decimal('0.00')
        processed_results = []

        for index, item in enumerate(results):
            # 第一条数据本月累计为0，从第二条开始累加
            current_accumulation = float(monthly_accumulation) if index > 0 else 0

            # 添加本月累计字段
            processed_item = {
                **item,
                "monthly_accumulation": current_accumulation
            }

            processed_results.append(processed_item)

            # 累加当前记录的实际支付金额
            monthly_accumulation += Decimal(str(item['actual_amount']))

        return processed_results

    def calculate_commission(self, channel_id: int, timeout: int) -> Dict[str, Any]:
        """计算佣金主方法，返回全部数据由前端处理分页"""
        try:
            env = self._get_db_env()
            self.logger.info(f"开始计算渠道 {channel_id} 的佣金，环境: {env}")

            # 获取税地费率配置
            tax_rate_config = get_channel_tax_rates(self.db_config, channel_id)
            if not tax_rate_config:
                raise ValueError(f"渠道 {channel_id} 不存在！")

            # 获取结算数据
            raw_data = get_tax_region_data(self.db_config, channel_id)
            self.logger.info(f"获取到 {len(raw_data)} 条结算数据")

            # 获取充值数据
            recharge_data = get_enterprise_recharge_data(self.db_config, channel_id)

            if not raw_data and not recharge_data:
                raise ValueError(f"渠道 {channel_id} 没有结算数据并且没有充值记录")

            # 处理计算
            results = process_tax_regions(raw_data, tax_rate_config)

            # 获取API数据进行验证
            api_data = {}
            try:
                auth_token = login_and_get_token(channel_id, env=env)
                api_data = get_commission_data_from_api(auth_token, env=env)
            except Exception as e:
                self.logger.warning(f"获取API数据失败，将跳过验证: {str(e)}")
                api_data = {"code": -1, "msg": "API验证失败"}

            # 对比脚本计算结果与API数据
            compared_results = self._compare_commission(results, api_data)

            # 计算本月累计金额
            compared_results = self._calculate_monthly_accumulation(compared_results)

            # 计算汇总指标（复用该结果，避免重复计算）
            summary_metrics = self._calculate_summary_metrics(compared_results)

            # 生成企业维度数据（保留详细数据）
            enterprise_data = self._generate_enterprise_dimension_data(compared_results, recharge_data)

            total_items = len(compared_results)
            self.logger.info(f"数据处理完成，共 {total_items} 条记录，返回全部数据由前端处理分页")

            # 组织返回结果（返回所有数据，不做分页处理）
            return {
                "commission_details": compared_results,  # 返回全部数据
                "summary_metrics": summary_metrics,  # 包含所有汇总指标
                "enterprise_data": enterprise_data,  # 企业维度详细数据
                "total_items": total_items,  # 总记录数，供前端分页使用
                "api_verification": api_data.get('code') == 0,
                "summary": {
                    "total_profit": summary_metrics["total_profit"],
                    "total_pay_amount": summary_metrics["total_pay_amount"],
                    "transaction_count": total_items,
                    "mismatch_count": summary_metrics["mismatch_count"],
                    "match_rate": summary_metrics["match_rate"]
                }
            }

        except Exception as e:
            self.logger.error(f"佣金计算出错: {str(e)}", exc_info=True)
            raise

    def _generate_enterprise_summary(self, results: List[Dict[str, Any]], recharge_data: Dict[str, Any]) -> List[
        Dict[str, Any]]:
        """生成企业汇总信息"""
        enterprise_data = defaultdict(lambda: {
            'total_pay_amount': Decimal('0.00'),
            'total_profit': Decimal('0.00'),
            'total_count': 0
        })

        for item in results:
            enterprise_id = item['enterprise_id']
            enterprise_data[enterprise_id]['total_pay_amount'] += Decimal(str(item['pay_amount']))
            enterprise_data[enterprise_id]['total_profit'] += Decimal(str(item['channel_profit']))
            enterprise_data[enterprise_id]['total_count'] += 1

        # 转换为返回格式
        summary = []
        enterprise_info = recharge_data.get('enterprise_info', {})
        for enterprise_id, data in enterprise_data.items():
            summary.append({
                'enterprise_id': enterprise_id,
                'enterprise_name': enterprise_info.get(enterprise_id, '未知企业'),
                'total_pay_amount': float(data['total_pay_amount'].quantize(Decimal('0.00'))),
                'total_profit': float(data['total_profit'].quantize(Decimal('0.00'))),
                'total_count': data['total_count']
            })

        return summary


# 在文件末尾添加
class MobileTaskService:
    """手机号任务服务类，处理手机号相关自动化任务"""

    def __init__(self, environment: str = None):
        self.environment = environment or settings.ENVIRONMENT
        self.base_url = self._get_base_url()
        logger.info(f"初始化手机号任务服务，环境: {self.environment}，基础URL: {self.base_url}")

    def _get_base_url(self) -> str:
        """根据环境获取基础URL"""
        if self.environment == "prod":
            return "https://smp-api.seedlingintl.com"
        elif self.environment == "local":
            return "http://localhost:8080"  # 假设本地环境URL
        return "http://fwos-api-test.seedlingintl.com"  # 测试环境

    def _parse_mobile_list(self, file_content: Optional[str], range_str: Optional[str], manual_mobiles: List[str]) -> \
            List[str]:
        """解析手机号列表，支持文件上传和手动输入"""
        mobiles = []

        # 处理文件内容
        if file_content:
            try:
                # 修复1：处理可能的Base64填充问题
                file_content = file_content.strip()
                padding_needed = len(file_content) % 4
                if padding_needed:
                    file_content += '=' * (4 - padding_needed)

                decoded = base64.b64decode(file_content).decode('utf-8')
                # 修复2：统一处理换行符，确保正确分割
                file_mobiles = [line.strip() for line in decoded.replace('\r\n', '\n').split('\n') if line.strip()]
                mobiles.extend(file_mobiles)
            except Exception as e:
                logger.error(f"解析文件内容失败: {str(e)}")
                raise ValueError(f"文件解析错误: {str(e)}")

        # 处理手动输入
        mobiles.extend(manual_mobiles)

        # 去重
        mobiles = list(sorted(set(mobiles), key=mobiles.index))  # 保持原始顺序去重

        # 处理范围
        if range_str and mobiles:
            try:
                start_str, end_str = range_str.split('-')
                start = int(start_str) - 1  # 转换为0基索引
                end = int(end_str)  # 保持结束索引为闭区间

                # 边界检查
                if start < 0:
                    start = 0
                if end > len(mobiles):
                    end = len(mobiles)
                if start >= end:
                    raise ValueError("开始索引必须小于结束索引")

                mobiles = mobiles[start:end]  # 切片是左闭右开，所以end不需要减1
            except Exception as e:
                logger.error(f"解析范围参数失败: {str(e)}")
                raise ValueError(f"范围解析错误: {str(e)}")

        if not mobiles:
            raise ValueError("未提供有效的手机号")

        return mobiles

    def parse_mobile_numbers(self, file_content: str, range_str: Optional[str] = None) -> List[str]:
        """
        单独解析手机号，仅需要文件内容和范围参数
        """
        mobiles = []

        try:
            # 解码base64文件内容
            file_data = base64.b64decode(file_content)
            content = file_data.decode('utf-8', errors='ignore')

            # 按行提取手机号
            for line in content.splitlines():
                line = line.strip()
                # 简单的手机号格式验证（11位数字）
                if line and line.isdigit() and len(line) == 11:
                    mobiles.append(line)

            # 处理范围筛选
            if range_str:
                try:
                    start, end = map(int, range_str.split('-'))
                    start = max(0, start - 1)  # 转换为0基索引
                    end = min(len(mobiles), end)
                    mobiles = mobiles[start:end]
                except ValueError:
                    logger.warning(f"无效的范围格式: {range_str}，将使用全部号码")

        except Exception as e:
            logger.error(f"文件解析错误: {str(e)}")
            # 解析错误时返回空列表，不抛出异常
        # 去重处理
        mobiles = list(set(mobiles))
        logger.info(f"成功解析{len(mobiles)}个有效手机号")
        return mobiles

    def process_mobile_tasks(self, request: MobileTaskRequest) -> Dict[str, Any]:
        """处理手机号任务主方法"""
        request_id = str(uuid.uuid4())
        logger.info(f"开始处理手机号任务，请求ID: {request_id}，模式: {request.mode}")

        try:
            # 解析手机号列表
            mobile_list = self._parse_mobile_list(
                file_content=request.file_content,
                range_str=request.range,
                manual_mobiles=request.mobiles
            )
            logger.info(f"解析完成，共获取 {len(mobile_list)} 个手机号")

            # 执行任务
            automator = TaskAutomation(self.base_url)
            results = automator.batch_process(
                mobile_list=mobile_list,
                task_info=request.task_info,
                interval=request.interval_seconds,
                mode=request.mode,
                concurrent=request.concurrent_workers > 1,
                workers=request.concurrent_workers
            )

            # 统计结果
            success_count = sum(1 for r in results if r["success"])
            failure_count = len(results) - success_count

            return {
                "success": True,
                "message": f"处理完成，共{len(results)}个手机号",
                "data": results,
                "request_id": request_id,
                "total": len(results),
                "success_count": success_count,
                "failure_count": failure_count
            }

        except Exception as e:
            logger.error(f"手机号任务处理出错，请求ID: {request_id}，错误: {str(e)}", exc_info=True)
            return {
                "success": False,
                "message": f"处理失败: {str(e)}",
                "data": [],
                "request_id": request_id,
                "total": 0,
                "success_count": 0,
                "failure_count": 0
            }


# 从脚本转换的任务自动化类
class TaskAutomation:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.access_token: Optional[str] = None

        self.session.headers.update({
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        })

    def sms_login(self, mobile: str, code: str = "987654") -> Dict:
        """短信登录，成功后设置 Authorization"""
        url = f"{self.base_url}/app-api/app/auth/sms-login"
        try:
            resp = self.session.post(url, json={"mobile": mobile, "code": code}, timeout=10)
            data = resp.json()

            if data.get("code") != 0:
                raise ValueError(f"登录失败: {data.get('msg', '未知错误')}")

            self.access_token = data["data"].get("accessToken")
            if not self.access_token:
                raise ValueError("未获取到 accessToken")

            self.session.headers.update({"Authorization": f"Bearer {self.access_token}"})
            return data
        except Exception as e:
            return {"error": str(e)}

    def sign_task(self, task_id: str) -> Dict:
        """报名任务"""
        return self._post("/app-api/applet/task/sign", {"taskId": task_id})

    def get_my_tasks(self, task_id: str) -> Dict:
        """查询我的任务列表，返回taskStaffId和taskAssignId"""
        res = self._post("/app-api/applet/task/myTaskPage", {
            "pageNo": 1, "pageSize": 10, "statusType": 0
        })

        if res.get("error") or res.get("code") != 0:
            return {"error": f"获取任务失败: {res.get('msg', '未知错误')}"}

        for task in res.get("data", {}).get("list", []):
            if task.get("taskId") == task_id:
                return {
                    "taskStaffId": task.get("taskStaffId"),
                    "taskAssignId": task.get("taskAssignId")
                }

        return {"error": f"未找到任务ID: {task_id}"}

    def submit_delivery(self, payload: Dict) -> Dict:
        """提交交付物"""
        return self._post("/app-api/applet/delivery/save", payload)

    def get_balance_id(self) -> Dict:
        """获取待确认的结算单ID"""
        return self._post("/app-api/applet/balance/getConfirmedList", {
            "pageNo": 1, "pageSize": 20
        })

    def confirm_balance(self, balance_no: str) -> Dict:
        """确认结算单"""
        url = f"{self.base_url}/app-api/applet/balance/confirm?balanceNo={balance_no}"
        try:
            resp = self.session.post(url)
            return resp.json()
        except Exception as e:
            return {"error": str(e)}

    def process_single_user(self, mobile: str, task_info: MobileTaskInfo, mode: Optional[int] = None) -> Dict:
        """处理单个手机号任务流程"""
        result = self._init_result(mobile)

        try:
            # 登录
            result["steps"]["login"] = login_res = self.sms_login(mobile)
            if login_res.get("error"):
                raise Exception(login_res["error"])

            if mode is None:
                # 完整流程
                result["steps"]["sign"] = sign_res = self.sign_task(task_info.task_id)
                if sign_res.get("code") == 500:
                    raise Exception(f"报名失败：任务ID不存在！")
                if sign_res.get("code") != 0:
                    raise Exception(f"报名失败: {json.dumps(sign_res, ensure_ascii=False)}")

                result["steps"]["get_task_ids"] = task_ids = self.get_my_tasks(task_info.task_id)
                if task_ids.get("error"):
                    raise Exception(task_ids["error"])

                delivery_payload = {
                    "taskId": task_info.task_id,
                    "taskStaffId": task_ids["taskStaffId"],
                    "taskAssignId": task_ids["taskAssignId"],
                    "taskContent": task_info.task_content,
                    "reportName": task_info.report_name,
                    "reportAddress": task_info.report_address,
                    "supplement": task_info.supplement,
                    "attachments": task_info.attachments or []
                }
                result["steps"]["delivery"] = delivery_res = self.submit_delivery(delivery_payload)
                if delivery_res.get("code") != 0:
                    raise Exception(f"交付物提交失败: {json.dumps(delivery_res, ensure_ascii=False)}")

                result["success"] = True
                return result

            if mode == 1:
                # 登录+报名
                result["steps"]["sign"] = sign_res = self.sign_task(task_info.task_id)
                if sign_res.get("code") == 500:
                    raise Exception(f"报名失败：任务ID不存在！")
                if sign_res.get("code") != 0:
                    raise Exception(f"报名失败: {json.dumps(sign_res, ensure_ascii=False)}")
                result["success"] = True
                return result

            if mode == 2:
                # 登录+提交交付物
                result["steps"]["get_task_ids"] = task_ids = self.get_my_tasks(task_info.task_id)
                if task_ids.get("error"):
                    raise Exception(task_ids["error"])

                delivery_payload = {
                    "taskId": task_info.task_id,
                    "taskStaffId": task_ids["taskStaffId"],
                    "taskAssignId": task_ids["taskAssignId"],
                    "taskContent": task_info.task_content,
                    "reportName": task_info.report_name,
                    "reportAddress": task_info.report_address,
                    "supplement": task_info.supplement,
                    "attachments": task_info.attachments or []
                }
                result["steps"]["delivery"] = delivery_res = self.submit_delivery(delivery_payload)
                if delivery_res.get("code") != 0:
                    raise Exception(f"交付物提交失败: {json.dumps(delivery_res, ensure_ascii=False)}")

                result["success"] = True
                return result

            if mode == 3:
                # 登录+确认结算
                result["steps"]["get_balance_id"] = balance_res = self.get_balance_id()
                if balance_res.get("error") or balance_res.get("code") != 0:
                    raise Exception(f"获取结算单失败: {json.dumps(balance_res, ensure_ascii=False)}")

                balance_list = balance_res.get("data", {}).get("list", [])
                if not balance_list:
                    raise Exception("无可确认的结算单")

                matched_balance_no = None
                for item in balance_list:
                    if item.get("taskId") == task_info.task_id:
                        matched_balance_no = item.get("balanceNo")
                        break

                if not matched_balance_no:
                    raise Exception(f"未找到匹配的结算单，taskId={task_info.task_id}")

                result["steps"]["confirm_balance"] = confirm_res = self.confirm_balance(matched_balance_no)
                if confirm_res.get("error") or confirm_res.get("code") != 0:
                    raise Exception(f"确认结算失败: {json.dumps(confirm_res, ensure_ascii=False)}")

                result["success"] = True
                return result

            raise Exception(f"不支持的mode参数: {mode}")

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"[{mobile}] 处理失败: {e}")

        finally:
            self._reset_session()

        return result

    def batch_process(self, mobile_list: List[str], task_info: MobileTaskInfo, interval: float = 0.5,
                      mode: Optional[int] = None, concurrent: bool = False, workers: int = 5) -> List[Dict]:
        results = []

        if not concurrent:
            # 顺序执行
            for idx, mobile in enumerate(mobile_list, 1):
                logger.info(f"[顺序] 处理 {idx}/{len(mobile_list)}: {mobile}")
                result = self.process_single_user(mobile, task_info, mode)
                results.append(result)
                time.sleep(interval)
        else:
            # 并发执行
            logger.info(f"[并发] 开始并发处理，线程数: {workers}")
            with ThreadPoolExecutor(max_workers=workers) as executor:
                future_to_mobile = {
                    executor.submit(self._thread_process_wrapper, mobile, task_info, mode): mobile
                    for mobile in mobile_list
                }

                for idx, future in enumerate(as_completed(future_to_mobile), 1):
                    mobile = future_to_mobile[future]
                    try:
                        result = future.result()
                    except Exception as e:
                        result = {"mobile": mobile, "success": False, "error": str(e), "steps": {}}
                        logger.error(f"[{mobile}] 异常: {e}")
                    results.append(result)
                    logger.info(f"[并发] 已完成 {idx}/{len(mobile_list)}: {mobile}")
        return results

    def _thread_process_wrapper(self, mobile: str, task_info: MobileTaskInfo, mode: Optional[int]) -> Dict:
        """每个线程使用独立实例，避免并发冲突"""
        return TaskAutomation(self.base_url).process_single_user(mobile, task_info, mode)

    def _post(self, endpoint: str, data: Dict) -> Dict:
        """统一POST请求封装"""
        if not self.access_token:
            return {"error": "未登录或token失效"}
        try:
            resp = self.session.post(f"{self.base_url}{endpoint}", json=data, timeout=10)
            return resp.json()
        except Exception as e:
            return {"error": str(e)}

    def _reset_session(self):
        """清除会话状态"""
        self.access_token = None
        self.session.headers.pop("Authorization", None)

    @staticmethod
    def _init_result(mobile: str) -> Dict:
        return {"mobile": mobile, "steps": {}, "success": False, "error": None}


class SMSService:
    def __init__(self, environment: str = None):
        self.environment = environment or settings.ENVIRONMENT
        self.template_dir = os.path.join(os.path.dirname(__file__), "..", "data")
        os.makedirs(self.template_dir, exist_ok=True)
        self.allowed_templates = {
            "channel_open_notice": "渠道账户开通通知",
            "reset_worker_sign": "补发共享协议签约短信通知",
            "worker_sign_notice": "共享协议签约短信通知(dev)",
            "reset_tax_user_notice": "重置税局账户密码",
            "open_tax_user_notice": "开通税局账号通知模板",
            "batch_remind_notice": "批量提醒上传资料",
            "import_staff_notice": "上传人员后发送通知",
            "settled_remind": "合作者事后打款完成发短信",
            "settled_task_remind": "结算成功定时提醒上传材料",
            "user_add": "新增员工账号通知",
            "enterprise_expire": "企业续签通知",
            "enterprise_reopen": "企业重新开通通知",
            "reset_client_user_pwd": "企业用户重置密码",
            "pay_fail_notice": "账单支付失败通知",
            "recharge_notice": "充值失败通知",
            "amount_chg_notice": "余额变动通知",
            "stop_ent": "关停企业通知",
            "task_pass": "任务审核通过通知",
            "task_fail": "任务审核驳回通知",
            "invoice_apply_pass": "发票审核通过通知",
            "invoice_apply_fail": "发票审核驳回通知",
            "recharge_success": "充值成功通知",
            "recharge_fail": "充值失败通知",
            "balance_change": "账户余额通知",
            "pay_fail": "账单支付失败通知",
            "compliance_fail": "合规材料审核通知",
            "sign_notice": "电子签约通知",
            "open_notice": "开通企业通知模板"
        }
        self.default_params = {
            "eName": "默认企业名称",
            "entName": "测试企业有限公司",
            "userName": "company_admin",
            "eAccount": "test_account_123",
            "username": "test_user",
            "password": "Test@1234",
            "pwd": "TempPwd!2023",
            "newPwd": "NewPwd!2023",
            "date": "2025-12-31",
            "datetime": "2025-12-31 23:59:59",
            "deadline": "2025-12-31",
            "expireTime": "2025-12-31",
            "expreTime": "2025-12-12",
            "linkUrl": "SDFSHE",
            "loginUrl": "SDogin",
            "loginUr": "SDF",
            "signUrl": "SDF",
            "amount": "1000.00",
            "balance": "5000.00",
            "chgAmount": "-300.00",
            "curAmount": "4700.00",
            "count": "3",
            "payTimes": "2",
            "name": "张三",
            "nickName": "张小三",
            "nickname": "小三",
            "realName": "李四",
            "accountName": "王五企业",
            "applyNo": "APP20231231001",
            "auditRemark": "信息不完整，请补充",
            "concact": "18999999999",
            "reason": "工资发放",
            "role": "企业管理员",
            "taskName": "测试任务项目"
        }

    def _get_template_file_path(self):
        filename = "prod_templates.json" if self.environment == "prod" else "test_templates.json"
        return os.path.join(self.template_dir, filename)

    def update_templates(self):
        """更新模板数据"""
        try:
            # 获取环境配置
            env_settings = self._get_env_settings()
            url = f"{env_settings.sms_api_base_url}/page?pageNo=1&pageSize=50&type=2&code=&content=&apiTemplateId=&channelId=2"

            response = requests.get(url, headers=env_settings.sms_headers, timeout=10)
            response.raise_for_status()
            data = response.json()

            if data.get('code') != 0:
                return {"code": 500, "success": False, "message": f"模版更新失败，原因: {data.get('msg', '未知错误')}",
                        "data": data}

            # 保存到文件
            file_path = self._get_template_file_path()
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            template_count = len(data.get('data', {}).get('list', []))
            return {
                "success": True,
                "message": f"成功更新 {template_count} 个模板",
                "data": data
            }
        except Exception as e:
            logger.error(f"更新模板失败: {str(e)}")
            return {"success": False, "message": f"更新模板失败: {str(e)}", "data": None}

    def get_templates(self):
        """获取模板列表"""
        try:
            file_path = self._get_template_file_path()
            if not os.path.exists(file_path):
                return {"success": False, "message": "没有可用模板，请先更新数据", "data": []}

            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    return {"success": False, "message": "模板文件为空，请先更新数据", "data": []}

                data = json.loads(content)
                templates = data.get('data', {}).get('list', [])
                return {
                    "success": True,
                    "message": f"获取到 {len(templates)} 个模板",
                    "data": templates
                }
        except Exception as e:
            logger.error(f"获取模板失败: {str(e)}")
            return {"success": False, "message": f"获取模板失败: {str(e)}", "data": []}

    def get_allowed_templates(self):
        """获取允许的模板列表（带名称）"""
        # 从模板文件中获取完整信息
        templates_res = self.get_templates()
        full_templates = templates_res.get("data", []) if templates_res["success"] else []
        template_map = {t["code"]: t for t in full_templates}

        allowed_list = []
        for code, name in self.allowed_templates.items():
            # 从完整模板中获取详细信息
            full_template = template_map.get(code, {})
            allowed_list.append({
                "id": full_template.get("id", ""),  # 补充id
                "code": code,
                "name": name,
                "content": full_template.get("content", ""),  # 补充内容
                "params": full_template.get("params", [])  # 补充参数
            })
        return allowed_list

    def send_single(self, template_code, mobiles, params):
        """发送单模板短信"""
        try:
            # 检查模板是否存在
            templates_res = self.get_templates()
            if not templates_res["success"]:
                return templates_res

            template = next(
                (t for t in templates_res["data"] if t["code"] == template_code),
                None
            )
            if not template:
                return {"success": False, "message": f"模板 {template_code} 不存在，请更新数据", "data": None}

            # 合并参数
            final_params = {**self.default_params, **params}
            required_params = template.get('params', [])
            filtered_params = {k: v for k, v in final_params.items() if k in required_params}

            # 发送请求
            env_settings = self._get_env_settings()
            url = f"{env_settings.sms_api_base_url}/send-sms"
            headers = {**env_settings.sms_headers, 'Content-Type': 'application/json'}

            results = []
            for mobile in mobiles:
                payload = {
                    "mobile": mobile.strip(),
                    "templateCode": template_code,
                    "templateParams": filtered_params,
                    "content": template['content'],
                    "params": required_params
                }

                response = requests.post(
                    url,
                    headers=headers,
                    data=json.dumps(payload),
                    timeout=10
                )
                response.raise_for_status()
                results.append({
                    "mobile": mobile,
                    "result": response.json()
                })

            success_count = sum(1 for r in results if r["result"].get("code") == 0)
            return {
                "success": True,
                "message": f"发送完成，成功 {success_count}/{len(results)}",
                "data": results,
                "total": len(results),
                "success_count": success_count,
                "failure_count": len(results) - success_count
            }
        except Exception as e:
            logger.error(f"发送短信失败: {str(e)}")
            return {"success": False, "message": f"发送短信失败: {str(e)}", "data": None}

    def batch_send(self, template_codes, mobiles, random_send):
        """批量发送允许的模板"""
        try:
            # 获取模板列表
            templates_res = self.get_templates()
            if not templates_res["success"]:
                return templates_res

            # 过滤有效的模板
            valid_templates = []
            invalid_codes = []
            for code in template_codes:
                template = next(
                    (t for t in templates_res["data"] if t["code"] == code),
                    None
                )
                if template:
                    valid_templates.append(template)
                else:
                    invalid_codes.append(code)

            if invalid_codes:
                return {
                    "success": False,
                    "message": f"模板 {', '.join(invalid_codes)} 不存在，请更新数据后再次尝试",
                    "data": None
                }

            # 处理手机号
            target_mobiles = mobiles
            if random_send and len(mobiles) > 1:
                # 随机选择不重复的手机号，最多选5个
                select_count = min(1, len(mobiles))
                target_mobiles = random.sample(mobiles, select_count)

            # 批量发送
            all_results = []
            for template in valid_templates:
                # 合并参数
                final_params = self.default_params.copy()
                required_params = template.get('params', [])
                # 补充缺失的必填参数
                for param in required_params:
                    if param not in final_params:
                        final_params[param] = f"auto_{param}"
                filtered_params = {k: v for k, v in final_params.items() if k in required_params}

                # 发送请求
                env_settings = self._get_env_settings()
                url = f"{env_settings.sms_api_base_url}/send-sms"
                headers = {**env_settings.sms_headers, 'Content-Type': 'application/json'}

                for mobile in target_mobiles:
                    payload = {
                        "mobile": mobile.strip(),
                        "templateCode": template["code"],
                        "templateParams": filtered_params,
                        "content": template['content'],
                        "params": required_params
                    }

                    response = requests.post(
                        url,
                        headers=headers,
                        data=json.dumps(payload),
                        timeout=10
                    )
                    response.raise_for_status()
                    all_results.append({
                        "mobile": mobile,
                        "template_code": template["code"],
                        "template_name": template["name"],
                        "result": response.json()
                    })

            success_count = sum(1 for r in all_results if r["result"].get("code") == 0)
            return {
                "success": True,
                "message": f"批量发送完成，成功 {success_count}/{len(all_results)}",
                "data": all_results,
                "total": len(all_results),
                "success_count": success_count,
                "failure_count": len(all_results) - success_count
            }
        except Exception as e:
            logger.error(f"批量发送失败: {str(e)}")
            return {"success": False, "message": f"批量发送失败: {str(e)}", "data": None}

    def fetch_workers(self, batch_no=None, mobiles=None, tax_id=None):
        """查询需要补发短信的工人信息"""
        if not batch_no and not mobiles:
            return {"success": False, "message": "批次号和手机号不能同时为空", "data": []}

        # 数据库配置
        if self.environment:
            settings.ENVIRONMENT = self.environment
        db_config = settings.get_db_config()

        # 构建SQL
        where_clauses = ["t.deleted = 0"]
        params = []

        if batch_no:
            where_clauses.append("t.batch_no = %s")
            params.append(batch_no)

        if mobiles:
            placeholders = ", ".join(["%s"] * len(mobiles))
            where_clauses.append(f"t.mobile IN ({placeholders})")
            params.extend(mobiles)

            where_clauses.append("t.tax_id = %s")
            params.append(tax_id)

        where_clause = " AND ".join(where_clauses)
        sql = f"""
        SELECT
            t.realname as name,
            t.mobile,
            t.worker_id,
            t.tax_id,
            DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%%Y-%%m-%%d') as deadline
        FROM
            biz_balance_worker t
            LEFT JOIN biz_enterprise_sign t1 ON t1.worker_id = t.worker_id AND t1.tax_id=t.tax_id
        WHERE
            {where_clause}
            AND (t1.sign_status IS NULL OR t1.sign_status <> 0)
        GROUP BY t.worker_id
        """
        try:
            with DatabaseManager(db_config) as conn:
                with conn.cursor(DictCursor) as cursor:
                    print(sql)
                    a = cursor.execute(sql, params)
                    workers = cursor.fetchall()

                    # 保存到文件
                    resend_file = os.path.join(self.template_dir, "resend_data.json")
                    with open(resend_file, 'w', encoding='utf-8') as f:
                        json.dump(workers, f, ensure_ascii=False, indent=2)

                    return {
                        "success": True,
                        "message": f"查询到 {len(workers)} 条需要补发的记录",
                        "data": workers
                    }
        except Exception as e:
            logger.error(f"查询工人信息失败: {str(e)}")
            return {"success": False, "message": f"查询失败: {str(e)}", "data": []}

    def resend_sms(self, workers):
        """补发短信"""
        try:
            # 检查模板是否存在
            templates_res = self.get_templates()
            if not templates_res["success"]:
                return templates_res

            template_code = "worker_sign_notice"
            template = next(
                (t for t in templates_res["data"] if t["code"] == template_code),
                None
            )
            if not template:
                return {"success": False, "message": f"模板 {template_code} 不存在，请更新数据", "data": None}

            # 发送请求
            env_settings = settings
            url = f"{env_settings.sms_api_base_url}/send-sms"
            headers = {**env_settings.sms_headers, 'Content-Type': 'application/json'}

            results = []
            for worker in workers:
                # 构造参数
                params = {
                    "name": worker["name"],
                    "deadline": worker["deadline"],
                    "signUrl": f"{worker['worker_id']}a{worker['tax_id']}"
                }

                # 合并默认参数
                final_params = {**self.default_params, **params}
                required_params = template.get('params', [])
                filtered_params = {k: v for k, v in final_params.items() if k in required_params}

                payload = {
                    "mobile": worker["mobile"].strip(),
                    "templateCode": template_code,
                    "templateParams": filtered_params,
                    "content": template['content'],
                    "params": required_params
                }

                response = requests.post(
                    url,
                    headers=headers,
                    data=json.dumps(payload),
                    timeout=10
                )
                response.raise_for_status()
                results.append({
                    "mobile": worker["mobile"],
                    "name": worker["name"],
                    "result": response.json()
                })

            success_count = sum(1 for r in results if r["result"].get("code") == 0)
            return {
                "success": True,
                "message": f"补发完成，成功 {success_count}/{len(results)}",
                "data": results,
                "total": len(results),
                "success_count": success_count,
                "failure_count": len(results) - success_count
            }
        except Exception as e:
            logger.error(f"补发短信失败: {str(e)}")
            return {"success": False, "message": f"补发短信失败: {str(e)}", "data": None}

    def _get_env_settings(self):
        """获取当前环境对应的配置"""

        class EnvSettings:
            def __init__(self, env):
                self.env = env

            @property
            def sms_api_base_url(self):
                if self.env == "prod":
                    return settings.SMS_API_BASE_PROD
                return settings.SMS_API_BASE_TEST

            @property
            def sms_auth_token(self):
                if self.env == "prod":
                    return settings.SMS_AUTH_TOKEN_PROD
                return settings.SMS_AUTH_TOKEN_TEST

            @property
            def sms_origin(self):
                if self.env == "prod":
                    return settings.SMS_ORIGIN_PROD
                return settings.SMS_ORIGIN_TEST

            @property
            def sms_referer(self):
                if self.env == "prod":
                    return settings.SMS_REFERER_PROD
                return settings.SMS_REFERER_TEST

            @property
            def sms_headers(self):
                return {
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Authorization': self.sms_auth_token,
                    'Connection': 'keep-alive',
                    'Origin': self.sms_origin,
                    'Referer': self.sms_referer,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
                    'tenant-id': settings.SMS_TENANT_ID  # 固定值复用
                }

        return EnvSettings(self.environment)
