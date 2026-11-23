// Browser port of Lens's offline "script" intent engine (src-tauri/src/ai/intent.rs and calc.rs).
// Same rules, same order, same outputs: tools/site/test/intent.test.mjs replays the phrase table
// from intent.rs against this file, so the site demo can't drift from the app.
// No network, no model: it only turns everyday requests into a structured action.

const PACK_ALIASES = [
  [["obsidian", "default", "lens"], "obsidian"],
  [["windows mesh", "mesh", "windows"], "windows-mesh"],
  [["graphite"], "graphite"],
  [["midnight"], "midnight"],
  [["catppuccin mocha", "catppuccin", "mocha"], "catppuccin-mocha"],
  [["tokyo night", "tokyonight", "tokyo"], "tokyo-night"],
  [["nord frost", "nord"], "nord-frost"],
  [["dracula glass", "dracula"], "dracula-glass"],
  [["gruvbox warm", "gruvbox"], "gruvbox-warm"],
  [["kanagawa wave", "kanagawa"], "kanagawa-wave"],
  [["rose pine", "rosé pine", "rose-pine", "rosepine"], "rose-pine"],
  [["everforest dark", "everforest"], "everforest-dark"],
  [["hyprland neon", "hyprland", "neon"], "hyprland-neon"],
  [["sequoia frost", "sequoia"], "sequoia-frost"],
  [["cyberpunk amber", "cyberpunk", "amber"], "cyberpunk-amber"],
  [["solarized matte", "solarized"], "solarized-matte"],
  [["alabaster daylight", "alabaster", "daylight"], "alabaster-daylight"],
  [["paper minimal", "paper"], "paper-minimal"],
];

const SETTINGS_PAGES = [
  [["display", "screen", "monitor", "resolution"], "ms-display"],
  [["sound", "audio"], "ms-sound"],
  [["wifi", "wi-fi", "network", "internet"], "ms-network"],
  [["bluetooth", "devices"], "ms-bluetooth"],
  [["battery", "power"], "ms-power"],
  [["windows update", "update", "updates"], "ms-update"],
  [["apps", "installed apps", "programs"], "ms-apps"],
  [["privacy"], "ms-privacy"],
  [["mouse"], "ms-mouse"],
  [["keyboard", "typing"], "ms-keyboard"],
  [["theme", "themes", "appearance", "look"], "theme"],
  [["dock"], "dock"],
  [["top bar", "topbar", "bar"], "topbar"],
  [["wallpaper", "background", "desktop"], "wallpaper"],
  [["window", "windows style", "window style", "frames"], "windows"],
  [["workspaces", "workspace"], "workspaces"],
  [["tiling", "layouts"], "tiling"],
  [["notifications", "notification"], "notifications"],
  [["plugins", "plugin", "extensions"], "plugins"],
  [["ai", "lens intelligence", "intelligence", "assistant", "claude"], "ai"],
  [["agents", "mcp"], "agents"],
  [["cursor", "cursors", "pointer"], "cursor"],
  [["lens", "control center", "settings"], "home"],
];

const POLITE_PREFIXES = ["hey lens, ", "ok lens, ", "lens, ", "hey lens ", "ok lens ", "lens ", "please ", "can you please ", "could you please ", "can you ", "could you ", "would you ", "will you ", "i want to ", "i'd like to ", "i would like to ", "i need to ", "let's ", "lets ", "go ahead and ", "quickly ", "just "];
const POLITE_SUFFIXES = [" please", " for me", " now", " thanks", " thank you", " right now"];

const trimEnd = (s, chars) => { let e = s.length; while (e > 0 && chars.includes(s[e - 1])) e--; return s.slice(0, e); };
const trimStart = (s, chars) => { let i = 0; while (i < s.length && chars.includes(s[i])) i++; return s.slice(i); };
const stripSuffix = (s, x) => (s.endsWith(x) ? s.slice(0, s.length - x.length) : null);
const stripPrefix = (s, x) => (s.startsWith(x) ? s.slice(x.length) : null);
const trimEndStr = (s, x) => { while (x && s.endsWith(x)) s = s.slice(0, s.length - x.length); return s; };
const trimStartStr = (s, x) => { while (x && s.startsWith(x)) s = s.slice(x.length); return s; };

export function normalize(text) {
  let t = text.trim().toLowerCase().replace(/’/g, "'");
  t = t.split(": ").join(" ");
  t = trimEnd(t, "?!. ").trim();
  t = trimStart(t, "/> ");
  const l = stripPrefix(t, "lens,");
  if (l !== null) t = l.trim();
  for (;;) {
    const before = t;
    for (const p of POLITE_PREFIXES) { const r = stripPrefix(t, p); if (r !== null) t = r.trim(); }
    for (const s of POLITE_SUFFIXES) { const r = stripSuffix(t, s); if (r !== null) t = trimEnd(r.trim(), ",").trim(); }
    if (t === before) break;
  }
  return t.split(/\s+/).filter(Boolean).join(" ");
}

const titleCase = (s) => s.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const stripAny = (t, prefixes) => { for (const p of prefixes) if (t.startsWith(p)) return t.slice(p.length).trim(); return null; };

function cleanAppName(raw) {
  let n = raw.trim();
  for (const p of ["the ", "my ", "up ", "app ", "application "]) { const r = stripPrefix(n, p); if (r !== null) n = r.trim(); }
  for (const s of [" app", " application", " window", " program", " for me", " up"]) { const r = stripSuffix(n, s); if (r !== null) n = r.trim(); }
  if (!n || new TextEncoder().encode(n).length > 60 || /[\u0000-\u001f\u007f]/.test(n)) return null;
  return n;
}

export function findPack(name) {
  const n = trimEndStr(trimEndStr(name.trim(), " theme"), " pack").trim();
  const hit = PACK_ALIASES.find(([a, id]) => a.includes(n) || id === n);
  return hit ? hit[1] : null;
}
function findSettingsPage(name) {
  const n = name.trim();
  const hit = SETTINGS_PAGES.find(([a, id]) => a.includes(n) || id === n);
  return hit ? hit[1] : null;
}

function parseLevel(s) {
  let t = trimEndStr(trimEnd(s.trim(), "%").trim(), " percent").trim();
  t = trimEnd((stripPrefix(t, "to ") ?? t).trim(), "%").trim();
  let v;
  if (["max", "maximum", "full", "100"].includes(t)) v = 100;
  else if (t === "half") v = 50;
  else if (["min", "minimum", "zero"].includes(t)) v = 0;
  else { if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null; v = parseFloat(t); }
  return v >= 0 && v <= 100 ? Math.round(v) : null;
}

function onOff(t) {
  const on = ["on", "enable", "enabled", "start", "activate", "turn on", "switch on", "begin"];
  const off = ["off", "disable", "disabled", "stop", "deactivate", "turn off", "switch off", "end", "exit", "leave"];
  const m = (w) => t === w || t.startsWith(w + " ") || t.endsWith(" " + w);
  if (on.some(m)) return true;
  if (off.some(m)) return false;
  return null;
}

// ---- calc ----------------------------------------------------------------------------------
export function formatNumber(v) {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? "not a number" : "infinity";
  if (v === Math.trunc(v) && Math.abs(v) < 1e15) return String(Math.trunc(v));
  let s = v.toFixed(10);
  s = trimEnd(trimEnd(s, "0"), ".");
  return s === "-0" ? "0" : s;
}

function tokenize(src) {
  const out = [];
  const c = [...src];
  let i = 0;
  const digit = (x) => x >= "0" && x <= "9";
  const alpha = (x) => /^[A-Za-z]$/.test(x);
  while (i < c.length) {
    const ch = c[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (digit(ch) || ch === ".") {
      const st = i;
      while (i < c.length && (digit(c[i]) || c[i] === "." || (c[i] === "," && i + 1 < c.length && digit(c[i + 1])))) i++;
      const raw = c.slice(st, i).filter((x) => x !== ",").join("");
      if (!/^(\d+\.?\d*|\.\d+)$/.test(raw)) return null;
      out.push({ n: parseFloat(raw) });
      continue;
    }
    if (alpha(ch)) {
      const st = i;
      while (i < c.length && alpha(c[i])) i++;
      const w = c.slice(st, i).join("").toLowerCase();
      const ops = { x: "*", times: "*", plus: "+", minus: "-", over: "/", mod: "m", of: "*" };
      out.push(ops[w] ? { op: ops[w] } : { id: w });
      continue;
    }
    if ("+-*/^%".includes(ch)) out.push({ op: ch });
    else if (ch === "×" || ch === "·") out.push({ op: "*" });
    else if (ch === "÷") out.push({ op: "/" });
    else if (ch === "(") out.push({ lp: 1 });
    else if (ch === ")") out.push({ rp: 1 });
    else return null;
    i++;
  }
  return out;
}

class Parser {
  constructor(toks) { this.t = toks; this.p = 0; this.d = 0; }
  peek() { return this.t[this.p]; }
  next() { return this.t[this.p++]; }
  expr() {
    let v = this.term(); if (v === null) return null;
    for (let k = this.peek(); k && (k.op === "+" || k.op === "-"); k = this.peek()) {
      this.p++; const r = this.term(); if (r === null) return null; v = k.op === "+" ? v + r : v - r;
    }
    return v;
  }
  term() {
    let v = this.power(); if (v === null) return null;
    for (;;) {
      const k = this.peek();
      if (k && (k.op === "*" || k.op === "/" || k.op === "m")) {
        this.p++; const r = this.power(); if (r === null) return null;
        if (k.op === "*") v *= r;
        else { if (r === 0) return null; v = k.op === "/" ? v / r : v % r; }
      } else if (k && (k.lp || k.id !== undefined)) {
        const r = this.power(); if (r === null) return null; v *= r;
      } else break;
    }
    return v;
  }
  power() {
    const b = this.unary(); if (b === null) return null;
    if (this.peek()?.op === "^") { this.p++; const e = this.power(); if (e === null) return null; return Math.pow(b, e); }
    return b;
  }
  unary() {
    const k = this.peek();
    if (k?.op === "-") { this.p++; const v = this.unary(); return v === null ? null : -v; }
    if (k?.op === "+") { this.p++; return this.unary(); }
    return this.postfix();
  }
  postfix() {
    let v = this.atom(); if (v === null) return null;
    while (this.peek()?.op === "%") { this.p++; v /= 100; }
    return v;
  }
  atom() {
    if (++this.d > 64) return null;
    const k = this.next(); let r = null;
    if (!k) return null;
    if (k.n !== undefined) r = k.n;
    else if (k.lp) { const v = this.expr(); if (v === null) return null; const n = this.next(); if (!n || !n.rp) return null; r = v; }
    else if (k.id !== undefined) {
      const name = k.id;
      if (name === "pi") r = Math.PI;
      else if (name === "e") r = Math.E;
      else if (["sqrt", "abs", "round", "floor", "ceil", "ln", "log", "sin", "cos", "tan"].includes(name)) {
        const a = this.atom(); if (a === null) return null;
        const rad = (a * Math.PI) / 180;
        r = { sqrt: a < 0 ? null : Math.sqrt(a), abs: Math.abs(a), round: Math.round(a), floor: Math.floor(a), ceil: Math.ceil(a), ln: Math.log(a), log: Math.log10(a), sin: Math.sin(rad), cos: Math.cos(rad), tan: Math.tan(rad) }[name];
        if (r === null) return null;
      } else return null;
    } else return null;
    this.d--;
    return r;
  }
}

export function evalMath(src) {
  if (src.length > 200) return null;
  const toks = tokenize(src);
  if (!toks || !toks.length || !toks.some((t) => t.n !== undefined || t.id === "pi")) return null;
  const p = new Parser(toks);
  const v = p.expr();
  if (v === null || p.p !== toks.length || !Number.isFinite(v)) return null;
  return v;
}

function looksLikeMath(src) {
  const t = src.trim();
  return !!t && /\d/.test(t) && [...t].some((c) => "+-*/^%×÷()".includes(c)) && [...t].every((c) => /\d/.test(c) || " .,+-*/^%×÷()x".includes(c));
}

const UNITS = [
  [["mm", "millimeter", "millimeters", "millimetre", "millimetres"], "mm", "len", 0.001],
  [["cm", "centimeter", "centimeters", "centimetre", "centimetres"], "cm", "len", 0.01],
  [["m", "meter", "meters", "metre", "metres"], "m", "len", 1],
  [["km", "kilometer", "kilometers", "kilometre", "kilometres", "k"], "km", "len", 1000],
  [["in", "inch", "inches", '"'], "in", "len", 0.0254],
  [["ft", "foot", "feet", "'"], "ft", "len", 0.3048],
  [["yd", "yard", "yards"], "yd", "len", 0.9144],
  [["mi", "mile", "miles"], "mi", "len", 1609.344],
  [["g", "gram", "grams"], "g", "mass", 1],
  [["kg", "kilogram", "kilograms", "kilo", "kilos"], "kg", "mass", 1000],
  [["lb", "lbs", "pound", "pounds"], "lb", "mass", 453.59237],
  [["oz", "ounce", "ounces"], "oz", "mass", 28.349523125],
  [["st", "stone", "stones"], "st", "mass", 6350.29318],
  [["c", "celsius", "°c", "centigrade"], "°C", "temp", 0],
  [["f", "fahrenheit", "°f"], "°F", "temp", 0],
  [["kelvin"], "K", "temp", 0],
  [["ml", "milliliter", "milliliters", "millilitre", "millilitres"], "ml", "vol", 0.001],
  [["l", "liter", "liters", "litre", "litres"], "l", "vol", 1],
  [["gal", "gallon", "gallons"], "gal", "vol", 3.785411784],
  [["floz", "fl oz", "fluid ounce", "fluid ounces"], "fl oz", "vol", 0.0295735295625],
  [["cup", "cups"], "cup", "vol", 0.2365882365],
  [["kmh", "km/h", "kph"], "km/h", "speed", 1 / 3.6],
  [["mph"], "mph", "speed", 0.44704],
  [["m/s", "mps"], "m/s", "speed", 1],
  [["knot", "knots", "kn"], "kn", "speed", 0.514444],
  [["b", "byte", "bytes"], "B", "data", 1],
  [["kb", "kilobyte", "kilobytes"], "KB", "data", 1024],
  [["mb", "megabyte", "megabytes"], "MB", "data", 1048576],
  [["gb", "gigabyte", "gigabytes", "gig", "gigs"], "GB", "data", 1073741824],
  [["tb", "terabyte", "terabytes"], "TB", "data", 1099511627776],
  [["sec", "secs", "second", "seconds", "s"], "s", "time", 1],
  [["min", "mins", "minute", "minutes"], "min", "time", 60],
  [["h", "hr", "hrs", "hour", "hours"], "h", "time", 3600],
  [["day", "days", "d"], "day", "time", 86400],
  [["week", "weeks", "wk"], "week", "time", 604800],
];

function findUnit(raw) {
  let r = trimEnd(raw.trim(), ".").toLowerCase();
  r = (stripPrefix(r, "degrees ") ?? stripPrefix(r, "degree ") ?? r).trim();
  const u = UNITS.find(([a]) => a.includes(r));
  return u ? { sym: u[1], dim: u[2], f: u[3] } : null;
}
const toC = (v, s) => (s === "°F" ? ((v - 32) * 5) / 9 : s === "K" ? v - 273.15 : v);
const fromC = (v, s) => (s === "°F" ? (v * 9) / 5 + 32 : s === "K" ? v + 273.15 : v);

function convert(value, from, to) {
  let f = findUnit(from), t = findUnit(to);
  if (!f || !t) return null;
  if (from.trim().toLowerCase() === "k" && t.dim === "temp") f = { sym: "K", dim: "temp", f: 0 };
  if (to.trim().toLowerCase() === "k" && f.dim === "temp") t = { sym: "K", dim: "temp", f: 0 };
  if (f.dim !== t.dim) return null;
  const result = f.dim === "temp" ? fromC(toC(value, f.sym), t.sym) : (value * f.f) / t.f;
  return { value, from: f.sym, to: t.sym, result };
}

function splitValueUnit(s) {
  s = s.trim();
  let end = 0;
  while (end < s.length && /[\d.,-]/.test(s[end])) end++;
  if (!end) return null;
  const num = s.slice(0, end).replace(/,/g, "");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(num)) return null;
  const unit = s.slice(end).trim();
  return unit ? [parseFloat(num), unit] : null;
}

function parseConversion(text) {
  let t = text.trim().toLowerCase();
  t = (stripPrefix(t, "convert ") ?? t).trim();
  t = stripPrefix(t, "how many ") ?? t;
  for (const sep of [" in ", " to ", " into ", " as ", " is "]) {
    const idx = t.indexOf(sep);
    if (idx < 0) continue;
    const left = t.slice(0, idx).trim(), right = t.slice(idx + sep.length).trim();
    const l = splitValueUnit(left);
    if (l) { const c = convert(l[0], l[1], right); if (c) return c; }
    const r = splitValueUnit(right);
    if (r) { const c = convert(r[0], r[1], left); if (c) return c; }
  }
  return null;
}

function parseDurationSecs(text) {
  const t = text.trim().toLowerCase();
  const fixed = { "half an hour": 1800, "half hour": 1800, "an hour": 3600, "one hour": 3600, "a minute": 60, "one minute": 60, "quarter of an hour": 900, "quarter hour": 900, "a quarter hour": 900 };
  if (fixed[t]) return fixed[t];
  let total = 0, found = false, i = 0;
  const c = [...t];
  const digit = (x) => /[0-9]/.test(x), alpha = (x) => /^[a-z]$/i.test(x);
  while (i < c.length) {
    if (digit(c[i]) || c[i] === ".") {
      const st = i;
      while (i < c.length && (digit(c[i]) || c[i] === ".")) i++;
      const ns = c.slice(st, i).join("");
      if (!/^(\d+\.?\d*|\.\d+)$/.test(ns)) return null;
      const n = parseFloat(ns);
      while (i < c.length && c[i] === " ") i++;
      const us = i;
      while (i < c.length && alpha(c[i])) i++;
      const unit = c.slice(us, i).join("");
      let mult;
      if (["s", "sec", "secs", "second", "seconds"].includes(unit)) mult = 1;
      else if (["", "m", "min", "mins", "minute", "minutes"].includes(unit)) mult = 60;
      else if (["h", "hr", "hrs", "hour", "hours"].includes(unit)) mult = 3600;
      else return null;
      total += n * mult; found = true;
    } else if (/\s/.test(c[i]) || c[i] === "," || c[i] === "&") i++;
    else {
      const st = i;
      while (i < c.length && alpha(c[i])) i++;
      const w = c.slice(st, i).join("");
      if (w !== "and" && w !== "for" && w !== "a") return null;
      if (i === st) i++;
    }
  }
  if (!found || total <= 0 || total > 7 * 86400) return null;
  return Math.round(total);
}

function describeDuration(secs) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const p = [];
  if (h) p.push(`${h} h`);
  if (m) p.push(`${m} min`);
  if (s || !p.length) p.push(`${s} s`);
  return p.join(" ");
}

// ---- intents -------------------------------------------------------------------------------
const I = (action, confidence, summary, args = {}) => ({ action, confidence, summary, args });

function parseMath(t) {
  const c = parseConversion(t);
  if (c) return I("convert", 0.97, `${formatNumber(c.value)} ${c.from} = ${formatNumber(Math.round(c.result * 1e4) / 1e4)} ${c.to}`, { value: c.value, from: c.from, to: c.to, result: c.result });
  const expr = stripAny(t, ["what's ", "what is ", "whats ", "calculate ", "calc ", "compute ", "solve ", "= ", "="]);
  const cand = expr ?? t;
  if (expr !== null || looksLikeMath(t) || cand.includes("% of ")) {
    const v = evalMath(cand);
    if (v !== null) return I("calculate", 0.97, `${cand} = ${formatNumber(v)}`, { expression: cand, result: v });
  }
  return null;
}

function parseTimer(t) {
  if (t === "pomodoro" || t === "start a pomodoro" || t === "start pomodoro") return I("start_timer", 0.95, "Start a 25 min focus timer", { seconds: 1500, label: "Pomodoro" });
  const rest = stripAny(t, ["set a timer for ", "set timer for ", "set a timer ", "set timer ", "start a timer for ", "start timer for ", "timer for ", "timer ", "remind me in ", "countdown "]);
  let dur, label = null;
  if (rest !== null) {
    let i = rest.indexOf(" to "); if (i < 0) i = rest.indexOf(" for ");
    if (i >= 0) { dur = rest.slice(0, i); label = rest.slice(i + 4).trim(); } else dur = rest;
  } else {
    const r = stripSuffix(t, " timer") ?? stripSuffix(t, " countdown");
    if (r === null) return null;
    dur = trimEndStr(trimStartStr(r, "a "), " long");
  }
  const secs = parseDurationSecs(dur.trim());
  if (secs === null) return null;
  const i = I("start_timer", 0.95, `Start a ${describeDuration(secs)} timer`, { seconds: secs });
  if (label) { i.summary += ` — ${label}`; i.args.label = label; }
  return i;
}

function parseColorMode(t) {
  const dark = ["dark mode", "dark theme", "go dark", "make it dark", "switch to dark", "switch to dark mode", "turn on dark mode", "enable dark mode", "dark mode on", "use dark mode", "turn off light mode", "light mode off", "night mode"];
  const light = ["light mode", "light theme", "go light", "make it light", "switch to light", "switch to light mode", "turn on light mode", "enable light mode", "light mode on", "use light mode", "turn off dark mode", "dark mode off", "day mode"];
  if (dark.includes(t)) return I("set_color_mode", 0.97, "Switch to dark mode", { mode: "dark" });
  if (light.includes(t)) return I("set_color_mode", 0.97, "Switch to light mode", { mode: "light" });
  if (["toggle dark mode", "toggle light mode", "toggle theme"].includes(t)) return I("set_color_mode", 0.9, "Toggle dark and light mode", { mode: "toggle" });
  return null;
}

function parseTheme(t) {
  const themed = t.includes("theme") || t.includes(" pack") || t.includes("skin") || t.includes("colors") || t.includes("colours");
  const rest = stripAny(t, ["apply the ", "apply ", "use the ", "use ", "switch theme to ", "change theme to ", "change the theme to ", "set theme to ", "set the theme to ", "theme to ", "theme ", "switch to the ", "switch to ", "try ", "make it ", "go "]) ?? t;
  let name = rest;
  for (const s of [" theme pack", " theme", " pack", " colors", " colours", " skin"]) name = trimEndStr(name, s);
  name = name.trim();
  const id = findPack(name);
  if (!id) return null;
  const generic = ["windows", "default", "lens", "paper", "neon", "amber", "daylight", "midnight", "mocha", "tokyo"].includes(name);
  if (generic && !themed) return null;
  const shown = titleCase(PACK_ALIASES.find(([, i]) => i === id)[0][0]);
  return I("set_theme_pack", themed ? 0.95 : 0.8, `Apply the ${shown} theme`, { id });
}

function parseToggles(t) {
  if (t.includes("focus mode") || t === "focus" || t === "start focusing" || t === "stop focusing" || t === "help me focus") {
    let enabled;
    if (t === "stop focusing") enabled = false;
    else if (["start focusing", "focus", "help me focus"].includes(t)) enabled = true;
    else enabled = onOff(t.replace("focus mode", "").trim()) ?? !t.includes("toggle");
    if (t.includes("toggle")) return I("set_focus_mode", 0.9, "Toggle focus mode");
    return I("set_focus_mode", 0.95, enabled ? "Turn on focus mode" : "Turn off focus mode", { enabled });
  }
  const w = ["do not disturb", "don't disturb", "dnd", "notifications", "notification"].find((x) => t.includes(x));
  if (w) {
    const rest = t.split(w).join("").trim();
    let enabled = onOff(rest);
    if (w.startsWith("notification")) {
      if (["mute", "silence", "hide", "pause", "block", "stop"].some((v) => rest.startsWith(v))) enabled = true;
      else if (["unmute", "unsilence", "resume", "allow", "show"].some((v) => rest.startsWith(v))) enabled = false;
      else return null;
    } else if (!rest || ["mode", "go", "enter", "i need"].includes(rest)) enabled = enabled ?? true;
    if (enabled === null) return null;
    const i = I("set_dnd", 0.95, enabled ? "Turn on Do Not Disturb" : "Turn off Do Not Disturb", { enabled });
    if (enabled) {
      const idx = rest.indexOf("for ");
      if (idx >= 0) {
        const secs = parseDurationSecs(rest.slice(idx + 4));
        if (secs !== null) { i.summary = `Turn on Do Not Disturb for ${describeDuration(secs)}`; i.args.minutes = Math.round(secs / 60); }
      }
    }
    return i;
  }
  if (t.includes("night light") || t.includes("nightlight") || t.includes("blue light")) {
    const rest = t.split("night light").join("").split("nightlight").join("").split("blue light filter").join("").split("blue light").join("");
    const e = onOff(rest.trim());
    return e === null ? I("set_night_light", 0.85, "Toggle night light") : I("set_night_light", 0.95, e ? "Turn on night light" : "Turn off night light", { enabled: e });
  }
  return null;
}

function parseLevels(t) {
  const fixed = [
    [["mute", "mute sound", "mute audio", "mute the sound", "mute volume", "silence", "be quiet", "sound off"], () => I("set_mute", 0.95, "Mute sound", { muted: true })],
    [["unmute", "unmute sound", "unmute audio", "sound on"], () => I("set_mute", 0.95, "Unmute sound", { muted: false })],
    [["louder", "volume up", "turn it up", "turn up the volume", "turn the volume up", "raise volume", "increase volume"], () => I("change_volume", 0.95, "Turn the volume up", { delta: 10 })],
    [["quieter", "softer", "volume down", "turn it down", "turn down the volume", "turn the volume down", "lower volume", "decrease volume"], () => I("change_volume", 0.95, "Turn the volume down", { delta: -10 })],
    [["brighter", "brightness up", "increase brightness", "raise brightness", "turn up the brightness"], () => I("change_brightness", 0.95, "Make the screen brighter", { delta: 10 })],
    [["dimmer", "dim the screen", "dim screen", "brightness down", "decrease brightness", "lower brightness", "turn down the brightness"], () => I("change_brightness", 0.95, "Dim the screen", { delta: -10 })],
  ];
  for (const [ps, f] of fixed) if (ps.includes(t)) return f();
  for (const [word, action, summary] of [["volume", "set_volume", "Set volume to"], ["brightness", "set_brightness", "Set brightness to"]]) {
    if (!t.includes(word)) continue;
    let rest = t;
    for (const x of ["set the ", "set ", "change the ", "change ", "turn the ", "turn ", "put the ", word]) rest = rest.split(x).join("");
    rest = rest.split(" at ").join(" ").split(" level").join("");
    rest = trimStartStr(rest.trim(), "to ").trim();
    let v = parseLevel(rest);
    if (v !== null) { if (word === "brightness") v = Math.max(v, 10); return I(action, 0.95, `${summary} ${v}%`, { level: v }); }
  }
  return null;
}

function parseWorkspace(t) {
  if (["next workspace", "next desktop", "workspace next"].includes(t)) return I("switch_workspace", 0.95, "Go to the next workspace", { target: "next" });
  if (["previous workspace", "prev workspace", "last workspace", "previous desktop", "workspace prev"].includes(t)) return I("switch_workspace", 0.95, "Go to the previous workspace", { target: "prev" });
  const rest = stripAny(t, ["go to ", "switch to ", "open ", "show ", "move to ", ""]);
  const num = (stripPrefix(rest, "workspace ") ?? stripPrefix(rest, "desktop ") ?? stripPrefix(rest, "virtual desktop "))?.trim();
  if (num === undefined || num === null) return null;
  const words = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  let n = /^\d+$/.test(num) ? parseInt(num, 10) : words.indexOf(num) + 1;
  if (!(n >= 1 && n <= 9)) return null;
  return I("switch_workspace", 0.95, `Go to workspace ${n}`, { target: String(n) });
}

function parseWindows(t) {
  if (["show desktop", "show the desktop", "minimize everything", "minimise everything", "minimize all", "minimise all", "hide all windows", "clear the screen"].includes(t)) return I("show_desktop", 0.95, "Show the desktop");
  if (["tile windows", "tile all windows", "tile everything", "arrange windows", "arrange my windows", "organize windows", "organise windows", "tidy windows", "tidy up windows"].includes(t)) return I("arrange_windows", 0.9, "Tile the open windows", { layout: "smart-group" });
  for (const [name, id] of [["grid", "grid"], ["thirds", "thirds"], ["three columns", "thirds"], ["split", "split"], ["split screen", "split"], ["side by side", "split"], ["focus stack", "focus-stack"], ["stack", "focus-stack"]]) {
    if ([`${name} layout`, `tile ${name}`, `${name} windows`, `windows ${name}`, `use ${name} layout`].includes(t) || ((name === "split screen" || name === "side by side") && t === name))
      return I("arrange_windows", 0.92, `Arrange windows: ${name}`, { layout: id });
  }
  if (["snap ", "tile ", "move ", "put ", "send ", "dock "].some((v) => t.startsWith(v))) {
    for (const [name, slot] of [["top left", "top-left"], ["top right", "top-right"], ["bottom left", "bottom-left"], ["bottom right", "bottom-right"], ["left", "left"], ["right", "right"], ["top", "top"], ["bottom", "bottom"], ["center", "center"], ["centre", "center"], ["middle", "center"]]) {
      if ([` ${name}`, ` to the ${name}`, ` to ${name}`, ` on the ${name}`, ` ${name} half`, ` to the ${name} half`].some((p) => t.endsWith(p))) return I("snap_window", 0.93, `Snap the window to the ${name}`, { slot });
    }
  }
  if (["maximize", "maximise", "maximize this", "maximise this", "maximize window", "maximise window", "full screen this", "make it bigger"].includes(t)) return I("snap_window", 0.9, "Maximise the window", { slot: "maximize" });
  if (["center window", "centre window", "center this", "centre this"].includes(t)) return I("snap_window", 0.9, "Centre the window", { slot: "center" });
  return null;
}

function parseSettings(t) {
  let rest = stripAny(t, ["open ", "show me ", "show ", "go to ", "take me to "]) ?? (t.endsWith(" settings") ? t : null);
  if (rest === null) return null;
  rest = trimStartStr(trimStartStr(rest, "the "), "my ").trim();
  let name = stripSuffix(rest, " settings") ?? stripSuffix(rest, " setting") ?? stripSuffix(rest, " options") ?? stripPrefix(rest, "settings for ") ?? stripPrefix(rest, "settings ") ?? (["settings", "control center", "control centre"].includes(rest) ? "settings" : null);
  if (name === null) return null;
  name = name.trim();
  const page = findSettingsPage(name);
  if (!page) return null;
  const shown = page === "home" ? "Lens settings" : page.startsWith("ms-") ? `Windows ${name} settings` : `Lens ${name} settings`;
  return I("open_settings_page", 0.93, `Open ${shown}`, { page });
}

function parseApps(t) {
  if (["notifications", "notification center", "quick settings", "calendar", "the dock", "the launcher"].some((n) => t.endsWith(n) && (t.startsWith("open ") || t.startsWith("show ")))) return null;
  let rest = stripAny(t, ["close ", "quit ", "exit ", "kill ", "shut down "]);
  if (rest !== null) {
    if (["this", "window", "this window", "it"].includes(rest)) return I("close_app", 0.8, "Close the focused window", { name: "focused" });
    const n = cleanAppName(rest); if (!n) return null;
    return I("close_app", 0.88, `Close ${titleCase(n)}`, { name: n });
  }
  rest = stripAny(t, ["switch to ", "go to ", "focus on ", "focus ", "bring up ", "show me ", "show ", "back to ", "jump to "]);
  if (rest !== null) { const n = cleanAppName(rest); if (!n) return null; return I("switch_app", 0.85, `Switch to ${titleCase(n)}`, { name: n }); }
  rest = stripAny(t, ["open up ", "open ", "launch ", "start ", "run ", "fire up ", "load "]);
  if (rest !== null) {
    const n = cleanAppName(rest); if (!n) return null;
    if (n.startsWith("a ") || n.startsWith("an ") || n.startsWith("new ")) return null;
    return I("open_app", 0.88, `Open ${titleCase(n)}`, { name: n });
  }
  return null;
}

/** Parses one request. null = not a desktop command (Lens would hand it to your AI helper). */
export function parse(text) {
  if (new TextEncoder().encode(text).length > 400) return null;
  const t = normalize(text);
  if (!t) return null;
  for (const f of [parseMath, parseTimer, parseColorMode, parseTheme, parseToggles, parseLevels, parseWorkspace, parseWindows, parseSettings]) {
    const i = f(t); if (i) return i;
  }
  let rest = stripAny(t, ["take a note ", "take note ", "make a note ", "note to self ", "note ", "jot down ", "remember to "]);
  if (rest !== null) {
    const body = trimStartStr(trimStart(rest, "-: ").trim(), "that ").trim();
    if (body) return I("create_note", 0.9, `Save a note: "${[...body].slice(0, 40).join("")}"`, { text: body });
  }
  rest = stripAny(t, ["search files for ", "search my files for ", "find file ", "find files ", "find my ", "find the ", "find ", "search for ", "search ", "where is ", "where's ", "locate ", "look for "]);
  if (rest !== null) {
    let q = trimStartStr(trimStartStr(rest, "files "), "for ").trim();
    q = trimEnd(trimStart(q, '"'), '"');
    if (q && q.length <= 120) return I("search_files", 0.85, `Search for "${q}"`, { query: q });
  }
  return parseApps(t);
}

export { parseDurationSecs, describeDuration };
