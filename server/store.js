'use strict';
/*
 * JSON-file repository. Keeps all requests in memory and persists atomically
 * (write temp file, then rename) behind a promise queue so writes never interleave.
 * Swap this module for a database-backed one with the same interface (see
 * docs/confluence/02-solution-architecture.md, "Persistence").
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

class Store {
  constructor(file) {
    this.file = file;
    this.data = { seq: 0, requests: [] };
    this.queue = Promise.resolve();
  }

  load() {
    if (fs.existsSync(this.file)) {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { seq: parsed.seq || 0, requests: Array.isArray(parsed.requests) ? parsed.requests : [] };
    } else {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
    }
    return this;
  }

  persist() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.queue = this.queue.then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fsp.writeFile(tmp, snapshot, 'utf8');
      await fsp.rename(tmp, this.file);
    });
    return this.queue;
  }

  nextId(now = new Date()) {
    this.data.seq += 1;
    return `FR-${now.getUTCFullYear()}-${String(this.data.seq).padStart(4, '0')}`;
  }

  list() {
    return this.data.requests;
  }

  get(id) {
    return this.data.requests.find((r) => r.id === id) || null;
  }

  async insert(record) {
    this.data.requests.push(record);
    await this.persist();
    return record;
  }

  async save() {
    await this.persist();
  }

  async replaceAll(requests) {
    this.data.requests = requests;
    this.data.seq = requests.reduce((max, r) => Math.max(max, Number(String(r.id).split('-').pop()) || 0), 0);
    await this.persist();
  }
}

module.exports = { Store };
