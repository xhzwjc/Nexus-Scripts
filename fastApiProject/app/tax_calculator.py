# app/tax_calculator.py
import uuid

import pymysql
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any
import logging
from .utils import DatabaseManager

logger = logging.getLogger(__name__)


class TaxCalculator:
    def __init__(self, db_config: dict, mock_data: Optional[List[Dict]] = None):
        self.db_config = db_config
        self.mock_data = mock_data  # 模拟数据，为None时使用数据库模式

    def get_records(self, credential_num: str, year: int, realname: Optional[str] = None) -> List[Dict]:
        """获取记录（支持数据库和模拟数据）"""
        if self.mock_data is not None:
            return self._get_mock_records(credential_num, year, realname)

        try:
            with DatabaseManager(self.db_config) as conn:
                with conn.cursor() as cursor:
                    base_query = """
                                 SELECT 
                                    COALESCE(payment_over_time, create_time) as payment_time,
                                    bill_amount,
                                    DATE_FORMAT(COALESCE(payment_over_time, create_time), '%%Y-%%m') as year_months,
                                    batch_no,
                                    realname
                                 FROM biz_balance_worker
                                 WHERE deleted = 0
                                     AND (
                                      (payment_over_time IS NOT NULL AND YEAR(payment_over_time) = %s)
                                      OR 
                                      (payment_over_time IS NULL AND YEAR(create_time) = %s)
                                      )
                                   AND credential_num = %s \
                                 """
                    params = [year, year, credential_num]

                    if realname:
                        base_query += " AND realname = %s"
                        params.append(realname)

                    base_query += " ORDER BY COALESCE(payment_over_time, create_time)"
                    cursor.execute(base_query, tuple(params))
                    db_results = cursor.fetchall()
                    print(db_results)

                    records = [
                        {
                            'payment_time': row['payment_time'],
                            'bill_amount': float(row['bill_amount']) if row['bill_amount'] is not None else 0.0,
                            'year_month': row['year_months'],
                            'batch_no': row['batch_no'],
                            'realname': row['realname']
                        }
                        for row in db_results
                    ]
                    logger.info(f"为 {credential_num} 获取到 {len(records)} 条记录")
                    return records
        except pymysql.Error as e:
            logger.error(f"数据库查询错误: {e}")
            return []

    def _get_mock_records(self, credential_num: str, year: int, realname: Optional[str] = None) -> List[Dict]:
        """获取模拟数据记录，自动补充必要字段"""
        if not self.mock_data:
            return []

        # 为模拟数据自动补充缺失的必要字段
        enriched_records = []
        for record in self.mock_data:
            # 基础字段验证
            if 'year_month' not in record or 'bill_amount' not in record:
                logger.warning(f"跳过无效模拟数据记录: {record}（缺少year_month或bill_amount）")
                continue

            # 自动补充必要字段
            enriched = {
                # 从请求参数继承的字段
                'credential_num': credential_num,
                'realname': realname or '模拟用户',
                'batch_no': record.get('batch_no', 'MOCK_BATCH'),

                # 从原始记录获取的字段
                'year_month': record['year_month'],
                'bill_amount': float(record['bill_amount']),

                # 自动生成的字段
                'payment_time': datetime.strptime(f"{record['year_month']}-01", "%Y-%m-%d")
            }
            enriched_records.append(enriched)

        # 按条件筛选
        filtered = [
            r for r in enriched_records
            if r['credential_num'] == credential_num
               and (not realname or r['realname'] == realname)
               and r['year_month'].startswith(str(year))
        ]

        logger.info(f"模拟数据模式: 为 {credential_num} 返回 {len(filtered)} 条记录")
        return filtered

    def _get_people_from_batch(self, batch_no: str, credential_num: Optional[str] = None,
                               realname: Optional[str] = None) -> List[Dict[str, str]]:
        """根据批次号获取人员列表（支持数据库和模拟数据）"""
        if self.mock_data is not None:
            return self._get_mock_people_from_batch(batch_no, credential_num, realname)

        try:
            with DatabaseManager(self.db_config) as conn:
                with conn.cursor() as cursor:
                    query = "SELECT DISTINCT credential_num, realname FROM biz_balance_worker WHERE batch_no = %s"
                    params = [batch_no]
                    if credential_num:
                        query += " AND credential_num = %s"
                        params.append(credential_num)
                    if realname:
                        query += " AND realname = %s"
                        params.append(realname)

                    cursor.execute(query, tuple(params))
                    people = []
                    # 获取查询结果（兼容不同的游标返回格式）
                    db_results = cursor.fetchall()

                    # 处理查询结果
                    for row in db_results:
                        # 检查行数据是否有效
                        if not row:
                            continue

                        # 支持列表和字典两种格式的行数据
                        if isinstance(row, dict):
                            # 字典格式：使用列名访问
                            cred_num = row.get('credential_num')
                            name = row.get('realname', '')
                        else:
                            # 列表格式：使用索引访问
                            if len(row) < 2:
                                logger.warning(f"无效的行数据格式: {row}")
                                continue
                            cred_num = row[0]
                            name = row[1] or ''

                        # 确保身份证号有效
                        if cred_num is not None and cred_num != '':
                            people.append({
                                'credential_num': cred_num,
                                'realname': name
                            })

                    logger.info(f"从批次号 {batch_no} 中识别出 {len(people)} 个需要计算的人员")
                    return people
        except pymysql.Error as e:
            logger.error(f"从批次获取人员列表时出错: {e}")
            return []

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
                        'realname': record.get('realname')
                    }
        return list(people.values())

    def calculate_tax_by_batch(self, year: int, batch_no: Optional[str] = None, **kwargs) -> List[Dict[str, Any]]:
        """主调用方法，支持按批次号、身份证号、姓名等方式计算税额"""
        try:  # 添加try-except捕获整个批次计算过程中的错误
            credential_num = kwargs.get('credential_num')
            realname = kwargs.get('realname')
            use_mock = kwargs.get('use_mock', False)  # 获取是否为模拟模式
            people_to_process = []

            # 模拟数据模式下的特殊处理
            if use_mock:
                # 即使没有批次号和身份证号，也创建一个默认人员
                if not batch_no and (not credential_num or credential_num.strip() == ""):
                    credential_num = f"MOCK_{uuid.uuid4().hex[:10]}"
                    people_to_process = [{'credential_num': credential_num, 'realname': realname or '模拟用户'}]
                    logger.info(f"模拟数据模式: 使用默认人员 {credential_num} 进行计算")
                elif credential_num:
                    people_to_process = [{'credential_num': credential_num, 'realname': realname or '模拟用户'}]
            elif batch_no:
                people_to_process = self._get_people_from_batch(batch_no, credential_num, realname)
            elif credential_num and credential_num.strip() != "":
                people_to_process = [{'credential_num': credential_num, 'realname': realname or ''}]
            else:
                logger.error("必须提供批次号或身份证号进行计算")
                return []

            if not people_to_process:
                logger.warning("未找到任何需要计算税额的人员")
                return []

            all_results = []
            for person in people_to_process:
                # 跳过身份证号为空的记录
                if not person['credential_num']:
                    logger.warning("跳过身份证号为空的记录")
                    continue

                call_kwargs = kwargs.copy()
                call_kwargs.pop('credential_num', None)
                call_kwargs.pop('realname', None)

                person_yearly_results = self.calculate_tax(
                    credential_num=person['credential_num'],
                    realname=person['realname'],
                    year=year, **call_kwargs
                )
                all_results.extend(person_yearly_results)

            if batch_no:
                logger.info(f"计算完成，筛选批次号为 '{batch_no}' 的记录")
                return [res for res in all_results if res.get('batch_no') == batch_no]

            return all_results
        except Exception as e:
            logger.error(f"批次计算过程出错: {str(e)}", exc_info=True)
            raise  # 重新抛出异常以便上层处理

    def get_income_type_name(self, income_type: int) -> str:
        """获取收入类型名称"""
        return "劳务报酬" if income_type == 1 else "工资薪金"

    def get_tax_rate_and_deduction(self, taxable_income: float) -> Tuple[float, float]:
        """根据应纳税所得额确定税率和速算扣除数（七级超额累进税率）"""
        # 确保taxable_income是有效数值
        taxable_income = max(0.0, taxable_income)

        if taxable_income <= 36000:
            return 0.03, 0.0
        elif taxable_income <= 144000:
            return 0.10, 2520.0
        elif taxable_income <= 300000:
            return 0.20, 16920.0
        elif taxable_income <= 420000:
            return 0.25, 31920.0
        elif taxable_income <= 660000:
            return 0.30, 52920.0
        elif taxable_income <= 960000:
            return 0.35, 85920.0
        else:
            return 0.45, 181920.0

    def calculate_tax(self, credential_num: str, year: int, **kwargs) -> List[Dict[str, Any]]:
        try:  # 添加try-except捕获单个计算过程中的错误
            income_type = kwargs.get('income_type', 1)
            realname = kwargs.get('realname')
            accumulated_special_deduction = max(0.0, kwargs.get('accumulated_special_deduction', 0.0))
            accumulated_additional_deduction = max(0.0, kwargs.get('accumulated_additional_deduction', 0.0))
            accumulated_other_deduction = max(0.0, kwargs.get('accumulated_other_deduction', 0.0))
            accumulated_pension_deduction = max(0.0, kwargs.get('accumulated_pension_deduction', 0.0))
            accumulated_donation_deduction = max(0.0, kwargs.get('accumulated_donation_deduction', 0.0))

            income_type_name = self.get_income_type_name(income_type)
            logger.info(f"正在为 {credential_num} ({realname or 'N/A'}) 计算 {year} 年度税款...")

            records = self.get_records(credential_num, year, realname)
            if not records:
                return []

            accumulated_income = 0.0
            accumulated_tax = 0.0
            accumulated_months = 0
            last_income_month = None
            monthly_accumulators = {}
            results = []

            sorted_records = sorted(records, key=lambda x: (x['year_month'], x.get('payment_time', x['year_month'])))

            for record in sorted_records:
                # 确保账单金额是有效数值
                if record['bill_amount'] is None or record['bill_amount'] < 0:
                    logger.warning(f"跳过无效金额记录: {record}")
                    continue

                month_key = record['year_month']
                if month_key not in monthly_accumulators:
                    monthly_accumulators[month_key] = {
                        'records': [], 'total_amount': 0.0, 'paid_tax': 0.0,
                        'monthly_income': 0.0, 'started': False, 'reset_reason': ""
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
                    accumulated_income = 0.0
                    accumulated_tax = 0.0
                    accumulated_months = 0
                    monthly_accumulators = {}
                    monthly_accumulators[month_key] = {
                        'records': [], 'total_amount': 0.0, 'paid_tax': 0.0,
                        'monthly_income': 0.0, 'started': False, 'reset_reason': reset_reason
                    }

                accum = monthly_accumulators[month_key]
                if reset_reason and not accum['reset_reason']:
                    accum['reset_reason'] = reset_reason
                accum['records'].append(record)
                prev_month_total_amount = accum['total_amount']
                accum['total_amount'] += record['bill_amount']
                prev_annual_accumulated_income = accumulated_income

                # 计算月度收入，避免出现负数
                if income_type == 1:
                    monthly_income = accum['total_amount'] * 0.8
                else:
                    monthly_income = accum['total_amount']
                monthly_income = max(0.0, monthly_income)

                if not accum['started']:
                    accum['started'] = True
                    accumulated_income += monthly_income
                    accumulated_months += 1
                else:
                    accumulated_income = prev_annual_accumulated_income - accum['monthly_income'] + monthly_income
                accum['monthly_income'] = monthly_income

                # 确保累计月份不为零
                accumulated_months = max(1, accumulated_months)

                accumulated_deduction = 5000 * accumulated_months
                accumulated_special = accumulated_special_deduction * accumulated_months
                accumulated_additional = accumulated_additional_deduction * accumulated_months
                accumulated_other = accumulated_other_deduction * accumulated_months
                accumulated_pension = accumulated_pension_deduction * accumulated_months
                accumulated_donation = accumulated_donation_deduction

                accumulated_taxable = max(0, accumulated_income - accumulated_deduction - accumulated_special -
                                          accumulated_additional - accumulated_other - accumulated_pension - accumulated_donation)

                tax_rate, quick_deduction = self.get_tax_rate_and_deduction(accumulated_taxable)
                accumulated_total_tax = max(0.0, accumulated_taxable * tax_rate - quick_deduction)

                prev_total_paid_tax = accumulated_tax
                current_tax = max(0.0, accumulated_total_tax - prev_total_paid_tax)
                accum['paid_tax'] += current_tax
                accumulated_tax = prev_total_paid_tax + current_tax

                # 构建计算步骤
                calculation_steps = []
                if accum['reset_reason']:
                    calculation_steps.append(f"重置原因: {accum['reset_reason']}")
                    accum['reset_reason'] = ""
                if prev_month_total_amount > 0:
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
                    f"税率: {tax_rate * 100:.0f}%, 速算扣除数: {quick_deduction:.2f}",
                    f"累计应纳税额: {accumulated_taxable:.2f} × {tax_rate:.2f} - {quick_deduction:.2f} = {accumulated_total_tax:.2f}",
                    f"累计已预缴税额（含当月前期已缴）: {prev_total_paid_tax:.2f}",
                    f"本次应缴税额: max(0, {accumulated_total_tax:.2f} - {prev_total_paid_tax:.2f}) = {current_tax:.2f}",
                    f"当月已缴税额（含本次）: {accum['paid_tax']:.2f}"
                ])

                result = {
                    'batch_no': record['batch_no'],
                    'credential_num': credential_num,
                    'realname': record['realname'],
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
                    'tax_rate': round(tax_rate, 4),
                    'quick_deduction': round(quick_deduction, 2),
                    'accumulated_total_tax': round(accumulated_total_tax, 2),
                    'prev_accumulated_tax': round(prev_total_paid_tax, 2),
                    'accumulated_tax': round(accumulated_tax, 2),
                    'calculation_steps': calculation_steps
                }
                results.append(result)
                last_income_month = month_key
                logger.info(f"金额={record['bill_amount']:.2f} 税额={current_tax:.2f}")

            return results
        except Exception as e:
            logger.error(f"计算 {credential_num} 的税额时出错: {str(e)}", exc_info=True)
            return []  # 发生错误时返回空列表，避免影响批次中其他人员的计算
