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
    # 使用 AppleScript 的 quoted form of 处理转义，避免命令里包含引号时语法炸掉
    osascript - "$script" <<'APPLESCRIPT'
on run argv
    set shellCommand to item 1 of argv
    tell application "Terminal"
        do script ("zsh -l -c " & quoted form of shellCommand)
        activate
    end tell
end run
APPLESCRIPT
}

ENV_SOURCE_CMD="if [ -f '$ROOT/.env' ]; then set -a; source '$ROOT/.env'; set +a; fi"

# 1. 启动前端服务（新Terminal窗口）
echo "🔄 启动前端服务 (my-app)..."
start_terminal_script "$ENV_SOURCE_CMD && cd '$ROOT/my-app' && npm run dev"

# 2. 启动后端主服务（新Terminal窗口，激活venv虚拟环境）
echo "🔄 启动后端主服务 (fastApiProject)..."
start_terminal_script "$ENV_SOURCE_CMD && cd '$ROOT/fastApiProject' && source '$VENV_DIR/bin/activate' && python3 run.py --reload"

# 3. 启动Agent服务（新Terminal窗口，激活venv虚拟环境+设置环境变量）
echo "🔄 启动Agent服务 (fastApiProject)..."
start_terminal_script "$ENV_SOURCE_CMD && cd '$ROOT/fastApiProject' && source '$VENV_DIR/bin/activate' && if [ -z \"\$AGENT_API_KEY\" ]; then echo '缺少 AGENT_API_KEY，请先在 $ROOT/.env 中配置'; exit 1; fi && export AGENT_PORT=\"\${AGENT_PORT:-9200}\" && python3 server_agent.py"

echo ""
echo "✅ 所有服务已启动！"
echo "📌 每个服务都在独立的Terminal窗口中运行"
echo "📝 若窗口无输出，可手动执行对应命令验证"
read -p "按 Enter 键关闭此提示窗口..."
