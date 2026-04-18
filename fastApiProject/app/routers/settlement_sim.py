import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pymysql.cursors import DictCursor

from ..config import settings
from ..models import SettlementSimRequest, SettlementSimResponse
from ..utils import DatabaseManager
from ..script_hub_session import require_script_hub_permission

logger = logging.getLogger(__name__)
settlement_sim_router = APIRouter(tags=["结算状态模拟"])


def build_pay_over_time(year=None, month=None):
    """构建支付时间，年月用传入值，日时分秒用当前值"""
    now = datetime.now()
    y = year if year else now.year
    m = month if month else now.month
    return now.replace(year=y, month=m)


@settlement_sim_router.post("/settlement-sim/execute", response_model=SettlementSimResponse)
async def execute_settlement_sim(
    request: SettlementSimRequest,
    _session=None,
):
    """
    执行结算状态模拟操作

    四种 mode：
    - batch_no: 更新批次表+结算单表
    - balance_no: 只更新结算单表
    - batch_no_tax: 写入个税累计（按批次）
    - balance_no_tax: 写入个税累计（按结算单）
    """
    request_id = str(uuid.uuid4())
    logger.info(f"[结算模拟] 开始 | 请求ID: {request_id} | mode: {request.mode}")

    # 校验必填字段
    if request.mode in ("batch_no", "batch_no_tax") and not request.batch_no:
        raise HTTPException(status_code=400, detail="mode含batch_no时，batch_no不能为空")
    if request.mode in ("balance_no", "balance_no_tax") and not request.balance_no:
        raise HTTPException(status_code=400, detail="mode含balance_no时，balance_no不能为空")

    db_config = settings.get_db_config(request.env)
    pay_over_time = build_pay_over_time(request.year, request.month)
    pay_over_time_str = pay_over_time.strftime('%Y-%m-%d %H:%M:%S')

    try:
        with DatabaseManager(db_config) as conn:
            with conn.cursor(DictCursor) as cursor:
                affected_rows = 0

                if request.mode == "batch_no":
                    # 更新批次表
                    sql_batch = """
                        UPDATE biz_balance_batch
                        SET pay_status = %s, pay_over_time = %s, update_time = NOW()
                        WHERE batch_no = %s AND deleted = 0
                    """
                    cursor.execute(sql_batch, (request.pay_status_batch, pay_over_time, request.batch_no))
                    affected_rows += cursor.rowcount

                    # 更新结算单表
                    sql_worker = """
                        UPDATE biz_balance_worker
                        SET pay_status = %s, payment_over_time = %s, update_time = NOW()
                        WHERE batch_no = %s AND deleted = 0
                    """
                    cursor.execute(sql_worker, (request.pay_status_worker, pay_over_time, request.batch_no))
                    affected_rows += cursor.rowcount

                    conn.commit()

                elif request.mode == "balance_no":
                    # 只更新结算单表
                    sql_worker = """
                        UPDATE biz_balance_worker
                        SET pay_status = %s, payment_over_time = %s, update_time = NOW()
                        WHERE balance_no = %s AND deleted = 0
                    """
                    cursor.execute(sql_worker, (request.pay_status_worker, pay_over_time, request.balance_no))
                    affected_rows += cursor.rowcount

                    conn.commit()

                elif request.mode == "batch_no_tax":
                    # 写入个税累计（按批次）
                    sql_tax = """
                        INSERT INTO biz_worker_tax_amount
                            (worker_id, total_worker_amount, total_worker_tax_amount,
                             original_total_worker_tax_amount, continuous_month, year,
                             create_time, update_time, deleted, tax_rule)
                        SELECT
                            w.worker_id,
                            ROUND(w.bill_amount - COALESCE(w.worker_service_amount, 0), 2),
                            ROUND(w.tax_amount, 2),
                            ROUND(w.original_tax_amount, 2),
                            1,
                            YEAR(NOW()),
                            NOW(), NOW(), 0,
                            w.tax_rule
                        FROM biz_balance_worker w
                        WHERE w.deleted = 0
                          AND w.batch_no = %s
                          AND (w.tax_rule = 1 OR (w.tax_rule = 0 AND w.business_type = 2 AND w.report_type = 0))
                        ON DUPLICATE KEY UPDATE
                            total_worker_amount = total_worker_amount + VALUES(total_worker_amount),
                            total_worker_tax_amount = total_worker_tax_amount + VALUES(total_worker_tax_amount),
                            original_total_worker_tax_amount = original_total_worker_tax_amount + VALUES(original_total_worker_tax_amount),
                            update_time = NOW()
                    """
                    cursor.execute(sql_tax, (request.batch_no,))
                    affected_rows += cursor.rowcount

                    conn.commit()

                elif request.mode == "balance_no_tax":
                    # 写入个税累计（按结算单）
                    sql_tax = """
                        INSERT INTO biz_worker_tax_amount
                            (worker_id, total_worker_amount, total_worker_tax_amount,
                             original_total_worker_tax_amount, continuous_month, year,
                             create_time, update_time, deleted, tax_rule)
                        SELECT
                            w.worker_id,
                            ROUND(w.bill_amount - COALESCE(w.worker_service_amount, 0), 2),
                            ROUND(w.tax_amount, 2),
                            ROUND(w.original_tax_amount, 2),
                            1,
                            YEAR(NOW()),
                            NOW(), NOW(), 0,
                            w.tax_rule
                        FROM biz_balance_worker w
                        WHERE w.deleted = 0
                          AND w.balance_no = %s
                          AND (w.tax_rule = 1 OR (w.tax_rule = 0 AND w.business_type = 2 AND w.report_type = 0))
                        ON DUPLICATE KEY UPDATE
                            total_worker_amount = total_worker_amount + VALUES(total_worker_amount),
                            total_worker_tax_amount = total_worker_tax_amount + VALUES(total_worker_tax_amount),
                            original_total_worker_tax_amount = original_total_worker_tax_amount + VALUES(original_total_worker_tax_amount),
                            update_time = NOW()
                    """
                    cursor.execute(sql_tax, (request.balance_no,))
                    affected_rows += cursor.rowcount

                    conn.commit()

                else:
                    raise HTTPException(status_code=400, detail=f"未知mode: {request.mode}")

        logger.info(f"[结算模拟] 完成 | 请求ID: {request_id} | 影响行数: {affected_rows}")
        return SettlementSimResponse(
            success=True,
            affected_rows=affected_rows,
            pay_over_time=pay_over_time_str,
            message="操作成功"
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[结算模拟] 失败 | 请求ID: {request_id} | 错误: {str(exc)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"执行失败: {str(exc)}")
