import { ShellEmpty } from "@/components/shell-status";

export default function NotFound() {
  return (
    <ShellEmpty title="Страница не найдена" description="Проверьте адрес или вернитесь к записям." href="/reels" hrefLabel="К мыслям" />
  );
}
