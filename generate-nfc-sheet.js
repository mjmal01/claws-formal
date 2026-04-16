/**
 * generate-nfc-sheet.js
 * Run: node generate-nfc-sheet.js [BASE_URL]
 * Example: node generate-nfc-sheet.js https://claws-midnight-eclipse.railway.app
 *
 * Outputs an HTML file you can print or screenshot.
 */

const fs   = require('fs');
const path = require('path');

const BASE_URL = process.argv[2] || `http://localhost:3000`;
const cards    = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/cards.json'), 'utf8'));

const CONST_COLORS = {
  IRIS:       '#6c8ef5',
  NOVA:       '#f5a26c',
  VEGA:       '#6cf5c8',
  CORVUS:     '#f56c6c',
  HOSHI:      '#c86cf5',
  AURA:       '#6cf576',
  PROMETHEUS: '#f5e26c',
  ATLAS:      '#6cc8f5',
};

const rows = cards.map(c => {
  const url   = `${BASE_URL}/?card=${c.id}`;
  const color = CONST_COLORS[c.constellation] || '#6c8ef5';
  return `
    <tr>
      <td class="chip-num">${c.id.replace('card_','#')}</td>
      <td><strong>${c.name}</strong></td>
      <td><span class="const-badge" style="background:${color}22;color:${color};border-color:${color}55">${c.constellation}</span></td>
      <td class="mono">Node ${c.number} · ${c.direction}${c.isPolaris ? ' ◉' : ''}</td>
      <td class="url-cell"><code>${url}</code></td>
    </tr>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Midnight Eclipse — NFC URL Sheet</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, sans-serif;
      font-size: 12px;
      padding: 20px;
      background: #fff;
      color: #111;
    }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
    .base-url { font-family: monospace; background: #f0f0f0; padding: 4px 8px; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th {
      background: #111; color: #fff; text-align: left;
      padding: 8px 10px; font-size: 10px; letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: middle; }
    tr:nth-child(even) td { background: #fafafa; }
    .chip-num { font-family: monospace; color: #888; font-size: 10px; }
    .mono { font-family: monospace; font-size: 10px; }
    .url-cell { max-width: 400px; word-break: break-all; }
    .url-cell code { font-size: 10px; color: #0066cc; }
    .const-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 100px;
      font-size: 10px;
      font-weight: 700;
      border: 1px solid;
      letter-spacing: 0.05em;
    }
    @media print {
      .url-cell code { color: #000; }
      body { padding: 10px; }
    }
  </style>
</head>
<body>
  <h1>🌑 Midnight Eclipse — NFC URL Sheet</h1>
  <div class="meta">
    Base URL: <span class="base-url">${BASE_URL}</span> &nbsp;|&nbsp; ${cards.length} cards &nbsp;|&nbsp; Generated ${new Date().toLocaleString()}
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Name</th>
        <th>Constellation</th>
        <th>Card Attrs</th>
        <th>NFC URL (program this on each chip)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

const outFile = path.join(__dirname, 'nfc-urls.html');
fs.writeFileSync(outFile, html);
console.log(`\n✅ NFC sheet written to: ${outFile}`);
console.log(`   ${cards.length} cards — base URL: ${BASE_URL}\n`);
console.log('Open nfc-urls.html in your browser to print or copy URLs.\n');
