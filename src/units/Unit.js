/**
 * Unit.js — A stack of units that travels node-to-node along graph edges.
 *
 * Each stack has a `composition` object tracking how many of each ship type
 * it contains: { fighter, destroyer, cruiser, dreadnaught, flagship }
 * stackSize is always the sum of all composition values.
 *
 * The badge shows: dominant ship icon (left) + total count (right)
 * Dominant type = highest-tier ship present in the stack.
 */

// Ship tier order (highest = most dominant for icon display)
export const SHIP_TYPES = ['flagship', 'dreadnaught', 'cruiser', 'destroyer', 'fighter'];

export function emptyComposition() {
  return { fighter: 0, destroyer: 0, cruiser: 0, dreadnaught: 0, flagship: 0 };
}

export function compositionTotal(comp) {
  return (comp.fighter || 0) + (comp.destroyer || 0) + (comp.cruiser || 0)
       + (comp.dreadnaught || 0) + (comp.flagship || 0);
}

// Returns the highest-tier ship type present in the composition
export function dominantType(comp) {
  for (const t of SHIP_TYPES) {
    if ((comp[t] || 0) > 0) return t;
  }
  return 'fighter';
}

// Draw a ship icon centred at (cx, cy) into a Phaser Graphics object
export function drawShipIcon(gfx, type, cx, cy, color) {
  gfx.fillStyle(color, 1);
  gfx.lineStyle(1.5, color, 1);

  switch (type) {
    case 'fighter':
      // Single upward-pointing triangle
      gfx.fillTriangle(cx, cy - 7, cx - 5, cy + 5, cx + 5, cy + 5);
      break;

    case 'destroyer':
      // Two symmetrical mountain peaks — match destroyer_factory icon, scaled down
      gfx.fillTriangle(cx - 7, cy + 5, cx - 1, cy - 5, cx + 1, cy + 5);
      gfx.fillTriangle(cx - 1, cy + 5, cx + 5, cy - 5, cx + 8, cy + 5);
      break;

    case 'cruiser':
      // Two even diagonal bars ( // ) — match cruiser_factory icon, scaled down
      gfx.fillTriangle(cx - 6, cy + 6,  cx - 3, cy + 6,  cx + 1, cy - 6);
      gfx.fillTriangle(cx - 6, cy + 6,  cx - 2, cy - 6,  cx + 1, cy - 6);
      gfx.fillTriangle(cx + 1, cy + 6,  cx + 4, cy + 6,  cx + 7, cy - 6);
      gfx.fillTriangle(cx + 1, cy + 6,  cx + 4, cy - 6,  cx + 7, cy - 6);
      break;

    case 'dreadnaught':
      // Two right-pointing triangles (fast-forward) — match dreadnaught_factory icon
      gfx.fillTriangle(cx - 6, cy - 6, cx + 5, cy,  cx - 6, cy + 6);
      gfx.fillStyle(color, 0.65);
      gfx.fillTriangle(cx - 1, cy - 6, cx + 8, cy,  cx - 1, cy + 6);
      gfx.fillStyle(color, 1);
      break;

    case 'flagship':
      // Diamond / star shape — commanding presence
      gfx.fillStyle(color, 1);
      gfx.fillTriangle(cx, cy - 8,  cx - 5, cy,  cx + 5, cy);   // top half
      gfx.fillTriangle(cx - 5, cy,  cx + 5, cy,  cx, cy + 8);   // bottom half
      // Bright inner core
      gfx.fillStyle(0xffffff, 0.9);
      gfx.fillCircle(cx, cy, 2.5);
      break;
  }
}

export default class Unit extends Phaser.GameObjects.Container {

  constructor(scene, startNode, team = 'player', stackSize = 5, composition = null) {
    super(scene, startNode.x, startNode.y);

    this.team        = team;
    this.currentNode = startNode.id;
    this.targetNode  = null;
    this.path        = [];
    this.speed       = 90;
    this.isSelected  = false;
    this.isMoving    = false;
    this._dead       = false;
    this.inCombat    = false;   // locked during active battle
    this.unitHP      = null;    // populated by CombatManager.syncUnitHP()

    // Composition — default to all fighters if not specified
    this.composition = composition || { ...emptyComposition(), fighter: stackSize };
    this.stackSize   = compositionTotal(this.composition);

    // Team colours — matches GameScene.PLAYER_COLORS palette
    const TEAM_COLORS = [
      0x44aaff, // player   (index 0) — blue
      0xff4455, // player2  (index 1) — red
      0x44ff88, // player3  — green
      0xffcc22, // player4  — yellow
      0xff88cc, // player5  — pink
      0xcc66ff, // player6  — purple
      0xff8844, // player7  — orange
      0x22ddcc, // player8  — teal
    ];
    const TEAM_COLORS_HEX = [
      '#44aaff','#ff4455','#44ff88','#ffcc22','#ff88cc','#cc66ff','#ff8844','#22ddcc',
    ];
    const NEUTRAL_COLOR     = 0x888899;
    const NEUTRAL_COLOR_HEX = '#888899';
    let colorIdx = 0;
    if (team === 'neutral') {
      this.teamColor    = NEUTRAL_COLOR;
      this.teamColorHex = NEUTRAL_COLOR_HEX;
    } else {
      colorIdx = team === 'player' ? 0 : (parseInt(team.replace('player', '')) - 1) || 0;
      this.teamColor    = TEAM_COLORS[colorIdx]     || NEUTRAL_COLOR;
      this.teamColorHex = TEAM_COLORS_HEX[colorIdx] || NEUTRAL_COLOR_HEX;
    }

    const BADGE_Y = -28;
    this._badgeY  = BADGE_Y;

    // Badge background graphics
    this.badgeBg = scene.add.graphics();
    this.add(this.badgeBg);

    // Ship icon graphics (drawn inside badge)
    this.badgeIcon = scene.add.graphics();
    this.add(this.badgeIcon);

    // Unit count text
    this.badge = scene.add.text(0, BADGE_Y, String(this.stackSize), {
      font:  'bold 10px monospace',
      color: '#000000',
    }).setOrigin(0.5, 0.5);
    this.add(this.badge);

    // Selection ring
    this.ring = scene.add.graphics();
    this.ring.lineStyle(2, 0xffffff, 0.9);
    this.ring.strokeCircle(0, 0, 22);
    this.ring.setVisible(false);
    this.add(this.ring);

    // Health bar — shown during combat, drawn below badge
    this.healthBarGfx = scene.add.graphics();
    this.add(this.healthBarGfx);

    this._drawBadge();

    scene.add.existing(this);
    this.setDepth(10);
  }

  _drawBadge() {
    const BADGE_H = 18;
    const BADGE_Y = this._badgeY;
    const type    = dominantType(this.composition);
    const count   = this.stackSize;
    const countStr = String(count);

    // Width: icon area (16px) + count text + padding
    const textW  = Math.max(12, countStr.length * 7);
    const BADGE_W = 16 + textW + 10;

    this.badgeBg.clear();
    this.badgeBg.fillStyle(this.teamColor, 1);
    this.badgeBg.fillRoundedRect(-BADGE_W / 2, BADGE_Y - BADGE_H / 2, BADGE_W, BADGE_H, 3);
    this.badgeBg.fillTriangle(-4, BADGE_Y + BADGE_H / 2, 4, BADGE_Y + BADGE_H / 2, 0, BADGE_Y + BADGE_H / 2 + 5);

    // Ship icon — left side of badge
    this.badgeIcon.clear();
    drawShipIcon(this.badgeIcon, type, -BADGE_W / 2 + 9, BADGE_Y, 0x000000);

    // Count text — right side
    this.badge.setText(countStr);
    this.badge.setPosition(BADGE_W / 2 - textW / 2 - 2, BADGE_Y);

    this._badgeW = BADGE_W;
    this._badgeH = BADGE_H;
  }

  updateBadge() {
    this.stackSize = compositionTotal(this.composition);
    this._drawBadge();
  }

  setSelected(val) {
    this.isSelected = val;
    this.ring.setVisible(val);
  }

  // Show or hide the standard badge (hidden during combat, overlay takes over)
  setBadgeVisible(visible) {
    this.badgeBg.setVisible(visible);
    this.badgeIcon.setVisible(visible);
    this.badge.setVisible(visible);
  }

  // ── Health bar (shown during combat) ─────────────────────────────────────
  updateHealthBar() {
    const g = this.healthBarGfx;
    g.clear();
    if (!this.unitHP) return;

    const SHIP_ORDER = ['fighter','destroyer','cruiser','dreadnaught','flagship'];
    const MAX_HP     = { fighter: 10, destroyer: 20, cruiser: 20, dreadnaught: 50, flagship: 60 };
    const COL        = {
      fighter: 0x44aaff, destroyer: 0xaa66ff, cruiser: 0x44ddaa,
      dreadnaught: 0xff8844, flagship: 0xffdd44,
    };
    const BAR_W = 38, BAR_H = 3, GAP = 2;

    const types = SHIP_ORDER.filter(t => (this.unitHP[t]?.length || 0) > 0);
    if (!types.length) return;

    let dy = this._badgeY + (this._badgeH || 18) / 2 + 5;

    for (const type of types) {
      const hps      = this.unitHP[type];
      const maxTotal = hps.length * MAX_HP[type];
      const curTotal = hps.reduce((s, h) => s + h, 0);
      const pct      = maxTotal > 0 ? Math.max(0, curTotal / maxTotal) : 0;
      const col      = COL[type] || 0xffffff;

      g.fillStyle(0x000000, 0.65);
      g.fillRect(-BAR_W / 2, dy, BAR_W, BAR_H);
      g.fillStyle(col, 0.95);
      g.fillRect(-BAR_W / 2, dy, Math.round(BAR_W * pct), BAR_H);
      g.lineStyle(0.5, col, 0.4);
      g.strokeRect(-BAR_W / 2, dy, BAR_W, BAR_H);

      dy += BAR_H + GAP;
    }
  }

  clearHealthBar() {
    this.healthBarGfx?.clear();
  }

  assignPath(nodeIds) {
    if (!nodeIds || nodeIds.length < 2) return;
    this.path = nodeIds.slice(1);
    this._advanceToNextNode();
  }

  update(nodeMap, delta) {
    if (this._dead || this.inCombat || !this.isMoving || !this.targetNode) return;

    const target = nodeMap.get(this.targetNode);
    if (!target) return;

    const dx   = target.x - this.x;
    const dy   = target.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = (this.speed * delta) / 1000;

    if (dist <= step) {
      this.x           = target.x;
      this.y           = target.y;
      this.currentNode = this.targetNode;
      this.targetNode  = null;
      this.isMoving    = false;

      this.scene.events.emit('unitArrivedAtNode', this, this.currentNode);
      // Guard: handleArrival may have destroyed this unit synchronously.
      // _dead is set immediately by removeStack — do not trust Phaser's .active
      if (this.path.length > 0 && !this._dead) {
        this._advanceToNextNode();
      }
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  _advanceToNextNode() {
    this.targetNode = this.path.shift();
    this.isMoving   = true;
  }
}
