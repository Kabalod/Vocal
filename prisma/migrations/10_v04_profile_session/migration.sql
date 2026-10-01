-- V04: profile dialogue session is not part of an immutable portrait snapshot.
-- Do not apply to live Supabase from this cycle.

ALTER TABLE "CreatorProfile" ADD COLUMN "sessionJson" TEXT NOT NULL DEFAULT '{}';
