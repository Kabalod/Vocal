import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adoptGrantedMicrophone,
  cancelVoiceCaptureSession,
  clientThoughtMediaError,
  closeAudioContext,
  createVoiceCaptureSession,
  detachRecorderHandlers,
  formatRecordingDuration,
  previewUrlIfSessionActive,
  revokePreviewUrl,
  stopMediaStream,
  stopRecorderIfActive,
} from "../src/lib/media-session";
import {
  ABORT_UPLOAD_LEAVE_TEXT,
  syncThoughtUploadToSheetVisibility,
  thoughtLeaveKind,
} from "../src/lib/thought-leave";
import { ThoughtUploadAbortedError, uploadThoughtMedia } from "../src/lib/thought-media-upload";

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

test("late microphone permission after cancel stops tracks and does not start a recorder", () => {
  const session = createVoiceCaptureSession();
  cancelVoiceCaptureSession(session);
  const stops: string[] = [];
  const stream = {
    getTracks: () => [{ stop: () => stops.push("late") }],
  } as unknown as MediaStream;
  let recorderCreated = false;
  const adopted = adoptGrantedMicrophone(session, stream);
  if (adopted) recorderCreated = true;
  assert.equal(adopted, false);
  assert.deepEqual(stops, ["late"]);
  assert.equal(recorderCreated, false);
});

test("cleanup after preview does not stop inactive recorder or recreate a URL", () => {
  const session = createVoiceCaptureSession();
  const errors: string[] = [];
  const recorder = {
    state: "inactive",
    stop() {
      errors.push("InvalidStateError");
      throw new Error("InvalidStateError");
    },
    ondataavailable: () => undefined,
    onstop: () => undefined,
  };
  stopRecorderIfActive(recorder);
  detachRecorderHandlers(recorder);
  assert.equal(errors.length, 0);
  assert.equal(recorder.onstop, null);

  cancelVoiceCaptureSession(session);
  const created: string[] = [];
  const url = previewUrlIfSessionActive(session, new Blob(["x"]), () => {
    created.push("blob:after-unmount");
    return "blob:after-unmount";
  });
  assert.equal(url, null);
  assert.deepEqual(created, []);

  const revoked: string[] = [];
  const original = URL.revokeObjectURL;
  URL.revokeObjectURL = (value: string) => {
    revoked.push(value);
  };
  revokePreviewUrl("blob:preview-old");
  URL.revokeObjectURL = original;
  assert.deepEqual(revoked, ["blob:preview-old"]);

  let closed = false;
  closeAudioContext({
    close: () => {
      closed = true;
    },
  });
  assert.equal(closed, true);
});

test("closing during upload aborts xhr and saved state does not offer deletion", async () => {
  let aborted = false;
  const xhr = {
    open() {},
    setRequestHeader() {},
    send() {},
    abort() {
      aborted = true;
      this.onabort?.();
    },
    upload: { onprogress: null },
    response: null,
    status: 0,
    responseType: "json",
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
  };
  const upload = uploadThoughtMedia(
    { file: new File(["x"], "clip.webm", { type: "audio/webm" }), inputType: "audio", idempotencyKey: "k1" },
    undefined,
    () => xhr as unknown as XMLHttpRequest,
  );
  const settled = upload.promise.then(
    () => "ok",
    (error: unknown) => error,
  );
  upload.abort();
  const result = await settled;
  assert.equal(aborted, true);
  assert.ok(result instanceof ThoughtUploadAbortedError);

  assert.equal(thoughtLeaveKind({ voiceDirty: true, uploading: false, reelId: null }), "discard-local");
  assert.equal(thoughtLeaveKind({ voiceDirty: false, uploading: true, reelId: null }), "abort-upload");
  assert.equal(thoughtLeaveKind({ voiceDirty: true, uploading: true, reelId: "reel-1" }), "saved-continue");
  assert.equal(thoughtLeaveKind({ voiceDirty: false, uploading: false, reelId: null }), "none");
});

test("hiding or unmounting the sheet aborts an in-flight upload", async () => {
  let aborted = 0;
  const upload = {
    abort() {
      aborted += 1;
    },
  };

  assert.equal(syncThoughtUploadToSheetVisibility({ open: true }, upload), "kept");
  assert.equal(aborted, 0);

  assert.equal(syncThoughtUploadToSheetVisibility({ open: false }, upload), "aborted");
  assert.equal(aborted, 1);

  assert.equal(syncThoughtUploadToSheetVisibility({ open: true, unmounting: true }, upload), "aborted");
  assert.equal(aborted, 2);

  const xhr = {
    open() {},
    setRequestHeader() {},
    send() {},
    abort() {
      this.onabort?.();
    },
    upload: { onprogress: null },
    response: null,
    status: 0,
    responseType: "json",
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
  };
  const handle = uploadThoughtMedia(
    { file: new File(["x"], "clip.webm", { type: "audio/webm" }), inputType: "audio", idempotencyKey: "k2" },
    undefined,
    () => xhr as unknown as XMLHttpRequest,
  );
  const settled = handle.promise.then(
    () => "ok",
    (error: unknown) => error,
  );
  syncThoughtUploadToSheetVisibility({ open: true, unmounting: true }, handle);
  const result = await settled;
  assert.ok(result instanceof ThoughtUploadAbortedError);
  assert.doesNotMatch(ABORT_UPLOAD_LEAVE_TEXT, /не создаст/);
});
