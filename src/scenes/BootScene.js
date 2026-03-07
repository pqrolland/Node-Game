export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Loading bar UI
    const { width, height } = this.scale;
    const bar = this.add.graphics();
    const box = this.add.graphics();

    box.strokeRect(width / 2 - 160, height / 2 - 20, 320, 40);

    this.load.on('progress', (value) => {
      bar.clear();
      bar.fillStyle(0x44ff88, 1);
      bar.fillRect(width / 2 - 158, height / 2 - 18, 316 * value, 36);
    });

    // ─── Preload your assets here as the game grows ───────────────────────
    // this.load.image('tileset', 'assets/maps/tileset.png');
    // this.load.tilemapTiledJSON('map1', 'assets/maps/map1.json');
    // this.load.spritesheet('unit-soldier', 'assets/sprites/soldier.png', { frameWidth: 32, frameHeight: 32 });
    // ──────────────────────────────────────────────────────────────────────
  }

  create() {
    this.scene.start('MainMenuScene');
  }
}
