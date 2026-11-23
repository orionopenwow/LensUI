// Local BM25 search over the Guide index. No network, no model: this is what answers when AI is
// off, and what grounds the AI when it's on.
import type { GuideEntry, GuideIndex, GuideKind } from "./types";

const STOP = new Set(
  "a an and are as at be by can could do does for from get how i if in into is it its me my of on or please should so that the their them then there these this to turn up use using want way what when where which who why will with would you your lens change make set enable turn put need like".split(
    " "
  )
);

/** Words people say → words the index uses. Applied to queries and documents alike. */
const SYNONYMS: Record<string, string> = {
  colour: "color",
  colours: "color",
  cursor: "pointer",
  cursors: "pointer",
  mouse: "pointer",
  screensaver: "idle",
  background: "wallpaper",
  backgrounds: "wallpaper",
  transparency: "opacity",
  transparent: "opacity",
  see: "opacity",
  shortcut: "hotkey",
  shortcuts: "hotkey",
  keybind: "hotkey",
  keyboard: "hotkey",
  hotkeys: "hotkey",
  revert: "restore",
  undo: "restore",
  reset: "restore",
  backup: "back",
  uninstall: "remove",
  corner: "corners",
  look: "theme",
  skin: "theme",
  themes: "theme",
  palette: "palette",
  launcher: "launcher",
  clipboard: "clipboard",
  clip: "clipboard",
  clips: "clipboard",
  speech: "voice",
  talk: "voice",
  dictate: "voice",
  microphone: "voice",
  mic: "voice",
  chrome: "browser",
  edge: "browser",
  firefox: "browser",
  extension: "browser",
  explorer: "explorer",
  subtitles: "transcription",
  transcript: "transcription",
  transcribe: "transcription",
  captions: "transcription",
  claude: "claude",
  ollama: "local",
  model: "local",
  llm: "local",
  ai: "ai",
  privacy: "privacy",
  private: "privacy",
  border: "borders",
  outline: "borders",
  dim: "dim",
  darken: "dim",
  fade: "dim",
  desktops: "workspaces",
  workspace: "workspaces",
  virtual: "workspaces",
  monitors: "monitor",
  screens: "monitor",
  screen: "monitor",
  display: "monitor",
  move: "drag",
  resize: "drag",
  minimize: "minimise",
  maximize: "maximise",
  sand: "sand",
  animated: "playground",
  live: "playground",
  living: "playground",
  scene: "playground",
  scenes: "playground",
  updates: "update",
  crash: "crash",
  notification: "notifications",
  disturb: "dnd",
  dnd: "dnd",
  quiet: "dnd",
  pin: "pin",
  top: "top",
};

/** Very small English stemmer: enough to match "styles"/"style", "snapping"/"snap". */
function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.length > 4 && w.endsWith("es") && /(ch|sh|x|s)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  return w;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/)) {
    if (!raw || STOP.has(raw) || raw.length < 2) continue;
    const syn = SYNONYMS[raw] ?? raw;
    out.push(stem(syn));
  }
  return out;
}

/** Strip the conversational wrapper: "hey lens, how do I make the dock thinner?" → "make the dock thinner". */
export function normalizeQuestion(q: string): string {
  return q
    .trim()
    .replace(/^(hey\s+)?lens[,:]?\s+/i, "")
    .replace(/^(how\s+(do|can|would|should)\s+i|how\s+to|where\s+(is|are|do\s+i\s+find|can\s+i\s+find)|what\s+(is|are|does)|can\s+i|is\s+there\s+(a|an)?|i\s+want\s+to|help\s+me)\s+/i, "")
    .replace(/[?!.]+$/, "")
    .trim();
}

const FIELD_WEIGHT = { title: 3, path: 1.5, text: 1 } as const;

/** Settings and lessons answer "how do I" questions better than raw docs. */
const KIND_BOOST: Record<GuideKind, number> = {
  setting: 1.25,
  card: 1.35,
  tab: 1.0,
  lesson: 1.15,
  command: 1.0,
  pack: 1.0,
  "dock-style": 1.3,
  scene: 1.0,
  hotkey: 0.95,
  doc: 0.8,
};

interface Doc {
  entry: GuideEntry;
  tf: Map<string, number>;
  len: number;
}

export interface SearchHit {
  entry: GuideEntry;
  score: number;
}

export interface SearchOptions {
  limit?: number;
  kinds?: GuideKind[];
}

export class GuideSearch {
  private docs: Doc[];
  private df = new Map<string, number>();
  private avgLen: number;
  private readonly k1 = 1.2;
  private readonly b = 0.5;

  constructor(readonly index: Pick<GuideIndex, "entries">) {
    this.docs = index.entries.map((entry) => {
      const tf = new Map<string, number>();
      const add = (text: string, w: number) => {
        for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + w);
      };
      add(entry.title, FIELD_WEIGHT.title);
      add(entry.path.join(" "), FIELD_WEIGHT.path);
      add(entry.text, FIELD_WEIGHT.text);
      if (entry.examples) add(entry.examples.join(" "), 1.5);
      let len = 0;
      for (const v of tf.values()) len += v;
      return { entry, tf, len };
    });
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  private titleCache = new Map<string, string[]>();
  private titleTokens(e: GuideEntry): string[] {
    let t = this.titleCache.get(e.id);
    if (!t) {
      t = [...new Set(tokenize(e.title))];
      this.titleCache.set(e.id, t);
    }
    return t;
  }

  search(query: string, opts: SearchOptions = {}): SearchHit[] {
    const terms = [...new Set(tokenize(normalizeQuestion(query)))];
    if (!terms.length) return [];
    const N = this.docs.length;
    const hits: SearchHit[] = [];
    for (const d of this.docs) {
      if (opts.kinds && !opts.kinds.includes(d.entry.kind)) continue;
      let score = 0;
      let matched = 0;
      for (const t of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        matched++;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        score += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avgLen)));
      }
      if (!score) continue;
      // Reward entries that cover more of the question, and exact title phrase matches.
      score *= 0.6 + 0.4 * (matched / terms.length);
      const title = d.entry.title.toLowerCase();
      const q = normalizeQuestion(query).toLowerCase();
      const multiWord = title.includes(" ") || title === q;
      if (q.length > 3 && multiWord && (q.includes(title) || title.includes(q))) score *= 1.3;
      // Title precision: prefer "Lens Wallpaper" over "Follow wallpaper accent" for "wallpaper".
      const tt = this.titleTokens(d.entry);
      if (tt.length) {
        const hit = tt.filter((t) => terms.includes(t)).length;
        score *= 1 + 1.0 * (hit / tt.length);
      }
      score *= KIND_BOOST[d.entry.kind] ?? 1;
      hits.push({ entry: d.entry, score });
    }
    hits.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
    return hits.slice(0, opts.limit ?? 8);
  }
}

let shared: GuideSearch | null = null;
/** One search instance per index object (the index is ~500 entries; building takes a few ms). */
export function searchFor(index: GuideIndex): GuideSearch {
  if (!shared || shared.index !== index) shared = new GuideSearch(index);
  return shared;
}
