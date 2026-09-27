import { consumeAiCallBudget } from "@/lib/ai-call-budget";
import { LLM_MODEL } from "@/lib/config";
import { chatCompletionModel, createXaiChatCompletion, getGroq, usesXaiChat, withRetry } from "@/lib/groq";
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

export const defaultCompleteJson: CompleteJsonFn = async ({ model, system, user, label }) => {
  if (usesXaiChat()) {
    consumeAiCallBudget(label ?? "dialogue");
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
      getGroq().chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: 1800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    { label },
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
