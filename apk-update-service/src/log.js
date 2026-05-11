"use strict";

const pino = require("pino");

function createLogger(level = "info") {
  const opts = { level };
  if (process.stdout.isTTY) {
    return pino({
      ...opts,
      transport: {
        target: "pino-pretty",
        options: { translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname" },
      },
    });
  }
  return pino(opts);
}

module.exports = { createLogger };
