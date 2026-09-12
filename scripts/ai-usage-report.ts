import { buildAiUsageReport } from "../src/lib/ai/usage-report";

async function main() {
  const report = await buildAiUsageReport();
  console.log(JSON.stringify(report, null, 2));
}

void main();
