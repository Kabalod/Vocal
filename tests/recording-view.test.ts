import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ABORT_TAKE_UPLOAD_LEAVE_TEXT,
  applyLateTakeUploadResult,
  settleStudioTakeUpload,
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

test("unfinished studio video upload abort ignores a late success callback", async () => {
  const controller = new AbortController();
  let uploaded = 0;
  let release: ((res: Response) => void) | undefined;
  const request = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const settled = settleStudioTakeUpload({
    request,
    signal: controller.signal,
    mounted: () => false,
    onSuccess: () => {
      uploaded += 1;
    },
  });
  controller.abort();
  assert.equal(controller.signal.aborted, true);
  release?.(
    new Response(JSON.stringify({ job: { id: "late-job" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
  );
  assert.equal(await settled, "ignored");
  assert.equal(uploaded, 0);
});

test("go to record allows scriptless takes and only waits on an open draft", () => {
  assert.equal(studioRecordGate({ hasReadyScript: false, hasDraft: false }), "ok");
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

test("scriptless recording waits for explicit start and upload no longer requires a script", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const rec = readFileSync(join(root, "src/components/RecordingView.tsx"), "utf8");
  const uploads = readFileSync(join(root, "src/app/api/uploads/route.ts"), "utf8");
  const studio = readFileSync(join(root, "src/components/ReelStudio.tsx"), "utf8");
  const compare = readFileSync(join(root, "src/components/AutoTakeCompare.tsx"), "utf8");
  assert.match(rec, /Начать запись/);
  assert.match(rec, /scriptVersionId\?: string \| null/);
  assert.match(rec, /Запись без готового сценария/);
  assert.equal(rec.includes("getUserMedia"), true);
  assert.match(rec, /phase === "idle"/);
  assert.equal(uploads.includes("SCRIPT_REQUIRED"), false);
  assert.match(studio, /AutoTakeCompare/);
  assert.match(studio, /CompletionSummary/);
  assert.equal(studio.includes("TakeComparison"), false);
  assert.match(compare, /без выбора пары/);
  assert.equal(compare.includes("leftTakeId"), false);
});
