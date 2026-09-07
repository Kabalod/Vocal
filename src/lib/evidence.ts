export function normalizeForEvidence(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»""„]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteFoundInText(haystack: string, quote: string): boolean {
  const needle = normalizeForEvidence(quote);
  if (needle.length < 4) return false;
  return normalizeForEvidence(haystack).includes(needle);
}

export function annotateQuotes(
  transcript: string,
  quotes: { text?: string; note?: string }[] | undefined,
): { text: string; found: boolean; note: string }[] {
  if (!quotes) return [];
  return quotes
    .map((item) => ({ text: (item.text ?? "").trim(), note: (item.note ?? "").trim() }))
    .filter((item) => item.text)
    .map((item) => {
      const found = quoteFoundInText(transcript, item.text);
      return {
        text: item.text,
        found,
        note: found ? item.note : item.note || "Цитата не найдена в выбранной версии текста.",
      };
    });
}
