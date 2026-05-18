// Proxy logger — typed, allow-list-only.
//
// Why a custom logger: the proxy path handles user document bodies. The spec
// (docs/no-log-proxy-spec.md, "Logger contract") requires that no body field
// can be logged, even accidentally. We get that property structurally — the
// type union below lists every field that may be logged; everything else is a
// TypeScript compile error.
//
// Adding a field to LoggableField requires a `// log-field-added: <reason>`
// comment on the line, so reviewers explicitly approve every new logged
// property.

export type LoggableField =
  | "ts"
  | "user_id"
  | "request_id"
  | "route"
  // OCR route
  | "image_size_bytes"
  | "response_status"
  | "ocr_provider_used"
  | "ocr_confidence"
  | "latency_ms"
  // Translate route
  | "classification_label"
  | "classification_confidence"
  | "specialist_route"
  | "total_input_tokens"
  | "total_output_tokens"
  | "call_count"
  | "quality_check_passed"
  // Sync route (paid tier — deferred for beta but typed now)
  | "ciphertext_size_bytes"
  // Errors
  | "error_class"
  | "error_code"
  | "upstream";

export type LogPayload = Partial<Record<LoggableField, string | number | boolean>>;

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, payload: LogPayload): void {
  // Single structured line. In Edge/Node runtime, Vercel captures stdout per
  // request — that's the only place this goes. Sentry has its own path via
  // SafeError; this logger never calls Sentry.
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...payload });
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const proxyLogger = {
  info(payload: LogPayload): void {
    emit("info", payload);
  },
  warn(payload: LogPayload): void {
    emit("warn", payload);
  },
  error(payload: LogPayload): void {
    emit("error", payload);
  },
};
