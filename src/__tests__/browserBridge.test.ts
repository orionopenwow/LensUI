// The browser extension's pure parts: request building, menus, readable extraction, packaging.
import { describe, expect, test } from "bun:test";
// @ts-ignore — plain JS modules shipped inside the extension
import * as proto from "../../extensions/browser/src/protocol.js";
// @ts-ignore
import { menuItems, findItem, toCreateProps } from "../../extensions/browser/src/menus.js";
// @ts-ignore
import { readablePage } from "../../extensions/browser/src/readable.js";
// @ts-ignore
import { buildManifest, checkManifest, crc32, zip, TARGETS } from "../../extensions/browser/build.mjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ---- a tiny fake DOM ------------------------------------------------------------------------
type FakeNode = {
  nodeType: number; tagName?: string; nodeValue?: string; childNodes: FakeNode[];
  attrs?: Record<string, string>; getAttribute?: (a: string) => string | null;
};
const t = (text: string): FakeNode => ({ nodeType: 3, nodeValue: text, childNodes: [] });
const h = (tag: string, attrs: Record<string, string> | null, ...kids: (FakeNode | string)[]): FakeNode => {
  const a = attrs ?? {};
  return {
    nodeType: 1, tagName: tag.toUpperCase(), attrs: a, getAttribute: (k) => (k in a ? a[k] : null),
    childNodes: kids.map((k) => (typeof k === "string" ? t(k) : k)),
  };
};
const doc = (body: FakeNode, title = "Doc", href = "https://example.com/post/1") => ({ body, title, location: { href } });
const LONG = "This paragraph is long enough to count as real article content for scoring. ".repeat(3);

describe("protocol", () => {
  test("action list matches the Rust side", () => {
    const rust = readFileSync(join(import.meta.dir, "../../src-tauri/src/bridge/protocol.rs"), "utf8");
    const block = rust.slice(rust.indexOf("pub const ACTIONS"), rust.indexOf("];", rust.indexOf("pub const ACTIONS")));
    const names = [...block.matchAll(/\("([a-z_]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(proto.ACTIONS);
    expect(rust).toContain(`MAX_PAGE_TEXT_BYTES: usize = 200 * 1024`);
    expect(proto.MAX_PAGE_TEXT_BYTES).toBe(200 * 1024);
  });

  test("builds requests with caps and drops unsafe fields", () => {
    const big = "é".repeat(150_000); // 300 KB of UTF-8
    const r = proto.buildRequest("summarize", { pageText: big, url: "https://x.com/a", title: "T", path: "C:\\x" }, { variant: "tldr" });
    expect(proto.byteLength(r.pageText)).toBeLessThanOrEqual(proto.MAX_PAGE_TEXT_BYTES);
    expect(r.pageText.endsWith("(truncated by Lens)")).toBe(true);
    expect(r.title).toContain("trimmed");
    expect((r as any).path).toBeUndefined();
    expect(r.v).toBe(1);
    const bad = proto.buildRequest("ask", { url: "javascript:alert(1)", imageUrl: "data:image/png;base64,AA", linkUrl: "https://u:p@x.com" });
    expect(bad.url).toBeUndefined();
    expect(bad.imageUrl).toBeUndefined();
    expect(bad.linkUrl).toBeUndefined();
    expect(() => proto.buildRequest("rm_rf", {})).toThrow();
    expect(() => proto.buildRequest("summarize", {}, { variant: "poem" })).toThrow();
    const sel = proto.buildRequest("explain", { selection: "a\u0000b\u0007c" });
    expect(sel.selection).toBe("abc");
  });

  test("truncateBytes never splits characters", () => {
    const s = "😀".repeat(100);
    const { text, truncated } = proto.truncateBytes(s, 50, "");
    expect(truncated).toBe(true);
    expect(proto.byteLength(text)).toBeLessThanOrEqual(50);
    expect(text).toBe("😀".repeat(12));
  });

  test("shelf items never carry paths and keep known kinds", () => {
    const it = proto.sanitizeItem({ kind: "weird", text: "x", path: "C:\\secret", url: "file:///c:/x", tags: ["a", "", "b"] });
    expect(it.kind).toBe("text");
    expect((it as any).path).toBeUndefined();
    expect(it.url).toBeUndefined();
    expect(it.tags).toEqual(["a", "b"]);
  });

  test("video detection and markdown source line", () => {
    expect(proto.mediaUrlFor({ srcUrl: "blob:https://x" }, "https://www.youtube.com/watch?v=1")).toBe("https://www.youtube.com/watch?v=1");
    expect(proto.mediaUrlFor({ srcUrl: "https://cdn.x.com/v.mp4" }, "https://a.com")).toBe("https://cdn.x.com/v.mp4");
    expect(proto.mediaUrlFor({}, "https://news.example.com/a")).toBeUndefined();
    expect(proto.markdownWithSource("Hi", "A [b]", "https://x.com")).toBe("Hi\n\n— Source: [A b](https://x.com)");
  });
});

describe("menus", () => {
  test("one Lens parent, unique ids, every leaf maps to a protocol action", () => {
    const items = menuItems();
    const ids = items.map((i: any) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(items.filter((i: any) => !i.parentId).map((i: any) => i.id)).toEqual(["lens"]);
    for (const i of items) {
      if (i.parentId) expect(ids).toContain(i.parentId);
      if (i.action) expect(proto.ACTIONS).toContain(i.action);
      if (i.variant) expect(proto.VARIANTS[i.action]).toContain(i.variant);
      if (i.kind === "ai") expect(proto.AI_ACTIONS.has(i.action)).toBe(true);
    }
    expect(findItem("translate:Spanish").targetLang).toBe("Spanish");
    expect(findItem("ask").local).toBe(true);
    expect(toCreateProps(findItem("sep1"))).toEqual({ id: "sep1", contexts: findItem("sep1").contexts, parentId: "lens", type: "separator" });
    expect(toCreateProps(findItem("explain"))).not.toHaveProperty("action");
  });

  test("context-appropriate items", () => {
    expect(findItem("transcribe").contexts).toContain("video");
    expect(findItem("rewrite:formal").contexts).toEqual(["selection"]);
    expect(findItem("shelf_add").contexts).toContain("image");
  });
});

describe("readable extraction", () => {
  test("prefers <article> and converts to markdown", () => {
    const body = h("body", null,
      h("nav", null, h("a", { href: "/home" }, "Home")),
      h("article", null,
        h("h1", null, "Big Title"),
        h("p", null, "Intro with ", h("strong", null, "bold"), " and a ", h("a", { href: "/rel" }, "link"), ". ", LONG),
        h("ul", null, h("li", null, "one"), h("li", null, "two", h("ol", null, h("li", null, "nested")))),
        h("pre", null, h("code", null, "let x = 1;\nlet y = 2;")),
        h("blockquote", null, h("p", null, "Quoted")),
        h("table", null, h("tr", null, h("th", null, "A"), h("th", null, "B")), h("tr", null, h("td", null, "1"), h("td", null, "x|y"))),
        h("img", { src: "/i.png", alt: "pic" }),
        h("script", null, "evil()"),
        h("p", { hidden: "" }, "hidden text"),
      ),
      h("footer", null, "Footer junk"),
    );
    const r = readablePage(200 * 1024, "page", doc(body));
    expect(r.title).toBe("Doc");
    const md = r.markdown;
    expect(md).toContain("# Big Title");
    expect(md).toContain("**bold**");
    expect(md).toContain("[link](https://example.com/rel)");
    expect(md).toContain("- one\n- two\n  1. nested");
    expect(md).toContain("```\nlet x = 1;\nlet y = 2;\n```");
    expect(md).toContain("> Quoted");
    expect(md).toContain("| A | B |\n| --- | --- |\n| 1 | x\\|y |");
    expect(md).toContain("![pic](https://example.com/i.png)");
    expect(md).not.toContain("evil");
    expect(md).not.toContain("hidden text");
    expect(md).not.toContain("Footer");
    expect(md).not.toContain("Home");
  });

  test("scores paragraphs when there is no article", () => {
    const body = h("body", null,
      h("div", { class: "sidebar" }, h("p", null, "Short.")),
      h("div", { class: "content" }, h("p", null, LONG), h("p", null, LONG)),
      h("div", { class: "comments" }, h("p", null, "Nice post, a bit long but okay for a comment")),
    );
    const md = readablePage(0, "page", doc(body)).markdown;
    expect(md.split("\n\n").length).toBe(2);
    expect(md).not.toContain("Nice post");
  });

  test("caps size and refuses non-web links", () => {
    const body = h("body", null, h("article", null, ...Array.from({ length: 400 }, () => h("p", null, LONG)), h("a", { href: "javascript:alert(1)" }, "click")));
    const r = readablePage(10 * 1024, "page", doc(body));
    expect(r.truncated).toBe(true);
    expect(new TextEncoder().encode(r.markdown).length).toBeLessThanOrEqual(10 * 1024);
    expect(r.markdown).not.toContain("javascript:");
  });
});

describe("packaging", () => {
  const root = join(import.meta.dir, "../../extensions/browser");
  const base = JSON.parse(readFileSync(join(root, "manifest.base.json"), "utf8"));
  const walk = (d: string, rel = ""): string[] =>
    readdirSync(join(d, rel)).flatMap((n) => (statSync(join(d, rel, n)).isDirectory() ? walk(d, rel ? `${rel}/${n}` : n) : [rel ? `${rel}/${n}` : n]));
  const files = [...walk(root, "src"), ...walk(root, "icons")];
  const sources = Object.fromEntries(files.filter((f) => /\.(js|html)$/.test(f)).map((f) => [f, readFileSync(join(root, f), "utf8")]));

  test("every browser manifest passes the checks", () => {
    for (const target of TARGETS) {
      const m = buildManifest(base, target);
      expect(checkManifest(m, files, sources)).toEqual([]);
    }
    const ff = buildManifest(base, "firefox");
    expect(ff.background.scripts).toEqual(["src/background.js"]);
    expect(ff.key).toBeUndefined();
    expect(ff.permissions).not.toContain("sidePanel");
    const cr = buildManifest(base, "chrome");
    expect(cr.background.service_worker).toBe("src/background.js");
    expect(cr.permissions).toContain("sidePanel");
    expect(cr.key).toBeTruthy();
  });

  test("the checker catches remote code, network calls and broad permissions", () => {
    const m = buildManifest(base, "chrome");
    expect(checkManifest({ ...m, permissions: [...m.permissions, "tabs", "<all_urls>"] }, files, {})).not.toEqual([]);
    expect(checkManifest({ ...m, host_permissions: ["<all_urls>"] }, files, {})).not.toEqual([]);
    expect(checkManifest(m, files, { "x.js": "fetch('https://evil')" }).join()).toContain("network");
    expect(checkManifest(m, files, { "x.js": "eval('1')" }).join()).toContain("eval");
    expect(checkManifest(m, files, { "x.html": '<script src="https://cdn/x.js"></script>' }).join()).toContain("remote");
    expect(checkManifest(m, files.filter((f) => f !== "src/panel.html"), {}).join()).toContain("panel.html");
  });

  test("zip writer produces a valid archive", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const z: Uint8Array = zip([{ name: "a.txt", data: Buffer.from("hello") }]);
    const view = Buffer.from(z);
    expect(view.readUInt32LE(0)).toBe(0x04034b50);
    expect(view.readUInt32LE(view.length - 22)).toBe(0x06054b50);
    expect(view.readUInt16LE(view.length - 22 + 10)).toBe(1);
  });
});
