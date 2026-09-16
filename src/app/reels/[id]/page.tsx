import { Suspense } from "react";
import { ReelStudio } from "@/components/ReelStudio";
import { ShellLoading } from "@/components/shell-status";

export default async function ReelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<ShellLoading label="Загрузка мысли…" />}>
      <ReelStudio reelId={id} />
    </Suspense>
  );
}
