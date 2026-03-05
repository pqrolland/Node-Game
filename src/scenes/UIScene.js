export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
    this.eventLog = [];
  }

  create() {
    const { width, height } = this.scale;

    // Bottom bar background
    this.add.rectangle(0, height - 80, width, 80, 0x080f08, 0.95).setOrigin(0, 0);
    this.add.rectangle(0, height - 82, width, 2, 0x44ff88, 0.4).setOrigin(0, 0);

    // Stack info panel (left)
    this.stackLabel = this.add.text(16, height - 66, 'No stack selected', {
      font: '13px monospace', color: '#44ff88'
    });
    this.stackDetail = this.add.text(16, height - 46, '', {
      font: '11px monospace', color: '#7aaa8a'
    });

    // Controls hint (centre)
    this.add.text(width / 2, height - 56,
      'Click friendly stack to select  ·  Click destination to move  ·  Click same node to open panel  ·  ESC to deselect',
      { font: '11px monospace', color: '#446644' }
    ).setOrigin(0.5, 0);
    this.add.text(width / 2, height - 38,
      'WASD / Arrows: scroll  ·  Scroll wheel: zoom',
      { font: '11px monospace', color: '#2a4a2a' }
    ).setOrigin(0.5, 0);

    // Event log (right)
    this.logTexts = [];
    for (let i = 0; i < 3; i++) {
      this.logTexts.push(
        this.add.text(width - 16, height - 74 + i * 18, '', {
          font: '11px monospace', color: '#558855'
        }).setOrigin(1, 0)
      );
    }

    // Legend (top-left)
    this._drawLegend();
  }

  _drawLegend() {
    const types = [
      { color: '#8844aa', label: 'Fort' },
      { color: '#4488ff', label: 'Town' },
      { color: '#447744', label: 'Junction' },
      { color: '#ffaa22', label: 'Resource' },
    ];
    this.add.rectangle(8, 8, 120, types.length * 20 + 12, 0x080f08, 0.7).setOrigin(0, 0);
    types.forEach((t, i) => {
      this.add.circle(20, 18 + i * 20, 5, parseInt(t.color.replace('#',''), 16));
      this.add.text(30, 13 + i * 20, t.label, { font: '11px monospace', color: '#66aa77' });
    });
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
