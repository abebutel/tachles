"use strict";

// Local ESLint plugin exposing the three custom proxy-discipline rules.
// Wired in eslint.config.mjs.

module.exports = {
  rules: {
    "no-body-logging": require("./no-body-logging.js"),
    "no-console-in-proxy": require("./no-console-in-proxy.js"),
    "no-text-on-request": require("./no-text-on-request.js"),
  },
};
