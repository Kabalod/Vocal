import { Suspense } from "react";
import { ReelList } from "@/components/ReelList";
import { ShellLoading } from "@/components/shell-status";

export default function ReelsPage() {
  return (
    <Suspense fallback={<ShellLoading label="Загрузка мыслей…" />}>
      <ReelList />
    </Suspense>
  );
}
