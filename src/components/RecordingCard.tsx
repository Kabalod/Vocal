"use client";

import type { RecordingCardDto } from "@/types/script";

export function RecordingCard({
  value,
  onChange,
  readOnly = false,
}: {
  value: RecordingCardDto;
  onChange?: (next: RecordingCardDto) => void;
  readOnly?: boolean;
}) {
  function field(key: keyof RecordingCardDto, label: string) {
    return (
      <label className="block space-y-1 text-sm">
        <span className="text-muted">{label}</span>
        <textarea
          value={value[key]}
          readOnly={readOnly}
          onChange={
            readOnly || !onChange
              ? undefined
              : (event) => onChange({ ...value, [key]: event.target.value })
          }
          rows={2}
          className="w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none"
        />
      </label>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {field("opening", "Начало")}
      {field("supports", "Опоры")}
      {field("example", "Пример")}
      {field("ending", "Финал")}
    </div>
  );
}
