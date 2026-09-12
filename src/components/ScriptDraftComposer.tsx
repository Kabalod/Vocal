import React from "react";

export function ScriptDraftComposer({
  draftBody,
  saving,
  finalizing,
  status,
  expectedUpdatedAt,
  helping,
  onBodyChange,
  onFinalize,
  onBackToReady,
  onDelete,
  onHelp,
}: {
  draftBody: string;
  saving: boolean;
  finalizing: boolean;
  status: string | null;
  expectedUpdatedAt: string | null;
  helping: boolean;
  onBodyChange: (body: string) => void;
  onFinalize: () => void;
  onBackToReady: () => void;
  onDelete: () => void;
  onHelp?: () => void;
}) {
  const locked = saving || finalizing;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{saving ? "Сохраняем…" : status ?? (expectedUpdatedAt ? "Сохранено" : "")}</p>
      <textarea
        value={draftBody}
        onChange={(event) => onBodyChange(event.target.value)}
        rows={16}
        placeholder="Текст новой версии"
        className="vocal-input min-h-[22rem] resize-y font-[family-name:var(--font-display)] text-lg leading-relaxed"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="vocal-btn vocal-btn-primary disabled:opacity-50"
          disabled={locked || !draftBody.trim()}
          onClick={onFinalize}
        >
          {finalizing ? "Завершаем…" : "Завершить версию"}
        </button>
        <button type="button" className="vocal-btn disabled:opacity-50" disabled={locked} onClick={onBackToReady}>
          К готовым версиям
        </button>
        <button type="button" className="vocal-btn text-sm" onClick={onDelete}>
          Удалить черновик
        </button>
        <button type="button" className="vocal-btn text-sm" disabled={helping} onClick={onHelp}>
          {helping ? "Просим…" : "Помочь со сценарием"}
        </button>
      </div>
    </div>
  );
}
