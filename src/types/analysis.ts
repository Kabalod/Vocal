export type JobStatus =
  | "queued"
  | "converting"
  | "transcribing"
  | "analyzing"
  | "done"
  | "error";

export interface JobDto {
  id: string;
  originalName: string;
  videoPath: string;
  audioPath?: string | null;
  durationSec?: number | null;
  status: JobStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisMetrics {
  durationSec: number;
  wordsPerMinute: number;
  pauseCount: number;
  avgPauseSec: number;
  maxPauseSec: number;
  fillerPer100Words: number;
  fillerCount: number;
  wordCount: number;
  rushShare: number;
}

export interface CriterionScore {
  criterionId: string;
  score: number;
  comment: string;
}

export interface Recommendation {
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  startSec?: number;
  endSec?: number;
  quote?: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface VideoBrief {
  topic: string;
  mainIdea: string;
  targetAudience: string;
  format: string;
}

export interface ScenarioBeat {
  quote: string;
  problem: string;
  suggestion: string;
  startSec?: number;
  endSec?: number;
}

export interface ScenarioCoach {
  spine: string;
  weakBeats: ScenarioBeat[];
  openingRewrite: string;
  endingRewrite: string;
}

export interface CraftTip {
  area: "idea" | "style" | "delivery";
  title: string;
  now: string;
  better: string;
  playbookId: string;
}

export interface CoachPack {
  format: string;
  scenario: ScenarioCoach;
  craft: CraftTip[];
}

export interface EvidenceItem {
  quote: string;
  reason: string;
  startSec?: number;
  endSec?: number;
}

export interface CriterionEvaluation {
  id: string;
  category: string;
  name: string;
  applicable: boolean;
  score: number;
  confidence: number;
  evidence: EvidenceItem[];
  analysis: string;
  recommendation: string;
}

export interface CategoryScore {
  id: string;
  label: string;
  weight: number;
  score: number;
}

export interface StrengthItem {
  criterionId: string;
  title: string;
  description: string;
  evidence: string;
}

export interface GrowthArea {
  criterionId: string;
  title: string;
  problem: string;
  whyItMatters: string;
  recommendation: string;
  expectedImpact: "high" | "medium" | "low";
  startSec?: number;
  endSec?: number;
  quote?: string;
}

export interface NextVideoExercise {
  title: string;
  task: string;
  instruction: string;
  successCriteria: string[];
}

export interface AnalysisResultPayload {
  overallScore: number;
  summary: string;
  video: VideoBrief;
  coach: CoachPack | null;
  categoryScores: CategoryScore[];
  evaluations: CriterionEvaluation[];
  strengths: StrengthItem[];
  growthAreas: GrowthArea[];
  exercise: NextVideoExercise | null;
  metrics: AnalysisMetrics;
  scores: CriterionScore[];
  recommendations: Recommendation[];
  transcript: {
    text: string;
    segments: TranscriptSegment[];
  };
}

export interface CriterionDto {
  id: string;
  label: string;
  description: string;
  weight: number;
  enabled: boolean;
  sortOrder: number;
  isExtended: boolean;
  categoryId: string;
  categoryLabel: string;
  categoryWeight: number;
  categoryOrder: number;
}

export interface JobWithAnalysis extends JobDto {
  analysis: AnalysisResultPayload | null;
}
