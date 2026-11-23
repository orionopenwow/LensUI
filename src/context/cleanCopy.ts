// Clean copy: strip tracking parameters from links, and tidy text a site appended to what you
// copied ("Read more at …"). Rules: cleanCopy.rules.json, shared with the browser extension
// (extensions/browser/src/cleanUrl.js runs the same rules; a test keeps the two in step).
import rules from "./cleanCopy.rules.json";

export interface CleanRules {
  version: number;
  params: string[];
  prefixes: string[];
  hostParams: Record<string, string[]>;
  hijackMarkers: string[];
}

export const RULES = rules as CleanRules;

function hostRuleMatches(host: string, key: string): boolean {
  // "amazon." matches any Amazon country domain; others match the domain and its subdomains.
  if (key.endsWith(".")) return host.split(".").some((_, i, parts) => parts.slice(i).join(".").startsWith(key));
  return host === key || host.endsWith("." + key);
}

/** Is this query parameter tracking on this host? */
export function isTrackingParam(name: string, host: string, r: CleanRules = RULES): boolean {
  const n = name.toLowerCase();
  if (r.params.some((p) => p.toLowerCase() === n)) return true;
  if (r.prefixes.some((p) => n.startsWith(p.toLowerCase()))) return true;
  return Object.entries(r.hostParams).some(([h, ps]) => hostRuleMatches(host, h) && ps.some((p) => p.toLowerCase() === n));
}

/** The URL without tracking parameters (and without an empty `?`). Non-web URLs come back unchanged. */
export function cleanUrl(url: string, r: CleanRules = RULES): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return url;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const keep = [...u.searchParams.entries()].filter(([k]) => !isTrackingParam(k, host, r));
  const trackedHash = /^#(utm_|fbclid|gclid)/i.test(u.hash);
  if (keep.length === [...u.searchParams.keys()].length && !trackedHash) return url;
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);
  // Tracking sometimes rides in the fragment too (#utm_source=…).
  if (trackedHash) u.hash = "";
  return u.toString();
}

/** Cleans every http(s) link inside a piece of text (Markdown links included). */
export function cleanLinksInText(text: string, r: CleanRules = RULES): string {
  return text.replace(/https?:\/\/[^\s<>()"'\]]+/g, (m) => {
    const trail = /[.,;:!?]+$/.exec(m)?.[0] ?? "";
    const core = trail ? m.slice(0, -trail.length) : m;
    return cleanUrl(core, r) + trail;
  });
}

/**
 * What the page added after the text you selected: if `copied` starts with `selection` and the
 * rest is a known "Read more at…" style tail, returns just the selection.
 */
export function stripHijack(copied: string, selection: string, r: CleanRules = RULES): string {
  const sel = selection.trim();
  if (!sel || !copied.startsWith(sel)) return copied;
  const tail = copied.slice(sel.length).trim();
  if (!tail) return copied;
  return r.hijackMarkers.some((m) => tail.toLowerCase().includes(m.toLowerCase())) ? sel : copied;
}
