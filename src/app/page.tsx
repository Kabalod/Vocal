import { SetupBanner } from "@/components/SetupBanner";
import { UploadDropzone } from "@/components/UploadDropzone";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="max-w-2xl space-y-4 pt-4">
        <p className="text-sm uppercase tracking-[0.2em] text-accent">MVP</p>
        <h1 className="font-[family-name:var(--font-display)] text-5xl leading-tight">
          Идея, затем дубль
        </h1>
        <p className="text-base leading-relaxed text-muted">
          Карточка мысли живёт до видео. Создайте идею в «Мои ролики» без ключа Groq. Готовый
          ролик по-прежнему можно загрузить ниже: старый разбор и история не исчезают.
        </p>
        <Link
          href="/reels"
          className="inline-flex rounded-full bg-accent px-4 py-2 text-sm text-[#1a140c]"
        >
          Мои ролики
        </Link>
      </section>
      <SetupBanner />
      <UploadDropzone />
    </div>
  );
}
