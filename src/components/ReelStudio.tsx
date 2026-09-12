"use client";

import { useEffect, useState } from "react";
import { ReelContextForm } from "@/components/ReelContextForm";
import { ReelStudioFrame } from "@/components/ReelStudioFrame";
import { ReelTakes } from "@/components/ReelTakes";
import { ReelWorkspace } from "@/components/ReelWorkspace";
import { ScriptEditor } from "@/components/ScriptEditor";
import { TakeComparison } from "@/components/TakeComparison";
import { ThoughtDialogue } from "@/components/ThoughtDialogue";
import { newDialogueIdempotencyKey } from "@/lib/dialogue-client";
import { readStudioTab, writeStudioTab, type StudioMobileTab } from "@/components/reel-studio";

export function ReelStudio({ reelId }: { reelId: string }) {
  const [tab, setTab] = useState<StudioMobileTab>("script");
  const [draft, setDraft] = useState("");
  const [scriptTick, setScriptTick] = useState(0);
  const [dialogTick, setDialogTick] = useState(0);
  const [hasReadyScript, setHasReadyScript] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 75rem)").matches;
    setTab(readStudioTab(reelId, wide ? "script" : "dialog"));
    void fetch(`/api/reels/${reelId}/scripts`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { selectedScriptId?: string | null }) => setHasReadyScript(Boolean(data.selectedScriptId)))
      .catch(() => undefined);
  }, [reelId]);

  function changeTab(next: StudioMobileTab) {
    setTab(next);
    writeStudioTab(reelId, next);
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
    <ReelTakes reelId={reelId}>
      {({ media }) => (
        <ReelStudioFrame
          header={<ReelWorkspace id={reelId} />}
          tab={tab}
          onTab={changeTab}
          takes={
            <div className="space-y-8">
              {media}
              <ReelContextForm reelId={reelId} />
              <TakeComparison reelId={reelId} />
            </div>
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
              onGoRecord={() => changeTab("takes")}
            />
          }
        />
      )}
    </ReelTakes>
  );
}
