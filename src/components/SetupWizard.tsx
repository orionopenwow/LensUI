import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { LensConfig, WindowsThemeInfo } from "../types/lens";
import { allPacks, applyThemePack, packById, recommendedPacks } from "../themes/packs";
import { PackCard } from "./ThemeGallery";
import { DOCK_STYLES, DockStylePreview, dockStyleLabel, dockStyleOf, withDock } from "../themeux/dockStyleOptions";

interface SetupWizardProps {
  config: LensConfig;
  winTheme: WindowsThemeInfo;
  onUpdateConfig: (next: LensConfig) => void;
  /** Kept for compatibility with older callers; the wizard now applies packs itself. */
  onApplyMasterTheme?: (id: "obsidian" | "windows-mesh" | "stealth" | "midnight-neon") => void;
  onFinish: () => void;
}

const STEPS = ["Welcome", "Look", "Dock", "Windows", "Done"] as const;

/** The four dock layouts offered during setup (the rest are one click away in Control Center). */
const WIZARD_DOCKS = ["floating", "slim", "taskbar", "split"];

export const SetupWizard: React.FC<SetupWizardProps> = ({ config, winTheme, onUpdateConfig, onFinish }) => {
  const [step, setStep] = useState(0);
  const [selfTest, setSelfTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Snapshot taken when the wizard opens, so "Undo all changes" can put everything back.
  const initialRef = useRef<LensConfig>(config);

  const accent = config.theme.accentMode === "custom" ? config.theme.customAccent : winTheme.accentHex;
  const last = STEPS.length - 1;

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const finish = () => {
    onUpdateConfig({ ...config, onboardingCompleted: true });
    onFinish();
  };

  const next = () => (step < last ? setStep(step + 1) : finish());
  const back = () => step > 0 && setStep(step - 1);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Escape leaves setup without changing anything else; it can be reopened from Control Center.
    if (e.key === "Escape") {
      e.preventDefault();
      finish();
    }
    // Alt+Left / Alt+Right move between steps from anywhere in the wizard.
    if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  };

  const runSelfTest = () => {
    setTesting(true);
    invoke<{ ok: boolean; text: string }>("run_self_test_cmd")
      .then((r) => setSelfTest(r))
      .catch((err) => setSelfTest({ ok: false, text: String(err) }))
      .finally(() => setTesting(false));
  };

  const pack = packById(config.theme.preset);
  const toggle = (key: "hideNativeTaskbar" | "runOnStartup") =>
    onUpdateConfig({ ...config, func: { ...config.func, [key]: !config.func[key] } });

  return (
    <div className="wiz" role="dialog" aria-modal="true" aria-labelledby="wiz-heading" onKeyDown={onKeyDown}>
      <header className="wiz-top">
        <ol className="wiz-steps" aria-label="Setup steps">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                className={`wiz-step ${i === step ? "active" : i < step ? "done" : ""}`}
                aria-current={i === step ? "step" : undefined}
                onClick={() => setStep(i)}
              >
                <span className="wiz-step-num">{i < step ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="cc-btn-ghost tux-small-btn" onClick={finish}>
          Skip setup
        </button>
      </header>

      <div className="wiz-stage">
        {step === 0 && (
          <div className="wiz-welcome">
            <span className="wiz-mark" aria-hidden>
              <Sparkles size={22} />
            </span>
            <h1 id="wiz-heading" ref={headingRef} tabIndex={-1} className="wiz-h1">
              Welcome to Lens UI
            </h1>
            <p className="wiz-lead">
              A glass Dock, Top Bar and Control Center for Windows 10 and 11. Three quick choices and you are done.
              Everything previews live, every step can be skipped, and you can change all of it later.
            </p>
            <ul className="wiz-points">
              <li>Nothing here is permanent. Your Windows settings come back when Lens closes.</li>
              <li>Use Tab to move, Enter to choose, Alt+← and Alt+→ to change step, Esc to leave.</li>
            </ul>
          </div>
        )}

        {step === 1 && (
          <>
            <div>
              <h1 id="wiz-heading" ref={headingRef} tabIndex={-1} className="wiz-h2">
                Pick a look
              </h1>
              <p className="wiz-sub">
                Six favourites to start with. There are {allPacks().length} in total in Control Center → Theme &amp; Look.
              </p>
            </div>
            <div className="wiz-pack-grid">
              {recommendedPacks().map((p) => (
                <PackCard
                  key={p.id}
                  pack={p}
                  meta={false}
                  active={config.theme.preset === p.id}
                  accent={p.accentMode === "windows" ? winTheme.accentHex : p.accent}
                  onApply={(id) => onUpdateConfig(applyThemePack(config, id))}
                />
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h1 id="wiz-heading" ref={headingRef} tabIndex={-1} className="wiz-h2">
                Pick a Dock
              </h1>
              <p className="wiz-sub">
                {pack?.dockStyle
                  ? `${pack.label} is designed around the ${dockStyleLabel(pack.dockStyle)} Dock, but any of these works.`
                  : "Choose how your apps sit along the bottom of the screen."}
              </p>
            </div>
            <div className="wiz-dock-grid" role="radiogroup" aria-label="Dock style">
              {DOCK_STYLES.filter((d) => WIZARD_DOCKS.includes(d.id)).map((d) => {
                const on = dockStyleOf(config) === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`tux-dock-card ${on ? "active" : ""}`}
                    onClick={() => onUpdateConfig(withDock({ ...config, dock: { ...config.dock, iconSize: d.recommendedIconSize } }, { style: d.id }))}
                  >
                    <DockStylePreview styleId={d.id} accent={accent} height={72} />
                    <span className="tux-pack-name">
                      <span className="tux-pack-label">
                        {d.label}
                        {pack?.dockStyle === d.id && <span className="tux-badge muted wiz-match">Matches theme</span>}
                      </span>
                      {on && <span className="tux-pack-dot" />}
                    </span>
                    <span className="tux-pack-desc">{d.description}</span>
                  </button>
                );
              })}
            </div>
            <p className="wiz-sub">Studio and Minimal styles, size and position are in Control Center → Dock &amp; Top Bar.</p>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h1 id="wiz-heading" ref={headingRef} tabIndex={-1} className="wiz-h2">
                Work with Windows
              </h1>
              <p className="wiz-sub">How much of Windows Lens takes over. Leave these off if you are not sure.</p>
            </div>
            <div className="cc-card wiz-options">
              <div className="tux-row">
                <div className="tux-row-text">
                  <div className="cc-label">Hide the Windows taskbar</div>
                  <div className="cc-desc">
                    Use the Lens Dock instead. The taskbar comes back as soon as Lens closes, even after a crash.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.func.hideNativeTaskbar}
                  aria-label="Hide the Windows taskbar"
                  className={`cc-toggle ${config.func.hideNativeTaskbar ? "on" : ""}`}
                  onClick={() => toggle("hideNativeTaskbar")}
                />
              </div>
              <div className="tux-row">
                <div className="tux-row-text">
                  <div className="cc-label">Start Lens with Windows</div>
                  <div className="cc-desc">Opens Lens when you sign in. Adds one entry to your startup apps that Lens removes when you turn this off.</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.func.runOnStartup}
                  aria-label="Start Lens with Windows"
                  className={`cc-toggle ${config.func.runOnStartup ? "on" : ""}`}
                  onClick={() => toggle("runOnStartup")}
                />
              </div>
              <div className="tux-row wiz-unavailable">
                <div className="tux-row-text">
                  <div className="cc-label">Windows key opens the Launcher</div>
                  <div className="cc-desc">
                    Not available yet: Windows keeps the Windows key for its own Start menu. Press Alt+Space to search apps and settings.
                  </div>
                </div>
                <button type="button" role="switch" aria-checked={false} aria-disabled="true" aria-label="Windows key opens the Launcher (not available yet)" className="cc-toggle" disabled />
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <h1 id="wiz-heading" ref={headingRef} tabIndex={-1} className="wiz-h2">
                You are all set
              </h1>
              <p className="wiz-sub">Here is what you chose. Everything can be changed later.</p>
            </div>
            <div className="cc-card wiz-summary">
              {[
                { label: "Theme", value: pack?.label ?? "Custom" },
                { label: "Dock", value: dockStyleLabel(dockStyleOf(config)) },
                { label: "Windows taskbar", value: config.func.hideNativeTaskbar ? "Hidden while Lens runs" : "Visible" },
                { label: "Start with Windows", value: config.func.runOnStartup ? "On" : "Off" },
              ].map((r) => (
                <div key={r.label} className="wiz-summary-row">
                  <span>{r.label}</span>
                  <span className="tux-value">{r.value}</span>
                </div>
              ))}
            </div>
            <div className="cc-card wiz-where">
              <div className="cc-label">Where settings live</div>
              <div className="cc-desc">
                Control Center has everything: Theme &amp; Look for colours and themes, Dock &amp; Top Bar for layout, and Windows &amp; Quick for
                startup and shortcuts. Open it from the Dock, or press Alt+Space and type “settings”. You can run this setup again from the
                bottom of the Control Center sidebar.
              </div>
              <div className="tux-row">
                <div className="tux-row-text">
                  <div className="cc-label">Self-test</div>
                  <div className="cc-desc">Checks that the Dock, Top Bar and window styling are working on this PC.</div>
                </div>
                <button type="button" className="cc-btn-ghost tux-small-btn" onClick={runSelfTest} disabled={testing}>
                  {testing ? "Running…" : "Run self-test"}
                </button>
              </div>
              {selfTest && (
                <pre className={`cc-input wiz-selftest ${selfTest.ok ? "ok" : "bad"}`} aria-live="polite">
                  {selfTest.text}
                </pre>
              )}
            </div>
          </>
        )}
      </div>

      <footer className="wiz-foot">
        <button type="button" className="cc-btn-ghost tux-small-btn" onClick={back} disabled={step === 0}>
          <ChevronLeft size={14} /> Back
        </button>
        <div className="wiz-foot-right">
          {step > 0 && step < last && (
            <button
              type="button"
              className="tux-link wiz-skip"
              onClick={() => {
                if (step === 1 || step === 2 || step === 3) onUpdateConfig({ ...initialRefFor(step, initialRef.current, config) });
                next();
              }}
            >
              Skip this step
            </button>
          )}
          <button type="button" className="cc-btn tux-small-btn" data-wiz-next onClick={next}>
            {step === 0 ? "Get started" : step === last ? "Finish" : "Continue"} {step < last && <ChevronRight size={14} />}
          </button>
        </div>
      </footer>
    </div>
  );
};

/**
 * "Skip this step" also undoes anything changed on that step, so skipping always means
 * "keep what I had". Only the fields the step touches are restored.
 */
function initialRefFor(step: number, initial: LensConfig, current: LensConfig): LensConfig {
  if (step === 1) {
    return {
      ...current,
      theme: initial.theme,
      iconStyle: initial.iconStyle,
      folderStyle: initial.folderStyle,
      windowControls: initial.windowControls,
      dock: { ...current.dock, pinnedFolders: initial.dock.pinnedFolders },
    };
  }
  if (step === 2) {
    const d = initial.dock as LensConfig["dock"] & { style?: string };
    return withDock({ ...current, dock: { ...current.dock, iconSize: initial.dock.iconSize } }, { style: d.style });
  }
  if (step === 3) {
    return {
      ...current,
      func: { ...current.func, hideNativeTaskbar: initial.func.hideNativeTaskbar, runOnStartup: initial.func.runOnStartup },
    };
  }
  return current;
}
