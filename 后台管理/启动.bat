@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  World Cup Lottery System - Quick Start
:: ============================================================
title World Cup Lottery System

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo.
echo   ==========================================
echo     World Cup Lottery System
echo   ==========================================
echo.

:: ==================== 1. Check Node.js ====================
echo   [1/2] Checking Node.js...

where node >nul 2>&1
if %errorlevel% neq 0 (
    call :node_not_found
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo        Node.js: %NODE_VER%

for /f "tokens=1,2,3 delims=v." %%a in ("%NODE_VER%") do set NODE_MAJOR=%%b
if %NODE_MAJOR% lss 14 (
    echo.
    echo   WARNING: Node.js %NODE_VER% is old, v14+ recommended
    echo.
)

:: ==================== 2. Start Server ====================
echo   [2/2] Starting web server...
echo.

node server.js

echo.
echo   Server stopped. Press any key to exit...
pause >nul
exit /b 0

:: ==================== Node.js Not Found ====================
:node_not_found
echo.
echo   ================================================================
echo     ERROR: Node.js is not installed
echo   ================================================================
echo.
echo     This project requires Node.js to run.
echo.
echo     Do you want to open the Node.js download page?
echo     (Recommended: LTS version)
echo.
echo     [Y] Yes, open download page
echo     [N] No, skip
echo.
set /p CHOICE="Your choice (Y/N): "

if /i "%CHOICE%"=="Y" (
    echo.
    echo   Opening Node.js download page...
    start "" "https://nodejs.org/en/download/"
    echo.
    echo   *** After installing Node.js, run this script again. ***
    echo   *** Keep default install options (auto-adds to PATH). ***
    echo.
    pause
) else (
    echo.
    echo   You can install Node.js manually from:
    echo   https://nodejs.org/en/download/
    echo.
    pause
)
exit /b 1
