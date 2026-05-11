"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const EMPTY_STATE = Object.freeze({
  versionCode: null,
  versionName: null,
  lastEventAt: null,
  flavors: {},
});

function emptyState() {
  return { ...EMPTY_STATE, flavors: {} };
}

class State {
  constructor({ stateFile, logger }) {
    this.stateFile = stateFile;
    this.logger = logger;
    this.data = emptyState();
    this._writeLock = Promise.resolve();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.stateFile, "utf8");
      const parsed = JSON.parse(raw);
      this.data = { ...emptyState(), ...parsed };
      if (!this.data.flavors || typeof this.data.flavors !== "object") {
        this.data.flavors = {};
      }
      this.logger?.info(
        { versionCode: this.data.versionCode, versionName: this.data.versionName },
        "Loaded existing state"
      );
    } catch (err) {
      if (err.code === "ENOENT") {
        this.logger?.info("No state file yet, starting empty");
        this.data = emptyState();
      } else {
        this.logger?.warn({ err }, "Failed to load state file, starting empty");
        this.data = emptyState();
      }
    }
    return this.data;
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.data));
  }

  getFlavor(id) {
    return this.data.flavors[id] || null;
  }

  async update(mutator) {
    this._writeLock = this._writeLock
      .catch(() => undefined)
      .then(async () => {
        const next = JSON.parse(JSON.stringify(this.data));
        const ret = await mutator(next);
        const updated = ret === undefined ? next : ret;
        await this._persist(updated);
        this.data = updated;
        return updated;
      });
    return this._writeLock;
  }

  async _persist(data) {
    const dir = path.dirname(this.stateFile);
    await fsp.mkdir(dir, { recursive: true });
    const tmp = `${this.stateFile}.${process.pid}.${Date.now()}.tmp`;
    const json = `${JSON.stringify(data, null, 2)}\n`;
    await fsp.writeFile(tmp, json, "utf8");
    await fsp.rename(tmp, this.stateFile);
  }
}

module.exports = { State, emptyState };
