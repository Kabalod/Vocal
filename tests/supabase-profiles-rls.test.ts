import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("supabase profiles scaffold", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260919183000_profiles.sql"), "utf8");

  it("isolates rows with auth.uid and does not grant anon", () => {
    assert.match(sql, /enable row level security/);
    assert.match(sql, /force row level security/);
    assert.match(sql, /to authenticated/);
    assert.match(sql, /\(select auth\.uid\(\)\) = id/);
    assert.doesNotMatch(sql, /grant [\w, ]+ on table public\.profiles to anon/i);
    assert.match(sql, /private\.handle_new_user/);
  });
});
