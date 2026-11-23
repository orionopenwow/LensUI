// Builds the Lens Guide knowledge index from the repository itself, so the Guide can only ever
// point at settings, commands and docs that really exist. Used by build-index.mjs (writes
// src/guide/index.json) and by the bun tests (completeness checks). Plain JS on purpose: it runs
// under Node in the prebuild step and under bun in tests, with no TypeScript loader.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { parseLesson } from "./lessons.mjs";

export const INDEX_VERSION = 1;

const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const exists = (root, rel) => existsSync(join(root, rel));

/** "HotCornersCard" → "Hot corners" */
export function humanize(name) {
  const words = name
    .replace(/(Card|Pane|Tab)$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .split(/\s+/);
  return words.map((w, i) => (i === 0 ? w : /^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(" ");
}

const clean = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** Literal JSX text only: skip anything that is an expression (`{…}`) or empty. */
const literal = (s) => {
  const t = clean(s);
  if (!t || /[{}<>]/.test(t)) return null;
  return t;
};

/**
 * JSX text with expressions removed: "{mod.label} + Drag Windows" → "Drag Windows". Returns null
 * when nothing readable is left.
 */
const textOf = (s) => {
  const t = clean(s.replace(/\{[^{}]*\}/g, " ").replace(/^[\s+·:–-]+|[\s+·:–-]+$/g, ""));
  if (!t || /[{}<>]/.test(t) || !/[A-Za-z]{3}/.test(t)) return null;
  return t.replace(/^[+·:–-]\s*/, "");
};

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// ---------------------------------------------------------------------------------------------
// Control Center: tabs, which components mount under which tab, and the labels inside them.
// ---------------------------------------------------------------------------------------------

const CC = "src/surfaces/ControlCenterSurface.tsx";
const LABEL_CLASSES = [
  "cc-label",
  "tux-field-label",
  "tux-slider-label",
  "tux-block-head",
  "ai-card-title",
  "cs-head",
];

/** Settings pages, in nav order: [{id,label}]. Since the Settings hub (src/settings/registry.ts)
 *  pages have new ids; the index keeps the older tab ids (theme, system, sessions, monitor,
 *  messages) so lesson and golden-query ids stay stable, and LEGACY_TABS in the registry maps them
 *  back when a Show me opens Settings. */
const PAGE_TO_LEGACY = { appearance: "theme", keys: "system", desktop: "sessions", tasks: "monitor", notifications: "messages" };
const legacy = (id) => PAGE_TO_LEGACY[id] ?? id;
const REGISTRY = "src/settings/registry.ts";
export function extractTabs(root) {
  const out = [];
  if (exists(root, REGISTRY)) {
    const src = read(root, REGISTRY);
    const re = /\{\s*id:\s*"([a-z-]+)",\s*group:\s*"[a-z]+",\s*label:\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) out.push({ id: legacy(m[1]), label: clean(m[2]) });
    if (out.length) return out;
  }
  const src = read(root, CC);
  const re = /\{\s*id:\s*"([a-z-]+)",\s*label:\s*"([^"]+)",\s*icon:/g;
  let m;
  while ((m = re.exec(src))) out.push({ id: m[1], label: clean(m[2]) });
  return out;
}

/** Page files mounted by the Settings hub: [{tab, file}]. */
export function pageFiles(root) {
  const idx = "src/settings/pages/index.ts";
  if (!exists(root, idx)) return [];
  const src = read(root, idx);
  const out = [];
  // Lazy entries: `display: page(() => import("./DisplayPage"), "DisplayPage")`.
  for (const m of src.matchAll(/^\s+([a-z]+):\s*page\(\(\)\s*=>\s*import\("\.\/([A-Za-z]+)"\)/gm)) {
    out.push({ tab: legacy(m[1]), file: `src/settings/pages/${m[2]}.tsx` });
  }
  // Plain entries: `display: DisplayPage,` with a matching import.
  for (const m of src.matchAll(/^\s+([a-z]+):\s*([A-Za-z]+),\s*$/gm)) {
    const imp = src.match(new RegExp(`import\\s+\\{\\s*${m[2]}\\s*\\}\\s+from\\s+"\\./([^"]+)"`));
    if (imp) out.push({ tab: legacy(m[1]), file: `src/settings/pages/${imp[1]}.tsx` });
  }
  return out;
}

/** Find which file defines a component: src/components, src/themeux, src/bridge, src/media, … */
function componentFile(root, name, fromFile = null) {
  // Follow the mounting file's own import first.
  if (fromFile) {
    const src = read(root, fromFile);
    const imp = src.match(new RegExp(`import\\s+(?:\\{[^}]*\\b${name}\\b[^}]*\\}|${name})\\s+from\\s+"([^"]+)"`));
    if (imp && imp[1].startsWith(".")) {
      const base = join(dirname(fromFile), imp[1]).replace(/\\/g, "/");
      for (const f of [`${base}.tsx`, `${base}/index.tsx`, `${base}.ts`]) if (exists(root, f)) return f;
    }
  }
  const dirs = ["src/components", "src/themeux", "src/bridge", "src/media", "src/command", "src/cursors", "src/dock", "src/plugins", "src/guide"];
  for (const d of dirs) {
    if (exists(root, `${d}/${name}.tsx`)) return `${d}/${name}.tsx`;
  }
  // Fallback: a named export inside some file of those dirs.
  for (const d of dirs) {
    if (!exists(root, d)) continue;
    for (const f of readdirSync(join(root, d)).sort()) {
      if (!f.endsWith(".tsx")) continue;
      const s = read(root, `${d}/${f}`);
      if (new RegExp(`(export\\s+(const|function)\\s+${name}\\b)|(const\\s+${name}\\s*[:=])`).test(s)) return `${d}/${f}`;
    }
  }
  return null;
}

/**
 * Walk a file line by line tracking the active `tab === "x"` block and the latest section title,
 * and report every <SomethingCard|Pane|Tab …> mount: [{component, tabs, section, line}].
 */
export function extractMounts(root, file = CC, inherited = null) {
  const lines = read(root, file).split("\n");
  const mounts = [];
  let tabs = inherited ? inherited.tabs : [];
  let section = inherited ? inherited.section : null;
  let sectionId = inherited ? inherited.sectionId ?? null : null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inherited) {
      const blk = line.match(/\{\s*\(?\s*tab === "([a-z-]+)"(.*)&&/);
      if (blk) {
        tabs = [blk[1], ...[...blk[2].matchAll(/tab === "([a-z-]+)"/g)].map((x) => x[1])].map(legacy);
        section = null;
      }
    }
    const sec = line.match(/className="(?:cc-section-title|tux-section-title)">([^<{]+)</);
    if (sec) section = clean(sec[1]);
    const secComp = line.match(/<Section\b[^>]*\bid="([a-z0-9-]+)"[^>]*?\btitle="([^"]+)"/) ?? null;
    if (secComp) {
      section = clean(secComp[2]);
      sectionId = secComp[1];
    } else if (/<Section\b/.test(line)) {
      // Multi-line <Section id=… title=…>: look ahead a few lines.
      const chunk = lines.slice(i, i + 4).join(" ");
      const id = chunk.match(/\bid="([a-z0-9-]+)"/);
      const t = chunk.match(/\btitle="([^"]+)"/);
      if (t) section = clean(t[1]);
      if (id) sectionId = id[1];
    }
    for (const c of line.matchAll(/<([A-Z][A-Za-z0-9]*(?:Card|Pane|Tab|Inbox))\b/g)) {
      if (c[1] === "PackCard") continue; // gallery tiles, not settings cards
      mounts.push({ component: c[1], tabs: [...tabs], section, sectionId, line: i + 1, file });
    }
  }
  return mounts;
}

/** Labels (with descriptions) inside one component file. */
export function extractLabels(root, file, component = null) {
  const src = read(root, file);
  const start = component ? src.search(new RegExp(`export\\s+(?:const|function)\\s+${component}\\b`)) : -1;
  const out = [];
  const cls = LABEL_CLASSES.join("|");
  const re = new RegExp(`className="(?:${cls})"[^>]*>([^<]{1,200})<`, "g");
  let m;
  while ((m = re.exec(src))) {
    const label = textOf(m[1]);
    if (!label || label.length < 3 || label.length > 70) continue;
    if (m[1].includes("{") && !label.includes(" ")) continue; // "{name} corner" → too vague to cite
    const after = src.slice(m.index, m.index + 900);
    const d = after.match(/className="(?:cc-desc|tux-field-desc|cs-desc|ai-card-desc|cc-hint)"[^>]*>([^<]{1,400})</);
    out.push({ label, desc: d ? textOf(d[1]) ?? "" : "", at: m.index });
  }
  // Local row helpers: <Toggle label="…" desc="…" /> and friends.
  const props = /<(?:Toggle|ToggleRow|Row|SettingRow|Field)\b([^>]*?)\/?>/gs;
  while ((m = props.exec(src))) {
    const l = m[1].match(/\blabel="([^"]+)"/);
    if (!l) continue;
    const d = m[1].match(/\bdesc="([^"]+)"/);
    const label = clean(l[1]);
    if (label.length >= 3 && label.length <= 70) out.push({ label, desc: d ? clean(d[1]) : "" });
  }
  for (const h of src.matchAll(/className="tux-h2"[^>]*>([^<{]+)</g)) out.push({ label: clean(h[1]), desc: "", heading: true });
  const sec = /<Section\b[\s\S]{0,200}?\btitle="([^"]+)"/g;
  while ((m = sec.exec(src))) out.push({ label: clean(m[1]), desc: "", section: true });
  // de-duplicate by label
  if (start >= 0) {
    // The component's own header comes first, so its first label is the card title.
    out.sort((a, b) => Number((a.at ?? 1e9) < start) - Number((b.at ?? 1e9) < start));
  }
  const seen = new Set();
  return out.filter((x) => (seen.has(x.label.toLowerCase()) ? false : seen.add(x.label.toLowerCase())));
}

/** Settings entries: one per card plus one per labelled control inside it. */
export function extractSettings(root) {
  const tabs = extractTabs(root);
  const tabLabel = Object.fromEntries(tabs.map((t) => [t.id, t.label]));
  const visible = (ids) => ids.find((id) => tabLabel[id]);
  const entries = [];
  const seenCards = new Set();

  const addComponent = (mount, parentCard = null) => {
    const tab = visible(mount.tabs);
    if (!tab) return;
    const file = componentFile(root, mount.component, mount.file);
    if (!file) return;
    const labels = extractLabels(root, file, mount.component);
    const isTab = /Tab$/.test(mount.component);
    const cardTitle = isTab ? null : labels.find((l) => !l.section && !l.heading)?.label ?? humanize(mount.component);
    const cardKey = `${tab}:${mount.component}`;
    if (!isTab && !seenCards.has(cardKey)) {
      seenCards.add(cardKey);
      const pathParts = ["Settings", tabLabel[tab], mount.section, parentCard, cardTitle].filter(Boolean);
      entries.push({
        id: `card.${tab}.${slug(mount.component)}`,
        kind: "card",
        title: cardTitle,
        // What the user sees first (the card's description), then its controls; the source comment
        // last, for search only.
        text: [labels.find((l) => l.desc)?.desc, labels.slice(0, 8).map((l) => l.label).join(" · "), humanize(mount.component), docComment(root, file, mount.component)]
          .filter(Boolean)
          .map((t) => t.replace(/[.\s]+$/, ""))
          .join(". "),
        path: dedupe(pathParts),
        target: { surface: "settings", tab, card: mount.component, label: cardTitle, section: mount.sectionId ?? undefined },
        source: file,
      });
    }
    for (const l of labels) {
      if (l.section) continue;
      if (!isTab && l.label === cardTitle) continue;
      entries.push({
        id: `setting.${tab}.${slug(mount.component)}.${slug(l.label)}`,
        kind: "setting",
        title: l.label,
        text: l.desc,
        path: dedupe(["Settings", tabLabel[tab], mount.section, cardTitle, l.label].filter(Boolean)),
        target: { surface: "settings", tab, card: mount.component, label: l.label, section: mount.sectionId ?? undefined },
        source: file,
      });
    }
    // Tabs (ThemeTab, DockTab) mount cards of their own.
    if (isTab) {
      for (const inner of extractMounts(root, file, { tabs: mount.tabs, section: null })) {
        if (inner.component === mount.component) continue;
        addComponent({ ...inner, tabs: mount.tabs });
      }
    }
  };

  for (const m of extractMounts(root)) addComponent(m);
  for (const p of pageFiles(root)) for (const m of extractMounts(root, p.file, { tabs: [p.tab], section: null })) addComponent(m);

  // Labels written inline in the Control Center itself.
  const lines = read(root, CC).split("\n");
  let tabsNow = [];
  let section = null;
  lines.forEach((line, i) => {
    const blk = line.match(/\{\s*\(?\s*tab === "([a-z-]+)"(.*)&&/);
    if (blk) {
      tabsNow = [blk[1], ...[...blk[2].matchAll(/tab === "([a-z-]+)"/g)].map((x) => x[1])].map(legacy);
      section = null;
    }
    const sec = line.match(/className="cc-section-title">([^<{]+)</);
    if (sec) section = clean(sec[1]);
    const lab = line.match(/className="cc-label"[^>]*>([^<]+)</);
    if (!lab) return;
    const label = literal(lab[1]);
    const tab = visible(tabsNow);
    if (!label || !tab) return;
    const after = lines.slice(i, i + 8).join(" ");
    const d = after.match(/className="cc-desc"[^>]*>([^<{]+)</);
    entries.push({
      id: `setting.${tab}.inline.${slug(label)}`,
      kind: "setting",
      title: label,
      text: d ? literal(d[1]) ?? "" : "",
      path: dedupe(["Settings", tabLabel[tab], section, label].filter(Boolean)),
      target: { surface: "settings", tab, label },
      source: CC,
    });
  });

  // Tabs themselves.
  for (const t of tabs) {
    entries.push({
      id: `tab.${t.id}`,
      kind: "tab",
      title: t.label,
      text: `The ${t.label} tab in Settings.`,
      path: ["Settings", t.label],
      target: { surface: "settings", tab: t.id },
      source: CC,
    });
  }
  return uniqueIds(entries);
}

/** The JSDoc comment right above `export const|function Name`, without "Control Center card:". */
export function docComment(root, file, name) {
  const src = read(root, file);
  const at = src.search(new RegExp(`export\\s+(?:const|function)\\s+${name}\\b`));
  if (at > 0) {
    const before = src.slice(0, at).trimEnd();
    if (before.endsWith("*/")) {
      const open = before.lastIndexOf("/**");
      if (open >= 0) return clean(before.slice(open + 3, -2).replace(/^\s*\*\s?/gm, " ")).replace(/^Control Center card:\s*/i, "").slice(0, 300);
    }
  }
  // Fall back to the file's header comment.
  const h = src.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  return h ? clean(h[1].replace(/^\s*\*\s?/gm, " ")).replace(/^Control Center card:\s*/i, "").slice(0, 300) : "";
}

function dedupe(parts) {
  const out = [];
  for (const p of parts) if (out[out.length - 1] !== p) out.push(p);
  return out;
}

function uniqueIds(entries) {
  const seen = new Map();
  return entries.map((e) => {
    const n = seen.get(e.id) ?? 0;
    seen.set(e.id, n + 1);
    return n ? { ...e, id: `${e.id}-${n + 1}` } : e;
  });
}

// ---------------------------------------------------------------------------------------------
// Catalogues: theme packs, dock styles, Playground scenes, script commands, hotkeys.
// ---------------------------------------------------------------------------------------------

export function extractPacks(root) {
  const src = read(root, "src/themes/packs.ts");
  const out = [];
  for (const m of src.matchAll(/\{\s*id:\s*"([a-z0-9-]+)",\s*label:\s*"([^"]+)",\s*tier:\s*"([^"]+)"[^\n]*?description:\s*"([^"]+)"/g)) {
    out.push({
      id: `pack.${m[1]}`,
      kind: "pack",
      title: m[2],
      text: `${m[4]} Theme pack (${m[3]}).`,
      path: ["Settings", "Theme & Look", "Choose a theme", m[2]],
      target: { surface: "settings", tab: "theme", label: "Choose a theme" },
      source: "src/themes/packs.ts",
    });
  }
  return out;
}

export function extractDockStyles(root) {
  const src = read(root, "src/dock/styles.ts");
  const out = [];
  for (const m of src.matchAll(/id:\s*"([a-z]+)",\s*\n\s*label:\s*"([^"]+)",\s*\n\s*description:\s*"([^"]+)"/g)) {
    out.push({
      id: `dock-style.${m[1]}`,
      kind: "dock-style",
      title: `${m[2]} dock style`,
      text: `${m[3]} A dock style.`,
      path: ["Settings", "Dock & Top Bar", "Dock style", m[2]],
      target: { surface: "settings", tab: "dock", label: "Dock style" },
      source: "src/dock/styles.ts",
    });
  }
  return out;
}

export function extractScenes(root) {
  const dir = "src/playground/scenes";
  if (!exists(root, dir)) return [];
  const out = [];
  for (const f of readdirSync(join(root, dir)).sort()) {
    const src = read(root, `${dir}/${f}`);
    const m = src.match(/:\s*SceneModule\s*=\s*\{\s*id:\s*"([a-z-]+)",\s*name:\s*"([^"]+)",\s*blurb:\s*"([^"]+)"/);
    if (!m) continue;
    out.push({
      id: `scene.${m[1]}`,
      kind: "scene",
      title: m[2],
      text: `${m[3]} A Playground scene for your desktop wallpaper.`,
      path: ["Settings", "Desktops & Widgets", "Living desktop", m[2]],
      target: { surface: "settings", tab: "sessions", card: "PlaygroundCard", label: "Playground" },
      source: `${dir}/${f}`,
    });
  }
  return out;
}

const INTENT_TITLES = {
  open_app: "Open an app",
  switch_app: "Switch to an app",
  close_app: "Close an app",
  set_color_mode: "Dark or light mode",
  set_theme_pack: "Switch theme pack",
  snap_window: "Snap the window",
  arrange_windows: "Arrange windows",
  show_desktop: "Show the desktop",
  set_focus_mode: "Focus mode",
  set_dnd: "Do Not Disturb",
  set_night_light: "Night light",
  set_volume: "Set volume",
  change_volume: "Volume up or down",
  set_mute: "Mute",
  set_brightness: "Set brightness",
  change_brightness: "Brightness up or down",
  switch_workspace: "Switch workspace",
  search_files: "Search files",
  open_settings_page: "Open a settings page",
  start_timer: "Start a timer",
  create_note: "Make a note",
  calculate: "Calculate",
  convert: "Convert units",
};

/** Script-engine commands with example phrasings from the intent parser's own test table. */
export function extractCommands(root) {
  const f = "src-tauri/src/ai/intent.rs";
  if (!exists(root, f)) return [];
  const src = read(root, f);
  const examples = {};
  for (const m of src.matchAll(/\("([^"\\]{3,60})",\s*"([a-z_]+)",\s*"[^"]*"\)/g)) {
    (examples[m[2]] ??= []).push(m[1]);
  }
  const actions = new Set([...src.matchAll(/(?:Raw)?Intent::new\("([a-z_]+)"/g)].map((m) => m[1]));
  for (const a of Object.keys(examples)) actions.add(a);
  return [...actions].sort().map((a) => {
    const ex = (examples[a] ?? []).slice(0, 4);
    return {
      id: `command.${a}`,
      kind: "command",
      title: INTENT_TITLES[a] ?? humanize(a.replace(/_(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase())),
      text: `Type it in Lens Command or the palette and Lens does it, no AI model needed.${ex.length ? ` For example: “${ex.join("”, “")}”.` : ""}`,
      path: ["Lens Command", "Do"],
      target: { surface: "command" },
      examples: ex,
      source: f,
    };
  });
}

/** Keyboard shortcuts mentioned in the docs, each with the sentence that explains it. */
export function extractHotkeys(root) {
  const out = [];
  const seen = new Set();
  for (const f of docFiles(root)) {
    const text = read(root, f);
    for (const sentence of text.split(/(?<=[.!?])\s+|\n/)) {
      for (const m of sentence.matchAll(/\b((?:Ctrl|Alt|Shift|Win)(?:\s*\+\s*(?:Ctrl|Alt|Shift|Win))*\s*\+\s*(?:Space|Tab|Esc|Enter|F\d{1,2}|[A-Z0-9]|←|→|↑|↓|Left|Right|Up|Down|Plus))\b/g)) {
        const key = m[1].replace(/\s+/g, "");
        if (seen.has(key)) continue;
        const s = clean(sentence.replace(/[`*_#>|]/g, ""));
        if (s.length < 12 || s.length > 240) continue;
        seen.add(key);
        out.push({
          id: `hotkey.${slug(key)}`,
          kind: "hotkey",
          title: key,
          text: s,
          path: ["Keyboard", key],
          target: { surface: "doc", doc: f },
          source: f,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Docs, chunked by heading.
// ---------------------------------------------------------------------------------------------

// Developer-only docs (plans, research, integration notes) are not user help.
const DEV_DOCS = /^(INTEGRATION_NOTES|CORE_PATCH_PLAN|COMPETITIVE_STRATEGY|FEATURE_RESEARCH|COMMAND_RESEARCH|VOICE_RESEARCH|ROBUSTNESS|RELEASING|ROADMAP|THEMES_ROADMAP|KEYHOOK|TESTING|MASTERPLAN|AI_SURFACES|GUIDE)\.md$/;
// Sections inside user docs that are for developers.
const DEV_HEADING = /wiring|integrat|snippet|\btests?\b|\bci\b|files|build|commands? \(backend\)|ipc|contract|implementation|architecture|for developers|internals|verification|known gaps|todo/i;
export function docFiles(root) {
  return readdirSync(join(root, "docs"))
    .filter((f) => f.endsWith(".md") && !DEV_DOCS.test(f))
    .map((f) => `docs/${f}`)
    .sort();
}

export function extractDocs(root) {
  const out = [];
  for (const f of docFiles(root)) {
    const text = read(root, f);
    const docTitle = (text.match(/^#\s+(.+)$/m)?.[1] ?? basename(f, ".md")).trim();
    const parts = text.split(/^(?=#{2,3}\s)/m);
    parts.forEach((part, i) => {
      const head = part.match(/^#{2,3}\s+(.+)$/m)?.[1]?.trim() ?? docTitle;
      const body = clean(
        part
          .replace(/```[\s\S]*?```/g, " ")
          .replace(/^#{1,6}\s+.*$/gm, " ")
          .replace(/[`*_>|]/g, " ")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      );
      if (body.length < 40 || (head !== docTitle && DEV_HEADING.test(head))) return;
      out.push({
        id: `doc.${slug(basename(f, ".md"))}.${i}`,
        kind: "doc",
        title: head === docTitle ? docTitle : `${docTitle}: ${head}`,
        text: body.slice(0, 900),
        path: ["Docs", docTitle, ...(head === docTitle ? [] : [head])],
        target: { surface: "doc", doc: f, heading: head },
        source: f,
      });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Lessons (guide/*.md) and the whole index.
// ---------------------------------------------------------------------------------------------

export function extractLessons(root) {
  if (!exists(root, "guide")) return [];
  return readdirSync(join(root, "guide"))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseLesson(read(root, `guide/${f}`), `guide/${f}`));
}

/**
 * Optional catalogues from sibling packages. When they land, their entries are folded in and
 * win over the hand-extracted ones with the same id.
 */
function optionalCatalogues(root) {
  const out = [];
  if (exists(root, "src/control/catalogue.json")) {
    try {
      const cat = JSON.parse(read(root, "src/control/catalogue.json"));
      for (const s of cat.settings ?? []) {
        if (!s.key || !s.label) continue;
        out.push({ id: `control.${s.key}`, kind: "setting", title: s.label, text: s.description ?? "", path: s.path ?? ["Settings", s.label], target: s.tab ? { surface: "settings", tab: s.tab, label: s.label } : { surface: "settings" }, source: "src/control/catalogue.json" });
      }
    } catch {
      /* malformed catalogue: ignore, keep our own */
    }
  }
  return out;
}

export function buildIndex(root) {
  const lessons = extractLessons(root);
  const entries = [
    ...extractSettings(root),
    ...extractPacks(root),
    ...extractDockStyles(root),
    ...extractScenes(root),
    ...extractCommands(root),
    ...extractHotkeys(root),
    ...extractDocs(root),
    ...optionalCatalogues(root),
    ...lessons.map((l) => ({
      id: `lesson.${l.id}`,
      kind: "lesson",
      title: l.title,
      text: `${l.summary} ${l.steps.map((s) => s.title).join(". ")}`,
      path: ["Guide", "Lessons", l.title],
      target: { surface: "lesson", lesson: l.id },
      source: l.source,
    })),
  ];
  const tabs = extractTabs(root);
  return { version: INDEX_VERSION, tabs, entries, lessons };
}
