# `lens` on the command line: your own agent drives Lens Browser and the desktop

`lens-ui.exe --cli …` lets **your own** Claude Code, Codex or a script use Lens Browser (with the
sign-ins you made there) and a few desktop actions. Lens itself never calls a model for this: the
agent in your terminal does the thinking; Lens does the clicking, behind its usual safety rules.

Learned from Ardia (ardia.dev, GPL-3.0): the idea of a browser CLI for coding agents and of
publishing its token cost. Ideas only; no code was used (docs/THIRD_PARTY_NOTICES.md).

## Set up

1. In Lens: **Settings › AI & Command › MCP** on (it's off by default).
2. In a terminal: `"%LOCALAPPDATA%\Programs\Lens\lens-ui.exe" --cli setup` (use the path Lens is
   installed in). It writes `%APPDATA%\LensUI\bin\lens.cmd`. Add that folder to your PATH yourself;
   Lens doesn't change PATH.
3. Try `lens browse tabs`.

**Claude Code**: add a line to your project's `CLAUDE.md`:

```
To use the web, run `lens browse …` (see `lens help`). Read pages with `lens browse read`, then
act on numbered elements with `lens browse click N` / `type N text`. Submitting waits for my OK in Lens.
```

**Codex**: the same lines in `AGENTS.md`. Codex's sandbox must allow running `lens.cmd` and
connecting to 127.0.0.1 (Lens's local endpoint).

Prefer MCP? The same tools are on Lens's MCP server (`lens_browser_*`, docs/MCP.md); the command
line is a thin client of it.

## Commands

| Command | Lens tool | What it does |
|---|---|---|
| `lens browse tabs` | `lens_browser_tabs` | Spaces and tabs (locked and private Spaces left out) |
| `lens browse open <url or words> [--new-tab]` | `lens_browser_navigate` | Open a page or search |
| `lens browse read [--mode compact\|readable\|snapshot] [--tab id]` | `lens_browser_read` | The page: `compact` (default) is a short outline with numbered elements |
| `lens browse click N` / `type N text` / `select N value` | `lens_browser_act` | Act on element N from the last read |
| `lens browse submit N` | `lens_browser_act` | Submit; **always** shows Lens's approval card |
| `lens browse screenshot` | `lens_browser_screenshot` | Saves a PNG under `%APPDATA%\LensUI\cli\shots` (20 kept) and prints the path |
| `lens browse transcript` | `lens_browser_transcript` | The video's captions |
| `lens computer windows` | `lens_windows` | Open windows |
| `lens computer focus <id>` / `window <id> <action>` | `lens_window_action` | Focus, minimise, maximise, restore, close (asks), pin |
| `lens computer do <action> key=value…` | Lens desktop actions | The actions Lens's MCP offers (e.g. `focus_app name=Spotify`) |

Exit codes: 0 done, 1 refused or failed (the reason is on stderr), 2 usage, 3 Lens not reachable.

## What keeps it safe

* **Per terminal.** Each terminal is its own client ("cli: Claude Code · <terminal>"), so what you
  allow in **This task can** for one terminal doesn't carry to another.
* **One approval card.** Steps that need your OK wait for the card in Lens; the command waits
  (`--wait`, default 120 s) and reports the outcome. Submits always ask.
* **Lens Browser still checks every step** on the live page: sign-in pages, payments, card numbers,
  password and one-time-code fields and CAPTCHAs are never done; a click Lens thinks commits
  something is refused with "send it as submit" so the card shows it.
* **Pages are data.** Every read goes through the agent-safety scan; hidden instructions are set
  aside and the agent's next steps are checked against what the page tried.
* **Sign-ins stay in Lens.** No cookie, password or token ever leaves through these commands.
* **AI off means off.** With Lens Browser's AI switch off, agents can't act on pages.
* **Banking pages and private Spaces** read as "I can't access that" (no source).

## Token cost of reading a page

Measured with `node tools/agent-bench/run.mjs` on 8 hand-made pages (`tools/agent-bench/pages`:
article, search results, product, booking form, dashboard table, API docs, forum thread, sign-in),
each with a header nav of 12 links, a footer of 15 links and inline script/style, in headless
Chromium with Lens Browser's real page agent injected.

**Method:** tokens are estimated as characters ÷ 4 (rounded up), the usual rule of thumb for
English text with GPT- and Claude-style tokenizers. It is not a tokenizer count; real counts differ
by roughly ±15 % and more for code, numbers and non-English text.

| Page | Raw HTML | `innerText` | Lens snapshot (JSON) | **Lens compact** | Numbered elements |
|---|---:|---:|---:|---:|---:|
| 01 article | 3,030 | 1,664 | 3,909 | **1,286** | 39 |
| 02 search results | 2,143 | 601 | 3,585 | **769** | 49 |
| 03 product | 2,340 | 759 | 3,019 | **815** | 40 |
| 04 booking form | 1,495 | 141 | 2,195 | **246** | 36 |
| 05 dashboard table | 2,532 | 535 | 5,094 | **776** | 73 |
| 06 API docs | 2,844 | 1,259 | 4,052 | **1,370** | 47 |
| 07 forum thread | 4,222 | 2,008 | 9,273 | **1,509** (cut at 6,000 chars) | 73 |
| 08 sign-in | 1,437 | 123 | 2,143 | **238** | 35 |
| **Total** | 20,043 | 7,090 | 33,270 | **7,009** | |

What this says, honestly:

* The compact outline costs about the same as plain `innerText` (−1 % in total) while also
  numbering every link, button and field so the agent can act on them, and saying which fields
  Lens will never type into. Plain text gives no way to act.
* It is about **4.7× smaller** than Lens's own JSON snapshot, which the in-app agent still uses.
* Pages with little text and many controls (forms, sign-in) cost more than their `innerText`
  because each control is listed; long pages are cut at 6,000 characters (said in the output).
* These are synthetic pages. Real sites carry more navigation, ads and markup; we haven't measured
  them here and don't publish a comparison with other tools that we didn't run the same way.

Recorded on 2026-11-26 from this branch (`tools/agent-bench/out/agent-bench.json` when you run it).

## Not done yet

* **Reading the selection and Magic actions** from the command line: when an agent runs, the app in
  front is its own terminal, so "the selection" needs a way to name the window it means and a
  per-app consent; not designed yet.
* Screenshots use `PrintWindow`; if WebView2 draws nothing into it on some GPUs, the command falls
  back to what is on screen at the page's place. Not yet run on a real PC.
