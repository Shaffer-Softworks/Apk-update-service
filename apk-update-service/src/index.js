"use strict";

const fs = require("node:fs");
const { loadConfig } = require("./config");
const { State } = require("./state");
const { createLogger } = require("./log");
const { createApp } = require("./server");
const { createReleaseHandler } = require("./releaseHandler");
const { createWebhookrelayClient } = require("./webhookrelay");
const { createGithubDownloader } = require("./githubDownload");

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.log_level);
  logger.info(
    {
      flavors: config.flavors.map((f) => f.id),
      apkDir: config.paths.apkDir,
      stateFile: config.paths.stateFile,
      httpPort: config.httpPort,
    },
    "Starting APK update service"
  );

  fs.mkdirSync(config.paths.apkDir, { recursive: true });

  const state = new State({
    stateFile: config.paths.stateFile,
    logger: logger.child({ module: "state" }),
  });
  state.load();

  const githubDownload = createGithubDownloader({
    config,
    logger: logger.child({ module: "github" }),
  });

  const releaseHandler = createReleaseHandler({
    config,
    state,
    githubDownload,
    logger: logger.child({ module: "release" }),
  });

  let releaseQueue = Promise.resolve();
  function enqueueRelease(payload) {
    releaseQueue = releaseQueue
      .then(() => releaseHandler.handle(payload))
      .catch((err) => {
        logger.child({ module: "release" }).error({ err }, "Release handler failed");
      });
    return releaseQueue;
  }

  const webhookrelay = createWebhookrelayClient({
    config,
    onRelease: (payload) => {
      enqueueRelease(payload);
    },
    logger: logger.child({ module: "webhookrelay" }),
  });

  const app = createApp({
    config,
    state,
    logger: logger.child({ module: "http" }),
    webhookrelay,
    githubDownload,
    enqueueRelease,
  });

  const server = app.listen(config.httpPort, "0.0.0.0", () => {
    logger.info({ port: config.httpPort }, "HTTP server listening");
  });

  webhookrelay.start();

  const shutdown = (signal) => {
    logger.info({ signal }, "Shutting down");
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending <= 0) process.exit(0);
    };
    server.close((err) => {
      if (err) logger.warn({ err }, "Error closing HTTP server");
      done();
    });
    webhookrelay.stop().finally(done);
    setTimeout(() => {
      logger.warn("Forced exit after shutdown timeout");
      process.exit(1);
    }, 8000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    process.exit(1);
  });
  process.on("unhandledRejection", (err) => {
    logger.error({ err }, "Unhandled promise rejection");
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
