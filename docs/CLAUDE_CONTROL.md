# Lens Control: Claude control over every desktop detail

Lens Control gives Claude (Claude Desktop and Claude Code over MCP), the in-app assistant and voice
one typed, safe way to read and change **every Lens setting and desktop detail**. Every change it
makes can be undone, and every request goes through the user's per-app permissions and the
"Needs your OK" card.

## Pieces

| Piece | Where | What it does |
|---|---|---|
| Settings catalogue | `src-tauri/src/control/catalogue.rs` | Every leaf of every settings store, with label, one-sentence description, example, JSON schema, category, capability, risk and reversibility |
| Engine | `control/engine.rs` | Get/set by path; batches are atomic across stores (all or none); one undo record per batch; presets; look snapshots |
| Grants | `control/grants.rs` | "This task can" per client: Allowed / Ask first / Blocked; session or saved |
| Audit | `control/audit.rs` | `%APPDATA%\LensUI\control\audit.jsonl`: who, what, when, undo id |
| Tools | `control/tools.rs` | `lens_*` tools: parsing (never panics), needs (capabilities, risk), approval preview, execution |
| Host | `control/lens.rs` | Real stores, live windows, monitors, Shelf; MCP resources; entry points |
| Commands | `src-tauri/src/commands/control.rs` | Control Center, approval card and UI |
| Approval card | `src/approval/*` | One "Needs your OK" card for Command, Mini, the Dock popover, the voice HUD and the standalone approval window |
| Catalogue export | `src/control/catalogue.json` | Generated; the guide agent reads it. Refresh with `bun run gen:catalogue` |

### Stores

Paths in the `config` store have no prefix. The other stores are prefixed with their id.

| Store | Examples | Saved through |
|---|---|---|
| `config` | `theme.preset`, `dock.style`, `topBar.autoHide`, `windowControls.frameStyle`, `hotCorners.*`, `altDrag.*`, `appSummon.*`, `dndSchedule.*`, `workspaces.*`, `tiling.*`, `command.*` | `save_config_cmd` (same side effects as the Control Center) |
| `wallpaper` | `wallpaper.scene`, `wallpaper.calm`, `wallpaper.dim`, `wallpaper.idleEnabled` | `set_wallpaper_settings_cmd` |
| `windowStyling` | `windowStyling.dimInactive`, `windowStyling.activeBorder.*`, `windowStyling.exclusions` | `set_window_styling_cmd` |
| `cursorFx` | `cursorFx.ripples`, `cursorFx.spotlightRadius`, `cursorFx.color` | `cursor_fx_set_cmd` |
| `clipboard` | `clipboard.enabled`, `clipboard.maxItems`, `clipboard.excludedApps` | `clip_set_settings` |
| `live` | `live.volume`, `live.brightness`, `live.muted`, `live.nightLight`, `live.dnd` | Quick settings APIs (read live) |

Per-app window rules live in their own store (`window-rules.json`) and are not yet in the catalogue;
see "Not yet covered" below.

### Rules that can't be bypassed

- `mcp.*`, `ai.*` (permissions, privacy, keys), `func.injectedHook` and internal bookkeeping are
  **Blocked**: an AI can never change its own access, AI privacy, or inject hooks.
- Confirm-risk settings always ask, even when the capability is allowed. These are:
  - hide the Windows taskbar, start with Windows, tray host, clipboard history;
  - custom CSS, pinned apps and folders, sessions, summon keys;
  - style all Explorer folders, show every key, all clipboard settings.
- AGENTS.md ranges are in the schemas: glass opacity 40–100 %, roundness 0–20 px.
- Closing a window always asks and is marked "Can't be undone".
- Shelf items marked "stays on this PC" are never sent to external apps.

## MCP

### Tools

| Tool | Capability | Notes |
|---|---|---|
| `lens_list_settings` | read settings | Search by words or category; returns paths, labels, descriptions, schemas, examples |
| `lens_get` | read settings | Values for paths or prefixes (`"dock"` returns every Dock setting) |
| `lens_set` | from the settings touched | `{"changes": {path: value, …}}`; one approval, one undo |
| `lens_windows` | read settings | Windows (id, title, app, state, pinned, workspace) and monitors |
| `lens_window_action` | arrange windows, or close apps | Actions: focus, minimize, maximize, restore, close, snap, move, monitor, workspace, pin, unpin |
| `lens_app` | launch apps | Open or switch to an installed app by name |
| `lens_shelf` | use Shelf | List, add text, or get chosen items as context |
| `lens_apply_preset` | change look | Presets: `classic-taskbar`, `mac-like`, `minimal-slim`, `focus`, `presenter`, or `pack:<id>` |
| `lens_undo` | of the original change | Last change, or one by undo id |
| `lens_snapshot_save` / `lens_snapshot_restore` | read / change look | Whole-desktop look snapshots |

The pre-existing tools are covered by the same grants:
- **arrange windows:** `list_windows`, `focus_window`, `tile_windows`.
- **change look:** `apply_theme_pack`, `set_color_mode`, `set_accent`.
- **quick settings:** volume, brightness, night light, mute, Do Not Disturb, focus mode, timers.
- **launch apps:** `launch_app`.
- **close apps:** `close_app`.
- **use Shelf:** `create_note`.

`run_action` still always asks.

### Resources

| URI | Content | Needs |
|---|---|---|
| `lens://settings/catalogue` | The full catalogue (no values) | read settings |
| `lens://theme/current` | Current look values | read settings |
| `lens://shelf/items` | Shelf items (local-only items hidden) | **Use Shelf = Allowed** for that app |

### Lens Browser tools

| Tool | Capability | Notes |
|---|---|---|
| `lens_browser_tabs` | read pages | Spaces and tabs. For AI apps, bank sites and private Spaces are left out |
| `lens_browser_read` | read pages | `readable` returns the page as markdown; `snapshot` returns text plus numbered elements |
| `lens_browser_transcript` | read pages | Video captions or transcript |
| `lens_browser_navigate` | browse | Web address or search. `javascript:`, `file:` and `data:` are refused |
| `lens_browser_act` | fill in and click | Click, type or select ("approve similar" can trust these per site); submit always asks |

The following are blocked here and again by Lens Browser's own gating (`browser::gating::classify`):
- card numbers;
- sign-in pages;
- checkout and payment pages;
- password, card and one-time-code fields;
- CAPTCHAs.

Lens never types card numbers. It only uses a payment method the site already has saved, and the
user's own action completes the payment.

**Honest answers.** When Lens can't or won't read something, the tool returns
`{ access: "none", source: null, reason }` with the text "I can't access that. … (No source:
nothing was read.)". This happens when:
- the page is a banking page;
- the tab is in a private Space;
- Lens Browser isn't running.

The UI shows it with `NoAccessNote` / `NoSourceBadge` (`src/approval/NoSourceBadge.tsx`).
Successful reads carry their `source` address.

#### Wiring Lens Browser (when feature/lens-browser lands): `control/lens.rs`, `impl Desktop for LensDesktop`

```rust
fn browser(&self, call: &crate::control::browser::BrowserCall) -> Result<Value, String> {
    use crate::control::browser::{BrowserCall, PageAct};
    use tauri::async_runtime::block_on;
    let app = self.app.clone();
    match call {
        BrowserCall::Tabs => serde_json::to_value(crate::commands::browser::browser_state()).map_err(|e| e.to_string()),
        BrowserCall::Read { tab, mode } => {
            let op = if mode == "snapshot" { "snapshot" } else { "readable" };
            let v = block_on(crate::commands::browser::browser_page(op.into(), tab.clone()))?;
            let url = self.browser_tab(tab.as_deref()).map(|(u, _)| u).unwrap_or_default();
            // Page text is data, never instructions.
            Ok(Value::String(crate::commands::browser::browser_untrusted(url, v.to_string())))
        }
        BrowserCall::Transcript { tab, lang } => block_on(crate::commands::browser::browser_captions(tab.clone(), lang.clone())),
        BrowserCall::Navigate { input, new_tab } => block_on(crate::commands::browser::browser_navigate(app, input.clone(), *new_tab))
            .and_then(|r| serde_json::to_value(r).map_err(|e| e.to_string())),
        BrowserCall::Act { tab, element, act } => {
            use crate::browser::gating::{PageAction, Target};
            let t = Target::default(); // re-described from the live page by browser_agent_act
            let action = match act {
                PageAct::Click => PageAction::Click { target: t },
                PageAct::Submit => PageAction::Submit { target: t },
                PageAct::Type(text) => PageAction::Type { target: t, text: text.clone() },
                PageAct::Select(value) => PageAction::Select { target: t, value: value.clone() },
            };
            // `approved: true` only because Lens Control already gated this call (card or trust).
            let req = crate::commands::browser::ActRequest { tab: tab.clone(), element: Some(*element), action, caps: None, approved: true };
            let r = block_on(crate::commands::browser::browser_agent_act(app, req))?;
            if r.needs_ok || !r.ran { return Err(r.message); }
            Ok(Value::String(r.message))
        }
    }
}

fn browser_tab(&self, tab: Option<&str>) -> Option<(String, Option<String>)> {
    let v = crate::commands::browser::browser_state();
    let t = match tab {
        Some(id) => v.tabs.iter().find(|t| t.id == id),
        None => v.tabs.iter().find(|t| Some(&t.id) == v.active_tab.as_ref()),
    }?;
    let space = v.spaces.iter().find(|s| s.id == t.space_id).map(|s| s.name.clone());
    Some((t.url.clone(), space))
}
```

Make `ActRequest` and its fields `pub(crate)` if they aren't. Field names follow
feature/lens-browser at the time of writing (`BrowserView.tabs`, `active_tab`, `spaces`).
`browser_agent_act` re-describes the element from the live page and re-runs the browser's own
gating even with `approved: true`, so Blocked stays blocked.

The Lens Browser agent panel should consult `control_may_remember(url, space)` before saving
history, Shelf captures or AI memory.

### "Approve similar actions for this task" and site trusts

- When a fill or click card has a scope (for example "fill fields on reserve.example"), it offers **Approve similar actions for this task**. The scope is always visible, along with how long the trust lasts: **This run** (not saved; ends when Lens restarts), **1 day** or **Always**.
- This creates a `SiteTrust` for that app, capability and site. Calls are then decided with `Grants::decide_at`: Ask-first becomes Allowed for that site and its subdomains only.
- A trust is never offered or accepted for:
  - send, pay or delete;
  - permanent deletes;
  - Confirm-risk items (submitting, booking). These ask every time.
- Trusts are listed in the Permissions card and written to the audit log (`outcome: "trusted"`, `undoId: <trust id>`). Revoke one with `control_trust_revoke(id)` from either place.

### Memory controls

`MemoryPolicy` (Permissions card, `control_memory_get` / `control_memory_set`):

| Setting | Default | Effect |
|---|---|---|
| Banking and payment sites | on | Never remembered, never shared with AI apps (honest "can't access") |
| Private Spaces | on | Any Space named "Private", plus named Spaces: never remembered, never shared |
| Never remember these sites | empty | Not saved to history, Shelf captures or AI memory (reading in the moment still works) |

## Default grants

| Capability | Claude Desktop / Claude Code / other | Lens assistant / voice |
|---|---|---|
| Read your Lens settings and open windows | Allowed | Allowed |
| Volume, brightness, night light, Do Not Disturb | Allowed | Allowed |
| Change the look | Ask first | Ask first (via tool proposal) |
| Change Lens settings and behaviour | Ask first | Ask first |
| Move, snap, minimise and arrange windows | Ask first | Ask first |
| Open and switch apps | Ask first | Ask first |
| Close apps | Ask first, and always asks | Ask first |
| Read and add to your Shelf | Ask first | Allowed |
| Fill in forms and click on sites | Ask first (site trusts allowed) | Ask first |
| Send context to a cloud AI | Ask first | Ask first |
| Read your browser tabs, pages and transcripts | Ask first | Allowed |
| Open pages and search in Lens Browser | Ask first | Ask first |
| Delete or clear things (to the Bin) | Ask first, and always asks | Ask first, and always asks |
| Pay with a saved method | **Blocked**; can be set to Ask first, never Allowed; always hold to confirm | Blocked |
| Send messages in your name | Ask first, and always asks | Ask first, and always asks |
| Delete permanently, use passwords or card numbers | Blocked (can't be changed) | Blocked |

The principles show as one-line microcopy in "This task can":
- **Deletions go to the Bin:** deletes are always to a recoverable bin, never a hard delete. Lens's own deletes use the Recycle Bin or a Lens trash with a 30-day undo.
- **Every payment waits.**
- **Nothing sent in your name.**
- **Shows you where it'll click.**
- **Banking pages and private Spaces stay private.**

The strictest rule wins:
1. A Blocked risk or the Destructive capability is never allowed.
2. A Blocked grant stops the request.
3. A Confirm risk always asks.
4. Any Ask-first capability asks.
5. Otherwise the request runs.

"Allow for this session" lasts until Lens restarts; saved grants persist in
`%APPDATA%\LensUI\control\grants.json`. A hand-edited file can't unblock Destructive.

## The approval card

`src/approval/ApprovalCard.tsx` is modelled on the "This task can" approval in the user's reference
screenshot. From top to bottom:

1. **Header:** "Needs your OK", the source (client name or site) with a coloured origin dot, and a collapse control.
2. **Question and reason:** a bold one-line question, then a plain-language reason.
3. **Preview**, by kind:
   - **look:** a before/after mini desktop in each theme (scoped tokens and `DockStylePreview`);
   - **window:** a thumbnail and title;
   - **element:** a capture of the page element the browser agent will click ("I'll click …, captured 2s ago");
   - **settings:** the details table only.
4. **Details** table.
5. **Reversibility line:** "Undo available" or "Can't be undone".
6. **"This task can"** list: the capabilities this request uses come first, with Ask-first items marked.
7. **Typed variants**, one shell:
   - `delete`: Includes / Keeping / Account / Recovery grid, plus "Review all N";
   - `payment`: big monospace amount, masked method, red warning, always hold;
   - `send`: "TO Name · App" and the exact message, plus "Don't send";
   - `element`: the site's form with the target outlined, "I'll click this · captured 3s ago", "Show tab ↗";
   - `look`: before/after;
   - `window` and `settings`.

   Key chips: ⏎ on the primary, ⇧⏎ on deny.
8. **Buttons:**
   - Deny;
   - the primary verb, using hold-to-confirm for confirm-risk or irreversible items (`holdPref`: confirm/always/never);
   - a keyboard chip, Enter or HOLD;
   - "Allow for this session".

Esc denies. Reduced motion turns off the entrance animation and the pill pulse.

Pending pill: `src/approval/PendingPill.tsx` ("Approve 1 action").

## Snippets for files this package doesn't own

### 1. Standalone approval window: `src-tauri/tauri.conf.json` and capabilities

```json
{ "label": "approval", "url": "index.html?surface=approval", "title": "Lens: Needs your OK",
  "width": 520, "height": 720, "resizable": false, "decorations": false, "transparent": true,
  "alwaysOnTop": true, "skipTaskbar": true, "visible": false, "center": true, "focus": true }
```

Add `"approval"` to the `windows` list in `src-tauri/capabilities/default.json`.
`win_mcp::lens_host::pending_changed` already shows the window when a request is queued (it is a
no-op until the window exists).

### 2. Route: `src/main.tsx`

```tsx
import { ApprovalSurface } from "./approval";
// in the surface switch:
case "approval": return <ApprovalSurface />;
```

### 3. Pending pill: top bar (`src/surfaces/TopBarSurface.tsx`) and Dock (`src/surfaces/DockSurface.tsx`)

```tsx
import { PendingPill, usePendingApprovals } from "../approval";
const { requests } = usePendingApprovals();
// right side of the top bar, before the clock (and in the Dock's system area for taskbar/studio/split):
<PendingPill count={requests.length} onOpen={() => invoke("show_surface_cmd", { label: "approval" })} />
```

Use whichever "show window" command the surfaces already use. The pill's shortcut chip says
Ctrl+Alt+J; register that hotkey to show the approval window in `app/setup.rs` next to the other
global shortcuts.

### 4. Command thread, Mini and Dock popover: tool proposals

Render a pending `lens://ai/tool-proposal` with the same card instead of the old tool card:

```tsx
import { ApprovalCard, fallbackPreview, previewFor } from "../approval";
const pv = (await previewFor(proposal.tool, proposal.args, "internal")) ?? fallbackPreview(proposal.summary, "Lens assistant", proposal.risk);
<ApprovalCard compact={layout === "mini"}
  request={{ id: proposal.call_id, origin: "ai", source: "Lens assistant", createdMs: Date.now(), preview: pv }}
  onApprove={() => aiConfirmTool(proposal.call_id, true).then(() => true)}
  onDeny={() => aiConfirmTool(proposal.call_id, false)} />
```

### 5. Voice HUD (feature/voice)

Use `<ApprovalCard compact holdPref="never" …>` and map a spoken "yes / confirm" to `onApprove` and
"no / cancel" to `onDeny`. Confirm-risk items still need a spoken confirmation; never auto-approve.

### 6. Browser element capture (browser agent)

Pass the capture in the preview:
`{ kind: "element", element: { image: dataUrl, label: "Complete booking", capturedAgo: "2s ago" } }`.
Set `request.origin = "browser"` and `request.site = hostname`.

### 7. Control Center: AI & Command › Permissions

Add a Permissions card that lists `control_grants_get()` per client, with a three-way control per
capability that calls `control_grants_set` and a "Reset" button that calls `control_grants_revoke`.
Show recent activity from `control_audit({ limit: 50 })`, with Undo from `control_history()` and
`control_undo({ id })`.

### 8. Voice settings (when feature/voice lands)

Voice settings saved in `LensConfig.voice` are picked up automatically: a new top-level config field
fails `every_config_leaf_is_registered` until it gets a rule. Add
`r("voice", "Voice", C::ChangeSettings, L)`, plus Confirm for the wake-word and always-listening
fields, to `RULES` in `control/catalogue.rs`, then run `bun run gen:catalogue`.

### 9. Backup and uninstall

Add `control/grants.json` and `control/snapshots/` to `win_backup.rs`. "Remove all Lens changes"
should delete `control/` (grants revert to the defaults).

## Edits this package made to shared files

- `src-tauri/src/lib.rs`: `mod control;` and 12 `commands::control::*` registrations.
- `src-tauri/src/commands/mod.rs`: `pub(crate) mod control;`.
- `src-tauri/src/ai/tools.rs` (owned): the `lens_*` tools join the internal assistant's tools; all of them except reads, `lens_shelf` and `lens_snapshot_save` use risk "confirm", so their tool proposals are the approval step.
- `src-tauri/src/win_mcp.rs` (tool list owned):
  - the instructions;
  - the `lens_*` tool defs and `ToolCall::Control`;
  - grant gating in `tools/call`;
  - `resources/list` and `resources/read`;
  - the `McpHost` default methods;
  - the Lens host implementations;
  - showing the approval window.
- `src-tauri/src/tests/win_mcp.rs`: the tool count and the `resources/read` expectation.
- `src/types/generated.ts`: regenerated.
- `package.json`: `gen:catalogue`.
- `.github/workflows/build.yml`: the approval gallery step and artifact.
- `.gitignore`: the gallery output.

## Not yet covered

- Per-app window rules (`window-rules.json`) and pointer *sets* (`win_cursors` state). Add them as stores in `lens.rs` plus `RULES` entries.
- Typing text (`type_text`) has a capability and a default, but no tool: Lens never types for an AI yet.
- Window thumbnails in the card need a capture command (`win_previews`); the card already accepts `window.thumbnail`.
- The undo stack lives in memory, so it is lost on restart. The audit log keeps the record.
- A theme-pack change is applied by the frontend (`lens://mcp-apply-pack`). Undoing a pack and custom tweaks in one batch restores the config first and the pack's tokens second.
