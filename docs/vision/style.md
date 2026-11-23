# Visual language

This distils the user's reference screenshots — an agentic browser with "Needs your OK" cards, a dithered landing page, and phone run and voice views — into Lens tokens. It **extends** [DESIGN.md](../../DESIGN.md) (Obsidian monochrome chrome, Rounded Arial, 0 px flush flow-outs, full-colour dock icons) and does not replace it.

## 1. Canvas and material

- **Canvas:** near-black `--lens-bg-base` (Obsidian `#09090b`). Cards sit on `--lens-bg-elevated` with a 1 px `--lens-border`.
- **Dither material (Planned, W8-J):** an ordered (Bayer 8×8) halftone of the accent-desaturated foreground at very low contrast, like a coarse print screen.
  - **Used on:** presentation backdrops, empty states, hero areas, the voice conversation background and the site.
  - **Never** behind body text or inside dense lists.
  - **Tokens:**
    - `--lens-dither` (0–1 strength, default 0.35 on backdrops, 0 elsewhere)
    - `--lens-dither-scale` (2–4 px cell)
    - `--lens-grain` (0–1 noise, default 0.15)
    - `--lens-dither-ink` (derived from `--lens-fg` at 6–10 % alpha)
  - **Rules:** static under reduced motion, off under Windows high contrast, and rendered once to a cached canvas (no per-frame cost unless animated).

## 2. Type and metadata

- UI text stays **Rounded Arial** (DESIGN.md §2).
- **Metadata is monospace** (`--lens-font-mono`, default Cascadia Mono then Consolas). That covers:
  - domains;
  - timings ("Worked for 3m 16s");
  - counts ("23 actions");
  - captions ("captured 2s ago", "search · sort · open ×6 · kept 3");
  - key chips.
- Metadata colour is `--lens-fg-muted`. It is never smaller than 11 px, and contrast is ≥ 4.5:1 on its surface.
- **Status dots** are 6 px circles before a source or domain:

| Dot | Meaning |
|---|---|
| `--lens-positive` | Known/trusted |
| `--lens-warning` (new token, amber) | Waiting for you |
| `--lens-danger` | Irreversible / money / delete |
| `--lens-fg-muted` | Idle |

## 3. Buttons

- **One light primary per card:** the `--lens-fg` background with `--lens-on-fg` text, labelled with the **exact verb and object** ("Delete 2,315", "Book table", "Pay $84.00", "Send"). Everything else is a quiet secondary: transparent with a border.
- **Key chips** sit on buttons: a small inset box with the shortcut (`⏎`, `⇧⏎`, `HOLD`), using `--lens-keychip-bg` and `--lens-keychip-fg`.
- **HOLD-to-confirm** fills the primary left-to-right over 900 ms, with a haptic-style tick at the end. With reduced motion it shows a static "Hold…" label instead.

## 4. Approval card anatomy

```
┌──────────────────────────────────────────────────────────┐
│ ✳ Needs your OK                      ● opentable.com  ⌄  │  header: sparkle, title, dot+mono source, collapse
│ Book a table for 4 at Lisboeta?                          │  question (semibold, one line)
│ They charge $25 a person if you don't show.              │  reason (muted)
│ ┌──────────────────────────────────────────────────────┐ │
│ │  [target preview: form / thumbnail / before→after]   │ │  preview (variant-specific)
│ └──────────────────────────────────────────────────────┘ │
│ ☐ I'll click this · captured 3s ago          Show tab ↗  │  mono caption
│ When        Fri 3 Oct · 20:00                            │  details grid (label muted / value strong)
│ Party       4 · Maya eats vegan                          │
│ ⚠ No-show fee $25 / person                               │  warning line (danger) when relevant
│ ☰ Review all          [ Deny ]  [ Book table  HOLD ]     │  footer: aux link · secondary · primary+keychip
│ THIS TASK CAN  · Read pages ✓ · Fill forms ✓ · Pay — Ask │  capability list (collapsible)
└──────────────────────────────────────────────────────────┘
```

- **Variants** (In PR #21): delete/bulk, payment (large mono amount, masked method), send-message (TO line plus exact text), click/form (embedded target), look change (before/after).
- **Placement:** inline in a thread; anchored to the dock icon; in the top bar pill flyout; or as a topmost Lens window. It is never drawn inside web content.

## 5. Run timeline anatomy

```
 ✳ Working · 1m 12s ⌄                                5 actions
 ⊕ Opened amazon.com in Lens                     on your PC
 • I'll shortlist by cancellation and battery…            (assistant note)
 ☰ Compared listings 3                                     
   search · sort · open ×6 · kept 3                        (mono sub-caption)
 ✳ Waiting for your OK to add to cart                 now
 ┌ Acting in 1 tab                                   9s ┐
 │ [■ Sony WH-1000XM6]  + 9 kept, idle                 │
 │ [ live thumbnail of the acting tab ]                │
 └──────────────────────────────────────────────────────┘
 [ Needs your OK card ]
```

- Steps are grouped by verb, with an icon, a one-line label and an optional mono caption. Timestamps are right-aligned and muted.
- A collapsed run shows only the header line. Done runs collapse automatically after 10 s.

## 6. Voice conversation anatomy (In PR #23)

- **Top:** a small status, "● Lens is speaking · 1:01".
- **Middle:** the question in muted text, then the answer in large type (28–40 px) revealed word by word. Spoken words use `--lens-fg-strong`, unspoken words `--lens-fg-muted`.
- **Under the answer:** a mono source caption, "Reading the RTINGS review on your PC".
- **Bottom:** an accent-tinted aurora or waveform that reacts to audio, with three round buttons: mute mic, stop, close (light primary).
- **Reduced motion:** a static waveform and the whole answer shown at once.

## 7. Motion

| Use | Duration | Easing |
|---|---|---|
| Cards, popovers and runs appear | 140–180 ms | `cubic-bezier(.2,.8,.2,1)` |
| Space switch | 120 ms cross-fade | same as above |
| Dock run ring | rotates at 1 turn per 1.6 s; fill animates per step | — |

- Approval cards never shake, bounce or flash. The amber dot is the only attention signal.
- `prefers-reduced-motion` turns all of these into instant state changes. The parity suite asserts no transition > 0 ms (PR #22).

## 8. How theme packs adapt

| Pack type | Canvas | Dither | Primary button | Notes |
|---|---|---|---|---|
| Obsidian / Graphite / Midnight | pack base | on (0.35) | `--lens-fg` light | reference look |
| Catppuccin, Tokyo Night, Nord, Dracula, Gruvbox, Kanagawa, Rosé Pine, Everforest, Solarized | pack base | on, ink tinted 8 % toward accent | pack `--lens-fg` | mono metadata keeps pack muted tone |
| Hyprland Neon, Cyberpunk Amber | pack base | on, scale 2 px | accent-on-dark allowed for primary | glow off on cards |
| Alabaster Daylight, Paper Minimal (light) | pack base | **inverted**: dark ink at 4–6 %, default 0.2 | dark primary (`--lens-fg` dark, `--lens-on-fg` light) | status dots darkened for 3:1 non-text contrast |
| Windows Mesh / Sequoia Frost | pack base | off by default (glass-first packs) | pack default | dither optional |

All packs must keep body text ≥ 4.5:1 and dots and icons ≥ 3:1. The theme gallery tests enforce this (PR #6).

## 9. New tokens (to add with W8-J)

`--lens-font-mono` · `--lens-warning` · `--lens-keychip-bg` · `--lens-keychip-fg` · `--lens-dither` · `--lens-dither-scale` · `--lens-dither-ink` · `--lens-grain` · `--lens-card-radius` (default 14 px) · `--lens-hold-ms` (900)
