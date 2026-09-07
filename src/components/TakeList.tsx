"use client";

import { TAKE_INPUT_TYPE_LABELS, type ReelDto, type TakeDto } from "@/types/reel";

export function TakeList({
  reel,
  viewingId,
  onView,
  onFinal,
  onNote,
}: {
  reel: ReelDto;
  viewingId: string | null;
  onView: (id: string) => void;
  onFinal: (id: string | null) => void;
  onNote: (id: string, note: string) => void;
}) {
  if (reel.takes.length === 0) {
    return <p className="text-sm text-muted">Попыток пока нет. Добавьте текст или файл — без лимита числа.</p>;
  }

  return (
    <ul className="space-y-3">
      {reel.takes.map((take) => (
        <TakeRow
          key={take.id}
          take={take}
          active={viewingId === take.id}
          isFinal={reel.selectedTakeId === take.id}
          onView={() => onView(take.id)}
          onFinal={() => onFinal(reel.selectedTakeId === take.id ? null : take.id)}
          onNote={(note) => onNote(take.id, note)}
        />
      ))}
    </ul>
  );
}

function TakeRow({
  take,
  active,
  isFinal,
  onView,
  onFinal,
  onNote,
}: {
  take: TakeDto;
  active: boolean;
  isFinal: boolean;
  onView: () => void;
  onFinal: () => void;
  onNote: (note: string) => void;
}) {
  return (
    <li className={`rounded-xl border p-3 ${active ? "border-accent" : "border-line"}`}>
      <button type="button" onClick={onView} className="w-full text-left">
        <p className="text-sm">
          №{take.number} · {TAKE_INPUT_TYPE_LABELS[take.inputType]}
          {isFinal ? " · финальный" : ""}
        </p>
        <p className="text-xs text-muted">{take.originalName ?? (take.inputType === "text" ? "без файла" : take.mediaStatus)}</p>
      </button>
      <textarea
        key={`${take.id}:${take.authorNote}`}
        defaultValue={take.authorNote}
        placeholder="Что менял в этой попытке"
        rows={2}
        onBlur={(event) => onNote(event.target.value)}
        className="mt-2 w-full rounded-lg border border-line bg-bg px-2 py-1 text-sm outline-none"
      />
      <button
        type="button"
        onClick={onFinal}
        className="mt-2 rounded-full bg-bg-elev px-3 py-1 text-xs text-muted"
      >
        {isFinal ? "Снять финальный" : "Сделать финальным"}
      </button>
    </li>
  );
}
