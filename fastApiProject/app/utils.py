# app/utils.py
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, ROUND_DOWN
from enum import Enum, auto
import json
import logging
from typing import List, Dict, Any, Tuple, cast
import requests
import pymysql
from pymysql.cursors import DictCursor



class Environment(Enum):
    TEST = "test"  # 与传入的字符串值对应
    PROD = "prod"
    LOCAL = "local"

class DatabaseManager:
    """数据库连接上下文管理器"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config

    def __enter__(self):
        self.conn = pymysql.connect(
            cursorclass=DictCursor,
            **self.config
        )
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.conn.close()


def get_channel_tax_rates(db_config: Dict[str, Any], channel_id: int) -> Dict[int, Dict[str, Any]]:
    """查询指定渠道对应税地的费率配置"""
    try:
        with DatabaseManager(db_config) as conn:
            with conn.cursor() as cursor:
                sql = """
                    SELECT 
                        tax_id,
                        tax_address,
                        service_rate,
                        ladder_service_rate
                    FROM biz_channel_tax
                    WHERE channel_id = %s
                """
                cursor.execute(sql, (channel_id,))
                rows = cast(List[Dict[str, Any]], cursor.fetchall())

                tax_rates = {}
                for row in rows:
                    tax_id = row['tax_id']
                    tax_name = row['tax_address']

                    if row['service_rate'] is not None:
                        tax_rates[tax_id] = {
                            'name': tax_name,
                            'rate': Decimal(str(row['service_rate'])),
                            'type': 'fixed',
                            'config_str': f"固定费率 {Decimal(str(row['service_rate'])).normalize()}%"
                        }
                    else:
                        ladder = json.loads(row['ladder_service_rate'])
                        formatted_ladder = []
                        config_parts = []

                        for i, tier in enumerate(ladder):
                            min_val = Decimal(tier['minValue'])
                            max_val = Decimal(tier['maxValue'])
                            rate = Decimal(str(tier['rateValue']))

                            calc_min = min_val if i == 0 else min_val + 1
                            formatted_ladder.append((calc_min, max_val, rate))
                            config_parts.append(f"{min_val}-{max_val} {rate}%")

                        tax_rates[tax_id] = {
                            'name': tax_name,
                            'rate': formatted_ladder,
                            'type': 'ladder',
                            'config_str': "阶梯费率 " + ", ".join(config_parts)
                        }
                return tax_rates
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"获取渠道税率失败: {str(e)}")
        raise


def get_tax_region_data(db_config: Dict[str, Any], channel_id: int) -> List[Dict[str, Any]]:
    """查询渠道税地结算数据"""
    try:
        with DatabaseManager(db_config) as conn:
            with conn.cursor(DictCursor) as cursor:
                sql = """
                    SELECT 
                        c.id,
                        c.tax_id,
                        c.actual_amount,
                        c.pay_amount,
                        c.server_amount,
                        c.batch_no,
                        c.balance_no,
                        c.create_time as payment_over_time,
                        c.enterprise_id,
                        e.enterprise_name,
                        ch.channel_type
                    FROM biz_channel_commission c
                    JOIN biz_enterprise_base e ON c.enterprise_id = e.id
                    JOIN biz_channel ch ON c.channel_id = ch.id
                    WHERE c.channel_id = %s
                    AND c.deleted = 0
                    ORDER BY c.id
                """
                cursor.execute(sql, (channel_id,))
                return cast(List[Dict[str, Any]], cursor.fetchall())
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"获取税地数据失败: {str(e)}")
        raise


def get_enterprise_recharge_data(db_config: Dict[str, Any], channel_id: int) -> Dict[str, Any]:
    """获取企业充值金额数据，按企业ID和月份分组"""
    try:
        with DatabaseManager(db_config) as conn:
            with conn.cursor(DictCursor) as cursor:
                # 获取所有企业的充值记录
                sql_recharge = """
                    SELECT
                        b.enterprise_id,
                        e.enterprise_name,
                        DATE_FORMAT(b.trade_time, '%%Y-%%m') AS month,
                        SUM(b.trade_amount) AS recharge_amount
                    FROM biz_capital_detail b
                    JOIN biz_enterprise_base e ON b.enterprise_id = e.id
                    WHERE b.deleted = 0 
                        AND b.trade_type = 1 
                        AND e.channel_id = %s
                        AND b.tax_id IN (SELECT tax_id FROM biz_channel_tax WHERE channel_id = %s AND deleted=0)
                    GROUP BY b.enterprise_id, e.enterprise_name, DATE_FORMAT(b.trade_time, '%%Y-%%m')
                """
                cursor.execute(sql_recharge, (channel_id, channel_id,))
                recharge_rows = cursor.fetchall()

                # 获取所有企业信息
                sql_enterprises = """
                    SELECT id, enterprise_name 
                    FROM biz_enterprise_base 
                    WHERE channel_id = %s
                """
                cursor.execute(sql_enterprises, (channel_id,))
                enterprises = cursor.fetchall()

                # 构建数据结构
                recharge_data = {}
                enterprise_info = {ent['id']: ent['enterprise_name'] for ent in enterprises}

                for row in recharge_rows:
                    key = (row['enterprise_id'], row['month'])
                    recharge_data[key] = {
                        'amount': Decimal(str(row['recharge_amount'])),
                        'name': row['enterprise_name']
                    }

                return {
                    'recharge_data': recharge_data,
                    'enterprise_info': enterprise_info
                }
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"获取企业充值数据失败: {str(e)}")
        raise


# 在app/utils.py中添加（可放在get_enterprise_recharge_data函数下方）
def get_enterprise_list(db_config: Dict[str, Any]) -> List[Dict[str, Any]]:
    """查询所有有效企业列表"""
    try:
        with DatabaseManager(db_config) as conn:
            with conn.cursor(DictCursor) as cursor:
                sql = """
                    SELECT 
                        id, 
                        enterprise_name, 
                        channel_id, 
                        tenant_id,
                        status,
                        create_time
                    FROM biz_enterprise_base 
                    WHERE deleted = 0 
                      AND status IN (0, 2, 5)
                      AND id <> 36
                    ORDER BY enterprise_name
                """
                cursor.execute(sql)
                return cast(List[Dict[str, Any]], cursor.fetchall())
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"获取企业列表失败: {str(e)}")
        raise


def get_commission_data_from_api(auth_token: str, env: Environment) -> Dict[str, Any]:
    """从接口获取佣金数据"""
    # 确定基础URL
    if env == Environment.TEST:
        base_url = "http://fwos-chl-api-test.seedlingintl.com"
        web_url = "http://fwos-chl-test.seedlingintl.com"
    else:
        base_url = "https://chl-api.seedlingintl.com"
        web_url = "https://chl.seedlingintl.com"

    url = f"{base_url}/admin-api/channel/commission/page"

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
        'Authorization': f'Bearer {auth_token}',
        'Origin': web_url,
        'Connection': 'keep-alive',
        'Referer': f'{web_url}/',
        'Priority': 'u=0',
        'Content-Type': 'application/json;charset=UTF-8'
    }
    payload = {"pageNo": 1, "pageSize": -1, "createTime": []}

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)

        if response.status_code == 401:
            error_data = response.json()
            logger = logging.getLogger(__name__)
            logger.error(f"Token过期或无效: {error_data.get('msg', '未知错误')}")
            return {'code': 401, 'data': None, 'msg': '账号未登录'}

        response.raise_for_status()
        data = response.json()

        if not data or data.get('code') != 0:
            logger = logging.getLogger(__name__)
            logger.warning(f"API返回异常数据: {data}")
            return data or {}

        return data

    except requests.exceptions.RequestException as e:
        logger = logging.getLogger(__name__)
        logger.error(f"API请求失败: {str(e)}")
        return {'code': 500, 'data': None, 'msg': 'API请求失败'}


def calculate_commission(
        rate_config: Dict[str, Any],
        history_amount: Decimal,
        pay_amount: Decimal
) -> Tuple[Decimal, Decimal, str, List[Tuple[Decimal, str]]]:
    """根据费率配置和历史金额计算渠道服务费"""
    history = history_amount.quantize(Decimal('0.00'))
    amount = pay_amount.quantize(Decimal('0.00'))

    if rate_config['type'] == 'fixed':
        rate = rate_config['rate']
        raw_commission = amount * rate / Decimal('100')
        return (
            raw_commission,
            raw_commission,
            f"固定费率 {rate.normalize()}%",
            [(amount, f"固定费率 {rate}%")]
        )

    ladder = [
        (Decimal(str(t[0])), Decimal(str(t[1])), Decimal(str(t[2])))
        for t in rate_config['rate']
    ]

    raw_commission = Decimal('0')
    remaining = amount
    current_pos = history
    details = []

    for i, (start, end, rate) in enumerate(ladder):
        if current_pos >= (end if end is not None else Decimal('Infinity')) and i != len(ladder) - 1:
            continue

        if i == 0:
            calc_start = max(current_pos, start)
            tier_capacity = end - calc_start if end is not None else remaining
        else:
            calc_start = ladder[i - 1][1] if current_pos <= ladder[i - 1][1] else current_pos

        tier_capacity = (end - calc_start) if end is not None else remaining
        tier_amount = min(tier_capacity, remaining) if tier_capacity > 0 else Decimal('0')

        if i == len(ladder) - 1 and remaining > 0:
            tier_amount = remaining

        if tier_amount <= 0:
            continue

        tier_commission = tier_amount * rate / Decimal('100')
        raw_commission += tier_commission

        display_start = current_pos.quantize(Decimal('0.00'))
        display_end = (current_pos + tier_amount).quantize(Decimal('0.00'))

        details.append((
            tier_amount.quantize(Decimal('0.00')),
            f"{display_start}-{display_end} {rate.normalize()}%"
        ))

        remaining -= tier_amount
        current_pos += tier_amount

        if remaining <= 0:
            break

    detail_str = "阶梯费率 " + ", ".join([f"{amt:.2f} ({rate})" for amt, rate in details])
    return raw_commission, raw_commission, detail_str, details


def format_decimal_preserve(value) -> str:
    d = Decimal(str(value)).normalize()
    str_val = format(d, 'f')  # 防止科学计数法

    # 统计小数位长度
    if '.' in str_val:
        integer_part, decimal_part = str_val.split('.')
        if len(decimal_part) < 2:
            return f"{integer_part}.{decimal_part.ljust(2, '0')}"  # 补到2位
        return str_val  # 超过2位不动
    else:
        return f"{str_val}.00"  # 没有小数点，补 .00


def process_tax_regions(
        raw_data: List[Dict[str, Any]],
        tax_rate_config: Dict[int, Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """处理各税地的数据并保持原始顺序"""
    results = []
    tax_month_history = defaultdict(lambda: Decimal('0.00'))
    logger = logging.getLogger(__name__)

    for item in raw_data:
        tax_id = item['tax_id']
        if tax_id not in tax_rate_config:
            logger.warning(f"税地ID {tax_id} 没有对应的费率配置，跳过计算")
            continue

        # 处理时间格式
        if isinstance(item['payment_over_time'], str):
            payment_time = datetime.strptime(item['payment_over_time'], "%Y-%m-%d %H:%M:%S")
        else:
            payment_time = item['payment_over_time']

        year_month = (payment_time.year, payment_time.month)
        rate_config = tax_rate_config[tax_id]
        tax_name = rate_config['name']

        history_key = (tax_id, year_month)
        pay_amount = Decimal(str(item['pay_amount']))
        actual_amount = Decimal(str(item['actual_amount']))
        server_amount = Decimal(str(item['server_amount']))
        channel_type = item['channel_type']

        # 计算佣金
        rounded_commission, raw_commission, rate_detail, rate_breakdown = calculate_commission(
            rate_config,
            tax_month_history[history_key],
            pay_amount
        )

        # 计算利润
        if channel_type == 1:
            channel_profit = (server_amount - rounded_commission).quantize(
                Decimal('0.00'), rounding=ROUND_DOWN
            )
            raw_channel_profit = server_amount - raw_commission
        else:
            channel_profit = ((server_amount - rounded_commission) * Decimal('0.94')).quantize(
                Decimal('0.00'), rounding=ROUND_DOWN
            )
            raw_channel_profit = (server_amount - raw_commission) * Decimal('0.94')

        # 格式化费率详情
        formatted_rate_detail = "\n".join([f"{amt:.2f} {rate}" for amt, rate in rate_breakdown]) \
            if rate_config['type'] == 'ladder' else rate_detail

        results.append({
            'id': item['id'],
            'tax_id': tax_id,
            'tax_name': f"{tax_name}({tax_id})",
            'actual_amount': float(actual_amount),
            'pay_amount': float(pay_amount),
            'server_amount': float(server_amount),
            'commission': float(rounded_commission),
            'raw_commission': format_decimal_preserve(raw_commission),
            'channel_profit': float(channel_profit),
            'raw_channel_profit': float(raw_channel_profit),
            'batch_no': item['batch_no'],
            'balance_no': item['balance_no'],
            'rate_config': rate_config['config_str'],
            'rate_detail': formatted_rate_detail,
            'history_amount': float(tax_month_history[history_key]),
            'payment_over_time': payment_time.strftime("%Y-%m-%d %H:%M:%S"),
            'enterprise_id': item['enterprise_id'],
            'enterprise_name': item['enterprise_name'],
            'year_month': year_month,
            'month_str': f"{payment_time.year}-{payment_time.month:02d}"
        })

        # 更新该税地该月份的历史累计
        tax_month_history[history_key] += actual_amount

    # 按原始ID排序
    results.sort(key=lambda x: x['id'])
    return results


# 渠道账号配置
CHANNEL_ACCOUNTS = {
    56: ("18723303551",
         "f9fshftUs18zQLTMFzVwI8Nrs6zrbW8k8XoWBdvC48RWkaA2y8gkZXCFozqK1B7vfrofHzY4/3fV06p6+D//vWaICj0Tfzdz0XQQpNvj9yRFbrpRBpRJaFRiTPcmiFUkXT3Zjs89o0C7c7pd7nJwmbUmSS4+GL0ai6Bt6Y4MZnE="),
    65: ("18523303552",
         "p61KTXFtsHX8lshOwhgQ5m+YZc70KREf1wIlXgvcFNaU7Sq9pGmnN0QdD7bUdDE2c8obEtxV+eWXa5hJ4hVEG/smBYlGTAYo0z2KJbkrrVWpp86Ps3meGrRhGq5EyWzusYMQCLA0du2ttyNp0OPrCjLPSngN1KXXeHEDH+f9zDo="),
    67: ("18523303553",
         "AiEbpup4wC+3d4EoJPnfCWNo9xnaEuHeP1/cx7ta/HlvzxbK44jz6a8zlLt8DyjPegwHBhA3ypcYektRUgyFulNuGj4Xe8+iVztMtkX2TjfzpRO7rEt0uYLKRCOi4dppVsuTXllX8cuzS/qyAoLs4iYoBnDuwMeSSHGMVR4UmRE="),
    71: ("18700110011",
         "Krp+Crfbr9U38gmKcwu5Jj1J9wiJfQx2BhZHYU+JjQmuW0V9lY843t4haDKGRt+SeiPF1GJV9mLOTZlsUN66lf72VF1blZtH3Vuh+SBgbESxPo6tiDvBQAmK+y9Tn1W2OQicbN576nzNW3eSrCFZ4ugFkh1rUX4AYZBHAlNxtaM="),
    76: ("18738483848",
         "t8Gn+99apFnil2gjTNdfVeWtatzBzD1TF+sObrivrKIy+CU4bIYS9Z9gu/kGHPCGRzeyirvG2NYmG5dvW5YaOmgPaKlLhlaqOS17vCp8l66lp5Ke/fsX0KSrO07XQPvklvF3GYxapVamC+/lj2TAnaalLbnjB5nWsnxSkM7IMcc="),
    75: ("18790909090",
         "OMgd83aNpri8jF0HiXf5iJgxX35Iq/Q+DbACDG3m0hcYdmuyRw+YuWDfaQbNa5IMqeWnZMxDyGZFCqR/I/9VOWQY4MNJRLKXn1WHl6Qfy9ItCWpBnKR7zJ1+GxpuVvWvm8aSYCb4Vduq+RQcRiy6wmokYtou06TRYTTA1mx4uPU="),
    # 生产渠道
    6: ("19523303552",
        "CJWUoGkcDX8K2+o3CLfHbYZ89aoiJtziMovPl//bffnjDJeNU+CHjsjpWnDJqWcVu+TrEUEC58prr+/HqZ6Fyq4ogYBP7nABiY22iTvonIVEe2O89adKmUy7xuLoAK0kHSMMMCGEbHNe1dUeUa+gMeYWPdZgOdjyT9Rjql19aT8="),
    7: ("18738483828",
        "djkMiP3jo+dmc4Ehbxe+YDKkD7/D2JafIGMSgcQoJb4vz86Osp68JBEfyFv3wzdyi3vDSoiqMTXFeJB+l/rhhqOZ7xktIZcfLa1ferGyzuVPM4V4FWWOByl+dkUSV2XtHyRjVB10A/3rc9ReURVIqdOQsmfVM1vaJ5PXzn+nyc4="),
    8: ("17274802000",
        "zUt3KARp2k92rLwRPwaqwlI9+g9jkhQv76rlRcv8FRerZ0vFecRaRnfNOFqXMCF0RPOxPWVss7BwkCMIIS58IbH/kWQp4gvEtpVY4/JxFlzqytAn4HLmT2tfRtuztvN2sTl0nZoZpAZfr7RVH7mNjanqEqeBuzoipLvZi0nzCwk="),
}


def login_and_get_token(channel_id: int, env: Environment) -> str:
    """登录系统获取Token"""
    if channel_id not in CHANNEL_ACCOUNTS:
        raise ValueError(f"未配置渠道ID {channel_id} 的登录账号")

    username, password = CHANNEL_ACCOUNTS[channel_id]

    if env == Environment.PROD:
        base_url = "https://chl-api.seedlingintl.com"
    else:
        base_url = "http://fwos-chl-api-test.seedlingintl.com"

    login_url = f"{base_url}/admin-api/system/auth-channel/login"
    payload = {
        "username": username,
        "password": password,
        "code": "chunmiao",
        "captchaId": "9bb6e9fd7cec48a7aa877f0c32b404cd"
    }

    headers = {
        "accept": "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8"
    }

    try:
        response = requests.post(login_url, headers=headers, json=payload, timeout=10)
        response.raise_for_status()

        data = response.json()
        if data.get('code') != 0 or 'data' not in data or 'accessToken' not in data['data']:
            raise ValueError(f"登录失败: {data.get('msg', '未知错误')}")

        return data['data']['accessToken']

    except requests.exceptions.RequestException as e:
        raise ValueError(f"登录请求失败: {str(e)}")