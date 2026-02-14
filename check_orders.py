import json, sys, io
from collections import defaultdict, Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    data = json.load(f)

categories = {c["id"]: c for c in data["categories"]}
resources = data["resources"]

# Check order conflicts within each category
cat_resources = defaultdict(list)
for r in resources:
    cat_resources[r["category"]].append(r)

has_conflict = False
for cat_id, items in sorted(cat_resources.items()):
    order_c = Counter(i["order"] for i in items)
    dups = {k: v for k, v in order_c.items() if v > 1}
    if dups:
        has_conflict = True
        cat_name = categories.get(cat_id, {}).get("name", cat_id)
        print(f"  CONFLICT in [{cat_name}] ({cat_id}):")
        for order, cnt in sorted(dups.items()):
            conflicting = [i for i in items if i["order"] == order]
            for c in conflicting:
                print(f"    order={order}: {c['name']} (id={c['id']})")

if not has_conflict:
    print("ALL ORDERS ARE CLEAN - No conflicts!")

print(f"\nTotal: {len(resources)} resources in {len(cat_resources)} categories")
for cat_id in sorted(cat_resources.keys(), key=lambda x: categories.get(x, {}).get("order", 999)):
    cat_name = categories.get(cat_id, {}).get("name", f"[{cat_id}]")
    print(f"  {cat_name}: {len(cat_resources[cat_id])} items")
