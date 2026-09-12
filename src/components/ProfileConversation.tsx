"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Portrait } from "@/components/Portrait";
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
  stopMediaStream,
  stopRecorderIfActive,
  type VoiceCaptureSession,
} from "@/lib/media-session";
import {
  abortDialogueRequest,
  canSendDialogueText,
  canStartDialogueRecording,
  retainDialogueSendKey,
} from "@/lib/dialogue-client";
import type { DialogueMessageDto, DialoguePageDto } from "@/types/dialogue";
import type { PortraitDto, ProfilePhase, ProfileWorkspaceDto } from "@/types/profile";

type Workspace = ProfileWorkspaceDto & { dialogue: DialoguePageDto };

function MessageBubble({ message }: { message: DialogueMessageDto }) {
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
      </div>
    </article>
  );
}

export function ProfileConversation() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState(false);
  const [draft, setDraft] = useState("");
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

  const applyWorkspace = useCallback((next: Workspace) => {
    setWorkspace(next);
  }, []);

  const load = useCallback(async (cursor?: string) => {
    abortDialogueRequest(fetchRef.current);
    const controller = new AbortController();
    fetchRef.current = controller;
    const res = await fetch(`/api/profile/dialogue${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const data = (await res.json()) as Workspace & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Не удалось открыть профиль.");
    if (cursor) {
      setWorkspace((prev) => {
        if (!prev) return data;
        const seen = new Set(prev.dialogue.messages.map((item) => item.id));
        const older = data.dialogue.messages.filter((item) => !seen.has(item.id));
        return {
          ...data,
          dialogue: {
            ...data.dialogue,
            messages: [...older, ...prev.dialogue.messages],
            nextCursor: data.dialogue.nextCursor,
          },
        };
      });
      return;
    }
    applyWorkspace(data);
  }, [applyWorkspace]);

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
  }, [workspace, stuck]);

  function onScroll() {
    const node = scrollerRef.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
    stickBottom.current = atBottom;
    setStuck(!atBottom);
  }

  async function postJson(body: unknown) {
    abortDialogueRequest(fetchRef.current);
    const controller = new AbortController();
    fetchRef.current = controller;
    const res = await fetch("/api/profile/dialogue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json()) as Workspace & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Не удалось отправить.");
    applyWorkspace(data);
  }

  async function sendText(text: string) {
    if (!canSendDialogueText({ recording, finalizing, sending })) return;
    setSending(true);
    setError(null);
    setVoiceError(false);
    textKeyRef.current = retainDialogueSendKey(textKeyRef.current);
    try {
      await postJson({ text, idempotencyKey: textKeyRef.current });
      textKeyRef.current = null;
      setDraft("");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSending(false);
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
    } catch {
      setError("Нужен доступ к микрофону.");
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
    if (!blob.size) {
      setError("Запись пуста. Запишите голос заново.");
      setVoiceError(true);
      setFinalizing(false);
      return;
    }
    setSending(true);
    setFinalizing(false);
    setError(null);
    voiceKeyRef.current = retainDialogueSendKey(voiceKeyRef.current);
    try {
      abortDialogueRequest(fetchRef.current);
      const controller = new AbortController();
      fetchRef.current = controller;
      const form = new FormData();
      form.set("file", blob, "reply.webm");
      form.set("idempotencyKey", voiceKeyRef.current);
      form.set("voiceDurationLabel", duration);
      const res = await fetch("/api/profile/dialogue", { method: "POST", body: form, signal: controller.signal });
      const data = (await res.json()) as Workspace & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось отправить голос.");
      voiceKeyRef.current = null;
      applyWorkspace(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Ошибка.");
      setVoiceError(true);
    } finally {
      setSending(false);
    }
  }

  const phase: ProfilePhase = workspace?.phase ?? "idle";
  const portrait: PortraitDto | null = workspace?.portrait ?? null;
  const messages = workspace?.dialogue.messages ?? [];
  const showChat = phase === "conversation";

  return (
    <div className="space-y-6">
      {phase === "idle" ? (
        <EmptyState
          title="Разговор вместо анкеты"
          description="Vocal задаст по одному вопросу и соберёт портрет для сценариев. Анкета необязательна: мысль можно начать и без неё."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ActionButton
                variant="primary"
                onClick={() => {
                  setError(null);
                  void postJson({ action: "start" }).catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : "Ошибка."),
                  );
                }}
              >
                {messages.length > 0 ? "Продолжить разговор" : "Начать разговор"}
              </ActionButton>
              {messages.length > 0 ? null : (
                <ActionButton
                  variant="secondary"
                  onClick={() => {
                    setError(null);
                    void postJson({ action: "skip" }).catch((err: unknown) =>
                      setError(err instanceof Error ? err.message : "Ошибка."),
                    );
                  }}
                >
                  Позже
                </ActionButton>
              )}
            </div>
          }
        />
      ) : null}

      {phase === "idle" && workspace?.skipped ? (
        <p className="text-sm text-muted">Можно вернуться к разговору в любой момент. Мысль создавать уже можно.</p>
      ) : null}

      {phase === "portrait" ? (
        <div className="space-y-4">
          {portrait ? <Portrait portrait={portrait} /> : null}
          <ActionButton
            variant="secondary"
            onClick={() => {
              setError(null);
              void postJson({ action: "supplement" }).catch((err: unknown) =>
                setError(err instanceof Error ? err.message : "Ошибка."),
              );
            }}
          >
            Дополнить анкету
          </ActionButton>
        </div>
      ) : null}

      {showChat ? (
        <section className="flex min-h-[28rem] flex-col" aria-label="Диалог анкеты">
          {workspace?.skipped === false && messages.some((item) => item.role === "user") === false && !portrait ? (
            <p className="mb-3 text-sm text-muted">Можно прервать и продолжить позже.</p>
          ) : null}
          {portrait && workspace?.applyError ? (
            <div className="mb-4 space-y-3">
              <InlineError message="Новое изменение не применено. Предыдущий портрет сохранён." />
              <Portrait portrait={portrait} />
            </div>
          ) : null}
          {messages.length > 0 && !workspace?.dialogue.analyzing && !portrait?.completed ? (
            <div className="mb-3">
              <ActionButton
                variant="compact"
                onClick={() => {
                  setError(null);
                  void postJson({ action: "skip" }).catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : "Ошибка."),
                  );
                }}
              >
                Продолжить позже
              </ActionButton>
            </div>
          ) : null}
          <div ref={scrollerRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {workspace?.dialogue.nextCursor ? (
              <div className="text-center">
                <ActionButton
                  variant="compact"
                  disabled={loadingOlder}
                  onClick={() => {
                    if (!workspace.dialogue.nextCursor) return;
                    const node = scrollerRef.current;
                    const before = node?.scrollHeight ?? 0;
                    setLoadingOlder(true);
                    void load(workspace.dialogue.nextCursor)
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
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {workspace?.dialogue.analyzing ? <ProcessingState label="Собираю портрет…" /> : null}
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
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            {recording || finalizing ? (
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
                placeholder="Напишите ответ…"
                value={draft}
                onChange={setDraft}
                disabled={sending}
                clearOnSend={false}
                onSend={(text) => void sendText(text)}
                onMic={() => void startMic()}
              />
            )}
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="space-y-1">
          <InlineError message={error} />
          {voiceError ? (
            <p className="text-sm text-muted">Можно записать голос заново или отправить ту же мысль текстом.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
