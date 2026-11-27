import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
import "../dock/islands/islands.css";
import { useUnifiedSearch } from "../search/useUnifiedSearch";
import { PluginSlot } from "../components/PluginSlot";
import { McpBridge } from "../components/McpBridge";
import { AiApplyBridge } from "../components/AiApplyBridge";
import { AskDockPopover, AskModeToggle, useAskMode } from "../dock/ai/AskDock";
import { DropSparkle, DropToAiMenu } from "../dock/ai/DropToAi";
import { SuggestedApps, recordDockLaunch } from "../dock/ai/SuggestedApps";
import { VoiceDockView, DockMicButton, useVoiceDock } from "../dock/voice/VoiceDock";
import { MiniPlayer } from "../music/MiniPlayer";
import { DockMusicCard } from "../music/DockMusicCard";
import { useMiniPlacement } from "../music/useMiniPlacement";
import type { DockStyleId as VoiceDockStyle, Edge as VoiceEdge } from "../dock/voice/dockMorph";
import "../dock/ai/aiDock.css";
import type { AiContext } from "../ai/surfaceApi";
import { toDockResults } from "../search/dockAdapter";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { captureFlip, glideOut, useLingering, type FlipCapture } from "../ui/motion";
import { attentionFor, useAttention } from "../dock/attention";
import { FlyoutClose } from "../ui/FlyoutClose";
import { Search, Activity, AppWindow, Settings, LayoutGrid } from "lucide-react";
import { useLensState, useRunningWindows } from "../hooks/useLensState";
import type { InstalledApp, RunningWindow } from "../types/lens";
import "./CommandPaletteSurface.css";
import { useThemeSchedule } from "../themes/schedule";
import "./DockSurface.css";
import {
  DOCK_LAUNCH_ANIMATIONS,
  DOCK_MAGNIFICATION,
  clampMagnificationRange,
  dockStyleInfo,
  normalizeLaunchAnimation,
  normalizeMagnification,
  resolveDockIconSize,
  normalizeDockStyle,
  resolveDockAlignment,
  resolveSystemArea,
  dockShowsLauncher,
} from "../dock/styles";
import { placeHoverCard } from "../dock/placement";
import { useDockReflow } from "../dock/reflow";
import { topBarEnabled } from "../topbar/enabled";
import { DockSystemArea } from "../dock/DockSystemArea";
import { DockAppItem } from "../dock/DockAppItem";
import { DockContextMenu } from "../dock/DockContextMenu";
import { DockHoverCard, type DockCardMode } from "../dock/DockHoverCard";
import { FallbackAppIcon } from "../dock/DockIcons";
import { DockSearchDrawer } from "../dock/DockSearchDrawer";
import { openMagicForDockItem } from "../dock/LensMenuHost";
import { useDockBadges } from "../dock/hooks/useDockBadges";
import { useFileDrop } from "../dock/hooks/useFileDrop";
import { useMagnification } from "../dock/hooks/useMagnification";
import { useMinimizePulse } from "../dock/hooks/useMinimizePulse";
import { usePillReport } from "../dock/hooks/usePillReport";
import {
  assignWindows,
  finishedOrGiveUp,
  matchesPinnedApp,
  normalizeEdge,
  notifBadgeFor,
  orderGroups,
  prefersReducedMotion,
  type DockContextMenu as DockMenuState,
  type DockExtras,
  type DockFilterTab,
  type DockHoverCardState,
  type LauncherHomeData,
} from "../dock/model";
import { DOCK_RESULT_LIMIT, browseResults, homeRows } from "../dock/searchItems";
import { hideSurface, logFail, quiet, retryOnce, setDockMenuOpen } from "../failsafe/calls";


export const DockSurface: React.FC = () => {
  const { config, updateConfig } = useLensState();
  // Lens Intelligence in the Dock (all off until AI is turned on; docs/AI_SURFACES.md §3).
  const aiOn = !!config?.ai?.enabled;
  const askMode = useAskMode(aiOn);
  const [askPrompt, setAskPrompt] = useState<string | null>(null);
  const [askCtx, setAskCtx] = useState<AiContext | undefined>(undefined);
  const [aiDropPaths, setAiDropPaths] = useState<string[] | null>(null);
  // Day/night theme schedule runs from the Dock only, so exactly one window applies it.
  useThemeSchedule(config, updateConfig, true);
  const runningWindows = useRunningWindows(900);
  // Apps asking for attention (taskbar flash): urgent colour, one bounce, highlight until activated.
  const attention = useAttention(runningWindows);
  const [pinnedIcons, setPinnedIcons] = useState<Record<string, string | null>>({});
  const [dockVisible, setDockVisible] = useState(true);
  // Voice: the Dock becomes the voice module while you talk (docs/VOICE.md).
  const voiceDock = useVoiceDock(dockVisible);
  const musicMini = useMiniPlacement();
  const [dockSearchOpen, setDockSearchOpen] = useState(false);
  const [dockSearchClosing, setDockSearchClosing] = useState(false);
  const [dockSearchQuery, setDockSearchQuery] = useState("");
  const [dockFilterTab, setDockFilterTab] = useState<DockFilterTab>("all");
  const [dockSelectedIdx, setDockSelectedIdx] = useState(0);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [homeData, setHomeData] = useState<LauncherHomeData>({ recentFiles: [], folders: [] });
  const [lockedDockWidth, setLockedDockWidth] = useState<number | null>(null);
  // Icon size while search is open: icons slide right and shrink only as much as needed to leave room for the text box.
  const [searchIconSize, setSearchIconSize] = useState<number | null>(null);
  /** Full-width bar styles: the icon row's left offset while searching, so icons only slide right. */
  const [lockedRowOffset, setLockedRowOffset] = useState<number | null>(null);
  const splitPillRef = useRef<HTMLDivElement>(null);
  /** How long the current launch animation runs (ms), so the class is not removed mid-animation. */
  const launchMsRef = useRef<number>(190);
  /** Per-app index for wheel window cycling. */
  const wheelIdxRef = useRef<Record<string, number>>({});
  const wheelAtRef = useRef<number>(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Settings can be dragged off the Dock: the fused top edge follows where it actually is.
  const [settingsDocked, setSettingsDocked] = useState(true);
  const [activeSettingsTab, setActiveSettingsTab] = useState<string>("system");
  const settingsOpenRef = useRef(false);
  settingsOpenRef.current = settingsOpen;
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<DockMenuState | null>(null);
  const [hoverCard, setHoverCard] = useState<DockHoverCardState | null>(null);
  const { notifCounts, coreBadges } = useDockBadges();
  // Alt+1..9 activation (the backend emits the index; the latest render's rows handle it).
  const activateRef = useRef<(n: number) => void>(() => {});
  const hoverTimerRef = useRef<number | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [unpinnedOrder, setUnpinnedOrder] = useState<string[]>([]);
  /** Pinned order while a drag is in progress: shown at once, saved to the config once on release. */
  const [dragPinOrder, setDragPinOrder] = useState<string[] | null>(null);
  const dragPinOrderRef = useRef<string[] | null>(null);
  /** Icons that moved during a reorder glide from where they were (FLIP). */
  const reorderFlip = useRef<FlipCapture | null>(null);
  const isVerticalRef = useRef(false);
  /** Latest config for handlers created earlier (pointer drags). */
  const configRef = useRef(config as NonNullable<typeof config>);
  if (config) configRef.current = config;
  // The saved order came back from the backend: drop the in-drag order (it now matches).
  const pinnedSig = config?.dock.pinnedApps.map((a) => a.id).join("|");
  useEffect(() => {
    if (!dragPinOrderRef.current) setDragPinOrder(null);
  }, [pinnedSig]);
  useLayoutEffect(() => {
    reorderFlip.current?.play({ duration: "base", ease: "spring", mode: "move" });
    reorderFlip.current = null;
  }, [dragPinOrder, unpinnedOrder]);
  const dragStartRef = useRef<{
    key: string;
    isPinned: boolean;
    pinnedId?: string;
    startX: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef<boolean>(false);
  const pillRef = useRef<HTMLElement>(null);
  const mag = useMagnification(pillRef);
  // Search opens and closes by FLIP (docs/SMOOTHNESS.md, G-04): layout changes in one frame and the
  // icons glide from where they were, instead of animating width/height on every icon.
  const searchFlip = useRef<FlipCapture | null>(null);
  const captureSearchFlip = () => {
    searchFlip.current = captureFlip(pillRef.current?.querySelectorAll(".dock-icons-row > *"));
  };
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOpenedAtRef = useRef<number>(0);
  const dockSearchOpenRef = useRef<boolean>(false);
  // The ref is the one owner of "search is open" (set by open/close themselves), so a press in the
  // same frame as a previous one sees the latest intent; React state follows it.

  /** Bumped by every open and close: a close whose glide finishes after a newer open does nothing
   *  (fast double-clicks, open during the hide glide). */
  const searchGenRef = useRef(0);
  const openInDockLauncher = () => {
    searchGenRef.current++;
    searchOpenedAtRef.current = performance.now();
    // One pop-out at a time: docked Settings goes when search opens.
    if (settingsOpenRef.current) {
      void hideSurface("settings", "Dock");
      setSettingsOpen(false);
    }
    const searchEdge = normalizeEdge((config?.dock as DockExtras | undefined)?.position);
    const horizontalDock = searchEdge === "bottom" || searchEdge === "top";
    const searchStyle = normalizeDockStyle((config?.dock as DockExtras | undefined)?.style);
    const barDock = dockStyleInfo(searchStyle).fullWidth;
    if (pillRef.current && !dockSearchOpenRef.current && horizontalDock && barDock) {
      // Full-width bars already have room: pin the row's left edge so the field opens to the right.
      const row = pillRef.current.querySelector(".dock-icons-row");
      const pr = pillRef.current.getBoundingClientRect();
      const padL = parseFloat(getComputedStyle(pillRef.current).paddingLeft) || 0;
      if (row) setLockedRowOffset(Math.max(0, Math.round(row.getBoundingClientRect().left - pr.left - padL)));
    } else if (pillRef.current && !dockSearchOpenRef.current && horizontalDock) {
      let startW = Math.round(pillRef.current.getBoundingClientRect().width);
      // The text box spreads out of the search icon; every other icon moves right. Icons may shrink a
      // little to make room, never below ~80 % of their size (tiny icons and a cramped field made the
      // Settings gear and the search field hard to hit). When that isn't enough the Dock widens just
      // enough, up to the screen, instead of crushing the row. Width changes in one frame; the pill's
      // edge and the icons glide by FLIP (see searchFlip).
      const row = pillRef.current.querySelector(".dock-icons-row");
      const others = row
        ? Array.from(row.children).filter((el) => !el.classList.contains("dock-search-slot"))
        : [];
      // The system area in the row (Unified, or tray and clock in the Dock) steps aside while
      // searching (DockSurface.css), so search gets Floating's room and the panel its own width.
      const rowItems = others.filter((el) => !el.classList.contains("dock-sys") && (el as HTMLElement).dataset.reflowKey !== "sys-divider");
      const asideW = others
        .filter((el) => !rowItems.includes(el))
        .reduce((w, el) => w + el.getBoundingClientRect().width + parseFloat(getComputedStyle(el).marginLeft || "0") + parseFloat(getComputedStyle(el).marginRight || "0"), 0);
      const iconCount = rowItems.filter((el) => !el.classList.contains("dock-divider")).length;
      const dividerCount = rowItems.length - iconCount;
      const slim = searchStyle === "slim";
      // What the pill is without the parts that step aside (their widths and the row gaps).
      startW = Math.round(startW - asideW - (others.length - rowItems.length) * (slim ? 4 : 6));
      // The whole search slot: glass + field + Ask toggle + ESC. 280 px leaves ~170 px to type in.
      const MIN_FIELD = slim ? 256 : 280;
      const chrome = slim ? 22 : 30; // pill padding + border while open
      const gap = slim ? 4 : 6;
      const dividerW = slim ? 5 : 9;
      const floorIcon = Math.max(slim ? 24 : 28, Math.round(effectiveIconSize * 0.8));
      const fixed = rowItems.length * gap + dividerCount * dividerW;
      const fit = Math.floor((startW - chrome - MIN_FIELD - fixed) / Math.max(1, iconCount));
      const icon = Math.max(floorIcon, Math.min(effectiveIconSize, fit));
      const needW = chrome + MIN_FIELD + fixed + icon * iconCount;
      const maxW = Math.max(startW, window.innerWidth - 32);
      setLockedDockWidth(Math.min(maxW, Math.max(startW, needW)));
      setSearchIconSize(icon);
    }
    const wasOpen = dockSearchOpenRef.current;
    if (!wasOpen) captureSearchFlip();
    // Known open at once, not at the next render: a second press in the same frame closes.
    dockSearchOpenRef.current = true;
    setDockSearchQuery("");
    setDockFilterTab("all");
    setDockSelectedIdx(0);
    setDockSearchOpen(true);
    void retryOnce(() => invoke("set_dock_search_expanded_cmd", { expanded: true }), "Dock", "open search");
    invoke<InstalledApp[]>("scan_installed_apps_cmd").then(setInstalledApps).catch(logFail("Dock", "list installed apps"));
    invoke<LauncherHomeData>("get_launcher_home_cmd").then(setHomeData).catch(logFail("Dock", "load search suggestions"));
    window.setTimeout(() => searchInputRef.current?.focus(), 40);
    window.setTimeout(() => searchInputRef.current?.focus(), 120);
  };

  const closeInDockLauncher = () => {
    if (!dockSearchOpenRef.current) return;
    dockSearchOpenRef.current = false;
    const gen = ++searchGenRef.current;
    setDockSearchClosing(true);
    // The results panel glides out first; then the row collapses in one frame and the icons glide back.
    const drawer = pillRef.current?.querySelector(".dock-launcher-drawer");
    // A glide that never finishes (window hidden mid-animation) must not leave search half-open.
    finishedOrGiveUp(glideOut(drawer, { y: 14, opacity: 0 }, { duration: "base" }).finished, 400).then(() => {
      if (gen !== searchGenRef.current) return; // reopened meanwhile
      captureSearchFlip();
      setDockSearchOpen(false);
      setDockSearchClosing(false);
      setDockSearchQuery("");
      setLockedDockWidth(null);
      setSearchIconSize(null);
      setLockedRowOffset(null);
      void retryOnce(() => invoke("set_dock_search_expanded_cmd", { expanded: false }), "Dock", "close search");
    });
  };

  // Focus can leave without a blur event reaching the page (Win32 focus handoffs, another app
  // stealing the foreground): while search is open, check focus twice a second as well, and close
  // after two misses in a row unless the pointer is still on the Dock.
  useEffect(() => {
    if (!dockSearchOpen) return;
    let misses = 0;
    const id = window.setInterval(() => {
      if (performance.now() - searchOpenedAtRef.current < 600) return;
      const pointerOnDock = !!pillRef.current?.matches(":hover");
      misses = !document.hasFocus() && !pointerOnDock ? misses + 1 : 0;
      if (misses >= 2) closeInDockLauncher();
    }, 400);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockSearchOpen]);

  // Which shape is wider along the panel/Dock joint (see DockSurface.css › One shape while
  // searching): the narrower one squares its joined corners so the two read as one outline.
  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill) return;
    if (!dockSearchOpen) {
      delete pill.dataset.join;
      pill.style.removeProperty("min-width");
      pill.style.removeProperty("min-height");
      return;
    }
    const drawer = pill.querySelector(".dock-launcher-drawer");
    if (!drawer) return;
    // The joint must land on a whole pixel: a fractional edge is anti-aliased in both shapes and a
    // faint light line shows through between them. Round the Dock's depth up while joined.
    const r0 = pill.getBoundingClientRect();
    if (isVerticalRef.current && r0.width % 1) pill.style.minWidth = `${Math.ceil(r0.width)}px`;
    if (!isVerticalRef.current && r0.height % 1) pill.style.minHeight = `${Math.ceil(r0.height)}px`;
    const p = pill.getBoundingClientRect();
    const d = drawer.getBoundingClientRect();
    const vertical = isVerticalRef.current;
    const diff = vertical ? d.height - p.height : d.width - p.width;
    pill.dataset.join = Math.abs(diff) <= 3 ? "flush" : diff > 0 ? "drawer-wider" : "pill-wider";
  });

  useLayoutEffect(() => {
    searchFlip.current?.play({
      duration: "slow",
      // The search field is revealed by clipping (no stretched text); icons move and scale.
      mode: (el) => (el.classList.contains("dock-search-slot") ? "clip" : "scale"),
    });
    searchFlip.current = null;
  }, [dockSearchOpen]);

  // The hover card and the right-click menu keep their CSS entry and gain an exit: they glide out
  // before they are removed (docs/SMOOTHNESS.md, G-06).
  const hoverLinger = useLingering(hoverCard && !ctxMenu && !settingsOpen && !dockSearchOpen ? hoverCard : null, { animateEnter: false, exit: { scale: 0.98, opacity: 0 }, exitOptions: { additive: true }, enterOptions: { additive: true }, enter: { scale: 0.98, opacity: 0 } });
  const shownCard = hoverLinger.value;
  // Apps with two or more windows get the window carousel (live previews on); one window keeps
  // today's card.
  const cardMode: DockCardMode | null = !shownCard
    ? null
    : shownCard.isSpotify
      ? "spotify"
      : (config?.dock as DockExtras | undefined)?.livePreviews === true && shownCard.windows.length >= 2
        ? "carousel"
        : (config?.dock as DockExtras | undefined)?.livePreviews === true
          ? "strip"
          : "list";
  // The card's measured size, so it can be kept on screen (read once per change, before paint).
  const [cardSize, setCardSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = hoverLinger.ref.current as HTMLElement | null;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setCardSize((p) => (Math.abs(p.w - w) < 1 && Math.abs(p.h - h) < 1 ? p : { w, h }));
  }, [shownCard?.key, shownCard?.windows.length, cardMode, hoverLinger.mounted]);
  const menuLinger = useLingering(ctxMenu, { animateEnter: false, exit: { scale: 0.98, opacity: 0 }, exitOptions: { additive: true }, enterOptions: { additive: true }, enter: { scale: 0.98, opacity: 0 } });
  const shownMenu = menuLinger.value;

  // Keyboard: the element that opened the menu gets focus back when it closes.
  const menuOpenerRef = useRef<HTMLElement | null>(null);
  const closeMenu = () => {
    setCtxMenu(null);
    void setDockMenuOpen(false);
    const opener = menuOpenerRef.current;
    menuOpenerRef.current = null;
    if (opener && opener.isConnected && document.activeElement && opener.ownerDocument.activeElement?.closest(".dock-ctx-menu")) opener.focus({ preventScroll: true });
  };

  const openMenu = (menu: DockMenuState) => {
    setHoverCard(null);
    menuOpenerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setCtxMenu(menu);
    void setDockMenuOpen(true);
  };

  // Opened from the keyboard (context-menu key or Shift+F10 on a focused icon): focus goes into the
  // menu so arrows and Enter work at once. With the mouse nothing visible changes (:focus-visible).
  useEffect(() => {
    if (!ctxMenu || !menuOpenerRef.current) return;
    const id = requestAnimationFrame(() => {
      menuLinger.ref.current?.querySelector<HTMLButtonElement>(".dock-ctx-item:not(:disabled)")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [ctxMenu]);

  const cancelHoverClose = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  // Hover intent (docs/DOCK_SMOOTHNESS.md › Frontend): a card opens when the pointer rests on an
  // icon for HOVER_INTENT_MS, not on every icon it crosses. Sweeping along the Dock used to open
  // and close a card, its native previews and the Dock's click region for each icon passed. Once a
  // card is showing (or closed moments ago) the next one opens at once, like macOS tooltips.
  const HOVER_INTENT_MS = 90;
  const HOVER_WARM_MS = 350;
  const hoverIntentRef = useRef<number | null>(null);
  const hoverShownRef = useRef<{ key: string | null; closedAt: number }>({ key: null, closedAt: 0 });
  hoverShownRef.current.key = hoverCard?.key ?? null;
  const cancelHoverIntent = () => {
    if (hoverIntentRef.current !== null) {
      window.clearTimeout(hoverIntentRef.current);
      hoverIntentRef.current = null;
    }
  };

  const scheduleHoverClose = () => {
    cancelHoverClose();
    cancelHoverIntent();
    hoverTimerRef.current = window.setTimeout(() => {
      if (hoverShownRef.current.key) hoverShownRef.current.closedAt = performance.now();
      setHoverCard(null);
      if (!ctxMenu && !dockSearchOpenRef.current) {
        void setDockMenuOpen(false);
      }
    }, 180);
  };

  const openHoverCardForItem = (
    el: HTMLElement,
    key: string,
    title: string,
    isSpotify: boolean,
    windows: RunningWindow[],
    iconUrl?: string | null,
    /** The hover-intent delay has already passed. */
    intended = false
  ) => {
    if (ctxMenu || settingsOpen || dockSearchOpenRef.current) return;
    if (!isSpotify && windows.length === 0) return;
    cancelHoverClose();
    cancelHoverIntent();
    // Already showing this icon's card: nothing to do (no state change, no IPC).
    if (hoverShownRef.current.key === key) return;
    const warm = intended || hoverShownRef.current.key !== null || performance.now() - hoverShownRef.current.closedAt < HOVER_WARM_MS;
    if (!warm) {
      hoverIntentRef.current = window.setTimeout(() => {
        hoverIntentRef.current = null;
        if (el.isConnected && el.matches(":hover")) openHoverCardForItem(el, key, title, isSpotify, windows, iconUrl, true);
      }, HOVER_INTENT_MS);
      return;
    }
    const r = el.getBoundingClientRect();
    const e = normalizeEdge((config?.dock as DockExtras | undefined)?.position);
    // With magnification the hovered icon grows past the Dock edge: keep the card clear of it.
    const magId = normalizeMagnification((config?.dock as DockExtras | undefined)?.magnification);
    const grow = magId === "off" ? 0 : ((DOCK_MAGNIFICATION.find((m) => m.id === magId)?.scale ?? 1) - 1) * r.width;
    const magHeadroom = e === "bottom" ? -grow : e === "top" ? grow : 0;
    setHoverCard({
      key,
      x: e === "left" ? r.right : e === "right" ? r.left : r.left + r.width / 2,
      y: (e === "top" ? r.bottom : e === "left" || e === "right" ? r.top + r.height / 2 : r.top) + magHeadroom,
      title,
      isSpotify,
      windows,
      iconUrl,
    });
    void setDockMenuOpen(true);
  };

  const triggerLaunchAnim = (id: string) => {
    setLaunchingId(null);
    requestAnimationFrame(() => {
      setLaunchingId(id);
      window.setTimeout(() => {
        setLaunchingId((curr) => (curr === id ? null : curr));
      }, launchMsRef.current);
    });
  };

  useEffect(() => {
    const syncSettingsVis = () => {
      invoke<boolean>("is_surface_visible_cmd", { label: "settings" })
        .then((vis) => setSettingsOpen(Boolean(vis)))
        .catch(quiet);
    };
    syncSettingsVis();
    const t1 = window.setTimeout(syncSettingsVis, 350);
    const t2 = window.setTimeout(syncSettingsVis, 1000);
    const unlisten = listen<boolean>("lens://dock-visible", (e) => {
      setDockVisible(e.payload);
      // Nothing stays open on a hidden Dock.
      if (!e.payload) {
        setHoverCard(null);
        closeMenu();
        closeInDockLauncher();
        if (settingsOpenRef.current) {
          void hideSurface("settings", "Dock");
          setSettingsOpen(false);
        }
      }
    });
    const unlistenSearch = listen<boolean>("lens://dock-search-open", (e) => {
      if (!e.payload) {
        closeInDockLauncher();
      }
    });
    const unlistenSettings = listen<boolean>("lens://settings-open", (e) => {
      setSettingsOpen(e.payload);
      if (e.payload) {
        closeInDockLauncher();
      }
    });
    const unlistenSettingsDocked = listen<boolean>("lens://settings-docked", (e) => setSettingsDocked(e.payload));
    const unlistenSettingsTab = listen<string>("lens://settings-tab", (e) => {
      if (e.payload) setActiveSettingsTab(e.payload);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
        closeInDockLauncher();
      }
    };
    // The watcher clears a menu/hover/search flag that has gone stale (pointer away, Dock
    // unfocused) so auto-hide can resume; close the matching UI here so both sides agree.
    const unlistenDismiss = listen("lens://dock-dismiss-menus", () => {
      setHoverCard(null);
      closeMenu();
      closeInDockLauncher();
    });
    // Leaving the Dock window entirely (fast flicks out through click-through glass) closes a
    // hover card even when the card's own mouseleave never fired.
    const onDocLeave = (e: MouseEvent) => {
      if (e.relatedTarget === null) {
        setHoverCard(null);
        if (!dockSearchOpenRef.current) {
          void setDockMenuOpen(false);
        }
      }
    };
    document.addEventListener("mouseout", onDocLeave);
    const onBlur = () => {
      setHoverCard(null);
      closeMenu();
      // Ignore the transient Win32 focus handoff right after expanding the Dock window, but check
      // again once it is over: focus that really went to another app still closes search.
      const check = () => {
        const young = performance.now() - searchOpenedAtRef.current;
        if (young < 500) {
          window.setTimeout(check, 520 - young);
          return;
        }
        if (!document.hasFocus()) closeInDockLauncher();
      };
      window.setTimeout(check, 160);
    };
    // A click on the Dock window outside the Dock and its panel (the transparent area around it).
    const onOutside = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || t.closest(".dock-pill, .dock-split-pill, .dock-ctx-menu, .dock-hover-card, .dock-launcher-drawer, [role=dialog]")) return;
      closeInDockLauncher();
    };
    document.addEventListener("pointerdown", onOutside, true);
    // Settings' real visibility wins over what the page last heard (a missed event, a crash).
    const reconcile = window.setInterval(() => {
      if (document.hidden) return;
      invoke<boolean>("is_surface_visible_cmd", { label: "settings" })
        .then((vis) => {
          if (typeof vis === "boolean" && vis !== settingsOpenRef.current) setSettingsOpen(vis);
        })
        .catch(quiet);
    }, 1500);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      unlisten.then((fn) => fn());
      unlistenSearch.then((fn) => fn());
      unlistenSettings.then((fn) => fn());
      unlistenSettingsTab.then((fn) => fn());
      unlistenSettingsDocked.then((fn) => fn());
      unlistenDismiss.then((fn) => fn());
      document.removeEventListener("mouseout", onDocLeave);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerdown", onOutside, true);
      window.clearInterval(reconcile);
    };
  }, []);

  // Report the open flyout's rect so the watcher can tell a click or pointer outside the Dock
  // (and close everything / resume auto-hide) from one inside it.
  useEffect(() => {
    const report = () => {
      const els = document.querySelectorAll<HTMLElement>(
        ".dock-hover-card, .dock-ctx-menu, .dock-launcher-drawer"
      );
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      els.forEach((el) => {
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 || rc.height === 0) return;
        l = Math.min(l, rc.left); t = Math.min(t, rc.top);
        r = Math.max(r, rc.right); b = Math.max(b, rc.bottom);
      });
      const open = Number.isFinite(l);
      void retryOnce(() => invoke("set_dock_flyout_rect_cmd", open ? { x: l, y: t, w: r - l, h: b - t } : { x: 0, y: 0, w: 0, h: 0 }), "Dock", "report the open flyout");
    };
    const raf = requestAnimationFrame(report);
    const t1 = window.setTimeout(report, 260); // after open/close transitions settle
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
    };
  }, [hoverCard, ctxMenu, dockSearchOpen, dockSearchClosing]);

  // Alt+1..9 (registered by the backend when enabled) activates the Nth dock app.
  useEffect(() => {
    const unlisten = listen<number>("lens://dock-activate-index", (e) =>
      activateRef.current(Number(e.payload))
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const pulseHwnds = useMinimizePulse(runningWindows, (config?.dock as DockExtras | undefined)?.minimizeFeedback === true);
  const dropKey = useFileDrop((config?.dock as DockExtras | undefined)?.fileDropOpen === true, aiOn, setAiDropPaths);

  usePillReport(pillRef, splitPillRef, dockSearchOpenRef, config?.dock as (DockExtras & { iconSize?: number }) | undefined, [
    dockVisible,
    config?.dock.pinnedApps.length,
    runningWindows.length,
  ]);

  useEffect(() => {
    if (!config) return;
    config.dock.pinnedApps.forEach((app) => {
      if (pinnedIcons[app.path] !== undefined) return;
      invoke<string | null>("get_icon_for_path", { path: app.path })
        .then((url) => {
          setPinnedIcons((prev) => ({ ...prev, [app.path]: url }));
        })
        .catch(() => {
          setPinnedIcons((prev) => ({ ...prev, [app.path]: null }));
        });
    });
  }, [config?.dock.pinnedApps]);

  // Same ranking as the Launcher and Command Palette (src/search). Must run before the early return.
  const dockSearch = useUnifiedSearch(dockSearchOpen ? dockSearchQuery : "", {
    surface: "dock",
    onDone: () => closeInDockLauncher(),
    windows: runningWindows,
    config,
    updateConfig,
    limit: 40,
  });

  // Pin / unpin / reorder / open / close glide instead of jumping (src/dock/reflow.ts).
  const reflow = useDockReflow();
  if (!config) return null;

  const pinnedApps = dragPinOrder
    ? [...config.dock.pinnedApps].sort((x, y) => {
        const ix = dragPinOrder.indexOf(x.id);
        const iy = dragPinOrder.indexOf(y.id);
        return (ix === -1 ? 1e9 : ix) - (iy === -1 ? 1e9 : iy);
      })
    : config.dock.pinnedApps;
  const pinnedFolders = config.dock.pinnedFolders;
  const dockExtras = config.dock as typeof config.dock & DockExtras;
  const edge = normalizeEdge(dockExtras.position);
  const isVertical = edge === "left" || edge === "right";
  isVerticalRef.current = isVertical;
  const locked = dockExtras.locked === true;
  const separatorsAfter = dockExtras.separatorsAfter ?? [];
  const livePreviews = dockExtras.livePreviews === true;
  const dockStyle = normalizeDockStyle(dockExtras.style);
  const isBar = dockStyleInfo(dockStyle).fullWidth;
  const alignment = resolveDockAlignment(dockStyle, dockExtras.alignment);
  const systemInDock = resolveSystemArea(config.dock, config.topBar) === "dock";
  const showLauncherButton = dockShowsLauncher(dockStyle);
  // Magic button (wave M4): with the Taskbar style, the start button opens Lens Magic Start.
  const startOpensMagic = dockStyle === "taskbar" && !!(config as { magicWaves?: { startButton?: boolean } } | null)?.magicWaves?.startButton;
  const unreadTotal = Object.values(notifCounts).reduce((a, b) => a + b, 0);
  const magnification = normalizeMagnification(dockExtras.magnification);
  const magScale = DOCK_MAGNIFICATION.find((m) => m.id === magnification)?.scale ?? 1;
  const magRange = clampMagnificationRange(dockExtras.magnificationRange);
  const launchAnimation = normalizeLaunchAnimation(dockExtras.launchAnimation);
  launchMsRef.current = DOCK_LAUNCH_ANIMATIONS.find((a) => a.id === launchAnimation)?.durationMs || 190;
  const showLabels = dockExtras.showLabels === true;
  const scrollCycles = dockExtras.scrollCyclesWindows === true;

  /** Mouse wheel over an app: cycle through its windows (newest focus last). */
  const cycleWindows = (key: string, wins: RunningWindow[], deltaY: number) => {
    if (!scrollCycles || wins.length === 0) return;
    const now = performance.now();
    if (now - wheelAtRef.current < 140) return;
    wheelAtRef.current = now;
    const cur = wheelIdxRef.current[key] ?? Math.max(0, wins.findIndex((w) => w.isFocused));
    const next = (cur + (deltaY > 0 ? 1 : -1) + wins.length) % wins.length;
    wheelIdxRef.current[key] = next;
    invoke("focus_window_cmd", { hwnd: wins[next].hwnd }).catch(logFail("Dock", "switch to the next window"));
  };
  const updateDockExtras = (patch: DockExtras) =>
    updateConfig({ ...config, dock: { ...config.dock, ...patch } as typeof config.dock });

  // Running windows sit on their pinned app's slot; the rest are grouped by process, in the
  // order the person dragged them into (src/dock/model.ts).
  const { pinnedRows, extraGroups: extraGroupsRaw } = assignWindows(pinnedApps, runningWindows);
  const extraGroups = orderGroups(extraGroupsRaw, unpinnedOrder);

  reflow.render(
    [
      showLauncherButton ? "L" : "",
      ...pinnedRows.map((r) => r.app.id + (separatorsAfter.includes(r.app.id) ? "|" : "")),
      "~",
      ...extraGroups.map((g) => g.key),
      systemInDock && !isBar && dockStyle !== "split" ? "S" : "",
    ].join(","),
    () => pillRef.current?.querySelector(".dock-icons-row"),
    isVertical ? "y" : "x",
    !dragKey && !dragPinOrder && !dockSearchOpen && !dockSearchClosing && dockVisible
  );

  const captureReorderFlip = () => {
    reorderFlip.current = captureFlip(pillRef.current?.querySelectorAll(".dock-icons-row > [data-dock-drag-key]"));
  };
  /** Moves a pinned app in the in-drag order (no config write until the drag ends). Reads the
   *  latest order from a ref: the pointer handlers were created at pointer-down, and the config
   *  they closed over is stale after the first swap (that made the order jump back and forth). */
  const reorderPinnedIds = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = dragPinOrderRef.current ?? configRef.current.dock.pinnedApps.map((a) => a.id);
    const fromIdx = list.indexOf(fromId);
    const toIdx = list.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...list];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    captureReorderFlip();
    dragPinOrderRef.current = next;
    setDragPinOrder(next);
  };
  const commitPinnedOrder = () => {
    const order = dragPinOrderRef.current;
    dragPinOrderRef.current = null;
    if (!order) return;
    const cur = configRef.current;
    const list = [...cur.dock.pinnedApps].sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
    const changed = list.some((a, i) => a.id !== cur.dock.pinnedApps[i]?.id);
    if (changed) updateConfig({ ...cur, dock: { ...cur.dock, pinnedApps: list } });
    // Keep showing the dragged order until the saved config comes back (no flash of the old order).
    if (!changed) setDragPinOrder(null);
  };

  const reorderUnpinnedKeys = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const base = extraGroups.map((g) => g.key);
    const fromIdx = base.indexOf(fromKey);
    const toIdx = base.indexOf(toKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = base.splice(fromIdx, 1);
    base.splice(toIdx, 0, moved);
    captureReorderFlip();
    setUnpinnedOrder(base);
  };

  const beginItemDrag = (
    e: React.PointerEvent,
    key: string,
    isPinned: boolean,
    pinnedId?: string
  ) => {
    if (e.button !== 0 || locked) return;
    const target = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    dragStartRef.current = {
      key,
      isPinned,
      pinnedId,
      startX: e.clientX,
      moved: false,
    };
    const startY = e.clientY;
    let lastOver: string | null = null;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const st = dragStartRef.current;
      if (!st) return;
      // Either axis: on the left/right edges the Dock is vertical and drags go up and down.
      if (!st.moved && Math.hypot(ev.clientX - st.startX, ev.clientY - startY) > 6) {
        st.moved = true;
        suppressClickRef.current = true;
        // Keep every move and the release coming to us even when the pointer leaves the icon or the
        // Dock window, so a fast drag can't strand the Dock in its dragging state.
        try { target.setPointerCapture(pointerId); } catch { /* element gone */ }
        setDragKey(st.key);
      }
      if (!st.moved) return;

      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const wrap = el?.closest("[data-dock-drag-key]") as HTMLElement | null;
      if (!wrap) return;
      const targetKey = wrap.dataset.dockDragKey;
      const targetPinned = wrap.dataset.dockPinned === "true";
      const targetPinnedId = wrap.dataset.dockPinnedId;
      if (!targetKey || targetKey === st.key || targetKey === lastOver) return;
      lastOver = targetKey;

      setDragOverKey(targetKey);
      if (st.isPinned && targetPinned && st.pinnedId && targetPinnedId) {
        reorderPinnedIds(st.pinnedId, targetPinnedId);
      } else if (!st.isPinned && !targetPinned) {
        reorderUnpinnedKeys(st.key, targetKey);
      }
    };

    const finish = (ev?: PointerEvent) => {
      if (ev && ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      target.removeEventListener("lostpointercapture", onLost);
      try { if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId); } catch { /* gone */ }
      const st = dragStartRef.current;
      dragStartRef.current = null;
      if (st?.moved && st.isPinned) commitPinnedOrder();
      setDragKey(null);
      setDragOverKey(null);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 60);
    };
    const onLost = () => finish();

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    target.addEventListener("lostpointercapture", onLost);
  };

  // Infinitely adjust icon size smoothly if total icons (plus expanded search bar) exceed screen width
  const totalItems = 2 + pinnedRows.length + extraGroups.length + (showLauncherButton ? 1 : 0);
  const searchBudget = 0; // the Dock keeps its width while searching
  const dockAxisLength = isVertical ? window.innerHeight : window.innerWidth;
  // Bars keep both sides of the row free for the system area so icons stay centred on the screen.
  // Unified carries the tray, bell and a two-line clock in the same pill: a little more room.
  const systemBudget = systemInDock && dockStyle !== "split" ? (isBar ? (isVertical ? 400 : 560) : dockStyle === "unified" ? 280 : 200) : 0;
  const maxAvailable = Math.max(isVertical ? 320 : 480, dockAxisLength - 28 - searchBudget - systemBudget);
  const gapBudget = totalItems * 6 + 34;
  const rawFit = Math.floor((maxAvailable - gapBudget) / Math.max(1, totalItems));
  const effectiveIconSize = Math.max(22, Math.min(resolveDockIconSize(config.dock, dockStyle), rawFit));
  mag.params.current = { enabled: magnification !== "off" && !dockSearchOpen && !ctxMenu, vertical: isVertical, iconSize: effectiveIconSize, scale: magScale, range: magRange };

  const closeWindows = (wins: RunningWindow[]) =>
    wins.forEach((w) => invoke("window_action_cmd", { hwnd: w.hwnd, action: "close" }));

  activateRef.current = (n: number) => {
    const items = [
      ...pinnedRows.map((r) => ({ id: r.app.id, wins: r.wins, primary: r.primaryWin, path: r.app.path })),
      ...extraGroups.map((g) => ({
        id: `win-${g.primaryWin.hwnd}`,
        wins: g.wins,
        primary: g.primaryWin as RunningWindow | undefined,
        path: g.primaryWin.exePath,
      })),
    ];
    const it = items[n - 1];
    if (!it) return;
    triggerLaunchAnim(it.id);
    if (!it.primary) {
      invoke("launch_app_cmd", { path: it.path });
      return;
    }
    const focusedIdx = it.wins.findIndex((w) => w.isFocused);
    if (focusedIdx >= 0 && it.wins.length > 1) {
      // Pressing again cycles through that app's windows.
      invoke("focus_window_cmd", { hwnd: it.wins[(focusedIdx + 1) % it.wins.length].hwnd }).catch(logFail("Dock", "switch to that window"));
    } else {
      // Same as clicking: focuses, or minimizes when already in front.
      invoke("focus_window_cmd", { hwnd: it.primary.hwnd }).catch(logFail("Dock", "switch to that window"));
    }
  };

  const pinWindow = (win: RunningWindow) => {
    if (!win.exePath) return;
    if (config.dock.pinnedApps.some((a) => matchesPinnedApp(a, win))) return;
    const cleanName = win.processName.replace(/\.exe$/i, "");
    updateConfig({
      ...config,
      dock: {
        ...config.dock,
        pinnedApps: [
          ...config.dock.pinnedApps,
          {
            id: `pin-${Date.now()}`,
            name: cleanName,
            path: win.exePath,
            iconHint: null,
          },
        ],
      },
    });
  };

  const unpinApp = (id: string) => {
    updateConfig({
      ...config,
      dock: {
        ...config.dock,
        pinnedApps: config.dock.pinnedApps.filter((a) => a.id !== id),
      },
    });
  };

  const removeFolder = (id: string) => {
    updateConfig({
      ...config,
      dock: {
        ...config.dock,
        pinnedFolders: config.dock.pinnedFolders.filter((f) => f.id !== id),
      },
    });
  };

  const iconTheme = config.iconStyle?.theme ?? "obsidian-squircle";
  const iconShape = config.iconStyle?.shape ?? "squircle";

  // What the search panel lists (src/dock/searchItems.ts); typed queries rank like the Launcher.
  const searchSources = {
    windows: runningWindows,
    home: homeData,
    installedApps,
    focus: (hwnd: number) => {
      closeInDockLauncher();
      invoke("focus_window_cmd", { hwnd }).catch(logFail("Dock", "switch to that window"));
    },
    open: (path: string) => {
      closeInDockLauncher();
      invoke("launch_app_cmd", { path });
    },
  };
  const recentAndRunning = homeRows(searchSources);
  const qLower = dockSearchQuery.trim().toLowerCase();
  const filteredResults = qLower
    ? toDockResults(dockSearch.results, dockFilterTab, dockSearch.activate, dockSearch.armedKey).slice(0, DOCK_RESULT_LIMIT)
    : browseResults(searchSources, dockFilterTab);

  const showHomeGrid = qLower === "" && dockFilterTab === "all";

  return (
    <div
      data-guide-id="dock"
      className={`dock-stage dock-edge-${edge} dock-style-${dockStyle} dock-align-${alignment} ${isBar ? "is-bar" : ""} ${systemInDock ? "has-dock-system" : ""} ${magnification !== "off" ? `mag-on mag-${magnification}` : ""} ${launchAnimation !== "lift" ? `launch-${launchAnimation}` : ""} ${showLabels ? "show-labels" : ""} icon-theme-${iconTheme} icon-shape-${iconShape}`}
      style={{
        ["--dock-effective-icon-size" as string]: `${
          dockSearchOpen && searchIconSize ? searchIconSize : effectiveIconSize
        }px`,
        ["--dock-full-icon-size" as string]: `${effectiveIconSize}px`,
        ...(isBar && isVertical && topBarEnabled(config)
          ? { ["--dock-topbar-offset" as string]: `${config.topBar?.height ?? 34}px` }
          : {}),
      }}
    >
      <McpBridge config={config} updateConfig={updateConfig} />
      <AiApplyBridge config={config} updateConfig={updateConfig} />
      {shownMenu && menuLinger.mounted && (
        <DockContextMenu
          menu={shownMenu}
          menuRef={menuLinger.ref}
          leaving={menuLinger.leaving}
          edge={edge}
          style={
              edge === "left"
                ? { left: (pillRef.current?.getBoundingClientRect().right ?? 60) + 12, top: Math.max(170, Math.min(window.innerHeight - 170, shownMenu.y + effectiveIconSize / 2)) }
                : edge === "right"
                  ? { left: (pillRef.current?.getBoundingClientRect().left ?? window.innerWidth - 60) - 12, top: Math.max(170, Math.min(window.innerHeight - 170, shownMenu.y + effectiveIconSize / 2)) }
                  : edge === "top"
                    ? { left: Math.max(100, Math.min(window.innerWidth - 100, shownMenu.x)), top: shownMenu.y + effectiveIconSize + 18 }
                    : { left: Math.max(100, Math.min(window.innerWidth - 100, shownMenu.x)), top: shownMenu.y - 12 }
            }
          config={config}
          updateConfig={updateConfig}
          locked={locked}
          separatorsAfter={separatorsAfter}
          livePreviews={livePreviews}
          closeMenu={closeMenu}
          updateDockExtras={updateDockExtras}
          unpinApp={unpinApp}
          pinWindow={pinWindow}
          removeFolder={removeFolder}
          openPopoutTab={(tab) => {
            setSettingsOpen(true);
            setActiveSettingsTab(tab);
            invoke("open_dock_popout_tab_cmd", { tab });
          }}
          openSearch={openInDockLauncher}
        />
      )}

      {shownCard && hoverLinger.mounted && (
        <DockHoverCard
          card={shownCard}
          cardRef={hoverLinger.ref}
          leaving={hoverLinger.leaving}
          edge={edge}
          livePreviews={livePreviews}
          mode={cardMode}
          // Kept inside the usable area on every edge and style, from the card's measured size.
          style={placeHoverCard({
            edge,
            x: shownCard.x,
            y: shownCard.y,
            w: cardSize.w,
            h: cardSize.h,
            viewW: window.innerWidth,
            viewH: window.innerHeight,
            topInset: edge !== "top" && topBarEnabled(config) ? (config.topBar?.height ?? 34) : 0,
          })}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
          onFocusWindow={(hwnd) => {
            setHoverCard(null);
            void setDockMenuOpen(false);
            invoke("focus_window_cmd", { hwnd }).catch(logFail("Dock", "switch to that window"));
          }}
          onCloseWindow={(hwnd) => {
            invoke("window_action_cmd", { hwnd, action: "close" });
            setHoverCard((prev) =>
              prev ? { ...prev, windows: prev.windows.filter((x) => x.hwnd !== hwnd) } : null
            );
          }}
          musicCard={<DockMusicCard edge={edge} fallbackTitle={shownCard.windows[0]?.title || "Spotify"} />}
        />
      )}

      <nav
        ref={pillRef}
        className={`dock-pill ${locked ? "is-locked" : ""} ${!dockVisible ? "is-hidden" : ""} ${settingsOpen && settingsDocked ? "is-fused-top" : ""} ${dockSearchOpen ? "is-expanded-launcher" : ""} ${ctxMenu ? "is-menu-open" : ""}`}
        style={
          isBar
            ? dockSearchOpen && lockedRowOffset !== null && !isVertical
              ? { gridTemplateColumns: `${lockedRowOffset}px auto 1fr` }
              : undefined
            : dockSearchOpen && lockedDockWidth && !isVertical
              ? { width: lockedDockWidth, minWidth: lockedDockWidth }
              : undefined
        }
        aria-label="Lens Grounded Dock"
        onMouseMove={magnification !== "off" ? (e) => mag.apply(e.clientX, e.clientY) : undefined}
        onMouseLeave={magnification !== "off" ? mag.clear : undefined}
        onContextMenu={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest("[data-dock-drag-key]")) {
            e.preventDefault();
            const r = pillRef.current?.getBoundingClientRect();
            openMenu({ kind: "dock", x: e.clientX, y: r ? r.top : e.clientY });
          }
        }}
      >
        {/* TIER 1: In-Dock Expanded Launcher Drawer (Directly above the single unified Dock row!) */}
        {dockSearchOpen && askMode.mode !== "ask" && (
          <DockSearchDrawer
            closing={dockSearchClosing}
            onClose={closeInDockLauncher}
            homeData={homeData}
            installedApps={installedApps}
            runningCount={runningWindows.length}
            filterTab={dockFilterTab}
            pickFilterTab={(tab) => {
              setDockFilterTab(tab);
              setDockSelectedIdx(0);
              searchInputRef.current?.focus();
            }}
            setFilterTab={setDockFilterTab}
            showHomeGrid={showHomeGrid}
            recentAndRunning={recentAndRunning}
            results={filteredResults}
            selectedIdx={dockSelectedIdx}
            setSelectedIdx={setDockSelectedIdx}
            openFolder={searchSources.open}
            openApp={(app) => {
              closeInDockLauncher();
              if (config?.dock?.suggestedApps) recordDockLaunch({ key: app.path.toLowerCase(), name: app.name, path: app.path });
              invoke("launch_app_cmd", { path: app.path });
            }}
          />
        )}

        {/* TIER 2: Single Unified Grounded Dock Row — original Magnifying Glass glides open IN-PLACE into the search input! */}
        {isBar && <div className="dock-bar-spacer" aria-hidden="true" />}
        <div className="dock-icons-row">
          {showLauncherButton && (
            <div className="dock-item-wrap dock-launcher-slot" data-reflow-key="launcher">
              <span className="dock-tooltip">{startOpensMagic ? "Magic Start" : "Launcher"}</span>
              <button
                type="button"
                className={`dock-item dock-launcher-btn ${launchingId === "launcher" ? "is-launching" : ""}`}
                aria-label={startOpensMagic ? "Open Magic Start" : "Open Launcher"}
                onClick={() => {
                  triggerLaunchAnim("launcher");
                  if (startOpensMagic) {
                    // The backend refuses while the Magic button is off; the Launcher is the fallback.
                    invoke("toggle_magic_start").catch(() => invoke("toggle_surface", { label: "launcher" }).catch(logFail("Dock", "open the Launcher")));
                    return;
                  }
                  invoke("toggle_surface", { label: "launcher" }).catch(logFail("Dock", "open the Launcher"));
                }}
              >
                <LayoutGrid size={19} strokeWidth={2.15} />
              </button>
            </div>
          )}
          <div className={`dock-item-wrap dock-search-slot ${dockSearchOpen ? "is-open" : ""} ${dockSearchClosing ? "is-closing" : ""}`} data-reflow-key="search">
            {!dockSearchOpen && <span className="dock-tooltip">Lens Search (Alt+Space)</span>}
            <div
              className={`dock-search-inline ${dockSearchOpen ? "is-open" : ""}`}
              onClick={() => {
                if (!dockSearchOpen) {
                  openInDockLauncher();
                } else {
                  searchInputRef.current?.focus();
                }
              }}
            >
              {/* At rest this is a normal dock icon, identical to the settings gear; the text box grows out of it. */}
              <button
                type="button"
                className={`dock-search-mag-btn ${dockSearchOpen ? "" : "dock-item"}`}
                aria-label="Toggle Lens Search"
                onClick={(e) => {
                  e.stopPropagation();
                  if (dockSearchOpenRef.current) {
                    closeInDockLauncher();
                  } else {
                    openInDockLauncher();
                  }
                }}
              >
                <Search size={19} strokeWidth={2.15} />
              </button>

              {dockSearchOpen && (
                <>
                  <input
                    ref={searchInputRef}
                    className="dock-search-glide-input"
                    data-guide-id="dock.search"
                    value={dockSearchQuery}
                    placeholder={askMode.mode === "ask" ? "Ask anything…" : "Search…"}
                    onChange={(e) => {
                      setDockSearchQuery(e.target.value);
                      setDockSelectedIdx(0);
                    }}
                    onKeyDown={(e) => {
                      if (askMode.onKeyDown(e)) return;
                      if (askMode.mode === "ask" && e.key === "Enter" && dockSearchQuery.trim()) {
                        e.preventDefault();
                        setAskCtx(undefined);
                        setAskPrompt(dockSearchQuery.trim());
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        closeInDockLauncher();
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setDockSelectedIdx((s) => Math.min(Math.max(0, filteredResults.length - 1), s + 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setDockSelectedIdx((s) => Math.max(0, s - 1));
                      } else if (e.key === "Enter" && filteredResults[dockSelectedIdx]) {
                        e.preventDefault();
                        filteredResults[dockSelectedIdx].run();
                      }
                    }}
                  />
                  {aiOn && <AskModeToggle mode={askMode.mode} onToggle={askMode.toggle} />}
                  <button
                    type="button"
                    className="dock-search-esc"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeInDockLauncher();
                    }}
                  >
                    ESC
                  </button>
                </>
              )}
            </div>
          </div>

          {aiOn && !dockSearchOpen && (
            <div
              className="dock-item-wrap"
              data-dock-drag-key="ai-drop"
              data-dock-ai-drop="true"
              onContextMenu={(e) => {
                // Right-click the sparkle: Lens Mini anchored above the Dock (docs/COMMAND.md (b)).
                e.preventDefault();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                const x = Math.round((window.screenX + r.left + r.width / 2) * dpr);
                const top = Math.round((window.screenY + r.top) * dpr);
                invoke("show_command_cmd", { payload: { layout: "mini", anchor: `dock:${x}:${top}` } }).catch(logFail("Dock", "open Lens Mini"));
              }}
            >
              <DropSparkle
                active={dropKey === "ai-drop"}
                onClick={() => {
                  askMode.setMode("ask");
                  openInDockLauncher();
                }}
              />
            </div>
          )}

          <div className="dock-divider" />

          {aiOn && (
            <SuggestedApps
              enabled={!!config?.dock?.suggestedApps}
              exclude={pinnedRows.map(({ app }) => app.path.toLowerCase())}
              iconFor={(p) => pinnedIcons[p]}
              onLaunch={(sug) => {
                recordDockLaunch({ key: sug.path.toLowerCase(), name: sug.name, path: sug.path });
                invoke("launch_app_cmd", { path: sug.path });
              }}
            />
          )}

          {askPrompt !== null && (
            <AskDockPopover
              open
              prompt={askPrompt}
              context={askCtx}
              edge={edge}
              onClose={() => setAskPrompt(null)}
              onOpenSettings={() => {
                invoke("open_surface", { label: "settings" })
                  .then(() => emit("lens://settings-tab", "ai"))
                  .catch(logFail("Dock", "open Settings"));
              }}
            />
          )}

          {aiDropPaths && (
            <div className="dock-ai-drop-anchor">
              <DropToAiMenu
                paths={aiDropPaths}
                onClose={() => setAiDropPaths(null)}
                onAsk={(prompt, ctx) => {
                  setAiDropPaths(null);
                  setAskCtx(ctx);
                  setAskPrompt(prompt);
                }}
              />
            </div>
          )}

        {/* Pinned apps (open windows sit on their pinned slot), then running apps that aren't pinned. */}
        {pinnedRows.map(({ app, wins, primaryWin }) => {
          const iconSrc = primaryWin?.iconDataUrl || pinnedIcons[app.path];
          const itemKey = `pin-${app.id}`;
          const isSpotify =
            app.name.toLowerCase().includes("spotify") ||
            app.path.toLowerCase().includes("spotify") ||
            wins.some((w) => w.processName.toLowerCase().includes("spotify"));
          const launch = () => {
            if (config?.dock?.suggestedApps) recordDockLaunch({ key: app.path.toLowerCase(), name: app.name, path: app.path });
            invoke("launch_app_cmd", { path: app.path });
          };
          return (
            <React.Fragment key={app.id}>
            <DockAppItem
              view={{
                itemKey,
                pinnedId: app.id,
                launchPath: app.path,
                name: app.name,
                ariaName: app.name,
                closeName: app.name,
                wins,
                primaryWin,
                icon: iconSrc ? <img src={iconSrc} alt={app.name} /> : <FallbackAppIcon hint={app.iconHint} />,
                barLabel: primaryWin?.title && wins.length === 1 ? primaryWin.title : app.name,
                hasHoverCard: isSpotify || wins.length > 0,
                unread: notifBadgeFor(notifCounts, app.name, primaryWin?.processName, app.path.split(/[\\/]/).pop()),
                urgent: attentionFor(attention, app.path, ...wins.map((w) => w.exePath), ...wins.map((w) => w.processName)),
                coreBadge: coreBadges[app.path],
              }}
              dragging={dragKey === itemKey}
              dragOver={dragOverKey === itemKey}
              fileDrop={dropKey === itemKey}
              launching={launchingId === app.id}
              pulsing={wins.some((w) => pulseHwnds.has(w.hwnd))}
              showLabels={showLabels}
              isBar={isBar}
              onWheel={scrollCycles ? (e) => cycleWindows(itemKey, wins, e.deltaY) : undefined}
              onPointerDown={(e) => beginItemDrag(e, itemKey, true, app.id)}
              onHover={(el) => openHoverCardForItem(el, itemKey, app.name, isSpotify, wins, iconSrc)}
              onLeave={scheduleHoverClose}
              onCloseAll={() => closeWindows(wins)}
              onActivate={() => {
                if (suppressClickRef.current) return;
                setHoverCard(null);
                triggerLaunchAnim(app.id);
                if (primaryWin) {
                  invoke("focus_window_cmd", { hwnd: primaryWin.hwnd }).catch(logFail("Dock", "switch to that window"));
                } else {
                  launch();
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (e.altKey) {
                  openMagicForDockItem(app.id, app.name, primaryWin?.exePath || app.path);
                  return;
                }
                const r = e.currentTarget.getBoundingClientRect();
                openMenu({
                  kind: "app",
                  x: r.left + r.width / 2,
                  y: r.top,
                  title: primaryWin ? primaryWin.title : app.name,
                  pinnedApp: app,
                  windows: wins,
                  launchPath: primaryWin?.exePath || app.path,
                });
              }}
              onAuxClick={(e) => {
                if (e.button === 1 && config.func.middleClickNewInstance) launch();
              }}
            />
            {separatorsAfter.includes(app.id) && <div className="dock-divider dock-user-sep" data-reflow-key={`sep-${app.id}`} />}
            </React.Fragment>
          );
        })}

        {extraGroups.length > 0 && <div className="dock-divider" data-reflow-key="extras-divider" />}
        {extraGroups.map(({ key, primaryWin, wins }) => {
          const itemKey = `unpin-${key}`;
          const isSpotify = primaryWin.processName.toLowerCase().includes("spotify");
          const cleanLabel = primaryWin.processName.replace(/\.exe$/i, "");
          return (
            <DockAppItem
              key={key}
              view={{
                itemKey,
                launchPath: primaryWin.exePath,
                name: cleanLabel,
                ariaName: primaryWin.title || "Window",
                closeName: primaryWin.processName,
                wins,
                primaryWin,
                icon: primaryWin.iconDataUrl ? <img src={primaryWin.iconDataUrl} alt={primaryWin.processName} /> : <AppWindow size={19} strokeWidth={1.8} />,
                barLabel: wins.length === 1 ? primaryWin.title : cleanLabel,
                hasHoverCard: true,
                unread: notifBadgeFor(notifCounts, cleanLabel, primaryWin.title),
                urgent: attentionFor(attention, ...wins.map((w) => w.exePath), ...wins.map((w) => w.processName)),
              }}
              dragging={dragKey === itemKey}
              dragOver={dragOverKey === itemKey}
              fileDrop={dropKey === itemKey}
              launching={launchingId === `win-${primaryWin.hwnd}`}
              pulsing={wins.some((w) => pulseHwnds.has(w.hwnd))}
              showLabels={showLabels}
              isBar={isBar}
              onWheel={scrollCycles ? (e) => cycleWindows(itemKey, wins, e.deltaY) : undefined}
              onPointerDown={(e) => beginItemDrag(e, itemKey, false)}
              onHover={(el) => openHoverCardForItem(el, itemKey, cleanLabel, isSpotify, wins, primaryWin.iconDataUrl)}
              onLeave={scheduleHoverClose}
              onCloseAll={() => closeWindows(wins)}
              onActivate={() => {
                if (suppressClickRef.current) return;
                setHoverCard(null);
                triggerLaunchAnim(`win-${primaryWin.hwnd}`);
                invoke("focus_window_cmd", { hwnd: primaryWin.hwnd }).catch(logFail("Dock", "switch to that window"));
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (e.altKey) {
                  openMagicForDockItem(`win-${primaryWin.hwnd}`, primaryWin.title, primaryWin.exePath || null);
                  return;
                }
                const r = e.currentTarget.getBoundingClientRect();
                openMenu({
                  kind: "app",
                  x: r.left + r.width / 2,
                  y: r.top,
                  title: primaryWin.title,
                  windows: wins,
                  launchPath: primaryWin.exePath,
                });
              }}
              onAuxClick={(e) => {
                if (e.button === 1 && config.func.middleClickNewInstance && primaryWin.exePath) {
                  invoke("launch_app_cmd", { path: primaryWin.exePath });
                }
              }}
            />
          );
        })}

        <div className="dock-divider" data-reflow-key="tail-divider" />

        {/* Live Computer Stats & Obsidian Task Manager Graph Icon (left of Settings gear!) */}
        <PluginSlot slot="dock" />

        <div className="dock-item-wrap">
          <span className="dock-tooltip">System Stats &amp; Task Manager</span>
          <button
            type="button"
            aria-label="System and tasks"
            className={`dock-item ${settingsOpen && activeSettingsTab === "monitor" ? "is-running" : ""} ${launchingId === "monitor" ? "is-launching" : ""}`}
            onClick={() => {
              triggerLaunchAnim("monitor");
              if (settingsOpen && activeSettingsTab === "monitor") {
                setSettingsOpen(false);
                invoke("toggle_settings_docked").catch(logFail("Dock", "open Settings"));
              } else {
                setSettingsOpen(true);
                setActiveSettingsTab("monitor");
                invoke("open_dock_popout_tab_cmd", { tab: "monitor" });
              }
            }}
          >
            <Activity size={19} strokeWidth={2.15} color="#34D399" />
          </button>
          {settingsOpen && activeSettingsTab === "monitor" && <span className="dock-indicator focused" />}
        </div>

        {/* Unified Dock-Wide Windows Settings & Lens Control Center Gear (way-right of Dock!) */}
        <div className="dock-item-wrap">
          <span className="dock-tooltip">Settings &amp; Control Center</span>
          <button
            type="button"
            aria-label="Settings"
            className={`dock-item ${settingsOpen && activeSettingsTab !== "monitor" ? "is-running" : ""} ${launchingId === "settings" ? "is-launching" : ""}`}
            onClick={() => {
              triggerLaunchAnim("settings");
              if (settingsOpen && activeSettingsTab !== "monitor") {
                setSettingsOpen(false);
                invoke("toggle_settings_docked").catch(logFail("Dock", "open Settings"));
              } else {
                setSettingsOpen(true);
                // The gear always opens on Quick settings, never on the page used last.
                setActiveSettingsTab("quick");
                invoke("open_dock_popout_tab_cmd", { tab: "quick" });
              }
            }}
          >
            <Settings size={19} strokeWidth={2.15} />
          </button>
          {settingsOpen && activeSettingsTab !== "monitor" && <span className="dock-indicator" />}
        </div>
        {systemInDock && !isBar && dockStyle !== "split" && (
          <>
            <div className="dock-divider" data-reflow-key="sys-divider" />
            <DockSystemArea
              trayHost={config.func.trayHost ?? false}
              unread={unreadTotal}
              vertical={isVertical}
              variant="inline"
              clock={dockStyle === "unified" ? "stacked" : "default"}
              reflowKey="sys"
            />
          </>
        )}
        </div>
        {musicMini === "dock" && (
          <MiniPlayer variant="dock" onOpen={() => invoke("open_surface", { label: "nowplaying" }).catch(logFail("Dock", "open Now Playing"))} />
        )}
        {voiceDock.enabled && (
          <>
            <VoiceDockView
              style={(dockStyle === "islands" || dockStyle === "unified" ? "floating" : dockStyle) as VoiceDockStyle}
              edge={edge as VoiceEdge}
              width={lockedDockWidth ?? pillRef.current?.getBoundingClientRect().width ?? 480}
              height={pillRef.current?.getBoundingClientRect().height ?? 56}
              morph={voiceDock.morph}
              levels={voiceDock.levels}
              reducedMotion={prefersReducedMotion()}
              onUndo={voiceDock.undo}
              onAnswer={voiceDock.answer}
            />
            <DockMicButton size={36} live={voiceDock.live} />
          </>
        )}
        {isBar && systemInDock && (
          <DockSystemArea
            trayHost={config.func.trayHost ?? false}
            unread={unreadTotal}
            vertical={isVertical}
            variant="bar"
          />
        )}
      </nav>
      {dockStyle === "split" && systemInDock && (
        <div
          ref={splitPillRef}
          className={`dock-split-pill ${!dockVisible ? "is-hidden" : ""}`}
          aria-label="System"
        >
          <DockSystemArea
            trayHost={config.func.trayHost ?? false}
            unread={unreadTotal}
            vertical={isVertical}
            variant="pill"
          />
        </div>
      )}
    </div>
  );
};
