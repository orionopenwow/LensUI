// The Dock's right-click menu: an app's menu (windows, window controls, pin, Lens ›), a pinned
// folder's, and the Dock's own (pop-outs, size, edge, previews, lock). Split out of
// DockSurface.tsx (docs/features/dock.md, quick win 5); the Dock owns the open state and where the
// menu goes, this file owns the rows.
import React from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AppWindow,
  ArrowUpToLine,
  ExternalLink,
  FolderOpen,
  Lock,
  Minus,
  Monitor,
  Palette,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
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
import { logFail } from "../failsafe/calls";
import type { LensConfig, RunningWindow } from "../types/lens";
import { DockLensPan, DockLensRow } from "./LensMenuHost";
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
  closeMenu: () => void;
  updateDockExtras: (patch: DockExtras) => void;
  unpinApp: (id: string) => void;
  pinWindow: (win: RunningWindow) => void;
  removeFolder: (id: string) => void;
  /** Opens docked Settings on a page ("quick", "theme", "dock"). */
  openPopoutTab: (tab: string) => void;
  openSearch: () => void;
}

/** Up/Down/Home/End move between menu rows, like a native context menu. */
const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(".dock-ctx-item:not(:disabled)"));
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

export function DockContextMenu({
  menu: shownMenu,
  menuRef,
  leaving,
  edge,
  style,
  config,
  updateConfig,
  locked,
  separatorsAfter,
  livePreviews,
  closeMenu,
  updateDockExtras,
  unpinApp,
  pinWindow,
  removeFolder,
  openPopoutTab,
  openSearch,
}: DockContextMenuProps) {
  return (
        <>
          {!leaving && <div className="dock-ctx-backdrop" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />}
          <div
            ref={menuRef}
            inert={leaving}
            className={`dock-ctx-menu dock-ctx-edge-${edge}`}
            onKeyDown={onMenuKeyDown}
            style={style}
          >
            {shownMenu.kind === "app" && (
              <DockLensPan
                id={shownMenu.pinnedApp?.id ?? (shownMenu.windows[0] ? `win-${shownMenu.windows[0].hwnd}` : shownMenu.launchPath)}
                label={shownMenu.pinnedApp?.name ?? shownMenu.title}
                path={shownMenu.launchPath || null}
                onClose={closeMenu}
              >
                {shownMenu.windows.length > 0 ? (
                  <>
                    {shownMenu.windows.slice(0, 3).map((w) => (
                      <button
                        key={w.hwnd}
                        type="button"
                        className="dock-ctx-item"
                        onClick={() => {
                          invoke("focus_window_cmd", { hwnd: w.hwnd }).catch(logFail("Dock", "switch to that window"));
                          closeMenu();
                        }}
                      >
                        <AppWindow size={14} strokeWidth={2.4} color={w.isFocused ? "#38BDF8" : "#A1A1AA"} className="dcm-fixed" />
                        <span className="dcm-title">
                          {w.title || w.processName.replace(/\.exe$/i, "")}
                        </span>
                      </button>
                    ))}

                    {/* Compact 3-Button Window Control Pill Bar: Minimize · Maximize · Top */}
                    <div className="dcm-grid dcm-grid-3">
                      <button
                        type="button"
                        className="dock-ctx-item dcm-cell"
                        onClick={() => {
                          invoke("window_action_cmd", { hwnd: shownMenu.windows[0].hwnd, action: "minimize" });
                          closeMenu();
                        }}
                      >
                        <Minus size={13} strokeWidth={2.6} />
                        <span>Min</span>
                      </button>
                      <button
                        type="button"
                        className="dock-ctx-item dcm-cell"
                        onClick={() => {
                          invoke("window_action_cmd", { hwnd: shownMenu.windows[0].hwnd, action: "maximize" });
                          closeMenu();
                        }}
                      >
                        <Square size={11.5} strokeWidth={2.6} />
                        <span>Max</span>
                      </button>
                      <button
                        type="button"
                        className="dock-ctx-item dcm-cell"
                        onClick={() => {
                          // Tracked pin: Lens unpins it again on quit (docs/WINDOW_STYLING.md §2).
                          const hwnd = shownMenu.windows[0].hwnd;
                          invoke<{ hwnd: number }[]>("list_pinned_windows_cmd")
                            .then((list) => invoke("set_window_pinned_cmd", { hwnd, pinned: !list.some((p) => p.hwnd === hwnd) }))
                            .catch(logFail("Dock", "keep the window on top"));
                          closeMenu();
                        }}
                      >
                        <ArrowUpToLine size={13} strokeWidth={2.5} />
                        <span>Top</span>
                      </button>
                    </div>

                    <div className="dock-ctx-sep" />

                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        invoke("launch_app_cmd", { path: shownMenu.launchPath });
                        closeMenu();
                      }}
                    >
                      <PlusSquare size={14} strokeWidth={2.4} className="dcm-fixed" />
                      <span>New Window</span>
                    </button>
                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        invoke("launch_app_advanced_cmd", { path: shownMenu.launchPath, mode: "admin" });
                        closeMenu();
                      }}
                    >
                      <Shield size={14} strokeWidth={2.4} className="dcm-fixed" />
                      <span>Run as Admin</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        invoke("launch_app_cmd", { path: shownMenu.launchPath });
                        closeMenu();
                      }}
                    >
                      <ExternalLink size={14} strokeWidth={2.4} className="dcm-fixed" />
                      <span>Open</span>
                    </button>
                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        invoke("launch_app_advanced_cmd", { path: shownMenu.launchPath, mode: "admin" });
                        closeMenu();
                      }}
                    >
                      <Shield size={14} strokeWidth={2.4} className="dcm-fixed" />
                      <span>Run as Admin</span>
                    </button>
                  </>
                )}

                <DockLensRow />

                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    invoke("launch_app_advanced_cmd", { path: shownMenu.launchPath, mode: "reveal" });
                    closeMenu();
                  }}
                >
                  <FolderOpen size={14} strokeWidth={2.4} className="dcm-fixed" />
                  <span>File Location</span>
                </button>

                {shownMenu.pinnedApp && !locked && (
                  <button
                    type="button"
                    className="dock-ctx-item"
                    onClick={() => {
                      const id = shownMenu.pinnedApp!.id;
                      updateDockExtras({
                        separatorsAfter: separatorsAfter.includes(id)
                          ? separatorsAfter.filter((x) => x !== id)
                          : [...separatorsAfter, id],
                      });
                      closeMenu();
                    }}
                  >
                    <SeparatorVertical size={14} strokeWidth={2.4} className="dcm-fixed" />
                    <span>{separatorsAfter.includes(shownMenu.pinnedApp.id) ? "Remove Separator" : "Add Separator After"}</span>
                  </button>
                )}

                {shownMenu.pinnedApp ? (
                  !locked && (
                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        unpinApp(shownMenu.pinnedApp!.id);
                        closeMenu();
                      }}
                    >
                      <PinOff size={14} strokeWidth={2.4} className="dcm-fixed" />
                      <span>Unpin</span>
                    </button>
                  )
                ) : (
                  shownMenu.windows[0] && (
                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        pinWindow(shownMenu.windows[0]);
                        closeMenu();
                      }}
                    >
                      <Pin size={14} strokeWidth={2.4} className="dcm-fixed" />
                      <span>Pin to Dock</span>
                    </button>
                  )
                )}

                {shownMenu.windows.length > 0 && (
                  <>
                    <div className="dock-ctx-sep" />
                    <button
                      type="button"
                      className="dock-ctx-item danger"
                      onClick={() => {
                        shownMenu.windows.forEach((w) =>
                          invoke("window_action_cmd", { hwnd: w.hwnd, action: "close" })
                        );
                        closeMenu();
                      }}
                    >
                      <X size={14} strokeWidth={2.6} className="dcm-fixed" />
                      <span>Close {shownMenu.windows.length > 1 ? `All (${shownMenu.windows.length})` : "Window"}</span>
                    </button>
                  </>
                )}
              </DockLensPan>
            )}

            {shownMenu.kind === "folder" && (
              <>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    invoke("launch_app_cmd", { path: shownMenu.folder.path });
                    closeMenu();
                  }}
                >
                  <ExternalLink size={14} strokeWidth={2.4} />
                  <span>Open Folder</span>
                </button>
                {!locked && (
                  <button
                    type="button"
                    className="dock-ctx-item danger"
                    onClick={() => {
                      removeFolder(shownMenu.folder.id);
                      closeMenu();
                    }}
                  >
                    <Trash2 size={14} strokeWidth={2.4} />
                    <span>Remove</span>
                  </button>
                )}
              </>
            )}

            {shownMenu.kind === "dock" && (
              <>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    openPopoutTab("quick");
                    closeMenu();
                  }}
                >
                  <Monitor size={14} strokeWidth={2.4} color="#38BDF8" />
                  <span>Quick Controls</span>
                </button>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    openPopoutTab("theme");
                    closeMenu();
                  }}
                >
                  <Palette size={14} strokeWidth={2.4} color="#A78BFA" />
                  <span>Theme &amp; Look</span>
                </button>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    openPopoutTab("dock");
                    closeMenu();
                  }}
                >
                  <PanelBottom size={14} strokeWidth={2.4} color="#60A5FA" />
                  <span>Dock &amp; Top Bar</span>
                </button>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    closeMenu();
                    openSearch();
                  }}
                >
                  <Search size={14} strokeWidth={2.4} color="#34D399" />
                  <span>Search</span>
                </button>

                <div className="dock-ctx-sep" />

                <div className="dcm-grid dcm-grid-4">
                  {[34, 40, 46, 52].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`dock-ctx-item dcm-cell dcm-size ${config.dock.iconSize === val ? "is-on" : ""}`}
                      onClick={() => {
                        updateConfig({ ...config, dock: { ...config.dock, iconSize: val } });
                      }}
                    >
                      {val}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    updateConfig({
                      ...config,
                      func: { ...config.func, hideNativeTaskbar: !config.func.hideNativeTaskbar },
                    });
                    closeMenu();
                  }}
                >
                  <PanelBottom size={14} strokeWidth={2.4} />
                  <span>{config.func.hideNativeTaskbar ? "Show Taskbar" : "Hide Taskbar"}</span>
                </button>

                <div className="dock-ctx-sep" />
                <div className="dock-ctx-label">Dock Position</div>
                <div className="dock-ctx-edge-row">
                  {(
                    [
                      { id: "left", label: "Left", Icon: PanelLeft },
                      { id: "bottom", label: "Bottom", Icon: PanelBottom },
                      { id: "top", label: "Top", Icon: PanelTop },
                      { id: "right", label: "Right", Icon: PanelRight },
                    ] as { id: DockEdge; label: string; Icon: typeof PanelLeft }[]
                  ).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      className={`dock-ctx-edge-btn ${edge === id ? "active" : ""}`}
                      aria-label={`Dock on ${label.toLowerCase()} edge`}
                      onClick={() => {
                        updateDockExtras({ position: id });
                        closeMenu();
                      }}
                    >
                      <Icon size={14} strokeWidth={2.3} />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    updateDockExtras({ livePreviews: !livePreviews });
                    closeMenu();
                  }}
                >
                  <AppWindow size={14} strokeWidth={2.4} />
                  <span>{livePreviews ? "Hide Window Previews" : "Show Window Previews"}</span>
                </button>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    updateDockExtras({ locked: !locked });
                    closeMenu();
                  }}
                >
                  {locked ? <Unlock size={14} strokeWidth={2.4} /> : <Lock size={14} strokeWidth={2.4} />}
                  <span>{locked ? "Unlock Dock Items" : "Lock Dock Items"}</span>
                </button>
              </>
            )}
          </div>
        </>
  );
}
