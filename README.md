# Node Game

A real-time strategy game built with Phaser 3. Command unit stacks across a procedurally generated star map, capture planets, and manage resources.

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
│   │   ├── GameScene.js      # Game loop, map, input, combat, ownership, resources
│   │   ├── UIScene.js        # Top + bottom HUD bars
│   │   └── NodePanel.js      # Node management panel (unit split, planet info)
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

Each planet has **food**, **metal**, and **fuel** values that sum to 10.

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
- Ownership is shown as a coloured ring around the planet (blue = player, red = enemy)
- Ownership persists when units leave — it only changes when the opposing team arrives with more units

## 💰 Resources

Every **3 seconds**, resources are collected from all player-owned planets:
- Each planet contributes its food, metal, and fuel values to the player's totals
- Displayed in the top-right HUD bar

## 🖥 HUD

**Top bar**
- Top left: Player name · planet icon · owned planet count
- Top right: Unit count · Food · Metal · Fuel

**Bottom bar**
- Left: Selected stack info
- Centre: Control hints
- Right: Event log (arrivals, combat, merges)

**Node panel** (opens when clicking an owned node)
- Left half: Unit management — view stacks, split units
- Right half: Planet info — type, resource attributes, building slots (coming soon)

## 🌐 Deployment

Push to `main` → GitHub Actions triggers automatically.
GitHub Pages serves the game from the `main` branch root.
