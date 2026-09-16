export type DialogueCursor = {
  t: string;
  id: string;
};

export function encodeDialogueCursor(cursor: DialogueCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeDialogueCursor(raw: string | null | undefined): DialogueCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<DialogueCursor>;
    if (typeof parsed.t !== "string" || typeof parsed.id !== "string") return null;
    return { t: parsed.t, id: parsed.id };
  } catch {
    return null;
  }
}

export function compareDialogueOrder(
  left: { createdAt: string; id: string },
  right: { createdAt: string; id: string },
): number {
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export function isBeforeCursor(
  item: { createdAt: string; id: string },
  cursor: DialogueCursor,
): boolean {
  return compareDialogueOrder(item, { createdAt: cursor.t, id: cursor.id }) < 0;
}

export function pageDialogueItems<T extends { createdAt: string; id: string }>(
  items: T[],
  input: { cursor?: DialogueCursor | null; limit: number },
): { page: T[]; nextCursor: string | null } {
  const sorted = [...items].sort(compareDialogueOrder);
  const older = input.cursor ? sorted.filter((item) => isBeforeCursor(item, input.cursor!)) : sorted;
  const page = older.slice(-input.limit);
  const nextCursor =
    page.length > 0 && older.length > page.length
      ? encodeDialogueCursor({ t: page[0].createdAt, id: page[0].id })
      : null;
  return { page, nextCursor };
}
