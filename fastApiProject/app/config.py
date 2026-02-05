import json
import os
from typing import Optional

from dotenv import load_dotenv

# 加载环境变量
load_dotenv()


class Settings:
    # API基础配置
    API_TITLE = "春苗系统结算API"
    API_VERSION = "1.0.0"
    DESCRIPTION = "春苗系统自动结算接口服务（含账户余额核对功能）"

    VALID_ENVIRONMENTS = {"test", "prod", "local"}

    # 服务基础URL配置
    BASE_URL_TEST = os.getenv("BASE_URL_TEST")
    BASE_URL_PROD = os.getenv("BASE_URL_PROD")
    BASE_URL_LOCAL = os.getenv("BASE_URL_LOCAL")

    # 默认环境 (local, test, prod)
    # 修改默认值为 local，确保在 Docker 或本地开发时默认连接本地库
    ENVIRONMENT = os.getenv("ENVIRONMENT", "local")

    # 账户余额核对 - 数据库配置（新增）
    # 测试环境数据库
    DB_TEST_HOST = os.getenv("DB_TEST_HOST")
    DB_TEST_PORT = int(os.getenv("DB_TEST_PORT"))
    DB_TEST_USER = os.getenv("DB_TEST_USER")
    DB_TEST_PASSWORD = os.getenv("DB_TEST_PASSWORD")
    DB_TEST_DATABASE = os.getenv("DB_TEST_DATABASE")

    # 生产环境数据库
    DB_PROD_HOST = os.getenv("DB_PROD_HOST")
    DB_PROD_PORT = int(os.getenv("DB_PROD_PORT"))
    DB_PROD_USER = os.getenv("DB_PROD_USER")
    DB_PROD_PASSWORD = os.getenv("DB_PROD_PASSWORD")
    DB_PROD_DATABASE = os.getenv("DB_PROD_DATABASE")

    # 本地环境数据库（可选，复用测试环境配置或单独配置）
    DB_LOCAL_HOST = os.getenv("DB_LOCAL_HOST", DB_TEST_HOST)
    DB_LOCAL_PORT = int(os.getenv("DB_LOCAL_PORT", DB_TEST_PORT))
    DB_LOCAL_USER = os.getenv("DB_LOCAL_USER", DB_TEST_USER)
    DB_LOCAL_PASSWORD = os.getenv("DB_LOCAL_PASSWORD", DB_TEST_PASSWORD)
    DB_LOCAL_DATABASE = os.getenv("DB_LOCAL_DATABASE", DB_TEST_DATABASE)

    def resolve_environment(self, environment: Optional[str] = None) -> str:
        """返回一个有效的环境标识，默认为全局配置"""
        if environment in self.VALID_ENVIRONMENTS:
            return environment  # type: ignore[return-value]
        return self.ENVIRONMENT

    # 新增：允许临时设置环境的方法（核心修改）
    def set_environment(self, environment: str):
        """根据前端传入的环境参数临时覆盖当前环境"""
        if environment not in self.VALID_ENVIRONMENTS:
            raise ValueError(f"不支持的环境：{environment}，仅支持 test/prod/local")
        self.ENVIRONMENT = environment

    def get_base_url(self, environment: Optional[str] = None) -> str:
        env = self.resolve_environment(environment)
        if env == "prod":
            return self.BASE_URL_PROD
        if env == "local":
            return self.BASE_URL_LOCAL
        return self.BASE_URL_TEST

    @property
    def base_url(self):
        """根据环境获取基础URL"""
        return self.get_base_url()

    def get_db_config(self, environment: Optional[str] = None):
        """根据当前环境获取数据库配置"""
        # 第一步：正常解析环境
        env = self.resolve_environment(environment)
        
        # 第二步：强行干预逻辑（针对 AI 资源本地化需求）
        # 只要 detected 到了本地数据库的配置，且没有被明确传入 'prod' 或 'test' 参数
        # 我们就认为用户是想访问本地库，不再受 ENVIRONMENT 变量的干扰
        local_db_name = os.getenv("DB_LOCAL_DATABASE")
        if not environment and local_db_name:
            # 只要配置了本地库名，就强行切换到 local 环境配置
            env = "local"

        if env == "prod":
            return {
                "host": self.DB_PROD_HOST,
                "port": self.DB_PROD_PORT,
                "user": self.DB_PROD_USER,
                "password": self.DB_PROD_PASSWORD,
                "database": self.DB_PROD_DATABASE
            }
        if env == "local":
            return {
                "host": self.DB_LOCAL_HOST,
                "port": self.DB_LOCAL_PORT,
                "user": self.DB_LOCAL_USER,
                "password": self.DB_LOCAL_PASSWORD,
                "database": self.DB_LOCAL_DATABASE or "db_fwos_local"
            }
        # 默认返回测试环境配置
        return {
            "host": self.DB_TEST_HOST,
            "port": self.DB_TEST_PORT,
            "user": self.DB_TEST_USER,
            "password": self.DB_TEST_PASSWORD,
            "database": self.DB_TEST_DATABASE
        }

    # 短信服务配置
    SMS_API_BASE_TEST = os.getenv("SMS_API_BASE_TEST")
    SMS_API_BASE_PROD = os.getenv("SMS_API_BASE_PROD")
    SMS_AUTH_TOKEN_TEST = os.getenv("SMS_AUTH_TOKEN_TEST")
    SMS_AUTH_TOKEN_PROD = os.getenv("SMS_AUTH_TOKEN_PROD")
    SMS_TENANT_ID = "1"
    SMS_ORIGIN_TEST = os.getenv("SMS_ORIGIN_TEST")
    SMS_ORIGIN_PROD = os.getenv("SMS_ORIGIN_PROD")
    SMS_REFERER_TEST = os.getenv("SMS_REFERER_TEST")
    SMS_REFERER_PROD = os.getenv("SMS_REFERER_PROD")

    # Admin Login / Logs Config
    SMS_ADMIN_API_URL_TEST = os.getenv("SMS_ADMIN_API_URL_TEST")
    SMS_ADMIN_API_URL_PROD = os.getenv("SMS_ADMIN_API_URL_PROD")
    SMS_ADMIN_TENANT_ID_TEST = os.getenv("SMS_ADMIN_TENANT_ID_TEST")
    SMS_ADMIN_TENANT_ID_PROD = os.getenv("SMS_ADMIN_TENANT_ID_PROD")
    SMS_ADMIN_TENANT_NAME_TEST = os.getenv("SMS_ADMIN_TENANT_NAME_TEST")
    SMS_ADMIN_TENANT_NAME_PROD = os.getenv("SMS_ADMIN_TENANT_NAME_PROD")
    SMS_ADMIN_USERNAME_TEST = os.getenv("SMS_ADMIN_USERNAME_TEST")
    SMS_ADMIN_USERNAME_PROD = os.getenv("SMS_ADMIN_USERNAME_PROD")
    SMS_ADMIN_PASSWORD_TEST = os.getenv("SMS_ADMIN_PASSWORD_TEST")
    SMS_ADMIN_PASSWORD_PROD = os.getenv("SMS_ADMIN_PASSWORD_PROD")
    SMS_ADMIN_CAPTCHA_CODE = os.getenv("SMS_ADMIN_CAPTCHA_CODE")
    SMS_ADMIN_CAPTCHA_ID = os.getenv("SMS_ADMIN_CAPTCHA_ID")

    # 预设手机号
    preset_mobiles_str = os.getenv("PRESET_MOBILES")
    if preset_mobiles_str:
        PRESET_MOBILES = json.loads(preset_mobiles_str)
    else:
        PRESET_MOBILES = []

    def get_sms_config(self, environment: Optional[str] = None) -> dict:
        env = self.resolve_environment(environment)
        if env == "prod":
            api_base = self.SMS_API_BASE_PROD
            token = self.SMS_AUTH_TOKEN_PROD
            origin = self.SMS_ORIGIN_PROD
            referer = self.SMS_REFERER_PROD
        else:
            api_base = self.SMS_API_BASE_TEST
            token = self.SMS_AUTH_TOKEN_TEST
            origin = self.SMS_ORIGIN_TEST
            referer = self.SMS_REFERER_TEST

        headers = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Authorization': token,
            'Connection': 'keep-alive',
            'Origin': origin,
            'Referer': referer,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'tenant-id': self.SMS_TENANT_ID
        }

        return {
            "environment": env,
            "api_base_url": api_base,
            "auth_token": token,
            "origin": origin,
            "referer": referer,
            "headers": headers
        }

    @property
    def sms_api_base_url(self):
        return self.get_sms_config()["api_base_url"]

    @property
    def sms_auth_token(self):
        return self.get_sms_config()["auth_token"]

    @property
    def sms_origin(self):
        return self.get_sms_config()["origin"]

    @property
    def sms_referer(self):
        return self.get_sms_config()["referer"]


    @property
    def sms_headers(self):
        return self.get_sms_config()["headers"]

    # AI Service Configuration
    AI_BASE_URL = os.getenv("AI_BASE_URL")
    AI_API_KEY = os.getenv("AI_API_KEY")
    AI_MODEL_NAME = os.getenv("AI_MODEL_NAME")


# 创建配置实例
settings = Settings()