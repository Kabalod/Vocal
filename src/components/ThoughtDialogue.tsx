"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { Composer } from "@/components/vocal-ui/Composer";
import { EmptyState } from "@/components/vocal-ui/EmptyState";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { ProcessingState } from "@/components/vocal-ui/ProcessingState";
import {
  adoptGrantedMicrophone,
  cancelVoiceCaptureSession,
  createVoiceCaptureSession,
  detachRecorderHandlers,
  finishVoiceRecording,
  formatRecordingDuration,
  microphonePermissionMessage,
  shouldPostVoiceReply,
  stopMediaStream,
  stopRecorderIfActive,
  voiceReplyRetryTarget,
  type VoiceCaptureSession,
} from "@/lib/media-session";
import { ShellError, ShellLoading } from "@/components/shell-status";
import {
  abortDialogueRequest,
  canSendDialogueText,
  canStartDialogueRecording,
  isDialogueAbortError,
  retainDialogueSendKey,
} from "@/lib/dialogue-client";
import type { DialogueMessageDto, DialoguePageDto } from "@/types/dialogue";

function MessageBubble({
  message,
  onTransfer,
  transferring,
}: {
  message: DialogueMessageDto;
  onTransfer: (id: string) => void;
  transferring: boolean;
}) {
  const mine = message.role === "user";
  return (
    <article className={`max-w-[92%] shell:max-w-[88%] ${mine ? "ml-auto" : ""}`}>
      <p className="mb-1 text-xs text-muted">{mine ? "Вы" : "Vocal"}</p>
      <div
        className={`break-words rounded-2xl border px-3 py-2 text-sm leading-relaxed ${
          mine ? "border-line bg-[#201D18]" : "border-line bg-surface"
        }`}
      >
        {message.voice ? (
          <p className="text-muted">Голосовой ответ · {message.voice.durationLabel}</p>
        ) : null}
        <p className="whitespace-pre-wrap">{message.body}</p>
        {message.kind === "script_proposal" && message.proposal ? (
          <div className="mt-3">
            {message.proposal.transferred ? (
              <p className="text-sm text-muted">Перенесено · {message.proposal.versionLabel ?? "сценарий"}</p>
            ) : (
              <ActionButton
                variant="secondary"
                disabled={transferring}
                onClick={() => onTransfer(message.id)}
              >
                {transferring ? "Переносим…" : "Перенести в сценарий"}
              </ActionButton>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ThoughtDialogue({
  reelId,
  draft,
  onDraftChange,
  onTransferred,
  onGoRecord,
  thoughtCompleted = false,
  onReopen,
}: {
  reelId: string;
  draft: string;
  onDraftChange: (value: string) => void;
  hasReadyScript?: boolean;
  onTransferred: () => void;
  onGoRecord: () => void;
  thoughtCompleted?: boolean;
  onReopen?: () => void;
}) {
  const [page, setPage] = useState<DialoguePageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState(false);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);
  const fetchRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<VoiceCaptureSession>(createVoiceCaptureSession());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const textKeyRef = useRef<string | null>(null);
  const voiceKeyRef = useRef<string | null>(null);
  const lastVoiceRef = useRef<{ blob: Blob; duration: string } | null>(null);
  const transferLockRef = useRef(false);

  const applyPage = useCallback((next: DialoguePageDto, mode: "replace" | "prepend") => {
    setPage((prev) => {
      if (!prev || mode === "replace") return next;
      const seen = new Set(prev.messages.map((item) => item.id));
      const older = next.messages.filter((item) => !seen.has(item.id));
      return { ...next, messages: [...older, ...prev.messages], nextCursor: next.nextCursor };
    });
  }, []);

  const load = useCallback(
    async (cursor?: string) => {
      abortDialogueRequest(fetchRef.current);
      const controller = new AbortController();
      fetchRef.current = controller;
      const res = await fetch(`/api/thoughts/${reelId}/dialogue${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const data = (await res.json()) as DialoguePageDto & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить диалог.");
      applyPage(data, cursor ? "prepend" : "replace");
    },
    [applyPage, reelId],
  );

  const refreshHistory = useCallback(async () => {
    setError(null);
    try {
      await load();
    } catch (err) {
      if (isDialogueAbortError(err)) return;
      setError(err instanceof Error ? err.message : "Ошибка.");
    }
  }, [load]);

  useEffect(() => {
    void refreshHistory();
    return () => {
      abortDialogueRequest(fetchRef.current);
      cancelVoiceCaptureSession(sessionRef.current);
      detachRecorderHandlers(recorderRef.current);
      stopRecorderIfActive(recorderRef.current);
      stopMediaStream(streamRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [refreshHistory]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || stuck || !stickBottom.current) return;
    node.scrollTop = node.scrollHeight;
  }, [page, stuck]);

  function onScroll() {
    const node = scrollerRef.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
    stickBottom.current = atBottom;
    setStuck(!atBottom);
  }

  async function postJson(url: string, body: unknown) {
    abortDialogueRequest(fetchRef.current);
    const controller = new AbortController();
    fetchRef.current = controller;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json()) as DialoguePageDto & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Не удалось отправить.");
    applyPage(data, "replace");
  }

  async function sendText(text: string) {
    if (!canSendDialogueText({ recording, finalizing, sending })) return;
    setSending(true);
    setError(null);
    setVoiceError(false);
    textKeyRef.current = retainDialogueSendKey(textKeyRef.current);
    try {
      await postJson(`/api/thoughts/${reelId}/dialogue`, { text, idempotencyKey: textKeyRef.current });
      textKeyRef.current = null;
      onDraftChange("");
    } catch (err) {
      if (isDialogueAbortError(err)) return;
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSending(false);
    }
  }

  async function transfer(messageId: string) {
    if (transferLockRef.current) return;
    transferLockRef.current = true;
    setError(null);
    setTransferringId(messageId);
    try {
      await postJson(`/api/thoughts/${reelId}/dialogue/transfer`, { messageId });
      onTransferred();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setTransferringId(null);
      transferLockRef.current = false;
    }
  }

  async function startMic() {
    if (!canStartDialogueRecording({ recording, finalizing, sending })) return;
    cancelVoiceCaptureSession(sessionRef.current);
    sessionRef.current = createVoiceCaptureSession();
    const session = sessionRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!adoptGrantedMicrophone(session, stream)) return;
      streamRef.current = stream;
      chunksRef.current = [];
      try {
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (event) => {
          if (session.cancelled || !event.data.size) return;
          chunksRef.current.push(event.data);
        };
        recorderRef.current = recorder;
        recorder.start();
        setSeconds(0);
        setRecording(true);
        setVoiceError(false);
        timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
      } catch {
        stopMediaStream(stream);
        streamRef.current = null;
        recorderRef.current = null;
        setError("Не удалось начать запись. Проверьте микрофон.");
      }
    } catch (err) {
      setError(microphonePermissionMessage(err, { secureContext: window.isSecureContext }));
    }
  }

  function stopMicTracks() {
    if (finalizing) return;
    cancelVoiceCaptureSession(sessionRef.current);
    detachRecorderHandlers(recorderRef.current);
    stopRecorderIfActive(recorderRef.current);
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
  }

  async function sendVoice() {
    if (finalizing || sending) return;
    const duration = formatRecordingDuration(seconds);
    const session = sessionRef.current;
    const recorder = recorderRef.current;
    const stream = streamRef.current;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setFinalizing(true);
    setRecording(false);
    let blob: Blob;
    try {
      blob = await finishVoiceRecording({
        recorder,
        stream,
        chunks: chunksRef.current,
        cancelled: () => session.cancelled,
      });
    } catch {
      stopMediaStream(stream);
      setError("Не удалось сохранить запись. Запишите голос заново.");
      setVoiceError(true);
      if (recorderRef.current === recorder) recorderRef.current = null;
      if (streamRef.current === stream) streamRef.current = null;
      setFinalizing(false);
      return;
    }
    if (recorderRef.current === recorder) recorderRef.current = null;
    if (streamRef.current === stream) streamRef.current = null;
    if (!shouldPostVoiceReply({ cancelled: session.cancelled, byteLength: blob.size })) {
      setFinalizing(false);
      if (!session.cancelled) {
        setError("Запись пуста. Запишите голос заново.");
        setVoiceError(true);
      }
      return;
    }
    lastVoiceRef.current = { blob, duration };
    await postVoiceReply({ blob, duration });
  }

  async function postVoiceReply(payload: { blob: Blob; duration: string }) {
    setSending(true);
    setFinalizing(false);
    setError(null);
    voiceKeyRef.current = retainDialogueSendKey(voiceKeyRef.current);
    try {
      abortDialogueRequest(fetchRef.current);
      const controller = new AbortController();
      fetchRef.current = controller;
      const form = new FormData();
      form.set("file", payload.blob, "reply.webm");
      form.set("idempotencyKey", voiceKeyRef.current);
      form.set("voiceDurationLabel", payload.duration);
      const res = await fetch(`/api/thoughts/${reelId}/dialogue`, { method: "POST", body: form, signal: controller.signal });
      const data = (await res.json()) as DialoguePageDto & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось отправить голос.");
      voiceKeyRef.current = null;
      lastVoiceRef.current = null;
      applyPage(data, "replace");
    } catch (err) {
      if (isDialogueAbortError(err)) return;
      setError(err instanceof Error ? err.message : "Ошибка.");
      setVoiceError(true);
    } finally {
      setSending(false);
    }
  }

  const messages = page?.messages ?? [];
  const empty = Boolean(page) && messages.length === 0 && !page?.analyzing;

  return (
    <section className="flex min-h-[28rem] flex-col" aria-label="Диалог с Vocal">
      <div className="mb-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl">Диалог с Vocal</h2>
      </div>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
      >
        {page?.nextCursor ? (
          <div className="text-center">
            <ActionButton
              variant="compact"
              disabled={loadingOlder}
              onClick={() => {
                if (!page.nextCursor) return;
                const node = scrollerRef.current;
                const before = node?.scrollHeight ?? 0;
                setLoadingOlder(true);
                void load(page.nextCursor)
                  .then(() => {
                    if (node) node.scrollTop = node.scrollHeight - before;
                  })
                  .catch((err: unknown) => {
                    if (isDialogueAbortError(err)) return;
                    setError(err instanceof Error ? err.message : "Ошибка.");
                  })
                  .finally(() => setLoadingOlder(false));
              }}
            >
              {loadingOlder ? "Загружаем…" : "Загрузить более ранние"}
            </ActionButton>
          </div>
        ) : null}
        {page === null && !error ? <ShellLoading label="Загрузка диалога…" /> : null}
        {empty ? (
          <EmptyState title="Пока нет переписки" description="Напишите или скажите мысль — Vocal ответит здесь." />
        ) : null}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            transferring={transferringId === message.id}
            onTransfer={transfer}
          />
        ))}
        {page?.analyzing ? <ProcessingState label="Разбираю вашу мысль…" /> : null}
      </div>
      {stuck ? (
        <div className="mt-2 text-center">
          <ActionButton
            variant="compact"
            onClick={() => {
              stickBottom.current = true;
              setStuck(false);
              const node = scrollerRef.current;
              if (node) node.scrollTop = node.scrollHeight;
            }}
          >
            К новым сообщениям
          </ActionButton>
        </div>
      ) : null}
      {error ? (
        <div className="mt-2 space-y-2">
          {page === null ? (
            <ShellError message={error} onRetry={() => void refreshHistory()} />
          ) : (
            <>
              <InlineError message={error} />
              <ActionButton
                variant="compact"
                onClick={() => {
                  const target = voiceReplyRetryTarget({
                    voiceError,
                    hasVoicePayload: Boolean(lastVoiceRef.current),
                    hasDraft: Boolean(draft.trim()),
                  });
                  if (target === "voice" && lastVoiceRef.current) void postVoiceReply(lastVoiceRef.current);
                  else if (target === "text") void sendText(draft);
                  else void refreshHistory();
                }}
              >
                Повторить
              </ActionButton>
            </>
          )}
          {voiceError ? (
            <p className="text-sm text-muted">Можно записать голос заново или отправить ту же мысль текстом.</p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 space-y-2 border-t border-line pt-3">
        {thoughtCompleted ? (
          <ActionButton variant="secondary" onClick={onReopen}>
            Вернуть в работу
          </ActionButton>
        ) : (
        <ActionButton
          variant="secondary"
          onClick={onGoRecord}
        >
          Записать дубль
        </ActionButton>
        )}
        {thoughtCompleted ? null : recording || finalizing ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-sm text-muted">
              {finalizing ? "Собираем запись…" : `Запись · ${formatRecordingDuration(seconds)}`}
            </p>
            {finalizing ? null : (
              <>
                <ActionButton variant="secondary" onClick={stopMicTracks}>
                  Отмена
                </ActionButton>
                <ActionButton variant="primary" onClick={() => void sendVoice()}>
                  Отправить голос
                </ActionButton>
              </>
            )}
          </div>
        ) : (
          <Composer
            value={draft}
            onChange={onDraftChange}
            disabled={sending}
            clearOnSend={false}
            onSend={(text) => void sendText(text)}
            onMic={() => void startMic()}
            micLabel="Ответить голосом"
          />
        )}
      </div>
    </section>
  );
}
