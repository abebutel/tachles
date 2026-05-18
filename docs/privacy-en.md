# Privacy copy — English (Beta version)

> Draft v3 — adapted for the private beta. Placeholders for company name, domain, region, and dates in [brackets].
> This file contains two pieces: (1) the short homepage section users see at signup,
> and (2) the full privacy policy linked from the footer.

---

## Homepage section — "Tachles — early access"

Tachles is a tool that translates letters from Israeli institutions into plain Hebrew and English. You're seeing this page because you have an invitation to our private beta.

**What "beta" means here:** the code is built with care and follows the privacy practices described below, but it has not been audited by an external security firm. We're keeping the beta small (around 20 invited users) until that audit is complete. Please don't use the beta for documents you'd be deeply uncomfortable seeing leaked.

**Privacy commitments (active in beta, identical to the public version):** When you translate a letter, your data takes one path: from your device, through our servers in memory only, to AI providers that handle the translation, and back to you. We don't store your letter. We don't log it. We don't keep a copy.

Your translation history is saved on your device, not on our servers.

We keep your account email. Nothing else.

[I accept the beta terms]   [Read the full privacy policy →]

---

# Privacy Policy

*Last updated: [DATE]*

> **Beta notice.** Tachles is currently in private beta and has not undergone external security review. The architectural commitments described below are implemented and verified by our own testing, but not audited by a third party. Three parts of this policy are described for context but not active during the beta: anything about **"billing"** (the beta is free), **"encrypted cross-device sync"** (a paid feature, deferred to public launch), and **"analytics"** (deferred to public launch). All three activate at public launch alongside an external audit. By using the beta you confirm you've read and accepted the beta consent terms shown at signup.

## Who we are

[Company name TBD] is an Israeli developer operating [domain TBD] (Tachles), a service that helps you understand letters and documents from Israeli institutions in plain Hebrew and English. We are the "data controller" for the information described in this policy. You can contact us at privacy@[domain].

## Beta consent — what you agreed to at signup

When you signed up for the Tachles private beta, you affirmatively confirmed each of the following:

- Tachles is an early beta, not a finished product.
- The privacy architecture described in this policy has not yet been audited by an external security firm.
- You will not use the beta to translate documents containing information you would be very uncomfortable having leaked.

If you no longer agree with these terms, you can delete your account from the settings page at any time, which permanently removes all data we hold about you.

## What this policy covers

This policy describes what data we collect, what we do with it, and what choices you have. We've tried to write it in plain language. The full document is below — here is the honest one-paragraph summary first:

We don't store the documents you translate, and we don't keep copies of the translations themselves on our servers. We do store your email address (and, at public launch, billing references — not active in beta). We rely on third-party AI providers to translate your documents — your document text is sent to them under their privacy terms when you request a translation. The current list of every third-party service we use is published at [domain]/subprocessors — we keep it up to date and notify users by email before adding or changing any provider that touches document content. We do not sell your data, ever.

## What we collect

**Account data.** When you sign up, we collect your email address and (if you choose Google or Apple sign-in) the basic profile information those services share with us. We collect your preferred language (Hebrew or English). We record the version and timestamp of your beta-consent acceptance. Billing data is handled by our payment processor (not active during beta) — we never see your credit card number.

**Document data.** When you upload a letter for translation, your document and the resulting translation pass through our servers **in memory only** for the duration of the request. We do not store the original document. We do not store the translation. We do not log the contents. We do not include the contents in error reports. Our application code is structured to make this technically impossible (the body of these requests exists only in memory for the duration of the request — typically a few seconds — and is never written to a disk, log file, or error-tracking service).

**If you enable cross-device sync (paid feature — deferred to public launch):** your translations would be encrypted on your device using a key derived from your password (Argon2id key derivation). We would store only the encrypted blob. We could not decrypt it. **If you lose your password, you lose your history — we cannot help recover it.** This feature is not active in the beta.

**Usage metadata.** We log non-content metadata: which user (by ID) made a request at what time, how many tokens the AI used, whether the request succeeded, how long it took. We use this for debugging and security monitoring. We do not log document content. (Billing-related metadata activates at public launch.)

**Cookies and analytics.** We use the minimum cookies necessary for authentication. We do not use any analytics during the beta — at public launch, we'll add a privacy-respecting analytics tool (described in the subprocessors page).

## How your document is processed — the core flow

Step by step, this is what happens when you upload a letter:

1. The image is sent from your device to our server over an encrypted TLS connection.
2. Our server immediately forwards the image to an OCR (text extraction) service to read the text. We do not save a copy.
3. The extracted text is sent to an AI language model (LLM) to classify the document type (Bituach Leumi, bank, municipality, lawyer).
4. The text is sent to the LLM again with a specialist prompt to produce the plain-language translation.
5. The text is sent once more to the LLM for a quality check.
6. The translation is sent back to your device. Your browser saves it to local storage (IndexedDB) on your device.
7. Everything we held in memory is discarded.

At no point in this flow does our server write your document or translation to a disk, a database, a log file, or an error-tracking service.

## Third parties we work with

We share data with a small number of service providers, each for a specific purpose, each under a written agreement that limits how they use your data. We describe them here by category; the specific companies we use today are listed at [domain]/subprocessors and updated as our stack changes.

- **AI language model provider** — processes your document text to produce translations. Subject to a Data Processing Agreement and configured so the provider does not train its models on your data.
- **OCR / text extraction provider** — reads the text from your uploaded image. Subject to enterprise terms.
- **Payment processor** *(activates at public launch, not used during beta)* — handles your payment information. We never see your card number.
- **Cloud database and authentication provider** — hosts our authentication system and our account database (emails, beta-consent records).
- **Cloud hosting provider** — hosts and runs our web application.
- **Email delivery service** — sends transactional emails (welcome, beta invitations).
- **Privacy-respecting analytics provider** *(activates at public launch, not used during beta)* — aggregates non-personally-identifiable usage data.

We do not share, sell, or rent your data to advertisers, data brokers, or anyone else.

If we add a new provider that will touch document content, or change which provider we use for that purpose, **we will notify all users by email at least 14 days in advance** and update the subprocessors page.

## Where your data is held

Account data (email, beta-consent records) is stored in our cloud provider's infrastructure in [region — likely EU]. Document content is not stored anywhere. Document content is processed transiently on our AI providers' infrastructure, which may be in the United States or the European Union depending on routing.

## Security

- All connections use TLS 1.2 or higher.
- Account data is encrypted at rest by our cloud provider.
- Our codebase enforces no-logging of document content via automated checks (custom ESLint rules + a CI canary test that submits a tracer string and fails the build if it appears in any log).
- We perform internal review of the document-processing path before each release. An external security review will be completed before public launch.
- We do not retain backups of document content because we do not store document content.
- We follow the requirements of the Israeli Privacy Protection Regulations (Data Security), 2017.

## Your rights

Under Israeli Privacy Protection Law — and, if you are in the EU, the GDPR — you have the following rights:

- **Access.** Request a copy of the account data we hold about you.
- **Correction.** Correct any inaccurate information.
- **Deletion.** Delete your account from the settings page; this permanently removes all data we hold about you (account info, beta-consent records).
- **Portability.** Export your translation history at any time from your device.
- **Objection.** Object to processing for certain purposes.
- **Complaint.** Complain to the Israeli Privacy Protection Authority (PPA) or your local data protection authority.

To exercise any of these rights, email privacy@[domain]. We respond within 30 days.

## Children

This service is not intended for users under 18. We do not knowingly collect data from children. If you believe a child has signed up, please contact us and we will delete the account.

## Changes to this policy

If we make material changes to this policy, we will email you and post a notice on the site at least 14 days before the changes take effect. The transition from beta to public will be communicated this way. Historical versions are available at [URL].

## Contact

- Email: privacy@[domain]
- Israeli company registration: [Deferred until public launch]
- Mailing address: [TBD]
