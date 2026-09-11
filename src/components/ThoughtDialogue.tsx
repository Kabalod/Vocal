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
  formatRecordingDuration,
  stopMediaStream,
  stopRecorderIfActive,
  type VoiceCaptureSession,
} from "@/lib/media-session";
import { abortDialogueRequest, newDialogueIdempotencyKey } from "@/lib/dialogue-client";
import type { DialogueMessageDto, DialoguePageDto } from "@/types/dialogue";

function MessageBubble({
  message,
  onTransfer,
}: {
  message: DialogueMessageDto;
  onTransfer: (id: string) => void;
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
              <ActionButton variant="secondary" onClick={() => onTransfer(message.id)}>
                Перенести в сценарий
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
  hasReadyScript,
  onTransferred,
  onGoRecord,
}: {
  reelId: string;
  draft: string;
  onDraftChange: (value: string) => void;
  hasReadyScript: boolean;
  onTransferred: () => void;
  onGoRecord: () => void;
}) {
  const [page, setPage] = useState<DialoguePageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);
  const fetchRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<VoiceCaptureSession>(createVoiceCaptureSession());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
      const data = (await res.json()) as DialoguePageDto & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить диалог.");
      applyPage(data, cursor ? "prepend" : "replace");
    },
    [applyPage, reelId],
  );

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
    return () => {
      abortDialogueRequest(fetchRef.current);
      cancelVoiceCaptureSession(sessionRef.current);
      detachRecorderHandlers(recorderRef.current);
      stopRecorderIfActive(recorderRef.current);
      stopMediaStream(streamRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [load]);

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
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await postJson(`/api/thoughts/${reelId}/dialogue`, { text, idempotencyKey: newDialogueIdempotencyKey() });
      onDraftChange("");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSending(false);
    }
  }

  async function transfer(messageId: string) {
    setError(null);
    try {
      await postJson(`/api/thoughts/${reelId}/dialogue/transfer`, { messageId });
      onTransferred();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    }
  }

  async function startMic() {
    cancelVoiceCaptureSession(sessionRef.current);
    sessionRef.current = createVoiceCaptureSession();
    const session = sessionRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!adoptGrantedMicrophone(session, stream)) return;
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (session.cancelled || !event.data.size) return;
        chunksRef.current.push(event.data);
      };
      recorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      setError("Нужен доступ к микрофону.");
    }
  }

  function stopMicTracks() {
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
    const duration = formatRecordingDuration(seconds);
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    stopMicTracks();
    if (!blob.size) return;
    setSending(true);
    try {
      abortDialogueRequest(fetchRef.current);
      const controller = new AbortController();
      fetchRef.current = controller;
      const form = new FormData();
      form.set("file", blob, "reply.webm");
      form.set("idempotencyKey", newDialogueIdempotencyKey());
      form.set("voiceDurationLabel", duration);
      const res = await fetch(`/api/thoughts/${reelId}/dialogue`, { method: "POST", body: form, signal: controller.signal });
      const data = (await res.json()) as DialoguePageDto & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось отправить голос.");
      applyPage(data, "replace");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSending(false);
    }
  }

  const messages = page?.messages ?? [];
  const empty = messages.length === 0 && !page?.analyzing;

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
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."))
                  .finally(() => setLoadingOlder(false));
              }}
            >
              {loadingOlder ? "Загружаем…" : "Загрузить более ранние"}
            </ActionButton>
          </div>
        ) : null}
        {empty ? (
          <EmptyState title="Пока нет переписки" description="Напишите или скажите мысль — Vocal ответит здесь." />
        ) : null}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} onTransfer={transfer} />
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
      {error ? <div className="mt-2"><InlineError message={error} /></div> : null}
      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <ActionButton
          variant="secondary"
          disabled={!hasReadyScript}
          disabledReason={!hasReadyScript ? "Сначала нужна готовая версия сценария" : undefined}
          onClick={onGoRecord}
        >
          Перейти к записи
        </ActionButton>
        {recording ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="mr-auto text-sm text-muted">Запись · {formatRecordingDuration(seconds)}</p>
            <ActionButton variant="secondary" onClick={stopMicTracks}>
              Отмена
            </ActionButton>
            <ActionButton variant="primary" onClick={() => void sendVoice()}>
              Отправить голос
            </ActionButton>
          </div>
        ) : (
          <Composer
            value={draft}
            onChange={onDraftChange}
            disabled={sending}
            onSend={(text) => void sendText(text)}
            onMic={() => void startMic()}
          />
        )}
      </div>
    </section>
  );
}
