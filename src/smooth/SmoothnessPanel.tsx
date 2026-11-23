// Tester Hub › Smoothness: run the two-minute check and read the result (docs/SMOOTHNESS.md).
import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { reportText, TARGET, type InteractionResult, type SmoothReport } from "./analyze";
import { runSmoothCheck, type RunProgress } from "./runner";
import { SMOOTH_SCRIPT, scriptSeconds } from "./script";
import "./smooth.css";

const VERDICT: Record<InteractionResult["verdict"], string> = { smooth: "Smooth", rough: "Rough", janky: "Janky", "no-data": "Not measured" };

export function SmoothnessPanel() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [report, setReport] = useState<SmoothReport | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const cancel = useRef({ cancelled: false });

  const start = async () => {
    cancel.current = { cancelled: false };
    setRunning(true);
    setError(null);
    setCopied(false);
    try {
      const r = await runSmoothCheck(setProgress, cancel.current);
      setReport(r.report);
      setPath(r.path);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };
  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportText(report));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const s = report?.summary;
  // The check opens and closes Settings, so it must run from the Tester Hub's own window.
  const inOwnWindow = new URLSearchParams(window.location.search).get("surface") === "testerhub";
  if (!inOwnWindow) {
    return (
      <div className="th-stack sm">
        <section className="th-section">
          <div className="th-section-title">Smoothness check</div>
          <p className="sm-lead">The check opens and closes Settings while it runs, so it starts from the Tester Hub window.</p>
          <div className="sm-actions">
            <button type="button" className="th-btn th-btn-primary" onClick={() => invoke("open_surface", { label: "testerhub" }).catch(() => {})}>
              Open Tester Hub window
            </button>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="th-stack sm">
      <section className="th-section">
        <div className="th-section-title">Smoothness check</div>
        <p className="sm-lead">
          Lens opens, closes and switches {SMOOTH_SCRIPT.length} things by itself and times every frame on this PC. It takes about {Math.round(scriptSeconds() / 10) * 10} seconds.
          Leave the mouse and keyboard alone while it runs. Nothing is uploaded: the result is saved on this PC.
        </p>
        <div className="sm-actions">
          <button type="button" className="th-btn th-btn-primary" onClick={start} disabled={running}>
            {running ? "Running…" : report ? "Run again" : "Run smoothness check"}
          </button>
          {running ? (
            <button type="button" className="th-btn" onClick={() => (cancel.current.cancelled = true)}>
              Stop
            </button>
          ) : null}
          {report && !running ? (
            <>
              <button type="button" className="th-btn" onClick={copy}>
                {copied ? "Copied" : "Copy results"}
              </button>
              <button type="button" className="th-btn" onClick={() => invoke("smooth_open_folder_cmd").catch(() => {})}>
                Open folder
              </button>
            </>
          ) : null}
        </div>
        {progress ? (
          <div className="sm-progress" role="status">
            <div className="sm-progress-bar" aria-hidden>
              <span className="sm-progress-fill" data-pct={Math.round(((progress.index + 1) / progress.total) * 20) * 5} />
            </div>
            <span className="th-fine">
              {progress.index + 1} of {progress.total}: {progress.label}
            </span>
          </div>
        ) : null}
        {error ? <div className="sm-error">The check stopped: {error}</div> : null}
      </section>

      {report && s ? (
        <section className="th-section">
          <div className="th-section-title">Result</div>
          <div className="sm-summary">
            <div className="sm-stat"><b className="lens-num">{s.smooth}</b><span>smooth</span></div>
            <div className="sm-stat"><b className="lens-num">{s.rough}</b><span>rough</span></div>
            <div className="sm-stat"><b className="lens-num">{s.janky}</b><span>janky</span></div>
            <div className="sm-stat"><b className="lens-num">{s.worstMs} ms</b><span>worst frame</span></div>
            <div className="sm-stat"><b className="lens-num">{s.droppedPct}%</b><span>frames dropped</span></div>
            <div className="sm-stat"><b className="lens-num">{Math.round(1000 / s.frameMs)} Hz</b><span>display</span></div>
          </div>
          <p className="th-fine">
            Target: under {TARGET.droppedPct}% dropped, no frame over 33 ms, and no window resized while it animates.
            {s.noData > 0 ? ` ${s.noData} could not be measured (the feature is off, or its window never drew).` : ""}
          </p>
          <div className="sm-table" role="table" aria-label="Smoothness by interaction">
            <div className="sm-row sm-head" role="row">
              <span role="columnheader">Interaction</span>
              <span role="columnheader">Result</span>
              <span role="columnheader">Dropped</span>
              <span role="columnheader">Worst frame</span>
              <span role="columnheader">Window resized</span>
            </div>
            {report.results.map((r) => (
              <div key={r.id} className={`sm-row sm-${r.verdict}`} role="row">
                <span role="cell">
                  {r.label}
                  {r.note ? <em className="sm-note"> ({r.note})</em> : null}
                </span>
                <span role="cell" className="sm-verdict">{VERDICT[r.verdict]}</span>
                <span role="cell" className="lens-num">{r.verdict === "no-data" ? "—" : `${r.droppedPct}%`}</span>
                <span role="cell" className="lens-num">{r.verdict === "no-data" ? "—" : `${r.worstMs} ms`}</span>
                <span role="cell">{r.resizedMidAnimation ? r.nativeChanges.map((n) => `${n.label} ${n.kind}`).filter((v, i, a) => a.indexOf(v) === i).join(", ") : "No"}</span>
              </div>
            ))}
          </div>
          {path ? <p className="th-fine">Saved to <span className="th-mono">{path}</span></p> : null}
        </section>
      ) : null}
    </div>
  );
}
