import base64
import json
import logging
import re
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests

from ..config import settings
from ..models import MobileTaskInfo, MobileTaskRequest

logger = logging.getLogger(__name__)

IMAGE_FILE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".heic",
    ".heif",
}
APP_FILE_PATH_PATTERN = re.compile(r"^app/\d{4}-\d{2}-\d{2}/[^/]+$")
DELIVERY_TIMEZONE = timezone(timedelta(hours=8))


def _normalize_delivery_file_type(
    file_type: Optional[str],
    file_name: Optional[str] = None,
    fallback_path: Optional[str] = None,
) -> str:
    for raw_value in (file_type, file_name, fallback_path):
        value = str(raw_value or "").strip()
        if not value:
            continue
        _, dot, suffix = value.rpartition(".")
        if dot and suffix:
            return f".{suffix.lower()}"
    return ""


def _is_image_delivery_file(file_type: str) -> bool:
    return file_type.lower() in IMAGE_FILE_EXTENSIONS


def _extract_delivery_filename(value: Optional[str]) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""

    parsed = urlparse(raw)
    if parsed.scheme:
        raw = parsed.path or raw.replace(f"{parsed.scheme}://", "", 1)

    normalized = raw.replace("\\", "/").rstrip("/")
    if not normalized:
        return ""
    return normalized.split("/")[-1]


def _resolve_delivery_date_segment(upload_time: Any = None) -> str:
    if isinstance(upload_time, (int, float)):
        timestamp = float(upload_time)
        if timestamp > 1_000_000_000_000:
            timestamp /= 1000
        if timestamp > 0:
            return datetime.fromtimestamp(timestamp, tz=DELIVERY_TIMEZONE).strftime("%Y-%m-%d")
    return datetime.now(DELIVERY_TIMEZONE).strftime("%Y-%m-%d")


def _build_delivery_file_path(file_name: str, upload_time: Any = None) -> str:
    return f"app/{_resolve_delivery_date_segment(upload_time)}/{file_name}"


def _normalize_delivery_file_path(
    file_path: Optional[str],
    file_name: str,
    upload_time: Any = None,
) -> str:
    raw = str(file_path or "").strip().lstrip("/")
    if raw and APP_FILE_PATH_PATTERN.match(raw):
        existing_name = raw.split("/")[-1]
        if existing_name == file_name:
            return raw
    return _build_delivery_file_path(file_name, upload_time)


def _normalize_delivery_attachment(attachment: Any) -> Any:
    if not isinstance(attachment, dict):
        return attachment

    normalized = dict(attachment)
    file_name = (
        _extract_delivery_filename(normalized.get("fileName"))
        or _extract_delivery_filename(normalized.get("filePath"))
        or _extract_delivery_filename(normalized.get("tempPath"))
    )
    if not file_name:
        return normalized

    upload_time = normalized.get("uploadTime")
    file_type = _normalize_delivery_file_type(
        normalized.get("fileType"),
        file_name,
        normalized.get("filePath") or normalized.get("tempPath"),
    )
    is_pic = 1 if _is_image_delivery_file(file_type) else 0

    temp_path = str(normalized.get("tempPath") or "").strip()
    if not temp_path.startswith("wxfile://"):
        temp_path = f"wxfile://{file_name}"

    normalized["fileName"] = file_name
    normalized["fileType"] = file_type
    normalized["tempPath"] = temp_path
    normalized["filePath"] = _normalize_delivery_file_path(normalized.get("filePath"), file_name, upload_time)
    normalized["isPic"] = is_pic
    normalized["isWx"] = 0 if is_pic else 1
    return normalized


def _normalize_delivery_payload(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    normalized_payload = dict(payload or {})
    attachments = normalized_payload.get("attachments")
    if isinstance(attachments, list):
        normalized_payload["attachments"] = [_normalize_delivery_attachment(item) for item in attachments]
    return normalized_payload


class MobileTaskService:
    """手机号任务服务类，处理手机号相关自动化任务"""

    def __init__(self, environment: str = None, silent: bool = False):
        self.environment = settings.resolve_environment(environment)
        self.base_url = self._get_base_url()
        if not silent:
            logger.info(f"[MobileTaskService] 初始化，环境: {self.environment}")

    def _get_base_url(self) -> str:
        """根据环境获取基础URL"""
        if self.environment == "prod":
            return "https://smp-api.seedlingintl.com"
        if self.environment == "local":
            return "http://localhost:8080"
        return "http://fwos-api-test.seedlingintl.com"

    def _parse_mobile_list(
        self,
        file_content: Optional[str],
        range_str: Optional[str],
        manual_mobiles: List[str],
    ) -> List[str]:
        """解析手机号列表，支持文件上传和手动输入"""
        mobiles: List[str] = []

        if file_content:
            try:
                file_content = file_content.strip()
                padding_needed = len(file_content) % 4
                if padding_needed:
                    file_content += "=" * (4 - padding_needed)

                decoded = base64.b64decode(file_content).decode("utf-8")
                file_mobiles = [
                    line.strip()
                    for line in decoded.replace("\r\n", "\n").split("\n")
                    if line.strip()
                ]
                mobiles.extend(file_mobiles)
            except Exception as exc:
                logger.error(f"解析文件内容失败: {exc}")
                raise ValueError(f"文件解析错误: {exc}") from exc

        mobiles.extend(manual_mobiles)
        mobiles = list(sorted(set(mobiles), key=mobiles.index))

        if range_str and mobiles:
            try:
                start_str, end_str = range_str.split("-")
                start = int(start_str) - 1
                end = int(end_str)

                if start < 0:
                    start = 0
                if end > len(mobiles):
                    end = len(mobiles)
                if start >= end:
                    raise ValueError("开始索引必须小于结束索引")

                mobiles = mobiles[start:end]
            except Exception as exc:
                logger.error(f"解析范围参数失败: {exc}")
                raise ValueError(f"范围解析错误: {exc}") from exc

        if not mobiles:
            raise ValueError("未提供有效的手机号")

        return mobiles

    def parse_mobile_numbers(self, file_content: str, range_str: Optional[str] = None) -> List[str]:
        """单独解析手机号，仅需要文件内容和范围参数"""
        mobiles: List[str] = []

        try:
            file_data = base64.b64decode(file_content)
            content = file_data.decode("utf-8", errors="ignore")

            for line in content.splitlines():
                line = line.strip()
                if line and line.isdigit() and len(line) == 11:
                    mobiles.append(line)

            if range_str:
                try:
                    start, end = map(int, range_str.split("-"))
                    start = max(0, start - 1)
                    end = min(len(mobiles), end)
                    mobiles = mobiles[start:end]
                except ValueError:
                    logger.warning(f"无效的范围格式: {range_str}，将使用全部号码")
        except Exception as exc:
            logger.error(f"文件解析错误: {exc}")

        mobiles = list(set(mobiles))
        logger.info(f"成功解析{len(mobiles)}个有效手机号")
        return mobiles

    def process_mobile_tasks(self, request: MobileTaskRequest) -> Dict[str, Any]:
        """处理手机号任务主方法"""
        request_id = str(uuid.uuid4())
        logger.info(f"开始处理手机号任务，请求ID: {request_id}，模式: {request.mode}")

        try:
            mobile_list = self._parse_mobile_list(
                file_content=request.file_content,
                range_str=request.range,
                manual_mobiles=request.mobiles,
            )
            logger.info(f"解析完成，共获取 {len(mobile_list)} 个手机号")

            automator = TaskAutomation(self.base_url)
            results = automator.batch_process(
                mobile_list=mobile_list,
                task_info=request.task_info,
                interval=request.interval_seconds,
                mode=request.mode,
                concurrent=request.concurrent_workers > 1,
                workers=request.concurrent_workers,
            )

            success_count = sum(1 for item in results if item["success"])
            failure_count = len(results) - success_count

            return {
                "success": True,
                "message": f"处理完成，共{len(results)}个手机号",
                "data": results,
                "request_id": request_id,
                "total": len(results),
                "success_count": success_count,
                "failure_count": failure_count,
            }
        except Exception as exc:
            logger.error(f"手机号任务处理出错，请求ID: {request_id}，错误: {exc}", exc_info=True)
            return {
                "success": False,
                "message": f"处理失败: {exc}",
                "data": [],
                "request_id": request_id,
                "total": 0,
                "success_count": 0,
                "failure_count": 0,
            }

    def delivery_login(self, mobile: str, code: str = "987654") -> Dict:
        """交互式登录"""
        automator = TaskAutomation(self.base_url)
        res = automator.sms_login(mobile, code)
        if res.get("code") == 0:
            return {
                "success": True,
                "token": res["data"]["accessToken"],
                "user": res["data"].get("userInfo", {}),
            }
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
        payload = _normalize_delivery_payload(payload)
        logger.info("=" * 60)
        logger.info("[交付物提交] 开始处理提交请求")
        logger.info(f"[交付物提交] Token: {token[:20]}...{token[-10:] if len(token) > 30 else token}")

        automator = TaskAutomation(self.base_url)
        automator.access_token = token
        automator.session.headers.update({"Authorization": f"Bearer {token}"})

        try:
            worker_info = automator.get_worker_info()
            if worker_info.get("code") == 0:
                user_data = worker_info.get("data", {})
                mobile = user_data.get("mobile", "未知")
                realname = user_data.get("realname", "未知")
                logger.info(f"[交付物提交] 提交人手机号: {mobile}")
                logger.info(f"[交付物提交] 提交人姓名: {realname}")
            else:
                logger.warning(f"[交付物提交] 无法获取用户信息: {worker_info.get('msg', '未知')}")
        except Exception as exc:
            logger.warning(f"[交付物提交] 获取用户信息失败: {exc}")

        task_id = payload.get("taskId", "未知")
        task_staff_id = payload.get("taskStaffId", "未知")
        task_assign_id = payload.get("taskAssignId", "未知")
        task_content = payload.get("taskContent", "无")
        report_name = payload.get("reportName", "无")
        report_address = payload.get("reportAddress", "无")
        supplement = payload.get("supplement", "无")

        logger.info(f"[交付物提交] 任务ID: {task_id}")
        logger.info(f"[交付物提交] TaskStaffId: {task_staff_id}")
        logger.info(f"[交付物提交] TaskAssignId: {task_assign_id}")
        logger.info(f"[交付物提交] 任务内容(taskContent): {task_content}")
        logger.info(f"[交付物提交] 报告名称(reportName): {report_name}")
        logger.info(f"[交付物提交] 报告地址(reportAddress): {report_address}")
        logger.info(f"[交付物提交] 补充说明(supplement): {supplement}")

        attachments = payload.get("attachments", [])
        pic_count = 0
        file_count = 0
        if attachments:
            logger.info(f"[交付物提交] 附件总数: {len(attachments)}")
            for index, attachment in enumerate(attachments, 1):
                if isinstance(attachment, dict):
                    is_pic = attachment.get("isPic", 0)
                    file_name = attachment.get("fileName", "未知")
                    file_path = attachment.get("filePath", attachment.get("tempPath", "未知"))
                    file_type = attachment.get("fileType", "未知")
                    file_length = attachment.get("fileLength", 0)

                    if is_pic == 1:
                        pic_count += 1
                        logger.info(
                            f"[交付物提交]   图片{pic_count}: {file_name} ({file_type}, {file_length}字节)"
                        )
                    else:
                        file_count += 1
                        logger.info(
                            f"[交付物提交]   文件{file_count}: {file_name} ({file_type}, {file_length}字节)"
                        )
                    logger.info(f"[交付物提交]       路径: {file_path}")
                else:
                    logger.info(f"[交付物提交]   附件{index}: {attachment}")
            logger.info(f"[交付物提交] 统计: 图片{pic_count}张, 文件{file_count}个")
        else:
            logger.info("[交付物提交] 附件总数: 0 (无附件)")

        logger.info(f"[交付物提交] 完整Payload: {json.dumps(payload, ensure_ascii=False, indent=2)}")
        logger.info("=" * 60)

        result = automator.submit_delivery(payload)
        logger.info(f"[交付物提交] 提交结果: {json.dumps(result, ensure_ascii=False)}")
        if result.get("code") == 0:
            logger.info("[交付物提交] 提交成功")
        else:
            logger.warning(f"[交付物提交] 提交失败: {result.get('msg', '未知错误')}")
        logger.info("=" * 60)
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

        self.session.headers.update(
            {
                "Content-Type": "application/json",
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/91.0.4472.124 Safari/537.36"
                ),
            }
        )

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
        except Exception as exc:
            return {"error": str(exc)}

    def sign_task(self, task_id: str) -> Dict:
        """报名任务"""
        return self._post("/app-api/applet/task/sign", {"taskId": task_id})

    def get_my_tasks_page(self, status_type: int = 0) -> Dict:
        """获取我的任务列表分页数据"""
        return self._post(
            "/app-api/applet/task/myTaskPage",
            {"pageNo": 1, "pageSize": 10, "statusType": status_type},
        )

    def get_my_tasks(self, task_id: str) -> Dict:
        """查询我的任务列表，返回taskStaffId和taskAssignId"""
        res = self.get_my_tasks_page(0)

        if res.get("error") or res.get("code") != 0:
            return {"error": f"获取任务失败: {res.get('msg', '未知错误')}"}

        for task in res.get("data", {}).get("list", []):
            if task.get("taskId") == task_id:
                return {
                    "taskStaffId": task.get("taskStaffId"),
                    "taskAssignId": task.get("taskAssignId"),
                }
        return {"error": f"未找到任务ID: {task_id}"}

    def upload_file(self, file_content: bytes, filename: str) -> Dict:
        """上传文件到服务器"""
        url = f"{self.base_url}/app-api/infra/file/upload"
        try:
            files = {"file": (filename, file_content)}
            headers = self.session.headers.copy()
            headers.pop("Content-Type", None)

            resp = requests.post(url, files=files, headers=headers, timeout=30)
            return resp.json()
        except Exception as exc:
            return {"error": str(exc)}

    def submit_delivery(self, payload: Dict) -> Dict:
        """提交交付物"""
        normalized_payload = _normalize_delivery_payload(payload)
        logger.info("[TaskAutomation.submit_delivery] 正在提交到: /app-api/applet/delivery/save")
        return self._post("/app-api/applet/delivery/save", normalized_payload)

    def get_worker_info(self) -> Dict:
        """获取工人信息（姓名、手机号等）"""
        return self.session.get(f"{self.base_url}/app-api/applet/worker/info", timeout=10).json()

    def get_balance_id(self) -> Dict:
        """获取待确认的结算单ID"""
        return self._post("/app-api/applet/balance/getConfirmedList", {"pageNo": 1, "pageSize": 20})

    def confirm_balance(self, balance_no: str) -> Dict:
        """确认结算单"""
        url = f"{self.base_url}/app-api/applet/balance/confirm?balanceNo={balance_no}"
        try:
            resp = self.session.post(url)
            return resp.json()
        except Exception as exc:
            return {"error": str(exc)}

    def process_single_user(self, mobile: str, task_info: MobileTaskInfo, mode: Optional[int] = None) -> Dict:
        """处理单个手机号任务流程"""
        result = self._init_result(mobile)

        try:
            result["steps"]["login"] = login_res = self.sms_login(mobile)
            if login_res.get("error"):
                raise Exception(login_res["error"])

            if mode is None:
                result["steps"]["sign"] = sign_res = self.sign_task(task_info.task_id)
                if sign_res.get("code") == 500:
                    raise Exception("报名失败：任务ID不存在！")
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
                    "attachments": task_info.attachments or [],
                }
                result["steps"]["delivery"] = delivery_res = self.submit_delivery(delivery_payload)
                if delivery_res.get("code") != 0:
                    raise Exception(f"交付物提交失败: {json.dumps(delivery_res, ensure_ascii=False)}")

                result["success"] = True
                return result

            if mode == 1:
                result["steps"]["sign"] = sign_res = self.sign_task(task_info.task_id)
                if sign_res.get("code") == 500:
                    raise Exception("报名失败：任务ID不存在！")
                if sign_res.get("code") != 0:
                    raise Exception(f"报名失败: {json.dumps(sign_res, ensure_ascii=False)}")
                result["success"] = True
                return result

            if mode == 2:
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
                    "attachments": task_info.attachments or [],
                }
                result["steps"]["delivery"] = delivery_res = self.submit_delivery(delivery_payload)
                if delivery_res.get("code") != 0:
                    raise Exception(f"交付物提交失败: {json.dumps(delivery_res, ensure_ascii=False)}")

                result["success"] = True
                return result

            if mode == 3:
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
        except Exception as exc:
            result["error"] = str(exc)
            logger.error(f"[{mobile}] 处理失败: {exc}")
        finally:
            self._reset_session()

        return result

    def batch_process(
        self,
        mobile_list: List[str],
        task_info: MobileTaskInfo,
        interval: float = 0.5,
        mode: Optional[int] = None,
        concurrent: bool = False,
        workers: int = 5,
    ) -> List[Dict]:
        results: List[Dict] = []

        if not concurrent:
            for index, mobile in enumerate(mobile_list, 1):
                logger.info(f"[顺序] 处理 {index}/{len(mobile_list)}: {mobile}")
                result = self.process_single_user(mobile, task_info, mode)
                results.append(result)
                time.sleep(interval)
            return results

        logger.info(f"[并发] 开始并发处理，线程数: {workers}")
        with ThreadPoolExecutor(max_workers=workers) as executor:
            future_to_mobile = {
                executor.submit(self._thread_process_wrapper, mobile, task_info, mode): mobile
                for mobile in mobile_list
            }

            for index, future in enumerate(as_completed(future_to_mobile), 1):
                mobile = future_to_mobile[future]
                try:
                    result = future.result()
                except Exception as exc:
                    result = {"mobile": mobile, "success": False, "error": str(exc), "steps": {}}
                    logger.error(f"[{mobile}] 异常: {exc}")
                results.append(result)
                logger.info(f"[并发] 已完成 {index}/{len(mobile_list)}: {mobile}")
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
        except Exception as exc:
            return {"error": str(exc)}

    def _reset_session(self):
        """清除会话状态"""
        self.access_token = None
        self.session.headers.pop("Authorization", None)

    @staticmethod
    def _init_result(mobile: str) -> Dict:
        return {"mobile": mobile, "steps": {}, "success": False, "error": None}
