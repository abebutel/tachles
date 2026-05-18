# Tachles — Project Handoff Document

*Last updated: end of Day 4 of the private beta build.*

This document captures everything an agent (Claude Code, future me, or a human developer) needs to know to pick up where the project currently stands. Read this in full before touching anything.

---

## 1. Quick orientation

**Project:** Tachles — a tool that translates Hebrew letters from Israeli institutions (Bituach Leumi, banks, municipalities, lawyers) into plain Hebrew and English.

**Current phase:** Private beta build. 10-day plan; days 1-2 are complete and deployed. Days 3-10 remain.

**Project owner:** Avraham (abebutel@gmail.com). Israeli, building this solo. English-speaking, Hebrew-fluent.

**Project lives at:** `C:\aiProjectIdeas\Claude\tachles` on Avraham's machine. GitHub: `https://github.com/abebutel/tachles`. Vercel project linked.

**Domain:** `tachles.help` (purchased, added to Vercel project, DNS configured).

**Current deploy status:** Working end-to-end locally on `http://localhost:3000`. Vercel deploy active with env vars configured. Local sign-in flow (Google + email magic link) works; invite-only enforcement works; beta consent flow works; protected dashboard works.

---

## 2. Reading list — read these first, in this order

Each of these is in the same outputs folder as this handoff:

1. **`privacy-en.md`** and **`privacy-he.md`** — the privacy policy, beta version. The promises in here are the contract with users. Every architectural decision must uphold these.
2. **`subprocessors-en.md`** and **`subprocessors-he.md`** — the list of named third-party providers, with status (active in beta vs deferred to public launch).
3. **`no-log-proxy-spec.md`** — the engineering spec for the document-processing pipeline. This is the architectural backbone of the product. Days 3-7 build out what's specced here. Read it carefully.
4. **`build-plan-beta.md`** — the active 10-day plan. Days 1-2 are done. Days 3-10 are the next sessions.
5. **`build-plan-v1.md`** — the public-launch plan (deferred). Reference for "what gets re-added when the beta graduates."
6. **`CLAUDE.md`** *(in Avraham's uploads, not this folder)* — the original product strategy document that bootstrapped the project. Useful for the "why" behind some decisions and for context on the wider product family (Tachles is one of four planned products).

After reading those, read the codebase: start at `app/[locale]/page.tsx`, then `middleware.ts`, then `app/auth/callback/route.ts`, then the auth flow pages.

---

## 3. The product in one paragraph

A user uploads a photo of a Hebrew letter (from Bituach Leumi, a bank, a municipality, or a lawyer). The app OCRs the image, classifies the document type, sends the text through an LLM with a specialist prompt that produces a plain-language Hebrew + English summary including deadlines and required actions. Results are shown in a clear card with deadlines highlighted. History is stored locally in the user's browser via IndexedDB — never on the server. The product is invite-only during beta and will be ₪29/month at public launch.

---

## 4. Avraham's values and reservations (the most important context)

These shaped every architectural decision. The next agent must understand and respect them.

**4a. PII handling is the central concern.** Avraham was anxious about handling Israelis' PII — Teudat Zehut, bank details, addresses on government letters. He didn't want a product where a breach would be career-ending. This drove the move away from the original MVP (which would have stored documents in Supabase Storage for 90 days) toward a **no-log streaming proxy** architecture where documents pass through the server in memory only and are never persisted, logged, or sent to error trackers. The architecture is real, not marketing — engineering discipline enforces it via ESLint rules, a CI canary test, and an external audit (deferred for beta).

**4b. Honest marketing, even at the cost of better-sounding copy.** I (the previous assistant) suggested an "Architecture 1" where the browser called the LLM directly, bypassing our servers. Technically clean, but it would create an *impression* with users that "their data never leaves their device" — which would be misleading because the data still goes to Anthropic/Google. Avraham rejected this approach explicitly, saying "I want to always be upfront & honest — even if in the end it'll mean putting this aside and trying to think of something else." Take this seriously. Every privacy claim in marketing and the policy must be *literally* true to an average user, not just technically true. The current privacy copy went through several rewrites to achieve this.

**4c. Budget-conscious.** Avraham did not budget for the external security audit (~$5-7K). This is what pivoted us from a public-launch plan to a private-beta scope. The private beta defers four expensive things: external audit, cyber liability insurance, attorney TOS review, and Israeli company registration. Total beta operating cost: ~$5-30/month, ~$30 in startup costs (domain). Don't suggest expensive solutions without flagging cost.

**4d. Honesty + caution about cost extends to ongoing decisions.** Avraham asked about monthly cost as well as setup cost. A useful lens for every decision: "what's the one-time cost? what's the ongoing cost?"

**4e. Subprocessors named separately, not in the main policy.** Per Avraham's request, the privacy policy describes third parties by category ("AI language model provider", "payment processor") and the named companies live on a separate subprocessors page. Legal under GDPR + Israeli law. Lets the stack change without rewriting the policy.

---

## 5. Key decisions made

| Decision | Choice | Why |
|---|---|---|
| Product name | **Tachles** (תכלס) | Avraham's pick from a shortlist. Israeli slang meaning "bottom line / cut to the chase" — exactly the value prop. |
| Domain | `tachles.help` | Purchased, in Vercel. |
| Geographic scope | Israel (Hebrew + English) | Per CLAUDE.md and Avraham's audience. |
| LLM (translation) | Anthropic Claude (`claude-sonnet-4-20250514` per CLAUDE.md, but use whatever's current) | Strong Hebrew, strong privacy posture. |
| OCR | Google Cloud Vision **primary**, Claude Vision **fallback** | Avraham's call. Google has better Hebrew OCR; Claude is fallback below 0.75 confidence threshold (tunable via env var). |
| LLM safety | Configured for zero training on submitted data via API tier. | Confirmed in subprocessors page DPA notes. |
| Architecture | No-log streaming proxy (Architecture B) | Servers never persist user content. See `no-log-proxy-spec.md`. |
| History | **Client-side IndexedDB** (free tier) + **encrypted cross-device sync** with Argon2id (paid tier, deferred to public launch) | Privacy posture is the differentiator. |
| Hosting | Vercel + Supabase (EU/Frankfurt) | Privacy-aligned region. |
| Auth providers | Google OAuth + email magic link | Apple deferred until public launch (avoids $99/yr Apple Developer cost). |
| Analytics | Plausible (cookieless, EU-hosted) — **deferred to public launch** | Beta is too small to need analytics; talk directly to the 20 users. |
| Payment | Stripe (deferred to public launch — no billing in beta) | Beta is free. |

Decisions explicitly rejected:

- Architecture 1 (browser-direct LLM calls) — would create misleading "we don't touch your data" impression.
- Architecture 2 (generic explainer pivot) — Avraham didn't think users would pay for this.
- 90-day server-side storage (the original CLAUDE.md plan) — increases breach blast radius unnecessarily.

---

## 6. What's built (Days 1-2 complete)

### Day 1 — Foundation

- Next.js 16 + TypeScript + Tailwind + App Router scaffold at `C:\aiProjectIdeas\Claude\tachles`
- `next-intl@4.12` configured for Hebrew/English with `localePrefix: "always"` and `defaultLocale: "he"`
- RTL handling in layout based on locale
- `messages/en.json` and `messages/he.json` translation files
- `i18n/{routing,navigation,request}.ts` — locale config
- `middleware.ts` combining i18n + Supabase session refresh (updated on day 2)
- Home page at `app/[locale]/page.tsx` with "Tachles" branding + sign-in CTA + language toggle
- GitHub repo `abebutel/tachles` on `main`, all commits pushed
- Vercel project linked to GitHub, auto-deploys on push, env vars configured
- `.env.example` template, `.env.local` with real keys (gitignored)

### Day 2 — Auth, profiles, beta consent

- Supabase project provisioned in EU (Frankfurt)
- SQL migration `supabase/migrations/0001_init.sql` applied:
  - `profiles` table (extends `auth.users` with `beta_consent_version`, `beta_consent_accepted_at`, `preferred_language`)
  - `beta_invites` table (allowlist)
  - `handle_new_user()` trigger: creates profile only if email is on invite list; updates `used_at` on the invite
  - `set_updated_at()` trigger on profiles
  - Row Level Security policies (users can read/update own profile; `beta_invites` has no policies = service-role only)
- Supabase clients:
  - `lib/supabase/client.ts` — browser
  - `lib/supabase/server.ts` — server (async, uses Next.js cookies)
  - `lib/supabase/admin.ts` — service-role (bypasses RLS, server-only)
- Auth flow:
  - `app/[locale]/sign-in/page.tsx` — Google button + email magic link form
  - `app/[locale]/sign-in/actions.ts` — server action that checks invite list before sending magic link
  - `app/auth/callback/route.ts` — OAuth + magic link callback handler; checks profile, redirects to onboarding / dashboard / not-invited
  - `app/[locale]/onboarding/page.tsx` + `form.tsx` + `actions.ts` — beta consent screen, captures version + timestamp
  - `app/[locale]/not-invited/page.tsx` — friendly invite-only message
  - `app/[locale]/dashboard/page.tsx` — protected placeholder
  - `components/sign-out-button.tsx`
- TypeScript types at `types/database.ts`
- Vercel env vars set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `BETA_CONSENT_VERSION`
- Google OAuth client configured in Google Cloud Console; client ID + secret in Supabase
- Supabase Redirect URLs allowlist includes localhost, Vercel preview, and `tachles.help`
- All four test cases pass: invited Google flow, invited magic link flow, non-invited magic link (rejected), non-invited Google (lands on not-invited page)

### Day 3 — Proxy infrastructure

- `lib/proxy/proxy-logger.ts` — typed `proxyLogger` with allow-listed `LoggableField` union; adding a field requires a `// log-field-added: <reason>` comment per spec
- `lib/proxy/safe-error.ts` — `SafeError` class + `SafeErrorCodes` constants
- `lib/proxy/sentry-before-send.ts` — Sentry scrubber that strips request data, cookies, headers, breadcrumbs, and all `extra`/`contexts` outside a tiny allow-list
- Three custom ESLint rules in `eslint-rules/` exposed as the local `tachles` plugin:
  - `no-body-logging` — flags body-like fields passed to known loggers; unwraps TS type assertions so `as never` casts don't bypass it
  - `no-console-in-proxy` — bans `console.*` in proxy directories
  - `no-text-on-request` — bans `request.text/json/arrayBuffer/formData/blob`; `lib/proxy/translate-pipeline.ts` is whitelisted per Six Disciplines #2
- Rules scoped to `lib/proxy/**`, `app/api/{ocr,translate,sync}/**` in `eslint.config.mjs`
- Sentry installed (`@sentry/nextjs`); `sentry.{server,edge,client}.config.ts` + `instrumentation.ts`; `beforeSend` hook wired (no-ops if `SENTRY_DSN` is unset, which is the beta default)
- husky + lint-staged installed; `.husky/pre-commit` runs `lint-staged` which runs `eslint --fix` and `scripts/check-proxy-disk-writes.mjs` on staged files
- `scripts/check-proxy-disk-writes.mjs` — pre-commit scanner for `fs.write*` / `createWriteStream` / `os.tmpdir` / `/tmp/` / `axios|got|node-fetch` imports in proxy paths; override via `// proxy-disk-write-approved: <reason>`
- CI canary test scaffold at `tests/canary/tracer.test.ts` (vitest) — captures stdout/stderr, runs a proxy stub with a `__TRACER_<uuid>__` string, asserts the tracer never appears in any captured output. Three tests pass; harness self-test included. Gets teeth on Day 4 when `/api/ocr` exists
- `.github/workflows/ci.yml` — runs `pnpm lint`, `pnpm test:canary`, and the pre-commit scanner across all tracked proxy files on every push and PR
- `.npmrc` — `verify-deps-before-run=false` to keep `pnpm <script>` from auto-reinstalling on every invocation; `ignored-built-dependencies[]=@sentry/cli` to silence the pnpm v11 build-script prompt
- `package.json` `pnpm.onlyBuiltDependencies` allowlist for `@parcel/watcher`, `@swc/core`, `sharp`, `unrs-resolver`
- All checks green: `pnpm lint` (0 errors), `pnpm test:canary` (3 passing), `pnpm exec tsc --noEmit` (clean)

### Day 4 — `/api/ocr`

- `lib/proxy/auth.ts` — `verifyRequestAuth(request)` validates the `Authorization: Bearer <jwt>` header via `supabase.auth.getUser(token)`. The spec's "local JWT verification" alternative is documented inline; rejected for beta because the ~100ms upstream cost is negligible next to OCR latency and avoids wiring `SUPABASE_JWT_SECRET`
- `lib/proxy/ratelimit.ts` — Upstash sliding-window limiter: 30 req/h per user (free tier), 200 req/h per user (paid, deferred), 10 req/min per IP. Lazy singleton; throws `SafeError` if env not configured. `enforceRateLimit()` convenience helper for routes
- `lib/proxy/stream.ts` — `readBodyBounded(request, maxBytes)` reads `request.body` chunk-by-chunk and enforces the size limit DURING the read (not just via `Content-Length`); `bytesToBase64()` chunked encoder avoids stack overflow on large buffers
- `lib/proxy/ocr-client.ts` — Two-provider OCR:
  - **Primary:** Google Cloud Vision `DOCUMENT_TEXT_DETECTION` via REST API (Edge-compatible, no Node SDK). Uses `GOOGLE_CLOUD_VISION_KEY` as a plain API key with API restriction set to Vision only — simpler than service-account JWT signing on Edge. Confidence = mean of page confidences
  - **Fallback:** Anthropic `claude-haiku-4-5` vision via the official SDK. Triggered when Google confidence < `OCR_FALLBACK_CONFIDENCE_THRESHOLD` (default 0.75) or Google throws. Confidence reported as 1.0 since Claude doesn't return a calibrated score
  - `runOcr()` orchestrates; rejects unsupported media types (415); surfaces upstream errors as `SafeError` with stable codes
- `app/api/ocr/route.ts` — Edge runtime POST handler. Order of operations: auth → rate-limit → `Content-Length` check (10 MB cap via `MAX_OCR_BODY_BYTES`) → bounded body read → OCR → JSON response. Logs ONLY: `ts, user_id, request_id, route, image_size_bytes, response_status, ocr_provider_used, ocr_confidence, latency_ms` — no bytes, no extracted text. Errors logged with `error_code` + `upstream` only
- ESLint rule refined: `no-text-on-request` now fires only when the receiver is named `request` or `req` (the conventional Next.js parameter). Previous version was too aggressive — fired on `res.json()` against Google Vision's metadata wrapper, which is legitimate upstream-response parsing. Doc comment in the rule explains the heuristic limit
- Tests at `tests/canary/ocr.test.ts` (vitest, mocked auth/ratelimit/runOcr) — sends a `__TRACER_<uuid>__` in the request body AND in the mocked OCR result; asserts the tracer surfaces in the response (correctness) but never in stdout/stderr/proxyLogger payloads (privacy). Also covers the rate-limited error path
- Tests at `tests/unit/stream.test.ts` — bounded reader: happy path, declared Content-Length over limit (early reject), mid-read size overflow (chunked rejection), invalid Content-Length, large-buffer base64 round-trip
- Tests at `tests/unit/ocr-client.test.ts` — Google Vision happy path (Hebrew text), 500 error → UPSTREAM_5XX, 429 → UPSTREAM_RATE_LIMIT, missing API key → OCR_NOT_CONFIGURED, fallback to Claude when confidence below threshold, Google used when confidence above, unsupported media type rejected before any upstream call
- `vitest.config.ts` — aliases `@/` to project root so tests can use the same import paths as the app
- CI workflow extended: `pnpm exec tsc --noEmit` + `pnpm test:unit` added alongside the existing `pnpm lint` + `pnpm test:canary`
- 18/18 tests passing, lint clean, TS clean
- **Deferred to a follow-up commit:** the 20-synthetic-Hebrew-letter accuracy run + threshold tuning. Requires real GCP / Anthropic / Upstash keys; default threshold 0.75 from the spec is sensible until we have real data

---

## 7. What's left — Days 5-10

The current build plan is `build-plan-beta.md`. Day-by-day summary:

**Day 5 — `/api/translate` (classification + specialists).** Pipeline scaffolding in `lib/proxy/translate-pipeline.ts`. `buildPrompt_ClassifyDocument` wired up. All 4 specialist prompts wired (Bituach Leumi, bank, municipality, lawyer). Routing logic. **DoD:** posting OCR text returns classification + specialist translation; tracer passes; each specialist runs end-to-end on at least one test case.

**Day 6 — Quality check + pipeline tuning.** `buildPrompt_QualityCheck` wired. Pipeline assembled (3 calls). Quality-check failure surfaced to user with "we're not confident in this translation" warning. Synthetic test corpus: 5 letters per specialist (20 total). Manually approve tone for each. **DoD:** end-to-end <10s; quality check correctly flags 3 deliberately-mangled cases.

**Day 7 — Upload UI.** Photo upload (file picker + camera capture on mobile). Image preview. Upload progress. Hebrew-primary UI. Mobile-first. **DoD:** on a phone, take a photo of a letter and see it queued for translation. Test iOS Safari and Android Chrome.

**Day 8 — Results UI.** Translation result card (TL;DR, key facts, action checklist). Deadline banner with countdown. Action checklist. Hebrew/English toggle on results. Confidence indicator. "Show original OCR text" expandable.

**Day 9 — Client-side history (IndexedDB).** Schema. Auto-save on success. List page (chronological, filterable by classification). Open past translation read-only. Delete single + delete all. Export as JSON.

**Day 10 — Beta launch.** Beta-only landing page (no signup form, just "invite-only — contact us"). Privacy + subprocessors pages deployed at `/privacy` and `/subprocessors` in both languages. Invite issuance flow (insert email into `beta_invites`, system sends welcome email via Resend). Run self-review checklist from `no-log-proxy-spec.md`. Smoke test all flows in production. Send first 5 invites.

---

## 8. The prompts (referenced from CLAUDE.md, not yet implemented)

These prompts were designed in the strategy phase but **the prompt files do not yet exist in the codebase.** They need to be built during days 5-6. From CLAUDE.md:

- `buildPrompt_ClassifyDocument(ocrText)` — institution + purpose + urgency
- `buildPrompt_TranslateDocument(ocrText, classification)` — generic full translation (fallback if no specialist matches)
- `buildPrompt_BituachLeumi(ocrText)` — specialist: ביטוח לאומי letters
- `buildPrompt_BankLetter(ocrText)` — specialist: bank letters
- `buildPrompt_MunicipalityLetter(ocrText)` — specialist: municipality letters
- `buildPrompt_LawyerLetter(ocrText)` — specialist: legal notices
- `buildPrompt_QualityCheck(ocrText, translationResult)` — validate before showing user
- `routeToSpecialistPrompt(ocrText, classification)` — routing logic

All prompts return JSON. The system prompt must end with: `"OUTPUT: Respond ONLY with valid JSON. No preamble, no markdown fences."` Parse with try/catch + retry on parse failure.

Cost target per document: ~$0.006-0.011 (3 calls × Claude Sonnet rates).

---

## 9. Open items / decisions to make

- **Daily token budget** (`DAILY_TOKEN_BUDGET` env var). Currently a placeholder. Tune from first week of real traffic.
- **External security reviewer** for graduation to public launch. Recommended: Cobalt.io at ~$5-7K, 1-2 week engagement. Book this when budget allows.
- **Israeli company registration** — required for Stripe IL at public launch. 2-3 week process, ~$1,500-2,500. Start this 3-4 weeks before public launch target date.
- **Welcome email template.** Resend is wired up but the actual email content (HTML + text) hasn't been drafted. Day 10 work.
- **What happens after a translation?** UX question: do we let users save/share/export individual translations? IndexedDB stores them locally, but the Day 8 Results UI design hasn't been fully nailed down. Look at CLAUDE.md's description of "deadline banner, summary card, action checklist" for the seed of an answer.

---

## 10. Codebase map

```
C:\aiProjectIdeas\Claude\tachles\
├── app/
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts                 ← OAuth + magic link callback handler
│   ├── [locale]/
│   │   ├── layout.tsx                   ← per-locale layout with RTL handling
│   │   ├── page.tsx                     ← public landing page (Tachles + sign-in)
│   │   ├── sign-in/
│   │   │   ├── page.tsx                 ← Google button + email form
│   │   │   └── actions.ts               ← invite-check + magic link send
│   │   ├── onboarding/
│   │   │   ├── page.tsx                 ← beta consent screen
│   │   │   ├── form.tsx                 ← consent checkbox + submit
│   │   │   └── actions.ts               ← saves consent to profile
│   │   ├── not-invited/
│   │   │   └── page.tsx                 ← friendly invite-only message
│   │   └── dashboard/
│   │       └── page.tsx                 ← protected placeholder (real UI in days 7-9)
│   ├── globals.css
│   └── favicon.ico
├── components/
│   └── sign-out-button.tsx
├── i18n/
│   ├── routing.ts
│   ├── navigation.ts
│   └── request.ts
├── lib/
│   └── supabase/
│       ├── client.ts                    ← browser client
│       ├── server.ts                    ← server client (async, cookies)
│       └── admin.ts                     ← service-role (server-only)
├── messages/
│   ├── en.json
│   └── he.json
├── supabase/
│   └── migrations/
│       └── 0001_init.sql                ← run via Supabase SQL editor (already applied)
├── types/
│   └── database.ts                      ← Supabase table types
├── middleware.ts                        ← i18n + Supabase session refresh
├── next.config.ts                       ← Next.js + next-intl plugin
├── .env.local                           ← real keys (gitignored)
├── .env.example                         ← template
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json

# Directories that will be added in days 3-10:
# lib/proxy/                             ← logger, safe-error, OCR client, etc.
# lib/prompts/                           ← buildPrompt_* functions
# eslint-rules/                          ← custom no-body-logging rules
# app/api/ocr/                           ← OCR proxy route (day 4)
# app/api/translate/                     ← translation pipeline (days 5-6)
```

---

## 11. Important non-obvious things

**The no-log discipline is the entire point.** The product's privacy promise is "we don't store your letter, we don't log it, we don't keep a copy." Every line of code in `lib/proxy/` and `app/api/{ocr,translate}/` exists to make that promise *technically* true. The custom ESLint rules and the CI canary test enforce it. Read `no-log-proxy-spec.md` Section "The Six Disciplines" before touching any proxy code.

**`/api/translate` is the only route allowed to parse a request body.** Per the spec, the OCR route streams its body through to Google Vision without ever calling `request.text()` or `request.json()`. The translate route is an explicit exception because it has to orchestrate 3 sequential LLM calls and needs to read the OCR text. This is documented in the spec.

**The CI canary test is the single most important test.** On every PR it submits a request with a unique `__TRACER_<uuid>__` string, mocks the upstream, then scans all logs/Sentry/stdout for that string. Fails the build if found anywhere. This catches accidental logging regressions that bypass ESLint.

**The `handle_new_user` trigger is the security boundary for invite-only.** When Google OAuth or magic link successfully authenticates, the user *exists* in `auth.users` but only gets a `profiles` row if their email matches `beta_invites`. The app uses "profile exists" as the proxy for "is invited". A user without a profile gets bounced to `/not-invited`. Don't move this logic to application code without thinking very carefully about race conditions.

**Beta consent capture is the legal foundation.** `BETA_CONSENT_VERSION` (env var, currently `"1.0"`) is recorded on the profile alongside the timestamp when the user accepts. If the consent text ever changes (e.g., new beta terms), bump the version, and have a server action that prompts users to re-consent the next time they sign in (compare profile's version to env var). This isn't implemented yet but is a hook for later.

**The privacy policy is the contract.** The promises in `privacy-en.md` / `privacy-he.md` are what we sell. Every architectural decision must uphold them. If a new feature would require breaking a promise, the policy needs to change first (with 14-day user notice), not the architecture quietly drifting.

**Hebrew RTL is not just CSS.** Right-to-left affects layout, icon directions, list bullet positions, and text alignment. Test in Hebrew, not just English. The locale-aware layout in `app/[locale]/layout.tsx` sets `dir="rtl"` for Hebrew; check this is respected in every new UI component.

---

## 12. Working with Avraham

- **Style:** prefers thoughtful explanations and trade-offs over confident assertions. Asks substantive follow-up questions. Will push back if something doesn't sit right with him — listen carefully, his pushback has been consistently well-reasoned.
- **Trust signals he values:** honest about limitations (e.g., "this isn't audited yet"), explicit about costs, transparent about what's deferred vs done.
- **What he doesn't want:** marketing-speak that's technically true but creates misleading impressions; cost surprises; corner-cutting on PII.
- **What he does want:** momentum. He explicitly said "I'd like to see how much can Claude Code actually do with full permissions." Don't bottleneck on his approval for every small decision — make reasonable calls, document them, and flag the big ones for his input.
- **Communication:** prefers Hebrew slang and Israeli directness over US-style hedging. "Tachles, what's left?" is a normal question.

---

## 13. Next session priorities (Day 5)

When the next session starts:

1. Read this handoff document.
2. Re-read `no-log-proxy-spec.md` §`/api/translate` end-to-end. This route is the spec's most subtle — it's the ONE place allowed to call `request.json()`.
3. Confirm Day 4 keys are wired (`GOOGLE_CLOUD_VISION_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ANTHROPIC_API_KEY`) locally and on Vercel.
4. **Threshold tuning carry-over from Day 4:** before starting Day 5 work, gather 20 synthetic Hebrew letters (or real anonymized examples) and run them through `/api/ocr` against both providers. Record confidences. Tune `OCR_FALLBACK_CONFIDENCE_THRESHOLD` to maximize Google primary usage without sacrificing accuracy. Commit the tuned value.
5. Build day 5 per `build-plan-beta.md`:
   - `lib/proxy/anthropic-client.ts` — wrapper around the Anthropic SDK for the three translate calls
   - `lib/prompts/` — `buildPrompt_ClassifyDocument`, `buildPrompt_BituachLeumi`, `buildPrompt_BankLetter`, `buildPrompt_MunicipalityLetter`, `buildPrompt_LawyerLetter`, `buildPrompt_TranslateDocument` (generic fallback)
   - `lib/proxy/translate-pipeline.ts` — orchestrates: classify → route to specialist → translate. THIS is the only file allowed `request.json()` per Six Disciplines #2 and the ESLint exemption
   - `app/api/translate/route.ts` — Edge runtime thin handler that calls `runTranslationPipeline`
   - Canary extension: `tests/canary/translate.test.ts` — tracer in `ocr_text` body, mocked Anthropic upstream, assert no leak
   - Unit tests for each specialist prompt's JSON parsing
6. Commit at end of day. Open PR; merge after CI green.
7. Update this handoff document if any decisions changed during day 5.

Useful commands wired so far:
- `pnpm lint` — ESLint with the three proxy rules
- `pnpm test:canary` — tracer harness against the proxy stubs and /api/ocr
- `pnpm test:unit` — unit tests for proxy modules
- `pnpm test` — all of the above
- `pnpm exec tsc --noEmit` — TypeScript check
- `node scripts/check-proxy-disk-writes.mjs <files>` — manual pre-commit scan

If something feels wrong while building, stop and ask Avraham rather than guess. The privacy architecture is too important to "I think this is what they meant" through.

---

## 14. How to talk to the next user message

The next message after this handoff will probably be Avraham continuing the project in Claude Code. Don't re-explain everything from this document at the start — assume he's read it (or pointed Claude Code at it). Jump straight into the work, asking clarifying questions where genuinely needed.
