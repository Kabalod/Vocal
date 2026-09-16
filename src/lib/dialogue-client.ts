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

export function isDialogueAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) && error.name === "AbortError"
  );
}

export type DialogueVoiceGate = {
  recording: boolean;
  finalizing: boolean;
  sending: boolean;
};

export function beginVoiceFinalize(gate: DialogueVoiceGate): DialogueVoiceGate {
  return { ...gate, recording: false, finalizing: true };
}

export function dialogueComposerLocked(gate: DialogueVoiceGate): boolean {
  return gate.finalizing || gate.recording;
}

export function canStartDialogueRecording(gate: DialogueVoiceGate): boolean {
  return !gate.finalizing && !gate.sending && !gate.recording;
}

export function canSendDialogueText(gate: DialogueVoiceGate): boolean {
  return !gate.finalizing && !gate.sending && !gate.recording;
}
