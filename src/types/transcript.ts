export const TRANSCRIPT_KINDS = ["original", "edit"] as const;
export type TranscriptKind = (typeof TRANSCRIPT_KINDS)[number];

export const TRANSCRIPT_SOURCES = ["stt", "manual", "payload_import"] as const;
export type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];

export interface TranscriptSegmentDto {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptRevisionDto {
  id: string;
  takeId: string;
  kind: TranscriptKind;
  source: TranscriptSource;
  text: string;
  segments: TranscriptSegmentDto[] | null;
  language: string | null;
  sttModel: string | null;
  parentId: string | null;
  createdAt: string;
}

export interface TranscriptBundleDto {
  takeId: string;
  selectedId: string | null;
  originalId: string | null;
  revisions: TranscriptRevisionDto[];
  timestampsBelongToOriginal: true;
}
