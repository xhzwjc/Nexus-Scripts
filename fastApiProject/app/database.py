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


def _int_env(name: str, default: int, *, minimum: int) -> int:
    raw = os.getenv(name)
    try:
        value = int(raw) if raw not in (None, "") else default
    except (TypeError, ValueError):
        value = default
    return max(minimum, value)


DB_POOL_SIZE = _int_env("DB_POOL_SIZE", 10, minimum=1)
DB_MAX_OVERFLOW = _int_env("DB_MAX_OVERFLOW", 5, minimum=0)
DB_POOL_TIMEOUT = _int_env("DB_POOL_TIMEOUT", 30, minimum=1)
DB_POOL_RECYCLE = _int_env("DB_POOL_RECYCLE", 600, minimum=60)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=DB_POOL_SIZE,
    max_overflow=DB_MAX_OVERFLOW,
    pool_timeout=DB_POOL_TIMEOUT,
    pool_recycle=DB_POOL_RECYCLE,  # 测试/容器环境常有短连接回收，主动换连接避免 MySQL gone away
    pool_pre_ping=True,
    pool_use_lifo=True,    # 配合 pre_ping，优先复用热连接，闲置连接被服务端断开时自动重连
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
