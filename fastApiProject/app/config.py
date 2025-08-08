import json
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()


class Settings:
    # API基础配置
    API_TITLE = "春苗系统结算API"
    API_VERSION = "1.0.0"
    DESCRIPTION = "春苗系统自动结算接口服务（含账户余额核对功能）"

    # 服务基础URL配置
    BASE_URL_TEST = os.getenv("BASE_URL_TEST")
    BASE_URL_PROD = os.getenv("BASE_URL_PROD")
    BASE_URL_LOCAL = os.getenv("BASE_URL_LOCAL")

    # 默认环境 (test, prod, local)
    ENVIRONMENT = os.getenv("ENVIRONMENT", "prod")

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

    # 新增：允许临时设置环境的方法（核心修改）
    def set_environment(self, environment: str):
        """根据前端传入的环境参数临时覆盖当前环境"""
        if environment in ["test", "prod", "local"]:
            self.ENVIRONMENT = environment
        else:
            raise ValueError(f"不支持的环境：{environment}，仅支持 test/prod/local")

    # 以下属性和方法保持不变，但会使用动态更新后的 self.ENVIRONMENT
    @property
    def base_url(self):
        """根据环境获取基础URL"""
        if self.ENVIRONMENT == "prod":
            return self.BASE_URL_PROD
        elif self.ENVIRONMENT == "local":
            return self.BASE_URL_LOCAL
        return self.BASE_URL_TEST

    def get_db_config(self):
        """根据当前环境获取数据库配置（供账户余额核对使用）"""
        if self.ENVIRONMENT == "prod":
            return {
                "host": self.DB_PROD_HOST,
                "port": self.DB_PROD_PORT,
                "user": self.DB_PROD_USER,
                "password": self.DB_PROD_PASSWORD,
                "database": self.DB_PROD_DATABASE
            }
        elif self.ENVIRONMENT == "local":
            return {
                "host": self.DB_LOCAL_HOST,
                "port": self.DB_LOCAL_PORT,
                "user": self.DB_LOCAL_USER,
                "password": self.DB_LOCAL_PASSWORD,
                "database": self.DB_LOCAL_DATABASE
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

    # 预设手机号
    preset_mobiles_str = os.getenv("PRESET_MOBILES")
    if preset_mobiles_str:
        PRESET_MOBILES = json.loads(preset_mobiles_str)
    else:
        PRESET_MOBILES = []

    @property
    def sms_api_base_url(self):
        print("看看环境：",self.ENVIRONMENT)
        if self.ENVIRONMENT == "prod":
            return self.SMS_API_BASE_PROD
        return self.SMS_API_BASE_TEST

    @property
    def sms_auth_token(self):
        if self.ENVIRONMENT == "prod":
            return self.SMS_AUTH_TOKEN_PROD
        return self.SMS_AUTH_TOKEN_TEST

    @property
    def sms_origin(self):
        if self.ENVIRONMENT == "prod":
            return self.SMS_ORIGIN_PROD
        return self.SMS_ORIGIN_TEST

    @property
    def sms_referer(self):
        if self.ENVIRONMENT == "prod":
            return self.SMS_REFERER_PROD
        return self.SMS_REFERER_TEST

    @property
    def sms_headers(self):
        return {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Authorization': self.sms_auth_token,
            'Connection': 'keep-alive',
            'Origin': self.sms_origin,
            'Referer': self.sms_referer,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            'tenant-id': self.SMS_TENANT_ID
        }


# 创建配置实例
settings = Settings()