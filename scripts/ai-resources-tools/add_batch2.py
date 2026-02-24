"""
Final script to filter and add the second batch of tools.
"""
import json, sys, io
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    data = json.load(f)

existing_ids = {r["id"] for r in data["resources"]}
existing_urls = {r["url"].strip("/").lower() for r in data["resources"]}

user_tools = [
    {
      "id": "claude-sonnet-4-6",
      "name": "Claude Sonnet 4.6",
      "description": "Anthropic 2月新版默认模型,编码性能大幅提升,长文本推理优化,计算机使用能力增强,性能超越Opus 4.6部分任务",
      "url": "https://claude.ai",
      "logoUrl": "https://claude.ai/favicon.ico",
      "category": "chat",
      "tags": ["Anthropic", "编码", "长文本", "2026新版"]
    },
    {
      "id": "gpt-5-3-codex",
      "name": "GPT-5.3 Codex",
      "description": "OpenAI 2月7日重大更新,新增Frontier管理系统用于AI工作者管理,代码生成能力显著提升",
      "url": "https://openai.com",
      "logoUrl": "https://openai.com/favicon.ico",
      "category": "code",
      "tags": ["OpenAI", "代码生成", "AI管理", "2026更新"]
    },
    {
      "id": "glm-5",
      "name": "GLM-5",
      "description": "中国智谱AI 2月发布,开源推理模型立即登顶开源榜单第一,挑战闭源模型壁垒",
      "url": "https://www.zhipuai.cn",
      "logoUrl": "https://www.zhipuai.cn/favicon.ico",
      "category": "chat",
      "tags": ["开源", "推理模型", "中国", "榜单第一"]
    },
    {
      "id": "seedance-2",
      "name": "Seedance 2.0",
      "description": "字节跳动2月重磅发布,2K分辨率AI视频生成+原生音频+唇形同步,电影级输出,已引发版权争议",
      "url": "https://www.seedance.ai",
      "logoUrl": "https://www.seedance.ai/favicon.ico",
      "category": "video",
      "tags": ["字节跳动", "2K分辨率", "唇形同步", "电影级"]
    },
    {
      "id": "cowork-anthropic",
      "name": "Cowork (Anthropic)",
      "description": "Anthropic 2月新品,桌面任务自动化工具,直接执行任务而非仅回答问题,支持文件管理+数据处理",
      "url": "https://www.anthropic.com/cowork",
      "logoUrl": "https://www.anthropic.com/favicon.ico",
      "category": "agent",
      "tags": ["Anthropic", "任务自动化", "桌面代理", "文件管理"]
    },
    {
      "id": "claude-code-windows",
      "name": "Claude Code for Windows",
      "description": "2月11日正式发布Windows版本,实现macOS/Windows功能对等,多平台Agent编码时代到来",
      "url": "https://claude.ai/code",
      "logoUrl": "https://claude.ai/favicon.ico",
      "category": "code",
      "tags": ["Windows", "跨平台", "Agent编码", "2月发布"]
    },
    {
      "id": "github-agent-hq",
      "name": "GitHub Agent HQ",
      "description": "2月GitHub发布多代理平台,支持Claude Code、Codex、Codex、Copilot同时运行,多模型协同工作流",
      "url": "https://github.com",
      "logoUrl": "https://github.com/favicon.ico",
      "category": "agent",
      "tags": ["GitHub", "多代理", "协同", "2月新品"]
    },
    {
      "id": "bolt-new",
      "name": "Bolt.new",
      "description": "StackBlitz新品,自然语言描述即可构建Web/移动应用,自动生成前后端代码+托管,Product Hunt 2月热门",
      "url": "https://bolt.new",
      "logoUrl": "https://bolt.new/favicon.ico",
      "category": "devtools",
      "tags": ["全栈生成", "自然语言", "自动托管", "PH热门"]
    },
    {
      "id": "pomelli-google",
      "name": "Pomelli (Google)",
      "description": "Google品牌内容生成器,2月测试中,AI驱动的营销内容创作平台",
      "url": "https://google.com/pomelli",
      "logoUrl": "https://google.com/favicon.ico",
      "category": "writing",
      "tags": ["Google", "品牌内容", "营销", "2月测试"]
    },
    {
      "id": "wordpress-ai-assistant",
      "name": "WordPress AI Assistant",
      "description": "2月WordPress内置AI助手,可编辑文本、生成图像、创建页面、修改布局,集成Google Nano Banana模型",
      "url": "https://wordpress.com",
      "logoUrl": "https://wordpress.com/favicon.ico",
      "category": "writing",
      "tags": ["WordPress", "内容生成", "图像生成", "内置AI"]
    },
    {
      "id": "figma-claude-code",
      "name": "Figma + Claude Code",
      "description": "2月Figma集成Claude Code工作流,设计稿直接连接可编辑代码画布,设计到开发无缝衔接",
      "url": "https://www.figma.com",
      "logoUrl": "https://www.figma.com/favicon.ico",
      "category": "design",
      "tags": ["Figma", "Claude Code", "设计转代码", "2月集成"]
    },
    {
      "id": "doubao-2",
      "name": "Doubao 2.0 (豆包)",
      "description": "字节跳动2月发布AI代理升级版,中国AI Agent竞赛关键玩家,多模态能力增强",
      "url": "https://www.doubao.com",
      "logoUrl": "https://www.doubao.com/favicon.ico",
      "category": "agent",
      "tags": ["字节跳动", "中国", "多模态", "2月发布"]
    },
    {
      "id": "vouch-github",
      "name": "Vouch",
      "description": "GitHub反垃圾PR工具,2月热门,通过信誉系统阻止AI生成的垃圾贡献,维护开源项目质量",
      "url": "https://github.com/vouch-dev/vouch",
      "logoUrl": "https://github.githubassets.com/favicons/favicon.svg",
      "category": "devtools",
      "tags": ["反垃圾", "开源治理", "信誉系统", "GitHub热门"]
    },
    {
      "id": "visionclaw",
      "name": "VisionClaw",
      "description": "连接Meta Ray-Ban眼镜到Gemini,实时AI视觉+语音操作,通过相机进行智能家居控制、网页搜索等",
      "url": "https://github.com/sseanliu/visionclaw",
      "logoUrl": "https://github.githubassets.com/favicons/favicon.svg",
      "category": "agent",
      "tags": ["可穿戴", "实时视觉", "智能家居", "GitHub热门"]
    },
    {
      "id": "mcp-excalidraw",
      "name": "Excalidraw MCP",
      "description": "MCP服务器让AI生成和迭代Excalidraw架构图、流程图,交互式图表编辑,2月GitHub趋势",
      "url": "https://github.com/ivarvdm/mcp_excalidraw",
      "logoUrl": "https://github.githubassets.com/favicons/favicon.svg",
      "category": "productivity",
      "tags": ["MCP", "架构图", "交互式", "图表生成"]
    },
    {
      "id": "localgpt-memory",
      "name": "LocalGPT",
      "description": "本地持久记忆AI应用,memory.md + daemon任务,无需云端,完全隐私,2月GitHub趋势",
      "url": "https://github.com/localgpt/localgpt",
      "logoUrl": "https://github.githubassets.com/favicons/favicon.svg",
      "category": "chat",
      "tags": ["本地AI", "持久记忆", "隐私", "开源"]
    },
    {
      "id": "napkin-memory",
      "name": "Napkin",
      "description": "Claude Code记忆持久化工具,可编程工作流控制器,团队级上下文管理,2月GitHub热门",
      "url": "https://github.com/napkin-ai/napkin",
      "logoUrl": "https://github.githubassets.com/favicons/favicon.svg",
      "category": "agent",
      "tags": ["记忆管理", "工作流", "团队协作", "Claude Code"]
    },
    {
      "id": "gondolin-sandbox",
      "name": "Gondolin",
      "description": "MicroVM沙箱运行AI代码,JS网络隔离,安全执行AI生成代码,防止恶意操作,2月GitHub趋势",
      "url": "https://github.com/gondolin/gondolin",
      "logoUrl": "https://github.githubassets.com/favicons/favicon.svg",
      "category": "devtools",
      "tags": ["沙箱", "安全", "代码执行", "microVM"]
    },
    {
      "id": "claude-pulse",
      "name": "Claude Pulse",
      "description": "终端状态栏显示Claude Code使用限额,5小时会话+每周滚动使用量监控,开发者实用工具",
      "url": "https://github.com/NoobyGains/claude-pulse",
      "logoUrl": "https://github.githubassets.com/favicons/favicon.svg",
      "category": "productivity",
      "tags": ["监控", "使用限额", "终端工具", "Claude Code"]
    },
    {
      "id": "obsync",
      "name": "Obsync",
      "description": "macOS菜单栏应用,双向同步Obsidian Tasks ↔ Apple Reminders,知识管理与提醒无缝集成",
      "url": "https://github.com/Santofer/Obsync",
      "logoUrl": "https://github.githubassets.com/favicons/favicon.svg",
      "category": "productivity",
      "tags": ["Obsidian", "任务管理", "双向同步", "macOS"]
    },
    {
      "id": "stik-notes",
      "name": "Stik",
      "description": "极简笔记捕获应用,Markdown保存,通过Homebrew安装,快速记录想法",
      "url": "https://github.com/0xMassi/stik_app",
      "logoUrl": "https://github.githubassets.com/favicons/favicon.svg",
      "category": "productivity",
      "tags": ["极简", "Markdown", "快速记录", "macOS"]
    },
    {
      "id": "moondream",
      "name": "Moondream",
      "description": "开源视觉语言模型,1GB超小体积,无需GPU运行,图像识别、目标检测、文档阅读,600万+下载",
      "url": "https://moondream.ai",
      "logoUrl": "https://moondream.ai/favicon.ico",
      "category": "image",
      "tags": ["开源", "视觉语言", "边缘设备", "1GB体积"]
    },
    {
      "id": "unblocked-code-review",
      "name": "Unblocked",
      "description": "AI代码审查工具,高信号评论,只提供真正需要实现的建议,过滤噪音,Product Hunt推广中",
      "url": "https://unblocked.io",
      "logoUrl": "https://unblocked.io/favicon.ico",
      "category": "devtools",
      "tags": ["代码审查", "高质量评论", "噪音过滤", "团队协作"]
    },
    {
      "id": "albato-automation",
      "name": "Albato",
      "description": "无代码自动化平台,120+应用集成,AI驱动的流程编排,2月Product Hunt热门",
      "url": "https://albato.com",
      "logoUrl": "https://albato.com/favicon.ico",
      "category": "productivity",
      "tags": ["无代码", "自动化", "120+集成", "流程编排"]
    },
    {
      "id": "cartesia-sonic",
      "name": "Cartesia Sonic",
      "description": "最快的人类级语音API,超低延迟,实时对话体验,2月Product Hunt推广",
      "url": "https://cartesia.ai",
      "logoUrl": "https://cartesia.ai/favicon.ico",
      "category": "audio",
      "tags": ["语音API", "超低延迟", "实时对话", "高性能"]
    },
    {
      "id": "dvina-enterprise",
      "name": "Dvina",
      "description": "企业级治理多代理编排,跨120+应用自动化报告、CRM/ERP更新、事件处理",
      "url": "https://dvina.ai",
      "logoUrl": "https://dvina.ai/favicon.ico",
      "category": "agent",
      "tags": ["企业治理", "多代理", "120+应用", "事件处理"]
    },
    {
      "id": "agihalo-router",
      "name": "Agihalo",
      "description": "LLM路由器用于AI Agent和SaaS,按Key配额管理+实时成本追踪+自动x402/USDC充值",
      "url": "https://agihalo.com",
      "logoUrl": "https://agihalo.com/favicon.ico",
      "category": "agent",
      "tags": ["LLM路由", "成本管理", "自动充值", "多代理治理"]
    },
    {
      "id": "qwen-3",
      "name": "Qwen 3",
      "description": "阿里云新版大模型,可切换思维模式,超长上下文,多模态+Agent工具调用,深度推理与编码",
      "url": "https://tongyi.aliyun.com",
      "logoUrl": "https://tongyi.aliyun.com/favicon.ico",
      "category": "chat",
      "tags": ["阿里云", "思维模式", "超长上下文", "多模态"]
    },
    {
      "id": "alpie-core",
      "name": "Alpie Core",
      "description": "4-bit量化长上下文推理与编码模型,OpenAI兼容端点,成本高效的本地或托管部署",
      "url": "https://alpie.ai",
      "logoUrl": "https://alpie.ai/favicon.ico",
      "category": "other",
      "tags": ["量化模型", "成本优化", "长上下文", "本地部署"]
    },
    {
      "id": "raydian-webapp",
      "name": "Raydian",
      "description": "对话式全栈Web应用构建,聊天生成+可视化编辑+集成托管,快速原型工具",
      "url": "https://raydian.io",
      "logoUrl": "https://raydian.io/favicon.ico",
      "category": "devtools",
      "tags": ["对话式", "全栈", "可视化", "快速原型"]
    },
    {
      "id": "ai-browser",
      "name": "AI Browser",
      "description": "Agentic浏览器自动化,云端会话+CAPTCHA处理+定时任务,适合增长运营与爬虫",
      "url": "https://aibrowser.ai",
      "logoUrl": "https://aibrowser.ai/favicon.ico",
      "category": "agent",
      "tags": ["浏览器自动化", "CAPTCHA", "爬虫", "增长运营"]
    },
    {
      "id": "klariqo-voice",
      "name": "Klariqo AI Voice Assistants",
      "description": "服务型SMB即插即用语音/聊天代理,电话集成+日历预约,2月Product Hunt",
      "url": "https://klariqo.com",
      "logoUrl": "https://klariqo.com/favicon.ico",
      "category": "agent",
      "tags": ["语音助手", "SMB", "预约系统", "即插即用"]
    },
    {
      "id": "waylight",
      "name": "Waylight",
      "description": "设备端隐私AI,持续桌面记忆用于上下文感知起草与回忆,本地处理无云端",
      "url": "https://waylight.ai",
      "logoUrl": "https://waylight.ai/favicon.ico",
      "category": "productivity",
      "tags": ["设备端AI", "隐私", "持续记忆", "本地处理"]
    },
    {
      "id": "granola-ai",
      "name": "Granola",
      "description": "AI meeting notepad that transcribes, organizes, and simplifies your meetings. Integrates with Slack and more.",
      "url": "https://granola.ai",
      "logoUrl": "https://granola.ai/favicon.ico",
      "category": "productivity",
      "tags": ["Meeting", "Transcription", "Productivity"]
    },
    {
      "id": "trupeer-doc-writer",
      "name": "AI Doc Writer",
      "description": "Create branded product documentation from simple recordings. Auto-generates text and images.",
      "url": "https://trupeer.ai",
      "logoUrl": "https://trupeer.ai/favicon.ico",
      "category": "writing",
      "tags": ["Documentation", "Automation", "Product Hunt"]
    },
    {
      "id": "twinmind",
      "name": "TwinMind",
      "description": "Personal AI assistant on device. Captures and understands context across your day.",
      "url": "https://twinmind.ai",
      "logoUrl": "https://twinmind.ai/favicon.ico",
      "category": "productivity",
      "tags": ["Personal Assistant", "On-device", "Audio"]
    },
    {
      "id": "snoops-reddit",
      "name": "Snoops.co",
      "description": "Monitor Reddit for sales opportunities. Uses AI to find and respond to potential customers.",
      "url": "https://snoops.co",
      "logoUrl": "https://snoops.co/favicon.ico",
      "category": "productivity",
      "tags": ["Reddit", "Sales", "Inbound"]
    },
    {
      "id": "okara-ai",
      "name": "Okara",
      "description": "Privacy-first AI workspace with encrypted chat and secure document processing.",
      "url": "https://okara.ai",
      "logoUrl": "https://okara.ai/favicon.ico",
      "category": "productivity",
      "tags": ["Privacy", "Workspace", "LLMs"]
    },
    {
      "id": "coverposts",
      "name": "Coverposts",
      "description": "Automated social media content distribution for blogs. Generates posts and images.",
      "url": "https://coverposts.com",
      "logoUrl": "https://coverposts.com/favicon.ico",
      "category": "writing",
      "tags": ["Social Media", "Distribution", "Automation"]
    },
    {
      "id": "name-drop-ai",
      "name": "Name-Drop.ai",
      "description": "Social monitoring tool to find the best moments for organic brand mentions.",
      "url": "https://namedrop.ai",
      "logoUrl": "https://namedrop.ai/favicon.ico",
      "category": "productivity",
      "tags": ["Social Monitoring", "Marketing", "Brand Awareness"]
    },
    {
      "id": "imagine-art-2026",
      "name": "Imagine Art",
      "description": "Unified platform access to 12+ leading AI models like FLUX.2, Ideogram v3, and Sora.",
      "url": "https://www.imagine.art",
      "logoUrl": "https://www.imagine.art/favicon.ico",
      "category": "image",
      "tags": ["Multi-model", "Creative Suite", "Image Generation"]
    },
    {
      "id": "gemini-3-1-pro",
      "name": "Gemini 3.1 Pro",
      "description": "Google's 2026 flagship model preview with 1M token context and advanced agentic capabilities.",
      "url": "https://gemini.google.com",
      "logoUrl": "https://gemini.google.com/favicon.ico",
      "category": "chat",
      "tags": ["Google", "LLM", "Pro", "2026"]
    },
    {
      "id": "reddit-ai-shopping",
      "name": "Reddit AI Shopping",
      "description": "AI-powered shopping search that surfaces product discussions and reviews from Reddit communities.",
      "url": "https://reddit.com",
      "logoUrl": "https://reddit.com/favicon.ico",
      "category": "search",
      "tags": ["Shopping", "Reddit", "Research"]
    },
    {
      "id": "healthbridge",
      "name": "HealthBridge",
      "description": "AI-optimized chronic condition care plans based on patient data and latest medical research.",
      "url": "https://healthbridge.ai",
      "logoUrl": "https://healthbridge.ai/favicon.ico",
      "category": "other",
      "tags": ["HealthTech", "Personalized Medicine", "AI"]
    },
    {
      "id": "craftai",
      "name": "CraftAI",
      "description": "Modular AI solutions for small businesses to integrate AI into their operations easily.",
      "url": "https://craft.ai",
      "logoUrl": "https://craft.ai/favicon.ico",
      "category": "agent",
      "tags": ["SMB", "Modular", "Integration"]
    },
    {
      "id": "gitnexus",
      "name": "GitNexus",
      "description": "Client-side code intelligence that builds knowledge graphs entirely in the browser.",
      "url": "https://github.com/gitnexus/gitnexus",
      "logoUrl": "https://github.githubassets.com/favicons/favicon.svg",
      "category": "devtools",
      "tags": ["Browser-based", "Knowledge Graph", "Code Intel"]
    },
    {
      "id": "langfuse",
      "name": "Langfuse",
      "description": "Observability and evaluation for LLM applications with traces, metrics, and prompt management.",
      "url": "https://langfuse.com",
      "logoUrl": "https://langfuse.com/favicon.ico",
      "category": "agent",
      "tags": ["Observability", "LLMOps", "Tracing"]
    }
]

added_count = 0
for tool in user_tools:
    url = tool["url"].strip("/").lower()
    # Special case: check if it's a sub-page of a known domain but with a distinct purpose
    # User said: "像那种重复的url就无需添加了，例如gpt，gpt5.3，实际地址都是一个，这样就不用了"
    # So if the URL is literally the same as an existing one, skip.
    if tool["id"] in existing_ids:
        print(f"SKIP (ID exists): {tool['id']}")
        continue
    
    # Check if url already exists
    if url in existing_urls:
        # Special check for github and generic subdomains if they are distinct tools
        # But per user request, keep it simple. If URL is identical, skip.
        print(f"SKIP (URL exists): {tool['name']} ({tool['url']})")
        continue

    # Add order 99 (placeholder for sorting)
    tool["order"] = 99
    data["resources"].append(tool)
    existing_ids.add(tool["id"])
    existing_urls.add(url)
    added_count += 1
    print(f"ADDED: {tool['name']} ({tool['id']})")

# Re-sort and re-number
cat_res = defaultdict(list)
for r in data["resources"]:
    cat_res[r["category"]].append(r)

for cat, items in cat_res.items():
    items.sort(key=lambda x: x["order"])
    for i, item in enumerate(items, 1):
        item["order"] = i

with open("my-app/data/ai-resources.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\nSuccessfully added {added_count} unique tools.")
