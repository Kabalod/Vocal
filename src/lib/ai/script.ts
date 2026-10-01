import { generateV05Script } from "@/lib/v05-script";
import { listScriptBundle } from "@/lib/scripts";
import type { ScriptBundleDto } from "@/types/script";
import type { CompleteJsonFn } from "@/types/review";
import { defaultCompleteJson } from "@/lib/ai/complete";

/** Active V05 path. Client `sources` are ignored: the server chooses material. */
export async function generateScriptProposal(
  reelId: string,
  input: { sources?: unknown; idempotencyKey?: string } = {},
  complete: CompleteJsonFn = defaultCompleteJson,
): Promise<{ bundle: ScriptBundleDto; proposalId: string }> {
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  const workspace = await generateV05Script(reelId, { idempotencyKey }, complete);
  const proposalId = workspace.viewing?.id ?? workspace.headId ?? "";
  return { bundle: await listScriptBundle(reelId), proposalId };
}
