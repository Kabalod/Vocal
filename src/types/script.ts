export const SCRIPT_KINDS = ["manual", "restore", "ai_proposal", "accepted_ai"] as const;
export type ScriptKind = (typeof SCRIPT_KINDS)[number];

export const SCRIPT_HEAD_KINDS: ScriptKind[] = ["manual", "restore", "accepted_ai"];

export const SCRIPT_SOURCE_TYPES = ["transcript", "answer", "note", "script"] as const;
export type ScriptSourceType = (typeof SCRIPT_SOURCE_TYPES)[number];

export const SCRIPT_BODY_MAX = 20000;
export const SCRIPT_PROMPT_VERSION = "script-v1";

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
  const transcript = sources.find((item) => item.type === "transcript");
  if (transcript) {
    const numbered = takeNumberByTranscriptId?.get(transcript.id);
    if (typeof numbered === "number") return `Из дубля №${numbered}`;
    const match = transcript.label?.match(/№\s*(\d+)/);
    if (match) return `Из дубля №${match[1]}`;
  }
  return "Создана вами";
}
