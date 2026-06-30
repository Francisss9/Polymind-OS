'use strict';
// Runs automatically after npm install (postinstall)
// Copies Chart.js UMD bundle to renderer/assets/js/ for offline use

const fs   = require('fs');
const path = require('path');

const src  = path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js');
const dest = path.join(__dirname, '..', 'renderer', 'assets', 'js', 'chart.umd.min.js');

fs.mkdirSync(path.dirname(dest), { recursive: true });

if (!fs.existsSync(src)) {
  console.warn('[postinstall] chart.js not found in node_modules — skipping.');
  process.exit(0);
}

fs.copyFileSync(src, dest);
console.log('[postinstall] Chart.js copied to renderer/assets/js/');
