import uvicorn
import argparse
from app.main import app

if __name__ == "__main__":
    # 解析命令行参数
    parser = argparse.ArgumentParser(description="启动春苗系统结算API服务")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="服务绑定的主机地址")
    parser.add_argument("--port", type=int, default=3000, help="服务监听的端口号")
    parser.add_argument("--reload", action="store_true", help="开发模式下自动重载")
    args = parser.parse_args()

    # 启动服务
    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload
    )
