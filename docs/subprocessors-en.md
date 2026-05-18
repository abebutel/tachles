# Subprocessors

*Last updated: [DATE]*

> **Beta notice:** Tachles is currently in private beta. Subprocessors marked **"active in beta"** are in use today; those marked **"deferred"** will activate at public launch. We will notify all users by email at least 14 days before any deferred subprocessor activates or before adding any new subprocessor that touches document content.

This page lists every third-party service ("subprocessor") that [Company name] uses to operate Tachles. We keep this list current.

If you'd like to be notified of subprocessor changes without signing up for the service, email subprocessor-updates@[domain].

---

## Subprocessors that process document content (transiently, in memory)

These providers may briefly process the text of your uploaded letter while a translation is in progress. They do not store document content beyond the request, and we do not retain a copy.

| Subprocessor | Purpose | Region(s) | Status | Data terms |
|---|---|---|---|---|
| Anthropic, PBC | Large language model — document classification, translation, and quality check; OCR fallback | USA / Ireland | **Active in beta** | DPA in place. Configured so the provider does not train its models on your data. |
| Google LLC (Cloud Vision API) | OCR / extraction of text from your uploaded image (primary) | USA / EU | **Active in beta** | Google Cloud enterprise terms. Image not retained by Google. |

---

## Subprocessors that handle account or operational data (no document content)

These providers help us run the service but never receive your document content.

| Subprocessor | Purpose | Region(s) | Status | Data shared |
|---|---|---|---|---|
| Supabase Inc. | Authentication, account database (emails, beta-consent records) | EU (Frankfurt) | **Active in beta** | Email, hashed password, language preference, beta-consent version + timestamp |
| Vercel Inc. | Web application hosting and serverless functions | Global edge / USA primary | **Active in beta** | Request metadata only — bodies are streamed through, not stored |
| Resend Inc. | Transactional email delivery (welcome, beta invitations) | USA | **Active in beta** | Email address; email content limited to account-related messages |
| Stripe Inc. | Payment processing | USA / Ireland | **Deferred** *(activates at public launch)* | Billing details and card data (Stripe-side only — we don't see card numbers) |
| Plausible Insights OÜ | Aggregate privacy-respecting usage analytics (cookieless, EU-hosted) | EU (Germany) | **Deferred** *(activates at public launch)* | Anonymous traffic metadata only — no PII, no cookies |

---

## Our commitments

We commit to:

- Keeping this page accurate and current
- Notifying all users by email **at least 14 days in advance** before adding or changing any subprocessor that touches document content
- Notifying all users by email **at least 14 days in advance** before activating a deferred subprocessor (i.e., before transitioning from beta to public launch)
- Notifying users via in-app notice when we add or change a subprocessor that handles account data
- Negotiating a Data Processing Agreement (DPA) with every subprocessor before using them
- Configuring AI providers so your data is not used to train their models, where this option is available

---

## Contact

- Email: privacy@[domain]
- Subprocessor change notifications: subprocessor-updates@[domain]
- Privacy policy: [domain]/privacy
