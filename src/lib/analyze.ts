import { z } from "zod";
import { LLM_MODEL } from "@/lib/config";
import { getGroq, isGroqTokenLimitError, withRetry } from "@/lib/groq";
import { CONVERSATIONAL_GROWTH_PLAYBOOK } from "@/lib/playbook";
import { applyFormatApplicability, overallFromCategories, scoreCategories } from "@/lib/scoring";
import type {
  AnalysisMetrics,
  AnalysisResultPayload,
  CoachPack,
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

const criterionItemSchema = z.object({
  id: z.string(),
  applicable: z.boolean().optional().default(true),
  score: z.coerce.number().min(0).max(10),
  confidence: z.number().min(0).max(1).optional().default(0.6),
  evidence: z.array(evidenceSchema).optional().default([]),
  analysis: z.string().optional().default(""),
  recommendation: z.string().optional().default(""),
});

const scoresSchema = z.object({
  video: z
    .object({
      topic: z.string().optional().default(""),
      main_idea: z.string().optional().default(""),
      target_audience: z.string().optional().default(""),
      format: z.string().optional().default(""),
    })
    .optional()
    .default({ topic: "", main_idea: "", target_audience: "", format: "" }),
  criteria: z.array(criterionItemSchema).optional().default([]),
});

const coachSchema = z.object({
  summary: z.string().optional().default(""),
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
        expected_impact: z.preprocess((value) => {
          if (value === "high" || value === "medium" || value === "low") return value;
          return "medium";
        }, z.enum(["high", "medium", "low"])),
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
  coach: z
    .object({
      scenario: z
        .object({
          spine: z.string().optional().default(""),
          weak_beats: z
            .array(
              z.object({
                quote: z.string().optional().default(""),
                problem: z.string().optional().default(""),
                suggestion: z.string().optional().default(""),
              }),
            )
            .optional()
            .default([]),
          opening_rewrite: z.string().optional().default(""),
          ending_rewrite: z.string().optional().default(""),
        })
        .optional()
        .default({
          spine: "",
          weak_beats: [],
          opening_rewrite: "",
          ending_rewrite: "",
        }),
      craft: z
        .array(
          z.object({
            area: z.preprocess((value) => {
              if (value === "idea" || value === "style" || value === "delivery") return value;
              return "idea";
            }, z.enum(["idea", "style", "delivery"])),
            title: z.string().optional().default(""),
            now: z.string().optional().default(""),
            better: z.string().optional().default(""),
            playbook_id: z.string().optional().default(""),
          }),
        )
        .optional()
        .default([]),
    })
    .optional()
    .default({
      scenario: { spine: "", weak_beats: [], opening_rewrite: "", ending_rewrite: "" },
      craft: [],
    }),
});

const SCORES_SYSTEM = `Ты оцениваешь транскрипцию разговорного блога.
Эталон 7–8: сильный живой блог «я тут, я свой», не пластик, мотивирует делать так же. Слабый день такого автора = 6, не 3.
Не сравнивай с TEDx. Не штрафуй отсутствие CTA и «во-первых».
Исходник нельзя резать. Не оценивай голос, жесты, монтаж.
applicable=true по умолчанию. false только для micro/performance или argumentation/next_action в чистой истории.
Верни только JSON.`;

const COACH_SYSTEM = `Ты помощник автора разговорного блога. Исходное видео нельзя резать.
Дай текстовые замены на следующий дубль: хребет мысли, слабые куски сценария, новое начало и финал, советы idea/style/delivery.
delivery = порядок мыслей и посадка фраз, не голос.
Верни только JSON.`;

const SCORE_BATCH = 6;

const ID_ALIASES: Record<string, string> = {
  hook: "hook_strength",
  hook_power: "hook_strength",
  thesis: "main_idea",
  idea: "main_idea",
  payoff: "story_payoff",
  cta: "next_action",
  call_to_action: "next_action",
  next_step: "next_action",
  nextaction: "next_action",
  mainidea: "main_idea",
  "main idea": "main_idea",
  "next action": "next_action",
  ending: "conclusion",
  water: "focus",
  fluff: "focus",
};

function locateQuote(quote: string, segments: TranscriptSegment[]) {
  const needle = quote.trim().toLowerCase();
  if (needle.length < 4) return {};
  const hit = segments.find((segment) =>
    segment.text.toLowerCase().includes(needle.slice(0, Math.min(needle.length, 80))),
  );
  if (!hit) return {};
  return { startSec: hit.start, endSec: hit.end };
}

function rubricFor(criteria: CriterionDto[]) {
  return criteria.map((item) => ({
    id: item.id,
    name: item.label,
    question: item.description,
    category: item.categoryLabel,
  }));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function transcriptBlock(transcript: string, segments: TranscriptSegment[], maxSegments = 24) {
  if (maxSegments <= 0) return `Транскрипция:\n${transcript}`;
  const segmentsBlock = segments
    .slice(0, maxSegments)
    .map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text}`)
    .join("\n");
  return `Транскрипция:\n${transcript}\n\nСегменты:\n${segmentsBlock}`;
}

function resolveCriterionId(raw: string, enabled: CriterionDto[]): string | null {
  const trimmed = raw.trim();
  if (enabled.some((item) => item.id === trimmed)) return trimmed;
  const lower = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  const alias = ID_ALIASES[trimmed.toLowerCase()] ?? ID_ALIASES[lower];
  if (alias && enabled.some((item) => item.id === alias)) return alias;
  const byId = enabled.find((item) => item.id === lower);
  if (byId) return byId.id;
  const byLabel = enabled.find((item) => item.label.toLowerCase() === trimmed.toLowerCase());
  return byLabel?.id ?? null;
}

function mergeCriteria(
  rows: z.infer<typeof criterionItemSchema>[],
  enabled: CriterionDto[],
  expected?: CriterionDto[],
): Map<string, z.infer<typeof criterionItemSchema>> {
  const map = new Map<string, z.infer<typeof criterionItemSchema>>();
  const unmatched: z.infer<typeof criterionItemSchema>[] = [];
  for (const row of rows) {
    const id = resolveCriterionId(row.id, enabled);
    if (!id || map.has(id)) {
      unmatched.push(row);
      continue;
    }
    map.set(id, { ...row, id });
  }
  if (expected) {
    const missingExpected = expected.filter((item) => !map.has(item.id));
    for (let i = 0; i < missingExpected.length; i++) {
      const row = unmatched[i] ?? rows[i];
      if (!row) break;
      if (!map.has(missingExpected[i].id)) {
        map.set(missingExpected[i].id, { ...row, id: missingExpected[i].id });
      }
    }
  }
  return map;
}

async function completeJson(
  model: string,
  userPrompt: string,
  label: string,
  system: string,
  maxTokens: number,
): Promise<string> {
  const completion = await withRetry(
    () =>
      getGroq().chat.completions.create({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        reasoning_format: "hidden",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      }),
    { label },
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

function asScoresPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.criteria)) {
    const alt = obj.evaluations ?? obj.items ?? obj.scores;
    if (Array.isArray(alt)) obj.criteria = alt;
    else if (typeof obj.score === "number" || obj.id) {
      obj.criteria = [
        {
          id: obj.id,
          applicable: obj.applicable,
          score: obj.score,
          confidence: obj.confidence,
          evidence: obj.evidence,
          analysis: obj.analysis,
          recommendation: obj.recommendation,
        },
      ];
    }
  }
  return obj;
}

async function runParsed<T>(
  schema: z.ZodType<T>,
  prompt: string,
  label: string,
  opts: { model?: string; system: string; maxTokens: number },
): Promise<T> {
  const model = opts.model ?? LLM_MODEL;
  const parse = async (useModel: string) =>
    schema.parse(
      label.startsWith("scores")
        ? asScoresPayload(parseJson(await completeJson(useModel, prompt, label, opts.system, opts.maxTokens)))
        : parseJson(await completeJson(useModel, prompt, label, opts.system, opts.maxTokens)),
    );

  try {
    return await parse(model);
  } catch (first) {
    if (isGroqTokenLimitError(first)) throw first;
    try {
      return await parse(model);
    } catch (second) {
      throw second instanceof Error ? second : first;
    }
  }
}

function scoresPrompt(input: {
  subset: CriterionDto[];
  transcript: string;
  metrics: AnalysisMetrics;
  repair: boolean;
}): string {
  const ids = input.subset.map((item) => item.id);
  return `Оцени критерии. Исходник не режем.
${input.repair ? "ДОБОР: только эти id." : "Сначала format: advice|story|vlog|street|micro|performance."}
applicable=true по умолчанию. false только для micro/performance или argumentation/next_action в чистой истории. Слабый критерий = низкий score, не false.
Шкала: 7–8 = сильный живой блог; 6 = слабый день такого автора; 3–4 = пластик/лекция.
Верни ровно: ${ids.join(", ")}
criteria: ${JSON.stringify(rubricFor(input.subset))}
facts: ${JSON.stringify({ durationSec: input.metrics.durationSec, wordCount: input.metrics.wordCount })}
${transcriptBlock(input.transcript, [], 0)}
JSON: {"video":{"topic":"","main_idea":"","target_audience":"","format":"advice"},"criteria":[{"id":"${ids[0]}","applicable":true,"score":0,"confidence":0.7,"evidence":[{"quote":"","reason":""}],"analysis":"","recommendation":""}]}`;
}

function coachPrompt(input: {
  transcript: string;
  segments: TranscriptSegment[];
  format: string;
  video: { topic: string; main_idea: string; target_audience: string };
  evaluations: CriterionEvaluation[];
}): string {
  const scores = input.evaluations
    .filter((item) => item.applicable)
    .map((item) => ({ id: item.id, name: item.name, score: item.score }));

  return `Помощник автора. Нельзя резать файл. Только текст следующего дубля.
format: ${input.format}
video: ${JSON.stringify(input.video)}
scores: ${JSON.stringify(scores)}
playbook: ${JSON.stringify(CONVERSATIONAL_GROWTH_PLAYBOOK.patterns.map((p) => ({ id: p.id, do: p.do, dont: p.dont })))}
Нужно: spine; 2-4 weak_beats (quote+problem+suggestion); opening_rewrite; ending_rewrite; 3-6 craft (idea|style|delivery + playbook_id); 2-3 strengths; до 3 точек роста; упражнение; summary.
Не предлагай вырезать. Не штрафуй отложенный тезис, смесь ты/вы, setup, отсутствие подписки.
${transcriptBlock(input.transcript, input.segments, 24)}
JSON: {"summary":"","strengths":[{"criterion_id":"","title":"","description":"","evidence":""}],"priority_growth_areas":[{"criterion_id":"","title":"","problem":"","why_it_matters":"","recommendation":"","expected_impact":"high"}],"coach":{"scenario":{"spine":"","weak_beats":[{"quote":"","problem":"","suggestion":""}],"opening_rewrite":"","ending_rewrite":""},"craft":[{"area":"idea","title":"","now":"","better":"","playbook_id":"one_idea"}]},"next_video_exercise":{"title":"","task":"","instruction":"","success_criteria":[]}}`;
}

async function collectScores(input: {
  criteria: CriterionDto[];
  transcript: string;
  segments: TranscriptSegment[];
  metrics: AnalysisMetrics;
}) {
  const collected = new Map<string, z.infer<typeof criterionItemSchema>>();
  let video = { topic: "", main_idea: "", target_audience: "", format: "" };
  const opts = { system: SCORES_SYSTEM, maxTokens: 1800 };

  for (const [index, subset] of chunk(input.criteria, SCORE_BATCH).entries()) {
    if (index > 0) {
      await new Promise((r) => setTimeout(r, 12_000));
    }
    const parsed = await runParsed(
      scoresSchema,
      scoresPrompt({
        subset,
        transcript: input.transcript,
        metrics: input.metrics,
        repair: index > 0,
      }),
      `scores-${index + 1}`,
      opts,
    );
    if (!video.format && parsed.video.format) video = parsed.video;
    for (const [id, row] of mergeCriteria(parsed.criteria, input.criteria, subset)) {
      if (!collected.has(id)) collected.set(id, row);
    }
  }

  const missing = () => input.criteria.filter((item) => !collected.has(item.id));
  if (missing().length > 0) {
    const repair = await runParsed(
      scoresSchema,
      scoresPrompt({
        subset: missing(),
        transcript: input.transcript,
        metrics: input.metrics,
        repair: true,
      }),
      "scores-repair",
      opts,
    );
    for (const [id, row] of mergeCriteria(repair.criteria, input.criteria, missing())) {
      if (!collected.has(id)) collected.set(id, row);
    }
  }

  if (missing().length > 0) {
    for (const item of missing()) {
      await new Promise((r) => setTimeout(r, 8_000));
      const parsed = await runParsed(
        scoresSchema,
        scoresPrompt({
          subset: [item],
          transcript: input.transcript,
          metrics: input.metrics,
          repair: true,
        }),
        `scores-one-${item.id}`,
        { system: SCORES_SYSTEM, maxTokens: 900 },
      );
      for (const [id, row] of mergeCriteria(parsed.criteria, input.criteria, [item])) {
        if (!collected.has(id)) collected.set(id, row);
      }
      if (!collected.has(item.id) && parsed.criteria[0]) {
        collected.set(item.id, { ...parsed.criteria[0], id: item.id });
      }
    }
  }

  const still = missing();
  for (const item of still) {
    collected.set(item.id, {
      id: item.id,
      applicable: true,
      score: 5,
      confidence: 0.35,
      evidence: [],
      analysis:
        "Критерий применим по тексту ролика. Отдельный объект оценки не пришёл — нейтральный балл, смотри рекомендации помощника.",
      recommendation: "",
    });
  }

  return { video, collected };
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

  const { video, collected } = await collectScores({
    criteria: enabled,
    transcript: input.transcript,
    segments: input.segments,
    metrics: input.metrics,
  });

  const byId = new Map(enabled.map((c) => [c.id, c]));
  const evaluations: CriterionEvaluation[] = enabled.map((criterion) => {
    const item = collected.get(criterion.id)!;
    const meta = byId.get(criterion.id)!;
    const evidence = (item.evidence ?? [])
      .filter((e) => e.quote || e.reason)
      .map((e) => ({
        quote: e.quote.trim(),
        reason: e.reason.trim(),
        ...locateQuote(e.quote, input.segments),
      }));
    return {
      id: criterion.id,
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

  const formatted = applyFormatApplicability(evaluations, video.format, input.metrics.wordCount);
  const scoredEvaluations = formatted.evaluations;
  const categoryScores = scoreCategories(scoredEvaluations, enabled);
  const overallScore = overallFromCategories(categoryScores);

  await new Promise((r) => setTimeout(r, 15_000));

  const coachInput = {
    transcript: input.transcript,
    segments: input.segments,
    format: formatted.format,
    video: {
      topic: video.topic,
      main_idea: video.main_idea,
      target_audience: video.target_audience,
    },
    evaluations: scoredEvaluations,
  };
  let parsedCoach = await runParsed(coachSchema, coachPrompt(coachInput), "coach", {
    system: COACH_SYSTEM,
    maxTokens: 1800,
  });
  const coachEmpty =
    !parsedCoach.coach.scenario.spine.trim() &&
    parsedCoach.coach.craft.length === 0 &&
    parsedCoach.coach.scenario.weak_beats.length === 0;
  if (coachEmpty) {
    await new Promise((r) => setTimeout(r, 8_000));
    parsedCoach = await runParsed(
      coachSchema,
      `${coachPrompt(coachInput)}\nОбязательно заполни spine, weak_beats, opening_rewrite, ending_rewrite и craft.`,
      "coach-retry",
      { system: COACH_SYSTEM, maxTokens: 1800 },
    );
  }

  const growthAreas: GrowthArea[] = parsedCoach.priority_growth_areas.slice(0, 3).map((area) => {
    const related = scoredEvaluations.find((item) => item.id === area.criterion_id);
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

  const exercise = parsedCoach.next_video_exercise
    ? {
        title: parsedCoach.next_video_exercise.title,
        task: parsedCoach.next_video_exercise.task,
        instruction: parsedCoach.next_video_exercise.instruction,
        successCriteria: parsedCoach.next_video_exercise.success_criteria,
      }
    : null;

  const summary =
    parsedCoach.summary.trim() ||
    [video.main_idea, video.topic].filter(Boolean).join(". ") ||
    parsedCoach.strengths[0]?.description ||
    "Разбор готов.";

  const coach: CoachPack = {
    format: formatted.format,
    scenario: {
      spine: parsedCoach.coach.scenario.spine.trim(),
      weakBeats: parsedCoach.coach.scenario.weak_beats.map((beat) => ({
        quote: beat.quote.trim(),
        problem: beat.problem.trim(),
        suggestion: beat.suggestion.trim(),
        ...locateQuote(beat.quote, input.segments),
      })),
      openingRewrite: parsedCoach.coach.scenario.opening_rewrite.trim(),
      endingRewrite: parsedCoach.coach.scenario.ending_rewrite.trim(),
    },
    craft: parsedCoach.coach.craft.map((tip) => ({
      area: tip.area,
      title: tip.title,
      now: tip.now,
      better: tip.better,
      playbookId: tip.playbook_id,
    })),
  };

  return {
    overallScore,
    summary,
    video: {
      topic: video.topic.trim(),
      mainIdea: video.main_idea.trim(),
      targetAudience: video.target_audience.trim(),
      format: formatted.format,
    },
    coach,
    categoryScores,
    evaluations: scoredEvaluations,
    strengths: parsedCoach.strengths.map((item) => ({
      criterionId: item.criterion_id,
      title: item.title,
      description: item.description,
      evidence: item.evidence,
    })),
    growthAreas,
    exercise,
    metrics: input.metrics,
    scores: scoredEvaluations
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
