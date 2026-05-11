import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from urllib.parse import quote_plus
from .config import settings

# 获取当前环境的数据库配置
db_config = settings.get_db_config()

SQLALCHEMY_DATABASE_URL = (
    f"mysql+pymysql://{db_config['user']}:{quote_plus(db_config['password'])}@"
    f"{db_config['host']}:{db_config['port']}/{db_config['database']}"
    "?charset=utf8mb4"
)

# 打印正在使用的数据库（方便调试）
# print(f"--- [DATABASE] Environment: {os.getenv('ENVIRONMENT', 'local')} ---")
# print(f"--- [DATABASE] Connecting to: {db_config['host']}:{db_config['port']}/{db_config['database']} ---")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=20,          # 4 workers × 8 screening threads = 32 并发，pool 需覆盖
    max_overflow=20,       # 总上限 40，留余量给 API 请求
    pool_timeout=10,       # 快速失败，不长时间等待连接
    pool_recycle=1800,     # 容器环境下更积极回收，避免被网络设备断开
    pool_pre_ping=True,
    connect_args={"init_command": "SET SESSION innodb_lock_wait_timeout=5"},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
