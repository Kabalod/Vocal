import path from "node:path";
import { createAppBackup, restoreAppBackup } from "../src/lib/backup";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  let dest = arg("--dest");
  const restoreFrom = arg("--restore-from");
  const restoreTo = arg("--restore-to");
  if (!dest && !restoreFrom) {
    const positional = process.argv.slice(2).filter((item) => !item.startsWith("-"));
    dest = positional[0];
  }
  if (restoreFrom && restoreTo) {
    const manifest = await restoreAppBackup({ fromDir: restoreFrom, toDir: restoreTo });
    console.log(JSON.stringify({ ok: true, action: "restore", to: path.resolve(restoreTo), manifest }, null, 2));
    return;
  }
  if (!dest) {
    console.error("Использование:");
    console.error("  npx tsx scripts/backup.ts --dest <каталог>");
    console.error("  npx tsx scripts/backup.ts --restore-from <бэкап> --restore-to <изолированный каталог>");
    console.error("Сначала остановите процессы, пишущие в БД.");
    process.exit(1);
  }
  const manifest = await createAppBackup({ destDir: dest });
  console.log(JSON.stringify({ ok: true, action: "backup", dest: path.resolve(dest), manifest }, null, 2));
}

void main();
