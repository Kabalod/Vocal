import { ReelList } from "@/components/ReelList";

export default function ReelsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl">Записи</h1>
        <p className="mt-2 text-muted">Главный экран идей и роликов. Фильтры и поиск не вызывают ИИ.</p>
      </div>
      <ReelList />
    </div>
  );
}
