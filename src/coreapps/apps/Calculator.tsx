// Lens Calculator: maths with history (calc.rs, the same engine as Command and voice), unit
// conversion, programmer mode (hex / bin / oct) and opt-in currency rates. Copy or send any
// answer to the Shelf.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CalcAnswer, CurrencyRates, LensConfig } from "../../types/generated";
import { shelfAdd } from "../../shelf/contract";
import { AppShell, isKey } from "../shell/AppShell";
import { Button, Card, Empty, ErrorNote, Hero, Mono, Switch, Tabs, Toast, cx } from "../shell/ui";
import { useStored } from "../shell/hooks";
import { ago } from "../shell/format";
import { BASES, UNITS, addHistory, convertCurrency, evalProgrammer, format, normalise, unitArg, type Base, type Bits, type HistoryEntry } from "../models/calculator";
import { friendlyError } from "../models/load";
import { coreApp } from "../registry";

type View = "standard" | "units" | "programmer" | "currency";

const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "%", "+", "(", ")", "^", "√"];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY", "INR", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "BRL", "MXN", "ZAR", "SGD", "HKD", "KRW", "TRY"];

export interface CalcDemo {
  expr?: string;
  answer?: CalcAnswer | null;
  history?: HistoryEntry[];
  view?: View;
  rates?: CurrencyRates;
}

export const Calculator: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => Promise<void>; initialView?: string; demo?: CalcDemo }> = ({ config, updateConfig, initialView, demo }) => {
  const app = coreApp("calculator")!;
  const [view, setView] = useState<View>(demo?.view ?? ((["standard", "units", "programmer", "currency"] as View[]).includes(initialView as View) ? (initialView as View) : "standard"));
  const [expr, setExpr] = useState(demo?.expr ?? "");
  const [answer, setAnswer] = useState<CalcAnswer | null>(demo?.answer ?? null);
  const [stored, setHistory] = useStored<HistoryEntry[]>("calc.history", []);
  const history = demo?.history ?? stored;
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Units
  const [dim, setDim] = useStored("calc.dim", "Length");
  const [uval, setUval] = useState("1");
  const [from, setFrom] = useStored("calc.from", "km");
  const [to, setTo] = useStored("calc.to", "mi");
  const [uout, setUout] = useState<Record<string, number | null>>({});

  // Programmer
  const [base, setBase] = useStored<Base>("calc.base", 10);
  const [bits, setBits] = useStored<Bits>("calc.bits", 32);
  const [pexpr, setPexpr] = useState("0xFF & 0b1010 << 2");
  const pval = useMemo(() => evalProgrammer(pexpr, base, bits), [pexpr, base, bits]);

  // Currency (opt-in)
  const [allowRates, setAllowRates] = useStored("calc.allowRates", false);
  const [rates, setRates] = useState<CurrencyRates | null>(demo?.rates ?? null);
  const [ratesErr, setRatesErr] = useState<string | null>(null);
  const [ratesBusy, setRatesBusy] = useState(false);
  const [cAmt, setCAmt] = useState("100");
  const [cFrom, setCFrom] = useStored("calc.cfrom", "USD");
  const [cTo, setCTo] = useStored("calc.cto", "EUR");

  // Live answer while typing (Rust does the maths; no network).
  useEffect(() => {
    if (demo) return;
    const e = normalise(expr);
    if (!e) return setAnswer(null);
    const t = window.setTimeout(() => {
      invoke<CalcAnswer | null>("coreapp_calc", { expr: e.replace(/√\s*\(?([\d.]+)\)?/g, "($1^0.5)") })
        .then(setAnswer)
        .catch(() => setAnswer(null));
    }, 80);
    return () => window.clearTimeout(t);
  }, [expr, demo]);

  useEffect(() => {
    if (view !== "units" || demo) return;
    const v = Number(uval);
    if (!isFinite(v)) return;
    const list = UNITS[dim] ?? [];
    Promise.all(list.map((u) => invoke<number | null>("coreapp_convert", { value: v, from: unitArg(from), to: unitArg(u) }).catch(() => null))).then((r) =>
      setUout(Object.fromEntries(list.map((u, i) => [u, r[i]])))
    );
  }, [view, uval, from, dim, demo]);

  const commit = () => {
    if (!answer) return;
    setHistory((h) => addHistory(h, { expr: normalise(expr), result: answer.text, at: Date.now() }));
    setExpr(answer.kind === "math" ? answer.text.replace(/,/g, "") : "");
  };
  const copy = (text: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => setToast({ text: `Copied ${text}`, tone: "ok" }))
      .catch(() => setToast({ text: "Couldn't copy.", tone: "bad" }));
  const toShelf = (e: HistoryEntry) =>
    shelfAdd({ kind: "text", title: "Calculation", text: `${e.expr} = ${e.result}`, source_app: "Lens Calculator", tags: ["calc"] })
      .then(() => setToast({ text: "Sent to the Shelf.", tone: "ok" }))
      .catch((err) => setToast({ text: friendlyError(String(err)), tone: "bad" }));
  const press = (k: string) => {
    if (k === "√") setExpr((x) => `${x}√(`);
    else setExpr((x) => x + k);
    inputRef.current?.focus();
  };
  const getRates = () => {
    setRatesBusy(true);
    setRatesErr(null);
    invoke<CurrencyRates>("coreapp_currency_rates", { base: cFrom })
      .then(setRates)
      .catch((e) => setRatesErr(friendlyError(String(e))))
      .finally(() => setRatesBusy(false));
  };
  const cResult = rates ? convertCurrency(Number(cAmt), cFrom, cTo, rates.base, rates.rates) : null;

  const keys = [
    { keys: "Enter", label: "Keep the answer in history" },
    { keys: "Esc", label: "Clear", match: (e: KeyboardEvent) => e.key === "Escape" && view === "standard", run: () => setExpr("") },
    { keys: "Ctrl+Shift+C", label: "Copy the answer", match: (e: KeyboardEvent) => isKey(e, "c", { ctrl: true, shift: true }), run: () => answer && copy(answer.text) },
    { keys: "Ctrl+1", label: "Standard", match: (e: KeyboardEvent) => isKey(e, "1", { ctrl: true }), run: () => setView("standard") },
    { keys: "Ctrl+2", label: "Units", match: (e: KeyboardEvent) => isKey(e, "2", { ctrl: true }), run: () => setView("units") },
    { keys: "Ctrl+3", label: "Programmer", match: (e: KeyboardEvent) => isKey(e, "3", { ctrl: true }), run: () => setView("programmer") },
    { keys: "Ctrl+4", label: "Currency", match: (e: KeyboardEvent) => isKey(e, "4", { ctrl: true }), run: () => setView("currency") },
  ];

  const toolbar = (
    <Tabs
      label="Modes"
      value={view}
      onChange={setView}
      options={[
        { id: "standard", label: "Standard" },
        { id: "units", label: "Units" },
        { id: "programmer", label: "Programmer" },
        { id: "currency", label: "Currency" },
      ]}
    />
  );

  return (
    <AppShell
      app={app}
      config={config}
      updateConfig={updateConfig}
      toolbar={toolbar}
      keys={keys}
      meta={view === "currency" ? (rates ? `Rates ${rates.date} · ${rates.source}` : "Currency needs rates from the internet · off until you ask") : "Same maths as Command and voice · nothing leaves this PC"}
      actions={
        view === "standard" ? (
          <>
            <Button onClick={() => answer && copy(answer.text)} disabled={!answer}>
              Copy
            </Button>
            <Button variant="primary" onClick={commit} disabled={!answer}>
              Keep
            </Button>
          </>
        ) : view === "programmer" ? (
          <Button variant="primary" disabled={pval == null} onClick={() => pval != null && copy(format(pval, base, bits).replace(/ /g, ""))}>
            Copy {BASES.find((b) => b.base === base)?.label}
          </Button>
        ) : view === "currency" ? (
          <Button variant="primary" onClick={getRates} disabled={!allowRates || ratesBusy}>
            {ratesBusy ? "Getting rates…" : rates ? "Refresh rates" : "Get rates"}
          </Button>
        ) : (
          <Button onClick={() => (setFrom(to), setTo(from))}>Swap units</Button>
        )
      }
    >
      {view === "standard" && (
        <>
          <section className="calc-display" aria-label="Calculation">
            <input
              ref={inputRef}
              className="calc-input"
              value={expr}
              autoFocus
              spellCheck={false}
              onChange={(e) => setExpr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commit()}
              placeholder="12% of 340, 5 km in miles, (3+4)^2"
              aria-label="Expression"
            />
            <div className={cx("calc-answer", !answer && "empty")} aria-live="polite">
              {answer ? (
                <>
                  <span className="calc-eq">=</span> {answer.text}
                  {answer.kind === "convert" && <Mono className="calc-summary">{answer.summary}</Mono>}
                </>
              ) : expr.trim() ? (
                <span className="ca-muted">…</span>
              ) : (
                <span className="ca-muted">0</span>
              )}
            </div>
          </section>
          <div className="calc-split">
            <div className="calc-keys" role="group" aria-label="Keypad">
              {KEYS.map((k) => (
                <button key={k} type="button" className={cx("calc-key", /[÷×−+^%]/.test(k) && "op")} onClick={() => press(k)} aria-label={k === "√" ? "Square root" : k === "−" ? "Minus" : k}>
                  {k}
                </button>
              ))}
              <button type="button" className="calc-key wide" onClick={() => setExpr((x) => x.slice(0, -1))} aria-label="Backspace">
                ⌫
              </button>
              <button type="button" className="calc-key wide" onClick={() => setExpr("")}>
                C
              </button>
              <button type="button" className="calc-key wide eq" onClick={commit} aria-label="Equals">
                =
              </button>
            </div>
            <Card title="History" meta={history.length ? `${history.length}` : undefined} actions={history.length ? <Button small variant="quiet" onClick={() => setHistory([])}>Clear</Button> : undefined} className="calc-history">
              {history.length === 0 ? (
                <p className="ca-muted" style={{ margin: 0 }}>
                  Press Enter to keep an answer here. Click one to use it again.
                </p>
              ) : (
                <ul className="ca-list">
                  {history.slice(0, 40).map((h) => (
                    <li key={h.at + h.expr} className="ca-item">
                      <button type="button" className="calc-hist" onClick={() => setExpr(h.expr)} aria-label={`Use ${h.expr} again`}>
                        <span className="ca-item-sub">{h.expr}</span>
                        <span className="ca-item-title">= {h.result}</span>
                      </button>
                      <Mono>{ago(h.at)}</Mono>
                      <Button small variant="quiet" onClick={() => copy(h.result)} aria-label={`Copy ${h.result}`}>
                        Copy
                      </Button>
                      <Button small variant="quiet" onClick={() => toShelf(h)} aria-label={`Send ${h.expr} to the Shelf`}>
                        Shelf
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {view === "units" && (
        <>
          <Card title="Convert">
            <div className="ca-row" style={{ flexWrap: "wrap" }}>
              <select className="ca-input" value={dim} aria-label="Kind of unit" onChange={(e) => (setDim(e.target.value), setFrom(UNITS[e.target.value][0]), setTo(UNITS[e.target.value][1]))}>
                {Object.keys(UNITS).map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <input className="ca-input" style={{ maxWidth: 160 }} inputMode="decimal" value={uval} onChange={(e) => setUval(e.target.value)} aria-label="Value" />
              <select className="ca-input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From unit">
                {UNITS[dim]?.map((u) => <option key={u}>{u}</option>)}
              </select>
              <span className="ca-muted">to</span>
              <select className="ca-input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To unit">
                {UNITS[dim]?.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
          </Card>
          <Hero title={`${uval || 0} ${from} in ${to}`} value={uout[to] != null ? fmt(uout[to]!) : "—"} valueText={uout[to] != null ? fmt(uout[to]!) : undefined} unit={to} />
          <Card title={`${uval || 0} ${from} is`}>
            <div className="ca-grid">
              {(UNITS[dim] ?? []).filter((u) => u !== from).map((u) => (
                <button key={u} type="button" className="calc-unit" onClick={() => uout[u] != null && copy(fmt(uout[u]!))} aria-label={`${fmt(uout[u] ?? NaN)} ${u}, copy`}>
                  <strong>{uout[u] != null ? fmt(uout[u]!) : "—"}</strong>
                  <span className="ca-muted">{u}</span>
                </button>
              ))}
            </div>
          </Card>
        </>
      )}

      {view === "programmer" && (
        <>
          <Card title="Expression">
            <div className="ca-row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
              <Tabs label="Input base" value={String(base) as "2" | "8" | "10" | "16"} onChange={(v) => setBase(Number(v) as Base)} options={BASES.map((b) => ({ id: String(b.base) as "2" | "8" | "10" | "16", label: b.label }))} />
              <div className="ca-spacer" />
              <Tabs label="Word size" value={String(bits) as "8" | "16" | "32" | "64"} onChange={(v) => setBits(Number(v) as Bits)} options={(["8", "16", "32", "64"] as const).map((b) => ({ id: b, label: `${b}-bit` }))} />
            </div>
            <input className="calc-input" style={{ fontSize: 20 }} spellCheck={false} value={pexpr} onChange={(e) => setPexpr(e.target.value)} aria-label="Programmer expression" placeholder="0xFF & 0b1010 << 2" />
            <p className="ca-muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
              + − * / % &amp; | ^ ~ &lt;&lt; &gt;&gt; and ( ). Prefix 0x, 0b or 0o to mix bases.
            </p>
          </Card>
          {pval == null ? (
            <ErrorNote>That isn't a whole-number expression in {BASES.find((b) => b.base === base)?.label}.</ErrorNote>
          ) : (
            <Card title="Value">
              <dl className="calc-bases">
                {BASES.map((b) => (
                  <React.Fragment key={b.base}>
                    <dt>{b.label}</dt>
                    <dd>
                      <button type="button" className="calc-base-val" onClick={() => copy(format(pval, b.base, bits).replace(/ /g, ""))} aria-label={`${b.label} ${format(pval, b.base, bits)}, copy`}>
                        {b.base === 10 ? pval.toString() : format(pval, b.base, bits)}
                      </button>
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </Card>
          )}
        </>
      )}

      {view === "currency" && (
        <>
          <Card title="Currency rates" guide="coreapp.calculator.currency">
            <div className="ca-row">
              <div className="ca-item-main">
                <div className="ca-item-title">Allow fetching exchange rates</div>
                <div className="ca-item-sub" style={{ whiteSpace: "normal" }}>
                  Off by default. When on, “Get rates” asks frankfurter.app for the European Central Bank's daily rates. Only the currency code is sent.
                </div>
              </div>
              <Switch checked={allowRates} label="Allow fetching exchange rates" onChange={setAllowRates} />
            </div>
          </Card>
          {ratesErr && <ErrorNote onRetry={getRates}>{ratesErr}</ErrorNote>}
          {!allowRates && !rates ? (
            <Empty title="Currency is off" config={config}>
              Lens doesn't contact anything to convert currencies until you turn this on and press Get rates.
            </Empty>
          ) : (
            <Card title="Convert" meta={rates ? `rates from ${rates.date}` : "press Get rates"}>
              <div className="ca-row" style={{ flexWrap: "wrap" }}>
                <input className="ca-input" style={{ maxWidth: 160 }} inputMode="decimal" value={cAmt} onChange={(e) => setCAmt(e.target.value)} aria-label="Amount" />
                <select className="ca-input" value={cFrom} onChange={(e) => (setCFrom(e.target.value), setRates(null))} aria-label="From currency">
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <span className="ca-muted">to</span>
                <select className="ca-input" value={cTo} onChange={(e) => setCTo(e.target.value)} aria-label="To currency">
                  {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <Hero value={cResult != null ? fmt(cResult, 2) : "—"} valueText={cResult != null ? fmt(cResult, 2) : undefined} unit={cTo} subtitle={rates ? `1 ${cFrom} = ${fmt(convertCurrency(1, cFrom, cTo, rates.base, rates.rates) ?? NaN, 4)} ${cTo}` : "Get rates to convert."} />
            </Card>
          )}
        </>
      )}
      <Toast text={toast?.text ?? null} tone={toast?.tone} onDone={() => setToast(null)} />
    </AppShell>
  );
};

function fmt(v: number, max = 6): string {
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-6)) return v.toExponential(4);
  return v.toLocaleString(undefined, { maximumFractionDigits: max });
}
