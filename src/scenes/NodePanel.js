import { drawShipIcon, SHIP_TYPES } from '../units/Unit.js';

/**
 * NodePanel.js — Node management panel (bottom of screen).
 *
 * LAYOUT (bottom 300px):
 * ┌──────────────────────────┬──────────────────────────────────────────────┐
 * │  LEFT — Unit Management  │  RIGHT — Node Info + Buildings               │
 * │  Stack list              │  Name / type / resource bars                 │
 * │  Split controls          │  ─────────────────────────────               │
 * │                          │  BUILDINGS (3 per row, scrollable)           │
 * │                          │  [ card ][ card ][ card ]                    │
 * │                          │  [ card ][ + Add ]                           │
 * └──────────────────────────┴──────────────────────────────────────────────┘
 *
 * Building cards: rounded rect, icon (top), name (middle), output (bottom)
 * Scroll: mask + container offset — cards scroll vertically inside right panel
 *
 * Modal: full-screen overlay with 3 building options when "Add building" clicked
 */

// ── Building definitions ────────────────────────────────────────────────────
export const BUILDING_DEFS = {
  naval_base: {
    id:     'naval_base',
    name:   'Naval Base',
    output: '+1 unit / 15s',
    cost: { food: 50, metal: 50, fuel: 50 },
    buildTime: 15000,
    drawIcon(gfx, cx, cy) {
      // Underline (waterline)
      gfx.fillStyle(0x666677, 1);
      gfx.fillRect(cx - 14, cy + 6, 28, 3);
      // Narrow tall arrow pointing right (ship profile)
      gfx.fillStyle(0xaaaacc, 1);
      gfx.fillTriangle(
        cx - 12, cy - 6,   // top-left
        cx - 12, cy + 6,   // bottom-left
        cx + 14, cy        // tip (right)
      );
    },
  },
  farm: {
    id:     'farm',
    name:   'Farm',
    output: '+1 Food / tick',
    bonuses: { food: 1 },
    cost: { food: 0, metal: 100, fuel: 100 },
    buildTime: 15000,
    drawIcon(gfx, cx, cy) {
      // Simple cross (crop rows)
      gfx.fillStyle(0x88cc44, 1);
      gfx.fillRect(cx - 2, cy - 12, 4, 24);
      gfx.fillRect(cx - 12, cy - 2, 24, 4);
      // Small circle centre
      gfx.fillStyle(0xccee88, 1);
      gfx.fillCircle(cx, cy, 4);
    },
  },
  metal_extractor: {
    id:     'metal_extractor',
    name:   'Metal Extractor',
    output: '+1 Metal / tick',
    bonuses: { metal: 1 },
    cost: { food: 100, metal: 0, fuel: 100 },
    drawIcon(gfx, cx, cy) {
      // Gear-like octagon
      gfx.fillStyle(0x8888cc, 1);
      gfx.fillRect(cx - 8, cy - 12, 16, 24);
      gfx.fillRect(cx - 12, cy - 8, 24, 16);
      gfx.fillStyle(0x080c14, 1);
      gfx.fillCircle(cx, cy, 5);
    },
  },
  fuel_extractor: {
    id:     'fuel_extractor',
    name:   'Fuel Extractor',
    output: '+1 Fuel / tick',
    bonuses: { fuel: 1 },
    cost: { food: 100, metal: 100, fuel: 0 },
    buildTime: 15000,
    drawIcon(gfx, cx, cy) {
      gfx.fillStyle(0xcc8844, 1);
      gfx.fillTriangle(cx, cy - 14, cx - 10, cy + 8, cx + 10, cy + 8);
      gfx.fillStyle(0xffcc44, 1);
      gfx.fillTriangle(cx, cy - 6, cx - 5, cy + 8, cx + 5, cy + 8);
    },
  },
  destroyer_factory: {
    id:       'destroyer_factory',
    name:     'Destroyer Factory',
    output:   '+1 Destroyer / 30s',
    cost:     { food: 100, metal: 100, fuel: 100 },
    buildTime: 15000,
    produces:  'destroyer',
    produceDuration: 30000,
    drawIcon(gfx, cx, cy) {
      // Twin mountain peaks
      gfx.fillStyle(0xaa66ff, 1);
      gfx.fillTriangle(cx - 8, cy + 7, cx, cy - 5, cx + 2, cy + 7);
      gfx.fillTriangle(cx - 2, cy + 7, cx + 7, cy - 5, cx + 10, cy + 7);
    },
  },
  cruiser_factory: {
    id:       'cruiser_factory',
    name:     'Cruiser Factory',
    output:   '+1 Cruiser / 30s',
    cost:     { food: 200, metal: 200, fuel: 200 },
    buildTime: 15000,
    produces:  'cruiser',
    produceDuration: 30000,
    drawIcon(gfx, cx, cy) {
      // Two diagonal bars
      gfx.fillStyle(0x44ddaa, 1);
      gfx.fillTriangle(cx - 8, cy + 7, cx - 4, cy + 7, cx + 1, cy - 7);
      gfx.fillTriangle(cx - 8, cy + 7, cx - 3, cy - 7, cx + 1, cy - 7);
      gfx.fillTriangle(cx,     cy + 7, cx + 4, cy + 7, cx + 9, cy - 7);
      gfx.fillTriangle(cx,     cy + 7, cx + 5, cy - 7, cx + 9, cy - 7);
    },
  },
  dreadnaught_factory: {
    id:       'dreadnaught_factory',
    name:     'Dreadnaught Factory',
    output:   '+1 Dreadnaught / 30s',
    cost:     { food: 300, metal: 300, fuel: 300 },
    buildTime: 15000,
    produces:  'dreadnaught',
    produceDuration: 30000,
    drawIcon(gfx, cx, cy) {
      // Double right-pointing triangles (fast-forward)
      gfx.fillStyle(0xff8844, 1);
      gfx.fillTriangle(cx - 7, cy - 7, cx + 5, cy - 1, cx - 7, cy + 5);
      gfx.fillStyle(0xff8844, 0.65);
      gfx.fillTriangle(cx - 2, cy - 7, cx + 9, cy - 1, cx - 2, cy + 5);
    },
  },
};

const DEFAULT_COST     = { food: 0, metal: 0, fuel: 0 };
const DEFAULT_BUILD_MS = 15000;

const CARD_W      = 108;
const CARD_H      = 90;
const CARD_GAP    = 8;
const CARDS_PER_ROW = 5;

export default class NodePanel extends Phaser.Scene {
  constructor() {
    super({ key: 'NodePanel' });
    this.isOpen       = false;
    this.activeNode   = null;
    this.splitValue   = 0;
    this.activeStacks = [];

    // Scroll state for building list
    this._scrollY     = 0;
    this._maxScrollY  = 0;

    // Active constructions: [{ nodeId, slotIndex, elapsed, duration, bldId }]
    this._constructions = [];
  }

  update(time, delta) {
    if (!this._constructions.length) return;

    let anyFinished = false;
    this._constructions = this._constructions.filter(c => {
      c.elapsed += delta;
      const progress = Math.min(c.elapsed / c.duration, 1);

      // Update overlay — shrinks upward from bottom, using local card coords
      if (c.overlayGfx && !c.overlayGfx.destroyed) {
        c.overlayGfx.clear();
        const remaining = 1 - progress;
        if (remaining > 0) {
          const h  = Math.round(CARD_H * remaining);
          const lx = c.localX ?? 0;
          const ly = c.localY ?? 0;
          c.overlayGfx.fillStyle(0x000000, 0.55);
          c.overlayGfx.fillRoundedRect(lx, ly + CARD_H - h, CARD_W, h, { tl:0, tr:0, bl:6, br:6 });
        }
      }

      if (c.elapsed >= c.duration) {
        // Construction complete — apply bonus regardless of panel state
        const gs   = this.scene.get('GameScene');
        const node = gs?.nodeMap?.get(c.nodeId);
        if (node) {
          if (node.buildings) {
            const ci = node.buildings.indexOf('__constructing__' + c.bldId);
              if (ci !== -1) node.buildings[ci] = c.bldId;
          }
          this.game.events.emit('buildingAdded', { nodeId: c.nodeId, bldId: c.bldId });
        }
        if (c.overlayGfx && !c.overlayGfx.destroyed) c.overlayGfx.destroy();
        if (this.isOpen && this.activeNode?.id === c.nodeId) anyFinished = true;
        return false;
      }
      return true;
    });

    if (anyFinished && this.isOpen && this.activeNode) { this._refreshBuildings(); this._reattachOverlays(); }
  }

  create() {
    const { width, height } = this.scale;
    this.PANEL_H = 300;
    this.PANEL_Y = height - this.PANEL_H;
    this.MID_X   = width / 2;

    // ── Root container ─────────────────────────────────────────────────────
    this.root = this.add.container(0, 0).setVisible(false);

    // Overlay — clicking above panel closes it
    const overlay = this.add.rectangle(0, 0, width, this.PANEL_Y, 0x000000, 0.3)
      .setOrigin(0, 0).setInteractive();
    overlay.on('pointerdown', () => this.close());
    this.root.add(overlay);

    // Panel background
    const bg = this.add.rectangle(0, this.PANEL_Y, width, this.PANEL_H, 0x080c14, 0.97)
      .setOrigin(0, 0);
    this.root.add(bg);

    // Top border
    this.root.add(
      this.add.rectangle(0, this.PANEL_Y, width, 2, 0x2255aa, 0.8).setOrigin(0, 0)
    );

    // Centre divider
    this.root.add(
      this.add.rectangle(this.MID_X, this.PANEL_Y + 10, 1, this.PANEL_H - 20, 0x1a2a44)
        .setOrigin(0.5, 0)
    );

    this._buildUnitPanel();
    this._buildNodePanel();
    this._buildModal();

    this.game.events.on('openNode',  this.open,  this);
    this.game.events.on('closeNode', this.close, this);

    // Refresh resource bars when a building bonus is applied
    this.game.events.on('nodeResourcesUpdated', (nodeId) => {
      if (this.isOpen && this.activeNode?.id === nodeId) {
        this._refreshNodeInfo();
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEFT — Unit Management (unchanged from before)
  // ══════════════════════════════════════════════════════════════════════════

  _buildUnitPanel() {
    const x = 16;
    const y = this.PANEL_Y + 14;

    this.root.add(this.add.text(x, y, 'UNIT MANAGEMENT', {
      font: 'bold 11px monospace', color: '#44aaff'
    }));

    // Stack selector row (which stack is active)
    this.stackSelectorContainer = this.add.container(0, 0);
    this.root.add(this.stackSelectorContainer);

    // Composition rows (one per ship type present)
    this.stackListContainer = this.add.container(0, 0);
    this.root.add(this.stackListContainer);

    // Split total display + SPLIT & MOVE button
    this.splitTotalText = this.add.text(x, y + 210, 'Split: 0 units', {
      font: '10px monospace', color: '#7aaa8a'
    });
    this.root.add(this.splitTotalText);

    this.btnSplitMove = this._makeButton(x, y + 228, '  SPLIT & MOVE  ', () => this._doSplit(), 0x0d1e3a, 0x44aaff);
    this.root.add(this.btnSplitMove);

    this.splitHint = this.add.text(x, y + 256, 'Select destination after splitting', {
      font: '10px monospace', color: '#223366'
    });
    this.root.add(this.splitHint);

    // Track split amounts per type
    this._splitComp = { fighter: 0, destroyer: 0, cruiser: 0, dreadnaught: 0, flagship: 0 };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RIGHT — Node Info + Buildings
  // ══════════════════════════════════════════════════════════════════════════

  _buildNodePanel() {
    const x = this.MID_X + 16;
    const y = this.PANEL_Y + 14;

    this.nodeName = this.add.text(x, y, '', {
      font: 'bold 15px monospace', color: '#ffffff'
    });
    this.root.add(this.nodeName);

    this.nodeType = this.add.text(x, y + 22, '', {
      font: '11px monospace', color: '#44aaff'
    });
    this.root.add(this.nodeType);

    // Resource bars
    this.resBars = {};
    const resources = [
      { key: 'food',  label: '🌾 Food',  color: 0x88cc44 },
      { key: 'metal', label: '⚙ Metal',  color: 0x8888cc },  // icon drawn separately
      { key: 'fuel',  label: '⛽ Fuel',  color: 0xcc8844 },
    ];
    resources.forEach(({ key, label, color }, i) => {
      const rowY = y + 42 + i * 22;
      const barX = x + 68;
      const barW = 120;

      if (key === 'metal') {
        // Drawn gear icon to match UIScene — sits at same x as emoji icons
        this._drawMetalIcon(x + 6, rowY + 5, color);
        this.root.add(this.add.text(x + 18, rowY, 'Metal', { font: '10px monospace', color: '#7aaa8a' }));
      } else {
        this.root.add(this.add.text(x, rowY, label, { font: '10px monospace', color: '#7aaa8a' }));
      }

      this.root.add(this.add.rectangle(barX, rowY + 2, barW, 10, 0x0d1a2e).setOrigin(0, 0));
      const fill = this.add.rectangle(barX, rowY + 2, 0, 10, color).setOrigin(0, 0);
      this.root.add(fill);
      const val = this.add.text(barX + barW + 6, rowY, '', { font: '10px monospace', color: '#aaaaaa' });
      this.root.add(val);
      this.resBars[key] = { fill, val, barW, maxVal: 10 };
    });

    // ── Buildings section ──────────────────────────────────────────────────
    const bldHeaderY = y + 112;
    this.root.add(this.add.text(x, bldHeaderY, 'BUILDINGS', {
      font: 'bold 10px monospace', color: '#4477aa'
    }));

    // Scrollable area for building cards
    // Uses a Phaser mask so cards outside the region are clipped
    const SCROLL_X     = x;
    const SCROLL_Y     = bldHeaderY + 16;
    const SCROLL_W     = this.scale.width - x - 16;
    const SCROLL_H     = this.PANEL_H - (SCROLL_Y - this.PANEL_Y) - 10;

    // Mask shape — only cards within this rectangle are visible
    const maskShape = this.make.graphics({ add: false });
    maskShape.fillRect(SCROLL_X, SCROLL_Y, SCROLL_W, SCROLL_H);
    const mask = maskShape.createGeometryMask();

    // Container that slides up/down for scrolling
    this.buildingScrollContainer = this.add.container(SCROLL_X, SCROLL_Y);
    this.buildingScrollContainer.setMask(mask);
    this.root.add(this.buildingScrollContainer);

    // Store for use in refresh
    this._bldScrollX = SCROLL_X;
    this._bldScrollY = SCROLL_Y;
    this._bldScrollH = SCROLL_H;
    this._bldScrollW = SCROLL_W;

    // Scrollbar track
    this.scrollbarTrack = this.add.rectangle(
      this.scale.width - 14, SCROLL_Y, 4, SCROLL_H, 0x1a2a44
    ).setOrigin(0.5, 0);
    this.root.add(this.scrollbarTrack);

    // Scrollbar thumb (height set dynamically)
    this.scrollbarThumb = this.add.rectangle(
      this.scale.width - 14, SCROLL_Y, 4, 20, 0x2255aa
    ).setOrigin(0.5, 0);
    this.root.add(this.scrollbarThumb);

    // Mouse wheel scrolling on the right panel
    this.input.on('wheel', (ptr, objs, dx, dy) => {
      if (!this.isOpen) return;
      if (ptr.x < this.MID_X) return;  // Only scroll right panel
      this._scrollBuildings(dy * 0.5);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Building cards
  // ══════════════════════════════════════════════════════════════════════════

  _drawMetalIcon(cx, cy, hexColor) {
    const col = typeof hexColor === 'string'
      ? parseInt(hexColor.replace('#', ''), 16)
      : hexColor;
    const g = this.add.graphics();
    // Scaled down to match emoji icon footprint (~10px wide)
    g.fillStyle(col, 1);
    g.fillRect(cx - 3, cy - 5, 6, 10);   // vertical bar
    g.fillRect(cx - 5, cy - 3, 10, 6);   // horizontal bar
    // Corner cuts to octagon
    g.fillStyle(0x080c14, 1);
    g.fillTriangle(cx - 3, cy - 5,  cx - 5, cy - 3,  cx - 3, cy - 3);
    g.fillTriangle(cx + 3, cy - 5,  cx + 5, cy - 3,  cx + 3, cy - 3);
    g.fillTriangle(cx - 3, cy + 5,  cx - 5, cy + 3,  cx - 3, cy + 3);
    g.fillTriangle(cx + 3, cy + 5,  cx + 5, cy + 3,  cx + 3, cy + 3);
    // Hollow centre
    g.fillCircle(cx, cy, 2);
    this.root.add(g);
  }

  _refreshBuildings() {
    this.buildingScrollContainer.removeAll(true);
    this._scrollY = 0;

    const node     = this.activeNode;
    const buildings = node.buildings || [];

    // Only show "Add Building" slots on player-owned nodes
    const gs         = this.scene.get('GameScene');
    const isOwned    = gs?.nodeOwnership?.get(this.activeNode?.id) === 'player';
    const slots      = [...buildings];
    if (isOwned) {
      const MAX_VISIBLE_EMPTY = 3;
      const emptyCount = Math.max(0, MAX_VISIBLE_EMPTY - buildings.length);
      for (let i = 0; i < emptyCount + 1; i++) slots.push(null);
    }

    slots.forEach((bld, i) => {
      const col  = i % CARDS_PER_ROW;
      const row  = Math.floor(i / CARDS_PER_ROW);
      const cx   = col * (CARD_W + CARD_GAP);
      const cy   = row * (CARD_H + CARD_GAP);
      this._makeCard(bld, cx, cy, i);
    });

    // Calculate max scroll
    const rows = Math.ceil(slots.length / CARDS_PER_ROW);
    const totalH = rows * (CARD_H + CARD_GAP);
    this._maxScrollY = Math.max(0, totalH - this._bldScrollH);
    this._updateScrollbar(totalH);
  }

  _makeCard(bld, cx, cy, idx) {
    const isEmpty      = bld === null;
    const isPlanet     = bld === '__planet__';
    const isConst      = typeof bld === 'string' && bld.startsWith('__constructing__');
    const realBldId    = isConst ? bld.replace('__constructing__', '') : bld;
    const def          = (isEmpty || isPlanet) ? null : BUILDING_DEFS[realBldId];

    // Each card is its own container positioned at cx,cy within the scroll container.
    // All children use LOCAL coordinates (0,0 = top-left of card) so nothing double-offsets.
    const card = this.add.container(cx, cy);

    const bgColor = isEmpty ? 0x0d1a2e : 0x111d30;
    const borderC = isEmpty ? 0x1a2a44 : 0x2255aa;

    // ── Background graphic ────────────────────────────────────────────────
    const g = this.add.graphics();
    const drawBg = (hover) => {
      g.clear();
      g.fillStyle(hover ? bgColor + 0x0a0a14 : bgColor, 1);
      g.fillRoundedRect(0, 0, CARD_W, CARD_H, 6);
      g.lineStyle(1, hover ? 0x44aaff : borderC, 0.8);
      g.strokeRoundedRect(0, 0, CARD_W, CARD_H, 6);
    };
    drawBg(false);

    // ── Icon — drawn at local coords (iconCX, iconCY relative to card top-left) ──
    const iconCX = CARD_W / 2;
    const iconCY = 22;
    const iconG  = this.add.graphics();

    const drawIcon = () => {
      iconG.clear();
      if (isEmpty) {
        // Circle-plus icon
        iconG.lineStyle(2, 0x2255aa, 0.9);
        iconG.strokeCircle(iconCX, iconCY, 12);
        iconG.fillStyle(0x2255aa, 0.9);
        iconG.fillRect(iconCX - 6, iconCY - 1.5, 12, 3);
        iconG.fillRect(iconCX - 1.5, iconCY - 6, 3, 12);
      } else if (isConst && def) {
        def.drawIcon(iconG, iconCX, iconCY);
      } else if (isPlanet) {
        // Node circle icon using planet type colour
        const typeColors = {
          molten:    0xff5522,
          habitable: 0x44aaff,
          barren:    0x888899,
          sulfuric:  0xccdd22,
        };
        const col = typeColors[this.activeNode?.type] || 0x556677;
        iconG.fillStyle(col, 1);
        iconG.fillCircle(iconCX, iconCY, 10);
        iconG.lineStyle(2, 0x4488cc, 0.5);
        iconG.strokeCircle(iconCX, iconCY, 10);
      } else {
        def.drawIcon(iconG, iconCX, iconCY);
      }
    };
    drawIcon();

    // ── Name text ──────────────────────────────────────────────────────────
    const cardName = isPlanet
      ? `${this.activeNode?.label || 'Planet'} - 1`
      : isConst ? (def?.name || 'Building') + '…'
      : isEmpty ? 'Add Building' : def.name;
    const nameText = this.add.text(CARD_W / 2, 42, cardName, {
      font: '9px monospace',
      color: isPlanet ? '#ffffff' : isEmpty ? '#4477aa' : '#aaccff',
      wordWrap: { width: CARD_W - 8 },
      align: 'center',
    }).setOrigin(0.5, 0);

    // ── Output text ────────────────────────────────────────────────────────
    const cardOutput = isPlanet ? 'Outpost' : isConst ? 'Constructing…' : isEmpty ? '' : def.output;
    const outText = this.add.text(CARD_W / 2, 68, cardOutput, {
      font: '8px monospace',
      color: '#556677',
      wordWrap: { width: CARD_W - 8 },
      align: 'center',
    }).setOrigin(0.5, 0);

    // ── Click zone ────────────────────────────────────────────────────────
    const zone = this.add.rectangle(0, 0, CARD_W, CARD_H, 0xffffff, 0)
      .setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => drawBg(true));
    zone.on('pointerout',  () => drawBg(false));
    zone.on('pointerdown', () => { if (isEmpty) this._openModal(); /* planet & built: no action yet */ });

    // Add base card layers first so arc renders on top
    card.add([g, iconG, nameText, outText, zone]);

    // Production buildings: show progress arc in top-right corner
    const PRODUCTION_BLDS = new Set(['naval_base', 'destroyer_factory', 'cruiser_factory', 'dreadnaught_factory']);
    if (PRODUCTION_BLDS.has(realBldId) && !isConst) {
      const gs       = this.scene.get('GameScene');
      const prodKey  = `${this.activeNode?.id}:${realBldId}`;
      const prodData = gs?.unitProduction?.get(prodKey);
      const arcG     = this.add.graphics();

      const drawArc = (progress) => {
        arcG.clear();
        // Dark background track
        arcG.lineStyle(3, 0x223344, 1);
        arcG.beginPath();
        arcG.arc(CARD_W - 14, 14, 8, 0, Math.PI * 2);
        arcG.strokePath();
        // Bright progress arc
        if (progress > 0) {
          arcG.lineStyle(3, 0x44aaff, 1);
          arcG.beginPath();
          arcG.arc(CARD_W - 14, 14, 8, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
          arcG.strokePath();
        }
        // Centre dot
        arcG.fillStyle(0x44aaff, 1);
        arcG.fillCircle(CARD_W - 14, 14, 2.5);
      };

      const initialProgress = prodData ? Math.min(prodData.elapsed / prodData.duration, 1) : 0;
      drawArc(initialProgress);

      // Store both ref and redraw fn so GameScene can animate it each tick
      if (prodData) {
        prodData.arcG      = arcG;
        prodData.drawArc   = drawArc;
      }

      card.add(arcG);
    }

    this.buildingScrollContainer.add(card);
  }

  _redrawCardBg(g, bgColor, borderC, hover) {
    g.fillStyle(hover ? bgColor + 0x0a0a0a : bgColor, 1);
    g.fillRoundedRect(0, 0, CARD_W, CARD_H, 6);
    g.lineStyle(1, hover ? 0x44aaff : borderC, 0.8);
    g.strokeRoundedRect(0, 0, CARD_W, CARD_H, 6);
  }

  _scrollBuildings(dy) {
    this._scrollY = Phaser.Math.Clamp(this._scrollY + dy, 0, this._maxScrollY);
    this.buildingScrollContainer.setPosition(this._bldScrollX, this._bldScrollY - this._scrollY);
    this._updateScrollbar(null);
  }

  _updateScrollbar(totalH) {
    if (this._maxScrollY <= 0) {
      this.scrollbarThumb.setVisible(false);
      return;
    }
    this.scrollbarThumb.setVisible(true);
    const trackH   = this._bldScrollH;
    const thumbH   = Math.max(20, (trackH / (totalH || trackH + this._maxScrollY)) * trackH);
    const thumbY   = this._bldScrollY + (this._scrollY / this._maxScrollY) * (trackH - thumbH);
    this.scrollbarThumb.setSize(4, thumbH);
    this.scrollbarThumb.setPosition(this.scale.width - 14, thumbY);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Modal — building selection
  // ══════════════════════════════════════════════════════════════════════════

  _buildModal() {
    this.modal = this.add.container(0, 0).setVisible(false).setDepth(20);
    const { width, height } = this.scale;

    // ── Static: dim + box + title + close ────────────────────────────────
    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.7)
      .setOrigin(0, 0).setInteractive();
    dim.on('pointerdown', () => this._closeModal());
    this.modal.add(dim);

    this._modalMW = 640; this._modalMH = 380;
    this._modalMX = (width - this._modalMW) / 2;
    this._modalMY = (height - this._modalMH) / 2;

    this._modalBox = this.add.graphics();
    this.modal.add(this._modalBox);

    this.modal.add(this.add.text(
      this._modalMX + this._modalMW / 2, this._modalMY + 20, 'ADD BUILDING', {
      font: 'bold 13px monospace', color: '#44aaff'
    }).setOrigin(0.5, 0));

    const closeBtn = this._makeButton(
      this._modalMX + this._modalMW - 30, this._modalMY + 12,
      '✕', () => this._closeModal(), 0x1a1a2e, '#556677'
    );
    this.modal.add(closeBtn);

    // Dynamic option cards live in a sub-container rebuilt each open
    this._modalOptions = this.add.container(0, 0);
    this.modal.add(this._modalOptions);
  }

  // Rebuilds option cards each time the modal opens — reflects current
  // resources and which buildings are already built/constructing on this node.
  _rebuildModalOptions() {
    this._modalOptions.removeAll(true);

    const { MW, MH, MX, MY } = {
      MW: this._modalMW, MH: this._modalMH,
      MX: this._modalMX, MY: this._modalMY,
    };

    // Current player resources (pulled from UIScene)
    const ui  = this.scene.get('UIScene');
    const res = ui?.resources || { food: 0, metal: 0, fuel: 0 };

    // Buildings already on this node (real + constructing)
    const existing = (this.activeNode?.buildings || []).map(b =>
      b.startsWith('__constructing__') ? b.replace('__constructing__', '') : b
    );

    const options = ['naval_base', 'destroyer_factory', 'cruiser_factory', 'dreadnaught_factory', 'farm', 'metal_extractor', 'fuel_extractor'];
    const OPT_W = 130, OPT_H = 168, OPT_GAP = 16;
    const COLS  = 4;

    // Resize box to fit 2 rows
    const boxH = MH + 48 + OPT_H + OPT_GAP + 10;
    this._modalBox.clear();
    this._modalBox.fillStyle(0x0d1422, 1);
    this._modalBox.fillRoundedRect(MX, MY, MW, boxH, 8);
    this._modalBox.lineStyle(1, 0x2255aa, 1);
    this._modalBox.strokeRoundedRect(MX, MY, MW, boxH, 8);

    const rowTotalW = COLS * OPT_W + (COLS - 1) * OPT_GAP;
    const startX    = MX + (MW - rowTotalW) / 2;

    options.forEach((bldId, i) => {
      const def       = BUILDING_DEFS[bldId];
      const col       = i % COLS;
      const row       = Math.floor(i / COLS);
      const ox        = startX + col * (OPT_W + OPT_GAP);
      const oy        = MY + 55 + row * (OPT_H + OPT_GAP);
      const alreadyBuilt = existing.includes(bldId);
      const cost      = def.cost || DEFAULT_COST;
      const canAfford = res.food >= cost.food && res.metal >= cost.metal && res.fuel >= cost.fuel;
      const disabled  = alreadyBuilt || !canAfford;

      const og = this.add.graphics();
      const drawOptBg = (hover) => {
        og.clear();
        if (alreadyBuilt) {
          og.fillStyle(0x0a1020, 1);
          og.fillRoundedRect(ox, oy, OPT_W, OPT_H, 6);
          og.lineStyle(1, 0x111a2a, 0.5);
          og.strokeRoundedRect(ox, oy, OPT_W, OPT_H, 6);
        } else {
          og.fillStyle(hover && canAfford ? 0x1a2a40 : 0x111d30, 1);
          og.fillRoundedRect(ox, oy, OPT_W, OPT_H, 6);
          og.lineStyle(1, hover && canAfford ? 0x44aaff : 0x1a2a44, 0.8);
          og.strokeRoundedRect(ox, oy, OPT_W, OPT_H, 6);
        }
        const iconAlpha = alreadyBuilt ? 0.3 : 1;
        og.setAlpha(iconAlpha);
        def.drawIcon(og, ox + OPT_W / 2, oy + 26);
        og.setAlpha(1);
      };
      drawOptBg(false);
      this._modalOptions.add(og);

      // Name — dimmed if built
      this._modalOptions.add(this.add.text(ox + OPT_W / 2, oy + 52, def.name, {
        font: 'bold 11px monospace',
        color: alreadyBuilt ? '#334455' : '#aaccff',
        wordWrap: { width: OPT_W - 8 }, align: 'center'
      }).setOrigin(0.5, 0));

      // "Already built" label OR output description
      this._modalOptions.add(this.add.text(ox + OPT_W / 2, oy + 70,
        alreadyBuilt ? '— Already built —' : def.output, {
        font: '10px monospace',
        color: alreadyBuilt ? '#334455' : '#7799bb',
        wordWrap: { width: OPT_W - 8 }, align: 'center'
      }).setOrigin(0.5, 0));

      // Divider
      const divGfx = this.add.graphics();
      divGfx.lineStyle(1, 0x1a2a44, alreadyBuilt ? 0.3 : 0.7);
      divGfx.lineBetween(ox + 10, oy + 90, ox + OPT_W - 10, oy + 90);
      this._modalOptions.add(divGfx);

      // ── Stacked cost rows — red if can't afford ────────────────────────
      const costItems = [
        { resKey: 'food',  icon: '🌾', val: cost.food,  baseColor: '#88cc44', isMetal: false },
        { resKey: 'metal', icon: '⚙',  val: cost.metal, baseColor: '#8888cc', isMetal: true  },
        { resKey: 'fuel',  icon: '⛽', val: cost.fuel,  baseColor: '#cc8844', isMetal: false },
      ];
      costItems.forEach(({ resKey, icon, val, baseColor, isMetal }, ci) => {
        const rowY  = oy + 90 + ci * 16;
        const iconX = ox + 10;
        const valX  = ox + 28;
        const insufficient = !alreadyBuilt && (res[resKey] < val);
        const color = alreadyBuilt ? '#223344' : insufficient ? '#ff4444' : baseColor;
        const numCol = parseInt(color.replace('#',''), 16);

        if (isMetal) {
          const mg = this.add.graphics();
          mg.fillStyle(numCol, 1);
          const icx = iconX + 5, icy = rowY + 6;
          mg.fillRect(icx-3, icy-5, 6, 10); mg.fillRect(icx-5, icy-3, 10, 6);
          mg.fillStyle(0x0d1422, 1);
          mg.fillTriangle(icx-3,icy-5, icx-5,icy-3, icx-3,icy-3);
          mg.fillTriangle(icx+3,icy-5, icx+5,icy-3, icx+3,icy-3);
          mg.fillTriangle(icx-3,icy+5, icx-5,icy+3, icx-3,icy+3);
          mg.fillTriangle(icx+3,icy+5, icx+5,icy+3, icx+3,icy+3);
          mg.fillCircle(icx, icy, 2);
          this._modalOptions.add(mg);
        } else {
          this._modalOptions.add(this.add.text(iconX, rowY, icon, {
            font: '10px monospace', color
          }));
        }
        this._modalOptions.add(this.add.text(valX, rowY + 1, String(val), {
          font: 'bold 10px monospace', color
        }));
      });

      // Build time
      const buildSecs = Math.round((def.buildTime || DEFAULT_BUILD_MS) / 1000);
      this._modalOptions.add(this.add.text(
        ox + OPT_W / 2, oy + OPT_H - 18, `⏱  ${buildSecs}s build time`, {
        font: '10px monospace', color: alreadyBuilt ? '#223344' : '#6688aa'
      }).setOrigin(0.5, 0));

      // Click zone — only active if not disabled
      const zone = this.add.rectangle(ox, oy, OPT_W, OPT_H, 0xffffff, 0)
        .setOrigin(0, 0).setInteractive({ useHandCursor: !disabled });
      zone.on('pointerover', () => { if (!disabled) drawOptBg(true); });
      zone.on('pointerout',  () => { if (!disabled) drawOptBg(false); });
      zone.on('pointerdown', () => {
        if (disabled) return;
        this._addBuilding(bldId);
        this._closeModal();
      });
      this._modalOptions.add(zone);
    });
  }

  _openModal() {
    this._rebuildModalOptions();
    this.modal.setVisible(true);
  }

  _closeModal() {
    this.modal.setVisible(false);
  }

  // Recreate overlay graphics for all active constructions on this node.
  // Must be called after _refreshBuildings() since removeAll(true) destroys old overlays.
  _reattachOverlays() {
    this._constructions.forEach(c => {
      if (c.nodeId !== this.activeNode?.id) return;

      // Destroy stale graphic if it still exists
      if (c.overlayGfx && !c.overlayGfx.destroyed) c.overlayGfx.destroy();

      const col = c.slotIndex % CARDS_PER_ROW;
      const row = Math.floor(c.slotIndex / CARDS_PER_ROW);
      c.localX  = col * (CARD_W + CARD_GAP);
      c.localY  = row * (CARD_H + CARD_GAP);

      const progress  = Math.min(c.elapsed / c.duration, 1);
      const remaining = 1 - progress;
      const og        = this.add.graphics();

      if (remaining > 0) {
        const h = Math.round(CARD_H * remaining);
        og.fillStyle(0x000000, 0.55);
        og.fillRoundedRect(c.localX, c.localY + CARD_H - h, CARD_W, h, { tl:0, tr:0, bl:6, br:6 });
      }

      og.setDepth(12);
      this.buildingScrollContainer.add(og);
      c.overlayGfx = og;
    });
  }

  _addBuilding(bldId) {
    if (!this.activeNode) return;

    const def  = BUILDING_DEFS[bldId];
    const cost = def?.cost || DEFAULT_COST;

    // Deduct resources via GameScene
    this.game.events.emit('deductResources', { ...cost });

    // Add as constructing placeholder
    if (!this.activeNode.buildings) this.activeNode.buildings = [];
    const slotIndex = this.activeNode.buildings.length;
    this.activeNode.buildings.push('__constructing__' + bldId);

    // Track construction timer
    this._constructions.push({
      nodeId:     this.activeNode.id,
      slotIndex,
      bldId,
      elapsed:    0,
      duration:   def?.buildTime || DEFAULT_BUILD_MS,
      overlayGfx: null,  // set after _refreshBuildings creates the card
    });

    this._refreshBuildings();
    this._reattachOverlays();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Open / Close
  // ══════════════════════════════════════════════════════════════════════════

  open(node, stacks) {
    this.activeNode      = node;
    this.activeStacks    = stacks || [];
    this.splitValue      = 0;
    this._activeStackIdx = 0;
    this._splitComp      = { fighter: 0, destroyer: 0, cruiser: 0, dreadnaught: 0, flagship: 0 };

    // Initialise building slots with just the planet card if fresh
    if (!node.buildings) {
      node.buildings = ['__planet__'];
    }

    this._refreshStackList();
    this._refreshNodeInfo();
    this._refreshBuildings();
    this._reattachOverlays();
    this.root.setVisible(true);
    this.isOpen = true;
  }

  close() {
    if (!this.isOpen) return;
    this._closeModal();
    this.root.setVisible(false);
    this.isOpen       = false;
    this.activeNode   = null;
    this.activeStacks = [];
    this.splitValue   = 0;
    this.stackListContainer.removeAll(true);
    this.buildingScrollContainer.removeAll(true);
    this.game.events.emit('closeNode');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Dynamic refresh
  // ══════════════════════════════════════════════════════════════════════════

  _refreshStackList() {
    this.stackListContainer.removeAll(true);
    this.stackSelectorContainer.removeAll(true);
    const x = 16, y = this.PANEL_Y + 34;

    if (this.activeStacks.length === 0) {
      this.stackListContainer.add(this.add.text(x, y, 'No friendly units at this node', {
        font: '11px monospace', color: '#334466'
      }));
      this.splitTotalText.setVisible(false);
      this.btnSplitMove.setVisible(false);
      this.splitHint.setVisible(false);
      return;
    }

    this.splitTotalText.setVisible(true);
    this.btnSplitMove.setVisible(true);
    this.splitHint.setVisible(true);

    // ── Stack selector tabs ───────────────────────────────────────────────
    this.activeStacks.forEach((stack, i) => {
      const tx = x + i * 66;
      const selected = (i === this._activeStackIdx);
      const bg = this.add.rectangle(tx - 2, y - 2, 62, 16,
        selected ? 0x0d2244 : 0x0a1020).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => {
        this._activeStackIdx = i;
        this._splitComp = { fighter: 0, destroyer: 0, cruiser: 0, dreadnaught: 0, flagship: 0 };
        this._refreshStackList();
      });
      this.stackSelectorContainer.add(bg);
      this.stackSelectorContainer.add(this.add.text(tx + 2, y,
        `Stack ${i + 1}`, { font: '10px monospace', color: selected ? '#44aaff' : '#446688' }
      ));
    });

    // ── Composition rows for active stack ─────────────────────────────────
    const stack = this.activeStacks[this._activeStackIdx || 0];
    const comp  = stack?.composition || {};
    const SHIP_LABELS = {
      flagship:    { label: 'Flagship',    color: 0xffdd44 },
      dreadnaught: { label: 'Dreadnaught', color: 0xff8844 },
      cruiser:     { label: 'Cruiser',     color: 0x44ddaa },
      destroyer:   { label: 'Destroyer',   color: 0xaa66ff },
      fighter:     { label: 'Fighter',     color: 0x44aaff },
    };

    let rowY = y + 24;
    const ROW_H = 30;
    const types = SHIP_TYPES.filter(t => (comp[t] || 0) > 0);

    if (types.length === 0) {
      this.stackListContainer.add(this.add.text(x, rowY, 'Stack is empty', {
        font: '10px monospace', color: '#334466'
      }));
      return;
    }

    types.forEach(type => {
      const count     = comp[type] || 0;
      const split     = this._splitComp[type] || 0;
      const info      = SHIP_LABELS[type];

      // Row background
      this.stackListContainer.add(
        this.add.rectangle(x - 4, rowY - 2, this.MID_X - x - 8, ROW_H - 2, 0x0a1020).setOrigin(0, 0)
      );

      // Ship icon
      const iconG = this.add.graphics();
      drawShipIcon(iconG, type, x + 9, rowY + 12, info.color);
      this.stackListContainer.add(iconG);

      // Ship type label + count
      this.stackListContainer.add(this.add.text(x + 22, rowY + 4, info.label, {
        font: '10px monospace', color: '#aaccff'
      }));
      this.stackListContainer.add(this.add.text(x + 22, rowY + 16, `${count} total`, {
        font: '9px monospace', color: '#556688'
      }));

      // Split controls: − [n] + — anchored well inside the left panel
      const ctrlX  = this.MID_X - 120;
      const BTN_W  = 22;
      const GAP    = 4;
      const NUM_W  = 24;
      const xMinus = ctrlX;
      const xNum   = ctrlX + BTN_W + GAP;
      const xPlus  = xNum + NUM_W + GAP;

      const btnM = this._makeButton(xMinus, rowY + 6, ' − ', () => {
        this._splitComp[type] = Math.max(0, (this._splitComp[type] || 0) - 1);
        this._refreshStackList();
      }, 0x0d1a2e, '#4499cc');
      this.stackListContainer.add(btnM);

      const splitCountTxt = this.add.text(xNum + NUM_W / 2, rowY + 10, String(split), {
        font: 'bold 11px monospace', color: split > 0 ? '#ffffff' : '#334466'
      }).setOrigin(0.5, 0);
      this.stackListContainer.add(splitCountTxt);

      const btnP = this._makeButton(xPlus, rowY + 6, ' + ', () => {
        // Flagship can always be split (moved independently) — max is its count in this stack
        const maxSplit = count;
        this._splitComp[type] = Math.min(maxSplit, (this._splitComp[type] || 0) + 1);
        this._refreshStackList();
      }, 0x0d1a2e, '#4499cc');
      this.stackListContainer.add(btnP);

      rowY += ROW_H;
    });

    this._refreshSplitDisplay();
  }

  _refreshNodeInfo() {
    const node = this.activeNode;
    if (!node) return;
    this.nodeName.setText(node.label);
    this.nodeType.setText(node.type.toUpperCase());
    for (const [key, bar] of Object.entries(this.resBars)) {
      const value    = node[key] ?? 0;
      const baseKey  = 'base' + key.charAt(0).toUpperCase() + key.slice(1);
      const base     = node[baseKey] ?? value;
      const bonus    = value - base;
      bar.fill.width = Math.round((value / bar.maxVal) * bar.barW);
      const bonusStr = bonus > 0 ? `  (+${bonus})` : '';
      bar.val.setText(`${value}/10${bonusStr}`);
    }
  }

  _refreshSplitDisplay() {
    const total = Object.values(this._splitComp || {}).reduce((s, v) => s + v, 0);
    this.splitTotalText?.setText(`Split: ${total} unit${total !== 1 ? 's' : ''}`);
    this.splitTotalText?.setColor(total > 0 ? '#7aaa8a' : '#334466');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Split logic
  // ══════════════════════════════════════════════════════════════════════════

  _adjustSplit(delta) { /* replaced by per-type controls */ }

  _doSplit() {
    const total = Object.values(this._splitComp || {}).reduce((s, v) => s + v, 0);
    if (total <= 0 || !this.activeStacks.length) return;
    const stack = this.activeStacks[this._activeStackIdx || 0];
    this.game.events.emit('splitStack', {
      sourceStack:  stack,
      splitComp:    { ...this._splitComp },
      splitAmount:  total,
      nodeId:       this.activeNode.id,
    });
    this.splitHint.setText('Now click a destination node to move the new stack');
    this._splitComp = { fighter: 0, destroyer: 0, cruiser: 0, dreadnaught: 0, flagship: 0 };
    this._refreshStackList();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════════════════

  _makeButton(x, y, label, onClick, bgColor = 0x0d1a2e, textColor = '#4499cc') {
    const txt = this.add.text(0, 0, label, { font: '11px monospace', color: textColor });
    const w   = txt.width + 12;
    const h   = txt.height + 6;
    const bg  = this.add.rectangle(0, 0, w, h, bgColor).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(bgColor + 0x111111));
    bg.on('pointerout',  () => bg.setFillStyle(bgColor));
    bg.on('pointerdown', onClick);
    txt.setPosition(6, 3);
    return this.add.container(x, y, [bg, txt]);
  }
}
