export function newScriptGenerateKey() {
  return `script-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ScriptGenerateFaultKind = "conflict" | "error" | "inflight";

export type ScriptGenerateKeyState = {
  postedKey: string;
  nextExplicitKey: string;
};

export function beginScriptGeneratePost(state: ScriptGenerateKeyState, explicitKey?: string): ScriptGenerateKeyState {
  const key = explicitKey ?? state.nextExplicitKey;
  return { postedKey: key, nextExplicitKey: key };
}

export function applyScriptGenerateResult(
  state: ScriptGenerateKeyState,
  input: { ok: boolean; code?: string | null; networkError?: boolean; makeKey: () => string },
): { state: ScriptGenerateKeyState; fault: ScriptGenerateFaultKind | null } {
  if (input.ok) {
    const next = input.makeKey();
    return { state: { postedKey: state.postedKey, nextExplicitKey: next }, fault: null };
  }
  if (input.code === "AI_INFLIGHT") {
    return { state, fault: "inflight" };
  }
  if (input.code === "SNAPSHOT_CONFLICT" || input.code === "DRAFT_CHANGED") {
    return {
      state: { postedKey: state.postedKey, nextExplicitKey: input.makeKey() },
      fault: "conflict",
    };
  }
  return { state, fault: "error" };
}

export function retryScriptGenerateKey(state: ScriptGenerateKeyState, kind: ScriptGenerateFaultKind | null) {
  if (kind === "conflict") return state.nextExplicitKey;
  return state.postedKey;
}
