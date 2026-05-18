# Build Plan — Tachles Private Beta

Two weeks. Ten working days. The goal is a private beta deployed to ~20 invited users that delivers on every active promise in the privacy policy.

This is the lean version of `build-plan-v1.md`. Several features from the original plan are deliberately deferred until public launch: Stripe billing, encrypted cross-device sync, public marketing site, external security audit. They come back online in the "going public" plan once the audit budget is available.

This plan assumes one developer working full-time. If you're working part-time, scale accordingly — but **do not** compromise on the proxy discipline. The whole point of the beta is to learn whether the product idea works while building the privacy architecture correctly from day one.

---

## Definition of done for the private beta

A beta ship is approved only when all of the following are true:

- An invited user can sign up, accept the beta consent, upload a photo of a Hebrew letter, and receive a plain-language translation in under 10 seconds.
- The four document specialists (Bituach Leumi, bank, municipality, lawyer) each produce accurate plain-language translations on 80%+ of a 20-document synthetic test corpus.
- The CI canary test passes on every commit — no tracer string in any log, error tracker, or deployment record.
- The self-review checklist (in the spec, "Security review checklist" section) is run by you with a senior-engineer mindset; every item ticked.
- Translation history works on the user's device via IndexedDB.
- Privacy policy with beta notice + subprocessors page deployed at `/privacy` and `/subprocessors`.
- Beta consent flow at signup explicitly captures user agreement and stores the version + timestamp.
- Invite-only landing page (no public signup form).
- 10 of the 20 invited users have used the product end-to-end and reported back.

---

## What is NOT in the beta (deferred to public launch)

| Deferred item | Why it's deferred | Cost when activated |
|---|---|---|
| Stripe billing | Beta is free; no payments | ~3-5 days build |
| Encrypted cross-device sync | Not needed for friends/family beta | ~2-3 days build |
| Israeli company registration | Not needed without payments | $1,500-2,500 + 2-3 weeks |
| External security audit | Pause until budget allows | $5,000-7,000 |
| Cyber liability insurance | Pause until public launch | $2,000-5,000/yr |
| Attorney TOS review | Defer; use the draft TOS as-is | $500-1,500 |
| Public marketing site, SEO | Beta is invite-only | 1-2 days build |
| Plausible analytics | Skip during private beta — talk directly to your 20 users instead | $9-19/month |

When you graduate to public, see `build-plan-v1.md` for the full additional work.

---

## Week 1 — Foundation, auth, proxy, OCR

### Day 1 — Monday: Project skeleton + Supabase + Vercel

- `pnpm create next-app` with TypeScript, Tailwind, App Router
- `next-intl` configured for Hebrew/English, RTL by default for Hebrew locale
- Repo on GitHub, Vercel project connected (Hobby plan free tier for beta — test that Edge runtime works for the pipeline before upgrading)
- Supabase project provisioned in EU (Frankfurt) on the free tier
- `.env.local` and `.env.example` set up per the spec
- **DoD:** `pnpm dev` shows a Hebrew "שלום" / English "Hello" toggle page; a push to GitHub creates a Vercel preview deploy.

### Day 2 — Tuesday: Auth + profiles + beta consent flow

- Supabase Auth with Google and Apple providers
- `profiles` table extended with `beta_consent_version` (text) and `beta_consent_accepted_at` (timestamp) columns
- `beta_invites` table — an allowlist of email addresses you manually add
- Sign-in / sign-up UI with the beta consent step (required checkbox before account is created)
- The exact consent text from `privacy-en.md` / `privacy-he.md` displayed in the user's language
- Language preference saved to profile
- **Invite-only check:** signups only succeed if the email is on the `beta_invites` allowlist; non-invited emails get a friendly "this is invite-only — request access at [email]" message
- **DoD:** an invited user can sign up after explicitly accepting the beta terms; a non-invited email gets the friendly invite-only message; consent version + timestamp are recorded on the profile.

### Day 3 — Wednesday: Proxy infrastructure (the unglamorous critical day)

- `lib/proxy/` directory created per spec
- `proxyLogger` with typed allowlist
- `SafeError` class
- ESLint rules: `no-body-logging`, `no-console-in-proxy`, `no-text-on-request`
- Pre-commit hook with body-write pattern scans
- Sentry installed with `beforeSend` hook (free tier — 5K events/month is plenty)
- CI canary test scaffold (gets teeth once routes exist on day 4)
- **DoD:** a deliberate violation of any of the three ESLint rules fails the build; the canary scaffold runs in CI and passes; Sentry is wired up to a free Sentry project.

### Day 4 — Thursday: `/api/ocr`

- OCR route handler, Edge runtime
- Google Cloud Vision integration (primary OCR provider) — set up a GCP project, enable Cloud Vision API, generate a service account key
- Claude Vision wired up as fallback (triggered when Google returns confidence below `OCR_FALLBACK_CONFIDENCE_THRESHOLD` or fails)
- Upstash Redis rate limiter integrated (free tier)
- Body size limit enforcement via `Content-Length`
- Unit tests + integration tests for both the primary and fallback paths
- Canary test extended to /api/ocr with a tracer-bearing image
- **Critical:** run 20 real-style synthetic Hebrew letters through both providers and compare accuracy + cost. Tune the confidence threshold based on results.
- **DoD:** uploading a Hebrew letter photo returns extracted text in <3s; the tracer test passes on /api/ocr; the fallback path is exercised at least once in testing.

### Day 5 — Friday: `/api/translate` — classification + specialists wired

- Translation pipeline scaffolding in `lib/proxy/translate-pipeline.ts`
- `buildPrompt_ClassifyDocument` wired up
- All 4 specialist prompts wired up (ביטוח לאומי, bank, municipality, lawyer)
- `routeToSpecialistPrompt` logic
- **DoD:** posting OCR text returns a classification + translation from the chosen specialist; tracer test passes on /api/translate; all 4 specialists run end-to-end on at least one test case each.

**End-of-week-1 checkpoint:** the foundation is in place. By Friday EOD, an invited user can sign in, accept beta consent, upload a photo, and see a rough translation. The proxy promises are technically demonstrable.

---

## Week 2 — Pipeline polish, UI, beta launch

### Day 6 — Monday: Quality check + full pipeline tuning

- `buildPrompt_QualityCheck` wired up
- Quality-check failure surfaced to user with a "we're not confident in this translation" warning
- Cost & latency measured per request — confirm we're in the ~$0.006-0.011 / doc range from the original MVP estimate
- Synthetic test corpus: 5 letters per specialist (20 total). Run all through; measure accuracy + manually approve tone for each
- **DoD:** end-to-end translation in <10s for typical letters; quality check correctly flags 3 deliberately-mangled test cases; you have read every output and approved the tone.

### Day 7 — Tuesday: Upload UI

- Photo upload component (file picker + camera capture on mobile)
- Image preview before submit
- Upload progress + spinner
- Hebrew-primary UI with English toggle
- Mobile-first responsive layout (Israeli users are mobile-primary per CLAUDE.md)
- **DoD:** a user on a phone can take a photo of a letter and see it queued for translation. Tested on iOS Safari and Android Chrome.

### Day 8 — Wednesday: Results UI

- Translation result card (TL;DR, key facts, action checklist)
- Deadline banner with countdown if a deadline was detected
- Action checklist with explicit deadlines per item
- Hebrew/English language toggle on the result itself
- Confidence indicator from quality check
- "Show original OCR text" expandable section
- **DoD:** a translation displays clearly in both languages, on mobile and desktop, with proper RTL behavior.

### Day 9 — Thursday: Client-side history (IndexedDB)

- IndexedDB schema for translation history
- Auto-save on successful translation
- History list page (chronological, searchable by classification)
- Open past translation in read-only mode
- Delete single translation + "delete all my data" button (the "panic button")
- Export history as JSON
- **DoD:** refreshing the page preserves history; clearing browser data clears it; the export button produces a valid JSON file the user can save.

### Day 10 — Friday: Beta landing, invite flow, self-review, soft launch

- Beta-only landing page: no signup form, just "Tachles is in private beta — you need an invitation. Request access: [email]"
- Privacy policy and subprocessors pages deployed at `/privacy` and `/subprocessors` in both Hebrew and English
- Invite issuance flow: you (the developer) add emails to the `beta_invites` table; system sends a welcome email via Resend with the signup link
- Run the self-review checklist from the spec ("Security review checklist") end-to-end; fix any findings
- Smoke test all flows on the production environment with real keys
- Send the first 5 invites to your closest friends/family
- **DoD:** an invited user can complete the full flow on production — sign up, accept consent, do a translation, see their history, delete their account.

**End of week 2:** beta is live to 5 users. Over the following week or two (not counted in this plan), expand to 20 as the first 5 confirm the basics work and you collect their feedback.

---

## Critical path and risks

1. **OCR accuracy on real-style Hebrew letters.** Test on day 4. If Google + Claude fallback together can't reliably handle some document types (low-contrast scans, handwritten margins, dense small fonts), you'll find out before you've built the UI on top.

2. **Beta consent flow.** Must be unambiguous. The user explicitly checks a box that says "I understand this is unaudited," and we record version + timestamp. This is your legal foundation for running the beta.

3. **Self-review discipline.** Without an external auditor, the day-10 self-review is the only check. Take it seriously. Walk through every item in the spec's security review checklist. If you're uncertain, ask a developer friend to do a 1-2 hour code review of `lib/proxy/` — that's a favor most engineers will do for free, and it catches things you've gone blind to.

4. **Invite list hygiene.** Make sure your `beta_invites` table is truly opt-in — only emails you've manually added. No public signup form. Never let "the link got shared" become "and now there are 200 strangers using my unaudited service."

---

## Costs during the beta (recap)

- Domain: ~$15-30 one-time
- Vercel Hobby: $0 (test that Edge runtime works for the pipeline; upgrade to Pro at $20/month only if needed)
- Supabase free tier: $0
- Anthropic API: ~$1-5/month at beta volumes
- Google Cloud Vision: ~$0.50-2/month
- Upstash, Sentry, Resend: all $0 (free tiers)
- Plausible (analytics): deferred until public launch
- **Running total: ~$5-30/month**

Setup is essentially free beyond the domain.

---

## Going from beta to public launch

When you're ready (and the ~$5-7K audit budget is in place), the additional work to graduate is roughly:

- Stripe billing + Israeli company registration (~3-5 days build, plus 2-3 weeks Israeli company registration in parallel)
- Encrypted cross-device sync (paid feature) — ~2-3 days build
- Public marketing site + waitlist signup — ~1-2 days
- External security audit — ~1-2 weeks engagement, scheduled in advance
- Privacy policy updates — remove beta banner, add "Audited by" section, activate Stripe / Plausible references
- Cyber liability insurance enrollment

Both the beta consent flow and the architectural discipline you built during the beta carry over directly. The public launch is mostly *adding back* the features deferred above, not rebuilding anything.
