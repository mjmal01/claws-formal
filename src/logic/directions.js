// Direction relationships
const DIRECTIONS = ['N', 'E', 'S', 'W'];

const OPPOSITES = { N: 'S', S: 'N', E: 'W', W: 'E' };

const ADJACENT = {
  N: ['E', 'W'],
  E: ['N', 'S'],
  S: ['E', 'W'],
  W: ['N', 'S'],
};

function isOpposite(a, b) { return OPPOSITES[a] === b; }
function isSame(a, b) { return a === b; }
function isAdjacent(a, b) { return ADJACENT[a]?.includes(b) || false; }

module.exports = { DIRECTIONS, OPPOSITES, ADJACENT, isOpposite, isSame, isAdjacent };
