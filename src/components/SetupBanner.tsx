"use client";

import { useEffect, useState } from "react";

export function SetupBanner() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        const missing: string[] = [];
        if (!data.groq) missing.push("GROQ_API_KEY в .env");
        if (!data.ffmpeg) missing.push("FFmpeg");
        if (missing.length) {
          setText(`Не готово к разбору: ${missing.join(" и ")}.`);
        }
      })
      .catch(() => undefined);
  }, []);

  if (!text) return null;

  return (
    <p className="rounded-2xl border border-ok/30 bg-accent-dim px-4 py-3 text-sm text-ok">
      {text} После правки перезапустите `npm run dev`.
    </p>
  );
}
