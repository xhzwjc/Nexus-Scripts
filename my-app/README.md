🚀 Internal Operations Toolkit

一个基于 React + Next.js 构建的现代化内部运营与自动化工具平台，旨在简化核心业务流程 🚀。
通过模块化的“脚本”工具，覆盖了 佣金计算、税务处理、任务自动化、短信管理、账户核对与结算 等场景。

✨ 核心功能

💰 财务与佣金管理: 自动化计算渠道佣金，多维度数据分析和验证。

🧾 税务处理: 精确计算个税，支持模拟和真实数据模式。

⚙️ 任务自动化: 批量执行用户任务，支持并发/顺序执行。

📞 通信管理: 短信模板管理与批量发送，支持补发签约短信。

📊 余额核对: 自动校验企业账户在各税地的余额差异。

💼 结算处理: 批量结算企业账单，实时日志追踪。

🎨 现代化 UI: 基于 shadcn/ui + Tailwind CSS 构建，响应迅速，交互友好。

🛠️ 技术栈

前端框架: React / Next.js

语言: TypeScript

UI 组件库: shadcn/ui (Radix UI + Tailwind CSS)

API 请求: Axios

通知/提示: Sonner

图标: Lucide React

🚀 快速开始
<details> <summary>点击展开安装步骤</summary>
1. 环境要求

Node.js (版本 >= 18.0)

pnpm (推荐) 或 npm / yarn

2. 安装依赖
   git clone <repo-url>
   cd internal-operations-toolkit
   pnpm install

3. 配置环境变量

在根目录新建 .env.local 文件：

# 示例：本地开发环境的后端 API 地址
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1

4. 启动开发环境
   pnpm run dev


打开浏览器访问 👉 http://localhost:3000

</details>
📦 可用命令
pnpm dev      # 启动开发服务器
pnpm build    # 构建生产环境
pnpm start    # 启动生产服务器
pnpm lint     # 运行代码风格检查

🧩 核心模块概览
1. 渠道佣金计算与验证

环境切换（测试 / 生产）

KPI 卡片展示

税地/企业/批次维度分析

高亮不匹配数据

企业汇总分析

2. 税额计算工具

真实模式: 后端获取收入数据

模拟模式: 手动输入账单金额

导出 CSV

月度计算步骤详情

3. 任务自动化管理

支持 txt 上传 / 粘贴手机号

多模式执行：登录+报名 / 登录+交付 / 登录+结算确认

并发 & 顺序执行

实时日志 + 错误展示

导出完整 JSON 结果

4. 短信模板管理与发送

模板列表 & 一键更新

单模板 / 批量发送

补发签约短信（手机号+税地ID/批次号）

发送结果追踪

5. 税务报表管理

多条件数据查询

按企业/税地维度统计

Excel 报表一键生成

支持脱敏 & 自定义企业信息

6. 企业账户余额核对

企业模糊搜索

税地余额核对

异常高亮

导出 CSV

7. 结算处理脚本

三种模式：发起结算 / 重新发起 / 单个结算单

多企业配置，支持并发/顺序执行

实时日志面板

任务中止控制

📊 执行流程图示例
flowchart TD
A[开始] --> B[选择任务模式]
B -->|佣金计算| C[Commission Script]
B -->|税务处理| D[Tax Calculator]
B -->|任务自动化| E[Task Automation]
B -->|短信发送| F[Batch SMS]
B -->|账户核对| G[Balance Check]
B -->|结算处理| H[Settlement]
C --> Z[完成]
D --> Z
E --> Z
F --> Z
G --> Z
H --> Z