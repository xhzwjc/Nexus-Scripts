import json, sys, io
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    data = json.load(f)

resources = data["resources"]

# Duplicate IDs
id_c = Counter(r["id"] for r in resources)
dups = {k: v for k, v in id_c.items() if v > 1}
print("=== DUPLICATE IDs ===")
if not dups:
    print("  NONE")
for rid, cnt in dups.items():
    items = [r for r in resources if r["id"] == rid]
    print(f"  ID={rid} x{cnt}:")
    for i in items:
        print(f"    name={i['name']}, cat={i['category']}, url={i['url']}")

# Duplicate Names
name_c = Counter(r["name"] for r in resources)
dups_n = {k: v for k, v in name_c.items() if v > 1}
print("\n=== DUPLICATE Names ===")
if not dups_n:
    print("  NONE")
for n, cnt in dups_n.items():
    items = [r for r in resources if r["name"] == n]
    print(f"  Name={n} x{cnt}:")
    for i in items:
        print(f"    id={i['id']}, cat={i['category']}")

# Duplicate URLs
url_c = Counter(r["url"] for r in resources)
dups_u = {k: v for k, v in url_c.items() if v > 1}
print("\n=== DUPLICATE URLs ===")
if not dups_u:
    print("  NONE")
for u, cnt in sorted(dups_u.items()):
    items = [r for r in resources if r["url"] == u]
    print(f"  URL={u} x{cnt}:")
    for i in items:
        print(f"    id={i['id']}, name={i['name']}, cat={i['category']}")
