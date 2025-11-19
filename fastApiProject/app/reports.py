import pymysql
import openpyxl
from openpyxl.styles import Border, Side, Alignment, Font
from openpyxl.worksheet.worksheet import Worksheet
from openpyxl.utils.cell import range_boundaries
import datetime
from cn2an import an2cn
from typing import List, Dict, Optional, Union
from collections import defaultdict
from pathlib import Path
import logging
from .config import settings
from .utils import DatabaseManager

logger = logging.getLogger(__name__)


class TaxReportGenerator:
    # 默认值配置
    DEFAULT_COMPANY = "云策企服（驻马店）人力资源服务有限公司"
    DEFAULT_CREDIT_CODE = "91411700MAEFDQ7P7T"
    # 模板字体配置（与Excel模板保持一致）
    DEFAULT_FONT = Font(name='宋体', size=10)
    DATA_FONT = Font(name='宋体', size=9)
    BOLD_FONT = Font(name='宋体', size=10, bold=True)

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
                f"Excel模板文件未找到，请确保文件存在于: {template_path}\n"
                "解决方案：\n"
                "1. 在项目目录中创建 `app/templates/` 文件夹\n"
                f"2. 将您的模板文件复制到该文件夹并重命名为 `tax_template.xlsx`"
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
        allowed_amount_fields = {
            1: 'pay_amount',
            2: 'worker_pay_amount',
            3: 'bill_amount'
        }
        amount_field = allowed_amount_fields.get(amount_type)
        if not amount_field:
            raise ValueError(f"无效的 amount_type: {amount_type}")

        try:
            with DatabaseManager(self.db_config) as conn:
                with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                    # 【优化】将默认值直接在SQL中赋予，简化后续处理
                    sql = f"""
                    SELECT
                        realname AS 纳税人姓名,
                        credential_num AS 身份证号,
                        ROUND({amount_field}, 2) AS 营业额_元,
                        ROUND(tax_amount, 2) AS tax_amount,
                        enterprise_name,
                        enterprise_id,
                        tax_id AS 税地ID,
                        tax_address AS 税地名称,
                        service_pay_status,
                        tax_pay_status,
                        0.00 AS 增值税_元,
                        0.00 AS 教育费附加_元,
                        0.00 AS 地方教育附加_元,
                        0.00 AS 城市维护建设费_元,
                        0.00 AS 个人经营所得税税率,
                        0.00 AS 应纳个人经营所得税_元,
                        enterprise_name AS 备注
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
                    cursor.execute(sql, tuple(params))
                    return cursor.fetchall()
        except Exception as e:
            logger.error(f"数据库查询错误: {str(e)}")
            return []

    def is_merged(self, ws: Worksheet, merge_range: str) -> bool:
        """检查单元格范围是否已合并"""
        return merge_range in [str(r) for r in ws.merged_cells.ranges]

    def safe_write_merged_cell(self, ws: Worksheet, start_cell: str, value, merge_range: Optional[str] = None,
                               bold: bool = False, align: str = 'center', font: Optional[Font] = None):
        """安全写入合并单元格，并可设置对齐方式和字体"""
        alignment = Alignment(horizontal=align, vertical='center', wrap_text=True)
        cell_font = font if font else (self.BOLD_FONT if bold else self.DEFAULT_FONT)

        if merge_range:
            if self.is_merged(ws, merge_range):
                ws.unmerge_cells(merge_range)
            ws.merge_cells(merge_range)
            first_cell = ws[start_cell]
            first_cell.value = value
            first_cell.font = cell_font
            first_cell.alignment = alignment
            for row in ws[merge_range]:
                for cell in row:
                    cell.font = cell_font
                    cell.alignment = alignment
        else:
            cell = ws[start_cell]
            cell.value = value
            cell.font = cell_font
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

    def _setup_print_settings(self, ws: Worksheet, total_row_idx: int):
        """设置页面打印相关配置"""
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE
        ws.page_margins.left = 0.3
        ws.page_margins.right = 0.3
        ws.page_margins.top = 0.5
        ws.page_margins.bottom = 0.5
        ws.page_margins.header = 0.2
        ws.page_margins.footer = 0.2
        ws.page_setup.scale = 90
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = False
        ws.print_area = f"A1:M{total_row_idx}"

        # 【修复】打印标题行的正确设置方式，不带美元符号
        ws.print_title_rows = '48:48'

    def _adjust_row_heights_and_column_widths(self, ws: Worksheet, data_length: int):
        """调整行高和列宽以适应内容"""
        column_widths = {
            'A': 5, 'B': 18, 'C': 18, 'D': 6, 'E': 10, 'F': 9, 'G': 9,
            'H': 9, 'I': 9, 'J': 10, 'K': 10, 'L': 22, 'M': 8
        }
        for col, width in column_widths.items():
            ws.column_dimensions[col].width = width
            ws.column_dimensions[col].hidden = False  # 确保列可见

        # 调整数据区域和合计行的行高
        start_row = 49  # 数据开始行
        for row in range(start_row, start_row + data_length):
            ws.row_dimensions[row].height = 30

        total_row_idx = start_row + data_length
        ws.row_dimensions[total_row_idx].height = 25

    def _clear_data_region_merges(self, ws: Worksheet, data_start_row: int = 49):
        """清理模板中数据区域的合并单元格，避免导出的Excel被修复"""
        ranges_to_clear = []
        for merge_range in list(ws.merged_cells.ranges):
            min_col, min_row, max_col, max_row = range_boundaries(str(merge_range))
            if min_row >= data_start_row:
                ranges_to_clear.append(str(merge_range))

        for merge_range in ranges_to_clear:
            ws.unmerge_cells(merge_range)

    def _populate_sheet(self, ws: Worksheet, data: List[Dict], year_month: str,
                        platform_company: Optional[str] = None,
                        credit_code: Optional[str] = None):
        """用给定数据填充单个工作表"""
        if not data:
            return

        # 清理模板在数据区域遗留的合并，避免不同Excel软件解析不一致
        self._clear_data_region_merges(ws)

        company = platform_company or self.DEFAULT_COMPANY
        code = credit_code or self.DEFAULT_CREDIT_CODE
        today_cn = datetime.datetime.now().strftime('%Y年%m月%d日')
        year_month_cn = year_month.replace('-', '年') + '月'
        enterprise_name = data[0]['enterprise_name']

        # 1. 填写静态信息
        self.safe_write_merged_cell(ws, 'D10', company, 'D10:H10', align='right')
        self.safe_write_merged_cell(ws, 'D12', code, 'D12:H12', align='right')
        self.safe_write_merged_cell(ws, 'D8', year_month_cn, 'D8:H9', align='right')
        self.safe_write_merged_cell(ws, 'D14', today_cn, 'D14:H15', align='right')
        ws['C35'].value, ws['C36'].value = company, code
        ws['C37'].value, ws['C38'].value = today_cn, year_month_cn
        ws['C44'].value = enterprise_name

        # 2. 填充个人所得税纳税清单
        start_row = 49
        total_amount = 0.0

        # 统一设置数据区域字体和对齐
        for i, record in enumerate(data, start=0):
            row_idx = start_row + i
            ws[f'A{row_idx}'].value = record['序号']
            ws[f'B{row_idx}'].value = record['纳税人姓名']
            ws[f'C{row_idx}'].value = record['身份证号']
            ws[f'E{row_idx}'].value = record['营业额_元']
            ws[f'F{row_idx}'].value = record['增值税_元']
            ws[f'G{row_idx}'].value = record['教育费附加_元']
            ws[f'H{row_idx}'].value = record['地方教育附加_元']
            ws[f'I{row_idx}'].value = record['城市维护建设费_元']
            ws[f'J{row_idx}'].value = record['个人经营所得税税率']
            ws[f'K{row_idx}'].value = record['应纳个人经营所得税_元']
            ws[f'L{row_idx}'].value = record['备注']

            # 设置格式
            ws[f'C{row_idx}'].number_format = '@'
            ws[f'E{row_idx}'].number_format = '0.00'
            ws[f'F{row_idx}'].number_format = '0.00'
            ws[f'G{row_idx}'].number_format = '0.00'
            ws[f'H{row_idx}'].number_format = '0.00'
            ws[f'I{row_idx}'].number_format = '0.00'
            ws[f'J{row_idx}'].number_format = '0.00%'
            ws[f'K{row_idx}'].number_format = '0.00'

            # 统一应用字体和对齐
            for col in "ABCDEFFGHIJKLM":
                cell = ws[f'{col}{row_idx}']
                cell.font = self.DATA_FONT
                cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

            # 恢复身份证号 (C/D) 与备注 (L/M) 列的合并展示
            id_merge_range = f'C{row_idx}:D{row_idx}'
            remark_merge_range = f'L{row_idx}:M{row_idx}'
            for merge_range in (id_merge_range, remark_merge_range):
                if self.is_merged(ws, merge_range):
                    ws.unmerge_cells(merge_range)
            ws.merge_cells(id_merge_range)
            ws.merge_cells(remark_merge_range)

            total_amount += float(record['营业额_元'])

        # 3. 写入合计行
        total_row_idx = start_row + len(data)
        amount_cn = self.amount_to_cn(total_amount)
        formatted_total = self.format_currency(total_amount)

        self.safe_write_merged_cell(ws, f'A{total_row_idx}', '合计：', f'A{total_row_idx}:D{total_row_idx}', bold=True)
        self.safe_write_merged_cell(ws, f'E{total_row_idx}', formatted_total, f'E{total_row_idx}:F{total_row_idx}',
                                    bold=True)
        self.safe_write_merged_cell(ws, f'G{total_row_idx}', amount_cn, f'G{total_row_idx}:M{total_row_idx}', bold=True)
        self.safe_write_merged_cell(ws, 'J45', amount_cn, 'J45:M45', bold=True)

        # 4. 添加边框
        self.add_border(ws, start_row - 1, total_row_idx,
                        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'])

        # 5. 调整布局和打印设置
        self._adjust_row_heights_and_column_widths(ws, len(data))
        self._setup_print_settings(ws, total_row_idx)

    def generate_tax_report(self, year_month: str, output_path: Union[str, Path],
                            enterprise_ids: Optional[Union[int, List[int], str]] = None,
                            amount_type: int = 1,
                            platform_company: Optional[str] = None,
                            credit_code: Optional[str] = None):
        """
        生成税务报表
        - output_path: 输出文件路径
        - enterprise_ids: 企业ID或ID列表
        - amount_type: 金额类型 (1=含服务费, 2=不含服务费, 3=账单金额)
        - platform_company: 平台企业名称（可选，不传则使用默认值）
        - credit_code: 社会统一信用代码（可选，不传则使用默认值）
        """
        output_path = Path(output_path) if isinstance(output_path, str) else output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)

        all_data = self.query_tax_data(year_month, enterprise_ids, amount_type)
        if not all_data:
            logger.warning("没有查询到数据，无法生成报表")
            raise ValueError("没有查询到数据，无法生成报表")

        try:
            # 【优化】统一处理逻辑，不再区分单个或多个企业
            grouped_data = defaultdict(list)
            for record in all_data:
                grouped_data[record['enterprise_name']].append(record)

            output_wb = openpyxl.load_workbook(self.template_path)
            template_ws = output_wb.active
            template_sheet_name = template_ws.title

            for enterprise_name, records in grouped_data.items():
                ws = output_wb.copy_worksheet(template_ws)
                # 确保工作表名称合法
                safe_name = "".join(c for c in enterprise_name if c not in r'[]:*?/\ ')
                ws.title = safe_name[:31]  # Excel工作表名称最大长度为31字符

                for i, record in enumerate(records, start=1):
                    record['序号'] = i

                self._populate_sheet(ws, records, year_month, platform_company, credit_code)

            # 所有企业复制完成后再删除模板，避免复制过程中缺失基础格式
            if template_sheet_name in output_wb.sheetnames:
                del output_wb[template_sheet_name]

            output_wb.save(output_path)
            logger.info(f"报表已生成: {output_path}")
            return str(output_path)

        except Exception as e:
            logger.error(f"生成报表时出错: {str(e)}", exc_info=True)
            raise
