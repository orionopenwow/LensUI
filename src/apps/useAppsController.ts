// The state behind Lens Apps: what's installed, the Get queue, the one open confirmation, and
// "Update all". One owner for each: the queue reducer owns jobs in flight, `installed` is always
// what winget last said, and a confirmation is open in exactly one place (popover or bulk card).
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useLocalApproval } from "../approval/LocalApproval";
import { announce as presenceAnnounce } from "../presence/api";
import { oops } from "../ui/oops";
import { toast } from "../ui/toastBus";
import { pillFor, type PillKind, type PopoverMode, type PopoverProps } from "./ActionPill";
import { appApprovalPreview, approvalReference, approvalText } from "./approval";
import {
  applyRecipe,
  cancelJob,
  discardRelease,
  installedState,
  lensInstalled,
  loadSettings,
  onProgress,
  openApp,
  openLink,
  prepareRelease,
  recipePreview,
  removePortable,
  revealApp,
  revertRecipe,
  runApp,
  runRelease,
  showApp,
} from "./api";
import { reduceJobs, type Jobs } from "./jobs";
import { autoUpdateRows, libraryModel, updatable, updateAllPreview, updateAllReference, updateAllText, type LibraryRow } from "./libraryModel";
import { emptyQueue, itemFor, nextToStart, reduceQueue, retryMode, type QueueOp, type QueueState } from "./queue";
import type { AppShow, Catalog, CatalogApp, InstalledInfo, PreparedRelease, RecipeStepView } from "./types";

export interface AppsDemo {
  catalog?: Catalog;
  installed?: Record<string, InstalledInfo>;
  queue?: QueueState;
  jobs?: Jobs;
  prepared?: Record<string, PreparedRelease>;
  shows?: Record<string, AppShow>;
  recipes?: Record<string, RecipeStepView[]>;
  popover?: { appId: string; mode: PopoverMode };
  hover?: string;
  category?: string;
  /** Open on the Library, optionally with the "Update all" confirmation showing. */
  view?: "discover" | "library";
  bulk?: boolean;
  /** What a failed `winget list` looks like. */
  installedError?: string;
  /** The gallery's starting screenshot. */
  shot?: number;
}

/** True when an app is one Lens keeps itself (a verified program file in its own apps folder). */
export const isPortable = (app: CatalogApp): boolean => !!(app.install as { portable?: boolean }).portable;

export function useAppsController(catalog: Catalog | null, demo: AppsDemo | undefined) {
  const [installed, setInstalled] = useState<Record<string, InstalledInfo>>(demo?.installed ?? {});
  const [installedError, setInstalledError] = useState<string | null>(demo?.installedError ?? null);
  const [checking, setChecking] = useState(false);
  const [queue, dispatch] = useReducer(reduceQueue, demo?.queue ?? emptyQueue);
  const [jobs, setJobs] = useState<Jobs>(demo?.jobs ?? {});
  const [prepared, setPrepared] = useState<Record<string, PreparedRelease>>(demo?.prepared ?? {});
  const [shows, setShows] = useState<Record<string, AppShow | { error: string }>>(demo?.shows ?? {});
  const [recipes, setRecipes] = useState<Record<string, RecipeStepView[]>>(demo?.recipes ?? {});
  const [popover, setPopover] = useState<{ appId: string; mode: PopoverMode } | null>(demo?.popover ?? null);
  const [bulk, setBulk] = useState<LibraryRow[] | null>(null);
  const byId = useMemo<Record<string, CatalogApp>>(() => Object.fromEntries((catalog?.apps ?? []).map((a) => [a.id, a])), [catalog]);
  const library = useMemo(() => libraryModel(catalog?.apps ?? [], installed), [catalog, installed]);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  /** Asks winget again. `asked` is true when the person pressed "Check again". */
  const refresh = useCallback(
    async (asked = false) => {
      if (demo) return;
      if (asked) setChecking(true);
      const r = await installedState();
      if (!alive.current) return;
      setInstalled(r.apps);
      setInstalledError(r.error);
      if (asked) {
        setChecking(false);
        if (r.error) toast.error("Couldn't check what's installed.");
      }
    },
    [demo],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // "Update apps automatically" (Settings › Apps) is off by default (B-122). Off, an update only
  // shows as "Update available" and waits for the person's click. On, each check (opening Lens Apps
  // or Check again) also starts the updates for winget apps Lens installed, once per app per session.
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [ours, setOurs] = useState<string[]>([]);
  const autoTried = useRef(new Set<string>());
  useEffect(() => {
    if (demo) return;
    loadSettings().then((s) => alive.current && setAutoUpdate(s.autoUpdate === true));
    lensInstalled().then((ids) => alive.current && setOurs(ids));
  }, [demo]);

  useEffect(() => {
    if (demo?.bulk) setBulk(library.updates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (demo || !autoUpdate) return;
    const rows = autoUpdateRows(library, queue, ours, autoTried.current);
    if (!rows.length) return;
    for (const r of rows) {
      autoTried.current.add(r.app.id);
      dispatch({ type: "enqueue", appId: r.app.id, op: "upgrade" });
    }
    toast(rows.length === 1 ? `Updating ${rows[0].app.name} automatically.` : `Updating ${rows.length} apps automatically.`);
    // Runs when a check brings new results, not on every queue step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, ours, autoUpdate, demo]);

  // Progress events → jobs; job end → queue.
  useEffect(() => {
    if (demo) return;
    let un: (() => void) | undefined;
    let gone = false;
    onProgress((e) => {
      setJobs((j) => reduceJobs(j, e));
      if (e.op === "download") return; // release downloads finish through apps_release_prepare
      if (e.stage === "done" || e.stage === "failed") {
        dispatch({ type: "finished", appId: e.appId, ok: e.stage === "done", message: e.message });
        void refresh();
      }
    }).then((u) => (gone ? u() : (un = u)));
    return () => {
      gone = true;
      un?.();
    };
  }, [demo, refresh]);

  // Queue runner: start the next queued item when nothing is running.
  const next = nextToStart(queue);
  useEffect(() => {
    if (!next || demo || !catalog) return;
    const app = byId[next.appId];
    if (!app) return;
    dispatch({ type: "started", appId: next.appId });
    // "Lens at work": ring the app's card with "Installing Obsidian" (Subtle by default).
    const verb = next.op === "uninstall" ? "Removing" : next.op === "upgrade" ? "Updating" : "Installing";
    void presenceAnnounce("apps", { kind: "click", label: `${verb} ${app.name}` }, document.querySelector(`[data-app-id="${CSS.escape(app.id)}"]`));
    if (app.install.method === "githubRelease") {
      prepareRelease(app.id).then(
        (p) => {
          setPrepared((m) => ({ ...m, [app.id]: p }));
          dispatch({ type: "verified", appId: app.id, token: p.token });
        },
        (e) => dispatch({ type: "finished", appId: app.id, ok: false, message: String(e) }),
      );
    } else {
      runApp(app.id, next.op).then(
        (jobId) => dispatch({ type: "started", appId: app.id, jobId }),
        (e) => dispatch({ type: "finished", appId: app.id, ok: false, message: String(e) }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.appId, next?.status, demo, catalog, byId]);

  // After a successful install, fetch the setup checklist for the tray.
  useEffect(() => {
    if (demo) return;
    for (const it of queue.items) {
      if (it.setupPending && !recipes[it.appId]) {
        recipePreview(it.appId).then(
          (r) => (r.length ? setRecipes((m) => ({ ...m, [it.appId]: r })) : dispatch({ type: "setupDone", appId: it.appId })),
          () => dispatch({ type: "setupDone", appId: it.appId }),
        );
      }
    }
  }, [queue, recipes, demo]);

  const viaOf = useCallback((app: CatalogApp): CatalogApp | null => (app.install.method === "via" ? byId[app.install.via] ?? null : null), [byId]);

  const openPopover = useCallback(
    (app: CatalogApp, mode: PopoverMode) => {
      const target = viaOf(app) ?? app;
      setBulk(null);
      setPopover({ appId: app.id, mode });
      if (target.install.method === "winget" && !shows[target.id] && !demo) {
        showApp(target.id).then(
          (s) => setShows((m) => ({ ...m, [target.id]: s })),
          (e) => setShows((m) => ({ ...m, [target.id]: { error: String(e) } })),
        );
      }
    },
    [shows, demo, viaOf],
  );

  const primary = useCallback(
    (app: CatalogApp, kind: PillKind) => {
      const fail = oops(`open ${app.name}`);
      switch (kind) {
        case "open":
          // A web app with no shortcut yet opens its address instead.
          if (app.install.method === "web" && !installed[app.id]) openApp(app.id).catch(() => openLink(app.id, (app.install as { url: string }).url).catch(fail));
          else openApp(app.id).catch(fail);
          return;
        case "getExternal":
          openLink(app.id, (app.install as { url: string }).url).catch(oops(`open ${app.name}'s site`));
          return;
        case "update": {
          // One click: the person already has the app, and winget updates it from the same source
          // (hash-checked). Other kinds (a release download) still show their check first.
          const target = viaOf(app) ?? app;
          if (target.install.method !== "winget" || demo) return openPopover(app, "update");
          setPopover(null);
          setBulk(null);
          dispatch({ type: "enqueue", appId: target.id, op: "upgrade" });
          return;
        }
        case "run":
          return openPopover(app, "run");
        case "retry":
          return openPopover(app, retryMode(itemFor(queue, (viaOf(app) ?? app).id)?.op));
        default:
          return openPopover(app, "get");
      }
    },
    [installed, openPopover, queue, viaOf, demo],
  );

  const confirm = useCallback(() => {
    if (!popover) return;
    const app = byId[popover.appId];
    const target = viaOf(app) ?? app;
    setPopover(null);
    if (popover.mode === "run") {
      const it = itemFor(queue, target.id);
      if (it?.token)
        runRelease(it.token).then(
          () => {
            dispatch({ type: "finished", appId: target.id, ok: true });
            void refresh();
          },
          (e) => dispatch({ type: "finished", appId: target.id, ok: false, message: String(e) }),
        );
      return;
    }
    // Portable apps (one program file Lens keeps in its apps folder) are removed by deleting that
    // folder; there is no Windows uninstaller to run, so there is no queue item to carry a failure.
    if (popover.mode === "uninstall" && isPortable(target)) {
      removePortable(target.id).then(() => {
        toast.success(`${target.name} removed.`);
        void refresh();
      }, oops(`remove ${target.name}`));
      return;
    }
    const op: QueueOp = popover.mode === "update" ? "upgrade" : popover.mode === "uninstall" ? "uninstall" : "install";
    dispatch({ type: "enqueue", appId: target.id, op });
  }, [popover, byId, queue, viaOf, refresh]);

  // One approval card: the open confirmation is also in the shared queue, so it shows on the
  // pill and in the approval window; an answer given there lands here.
  const asking = popover ? byId[popover.appId] : null;
  const askingTarget = asking ? (viaOf(asking) ?? asking) : null;
  const settleApproval = useLocalApproval({
    reference: popover && askingTarget ? approvalReference(askingTarget.id, popover.mode) : null,
    tool: popover ? `apps_${popover.mode}` : "",
    text: popover && askingTarget ? approvalText(askingTarget, popover.mode) : "",
    source: "Lens Apps",
    preview: popover && askingTarget ? appApprovalPreview(askingTarget, popover.mode, prepared[askingTarget.id] ?? null) : null,
    onApprove: confirm,
    onDeny: () => setPopover(null),
  });

  // "Update all": the same shared card, one request for the whole list.
  const confirmBulk = useCallback(() => {
    if (!bulk) return;
    setBulk(null);
    for (const r of bulk) dispatch({ type: "enqueue", appId: r.app.id, op: "upgrade" });
  }, [bulk]);
  const settleBulk = useLocalApproval({
    reference: bulk?.length ? updateAllReference(bulk) : null,
    tool: "apps_update_all",
    text: bulk?.length ? updateAllText(bulk) : "",
    source: "Lens Apps",
    preview: bulk?.length ? updateAllPreview(bulk) : null,
    onApprove: confirmBulk,
    onDeny: () => setBulk(null),
  });

  const cancelId = useCallback(
    (appId: string) => {
      const it = itemFor(queue, appId);
      // Both tidy up after a cancel the person already sees take effect; a failure here leaves a
      // finished job or a cached download behind, which the next run replaces.
      if (it?.jobId) void cancelJob(it.jobId);
      if (it?.token) void discardRelease(it.token);
      dispatch({ type: "cancel", appId });
    },
    [queue],
  );

  const targetOf = (app: CatalogApp) => viaOf(app) ?? app;

  const popoverProps = (app: CatalogApp): PopoverProps | null => {
    if (!popover || popover.appId !== app.id) return null;
    const via = viaOf(app);
    const target = via ?? app;
    const s = shows[target.id];
    return {
      app,
      mode: popover.mode,
      via,
      show: s && !("error" in s) ? s : null,
      showError: s && "error" in s ? s.error : null,
      prepared: prepared[target.id] ?? null,
      onConfirm: () => {
        settleApproval(true);
        confirm();
      },
      onClose: () => {
        settleApproval(false);
        setPopover(null);
      },
    };
  };

  const pill = (app: CatalogApp) => pillFor(app, installed[app.id], itemFor(queue, targetOf(app).id));

  return {
    installed,
    installedError,
    checking,
    /** "Update apps automatically" is on (Settings › Apps; off by default). */
    autoUpdate,
    refresh,
    library,
    queue,
    jobs,
    recipes,
    byId,
    popoverOpen: !!popover || !!bulk,
    pill,
    item: (app: CatalogApp) => itemFor(queue, targetOf(app).id),
    job: (app: CatalogApp) => jobs[targetOf(app).id] ?? null,
    primary,
    cancel: (app: CatalogApp) => cancelId(targetOf(app).id),
    cancelId,
    get: (app: CatalogApp) => primary(app, pill(app)),
    uninstall: (app: CatalogApp) => openPopover(app, "uninstall"),
    reveal: (app: CatalogApp) => void revealApp(app.id).catch(oops(`show ${app.name} in its folder`)),
    undoSetup: (app: CatalogApp) =>
      void revertRecipe(app.id).then(() => toast.success(`Lens setup for ${app.name} undone.`), oops(`undo the Lens setup for ${app.name}`)),
    popoverProps,
    runId: (appId: string) => byId[appId] && openPopover(byId[appId], "run"),
    dismiss: (appId: string) => dispatch({ type: "dismiss", appId }),
    applySetup: (appId: string, chosen: number[]) => {
      applyRecipe(appId, chosen).catch(oops(`set up ${byId[appId]?.name ?? "that app"} with Lens`));
      dispatch({ type: "setupDone", appId });
    },
    skipSetup: (appId: string) => dispatch({ type: "setupDone", appId }),
    // Update all
    updatable: updatable(library, queue),
    bulk,
    askUpdateAll: () => {
      const rows = updatable(library, queue);
      if (!rows.length) return;
      setPopover(null);
      setBulk(rows);
    },
    confirmUpdateAll: () => {
      settleBulk(true);
      confirmBulk();
    },
    cancelUpdateAll: () => {
      settleBulk(false);
      setBulk(null);
    },
  };
}

export type Ctl = ReturnType<typeof useAppsController>;
