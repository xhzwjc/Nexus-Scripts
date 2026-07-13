from pathlib import Path


NGINX_CONFIG = Path(__file__).resolve().parents[2] / "nginx" / "default.conf"


def _location_block(source: str, marker: str) -> str:
    start = source.index(marker)
    next_location = source.find("\n    location ", start + len(marker))
    return source[start:next_location if next_location >= 0 else len(source)]


def test_streaming_routes_precede_buffered_settings_routes():
    source = NGINX_CONFIG.read_text(encoding="utf-8")
    sse_marker = "location ~ ^/api/recruitment/(task-events|skills/generate-content"
    settings_marker = "location ~ ^/api/recruitment/(metadata|organization-scope|skills"

    assert source.index(sse_marker) < source.index(settings_marker)
    sse_block = _location_block(source, sse_marker)
    assert "proxy_http_version 1.1;" in sse_block
    assert "proxy_request_buffering off;" in sse_block
    assert "proxy_buffering off;" in sse_block


def test_rbac_and_settings_json_routes_use_keepalive_and_response_buffering():
    source = NGINX_CONFIG.read_text(encoding="utf-8")
    for marker in [
        "location ~ ^/api/(admin/rbac|auth/session)",
        "location ~ ^/api/recruitment/(metadata|organization-scope|skills",
    ]:
        block = _location_block(source, marker)
        assert "proxy_http_version 1.1;" in block
        assert 'proxy_set_header Connection "";' in block
        assert "proxy_buffering on;" in block
        assert "proxy_cache off;" in block


def test_performance_access_log_keeps_request_and_upstream_timing():
    source = NGINX_CONFIG.read_text(encoding="utf-8")

    assert "log_format performance" in source
    assert "request_time=$request_time" in source
    assert "upstream_time=$upstream_response_time" in source
    assert "access_log /var/log/nginx/access.log performance;" in source
