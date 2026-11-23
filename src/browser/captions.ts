// YouTube caption tracks → transcript cues, and exports as text, SRT and Markdown.
// The page agent fetches the json3 track the player itself uses; parsing happens here.

export interface Cue {
  start: number; // seconds
  end: number;
  text: string;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

/** json3: `{ events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] }`. Auto captions repeat words
 * across "append" events, so empty and newline-only events are dropped and cues are merged. */
export function parseJson3(body: string): Cue[] {
  let data: any;
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  const events: any[] = Array.isArray(data?.events) ? data.events : [];
  const cues: Cue[] = [];
  for (const e of events) {
    if (!Array.isArray(e?.segs) || typeof e.tStartMs !== "number") continue;
    const text = decode(e.segs.map((s: any) => (typeof s?.utf8 === "string" ? s.utf8 : "")).join("").replace(/\s+/g, " ").trim());
    if (!text) continue;
    const start = e.tStartMs / 1000;
    const end = start + (typeof e.dDurationMs === "number" ? e.dDurationMs : 2000) / 1000;
    const prev = cues[cues.length - 1];
    if (prev && prev.text === text) {
      prev.end = Math.max(prev.end, end);
      continue;
    }
    if (prev && prev.end > start) prev.end = start;
    cues.push({ start, end, text });
  }
  return cues;
}

/** Older XML timedtext: `<text start="1.2" dur="3.4">Hello</text>`. */
export function parseTimedText(xml: string): Cue[] {
  const cues: Cue[] = [];
  const re = /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const start = Number(m[1]);
    const text = decode(m[3].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (text) cues.push({ start, end: start + Number(m[2] || 2), text });
  }
  return cues;
}

export function parseCaptions(body: string): Cue[] {
  const t = body.trim();
  return t.startsWith("{") ? parseJson3(t) : parseTimedText(t);
}

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");

/** 0:42, 12:05, 1:02:03 */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  return `${pad(ms / 3600000)}:${pad((ms % 3600000) / 60000)}:${pad((ms % 60000) / 1000)},${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
}

export function toText(cues: Cue[]): string {
  return cues.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
}

/** Markdown with a timestamp per paragraph (paragraphs break on pauses or every ~45 s). */
export function toMarkdown(cues: Cue[], meta: { title?: string; url?: string; author?: string } = {}): string {
  const head = [`# ${meta.title || "Transcript"}`, meta.author ? `*${meta.author}*` : "", meta.url ? `<${meta.url}>` : ""].filter(Boolean).join("\n\n");
  const paras: { at: number; text: string[] }[] = [];
  let last = -Infinity;
  for (const c of cues) {
    const cur = paras[paras.length - 1];
    if (!cur || c.start - last > 4 || c.start - cur.at > 45) paras.push({ at: c.start, text: [c.text] });
    else cur.text.push(c.text);
    last = c.end;
  }
  return `${head}\n\n${paras.map((p) => `**[${clock(p.at)}]** ${p.text.join(" ")}`).join("\n\n")}\n`;
}

/** The cue playing at `t`, for highlighting while the video plays. */
export function cueAt(cues: Cue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
