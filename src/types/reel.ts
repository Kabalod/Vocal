export const REEL_STATUSES = ["draft", "active", "archived"] as const;
export type ReelStatus = (typeof REEL_STATUSES)[number];

export const TAKE_INPUT_TYPES = ["video", "audio", "text"] as const;
export type TakeInputType = (typeof TAKE_INPUT_TYPES)[number];

export function isReelStatus(value: string): value is ReelStatus {
  return (REEL_STATUSES as readonly string[]).includes(value);
}

export function isTakeInputType(value: string): value is TakeInputType {
  return (TAKE_INPUT_TYPES as readonly string[]).includes(value);
}

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
}

export interface CreateTakeInput {
  inputType: TakeInputType;
  authorNote?: string;
  idempotencyKey?: string;
  jobId?: string;
}
