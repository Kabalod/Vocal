import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("private storage bucket", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260919193000_private_media.sql"), "utf8");

  it("keeps vocal-private non-public and scoped to auth.uid folder", () => {
    assert.match(sql, /vocal-private/);
    assert.match(sql, /public = false/);
    assert.match(sql, /to authenticated/);
    assert.match(sql, /auth\.uid\(\)::text/);
    assert.doesNotMatch(sql, /to anon/);
  });
});
