export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
    this.eventLog    = [];
    this.playerName  = 'Player 1';
    this.planetCount = 0;
    this.resources   = { units: 0, food: 0, metal: 0, fuel: 0 };
    this.breakdown   = [];   // [{ label, food, metal, fuel }, ...]

    // Slot hit-zones stored so we can attach hover listeners
    this._slotZones  = {};

    // Tooltip state
    this._tooltipKey    = null;  // which resource is currently showing
    this._tooltipScroll = 0;     // horizontal scroll offset for breakdown rows
  }

  create() {
    const { width, height } = this.scale;
    const TOP_BAR_H = 40;

    // ── Top bar ────────────────────────────────────────────────────────────
    this.add.rectangle(0, 0, width, TOP_BAR_H, 0x080c14, 0.95).setOrigin(0, 0);
    this.add.rectangle(0, TOP_BAR_H - 1, width, 1, 0x2255aa, 0.7).setOrigin(0, 0);

    // Pie chart icon
    this.pieGfx = this.add.graphics();
    this._drawPlanetIcon(22, TOP_BAR_H / 2, 10, null);

    this.playerLabel = this.add.text(44, TOP_BAR_H / 2,
      `${this.playerName}  —  ${this.planetCount}`, {
      font: '13px monospace', color: '#7799bb',
    }).setOrigin(0, 0.5);

    // ── Resource slots (top right) ─────────────────────────────────────────
    const resDefs = [
      { key: 'units', icon: '⬡', color: '#aaccff', label: 'Units'  },
      { key: 'food',  icon: '🌾', color: '#88cc44', label: 'Food'   },
      { key: 'metal', icon: null, color: '#8888cc', label: 'Metal'  },
      { key: 'fuel',  icon: '⛽', color: '#cc8844', label: 'Fuel'   },
    ];

    this.resourceTexts = {};
    const SLOT_W    = 140;
    const RIGHT_PAD = 20;

    resDefs.forEach(({ key, icon, color, label }, i) => {
      const slotRight = width - RIGHT_PAD - (resDefs.length - 1 - i) * SLOT_W;
      const slotLeft  = slotRight - SLOT_W + 10;

      if (icon) {
        this.add.text(slotLeft, TOP_BAR_H / 2, icon, {
          font: '14px monospace', color,
        }).setOrigin(0, 0.5);
      } else {
        // Metal: drawn gear icon — two overlapping rectangles + hollow centre
        this._drawMetalIcon(slotLeft + 7, TOP_BAR_H / 2, color);
      }

      this.add.text(slotLeft + 22, TOP_BAR_H / 2, label, {
        font: '11px monospace', color: '#4a6688',
      }).setOrigin(0, 0.5);

      this.resourceTexts[key] = this.add.text(slotRight, TOP_BAR_H / 2, '0', {
        font: 'bold 13px monospace', color,
      }).setOrigin(1, 0.5);

      // Invisible hover zone covering the whole slot
      if (key !== 'units') {
        const zoneW = SLOT_W - 4;
        const zone  = this.add.rectangle(
          slotLeft - 4, TOP_BAR_H / 2, zoneW, TOP_BAR_H - 4,
          0xffffff, 0
        ).setOrigin(0, 0.5).setInteractive();

        zone.on('pointerover', () => this._showTooltip(key, slotRight, color, resDefs));
        this._slotZones[key] = zone;
      }
    });

    // ── Research button — anchored to end just before the first resource slot ──
    // Units slot left edge = width - RIGHT_PAD - (numSlots-1)*SLOT_W - SLOT_W + 10
    //                      = width - 20 - 3*140 - 140 + 10 = width - 570
    // Button right edge sits 12px to the left of that.
    this._researchOpen = false;
    this._researchRP   = 0;
    this._researchBtnG = this.add.graphics();

    // Compute button geometry once; reused in _drawResearchBtn
    const BTN_W  = 160, BTN_GAP = 12;
    const BTN_RIGHT = width - RIGHT_PAD - resDefs.length * SLOT_W - BTN_GAP;
    const BTN_LEFT  = BTN_RIGHT - BTN_W;
    this._btnRight = BTN_RIGHT;
    this._btnLeft  = BTN_LEFT;
    this._btnW     = BTN_W;

    this._drawResearchBtn(false);

    const resZone = this.add.rectangle(
      BTN_LEFT, TOP_BAR_H / 2, BTN_W, 30, 0xffffff, 0
    ).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    resZone.on('pointerover',  () => { if (!this._researchOpen) this._drawResearchBtn(true); });
    resZone.on('pointerout',   () => { this._drawResearchBtn(this._researchOpen); });
    resZone.on('pointerdown',  () => {
      this._researchOpen = !this._researchOpen;
      this._drawResearchBtn(this._researchOpen);
      this.game.events.emit(this._researchOpen ? 'openResearch' : 'closeResearch');
    });

    this.game.events.on('researchAddRP', (amt) => {
      this._researchRP += amt;
      this._drawResearchBtn(this._researchOpen);
    });

    this.game.events.on('researchClosed', () => {
      this._researchOpen = false;
      this._drawResearchBtn(false);
    });

    // ── Bottom bar ─────────────────────────────────────────────────────────
    this.add.rectangle(0, height - 80, width, 80, 0x080c14, 0.97).setOrigin(0, 0);
    this.add.rectangle(0, height - 82, width, 2, 0x2255aa, 0.8).setOrigin(0, 0);

    this.stackLabel = this.add.text(16, height - 66, 'No stack selected', {
      font: '13px monospace', color: '#44aaff'
    });
    this.stackDetail = this.add.text(16, height - 46, '', {
      font: '11px monospace', color: '#7aaa8a'
    });

    this.add.text(width / 2, height - 56,
      'Click stack to select  ·  Click destination to move  ·  Click same node to open panel  ·  ESC to deselect',
      { font: '11px monospace', color: '#223355' }
    ).setOrigin(0.5, 0);
    this.add.text(width / 2, height - 38,
      'WASD / Arrows: scroll  ·  Scroll wheel: zoom',
      { font: '11px monospace', color: '#1a2a44' }
    ).setOrigin(0.5, 0);

    this.logTexts = [];
    for (let i = 0; i < 3; i++) {
      this.logTexts.push(
        this.add.text(width - 16, height - 74 + i * 18, '', {
          font: '11px monospace', color: '#4477aa'
        }).setOrigin(1, 0)
      );
    }

    // ── Tooltip (built once, shown/hidden on hover) ────────────────────────
    this._buildTooltip();
  }

  _drawResearchBtn(active) {
    const g   = this._researchBtnG;
    const cy  = 20;
    const BL  = this._btnLeft;
    const BW  = this._btnW;
    const BR  = this._btnRight;
    if (BL === undefined) return;   // called before create() finishes
    g.clear();

    // Background
    if (active) {
      g.fillStyle(0x0d2a50, 1);
      g.fillRoundedRect(BL, cy - 15, BW, 30, 4);
      g.lineStyle(1, 0x44aaff, 0.9);
      g.strokeRoundedRect(BL, cy - 15, BW, 30, 4);
    } else {
      g.fillStyle(0x0a1828, 1);
      g.fillRoundedRect(BL, cy - 15, BW, 30, 4);
      g.lineStyle(1, 0x1a3a5c, 0.8);
      g.strokeRoundedRect(BL, cy - 15, BW, 30, 4);
    }

    // Atom icon — left-side, same x as resource icons
    const col = active ? 0x88ddff : 0x4488aa;
    const ax  = BL + 14;
    g.lineStyle(1, col, active ? 0.9 : 0.6);
    g.fillStyle(col, 1);
    g.fillCircle(ax, cy, 2);
    g.strokeEllipse(ax, cy, 14, 5);
    const drawEllRot = (ox, oy, rw, rh, angle) => {
      const pts = [];
      for (let s = 0; s <= 32; s++) {
        const t = (s / 32) * Math.PI * 2;
        const ex = Math.cos(t) * rw, ey = Math.sin(t) * rh;
        pts.push({ x: ox + ex * Math.cos(angle) - ey * Math.sin(angle),
                   y: oy + ex * Math.sin(angle) + ey * Math.cos(angle) });
      }
      g.strokePoints(pts, true);
    };
    drawEllRot(ax, cy, 7, 2.5,  Math.PI / 3);
    drawEllRot(ax, cy, 7, 2.5, -Math.PI / 3);

    // "RESEARCH" label — same style as resource labels
    const lblX = ax + 14;
    if (!this._researchLbl) {
      this._researchLbl = this.add.text(lblX, cy, 'RESEARCH', {
        font: '11px monospace', color: '#4a6688',
      }).setOrigin(0, 0.5).setDepth(5);
    } else {
      this._researchLbl.setPosition(lblX, cy);
    }

    // RP value — right-aligned, same style as resource values
    const rpX = BR - 8;
    if (!this._researchRPText) {
      this._researchRPText = this.add.text(rpX, cy, String(this._researchRP ?? 0), {
        font: 'bold 13px monospace', color: '#44aaff',
      }).setOrigin(1, 0.5).setDepth(5);
    } else {
      this._researchRPText.setPosition(rpX, cy).setText(String(this._researchRP ?? 0));
    }

    this._researchLbl.setColor(active ? '#7799cc' : '#4a6688');
    this._researchRPText.setColor(active ? '#88ddff' : '#44aaff');
  }

  _drawMetalIcon(cx, cy, hexColor) {
    // Convert hex string to number for Graphics
    const col = parseInt(hexColor.replace('#', ''), 16);
    const g   = this.add.graphics();

    // Outer octagon approximated by two overlapping rotated rectangles
    g.fillStyle(col, 1);
    g.fillRect(cx - 5, cy - 7, 10, 14);   // vertical bar
    g.fillRect(cx - 7, cy - 5, 14, 10);   // horizontal bar

    // Diagonal cuts — four small corner triangles in background colour to fake octagon
    g.fillStyle(0x080c14, 1);
    g.fillTriangle(cx - 5, cy - 7,  cx - 7, cy - 5,  cx - 5, cy - 5);  // top-left
    g.fillTriangle(cx + 5, cy - 7,  cx + 7, cy - 5,  cx + 5, cy - 5);  // top-right
    g.fillTriangle(cx - 5, cy + 7,  cx - 7, cy + 5,  cx - 5, cy + 5);  // bottom-left
    g.fillTriangle(cx + 5, cy + 7,  cx + 7, cy + 5,  cx + 5, cy + 5);  // bottom-right

    // Hollow centre circle
    g.fillStyle(0x080c14, 1);
    g.fillCircle(cx, cy, 4);
  }

  update() {
    // Hide tooltip when pointer is outside both the slot zone and the tooltip panel
    if (!this.ttContainer || !this.ttContainer.visible) return;
    const ptr = this.input.activePointer;
    const tx  = this.ttContainer.x;
    const ty  = this.ttContainer.y;

    // Is pointer inside the tooltip panel?
    // Extend hit area 10px upward to bridge the gap between slot and tooltip
    const inTooltip = ptr.x >= tx && ptr.x <= tx + this._ttW &&
                      ptr.y >= ty - 10 && ptr.y <= ty + this._ttH;

    // Is pointer inside the active slot zone?
    const slotZone = this._slotZones[this._tooltipKey];
    const inSlot   = slotZone && slotZone.getBounds().contains(ptr.x, ptr.y);

    if (!inTooltip && !inSlot) this._hideTooltip();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Tooltip
  // ══════════════════════════════════════════════════════════════════════════

  _buildTooltip() {
    const TT_W = 320;
    const TT_H = 140;

    // Container — hidden by default, depth above everything
    this.ttContainer = this.add.container(0, 0).setVisible(false).setDepth(50);

    // Background panel
    const bg = this.add.graphics();
    bg.fillStyle(0x060a12, 0.92);
    bg.fillRoundedRect(0, 0, TT_W, TT_H, 6);
    bg.lineStyle(1, 0x2255aa, 0.8);
    bg.strokeRoundedRect(0, 0, TT_W, TT_H, 6);
    this.ttContainer.add(bg);

    // Total line
    this.ttTotalText = this.add.text(12, 12, '', {
      font: 'bold 12px monospace', color: '#ffffff'
    });
    this.ttContainer.add(this.ttTotalText);

    // Divider
    const div = this.add.graphics();
    div.lineStyle(1, 0x1a2a44, 1);
    div.lineBetween(12, 32, TT_W - 12, 32);
    this.ttContainer.add(div);

    // "Per planet:" label
    this.ttContainer.add(this.add.text(12, 38, 'Per planet:', {
      font: '10px monospace', color: '#445566'
    }));

    // Scrollable row area — mask clips content to a rectangle inside the panel
    const ROW_X  = 12;
    const ROW_Y  = 54;
    const ROW_W  = TT_W - 24;
    const ROW_H  = 52;

    const maskGfx = this.make.graphics({ add: false });
    // Mask uses WORLD coords — will be repositioned when tooltip moves
    this.ttMaskGfx = this.make.graphics({ add: false });
    this.ttRowMask = this.ttMaskGfx.createGeometryMask();

    // Container for scrollable rows
    this.ttRowContainer = this.add.container(ROW_X, ROW_Y);
    this.ttRowContainer.setMask(this.ttRowMask);
    this.ttContainer.add(this.ttRowContainer);

    // Scrollbar track + thumb
    const sbX = TT_W - 8;
    this.ttSbTrack = this.add.graphics();
    this.ttSbTrack.fillStyle(0x1a2a44, 1);
    this.ttSbTrack.fillRoundedRect(sbX, ROW_Y, 4, ROW_H, 2);
    this.ttContainer.add(this.ttSbTrack);

    this.ttSbThumb = this.add.graphics();
    this.ttContainer.add(this.ttSbThumb);

    // Store layout for use in show/update
    this._ttW    = TT_W;
    this._ttH    = TT_H;
    this._ttRowX = ROW_X;
    this._ttRowY = ROW_Y;
    this._ttRowW = ROW_W;
    this._ttRowH = ROW_H;

    // Horizontal scroll via mouse wheel while hovering tooltip area
    this.input.on('wheel', (ptr, objs, dx, dy) => {
      if (!this.ttContainer.visible) return;
      const tx = this.ttContainer.x;
      const ty = this.ttContainer.y;
      // Only scroll if pointer is inside the row area of the tooltip
      if (ptr.x >= tx && ptr.x <= tx + this._ttW &&
          ptr.y >= ty + this._ttRowY && ptr.y <= ty + this._ttRowY + this._ttRowH) {
        this._tooltipScroll = Phaser.Math.Clamp(
          this._tooltipScroll + dy * 0.3, 0, this._ttMaxScroll
        );
        this._updateTooltipRows();
      }
    });
  }

  _showTooltip(key, slotRight, color, resDefs) {
    if (this._tooltipKey === key) return;
    this._tooltipKey    = key;
    this._tooltipScroll = 0;

    const { width } = this.scale;

    // Position tooltip below the slot, anchored to right edge but clamped to screen
    const TT_W = this._ttW;
    const TT_H = this._ttH;
    const tx   = Math.min(slotRight - TT_W, width - TT_W - 8);
    const ty   = 44;  // Just below the top bar

    this.ttContainer.setPosition(tx, ty);
    this.ttContainer.setVisible(true);

    // Update mask world position to match container
    this.ttMaskGfx.clear();
    this.ttMaskGfx.fillRect(
      tx + this._ttRowX, ty + this._ttRowY,
      this._ttRowW, this._ttRowH
    );

    // Total per tick
    const total = this.breakdown.reduce((s, b) => s + (b[key] || 0), 0);
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    this.ttTotalText.setText(`+${total} ${label} / tick`);
    this.ttTotalText.setColor(color);

    // Build rows
    this._ttMaxScroll = 0;
    this._ttCurrentKey = key;
    this._updateTooltipRows();
  }

  _updateTooltipRows() {
    this.ttRowContainer.removeAll(true);

    const key      = this._ttCurrentKey;
    const ROW_W    = this._ttRowW;
    const ROW_H    = this._ttRowH;
    const ITEM_W   = 90;
    const ITEM_GAP = 8;

    // Each source is a small vertical block: planet name + value
    this.breakdown.forEach((src, i) => {
      const val = src[key] || 0;
      const ix  = i * (ITEM_W + ITEM_GAP) - this._tooltipScroll;

      // Skip if fully outside view
      if (ix + ITEM_W < 0 || ix > ROW_W) return;

      const itemBg = this.add.graphics();
      itemBg.fillStyle(0x0d1a2e, 1);
      itemBg.fillRoundedRect(ix, 0, ITEM_W, ROW_H - 4, 4);
      this.ttRowContainer.add(itemBg);

      this.ttRowContainer.add(this.add.text(ix + ITEM_W / 2, 6, src.label, {
        font: '9px monospace', color: '#7799bb',
        wordWrap: { width: ITEM_W - 6 }, align: 'center'
      }).setOrigin(0.5, 0));

      this.ttRowContainer.add(this.add.text(ix + ITEM_W / 2, 28, `+${val}`, {
        font: 'bold 11px monospace',
        color: val > 0 ? '#44aaff' : '#445566'
      }).setOrigin(0.5, 0));
    });

    // Update scrollbar thumb
    const totalW      = this.breakdown.length * (ITEM_W + ITEM_GAP);
    this._ttMaxScroll = Math.max(0, totalW - ROW_W);
    const sbX         = this._ttW - 8;
    const sbY         = this._ttRowY;

    this.ttSbThumb.clear();
    if (this._ttMaxScroll > 0) {
      const thumbW = Math.max(20, (ROW_W / totalW) * ROW_W);
      const thumbX = this._ttRowX + (this._tooltipScroll / this._ttMaxScroll) * (ROW_W - thumbW);
      this.ttSbThumb.fillStyle(0x2255aa, 1);
      this.ttSbThumb.fillRoundedRect(thumbX, sbY + this._ttRowH + 4, thumbW, 4, 2);
    }
  }

  _hideTooltip() {
    this.ttContainer.setVisible(false);
    this._tooltipKey = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Public update methods
  // ══════════════════════════════════════════════════════════════════════════

  updateResources({ units, food, metal, fuel }, breakdown) {
    this.resources = { units, food, metal, fuel };
    Object.entries(this.resources).forEach(([key, val]) => {
      if (this.resourceTexts[key]) this.resourceTexts[key].setText(String(val));
    });
    if (breakdown) {
      this.breakdown = breakdown;
      // Refresh tooltip live if it's currently open
      if (this._tooltipKey) this._updateTooltipRows();
    }
  }

  updatePlayerInfo(name, planetCount, typeCounts) {
    this.playerName  = name;
    this.planetCount = planetCount;
    this.playerLabel.setText(`${name}  —  ${planetCount}`);
    if (typeCounts) this._drawPlanetIcon(22, 20, 10, typeCounts);
  }

  _drawPlanetIcon(x, y, r, typeCounts) {
    const g = this.pieGfx;
    g.clear();
    const TYPE_COLORS = {
      molten: 0xff5522, habitable: 0x44aaff, barren: 0x888899, sulfuric: 0xccdd22,
    };
    const types = Object.keys(TYPE_COLORS);
    const total = typeCounts ? types.reduce((s, t) => s + (typeCounts[t] || 0), 0) : 0;

    if (!typeCounts || total === 0) {
      const step = (Math.PI * 2) / types.length;
      types.forEach((type, i) => {
        g.fillStyle(TYPE_COLORS[type], 0.4);
        g.slice(x, y, r, i * step, (i + 1) * step, false);
        g.fillPath();
      });
    } else {
      let angle = 0;
      types.forEach(type => {
        const count = typeCounts[type] || 0;
        if (count === 0) return;
        const sweep = (count / total) * Math.PI * 2;
        g.fillStyle(TYPE_COLORS[type], 0.9);
        g.slice(x, y, r, angle, angle + sweep, false);
        g.fillPath();
        angle += sweep;
      });
    }
    // Separator stroke
    g.lineStyle(1, 0x080c14, 1);
    g.strokeCircle(x, y, r);

    // Ownership ring — same style as planet rings in GameScene
    // Always player 1 blue (0x44aaff) since this is the local player HUD
    const RING_COLOR = 0x44aaff;
    g.lineStyle(3, RING_COLOR, 0.45);
    g.strokeCircle(x, y, r + 5);
    g.lineStyle(2, RING_COLOR, 0.9);
    g.strokeCircle(x, y, r + 3);
  }

  showStack(unit) {
    this.stackLabel.setText(
      `${unit.team === 'player' ? '▶ Player' : '▶ Enemy'} Stack  @ ${unit.currentNode}`
    );
    this.stackDetail.setText(`Units: ${unit.stackSize}  ·  ${unit.isMoving ? 'Moving…' : 'Idle'}`);
  }

  clearStack() {
    this.stackLabel.setText('No stack selected');
    this.stackDetail.setText('');
  }

  logEvent(msg) {
    this.eventLog.unshift(msg);
    this.eventLog = this.eventLog.slice(0, 3);
    this.logTexts.forEach((t, i) => {
      t.setText(this.eventLog[i] || '');
      t.setAlpha(1 - i * 0.3);
    });
  }

  showGameOver() {
    const { width, height } = this.scale;
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.75)
      .setOrigin(0).setDepth(50);
    this.add.text(width / 2, height / 2 - 40, '💀 DEFEAT', {
      font: 'bold 42px monospace', color: '#ff4455',
    }).setOrigin(0.5).setDepth(51);
    this.add.text(width / 2, height / 2 + 10, 'Your flagship was destroyed.', {
      font: '18px monospace', color: '#aabbcc',
    }).setOrigin(0.5).setDepth(51);
    this.add.text(width / 2, height / 2 + 50, 'Refresh to play again.', {
      font: '14px monospace', color: '#556677',
    }).setOrigin(0.5).setDepth(51);
  }
}
