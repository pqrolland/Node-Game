/**
 * Unit.js — A stack of units that travels node-to-node along graph edges.
 *
 * Key behaviours:
 *  - Sits on a node at rest
 *  - Given a path (array of nodeIds), travels each edge in sequence
 *  - Smooth real-time glide between nodes
 *  - Friendly stacks can share a node; enemy stacks trigger combat on arrival
 *  - Visually shows unit count badge and selection ring
 */
export default class Unit extends Phaser.GameObjects.Container {

  /**
   * @param {Phaser.Scene} scene
   * @param {object}       startNode  - node object { id, x, y }
   * @param {string}       team       - 'player' | 'enemy'
   * @param {number}       stackSize  - number of units in this stack
   */
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

    const bodyColor   = team === 'player' ? 0x44ff88 : 0xff4455;
    const borderColor = team === 'player' ? 0x22aa55 : 0xaa2233;

    // Body
    this.bodyGfx = scene.add.graphics();
    this.bodyGfx.fillStyle(bodyColor, 1);
    this.bodyGfx.fillCircle(0, 0, 16);
    this.bodyGfx.lineStyle(2, borderColor, 1);
    this.bodyGfx.strokeCircle(0, 0, 16);
    this.add(this.bodyGfx);

    // Stack-size badge
    this.badge = scene.add.text(0, 0, String(stackSize), {
      font: 'bold 12px monospace',
      color: team === 'player' ? '#003311' : '#330011',
    }).setOrigin(0.5, 0.5);
    this.add(this.badge);

    // Selection ring
    this.ring = scene.add.graphics();
    this.ring.lineStyle(2, 0xffffff, 0.9);
    this.ring.strokeCircle(0, 0, 22);
    this.ring.setVisible(false);
    this.add(this.ring);

    scene.add.existing(this);
    this.setDepth(10);
  }

  /** Assign a full path (array of nodeIds). Unit starts moving immediately. */
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
  }

  /**
   * Call from scene's update(). Moves unit along current edge.
   * @param {Map} nodeMap - Map<id, {x,y}>
   * @param {number} delta - ms since last frame
   */
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

      // Notify scene — handles combat / arrival logic
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
