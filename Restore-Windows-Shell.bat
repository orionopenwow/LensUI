@echo off
rem Lens - restore the normal Windows desktop.
rem Works with Lens closed or broken. If you have no desktop at all:
rem   Ctrl+Shift+Esc  ->  Run new task  ->  browse to this file (or type its full path)  ->  OK
title Lens - Restore Windows Shell

echo [Lens] Removing the per-user shell override...
reg delete "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /f >nul 2>&1

del /f /q "%APPDATA%\LensUI\shell-mode.marker" >nul 2>&1
del /f /q "%APPDATA%\LensUI\shell-boot-attempts" >nul 2>&1

echo [Lens] Starting Windows Explorer...
start "" "%SystemRoot%\explorer.exe"

echo.
echo [Lens] Done. Explorer is your Windows shell again, now and at every sign-in.
echo [Lens] Lens itself was not removed; it will run on top of Explorer as before.
timeout /t 6 >nul
