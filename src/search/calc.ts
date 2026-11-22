/**
 * Inline calculator and unit converter for the search box. Pure, no eval().
 *
 *   2+2*3 · (4+5)^2 · sqrt(2) · 15% of 80 · 120 + 15% · 5 km to mi · 72 f to c · 3 gb in mb
 */

export interface CalcResult {
  /** What the user typed, tidied (e.g. "5 km → mi"). */
  expression: string;
  /** The answer as text, ready to copy. */
  value: string;
  kind: "math" | "units";
}

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

type Tok = { t: "num"; v: number } | { t: "op"; v: string } | { t: "id"; v: string };

function tokenize(src: string): Tok[] | null {
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^");
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " ") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.,_]/.test(s[j])) j++;
      // allow 1e6
      if (s[j] === "e" && /[0-9+-]/.test(s[j + 1] ?? "") && !/[a-z]/i.test(s[j + 2] ?? "x")) {
        j++;
        if (s[j] === "+" || s[j] === "-") j++;
        while (j < s.length && /[0-9]/.test(s[j])) j++;
      }
      const raw = s.slice(i, j).replace(/[,_]/g, "");
      const v = Number(raw);
      if (!Number.isFinite(v)) return null;
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      let j = i;
      while (j < s.length && /[a-z]/i.test(s[j])) j++;
      out.push({ t: "id", v: s.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/^%()".includes(ch)) {
      out.push({ t: "op", v: ch });
      i++;
      continue;
    }
    return null;
  }
  return out;
}

/** Recursive-descent evaluator. Returns null for anything that isn't a clean expression. */
export function evaluate(src: string): number | null {
  const parsed = tokenize(src);
  if (!parsed || parsed.length === 0) return null;
  const toks: Tok[] = parsed;
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === "op" && (peek() as { v: string }).v === v;

  function expr(): number {
    let v = term();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: string }).v;
      // "120 + 15%" means 120 * 1.15
      if (peek()?.t === "num" && toks[p + 1]?.t === "op" && (toks[p + 1] as { v: string }).v === "%" && (p + 2 >= toks.length || isAt(p + 2, ")"))) {
        const pct = (toks[p] as { v: number }).v;
        p += 2;
        v = op === "+" ? v * (1 + pct / 100) : v * (1 - pct / 100);
        continue;
      }
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function isAt(i: number, v: string) {
    const t = toks[i];
    return t?.t === "op" && t.v === v;
  }
  function term(): number {
    let v = power();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = (toks[p++] as { v: string }).v;
        const r = power();
        v = op === "*" ? v * r : v / r;
      } else if (peek()?.t === "id" && (peek() as { v: string }).v === "mod") {
        p++;
        v = v % power();
      } else if (peek()?.t === "op" && isOp("(")) {
        v = v * power(); // implicit multiply: 2(3+4)
      } else break;
    }
    return v;
  }
  function power(): number {
    const base = unary();
    if (isOp("^")) {
      p++;
      return Math.pow(base, power()); // right-assoc
    }
    return base;
  }
  function unary(): number {
    if (isOp("-")) {
      p++;
      return -unary();
    }
    if (isOp("+")) {
      p++;
      return unary();
    }
    return postfix();
  }
  function postfix(): number {
    let v = primary();
    // "15%" alone = 0.15; "15% of 80" = 12
    if (isOp("%")) {
      p++;
      if (peek()?.t === "id" && (peek() as { v: string }).v === "of") {
        p++;
        return (v / 100) * unary();
      }
      v = v / 100;
    }
    return v;
  }
  function primary(): number {
    const tk = toks[p++];
    if (!tk) throw new Error("end");
    if (tk.t === "num") return tk.v;
    if (tk.t === "op" && tk.v === "(") {
      const v = expr();
      if (!isOp(")")) throw new Error("paren");
      p++;
      return v;
    }
    if (tk.t === "id") {
      if (tk.v in CONSTS) return CONSTS[tk.v];
      const fn = FUNCS[tk.v];
      if (fn) {
        if (isOp("(")) {
          p++;
          const a = expr();
          if (!isOp(")")) throw new Error("paren");
          p++;
          return fn(a);
        }
        return fn(unary());
      }
    }
    throw new Error("bad");
  }

  try {
    const v = expr();
    if (p !== toks.length) return null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Unit answers read better rounded: 3.1069 mi, not 3.1068559612 mi. */
export function formatUnit(v: number): string {
  const abs = Math.abs(v);
  if (abs !== 0 && abs < 0.01) return formatNumber(Number(v.toPrecision(4)));
  return v.toLocaleString("en-US", { maximumFractionDigits: abs < 100 ? 4 : 2 });
}

export function formatNumber(v: number): string {
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toLocaleString("en-US");
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-6 || abs >= 1e15)) return v.toExponential(6).replace(/\.?0+e/, "e");
  const s = v.toPrecision(12);
  const n = Number(s);
  return n.toLocaleString("en-US", { maximumFractionDigits: 10 });
}

// ---------------- Units ----------------
type UnitDef = { cat: string; f: number; label: string };
const U: Record<string, UnitDef> = {};
function def(cat: string, f: number, label: string, ...names: string[]) {
  for (const n of names) U[n] = { cat, f, label };
}
// length (m)
def("len", 0.001, "mm", "mm", "millimeter", "millimeters", "millimetre", "millimetres");
def("len", 0.01, "cm", "cm", "centimeter", "centimeters", "centimetre", "centimetres");
def("len", 1, "m", "m", "meter", "meters", "metre", "metres");
def("len", 1000, "km", "km", "kilometer", "kilometers", "kilometre", "kilometres");
def("len", 0.0254, "in", "in", "inch", "inches", '"');
def("len", 0.3048, "ft", "ft", "foot", "feet", "'");
def("len", 0.9144, "yd", "yd", "yard", "yards");
def("len", 1609.344, "mi", "mi", "mile", "miles");
// mass (g)
def("mass", 0.001, "mg", "mg", "milligram", "milligrams");
def("mass", 1, "g", "g", "gram", "grams");
def("mass", 1000, "kg", "kg", "kilogram", "kilograms", "kilo", "kilos");
def("mass", 28.349523125, "oz", "oz", "ounce", "ounces");
def("mass", 453.59237, "lb", "lb", "lbs", "pound", "pounds");
def("mass", 6350.29318, "st", "st", "stone");
// data (bytes)
def("data", 1, "B", "b", "byte", "bytes");
def("data", 1e3, "KB", "kb", "kilobyte", "kilobytes");
def("data", 1e6, "MB", "mb", "megabyte", "megabytes");
def("data", 1e9, "GB", "gb", "gigabyte", "gigabytes");
def("data", 1e12, "TB", "tb", "terabyte", "terabytes");
def("data", 1024, "KiB", "kib");
def("data", 1024 ** 2, "MiB", "mib");
def("data", 1024 ** 3, "GiB", "gib");
def("data", 1024 ** 4, "TiB", "tib");
// time (s)
def("time", 0.001, "ms", "ms", "millisecond", "milliseconds");
def("time", 1, "s", "s", "sec", "secs", "second", "seconds");
def("time", 60, "min", "min", "mins", "minute", "minutes");
def("time", 3600, "h", "h", "hr", "hrs", "hour", "hours");
def("time", 86400, "days", "d", "day", "days");
def("time", 604800, "weeks", "wk", "wks", "week", "weeks");
// volume (L)
def("vol", 0.001, "mL", "ml", "milliliter", "milliliters", "millilitre", "millilitres");
def("vol", 1, "L", "l", "liter", "liters", "litre", "litres");
def("vol", 3.785411784, "gal", "gal", "gallon", "gallons");
def("vol", 0.0295735295625, "fl oz", "floz", "fluid ounce", "fluid ounces");
def("vol", 0.2365882365, "cups", "cup", "cups");
// speed (m/s)
def("speed", 1, "m/s", "m/s", "mps");
def("speed", 1000 / 3600, "km/h", "km/h", "kmh", "kph");
def("speed", 1609.344 / 3600, "mph", "mph");
def("speed", 1852 / 3600, "kn", "kn", "knot", "knots");
// temperature handled specially
const TEMP: Record<string, string> = { c: "°C", "°c": "°C", celsius: "°C", f: "°F", "°f": "°F", fahrenheit: "°F", k: "K", kelvin: "K" };

function toKelvin(v: number, u: string): number {
  if (u === "°C") return v + 273.15;
  if (u === "°F") return ((v - 32) * 5) / 9 + 273.15;
  return v;
}
function fromKelvin(k: number, u: string): number {
  if (u === "°C") return k - 273.15;
  if (u === "°F") return ((k - 273.15) * 9) / 5 + 32;
  return k;
}

const UNIT_RE = /^\s*(-?[\d.,]+)\s*([a-z°"'/ ]+?)\s+(?:to|in|as|->|→|=)\s+([a-z°"'/ ]+?)\s*$/i;

export function convertUnits(src: string): CalcResult | null {
  const m = src.match(UNIT_RE);
  if (!m) return null;
  const v = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(v)) return null;
  const from = m[2].trim().toLowerCase();
  const to = m[3].trim().toLowerCase();
  if (TEMP[from] && TEMP[to]) {
    const out = fromKelvin(toKelvin(v, TEMP[from]), TEMP[to]);
    return {
      expression: `${formatNumber(v)} ${TEMP[from]} → ${TEMP[to]}`,
      value: `${formatNumber(Math.round(out * 100) / 100)} ${TEMP[to]}`,
      kind: "units",
    };
  }
  const a = U[from];
  const b = U[to];
  if (!a || !b || a.cat !== b.cat) return null;
  const out = (v * a.f) / b.f;
  return {
    expression: `${formatNumber(v)} ${a.label} → ${b.label}`,
    value: `${formatUnit(out)} ${b.label}`,
    kind: "units",
  };
}

/** Returns a result only when the query is clearly a calculation (has digits and an operator/function). */
export function calculate(query: string): CalcResult | null {
  const q = query.trim().replace(/^=\s*/, "");
  if (!q || q.length > 200) return null;
  const units = convertUnits(q);
  if (units) return units;
  if (!/[0-9]|\bpi\b/i.test(q)) return null;
  const looksLikeMath = /[+\-*/^%×÷()]/.test(q) || /\b(sqrt|abs|round|floor|ceil|sin|cos|tan|ln|log|exp|mod|of)\b/i.test(q);
  if (!looksLikeMath && !query.trim().startsWith("=")) return null;
  // Phone numbers / dates like 2026-11-21 are not math
  if (/^\d{4}-\d{2}-\d{2}$/.test(q) || /^\+?\d[\d\s-]{7,}$/.test(q)) return null;
  const v = evaluate(q);
  if (v === null) return null;
  return { expression: q.replace(/\s+/g, " "), value: formatNumber(v), kind: "math" };
}
