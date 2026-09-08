"use client";

import { ReelContextForm } from "@/components/ReelContextForm";
import { ReelStudioFrame } from "@/components/ReelStudioFrame";
import { ReelTakes } from "@/components/ReelTakes";
import { ReelWorkspace } from "@/components/ReelWorkspace";
import { ScriptEditor } from "@/components/ScriptEditor";
import { TakeComparison } from "@/components/TakeComparison";

export function ReelStudio({ reelId }: { reelId: string }) {
  return (
    <ReelTakes reelId={reelId}>
      {({ media, vocal }) => (
        <ReelStudioFrame
          header={<ReelWorkspace id={reelId} />}
          left={<ScriptEditor reelId={reelId} />}
          panels={{
            vocal,
            takes: media,
            context: <ReelContextForm reelId={reelId} />,
            compare: <TakeComparison reelId={reelId} />,
          }}
        />
      )}
    </ReelTakes>
  );
}
