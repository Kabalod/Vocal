import type { TextDiffDto } from "@/lib/text-diff";

export const COMPARE_PROMPT_VERSION = "compare-v1";
export const COMPARE_INTENT_MAX = 2000;

export interface SemanticCompareResult {
  thoughtPreserved: boolean;
  intentMet: boolean | null;
  notes: string;
  leftOnly: string[];
  rightOnly: string[];
  inventedIdeas: string[];
}

export interface CompareDto {
  id: string;
  reelId: string;
  leftTakeId: string;
  rightTakeId: string;
  leftTranscriptId: string;
  rightTranscriptId: string;
  intent: string;
  textDiff: TextDiffDto;
  semantic: SemanticCompareResult | null;
  status: "done" | "error";
  errorMessage: string | null;
  model: string | null;
  promptVersion: string | null;
  createdAt: string;
}
