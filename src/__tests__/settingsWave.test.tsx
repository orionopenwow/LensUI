// Settings bug-fix and polish wave: B-41 (corner picker), B-40 (switches that vanished after a
// click), B-18 Settings half (no silent failures), the Top Bar pointer halo switch, and sentence
// case in Settings and on the Top Bar. Pop-out close delay: dockAdvanced.test.ts; contrast:
// themeContrast.test.ts.
import { beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HotCornersCard } from "../components/HotCornersCard";
import { AnimatedBackdropSwitch, adoptWallpaperState } from "../playground/ambient/controls";
import { adoptReply } from "../settings/useResource";
import { haloAllowed } from "../topbar/clickThrough";
import { failText, isReported, markReported, oops, quiet } from "../ui/oops";
import { settingName } from "../ui/Toggle";
import { toastBus } from "../ui/toastBus";
import { sampleConfig } from "./fixtures";

const root = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const filesIn = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesIn(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []
  );
/** The body of one CSS rule (`.sel { … }`). */
const cssRule = (css: string, sel: string) => {
  const i = css.indexOf(`${sel} {`);
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
};

describe("B-41: the corner picker can be clicked", () => {
  const offConfig = () => {
    const c = sampleConfig() as ReturnType<typeof sampleConfig> & { hotCorners?: Record<string, unknown> };
    return { ...c, hotCorners: { ...(c.hotCorners ?? {}), enabled: false } };
  };

  test("with Hot corners off, the radios are dimmed but not click-dead", () => {
    const html = renderToStaticMarkup(<HotCornersCard config={offConfig() as never} onUpdateConfig={() => {}} />);
    expect(html).toContain('role="radiogroup" aria-label="Corner to edit"');
    expect(html.match(/role="radio"/g)?.length).toBe(4);
    // Root cause: the picker sat inside `.pi-off`, which has pointer-events: none, while its radios
    // stayed focusable, announced and enabled. Nothing in this card may use it any more.
    expect(html).not.toContain("pi-off");
    expect(html).toContain("pi-dim");
    const css = read("src/components/ProductivityCards.css");
    expect(cssRule(css, ".pi-dim")).not.toContain("pointer-events");
    expect(cssRule(css, ".hc-corner")).not.toContain("pointer-events: none");
  });

  test("only Try it needs Hot corners on", () => {
    const html = renderToStaticMarkup(<HotCornersCard config={offConfig() as never} onUpdateConfig={() => {}} />);
    const tryIt = html.match(/<button[^>]*>Try it<\/button>/)?.[0] ?? "";
    expect(tryIt).toContain("disabled");
    // Action chips stay usable, so corners can be set up before turning the feature on.
    expect(html).toMatch(/class="cc-chip[^"]*"[^>]*>Overview</);
    expect(html).not.toMatch(/class="cc-chip[^"]*"[^>]*disabled/);
  });
});

describe("B-40: switches stay mounted when a reply isn't a state", () => {
  test("adoptReply keeps what is shown for an empty or wrong-shaped reply", () => {
    const list = [{ name: "Discord", enabled: true }];
    expect(adoptReply(list, null)).toBe(list);
    expect(adoptReply(list, undefined)).toBe(list);
    expect(adoptReply(list, { ok: true })).toBe(list);
    const next = [{ name: "Discord", enabled: false }];
    expect(adoptReply(list, next)).toBe(next);
    const state = { animations: true };
    expect(adoptReply(state, [])).toBe(state);
    expect(adoptReply(state, "done")).toBe(state);
    expect(adoptReply<typeof state>(null, { animations: false })).toEqual({ animations: false });
  });

  test("the wallpaper backdrop keeps its state when saving answers with nothing", () => {
    const cur = { settings: { enabled: true }, path: null } as never;
    expect(adoptWallpaperState(cur, null)).toBe(cur);
    expect(adoptWallpaperState(cur, {})).toBe(cur);
    const next = { settings: { enabled: false }, path: null };
    expect(adoptWallpaperState(cur, next)).toBe(next as never);
  });

  test("the Animated backdrop switch is on the page before its state arrives (disabled), never popped in", () => {
    const html = renderToStaticMarkup(<AnimatedBackdropSwitch />);
    expect(html).toMatch(/<input[^>]*role="switch"[^>]*aria-label="Animated backdrop"[^>]*disabled/);
  });

  test("pages adopt backend replies instead of replacing their state with them", () => {
    for (const f of filesIn("src/settings")) {
      expect({ f, hits: read(f).match(/\.then\(\w+\.set\)/g) ?? [] }).toEqual({ f, hits: [] });
    }
    expect(read("src/settings/pages/AppsPage.tsx")).toContain(".then(startup.adopt)");
    expect(read("src/settings/pages/AccessibilityPage.tsx")).toContain(".then(acc.adopt)");
  });

  test("the two switches for the backdrop have different names", () => {
    const src = read("src/playground/ambient/controls.tsx");
    expect(src.match(/aria-label="Animated backdrop"/g)?.length).toBe(1);
    expect(src.match(/aria-label="Animated wallpaper"/g)?.length).toBe(1);
    expect(src).not.toMatch(/if \(!a\.ready\) return null;\s*return \(\s*<>\s*<label className="amb-switch-row"/);
  });

  test("hyper no longer lists B-40 or B-41 as known failures", () => {
    const known = JSON.parse(read("tools/hyper/known.json")) as { key: string }[];
    expect(known.filter((k) => /Animated backdrop|Corner to edit|Start Discord|Animation effects/.test(k.key))).toEqual([]);
  });
});

describe("B-18 (Settings half): no silent failures", () => {
  beforeEach(() => toastBus.clear());

  const scope = [...filesIn("src/settings"), ...filesIn("src/themeux"), "src/surfaces/ControlCenterSurface.tsx"];

  test("no empty catch is left in Settings", () => {
    for (const f of scope) {
      const text = read(f);
      const silent = [
        ...(text.match(/\.catch\(\(\) => (\{\s*\}|undefined|null|void 0)\)/g) ?? []),
        ...(text.match(/catch \{\s*\}/g) ?? []),
        ...(text.match(/catch \(\w*\) \{\s*\}/g) ?? []),
      ];
      expect({ f, silent }).toEqual({ f, silent: [] });
    }
  });

  test("quiet is for background work only, never a click", () => {
    for (const f of scope) expect({ f, hits: read(f).match(/onClick=\{[^\n]*\.catch\(quiet\)/g) ?? [] }).toEqual({ f, hits: [] });
  });

  test("a refused save says so once, and the Toggle default says so when nobody else did", () => {
    const shell = read("src/surfaces/ControlCenterSurface.tsx");
    expect(shell).toContain('oops("save that change")(e);');
    expect(shell).toContain("throw markReported(e);");
    expect(read("src/ui/Toggle.tsx")).toContain("(onError ?? oops(`change ${settingName(name.label)}`))(e)");

    oops("change animated backdrop")("Windows said no");
    expect(toastBus.items.at(-1)).toMatchObject({ kind: "error", text: "Couldn't change animated backdrop. Windows said no." });
    const n = toastBus.items.length;
    const shown = markReported("Windows said no");
    expect(isReported(shown)).toBe(true);
    expect(String(shown)).toBe("Windows said no");
    oops("change that setting")(shown);
    expect(toastBus.items.length).toBe(n);
    quiet();
    expect(toastBus.items.length).toBe(n);
    expect(failText("open the Cleaner", "C:\\Users\\me\\x")).toBe("Couldn't open the Cleaner.");
  });

  test("setting names read naturally in a sentence", () => {
    expect(settingName("Animated backdrop")).toBe("animated backdrop");
    expect(settingName("Wi-Fi")).toBe("Wi-Fi");
    expect(settingName("HDR")).toBe("HDR");
    expect(settingName(undefined)).toBe("that setting");
  });

  test("the browser keeps using the one implementation", () => {
    expect(read("src/browser/oops.ts")).toContain('from "../ui/oops"');
  });
});

describe("Top Bar pointer halo", () => {
  test("drawn only when the switch is on and Windows' transparency effects are on", () => {
    expect(haloAllowed(undefined, undefined)).toBe(true);
    expect(haloAllowed({}, { transparencyEnabled: true })).toBe(true);
    expect(haloAllowed({ pointerHalo: false }, { transparencyEnabled: true })).toBe(false);
    expect(haloAllowed({ pointerHalo: true }, { transparencyEnabled: false })).toBe(false);
  });

  test("Settings has the switch, the bar and Lens Core both apply the rule", () => {
    const shell = read("src/surfaces/ControlCenterSurface.tsx");
    expect(shell).toContain('aria-label="Pointer halo"');
    expect(shell).toContain("Hidden while Windows' transparency effects are off.");
    const bar = read("src/surfaces/TopBarSurface.tsx");
    expect(bar).toContain("haloAllowed(config?.topBar, winTheme)");
    expect(bar).toContain("const on = halo.on && haloOk;");
    const watcher = read("src-tauri/src/app/watcher.rs");
    expect(watcher).toContain("cfg.top_bar.pointer_halo");
    expect(watcher).toContain("last_theme.transparency_enabled");
    // Windows' setting is read where Lens already reads the theme (every ~2 s, emitted on change).
    expect(read("src-tauri/src/win_theme.rs")).toContain('read_hkcu_dword(pers, "EnableTransparency")');
    expect(read("src-tauri/src/config.rs")).toContain("pointer_halo: true,");
  });
});

describe("sentence case", () => {
  test("the Top Bar's own labels", () => {
    const bar = read("src/surfaces/TopBarSurface.tsx");
    const labels = [...bar.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    const PROPER = new Set(["Lens", "Launcher", "Wi-Fi"]);
    for (const l of labels) {
      const title = l.split(/\s+/).slice(1).filter((w) => /^[A-Z][a-z]/.test(w) && !PROPER.has(w));
      expect({ l, title }).toEqual({ l, title: [] });
    }
    for (const l of ["Previous desktop", "Next desktop", "New desktop", "Previous track", "Next track", "Wi-Fi and network", "Volume and audio mixer", "Quick settings"]) {
      expect(labels).toContain(l);
    }
  });

  test("Settings labels that used to be Title Case", () => {
    const gone: [string, string][] = [
      ["src/surfaces/ControlCenterSurface.tsx", "Desktop Sessions Switching"],
      ["src/surfaces/ControlCenterSurface.tsx", "Replace ALL Windows Explorer Default Folders"],
      ["src/surfaces/ControlCenterSurface.tsx", "Clipboard History"],
      ["src/surfaces/ControlCenterSurface.tsx", "Keyboard Tiling Shortcuts"],
      ["src/surfaces/ControlCenterSurface.tsx", "Global Shortcuts"],
      ["src/components/HotCornersCard.tsx", "Hot Corners"],
      ["src/components/HotCornersCard.tsx", "Rest Time"],
      ["src/components/TilingCard.tsx", "Automatic Tiling"],
      ["src/components/MagicCard.tsx", "Leave These Apps Alone"],
      ["src/components/BackupRestoreCard.tsx", "Remove All Lens Changes"],
    ];
    for (const [f, s] of gone) expect({ f, has: read(f).includes(s) }).toEqual({ f, has: false });
  });
});
