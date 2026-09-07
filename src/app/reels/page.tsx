import { ReelList } from "@/components/ReelList";

export default function ReelsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl">Мои ролики</h1>
        <p className="mt-2 text-muted">Идеи живут до видео. Ключ Groq для этого экрана не нужен.</p>
      </div>
      <ReelList />
    </div>
  );
}
