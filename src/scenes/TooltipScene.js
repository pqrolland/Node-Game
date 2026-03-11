/**
 * TooltipScene.js
 * Floating keyword tooltip panel — always on top of every other scene (depth 200).
 *
 * Usage from any scene:
 *   this.game.events.emit('showTooltip', { key: 'destroyer', x, y });
 *   this.game.events.emit('hideTooltip');
 */

import { drawShipIcon } from '../units/Unit.js';

// ── Ship / keyword definitions ────────────────────────────────────────────────
export const TOOLTIP_DEFS = {
  fighter: {
    name:  'Fighter',
    color: '#44aaff',
    role:  'Cannon Fodder',
    stats: [
      { label: 'HP',      value: '10' },
      { label: 'Damage',  value: '5 / attack' },
      { label: 'Attacks', value: '1 per round' },
    ],
    desc:  'Basic unit. Produced by the Naval Base every 15s. Cheapest and most numerous — dies fastest in drawn-out battles.',
  },
  destroyer: {
    name:  'Destroyer',
    color: '#aa66ff',
    role:  'Skirmisher',
    stats: [
      { label: 'HP',      value: '20' },
      { label: 'Damage',  value: '10 / attack' },
      { label: 'Attacks', value: '1 per round' },
    ],
    desc:  'Durable front-line ship. Double the HP of a fighter with twice the punch — an efficient all-rounder.',
  },
  cruiser: {
    name:  'Cruiser',
    color: '#44ddaa',
    role:  'Resilient Support',
    stats: [
      { label: 'HP',      value: '20' },
      { label: 'Damage',  value: '10 × 2 / round' },
      { label: 'Repair',  value: '50% on death' },
    ],
    desc:  'Fires twice per round — the same total damage as a destroyer but spread across two targets. When destroyed, 50% chance to repair and rejoin the fight at full HP.',
  },
  dreadnaught: {
    name:  'Dreadnaught',
    color: '#ff8844',
    role:  'Heavy Warship',
    stats: [
      { label: 'HP',      value: '50' },
      { label: 'Damage',  value: '20 × 2 / round' },
      { label: 'Attacks', value: '2 per round' },
    ],
    desc:  'Heavily armoured capital ship. Requires concentrated fire to bring down and deals massive damage. The backbone of any serious fleet.',
  },
  flagship: {
    name:  'Flagship',
    color: '#ffdd44',
    role:  'Command Ship',
    stats: [
      { label: 'HP',         value: '60' },
      { label: 'Damage',     value: '20 × 2 / round' },
      { label: 'Loss =',     value: 'Instant defeat' },
    ],
    desc:  'Your command ship. Hardiest unit in the fleet — the last to fall. If your flagship is destroyed, all your planets and units are lost immediately.',
  },
  asteroid_miner: {
    name:  'Asteroid Miner',
    color: '#44ffdd',
    role:  'Autonomous Mining Unit',
    stats: [
      { label: 'Range',     value: '160 px' },
      { label: 'Speed',     value: '90 px/s' },
      { label: 'Mine Time', value: '4 sec' },
    ],
    desc:  'Patrols its home planet radius. Intercepts asteroids and meteors, mines them fully, then returns resources to the planet. Cannot be moved or destroyed.',
    drawCustomIcon(gfx, cx, cy, color) {
      const s = 6;
      gfx.fillStyle(color, 1);
      gfx.fillTriangle(cx, cy - s, cx + s, cy, cx, cy + s);
      gfx.fillTriangle(cx, cy - s, cx - s, cy, cx, cy + s);
      gfx.fillStyle(0xffffff, 0.6);
      gfx.fillCircle(cx, cy, 1.5);
    },
  },
};

const ICON_SIZE = 14; // radius-ish for drawShipIcon
const ICON_AREA = 28; // px reserved for icon before name starts

export default class TooltipScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TooltipScene' });
  }

  create() {
    const TW = 250;
    this._TW = TW;

    this._container = this.add.container(0, 0).setVisible(false).setDepth(200);

    // Background (redrawn each show)
    this._bg = this.add.graphics();
    this._container.add(this._bg);

    // Ship icon (redrawn each show via drawShipIcon)
    this._iconGfx = this.add.graphics();
    this._container.add(this._iconGfx);

    // Name text — positioned after icon
    this._nameText = this.add.text(0, 0, '', {
      font: 'bold 13px monospace', color: '#44aaff',
    });
    this._container.add(this._nameText);

    // Role subtitle
    this._roleText = this.add.text(0, 0, '', {
      font: '10px monospace', color: '#446688',
    });
    this._container.add(this._roleText);

    // Stat rows (up to 3)
    this._statLabels = [];
    this._statValues = [];
    for (let i = 0; i < 3; i++) {
      const lbl = this.add.text(0, 0, '', { font: '10px monospace', color: '#7799bb' });
      const val = this.add.text(0, 0, '', { font: 'bold 10px monospace', color: '#aaccff' });
      this._statLabels.push(lbl);
      this._statValues.push(val);
      this._container.add(lbl);
      this._container.add(val);
    }

    // Description
    this._descText = this.add.text(0, 0, '', {
      font: '10px monospace', color: '#7a9aba',
      wordWrap: { width: TW - 24 },
    });
    this._container.add(this._descText);

    this.game.events.on('showTooltip', ({ key, x, y }) => {
      this.scene.bringToTop(); // always render above every other scene
      this._show(key, x, y);
    });
    this.game.events.on('hideTooltip', () => this._hide());
  }

  _show(key, wx, wy) {
    const def = TOOLTIP_DEFS[key];
    if (!def) return;

    const { width, height } = this.scale;
    const TW  = this._TW;
    const PAD = 12;
    const LINE = 16;

    // Parse color once
    const colorInt = Phaser.Display.Color.HexStringToColor(def.color.replace('#', '')).color;

    // ── Draw icon (top-left of header) ──────────────────────────────────
    const iconCX = PAD + ICON_SIZE / 2;
    const iconCY = PAD + ICON_SIZE / 2 + 1;
    this._iconGfx.clear();
    if (def.drawCustomIcon) {
      def.drawCustomIcon(this._iconGfx, iconCX, iconCY, colorInt);
    } else {
      drawShipIcon(this._iconGfx, key, iconCX, iconCY, colorInt);
    }

    // ── Position name beside icon with guaranteed gap ─────────────────────
    this._nameText
      .setText(def.name)
      .setColor(def.color)
      .setPosition(PAD + ICON_AREA, PAD);          // ICON_AREA=28px always clears icon

    this._roleText
      .setText(def.role.toUpperCase())
      .setPosition(PAD, PAD + 20);

    // ── Stats ─────────────────────────────────────────────────────────────
    const stats  = def.stats || [];
    const statsY = PAD + 40;
    for (let i = 0; i < 3; i++) {
      if (i < stats.length) {
        this._statLabels[i].setText(stats[i].label + ':').setPosition(PAD, statsY + i * LINE);
        this._statValues[i].setText(stats[i].value).setPosition(PAD + 110, statsY + i * LINE);
      } else {
        this._statLabels[i].setText('');
        this._statValues[i].setText('');
      }
    }

    // ── Description ───────────────────────────────────────────────────────
    const descY = statsY + Math.max(1, stats.length) * LINE + 6;
    this._descText.setText(def.desc).setPosition(PAD, descY);

    const dynH = descY + this._descText.height + PAD + 4;

    // ── Background ────────────────────────────────────────────────────────
    this._bg.clear();
    this._bg.fillStyle(0x060b14, 0.96);
    this._bg.fillRoundedRect(0, 0, TW, dynH, 6);
    this._bg.lineStyle(1, colorInt, 0.7);
    this._bg.strokeRoundedRect(0, 0, TW, dynH, 6);
    // Left accent bar
    this._bg.fillStyle(colorInt, 0.85);
    this._bg.fillRect(0, 0, 3, dynH);
    // Divider under header
    this._bg.lineStyle(1, 0x1a2a44, 0.8);
    this._bg.lineBetween(PAD, statsY - 4, TW - PAD, statsY - 4);

    // ── Position tooltip (clamp to screen) ───────────────────────────────
    let tx = wx + 12;
    let ty = wy + 12;
    if (tx + TW  > width  - 8) tx = wx - TW  - 8;
    if (ty + dynH > height - 8) ty = wy - dynH - 8;
    this._container.setPosition(Math.max(4, tx), Math.max(4, ty));
    this._container.setVisible(true);
  }

  _hide() {
    this._container.setVisible(false);
  }
}
