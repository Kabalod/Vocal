const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");

function parseEnvFile(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Next.js-compatible: shell env wins; .env.local overrides .env. */
function loadVocalEnv(root = process.cwd()) {
  const fromShell = new Set(Object.keys(process.env));
  const merged = {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, ".env.local")),
  };
  for (const [key, value] of Object.entries(merged)) {
    if (!fromShell.has(key)) process.env[key] = value;
  }
  return process.env;
}

module.exports = { parseEnvFile, loadVocalEnv };
