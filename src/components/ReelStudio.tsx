"use client";

import { useEffect, useState } from "react";
import { RecordingView } from "@/components/RecordingView";
import { ReelContextForm } from "@/components/ReelContextForm";
import { ReelStudioFrame } from "@/components/ReelStudioFrame";
import { ReelTakes } from "@/components/ReelTakes";
import { ReelWorkspace } from "@/components/ReelWorkspace";
import { ScriptEditor } from "@/components/ScriptEditor";
import { TakeComparison } from "@/components/TakeComparison";
import { ThoughtDialogue } from "@/components/ThoughtDialogue";
import { ConfirmActions, VocalModal } from "@/components/vocal-ui/VocalModal";
import { newDialogueIdempotencyKey } from "@/lib/dialogue-client";
import { readStudioTab, writeStudioTab, type StudioMobileTab } from "@/components/reel-studio";
import type { ScriptWorkspaceDto } from "@/types/script";

export function ReelStudio({ reelId }: { reelId: string }) {
  const [tab, setTab] = useState<StudioMobileTab>("script");
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

  function applyWorkspace(data: ScriptWorkspaceDto) {
    setHasReadyScript(Boolean(data.selectedScriptId));
    setHasManualDraft(Boolean(data.draft));
    setSelectedScriptId(data.selectedScriptId);
    const selected = data.versions.find((row) => row.id === data.selectedScriptId);
    setScriptNumber(selected?.number ?? null);
  }

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 75rem)").matches;
    setTab(readStudioTab(reelId, wide ? "script" : "dialog"));
    void fetch(`/api/reels/${reelId}/scripts`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: ScriptWorkspaceDto) => applyWorkspace(data))
      .catch(() => undefined);
    void fetch(`/api/reels/${reelId}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { reel?: { title?: string } }) => {
        if (data.reel?.title) setThoughtTitle(data.reel.title);
      })
      .catch(() => undefined);
  }, [reelId, scriptTick]);

  function changeTab(next: StudioMobileTab) {
    setTab(next);
    writeStudioTab(reelId, next);
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
    if (!window.matchMedia("(min-width: 75rem)").matches) changeTab("dialog");
  }

  return (
    <>
    <ReelTakes
      reelId={reelId}
      reloadToken={takesTick}
      canRecord={hasReadyScript}
      recordBlockedReason="Сначала нужна готовая версия сценария"
      onStartVoiceRecord={requestRecording}
    >
      {({ media }) => (
        <ReelStudioFrame
          header={<ReelWorkspace id={reelId} />}
          tab={tab}
          onTab={changeTab}
          hideTabs={recording}
          takes={
            recording && selectedScriptId ? (
              <RecordingView
                reelId={reelId}
                thoughtTitle={thoughtTitle}
                scriptVersionId={selectedScriptId}
                scriptNumber={scriptNumber}
                onClose={() => setRecording(false)}
                onSaved={() => setTakesTick((value) => value + 1)}
              />
            ) : (
              <div className="space-y-8">
                {media}
                <ReelContextForm reelId={reelId} />
                <TakeComparison reelId={reelId} />
              </div>
            )
          }
          script={
            <ScriptEditor reelId={reelId} reloadToken={scriptTick} onHelpWithScript={helpWithScript} />
          }
          dialog={
            <ThoughtDialogue
              key={`${reelId}:${dialogTick}`}
              reelId={reelId}
              draft={draft}
              onDraftChange={setDraft}
              hasReadyScript={hasReadyScript}
              onTransferred={() => {
                setScriptTick((value) => value + 1);
                if (!window.matchMedia("(min-width: 75rem)").matches) changeTab("script");
              }}
              onGoRecord={requestRecording}
            />
          }
        />
      )}
    </ReelTakes>
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
