@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "BOOTSTRAP_SCRIPT=%ROOT%\bootstrap_local_mysql_data.py"
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
    "%PYTHON_EXE%" "%BOOTSTRAP_SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

where py >nul 2>nul
if not errorlevel 1 (
    py -3 "%BOOTSTRAP_SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

where python >nul 2>nul
if not errorlevel 1 (
    python "%BOOTSTRAP_SCRIPT%" %*
    exit /b %ERRORLEVEL%
)

echo Unable to find a usable Python interpreter.
echo Checked project environments under fastApiProject and the repository root: .venv, venv, ven
echo You can also install Python and rerun this script; bootstrap_local_mysql_data.py will prefer a project interpreter when one exists.
exit /b 1
