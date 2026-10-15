"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CanonicalExportIconButtons } from "@/components/CanonicalExportActions";
import { ScriptDraftComposer } from "@/components/ScriptDraftComposer";
import { splitParagraphs } from "@/components/thought-desktop";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { ActionSheet } from "@/components/vocal-ui/ActionSheet";
import { IconButton } from "@/components/vocal-ui/IconButton";
import { ChevronDown, Check, MoreHorizontal, Pencil, Sparkles } from "lucide-react";
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
  desktop = false,
  generateRequested = false,
  onGenerateHandled,
  onHelp,
}: {
  reelId: string;
  reloadToken?: number;
  thoughtCompleted?: boolean;
  onChanged?: () => void;
  onAnswerQuestion?: (question: { text: string; gapId: string | null }) => void;
  /** P3a: versions list on the left, reader on the right (from the desktop shell breakpoint). */
  desktop?: boolean;
  /** Set by the dialogue chip "Собрать сценарий": start the existing generation once, then `onGenerateHandled` clears it. */
  generateRequested?: boolean;
  onGenerateHandled?: () => void;
  /** "Помочь со сценарием": goes to the dialogue. */
  onHelp?: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
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
    // A chip click is the only thing that generates from here; merely opening the tab never does.
    if (!generateRequested || !workspace) return;
    onGenerateHandled?.();
    if (!workspace.canGenerate || thoughtCompleted || generating || snap.mode !== "ready") return;
    void generate(keyStateRef.current.nextExplicitKey).catch((err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateRequested, workspace]);

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

  const notices = (
    <>
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
      {generating && !desktop ? <p className="text-sm text-muted">Собираем сценарий…</p> : null}
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
    </>
  );

  if (desktop) {
    const sorted = [...ready].sort((x, y) => (y.number ?? 0) - (x.number ?? 0));
    const reading = viewing && isHeadKind(viewing.kind) ? splitParagraphs(viewing.body) : [];
    const isFinal = Boolean(viewingId) && workspace?.finalScriptId === viewingId;
    const isCurrent = Boolean(viewingId) && workspace?.headId === viewingId;
    const buildDisabled = generating || thoughtCompleted || !workspace?.canGenerate || snap.mode !== "ready";
    const failOpen = (err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка.");
    return (
      <section
        className="grid grid-cols-[260px_minmax(0,1fr)] items-start gap-6"
        data-script-phase={phase}
        data-script-generating={generating ? "1" : "0"}
        data-script-stale-target={staleTarget}
        data-script-desktop
      >
        <aside aria-label="Версии сценария" className="space-y-3">
          <ActionButton
            variant="primary"
            className="w-full"
            disabled={buildDisabled}
            onClick={() => void generate(keyStateRef.current.nextExplicitKey).catch(failOpen)}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {generating ? "Собираем…" : "Собрать новую версию"}
          </ActionButton>
          <h2 className="pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Версии</h2>
          {workspace ? (
            sorted.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {sorted.map((row) => {
                  const selected = row.id === viewingId;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        data-script-version={row.id}
                        onClick={() => void selectVersion(row.id)}
                        className={`flex w-full flex-col gap-1.5 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                          selected ? "border-accent/60 bg-accent/10" : "border-line bg-white/[0.02] hover:bg-white/[0.05]"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          {row.number ? `Версия ${row.number}` : "Версия"}
                          {row.id === workspace.headId ? <em className="text-[11px] font-medium not-italic text-accent-soft">текущая</em> : null}
                          {row.id === workspace.finalScriptId ? (
                            <b className="ml-auto rounded-md border border-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-text-soft">
                              итоговая
                            </b>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted">{row.sourceLabel}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Версий пока нет.</p>
            )
          ) : (
            <ShellLoading label="Загрузка версий…" />
          )}
        </aside>
        <article
          aria-label="Ридер сценария"
          aria-busy={generating}
          className="flex min-w-0 flex-col rounded-[14px] border border-line bg-white/[0.02] px-8 pb-7 pt-6"
        >
          <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-soft">
                {snap.mode === "draft"
                  ? baseNumber
                    ? `Черновик · на основе версии ${baseNumber}`
                    : "Черновик"
                  : currentMeta
                    ? `${currentMeta.number ? `Версия ${currentMeta.number}` : "Версия"}${isCurrent ? " · текущая" : ""}${isFinal ? " · итоговая" : ""}`
                    : "Версий пока нет"}
              </p>
            </div>
            {snap.mode === "ready" ? (
              <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
                {viewing && isHeadKind(viewing.kind) ? (
                  <CanonicalExportIconButtons
                    disabled={!viewing.body || generating}
                    filename={sanitizeExportFilename("сценарий")}
                    text={viewing.body ? buildCanonicalExportTxt({ title: versionTitle, scriptBody: viewing.body }) : ""}
                  />
                ) : null}
                <ActionButton
                  variant="secondary"
                  disabled={generating || (!workspace?.draft && !currentMeta)}
                  onClick={() => void openDraft().catch(failOpen)}
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  {workspace?.draft ? "Продолжить черновик" : "Редактировать"}
                </ActionButton>
                <ActionButton variant="ghost" disabled={generating} onClick={() => onHelp?.()}>
                  Помочь со сценарием
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  disabled={!viewingId || thoughtCompleted || !currentMeta || generating}
                  onClick={() => void setFinal().catch(failOpen)}
                >
                  {isFinal ? (
                    <>
                      <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Итоговый
                    </>
                  ) : (
                    "Сделать итоговым"
                  )}
                </ActionButton>
              </div>
            ) : null}
          </header>
          <div className="mb-4 space-y-4">{notices}</div>
          {generating ? (
            <div role="status" aria-live="polite" className="max-w-[64ch] space-y-3" data-script-building>
              <p className="text-sm text-text-soft">Vocal собирает сценарий…</p>
              {[92, 100, 78, 96, 64].map((width, index) => (
                <div key={index} className="h-4 animate-pulse rounded bg-white/[0.07]" style={{ width: `${width}%` }} />
              ))}
            </div>
          ) : snap.mode === "draft" ? (
            <ScriptDraftComposer
              draftBody={snap.body}
              saving={snap.saving}
              finalizing={snap.finalizing}
              status={snap.status}
              expectedUpdatedAt={snap.expectedUpdatedAt}
              onBodyChange={(body) => session.setBody(body)}
              onFinalize={() => void finalize()}
              onBackToReady={() => void session.backToReady()}
              onDelete={() => void removeDraft().catch(failOpen)}
            />
          ) : viewing ? (
            <>
              <div
                className="max-w-[64ch] font-[family-name:var(--font-display)] text-xl font-normal leading-[1.65]"
                data-script-reader-text
              >
                {reading.map((paragraph, index) => (
                  <p key={index} className="mb-5 whitespace-pre-wrap">
                    {paragraph}
                  </p>
                ))}
              </div>
            </>
          ) : workspace ? (
            <div className="space-y-4">
              {workspace.base && !thoughtCompleted ? (
                <div className="vocal-card space-y-2 p-4" data-script-base>
                  <p className="text-sm font-medium">{workspace.base.label}</p>
                  <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-muted">{workspace.base.text}</p>
                </div>
              ) : null}
              {workspace.understanding && !thoughtCompleted ? (
                <div className="vocal-card p-4" data-script-understanding>
                  <p className="text-sm">{workspace.understanding}</p>
                </div>
              ) : null}
              <ShellEmpty title="Нет готовой версии" description="Соберите сценарий кнопкой или напишите черновик вручную." />
            </div>
          ) : (
            <ShellLoading label="Загрузка сценария…" />
          )}
          {!generating && snap.mode === "ready" && workspace && workspace.viewingChanges.length > 0 ? (
            <details className="group mt-6 border-t border-line pt-4" data-script-changes key={viewingId ?? "none"}>
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-text-soft [&::-webkit-details-marker]:hidden">
                Что изменено
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={1.5} aria-hidden="true" />
              </summary>
              <ul className="mt-3.5 flex flex-col gap-2">
                {workspace.viewingChanges.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[13px] leading-normal text-text-soft">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" strokeWidth={1.75} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </article>
      </section>
    );
  }

  // P4 (touch): one column. Versions as a row of pills, the reader, "что изменено" folded; the actions sit in a bottom bar above the tab bar.
  const sortedTouch = [...ready].sort((x, y) => (y.number ?? 0) - (x.number ?? 0));
  const touchReading = viewing && isHeadKind(viewing.kind) ? splitParagraphs(viewing.body) : [];
  const touchFinal = Boolean(viewingId) && workspace?.finalScriptId === viewingId;
  const touchCurrent = Boolean(viewingId) && workspace?.headId === viewingId;
  const touchFail = (err: unknown) => setLoadError(err instanceof Error ? err.message : "Ошибка.");
  const touchBuildDisabled = generating || thoughtCompleted || !workspace?.canGenerate || snap.mode !== "ready";
  return (
    <section
      className="space-y-4"
      data-script-phase={phase}
      data-script-generating={generating ? "1" : "0"}
      data-script-stale-target={staleTarget}
      data-script-touch
    >
      {snap.mode === "ready" && workspace && sortedTouch.length > 0 ? (
        <ul aria-label="Версии сценария" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [&>li]:shrink-0">
          {sortedTouch.map((row) => {
            const selected = row.id === viewingId;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  data-press
                  aria-current={selected ? "true" : undefined}
                  data-script-version={row.id}
                  onClick={() => void selectVersion(row.id)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm ${
                    selected ? "border-accent/60 bg-accent/10 text-text" : "border-line bg-white/[0.03] text-muted"
                  }`}
                >
                  {row.number ? `Версия ${row.number}` : "Версия"}
                  {row.id === workspace.finalScriptId ? <Check className="h-3.5 w-3.5 text-accent-soft" aria-label="итоговая" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="space-y-4">{notices}</div>
      {snap.mode === "ready" ? (
        generating ? (
          <div role="status" aria-live="polite" className="space-y-3" data-script-building>
            <p className="text-sm text-text-soft">Vocal собирает сценарий…</p>
            {[92, 100, 78, 96, 64].map((width, index) => (
              <div key={index} className="h-4 animate-pulse rounded bg-white/[0.07]" style={{ width: `${width}%` }} />
            ))}
          </div>
        ) : viewing ? (
          <article aria-label="Ридер сценария" className="space-y-3">
            <header className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-soft">
                {currentMeta
                  ? `${currentMeta.number ? `Версия ${currentMeta.number}` : "Версия"}${touchCurrent ? " · текущая" : ""}${touchFinal ? " · итоговая" : ""}`
                  : "Сценарий"}
              </p>
              {isHeadKind(viewing.kind) ? (
                <CanonicalExportIconButtons
                  disabled={!viewing.body}
                  filename={sanitizeExportFilename("сценарий")}
                  text={viewing.body ? buildCanonicalExportTxt({ title: versionTitle, scriptBody: viewing.body }) : ""}
                />
              ) : null}
            </header>
            <div className="font-[family-name:var(--font-display)] text-[19px] font-normal leading-[1.65]" data-script-reader-text>
              {touchReading.map((paragraph, index) => (
                <p key={index} className="mb-4 whitespace-pre-wrap">
                  {paragraph}
                </p>
              ))}
            </div>
            {workspace && workspace.viewingChanges.length > 0 ? (
              <details className="group border-t border-line pt-3" data-script-changes key={viewingId ?? "none"}>
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-text-soft [&::-webkit-details-marker]:hidden">
                  Что изменено
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={1.5} aria-hidden="true" />
                </summary>
                <ul className="mt-2 flex flex-col gap-2">
                  {workspace.viewingChanges.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm leading-normal text-text-soft">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" strokeWidth={1.75} aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </article>
        ) : workspace ? (
          <div className="space-y-4">
            {workspace.base && !thoughtCompleted ? (
              <div className="vocal-card space-y-2 p-4" data-script-base>
                <p className="text-sm font-medium">{workspace.base.label}</p>
                <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-muted">{workspace.base.text}</p>
              </div>
            ) : null}
            {workspace.understanding && !thoughtCompleted ? (
              <div className="vocal-card p-4" data-script-understanding>
                <p className="text-sm">{workspace.understanding}</p>
              </div>
            ) : null}
            <ShellEmpty title="Нет готовой версии" description="Соберите сценарий кнопкой или напишите черновик вручную." />
          </div>
        ) : (
          <ShellLoading label="Загрузка сценария…" />
        )
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
          onDelete={() => void removeDraft().catch(touchFail)}
        />
      )}
      {snap.mode === "ready" ? (
        <div
          data-script-actionbar
          className="fixed inset-x-0 bottom-[var(--tabbar-h)] z-30 flex items-center gap-2 border-t border-line bg-bg/95 px-3 py-2 backdrop-blur [:root[data-kb-open]_&]:hidden"
        >
          <ActionButton
            variant="primary"
            className="min-w-0 flex-1"
            fullWidth
            disabled={touchBuildDisabled}
            onClick={() => void generate(keyStateRef.current.nextExplicitKey).catch(touchFail)}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {generating ? "Собираем…" : "Собрать новую версию"}
          </ActionButton>
          <ActionButton
            variant="secondary"
            disabled={generating || (!workspace?.draft && !currentMeta)}
            onClick={() => void openDraft().catch(touchFail)}
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {workspace?.draft ? "Продолжить" : "Править"}
          </ActionButton>
          <IconButton label="Ещё действия" disabled={generating} onClick={() => setMoreOpen(true)}>
            <MoreHorizontal aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
      <ActionSheet
        open={moreOpen}
        title={versionTitle}
        actions={[
          { id: "final", label: touchFinal ? "Снять итоговую" : "Сделать итоговым", disabled: !viewingId || thoughtCompleted || !currentMeta || generating },
          { id: "help", label: "Помочь со сценарием", disabled: generating },
        ]}
        onClose={() => setMoreOpen(false)}
        onSelect={(id) => {
          setMoreOpen(false);
          if (id === "final") void setFinal().catch(touchFail);
          else onHelp?.();
        }}
      />
    </section>
  );
}
