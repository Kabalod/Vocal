export const STUDIO_PANELS = [
  { id: "vocal", label: "Vocal" },
  { id: "takes", label: "Дубли" },
  { id: "context", label: "Контекст" },
  { id: "compare", label: "Сравнение" },
] as const;

export type StudioPanelId = (typeof STUDIO_PANELS)[number]["id"];

export function isStudioPanelId(value: string): value is StudioPanelId {
  return STUDIO_PANELS.some((item) => item.id === value);
}
