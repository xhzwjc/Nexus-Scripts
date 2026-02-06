from sqlalchemy import Column, Integer, String, DECIMAL, BigInteger, DateTime, Text
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


# ==================== Team Resources ====================

class TeamResourceGroup(Base):
    """团队资源 - 集团表"""
    __tablename__ = "team_resource_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(String(50), unique=True, index=True)  # 原有字符串 ID
    name = Column(String(100), nullable=False)
    logo = Column(Text)  # Base64 或 URL，可能较大，使用 Text 类型
    sort_order = Column(Integer, default=99)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted = Column(Integer, default=0)


class TeamResourceSystem(Base):
    """团队资源 - 系统表"""
    __tablename__ = "team_resource_systems"

    id = Column(Integer, primary_key=True, autoincrement=True)
    system_id = Column(String(50), unique=True, index=True)  # 原有字符串 ID
    group_id = Column(String(50), index=True)  # 关联集团
    name = Column(String(100), nullable=False)
    description = Column(String(500))
    sort_order = Column(Integer, default=99)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted = Column(Integer, default=0)


class TeamResourceEnvironment(Base):
    """团队资源 - 环境表"""
    __tablename__ = "team_resource_environments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    system_id = Column(String(50), index=True)  # 关联系统
    env_type = Column(String(10))  # 'dev', 'test', 'prod'
    url = Column(String(500))
    admin_url = Column(String(500))
    skip_health_check = Column(Integer, default=0)
    skip_cert_check = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted = Column(Integer, default=0)


class TeamResourceCredential(Base):
    """团队资源 - 凭证表"""
    __tablename__ = "team_resource_credentials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cred_id = Column(String(50), index=True)  # 原有字符串 ID
    environment_id = Column(Integer, index=True)  # 关联环境表的 id
    label = Column(String(100))
    username = Column(String(100))
    password = Column(String(200))  # 明文存储
    note = Column(String(500))
    sort_order = Column(Integer, default=99)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted = Column(Integer, default=0)
