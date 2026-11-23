# In-page Lens buttons

A tiny Lens orb appears beside things Lens can help with: a tweet's action row, YouTube's player controls, a video, an image, a 3D model, a code block, a download link. Clicking it opens a short command list. It's off until you choose where it appears.

- **Extension:** Settings › "Lens buttons on pages" (one switch per placement), or the one-time chip in the popup ("Lens buttons next to tweets, YouTube, GitHub, videos and code?"). The browser asks for access to exactly the sites those placements need.
- **Lens Browser:** Settings › Browser › "Lens buttons on pages". Applies to tabs opened after you turn it on.
- **Page actions:** press <kbd>Alt</kbd>+<kbd>L</kbd> on a page where the buttons are on.

The same two scripts run in both: `extensions/browser/src/content/marksLogic.js` (placements, actions, policy, positions; pure and unit-tested) and `extensions/browser/src/content/marks.js` (finding things on the page, the orb and the list). Lens Browser includes them at build time (`src-tauri/src/browser/host.rs`).

## The orb and the list

- 18 px orb: the Lens rainbow cloud, still at rest, billowing on hover. It only shows while you hover the thing it belongs to, so pages stay clean.
- Everything sits in one fixed layer in a closed shadow root: nothing is inserted into the page's own layout (no layout shift), and page CSS can't reach it.
- The list: type to filter, ↑/↓ and Enter, number keys 1–6, M for "More in Lens…", Esc closes and returns focus to the orb. At most six rows plus "More". The action you used last on a site moves to the top there.
- A real `<button aria-label="Lens actions">`, light and dark, honours reduced motion.

## Placements

| Placement | Where the orb sits | Actions (best first) |
|---|---|---|
| X / Twitter posts | End of the tweet's action row (reply · repost · like · views · ⦿) | Save to Shelf, Copy as Markdown, Summarise, Translate, Thread → clean article, Copy as quote card, Add to context pack, Send to Claude |
| YouTube player | Just left of the player's right-hand controls (CC, settings, fullscreen) | Transcript → Shelf, Summarise, Copy link at this moment, Chapters → notes, Copy this frame, Copy transcript, Ask about this, Add to Lens Music, Save offline (YouTube's own) |
| YouTube action row | After Like · Share · Download under the video | Same as the player |
| YouTube thumbnails | Thumbnail corner | Summarise without opening, Save to Shelf, Open in Lens Browser |
| Reddit / Hacker News | Post and comment corner / row end | Save to Shelf, Summarise, Copy as Markdown, Translate, Add to context pack |
| GitHub repo header | Header corner | Install with Lens Apps, Summarise README, Copy clone command, Add to context pack, Save to Shelf |
| GitHub code and files | Code block corner | Copy clean, Explain, Copy raw file, Save snippet, Run in Lens (asks first) |
| GitHub release assets | After the asset link | Verify before opening, Install with Lens Apps, Save to Shelf |
| Google / Bing / DuckDuckGo results | Result corner | Summarise without opening, Save to Shelf, Open in Lens Browser |
| Spotify / SoundCloud web | Track row end | Add to Lens Music, Lyrics & visualizer in Lens, Save to Shelf |
| Videos and audio (any site) | Top-right corner of the player | Picture-in-picture, Copy this frame, Transcribe, Loop, Speed 1.5×, Save file (plain files only) |
| Images (any site, ≥ 200 px) | Top-right corner | Copy image, Copy palette, Make a Lens theme, Set as wallpaper, Search similar, Save to Shelf |
| 3D models | `model-viewer` / Sketchfab embed corner; after `.glb` `.gltf` `.obj` `.stl` links | Preview in Lens, Send to ArtCraft, Save file, Save to Shelf |
| Code blocks (any site) | `pre` corner | Copy clean, Explain, Save snippet, Run in Lens (asks first) |
| Download links | After `.zip` `.exe` `.msi` `.7z` `.dmg` … links | Verify before opening, Install with Lens Apps, Save file |
| Text selection | The existing selection button | Its own Lens Mini panel (unchanged) |
| Docs / Notion / Google Docs | Selection button and Alt+L (their pages draw text on canvas) | Send to Claude, Save as note, Summarise |

Each placement is an adapter in `marks.js` (`SCANS`). If a site changes its page structure, that adapter simply finds nothing; it never throws into the page. Scans run after the page settles and again when it changes (one MutationObserver, idle-time, capped at 600 elements).

## Policy

- **Saving media:** only offered for plain file URLs (`https://…/clip.mp4`) on sites that serve them as files. Never for `blob:` / MediaSource streams (how YouTube, Netflix, Twitch and most players deliver video), never for encrypted media (`mediaKeys`), and never on YouTube, Netflix, Prime Video, Disney+, Twitch, Hulu, Max or Spotify. YouTube gets **Save offline (YouTube's own)**, which presses YouTube's own Download button (YouTube Premium) or says to use it. Lens doesn't download from YouTube.
- **Transcripts** come from the video's own captions (the same caption track YouTube's player uses); Lens's own transcription stays behind its existing setup and terms notice.
- **Scripts never run without your OK:** "Run in Lens (asks first)" opens Lens Command with the code; Lens's approval card decides.
- **Copying frames and image colours** works only where the browser allows reading the pixels (same-site media); otherwise the list says so and copies the link.
- **No credentials:** never on sign-in or banking hosts, never reads or fills password fields, never touches cookies.
- **No network:** the scripts make no requests of their own; actions go to Lens on this PC (native messaging in the extension, the page-agent queue in Lens Browser).
- **Opt-in:** off by default; per placement; a "never on these sites" list applies.

## Tests

- `src/__tests__/inPageMarks.test.ts`: settings, placements per site, permission scope, command lists, last-used ordering, filtering, media policy, positions, packaging, no network, closed shadow root.
- `extensions/browser/tools/marks-check.mjs`: fixture copies of X, YouTube, GitHub and a 3D-model page in headless Chrome, dark and light. Hover → orb in the right place → list → typing filters → Esc → number keys run actions. Writes screenshots.
- `src-tauri/src/browser/host.rs`: the Lens Browser bootstrap carries both scripts and the bridge, and is off by default.
