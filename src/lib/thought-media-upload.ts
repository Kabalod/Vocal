/** J1: HTTP 402 QUOTA_EXHAUSTED: the thought limit of the paid period is used up. */
export class ThoughtQuotaExhaustedError extends Error {
  constructor(
    message: string,
    readonly periodEnd: string | null,
  ) {
    super(message);
    this.name = "ThoughtQuotaExhaustedError";
  }
}

export class ThoughtUploadAbortedError extends Error {
  constructor() {
    super("Загрузка отменена.");
    this.name = "ThoughtUploadAbortedError";
  }
}

export type ThoughtMediaUploadHandle = {
  promise: Promise<{ reelId: string; jobId: string }>;
  abort: () => void;
};

export function uploadThoughtMedia(
  input: {
    file: File;
    inputType: "audio" | "video";
    idempotencyKey: string;
  },
  onProgress?: (percent: number) => void,
  createXhr: () => XMLHttpRequest = () => new XMLHttpRequest(),
): ThoughtMediaUploadHandle {
  const xhr = createXhr();
  const promise = new Promise<{ reelId: string; jobId: string }>((resolve, reject) => {
    xhr.open("POST", "/api/thoughts/media");
    xhr.setRequestHeader("Idempotency-Key", input.idempotencyKey);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const data = (xhr.response ?? {}) as { reel?: { id: string }; job?: { id: string }; error?: string; code?: string; periodEnd?: string | null };
      if (xhr.status === 402 && data.code === "QUOTA_EXHAUSTED") {
        reject(new ThoughtQuotaExhaustedError(data.error ?? "Лимит мыслей исчерпан.", data.periodEnd ?? null));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.reel && data.job) {
        resolve({ reelId: data.reel.id, jobId: data.job.id });
        return;
      }
      reject(new Error(data.error ?? "Не удалось загрузить файл."));
    };
    xhr.onerror = () => reject(new Error("Нет связи. Не удалось обновить состояние."));
    xhr.onabort = () => reject(new ThoughtUploadAbortedError());
    const form = new FormData();
    form.set("file", input.file);
    form.set("inputType", input.inputType);
    form.set("idempotencyKey", input.idempotencyKey);
    xhr.send(form);
  });
  return {
    promise,
    abort: () => xhr.abort(),
  };
}
