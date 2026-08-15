import { z } from "zod";
import { LLM_FALLBACK_MODEL, LLM_MODEL } from "@/lib/config";
import { ANALYST_SYSTEM_PROMPT, sliceFramework } from "@/lib/framework";
import { getGroq, withRetry } from "@/lib/groq";
import { overallFromCategories, scoreCategories } from "@/lib/scoring";
import type {
  AnalysisMetrics,
  AnalysisResultPayload,
  CriterionDto,
  CriterionEvaluation,
  GrowthArea,
  Recommendation,
  TranscriptSegment,
} from "@/types/analysis";

const evidenceSchema = z.object({
  quote: z.string().optional().default(""),
  reason: z.string().optional().default(""),
});

const llmSchema = z.object({
  video: z
    .object({
      topic: z.string().optional().default(""),
      main_idea: z.string().optional().default(""),
      target_audience: z.string().optional().default(""),
      format: z.string().optional().default(""),
    })
    .optional()
    .default({ topic: "", main_idea: "", target_audience: "", format: "" }),
  criteria: z
    .array(
      z.object({
        id: z.string(),
        applicable: z.boolean().optional().default(true),
        score: z.coerce.number().min(0).max(10),
        confidence: z.number().min(0).max(1).optional().default(0.6),
        evidence: z.array(evidenceSchema).optional().default([]),
        analysis: z.string().optional().default(""),
        recommendation: z.string().optional().default(""),
      }),
    )
    .min(1),
  strengths: z
    .array(
      z.object({
        criterion_id: z.string().optional().default(""),
        title: z.string(),
        description: z.string(),
        evidence: z.string().optional().default(""),
      }),
    )
    .optional()
    .default([]),
  priority_growth_areas: z
    .array(
      z.object({
        criterion_id: z.string().optional().default(""),
        title: z.string(),
        problem: z.string(),
        why_it_matters: z.string().optional().default(""),
        recommendation: z.string(),
        expected_impact: z.enum(["high", "medium", "low"]).optional().default("medium"),
      }),
    )
    .optional()
    .default([]),
  next_video_exercise: z
    .object({
      title: z.string(),
      task: z.string(),
      instruction: z.string().optional().default(""),
      success_criteria: z.array(z.string()).optional().default([]),
    })
    .nullable()
    .optional(),
  summary: z.string().optional().default(""),
});

function locateQuote(quote: string, segments: TranscriptSegment[]) {
  const needle = quote.trim().toLowerCase();
  if (needle.length < 4) return {};
  const hit = segments.find((segment) =>
    segment.text.toLowerCase().includes(needle.slice(0, Math.min(needle.length, 80))),
  );
  if (!hit) return {};
  return { startSec: hit.start, endSec: hit.end };
}

function buildUserPrompt(input: {
  criteria: CriterionDto[];
  transcript: string;
  segments: TranscriptSegment[];
  metrics: AnalysisMetrics;
}): string {
  const enabledIds = new Set(input.criteria.map((c) => c.id));
  const framework = sliceFramework(enabledIds);
  const segmentsBlock = input.segments
    .slice(0, 100)
    .map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text}`)
    .join("\n");

  return `Проанализируй следующую транскрипцию разговорного видео.

Используй analysis_framework ниже. Оценивай ТОЛЬКО критерии из него (включённые пользователем).

analysis_framework:
${JSON.stringify(framework, null, 2)}

Твоя задача:
1. Определи тему видео.
2. Сформулируй главную мысль.
3. Определи предполагаемую аудиторию, если она следует из текста. Если нет — пустая строка.
4. Оцени каждый критерий из framework: applicable true/false, целый score 0–10, confidence 0–1.
5. Для каждой оценки найди доказательство в транскрипции. Не выдумывай цитаты. Нет цитаты — пустой evidence.
6. Определи сильные стороны.
7. Определи максимум 3 приоритетные точки роста.
8. Для каждой точки роста сформулируй конкретную рекомендацию на следующее видео.
9. Сформулируй одно упражнение для следующего видео.

Не оценивай то, чего нет в тексте. Не считай отсутствие необязательного элемента недостатком.
Ключевые слова — только сигналы, не доказательство.
Не возвращай scores.hook / overall: backend посчитает веса сам.

Служебные факты по таймкодам (это НЕ оценки голоса и НЕ повод снижать баллы за «неуверенность»):
${JSON.stringify(
  {
    durationSec: input.metrics.durationSec,
    wordCount: input.metrics.wordCount,
    fillerPer100Words: input.metrics.fillerPer100Words,
  },
  null,
  2,
)}
Их можно учесть только в критерии focus и только как сигналы. Наличие слова-паразита само по себе не недостаток.

Транскрипция:
${input.transcript}

Сегменты с таймкодами:
${segmentsBlock}

Верни только JSON:
{
  "video": { "topic": "", "main_idea": "", "target_audience": "", "format": "" },
  "criteria": [{
    "id": "hook_strength",
    "applicable": true,
    "score": 0,
    "confidence": 0,
    "evidence": [{ "quote": "", "reason": "" }],
    "analysis": "",
    "recommendation": ""
  }],
  "strengths": [{ "criterion_id": "", "title": "", "description": "", "evidence": "" }],
  "priority_growth_areas": [{
    "criterion_id": "",
    "title": "",
    "problem": "",
    "why_it_matters": "",
    "recommendation": "",
    "expected_impact": "high"
  }],
  "next_video_exercise": {
    "title": "",
    "task": "",
    "instruction": "",
    "success_criteria": []
  },
  "summary": ""
}`;
}

async function completeJson(model: string, userPrompt: string): Promise<string> {
  const groq = getGroq();
  const completion = await withRetry(
    () =>
      groq.chat.completions.create({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        reasoning_format: "hidden",
        messages: [
          { role: "system", content: ANALYST_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    { label: "llm" },
  );

  const message = completion.choices[0]?.message;
  const raw = message?.content;
  const content = typeof raw === "string" ? raw : "";
  const reasoning = typeof message?.reasoning === "string" ? message.reasoning : "";
  const text = content.trim() || reasoning.trim();
  if (!text) {
    throw new Error("Пустой ответ модели анализа.");
  }
  return text;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Модель вернула не JSON.");
    return JSON.parse(match[0]);
  }
}

export async function analyzeSpeech(input: {
  criteria: CriterionDto[];
  metrics: AnalysisMetrics;
  transcript: string;
  segments: TranscriptSegment[];
}): Promise<AnalysisResultPayload> {
  const enabled = input.criteria.filter((c) => c.enabled);
  if (enabled.length === 0) {
    throw new Error("Включите хотя бы один критерий оценки.");
  }

  const prompt = buildUserPrompt({
    criteria: enabled,
    transcript: input.transcript,
    segments: input.segments,
    metrics: input.metrics,
  });

  const run = async (model: string) => llmSchema.parse(parseJson(await completeJson(model, prompt)));

  let parsed: z.infer<typeof llmSchema>;
  try {
    parsed = await run(LLM_MODEL);
  } catch (first) {
    try {
      parsed = llmSchema.parse(
        parseJson(await completeJson(LLM_MODEL, `${prompt}\n\nПОВТОР: верни ТОЛЬКО JSON по схеме.`)),
      );
    } catch {
      if (LLM_MODEL !== LLM_FALLBACK_MODEL) {
        parsed = await run(LLM_FALLBACK_MODEL);
      } else {
        throw first;
      }
    }
  }

  const byId = new Map(enabled.map((c) => [c.id, c]));
  const evaluations: CriterionEvaluation[] = parsed.criteria
    .filter((item) => byId.has(item.id))
    .map((item) => {
      const meta = byId.get(item.id)!;
      const evidence = (item.evidence ?? [])
        .filter((e) => e.quote || e.reason)
        .map((e) => ({
          quote: e.quote.trim(),
          reason: e.reason.trim(),
          ...locateQuote(e.quote, input.segments),
        }));
      return {
        id: item.id,
        category: meta.categoryId,
        name: meta.label,
        applicable: item.applicable,
        score: Math.round(item.score),
        confidence: item.confidence,
        evidence,
        analysis: item.analysis.trim(),
        recommendation: item.recommendation.trim(),
      };
    });

  for (const criterion of enabled) {
    if (!evaluations.some((item) => item.id === criterion.id)) {
      evaluations.push({
        id: criterion.id,
        category: criterion.categoryId,
        name: criterion.label,
        applicable: false,
        score: 0,
        confidence: 0,
        evidence: [],
        analysis: "Модель не вернула оценку по этому критерию.",
        recommendation: "",
      });
    }
  }

  const categoryScores = scoreCategories(evaluations, enabled);
  const overallScore = overallFromCategories(categoryScores);

  const growthAreas: GrowthArea[] = parsed.priority_growth_areas.slice(0, 3).map((area) => {
    const related = evaluations.find((item) => item.id === area.criterion_id);
    const quote = related?.evidence[0]?.quote ?? "";
    return {
      criterionId: area.criterion_id,
      title: area.title,
      problem: area.problem,
      whyItMatters: area.why_it_matters,
      recommendation: area.recommendation,
      expectedImpact: area.expected_impact,
      quote: quote || undefined,
      startSec: related?.evidence[0]?.startSec,
      endSec: related?.evidence[0]?.endSec,
    };
  });

  const recommendations: Recommendation[] = growthAreas.map((area) => ({
    priority: area.expectedImpact,
    title: area.title,
    detail: [area.problem, area.whyItMatters, area.recommendation].filter(Boolean).join(" "),
    startSec: area.startSec,
    endSec: area.endSec,
    quote: area.quote,
  }));

  const exercise = parsed.next_video_exercise
    ? {
        title: parsed.next_video_exercise.title,
        task: parsed.next_video_exercise.task,
        instruction: parsed.next_video_exercise.instruction,
        successCriteria: parsed.next_video_exercise.success_criteria,
      }
    : null;

  const summary =
    parsed.summary.trim() ||
    [parsed.video.main_idea, parsed.video.topic].filter(Boolean).join(". ") ||
    parsed.strengths[0]?.description ||
    "Разбор готов.";

  return {
    overallScore,
    summary,
    video: {
      topic: parsed.video.topic.trim(),
      mainIdea: parsed.video.main_idea.trim(),
      targetAudience: parsed.video.target_audience.trim(),
      format: parsed.video.format.trim(),
    },
    categoryScores,
    evaluations,
    strengths: parsed.strengths.map((item) => ({
      criterionId: item.criterion_id,
      title: item.title,
      description: item.description,
      evidence: item.evidence,
    })),
    growthAreas,
    exercise,
    metrics: input.metrics,
    scores: evaluations
      .filter((item) => item.applicable)
      .map((item) => ({
        criterionId: item.id,
        score: item.score,
        comment: item.analysis,
      })),
    recommendations,
    transcript: {
      text: input.transcript,
      segments: input.segments,
    },
  };
}
