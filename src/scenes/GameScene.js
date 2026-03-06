import Unit from '../units/Unit.js';
import { NODES, EDGES, buildAdjacency, findPath } from '../map/MapGraph.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.selectedStack = null;
    this.nodeMap       = new Map();
    this.adjacency     = null;
    this.units              = [];
    this.pendingSplitStack  = null;
    this.nodePanelOpen      = false;
    this.nodeOwnership      = new Map();  // nodeId → team string | null
    this.resources          = { food: 0, metal: 0, fuel: 0 };
    this.resourceTickTimer  = 0;
    this.RESOURCE_TICK_MS   = 3000;  // 3 seconds
    this.unitProduction     = new Map(); // nodeId → { elapsed, duration, arcG }
    this._CARD_W            = 108; // matches CARD_W in NodePanel
  }

  create() {
    NODES.forEach(n => this.nodeMap.set(n.id, n));
    this.adjacency = buildAdjacency(EDGES);

    // Assign planet types randomly each playthrough
    const PLANET_TYPES = ['molten', 'habitable', 'barren', 'sulfuric'];
    this.nodeMap.forEach(node => {
      node.type = PLANET_TYPES[Math.floor(Math.random() * PLANET_TYPES.length)];
    });

    // Snapshot base resource values before any buildings apply bonuses
    this.nodeMap.forEach(node => {
      node.baseFood  = node.food;
      node.baseMetal = node.metal;
      node.baseFuel  = node.fuel;
    });

    this.mapGfx      = this.add.graphics();
    this.ownershipGfx = this.add.graphics().setDepth(4);  // above map, below units
    this.drawMap();

    // Spawn on first and last nodes of the spiral
    const nodeIds = Array.from(this.nodeMap.keys());
    this.spawnStack(nodeIds[0], 'player', 8);
    this.spawnStack(nodeIds[1], 'player', 3);
    this.spawnStack(nodeIds[nodeIds.length - 1], 'enemy', 6);
    this.spawnStack(nodeIds[nodeIds.length - 2], 'enemy', 4);

    // Invisible click zones over each node
    NODES.forEach(node => {
      const zone = this.add.circle(node.x, node.y, 28, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });
      zone.nodeId = node.id;
      zone.on('pointerdown', () => this.onNodeClicked(node.id));
      zone.on('pointerover', () => this.onNodeHover(node.id, true));
      zone.on('pointerout',  () => this.onNodeHover(node.id, false));
    });

    this.events.on('unitArrivedAtNode', this.handleArrival, this);

    // UI bar is 80px tall — extend the map bounds downward by that amount
    // so the camera can scroll down far enough to bring bottom nodes
    // up above the UI bar.
    const UI_BAR_H = 80;
    // Large bounds so player can scroll to any node when zoomed in
    this.cameras.main.setBounds(-640, -360, 2560, 1440 + UI_BAR_H);
    // Centre camera on the middle of the map (where spiral is centred)
    this.cameras.main.centerOn(640, 360);
    this.cursors = this.input.keyboard.createCursorKeys();
    // { capture: false } means Phaser won't stopPropagation on these keys,
    // so they keep working even when other scenes are running on top.
    this.wasd = this.input.keyboard.addKeys(
      { W: Phaser.Input.Keyboard.KeyCodes.W,
        A: Phaser.Input.Keyboard.KeyCodes.A,
        S: Phaser.Input.Keyboard.KeyCodes.S,
        D: Phaser.Input.Keyboard.KeyCodes.D },
      false,   // enableCapture = false — don't swallow the keydown event
      false    // emitOnRepeat
    );
    this.input.on('wheel', (ptr, objs, dx, dy) => {
      const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.6, 2);
      this.cameras.main.setZoom(zoom);
    });

    // Escape deselects the current stack without opening the panel
    this.input.keyboard.on('keydown-ESC', () => this.deselectAll());

    this.previewGfx = this.add.graphics().setDepth(5);
    this.scene.launch('UIScene');
    this.scene.launch('NodePanel');

    // Listen for split requests from NodePanel
    this.game.events.on('splitStack', this.handleSplit, this);

    // Listen for building additions — apply bonuses to node resource values
    this.game.events.on('buildingAdded', ({ nodeId, bldId }) => {
      this.handleBuildingAdded(nodeId, bldId);
    });

    // Deduct resources when a building is queued
    this.game.events.on('deductResources', ({ food, metal, fuel }) => {
      this.resources.food  = Math.max(0, this.resources.food  - (food  || 0));
      this.resources.metal = Math.max(0, this.resources.metal - (metal || 0));
      this.resources.fuel  = Math.max(0, this.resources.fuel  - (fuel  || 0));
      this.updateHUD();
    });

    // Track whether the node panel is open so clicks behave differently
    this.nodePanelOpen = false;
    this.game.events.on('openNode',  () => { this.nodePanelOpen = true; });
    this.game.events.on('closeNode', () => { this.nodePanelOpen = false; });
  }

  update(time, delta) {
    this.handleCameraScroll();
    this.units.forEach(u => u.update(this.nodeMap, delta));
    this._tickResources(delta);
    this._tickUnitProduction(delta);
  }

  // ── Map rendering ──────────────────────────────────────────────────────

  drawMap() {
    const g = this.mapGfx;
    g.clear();

    // Fill well beyond map bounds so zoom-out never shows engine background
    g.fillStyle(0x080c14, 1);
    g.fillRect(-1280, -720, 3840, 2160);

    // Star field — covers full extended background
    for (let i = 0; i < 400; i++) {
      const sx = Math.floor(Math.random() * 2560) - 640;
      const sy = Math.floor(Math.random() * 1440) - 360;
      const brightness = Math.random();
      const starColor = brightness > 0.8 ? 0xffffff : brightness > 0.5 ? 0xaabbdd : 0x445566;
      g.fillStyle(starColor, brightness * 0.8 + 0.2);
      g.fillRect(sx, sy, 1, 1);
    }

    // Edges / paths
    g.lineStyle(2, 0x1a2a44, 1);
    EDGES.forEach(({ from, to }) => {
      const a = this.nodeMap.get(from);
      const b = this.nodeMap.get(to);
      g.lineBetween(a.x, a.y, b.x, b.y);
    });

    // Nodes
    NODES.forEach(node => {
      const color  = this.nodeColor(node.type);
      const radius = node.type === 'molten' ? 14 : 11;

      g.fillStyle(0x080c14, 1);
      g.fillCircle(node.x, node.y, radius + 3);
      g.fillStyle(color, 1);
      g.fillCircle(node.x, node.y, radius);
      g.lineStyle(2, 0x4488cc, 0.4);
      g.strokeCircle(node.x, node.y, radius);

      this.add.text(node.x, node.y + radius + 10, node.label, {
        font: '11px monospace',
        color: '#7799bb',
      }).setOrigin(0.5, 0).setDepth(6);
    });
  }

  teamColor(team) {
    return { player: 0x44aaff, enemy: 0xff4455 }[team] || 0x888888;
  }

  // ── Ownership ──────────────────────────────────────────────────────────

  // Recalculates who owns each node based on which team has the most units there.
  // A node is owned by the last team to have had majority — once claimed it stays
  // claimed until another team gains majority.
  updateOwnership(nodeId) {
    const stacks = this.units.filter(u => u.currentNode === nodeId && !u.isMoving);

    // Tally units per team at this node
    const tally = {};
    stacks.forEach(u => {
      tally[u.team] = (tally[u.team] || 0) + u.stackSize;
    });

    const teams = Object.entries(tally);
    if (teams.length === 0) {
      // No units — ownership stays with whoever last held it (don't clear)
    } else {
      // Team with most units takes ownership; ties don't change ownership
      teams.sort((a, b) => b[1] - a[1]);
      if (teams.length === 1 || teams[0][1] > teams[1][1]) {
        this.nodeOwnership.set(nodeId, teams[0][0]);
      }
    }

    this.drawOwnershipRings();
  }

  drawOwnershipRings() {
    const g = this.ownershipGfx;
    g.clear();

    this.nodeOwnership.forEach((team, nodeId) => {
      if (!team) return;
      const node   = this.nodeMap.get(nodeId);
      if (!node) return;
      const radius = node.type === 'molten' ? 14 : 11;
      const color  = this.teamColor(team);

      // Outer glow ring
      g.lineStyle(3, color, 0.5);
      g.strokeCircle(node.x, node.y, radius + 6);
      // Inner ownership ring
      g.lineStyle(2, color, 0.9);
      g.strokeCircle(node.x, node.y, radius + 3);
    });
  }

  nodeColor(type) {
    return {
      molten:   0xff5522,  // Volcanic orange-red
      habitable: 0x44aaff, // Cool blue — life-sustaining
      barren:   0x888899,  // Dusty grey
      sulfuric: 0xccdd22,  // Toxic yellow-green
    }[type] || 0x556677;
  }

  // ── Spawning ───────────────────────────────────────────────────────────

  spawnStack(nodeId, team, size) {
    const node = this.nodeMap.get(nodeId);
    const unit = new Unit(this, node, team, size);
    this.units.push(unit);
    this.nodeOwnership.set(nodeId, team);
    this.drawOwnershipRings();
    // HUD update deferred — UIScene may not be launched yet during create()
    this.time && this.time.delayedCall(100, () => this.updateHUD());
    return unit;
  }

  // ── Selection ──────────────────────────────────────────────────────────

  selectStack(unit) {
    this.deselectAll();
    this.selectedStack = unit;
    unit.setSelected(true);
    this.scene.get('UIScene').showStack(unit);
  }

  deselectAll() {
    if (this.selectedStack) {
      this.selectedStack.setSelected(false);
      this.selectedStack = null;
    }
    this.previewGfx.clear();
    this.scene.get('UIScene').clearStack();
  }

  // ── Node interaction ───────────────────────────────────────────────────

  onNodeClicked(nodeId) {
    const node       = this.nodeMap.get(nodeId);
    const stackHere  = this.units.filter(
      u => u.team === 'player' && u.currentNode === nodeId && !u.isMoving
    );

    // ── Pending split: route the new stack to destination ─────────────────
    if (this.pendingSplitStack) {
      if (nodeId !== this.pendingSplitStack.currentNode) {
        this.issueMoveOrder(this.pendingSplitStack, nodeId);
        this.pendingSplitStack = null;
        this.game.events.emit('closeNode');
      }
      return;
    }

    // ── Stack selected: clicking a DIFFERENT node moves it immediately ─────
    if (this.selectedStack && this.selectedStack.currentNode !== nodeId) {
      this.issueMoveOrder(this.selectedStack, nodeId);
      return;
    }

    // ── Stack selected: clicking the SAME node opens the panel ────────────
    if (this.selectedStack && this.selectedStack.currentNode === nodeId) {
      this.deselectAll();
      this.game.events.emit('openNode', node, stackHere);
      return;
    }

    // ── Nothing selected: clicking a node with a friendly stack selects it ─
    if (stackHere.length > 0) {
      this.selectStack(stackHere[0]);
      return;
    }

    // ── Nothing selected, no friendly stack: open node panel ───────────────
    this.game.events.emit('openNode', node, stackHere);
  }

  issueMoveOrder(unit, destNodeId) {
    const path = findPath(unit.currentNode, destNodeId, this.adjacency);
    if (!path) return;
    unit.assignPath(path);
    this.previewGfx.clear();
    this.deselectAll();
  }

  // ── Hover path preview ─────────────────────────────────────────────────

  onNodeHover(nodeId, entering) {
    this.previewGfx.clear();
    if (!entering || !this.selectedStack) return;
    if (nodeId === this.selectedStack.currentNode) return;

    const path = findPath(this.selectedStack.currentNode, nodeId, this.adjacency);
    if (!path) return;

    this.previewGfx.lineStyle(2, 0x44aaff, 0.5);
    for (let i = 0; i < path.length - 1; i++) {
      const a = this.nodeMap.get(path[i]);
      const b = this.nodeMap.get(path[i + 1]);
      this.previewGfx.lineBetween(a.x, a.y, b.x, b.y);
    }
    const dest = this.nodeMap.get(nodeId);
    this.previewGfx.lineStyle(2, 0x44aaff, 0.8);
    this.previewGfx.strokeCircle(dest.x, dest.y, 28);
  }

  // ── Combat / arrival ───────────────────────────────────────────────────

  handleArrival(unit, nodeId) {
    // Collect all OTHER stacks already resting on this node
    const others = this.units.filter(u => u !== unit && u.currentNode === nodeId && !u.isMoving);

    others.forEach(other => {
      if (other.team === unit.team) {
        this.mergeStacks(unit, other);
      } else {
        this.resolveCombat(unit, other);
      }
    });

    this.updateOwnership(nodeId);
    this.updateHUD();
    this.scene.get('UIScene').logEvent(
      unit.team === 'player'
        ? `Stack arrived at ${this.nodeMap.get(nodeId).label}`
        : `Enemy reached ${this.nodeMap.get(nodeId).label}!`
    );
  }

  mergeStacks(arriving, stationary) {
    arriving.stackSize += stationary.stackSize;
    arriving.updateBadge();
    this.removeStack(stationary);
    this.updateOwnership(arriving.currentNode);
    this.updateHUD();
    this.scene.get('UIScene').logEvent(
      `Stacks merged — now ${arriving.stackSize} units`
    );
  }

  resolveCombat(attacker, defender) {
    // Larger stack always wins. Winner loses units equal to the loser's full size.
    // Ties go to the attacker (arriving stack).
    const [winner, loser] = attacker.stackSize >= defender.stackSize
      ? [attacker, defender]
      : [defender, attacker];

    winner.stackSize -= loser.stackSize;
    winner.updateBadge();
    this.removeStack(loser);

    // Exact tie — both destroyed
    if (winner.stackSize <= 0) this.removeStack(winner);

    this.updateOwnership(winner.currentNode);
    this.updateHUD();
    this.scene.get('UIScene').logEvent(
      `⚔ Combat! ${winner.team === 'player' ? 'Player' : 'Enemy'} wins with ${winner.stackSize} remaining`
    );
  }

  handleSplit({ sourceStack, splitAmount, nodeId }) {
    if (!sourceStack || splitAmount <= 0) return;
    if (sourceStack.stackSize <= splitAmount) return;

    // Deduct from source
    sourceStack.stackSize -= splitAmount;
    sourceStack.updateBadge();

    // Create new stack at same node
    const node     = this.nodeMap.get(nodeId);
    const newStack = this.spawnStack(nodeId, sourceStack.team, splitAmount);

    // Store as pending — next node click will move it
    this.pendingSplitStack = newStack;

    // Refresh the panel with updated stack info
    const stacksHere = this.units.filter(
      u => u.team === 'player' && u.currentNode === nodeId && !u.isMoving
    );
    this.game.events.emit('openNode', node, stacksHere);
  }

  removeStack(unit) {
    this.units = this.units.filter(u => u !== unit);
    if (this.selectedStack === unit) this.deselectAll();
    unit.destroy();
    this.updateHUD();
  }

  // ── Buildings ─────────────────────────────────────────────────────────

  handleBuildingAdded(nodeId, bldId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;

    // Import bonuses from building definition
    // We inline the bonuses here to avoid a circular import with NodePanel
    const BONUSES = {
      farm:             { food:  1 },
      metal_extractor:  { metal: 1 },
      fuel_extractor:   { fuel:  1 },
      naval_base:       {},
    };

    const bonus = BONUSES[bldId] || {};
    Object.entries(bonus).forEach(([res, val]) => {
      node[res] = (node[res] || 0) + val;
    });

    // Naval Base: start unit production timer for this node
    if (bldId === 'naval_base' && !this.unitProduction.has(nodeId)) {
      this.unitProduction.set(nodeId, { elapsed: 0, duration: 15000, arcG: null });
    }

    // Notify NodePanel to refresh its resource display
    this.game.events.emit('nodeResourcesUpdated', nodeId);
  }

  // ── Resource tick ─────────────────────────────────────────────────────

  _tickResources(delta) {
    this.resourceTickTimer += delta;
    if (this.resourceTickTimer < this.RESOURCE_TICK_MS) return;
    this.resourceTickTimer -= this.RESOURCE_TICK_MS;

    // Sum resources from every planet owned by 'player'
    this.nodeOwnership.forEach((team, nodeId) => {
      if (team !== 'player') return;
      const node = this.nodeMap.get(nodeId);
      if (!node) return;
      this.resources.food  += node.food  || 0;
      this.resources.metal += node.metal || 0;
      this.resources.fuel  += node.fuel  || 0;
    });

    this.updateHUD();
  }

  _tickUnitProduction(delta) {
    this.unitProduction.forEach((prod, nodeId) => {
      // Only produce for player-owned nodes
      if (this.nodeOwnership.get(nodeId) !== 'player') return;

      prod.elapsed += delta;

      // Refresh arc in NodePanel if it's showing this node
      if (prod.arcG && !prod.arcG.destroyed) {
        const progress = Math.min(prod.elapsed / prod.duration, 1);
        prod.arcG.clear();
        prod.arcG.lineStyle(3, 0x1a2a44, 1);
        prod.arcG.beginPath();
        prod.arcG.arc(this._CARD_W - 12, 12, 7, 0, Math.PI * 2);
        prod.arcG.strokePath();
        if (progress > 0) {
          prod.arcG.lineStyle(3, 0x44aaff, 1);
          prod.arcG.beginPath();
          prod.arcG.arc(this._CARD_W - 12, 12, 7, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
          prod.arcG.strokePath();
        }
        prod.arcG.fillStyle(0x44aaff, 0.9);
        prod.arcG.fillCircle(this._CARD_W - 12, 12, 3);
      }

      if (prod.elapsed >= prod.duration) {
        prod.elapsed -= prod.duration;

        // Add one unit to the largest friendly stack at this node, or spawn new
        const node   = this.nodeMap.get(nodeId);
        const stacks = this.units.filter(u => u.team === 'player' && u.currentNode === nodeId && !u.isMoving);
        if (stacks.length > 0) {
          stacks.sort((a, b) => b.stackSize - a.stackSize);
          stacks[0].stackSize++;
          stacks[0].updateBadge();
        } else if (node) {
          // Spawn a new stack of 1 — pass node object as Unit constructor expects
          const newUnit = new Unit(this, node, 'player', 1);
          this.units.push(newUnit);
        }
        this.updateHUD();
      }
    });
  }

  // Recalculates planet count + total units and pushes everything to UIScene
  updateHUD() {
    const ui = this.scene.get('UIScene');
    if (!ui) return;

    // Planet count + type distribution for owned planets
    const typeCounts = { molten: 0, habitable: 0, barren: 0, sulfuric: 0 };
    let planetCount  = 0;
    this.nodeOwnership.forEach((team, nodeId) => {
      if (team !== 'player') return;
      planetCount++;
      const node = this.nodeMap.get(nodeId);
      if (node && typeCounts[node.type] !== undefined) typeCounts[node.type]++;
    });

    // Total player units across all stacks
    const totalUnits = this.units
      .filter(u => u.team === 'player')
      .reduce((sum, u) => sum + u.stackSize, 0);

    // Build per-planet breakdown for tooltip
    const breakdown = [];
    this.nodeOwnership.forEach((team, nodeId) => {
      if (team !== 'player') return;
      const node = this.nodeMap.get(nodeId);
      if (!node) return;
      breakdown.push({
        label: node.label,
        food:  node.food  || 0,
        metal: node.metal || 0,
        fuel:  node.fuel  || 0,
      });
    });

    ui.updatePlayerInfo('Player 1', planetCount, typeCounts);
    ui.updateResources({
      units: totalUnits,
      food:  this.resources.food,
      metal: this.resources.metal,
      fuel:  this.resources.fuel,
    }, breakdown);
  }

  // ── Camera ─────────────────────────────────────────────────────────────

  handleCameraScroll() {
    const speed = 6;
    const cam   = this.cameras.main;
    if (this.cursors.left.isDown  || this.wasd.A.isDown) cam.scrollX -= speed;
    if (this.cursors.right.isDown || this.wasd.D.isDown) cam.scrollX += speed;
    if (this.cursors.up.isDown    || this.wasd.W.isDown) cam.scrollY -= speed;
    if (this.cursors.down.isDown  || this.wasd.S.isDown) cam.scrollY += speed;
  }
}
