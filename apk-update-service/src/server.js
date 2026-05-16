"use strict";

const path = require("node:path");
const express = require("express");

const latestJsonRoute = require("./routes/latestJson");
const downloadRoute = require("./routes/download");
const adminApiRoute = require("./routes/adminApi");

function createApp({ config, state, logger, webhookrelay, githubDownload, enqueueRelease }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      logger.debug(
        {
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          ms: Date.now() - start,
        },
        "http"
      );
    });
    next();
  });

  app.get("/healthz", (_req, res) => {
    res.json({
      ok: true,
      webhookrelay: webhookrelay?.status() || { connected: false },
    });
  });

  app.use("/api/latest.json", latestJsonRoute({ config, state }));
  app.use("/api/download", downloadRoute({ config, logger }));
  app.use(
    "/api/admin",
    adminApiRoute({ config, state, logger, webhookrelay, githubDownload, enqueueRelease })
  );

  const uiDir = path.resolve(__dirname, "..", "ui");
  app.use("/", express.static(uiDir, { index: "index.html", extensions: ["html"] }));

  app.use((req, res) => {
    res.status(404).json({ error: "not_found", path: req.originalUrl });
  });

  app.use((err, req, res, _next) => {
    logger.error({ err, url: req.originalUrl }, "Unhandled error");
    if (res.headersSent) return;
    res.status(500).json({ error: "internal_error", message: err.message });
  });

  return app;
}

module.exports = { createApp };
