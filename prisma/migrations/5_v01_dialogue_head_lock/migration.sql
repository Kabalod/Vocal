-- Serialize dialogue head: every message write bumps DialogueThread.headEpoch.
-- Persist holds FOR UPDATE on the thread, so a concurrent INSERT waits on this UPDATE.

ALTER TABLE "DialogueThread" ADD COLUMN "headEpoch" INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION vocal_bump_dialogue_head()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "DialogueThread"
  SET "headEpoch" = "headEpoch" + 1,
      "updatedAt" = CLOCK_TIMESTAMP()
  WHERE id = COALESCE(NEW."threadId", OLD."threadId");
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS dialogue_message_bumps_head ON "DialogueMessage";
CREATE TRIGGER dialogue_message_bumps_head
AFTER INSERT OR UPDATE OR DELETE ON "DialogueMessage"
FOR EACH ROW
EXECUTE FUNCTION vocal_bump_dialogue_head();
