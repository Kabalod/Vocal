export function newDialogueIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function retainDialogueSendKey(current: string | null | undefined): string {
  return current?.trim() ? current : newDialogueIdempotencyKey();
}

export function abortDialogueRequest(controller: AbortController | null | undefined) {
  controller?.abort();
}
