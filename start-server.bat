@echo off
setlocal
cd /d "%~dp0"
title PIEONA Server - Close this window to stop
echo Restarting PIEONA server and tunnel...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
if errorlevel 1 goto failed

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo PIEONA stopped or startup failed. See the messages above and logs\.
pause
exit /b 1
