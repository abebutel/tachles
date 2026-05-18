import type { ErrorEvent } from "@sentry/nextjs";

// Belt-and-suspenders Sentry scrubber. The proxy never explicitly hands
// bodies to Sentry, but the SDK auto-captures request data, breadcrumbs, and
// arbitrary extra context. This hook strips everything except a tiny allow-
// list of metadata.
//
// Spec: docs/no-log-proxy-spec.md §Error handling, "Sentry configuration".

const EXTRA_ALLOWLIST = new Set([
  "request_id",
  "user_id",
  "route",
  "error_code",
  "upstream",
]);

export function beforeSend(event: ErrorEvent): ErrorEvent | null {
  // 1. Strip request body/cookies/headers that may carry document bytes or tokens.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      // Keep nothing from headers — Authorization, cookies, content bytes can
      // all sneak content through. We only need to know an error happened.
      event.request.headers = {};
    }
    if (event.request.query_string && typeof event.request.query_string !== "string") {
      event.request.query_string = "";
    }
  }

  // 2. Clear breadcrumbs entirely. They can capture console.log output,
  //    fetch URLs with body data, etc.
  event.breadcrumbs = [];

  // 3. Restrict `extra` to the allowlist.
  if (event.extra) {
    for (const key of Object.keys(event.extra)) {
      if (!EXTRA_ALLOWLIST.has(key)) delete event.extra[key];
    }
  }

  // 4. Clear `contexts` we don't explicitly trust.
  if (event.contexts) {
    const trusted: NonNullable<ErrorEvent["contexts"]> = {};
    if (event.contexts.runtime) trusted.runtime = event.contexts.runtime;
    if (event.contexts.os) trusted.os = event.contexts.os;
    event.contexts = trusted;
  }

  return event;
}
