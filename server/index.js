'use strict';
const path = require('node:path');
const { Store } = require('./store');
const { createApp } = require('./app');
const { mockServiceFromEnv } = require('./mockgen');
const { assistantFromEnv } = require('./assistant');

const PORT = Number(process.env.PORT) || 3000;
// Loopback only by default: the MVP has no login, so exposing it to the network is an explicit choice (HOST=0.0.0.0).
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'requests.json');
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..', 'web', 'dist');

const store = new Store(DATA_FILE).load();
const mocks = mockServiceFromEnv({ store, dataDir: path.dirname(DATA_FILE) });
mocks.resume();
const assistant = assistantFromEnv();
createApp({ store, mocks, assistant, staticDir: STATIC_DIR }).listen(PORT, HOST, () => {
  console.log(`Feature Intake running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (data: ${DATA_FILE}, ${store.list().length} requests)`);
  console.log(mocks.enabled
    ? `Mock UI generation: on (${process.env.MOCK_MODEL || 'claude-opus-5'}, effort ${process.env.MOCK_EFFORT || 'medium'})`
    : 'Mock UI generation: off (set ANTHROPIC_API_KEY, or MOCKS=on, to enable)');
  console.log(assistant.enabled
    ? `Intake assistant: on (${process.env.ASSIST_MODEL || 'claude-opus-5'}, effort ${process.env.ASSIST_EFFORT || 'low'})`
    : 'Intake assistant: off (set ANTHROPIC_API_KEY, or ASSIST=on, to enable); the form is served instead');
});
