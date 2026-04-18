const { isOpposite, isSame, isAdjacent } = require('./directions');

/**
 * Evaluate interaction between two cards.
 * Returns array of triggered rule objects: { rule, strength, description, ledHint }
 *
 * Strength levels: 'low' | 'mid' | 'upgrade' | 'rare'
 * ledHint: what LED behavior to trigger
 */
function evaluatePair(cardA, cardB) {
  const results = [];
  const sameConstellation = cardA.constellation === cardB.constellation;

  // ─── DIRECTION RULES ───────────────────────────────────────────────────────

  if (isOpposite(cardA.direction, cardB.direction)) {
    results.push({
      rule: 'OPPOSITE_DIRECTION',
      strength: 'mid',
      description: 'Opposing bearings attract — polar tension detected.',
      
    });
  } else if (isSame(cardA.direction, cardB.direction)) {
    results.push({
      rule: 'SAME_DIRECTION',
      strength: 'low',
      description: 'Aligned bearing — traveling the same vector.',
     
    });
  } else if (isAdjacent(cardA.direction, cardB.direction)) {
    results.push({
      rule: 'ADJACENT_DIRECTION',
      strength: 'low',
      description: 'Adjacent currents — near-parallel paths.',
     
    });
  }

  // ─── NUMBER + DIRECTION COMBOS ─────────────────────────────────────────────

  if (cardA.number === cardB.number) {
    if (isSame(cardA.direction, cardB.direction)) {
      results.push({
        rule: 'SAME_NUMBER_SAME_DIRECTION',
        strength: 'rare',
        description: 'Perfect resonance — same node, same bearing. Rare alignment.',
        ledHint: 'RARE_BURST',
      });
    } else if (isOpposite(cardA.direction, cardB.direction)) {
      results.push({
        rule: 'SAME_NUMBER_OPPOSITE_DIRECTION',
        strength: 'rare',
        description: 'Mirror nodes — equal and opposite. Rare resonance.',
        ledHint: 'RARE_BURST',
      });
    } else if (isAdjacent(cardA.direction, cardB.direction)) {
      results.push({
        rule: 'SAME_NUMBER_ADJACENT_DIRECTION',
        strength: 'mid',
        description: 'Near-harmonic match — same node, perpendicular bearing.',
        ledHint: 'PAIR_FLASH',
      });
    }

    // Mirror node: same number, different constellation
    if (!sameConstellation) {
      results.push({
        rule: 'MIRROR_NODE',
        strength: 'mid',
        description: `Node ${cardA.number} echoes across ${cardA.constellation} and ${cardB.constellation}.`,
        ledHint: 'PAIR_FLASH',
      });
    }
  }

  // ─── ECLIPSE ALIGNMENT — cross-constellation rare combo ───────────────────
  // Different constellation + opposing direction + consecutive numbers
  if (
    !sameConstellation &&
    isOpposite(cardA.direction, cardB.direction) &&
    Math.abs(cardA.number - cardB.number) === 1
  ) {
    results.push({
      rule: 'ECLIPSE_ALIGNMENT',
      strength: 'rare',
      description: `Eclipse alignment — ${cardA.constellation} and ${cardB.constellation} form a cross-stellar arc.`,
      ledHint: 'ECLIPSE_PULSE',
    });
  }

  


  // ─── CSV-DERIVED: SHARED ATTITUDE / ROLE FLAVOR ────────────────────────────
  if (cardA.attitude && cardB.attitude && cardA.attitude === cardB.attitude) {
    results.push({
      rule: 'SHARED_ATTITUDE',
      strength: 'low',
      description: `Both bring a ${cardA.attitude} energy — resonance confirmed.`,
      ledHint: 'PAIR_GLOW',
    });
  }
  if (cardA.role && cardB.role && cardA.role === cardB.role && !sameConstellation) {
    results.push({
      rule: 'CROSS_ROLE_ECHO',
      strength: 'low',
      description: `Two ${cardA.role}s across different constellations — parallel craft.`,
      ledHint: 'PAIR_GLOW',
    });
  }

  // ─── POLARIS BONUS ─────────────────────────────────────────────────────────

  if (cardA.isPolaris && cardB.isPolaris) {
    results.push({
      rule: 'DUAL_POLARIS',
      strength: 'rare',
      description: 'Two Polaris nodes in contact — dual anchor event.',
      ledHint: 'RARE_BURST',
    });
  } else if (cardA.isPolaris || cardB.isPolaris) {
    results.push({
      rule: 'POLARIS_INTERACTION',
      strength: 'upgrade',
      description: 'A Polaris node amplifies the connection — combo upgraded.',
      ledHint: 'POLARIS_PULSE',
    });
  }

  // ─── SAME CONSTELLATION ────────────────────────────────────────────────────

  if (sameConstellation) {
    results.push({
      rule: 'SAME_CONSTELLATION',
      strength: 'low',
      description: `Both nodes of ${cardA.constellation} — constellation bond.`,
      ledHint: 'PAIR_GLOW',
    });

    // Same constellation + opposite directions = constellation tension
    if (isOpposite(cardA.direction, cardB.direction)) {
      results.push({
        rule: 'CONSTELLATION_TENSION',
        strength: 'upgrade',
        description: `${cardA.constellation} internal opposition — tension within the constellation.`,
        ledHint: 'PAIR_FLASH',
      });
    }
  }

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Loose name match — compares first-name tokens case-insensitively,
 *  tolerates nicknames (Ani/Anirudh, Maca/Macarena, etc.). */
function namesMatch(a, b) {
  if (!a || !b) return false;
  const norm = s => String(s).toLowerCase().trim();
  const A = norm(a), B = norm(b);
  if (!A || !B) return false;
  if (A === B) return true;
  const firstA = A.split(/\s+/)[0];
  const firstB = B.split(/\s+/)[0];
  if (firstA === firstB) return true;
  // nickname pairs seen in CSV
  const alias = {
    ani: 'anirudh', anirudh: 'ani',
    maca: 'macarena', macarena: 'maca',
    somya: 'somya',
    ian: 'ian',
    rishab: 'rishabh', rishabh: 'rishab',
  };
  if (alias[firstA] === firstB || alias[firstB] === firstA) return true;
  // word-boundary containment (e.g. "Molly" as a token inside "Molly Maloney")
  const tokensA = A.split(/\s+/);
  const tokensB = B.split(/\s+/);
  if (tokensA.some(t => t === firstB) || tokensB.some(t => t === firstA)) return true;
  return false;
}

/** Returns every category in which one card's nominations reference the other. */
function nominationMatches(a, b) {
  const out = [];
  const check = (nominator, nominee) => {
    if (!nominator.nominations) return;
    for (const [category, nominated] of Object.entries(nominator.nominations)) {
      if (!nominated) continue;
      if (namesMatch(nominated, nominee.name)) {
        out.push({ category, nominator, nominee });
      }
    }
  };
  check(a, b);
  check(b, a);
  return out;
}

module.exports = { evaluatePair, namesMatch, nominationMatches };
