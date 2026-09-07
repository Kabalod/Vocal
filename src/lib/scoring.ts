import { MICRO_CRITERION_IDS, STORY_OPTIONAL_IDS, normalizeFormat } from "@/lib/playbook";
import type {
  CategoryScore,
  CriterionDto,
  CriterionEvaluation,
} from "@/types/analysis";

export function weightedAverage(items: Array<{ score: number; weight: number }>): number {
  let num = 0;
  let den = 0;
  for (const item of items) {
    if (item.weight <= 0) continue;
    num += item.score * item.weight;
    den += item.weight;
  }
  if (den === 0) return 0;
  return Math.round((num / den) * 10) / 10;
}

export function scoreCategories(
  evaluations: CriterionEvaluation[],
  criteria: CriterionDto[],
): CategoryScore[] {
  const byCategory = new Map<
    string,
    {
      label: string;
      weight: number;
      order: number;
      items: Array<{ score: number; weight: number }>;
    }
  >();

  for (const criterion of criteria) {
    if (!criterion.enabled) continue;
    const evaluation = evaluations.find((item) => item.id === criterion.id);
    if (!evaluation?.applicable) continue;

    const current = byCategory.get(criterion.categoryId) ?? {
      label: criterion.categoryLabel,
      weight: criterion.categoryWeight,
      order: criterion.categoryOrder,
      items: [],
    };
    current.items.push({ score: evaluation.score, weight: criterion.weight });
    byCategory.set(criterion.categoryId, current);
  }

  return [...byCategory.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id, value]) => ({
      id,
      label: value.label,
      weight: value.weight,
      score: weightedAverage(value.items),
    }));
}

export function overallFromCategories(categories: CategoryScore[]): number {
  return weightedAverage(categories.map((c) => ({ score: c.score, weight: c.weight })));
}

export function applyFormatApplicability(
  evaluations: CriterionEvaluation[],
  formatRaw: string,
  wordCount: number,
): { format: ReturnType<typeof normalizeFormat>; evaluations: CriterionEvaluation[] } {
  const format = normalizeFormat(formatRaw, wordCount);
  const next = evaluations.map((item) => {
    if (format === "micro" && !MICRO_CRITERION_IDS.has(item.id)) {
      return {
        ...item,
        applicable: false,
        analysis: item.analysis || "Не применяется в микро-формате.",
      };
    }
    if (
      (format === "story" || format === "vlog") &&
      STORY_OPTIONAL_IDS.has(item.id) &&
      item.id === "argumentation"
    ) {
      return {
        ...item,
        applicable: false,
        analysis: item.analysis || "Для истории случай из жизни заменяет формальную аргументацию.",
      };
    }
    if (format === "performance" && !["hook_strength", "conversational", "unique_voice", "focus"].includes(item.id)) {
      return {
        ...item,
        applicable: false,
        analysis: item.analysis || "Не применяется к перформансу / песне.",
      };
    }
    return item;
  });
  return { format, evaluations: next };
}
