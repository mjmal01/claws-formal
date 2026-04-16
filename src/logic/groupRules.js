const { isOpposite, isSame } = require('./directions');

/**
 * Evaluate a group of cards (same-constellation grouping + cross-constellation).
 * Returns array of triggered events: { rule, strength, constellation, description, ledHint }
 */
function evaluateGroup(cards) {
  const results = [];
  const byConstellation = {};

  for (const card of cards) {
    if (!byConstellation[card.constellation]) byConstellation[card.constellation] = [];
    byConstellation[card.constellation].push(card);
  }

  for (const [constellation, group] of Object.entries(byConstellation)) {
    const count = group.length;

    // Rule 4A: Symbol grouping — thresholds for 3-card constellations
    if (count === 2) {
      results.push({
        rule: 'SYMBOL_GROUP_PARTIAL',
        strength: 'mid',
        constellation,
        description: `2 of 3 ${constellation} nodes aligned — partial constellation.`,
        ledHint: 'PARTIAL_GLOW',
      });
    } else if (count >= 3) {
      results.push({
        rule: 'SYMBOL_GROUP_FULL',
        strength: 'rare',
        constellation,
        description: `All ${constellation} nodes aligned — full constellation activated!`,
        ledHint: 'FULL_ACTIVATE',
      });
    }

    // Rule 4B: Number sequences within same constellation
    const nums = group.map(c => c.number).sort((a, b) => a - b);
    const seqLen = longestConsecutive(nums);
    if (seqLen >= 2) {
      results.push({
        rule: 'NUMBER_SEQUENCE',
        strength: seqLen >= 3 ? 'rare' : 'mid',
        constellation,
        description: `${constellation} sequence of ${seqLen} detected — ${seqLen >= 3 ? 'complete chain!' : 'partial chain.'}`,
        ledHint: seqLen >= 3 ? 'FULL_ACTIVATE' : 'PARTIAL_GLOW',
      });
    }

    // Polaris anchor
    const hasPolaris = group.some(c => c.isPolaris);
    if (hasPolaris && count >= 2) {
      results.push({
        rule: 'POLARIS_ANCHOR',
        strength: 'upgrade',
        constellation,
        description: `${constellation} Polaris anchors the group — combo upgraded.`,
        ledHint: 'POLARIS_PULSE',
      });
    }
  }

  // Cross-constellation rules: pairs with same direction across constellations
  const allDirections = {};
  for (const card of cards) {
    if (!allDirections[card.direction]) allDirections[card.direction] = [];
    allDirections[card.direction].push(card);
  }
  for (const [dir, dirCards] of Object.entries(allDirections)) {
    const consts = new Set(dirCards.map(c => c.constellation));
    if (dirCards.length >= 3 && consts.size >= 2) {
      results.push({
        rule: 'CROSS_BEARING',
        strength: 'mid',
        constellation: null,
        description: `${dirCards.length} nodes bearing ${dir} across ${consts.size} constellations — cross-bearing alignment.`,
        ledHint: 'CROSS_FLASH',
      });
    }
  }

  // Full gathering: 4+ unique constellations present
  const uniqueConstellations = new Set(cards.map(c => c.constellation));
  if (uniqueConstellations.size >= 4) {
    results.push({
      rule: 'CONVERGENCE',
      strength: uniqueConstellations.size >= 6 ? 'rare' : 'upgrade',
      constellation: null,
      description: `${uniqueConstellations.size} constellations converging — eclipse approaching.`,
      ledHint: 'CONVERGENCE_WAVE',
    });
  }

  return results;
}

function longestConsecutive(sortedNums) {
  if (!sortedNums.length) return 0;
  let max = 1, cur = 1;
  for (let i = 1; i < sortedNums.length; i++) {
    if (sortedNums[i] === sortedNums[i - 1] + 1) { cur++; max = Math.max(max, cur); }
    else cur = 1;
  }
  return max;
}

module.exports = { evaluateGroup };
