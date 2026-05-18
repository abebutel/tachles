// Errors thrown in the proxy path are always SafeError instances.
//
// Why: catching an upstream error and re-throwing it raw would leak the
// upstream response body (e.g., Anthropic 4xx responses often echo the
// request) into stack traces, into Sentry's exception capture, or into a
// generic 500 response. SafeError has a fixed shape — `code`, `status`,
// optional `upstream` — and a `message` that the caller is responsible for
// keeping free of user content.

export type UpstreamProvider = "anthropic" | "google_vision" | "supabase";

export interface SafeErrorArgs {
  code: string;
  status: number;
  message: string;
  upstream?: UpstreamProvider;
}

export class SafeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly upstream?: UpstreamProvider;

  constructor(args: SafeErrorArgs) {
    super(args.message);
    this.name = "SafeError";
    this.code = args.code;
    this.status = args.status;
    this.upstream = args.upstream;
  }
}

// Common codes — kept here so route handlers don't drift on spelling.
export const SafeErrorCodes = {
  UPSTREAM_5XX: "UPSTREAM_5XX",
  UPSTREAM_RATE_LIMIT: "UPSTREAM_RATE_LIMIT",
  UPSTREAM_TIMEOUT: "UPSTREAM_TIMEOUT",
  UPSTREAM_INVALID_RESPONSE: "UPSTREAM_INVALID_RESPONSE",
  INVALID_INPUT: "INVALID_INPUT",
  UNAUTHORIZED: "UNAUTHORIZED",
  RATE_LIMITED: "RATE_LIMITED",
  BODY_TOO_LARGE: "BODY_TOO_LARGE",
  DAILY_BUDGET_EXCEEDED: "DAILY_BUDGET_EXCEEDED",
} as const;

export type SafeErrorCode = (typeof SafeErrorCodes)[keyof typeof SafeErrorCodes];
