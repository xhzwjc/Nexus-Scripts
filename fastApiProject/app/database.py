import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
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
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=3600,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
