# Nexus Scripts

这是一个包含 `Next.js` 前端、`FastAPI` 后端、数据库访问、运维 Agent 与 Docker 部署的完整业务工具系统。

## 本地启动

推荐方式：

```bash
./start_services.sh
```

这个脚本会先加载根目录 `.env`，再分别启动：

- `my-app` 的 Next.js 开发服务
- `fastApiProject` 的 FastAPI 服务
- `fastApiProject/server_agent.py` 监控 Agent

## Docker 启动

```bash
docker compose up --build
```

根目录 `.env` 会作为 Compose 的环境变量来源。

## 必需环境变量

至少需要补齐这些变量：

- `SCRIPT_HUB_SESSION_SECRET`
- `SCRIPT_HUB_ACCESS_KEYS_JSON`
- `TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY`
- `TEAM_RESOURCES_EXPORT_ENCRYPTION_KEY`
- `AGENT_API_KEY`

可参考根目录的 `.env.example`。

## 说明

- `.env` 与 `.env.*` 已被忽略，不应提交到仓库。
- 浏览器侧统一通过 `/api` 访问，内部转发再走后端服务地址。
- Team Resources / AI Resources / Agent Chat 相关敏感接口依赖服务端会话鉴权。
- 本地数据库建议固定写 `DB_LOCAL_HOST=localhost`。
- 直接在宿主机运行 FastAPI 时会自动连 `localhost/127.0.0.1`。
- 通过 Docker 运行 FastAPI 时，如果 `DB_LOCAL_HOST` 仍然是 `localhost/127.0.0.1`，后端会自动改连 `DB_LOCAL_HOST_DOCKER`，默认是 `host.docker.internal`，不需要再手工切换 `.env`。
- 运维中心现在也只需要保留一个“本机监控 Agent”节点。后端会自动按当前运行环境尝试 `127.0.0.1 / localhost / host.docker.internal`，本地开发和 Docker 启动都不需要再切换节点。
