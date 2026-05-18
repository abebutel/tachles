import * as Sentry from "@sentry/nextjs";
import { beforeSend } from "@/lib/proxy/sentry-before-send";

// Server (Node.js) runtime init. If SENTRY_DSN is unset, Sentry no-ops —
// useful for local dev and the beta (where we may not even wire up Sentry
// until we have actual traffic).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend,
});
