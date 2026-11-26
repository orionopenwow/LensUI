// Step-bound approvals, frontend half: the UI can only hand back a token Lens Core issued for a
// card; there is no flag that approves a step. The refusals themselves (wrong, expired, replayed
// token) are Rust tests: agentsafe/step_token.rs, browser/gating.rs, ai/tests.rs, tests/win_mcp.rs.
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { _resetStepTokens, confirmArgs, forgetStepToken, rememberStepToken, takeStepToken } from "../ai/stepTokens";
import { actRequest } from "../browser/api";
import { fromPendingAction, requestForProposal } from "../approval/model";

const src = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const rust = (p: string) => readFileSync(join(import.meta.dir, "..", "..", "src-tauri", "src", p), "utf8");

describe("step tokens (frontend)", () => {
  beforeEach(() => _resetStepTokens());

  test("a token is handed back once, for its own step", () => {
    rememberStepToken("call-1", "tok-a");
    rememberStepToken("call-2", "tok-b");
    expect(takeStepToken("call-1")).toBe("tok-a");
    expect(takeStepToken("call-1")).toBeNull();
    expect(takeStepToken("call-2")).toBe("tok-b");
    expect(takeStepToken("call-3")).toBeNull();
  });

  test("a later card for the same step replaces the token; junk is ignored", () => {
    rememberStepToken("c", "old");
    rememberStepToken("c", "new");
    rememberStepToken("c", "");
    rememberStepToken("c", undefined);
    rememberStepToken("", "x");
    expect(takeStepToken("c")).toBe("new");
    rememberStepToken("d", "t");
    forgetStepToken("d");
    expect(takeStepToken("d")).toBeNull();
  });

  test("the store is bounded", () => {
    for (let i = 0; i < 80; i++) rememberStepToken(`c${i}`, `t${i}`);
    expect(takeStepToken("c0")).toBeNull();
    expect(takeStepToken("c79")).toBe("t79");
  });

  test("approving sends the step's token; declining never does", () => {
    rememberStepToken("c1", "tok-1");
    expect(confirmArgs("c1", true)).toEqual({ callId: "c1", approve: true, token: "tok-1" });
    // Used up.
    expect(confirmArgs("c1", true)).toEqual({ callId: "c1", approve: true, token: null });
    rememberStepToken("c2", "tok-2");
    expect(confirmArgs("c2", false)).toEqual({ callId: "c2", approve: false, token: null });
    expect(takeStepToken("c2")).toBeNull();
    // An explicit token (from the event itself) wins over a remembered one.
    rememberStepToken("c3", "stale");
    expect(confirmArgs("c3", true, "fresh").token).toBe("fresh");
  });

  test("the browser agent's request has no approval flag, only a token", () => {
    const first = actRequest({ element: 7, action: { do: "submit", target: {} } as never });
    expect(first).toEqual({ tab: null, element: 7, action: { do: "submit", target: {} }, caps: null, approvalToken: null });
    expect("approved" in first).toBe(false);
    const again = actRequest({ element: 7, action: { do: "submit", target: {} } as never, approvalToken: "abc" });
    expect(again.approvalToken).toBe("abc");
    // A stray flag from a caller is not forwarded.
    const sneaky = actRequest({ element: 7, action: { do: "click", target: {} } as never, approved: true } as never);
    expect(JSON.stringify(sneaky)).not.toContain("approved");
  });

  test("queue records and proposals carry their token onto the card", () => {
    const a = { id: "lens-1", kind: "tool", tool: "close_app", text: "Close Word", client: "Claude", createdMs: 1, token: "t-queue" };
    expect(fromPendingAction(a).token).toBe("t-queue");
    expect("token" in fromPendingAction({ ...a, token: undefined })).toBe(false);
    const p = { call_id: "r-0", tool: "close_app", summary: "Close Word", risk: "confirm", approval_token: "t-ai" };
    expect(requestForProposal(p).token).toBe("t-ai");
    expect("token" in requestForProposal({ ...p, approval_token: undefined })).toBe(false);
  });

  test("no surface approves with a bare flag", () => {
    // Every approval command call site sends the token.
    expect(src("approval/api.ts")).toContain('invoke<PendingAction>("approve_mcp_action_cmd", { id, token: token ?? null })');
    expect(src("components/McpCard.tsx")).toContain("token: a.token ?? null");
    expect(src("ai/client.ts")).toContain('invoke<void>("ai_confirm_tool", confirmArgs(callId, approve, token))');
    expect(src("browser/AgentPanel.tsx")).toContain("approvalToken: res.approvalToken");
    expect(src("browser/AgentPanel.tsx")).not.toContain("approved: true");
  });

  test("Lens Core has no boolean approval left on the agent paths", () => {
    const browser = rust("commands/browser.rs");
    expect(browser).not.toContain("pub approved: bool");
    expect(browser).not.toContain("req.approved");
    expect(browser).toContain("check_or_issue(&binding, req.approval_token.as_deref()");
    // The assistant's runner redeems the token right before the tool runs.
    const ai = rust("ai/mod.rs");
    expect(ai).toContain("step_token::store().redeem(Some(&offered), &w.binding");
    // The shared queue takes a token to approve.
    expect(rust("win_mcp.rs")).toContain("pub fn approve_action(id: &str, token: Option<&str>, host: &dyn McpHost)");
    // MCP clients are told the id and status of a queued request, never its token.
    expect(rust("win_mcp.rs")).toContain('Some(json!({ "status": a.status, "id": a.id }))');
  });
});
