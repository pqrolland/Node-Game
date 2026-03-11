// ══════════════════════════════════════════════════════════════════════════════
// CombatScene — floating combat detail window with phase-by-phase log.
//
// Layout (total W=680):
//   Left 420px  — HP columns (attacker | defender)
//   Right 240px — Combat log (phase entries, scrolled to latest)
//
// Events IN (game.events):
//   openCombat   { battle }  — open/focus this battle
//   combatUpdate { battle }  — redraw after a round fires
//   closeCombat  { battle }  — battle ended, close if showing this battle
//
// battle.log entries are pushed by CombatManager:
//   { round, phase, text, color }
// ══════════════════════════════════════════════════════════════════════════════

import { SHIP_STATS, SHIP_ORDER, ROUND_COOLDOWN } from '../combat/CombatManager.js';

const HP_W        = 420;  // left panel width (HP columns)
const LOG_W       = 240;  // right panel width (log)
const W           = HP_W + LOG_W;
const H           = 340;
const PANEL_DEPTH = 80;

const SHIP_COLORS = {
  fighter: 0x44aaff, destroyer: 0xaa66ff, cruiser: 0x44ddaa,
  dreadnaught: 0xff8844, flagship: 0xffdd44,
};
const SHIP_COLORS_HEX = {
  fighter: '#44aaff', destroyer: '#aa66ff', cruiser: '#44ddaa',
  dreadnaught: '#ff8844', flagship: '#ffdd44',
};

// Phase label colours
const PHASE_COLORS = {
  round:      '#ff4422',
  prestrike:  '#aa66ff',
  resolution: '#44aaff',
  main:       '#44ddaa',
  after:      '#ffdd44',
  info:       '#445566',
};

export default class CombatScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CombatScene' });
    this._battle         = null;
    this._objs           = [];
    this._open           = false;
    this._countdownBar   = null;
    this._countdownLabel = null;
  }

  create() {
    this.game.events.on('openCombat',   ({ battle }) => this._open_(battle), this);
    this.game.events.on('combatUpdate', ({ battle }) => {
      if (this._open && this._battle === battle) this._redraw();
    }, this);
    this.game.events.on('closeCombat',  ({ battle }) => {
      if (this._battle === battle) this._close();
    }, this);
  }

  update() {
    if (!this._open || !this._battle || !this._countdownBar) return;
    const progress = Math.min(this._battle.cooldownMs / ROUND_COOLDOWN, 1);
    const maxW     = HP_W - 32;
    this._countdownBar.clear();
    this._countdownBar.fillStyle(0x111a2a, 1);
    this._countdownBar.fillRect(this._cdX, this._cdY, maxW, 8);
    const col = progress < 0.5
      ? Phaser.Display.Color.GetColor(Math.round(255 * progress * 2), 200, 0)
      : Phaser.Display.Color.GetColor(255, Math.round(200 * (1 - progress)), 0);
    this._countdownBar.fillStyle(col, 1);
    this._countdownBar.fillRect(this._cdX, this._cdY, Math.round(maxW * progress), 8);
    this._countdownBar.lineStyle(1, 0x334466, 0.8);
    this._countdownBar.strokeRect(this._cdX, this._cdY, maxW, 8);
    const secLeft = Math.ceil((ROUND_COOLDOWN - this._battle.cooldownMs) / 1000);
    this._countdownLabel?.setText(`Next round in ${secLeft}s`);
  }

  // ── Open ──────────────────────────────────────────────────────────────────
  _open_(battle) {
    if (!battle.log) battle.log = [];
    this._battle = battle;
    this._open   = true;
    this._redraw();
  }

  // ── Full redraw ───────────────────────────────────────────────────────────
  _redraw() {
    this._objs.forEach(o => o?.destroy());
    this._objs           = [];
    this._countdownBar   = null;
    this._countdownLabel = null;

    const { width, height } = this.scale;
    const px = Math.round(width  / 2 - W / 2);
    const py = Math.round(height / 2 - H / 2);

    const R   = (x) => Math.round(x);
    const add = (o) => { this._objs.push(o); return o; };

    // ── Outer panel ──────────────────────────────────────────────────────────
    const bg = add(this.add.graphics().setDepth(PANEL_DEPTH));
    bg.fillStyle(0x080c14, 0.97);
    bg.fillRoundedRect(px, py, W, H, 6);
    bg.lineStyle(1.5, 0x2255aa, 0.9);
    bg.strokeRoundedRect(px, py, W, H, 6);

    // Vertical divider between HP panel and log panel
    bg.lineStyle(1, 0x1a3a5c, 0.8);
    bg.lineBetween(px + HP_W, py + 28, px + HP_W, py + H - 4);

    // ── Header ───────────────────────────────────────────────────────────────
    // Round label — shows the NEXT round to fire (current + 1), since the
    // window is visible during the cooldown period between rounds.
    const rnd = this._battle.roundNumber + 1;
    add(this.add.text(R(px + 12), R(py + 16), `Round ${rnd}`, {
      font: 'bold 10px monospace', color: '#445566',
    }).setOrigin(0, 0.5).setDepth(PANEL_DEPTH + 1).setResolution(2));

    // Title — centred over HP panel only
    add(this.add.text(R(px + HP_W / 2), R(py + 16), '⚔  COMBAT', {
      font: 'bold 13px monospace', color: '#ff4422',
    }).setOrigin(0.5, 0.5).setDepth(PANEL_DEPTH + 1).setResolution(2));

    // Log panel title
    add(this.add.text(R(px + HP_W + LOG_W / 2), R(py + 16), 'BATTLE LOG', {
      font: 'bold 9px monospace', color: '#2a4a6a',
    }).setOrigin(0.5, 0.5).setDepth(PANEL_DEPTH + 1).setResolution(2));

    // ✕ close — top RIGHT
    const closeBtn = add(this.add.text(R(px + W - 10), R(py + 16), '✕', {
      font: 'bold 12px monospace', color: '#445566',
    }).setOrigin(1, 0.5).setDepth(PANEL_DEPTH + 2).setResolution(2)
      .setInteractive({ useHandCursor: true }));
    closeBtn.on('pointerover',  () => closeBtn.setColor('#ff4422'));
    closeBtn.on('pointerout',   () => closeBtn.setColor('#445566'));
    closeBtn.on('pointerdown',  () => this._close());

    // Header divider (full width)
    const divG = add(this.add.graphics().setDepth(PANEL_DEPTH));
    divG.lineStyle(1, 0x1a3a5c, 0.8);
    divG.lineBetween(px + 12, py + 28, px + W - 12, py + 28);

    // ── HP columns ───────────────────────────────────────────────────────────
    const { attacker, defender } = this._battle;
    const COL_W = (HP_W - 24) / 2;

    this._drawSide(attacker, px + 12,           py + 36, COL_W, true,  add);
    this._drawSide(defender, px + 12 + COL_W,   py + 36, COL_W, false, add);

    // Vertical divider between attacker/defender columns
    const vDiv = add(this.add.graphics().setDepth(PANEL_DEPTH));
    vDiv.lineStyle(1, 0x1a3a5c, 0.6);
    vDiv.lineBetween(R(px + 12 + COL_W), py + 36, R(px + 12 + COL_W), py + H - 36);

    // ── Countdown bar (under HP columns) ─────────────────────────────────────
    const cdY = py + H - 28;
    const cdX = px + 16;
    this._countdownBar   = add(this.add.graphics().setDepth(PANEL_DEPTH + 1));
    this._countdownLabel = add(this.add.text(R(px + HP_W / 2), R(cdY - 10), '', {
      font: '9px monospace', color: '#445566',
    }).setOrigin(0.5, 0.5).setDepth(PANEL_DEPTH + 2).setResolution(2));
    this._cdX = cdX;
    this._cdY = cdY;

    // ── Battle log panel ──────────────────────────────────────────────────────
    this._drawLog(px + HP_W + 8, py + 32, LOG_W - 12, H - 44, add);
  }

  // ── HP side panel ─────────────────────────────────────────────────────────
  _drawSide(unit, sx, sy, colW, isAttacker, add) {
    const R     = (x) => Math.round(x);
    const label = isAttacker ? 'ATTACKER' : 'DEFENDER';
    const col   = unit.teamColorHex;
    const depth = PANEL_DEPTH + 1;

    add(this.add.text(R(sx + colW / 2), R(sy), label, {
      font: 'bold 9px monospace', color: '#445566',
    }).setOrigin(0.5, 0).setDepth(depth).setResolution(2));

    add(this.add.text(R(sx + colW / 2), R(sy + 12), `${unit.stackSize} ships`, {
      font: 'bold 11px monospace', color: col,
    }).setOrigin(0.5, 0).setDepth(depth).setResolution(2));

    let rowY        = sy + 30;
    const BAR_W     = colW - 28;
    const BAR_H     = 5;
    const ROW_H     = 20;
    const iconX     = sx + 10;
    const barX      = sx + 24;

    for (const type of SHIP_ORDER) {
      const hps = unit.unitHP?.[type];
      if (!hps || hps.length === 0) continue;

      const maxHP    = SHIP_STATS[type].hp;
      const count    = hps.length;
      const totalCur = hps.reduce((s, h) => s + h, 0);
      const totalMax = count * maxHP;
      const pct      = totalMax > 0 ? totalCur / totalMax : 0;
      const shipCol  = SHIP_COLORS[type]    || 0xffffff;
      const shipHex  = SHIP_COLORS_HEX[type] || '#ffffff';

      const iconGfx = add(this.add.graphics().setDepth(depth));
      _drawIcon(iconGfx, type, iconX, rowY + ROW_H / 2 - 2, shipCol);

      add(this.add.text(R(iconX + 11), R(rowY + 2), `${count}× ${type}`, {
        font: '9px monospace', color: shipHex,
      }).setOrigin(0, 0).setDepth(depth).setResolution(2));

      const barG = add(this.add.graphics().setDepth(depth));
      barG.fillStyle(0x111a2a, 1);
      barG.fillRect(R(barX), R(rowY + 12), R(BAR_W), BAR_H);

      const barFillCol = pct > 0.6
        ? shipCol
        : pct > 0.3
          ? Phaser.Display.Color.GetColor(255, Math.round(180 * pct / 0.6), 0)
          : Phaser.Display.Color.GetColor(220, 40, 20);
      barG.fillStyle(barFillCol, 0.9);
      barG.fillRect(R(barX), R(rowY + 12), R(BAR_W * pct), BAR_H);
      barG.lineStyle(0.5, shipCol, 0.3);
      barG.strokeRect(R(barX), R(rowY + 12), R(BAR_W), BAR_H);

      add(this.add.text(R(barX + BAR_W), R(rowY + 12), `${totalCur}/${totalMax}`, {
        font: '8px monospace', color: '#334455',
      }).setOrigin(1, 1).setDepth(depth).setResolution(2));

      // Invisible hover zone for tooltip
      const hoverZone = add(
        this.add.rectangle(R(sx + colW / 2), R(rowY + ROW_H / 2), colW, ROW_H, 0xffffff, 0)
          .setDepth(PANEL_DEPTH + 3).setInteractive({ useHandCursor: false })
      );
      const capturedType = type;
      hoverZone.on('pointerover', () => {
        this.game.events.emit('showTooltip', { key: capturedType, x: sx + colW + 4, y: rowY });
      });
      hoverZone.on('pointerout', () => {
        this.game.events.emit('hideTooltip');
      });

      rowY += ROW_H;
    }
  }

  // ── Battle log panel ──────────────────────────────────────────────────────
  _drawLog(lx, ly, lw, lh, add) {
    const R     = (x) => Math.round(x);
    const depth = PANEL_DEPTH + 1;
    const log   = this._battle?.log || [];

    const LINE_GAP = 3; // px between entries

    // Build flat line list grouped by round
    const lines = []; // { text, color }
    let lastRound = -1;
    for (const entry of log) {
      if (entry.round !== lastRound) {
        lines.push({ text: `── Round ${entry.round} ──`, color: PHASE_COLORS.round });
        lastRound = entry.round;
      }
      lines.push({ text: entry.text, color: entry.color });
    }

    if (lines.length === 0) {
      add(this.add.text(R(lx + lw / 2), R(ly + lh / 2), 'Waiting for\nfirst round...', {
        font: '9px monospace', color: '#2a4a6a', align: 'center',
      }).setOrigin(0.5, 0.5).setDepth(depth).setResolution(2));
      return;
    }

    // Measure each line's rendered height so we know how many fit.
    // We create them off-screen first, measure, then either keep or destroy.
    // Two-pass: first pass measures total height of all lines from the bottom,
    // second pass renders only those that fit within lh.

    // Forward pass: measure each line and record cumulative height from the end
    const measured = lines.map(line => {
      const t = this.add.text(-9999, -9999, line.text, {
        font: '9px monospace',
        color: line.color,
        wordWrap: { width: lw - 4 },
      }).setResolution(2);
      const h = t.height;
      t.destroy();
      return { ...line, h };
    });

    // Find the subset that fits within lh (from the end, newest last)
    let totalH  = 0;
    let startIdx = measured.length;
    for (let i = measured.length - 1; i >= 0; i--) {
      const needed = measured[i].h + (startIdx < measured.length ? LINE_GAP : 0);
      if (totalH + needed > lh) break;
      totalH  += needed;
      startIdx = i;
    }

    // Render the visible subset, top to bottom
    let y = ly;
    for (let i = startIdx; i < measured.length; i++) {
      const line = measured[i];
      add(this.add.text(R(lx), R(y), line.text, {
        font: '9px monospace',
        color: line.color,
        wordWrap: { width: lw - 4 },
      }).setOrigin(0, 0).setDepth(depth).setResolution(2));
      y += line.h + LINE_GAP;
    }
  }

  // ── Close ─────────────────────────────────────────────────────────────────
  _close() {
    this._objs.forEach(o => o?.destroy());
    this._objs           = [];
    this._battle         = null;
    this._open           = false;
    this._countdownBar   = null;
    this._countdownLabel = null;
  }
}

// ── Small ship icon ───────────────────────────────────────────────────────────
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
