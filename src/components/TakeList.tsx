"use client";

import { useMemo, useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { TAKE_INPUT_TYPE_LABELS, type ReelDto, type TakeDto } from "@/types/reel";

export function TakeList({
  reel,
  viewingId,
  onView,
  onFinal,
  onNote,
  locked = false,
}: {
  reel: ReelDto;
  viewingId: string | null;
  onView: (id: string) => void;
  onFinal: (id: string | null) => void;
  onNote: (id: string, note: string) => void;
  locked?: boolean;
}) {
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const takes = useMemo(() => {
    const copy = [...reel.takes];
    copy.sort((a, b) => (order === "newest" ? b.number - a.number : a.number - b.number));
    return copy;
  }, [order, reel.takes]);

  if (reel.takes.length === 0) {
    return <p className="text-sm text-muted">Попыток пока нет. Добавьте текст или файл — без лимита числа.</p>;
  }

  const focus = takes[0];
  const rest = takes.slice(1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Порядок дублей">
        <ActionButton
          variant="compact"
          aria-pressed={order === "newest"}
          className={order === "newest" ? "text-text" : ""}
          onClick={() => setOrder("newest")}
        >
          От последнего
        </ActionButton>
        <ActionButton
          variant="compact"
          aria-pressed={order === "oldest"}
          className={order === "oldest" ? "text-text" : ""}
          onClick={() => setOrder("oldest")}
        >
          От первого
        </ActionButton>
      </div>

      <div className="shell:hidden">
        {focus ? (
          <PolaroidTake
            take={focus}
            active={viewingId === focus.id}
            isFinal={reel.finalTakeId === focus.id}
            locked={locked}
            tilt={0}
            onView={() => onView(focus.id)}
            onFinal={() => onFinal(reel.finalTakeId === focus.id ? null : focus.id)}
            onNote={(note) => onNote(focus.id, note)}
          />
        ) : null}
        {rest.length > 0 ? (
          <ol className="mt-4 space-y-2" aria-label="Лента дублей">
            {rest.map((take) => (
              <li key={take.id}>
                <button
                  type="button"
                  onClick={() => onView(take.id)}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm ${
                    viewingId === take.id ? "border-accent" : "border-line"
                  }`}
                >
                  <span>
                    №{take.number}
                    {reel.finalTakeId === take.id ? " · итоговый" : ""}
                  </span>
                  <span className="text-muted">{TAKE_INPUT_TYPE_LABELS[take.inputType]}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <ol className="take-path hidden shell:grid" aria-label="Путь дублей">
        {takes.map((take, index) => (
          <li key={take.id} className="take-path-item min-w-0">
            <PolaroidTake
              take={take}
              active={viewingId === take.id}
              isFinal={reel.finalTakeId === take.id}
              locked={locked}
              tilt={index % 2 === 0 ? -2 : 2}
              onView={() => onView(take.id)}
              onFinal={() => onFinal(reel.finalTakeId === take.id ? null : take.id)}
              onNote={(note) => onNote(take.id, note)}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function PolaroidTake({
  take,
  active,
  isFinal,
  locked,
  tilt,
  onView,
  onFinal,
  onNote,
}: {
  take: TakeDto;
  active: boolean;
  isFinal: boolean;
  locked: boolean;
  tilt: number;
  onView: () => void;
  onFinal: () => void;
  onNote: (note: string) => void;
}) {
  return (
    <article
      className={`polaroid ${active ? "polaroid-active" : ""}`}
      style={{ ["--polaroid-tilt" as string]: `${tilt}deg` }}
    >
      <button type="button" onClick={onView} className="w-full text-left">
        <p className="polaroid-caption">
          №{take.number}
          {take.number === 1 ? " · исходная мысль" : ""}
          {isFinal ? " · итоговый" : ""}
        </p>
        <p className="mt-1 text-sm text-[#4a4258]">
          {TAKE_INPUT_TYPE_LABELS[take.inputType]}
          {take.originalName ? ` · ${take.originalName}` : take.inputType === "text" ? " · без файла" : ` · ${take.mediaStatus}`}
        </p>
      </button>
      <textarea
        key={`${take.id}:${take.authorNote}`}
        defaultValue={take.authorNote}
        placeholder="Что менял в этой попытке"
        rows={2}
        aria-label={`Заметка к дублю №${take.number}`}
        onBlur={(event) => onNote(event.target.value)}
        className="mt-2 w-full rounded-lg border border-[#d8cfc0] bg-[#fbf7f0] px-2 py-1 text-sm text-[#1a1424] outline-none"
      />
      <button
        type="button"
        onClick={onFinal}
        disabled={locked}
        className="mt-2 min-h-11 rounded-full bg-[#1a1424] px-3 text-xs text-[#f5f3ff] disabled:opacity-50"
      >
        {isFinal ? "Снять итоговый" : "Сделать итоговым"}
      </button>
    </article>
  );
}
