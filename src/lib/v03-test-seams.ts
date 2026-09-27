/** Mutable seams for V03 reducer and recovery tests. Production keeps these null. */
export const v03TestSeams = {
  afterUserMessageCreate: null as (() => Promise<void>) | null,
  failThoughtStateApply: null as ((ctx: { reelId: string; turnKey?: string }) => Promise<void>) | null,
  afterAiCallBeforeBind: null as ((ctx: { turnKey: string; callId: string }) => Promise<void>) | null,
  afterClaimBeforeComplete: null as ((ctx: { callId: string; ownerId: string; generation: number }) => Promise<void>) | null,
  beforeCommitDialogueReply: null as ((ctx: { processingId: string; callId: string }) => Promise<void>) | null,
  afterThoughtBeforeEnvelope: null as ((ctx: { callId: string; turnKey: string }) => Promise<void>) | null,
  afterAcceptedAtBeforeCommit: null as ((ctx: { reelId: string; acceptedAt: string }) => Promise<void>) | null,
  dialogueLeaseMs: null as number | null,
  now: null as (() => Date) | null,
};
