// Link rules ("send links from <app or site> to <space>"), the UI side: the same cleaning and
// matching as model.rs (clean_rule_value, route_link), used to preview a rule before saving it.
// Tested in src/__tests__/browserLinkRules.test.ts.
import type { LinkRule, Space } from "./api";

export const RULE_KINDS: { id: LinkRule["when"]; label: string; hint: string }[] = [
  { id: "domain", label: "Links to a site", hint: "github.com (its subdomains too)" },
  { id: "app", label: "Links from an app", hint: "slack, teams, outlook" },
  { id: "contains", label: "Links containing", hint: "words in the address, e.g. invoice" },
];

export function cleanValue(when: LinkRule["when"], value: string): string | null {
  const v = value.trim();
  let out = "";
  if (when === "domain") {
    const l = v.toLowerCase();
    const afterScheme = l.split("://").pop() ?? "";
    const host = (afterScheme.split(/[/?#:]/)[0] ?? "").replace(/^\*\./, "").replace(/^www\./, "").replace(/\.$/, "");
    if (!host.includes(".") || !/^[a-z0-9.-]+$/.test(host)) return null;
    out = host;
  } else if (when === "contains") {
    out = v.toLowerCase();
  } else if (when === "app") {
    out = (v.split(/[\\/]/).pop() ?? v).toLowerCase().replace(/\.exe$/, "");
  } else return null;
  return out && [...out].length <= 200 ? out : null;
}

function hostOf(url: string): string {
  const m = /^https?:\/\/(?:[^@/?#]*@)?([^/:?#]+)/i.exec(url.trim());
  return m ? m[1].toLowerCase().replace(/\.$/, "") : "";
}

/** The space a link goes to (first matching rule), or null. */
export function routeLink(rules: LinkRule[], url: string, sourceApp?: string | null): string | null {
  const host = hostOf(url);
  const lower = url.toLowerCase();
  const app = sourceApp ? (sourceApp.split(/[\\/]/).pop() ?? sourceApp).toLowerCase().replace(/\.exe$/, "") : null;
  const hit = rules.find((r) =>
    r.when === "domain" ? !!host && (host === r.value || host.endsWith(`.${r.value}`)) : r.when === "contains" ? lower.includes(r.value) : r.when === "app" ? app === r.value : false,
  );
  return hit ? hit.spaceId : null;
}

/** "Links to github.com → Code" */
export function ruleLine(r: LinkRule, spaces: Space[]): string {
  const space = spaces.find((s) => s.id === r.spaceId)?.name ?? "a removed space";
  const what = r.when === "domain" ? `Links to ${r.value}` : r.when === "app" ? `Links from ${r.value}` : `Links containing “${r.value}”`;
  return `${what} → ${space}`;
}
