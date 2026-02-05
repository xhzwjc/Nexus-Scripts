from sqlalchemy import Column, Integer, String, DECIMAL, BigInteger, DateTime
from sqlalchemy.sql import func
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

class AiCategory(Base):
    __tablename__ = "ai_categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(String(50), unique=True, index=True)  # 原有的 string ID
    name = Column(String(100), nullable=False)
    icon = Column(String(50))
    sort_order = Column(Integer, default=99)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted = Column(Integer, default=0)

class AiResource(Base):
    __tablename__ = "ai_resources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_id = Column(String(100), unique=True, index=True)  # 原有的 string ID
    name = Column(String(100), nullable=False)
    description = Column(String(1000))
    url = Column(String(500), nullable=False)
    logo_url = Column(String(500))
    category_id = Column(String(50), index=True)  # 被 AI 驱动的代码逻辑引用的分类 ID 字符串
    tags = Column(String(500))  # Stored as comma-separated
    sort_order = Column(Integer, default=99)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted = Column(Integer, default=0)
