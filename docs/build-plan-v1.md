# Build Plan — Bureaucracy Translator v1

Three weeks. Fifteen working days. The goal is a tested, deployable v1 that delivers on every promise in the privacy policy, that real users can sign up for and pay for, and that we can soft-launch to a waitlist on day 15.

This plan assumes one developer working full-time. If you're working part-time or with a co-builder, scale accordingly.

---

## Definition of done for v1

A v1 ship is approved only when all of the following are true:

- A user signs up, uploads a photo of a Hebrew letter, and receives a plain-language translation in under 10 seconds, end-to-end.
- The four document specialists (Bituach Leumi, bank, municipality, lawyer) each produce accurate plain-language translations on 80%+ of a 25-document synthetic test corpus (5+ docs per specialist, plus a 5-doc mixed bag).
- The CI canary test passes on every commit — no tracer string in any log, error tracker, or deployment record.
- An external security reviewer has audited the proxy path and signed off, with all critical findings fixed.
- Stripe billing works end-to-end: a free user can upgrade to ₪29/mo, receive a receipt, and downgrade.
- Encrypted cross-device sync works on the paid tier across two test devices, with documented recovery flow and password-loss warning.
- Privacy policy, subprocessors page, and TOS are deployed at `/privacy`, `/subprocessors`, `/terms` in both Hebrew and English.
- Marketing homepage with the honest privacy copy is live.
- A waitlist signup captures emails for soft-launch invites.
- Ten friendly users (you, family, paying acquaintances) have used the product end-to-end without finding launch-blockers.

---

## Week 1 — Foundation, auth, and the proxy core

The privacy promise lives or dies in week 1. We build the proxy with the no-log discipline from day one. Every later feature is built on top of this foundation.

### Day 1 — Monday: Project skeleton + Supabase

- `pnpm create next-app` with TypeScript, Tailwind, App Router
- `next-intl` configured for Hebrew/English, RTL by default for Hebrew locale
- Repo on GitHub, Vercel project connected, automatic preview deploys on every push
- Supabase project provisioned in EU (Frankfurt)
- `.env.local` and `.env.example` set up per the spec
- **DoD:** `pnpm dev` shows a Hebrew "שלום" / English "Hello" toggle page; a push to GitHub creates a Vercel preview deploy.

### Day 2 — Tuesday: Auth + profiles

- Supabase Auth with Google and Apple providers
- `profiles` table per the schema in `CLAUDE.md`
- Sign-in / sign-up / sign-out UI in both languages
- Protected route middleware
- Language preference saved to profile
- **DoD:** a user can sign up with Google, see their email displayed in their preferred language, and sign out.

### Day 3 — Wednesday: Proxy infrastructure (the unglamorous critical day)

- `lib/proxy/` directory created per spec
- `proxyLogger` with typed allowlist
- `SafeError` class
- ESLint rules: `no-body-logging`, `no-console-in-proxy`, `no-text-on-request`
- Pre-commit hook with body-write pattern scans
- Sentry installed with `beforeSend` hook
- CI canary test scaffold (will get its real teeth once a route exists to test)
- **DoD:** a deliberate violation of any of the three ESLint rules fails the build; the canary scaffold runs in CI and passes; Sentry is wired up to a test project.

### Day 4 — Thursday: `/api/ocr`

- OCR route handler, Edge runtime
- Google Cloud Vision integration (primary OCR provider)
- Claude Vision wired up as fallback (triggered on low confidence or Google API failure)
- Upstash Redis rate limiter integrated
- Body size limit enforcement via `Content-Length`
- Unit tests + integration tests for both the primary and fallback paths
- Canary test extended to /api/ocr with a tracer-bearing image
- **Critical:** run 20 real-style synthetic Hebrew letters through both providers and compare accuracy + cost. Tune the confidence threshold that triggers fallback based on the results.
- **DoD:** uploading a Hebrew letter photo returns extracted text in <3s; the tracer test passes on /api/ocr; the fallback path is exercised at least once in testing.

### Day 5 — Friday: `/api/translate` — classification call only

- Translation pipeline scaffolding in `lib/proxy/translate-pipeline.ts`
- `buildPrompt_ClassifyDocument` wired up
- Routing decision returned to client (specialist call comes Monday)
- **DoD:** posting OCR text returns a classification + confidence + chosen specialist route; tracer test passes.

**End-of-week-1 checkpoint:** the foundation is in place. By Friday EOD, a user can sign in, upload a photo, and see "this looks like a Bituach Leumi letter" — but not a translation yet. The proxy promises are technically demonstrable on the routes that exist.

---

## Week 2 — The translation product

### Day 6 — Monday: Specialist translation prompts

- All 4 specialist prompts wired up: ביטוח לאומי, bank, municipality, lawyer
- `routeToSpecialistPrompt` logic
- Synthetic test corpus: 5 letters per specialist, all PII-free (you can generate these or I can)
- Run all 20 letters through the pipeline manually, measure quality
- **DoD:** each specialist produces structured JSON output on its full test set; you have read every output and approved the tone.

### Day 7 — Tuesday: Quality check + end-to-end integration

- `buildPrompt_QualityCheck` wired up
- Full pipeline assembled: classify → specialist → quality check
- Quality-check failure surfaced to user with "we're not confident in this translation" warning
- Cost & latency measured per request — confirm we're in the ~$0.006-0.011 / doc range from the MVP plan
- **DoD:** end-to-end translation in <10s for typical letters; quality check correctly flags 3 deliberately-mangled test cases.

### Day 8 — Wednesday: Upload UI

- Photo upload component (file picker + camera capture on mobile)
- Image preview before submit
- Upload progress + spinner
- Hebrew-primary UI with English toggle
- Mobile-first responsive layout (Israeli users are mobile-primary per CLAUDE.md)
- **DoD:** a user on a phone can take a photo of a letter and see it queued for translation. Tested on iOS Safari and Android Chrome.

### Day 9 — Thursday: Results UI

- Translation result card (TL;DR, key facts, action checklist)
- Deadline banner with countdown if a deadline was detected
- Action checklist with explicit deadlines per item
- Hebrew/English language toggle on the result itself
- Confidence indicator from quality check
- "Show original OCR text" expandable section
- **DoD:** a translation displays beautifully in both languages, on mobile and desktop, with proper RTL behavior.

### Day 10 — Friday: Client-side history (IndexedDB)

- IndexedDB schema for translation history
- Auto-save on successful translation
- History list page (chronological, searchable by classification)
- Open past translation in read-only mode
- Delete single translation + "delete all my data" button (the "panic button")
- Export history as JSON
- **DoD:** refreshing the page preserves history; clearing browser data clears it; the export button produces a valid JSON file the user can save.

**End-of-week-2 checkpoint:** the core product works end-to-end on the free tier. A user can sign up, upload a letter, see a great translation, view past translations on their own device. No billing, no paid features yet, no marketing site yet.

---

## Week 3 — Billing, paid features, marketing, launch

### Day 11 — Monday: Stripe billing

- Stripe products configured: free tier + ₪29/mo paid tier
- Checkout flow with hosted Stripe Checkout
- Webhook handler at `/api/webhooks/stripe`
- `subscriptions` table per the CLAUDE.md schema
- Plan-aware rate limiting (200/hr paid vs. 30/hr free)
- Customer portal link for self-service downgrade
- **Blocker risk:** Stripe IL requires an Israeli עוסק מורשה — must already be in flight (see Open Question D below). If not, fall back to Stripe US with manual ILS conversion for v1.
- **DoD:** a test card can upgrade to paid, sees the plan reflected in the UI, can downgrade, and the webhook events sync correctly to the database.

### Day 12 — Tuesday: Encrypted sync — backend + crypto utilities

- `/api/sync/upload`, `/api/sync/list`, `/api/sync/:id` (GET + DELETE)
- `encrypted_history` table per spec
- Client-side `lib/crypto/` with Argon2id key derivation via a vetted WASM library (`argon2-browser` is the usual choice)
- AES-GCM encryption/decryption in the browser
- **DoD:** ciphertext round-trips correctly between two test devices using the same password. Manually verify the server never sees plaintext.

### Day 13 — Wednesday: Encrypted sync — UI, recovery, failure modes

- "Enable sync" toggle in settings, paid users only
- Recovery code generation on enable (one-time-shown, user saves offline)
- "I forgot my password" flow that explicitly warns about permanent data loss
- Cross-device login flow that decrypts on sync
- Settings page can disable sync (wipes server ciphertext immediately)
- **DoD:** enable sync on device A, log in on device B, see history; deliberately corrupting the password on device B fails gracefully with no data leak; password reset destroys ciphertext after explicit user confirmation.

### Day 14 — Thursday: Marketing site, privacy pages, waitlist

- Homepage: hero, "Your letter, handled honestly" privacy section, pricing
- Privacy policy page (Hebrew + English) deployed at `/privacy`
- Subprocessors page deployed at `/subprocessors`
- Terms of Service draft deployed at `/terms` (basic version; attorney review will refine post-launch — flag for follow-up)
- Waitlist signup form (writes to a Supabase `waitlist` table)
- Resend integration for transactional emails (waitlist confirmation, welcome, billing receipts)
- **DoD:** all marketing pages render correctly in Hebrew RTL and English LTR on mobile and desktop; waitlist signup confirms via email.

### Day 15 — Friday: External security review, fixes, go/no-go

- External reviewer audit (booked in week 1, confirmed in week 2)
- Fix any critical findings
- Full smoke test of all flows on production environment with real keys
- 10 friendly-user test pass — collect their feedback
- **Decision:** go / no-go for soft launch to waitlist

**End of week 3:** if go, the soft launch happens over the weekend with a first batch of 25-50 waitlist invites.

---

## Critical path and risks

The four things that can blow the schedule:

1. **OCR accuracy on real Hebrew letters.** Test on day 4 with 20 real-style synthetic letters. If Claude Vision struggles on certain document types (low-contrast scans, handwritten margins, very small fonts), decide by end of week 1 whether to add Google Cloud Vision as a fallback. Adding it later is painful.

2. **External security review lead time.** Book the reviewer in week 1, schedule them for week 3 Friday. Some auditors have a 2-week lead time; don't discover this on day 14. Suggested options: Cobalt.io (marketplace, faster), Doyensec (boutique appsec), or an Israeli firm (e.g., Comsec, Sygnia — both more enterprise-priced).

3. **Israeli company / Stripe IL setup.** You need an Israeli עוסק מורשה or חברה בע"מ to use Stripe IL with ILS pricing. If not already in motion, start day 1 — it can take 2-3 weeks. Fallback: launch on Stripe US with ILS at the user-presented price and let Stripe handle FX, but this hurts margins.

4. **Domain purchase and DNS.** Trivial to do but needs to happen by day 14 for DNS to propagate. Pick the name in the first week.

---

## Open questions to resolve before kickoff

A. **Name and domain.** See chat discussion.

B. **Israeli company registration status.** Has this been started? If not, start day 1 — it'll block billing on day 11 otherwise.

C. **External security reviewer choice.** Decision pending; see chat discussion for cost ranges and firm options.

**Resolved:** OCR provider (Google Vision primary, Claude Vision fallback). Analytics provider (Plausible).

---

## What this plan does *not* include

- V2 features (WhatsApp bot, B2B social worker licenses, additional institutions like Tax Authority / Courts / Health funds / Utilities)
- Attorney review of TOS and disclaimers — recommended before launch, can run in parallel during week 3
- Heavy marketing or paid acquisition — soft launch to waitlist only
- Onboarding flow tuning — we ship a basic version and iterate after launch based on real user behavior
- Multi-language support beyond Hebrew + English
- API access for third parties
- The other three products in the broader product suite (Subscription Audit, Contract Translator, Insurance Claims) — those are Phases 2-4 per the CLAUDE.md sequence
