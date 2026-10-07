// One request of dialogue size straight to the provider client with its own retries off. Prints status, rate-limit headers
// and the provider's error text (never keys or request headers): shows WHICH limit the provider reports.
(process.env as { NODE_ENV?: string }).NODE_ENV = "test";
(async () => {
  const { getGroq } = await import("../../src/lib/groq");
  const { LLM_MODEL } = await import("../../src/lib/ai/complete");
  const client = getGroq();
  try {
    const res = await client.chat.completions.create(
      { model: LLM_MODEL as string, messages: [{ role: "system", content: 'Верни JSON {"ok":true}' }, { role: "user", content: "Диалог про привычки. ".repeat(80) }], response_format: { type: "json_object" } },
      { maxRetries: 0 },
    );
    console.log("ok: provider answered", JSON.stringify(res.usage ?? {}));
  } catch (error) {
    const e = error as { status?: number; headers?: Record<string, string>; message?: string };
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(e.headers ?? {})) if (/^x-ratelimit|^retry-after/i.test(k)) headers[k] = String(v);
    console.log(JSON.stringify({ status: e.status, headers, message: String(e.message ?? "").slice(0, 700) }, null, 1));
  }
})().then(() => process.exit(0));
