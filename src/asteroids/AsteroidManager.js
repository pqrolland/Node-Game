import AsteroidMiner, { MINE_RANGE, MINER_COLOR } from './AsteroidMiner.js';
/**
 * AsteroidManager.js
 *
 * Spawns three asteroid types every 3 seconds onto the game map.
 * Asteroids are free-moving projectiles (not on rails).
 *
 * Types:
 *   regular  – grey,  100 resources, flies across map, player clicks to collect
 *   rich     – gold,  300 resources, flies across map, player clicks to collect
 *   meteor   – red,   100 resources, targets a random planet, damages garrison on arrival
 *
 * Public API (owned by GameScene):
 *   manager.update(delta)
 *   manager.destroy()
 *
 * Events emitted on game.events:
 *   'openAsteroid'  { asteroid }   – when player clicks an asteroid
 */

const ASTEROID_DEFS = {
  regular: {
    label:     'Asteroid',
    color:     0x889999,
    glowColor: 0xaabbcc,
    radius:    5,
    speed:     60,          // px / sec
    resources: 100,
    desc:      'A drifting asteroid carrying resources. Click to collect when it passes near your territory.',
  },
  rich: {
    label:     'Rich Asteroid',
    color:     0xddaa22,
    glowColor: 0xffee88,
    radius:    6,
    speed:     60,
    resources: 300,
    desc:      'A mineral-dense asteroid worth three times the normal yield. Rare — act fast.',
  },
  meteor: {
    label:     'Meteor',
    color:     0xdd3322,
    glowColor: 0xff8866,
    radius:    6,
    speed:     60,
    resources: 100,
    desc:      'A destructive meteor locked onto a planet. On impact it has a 30% chance to destroy each unit present. Cruisers retain their 50% repair chance.',
  },
};

// Distribute `total` resources randomly across food/metal/fuel
function randomResources(total) {
  const a = Math.floor(Math.random() * (total + 1));
  const b = Math.floor(Math.random() * (total - a + 1));
  const c = total - a - b;
  const arr = [a, b, c].sort(() => Math.random() - 0.5);
  return { food: arr[0], metal: arr[1], fuel: arr[2] };
}

export default class AsteroidManager {
  /**
   * @param {Phaser.Scene}  scene     – GameScene
   * @param {number}        mapW
   * @param {number}        mapH
   * @param {Map}           nodeMap   – id → node {x,y}
   */
  constructor(scene, mapW, mapH, nodeMap) {
    this._scene   = scene;
    this._mapW    = mapW;
    this._mapH    = mapH;
    this._nodeMap = nodeMap;

    this._asteroids      = [];   // live asteroid objects
    this._spawnTimer     = 0;
    this._SPAWN_INTERVAL = 3000; // ms

    this._miners    = [];   // AsteroidMiner instances keyed by nodeId

    // Graphics layer just above the map, below units
    this._gfx      = scene.add.graphics().setDepth(3);
    this._minerGfx = scene.add.graphics().setDepth(4);
  }

  // ── Main update (called from GameScene.update) ─────────────────────────────
  update(delta) {
    this._spawnTimer += delta;
    if (this._spawnTimer >= this._SPAWN_INTERVAL) {
      this._spawnTimer -= this._SPAWN_INTERVAL;
      this._spawnOne();
    }

    this._gfx.clear();
    this._minerGfx.clear();

    // Draw mining radii (dim) and update miners
    const selectedNodeId = this._scene.selectedStack?.currentNode ?? null;
    this._miners.forEach(miner => {
      const isSelected = miner.homeNode.id === selectedNodeId ||
                         (this._scene.nodePanelOpen && this._scene.scene.get('NodePanel')?.activeNode?.id === miner.homeNode.id);
      miner.drawRadius(this._minerGfx, isSelected);
      miner.update(delta, this._asteroids);
      miner.draw(this._minerGfx);
    });

    for (let i = this._asteroids.length - 1; i >= 0; i--) {
      const a = this._asteroids[i];
      this._moveAsteroid(a, delta);
      this._drawAsteroid(a);

      if (this._isOutOfBounds(a) || a._dead) {
        this._removeAt(i);
      }
    }
  }

  // ── Spawn logic ────────────────────────────────────────────────────────────
  _spawnOne() {
    const roll = Math.random();
    // 60% regular, 25% rich, 15% meteor
    const type = roll < 0.60 ? 'regular'
               : roll < 0.85 ? 'rich'
               :                'meteor';

    const def = ASTEROID_DEFS[type];

    // Pick a spawn point on one of the four map edges
    const { x: sx, y: sy, edge } = this._randomEdgePoint();

    // Direction: 180° arc facing inward from the spawn edge
    const angle = this._inwardAngle(edge);

    let targetNode = null;
    let vx = Math.cos(angle) * def.speed;
    let vy = Math.sin(angle) * def.speed;

    if (type === 'meteor') {
      // Pick the node farthest from spawn point (opposite side of map)
      // to give the player time to react
      const nodeIds = Array.from(this._nodeMap.keys());
      let farthestId = nodeIds[0], farthestDist = 0;
      nodeIds.forEach(nid => {
        const n = this._nodeMap.get(nid);
        const d = Math.sqrt((n.x - sx) ** 2 + (n.y - sy) ** 2);
        if (d > farthestDist) { farthestDist = d; farthestId = nid; }
      });
      targetNode = this._nodeMap.get(farthestId);

      // Aim directly at target
      const dx = targetNode.x - sx;
      const dy = targetNode.y - sy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      vx = (dx / dist) * def.speed;
      vy = (dy / dist) * def.speed;
    }

    const resources = randomResources(def.resources);

    const asteroid = {
      type,
      def,
      x: sx, y: sy,
      vx, vy,
      targetNode,
      resources,
      _dead: false,
      _hitZone: null,
    };

    // Clickable hit zone (invisible circle)
    asteroid._hitZone = this._scene.add.circle(sx, sy, def.radius + 6, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(3);

    asteroid._hitZone.on('pointerdown', () => {
      this._scene.game.events.emit('openAsteroid', { asteroid });
    });
    asteroid._hitZone.on('pointerover', () => {
      asteroid._hovered = true;
    });
    asteroid._hitZone.on('pointerout', () => {
      asteroid._hovered = false;
    });

    this._asteroids.push(asteroid);
  }

  // ── Movement ───────────────────────────────────────────────────────────────
  _moveAsteroid(a, delta) {
    const dt = delta / 1000;
    a.x += a.vx * dt;
    a.y += a.vy * dt;

    // Update hit zone position
    if (a._hitZone) {
      a._hitZone.setPosition(a.x, a.y);
    }

    // Meteor arrival check
    if (a.type === 'meteor' && a.targetNode) {
      const dx = a.targetNode.x - a.x;
      const dy = a.targetNode.y - a.y;
      if (Math.sqrt(dx * dx + dy * dy) < 14) {
        this._triggerMeteorImpact(a);
        a._dead = true;
      }
    }
  }

  // ── Drawing ────────────────────────────────────────────────────────────────
  _drawAsteroid(a) {
    const g   = this._gfx;
    const def = a.def;

    // Glow pulse (subtle)
    const pulse = 0.14 + 0.06 * Math.sin(Date.now() / 400 + a.x);
    g.fillStyle(def.glowColor, pulse);
    g.fillCircle(a.x, a.y, def.radius + 4);

    // Hollow ring body — stroke only, no fill
    g.lineStyle(1.5, def.color, 1);
    g.strokeCircle(a.x, a.y, def.radius);

    // Small bright dot at centre to distinguish from planets
    g.fillStyle(def.color, 0.7);
    g.fillCircle(a.x, a.y, 1.5);

    // Hover ring
    if (a._hovered) {
      g.lineStyle(1.5, def.glowColor, 0.9);
      g.strokeCircle(a.x, a.y, def.radius + 5);
    }

    // Meteor: draw a tail of hollow rings fading out behind it
    if (a.type === 'meteor') {
      const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy) || 1;
      const nx = -a.vx / speed;
      const ny = -a.vy / speed;
      for (let i = 1; i <= 4; i++) {
        const alpha = 0.28 - i * 0.06;
        g.lineStyle(1, 0xff6644, alpha);
        g.strokeCircle(a.x + nx * i * 4, a.y + ny * i * 4, def.radius * (1 - i * 0.18));
      }
    }
  }

  // ── Meteor impact ──────────────────────────────────────────────────────────
  _triggerMeteorImpact(a) {
    const scene = this._scene;
    const node  = a.targetNode;
    const ui    = scene.scene.get('UIScene');

    // Flash effect — quick red circle at impact site
    this._scene.time.delayedCall(0, () => {
      const fx = scene.add.graphics().setDepth(10);
      fx.fillStyle(0xff4422, 0.7);
      fx.fillCircle(node.x, node.y, 36);
      scene.tweens.add({
        targets: fx, alpha: 0, duration: 500,
        onComplete: () => fx.destroy(),
      });
    });

    // Find all stacks at this node
    const stacks = scene.units.filter(
      u => !u._dead && u.currentNode === node.id
    );

    if (stacks.length === 0) {
      ui?.logEvent(`☄ Meteor hit ${node.label} — no units present.`);
      // Still grant resources for the meteor
      this._collectResources(a);
      return;
    }

    let totalDestroyed = 0;
    let totalRepaired  = 0;

    stacks.forEach(stack => {
      const comp = stack.composition;
      const types = ['fighter', 'destroyer', 'cruiser', 'dreadnaught', 'flagship'];

      types.forEach(type => {
        const count = comp[type] || 0;
        if (count === 0) return;

        let destroyed = 0;
        for (let i = 0; i < count; i++) {
          if (Math.random() < 0.30) destroyed++;
        }

        // Cruiser repair: each destroyed cruiser has 50% to come back
        if (type === 'cruiser' && destroyed > 0) {
          let repaired = 0;
          for (let i = 0; i < destroyed; i++) {
            if (Math.random() < 0.5) repaired++;
          }
          destroyed   -= repaired;
          totalRepaired += repaired;
        }

        comp[type]     = count - destroyed;
        totalDestroyed += destroyed;
      });

      stack.updateBadge();

      // Check if flagship was destroyed
      if ((comp.flagship || 0) === 0 && stack.team === 'player') {
        const hadFlagship = stacks.some(
          s => s === stack && (s.composition.flagship || 0) === 0
        );
        // Only trigger defeat if this stack HAD a flagship before impact
        // We track this by checking if total original flagship > current
      }

      // Remove stack if wiped out
      if (Object.values(comp).every(v => v === 0)) {
        scene._handleStackDestroyed(stack);
      } else {
        scene.updateOwnership(node.id);
      }
    });

    const repairNote = totalRepaired > 0 ? ` (${totalRepaired} cruiser(s) repaired)` : '';
    ui?.logEvent(`☄ Meteor struck ${node.label}! ${totalDestroyed} unit(s) destroyed.${repairNote}`);

    // Grant resources to player if they own this node
    if (scene.nodeOwnership.get(node.id) === 'player') {
      this._collectResources(a);
    }

    scene.updateHUD();
  }

  // ── Resource collection (called when player clicks a regular/rich asteroid) ─
  collect(asteroid) {
    if (asteroid._dead) return;
    this._collectResources(asteroid);
    asteroid._dead = true;
    this._scene.scene.get('UIScene')?.logEvent(
      `💰 Collected ${asteroid.def.label}: +${asteroid.resources.food} food, +${asteroid.resources.metal} metal, +${asteroid.resources.fuel} fuel`
    );
  }

  _collectResources(asteroid) {
    const scene = this._scene;
    scene.resources.food  = (scene.resources.food  || 0) + asteroid.resources.food;
    scene.resources.metal = (scene.resources.metal || 0) + asteroid.resources.metal;
    scene.resources.fuel  = (scene.resources.fuel  || 0) + asteroid.resources.fuel;
    scene.updateHUD();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  _randomEdgePoint() {
    const mW = this._mapW, mH = this._mapH;
    const edge = Math.floor(Math.random() * 4); // 0=top 1=right 2=bottom 3=left
    let x, y;
    switch (edge) {
      case 0: x = Math.random() * mW; y = 0;   break;
      case 1: x = mW;  y = Math.random() * mH; break;
      case 2: x = Math.random() * mW; y = mH;  break;
      case 3: x = 0;   y = Math.random() * mH; break;
    }
    return { x, y, edge };
  }

  // Returns a random angle (radians) in the 180° arc facing inward from the edge
  _inwardAngle(edge) {
    // Base inward angle per edge, then ±80° random spread
    const bases = [Math.PI / 2, Math.PI, -Math.PI / 2, 0]; // down, left, up, right
    const spread = (Math.PI * 80) / 180;
    return bases[edge] + (Math.random() * spread * 2 - spread);
  }

  _isOutOfBounds(a) {
    const pad = 60;
    return (
      a.x < -pad || a.x > this._mapW + pad ||
      a.y < -pad || a.y > this._mapH + pad
    );
  }

  _removeAt(i) {
    const a = this._asteroids[i];
    if (a._hitZone) { a._hitZone.destroy(); a._hitZone = null; }
    this._asteroids.splice(i, 1);
  }

  // ── Miner management ──────────────────────────────────────────────────────
  addMiner(nodeId) {
    if (this._miners.find(m => m.homeNode.id === nodeId)) return; // one per node
    const node = this._nodeMap.get(nodeId);
    if (!node) return;
    const miner = new AsteroidMiner(this._scene, node, this);
    this._miners.push(miner);
  }

  removeMiner(nodeId) {
    const idx = this._miners.findIndex(m => m.homeNode.id === nodeId);
    if (idx !== -1) { this._miners[idx].destroy(); this._miners.splice(idx, 1); }
  }

  getMinersForNode(nodeId) {
    return this._miners.filter(m => m.homeNode.id === nodeId);
  }

  destroy() {
    this._miners.forEach(m => m.destroy());
    this._miners = [];
    this._asteroids.forEach(a => { if (a._hitZone) a._hitZone.destroy(); });
    this._asteroids = [];
    this._gfx.destroy();
    this._minerGfx.destroy();
  }
}

export { ASTEROID_DEFS };
