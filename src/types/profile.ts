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
