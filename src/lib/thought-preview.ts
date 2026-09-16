import type { VocalUserStatusId } from "@/components/vocal-ui/kit";
import type { ReelStatus, ReelStatusGroup } from "@/types/reel";
import { normalizeReelStatus, reelStatusGroup } from "@/types/reel";
import { isHeadKind } from "@/types/script";

export function thoughtUserStatus(statusOrGroup: ReelStatus | ReelStatusGroup | string): VocalUserStatusId {
  const group: ReelStatusGroup =
    statusOrGroup === "open" ||
    statusOrGroup === "in_progress" ||
    statusOrGroup === "completed" ||
    statusOrGroup === "archived"
      ? statusOrGroup
      : reelStatusGroup(normalizeReelStatus(statusOrGroup));
  if (group === "completed") return "completed";
  if (group === "in_progress") return "in_progress";
  return "open";
}

export type ThoughtPreviewSource = "script" | "note" | "empty";

export function pickThoughtPreviewFragment(input: {
  initialNote: string;
  finalScriptId: string | null;
  selectedScriptId: string | null;
  versions: Array<{ id: string; kind: string; body: string }>;
}): { text: string; source: ThoughtPreviewSource } {
  const byId = new Map(input.versions.map((row) => [row.id, row]));
  const candidates = [
    input.finalScriptId ? byId.get(input.finalScriptId) : undefined,
    input.selectedScriptId ? byId.get(input.selectedScriptId) : undefined,
    input.versions.find((row) => isHeadKind(row.kind)),
  ];
  for (const row of candidates) {
    const text = row?.body.trim() ?? "";
    if (text) return { text, source: "script" };
  }
  const note = input.initialNote.trim();
  if (note) return { text: note, source: "note" };
  return { text: "", source: "empty" };
}

export function resetThoughtListQuery(): { q: ""; status: "all" } {
  return { q: "", status: "all" };
}
