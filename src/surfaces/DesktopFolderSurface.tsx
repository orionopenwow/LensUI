import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FlyoutClose } from "../ui/FlyoutClose";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Folder,
  FileText,
  FileCode2,
  Image as ImageIcon,
  AppWindow,
  Search,
  Eye,
  EyeOff,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  LayoutGrid,
  List as ListIcon,
  Plus,
  ChevronsDownUp,
} from "lucide-react";
import { useLensState } from "../hooks/useLensState";
import "./DesktopFolderSurface.css";
import { glideIn, glideOut } from "../ui/motion";
import type { LensConfig } from "../types/lens";
import {
  arrangeDesktop,
  newGroupId,
  placeItem,
  readDesktopGroups,
  setAllCollapsed,
  setCollapsed,
  UNSORTED_ID,
  type DesktopGroupsConfig,
} from "../utils/desktopGroups";

interface DesktopItem {
  name: string;
  path: string;
  isDir: boolean;
  ext: string;
  isShortcut: boolean;
}

function ItemIcon({ item }: { item: DesktopItem }) {
  if (item.isDir) return <Folder size={16} strokeWidth={2.3} color="#38BDF8" />;
  if (item.isShortcut) return <AppWindow size={16} strokeWidth={2.2} color="#60A5FA" />;
  if (["png", "jpg", "jpeg", "webp", "svg", "gif"].includes(item.ext)) {
    return <ImageIcon size={16} strokeWidth={2.2} color="#34D399" />;
  }
  if (["ts", "tsx", "js", "rs", "py", "json", "css", "html", "md", "bat", "ps1"].includes(item.ext)) {
    return <FileCode2 size={16} strokeWidth={2.2} color="#38BDF8" />;
  }
  return <FileText size={16} strokeWidth={2.2} color="#A78BFA" />;
}

const ROUNDED_ARIAL = '"Arial Rounded MT Bold", "Arial Rounded", "Segoe UI Variable", sans-serif';

type ConfigWithGroups = LensConfig & { desktopGroups?: unknown };

const GROUP_COLORS = ["#60A5FA", "#38BDF8", "#A78BFA", "#34D399", "#FBBF24", "#FB7185"];

export const DesktopFolderSurface: React.FC = () => {
  const { config, updateConfig } = useLensState();
  const [view, setView] = useState<"groups" | "list">("groups");
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const groupsCfg: DesktopGroupsConfig = useMemo(
    () => readDesktopGroups((config as ConfigWithGroups | null)?.desktopGroups),
    [config]
  );
  const saveGroups = (next: DesktopGroupsConfig) => {
    if (!config) return;
    // Groups are only a view: this writes config, never touches the files themselves.
    updateConfig({ ...(config as ConfigWithGroups), desktopGroups: next } as LensConfig);
  };
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<DesktopItem[]>([]);
  const [iconsHidden, setIconsHidden] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "folders" | "files" | "apps">("all");

  const refresh = () => {
    invoke<DesktopItem[]>("list_desktop_items_cmd")
      .then(setItems)
      .catch(() => {});
    invoke<boolean>("get_desktop_icons_hidden_cmd")
      .then(setIconsHidden)
      .catch(() => {});
  };

  // The drawer and its window (docs/SMOOTHNESS.md, G-10). The window changes size in one native
  // step, and never while anything is moving: opening grows the window first and then glides the
  // drawer in; closing glides the drawer out first and then shrinks the window around the tab.
  const drawerRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const setNativeExpanded = (open: boolean) => invoke("set_desktop_folder_expanded_cmd", { expanded: open }).catch(() => {});
  const collapseRef = useRef<() => void>(() => {});

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    const unlistenCollapse = listen("lens://desktopfolder-collapse", () => collapseRef.current());
    return () => {
      window.clearInterval(timer);
      unlistenCollapse.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu((m) => {
        if (!m) collapse();
        return null;
      });
    };
    const onBlur = () => {
      window.setTimeout(() => {
        if (!document.hasFocus()) collapse();
      }, 150);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [expanded]);

  const openDrawer = () => {
    refresh();
    setQuery("");
    closingRef.current = false;
    void setNativeExpanded(true).then(() => setExpanded(true));
  };

  const collapse = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    void glideOut(drawerRef.current, { x: -10, opacity: 0 }).finished.then(() => {
      closingRef.current = false;
      setExpanded(false);
      void setNativeExpanded(false);
    });
  };
  collapseRef.current = collapse;

  // Entry pose first, in the same frame the drawer mounts, then the glide.
  useLayoutEffect(() => {
    if (expanded) glideIn(drawerRef.current, { x: -12, opacity: 0 });
  }, [expanded]);

  const toggleNativeIcons = () => {
    const next = !iconsHidden;
    setIconsHidden(next);
    invoke<boolean>("set_desktop_icons_hidden_cmd", { hide: next })
      .then(setIconsHidden)
      .catch(() => {});
    void setNativeExpanded(false);
  };

  /** "Quick hide all": fold every group and tuck the native desktop icons away. */
  const quickHideAll = () => {
    saveGroups(setAllCollapsed(groupsCfg, true));
    if (!iconsHidden) {
      setIconsHidden(true);
      invoke<boolean>("set_desktop_icons_hidden_cmd", { hide: true })
        .then(setIconsHidden)
        .catch(() => {});
    }
  };

  const arranged = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    return arrangeDesktop(visible, groupsCfg);
  }, [items, groupsCfg, query]);

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    saveGroups({
      ...groupsCfg,
      groups: [
        ...groupsCfg.groups,
        {
          id: newGroupId(),
          name: name.slice(0, 40),
          color: GROUP_COLORS[groupsCfg.groups.length % GROUP_COLORS.length],
          collapsed: false,
          rules: [],
          paths: [],
        },
      ],
    });
    setNewGroupName("");
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "folders" && !item.isDir) return false;
      if (filter === "apps" && !item.isShortcut) return false;
      if (filter === "files" && (item.isDir || item.isShortcut)) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q);
    });
  }, [items, filter, query]);

  if (!expanded) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          fontFamily: ROUNDED_ARIAL,
        }}
      >
        <button
          type="button"
          onClick={toggleNativeIcons}
          onContextMenu={(e) => {
            e.preventDefault();
            openDrawer();
          }}
          aria-label={iconsHidden ? "Reveal Arranged Desktop Icons" : "Condense Desktop Icons"}
          className="df-tab"
          style={
            {
              "--df-tab-border": iconsHidden ? "var(--lens-border)" : "rgb(56 189 248 / 0.45)",
              height: 60,
              borderRadius: "0 var(--lens-radius, 12px) var(--lens-radius, 12px) 0",
              background: "var(--lens-bg-surface)",
              backdropFilter: "blur(var(--lens-blur, 20px)) saturate(1.3)",
              boxShadow: "0 8px 24px rgb(0 0 0 / calc(0.5 * var(--lens-shade-k, 1)))",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 4,
              cursor: "pointer",
              fontFamily: ROUNDED_ARIAL,
            } as React.CSSProperties
          }
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              flex: 1,
            }}
          >
            {/* Minimalist outline folder matching the Bottom Dock with a subtle sky-blue hue */}
            <Folder
              size={22}
              strokeWidth={2.4}
              color="#38BDF8"
              style={{
                filter: iconsHidden
                  ? "drop-shadow(0 0 6px rgba(56, 189, 248, 0.32))"
                  : "drop-shadow(0 0 10px rgba(56, 189, 248, 0.65))",
              }}
            />
            <span
              style={{
                fontFamily: ROUNDED_ARIAL,
                fontSize: 10.5,
                fontWeight: 700,
                color: "var(--lens-fg)",
                letterSpacing: "0.01em",
                lineHeight: 1,
              }}
            >
              Desktop
            </span>
          </div>

          {/* Outer right-edge arrow: points right (>) when condensed, points left (<) when expanded onto desktop */}
          {iconsHidden ? (
            <ChevronRight
              size={14}
              strokeWidth={2.6}
              color="rgb(var(--lens-ink) / 0.65)"
              style={{ flexShrink: 0 }}
            />
          ) : (
            <ChevronLeft
              size={14}
              strokeWidth={2.6}
              color="#38BDF8"
              style={{ flexShrink: 0 }}
            />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={drawerRef}
      style={{
        width: "100%",
        height: "100%",
        padding: "4px 6px 4px 0",
        display: "flex",
        flexDirection: "column",
        fontFamily: ROUNDED_ARIAL,
      }}
    >
      <div
        className="lens-flyout-host"
        style={{
          flex: 1,
          minHeight: 0,
          borderRadius: "0 var(--lens-radius, 12px) var(--lens-radius, 12px) 0",
          background: "var(--lens-bg-surface)",
          backdropFilter: "blur(var(--lens-blur, 20px)) saturate(1.3)",
          border: "1px solid var(--lens-border)",
          borderLeft: "none",
          boxShadow: "var(--lens-shadow-panel)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            // Room on the right for the shared close button (src/ui/FlyoutClose.tsx).
            padding: "11px 40px 9px 14px",
            borderBottom: "1px solid var(--lens-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Folder size={16} strokeWidth={2.4} color="#38BDF8" />
            <span style={{ fontFamily: ROUNDED_ARIAL, fontSize: 13.5, fontWeight: 700, color: "var(--lens-fg)" }}>
              Desktop
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              className="df-icon-btn"
              aria-label={view === "groups" ? "Show as list" : "Show as groups"}
              onClick={() => setView(view === "groups" ? "list" : "groups")}
            >
              {view === "groups" ? <ListIcon size={14} strokeWidth={2.4} /> : <LayoutGrid size={14} strokeWidth={2.4} />}
            </button>
            <button type="button" className="df-icon-btn" aria-label="Fold all groups and hide desktop icons" onClick={quickHideAll}>
              <ChevronsDownUp size={14} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={toggleNativeIcons}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 8px",
                borderRadius: 7,
                background: iconsHidden ? "var(--lens-fg)" : "rgb(var(--lens-ink) / 0.08)",
                color: iconsHidden ? "var(--lens-on-fg, #09090b)" : "var(--lens-fg)",
                fontFamily: ROUNDED_ARIAL,
                fontSize: 10.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {iconsHidden ? <Eye size={12} /> : <EyeOff size={12} />}
              <span>{iconsHidden ? "Show Icons" : "Condense"}</span>
            </button>
          </div>
        </div>
        <FlyoutClose onClose={collapse} />

        {/* Search + Filter Pills */}
        <div style={{ padding: "10px 12px 6px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 30,
              padding: "0 10px",
              borderRadius: 9,
              background: "rgb(0 0 0 / calc(0.42 * var(--lens-well-k, 1)))",
              border: "1px solid rgb(var(--lens-ink) / 0.08)",
            }}
          >
            <Search size={13} strokeWidth={2.4} color="var(--lens-fg-secondary)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter desktop items..."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: ROUNDED_ARIAL,
                fontSize: 12,
                color: "var(--lens-fg)",
              }}
            />
          </div>

          {view === "list" && (
          <div style={{ display: "flex", gap: 5 }}>
            {(
              [
                { id: "all", label: "All" },
                { id: "folders", label: "Folders" },
                { id: "files", label: "Files" },
                { id: "apps", label: "Shortcuts" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                style={{
                  flex: 1,
                  padding: "4px 6px",
                  borderRadius: 7,
                  fontFamily: ROUNDED_ARIAL,
                  fontSize: 11,
                  fontWeight: 700,
                  background: filter === f.id ? "var(--lens-fg)" : "rgb(var(--lens-ink) / 0.05)",
                  color: filter === f.id ? "var(--lens-on-fg, #09090b)" : "var(--lens-fg-secondary)",
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          )}
        </div>

        {view === "groups" && (
          <div className="df-groups" onClick={() => setMenu(null)}>
            {arranged.map(({ group, items: groupItems }) => {
              const isUnsorted = group.id === UNSORTED_ID;
              const collapsed = !isUnsorted && group.collapsed && !query;
              return (
                <section key={group.id} className="df-group">
                  <button
                    type="button"
                    className="df-group-head"
                    aria-expanded={!collapsed}
                    disabled={isUnsorted}
                    onClick={() => saveGroups(setCollapsed(groupsCfg, group.id, !group.collapsed))}
                  >
                    {isUnsorted ? (
                      <span style={{ width: 12 }} />
                    ) : collapsed ? (
                      <ChevronRight size={12} strokeWidth={2.6} />
                    ) : (
                      <ChevronDown size={12} strokeWidth={2.6} />
                    )}
                    <span className="df-group-dot" style={{ background: group.color }} />
                    <span className="df-group-name">{group.name}</span>
                    <span className="df-group-count">{groupItems.length}</span>
                  </button>
                  {!collapsed && groupItems.length > 0 && (
                    <div className="df-grid">
                      {groupItems.map((item) => (
                        <button
                          key={item.path}
                          type="button"
                          className="df-tile"
                          onClick={() => {
                            invoke("launch_app_cmd", { path: item.path }).catch(() => {});
                            collapse();
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenu({ path: item.path, x: e.clientX, y: e.clientY });
                          }}
                        >
                          <span className="df-tile-icon">
                            <ItemIcon item={item} />
                          </span>
                          <span className="df-tile-name">{item.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!collapsed && groupItems.length === 0 && !isUnsorted && (
                    <div className="df-empty">Right-click any item to move it here.</div>
                  )}
                </section>
              );
            })}

            <div className="df-new-group">
              <input
                value={newGroupName}
                maxLength={40}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addGroup();
                }}
                placeholder="New group…"
                aria-label="New group name"
              />
              <button type="button" className="df-icon-btn" aria-label="Add group" onClick={addGroup}>
                <Plus size={14} strokeWidth={2.6} />
              </button>
            </div>

            {menu && (
              <div
                className="df-menu"
                role="menu"
                style={{
                  left: Math.max(6, Math.min(menu.x, window.innerWidth - 186)),
                  // label + one row per group + "Automatic", kept fully inside the drawer
                  top: Math.max(6, Math.min(menu.y, window.innerHeight - (36 + (groupsCfg.groups.length + 1) * 29) - 10)),
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="df-menu-label">Move to</div>
                {groupsCfg.groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      saveGroups(placeItem(groupsCfg, menu.path, g.id));
                      setMenu(null);
                    }}
                  >
                    <span className="df-group-dot" style={{ background: g.color }} />
                    {g.name}
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    saveGroups(placeItem(groupsCfg, menu.path, null));
                    setMenu(null);
                  }}
                >
                  <span className="df-group-dot" style={{ background: "transparent", border: "1px solid var(--lens-fg-muted)" }} />
                  Automatic
                </button>
              </div>
            )}
          </div>
        )}

        {/* Items List */}
        {view === "list" && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 10px 10px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
          {filtered.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => {
                invoke("launch_app_cmd", { path: item.path }).catch(() => {});
                collapse();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 9px",
                borderRadius: 9,
                background: "transparent",
                textAlign: "left",
                fontFamily: ROUNDED_ARIAL,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgb(var(--lens-ink) / 0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <ItemIcon item={item} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "var(--lens-fg)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.name}
              </span>
              <ExternalLink size={12} color="var(--lens-fg-muted)" />
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--lens-fg-muted)" }}>
              No desktop items match.
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};
