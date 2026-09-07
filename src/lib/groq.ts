import Groq from "groq-sdk";

let client: Groq | null = null;

function createClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Не задан GROQ_API_KEY. Добавьте ключ в файл .env");
  }
  return new Groq({
    apiKey,
    timeout: 10 * 60 * 1000,
    maxRetries: 0,
  });
}

export function getGroq(): Groq {
  if (!client) {
    client = createClient();
  }
  return client;
}

export function resetGroq() {
  client = null;
}

function errorText(error: unknown): string {
  const err = error as {
    message?: string;
    code?: string;
    cause?: { code?: string; message?: string; errno?: string };
  };
  return [err.message, err.code, err.cause?.message, err.cause?.code, err.cause?.errno]
    .filter(Boolean)
    .join(" ");
}

export function isGroqTokenLimitError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  return (status === 413 || status === 429) && /token/i.test(errorText(error));
}

export function isGroqConnectionError(error: unknown): boolean {
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|fetch failed|socket|undici|connection error|network/i.test(
    errorText(error),
  );
}

export function groqRetryAfterMs(error: unknown): number | null {
  const err = error as { headers?: Record<string, string>; message?: string };
  const header = err.headers?.["retry-after"] ?? err.headers?.["Retry-After"];
  if (header) {
    const sec = Number(header);
    if (Number.isFinite(sec) && sec >= 0) return Math.ceil(sec * 1000) + 750;
  }
  const match = String(err.message ?? "").match(/try again in ([\d.]+)\s*s/i);
  if (match) return Math.ceil(Number(match[1]) * 1000) + 750;
  return null;
}

export function isRetryableGroqError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  return isGroqConnectionError(error);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; label?: string } = {},
): Promise<T> {
  const retries = opts.retries ?? 4;
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableGroqError(error) || attempt === retries - 1) {
        throw error;
      }
      if (isGroqConnectionError(error)) {
        resetGroq();
      }
      const waitMs = groqRetryAfterMs(error) ?? 2000 * 2 ** attempt;
      console.warn(
        `Groq ${opts.label ?? "request"} retry ${attempt + 1}/${retries - 1} in ${waitMs}ms`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}
