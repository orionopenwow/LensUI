// Writes README.md from tools/site/content/features.mjs and docs/media/clips.json, so the README
// and the website describe the same features with the same clips.
// Usage: node tools/site/gen-readme.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURES, TRUST, WORKS_ON, REPO, HERO_CLIP } from "./content/features.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const clips = existsSync(join(root, "docs/media/clips.json")) ? JSON.parse(readFileSync(join(root, "docs/media/clips.json"), "utf8")) : [];
const clip = (id) => clips.find((c) => c.id === id && c.gif);
const SITE = "https://orionopenwow.github.io/lensui/";

const gif = (id, alt) => (clip(id) ? `<img src="./docs/media/${id}.gif" alt="${alt.replace(/"/g, "&quot;")}" width="720">` : "");
const statusLine = (f) => (f.status === "dev" ? `> **In development** — in [pull request #${f.pr}](${REPO}/pull/${f.pr}), not in a build yet.\n\n` : "");

const tour = FEATURES.map((f) => {
  const media = f.clips.map((id) => gif(id, clip(id)?.title ?? f.title)).filter(Boolean)[0] ?? "";
  const docs = f.docs.length ? `\nMore: ${f.docs.map((d) => `[${d.split("/").pop()}](./${d})`).join(" · ")}\n` : "";
  const note = f.note ? `\n_${f.note}_\n` : "";
  return `### ${f.title}

${statusLine(f)}${f.lede}

${media ? `<p align="center">${media}</p>\n\n` : ""}${f.bullets.map((b) => `- ${b}`).join("\n")}
${note}${docs}`;
}).join("\n");

const readme = `<!-- The feature tour below is generated from tools/site/content/features.mjs by
     tools/site/gen-readme.mjs. Edit that file, then re-run the script. -->
<div align="center">
  <img src="./assets/lensui-logo.svg" alt="" width="88" />
  <h1>Lens UI</h1>
  <p>A calm, themeable desktop for Windows 10 and 11: dock, themes, window styling, a living wallpaper and a local-first AI helper, in one app that undoes everything it changes.</p>
  <p>
    <a href="${REPO}/actions/workflows/build.yml"><img src="${REPO}/actions/workflows/build.yml/badge.svg" alt="build status" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-09090b?style=flat-square" alt="MIT license" /></a>
  </p>
  <p><a href="${SITE}">Website</a> · <a href="${SITE}try.html">Try it in your browser</a> · <a href="./docs/guide-for-users/README.md">User guide</a> · <a href="./docs/MASTERPLAN.md">Plan</a></p>
</div>

<p align="center">${gif(HERO_CLIP, "The Lens dock on a dark desktop: icons grow under the pointer and an app bounces as it launches")}</p>

> **Status: beta, not yet tested on many real machines.** Everything compiles and runs its tests on Windows in CI, and every surface renders in automated screenshot tests, but most features have only been tried on a few PCs. There is no signed installer yet. New features are off by default. Keep [\`Restore-Windows-Taskbar.bat\`](./Restore-Windows-Taskbar.bat) handy while you try it.
>
> The clips in this README are rendered from the real Lens interface in a headless browser; the Windows side (other apps, the real desktop) is simulated in them. Recordings from real Windows machines will replace them.

## What Lens is

Lens sits on top of Windows Explorer instead of patching it. It gives you a dock and a top bar that are quick to read, themes that restyle every surface (including other apps' window frames) in one design language, and a command layer that works offline. An optional AI helper can use a model on your own PC or Claude, and it asks before anything risky. Quit Lens and Windows is as you left it.

Built with [Tauri 2](https://tauri.app) (Rust and Win32) and React.

## Feature tour

${tour}
## Trust model

${TRUST.map(([t, d]) => `- **${t}.** ${d}`).join("\n")}

Restore scripts work even when Lens isn't running: [\`Restore-Windows-Taskbar.bat\`](./Restore-Windows-Taskbar.bat), [\`Restore-Windows-Shell.bat\`](./Restore-Windows-Shell.bat) and [\`Uninstall-Lens-UI.bat\`](./Uninstall-Lens-UI.bat). No telemetry and no account.

## Works on

| Feature | Windows 10 | Windows 11 |
| :--- | :--- | :--- |
${WORKS_ON.map(([f, w10, w11]) => `| ${f} | ${w10} | ${w11} |`).join("\n")}

Expected support, based on the Windows features each part uses; real-machine testing is ongoing. Linux and macOS: the interface runs and CI compile-checks the Rust on both, but real support needs a platform layer (see the [plan](./docs/MASTERPLAN.md)).

## Install

There is no signed release yet. Until there is, build from source.

Requirements: Windows 10 (1809 or newer) or Windows 11, the [Rust toolchain](https://www.rust-lang.org/tools/install) (stable, MSVC) and [Bun](https://bun.sh).

\`\`\`bat
git clone ${REPO.toLowerCase()}
cd lensui
bun install
bun run tauri dev
\`\`\`

Or double-click \`Launch-Lens-UI.bat\` for development mode and \`Build-Lens-UI.bat\` for a standalone build (written to \`src-tauri\\target\\release\\bundle\`).

After the first launch, open Settings and press **Run self-test**. If anything looks wrong, attach the report to an [issue](${REPO}/issues). Testers: Settings › About & Testing has today's checklist and a one-click report.

## Documentation

- [User guide](./docs/guide-for-users/README.md): short how-tos for every area, generated from Lens's own settings.
- [Website](${SITE}): live demos of the dock, themes, sand, approvals and the command engine.
- Reference: [Dock styles](./docs/DOCK_STYLES.md) · [Window styling](./docs/WINDOW_STYLING.md) · [Productivity](./docs/PRODUCTIVITY.md) · [Playground](./docs/PLAYGROUND.md) · [Pointers](./docs/CURSORS.md) · [AI](./docs/AI.md) · [Command](./docs/COMMAND.md) · [Shelf](./docs/SHELF.md) · [Browser bridge](./docs/BROWSER_BRIDGE.md) · [Transcription](./docs/TRANSCRIPTION.md) · [MCP](./docs/MCP.md) · [Plugins](./docs/PLUGINS.md) · [Shell mode](./docs/SHELL_MODE.md)
- Project: [Master plan](./docs/MASTERPLAN.md) · [Roadmap](./docs/ROADMAP.md) · [Design system](./DESIGN.md) · [Releasing](./docs/RELEASING.md) · [Tester Hub](./docs/TESTER_HUB.md) · [Media](./docs/media/README.md)

## Contributing

Issues and pull requests are welcome. Before opening a pull request:

- Read [AGENTS.md](./AGENTS.md): never touch user files outside \`%APPDATA%\\LensUI\\\` without confirmation, and keep every OS change reversible.
- Run \`bun run build\` and \`bun run test\`, and on Windows \`cargo clippy\` and \`cargo test\` in \`src-tauri\`.
- CI renders every surface in a headless browser and fails on crashes or console errors; look at its screenshots for visual changes.

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE). Lens UI is not affiliated with Microsoft or Anthropic.
`;

writeFileSync(join(root, "README.md"), readme);
console.log(`README.md written (${FEATURES.length} feature sections, ${clips.filter((c) => c.gif).length} clips available)`);
