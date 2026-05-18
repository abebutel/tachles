import * as Sentry from "@sentry/nextjs";

// Browser-side init. The browser never handles other users' content, but the
// user's own document body is in memory here during upload. Sample rate kept
// at 0 for the beta — we don't need browser tracing yet.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
    }
    event.breadcrumbs = [];
    return event;
  },
});
