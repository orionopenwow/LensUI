; Lens installer hooks (tauri.conf.json > bundle.windows.nsis.installerHooks).
;
; Lens can hide the Windows taskbar and desktop icons, start with Windows, and even replace
; Explorer as the shell. The installer and uninstaller close a running Lens by force, which skips
; Lens's own clean-up, so these hooks give Windows back (AGENTS.md: every OS change stays
; reversible and is restored when Lens goes away).
;
;   Install / upgrade: if Lens was running, show the taskbar and desktop icons again. Settings are
;                      untouched, so Lens applies them again when it starts.
;   Update (in-app):   the same; nothing else changes.
;   Uninstall:         run `lens-ui.exe --remove-changes`, the same change registry as
;                      Settings > Remove all Lens changes, while the exe still exists. With
;                      "Delete the application data" ticked, %APPDATA%\LensUI goes too
;                      (unless an undo step failed: its backups live there).
;                      Log: %TEMP%\LensUI-uninstall.log

Var LensWasRunning

!macro LENS_FIND_RUNNING
  StrCpy $LensWasRunning 1
  nsis_tauri_utils::FindProcessCurrentUser "${MAINBINARYNAME}.exe"
  Pop $LensWasRunning ; 0 = running
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro LENS_FIND_RUNNING
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $LensWasRunning = 0
    ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --show-taskbar'
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro LENS_FIND_RUNNING
  ${If} $LensWasRunning = 0
    nsis_tauri_utils::KillProcessCurrentUser "${MAINBINARYNAME}.exe"
    Pop $0
    Sleep 800
  ${EndIf}
  ${If} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    ${If} $UpdateMode = 1
      ${If} $LensWasRunning = 0
        ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --show-taskbar'
      ${EndIf}
    ${ElseIf} $DeleteAppDataCheckboxState = 1
      DetailPrint "Removing the changes Lens made to Windows and its data..."
      ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --remove-changes --delete-data'
    ${Else}
      DetailPrint "Removing the changes Lens made to Windows..."
      ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --remove-changes'
    ${EndIf}
  ${EndIf}
!macroend
