@echo off
title LensUI
cd /d "%~dp0"

echo [LensUI] Cleaning up any previous LensUI / Vite instance...
taskkill /F /IM lens-ui.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":1420" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [LensUI] Starting fresh dev shell...
bun run tauri dev
pause
