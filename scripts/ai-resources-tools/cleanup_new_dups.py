"""Remove duplicate entries where the same tool exists under two different IDs."""
import json, sys, io
from collections import defaultdict
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# These are duplicates - remove the NEW ones (my additions), keep the EXISTING ones
remove_ids = {
    "gamma-app",         # already exists as 'gamma' in productivity
    "suno-ai",           # already exists as 'suno' in audio
    "bolt-new",          # already exists as 'bolt' in code
    "qwen",              # already exists as 'tongyi' in chat
    "augment-code",      # already exists as 'augment' in code
    "sourcegraph-cody",  # already exists as 'cody' in code
    "napkin-ai",         # already exists as 'napkin' in productivity
}

before = len(data["resources"])
data["resources"] = [r for r in data["resources"] if r["id"] not in remove_ids]
after = len(data["resources"])

print(f"Removed {before - after} duplicates: {remove_ids}")

# Re-number orders
cat_resources = defaultdict(list)
for r in data["resources"]:
    cat_resources[r["category"]].append(r)
for cat_id, items in cat_resources.items():
    items.sort(key=lambda x: x["order"])
    for i, item in enumerate(items, 1):
        item["order"] = i

with open("my-app/data/ai-resources.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Total now: {after} resources")
print("Done!")
