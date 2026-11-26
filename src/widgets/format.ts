// Dashboard widget manifests (docs/plans/MAGIC_WAVES.md §4). Three kinds:
// - plugin: an existing Lens plugin frame (sandboxed iframe, no network of its own)
// - adaptive: an Adaptive Card template with data Lens fetches from an approved source
// - feed: an RSS/Atom or JSON feed Lens fetches from an approved source
// Widgets never get network access themselves; Lens fetches only from hosts the person approved
// for that widget, and only while the Dashboard is open. Validation only here.

export type WidgetKind = "plugin" | "adaptive" | "feed";

export interface WidgetManifest {
  id: string;
  name: string;
  kind: WidgetKind;
  version: string;
  author?: string;
  license?: string;
  /** plugin: the plugin id; adaptive/feed: unused. */
  plugin?: string;
  /** adaptive: the card template (Adaptive Cards JSON). */
  template?: unknown;
  /** adaptive/feed: where Lens fetches data (https only). */
  source?: { url: string; refreshMinutes?: number };
  /** Size on the Dashboard grid. */
  size?: "s" | "m" | "l";
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** Hosts the person must approve before Lens fetches anything for this widget. */
  hosts: string[];
}

const ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const VERSION = /^\d+\.\d+\.\d+$/;

export function validateManifest(m: unknown): ValidationResult {
  const errors: string[] = [];
  const hosts: string[] = [];
  if (!m || typeof m !== "object") return { ok: false, errors: ["Not a widget manifest."], hosts };
  const w = m as Partial<WidgetManifest>;
  if (typeof w.id !== "string" || !ID.test(w.id)) errors.push("id must be 2–64 lowercase letters, digits, dots, dashes or underscores.");
  if (typeof w.name !== "string" || !w.name.trim() || w.name.length > 60) errors.push("name is required (up to 60 characters).");
  if (typeof w.version !== "string" || !VERSION.test(w.version)) errors.push("version must look like 1.0.0.");
  if (w.kind !== "plugin" && w.kind !== "adaptive" && w.kind !== "feed") errors.push("kind must be plugin, adaptive or feed.");
  if (w.size !== undefined && !["s", "m", "l"].includes(w.size)) errors.push("size must be s, m or l.");
  if (w.kind === "plugin" && (typeof w.plugin !== "string" || !w.plugin)) errors.push("plugin widgets name the plugin they show.");
  if (w.kind === "adaptive" && (w.template === undefined || typeof w.template !== "object")) errors.push("adaptive widgets need a card template.");
  if (w.kind === "adaptive" || w.kind === "feed") {
    const url = w.source?.url;
    if (typeof url !== "string") errors.push(`${w.kind} widgets need a source url.`);
    else {
      try {
        const u = new URL(url);
        if (u.protocol !== "https:") errors.push("source url must use https.");
        else if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) || u.hostname.endsWith(".local")) errors.push("source url can't point at this PC or the local network.");
        else hosts.push(u.hostname);
      } catch {
        errors.push("source url isn't a valid address.");
      }
    }
    const r = w.source?.refreshMinutes;
    if (r !== undefined && (typeof r !== "number" || r < 5 || r > 1440)) errors.push("refreshMinutes must be between 5 and 1440.");
  }
  return { ok: errors.length === 0, errors, hosts };
}

/** The Adaptive Card subset Lens renders (wave M2). Plain React: no HTML, no scripts, no styles
 *  from the card, images only from the widget's approved hosts, links only https and opened in
 *  Lens Browser. */
export type CardElement =
  | { type: "TextBlock"; text: string; weight?: "default" | "bolder"; size?: "small" | "default" | "medium" | "large" | "extraLarge"; isSubtle?: boolean; wrap?: boolean }
  | { type: "FactSet"; facts: { title: string; value: string }[] }
  | { type: "Container"; items: CardElement[] }
  | { type: "ColumnSet"; columns: { items: CardElement[]; width?: "auto" | "stretch" }[] }
  | { type: "Image"; url: string; altText?: string; size?: "small" | "medium" }
  | { type: "ActionSet"; actions: { type: "Action.OpenUrl"; title: string; url: string }[] };

export interface CardCheck {
  ok: boolean;
  /** The safe card: unknown parts dropped, text clipped. */
  body: CardElement[];
  errors: string[];
}

const MAX_ELEMENTS = 80;
const MAX_DEPTH = 5;
const MAX_TEXT = 600;
const str = (v: unknown, n = MAX_TEXT) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v)).slice(0, n);

function httpsOn(url: unknown, hosts: string[] | null): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (hosts && !hosts.some((h) => h.toLowerCase() === u.hostname.toLowerCase())) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Checks a card against the subset. `imageHosts` are the widget's approved hosts: images from
 *  anywhere else are dropped (they would be a fetch the person didn't approve). Links may point
 *  anywhere https; they only open in Lens Browser when clicked. */
export function validateCard(body: unknown, imageHosts: string[]): CardCheck {
  const errors: string[] = [];
  let count = 0;
  const walk = (el: unknown, depth: number): CardElement | null => {
    if (++count > MAX_ELEMENTS) {
      if (count === MAX_ELEMENTS + 1) errors.push(`A card can have up to ${MAX_ELEMENTS} parts.`);
      return null;
    }
    if (depth > MAX_DEPTH) {
      errors.push("The card is nested too deeply.");
      return null;
    }
    if (!el || typeof el !== "object") return null;
    const e = el as Record<string, unknown>;
    switch (e.type) {
      case "TextBlock": {
        const size = ["small", "default", "medium", "large", "extraLarge"].includes(e.size as string) ? (e.size as "small") : undefined;
        return { type: "TextBlock", text: str(e.text), weight: e.weight === "bolder" ? "bolder" : undefined, size, isSubtle: e.isSubtle === true, wrap: e.wrap !== false };
      }
      case "FactSet":
        return { type: "FactSet", facts: (Array.isArray(e.facts) ? e.facts : []).slice(0, 12).map((f) => ({ title: str((f as Record<string, unknown>)?.title, 80), value: str((f as Record<string, unknown>)?.value, 200) })) };
      case "Container":
        return { type: "Container", items: (Array.isArray(e.items) ? e.items : []).map((i) => walk(i, depth + 1)).filter((x): x is CardElement => !!x) };
      case "ColumnSet":
        return {
          type: "ColumnSet",
          columns: (Array.isArray(e.columns) ? e.columns : []).slice(0, 4).map((c) => {
            const col = (c ?? {}) as Record<string, unknown>;
            return { width: col.width === "auto" ? "auto" : "stretch", items: (Array.isArray(col.items) ? col.items : []).map((i) => walk(i, depth + 1)).filter((x): x is CardElement => !!x) };
          }),
        };
      case "Image": {
        const url = httpsOn(e.url, imageHosts);
        if (!url) {
          errors.push("An image from a site that isn't approved was left out.");
          return null;
        }
        return { type: "Image", url, altText: str(e.altText, 120), size: e.size === "medium" ? "medium" : "small" };
      }
      case "ActionSet": {
        const actions = (Array.isArray(e.actions) ? e.actions : [])
          .slice(0, 4)
          .map((a) => a as Record<string, unknown>)
          .filter((a) => a?.type === "Action.OpenUrl")
          .map((a) => ({ type: "Action.OpenUrl" as const, title: str(a.title, 40) || "Open", url: httpsOn(a.url, null) ?? "" }))
          .filter((a) => a.url);
        return actions.length ? { type: "ActionSet", actions } : null;
      }
      default:
        if (typeof e.type === "string") errors.push(`"${str(e.type, 40)}" isn't supported and was left out.`);
        return null;
    }
  };
  const list = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).body) ? ((body as Record<string, unknown>).body as unknown[]) : null;
  if (!list) return { ok: false, body: [], errors: ["Not a card."] };
  const out = list.map((el) => walk(el, 1)).filter((x): x is CardElement => !!x);
  return { ok: out.length > 0, body: out, errors };
}

export interface FeedEntry {
  title: string;
  url: string;
  /** ms since epoch, or 0 when the feed has no date. */
  at: number;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads RSS 2.0 or Atom as plain text entries (no HTML kept). Up to `max` entries. */
export function parseFeed(xml: string, max = 8): FeedEntry[] {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  const tag = (b: string, name: string) => {
    const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(b);
    return m ? decode(m[1]) : "";
  };
  return blocks.slice(0, max).map((b) => {
    const atomLink = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i.exec(b) ?? /<link[^>]*href=["']([^"']+)["']/i.exec(b);
    const link = atomLink ? decode(atomLink[1]) : tag(b, "link");
    const date = tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || tag(b, "dc:date");
    const at = date ? Date.parse(date) : NaN;
    const url = /^https:\/\//i.test(link) ? link : "";
    return { title: tag(b, "title") || "Untitled", url, at: Number.isFinite(at) ? at : 0 };
  });
}

/** Fills ${path} placeholders in a template from data. Unknown paths become empty strings. */
export function bindTemplate(template: unknown, data: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    return template.replace(/\$\{([a-zA-Z0-9_.]+)\}/g, (_m, path: string) => {
      const v = path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), data);
      return v === undefined || v === null ? "" : String(v);
    });
  }
  if (Array.isArray(template)) return template.map((t) => bindTemplate(t, data));
  if (template && typeof template === "object") {
    return Object.fromEntries(Object.entries(template as Record<string, unknown>).map(([k, v]) => [k, bindTemplate(v, data)]));
  }
  return template;
}
