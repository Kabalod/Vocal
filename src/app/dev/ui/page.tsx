import { notFound } from "next/navigation";
import { isDevUiEnabled } from "@/components/vocal-ui/kit";
import { UiKitCatalog } from "@/components/vocal-ui/UiKitCatalog";

export default function DevUiPage() {
  if (!isDevUiEnabled()) notFound();
  return (
    <div>
      <h1 className="mb-2 font-[family-name:var(--font-display)] text-2xl">Каталог UI</h1>
      <UiKitCatalog />
    </div>
  );
}
