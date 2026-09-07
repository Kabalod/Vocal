import { ReelContextForm } from "@/components/ReelContextForm";
import { ReelTakes } from "@/components/ReelTakes";
import { ReelWorkspace } from "@/components/ReelWorkspace";
import { ScriptEditor } from "@/components/ScriptEditor";
import { TakeComparison } from "@/components/TakeComparison";

export default async function ReelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-10">
      <ReelWorkspace id={id} />
      <ReelContextForm reelId={id} />
      <ReelTakes reelId={id} />
      <ScriptEditor reelId={id} />
      <TakeComparison reelId={id} />
    </div>
  );
}

