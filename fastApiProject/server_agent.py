#!/usr/bin/env python3
"""
轻量服务器监控 Agent - 生产就绪版
支持 Windows / Linux / macOS
依赖：psutil, flask, waitress(Windows) / gunicorn(Linux)
内存占用 < 20MB，非阻塞设计
"""
import psutil
import platform
import socket
import time
import threading
import os
from datetime import datetime
from flask import Flask, jsonify, request, abort

app = Flask(__name__)

# ========== 配置 ==========
API_KEY = os.getenv("AGENT_API_KEY", "your-secret-api-key-here")  # 生产环境请设置环境变量
METRICS_CACHE_INTERVAL = 5  # 缓存刷新间隔（秒）
PORT = int(os.getenv("AGENT_PORT", 9200))

# ========== 认证中间件 ==========
@app.before_request
def check_auth():
    """API Key 鉴权"""
    if request.endpoint in ['health']:  # 健康检查免鉴权
        return
    if request.headers.get("X-API-Key") != API_KEY:
        abort(401, description="Unauthorized: Invalid API Key")

# ========== 指标缓存（避免阻塞） ==========
metrics_cache = {}
last_net_counters = None
last_net_time = None
cache_lock = threading.Lock()


def get_disk_info():
    """获取所有磁盘信息（跨平台）"""
    disks = []
    try:
        partitions = psutil.disk_partitions(all=False)
        for partition in partitions:
            try:
                # Windows 跳过可移动设备
                if platform.system() == "Windows":
                    if 'cdrom' in partition.opts or partition.fstype == '':
                        continue
                
                usage = psutil.disk_usage(partition.mountpoint)
                disks.append({
                    "mount": partition.mountpoint,
                    "device": partition.device,
                    "fstype": partition.fstype,
                    "total_gb": round(usage.total / (1024**3), 2),
                    "used_gb": round(usage.used / (1024**3), 2),
                    "free_gb": round(usage.free / (1024**3), 2),
                    "percent": round(usage.percent, 1)
                })
            except (PermissionError, OSError):
                continue
    except Exception as e:
        print(f"Error getting disk info: {e}")
    return disks


def update_metrics_cache():
    """后台线程更新指标缓存"""
    global metrics_cache, last_net_counters, last_net_time
    
    # 初始化 CPU 采样（第一次调用需要）
    psutil.cpu_percent(interval=None)
    time.sleep(0.1)
    
    while True:
        try:
            # CPU（非阻塞）
            cpu_percent = psutil.cpu_percent(interval=None)
            cpu_count = psutil.cpu_count()
            cpu_count_logical = psutil.cpu_count(logical=True)
            
            # 每核心 CPU 使用率
            cpu_per_core = psutil.cpu_percent(interval=None, percpu=True)
            
            # 内存
            mem = psutil.virtual_memory()
            
            # 多磁盘支持
            disks = get_disk_info()
            
            # 网络速率计算（差值）
            net = psutil.net_io_counters()
            current_time = time.time()
            
            net_speed = {"sent_mbps": 0.0, "recv_mbps": 0.0}
            if last_net_counters and last_net_time:
                time_delta = current_time - last_net_time
                if time_delta > 0:
                    sent_delta = net.bytes_sent - last_net_counters.bytes_sent
                    recv_delta = net.bytes_recv - last_net_counters.bytes_recv
                    # 转换为 Mbps (bytes -> bits -> Mb)
                    net_speed["sent_mbps"] = round((sent_delta / time_delta) * 8 / (1024**2), 2)
                    net_speed["recv_mbps"] = round((recv_delta / time_delta) * 8 / (1024**2), 2)
            
            last_net_counters = net
            last_net_time = current_time
            
            # 系统负载 (Linux/macOS only, Windows 返回 0)
            try:
                load_avg = psutil.getloadavg()
            except AttributeError:
                # Windows 不支持 getloadavg
                load_avg = (0, 0, 0)
            
            # 系统启动时间
            boot_time = datetime.fromtimestamp(psutil.boot_time()).isoformat()
            
            # 进程数
            process_count = len(psutil.pids())
            
            # 更新缓存
            with cache_lock:
                metrics_cache = {
                    "timestamp": datetime.now().isoformat(),
                    "hostname": socket.gethostname(),
                    "os": platform.system(),
                    "os_version": platform.version(),
                    "platform": platform.platform(),
                    "boot_time": boot_time,
                    "process_count": process_count,
                    
                    "cpu": {
                        "percent": cpu_percent,
                        "count_physical": cpu_count,
                        "count_logical": cpu_count_logical,
                        "per_core": cpu_per_core
                    },
                    
                    "memory": {
                        "total_gb": round(mem.total / (1024**3), 2),
                        "used_gb": round(mem.used / (1024**3), 2),
                        "available_gb": round(mem.available / (1024**3), 2),
                        "percent": mem.percent
                    },
                    
                    "disks": disks,
                    
                    "network": {
                        "sent_mbps": net_speed["sent_mbps"],
                        "recv_mbps": net_speed["recv_mbps"],
                        "total_sent_gb": round(net.bytes_sent / (1024**3), 2),
                        "total_recv_gb": round(net.bytes_recv / (1024**3), 2),
                        "packets_sent": net.packets_sent,
                        "packets_recv": net.packets_recv
                    },
                    
                    "load_average": {
                        "1min": round(load_avg[0], 2),
                        "5min": round(load_avg[1], 2),
                        "15min": round(load_avg[2], 2)
                    }
                }
        except Exception as e:
            print(f"Metrics update error: {e}")
        
        time.sleep(METRICS_CACHE_INTERVAL)


# 启动后台更新线程
metrics_thread = threading.Thread(target=update_metrics_cache, daemon=True)
metrics_thread.start()


@app.route('/metrics')
def get_metrics():
    """返回缓存的服务器指标（非阻塞）"""
    with cache_lock:
        if not metrics_cache:
            return jsonify({"error": "Metrics not ready, please wait..."}), 503
        return jsonify(metrics_cache)


@app.route('/health')
def health():
    """存活检测（无需鉴权）"""
    return jsonify({
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "hostname": socket.gethostname()
    })


@app.route('/')
def index():
    """根路径信息"""
    return jsonify({
        "name": "Server Monitoring Agent",
        "version": "1.0.0",
        "endpoints": {
            "/health": "Health check (no auth required)",
            "/metrics": "Server metrics (auth required)"
        }
    })


if __name__ == '__main__':
    print(f"Starting Server Monitoring Agent on port {PORT}...")
    print(f"API Key: {API_KEY[:8]}...{'*' * 16}")
    print(f"Metrics cache interval: {METRICS_CACHE_INTERVAL}s")
    
    # 判断操作系统选择服务器
    if platform.system() == "Windows":
        try:
            from waitress import serve
            print("Using Waitress server (Windows)")
            serve(app, host='0.0.0.0', port=PORT)
        except ImportError:
            print("Waitress not installed, using Flask dev server (not recommended for production)")
            print("Install with: pip install waitress")
            app.run(host='0.0.0.0', port=PORT, debug=False, threaded=True)
    else:
        # Linux/macOS - 提示使用 gunicorn
        print("For production, use: gunicorn server_agent:app -b 0.0.0.0:9200 --workers 1")
        app.run(host='0.0.0.0', port=PORT, debug=False, threaded=True)
