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

function newGenerateKey() {
  return `script-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ScriptEditor({
  reelId,
  reloadToken = 0,
  thoughtCompleted = false,
  onChanged,
  onAnswerQuestion,
}: {
  reelId: string;
  reloadToken?: number;
  thoughtCompleted?: boolean;
  onChanged?: () => void;
  onAnswerQuestion?: (question: { text: string; gapId: string | null }) => void;
}) {
  const [workspace, setWorkspace] = useState<ScriptWorkspaceDto | null>(null);
  const [viewing, setViewing] = useState<ScriptVersionDto | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generateFault, setGenerateFault] = useState<{ kind: "conflict" | "error"; message: string } | null>(null);
  const generateKeyRef = useRef(newGenerateKey());
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
    const preserve = keepDraftText || session.hasUnsavedLocalEdits();
    session.hydrate(next.draft, preserve);
    if (next.draft && !preserve) skipAutosave.current = true;
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

  async function generate(key = generateKeyRef.current) {
    setLoadError(null);
    setGenerateFault(null);
    setGenerating(true);
    try {
      const res = await fetch(`/api/reels/${reelId}/scripts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) generateKeyRef.current = newGenerateKey();
        const kind = res.status === 409 ? "conflict" : "error";
        setGenerateFault({ kind, message: typeof data.error === "string" ? data.error : "Не удалось собрать сценарий." });
        const fresh = await fetch(`/api/reels/${reelId}/scripts`, { cache: "no-store" });
        if (fresh.ok) applyWorkspace((await fresh.json()) as ScriptWorkspaceDto, true);
        return;
      }
      applyWorkspace(data as ScriptWorkspaceDto, session.hasUnsavedLocalEdits());
      setViewingId((data as ScriptWorkspaceDto).headId);
      setViewing((data as ScriptWorkspaceDto).viewing);
      generateKeyRef.current = newGenerateKey();
      onChanged?.();
    } catch (err: unknown) {
      setGenerateFault({
        kind: "error",
        message: err instanceof Error ? err.message : "Не удалось собрать сценарий.",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function keepCurrent() {
    setLoadError(null);
    const res = await fetch(`/api/reels/${reelId}/scripts/keep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionId: viewingId,
        draft: snap.mode === "draft" || (!viewingId && Boolean(workspace?.draft)),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось оставить сценарий.");
    applyWorkspace(data as ScriptWorkspaceDto, true);
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
  const phase = generating ? "generating" : workspace?.phase ?? "empty";
  const stale = Boolean(workspace?.stale);
  const versionTitle = currentMeta?.number ? `Сценарий, версия ${currentMeta.number}` : "Черновик сценария";

  return (
    <section className="space-y-4" data-script-phase={phase} data-script-generating={generating ? "1" : "0"}>
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          {snap.mode === "draft" ? "Черновик сценария" : "Сценарий"}
        </h2>
        <p className="text-sm text-muted">
          {snap.mode === "draft"
            ? baseNumber
              ? `На основе версии ${baseNumber}`
              : "Новый черновик без номера"
            : "Сценарий собирается только кнопкой на этой вкладке. Открытие вкладки ничего не генерирует."}
        </p>
      </div>
      {error ? <ShellError message={error} onRetry={() => void load()} /> : null}
      {generateFault?.kind === "conflict" ? (
        <div className="vocal-card space-y-3 p-4" data-script-fault="conflict" role="alert">
          <p className="text-sm">{generateFault.message} Черновик и готовые версии сохранены.</p>
          <button
            type="button"
            className="vocal-btn vocal-btn-primary"
            disabled={generating || thoughtCompleted}
            onClick={() => void generate(newGenerateKey())}
          >
            Повторить сбор
          </button>
        </div>
      ) : null}
      {generateFault?.kind === "error" ? (
        <div data-script-fault="error">
          <ShellError message={generateFault.message} onRetry={() => void generate()} />
        </div>
      ) : null}
      {generating ? <p className="text-sm text-muted">Собираем сценарий…</p> : null}
      {snap.status && !snap.saving ? <p className="text-sm text-muted">{snap.status}</p> : null}
      {workspace && workspace.blockReason && (phase === "not_ready" || workspace.readyCount > 0 || workspace.draft) ? (
        <div className="vocal-card space-y-3 p-4">
          <p className="text-sm">{workspace.blockReason}</p>
          {workspace.nextQuestion ? (
            <button
              type="button"
              className="vocal-btn vocal-btn-primary"
              onClick={() => onAnswerQuestion?.(workspace.nextQuestion!)}
            >
              Ответить на вопрос
            </button>
          ) : null}
        </div>
      ) : null}
      {workspace && stale ? (
        <div className="vocal-card space-y-3 p-4">
          <p className="text-sm">После создания сценария появились новые данные.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="vocal-btn"
              onClick={() => void keepCurrent().catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))}
            >
              Оставить
            </button>
            <button
              type="button"
              className="vocal-btn vocal-btn-primary"
              disabled={generating || !workspace.canGenerate}
              onClick={() => void generate(newGenerateKey()).catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))}
            >
              {generating ? "Собираем…" : "Обновить"}
            </button>
          </div>
        </div>
      ) : null}
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
              className="vocal-btn vocal-btn-primary"
              disabled={generating || thoughtCompleted || !workspace?.canGenerate}
              onClick={() => void generate().catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))}
            >
              {generating ? "Собираем…" : workspace?.readyCount ? "Собрать новую версию" : "Собрать сценарий"}
            </button>
            <button
              type="button"
              className="vocal-btn"
              onClick={() => void openDraft().catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))}
            >
              {workspace?.draft ? "Продолжить черновик" : "Редактировать"}
            </button>
            <CanonicalExportActions
              disabled={!viewing?.body || !isHeadKind(viewing.kind)}
              filename={sanitizeExportFilename("сценарий")}
              text={
                viewing?.body && isHeadKind(viewing.kind)
                  ? buildCanonicalExportTxt({
                      title: versionTitle,
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
                {versionTitle} · {currentMeta?.sourceLabel ?? viewing.kind}
              </p>
              <p className="whitespace-pre-wrap font-[family-name:var(--font-display)] text-lg leading-relaxed">
                {viewing.body}
              </p>
            </article>
          ) : workspace ? (
            <ShellEmpty title="Нет готовой версии" description="Соберите сценарий кнопкой или напишите черновик вручную." />
          ) : null}
        </div>
      ) : (
        <ScriptDraftComposer
          draftBody={snap.body}
          saving={snap.saving}
          finalizing={snap.finalizing}
          status={snap.status}
          expectedUpdatedAt={snap.expectedUpdatedAt}
          onBodyChange={(body) => session.setBody(body)}
          onFinalize={() => void finalize()}
          onBackToReady={() => void session.backToReady()}
          onDelete={() => void removeDraft().catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))}
        />
      )}
    </section>
  );
}
