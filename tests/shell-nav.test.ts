import assert from "node:assert/strict";
import { test } from "node:test";
import { isShellNavActive, SHELL_NAV, shellBack, shellHeaderTitle } from "../src/components/shell-nav";

test("shell nav is only recordings and profile", () => {
  assert.deepEqual(
    SHELL_NAV.map((item) => item.label),
    ["Записи", "Профиль"],
  );
  assert.equal(isShellNavActive("/reels/abc", "/reels"), true);
  assert.equal(isShellNavActive("/profile", "/reels"), false);
  assert.equal(shellBack("/reels"), null);
  assert.equal(shellBack("/profile"), null);
  assert.equal(shellBack("/reels/cmexample"), null);
  assert.deepEqual(shellBack("/"), { href: "/reels", label: "Записи" });
  assert.deepEqual(shellBack("/jobs/cmexample"), { href: "/history", label: "История" });
  assert.equal(shellHeaderTitle("/reels"), "Записи");
  assert.equal(shellHeaderTitle("/profile"), "Профиль");
});
