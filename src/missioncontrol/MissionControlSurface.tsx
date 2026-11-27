// Lens Mission Control (`?surface=missioncontrol`, dev builds only; docs/MISSION_CONTROL.md).
// The window shell: title bar with Lens window buttons, Settings-style sidebar, the page, the one
// confirm sheet and the toast host. Keyboard: ↑/↓ in the sidebar, Ctrl+1…9 jump to a page,
// Ctrl+R or F5 refresh everything, / focuses the page's search, Esc closes the confirm sheet.
import React, { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLensState } from "../hooks/useLensState";
import { TrafficLights } from "../components/TrafficLights";
import { ToastHost } from "../ui";
import { MOCK } from "./api";
import { L } from "./loaders";
import { ALL_PAGES, NAV, pageForDigit, stepPage, type PageId } from "./nav";
import { ConfirmHost, Pill, refreshAll, useLoad } from "./ui";
import { Pulse } from "./pages/Pulse";
import { Prs } from "./pages/Prs";
import { Bugs } from "./pages/Bugs";
import { Suggestions } from "./pages/Suggestions";
import { Checks } from "./pages/Checks";
import { Roadmap } from "./pages/Roadmap";
import { Quality } from "./pages/Quality";
import { Releases } from "./pages/Releases";
import { DevFolder } from "./pages/DevFolder";
import { LocalLens } from "./pages/LocalLens";
import { Agents } from "./pages/Agents";
import { Brain } from "./pages/Brain";
import { Onboarding, Setup } from "./pages/Setup";
import "./mission.css";

function firstPage(): PageId {
  const p = new URLSearchParams(location.search).get("page") as PageId | null;
  return p && ALL_PAGES.includes(p) ? p : "pulse";
}

export function MissionControlSurface() {
  const { config } = useLensState();
  const [page, setPage] = useState<PageId>(firstPage);
  const status = useLoad("status", L.status);
  const navRef = useRef<HTMLElement>(null);
  const noToken = status.data?.tokenSource === "none";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      if ((e.ctrlKey && e.key.toLowerCase() === "r") || e.key === "F5") {
        e.preventDefault();
        refreshAll();
        return;
      }
      if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
        const p = pageForDigit(Number(e.key));
        if (p) {
          e.preventDefault();
          setPage(p);
        }
        return;
      }
      if (e.key === "/" && !typing) {
        const s = document.querySelector<HTMLInputElement>("[data-mc-search]");
        if (s) {
          e.preventDefault();
          s.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onNavKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = e.key === "Home" ? ALL_PAGES[0] : e.key === "End" ? ALL_PAGES[ALL_PAGES.length - 1] : stepPage(page, e.key === "ArrowDown" ? 1 : -1);
    setPage(next);
    navRef.current?.querySelector<HTMLButtonElement>(`.mc-nav-btn[data-page="${next}"]`)?.focus();
  };

  const w = () => getCurrentWindow();
  const view: Record<PageId, React.ReactNode> = {
    pulse: <Pulse go={setPage} />,
    prs: <Prs />,
    bugs: <Bugs />,
    suggestions: <Suggestions />,
    checks: <Checks />,
    roadmap: <Roadmap />,
    quality: <Quality />,
    releases: <Releases />,
    dev: <DevFolder />,
    local: <LocalLens />,
    agents: <Agents />,
    brain: <Brain />,
    setup: <Setup />,
  };

  return (
    <ConfirmHost>
      <div className="mc-root" data-mission-control="" data-page={page}>
        <header className="mc-titlebar" data-tauri-drag-region="">
          <TrafficLights styleVariant={config?.windowControls?.style} order={config?.windowControls?.order} onMinimize={() => w().minimize().catch(() => {})} onMaximize={() => w().toggleMaximize().catch(() => {})} onClose={() => w().hide().catch(() => {})} />
          <span className="mc-titlebar-name" data-tauri-drag-region="">
            Mission Control <span className="mc-muted">· dev build</span>
          </span>
          <span className="mc-titlebar-status">
            {MOCK ? <Pill tone="info">sample data</Pill> : null}
            {status.data?.offline ? <Pill tone="warn">offline · showing cached data</Pill> : null}
            {status.data?.rate && status.data.rate.remaining < 200 ? <Pill tone="warn">{status.data.rate.remaining} API calls left</Pill> : null}
            {noToken ? <Pill tone="bad">no GitHub token</Pill> : null}
            <button type="button" className="mc-iconbtn" data-weight="medium" aria-label="Refresh everything (Ctrl+R)" onClick={refreshAll}>
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
                <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </span>
        </header>
        <div className="mc-body-grid">
          <nav className="mc-sidebar" aria-label="Mission Control pages" ref={navRef} onKeyDown={onNavKey}>
            {NAV.map((g) => (
              <div key={g.group} className="mc-nav-group" role="group" aria-label={g.group}>
                <div className="mc-nav-label">{g.group}</div>
                {g.pages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-page={p.id}
                    data-weight="light"
                    className={`mc-nav-btn ${page === p.id ? "is-on" : ""}`}
                    aria-current={page === p.id ? "page" : undefined}
                    tabIndex={page === p.id ? 0 : -1}
                    onClick={() => setPage(p.id)}
                  >
                    {p.label}
                    <span className="mc-nav-key" aria-hidden>
                      {ALL_PAGES.indexOf(p.id) < 9 ? `Ctrl ${ALL_PAGES.indexOf(p.id) + 1}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <main className="mc-content" key={page}>
            {noToken && page !== "setup" ? (
              <div className="mc-banner">
                <Onboarding onDone={status.reload} />
              </div>
            ) : null}
            {view[page]}
          </main>
        </div>
        <ToastHost />
      </div>
    </ConfirmHost>
  );
}
