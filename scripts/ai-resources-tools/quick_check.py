import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    d = json.load(f)
rs = d["resources"]
# Check specifically for kimi-code, claude-code, codex-app
targets = ["kimi-code", "claude-code", "codex-app", "seedance-2"]
for t in targets:
    found = [r for r in rs if r["id"] == t]
    if found:
        for r in found:
            print(f"FOUND: id={r['id']}, name={r['name']}, cat={r['category']}, url={r['url']}")
    else:
        print(f"MISSING: id={t}")
