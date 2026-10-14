/**
 * Daily spend report from AiCall: per user, per kind of action, STT apart, the day's total against the provider's daily limit.
 *   npm run report:daily -- [--day YYYY-MM-DD] [--out-dir DIR]
 * Writes DIR/ai-usage-YYYY-MM-DD.md and .json (default DIR: $VOCAL_REPORT_DIR or ./reports) and prints the path.
 * Reads the database named by DATABASE_URL; never reads promptText/responseText; makes no model calls.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadDailyReport, renderDailyReportMarkdown } from "../src/lib/ai/daily-report";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const report = await loadDailyReport({ day: arg("--day") });
  const dir = path.resolve(arg("--out-dir") ?? process.env.VOCAL_REPORT_DIR ?? "reports");
  mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `ai-usage-${report.day}`);
  writeFileSync(`${base}.md`, renderDailyReportMarkdown(report), "utf8");
  writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`${base}.md`);
  console.log(`${base}.json`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
