import Groq from "groq-sdk";

let client: Groq | null = null;

export function getGroq(): Groq {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Не задан GROQ_API_KEY. Добавьте ключ в файл .env");
  }
  if (!client) {
    client = new Groq({ apiKey });
  }
  return client;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; label?: string } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number }).status;
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        status === 429 ||
        (typeof status === "number" && status >= 500) ||
        /ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(message);
      if (!retryable || attempt === retries - 1) {
        throw error;
      }
      const waitMs = 2000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}
