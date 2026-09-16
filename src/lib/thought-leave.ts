export type ThoughtLeaveKind = "none" | "discard-local" | "abort-upload" | "saved-continue";

export const ABORT_UPLOAD_LEAVE_TEXT =
  "Загрузка будет прервана. Если запрос уже ушёл на сервер, мысль могла успеть создаться.";

export function thoughtLeaveKind(input: {
  voiceDirty: boolean;
  uploading: boolean;
  reelId: string | null;
}): ThoughtLeaveKind {
  if (input.reelId) return "saved-continue";
  if (input.uploading) return "abort-upload";
  if (input.voiceDirty) return "discard-local";
  return "none";
}

export function syncThoughtUploadToSheetVisibility(
  input: { open: boolean; unmounting?: boolean },
  upload: { abort: () => void } | null | undefined,
): "aborted" | "kept" {
  if (input.unmounting || !input.open) {
    upload?.abort();
    return "aborted";
  }
  return "kept";
}
