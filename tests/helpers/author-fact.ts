/** 09.10: a script can be built only after the author has given one answer with an accepted fact (state Д). Older script suites call this once after creating the thought. */
export async function acceptAuthorAnswer(reelId: string, text = "Это было вчера: я вернулся домой, и чай на подоконнике давно остыл.") {
  const { sendDialogueMessage } = await import("../../src/lib/dialogue");
  await sendDialogueMessage(reelId, { text, idempotencyKey: `author-fact-${reelId}` }, (async (args: { user: string }) => {
    const id = /Текущее сообщение автора: (\S+?)\./.exec(args.user)?.[1] ?? "";
    return {
      text: JSON.stringify({
        action: "ask_question",
        question: "Что было потом?",
        clarificationReason: "нужно уточнение",
        whyUnknown: "мало данных",
        thoughtUpdate: { fact: { text, sourceType: "dialogue_message", sourceId: id }, closeGapIds: [] },
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  }) as never);
}

export async function currentRevision(reelId: string): Promise<number> {
  const { getThoughtState } = await import("../../src/lib/thought-state");
  return (await getThoughtState(reelId)).revision;
}
