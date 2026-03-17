@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "VENV_PY=%ROOT%\fastApiProject\venv\Scripts\python.exe"

if not exist "%VENV_PY%" (
    echo Missing Python venv at %VENV_PY%
    exit /b 1
)

"%VENV_PY%" "%ROOT%\bootstrap_local_mysql_data.py" %*
exit /b %ERRORLEVEL%
