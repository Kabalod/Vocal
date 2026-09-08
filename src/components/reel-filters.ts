export const RECORDING_FILTERS = [
  { id: "all", label: "Все" },
  { id: "open", label: "Не завершена" },
  { id: "in_progress", label: "В работе" },
  { id: "completed", label: "Успешно завершена" },
] as const;

export const MORE_RECORDING_FILTERS = [
  { id: "idea", label: "Идея" },
  { id: "ready_to_record", label: "Готов к записи" },
  { id: "archived", label: "Архив" },
] as const;

export type RecordingFilterId =
  | (typeof RECORDING_FILTERS)[number]["id"]
  | (typeof MORE_RECORDING_FILTERS)[number]["id"];

export function isRecordingFilterId(value: string): value is RecordingFilterId {
  return [...RECORDING_FILTERS, ...MORE_RECORDING_FILTERS].some((item) => item.id === value);
}
