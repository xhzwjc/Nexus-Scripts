"""
Fix all duplicates, order conflicts, and category issues in ai-resources.json.
This script:
1. Removes true duplicates (ollama x2)
2. Deduplicates tools that appear in both 'code' and 'devtools' (Aider, Lovable, etc.) - keep only in the more fitting category
3. Deduplicates Manus (keep one)
4. Updates Seedance 2.0 URL to be distinct
5. Re-numbers orders within each category to be sequential (1,2,3,...) with no gaps/conflicts
6. Fixes Claude Code URL to be distinct from Claude chat
7. Fixes Kimi Code URL to be distinct from Kimi chat
"""
import json, sys, io
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open("my-app/data/ai-resources.json", "r", encoding="utf-8") as f:
    data = json.load(f)

resources = data["resources"]
print(f"Before: {len(resources)} resources")

# --- Step 1: Remove exact duplicate ollama (2nd one) ---
seen_ids = set()
deduped = []
for r in resources:
    if r["id"] in seen_ids:
        print(f"  Removing exact duplicate: id={r['id']}, name={r['name']}")
        continue
    seen_ids.add(r["id"])
    deduped.append(r)
resources = deduped

# --- Step 2: Remove devtools duplicates that already exist in code category ---
# Aider: keep in devtools (it's a CLI dev tool), remove from code
# Lovable: keep in devtools (it's a dev platform), remove from code
# Continue: keep in devtools, remove from code (id=continue)
# v0: already has different IDs (v0 in code, v0-vercel in devtools) - keep v0 in code, remove v0-vercel from devtools
# Phind: already has different IDs (phind in search, phind-ai in devtools) - keep both, different purposes
# Replit: already has different IDs (replit in code, replit-agent in devtools) - keep both, different focuses

remove_ids = set()

# Aider: remove the one in 'code', keep in 'devtools'
code_aider = [r for r in resources if r["id"] == "aider" and r["category"] == "code"]
devtools_aider = [r for r in resources if r["id"] == "aider" and r["category"] == "devtools"]
if code_aider and devtools_aider:
    # Keep the devtools one, but there are two with same ID - merge: keep devtools version
    print(f"  Removing duplicate Aider from 'code' (keeping in 'devtools')")
    # Mark the code one for removal by index
    for r in resources:
        if r["id"] == "aider" and r["category"] == "code":
            r["_remove"] = True

# Lovable: remove the one in 'code', keep in 'devtools'  
for r in resources:
    if r["id"] == "lovable" and r["category"] == "code":
        print(f"  Removing duplicate Lovable from 'code' (keeping in 'devtools')")
        r["_remove"] = True

# Manus: remove manus-agent (keep manus)
for r in resources:
    if r["id"] == "manus-agent":
        print(f"  Removing duplicate Manus (manus-agent, keeping manus)")
        r["_remove"] = True

# v0-vercel: remove from devtools (already exists as v0 in code)
for r in resources:
    if r["id"] == "v0-vercel":
        print(f"  Removing duplicate v0 (v0-vercel in devtools, keeping v0 in code)")
        r["_remove"] = True

resources = [r for r in resources if not r.get("_remove")]

# --- Step 3: Fix URLs that should be distinct ---
for r in resources:
    if r["id"] == "claude-code":
        r["url"] = "https://docs.anthropic.com/en/docs/claude-code"
        print(f"  Fixed Claude Code URL")
    if r["id"] == "kimi-code":
        r["url"] = "https://github.com/anthropics/kimi-code"  # Actually moonshot
        r["url"] = "https://github.com/MoonshotAI/kimi-code"
        print(f"  Fixed Kimi Code URL")
    if r["id"] == "seedance-2":
        r["url"] = "https://seedance.doubao.com"
        print(f"  Fixed Seedance 2.0 URL")


# --- Step 4: Fix category assignments ---
# PentestGPT is more security than testing
for r in resources:
    if r["id"] == "pentestgpt":
        r["category"] = "security"
        print(f"  Moved PentestGPT: testing -> security")

# --- Step 5: Re-number orders within each category ---
cat_resources = defaultdict(list)
for r in resources:
    cat_resources[r["category"]].append(r)

for cat_id, items in cat_resources.items():
    items.sort(key=lambda x: x["order"])
    for i, item in enumerate(items, 1):
        item["order"] = i

# --- Step 6: Reassemble ---
data["resources"] = resources

with open("my-app/data/ai-resources.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\nAfter: {len(resources)} resources")
print("Done! File saved.")
