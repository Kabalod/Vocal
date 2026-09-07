"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { isBrowserLeaveWarningNeeded, ReelEditorSession } from "@/lib/reel-editor-session";
import type { ReelDto, ReelStatus, UpdateReelInput } from "@/types/reel";
import { REEL_STATUS_LABELS, REEL_STATUSES } from "@/types/reel";

async function patchReel(id: string, patch: UpdateReelInput): Promise<ReelDto> {
  let res: Response;
  try {
    res = await fetch(`/api/reels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    throw Object.assign(new Error("Нет связи. Черновик на месте — повторите сохранение."), {
      code: "NETWORK",
      status: 0,
    });
  }
  let data: { reel?: ReelDto; error?: string; code?: string } = {};
  try {
    data = await res.json();
  } catch {
    throw Object.assign(new Error("Нет связи. Черновик на месте — повторите сохранение."), {
      code: "NETWORK",
      status: 0,
    });
  }
  if (!res.ok) {
    throw Object.assign(new Error(data.error ?? "Не удалось сохранить."), {
      code: data.code ?? "SAVE",
      status: res.status,
    });
  }
  if (!data.reel) throw new Error("Пустой ответ сервера.");
  return data.reel;
}

async function loadReel(id: string): Promise<ReelDto> {
  const res = await fetch(`/api/reels/${id}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Карточка не найдена.");
  return data.reel as ReelDto;
}

export function ReelWorkspace({ id }: { id: string }) {
  const [, bump] = useState(0);
  const session = useMemo(
    () => new ReelEditorSession((patch) => patchReel(id, patch), () => loadReel(id)),
    [id],
  );
  const noteTimer = useRef<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return session.subscribe(() => bump((n) => n + 1));
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    session
      .bootstrap()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Ошибка.");
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!isBrowserLeaveWarningNeeded(session)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      if (noteTimer.current) window.clearTimeout(noteTimer.current);
      session.requestSave();
      session.dispose();
    };
  }, [session]);

  function scheduleNoteSave() {
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => session.requestSave(), 450);
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-bad">{loadError}</p>
        <Link href="/reels" className="text-sm text-accent">
          К списку
        </Link>
      </div>
    );
  }

  if (!ready || !session.confirmed) {
    return <p className="text-muted">Загрузка…</p>;
  }

  const saveLabel =
    session.saveState === "saving"
      ? "Сохраняется…"
      : session.saveState === "saved"
        ? "Сохранено"
        : session.saveState === "error"
          ? session.saveError ?? "Ошибка сохранения"
          : session.isDirty()
            ? "Есть несохранённые правки"
            : "Изменения ещё не отправлялись";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/reels" className="text-sm text-muted hover:text-text">
          ← Мои ролики
        </Link>
        <div className="flex items-center gap-3">
          <p className={`text-sm ${session.saveState === "error" ? "text-bad" : "text-muted"}`}>{saveLabel}</p>
          {session.saveState === "error" ? (
            <button
              type="button"
              className="rounded-full bg-accent px-3 py-1 text-sm text-[#1a140c]"
              onClick={() => session.retry()}
            >
              Повторить сохранение
            </button>
          ) : null}
        </div>
      </div>

      <label className="block space-y-2">
        <span className="text-sm text-muted">Название</span>
        <input
          value={session.draftTitle}
          onChange={(e) => session.setTitle(e.target.value)}
          onBlur={() => session.requestSave()}
          className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 text-xl outline-none focus:border-accent/50"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm text-muted">Заметка</span>
        <textarea
          value={session.draftNote}
          onChange={(e) => {
            session.setNote(e.target.value);
            scheduleNoteSave();
          }}
          rows={8}
          className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 outline-none focus:border-accent/50"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm text-muted">Статус</span>
        <select
          value={session.draftStatus}
          onChange={(e) => session.setStatus(e.target.value as ReelStatus)}
          className="rounded-xl border border-line bg-bg-elev px-3 py-2 outline-none"
        >
          {REEL_STATUSES.map((item) => (
            <option key={item} value={item}>
              {REEL_STATUS_LABELS[item]}
            </option>
          ))}
        </select>
      </label>

      <p className="text-sm text-muted">
        Дублей: {session.confirmed.takeCount}. Финальный дубль выбирается позже, когда появятся материалы.
      </p>
      <p className="text-sm text-muted">
        Расшифровка, вопросы и сценарий — следующие этапы. Здесь они не включены и не имитируются.
      </p>
    </div>
  );
}
