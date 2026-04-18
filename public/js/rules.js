/**
 * rules.js — Midnight Eclipse relationship engine (browser-compatible)
 *
 * PAIR RULES
 *   1. Opposite direction
 *   2. Same direction
 *   3. Adjacent direction
 *   4. Same number, different table
 *   5. Same number, different table + opposite direction  (rare)
 *   6. Same number, different table + same direction      (rare)
 *   7. Same number, different table + adjacent direction  (upgrade)
 *   8. Anchor (table leader / isPolaris)
 *   9. Same attitude
 *  10. Same one-word answer
 *  11. Same constellation / sub-team bond
 *  12. Nomination match
 *
 * GROUP RULES
 *   A. Ascending-order table sequence starting at #1  → timecapsule unlock
 *   B. Same symbol, different tables                  → constellation convergence
 */
window.MidnightRules = (function () {

  // ─── Direction helpers (8-direction compass) ──────────────────────────────
  const OPPOSITES = { N:'S', S:'N', NE:'SW', SW:'NE', E:'W', W:'E', NW:'SE', SE:'NW' };
  const ADJACENT_MAP = {
    N:  ['NW','NE'],
    NE: ['N', 'E'],
    E:  ['NE','SE'],
    SE: ['E', 'S'],
    S:  ['SE','SW'],
    SW: ['S', 'W'],
    W:  ['SW','NW'],
    NW: ['W', 'N'],
  };

  function isOpposite(a, b) { return !!a && !!b && OPPOSITES[a] === b; }
  function isSameDir(a, b)  { return !!a && !!b && a === b; }
  function isAdjacent(a, b) { return !!a && !!b && (ADJACENT_MAP[a] || []).includes(b); }
  function diffTable(a, b)  { return !!a.table && !!b.table && a.table !== b.table; }

  // ─── Name matcher (fuzzy first-name + aliases) ─────────────────────────────
  function namesMatch(a, b) {
    if (!a || !b) return false;
    const norm = s => String(s).toLowerCase().trim();
    const A = norm(a), B = norm(b);
    if (!A || !B) return false;
    if (A === B) return true;
    const fA = A.split(/\s+/)[0], fB = B.split(/\s+/)[0];
    if (fA === fB) return true;
    const alias = {
      ani: 'anirudh', anirudh: 'ani',
      maca: 'macarena', macarena: 'maca',
      rishab: 'rishabh', rishabh: 'rishab',
    };
    if (alias[fA] === fB || alias[fB] === fA) return true;
    const tA = A.split(/\s+/), tB = B.split(/\s+/);
    return tA.some(t => t === fB) || tB.some(t => t === fA);
  }

  // ─── Nomination cross-check ────────────────────────────────────────────────
  function nominationMatches(cardA, cardB) {
    const out = [];
    const check = (nom, target) => {
      if (!nom.nominations) return;
      for (const [cat, name] of Object.entries(nom.nominations)) {
        if (name && namesMatch(name, target.name)) {
          out.push({ category: cat, nominator: nom, nominee: target });
        }
      }
    };
    check(cardA, cardB);
    check(cardB, cardA);
    return out;
  }

  // ─── One-word normaliser ───────────────────────────────────────────────────
  function normWord(s) { return s ? String(s).toLowerCase().trim() : ''; }

  // ══════════════════════════════════════════════════════════════════════════
  // PAIR EVALUATION
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * evaluate(cardA, cardB, connections)
   * Returns { rules[], strength, headline, isDirectNeighbor, isDirectionPair }
   * strength: 'low' | 'mid' | 'upgrade' | 'rare' | 'legendary'
   */
  function evaluate(cardA, cardB, connections) {
    const results = [];
    const sameSymbol = cardA.symbol === cardB.symbol;
    const diffTbl    = diffTable(cardA, cardB);
    const connA      = connections?.[cardA.id] || {};

    // ── 1. Direct table neighbor ───────────────────────────────────────────
    const isDirectNeighbor = (connA.tableNeighbors || []).includes(cardB.id);
    if (isDirectNeighbor) {
      results.push({
        rule: 'DIRECT_NEIGHBOR', strength: 'mid',
        label: 'Table Bond',
        text: `${cardA.name} and ${cardB.name} sit side by side — a direct link in the constellation.`,
      });
    }

    // ── 2. Opposite direction ──────────────────────────────────────────────
    if (isOpposite(cardA.direction, cardB.direction)) {
      results.push({
        rule: 'OPPOSITE_DIRECTION', strength: 'mid',
        label: 'Polar Tension',
        text: `${cardA.direction} meets ${cardB.direction} — opposing bearings form a polar axis.`,
      });
    }

    // ── 3. Same direction ──────────────────────────────────────────────────
    if (isSameDir(cardA.direction, cardB.direction)) {
      results.push({
        rule: 'SAME_DIRECTION', strength: 'low',
        label: 'Aligned Bearing',
        text: `Both traveling ${cardA.direction} — same vector, same momentum.`,
      });
    }

    // ── 4. Adjacent direction ──────────────────────────────────────────────
    if (isAdjacent(cardA.direction, cardB.direction)) {
      results.push({
        rule: 'ADJACENT_DIRECTION', strength: 'low',
        label: 'Near-Parallel',
        text: `${cardA.direction} and ${cardB.direction} — adjacent currents crossing paths.`,
      });
    }

    // ── 5–7. Same number + different table (core cross-table mechanic) ─────
    if (cardA.number === cardB.number && diffTbl) {
      // Base: same number, different table
      results.push({
        rule: 'SAME_NUMBER_DIFF_TABLE', strength: 'mid',
        label: 'Mirror Node',
        text: `Node ${cardA.number} appears at two different tables — a cross-room echo.`,
      });

      // + opposite direction → rare
      if (isOpposite(cardA.direction, cardB.direction)) {
        results.push({
          rule: 'SAME_NUM_DIFF_TABLE_OPPOSITE', strength: 'rare',
          label: 'Eclipse Pair',
          text: `Node ${cardA.number}, polar opposites across the room — the rarest alignment.`,
        });
      }

      // + same direction → rare
      if (isSameDir(cardA.direction, cardB.direction)) {
        results.push({
          rule: 'SAME_NUM_DIFF_TABLE_SAME_DIR', strength: 'rare',
          label: 'Perfect Resonance',
          text: `Node ${cardA.number}, same bearing at different tables — twin signals in the sky.`,
        });
      }

      // + adjacent direction → upgrade
      if (isAdjacent(cardA.direction, cardB.direction)) {
        results.push({
          rule: 'SAME_NUM_DIFF_TABLE_ADJACENT', strength: 'upgrade',
          label: 'Near-Harmonic',
          text: `Node ${cardA.number}, perpendicular bearings — close but not quite symmetric.`,
        });
      }
    }

    // ── 8. Anchor (table leader) ───────────────────────────────────────────
    const bothAnchor = cardA.leader && cardB.leader;
    const oneAnchor  = !bothAnchor && (cardA.leader || cardB.leader);
    const anchorNode = cardA.leader ? cardA : cardB;

    if (bothAnchor) {
      results.push({
        rule: 'DUAL_ANCHOR', strength: 'legendary',
        label: 'Dual Anchor',
        text: `${cardA.name} and ${cardB.name} — two anchors meeting. Every connection between them is amplified.`,
      });
    } else if (oneAnchor) {
      results.push({
        rule: 'ANCHOR_CONTACT', strength: 'upgrade',
        label: 'Anchor Contact',
        text: `${anchorNode.name} is a table anchor — they amplify every connection they touch.`,
      });
    }

    // ── 9. Same attitude ───────────────────────────────────────────────────
    if (cardA.attitude && cardB.attitude && cardA.attitude === cardB.attitude) {
      results.push({
        rule: 'SHARED_ATTITUDE', strength: 'low',
        label: 'Shared Energy',
        text: `Both bring "${cardA.attitude}" energy — instant resonance.`,
      });
    }

    // ── 10. Same one-word answer ───────────────────────────────────────────
    const wA = normWord(cardA.oneWord), wB = normWord(cardB.oneWord);
    if (wA && wA === wB) {
      results.push({
        rule: 'SAME_ONEWORD', strength: 'upgrade',
        label: 'One Word',
        text: `Both answered "${cardA.oneWord}" — the same word, across the whole room.`,
      });
    }

    // ── 11. Same constellation / sub-team bond ─────────────────────────────
    if (sameSymbol) {
      results.push({
        rule: 'SAME_CONSTELLATION', strength: 'low',
        label: 'Constellation Bond',
        text: `Both ${cardA.symbol} — teammates recognize each other across the night.`,
      });
      // Internal tension: same team, opposite direction
      if (isOpposite(cardA.direction, cardB.direction)) {
        results.push({
          rule: 'CONSTELLATION_TENSION', strength: 'upgrade',
          label: 'Internal Tension',
          text: `${cardA.symbol} internal opposition — tension that sharpens the whole constellation.`,
        });
      }
    }

    // ── 12. Nomination match ───────────────────────────────────────────────
    const noms = nominationMatches(cardA, cardB);
    const catLabels = {
      mvp: 'MVP', trust: 'TRUST', gemini: 'GEMINI',
      polaris: 'POLARIS', mentee: 'MENTEE', mentor: 'MENTOR',
    };
    for (const m of noms) {
      const isPolarisCat = m.category === 'polaris';
      results.push({
        rule: 'NOMINATION_MATCH', strength: isPolarisCat ? 'rare' : 'upgrade',
        label: `${catLabels[m.category] || m.category} Nomination`,
        text: `${m.nominator.name} named ${m.nominee.name} for ${catLabels[m.category] || m.category}. Recognition echoes between them.`,
      });
    }

    // ── Plus-one bond ──────────────────────────────────────────────────────
    const aIsB = cardA.plusOneOf && namesMatch(cardA.plusOneOf, cardB.name);
    const bIsA = cardB.plusOneOf && namesMatch(cardB.plusOneOf, cardA.name);
    if (aIsB || bIsA) {
      results.push({
        rule: 'PLUS_ONE_BOND', strength: 'mid',
        label: 'Host & Companion',
        text: `You came together — a paired orbit.`,
      });
    }

    // ── Compute overall strength ───────────────────────────────────────────
    const strengthOrder = ['legendary', 'rare', 'upgrade', 'mid', 'low'];
    let topStrength = 'low';
    for (const s of strengthOrder) {
      if (results.some(r => r.strength === s)) { topStrength = s; break; }
    }

    // ── Headline ───────────────────────────────────────────────────────────
    let headline = '';
    if      (topStrength === 'legendary') headline = '✦ DUAL ANCHOR CONTACT';
    else if (topStrength === 'rare')      headline = '◉ RARE ALIGNMENT';
    else if (topStrength === 'upgrade')   headline = '↑ CONSTELLATION UPGRADE';
    else if (topStrength === 'mid')       headline = '~ SIGNAL DETECTED';
    else                                  headline = '· NODE CONTACT';

    const isDirectionPair = (connA.directionPairs || []).includes(cardB.id);

    return { rules: results, strength: topStrength, headline, isDirectNeighbor, isDirectionPair };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GROUP EVALUATION
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * evaluateGroup(cards)
   * cards: array of card objects currently in the group (scanned together)
   *
   * Returns { sequences[], crossTable[] }
   *
   * sequences: per-table ascending runs starting at node 1
   *   { table, cards[], numbers[], length, complete, unlocked, strength, label, text }
   *
   * crossTable: same-symbol members from different tables converging
   *   { symbol, cards[], tables[], strength, label, text }
   */
  function evaluateGroup(cards) {
    const sequences = [];
    const crossTable = [];

    // ── A. Per-table ascending sequence starting at #1 ─────────────────────
    // Group cards by table
    const byTable = {};
    for (const c of cards) {
      const t = c.table || 'unknown';
      if (!byTable[t]) byTable[t] = [];
      byTable[t].push(c);
    }

    for (const [table, tableCards] of Object.entries(byTable)) {
      if (tableCards.length < 2) continue;

      // Sort by number ascending
      const sorted = [...tableCards].sort((a, b) => a.number - b.number);
      const nums = sorted.map(c => c.number);

      // Must include node 1
      if (nums[0] !== 1) continue;

      // Find the longest consecutive run from 1
      let runLen = 1;
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] === nums[i - 1] + 1) runLen++;
        else break;
      }
      if (runLen < 2) continue;

      const runCards = sorted.slice(0, runLen);
      const runNums  = nums.slice(0, runLen);

      // How many total seats at this table?
      // We don't know without the full roster, so flag complete if all scanned are consecutive
      const allConsecutive = runLen === tableCards.length;
      const strength = runLen >= 5 ? 'rare' : runLen >= 3 ? 'upgrade' : 'mid';

      sequences.push({
        table,
        cards:    runCards,
        numbers:  runNums,
        length:   runLen,
        complete: allConsecutive && runLen >= 4, // treat ≥4 as "unlocked"
        unlocked: runLen >= 4,
        strength,
        label:    `${table.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Timecapsule`,
        text:     runLen >= 4
          ? `Nodes ${runNums.join('→')} in ascending order — the timecapsule is unlocked.`
          : `Nodes ${runNums.join('→')} in sequence — keep going to unlock the timecapsule.`,
      });
    }

    // ── B. Same symbol, different tables (cross-table constellation) ────────
    const bySymbol = {};
    for (const c of cards) {
      const sym = c.symbol || c.constellation || '?';
      if (!bySymbol[sym]) bySymbol[sym] = [];
      bySymbol[sym].push(c);
    }

    for (const [symbol, symCards] of Object.entries(bySymbol)) {
      if (symCards.length < 2) continue;
      const tables = [...new Set(symCards.map(c => c.table))];
      if (tables.length < 2) continue; // all at same table — skip

      const strength = symCards.length >= 4 ? 'rare' : 'upgrade';
      crossTable.push({
        symbol,
        cards:    symCards,
        tables,
        strength,
        label:    `${symbol} Constellation Convergence`,
        text:     `${symbol} members from ${tables.length} different tables — the constellation reunites across the room.`,
      });
    }

    return { sequences, crossTable };
  }

  return { evaluate, evaluateGroup, namesMatch };
})();
