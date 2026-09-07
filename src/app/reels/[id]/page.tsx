import { ReelTakes } from "@/components/ReelTakes";
import { ReelWorkspace } from "@/components/ReelWorkspace";

export default async function ReelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-10">
      <ReelWorkspace id={id} />
      <ReelTakes reelId={id} />
    </div>
  );
}
