# Lens UI as an MCP server

Lens UI can let AI apps (Claude Desktop and other [Model Context Protocol](https://modelcontextprotocol.io) clients)
see your open windows and make a small set of reversible desktop changes. It is **off by default**:
Control Center › Agents & MCP › "Allow AI apps to connect".

## How it works

```
Claude Desktop ──stdio──▶ lens-ui.exe --mcp-stdio ──loopback TCP + token──▶ running Lens UI
```

* The AI app launches `lens-ui.exe --mcp-stdio`. With that flag Lens does **not** start the shell; the process
  is a thin bridge that forwards each JSON-RPC line to the running Lens UI and exits when stdin closes.
* While MCP is switched on, Lens UI listens on `127.0.0.1` on a random port and writes the port plus a random
  256-bit token to `%APPDATA%\LensUI\mcp-endpoint.json`. Every connection must present the token first.
  Switching MCP off (or quitting) closes the port and deletes the file.
* If Lens UI is not running or MCP is off, the bridge still answers (so the AI app doesn't hang): every tool
  returns "Lens UI isn't running, or its MCP server is switched off".
* Why stdio + loopback instead of only HTTP: stdio is what every MCP client supports for local servers and
  needs no new crates; the loopback hop is plain `std::net` with no async runtime. All protocol logic is in
  `src-tauri/src/win_mcp.rs`.

## Protocol support

* Legacy handshake revisions via `initialize`: 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05 (an unknown
  requested version gets 2025-11-25).
* Modern stateless revision 2026-07-28: `server/discover`, per-request `_meta` protocol version,
  `UnsupportedProtocolVersionError` (-32022) for unknown versions, `resultType: "complete"` on results.
* Tools only (no resources or prompts). `tools/list` is static and ordered.

## Tools

| Tool | What it does | Runs |
| :--- | :--- | :--- |
| `list_windows` | Open app windows: hwnd, title, app, focused/minimized/maximized | Directly (read-only) |
| `search` | Installed apps and indexed file **names/paths** (never contents) | Directly (read-only) |
| `get_action_status` | Outcome of a queued request | Directly (read-only) |
| `focus_window` | Focus a window Lens itself lists | Directly* |
| `tile_windows` | focus-stack, split, thirds, grid, smart-group | Directly* |
| `apply_theme_pack` | Any built-in or custom theme pack | Directly* |
| `set_volume` | 0–100 | Directly* |
| `set_brightness` | 10–100 | Directly* |
| `toggle_night_light` | On, off, or toggle | Directly* |
| `switch_workspace` | Number, name, next/prev (needs Lens workspaces) | Directly* |
| `run_action` | Plain-language request through Lens' action router | **Always waits for your approval** |

\* With "Ask me before every change" on, these also wait for approval.

Approvals appear in the MCP card and as a Lens notification. Requests expire after 10 minutes; at most 5 can wait
at once; identical pending requests are merged.

## Security model

* **Off by default, loopback only, token-gated.** The port binds to 127.0.0.1; a connection without the token
  from the endpoint file is closed before any message is read. The token file is in your user profile, so other
  programs running as you can read it — the same trust level as any app you run.
* **No dangerous capabilities exist.** There is no tool that runs commands or scripts, opens or deletes files,
  closes windows, kills processes, changes accounts or Windows settings beyond volume/brightness/night light.
  `run_action` goes through the same router as Dock search and only after you click Approve.
* **Validated input.** Every argument is type- and range-checked (unknown tools are a protocol error); text is
  stripped of control characters and length-capped; window ids must belong to a window Lens currently lists.
* **Rate-limited.** 40 tool calls per minute per connection, 4 connections at once, 256 KB per message.
* **Audited.** Each call is logged to `%APPDATA%\LensUI\mcp-audit.jsonl` (client name, tool, short argument
  summary, outcome — no secrets; rotated at 512 KB) and shown in the card.

## Connect Claude Desktop

The card shows a ready-made snippet with the real path. It looks like:

```json
{
  "mcpServers": {
    "lens-ui": {
      "command": "C:\\Program Files\\Lens UI\\lens-ui.exe",
      "args": ["--mcp-stdio"]
    }
  }
}
```

## Windows 11 agent registry (not wired yet)

Windows 11 (build 26220.7262+, pre-release) has an On-device Agent Registry; local servers are added with
`odr.exe mcp add <mcpb-manifest.json>`, and unpackaged apps are expected to ship an MCP bundle (MCPB) manifest
([Microsoft docs](https://learn.microsoft.com/en-nz/windows/ai/mcp/servers/mcp-manual)). Lens does not register
itself yet. A manifest would point its stdio command at `lens-ui.exe` with `--mcp-stdio`; check the MCPB schema
(github.com/anthropics/mcpb) before shipping one — not verified here.

## Known limits

* `apply_theme_pack` is applied by the Dock window (theme packs live in the frontend); if the Dock window isn't
  running the call reports success but nothing changes.
* `search` for apps is a simple name match; the Launcher's fuzzy ranking runs in the frontend.
* Night light toggling reads Lens' own night-light state, not Windows' built-in Night light.
