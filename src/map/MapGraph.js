/**
 * MapGraph.js
 * Defines the node-and-edge network units travel on.
 *
 * Each NODE has:
 *   id       - unique string key
 *   x, y     - screen position
 *   label    - display name (town, fort, etc.)
 *   type     - 'town' | 'fort' | 'junction' | 'resource'
 *   food, metal, fuel - resource attributes (sum to 10)
 *   buildings - array of building strings (starts empty, added at runtime)
 *
 * Each EDGE connects two node ids (bidirectional by default).
 *
 * To build your real map: edit the NODES and EDGES arrays below,
 * or replace with a JSON loader pointing at assets/maps/map.json.
 */

export const NODES = [
  // Northern line
  { id: 'A', x: 200,  y: 120,  label: 'Ironhold',  type: 'fort'     , food: 2, metal: 5, fuel: 3 },
  { id: 'B', x: 480,  y: 100,  label: 'Ashford',   type: 'town'     , food: 5, metal: 2, fuel: 3 },
  { id: 'C', x: 760,  y: 130,  label: 'Coldpass',  type: 'junction' , food: 3, metal: 3, fuel: 4 },
  { id: 'D', x: 1040, y: 110,  label: 'Duskwall',  type: 'fort'     , food: 1, metal: 6, fuel: 3 },

  // Central line
  { id: 'E', x: 200,  y: 360,  label: 'Millhaven', type: 'town'     , food: 6, metal: 2, fuel: 2 },
  { id: 'F', x: 480,  y: 340,  label: 'Crossroad', type: 'junction' , food: 3, metal: 3, fuel: 4 },
  { id: 'G', x: 760,  y: 360,  label: 'Greystone', type: 'town'     , food: 5, metal: 3, fuel: 2 },
  { id: 'H', x: 1040, y: 340,  label: 'Highmark',  type: 'resource' , food: 2, metal: 3, fuel: 5 },

  // Southern line
  { id: 'I', x: 200,  y: 580,  label: 'Southfen',  type: 'town'     , food: 6, metal: 1, fuel: 3 },
  { id: 'J', x: 480,  y: 560,  label: 'Redmarsh',  type: 'junction' , food: 3, metal: 4, fuel: 3 },
  { id: 'K', x: 760,  y: 590,  label: 'Keldrath',  type: 'fort'     , food: 2, metal: 5, fuel: 3 },
  { id: 'L', x: 1040, y: 570,  label: 'Lasthold',  type: 'fort'     , food: 1, metal: 6, fuel: 3 },
];

// Bidirectional edges — add { oneWay: true } for one-directional paths
export const EDGES = [
  // Northern horizontal
  { from: 'A', to: 'B' },
  { from: 'B', to: 'C' },
  { from: 'C', to: 'D' },

  // Central horizontal
  { from: 'E', to: 'F' },
  { from: 'F', to: 'G' },
  { from: 'G', to: 'H' },

  // Southern horizontal
  { from: 'I', to: 'J' },
  { from: 'J', to: 'K' },
  { from: 'K', to: 'L' },

  // Vertical connectors
  { from: 'A', to: 'E' },
  { from: 'E', to: 'I' },
  { from: 'B', to: 'F' },
  { from: 'F', to: 'J' },
  { from: 'C', to: 'G' },
  { from: 'G', to: 'K' },
  { from: 'D', to: 'H' },
  { from: 'H', to: 'L' },

  // Diagonal shortcuts
  { from: 'B', to: 'G' },
  { from: 'F', to: 'K' },
];

/**
 * Build an adjacency map from the edge list.
 * Returns: Map<nodeId, nodeId[]>
 */
export function buildAdjacency(edges) {
  const adj = new Map();
  edges.forEach(({ from, to, oneWay }) => {
    if (!adj.has(from)) adj.set(from, []);
    if (!adj.has(to))   adj.set(to,   []);
    adj.get(from).push(to);
    if (!oneWay) adj.get(to).push(from);
  });
  return adj;
}

/**
 * BFS shortest path between two node ids.
 * Returns array of node ids from start→end (inclusive), or null if no path.
 */
export function findPath(startId, endId, adjacency) {
  if (startId === endId) return [startId];
  const visited = new Set([startId]);
  const queue   = [[startId, [startId]]];

  while (queue.length) {
    const [current, path] = queue.shift();
    for (const neighbour of (adjacency.get(current) || [])) {
      if (neighbour === endId) return [...path, neighbour];
      if (!visited.has(neighbour)) {
        visited.add(neighbour);
        queue.push([neighbour, [...path, neighbour]]);
      }
    }
  }
  return null; // No path found
}
