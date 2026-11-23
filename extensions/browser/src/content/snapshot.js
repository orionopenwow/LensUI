// "Save page offline": a self-contained HTML snapshot of the current page, made in the page after
// the user clicks (activeTab). Our own approach (SingleFile is AGPL and is not used):
//
//   • clone the live DOM (so it includes what scripts rendered), drop scripts, frames, inline
//     event handlers and javascript: links, and add a CSP that blocks any script;
//   • make every link and resource URL absolute, and add <base>;
//   • inline same-origin stylesheets (cross-origin ones stay as absolute <link>s);
//   • inline images that are already loaded and same-origin (canvas), largest budget first,
//     while the file stays under `capBytes`; the rest keep their absolute URLs.
//
// No network requests are made. Must stay self-contained: `executeScript({ func })` serialises it.

export function snapshotPage(capBytes) {
  const cap = Math.max(50_000, Math.min(Number(capBytes) || 400_000, 4_000_000));
  const enc = new TextEncoder();
  const size = (s) => enc.encode(s).length;
  const abs = (v) => {
    try {
      return new URL(v, document.baseURI).href;
    } catch {
      return v;
    }
  };
  const doc = document.documentElement.cloneNode(true);

  // 1) Nothing that runs.
  doc.querySelectorAll("script, noscript, iframe, frame, frameset, object, embed, portal, template, link[rel=preload], link[rel=modulepreload], link[rel=prefetch], meta[http-equiv=refresh]").forEach((n) => n.remove());
  for (const el of doc.querySelectorAll("*")) {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith("on")) el.removeAttribute(a.name);
      else if ((n === "href" || n === "src" || n === "action" || n === "formaction" || n === "xlink:href") && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
      else if (n === "integrity" || n === "nonce") el.removeAttribute(a.name);
    }
  }

  // 2) Absolute URLs.
  for (const el of doc.querySelectorAll("[href]")) el.setAttribute("href", abs(el.getAttribute("href")));
  for (const el of doc.querySelectorAll("[src]")) el.setAttribute("src", abs(el.getAttribute("src")));
  for (const el of doc.querySelectorAll("[srcset]")) {
    el.setAttribute("srcset", el.getAttribute("srcset").split(",").map((p) => {
      const [u, d] = p.trim().split(/\s+/, 2);
      return d ? `${abs(u)} ${d}` : abs(u);
    }).join(", "));
  }

  // 3) Same-origin stylesheets inline.
  let inlinedCss = 0;
  const live = [...document.styleSheets];
  const links = [...doc.querySelectorAll("link[rel~=stylesheet]")];
  for (const link of links) {
    const href = link.getAttribute("href");
    const sheet = live.find((s) => s.href === href);
    if (!sheet) continue;
    try {
      const css = [...sheet.cssRules].map((r) => r.cssText).join("\n");
      const style = doc.ownerDocument.createElement("style");
      style.textContent = css;
      link.replaceWith(style);
      inlinedCss++;
    } catch {
      /* cross-origin: keep the absolute link */
    }
  }

  // 4) Head: charset, base, CSP, provenance.
  const head = doc.querySelector("head") || doc.insertBefore(doc.ownerDocument.createElement("head"), doc.firstChild);
  head.querySelectorAll("base, meta[http-equiv=Content-Security-Policy i]").forEach((n) => n.remove());
  const mk = (tag, attrs) => {
    const e = doc.ownerDocument.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  head.prepend(
    mk("meta", { charset: "utf-8" }),
    mk("meta", { "http-equiv": "Content-Security-Policy", content: "script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'" }),
    mk("base", { href: location.href }),
    mk("meta", { name: "lens-archive", content: JSON.stringify({ url: location.href, title: document.title, savedAt: new Date().toISOString() }) }),
  );

  const serialise = () => "<!DOCTYPE html>\n" + doc.outerHTML;
  let html = serialise();
  if (size(html) > cap) {
    // Too big even before images: drop inline styles' largest blocks first.
    const styles = [...doc.querySelectorAll("style")].sort((a, b) => b.textContent.length - a.textContent.length);
    for (const s of styles) {
      if (size(html) <= cap) break;
      s.remove();
      html = serialise();
    }
    if (size(html) > cap) return { ok: false, reason: "too-large", bytes: size(html), cap };
  }

  // 5) Images: already loaded, same-origin (canvas not tainted), smallest first so more fit.
  const liveImgs = [...document.images];
  const cloneImgs = [...doc.querySelectorAll("img")];
  let inlined = 0;
  let skipped = 0;
  const pairs = cloneImgs
    .map((c, i) => ({ c, l: liveImgs[i] }))
    .filter((p) => p.l && p.l.complete && p.l.naturalWidth > 0)
    .sort((a, b) => a.l.naturalWidth * a.l.naturalHeight - b.l.naturalWidth * b.l.naturalHeight);
  let budget = cap - size(html);
  for (const { c, l } of pairs) {
    try {
      const scale = Math.min(1, 1600 / Math.max(l.naturalWidth, l.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(l.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(l.naturalHeight * scale));
      canvas.getContext("2d").drawImage(l, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/webp", 0.8);
      if (data.length + 32 > budget) {
        skipped++;
        continue;
      }
      c.setAttribute("src", data);
      c.removeAttribute("srcset");
      c.removeAttribute("loading");
      budget -= data.length;
      inlined++;
    } catch {
      skipped++; // cross-origin image: keeps its absolute URL
    }
  }
  html = serialise();
  return { ok: true, html, bytes: size(html), title: document.title, url: location.href, inlinedImages: inlined, skippedImages: skipped + (cloneImgs.length - pairs.length), inlinedCss };
}
