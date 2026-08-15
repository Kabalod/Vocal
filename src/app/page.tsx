import { SetupBanner } from "@/components/SetupBanner";
import { UploadDropzone } from "@/components/UploadDropzone";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="max-w-2xl space-y-4 pt-4">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">MVP</p>
        <h1 className="font-[family-name:var(--font-display)] text-5xl leading-tight">
          Загрузите разговорное видео — получите разбор для Instagram
        </h1>
        <p className="text-base leading-relaxed text-muted">
          Ролик до 3 минут. FFmpeg снимает звук, Groq расшифровывает речь, затем тренер
          оценивает хук, ясность, живой текст, связь со зрителем и финал. Не экзамен по
          ораторству: что уже работает и что поменять в следующем видео.
        </p>
      </section>
      <SetupBanner />
      <UploadDropzone />
    </div>
  );
}
