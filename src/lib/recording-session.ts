export type RecordingPhase = "idle" | "permission" | "recording" | "preview" | "saving" | "saved";

export function recordingTimerShouldRun(phase: RecordingPhase): boolean {
  return phase === "recording";
}

export function recordingNeedsDiscardConfirm(phase: RecordingPhase): boolean {
  return phase === "recording" || phase === "preview" || phase === "saving";
}

export const ABORT_TAKE_UPLOAD_LEAVE_TEXT =
  "Загрузка будет прервана. Если запрос уже ушёл на сервер, дубль мог успеть сохраниться.";

export function applyLateTakeUploadResult(input: { mounted: boolean; aborted: boolean }): "apply" | "ignore" {
  if (!input.mounted || input.aborted) return "ignore";
  return "apply";
}

export function takeListOmitsMediaUrl(take: { mediaUrl: string | null; downloadUrl: string | null }): boolean {
  return take.mediaUrl == null && take.downloadUrl == null;
}

export function studioRecordGate(input: { hasReadyScript: boolean; hasDraft: boolean }): "ok" | "no-script" | "draft-open" {
  if (!input.hasReadyScript) return "no-script";
  if (input.hasDraft) return "draft-open";
  return "ok";
}

export function studioJobPhase(job: { status: string; stage?: string | null } | null): "saved" | "stt" | "analysis" | "done" | "error" {
  if (!job) return "saved";
  if (job.status === "done") return "done";
  if (job.status === "error") return "error";
  if (job.status === "analyzing" || job.stage === "analyze") return "analysis";
  if (job.status === "transcribing" || job.stage === "stt") return "stt";
  return "saved";
}
