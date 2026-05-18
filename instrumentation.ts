// Next.js instrumentation hook. Runs once per runtime at startup.
//
// Only loads the matching Sentry config — never both. The top-level scope
// must stay free of `@sentry/nextjs` imports because Next bundles this file
// into the Edge middleware, and the Sentry Node SDK transitively imports
// `node:fs` and `node:path` (which aren't available in Edge runtime).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Next.js will call this when an App Router request errors. We delegate to
// Sentry's request-error hook, lazy-loaded so the Edge bundle doesn't pull
// the Node SDK transitively.
export async function onRequestError(
  err: unknown,
  request: unknown,
  context: unknown,
): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    const hook = (Sentry as unknown as {
      captureRequestError?: (e: unknown, r: unknown, c: unknown) => void;
    }).captureRequestError;
    if (hook) hook(err, request, context);
    else Sentry.captureException(err);
  } catch {
    // Sentry not available — drop silently. Errors are still surfaced to
    // the user via the route handler's SafeError response.
  }
}
