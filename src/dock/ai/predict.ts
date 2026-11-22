/**
 * Suggested apps: a tiny local predictor with no AI model. It learns from app launches only (which app,
 * what hour, what weekday) and never stores window titles or files. Everything stays in this window's
 * local storage; "Forget" clears it.
 *
 * score = frequency × time-of-day fit × weekday fit × recency, all with exponential decay so old habits fade.
 */

export interface AppStats {
  /** Stable app key, e.g. the lower-cased exe or shortcut path. */
  key: string;
  name: string;
  path: string;
  /** Decayed launch count. */
  count: number;
  /** Decayed launches per hour of day (24). */
  hours: number[];
  /** Decayed launches per weekday (7, Sunday = 0). */
  days: number[];
  /** Unix ms of the last launch. */
  last: number;
  /** Unix ms the decay was last applied. */
  decayedAt: number;
}

export interface PredictModel {
  v: 1;
  apps: Record<string, AppStats>;
}

export interface Suggestion {
  key: string;
  name: string;
  path: string;
  score: number;
  /** Plain-words reason for the tooltip. */
  why: string;
}

export const HALF_LIFE_DAYS = 14;
export const MAX_APPS = 200;
/** Ignore apps launched fewer times than this (decayed). Prevents one-off launches from showing up. */
export const MIN_COUNT = 3;
const DAY = 86_400_000;

export function emptyModel(): PredictModel {
  return { v: 1, apps: {} };
}

function decayFactor(fromMs: number, toMs: number): number {
  const days = Math.max(0, (toMs - fromMs) / DAY);
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

function decay(a: AppStats, now: number): AppStats {
  const f = decayFactor(a.decayedAt, now);
  if (f >= 0.9999) return a;
  return {
    ...a,
    count: a.count * f,
    hours: a.hours.map((h) => h * f),
    days: a.days.map((d) => d * f),
    decayedAt: now,
  };
}

/** Records one launch. Returns a new model (pure). */
export function recordLaunch(model: PredictModel, app: { key: string; name: string; path: string }, at: Date): PredictModel {
  const now = at.getTime();
  const key = app.key.toLowerCase();
  const prev = model.apps[key];
  const base: AppStats = prev
    ? decay(prev, now)
    : { key, name: app.name, path: app.path, count: 0, hours: Array(24).fill(0), days: Array(7).fill(0), last: 0, decayedAt: now };
  const hours = base.hours.slice();
  const days = base.days.slice();
  hours[at.getHours()] += 1;
  days[at.getDay()] += 1;
  const apps = { ...model.apps, [key]: { ...base, name: app.name, path: app.path, count: base.count + 1, hours, days, last: now } };

  // Keep the store bounded: drop the weakest apps.
  const keys = Object.keys(apps);
  if (keys.length > MAX_APPS) {
    keys
      .sort((a, b) => apps[a].count - apps[b].count)
      .slice(0, keys.length - MAX_APPS)
      .forEach((k) => delete apps[k]);
  }
  return { v: 1, apps };
}

/** Share of launches within ±1 hour of `hour`, smoothed so a single launch can't dominate. */
function hourFit(hours: number[], hour: number): number {
  const total = hours.reduce((s, h) => s + h, 0);
  if (total <= 0) return 0;
  const near = hours[(hour + 23) % 24] * 0.5 + hours[hour] + hours[(hour + 1) % 24] * 0.5;
  // Uniform use gives 2/24 ≈ 0.083; strong habit approaches 1.
  return (near + 0.25) / (total + 3);
}

/** 1 when this app is used evenly across the week; above 1 when today (or today's weekday/weekend group) is typical. */
function dayFit(days: number[], day: number): number {
  const total = days.reduce((s, d) => s + d, 0);
  if (total <= 0) return 1;
  const weekend = day === 0 || day === 6;
  const group = days.filter((_, i) => (i === 0 || i === 6) === weekend).reduce((s, d) => s + d, 0);
  const groupFit = ((group + 0.5) / (total + 1)) / ((weekend ? 2 : 5) / 7);
  const exactFit = ((days[day] + 0.2) / (total + 1.4)) * 7;
  return Math.min(2.5, Math.max(0.15, 0.6 * groupFit + 0.4 * exactFit));
}

function recency(last: number, now: number): number {
  const days = Math.max(0, (now - last) / DAY);
  return 0.55 + 0.45 * Math.pow(0.5, days / 3);
}

function fmtHour(h: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${ampm}`;
}

export function explain(a: AppStats, at: Date): string {
  const peak = a.hours.indexOf(Math.max(...a.hours));
  const weekday = a.days.slice(1, 6).reduce((s, d) => s + d, 0);
  const weekend = a.days[0] + a.days[6];
  const when = weekday > weekend * 2.5 ? "on weekdays" : weekend > weekday ? "at weekends" : "most days";
  const near = Math.abs(peak - at.getHours()) <= 1 || Math.abs(peak - at.getHours()) >= 23;
  return near
    ? `You usually open ${a.name} around ${fmtHour(peak)} ${when}.`
    : `You open ${a.name} often ${when}.`;
}

/**
 * Top suggestions for this moment. `exclude` holds keys already visible in the Dock (pinned or running),
 * so suggestions are always something new.
 */
export function suggest(model: PredictModel, at: Date, opts: { limit?: number; exclude?: Iterable<string> } = {}): Suggestion[] {
  const now = at.getTime();
  const ex = new Set([...(opts.exclude ?? [])].map((k) => k.toLowerCase()));
  const hour = at.getHours();
  const day = at.getDay();
  const out: Suggestion[] = [];
  for (const raw of Object.values(model.apps)) {
    if (ex.has(raw.key)) continue;
    const a = decay(raw, now);
    if (a.count < MIN_COUNT) continue;
    const freq = Math.log2(1 + a.count);
    const score = freq * hourFit(a.hours, hour) * dayFit(a.days, day) * recency(a.last, now);
    out.push({ key: a.key, name: a.name, path: a.path, score, why: explain(a, at) });
  }
  return out.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name)).slice(0, Math.max(0, Math.min(3, opts.limit ?? 3)));
}

// ---------------------------------------------------------------- storage

export const STORAGE_KEY = "lens.ai.predict.v1";

export function loadModel(): PredictModel {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyModel();
    const m = JSON.parse(raw);
    if (m && m.v === 1 && m.apps && typeof m.apps === "object") return m as PredictModel;
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return emptyModel();
}

export function saveModel(m: PredictModel): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function forgetModel(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
