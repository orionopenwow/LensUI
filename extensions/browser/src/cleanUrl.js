// Clean copy in the browser: same rules and logic as Lens (src/context/cleanCopy.ts), with the
// rules copied into catalog.gen.js by build.mjs. Pure, for `bun test`.
import { CLEAN_RULES } from "./catalog.gen.js";

function hostRuleMatches(host, key) {
  if (key.endsWith(".")) return host.split(".").some((_, i, parts) => parts.slice(i).join(".").startsWith(key));
  return host === key || host.endsWith("." + key);
}

export function isTrackingParam(name, host, r = CLEAN_RULES) {
  const n = name.toLowerCase();
  if (r.params.some((p) => p.toLowerCase() === n)) return true;
  if (r.prefixes.some((p) => n.startsWith(p.toLowerCase()))) return true;
  return Object.entries(r.hostParams).some(([h, ps]) => hostRuleMatches(host, h) && ps.some((p) => p.toLowerCase() === n));
}

export function cleanUrl(url, r = CLEAN_RULES) {
  let u;
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
  if (trackedHash) u.hash = "";
  return u.toString();
}

export function cleanLinksInText(text, r = CLEAN_RULES) {
  return String(text).replace(/https?:\/\/[^\s<>()"'\]]+/g, (m) => {
    const trail = /[.,;:!?]+$/.exec(m)?.[0] ?? "";
    const core = trail ? m.slice(0, -trail.length) : m;
    return cleanUrl(core, r) + trail;
  });
}
