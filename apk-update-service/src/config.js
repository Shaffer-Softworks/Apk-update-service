"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const flavorSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9_-]+$/, "flavor id must be url-safe (letters, digits, _ or -)"),
  filename_pattern: z.string().min(1),
  package_name: z.string().optional(),
});

const optionsSchema = z.object({
  webhookrelay: z.object({
    key: z.string().min(1, "webhookrelay.key is required"),
    secret: z.string().min(1, "webhookrelay.secret is required"),
    bucket: z.string().min(1, "webhookrelay.bucket is required"),
  }),
  github_token: z.string().min(1, "github_token is required"),
  download_base_url: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().replace(/\/+$/, "") : "")),
  flavors: z.array(flavorSchema).min(1, "at least one flavor must be configured"),
  log_level: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

function loadConfig({ optionsFile = process.env.OPTIONS_FILE || "/data/options.json" } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(optionsFile, "utf8");
  } catch (err) {
    throw new Error(`Failed to read options file at ${optionsFile}: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Options file ${optionsFile} is not valid JSON: ${err.message}`);
  }

  const result = optionsSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid addon options:\n${issues}`);
  }

  const compiled = result.data.flavors.map((f) => ({
    ...f,
    pattern: new RegExp(f.filename_pattern, "i"),
  }));

  const ids = new Set();
  for (const f of compiled) {
    if (ids.has(f.id)) {
      throw new Error(`Duplicate flavor id in options: ${f.id}`);
    }
    ids.add(f.id);
  }

  return {
    ...result.data,
    flavors: compiled,
    paths: {
      optionsFile,
      apkDir: process.env.APK_DIR || "/data/apks",
      stateFile: process.env.STATE_FILE || "/data/state.json",
    },
    httpPort: Number(process.env.PORT || 8099),
  };
}

module.exports = { loadConfig, optionsSchema };
