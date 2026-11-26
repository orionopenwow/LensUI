# Feature dossiers

One file per main feature, written for the Fable pass. Each has a rundown, a feature tree (features → sub-features → minute features, each with status and evidence), quick wins, a polish assessment, a bug assessment, one idea to push to main, a test plan, a suggested overhaul and a compact **Fable pass brief** to execute from.

Status words: **works** (built and tested), **partly** (built with gaps), **broken**, **not built**.

| Feature | File | Status | Top quick win | Top bug | Idea to push |
|---|---|---|---|---|---|
| Dock | [dock.md](dock.md) | works | Expose hidden Dock settings (magnification, launch animation, labels, per-app sizes…) | Per-monitor bars + follow-the-pointer together untested (suspected) | "Dock in 10 seconds" ghost tour after a style change |
| Top Bar | [topbar.md](topbar.md) | works | One enable flag (`topBar.enabled` vs `dock.showTopBar`) | The two flags can disagree (suspected) | Focus strip under the clock |
| Settings | [settings.md](settings.md) | works | Merge Notifications pages; rename "Apps" → "Lens Apps" | B-39 undo doesn't restore every key | "Recently changed" strip with Undo |

Batch 2 adds its rows below.
