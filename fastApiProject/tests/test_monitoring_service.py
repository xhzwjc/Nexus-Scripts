from app.services.monitoring_service import (
    LOCAL_AGENT_HOST_ALIASES,
    ServerConfig,
    _normalize_legacy_local_servers,
    _resolve_host_candidates,
)


def test_normalize_legacy_local_servers_merges_to_single_local_agent():
    servers = [
        ServerConfig(id="local-windows-dev", name="dev", host="127.0.0.1", port=9200, enabled=True),
        ServerConfig(id="local-windows-docker", name="docker", host="host.docker.internal", port=9200, enabled=False),
        ServerConfig(id="prod-a", name="prod", host="10.0.0.8", port=9200, enabled=True),
    ]

    normalized = _normalize_legacy_local_servers(servers)

    assert len(normalized) == 2
    assert normalized[0].id == "local-agent"
    assert normalized[0].enabled is True
    for alias in LOCAL_AGENT_HOST_ALIASES:
        assert alias in normalized[0].host_candidates
    assert normalized[1].id == "prod-a"


def test_resolve_host_candidates_prefers_host_aliases_on_host_runtime(monkeypatch):
    monkeypatch.setattr("app.services.monitoring_service._running_in_docker", lambda: False)
    server = ServerConfig(
        id="local-agent",
        name="本机",
        host="host.docker.internal",
        host_candidates=["localhost", "127.0.0.1"],
    )

    assert _resolve_host_candidates(server)[:3] == ["127.0.0.1", "localhost", "host.docker.internal"]


def test_resolve_host_candidates_prefers_host_aliases_in_docker(monkeypatch):
    monkeypatch.setattr("app.services.monitoring_service._running_in_docker", lambda: True)
    server = ServerConfig(
        id="local-agent",
        name="本机",
        host="127.0.0.1",
        host_candidates=["localhost", "host.docker.internal"],
    )

    assert _resolve_host_candidates(server)[:3] == ["host.docker.internal", "127.0.0.1", "localhost"]
