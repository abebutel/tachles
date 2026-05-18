// Belt-and-suspenders Sentry scrubber, ready to wire when Sentry is
// activated post-launch.
//
// Spec: docs/no-log-proxy-spec.md §Error handling, "Sentry configuration".
//
// Status: NOT wired during beta. We don't have a SENTRY_DSN configured and
// the auto-loading instrumentation file was removed because Next 16 bundles
// it into the Edge middleware and @sentry/nextjs's Node SDK transitively
// imports node:fs / node:path, which Edge runtime rejects. When we wire
// Sentry for the public launch we'll do it via withSentryConfig() in
// next.config.ts — the supported integration path on Edge — and import
// this scrubber from the generated edge config.
//
// We use a local interface that mirrors Sentry's ErrorEvent shape so this
// file has no runtime dependency on @sentry/nextjs.

interface ScrubbableEvent {
  request?: {
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, unknown> | unknown;
    query_string?: string | Record<string, string> | unknown;
  };
  breadcrumbs?: unknown[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
}

const EXTRA_ALLOWLIST = new Set([
  "request_id",
  "user_id",
  "route",
  "error_code",
  "upstream",
]);

const CONTEXTS_ALLOWLIST = new Set(["runtime", "os"]);

export function beforeSend<T extends ScrubbableEvent>(event: T): T | null {
  // 1. Strip request body/cookies/headers that may carry document bytes or tokens.
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
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

  // 4. Strip contexts outside the allowlist.
  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      if (!CONTEXTS_ALLOWLIST.has(key)) delete event.contexts[key];
    }
  }

  return event;
}
