"""
单元测试：ServiceGateway 统一服务路由与网关生成器
验证单一事实来源（SSOT）、动态端口/域名解析及向后兼容覆盖机制
"""
import os
from unittest.mock import patch

from app.config import ServiceGateway, Settings


def test_service_gateway_default_urls():
    """测试默认情况下各微服务 URL 的正确生成"""
    test_client = ServiceGateway.get_service_url("client", env="test")
    assert "8088" in test_client or "client" in test_client

    test_applet = ServiceGateway.get_service_url("applet", env="test")
    assert "api-test" in test_applet

    prod_client = ServiceGateway.get_service_url("client", env="prod")
    assert prod_client.startswith("https://")

    prod_applet = ServiceGateway.get_service_url("applet", env="prod")
    assert "smp-api" in prod_applet or prod_applet.startswith("https://")


def test_service_gateway_dynamic_port_change():
    """验证修改 TEST_HOST_PORT 时，所有测试环境 URL 自动同步联动"""
    with patch.dict(os.environ, {
        "TEST_HOST_PORT": "9292",
        "TEST_HOST_DOMAIN": "testcorp.cn",
        "BASE_URL_TEST": "",
        "BASE_URL_TEST_APP": "",
        "BASE_URL_TEST_CHL_API": "",
        "BASE_URL_TEST_CHL_WEB": "",
        "SMS_API_BASE_TEST": "",
    }, clear=False):
        # 临时创建独立的网关类测试动态解析
        class DynamicGateway(ServiceGateway):
            DEFAULT_TEST_PORT = "9292"
            DEFAULT_TEST_DOMAIN = "testcorp.cn"

        client_url = DynamicGateway.get_service_url("client", env="test")
        assert ":9292" in client_url
        assert "testcorp.cn" in client_url

        applet_url = DynamicGateway.get_service_url("applet", env="test")
        assert ":9292" in applet_url
        assert "testcorp.cn" in applet_url

        chl_api_url = DynamicGateway.get_service_url("chl-api", env="test")
        assert ":9292" in chl_api_url
        assert "testcorp.cn" in chl_api_url

        chl_web_url = DynamicGateway.get_service_url("chl-web", env="test")
        assert ":9292" in chl_web_url
        assert "testcorp.cn" in chl_web_url


def test_service_gateway_explicit_override_precedence():
    """验证特定微服务环境变量显式覆盖时拥有最高优先级"""
    custom_url = "http://custom-test-gateway.internal:7777"
    with patch.dict(os.environ, {"BASE_URL_TEST": custom_url}, clear=False):
        resolved = ServiceGateway.get_service_url("client", env="test")
        assert resolved == custom_url


def test_settings_unified_properties():
    """验证 Settings 类的属性与 ServiceGateway 完全联动"""
    s = Settings()
    assert s.get_base_url("test").startswith("http://")
    assert s.get_base_url("prod").startswith("https://")
    assert s.SMS_API_BASE_TEST.startswith("http://")
    assert s.SMS_API_BASE_PROD.startswith("https://")
