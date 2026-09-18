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

export async function settleStudioTakeUpload(input: {
  request: Promise<Response>;
  signal: AbortSignal;
  mounted: () => boolean;
  onSuccess: (jobId: string | null) => void;
}): Promise<"applied" | "ignored" | "failed"> {
  try {
    const res = await input.request;
    const data = (await res.json()) as { error?: string; job?: { id?: string } };
    if (applyLateTakeUploadResult({ mounted: input.mounted(), aborted: input.signal.aborted }) === "ignore") {
      return "ignored";
    }
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить файл.");
    input.onSuccess(typeof data.job?.id === "string" ? data.job.id : null);
    return "applied";
  } catch (error) {
    const aborted =
      input.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    if (applyLateTakeUploadResult({ mounted: input.mounted(), aborted }) === "ignore") {
      return "ignored";
    }
    throw error;
  }
}

export function takeListOmitsMediaUrl(take: { mediaUrl: string | null; downloadUrl: string | null }): boolean {
  return take.mediaUrl == null && take.downloadUrl == null;
}

export function studioRecordGate(input: { hasReadyScript: boolean; hasDraft: boolean }): "ok" | "draft-open" {
  if (input.hasDraft) return "draft-open";
  return "ok";
}

export type StudioRecordDeepLink = "record" | "draft" | "blocked";

export function resolveStudioRecordDeepLink(input: {
  thoughtCompleted: boolean;
  hasReadyScript: boolean;
  hasDraft: boolean;
}): StudioRecordDeepLink {
  if (input.thoughtCompleted) return "blocked";
  if (studioRecordGate({ hasReadyScript: input.hasReadyScript, hasDraft: input.hasDraft }) === "draft-open") {
    return "draft";
  }
  return "record";
}

export function takeProcessRequiresScript(): boolean {
  return false;
}

export function canProcessSavedTake(take: { mediaStatus: string; hasFile: boolean }): boolean {
  return take.mediaStatus === "ready" && take.hasFile;
}

export function studioJobPhase(job: { status: string; stage?: string | null } | null): "saved" | "stt" | "analysis" | "done" | "error" {
  if (!job) return "saved";
  if (job.status === "done") return "done";
  if (job.status === "error") return "error";
  if (job.status === "analyzing" || job.stage === "analyze") return "analysis";
  if (job.status === "transcribing" || job.stage === "stt") return "stt";
  return "saved";
}
