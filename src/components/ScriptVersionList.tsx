"use client";

import type { ScriptBundleDto, ScriptVersionDto } from "@/types/script";

const KIND_LABEL: Record<string, string> = {
  manual: "ручная",
  restore: "восстановленная",
  ai_proposal: "предложение модели",
  accepted_ai: "принятая модель",
};

export function ScriptVersionList({
  bundle,
  viewingId,
  onView,
  onRestore,
  onFinal,
  onAccept,
}: {
  bundle: ScriptBundleDto;
  viewingId: string | null;
  onView: (id: string) => void;
  onRestore: (id: string) => void;
  onFinal: (id: string | null) => void;
  onAccept: (id: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {bundle.versions.map((version) => {
        const active = viewingId === version.id;
        const isHead = bundle.headId === version.id;
        const isFinal = bundle.finalScriptId === version.id;
        return (
          <li
            key={version.id}
            className={`rounded-[16px] border p-3 text-sm ${active ? "border-accent bg-accent-dim" : "border-line"}`}
          >
            <button type="button" className="w-full text-left" onClick={() => onView(version.id)}>
              <p className="font-medium">
                {KIND_LABEL[version.kind] ?? version.kind}
                {isHead ? " · активная" : ""}
                {isFinal ? " · финал" : ""}
              </p>
              <p className="text-muted">{new Date(version.createdAt).toLocaleString("ru")}</p>
              <p className="mt-1 line-clamp-2">{version.body}</p>
            </button>
            <div className="mt-2 flex flex-wrap gap-2">
              {version.kind !== "ai_proposal" ? (
                <button type="button" className="vocal-btn text-sm" onClick={() => onRestore(version.id)}>
                  Восстановить
                </button>
              ) : (
                <button type="button" className="vocal-btn vocal-btn-primary text-sm" onClick={() => onAccept(version.id)}>
                  Принять предложение
                </button>
              )}
              {isFinal ? (
                <button type="button" className="vocal-btn text-sm" onClick={() => onFinal(null)}>
                  Снять финал сценария
                </button>
              ) : (
                <button type="button" className="vocal-btn text-sm" onClick={() => onFinal(version.id)}>
                  Финальный сценарий
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function versionById(bundle: ScriptBundleDto, id: string | null): ScriptVersionDto | null {
  return bundle.versions.find((row) => row.id === id) ?? null;
}
