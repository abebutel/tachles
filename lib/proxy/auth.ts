import { createClient } from "@supabase/supabase-js";
import { SafeError, SafeErrorCodes } from "./safe-error";

// Edge-compatible Supabase auth check. The browser hands us a bearer token
// (from `supabase.auth.getSession()`); we ask Supabase to validate it.
//
// The spec ideal is local JWT signature verification (no upstream call) — that
// requires `SUPABASE_JWT_SECRET` and the `jose` library. For the beta we use
// the simpler upstream-validation path; the ~100ms cost is rounding-error
// compared to OCR latency (1-3s) and translation latency (3-6s), and we
// avoid wiring one more secret. Switch to local verification if traffic
// patterns ever make the overhead matter.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface AuthContext {
  userId: string;
}

export async function verifyRequestAuth(request: Request): Promise<AuthContext> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    throw new SafeError({
      code: SafeErrorCodes.UNAUTHORIZED,
      status: 401,
      message: "missing bearer token",
    });
  }
  const token = header.slice("bearer ".length).trim();
  if (!token) {
    throw new SafeError({
      code: SafeErrorCodes.UNAUTHORIZED,
      status: 401,
      message: "empty bearer token",
    });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new SafeError({
      code: "AUTH_NOT_CONFIGURED",
      status: 500,
      message: "supabase auth env vars missing",
    });
  }

  // One-shot client. We don't persist sessions in the proxy path — every
  // request brings its own bearer token.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new SafeError({
      code: SafeErrorCodes.UNAUTHORIZED,
      status: 401,
      message: "invalid or expired token",
    });
  }

  return { userId: data.user.id };
}

// Best-effort client IP from common edge headers. Used as a coarse abuse
// signal for the IP rate limiter only.
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
