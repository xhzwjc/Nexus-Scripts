#!/usr/bin/env python3
"""Analyze ai-resources.json for duplicates, category issues, and order conflicts."""
import json
import sys
import io
from collections import defaultdict, Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    data = json.load(f)

categories = {c["id"]: c for c in data["categories"]}
resources = data["resources"]

print(f"=== OVERVIEW ===")
print(f"Categories: {len(categories)}")
print(f"Resources: {len(resources)}")
print()

# 1. Check duplicate IDs
print("=" * 60)
print("1. DUPLICATE IDs")
print("=" * 60)
id_counter = Counter(r["id"] for r in resources)
dups = {k: v for k, v in id_counter.items() if v > 1}
if dups:
    for rid, cnt in dups.items():
        items = [r for r in resources if r["id"] == rid]
        print(f"  [ERROR] ID '{rid}' appears {cnt} times:")
        for item in items:
            print(f"     - name={item['name']}, category={item['category']}, url={item['url']}")
else:
    print("  [OK] No duplicate IDs")
print()

# 2. Check duplicate names
print("=" * 60)
print("2. DUPLICATE Names")
print("=" * 60)
name_counter = Counter(r["name"] for r in resources)
dups_name = {k: v for k, v in name_counter.items() if v > 1}
if dups_name:
    for name, cnt in dups_name.items():
        items = [r for r in resources if r["name"] == name]
        print(f"  [ERROR] Name '{name}' appears {cnt} times:")
        for item in items:
            print(f"     - id={item['id']}, category={item['category']}, url={item['url']}")
else:
    print("  [OK] No duplicate Names")
print()

# 3. Check duplicate URLs
print("=" * 60)
print("3. DUPLICATE URLs")
print("=" * 60)
url_counter = Counter(r["url"] for r in resources)
dups_url = {k: v for k, v in url_counter.items() if v > 1}
if dups_url:
    for url, cnt in sorted(dups_url.items()):
        items = [r for r in resources if r["url"] == url]
        print(f"  [WARN] URL '{url}' appears {cnt} times:")
        for item in items:
            print(f"     - id={item['id']}, name={item['name']}, category={item['category']}")
else:
    print("  [OK] No duplicate URLs")
print()

# 4. Check invalid categories
print("=" * 60)
print("4. INVALID CATEGORY REFERENCES")
print("=" * 60)
invalid_cats = [(r["id"], r["name"], r["category"]) for r in resources if r["category"] not in categories]
if invalid_cats:
    for rid, rname, rcat in invalid_cats:
        print(f"  [ERROR] '{rname}' (id={rid}) refs non-existent category '{rcat}'")
else:
    print("  [OK] All category references valid")
print()

# 5. Check order conflicts within each category
print("=" * 60)
print("5. ORDER CONFLICTS (same order in same category)")
print("=" * 60)
cat_resources = defaultdict(list)
for r in resources:
    cat_resources[r["category"]].append(r)

has_conflicts = False
for cat_id, items in sorted(cat_resources.items()):
    order_counter = Counter(i["order"] for i in items)
    order_dups = {k: v for k, v in order_counter.items() if v > 1}
    if order_dups:
        has_conflicts = True
        cat_name = categories.get(cat_id, {}).get("name", cat_id)
        print(f"\n  [WARN] Category '{cat_name}' ({cat_id}):")
        for order, cnt in sorted(order_dups.items()):
            conflicting = [i for i in items if i["order"] == order]
            print(f"     order={order} has {cnt} resources:")
            for c in conflicting:
                print(f"       - {c['name']} (id={c['id']})")
if not has_conflicts:
    print("  [OK] No order conflicts")
print()

# 6. List all resources by category with order
print("=" * 60)
print("6. ALL RESOURCES BY CATEGORY")
print("=" * 60)
for cat_id in sorted(cat_resources.keys(), key=lambda x: categories.get(x, {}).get("order", 999)):
    cat_name = categories.get(cat_id, {}).get("name", f"[UNKNOWN:{cat_id}]")
    items = sorted(cat_resources[cat_id], key=lambda x: x["order"])
    print(f"\n  [{cat_name}] ({cat_id}) - {len(items)} items:")
    for i, item in enumerate(items):
        print(f"     {item['order']:3d}. {item['name']:<35s} id={item['id']}")
