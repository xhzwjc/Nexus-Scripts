import logging
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from ..orm_models import AiCategory, AiResource
from ..models import AICategoryBase, AIResourceBase

logger = logging.getLogger(__name__)

class AiResourceService:
    def __init__(self, db: Session):
        self.db = db

    def get_all_data(self) -> Dict[str, Any]:
        """Fetch all active categories and resources from MySQL"""
        categories = self.db.query(AiCategory).filter(AiCategory.deleted == 0).order_by(AiCategory.sort_order).all()
        resources = self.db.query(AiResource).filter(AiResource.deleted == 0).order_by(AiResource.sort_order).all()
        
        return {
            "categories": [
                {
                    "id": cat.category_id,
                    "name": cat.name,
                    "icon": cat.icon,
                    "order": cat.sort_order
                } for cat in categories
            ],
            "resources": [
                {
                    "id": res.resource_id,
                    "name": res.name,
                    "description": res.description,
                    "url": res.url,
                    "logoUrl": res.logo_url,
                    "category": res.category_id,
                    "tags": res.tags.split(",") if res.tags else [],
                    "order": res.sort_order
                } for res in resources
            ]
        }

    def save_all_data(self, categories_data: List[AICategoryBase], resources_data: List[AIResourceBase]):
        """Save all categories and resources (Overwrite strategy)"""
        try:
            # Sync Categories
            input_cat_ids = [cat.id for cat in categories_data]
            # Logical delete categories not in input
            self.db.query(AiCategory).filter(
                AiCategory.category_id.notin_(input_cat_ids),
                AiCategory.deleted == 0
            ).update({AiCategory.deleted: 1}, synchronize_session=False)
            
            for cat_in in categories_data:
                existing_cat = self.db.query(AiCategory).filter(AiCategory.category_id == cat_in.id).first()
                if existing_cat:
                    existing_cat.name = cat_in.name
                    existing_cat.icon = cat_in.icon
                    existing_cat.sort_order = cat_in.order
                    existing_cat.deleted = 0  # Re-activate if it was deleted
                    # updated_at will handle itself
                else:
                    new_cat = AiCategory(
                        category_id=cat_in.id,
                        name=cat_in.name,
                        icon=cat_in.icon,
                        sort_order=cat_in.order
                    )
                    self.db.add(new_cat)

            # Sync Resources
            input_res_ids = [res.id for res in resources_data]
            # Logical delete resources not in input
            self.db.query(AiResource).filter(
                AiResource.resource_id.notin_(input_res_ids),
                AiResource.deleted == 0
            ).update({AiResource.deleted: 1}, synchronize_session=False)

            for res_in in resources_data:
                existing_res = self.db.query(AiResource).filter(AiResource.resource_id == res_in.id).first()
                tags_str = ",".join(res_in.tags) if res_in.tags else ""
                if existing_res:
                    existing_res.name = res_in.name
                    existing_res.description = res_in.description
                    existing_res.url = res_in.url
                    existing_res.logo_url = res_in.logoUrl
                    existing_res.category_id = res_in.category
                    existing_res.tags = tags_str
                    existing_res.sort_order = res_in.order
                    existing_res.deleted = 0  # Re-activate if it was deleted
                else:
                    new_res = AiResource(
                        resource_id=res_in.id,
                        name=res_in.name,
                        description=res_in.description,
                        url=res_in.url,
                        logo_url=res_in.logoUrl,
                        category_id=res_in.category,
                        tags=tags_str,
                        sort_order=res_in.order
                    )
                    self.db.add(new_res)

            self.db.commit()
            return True
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to save AI resources to MySQL: {e}")
            raise e

    def delete_resource(self, resource_id: str):
        """Logically delete a resource from MySQL"""
        try:
            resource = self.db.query(AiResource).filter(AiResource.resource_id == resource_id).first()
            if resource:
                resource.deleted = 1
                self.db.commit()
                return True
            return False
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to delete resource {resource_id}: {e}")
            raise e
