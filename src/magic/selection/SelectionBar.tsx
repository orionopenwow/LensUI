// The Magic selection bar (docs/plans/SELECTION_BAR.md): Cut / Copy / Paste when they'd work,
// Magic Search, your actions and More, in one matte pill just below the end of a selection.
// Window label "bubble" (non-activating: the app keeps the caret, the selection and the keys).
//
// The backend sends lens://selection/bar with what the bar may offer (never the text). The page
// lays itself out invisibly, reports its size (selection_bar_fit), and only then is the window
// placed and shown without activation; the pill then rises 4 px from the selection end.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  ArrowLeftRight, ClipboardPaste, Code, Copy, Equal, FolderOpen, Globe, Mail, MoreHorizontal, Palette, Scissors, Search, type LucideIcon,
} from "lucide-react";
import { useLensState } from "../../hooks/useLensState";
import { ActionIcon } from "../../context/ActionIcon";
import { contextMenuGet, contextMenuRecordUse } from "../../context/contract";
import { DEFAULT_PREFS, type MenuPrefs, type UsageCounts } from "../../context/actions";
import { glide } from "../../ui/motion";
import type { BarPlaced, BarShow } from "../../types/generated";
import { barSettings, barView, hotkeyHint, pageKey, riseFrom, runFor, weightOf, type BarButton } from "./model";
import { press } from "./press";
import "./selectionBar.css";

export const EVT_SHOW = "lens://selection/bar";
export const EVT_HIDE = "lens://selection/bar-hide";

const ICONS: Record<string, LucideIcon> = {
  scissors: Scissors, copy: Copy, "clipboard-paste": ClipboardPaste, search: Search, globe: Globe, mail: Mail, palette: Palette,
  "folder-open": FolderOpen, equal: Equal, "arrow-left-right": ArrowLeftRight, code: Code,
};

function Icon({ name }: { name: string }) {
  const I = ICONS[name];
  return I ? <I size={15} strokeWidth={2.4} aria-hidden /> : <ActionIcon name={name} size={15} />;
}

export interface SelectionBarInitial {
  show: BarShow;
  /** Parity scenes: start with More open, or a hover tip shown. */
  more?: boolean;
  tip?: string;
  above?: boolean;
  /** Parity scenes: settings on top of the config's. */
  settings?: Partial<import("../../types/generated").SelectionBarConfig>;
}

export function SelectionBar({ initial }: { initial?: SelectionBarInitial } = {}) {
  const { config } = useLensState();
  const settings = useMemo(() => barSettings(initial?.settings ? ({ ...config, selectionBar: { ...(config as { selectionBar?: object } | null)?.selectionBar, ...initial.settings } } as never) : config), [config, initial?.settings]);
  const [show, setShow] = useState<BarShow | null>(initial?.show ?? null);
  const [moreOpen, setMoreOpen] = useState(!!initial?.more);
  const [tip, setTip] = useState<{ id: string; text: string } | null>(initial?.tip ? { id: "paste", text: initial.tip } : null);
  const [prefs, setPrefs] = useState<MenuPrefs>(DEFAULT_PREFS);
  const [usage, setUsage] = useState<UsageCounts>({});
  const pill = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const fitted = useRef<string>("");
  const preview = !!initial;

  useEffect(() => {
    if (preview) return;
    let alive = true;
    const subs = [
      listen<BarShow>(EVT_SHOW, (e) => {
        setMoreOpen(false);
        setTip(null);
        setShow(e.payload);
      }),
      listen<string>(EVT_HIDE, () => {
        setShow(null);
        setMoreOpen(false);
      }),
    ];
    // A window built for the first selection mounts after the event: ask for it.
    invoke<BarShow | null>("selection_bar_state").then((s) => alive && s && setShow((cur) => cur ?? s)).catch(() => {});
    contextMenuGet()
      .then((m) => {
        if (!alive) return;
        if (m?.prefs) setPrefs({ ...DEFAULT_PREFS, ...m.prefs });
        setUsage(m?.usage ?? {});
      })
      .catch(() => {});
    return () => {
      alive = false;
      subs.forEach((p) => p.then((u) => u()).catch(() => {}));
    };
  }, [preview]);

  const view = useMemo(() => (show ? barView(show, settings, prefs, usage) : null), [show, settings, prefs, usage]);

  // Measure, then ask the backend to place and show the window; then rise into place.
  useLayoutEffect(() => {
    if (!show || !pill.current || !box.current) return;
    const key = `${show.seq}:${moreOpen ? 1 : 0}`;
    if (fitted.current === key) return;
    fitted.current = key;
    // The window is the pill plus its shadow margin; nothing transparent around it takes clicks.
    const r = box.current.getBoundingClientRect();
    if (preview) {
      glide(pill.current, { y: riseFrom(!!initial?.above), opacity: 0 }, { y: 0, opacity: 1 }, { duration: "fast", ease: "out" });
      return;
    }
    const el = pill.current;
    invoke<BarPlaced>("selection_bar_fit", { seq: show.seq, width: Math.ceil(r.width), height: Math.ceil(r.height) })
      .then((p) => {
        if (p?.shown && !key.endsWith(":1")) glide(el, { y: riseFrom(p.above), opacity: 0 }, { y: 0, opacity: 1 }, { duration: "fast", ease: "out" });
      })
      .catch(() => {});
  }, [show, moreOpen, preview, initial?.above]);

  if (!show || !view) return null;

  const hideBar = (reason: string) => {
    if (!preview) void invoke("selection_bar_hide", { reason }).catch(() => {});
  };

  const run = async (b: BarButton) => {
    if (preview) return;
    if (settings.learn && b.kind !== "clip" && b.kind !== "more") void contextMenuRecordUse(b.id).catch(() => {});
    const r = runFor(b, view.preview);
    try {
      switch (r.type) {
        case "more":
          setMoreOpen((o) => !o);
          return;
        case "backend":
          await invoke<string>("selection_bar_run", { action: r.action });
          return;
        case "search":
          await invoke("magic_search_open", { query: null, action: null });
          return;
        case "answer":
          await invoke("magic_search_open", { query: null, action: r.action });
          return;
        case "browser":
          hideBar("action");
          await invoke("browser_open", { url: r.url });
          return;
        case "command":
          hideBar("action");
          await invoke("show_command_cmd", { payload: { layout: "mini", anchor: "cursor", text: r.text || undefined } });
          return;
      }
    } catch (e) {
      void emit("lens://shelf/notice", String(e)).catch(() => {});
    }
  };

  const hover = (b: BarButton) => {
    if (view.labels === "hover") setTip({ id: b.id, text: b.label });
    if (b.id === "paste" && show.pastePreview && !preview) {
      invoke<string | null>("selection_bar_paste_preview")
        .then((t) => t && setTip({ id: "paste", text: `Paste “${t}”` }))
        .catch(() => {});
    }
  };

  // One status line under the buttons, the same height whatever it says (so the window never
  // resizes on hover): the smart preview, or the label of the button you point at.
  const statusLine = !!(view.preview?.preview || view.labels === "hover" || show.pastePreview);

  const button = (b: BarButton) => {
    const hint = hotkeyHint(b.hotkey);
    return (
      <button
        key={b.id}
        type="button"
        className={`sbar-btn is-${b.kind}${view.labels === "always" || b.kind === "search" ? " has-label" : ""}`}
        aria-label={hint ? `${b.label} (${b.hotkey})` : b.label}
        {...press(weightOf(b))}
        onClick={() => void run(b)}
        onPointerEnter={() => hover(b)}
        onPointerOut={() => setTip((t) => (t?.id === b.id ? null : t))}
        onFocus={() => hover(b)}
      >
        <Icon name={b.icon} />
        {view.labels === "always" || b.kind === "search" ? <span className="sbar-label">{b.label}</span> : null}
        {hint ? <span className="sbar-key">{hint}</span> : null}
      </button>
    );
  };

  return (
    <div
      ref={box}
      className={`sbar-root${moreOpen ? " is-more" : ""}`}
      onKeyDown={(e) => {
        if (pageKey(e.key) === "hide") {
          e.preventDefault();
          hideBar("esc");
        }
      }}
    >
      <div ref={pill} className="sbar" role="toolbar" aria-label={`Selection bar: ${show.chars.toLocaleString()} characters selected`}>
        <div className="sbar-row">
          {view.clipboard.length ? <div className="sbar-group">{view.clipboard.map(button)}</div> : null}
          {view.search ? <div className="sbar-group">{button(view.search)}</div> : null}
          {view.actions.length ? <div className="sbar-group">{view.actions.map(button)}</div> : null}
          <div className="sbar-group">
            <button
              type="button"
              className={`sbar-btn is-more${moreOpen ? " is-on" : ""}`}
              aria-label={moreOpen ? "Fewer actions" : "More actions"}
              aria-expanded={moreOpen}
              {...press("medium")}
              onClick={() => void run({ id: "more", kind: "more", label: "More", icon: "", hotkey: "", backend: false, provider: "" })}
            >
              <MoreHorizontal size={15} strokeWidth={2.4} aria-hidden />
            </button>
          </div>
        </div>
        {statusLine ? (
          <div className="sbar-preview" aria-live="polite">
            {!tip && view.preview?.kind === "colour" ? <span className="sbar-swatch" ref={(el) => el?.style.setProperty("--swatch", view.preview?.value ?? "transparent")} /> : null}
            <span className={`sbar-preview-text${tip ? " is-tip" : ""}`}>{tip ? tip.text : view.preview?.preview || "\u00a0"}</span>
          </div>
        ) : null}
        {moreOpen ? (
          <div className="sbar-more" role="menu" aria-label="All Magic actions for the selection">
            {view.more.map((b) => (
              <button key={b.id} type="button" role="menuitem" className="sbar-more-row" {...press("light")} onClick={() => void run(b)}>
                <Icon name={b.icon} />
                <span className="sbar-more-label">{b.label}</span>
                {b.hotkey ? <span className="sbar-key">{hotkeyHint(b.hotkey)}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default SelectionBar;
