-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Reel" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "initialNote" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "selectedTakeId" TEXT,
    "finalTakeId" TEXT,
    "reelGoal" TEXT NOT NULL DEFAULT '',
    "reelAudience" TEXT NOT NULL DEFAULT '',
    "contextKeysJson" TEXT NOT NULL DEFAULT '[]',
    "selectedScriptId" TEXT,
    "finalScriptId" TEXT,
    "ownerUserId" TEXT NOT NULL DEFAULT 'local',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL DEFAULT 'local',
    "currentRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileRevision" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelContextSnapshot" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "profileRevisionId" TEXT,
    "reelGoal" TEXT NOT NULL,
    "reelAudience" TEXT NOT NULL,
    "selectedKeysJson" TEXT NOT NULL,
    "assembledJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelContextSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThoughtCreateKey" (
    "key" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThoughtCreateKey_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Take" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "inputType" TEXT NOT NULL,
    "authorNote" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT,
    "mediaStatus" TEXT NOT NULL DEFAULT 'ready',
    "originalName" TEXT,
    "storedPath" TEXT,
    "mimeType" TEXT,
    "bodyText" TEXT NOT NULL DEFAULT '',
    "selectedTranscriptId" TEXT,
    "scriptVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Take_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptRevision" (
    "id" TEXT NOT NULL,
    "takeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "segmentsJson" TEXT,
    "language" TEXT,
    "sttModel" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "videoPath" TEXT NOT NULL,
    "audioPath" TEXT,
    "durationSec" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" TEXT NOT NULL DEFAULT 'convert',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "leaseUntil" TIMESTAMP(3),
    "leaseOwner" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "takeId" TEXT,
    "ownerUserId" TEXT NOT NULL DEFAULT 'local',

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisResult" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isExtended" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT NOT NULL DEFAULT 'content',
    "categoryLabel" TEXT NOT NULL DEFAULT '',
    "categoryWeight" INTEGER NOT NULL DEFAULT 20,
    "categoryOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reelId" TEXT,
    "profileId" TEXT,
    "takeId" TEXT,
    "reviewId" TEXT,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "promptText" TEXT NOT NULL,
    "inputSnapshotJson" TEXT NOT NULL,
    "responseText" TEXT,
    "resultJson" TEXT,
    "errorMessage" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "ownerUserId" TEXT NOT NULL DEFAULT 'local',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "takeId" TEXT NOT NULL,
    "transcriptRevisionId" TEXT NOT NULL,
    "contextSnapshotId" TEXT,
    "previousReviewId" TEXT,
    "aiCallId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "resultJson" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "reviewId" TEXT,
    "roundId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptVersion" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recordingJson" TEXT NOT NULL DEFAULT '{}',
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "parentId" TEXT,
    "contextSnapshotId" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "inventedIdeasJson" TEXT NOT NULL DEFAULT '[]',
    "inputSnapshotJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptDraft" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "sourceKind" TEXT NOT NULL DEFAULT 'manual',
    "baseVersionId" TEXT,
    "saveToken" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScriptDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DialogueThread" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'reel',
    "reelId" TEXT,
    "profileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DialogueThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DialogueMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'done',
    "idempotencyKey" TEXT,
    "claimKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DialogueMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompareResult" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "leftTakeId" TEXT NOT NULL,
    "rightTakeId" TEXT NOT NULL,
    "leftTranscriptId" TEXT NOT NULL,
    "rightTranscriptId" TEXT NOT NULL,
    "intent" TEXT NOT NULL DEFAULT '',
    "textDiffJson" TEXT NOT NULL,
    "resultJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'done',
    "errorMessage" TEXT,
    "contextSnapshotId" TEXT,
    "aiCallId" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompareResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reel_ownerUserId_createdAt_idx" ON "Reel"("ownerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_ownerUserId_key" ON "CreatorProfile"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ThoughtCreateKey_reelId_key" ON "ThoughtCreateKey"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "Take_reelId_number_key" ON "Take"("reelId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Take_reelId_idempotencyKey_key" ON "Take"("reelId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Job_ownerUserId_createdAt_idx" ON "Job"("ownerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisResult_jobId_key" ON "AnalysisResult"("jobId");

-- CreateIndex
CREATE INDEX "AiCall_reelId_createdAt_idx" ON "AiCall"("reelId", "createdAt");

-- CreateIndex
CREATE INDEX "AiCall_profileId_createdAt_idx" ON "AiCall"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "AiCall_ownerUserId_createdAt_idx" ON "AiCall"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ScriptVersion_reelId_createdAt_idx" ON "ScriptVersion"("reelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptDraft_reelId_key" ON "ScriptDraft"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "DialogueThread_reelId_key" ON "DialogueThread"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "DialogueThread_profileId_key" ON "DialogueThread"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "DialogueMessage_claimKey_key" ON "DialogueMessage"("claimKey");

-- CreateIndex
CREATE INDEX "DialogueMessage_threadId_createdAt_idx" ON "DialogueMessage"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DialogueMessage_threadId_idempotencyKey_key" ON "DialogueMessage"("threadId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CompareResult_reelId_createdAt_idx" ON "CompareResult"("reelId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProfileRevision" ADD CONSTRAINT "ProfileRevision_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelContextSnapshot" ADD CONSTRAINT "ReelContextSnapshot_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThoughtCreateKey" ADD CONSTRAINT "ThoughtCreateKey_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Take" ADD CONSTRAINT "Take_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Take" ADD CONSTRAINT "Take_scriptVersionId_fkey" FOREIGN KEY ("scriptVersionId") REFERENCES "ScriptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptRevision" ADD CONSTRAINT "TranscriptRevision_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "Take"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "Take"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisResult" ADD CONSTRAINT "AnalysisResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "Take"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_aiCallId_fkey" FOREIGN KEY ("aiCallId") REFERENCES "AiCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptVersion" ADD CONSTRAINT "ScriptVersion_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptDraft" ADD CONSTRAINT "ScriptDraft_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DialogueThread" ADD CONSTRAINT "DialogueThread_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DialogueThread" ADD CONSTRAINT "DialogueThread_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DialogueMessage" ADD CONSTRAINT "DialogueMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DialogueThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompareResult" ADD CONSTRAINT "CompareResult_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
