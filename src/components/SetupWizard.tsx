// Lens setup (docs/SETUP.md): full-screen slides in their own window (src/setup/SetupSurface.tsx).
// Opens on the first launch and once after every new version. Nothing changes until Finish: every
// choice here is a draft, previews draw from it, and Finish writes only what was picked
// (src/setup/flow.ts). Skip leaves everything as it is.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStartupBlock } from "../hooks/useStartupBlock";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Code2,
  Compass,
  FileText,
  Film,
  Gamepad2,
  Image as ImageIcon,
  LayoutGrid,
  Monitor,
  Music2,
  Palette,
  PanelBottom,
  Settings2,
  Shield,
  Sparkles,
  Terminal,
} from "lucide-react";
import { LensConfig, WindowsThemeInfo } from "../types/lens";
import { packById } from "../themes/packs";
import { FEATURED_LOOKS, lookPack } from "../themes/featured";
import { accentFromUrl } from "../themes/accentFromImage";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { PackCard } from "./ThemeGallery";
import { DOCK_STYLES, DockScenePreview, dockStyleLabel, dockStyleOf } from "../dock/styles";
import { enableAmbientBackdrop } from "../playground/ambient/controls";
import { glideIn, swapDirection, swapIn } from "../ui/motion";
import { CORE_APPS, iconUrl, pinEntry } from "../coreapps/registry";
import { desktopIconOn, firstRunSetupClosed, openLensApps, setDesktopIcon } from "../apps/desktopIcon";
import { lensAppIconUrl } from "../icons/lensApps";
import { LensCloud } from "../presence/LensCloud";
import { isOn } from "../magicwaves/flags";
import { toast } from "../ui/toastBus";
import { oops, quiet } from "../ui/oops";
import {
  applyChoices,
  describeChoices,
  extrasFor,
  FIND_LATER,
  looksFor,
  NO_CHOICES,
  STORE_PIN,
  suggestFromDesktop,
  whatsNewSince,
  type ColourScheme,
  type ExtraId,
  type SetupChoices,
  type SetupReason,
} from "../setup/flow";
import "../setup/setup.css";

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

type Page = "welcome" | "whatsnew" | "dock" | "colour" | "store" | "widgets" | "apps" | "extras" | "done";

const PAGE_LABEL: Record<Page, string> = {
  welcome: "Welcome",
  whatsnew: "What's new",
  dock: "Dock",
  colour: "Colours",
  store: "Lens Apps",
  widgets: "Widgets",
  apps: "Your apps",
  extras: "Extras",
  done: "Done",
};

/** The Dock layouts offered here; the rest are one click away in Settings › Dock & Bar. Swatch colours live in CSS (.wiz-swatch-N). */
const SETUP_DOCKS = ["floating", "slim", "taskbar", "split", "unified"];
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
/** The kinds of free tools in Lens Apps, for the Lens Apps slide's floating tiles. */
const STORE_KINDS = [
  { Icon: ImageIcon, label: "Photos" },
  { Icon: Music2, label: "Music" },
  { Icon: Code2, label: "Code" },
  { Icon: Film, label: "Video" },
  { Icon: Shield, label: "Privacy" },
  { Icon: Terminal, label: "Terminal" },
  { Icon: FileText, label: "Notes" },
  { Icon: Gamepad2, label: "Games" },
];

/** A switch row: label, a line on what it does, and the switch. */
const SwitchRow: React.FC<{ label: string; desc: React.ReactNode; on: boolean; disabled?: boolean; onChange: (on: boolean) => void; icon?: React.ReactNode }> = ({
  label,
  desc,
  on,
  disabled,
  onChange,
  icon,
}) => (
  <div className={`wiz-switch ${disabled ? "wiz-unavailable" : ""}`}>
    {icon && <span className="wiz-switch-icon" aria-hidden>{icon}</span>}
    <div className="tux-row-text">
      <div className="cc-label">{label}</div>
      <div className="cc-desc">{desc}</div>
    </div>
    <button
      data-weight="light"
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`cc-toggle ${on ? "on" : ""}`}
      onClick={() => !disabled && onChange(!on)}
    />
  </div>
);

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
  const firstEver = reason === "first" && !baseRef.current.onboardingCompleted;
  const pinnedPaths = new Set((baseRef.current.dock.pinnedApps ?? []).map((p) => p.path));
  const storeAlreadyPinned = pinnedPaths.has(STORE_PIN.path);
  const widgetsAlreadyOn = isOn(baseRef.current, "desktopWidgets");
  // First setup: Lens Apps goes on the Dock and widgets go on the desktop unless the person turns
  // them off here; both live inside Lens and are one switch to undo in Settings.
  const [choices, setChoices] = useState<SetupChoices>(() => ({
    ...NO_CHOICES,
    pinStore: firstEver && !storeAlreadyPinned ? true : undefined,
    widgets: firstEver && !widgetsAlreadyOn ? true : undefined,
  }));
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
    if (!isUpdate) return ["welcome", "dock", "colour", "store", "widgets", "apps", "extras", "done"];
    const p: Page[] = [];
    if (notes.length) p.push("whatsnew");
    if (extras.length) p.push("extras");
    p.push("done");
    return p;
  }, [isUpdate, notes.length, extras.length]);
  const [index, setIndex] = useState(0);
  const page = pages[Math.min(index, pages.length - 1)];
  const last = pages.length - 1;

  // Slides swap in the direction of travel (DESIGN.md §5.3): forward from the right, back from the
  // left; the first one just arrives. Interrupting (fast Alt+→) restarts from the new content.
  const prevIndex = useRef(-1);
  useEffect(() => {
    headingRef.current?.focus();
    const dir = swapDirection(prevIndex.current, index);
    prevIndex.current = index;
    if (dir === "none") glideIn(stageRef.current, { y: 12, opacity: 0 });
    else swapIn(stageRef.current, dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const base = baseRef.current;
  const preview = useMemo(() => applyChoices(base, choices, version), [base, choices, version]);
  const previewDock = dockStyleOf(preview);
  const previewPack = packById(preview.theme.preset);
  const previewAccent =
    preview.theme.accentMode === "custom" ? preview.theme.customAccent : preview.theme.accentMode === "windows" ? winTheme.accentHex : previewPack?.accent ?? winTheme.accentHex;
  // The setup wears the accent being picked (from the desktop at first), so it looks like the
  // person's own desktop from the first slide.
  const wizRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wizRef.current?.style.setProperty("--lens-accent", previewAccent);
  }, [previewAccent]);

  // Lens Apps opens when the very first setup closes (the free tools are the first thing people
  // see), unless they turn that off. The desktop icon is opt-in.
  const [openApps, setOpenApps] = useState(firstEver);
  const [desktopIcon, setDesktopIconChoice] = useState(false);
  const [iconAlreadyOn, setIconAlreadyOn] = useState(false);
  useEffect(() => {
    desktopIconOn().then(setIconAlreadyOn);
  }, []);
  const togglePin = (id: string) => {
    const app = CORE_APPS.find((a) => a.id === id);
    if (!app) return;
    const entry = pinEntry(app);
    setChoices((c) => {
      const pins = c.pins ?? [];
      return { ...c, pins: pins.some((p) => p.path === entry.path) ? pins.filter((p) => p.path !== entry.path) : [...pins, entry] };
    });
  };
  const afterClose = () => {
    if (firstEver) firstRunSetupClosed(openApps);
    if (openApps) openLensApps().catch(oops("open Lens Apps"));
  };

  /** Leaves setup without changing anything but the "seen" markers. */
  const skipAll = () => {
    onUpdateConfig({ ...config, onboardingCompleted: true, setupSeenVersion: version || config.setupSeenVersion || "" });
    onFinish();
    afterClose();
  };

  /** Writes the choices (only those) and closes. */
  const finish = () => {
    onUpdateConfig({ ...applyChoices(config, choices, version || config.setupSeenVersion || "") });
    if (choices.extras.ambientBackdrop) enableAmbientBackdrop().catch(quiet);
    if (desktopIcon && !iconAlreadyOn) setDesktopIcon(true).catch((e) => toast.error(`Couldn't put Lens Apps on the desktop. ${String(e)}`));
    onFinish();
    afterClose();
  };

  const next = () => (index < last ? setIndex(index + 1) : finish());
  const back = () => index > 0 && setIndex(index - 1);

  /** "Skip this step" forgets what was picked on this slide and moves on. */
  const skipStep = () => {
    setChoices((c) => {
      if (page === "dock") return { ...c, dockStyle: undefined, dockEdge: undefined };
      if (page === "colour") return { ...c, look: undefined, accent: undefined, scheme: undefined };
      if (page === "extras") return { ...c, extras: {} };
      if (page === "apps") return { ...c, pins: undefined };
      if (page === "store") return { ...c, pinStore: undefined };
      if (page === "widgets") return { ...c, widgets: undefined };
      return c;
    });
    if (page === "store") {
      setDesktopIconChoice(false);
      setOpenApps(false);
    }
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
  const summary = [
    ...describeChoices(
      choices,
      (id) => packById(id)?.label ?? id,
      (id) => dockStyleLabel(id),
    ),
    ...(desktopIcon && !iconAlreadyOn ? ["Lens Apps icon on the desktop: on"] : []),
  ];
  const nextLabel = page === "welcome" ? "Let's go" : index === last ? "Finish" : "Next";
  const heading = (text: string, big = false) => (
    <h1 id="wiz-heading" ref={headingRef} tabIndex={-1} className={big ? "wiz-h1" : "wiz-h2"}>
      {text}
    </h1>
  );
  const eyebrow = (text: string) => <div className="wiz-eyebrow">{text}</div>;
  const stepOf = `Step ${index + 1} of ${pages.length}`;
  const storeOnDock = storeAlreadyPinned || !!choices.pinStore;
  const widgetsOn = choices.widgets ?? widgetsAlreadyOn;

  return (
    <div className="wiz wiz-full" role="dialog" aria-modal="true" aria-labelledby="wiz-heading" onKeyDown={onKeyDown} data-setup-page={page} ref={wizRef}>
      <div className="wiz-aurora" aria-hidden />
      <header className="wiz-top">
        <div className="wiz-brand" aria-hidden>
          <span className="wiz-brand-orb">
            <LensCloud />
          </span>
          <span>Lens setup</span>
        </div>
        <ol className="wiz-steps" aria-label="Setup steps">
          {pages.map((p, i) => (
            <li key={p}>
              <button
                data-weight="light"
                type="button"
                className={`wiz-step ${i === index ? "active" : i < index ? "done" : ""}`}
                aria-current={i === index ? "step" : undefined}
                onClick={() => setIndex(i)}
              >
                <span className="wiz-step-num">{i < index ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
                <span className="wiz-step-label">{PAGE_LABEL[p]}</span>
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
          <div className="wiz-slide wiz-hello">
            <div className="wiz-hello-orb" aria-hidden>
              <span className="wiz-hello-ring" />
              <span className="wiz-hello-ring wiz-hello-ring-2" />
              <span className="wiz-hello-core">
                <LensCloud />
              </span>
            </div>
            {heading("Welcome to Lens", true)}
            <p className="wiz-lead">
              A few quick slides and Windows is yours: a Dock you like, your colours, free apps and widgets. Nothing changes until you press Finish.
            </p>
            <ul className="wiz-chips" aria-label="What's next">
              {[
                { Icon: PanelBottom, t: "Pick a Dock" },
                { Icon: Palette, t: "Choose colours" },
                { Icon: LayoutGrid, t: "Get free apps" },
                { Icon: Sparkles, t: "Add widgets" },
              ].map(({ Icon, t }, i) => (
                <li key={t} className="wiz-chip" data-i={i}>
                  <Icon size={16} aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <p className="wiz-fine">Esc skips setup. Alt+← and Alt+→ change slide. Everything here is in Settings later.</p>
          </div>
        )}

        {page === "whatsnew" && (
          <div className="wiz-slide wiz-slide-wide">
            <div>
              {eyebrow(`Lens ${version}`)}
              {heading(`What's new in Lens ${version}`)}
              <p className="wiz-sub">Nothing below changes your settings. Anything new you might want to turn on is on the next slide.</p>
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
          </div>
        )}

        {page === "dock" && (
          <div className="wiz-slide wiz-slide-wide">
            <div>
              {eyebrow(stepOf)}
              {heading("Pick a Dock")}
              <p className="wiz-sub">Where your apps live. Floating is the default, and every style keeps your pinned apps.</p>
            </div>
            <div className="wiz-dock-grid" role="radiogroup" aria-label="Dock style">
              {DOCK_STYLES.filter((d) => SETUP_DOCKS.includes(d.id)).map((d) => {
                const on = previewDock === d.id;
                return (
                  <button
                    data-weight="medium"
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`tux-dock-card ${on ? "active" : ""}`}
                    onClick={() => setChoices((c) => ({ ...c, dockStyle: d.id === dockStyleOf(base) ? undefined : d.id }))}
                  >
                    <DockScenePreview styleId={d.id} accent={previewAccent} height={110} />
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
                  <button
                    data-weight="medium"
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
          </div>
        )}

        {page === "colour" && (
          <div className="wiz-slide wiz-slide-wide">
            <div>
              {eyebrow(stepOf)}
              {heading("Pick your colours")}
              <p className="wiz-sub">A look sets colours, font and glass. Your Dock stays as you picked it.</p>
              {fromDesktop && <p className="wiz-sub wiz-from-desktop">Picked to match your desktop. Choose anything else below.</p>}
            </div>
            <div className="wiz-seg" role="radiogroup" aria-label="Light or dark">
              {SCHEMES.map((s) => (
                <button
                  data-weight="medium"
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
              <button
                data-weight="medium"
                type="button"
                role="radio"
                aria-checked={!choices.accent}
                className={`wiz-seg-btn ${!choices.accent ? "on" : ""}`}
                onClick={() => setChoices((c) => ({ ...c, accent: undefined }))}
              >
                Theme's own
              </button>
              <button
                data-weight="medium"
                type="button"
                role="radio"
                aria-checked={choices.accent === "windows"}
                className={`wiz-seg-btn ${choices.accent === "windows" ? "on" : ""}`}
                onClick={() => setChoices((c) => ({ ...c, accent: "windows" }))}
              >
                Windows
              </button>
              {SWATCHES.map((hex, i) => (
                <button
                  data-weight="light"
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
              <DockScenePreview styleId={previewDock} accent={previewAccent} height={84} />
            </div>
          </div>
        )}

        {page === "store" && (
          <div className="wiz-slide wiz-split">
            <div className="wiz-split-text">
              {eyebrow(`${stepOf} · Free apps`)}
              {heading("Lens Apps: free tools, one click each")}
              <p className="wiz-lead">
                Photo editors, music players, coding tools and more, all free and open source, with screenshots and a one-click Get. Nothing installs without your click.
              </p>
              <div className="wiz-where-title">Where you'll find it</div>
              <div className="cc-card wiz-switches">
                <SwitchRow
                  icon={<PanelBottom size={18} />}
                  label="On your Dock"
                  desc={storeAlreadyPinned ? "It's already on your Dock." : "A Lens Apps button next to your apps."}
                  on={storeOnDock}
                  disabled={storeAlreadyPinned}
                  onChange={(on) => setChoices((c) => ({ ...c, pinStore: on || undefined }))}
                />
                <SwitchRow
                  icon={<Monitor size={18} />}
                  label="On your desktop"
                  desc={iconAlreadyOn ? "It's already on your desktop." : "A Lens Apps icon. Remove all Lens changes takes it away too."}
                  on={desktopIcon || iconAlreadyOn}
                  disabled={iconAlreadyOn}
                  onChange={setDesktopIconChoice}
                />
                <SwitchRow
                  icon={<Sparkles size={18} />}
                  label="Open it when I finish"
                  desc="Lens Apps opens right after setup so you can look around."
                  on={openApps}
                  onChange={setOpenApps}
                />
                <div className="wiz-switch">
                  <span className="wiz-switch-icon" aria-hidden>
                    <Settings2 size={18} />
                  </span>
                  <div className="tux-row-text">
                    <div className="cc-label">Always in Settings</div>
                    <div className="cc-desc">Settings › Lens Apps, or type /apps in Command.</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="wiz-split-art wiz-store-art" aria-hidden>
              <img className="wiz-store-hero" src={lensAppIconUrl("apps")} alt="" />
              {STORE_KINDS.map(({ Icon, label }, i) => (
                <span key={label} className={`wiz-float wiz-float-${i}`}>
                  <Icon size={22} />
                  <span>{label}</span>
                </span>
              ))}
              <span className="wiz-get-pill">Get</span>
            </div>
          </div>
        )}

        {page === "widgets" && (
          <div className="wiz-slide wiz-split">
            <div className="wiz-split-text">
              {eyebrow(`${stepOf} · Widgets`)}
              {heading("Widgets on your desktop")}
              <p className="wiz-lead">
                A clock, today's list, your latest notes and what's playing, right on your desktop under your windows. They use only what's on this PC.
              </p>
              <div className="cc-card wiz-switches">
                <SwitchRow
                  icon={<Sparkles size={18} />}
                  label="Put widgets on my desktop"
                  desc={widgetsAlreadyOn && choices.widgets === undefined ? "They're already on." : "You'll see a clock, your notes and today's list, top left."}
                  on={widgetsOn}
                  onChange={(on) => setChoices((c) => ({ ...c, widgets: on === widgetsAlreadyOn ? undefined : on }))}
                />
              </div>
              <div className="wiz-where-title">Where they live</div>
              <ul className="wiz-points wiz-points-big">
                <li>On your desktop, under your windows. Drag one to move it.</li>
                <li>Right-click a widget to resize, edit or remove it, or add more.</li>
                <li>Type /widgets in Command to add and arrange them.</li>
                <li>Turn them off any time in Settings › About &amp; Testing › Magic.</li>
              </ul>
            </div>
            <div className="wiz-split-art wiz-widget-art" aria-hidden>
              <div className="wiz-w wiz-w-clock" data-i={0}>
                <span className="wiz-clock-face">
                  <span className="wiz-clock-h" />
                  <span className="wiz-clock-m" />
                  <span className="wiz-clock-s" />
                </span>
              </div>
              <div className="wiz-w wiz-w-today" data-i={1}>
                <div className="wiz-w-title">Today</div>
                <div className="wiz-w-item done">Morning run</div>
                <div className="wiz-w-item">Call the bank</div>
                <div className="wiz-w-item">Lunch with Sam</div>
              </div>
              <div className="wiz-w wiz-w-music" data-i={2}>
                <div className="wiz-w-title">Now playing</div>
                <div className="wiz-eq">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="wiz-w wiz-w-note" data-i={3}>
                <div className="wiz-w-title">Notes</div>
                <div className="wiz-w-line" />
                <div className="wiz-w-line short" />
              </div>
            </div>
          </div>
        )}

        {page === "apps" && (
          <div className="wiz-slide wiz-slide-wide">
            <div>
              {eyebrow(stepOf)}
              {heading("Lens's own apps")}
              <p className="wiz-sub">They're already here, free. Tick the ones you want on your Dock.</p>
            </div>
            <div className="wiz-apps-grid" role="group" aria-label="Pin Lens apps to the Dock">
              {CORE_APPS.map((a, i) => {
                const path = pinEntry(a).path;
                const already = pinnedPaths.has(path);
                const on = already || !!choices.pins?.some((p) => p.path === path);
                return (
                  <button
                    data-weight="medium"
                    key={a.id}
                    type="button"
                    role="checkbox"
                    data-i={i}
                    aria-checked={on}
                    aria-disabled={already || undefined}
                    aria-label={`${a.title}. ${a.blurb} ${already ? "Already on your Dock." : "Pin to the Dock."}`}
                    className={`wiz-app ${on ? "on" : ""} ${already ? "already" : ""}`}
                    onClick={() => !already && togglePin(a.id)}
                  >
                    <img className="wiz-app-icon" src={iconUrl(a)} alt="" aria-hidden />
                    <span className="wiz-app-text">
                      <span className="wiz-app-name">{a.short}</span>
                      <span className="wiz-app-blurb">{a.blurb}</span>
                    </span>
                    <span className="wiz-app-pin" aria-hidden>
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="wiz-sub">All of them are in the Launcher too, and in Command: type /timer, /notes or /monitor.</p>
          </div>
        )}

        {page === "extras" && (
          <div className="wiz-slide wiz-slide-wide">
            <div>
              {eyebrow(isUpdate ? "New" : stepOf)}
              {heading(isUpdate ? "New things you can turn on" : "Optional extras")}
              <p className="wiz-sub">All off. Each says what it changes on Windows; all of them are in Settings later.</p>
            </div>
            <div className="cc-card wiz-options">
              {extras.map((x) => {
                const on = !!choices.extras[x.id];
                const blocked = x.id === "runOnStartup" && !!startupBlock;
                return (
                  <SwitchRow
                    key={x.id}
                    label={x.label}
                    desc={`${blocked ? startupBlock : x.desc}${x.windows && !blocked ? ` ${x.windows}` : ""}`}
                    on={on}
                    disabled={blocked}
                    onChange={(v) => setExtra(x.id, v)}
                  />
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
          </div>
        )}

        {page === "done" && (
          <div className="wiz-slide wiz-slide-wide wiz-done">
            <div className="wiz-burst" aria-hidden>
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} className={`wiz-spark wiz-spark-${i}`} />
              ))}
              <span className="wiz-done-mark">
                <Check size={30} strokeWidth={3} />
              </span>
            </div>
            <div>
              {heading(summary.length ? "You're all set" : openApps ? "You're all set" : "Nothing to change")}
              <p className="wiz-sub">
                {summary.length
                  ? "Finish applies these. Everything can be changed later in Settings."
                  : "Lens keeps what it has. Finish just closes setup; it won't open again until the next version."}
                {openApps ? " Then Lens Apps opens so you can get free tools." : ""}
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
            <div className="wiz-where-title">Where everything lives</div>
            <div className="wiz-map">
              <button data-weight="medium" type="button" className="wiz-map-card" onClick={() => openLensApps().catch(oops("open Lens Apps"))}>
                <img src={lensAppIconUrl("apps")} alt="" aria-hidden />
                <span className="cc-label">Lens Apps</span>
                <span className="cc-desc">{storeOnDock ? "On your Dock and in" : "In"} Settings › Lens Apps.</span>
                <span className="wiz-map-go">
                  Open <ArrowRight size={13} aria-hidden />
                </span>
              </button>
              <button
                data-weight="medium"
                type="button"
                className="wiz-map-card"
                onClick={() => invoke("browser_open", { url: null, source: "setup" }).catch(oops("open Lens Browser"))}
              >
                <img src={lensAppIconUrl("browser")} alt="" aria-hidden />
                <span className="cc-label">Lens Browser</span>
                <span className="cc-desc">Lens's own web browser, with your Lens colours.</span>
                <span className="wiz-map-go">
                  Open <ArrowRight size={13} aria-hidden />
                </span>
              </button>
              <div className="wiz-map-card">
                <span className="wiz-map-glyph" aria-hidden>
                  <Sparkles size={22} />
                </span>
                <span className="cc-label">Widgets</span>
                <span className="cc-desc">{widgetsOn ? "On your desktop. Right-click one, or type /widgets." : "Off. Turn them on in Settings › About & Testing › Magic."}</span>
              </div>
              <div className="wiz-map-card">
                <span className="wiz-map-glyph" aria-hidden>
                  <Compass size={22} />
                </span>
                <span className="cc-label">Settings &amp; Command</span>
                <span className="cc-desc">Settings has everything. Type “setup” in Command to see these slides again.</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="wiz-foot">
        <button data-weight="medium" type="button" className="cc-btn-ghost tux-small-btn" onClick={back} disabled={index === 0}>
          <ChevronLeft size={14} /> Back
        </button>
        <div className="wiz-progress" aria-hidden>
          <span className="wiz-progress-fill" data-step={index} data-steps={pages.length} ref={(el) => el?.style.setProperty("--wiz-progress", String((index + 1) / pages.length))} />
        </div>
        <div className="wiz-foot-right">
          {page !== "welcome" && page !== "whatsnew" && index < last && (
            <button data-weight="light" type="button" className="tux-link wiz-skip" onClick={skipStep}>
              Skip this step
            </button>
          )}
          <button data-weight="heavy" type="button" className="cc-btn cc-btn-primary wiz-next" data-wiz-next onClick={next}>
            {nextLabel} {index < last && <ArrowRight size={15} />}
          </button>
        </div>
      </footer>
    </div>
  );
};
