"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScriptVersionTimeline } from "@/components/ScriptVersionTimeline";
import { ShellEmpty, ShellError, ShellLoading } from "@/components/shell-status";
import { GenerationGuard } from "@/lib/generation-guard";
import { isHeadKind, type ScriptVersionDto, type ScriptWorkspaceDto } from "@/types/script";

function readyVersions(workspace: ScriptWorkspaceDto) {
  return workspace.versions.filter((row) => isHeadKind(row.kind));
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ScriptEditor({
  reelId,
  reloadToken = 0,
  onHelpWithScript,
}: {
  reelId: string;
  reloadToken?: number;
  onHelpWithScript?: () => Promise<void> | void;
}) {
  const [workspace, setWorkspace] = useState<ScriptWorkspaceDto | null>(null);
  const [viewing, setViewing] = useState<ScriptVersionDto | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [mode, setMode] = useState<"ready" | "draft">("ready");
  const [draftBody, setDraftBody] = useState("");
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [expectedSaveToken, setExpectedSaveToken] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [helping, setHelping] = useState(false);
  const guardRef = useRef(new GenerationGuard());
  const skipAutosave = useRef(false);
  const draftBodyRef = useRef("");
  const expectedUpdatedAtRef = useRef<string | null>(null);
  const expectedSaveTokenRef = useRef<number | null>(null);
  const savedBodyRef = useRef<string | null>(null);

  draftBodyRef.current = draftBody;
  expectedUpdatedAtRef.current = expectedUpdatedAt;
  expectedSaveTokenRef.current = expectedSaveToken;
  savedBodyRef.current = workspace?.draft?.body ?? null;

  const applyWorkspace = useCallback((next: ScriptWorkspaceDto, keepDraftText: boolean) => {
    setWorkspace(next);
    const nextViewId = next.viewing?.id ?? next.headId ?? next.versions.find((row) => isHeadKind(row.kind))?.id ?? null;
    setViewingId((current) => current ?? nextViewId);
    if (next.viewing) setViewing(next.viewing);
    if (next.draft) {
      setExpectedUpdatedAt(next.draft.updatedAt);
      setExpectedSaveToken(next.draft.saveToken);
      if (!keepDraftText) {
        skipAutosave.current = true;
        setDraftBody(next.draft.body);
      }
    } else {
      setExpectedUpdatedAt(null);
      setExpectedSaveToken(null);
    }
  }, []);

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
        if (reloadToken > 0 && next.draft) setMode("draft");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load, reloadToken]);

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
        setError(err instanceof Error ? err.message : "Ошибка.");
      });
  }, [reelId, viewing, viewingId]);

  async function saveDraft(body: string, expected: string, token: number) {
    setSaving(true);
    setStatus("Сохраняем…");
    const res = await fetch(`/api/reels/${reelId}/scripts/draft`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, expectedUpdatedAt: expected, expectedSaveToken: token }),
    });
    const data = await res.json();
    if (res.status === 409) {
      const fresh = await fetch(`/api/reels/${reelId}/scripts`, { cache: "no-store" });
      const workspaceJson = (await fresh.json()) as ScriptWorkspaceDto;
      if (workspaceJson.draft) {
        setExpectedUpdatedAt(workspaceJson.draft.updatedAt);
        setExpectedSaveToken(workspaceJson.draft.saveToken);
      }
      setError("Черновик уже изменился в другом окне. Текст здесь не потерян.");
      setStatus(null);
      setSaving(false);
      throw new Error("Черновик уже изменился в другом окне. Текст здесь не потерян.");
    }
    if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить черновик.");
    applyWorkspace(data as ScriptWorkspaceDto, true);
    setError(null);
    setStatus("Сохранено");
    setSaving(false);
    return data as ScriptWorkspaceDto;
  }

  async function persistDraft() {
    const body = draftBodyRef.current;
    const expected = expectedUpdatedAtRef.current;
    const token = expectedSaveTokenRef.current;
    if (!expected || token == null) return null;
    if (savedBodyRef.current === body) {
      return { updatedAt: expected, saveToken: token };
    }
    const next = await saveDraft(body, expected, token);
    if (!next.draft) return null;
    return { updatedAt: next.draft.updatedAt, saveToken: next.draft.saveToken };
  }

  useEffect(() => {
    if (mode !== "draft" || !expectedUpdatedAt || expectedSaveToken == null || !workspace?.draft) return;
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    if (draftBody === workspace.draft.body) return;
    const timer = window.setTimeout(() => {
      void saveDraft(draftBody, expectedUpdatedAt, expectedSaveToken).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Ошибка.");
        setSaving(false);
      });
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- автосохранение только по тексту и метке
  }, [draftBody, expectedUpdatedAt, expectedSaveToken, mode, workspace?.draft?.id]);

  async function openDraft() {
    setError(null);
    const res = await fetch(`/api/reels/${reelId}/scripts/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseVersionId: viewingId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось открыть черновик.");
    applyWorkspace(data as ScriptWorkspaceDto, false);
    setMode("draft");
  }

  async function finalize() {
    const body = draftBodyRef.current;
    setFinalizing(true);
    setError(null);
    try {
      const persisted = await persistDraft();
      const expected = persisted?.updatedAt ?? expectedUpdatedAtRef.current;
      const token = persisted?.saveToken ?? expectedSaveTokenRef.current;
      if (!expected || token == null || !body.trim()) return;
      const res = await fetch(`/api/reels/${reelId}/scripts/draft/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, expectedUpdatedAt: expected, expectedSaveToken: token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось завершить версию.");
      applyWorkspace(data as ScriptWorkspaceDto, false);
      setMode("ready");
      setViewingId((data as ScriptWorkspaceDto).headId);
      setViewing((data as ScriptWorkspaceDto).viewing);
      setStatus("Готовая версия создана.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setFinalizing(false);
    }
  }

  async function backToReady() {
    setError(null);
    try {
      await persistDraft();
      setMode("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    }
  }

  async function removeDraft() {
    if (!window.confirm("Удалить черновик? Готовые версии не изменятся.")) return;
    const res = await fetch(`/api/reels/${reelId}/scripts/draft`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось удалить черновик.");
    applyWorkspace(data as ScriptWorkspaceDto, false);
    setMode("ready");
    setStatus("Черновик удалён.");
  }

  const ready = workspace ? readyVersions(workspace) : [];
  const currentMeta = ready.find((row) => row.id === viewingId) ?? null;
  const baseNumber = workspace?.draft?.baseVersionId
    ? ready.find((row) => row.id === workspace.draft?.baseVersionId)?.number
    : null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          {mode === "draft" ? "Черновик новой версии" : "Сценарий"}
        </h2>
        <p className="text-sm text-muted">
          {mode === "draft"
            ? baseNumber
              ? `На основе версии ${baseNumber}`
              : "Новый черновик без номера"
            : "Готовые версии только для чтения. Правка начинается отдельной командой."}
        </p>
      </div>
      {error ? <ShellError message={error} /> : null}
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      {workspace ? (
        <ScriptVersionTimeline
          versions={ready}
          viewingId={viewingId}
          headId={workspace.headId}
          finalScriptId={workspace.finalScriptId}
          onView={(id) => {
            setViewingId(id);
            if (mode === "ready") setViewing(null);
          }}
        />
      ) : (
        <ShellLoading label="Загрузка версий…" />
      )}
      {mode === "ready" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="vocal-btn"
              onClick={() => void openDraft().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."))}
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
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."))
                  .finally(() => setHelping(false));
              }}
            >
              {helping ? "Просим…" : "Помочь со сценарием"}
            </button>
            <button
              type="button"
              className="vocal-btn text-sm"
              disabled={!viewing?.body}
              onClick={() => viewing?.body && downloadText("scenario.txt", viewing.body)}
            >
              Скачать
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
        <div className="space-y-4">
          <p className="text-sm text-muted">{saving ? "Сохраняем…" : expectedUpdatedAt ? "Сохранено" : ""}</p>
          <textarea
            value={draftBody}
            onChange={(event) => {
              setDraftBody(event.target.value);
              setStatus(null);
            }}
            rows={16}
            placeholder="Текст новой версии"
            className="vocal-input min-h-[22rem] resize-y font-[family-name:var(--font-display)] text-lg leading-relaxed"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="vocal-btn vocal-btn-primary disabled:opacity-50"
              disabled={finalizing || saving || !draftBody.trim()}
              onClick={() => void finalize()}
            >
              {finalizing ? "Завершаем…" : "Завершить версию"}
            </button>
            <button
              type="button"
              className="vocal-btn disabled:opacity-50"
              disabled={finalizing || saving}
              onClick={() => void backToReady()}
            >
              К готовым версиям
            </button>
            <button
              type="button"
              className="vocal-btn text-sm"
              onClick={() => void removeDraft().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."))}
            >
              Удалить черновик
            </button>
            <button
              type="button"
              className="vocal-btn text-sm"
              disabled={helping}
              onClick={() => {
                if (!onHelpWithScript) return;
                setHelping(true);
                void Promise.resolve(onHelpWithScript())
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."))
                  .finally(() => setHelping(false));
              }}
            >
              {helping ? "Просим…" : "Помочь со сценарием"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
