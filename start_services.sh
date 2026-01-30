#!/bin/bash

# 自动获取当前脚本所在目录
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
echo ""
echo "================================================="
echo "Starting all services in macOS Terminal..."
echo "================================================="
echo ""
echo "Root directory: $ROOT"
echo ""

# 定义虚拟环境目录（改为 venv，匹配你的实际环境）
VENV_DIR="$ROOT/fastApiProject/venv"

# 验证虚拟环境激活脚本是否存在
if [ ! -f "$VENV_DIR/bin/activate" ]; then
    echo "⚠️  错误：虚拟环境激活脚本不存在！"
    echo "   检查路径：$VENV_DIR/bin/activate"
    echo "   fastApiProject 目录下的文件："
    ls -la "$ROOT/fastApiProject/" | grep -E "ven|venv"
    exit 1
fi

# 封装通用的Terminal启动函数（解决zsh环境加载问题）
start_terminal_script() {
    local script="$1"
    # 强制使用zsh，并先加载环境变量，再执行命令
    osascript -e "tell application \"Terminal\" to do script \"zsh -l -c '$script'\""
}

# 1. 启动前端服务（新Terminal窗口）
echo "🔄 启动前端服务 (my-app)..."
start_terminal_script "cd '$ROOT/my-app' && npm run dev"

# 2. 启动后端主服务（新Terminal窗口，激活venv虚拟环境）
echo "🔄 启动后端主服务 (fastApiProject)..."
start_terminal_script "cd '$ROOT/fastApiProject' && source '$VENV_DIR/bin/activate' && python3 run.py --reload"

# 3. 启动Agent服务（新Terminal窗口，激活venv虚拟环境+设置环境变量）
echo "🔄 启动Agent服务 (fastApiProject)..."
start_terminal_script "cd '$ROOT/fastApiProject' && source '$VENV_DIR/bin/activate' && export AGENT_API_KEY='NjBkZGEwNjYtMmVmZS00ZjNlLTg1MTktOTM2Yzk4OGY5NTMx' && export AGENT_PORT='9200' && python3 server_agent.py"

echo ""
echo "✅ 所有服务已启动！"
echo "📌 每个服务都在独立的Terminal窗口中运行"
echo "📝 若窗口无输出，可手动执行对应命令验证"
read -p "按 Enter 键关闭此提示窗口..."