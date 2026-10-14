@echo off
title GST Pro ERP - Multi-Company Billing & Accounting Suite
cd /d "%~dp0"
echo ========================================================
echo   GST Pro ERP - Multi-Company Billing & Accounting Suite
echo ========================================================
echo.
echo Launching application...

:: 1. Check if Node / npx is available
where npx >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Starting via Node.js serve...
    start "" http://localhost:5173
    npx -y serve -s . -l 5173
    exit /b
)

:: 2. Check if Python is available
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Starting via Python server...
    start "" http://localhost:8000
    python -m http.server 8000
    exit /b
)

:: 3. Built-in Windows PowerShell engine (Always available on every Windows PC!)
where powershell >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Starting via Built-in Windows Local Server...
    powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0local-server.ps1"
    exit /b
)

:: 4. Direct Browser Fallback
start "" index.html
