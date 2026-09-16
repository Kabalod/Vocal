import { VOCAL_USER_STATUSES } from "@/components/vocal-ui/kit";
import { decidePortraitComplete } from "@/lib/profile-portrait";
import { studioRecordGate } from "@/lib/recording-session";
import type { ProfileFieldValue } from "@/types/profile";

/** Canon P13–P16 map onto later R phases. This file is only R1 data contracts. */
export const P13_P16_TO_R_PHASE = {
  P13: "R6",
  P14: "R3+R4",
  P15: "R5+R8",
  P16: "R7",
} as const;

export function productUserStatusLabels(): readonly string[] {
  return VOCAL_USER_STATUSES.map((item) => item.label);
}

export function finalsStayIndependent(input: {
  before: { finalTakeId: string | null; finalScriptId: string | null };
  after: { finalTakeId: string | null; finalScriptId: string | null };
  changed: "take" | "script";
}): boolean {
  if (input.changed === "take") return input.before.finalScriptId === input.after.finalScriptId;
  return input.before.finalTakeId === input.after.finalTakeId;
}

export function unfinishedAmendPublishesPortrait(fields: ProfileFieldValue[]): boolean {
  return decidePortraitComplete({
    fields,
    modelComplete: true,
    mode: "amend",
    hasChange: false,
    noChange: false,
    kind: "ready",
    openQuestions: [],
  });
}

export function scriptlessRecordingAllowed(): boolean {
  return studioRecordGate({ hasReadyScript: false, hasDraft: false }) === "ok";
}
