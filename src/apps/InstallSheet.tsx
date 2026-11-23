// The install flow for one app, as a sheet over the detail page:
//   confirm (what will happen, winget agreements) → progress (stages, cancel)
//   → [release only] second confirmation (checksum + signature) → done → setup recipe preview.
// Nothing changes the machine until the user presses the primary button in a confirm step.
import { useEffect, useMemo, useState } from "react";
import { applyRecipe, cancelJob, discardRelease, prepareRelease, recipePreview, runApp, runRelease, showApp } from "./api";
import { STAGE_LABEL, STAGES, type JobState } from "./jobs";
import type { AppShow, CatalogApp, PreparedRelease, RecipeStepView } from "./types";

export type SheetOp = "install" | "upgrade" | "uninstall";

export interface InstallSheetProps {
  app: CatalogApp;
  op: SheetOp;
  job: JobState | null;
  onClose: () => void;
  /** For screenshots/tests: start in a given phase with canned data. */
  demo?: { phase: Phase; show?: AppShow; release?: PreparedRelease; recipe?: RecipeStepView[] };
}

type Phase = "confirm" | "progress" | "releaseConfirm" | "recipe" | "done" | "error";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(bytes > 100 * 1_048_576 ? 0 : 1)} MB`;
}

export function InstallSheet({ app, op, job, onClose, demo }: InstallSheetProps) {
  const [phase, setPhase] = useState<Phase>(demo?.phase ?? "confirm");
  const [show, setShow] = useState<AppShow | null>(demo?.show ?? null);
  const [showError, setShowError] = useState<string | null>(null);
  const [release, setRelease] = useState<PreparedRelease | null>(demo?.release ?? null);
  const [recipe, setRecipe] = useState<RecipeStepView[] | null>(demo?.recipe ?? null);
  const [chosen, setChosen] = useState<Set<number>>(new Set((demo?.recipe ?? []).map((s) => s.index)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isWinget = app.install.method === "winget";
  const isRelease = app.install.method === "githubRelease";

  // winget: load the authoritative version, publisher, licence and agreements before Install is enabled.
  useEffect(() => {
    if (demo || !isWinget || op !== "install") return;
    showApp(app.id).then(setShow, (e) => setShowError(String(e)));
  }, [app.id, isWinget, op, demo]);

  // Follow the job.
  useEffect(() => {
    if (!job || demo) return;
    if (job.finished && job.ok && phase === "progress") {
      if (op === "uninstall") setPhase("done");
      else
        recipePreview(app.id).then(
          (r) => {
            setRecipe(r);
            setChosen(new Set(r.map((s) => s.index)));
            setPhase(r.length ? "recipe" : "done");
          },
          () => setPhase("done"),
        );
    } else if (job.finished && !job.ok && phase === "progress") {
      setError(job.message);
      setPhase("error");
    }
  }, [job, phase, op, app.id, demo]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      if (isRelease) {
        setPhase("progress");
        const r = await prepareRelease(app.id);
        setRelease(r);
        setPhase("releaseConfirm");
      } else {
        await runApp(app.id, op);
        setPhase("progress");
      }
    } catch (e) {
      setError(String(e));
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  async function runPrepared() {
    if (!release) return;
    setBusy(true);
    try {
      await runRelease(release.token);
      const r = await recipePreview(app.id).catch(() => []);
      setRecipe(r);
      setChosen(new Set(r.map((s) => s.index)));
      setPhase(r.length ? "recipe" : "done");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      await applyRecipe(app.id, [...chosen].sort((a, b) => a - b));
      setPhase("done");
    } catch (e) {
      setError(String(e));
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  const verb = op === "install" ? "Install" : op === "upgrade" ? "Update" : "Uninstall";
  const signed = release?.signatureStatus === "Valid";
  const stageIndex = useMemo(() => (job ? STAGES.indexOf(job.stage) : -1), [job]);

  return (
    <div className="la-sheet" role="dialog" aria-modal="true" aria-labelledby="la-sheet-title" onKeyDown={(e) => e.key === "Escape" && phase !== "progress" && onClose()}>
      <div className="la-sheet-card">
        <div className="la-sheet-head">
          <span className="la-sheet-title" id="la-sheet-title">
            {phase === "recipe" ? `Set up ${app.name}` : `${verb} ${app.name}`}
          </span>
          <span className="la-mono la-muted">{isWinget ? "winget" : isRelease ? `github.com/${(app.install as any).repo}` : app.install.method}</span>
        </div>

        {phase === "confirm" && (
          <div className="la-stack">
            {op === "uninstall" ? (
              <p className="la-p">Windows will run {app.name}'s own uninstaller. Your files made with it stay where they are. Lens also removes any setup it added (Dock pin, menus, voice phrases).</p>
            ) : isWinget ? (
              <>
                <p className="la-p">
                  Lens asks winget to {op === "upgrade" ? "update" : "install"} <b>{app.name}</b> from the Windows Package Manager community repository. winget downloads the publisher's installer and checks its SHA-256 hash before running it.
                </p>
                <dl className="la-facts">
                  <dt>Package</dt>
                  <dd className="la-mono">{(app.install as any).wingetId}</dd>
                  <dt>Version</dt>
                  <dd>{show?.version ?? (showError ? "—" : "Checking…")}</dd>
                  <dt>Publisher</dt>
                  <dd>{show?.publisher || app.publisher}</dd>
                  <dt>Licence</dt>
                  <dd>{show?.license || app.license}</dd>
                  {show?.installerUrl && (
                    <>
                      <dt>Downloads from</dt>
                      <dd className="la-mono">{hostOf(show.installerUrl)}</dd>
                    </>
                  )}
                </dl>
                {showError && <p className="la-warn">{showError}</p>}
                {!!show?.agreements.length && (
                  <div className="la-agreements">
                    <div className="la-label">Agreements you accept by installing</div>
                    {show.agreements.map((a) => (
                      <div key={a.label} className="la-agreement">
                        <span className="la-agreement-label">{a.label}</span>
                        <span className="la-agreement-text">{a.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="la-fine">If the installer needs administrator rights, Windows will ask you. Lens never elevates on its own.</p>
              </>
            ) : (
              <>
                <p className="la-p">
                  {app.name} isn't in winget yet, so Lens will download the Windows installer from the project's latest GitHub release, check it against the project's published checksum, and check its signature. You'll see the result and confirm again before anything runs.
                </p>
                <dl className="la-facts">
                  <dt>Release</dt>
                  <dd className="la-mono">github.com/{(app.install as any).repo}</dd>
                  <dt>Licence</dt>
                  <dd>{app.license}</dd>
                </dl>
              </>
            )}
            <div className="la-actions">
              <button className="la-btn" onClick={onClose}>
                Cancel <kbd>Esc</kbd>
              </button>
              <button
                className={`la-btn la-btn-primary${op === "uninstall" ? " la-btn-danger" : ""}`}
                disabled={busy || (isWinget && op === "install" && !show && !showError)}
                onClick={start}
                autoFocus
              >
                {isRelease ? "Download and check" : verb} <kbd>⏎</kbd>
              </button>
            </div>
          </div>
        )}

        {phase === "progress" && (
          <div className="la-stack">
            <ol className="la-steps">
              {(isRelease ? (["downloading", "verifying"] as const) : STAGES).map((s, i) => (
                <li key={s} className={`la-step${!job ? (i === 0 ? " now" : "") : job.stage === s ? " now" : !isRelease && stageIndex > i ? " done" : isRelease && job.stage === "verifying" && s === "downloading" ? " done" : ""}`}>
                  <span className="la-step-dot" />
                  {STAGE_LABEL[s]}
                </li>
              ))}
            </ol>
            <div className="la-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job?.overall ?? 0}>
              <span style={{ width: `${job?.overall ?? 2}%` }} />
            </div>
            <div className="la-row">
              <span className="la-mono la-muted">{job?.message ?? "Starting…"}</span>
              {job && !job.finished && (
                <button className="la-btn" onClick={() => cancelJob(job.jobId)}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {phase === "releaseConfirm" && release && (
          <div className="la-stack">
            <p className="la-p">Lens downloaded and checked the installer. Run it?</p>
            <dl className="la-facts">
              <dt>File</dt>
              <dd className="la-mono">{release.fileName}</dd>
              <dt>Release</dt>
              <dd className="la-mono">{release.tag || "latest"} · {mb(release.size)}</dd>
              <dt>Checksum</dt>
              <dd>
                {release.checksum === "verified" ? (
                  <span className="la-ok">Matches the project's published SHA-256</span>
                ) : (
                  <span className="la-warn-inline">The project doesn't publish a checksum for this file</span>
                )}
              </dd>
              <dt>Signature</dt>
              <dd>{signed ? <span className="la-ok">Signed by {release.publisher ?? "a trusted publisher"}</span> : <span className="la-warn-inline">{release.signatureStatus === "NotSigned" ? "Not signed — Windows SmartScreen may warn" : `Signature: ${release.signatureStatus}`}</span>}</dd>
              <dt>SHA-256</dt>
              <dd className="la-mono la-hash">{release.sha256}</dd>
            </dl>
            <p className="la-fine">The installer opens its own window. Lens re-checks the file right before it runs.</p>
            <div className="la-actions">
              <button
                className="la-btn"
                onClick={() => {
                  discardRelease(release.token);
                  onClose();
                }}
              >
                Delete download
              </button>
              <button className="la-btn la-btn-primary" disabled={busy} onClick={runPrepared} autoFocus>
                Run installer <kbd>⏎</kbd>
              </button>
            </div>
          </div>
        )}

        {phase === "recipe" && recipe && (
          <div className="la-stack">
            <p className="la-p">Choose how Lens works with {app.name}. Each step can be undone from the app's page.</p>
            <ul className="la-recipe">
              {recipe.map((s) => (
                <li key={s.index}>
                  <label className="la-check">
                    <input
                      type="checkbox"
                      checked={chosen.has(s.index)}
                      onChange={(e) => {
                        const n = new Set(chosen);
                        e.target.checked ? n.add(s.index) : n.delete(s.index);
                        setChosen(n);
                      }}
                    />
                    <span>{s.description}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="la-actions">
              <button className="la-btn" onClick={() => setPhase("done")}>
                Skip
              </button>
              <button className="la-btn la-btn-primary" disabled={busy || chosen.size === 0} onClick={apply} autoFocus>
                Apply {chosen.size} <kbd>⏎</kbd>
              </button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="la-stack">
            <p className="la-p la-ok">{op === "uninstall" ? `${app.name} was removed.` : `${app.name} is ready.`}</p>
            <div className="la-actions">
              <button className="la-btn la-btn-primary" onClick={onClose} autoFocus>
                Done <kbd>⏎</kbd>
              </button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="la-stack">
            <p className="la-warn">{error ?? "Something went wrong."}</p>
            {"fallbackUrl" in app.install && app.install.fallbackUrl && <p className="la-fine">You can still get it from the official page: {app.install.fallbackUrl}</p>}
            <div className="la-actions">
              <button className="la-btn" onClick={onClose}>
                Close
              </button>
              <button className="la-btn la-btn-primary" onClick={() => setPhase("confirm")}>
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
