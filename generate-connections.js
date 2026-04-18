/**
 * generate-connections.js
 * Run: node generate-connections.js
 * Produces: data/connections.json
 *
 * For each card, records:
 *   tableNeighbors   — the two people physically adjacent at the same table (circular)
 *   directionPairs   — all cards with an opposite bearing (N↔S, E↔W) across the whole event
 *   tableName        — which of the 7 tables this card sits at
 *   seatIndex        — position around the table (0-based, clockwise)
 */

const fs   = require('fs');
const path = require('path');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/cards.json'), 'utf8'));

// ─── Seating order per table (card IDs in the order the user listed them) ────
// These match the order cards appear in cards.json, grouped by table.
const TABLE_ORDER = {
  'top-left':     range(1,  9),   // card_001 – card_009
  'top-center':   range(10, 19),  // card_010 – card_019
  'top-right':    range(20, 29),  // card_020 – card_029
  'middle':       range(30, 39),  // card_030 – card_039
  'bottom-left':  range(40, 48),  // card_040 – card_048
  'bottom-middle':range(49, 55),  // card_049 – card_055
  'bottom-right': range(56, 65),  // card_056 – card_065
};

function range(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(`card_${String(i).padStart(3,'0')}`);
  return out;
}

// ─── Direction opposites (8-direction compass) ────────────────────────────────
const OPPOSITES = { N:'S', S:'N', NE:'SW', SW:'NE', E:'W', W:'E', NW:'SE', SE:'NW' };

function isOpposite(a, b) { return !!a && !!b && OPPOSITES[a] === b; }

const byId = {};
cards.forEach(c => byId[c.id] = c);

// ─── Build connection map ─────────────────────────────────────────────────────
const connections = {};

for (const [tableName, seats] of Object.entries(TABLE_ORDER)) {
  const n = seats.length;

  seats.forEach((cardId, i) => {
    const card = byId[cardId];
    if (!card) return;

    // Circular table neighbours
    const prev = seats[(i - 1 + n) % n];
    const next = seats[(i + 1) % n];

    // Direction pairs (global scan — done after this loop)
    connections[cardId] = {
      tableName,
      seatIndex: i,
      tableSeats: seats,
      tableNeighbors: [prev, next].filter(id => id !== cardId),
      directionPairs: [],  // filled below
    };
  });
}

// Fill direction pairs globally
cards.forEach(cardA => {
  cards.forEach(cardB => {
    if (cardA.id === cardB.id) return;
    if (!cardA.direction || !cardB.direction) return;
    if (isOpposite(cardA.direction, cardB.direction)) {
      if (!connections[cardA.id].directionPairs.includes(cardB.id)) {
        connections[cardA.id].directionPairs.push(cardB.id);
      }
    }
  });
});

// ─── Write output ─────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, 'data/connections.json');
fs.writeFileSync(outPath, JSON.stringify(connections, null, 2));

const totalPairs = Object.values(connections).reduce((s, c) => s + c.directionPairs.length, 0);
console.log(`✓ connections.json written`);
console.log(`  ${Object.keys(connections).length} cards`);
console.log(`  ${Object.values(connections).reduce((s, c) => s + c.tableNeighbors.length, 0)} table-neighbor links`);
console.log(`  ${totalPairs} direction-pair links`);
