#!/bin/bash

# 自动获取当前脚本所在目录
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
echo ""
echo "================================================="
echo "Starting all services in multiple terminals..."
echo "================================================="
echo ""
echo "Root directory: $ROOT"
echo ""

# 判断操作系统类型
OS="$(uname)"
if [[ "$OS" == "Darwin" ]]; then
    # macOS 系统
    echo "Detected macOS, starting services in Terminal..."

    # 前端服务（macOS Terminal 新窗口）
    osascript -e 'tell application "Terminal" to do script "cd '$ROOT'/my-app; npm run dev"'

    # 后端主服务（macOS Terminal 新窗口）
    osascript -e 'tell application "Terminal" to do script "cd '$ROOT'/fastApiProject; source ven/bin/activate; python3 run.py --reload"'

    # Agent服务（macOS Terminal 新窗口）
    osascript -e 'tell application "Terminal" to do script "cd '$ROOT'/fastApiProject; source ven/bin/activate; export AGENT_API_KEY='\''NjBkZGEwNjYtMmVmZS00ZjNlLTg1MTktOTM2Yzk4OGY5NTMx'\''; export AGENT_PORT='\''9200'\''; python3 server_agent.py"'

elif [[ "$OS" == "Linux" ]] || [[ "$OS" == "CYGWIN"* || "$OS" == "MINGW"* || "$OS" == "MSYS"* ]]; then
    # Windows 系统（通过Git Bash/WSL/CMD）
    echo "Detected Windows, starting services in Windows Terminal..."

    # 关键修改：将Windows Terminal命令写成单行，去掉^换行符
    wt --title "Frontend" -d "$ROOT/my-app" cmd /k "npm run dev" ; nt --title "Backend Main" -d "$ROOT/fastApiProject" powershell -NoExit -Command "& '.\ven\Scripts\Activate.ps1' ; python run.py --reload" ; nt --title "Agent Service" -d "$ROOT/fastApiProject" powershell -NoExit -Command "& '.\ven\Scripts\Activate.ps1' ; $env:AGENT_API_KEY = 'NjBkZGEwNjYtMmVmZS00ZjNlLTg1MTktOTM2Yzk4OGY5NTMx' ; $env:AGENT_PORT = '9200' ; python server_agent.py"

else
    echo "Unsupported operating system: $OS"
    exit 1
fi

echo ""
echo "All services started!"
read -p "Press Enter to exit..."  # 兼容Windows/macOS的暂停逻辑