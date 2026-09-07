import { SetupBanner } from "@/components/SetupBanner";
import { UploadDropzone } from "@/components/UploadDropzone";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="max-w-2xl space-y-4 pt-4">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">MVP</p>
        <h1 className="font-[family-name:var(--font-display)] text-5xl leading-tight">
          Помощник разговорного блога — не экзамен по ораторству
        </h1>
        <p className="text-base leading-relaxed text-muted">
          Загрузите ролик до 3 минут. Система расшифрует речь и подскажет, как в следующем
          дубле усилить сценарий, идею, стиль и подачу. Файл не режем: только текст, что
          сказать иначе. Опора — приёмы разговорных блогов, которые выросли за счёт живой
          речи, а не за счёт «подпишись».
        </p>
      </section>
      <SetupBanner />
      <UploadDropzone />
    </div>
  );
}
