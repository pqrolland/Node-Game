/**
 * MapGraph.js
 * Procedurally generates a spiral node layout with proximity-based edges.
 *
 * Each NODE has:
 *   id       - unique string key
 *   x, y     - screen position
 *   label    - planet name
 *   type     - 'molten' | 'habitable' | 'barren' | 'sulfuric' (assigned at runtime)
 *   food, metal, fuel - resource attributes (sum to 10)
 *
 * GENERATION:
 *   - Nodes are placed along an Archimedean spiral centred on the map
 *   - Each node is guaranteed a connection to its nearest neighbour
 *   - Extra connections added randomly to other close nodes
 *   - Call generateMap() to get fresh { nodes, edges } each playthrough
 */

// ── Planet name syllables for procedural names ─────────────────────────────
const PREFIXES = ['Vel','Kyr','Aon','Zeth','Iru','Qal','Mex','Vor','Sys','Nar','Thal','Obr','Pex','Ulon','Drev'];
const SUFFIXES = ['is','ax','on','ara','ux','eon','ith','us','en','ar','ix','ora','yth','ex','ion'];

function randomName(rng) {
  return PREFIXES[Math.floor(rng() * PREFIXES.length)] +
         SUFFIXES[Math.floor(rng() * SUFFIXES.length)];
}

// ── Seeded RNG (Mulberry32) — call generateMap() for a random seed ─────────
function makeRng(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── Core generator ─────────────────────────────────────────────────────────
export function generateMap(nodeCount = 14, seed = null, mapW = 1280, mapH = 720) {
  const usedSeed = seed ?? Math.floor(Math.random() * 999999);
  const rng      = makeRng(usedSeed);

  const MAP_W    = mapW;
  const MAP_H    = mapH;
  const CX       = MAP_W / 2;
  const CY       = MAP_H / 2 - 20; // Slight upward bias so nodes clear the UI

  // ── 1. Place nodes on a spiral ───────────────────────────────────────────
  // Archimedean spiral: r = a + b*theta
  // We add small random jitter so it doesn't look too mechanical
  const nodes = [];
  // Scale spiral spread with map size so planets spread across the canvas
  const SPIRAL_SPREAD = Math.max(55, Math.sqrt(MAP_W * MAP_H) / 24);
  const JITTER        = Math.round(SPIRAL_SPREAD * 0.5);

  const MIN_DIST = 110;  // Minimum px between any two nodes

  let theta = 0;
  for (let i = 0; i < nodeCount; i++) {
    let x, y, attempts = 0;

    // Advance along the spiral until the candidate position is far enough
    // from all existing nodes. Each failed attempt steps theta forward a bit.
    do {
      theta += 0.72 + rng() * 0.15;
      const radius = SPIRAL_SPREAD * theta / (Math.PI * 0.8);
      const jx     = (rng() - 0.5) * JITTER;
      const jy     = (rng() - 0.5) * JITTER;
      x = Math.round(CX + Math.cos(theta) * radius + jx);
      y = Math.round(CY + Math.sin(theta) * radius + jy);
      attempts++;
    } while (
      attempts < 50 &&
      nodes.some(n => Math.sqrt((n.x - x) ** 2 + (n.y - y) ** 2) < MIN_DIST)
    );

    // Unique label — retry if duplicate
    let label;
    const usedLabels = nodes.map(n => n.label);
    do { label = randomName(rng); } while (usedLabels.includes(label));

    // Random resources summing to 10
    const food  = 1 + Math.floor(rng() * 7);
    const metal = 1 + Math.floor(rng() * (9 - food));
    const fuel  = 10 - food - metal;

    nodes.push({
      id:    String(i),
      x,
      y,
      label,
      type:  'unassigned',  // Set by GameScene at runtime
      food,
      metal,
      fuel: Math.max(1, fuel),
    });
  }

  // ── 2. Build edges ────────────────────────────────────────────────────────
  // For each node, find its nearest neighbour (guaranteed edge),
  // then add 0–2 more edges to other close nodes at random.

  const edgeSet = new Set();  // "A-B" strings to prevent duplicates

  function addEdge(a, b) {
    const key = [a, b].sort().join('-');
    if (a === b || edgeSet.has(key)) return false;
    edgeSet.add(key);
    return true;
  }

  function dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  // Sort all other nodes by distance from node i
  function neighbours(i) {
    return nodes
      .map((n, j) => ({ j, d: dist(nodes[i], n) }))
      .filter(({ j }) => j !== i)
      .sort((a, b) => a.d - b.d);
}

  const CLOSE_THRESHOLD = Math.max(260, Math.sqrt(MAP_W * MAP_H) / 5);

  nodes.forEach((node, i) => {
    const sorted = neighbours(i);

    // Guaranteed: connect to closest neighbour
    addEdge(node.id, nodes[sorted[0].j].id);

    // Bonus: 0–2 extra edges to other close nodes
    const bonusCount = Math.floor(rng() * 3);
    let added = 0;
    for (let k = 1; k < sorted.length && added < bonusCount; k++) {
      if (sorted[k].d < CLOSE_THRESHOLD && rng() > 0.4) {
        addEdge(node.id, nodes[sorted[k].j].id);
        added++;
      }
    }
  });

  // ── 3. Ensure full connectivity (BFS check + bridge edges) ───────────────
  function buildAdj(edgeList) {
    const adj = new Map();
    nodes.forEach(n => adj.set(n.id, []));
    edgeList.forEach(({ from, to }) => {
      adj.get(from).push(to);
      adj.get(to).push(from);
    });
    return adj;
  }

  function getComponents(adj) {
    const visited    = new Set();
    const components = [];
    nodes.forEach(n => {
      if (visited.has(n.id)) return;
      const component = [];
      const queue     = [n.id];
      while (queue.length) {
        const cur = queue.shift();
        if (visited.has(cur)) continue;
        visited.add(cur);
        component.push(cur);
        (adj.get(cur) || []).forEach(nb => queue.push(nb));
      }
      components.push(component);
    });
    return components;
  }

  // Convert edgeSet to edge objects, then check connectivity
  let edges = Array.from(edgeSet).map(key => {
    const [from, to] = key.split('-');
    return { from, to };
  });

  // Bridge disconnected components by connecting their closest nodes
  let components = getComponents(buildAdj(edges));
  while (components.length > 1) {
    let bestDist = Infinity, bestA = null, bestB = null;
    components[0].forEach(idA => {
      components[1].forEach(idB => {
        const d = dist(nodes.find(n => n.id === idA), nodes.find(n => n.id === idB));
        if (d < bestDist) { bestDist = d; bestA = idA; bestB = idB; }
      });
    });
    addEdge(bestA, bestB);
    edges = Array.from(edgeSet).map(key => {
      const [from, to] = key.split('-');
      return { from, to };
    });
    components = getComponents(buildAdj(edges));
  }

  return { nodes, edges, seed: usedSeed };
}

/**
 * Returns { nodes, edges, mapW, mapH } for a given player count.
 * planetCount = 10 + playerCount * 10
 * Map size scales so density stays comfortable.
 */
export function generateMapForPlayers(playerCount = 1) {
  const nodeCount = 10 + playerCount * 10;
  // Scale map: base 1280×720, grow by ~400×225 per additional player beyond 1
  const mapW = Math.round(1280 + Math.max(0, playerCount - 1) * 400);
  const mapH = Math.round(720  + Math.max(0, playerCount - 1) * 225);
  const result = generateMap(nodeCount, null, mapW, mapH);
  return { ...result, mapW, mapH };
}

/**
 * Build an adjacency map from the edge list.
 * Returns: Map<nodeId, nodeId[]>
 */
export function buildAdjacency(edges) {
  const adj = new Map();
  edges.forEach(({ from, to }) => {
    if (!adj.has(from)) adj.set(from, []);
    if (!adj.has(to))   adj.set(to,   []);
    adj.get(from).push(to);
    adj.get(to).push(from);
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
  return null;
}
