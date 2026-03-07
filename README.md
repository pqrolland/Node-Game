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
│   │   ├── BootScene.js      # Asset preloader → routes to MainMenuScene
│   │   ├── MainMenuScene.js  # Main menu — player count selector, start game
│   │   ├── GameScene.js      # Game loop, map, input, combat, ownership, resources, production
│   │   ├── UIScene.js        # Top/bottom HUD, resource tooltips, game-over overlay
│   │   ├── NodePanel.js      # Node Panel — unit management, planet info, buildings
│   │   └── TooltipScene.js   # Keyword tooltip overlay — ship stat cards on hover
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

| Ship | Attack | Health | Special Rule |
|---|---|---|---|
| Fighter | 1 | 1 | Basic unit — first to die in combat |
| Destroyer | 1 | 1 | **Pre-strike:** kills 2 enemy fighters before combat resolves |
| Cruiser | 1 | 1 | **Repair:** 50% chance to return after being destroyed |
| Dreadnaught | 4 | 4 | Counts as 4 units — requires 4 damage to destroy |
| Flagship | 1 | 1 | One per player — if destroyed, you lose the game immediately |

Hover any ship name in the **Unit Management panel** or **Build Modal** to see a full stat card for that ship type.

## ⚔ Combat

When a stack arrives at an enemy-occupied node, combat resolves in three phases:

1. **Destroyer pre-strike** — each destroyer kills 2 enemy fighters (or next lowest tier) before the main phase
2. **Simultaneous attack** — both sides deal their full attack power at once. Damage is applied lowest-tier first: fighters → destroyers → cruisers → dreadnaughts → flagship. Dreadnaughts have 4 health and require 4 damage to destroy
3. **Cruiser repair** — each cruiser destroyed in the main phase has a 50% chance of repairing and returning to the stack

If both stacks survive, the attacker retreats and the defender holds the node. Mutual destruction is possible.

Friendly stacks arriving at the same node **merge** — their compositions are combined.

**Flagship loss:** When a flagship is destroyed, all player units are removed, all owned planets are lost, and a defeat screen is shown.

## 🌐 Multiplayer Setup

From the main menu, select 1–8 players before starting. The map scales with player count:

- **Node count:** `10 + (playerCount × 10)`
- **Map size:** grows by ~400 × 225px per additional player
- Each player spawns with 2 adjacent planets — 1 flagship + 10 fighters on the home planet, 10 fighters on the adjacent planet
- All unclaimed planets start with a neutral garrison of 10 fighters
- Players are colour-coded (blue, red, green, yellow, pink, purple, orange, teal)

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
- Planet count and map dimensions scale with player count
- Minimum spacing between planets scales with map size
- Planet names generated from randomised syllable combinations
- Every planet guaranteed at least one edge to its nearest neighbour
- Additional connections added randomly; full connectivity via BFS bridge detection
- Each player's two starting planets are always directly adjacent on the graph

## 🏳 Planet Ownership

- A planet is owned by whichever team has the most units present
- Shown as coloured concentric rings matching the player's team colour
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

| Building | Cost (food/metal/fuel) | Output |
|---|---|---|
| Naval Base | 50 / 50 / 50 | +1 Fighter every 15s |
| Destroyer Factory | 100 / 100 / 100 | +1 Destroyer every 30s |
| Cruiser Factory | 200 / 200 / 200 | +1 Cruiser every 30s |
| Dreadnaught Factory | 300 / 300 / 300 | +1 Dreadnaught every 30s |

Each factory card shows a circular progress arc tracking time until the next ship. Produced ships are added to the largest idle friendly stack at the node, or a new stack of 1 is spawned if none exist.

Hover the unit name or output text on any factory card to see a full stat card for that ship type.

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
  - Per-ship-type rows: icon · type name (hoverable for stat card) · count
  - `− n +` controls per ship type to compose a split
  - Running split total + **SPLIT & MOVE** button
- **Right — Planet Info & Buildings:**
  - Planet name, type, resource bars with base + bonus annotations `(+N)`
  - Scrollable building cards (5 per row)
  - First card always shows the planet card

### Build Modal *(opens from "Add Building" card)*
- 7 building options in a 2-row grid
- Unit name and output text on factory cards are hoverable — shows full ship stat card
- Resource costs highlighted red if unaffordable
- Already-built buildings dimmed and unselectable

### Tooltip Cards *(hover any highlighted ship name)*
Each tooltip shows the ship's icon (matching the factory card icon), role, attack/health stats, any special rules, and a description. Tooltips auto-anchor below the cursor and clamp to screen edges.

## 🌐 Deployment

Push to `main` → GitHub Actions triggers automatically.
GitHub Pages serves the game from the `main` branch root.
