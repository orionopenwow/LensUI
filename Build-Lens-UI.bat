@echo off
rem Builds Lens from source: checks prerequisites, builds the installer, keeps a full log in
rem build-logs\ and explains any failure. Options: -CheckOnly  -Msi  -Full  -LowMemory
rem Most people don't need this: the installer is on https://github.com/orionopenwow/LensUI/releases
title Lens - Build from source
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build\build-lens.ps1" %*
set "CODE=%ERRORLEVEL%"
if "%CODE%"=="0" (
    if not exist ".dev\" mkdir ".dev"
    copy /y "bun.lock" ".dev\bun.lock.installed" >nul
)
echo.
pause
exit /b %CODE%
