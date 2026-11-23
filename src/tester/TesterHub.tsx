// Tester Hub: what's new in this build, the test checklist, the session log and the report export.
// Mounted as a card in Settings › About & Testing (see docs/TESTER_HUB.md) and as the
// standalone `testerhub` surface. Nothing here captures the screen or uploads anything.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  buildInfo as defaultBuildInfo,
  buildKey,
  exportPlan,
  exportReport,
  getEnvironment,
  getLog,
  loadResults,
  markMoment,
  openIssue,
  revealReport,
  runSelfTest,
  saveResults,
  type ExportPlan,
  type ExportResult,
  type LogLine,
} from "./api";
import {
  groupCommits,
  issueBody,
  issueTitle,
  parseLatest,
  parseResults,
  progressOf,
  reportMarkdown,
  setStep,
  visibleSteps,
  type BuildInfo,
  type EnvSummary,
  type LatestStep,
  type Results,
  type RiskFilter,
  type StepStatus,
} from "./model";
import "./TesterHub.css";

export type TesterTab = "new" | "checklist" | "log" | "report";

const TABS: { id: TesterTab; label: string }[] = [
  { id: "new", label: "What's new" },
  { id: "checklist", label: "Test checklist" },
  { id: "log", label: "Session log" },
  { id: "report", label: "Report" },
];

const STATUS: { id: Exclude<StepStatus, "todo">; label: string; key: string }[] = [
  { id: "pass", label: "Pass", key: "p" },
  { id: "fail", label: "Fail", key: "f" },
  { id: "skip", label: "Skip", key: "s" },
];

const FILTERS: { id: RiskFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Not tested" },
  { id: "high", label: "High risk" },
  { id: "med", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "failed", label: "Failed" },
];

const LEVELS: LogLine["level"][] = ["error", "warn", "info", "mark"];

function fmtTime(ms: number) {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  } catch {
    return "";
  }
}

export function TesterHub({ info = defaultBuildInfo, initialTab = "new" }: { info?: BuildInfo; initialTab?: TesterTab }) {
  const [tab, setTab] = useState<TesterTab>(initialTab);
  const build = buildKey(info);
  const { notes, problems } = useMemo(() => parseLatest(info.latest), [info.latest]);
  const groups = useMemo(() => groupCommits(info.commits ?? []), [info.commits]);
  const steps = notes?.test_steps ?? [];

  const [results, setResults] = useState<Results>({ build, steps: {} });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    loadResults(build).then((j) => {
      if (!live) return;
      setResults(parseResults(j, build));
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [build]);
  const saveTimer = useRef<number | undefined>(undefined);
  const update = useCallback(
    (id: string, patch: Parameters<typeof setStep>[2]) => {
      setResults((r) => {
        const next = setStep(r, id, patch);
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => saveResults(build, JSON.stringify(next)), 300);
        return next;
      });
    },
    [build]
  );

  const progress = progressOf(steps, results);

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(next);
    (e.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLButtonElement | null)?.focus();
  };

  return (
    <div className="th">
      <header className="th-head">
        <div className="th-head-text">
          <div className="th-title">Tester Hub</div>
          <div className="th-sub">
            Build <span className="th-mono">{info.version}</span> · <span className="th-mono">{(info.sha || "dev").slice(0, 7)}</span>
            {info.builtAt ? <> · {info.builtAt.slice(0, 10)}</> : null}
            {notes?.date ? <> · notes {notes.date}</> : null}
          </div>
        </div>
        <div className="th-progress" aria-label={`Checklist ${progress.pct}% done`}>
          <div className="th-progress-num">{steps.length ? `${progress.done}/${progress.total}` : "—"}</div>
          <div className="th-progress-bar" aria-hidden>
            <span className="th-progress-pass" style={{ width: `${steps.length ? (progress.pass / steps.length) * 100 : 0}%` }} />
            <span className="th-progress-fail" style={{ width: `${steps.length ? (progress.fail / steps.length) * 100 : 0}%` }} />
            <span className="th-progress-skip" style={{ width: `${steps.length ? (progress.skip / steps.length) * 100 : 0}%` }} />
          </div>
        </div>
      </header>

      <div className="th-tabs" role="tablist" aria-label="Tester Hub sections" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            className={`th-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "checklist" && progress.highRiskOpen > 0 ? <span className="th-dot" aria-label={`${progress.highRiskOpen} high-risk steps open`} /> : null}
          </button>
        ))}
      </div>

      <div className="th-panel" role="tabpanel">
        {tab === "new" && <WhatsNew groups={groups} notes={notes} problems={problems} />}
        {tab === "checklist" && <Checklist steps={steps} results={results} loaded={loaded} onUpdate={update} />}
        {tab === "log" && <SessionLog />}
        {tab === "report" && <Report info={info} notes={notes} results={results} steps={steps} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function WhatsNew({ groups, notes, problems }: { groups: ReturnType<typeof groupCommits>; notes: ReturnType<typeof parseLatest>["notes"]; problems: string[] }) {
  const pr = (n?: number) =>
    n ? (
      <a className="th-pr" href={`https://github.com/orionopenwow/LensUI/pull/${n}`} target="_blank" rel="noreferrer">
        #{n}
      </a>
    ) : null;
  const noteGroups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof notes>["changes"]>();
    for (const c of notes?.changes ?? []) {
      if (!m.has(c.area)) m.set(c.area, []);
      m.get(c.area)!.push(c);
    }
    return [...m.entries()];
  }, [notes]);

  if (!noteGroups.length && !groups.length) {
    return <Empty title="No release notes in this build" body="Development builds don't carry notes. Builds made with `bun run build` include the latest changes." />;
  }
  return (
    <div className="th-stack">
      {noteGroups.length > 0 && (
        <section className="th-section">
          <div className="th-section-title">Highlights</div>
          {noteGroups.map(([area, items]) => (
            <div key={area} className="th-group">
              <div className="th-group-label">{area}</div>
              <ul className="th-list">
                {items.map((c, i) => (
                  <li key={i}>
                    <span className="th-item-title">{c.title}</span> {pr(c.pr)}
                    {c.detail ? <div className="th-item-detail">{c.detail}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {groups.length > 0 && (
        <section className="th-section">
          <div className="th-section-title">All changes</div>
          {groups.map((g) => (
            <div key={g.area} className="th-group">
              <div className="th-group-label">
                {g.area} <span className="th-count">{g.items.length}</span>
              </div>
              <ul className="th-list th-list-compact">
                {g.items.slice(0, 12).map((c) => (
                  <li key={c.sha}>
                    {c.title} {pr(c.pr)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {notes?.known_issues.length ? (
        <section className="th-section">
          <div className="th-section-title">Known issues</div>
          <ul className="th-list">
            {notes.known_issues.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {problems.length > 0 && <div className="th-fine">Some note entries were skipped: {problems.slice(0, 3).join("; ")}</div>}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="th-empty">
      <div className="th-empty-title">{title}</div>
      <div className="th-empty-body">{body}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function Checklist({
  steps,
  results,
  loaded,
  onUpdate,
}: {
  steps: LatestStep[];
  results: Results;
  loaded: boolean;
  onUpdate: (id: string, patch: Partial<Results["steps"][string]>) => void;
}) {
  const [filter, setFilter] = useState<RiskFilter>("all");
  const shown = visibleSteps(steps, results, filter);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dropRef = useRef<string | null>(null);
  dropRef.current = dropTarget;

  // Screenshots are attached by dropping image files onto a step (the tester picks them;
  // Lens never captures the screen). Paths come from the window's file-drop event.
  useEffect(() => {
    let off: (() => void) | undefined;
    const w = getCurrentWindow() as unknown as { onDragDropEvent?: (cb: (e: { payload: { type: string; paths?: string[] } }) => void) => Promise<() => void> };
    w.onDragDropEvent?.((e) => {
      if (e.payload.type !== "drop" || !dropRef.current) return;
      const id = dropRef.current;
      const imgs = (e.payload.paths ?? []).filter((p) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(p));
      if (imgs.length) {
        const prev = results.steps[id]?.screenshots ?? [];
        onUpdate(id, { screenshots: [...prev, ...imgs].slice(0, 12) });
      }
      setDropTarget(null);
    })
      .then((u) => (off = u))
      .catch(() => {});
    return () => off?.();
  }, [results, onUpdate]);

  if (!steps.length) {
    return <Empty title="No test steps for this build" body="The daily tester notes add steps here. Until then, explore freely and use Session log › Mark moment when something looks wrong." />;
  }

  const onRowKey = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
    const s = STATUS.find((x) => x.key === e.key.toLowerCase());
    if (s) {
      e.preventDefault();
      onUpdate(id, { status: results.steps[id]?.status === s.id ? "todo" : s.id });
    }
  };

  return (
    <div className="th-stack">
      <div className="th-filters" role="group" aria-label="Filter steps">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`th-chip ${filter === f.id ? "active" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <span className="th-fine th-filters-hint">Focus a step and press P, F or S</span>
      </div>
      {!loaded && <div className="th-fine">Loading your earlier results…</div>}
      {shown.length === 0 && <div className="th-fine">Nothing matches this filter.</div>}
      {shown.map((s) => {
        const r = results.steps[s.id];
        const status = r?.status ?? "todo";
        return (
          <div
            key={s.id}
            className={`th-step th-step-${status} ${dropTarget === s.id ? "dropping" : ""}`}
            tabIndex={0}
            onKeyDown={(e) => onRowKey(e, s.id)}
            onDragEnter={() => setDropTarget(s.id)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dropTarget !== s.id) setDropTarget(s.id);
            }}
            aria-label={`${s.area} step ${s.id}, ${s.risk} risk, ${status === "todo" ? "not tested" : status}`}
          >
            <div className="th-step-head">
              <span className={`th-risk th-risk-${s.risk}`}>{s.risk === "med" ? "medium" : s.risk}</span>
              <span className="th-step-area">{s.area}</span>
              <span className="th-step-id th-mono">{s.id}</span>
              <div className="th-status" role="group" aria-label="Result">
                {STATUS.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className={`th-status-btn th-status-${x.id} ${status === x.id ? "active" : ""}`}
                    aria-pressed={status === x.id}
                    onClick={() => onUpdate(s.id, { status: status === x.id ? "todo" : x.id })}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="th-step-body">{s.steps}</div>
            {s.expected ? (
              <div className="th-step-expected">
                <span>Expected</span> {s.expected}
              </div>
            ) : null}
            <textarea
              className="th-notes"
              placeholder={status === "fail" ? "What happened instead? Steps to reproduce help a lot." : "Notes (optional)"}
              value={r?.notes ?? ""}
              rows={status === "fail" ? 3 : 1}
              onChange={(e) => onUpdate(s.id, { notes: e.target.value.slice(0, 4000) })}
            />
            <div className="th-shots">
              {(r?.screenshots ?? []).map((p, i) => (
                <span key={p + i} className="th-shot">
                  {p.split(/[\\/]/).pop()}
                  <button type="button" aria-label="Remove screenshot" onClick={() => onUpdate(s.id, { screenshots: (r?.screenshots ?? []).filter((_, j) => j !== i) })}>
                    ×
                  </button>
                </span>
              ))}
              <span className="th-fine">Drop screenshots here to attach them</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function SessionLog() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [levels, setLevels] = useState<Set<LogLine["level"]>>(new Set(["error", "warn", "info", "mark"]));
  const [area, setArea] = useState("all");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    let live = true;
    const pull = async () => {
      const fresh = await getLog(last.current, 500);
      if (!live || !fresh.length) return;
      last.current = fresh[fresh.length - 1].seq;
      setLines((prev) => [...prev, ...fresh].slice(-2000));
    };
    pull();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") pull();
    }, 2000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, []);

  const areas = useMemo(() => ["all", ...[...new Set(lines.map((l) => l.area))].sort()], [lines]);
  const shown = lines.filter((l) => levels.has(l.level) && (area === "all" || l.area === area));

  const mark = async () => {
    const line = await markMoment(note.trim());
    if (line) {
      last.current = Math.max(last.current, line.seq);
      setLines((p) => [...p, line]);
    }
    setNote("");
  };

  const copy = () => {
    const text = shown.map((l) => `${fmtTime(l.atMs)} ${l.level.toUpperCase()} ${l.area}: ${l.message}`).join("\n");
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => {}
    );
  };

  return (
    <div className="th-stack">
      <div className="th-mark">
        <input
          className="th-input"
          placeholder="Something looked wrong? Note it and mark the moment"
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && mark()}
        />
        <button type="button" className="th-btn th-btn-primary" onClick={mark}>
          Mark moment
        </button>
      </div>
      <div className="th-filters" role="group" aria-label="Filter log">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            className={`th-chip th-level-${l} ${levels.has(l) ? "active" : ""}`}
            aria-pressed={levels.has(l)}
            onClick={() =>
              setLevels((s) => {
                const n = new Set(s);
                if (n.has(l)) n.delete(l);
                else n.add(l);
                return n;
              })
            }
          >
            {l === "mark" ? "Marks" : l[0].toUpperCase() + l.slice(1)}
          </button>
        ))}
        <select className="th-select" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
          {areas.map((a) => (
            <option key={a} value={a}>
              {a === "all" ? "All areas" : a}
            </option>
          ))}
        </select>
        <button type="button" className="th-btn" onClick={copy} disabled={!shown.length}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="th-log" role="log" aria-live="polite">
        {shown.length === 0 ? (
          <div className="th-fine">No log lines yet. Lens records warnings, errors and your marks here; secrets and personal paths are removed.</div>
        ) : (
          shown.slice(-400).map((l) => (
            <div key={l.seq} className={`th-log-line th-log-${l.level}`}>
              <span className="th-log-time">{fmtTime(l.atMs)}</span>
              <span className="th-log-level">{l.level === "mark" ? "MARK" : l.level.toUpperCase()}</span>
              <span className="th-log-area">{l.area}</span>
              <span className="th-log-msg">{l.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function Report({ info, notes, results, steps }: { info: BuildInfo; notes: ReturnType<typeof parseLatest>["notes"]; results: Results; steps: LatestStep[] }) {
  const [env, setEnv] = useState<EnvSummary | null>(null);
  const [includeConfig, setIncludeConfig] = useState(true);
  const [plan, setPlan] = useState<ExportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ExportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selfTest, setSelfTest] = useState<string | null>(null);

  useEffect(() => {
    getEnvironment().then(setEnv);
  }, []);

  const screenshots = useMemo(() => Object.values(results.steps).flatMap((s) => s.screenshots), [results]);
  const failed = steps.filter((s) => results.steps[s.id]?.status === "fail").map((s) => ({ step: s, result: results.steps[s.id]! }));

  const preview = async () => {
    setErr(null);
    setDone(null);
    const p = await exportPlan(screenshots);
    if (!p) setErr("Exporting needs the Lens desktop app.");
    setPlan(p);
  };

  const doExport = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await exportReport({
        reportMd: reportMarkdown(info, notes, results, env),
        resultsJson: JSON.stringify(results),
        screenshots,
        includeConfig,
      });
      setDone(r);
      setPlan(null);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const files = plan?.files.filter((f) => includeConfig || !f.startsWith("config-redacted.json")) ?? [];

  return (
    <div className="th-stack">
      <section className="th-section">
        <div className="th-section-title">This PC</div>
        <dl className="th-env">
          <dt>Windows</dt>
          <dd>{env?.windows ?? "—"}</dd>
          <dt>Processor</dt>
          <dd>{env?.cpu ?? "—"}</dd>
          <dt>Graphics</dt>
          <dd>{env?.gpus.length ? env.gpus.join(", ") : "—"}</dd>
          <dt>Memory</dt>
          <dd>{env ? `${env.ramGb} GB` : "—"}</dd>
          <dt>Displays</dt>
          <dd>{env?.displays.length ? env.displays.map((d) => `${d.width}×${d.height} at ${Math.round(d.scale * 100)}%${d.primary ? " (main)" : ""}`).join(" · ") : "—"}</dd>
        </dl>
      </section>

      <section className="th-section">
        <div className="th-row">
          <div>
            <div className="th-section-title">Export a test report</div>
            <div className="th-fine">One zip in your Downloads folder. Nothing is uploaded. API keys, e-mail addresses, your user name and clipboard or Shelf contents are removed.</div>
          </div>
          <button type="button" className="th-btn th-btn-primary" onClick={preview} disabled={busy}>
            Export…
          </button>
        </div>
        <label className="th-check">
          <input type="checkbox" checked={includeConfig} onChange={(e) => setIncludeConfig(e.target.checked)} />
          Include my Lens settings (redacted)
        </label>
        {plan && (
          <div className="th-confirm" role="dialog" aria-label="Confirm export">
            <div className="th-confirm-title">The zip will contain</div>
            <ul className="th-list th-list-compact">
              {files.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {plan.skipped.length > 0 && <div className="th-fine">Left out: {plan.skipped.join("; ")}</div>}
            <div className="th-fine">Saved to {plan.folder}</div>
            <div className="th-actions">
              <button type="button" className="th-btn" onClick={() => setPlan(null)}>
                Cancel
              </button>
              <button type="button" className="th-btn th-btn-primary" onClick={doExport} disabled={busy} autoFocus>
                {busy ? "Exporting…" : "Export zip"}
              </button>
            </div>
          </div>
        )}
        {done && (
          <div className="th-done" role="status">
            Saved <span className="th-mono">{done.path.split(/[\\/]/).pop()}</span> with {done.files.length} files.
            <button type="button" className="th-link" onClick={() => revealReport(done.path)}>
              Show in folder
            </button>
          </div>
        )}
        {err && <div className="th-error">{err}</div>}
      </section>

      <section className="th-section">
        <div className="th-row">
          <div>
            <div className="th-section-title">Report an issue</div>
            <div className="th-fine">Opens GitHub with the build, this PC and your failed steps filled in. Drag the zip into the issue yourself.</div>
          </div>
          <button type="button" className="th-btn" onClick={() => openIssue(issueTitle(failed), issueBody(info, env, failed)).catch((e) => setErr(String(e)))}>
            Open GitHub issue
          </button>
        </div>
      </section>

      <section className="th-section">
        <div className="th-row">
          <div>
            <div className="th-section-title">Self-test</div>
            <div className="th-fine">Checks Lens without changing anything. The result goes into your notes or the issue.</div>
          </div>
          <button
            type="button"
            className="th-btn"
            onClick={() =>
              runSelfTest()
                .then((r) => setSelfTest(r.text))
                .catch(() => setSelfTest("Self-test isn't available in this build."))
            }
          >
            Run self-test
          </button>
        </div>
        {selfTest && <pre className="th-pre">{selfTest}</pre>}
      </section>
    </div>
  );
}

/** Small corner badge for the top bar when tester mode is on (see docs/TESTER_HUB.md). */
export function TesterBadge({ info = defaultBuildInfo, onClick }: { info?: BuildInfo; onClick?: () => void }) {
  return (
    <button type="button" className="th-badge" onClick={onClick} aria-label={`Test build ${(info.sha || "dev").slice(0, 7)}. Open Tester Hub`}>
      TEST BUILD <span className="th-mono">{(info.sha || "dev").slice(0, 7)}</span>
    </button>
  );
}
