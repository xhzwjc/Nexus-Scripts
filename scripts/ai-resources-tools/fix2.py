import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    data = json.load(f)

resources = data["resources"]

# 1. Add kimi-code back (lost during dedup)
kimi_code = {
    "id": "kimi-code",
    "name": "Kimi Code",
    "description": "月之暗面推出的开源代理式编程CLI，基于Kimi K2.5模型，支持视觉编程和Shell命令执行",
    "url": "https://github.com/MoonshotAI/kimi-code",
    "logoUrl": "https://kimi.moonshot.cn/favicon.ico",
    "category": "agent",
    "tags": ["月之暗面", "CLI", "视觉编程", "开源"],
    "order": 99  # will be re-ordered
}
resources.append(kimi_code)
print("Added kimi-code back")

# 2. Remove the duplicate Continue (keep continue-dev in devtools, remove continue from code)
resources = [r for r in resources if not (r["id"] == "continue" and r["category"] == "code")]
print("Removed duplicate Continue from 'code' (keeping continue-dev in devtools)")

# 3. Fix Seedance 2.0 URL if not already done
for r in resources:
    if r["id"] == "seedance-2" and r["url"] == "https://jimeng.jianying.com":
        r["url"] = "https://seedance.doubao.com"
        print("Fixed Seedance 2.0 URL")

# 4. Re-number orders in affected categories
from collections import defaultdict
cat_resources = defaultdict(list)
for r in resources:
    cat_resources[r["category"]].append(r)

for cat_id, items in cat_resources.items():
    items.sort(key=lambda x: x["order"])
    for i, item in enumerate(items, 1):
        item["order"] = i

data["resources"] = resources

with open("my-app/data/ai-resources.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Total: {len(resources)} resources")
print("Done!")
