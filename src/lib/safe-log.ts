/** Server logs: ids/codes only. Never prompt, thought text, profile fields, media paths, or API keys. */

export function safeServerLog(input: {
  route: string;
  code?: string;
  jobId?: string | null;
}): string {
  const parts = ["api", input.route];
  if (input.jobId) parts.push(`job=${input.jobId}`);
  if (input.code) parts.push(input.code);
  return parts.join(" ");
}

export function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code.slice(0, 64) : undefined;
}

export function logApiError(route: string, error?: unknown): void {
  console.error(safeServerLog({ route, code: extractErrorCode(error) }));
}

export const PRIVACY_LOG_FORBIDDEN = [
  "promptText",
  "GROQ_API_KEY",
  "XAI_API_KEY",
  "OPENAI_API_KEY",
] as const;

export function logLineLeaksSecrets(line: string, samples: readonly string[]): string[] {
  return samples.filter((sample) => sample.length > 0 && line.includes(sample));
}
