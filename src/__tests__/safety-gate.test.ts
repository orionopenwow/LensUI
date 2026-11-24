// Fable wave 1: one safety gate. The pure pieces of the frontend side: the PendingAction →
// shared-card mapping for requests raised inside Lens, the safety-flag banner logic, the Lens
// Apps card and the hook status line.
import { describe, expect, test } from "bun:test";
import { fromPendingAction, isLocalKind, needsHold, requestForProposal, type ApprovalPreview } from "../approval/model";
import { acceptFlag, flagTitle, mergeFlags, type SafetyFlag } from "../agentsafe/SafetyFlags";
import { appApprovalPreview, approvalReference, approvalText } from "../apps/approval";
import { requestForEntry } from "../bridge/BridgeInbox";
import { hookStatusLine } from "../components/HookStatus";
import { threadReducer } from "../command/thread";

const card: ApprovalPreview = {
  question: "Set volume to 100%?",
  verb: "Allow",
  kind: "none",
  details: [],
  reversible: true,
  risk: "low",
  holdToConfirm: false,
  capabilities: [],
  source: { client: "internal", kind: "internal", label: "Lens" },
  safetyReasons: [{ code: "origin.untrusted", severity: "low", detail: "Planned after reading text you attached, so Lens checks with you first" }],
};

describe("PendingAction → the shared approval card", () => {
  test("an assistant step keeps its own card, its reference and its reasons", () => {
    const r = fromPendingAction({ id: "lens-1", kind: "ai", tool: "set_volume", text: "Set volume to 100%", client: "Lens", createdMs: 5, reference: "ai-9-r0-0", preview: card });
    expect(r.origin).toBe("ai");
    expect(r.reference).toBe("ai-9-r0-0");
    expect(r.source).toBe("Lens");
    expect(r.preview.question).toBe("Set volume to 100%?");
    expect(r.preview.safetyReasons?.[0].code).toBe("origin.untrusted");
    expect(needsHold(r.preview)).toBe(false);
  });

  test("an MCP request is unchanged: its Lens Control preview or the fallback card", () => {
    const withPreview = fromPendingAction({ id: "lens-2", kind: "tool", tool: "lens_set", text: "Change 2 settings", client: "Claude Desktop", createdMs: 1 }, { ...card, source: { client: "Claude Desktop", kind: "claude", label: "Claude" } });
    expect(withPreview.origin).toBe("mcp");
    expect(withPreview.source).toBe("Claude");
    expect(withPreview.reference).toBeUndefined();
    const bare = fromPendingAction({ id: "lens-3", kind: "nl", tool: "run_action", text: "tidy my desktop", client: "Cursor", createdMs: 1 });
    expect(bare.origin).toBe("mcp");
    expect(bare.preview.question).toBe("tidy my desktop?");
    expect(bare.preview.risk).toBe("confirm");
    expect(needsHold(bare.preview)).toBe(true);
  });

  test("bridge and Lens Apps requests map to their own origins", () => {
    const bridge = fromPendingAction({ id: "lens-4", kind: "bridge", tool: "summarize", args: { useClipboard: true }, text: "Send this to Lens AI (summarize)", client: "Browser", createdMs: 1, reference: "b-7" });
    expect(bridge.origin).toBe("bridge");
    expect(bridge.wantsClipboard).toBe(true);
    expect(bridge.preview.risk).toBe("low");
    const app = fromPendingAction({ id: "lens-5", kind: "app", tool: "apps_get", text: "Get Notepad++", client: "Lens Apps", createdMs: 1, reference: "app:npp:get" });
    expect(app.origin).toBe("app");
    expect(app.wantsClipboard).toBeUndefined();
    expect(isLocalKind("ai") && isLocalKind("bridge") && isLocalKind("app")).toBe(true);
    expect(isLocalKind("tool") || isLocalKind("nl") || isLocalKind(undefined)).toBe(false);
  });

  test("a malformed preview from the queue falls back instead of rendering nothing", () => {
    const r = fromPendingAction({ id: "x", kind: "ai", tool: "t", text: "Close Word", client: "", createdMs: 1, reference: "c", preview: {} as ApprovalPreview });
    expect(r.preview.question).toBe("Close Word?");
    expect(r.source).toBe("Lens");
  });

  test("a proposal draws the same card before its queue record arrives", () => {
    const r = requestForProposal({ call_id: "ai-1-r0-0", tool: "close_app", args: { name: "word" }, summary: "Close word.", risk: "confirm", safety: card.safetyReasons }, 42);
    expect(r).toMatchObject({ id: "proposal-ai-1-r0-0", origin: "ai", reference: "ai-1-r0-0", createdMs: 42 });
    expect(r.preview.question).toBe("Close word?");
    expect(r.preview.details).toEqual([{ label: "name", value: "word" }]);
    expect(r.preview.safetyReasons?.length).toBe(1);
    const consent = requestForProposal({ call_id: "ai-1-consent", tool: "send_to_cloud", args: { provider: "claude", label: "Claude (Anthropic)", model: "m", fields: ["selection"] }, summary: "Send your request to Claude?", risk: "confirm" });
    expect(consent.preview.verb).toBe("Send");
    expect(consent.preview.denyLabel).toBe("Don't send");
    expect(consent.preview.noUndoLine).toBe(true);
    expect(consent.preview.details.map((d) => d.label)).toEqual(["label", "model"]);
    expect(requestForProposal({ call_id: "c", tool: "set_volume", summary: "", risk: "blocked" }).preview.risk).toBe("blocked");
  });

  test("the bridge inbox draws the shared card for a waiting request", () => {
    const entry = {
      id: "b-7", state: "pending", needsConfirmation: true, text: "", engine: null, error: null, createdMs: 9, jobId: null,
      request: { action: "summarize", origin: "browser", selection: "hello world", url: "https://example.com/a", useClipboard: true } as never,
    };
    const r = requestForEntry(entry as never);
    expect(r).toMatchObject({ origin: "bridge", reference: "b-7", wantsClipboard: true, source: "Browser" });
    expect(r.preview.verb).toBe("Send");
    expect(r.preview.denyLabel).toBe("Decline");
    expect(r.preview.details.map((d) => d.value)).toContain("example.com");
    expect(needsHold(r.preview)).toBe(false);
  });

  test("Lens Apps confirmations become a card; an unsigned installer needs a hold", () => {
    const app = { id: "npp", name: "Notepad++", license: "GPL-3.0", install: { method: "winget", wingetId: "Notepad++.Notepad++" } } as never;
    expect(approvalReference("npp", "get")).toBe("app:npp:get");
    expect(approvalText(app, "uninstall")).toBe("Uninstall Notepad++");
    const get = appApprovalPreview(app, "get");
    expect(get.question).toBe("Get Notepad++?");
    expect(get.details[0]).toEqual({ label: "Source", value: "winget · Notepad++.Notepad++" });
    expect(get.risk).toBe("low");
    expect(needsHold(get)).toBe(false);
    const gh = { id: "x", name: "Tool", license: "MIT", install: { method: "githubRelease", repo: "a/b" } } as never;
    const unsigned = appApprovalPreview(gh, "run", { fileName: "setup.exe", checksum: "none", signatureStatus: "NotSigned", publisher: null } as never);
    expect(unsigned.question).toBe("Run the installer for Tool?");
    expect(unsigned.risk).toBe("confirm");
    expect(needsHold(unsigned)).toBe(true);
    const signed = appApprovalPreview(gh, "run", { fileName: "setup.exe", checksum: "verified", signatureStatus: "Valid", publisher: "Acme" } as never);
    expect(signed.risk).toBe("low");
    expect(signed.details.find((d) => d.label === "Signature")?.value).toBe("signed · Acme");
    expect(appApprovalPreview(app, "uninstall").reversible).toBe(false);
  });
});

describe("safety flags → SafetyBanner", () => {
  const flag = (over: Partial<SafetyFlag> = {}): SafetyFlag => ({
    id: "ai-1", source: "context", label: "page text", verdict: "block", setAside: 2,
    reasons: [{ code: "inject.hidden_instructions", severity: "high", detail: "This content contains instructions aimed at the AI." }],
    ...over,
  });

  test("a surface only shows flags for its own sources", () => {
    expect(acceptFlag(flag(), ["context", "step"])?.label).toBe("page text");
    expect(acceptFlag(flag({ source: "browser" }), ["context", "step"])).toBeNull();
    expect(acceptFlag(flag({ source: "snip", label: "screenshot text" }), ["snip"])?.setAside).toBe(2);
  });

  test("junk payloads and empty flags are ignored", () => {
    expect(acceptFlag(null, ["context"])).toBeNull();
    expect(acceptFlag("x", ["context"])).toBeNull();
    expect(acceptFlag({ source: "context" }, ["context"])).toBeNull();
    expect(acceptFlag({ source: "context", reasons: [{ detail: "" }], setAside: 0 }, ["context"])).toBeNull();
    const loose = acceptFlag({ source: "step", reasons: [{ code: "x", severity: "low", detail: "why" }], label: "  ", verdict: "weird", setAside: "3" }, ["step"]);
    expect(loose).toMatchObject({ id: "", label: "this content", verdict: "ask", setAside: 3 });
  });

  test("the newest flag leads, one banner per source and label, at most three", () => {
    let list: SafetyFlag[] = [];
    list = mergeFlags(list, flag({ label: "clipboard" }));
    list = mergeFlags(list, flag({ label: "page text" }));
    list = mergeFlags(list, flag({ label: "clipboard", setAside: 5 }));
    expect(list.map((f) => f.label)).toEqual(["clipboard", "page text"]);
    expect(list[0].setAside).toBe(5);
    for (const l of ["a", "b", "c"]) list = mergeFlags(list, flag({ label: l }));
    expect(list.map((f) => f.label)).toEqual(["c", "b", "a"]);
  });

  test("the headline says what happened in plain words", () => {
    expect(flagTitle(flag())).toBe("Lens set aside text the AI shouldn't follow");
    expect(flagTitle(flag({ setAside: 0 }))).toBe("This text tries to instruct the AI");
    expect(flagTitle(flag({ setAside: 0, source: "step" }))).toBe("Lens stopped a step");
    expect(flagTitle(flag({ setAside: 0, verdict: "ask" }))).toBe("Lens is checking with you first");
  });
});

describe("Command thread and hook status", () => {
  test("a step the gate refused lands as denied, with the gate's own words", () => {
    const base = { id: "r", call_id: "c1", tool: "set_volume", args: {}, summary: "Set volume to 100%" };
    const stopped = threadReducer([], { type: "proposal", ts: 1, proposal: { ...base, risk: "blocked", safety: [{ code: "inject.step_blocked", severity: "critical", detail: "hides instructions" }] } as never });
    expect(stopped[0]).toMatchObject({ kind: "tool", state: "denied", message: "Lens stopped this step." });
    const never = threadReducer([], { type: "proposal", ts: 1, proposal: { ...base, risk: "blocked" } as never });
    expect(never[0]).toMatchObject({ state: "denied", message: "Lens never runs this kind of action." });
    const waits = threadReducer([], { type: "proposal", ts: 1, proposal: { ...base, risk: "confirm" } as never });
    expect(waits[0]).toMatchObject({ state: "pending" });
  });

  test("the hook status line only speaks when the switch is on", () => {
    expect(hookStatusLine(null)).toBe("");
    expect(hookStatusLine({ wanted: false, installed: false })).toBe("");
    expect(hookStatusLine({ wanted: true, installed: true })).toBe("In use now.");
    expect(hookStatusLine({ wanted: true, installed: false })).toContain("Paused");
  });
});
