# app/reports.py
import pymysql
import openpyxl
from openpyxl.styles import Border, Side, Alignment, Font
from openpyxl.worksheet.worksheet import Worksheet
import datetime
from cn2an import an2cn
from typing import List, Dict, Optional, Union, Tuple
from collections import defaultdict
from pathlib import Path
import logging
from app.config import settings
from app.utils import DatabaseManager

logger = logging.getLogger(__name__)


class TaxReportGenerator:
    # 默认值配置
    DEFAULT_COMPANY = "云策企服（驻马店）人力资源服务有限公司"
    DEFAULT_CREDIT_CODE = "91411700MAEFDQ7P7T"

    def __init__(self, db_config: dict):
        self.db_config = db_config
        # 初始化模板路径
        self.template_path = self._get_template_path()

    def _get_template_path(self) -> Path:
        """获取模板文件的跨平台路径"""
        app_dir = Path(__file__).parent
        template_path = app_dir / "templates" / "tax_template.xlsx"

        if not template_path.exists():
            raise FileNotFoundError(
                f"Excel模板文件未找到，请确保以下文件存在: {template_path}\n"
                "解决方案：\n"
                "1. 在项目目录中创建 app/templates/ 文件夹\n"
                "2. 将完税测试模版.xlsx 复制到该文件夹并重命名为 tax_template.xlsx"
            )
        return template_path

    def query_tax_data(self, year_month: str, enterprise_ids: Optional[Union[int, List[int], str]] = None,
                      amount_type: int = 1) -> List[Dict]:
        """
        查询税务数据。
        - 如果提供了enterprise_ids (int)，则查询特定企业的数据。
        - 如果提供了enterprise_ids (list or str)，则查询指定ID列表的企业数据。
        - 否则，查询指定月份所有企业的数据。

        amount_type: 1=pay_amount(含服务费), 2=worker_pay_amount(不含服务费), 3=bill_amount(账单金额)
        """
        try:
            with DatabaseManager(self.db_config) as conn:
                with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                    # 根据amount_type选择不同的金额字段
                    amount_field = {
                        1: 'pay_amount',
                        2: 'worker_pay_amount',
                        3: 'bill_amount'
                    }.get(amount_type, 'pay_amount')  # 默认为pay_amount

                    sql = f"""
                    SELECT
                        realname AS 纳税人姓名,
                        credential_num AS 身份证号,
                        ROUND({amount_field}, 2) AS 营业额_元,
                        enterprise_name,
                        enterprise_id,
                        tax_id AS 税地ID,
                        tax_address AS 税地名称
                    FROM
                        biz_balance_worker
                    WHERE
                        pay_status = 3
                        AND enterprise_id <> 36
                        AND DATE_FORMAT(payment_over_time, '%%Y-%%m') = %s
                    """
                    params = [year_month]

                    if enterprise_ids is not None:
                        ids_to_query = []
                        if isinstance(enterprise_ids, int):
                            ids_to_query = [enterprise_ids]
                        elif isinstance(enterprise_ids, str):
                            ids_to_query = [int(eid.strip()) for eid in enterprise_ids.split(',') if eid.strip()]
                        elif isinstance(enterprise_ids, list):
                            ids_to_query = enterprise_ids

                        if ids_to_query:
                            placeholders = ', '.join(['%s'] * len(ids_to_query))
                            sql += f" AND enterprise_id IN ({placeholders})"
                            params.extend(ids_to_query)

                    sql += " ORDER BY enterprise_name, id"
                    print(sql)
                    cursor.execute(sql, tuple(params))
                    results = cursor.fetchall()

                    for record in results:
                        record['增值税_元'] = 0.00
                        record['教育费附加_元'] = 0.00
                        record['地方教育附加_元'] = 0.00
                        record['城市维护建设费_元'] = 0.00
                        record['个人经营所得税税率'] = 0.00
                        record['应纳个人经营所得税_元'] = 0.00
                        record['备注'] = record['enterprise_name']
                    return results
        except Exception as e:
            logger.error(f"数据库查询错误: {str(e)}")
            return []

    def is_merged(self, ws: Worksheet, merge_range: str) -> bool:
        """检查单元格范围是否已合并"""
        for merged_range in ws.merged_cells.ranges:
            if str(merged_range) == merge_range:
                return True
        return False

    def safe_write_merged_cell(self, ws: Worksheet, start_cell: str, value, merge_range: Optional[str] = None,
                               bold: bool = False, align: str = 'center'):
        """安全写入合并单元格，并可设置对齐方式"""
        alignment = Alignment(horizontal=align, vertical='center', wrap_text=True)
        font = Font(bold=True) if bold else Font(bold=False)

        if merge_range:
            if self.is_merged(ws, merge_range):
                ws.unmerge_cells(merge_range)
            ws.merge_cells(merge_range)
            first_cell = ws[start_cell]
            first_cell.value = value
            first_cell.font = font
            first_cell.alignment = alignment
            for row in ws[merge_range]:
                for cell in row:
                    cell.font = font
                    cell.alignment = alignment
        else:
            cell = ws[start_cell]
            cell.value = value
            cell.font = font
            cell.alignment = alignment

    def amount_to_cn(self, amount: float) -> str:
        """将金额转换为中文大写"""
        try:
            return an2cn(f"{amount:.2f}", "rmb")
        except Exception as e:
            logger.error(f"金额转换错误: {str(e)}")
            return "金额转换错误"

    def format_currency(self, amount: float) -> str:
        """格式化金额为￥XXX,XXX.XX格式"""
        return f"￥{amount:,.2f}"

    def add_border(self, ws: Worksheet, start_row: int, end_row: int, cols: List[str]):
        """为指定区域添加边框"""
        thin_border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )
        for row in range(start_row, end_row + 1):
            for col in cols:
                ws[f"{col}{row}"].border = thin_border

    def _populate_sheet(self, ws: Worksheet, data: List[Dict], year_month: str,
                        platform_company: Optional[str] = None,
                        credit_code: Optional[str] = None):
        """
        用给定数据填充单个工作表

        参数:
            platform_company: 平台企业名称，不传则使用默认值
            credit_code: 社会统一信用代码，不传则使用默认值
        """
        if not data:
            return

        # 设置平台企业和信用代码（使用传入值或默认值）
        company = platform_company or self.DEFAULT_COMPANY
        code = credit_code or self.DEFAULT_CREDIT_CODE

        # 1. 税款申报汇总表部分
        today_cn = datetime.datetime.now().strftime('%Y年%m月%d日')

        # 填写平台企业和信用代码
        self.safe_write_merged_cell(ws, 'D10', company, 'D10:H10', align='right')
        self.safe_write_merged_cell(ws, 'D12', code, 'D12:H12', align='right')

        self.safe_write_merged_cell(ws, 'D8', year_month.replace('-', '年') + '月', 'D8:H9', align='right')
        self.safe_write_merged_cell(ws, 'D14', today_cn, 'D14:H15', align='right')

        # 2. 税收缴纳申请明细表部分
        ws['C35'] = company  # 平台企业
        ws['C36'] = code  # 社会统一信用代码
        ws['C37'] = today_cn
        ws['C38'] = year_month.replace('-', '年') + '月'
        enterprise_name = data[0]['enterprise_name']
        ws['C44'] = enterprise_name

        # 3. 个人所得税纳税清单部分
        start_row = 48
        total_amount = 0.0

        ws.column_dimensions['L'].width = 25
        ws.column_dimensions['C'].width = 25

        # 写入数据行
        for i, record in enumerate(data, start=1):
            row_idx = start_row + i
            ws[f'A{row_idx}'] = record['序号']
            ws[f'B{row_idx}'] = record['纳税人姓名']
            ws[f'C{row_idx}'] = record['身份证号']
            ws[f'E{row_idx}'] = record['营业额_元']
            ws[f'F{row_idx}'] = record['增值税_元']
            ws[f'G{row_idx}'] = record['教育费附加_元']
            ws[f'H{row_idx}'] = record['地方教育附加_元']
            ws[f'I{row_idx}'] = record['城市维护建设费_元']
            ws[f'J{row_idx}'] = record['个人经营所得税税率']
            ws[f'K{row_idx}'] = record['应纳个人经营所得税_元']
            ws[f'L{row_idx}'] = record['备注']
            total_amount += float(record['营业额_元'])

        # 设置数据行样式
        for row_idx in range(start_row + 1, start_row + len(data) + 1):
            ws.row_dimensions[row_idx].height = 30
            for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']:
                ws[f"{col}{row_idx}"].alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

        # 写入合计行
        total_row_idx = start_row + len(data) + 1
        ws.row_dimensions[total_row_idx].height = 30

        self.safe_write_merged_cell(ws, f'A{total_row_idx}', '合计：', f'A{total_row_idx}:D{total_row_idx}', bold=True,
                                    align='center')

        formatted_total = self.format_currency(total_amount)
        self.safe_write_merged_cell(ws, f'E{total_row_idx}', formatted_total, f'E{total_row_idx}:F{total_row_idx}',
                                    bold=True, align='center')

        amount_cn = self.amount_to_cn(total_amount)
        self.safe_write_merged_cell(ws, f'G{total_row_idx}', amount_cn, f'G{total_row_idx}:M{total_row_idx}', bold=True,
                                    align='center')

        # 将大写金额也写入 J45:M45
        self.safe_write_merged_cell(ws, 'J45', amount_cn, 'J45:M45', bold=True, align='center')

        # 添加边框
        self.add_border(ws, start_row, total_row_idx, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'])

    def generate_tax_report(self, year_month: str, output_path: Union[str, Path],
                          enterprise_ids: Optional[Union[int, List[int], str]] = None,
                          amount_type: int = 1,
                          platform_company: Optional[str] = None,
                          credit_code: Optional[str] = None):
        """
        生成税务报表

        参数:
            output_path: 输出文件路径
            enterprise_ids: 企业ID或ID列表
            amount_type: 金额类型 (1=含服务费, 2=不含服务费, 3=账单金额)
            platform_company: 平台企业名称（可选，不传则使用默认值）
            credit_code: 社会统一信用代码（可选，不传则使用默认值）
        """
        output_path = Path(output_path) if isinstance(output_path, str) else output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)

        all_data = self.query_tax_data(year_month, enterprise_ids, amount_type)
        if not all_data:
            logger.warning("没有查询到数据，无法生成报表")
            raise ValueError("没有查询到数据，无法生成报表")

        try:
            # 模式一：为单个企业生成报表
            if isinstance(enterprise_ids, int):
                wb = openpyxl.load_workbook(self.template_path)
                ws = wb.active
                for i, record in enumerate(all_data, start=1):
                    record['序号'] = i
                self._populate_sheet(ws, all_data, year_month, platform_company, credit_code)
                wb.save(output_path)
                logger.info(f"单企业报表已生成: {output_path}")

            # 模式二：为多个企业生成报表
            else:
                grouped_data = defaultdict(list)
                for record in all_data:
                    grouped_data[record['enterprise_name']].append(record)

                output_wb = openpyxl.load_workbook(self.template_path)
                template_ws = output_wb.active
                template_sheet_name = template_ws.title

                if grouped_data:
                    for enterprise_name, records in grouped_data.items():
                        ws = output_wb.copy_worksheet(template_ws)
                        safe_name = "".join(c for c in enterprise_name if c not in r'[]:*?/\ ')
                        ws.title = safe_name[:31]

                        for i, record in enumerate(records, start=1):
                            record['序号'] = i

                        # 传递平台企业和信用代码参数
                        self._populate_sheet(ws, records, year_month, platform_company, credit_code)

                    if template_sheet_name in output_wb.sheetnames:
                        del output_wb[template_sheet_name]

                output_wb.save(output_path)
                logger.info(f"多企业报表已生成: {output_path}")

            return str(output_path)

        except Exception as e:
            logger.error(f"生成报表时出错: {str(e)}", exc_info=True)
            raise