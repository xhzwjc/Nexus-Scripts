import json
import os
from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def _running_in_docker() -> bool:
    return os.path.exists("/.dockerenv")


def _normalize_local_host(host: Optional[str]) -> Optional[str]:
    if not host:
        return host

    normalized = host.strip()
    docker_host = (os.getenv("DB_LOCAL_HOST_DOCKER") or "host.docker.internal").strip()
    local_aliases = {"localhost", "127.0.0.1", "::1"}

    if normalized == docker_host and not _running_in_docker():
        return "127.0.0.1"

    if normalized in local_aliases and _running_in_docker():
        return docker_host

    return normalized


def _parse_env_list(value: Optional[str]) -> list[str]:
    if not value:
        return []

    raw = value.strip()
    if not raw:
        return []

    if raw.startswith("["):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = []
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
        return []

    return [item.strip() for item in raw.split(",") if item.strip()]


class ServiceGateway:
    """统一服务路由与网关生成器：单一事实来源 (SSOT)"""

    # 基础协议、域名与端口底座配置（可由环境变量全局控制）
    DEFAULT_TEST_DOMAIN = os.getenv("TEST_HOST_DOMAIN") or "seedlingintl.com"
    DEFAULT_TEST_PORT = os.getenv("TEST_HOST_PORT") or "80"
    DEFAULT_TEST_PROTOCOL = os.getenv("TEST_HOST_PROTOCOL") or "http"
    DEFAULT_TEST_PREFIX = os.getenv("TEST_HOST_PREFIX") or "fwos"

    DEFAULT_PROD_DOMAIN = os.getenv("PROD_HOST_DOMAIN") or "seedlingintl.com"
    DEFAULT_PROD_PORT = os.getenv("PROD_HOST_PORT") or "443"
    DEFAULT_PROD_PROTOCOL = os.getenv("PROD_HOST_PROTOCOL") or "https"

    @classmethod
    def _build_test_origin(cls, subdomain_segment: str = "") -> str:
        """根据环境变量底座动态构建测试环境的主机 Origin"""
        prefix = cls.DEFAULT_TEST_PREFIX
        sub = f"{prefix}-{subdomain_segment}-test" if subdomain_segment else f"{prefix}-test"
        port_part = f":{cls.DEFAULT_TEST_PORT}" if cls.DEFAULT_TEST_PORT not in ("80", "443", "") else ""
        return f"{cls.DEFAULT_TEST_PROTOCOL}://{sub}.{cls.DEFAULT_TEST_DOMAIN}{port_part}"

    @classmethod
    def get_service_url(cls, service_name: str, env: str = "test", path: str = "") -> str:
        """
        获取指定环境和服务的根 URL。
        service_name 支持:
        - "client" / "client-api": 客户端接口
        - "admin" / "admin-api" / "smp": 后台管理接口
        - "applet" / "applet-api" / "delivery": 小程序/交付物移动端接口
        - "chl-api" / "channel-api": 渠道接口
        - "chl-web" / "channel-web": 渠道前台 Web
        - "sms-template": 短信模板接口
        - "web": 前台测试站点
        """
        env_norm = (env or "test").lower()
        if env_norm == "prod":
            if service_name in ("client", "client-api"):
                base = os.getenv("BASE_URL_PROD") or "https://client-api.seedlingintl.com"
            elif service_name in ("admin", "admin-api", "smp", "applet", "applet-api", "delivery"):
                base = os.getenv("BASE_URL_PROD_APP") or os.getenv("SMS_ADMIN_API_URL_PROD", "").replace("/admin-api", "") or "https://smp-api.seedlingintl.com"
            elif service_name in ("chl-api", "channel-api"):
                base = os.getenv("BASE_URL_PROD_CHL_API") or "https://chl-api.seedlingintl.com"
            elif service_name in ("chl-web", "channel-web"):
                base = os.getenv("BASE_URL_PROD_CHL_WEB") or "https://chl.seedlingintl.com"
            elif service_name == "sms-template":
                base = os.getenv("SMS_API_BASE_PROD") or "https://smp-api.seedlingintl.com/admin-api/system/sms-template"
            elif service_name == "web":
                base = os.getenv("SMS_ORIGIN_PROD") or "https://fwos-test.seedlingintl.com"
            else:
                base = os.getenv("BASE_URL_PROD") or "https://client-api.seedlingintl.com"
        elif env_norm == "local":
            if service_name in ("client", "client-api"):
                base = os.getenv("BASE_URL_LOCAL") or os.getenv("BASE_URL_TEST") or cls._build_test_origin("client-api")
            elif service_name in ("admin", "admin-api", "smp", "applet", "applet-api", "delivery"):
                base = os.getenv("BASE_URL_LOCAL_APP") or os.getenv("BASE_URL_TEST_APP") or cls._build_test_origin("api")
            elif service_name in ("chl-api", "channel-api"):
                base = os.getenv("BASE_URL_LOCAL_CHL_API") or cls._build_test_origin("chl-api")
            elif service_name in ("chl-web", "channel-web"):
                base = os.getenv("BASE_URL_LOCAL_CHL_WEB") or cls._build_test_origin("chl")
            elif service_name == "sms-template":
                base = os.getenv("SMS_API_BASE_TEST") or f"{cls._build_test_origin('api')}/admin-api/system/sms-template"
            elif service_name == "web":
                base = os.getenv("SMS_ORIGIN_TEST") or cls._build_test_origin("")
            else:
                base = os.getenv("BASE_URL_LOCAL") or os.getenv("BASE_URL_TEST") or cls._build_test_origin("client-api")
        else:
            if service_name in ("client", "client-api"):
                base = os.getenv("BASE_URL_TEST") or cls._build_test_origin("client-api")
            elif service_name in ("admin", "admin-api", "smp", "applet", "applet-api", "delivery"):
                base = os.getenv("BASE_URL_TEST_APP") or cls._build_test_origin("api")
            elif service_name in ("chl-api", "channel-api"):
                base = os.getenv("BASE_URL_TEST_CHL_API") or cls._build_test_origin("chl-api")
            elif service_name in ("chl-web", "channel-web"):
                base = os.getenv("BASE_URL_TEST_CHL_WEB") or cls._build_test_origin("chl")
            elif service_name == "sms-template":
                base = os.getenv("SMS_API_BASE_TEST") or f"{cls._build_test_origin('api')}/admin-api/system/sms-template"
            elif service_name == "web":
                base = os.getenv("SMS_ORIGIN_TEST") or cls._build_test_origin("")
            else:
                base = os.getenv("BASE_URL_TEST") or cls._build_test_origin("client-api")

        base = base.rstrip("/")
        if path:
            clean_path = "/" + path.lstrip("/")
            return f"{base}{clean_path}"
        return base

    @classmethod
    def get_delivery_oss_host(cls, env: str = "test") -> str:
        env_norm = (env or "test").lower()
        if env_norm == "prod":
            return (os.getenv("DELIVERY_OSS_HOST_PROD") or "https://fwos-prod.oss-cn-beijing.aliyuncs.com").rstrip("/")
        return (os.getenv("DELIVERY_OSS_HOST_TEST") or "https://fwos-test.oss-cn-beijing.aliyuncs.com").rstrip("/")


class Settings:
    # API基础配置
    API_TITLE = "春苗系统结算API"
    API_VERSION = "1.0.0"
    DESCRIPTION = "春苗系统自动结算接口服务（含账户余额核对功能）"

    VALID_ENVIRONMENTS = {"test", "prod", "local"}

    # 服务基础URL配置（通过 ServiceGateway 统一管理，支持 .env 显式覆盖）
    @property
    def BASE_URL_TEST(self) -> str:
        return ServiceGateway.get_service_url("client", env="test")

    @property
    def BASE_URL_PROD(self) -> str:
        return ServiceGateway.get_service_url("client", env="prod")

    @property
    def BASE_URL_LOCAL(self) -> str:
        return ServiceGateway.get_service_url("client", env="local")

    # 默认环境 (local, test, prod)
    # 修改默认值为 local，确保在 Docker 或本地开发时默认连接本地库
    ENVIRONMENT = os.getenv("ENVIRONMENT", "local")

    # 账户余额核对 - 数据库配置（新增）
    # 测试环境数据库
    DB_TEST_HOST = os.getenv("DB_TEST_HOST")
    DB_TEST_PORT = int(os.getenv("DB_TEST_PORT", "3308"))
    DB_TEST_USER = os.getenv("DB_TEST_USER")
    DB_TEST_PASSWORD = os.getenv("DB_TEST_PASSWORD")
    DB_TEST_DATABASE = os.getenv("DB_TEST_DATABASE")

    # 生产环境数据库
    DB_PROD_HOST = os.getenv("DB_PROD_HOST")
    DB_PROD_PORT = int(os.getenv("DB_PROD_PORT", "3306"))
    DB_PROD_USER = os.getenv("DB_PROD_USER")
    DB_PROD_PASSWORD = os.getenv("DB_PROD_PASSWORD")
    DB_PROD_DATABASE = os.getenv("DB_PROD_DATABASE")

    # 本地环境数据库（可选，复用测试环境配置或单独配置）
    DB_LOCAL_HOST = os.getenv("DB_LOCAL_HOST", DB_TEST_HOST)
    DB_LOCAL_HOST_DOCKER = os.getenv("DB_LOCAL_HOST_DOCKER", "host.docker.internal")
    DB_LOCAL_PORT = int(os.getenv("DB_LOCAL_PORT", str(DB_TEST_PORT)))
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
        return ServiceGateway.get_service_url("client", env=env)

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
            local_host = _normalize_local_host(self.DB_LOCAL_HOST) or "127.0.0.1"
            return {
                "host": local_host,
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

    def get_cors_allow_origins(self) -> list[str]:
        configured = _parse_env_list(os.getenv("CORS_ALLOW_ORIGINS"))
        if configured:
            return configured
        return ["*"] if self.resolve_environment() == "local" else []

    @property
    def cors_allow_origins(self) -> list[str]:
        return self.get_cors_allow_origins()

    @property
    def cors_allow_origin_regex(self) -> Optional[str]:
        value = (os.getenv("CORS_ALLOW_ORIGIN_REGEX") or "").strip()
        return value or None

    # 短信服务配置
    @property
    def SMS_API_BASE_TEST(self) -> str:
        return ServiceGateway.get_service_url("sms-template", env="test")

    @property
    def SMS_API_BASE_PROD(self) -> str:
        return ServiceGateway.get_service_url("sms-template", env="prod")

    SMS_AUTH_TOKEN_TEST = os.getenv("SMS_AUTH_TOKEN_TEST")
    SMS_AUTH_TOKEN_PROD = os.getenv("SMS_AUTH_TOKEN_PROD")
    SMS_TENANT_ID = "1"

    @property
    def SMS_ORIGIN_TEST(self) -> str:
        return os.getenv("SMS_ORIGIN_TEST") or ServiceGateway.get_service_url("web", env="test")

    @property
    def SMS_ORIGIN_PROD(self) -> str:
        return os.getenv("SMS_ORIGIN_PROD") or ServiceGateway.get_service_url("web", env="prod")

    @property
    def SMS_REFERER_TEST(self) -> str:
        val = os.getenv("SMS_REFERER_TEST")
        if val:
            return val
        return f"{self.SMS_ORIGIN_TEST}/"

    @property
    def SMS_REFERER_PROD(self) -> str:
        val = os.getenv("SMS_REFERER_PROD")
        if val:
            return val
        return f"{self.SMS_ORIGIN_PROD}/"

    # Admin Login / Logs Config
    @property
    def SMS_ADMIN_API_URL_TEST(self) -> str:
        return os.getenv("SMS_ADMIN_API_URL_TEST") or ServiceGateway.get_service_url("admin", env="test", path="/admin-api")

    @property
    def SMS_ADMIN_API_URL_PROD(self) -> str:
        return os.getenv("SMS_ADMIN_API_URL_PROD") or ServiceGateway.get_service_url("admin", env="prod", path="/admin-api")

    SMS_ADMIN_TENANT_ID_TEST = os.getenv("SMS_ADMIN_TENANT_ID_TEST", "1")
    SMS_ADMIN_TENANT_ID_PROD = os.getenv("SMS_ADMIN_TENANT_ID_PROD", "1")
    SMS_ADMIN_TENANT_NAME_TEST = os.getenv("SMS_ADMIN_TENANT_NAME_TEST", "春苗")
    SMS_ADMIN_TENANT_NAME_PROD = os.getenv("SMS_ADMIN_TENANT_NAME_PROD", "春苗")
    SMS_ADMIN_USERNAME_TEST = os.getenv("SMS_ADMIN_USERNAME_TEST", "admin1")
    SMS_ADMIN_USERNAME_PROD = os.getenv("SMS_ADMIN_USERNAME_PROD", "admin")
    SMS_ADMIN_PASSWORD_TEST = os.getenv("SMS_ADMIN_PASSWORD_TEST")
    SMS_ADMIN_PASSWORD_PROD = os.getenv("SMS_ADMIN_PASSWORD_PROD")
    SMS_ADMIN_CAPTCHA_CODE = os.getenv("SMS_ADMIN_CAPTCHA_CODE", "chunmiao")
    SMS_ADMIN_CAPTCHA_ID = os.getenv("SMS_ADMIN_CAPTCHA_ID", "cc268ded9fda45c18463dfe78dd056be")

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
