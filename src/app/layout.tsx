import type { Metadata } from "next";
import { Inter, Literata } from "next/font/google";
import { VocalAppShell } from "@/components/VocalAppShell";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const literata = Literata({
  subsets: ["latin", "cyrillic"],
  variable: "--font-literata",
  display: "swap",
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
      <body className={`${inter.variable} ${literata.variable} overflow-x-hidden font-sans antialiased`}>
        <VocalAppShell>{children}</VocalAppShell>
      </body>
    </html>
  );
}
