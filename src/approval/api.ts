// Tauri bridge for approvals: MCP queue, Lens Control previews and grants.
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fromPendingAction, type ApprovalPreview, type ApprovalRequest } from "./model";

interface PendingAction {
  id: string;
  kind: string;
  tool: string;
  args: unknown;
  text: string;
  client: string;
  createdMs: number;
  status: string;
  result: string;
}

export async function previewFor(tool: string, args: unknown, client: string): Promise<ApprovalPreview | null> {
  try {
    return await invoke<ApprovalPreview>("control_preview", { tool, args, client });
  } catch {
    return null;
  }
}

export async function pendingRequests(): Promise<ApprovalRequest[]> {
  const list = await invoke<PendingAction[]>("list_mcp_actions_cmd").catch(() => [] as PendingAction[]);
  const pending = (Array.isArray(list) ? list : []).filter((a) => a.status === "pending");
  return Promise.all(
    pending.map(async (a) => fromPendingAction(a, a.kind === "tool" ? await previewFor(a.tool, a.args, a.client) : null))
  );
}

export async function approveMcp(id: string): Promise<boolean> {
  const r = await invoke<PendingAction>("approve_mcp_action_cmd", { id });
  return r.status === "done" || r.status === "approved";
}

export function denyMcp(id: string): Promise<unknown> {
  return invoke("decline_mcp_action_cmd", { id }).catch(() => undefined);
}

/** "Allow for this session" for a client's capabilities. */
export async function allowForSession(client: string, capabilities: string[]): Promise<void> {
  for (const capability of capabilities) {
    await invoke("control_grants_set", { client, capability, level: "allowed", session: true });
  }
}

/** "Approve similar actions for this task": trust the request's scope for a while. */
export function trustSimilar(client: string, similar: { capability: string; site: string; label: string }, span: "run" | "day" | "always"): Promise<unknown> {
  return invoke("control_trust", { client, capability: similar.capability, site: similar.site, label: similar.label, span });
}

export function undoChange(id?: string): Promise<string> {
  return invoke<string>("control_undo", { id: id ?? null });
}

/** Pending MCP approvals, live. */
export function usePendingApprovals(): { requests: ApprovalRequest[]; refresh: () => void } {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const refresh = useCallback(() => {
    pendingRequests().then(setRequests).catch(() => setRequests([]));
  }, []);
  useEffect(() => {
    refresh();
    const un = listen("lens://mcp-changed", refresh);
    const t = window.setInterval(refresh, 15000);
    return () => {
      un.then((f) => f()).catch(() => undefined);
      window.clearInterval(t);
    };
  }, [refresh]);
  return { requests, refresh };
}
