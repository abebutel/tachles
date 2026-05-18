"use strict";

// no-console-in-proxy
//
// Bans `console.*` entirely inside content-sensitive directories. The proxy
// uses proxyLogger (typed allow-list) instead. Path scoping is done by the
// ESLint config, not by this rule — once this rule is enabled for a file, any
// console call is an error.

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow console.* in proxy directories; use proxyLogger instead",
    },
    schema: [],
    messages: {
      noConsole:
        "console.{{ method }}() is banned in the proxy path. Use proxyLogger (see docs/no-log-proxy-spec.md §Logger contract).",
    },
  },

  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type === "Identifier" &&
          node.object.name === "console" &&
          node.property.type === "Identifier"
        ) {
          context.report({
            node,
            messageId: "noConsole",
            data: { method: node.property.name },
          });
        }
      },
    };
  },
};
