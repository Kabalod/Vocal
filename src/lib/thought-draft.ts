export const THOUGHT_DRAFT_STORAGE_KEY = "vocal-thought-draft-v1";

export type ThoughtDraft = {
  title: string;
  body: string;
  idempotencyKey: string;
};

export function newThoughtIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `thought-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyThoughtDraft(): ThoughtDraft {
  return { title: "", body: "", idempotencyKey: newThoughtIdempotencyKey() };
}

export function readThoughtDraft(): ThoughtDraft {
  if (typeof window === "undefined") return emptyThoughtDraft();
  try {
    const raw = window.localStorage.getItem(THOUGHT_DRAFT_STORAGE_KEY);
    if (!raw) return emptyThoughtDraft();
    const parsed = JSON.parse(raw) as Partial<ThoughtDraft>;
    const idempotencyKey =
      typeof parsed.idempotencyKey === "string" && parsed.idempotencyKey.trim()
        ? parsed.idempotencyKey
        : newThoughtIdempotencyKey();
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      body: typeof parsed.body === "string" ? parsed.body : "",
      idempotencyKey,
    };
  } catch {
    return emptyThoughtDraft();
  }
}

export function writeThoughtDraft(draft: ThoughtDraft): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THOUGHT_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearThoughtDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(THOUGHT_DRAFT_STORAGE_KEY);
}
