import assert from "node:assert/strict";
import { test } from "node:test";
import { clientThoughtMediaError, formatRecordingDuration, revokePreviewUrl, stopMediaStream } from "../src/lib/media-session";

test("media session stops tracks, revokes preview, and names real limits", () => {
  const stops: string[] = [];
  const stream = {
    getTracks: () => [{ stop: () => stops.push("a") }, { stop: () => stops.push("b") }],
  } as unknown as MediaStream;
  stopMediaStream(stream);
  assert.deepEqual(stops, ["a", "b"]);
  stopMediaStream(null);

  const revoked: string[] = [];
  const original = URL.revokeObjectURL;
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
  revokePreviewUrl("blob:preview-1");
  revokePreviewUrl(null);
  URL.revokeObjectURL = original;
  assert.deepEqual(revoked, ["blob:preview-1"]);

  assert.equal(formatRecordingDuration(75), "1:15");
  assert.match(clientThoughtMediaError(new File(["x"], "note.txt"), "video", 80) ?? "", /формат/);
  const huge = { name: "clip.mp4", size: 81 * 1024 * 1024 } as File;
  assert.match(clientThoughtMediaError(huge, "video", 80) ?? "", /80 МБ/);
});
