export function uploadThoughtMedia(
  input: {
    file: File;
    inputType: "audio" | "video";
    idempotencyKey: string;
  },
  onProgress?: (percent: number) => void,
): Promise<{ reelId: string; jobId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/thoughts/media");
    xhr.setRequestHeader("Idempotency-Key", input.idempotencyKey);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const data = (xhr.response ?? {}) as { reel?: { id: string }; job?: { id: string }; error?: string };
      if (xhr.status >= 200 && xhr.status < 300 && data.reel && data.job) {
        resolve({ reelId: data.reel.id, jobId: data.job.id });
        return;
      }
      reject(new Error(data.error ?? "Не удалось загрузить файл."));
    };
    xhr.onerror = () => reject(new Error("Нет связи. Не удалось обновить состояние."));
    xhr.onabort = () => reject(new Error("Загрузка отменена."));
    const form = new FormData();
    form.set("file", input.file);
    form.set("inputType", input.inputType);
    form.set("idempotencyKey", input.idempotencyKey);
    xhr.send(form);
  });
}
