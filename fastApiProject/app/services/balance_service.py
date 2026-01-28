import logging
from urllib.parse import quote_plus
from typing import List
import pandas as pd
import sqlalchemy
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, InvalidRequestError
from concurrent.futures import ThreadPoolExecutor
from ..config import settings

logger = logging.getLogger(__name__)

class AccountBalanceService:
    def __init__(self, environment: str = None):
        self.environment = settings.resolve_environment(environment)
        self.db_config = settings.get_db_config(self.environment)
        self.engine = self._init_db_connection()

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
            connect_args={"connect_timeout": 10, "read_timeout": 600}
        )
        # 测试连接
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info(f"数据库连接成功 (环境: {self.environment})")
        return engine
        # except Exception as e:
        #     logger.error(f"数据库连接失败: {str(e)}")
        #     raise ConnectionError(f"数据库连接失败: {str(e)}")

    def _build_query(self, tenant_id: int = None) -> str:
        """构建查询SQL（原脚本SQL逻辑）"""
        return f"""
        WITH deduction_amounts AS (
            SELECT 
                tenant_id,
                tax_id as tax_location_id,
                SUM(ROUND(pay_amount, 2)) AS total_deductions
            FROM biz_balance_worker 
            WHERE 1=1 {f"AND tenant_id = {tenant_id}" if tenant_id else ""}
                AND ((pay_status IN (2, 3)) or (pay_status = 0 and confirm_pay_status = 1))
            GROUP BY tenant_id, tax_id
        ),
        recharge_amounts AS (
            SELECT 
                tenant_id,
                tax_id as tax_location_id,
                SUM(ROUND(trade_amount, 2)) AS total_recharges
            FROM biz_capital_detail 
            WHERE trade_type = 1 AND deleted = 0  {f"AND tenant_id = {tenant_id}" if tenant_id else ""}
            GROUP BY tenant_id, tax_id
        ),
        refund_amounts AS (
            SELECT 
                tenant_id,
                tax_id as tax_location_id,
                SUM(ABS(ROUND(trade_amount, 2))) AS total_refunds
            FROM biz_capital_detail 
            WHERE trade_type = 4 AND deleted = 0  {f"AND tenant_id = {tenant_id}" if tenant_id else ""}
            GROUP BY tenant_id, tax_id
        )
        SELECT 
            e.tax_id as tax_location_id,
            e.tenant_id,
            e.enterprise_name,
            e.tax_address,
            COALESCE(d.total_deductions, 0) AS total_deductions,
            COALESCE(r.total_recharges, 0) AS total_recharges,
            COALESCE(f.total_refunds, 0) AS total_refunds,
            ROUND(e.account_balance, 2) AS actual_balance
        FROM biz_enterprise_tax e
        LEFT JOIN deduction_amounts d ON e.tax_id = d.tax_location_id AND e.tenant_id = d.tenant_id
        LEFT JOIN recharge_amounts r ON e.tax_id = r.tax_location_id AND e.tenant_id = r.tenant_id
        LEFT JOIN refund_amounts f ON e.tax_id = f.tax_location_id AND e.tenant_id = f.tenant_id
        WHERE e.deleted = 0 {f"AND e.tenant_id = {tenant_id}" if tenant_id else ""}
        """

    def verify_balances(self, tenant_id: int = None) -> List[dict]:
        """验证余额（原脚本核心计算逻辑）"""

        def run_query():
            query = self._build_query(tenant_id)
            print(query)
            return pd.read_sql(query, self.engine)

        try:
            df = run_query()
        except (OperationalError, InvalidRequestError) as e:
            logger.warning(f"连接异常，尝试重新连接: {str(e)}")
            self.engine.dispose()
            self.engine = self._init_db_connection()
            df = run_query()
            df = run_query()

        # 统一填充NaN为0，避免JSON序列化报错
        df = df.fillna(0)

        if df.empty:
            logger.info(f"未找到企业ID {tenant_id} 的数据" if tenant_id else "未找到任何企业数据")
            return []

        results = []
        for _, row in df.iterrows():
            # 辅助函数：安全转换float，处理NaN
            def safe_float(val):
                if pd.isna(val) or val is None:
                    return 0.0
                return float(val)

            expected = round(safe_float(row['total_recharges']) - safe_float(row['total_deductions']) - safe_float(row['total_refunds']), 2)
            if expected == 0:
                expected = 0.0
            actual = round(safe_float(row['actual_balance']), 2)
            results.append({
                "tax_location_id": row['tax_location_id'],
                "tenant_id": row['tenant_id'],
                "tax_address": row['tax_address'],
                "enterprise_name": row['enterprise_name'],
                "is_correct": round(actual - expected, 2) == 0,
                "total_deductions": round(safe_float(row['total_deductions']), 2),
                "total_recharges": round(safe_float(row['total_recharges']), 2),
                "total_refunds": round(safe_float(row['total_refunds']), 2),
                "expected_balance": expected,
                "actual_balance": actual,
                "balance_diff": round(actual - expected, 2)
            })
        return results

    def verify_balances_with_timeout(self, tenant_id: int = None, timeout: int = 15) -> List[dict]:
        """带超时的验证（原脚本超时逻辑）"""
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(self.verify_balances, tenant_id)
            try:
                return future.result(timeout=timeout)
            except Exception as e:
                logger.error(f"企业ID {tenant_id} 核对超时: {str(e)}" if tenant_id else f"批量核对超时: {str(e)}")
                raise TimeoutError(f"查询超时，企业ID {tenant_id}" if tenant_id else "批量查询超时")
