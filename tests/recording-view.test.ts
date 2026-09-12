import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ABORT_TAKE_UPLOAD_LEAVE_TEXT,
  applyLateTakeUploadResult,
  recordingNeedsDiscardConfirm,
  recordingTimerShouldRun,
  studioJobPhase,
  studioRecordGate,
  takeListOmitsMediaUrl,
} from "../src/lib/recording-session";
import {
  adoptGrantedMicrophone,
  cancelVoiceCaptureSession,
  createVoiceCaptureSession,
  detachRecorderHandlers,
  previewUrlIfSessionActive,
  revokePreviewUrl,
  stopMediaStream,
  stopRecorderIfActive,
} from "../src/lib/media-session";

test("recording idle does not run the timer and cancel of a fragment needs confirm", () => {
  assert.equal(recordingTimerShouldRun("idle"), false);
  assert.equal(recordingTimerShouldRun("permission"), false);
  assert.equal(recordingTimerShouldRun("recording"), true);
  assert.equal(recordingNeedsDiscardConfirm("idle"), false);
  assert.equal(recordingNeedsDiscardConfirm("recording"), true);
  assert.equal(recordingNeedsDiscardConfirm("preview"), true);
  assert.equal(recordingNeedsDiscardConfirm("saving"), true);
});

test("late upload result after leave is ignored and copy does not promise the server rolled back", () => {
  assert.equal(applyLateTakeUploadResult({ mounted: false, aborted: false }), "ignore");
  assert.equal(applyLateTakeUploadResult({ mounted: true, aborted: true }), "ignore");
  assert.equal(applyLateTakeUploadResult({ mounted: true, aborted: false }), "apply");
  assert.match(ABORT_TAKE_UPLOAD_LEAVE_TEXT, /мог успеть/);
  assert.equal(studioJobPhase({ status: "transcribing" }), "stt");
  assert.equal(studioJobPhase({ status: "error", stage: "stt" }), "error");
  assert.equal(studioJobPhase({ status: "done" }), "done");
});

test("go to record stays blocked without a ready script or while a draft is open", () => {
  assert.equal(studioRecordGate({ hasReadyScript: false, hasDraft: false }), "no-script");
  assert.equal(studioRecordGate({ hasReadyScript: true, hasDraft: true }), "draft-open");
  assert.equal(studioRecordGate({ hasReadyScript: true, hasDraft: false }), "ok");
});

test("list metadata omits media URLs until a take is opened", () => {
  assert.equal(takeListOmitsMediaUrl({ mediaUrl: null, downloadUrl: null }), true);
  assert.equal(takeListOmitsMediaUrl({ mediaUrl: "/api/takes/x/media", downloadUrl: null }), false);
});

test("leaving recording stops tracks and revokes the preview URL", () => {
  const session = createVoiceCaptureSession();
  const stops: string[] = [];
  const stream = {
    getTracks: () => [{ stop: () => stops.push("mic") }],
  } as unknown as MediaStream;
  const recorder = {
    state: "recording",
    stop() {
      this.state = "inactive";
    },
    ondataavailable: () => undefined,
    onstop: () => undefined,
  };
  stopRecorderIfActive(recorder);
  detachRecorderHandlers(recorder);
  stopMediaStream(stream);
  const url = previewUrlIfSessionActive(session, new Blob(["x"]));
  assert.ok(url);
  const revoked: string[] = [];
  const original = URL.revokeObjectURL;
  URL.revokeObjectURL = (value: string) => {
    revoked.push(value);
  };
  revokePreviewUrl(url);
  URL.revokeObjectURL = original;
  cancelVoiceCaptureSession(session);
  assert.deepEqual(stops, ["mic"]);
  assert.deepEqual(revoked, [url]);
  assert.equal(recorder.onstop, null);
});

test("late mic grant after leave does not keep the stream", () => {
  const session = createVoiceCaptureSession();
  cancelVoiceCaptureSession(session);
  const stops: string[] = [];
  const stream = {
    getTracks: () => [{ stop: () => stops.push("late") }],
  } as unknown as MediaStream;
  assert.equal(adoptGrantedMicrophone(session, stream), false);
  assert.deepEqual(stops, ["late"]);
});
