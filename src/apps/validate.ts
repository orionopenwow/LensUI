// Runtime validation of the Lens Apps catalogue (mirrors catalog/apps/schema.json). Used by the
// tests for every entry and by the UI before trusting a catalogue.
import type { Catalog, CatalogApp } from "./types";

const APP_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// winget ids: Publisher.Package[.More], [A-Za-z0-9._-]+, no leading dash or dot, no "..".
export const WINGET_ID = /^[A-Za-z0-9_][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HINT = /^[A-Za-z0-9._-]{1,32}$/;
const EXT = /^\.[A-Za-z0-9]{1,12}$/;

export function isHttpsUrl(u: unknown): u is string {
  if (typeof u !== "string" || !u.startsWith("https://")) return false;
  if (/[\s"'<>`\\]/.test(u)) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname.includes(".") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isWingetId(id: unknown): id is string {
  return typeof id === "string" && id.length <= 128 && WINGET_ID.test(id) && !id.includes("..");
}

const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|ico|mp4|webm)$/i;
export function isMediaUrl(u: unknown): u is string {
  return isHttpsUrl(u) && MEDIA_EXT.test(new URL(u).pathname);
}

/** Problems with one entry; empty when valid. `ids` is the set of all app ids (for `via`). */
export function validateApp(a: CatalogApp, ids: Set<string>, categories: Set<string>, collections: Set<string>): string[] {
  const e: string[] = [];
  const req = (cond: boolean, msg: string) => {
    if (!cond) e.push(`${a?.id ?? "?"}: ${msg}`);
  };
  req(typeof a.id === "string" && APP_ID.test(a.id) && a.id.length >= 2 && a.id.length <= 48, "id must be kebab-case");
  req(!!a.name?.trim(), "name required");
  req(categories.has(a.category), `unknown category ${a.category}`);
  req(Array.isArray(a.collections) && a.collections.every((c) => collections.has(c)), "unknown collection");
  req(["stable", "beta", "alpha"].includes(a.status), "status");
  req(!!a.pitch && a.pitch.length <= 140, "pitch required, ≤140 chars");
  req(!!a.why, "why required");
  req(typeof a.openSource === "boolean", "openSource flag");
  req(!!a.license && a.license.length >= 2, "licence required");
  req(!!a.publisher, "publisher required");
  req(isHttpsUrl(a.homepage), "homepage must be https");
  req(a.repo === null || isHttpsUrl(a.repo), "repo must be https or null");
  req(Array.isArray(a.sources) && a.sources.length > 0 && a.sources.every(isHttpsUrl), "sources must be https links");
  const m = a.media;
  req(m?.icon === null || isMediaUrl(m?.icon), "media icon must be an https image URL or null");
  req(Array.isArray(m?.screenshots) && m.screenshots.every(isMediaUrl), "screenshots must be https image URLs");
  req(m?.loop === null || isMediaUrl(m?.loop), "loop must be an https media URL or null");
  req(!!m?.credit && isHttpsUrl(m?.sourceUrl), "media credit and https sourceUrl required");
  req(!!(m?.icon && m.screenshots.length) || (typeof m?.noMedia === "string" && m.noMedia.length > 10), "icon + a screenshot, or a noMedia reason");
  req(Array.isArray(a.integration?.fileTypes) && a.integration.fileTypes.every((x) => EXT.test(x)), "file types like .mp4");
  req(Array.isArray(a.integration?.voice), "voice phrases array");
  const i = a.install as any;
  switch (i?.method) {
    case "winget":
      req(isWingetId(i.wingetId), `bad winget id ${i.wingetId}`);
      req(typeof i.wingetVerified === "boolean", "wingetVerified flag");
      break;
    case "githubRelease":
      req(typeof i.repo === "string" && REPO.test(i.repo), "repo owner/name");
      req(Array.isArray(i.hints) && i.hints.every((h: string) => HINT.test(h)), "hints");
      req(i.fallbackUrl === undefined || isHttpsUrl(i.fallbackUrl), "fallbackUrl https");
      break;
    case "via":
      req(ids.has(i.via) && i.via !== a.id, `via must name another app (${i.via})`);
      req(i.fallbackUrl === undefined || isHttpsUrl(i.fallbackUrl), "fallbackUrl https");
      break;
    case "officialSite":
    case "web":
      req(isHttpsUrl(i.url), "install url https");
      break;
    default:
      e.push(`${a.id}: unknown install method ${i?.method}`);
  }
  req(Array.isArray(a.recipe), "recipe array");
  for (const s of a.recipe ?? []) {
    switch (s.kind) {
      case "addToDock":
        break;
      case "openWith":
        req(s.extensions.length > 0 && s.extensions.every((x) => EXT.test(x)), "recipe openWith extensions");
        break;
      case "rightClick":
        req(s.actions.length > 0, "recipe rightClick actions");
        break;
      case "localModelProvider":
        req(["ollama", "lmstudio", "llamacpp"].includes(s.provider), "recipe provider");
        break;
      case "mcpServer":
        req(!!s.name && !!s.command && !/[&|;<>`$%"\n]/.test(s.command + s.args.join(" ")), "recipe mcp command");
        break;
      case "voiceVerbs":
        req(s.phrases.length > 0, "recipe voice phrases");
        break;
      case "guideLesson":
        req(!!s.lesson, "recipe lesson");
        break;
      default:
        e.push(`${a.id}: unknown recipe step ${(s as any).kind}`);
    }
  }
  return e;
}

export function validateCatalog(c: Catalog): string[] {
  const errs: string[] = [];
  if (c.version !== 1) errs.push("version must be 1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.updated)) errs.push("updated must be YYYY-MM-DD");
  const ids = new Set<string>();
  for (const a of c.apps) {
    if (ids.has(a.id)) errs.push(`duplicate id ${a.id}`);
    ids.add(a.id);
  }
  const cats = new Set(c.categories.map((x) => x.id));
  const cols = new Set(c.collections.map((x) => x.id));
  for (const a of c.apps) errs.push(...validateApp(a, ids, cats, cols));
  return errs;
}
