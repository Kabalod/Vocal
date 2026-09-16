export const RECORDING_FILTERS = [
  { id: "all", label: "Все" },
  { id: "idea", label: "Не завершена" },
  { id: "in_progress", label: "В работе" },
  { id: "completed", label: "Успешно завершена" },
] as const;

export type RecordingFilterId = (typeof RECORDING_FILTERS)[number]["id"];

export function isRecordingFilterId(value: string): value is RecordingFilterId {
  return RECORDING_FILTERS.some((item) => item.id === value);
}
