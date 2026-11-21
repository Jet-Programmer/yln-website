const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const pages = ['index.html','about.html','opportunities.html','projects.html','partnerships.html','join.html','contact.html','donate.html','projects/ai4climate/index.html'];
const missing = [];
for (const page of pages) {
  const file = path.join(root, page);
  if (!fs.existsSync(file)) { missing.push(`${page}: page file missing`); continue; }
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const value = match[1].trim();
    if (!value || value.startsWith('#') || /^(?:[a-z]+:|\/\/)/i.test(value)) continue;
    const pathname = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    if (!pathname) continue;
    let target = path.resolve(root, path.dirname(page), pathname);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) missing.push(`${page}: ${value}`);
  }
}
if (missing.length) {
  console.error(`Broken local routes/assets:\n- ${missing.join('\n- ')}`);
  process.exit(1);
}
console.log(`Checked local links and assets in ${pages.length} HTML pages: all found.`);
