import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from urllib.parse import quote_plus

from ..config import settings

logger = logging.getLogger(__name__)


class BizSceneTaskService:
    """业务场景与任务初始化服务"""

    # 6个业务场景配置（正确顺序）
    SCENE_TEMPLATES = [
        {
            "scene_name": "连续劳务|免报|指派",
            "scene_no": "YWCJ-000005",
            "first_industry_id": 1000,
            "second_industry_id": 1001,
            "task_type": 0,
            "business_occupation_id": 1,
            "business_type": 2,
            "is_exempt": True,
            "tax_rule": "[0]",
            "effect_type": 1,
            "scene_desc": "连续劳务|免报|指派",
        },
        {
            "scene_name": "连续劳务|不免报|指派",
            "scene_no": "YWCJ-000006",
            "first_industry_id": 1000,
            "second_industry_id": 1001,
            "task_type": 0,
            "business_occupation_id": 1,
            "business_type": 2,
            "is_exempt": False,
            "tax_rule": "[0]",
            "effect_type": 1,
            "scene_desc": "连续劳务|不免报|指派",
        },
        {
            "scene_name": "灵活用工|免报|指派",
            "scene_no": "YWCJ-000007",
            "first_industry_id": 1000,
            "second_industry_id": 1001,
            "task_type": 0,
            "business_occupation_id": 1,
            "business_type": 1,
            "is_exempt": False,
            "tax_rule": "[0]",
            "effect_type": 1,
            "scene_desc": "灵活用工|免报|指派",
        },
        {
            "scene_name": "灵活用工|免报|抢单",
            "scene_no": "YWCJ-000008",
            "first_industry_id": 1000,
            "second_industry_id": 1001,
            "task_type": 1,
            "business_occupation_id": 1,
            "business_type": 1,
            "is_exempt": False,
            "tax_rule": "[0]",
            "effect_type": 1,
            "scene_desc": "灵活用工|免报|抢单",
        },
        {
            "scene_name": "连续劳务|免报|抢单",
            "scene_no": "YWCJ-000009",
            "first_industry_id": 1000,
            "second_industry_id": 1001,
            "task_type": 1,
            "business_occupation_id": 1,
            "business_type": 2,
            "is_exempt": True,
            "tax_rule": "[0]",
            "effect_type": 1,
            "scene_desc": "连续劳务|免报|抢单",
        },
        {
            "scene_name": "连续劳务|不免报|抢单",
            "scene_no": "YWCJ-000010",
            "first_industry_id": 1000,
            "second_industry_id": 1001,
            "task_type": 1,
            "business_occupation_id": 1,
            "business_type": 2,
            "is_exempt": False,
            "tax_rule": "[0]",
            "effect_type": 1,
            "scene_desc": "连续劳务|不免报|抢单",
        },
    ]

    ASSIGN_TO_GRAB_SCENE_MAP = {
        "YWCJ-000005": "YWCJ-000009",
        "YWCJ-000006": "YWCJ-000010",
        "YWCJ-000007": "YWCJ-000008",
    }

    def __init__(self, environment: str = "test"):
        self.environment = environment
        db_config = settings.get_db_config(environment)
        db_uri = (
            f"mysql+pymysql://{db_config['user']}:{quote_plus(db_config['password'])}@"
            f"{db_config['host']}:{db_config['port']}/{db_config['database']}"
            "?charset=utf8mb4&connect_timeout=10"
        )
        self.engine = create_engine(
            db_uri,
            pool_size=5,
            pool_recycle=3600,
            pool_pre_ping=True
        )
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    def _get_session(self) -> Session:
        return self.SessionLocal()

    def init_scenes(self, scenes: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """初始化业务场景（批量插入，允许重复）"""
        request_id = str(uuid.uuid4())
        logger.info(f"[BizSceneInit] 开始添加业务场景，环境: {self.environment}，请求ID: {request_id}")

        templates = scenes if scenes else self.SCENE_TEMPLATES
        db = self._get_session()

        try:
            # 获取当前最大id（需同时考虑 biz_scene 和 biz_scene_template 两张表）
            max_scene_row = db.execute(text("SELECT COALESCE(MAX(id), 0) as max_id FROM biz_scene")).fetchone()
            max_template_row = db.execute(text("SELECT COALESCE(MAX(id), 0) as max_id FROM biz_scene_template")).fetchone()
            max_scene_id = max_scene_row[0] if max_scene_row and max_scene_row[0] else 0
            max_template_id = max_template_row[0] if max_template_row and max_template_row[0] else 0
            next_id = max(max_scene_id, max_template_id) + 1

            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            created_scenes = []

            for template in templates:
                is_exempt = template.get("is_exempt", False)
                business_type = template.get("business_type", 2)

                exemption_type = 1 if is_exempt and business_type == 2 else None
                report_type = 1 if is_exempt else 0
                invoice_category_ids = "1" if (business_type == 2 and is_exempt) else "2"

                sql = text("""
                    INSERT INTO biz_scene (
                        id, scene_name, scene_no, first_industry_id, second_industry_id,
                        task_type, business_occupation_id, invoice_category_ids,
                        business_type, exemption_type, report_type, tax_rule,
                        effect_type, effect_time, scene_desc, status,
                        creator, create_time, updater, update_time, deleted
                    ) VALUES (
                        :id, :scene_name, :scene_no, :first_industry_id, :second_industry_id,
                        :task_type, :business_occupation_id, :invoice_category_ids,
                        :business_type, :exemption_type, :report_type, :tax_rule,
                        :effect_type, :effect_time, :scene_desc, 1,
                        'system', :now, 'system', :now, b'0'
                    )
                """)
                params = {
                    **template,
                    "id": next_id,
                    "now": now,
                    "effect_time": now,
                    "exemption_type": exemption_type,
                    "report_type": report_type,
                    "invoice_category_ids": invoice_category_ids,
                    "scene_desc": template.get("scene_desc") or template.get("scene_name"),
                }
                db.execute(sql, params)
                scene_id = next_id
                next_id += 1
                created_scenes.append(template["scene_no"])
                logger.info(f"[BizSceneInit] 创建场景: {template['scene_no']}")

                # 插入场景模板字段配置
                scene_template_fields = [
                    ("任务名称", 1, "taskName", 1, "文本框对外展示的任务名称，\r\n\r\n需要与实际业务场景适配", "请输入任务名称，任务名称支持100字符，不支持特殊符号输入\n", 1, 1, 1, 1, 0, 0),
                    ("任务周期", -1, "taskCycle", 0, "依据任务时间长短填写截止时间，超过截至日期任务将变更为过期任务", "请选择时间周期", 1, 0, 1, 2, 0, 0),
                    ("任务地点", -2, "taskAddress", 0, None, "请详细填写任务地点", 1, 1, 1, 3, 0, 0),
                    ("任务概述", 2, "taskDesc", 0, "", "请输入10个字以上任务描述，任务描述需包含任务内容及任务要求，建议使用精炼语句分条列出", 1, 1, 1, 4, 0, 0),
                    ("任务人数", -3, "taskPeople", 0, None, "请输入该任务需要的具体人数：最多不超过1000人", 1, 0, 1, 5, 0, 0),
                    ("人员要求", 2, "personDesc", 0, None, "输入10个字以上任务要求，任务要求需体现接单者的能力与要求", 1, 1, 1, 6, 1, 1),
                    ("任务费用", -4, "taskCost", 1, "把个人发放的金额填写一个范围，不影响实际发放金额", None, 1, 0, 1, None, 0, 0),
                ]
                for i, (ele_name, ele_type, field_name, is_tips, tips, placeholder, is_required, need_sensitive, is_editable, rule_id, is_deleteable, _) in enumerate(scene_template_fields):
                    template_sql = text("""
                        INSERT INTO biz_scene_template (
                            id, scene_id, pid, ele_name, ele_type, field_name, is_tips, tips,
                            is_required, required_info, placeholder, props, options, rule_id, rules,
                            need_sensitive, sort, is_editable, is_deleteable, creator, create_time,
                            updater, update_time, deleted
                        ) VALUES (
                            :id, :scene_id, 0, :ele_name, :ele_type, :field_name, :is_tips, :tips,
                            :is_required, NULL, :placeholder, NULL, NULL, :rule_id, NULL,
                            :need_sensitive, :sort, :is_editable, :is_deleteable, 'system', :now,
                            'system', :now, b'0'
                        )
                    """)
                    template_params = {
                        "id": next_id + i,
                        "scene_id": scene_id,
                        "ele_name": ele_name,
                        "ele_type": ele_type,
                        "field_name": field_name,
                        "is_tips": is_tips,
                        "tips": tips or "",
                        "is_required": is_required,
                        "placeholder": placeholder or "",
                        "rule_id": rule_id,
                        "need_sensitive": need_sensitive,
                        "sort": i + 1,
                        "is_editable": is_editable,
                        "is_deleteable": is_deleteable,
                        "now": now,
                    }
                    db.execute(template_sql, template_params)
                next_id += len(scene_template_fields)

            db.commit()

            result = {
                "request_id": request_id,
                "created_count": len(created_scenes),
                "created_scenes": created_scenes,
            }
            logger.info(f"[BizSceneInit] 完成，请求ID: {request_id}，创建: {len(created_scenes)}")
            return result

        except Exception as exc:
            db.rollback()
            logger.error(f"[BizSceneInit] 失败: {exc}", exc_info=True)
            raise
        finally:
            db.close()

    def init_tasks(
        self,
        enterprise_id: int,
        tenant_id: int,
        tax_id: int,
        dept_id: int,
        creator: str = "system",
        enable_assign: bool = True,
        enable_grab: bool = True,
        enable_delivery_type_1: bool = True,
        enable_enterprise_delivery: bool = True,
    ) -> Dict[str, Any]:
        """初始化任务（幂等操作，已存在则跳过）"""
        request_id = str(uuid.uuid4())
        logger.info(f"[BizTaskInit] 开始添加任务，企业ID: {enterprise_id}，请求ID: {request_id}")
        logger.info(
            f"[BizTaskInit] 配置: enable_assign={enable_assign}, enable_grab={enable_grab}, "
            f"enable_delivery_type_1={enable_delivery_type_1}"
        )

        db = self._get_session()

        try:
            scene_map = self._get_scene_map(db)
            logger.info(f"[BizTaskInit] 获取到 {len(scene_map)} 个场景")

            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            created_tasks = []

            # task_name配置：(scene_no尾号) -> (scene_prefix, invoice_category_id, task1_suffix, task1_tax_rule, task2_suffix, task2_tax_rule)
            # invoice_category_id: 1=report_type=1, 2=report_type=0
            task_name_suffix_map = {
                5: ("连续劳务-免报",   1, "-不算税",      0, "-算税-不算增值", 1),
                6: ("连续劳务-不免报", 0, "-算税-算增值", 0, "-算税-不算增值", 1),
                7: ("灵活用工-免报",   0, "-不算税",      0, "-算税-不算增值", 1),
                8: ("灵活用工-免报",   0, "-不算税",      0, "-算税-不算增值", 1),
                9: ("连续劳务-免报",   1, "-不算税",      0, "-算税-不算增值", 1),
                10: ("连续劳务-不免报", 0, "-算税-算增值", 0, "-算税-不算增值", 1),
            }

            def build_task_params(assign_scene_no: str, scene_id: int, business_type: int, task_type: int) -> List[Dict]:
                """构建单个场景的task参数列表"""
                suffix = int(assign_scene_no.split("-")[-1])
                if suffix not in task_name_suffix_map:
                    return []
                scene_prefix, invoice_cat, t1_suffix, t1_tax, t2_suffix, t2_tax = task_name_suffix_map[suffix]

                params_list = []
                task_configs = [
                    ("连续劳务个税任务", t1_suffix, t1_tax),
                    ("个人薪金个税任务", t2_suffix, t2_tax),
                ]
                for task_type_label, task_suffix, tax_rule in task_configs:
                    for delivery_type in ([0, 1] if enable_delivery_type_1 else [0]) if enable_enterprise_delivery else ([1] if enable_delivery_type_1 else []):
                        delivery_label = "" if delivery_type == 0 else "-合作者"
                        task_name = f"{scene_prefix}-{task_type_label}{task_suffix}{delivery_label}"
                        params_list.append({
                            "scene_id": scene_id,
                            "business_type": business_type,
                            "task_type": task_type,
                            "task_name": task_name,
                            "invoice_category_id": invoice_cat,
                            "delivery_type": delivery_type,
                            "tax_rule": tax_rule,
                        })
                return params_list

            # 收集所有待插入任务
            all_task_params: List[Dict] = []

            if enable_assign:
                # 只遍历3个指派场景
                for assign_scene_no in ("YWCJ-000005", "YWCJ-000006", "YWCJ-000007"):
                    if assign_scene_no not in scene_map:
                        logger.warning(f"[BizTaskInit] 场景 {assign_scene_no} 不存在，跳过")
                        continue
                    scene_id = scene_map[assign_scene_no]["scene_id"]
                    params_list = build_task_params(assign_scene_no, scene_id, scene_map[assign_scene_no]["business_type"], task_type=0)
                    all_task_params.extend(params_list)

            if enable_grab:
                # 抢单任务：从指派参数复制，替换scene_id和task_type
                grab_scene_nos = ("YWCJ-000008", "YWCJ-000009", "YWCJ-000010")
                logger.info(f"[BizTaskInit] enable_grab=True, scene_map keys: {list(scene_map.keys())}")
                for i, assign_scene_no in enumerate(("YWCJ-000005", "YWCJ-000006", "YWCJ-000007")):
                    grab_scene_no = grab_scene_nos[i]
                    if grab_scene_no not in scene_map:
                        logger.warning(f"[BizTaskInit] 抢单场景 {grab_scene_no} 不存在，跳过")
                        continue
                    grab_scene_id = scene_map[grab_scene_no]["scene_id"]
                    params_list = build_task_params(grab_scene_no, grab_scene_id, scene_map[grab_scene_no]["business_type"], task_type=1)
                    all_task_params.extend(params_list)

            if not all_task_params:
                logger.info(f"[BizTaskInit] 没有需要创建的任务")
                return {"request_id": request_id, "created_count": 0, "created_tasks": []}

            # 获取当前最大id并插入
            max_id_row = db.execute(text("SELECT COALESCE(MAX(id), 0) as max_id FROM biz_task")).fetchone()
            next_task_id = (max_id_row[0] if max_id_row and max_id_row[0] else 0) + 1

            task_count = 0
            for params in all_task_params:
                task_count += 1
                task_no = f"TASK-{enterprise_id}-{task_count:04d}"

                task_desc = "我司因业务拓展需要，现招募具备家具行业经验的外部设计师，承接新中式餐桌椅系列产品的外观及结构设计工作。主要工作内容包括：①与我司产品负责人进行需求对接，明确设计风格与功能要求；②运用专业设计软件（如Rhino、CAD、KeyShot等）绘制产品平面图及三维效果图；③根据我司反馈意见进行多轮修改与优化，直至定稿；④交付完整设计源文件及成品输出文件。任务完成后按交付质量结算报酬，项目预计交付稿件不少于3套完整设计方案。"
                person_desc = "1. 具备3年以上家具/工业产品外观设计经验，有新中式风格设计案例优先；2. 熟练使用AutoCAD、Rhino或SolidWorks绘制平面与三维设计图；3. 能独立完成从需求沟通、方案提报到定稿修改的完整设计流程；4. 沟通表达能力强，能承受一定修改周期；5. 接受按成果质量计酬方式，具备较强责任心与交付意识。"
                task_content = '[{"eleName":"任务名称","eleType":1,"eleValue":"' + params["task_name"] + '","fieldName":"taskName","isDeleteable":0,"isEditable":0,"isRequired":1,"isTips":1,"needSensitive":1,"pid":0,"placeholder":"请输入任务名称，任务名称支持100字符，不支持特殊符号输入\\n","ruleId":1,"sort":1,"tips":"文本框对外展示的任务名称，\\r\\n\\r\\n需要与实际业务场景适配"},{"eleName":"任务周期","eleType":-1,"eleValue":"1;","fieldName":"taskCycle","isDeleteable":0,"isEditable":0,"isRequired":1,"isTips":0,"needSensitive":0,"pid":0,"placeholder":"请选择时间周期","ruleId":2,"sort":2,"tips":"依据任务时间长短填写截止时间，超过截至日期任务将变更为过期任务"},{"eleName":"任务地点","eleType":-2,"eleValue":"110000,110100,110101;北京市朝阳区某某街道","fieldName":"taskAddress","isDeleteable":0,"isEditable":0,"isRequired":1,"isTips":0,"needSensitive":1,"pid":0,"placeholder":"请详细填写任务地点","ruleId":3,"sort":3},{"eleName":"任务概述","eleType":2,"eleValue":"' + task_desc + '","fieldName":"taskDesc","isDeleteable":0,"isEditable":0,"isRequired":1,"isTips":0,"needSensitive":1,"pid":0,"placeholder":"请输入10个字以上任务描述，任务描述需包含任务内容及任务要求，建议使用精炼语句分条列出","ruleId":4,"sort":4,"tips":""},{"eleName":"任务人数","eleType":-3,"eleValue":"1","fieldName":"taskPeople","isDeleteable":0,"isEditable":0,"isRequired":1,"isTips":0,"needSensitive":0,"pid":0,"placeholder":"请输入该任务需要的具体人数：最多不超过1000人","ruleId":5,"sort":5},{"eleName":"人员要求","eleType":2,"eleValue":"' + person_desc + '","fieldName":"personDesc","isDeleteable":1,"isEditable":0,"isRequired":1,"isTips":0,"needSensitive":1,"pid":0,"placeholder":"输入10个字以上任务要求，任务要求需体现接单者的能力与要求","ruleId":6,"sort":6},{"eleName":"任务费用","eleType":-4,"eleValue":"1000;1000000","fieldName":"taskCost","isDeleteable":0,"isEditable":0,"isRequired":1,"isTips":1,"needSensitive":0,"pid":0,"sort":6,"tips":"把个人发放的金额填写一个范围，不影响实际发放金额"}]'

                sql = text("""
                    INSERT INTO biz_task (
                        id, enterprise_id, tenant_id, tax_id, dept_id,
                        service_rate, ladder_service_rate, scene_id,
                        pay_type, task_name, task_no, first_industry_id,
                        second_industry_id, task_type, invoice_category_id,
                        address_code, address_detail, task_desc, person_desc,
                        is_limit_people, people_num, min_cost, max_cost,
                        agreement_id, delivery_type, linker, link_mobile,
                        use_type, confirm_type, task_content, sign_people_num,
                        settle_times, settle_people_num, delivery_batch_no,
                        need_deliverables, status, audit_status, business_type,
                        report_type, tax_rule, upload_status, is_notify,
                        creator, create_time, updater, update_time, deleted
                    ) VALUES (
                        :id, :enterprise_id, :tenant_id, :tax_id, :dept_id,
                        0.06, :ladder_service_rate,
                        :scene_id, 0, :task_name, :task_no, 1000,
                        1001, :task_type, :invoice_category_id,
                        '110000,110100,110101', '北京市朝阳区某某街道', :task_desc, :person_desc,
                        1, 1, 1000, 1000000,
                        4, :delivery_type, '张三', '13800138000',
                        0, 1, :task_content, 0,
                        NULL, NULL, NULL,
                        1, 3, 1, :business_type,
                        :invoice_category_id, :tax_rule, 1, 1,
                        :creator, :now, :creator, :now, b'0'
                    )
                """)
                insert_params = {
                    "id": next_task_id,
                    "enterprise_id": enterprise_id,
                    "tenant_id": tenant_id,
                    "tax_id": tax_id,
                    "dept_id": dept_id,
                    "scene_id": params["scene_id"],
                    "business_type": params["business_type"],
                    "task_name": params["task_name"],
                    "task_no": task_no,
                    "task_type": params["task_type"],
                    "invoice_category_id": params["invoice_category_id"],
                    "delivery_type": params["delivery_type"],
                    "tax_rule": params["tax_rule"],
                    "creator": creator,
                    "now": now,
                    "task_desc": task_desc,
                    "person_desc": person_desc,
                    "task_content": task_content,
                    "ladder_service_rate": '[{"maxAmount":1000000,"minAmount":1000,"rate":0.06}]',
                }
                next_task_id += 1
                db.execute(sql, insert_params)
                created_tasks.append(params["task_name"])
                logger.info(f"[BizTaskInit] 创建任务: {params['task_name']} ({task_no})")

            db.commit()

            result = {
                "request_id": request_id,
                "created_count": len(created_tasks),
                "created_tasks": created_tasks,
            }
            logger.info(f"[BizTaskInit] 完成，请求ID: {request_id}，创建: {len(created_tasks)} 个任务")
            return result

        except Exception as exc:
            db.rollback()
            logger.error(f"[BizTaskInit] 失败: {exc}", exc_info=True)
            raise
        finally:
            db.close()

    def _get_scene_map(self, db: Session) -> Dict[str, Dict]:
        """获取场景映射 {scene_no: {"scene_id": id, "business_type": business_type}}"""
        scene_map: Dict[str, Dict] = {}
        try:
            rows = db.execute(text("""
                SELECT id, scene_no, business_type
                FROM biz_scene
                WHERE scene_no IN ('YWCJ-000005', 'YWCJ-000006', 'YWCJ-000007',
                                   'YWCJ-000008', 'YWCJ-000009', 'YWCJ-000010')
                AND id = (
                    SELECT MAX(id) FROM biz_scene bs2
                    WHERE bs2.scene_no = biz_scene.scene_no
                )
            """)).fetchall()
            for row in rows:
                scene_map[row[1]] = {"scene_id": row[0], "business_type": row[2]}
        except Exception as exc:
            logger.warning(f"[BizSceneTaskService] 获取场景映射失败: {exc}")
        return scene_map

    def get_enterprises(self) -> List[Dict[str, Any]]:
        """获取企业列表"""
        db = self._get_session()
        try:
            rows = db.execute(text("""
                SELECT DISTINCT e.id, e.enterprise_name, e.tenant_id
                FROM biz_enterprise_base e
                WHERE e.status NOT IN (1, 5, 6) AND e.deleted = 0
                ORDER BY e.id DESC
            """)).fetchall()
            return [{"id": row[0], "enterprise_name": row[1], "tenant_id": row[2]} for row in rows]
        except Exception as exc:
            logger.warning(f"[BizSceneTaskService] 获取企业列表失败: {exc}")
            return []
        finally:
            db.close()

    def get_departments(self, tenant_id: int) -> List[Dict[str, Any]]:
        """根据租户ID获取部门列表（从system_users表）"""
        db = self._get_session()
        try:
            rows = db.execute(text("""
                SELECT DISTINCT dept_id
                FROM system_users
                WHERE tenant_id = :tenant_id AND dept_id IS NOT NULL AND deleted = b'0'
                ORDER BY dept_id
            """), {"tenant_id": tenant_id}).fetchall()
            return [{"dept_id": row[0], "dept_name": f"部门{row[0]}"} for row in rows]
        except Exception as exc:
            logger.warning(f"[BizSceneTaskService] 获取部门列表失败: {exc}")
            return []
        finally:
            db.close()
