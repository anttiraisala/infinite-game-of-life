// Builds dist/index.html: template.html with the engine, pattern library and app inlined.
// Usage: node src/build.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const inline = f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync(path.join(dir, 'template.html'), 'utf8');
html = html
  .replace('/*__ENGINE__*/', () => inline('life-engine.js'))
  .replace('/*__PATTERNS__*/', () => inline('patterns.js'))
  .replace('/*__APP__*/', () => inline('app.js'));
const out = path.join(dir, '..', 'dist', 'index.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', path.relative(process.cwd(), out), Math.round(html.length / 1024) + ' kB');
