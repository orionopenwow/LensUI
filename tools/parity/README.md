# Parity harness

Renders the real Lens UI frontend in a headless browser with the Tauri APIs mocked (`mock/`), so every
surface can be screenshotted and checked for crashes without Windows.

```
bun run parity            # = node tools/parity/build.mjs && node tools/parity/shoot.mjs
```

* Needs `esbuild` (installed with Vite) and `playwright` (`npm i --no-save playwright && npx playwright install chromium`).
* Screenshots and `report.json` land in `tools/parity/shots/`. The run fails on any page error, console error,
  or empty surface.
* When you add a backend command that a surface calls on startup, add a realistic mock to `mock/core.ts`;
  unknown commands return `null`, which is how missing null-handling gets caught.
* Native behaviour (window sizing, DWM, click-through, real icons) is not covered — this checks the web layer only.
