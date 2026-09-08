import type { Metadata } from "next";
import { Literata, Manrope } from "next/font/google";
import { VocalAppShell } from "@/components/VocalAppShell";
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
      <body className={`${manrope.variable} ${literata.variable} overflow-x-hidden font-sans antialiased`}>
        <VocalAppShell>{children}</VocalAppShell>
      </body>
    </html>
  );
}
