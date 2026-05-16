"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const MAX_REDIRECTS = 5;
const DEFAULT_RETRIES = 4;
const DEFAULT_REPO = "Shaffer-Softworks/RPI";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  const msg = `${err?.message || ""} ${err?.cause?.message || ""}`;
  return /fetch failed|SSL|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|alert internal error|ENOTFOUND/i.test(
    msg
  );
}

async function withRetry(fn, { retries = DEFAULT_RETRIES, baseDelayMs = 400, logger, label }) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !isRetryableError(err)) throw err;
      const delay = baseDelayMs * 2 ** attempt;
      logger?.warn({ err: err.message, attempt: attempt + 1, delay, label }, "Retrying after transient error");
      await sleep(delay);
    }
  }
  throw lastErr;
}

function requestStream(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      parsed,
      {
        method: "GET",
        headers,
        timeout: 120_000,
      },
      (res) => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          stream: res,
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out for ${url}`));
    });
    req.on("error", reject);
    req.end();
  });
}

async function followRequest(url, headers, { logger } = {}) {
  let current = url;
  let hdrs = { ...headers };
  let redirects = 0;

  for (;;) {
    const { statusCode, headers: resHeaders, stream } = await withRetry(
      () => requestStream(current, hdrs),
      { logger, label: `GET ${current}` }
    );

    if (statusCode >= 300 && statusCode < 400 && resHeaders.location) {
      if (redirects >= MAX_REDIRECTS) {
        stream.resume();
        throw new Error(`Too many redirects (${redirects}) for ${url}`);
      }
      const next = new URL(resHeaders.location, current).toString();
      const fromGithubApi =
        new URL(current).hostname.endsWith("api.github.com") &&
        !new URL(next).hostname.endsWith("api.github.com");
      if (fromGithubApi) {
        hdrs = { ...hdrs };
        delete hdrs.Authorization;
        delete hdrs.authorization;
      }
      stream.resume();
      current = next;
      redirects += 1;
      continue;
    }

    if (statusCode < 200 || statusCode >= 300) {
      stream.resume();
      throw new Error(`HTTP ${statusCode} for ${current}`);
    }

    return stream;
  }
}

async function readJson(url, headers, { logger } = {}) {
  const stream = await followRequest(url, headers, { logger });
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON from ${url}: ${err.message}`);
  }
}

function createGithubDownloader({ config, logger }) {
  const apkDir = path.resolve(config.paths.apkDir);
  const repo = config.github_repo || DEFAULT_REPO;

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
    const stream = await followRequest(url, headers, { logger });

    try {
      const out = fs.createWriteStream(tmpPath);
      await pipeline(stream, out);
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

  async function fetchLatestReleasePayload() {
    const apiHeaders = {
      Authorization: `token ${config.github_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "apk-update-service",
    };
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    logger.info({ repo }, "Fetching latest GitHub release");
    const release = await readJson(url, apiHeaders, { logger });
    if (!release || typeof release !== "object") {
      throw new Error("GitHub releases/latest returned unexpected payload");
    }
    return { action: "published", release };
  }

  return { fetchAsset, fetchLatestReleasePayload };
}

module.exports = { createGithubDownloader };
