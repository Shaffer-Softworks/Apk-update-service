"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const MAX_REDIRECTS = 5;

async function followFetch(url, headers, maxRedirects = MAX_REDIRECTS) {
  let current = url;
  let redirects = 0;
  for (;;) {
    const res = await fetch(current, { headers, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (redirects >= maxRedirects) {
        throw new Error(`Too many redirects (${redirects}) for ${url}`);
      }
      const next = new URL(res.headers.get("location"), current).toString();
      redirects += 1;
      const isGithubApi =
        new URL(current).hostname.endsWith("api.github.com") &&
        !new URL(next).hostname.endsWith("api.github.com");
      const forwardHeaders = { ...headers };
      if (isGithubApi) {
        delete forwardHeaders.Authorization;
        delete forwardHeaders.authorization;
      }
      try {
        res.body?.cancel?.();
      } catch (_err) {
        /* ignore */
      }
      current = next;
      headers = forwardHeaders;
      continue;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${current}`);
    }
    if (!res.body) {
      throw new Error(`No response body for ${current}`);
    }
    return res;
  }
}

function createGithubDownloader({ config, logger }) {
  const apkDir = path.resolve(config.paths.apkDir);

  async function fetchAsset({ url, fileName }) {
    if (!fileName || !SAFE_NAME.test(fileName)) {
      throw new Error(`Refusing to save unsafe filename: ${fileName}`);
    }
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error(`Invalid asset url: ${url}`);
    }

    await fsp.mkdir(apkDir, { recursive: true });
    const targetPath = path.resolve(apkDir, fileName);
    if (!targetPath.startsWith(apkDir + path.sep)) {
      throw new Error(`Resolved target path escapes APK dir: ${targetPath}`);
    }
    const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;

    const headers = {
      Authorization: `token ${config.github_token}`,
      Accept: "application/octet-stream",
      "User-Agent": "apk-update-service",
    };

    logger.info({ url, fileName }, "Downloading asset");
    const res = await followFetch(url, headers);

    try {
      const out = fs.createWriteStream(tmpPath);
      await pipeline(res.body, out);
      await fsp.rename(tmpPath, targetPath);
    } catch (err) {
      try {
        await fsp.unlink(tmpPath);
      } catch (_e) {
        /* ignore */
      }
      throw err;
    }

    const stat = await fsp.stat(targetPath);
    logger.info({ fileName, bytes: stat.size }, "Saved asset");
    return targetPath;
  }

  return { fetchAsset };
}

module.exports = { createGithubDownloader };
