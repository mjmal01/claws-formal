// Direction relationships
const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const OPPOSITES = { N: 'S', NE: 'SW', E: 'W', SE: 'NW', S: 'N', SW: 'NE', W: 'E', NW: 'SE' };

const ADJACENT = {
  N: ['NE', 'NW'],
  NE: ['E', 'N'],
  E: ['NE', 'SE'],
  SE: ['E', 'S'],
  S: ['SE', 'SW'],
  SW: ['S', 'W'],
  W: ['NW', 'SW'],
  NW: ['W', 'N']
};

function isOpposite(a, b) { return OPPOSITES[a] === b; }
function isSame(a, b) { return a === b; }
function isAdjacent(a, b) { return ADJACENT[a]?.includes(b) || false; }

module.exports = { DIRECTIONS, OPPOSITES, ADJACENT, isOpposite, isSame, isAdjacent };
