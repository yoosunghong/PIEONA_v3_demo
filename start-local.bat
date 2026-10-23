@echo off
setlocal
rem Restrict the server to this computer, even if .env specifies another HOST.
set "HOST=127.0.0.1"
echo Starting PIEONA locally. Close this CMD window to stop the server.
call "%~dp0start-server.bat" -NoTunnel %*
exit /b %errorlevel%
