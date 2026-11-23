// Page metadata for clipper templates (author, description, published date, site name, keywords),
// read from the page's own <meta> tags and JSON-LD after the user clicks "Clip to notes".
// Must stay self-contained: `scripting.executeScript({ func })` serialises this one function.

export function pageMeta() {
  const meta = (sel) => document.querySelector(sel)?.getAttribute("content")?.trim() || "";
  let ld = {};
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const j = JSON.parse(s.textContent || "");
      const list = Array.isArray(j) ? j : j && j["@graph"] ? j["@graph"] : [j];
      const art = list.find((x) => x && /Article|BlogPosting|NewsArticle|WebPage|VideoObject/.test(String(x["@type"]))) || list[0];
      if (art) {
        ld = art;
        break;
      }
    } catch {
      /* not JSON */
    }
  }
  const ldAuthor = (() => {
    const a = ld.author;
    if (!a) return "";
    if (typeof a === "string") return a;
    if (Array.isArray(a)) return a.map((x) => (typeof x === "string" ? x : x && x.name) || "").filter(Boolean).join(", ");
    return a.name || "";
  })();
  const author =
    meta('meta[name="author"]') || meta('meta[property="article:author"]') || ldAuthor ||
    document.querySelector('[rel="author"]')?.textContent?.trim() || "";
  const description = meta('meta[name="description"]') || meta('meta[property="og:description"]') || (typeof ld.description === "string" ? ld.description : "");
  const published =
    meta('meta[property="article:published_time"]') || meta('meta[name="date"]') || (typeof ld.datePublished === "string" ? ld.datePublished : "") ||
    document.querySelector("time[datetime]")?.getAttribute("datetime") || "";
  const site = meta('meta[property="og:site_name"]') || "";
  const keywords = (meta('meta[name="keywords"]') || "").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 20);
  return { author: author.slice(0, 160), description: description.slice(0, 600), published: published.slice(0, 40), site: site.slice(0, 120), keywords };
}
