"use client";

import { useCallback, useEffect, useState } from "react";
import { QUESTION_STATUSES, QUESTION_STATUS_LABELS, type QuestionDto, type QuestionStatus } from "@/types/review";

function lastAnswerText(question: QuestionDto): string {
  return question.answers.at(-1)?.text ?? "";
}

export function QuestionList({ reelId, takeId }: { reelId: string; takeId: string | null }) {
  const [questions, setQuestions] = useState<QuestionDto[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const applyQuestions = useCallback((next: QuestionDto[]) => {
    setQuestions(next);
    setDrafts((current) => {
      const merged: Record<string, string> = {};
      for (const question of next) {
        merged[question.id] = dirty[question.id] ? (current[question.id] ?? lastAnswerText(question)) : lastAnswerText(question);
      }
      return merged;
    });
  }, [dirty]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reels/${reelId}/questions`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить вопросы.");
    applyQuestions(data.questions as QuestionDto[]);
  }, [applyQuestions, reelId]);

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
    setDirty((current) => ({ ...current, [id]: false }));
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
      applyQuestions(data.questions as QuestionDto[]);
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
          className="rounded-full bg-accent px-4 py-2 text-sm text-on-accent disabled:opacity-50"
        >
          {running ? "Спрашиваем…" : "Продолжить с ИИ"}
        </button>
      </div>
      <p className="text-sm text-muted">
        Сохранение ответа не вызывает модель и правит текущий текст ответа. Более ранние версии, если они уже были,
        остаются в истории. Новые вопросы не стирают старые.
      </p>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {questions.length === 0 ? <p className="text-sm text-muted">Вопросов пока нет.</p> : null}
      <ul className="space-y-4">
        {questions.map((question) => {
          const history = question.answers.slice(0, -1);
          return (
            <li key={question.id} className="space-y-2 rounded-xl border border-line bg-bg p-3">
              <p>{question.text}</p>
              <p className="text-xs text-muted">{QUESTION_STATUS_LABELS[question.status]}</p>
              {history.length > 0 ? (
                <details className="text-sm text-muted">
                  <summary className="cursor-pointer">История ответов</summary>
                  <ul className="mt-2 list-disc pl-5">
                    {history.map((answer) => (
                      <li key={answer.id}>{answer.text}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <textarea
                value={drafts[question.id] ?? ""}
                onChange={(event) => {
                  setDrafts((current) => ({ ...current, [question.id]: event.target.value }));
                  setDirty((current) => ({ ...current, [question.id]: true }));
                }}
                rows={3}
                className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 outline-none"
                placeholder="Ответ"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-accent px-3 py-1 text-sm text-on-accent"
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
          );
        })}
      </ul>
    </section>
  );
}
