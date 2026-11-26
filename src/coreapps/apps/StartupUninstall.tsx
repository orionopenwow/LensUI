// Lens Startup & Uninstall: startup apps with estimated impact (all reversible), installed apps
// with size and last use, uninstall only through the app's own uninstaller (or winget) after a
// confirm, and a review of leftover folders that go to the Recycle Bin.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { InstalledProgram, LensConfig, Leftover, StartupEntry } from "../../types/generated";
import { AppShell, isKey, usePresence } from "../shell/AppShell";
import { Button, Card, Confirm, Empty, ErrorNote, Hero, Mono, Pill, Search, Skeleton, Switch, Tabs, Toast, cx } from "../shell/ui";
import { useLoad } from "../shell/hooks";
import { ago, bytes, plural, ymd } from "../shell/format";
import { sortPrograms, sortStartup, totalKb, unusedFor, type ProgramSort } from "../models/startup";
import { friendlyError } from "../models/load";
import { coreApp } from "../registry";

type View = "startup" | "uninstall" | "leftovers";

export interface StartupDemo {
  startup: StartupEntry[];
  programs: InstalledProgram[];
  leftovers: Leftover[];
}

export const StartupUninstall: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => Promise<void>; initialView?: string; initialFind?: string; demo?: StartupDemo }> = ({
  config,
  updateConfig,
  initialView,
  initialFind,
  demo,
}) => {
  const app = coreApp("startup")!;
  const [view, setView] = useState<View>(initialView === "uninstall" || initialView === "leftovers" ? initialView : "startup");
  const startup = useLoad<StartupEntry[]>("sys_startup_list_cmd", {}, { isEmpty: (d) => d.length === 0, enabled: !demo });
  const programs = useLoad<InstalledProgram[]>("coreapp_programs", {}, { isEmpty: (d) => d.length === 0, enabled: !demo && view === "uninstall" });
  const leftovers = useLoad<Leftover[]>("coreapp_leftovers", {}, { isEmpty: (d) => d.length === 0, enabled: !demo && view === "leftovers" });
  const st = demo ? { status: "ready" as const, data: demo.startup, error: null, reload: () => {} } : startup;
  const pr = demo ? { status: "ready" as const, data: demo.programs, error: null, reload: () => {} } : programs;
  const lo = demo ? { status: demo.leftovers.length ? ("ready" as const) : ("empty" as const), data: demo.leftovers, error: null, reload: () => {} } : leftovers;
  const [query, setQuery] = useState(initialFind ?? "");
  const [sort, setSort] = useState<ProgramSort>("name");
  // The Cleaner's "Uninstall…" hands an app over by name: show Installed apps filtered to it. The
  // uninstall itself still starts from this window's own confirmation.
  useEffect(() => {
    if (demo) return;
    const unView = listen<string>("lens://coreapp-view", (e) => {
      if (e.payload === "startup" || e.payload === "uninstall" || e.payload === "leftovers") setView(e.payload);
    });
    const unFind = listen<string>("lens://coreapp-find", (e) => {
      setView("uninstall");
      setQuery(String(e.payload ?? ""));
    });
    return () => {
      unView.then((f) => f()).catch(() => {});
      unFind.then((f) => f()).catch(() => {});
    };
  }, [demo]);
  const [confirm, setConfirm] = useState<{ p: InstalledProgram; method: "registered" | "winget" } | null>(null);
  const [recycle, setRecycle] = useState<Leftover | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const presence = usePresence();

  const rows = useMemo(() => sortStartup(st.data ?? []), [st.data]);
  const enabled = rows.filter((r) => r.enabled);
  const heavy = enabled.filter((r) => r.impact === "high");
  const list = useMemo(() => sortPrograms(pr.data ?? [], sort, query), [pr.data, sort, query]);
  const stale = useMemo(() => unusedFor(pr.data ?? [], 90), [pr.data]);

  const setStartup = async (e: StartupEntry, on: boolean) => {
    setBusyKey(e.name);
    try {
      const next = await invoke<StartupEntry[]>("sys_startup_set_cmd", { name: e.name, enabled: on });
      if (!demo) startup.set(next);
      setToast({ text: `${e.name} ${on ? "will start" : "won't start"} with Windows.`, tone: "ok" });
    } catch (err) {
      setToast({ text: friendlyError(String(err)), tone: "bad" });
    } finally {
      setBusyKey(null);
    }
  };

  const runUninstall = async (p: InstalledProgram, method: "registered" | "winget") => {
    const msg = await presence.run(`Uninstalling ${p.name}`, null, () => invoke<string>("coreapp_uninstall", { key: p.key, method }));
    if (msg) setToast({ text: msg, tone: "ok" });
  };

  const keys = [
    { keys: "Ctrl+F", label: "Search installed apps", match: (e: KeyboardEvent) => isKey(e, "f", { ctrl: true }), run: () => (setView("uninstall"), setTimeout(() => searchRef.current?.focus(), 0)) },
    { keys: "Ctrl+1", label: "Startup apps", match: (e: KeyboardEvent) => isKey(e, "1", { ctrl: true }), run: () => setView("startup") },
    { keys: "Ctrl+2", label: "Installed apps", match: (e: KeyboardEvent) => isKey(e, "2", { ctrl: true }), run: () => setView("uninstall") },
    { keys: "Ctrl+3", label: "Leftovers", match: (e: KeyboardEvent) => isKey(e, "3", { ctrl: true }), run: () => setView("leftovers") },
    { keys: "F5", label: "Refresh", match: (e: KeyboardEvent) => e.key === "F5", run: () => (view === "startup" ? st.reload() : view === "uninstall" ? pr.reload() : lo.reload()) },
  ];

  const toolbar = (
    <>
      <Tabs
        label="Sections"
        value={view}
        onChange={setView}
        options={[
          { id: "startup", label: "Startup", count: enabled.length },
          { id: "uninstall", label: "Installed apps", count: pr.data?.length },
          { id: "leftovers", label: "Leftovers", count: lo.data?.length || undefined },
        ]}
      />
      <div className="ca-spacer" />
      {view === "uninstall" && (
        <>
          <Tabs
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { id: "name", label: "Name" },
              { id: "size", label: "Size" },
              { id: "lastUsed", label: "Least used" },
            ]}
          />
          <Search value={query} onChange={setQuery} placeholder="Search installed apps" inputRef={searchRef} />
        </>
      )}
    </>
  );

  return (
    <AppShell
      app={app}
      config={config}
      updateConfig={updateConfig}
      toolbar={toolbar}
      keys={keys}
      working={presence.busy}
      meta={
        view === "startup"
          ? "Impact is estimated · every change is undone by Remove all Lens changes"
          : view === "uninstall"
            ? `${plural(list.length, "app")} · ${bytes(totalKb(list) * 1024)} reported by installers`
            : "Leftovers go to the Recycle Bin, never deleted"
      }
      actions={
        view === "uninstall" ? (
          <Button onClick={() => setView("leftovers")}>Check for leftovers</Button>
        ) : view === "startup" ? (
          <Button onClick={() => st.reload()}>Refresh</Button>
        ) : (
          <Button onClick={() => lo.reload()}>Look again</Button>
        )
      }
    >
      {view === "startup" && (
        <>
          <Hero
            title="Starts with Windows"
            value={enabled.length}
            valueText={String(enabled.length)}
            unit={enabled.length === 1 ? "app" : "apps"}
            subtitle={
              heavy.length
                ? `${plural(heavy.length, "app")} with a high estimated impact: ${heavy.slice(0, 3).map((h) => h.name).join(", ")}. Turning ${heavy.length === 1 ? "it" : "them"} off speeds up sign-in.`
                : "Nothing heavy starts at sign-in."
            }
            tone={heavy.length >= 3 ? "warn" : undefined}
          />
          {st.status === "loading" && <Skeleton rows={5} />}
          {st.status === "error" && <ErrorNote onRetry={st.reload}>{st.error}</ErrorNote>}
          {st.status === "empty" && <Empty title="No startup apps" config={config}>Nothing in your startup list. Sign-in is as quick as it gets.</Empty>}
          {rows.length > 0 && (
            <Card title="Startup apps" meta="HKCU Run · your account">
              <ul className="ca-list">
                {rows.map((r) => (
                  <li key={r.name} className={cx("ca-item", !r.enabled && "disabled")}>
                    <span className="ca-item-icon" aria-hidden>
                      {r.name.trim()[0]?.toUpperCase()}
                    </span>
                    <div className="ca-item-main">
                      <div className="ca-item-title">{r.name}</div>
                      <div className="ca-item-sub">{r.why}</div>
                      <Mono className="ca-item-sub">{r.command}</Mono>
                    </div>
                    <Pill tone={r.impact === "high" ? "bad" : r.impact === "medium" ? "warn" : "ok"}>{r.impact} impact</Pill>
                    <Switch checked={r.enabled} label={`Start ${r.name} with Windows`} disabled={busyKey === r.name} onChange={(v) => setStartup(r, v)} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <p className="ca-note">
            <strong>Reversible.</strong> Lens keeps each app's original entry, so you can switch it back on here, and <em>Remove all Lens changes</em> restores the whole list.
          </p>
        </>
      )}

      {view === "uninstall" && (
        <>
          {pr.status === "loading" && <Skeleton rows={8} />}
          {pr.status === "error" && <ErrorNote onRetry={pr.reload}>{pr.error}</ErrorNote>}
          {pr.status === "empty" && <Empty title="No installed apps found" config={config}>Windows didn't list any apps for this account.</Empty>}
          {pr.data && pr.data.length > 0 && (
            <>
              <Hero
                title="Installed apps"
                value={pr.data.length}
                valueText={String(pr.data.length)}
                unit="apps"
                subtitle={stale.length ? `${plural(stale.length, "app")} not opened from Start in 90 days. Sort by “Least used” to review them.` : "Sorted by name. Uninstalling always runs the app's own uninstaller."}
              />
              <Card title={query ? `Matching “${query}”` : "All apps"} meta={`${list.length} shown`}>
                {list.length === 0 ? (
                  <p className="ca-muted" style={{ padding: 8 }}>
                    Nothing matches “{query}”.
                  </p>
                ) : (
                  <ul className="ca-list">
                    {list.map((p) => (
                      <li key={p.key} className="ca-item">
                        <span className="ca-item-icon" aria-hidden>
                          {p.name.trim()[0]?.toUpperCase()}
                        </span>
                        <div className="ca-item-main">
                          <div className="ca-item-title">{p.name}</div>
                          <div className="ca-item-sub">
                            {[p.publisher, p.version && `v${p.version}`, p.installDate && `installed ${ymd(p.installDate)}`].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <span className="ca-item-num">
                          {p.sizeKb ? bytes(p.sizeKb * 1024) : "—"}
                        </span>
                        <span className="ca-item-num ca-secondary" style={{ minWidth: 96 }}>
                          {p.lastUsedMs ? ago(p.lastUsedMs) : "—"}
                        </span>
                        <Button small variant="ghost" onClick={() => setConfirm({ p, method: p.canUninstall ? "registered" : "winget" })} aria-label={`Uninstall ${p.name}`}>
                          Uninstall
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <p className="ca-note">
                <strong>Last used</strong> is when you last opened the app from Start or the taskbar, as Windows recorded it. “—” means Windows has no record, not that it's unused.
              </p>
            </>
          )}
        </>
      )}

      {view === "leftovers" && (
        <>
          {lo.status === "loading" && <Skeleton rows={3} />}
          {lo.status === "error" && <ErrorNote onRetry={lo.reload}>{lo.error}</ErrorNote>}
          {lo.status === "empty" && (
            <Empty title="Nothing left behind" config={config} action={<Button onClick={() => setView("uninstall")}>Installed apps</Button>}>
              After you uninstall an app here, Lens checks whether its folder is still there. Only those folders are listed, for you to review.
            </Empty>
          )}
          {lo.data && lo.data.length > 0 && (
            <Card title="Folders left after uninstalling" meta="review before removing">
              <ul className="ca-list">
                {lo.data.map((l) => (
                  <li key={l.path} className="ca-item">
                    <div className="ca-item-main">
                      <Mono className="ca-item-title">{l.path}</Mono>
                      <div className="ca-item-sub">
                        {plural(l.files, "file")} · {bytes(l.bytes)}
                      </div>
                    </div>
                    <Button small onClick={() => invoke("launch_app_cmd", { path: l.path }).catch(() => {})}>
                      Open
                    </Button>
                    <Button small variant="danger" onClick={() => setRecycle(l)}>
                      Move to Recycle Bin
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {confirm && (
        <Confirm
          title={`Uninstall ${confirm.p.name}?`}
          body={
            confirm.method === "registered" ? (
              <>
                <p>Lens will start {confirm.p.name}'s own uninstaller. Follow its window to finish; Windows may ask for permission.</p>
                <p className="ca-mono" style={{ wordBreak: "break-all" }}>
                  {confirm.p.uninstallString}
                </p>
              </>
            ) : (
              <>
                <p>{confirm.p.blockedReason ?? "Lens can't run this app's registered uninstaller."}</p>
                <p>Lens can ask winget to uninstall it instead. Winget runs the app's own uninstaller too.</p>
                <p className="ca-mono">winget uninstall --exact --name "{confirm.p.name}"</p>
              </>
            )
          }
          confirmLabel={confirm.method === "registered" ? "Start uninstaller" : "Use winget"}
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            runUninstall(c.p, c.method).catch((e) => setToast({ text: friendlyError(String(e)), tone: "bad" }));
          }}
        />
      )}
      {recycle && (
        <Confirm
          title="Move this folder to the Recycle Bin?"
          body={
            <>
              <p className="ca-mono" style={{ wordBreak: "break-all" }}>
                {recycle.path}
              </p>
              <p>
                {plural(recycle.files, "file")}, {bytes(recycle.bytes)}. You can restore it from the Recycle Bin.
              </p>
            </>
          }
          confirmLabel="Move to Recycle Bin"
          danger
          onCancel={() => setRecycle(null)}
          onConfirm={() => {
            const r = recycle;
            setRecycle(null);
            presence
              .run("Moving a leftover folder to the Recycle Bin", null, () => invoke<string>("coreapp_leftover_recycle", { path: r.path }))
              .then((m) => {
                if (m) setToast({ text: m, tone: "ok" });
                lo.reload();
              })
              .catch((e) => setToast({ text: friendlyError(String(e)), tone: "bad" }));
          }}
        />
      )}
      <Toast text={toast?.text ?? null} tone={toast?.tone} onDone={() => setToast(null)} />
    </AppShell>
  );
};
