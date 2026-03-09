# Node Game

A space-themed real-time strategy game built with Phaser 3. Command fleets of ships across a procedurally generated star map, capture planets, manage resources, construct buildings, produce new ship types, and defend against asteroid and meteor threats.

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
│   │   ├── MainMenuScene.js  # Main menu — player count selector, How to Play, start game
│   │   ├── GameScene.js      # Game loop, map, input, combat, ownership, resources, production
│   │   ├── UIScene.js        # Top/bottom HUD, resource tooltips, game-over overlay
│   │   ├── NodePanel.js      # Node Panel — unit management, planet info, buildings, asteroid info
│   │   └── TooltipScene.js   # Keyword tooltip overlay — ship and unit stat cards on hover
│   ├── map/
│   │   └── MapGraph.js       # Procedural spiral map generator + BFS pathfinding
│   ├── units/
│   │   └── Unit.js           # Stack class with ship composition, icons, movement
│   └── asteroids/
│       ├── AsteroidManager.js  # Spawns and updates all asteroids; owns AsteroidMiner list
│       └── AsteroidMiner.js    # Autonomous mining unit — intercepts asteroids and meteors
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
| Click an asteroid | Open asteroid info in Node Panel |
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

## ☄ Asteroids

Every **3 seconds**, a new asteroid spawns on a random map edge and travels across the map at 60 px/s. There are three types:

| Type | Colour | Resources | Behaviour |
|---|---|---|---|
| Asteroid | Grey | 100 (random split) | Drifts across map in a random inward direction. Despawns at the far edge. |
| Rich Asteroid | Gold | 300 (random split) | Same as above — rarer, higher yield. |
| Meteor | Red | 100 (random split) | Targets the **farthest planet** from its spawn point, giving maximum reaction time. On arrival: **30% chance to destroy each unit** at the target. Cruiser Repair rule applies (50% rebuild). |

Resources on all three types are randomly distributed between food, metal, and fuel each spawn.

Click any asteroid to open its info in the Node Panel — shows resource breakdown, type description, and for meteors, the target planet name and impact rules.

Spawn rates: 60% regular asteroid, 25% rich asteroid, 15% meteor.

## ⛏ Asteroid Miners

Build an **Asteroid Miner** on any player-owned planet to deploy an autonomous mining unit.

- The miner cannot be moved, split, or destroyed
- It does not count toward the combat unit tally
- A faint cyan radius ring appears around the planet — dim normally, bright when the planet is selected — showing the miner's patrol range (160 px)

**State machine:**

| State | Behaviour |
|---|---|
| Idle | Waiting at home planet, scanning for asteroids in range |
| En Route | Flying toward a claimed asteroid or meteor at 90 px/s |
| Mining | Attached to the asteroid — fully mines it over 4 seconds |
| Returning | Flying back to deposit cargo |

**Meteor intercept:** Miners treat meteors as valid (and priority) targets. A miner that successfully mines a meteor before it reaches its destination cancels the impact entirely. Meteors targeting the miner's own home planet are prioritised above all other targets.

**Deposit:** When the miner returns, resources are added to the player's bank and logged in the event log. If an asteroid drifts out of range while being mined, the miner collects whatever resources remain and returns early.

Hover **Miner 1** (or any miner entry) in the **Planet Units** section of the Node Panel to see the full Asteroid Miner stat card. The same tooltip is available on the **Asteroid Miner** card in the Build Modal.

When an asteroid is clicked while a miner is attached to it, the left panel shows the miner's home planet and current state in a **Mining Unit** section.

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

### Mining Buildings

| Building | Cost (food/metal/fuel) | Output |
|---|---|---|
| Asteroid Miner | 150 / 200 / 150 | Deploys 1 autonomous mining unit |

Resource costs shown in **red** in the Build Modal when unaffordable. Already-built buildings are greyed out.

## 🖥 HUD & UI

### Top Bar
- **Left:** Pie chart of owned planet types · player name · planet count (updates live on capture)
- **Right:** Total unit count · Food · Metal · Fuel

### Bottom Bar
- **Left:** Selected stack info
- **Centre:** Control hints
- **Right:** Event log (last 3 events — arrivals, combat, merges, mining deposits, meteor intercepts)

### Node Panel *(opens on clicking any node or asteroid)*
- **Left — Unit Management:**
  - Stack selector tabs (if multiple stacks are present)
  - Per-ship-type rows: icon · type name (hoverable for stat card) · count · `− n +` split controls
  - Running split total + **SPLIT & MOVE** button
  - **Planet Units** section below combat units — lists all Asteroid Miners assigned to this planet with their current state (hoverable for stat card)
- **Right — Planet Info & Buildings:**
  - Planet name, type, resource bars with base + bonus annotations `(+N)`
  - Scrollable building cards (5 per row)
  - First card always shows the planet card

When an **asteroid** is clicked instead of a planet:
- Left panel shows the asteroid graphic, its type, and any miner currently attached in a **Mining Unit** section
- Right panel shows the asteroid's name, status, resource yield bars, and behaviour description

### Build Modal *(opens from "Add Building" card)*
- 8 building options in a 2-row grid
- Unit name and output text on factory and mining cards are hoverable — shows full unit stat card
- Resource costs highlighted red if unaffordable
- Already-built buildings dimmed and unselectable

### Tooltip Cards *(hover any highlighted unit name)*
Each tooltip shows the unit's icon, role, stats, any special rules, and a description. Available for all ship types and the Asteroid Miner in every location where they are referenced — unit lists, build modal, and planet panels. Tooltips auto-anchor below the cursor and clamp to screen edges.

---

## 🗺 Roadmap & Design Intent

### Phase A — Depth (current focus)
Make each playthrough strategically distinct before adding players.

| Feature | Status | Notes |
|---|---|---|
| Research Tree | Planned | Unlocks ship upgrades and building tiers. Core replayability driver. |
| Ship Upgrades | Planned | Pairs with Research. Makes your fleet composition unique each game. |
| Building Upgrades + Planetary Power | Planned | Energy capacity per planet forces meaningful build decisions. |
| Missile Carriers | Planned | Ranged unit using the existing projectile system. New combat dimension. |
| Planetary Defense | Planned | Building with intercept radius. Counters missile carriers and meteors. |
| Win Condition | Planned | Destroy all enemy flagships or capture a threshold of planets. |
| Lightweight AI | Planned | Expand-nearest + attack-weakest. Enough to test solo. Deepen post-multiplayer. |

### Phase B — Close the Loop
Make the game playable end-to-end.

| Feature | Status | Notes |
|---|---|---|
| Hotseat Multiplayer | Planned | Shared browser, turn indicator. No networking needed. Enables asymmetric testing. |
| Sound Effects | Planned | Combat, production, capture, meteor impact. |
| Basic AI | Planned | Revisit with full feature set. |

### Phase C — Go Wide
Networking and advanced mechanics.

| Feature | Status | Notes |
|---|---|---|
| Networked Multiplayer | Planned | WebSocket server, authoritative state. Supabase or Colyseus backend. |
| Stealth + Visibility | Planned | Fog of war, cloaking units. Requires multiplayer to be meaningful. |
| Full AI | Planned | Needs complete feature set to be worth investing in deeply. |

### Design Notes
- **Multiplayer timing:** Every system built as local GameScene state will need rearchitecting when a server becomes the authority. Keep state well-separated now. Hotseat first, then network.
- **Tooltip contract:** Every time a new unit type is added, tooltips must be wired in all three locations — unit list (Planet Units section), Build Modal card, and any panel where the unit is referenced by name.
- **Projectile architecture:** `AsteroidManager` is the template for any free-moving object. Missiles will follow the same pattern: spawn on edge event, move each `update()`, check arrival/intercept, fire event on resolution.
- **Power system intent:** Planetary power should be a hard cap, not a soft penalty. A planet with 4 power slots forces a real choice between offense (factory), defense (planetary defense), economy (extractor), and utility (miner). Upgrades cost power to run, not just to build.

## 🌐 Deployment

Push to `main` → GitHub Actions triggers automatically.
GitHub Pages serves the game from the `main` branch root.
