export type RecordingPhase = "idle" | "permission" | "recording" | "preview" | "saving" | "saved";

export function recordingTimerShouldRun(phase: RecordingPhase): boolean {
  return phase === "recording";
}

export function recordingNeedsDiscardConfirm(phase: RecordingPhase): boolean {
  return phase === "recording" || phase === "preview";
}

export function takeListOmitsMediaUrl(take: { mediaUrl: string | null; downloadUrl: string | null }): boolean {
  return take.mediaUrl == null && take.downloadUrl == null;
}

export function studioRecordGate(input: { hasReadyScript: boolean; hasDraft: boolean }): "ok" | "no-script" | "draft-open" {
  if (!input.hasReadyScript) return "no-script";
  if (input.hasDraft) return "draft-open";
  return "ok";
}
