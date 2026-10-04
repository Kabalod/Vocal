import { z } from "zod";
import { isAppTestRuntime, isLocalUiTestRuntime } from "@/lib/db-target";
import productionJson from "./production-catalog.json";
import fixtureJson from "./fixture-catalog.json";

export const V07_CRAFT_ENV = "VOCAL_V07_CRAFT";
export const V07_CRAFT_FIXTURES_ENV = "VOCAL_V07_CRAFT_FIXTURES";

export const CONTENT_MODES = [
  "personal_story",
  "explanation",
  "observation",
  "ready_thought",
  "unspecified",
] as const;

export type ContentMode = (typeof CONTENT_MODES)[number];

export const CRAFT_CARD_ID = /^craft_[a-z0-9_]+$/;

const contentModeSchema = z.enum(CONTENT_MODES);

export const craftCardSchema = z
  .object({
    id: z.string().regex(CRAFT_CARD_ID),
    version: z.string().trim().min(1),
    layer: z.enum(["research", "fixture"]),
    applicableGapKey: z.string().trim().min(1),
    contentModes: z.array(contentModeSchema).min(1),
    mechanism: z.string().trim().min(1),
    questionStrategy: z.string().trim().min(1),
    contraindications: z.array(z.string().trim().min(1)),
  })
  .strict();

export const craftCatalogSchema = z
  .object({
    version: z.string().trim().min(1),
    cards: z.array(craftCardSchema),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    const ids = new Set<string>();
    for (const card of catalog.cards) {
      if (ids.has(card.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Повтор id карточки: ${card.id}` });
      }
      ids.add(card.id);
    }
  });

export type CraftCard = z.infer<typeof craftCardSchema>;
export type CraftCatalog = z.infer<typeof craftCatalogSchema>;

export class CraftCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CraftCatalogError";
  }
}

export function parseCraftCatalog(raw: unknown, expectedLayer?: "research" | "fixture"): CraftCatalog {
  const parsed = craftCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CraftCatalogError("Каталог приёмов не проходит строгую проверку.");
  }
  if (expectedLayer) {
    const wrong = parsed.data.cards.find((card) => card.layer !== expectedLayer);
    if (wrong) {
      throw new CraftCatalogError(`Карточка ${wrong.id} должна быть слоя ${expectedLayer}.`);
    }
  }
  return parsed.data;
}

export const PRODUCTION_CRAFT_CATALOG = parseCraftCatalog(productionJson, "research");
export const FIXTURE_CRAFT_CATALOG = parseCraftCatalog(fixtureJson, "fixture");

/** Test-only overrides. Production keeps null. */
export const v07CraftSeam = {
  enabled: null as boolean | null,
  catalog: null as CraftCatalog | null,
  /** When false, fixture catalog is forbidden even under NODE_ENV=test. */
  fixtureRuntime: null as boolean | null,
};

export function isV07CraftEnabled(env: Record<string, string | undefined> = process.env) {
  if (v07CraftSeam.enabled != null) return v07CraftSeam.enabled;
  const raw = env[V07_CRAFT_ENV]?.trim().toLowerCase();
  return raw !== "0" && raw !== "off" && raw !== "false" && raw !== "disabled";
}

/** Fixtures only in isolated test / local UI-test DB. Production and development ignore the flag. */
export function isFixtureCraftRuntime(env: Record<string, string | undefined> = process.env) {
  if (v07CraftSeam.fixtureRuntime != null) return v07CraftSeam.fixtureRuntime;
  if (env.NODE_ENV === "production" || env.NODE_ENV === "development") return false;
  return isAppTestRuntime(env) || isLocalUiTestRuntime(env);
}

export function loadActiveCraftCatalog(env: Record<string, string | undefined> = process.env): CraftCatalog {
  if (v07CraftSeam.catalog) return v07CraftSeam.catalog;
  if (isFixtureCraftRuntime(env) && env[V07_CRAFT_FIXTURES_ENV]?.trim() === "1") {
    return FIXTURE_CRAFT_CATALOG;
  }
  return PRODUCTION_CRAFT_CATALOG;
}

export function isContentMode(value: string): value is ContentMode {
  return (CONTENT_MODES as readonly string[]).includes(value);
}

export function thoughtContentMode(thought: { decisions: string[] }): ContentMode {
  for (const decision of thought.decisions) {
    if (!decision.startsWith("content_mode:")) continue;
    const mode = decision.slice("content_mode:".length);
    if (isContentMode(mode)) return mode;
  }
  return "unspecified";
}

export function craftCardIds(catalog: CraftCatalog = loadActiveCraftCatalog()) {
  return new Set(catalog.cards.map((card) => card.id));
}
