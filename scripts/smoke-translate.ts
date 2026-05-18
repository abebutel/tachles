#!/usr/bin/env tsx
// Smoke test / tone-review tool for the translate pipeline.
//
// Runs the full classify -> route -> specialist -> quality-check chain
// against a real OCR text, prints the structured output, total latency,
// total token usage, and approximate cost.
//
// Usage:
//   pnpm tsx scripts/smoke-translate.ts <path-to-text-file>
//   pnpm tsx scripts/smoke-translate.ts - < ocr.txt   # stdin
//
// The DoD for Day 6 says "you have read every output and approved the
// tone" for a 5-letters-per-specialist corpus. Run this for each. If a
// specialist's tone is off, edit the prompt in lib/prompts/<specialist>.ts
// and re-run.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function loadEnvLocal(): Promise<void> {
  try {
    const raw = await readFile(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const [, key, valueRaw] = m;
      if (process.env[key]) continue;
      let value = valueRaw;
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // No .env.local — assume env is set externally.
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Approximate Anthropic Claude Sonnet 4.6 pricing in USD per 1M tokens.
// Source: Anthropic public pricing as of 2026-05. Adjust if rates change.
const COST_PER_1M_INPUT_USD = 3.0;
const COST_PER_1M_OUTPUT_USD = 15.0;

function approxCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_1M_INPUT_USD +
    (outputTokens / 1_000_000) * COST_PER_1M_OUTPUT_USD
  );
}

async function main(): Promise<void> {
  await loadEnvLocal();

  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: pnpm tsx scripts/smoke-translate.ts <path-to-text-file>");
    console.error("       pnpm tsx scripts/smoke-translate.ts - < ocr.txt");
    process.exit(2);
  }

  const ocrText = arg === "-"
    ? await readStdin()
    : await readFile(resolve(arg), "utf8");
  const trimmed = ocrText.trim();
  if (!trimmed) {
    console.error("Input is empty.");
    process.exit(2);
  }

  console.log(`Input: ${trimmed.length} chars`);
  console.log("");

  // Build a fake Request the pipeline can read with request.json().
  const body = JSON.stringify({ ocr_text: trimmed });
  const request = new Request("https://smoke-test.local/api/translate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body, "utf8")),
    },
    body,
  });

  const { runTranslationPipeline } = await import("../lib/proxy/translate-pipeline");

  const t0 = Date.now();
  const result = await runTranslationPipeline(request);
  const latencyMs = Date.now() - t0;

  console.log("─".repeat(60));
  console.log("Classification");
  console.log("─".repeat(60));
  console.log(`category   = ${result.body.classification.institution_category}`);
  console.log(`confidence = ${result.body.classification.confidence.toFixed(3)}`);
  console.log(`signals    = ${result.body.classification.detected_signals.join("; ")}`);
  console.log(`route      = ${result.metadata.specialist_route}`);
  console.log("");

  console.log("─".repeat(60));
  console.log("Translation");
  console.log("─".repeat(60));
  const t = result.body.translation;
  console.log(`tldr_he:    ${t.tldr_he}`);
  console.log(`tldr_en:    ${t.tldr_en}`);
  console.log(`institution: ${t.institution}`);
  console.log(`doc_type:   ${t.document_type}`);
  if (t.reference_numbers.length > 0) {
    console.log("");
    console.log("Reference numbers:");
    for (const r of t.reference_numbers) console.log(`  ${r.label}: ${r.value}`);
  }
  if (t.amounts.length > 0) {
    console.log("");
    console.log("Amounts:");
    for (const a of t.amounts) console.log(`  ${a.label}: ${a.amount} ${a.currency ?? ""}`);
  }
  if (t.dates.length > 0) {
    console.log("");
    console.log("Dates:");
    for (const d of t.dates) console.log(`  ${d.label}: ${d.date}${d.is_deadline ? " (deadline)" : ""}`);
  }
  if (t.action_items.length > 0) {
    console.log("");
    console.log("Action items:");
    for (const a of t.action_items) {
      console.log(`  [${a.urgency}] ${a.description_en}`);
      if (a.deadline_date) console.log(`         due ${a.deadline_date}`);
    }
  }
  console.log("");
  console.log("Translation (Hebrew):");
  console.log(t.translation_he);
  console.log("");
  console.log("Translation (English):");
  console.log(t.translation_en);
  console.log("");

  console.log("─".repeat(60));
  console.log("Quality check");
  console.log("─".repeat(60));
  console.log(`passes     = ${result.body.quality_check.passes ? "✓" : "✗"}`);
  console.log(`confidence = ${result.body.quality_check.confidence.toFixed(3)}`);
  if (result.body.quality_check.concerns.length > 0) {
    console.log("concerns:");
    for (const c of result.body.quality_check.concerns) console.log(`  - ${c}`);
  }
  console.log("");

  console.log("─".repeat(60));
  console.log("Metrics");
  console.log("─".repeat(60));
  const cost = approxCostUsd(result.metadata.total_input_tokens, result.metadata.total_output_tokens);
  console.log(`latency:       ${latencyMs} ms (target: <10000)`);
  console.log(`calls:         ${result.metadata.call_count}`);
  console.log(`input tokens:  ${result.metadata.total_input_tokens.toLocaleString()}`);
  console.log(`output tokens: ${result.metadata.total_output_tokens.toLocaleString()}`);
  console.log(`approx cost:   $${cost.toFixed(4)} USD (target: $0.006-0.011)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
