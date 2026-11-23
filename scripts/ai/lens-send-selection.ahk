; Lens UI — "send selection to Lens" for AutoHotkey v2.
; Ctrl+Alt+L  → Ask Lens about the selected text in any app
; Ctrl+Alt+S  → Summarise the selection (key points)
; The request appears in Lens for you to confirm. Nothing leaves your PC until you do.
#Requires AutoHotkey v2.0
#SingleInstance Force

LensExe := EnvGet("LOCALAPPDATA") "\Lens UI\lens-ui.exe"   ; change if Lens lives elsewhere

SendSelectionToLens(action, extra := "") {
    global LensExe
    saved := ClipboardAll()
    A_Clipboard := ""
    Send "^c"
    if !ClipWait(1) {
        A_Clipboard := saved
        ToolTip "Lens: nothing selected"
        SetTimer () => ToolTip(), -1500
        return
    }
    text := A_Clipboard
    A_Clipboard := saved            ; put the user's clipboard back
    tmp := A_Temp "\lens-selection-" A_TickCount ".txt"
    FileAppend text, tmp, "UTF-8-RAW"
    try RunWait Format('"{1}" --ask-file "{2}" --do {3} {4}', LensExe, tmp, action, extra), , "Hide"
    FileDelete tmp
}

^!l::SendSelectionToLens("ask")
^!s::SendSelectionToLens("summarize", "--variant key_points")
