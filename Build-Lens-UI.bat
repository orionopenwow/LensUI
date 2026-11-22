@echo off
title LensUI - Build Standalone
cd /d "%~dp0"

echo [LensUI] Installing dependencies...
call bun install
if errorlevel 1 goto :fail

echo [LensUI] Building standalone release (no dev server, no terminal needed afterwards)...
call bun run tauri build
if errorlevel 1 goto :fail

echo.
echo [LensUI] Done. Installer:  src-tauri\target\release\bundle\
echo [LensUI]       Portable:   src-tauri\target\release\lens-ui.exe
pause
exit /b 0

:fail
echo.
echo [LensUI] Build failed - see the messages above.
pause
exit /b 1
