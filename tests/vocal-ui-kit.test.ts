import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SHELL_NAV } from "../src/components/shell-nav";
import { isDevUiEnabled, VOCAL_USER_STATUSES } from "../src/components/vocal-ui/kit";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("dev ui catalog is off in production and not in user nav", () => {
  assert.equal(isDevUiEnabled("production"), false);
  assert.equal(isDevUiEnabled("development"), true);
  assert.equal(isDevUiEnabled("test"), true);
  assert.equal(
    SHELL_NAV.some((item) => item.href.includes("/dev")),
    false,
  );
  const page = readFileSync(join(root, "src/app/dev/ui/page.tsx"), "utf8");
  assert.match(page, /isDevUiEnabled/);
  assert.match(page, /notFound/);
});

test("kit statuses and segmented tabs stay off champagne fill", () => {
  assert.deepEqual(
    VOCAL_USER_STATUSES.map((item) => item.label),
    ["Не завершена", "В работе", "Успешно завершена"],
  );
  const tabs = readFileSync(join(root, "src/components/vocal-ui/SegmentedTabs.tsx"), "utf8");
  const filters = readFileSync(join(root, "src/components/vocal-ui/FilterControl.tsx"), "utf8");
  const catalog = readFileSync(join(root, "src/components/vocal-ui/UiKitCatalog.tsx"), "utf8");
  const icons = readFileSync(join(root, "src/components/vocal-ui/icons.tsx"), "utf8");
  assert.match(tabs, /bg-field/);
  assert.equal(tabs.includes("bg-accent"), false);
  assert.match(filters, /border-accent/);
  assert.match(catalog, /bg-field/);
  assert.match(catalog, />Вы</);
  assert.match(icons, /Lucide is not installed/);
  assert.equal(icons.includes("lucide-react"), false);
});

test("modal trap reuses sheet helpers and keeps backdrop out of tab order", () => {
  const modal = readFileSync(join(root, "src/components/vocal-ui/VocalModal.tsx"), "utf8");
  assert.match(modal, /trapSheetTab/);
  assert.match(modal, /aria-hidden="true"/);
  assert.match(modal, /data-vocal-initial/);
  assert.equal(/aria-label="Закрыть меню"/.test(modal), false);
});
