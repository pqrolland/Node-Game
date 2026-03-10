// ══════════════════════════════════════════════════════════════════════════════
// CombatScene — floating combat detail window.
//
// Opened by clicking the combat overlay pills on the map.
// Shows both sides' ship lists with live health bars, round counter,
// and a countdown bar for the next round.
//
// Events IN  (game.events):
//   openCombat   { battle }  — open/focus this battle
//   combatUpdate { battle }  — redraw after a round fires
//   closeCombat  { battle }  — battle ended, close if showing this battle
//
// ══════════════════════════════════════════════════════════════════════════════

import { SHIP_STATS, SHIP_ORDER, ROUND_COOLDOWN } from '../combat/CombatManager.js';

const W = 420, H = 320;
const PANEL_DEPTH = 80;

const SHIP_COLORS = {
  fighter: 0x44aaff, destroyer: 0xaa66ff, cruiser: 0x44ddaa,
  dreadnaught: 0xff8844, flagship: 0xffdd44,
};
const SHIP_COLORS_HEX = {
  fighter: '#44aaff', destroyer: '#aa66ff', cruiser: '#44ddaa',
  dreadnaught: '#ff8844', flagship: '#ffdd44',
};

export default class CombatScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CombatScene' });
    this._battle  = null;
    this._objs    = [];   // all Phaser objects — cleared on close/redraw
    this._open    = false;
  }

  create() {
    // Listen for open/update/close from CombatManager
    this.game.events.on('openCombat',   ({ battle }) => this._open_(battle), this);
    this.game.events.on('combatUpdate', ({ battle }) => {
      if (this._open && this._battle === battle) this._redraw();
    }, this);
    this.game.events.on('closeCombat',  ({ battle }) => {
      if (this._battle === battle) this._close();
    }, this);
  }

  update() {
    // Redraw countdown bar every frame while open
    if (!this._open || !this._battle || !this._countdownBar) return;
    const progress = Math.min(this._battle.cooldownMs / ROUND_COOLDOWN, 1);
    const maxW     = W - 32;
    this._countdownBar.clear();
    // Track
    this._countdownBar.fillStyle(0x111a2a, 1);
    this._countdownBar.fillRect(this._cdX, this._cdY, maxW, 8);
    // Fill — green→yellow→red
    const col = progress < 0.5
      ? Phaser.Display.Color.GetColor(Math.round(255 * progress * 2), 200, 0)
      : Phaser.Display.Color.GetColor(255, Math.round(200 * (1 - progress)), 0);
    this._countdownBar.fillStyle(col, 1);
    this._countdownBar.fillRect(this._cdX, this._cdY, Math.round(maxW * progress), 8);
    // Border
    this._countdownBar.lineStyle(1, 0x334466, 0.8);
    this._countdownBar.strokeRect(this._cdX, this._cdY, maxW, 8);
    // Seconds label
    const secLeft = Math.ceil((ROUND_COOLDOWN - this._battle.cooldownMs) / 1000);
    this._countdownLabel?.setText(`Next round in ${secLeft}s`);
  }

  // ── Open / draw ───────────────────────────────────────────────────────────
  _open_(battle) {
    this._battle = battle;
    this._open   = true;
    this._redraw();
  }

  _redraw() {
    // Destroy previous objects
    this._objs.forEach(o => o?.destroy());
    this._objs = [];
    this._countdownBar   = null;
    this._countdownLabel = null;

    const { width, height } = this.scale;
    const px = Math.round(width  / 2 - W / 2);
    const py = Math.round(height / 2 - H / 2);

    const R = (x) => Math.round(x);
    const add = (o) => { this._objs.push(o); return o; };

    // ── Panel background ────────────────────────────────────────────────────
    const bg = add(this.add.graphics().setDepth(PANEL_DEPTH));
    bg.fillStyle(0x080c14, 0.97);
    bg.fillRoundedRect(px, py, W, H, 6);
    bg.lineStyle(1.5, 0x2255aa, 0.9);
    bg.strokeRoundedRect(px, py, W, H, 6);

    // ── Header ───────────────────────────────────────────────────────────────
    add(this.add.text(R(px + W / 2), R(py + 16), '⚔  COMBAT', {
      font: 'bold 13px monospace', color: '#ff4422',
    }).setOrigin(0.5, 0.5).setDepth(PANEL_DEPTH + 1).setResolution(2));

    // Round counter
    const rnd = this._battle.roundNumber;
    add(this.add.text(R(px + W - 12), R(py + 16), `Round ${rnd}`, {
      font: '10px monospace', color: '#445566',
    }).setOrigin(1, 0.5).setDepth(PANEL_DEPTH + 1).setResolution(2));

    // Divider
    const divG = add(this.add.graphics().setDepth(PANEL_DEPTH));
    divG.lineStyle(1, 0x1a3a5c, 0.8);
    divG.lineBetween(px + 12, py + 28, px + W - 12, py + 28);

    // ── Close button ──────────────────────────────────────────────────────────
    const closeBtn = add(this.add.text(R(px + W - 12), R(py + 16), '✕', {
      font: 'bold 12px monospace', color: '#445566',
    }).setOrigin(1, 0.5).setDepth(PANEL_DEPTH + 2).setResolution(2)
      .setInteractive({ useHandCursor: true }));
    closeBtn.on('pointerover',  () => closeBtn.setColor('#ff4422'));
    closeBtn.on('pointerout',   () => closeBtn.setColor('#445566'));
    closeBtn.on('pointerdown',  () => this._close());

    // ── Two columns: attacker (left) / defender (right) ──────────────────────
    const { attacker, defender } = this._battle;
    const COL_W = (W - 24) / 2;

    this._drawSide(attacker, px + 12,           py + 36, COL_W, true,  add);
    this._drawSide(defender, px + 12 + COL_W,   py + 36, COL_W, false, add);

    // Vertical divider between columns
    const vDiv = add(this.add.graphics().setDepth(PANEL_DEPTH));
    vDiv.lineStyle(1, 0x1a3a5c, 0.6);
    vDiv.lineBetween(R(px + 12 + COL_W), py + 36, R(px + 12 + COL_W), py + H - 36);

    // ── Countdown bar ─────────────────────────────────────────────────────────
    const cdY = py + H - 28;
    const cdX = px + 16;

    this._countdownBar   = add(this.add.graphics().setDepth(PANEL_DEPTH + 1));
    this._countdownLabel = add(this.add.text(R(px + W / 2), R(cdY - 10), '', {
      font: '9px monospace', color: '#445566',
    }).setOrigin(0.5, 0.5).setDepth(PANEL_DEPTH + 2).setResolution(2));

    this._cdX = cdX;
    this._cdY = cdY;
  }

  // ── Draw one side's ship list with health bars ────────────────────────────
  _drawSide(unit, sx, sy, colW, isAttacker, add) {
    const R    = (x) => Math.round(x);
    const label = isAttacker ? 'ATTACKER' : 'DEFENDER';
    const col   = unit.teamColorHex;
    const depth = PANEL_DEPTH + 1;

    // Side header
    add(this.add.text(R(sx + colW / 2), R(sy), label, {
      font: 'bold 9px monospace', color: '#445566',
    }).setOrigin(0.5, 0).setDepth(depth).setResolution(2));

    // Team name / total count
    add(this.add.text(R(sx + colW / 2), R(sy + 12), `${unit.stackSize} ships`, {
      font: 'bold 11px monospace', color: col,
    }).setOrigin(0.5, 0).setDepth(depth).setResolution(2));

    let rowY = sy + 30;
    const BAR_W  = colW - 28;
    const BAR_H  = 5;
    const ROW_H  = 20;
    const iconX  = sx + 10;
    const barX   = sx + 24;

    for (const type of SHIP_ORDER) {
      const hps = unit.unitHP?.[type];
      if (!hps || hps.length === 0) continue;

      const maxHP    = SHIP_STATS[type].hp;
      const count    = hps.length;
      const totalCur = hps.reduce((s, h) => s + h, 0);
      const totalMax = count * maxHP;
      const pct      = totalMax > 0 ? totalCur / totalMax : 0;
      const shipCol  = SHIP_COLORS[type] || 0xffffff;
      const shipHex  = SHIP_COLORS_HEX[type] || '#ffffff';

      // Ship icon (small, in ship colour)
      const iconGfx = add(this.add.graphics().setDepth(depth));
      _drawIcon(iconGfx, type, iconX, rowY + ROW_H / 2 - 2, shipCol);

      // Count + type label
      add(this.add.text(R(iconX + 11), R(rowY + 2), `${count}× ${type}`, {
        font: '9px monospace', color: shipHex,
      }).setOrigin(0, 0).setDepth(depth).setResolution(2));

      // HP bar background
      const barG = add(this.add.graphics().setDepth(depth));
      barG.fillStyle(0x111a2a, 1);
      barG.fillRect(R(barX), R(rowY + 12), R(BAR_W), BAR_H);

      // HP bar fill — colour shifts red as HP drops
      const barFillCol = pct > 0.6
        ? shipCol
        : pct > 0.3
          ? Phaser.Display.Color.GetColor(255, Math.round(180 * pct / 0.6), 0)
          : Phaser.Display.Color.GetColor(220, 40, 20);
      barG.fillStyle(barFillCol, 0.9);
      barG.fillRect(R(barX), R(rowY + 12), R(BAR_W * pct), BAR_H);
      barG.lineStyle(0.5, shipCol, 0.3);
      barG.strokeRect(R(barX), R(rowY + 12), R(BAR_W), BAR_H);

      // HP numbers
      add(this.add.text(R(barX + BAR_W), R(rowY + 12), `${totalCur}/${totalMax}`, {
        font: '8px monospace', color: '#334455',
      }).setOrigin(1, 1).setDepth(depth).setResolution(2));

      rowY += ROW_H;
    }
  }

  // ── Close ─────────────────────────────────────────────────────────────────
  _close() {
    this._objs.forEach(o => o?.destroy());
    this._objs       = [];
    this._battle     = null;
    this._open       = false;
    this._countdownBar   = null;
    this._countdownLabel = null;
  }
}

// Small ship icon drawn at (cx, cy) into a graphics object
function _drawIcon(gfx, type, cx, cy, color) {
  gfx.fillStyle(color, 1);
  switch (type) {
    case 'fighter':
      gfx.fillTriangle(cx, cy - 5, cx - 4, cy + 4, cx + 4, cy + 4); break;
    case 'destroyer':
      gfx.fillTriangle(cx - 5, cy + 4, cx - 1, cy - 4, cx + 1, cy + 4);
      gfx.fillTriangle(cx - 1, cy + 4, cx + 3, cy - 4, cx + 6, cy + 4); break;
    case 'cruiser':
      gfx.fillTriangle(cx - 5, cy + 4, cx - 2, cy + 4, cx + 1, cy - 4);
      gfx.fillTriangle(cx - 5, cy + 4, cx - 2, cy - 4, cx + 1, cy - 4);
      gfx.fillTriangle(cx + 1, cy + 4, cx + 4, cy + 4, cx + 6, cy - 4);
      gfx.fillTriangle(cx + 1, cy + 4, cx + 3, cy - 4, cx + 6, cy - 4); break;
    case 'dreadnaught':
      gfx.fillTriangle(cx - 5, cy - 4, cx + 4, cy, cx - 5, cy + 4);
      gfx.fillStyle(color, 0.6);
      gfx.fillTriangle(cx - 1, cy - 4, cx + 7, cy, cx - 1, cy + 4);
      gfx.fillStyle(color, 1); break;
    case 'flagship':
      gfx.fillTriangle(cx, cy - 6, cx - 4, cy, cx + 4, cy);
      gfx.fillTriangle(cx - 4, cy, cx + 4, cy, cx, cy + 6);
      gfx.fillStyle(0xffffff, 0.9);
      gfx.fillCircle(cx, cy, 2); break;
  }
}
