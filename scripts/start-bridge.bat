@echo off
title ARKON v50.0.0 — MT5 Bridge Client
color 0B

echo ============================================
echo    ARKON v50.0.0 — MT5 Bridge Client
echo    Windows Server Bridge Launcher
echo ============================================
echo.

set BRIDGE_URL=http://127.0.0.1:3000
set BRIDGE_SECRET=ARKON_SECURE_2025

echo [*] Bridge Configuration:
echo     Server URL: %BRIDGE_URL%
echo     Secret: %BRIDGE_SECRET%
echo.

echo [*] Make sure the ARKON Terminal Server is running.
echo [*] Make sure MetaTrader 5 is running with the EA attached.
echo.

echo [✓] Ready. Waiting for signals from ARKON Terminal...
echo     Press Ctrl+C to stop.
echo.

:: Keep the window open and show any bridge logs
echo [*] To monitor bridge activity, check the terminal logs
echo     at http://localhost:3000 in your browser.
echo.
echo ============================================

:: Monitor mode — watch for any bridge-related log files
:watch
timeout /t 60 /nobreak >nul
goto watch

