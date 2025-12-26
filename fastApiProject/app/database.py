from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from urllib.parse import quote_plus
from .config import settings

# 获取当前环境的数据库配置
env = "test"  # 默认为测试环境，实际应根据配置或环境变量动态获取
db_config = settings.get_db_config(env)

SQLALCHEMY_DATABASE_URL = (
    f"mysql+pymysql://{db_config['user']}:{quote_plus(db_config['password'])}@"
    f"{db_config['host']}:{db_config['port']}/{db_config['database']}"
    "?charset=utf8mb4"
)

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
