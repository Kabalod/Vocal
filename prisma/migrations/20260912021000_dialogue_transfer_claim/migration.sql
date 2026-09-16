-- AlterTable
ALTER TABLE "DialogueMessage" ADD COLUMN "claimKey" TEXT;
CREATE UNIQUE INDEX "DialogueMessage_claimKey_key" ON "DialogueMessage"("claimKey");
