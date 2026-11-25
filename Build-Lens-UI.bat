@echo off
title Lens - Build Standalone
cd /d "%~dp0"

echo [Lens] Installing dependencies...
call bun install
if errorlevel 1 goto :fail
if not exist ".dev\" mkdir ".dev"
copy /y "bun.lock" ".dev\bun.lock.installed" >nul

echo [Lens] Building standalone release (no dev server, no terminal needed afterwards)...
call bun run tauri build
if errorlevel 1 goto :fail

echo.
echo [Lens] Done. Installer:  src-tauri\target\release\bundle\
echo [Lens]       Portable:   src-tauri\target\release\lens-ui.exe
pause
exit /b 0

:fail
echo.
echo [Lens] Build failed - see the messages above.
pause
exit /b 1
