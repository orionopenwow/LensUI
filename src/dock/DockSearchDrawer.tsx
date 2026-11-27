// The panel above the Dock while searching: filter pills, then either the home grid (recent files
// and windows, quick folders, installed apps) or the results list. The Dock owns the query, the
// selection and opening things; this file draws them.
import React from "react";
import { Activity, AppWindow, FileText, Folder, Sparkles } from "lucide-react";
import { FlyoutClose } from "../ui/FlyoutClose";
import type { InstalledApp } from "../types/lens";
import { DockMatteFolderSvg } from "./DockIcons";
import type { DockFilterTab, LauncherHomeData } from "./model";
import type { DockHomeRow, DockResultRow } from "./searchItems";
import "./DockSearchDrawer.css";

export interface DockSearchDrawerProps {
  closing: boolean;
  onClose: () => void;
  homeData: LauncherHomeData;
  installedApps: InstalledApp[];
  runningCount: number;
  filterTab: DockFilterTab;
  /** A filter pill was pressed: switch, reset the selection, keep typing. */
  pickFilterTab: (tab: DockFilterTab) => void;
  /** A card's "all" link: switch only. */
  setFilterTab: (tab: DockFilterTab) => void;
  showHomeGrid: boolean;
  recentAndRunning: DockHomeRow[];
  results: DockResultRow[];
  selectedIdx: number;
  setSelectedIdx: (i: number) => void;
  openFolder: (path: string) => void;
  openApp: (app: InstalledApp) => void;
}

export function DockSearchDrawer({
  closing: dockSearchClosing,
  onClose: closeInDockLauncher,
  homeData,
  installedApps,
  runningCount,
  filterTab: dockFilterTab,
  pickFilterTab,
  setFilterTab: setDockFilterTab,
  showHomeGrid,
  recentAndRunning,
  results: filteredResults,
  selectedIdx: dockSelectedIdx,
  setSelectedIdx: setDockSelectedIdx,
  openFolder,
  openApp,
}: DockSearchDrawerProps) {
  return (
          <div className={`dock-launcher-drawer ${dockSearchClosing ? "is-closing" : ""}`}>
            <FlyoutClose pinned label="Close Search" onClose={closeInDockLauncher} />
            <div className="pal-filter-bar dsd-filters">
              {(
                [
                  { id: "all", label: "Overview", count: null, color: "#38BDF8", icon: Sparkles },
                  { id: "files", label: "Files", count: homeData.recentFiles.length, color: "#60A5FA", icon: FileText },
                  { id: "folders", label: "Folders", count: homeData.folders.length, color: "#FBBF24", icon: Folder },
                  { id: "apps", label: "Apps", count: installedApps.length, color: "#A78BFA", icon: AppWindow },
                  { id: "recent", label: "Running", count: runningCount, color: "#34D399", icon: Activity },
                ] as const
              ).map((f) => {
                const isActive = dockFilterTab === f.id;
                const IconComp = f.icon;
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`pal-filter-pill ${isActive ? "active" : ""}`}
                    onClick={() => pickFilterTab(f.id)}
                  >
                    <IconComp
                      size={13.5}
                      strokeWidth={2.4}
                      color={isActive ? "var(--lens-on-fg, #09090b)" : f.color}
                      className="dsd-fixed"
                    />
                    <span>{f.label}</span>
                    {f.count !== null && (
                      <span className="pal-filter-count">{f.count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {showHomeGrid ? (
              <div className="pal-two-col dsd-home">
                {/* Left Card: Recent Files & Active Windows */}
                <div className="dock-launcher-card">
                  <div className="dock-launcher-card-head">
                    <span className="dock-launcher-card-title">
                      <FileText size={15} strokeWidth={2.4} color="#60A5FA" className="dsd-fixed" />
                      <span>Recent Files &amp; Active Windows</span>
                    </span>
                    <button
                      type="button"
                      className="dock-launcher-card-link"
                      onClick={() => setDockFilterTab("files")}
                    >
                      All Files →
                    </button>
                  </div>
                  <div className="pal-recent-list dsd-recent-list">
                    {recentAndRunning.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`pal-recent-row dsd-recent-row ${idx === 0 ? "first" : ""}`}
                        onClick={item.run}
                      >
                        <span className="pal-recent-icon dsd-icon">
                          {item.iconUrl ? (
                            <img src={item.iconUrl} alt="" className="dsd-icon-img" />
                          ) : item.isDir ? (
                            <Folder size={19} color="#FBBF24" />
                          ) : (
                            <FileText size={19} color="#60A5FA" />
                          )}
                        </span>
                        <div className="dsd-text">
                          <div className="pal-recent-name dsd-recent-title">
                            {item.title}
                          </div>
                          <div className="dsd-sub">
                            {item.sub}
                          </div>
                        </div>
                        <span className={`pal-recent-age dsd-age ${item.badge === "Active" ? "is-active" : item.badge === "Open" ? "is-open" : ""}`}>
                          {item.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right Column: Quick Folders Card + Spacious Single-Column Installed Apps Card */}
                <div className="dsd-col">
                  <div className="dock-launcher-card">
                    <div className="dock-launcher-card-head">
                      <span className="dock-launcher-card-title">
                        <Folder size={15} strokeWidth={2.4} color="#FBBF24" className="dsd-fixed" />
                        <span>Quick Folders</span>
                      </span>
                      <button
                        type="button"
                        className="dock-launcher-card-link"
                        onClick={() => setDockFilterTab("folders")}
                      >
                        Folders →
                      </button>
                    </div>
                    <div className="pal-folder-grid dsd-folder-grid">
                      {homeData.folders.map((folder) => (
                        <button
                          key={folder.path}
                          type="button"
                          className="pal-folder-card dsd-folder-card"
                          onClick={() => openFolder(folder.path)}
                        >
                          <DockMatteFolderSvg color={folder.color} />
                          <span className="pal-folder-label dsd-folder-label">
                            {folder.name}
                          </span>
                          <span className="dsd-folder-count">
                            {folder.itemCount ?? 0} items
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Installed Apps Card: Spacious single-column list so no app name or header ever clips */}
                  <div className="dock-launcher-card dsd-grow">
                    <div className="dock-launcher-card-head">
                      <span className="dock-launcher-card-title">
                        <AppWindow size={15} strokeWidth={2.4} color="#A78BFA" className="dsd-fixed" />
                        <span>Installed Apps</span>
                      </span>
                      <button
                        type="button"
                        className="dock-launcher-card-link"
                        onClick={() => setDockFilterTab("apps")}
                      >
                        All ({installedApps.length}) →
                      </button>
                    </div>
                    <div className="pal-recent-list dsd-app-list">
                      {installedApps.slice(0, 7).map((app) => (
                        <button
                          key={app.path}
                          type="button"
                          className="pal-recent-row dsd-app-row"
                          onClick={() => openApp(app)}
                        >
                          <AppWindow size={16} strokeWidth={2.2} color="#A78BFA" className="dsd-fixed" />
                          <span className="pal-recent-name dsd-app-name">
                            {app.name}
                          </span>
                          <span className="dsd-app-open">
                            Open
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="dock-launcher-card dsd-results-card">
                <div className="pal-results dsd-results">
                  {filteredResults.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`pal-result-row dsd-result-row ${idx === dockSelectedIdx ? "selected" : ""}`}
                      onMouseEnter={() => setDockSelectedIdx(idx)}
                      onClick={item.run}
                    >
                      <div className="dsd-result-main">
                        <span className="pal-recent-icon dsd-icon">
                          {item.iconUrl ? (
                            <img src={item.iconUrl} alt="" className="dsd-icon-img" />
                          ) : item.kind === "folders" ? (
                            <Folder size={19} color="#FBBF24" />
                          ) : item.kind === "files" ? (
                            <FileText size={19} color="#60A5FA" />
                          ) : (
                            <AppWindow size={19} color="#A78BFA" />
                          )}
                        </span>
                        <div className="dsd-text">
                          <div className="dsd-result-title">
                            {item.title}
                          </div>
                          <div className="dsd-sub">
                            {item.subtitle}
                          </div>
                        </div>
                        <span className="dsd-result-badge">
                          {item.badge}
                        </span>
                      </div>
                    </button>
                  ))}
                  {filteredResults.length === 0 && (
                    <div className="dsd-empty">
                      No matching apps, files, or folders.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
  );
}
