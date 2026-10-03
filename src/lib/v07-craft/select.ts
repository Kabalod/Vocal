import type { ThoughtGap } from "@/lib/thought-state";
import {
  type ContentMode,
  type CraftCard,
  type CraftCatalog,
  loadActiveCraftCatalog,
} from "./catalog";

export const CRAFT_SELECT_LIMIT = 4;

export type CraftSelection = {
  selectedGapId: string | null;
  cards: CraftCard[];
};

export type CraftSnapshot = {
  enabled: boolean;
  catalogVersion: string;
  cardIds: string[];
  selectedGapId: string | null;
};

/** First open gap by stable id order. Does not invent a gap for a card. */
export function selectCurrentOpenGap(gaps: ThoughtGap[]): ThoughtGap | null {
  const open = gaps.filter((gap) => gap.status === "open");
  if (!open.length) return null;
  return [...open].sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
}

export function compareCraftCards(left: CraftCard, right: CraftCard) {
  const byId = left.id.localeCompare(right.id);
  if (byId !== 0) return byId;
  return left.version.localeCompare(right.version);
}

export function cardMatchesCurrentGap(card: CraftCard, gap: ThoughtGap, contentMode: ContentMode) {
  if (card.applicableGapKey !== gap.id) return false;
  return card.contentModes.includes(contentMode);
}

export function selectCraftCards(input: {
  gaps: ThoughtGap[];
  contentMode: ContentMode;
  catalog?: CraftCatalog;
}): CraftSelection {
  const catalog = input.catalog ?? loadActiveCraftCatalog();
  const current = selectCurrentOpenGap(input.gaps);
  if (!current) return { selectedGapId: null, cards: [] };
  const matched = catalog.cards
    .filter((card) => cardMatchesCurrentGap(card, current, input.contentMode))
    .sort(compareCraftCards)
    .slice(0, CRAFT_SELECT_LIMIT);
  return { selectedGapId: current.id, cards: matched };
}

export function craftSnapshotFromSelection(
  selection: CraftSelection,
  catalog: CraftCatalog,
  enabled: boolean,
): CraftSnapshot {
  return {
    enabled,
    catalogVersion: catalog.version,
    cardIds: enabled ? selection.cards.map((card) => card.id) : [],
    selectedGapId: enabled ? selection.selectedGapId : null,
  };
}

export function parseCraftSnapshot(raw: unknown): CraftSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.enabled !== "boolean" || typeof row.catalogVersion !== "string") return null;
  if (!Array.isArray(row.cardIds) || row.cardIds.some((id) => typeof id !== "string")) return null;
  if (row.selectedGapId !== null && typeof row.selectedGapId !== "string") return null;
  return {
    enabled: row.enabled,
    catalogVersion: row.catalogVersion,
    cardIds: row.cardIds as string[],
    selectedGapId: row.selectedGapId,
  };
}

export function cardsForSnapshot(catalog: CraftCatalog, snapshot: CraftSnapshot): CraftCard[] {
  if (!snapshot.enabled) return [];
  const byId = new Map(catalog.cards.map((card) => [card.id, card]));
  return snapshot.cardIds.map((id) => byId.get(id)).filter((card): card is CraftCard => Boolean(card));
}

export function formatCraftPromptHint(cards: CraftCard[], selectedGapId: string | null, enabled: boolean) {
  if (!enabled) return "";
  if (!cards.length) {
    return [
      "Подсказки приёмов: подходящих карточек нет. Ноль — штатный результат.",
      "Не выдумывай приёмы и не создавай пробел ради карточки.",
    ].join("\n");
  }
  return [
    "Подсказки приёмов только для формулировки ask_question.",
    "Карточки не факты автора, не evidence и не основание C00. Не закрывай пробелы из-за карточки. Не копируй чужие истории и формулировки.",
    "На suggest_take, content_sufficient и redirect_to_task не публикуй приёмы как результат пользователю.",
    selectedGapId ? `Текущий открытый пробел: ${selectedGapId}` : "",
    `Карточки: ${JSON.stringify(
      cards.map((card) => ({
        id: card.id,
        version: card.version,
        mechanism: card.mechanism,
        questionStrategy: card.questionStrategy,
        contraindications: card.contraindications,
      })),
    )}`,
  ]
    .filter(Boolean)
    .join("\n");
}
