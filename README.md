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

## 初始化本地 MySQL 基线数据

推荐统一使用虚拟环境里的 Python 入口，这样 Win / Mac / Linux 都是同一套逻辑：

```bash
./fastApiProject/venv/bin/python bootstrap_local_mysql_data.py
```

Windows:

```bat
.\fastApiProject\venv\Scripts\python.exe .\bootstrap_local_mysql_data.py
```

也保留了平台包装脚本：

- Mac / Linux: `./bootstrap_local_mysql_data.sh`
- Windows: `bootstrap_local_mysql_data.bat`

这个初始化脚本会自动：

- 创建本地 MySQL 数据库
- 导入 AI 资源数据
- 导入团队资源数据
- 初始化 Script Hub 权限中心表、默认角色与用户基线
- 创建审计表并校验关键表行数

## Docker 启动

```bash
docker compose up --build
```

根目录 `.env` 会作为 Compose 的环境变量来源。

## 必需环境变量

至少需要补齐这些变量：

- `SCRIPT_HUB_SESSION_SECRET`
- `TEAM_RESOURCES_PASSWORD_ENCRYPTION_KEY`
- `TEAM_RESOURCES_EXPORT_ENCRYPTION_KEY`
- `AGENT_API_KEY`

可参考根目录的 `.env.example`。

## 说明

- `.env` 与 `.env.*` 已被忽略，不应提交到仓库。
- 浏览器侧统一通过 `/api` 访问，内部转发再走后端服务地址。
- Team Resources / AI Resources / Agent Chat 相关敏感接口依赖服务端会话鉴权。
- Script Hub 用户认证现在以数据库为唯一运行时来源，不再要求在前端或后端运行时保留 `SCRIPT_HUB_ACCESS_KEYS_JSON`。
- 如需初始化一套全新的 Script Hub 用户，可选配置 `SCRIPT_HUB_BOOTSTRAP_USERS_FILE`；如果数据库里还没有任何 Script Hub 用户且未提供 seed，bootstrap 会自动创建一个初始 `admin` 账号，并输出一次性 access key。
- 本地数据库建议固定写 `DB_LOCAL_HOST=localhost`。
- 直接在宿主机运行 FastAPI 时会自动连 `localhost/127.0.0.1`。
- 通过 Docker 运行 FastAPI 时，如果 `DB_LOCAL_HOST` 仍然是 `localhost/127.0.0.1`，后端会自动改连 `DB_LOCAL_HOST_DOCKER`，默认是 `host.docker.internal`，不需要再手工切换 `.env`。
- 运维中心现在也只需要保留一个“本机监控 Agent”节点。后端会自动按当前运行环境尝试 `127.0.0.1 / localhost / host.docker.internal`，本地开发和 Docker 启动都不需要再切换节点。
- `CORS_ALLOW_ORIGINS` 支持逗号分隔或 JSON 数组；`ENVIRONMENT=local` 且未显式配置时，默认允许全部来源，方便本地开发。非本地环境建议显式配置允许来源或 `CORS_ALLOW_ORIGIN_REGEX`。
