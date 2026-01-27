@echo off
setlocal

:: 自动获取当前脚本所在目录
set "ROOT=%~dp0"

:: 去掉末尾的反斜杠（如果有）
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo.
echo =================================================
echo Starting all services in ONE Windows Terminal...
echo =================================================
echo.
echo Root directory: %ROOT%
echo.

:: 核心修改说明：
:: 1. 所有的路径用 -d 参数直接指定，防止找不到文件。
:: 2. PowerShell 命令里的分号 ; 全部改成了 \; (这是关键！)。
:: 3. 这一整段其实是一行命令，用 ^ 符号换行是为了你看得清楚。

wt --title "Frontend" -d "%ROOT%\my-app" cmd /k "npm run dev" ^
; nt --title "Backend Main" -d "%ROOT%\fastApiProject" powershell -NoExit -Command "& '.\ven\Scripts\Activate.ps1' \; python run.py --reload" ^
; nt --title "Agent Service" -d "%ROOT%\fastApiProject" powershell -NoExit -Command "& '.\ven\Scripts\Activate.ps1' \; $env:AGENT_API_KEY = 'NjBkZGEwNjYtMmVmZS00ZjNlLTg1MTktOTM2Yzk4OGY5NTMx' \; $env:AGENT_PORT = '9200' \; python server_agent.py"

echo.
echo All services started!
pause