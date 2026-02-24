import json
import os
import shutil

# Path configuration
AI_RESOURCES_JSON = "e:/Python_project/project-root/my-app/data/ai-resources.json"
LOGOS_DIR = "e:/Python_project/project-root/my-app/public/ai-logos"

def cleanup_github_logos():
    if not os.path.exists(AI_RESOURCES_JSON):
        print(f"Error: {AI_RESOURCES_JSON} not found.")
        return

    with open(AI_RESOURCES_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)

    resources = data.get("resources", [])
    extensions = ['.png', '.jpg', '.jpeg', '.ico', '.svg', '.webp', '.gif']
    
    del_count = 0
    
    for r in resources:
        url = r.get("url", "")
        rid = r.get("id", "")
        
        # Check if it's a GitHub repo link
        if "github.com/" in url:
            # Try to find and delete local logo file
            found = False
            for ext in extensions:
                file_path = os.path.join(LOGOS_DIR, f"{rid}{ext}")
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        print(f"Deleted: {file_path} (ID: {rid})")
                        del_count += 1
                        found = True
                    except Exception as e:
                        print(f"Failed to delete {file_path}: {e}")
            
    print(f"\nCleanup finished. Deleted {del_count} local GitHub logos.")
    print("Now you can click 'Download Icons' in the web UI to re-fetch high-quality avatars.")

if __name__ == "__main__":
    cleanup_github_logos()
