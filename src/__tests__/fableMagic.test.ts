// Fable pass, Magic family (26 Nov 2026): Snip live text, the studio's key routing and editing
// preview, the snip library's ordering and Undo, the Shelf's Undo, the keyboard path into Lens
// menus, and the voice conversation's listener and clock. Bugs B-116 to B-120.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { editingDoc, empty, hiddenBy, redactedLines, reduce, TOOL_KEYS, type Shape } from "../snip/annotations";
import { latestOnly, NO_PENDING, queueDelete, removedLine as snipRemovedLine, undoDeletes, withoutPending } from "../snip/historyModel";
import { routeKey } from "../snip/keys";
import {
  allSel, clampSel, findEntities, isSelected, lineSel, moveSel, nearestWord, ordered, selectedCount, selectionRects, selectionText, shortValue,
  visibleLines, wordAt, wordCount, wordSel, wordsLabel, type Line,
} from "../snip/liveText";
import { pillPlace } from "../snip/LiveTextLayer";
import { trimRange } from "../snip/Record";
import { contextOrigin } from "../magic/LensContextMenu";
import { removedLine, restoreInput } from "../shelf/restore";
import type { ShelfItem } from "../shelf/contract";
import { shouldTick } from "../voice/useConversation";

/** Lays words out left to right, 10 px per character, 20 px line height. */
function page(rows: string[], x0 = 10, y0 = 10): Line[] {
  return rows.map((row, li) => {
    let x = x0;
    return {
      words: row.split(" ").filter(Boolean).map((text) => {
        const rect = { x, y: y0 + li * 30, w: text.length * 10, h: 20 };
        x += rect.w + 10;
        return { text, rect };
      }),
    };
  });
}

const LINES = page(["Account settings", "Owner: jane.doe@example.com", "Call +1 (555) 010-2000 today", "Docs at admin.example.com/settings/api.", "Your verification code is 482913"]);

describe("B-116: text that was cropped away does not follow the snip", () => {
  test("words outside the crop are dropped, and empty lines with them", () => {
    // Keep only the first line (y 10..30).
    const kept = visibleLines(LINES, { x: 0, y: 0, w: 400, h: 35 });
    expect(kept.map((l) => l.words.map((w) => w.text).join(" "))).toEqual(["Account settings"]);
    expect(redactedLines(kept, { shapes: [], crop: null }).join("\n")).not.toContain("jane.doe");
  });

  test("a crop through the middle of a line keeps only the words whose centre is inside", () => {
    const kept = visibleLines(LINES, { x: 0, y: 35, w: 75, h: 30 });
    expect(kept).toHaveLength(1);
    expect(kept[0].words.map((w) => w.text)).toEqual(["Owner:"]);
  });

  test("the freeform outline counts too", () => {
    const tri = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 36 }];
    const kept = visibleLines(LINES, null, tri);
    expect(kept.map((l) => l.words.map((w) => w.text).join(" "))).toEqual(["Account"]);
  });

  test("no crop and no outline: everything stays, in order", () => {
    expect(wordCount(visibleLines(LINES, null, null))).toBe(wordCount(LINES));
  });

  test("the studio builds every text it copies or sends from the visible lines", () => {
    const src = readFileSync(join(import.meta.dir, "../snip/Studio.tsx"), "utf8");
    expect(src).toContain("redactedLines(shown, hist.doc)");
    expect(src).not.toMatch(/redactedLines\(analysis\?\.ocr/);
  });
});

describe("B-117: the crop is an outline while editing, applied on export", () => {
  test("the editing preview keeps the whole frame and every mark", () => {
    const box: Shape = { id: "a", kind: "box", rect: { x: 1, y: 2, w: 30, h: 40 }, color: "#fff", width: 2 };
    let h = reduce(empty(), { type: "add", shape: box });
    h = reduce(h, { type: "crop", rect: { x: 10, y: 10, w: 100, h: 80 } });
    const e = editingDoc(h.doc);
    expect(e.crop).toBeNull();
    expect(e.shapes).toEqual(h.doc.shapes);
    // The real document still has its crop for the export.
    expect(h.doc.crop).toEqual({ x: 10, y: 10, w: 100, h: 80 });
    // No crop: the same object comes back (no extra render).
    const plain = empty().doc;
    expect(editingDoc(plain)).toBe(plain);
  });

  test("the studio previews with editingDoc while it is editable", () => {
    const src = readFileSync(join(import.meta.dir, "../snip/Studio.tsx"), "utf8");
    expect(src).toContain("renderDoc(img, editingDoc(doc)");
    expect(src).toContain("snip-crop-dim");
  });
});

describe("B-118: a focused control keeps its own keys", () => {
  test("Enter and Space on a button press only that button", () => {
    expect(routeKey({ tag: "BUTTON" }, "Enter")).toBe("native");
    expect(routeKey({ tag: "BUTTON" }, " ")).toBe("native");
    expect(routeKey({ tag: "BUTTON" }, "3")).toBe("studio");
    expect(routeKey({ tag: "BUTTON" }, "ArrowRight")).toBe("studio");
  });
  test("text fields and drop-downs keep everything they type with", () => {
    expect(routeKey({ tag: "INPUT", type: "text" }, "1")).toBe("native");
    expect(routeKey({ tag: "TEXTAREA" }, "Enter")).toBe("native");
    expect(routeKey({ tag: "SELECT" }, "8")).toBe("native");
    expect(routeKey({ tag: "SELECT" }, "s", { ctrl: true })).toBe("studio");
    expect(routeKey({ tag: "DIV", editable: true }, "a")).toBe("native");
  });
  test("a checkbox keeps Space; shortcuts still work from it", () => {
    expect(routeKey({ tag: "INPUT", type: "checkbox" }, " ")).toBe("native");
    expect(routeKey({ tag: "INPUT", type: "checkbox" }, "1")).toBe("studio");
    expect(routeKey({ tag: "INPUT", type: "range" }, "ArrowLeft")).toBe("native");
  });
  test("nothing focused: the studio gets the key", () => {
    expect(routeKey(null, "Enter")).toBe("studio");
    expect(routeKey({ tag: "BODY" }, "Enter")).toBe("studio");
  });
});

describe("B-119: the snip library shows the newest search only", () => {
  test("an older answer that arrives late is ignored", () => {
    const t = latestOnly();
    const a = t.next();
    const b = t.next();
    expect(t.isCurrent(a)).toBe(false);
    expect(t.isCurrent(b)).toBe(true);
  });
  test("removing waits for Undo", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    let p = queueDelete(NO_PENDING, "b");
    p = queueDelete(p, "b");
    expect(p.ids).toEqual(["b"]);
    expect(withoutPending(items, p).map((i) => i.id)).toEqual(["a", "c"]);
    p = queueDelete(p, "c");
    expect(snipRemovedLine(p.ids.length)).toBe("Removed 2 snips from history.");
    expect(snipRemovedLine(1)).toBe("Removed from history.");
    expect(withoutPending(items, undoDeletes(p))).toHaveLength(3);
  });
});

describe("B-120: voice conversation", () => {
  const src = readFileSync(join(import.meta.dir, "../voice/useConversation.ts"), "utf8");
  test("speaking adds no listener of its own", () => {
    const speak = src.slice(src.indexOf("const speak = useCallback"), src.indexOf("const ask = useCallback"));
    expect(speak).not.toContain("listen<");
    expect(speak).not.toContain("await listen");
  });
  test("the clock only runs while a conversation is open", () => {
    expect(shouldTick(false)).toBe(false);
    expect(shouldTick(true)).toBe(true);
    expect(src).toContain("if (!shouldTick(state.open)) return;");
    expect(src.match(/setInterval\(/g)?.length).toBe(1);
  });
});

describe("live text: selecting", () => {
  test("hit testing, with slack", () => {
    expect(wordAt(LINES, { x: 15, y: 15 })).toEqual({ line: 0, word: 0 });
    expect(wordAt(LINES, { x: 82, y: 31 })).toEqual({ line: 0, word: 0 });
    expect(wordAt(LINES, { x: 400, y: 300 })).toBeNull();
  });
  test("a drag in the margin lands on the nearest word of the nearest line", () => {
    expect(nearestWord(LINES, { x: 900, y: 48 })).toEqual({ line: 1, word: 1 });
    expect(nearestWord(LINES, { x: -50, y: 500 })).toEqual({ line: 4, word: 0 });
    expect(nearestWord([], { x: 0, y: 0 })).toBeNull();
  });
  test("selection runs in reading order whichever way it was dragged", () => {
    const back = { anchor: { line: 2, word: 1 }, focus: { line: 1, word: 1 } };
    expect(ordered(back)[0]).toEqual({ line: 1, word: 1 });
    expect(selectionText(LINES, back)).toBe("jane.doe@example.com\nCall +1");
    expect(selectedCount(LINES, back)).toBe(3);
    expect(isSelected(back, { line: 2, word: 0 })).toBe(true);
    expect(isSelected(back, { line: 2, word: 2 })).toBe(false);
    expect(isSelected(null, { line: 0, word: 0 })).toBe(false);
  });
  test("one box per line for highlight and hide", () => {
    const sel = { anchor: { line: 0, word: 1 }, focus: { line: 1, word: 0 } };
    const rects = selectionRects(LINES, sel, 2);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual({ x: 88, y: 8, w: 84, h: 24 });
    expect(rects[1]).toEqual({ x: 8, y: 38, w: 64, h: 24 });
  });
  test("line, all, and a selection that no longer fits", () => {
    expect(selectionText(LINES, lineSel(LINES, 0))).toBe("Account settings");
    expect(selectedCount(LINES, allSel(LINES))).toBe(wordCount(LINES));
    expect(allSel([])).toBeNull();
    expect(clampSel(LINES.slice(0, 1), wordSel({ line: 3, word: 0 }))).toBeNull();
    expect(lineSel(LINES, 99)).toBeNull();
  });
  test("hidden words copy as dots, runs collapsed", () => {
    const h = reduce(empty(), { type: "redact", rects: [{ rect: LINES[1].words[1].rect }] });
    const hidden = hiddenBy(h.doc);
    expect(selectionText(LINES, lineSel(LINES, 1), hidden)).toBe("Owner: •••");
  });
  test("highlighting a selection is one undo step", () => {
    const sel = { anchor: { line: 0, word: 0 }, focus: { line: 2, word: 0 } };
    const shapes: Shape[] = selectionRects(LINES, sel).map((rect, i) => ({ id: `h${i}`, kind: "highlight", rect, color: "#facc15" }));
    let h = reduce(empty(), { type: "addMany", shapes });
    expect(h.doc.shapes).toHaveLength(3);
    h = reduce(h, { type: "undo" });
    expect(h.doc.shapes).toHaveLength(0);
    expect(reduce(empty(), { type: "addMany", shapes: [] })).toEqual(empty());
  });
  test("L picks the tool", () => {
    expect(TOOL_KEYS.l).toBe("livetext");
  });
});

describe("live text: keyboard", () => {
  test("the first key selects the first word; End the last", () => {
    expect(moveSel(LINES, null, "ArrowRight", false)).toEqual(wordSel({ line: 0, word: 0 }));
    expect(moveSel(LINES, null, "End", false)).toEqual(wordSel({ line: 4, word: 4 }));
    expect(moveSel([], null, "ArrowRight", false)).toBeNull();
  });
  test("left and right walk words across lines and stop at the ends", () => {
    const end0 = wordSel({ line: 0, word: 1 });
    expect(moveSel(LINES, end0, "ArrowRight", false)).toEqual(wordSel({ line: 1, word: 0 }));
    expect(moveSel(LINES, wordSel({ line: 1, word: 0 }), "ArrowLeft", false)).toEqual(end0);
    const first = wordSel({ line: 0, word: 0 });
    expect(moveSel(LINES, first, "ArrowLeft", false)).toEqual(first);
    const last = wordSel({ line: 4, word: 4 });
    expect(moveSel(LINES, last, "ArrowRight", false)).toEqual(last);
  });
  test("up and down keep the column", () => {
    const from = wordSel({ line: 2, word: 3 }); // "010-2000", x ≈ 190
    const up = moveSel(LINES, from, "ArrowUp", false)!;
    expect(up.focus).toEqual({ line: 1, word: 1 });
    expect(moveSel(LINES, wordSel({ line: 0, word: 0 }), "ArrowUp", false)).toEqual(wordSel({ line: 0, word: 0 }));
  });
  test("Shift extends from the anchor; Home and End go to the line's ends", () => {
    const s = moveSel(LINES, wordSel({ line: 2, word: 1 }), "End", true)!;
    expect(s).toEqual({ anchor: { line: 2, word: 1 }, focus: { line: 2, word: 4 } });
    expect(selectionText(LINES, s)).toBe("+1 (555) 010-2000 today");
    expect(moveSel(LINES, s, "Home", false)).toEqual(wordSel({ line: 2, word: 0 }));
  });
});

describe("live text: things worth copying", () => {
  const found = findEntities(LINES);
  test("email, phone, link and code, each once, in reading order", () => {
    expect(found.map((e) => `${e.kind}:${e.value}`)).toEqual([
      "email:jane.doe@example.com",
      "phone:+1 (555) 010-2000",
      "link:admin.example.com/settings/api",
      "code:482913",
    ]);
  });
  test("each one knows its words", () => {
    const phone = found.find((e) => e.kind === "phone")!;
    expect(selectionText(LINES, phone.sel)).toBe("+1 (555) 010-2000");
    const link = found.find((e) => e.kind === "link")!;
    expect(selectionText(LINES, link.sel)).toBe("admin.example.com/settings/api.");
  });
  test("not a phone: dates, IP addresses, plain ids, decimals, card-length runs", () => {
    const none = page(["2026-11-26 10.0.0.12 12345678 3.14159265 4111 1111 1111 1111 9999"]);
    expect(findEntities(none).filter((e) => e.kind === "phone")).toEqual([]);
  });
  test("a number is a code only when the line says so", () => {
    expect(findEntities(page(["Order 482913 shipped"])).length).toBe(0);
    expect(findEntities(page(["OTP: 4829"])).map((e) => e.value)).toEqual(["4829"]);
  });
  test("an email is not also a link; repeats are listed once; https links keep their scheme", () => {
    const l = page(["mail me@site.org or me@site.org", "see https://lens.example.dev/a?b=1, and www.example.com"]);
    expect(findEntities(l).map((e) => `${e.kind}:${e.value}`)).toEqual(["email:me@site.org", "link:https://lens.example.dev/a?b=1", "link:www.example.com"]);
  });
  test("hidden words never produce one", () => {
    const h = reduce(empty(), { type: "redact", rects: [{ rect: LINES[1].words[1].rect }, { rect: LINES[4].words[4].rect }] });
    const kinds = findEntities(LINES, hiddenBy(h.doc)).map((e) => e.kind);
    expect(kinds).toEqual(["phone", "link"]);
  });
  test("labels", () => {
    expect(wordsLabel(1)).toBe("1 word");
    expect(wordsLabel(12)).toBe("12 words");
    expect(shortValue("short")).toBe("short");
    const s = shortValue("https://example.com/a/very/long/path/that/keeps/going/on.html");
    expect(s.length).toBe(30);
    expect(s).toContain("…");
  });
});

describe("live text: the selection bar stays on the image", () => {
  const stage = { w: 600, h: 400 };
  test("above the first line when there is room", () => {
    const p = pillPlace([{ x: 200, y: 200, w: 100, h: 20 }], 1, stage);
    expect(p.below).toBe(false);
    expect(p.top).toBe(200 - 36 - 8);
    expect(p.left).toBe(250 - 134);
  });
  test("below the last line at the top edge; clamped at the sides", () => {
    const p = pillPlace([{ x: 0, y: 4, w: 40, h: 20 }, { x: 560, y: 34, w: 40, h: 20 }], 1, stage);
    expect(p.below).toBe(true);
    expect(p.top).toBe(34 + 20 + 8);
    expect(p.left).toBe(600 - 268 - 4);
  });
});

describe("recording trim", () => {
  test("inside the recording, start before end", () => {
    expect(trimRange("1", "4", 10_000)).toEqual({ start: 1, end: 4 });
    expect(trimRange("", "", 10_000)).toEqual({ start: 0, end: 10 });
    expect(trimRange("2", "99", 10_000)).toEqual({ start: 2, end: 10 });
    expect(trimRange("5", "3", 10_000)).toBeNull();
    expect(trimRange("abc", "-2", 10_000)).toBeNull();
  });
});

describe("Lens menus from the keyboard", () => {
  const rect = { left: 100, top: 200, bottom: 232, width: 240 };
  test("a right-click opens at the pointer", () => {
    expect(contextOrigin({ button: 2, clientX: 310, clientY: 215 }, rect)).toEqual({ at: { x: 310, y: 215 }, byKeyboard: false });
  });
  test("the Menu key and Shift+F10 open on the item, marked as keyboard", () => {
    expect(contextOrigin({ button: 0, clientX: 0, clientY: 0 }, rect)).toEqual({ at: { x: 128, y: 228 }, byKeyboard: true });
  });
  test("the menu focuses Lens › for the keyboard and gives focus back when it closes", () => {
    const src = readFileSync(join(import.meta.dir, "../magic/LensContextMenu.tsx"), "utf8");
    expect(src).toContain('".lens-pan-row"');
    expect(src).toContain("focusVisible: byKeyboard");
    expect(src).toContain("before.focus(");
  });
});

describe("Shelf: Undo for a removed item", () => {
  const item: ShelfItem = {
    id: "x1", shelf: "work", kind: "page", title: "Quarterly notes", text: "Q3 was fine", html: null, url: "https://example.com/q3", path: null,
    source_app: "Lens Browser", tags: ["q3"], pinned: true, local_only: true, created_ms: 1, updated_ms: 2, order: 3, chars: 11, approx_tokens: 3,
  };
  test("the same content goes back, without empty fields", () => {
    expect(restoreInput(item)).toEqual({ kind: "page", title: "Quarterly notes", text: "Q3 was fine", url: "https://example.com/q3", source_app: "Lens Browser", tags: ["q3"], local_only: true });
  });
  test("the line names it", () => {
    expect(removedLine("Quarterly notes")).toBe("Removed “Quarterly notes”.");
    expect(removedLine("x".repeat(80)).length).toBeLessThan(52);
    expect(removedLine("  ")).toBe("Removed “the item”.");
  });
});

describe("B-18 share: no swallowed errors in the Magic family's own files", () => {
  const root = join(import.meta.dir, "..");
  const files = [
    ...["snip", "voice", "shelf", "magic/start"].flatMap((d) => readdirSync(join(root, d)).filter((f) => /\.tsx?$/.test(f)).map((f) => join(d, f))),
    "command/ShelfDrawer.tsx", "command/ClipList.tsx", "command/settings.ts", "command/ai.ts", "command/mini/EdgeShelfSurface.tsx",
    "magic/LensPan.tsx", "magic/LensContextMenu.tsx",
  ];
  test("user actions report; background calls say `quiet`", () => {
    const bad = files.filter((f) => /\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(readFileSync(join(root, f), "utf8")));
    expect(bad).toEqual([]);
  });
});
