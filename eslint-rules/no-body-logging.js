"use strict";

// no-body-logging
//
// Flags any call to a known logger that includes a property whose name suggests
// it could carry user content. Why: the typed proxyLogger already rejects
// these at the type level, but TS-only enforcement breaks down at runtime
// boundaries (e.g., `as any` casts, third-party loggers, JS files). This rule
// is the redundant belt-and-suspenders that survives even when types are
// bypassed.
//
// Triggers when the receiver is one of: proxyLogger, console, logger, pino,
// log, Sentry (captureMessage / captureException). The property-name regex
// matches anything that smells like document content.

const LOGGER_NAMES = new Set(["proxyLogger", "console", "logger", "log", "pino", "Sentry"]);
const BODY_FIELD_REGEX = /^(body|ocrText|ocr_text|translation|content|text|image|document|letter|payload|raw|input|output|message|prompt|response)$/i;

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow passing body-like fields (body, ocr_text, translation, content, etc.) to logger calls",
    },
    schema: [],
    messages: {
      bodyField:
        "Logging '{{ name }}' may include user document content. Move it out of the logger payload (see docs/no-log-proxy-spec.md §Logger contract).",
    },
  },

  create(context) {
    function isLoggerCallee(callee) {
      // Match `<Name>.<method>(...)` and `<Name>(...)` shapes.
      if (callee.type === "MemberExpression" && callee.object.type === "Identifier") {
        return LOGGER_NAMES.has(callee.object.name);
      }
      if (callee.type === "Identifier") {
        return LOGGER_NAMES.has(callee.name);
      }
      return false;
    }

    function unwrap(node) {
      while (
        node &&
        (node.type === "TSAsExpression" ||
          node.type === "TSTypeAssertion" ||
          node.type === "TSSatisfiesExpression" ||
          node.type === "TSNonNullExpression")
      ) {
        node = node.expression;
      }
      return node;
    }

    function checkObjectArgument(arg) {
      arg = unwrap(arg);
      if (!arg || arg.type !== "ObjectExpression") return;
      for (const prop of arg.properties) {
        if (prop.type !== "Property") continue;
        let name = null;
        if (prop.key.type === "Identifier") name = prop.key.name;
        else if (prop.key.type === "Literal" && typeof prop.key.value === "string") name = prop.key.value;
        if (name && BODY_FIELD_REGEX.test(name)) {
          context.report({ node: prop, messageId: "bodyField", data: { name } });
        }
      }
    }

    return {
      CallExpression(node) {
        if (!isLoggerCallee(node.callee)) return;
        for (const arg of node.arguments) {
          checkObjectArgument(arg);
        }
      },
    };
  },
};
