// Next.js instrumentation hook. Runs once per runtime at startup. We use it
// to load the appropriate Sentry config file.

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Re-export Sentry's request-error hook if the SDK provides one.
export const onRequestError = (
  Sentry as unknown as { captureRequestError?: typeof Sentry.captureException }
).captureRequestError;
