// Step-bound approvals, frontend half (docs/AGENT_SAFETY.md "Step tokens").
//
// When Lens Core shows a step that needs your OK, it issues a one-time token bound to that exact
// step (request, call, tool, arguments). Approving sends the token back; Core refuses the step
// without it. This module only remembers which token came with which card. It cannot make one:
// tokens are random and live in Core, so nothing here can approve a step Core didn't show.
// Pure (no React, no Tauri) so it is unit-tested.

const MAX = 64;
const tokens = new Map<string, string>();

/** Remembers the token that came with a card. Later tokens for the same step replace earlier ones. */
export function rememberStepToken(stepId: string, token: string | null | undefined): void {
  if (!stepId || typeof token !== "string" || !token) return;
  tokens.delete(stepId);
  tokens.set(stepId, token);
  while (tokens.size > MAX) {
    const oldest = tokens.keys().next().value;
    if (oldest === undefined) break;
    tokens.delete(oldest);
  }
}

/** The token for a step, removed as it is read: an approval is sent once. */
export function takeStepToken(stepId: string): string | null {
  const t = tokens.get(stepId) ?? null;
  tokens.delete(stepId);
  return t;
}

/** Forgets a step that was declined or went away. */
export function forgetStepToken(stepId: string): void {
  tokens.delete(stepId);
}

/** What `ai_confirm_tool` is called with. Declining never carries a token. */
export function confirmArgs(callId: string, approve: boolean, token?: string | null): { callId: string; approve: boolean; token: string | null } {
  const remembered = takeStepToken(callId);
  return { callId, approve, token: approve ? (token || remembered) : null };
}

export function _resetStepTokens(): void {
  tokens.clear();
}
