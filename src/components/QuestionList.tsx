"use client";

import { useCallback, useEffect, useState } from "react";
import { QUESTION_STATUSES, QUESTION_STATUS_LABELS, type QuestionDto, type QuestionStatus } from "@/types/review";

export function QuestionList({ reelId, takeId }: { reelId: string; takeId: string | null }) {
  const [questions, setQuestions] = useState<QuestionDto[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reels/${reelId}/questions`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить вопросы.");
    setQuestions(data.questions as QuestionDto[]);
  }, [reelId]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load]);

  async function saveAnswer(id: string) {
    setError(null);
    const res = await fetch(`/api/questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: drafts[id] ?? "" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить ответ.");
    await load();
  }

  async function setStatus(id: string, status: QuestionStatus) {
    setError(null);
    const res = await fetch(`/api/questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось обновить статус.");
    await load();
  }

  async function continueAi() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/reels/${reelId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось запросить вопросы.");
      setQuestions(data.questions as QuestionDto[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Вопросы</h3>
        <button
          type="button"
          onClick={() => void continueAi()}
          disabled={running}
          className="rounded-full bg-accent px-4 py-2 text-sm text-[#1a140c] disabled:opacity-50"
        >
          {running ? "Спрашиваем…" : "Продолжить с ИИ"}
        </button>
      </div>
      <p className="text-sm text-muted">
        Сохранение ответа не вызывает модель. Новые вопросы не стирают старые. Продолжение учитывает отвеченные и
        пропущенные.
      </p>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {questions.length === 0 ? <p className="text-sm text-muted">Вопросов пока нет.</p> : null}
      <ul className="space-y-4">
        {questions.map((question) => (
          <li key={question.id} className="space-y-2 rounded-xl border border-line bg-bg p-3">
            <p>{question.text}</p>
            <p className="text-xs text-muted">{QUESTION_STATUS_LABELS[question.status]}</p>
            {question.answers.length > 0 ? (
              <ul className="text-sm text-muted">
                {question.answers.map((answer) => (
                  <li key={answer.id}>Ответ: {answer.text}</li>
                ))}
              </ul>
            ) : null}
            <textarea
              value={drafts[question.id] ?? ""}
              onChange={(event) => setDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 outline-none"
              placeholder="Ответ"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-accent px-3 py-1 text-sm text-[#1a140c]"
                onClick={() => void saveAnswer(question.id).catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."))}
              >
                Сохранить ответ
              </button>
              {QUESTION_STATUSES.filter((status) => status !== "answered").map((status) => (
                <button
                  key={status}
                  type="button"
                  className="rounded-full border border-line px-3 py-1 text-sm"
                  onClick={() => void setStatus(question.id, status).catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."))}
                >
                  {QUESTION_STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
