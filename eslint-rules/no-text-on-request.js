"use strict";

// no-text-on-request
//
// Bans request-body consumption methods that materialize the body as a single
// in-memory value. The proxy is required to stream `request.body` directly to
// the upstream provider — any of these methods would buffer the document into
// our process memory and make it possible to log accidentally.
//
// Banned identifiers (called on any receiver): text, json, arrayBuffer,
// formData, blob. The rule fires on `<anything>.text()` etc; the path scope
// (in eslint.config.mjs) restricts this to proxy directories, and the
// override there exempts translate-pipeline.ts (the one place the spec allows
// `request.json()` — see Six Disciplines #2).

const BANNED_METHODS = new Set(["text", "json", "arrayBuffer", "formData", "blob"]);

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
        "{{ method }}() materializes the body in memory and breaks the streaming proxy guarantee (Six Disciplines #1, docs/no-log-proxy-spec.md). Pipe `request.body` upstream as a ReadableStream instead.",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          BANNED_METHODS.has(callee.property.name) &&
          node.arguments.length === 0
        ) {
          context.report({
            node,
            messageId: "bannedMethod",
            data: { method: callee.property.name },
          });
        }
      },
    };
  },
};
