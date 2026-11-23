# Next steps

## Now (this week)

1. **Merge** PR #28 (waves 4–6) into `main`, then this PR (waves 7–8).
2. **Real-hardware pass** with the Tester Hub on Windows 10 22H2 and Windows 11 24H2, at 100/150/200 % scaling and two monitors. Highest risk first: hooks (Win key, Alt+drag, magic, voice push-to-talk, desktop input), Dock click-through, Remove-all on a clean VM, voice latency, Snip capture across mixed DPI.
3. **Wire agent safety** into the browser agent, control gate, Snip OCR sends, bridge adapter and AI tool runner (docs/AGENT_SAFETY.md), with a Windows compile loop.
4. **One approval card everywhere**: swap the local cards in browser, magic, snip and voice for `src/approval`.
5. **Fix F2 and F4**, and re-check the Display/Sound slider labels with the final FillSlider.
6. **Release plumbing**: create the signing key (`bun run tauri signer generate`), add the three secrets, enable Pages (`gh api -X POST repos/orionopenwow/LensUI/pages -f build_type=workflow`).

## Next (1–2 months)

7. **W8 packages** from docs/research/BROWSER_DELTA.md and docs/vision/roadmap.md, each in its own new directory:
   - Peek (link previews, Lens as default browser)
   - Split view
   - Boosts (Lens theme on any site)
   - Keys (keymap editor, link hints, OS-wide snippets)
   - Desktop-wide Spaces
   - Routines
8. **Performance**: theme switch p95 (83 ms) and Settings tab long tasks; finish moving the six inline Settings pages into `src/settings/pages/`.
9. **Site command demo**: port the newer app intents (window, move, overview, lock, calm, wallpaper, accent, dock style, DND minutes) to `docs/site/js/intent.js` and drop them from `APP_ONLY` in the site test.
10. **Lens Apps v2** (real thumbnails, one-click pill, de-duplicated home) and verify the remaining winget ids.
11. **Distribution**: code signing, Microsoft Store, winget and Scoop manifests; real Windows screen recordings to replace the site's UI-preview clips.

## Later

- Phone companion (approvals signed on the phone, voice remote, run status).
- Theme gallery with creator credit; "rice in 60 seconds" from a wallpaper.
- Plugin marketplace with sandbox review; sync between PCs.
- Linux (layer-shell) and macOS feasibility.
