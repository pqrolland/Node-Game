# RTS Game

A real-time strategy game built with Phaser 3. Units move as stacks along a node-and-edge map graph.

## 🚀 Quick Start

Open `index.html` with VS Code's **Live Server** extension. No install or build step needed.

## 📁 Project Structure

```
rts-game/
├── index.html
├── src/
│   ├── main.js               # Phaser config
│   ├── style.css
│   ├── scenes/
│   │   ├── BootScene.js      # Asset preloader
│   │   ├── GameScene.js      # Game loop, map, input, combat
│   │   └── UIScene.js        # HUD, event log, legend
│   ├── map/
│   │   └── MapGraph.js       # Node/edge definitions + BFS pathfinding
│   └── units/
│       └── Unit.js           # Stack class — travels graph edges in real-time
├── assets/
│   ├── sprites/
│   ├── maps/
│   └── audio/
└── .github/
    └── workflows/
        └── deploy.yml
```

## 🎮 Controls

| Input | Action |
|---|---|
| Click a node with a friendly stack | Select that stack |
| Hover destination node (while selected) | Preview path |
| Click destination node (while selected) | Move stack along shortest path |
| Click selected node again | Deselect |
| WASD / Arrow keys | Scroll camera |
| Scroll wheel | Zoom |

## 🗺 Node Types

| Type | Colour | Purpose |
|---|---|---|
| Fort | Purple | Defensive strongpoint |
| Town | Blue | Population centre |
| Junction | Green | Crossroads / transit |
| Resource | Orange | Resource generation |

## ⚔ Combat

When a moving stack arrives at a node occupied by an enemy stack, simple combat resolves automatically. Each side loses half the opponent's stack size. The losing stack (reaching 0) is removed from the map.

## 🔧 Extending the Map

Edit `src/map/MapGraph.js` — add entries to `NODES` and `EDGES`. No other files need to change.

## 🌐 Deployment

Push to `main` → GitHub Actions auto-deploys to GitHub Pages.  
Enable in repo: **Settings → Pages → Source → GitHub Actions**
