# Golden images

Reference renders for the visual regression suite (`tools/visual/run.mjs`, docs/TESTING.md › Visual).
One PNG per state × theme pack × window size: `<state>-<preset>-<width>x<height>.png`.

They are recorded on the CI runner (ubuntu-latest, Chromium from the Playwright version pinned in
`.github/workflows/e2e.yml`) because text rendering depends on the installed fonts. To accept a
change: download the `visual-new` (missing) or `visual-actual` (changed) artifact from the run and
copy the PNGs here, or run `node tools/visual/run.mjs --update` on a matching Linux machine.
