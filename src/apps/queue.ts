// The Get queue: several "Get"s line up and run one at a time (winget allows one install at a time).
// GitHub-release apps download and verify in the queue, then wait for "Run" without holding it up.
// Pure reducer, shared by the UI and tests.
export type QueueOp = "install" | "upgrade" | "uninstall";
export type ItemStatus = "queued" | "running" | "verified" | "done" | "failed" | "cancelled";

export interface QueueItem {
  appId: string;
  op: QueueOp;
  status: ItemStatus;
  /** Job id while running (winget) or the prepared-release token once verified. */
  jobId?: string;
  token?: string;
  message?: string;
  /** Set after a successful install: the recipe checklist is waiting in the tray. */
  setupPending?: boolean;
}

export interface QueueState {
  items: QueueItem[];
}

export const emptyQueue: QueueState = { items: [] };

export type QueueAction =
  | { type: "enqueue"; appId: string; op: QueueOp }
  | { type: "started"; appId: string; jobId?: string }
  | { type: "verified"; appId: string; token: string }
  | { type: "finished"; appId: string; ok: boolean; message?: string }
  | { type: "cancel"; appId: string }
  | { type: "setupDone"; appId: string }
  | { type: "dismiss"; appId: string }
  | { type: "clearFinished" };

const active = (s: ItemStatus) => s === "queued" || s === "running" || s === "verified";

export function itemFor(q: QueueState, appId: string): QueueItem | undefined {
  return q.items.find((i) => i.appId === appId);
}

export function reduceQueue(q: QueueState, a: QueueAction): QueueState {
  const map = (f: (i: QueueItem) => QueueItem) => ({ items: q.items.map((i) => (i.appId === (a as any).appId ? f(i) : i)) });
  switch (a.type) {
    case "enqueue": {
      const existing = itemFor(q, a.appId);
      if (existing && active(existing.status)) return q; // already lined up
      const rest = q.items.filter((i) => i.appId !== a.appId);
      return { items: [...rest, { appId: a.appId, op: a.op, status: "queued" }] };
    }
    case "started":
      return map((i) => ({ ...i, status: "running", jobId: a.jobId, message: undefined }));
    case "verified":
      return map((i) => ({ ...i, status: "verified", token: a.token }));
    case "finished":
      return map((i) => ({ ...i, status: a.ok ? "done" : "failed", message: a.message, setupPending: a.ok && i.op === "install" }));
    case "cancel":
      return map((i) => (active(i.status) ? { ...i, status: "cancelled" } : i));
    case "setupDone":
      return map((i) => ({ ...i, setupPending: false }));
    case "dismiss":
      return { items: q.items.filter((i) => i.appId !== a.appId) };
    case "clearFinished":
      return { items: q.items.filter((i) => active(i.status) || i.setupPending) };
  }
}

/** The next item to start, if nothing is running. Verified releases wait for the user, so they
 *  don't block the queue. */
export function nextToStart(q: QueueState): QueueItem | null {
  if (q.items.some((i) => i.status === "running")) return null;
  return q.items.find((i) => i.status === "queued") ?? null;
}

/** Tray summary: "2 downloading · 1 ready to run". */
export function traySummary(q: QueueState): string {
  const n = (s: ItemStatus) => q.items.filter((i) => i.status === s).length;
  const parts: string[] = [];
  if (n("running")) parts.push(`${n("running")} installing`);
  if (n("queued")) parts.push(`${n("queued")} queued`);
  if (n("verified")) parts.push(`${n("verified")} ready to run`);
  const setup = q.items.filter((i) => i.setupPending).length;
  if (setup) parts.push(`${setup} to set up`);
  if (!parts.length && q.items.length) parts.push("All done");
  return parts.join(" · ");
}

/** What a failed pill should try again: the same thing that failed, as a confirmation mode. */
export function retryMode(op: QueueOp | undefined): "get" | "update" | "uninstall" {
  return op === "upgrade" ? "update" : op === "uninstall" ? "uninstall" : "get";
}
