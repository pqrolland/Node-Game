import Unit, { emptyComposition, compositionTotal, dominantType } from '../units/Unit.js';
import AsteroidManager from '../asteroids/AsteroidManager.js';
import { generateMapForPlayers, buildAdjacency, findPath } from '../map/MapGraph.js';
import CombatManager, { syncUnitHP } from '../combat/CombatManager.js';
import PerkManager from '../perks/PerkManager.js';

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

  init(data) {
    // Receive config from MainMenuScene (or defaults for direct launch)
    this.playerCount = (data && data.playerCount) ? data.playerCount : 1;
    this.testMode    = !!(data && data.testMode);

    // Reset all mutable state so re-entering the scene is fully clean
    this.selectedStack      = null;
    this.nodeMap            = new Map();
    this.adjacency          = null;
    this.units              = [];
    this.pendingSplitStack  = null;
    this.nodePanelOpen      = false;
    this.nodeOwnership      = new Map();
    this.resources          = { food: 0, metal: 0, fuel: 0 };
    this.resourceTickTimer  = 0;
    this.unitProduction     = new Map();
  }

  create() {
    console.log('[GameScene] create() called, testMode=', this.testMode);
    // ── Map setup: normal game vs. test environment ───────────────────────
    if (this.testMode) {
      this._createTestMap();
    } else {
      this._createNormalMap();
    }

    // ── Asteroid manager ──────────────────────────────────────────────
    this.asteroidManager = new AsteroidManager(this, this._mapW, this._mapH, this.nodeMap);

    // Activate pre-placed test buildings now that asteroidManager exists
    if (this.testMode) {
      for (const node of this._nodes) {
        for (const bldId of node.buildings) {
          if (bldId === '__planet__') continue;
          this.handleBuildingAdded(node.id, bldId);
        }
      }
    }

    // ── Asteroid click → open panel ───────────────────────────────────────
    this.game.events.on('openAsteroid', ({ asteroid }) => {
      this.game.events.emit('openAsteroidPanel', { asteroid });
    });
    this.game.events.on('openMiner', ({ miner }) => {
      this.game.events.emit('openMinerPanel', { miner });
    });

    // Invisible click zones over each node
    this._nodes.forEach(node => {
      const zone = this.add.circle(node.x, node.y, 28, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });
      zone.nodeId = node.id;
      zone.on('pointerdown', () => this.onNodeClicked(node.id));
      zone.on('pointerover', () => this.onNodeHover(node.id, true));
      zone.on('pointerout',  () => this.onNodeHover(node.id, false));
    });

    this.events.on('unitArrivedAtNode', this.handleArrival, this);

    const UI_BAR_H = 80;
    // Camera bounds span the full generated map (doubled for scroll room)
    const bW = this._mapW * 2;
    const bH = this._mapH * 2;
    this.cameras.main.setBounds(
      -this._mapW / 2, -this._mapH / 2,
      bW, bH + UI_BAR_H
    );
    this.cameras.main.centerOn(this._mapW / 2, this._mapH / 2);
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
      const combat = this.scene.get('CombatScene');
      if (combat?._open || combat?._historyOpen) return;
      const zoom = Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.001, 0.6, 2);
      this.cameras.main.setZoom(zoom);
    });

    // Escape deselects the current stack without opening the panel
    this.input.keyboard.on('keydown-ESC', () => this.deselectAll());

    this.previewGfx    = this.add.graphics().setDepth(5);
    this.perkManager   = new PerkManager(this);
    this.combatManager = new CombatManager(this);
    this.scene.launch('UIScene');
    this.scene.launch('NodePanel');
    this.scene.launch('TooltipScene');
    this.scene.launch('ResearchScene');
    this.scene.launch('CombatScene');

    // ── Test-mode starting resources & RP ────────────────────────────────
    if (this.testMode) {
      this.resources.food  = 1000;
      this.resources.metal = 1000;
      this.resources.fuel  = 1000;
      // Defer until UIScene/ResearchScene are ready to receive the event
      this.time.delayedCall(200, () => {
        this.game.events.emit('researchAddRP', 1000);
        this.updateHUD();
      });
    }

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

    // ── Return to menu (from test environment back button) ────────────────
    this.game.events.once('returnToMenu', () => {
      console.log('[GameScene] returnToMenu received');
      ['UIScene','NodePanel','TooltipScene','ResearchScene','CombatScene'].forEach(k => {
        const active = this.scene.isActive(k);
        const paused = this.scene.isPaused(k);
        console.log(`[GameScene] ${k} active=${active} paused=${paused}`);
        try {
          if (active || paused) this.scene.stop(k);
        } catch(e) { console.error(`[GameScene] stop ${k} error:`, e); }
      });
      console.log('[GameScene] about to start MainMenuScene');
      this.time.delayedCall(0, () => {
        console.log('[GameScene] delayedCall firing, starting MainMenuScene');
        this.scene.start('MainMenuScene');
      });
    });
  }

  // ── Normal procedural map (standard game) ────────────────────────────────
  _createNormalMap() {
    const mapData = generateMapForPlayers(this.playerCount);
    this._nodes   = mapData.nodes;
    this._edges   = mapData.edges;
    this._mapW    = mapData.mapW;
    this._mapH    = mapData.mapH;

    this._nodes.forEach(n => this.nodeMap.set(n.id, n));
    this.adjacency = buildAdjacency(this._edges);

    const PLANET_TYPES = ['molten', 'habitable', 'barren', 'sulfuric'];
    this.nodeMap.forEach(node => {
      node.type      = PLANET_TYPES[Math.floor(Math.random() * PLANET_TYPES.length)];
      node.baseFood  = node.food;
      node.baseMetal = node.metal;
      node.baseFuel  = node.fuel;
    });

    this.mapGfx       = this.add.graphics();
    this.ownershipGfx = this.add.graphics().setDepth(4);
    this.drawMap();

    const nodeIds    = Array.from(this.nodeMap.keys());
    const totalNodes = nodeIds.length;
    const usedNodes  = new Set();

    const pickAdjacentNode = (nodeA) => {
      const neighbours = this.adjacency.get(nodeA) || [];
      const free = neighbours.find(nid => !usedNodes.has(nid));
      return free || neighbours[0] || nodeIds.find(nid => !usedNodes.has(nid));
    };

    for (let p = 0; p < this.playerCount; p++) {
      const team   = p === 0 ? 'player' : `player${p + 1}`;
      let startI   = Math.round((p / this.playerCount) * totalNodes);
      while (usedNodes.has(nodeIds[startI % totalNodes])) startI++;
      const nodeA  = nodeIds[startI % totalNodes];
      const nodeB  = pickAdjacentNode(nodeA);
      usedNodes.add(nodeA);
      usedNodes.add(nodeB);
      this.spawnStack(nodeA, team, 0, { ...emptyComposition(), flagship: 1, fighter: 10 });
      this.spawnStack(nodeB, team, 0, { ...emptyComposition(), fighter: 10 });
    }

    nodeIds.forEach(nid => {
      if (!usedNodes.has(nid)) {
        this.spawnStack(nid, 'neutral', 0, { ...emptyComposition(), fighter: 10 });
      }
    });
  }

  // ── Test environment map ──────────────────────────────────────────────────
  // 3 planets in a triangle. All produce 10/10/10.
  //   test_player    — owned by player, flagship only
  //   test_neutral   — owned by neutral, 10 fighters
  //   test_enemy     — owned by player2 (red), 10 fighters
  //   test_enemy_2   — owned by player2, naval_base (fighters)
  //   test_enemy_3   — owned by player2, destroyer_factory
  //   test_enemy_4   — owned by player2, cruiser_factory
  //   test_enemy_5   — owned by player2, dreadnaught_factory
  //   test_enemy_6   — owned by player2, flagship
  //   All enemy planets connect to test_player
  _createTestMap() {
    const CX = 640, CY = 360;

    const makeNode = (id, label, x, y, buildings = []) => ({
      id, label,
      x: Math.round(x),
      y: Math.round(y),
      food: 10, metal: 10, fuel: 10,
      baseFood: 10, baseMetal: 10, baseFuel: 10,
      type: 'habitable',
      buildings: ['__planet__', ...buildings],
    });

    // ── Existing nodes ────────────────────────────────────────────────────
    // Player at left-centre
    const playerNode = makeNode('test_player', 'Test Base', 220, 360, ['asteroid_mine']);

    // Neutral: above-centre
    const neutralNode = makeNode('test_neutral', 'Neutral', 540, 160, ['asteroid_mine']);

    // Original enemy: below-centre
    const enemyNode = makeNode('test_enemy', 'Fighter Outpost', 540, 560, ['asteroid_mine']);

    // 5 enemy planets in a vertical column on the right side
    const EX = 860;
    const enemyNode2 = makeNode('test_enemy_2', 'Naval Base',          EX, 160, ['naval_base',          'asteroid_mine']);
    const enemyNode3 = makeNode('test_enemy_3', 'Destroyer Factory',   EX, 295, ['destroyer_factory',   'asteroid_mine']);
    const enemyNode4 = makeNode('test_enemy_4', 'Cruiser Factory',     EX, 430, ['cruiser_factory',     'asteroid_mine']);
    const enemyNode5 = makeNode('test_enemy_5', 'Dreadnaught Factory', EX, 565, ['dreadnaught_factory', 'asteroid_mine']);
    const enemyNode6 = makeNode('test_enemy_6', 'Flagship Command',   1100, 360, ['asteroid_mine']);

    // ── New nodes: upside-down T ──────────────────────────────────────────
    // Horizontal bar: player(bottom-right) ← h3 ← h2 ← h1(corner)
    // Vertical stem:  h1(corner) → v1 → v2 → purple(top)
    const H_STEP = 160;  // horizontal spacing
    const V_STEP = 130;  // vertical spacing
    const BASE_X = playerNode.x;     // 220
    const BASE_Y = playerNode.y;     // 360

    // Horizontal bar nodes (going left from player)
    const newH1 = makeNode('test_h1', 'Outpost Alpha',  BASE_X - H_STEP,     BASE_Y, ['asteroid_mine']);
    const newH2 = makeNode('test_h2', 'Outpost Beta',   BASE_X - H_STEP * 2, BASE_Y, ['asteroid_mine']);
    const newH3 = makeNode('test_h3', 'Outpost Gamma',  BASE_X - H_STEP * 3, BASE_Y, ['asteroid_mine']);

    // Vertical stem nodes (going up from h3, the corner of the T)
    const newV1 = makeNode('test_v1', 'Outpost Delta',   BASE_X - H_STEP * 3, BASE_Y - V_STEP,     ['asteroid_mine']);
    const newV2 = makeNode('test_v2', 'Outpost Epsilon', BASE_X - H_STEP * 3, BASE_Y - V_STEP * 2, ['asteroid_mine']);

    // Purple planet (player6) at top of stem
    const purpleNode = makeNode('test_purple', 'Purple Base', BASE_X - H_STEP * 3, BASE_Y - V_STEP * 3, ['naval_base', 'asteroid_mine']);

    this._nodes = [
      playerNode, neutralNode, enemyNode,
      enemyNode2, enemyNode3, enemyNode4, enemyNode5, enemyNode6,
      newH1, newH2, newH3, newV1, newV2, purpleNode,
    ];

    this._edges = [
      // Original connections
      { from: 'test_player',  to: 'test_neutral' },
      { from: 'test_player',  to: 'test_enemy'   },
      { from: 'test_neutral', to: 'test_enemy'   },
      // All enemy planets connect to player
      { from: 'test_player',  to: 'test_enemy_2' },
      { from: 'test_player',  to: 'test_enemy_3' },
      { from: 'test_player',  to: 'test_enemy_4' },
      { from: 'test_player',  to: 'test_enemy_5' },
      { from: 'test_player',  to: 'test_enemy_6' },
      // Upside-down T horizontal bar (player → h1 → h2 → h3)
      { from: 'test_player', to: 'test_h1' },
      { from: 'test_h1',     to: 'test_h2' },
      { from: 'test_h2',     to: 'test_h3' },
      // Vertical stem up from h3 (h3 → v1 → v2 → purple)
      { from: 'test_h3',     to: 'test_v1'    },
      { from: 'test_v1',     to: 'test_v2'    },
      { from: 'test_v2',     to: 'test_purple' },
    ];
    this._mapW = 1280;
    this._mapH = 720;

    this._nodes.forEach(n => this.nodeMap.set(n.id, n));
    this.adjacency = buildAdjacency(this._edges);

    this.mapGfx       = this.add.graphics();
    this.ownershipGfx = this.add.graphics().setDepth(4);
    this.drawMap();

    // ── Spawn units ───────────────────────────────────────────────────────
    // Player
    this.spawnStack('test_player',  'player',  0, { ...emptyComposition(), flagship: 1 });
    // Original neutrals and enemies
    this.spawnStack('test_neutral', 'neutral', 0, { ...emptyComposition(), fighter: 10 });
    this.spawnStack('test_enemy',   'player2', 0, { ...emptyComposition(), fighter: 10 });
    this.spawnStack('test_enemy_2', 'player2', 0, { ...emptyComposition(), fighter: 5  });
    this.spawnStack('test_enemy_3', 'player2', 0, { ...emptyComposition(), destroyer: 5 });
    this.spawnStack('test_enemy_4', 'player2', 0, { ...emptyComposition(), cruiser: 5   });
    this.spawnStack('test_enemy_5', 'player2', 0, { ...emptyComposition(), dreadnaught: 3 });
    this.spawnStack('test_enemy_6', 'player2', 0, { ...emptyComposition(), flagship: 1  });
    // New neutral planets — 10 fighters each
    this.spawnStack('test_h1',     'neutral', 0, { ...emptyComposition(), fighter: 10 });
    this.spawnStack('test_h2',     'neutral', 0, { ...emptyComposition(), fighter: 10 });
    this.spawnStack('test_h3',     'neutral', 0, { ...emptyComposition(), fighter: 10 });
    this.spawnStack('test_v1',     'neutral', 0, { ...emptyComposition(), fighter: 10 });
    this.spawnStack('test_v2',     'neutral', 0, { ...emptyComposition(), fighter: 10 });
    // Purple planet — player6, 10 fighters
    this.spawnStack('test_purple', 'player6', 0, { ...emptyComposition(), fighter: 10 });
  }

  update(time, delta) {
    this.handleCameraScroll();
    this.units.forEach(u => { if (!u._dead) u.update(this.nodeMap, delta); });
    this.asteroidManager?.update(delta);
    this.combatManager?.update(delta);
    this._tickResources(delta);
    this._tickUnitProduction(delta);
  }

  // Called automatically by Phaser when this scene is stopped/restarted.
  // Removes every game.events listener registered by this scene so they don't
  // accumulate and double-fire on the next session.
  shutdown() {
    console.log('[GameScene] shutdown() called');
    const ev = this.game.events;
    ev.removeAllListeners('openAsteroid');
    ev.removeAllListeners('openMiner');
    ev.removeAllListeners('splitStack');
    ev.removeAllListeners('buildingAdded');
    ev.removeAllListeners('deductResources');
    ev.removeAllListeners('openNode');
    ev.removeAllListeners('closeNode');
    ev.removeAllListeners('openAsteroidPanel');
    ev.removeAllListeners('asteroidMinerStateChanged');
    ev.removeAllListeners('nodeResourcesUpdated');
    ev.removeAllListeners('researchAddRP');
    ev.removeAllListeners('researchClosed');
    ev.removeAllListeners('openResearch');
    ev.removeAllListeners('closeResearch');
    ev.removeAllListeners('openCombat');
    ev.removeAllListeners('combatUpdate');
    ev.removeAllListeners('closeCombat');
    ev.removeAllListeners('returnToMenu');
    ev.removeAllListeners('researchUnlocked');

    // Stop child scenes that are still running
    ['UIScene','NodePanel','TooltipScene','ResearchScene','CombatScene'].forEach(k => {
      try {
        if (this.scene.isActive(k) || this.scene.isPaused(k)) this.scene.stop(k);
      } catch(_) {}
    });

    // Clean up units and state
    this.units.forEach(u => { try { u.destroy(); } catch(_) {} });
    this.units = [];
    this.nodeMap.clear();
    this.adjacency = null;
    this.selectedStack = null;
    this.combatManager = null;
    this.asteroidManager = null;
    this.perkManager?.destroy();
    this.perkManager = null;
  }

  // ── Map rendering ──────────────────────────────────────────────────────

  drawMap() {
    const g = this.mapGfx;
    g.clear();

    const mW = this._mapW || 1280;
    const mH = this._mapH || 720;
    g.fillStyle(0x080c14, 1);
    g.fillRect(-mW, -mH, mW * 4, mH * 4);

    // Star field
    const starCount = Math.round(300 + (mW * mH) / 4000);
    for (let i = 0; i < starCount; i++) {
      const sx = Math.floor(Math.random() * mW * 2) - mW / 2;
      const sy = Math.floor(Math.random() * mH * 2) - mH / 2;
      const brightness = Math.random();
      const starColor = brightness > 0.8 ? 0xffffff : brightness > 0.5 ? 0xaabbdd : 0x445566;
      g.fillStyle(starColor, brightness * 0.8 + 0.2);
      g.fillRect(sx, sy, 1, 1);
    }

    // Edges / paths
    g.lineStyle(2, 0x1a2a44, 1);
    (this._edges || []).forEach(({ from, to }) => {
      const a = this.nodeMap.get(from);
      const b = this.nodeMap.get(to);
      g.lineBetween(a.x, a.y, b.x, b.y);
    });

    // Nodes
    (this._nodes || []).forEach(node => {
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

  // ── Team colours ─────────────────────────────────────────────────────
  // Index 0 = player 1 (local human), 1..7 = AI opponents.
  // 'neutral' is a separate faction (grey).
  static PLAYER_COLORS = [
    0x44aaff, // player1 — blue
    0xff4455, // player2 — red
    0x44ff88, // player3 — green
    0xffcc22, // player4 — yellow
    0xff88cc, // player5 — pink
    0xcc66ff, // player6 — purple
    0xff8844, // player7 — orange
    0x22ddcc, // player8 — teal
  ];

  teamColor(team) {
    if (team === 'neutral') return 0x888899;
    // 'player' maps to index 0; 'player2'..'player8' map to 1..7
    const idx = team === 'player' ? 0 : (parseInt(team.replace('player','')) - 1) || 0;
    return GameScene.PLAYER_COLORS[idx] || 0x888888;
  }

  // ── Ownership ──────────────────────────────────────────────────────────

  // Recalculates who owns each node based on which team has the most units there.
  // A node is owned by the last team to have had majority — once claimed it stays
  // claimed until another team gains majority.
  updateOwnership(nodeId) {
    // Only count units that are idle at this node — not moving and not locked in combat
    const stacks = this.units.filter(u => u.currentNode === nodeId && !u.isMoving && !u.inCombat);

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

  spawnStack(nodeId, team, size, composition = null) {
    const node = this.nodeMap.get(nodeId);
    const unit = composition
      ? new Unit(this, node, team, 0, composition)
      : new Unit(this, node, team, size);
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
    // Apply Afterburner speed bonus based on current composition
    unit.speed = this.perkManager
      ? this.perkManager.getAfterburnerSpeed(unit, 90)
      : 90;
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
    const others = this.units.filter(u => u !== unit && u.currentNode === nodeId && !u.isMoving);

    for (const other of others) {
      if (!this.units.includes(unit)) break;
      if (!this.units.includes(other)) continue;

      if (other.team === unit.team) {
        if (other.inCombat) {
          // Reinforce: absorb arriving ships into the in-combat unit seamlessly.
          // syncUnitHP will pick up the new composition on the next round.
          this.reinforceCombatant(unit, other);
        } else {
          this.mergeStacks(unit, other);
        }
      } else {
        this.combatManager.startBattle(unit, other);
      }
    }

    if (this.units.includes(unit)) {
      this.updateOwnership(nodeId);
      this.updateHUD();
      this.scene.get('UIScene').logEvent(
        unit.team === 'player'
          ? `Stack arrived at ${this.nodeMap.get(nodeId).label}`
          : `Enemy reached ${this.nodeMap.get(nodeId).label}!`
      );
    } else {
      this.updateOwnership(nodeId);
      this.updateHUD();
    }
  }

  // Absorb an arriving friendly stack into a unit that is already in combat.
  // The arriving unit is removed silently; its ships join the combatant's
  // composition and unitHP so they fight in the next round automatically.
  reinforceCombatant(arriving, combatant) {
    for (const type of ['fighter','destroyer','cruiser','dreadnaught','flagship']) {
      const count = arriving.composition[type] || 0;
      if (count === 0) continue;
      combatant.composition[type] = (combatant.composition[type] || 0) + count;
      // Add fresh full-HP entries for each new ship
      if (!combatant.unitHP) combatant.unitHP = {};
      if (!combatant.unitHP[type]) combatant.unitHP[type] = [];
      const maxHP = ({ fighter:10, destroyer:20, cruiser:20, dreadnaught:50, flagship:60 })[type] || 10;
      for (let i = 0; i < count; i++) combatant.unitHP[type].push(maxHP);
    }
    combatant.stackSize = ['fighter','destroyer','cruiser','dreadnaught','flagship']
      .reduce((s, t) => s + (combatant.composition[t] || 0), 0);

    // Remove the arriving unit without touching the ongoing battle
    arriving._dead = true;
    this.units = this.units.filter(u => u !== arriving);
    if (this.selectedStack === arriving) this.deselectAll();
    arriving.destroy();

    // Refresh the overlay to show updated counts
    this.combatManager.refreshBattleFor(combatant);

    this.scene.get('UIScene').logEvent(
      `Reinforcements joined — combatant now ${combatant.stackSize} ships`
    );
  }

  mergeStacks(arriving, stationary) {
    for (const type of ['fighter','destroyer','cruiser','dreadnaught','flagship']) {
      arriving.composition[type] = (arriving.composition[type] || 0) + (stationary.composition[type] || 0);
      // Carry over HP arrays from the stationary stack into the arriving one
      if (stationary.unitHP?.[type]?.length) {
        if (!arriving.unitHP) arriving.unitHP = {};
        if (!arriving.unitHP[type]) arriving.unitHP[type] = [];
        arriving.unitHP[type].push(...stationary.unitHP[type]);
      }
    }
    arriving.updateBadge();
    this.removeStack(stationary);
    this.updateOwnership(arriving.currentNode);
    this.updateHUD();
    this.scene.get('UIScene').logEvent(
      `Stacks merged — now ${arriving.stackSize} units`
    );
  }

  // Destroys a stack and checks for flagship loss
  _handleStackDestroyed(unit) {
    const hadFlagship = (unit.composition.flagship || 0) > 0;
    this.removeStack(unit);
    if (hadFlagship && unit.team === 'player') {
      this._triggerPlayerDefeat();
    }
  }

  _triggerPlayerDefeat() {
    // Remove all player units
    const playerUnits = this.units.filter(u => u.team === 'player');
    playerUnits.forEach(u => this.units = this.units.filter(x => x !== u));
    playerUnits.forEach(u => u.destroy());

    // Lose all owned planets
    this.nodeOwnership.forEach((team, nodeId) => {
      if (team === 'player') this.nodeOwnership.delete(nodeId);
    });
    this.drawOwnershipRings();
    this.updateHUD();

    this.scene.get('UIScene').logEvent('💀 FLAGSHIP DESTROYED — YOU LOSE');

    // Show game-over overlay after short delay
    this.time.delayedCall(800, () => {
      this.scene.get('UIScene').showGameOver();
    });
  }

  handleSplit({ sourceStack, splitAmount, splitComp, nodeId }) {
    if (!sourceStack || splitAmount <= 0) return;
    if (sourceStack.stackSize <= splitAmount) return;

    const node = this.nodeMap.get(nodeId);

    // Deduct split composition from source
    const newComp = { ...emptyComposition() };
    for (const type of ['fighter','destroyer','cruiser','dreadnaught','flagship']) {
      const take = Math.min(splitComp?.[type] || 0, sourceStack.composition[type] || 0);
      newComp[type]                    = take;
      sourceStack.composition[type]    = (sourceStack.composition[type] || 0) - take;
    }
    sourceStack.updateBadge();

    // Spawn the new split stack with its composition
    const newStack = new Unit(this, node, sourceStack.team, 0, newComp);
    this.units.push(newStack);
    this.pendingSplitStack = newStack;

    // Refresh panel
    const stacksHere = this.units.filter(
      u => u.team === 'player' && u.currentNode === nodeId && !u.isMoving
    );
    this.game.events.emit('openNode', node, stacksHere);
  }

  removeStack(unit) {
    unit._dead = true;  // flag immediately so in-flight update() guards see it
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
      naval_base:            {},
      destroyer_factory:     {},
      cruiser_factory:       {},
      dreadnaught_factory:   {},
      asteroid_mine:         {},
    };

    const bonus = BONUSES[bldId] || {};
    Object.entries(bonus).forEach(([res, val]) => {
      node[res] = (node[res] || 0) + val;
    });

    // Naval Base and factory buildings: start production timers
    const PRODUCTION = {
      naval_base:           { shipType: 'fighter',     duration: 15000 },
      destroyer_factory:    { shipType: 'destroyer',   duration: 30000 },
      cruiser_factory:      { shipType: 'cruiser',     duration: 30000 },
      dreadnaught_factory:  { shipType: 'dreadnaught', duration: 30000 },
    };
    const prod = PRODUCTION[bldId];
    if (prod) {
      // Key by nodeId + bldId so multiple factories on same node each tick
      const key = `${nodeId}:${bldId}`;
      if (!this.unitProduction.has(key)) {
        this.unitProduction.set(key, { elapsed: 0, duration: prod.duration, shipType: prod.shipType, nodeId, bldId, arcG: null, drawArc: null });
      }
    }

    // Spawn asteroid miner unit when mine is built
    if (bldId === 'asteroid_mine') {
      this.asteroidManager?.addMiner(nodeId);
    }

    // Notify NodePanel to refresh its resource display
    this.game.events.emit('nodeResourcesUpdated', nodeId);
  }

  // ── Resource tick ─────────────────────────────────────────────────────

  _tickResources(delta) {
    this.resourceTickTimer += delta;
    if (this.resourceTickTimer < this.RESOURCE_TICK_MS) return;
    this.resourceTickTimer -= this.RESOURCE_TICK_MS;

    // Perk hook: Iron Reserve — accrued first so any HUD update includes it
    if (this.perkManager?._has('player', 'fl_07')) {
      const flagshipCount = this.units.filter(u => u.team === 'player' && !u._dead && (u.composition?.flagship || 0) > 0).length;
      if (flagshipCount > 0) {
        this.resources.food  += 5 * flagshipCount;
        this.resources.metal += 5 * flagshipCount;
        this.resources.fuel  += 5 * flagshipCount;
      }
    }

    // Sum resources from every planet owned by 'player'
    this.nodeOwnership.forEach((team, nodeId) => {
      if (team !== 'player') return;
      const node = this.nodeMap.get(nodeId);
      if (!node) return;
      this.resources.food  += node.food  || 0;
      this.resources.metal += node.metal || 0;
      this.resources.fuel  += node.fuel  || 0;
    });

    // Accrue 2 research points per tick
    this.game.events.emit('researchAddRP', 2);

    this.updateHUD();
  }

  _tickUnitProduction(delta) {
    this.unitProduction.forEach((prod, key) => {
      const nodeId = prod.nodeId ?? key;
      const owner  = this.nodeOwnership.get(nodeId);
      // Skip unowned and neutral nodes
      if (!owner || owner === 'neutral') return;

      prod.elapsed += delta;

      // Refresh arc — use effective duration so arc reflects Rapid Scramble speed
      if (prod.arcG && !prod.arcG.destroyed && prod.drawArc) {
        const effectiveDuration = this.perkManager
          ? this.perkManager.getRapidScrambleDuration(owner, prod.bldId, prod.duration)
          : prod.duration;
        prod.drawArc(Math.min(prod.elapsed / effectiveDuration, 1));
      }

      const effectiveDur = this.perkManager
        ? this.perkManager.getRapidScrambleDuration(owner, prod.bldId, prod.duration)
        : prod.duration;

      if (prod.elapsed >= effectiveDur) {
        prod.elapsed -= effectiveDur;

        const shipType = prod.shipType || 'fighter';
        const node     = this.nodeMap.get(nodeId);
        const stacks   = this.units.filter(u => u.team === owner && u.currentNode === nodeId && !u.isMoving && !u.inCombat);
        if (stacks.length > 0) {
          stacks.sort((a, b) => b.stackSize - a.stackSize);
          stacks[0].composition[shipType] = (stacks[0].composition[shipType] || 0) + 1;
          stacks[0].stackSize++;
          stacks[0].updateBadge();
          syncUnitHP(stacks[0], this.perkManager);
        } else if (node) {
          const comp    = { ...emptyComposition(), [shipType]: 1 };
          const newUnit = new Unit(this, node, owner, 0, comp);
          this.units.push(newUnit);
        }
        this.updateHUD();
      }
    });

    // Perk hook: Naval Construction — each player flagship produces 1 fighter every 30s
    if (this.perkManager?._has('player', 'fl_09')) {
      if (!this._navalConstructionTimers) this._navalConstructionTimers = new Map();
      for (const unit of this.units) {
        if (unit.team !== 'player' || unit._dead || (unit.composition?.flagship || 0) === 0) continue;
        const id = unit.id ?? unit;
        const elapsed = (this._navalConstructionTimers.get(id) ?? 0) + delta;
        if (elapsed >= 30000) {
          this._navalConstructionTimers.set(id, elapsed - 30000);
          unit.composition.fighter = (unit.composition.fighter || 0) + 1;
          unit.stackSize++;
          unit.updateBadge();
          syncUnitHP(unit, this.perkManager);
        } else {
          this._navalConstructionTimers.set(id, elapsed);
        }
      }
    }
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

    // Iron Reserve — add as a separate breakdown source so tooltip shows it
    if (this.perkManager?._has('player', 'fl_07')) {
      const flagshipCount = this.units.filter(u => u.team === 'player' && !u._dead && (u.composition?.flagship || 0) > 0).length;
      if (flagshipCount > 0) {
        breakdown.push({
          label: `Iron Reserve (×${flagshipCount})`,
          food:  5 * flagshipCount,
          metal: 5 * flagshipCount,
          fuel:  5 * flagshipCount,
        });
      }
    }

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
