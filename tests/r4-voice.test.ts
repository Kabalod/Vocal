import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  microphonePermissionMessage,
  shouldPostVoiceReply,
  voiceReplyRetryTarget,
} from "../src/lib/media-session";
import { P13_P16_TO_R_PHASE, scriptlessRecordingAllowed } from "../src/lib/product-contracts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("R4 classifies mic errors, skips cancelled blobs, and retries voice before text", () => {
  assert.deepEqual(P13_P16_TO_R_PHASE.P14, "R3+R4");
  assert.equal(scriptlessRecordingAllowed(), true);
  assert.match(
    microphonePermissionMessage(new Error("x"), { secureContext: false }),
    /HTTPS/,
  );
  const denied = new Error("denied");
  denied.name = "NotAllowedError";
  assert.match(microphonePermissionMessage(denied, { secureContext: true }), /настройках браузера/);
  const missing = new Error("missing");
  missing.name = "NotFoundError";
  assert.match(microphonePermissionMessage(missing), /не найден/);
  assert.equal(shouldPostVoiceReply({ cancelled: true, byteLength: 12 }), false);
  assert.equal(shouldPostVoiceReply({ cancelled: false, byteLength: 0 }), false);
  assert.equal(shouldPostVoiceReply({ cancelled: false, byteLength: 12 }), true);
  assert.equal(
    voiceReplyRetryTarget({ voiceError: true, hasVoicePayload: true, hasDraft: true }),
    "voice",
  );
  assert.equal(
    voiceReplyRetryTarget({ voiceError: false, hasVoicePayload: false, hasDraft: true }),
    "text",
  );
  assert.equal(
    voiceReplyRetryTarget({ voiceError: true, hasVoicePayload: false, hasDraft: false }),
    "reload",
  );

  const dialogue = readFileSync(path.join(repoRoot, "src/components/ThoughtDialogue.tsx"), "utf8");
  const profile = readFileSync(path.join(repoRoot, "src/components/ProfileConversation.tsx"), "utf8");
  const voice = readFileSync(path.join(repoRoot, "src/lib/dialogue.ts"), "utf8");
  assert.match(dialogue, /microphonePermissionMessage/);
  assert.match(dialogue, /shouldPostVoiceReply/);
  assert.match(dialogue, /lastVoiceRef/);
  assert.match(dialogue, /voiceReplyRetryTarget/);
  assert.equal(dialogue.includes("/api/reels/${reelId}/takes"), false);
  assert.match(profile, /microphonePermissionMessage/);
  assert.match(profile, /lastVoiceRef/);
  assert.match(voice, /return sendDialogueMessage/);
  assert.equal(voice.includes("createTake"), false);
  assert.equal(voice.includes("console.log"), false);
});
