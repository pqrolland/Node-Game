/**
 * NodePanel.js — Node management panel (bottom of screen).
 *
 * HOW THIS SCENE WORKS:
 * ─────────────────────
 * This is a Phaser Scene that runs *in parallel* with GameScene and UIScene.
 * It sits visually on top because it's launched after them.
 *
 * COMMUNICATION:
 *   GameScene  →  NodePanel : game.events (global emitter) fires 'openNode' / 'closeNode'
 *   NodePanel  →  GameScene : game.events fires 'splitStack' with split data
 *
 * We use game.events (the global emitter shared across all scenes) rather than
 * this.events (which is local to one scene) so scenes don't need direct references
 * to each other.
 *
 * LAYOUT (bottom 220px of screen):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  LEFT HALF — Unit Management                                    │
 * │    Stack list → Split controls → Move button                   │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  RIGHT HALF — Node Info                                         │
 * │    Name / type / attributes (food, metal, fuel)                 │
 * │    [Space reserved for buildings]                               │
 * └─────────────────────────────────────────────────────────────────┘
 */

export default class NodePanel extends Phaser.Scene {
  constructor() {
    super({ key: 'NodePanel' });
    this.isOpen     = false;
    this.activeNode = null;   // The node data object currently shown
    this.splitValue = 0;      // How many units to split off
  }

  create() {
    const { width, height } = this.scale;
    this.PANEL_H  = 220;
    this.PANEL_Y  = height - this.PANEL_H;
    this.MID_X    = width / 2;

    // ── Root container (hidden until a node is opened) ─────────────────────
    this.root = this.add.container(0, 0).setVisible(false);

    // ── Dark overlay on map area above panel (dims game slightly) ──────────
    // This is a semi-transparent black rectangle sitting above the panel
    // but below the full screen — gives visual focus to the panel
    const overlay = this.add.rectangle(0, 0, width, this.PANEL_Y, 0x000000, 0.25)
      .setOrigin(0, 0)
      .setInteractive();  // Catches clicks — clicking overlay closes the panel
    overlay.on('pointerdown', () => this.close());
    this.root.add(overlay);

    // ── Panel background ───────────────────────────────────────────────────
    const bg = this.add.rectangle(0, this.PANEL_Y, width, this.PANEL_H, 0x080c14, 0.97)
      .setOrigin(0, 0);
    this.root.add(bg);

    // Top border line
    const topLine = this.add.rectangle(0, this.PANEL_Y, width, 2, 0x2255aa, 0.8)
      .setOrigin(0, 0);
    this.root.add(topLine);

    // Centre divider
    const divider = this.add.rectangle(this.MID_X, this.PANEL_Y + 10, 1, this.PANEL_H - 20, 0x2a4a2a, 1)
      .setOrigin(0.5, 0);
    this.root.add(divider);

    // ── LEFT: Unit Management ──────────────────────────────────────────────
    this._buildUnitPanel();

    // ── RIGHT: Node Info ───────────────────────────────────────────────────
    this._buildNodePanel();

    // ── Listen for open/close events from GameScene ────────────────────────
    // game.events is the GLOBAL emitter — shared by all scenes
    this.game.events.on('openNode',  this.open,  this);
    this.game.events.on('closeNode', this.close, this);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEFT PANEL — Unit Management
  // ══════════════════════════════════════════════════════════════════════════

  _buildUnitPanel() {
    const x  = 16;
    const y  = this.PANEL_Y + 14;
    const pw = this.MID_X - 32;  // Panel width available

    // Section header
    const header = this.add.text(x, y, 'UNIT MANAGEMENT', {
      font: 'bold 11px monospace', color: '#44aaff'
    });
    this.root.add(header);

    // ── Stack list (dynamic — rebuilt on open) ─────────────────────────────
    this.stackListContainer = this.add.container(0, 0);
    this.root.add(this.stackListContainer);

    // ── Split controls ─────────────────────────────────────────────────────
    // Label
    this.splitLabel = this.add.text(x, y + 70, 'Split off:', {
      font: '11px monospace', color: '#7aaa8a'
    });
    this.root.add(this.splitLabel);

    // Minus button
    this.btnMinus = this._makeButton(x + 80, y + 66, ' − ', () => this._adjustSplit(-1));
    this.root.add(this.btnMinus);

    // Split value display
    this.splitDisplay = this.add.text(x + 120, y + 70, '0', {
      font: 'bold 13px monospace', color: '#ffffff'
    }).setOrigin(0.5, 0);
    this.root.add(this.splitDisplay);

    // Plus button
    this.btnPlus = this._makeButton(x + 145, y + 66, ' + ', () => this._adjustSplit(1));
    this.root.add(this.btnPlus);

    // Split & move button
    this.btnSplitMove = this._makeButton(x, y + 100, '  SPLIT & MOVE  ', () => this._doSplit(), 0x0d1e3a, 0x44ff88);
    this.root.add(this.btnSplitMove);

    // Split hint text
    this.splitHint = this.add.text(x, y + 130, 'Select a destination node after splitting', {
      font: '10px monospace', color: '#223366'
    });
    this.root.add(this.splitHint);

    // ── Reserved space label ───────────────────────────────────────────────
    this.add.text(x, y + 155, '[ More unit options coming soon ]', {
      font: '10px monospace', color: '#1a2a44'
    });
    // Note: this.add directly (not via root) is fine for static placeholder text
    // that is always visible regardless of panel state — but here we want it hidden,
    // so we add to root:
    const placeholder = this.add.text(x, y + 155, '[ More unit options coming soon ]', {
      font: '10px monospace', color: '#1a2a44'
    });
    this.root.add(placeholder);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RIGHT PANEL — Node Info
  // ══════════════════════════════════════════════════════════════════════════

  _buildNodePanel() {
    const x = this.MID_X + 16;
    const y = this.PANEL_Y + 14;

    // Node name (dynamic)
    this.nodeName = this.add.text(x, y, '', {
      font: 'bold 16px monospace', color: '#ffffff'
    });
    this.root.add(this.nodeName);

    // Node type badge (dynamic)
    this.nodeType = this.add.text(x, y + 24, '', {
      font: '11px monospace', color: '#44aaff'
    });
    this.root.add(this.nodeType);

    // ── Attributes header ──────────────────────────────────────────────────
    const attrHeader = this.add.text(x, y + 46, 'ATTRIBUTES', {
      font: 'bold 10px monospace', color: '#4477aa'
    });
    this.root.add(attrHeader);

    // ── Resource bars (food, metal, fuel) ─────────────────────────────────
    // Each bar is: label + filled bar (two rectangles) + value text
    // We store references so we can update them when a node is opened
    this.resBars = {};
    const resources = [
      { key: 'food',  label: '🌾 Food',  color: 0x88cc44 },
      { key: 'metal', label: '⚙ Metal',  color: 0x8888cc },
      { key: 'fuel',  label: '⛽ Fuel',  color: 0xcc8844 },
    ];

    resources.forEach(({ key, label, color }, i) => {
      const rowY    = y + 64 + i * 30;
      const barX    = x + 70;
      const barW    = 160;
      const barH    = 12;
      const maxVal  = 10;

      // Label
      const lbl = this.add.text(x, rowY, label, {
        font: '11px monospace', color: '#7aaa8a'
      });
      this.root.add(lbl);

      // Bar background (empty track)
      const track = this.add.rectangle(barX, rowY + 2, barW, barH, 0x0d1a2e, 1)
        .setOrigin(0, 0);
      this.root.add(track);

      // Bar fill (width set dynamically)
      const fill = this.add.rectangle(barX, rowY + 2, 0, barH, color, 1)
        .setOrigin(0, 0);
      this.root.add(fill);

      // Value text
      const val = this.add.text(barX + barW + 8, rowY, '', {
        font: '11px monospace', color: '#aaaaaa'
      });
      this.root.add(val);

      // Store refs for update
      this.resBars[key] = { fill, val, barW, maxVal };
    });

    // ── Reserved space for buildings ───────────────────────────────────────
    const buildingY = y + 160;
    const bldPlaceholder = this.add.text(x, buildingY, 'BUILDINGS', {
      font: 'bold 10px monospace', color: '#4477aa'
    });
    this.root.add(bldPlaceholder);

    const bldSub = this.add.text(x, buildingY + 16, '[ Building slots coming soon ]', {
      font: '10px monospace', color: '#1a2a44'
    });
    this.root.add(bldSub);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Open / Close
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * open(node, stacks)
   * Called by GameScene via game.events.emit('openNode', node, stacks)
   * @param {object}   node   - the node data object from MapGraph
   * @param {Unit[]}   stacks - player stacks currently on this node
   */
  open(node, stacks) {
    this.activeNode  = node;
    this.activeStacks = stacks || [];
    this.splitValue  = 0;

    this._refreshStackList();
    this._refreshNodeInfo();
    this.root.setVisible(true);
    this.isOpen = true;
  }

  close() {
    if (!this.isOpen) return;
    this.root.setVisible(false);
    this.isOpen      = false;
    this.activeNode  = null;
    this.activeStacks = [];
    this.splitValue  = 0;
    this.stackListContainer.removeAll(true);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Dynamic content refresh
  // ══════════════════════════════════════════════════════════════════════════

  _refreshStackList() {
    // Clear previous list
    this.stackListContainer.removeAll(true);

    const x = 16;
    const y = this.PANEL_Y + 34;

    if (this.activeStacks.length === 0) {
      const empty = this.add.text(x, y, 'No friendly units at this node', {
        font: '11px monospace', color: '#223366'
      });
      this.stackListContainer.add(empty);
      this.splitLabel.setVisible(false);
      this.btnMinus.setVisible(false);
      this.btnPlus.setVisible(false);
      this.splitDisplay.setVisible(false);
      this.btnSplitMove.setVisible(false);
      this.splitHint.setVisible(false);
      return;
    }

    this.splitLabel.setVisible(true);
    this.btnMinus.setVisible(true);
    this.btnPlus.setVisible(true);
    this.splitDisplay.setVisible(true);
    this.btnSplitMove.setVisible(true);
    this.splitHint.setVisible(true);

    // Show each stack as a row
    this.activeStacks.forEach((stack, i) => {
      const rowY = y + i * 22;

      // Highlight selected stack
      const isSelected = i === 0; // Default to first stack
      const bg = this.add.rectangle(x - 4, rowY - 2, 220, 18,
        isSelected ? 0x0d1e3a : 0x0d180d, 1).setOrigin(0, 0);

      const txt = this.add.text(x, rowY,
        `▶ Stack ${i + 1}  —  ${stack.stackSize} units  [${stack.isMoving ? 'Moving' : 'Idle'}]`, {
        font: '11px monospace',
        color: isSelected ? '#44ff88' : '#7aaa8a'
      });

      this.stackListContainer.add(bg);
      this.stackListContainer.add(txt);
    });

    this._refreshSplitDisplay();
  }

  _refreshNodeInfo() {
    const node = this.activeNode;
    if (!node) return;

    this.nodeName.setText(node.label);
    this.nodeType.setText(node.type.toUpperCase());

    // Update each resource bar
    for (const [key, bar] of Object.entries(this.resBars)) {
      const value   = node[key] ?? 0;
      const fillW   = Math.round((value / bar.maxVal) * bar.barW);
      bar.fill.width = fillW;
      bar.val.setText(`${value}/10`);
    }
  }

  _refreshSplitDisplay() {
    this.splitDisplay.setText(String(this.splitValue));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Split logic
  // ══════════════════════════════════════════════════════════════════════════

  _adjustSplit(delta) {
    if (!this.activeStacks.length) return;
    const maxSplit = this.activeStacks[0].stackSize - 1; // Must leave at least 1
    this.splitValue = Phaser.Math.Clamp(this.splitValue + delta, 0, maxSplit);
    this._refreshSplitDisplay();
  }

  _doSplit() {
    if (this.splitValue <= 0 || !this.activeStacks.length) return;
    const sourceStack = this.activeStacks[0];

    // Tell GameScene to perform the split via the global event emitter
    // GameScene listens for 'splitStack' and handles the actual unit creation
    this.game.events.emit('splitStack', {
      sourceStack,
      splitAmount: this.splitValue,
      nodeId: this.activeNode.id
    });

    this.splitHint.setText('Now click a destination node to move the new stack');
    this.splitValue = 0;
    this._refreshSplitDisplay();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * _makeButton(x, y, label, onClick, bgColor, textColor)
   * A simple clickable button: filled rectangle + text on top.
   * Returns a Container so it can be added to this.root.
   */
  _makeButton(x, y, label, onClick, bgColor = 0x1a2a1a, textColor = '#88cc88') {
    const txt = this.add.text(0, 0, label, {
      font: '11px monospace', color: textColor
    });
    const w   = txt.width + 12;
    const h   = txt.height + 6;

    const bg = this.add.rectangle(0, 0, w, h, bgColor, 1)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    bg.on('pointerover', () => bg.setFillStyle(bgColor + 0x111111));
    bg.on('pointerout',  () => bg.setFillStyle(bgColor));
    bg.on('pointerdown', onClick);

    txt.setPosition(6, 3);

    const container = this.add.container(x, y, [bg, txt]);
    return container;
  }
}
