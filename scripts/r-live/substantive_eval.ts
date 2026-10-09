// E6 offline evaluation, no model: how many long answers "about nothing" (fillers, restating the question, generic words) are
// counted as material by the old rule (raw words > 11) and by the new one (meaningful words > 11 and 4+ new content words).
import { speechWords, wordCount, isSubstantiveAnswer } from "../../src/lib/turn-policy";

export const EMPTY_LONG: { question: string; answer: string; kind: string }[] = [
  { kind: "fillers", question: "Что было дальше?", answer: "ну как бы да ну короче это так и есть ну типа как бы я так и думаю ну вот" },
  { kind: "fillers", question: "Что вы почувствовали?", answer: "ну э-э ну как бы короче типа ну это ну как бы сложно сказать ну типа такое вот" },
  { kind: "fillers", question: "Как это было?", answer: "эм ну как бы ну да ну короче типа как бы ну вот так ну да так" },
  { kind: "repeat of the question", question: "Что вы почувствовали, когда вышли на пробежку?", answer: "ну я почувствовал ну когда вышел на пробежку я это почувствовал что почувствовал когда вышел на пробежку" },
  { kind: "repeat of the question", question: "Почему привычка сохраняется, когда мотивация исчезает?", answer: "почему привычка сохраняется когда мотивация исчезает ну привычка сохраняется когда мотивация исчезает потому что мотивация исчезает" },
  { kind: "repeat of the question", question: "Какой случай вы помните про спор с коллегой?", answer: "случай про спор с коллегой ну я помню случай про спор с коллегой да случай был про спор с коллегой" },
  { kind: "self-repeat", question: "Что дальше?", answer: "мы пошли мы пошли мы пошли потом мы пошли потом потом мы пошли потом домой домой домой" },
  { kind: "generic words", question: "Что для вас здесь главное?", answer: "это всё очень важно и нужно потому что это так и есть и все это знают и это правда" },
  { kind: "generic words", question: "Что вы хотите сказать зрителю?", answer: "я хочу сказать что надо просто жить хорошо и делать всё правильно и тогда всё будет хорошо и всё получится" },
  { kind: "generic words", question: "Почему так получается?", answer: "так получается потому что так всегда получается и это нормально и так везде и у всех так бывает всегда" },
];

export const REAL_LONG: { question: string; answer: string }[] = [
  { question: "Что было дальше?", answer: "ну как бы я вышел на улицу и там было очень тихо только дворник мёл листья и я подумал что вот так бы и жить без спешки" },
  { question: "Почему?", answer: "короче мы с сестрой поссорились из-за наследства бабушкиной квартиры и три года не разговаривали пока она не позвонила сама" },
];

if (require.main === module) {
  let oldPass = 0, newPass = 0;
  for (const item of EMPTY_LONG) {
    const raw = wordCount(item.answer);
    const oldRule = raw > 11;
    const newRule = isSubstantiveAnswer(item.answer, item.question);
    if (oldRule) oldPass += 1;
    if (newRule) newPass += 1;
    console.log(`${item.kind.padEnd(24)} raw=${String(raw).padStart(2)} meaningful=${String(speechWords(item.answer)).padStart(2)} old=${oldRule ? "MATERIAL" : "-       "} new=${newRule ? "MATERIAL" : "-"}`);
  }
  console.log(`empty-long answers counted as material: old rule ${oldPass}/${EMPTY_LONG.length}, new rule ${newPass}/${EMPTY_LONG.length}`);
  console.log(`real long answers counted as material (new rule): ${REAL_LONG.filter((r) => isSubstantiveAnswer(r.answer, r.question)).length}/${REAL_LONG.length}`);
}
