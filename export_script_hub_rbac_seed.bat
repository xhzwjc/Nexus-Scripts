@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "SCRIPT=%ROOT%\export_script_hub_rbac_seed.py"
set "PYTHON_EXE="

for %%P in (
    "%ROOT%\fastApiProject\.venv\Scripts\python.exe"
    "%ROOT%\fastApiProject\venv\Scripts\python.exe"
    "%ROOT%\fastApiProject\ven\Scripts\python.exe"
    "%ROOT%\.venv\Scripts\python.exe"
    "%ROOT%\venv\Scripts\python.exe"
    "%ROOT%\ven\Scripts\python.exe"
) do (
    if not defined PYTHON_EXE if exist %%~P set "PYTHON_EXE=%%~P"
)

if defined PYTHON_EXE (
    "%PYTHON_EXE%" "%SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

where py >nul 2>nul
if not errorlevel 1 (
    py -3 "%SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

where python >nul 2>nul
if not errorlevel 1 (
    python "%SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

echo Unable to find a usable Python interpreter.
exit /b 1
