/**
 * TooltipScene.js
 * Floating keyword tooltip panel — always on top of every other scene (depth 200).
 *
 * Unit tooltip shows on the left. If the unit belongs to a team with relevant
 * unlocked research perks, a second "Perks Active" panel renders to its right.
 *
 * Usage from any scene:
 *   this.game.events.emit('showTooltip', { key: 'destroyer', x, y, team, composition });
 *   this.game.events.emit('hideTooltip');
 *
 * team        — (optional) the owning team string, e.g. 'player', 'player2'
 * composition — (optional) the stack's composition map, used to gate 'all' perks
 */

import { drawShipIcon } from '../units/Unit.js';
import { PERK_ICONS } from './ResearchScene.js';

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

const ICON_SIZE = 14;
const ICON_AREA = 28;

export default class TooltipScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TooltipScene' });
  }

  create() {
    const TW = 250;
    this._TW = TW;

    // ── Unit tooltip container ────────────────────────────────────────────────
    this._container = this.add.container(0, 0).setVisible(false).setDepth(200);

    this._bg       = this.add.graphics();
    this._iconGfx  = this.add.graphics();
    this._nameText = this.add.text(0, 0, '', { font: 'bold 13px monospace', color: '#44aaff' });
    this._roleText = this.add.text(0, 0, '', { font: '10px monospace',      color: '#446688' });
    this._descText = this.add.text(0, 0, '', { font: '10px monospace',      color: '#7a9aba', wordWrap: { width: TW - 24 } });

    this._statLabels = [];
    this._statValues = [];
    for (let i = 0; i < 3; i++) {
      const lbl = this.add.text(0, 0, '', { font: '10px monospace',       color: '#7799bb' });
      const val = this.add.text(0, 0, '', { font: 'bold 10px monospace',  color: '#aaccff' });
      this._statLabels.push(lbl);
      this._statValues.push(val);
    }

    // Add in draw order: bg first so all text renders on top
    this._container.add([
      this._bg, this._iconGfx,
      this._nameText, this._roleText,
      ...this._statLabels, ...this._statValues,
      this._descText,
    ]);

    // ── Perk panel container (rendered to the right) ──────────────────────────
    this._perkContainer = this.add.container(0, 0).setVisible(false).setDepth(200);
    this._perkBg        = this.add.graphics();
    this._perkContainer.add(this._perkBg);
    // Dynamic perk text objects are created/destroyed each show — stored here
    this._perkTexts = [];

    // ── Events ───────────────────────────────────────────────────────────────
    this.game.events.on('showTooltip', ({ key, x, y, team, composition }) => {
      this.scene.bringToTop();
      this._show(key, x, y, team ?? null, composition ?? null);
    });
    this.game.events.on('showBuildingTooltip', ({ bldId, x, y, team }) => {
      this.scene.bringToTop();
      this._showBuilding(bldId, x, y, team ?? 'player');
    });
    this.game.events.on('hideTooltip', () => this._hide());
  }

  // ── Main show ─────────────────────────────────────────────────────────────
  _show(key, wx, wy, team, composition) {
    const def = TOOLTIP_DEFS[key];
    if (!def) return;

    const { width, height } = this.scale;
    const TW  = this._TW;
    const PAD = 12;
    const LINE = 16;

    const colorInt = Phaser.Display.Color.HexStringToColor(def.color.replace('#', '')).color;

    // ── Icon ─────────────────────────────────────────────────────────────────
    const iconCX = PAD + ICON_SIZE / 2;
    const iconCY = PAD + ICON_SIZE / 2 + 1;
    this._iconGfx.clear();
    if (def.drawCustomIcon) {
      def.drawCustomIcon(this._iconGfx, iconCX, iconCY, colorInt);
    } else {
      drawShipIcon(this._iconGfx, key, iconCX, iconCY, colorInt);
    }

    this._nameText.setText(def.name).setColor(def.color).setPosition(PAD + ICON_AREA, PAD);
    this._roleText.setText(def.role.toUpperCase()).setPosition(PAD, PAD + 20);

    // ── Stats ─────────────────────────────────────────────────────────────────
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

    // ── Description ───────────────────────────────────────────────────────────
    const descY = statsY + Math.max(1, stats.length) * LINE + 6;
    this._descText.setText(def.desc).setPosition(PAD, descY);

    const unitH = descY + this._descText.height + PAD + 4;

    // ── Unit tooltip background ────────────────────────────────────────────────
    this._bg.clear();
    this._bg.fillStyle(0x060b14, 0.96);
    this._bg.fillRoundedRect(0, 0, TW, unitH, 6);
    this._bg.lineStyle(1, colorInt, 0.7);
    this._bg.strokeRoundedRect(0, 0, TW, unitH, 6);
    this._bg.fillStyle(colorInt, 0.85);
    this._bg.fillRect(0, 0, 3, unitH);
    this._bg.lineStyle(1, 0x1a2a44, 0.8);
    this._bg.lineBetween(PAD, statsY - 4, TW - PAD, statsY - 4);

    // ── Position unit tooltip (clamp to screen) ───────────────────────────────
    let tx = wx + 12;
    let ty = wy + 12;
    if (ty + unitH > height - 8) ty = wy - unitH - 8;
    if (tx + TW    > width  - 8) tx = wx - TW - 8;
    tx = Math.max(4, tx);
    ty = Math.max(4, ty);
    this._container.setPosition(tx, ty).setVisible(true);

    // ── Perk panel ────────────────────────────────────────────────────────────
    const perks = this._getPerks(team, key, composition);
    if (perks.length > 0) {
      this._showPerkPanel(tx + TW + 6, ty, unitH, perks, width, height);
    } else {
      this._perkContainer.setVisible(false);
    }
  }

  // ── Perk panel renderer ───────────────────────────────────────────────────
  _showPerkPanel(preferX, anchorY, unitH, perks, screenW, screenH) {
    const PW       = 270;  // wide enough for icon + name + wrapped desc
    const PAD      = 10;
    const ICON_COL = 24;   // px reserved for icon on the left of each row
    const TITLE_H  = 22;
    const NAME_H   = 13;
    const ITEM_GAP = 8;
    const ICON_COL_COLOR = 0x44aa22;

    // Destroy old dynamic text/graphics objects
    for (const t of this._perkTexts) t.destroy();
    this._perkTexts = [];

    // Pre-measure desc heights so we can calculate total panel height accurately
    // Use a temporary off-screen text to measure (destroy immediately after)
    const wrapW = PW - PAD - ICON_COL - PAD;
    const measurer = this.add.text(-9999, -9999, '', {
      font: '9px monospace', wordWrap: { width: wrapW },
    });
    const itemHeights = perks.map(p => {
      measurer.setText(p.desc);
      return NAME_H + measurer.height + ITEM_GAP;
    });
    measurer.destroy();

    const totalItemH = itemHeights.reduce((s, h) => s + h, 0);
    const panelH = PAD + TITLE_H + totalItemH + PAD;

    // Clamp position
    let px = preferX;
    if (px + PW > screenW - 8) px = preferX - PW - this._TW - 12;
    px = Math.max(4, px);
    let py = anchorY;
    if (py + panelH > screenH - 8) py = screenH - panelH - 8;
    py = Math.max(4, py);

    // Background
    this._perkBg.clear();
    this._perkBg.fillStyle(0x060b14, 0.96);
    this._perkBg.fillRoundedRect(0, 0, PW, panelH, 6);
    this._perkBg.lineStyle(1, 0x336622, 0.8);
    this._perkBg.strokeRoundedRect(0, 0, PW, panelH, 6);
    // Left accent bar
    this._perkBg.fillStyle(ICON_COL_COLOR, 0.9);
    this._perkBg.fillRect(0, 0, 3, panelH);

    // Header
    const header = this.add.text(PAD + 4, PAD, 'RESEARCH ACTIVE', {
      font: 'bold 10px monospace', color: '#66cc44',
    });
    this._perkContainer.add(header);
    this._perkTexts.push(header);

    // Divider under header
    const divG = this.add.graphics();
    divG.lineStyle(1, 0x1a3a14, 0.8);
    divG.lineBetween(PAD, PAD + TITLE_H - 4, PW - PAD, PAD + TITLE_H - 4);
    this._perkContainer.add(divG);
    this._perkTexts.push(divG);

    // Perk rows
    let ry = PAD + TITLE_H;
    for (let i = 0; i < perks.length; i++) {
      const perk   = perks[i];
      const rowH   = itemHeights[i];
      const iconFn = PERK_ICONS[perk.name];
      const iconCX = PAD + ICON_COL / 2;
      const iconCY = ry + NAME_H / 2 + 2;
      const textX  = PAD + ICON_COL + 2;

      // Icon graphic
      const iconG = this.add.graphics();
      if (iconFn) iconFn(iconG, iconCX, iconCY, 0x66cc44);
      this._perkContainer.add(iconG);
      this._perkTexts.push(iconG);

      // Perk name
      const nameT = this.add.text(textX, ry, perk.name, {
        font: 'bold 10px monospace', color: '#88dd66',
      });
      // Perk description
      const descT = this.add.text(textX, ry + NAME_H, perk.desc, {
        font: '9px monospace', color: '#557744',
        wordWrap: { width: wrapW },
      });
      this._perkContainer.add(nameT);
      this._perkContainer.add(descT);
      this._perkTexts.push(nameT, descT);

      // Subtle row divider (skip after last item)
      if (i < perks.length - 1) {
        const rowDivG = this.add.graphics();
        rowDivG.lineStyle(1, 0x0d2210, 0.6);
        rowDivG.lineBetween(PAD, ry + rowH - ITEM_GAP / 2, PW - PAD, ry + rowH - ITEM_GAP / 2);
        this._perkContainer.add(rowDivG);
        this._perkTexts.push(rowDivG);
      }

      ry += rowH;
    }

    this._perkContainer.setPosition(px, py).setVisible(true);
  }

  // ── Query PerkManager (safe — returns [] if not available) ────────────────
  _getPerks(team, shipType, composition) {
    if (!team) return [];
    try {
      const gs = this.game.scene.getScene('GameScene');
      if (!gs?.perkManager) return [];
      return gs.perkManager.getPerksForUnit(team, shipType, composition) || [];
    } catch {
      return [];
    }
  }

  // ── Building tooltip ──────────────────────────────────────────────────────
  _showBuilding(bldId, wx, wy, team) {
    // Building definitions live in NodePanel — read them via GameScene or inline
    const BLD_INFO = {
      naval_base:          { name: 'Naval Base',          ship: 'fighter',     base: 15 },
      destroyer_factory:   { name: 'Destroyer Factory',   ship: 'destroyer',   base: 30 },
      cruiser_factory:     { name: 'Cruiser Factory',     ship: 'cruiser',     base: 30 },
      dreadnaught_factory: { name: 'Dreadnaught Factory', ship: 'dreadnaught', base: 30 },
    };
    const info = BLD_INFO[bldId];
    if (!info) return;

    const { width, height } = this.scale;
    const TW  = this._TW;
    const PAD = 12;

    // Lookup active perks for this building
    let perks = [];
    let effectiveSecs = info.base;
    try {
      const gs = this.game.scene.getScene('GameScene');
      if (gs?.perkManager) {
        perks = gs.perkManager.getPerksForBuilding(team, bldId) || [];
        const effectiveMs = gs.perkManager.getRapidScrambleDuration(team, bldId, info.base * 1000);
        effectiveSecs = Math.round(effectiveMs / 1000);
      }
    } catch { /* safe */ }

    const hasPerks   = perks.length > 0;
    const capColor   = hasPerks ? '#88dd66' : '#aaccff';
    const rateBase   = `+1 ${info.ship} / ${info.base}s`;
    const rateActive = hasPerks ? `+1 ${info.ship} / ${effectiveSecs}s` : null;

    // Build lines
    const lines = [
      { text: info.name,   font: 'bold 13px monospace', color: capColor,  y: PAD },
      { text: rateBase,    font: '10px monospace',       color: hasPerks ? '#556677' : '#7799bb', y: PAD + 20, strike: hasPerks },
    ];
    if (rateActive) lines.push({ text: rateActive, font: 'bold 10px monospace', color: '#88dd66', y: PAD + 34 });

    const contentH = rateActive ? PAD + 52 : PAD + 36;
    const perkBlockY = contentH;
    const PERK_ROW_H = 36;
    const totalH = perkBlockY + (hasPerks ? 8 + perks.length * PERK_ROW_H + PAD : PAD);

    // Position
    let tx = wx + 12, ty = wy + 12;
    if (ty + totalH > height - 8) ty = wy - totalH - 8;
    if (tx + TW     > width  - 8) tx = wx - TW - 8;
    tx = Math.max(4, tx); ty = Math.max(4, ty);

    // Draw into perk container (reuse it for building tooltip too)
    this._perkTexts.forEach(o => o.destroy());
    this._perkTexts = [];

    const bg = this.add.graphics();
    bg.fillStyle(0x060b14, 0.96);
    bg.fillRoundedRect(0, 0, TW, totalH, 6);
    bg.lineStyle(1, hasPerks ? 0x336622 : 0x1a2a44, 0.8);
    bg.strokeRoundedRect(0, 0, TW, totalH, 6);
    bg.fillStyle(hasPerks ? 0x336622 : 0x1a3a5c, 1);
    bg.fillRect(0, 0, 3, totalH);
    this._perkContainer.add(bg);
    this._perkTexts.push(bg);

    for (const l of lines) {
      const t = this.add.text(PAD, l.y, l.text, { font: l.font, color: l.color });
      if (l.strike) {
        // Draw strikethrough manually via graphics
        const sg = this.add.graphics();
        sg.lineStyle(1, 0x445566, 0.9);
        const mid = l.y + t.height / 2;
        sg.lineBetween(PAD, mid, PAD + t.width, mid);
        this._perkContainer.add(sg);
        this._perkTexts.push(sg);
      }
      this._perkContainer.add(t);
      this._perkTexts.push(t);
    }

    if (hasPerks) {
      const divG = this.add.graphics();
      divG.lineStyle(1, 0x1a3310, 0.8);
      divG.lineBetween(PAD, perkBlockY + 4, TW - PAD, perkBlockY + 4);
      this._perkContainer.add(divG);
      this._perkTexts.push(divG);

      perks.forEach((perk, i) => {
        const ry = perkBlockY + 8 + i * PERK_ROW_H;
        const iconFn = PERK_ICONS[perk.name];
        if (iconFn) {
          const ig = this.add.graphics();
          iconFn(ig, PAD + 8, ry + 8, 0x66cc44);
          this._perkContainer.add(ig);
          this._perkTexts.push(ig);
        }
        const tx2 = PAD + 24;
        const nt = this.add.text(tx2, ry, perk.name, { font: 'bold 10px monospace', color: '#88dd66' });
        const dt = this.add.text(tx2, ry + 13, perk.desc, { font: '9px monospace', color: '#557744', wordWrap: { width: TW - tx2 - PAD } });
        this._perkContainer.add(nt); this._perkContainer.add(dt);
        this._perkTexts.push(nt, dt);
      });
    }

    // Hide unit tooltip, show perk container as the building tooltip
    this._container.setVisible(false);
    this._perkContainer.setPosition(tx, ty).setVisible(true);
  }

  _hide() {
    this._container.setVisible(false);
    this._perkContainer.setVisible(false);
  }
}
