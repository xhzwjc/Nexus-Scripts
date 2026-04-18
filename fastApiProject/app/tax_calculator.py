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

# 计算步骤多语言文案
CALC_TRANSLATIONS: Dict[str, Dict[str, str]] = {
    'zh-CN': {
        'reset_reason': '重置原因',
        'monthly_income_accumulate': '当月累计收入',
        'monthly_income_after_deduction': '当月总收入额（扣除后）',
        'accumulated_income_first': '累计收入额',
        'accumulated_income_update': '累计收入额',
        'accumulated_months': '累计月份',
        'accumulated_deduction': '累计减除费用',
        'accumulated_special': '累计专项扣除',
        'accumulated_additional': '累计专项附加扣除',
        'accumulated_other': '累计其他扣除',
        'accumulated_pension': '累计个人养老金',
        'accumulated_donation': '累计准予扣除的捐赠额',
        'taxable_income': '应纳税所得额',
        'tax_rate_label': '税率',
        'quick_deduction': '速算扣除数',
        'annual_tax_theory': '年度累计应纳税额(理论)',
        'prev_paid': '本月此前已缴税额',
        'current_tax': '本次应缴税额',
        'monthly_paid_total': '当月已缴税额（含本次）',
        'effective_rate': '实际税负',
        'vat_trigger': '劳务报酬当月累计金额超过10万，本次增值税',
        'surcharge_label': '，本次附加税费',
        'warning_450': '结算金额达450万，已触发预警',
        'warning_500': '结算金额达500万，超出预警限额',
        'income_labor': '劳务报酬',
        'income_salary': '工资薪金',
    },
    'en-US': {
        'reset_reason': 'Reset Reason',
        'monthly_income_accumulate': 'Monthly Cumulative Income',
        'monthly_income_after_deduction': 'Monthly Income (After Deduction)',
        'accumulated_income_first': 'Accumulated Income',
        'accumulated_income_update': 'Accumulated Income',
        'accumulated_months': 'Accumulated Months',
        'accumulated_deduction': 'Accumulated Standard Deduction',
        'accumulated_special': 'Accumulated Special Deduction',
        'accumulated_additional': 'Accumulated Additional Deduction',
        'accumulated_other': 'Accumulated Other Deductions',
        'accumulated_pension': 'Accumulated Personal Pension',
        'accumulated_donation': 'Accumulated Deductible Donations',
        'taxable_income': 'Taxable Income',
        'tax_rate_label': 'Tax Rate',
        'quick_deduction': 'Quick Deduction',
        'annual_tax_theory': 'Annual Cumulative Tax (Theoretical)',
        'prev_paid': 'Previously Paid Tax This Month',
        'current_tax': 'Current Tax Payable',
        'monthly_paid_total': 'Monthly Tax Paid (Incl. This)',
        'effective_rate': 'Effective Tax Rate',
        'vat_trigger': 'Labor monthly cumulative amount >100k, current VAT',
        'surcharge_label': ', current surcharges',
        'warning_450': 'Settlement reached CNY 4.5M, warning triggered',
        'warning_500': 'Settlement reached CNY 5M, exceeded warning limit',
        'income_labor': 'Labor Remuneration',
        'income_salary': 'Salary & Wages',
    },
}


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

                    base_query = f"""
                                 SELECT COALESCE(payment_over_time, create_time) as payment_time,
                                        bill_amount - ROUND(COALESCE(worker_service_amount, 0), 2) AS bill_amount,
                                        DATE_FORMAT(COALESCE(payment_over_time, create_time),
                                                    '%%Y-%%m') as year_months,
                                        batch_no,
                                        realname,
                                        worker_id,
                                        credential_num,
                                        business_type,
                                        report_type,
                                        tax_rule
                                 FROM biz_balance_worker
                                 WHERE deleted = 0
                                   AND pay_status IN (0, 3)
                                   AND credential_num = %s
                                   AND (tax_rule = 1 OR (tax_rule = 0 AND business_type = 2 AND report_type = 0))
                                   AND (
                                     (payment_over_time >= %s AND payment_over_time < %s)
                                         OR
                                     (payment_over_time IS NULL AND create_time >= %s AND create_time < %s)
                                     )
                                 """

                    params = [credential_num, start_date, end_date, start_date, end_date]

                    if realname:
                        base_query += " AND realname = %s"
                        params.append(realname)

                    base_query += " ORDER BY COALESCE(payment_over_time, create_time)"

                    cursor.execute(base_query, tuple(params))
                    db_results = cursor.fetchall()

                    records = [self._create_record_dict(row) for row in db_results]
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
                            COALESCE(payment_over_time, create_time) as payment_time,
                            bill_amount - ROUND(COALESCE(worker_service_amount, 0), 2) AS bill_amount,
                            DATE_FORMAT(COALESCE(payment_over_time, create_time), '%%Y-%%m') as year_months,
                            batch_no,
                            realname,
                            worker_id,
                            credential_num,
                            business_type,
                            report_type,
                            tax_rule
                        FROM biz_balance_worker
                        WHERE deleted = 0
                          AND pay_status IN (0, 3)
                          AND credential_num IN ({format_strings})
                          AND (tax_rule = 1 OR (tax_rule = 0 AND business_type = 2 AND report_type = 0))
                          AND (
                              (payment_over_time >= %s AND payment_over_time < %s)
                              OR
                              (payment_over_time IS NULL AND create_time >= %s AND create_time < %s)
                          )
                        ORDER BY credential_num, COALESCE(payment_over_time, create_time)
                    """
                    params = credential_nums + [start_date, end_date, start_date, end_date]
                    logger.info(f"[SQL查询] query={query}")
                    logger.info(f"[SQL查询] params={params}")
                    cursor.execute(query, tuple(params))
                    db_results = cursor.fetchall()
                    logger.info(f"[SQL查询] 返回 {len(db_results)} 条记录")

                    records = [self._create_record_dict(row) for row in db_results]
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
                        {
                            'credential_num': credential_num,
                            'realname': realname or '模拟用户',
                            'worker_id': 0
                        }
                    ]
                    logger.info(f"模拟数据模式: 使用默认人员 {credential_num} 进行计算")
                elif credential_num:
                    people_to_process = [
                        {
                            'credential_num': credential_num,
                            'realname': realname or '模拟用户',
                            'worker_id': 0
                        }
                    ]

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

                # 返回所有人的所有数据（不按批次筛选），便于前端展开查看
                logger.info(f"计算完成，共返回 {len(all_results)} 条记录")
                return all_results

            elif credential_num and credential_num.strip() != "":
                # 无批次号的单个用户路径
                people_to_process = [
                    {
                        'credential_num': credential_num,
                        'realname': realname or '模拟用户',
                        'worker_id': 0
                    }
                ]

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

            city_tax_rate = Decimal(str(kwargs.get('city_tax_rate', '7.0') or '7.0'))
            education_surcharge_rate = Decimal(str(kwargs.get('education_surcharge_rate', '3.0') or '3.0'))
            local_education_surcharge_rate = Decimal(str(kwargs.get('local_education_surcharge_rate', '2.0') or '2.0'))
            lang = kwargs.get('lang', 'zh-CN') or 'zh-CN'
            _t = CALC_TRANSLATIONS.get(lang, CALC_TRANSLATIONS['zh-CN'])

            logger.info(f"正在为 {credential_num} ({realname or 'N/A'}) 计算 {year} 年度税款...")

            if records is None:
                records = self.get_records(credential_num, year, realname)

            if not records:
                return []

            revenue_bills = Decimal('0.00')
            last_income_month = None
            monthly_accumulators = {}
            results = []

            # sorted_records = sorted(records, key=lambda x: (x['year_month'], x.get('payment_time', x['year_month']))) 暂时移除，因为批量的SQL中处理了排序

            for record in records:
                if record['bill_amount'] is None or record['bill_amount'] < Decimal('0.00'):
                    logger.warning(f"跳过无效金额记录: {record}")
                    continue

                month_key = record['year_month']
                person_key = f"{credential_num}_{month_key}"
                tax_rule = record.get('tax_rule', None)

                logger.info(f"[计算开始] credential_num={credential_num}, batch_no={record.get('batch_no')}, month_key={month_key}, tax_rule={tax_rule}, bill_amount={record['bill_amount']}")

                # 先判断是否需要重置（必须在 person_key 创建之前判断）
                current_year, current_month = map(int, month_key.split('-'))
                reset_needed = False
                reset_reason = ""
                if last_income_month:
                    last_year, last_month = map(int, last_income_month.split('-'))
                    if current_year != last_year:
                        reset_needed = True; reset_reason = f"跨年重置 ({last_income_month} → {month_key})"
                    elif (current_month - last_month) > 1:
                        reset_needed = True; reset_reason = f"收入中断超过1个月 ({last_income_month} → {month_key})"

                is_new_month = person_key not in monthly_accumulators
                if is_new_month:
                    # 如果需要重置，则清空所有状态，从零开始
                    if reset_needed:
                        logger.info(f"{reset_reason}，重置累计值")
                        revenue_bills = Decimal('0.00')
                        monthly_accumulators = {}
                    else:
                        # 计算上一个月 key，用于继承跨月累计状态
                        if current_month == 1:
                            prev_month_key = f"{current_year - 1}-12"
                        else:
                            prev_month_key = f"{current_year}-{current_month - 1:02d}"
                        prev_person_key = f"{credential_num}_{prev_month_key}"
                        prev_labor_dict = monthly_accumulators.get(prev_person_key)
                        prev_labor = prev_labor_dict.get('labor') if prev_labor_dict else None
                        prev_salary = prev_labor_dict.get('salary') if prev_labor_dict else None
                        if prev_labor is None or prev_salary is None:
                            logger.warning(f"跨月继承失败：{prev_person_key} 不存在或数据异常，将从零开始累计")

                    # 创建新的月度累加器
                    if reset_needed:
                        # 重置时：从零开始
                        monthly_accumulators[person_key] = {
                            'labor': {
                                'records': [], 'total_amount': Decimal('0.00'), 'paid_tax': Decimal('0.00'),
                                'paid_vat': Decimal('0.00'), 'paid_surcharges': Decimal('0.00'),
                                'monthly_income': Decimal('0.00'), 'started': False, 'reset_reason': reset_reason,
                                'accumulated_income': Decimal('0.00'), 'accumulated_tax': Decimal('0.00'),
                                'accumulated_months': 0, 'precise_tax_at_month_end': Decimal('0.00'),
                                'last_record_unrounded_tax': Decimal('0.00')
                            },
                            'salary': {
                                'records': [], 'total_amount': Decimal('0.00'), 'paid_tax': Decimal('0.00'),
                                'monthly_income': Decimal('0.00'), 'started': False, 'reset_reason': reset_reason,
                                'accumulated_income': Decimal('0.00'), 'accumulated_tax': Decimal('0.00'),
                                'accumulated_months': 0, 'precise_tax_at_month_end': Decimal('0.00'),
                                'last_record_unrounded_tax': Decimal('0.00')
                            },
                            'reset_reason': reset_reason
                        }
                    else:
                        # 正常跨月：继承上个月的累计状态
                        labor_initial_months = prev_labor['accumulated_months'] if prev_labor else 0
                        labor_initial_income = prev_labor['accumulated_income'] if prev_labor else Decimal('0.00')
                        labor_initial_precise_tax = prev_labor['precise_tax_at_month_end'] if prev_labor else Decimal('0.00')
                        labor_initial_paid_tax = prev_labor['paid_tax'] if prev_labor else Decimal('0.00')
                        labor_initial_paid_vat = Decimal('0.00')
                        labor_initial_paid_surcharges = Decimal('0.00')

                        salary_initial_months = prev_salary['accumulated_months'] if prev_salary else 0
                        salary_initial_income = prev_salary['accumulated_income'] if prev_salary else Decimal('0.00')
                        salary_initial_precise_tax = prev_salary['precise_tax_at_month_end'] if prev_salary else Decimal('0.00')
                        salary_initial_paid_tax = prev_salary['paid_tax'] if prev_salary else Decimal('0.00')

                        # 新月开始时 started 统一为 False，保证跨月后首条记录能触发月份递增
                        labor_initial_started = False
                        salary_initial_started = False

                        monthly_accumulators[person_key] = {
                            'labor': {
                                'records': [], 'total_amount': Decimal('0.00'), 'paid_tax': labor_initial_paid_tax,
                                'paid_vat': labor_initial_paid_vat, 'paid_surcharges': labor_initial_paid_surcharges,
                                'monthly_income': Decimal('0.00'), 'started': labor_initial_started, 'reset_reason': "",
                                'accumulated_income': labor_initial_income, 'accumulated_tax': labor_initial_paid_tax,
                                'accumulated_months': labor_initial_months, 'precise_tax_at_month_end': labor_initial_precise_tax,
                                'last_record_unrounded_tax': Decimal('0.00')
                            },
                            'salary': {
                                'records': [], 'total_amount': Decimal('0.00'), 'paid_tax': salary_initial_paid_tax,
                                'monthly_income': Decimal('0.00'), 'started': salary_initial_started, 'reset_reason': "",
                                'accumulated_income': salary_initial_income, 'accumulated_tax': salary_initial_paid_tax,
                                'accumulated_months': salary_initial_months, 'precise_tax_at_month_end': salary_initial_precise_tax,
                                'last_record_unrounded_tax': Decimal('0.00')
                            },
                            'reset_reason': ""
                        }

                # 获取 tax_rule 判断收入类型，并选择对应的累加器
                tax_rule = record.get('tax_rule', None)
                if tax_rule is not None:
                    # tax_rule: 1=工资薪金(对应income_type=2), 0=劳务报酬(对应income_type=1)
                    effective_income_type = 2 if tax_rule == 1 else 1
                    accum = monthly_accumulators[person_key]['labor'] if tax_rule == 0 else monthly_accumulators[person_key]['salary']
                else:
                    # 模拟数据使用传入的 income_type
                    effective_income_type = income_type
                    accum = monthly_accumulators[person_key]['labor'] if income_type == 1 else monthly_accumulators[person_key]['salary']

                if reset_reason and not accum['reset_reason']:
                    accum['reset_reason'] = reset_reason
                accum['records'].append(record)
                prev_month_total_amount = accum['total_amount']
                accum['total_amount'] += record['bill_amount']
                revenue_bills += record['bill_amount']

                prev_annual_accumulated_income = accum['accumulated_income']

                # 月度收入计算：工资薪金和劳务都用各自累加的 total_amount
                if effective_income_type == 1:
                    monthly_income = accum['total_amount'] * Decimal('0.8')
                else:
                    monthly_income = accum['total_amount']
                monthly_income = max(Decimal('0.00'), monthly_income)

                if not accum['started']:
                    accum['started'] = True
                    accum['accumulated_income'] += monthly_income
                    if is_new_month:
                        accum['accumulated_months'] += 1
                else:
                    accum['accumulated_income'] = prev_annual_accumulated_income - accum['monthly_income'] + monthly_income

                # 日志：个税计算金额和增值/附加计算金额
                logger.info(f"[个税计算] 个税计税金额=monthly_income={monthly_income} (effective_income_type={effective_income_type})")
                logger.info(f"[增值附加] 增值附加金额=accum['total_amount']={accum['total_amount']} (effective_income_type={effective_income_type}, tax_rule={tax_rule})")

                accum['monthly_income'] = monthly_income

                accum['accumulated_months'] = max(1, accum['accumulated_months'])

                accumulated_deduction = Decimal('5000') * accum['accumulated_months']
                accumulated_special = accumulated_special_deduction * accum['accumulated_months']
                accumulated_additional = accumulated_additional_deduction * accum['accumulated_months']
                accumulated_other = accumulated_other_deduction * accum['accumulated_months']
                accumulated_pension = accumulated_pension_deduction * accum['accumulated_months']
                accumulated_donation = accumulated_donation_deduction

                accumulated_taxable = max(Decimal('0.00'),
                                          accum['accumulated_income'] - accumulated_deduction - accumulated_special -
                                          accumulated_additional - accumulated_other - accumulated_pension - accumulated_donation)

                tax_rate, quick_deduction = self.get_tax_rate_and_deduction(accumulated_taxable)
                accumulated_total_tax_unrounded = max(Decimal('0.00'), accumulated_taxable * tax_rate - quick_deduction)

                total_tax_for_month_unrounded = accumulated_total_tax_unrounded - accum['precise_tax_at_month_end']

                total_tax_for_month_rounded = total_tax_for_month_unrounded.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                paid_tax_this_month_previously = accum['paid_tax']
                current_tax = max(Decimal('0.00'), total_tax_for_month_rounded - paid_tax_this_month_previously)
                prev_total_paid_tax = accum['accumulated_tax']
                accum['paid_tax'] += current_tax
                accum['accumulated_tax'] += current_tax

                calculation_steps = []
                if accum['reset_reason']:
                    calculation_steps.append(f"{_t['reset_reason']}: {accum['reset_reason']}")
                    accum['reset_reason'] = ""
                if prev_month_total_amount > Decimal('0.00'):
                    calculation_steps.append(
                        f"{_t['monthly_income_accumulate']}: {prev_month_total_amount:.2f} + {record['bill_amount']:.2f} \u2192 {accum['total_amount']:.2f}")
                else:
                    calculation_steps.append(f"{_t['monthly_income_accumulate']}: {accum['total_amount']:.2f}")
                calculation_steps.append(f"{_t['monthly_income_after_deduction']}: {monthly_income:.2f}")

                if len(accum['records']) == 1:
                    calculation_steps.append(
                        f"{_t['accumulated_income_first']}: {prev_annual_accumulated_income:.2f} + {monthly_income:.2f} \u2192 {accum['accumulated_income']:.2f}")
                else:
                    calculation_steps.append(
                        f"{_t['accumulated_income_update']}: {prev_annual_accumulated_income:.2f} \u2192 {accum['accumulated_income']:.2f}")

                calculation_steps.extend([
                    f"{_t['accumulated_months']}: {accum['accumulated_months']}",
                    f"{_t['accumulated_deduction']}: 5000 \u00d7 {accum['accumulated_months']} = {accumulated_deduction:.2f}",
                    f"{_t['accumulated_special']}: {accumulated_special_deduction:.2f} \u00d7 {accum['accumulated_months']} = {accumulated_special:.2f}",
                    f"{_t['accumulated_additional']}: {accumulated_additional_deduction:.2f} \u00d7 {accum['accumulated_months']} = {accumulated_additional:.2f}",
                    f"{_t['accumulated_other']}: {accumulated_other_deduction:.2f} \u00d7 {accum['accumulated_months']} = {accumulated_other:.2f}",
                    f"{_t['accumulated_pension']}: {accumulated_pension_deduction:.2f} \u00d7 {accum['accumulated_months']} = {accumulated_pension:.2f}",
                    f"{_t['accumulated_donation']}: {accumulated_donation:.2f}",
                    f"{_t['taxable_income']}: {accum['accumulated_income']:.2f} - {accumulated_deduction:.2f} - {accumulated_special:.2f} - {accumulated_additional:.2f} - {accumulated_other:.2f} - {accumulated_pension:.2f} - {accumulated_donation:.2f} = {accumulated_taxable:.2f}",
                    f"{_t['tax_rate_label']}: {tax_rate * Decimal('100'):.0f}%, {_t['quick_deduction']}: {quick_deduction:.2f}",
                    f"{_t['annual_tax_theory']}: {accumulated_taxable:.2f} \u00d7 {tax_rate:.2f} - {quick_deduction:.2f} = {accumulated_total_tax_unrounded:.4f}",
                    f"{_t['prev_paid']}: {paid_tax_this_month_previously:.2f}",
                    f"{_t['current_tax']}: {accumulated_total_tax_unrounded:.4f} - {prev_total_paid_tax:.4f} \u2248 {current_tax:.2f}",
                    f"{_t['monthly_paid_total']}: {accum['paid_tax']:.2f}",
                ])

                vat_tax = Decimal('0.00')
                surcharges = Decimal('0.00')
                total_tax_and_fees = current_tax

                # tax_rule=1 时不算增值税和附加税
                if effective_income_type == 1 and tax_rule != 1 and accum['total_amount'] > Decimal('100000'):
                    prev_paid_vat = accum['paid_vat']
                    prev_paid_surcharges = accum['paid_surcharges']
                    not_included_tax_sales = accum['total_amount'] / Decimal('1.01')
                    monthly_vat_total = (not_included_tax_sales * Decimal('0.01')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    monthly_surcharge_total = (monthly_vat_total * (city_tax_rate + education_surcharge_rate + local_education_surcharge_rate) / Decimal('100') * Decimal('0.5')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    vat_tax = max(Decimal('0.00'), monthly_vat_total - prev_paid_vat)
                    surcharges = max(Decimal('0.00'), monthly_surcharge_total - prev_paid_surcharges)
                    accum['paid_vat'] += vat_tax
                    accum['paid_surcharges'] += surcharges
                    total_tax_and_fees = current_tax + vat_tax + surcharges
                    calculation_steps.append(
                        f"{_t['vat_trigger']}: {accum['total_amount']:.2f} -> {vat_tax:.2f}{_t['surcharge_label']}: {surcharges:.2f}"
                    )

                if record['bill_amount'] == 0:
                    effective_tax_rate = Decimal('0.00')
                else:
                    effective_tax_rate = (total_tax_and_fees / record['bill_amount'] * Decimal('100')).quantize(Decimal('0.01'))
                calculation_steps.append(f"{_t['effective_rate']}: {effective_tax_rate}%")

                warning_msg = None
                warning_level = None
                # 只有劳务（effective_income_type == 1）才触发预警
                if effective_income_type == 1:
                    if revenue_bills >= Decimal('5000000'):
                        warning_msg = _t['warning_500']
                        warning_level = '500'
                    elif revenue_bills >= Decimal('4500000'):
                        warning_msg = _t['warning_450']
                        warning_level = '450'

                result = {
                    'batch_no': record['batch_no'],
                    'credential_num': credential_num,
                    'realname': record['realname'],
                    'worker_id': record.get('worker_id', worker_id),
                    'year_month': month_key,
                    'bill_amount': record['bill_amount'],
                    'tax': round(current_tax, 2),
                    'income_type': effective_income_type,
                    'income_type_name': _t['income_labor'] if effective_income_type == 1 else _t['income_salary'],
                    'income_amount': round(record['bill_amount'], 2),
                    'prev_accumulated_income': round(prev_annual_accumulated_income, 2),
                    'accumulated_income': round(accum['accumulated_income'], 2),
                    'accumulated_months': accum['accumulated_months'],
                    'accumulated_deduction': round(accumulated_deduction, 2),
                    'accumulated_taxable': round(accumulated_taxable, 2),
                    'accumulated_special': round(accumulated_special, 2),
                    'accumulated_additional': round(accumulated_additional, 2),
                    'accumulated_other': round(accumulated_other, 2),
                    'accumulated_pension': round(accumulated_pension, 2),
                    'accumulated_donation': round(accumulated_donation, 2),
                    'tax_rate': float(round(tax_rate, 4)),
                    'quick_deduction': round(quick_deduction, 2),
                    'accumulated_total_tax': round(accum['accumulated_tax'], 2),
                    'prev_accumulated_tax': round(prev_total_paid_tax, 2),
                    'accumulated_tax': round(accum['accumulated_tax'], 2),
                    'calculation_steps': calculation_steps,
                    'effective_tax_rate': float(effective_tax_rate),
                    'revenue_bills': round(revenue_bills, 2),
                    'vat_tax': float(vat_tax),
                    'surcharges': float(surcharges),
                    'total_tax_and_fees': float(total_tax_and_fees),
                    'warning_msg': warning_msg,
                    'warning_level': warning_level
                }
                results.append(result)

                logger.info(f"[计算完成] batch_no={record.get('batch_no')}, year_month={month_key}, bill_amount={record['bill_amount']}, accumulated_income={accum['accumulated_income']}, tax={current_tax}, vat_tax={vat_tax}")

                # 更新累加器中的跨月字段
                if last_income_month and last_income_month != month_key:
                    # 跨月了，更新上个月的 precise_tax_at_month_end
                    last_person_key = f"{credential_num}_{last_income_month}"
                    if last_person_key in monthly_accumulators:
                        monthly_accumulators[last_person_key]['labor']['precise_tax_at_month_end'] = monthly_accumulators[last_person_key]['labor']['last_record_unrounded_tax']
                        monthly_accumulators[last_person_key]['salary']['precise_tax_at_month_end'] = monthly_accumulators[last_person_key]['salary']['last_record_unrounded_tax']

                accum['last_record_unrounded_tax'] = accumulated_total_tax_unrounded
                last_income_month = month_key

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
            enriched = {
                'credential_num': credential_num,
                'realname': realname or '模拟用户',
                'worker_id': worker_id or 0,
                'batch_no': record.get('batch_no', 'MOCK_BATCH'),
                'year_month': record['year_month'],
                'bill_amount': Decimal(str(record['bill_amount'])),
                'payment_time': datetime.strptime(f"{record['year_month']}-01", "%Y-%m-%d"),
                'business_type': record.get('business_type', 2),
                'report_type': record.get('report_type', 0),
                'tax_rule': record.get('tax_rule', None)  # 模拟数据用 None 表示走 income_type 逻辑
            }
            enriched_records.append(enriched)

        filtered = [
            r for r in enriched_records
            if r['credential_num'] == credential_num
               and (not realname or r['realname'] == realname)
               and r['year_month'].startswith(str(year))
        ]

        # 按 year_month 和 payment_time 排序，保证计算顺序正确
        sorted_filtered = sorted(filtered, key=lambda x: (x['year_month'], x['payment_time']))

        logger.info(f"模拟数据模式: 为 {credential_num} 返回 {len(sorted_filtered)} 条记录")
        return sorted_filtered

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

    @staticmethod
    def get_income_type_name(income_type: int) -> str:
        """获取收入类型名称"""
        return "劳务报酬" if income_type == 1 else "工资薪金"

    @staticmethod
    def get_tax_rate_and_deduction(taxable_income: Decimal) -> Tuple[Decimal, Decimal]:
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

    @staticmethod
    def _create_record_dict(row: Dict) -> Dict:
        """创建统一的记录字典"""
        return {
            'payment_time': row['payment_time'],
            'bill_amount': Decimal(str(row['bill_amount'])) if row['bill_amount'] is not None else Decimal('0.00'),
            'year_month': row['year_months'],
            'batch_no': row['batch_no'],
            'realname': row['realname'],
            'worker_id': row['worker_id'],
            'credential_num': row['credential_num'],
            'business_type': row['business_type'],
            'report_type': row['report_type'],
            'tax_rule': row['tax_rule']
        }
