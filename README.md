# Vocal

Разбор публичных выступлений: видео → FFmpeg → Groq Whisper → оценка ораторства.

## Что нужно

- Node.js 22+
- Ключ [Groq](https://console.groq.com/) в `.env` (`GROQ_API_KEY`)
- FFmpeg подтягивается через `ffmpeg-static` / `ffprobe-static` (системный ставить не обязательно)

## Запуск

```bash
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

Откройте http://localhost:3000, вставьте ключ Groq в `.env` и загрузите ролик до 3 минут.

## Пайплайн

1. Загрузка видео (mp4 / webm / mov / mkv, ≤ 3 мин, ≤ 80 МБ)
2. FFmpeg: MP3 16 kHz mono 64 kbps
3. Groq STT: `whisper-large-v3-turbo`, `language=ru`, таймкоды сегментов
4. Метрики: темп, паузы, слова-паразиты
5. Groq LLM: тренер разговорных Instagram-видео (`openai/gpt-oss-120b`) по методике из `instagram_video_ai_analysis_prompts.md`. Итоговые веса считает backend.

Подробности — в [SPEC.md](./SPEC.md).
