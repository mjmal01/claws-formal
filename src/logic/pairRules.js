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
      ledHint: 'PAIR_FLASH',
    });
  } else if (isSame(cardA.direction, cardB.direction)) {
    results.push({
      rule: 'SAME_DIRECTION',
      strength: 'low',
      description: 'Aligned bearing — traveling the same vector.',
      ledHint: 'PAIR_GLOW',
    });
  } else if (isAdjacent(cardA.direction, cardB.direction)) {
    results.push({
      rule: 'ADJACENT_DIRECTION',
      strength: 'low',
      description: 'Adjacent currents — near-parallel paths.',
      ledHint: 'PAIR_GLOW',
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

module.exports = { evaluatePair };
