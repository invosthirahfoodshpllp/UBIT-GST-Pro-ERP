@echo off
title "Stop UBIT ERP Server"
cd /d "%~dp0"

echo ========================================================
echo   Stopping UBIT ERP Local Server...
echo ========================================================
echo.

if exist "%~dp0ubit-server.exe" (
    "%~dp0ubit-server.exe" --stop >nul 2>nul
)

taskkill /F /IM ubit-server.exe >nul 2>nul

echo Local server has been stopped.
ping -n 3 127.0.0.1 >nul
exit /b
