export type ThoughtLeaveKind = "none" | "discard-local" | "abort-upload" | "saved-continue";

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
