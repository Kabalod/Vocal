import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthError, ownerUserId, runWithOwner } from "../src/lib/auth/session";

test("non-test runtime never falls back to local", () => {
  const env = process.env as { NODE_ENV?: string };
  const previous = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    assert.throws(() => ownerUserId(), AuthError);
    assert.throws(
      () => runWithOwner({ id: "local", email: null }, () => ownerUserId()),
      AuthError,
    );
  } finally {
    env.NODE_ENV = previous;
  }
});
