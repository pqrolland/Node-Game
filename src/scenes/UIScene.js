export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
    this.eventLog = [];

    // Player state — replace with real data when Supabase is wired up
    this.playerName   = 'Player 1';
    this.planetCount  = 0;
    this.resources    = { units: 0, food: 0, metal: 0, fuel: 0 };
  }

  create() {
    const { width, height } = this.scale;
    const TOP_BAR_H = 40;

    // ── Top bar ────────────────────────────────────────────────────────────
    this.add.rectangle(0, 0, width, TOP_BAR_H, 0x080c14, 0.95).setOrigin(0, 0);
    this.add.rectangle(0, TOP_BAR_H - 1, width, 1, 0x2255aa, 0.7).setOrigin(0, 0);

    // Player name + planet count (top left)
    // Planet icon — small circle split into coloured segments
    this._drawPlanetIcon(14, TOP_BAR_H / 2, 10);

    // Player name + planet count (number only, icon acts as label)
    this.playerLabel = this.add.text(32, TOP_BAR_H / 2,
      `${this.playerName}  —  ${this.planetCount}`, {
      font: '13px monospace',
      color: '#7799bb',
    }).setOrigin(0, 0.5);

    // Resource readouts (top right) — units, food, metal, fuel
    const resources = [
      { key: 'units', icon: '⬡', color: '#aaccff' },
      { key: 'food',  icon: '🌾', color: '#88cc44' },
      { key: 'metal', icon: '⚙',  color: '#8888cc' },
      { key: 'fuel',  icon: '⛽', color: '#cc8844' },
    ];

    this.resourceTexts = {};
    // Each slot: icon(16) + label(40) + value(60) + gap(24) = 140px per slot
    // Rightmost slot ends 20px from edge, so total right offset = 20 + 4*140 = 580
    const SLOT_W    = 140;
    const RIGHT_PAD = 20;
    resources.forEach(({ key, icon, color }, i) => {
      // Anchor each slot from the right edge
      const slotRight = width - RIGHT_PAD - (resources.length - 1 - i) * SLOT_W;
      const slotLeft  = slotRight - SLOT_W + 10;

      // Icon
      this.add.text(slotLeft, TOP_BAR_H / 2, icon, {
        font: '14px monospace', color,
      }).setOrigin(0, 0.5);

      // Label
      this.add.text(slotLeft + 22, TOP_BAR_H / 2,
        key.charAt(0).toUpperCase() + key.slice(1), {
        font: '11px monospace', color: '#4a6688',
      }).setOrigin(0, 0.5);

      // Value — right-aligned to slot edge, wide enough for 6 digits
      this.resourceTexts[key] = this.add.text(slotRight, TOP_BAR_H / 2, '0', {
        font: 'bold 13px monospace', color,
      }).setOrigin(1, 0.5);
    });

    // ── Bottom bar ─────────────────────────────────────────────────────────
    this.add.rectangle(0, height - 80, width, 80, 0x080c14, 0.97).setOrigin(0, 0);
    this.add.rectangle(0, height - 82, width, 2, 0x2255aa, 0.8).setOrigin(0, 0);

    // Stack info (bottom left)
    this.stackLabel = this.add.text(16, height - 66, 'No stack selected', {
      font: '13px monospace', color: '#44aaff'
    });
    this.stackDetail = this.add.text(16, height - 46, '', {
      font: '11px monospace', color: '#7aaa8a'
    });

    // Controls hint (bottom centre)
    this.add.text(width / 2, height - 56,
      'Click stack to select  ·  Click destination to move  ·  Click same node to open panel  ·  ESC to deselect',
      { font: '11px monospace', color: '#223355' }
    ).setOrigin(0.5, 0);
    this.add.text(width / 2, height - 38,
      'WASD / Arrows: scroll  ·  Scroll wheel: zoom',
      { font: '11px monospace', color: '#1a2a44' }
    ).setOrigin(0.5, 0);

    // Event log (bottom right)
    this.logTexts = [];
    for (let i = 0; i < 3; i++) {
      this.logTexts.push(
        this.add.text(width - 16, height - 74 + i * 18, '', {
          font: '11px monospace', color: '#4477aa'
        }).setOrigin(1, 0)
      );
    }
  }

  // ── Public update methods (call these when game state changes) ─────────

  updateResources({ units, food, metal, fuel }) {
    this.resources = { units, food, metal, fuel };
    Object.entries(this.resources).forEach(([key, val]) => {
      if (this.resourceTexts[key]) this.resourceTexts[key].setText(String(val));
    });
  }

  updatePlayerInfo(name, planetCount) {
    this.playerName  = name;
    this.planetCount = planetCount;
    this.playerLabel.setText(`${name}  —  ${planetCount}`);
  }

  // Draws a small circle divided into coloured arcs — used as the planet count icon.
  // Phaser's Graphics.slice() draws filled pie wedges: slice(x, y, radius, startAngle, endAngle)
  _drawPlanetIcon(x, y, r) {
    const g = this.add.graphics();
    const segments = [
      { color: 0xff5522, from: 0,             to: Math.PI * 0.5  },  // Molten
      { color: 0x44aaff, from: Math.PI * 0.5, to: Math.PI * 1.1  },  // Habitable
      { color: 0x888899, from: Math.PI * 1.1, to: Math.PI * 1.65 },  // Barren
      { color: 0xccdd22, from: Math.PI * 1.65,to: Math.PI * 2    },  // Sulfuric
    ];
    segments.forEach(({ color, from, to }) => {
      g.fillStyle(color, 0.9);
      g.slice(x, y, r, from, to, false);
      g.fillPath();
    });
    // Thin dark border
    g.lineStyle(1, 0x080c14, 1);
    g.strokeCircle(x, y, r);
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
}
