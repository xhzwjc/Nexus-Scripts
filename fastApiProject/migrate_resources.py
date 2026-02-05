import json
import os
import sys
from pathlib import Path

# Add the project root to sys.path to import app modules
sys.path.append(str(Path(__file__).parent))

from app.database import engine, Base, SessionLocal
from app.orm_models import AiCategory, AiResource
from app.config import settings

def migrate(force_recreate=True):
    print("Starting migration of AI resources to MySQL...")
    
    if force_recreate:
        print("Dropping existing AI tables to apply new schema (auto-increment ID + timestamps)...")
        AiResource.__table__.drop(engine, checkfirst=True)
        AiCategory.__table__.drop(engine, checkfirst=True)

    # 1. Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    print("Database tables ensured.")
    
    # 2. Path to the json file
    json_path = Path(__file__).parent.parent / "my-app" / "data" / "ai-resources.json"
    
    if not json_path.exists():
        print(f"Error: JSON file not found at {json_path}")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    db = SessionLocal()
    try:
        # Migrate Categories
        print(f"Migrating {len(data.get('categories', []))} categories...")
        for cat_data in data.get('categories', []):
            existing = db.query(AiCategory).filter(AiCategory.category_id == cat_data['id']).first()
            if not existing:
                cat = AiCategory(
                    category_id=cat_data['id'],
                    name=cat_data['name'],
                    icon=cat_data.get('icon'),
                    sort_order=cat_data.get('order', 99),
                    deleted=0
                )
                db.add(cat)
            else:
                existing.name = cat_data['name']
                existing.icon = cat_data.get('icon')
                existing.sort_order = cat_data.get('order', 99)
                existing.deleted = 0

        # Migrate Resources
        print(f"Migrating {len(data.get('resources', []))} resources...")
        for res_data in data.get('resources', []):
            existing = db.query(AiResource).filter(AiResource.resource_id == res_data['id']).first()
            tags_str = ",".join(res_data.get('tags', []))
            
            if not existing:
                res = AiResource(
                    resource_id=res_data['id'],
                    name=res_data['name'],
                    description=res_data.get('description'),
                    url=res_data['url'],
                    logo_url=res_data.get('logoUrl'),
                    category_id=res_data['category'],
                    tags=tags_str,
                    sort_order=res_data.get('order', 99),
                    deleted=0
                )
                db.add(res)
            else:
                existing.name = res_data['name']
                existing.description = res_data.get('description')
                existing.url = res_data['url']
                existing.logo_url = res_data.get('logoUrl')
                existing.category_id = res_data['category']
                existing.tags = tags_str
                existing.sort_order = res_data.get('order', 99)
                existing.deleted = 0

        db.commit()
        print("Migration completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
