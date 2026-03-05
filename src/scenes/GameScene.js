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
  }

  create() {
    NODES.forEach(n => this.nodeMap.set(n.id, n));
    this.adjacency = buildAdjacency(EDGES);

    this.mapGfx = this.add.graphics();
    this.drawMap();

    this.spawnStack('E', 'player', 8);
    this.spawnStack('F', 'player', 3);
    this.spawnStack('D', 'enemy',  6);
    this.spawnStack('L', 'enemy',  4);

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

    this.cameras.main.setBounds(0, 0, 1280, 720);
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

    // Track whether the node panel is open so clicks behave differently
    this.nodePanelOpen = false;
    this.game.events.on('openNode',  () => { this.nodePanelOpen = true; });
    this.game.events.on('closeNode', () => { this.nodePanelOpen = false; });
  }

  update(time, delta) {
    this.handleCameraScroll();
    this.units.forEach(u => u.update(this.nodeMap, delta));
  }

  // ── Map rendering ──────────────────────────────────────────────────────

  drawMap() {
    const g = this.mapGfx;
    g.clear();

    g.fillStyle(0x0d1a0d, 1);
    g.fillRect(0, 0, 1280, 720);

    // Edges / paths
    g.lineStyle(3, 0x2a4a2a, 1);
    EDGES.forEach(({ from, to }) => {
      const a = this.nodeMap.get(from);
      const b = this.nodeMap.get(to);
      g.lineBetween(a.x, a.y, b.x, b.y);
    });

    // Nodes
    NODES.forEach(node => {
      const color  = this.nodeColor(node.type);
      const radius = node.type === 'fort' ? 14 : 11;

      g.fillStyle(0x0d1a0d, 1);
      g.fillCircle(node.x, node.y, radius + 3);
      g.fillStyle(color, 1);
      g.fillCircle(node.x, node.y, radius);
      g.lineStyle(2, 0x88ffaa, 0.3);
      g.strokeCircle(node.x, node.y, radius);

      this.add.text(node.x, node.y + radius + 10, node.label, {
        font: '11px monospace',
        color: '#66aa77',
      }).setOrigin(0.5, 0).setDepth(6);
    });
  }

  nodeColor(type) {
    return { fort: 0x8844aa, town: 0x4488ff, junction: 0x447744, resource: 0xffaa22 }[type] || 0x448844;
  }

  // ── Spawning ───────────────────────────────────────────────────────────

  spawnStack(nodeId, team, size) {
    const node = this.nodeMap.get(nodeId);
    const unit = new Unit(this, node, team, size);
    this.units.push(unit);
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

    this.previewGfx.lineStyle(2, 0x44ff88, 0.5);
    for (let i = 0; i < path.length - 1; i++) {
      const a = this.nodeMap.get(path[i]);
      const b = this.nodeMap.get(path[i + 1]);
      this.previewGfx.lineBetween(a.x, a.y, b.x, b.y);
    }
    const dest = this.nodeMap.get(nodeId);
    this.previewGfx.lineStyle(2, 0x44ff88, 0.8);
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
