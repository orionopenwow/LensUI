/**
 * Theme gallery index: a JSON file a website (or a friend) can publish to list shareable
 * Lens themes. Lens does not fetch anything from the network today; a gallery file is
 * loaded from disk, and only entries that carry their theme inline can be applied.
 *
 * {
 *   "lensGallery": 1,
 *   "name": "Community picks",
 *   "updated": "2026-11-21",
 *   "themes": [
 *     {
 *       "id": "dusk", "name": "Dusk", "author": "someone", "description": "…",
 *       "tags": ["dark", "purple"],
 *       "preview": "data:image/png;base64,…"  (or an https URL, shown as a placeholder for now),
 *       "url": "https://example.com/dusk.lenstheme",  (future download)
 *       "sha256": "…",                                (future integrity check)
 *       "theme": { "lenstheme": 1, … }               (optional inline theme file)
 *     }
 *   ]
 * }
 */
export interface GalleryEntry {
  id: string;
  name: string;
  author: string;
  description: string;
  tags: string[];
  /** Only data: image URLs are displayed; anything else is ignored. */
  preview: string | null;
  url: string | null;
  sha256: string | null;
  theme: Record<string, unknown> | null;
}

export interface GalleryIndex {
  name: string;
  updated: string;
  themes: GalleryEntry[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max).trim() : "";

export function parseGalleryIndex(raw: unknown): GalleryIndex {
  if (!isObj(raw) || raw.lensGallery !== 1 || !Array.isArray(raw.themes)) {
    throw new Error("Not a Lens theme gallery file.");
  }
  const themes: GalleryEntry[] = [];
  const seen = new Set<string>();
  for (const t of raw.themes.slice(0, 500)) {
    if (!isObj(t)) continue;
    const id = text(t.id, 60).toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const name = text(t.name, 60);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const preview = typeof t.preview === "string" && /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(t.preview) && t.preview.length < 400_000 ? t.preview : null;
    const url = typeof t.url === "string" && /^https:\/\/[^\s"'<>]+$/.test(t.url) ? t.url.slice(0, 500) : null;
    const sha = typeof t.sha256 === "string" && /^[a-f0-9]{64}$/i.test(t.sha256) ? t.sha256.toLowerCase() : null;
    themes.push({
      id,
      name,
      author: text(t.author, 60),
      description: text(t.description, 240),
      tags: Array.isArray(t.tags) ? t.tags.map((x) => text(x, 24)).filter(Boolean).slice(0, 8) : [],
      preview,
      url,
      sha256: sha,
      theme: isObj(t.theme) && t.theme.lenstheme === 1 ? t.theme : null,
    });
  }
  return { name: text(raw.name, 80) || "Theme gallery", updated: text(raw.updated, 40), themes };
}
