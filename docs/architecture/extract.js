'use strict';
/* Extracts ```mermaid blocks from the Confluence pages into standalone .mmd files.
 * Run: node docs/architecture/extract.js
 * Render: npx -y @mermaid-js/mermaid-cli -i docs/architecture/<name>.mmd -o <name>.svg */
const fs = require('node:fs');
const path = require('node:path');

const SOURCES = {
  '02-solution-architecture.md': ['01-system-context', '02-mvp-containers', '03-seq-submit-request', '04-seq-triage-decision', '05-request-lifecycle', '06-target-architecture', '07-deployment-pipeline'],
  '04-data-model.md': ['08-erd-phase2'],
};

for (const [page, names] of Object.entries(SOURCES)) {
  const md = fs.readFileSync(path.join(__dirname, '..', 'confluence', page), 'utf8');
  const blocks = [...md.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (blocks.length !== names.length) throw new Error(`${page}: expected ${names.length} diagrams, found ${blocks.length}`);
  blocks.forEach((b, i) => fs.writeFileSync(path.join(__dirname, `${names[i]}.mmd`), b));
  console.log(`${page}: ${blocks.length} diagrams`);
}
