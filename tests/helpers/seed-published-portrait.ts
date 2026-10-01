import { emptyProfileFields, type ProfileFieldValue, type ProfileUsage } from "../../src/types/profile";
import { persistProfilePayload } from "../../src/lib/profile";
import { buildPortrait, emptyStoredPayload } from "../../src/lib/profile-portrait";

export async function seedPublishedPortrait(
  patch: Partial<Record<string, { text: string; usage?: ProfileUsage }>>,
): Promise<void> {
  const fields: ProfileFieldValue[] = emptyProfileFields().map((field) => {
    const next = patch[field.id];
    return next ? { ...field, text: next.text, usage: next.usage ?? field.usage } : field;
  });
  await persistProfilePayload({
    ...emptyStoredPayload(),
    fields,
    portrait: buildPortrait(fields, true),
  });
}
