# Technical Spec — No-Log Streaming Proxy

*For Tachles (the Bureaucracy Translator). Draft v1.*

> **Note for the private beta.** This spec describes the full public-launch architecture. During the current private-beta phase, the `/api/sync/*` routes (encrypted cross-device history) are **not built** — beta users keep history on-device only via IndexedDB. All other components in this spec are in scope for the beta build. See `build-plan-beta.md` for the beta scope; `build-plan-v1.md` covers the additional work for public launch.

## Purpose

This document specifies how the document-processing path is built. It exists to make the privacy policy's promises **technically true and auditable**. Every claim in the policy ("we don't store your letter", "we don't log it", "we don't keep a copy") must map to a control in this document.

## Goals

- The body of every document-processing request flows from browser → our server → upstream provider → browser **without ever being persisted, logged, copied, or sent to an error tracker.**
- The application code is structured so that violating this is hard to do accidentally and easy to catch in code review and CI.
- We have automated tests that *verify* the property end-to-end, not just inspect-by-eye.
- We can still monitor, debug, and bill the service — using only metadata that does not identify content.

## Non-goals

- Hiding the existence of requests from upstream providers (Anthropic, Google) — that is governed by their privacy terms, disclosed in our subprocessors page.
- Encrypting bodies in our server's memory (TLS terminates at our edge; in-memory plaintext is unavoidable during the request and is acceptable).
- Preventing a sophisticated insider with root on the production hosts from observing memory in real time (out of scope for v1; out of typical threat model for a small SaaS).

---

## Architecture overview

Three request paths handle user content. All three follow the same discipline.

```
Browser → /api/ocr        → Google Cloud Vision (→ Claude Vision fallback) → Browser
Browser → /api/translate  → Anthropic (×3 calls)                            → Browser
Browser → /api/sync/*     → Supabase (ciphertext only, paid tier)
```

All three are Next.js 14 App Router route handlers, deployed to **Vercel Edge runtime** where possible (true streaming, no Node-buffering surprises) and Node runtime only where a required library does not yet support Edge.

A separate set of routes — `/api/auth/*`, `/api/account/*`, `/api/billing/*` — handle account data and are conventional (logging permitted, body access permitted). Those are out of scope for this spec.

---

## The Six Disciplines

These are the rules every developer working in the proxy path must internalize. They are also what the ESLint rule, the CI canary, and the security review check.

**1. The request body is never read into a complete in-memory string in our code.**
Use `request.body` as a `ReadableStream` and pipe it directly to the upstream provider. Never call `await request.text()`, `await request.json()`, or `await request.arrayBuffer()` on a content-bearing request inside the proxy path.

**2. The response body is never read into a complete in-memory string in our code.**
Stream the upstream response directly back to the client. The exception is the *final* response of the translate pipeline (which needs JSON parsing for the multi-call orchestration) — that parse happens in a function explicitly marked `// CONTAINS USER CONTENT — DO NOT LOG`, and the parsed object never leaves that function except as a streamed response.

**3. No logger call ever takes a body, document, or translation as an argument.**
The logger interface (see "Logger contract" below) is typed to reject content fields. Calling `logger.info({ body: req.body })` is a compile-time error.

**4. Error objects never include the body.**
We use a `SafeError` class. Catching an upstream error and re-throwing strips any field that could contain content. The error tracker has a `beforeSend` hook as belt-and-suspenders.

**5. HTTP client middleware/interceptors are forbidden in the proxy path.**
No request logging at the HTTP-client level, no automatic retries that buffer bodies, no third-party observability libraries (Datadog APM, New Relic, etc.) without an explicit body-scrubbing configuration that has been reviewed.

**6. Anything written to disk in the proxy path requires a code-review tag.**
The pre-commit hook flags `fs.write*`, `createWriteStream`, `tmp/`, `/tmp/`, `os.tmpdir()`, and similar patterns in the proxy directories. Override requires a comment `// proxy-disk-write-approved: <reason>` and a second reviewer.

---

## Per-route specifications

### `/api/ocr`

| | |
|---|---|
| Method | `POST` |
| Runtime | Edge |
| Auth | Supabase JWT (verified via signed JWT, no DB call) |
| Input | `multipart/form-data` with single `image` field (max 10 MB) |
| Upstream | Google Cloud Vision API (primary); Anthropic Claude Vision (fallback on low confidence or failure) |
| Output | `application/json` with `{ text: string, confidence: number, provider_used: "google" \| "claude_fallback" }` |

Flow: the route accepts the multipart upload as a stream, verifies auth and rate limit on the metadata before reading any body bytes, forwards the image bytes to Google Cloud Vision's `documentTextDetection` endpoint, and streams the parsed text back to the client. If Google Vision returns a confidence below the configured threshold (default 0.75, tunable via `OCR_FALLBACK_CONFIDENCE_THRESHOLD`) or fails outright, the route retries the same image bytes against Claude Vision and uses that result. Image bytes are held in memory only for the duration of the request — never buffered to disk between primary and fallback attempts.

Logged (per request, structured JSON, never the body):
```
{
  ts, user_id, request_id, route: "ocr",
  image_size_bytes, response_status,
  ocr_provider_used,        // "google" | "claude_fallback"
  ocr_confidence, latency_ms
}
```

### `/api/translate`

| | |
|---|---|
| Method | `POST` |
| Runtime | Edge |
| Auth | Supabase JWT |
| Input | `application/json` with `{ ocr_text: string, target_language: 'he' \| 'en' }` |
| Upstream | Anthropic Messages API — 3 sequential calls |
| Output | `application/json` with the structured translation |

This route is the most subtle because it cannot pure-stream the body — the orchestration logic needs to read the classification response to choose the right specialist prompt, and it needs to read the translation to feed it into the quality-check call. So the body *does* exist as a parsed object briefly in memory, in a single function clearly marked.

Flow:

1. Read body via `await request.json()` **only inside** `runTranslationPipeline()` in `lib/proxy/translate-pipeline.ts`. That file is flagged in the ESLint config as the *only* place this is allowed.
2. Call Anthropic for classification. Receive structured JSON. Choose specialist prompt.
3. Call Anthropic for specialist translation.
4. Call Anthropic for quality check.
5. Return final translation to client as a streamed response.
6. All intermediate objects go out of scope at function exit. No references retained.

Logged (per request):
```
{
  ts, user_id, request_id, route: "translate",
  classification_label,          // e.g. "bituach_leumi" — not content
  classification_confidence,
  specialist_route,              // which specialist was used
  total_input_tokens,
  total_output_tokens,
  call_count: 3,
  response_status,
  latency_ms,
  quality_check_passed: boolean
}
```

Note: `classification_label` is a fixed enum of document categories ("bituach_leumi", "bank", "municipality", "lawyer", "unknown"). It is metadata *about* the document, not content *from* the document. This is acceptable to log.

### `/api/sync/*` (paid tier)

| | |
|---|---|
| Methods | `POST /upload`, `GET /list`, `GET /:id`, `DELETE /:id` |
| Runtime | Edge |
| Auth | Supabase JWT |
| Input/Output | Ciphertext blobs only |
| Upstream | Supabase Storage / Postgres |

The browser encrypts a translation client-side using a key derived from the user's password via Argon2id, then uploads the ciphertext. The server stores ciphertext and an associated salt and IV. It cannot decrypt.

Server-side schema (Postgres, paid users only):

```sql
create table public.encrypted_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  ciphertext bytea not null,
  iv bytea not null,
  argon2_salt bytea not null,
  argon2_params jsonb not null,
  created_at timestamptz default now()
);

create index on public.encrypted_history (user_id, created_at desc);
```

Notes: `argon2_salt` and `argon2_params` are needed so the browser can re-derive the key on a new device. The password itself is never sent to the server.

Logged (per request):
```
{
  ts, user_id, request_id, route: "sync.upload",
  ciphertext_size_bytes,
  response_status, latency_ms
}
```

---

## Logger contract

The proxy logger is a wrapper around the standard logger with a typed interface that **structurally rejects** content fields.

```ts
// lib/proxy/logger.ts

type LoggableField =
  | "ts" | "user_id" | "request_id" | "route"
  | "image_size_bytes" | "response_status" | "ocr_confidence" | "ocr_provider_used"
  | "classification_label" | "classification_confidence"
  | "specialist_route" | "total_input_tokens" | "total_output_tokens"
  | "call_count" | "latency_ms" | "quality_check_passed"
  | "ciphertext_size_bytes"
  | "error_class" | "error_code";

type LogPayload = Partial<Record<LoggableField, string | number | boolean>>;

export const proxyLogger = {
  info(payload: LogPayload): void { /* ... */ },
  warn(payload: LogPayload): void { /* ... */ },
  error(payload: LogPayload): void { /* ... */ },
};
```

Calling `proxyLogger.info({ body: "..." })` is a TypeScript compile error. So is `{ ocr_text: "..." }`, `{ translation: ... }`, or any field not in the `LoggableField` union. Adding a new field to the union requires a code-review tag (`// log-field-added: <reason>`) so reviewers explicitly approve every new logged property.

`console.log`, `console.error`, etc. are banned in the proxy directories by ESLint.

---

## Error handling

All errors thrown in the proxy path are instances of `SafeError`:

```ts
// lib/proxy/safe-error.ts

export class SafeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly upstream?: string; // "anthropic" | "vision" | "supabase"

  constructor(args: { code: string; status: number; upstream?: string; message: string }) {
    super(args.message); // message must NOT contain user content
    this.code = args.code;
    this.status = args.status;
    this.upstream = args.upstream;
  }
}
```

Upstream errors are caught and re-thrown as `SafeError` with a structured code (`UPSTREAM_RATE_LIMIT`, `UPSTREAM_5XX`, `INVALID_INPUT`, etc.). The original error's body is not copied into the message.

Sentry configuration (`sentry.config.ts`):

```ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  beforeSend(event) {
    // Strip any request body fields
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
    }
    // Strip our own extra context fields except a known allowlist
    const allow = new Set(["request_id", "user_id", "route", "error_code"]);
    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        if (!allow.has(key)) delete event.extra[key];
      }
    }
    return event;
  },
});
```

---

## Rate limiting and abuse prevention

Upstash Redis-backed sliding-window rate limiter applied before any body is consumed:

- **Per user:** 30 OCR + translate requests per hour on free tier; 200/hour on paid.
- **Per IP:** 10 requests per minute (catches abusers spinning up accounts).
- **Per fingerprint** (browser fingerprint via FingerprintJS Pro or similar — TBD): blocks repeated signups from a single device when an IP-block is triggered.
- **Body size limit:** OCR endpoint caps at 10 MB; translate endpoint caps at 50 KB of OCR text. Both enforced before streaming begins via `Content-Length` header.
- **Cost circuit-breaker:** Daily ceiling on total tokens consumed across all users; alerts at 50% and 80%, hard stop at 100% (we'd rather degrade than get a $50K bill from a single bad actor).

---

## Code organization

```
apps/bureaucracy-translator/
├── app/
│   └── api/
│       ├── ocr/route.ts                 ← thin handler, calls lib/proxy/*
│       ├── translate/route.ts           ← thin handler, calls lib/proxy/*
│       └── sync/
│           ├── upload/route.ts
│           ├── list/route.ts
│           └── [id]/route.ts
├── lib/
│   ├── proxy/
│   │   ├── logger.ts                    ← typed logger, allow-list only
│   │   ├── safe-error.ts                ← error class without bodies
│   │   ├── auth.ts                      ← JWT verification
│   │   ├── ratelimit.ts                 ← Upstash sliding window
│   │   ├── stream.ts                    ← ReadableStream helpers
│   │   ├── ocr-client.ts                ← Google Vision streaming client
│   │   ├── anthropic-client.ts          ← Anthropic streaming client
│   │   └── translate-pipeline.ts        ← THE ONLY file allowed to parse a body
│   └── crypto/
│       └── (no server-side crypto; encryption happens in the browser)
└── eslint-rules/
    ├── no-body-logging.js               ← custom rule
    ├── no-console-in-proxy.js           ← custom rule
    └── no-text-on-request.js            ← custom rule
```

The proxy directories (`lib/proxy/**` and `app/api/{ocr,translate,sync}/**`) are designated **content-sensitive** in the ESLint config. Stricter rules apply there.

---

## Enforcement

### ESLint rules (custom)

1. **`no-body-logging`** — flags any call to `proxyLogger.*`, `console.*`, `logger.*`, `pino.*`, or known logging libraries that includes a property name matching `/body|ocrText|translation|content|text|image|document|letter/i`.
2. **`no-console-in-proxy`** — bans `console.*` entirely in proxy directories.
3. **`no-text-on-request`** — bans `request.text()`, `request.json()`, `request.arrayBuffer()`, `request.formData()`, and `request.blob()` in proxy directories, with one explicit exception: `translate-pipeline.ts` (see Six Disciplines #2).

### Pre-commit hook

Scans for forbidden patterns in changed files:
- `fs.write*`, `fs.append*`, `createWriteStream`, `writeFile*` in proxy paths
- `axios`, `got`, `node-fetch` with interceptors enabled
- New imports of observability tools without an allowlist entry

### CI canary test

The single most important test we run. On every PR:

1. Spin up the app with a special `LOG_SINK=memory` env var.
2. Submit a request to `/api/translate` with `ocr_text` containing the unique string `__TRACER_<uuid>__`.
3. Mock the upstream Anthropic call to return a successful fixed response.
4. After the request completes, scan **all** captured outputs — stdout, stderr, Sentry mock buffer, log files, the Edge runtime trace — for `__TRACER_`.
5. **Fail the build if the tracer is found anywhere.**

This catches accidental logging regressions even if they bypass the ESLint rule (e.g., via a transitive library call). Runs in under 5 seconds.

A second canary test does the same for `/api/ocr` with a tracer-tagged image (a PNG containing the tracer as text).

### External security review

Before launch, and before any change to the proxy path that touches body-handling, an external reviewer (1-week engagement, $2-5K) audits:

- All seven files in `lib/proxy/`
- All three route handlers
- The ESLint rule implementations
- The CI canary test setup
- The Sentry configuration
- Sample Vercel deployment logs (to verify nothing is in them)

The reviewer's mandate: try to find any path by which a body could be logged, stored, or sent to a third-party observability tool.

---

## Testing strategy

| Test layer | What it checks |
|---|---|
| Unit | Each `lib/proxy/*` function in isolation; mock upstream clients; assert no logger calls with content fields |
| Integration | Full route handler with mocked upstream; assert correct headers, status codes, structured logs |
| Canary | The TRACER test described above; runs on every PR |
| Load | Per-user rate limit enforcement; concurrent request handling |
| Failure-injection | Upstream returns 5xx, times out, returns malformed JSON; assert SafeError thrown, no body in error context |
| Type | TypeScript compile must catch banned logger payloads (verified by a `// @ts-expect-error` test file) |

---

## Monitoring — what we can see without bodies

Dashboards we *can* build with the metadata logged:

- Request volume per route per user per hour (billing, abuse detection)
- p50/p95/p99 latency per route
- Token consumption per user per day (cost monitoring)
- Classification distribution (which document types are most common)
- Quality-check pass rate
- Upstream error rate per provider
- OCR confidence distribution (low-confidence triggers a "verify your translation" hint to the user without us seeing the content)

Dashboards we *cannot* build:

- "Show me the documents that produced errors" — by design.
- "Which letters did user X translate this week?" — by design.
- "What words appear most often in translations?" — by design.

These trade-offs are accepted. Bug reports require the user to reproduce and share a redacted copy.

---

## Failure modes

| Failure | Behavior |
|---|---|
| Anthropic timeout / 5xx | Retry once with exponential backoff; if still failing, return `SafeError({ code: "UPSTREAM_5XX", status: 502 })`. User sees a friendly "translation service is having issues — try again in a moment" message. |
| Anthropic rate-limited | Return `SafeError({ code: "UPSTREAM_RATE_LIMIT", status: 503, retry_after_s: N })`. |
| Google Vision OCR failure | Same pattern; user can retry. |
| User rate limit hit | Return 429 with `Retry-After` header. |
| Body too large | Return 413 *before streaming begins* — based on `Content-Length` header. |
| Auth failure | Return 401. |
| Invalid JSON from upstream | Throw `SafeError({ code: "UPSTREAM_INVALID_RESPONSE" })`; log includes the error code, not the response body. |
| Daily token budget exceeded | All proxy routes return 503 with a friendly "service paused for the day" message; on-call paged immediately. |

---

## Security review checklist

Before launching v1, an external reviewer must verify each of these:

- [ ] No code path in `app/api/{ocr,translate,sync}/**` writes to disk.
- [ ] No code path passes a request or response body to `console.*`, `logger.*`, `Sentry.captureMessage`, or `Sentry.captureException`.
- [ ] The custom ESLint rules fire on test fixtures that violate each rule.
- [ ] The CI canary test passes; introducing a deliberate logging regression in a test branch causes it to fail.
- [ ] Sentry `beforeSend` strips `request.data` and any non-allowlisted `extra` fields.
- [ ] Vercel deployment logs contain no body content under a sample of 100 requests with tracer-tagged input.
- [ ] Rate limits are enforced before body bytes are read.
- [ ] Body size limits are enforced via `Content-Length` before streaming.
- [ ] Anthropic API is configured with the no-training setting.
- [ ] Google Cloud Vision is configured under enterprise terms.
- [ ] Supabase service-role key is not exposed to the browser.
- [ ] Encrypted history table contains only ciphertext, salt, and IV — no plaintext fields.
- [ ] DPA is signed with every named subprocessor.

---

## Environment variables

```bash
# AI providers (server-only)
ANTHROPIC_API_KEY=
GOOGLE_CLOUD_VISION_KEY=  # service account JSON or token
OCR_FALLBACK_CONFIDENCE_THRESHOLD=0.75  # below this, fall back to Claude Vision

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  # server-only

# Rate limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Observability
SENTRY_DSN=

# Operational ceilings
RATE_LIMIT_FREE_PER_HOUR=30
RATE_LIMIT_PAID_PER_HOUR=200
DAILY_TOKEN_BUDGET=50000000  # tune from cost data
MAX_OCR_BODY_BYTES=10485760  # 10 MB
MAX_TRANSLATE_BODY_BYTES=51200  # 50 KB
```

The browser-side `.env.local` contains only `NEXT_PUBLIC_*` keys. No API key for an upstream provider is ever shipped to the browser.

---

## Deployment notes

- Use Vercel Edge runtime for `/api/ocr` and `/api/translate`. Edge runtime has stricter logging defaults (no automatic body capture) which is helpful here.
- Configure Vercel project to **disable runtime body logging** in the dashboard (Settings → Functions → "Log request bodies" off).
- Set `next.config.js` to disable Next.js's default request logging in production.
- Confirm Supabase project's "Database logs" do not include the contents of `encrypted_history.ciphertext` (they shouldn't — bytea fields are not logged by default — but verify).

---

## Open questions for [Avraham]

1. **Analytics provider.** I've left this as TBD in the subprocessors page. Recommendation: Plausible or Fathom, EU-hosted, fully cookieless. Want me to pick one?
2. **Browser fingerprinting for abuse prevention.** FingerprintJS is the obvious choice but it's privacy-sensitive (and would have to be disclosed in the policy). The alternative is being more aggressive on IP+email signup rate-limiting and accepting some abuse. Lean call?
3. **Daily token budget number.** I put a placeholder. Real number depends on user volume forecasts; we should set this based on the first week of paid traffic.
4. **Edge vs Node runtime.** Recommendation is Edge; the only reason to fall back to Node is if the Anthropic SDK we want to use doesn't support Edge cleanly. We'll verify in week 1.
5. **External security review timing.** I assume this happens at the end of week 3, just before launch. Alternative: do a lighter internal review at the end of week 2 and the external one at end of week 3. The latter costs more time but catches issues earlier.

---

## What this spec does *not* cover

- The non-proxy parts of the app (auth pages, account settings, billing UI, marketing site)
- The actual prompt content for classification / specialist translation / quality check (in `bureaucracy_translator_prompts.js` per CLAUDE.md)
- The visual design / UX of the results screen
- The Hebrew/English copy beyond the privacy policy
- The Stripe integration details
- The waitlist / soft-launch mechanics

Those are covered separately.
