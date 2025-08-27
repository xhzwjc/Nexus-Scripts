# app/tax_calculator.py
import uuid
import pymysql
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any
import logging
from decimal import Decimal, getcontext, ROUND_HALF_UP
from .utils import DatabaseManager
from collections import defaultdict

logger = logging.getLogger(__name__)

# 设置Decimal全局精度（20位有效数字）
getcontext().prec = 20


class TaxCalculator:
    def __init__(self, db_config: dict, mock_data: Optional[List[Dict]] = None):
        self.db_config = db_config
        self.mock_data = mock_data  # 模拟数据，为None时使用数据库模式

    def get_records(self, credential_num: str, year: int, realname: Optional[str] = None) -> List[Dict]:
        """获取单个用户全年度记录（支持数据库和模拟数据）"""
        if self.mock_data is not None:
            return self._get_mock_records(credential_num, year, realname)

        try:
            with DatabaseManager(self.db_config) as conn:
                with conn.cursor() as cursor:
                    # 构建日期范围
                    start_date = f"{year}-01-01"
                    end_date = f"{year + 1}-01-01"

                    base_query = """
                                 SELECT COALESCE(w.payment_over_time, w.create_time)                   as payment_time,
                                        w.bill_amount - ROUND(COALESCE(w.worker_service_amount, 0), 2) AS bill_amount,
                                        DATE_FORMAT(COALESCE(w.payment_over_time, w.create_time),
                                                    '%%Y-%%m')                                         as year_months,
                                        w.batch_no,
                                        w.realname,
                                        w.worker_id,
                                        w.credential_num,
                                        t.business_type,
                                        t.report_type
                                 FROM biz_balance_worker w
                                          INNER JOIN biz_task t ON w.task_id = t.id
                                 WHERE w.deleted = 0
                                   AND w.pay_status IN (0, 3)
                                   AND w.credential_num = %s
                                   AND t.business_type = 2
                                   AND t.report_type = 0
                                   AND (
                                     (w.payment_over_time >= %s AND w.payment_over_time < %s)
                                         OR
                                     (w.payment_over_time IS NULL AND w.create_time >= %s AND w.create_time < %s)
                                     ) \
                                 """

                    params = [credential_num, start_date, end_date, start_date, end_date]

                    if realname:
                        base_query += " AND w.realname = %s"
                        params.append(realname)

                    base_query += " ORDER BY COALESCE(w.payment_over_time, w.create_time)"

                    cursor.execute(base_query, tuple(params))
                    db_results = cursor.fetchall()

                    records = [
                        {
                            'payment_time': row['payment_time'],
                            'bill_amount': Decimal(str(row['bill_amount'])) if row[
                                                                                   'bill_amount'] is not None else Decimal(
                                '0.00'),
                            'year_month': row['year_months'],
                            'batch_no': row['batch_no'],
                            'realname': row['realname'],
                            'worker_id': row['worker_id'],
                            'credential_num': row['credential_num'],
                            'business_type': row['business_type'],
                            'report_type': row['report_type']
                        }
                        for row in db_results
                    ]
                    logger.info(f"为 {credential_num} 获取到 {len(records)} 条记录")
                    return records
        except pymysql.Error as e:
            logger.error(f"数据库查询错误: {e}")
            return []

    def _get_people_from_batch(self, batch_no: str, credential_num: Optional[str] = None,
                               realname: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        根据批次号获取人员列表，此功能保持不变。
        """
        if self.mock_data is not None:
            return self._get_mock_people_from_batch(batch_no, credential_num, realname)

        try:
            with DatabaseManager(self.db_config) as conn:
                with conn.cursor() as cursor:
                    query = "SELECT DISTINCT credential_num, realname, worker_id FROM biz_balance_worker WHERE batch_no = %s"
                    params = [batch_no]
                    if credential_num:
                        query += " AND credential_num = %s"
                        params.append(credential_num)
                    if realname:
                        query += " AND realname = %s"
                        params.append(realname)

                    cursor.execute(query, tuple(params))
                    people = []
                    db_results = cursor.fetchall()

                    for row in db_results:
                        if not row or row.get('credential_num') is None or row.get('credential_num') == '':
                            continue
                        people.append({
                            'credential_num': row['credential_num'],
                            'realname': row.get('realname', ''),
                            'worker_id': row.get('worker_id', 0)
                        })

                    logger.info(f"从批次号 {batch_no} 中识别出 {len(people)} 个需要计算的人员")
                    return people
        except pymysql.Error as e:
            logger.error(f"从批次获取人员列表时出错: {e}")
            return []

    def _get_records_for_people(self, credential_nums: List[str], year: int) -> List[Dict]:
        """
        新增优化方法：一次性获取一批人员的全年度所有记录。
        """
        if not credential_nums:
            return []

        try:
            with DatabaseManager(self.db_config) as conn:
                with conn.cursor() as cursor:
                    # 构建日期范围
                    start_date = f"{year}-01-01"
                    end_date = f"{year + 1}-01-01"

                    # 使用 IN 子句进行批量查询
                    format_strings = ','.join(['%s'] * len(credential_nums))
                    query = f"""
                        SELECT 
                            COALESCE(w.payment_over_time, w.create_time) as payment_time,
                            w.bill_amount - ROUND(COALESCE(w.worker_service_amount, 0), 2) AS bill_amount,
                            DATE_FORMAT(COALESCE(w.payment_over_time, w.create_time), '%%Y-%%m') as year_months,
                            w.batch_no,
                            w.realname,
                            w.worker_id,
                            w.credential_num,
                            t.business_type,
                            t.report_type
                        FROM biz_balance_worker w
                        INNER JOIN biz_task t ON w.task_id = t.id
                        WHERE w.deleted = 0
                          AND w.pay_status IN (0, 3)
                          AND w.credential_num IN ({format_strings})
                          AND t.business_type = 2
                          AND t.report_type = 0
                          AND (
                              (w.payment_over_time >= %s AND w.payment_over_time < %s)
                              OR 
                              (w.payment_over_time IS NULL AND w.create_time >= %s AND w.create_time < %s)
                          )
                        ORDER BY w.credential_num, COALESCE(w.payment_over_time, w.create_time)
                    """
                    params = credential_nums + [start_date, end_date, start_date, end_date]
                    cursor.execute(query, tuple(params))
                    db_results = cursor.fetchall()

                    records = [
                        {
                            'payment_time': row['payment_time'],
                            'bill_amount': Decimal(str(row['bill_amount'])) if row[
                                                                                   'bill_amount'] is not None else Decimal(
                                '0.00'),
                            'year_month': row['year_months'],
                            'batch_no': row['batch_no'],
                            'realname': row['realname'],
                            'worker_id': row['worker_id'],
                            'credential_num': row['credential_num'],
                            'business_type': row['business_type'],
                            'report_type': row['report_type']
                        }
                        for row in db_results
                    ]
                    logger.info(f"为 {len(credential_nums)} 人一次性获取到 {len(records)} 条全年记录")
                    return records
        except pymysql.Error as e:
            logger.error(f"批量获取人员记录时数据库查询错误: {e}")
            return []

    def calculate_tax_by_batch(self, year: int, batch_no: Optional[str] = None, **kwargs) -> List[Dict[str, Any]]:
        """
        【优化】主调用方法，优先使用批次模式进行高效计算。
        """
        try:
            credential_num = kwargs.get('credential_num')
            realname = kwargs.get('realname')
            use_mock = kwargs.get('use_mock', False)
            people_to_process = []
            all_results = []

            # --- 统一的逻辑判断，决定需要处理哪些人 ---
            if use_mock:
                if not batch_no and (not credential_num or credential_num.strip() == ""):
                    # 如果没提供身份证号，为模拟计算生成一个临时的
                    credential_num = f"MOCK_{uuid.uuid4().hex[:10]}"
                    people_to_process = [
                        {'credential_num': credential_num, 'realname': realname or '模拟用户', 'worker_id': 0}]
                    logger.info(f"模拟数据模式: 使用默认人员 {credential_num} 进行计算")
                elif credential_num:
                    people_to_process = [
                        {'credential_num': credential_num, 'realname': realname or '模拟用户', 'worker_id': 0}]

            elif batch_no:
                # 优化的批处理路径
                # 1. (查询1) 获取批次内所有人员
                people_to_process = self._get_people_from_batch(batch_no, credential_num, realname)
                if not people_to_process:
                    logger.warning("未找到任何需要计算税额的人员")
                    return []

                credential_nums_to_fetch = [p['credential_num'] for p in people_to_process]

                # 2. (查询2) 一次性获取这些人员的全年记录
                all_year_records = self._get_records_for_people(credential_nums_to_fetch, year)

                # 3. 将全年记录按人员分组 (在内存中操作)
                records_by_person = defaultdict(list)
                for record in all_year_records:
                    records_by_person[record['credential_num']].append(record)

                # 循环计算
                for person in people_to_process:
                    p_credential_num = person['credential_num']
                    person_full_year_records = records_by_person.get(p_credential_num, [])

                    if not person_full_year_records:
                        logger.warning(f"未找到 {p_credential_num} 的任何年度记录，跳过计算")
                        continue

                    call_kwargs = kwargs.copy()
                    call_kwargs.pop('credential_num', None)
                    call_kwargs.pop('realname', None)

                    # 传入完整的年度数据进行计算
                    person_yearly_results = self.calculate_tax(
                        credential_num=p_credential_num,
                        realname=person['realname'],
                        worker_id=person.get('worker_id', 0),
                        year=year,
                        records=person_full_year_records,  # 传入预获取的记录
                        **call_kwargs
                    )
                    all_results.extend(person_yearly_results)

                # 最后根据指定的批次号筛选结果
                logger.info(f"计算完成，筛选批次号为 '{batch_no}' 的记录")
                return [res for res in all_results if res.get('batch_no') == batch_no]

            elif credential_num and credential_num.strip() != "":
                # 无批次号的单个用户路径
                people_to_process = [{'credential_num': credential_num, 'realname': realname or '', 'worker_id': 0}]

            else:
                logger.error("必须提供批次号或身份证号进行计算")
                return []

            if not people_to_process:
                logger.warning("未找到任何需要计算税额的人员")
                return []

            # --- 统一的计算循环（针对模拟或单个用户场景） ---
            for person in people_to_process:
                if not person['credential_num']:
                    logger.warning("跳过身份证号为空的记录")
                    continue

                # 【关键修复点】在调用前，创建一个干净的kwargs副本
                # 移除已在函数签名中显式传递的参数，防止重复传参
                call_kwargs = kwargs.copy()
                call_kwargs.pop('credential_num', None)
                call_kwargs.pop('realname', None)

                person_yearly_results = self.calculate_tax(
                    credential_num=person['credential_num'],
                    realname=person['realname'],
                    worker_id=person.get('worker_id', 0),
                    year=year,
                    **call_kwargs  # 使用清理过的kwargs
                )
                all_results.extend(person_yearly_results)

            return all_results

        except Exception as e:
            logger.error(f"批次计算过程出错: {str(e)}", exc_info=True)
            raise

    def calculate_tax(self, credential_num: str, year: int, records: Optional[List[Dict]] = None, **kwargs) -> List[
        Dict[str, Any]]:
        """
        核心计算方法，能够接受预获取的记录。此部分无逻辑变更。
        """
        try:
            worker_id = kwargs.get('worker_id', 0)
            income_type = kwargs.get('income_type', 1)
            realname = kwargs.get('realname')
            accumulated_special_deduction = max(Decimal('0.00'),
                                                Decimal(str(kwargs.get('accumulated_special_deduction', '0.00'))))
            accumulated_additional_deduction = max(Decimal('0.00'),
                                                   Decimal(str(kwargs.get('accumulated_additional_deduction', '0.00'))))
            accumulated_other_deduction = max(Decimal('0.00'),
                                              Decimal(str(kwargs.get('accumulated_other_deduction', '0.00'))))
            accumulated_pension_deduction = max(Decimal('0.00'),
                                                Decimal(str(kwargs.get('accumulated_pension_deduction', '0.00'))))
            accumulated_donation_deduction = max(Decimal('0.00'),
                                                 Decimal(str(kwargs.get('accumulated_donation_deduction', '0.00'))))

            income_type_name = self.get_income_type_name(income_type)
            logger.info(f"正在为 {credential_num} ({realname or 'N/A'}) 计算 {year} 年度税款...")

            if records is None:
                records = self.get_records(credential_num, year, realname)

            if not records:
                return []

            accumulated_income = Decimal('0.00')
            accumulated_tax = Decimal('0.00')
            accumulated_months = 0
            revenue_bills = Decimal('0.00')
            last_income_month = None
            monthly_accumulators = {}
            results = []

            sorted_records = sorted(records, key=lambda x: (x['year_month'], x.get('payment_time', x['year_month'])))

            for record in sorted_records:
                if record['bill_amount'] is None or record['bill_amount'] < Decimal('0.00'):
                    logger.warning(f"跳过无效金额记录: {record}")
                    continue

                month_key = record['year_month']
                if month_key not in monthly_accumulators:
                    monthly_accumulators[month_key] = {
                        'records': [], 'total_amount': Decimal('0.00'), 'paid_tax': Decimal('0.00'),
                        'monthly_income': Decimal('0.00'), 'started': False, 'reset_reason': ""
                    }

                current_year, current_month = map(int, month_key.split('-'))
                reset_needed = False
                reset_reason = ""
                if last_income_month:
                    last_year, last_month = map(int, last_income_month.split('-'))
                    if current_year != last_year:
                        reset_needed = True
                        reset_reason = f"跨年重置 ({last_income_month} → {month_key})"
                    else:
                        if (current_month - last_month) > 1:
                            reset_needed = True
                            reset_reason = f"收入中断超过1个月 ({last_income_month} → {month_key})"
                if reset_needed:
                    logger.info(f"{reset_reason}，重置累计值")
                    accumulated_income = Decimal('0.00')
                    accumulated_tax = Decimal('0.00')
                    accumulated_months = 0
                    revenue_bills = Decimal('0.00')
                    monthly_accumulators = {}
                    monthly_accumulators[month_key] = {
                        'records': [], 'total_amount': Decimal('0.00'), 'paid_tax': Decimal('0.00'),
                        'monthly_income': Decimal('0.00'), 'started': False, 'reset_reason': reset_reason
                    }

                accum = monthly_accumulators[month_key]
                if reset_reason and not accum['reset_reason']:
                    accum['reset_reason'] = reset_reason
                accum['records'].append(record)
                prev_month_total_amount = accum['total_amount']
                accum['total_amount'] += record['bill_amount']
                revenue_bills += record['bill_amount']
                prev_annual_accumulated_income = accumulated_income

                if income_type == 1:
                    monthly_income = accum['total_amount'] * Decimal('0.8')
                else:
                    monthly_income = accum['total_amount']
                monthly_income = max(Decimal('0.00'), monthly_income)

                if not accum['started']:
                    accum['started'] = True
                    accumulated_income += monthly_income
                    accumulated_months += 1
                else:
                    accumulated_income = prev_annual_accumulated_income - accum['monthly_income'] + monthly_income
                accum['monthly_income'] = monthly_income

                accumulated_months = max(1, accumulated_months)

                accumulated_deduction = Decimal('5000') * accumulated_months
                accumulated_special = accumulated_special_deduction * accumulated_months
                accumulated_additional = accumulated_additional_deduction * accumulated_months
                accumulated_other = accumulated_other_deduction * accumulated_months
                accumulated_pension = accumulated_pension_deduction * accumulated_months
                accumulated_donation = accumulated_donation_deduction

                accumulated_taxable = max(Decimal('0.00'),
                                          accumulated_income - accumulated_deduction - accumulated_special -
                                          accumulated_additional - accumulated_other - accumulated_pension - accumulated_donation)

                tax_rate, quick_deduction = self.get_tax_rate_and_deduction(accumulated_taxable)
                accumulated_total_tax = max(Decimal('0.00'), accumulated_taxable * tax_rate - quick_deduction)

                prev_total_paid_tax = accumulated_tax
                rounded_accumulated_tax = accumulated_total_tax.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                rounded_prev_paid_tax = prev_total_paid_tax.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                current_tax = max(Decimal('0.00'), rounded_accumulated_tax - rounded_prev_paid_tax)
                effective_tax_rate = (current_tax / record['bill_amount'] * Decimal('100')).quantize(Decimal('0.01'))
                accum['paid_tax'] += current_tax
                accumulated_tax = prev_total_paid_tax + current_tax

                calculation_steps = []
                if accum['reset_reason']:
                    calculation_steps.append(f"重置原因: {accum['reset_reason']}")
                    accum['reset_reason'] = ""
                if prev_month_total_amount > Decimal('0.00'):
                    calculation_steps.append(
                        f"当月累计收入: {prev_month_total_amount:.2f} + {record['bill_amount']:.2f} → {accum['total_amount']:.2f}")
                else:
                    calculation_steps.append(f"当月累计收入: {accum['total_amount']:.2f}")
                calculation_steps.append(f"当月总收入额（扣除后）: {monthly_income:.2f}")

                if len(accum['records']) == 1:
                    calculation_steps.append(
                        f"累计收入额: {prev_annual_accumulated_income:.2f} + {monthly_income:.2f} → {accumulated_income:.2f}")
                else:
                    calculation_steps.append(
                        f"累计收入额: {prev_annual_accumulated_income:.2f} → {accumulated_income:.2f}")

                calculation_steps.extend([
                    f"累计月份: {accumulated_months}",
                    f"累计减除费用: 5000 × {accumulated_months} = {accumulated_deduction:.2f}",
                    f"累计专项扣除: {accumulated_special_deduction:.2f} × {accumulated_months} = {accumulated_special:.2f}",
                    f"累计专项附加扣除: {accumulated_additional_deduction:.2f} × {accumulated_months} = {accumulated_additional:.2f}",
                    f"累计其他扣除: {accumulated_other_deduction:.2f} × {accumulated_months} = {accumulated_other:.2f}",
                    f"累计个人养老金: {accumulated_pension_deduction:.2f} × {accumulated_months} = {accumulated_pension:.2f}",
                    f"累计准予扣除的捐赠额: {accumulated_donation:.2f}",
                    f"应纳税所得额: {accumulated_income:.2f} - {accumulated_deduction:.2f} - {accumulated_special:.2f} - {accumulated_additional:.2f} - {accumulated_other:.2f} - {accumulated_pension:.2f} - {accumulated_donation:.2f} = {accumulated_taxable:.2f}",
                    f"税率: {tax_rate * Decimal('100'):.0f}%, 速算扣除数: {quick_deduction:.2f}",
                    f"累计应纳税额: {accumulated_taxable:.2f} × {tax_rate:.2f} - {quick_deduction:.2f} = {accumulated_total_tax:.2f}",
                    f"累计已预缴税额（含当月前期已缴）: {prev_total_paid_tax:.2f}",
                    f"本次应缴税额: max(0, {accumulated_total_tax:.2f} - {rounded_prev_paid_tax:.2f}) = {current_tax:.2f}",
                    f"当月已缴税额（含本次）: {accum['paid_tax']:.2f}",
                    f"实际税负: {effective_tax_rate}%"
                ])

                result = {
                    'batch_no': record['batch_no'],
                    'credential_num': credential_num,
                    'realname': record['realname'],
                    'worker_id': record.get('worker_id', worker_id),
                    'year_month': month_key,
                    'bill_amount': record['bill_amount'],
                    'tax': round(current_tax, 2),
                    'income_type': income_type,
                    'income_type_name': income_type_name,
                    'income_amount': round(record['bill_amount'], 2),
                    'prev_accumulated_income': round(prev_annual_accumulated_income, 2),
                    'accumulated_income': round(accumulated_income, 2),
                    'accumulated_months': accumulated_months,
                    'accumulated_deduction': round(accumulated_deduction, 2),
                    'accumulated_taxable': round(accumulated_taxable, 2),
                    'accumulated_special': round(accumulated_special, 2),
                    'accumulated_additional': round(accumulated_additional, 2),
                    'accumulated_other': round(accumulated_other, 2),
                    'accumulated_pension': round(accumulated_pension, 2),
                    'accumulated_donation': round(accumulated_donation, 2),
                    'tax_rate': float(round(tax_rate, 4)),
                    'quick_deduction': round(quick_deduction, 2),
                    'accumulated_total_tax': max(rounded_accumulated_tax, rounded_prev_paid_tax),
                    'prev_accumulated_tax': round(prev_total_paid_tax, 2),
                    'accumulated_tax': round(accumulated_tax, 2),
                    'calculation_steps': calculation_steps,
                    'effective_tax_rate': float(effective_tax_rate),
                    'revenue_bills': round(revenue_bills, 2)
                }
                results.append(result)
                last_income_month = month_key
                logger.info(f"金额={record['bill_amount']:.2f} 税额={current_tax:.2f}")

            return results
        except Exception as e:
            logger.error(f"计算 {credential_num} 的税额时出错: {str(e)}", exc_info=True)
            return []

    # --- 其他辅助方法保持不变 ---
    def _get_mock_records(self, credential_num: str, year: int, realname: Optional[str] = None,
                          worker_id: Optional[int] = None) -> List[Dict]:
        """获取模拟数据记录，自动补充必要字段"""
        if not self.mock_data:
            return []

        enriched_records = []
        for record in self.mock_data:
            if 'year_month' not in record or 'bill_amount' not in record:
                logger.warning(f"跳过无效模拟数据记录: {record}（缺少year_month或bill_amount）")
                continue
            mock_worker_id = worker_id or record.get('worker_id', 0)
            enriched = {
                'credential_num': credential_num,
                'realname': realname or '模拟用户',
                'worker_id': worker_id or 0,
                'batch_no': record.get('batch_no', 'MOCK_BATCH'),
                'year_month': record['year_month'],
                'bill_amount': Decimal(str(record['bill_amount'])),
                'payment_time': datetime.strptime(f"{record['year_month']}-01", "%Y-%m-%d")
            }
            enriched_records.append(enriched)

        filtered = [
            r for r in enriched_records
            if r['credential_num'] == credential_num
               and (not realname or r['realname'] == realname)
               and r['year_month'].startswith(str(year))
        ]

        logger.info(f"模拟数据模式: 为 {credential_num} 返回 {len(filtered)} 条记录")
        return filtered

    def _get_mock_people_from_batch(self, batch_no: str, credential_num: Optional[str] = None,
                                    realname: Optional[str] = None) -> List[Dict[str, str]]:
        """从模拟数据中获取批次人员"""
        people = {}
        for record in self.mock_data:
            if record.get('batch_no') == batch_no:
                if (not credential_num or record.get('credential_num') == credential_num) and \
                        (not realname or record.get('realname') == realname):
                    key = record.get('credential_num')
                    people[key] = {
                        'credential_num': record.get('credential_num'),
                        'realname': record.get('realname'),
                        'worker_id': record.get('worker_id', 0)
                    }
        return list(people.values())

    def get_income_type_name(self, income_type: int) -> str:
        """获取收入类型名称"""
        return "劳务报酬" if income_type == 1 else "工资薪金"

    def get_tax_rate_and_deduction(self, taxable_income: Decimal) -> Tuple[Decimal, Decimal]:
        """根据应纳税所得额确定税率和速算扣除数（七级超额累进税率）"""
        taxable_income = max(Decimal('0.00'), taxable_income)

        if taxable_income <= Decimal('36000'):
            return Decimal('0.03'), Decimal('0.00')
        elif taxable_income <= Decimal('144000'):
            return Decimal('0.10'), Decimal('2520.00')
        elif taxable_income <= Decimal('300000'):
            return Decimal('0.20'), Decimal('16920.00')
        elif taxable_income <= Decimal('420000'):
            return Decimal('0.25'), Decimal('31920.00')
        elif taxable_income <= Decimal('660000'):
            return Decimal('0.30'), Decimal('52920.00')
        elif taxable_income <= Decimal('960000'):
            return Decimal('0.35'), Decimal('85920.00')
        else:
            return Decimal('0.45'), Decimal('181920.00')
