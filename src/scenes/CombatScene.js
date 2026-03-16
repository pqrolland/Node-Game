// ══════════════════════════════════════════════════════════════════════════════
// CombatScene — floating combat detail window with phase-by-phase log.
//
// Layout (total W=680):
//   Left 420px  — HP columns (attacker | defender)
//   Right 260px — Combat log (scrollable)
//
// History button on right edge of screen — opens past battle logs.
//
// Events IN (game.events):
//   openCombat           { battle }   — open/focus this battle
//   combatUpdate         { battle }   — redraw after a round fires
//   closeCombat          { battle }   — battle ended, close if showing this battle
//   battleHistoryUpdated { history }  — update the history button badge
//
// battle.log entries: { round, phase, text, color }
// ══════════════════════════════════════════════════════════════════════════════

import { SHIP_STATS, SHIP_ORDER, ROUND_COOLDOWN } from '../combat/CombatManager.js';

const HP_W        = 420;
const LOG_W       = 260;
const W           = HP_W + LOG_W;
const H           = 360;
const PANEL_DEPTH = 80;

const SHIP_COLORS = {
  fighter: 0x44aaff, destroyer: 0xaa66ff, cruiser: 0x44ddaa,
  dreadnaught: 0xff8844, flagship: 0xffdd44,
};
const SHIP_COLORS_HEX = {
  fighter: '#44aaff', destroyer: '#aa66ff', cruiser: '#44ddaa',
  dreadnaught: '#ff8844', flagship: '#ffdd44',
};
const PHASE_COLORS = {
  round:      '#ff4422',
  prestrike:  '#aa66ff',
  resolution: '#44aaff',
  main:       '#44ddaa',
  after:      '#ffdd44',
  info:       '#445566',
};

const LINE_GAP   = 3;
const LOG_LINE_H = 11; // approximate px per line for scroll math

export default class CombatScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CombatScene' });
    this._battle         = null;
    this._objs           = [];
    this._open           = false;
    this._countdownBar   = null;
    this._countdownLabel = null;
    this._scrollOffset   = 0;   // px scrolled up from bottom of log
    this._history        = [];
    this._historyObjs    = [];
    this._historyOpen    = false;
    this._histBtn        = null;
    this._histBadge      = null;
  }

  create() {
    this.game.events.on('openCombat',   ({ battle }) => this._open_(battle), this);
    this.game.events.on('combatUpdate', ({ battle }) => {
      if (this._open && this._battle === battle) {
        // Auto-scroll to bottom on new round
        this._scrollOffset = 0;
        this._redraw();
      }
    }, this);
    this.game.events.on('closeCombat',  ({ battle }) => {
      if (this._battle === battle) this._close();
    }, this);
    this.game.events.on('battleHistoryUpdated', ({ history }) => {
      this._history = history;
      this._updateHistBtn();
    }, this);

    this._buildHistBtn();
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

  // ── History button ────────────────────────────────────────────────────────
  _buildHistBtn() {
    const { width, height } = this.scale;
    const bx = width - 8, by = Math.round(height / 2);
    const W  = 28, H = 34;

    // Drawn logbook — redrawn on hover/state change
    const gfx = this.add.graphics().setDepth(PANEL_DEPTH).setScrollFactor(0);
    this._histBtnGfx = gfx;
    this._histBtnX   = bx - W;
    this._histBtnY   = by - H / 2;
    this._drawLogBook(false);

    // Invisible hit zone
    const zone = this.add.rectangle(bx - W / 2, by, W, H, 0xffffff, 0)
      .setDepth(PANEL_DEPTH + 1).setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerover',  () => this._drawLogBook(true));
    zone.on('pointerout',   () => this._drawLogBook(false));
    zone.on('pointerdown',  () => this._toggleHistory());
    this._histBtn = zone;

    // Badge showing count
    this._histBadge = this.add.text(bx - 2, by - H / 2 - 2, '', {
      font: 'bold 8px monospace', color: '#ff4422',
    }).setOrigin(1, 1).setDepth(PANEL_DEPTH + 2).setScrollFactor(0);
  }

  _drawLogBook(hover) {
    const g    = this._histBtnGfx;
    const hasH = this._history.length > 0;
    g.clear();

    const x = this._histBtnX, y = this._histBtnY;
    const W = 28, H = 34;
    const alpha = hover ? 0.9 : hasH ? 0.65 : 0.3;

    // Book body
    g.fillStyle(0x1a3a6a, alpha);
    g.fillRoundedRect(x + 4, y, W - 4, H, 3);

    // Spine
    g.fillStyle(0x0d2040, alpha);
    g.fillRoundedRect(x, y + 2, 7, H - 4, 2);

    // Spine highlight
    g.lineStyle(1, 0x4477cc, alpha * 0.8);
    g.lineBetween(x + 6, y + 4, x + 6, y + H - 4);

    // Cover border
    g.lineStyle(1, hover ? 0x88bbff : 0x2255aa, alpha);
    g.strokeRoundedRect(x + 4, y, W - 4, H, 3);

    // Text lines on cover
    const lineCol = hover ? 0xaaccff : 0x4477aa;
    g.lineStyle(1, lineCol, alpha * 0.9);
    g.lineBetween(x + 10, y + 9,  x + W - 3, y + 9);
    g.lineBetween(x + 10, y + 14, x + W - 3, y + 14);
    g.lineBetween(x + 10, y + 19, x + W - 3, y + 19);
    g.lineBetween(x + 10, y + 24, x + W - 5, y + 24);

    // Small ⚔ mark at bottom of cover
    g.lineStyle(1.5, hover ? 0xaaccff : 0x336699, alpha);
    const mx = x + 18, my = y + H - 7;
    g.lineBetween(mx - 4, my - 3, mx + 4, my + 3);
    g.lineBetween(mx + 4, my - 3, mx - 4, my + 3);
  }

  _updateHistBtn() {
    this._drawLogBook(false);
    const n = this._history.length;
    this._histBadge?.setText(n ? `${n}` : '');
  }

  _toggleHistory() {
    if (this._historyOpen) {
      this._closeHistory();
    } else {
      this._openHistory();
    }
  }

  _openHistory(idx = null) {
    this._closeHistory();
    this._historyOpen = true;
    if (this._history.length === 0) return;

    const viewIdx = idx ?? this._history.length - 1;
    const record  = this._history[viewIdx];
    this._drawHistoryPanel(record, viewIdx);
  }

  _closeHistory() {
    this._historyObjs.forEach(o => o?.destroy());
    this._historyObjs = [];
    this._historyOpen = false;
  }

  _drawHistoryPanel(record, idx) {
    this._historyObjs.forEach(o => o?.destroy());
    this._historyObjs = [];
    const add  = (o) => { this._historyObjs.push(o); return o; };
    const R    = (x) => Math.round(x);
    const { width, height } = this.scale;
    const PW   = 400, PH = height - 40;
    const px   = width - PW - 22, py = 20;
    const dep  = PANEL_DEPTH + 10;

    // Panel bg
    const bg = add(this.add.graphics().setDepth(dep).setScrollFactor(0));
    bg.fillStyle(0x060a10, 0.97);
    bg.fillRoundedRect(px, py, PW, PH, 6);
    bg.lineStyle(1.5, 0x2255aa, 0.9);
    bg.strokeRoundedRect(px, py, PW, PH, 6);

    // Header
    add(this.add.text(R(px + PW / 2), R(py + 16), '⚔  BATTLE LOG', {
      font: 'bold 12px monospace', color: '#ff4422',
    }).setOrigin(0.5, 0.5).setDepth(dep + 1).setScrollFactor(0));

    // Close
    const cls = add(this.add.text(R(px + PW - 10), R(py + 16), '✕', {
      font: 'bold 12px monospace', color: '#445566',
    }).setOrigin(1, 0.5).setDepth(dep + 2).setScrollFactor(0)
      .setInteractive({ useHandCursor: true }));
    cls.on('pointerover',  () => cls.setColor('#ff4422'));
    cls.on('pointerout',   () => cls.setColor('#445566'));
    cls.on('pointerdown',  () => this._closeHistory());

    // Divider
    const dg = add(this.add.graphics().setDepth(dep).setScrollFactor(0));
    dg.lineStyle(1, 0x1a3a5c, 0.8);
    dg.lineBetween(px + 12, py + 28, px + PW - 12, py + 28);

    // Battle summary header
    const outcome = record.outcome === 'mutual' ? 'Mutual Destruction'
                  : record.outcome === 'attacker' ? 'Attacker Wins'
                  : 'Defender Holds';
    add(this.add.text(R(px + 12), R(py + 36), `📍 ${record.nodeName}  •  ${record.rounds} round(s)  •  ${outcome}`, {
      font: '9px monospace', color: '#445566',
    }).setOrigin(0, 0).setDepth(dep + 1).setScrollFactor(0));

    // Starting compositions
    const compStr = (comp, color) => {
      const parts = SHIP_ORDER.filter(t => (comp[t] || 0) > 0).map(t => `${comp[t]}× ${t}`);
      return parts.join('  ') || '(none)';
    };
    add(this.add.text(R(px + 12), R(py + 50), `ATK: ${compStr(record.atkSnapshot)}`, {
      font: '9px monospace', color: record.atkColor || '#44aaff',
    }).setOrigin(0, 0).setDepth(dep + 1).setScrollFactor(0));
    add(this.add.text(R(px + 12), R(py + 62), `DEF: ${compStr(record.defSnapshot)}`, {
      font: '9px monospace', color: record.defColor || '#ff4455',
    }).setOrigin(0, 0).setDepth(dep + 1).setScrollFactor(0));

    dg.lineBetween(px + 12, py + 76, px + PW - 12, py + 76);

    // Navigation arrows if multiple battles
    if (this._history.length > 1) {
      const navY = py + PH - 18;
      if (idx > 0) {
        const prev = add(this.add.text(R(px + 16), R(navY), '◀ Prev', {
          font: '9px monospace', color: '#445566',
        }).setOrigin(0, 0.5).setDepth(dep + 2).setScrollFactor(0)
          .setInteractive({ useHandCursor: true }));
        prev.on('pointerover', () => prev.setColor('#aaccff'));
        prev.on('pointerout',  () => prev.setColor('#445566'));
        prev.on('pointerdown', () => this._openHistory(idx - 1));
      }
      add(this.add.text(R(px + PW / 2), R(navY), `${idx + 1} / ${this._history.length}`, {
        font: '9px monospace', color: '#334455',
      }).setOrigin(0.5, 0.5).setDepth(dep + 1).setScrollFactor(0));
      if (idx < this._history.length - 1) {
        const next = add(this.add.text(R(px + PW - 16), R(navY), 'Next ▶', {
          font: '9px monospace', color: '#445566',
        }).setOrigin(1, 0.5).setDepth(dep + 2).setScrollFactor(0)
          .setInteractive({ useHandCursor: true }));
        next.on('pointerover', () => next.setColor('#aaccff'));
        next.on('pointerout',  () => next.setColor('#445566'));
        next.on('pointerdown', () => this._openHistory(idx + 1));
      }
    }

    // Log entries — scrollable in the remaining space
    const logTop    = py + 82;
    const logBottom = py + PH - (this._history.length > 1 ? 30 : 10);
    const logH      = logBottom - logTop;
    this._drawScrollableLog(record.log, px + 12, logTop, PW - 24, logH, dep + 1, add, `hist_${idx}`, 0);
  }

  // ── Open ──────────────────────────────────────────────────────────────────
  _open_(battle) {
    if (!battle.log) battle.log = [];
    this._battle      = battle;
    this._open        = true;
    this._scrollOffset = 0;
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

    bg.lineStyle(1, 0x1a3a5c, 0.8);
    bg.lineBetween(px + HP_W, py + 28, px + HP_W, py + H - 4);

    // ── Header ───────────────────────────────────────────────────────────────
    const rnd = this._battle.roundNumber + 1;
    add(this.add.text(R(px + 12), R(py + 16), `Round ${rnd}`, {
      font: 'bold 10px monospace', color: '#445566',
    }).setOrigin(0, 0.5).setDepth(PANEL_DEPTH + 1).setResolution(2));

    add(this.add.text(R(px + HP_W / 2), R(py + 16), '⚔  COMBAT', {
      font: 'bold 13px monospace', color: '#ff4422',
    }).setOrigin(0.5, 0.5).setDepth(PANEL_DEPTH + 1).setResolution(2));

    add(this.add.text(R(px + HP_W + LOG_W / 2), R(py + 16), 'BATTLE LOG', {
      font: 'bold 9px monospace', color: '#2a4a6a',
    }).setOrigin(0.5, 0.5).setDepth(PANEL_DEPTH + 1).setResolution(2));

    const closeBtn = add(this.add.text(R(px + W - 10), R(py + 16), '✕', {
      font: 'bold 12px monospace', color: '#445566',
    }).setOrigin(1, 0.5).setDepth(PANEL_DEPTH + 2).setResolution(2)
      .setInteractive({ useHandCursor: true }));
    closeBtn.on('pointerover',  () => closeBtn.setColor('#ff4422'));
    closeBtn.on('pointerout',   () => closeBtn.setColor('#445566'));
    closeBtn.on('pointerdown',  () => this._close());

    const divG = add(this.add.graphics().setDepth(PANEL_DEPTH));
    divG.lineStyle(1, 0x1a3a5c, 0.8);
    divG.lineBetween(px + 12, py + 28, px + W - 12, py + 28);

    // ── HP columns ───────────────────────────────────────────────────────────
    const { attacker, defender } = this._battle;
    const COL_W = (HP_W - 24) / 2;

    this._drawSide(attacker, px + 12,           py + 36, COL_W, true,  add);
    this._drawSide(defender, px + 12 + COL_W,   py + 36, COL_W, false, add);

    const vDiv = add(this.add.graphics().setDepth(PANEL_DEPTH));
    vDiv.lineStyle(1, 0x1a3a5c, 0.6);
    vDiv.lineBetween(R(px + 12 + COL_W), py + 36, R(px + 12 + COL_W), py + H - 36);

    // ── Countdown bar ─────────────────────────────────────────────────────────
    const cdY = py + H - 28;
    const cdX = px + 16;
    this._countdownBar   = add(this.add.graphics().setDepth(PANEL_DEPTH + 1));
    this._countdownLabel = add(this.add.text(R(px + HP_W / 2), R(cdY - 10), '', {
      font: '9px monospace', color: '#445566',
    }).setOrigin(0.5, 0.5).setDepth(PANEL_DEPTH + 2).setResolution(2));
    this._cdX = cdX;
    this._cdY = cdY;

    // ── Battle log (scrollable) ───────────────────────────────────────────────
    const logX = px + HP_W + 8;
    const logY = py + 32;
    const logW = LOG_W - 16;
    const logH = H - 44;
    this._drawScrollableLog(
      this._battle.log, logX, logY, logW, logH,
      PANEL_DEPTH + 1, add, 'live', this._scrollOffset,
      (newOffset) => { this._scrollOffset = newOffset; this._redraw(); }
    );
  }

  // ── Scrollable log renderer ───────────────────────────────────────────────
  // Renders log entries clipped to [lx, ly, lw, lh].
  // scrollOffset = px scrolled up from the bottom (0 = pinned to latest).
  // onScroll callback receives new offset when scroll wheel used.
  _drawScrollableLog(log, lx, ly, lw, lh, depth, add, key, scrollOffset, onScroll) {
    const R = (x) => Math.round(x);

    const lines = [];
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

    // Measure all line heights
    const measured = lines.map(line => {
      const t = this.add.text(-9999, -9999, line.text, {
        font: '9px monospace', color: line.color,
        wordWrap: { width: lw - 14 },
      }).setResolution(2);
      const h = t.height;
      t.destroy();
      return { ...line, h };
    });

    // Total content height
    const totalContentH = measured.reduce((s, m) => s + m.h + LINE_GAP, 0);
    const maxScroll     = Math.max(0, totalContentH - lh);
    const clampedOffset = Math.min(scrollOffset ?? 0, maxScroll);

    // Render lines starting from content offset
    // We render all lines but only show those within the clipped window
    let contentY = ly - (totalContentH - lh - clampedOffset);
    // Alternatively: start at ly, skip lines above the clip
    // Compute which lines are visible
    let curY = ly + (maxScroll > 0 ? maxScroll - clampedOffset : 0);
    // Simpler: build a full render at virtual Y, only create objects in window
    let virtualY = 0;
    const startVirtualY = maxScroll > 0 ? maxScroll - clampedOffset : 0;

    for (const line of measured) {
      const lineTop = ly - startVirtualY + virtualY;
      const lineBot = lineTop + line.h;
      // Only render if within clip window
      if (lineBot > ly && lineTop < ly + lh) {
        add(this.add.text(R(lx), R(lineTop), line.text, {
          font: '9px monospace',
          color: line.color,
          wordWrap: { width: lw - 14 },
        }).setOrigin(0, 0).setDepth(depth).setResolution(2));
      }
      virtualY += line.h + LINE_GAP;
    }

    // Scrollbar track
    if (maxScroll > 0) {
      const trackX  = lx + lw - 6;
      const trackG  = add(this.add.graphics().setDepth(depth));
      trackG.fillStyle(0x0d1828, 1);
      trackG.fillRect(R(trackX), R(ly), 4, R(lh));

      const thumbH   = Math.max(20, Math.round(lh * (lh / totalContentH)));
      const thumbRange = lh - thumbH;
      const thumbY   = ly + Math.round(thumbRange * (1 - clampedOffset / maxScroll));
      trackG.fillStyle(0x2255aa, 0.8);
      trackG.fillRoundedRect(R(trackX), R(thumbY), 4, thumbH, 2);

      // Scroll wheel zone
      if (onScroll) {
        const zone = add(this.add.rectangle(R(lx + lw / 2), R(ly + lh / 2), lw, lh, 0xffffff, 0)
          .setDepth(depth + 1).setInteractive());
        zone.on('wheel', (_ptr, _objs, _dx, dy) => {
          const newOffset = Math.max(0, Math.min(maxScroll, clampedOffset + dy * 0.5));
          onScroll(newOffset);
        });
      }
    }
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

      const maxHP    = unit.maxHP?.[type] ?? SHIP_STATS[type].hp;
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

      const hoverZone = add(
        this.add.rectangle(R(sx + colW / 2), R(rowY + ROW_H / 2), colW, ROW_H, 0xffffff, 0)
          .setDepth(PANEL_DEPTH + 3).setInteractive({ useHandCursor: false })
      );
      const capturedType = type;
      const capturedTeam = unit.team;
      const capturedComp = unit.composition;
      hoverZone.on('pointerover', () => {
        this.game.events.emit('showTooltip', { key: capturedType, x: sx + colW + 4, y: rowY, team: capturedTeam, composition: capturedComp });
      });
      hoverZone.on('pointerout', () => {
        this.game.events.emit('hideTooltip');
      });

      rowY += ROW_H;
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
    this._scrollOffset   = 0;
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

