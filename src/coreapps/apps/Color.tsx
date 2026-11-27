// Lens Color: pick a colour from anywhere on screen (the Snip loupe, live), keep a palette,
// check WCAG contrast, and hand a colour to the Theme lab as the Lens accent (undoable).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { LensConfig, ScreenSample } from "../../types/generated";
import { AppShell, isKey } from "../shell/AppShell";
import { Button, Card, Confirm, Hero, Mono, Pill, Toast, cx } from "../shell/ui";
import { useStored, useVisiblePoll } from "../shell/hooks";
import { addToPalette, formats, nudgeToContrast, normHex, parseHex, toHex, verdict, verdictText, type RGB } from "../models/color";
import { coreApp } from "../registry";
import { oops } from "../../ui/oops";

export interface ColorDemo {
  current?: string;
  palette?: string[];
  fg?: string;
  bg?: string;
  sample?: ScreenSample;
}

export const Color: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => Promise<void>; demo?: ColorDemo }> = ({ config, updateConfig, demo }) => {
  const app = coreApp("color")!;
  const [current, setCurrent] = useStored("color.current", "#7C5CFF");
  const cur = demo?.current ?? current;
  const [paletteStored, setPalette] = useStored<string[]>("color.palette", []);
  const palette = demo?.palette ?? paletteStored;
  const [fg, setFg] = useStored("color.fg", "#FAFAFA");
  const [bg, setBg] = useStored("color.bg", "#09090B");
  const [picking, setPicking] = useState(false);
  const [sample, setSample] = useState<ScreenSample | null>(demo?.sample ?? null);
  const [hexDraft, setHexDraft] = useState(cur);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const [confirmAccent, setConfirmAccent] = useState(false);
  const [undoAccent, setUndoAccent] = useState<{ mode: string; accent: string } | null>(null);
  const wasDown = useRef(true);

  useEffect(() => setHexDraft(cur), [cur]);

  const pick = useCallback(
    (hex: string) => {
      const h = normHex(hex);
      if (!h) return;
      setCurrent(h);
      setPalette((p) => addToPalette(p, h));
      setPicking(false);
      setToast({ text: `Picked ${h}`, tone: "ok" });
    },
    [setCurrent, setPalette]
  );

  // ~20 samples a second, only while picking and visible. A click anywhere picks too.
  useVisiblePoll(
    () => {
      invoke<ScreenSample | null>("coreapp_color_sample")
        .then((s) => {
          if (!s) return;
          setSample(s);
          if (s.clicked && !wasDown.current) pick(s.hex);
          wasDown.current = s.clicked;
        })
        .catch(() => setPicking(false));
    },
    50,
    picking && !demo
  );
  useEffect(() => {
    if (picking) wasDown.current = true;
  }, [picking]);

  const copy = (v: string) =>
    navigator.clipboard
      .writeText(v)
      .then(() => setToast({ text: `Copied ${v}`, tone: "ok" }))
      .catch(() => setToast({ text: "Couldn't copy.", tone: "bad" }));

  const rgbFg = parseHex(demo?.fg ?? fg) ?? ([250, 250, 250] as RGB);
  const rgbBg = parseHex(demo?.bg ?? bg) ?? ([9, 9, 11] as RGB);
  const v = verdict(rgbFg, rgbBg);
  const fix = v.aaNormal ? null : nudgeToContrast(rgbFg, rgbBg, 4.5);
  const curRgb = parseHex(cur) ?? ([0, 0, 0] as RGB);
  const base = config ? (parseHex(config.theme.surfaceHex || "") ?? ([9, 9, 11] as RGB)) : ([9, 9, 11] as RGB);
  const accentOnBase = verdict(curRgb, base);

  const applyAccent = async () => {
    if (!config) return;
    setUndoAccent({ mode: config.theme.accentMode, accent: config.theme.customAccent });
    await updateConfig({ ...config, theme: { ...config.theme, accentMode: "custom", customAccent: cur } });
    setToast({ text: `Lens accent is now ${cur}.`, tone: "ok" });
  };
  const undo = async () => {
    if (!config || !undoAccent) return;
    await updateConfig({ ...config, theme: { ...config.theme, accentMode: undoAccent.mode, customAccent: undoAccent.accent } });
    setUndoAccent(null);
    setToast({ text: "Accent put back.", tone: "ok" });
  };
  const openThemeLab = () =>
    invoke("open_surface", { label: "settings" })
      .then(() => emit("lens://settings-tab", "theme"))
      .catch(oops("open the Theme lab"));

  const keys = [
    { keys: "Ctrl+P", label: "Pick from screen", match: (e: KeyboardEvent) => isKey(e, "p", { ctrl: true }), run: () => setPicking(true) },
    { keys: "Space", label: "While picking: take the colour under the pointer", match: (e: KeyboardEvent) => picking && (e.key === " " || e.key === "Enter"), run: () => sample && pick(sample.hex) },
    { keys: "Esc", label: "Stop picking", match: (e: KeyboardEvent) => picking && e.key === "Escape", run: () => setPicking(false) },
    { keys: "Ctrl+Shift+C", label: "Copy the hex", match: (e: KeyboardEvent) => isKey(e, "c", { ctrl: true, shift: true }), run: () => copy(cur) },
  ];

  return (
    <AppShell
      app={app}
      config={config}
      updateConfig={updateConfig}
      keys={keys}
      meta={picking ? "Move the pointer anywhere · Space or click to pick · Esc to stop · pixels are read, never saved" : `${palette.length} in palette`}
      actions={
        <>
          {undoAccent && <Button onClick={undo}>Undo accent</Button>}
          <Button onClick={() => setConfirmAccent(true)} disabled={!config}>
            Make it the Lens accent
          </Button>
          <Button variant="primary" onClick={() => setPicking((p) => !p)} aria-pressed={picking}>
            {picking ? "Stop picking" : "Pick from screen"}
          </Button>
        </>
      }
    >
      <div className="col-top">
        <div className="col-swatch" style={{ background: cur }} aria-hidden />
        <Hero title="Current colour" value={cur} valueText={cur} subtitle={<>{formats(cur)[1]?.value} · {formats(cur)[2]?.value}</>} />
        {(picking || demo?.sample) && sample && (
          <div className="col-loupe" aria-label={`Under the pointer: ${sample.hex} at ${sample.x}, ${sample.y}`} role="img">
            <div className="col-loupe-grid">
              {sample.grid.map((c, i) => (
                <span key={i} style={{ background: c }} className={i === 40 ? "mid" : undefined} />
              ))}
            </div>
            <div className="col-loupe-meta">
              <span className="col-dot" style={{ background: sample.hex }} />
              <Mono>{sample.hex}</Mono>
              <Mono>
                {sample.x}, {sample.y}
              </Mono>
            </div>
          </div>
        )}
      </div>

      <div className="ca-grid two">
        <Card title="Copy as">
          <div className="ca-row" style={{ marginBottom: 12 }}>
            <input
              className="ca-input"
              value={hexDraft}
              aria-label="Hex colour"
              spellCheck={false}
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={() => normHex(hexDraft) && setCurrent(normHex(hexDraft)!)}
              onKeyDown={(e) => e.key === "Enter" && normHex(hexDraft) && pick(hexDraft)}
            />
            <input type="color" className="col-native" value={cur.toLowerCase()} aria-label="Choose a colour" onChange={(e) => setCurrent(e.target.value.toUpperCase())} />
          </div>
          <ul className="ca-list">
            {formats(cur).map((f) => (
              <li key={f.label} className="ca-item">
                <span className="ca-mono" style={{ minWidth: 56 }}>
                  {f.label}
                </span>
                <span className="ca-item-main ca-item-title">{f.value}</span>
                <Button small variant="quiet" onClick={() => copy(f.value)} aria-label={`Copy ${f.label}`}>
                  Copy
                </Button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Contrast" meta={`${v.ratio.toFixed(2)} : 1`} guide="coreapp.color.contrast">
          <div className="col-preview" style={{ background: toHex(rgbBg), color: toHex(rgbFg) }}>
            <strong>Readable text?</strong>
            <span>The quick brown fox jumps over the lazy dog.</span>
          </div>
          <div className="ca-row" style={{ margin: "12px 0" }}>
            <label className="col-pair">
              <span className="ca-muted">Text</span>
              <input className="ca-input" value={demo?.fg ?? fg} onChange={(e) => setFg(e.target.value)} aria-label="Text colour" spellCheck={false} />
            </label>
            <Button small onClick={() => (setFg(bg), setBg(fg))} aria-label="Swap text and background">
              ⇄
            </Button>
            <label className="col-pair">
              <span className="ca-muted">Background</span>
              <input className="ca-input" value={demo?.bg ?? bg} onChange={(e) => setBg(e.target.value)} aria-label="Background colour" spellCheck={false} />
            </label>
          </div>
          <div className="ca-row" style={{ flexWrap: "wrap" }}>
            <Pill tone={v.aaNormal ? "ok" : "bad"}>AA {v.aaNormal ? "pass" : "fail"}</Pill>
            <Pill tone={v.aaaNormal ? "ok" : "bad"}>AAA {v.aaaNormal ? "pass" : "fail"}</Pill>
            <Pill tone={v.aaLarge ? "ok" : "bad"}>Large text {v.aaLarge ? "pass" : "fail"}</Pill>
            <Pill tone={v.ui ? "ok" : "bad"}>Icons {v.ui ? "pass" : "fail"}</Pill>
          </div>
          <p className="ca-secondary" style={{ margin: "12px 0 0" }}>
            {verdictText(v)}
            {fix && (
              <>
                {" "}
                <button data-weight="light" type="button" className="col-link" onClick={() => setFg(toHex(fix))}>
                  Use {toHex(fix)} instead
                </button>
              </>
            )}
          </p>
          <div className="ca-row" style={{ marginTop: 12 }}>
            <Button small onClick={() => setFg(cur)}>
              Current as text
            </Button>
            <Button small onClick={() => setBg(cur)}>
              Current as background
            </Button>
          </div>
        </Card>
      </div>

      <Card title="Palette" meta={palette.length ? `${palette.length} of 24` : undefined} actions={palette.length ? <Button small variant="quiet" onClick={() => setPalette([])}>Clear</Button> : undefined}>
        {palette.length === 0 ? (
          <p className="ca-muted" style={{ margin: 0 }}>
            Colours you pick land here, newest first.
          </p>
        ) : (
          <div className="col-palette" role="list">
            {palette.map((h) => (
              <button data-weight="light" key={h} type="button" role="listitem" className={cx("col-chip", h === cur && "on")} style={{ background: h }} onClick={() => setCurrent(h)} aria-label={`${h}${h === cur ? ", current" : ""}`}>
                <span>{h}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {confirmAccent && (
        <Confirm
          title={`Make ${cur} the Lens accent?`}
          body={
            <>
              <p>Buttons, highlights and the Dock indicator take this colour. Undo is right here, and the Theme lab can fine-tune it.</p>
              <p>
                Against your theme's surface it reads at <strong>{accentOnBase.ratio.toFixed(2)}:1</strong>
                {accentOnBase.ui ? "." : " — a little faint for icons; a lighter or darker shade will be clearer."}
              </p>
            </>
          }
          confirmLabel="Use as accent"
          onCancel={() => setConfirmAccent(false)}
          onConfirm={() => {
            setConfirmAccent(false);
            applyAccent()
              .then(openThemeLab)
              .catch(() => setToast({ text: "Couldn't change the accent.", tone: "bad" }));
          }}
        />
      )}
      <Toast text={toast?.text ?? null} tone={toast?.tone} onDone={() => setToast(null)} />
    </AppShell>
  );
};
