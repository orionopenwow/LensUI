// Lens setup (docs/SETUP.md). Opens on the first launch and once after every new version.
// Nothing changes until Finish: every choice here is a draft, previews draw from it, and Finish
// writes only what was picked (src/setup/flow.ts). Skip leaves everything as it is.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStartupBlock } from "../hooks/useStartupBlock";
import { Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { LensConfig, WindowsThemeInfo } from "../types/lens";
import { packById } from "../themes/packs";
import { FEATURED_LOOKS, lookPack } from "../themes/featured";
import { accentFromUrl } from "../themes/accentFromImage";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { PackCard } from "./ThemeGallery";
import { DOCK_STYLES, DockScenePreview, dockStyleLabel, dockStyleOf } from "../dock/styles";
import { enableAmbientBackdrop } from "../playground/ambient/controls";
import { glideIn, swapDirection, swapIn } from "../ui/motion";
import {
  applyChoices,
  describeChoices,
  extrasFor,
  FIND_LATER,
  looksFor,
  NO_CHOICES,
  suggestFromDesktop,
  whatsNewSince,
  type ColourScheme,
  type ExtraId,
  type SetupChoices,
  type SetupReason,
} from "../setup/flow";

interface SetupWizardProps {
  config: LensConfig;
  winTheme: WindowsThemeInfo;
  /** Why it opened: first launch (or "Run setup again"), a new version, or the launcher asked. */
  reason?: SetupReason;
  /** The running Lens version ("" when unknown). */
  version?: string;
  /** The version whose setup was seen last ("" = none). */
  seenVersion?: string;
  onUpdateConfig: (next: LensConfig) => void;
  /** Kept for compatibility with older callers. */
  onApplyMasterTheme?: (id: "obsidian" | "windows-mesh" | "stealth" | "midnight-neon") => void;
  onFinish: () => void;
}

type Page = "welcome" | "whatsnew" | "dock" | "colour" | "extras" | "done";

const PAGE_LABEL: Record<Page, string> = {
  welcome: "Welcome",
  whatsnew: "What's new",
  dock: "Dock",
  colour: "Colour",
  extras: "Extras",
  done: "Done",
};

/** The Dock layouts offered here; the rest are one click away in Settings › Dock & Bar. Swatch colours live in CSS (.wiz-swatch-N). */
const SETUP_DOCKS = ["floating", "slim", "taskbar", "split"];
const EDGES = [
  { id: "bottom", label: "Bottom" },
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "top", label: "Top" },
] as const;
const SCHEMES: { id: ColourScheme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "auto", label: "Day & night" },
];
const SWATCHES = ["#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#22c55e", "#14b8a6"];

export const SetupWizard: React.FC<SetupWizardProps> = ({
  config,
  winTheme,
  reason = "first",
  version = "",
  seenVersion = "",
  onUpdateConfig,
  onFinish,
}) => {
  const startupBlock = useStartupBlock();
  // The config as it was when setup opened: Finish applies the choices to it, Skip keeps it.
  const baseRef = useRef<LensConfig>(config);
  const [choices, setChoices] = useState<SetupChoices>(NO_CHOICES);
  const [scheme, setScheme] = useState<ColourScheme>("dark");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // First run starts from the person's own desktop colours (see suggestFromDesktop): a draft only,
  // every option stays on offer, Finish writes it, Skip leaves nothing behind.
  const [fromDesktop, setFromDesktop] = useState(false);
  useEffect(() => {
    if (reason !== "first") return;
    let alive = true;
    (async () => {
      let wallpaperAccent: string | null = null;
      try {
        const path = await invoke<string | null>("snapshot_windows_wallpaper_cmd");
        if (path) wallpaperAccent = (await accentFromUrl(convertFileSrc(path)))?.accent ?? null;
      } catch {
        /* no wallpaper to read: Windows' accent alone */
      }
      if (!alive) return;
      const sug = suggestFromDesktop(
        { windowsAccent: winTheme.accentHex, wallpaperAccent, lightApps: !!winTheme.appsUseLightTheme },
        FEATURED_LOOKS.map((l) => ({ id: l.id, accent: packById(l.id)?.accent ?? "#888888" })),
      );
      setScheme(sug.scheme);
      // Only fill what the person hasn't picked yet.
      setChoices((c) => ({ ...c, look: c.look ?? (sug.look === baseRef.current.theme.preset ? undefined : sug.look), accent: c.accent ?? sug.accent, scheme: c.scheme ?? sug.scheme }));
      setFromDesktop(true);
    })();
    return () => {
      alive = false;
    };
    // Read once when setup opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isUpdate = reason !== "first";
  const notes = useMemo(() => (isUpdate ? whatsNewSince(reason === "forced" ? "" : seenVersion, version || "999") : []), [isUpdate, reason, seenVersion, version]);
  const extras = useMemo(() => extrasFor(reason, seenVersion, baseRef.current), [reason, seenVersion]);
  const pages: Page[] = useMemo(() => {
    if (!isUpdate) return ["welcome", "dock", "colour", "extras", "done"];
    const p: Page[] = [];
    if (notes.length) p.push("whatsnew");
    if (extras.length) p.push("extras");
    p.push("done");
    return p;
  }, [isUpdate, notes.length, extras.length]);
  const [index, setIndex] = useState(0);
  const page = pages[Math.min(index, pages.length - 1)];
  const last = pages.length - 1;

  // Steps swap in the direction of travel (DESIGN.md §5.3): forward from the right, back from the
  // left; the first step just arrives. Interrupting (fast Alt+→) restarts from the new content.
  const prevIndex = useRef(-1);
  useEffect(() => {
    headingRef.current?.focus();
    const dir = swapDirection(prevIndex.current, index);
    prevIndex.current = index;
    if (dir === "none") glideIn(stageRef.current, { y: 8, opacity: 0 });
    else swapIn(stageRef.current, dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const base = baseRef.current;
  const preview = useMemo(() => applyChoices(base, choices, version), [base, choices, version]);
  const previewDock = dockStyleOf(preview);
  const previewPack = packById(preview.theme.preset);
  const previewAccent =
    preview.theme.accentMode === "custom" ? preview.theme.customAccent : preview.theme.accentMode === "windows" ? winTheme.accentHex : previewPack?.accent ?? winTheme.accentHex;
  // The setup screens wear the accent being picked (from the desktop at first), so they look like
  // the person's own desktop from the first page.
  const wizRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wizRef.current?.style.setProperty("--lens-accent", previewAccent);
  }, [previewAccent]);

  /** Leaves setup without changing anything but the "seen" markers. */
  const skipAll = () => {
    onUpdateConfig({ ...config, onboardingCompleted: true, setupSeenVersion: version || config.setupSeenVersion || "" });
    onFinish();
  };

  /** Writes the choices (only those) and closes. */
  const finish = () => {
    onUpdateConfig({ ...applyChoices(config, choices, version || config.setupSeenVersion || "") });
    if (choices.extras.ambientBackdrop) enableAmbientBackdrop().catch(() => {});
    onFinish();
  };

  const next = () => (index < last ? setIndex(index + 1) : finish());
  const back = () => index > 0 && setIndex(index - 1);

  /** "Skip this step" forgets what was picked on this page and moves on. */
  const skipStep = () => {
    setChoices((c) => {
      if (page === "dock") return { ...c, dockStyle: undefined, dockEdge: undefined };
      if (page === "colour") return { ...c, look: undefined, accent: undefined, scheme: undefined };
      if (page === "extras") return { ...c, extras: {} };
      return c;
    });
    next();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      skipAll();
    }
    if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  };

  const setExtra = (id: ExtraId, on: boolean) => setChoices((c) => ({ ...c, extras: { ...c.extras, [id]: on } }));
  const pickScheme = (s: ColourScheme) => {
    setScheme(s);
    setChoices((c) => ({ ...c, scheme: c.look ? s : c.scheme }));
  };
  const summary = describeChoices(
    choices,
    (id) => packById(id)?.label ?? id,
    (id) => dockStyleLabel(id),
  );
  const nextLabel = page === "welcome" ? "Get started" : index === last ? "Finish" : "Continue";
  const heading = (text: string, big = false) => (
    <h1 id="wiz-heading" ref={headingRef} tabIndex={-1} className={big ? "wiz-h1" : "wiz-h2"}>
      {text}
    </h1>
  );

  return (
    <div
      className="wiz"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wiz-heading"
      onKeyDown={onKeyDown}
      data-setup-page={page}
      ref={wizRef}
    >
      <header className="wiz-top">
        <ol className="wiz-steps" aria-label="Setup steps">
          {pages.map((p, i) => (
            <li key={p}>
              <button data-weight="light"
                type="button"
                className={`wiz-step ${i === index ? "active" : i < index ? "done" : ""}`}
                aria-current={i === index ? "step" : undefined}
                onClick={() => setIndex(i)}
              >
                <span className="wiz-step-num">{i < index ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
                <span>{PAGE_LABEL[p]}</span>
              </button>
            </li>
          ))}
        </ol>
        <button data-weight="medium" type="button" className="cc-btn-ghost tux-small-btn" onClick={skipAll} data-setup-skip>
          Skip setup
        </button>
      </header>

      <div className="wiz-stage" ref={stageRef}>
        {page === "welcome" && (
          <div className="wiz-welcome">
            <span className="wiz-mark" aria-hidden>
              <Sparkles size={22} />
            </span>
            {heading("Welcome to Lens", true)}
            <p className="wiz-lead">
              Pick a Dock and colours, and turn on any extras you want. Nothing changes until you press Finish, and skipping keeps
              everything as it is (a new install starts with the floating Dock and the default theme).
            </p>
            <ul className="wiz-points">
              <li>Everything here is in Settings later, and Remove all Lens changes undoes anything that touches Windows.</li>
              <li>Tab to move, Enter to choose, Alt+← and Alt+→ to change step, Esc to skip setup.</li>
            </ul>
          </div>
        )}

        {page === "whatsnew" && (
          <>
            <div>
              {heading(`What's new in Lens ${version}`)}
              <p className="wiz-sub">Nothing below changes your settings. Anything new you might want to turn on is on the next page.</p>
            </div>
            {notes.map((r) => (
              <div key={r.version} className="cc-card wiz-notes">
                {notes.length > 1 && <div className="cc-label">Lens {r.version}</div>}
                {r.sections.map((s) => (
                  <section key={s.title} aria-label={s.title}>
                    <div className="wiz-notes-title">{s.title}</div>
                    <ul className="wiz-points">
                      {s.items.slice(0, 6).map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ))}
          </>
        )}

        {page === "dock" && (
          <>
            <div>
              {heading("Pick a Dock")}
              <p className="wiz-sub">Floating is the default. Every style keeps your pinned apps.</p>
            </div>
            <div className="wiz-dock-grid" role="radiogroup" aria-label="Dock style">
              {DOCK_STYLES.filter((d) => SETUP_DOCKS.includes(d.id)).map((d) => {
                const on = previewDock === d.id;
                return (
                  <button data-weight="medium"
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`tux-dock-card ${on ? "active" : ""}`}
                    onClick={() => setChoices((c) => ({ ...c, dockStyle: d.id === dockStyleOf(base) ? undefined : d.id }))}
                  >
                    <DockScenePreview styleId={d.id} accent={previewAccent} height={72} />
                    <span className="tux-pack-name">
                      <span className="tux-pack-label">{d.label}</span>
                      {on && <span className="tux-pack-dot" />}
                    </span>
                    <span className="tux-pack-desc">{d.description}</span>
                  </button>
                );
              })}
            </div>
            <div className="wiz-seg" role="radiogroup" aria-label="Screen edge">
              <span className="wiz-seg-label">Edge</span>
              {EDGES.map((e) => {
                const on = (preview.dock.position || "bottom") === e.id;
                return (
                  <button data-weight="medium"
                    key={e.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`wiz-seg-btn ${on ? "on" : ""}`}
                    onClick={() => setChoices((c) => ({ ...c, dockEdge: e.id === (base.dock.position || "bottom") ? undefined : e.id }))}
                  >
                    {e.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {page === "colour" && (
          <>
            <div>
              {heading("Pick your colours")}
              <p className="wiz-sub">A featured look sets colours, font and glass. Your Dock stays as you picked it.</p>
              {fromDesktop && <p className="wiz-sub wiz-from-desktop">Picked to match your desktop. Choose anything else below.</p>}
            </div>
            <div className="wiz-seg" role="radiogroup" aria-label="Light or dark">
              {SCHEMES.map((s) => (
                <button data-weight="medium"
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={scheme === s.id}
                  className={`wiz-seg-btn ${scheme === s.id ? "on" : ""}`}
                  onClick={() => pickScheme(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {scheme === "auto" && <p className="wiz-sub">Light from 7:00, dark from 19:00. Change the times in Settings › Appearance › Schedule.</p>}
            <div className="wiz-pack-grid" role="radiogroup" aria-label="Featured looks">
              {looksFor(scheme).map((l) => (
                <PackCard
                  key={l.id}
                  pack={lookPack(l)}
                  meta={false}
                  size="small"
                  describe
                  active={preview.theme.preset === l.id}
                  accent={previewAccent}
                  onApply={(id) => setChoices((c) => ({ ...c, look: id === base.theme.preset && scheme !== "auto" ? undefined : id, scheme }))}
                />
              ))}
            </div>
            <div className="wiz-seg" role="radiogroup" aria-label="Accent colour">
              <span className="wiz-seg-label">Accent</span>
              <button data-weight="medium"
                type="button"
                role="radio"
                aria-checked={!choices.accent}
                className={`wiz-seg-btn ${!choices.accent ? "on" : ""}`}
                onClick={() => setChoices((c) => ({ ...c, accent: undefined }))}
              >
                Theme's own
              </button>
              <button data-weight="medium"
                type="button"
                role="radio"
                aria-checked={choices.accent === "windows"}
                className={`wiz-seg-btn ${choices.accent === "windows" ? "on" : ""}`}
                onClick={() => setChoices((c) => ({ ...c, accent: "windows" }))}
              >
                Windows
              </button>
              {SWATCHES.map((hex, i) => (
                <button data-weight="light"
                  key={hex}
                  type="button"
                  role="radio"
                  aria-checked={choices.accent === hex}
                  aria-label={`Accent ${hex}`}
                  className={`wiz-swatch wiz-swatch-${i} ${choices.accent === hex ? "on" : ""}`}
                  onClick={() => setChoices((c) => ({ ...c, accent: hex }))}
                />
              ))}
            </div>
            <div className="wiz-preview" aria-hidden>
              <DockScenePreview styleId={previewDock} accent={previewAccent} height={64} />
            </div>
          </>
        )}

        {page === "extras" && (
          <>
            <div>
              {heading(isUpdate ? "New things you can turn on" : "Optional extras")}
              <p className="wiz-sub">All off. Each says what it changes on Windows; all of them are in Settings later.</p>
            </div>
            <div className="cc-card wiz-options">
              {extras.map((x) => {
                const on = !!choices.extras[x.id];
                const blocked = x.id === "runOnStartup" && !!startupBlock;
                return (
                  <div key={x.id} className={`tux-row ${blocked ? "wiz-unavailable" : ""}`}>
                    <div className="tux-row-text">
                      <div className="cc-label">{x.label}</div>
                      <div className="cc-desc">
                        {blocked ? startupBlock : x.desc}
                        {x.windows && !blocked ? ` ${x.windows}` : ""}
                      </div>
                    </div>
                    <button data-weight="light"
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={x.label}
                      aria-disabled={blocked || undefined}
                      className={`cc-toggle ${on ? "on" : ""}`}
                      onClick={() => !blocked && setExtra(x.id, !on)}
                    />
                  </div>
                );
              })}
            </div>
            {!isUpdate && (
              <div className="cc-card wiz-where">
                <div className="cc-label">Set up later, in their own place</div>
                {FIND_LATER.map((f) => (
                  <div key={f.label} className="cc-desc">
                    <strong>{f.label}.</strong> {f.desc} <span className="wiz-where-path">{f.where}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {page === "done" && (
          <>
            <div>
              {heading(summary.length ? "Ready to apply" : "Nothing to change")}
              <p className="wiz-sub">
                {summary.length
                  ? "Finish applies these. Everything can be changed later in Settings."
                  : "Lens keeps what it has. Finish just closes setup; it won't open again until the next version."}
              </p>
            </div>
            {summary.length > 0 && (
              <div className="cc-card wiz-summary">
                {summary.map((line) => {
                  const [label, ...rest] = line.split(": ");
                  return (
                    <div key={line} className="wiz-summary-row">
                      <span>{label}</span>
                      <span className="tux-value">{rest.join(": ")}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="cc-card wiz-where">
              <div className="cc-label">Where to find things</div>
              <div className="cc-desc">
                Settings has everything: Appearance for colours, Dock &amp; Bar for the Dock, Windows &amp; Keys for startup. Run this setup
                again from Settings › About &amp; Testing, or type “setup” in Command.
              </div>
            </div>
          </>
        )}
      </div>

      <footer className="wiz-foot">
        <button data-weight="medium" type="button" className="cc-btn-ghost tux-small-btn" onClick={back} disabled={index === 0}>
          <ChevronLeft size={14} /> Back
        </button>
        <div className="wiz-foot-right">
          {page !== "welcome" && page !== "whatsnew" && index < last && (
            <button data-weight="light" type="button" className="tux-link wiz-skip" onClick={skipStep}>
              Skip this step
            </button>
          )}
          <button data-weight="heavy" type="button" className="cc-btn tux-small-btn" data-wiz-next onClick={next}>
            {nextLabel} {index < last && <ChevronRight size={14} />}
          </button>
        </div>
      </footer>
    </div>
  );
};
