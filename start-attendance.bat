@echo off
setlocal

cd /d "%~dp0"

echo Starting Attendance System backend...
echo.
call npm start

pause
