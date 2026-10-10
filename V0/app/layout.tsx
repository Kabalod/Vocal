import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Literata, Inter } from 'next/font/google'
import './globals.css'

const newsreader = Literata({ subsets: ['latin', 'cyrillic'], weight: ['400', '500'], display: 'swap', variable: '--font-serif' })
const inter = Inter({ subsets: ['latin', 'cyrillic'], display: 'swap', variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Vocal — Привычка и мотивация',
  description: 'Камерный инструмент, который помогает развить мысль и собрать разговорный сценарий.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#131315',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru">
      <body className={`antialiased ${newsreader.variable} ${inter.variable}`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
