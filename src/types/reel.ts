export const REEL_STATUSES = [
  "idea",
  "in_progress",
  "ready_to_record",
  "completed",
  "archived",
] as const;
export type ReelStatus = (typeof REEL_STATUSES)[number];

export const REEL_STATUS_LABELS: Record<ReelStatus, string> = {
  idea: "Идея",
  in_progress: "В работе",
  ready_to_record: "Готов к записи",
  completed: "Завершён",
  archived: "Архив",
};

export const TAKE_INPUT_TYPES = ["video", "audio", "text"] as const;
export type TakeInputType = (typeof TAKE_INPUT_TYPES)[number];

const LEGACY_STATUS: Record<string, ReelStatus> = {
  draft: "idea",
  active: "in_progress",
};

export function isReelStatus(value: string): value is ReelStatus {
  return (REEL_STATUSES as readonly string[]).includes(value);
}

export function normalizeReelStatus(value: string): ReelStatus {
  if (isReelStatus(value)) return value;
  return LEGACY_STATUS[value] ?? "idea";
}

export function parseReelStatusInput(value: string): ReelStatus | null {
  if (isReelStatus(value)) return value;
  return LEGACY_STATUS[value] ?? null;
}

export function isTakeInputType(value: string): value is TakeInputType {
  return (TAKE_INPUT_TYPES as readonly string[]).includes(value);
}

export const REEL_TITLE_MAX = 200;
export const REEL_NOTE_MAX = 8000;
export const REEL_LIST_LIMIT = 80;

export interface TakeJobRef {
  id: string;
  status: string;
}

export interface TakeDto {
  id: string;
  reelId: string;
  number: number;
  inputType: TakeInputType;
  authorNote: string;
  createdAt: string;
  jobs: TakeJobRef[];
}

export interface ReelDto {
  id: string;
  title: string;
  initialNote: string;
  status: ReelStatus;
  selectedTakeId: string | null;
  createdAt: string;
  updatedAt: string;
  takes: TakeDto[];
  takeCount: number;
  hasScript: boolean;
}

export interface CreateReelInput {
  title: string;
  initialNote?: string;
}

export interface UpdateReelInput {
  title?: string;
  initialNote?: string;
  status?: ReelStatus;
  selectedTakeId?: string | null;
  expectedUpdatedAt?: string;
}

export interface CreateTakeInput {
  inputType: TakeInputType;
  authorNote?: string;
  idempotencyKey?: string;
  jobId?: string;
}

export interface ReelListQuery {
  q?: string;
  status?: ReelStatus | "all" | "open";
  sort?: "updated" | "created" | "title";
  limit?: number;
}
