// The Dock's right-click menu: an app's menu (windows, window controls, pin, Lens ›), a pinned
// folder's, and the Dock's own (pop-outs, size, edge, previews, lock). Split out of
// DockSurface.tsx (docs/features/dock.md, quick win 5); the Dock owns the open state and where the
// menu goes, this file owns the rows. Every row is a menu item with a press weight (DESIGN §5.2),
// and anything that fails says so in the Dock's notice (src/dock/act.ts).
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AppWindow,
  ArrowUpToLine,
  ExternalLink,
  FolderOpen,
  Images,
  Lock,
  Minus,
  Monitor,
  Palette,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  PaintbrushVertical,
  Pin,
  PinOff,
  PlusSquare,
  Search,
  SeparatorVertical,
  Shield,
  Square,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import type { LensConfig, RunningWindow } from "../types/lens";
import type { WindowRule } from "../types/generated";
import { appLabel, dockDo, dockFail } from "./act";
import { MENU_ICON_SIZES } from "./advanced";
import { DockLensPan, DockLensRow } from "./LensMenuHost";
import { styleRow, withLeftAlone } from "./styleMenu";
import { toast } from "../ui/toastBus";
import type { DockContextMenu as DockMenu, DockEdge, DockExtras } from "./model";
import "./DockContextMenu.css";

export interface DockContextMenuProps {
  menu: DockMenu;
  menuRef: React.Ref<HTMLDivElement>;
  /** Gliding out: no backdrop, nothing focusable. */
  leaving: boolean;
  edge: DockEdge;
  /** Where the menu goes (`left` / `top`). */
  style: React.CSSProperties;
  config: LensConfig;
  updateConfig: (next: LensConfig) => void;
  locked: boolean;
  separatorsAfter: string[];
  livePreviews: boolean;
  /** The icon size in force, and what picking another one does. */
  iconSize: number;
  pickIconSize: (size: number) => void;
  closeMenu: () => void;
  updateDockExtras: (patch: DockExtras) => void;
  unpinApp: (id: string) => void;
  pinWindow: (win: RunningWindow) => void;
  removeFolder: (id: string) => void;
  /** Opens docked Settings on a page ("quick", "theme", "dock"). */
  openPopoutTab: (tab: string) => void;
  openSearch: () => void;
}

const ROWS = ".dock-ctx-item:not(:disabled), .dock-ctx-edge-btn";

/** Up/Down/Home/End move between menu rows, like a native context menu. */
const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(ROWS));
  if (!items.length) return;
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  let next = -1;
  if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % items.length;
  else if (e.key === "ArrowUp") next = i < 0 ? items.length - 1 : (i - 1 + items.length) % items.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = items.length - 1;
  if (next >= 0) {
    e.preventDefault();
    items[next].focus({ preventScroll: true });
  }
};

/** One row: icon, label, a light press (heavy for the one that closes things). */
function Row({ icon, label, onClick, danger, weight = "light" }: { icon: React.ReactNode; label: React.ReactNode; onClick: () => void; danger?: boolean; weight?: "light" | "heavy" }) {
  return (
    <button type="button" role="menuitem" data-weight={weight} className={`dock-ctx-item ${danger ? "danger" : ""}`} onClick={onClick}>
      {icon}
      <span className="dcm-title">{label}</span>
    </button>
  );
}

/** For an app's menu: its window rules and whether it is protected, once Lens Core answers. */
function useStyleRowData(process: string | undefined, exePath: string | undefined) {
  const [rules, setRules] = useState<WindowRule[] | null>(null);
  const [isProtected, setProtected] = useState<boolean | null>(null);
  useEffect(() => {
    setRules(null);
    setProtected(null);
    if (!process) return;
    let live = true;
    // Background reads: if either fails the row simply doesn't show.
    invoke<WindowRule[]>("get_window_rules_cmd")
      .then((r) => live && setRules(Array.isArray(r) ? r : []))
      .catch(() => live && setRules(null));
    invoke<boolean[]>("protected_processes_cmd", { processes: [exePath || process] })
      .then((f) => live && setProtected(Array.isArray(f) ? !!f[0] : null))
      .catch(() => live && setProtected(null));
    return () => {
      live = false;
    };
  }, [process, exePath]);
  return { rules, isProtected };
}

/** "Don't style this app" / "Style this app again": writes the per-app rule, with Undo on the toast. */
function setLeftAlone(rules: WindowRule[], process: string, alone: boolean, name: string) {
  invoke("set_window_rules_cmd", { rules: withLeftAlone(rules, process, alone) })
    .then(() =>
      toast(alone ? `Lens leaves ${name} as Windows draws it.` : `Lens styles ${name} again.`, {
        action: { label: "Undo", onClick: () => void invoke("set_window_rules_cmd", { rules }).catch(dockFail("undo that")) },
      }),
    )
    .catch(dockFail(alone ? `stop styling ${name}` : `style ${name} again`));
}

const EDGES: { id: DockEdge; label: string; Icon: typeof PanelLeft }[] = [
  { id: "left", label: "left", Icon: PanelLeft },
  { id: "bottom", label: "bottom", Icon: PanelBottom },
  { id: "top", label: "top", Icon: PanelTop },
  { id: "right", label: "right", Icon: PanelRight },
];

export function DockContextMenu({
  menu,
  menuRef,
  leaving,
  edge,
  style,
  config,
  updateConfig,
  locked,
  separatorsAfter,
  livePreviews,
  iconSize,
  pickIconSize,
  closeMenu,
  updateDockExtras,
  unpinApp,
  pinWindow,
  removeFolder,
  openPopoutTab,
  openSearch,
}: DockContextMenuProps) {
  /** Do it, then close the menu. */
  const then = (fn: () => void) => () => {
    fn();
    closeMenu();
  };
  const name = menu.kind === "app" ? appLabel(menu.pinnedApp?.name ?? menu.launchPath) : "";
  const front = menu.kind === "app" ? menu.windows[0] : undefined;
  const styleData = useStyleRowData(front?.processName, front?.exePath);
  const styleChoice = front ? styleRow(config, front.processName, styleData.rules, styleData.isProtected) : null;
  const label = menu.kind === "app" ? `${menu.pinnedApp?.name ?? menu.title} menu` : menu.kind === "folder" ? `${menu.folder.name} menu` : "Dock menu";
  return (
    <>
      {!leaving && <div className="dock-ctx-backdrop" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />}
      <div ref={menuRef} inert={leaving} role="menu" aria-label={label} className={`dock-ctx-menu dock-ctx-edge-${edge}`} onKeyDown={onMenuKeyDown} style={style}>
        {menu.kind === "app" && (
          <DockLensPan
            id={menu.pinnedApp?.id ?? (menu.windows[0] ? `win-${menu.windows[0].hwnd}` : menu.launchPath)}
            label={menu.pinnedApp?.name ?? menu.title}
            path={menu.launchPath || null}
            onClose={closeMenu}
          >
            {menu.windows.length > 0 ? (
              <>
                {menu.windows.slice(0, 3).map((w) => (
                  <Row
                    key={w.hwnd}
                    icon={<AppWindow size={14} strokeWidth={2.4} className={`dcm-fixed dcm-win ${w.isFocused ? "is-focused" : ""}`} />}
                    label={w.title || w.processName.replace(/\.exe$/i, "")}
                    onClick={then(() => void dockDo("focus_window_cmd", { hwnd: w.hwnd }, "switch to that window"))}
                  />
                ))}

                {/* Window controls for the app's front window: minimise, maximise, keep on top. */}
                <div className="dcm-grid dcm-grid-3" role="group" aria-label="Window">
                  <button
                    type="button"
                    role="menuitem"
                    data-weight="medium"
                    aria-label="Minimise window"
                    className="dock-ctx-item dcm-cell"
                    onClick={then(() => void dockDo("window_action_cmd", { hwnd: menu.windows[0].hwnd, action: "minimize" }, "minimise the window"))}
                  >
                    <Minus size={13} strokeWidth={2.6} />
                    <span>Min</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-weight="medium"
                    aria-label="Maximise window"
                    className="dock-ctx-item dcm-cell"
                    onClick={then(() => void dockDo("window_action_cmd", { hwnd: menu.windows[0].hwnd, action: "maximize" }, "maximise the window"))}
                  >
                    <Square size={11.5} strokeWidth={2.6} />
                    <span>Max</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-weight="medium"
                    aria-label="Keep window on top"
                    className="dock-ctx-item dcm-cell"
                    onClick={then(() => {
                      // Tracked pin: Lens unpins it again on quit (docs/WINDOW_STYLING.md §2).
                      const hwnd = menu.windows[0].hwnd;
                      invoke<{ hwnd: number }[]>("list_pinned_windows_cmd")
                        .then((list) => invoke("set_window_pinned_cmd", { hwnd, pinned: !list.some((p) => p.hwnd === hwnd) }))
                        .catch(dockFail("keep the window on top"));
                    })}
                  >
                    <ArrowUpToLine size={13} strokeWidth={2.5} />
                    <span>Top</span>
                  </button>
                </div>

                <div className="dock-ctx-sep" role="separator" />

                <Row
                  icon={<PlusSquare size={14} strokeWidth={2.4} className="dcm-fixed" />}
                  label="New window"
                  onClick={then(() => void dockDo("launch_app_cmd", { path: menu.launchPath }, `open ${name}`))}
                />
              </>
            ) : (
              <Row
                icon={<ExternalLink size={14} strokeWidth={2.4} className="dcm-fixed" />}
                label="Open"
                onClick={then(() => void dockDo("launch_app_cmd", { path: menu.launchPath }, `open ${name}`))}
              />
            )}
            <Row
              icon={<Shield size={14} strokeWidth={2.4} className="dcm-fixed" />}
              label="Run as administrator"
              onClick={then(() => void dockDo("launch_app_advanced_cmd", { path: menu.launchPath, mode: "admin" }, `open ${name} as administrator`))}
            />

            <DockLensRow />

            <Row
              icon={<FolderOpen size={14} strokeWidth={2.4} className="dcm-fixed" />}
              label="Open file location"
              onClick={then(() => void dockDo("launch_app_advanced_cmd", { path: menu.launchPath, mode: "reveal" }, `show where ${name} is`))}
            />

            {styleChoice && front && styleData.rules && (
              <Row
                icon={<PaintbrushVertical size={14} strokeWidth={2.4} className="dcm-fixed" />}
                label={styleChoice.label}
                onClick={then(() => setLeftAlone(styleData.rules!, front.processName, styleChoice.alone, name))}
              />
            )}

            {menu.pinnedApp && !locked && (
              <Row
                icon={<SeparatorVertical size={14} strokeWidth={2.4} className="dcm-fixed" />}
                label={separatorsAfter.includes(menu.pinnedApp.id) ? "Remove divider" : "Add divider after"}
                onClick={then(() => {
                  const id = menu.pinnedApp!.id;
                  updateDockExtras({
                    separatorsAfter: separatorsAfter.includes(id) ? separatorsAfter.filter((x) => x !== id) : [...separatorsAfter, id],
                  });
                })}
              />
            )}

            {menu.pinnedApp
              ? !locked && <Row icon={<PinOff size={14} strokeWidth={2.4} className="dcm-fixed" />} label="Unpin from Dock" onClick={then(() => unpinApp(menu.pinnedApp!.id))} />
              : menu.windows[0] && <Row icon={<Pin size={14} strokeWidth={2.4} className="dcm-fixed" />} label="Pin to Dock" onClick={then(() => pinWindow(menu.windows[0]))} />}

            {menu.windows.length > 0 && (
              <>
                <div className="dock-ctx-sep" role="separator" />
                <Row
                  danger
                  weight="heavy"
                  icon={<X size={14} strokeWidth={2.6} className="dcm-fixed" />}
                  label={menu.windows.length > 1 ? `Close all ${menu.windows.length} windows` : "Close window"}
                  onClick={then(() => menu.windows.forEach((w) => void dockDo("window_action_cmd", { hwnd: w.hwnd, action: "close" }, "close the window")))}
                />
              </>
            )}
          </DockLensPan>
        )}

        {menu.kind === "folder" && (
          <>
            <Row
              icon={<ExternalLink size={14} strokeWidth={2.4} />}
              label="Open folder"
              onClick={then(() => void dockDo("launch_app_cmd", { path: menu.folder.path }, `open ${menu.folder.name}`))}
            />
            {!locked && <Row danger icon={<Trash2 size={14} strokeWidth={2.4} />} label="Remove from Dock" onClick={then(() => removeFolder(menu.folder.id))} />}
          </>
        )}

        {menu.kind === "dock" && (
          <>
            <Row icon={<Monitor size={14} strokeWidth={2.4} />} label="Quick settings" onClick={then(() => openPopoutTab("quick"))} />
            <Row icon={<Palette size={14} strokeWidth={2.4} />} label="Theme and look" onClick={then(() => openPopoutTab("theme"))} />
            <Row icon={<PanelBottom size={14} strokeWidth={2.4} />} label="Dock and Top Bar" onClick={then(() => openPopoutTab("dock"))} />
            <Row icon={<Search size={14} strokeWidth={2.4} />} label="Search" onClick={then(openSearch)} />
            <Row
              icon={<Images size={14} strokeWidth={2.4} />}
              label="Next wallpaper"
              onClick={then(() => void dockDo("wallpapers_step_cmd", { direction: "next", hour: new Date().getHours() }, "change the wallpaper"))}
            />

            <div className="dock-ctx-sep" role="separator" />

            <div className="dock-ctx-label" id="dcm-size-label">Icon size</div>
            <div className="dcm-grid dcm-grid-4" role="group" aria-labelledby="dcm-size-label">
              {MENU_ICON_SIZES.map((val) => (
                <button
                  key={val}
                  type="button"
                  role="menuitemradio"
                  aria-checked={iconSize === val}
                  aria-label={`${val} pixels`}
                  data-weight="medium"
                  className={`dock-ctx-item dcm-cell dcm-size ${iconSize === val ? "is-on" : ""}`}
                  onClick={() => pickIconSize(val)}
                >
                  {val}
                </button>
              ))}
            </div>

            <Row
              icon={<PanelBottom size={14} strokeWidth={2.4} />}
              label={config.func.hideNativeTaskbar ? "Show Windows taskbar" : "Hide Windows taskbar"}
              onClick={then(() => updateConfig({ ...config, func: { ...config.func, hideNativeTaskbar: !config.func.hideNativeTaskbar } }))}
            />

            <div className="dock-ctx-sep" role="separator" />
            <div className="dock-ctx-label" id="dcm-edge-label">Dock position</div>
            <div className="dock-ctx-edge-row" role="group" aria-labelledby="dcm-edge-label">
              {EDGES.map(({ id, label: edgeName, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={edge === id}
                  data-weight="medium"
                  className={`dock-ctx-edge-btn ${edge === id ? "active" : ""}`}
                  aria-label={`Dock on the ${edgeName} edge`}
                  onClick={then(() => updateDockExtras({ position: id }))}
                >
                  <Icon size={14} strokeWidth={2.3} />
                </button>
              ))}
            </div>
            <Row
              icon={<AppWindow size={14} strokeWidth={2.4} />}
              label={livePreviews ? "Hide window previews" : "Show window previews"}
              onClick={then(() => updateDockExtras({ livePreviews: !livePreviews }))}
            />
            <Row
              icon={locked ? <Unlock size={14} strokeWidth={2.4} /> : <Lock size={14} strokeWidth={2.4} />}
              label={locked ? "Unlock the Dock" : "Lock the Dock"}
              onClick={then(() => updateDockExtras({ locked: !locked }))}
            />
          </>
        )}
      </div>
    </>
  );
}
