// Voice and Command phrases for Lens Apps: "Lens, install ArtCraft", "open the charting app",
// "update all my apps", "what does Concat do", "what should I use for slides", "/install concat",
// "/apps". Pure; the voice package and Lens Command call `parseAppsIntent` (see docs/LENS_APPS.md).
import { categoryFor, recommend, resolveApp } from "./search";
import type { Catalog, CatalogApp } from "./types";

export type AppsIntent =
  | { kind: "openApps"; query: string }
  | { kind: "install"; app: CatalogApp | null; candidates: CatalogApp[]; spoken: string; risk: "confirm" }
  | { kind: "open"; app: CatalogApp | null; candidates: CatalogApp[]; spoken: string; risk: "low" }
  | { kind: "uninstall"; app: CatalogApp | null; candidates: CatalogApp[]; spoken: string; risk: "confirm" }
  | { kind: "updateAll"; risk: "confirm" }
  | { kind: "describe"; app: CatalogApp | null; candidates: CatalogApp[]; spoken: string; risk: "low" }
  | { kind: "recommend"; category: string; apps: CatalogApp[]; risk: "low" };

/** Category nicknames people say instead of app names ("the charting app"). */
const NICKNAMES: Record<string, string> = {
  "charting app": "markets",
  "chart app": "markets",
  "trading app": "markets",
  "tradingview app": "markets",
  "video editor": "create",
  "notes app": "notes",
  "slides app": "slides",
  "spreadsheet app": "sheets",
  "docs app": "docs",
  "code editor": "dev",
};

function strip(text: string): string {
  return text
    .trim()
    .replace(/^(hey\s+)?lens[,:]?\s+/i, "")
    .replace(/^(please|can you|could you|would you)\s+/i, "")
    .replace(/\s+(please|for me|now)[.!?]*$/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

function byNickname(catalog: Catalog, spoken: string, installed?: Set<string>): CatalogApp | null {
  const s = spoken.toLowerCase().replace(/^(the|my)\s+/, "").trim();
  const cat = NICKNAMES[s];
  if (!cat) return null;
  const inCat = catalog.apps.filter((a) => a.category === cat);
  return inCat.find((a) => installed?.has(a.id)) ?? recommend(catalog, cat, 1)[0] ?? null;
}

function target(catalog: Catalog, spoken: string, installed?: Set<string>) {
  const nick = byNickname(catalog, spoken, installed);
  if (nick) return { app: nick, candidates: [nick] };
  return resolveApp(catalog.apps, spoken);
}

/** Parses a phrase; returns null when it isn't about apps. `installed` helps "open the charting app". */
export function parseAppsIntent(input: string, catalog: Catalog, installed?: Set<string>): AppsIntent | null {
  const raw = input.trim();
  // Command slash forms.
  const slash = raw.match(/^\/(apps|install|open-app|uninstall)\b\s*(.*)$/i);
  if (slash) {
    const [, cmd, rest] = slash;
    if (cmd.toLowerCase() === "apps") return { kind: "openApps", query: rest.trim() };
    const t = target(catalog, rest, installed);
    if (cmd.toLowerCase() === "install") return { kind: "install", ...t, spoken: rest, risk: "confirm" };
    if (cmd.toLowerCase() === "uninstall") return { kind: "uninstall", ...t, spoken: rest, risk: "confirm" };
    return { kind: "open", ...t, spoken: rest, risk: "low" };
  }
  const text = strip(raw);
  let m: RegExpMatchArray | null;
  if (/^(open|show)\s+(the\s+)?(apps|app store|apps section|tools section)$/i.test(text)) return { kind: "openApps", query: "" };
  if (/^(update|upgrade)\s+(all\s+)?(my\s+)?(apps|tools)$/i.test(text) || /^update everything$/i.test(text)) return { kind: "updateAll", risk: "confirm" };
  if ((m = text.match(/^(install|get|download|add)\s+(.+)$/i))) {
    const spoken = m[2].replace(/\s+app$/i, "");
    return { kind: "install", ...target(catalog, spoken, installed), spoken, risk: "confirm" };
  }
  if ((m = text.match(/^(uninstall|remove)\s+(.+)$/i))) {
    return { kind: "uninstall", ...target(catalog, m[2], installed), spoken: m[2], risk: "confirm" };
  }
  if ((m = text.match(/^(what does|what's|what is)\s+(.+?)(\s+do|\s+for)?$/i)) && !/\b(use|best|good)\b/i.test(text)) {
    const t = target(catalog, m[2], installed);
    if (t.app || t.candidates.length) return { kind: "describe", ...t, spoken: m[2], risk: "low" };
  }
  if ((m = text.match(/^(what|which)\s+(tool|app|program)?\s*(should i use|do i use|is best|is good|can i use)\s+(for|to)\s+(.+)$/i)) ||
      (m = text.match(/^(best|good|free)\s+(tool|app|apps|tools)\s+(for)\s+(.+)$/i))) {
    const cat = categoryFor(m[m.length - 1]);
    if (cat) return { kind: "recommend", category: cat, apps: recommend(catalog, cat), risk: "low" };
  }
  if ((m = text.match(/^(open|launch|start)\s+(.+)$/i))) {
    const t = target(catalog, m[2], installed);
    if (t.app || t.candidates.length) return { kind: "open", ...t, spoken: m[2], risk: "low" };
  }
  return null;
}

/** Plain-language reply for a recommend/describe intent (Guide and voice read this out). */
export function describeIntent(i: AppsIntent): string {
  if (i.kind === "recommend") {
    if (!i.apps.length) return "I don't have a pick for that yet.";
    const [first, ...rest] = i.apps;
    return `Try ${first.name}: ${first.pitch}${rest.length ? ` Also good: ${rest.map((a) => a.name).join(", ")}.` : ""}`;
  }
  if (i.kind === "describe") {
    if (!i.app) return i.candidates.length ? `Did you mean ${i.candidates.map((a) => a.name).join(" or ")}?` : "I don't know that one.";
    const a = i.app;
    return `${a.name}: ${a.pitch} ${a.openSource ? `Open source (${a.license}).` : `Free, not open source.`}`;
  }
  return "";
}
