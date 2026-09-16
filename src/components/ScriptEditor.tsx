"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CanonicalExportActions } from "@/components/CanonicalExportActions";
import { ScriptDraftComposer } from "@/components/ScriptDraftComposer";
import { ScriptVersionTimeline } from "@/components/ScriptVersionTimeline";
import { ShellEmpty, ShellError, ShellLoading } from "@/components/shell-status";
import { GenerationGuard } from "@/lib/generation-guard";
import { DraftSaveError, ScriptDraftSaveSession } from "@/lib/script-draft-save";
import { isHeadKind, type ScriptVersionDto, type ScriptWorkspaceDto } from "@/types/script";
import { buildCanonicalExportTxt, sanitizeExportFilename } from "@/lib/canonical-export";

function readyVersions(workspace: ScriptWorkspaceDto) {
  return workspace.versions.filter((row) => isHeadKind(row.kind));
}

function createDraftSession(reelIdRef: { current: string }) {
  return new ScriptDraftSaveSession({
    patch: async (input) => {
      const res = await fetch(`/api/reels/${reelIdRef.current}/scripts/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (res.status === 409) throw new DraftSaveError(data.error ?? "STALE", "STALE");
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить черновик.");
      return data as { draft: { body: string; updatedAt: string; saveToken: number } };
    },
    onStale: async () => {
      const fresh = await fetch(`/api/reels/${reelIdRef.current}/scripts`, { cache: "no-store" });
      const workspaceJson = (await fresh.json()) as ScriptWorkspaceDto;
      if (!workspaceJson.draft) return null;
      return { updatedAt: workspaceJson.draft.updatedAt, saveToken: workspaceJson.draft.saveToken };
    },
  });
}

export function ScriptEditor({
  reelId,
  reloadToken = 0,
  onHelpWithScript,
  thoughtCompleted = false,
  onChanged,
}: {
  reelId: string;
  reloadToken?: number;
  onHelpWithScript?: () => Promise<void> | void;
  thoughtCompleted?: boolean;
  onChanged?: () => void;
}) {
  const [workspace, setWorkspace] = useState<ScriptWorkspaceDto | null>(null);
  const [viewing, setViewing] = useState<ScriptVersionDto | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [helping, setHelping] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const guardRef = useRef(new GenerationGuard());
  const skipAutosave = useRef(false);
  const reelIdRef = useRef(reelId);
  reelIdRef.current = reelId;
  const sessionRef = useRef<ScriptDraftSaveSession | null>(null);
  if (!sessionRef.current) sessionRef.current = createDraftSession(reelIdRef);
  const session = sessionRef.current;
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  const applyWorkspace = useCallback((next: ScriptWorkspaceDto, keepDraftText: boolean) => {
    setWorkspace(next);
    const nextViewId = next.viewing?.id ?? next.headId ?? next.versions.find((row) => isHeadKind(row.kind))?.id ?? null;
    setViewingId((current) => current ?? nextViewId);
    if (next.viewing) setViewing(next.viewing);
    session.hydrate(next.draft, keepDraftText);
    if (next.draft && !keepDraftText) skipAutosave.current = true;
  }, [session]);

  const load = useCallback(
    async (view?: string | null) => {
      const query = view ? `?view=${encodeURIComponent(view)}` : "";
      const res = await fetch(`/api/reels/${reelId}/scripts${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить сценарий.");
      applyWorkspace(data as ScriptWorkspaceDto, false);
      return data as ScriptWorkspaceDto;
    },
    [applyWorkspace, reelId],
  );

  useEffect(() => {
    void load()
      .then((next) => {
        if (reloadToken > 0 && next.draft) session.enterDraft();
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."));
  }, [load, reloadToken, session]);

  useEffect(() => {
    if (!viewingId) return;
    if (viewing?.id === viewingId) return;
    const token = guardRef.current.begin();
    void fetch(`/api/reels/${reelId}/scripts/${viewingId}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить версию.");
        if (!token.isCurrent()) return;
        setViewing(data as ScriptVersionDto);
      })
      .catch((err: unknown) => {
        if (!token.isCurrent()) return;
        setLoadError(err instanceof Error ? err.message : "Ошибка.");
      });
  }, [reelId, viewing, viewingId]);

  useEffect(() => {
    if (snap.mode !== "draft" || snap.expectedSaveToken == null || !workspace?.draft) return;
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    if (snap.body === workspace.draft.body) return;
    const timer = window.setTimeout(() => {
      void session.save();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [session, snap.body, snap.expectedSaveToken, snap.mode, workspace?.draft]);

  async function openDraft() {
    setLoadError(null);
    const res = await fetch(`/api/reels/${reelId}/scripts/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseVersionId: viewingId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось открыть черновик.");
    applyWorkspace(data as ScriptWorkspaceDto, false);
    session.enterDraft();
  }

  async function finalize() {
    await session.finalize(async (input) => {
      const res = await fetch(`/api/reels/${reelId}/scripts/draft/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось завершить версию.");
      applyWorkspace(data as ScriptWorkspaceDto, false);
      setViewingId((data as ScriptWorkspaceDto).headId);
      setViewing((data as ScriptWorkspaceDto).viewing);
    });
  }

  async function setFinal() {
    if (!viewingId || thoughtCompleted) return;
    setLoadError(null);
    const res = await fetch(`/api/reels/${reelId}/scripts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "final", scriptId: viewingId === workspace?.finalScriptId ? null : viewingId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось отметить итоговую версию.");
    await load(viewingId);
    onChanged?.();
  }

  async function removeDraft() {
    if (!window.confirm("Удалить черновик? Готовые версии не изменятся.")) return;
    const res = await fetch(`/api/reels/${reelId}/scripts/draft`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось удалить черновик.");
    applyWorkspace(data as ScriptWorkspaceDto, false);
    session.mode = "ready";
    session.status = "Черновик удалён.";
    session.emit();
  }

  const ready = workspace ? readyVersions(workspace) : [];
  const currentMeta = ready.find((row) => row.id === viewingId) ?? null;
  const baseNumber = workspace?.draft?.baseVersionId
    ? ready.find((row) => row.id === workspace.draft?.baseVersionId)?.number
    : null;
  const error = loadError ?? snap.error;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          {snap.mode === "draft" ? "Черновик новой версии" : "Сценарий"}
        </h2>
        <p className="text-sm text-muted">
          {snap.mode === "draft"
            ? baseNumber
              ? `На основе версии ${baseNumber}`
              : "Новый черновик без номера"
            : "Готовые версии только для чтения. Правка начинается отдельной командой."}
        </p>
      </div>
      {error ? <ShellError message={error} onRetry={() => void load()} /> : null}
      {snap.status && !snap.saving ? <p className="text-sm text-muted">{snap.status}</p> : null}
      {workspace ? (
        <ScriptVersionTimeline
          versions={ready}
          viewingId={viewingId}
          headId={workspace.headId}
          finalScriptId={workspace.finalScriptId}
          onView={(id) => {
            setViewingId(id);
            if (snap.mode === "ready") setViewing(null);
          }}
        />
      ) : (
        <ShellLoading label="Загрузка версий…" />
      )}
      {snap.mode === "ready" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="vocal-btn"
              onClick={() => void openDraft().catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))}
            >
              {workspace?.draft ? "Продолжить черновик" : "Создать новую версию"}
            </button>
            <button
              type="button"
              className="vocal-btn text-sm"
              disabled={helping}
              onClick={() => {
                if (!onHelpWithScript) return;
                setHelping(true);
                void Promise.resolve(onHelpWithScript())
                  .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))
                  .finally(() => setHelping(false));
              }}
            >
              {helping ? "Просим…" : "Помочь со сценарием"}
            </button>
            <CanonicalExportActions
              disabled={!viewing?.body || !isHeadKind(viewing.kind)}
              filename={sanitizeExportFilename("сценарий")}
              text={
                viewing?.body && isHeadKind(viewing.kind)
                  ? buildCanonicalExportTxt({
                      title: currentMeta?.number ? `Версия ${currentMeta.number}` : "Сценарий",
                      scriptBody: viewing.body,
                    })
                  : ""
              }
            />
            <button
              type="button"
              className="vocal-btn text-sm"
              disabled={!viewingId || thoughtCompleted || !currentMeta}
              onClick={() => void setFinal().catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))}
            >
              {workspace?.finalScriptId === viewingId ? "Снять итоговую" : "Сделать итоговой"}
            </button>
          </div>
          {viewing ? (
            <article className="vocal-card space-y-2 p-4">
              <p className="text-sm text-muted">
                {currentMeta?.number ? `Версия ${currentMeta.number}` : "Версия"} · {currentMeta?.sourceLabel ?? viewing.kind}
              </p>
              <p className="whitespace-pre-wrap font-[family-name:var(--font-display)] text-lg leading-relaxed">
                {viewing.body}
              </p>
            </article>
          ) : workspace ? (
            <ShellEmpty title="Нет готовой версии" description="Сохраните первую версию или откройте черновик." />
          ) : null}
        </div>
      ) : (
        <ScriptDraftComposer
          draftBody={snap.body}
          saving={snap.saving}
          finalizing={snap.finalizing}
          status={snap.status}
          expectedUpdatedAt={snap.expectedUpdatedAt}
          helping={helping}
          onBodyChange={(body) => session.setBody(body)}
          onFinalize={() => void finalize()}
          onBackToReady={() => void session.backToReady()}
          onDelete={() => void removeDraft().catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))}
          onHelp={
            onHelpWithScript
              ? () => {
                  setHelping(true);
                  void Promise.resolve(onHelpWithScript())
                    .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))
                    .finally(() => setHelping(false));
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
