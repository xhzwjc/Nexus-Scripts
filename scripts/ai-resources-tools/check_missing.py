import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    data = json.load(f)

existing_ids = {r["id"] for r in data["resources"]}
existing_names = {r["name"].lower() for r in data["resources"]}

# All notable tools to check
candidates = [
    "magnitude", "devin", "bolt", "bolt.new", "poolside",
    "meticulous", "checkly", "testim", "testcomplete",
    "hailuo", "minimax", "veo", "flux", "heygen", "synthesia", "runway",
    "ideogram", "udio", "suno",
    "n8n", "zapier", "notebooklm", "fathom", "granola", "reclaim",
    "braintrust", "arize", "phoenix",
    "devin", "openhands", "swe-agent", "windsurf",
    "garak", "xbow", "invicti", "burp",
    "gamma", "napkin", "canva",
    "copilot", "github-copilot", "gemini-code-assist",
    "trae", "augment", "sourcegraph",
    "notion", "linear", "clickup",
    "dify", "coze", "langchain", "crewai", "autogen",
    "deepseek", "qwen", "llama", "mistral",
    "comfyui", "stable-diffusion", "dall-e",
    "pika", "luma",
]

print("=== MISSING TOOLS ===")
for name in sorted(set(candidates)):
    if name not in existing_ids and name.lower() not in existing_names:
        # Also check partial matches
        partial = [r for r in data["resources"] if name.lower() in r["id"].lower() or name.lower() in r["name"].lower()]
        if partial:
            print(f"  PARTIAL MATCH for '{name}': {[(r['id'], r['name']) for r in partial]}")
        else:
            print(f"  MISSING: {name}")

print("\n=== EXISTING COUNT ===")
print(f"Total resources: {len(data['resources'])}")
