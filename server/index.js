'use strict';
const path = require('node:path');
const { Store } = require('./store');
const { createApp } = require('./app');
const { mockServiceFromEnv } = require('./mockgen');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'requests.json');

const store = new Store(DATA_FILE).load();
const mocks = mockServiceFromEnv({ store, dataDir: path.dirname(DATA_FILE) });
mocks.resume();
createApp({ store, mocks }).listen(PORT, () => {
  console.log(`Feature Intake running at http://localhost:${PORT}  (data: ${DATA_FILE}, ${store.list().length} requests)`);
  console.log(mocks.enabled
    ? `Mock UI generation: on (${process.env.MOCK_MODEL || 'claude-opus-5'}, effort ${process.env.MOCK_EFFORT || 'medium'})`
    : 'Mock UI generation: off (set ANTHROPIC_API_KEY, or MOCKS=on, to enable)');
});
