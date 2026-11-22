# Using Lens AI from outside Lens

All of these talk to the running Lens through its local, token-protected bridge (the same one
the browser extension uses). Each request appears in Lens with the context it carries; nothing
goes to a cloud model until you confirm it there (a local model may answer straight away if
Lens AI allows it).

| Script | What it does |
| --- | --- |
| `lens-ask.ps1` | Pipe text in from PowerShell: `git diff \| .\lens-ask.ps1 -Prompt "Commit message?" -Wait 90` |
| `lens-send-selection.ahk` | AutoHotkey v2: Ctrl+Alt+L asks Lens about the selected text in any app; Ctrl+Alt+S summarises it. |
| `bookmarklet.js` | For browsers without the extension: copies the page and opens `lens://summarize`. Run `node scripts/ai/bookmarklet.js` and save the printed line as a bookmark. Needs "lens:// links" on in Settings › Connections. |

The `lens-ui.exe` flags these use:

```
lens-ui.exe --ask "text" [--do summarize] [--variant key_points] [--prompt "question"] [--lang Spanish] [--wait 120] [--local]
lens-ui.exe --ask -           (text from stdin, up to 200 KB)
lens-ui.exe --ask-file C:\path\to\text.txt
lens-ui.exe --url "lens://summarize?url=…&title=…&clip=1"
lens-ui.exe --action summarize "C:\path\file.pdf"     (what the Explorer right-click verbs run)
```

Exit codes: `0` ok · `1` refused or failed · `2` Lens isn't running.
