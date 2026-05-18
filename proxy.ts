import { type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

// Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`. The
// exported function used to be called `middleware`; the new convention is
// `proxy`.
//
// DIAGNOSTIC: The Supabase session-refresh block was previously called from
// here and is temporarily removed while we narrow down the Vercel Edge
// "node:fs / node:path" error. If this deploy succeeds, the Supabase block
// is the culprit and we'll move it into a server-side layout (App Router
// pages can refresh sessions just as well). If this still fails, the issue
// is elsewhere.
export function proxy(request: NextRequest) {
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|auth|.*\\..*).*)"],
};
