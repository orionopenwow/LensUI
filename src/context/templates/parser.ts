// Clipper template parser. The syntax follows Obsidian Web Clipper's templates
// (https://github.com/obsidianmd/obsidian-clipper, MIT, © Obsidian): `{{variable}}` with
// `|filter` and `|filter:"argument"` chains. This is Lens's own small implementation of that
// approach (no code copied); see docs/THIRD_PARTY_NOTICES.md.
//
//   {{title}}                         the page title
//   {{date|date:"YYYY-MM-DD"}}        today, formatted
//   {{selection|blockquote}}          the selection as a Markdown quote
//   {{tags|join:", "}}                a list joined
//   {{author|default:"Unknown"}}      fallback when empty
//   {{title|safe_name|truncate:80}}   chained filters
//
// Unknown variables render as empty text; unknown filters leave the value unchanged and are
// reported by `lint`.

export type Value = string | string[] | Date | undefined | null;
export type Vars = Record<string, Value>;

export const VARIABLES = [
  "title", "url", "domain", "author", "description", "published", "site", "date", "time", "selection", "highlights",
  "content", "tags", "keywords",
] as const;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Moment-style tokens: YYYY YY MMMM MMM MM M DD D dddd ddd HH H mm ss, and [literal] text. */
export function formatDate(d: Date, fmt: string): string {
  if (Number.isNaN(d.getTime())) return "";
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()), YY: String(d.getFullYear()).slice(-2),
    MMMM: MONTHS[d.getMonth()], MMM: MONTHS[d.getMonth()].slice(0, 3), MM: pad(d.getMonth() + 1), M: String(d.getMonth() + 1),
    DD: pad(d.getDate()), D: String(d.getDate()), dddd: DAYS[d.getDay()], ddd: DAYS[d.getDay()].slice(0, 3),
    HH: pad(d.getHours()), H: String(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()),
  };
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|mm|ss/g, (m, lit) => (lit !== undefined ? lit : map[m] ?? m));
}

const asText = (v: Value): string => {
  if (v == null) return "";
  if (v instanceof Date) return formatDate(v, "YYYY-MM-DD");
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
};
const asList = (v: Value): string[] => (Array.isArray(v) ? v : v == null || v === "" ? [] : [asText(v)]);

type Filter = (v: Value, args: string[]) => Value;

export const FILTERS: Record<string, Filter> = {
  lower: (v) => asText(v).toLowerCase(),
  upper: (v) => asText(v).toUpperCase(),
  title: (v) => asText(v).replace(/\b\p{L}/gu, (c) => c.toUpperCase()),
  trim: (v) => asText(v).trim(),
  slug: (v) => asText(v).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, ""),
  safe_name: (v) => asText(v).replace(/[<>:"/\\|?*\u0000-\u001f#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120),
  date: (v, [fmt = "YYYY-MM-DD"]) => {
    const t = asText(v).trim();
    // A plain date ("1995-12-21") is a calendar day, not midnight UTC.
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    const d = v instanceof Date ? v : ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]) : t ? new Date(t) : new Date(NaN);
    return formatDate(d, fmt);
  },
  default: (v, [fallback = ""]) => (asText(v).trim() === "" || (Array.isArray(v) && !v.length) ? fallback : v),
  replace: (v, [from = "", to = ""]) => (from ? asText(v).split(from).join(to) : asText(v)),
  truncate: (v, [n = "100"]) => {
    const t = asText(v);
    const k = Math.max(1, parseInt(n, 10) || 100);
    return t.length > k ? t.slice(0, k - 1).trimEnd() + "…" : t;
  },
  join: (v, [sep = ", "]) => asList(v).join(sep.replace(/\\n/g, "\n")),
  split: (v, [sep = ","]) => asText(v).split(sep).map((s) => s.trim()).filter(Boolean),
  first: (v) => asList(v)[0] ?? "",
  last: (v) => asList(v).slice(-1)[0] ?? "",
  blockquote: (v) => asList(v).map((t) => t.trim().split("\n").map((l) => `> ${l}`.trimEnd()).join("\n")).join("\n>\n"),
  list: (v) => asList(v).map((t) => `- ${t}`).join("\n"),
  wikilink: (v) => asList(v).map((t) => `[[${t}]]`).join(", "),
  link: (v, [text]) => (asText(v) ? `[${text || asText(v)}](${asText(v)})` : ""),
  hashtags: (v) => asList(v).map((t) => `#${t.trim().replace(/\s+/g, "-")}`).join(" "),
  yaml_list: (v) => asList(v).map((t) => `\n  - "${t.replace(/"/g, '\\"')}"`).join(""),
  yaml_string: (v) => `"${asText(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`,
};

/** Splits `name|f1|f2:"a b","c"` into the variable and its filters (quotes keep `|` and `:`). */
export function parseExpression(expr: string): { name: string; filters: { name: string; args: string[] }[] } {
  const parts: string[] = [];
  let cur = "";
  let q: string | null = null;
  for (const ch of expr) {
    if (q) {
      if (ch === q) q = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
    } else if (ch === "|") {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const [name, ...rest] = parts.map((p) => p.trim());
  const filters = rest.filter(Boolean).map((f) => {
    const i = f.indexOf(":");
    if (i < 0) return { name: f, args: [] };
    const argStr = f.slice(i + 1);
    const args: string[] = [];
    for (const m of argStr.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,]+)/g)) {
      const a = m[1] ?? m[2] ?? m[3] ?? "";
      args.push(m[3] !== undefined ? a.trim() : a.replace(/\\(.)/g, "$1"));
    }
    return { name: f.slice(0, i).trim(), args };
  });
  return { name, filters };
}

export function evaluate(expr: string, vars: Vars): string {
  const { name, filters } = parseExpression(expr);
  let v: Value = vars[name];
  for (const f of filters) {
    const fn = FILTERS[f.name];
    if (fn) v = fn(v, f.args);
  }
  return asText(v);
}

/** Renders `{{…}}` expressions. `{{{{` is not special; a lone `}}` is left as text. */
export function render(template: string, vars: Vars): string {
  return template.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr: string) => evaluate(expr, vars));
}

/** Problems worth showing in the editor: unknown variables or filters, unclosed tags. */
export function lint(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    const { name, filters } = parseExpression(m[1]);
    if (!(VARIABLES as readonly string[]).includes(name)) out.push(`Unknown variable {{${name}}}`);
    for (const f of filters) if (!FILTERS[f.name]) out.push(`Unknown filter |${f.name}`);
  }
  const opens = (template.match(/\{\{/g) || []).length;
  const closes = (template.match(/\}\}/g) || []).length;
  if (opens > closes) out.push("A {{ is never closed");
  return [...new Set(out)];
}
