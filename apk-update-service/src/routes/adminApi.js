"use strict";

const express = require("express");

function createRouter({ config, state, logger, webhookrelay }) {
  const router = express.Router();
  router.use(express.json({ limit: "256kb" }));

  router.get("/state", (_req, res) => {
    res.json({
      state: state.snapshot(),
      flavors: config.flavors.map((f) => ({
        id: f.id,
        filename_pattern: f.filename_pattern,
        package_name: f.package_name || null,
      })),
      webhookrelay: webhookrelay.status(),
      paths: {
        apkDir: config.paths.apkDir,
        stateFile: config.paths.stateFile,
      },
      downloadBaseUrl: config.download_base_url || null,
    });
  });

  router.post("/refresh", (_req, res) => {
    logger.info("Admin: webhookrelay reconnect requested");
    webhookrelay.reconnect();
    res.json({ ok: true });
  });

  return router;
}

module.exports = createRouter;
