"""Add all missing notable AI tools to ai-resources.json in one batch."""
import json, sys, io
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    data = json.load(f)

existing_ids = {r["id"] for r in data["resources"]}

new_tools = [
    # === Testing ===
    {
        "id": "magnitude",
        "name": "Magnitude",
        "description": "开源AI原生E2E测试框架，双模型架构（规划器+执行器），利用视觉AI像人一样操作Web界面，大幅减少测试维护",
        "url": "https://magnitude.run",
        "logoUrl": "https://magnitude.run/favicon.ico",
        "category": "testing",
        "tags": ["开源", "视觉AI", "E2E", "自动维护"],
        "order": 99
    },
    {
        "id": "meticulous-ai",
        "name": "Meticulous AI",
        "description": "前端零编写自动化测试平台，录制开发/Staging环境用户会话自动生成视觉回归测试，消除Flaky Test",
        "url": "https://meticulous.ai",
        "logoUrl": "https://meticulous.ai/favicon.ico",
        "category": "testing",
        "tags": ["前端", "视觉回归", "零编写", "Chromium"],
        "order": 99
    },
    {
        "id": "checkly",
        "name": "Checkly",
        "description": "面向开发者的合成监控与测试平台，Monitoring-as-Code，内置Rocky AI助手生成Playwright测试与根因分析",
        "url": "https://www.checklyhq.com",
        "logoUrl": "https://www.checklyhq.com/favicon.ico",
        "category": "testing",
        "tags": ["监控", "Playwright", "MaC", "AI助手"],
        "order": 99
    },
    {
        "id": "testim",
        "name": "Tricentis Testim",
        "description": "AI驱动的端到端测试平台，利用ML自动稳定测试脚本，加速创建/执行/维护自动化测试",
        "url": "https://www.testim.io",
        "logoUrl": "https://www.testim.io/favicon.ico",
        "category": "testing",
        "tags": ["ML", "自动稳定", "企业级", "Tricentis"],
        "order": 99
    },
    {
        "id": "testcomplete",
        "name": "TestComplete",
        "description": "SmartBear旗下的AI驱动无脚本测试自动化工具，支持桌面/Web/移动端全场景自动化",
        "url": "https://smartbear.com/product/testcomplete",
        "logoUrl": "https://smartbear.com/favicon.ico",
        "category": "testing",
        "tags": ["SmartBear", "无脚本", "全平台", "企业级"],
        "order": 99
    },
    # === Agent ===
    {
        "id": "devin",
        "name": "Devin",
        "description": "Cognition Labs推出的全球首个全自主AI软件工程师，可独立完成从需求理解到部署上线的完整开发流程",
        "url": "https://devin.ai",
        "logoUrl": "https://devin.ai/favicon.ico",
        "category": "agent",
        "tags": ["全自主", "软件工程师", "Cognition", "端到端"],
        "order": 99
    },
    {
        "id": "openhands",
        "name": "OpenHands",
        "description": "开源AI编程Agent平台（原OpenDevin），支持编写代码、执行CLI、浏览Web，MIT协议，可本地/云部署",
        "url": "https://openhands.dev",
        "logoUrl": "https://openhands.dev/favicon.ico",
        "category": "agent",
        "tags": ["开源", "MIT", "编程Agent", "可自托管"],
        "order": 99
    },
    {
        "id": "n8n",
        "name": "n8n",
        "description": "开源低代码工作流自动化引擎，让用户通过可视化编排连接LLM/API/数据库，构建自定义AI Agent和自动化流",
        "url": "https://n8n.io",
        "logoUrl": "https://n8n.io/favicon.ico",
        "category": "agent",
        "tags": ["开源", "低代码", "工作流", "自托管"],
        "order": 99
    },
    # === Code ===
    {
        "id": "bolt-new",
        "name": "Bolt.new",
        "description": "StackBlitz推出的AI全栈应用构建器，浏览器内通过自然语言即可创建/编辑/运行/部署全栈Web应用",
        "url": "https://bolt.new",
        "logoUrl": "https://bolt.new/favicon.ico",
        "category": "code",
        "tags": ["全栈", "浏览器IDE", "自然语言", "StackBlitz"],
        "order": 99
    },
    {
        "id": "windsurf",
        "name": "Windsurf",
        "description": "前Codeium重新打造的AI原生IDE，内置Agent模式（Cascade），支持多步骤代码理解、重构和生成",
        "url": "https://windsurf.com",
        "logoUrl": "https://windsurf.com/favicon.ico",
        "category": "code",
        "tags": ["IDE", "Agent", "Cascade", "Codeium"],
        "order": 99
    },
    {
        "id": "poolside",
        "name": "Poolside",
        "description": "专为企业打造的AI编程模型公司，强调安全/隐私/合规，模型可部署在企业内部基础设施上",
        "url": "https://poolside.ai",
        "logoUrl": "https://poolside.ai/favicon.ico",
        "category": "code",
        "tags": ["企业级", "私有部署", "安全", "代码生成"],
        "order": 99
    },
    {
        "id": "augment-code",
        "name": "Augment Code",
        "description": "面向大型代码库的AI编码助手，深度理解整个代码库上下文，提供精准的代码建议和重构",
        "url": "https://www.augmentcode.com",
        "logoUrl": "https://www.augmentcode.com/favicon.ico",
        "category": "code",
        "tags": ["大代码库", "上下文理解", "企业级", "IDE插件"],
        "order": 99
    },
    {
        "id": "trae",
        "name": "Trae",
        "description": "字节跳动推出的免费AI IDE（原MarsCode IDE升级），内置Agent模式和Builder，支持中英双语",
        "url": "https://trae.ai",
        "logoUrl": "https://trae.ai/favicon.ico",
        "category": "code",
        "tags": ["字节跳动", "免费IDE", "Agent", "Builder"],
        "order": 99
    },
    # === Video ===
    {
        "id": "synthesia",
        "name": "Synthesia",
        "description": "领先的AI数字人视频生成平台，从文本自动生成逼真的AI头像演示视频，广泛用于培训和营销",
        "url": "https://www.synthesia.io",
        "logoUrl": "https://www.synthesia.io/favicon.ico",
        "category": "video",
        "tags": ["数字人", "培训视频", "多语言", "企业级"],
        "order": 99
    },
    {
        "id": "heygen",
        "name": "HeyGen",
        "description": "AI视频数字分身平台，一键生成逼真虚拟人视频，支持175+语言实时翻译且保持原声和口型同步",
        "url": "https://www.heygen.com",
        "logoUrl": "https://www.heygen.com/favicon.ico",
        "category": "video",
        "tags": ["数字分身", "视频翻译", "口型同步", "SaaS"],
        "order": 99
    },
    {
        "id": "google-veo",
        "name": "Google Veo",
        "description": "Google DeepMind推出的4K级AI视频生成模型（Veo 3.1），支持文本/图片生成视频，可同步生成音效",
        "url": "https://deepmind.google/technologies/veo",
        "logoUrl": "https://deepmind.google/favicon.ico",
        "category": "video",
        "tags": ["Google", "4K", "音频同步", "多模态"],
        "order": 99
    },
    # === Audio ===
    {
        "id": "udio",
        "name": "Udio",
        "description": "AI音乐创作平台，通过文字描述生成高保真完整歌曲，支持多风格和人声，免版税",
        "url": "https://www.udio.com",
        "logoUrl": "https://www.udio.com/favicon.ico",
        "category": "audio",
        "tags": ["音乐创作", "免版税", "人声", "多风格"],
        "order": 99
    },
    {
        "id": "suno-ai",
        "name": "Suno",
        "description": "AI音乐生成工具，输入歌词或描述即可创作完整歌曲（含人声/伴奏），支持多种音乐风格",
        "url": "https://suno.com",
        "logoUrl": "https://suno.com/favicon.ico",
        "category": "audio",
        "tags": ["AI作曲", "歌词创作", "人声生成", "免费"],
        "order": 99
    },
    # === Image ===
    {
        "id": "ideogram",
        "name": "Ideogram",
        "description": "擅长精准渲染文字的AI图像生成器，能在图像中清晰呈现文字、Logo等设计元素",
        "url": "https://ideogram.ai",
        "logoUrl": "https://ideogram.ai/favicon.ico",
        "category": "image",
        "tags": ["文字渲染", "Logo设计", "高保真", "免费"],
        "order": 99
    },
    {
        "id": "flux-ai",
        "name": "Flux AI",
        "description": "Black Forest Labs推出的高质量开源图像生成模型系列，画质和语义理解极强，支持文生图/图生图",
        "url": "https://flux-ai.io",
        "logoUrl": "https://flux-ai.io/favicon.ico",
        "category": "image",
        "tags": ["开源", "高保真", "文生图", "Black Forest"],
        "order": 99
    },
    # === Productivity ===
    {
        "id": "notebooklm",
        "name": "NotebookLM",
        "description": "Google推出的AI研究助手，可上传50+来源文档，严格基于已提供资料回答问题，极大减少幻觉",
        "url": "https://notebooklm.google.com",
        "logoUrl": "https://notebooklm.google.com/favicon.ico",
        "category": "productivity",
        "tags": ["Google", "文档分析", "无幻觉", "研究"],
        "order": 99
    },
    {
        "id": "gamma-app",
        "name": "Gamma",
        "description": "AI驱动的新一代演示/文档/网页生成工具，输入文字即生成精美专业的PPT和网页",
        "url": "https://gamma.app",
        "logoUrl": "https://gamma.app/favicon.ico",
        "category": "productivity",
        "tags": ["PPT", "文档生成", "网页", "一键美化"],
        "order": 99
    },
    {
        "id": "fathom",
        "name": "Fathom",
        "description": "AI会议助手，为Zoom/Meet/Teams提供免费无限转录、自动总结、要点提取和待办事项",
        "url": "https://fathom.video",
        "logoUrl": "https://fathom.video/favicon.ico",
        "category": "productivity",
        "tags": ["会议纪要", "转录", "免费", "多平台"],
        "order": 99
    },
    # === LLM Eval ===
    {
        "id": "braintrust",
        "name": "Braintrust",
        "description": "领先的LLM可观测性与评估平台，25+内置评分器，提供完整Trace追踪、Prompt管理和成本分析",
        "url": "https://www.braintrust.dev",
        "logoUrl": "https://www.braintrust.dev/favicon.ico",
        "category": "llm-eval",
        "tags": ["LLM Ops", "评估", "Tracing", "成本分析"],
        "order": 99
    },
    {
        "id": "arize-phoenix",
        "name": "Arize Phoenix",
        "description": "开源AI可观测性平台（OpenTelemetry标准），提供LLM Tracing、幻觉检测、RAG评估和数据集实验",
        "url": "https://phoenix.arize.com",
        "logoUrl": "https://arize.com/favicon.ico",
        "category": "llm-eval",
        "tags": ["开源", "OpenTelemetry", "幻觉检测", "RAG"],
        "order": 99
    },
    # === Security ===
    {
        "id": "garak",
        "name": "Garak",
        "description": "AI原生的LLM渗透测试与红队平台，自动检测大模型的安全漏洞、越狱和提示注入风险",
        "url": "https://garak.ai",
        "logoUrl": "https://garak.ai/favicon.ico",
        "category": "security",
        "tags": ["LLM安全", "红队", "越狱检测", "开源"],
        "order": 99
    },
    # === Chat (major LLMs) ===
    {
        "id": "deepseek",
        "name": "DeepSeek",
        "description": "幻方量化旗下的开源大模型，DeepSeek-V3/R1以极低成本实现顶级推理能力，开源界标杆",
        "url": "https://chat.deepseek.com",
        "logoUrl": "https://chat.deepseek.com/favicon.ico",
        "category": "chat",
        "tags": ["国产", "开源", "低成本", "推理"],
        "order": 99
    },
    {
        "id": "qwen",
        "name": "通义千问 (Qwen)",
        "description": "阿里云推出的大语言模型系列，Qwen2.5/3开源，支持多语言、长上下文和多模态",
        "url": "https://tongyi.aliyun.com",
        "logoUrl": "https://tongyi.aliyun.com/favicon.ico",
        "category": "chat",
        "tags": ["国产", "阿里云", "开源", "多模态"],
        "order": 99
    },
    # === Devtools ===
    {
        "id": "sourcegraph-cody",
        "name": "Sourcegraph Cody",
        "description": "基于全代码库智能索引的AI编码助手，深度理解整个代码仓库的上下文提供精准回答和代码导航",
        "url": "https://sourcegraph.com/cody",
        "logoUrl": "https://sourcegraph.com/favicon.ico",
        "category": "devtools",
        "tags": ["代码搜索", "全库上下文", "IDE插件", "企业级"],
        "order": 99
    },
    # === Design ===
    {
        "id": "napkin-ai",
        "name": "Napkin AI",
        "description": "AI驱动的文本转可视化工具，将文字内容自动转化为专业流程图、信息图和示意图",
        "url": "https://napkin.ai",
        "logoUrl": "https://napkin.ai/favicon.ico",
        "category": "design",
        "tags": ["信息图", "流程图", "文本转图", "PPT素材"],
        "order": 99
    },
]

# Filter out already existing
added = []
for tool in new_tools:
    if tool["id"] not in existing_ids:
        data["resources"].append(tool)
        added.append(tool["name"])
        print(f"  + {tool['name']} ({tool['id']}) -> {tool['category']}")
    else:
        print(f"  SKIP (exists): {tool['name']} ({tool['id']})")

# Re-number orders within each category
cat_resources = defaultdict(list)
for r in data["resources"]:
    cat_resources[r["category"]].append(r)

for cat_id, items in cat_resources.items():
    items.sort(key=lambda x: x["order"])
    for i, item in enumerate(items, 1):
        item["order"] = i

with open("my-app/data/ai-resources.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\nAdded {len(added)} new tools. Total now: {len(data['resources'])} resources.")
print("Done!")
