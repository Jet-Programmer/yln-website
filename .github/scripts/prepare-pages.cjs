const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const site = path.join(root, '_site');
fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(site, { recursive: true });

function copy(source, destination = source) {
  const from = path.join(root, source);
  const to = path.join(site, destination);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

for (const page of ['index.html','about.html','opportunities.html','projects.html','partnerships.html','join.html','contact.html','donate.html']) copy(page);
for (const directory of ['assets','css','js']) copy(directory);
for (const file of ['index.html','styles.css','app.js','moisture-ai.js']) copy(`projects/ai4climate/${file}`);
for (const file of ['evaluation.json','moisture-model.json']) copy(`projects/ai4climate/models/${file}`);
fs.writeFileSync(path.join(site, '.nojekyll'), '');
