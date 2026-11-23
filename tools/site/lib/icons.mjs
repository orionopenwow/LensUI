// App icons for the website's demo desktops, written to docs/site/media/icons/<id>.svg.
//   Lens's own apps     the Lens logo (Lens Browser) and Lens-style glyph tiles (Settings, Apps, Command)
//   Third-party apps    Simple Icons brand marks (CC0, tools/site/vendor/simple-icons) on their brand colour
//   Windows built-ins   original generic stand-ins (folder, terminal, notepad), not Microsoft's artwork
// The open-source tools (Krita, Blender, OBS, Ollama, ArtCraft…) use the icons from each project's own
// repository, already fetched into media/apps/ by fetch-app-media.mjs.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BRANDS = {
  spotify: ["spotify", "#1DB954"],
  discord: ["discord", "#5865F2"],
  chrome: ["googlechrome", "#4285F4"],
  steam: ["steam", "#1B2838"],
  obsidian: ["obsidian", "#7C3AED"],
  figma: ["figma", "#F24E1E"],
  vscodium: ["vscodium", "#2F80ED"],
  firefox: ["firefoxbrowser", "#FF7139"],
  github: ["github", "#181717"],
  notion: ["notion", "#191919"],
};

const tile = (fill, inner, stroke = "rgb(255 255 255 / 0.14)") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="0.5" y="0.5" width="63" height="63" rx="15" fill="${fill}" stroke="${stroke}"/>${inner}</svg>`;
const obsidian = (glyph) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#27272a"/><stop offset="1" stop-color="#09090b"/></linearGradient><linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a5b4fc"/><stop offset="0.5" stop-color="#f0abfc"/><stop offset="1" stop-color="#67e8f9"/></linearGradient></defs><rect x="0.5" y="0.5" width="63" height="63" rx="15" fill="url(#g)" stroke="rgb(255 255 255 / 0.16)"/><g fill="none" stroke="url(#r)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;

const ORIGINAL = {
  // Lens's own surfaces
  "lens-settings": obsidian(`<circle cx="32" cy="32" r="6"/><path d="M32 14v6M32 44v6M14 32h6M44 32h6M19.3 19.3l4.2 4.2M40.5 40.5l4.2 4.2M19.3 44.7l4.2-4.2M40.5 23.5l4.2-4.2"/><circle cx="32" cy="32" r="13"/>`),
  "lens-apps": obsidian(`<rect x="16" y="16" width="13" height="13" rx="4"/><rect x="35" y="16" width="13" height="13" rx="4"/><rect x="16" y="35" width="13" height="13" rx="4"/><path d="M41.5 35v13M35 41.5h13"/>`),
  "lens-command": obsidian(`<circle cx="28" cy="28" r="10"/><path d="M35.5 35.5L47 47"/><path d="M24 28h8M28 24v8"/>`),
  // Generic stand-ins for Windows built-ins (drawn here, not Microsoft's artwork)
  explorer: tile("#F5B83D", `<path d="M14 22a4 4 0 0 1 4-4h9l4 4h15a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" fill="#FFE3A3"/><path d="M14 28h36v16a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" fill="#FFD36B"/>`, "rgb(0 0 0 / 0.08)"),
  terminal: tile("#18181B", `<path d="M18 24l9 8-9 8" fill="none" stroke="#4ADE80" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 42h15" stroke="#E4E4E7" stroke-width="4" stroke-linecap="round"/>`),
  notepad: tile("#3B82F6", `<rect x="18" y="13" width="28" height="38" rx="4" fill="#F8FAFC"/><path d="M24 23h16M24 30h16M24 37h10" stroke="#94A3B8" stroke-width="3" stroke-linecap="round"/>`, "rgb(0 0 0 / 0.08)"),
  "lens-notes": obsidian(`<path d="M20 15h18l8 8v26H20z"/><path d="M38 15v8h8M26 32h14M26 39h10"/>`),
  "lens-music": obsidian(`<path d="M26 44V20l18-4v24"/><circle cx="22" cy="44" r="4.5"/><circle cx="40" cy="40" r="4.5"/>`),
  "lens-monitor": obsidian(`<path d="M14 38h8l5-12 6 20 6-14 3 6h8"/>`),
  "lens-timer": obsidian(`<circle cx="32" cy="35" r="13"/><path d="M32 35v-7M28 16h8M32 16v6"/>`),
  // File-type icons for the Files app (originals)
  "file-doc": tile("#F8FAFC", `<path d="M22 14h14l8 8v28H22z" fill="#fff" stroke="#CBD5E1" stroke-width="2"/><path d="M27 30h12M27 36h12M27 42h8" stroke="#64748B" stroke-width="2.6" stroke-linecap="round"/>`, "rgb(0 0 0 / 0.1)"),
  "file-video": tile("#F43F5E", `<rect x="14" y="20" width="36" height="24" rx="5" fill="#fff"/><path d="M29 26l9 6-9 6z" fill="#F43F5E"/>`, "rgb(0 0 0 / 0.08)"),
  "file-theme": tile("#5E81AC", `<circle cx="26" cy="28" r="7" fill="#88C0D0"/><circle cx="38" cy="28" r="7" fill="#EBCB8B"/><circle cx="32" cy="38" r="7" fill="#BF616A"/>`, "rgb(0 0 0 / 0.08)"),
  "file-exe": tile("#3BABFF", `<rect x="16" y="18" width="32" height="28" rx="4" fill="#fff"/><path d="M16 26h32" stroke="#3BABFF" stroke-width="3"/><path d="M32 31v10M27 36l5 5 5-5" fill="none" stroke="#3BABFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`, "rgb(0 0 0 / 0.08)"),
  "file-pdf": tile("#EF4444", `<path d="M22 14h14l8 8v28H22z" fill="#fff"/><text x="33" y="42" font-family="Arial" font-weight="700" font-size="10" text-anchor="middle" fill="#EF4444">PDF</text>`, "rgb(0 0 0 / 0.08)"),
  "file-image": tile("#22C55E", `<rect x="15" y="18" width="34" height="28" rx="4" fill="#fff"/><circle cx="25" cy="27" r="3.5" fill="#FBBF24"/><path d="M17 44l11-11 7 7 5-5 8 9z" fill="#22C55E"/>`, "rgb(0 0 0 / 0.08)"),
  music: tile("#E11D48", `<path d="M27 42V20l17-4v22" fill="none" stroke="#fff" stroke-width="3.6" stroke-linejoin="round"/><circle cx="23" cy="42" r="5" fill="#fff"/><circle cx="40" cy="38" r="5" fill="#fff"/>`),
};

/** Writes every icon; returns the list of ids. */
export function writeIcons(root, out) {
  mkdirSync(out, { recursive: true });
  const ids = [];
  for (const [id, [file, hex]] of Object.entries(BRANDS)) {
    const src = join(root, "tools/site/vendor/simple-icons", `${file}.svg`);
    if (!existsSync(src)) continue;
    const d = [...readFileSync(src, "utf8").matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]).join(" ");
    writeFileSync(join(out, `${id}.svg`), tile(hex, `<path transform="translate(15 15) scale(1.4167)" fill="#fff" d="${d}"/>`));
    ids.push(id);
  }
  for (const [id, svg] of Object.entries(ORIGINAL)) { writeFileSync(join(out, `${id}.svg`), svg); ids.push(id); }
  // Lens Browser wears the Lens logo itself.
  const logo = join(root, "docs/brand/lens-logo-small.svg");
  if (existsSync(logo)) { writeFileSync(join(out, "lens-browser.svg"), readFileSync(logo)); ids.push("lens-browser"); }
  return ids;
}
