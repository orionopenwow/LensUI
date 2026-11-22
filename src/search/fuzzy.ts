/**
 * Lens fuzzy matcher. One scoring function used by every search surface.
 *
 * Score bands (higher is better, 0 = no match):
 *   1000 exact · 900 prefix · 800 word prefix · 760–780 acronym ("vsc" → Visual Studio Code)
 *   700 all words matched · 600 substring · 150–420 in-order subsequence · 260–340 one or two typos
 */

const COMBINING = /[̀-ͯ]/g;

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(COMBINING, "")
    .toLowerCase()
    .replace(/\.(exe|lnk|url)$/i, "")
    .replace(/[_\-–—·|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WORD_SPLIT = /[\s.\\/:(),+&]+/;

export function words(text: string): string[] {
  return normalize(text).split(WORD_SPLIT).filter(Boolean);
}

/** Initials of words plus camelCase / PascalCase humps: "Visual Studio Code" → "vsc", "PowerToys" → "pt". */
export function acronym(original: string): string {
  const parts = original
    .replace(/\.(exe|lnk|url)$/i, "")
    .split(/[\s_\-.\\/:()·,+&]+/)
    .filter(Boolean);
  let out = "";
  for (const p of parts) {
    out += p[0];
    for (let i = 1; i < p.length; i++) {
      const ch = p[i];
      if (ch >= "A" && ch <= "Z" && p[i - 1] >= "a" && p[i - 1] <= "z") out += ch;
      else if (ch >= "0" && ch <= "9" && !(p[i - 1] >= "0" && p[i - 1] <= "9")) out += ch;
    }
  }
  return normalize(out).replace(/\s/g, "");
}

/** Damerau–Levenshtein (optimal string alignment) with an early exit above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

function subsequenceScore(q: string, t: string): number {
  let ti = 0;
  let first = -1;
  let last = -1;
  let gaps = 0;
  let wordStarts = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    if (first < 0) {
      // The first letter must start a word: "vsc" should not match inside "privacy".
      if (found !== 0 && t[found - 1] !== " ") {
        const ws = t.indexOf(" " + ch, ti);
        if (ws < 0) return 0;
        first = ws + 1;
        last = first;
        ti = first + 1;
        wordStarts++;
        continue;
      }
      first = found;
    } else gaps += found - last - 1;
    if (found === 0 || t[found - 1] === " ") wordStarts++;
    last = found;
    ti = found + 1;
  }
  const span = last - first + 1;
  const qlen = q.replace(/ /g, "").length;
  // Reject scattered matches ("ae" anywhere in a long name is noise).
  if (qlen < 3 || span > qlen * 4 + 4) return 0;
  return Math.max(150, 420 - gaps * 9 - first * 3 + wordStarts * 12);
}

/** Scores one query against one text. Pass a pre-normalized query for speed. */
export function scoreText(query: string, text: string): number {
  const q = normalize(query);
  if (!q || !text) return 0;
  const t = normalize(text);
  if (!t) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 900 - Math.min(60, t.length - q.length);

  const ws = t.split(WORD_SPLIT).filter(Boolean);
  const qTokens = q.split(" ").filter(Boolean);

  for (let i = 0; i < ws.length; i++) {
    if (ws[i].startsWith(q)) return 800 - Math.min(40, i * 6);
  }

  const qCompact = q.replace(/ /g, "");
  if (qCompact.length >= 2) {
    const ac = acronym(text);
    if (ac === qCompact) return 780;
    if (ac.startsWith(qCompact)) return 760;
  }

  if (qTokens.length > 1) {
    const allPrefix = qTokens.every((tok) => ws.some((w) => w.startsWith(tok)));
    if (allPrefix) return 720;
    const allIn = qTokens.every((tok) => t.includes(tok));
    if (allIn) return 680;
  }

  const pos = t.indexOf(q);
  if (pos >= 0) return 600 - Math.min(80, pos * 2);

  const sub = subsequenceScore(q, t);

  // Typo tolerance for real words (≥ 4 letters): compare against each word and the word-prefix
  // of the same length, so "chorme" → Chrome and "photshop" → Photoshop.
  let typo = 0;
  if (qCompact.length >= 4 && qTokens.length === 1) {
    const maxEd = qCompact.length >= 8 ? 2 : 1;
    for (const w of ws) {
      // People rarely mistype the first letter; requiring it keeps "code" from matching "mode".
      if (w[0] !== qCompact[0]) continue;
      const d1 = editDistance(qCompact, w, maxEd);
      const d2 = w.length > qCompact.length ? editDistance(qCompact, w.slice(0, qCompact.length), maxEd) : d1;
      const d = Math.min(d1, d2);
      if (d <= maxEd) typo = Math.max(typo, 340 - d * 40);
    }
  }
  return Math.max(sub, typo);
}

/** Best score across several fields with per-field weights. */
export function scoreFields(query: string, fields: [string | undefined | null, number][]): number {
  let best = 0;
  for (const [text, weight] of fields) {
    if (!text) continue;
    const s = scoreText(query, text) * weight;
    if (s > best) best = s;
  }
  return best;
}
