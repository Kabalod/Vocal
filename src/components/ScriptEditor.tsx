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
import {
  applyScriptGenerateResult,
  beginScriptGeneratePost,
  newScriptGenerateKey,
  retryScriptGenerateKey,
  type ScriptGenerateFaultKind,
  type ScriptGenerateKeyState,
} from "@/lib/v05-generate-keys";

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
  return newScriptGenerateKey();
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
  const [generateFault, setGenerateFault] = useState<{ kind: ScriptGenerateFaultKind; message: string } | null>(null);
  const initialKey = useRef(newGenerateKey());
  const keyStateRef = useRef<ScriptGenerateKeyState>({
    postedKey: initialKey.current,
    nextExplicitKey: initialKey.current,
  });
  const guardRef = useRef(new GenerationGuard());
  const skipAutosave = useRef(false);
  const reelIdRef = useRef(reelId);
  reelIdRef.current = reelId;
  const sessionRef = useRef<ScriptDraftSaveSession | null>(null);
  if (!sessionRef.current) sessionRef.current = createDraftSession(reelIdRef);
  const session = sessionRef.current;
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  const viewingIdRef = useRef<string | null>(null);
  viewingIdRef.current = viewingId;

  const applyWorkspace = useCallback((next: ScriptWorkspaceDto, keepDraftText: boolean) => {
    setWorkspace(next);
    if (next.viewing) {
      setViewingId(next.viewing.id);
      setViewing(next.viewing);
    } else {
      const fallback = next.headId ?? next.versions.find((row) => isHeadKind(row.kind))?.id ?? null;
      setViewingId(fallback);
      setViewing(null);
    }
    session.hydrate(next.draft, keepDraftText);
    if (next.draft && !keepDraftText && !session.hasUnsavedLocalEdits()) skipAutosave.current = true;
  }, [session]);

  const load = useCallback(
    async (view?: string | null) => {
      const selected = view !== undefined ? view : viewingIdRef.current;
      const query = selected ? `?view=${encodeURIComponent(selected)}` : "";
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

  async function selectVersion(id: string) {
    setViewingId(id);
    setLoadError(null);
    const token = guardRef.current.begin();
    try {
      const res = await fetch(`/api/reels/${reelId}/scripts?view=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить версию.");
      if (!token.isCurrent()) return;
      applyWorkspace(data as ScriptWorkspaceDto, false);
    } catch (err: unknown) {
      if (!token.isCurrent()) return;
      setLoadError(err instanceof Error ? err.message : "Ошибка.");
    }
  }

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

  async function generate(explicitKey?: string) {
    setLoadError(null);
    setGenerateFault(null);
    setGenerating(true);
    keyStateRef.current = beginScriptGeneratePost(keyStateRef.current, explicitKey);
    const key = keyStateRef.current.postedKey;
    try {
      const res = await fetch(`/api/reels/${reelId}/scripts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: key }),
      });
      const data = await res.json() as ScriptWorkspaceDto & { error?: string; code?: string };
      const applied = applyScriptGenerateResult(keyStateRef.current, {
        ok: res.ok,
        code: typeof data.code === "string" ? data.code : null,
        makeKey: newGenerateKey,
      });
      keyStateRef.current = applied.state;
      if (!res.ok) {
        const message =
          applied.fault === "inflight"
            ? "Сбор сценария уже выполняется. Подождите или повторите тот же запрос."
            : typeof data.error === "string"
              ? data.error
              : "Не удалось собрать сценарий.";
        setGenerateFault({ kind: applied.fault ?? "error", message });
        const fresh = await fetch(`/api/reels/${reelId}/scripts`, { cache: "no-store" });
        if (fresh.ok) applyWorkspace((await fresh.json()) as ScriptWorkspaceDto, true);
        return;
      }
      applyWorkspace(data, false);
      onChanged?.();
    } catch (err: unknown) {
      const applied = applyScriptGenerateResult(keyStateRef.current, {
        ok: false,
        networkError: true,
        makeKey: newGenerateKey,
      });
      keyStateRef.current = applied.state;
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
    const payload =
      snap.mode === "draft" && workspace?.draft
        ? { draftId: workspace.draft.id, expectedSaveToken: snap.expectedSaveToken ?? workspace.draft.saveToken }
        : { versionId: viewingId };
    const res = await fetch(`/api/reels/${reelId}/scripts/keep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
  const viewingStale = Boolean(workspace?.viewingStale);
  const draftStale = Boolean(workspace?.draftStale);
  const bannerStale = snap.mode === "draft" ? draftStale : viewingStale;
  const staleTarget = snap.mode === "draft" ? "draft" : "viewing";
  const versionTitle = currentMeta?.number ? `Сценарий, версия ${currentMeta.number}` : "Черновик сценария";

  return (
    <section className="space-y-4" data-script-phase={phase} data-script-generating={generating ? "1" : "0"} data-script-stale-target={staleTarget}>
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
            onClick={() => void generate(retryScriptGenerateKey(keyStateRef.current, "conflict"))}
          >
            Повторить сбор
          </button>
        </div>
      ) : null}
      {generateFault?.kind === "error" || generateFault?.kind === "inflight" ? (
        <div data-script-fault={generateFault.kind}>
          <ShellError
            message={generateFault.message}
            onRetry={() => void generate(retryScriptGenerateKey(keyStateRef.current, generateFault.kind))}
          />
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
      {workspace && bannerStale ? (
        <div className="vocal-card space-y-3 p-4" data-script-stale-banner={staleTarget}>
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
              onClick={() => void generate(keyStateRef.current.nextExplicitKey).catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))}
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
            void selectVersion(id);
          }}
        />
      ) : (
        <ShellLoading label="Загрузка версий…" />
      )}
      {workspace?.base && !thoughtCompleted ? (
        <div className="vocal-card space-y-2 p-4" data-script-base>
          <p className="text-sm font-medium">{workspace.base.label}</p>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-muted">{workspace.base.text}</p>
        </div>
      ) : null}
      {workspace?.understanding && !generating && !thoughtCompleted && (workspace.readyCount === 0 || workspace.stale) ? (
        <div className="vocal-card p-4" data-script-understanding>
          <p className="text-sm">{workspace.understanding}</p>
        </div>
      ) : null}
      {workspace && workspace.viewingChanges.length > 0 ? (
        <div className="vocal-card space-y-2 p-4" data-script-changes>
          <p className="text-sm font-medium">Что изменено и почему</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {workspace.viewingChanges.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {snap.mode === "ready" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="vocal-btn vocal-btn-primary"
              disabled={generating || thoughtCompleted || !workspace?.canGenerate}
              onClick={() => void generate(keyStateRef.current.nextExplicitKey).catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."))}
            >
              {generating ? "Собираем…" : "Сгенерировать сценарий"}
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
