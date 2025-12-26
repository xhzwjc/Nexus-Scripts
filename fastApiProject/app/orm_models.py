from sqlalchemy import Column, Integer, String, DECIMAL, BigInteger
from .database import Base

class BizBalanceWorker(Base):
    __tablename__ = "biz_balance_worker"

    id = Column(BigInteger, primary_key=True, index=True)
    tenant_id = Column(BigInteger, index=True)
    tax_id = Column(BigInteger, index=True)
    pay_amount = Column(DECIMAL(20, 2))
    pay_status = Column(Integer)  # 2, 3
    confirm_pay_status = Column(Integer)  # 0, 1

class BizCapitalDetail(Base):
    __tablename__ = "biz_capital_detail"

    id = Column(BigInteger, primary_key=True, index=True)
    tenant_id = Column(BigInteger, index=True)
    tax_id = Column(BigInteger, index=True)
    trade_amount = Column(DECIMAL(20, 2))
    trade_type = Column(Integer)  # 1
    deleted = Column(Integer, default=0)

class BizEnterpriseTax(Base):
    __tablename__ = "biz_enterprise_tax"

    id = Column(BigInteger, primary_key=True, index=True)
    tenant_id = Column(BigInteger, index=True)
    tax_id = Column(BigInteger, index=True)
    enterprise_name = Column(String(255))
    tax_address = Column(String(255))
    account_balance = Column(DECIMAL(20, 2))
    deleted = Column(Integer, default=0)
