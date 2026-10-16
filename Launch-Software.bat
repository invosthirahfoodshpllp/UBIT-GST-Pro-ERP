@echo off
title "UBIT ERP - Multi-Company Billing and Accounting Suite"
cd /d "%~dp0"

echo =======================================================================
echo    UBIT ERP GST Billing Software - Local Launcher
echo =======================================================================
echo.

:: 1. Check if server is already running on port 5173
powershell -NoProfile -Command "try { $r = (Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 1).StatusCode; exit 0 } catch { exit 1 }" >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Local server is already running!
    echo Opening software in default browser...
    start "" http://localhost:5173/
    goto finish
)

:: 2. Launch high-speed native server if available
if exist "%~dp0ubit-server.exe" (
    echo Starting UBIT Native Engine...
    start "UBIT ERP Local Server" /min "%~dp0ubit-server.exe"
    goto wait_engine
)

:: 3. Otherwise launch PowerShell engine
if exist "%~dp0local-server.ps1" (
    echo Starting UBIT PowerShell Engine...
    start "UBIT ERP Local Server" /min powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0local-server.ps1"
    goto wait_engine
)

:wait_engine
echo Waiting for local engine to initialize...
set /a retries=0

:poll_loop
ping -n 2 127.0.0.1 >nul
powershell -NoProfile -Command "try { $r = (Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 1).StatusCode; exit 0 } catch { exit 1 }" >nul 2>nul
if %ERRORLEVEL% equ 0 goto engine_ready

set /a retries+=1
if %retries% lss 8 goto poll_loop

:engine_ready
echo.
echo =======================================================================
echo    Status      : ONLINE
echo    Access URL  : http://localhost:5173/
echo =======================================================================
echo.
echo Launching UBIT ERP in default browser...
start "" http://localhost:5173/

:finish
echo.
echo [i] Tip: You can minimize the background server window while using the software.
echo [i] To stop the local server at any time, run Stop-Server.bat.
ping -n 3 127.0.0.1 >nul
exit /b
