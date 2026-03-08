/**
 * AsteroidMiner.js
 *
 * One AsteroidMiner is created per asteroid_mine building on a planet.
 * It is autonomous — the player cannot move or split it.
 * It does NOT count toward the combat unit tally.
 * It is indestructible.
 *
 * State machine:
 *   'idle'    – sitting on home planet, waiting for an asteroid in range
 *   'flying'  – moving toward an asteroid to mine it
 *   'mining'  – attached to an asteroid, extracting resources
 *   'returning' – flying back to home planet carrying resources
 *
 * Rendered as a small cyan diamond directly in GameScene's graphics layer.
 */

const MINER_SPEED       = 90;   // px/sec — faster than asteroids
const MINE_RANGE        = 160;  // px — radius around home planet
const MINING_RATE_MS    = 4000; // ms to fully mine an asteroid
const MINER_COLOR       = 0x44ffdd;
const MINER_GLOW        = 0x88ffee;

export default class AsteroidMiner {
  /**
   * @param {Phaser.Scene}    scene
   * @param {object}          homeNode   – { id, x, y, label }
   * @param {AsteroidManager} manager
   */
  constructor(scene, homeNode, manager) {
    this._scene    = scene;
    this.homeNode  = homeNode;
    this._manager  = manager;

    this.x         = homeNode.x;
    this.y         = homeNode.y;
    this.state     = 'idle';
    this._target   = null;   // current asteroid being chased / mined
    this._mineElapsed = 0;
    this._dead     = false;

    // Cargo hold — accumulated resources before deposit
    this.cargo = { food: 0, metal: 0, fuel: 0 };

    // No hit zone — miner is not directly clickable.
    // Use the planet node or the asteroid panel to inspect miner status.
    this._hitZone = null;
  }

  // ── Main update ─────────────────────────────────────────────────────────────
  update(delta, asteroids) {
    if (this._dead) return;

    switch (this.state) {
      case 'idle':      this._updateIdle(asteroids); break;
      case 'flying':    this._updateFlying(delta, asteroids); break;
      case 'mining':    this._updateMining(delta); break;
      case 'returning': this._updateReturning(delta); break;
    }

    // (no hit zone to sync)
  }

  // ── States ──────────────────────────────────────────────────────────────────

  _updateIdle(asteroids) {
    // Scan for the nearest asteroid within range
    const target = this._nearestInRange(asteroids);
    if (target) {
      this._target = target;
      target._minedBy = this;
      this.state   = 'flying';
      this._scene.game.events.emit('asteroidMinerStateChanged', this._target);
    }
  }

  _updateFlying(delta, asteroids) {
    // If target died or was claimed by another miner, give up and return home
    if (!this._target || this._target._dead || (this._target._minedBy && this._target._minedBy !== this)) {
      this._target = null;
      this.state   = 'returning';
      return;
    }

    // If target left range, abandon and return
    if (!this._inRange(this._target)) {
      this._target._minedBy = null;
      this._target = null;
      this.state   = 'returning';
      return;
    }

    // Fly toward target
    const arrived = this._moveToward(this._target.x, this._target.y, delta);
    if (arrived) {
      this.state        = 'mining';
      this._mineElapsed = 0;
      this._scene.game.events.emit('asteroidMinerStateChanged', this._target);
    }
  }

  _updateMining(delta) {
    if (!this._target || this._target._dead) {
      // Asteroid was destroyed (meteor hit?) — return with whatever we have
      this._target = null;
      this.state   = 'returning';
      return;
    }

    // If asteroid left range, return early with partial resources
    if (!this._inRange(this._target)) {
      this._depositCargo(this._target);
      const prevTarget = this._target;
      const wasMeteorLeave = this._target.type === 'meteor';
      this._target._minedBy = null;
      this._target._dead    = true;
      this._target = null;
      this.state   = 'returning';
      if (wasMeteorLeave) {
        const ui = this._scene.scene.get('UIScene');
        ui?.logEvent(`⛏ Miner mined meteor early — impact prevented!`);
      }
      this._scene.game.events.emit('asteroidMinerStateChanged', prevTarget);
      return;
    }

    // Mine over time — stay glued to asteroid position
    this.x = this._target.x;
    this.y = this._target.y;

    this._mineElapsed += delta;
    if (this._mineElapsed >= MINING_RATE_MS) {
      // Fully mined — collect all resources, dissolve asteroid
      this._depositCargo(this._target);
      const prevTarget2 = this._target;
      this._target._minedBy = null;
      this._target._dead    = true;
      this._target = null;
      this.state   = 'returning';
      this._scene.game.events.emit('asteroidMinerStateChanged', prevTarget2);
    }
  }

  _updateReturning(delta) {
    const arrived = this._moveToward(this.homeNode.x, this.homeNode.y, delta);
    if (arrived) {
      // Deposit cargo into game resources
      const scene = this._scene;
      if (this.cargo.food + this.cargo.metal + this.cargo.fuel > 0) {
        scene.resources.food  = (scene.resources.food  || 0) + this.cargo.food;
        scene.resources.metal = (scene.resources.metal || 0) + this.cargo.metal;
        scene.resources.fuel  = (scene.resources.fuel  || 0) + this.cargo.fuel;
        scene.scene.get('UIScene')?.logEvent(
          `⛏ Miner returned: +${this.cargo.food}f +${this.cargo.metal}m +${this.cargo.fuel}fu`
        );
        scene.updateHUD();
        this.cargo = { food: 0, metal: 0, fuel: 0 };
      }
      this.state = 'idle';
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _depositCargo(asteroid) {
    // Load asteroid's remaining resources into cargo hold
    this.cargo.food  += asteroid.resources.food  || 0;
    this.cargo.metal += asteroid.resources.metal || 0;
    this.cargo.fuel  += asteroid.resources.fuel  || 0;
    // Zero out the asteroid's resources
    asteroid.resources = { food: 0, metal: 0, fuel: 0 };
  }

  _nearestInRange(asteroids) {
    let bestMeteor = null, bestMeteorDist = Infinity;
    let bestOther  = null, bestOtherDist  = Infinity;
    for (const a of asteroids) {
      if (a._dead || a._minedBy) continue;
      const d = this._distTo(a.x, a.y);
      if (d >= MINE_RANGE) continue;
      if (a.type === 'meteor') {
        // Prioritise meteors heading toward this miner's planet
        if (a.targetNode?.id === this.homeNode.id && d < bestMeteorDist) {
          bestMeteorDist = d; bestMeteor = a;
        } else if (!bestMeteor && d < bestMeteorDist) {
          bestMeteorDist = d; bestMeteor = a;
        }
      } else {
        if (d < bestOtherDist) { bestOtherDist = d; bestOther = a; }
      }
    }
    // Meteors take absolute priority — protect the planet first
    return bestMeteor || bestOther;
  }

  _inRange(asteroid) {
    return this._distTo(asteroid.x, asteroid.y) < MINE_RANGE + 30; // +30 hysteresis
  }

  _distTo(tx, ty) {
    const dx = tx - this.homeNode.x;
    const dy = ty - this.homeNode.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Move toward (tx,ty) at MINER_SPEED. Returns true when arrived (within 4px).
  _moveToward(tx, ty, delta) {
    const dx   = tx - this.x;
    const dy   = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = MINER_SPEED * delta / 1000;
    if (dist <= step + 1) {
      this.x = tx; this.y = ty;
      return true;
    }
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    return false;
  }

  // ── Draw ────────────────────────────────────────────────────────────────────
  draw(gfx) {
    if (this._dead) return;

    const x = this.x, y = this.y;
    const s = 5; // half-size of diamond

    // Glow when mining
    if (this.state === 'mining') {
      const pulse = 0.3 + 0.15 * Math.sin(Date.now() / 200);
      gfx.fillStyle(MINER_GLOW, pulse);
      gfx.fillCircle(x, y, s + 6);
    }

    // Diamond body
    gfx.fillStyle(MINER_COLOR, 1);
    gfx.fillTriangle(x, y - s,  x + s, y,  x, y + s);   // right half
    gfx.fillTriangle(x, y - s,  x - s, y,  x, y + s);   // left half

    // Bright core
    gfx.fillStyle(0xffffff, 0.6);
    gfx.fillCircle(x, y, 1.5);

    // Hover ring
    if (this._hovered) {
      gfx.lineStyle(1, MINER_GLOW, 0.9);
      gfx.strokeCircle(x, y, s + 5);
    }

    // Cargo indicator — small dot if carrying resources
    if (this.cargo.food + this.cargo.metal + this.cargo.fuel > 0) {
      gfx.fillStyle(0xffdd44, 0.9);
      gfx.fillCircle(x + s, y - s, 2.5);
    }
  }

  // Draw the mining radius ring around home planet
  drawRadius(gfx, selected) {
    if (this._dead) return;
    const alpha = selected ? 0.35 : 0.08;
    gfx.lineStyle(1, MINER_COLOR, alpha);
    gfx.strokeCircle(this.homeNode.x, this.homeNode.y, MINE_RANGE);
    if (selected) {
      gfx.lineStyle(1, MINER_GLOW, 0.12);
      gfx.strokeCircle(this.homeNode.x, this.homeNode.y, MINE_RANGE + 4);
    }
  }

  destroy() {
    this._dead = true;
    // no hit zone to destroy
    if (this._target) { this._target._minedBy = null; }
  }

  get miningProgress() {
    if (this.state !== 'mining') return 0;
    return Math.min(this._mineElapsed / MINING_RATE_MS, 1);
  }
}

export { MINE_RANGE, MINER_COLOR };
