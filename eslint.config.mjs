import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  { ignores: ["docs/design/v0-export/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // CommonJS scripts (test runner, migrate, env loader) use require() by design.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default eslintConfig;
