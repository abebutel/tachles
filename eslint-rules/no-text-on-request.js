"use strict";

// no-text-on-request
//
// Bans body-consumption methods that materialize the INBOUND request body
// as a single in-memory value. The proxy must read `request.body` as a
// ReadableStream (via lib/proxy/stream.ts) so we can enforce size limits
// during the read and never expose a JSON.stringify-friendly handle.
//
// Banned identifiers (text, json, arrayBuffer, formData, blob) fire only
// when called on a receiver named `request` or `req` — the conventional
// Next.js route-handler parameter. Calls on `fetch()` responses (e.g.
// `res.json()` against Google Vision's metadata wrapper) are allowed: those
// are upstream responses, not the user's inbound document body.
//
// Path scope is set in eslint.config.mjs; translate-pipeline.ts is exempted
// entirely per Six Disciplines #2 (it has to parse the inbound JSON to
// orchestrate the three-call pipeline).

const BANNED_METHODS = new Set(["text", "json", "arrayBuffer", "formData", "blob"]);
const REQUEST_RECEIVER_NAMES = new Set(["request", "req"]);

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow request.text() / .json() / .arrayBuffer() / .formData() / .blob() in proxy directories",
    },
    schema: [],
    messages: {
      bannedMethod:
        "{{ receiver }}.{{ method }}() materializes the inbound body in memory and breaks the streaming proxy guarantee (Six Disciplines #1, docs/no-log-proxy-spec.md). Use lib/proxy/stream.ts#readBodyBounded instead.",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        if (callee.property.type !== "Identifier") return;
        if (!BANNED_METHODS.has(callee.property.name)) return;
        if (node.arguments.length !== 0) return;

        // Only fire when the receiver is a Request-like identifier. We don't
        // have type info in stock ESLint, so we use the standard parameter-
        // naming convention as a proxy. If someone aliases `const r = request`
        // and calls `r.json()`, the rule misses it — that's a known limit; the
        // pre-commit scanner + CI canary catch the actual leak path.
        if (callee.object.type !== "Identifier") return;
        if (!REQUEST_RECEIVER_NAMES.has(callee.object.name)) return;

        context.report({
          node,
          messageId: "bannedMethod",
          data: {
            method: callee.property.name,
            receiver: callee.object.name,
          },
        });
      },
    };
  },
};
