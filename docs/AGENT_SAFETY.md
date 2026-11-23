# Agent safety (W8-O)

Deterministic checks that run **after** the model and **before** every agent action. Prompt
injection will sometimes get past any model, so Lens doesn't rely on the model to notice it. This
package implements ideas #2, #4 and #5 of `docs/research/BROWSER_DELTA.md` and the threat table in
`docs/vision/ai-helper.md`.

Everything runs on the PC. Nothing is looked up online.

| Piece | Code | What it does |
|---|---|---|
| Signed-out agent profile | `src-tauri/src/agentsafe/profile.rs` | Agent runs browse in a clean profile. A site can be given signed-in access for **one run** or **until this time tomorrow**; never "always". Grants copy nothing and can be removed any time. |
| Look-alike / scam guard | `agentsafe/domains.rs`, `agentsafe/confusables.rs` | `javascript:`/`data:` links, `user@host` tricks, raw IPs, punycode homographs, mixed alphabets, edit distance to ~70 brands and to the user's own sites, brand + "login/verify/…" names, brand-as-subdomain, risky TLDs (weight only), first visit during sign-in or payment, link text that names another site. |
| Hidden-text / injection detector | `agentsafe/hidden_text.rs`, `src/agentsafe/collector.ts` | Finds text aimed at the AI (override, role, "don't tell the user", fake tool calls and chat markers, "send … to …" exfiltration, URL templates carrying data), text people can't see (display/visibility, opacity, contrast < 1.6:1, font < 4 px, off-screen, clipped, aria-hidden, alt/meta/comments), zero-width and bidi characters, and base64 that decodes to instructions. Flagged spans are set aside before any model sees the text. |
| Guard pipeline | `agentsafe/pipeline.rs` | `check(action, target, context) → allow / ask(reasons) / block(reasons)`, combining all of the above with the action's risk class and the client. |
| Commands | `src-tauri/src/commands/agentsafe.rs` | `agentsafe_check`, `agentsafe_scan`, `agentsafe_check_url`, grants, settings, the set-aside viewer. |
| UI | `src/agentsafe/AgentSafetyCard.tsx`, `SafetyBanner.tsx`, `ReasonChips.tsx` | Settings card, page banner, reason chips for the approval card. |

## Rules the pipeline applies

In order; any block wins over any ask.

1. **Never:**
   - signing in;
   - typing into password, card, one-time-code, PIN, IBAN, seed or API-key fields;
   - payments, unless the task switched payments to "Ask first" *and* the user asked for this step (then it asks with hold-to-confirm);
   - local-only data leaving the PC;
   - your data going into a link when the step came from untrusted text.
2. **Injection:** when a step was planned from untrusted text (a page, file, OCR, tool output), any write action is **blocked** if that text hid instructions, and **asks** if it gave orders in plain sight. Data exfiltration requested by content is always blocked.
3. **Domains:**
   - high or critical risk **blocks** typing, submitting, sending, downloading and paying, and **asks** for clicks and navigation;
   - critical risk (homograph, `javascript:`) also blocks clicks;
   - medium risk asks for writes. Relaxed doesn't ask on navigation; Strict asks for everything, including the first time an agent types on any new site.
4. **Confused deputy:** an MCP client (Claude Desktop, Claude Code, others) asking to change settings, send, delete, submit, download or launch because of another tool's or page's text always asks. Unknown clients ask for any write. An MCP client sending your data out because of untrusted text is blocked.
5. **Signed-in:** a step that needs your session asks for a grant unless one is live for that site.
6. **Defaults:**
   - send asks, with hold-to-confirm;
   - submit, delete and download ask;
   - settings changes ask unless you started them;
   - reading, navigating and window control are allowed.

## Red-team results

Run with `cargo test agentsafe` (CI), or locally without crates:

```
rustc --edition 2021 --test <file with `#[path = ".../agentsafe/mod.rs"] pub mod agentsafe;`>
```

Results:

| Suite | Cases | Result |
|---|---|---|
| Scam and look-alike URLs (`fixtures/scam_urls.txt`) | 35 | 35 flagged high or critical |
| Popular sites, false-positive budget 2 (`fixtures/top_sites.txt`) | 209 | 0 flagged medium or above |
| Injection pages (`fixtures/pages/*.txt`) | 18 malicious, 7 clean | all as expected |
| Pipeline cases (`fixtures/redteam.txt`) | 60 | all verdicts as expected |
| Wrapped text never contains quarantined instructions | 18 | pass |
| Fuzz: random URLs, text, styles, actions, clients (4,000) plus parser fuzz (20,000) | 24,000 | no panics; invariants hold (login always blocked, untrusted payments always blocked, send never silently allowed, every ask/block has reasons, spans on char boundaries) |

Total red-team cases: **120**.

The fuzzer found a real panic during development: slicing a URL tail inside a multi-byte character. It was fixed, and the fuzz test now guards it.

The collector is checked in real Chromium against `tools/parity/agentsafe/hostile.html`, a page with:

- white-on-white and dark-on-dark text;
- `display:none`, opacity 0, 1 px text;
- off-screen and `text-indent` tricks;
- `clip` and aria-hidden text;
- alt text, meta descriptions and comments;
- hostile `!important` CSS.

All 13 measurements pass in CI (`Render agent safety + hostile-page collector check`).

## Integration snippets

These packages own the files below; apply the snippets when they merge. Every agent action calls `agentsafe_check` first. The approval card shows the returned reasons. Page, OCR and file text goes through `agentsafe_scan`, and only `wrapped` reaches a model.

### Lens Browser (feature/lens-browser)

**1. Agent profile.** In `src-tauri/src/browser/host.rs`, where an agent run opens or reuses a tab webview, pick the data folder from the grants:

```rust
use crate::agentsafe::{profile::AgentProfile, state};
let profile = state::with(|s| s.grants.profile_for(&url, Some(&run_id), state::now_secs()));
let data_dir = match &profile {
    // Clean, signed-out profile; wiped by `agentsafe_run_ended` + the snippet below.
    AgentProfile::Sandbox => profiles_root.join("agent"),
    // The user's own Space, for this one site only.
    AgentProfile::SignedIn { space, .. } => profile_dir_for_space(space.as_deref()),
};
builder = builder.data_directory(data_dir);
```

When a run ends: call `crate::commands::agentsafe::agentsafe_run_ended(run_id)`, close the agent webviews and delete `profiles_root.join("agent")`. Never navigate a signed-in webview to a different site than the grant's (`grant.site == registrable_domain(new_url)`); otherwise reopen in the sandbox.

**2. Before each page action.** In `browser/gating.rs` `classify(action, caps)`, after the existing capability decision:

```rust
let safety = crate::commands::agentsafe::agentsafe_check(crate::commands::agentsafe::SafetyCheckRequest {
    action: action.kind_str().into(),          // "click" | "type" | "submit" | …
    client: "internal".into(),
    origin: if action.from_model { "untrusted".into() } else { "user".into() },
    run_id: Some(run_id.clone()),
    url: Some(page_url.clone()),
    link_text: action.link_text.clone(),
    field: action.field_kind.clone(),           // "password" | "card" | "otp" | "email" | …
    carries_user_data: action.uses_user_data,
    local_only_data: action.uses_local_only,
    data_in_url: action.writes_query_string,
    needs_signed_in: action.needs_session,
    flow: Some(page_flow.into()),               // from the page agent: "login" | "payment" | "browse"
    known_domains: rt().known_domains(),        // bookmarks + top history
    seen_before: rt().history_has(&page_url),
    source_nodes: last_scan_nodes.clone(),      // the collector nodes the plan was made from
    payments_ask_first: caps.payments == Ask::First,
    user_initiated: !action.from_model,
});
match safety.verdict.as_str() {
    "block" => return Decision::Blocked(safety.reasons),
    "ask" => return Decision::Ask { reasons: safety.reasons, hold: safety.hold_to_confirm },
    _ => {} // fall through to the existing decision
}
```

**3. Reading pages.** Replace `gating::untrusted_block(url, text)` with the collector plus scan:

```rust
let nodes: Vec<ScanNode> = serde_json::from_value(eval_op(&view, json!({ "op": "eval", "js": COLLECTOR_JS }), Duration::from_millis(800))?)?;
let scan = crate::commands::agentsafe::agentsafe_scan(nodes, page_url.clone(), Some(true));
// Give the model scan.wrapped only. Show the banner if scan.reasons is non-empty.
```

`COLLECTOR_JS` is `collectorScript()` from `src/agentsafe/collector.ts`. Pass it from the UI once at start-up with `browser_set_collector(js)`, or build it into the binary with `include_str!` of a generated file.

**4. Banner.** In the browser frame, above the page:

```tsx
import { SafetyBanner } from "../agentsafe/SafetyBanner";
import { safetyCheckUrl } from "../agentsafe/contract";
// on navigation (when settings.bannerForPeople, or always for agent tabs):
const d = await safetyCheckUrl(url, { knownDomains, seenBefore, flow });
if (["medium", "high", "critical"].includes(d.risk)) setBanner({ site: d.displayHost || d.site, reasons: d.reasons });
<SafetyBanner site={banner.site} reasons={banner.reasons} setAside={scan.quarantined.length} onLeave={goBack} onContinue={dismiss} onShowSetAside={openSetAside} />
```

### Claude control (feature/claude-control)

**1. Run the pipeline in `control::lens::gate`** before the grant decision:

```rust
let kind = match call { Call::Set { .. } | Call::ApplyPreset { .. } => "settings_write", Call::WindowAction { .. } => "window",
    Call::Launch { .. } => "launch", Call::Browser(b) => b.kind_str(), Call::Delete { .. } => "delete", _ => "read" };
let safety = crate::commands::agentsafe::agentsafe_check(SafetyCheckRequest {
    action: kind.into(),
    client: client.into(),
    origin: if a.planned_from_untrusted { "untrusted".into() } else { "user".into() },
    url: a.site.as_ref().map(|s| format!("https://{s}/")),
    carries_user_data: a.capabilities.contains(&Capability::SendToCloud) || a.capabilities.contains(&Capability::TypeText),
    ..Default::default()
});
match safety.verdict.as_str() {
    "block" => return Ok(Gate::Block(safety.reasons.iter().map(|r| r.detail.clone()).collect::<Vec<_>>().join(" · "))),
    "ask" => { let mut a = a; a.safety_reasons = safety.reasons; a.hold = a.hold || safety.hold_to_confirm; return Ok(Gate::Ask(a)); }
    _ => {}
}
```

**2. MCP tool and resource text is untrusted.** Scan it with `agentsafe_scan(nodes, "tool:<client>")` before it reaches the internal model.

**3. Approval card.** In `src/approval/ApprovalCard.tsx`, under the one-line question:

```tsx
import { ReasonChips } from "../agentsafe/ReasonChips";
{p.safetyReasons?.length ? <ReasonChips reasons={p.safetyReasons} /> : null}
```

Use hold-to-confirm whenever `holdToConfirm` is true.

### Lens Snip (feature/lens-snip)

Before **Paste to Claude**, **Ask** and **Translate**, scan the OCR text. Pass the OCR's own contrast estimate per line if it has one (`collectorHelpers.contrastRatio` on the line's sampled text and background colours):

```ts
import { safetyScan } from "../agentsafe/contract";
const scan = await safetyScan(ocr.lines.map((l, i) => ({ id: i, text: l.text, source: "ocr", contrast: l.contrast ?? null })), "screenshot text");
// Send scan.wrapped instead of the raw OCR text; show <ReasonChips reasons={scan.reasons} /> in the studio's action bar.
```

### Right-click and the extension (feature/rightclick-context, feature/ai-bridges)

- Page text from the extension (`page_text`, selections, YouTube transcripts) is untrusted. In the bridge's `LensAi` adapter, scan it first with `agentsafe_scan([{ id: 0, text, source: "dom" }], url)` and pass `wrapped` as `page_text`.
- The content script can also run `lensTextCollector(4000)`; bundle `src/agentsafe/collector.ts` into the content script. That gives full style facts instead of plain text.
- The "Copy page into context" and "Add to Shelf" actions store the raw text, but mark the Shelf item `source = page` so packs re-scan it when sent to a model.

### Voice and the internal AI (feature/voice, feature/ai-core)

- Voice commands the user spoke are `origin: "user"`.
- Steps an AI proposes after reading pages, files or tool output are `origin: "untrusted"`.
- In `ai/tools.rs`'s runner, call `agentsafe_check` with the tool's kind before executing.

### Control Center

Mount the card in **AI & Command**, below the approvals or permissions card:

```tsx
import { AgentSafetyCard } from "../agentsafe/AgentSafetyCard";
<AgentSafetyCard />
```

## Shared files edited

These edits were needed to compile:

- `src-tauri/src/lib.rs`: `mod agentsafe;` and 12 command registrations.
- `src-tauri/src/commands/mod.rs`: `pub(crate) mod agentsafe;`.
- `src/types/generated.ts`: regenerated.
- `.github/workflows/build.yml`: one parity step and its artifact path.
- `.gitignore`: gallery output.

## Third-party data

`agentsafe/confusables.rs` uses a hand-picked subset of the prototype mappings in Unicode's `confusables.txt` (UTS #39, "Unicode Security Mechanisms").

> Copyright © 1991-2026 Unicode, Inc. Distributed under the Unicode License v3 (https://www.unicode.org/license.txt), which permits copying and modification provided the copyright and permission notice are included.

The brand list, lure words and risky-TLD list were compiled by hand from public phishing-trend reporting. There is no third-party list.

## Privacy

- Grants and settings are saved under `%APPDATA%\LensUI\agentsafe\`. Grants are saved as site names and times only.
- The set-aside viewer is in memory only, keeps the last 200 entries, and is never written to disk.
- No check makes a network request.
