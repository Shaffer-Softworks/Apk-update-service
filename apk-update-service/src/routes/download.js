"use strict";

const path = require("node:path");
const fs = require("node:fs");
const express = require("express");

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function createRouter({ config, logger }) {
  const router = express.Router();
  const baseDir = path.resolve(config.paths.apkDir);

  router.get("/:file", (req, res) => {
    const file = req.params.file || "";

    if (!file || !SAFE_NAME.test(file) || file === "." || file === "..") {
      logger.warn({ file }, "Rejected download for unsafe filename");
      return res.status(400).json({ error: "bad_filename" });
    }

    const fullPath = path.resolve(baseDir, file);
    if (!fullPath.startsWith(baseDir + path.sep) && fullPath !== baseDir) {
      logger.warn({ file, fullPath }, "Rejected download outside APK dir");
      return res.status(400).json({ error: "bad_filename" });
    }

    fs.stat(fullPath, (err, stat) => {
      if (err || !stat.isFile()) {
        return res.status(404).json({ error: "not_found", file });
      }

      res.set("Content-Type", "application/vnd.android.package-archive");
      res.set("Content-Disposition", `attachment; filename="${file}"`);
      res.set("Content-Length", String(stat.size));
      res.set("Cache-Control", "no-store");

      const stream = fs.createReadStream(fullPath);
      stream.on("error", (streamErr) => {
        logger.error({ err: streamErr, file }, "Error streaming APK");
        if (!res.headersSent) res.status(500).end();
        else res.destroy(streamErr);
      });
      stream.pipe(res);
    });
  });

  return router;
}

module.exports = createRouter;
