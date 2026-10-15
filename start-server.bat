@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
if errorlevel 1 (
  echo.
  echo Server startup failed. Check logs\server-error.log and logs\tunnel-error.log.
)
echo.
pause
