export const DIALOGUE_ROLES = ["user", "assistant", "system"] as const;
export const DIALOGUE_KINDS = [
  "text",
  "question",
  "answer",
  "review",
  "script_proposal",
  "processing",
  "error",
] as const;

export type DialogueRole = (typeof DIALOGUE_ROLES)[number];
export type DialogueKind = (typeof DIALOGUE_KINDS)[number];

export type DialogueMessageDto = {
  id: string;
  role: DialogueRole;
  kind: DialogueKind;
  body: string;
  createdAt: string;
  status: "pending" | "done" | "error";
  voice: { durationLabel: string } | null;
  proposal: { transferred: boolean; scriptVersionId: string | null; versionLabel: string | null } | null;
  source: { type: string; id: string } | null;
};

export type DialoguePageDto = {
  threadId: string;
  messages: DialogueMessageDto[];
  nextCursor: string | null;
  analyzing: boolean;
};
