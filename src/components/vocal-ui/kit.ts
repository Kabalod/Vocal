export const VOCAL_USER_STATUSES = [
  { id: "open", label: "Не завершена" },
  { id: "in_progress", label: "В работе" },
  { id: "completed", label: "Успешно завершена" },
] as const;

export type VocalUserStatusId = (typeof VOCAL_USER_STATUSES)[number]["id"];

export const VOCAL_FILTERS = [
  { id: "all", label: "Все" },
  ...VOCAL_USER_STATUSES,
] as const;

export function isDevUiEnabled(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production";
}
