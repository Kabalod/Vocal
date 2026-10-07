import { LLM_MODEL } from "@/lib/config";
import { aiAttemptTimeoutMs, chatCompletionModel, createXaiChatCompletion, getGroq, usesXaiChat, withRetry } from "@/lib/groq";
import type { CompleteJsonFn } from "@/types/review";

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Модель вернула не JSON.");
    return JSON.parse(match[0]);
  }
}

function envFlagOn(name: string) {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

/** Test/local UI only. Production keeps `impl` null. */
export const completeJsonSeam: { impl: CompleteJsonFn | null } = { impl: null };

function mockedCompleteJson(label?: string): { text: string; usage: { promptTokens: number; completionTokens: number } } {
  const fail = process.env.VOCAL_AI_MOCK_FAIL?.trim();
  if (fail === "1" || (fail && fail === label)) {
    throw new Error("Мок модели вернул ошибку.");
  }
  if (label === "script") {
    return {
      text: JSON.stringify({
        script: "Мок прямой речи для следующего дубля.",
        changes: ["Убрал повтор и оставил ваши слова.", "Добавил короткий переход к выводу."],
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  }
  if (label === "take-diagnosis") {
    return {
      text: JSON.stringify({
        contentMode: "unspecified",
        gaps: [{ kind: "no_episode", text: "Нет конкретного случая, на котором держится мысль." }],
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  }
  return {
    text: JSON.stringify({
      action: "ask_question",
      question: "Что для вас здесь главное своими словами?",
      clarificationReason: "нужно уточнение задачи",
      whyUnknown: "в материале этой мысли ответа ещё нет",
      thoughtUpdate: { fact: null, closeGapIds: [] },
    }),
    usage: { promptTokens: 1, completionTokens: 1 },
  };
}

export const defaultCompleteJson: CompleteJsonFn = async ({ model, system, user, label }) => {
  if (completeJsonSeam.impl) return completeJsonSeam.impl({ model, system, user, label });
  if (envFlagOn("VOCAL_AI_MOCK")) {
    const delayMs = Number(process.env.VOCAL_AI_MOCK_DELAY_MS ?? 0);
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return mockedCompleteJson(label);
  }
  if (usesXaiChat()) {
    const completion = await createXaiChatCompletion({
      model: chatCompletionModel(model) ?? "grok-4",
      system,
      user,
    });
    if (!completion.text) throw new Error("Пустой ответ модели.");
    return { text: completion.text, usage: completion.usage };
  }
  const completion = await withRetry(
    () =>
      getGroq().chat.completions.create(
        {
          model,
          temperature: 0.2,
          max_tokens: 1800,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        },
        { timeout: aiAttemptTimeoutMs() },
      ),
    { label, retries: 3 },
  );
  const message = completion.choices[0]?.message;
  const raw = message?.content;
  const text = (typeof raw === "string" ? raw : "").trim();
  if (!text) throw new Error("Пустой ответ модели.");
  return {
    text,
    usage: {
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    },
  };
};

export { parseJsonObject, LLM_MODEL };
