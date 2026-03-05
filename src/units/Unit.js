/**
 * Unit.js — A stack of units that travels node-to-node along graph edges.
 *
 * Visual changes:
 *  - Unit body circle is removed — ownership is shown on the planet itself
 *  - Stack badge floats ABOVE the node in a coloured rectangle (player colour)
 *  - Badge moves with the unit while travelling between nodes
 */
export default class Unit extends Phaser.GameObjects.Container {

  constructor(scene, startNode, team = 'player', stackSize = 5) {
    super(scene, startNode.x, startNode.y);

    this.team        = team;
    this.stackSize   = stackSize;
    this.currentNode = startNode.id;
    this.targetNode  = null;
    this.path        = [];
    this.speed       = 90;
    this.isSelected  = false;
    this.isMoving    = false;

    // Team colours
    this.teamColor     = team === 'player' ? 0x44aaff : 0xff4455;
    this.teamColorHex  = team === 'player' ? '#44aaff' : '#ff4455';

    // ── Badge: coloured rectangle + black unit count, floats above node ───
    const BADGE_W = 28, BADGE_H = 16, BADGE_Y = -28;

    this.badgeBg = scene.add.graphics();
    this._drawBadgeBg(BADGE_W, BADGE_H, BADGE_Y);
    this.add(this.badgeBg);

    this.badge = scene.add.text(0, BADGE_Y, String(stackSize), {
      font:  'bold 11px monospace',
      color: '#000000',
    }).setOrigin(0.5, 0.5);
    this.add(this.badge);

    // Store badge dimensions for redraw
    this._badgeW = BADGE_W;
    this._badgeH = BADGE_H;
    this._badgeY = BADGE_Y;

    // ── Selection ring (white, around where the node is) ──────────────────
    this.ring = scene.add.graphics();
    this.ring.lineStyle(2, 0xffffff, 0.9);
    this.ring.strokeCircle(0, 0, 22);
    this.ring.setVisible(false);
    this.add(this.ring);

    scene.add.existing(this);
    this.setDepth(10);
  }

  _drawBadgeBg(w, h, y) {
    this.badgeBg.clear();
    this.badgeBg.fillStyle(this.teamColor, 1);
    this.badgeBg.fillRoundedRect(-w / 2, y - h / 2, w, h, 3);
    // Small pointer triangle pointing down toward the node
    this.badgeBg.fillTriangle(-4, y + h / 2, 4, y + h / 2, 0, y + h / 2 + 5);
  }

  assignPath(nodeIds) {
    if (!nodeIds || nodeIds.length < 2) return;
    this.path = nodeIds.slice(1);
    this._advanceToNextNode();
  }

  setSelected(val) {
    this.isSelected = val;
    this.ring.setVisible(val);
  }

  updateBadge() {
    this.badge.setText(String(this.stackSize));
    // Widen badge if number grows
    const newW = Math.max(28, this.badge.width + 10);
    if (newW !== this._badgeW) {
      this._badgeW = newW;
      this._drawBadgeBg(this._badgeW, this._badgeH, this._badgeY);
    }
  }

  update(nodeMap, delta) {
    if (!this.isMoving || !this.targetNode) return;

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
      if (this.path.length > 0) this._advanceToNextNode();
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
