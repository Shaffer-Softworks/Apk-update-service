"use strict";

const express = require("express");

function deriveBaseUrl(req) {
  const proto =
    (req.headers["x-forwarded-proto"] || "").toString().split(",")[0].trim() ||
    req.protocol ||
    "http";
  const host = (
    req.headers["x-forwarded-host"] ||
    req.headers.host ||
    "localhost"
  )
    .toString()
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

function buildLatestJson({ config, state, req, flavorId }) {
  const flavor = config.flavors.find((f) => f.id === flavorId);
  if (!flavor) {
    return { error: { status: 400, body: { error: "unknown_flavor", flavor: flavorId } } };
  }

  const flavorState = state.getFlavor(flavor.id);
  if (!flavorState || !flavorState.file) {
    return {
      error: {
        status: 404,
        body: { error: "no_release_for_flavor", flavor: flavor.id },
      },
    };
  }

  const base = config.download_base_url || deriveBaseUrl(req);
  const apkUrl = `${base}/api/download/${encodeURIComponent(flavorState.file)}`;

  return {
    body: {
      versionCode: state.data.versionCode != null ? Number(state.data.versionCode) : null,
      versionName: state.data.versionName || null,
      fileName: flavorState.file,
      apkUrl,
      sha256: flavorState.sha256 || "",
    },
  };
}

function createRouter({ config, state }) {
  const router = express.Router();
  router.get("/", (req, res) => {
    const flavorId = (req.query.flavor || "").toString();
    if (!flavorId) {
      return res
        .status(400)
        .json({ error: "missing_flavor", message: "Provide ?flavor=<id>" });
    }
    const { body, error } = buildLatestJson({ config, state, req, flavorId });
    if (error) return res.status(error.status).json(error.body);
    res.set("Cache-Control", "no-store");
    res.json(body);
  });
  return router;
}

module.exports = createRouter;
module.exports.buildLatestJson = buildLatestJson;
