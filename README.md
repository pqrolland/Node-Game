# Node Game

A real-time strategy game built with Phaser 3. Command unit stacks across a procedurally generated star map, capture planets, manage resources, and construct buildings to grow your empire.

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
│   │   ├── GameScene.js      # Game loop, map, input, combat, ownership, resources, unit production
│   │   ├── UIScene.js        # Top + bottom HUD bars, resource tooltips
│   │   └── NodePanel.js      # Node panel — units, planet info, buildings, construction
│   ├── map/
│   │   └── MapGraph.js       # Procedural spiral map generator + BFS pathfinding
│   └── units/
│       └── Unit.js           # Stack class — travels graph edges in real-time
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
| Click the same node again while selected | Open node management panel |
| ESC | Deselect stack |
| WASD / Arrow keys | Scroll camera |
| Scroll wheel | Zoom in / out |

## 🪐 Planet Types

Each planet is assigned a type randomly at the start of every playthrough.

| Type | Colour | Character |
|---|---|---|
| Molten | Orange-red | High metal output |
| Habitable | Blue | High food output |
| Barren | Grey | Balanced, low output |
| Sulfuric | Yellow-green | High fuel output |

Each planet has **food**, **metal**, and **fuel** base values that sum to 10. Buildings can increase these beyond the base.

## 🗺 Map Generation

The map is procedurally generated each playthrough using an Archimedean spiral:
- 14 planets placed along the spiral with a minimum spacing of 110px
- Planet names generated from randomised syllable combinations
- Every planet is guaranteed at least one connection to its nearest neighbour
- Additional connections added randomly to nearby planets
- Full connectivity guaranteed via BFS bridge detection

To regenerate the map, refresh the page.

## ⚔ Combat

When a stack arrives at a node occupied by an enemy stack, combat resolves automatically:
- The larger stack wins and loses units equal to the loser's full stack size
- The smaller stack is always destroyed
- An exact tie destroys both stacks
- Friendly stacks arriving at the same node merge automatically

## 🏳 Planet Ownership

- A planet is owned by whichever team has the most units present
- Ownership shown as coloured concentric rings around the planet (blue = player, red = enemy)
- Ownership persists when units leave — changes only when the opposing team arrives with more units
- Only player-owned planets can have buildings constructed on them

## 💰 Resources

Every **3 seconds**, resources are collected from all player-owned planets:
- Each planet contributes its current food, metal, and fuel values to the player's totals
- Building bonuses stack on top of the planet's base values
- Displayed in the top-right HUD bar

**Hovering** any resource in the top bar opens a tooltip showing the total per-tick gain and a scrollable per-planet breakdown. The tooltip stays open when you move the cursor into it.

## 🏗 Buildings

Buildings are constructed on player-owned planets via the Node Panel. Each building has a resource cost, a 15-second build time, and is limited to one per planet. During construction a semi-transparent overlay shrinks upward over the card — the building's bonus activates the moment it completes, whether the panel is open or closed.

| Building | Cost | Effect |
|---|---|---|
| Naval Base | 50 food · 50 metal · 50 fuel | +1 unit every 15 seconds |
| Farm | 100 metal · 100 fuel | +1 Food per resource tick |
| Metal Extractor | 100 food · 100 fuel | +1 Metal per resource tick |
| Fuel Extractor | 100 food · 100 metal | +1 Fuel per resource tick |

Resource costs turn **red** in the modal when you can't afford them. Already-built buildings are greyed out and cannot be selected again.

### Naval Base — Unit Production

Once a Naval Base completes, it produces one unit every 15 seconds. The unit is added to the largest idle friendly stack at the node, or a new stack of 1 is spawned if none are present. A circular progress arc in the top-right corner of the Naval Base card shows time until the next unit.

## 🖥 HUD

**Top bar**
- Top left: Pie chart of owned planet type distribution · player name · owned planet count. The pie chart updates live with each capture.
- Top right: Unit count · Food · Metal · Fuel. Hover any resource for a production breakdown tooltip.

**Bottom bar**
- Left: Selected stack info
- Centre: Control hints
- Right: Event log (arrivals, combat, merges)

**Node panel** (opens when clicking any node)
- Left half: Unit management — view stacks, split and move units
- Right half: Planet name, type, resource bars with base values and bonus annotations `(+N)`, building cards
- Up to 5 building cards per row; scroll vertically with the mouse wheel when there are more
- First card always shows the planet card (name · level · Outpost)
- Resource bars update immediately when a building completes

## 🌐 Deployment

Push to `main` → GitHub Actions triggers automatically.
GitHub Pages serves the game from the `main` branch root.
