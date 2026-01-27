"""
服务器监控服务
提供服务器配置管理和指标获取功能
"""
import httpx
from typing import List, Optional, Dict
from pydantic import BaseModel
from datetime import datetime
import json
import os
import asyncio
import logging
from datetime import datetime, timedelta
from .sms_service import SMSService

logger = logging.getLogger(__name__)

# 全局变量记录上次告警时间，避免频繁打扰
last_alert_time: Dict[str, datetime] = {}


# ========== 配置 ==========
AGENT_API_KEY = os.getenv("AGENT_API_KEY")
SERVERS_CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "servers.json")


# ========== 数据模型 ==========
class ServerConfig(BaseModel):
    """服务器配置"""
    id: str
    name: str
    host: str  # IP 或域名
    port: int = 9200
    enabled: bool = True
    description: Optional[str] = None
    tags: List[str] = []


class DiskInfo(BaseModel):
    """磁盘信息"""
    mount: str
    device: str
    fstype: Optional[str] = None
    total_gb: float
    used_gb: float
    free_gb: Optional[float] = None
    percent: float


class ServerMetrics(BaseModel):
    """服务器指标"""
    server_id: str
    server_name: str
    online: bool
    timestamp: Optional[str] = None
    hostname: Optional[str] = None
    os: Optional[str] = None
    platform: Optional[str] = None
    boot_time: Optional[str] = None
    process_count: Optional[int] = None
    
    # CPU
    cpu_percent: float = 0
    cpu_count: Optional[int] = None
    cpu_per_core: List[float] = []
    
    # 内存
    memory_percent: float = 0
    memory_total_gb: Optional[float] = None
    memory_used_gb: Optional[float] = None
    
    # 磁盘
    disks: List[DiskInfo] = []
    
    # 网络
    net_sent_mbps: float = 0
    net_recv_mbps: float = 0
    
    # 负载
    load_1min: float = 0
    load_5min: float = 0
    load_15min: float = 0
    
    # 错误信息
    error: Optional[str] = None


# ========== 服务器配置管理 ==========
def load_servers() -> List[ServerConfig]:
    """加载服务器配置"""
    try:
        if os.path.exists(SERVERS_CONFIG_FILE):
            with open(SERVERS_CONFIG_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return [ServerConfig(**s) for s in data]
    except Exception as e:
        print(f"Error loading servers config: {e}")
    return []


def save_servers(servers: List[ServerConfig]):
    """保存服务器配置"""
    try:
        os.makedirs(os.path.dirname(SERVERS_CONFIG_FILE), exist_ok=True)
        with open(SERVERS_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump([s.dict() for s in servers], f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving servers config: {e}")
        raise


def get_server_by_id(server_id: str) -> Optional[ServerConfig]:
    """根据 ID 获取服务器配置"""
    servers = load_servers()
    return next((s for s in servers if s.id == server_id), None)


def add_server(server: ServerConfig) -> bool:
    """添加服务器"""
    servers = load_servers()
    if any(s.id == server.id for s in servers):
        return False  # ID 已存在
    servers.append(server)
    save_servers(servers)
    return True


def update_server(server_id: str, server: ServerConfig) -> bool:
    """更新服务器配置"""
    servers = load_servers()
    for i, s in enumerate(servers):
        if s.id == server_id:
            servers[i] = server
            save_servers(servers)
            return True
    return False


def delete_server(server_id: str) -> bool:
    """删除服务器"""
    servers = load_servers()
    original_len = len(servers)
    servers = [s for s in servers if s.id != server_id]
    if len(servers) < original_len:
        save_servers(servers)
        return True
    return False


# ========== 指标获取 ==========
async def fetch_server_metrics(server: ServerConfig) -> ServerMetrics:
    """获取单台服务器指标（带鉴权）"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"http://{server.host}:{server.port}/metrics",
                headers={"X-API-Key": AGENT_API_KEY}
            )
            
            if resp.status_code == 401:
                return ServerMetrics(
                    server_id=server.id,
                    server_name=server.name,
                    online=False,
                    error="Authentication failed: Invalid API Key"
                )
            
            if resp.status_code != 200:
                return ServerMetrics(
                    server_id=server.id,
                    server_name=server.name,
                    online=False,
                    error=f"HTTP {resp.status_code}: {resp.text[:100]}"
                )
            
            data = resp.json()
            
            # 解析多磁盘
            disks = []
            for d in data.get("disks", []):
                try:
                    disks.append(DiskInfo(**d))
                except Exception:
                    continue
            
            return ServerMetrics(
                server_id=server.id,
                server_name=server.name,
                online=True,
                timestamp=data.get("timestamp"),
                hostname=data.get("hostname"),
                os=data.get("os"),
                platform=data.get("platform"),
                boot_time=data.get("boot_time"),
                process_count=data.get("process_count"),
                
                cpu_percent=data.get("cpu", {}).get("percent", 0),
                cpu_count=data.get("cpu", {}).get("count_logical"),
                cpu_per_core=data.get("cpu", {}).get("per_core", []),
                
                memory_percent=data.get("memory", {}).get("percent", 0),
                memory_total_gb=data.get("memory", {}).get("total_gb"),
                memory_used_gb=data.get("memory", {}).get("used_gb"),
                
                disks=disks,
                
                net_sent_mbps=data.get("network", {}).get("sent_mbps", 0),
                net_recv_mbps=data.get("network", {}).get("recv_mbps", 0),
                
                load_1min=data.get("load_average", {}).get("1min", 0),
                load_5min=data.get("load_average", {}).get("5min", 0),
                load_15min=data.get("load_average", {}).get("15min", 0)
            )
    except httpx.ConnectError:
        return ServerMetrics(
            server_id=server.id,
            server_name=server.name,
            online=False,
            error="Connection refused: Agent not running or host unreachable"
        )
    except httpx.TimeoutException:
        return ServerMetrics(
            server_id=server.id,
            server_name=server.name,
            online=False,
            error="Connection timeout"
        )
    except Exception as e:
        return ServerMetrics(
            server_id=server.id,
            server_name=server.name,
            online=False,
            error=str(e)
        )


async def get_all_metrics() -> List[ServerMetrics]:
    """并发获取所有服务器指标"""
    servers = load_servers()
    enabled_servers = [s for s in servers if s.enabled]
    
    if not enabled_servers:
        return []
    
    tasks = [fetch_server_metrics(s) for s in enabled_servers]
    return await asyncio.gather(*tasks)


async def check_server_health(server: ServerConfig) -> dict:
    """检查服务器健康状态（不需要鉴权）"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"http://{server.host}:{server.port}/health")
            if resp.status_code == 200:
                return {"online": True, "data": resp.json()}
            return {"online": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"online": False, "error": str(e)}


async def check_and_alert():
    """检查所有服务器状态并发送告警"""
    try:
        metrics_list = await get_all_metrics()
        # 默认管理员手机号，实际应从配置或者环境变量读取
        admin_phone = os.getenv("ADMIN_PHONE")
        if not admin_phone:
            logger.warning("No ADMIN_PHONE configured, skipping SMS alert")
            return

        sms = SMSService(environment="prod")
        
        for m in metrics_list:
            if not m.online:
                # 离线告警逻辑可按需添加，这里暂时忽略以免网络波动导致误报
                continue

            issues = []
            if m.cpu_percent > 90:
                issues.append(f"CPU {m.cpu_percent}%")
            if m.memory_percent > 90:
                issues.append(f"内存 {m.memory_percent}%")
            
            for disk in m.disks:
                if disk.percent > 95:
                    issues.append(f"磁盘({disk.mount}) {disk.percent}%")

            if issues:
                server_id = m.server_id
                now = datetime.now()
                last = last_alert_time.get(server_id)
                
                # 冷却时间 1小时
                if last and (now - last) < timedelta(hours=1):
                    continue

                reason = f"资源过高: {', '.join(issues)}"
                logger.warning(f"Sending alert for {m.server_name}: {reason}")
                
                # 使用 'task_fail' 模板: 您的任务${taskName}审核未通过，原因：${reason}，请及时处理。
                # 借用模板语义: taskName -> 服务器名, reason -> 告警详情
                res = sms.send_single(
                    template_code="task_fail",
                    mobiles=[admin_phone],
                    params={
                        "taskName": f"服务器监控[{m.server_name}]",
                        "reason": reason
                    }
                )
                
                if res.get("success"):
                    last_alert_time[server_id] = now
                    logger.info(f"Alert sent for {m.server_name}")
                else:
                    logger.error(f"Failed to send alert for {m.server_name}: {res.get('message')}")

    except Exception as e:
        logger.error(f"Error in check_and_alert: {e}")

