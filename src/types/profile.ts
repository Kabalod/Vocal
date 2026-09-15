export const PROFILE_FIELD_IDS = [
  "whyRecord",
  "blogGoal",
  "audience",
  "lifeNow",
  "experience",
  "topics",
  "speakingStyle",
  "boundaries",
] as const;

export type ProfileFieldId = (typeof PROFILE_FIELD_IDS)[number];

export const PROFILE_USAGES = ["in_text", "understanding"] as const;
export type ProfileUsage = (typeof PROFILE_USAGES)[number];

export const PROFILE_FIELD_LABELS: Record<ProfileFieldId, string> = {
  whyRecord: "Зачем записываю ролики",
  blogGoal: "К какой цели двигаюсь",
  audience: "С кем хочу общаться через блог",
  lifeNow: "Какая у меня сейчас жизнь",
  experience: "Мой опыт и интересы",
  topics: "Какие темы хочу раскрывать",
  speakingStyle: "Как хочу говорить",
  boundaries: "Что не хочу раскрывать",
};

export const PROFILE_FIELD_HINTS: Record<ProfileFieldId, string> = {
  whyRecord: "Можно пропустить. Не подставляйте чужие факты.",
  blogGoal: "Общая цель блога. У карточки может быть своя цель.",
  audience: "Для кого блог в целом. Аудитория ролика задаётся в карточке.",
  lifeNow: "Фон для понимания. В сценарий попадёт только с пометкой «можно в текст».",
  experience: "Опыт и интересы, если хотите ими пользоваться.",
  topics: "Темы, которые готовы раскрывать.",
  speakingStyle: "Тон и манера, без биографии.",
  boundaries: "Границы. По умолчанию только для понимания, не как публичный эпизод.",
};

export const LOCAL_PROFILE_ID = "local";
export const PROFILE_FIELD_MAX = 4000;
export const REEL_GOAL_MAX = 2000;
export const REEL_AUDIENCE_MAX = 2000;

export function isProfileFieldId(value: string): value is ProfileFieldId {
  return (PROFILE_FIELD_IDS as readonly string[]).includes(value);
}

export function isProfileUsage(value: string): value is ProfileUsage {
  return (PROFILE_USAGES as readonly string[]).includes(value);
}

export interface ProfileFieldValue {
  id: ProfileFieldId;
  label: string;
  text: string;
  usage: ProfileUsage;
}

export interface ProfileRevisionDto {
  id: string;
  createdAt: string;
  fields: ProfileFieldValue[];
}

export interface ProfileDto {
  id: string;
  currentRevisionId: string | null;
  fields: ProfileFieldValue[];
  revisions: { id: string; createdAt: string }[];
  updatedAt: string;
}

export interface AssembledContextField {
  id: ProfileFieldId;
  label: string;
  text: string;
  usage: ProfileUsage;
}

export interface AssembledReelContext {
  profileRevisionId: string | null;
  reelGoal: string;
  reelAudience: string;
  selectedKeys: ProfileFieldId[];
  publicForScript: AssembledContextField[];
  understandingOnly: AssembledContextField[];
  excludedKeys: ProfileFieldId[];
}

export interface ReelContextSnapshotDto {
  id: string;
  profileRevisionId: string | null;
  reelGoal: string;
  reelAudience: string;
  selectedKeys: ProfileFieldId[];
  assembled: AssembledReelContext;
  createdAt: string;
}

export interface ReelContextDto {
  reelId: string;
  reelGoal: string;
  reelAudience: string;
  selectedKeys: ProfileFieldId[];
  live: AssembledReelContext;
  snapshots: ReelContextSnapshotDto[];
}

export function emptyProfileFields(): ProfileFieldValue[] {
  return PROFILE_FIELD_IDS.map((id) => ({
    id,
    label: PROFILE_FIELD_LABELS[id],
    text: "",
    usage: id === "boundaries" ? "understanding" : "understanding",
  }));
}

export const PROFILE_PHASES = ["idle", "conversation", "portrait"] as const;
export type ProfilePhase = (typeof PROFILE_PHASES)[number];

export const PORTRAIT_SECTION_IDS = ["goals", "experience", "topics", "delivery", "boundaries"] as const;
export type PortraitSectionId = (typeof PORTRAIT_SECTION_IDS)[number];

export const PORTRAIT_SECTION_TITLES: Record<PortraitSectionId, string> = {
  goals: "Цели",
  experience: "Опыт",
  topics: "Темы",
  delivery: "Подача",
  boundaries: "Границы",
};

export const PORTRAIT_SECTION_FIELDS: Record<PortraitSectionId, readonly ProfileFieldId[]> = {
  goals: ["whyRecord", "blogGoal", "audience"],
  experience: ["lifeNow", "experience"],
  topics: ["topics"],
  delivery: ["speakingStyle"],
  boundaries: ["boundaries"],
};

export interface PortraitSection {
  id: PortraitSectionId;
  title: string;
  text: string;
}

export interface PortraitDto {
  completed: boolean;
  coveredKeys: ProfileFieldId[];
  missingKeys: ProfileFieldId[];
  sections: PortraitSection[];
}

export interface ProfileFieldPatch {
  text?: string;
  usage?: ProfileUsage;
  clear?: boolean;
}

export type ProfilePortraitPatch = Partial<Record<ProfileFieldId, ProfileFieldPatch>>;

export type ProfileDialogueMode = "intake" | "amend";

export const PROFILE_FIELD_OPS = ["set", "clear", "usage"] as const;
export type ProfileFieldOpKind = (typeof PROFILE_FIELD_OPS)[number];

export interface ProfileFieldOperation {
  field: ProfileFieldId;
  op: ProfileFieldOpKind;
  text?: string;
  usage?: ProfileUsage;
}

export interface ProfilePendingChange {
  mode: ProfileDialogueMode;
  understood: string;
  openQuestions: string[];
  draftFields: ProfileFieldValue[];
}

export interface ProfileWorkspaceDto {
  phase: ProfilePhase;
  skipped: boolean;
  supplementing: boolean;
  pendingChange: boolean;
  pending: ProfilePendingChange | null;
  mode: ProfileDialogueMode | null;
  portrait: PortraitDto | null;
  applyError: string | null;
  profile: ProfileDto;
}
