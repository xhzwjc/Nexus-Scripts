import logging
from datetime import datetime
from decimal import Decimal
from collections import defaultdict
from typing import List, Dict, Any, Optional
from ..config import settings
from ..utils import get_channel_tax_rates, get_tax_region_data, get_enterprise_recharge_data, process_tax_regions, \
    login_and_get_token, get_commission_data_from_api, Environment

class CommissionCalculationService:
    """佣金计算服务类，处理佣金计算相关业务逻辑"""

    def __init__(self, environment: str = None):
        self.environment = settings.resolve_environment(environment)
        self.logger = logging.getLogger(__name__)
        self.logger.info(f"初始化佣金计算服务，环境: {self.environment}")

        # 获取数据库配置
        self.db_config = settings.get_db_config(self.environment)

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
