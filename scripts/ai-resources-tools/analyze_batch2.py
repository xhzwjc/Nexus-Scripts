"""
Analyze the user-provided 47 tools and filter out those with duplicate URLs or IDs already in the system.
"""
import json, sys, io

user_tools = [
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "url": "https://claude.ai", "category": "chat"},
    {"id": "gpt-5-3-codex", "name": "GPT-5.3 Codex", "url": "https://openai.com", "category": "code"},
    {"id": "glm-5", "name": "GLM-5", "url": "https://www.zhipuai.cn", "category": "chat"},
    {"id": "seedance-2", "name": "Seedance 2.0", "url": "https://www.seedance.ai", "category": "video"},
    {"id": "cowork-anthropic", "name": "Cowork (Anthropic)", "url": "https://www.anthropic.com/cowork", "category": "agent"},
    {"id": "claude-code-windows", "name": "Claude Code for Windows", "url": "https://claude.ai/code", "category": "code"},
    {"id": "github-agent-hq", "name": "GitHub Agent HQ", "url": "https://github.com", "category": "agent"},
    {"id": "bolt-new", "name": "Bolt.new", "url": "https://bolt.new", "category": "devtools"},
    {"id": "pomelli-google", "name": "Pomelli (Google)", "url": "https://google.com/pomelli", "category": "writing"},
    {"id": "wordpress-ai-assistant", "name": "WordPress AI Assistant", "url": "https://wordpress.com", "category": "writing"},
    {"id": "figma-claude-code", "name": "Figma + Claude Code", "url": "https://www.figma.com", "category": "design"},
    {"id": "doubao-2", "name": "Doubao 2.0 (豆包)", "url": "https://www.doubao.com", "category": "agent"},
    {"id": "vouch-github", "name": "Vouch", "url": "https://github.com/vouch-dev/vouch", "category": "devtools"},
    {"id": "visionclaw", "name": "VisionClaw", "url": "https://github.com/sseanliu/visionclaw", "category": "agent"},
    {"id": "mcp-excalidraw", "name": "Excalidraw MCP", "url": "https://github.com/ivarvdm/mcp_excalidraw", "category": "productivity"},
    {"id": "localgpt-memory", "name": "LocalGPT", "url": "https://github.com/localgpt/localgpt", "category": "chat"},
    {"id": "napkin-memory", "name": "Napkin", "url": "https://github.com/napkin-ai/napkin", "category": "agent"},
    {"id": "gondolin-sandbox", "name": "Gondolin", "url": "https://github.com/gondolin/gondolin", "category": "devtools"},
    {"id": "claude-pulse", "name": "Claude Pulse", "url": "https://github.com/NoobyGains/claude-pulse", "category": "productivity"},
    {"id": "obsync", "name": "Obsync", "url": "https://github.com/Santofer/Obsync", "category": "productivity"},
    {"id": "stik-notes", "name": "Stik", "url": "https://github.com/0xMassi/stik_app", "category": "productivity"},
    {"id": "moondream", "name": "Moondream", "url": "https://moondream.ai", "category": "image"},
    {"id": "unblocked-code-review", "name": "Unblocked", "url": "https://unblocked.io", "category": "devtools"},
    {"id": "albato-automation", "name": "Albato", "url": "https://albato.com", "category": "productivity"},
    {"id": "cartesia-sonic", "name": "Cartesia Sonic", "url": "https://cartesia.ai", "category": "audio"},
    {"id": "dvina-enterprise", "name": "Dvina", "url": "https://dvina.ai", "category": "agent"},
    {"id": "agihalo-router", "name": "Agihalo", "url": "https://agihalo.com", "category": "agent"},
    {"id": "qwen-3", "name": "Qwen 3", "url": "https://tongyi.aliyun.com", "category": "chat"},
    {"id": "alpie-core", "name": "Alpie Core", "url": "https://alpie.ai", "category": "other"},
    {"id": "raydian-webapp", "name": "Raydian", "url": "https://raydian.io", "category": "devtools"},
    {"id": "ai-browser", "name": "AI Browser", "url": "https://aibrowser.ai", "category": "agent"},
    {"id": "klariqo-voice", "name": "Klariqo AI Voice Assistants", "url": "https://klariqo.com", "category": "agent"},
    {"id": "waylight", "name": "Waylight", "url": "https://waylight.ai", "category": "productivity"},
    {"id": "granola-ai", "name": "Granola", "url": "https://granola.ai", "category": "productivity"},
    {"id": "trupeer-doc-writer", "name": "AI Doc Writer by Trupeer", "url": "https://trupeer.ai", "category": "writing"},
    {"id": "twinmind", "name": "TwinMind", "url": "https://twinmind.ai", "category": "productivity"},
    {"id": "snoops-reddit", "name": "Snoops.co", "url": "https://snoops.co", "category": "productivity"},
    {"id": "okara-ai", "name": "Okara", "url": "https://okara.ai", "category": "productivity"},
    {"id": "coverposts", "name": "Coverposts", "url": "https://coverposts.com", "category": "writing"},
    {"id": "name-drop-ai", "name": "Name-Drop.ai", "url": "https://namedrop.ai", "category": "productivity"},
    {"id": "imagine-art-2026", "name": "Imagine Art", "url": "https://www.imagine.art", "category": "image"},
    {"id": "gemini-3-1-pro", "name": "Gemini 3.1 Pro", "url": "https://gemini.google.com", "category": "chat"},
    {"id": "reddit-ai-shopping", "name": "Reddit AI Shopping Search", "url": "https://reddit.com", "category": "search"},
    {"id": "healthbridge", "name": "HealthBridge", "url": "https://healthbridge.ai", "category": "other"},
    {"id": "craftai", "name": "CraftAI", "url": "https://craft.ai", "category": "agent"},
    {"id": "gitnexus", "name": "GitNexus", "url": "https://github.com/gitnexus/gitnexus", "category": "devtools"},
    {"id": "langfuse", "name": "Langfuse", "url": "https://langfuse.com", "category": "agent"}
]

with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    data = json.load(f)

existing_ids = {r["id"] for r in data["resources"]}
existing_urls = {r["url"].strip("/").lower() for r in data["resources"]}

print("=== ANALYSIS ===")
to_add = []
for tool in user_tools:
    url = tool["url"].strip("/").lower()
    if tool["id"] in existing_ids:
        print(f"SKIP (ID exists): {tool['name']} ({tool['id']})")
    elif url in existing_urls:
        print(f"SKIP (URL exists): {tool['name']} ({tool['url']})")
    else:
        print(f"KEEP: {tool['name']} ({tool['url']})")
        to_add.append(tool["id"])

print(f"\nRecommended to add: {len(to_add)} tools.")
print(to_add)
