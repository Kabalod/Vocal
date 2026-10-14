import Groq from "groq-sdk";

const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";

let groqClient: Groq | null = null;

function envFlagOn(name: string) {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

/** xAI chat only with explicit `VOCAL_USE_XAI=1`. Presence of `XAI_API_KEY` is not enough. */
export function usesXaiChat() {
  return envFlagOn("VOCAL_USE_XAI") && Boolean(process.env.XAI_API_KEY?.trim());
}

function envMs(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** One provider attempt. The whole operation is bounded separately by the gateway deadline. */
export function aiAttemptTimeoutMs() {
  return envMs("VOCAL_AI_ATTEMPT_TIMEOUT_MS", 45_000);
}

export function sttAttemptTimeoutMs() {
  return envMs("VOCAL_STT_ATTEMPT_TIMEOUT_MS", 120_000);
}

export function noAutomaticModelRetry() {
  return usesXaiChat() || envFlagOn("VOCAL_AI_NO_RETRY");
}

export function chatCompletionModel(requested?: string) {
  if (usesXaiChat()) return process.env.XAI_MODEL?.trim() || "grok-4";
  return requested;
}

/**
 * Safety net for tests: under NODE_ENV=test a real provider call needs VOCAL_LIVE_TESTS=1.
 * Fake clients (`groqClientSeam`) and mocks never reach this check.
 */
export function liveProviderCallsAllowed() {
  return process.env.NODE_ENV !== "test" || process.env.VOCAL_LIVE_TESTS === "1";
}

export function assertLiveProviderCallAllowed(what: string) {
  if (liveProviderCallsAllowed()) return;
  throw new Error(
    `Живой вызов провайдера (${what}) заблокирован в тестах: задайте VOCAL_LIVE_TESTS=1, если это намеренно (платный вызов).`,
  );
}

function createGroqClient(): Groq {
  assertLiveProviderCallAllowed("Groq");
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Не задан GROQ_API_KEY. Добавьте ключ в файл .env");
  }
  return new Groq({
    apiKey,
    timeout: sttAttemptTimeoutMs(),
    maxRetries: 0,
  });
}

/** Test seam: a fake provider client. Production keeps it null. */
export const groqClientSeam: { client: Groq | null } = { client: null };

export function getGroq(): Groq {
  if (groqClientSeam.client) return groqClientSeam.client;
  if (!groqClient) {
    groqClient = createGroqClient();
  }
  return groqClient;
}

export async function createXaiChatCompletion(input: {
  model: string;
  system: string;
  user: string;
}) {
  assertLiveProviderCallAllowed("xAI");
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Не задан XAI_API_KEY.");
  }
  const response = await fetch(XAI_CHAT_URL, {
    method: "POST",
    signal: AbortSignal.timeout(aiAttemptTimeoutMs()),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      max_tokens: 1800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
  });
  const rawText = await response.text();
  if (!response.ok) {
    const error = new Error(`${response.status} ${rawText.slice(0, 400)}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const payload = JSON.parse(rawText) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: (payload.choices?.[0]?.message?.content ?? "").trim(),
    usage: {
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
    },
  };
}

export function resetGroq() {
  groqClient = null;
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

export function isProviderRateLimit(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 429;
}

/** Whole seconds the provider asked to wait (Retry-After or "try again in …"), without our safety margin; null when it did not say. */
export function providerRetryAfterSeconds(error: unknown): number | null {
  const ms = groqRetryAfterMs(error);
  return ms === null ? null : Math.max(0, Math.round((ms - 750) / 1000));
}

/** Total time the retries may spend waiting on one provider call (429 pauses and the like). */
export function retryWaitBudgetMs() {
  return envMs("VOCAL_AI_RETRY_WAIT_MS", 60_000);
}

/** Test seam: the pause between attempts. */
export const retryClock: { sleep: (ms: number) => Promise<void> } = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export function isRetryableGroqError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  return isGroqConnectionError(error);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; label?: string; deadlineAt?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? (noAutomaticModelRetry() ? 1 : 4);
  let lastError: unknown;
  let waitedMs = 0;
  const waitBudgetMs = retryWaitBudgetMs();
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
      if (opts.deadlineAt !== undefined && Date.now() + waitMs >= opts.deadlineAt) {
        throw error;
      }
      // A pause the budget cannot cover (a per-day limit asks for hours): give up now instead of holding the author's request.
      if (waitedMs + waitMs > waitBudgetMs) {
        throw error;
      }
      waitedMs += waitMs;
      console.warn(
        `Groq ${opts.label ?? "request"} retry ${attempt + 1}/${retries - 1} in ${waitMs}ms`,
      );
      await retryClock.sleep(waitMs);
    }
  }
  throw lastError;
}
