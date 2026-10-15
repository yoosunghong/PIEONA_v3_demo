@echo off
setlocal
cd /d "%~dp0"
echo Restarting PIEONA server and tunnel...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
if errorlevel 1 goto stop_failed

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
if errorlevel 1 goto start_failed

echo.
echo PIEONA restart complete. Refresh your browser with Ctrl+F5.
pause
exit /b 0

:stop_failed
echo.
echo Failed to stop PIEONA. Restart was cancelled.
pause
exit /b 1

:start_failed
echo.
echo Server startup failed. Check logs\server-error.log and logs\tunnel-error.log.
pause
exit /b 1
