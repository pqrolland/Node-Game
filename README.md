# Node Game

A space-themed real-time strategy game built with Phaser 3. Command fleets of ships across a procedurally generated star map, capture planets, manage resources, construct buildings, and produce new ship types to crush the enemy.

## 🚀 Quick Start

Open `index.html` with VS Code's **Live Server** extension. No install or build step needed.

## 📁 Project Structure

```
NodeGame/
├── index.html
├── src/
│   ├── main.js               # Phaser config + scene list
│   ├── style.css
│   ├── scenes/
│   │   ├── BootScene.js      # Asset preloader
│   │   ├── GameScene.js      # Game loop, map, input, combat, ownership, resources, production
│   │   ├── UIScene.js        # Top/bottom HUD, resource tooltips, game-over overlay
│   │   └── NodePanel.js      # Node Panel — unit management, planet info, buildings
│   ├── map/
│   │   └── MapGraph.js       # Procedural spiral map generator + BFS pathfinding
│   └── units/
│       └── Unit.js           # Stack class with ship composition, icons, movement
├── Assets/
│   ├── sprites/
│   ├── maps/
│   └── audio/
└── .github/
    └── workflows/
        └── deploy.yml        # Auto-deploys to GitHub Pages on push to main
```

## 🎮 Controls

| Input | Action |
|---|---|
| Click a node with a friendly stack | Select that stack |
| Hover another node while selected | Preview path |
| Click destination node while selected | Move stack along shortest path |
| Click the same node again while selected | Open Node Panel |
| ESC | Deselect stack |
| WASD / Arrow keys | Scroll camera |
| Scroll wheel | Zoom in / out |

## 🚀 Ship Types

Each stack holds a **composition** of multiple ship types. The badge on the stack shows the highest-tier ship present plus the total count.

| Ship | Icon | Special Rule |
|---|---|---|
| Fighter | Single triangle | Basic ship — produced by Naval Base |
| Destroyer | Twin peaks | Pre-strike: kills 2 enemy ships before combat resolves |
| Cruiser | Two diagonal bars `//` | Support ship — role TBD |
| Dreadnaught | Double fast-forward triangles | Heavy ship — role TBD |
| Flagship | Diamond with bright core | One per player — if destroyed, you lose the game |

**Flagship loss:** When a flagship is destroyed, all player units are removed from the map, all owned planets are lost, and a defeat screen is shown.

## ⚔ Combat

When a stack arrives at an enemy-occupied node:
1. **Destroyer pre-strike** — each destroyer kills 2 enemy ships (fighters first, then others)
2. **Standard combat** — larger stack wins; winner loses units equal to the loser's full stack size
3. Losses are removed from the lowest-tier ships first

Ties after pre-strike go to the attacker. Mutual destruction is possible.

Friendly stacks arriving at the same node **merge** — their compositions are combined.

## 🪐 Planet Types

Randomly assigned each playthrough.

| Type | Colour | Base resources |
|---|---|---|
| Molten | Orange-red | High metal |
| Habitable | Blue | High food |
| Barren | Grey | Balanced, low |
| Sulfuric | Yellow-green | High fuel |

Base food/metal/fuel values per planet always sum to 10. Buildings add on top.

## 🗺 Map Generation

Procedurally generated each playthrough using an Archimedean spiral:
- 14 planets placed along the spiral, minimum 110px spacing
- Planet names generated from randomised syllable combinations
- Every planet guaranteed at least one edge to its nearest neighbour
- Additional connections added randomly; full connectivity via BFS bridge detection

Refresh the page to regenerate the map.

## 🏳 Planet Ownership

- A planet is owned by whichever team has the most units present
- Shown as coloured concentric rings (blue = player, red = enemy)
- Ownership persists when units leave; changes only when the opposing team arrives in force
- Only player-owned planets can have buildings constructed on them

## 💰 Resources

Every **3 seconds**, resources are collected from all player-owned planets.

- Each planet contributes its current food, metal, and fuel values
- Building bonuses stack on top of base values
- Displayed in the top-right HUD bar

Hover any resource icon in the top bar to see a scrollable per-planet breakdown tooltip.

## 🏗 Buildings

Constructed via the **Build Modal** in the Node Panel. Each building costs resources, takes 15 seconds to build, and is limited to one per planet. A semi-transparent overlay shrinks upward over the card during construction. Bonuses apply the moment construction completes — even if the panel is closed.

### Production Buildings (unit factories)

| Building | Cost | Output |
|---|---|---|
| Naval Base | 50 / 50 / 50 | +1 Fighter every 15s |
| Destroyer Factory | 100 / 100 / 100 | +1 Destroyer every 30s |
| Cruiser Factory | 200 / 200 / 200 | +1 Cruiser every 30s |
| Dreadnaught Factory | 300 / 300 / 300 | +1 Dreadnaught every 30s |

Each factory card shows a circular progress arc (top-right corner) tracking time until the next ship. Produced ships are added to the largest idle friendly stack at the node, or a new stack of 1 is spawned if none exist.

### Resource Buildings

| Building | Cost (food/metal/fuel) | Output |
|---|---|---|
| Farm | 0 / 100 / 100 | +1 Food per resource tick |
| Metal Extractor | 100 / 0 / 100 | +1 Metal per resource tick |
| Fuel Extractor | 100 / 100 / 0 | +1 Fuel per resource tick |

Resource costs shown in **red** in the Build Modal when unaffordable. Already-built buildings are greyed out.

## 🖥 HUD & UI

### Top Bar
- **Left:** Pie chart of owned planet types · player name · planet count (updates live on capture)
- **Right:** Total unit count · Food · Metal · Fuel

### Bottom Bar
- **Left:** Selected stack info
- **Centre:** Control hints
- **Right:** Event log (last 3 events — arrivals, combat, merges)

### Node Panel *(opens on clicking any node)*
- **Left — Unit Management:**
  - Stack selector tabs (if multiple stacks are present)
  - Per-ship-type rows: icon · type name · count
  - `− n +` controls per ship type to compose a split
  - Running split total + **SPLIT & MOVE** button
- **Right — Planet Info & Buildings:**
  - Planet name, type, resource bars with base + bonus annotations `(+N)`
  - Scrollable building cards (5 per row)
  - First card always shows the planet card

### Build Modal *(opens from "Add Building" card)*
- 7 building options in a 2-row grid
- Resource costs highlighted red if unaffordable
- Already-built buildings dimmed and unselectable

## 🌐 Deployment

Push to `main` → GitHub Actions triggers automatically.
GitHub Pages serves the game from the `main` branch root.
