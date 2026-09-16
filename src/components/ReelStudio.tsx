"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RecordingView } from "@/components/RecordingView";
import { StudioJobWatch } from "@/components/StudioJobWatch";
import { ReelStudioFrame } from "@/components/ReelStudioFrame";
import { ReelTakes } from "@/components/ReelTakes";
import { ScriptEditor } from "@/components/ScriptEditor";
import { ThoughtDialogue } from "@/components/ThoughtDialogue";
import { ThoughtStudioHeader } from "@/components/ThoughtStudioHeader";
import { ConfirmActions, VocalModal } from "@/components/vocal-ui/VocalModal";
import { ShellEmpty, ShellError, ShellLoading } from "@/components/shell-status";
import { newDialogueIdempotencyKey } from "@/lib/dialogue-client";
import {
  parseStudioTab,
  studioThoughtHref,
  writeStudioTab,
  type StudioMobileTab,
} from "@/components/reel-studio";
import type { ReelStatus } from "@/types/reel";
import type { ScriptWorkspaceDto } from "@/types/script";

export function ReelStudio({ reelId }: { reelId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseStudioTab(searchParams.get("tab"));
  const [load, setLoad] = useState<"loading" | "missing" | "error" | "ok">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [scriptTick, setScriptTick] = useState(0);
  const [dialogTick, setDialogTick] = useState(0);
  const [takesTick, setTakesTick] = useState(0);
  const [hasReadyScript, setHasReadyScript] = useState(false);
  const [hasManualDraft, setHasManualDraft] = useState(false);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [scriptNumber, setScriptNumber] = useState<number | null>(null);
  const [thoughtTitle, setThoughtTitle] = useState("Мысль");
  const [recording, setRecording] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(false);
  const [watchJobId, setWatchJobId] = useState<string | null>(null);
  const [thoughtStatus, setThoughtStatus] = useState<ReelStatus>("idea");

  const refreshStudioAfterJob = useCallback((status: "done" | "error") => {
    setTakesTick((value) => value + 1);
    if (status === "done") {
      setScriptTick((value) => value + 1);
      setDialogTick((value) => value + 1);
      setWatchJobId(null);
    }
  }, []);

  function applyWorkspace(data: ScriptWorkspaceDto) {
    setHasReadyScript(Boolean(data.selectedScriptId));
    setHasManualDraft(Boolean(data.draft));
    setSelectedScriptId(data.selectedScriptId);
    const selected = data.versions.find((row) => row.id === data.selectedScriptId);
    setScriptNumber(selected?.number ?? null);
  }

  const loadThought = useCallback(async () => {
    setLoad("loading");
    setLoadError(null);
    try {
      const res = await fetch(`/api/reels/${reelId}`, { cache: "no-store" });
      const data = (await res.json()) as {
        reel?: { title?: string; status?: ReelStatus };
        error?: string;
        code?: string;
      };
      if (res.status === 404 || data.code === "REEL_NOT_FOUND") {
        setLoad("missing");
        return;
      }
      if (!res.ok || !data.reel) throw new Error(data.error ?? "Не удалось открыть мысль.");
      setThoughtTitle(data.reel.title ?? "Мысль");
      if (data.reel.status) setThoughtStatus(data.reel.status);
      setLoad("ok");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Ошибка.");
      setLoad("error");
    }
  }, [reelId]);

  useEffect(() => {
    void loadThought();
  }, [loadThought]);

  useEffect(() => {
    void fetch(`/api/reels/${reelId}/scripts`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: ScriptWorkspaceDto) => applyWorkspace(data))
      .catch(() => undefined);
  }, [reelId, scriptTick]);

  function changeTab(next: StudioMobileTab) {
    writeStudioTab(reelId, next);
    router.replace(studioThoughtHref(reelId, next), { scroll: false });
  }

  function openRecording() {
    if (!selectedScriptId) return;
    setDraftPrompt(false);
    setRecording(true);
    changeTab("takes");
  }

  function requestRecording() {
    if (!hasReadyScript || !selectedScriptId) return;
    if (hasManualDraft) {
      setDraftPrompt(true);
      return;
    }
    openRecording();
  }

  async function helpWithScript() {
    const res = await fetch(`/api/thoughts/${reelId}/dialogue/help`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: newDialogueIdempotencyKey() }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Не удалось попросить помощь.");
    setDialogTick((value) => value + 1);
    changeTab("dialog");
  }

  if (load === "loading") return <ShellLoading label="Загрузка мысли…" />;
  if (load === "missing") {
    return (
      <ShellEmpty
        title="Мысль не найдена"
        description="Проверьте ссылку или вернитесь к списку. Это не сохранённая мысль."
      />
    );
  }
  if (load === "error") {
    return <ShellError message={loadError ?? "Не удалось открыть мысль."} onRetry={() => void loadThought()} />;
  }

  const showTakes = recording || tab === "takes";

  return (
    <>
        <ReelStudioFrame
          header={<ThoughtStudioHeader title={thoughtTitle} status={thoughtStatus} />}
          tab={recording ? "takes" : tab}
          onTab={changeTab}
          hideTabs={recording}
          takes={
            showTakes ? (
            recording && selectedScriptId ? (
              <RecordingView
                reelId={reelId}
                thoughtTitle={thoughtTitle}
                scriptVersionId={selectedScriptId}
                scriptNumber={scriptNumber}
                onClose={() => setRecording(false)}
                onSaved={(info) => {
                  setTakesTick((value) => value + 1);
                  if (info.jobId) setWatchJobId(info.jobId);
                  setRecording(false);
                }}
              />
            ) : (
              <ReelTakes
                reelId={reelId}
                reloadToken={takesTick}
                canRecord={hasReadyScript}
                recordBlockedReason="Сначала нужна готовая версия сценария"
                recordScriptId={selectedScriptId}
                onTakeJobStarted={setWatchJobId}
                onStartVoiceRecord={requestRecording}
                thoughtCompleted={thoughtStatus === "completed"}
                onChanged={() => setTakesTick((value) => value + 1)}
              >
                {({ media }) => (
                  <div className="space-y-8">
                    {watchJobId ? <StudioJobWatch jobId={watchJobId} onSettled={refreshStudioAfterJob} /> : null}
                    {media}
                  </div>
                )}
              </ReelTakes>
            )
            ) : null
          }
          script={
            tab === "script" && !recording ? (
            <ScriptEditor
              reelId={reelId}
              reloadToken={scriptTick}
              thoughtCompleted={thoughtStatus === "completed"}
              onHelpWithScript={helpWithScript}
              onChanged={() => setScriptTick((value) => value + 1)}
            />
            ) : null
          }
          dialog={
            tab === "dialog" && !recording ? (
            <ThoughtDialogue
              key={`${reelId}:${dialogTick}`}
              reelId={reelId}
              draft={draft}
              onDraftChange={setDraft}
              hasReadyScript={hasReadyScript}
              onTransferred={() => {
                setScriptTick((value) => value + 1);
                changeTab("script");
              }}
              thoughtCompleted={thoughtStatus === "completed"}
              onGoRecord={requestRecording}
              onReopen={() => {
                void fetch(`/api/reels/${reelId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "in_progress" }),
                }).then((res) => {
                  if (!res.ok) return;
                  setThoughtStatus("in_progress");
                  setDialogTick((value) => value + 1);
                  setTakesTick((value) => value + 1);
                });
              }}
            />
            ) : null
          }
        />
      <VocalModal
        open={draftPrompt}
        title="Сначала закройте черновик"
        initialFocus="safe"
        onClose={() => setDraftPrompt(false)}
      >
        <p className="text-sm text-muted">
          Открыт ручной черновик. Завершите его или вернитесь к готовой версии — источник записи нельзя менять молча.
        </p>
        <ConfirmActions
          cancelLabel="Остаться"
          confirmLabel="К сценарию"
          onCancel={() => setDraftPrompt(false)}
          onConfirm={() => {
            setDraftPrompt(false);
            changeTab("script");
          }}
        />
      </VocalModal>
    </>
  );
}
