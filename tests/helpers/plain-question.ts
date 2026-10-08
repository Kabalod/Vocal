import assert from "node:assert/strict";

/** 08.10 owner rules for a question shown to the author: exactly one question, none of the banned words, no service ids. */
export const BANNED_QUESTION_WORDS = /по вашему мнению|по-вашему|пожалуйста|конкретн|позици|вывод|урок|тезис|\bc[a-z0-9]{24}\b|\bfact_|\bgap_/i;

export function assertPlainQuestion(text: string | undefined | null, label = "question") {
  assert.ok(text, `${label}: present`);
  const body = text!.replace(/^Это в сторону от нашей мысли, давайте вернёмся к ней\.\s*/, "");
  assert.equal((body.match(/\?/g) ?? []).length, 1, `${label}: exactly one question: ${body}`);
  assert.ok(body.trim().endsWith("?"), `${label}: ends with a question mark`);
  assert.ok(!BANNED_QUESTION_WORDS.test(body), `${label}: no banned words or ids: ${body}`);
}
