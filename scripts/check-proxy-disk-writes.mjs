#!/usr/bin/env node
// Pre-commit scanner. Run on staged files (via lint-staged) — fails if any
// file in the proxy paths contains a disk-write pattern without the explicit
// override comment.
//
// Spec: docs/no-log-proxy-spec.md §The Six Disciplines #6, §Pre-commit hook.
//
// Override: a line containing `proxy-disk-write-approved: <reason>` exempts
// the call (intended for the rare case where a temp file is unavoidable and
// has been code-reviewed).

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const FORBIDDEN_PATTERNS = [
  { name: "fs.write*",       re: /\bfs\.write(File)?(Sync)?\b/ },
  { name: "fs.append*",      re: /\bfs\.append(File)?(Sync)?\b/ },
  { name: "createWriteStream", re: /\bcreateWriteStream\b/ },
  { name: "os.tmpdir",       re: /\bos\.tmpdir\s*\(/ },
  { name: "/tmp/ path",      re: /["'`]\/tmp\//  },
  // HTTP libraries that ship request/response interceptors by default. Pure
  // `fetch` is fine; these are not.
  { name: "axios import",    re: /\b(from\s+|require\(\s*)["']axios["']/ },
  { name: "got import",      re: /\b(from\s+|require\(\s*)["']got["']/ },
  { name: "node-fetch import", re: /\b(from\s+|require\(\s*)["']node-fetch["']/ },
];

const OVERRIDE_RE = /proxy-disk-write-approved\s*:/;

// Anything passed on argv is a file path to scan. Only proxy-path files are
// scanned; lint-staged restricts the file list via its config, but we re-check
// here defensively.
const PROXY_PATH_RE = /(^|[\\/])(lib[\\/]proxy|app[\\/]api[\\/](ocr|translate|sync))[\\/]/;

const files = process.argv.slice(2);
const violations = [];

for (const fileArg of files) {
  const abs = resolve(fileArg);
  const rel = relative(process.cwd(), abs);
  if (!PROXY_PATH_RE.test(rel)) continue;

  let source;
  try {
    source = readFileSync(abs, "utf8");
  } catch {
    continue; // file deleted in the diff
  }

  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { name, re } of FORBIDDEN_PATTERNS) {
      if (re.test(line) && !OVERRIDE_RE.test(line)) {
        violations.push({ file: rel, lineNum: i + 1, pattern: name, line: line.trim() });
      }
    }
  }
}

if (violations.length > 0) {
  console.error("\nPre-commit: disk-write / banned-import patterns found in proxy paths.\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.lineNum}  [${v.pattern}]`);
    console.error(`    ${v.line}`);
  }
  console.error(
    "\nThe proxy path must not write document bytes to disk and must not use HTTP\n" +
    "libraries with default request/response interceptors. See\n" +
    "docs/no-log-proxy-spec.md §Six Disciplines.\n\n" +
    "If this write is genuinely necessary, add a `proxy-disk-write-approved: <reason>`\n" +
    "comment on the same line and get a second reviewer.\n"
  );
  process.exit(1);
}
