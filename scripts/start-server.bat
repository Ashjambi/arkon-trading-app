@echo off
title ARKON v50.0.0 — Quant Terminal Server
color 0A

echo ============================================
echo    ARKON v50.0.0 — Quant Terminal Server
echo    Windows Server Deployment Script
echo ============================================
echo.

:: ========== CONFIGURATION ==========
set PORT=3000
set WS_PORT=3001
set HOST=0.0.0.0
set NODE_ENV=production
:: ====================================

echo [*] Checking environment...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [*] Node.js version:
node --version

:: Check if node_modules exists
if not exist "%~dp0..\node_modules" (
    echo [*] Installing dependencies...
    cd /d "%~dp0.."
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [✓] Dependencies found.
)

echo.
echo [*] Starting ARKON Terminal Server...
echo     Port: %PORT%
echo     WS Port: %WS_PORT%
echo     Host: %HOST%
echo     Mode: %NODE_ENV%
echo.

:: Go to project root
cd /d "%~dp0.."

:: Start the server
set PORT=%PORT%
set HOST=%HOST%
set NODE_ENV=%NODE_ENV%

:: Using tsx for TypeScript execution
npx tsx src/server.ts

:: Fallback to npm if tsx fails
if %ERRORLEVEL% NEQ 0 (
    echo [*] Trying npm run dev...
    npm run dev
)

pause

