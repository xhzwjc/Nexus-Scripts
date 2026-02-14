import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for r in data["resources"]:
    if r["id"] == "seedance-2":
        r["url"] = "https://seed.bytedance.com/seedance2_0"
        print(f"Fixed: {r['name']} -> {r['url']}")

with open("my-app/data/ai-resources.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Done!")
