// Lens Calculator: history, unit lists (mirroring calc.rs), currency maths and programmer mode.
// Ordinary maths and conversions run in Rust (calc.rs) so Command, voice and the app agree. Pure.

export interface HistoryEntry {
  expr: string;
  result: string;
  at: number;
}

export const MAX_HISTORY = 100;

export function addHistory(h: HistoryEntry[], e: HistoryEntry): HistoryEntry[] {
  if (!e.expr.trim()) return h;
  if (h[0] && h[0].expr === e.expr && h[0].result === e.result) return h;
  return [e, ...h].slice(0, MAX_HISTORY);
}

/** Calculator keys and pasted text use ×, ÷, − and "," as thousands separators. */
export function normalise(expr: string): string {
  return expr
    .replace(/[×✕]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .trim();
}

/** Canonical unit symbols per dimension, as calc.rs names them. */
export const UNITS: Record<string, string[]> = {
  Length: ["mm", "cm", "m", "km", "in", "ft", "yd", "mi"],
  Mass: ["g", "kg", "oz", "lb", "st"],
  Temperature: ["°C", "°F", "K"],
  Volume: ["ml", "l", "fl oz", "cup", "gal"],
  Speed: ["km/h", "mph", "m/s", "kn"],
  Data: ["B", "KB", "MB", "GB", "TB"],
  Time: ["s", "min", "h", "day", "week"],
};

/** calc.rs looks units up by alias; these spellings are the ones it accepts for each symbol. */
export const UNIT_ALIAS: Record<string, string> = { "°C": "c", "°F": "f", K: "kelvin", "fl oz": "floz", "km/h": "kmh" };
export const unitArg = (sym: string) => UNIT_ALIAS[sym] ?? sym.toLowerCase();

/** Rates are "1 base = r units"; converts between any two listed currencies. */
export function convertCurrency(value: number, from: string, to: string, base: string, rates: Record<string, number>): number | null {
  const r = (c: string) => (c === base ? 1 : rates[c]);
  const a = r(from);
  const b = r(to);
  if (!a || !b || !isFinite(value)) return null;
  return (value / a) * b;
}

// ── programmer mode ─────────────────────────────────────────────────────────────────────────────

export type Base = 2 | 8 | 10 | 16;
export const BASES: { base: Base; label: string }[] = [
  { base: 16, label: "HEX" },
  { base: 10, label: "DEC" },
  { base: 8, label: "OCT" },
  { base: 2, label: "BIN" },
];

/** Word size for two's-complement display and wrap-around. */
export type Bits = 8 | 16 | 32 | 64;

export function wrap(v: bigint, bits: Bits): bigint {
  return BigInt.asIntN(bits, v);
}

/** Unsigned digits in `base` (negative numbers shown as two's complement of `bits`). */
export function format(v: bigint, base: Base, bits: Bits = 64): string {
  const u = BigInt.asUintN(bits, v);
  let s = u.toString(base).toUpperCase();
  if (base === 2 || base === 16) {
    // Full word width, in groups of four digits.
    s = s.padStart(base === 2 ? bits : bits / 4, "0").replace(/(.{4})(?=.)/g, "$1 ");
  }
  return s;
}

const DIGITS: Record<Base, RegExp> = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i };

type Tok = { t: "n"; v: bigint } | { t: "op"; v: string } | { t: "("; v: string } | { t: ")"; v: string };

function tokenize(src: string, base: Base): Tok[] | null {
  const out: Tok[] = [];
  const s = src.replace(/\s+/g, "");
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const pre = /^0([xbo])([0-9a-f]+)/i.exec(rest);
    if (pre) {
      const b: Base = pre[1].toLowerCase() === "x" ? 16 : pre[1].toLowerCase() === "b" ? 2 : 8;
      if (!DIGITS[b].test(pre[2])) return null;
      out.push({ t: "n", v: BigInt((b === 16 ? "0x" : b === 2 ? "0b" : "0o") + pre[2]) });
      i += pre[0].length;
      continue;
    }
    const num = (base === 16 ? /^[0-9a-f]+/i : /^\d+/).exec(rest);
    if (num) {
      if (!DIGITS[base].test(num[0])) return null;
      out.push({ t: "n", v: base === 10 ? BigInt(num[0]) : BigInt((base === 16 ? "0x" : base === 2 ? "0b" : "0o") + num[0]) });
      i += num[0].length;
      continue;
    }
    const op = /^(<<|>>|[+\-*/%&|^~])/.exec(rest);
    if (op) {
      out.push({ t: "op", v: op[0] });
      i += op[0].length;
      continue;
    }
    if (rest[0] === "(" || rest[0] === ")") {
      out.push({ t: rest[0], v: rest[0] } as Tok);
      i++;
      continue;
    }
    return null;
  }
  return out;
}

const PREC: Record<string, number> = { "|": 1, "^": 2, "&": 3, "<<": 4, ">>": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };

/**
 * Integer expression in `base` (+ - * / % & | ^ ~ << >>, parentheses, 0x/0b/0o literals),
 * wrapped to `bits`. Returns null for anything malformed or a division by zero.
 */
export function evalProgrammer(src: string, base: Base, bits: Bits = 64): bigint | null {
  const toks = tokenize(src, base);
  if (!toks || !toks.length) return null;
  let i = 0;
  const peek = () => toks[i];
  const unary = (): bigint | null => {
    const t = peek();
    if (!t) return null;
    if (t.t === "op" && (t.v === "-" || t.v === "~" || t.v === "+")) {
      i++;
      const v = unary();
      if (v == null) return null;
      return t.v === "-" ? -v : t.v === "~" ? ~v : v;
    }
    if (t.t === "(") {
      i++;
      const v = bin(0);
      if (v == null || peek()?.t !== ")") return null;
      i++;
      return v;
    }
    if (t.t === "n") {
      i++;
      return t.v;
    }
    return null;
  };
  const bin = (min: number): bigint | null => {
    let left = unary();
    if (left == null) return null;
    for (;;) {
      const t = peek();
      if (!t || t.t !== "op" || PREC[t.v] == null || PREC[t.v] < min) return left;
      i++;
      const right = bin(PREC[t.v] + 1);
      if (right == null) return null;
      switch (t.v) {
        case "+": left = left + right; break;
        case "-": left = left - right; break;
        case "*": left = left * right; break;
        case "/": if (right === 0n) return null; left = left / right; break;
        case "%": if (right === 0n) return null; left = left % right; break;
        case "&": left = left & right; break;
        case "|": left = left | right; break;
        case "^": left = left ^ right; break;
        case "<<": left = left << (right & 127n); break;
        case ">>": left = left >> (right & 127n); break;
      }
      left = wrap(left, bits);
    }
  };
  const v = bin(0);
  if (v == null || i !== toks.length) return null;
  return wrap(v, bits);
}
