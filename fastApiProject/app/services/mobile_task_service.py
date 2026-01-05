import json
import logging
import time
import uuid
import base64
import requests
from typing import List, Dict, Optional, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from ..config import settings
from ..models import MobileTaskInfo, MobileTaskRequest

logger = logging.getLogger(__name__)

class MobileTaskService:
    """手机号任务服务类，处理手机号相关自动化任务"""

    def __init__(self, environment: str = None):
        self.environment = settings.resolve_environment(environment)
        self.base_url = self._get_base_url()
        logger.info(f"初始化手机号任务服务，环境: {self.environment}，基础URL: {self.base_url}")

    def _get_base_url(self) -> str:
        """根据环境获取基础URL"""
        if self.environment == "prod":
            return "https://smp-api.seedlingintl.com"
        elif self.environment == "local":
            return "http://localhost:8080"  # 假设本地环境URL
        return "http://fwos-api-test.seedlingintl.com"  # 测试环境

    def _parse_mobile_list(self, file_content: Optional[str], range_str: Optional[str], manual_mobiles: List[str]) -> \
            List[str]:
        """解析手机号列表，支持文件上传和手动输入"""
        mobiles = []

        # 处理文件内容
        if file_content:
            try:
                # 修复1：处理可能的Base64填充问题
                file_content = file_content.strip()
                padding_needed = len(file_content) % 4
                if padding_needed:
                    file_content += '=' * (4 - padding_needed)

                decoded = base64.b64decode(file_content).decode('utf-8')
                # 修复2：统一处理换行符，确保正确分割
                file_mobiles = [line.strip() for line in decoded.replace('\r\n', '\n').split('\n') if line.strip()]
                mobiles.extend(file_mobiles)
            except Exception as e:
                logger.error(f"解析文件内容失败: {str(e)}")
                raise ValueError(f"文件解析错误: {str(e)}")

        # 处理手动输入
        mobiles.extend(manual_mobiles)

        # 去重
        mobiles = list(sorted(set(mobiles), key=mobiles.index))  # 保持原始顺序去重

        # 处理范围
        if range_str and mobiles:
            try:
                start_str, end_str = range_str.split('-')
                start = int(start_str) - 1  # 转换为0基索引
                end = int(end_str)  # 保持结束索引为闭区间

                # 边界检查
                if start < 0:
                    start = 0
                if end > len(mobiles):
                    end = len(mobiles)
                if start >= end:
                    raise ValueError("开始索引必须小于结束索引")

                mobiles = mobiles[start:end]  # 切片是左闭右开，所以end不需要减1
            except Exception as e:
                logger.error(f"解析范围参数失败: {str(e)}")
                raise ValueError(f"范围解析错误: {str(e)}")

        if not mobiles:
            raise ValueError("未提供有效的手机号")

        return mobiles

    def parse_mobile_numbers(self, file_content: str, range_str: Optional[str] = None) -> List[str]:
        """
        单独解析手机号，仅需要文件内容和范围参数
        """
        mobiles = []

        try:
            # 解码base64文件内容
            file_data = base64.b64decode(file_content)
            content = file_data.decode('utf-8', errors='ignore')

            # 按行提取手机号
            for line in content.splitlines():
                line = line.strip()
                # 简单的手机号格式验证（11位数字）
                if line and line.isdigit() and len(line) == 11:
                    mobiles.append(line)

            # 处理范围筛选
            if range_str:
                try:
                    start, end = map(int, range_str.split('-'))
                    start = max(0, start - 1)  # 转换为0基索引
                    end = min(len(mobiles), end)
                    mobiles = mobiles[start:end]
                except ValueError:
                    logger.warning(f"无效的范围格式: {range_str}，将使用全部号码")

        except Exception as e:
            logger.error(f"文件解析错误: {str(e)}")
            # 解析错误时返回空列表，不抛出异常
        # 去重处理
        mobiles = list(set(mobiles))
        logger.info(f"成功解析{len(mobiles)}个有效手机号")
        return mobiles

    def process_mobile_tasks(self, request: MobileTaskRequest) -> Dict[str, Any]:
        """处理手机号任务主方法"""
        request_id = str(uuid.uuid4())
        logger.info(f"开始处理手机号任务，请求ID: {request_id}，模式: {request.mode}")

        try:
            # 解析手机号列表
            mobile_list = self._parse_mobile_list(
                file_content=request.file_content,
                range_str=request.range,
                manual_mobiles=request.mobiles
            )
            logger.info(f"解析完成，共获取 {len(mobile_list)} 个手机号")

            # 执行任务
            automator = TaskAutomation(self.base_url)
            results = automator.batch_process(
                mobile_list=mobile_list,
                task_info=request.task_info,
                interval=request.interval_seconds,
                mode=request.mode,
                concurrent=request.concurrent_workers > 1,
                workers=request.concurrent_workers
            )

            # 统计结果
            success_count = sum(1 for r in results if r["success"])
            failure_count = len(results) - success_count

            return {
                "success": True,
                "message": f"处理完成，共{len(results)}个手机号",
                "data": results,
                "request_id": request_id,
                "total": len(results),
                "success_count": success_count,
                "failure_count": failure_count
            }

        except Exception as e:
            logger.error(f"手机号任务处理出错，请求ID: {request_id}，错误: {str(e)}", exc_info=True)
            return {
                "success": False,
                "message": f"处理失败: {str(e)}",
                "data": [],
                "request_id": request_id,
                "total": 0,
                "success_count": 0,
                "failure_count": 0
            }

            self._reset_session()
        
        return result

    # Interactive Delivery Methods
    def delivery_login(self, mobile: str, code: str = "987654") -> Dict:
        """交互式登录"""
        automator = TaskAutomation(self.base_url)
        res = automator.sms_login(mobile, code)
        if res.get("code") == 0:
            return {"success": True, "token": res["data"]["accessToken"], "user": res["data"].get("userInfo", {})}
        return {"success": False, "msg": res.get("msg", "登录失败")}

    def delivery_get_tasks(self, token: str, status_type: int = 0) -> Dict:
        """获取任务列表"""
        automator = TaskAutomation(self.base_url)
        automator.access_token = token
        automator.session.headers.update({"Authorization": f"Bearer {token}"})
        return automator.get_my_tasks_page(status_type)

    def delivery_upload(self, token: str, file_content: bytes, filename: str) -> Dict:
        """上传附件"""
        automator = TaskAutomation(self.base_url)
        automator.access_token = token
        automator.session.headers.update({"Authorization": f"Bearer {token}"})
        return automator.upload_file(file_content, filename)

    def delivery_submit(self, token: str, payload: Dict) -> Dict:
        """提交交付物"""
        import logging
        logger = logging.getLogger(__name__)
        
        # 详细日志：记录提交请求
        logger.info("="*60)
        logger.info("[交付物提交] 开始处理提交请求")
        logger.info(f"[交付物提交] Token: {token[:20]}...{token[-10:] if len(token) > 30 else token}")
        
        # 解析并记录 payload 详情
        task_id = payload.get("taskId", "未知")
        task_staff_id = payload.get("taskStaffId", "未知")
        task_assign_id = payload.get("taskAssignId", "未知")
        task_name = payload.get("taskName", "未知")
        task_desc = payload.get("taskDesc", "未知")
        remark = payload.get("remark", "无")
        
        logger.info(f"[交付物提交] 任务ID: {task_id}")
        logger.info(f"[交付物提交] 任务名称: {task_name}")
        logger.info(f"[交付物提交] 任务描述: {task_desc}")
        logger.info(f"[交付物提交] TaskStaffId: {task_staff_id}")
        logger.info(f"[交付物提交] TaskAssignId: {task_assign_id}")
        logger.info(f"[交付物提交] 备注: {remark}")
        
        # 记录图片信息
        images = payload.get("images", [])
        if images:
            logger.info(f"[交付物提交] 图片数量: {len(images)}")
            for i, img_url in enumerate(images, 1):
                logger.info(f"[交付物提交]   图片{i}: {img_url}")
        else:
            logger.info("[交付物提交] 图片数量: 0 (无图片)")
        
        # 记录附件信息
        attachments = payload.get("attachments", [])
        if attachments:
            logger.info(f"[交付物提交] 附件数量: {len(attachments)}")
            for i, att in enumerate(attachments, 1):
                if isinstance(att, dict):
                    logger.info(f"[交付物提交]   附件{i}: 名称={att.get('name', '未知')}, URL={att.get('url', '未知')}")
                else:
                    logger.info(f"[交付物提交]   附件{i}: {att}")
        else:
            logger.info("[交付物提交] 附件数量: 0 (无附件)")
        
        # 记录完整 payload (JSON 格式)
        import json
        logger.info(f"[交付物提交] 完整Payload: {json.dumps(payload, ensure_ascii=False, indent=2)}")
        logger.info("="*60)
        
        automator = TaskAutomation(self.base_url)
        automator.access_token = token
        automator.session.headers.update({"Authorization": f"Bearer {token}"})
        
        result = automator.submit_delivery(payload)
        
        # 记录提交结果
        logger.info(f"[交付物提交] 提交结果: {json.dumps(result, ensure_ascii=False)}")
        if result.get("code") == 0:
            logger.info("[交付物提交] ✅ 提交成功")
        else:
            logger.warning(f"[交付物提交] ❌ 提交失败: {result.get('msg', '未知错误')}")
        logger.info("="*60)
        
        return result

    def delivery_worker_info(self, token: str) -> Dict:
        """获取工人信息"""
        automator = TaskAutomation(self.base_url)
        automator.access_token = token
        automator.session.headers.update({"Authorization": f"Bearer {token}"})
        return automator.get_worker_info()
class TaskAutomation:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.access_token: Optional[str] = None

        self.session.headers.update({
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        })

    def sms_login(self, mobile: str, code: str = "987654") -> Dict:
        """短信登录，成功后设置 Authorization"""
        url = f"{self.base_url}/app-api/app/auth/sms-login"
        try:
            resp = self.session.post(url, json={"mobile": mobile, "code": code}, timeout=10)
            data = resp.json()

            if data.get("code") != 0:
                raise ValueError(f"登录失败: {data.get('msg', '未知错误')}")

            self.access_token = data["data"].get("accessToken")
            if not self.access_token:
                raise ValueError("未获取到 accessToken")

            self.session.headers.update({"Authorization": f"Bearer {self.access_token}"})
            return data
        except Exception as e:
            return {"error": str(e)}

    def sign_task(self, task_id: str) -> Dict:
        """报名任务"""
        return self._post("/app-api/applet/task/sign", {"taskId": task_id})

    def get_my_tasks_page(self, status_type: int = 0) -> Dict:
        """获取我的任务列表分页数据"""
        return self._post("/app-api/applet/task/myTaskPage", {
            "pageNo": 1, "pageSize": 10, "statusType": status_type
        })

    def get_my_tasks(self, task_id: str) -> Dict:
        """查询我的任务列表，返回taskStaffId和taskAssignId"""
        res = self.get_my_tasks_page(0)

        if res.get("error") or res.get("code") != 0:
            return {"error": f"获取任务失败: {res.get('msg', '未知错误')}"}

        for task in res.get("data", {}).get("list", []):
            if task.get("taskId") == task_id:
                return {
                    "taskStaffId": task.get("taskStaffId"),
                    "taskAssignId": task.get("taskAssignId")
                }
        return {"error": f"未找到任务ID: {task_id}"}
    
    def upload_file(self, file_content: bytes, filename: str) -> Dict:
        """上传文件到服务器"""
        url = f"{self.base_url}/app-api/infra/file/upload"
        try:
            files = {'file': (filename, file_content)}
            # 注意：requests传files时不要手动设置Content-Type，它会自动设置boundary
            # 但我们需要保留Authorization等其他header
            headers = self.session.headers.copy()
            headers.pop("Content-Type", None) 
            
            resp = requests.post(url, files=files, headers=headers, timeout=30)
            return resp.json()
        except Exception as e:
            return {"error": str(e)}

    def submit_delivery(self, payload: Dict) -> Dict:
        """提交交付物"""
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[TaskAutomation.submit_delivery] 正在提交到: /app-api/applet/delivery/save")
        return self._post("/app-api/applet/delivery/save", payload)

    def get_worker_info(self) -> Dict:
        """获取工人信息（姓名、手机号等）"""
        return self.session.get(f"{self.base_url}/app-api/applet/worker/info", timeout=10).json()

    def get_balance_id(self) -> Dict:
        """获取待确认的结算单ID"""
        return self._post("/app-api/applet/balance/getConfirmedList", {
            "pageNo": 1, "pageSize": 20
        })

    def confirm_balance(self, balance_no: str) -> Dict:
        """确认结算单"""
        url = f"{self.base_url}/app-api/applet/balance/confirm?balanceNo={balance_no}"
        try:
            resp = self.session.post(url)
            return resp.json()
        except Exception as e:
            return {"error": str(e)}

    def process_single_user(self, mobile: str, task_info: MobileTaskInfo, mode: Optional[int] = None) -> Dict:
        """处理单个手机号任务流程"""
        result = self._init_result(mobile)

        try:
            # 登录
            result["steps"]["login"] = login_res = self.sms_login(mobile)
            if login_res.get("error"):
                raise Exception(login_res["error"])

            if mode is None:
                # 完整流程
                result["steps"]["sign"] = sign_res = self.sign_task(task_info.task_id)
                if sign_res.get("code") == 500:
                    raise Exception(f"报名失败：任务ID不存在！")
                if sign_res.get("code") != 0:
                    raise Exception(f"报名失败: {json.dumps(sign_res, ensure_ascii=False)}")

                result["steps"]["get_task_ids"] = task_ids = self.get_my_tasks(task_info.task_id)
                if task_ids.get("error"):
                    raise Exception(task_ids["error"])

                delivery_payload = {
                    "taskId": task_info.task_id,
                    "taskStaffId": task_ids["taskStaffId"],
                    "taskAssignId": task_ids["taskAssignId"],
                    "taskContent": task_info.task_content,
                    "reportName": task_info.report_name,
                    "reportAddress": task_info.report_address,
                    "supplement": task_info.supplement,
                    "attachments": task_info.attachments or []
                }
                result["steps"]["delivery"] = delivery_res = self.submit_delivery(delivery_payload)
                if delivery_res.get("code") != 0:
                    raise Exception(f"交付物提交失败: {json.dumps(delivery_res, ensure_ascii=False)}")

                result["success"] = True
                return result

            if mode == 1:
                # 登录+报名
                result["steps"]["sign"] = sign_res = self.sign_task(task_info.task_id)
                if sign_res.get("code") == 500:
                    raise Exception(f"报名失败：任务ID不存在！")
                if sign_res.get("code") != 0:
                    raise Exception(f"报名失败: {json.dumps(sign_res, ensure_ascii=False)}")
                result["success"] = True
                return result

            if mode == 2:
                # 登录+提交交付物
                result["steps"]["get_task_ids"] = task_ids = self.get_my_tasks(task_info.task_id)
                if task_ids.get("error"):
                    raise Exception(task_ids["error"])

                delivery_payload = {
                    "taskId": task_info.task_id,
                    "taskStaffId": task_ids["taskStaffId"],
                    "taskAssignId": task_ids["taskAssignId"],
                    "taskContent": task_info.task_content,
                    "reportName": task_info.report_name,
                    "reportAddress": task_info.report_address,
                    "supplement": task_info.supplement,
                    "attachments": task_info.attachments or []
                }
                result["steps"]["delivery"] = delivery_res = self.submit_delivery(delivery_payload)
                if delivery_res.get("code") != 0:
                    raise Exception(f"交付物提交失败: {json.dumps(delivery_res, ensure_ascii=False)}")

                result["success"] = True
                return result

            if mode == 3:
                # 登录+确认结算
                result["steps"]["get_balance_id"] = balance_res = self.get_balance_id()
                if balance_res.get("error") or balance_res.get("code") != 0:
                    raise Exception(f"获取结算单失败: {json.dumps(balance_res, ensure_ascii=False)}")

                balance_list = balance_res.get("data", {}).get("list", [])
                if not balance_list:
                    raise Exception("无可确认的结算单")

                matched_balance_no = None
                for item in balance_list:
                    if item.get("taskId") == task_info.task_id:
                        matched_balance_no = item.get("balanceNo")
                        break

                if not matched_balance_no:
                    raise Exception(f"未找到匹配的结算单，taskId={task_info.task_id}")

                result["steps"]["confirm_balance"] = confirm_res = self.confirm_balance(matched_balance_no)
                if confirm_res.get("error") or confirm_res.get("code") != 0:
                    raise Exception(f"确认结算失败: {json.dumps(confirm_res, ensure_ascii=False)}")

                result["success"] = True
                return result

            raise Exception(f"不支持的mode参数: {mode}")

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"[{mobile}] 处理失败: {e}")

        finally:
            self._reset_session()

        return result

    def batch_process(self, mobile_list: List[str], task_info: MobileTaskInfo, interval: float = 0.5,
                      mode: Optional[int] = None, concurrent: bool = False, workers: int = 5) -> List[Dict]:
        results = []

        if not concurrent:
            # 顺序执行
            for idx, mobile in enumerate(mobile_list, 1):
                logger.info(f"[顺序] 处理 {idx}/{len(mobile_list)}: {mobile}")
                result = self.process_single_user(mobile, task_info, mode)
                results.append(result)
                time.sleep(interval)
        else:
            # 并发执行
            logger.info(f"[并发] 开始并发处理，线程数: {workers}")
            with ThreadPoolExecutor(max_workers=workers) as executor:
                future_to_mobile = {
                    executor.submit(self._thread_process_wrapper, mobile, task_info, mode): mobile
                    for mobile in mobile_list
                }

                for idx, future in enumerate(as_completed(future_to_mobile), 1):
                    mobile = future_to_mobile[future]
                    try:
                        result = future.result()
                    except Exception as e:
                        result = {"mobile": mobile, "success": False, "error": str(e), "steps": {}}
                        logger.error(f"[{mobile}] 异常: {e}")
                    results.append(result)
                    logger.info(f"[并发] 已完成 {idx}/{len(mobile_list)}: {mobile}")
        return results

    def _thread_process_wrapper(self, mobile: str, task_info: MobileTaskInfo, mode: Optional[int]) -> Dict:
        """每个线程使用独立实例，避免并发冲突"""
        return TaskAutomation(self.base_url).process_single_user(mobile, task_info, mode)

    def _post(self, endpoint: str, data: Dict) -> Dict:
        """统一POST请求封装"""
        if not self.access_token:
            return {"error": "未登录或token失效"}
        try:
            resp = self.session.post(f"{self.base_url}{endpoint}", json=data, timeout=10)
            return resp.json()
        except Exception as e:
            return {"error": str(e)}

    def _reset_session(self):
        """清除会话状态"""
        self.access_token = None
        self.session.headers.pop("Authorization", None)

    @staticmethod
    def _init_result(mobile: str) -> Dict:
        return {"mobile": mobile, "steps": {}, "success": False, "error": None}
