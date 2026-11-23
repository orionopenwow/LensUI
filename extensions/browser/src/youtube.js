// YouTube transcripts, extension side. Pure functions (no chrome.*), so they run under `bun test`.
//
// The page already loads its caption tracks: `src/content/ytPage.js` (injected into the YouTube
// tab after the user clicks "Get transcript") reads them from the player and fetches the chosen
// track from youtube.com itself. These functions turn that into timestamped text, Markdown, SRT
// and a Shelf item.

export const MAX_TRANSCRIPT_CHARS = 400_000;

export function videoIdOf(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    if (host !== "youtube.com") return null;
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = /^\/(shorts|live|embed)\/([\w-]{6,})/.exec(u.pathname);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

export function isYoutubeVideoUrl(url) {
  return !!videoIdOf(url);
}

/**
 * Picks a caption track: a human-made track in the preferred language, then an automatic one
 * in that language, then English, then the first.
 * tracks: [{ languageCode, name, kind? ("asr" = auto-generated), baseUrl }]
 */
export function pickTrack(tracks, preferLang = "en") {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const base = (l) => String(l || "").toLowerCase().split("-")[0];
  const want = base(preferLang);
  const human = (t) => t.kind !== "asr";
  return (
    tracks.find((t) => base(t.languageCode) === want && human(t)) ||
    tracks.find((t) => base(t.languageCode) === want) ||
    tracks.find((t) => base(t.languageCode) === "en" && human(t)) ||
    tracks.find((t) => base(t.languageCode) === "en") ||
    tracks.find(human) ||
    tracks[0]
  );
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function tidy(text) {
  // Tags out first, then entities (YouTube's XML formats are sometimes escaped twice).
  const once = decodeEntities(String(text).replace(/<[^>]*>/g, ""));
  return decodeEntities(once).replace(/\s+/g, " ").trim();
}

/** YouTube's `fmt=json3` format: { events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] }. */
export function parseJson3(text) {
  let data;
  try {
    data = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    return [];
  }
  const out = [];
  for (const ev of data?.events ?? []) {
    if (!Array.isArray(ev.segs)) continue;
    const t = tidy(ev.segs.map((s) => s.utf8 ?? "").join(""));
    if (!t) continue;
    out.push({ start: (ev.tStartMs ?? 0) / 1000, dur: (ev.dDurationMs ?? 0) / 1000, text: t });
  }
  return out;
}

/**
 * The XML formats: srv3 (`<timedtext><body><p t="ms" d="ms">…<s>…</s></p>`) and the classic
 * srv1 (`<transcript><text start="s" dur="s">…</text>`). Regex-based: service workers have no DOMParser.
 */
export function parseTimedTextXml(xml) {
  const out = [];
  const s = String(xml);
  const attr = (attrs, name) => {
    const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
    return m ? Number(m[1]) : NaN;
  };
  for (const m of s.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const t = tidy(m[2]);
    if (!t) continue;
    const start = attr(m[1], "t");
    const dur = attr(m[1], "d");
    out.push({ start: (Number.isFinite(start) ? start : 0) / 1000, dur: (Number.isFinite(dur) ? dur : 0) / 1000, text: t });
  }
  if (out.length) return out;
  for (const m of s.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const t = tidy(m[2]);
    if (!t) continue;
    const start = attr(m[1], "start");
    const dur = attr(m[1], "dur");
    out.push({ start: Number.isFinite(start) ? start : 0, dur: Number.isFinite(dur) ? dur : 0, text: t });
  }
  return out;
}

/** Either format, by sniffing. */
export function parseCaptions(body) {
  const t = String(body ?? "").trimStart();
  if (t.startsWith("{")) return parseJson3(t);
  if (t.startsWith("<")) return parseTimedTextXml(t);
  return [];
}

/**
 * Joins caption fragments into readable paragraphs: break at a sentence end after ~`every`
 * seconds, after a pause of more than `pause` seconds, or after 2×`every` regardless.
 */
export function paragraphs(segments, every = 30, pause = 8) {
  const out = [];
  let cur = null;
  let prevEnd = 0;
  for (const s of segments) {
    if (cur && s.start - prevEnd > pause) {
      out.push(cur);
      cur = null;
    }
    if (!cur) cur = { start: s.start, text: s.text };
    else cur.text += " " + s.text;
    prevEnd = s.start + (s.dur || 0);
    const endsSentence = /[.!?…]["')\]]?$/.test(s.text);
    if ((prevEnd - cur.start >= every && endsSentence) || s.start - cur.start >= every * 2) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function formatTimestamp(sec) {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? h + ":" : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function toSrt(segments) {
  return segments
    .map((s, i) => {
      const next = segments[i + 1];
      const end = s.dur > 0 ? s.start + s.dur : next ? next.start : s.start + 2;
      return `${i + 1}\n${srtTime(s.start)} --> ${srtTime(end)}\n${s.text}\n`;
    })
    .join("\n");
}

export function toPlainText(segments) {
  return paragraphs(segments).map((p) => p.text).join("\n\n");
}

/** Link to a moment: the watch URL with `t=<seconds>s`. */
export function timeLink(url, sec) {
  const id = videoIdOf(url);
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&t=${Math.floor(sec)}s`;
}

/**
 * Markdown with a header and clickable timestamps per paragraph.
 * t = { meta: { title, channel, lengthSeconds, videoId }, url, language, auto, segments }
 */
export function toMarkdown(t) {
  const meta = t.meta || {};
  const lines = [`# ${meta.title || "YouTube video"}`];
  const bits = [];
  if (meta.channel) bits.push(meta.channel);
  if (meta.lengthSeconds) bits.push(formatTimestamp(meta.lengthSeconds));
  if (t.language) bits.push(`${t.language}${t.auto ? " (auto captions)" : ""}`);
  if (bits.length) lines.push(bits.join(" · "));
  if (t.url) lines.push(`Source: <${t.url}>`);
  lines.push("");
  for (const p of paragraphs(t.segments || [])) {
    const link = timeLink(t.url, p.start);
    const stamp = link ? `[${formatTimestamp(p.start)}](${link})` : formatTimestamp(p.start);
    lines.push(`**${stamp}** ${p.text}`, "");
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** The Shelf item ("transcript" kind) with title, URL and channel. */
export function transcriptShelfItem(t) {
  const md = toMarkdown(t);
  const text = md.length > MAX_TRANSCRIPT_CHARS ? md.slice(0, MAX_TRANSCRIPT_CHARS) + "\n\n… (transcript trimmed)" : md;
  const tags = ["youtube", "transcript"];
  if (t.meta?.channel) tags.push(String(t.meta.channel).slice(0, 32));
  return { kind: "transcript", title: `${t.meta?.title || "YouTube video"} — transcript`, text, url: t.url, tags };
}

export function transcriptSummary(t) {
  const words = (t.segments || []).reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  return { words, approxTokens: Math.ceil(toPlainText(t.segments || []).length / 4), segments: (t.segments || []).length };
}
