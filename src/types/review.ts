export const QUESTION_STATUSES = ["open", "answered", "skipped", "not_relevant"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  open: "Открыт",
  answered: "Ответил",
  skipped: "Пропущен",
  not_relevant: "Не актуален",
};

export function isQuestionStatus(value: string): value is QuestionStatus {
  return (QUESTION_STATUSES as readonly string[]).includes(value);
}

export const REVIEW_STATUSES = ["queued", "running", "done", "error"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const ANSWER_MAX = 8000;
export const QUESTIONS_PER_ROUND = 4;

export interface ReviewQuote {
  text: string;
  found: boolean;
  note: string;
}

export interface ReviewResult {
  authorThought: string;
  modelSuggestion: string;
  quotes: ReviewQuote[];
  keep: string[];
  missing: string[];
  notInText: string[];
  insufficientMaterial: boolean;
  questions: string[];
}

export interface ReviewDto {
  id: string;
  reelId: string;
  takeId: string;
  transcriptRevisionId: string;
  contextSnapshotId: string | null;
  previousReviewId: string | null;
  status: ReviewStatus;
  result: ReviewResult | null;
  errorMessage: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: string;
}

export interface AnswerDto {
  id: string;
  text: string;
  createdAt: string;
}

export interface QuestionDto {
  id: string;
  reelId: string;
  reviewId: string | null;
  roundId: string;
  text: string;
  status: QuestionStatus;
  sortOrder: number;
  createdAt: string;
  answers: AnswerDto[];
}

export interface CompleteJsonResult {
  text: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export type CompleteJsonFn = (input: {
  model: string;
  system: string;
  user: string;
  label: string;
}) => Promise<CompleteJsonResult>;
