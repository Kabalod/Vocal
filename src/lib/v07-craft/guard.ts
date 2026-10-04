import type { AgentAction, ThoughtUpdate } from "@/lib/agent-action";
import { AgentActionError } from "@/lib/agent-action";
import type { C00SignalCandidate } from "@/lib/c00-signal";
import { craftCardIds, type CraftCatalog } from "./catalog";

export function assertCraftNotAuthorEvidence(input: {
  cardIds?: Iterable<string>;
  catalog?: CraftCatalog;
  action: AgentAction;
  thoughtUpdate: ThoughtUpdate;
  c00Signal: C00SignalCandidate | null;
}) {
  const ids = new Set(input.cardIds ?? (input.catalog ? craftCardIds(input.catalog) : []));
  if (!ids.size) return;
  const fact = input.thoughtUpdate.fact;
  if (fact && ids.has(fact.sourceId)) {
    throw new AgentActionError("Карточка приёма не является источником факта.", "CRAFT_NOT_EVIDENCE");
  }
  if (input.action.action === "suggest_take" && input.action.evidenceRefs.some((id) => ids.has(id))) {
    throw new AgentActionError("Карточка приёма не является основанием suggest_take.", "CRAFT_NOT_EVIDENCE");
  }
  if (input.c00Signal?.targetId && ids.has(input.c00Signal.targetId)) {
    throw new AgentActionError("Карточка приёма не является целью C00.", "CRAFT_NOT_EVIDENCE");
  }
  if (input.c00Signal?.evidenceUserMessageIds.some((id) => ids.has(id))) {
    throw new AgentActionError("Карточка приёма не является evidence C00.", "CRAFT_NOT_EVIDENCE");
  }
  if (input.thoughtUpdate.closeGapIds.some((id) => ids.has(id))) {
    throw new AgentActionError("Карточка приёма не закрывает пробел.", "CRAFT_NOT_EVIDENCE");
  }
}
