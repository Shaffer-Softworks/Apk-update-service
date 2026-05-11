"use strict";

const { findAssetForFlavor } = require("./flavors");

const VERSION_CODE_RE = /versionCode:\s*(\d+)/i;
const VERSION_NAME_RE = /versionName:\s*([\w.\-]+)/i;
const SHA256_HEX_RE = /([a-fA-F0-9]{64})/;

function extractSha256(asset) {
  if (!asset) return "";
  const candidates = [asset.digest, asset.sha256, asset.checksum, asset.sha];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const m = c.match(SHA256_HEX_RE);
    if (m) return m[1].toLowerCase();
  }
  return "";
}

function parseVersions(body) {
  if (typeof body !== "string") return { versionCode: null, versionName: null };
  const c = body.match(VERSION_CODE_RE);
  const n = body.match(VERSION_NAME_RE);
  return {
    versionCode: c ? Number(c[1]) : null,
    versionName: n ? n[1] : null,
  };
}

function extractRelease(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.release && typeof payload.release === "object") return payload.release;
  if (payload.action && payload.release) return payload.release;
  if (payload.body && payload.body.release) return payload.body.release;
  return null;
}

function createReleaseHandler({ config, state, githubDownload, logger }) {
  async function handle(payload) {
    const release = extractRelease(payload);
    if (!release) {
      logger.warn(
        { keys: payload ? Object.keys(payload) : null },
        "Webhook payload has no release object; ignoring"
      );
      return { handled: false, reason: "no_release" };
    }

    const action = payload.action || release.action;
    if (action && !["published", "released", "created", "edited"].includes(action)) {
      logger.info({ action }, "Ignoring release event (unsupported action)");
      return { handled: false, reason: "ignored_action", action };
    }

    const { versionCode, versionName } = parseVersions(release.body || "");
    if (versionCode == null || !versionName) {
      logger.warn(
        { tag: release.tag_name },
        "Release body missing versionCode/versionName; will still attempt to record assets"
      );
    } else {
      logger.info({ versionCode, versionName, tag: release.tag_name }, "Release received");
    }

    const assets = Array.isArray(release.assets) ? release.assets : [];
    if (assets.length === 0) {
      logger.warn({ tag: release.tag_name }, "Release has no assets");
      return { handled: false, reason: "no_assets" };
    }

    const results = [];
    for (const flavor of config.flavors) {
      const asset = findAssetForFlavor(assets, flavor);
      if (!asset) {
        logger.info(
          { flavor: flavor.id, pattern: flavor.filename_pattern },
          "No asset matched flavor"
        );
        results.push({ flavor: flavor.id, matched: false });
        continue;
      }

      const sha256 = extractSha256(asset);
      const assetUrl = asset.url || asset.api_url;
      if (!assetUrl || !asset.name) {
        logger.warn({ flavor: flavor.id, asset }, "Asset missing url/name");
        results.push({ flavor: flavor.id, matched: true, downloaded: false });
        continue;
      }

      try {
        const target = await githubDownload.fetchAsset({
          url: assetUrl,
          fileName: asset.name,
        });
        results.push({
          flavor: flavor.id,
          matched: true,
          downloaded: true,
          file: asset.name,
          sha256,
          path: target,
        });
        await state.update((s) => {
          if (versionCode != null) s.versionCode = versionCode;
          if (versionName) s.versionName = versionName;
          s.lastEventAt = new Date().toISOString();
          s.flavors[flavor.id] = {
            file: asset.name,
            sha256,
            assetId: asset.id || null,
            tag: release.tag_name || null,
            downloadedAt: new Date().toISOString(),
          };
        });
        logger.info(
          { flavor: flavor.id, file: asset.name, sha256: sha256.slice(0, 12) },
          "Asset downloaded and state updated"
        );
      } catch (err) {
        logger.error(
          { err, flavor: flavor.id, url: assetUrl },
          "Failed to download asset"
        );
        results.push({
          flavor: flavor.id,
          matched: true,
          downloaded: false,
          error: err.message,
        });
      }
    }

    return { handled: true, results };
  }

  return {
    handle,
    parseVersions,
    extractRelease,
    extractSha256,
  };
}

module.exports = {
  createReleaseHandler,
  parseVersions,
  extractRelease,
  extractSha256,
};
