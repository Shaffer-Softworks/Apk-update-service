"use strict";

const path = require("node:path");
const fsp = require("node:fs/promises");
const express = require("express");

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

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

  router.get("/files", async (_req, res) => {
    const baseDir = path.resolve(config.paths.apkDir);
    try {
      const names = await fsp.readdir(baseDir);
      const files = [];
      for (const name of names) {
        if (!name || !SAFE_NAME.test(name) || name === "." || name === "..") continue;
        const fullPath = path.resolve(baseDir, name);
        if (!fullPath.startsWith(baseDir + path.sep) && fullPath !== baseDir) continue;
        let st;
        try {
          st = await fsp.stat(fullPath);
        } catch {
          continue;
        }
        if (!st.isFile() || !name.toLowerCase().endsWith(".apk")) continue;
        files.push({ name, size: st.size, mtimeMs: st.mtimeMs });
      }
      files.sort((a, b) => b.mtimeMs - a.mtimeMs);
      res.json({ files });
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.json({ files: [] });
      }
      logger.error({ err }, "Admin: list APK files failed");
      res.status(500).json({ error: "list_failed", message: err.message });
    }
  });

  return router;
}

module.exports = createRouter;
