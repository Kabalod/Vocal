import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const loaded = require("./load-env.cjs") as {
  parseEnvFile: (filePath: string) => Record<string, string>;
  loadVocalEnv: (root?: string) => NodeJS.ProcessEnv;
};

export const parseEnvFile = loaded.parseEnvFile;
export const loadVocalEnv = loaded.loadVocalEnv;
