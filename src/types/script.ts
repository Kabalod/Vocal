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

export function emptyRecording(): RecordingCardDto {
  return { opening: "", supports: "", example: "", ending: "" };
}

export function isScriptKind(value: string): value is ScriptKind {
  return (SCRIPT_KINDS as readonly string[]).includes(value);
}

export function isHeadKind(kind: string): boolean {
  return SCRIPT_HEAD_KINDS.includes(kind as ScriptKind);
}
