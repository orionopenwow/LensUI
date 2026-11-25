@echo off
setlocal EnableExtensions
title Lens
cd /d "%~dp0"
if not exist ".dev\" mkdir ".dev"

rem --- Dependencies: "bun install" only when bun.lock changed since the last install ---------
set "NEED_INSTALL="
if not exist "node_modules\" set "NEED_INSTALL=1"
if not exist ".dev\bun.lock.installed" set "NEED_INSTALL=1"
if exist ".dev\bun.lock.installed" fc /b "bun.lock" ".dev\bun.lock.installed" >nul 2>&1 || set "NEED_INSTALL=1"
if defined NEED_INSTALL (
    echo [Lens] Installing dependencies ^(bun.lock changed^)...
    call bun install
    if errorlevel 1 goto :fail
    copy /y "bun.lock" ".dev\bun.lock.installed" >nul
)

rem --- Show Lens setup once after this folder was updated (it changes nothing until Finish) ---
set "LENS_SHOW_SETUP="
if exist ".dev\base" (
    if not exist ".dev\base.launched" set "LENS_SHOW_SETUP=1"
    if exist ".dev\base.launched" fc /b ".dev\base" ".dev\base.launched" >nul 2>&1 || set "LENS_SHOW_SETUP=1"
    copy /y ".dev\base" ".dev\base.launched" >nul
)
if defined LENS_SHOW_SETUP echo [Lens] This folder was updated: Lens setup and What's new will open. Skip keeps everything as it is.

rem --- Close any running Lens and free the dev port -------------------------------------------
echo [Lens] Closing any running Lens...
taskkill /F /IM lens-ui.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":1420" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

rem --- Dev build, or the last Lens you built with Build-Lens-UI.bat --------------------------
set "BUILT=src-tauri\target\release\lens-ui.exe"
if exist "%BUILT%" (
    choice /c DB /t 6 /d D /m "[Lens] Start the dev build (D) or your last built Lens (B)? Dev starts in 6 seconds"
    if errorlevel 2 goto :built
)

echo [Lens] Starting the dev build...
call bun run tauri dev
goto :end

:built
echo [Lens] Starting your last built Lens: %BUILT%
start "" "%BUILT%"
goto :end

:fail
echo.
echo [Lens] Something went wrong - see the messages above.

:end
pause
endlocal
