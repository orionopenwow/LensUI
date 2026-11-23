// In-page Lens marks: per-site settings, placements, the command list and the media-saving policy.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-ignore — classic script; attaches globalThis.LensMarks
await import("../../extensions/browser/src/content/marksLogic.js");
// @ts-ignore
import { FEATURE_SCRIPT_FILES } from "../../extensions/browser/build.mjs";
const M: any = (globalThis as any).LensMarks;

describe("settings and placements", () => {
  test("off by default: nothing runs anywhere", () => {
    expect(M.activeAdapters(null, "x.com")).toEqual([]);
    expect(M.scriptMatches(null).matches).toEqual([]);
  });

  test("site adapters only run on their sites; any-site adapters everywhere", () => {
    const s = { on: true, adapters: ["x", "youtube", "code"] };
    expect(M.activeAdapters(s, "x.com").map((a: any) => a.id)).toEqual(["x", "code"]);
    expect(M.activeAdapters(s, "www.youtube.com").map((a: any) => a.id)).toEqual(["youtube", "code"]);
    expect(M.activeAdapters(s, "example.org").map((a: any) => a.id)).toEqual(["code"]);
  });

  test("never-list wins", () => {
    expect(M.activeAdapters({ on: true, adapters: ["x"], never: ["x.com"] }, "x.com")).toEqual([]);
  });

  test("site-only choices ask for just those sites; any-site choices ask for all", () => {
    const only = M.scriptMatches({ on: true, adapters: ["x", "github"] }).matches;
    expect(only).toContain("https://x.com/*");
    expect(only).toContain("https://*.github.com/*");
    expect(only).not.toContain("https://*/*");
    expect(M.scriptMatches({ on: true, adapters: ["media"] }).matches).toEqual(["https://*/*", "http://*/*"]);
  });

  test("unknown adapters and actions are dropped from storage", () => {
    const s = M.sanitizeSettings({ on: 1, adapters: ["x", "nope"], last: { "x.com": "md", "y.com": "rm -rf" } });
    expect(s).toEqual({ on: true, adapters: ["x"], never: [], last: { "x.com": "md" } });
  });

  test("the onboarding set is real adapters", () => {
    const ids = M.ADAPTERS.map((a: any) => a.id);
    for (const id of M.ONBOARDING) expect(ids).toContain(id);
  });
});

describe("command list", () => {
  test("every kind has actions and every action has an icon and label", () => {
    for (const [kind, ids] of Object.entries(M.KIND_ACTIONS) as [string, string[]][]) {
      expect(ids.length).toBeGreaterThan(1);
      for (const id of ids) expect(M.ACTIONS[id], `${kind}/${id}`).toBeTruthy();
    }
  });

  test("tweets lead with save, markdown, summarise", () => {
    const rows = M.actionsFor({ kind: "post", host: "x.com" });
    expect(rows.slice(0, 3).map((r: any) => r.id)).toEqual(["shelf", "md", "summarize"]);
    expect(rows[0].key).toBe("1");
  });

  test("last-used action floats to the top for that site only", () => {
    const s = M.rememberLast(null, "x.com", "translate");
    expect(M.actionsFor({ kind: "post", host: "x.com" }, s)[0].id).toBe("translate");
    expect(M.actionsFor({ kind: "post", host: "twitter.com" }, s)[0].id).toBe("shelf");
  });

  test("no transcript rows when a video has no captions", () => {
    const ids = M.actionsFor({ kind: "yt", host: "youtube.com", hasCaptions: false }).map((r: any) => r.id);
    expect(ids).not.toContain("transcript");
    expect(ids).toContain("summarize");
  });

  test("typing filters, and the list never shows more than 6", () => {
    const rows = M.actionsFor({ kind: "yt", host: "youtube.com" });
    expect(M.filterRows(rows, "").length).toBe(6);
    expect(M.filterRows(rows, "copy").map((r: any) => r.id)).toEqual(["clip", "frame", "transcriptCopy"]);
    expect(M.filterRows(rows, "zzz")).toEqual([]);
  });
});

describe("media policy", () => {
  test("plain file URLs can be saved", () => {
    expect(M.mediaSaveAllowed({ src: "https://cdn.example.com/clip.mp4", host: "example.com" })).toBe(true);
  });
  test("never streams, encrypted media or YouTube and other streaming services", () => {
    expect(M.mediaSaveAllowed({ src: "blob:https://x.com/abc", host: "x.com" })).toBe(false);
    expect(M.mediaSaveAllowed({ src: "https://cdn.example.com/a.mp4", host: "example.com", encrypted: true })).toBe(false);
    expect(M.mediaSaveAllowed({ src: "https://rr1.googlevideo.com/videoplayback", host: "www.youtube.com" })).toBe(false);
    expect(M.mediaSaveAllowed({ src: "https://x.netflix.com/v.mp4", host: "netflix.com" })).toBe(false);
  });
  test("save rows drop out where saving isn't allowed", () => {
    const ids = M.actionsFor({ kind: "media", host: "x.com", canSave: false }).map((r: any) => r.id);
    expect(ids).not.toContain("saveFile");
  });
  test("YouTube offers YouTube's own offline option, not a download", () => {
    expect(M.KIND_ACTIONS.yt).toContain("offline");
    expect(M.KIND_ACTIONS.yt).not.toContain("saveFile");
  });
});

describe("helpers", () => {
  test("file kinds", () => {
    expect(M.fileKind("https://a.com/m/robot.GLB")).toBe("model");
    expect(M.fileKind("/dl/setup.msi?x=1")).toBe("file");
    expect(M.fileKind("https://a.com/page.html")).toBe(null);
  });
  test("markdown quote and timestamp link", () => {
    expect(M.toMarkdown({ author: "Ada", handle: "ada", text: "hi\nthere", url: "https://x.com/ada/status/1" }))
      .toBe("> hi\n> there\n>\n> — Ada (@ada)\n\nhttps://x.com/ada/status/1");
    expect(M.timeLink("https://www.youtube.com/watch?v=abc123&list=x", 75.9)).toBe("https://youtu.be/abc123?t=75");
  });
  test("mark stays inside the viewport; list flips above near the bottom", () => {
    const vp = { width: 800, height: 600 };
    expect(M.markPosition({ left: 700, top: 590, width: 300, height: 40 }, vp, 18, 6)).toEqual({ left: 780, top: 580 });
    expect(M.menuPosition({ left: 400, top: 560, size: 18 }, vp, 248, 268).top).toBeLessThan(560);
  });
});

describe("packaging and safety", () => {
  test("both scripts ship with the extension", () => {
    expect(FEATURE_SCRIPT_FILES).toContain("src/content/marksLogic.js");
    expect(FEATURE_SCRIPT_FILES).toContain("src/content/marks.js");
  });
  const src = readFileSync(join(import.meta.dir, "../../extensions/browser/src/content/marks.js"), "utf8");
  test("no network calls, closed shadow root, no password fields", () => {
    expect(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(src)).toBe(false);
    expect(src).toContain('attachShadow({ mode: "closed" })');
    expect(/input\[type=password\]|\.value\s*=/.test(src.replace(/q\.value/g, ""))).toBe(false);
  });
  test("the mark is a real button with a name", () => {
    expect(src).toContain('setAttribute("aria-label", "Lens actions")');
    expect(src).toContain('markBtn.type = "button"');
  });
});
