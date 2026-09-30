import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PROFILE_DIALOGUE_SYSTEM, profileV04UserPrompt } from "../src/lib/ai/profile";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("V04-06 prompt is the union and thought context is the displayed slice", () => {
  assert.match(PROFILE_DIALOGUE_SYSTEM, /apply_update/);
  assert.match(PROFILE_DIALOGUE_SYSTEM, /без confirm/);
  assert.match(PROFILE_DIALOGUE_SYSTEM, /Не возвращай patch, operations, complete, kind=ready/);
  assert.doesNotMatch(PROFILE_DIALOGUE_SYSTEM, /kind: "ready"/);
  const prompt = profileV04UserPrompt({
    slice: { blog_goal: "говорить своими словами" },
    published: true,
    recentText: "",
    authorText: "хочу так",
    userMessageId: "msg_1",
  });
  assert.match(prompt, /msg_1/);
  assert.match(prompt, /confirm нет/);
  const dialogue = readFileSync(path.join(repoRoot, "src/lib/dialogue.ts"), "utf8");
  assert.match(dialogue, /Отображаемый портрет \(можно в текст\)/);
  assert.doesNotMatch(dialogue, /Подтверждённый профиль/);
  const ui = readFileSync(path.join(repoRoot, "src/components/ProfileConversation.tsx"), "utf8");
  assert.doesNotMatch(ui, /Подтвердить портрет/);
  assert.doesNotMatch(ui, /action: \"confirm\"/);
  const sendPath = readFileSync(path.join(repoRoot, "src/lib/profile-dialogue.ts"), "utf8");
  assert.match(sendPath, /parseV04ModelReply/);
  assert.doesNotMatch(sendPath, /applyPortraitReply/);
  assert.doesNotMatch(sendPath, /parseProfileAiReply/);
});
