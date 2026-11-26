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

/** Adaptive Card elements the stub renderer supports (later waves add more). */
export type CardElement =
  | { type: "TextBlock"; text: string; weight?: "default" | "bolder"; size?: "small" | "default" | "medium" | "large"; isSubtle?: boolean }
  | { type: "FactSet"; facts: { title: string; value: string }[] }
  | { type: "Container"; items: CardElement[] };

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
