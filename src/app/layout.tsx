import type { Metadata } from "next";
import { Literata, Manrope } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
});

const literata = Literata({
  subsets: ["latin", "cyrillic"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: "Vocal — идеи и разбор разговорного видео",
  description:
    "Карточки идей до видео и разбор загруженного ролика: сценарий, идея и стиль.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${manrope.variable} ${literata.variable} font-sans antialiased`}>
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 pb-16">
          <header className="flex items-center justify-between gap-4 py-6">
            <Link href="/" className="group">
              <p className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
                Vocal
              </p>
              <p className="text-xs text-muted group-hover:text-text/80">
                речь → совет на дубль
              </p>
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              <Link
                href="/reels"
                className="rounded-full px-3 py-1.5 text-muted hover:bg-accent-dim hover:text-text"
              >
                Мои ролики
              </Link>
              <Link
                href="/"
                className="rounded-full px-3 py-1.5 text-muted hover:bg-accent-dim hover:text-text"
              >
                Загрузка
              </Link>
              <Link
                href="/history"
                className="rounded-full px-3 py-1.5 text-muted hover:bg-accent-dim hover:text-text"
              >
                История
              </Link>
              <Link
                href="/settings"
                className="rounded-full px-3 py-1.5 text-muted hover:bg-accent-dim hover:text-text"
              >
                Критерии
              </Link>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
