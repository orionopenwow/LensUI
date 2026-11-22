@echo off
rem Lens UI - restore the normal Windows desktop.
rem Works with Lens UI closed or broken. If you have no desktop at all:
rem   Ctrl+Shift+Esc  ->  Run new task  ->  browse to this file (or type its full path)  ->  OK
title Lens UI - Restore Windows Shell

echo [Lens UI] Removing the per-user shell override...
reg delete "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /f >nul 2>&1

del /f /q "%APPDATA%\LensUI\shell-mode.marker" >nul 2>&1
del /f /q "%APPDATA%\LensUI\shell-boot-attempts" >nul 2>&1

echo [Lens UI] Starting Windows Explorer...
start "" "%SystemRoot%\explorer.exe"

echo.
echo [Lens UI] Done. Explorer is your Windows shell again, now and at every sign-in.
echo [Lens UI] Lens UI itself was not removed; it will run on top of Explorer as before.
timeout /t 6 >nul
