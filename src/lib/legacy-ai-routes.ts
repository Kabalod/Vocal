export const LEGACY_REVIEW_RETIRED = "LEGACY_REVIEW_RETIRED";
export const LEGACY_QUESTIONS_RETIRED = "LEGACY_QUESTIONS_RETIRED";
export const LEGACY_COMPARE_AI_RETIRED = "LEGACY_COMPARE_AI_RETIRED";

export const LEGACY_DIALOGUE_MESSAGE =
  "Новый разбор здесь не создаётся. Задайте вопрос в основном Диалоге мысли.";

export const LEGACY_COMPARE_AI_MESSAGE =
  "Смысловое сравнение моделью больше не запускается из этого экрана. Текстовый diff и сохранённая история доступны.";

export function legacyReviewGone() {
  return { error: LEGACY_DIALOGUE_MESSAGE, code: LEGACY_REVIEW_RETIRED };
}

export function legacyQuestionsGone() {
  return { error: LEGACY_DIALOGUE_MESSAGE, code: LEGACY_QUESTIONS_RETIRED };
}

export function legacyCompareAiGone() {
  return { error: LEGACY_COMPARE_AI_MESSAGE, code: LEGACY_COMPARE_AI_RETIRED };
}
