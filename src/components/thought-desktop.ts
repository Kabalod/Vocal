/** Pure helpers of the desktop thought screen (P3a): labels, time stamps, chips. No React, no I/O. */

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Сегодня, 10:42" / "Вчера, 21:05" / "12 октября, 10:42" (with the year when it is not the current one). */
export function formatThoughtStamp(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const days = Math.round((dayStart(now) - dayStart(date)) / 86_400_000);
  if (days === 0) return `Сегодня, ${time}`;
  if (days === 1) return `Вчера, ${time}`;
  const year = date.getFullYear() === now.getFullYear() ? "" : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}, ${time}`;
}

/** The chat shows a centred time label before the first message and after a pause of this length. */
export const DIALOGUE_TIME_GAP_MS = 30 * 60 * 1000;

export function showDialogueTimeLabel(previousIso: string | null, currentIso: string): boolean {
  if (!previousIso) return true;
  const previous = new Date(previousIso).getTime();
  const current = new Date(currentIso).getTime();
  if (Number.isNaN(previous) || Number.isNaN(current)) return false;
  return current - previous >= DIALOGUE_TIME_GAP_MS || dayStart(new Date(previous)) !== dayStart(new Date(current));
}

/**
 * Chips above the composer. Both "don't know" chips go through the ordinary text path of the dialogue: the server recognises the
 * text as "не знаю" (turn-policy `isDontKnow`, author-speech `startsWithDontKnow`), takes no fact from it and closes the
 * topic (G1). Each chip sends its own label.
 */
export const DONT_KNOW_CHIPS = [
  { id: "dont_remember", label: "Не помню", text: "Не помню" },
  { id: "skip_question", label: "Пропустить вопрос", text: "Пропустить вопрос" },
] as const;

export const BUILD_SCRIPT_CHIP_LABEL = "Собрать сценарий";

/** Caption of the reading column: the current version, or the base of the author's take while there is no version. */
export function readingCaption(input: { versionNumber: number | null; baseLabel: string | null }): string {
  if (input.versionNumber != null) return `Сценарий · версия ${input.versionNumber}`;
  const take = input.baseLabel?.match(/№\s*(\d+)/)?.[1];
  return take ? `Основа · ваш дубль №${take}` : "Основа · ваш дубль";
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The hint under a Vocal question: an honest static line, not new data. */
export const QUESTION_HINT = "Можно ответить голосом или текстом, а можно пропустить вопрос.";
