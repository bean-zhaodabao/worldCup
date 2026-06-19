@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  World Cup Lottery System - Dev Mode (with Vite)
::  API proxy + hot reload included
:: ============================================================
title World Cup Lottery System (Dev Mode)

set "ROOT_DIR=%~dp0"
set "ADMIN_DIR=%ROOT_DIR%..\admin"
cd /d "%ROOT_DIR%"

:: Normalize ADMIN_DIR
pushd "%ADMIN_DIR%" 2>nul
if %errorlevel% neq 0 (
    echo   ERROR: admin folder not found
    echo   Make sure admin/ is in the same parent folder as dist/
    pause >nul
    exit /b 1
)
set "ADMIN_DIR=%CD%"
popd

echo.
echo   ==========================================
echo     World Cup Lottery System (Dev Mode)
echo   ==========================================
echo.

:: ==================== 1. Check Node.js ====================
echo   [1/3] Checking Node.js...

where node >nul 2>&1
if %errorlevel% neq 0 (
    call :node_not_found
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo        Node.js: %NODE_VER%

for /f "tokens=1,2,3 delims=v." %%a in ("%NODE_VER%") do set NODE_MAJOR=%%b
if %NODE_MAJOR% lss 16 (
    echo.
    echo   WARNING: Vite needs Node.js 16+, current version may not work
    echo.
)

:: ==================== 2. Install Dependencies ====================
echo   [2/3] Checking dependencies...

cd /d "%ADMIN_DIR%"

if not exist "node_modules" (
    echo        Installing dependencies (npm install)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo   ERROR: npm install failed. Check your network.
        echo   You can also run manually:
        echo     cd admin
        echo     npm install
        echo.
        cd /d "%ROOT_DIR%"
        pause >nul
        exit /b 1
    )
    echo.
    echo        Done.
) else (
    echo        OK - node_modules found
)

:: ==================== 3. Start Vite Dev Server ====================
echo   [3/3] Starting Vite dev server...
echo.
echo   -----------------------------------------
echo     API Proxy: /api -^> http://worldcup.fumaokitchen.com
echo     Hot Reload: enabled
echo     Press Ctrl+C to stop
echo   -----------------------------------------
echo.

call npx vite --host

echo.
echo   Server stopped. Press any key to exit...
pause >nul
cd /d "%ROOT_DIR%"
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
cd /d "%ROOT_DIR%"
exit /b 1
