// Tauri bridge for approvals: MCP queue, Lens Control previews and grants.
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fromPendingAction, isLocalKind, type ApprovalPreview, type ApprovalRequest, type PendingActionLike } from "./model";

type PendingAction = PendingActionLike & { kind: string; args: unknown; status: string; result: string };

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
    // Requests raised inside Lens carry their card; MCP tool calls get theirs from Lens Control.
    pending.map(async (a) => fromPendingAction(a, a.kind === "tool" && !isLocalKind(a.kind) ? await previewFor(a.tool, a.args, a.client) : null))
  );
}

/** Approves one queued request. `token` is that request's own one-time token (`ApprovalRequest.token`);
 *  Lens Core refuses the approval without it, so a card can only approve what it showed. */
export async function approveMcp(id: string, token?: string | null): Promise<boolean> {
  const r = await invoke<PendingAction>("approve_mcp_action_cmd", { id, token: token ?? null });
  return r.status === "done" || r.status === "approved";
}

export function denyMcp(id: string): Promise<unknown> {
  return invoke("decline_mcp_action_cmd", { id }).catch(() => undefined);
}

/** Approves any request on the shared card. A bridge request that asked for the clipboard is
 *  confirmed through the bridge itself, so this click is the one that reads the clipboard. */
export async function approveRequest(req: ApprovalRequest): Promise<boolean> {
  if (req.origin === "bridge" && req.wantsClipboard && req.reference) {
    const clipboard = await navigator.clipboard.readText().catch(() => null);
    await invoke("bridge_confirm", { id: req.reference, clipboard: clipboard || null });
    return true;
  }
  return approveMcp(req.id, req.token);
}

/** Lens Apps: put a confirmation this surface is showing on the shared card too. */
export function openLocalApproval(reference: string, tool: string, text: string, source: string, preview: ApprovalPreview): Promise<unknown> {
  return invoke("approval_local_open", { reference, tool, text, source, preview }).catch(() => undefined);
}

export function closeLocalApproval(reference: string, ok: boolean, message?: string): Promise<unknown> {
  return invoke("approval_local_close", { reference, ok, message: message ?? null }).catch(() => undefined);
}

/** Every queue record (any status) for a local request, newest first. */
export async function localRecord(reference: string): Promise<{ id: string; status: string } | null> {
  const list = await invoke<PendingAction[]>("list_mcp_actions_cmd").catch(() => [] as PendingAction[]);
  const hit = (Array.isArray(list) ? list : []).find((a) => a.reference === reference);
  return hit ? { id: hit.id, status: hit.status } : null;
}

/** The hotkey that opens the approval window, as shown on the pill, once Lens has registered one. */
export function useApprovalHotkey(): string | undefined {
  const [key, setKey] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    invoke<string | null>("approval_hotkey")
      .then((k) => alive && setKey(k || undefined))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return key;
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
