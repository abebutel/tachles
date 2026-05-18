import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Local plugin — three custom rules that enforce the no-log proxy discipline.
// See docs/no-log-proxy-spec.md §Enforcement.
const proxyPlugin = require("./eslint-rules/index.js");

const PROXY_GLOBS = [
  "lib/proxy/**/*.{ts,tsx,js,mjs}",
  "app/api/ocr/**/*.{ts,tsx,js,mjs}",
  "app/api/translate/**/*.{ts,tsx,js,mjs}",
  "app/api/sync/**/*.{ts,tsx,js,mjs}",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ESLint plugin code is CommonJS — not subject to Next/TS rules.
    "eslint-rules/**",
  ]),
  // Proxy-path enforcement. These rules only run in the directories that
  // handle user document bodies.
  {
    files: PROXY_GLOBS,
    plugins: { tachles: proxyPlugin },
    rules: {
      "tachles/no-body-logging": "error",
      "tachles/no-console-in-proxy": "error",
      "tachles/no-text-on-request": "error",
    },
  },
  // Spec exception (Six Disciplines #2): translate-pipeline.ts is the ONLY
  // file allowed to call request.json() — it has to read OCR text to
  // orchestrate the 3-call pipeline. The other two rules still apply here.
  {
    files: ["lib/proxy/translate-pipeline.ts"],
    rules: {
      "tachles/no-text-on-request": "off",
    },
  },
]);

export default eslintConfig;
