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
    stats: [
      { label: 'Attack',  value: '1' },
      { label: 'Health',  value: '1' },
    ],
    desc:  'Basic unit. Produced by the Naval Base every 15s. First to die in combat.',
    role:  'Cannon Fodder',
  },
  destroyer: {
    name:  'Destroyer',
    color: '#aa66ff',
    stats: [
      { label: 'Attack',     value: '1' },
      { label: 'Health',     value: '1' },
      { label: 'Pre-Strike', value: 'Kills 2 fighters' },
    ],
    desc:  'Fires before combat starts, eliminating 2 enemy fighters per destroyer. Dies like a normal ship in the main phase.',
    role:  'Skirmisher',
  },
  cruiser: {
    name:  'Cruiser',
    color: '#44ddaa',
    stats: [
      { label: 'Attack', value: '1' },
      { label: 'Health', value: '1' },
      { label: 'Repair', value: '50% on death' },
    ],
    desc:  'When a cruiser is destroyed in combat, it has a 50% chance of repairing and returning to its stack.',
    role:  'Resilient Support',
  },
  dreadnaught: {
    name:  'Dreadnaught',
    color: '#ff8844',
    stats: [
      { label: 'Attack', value: '4' },
      { label: 'Health', value: '4' },
    ],
    desc:  'Counts as 4 units in combat — attacks with power 4 and requires 4 damage to destroy. The most powerful standard unit.',
    role:  'Heavy Warship',
  },
  flagship: {
    name:  'Flagship',
    color: '#ffdd44',
    stats: [
      { label: 'Attack',      value: '1' },
      { label: 'Health',      value: '1' },
      { label: 'Last to die', value: 'Always' },
    ],
    desc:  'Your command ship. Always the last unit destroyed. If your flagship is lost, you are defeated immediately.',
    role:  'Command Ship',
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

    this.game.events.on('showTooltip', ({ key, x, y }) => this._show(key, x, y));
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

    // ── Draw ship icon (top-left of header) ──────────────────────────────
    const iconCX = PAD + ICON_SIZE / 2;
    const iconCY = PAD + ICON_SIZE / 2 + 1;
    this._iconGfx.clear();
    drawShipIcon(this._iconGfx, key, iconCX, iconCY, colorInt);

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
