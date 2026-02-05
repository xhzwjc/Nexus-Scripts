import os
import json
import random
import requests
import logging
from typing import List, Dict, Optional, Any
from pymysql.cursors import DictCursor
from ..config import settings
from ..utils import DatabaseManager

logger = logging.getLogger(__name__)

class SMSService:
    def __init__(self, environment: str = None):
        self.environment = settings.resolve_environment(environment)
        # Adjust path to data directory: app/services/ -> app/ -> fastApiProject/ -> data
        self.template_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data")
        os.makedirs(self.template_dir, exist_ok=True)
        self.allowed_templates = {
            "biz_confirm_notice": "业务确认单通知",
            "biz_balance_notice": "业务结算单通知",
            "channel_open_notice": "渠道账户开通通知",
            "reset_worker_sign": "补发共享协议签约短信通知",
            "worker_sign_notice": "共享协议签约短信通知(dev)",
            "reset_tax_user_notice": "重置税局账户密码",
            "open_tax_user_notice": "开通税局账号通知模板",
            "batch_remind_notice": "批量提醒上传资料",
            "import_staff_notice": "上传人员后发送通知",
            "settled_remind": "合作者事后打款完成发短信",
            "settled_task_remind": "结算成功定时提醒上传材料",
            "user_add": "新增员工账号通知",
            "enterprise_expire": "企业续签通知",
            "enterprise_reopen": "企业重新开通通知",
            "reset_client_user_pwd": "企业用户重置密码",
            "pay_fail_notice": "账单支付失败通知",
            "recharge_notice": "充值失败通知",
            "amount_chg_notice": "余额变动通知",
            "stop_ent": "关停企业通知",
            "task_pass": "任务审核通过通知",
            "task_fail": "任务审核驳回通知",
            "invoice_apply_pass": "发票审核通过通知",
            "invoice_apply_fail": "发票审核驳回通知",
            "recharge_success": "充值成功通知",
            "recharge_fail": "充值失败通知",
            "balance_change": "账户余额通知",
            "pay_fail": "账单支付失败通知",
            "compliance_fail": "合规材料审核通知",
            "sign_notice": "电子签约通知",
            "open_notice": "开通企业通知模板"
        }
        self.default_params = {
            "eName": "默认企业名称",
            "entName": "测试企业有限公司",
            "userName": "company_admin",
            "eAccount": "test_account_123",
            "username": "test_user",
            "password": "Test@1234",
            "pwd": "TempPwd!2023",
            "newPwd": "NewPwd!2023",
            "date": "2025-12-31",
            "datetime": "2025-12-31 23:59:59",
            "deadline": "2025-12-31",
            "expireTime": "2025-12-31",
            "expreTime": "2025-12-12",
            "linkUrl": "SDFSHE",
            "loginUrl": "SDogin",
            "loginUr": "SDF",
            "signUrl": "SDF",
            "amount": "1000.00",
            "balance": "5000.00",
            "chgAmount": "-300.00",
            "curAmount": "4700.00",
            "count": "3",
            "payTimes": "2",
            "name": "张三",
            "nickName": "张小三",
            "nickname": "小三",
            "realName": "李四",
            "accountName": "王五企业",
            "applyNo": "APP20231231001",
            "auditRemark": "信息不完整，请补充",
            "concact": "18999999999",
            "reason": "工资发放",
            "role": "企业管理员",
            "taskName": "测试任务项目"
        }

    def _get_template_file_path(self):
        filename = "prod_templates.json" if self.environment == "prod" else "test_templates.json"
        return os.path.join(self.template_dir, filename)

    def update_templates(self, token: Optional[str] = None):
        """更新模板数据"""
        try:
            # 获取环境配置
            env_settings = self._get_env_settings(token)
            url = f"{env_settings['sms_api_base_url']}/page?pageNo=1&pageSize=50&type=2&code=&content=&apiTemplateId=&channelId=2"

            response = requests.get(url, headers=env_settings['sms_headers'], timeout=10)
            response.raise_for_status()
            data = response.json()

            if data.get('code') != 0:
                return {"code": 500, "success": False, "message": f"模版更新失败，原因: {data.get('msg', '未知错误')}",
                        "data": data}

            # 保存到文件
            file_path = self._get_template_file_path()
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            template_count = len(data.get('data', {}).get('list', []))
            return {
                "success": True,
                "message": f"成功更新 {template_count} 个模板",
                "data": data
            }
        except Exception as e:
            logger.error(f"更新模板失败: {str(e)}")
            return {"success": False, "message": f"更新模板失败: {str(e)}", "data": None}

    def get_templates(self):
        """获取模板列表"""
        try:
            file_path = self._get_template_file_path()
            if not os.path.exists(file_path):
                return {"success": False, "message": "没有可用模板，请先更新数据", "data": []}

            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    return {"success": False, "message": "模板文件为空，请先更新数据", "data": []}

                data = json.loads(content)
                templates = data.get('data', {}).get('list', [])
                return {
                    "success": True,
                    "message": f"获取到 {len(templates)} 个模板",
                    "data": templates
                }
        except Exception as e:
            logger.error(f"获取模板失败: {str(e)}")
            return {"success": False, "message": f"获取模板失败: {str(e)}", "data": []}

    def get_allowed_templates(self):
        """获取允许的模板列表（带名称）"""
        # 从模板文件中获取完整信息
        templates_res = self.get_templates()
        full_templates = templates_res.get("data", []) if templates_res["success"] else []
        template_map = {t["code"]: t for t in full_templates}

        allowed_list = []
        for code, name in self.allowed_templates.items():
            # 从完整模板中获取详细信息
            full_template = template_map.get(code, {})
            allowed_list.append({
                "id": full_template.get("id", ""),  # 补充id
                "code": code,
                "name": name,
                "content": full_template.get("content", ""),  # 补充内容
                "params": full_template.get("params", [])  # 补充参数
            })
        return allowed_list

    def send_single(self, template_code, mobiles, params, token: Optional[str] = None):
        """发送单模板短信"""
        try:
            # 检查模板是否存在
            templates_res = self.get_templates()
            if not templates_res["success"]:
                return templates_res

            template = next(
                (t for t in templates_res["data"] if t["code"] == template_code),
                None
            )
            if not template:
                return {"success": False, "message": f"模板 {template_code} 不存在，请更新数据", "data": None}

            # 合并参数
            final_params = {**self.default_params, **params}
            required_params = template.get('params', [])
            filtered_params = {k: v for k, v in final_params.items() if k in required_params}

            # 发送请求
            env_settings = self._get_env_settings(token)
            url = f"{env_settings['sms_api_base_url']}/send-sms"
            headers = {**env_settings['sms_headers'], 'Content-Type': 'application/json'}

            results = []
            for mobile in mobiles:
                payload = {
                    "mobile": mobile.strip(),
                    "templateCode": template_code,
                    "templateParams": filtered_params,
                    "content": template['content'],
                    "params": required_params
                }

                response = requests.post(
                    url,
                    headers=headers,
                    data=json.dumps(payload),
                    timeout=10
                )
                response.raise_for_status()
                results.append({
                    "mobile": mobile,
                    "result": response.json()
                })

            success_count = sum(1 for r in results if r["result"].get("code") == 0)
            return {
                "success": True,
                "message": f"发送完成，成功 {success_count}/{len(results)}",
                "data": results,
                "total": len(results),
                "success_count": success_count,
                "failure_count": len(results) - success_count
            }
        except Exception as e:
            logger.error(f"发送短信失败: {str(e)}")
            return {"success": False, "message": f"发送短信失败: {str(e)}", "data": None}

    def batch_send(self, template_codes, mobiles, random_send, token: Optional[str] = None):
        """批量发送允许的模板"""
        try:
            # 获取模板列表
            templates_res = self.get_templates()
            if not templates_res["success"]:
                return templates_res

            # 过滤有效的模板
            valid_templates = []
            invalid_codes = []
            for code in template_codes:
                template = next(
                    (t for t in templates_res["data"] if t["code"] == code),
                    None
                )
                if template:
                    valid_templates.append(template)
                else:
                    invalid_codes.append(code)

            if invalid_codes:
                return {
                    "success": False,
                    "message": f"模板 {', '.join(invalid_codes)} 不存在，请更新数据后再次尝试",
                    "data": None
                }

            # 处理手机号
            target_mobiles = mobiles
            if random_send and len(mobiles) > 1:
                # 随机选择不重复的手机号，最多选5个
                select_count = min(1, len(mobiles))
                target_mobiles = random.sample(mobiles, select_count)

            # 批量发送
            all_results = []
            for template in valid_templates:
                # 合并参数
                final_params = self.default_params.copy()
                required_params = template.get('params', [])
                # 补充缺失的必填参数
                for param in required_params:
                    if param not in final_params:
                        final_params[param] = f"auto_{param}"
                filtered_params = {k: v for k, v in final_params.items() if k in required_params}

                # 发送请求
                env_settings = self._get_env_settings(token)
                url = f"{env_settings['sms_api_base_url']}/send-sms"
                headers = {**env_settings['sms_headers'], 'Content-Type': 'application/json'}

                for mobile in target_mobiles:
                    payload = {
                        "mobile": mobile.strip(),
                        "templateCode": template["code"],
                        "templateParams": filtered_params,
                        "content": template['content'],
                        "params": required_params
                    }

                    response = requests.post(
                        url,
                        headers=headers,
                        data=json.dumps(payload),
                        timeout=10
                    )
                    response.raise_for_status()
                    all_results.append({
                        "mobile": mobile,
                        "template_code": template["code"],
                        "template_name": template["name"],
                        "result": response.json()
                    })

            success_count = sum(1 for r in all_results if r["result"].get("code") == 0)
            return {
                "success": True,
                "message": f"批量发送完成，成功 {success_count}/{len(all_results)}",
                "data": all_results,
                "total": len(all_results),
                "success_count": success_count,
                "failure_count": len(all_results) - success_count
            }
        except Exception as e:
            logger.error(f"批量发送失败: {str(e)}")
            return {"success": False, "message": f"批量发送失败: {str(e)}", "data": None}

    def fetch_workers(self, batch_no=None, mobiles=None, tax_id=None):
        """查询需要补发短信的工人信息"""
        if not batch_no and not mobiles:
            return {"success": False, "message": "批次号和手机号不能同时为空", "data": []}

        # 数据库配置
        db_config = settings.get_db_config(self.environment)

        # 构建SQL
        where_clauses = ["t.deleted = 0"]
        params = []

        if batch_no:
            where_clauses.append("t.batch_no = %s")
            params.append(batch_no)

        if mobiles:
            placeholders = ", ".join(["%s"] * len(mobiles))
            where_clauses.append(f"t.mobile IN ({placeholders})")
            params.extend(mobiles)

            where_clauses.append("t.tax_id = %s")
            params.append(tax_id)

        where_clause = " AND ".join(where_clauses)
        sql = f"""
        SELECT
            t.realname as name,
            t.mobile,
            t.worker_id,
            t.tax_id,
            DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 7 DAY), '%%Y-%%m-%%d') as deadline
        FROM
            biz_balance_worker t
            LEFT JOIN biz_enterprise_sign t1 ON t1.worker_id = t.worker_id AND t1.tax_id=t.tax_id
        WHERE
            {where_clause}
            AND (t1.sign_status IS NULL OR t1.sign_status <> 0)
        GROUP BY t.worker_id
        """
        try:
            with DatabaseManager(db_config) as conn:
                with conn.cursor(DictCursor) as cursor:
                    print(sql)
                    a = cursor.execute(sql, params)
                    workers = cursor.fetchall()

                    # 保存到文件
                    resend_file = os.path.join(self.template_dir, "resend_data.json")
                    with open(resend_file, 'w', encoding='utf-8') as f:
                        json.dump(workers, f, ensure_ascii=False, indent=2)

                    return {
                        "success": True,
                        "message": f"查询到 {len(workers)} 条需要补发的记录",
                        "data": workers
                    }
        except Exception as e:
            logger.error(f"查询工人信息失败: {str(e)}")
            return {"success": False, "message": f"查询失败: {str(e)}", "data": []}

    def resend_sms(self, workers, token: Optional[str] = None):
        """补发短信"""
        try:
            # 检查模板是否存在
            templates_res = self.get_templates()
            if not templates_res["success"]:
                return templates_res

            template_code = "worker_sign_notice"
            template = next(
                (t for t in templates_res["data"] if t["code"] == template_code),
                None
            )
            if not template:
                return {"success": False, "message": f"模板 {template_code} 不存在，请更新数据", "data": None}

            # 发送请求
            env_settings = self._get_env_settings(token)
            url = f"{env_settings['sms_api_base_url']}/send-sms"
            headers = {**env_settings["sms_headers"], 'Content-Type': 'application/json'}

            results = []
            for worker in workers:
                # 构造参数
                params = {
                    "name": worker["name"],
                    "deadline": worker["deadline"],
                    "signUrl": f"{worker['worker_id']}a{worker['tax_id']}"
                }

                # 合并默认参数
                final_params = {**self.default_params, **params}
                required_params = template.get('params', [])
                filtered_params = {k: v for k, v in final_params.items() if k in required_params}

                payload = {
                    "mobile": worker["mobile"].strip(),
                    "templateCode": template_code,
                    "templateParams": filtered_params,
                    "content": template['content'],
                    "params": required_params
                }

                response = requests.post(
                    url,
                    headers=headers,
                    data=json.dumps(payload),
                    timeout=10
                )
                response.raise_for_status()
                results.append({
                    "mobile": worker["mobile"],
                    "name": worker["name"],
                    "result": response.json()
                })

            success_count = sum(1 for r in results if r["result"].get("code") == 0)
            return {
                "success": True,
                "message": f"补发完成，成功 {success_count}/{len(results)}",
                "data": results,
                "total": len(results),
                "success_count": success_count,
                "failure_count": len(results) - success_count
            }
        except Exception as e:
            logger.error(f"补发短信失败: {str(e)}")
            return {"success": False, "message": f"补发短信失败: {str(e)}", "data": None}

    def _get_env_settings(self, token: Optional[str] = None):
        """
        获取当前环境对应的配置
        :param token: Optional[str] - Admin Access Token override
        """
        config = settings.get_sms_config(self.environment)
        
        # Override token if provided
        if token:
            config['headers']['Authorization'] = f"Bearer {token}"
            # Ensure correct tenant ID for the Admin API context if needed, but for SMS API often tenant-id is fixed to '1' or whatever.
            # However, user said "login -> get access token -> use it". 
            # If we are using the Admin Token, we might need to adjust tenant-id too?
            # The USER REQUEST says: "fetching sms logs... tenant-id: 1". 
            # The Login Request also has "tenant-id: 1".
            # My settings have SMS_TENANT_ID = "1". So it matches. I don't need to change tenant-id unless it's different.
        
        return {
            "sms_api_base_url": config["api_base_url"],
            "sms_headers": config["headers"]
        }

    def admin_login(self) -> Dict[str, Any]:
        """管理员登录获取Token"""
        is_prod = self.environment == "prod"
        base_url = settings.SMS_ADMIN_API_URL_PROD if is_prod else settings.SMS_ADMIN_API_URL_TEST
        
        # Payload (Password is ALREADY ENCRYPTED as per plan)
        payload = {
            "tenantName": settings.SMS_ADMIN_TENANT_NAME_PROD if is_prod else settings.SMS_ADMIN_TENANT_NAME_TEST,
            "username": settings.SMS_ADMIN_USERNAME_PROD if is_prod else settings.SMS_ADMIN_USERNAME_TEST,
            "password": settings.SMS_ADMIN_PASSWORD_PROD if is_prod else settings.SMS_ADMIN_PASSWORD_TEST,
            "code": settings.SMS_ADMIN_CAPTCHA_CODE,
            "captchaId": settings.SMS_ADMIN_CAPTCHA_ID,
            "rememberMe": True
        }
        
        url = f"{base_url}/system/auth/login"
        headers = {
            "content-type": "application/json",
            "tenant-id": settings.SMS_ADMIN_TENANT_ID_PROD if is_prod else settings.SMS_ADMIN_TENANT_ID_TEST
        }
        
        try:
            logger.info(f"Admin Login Request to {url} with user {payload['username']}")
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Admin Login Failed: {str(e)}")
            raise

    def get_sms_logs(self, token: str, page: int = 1, page_size: int = 10, 
                     mobile: str = None, send_status: str = None, 
                     receive_status: str = None,
                     send_time: List[str] = None, template_type: int = None,
                     template_id: str = None) -> Dict[str, Any]:
        """获取短信日志"""
        is_prod = self.environment == "prod"
        base_url = settings.SMS_ADMIN_API_URL_PROD if is_prod else settings.SMS_ADMIN_API_URL_TEST
        
        params = {
            "pageNo": page,
            "pageSize": page_size,
            "channelId": "",
            "templateId": template_id or "",
            "mobile": mobile or "",
            "sendStatus": send_status or "",
            "receiveStatus": receive_status or "",
            # "templateType": template_type if template_type is not None else "", # Backend doesn't support this
        }
        
        # Handle sendTime array format normally accepted by the upstream API
        # sendTime[0]=start&sendTime[1]=end
        if send_time and len(send_time) >= 2:
            params["sendTime[0]"] = send_time[0]
            params["sendTime[1]"] = send_time[1]
        
        url = f"{base_url}/system/sms-log/page"
        headers = {
            "authorization": f"Bearer {token}",
            "tenant-id": settings.SMS_ADMIN_TENANT_ID_PROD if is_prod else settings.SMS_ADMIN_TENANT_ID_TEST
        }
        
        try:
            response = requests.get(url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Fetch SMS Logs Failed: {str(e)}")
            raise
