export const SCRIPT_KINDS = ["manual", "restore", "ai_proposal", "accepted_ai", "from_take"] as const;
export type ScriptKind = (typeof SCRIPT_KINDS)[number];

/** from_take is deliberately not a head kind: the base is stored from R1 but shown to the author only from R4. */
export const SCRIPT_HEAD_KINDS: ScriptKind[] = ["manual", "restore", "accepted_ai"];

export const SCRIPT_SOURCE_TYPES = ["transcript", "answer", "note", "script"] as const;
export type ScriptSourceType = (typeof SCRIPT_SOURCE_TYPES)[number];

export const SCRIPT_BODY_MAX = 20000;
export const SCRIPT_PROMPT_VERSION = "script-v05";

export const SCRIPT_TAB_PHASES = [
  "empty",
  "not_ready",
  "ready_to_generate",
  "generating",
  "ready",
  "stale",
  "conflict",
  "error",
] as const;
export type ScriptTabPhase = (typeof SCRIPT_TAB_PHASES)[number];

export interface ScriptNextQuestionDto {
  text: string;
  gapId: string | null;
}

export interface V05WorldSnapshot {
  thoughtStateRevision: number;
  workingTakeId: string | null;
  selectedTranscriptId: string | null;
  lastUserMessageId: string | null;
  lastCorrectionAcceptedAt: string | null;
}

export interface V05GenerateSnapshot extends V05WorldSnapshot {
  ownerUserId: string;
  reelId: string;
  sourceKeys: string[];
  idempotencyKey: string;
  draftId: string | null;
  draftSaveToken: number | null;
  kept?: V05WorldSnapshot | null;
}

export interface RecordingCardDto {
  opening: string;
  supports: string;
  example: string;
  ending: string;
}

export interface ScriptSourceRef {
  type: ScriptSourceType;
  id: string;
  label?: string;
}

export interface ScriptVersionDto {
  id: string;
  reelId: string;
  kind: ScriptKind;
  body: string;
  recording: RecordingCardDto;
  sources: ScriptSourceRef[];
  parentId: string | null;
  contextSnapshotId: string | null;
  model: string | null;
  promptVersion: string | null;
  inventedIdeas: string[];
  createdAt: string;
}

export interface ScriptSourceOption {
  type: ScriptSourceType;
  id: string;
  label: string;
}

export interface ScriptBundleDto {
  reelId: string;
  headId: string | null;
  selectedScriptId: string | null;
  finalScriptId: string | null;
  versions: ScriptVersionDto[];
  sources: ScriptSourceOption[];
}

export interface ScriptVersionMetaDto {
  id: string;
  reelId: string;
  kind: ScriptKind;
  createdAt: string;
  sourceLabel: string;
  number: number | null;
  parentId: string | null;
}

export interface ScriptDraftDto {
  id: string;
  reelId: string;
  body: string;
  sources: ScriptSourceRef[];
  sourceKind: string;
  baseVersionId: string | null;
  sourceLabel: string;
  updatedAt: string;
  saveToken: number;
  stale?: boolean;
}

export interface ScriptWorkspaceDto {
  reelId: string;
  headId: string | null;
  selectedScriptId: string | null;
  finalScriptId: string | null;
  readyCount: number;
  versions: ScriptVersionMetaDto[];
  viewing: ScriptVersionDto | null;
  draft: ScriptDraftDto | null;
  sources: ScriptSourceOption[];
  phase: ScriptTabPhase;
  stale: boolean;
  viewingStale: boolean;
  draftStale: boolean;
  canGenerate: boolean;
  blockReason: string | null;
  /** R4: what the generated version changed and why (human phrases); empty for versions without a record. */
  viewingChanges: string[];
  /** R4: "I understood it like this", built from the thought state without a model call; null when there is nothing to say. */
  understanding: string | null;
  nextQuestion: ScriptNextQuestionDto | null;
}

export function emptyRecording(): RecordingCardDto {
  return { opening: "", supports: "", example: "", ending: "" };
}

export function isScriptKind(value: string): value is ScriptKind {
  return (SCRIPT_KINDS as readonly string[]).includes(value);
}

export function isHeadKind(kind: string): boolean {
  return SCRIPT_HEAD_KINDS.includes(kind as ScriptKind);
}

export function scriptOriginLabel(
  kind: string,
  sources: ScriptSourceRef[],
  takeNumberByTranscriptId?: Map<string, number>,
): string {
  if (kind === "accepted_ai" || kind === "ai_proposal") return "Создана с Vocal";
  if (kind === "from_take") {
    const base = sources.find((item) => item.type === "transcript");
    const numbered = base ? takeNumberByTranscriptId?.get(base.id) ?? Number(base.label?.match(/№\s*(\d+)/)?.[1]) : NaN;
    return Number.isFinite(numbered) ? `Основа из дубля №${numbered}` : "Основа из дубля";
  }
  const transcript = sources.find((item) => item.type === "transcript");
  if (transcript) {
    const numbered = takeNumberByTranscriptId?.get(transcript.id);
    if (typeof numbered === "number") return `Из дубля №${numbered}`;
    const match = transcript.label?.match(/№\s*(\d+)/);
    if (match) return `Из дубля №${match[1]}`;
  }
  return "Создана вами";
}
