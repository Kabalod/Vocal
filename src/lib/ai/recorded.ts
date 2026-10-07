import { appendFileSync, readFileSync } from "node:fs";
import { isAppTestRuntime, isLocalUiTestRuntime } from "@/lib/db-target";

/**
 * "Claude as the model" stand (offline, no provider). Only in the isolated test runtime or the local UI-test runtime;
 * production and development ignore both variables.
 *
 *  VOCAL_AI_RECORD_PROMPTS=<file.jsonl>  every request {seq, label, system, user} is appended (the real promptText), and the run
 *                                         continues on the ordinary mock answers, so a person can read the prompts and write answers.
 *                                         "__AUTHOR_MESSAGE_ID__" in a response is replaced by the id of the author's current message (taken from the prompt).
 *  VOCAL_AI_RECORDED=<answers.json>      {"answers":[{"label":"dialogue","userContains":["Ответ автора: …"],"response":{…},"repeat":false}]}
 *                                         each request takes the first matching answer not used up yet; a request with no matching answer
 *                                         is an ERROR (RECORDED_ANSWER_MISSING), never a fallback to the mock or to the provider.
 *
 * What it shows is how OUR code behaves for the answers written; it says nothing about what the working model (Groq) answers.
 */
export const RECORD_PROMPTS_ENV = "VOCAL_AI_RECORD_PROMPTS";
export const RECORDED_ANSWERS_ENV = "VOCAL_AI_RECORDED";

export type RecordedAnswer = {
  label?: string;
  userContains?: string[];
  response: unknown;
  repeat?: boolean;
};

const used = new Map<string, number>();
let seq = 0;

export function resetRecordedStandForTests() {
  used.clear();
  seq = 0;
}

/** Answers of the file that were never used (a scenario that is written precisely uses every one-shot answer). */
export function unusedRecordedAnswers(answersFile: string): number[] {
  const answers = (JSON.parse(readFileSync(answersFile, "utf8")) as { answers: RecordedAnswer[] }).answers;
  return answers.flatMap((answer, index) => (answer.repeat || (used.get(`${answersFile}#${index}`) ?? 0) >= 1 ? [] : [index]));
}

export function recordedStandActive(env: Record<string, string | undefined> = process.env): boolean {
  if (!isAppTestRuntime(env) && !isLocalUiTestRuntime(env)) return false;
  return Boolean(env[RECORDED_ANSWERS_ENV]?.trim() || env[RECORD_PROMPTS_ENV]?.trim());
}

export type RecordedCompletion = { text: string; usage: { promptTokens: number; completionTokens: number } } | null;

/** Returns null when the stand is not active, or in record-only mode (the caller then uses the ordinary mock). */
export function recordedComplete(
  args: { label?: string; system: string; user: string },
  env: Record<string, string | undefined> = process.env,
): RecordedCompletion {
  if (!recordedStandActive(env)) return null;
  const recordFile = env[RECORD_PROMPTS_ENV]?.trim();
  if (recordFile) {
    seq += 1;
    appendFileSync(recordFile, JSON.stringify({ seq, label: args.label ?? "chat", system: args.system, user: args.user }) + "\n");
  }
  const answersFile = env[RECORDED_ANSWERS_ENV]?.trim();
  if (!answersFile) return null;
  const answers = (JSON.parse(readFileSync(answersFile, "utf8")) as { answers: RecordedAnswer[] }).answers;
  for (const [index, answer] of answers.entries()) {
    const key = `${answersFile}#${index}`;
    if (answer.label && answer.label !== (args.label ?? "chat")) continue;
    if (answer.userContains && !answer.userContains.every((part) => args.user.includes(part))) continue;
    if (!answer.repeat && (used.get(key) ?? 0) >= 1) continue;
    used.set(key, (used.get(key) ?? 0) + 1);
    let text = typeof answer.response === "string" ? answer.response : JSON.stringify(answer.response);
    // The id of the author's current message is in the prompt ("Текущее сообщение автора: <id>."); a recorded answer may name it.
    const authorId = args.user.match(/Текущее сообщение автора: (\S+?)\./)?.[1];
    if (authorId) text = text.replaceAll("__AUTHOR_MESSAGE_ID__", authorId);
    return { text, usage: { promptTokens: 1, completionTokens: 1 } };
  }
  throw new Error(`RECORDED_ANSWER_MISSING label=${args.label ?? "chat"} user=${args.user.slice(0, 80).replace(/\s+/g, " ")}…`);
}
