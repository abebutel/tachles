import * as Sentry from "@sentry/nextjs";
import { beforeSend } from "@/lib/proxy/sentry-before-send";

// Edge runtime init. /api/ocr and /api/translate run on Edge.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend,
});
