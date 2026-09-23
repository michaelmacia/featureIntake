'use strict';
/* Loads test-data/seed.json into the data file. Usage: npm run seed */
const path = require('node:path');
const { Store } = require('./store');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'requests.json');
const seed = require('../test-data/seed.json');

new Store(DATA_FILE).load().replaceAll(seed).then(() => {
  console.log(`Seeded ${seed.length} requests into ${DATA_FILE}`);
});
