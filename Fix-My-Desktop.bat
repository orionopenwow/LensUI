@echo off
rem Lens UI - recovery. Use this if Lens windows show "Hmmm... can't reach this page /
rem localhost refused to connect", cover the screen, or won't close. Safe to run any time.
rem Closes Lens, stops it starting at sign-in, makes Explorer the shell and restarts the taskbar.
rem Your settings in %APPDATA%\LensUI are left alone.
title Lens UI - Fix my desktop
echo [Lens UI] Closing Lens UI...
taskkill /F /IM lens-ui.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":1420" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo [Lens UI] Stopping Lens from starting at sign-in...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v LensUI /f >nul 2>&1
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" /v LensUI /f >nul 2>&1

echo [Lens UI] Making Explorer your shell again...
reg delete "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /f >nul 2>&1
del /f /q "%APPDATA%\LensUI\shell-mode.marker" >nul 2>&1
del /f /q "%APPDATA%\LensUI\shell-boot-attempts" >nul 2>&1

echo [Lens UI] Restarting Explorer and the taskbar...
taskkill /F /IM explorer.exe >nul 2>&1
timeout /t 2 >nul
start "" "%SystemRoot%\explorer.exe"

echo.
echo [Lens UI] Done. Lens is closed and will not start at sign-in.
echo [Lens UI] To run Lens again: Build-Lens-UI.bat, then src-tauri\target\release\lens-ui.exe
echo [Lens UI] (or Launch-Lens-UI.bat while developing). Turn on Start with Windows from there.
timeout /t 8 >nul
