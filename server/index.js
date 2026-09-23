'use strict';
const path = require('node:path');
const { Store } = require('./store');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'requests.json');

const store = new Store(DATA_FILE).load();
createApp({ store }).listen(PORT, () => {
  console.log(`Feature Intake running at http://localhost:${PORT}  (data: ${DATA_FILE}, ${store.list().length} requests)`);
});
