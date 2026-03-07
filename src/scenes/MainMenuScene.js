/**
 * MainMenuScene.js
 * Main menu — starfield background, title, Play button.
 * On Play: player-count selector slides in, then Start launches GameScene.
 *
 * Passes config to GameScene via this.scene.start('GameScene', { playerCount })
 */

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create() {
    const { width, height } = this.scale;
    this._playerCount = 1;

    // ── Starfield background (same as GameScene.drawMap) ────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(0x080c14, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle grid lines
    bg.lineStyle(1, 0x1a2a44, 0.18);
    for (let x = 0; x < width; x += 40)  { bg.lineBetween(x, 0, x, height); }
    for (let y = 0; y < height; y += 40) { bg.lineBetween(0, y, width, y); }

    // Stars
    const starGfx = this.add.graphics();
    for (let i = 0; i < 320; i++) {
      const sx = Math.floor(Math.random() * width);
      const sy = Math.floor(Math.random() * height);
      const b  = Math.random();
      const c  = b > 0.8 ? 0xffffff : b > 0.5 ? 0xaabbdd : 0x445566;
      starGfx.fillStyle(c, b * 0.8 + 0.2);
      starGfx.fillRect(sx, sy, 1, 1);
    }

    // Subtle nebula blobs
    const nebulaGfx = this.add.graphics();
    const blobs = [
      { x: width * 0.2,  y: height * 0.3, r: 160, color: 0x1a2a6e, a: 0.13 },
      { x: width * 0.8,  y: height * 0.7, r: 180, color: 0x2a1a5e, a: 0.10 },
      { x: width * 0.55, y: height * 0.2, r: 120, color: 0x0e3a4a, a: 0.12 },
    ];
    blobs.forEach(b => {
      nebulaGfx.fillStyle(b.color, b.a);
      nebulaGfx.fillCircle(b.x, b.y, b.r);
    });

    // ── Title ────────────────────────────────────────────────────────────────
    this.add.text(width / 2, height * 0.22, 'NODE GAME', {
      fontFamily: 'monospace',
      fontSize:   '52px',
      fontStyle:  'bold',
      color:      '#44aaff',
      stroke:     '#0a1a33',
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(2);

    this.add.text(width / 2, height * 0.22 + 56, 'SPACE STRATEGY', {
      fontFamily: 'monospace',
      fontSize:   '16px',
      color:      '#2a5a88',
      letterSpacing: 8,
    }).setOrigin(0.5).setDepth(2);

    // Thin horizontal rule under subtitle
    const rule = this.add.graphics().setDepth(2);
    rule.lineStyle(1, 0x2255aa, 0.5);
    rule.lineBetween(width / 2 - 140, height * 0.22 + 80, width / 2 + 140, height * 0.22 + 80);

    // ── Left panel: PLAY button ───────────────────────────────────────────────
    const CX = width / 2 - 160;
    const CY = height / 2 + 10;

    this._playBtn = this._makeBtn(CX, CY, 'PLAY', 140, 46, () => this._onPlay());

    this.add.text(CX, CY + 60, 'Build your fleet.', {
      fontFamily: 'monospace', fontSize: '11px', color: '#2a4a6a',
    }).setOrigin(0.5).setDepth(2);
    this.add.text(CX, CY + 76, 'Capture the galaxy.', {
      fontFamily: 'monospace', fontSize: '11px', color: '#2a4a6a',
    }).setOrigin(0.5).setDepth(2);

    // ── Right panel: options (hidden until Play clicked) ──────────────────────
    this._optionsContainer = this.add.container(0, 0).setVisible(false).setDepth(3);
    this._buildOptionsPanel(width, height);
  }

  // ── Options panel (player count + Start) ────────────────────────────────────
  _buildOptionsPanel(width, height) {
    const PX = width / 2 + 40;
    const PY = height / 2 - 90;
    const c  = this._optionsContainer;

    // Panel background
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0a1420, 0.9);
    panelBg.fillRoundedRect(PX - 20, PY - 16, 300, 260, 6);
    panelBg.lineStyle(1, 0x2255aa, 0.6);
    panelBg.strokeRoundedRect(PX - 20, PY - 16, 300, 260, 6);
    c.add(panelBg);

    c.add(this.add.text(PX + 130, PY + 4, 'NUMBER OF PLAYERS', {
      fontFamily: 'monospace', fontSize: '11px', color: '#44aaff', letterSpacing: 2,
    }).setOrigin(0.5, 0));

    // Divider
    const div = this.add.graphics();
    div.lineStyle(1, 0x1a2a44, 1);
    div.lineBetween(PX - 8, PY + 24, PX + 268, PY + 24);
    c.add(div);

    // 2×4 grid of player count buttons (1–8)
    this._countBtns = [];
    const COLS = 4, ROWS = 2;
    const BW = 54, BH = 34, GAP = 10;
    const gridX = PX + 6;
    const gridY = PY + 38;

    for (let i = 0; i < 8; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const bx  = gridX + col * (BW + GAP);
      const by  = gridY + row * (BH + GAP);
      const n   = i + 1;

      const bg = this.add.graphics();
      const lbl = this.add.text(bx + BW / 2, by + BH / 2, String(n), {
        fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold',
        color: n === 1 ? '#44aaff' : '#446688',
      }).setOrigin(0.5);

      this._drawCountBtn(bg, bx, by, BW, BH, n === 1);

      const zone = this.add.rectangle(bx + BW/2, by + BH/2, BW, BH, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this._selectCount(n));
      zone.on('pointerover', () => {
        if (this._playerCount !== n) {
          bg.clear();
          this._drawCountBtn(bg, bx, by, BW, BH, false, true);
        }
      });
      zone.on('pointerout', () => {
        bg.clear();
        this._drawCountBtn(bg, bx, by, BW, BH, this._playerCount === n);
      });

      c.add(bg);
      c.add(lbl);
      c.add(zone);
      this._countBtns.push({ bg, lbl, bx, by, BW, BH, n });
    }

    // Planet count info text
    this._planetInfoText = this.add.text(PX + 130, PY + 148, this._planetInfoStr(), {
      fontFamily: 'monospace', fontSize: '10px', color: '#446688', align: 'center',
    }).setOrigin(0.5, 0);
    c.add(this._planetInfoText);

    // ── START button ──────────────────────────────────────────────────────────
    const startX = PX + 130;
    const startY = PY + 188;

    const startBg = this.add.graphics();
    startBg.fillStyle(0x0d2244, 1);
    startBg.fillRoundedRect(startX - 80, startY - 18, 160, 38, 4);
    startBg.lineStyle(2, 0x44aaff, 0.9);
    startBg.strokeRoundedRect(startX - 80, startY - 18, 160, 38, 4);
    c.add(startBg);

    const startLbl = this.add.text(startX, startY, 'START GAME', {
      fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#44aaff',
    }).setOrigin(0.5);
    c.add(startLbl);

    const startZone = this.add.rectangle(startX, startY, 160, 38, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    startZone.on('pointerover',  () => { startBg.clear(); startBg.fillStyle(0x1a3a6a, 1); startBg.fillRoundedRect(startX - 80, startY - 18, 160, 38, 4); startBg.lineStyle(2, 0x88ccff, 1); startBg.strokeRoundedRect(startX - 80, startY - 18, 160, 38, 4); });
    startZone.on('pointerout',   () => { startBg.clear(); startBg.fillStyle(0x0d2244, 1); startBg.fillRoundedRect(startX - 80, startY - 18, 160, 38, 4); startBg.lineStyle(2, 0x44aaff, 0.9); startBg.strokeRoundedRect(startX - 80, startY - 18, 160, 38, 4); });
    startZone.on('pointerdown',  () => this._startGame());
    c.add(startZone);
  }

  _drawCountBtn(gfx, x, y, w, h, selected, hover = false) {
    if (selected) {
      gfx.fillStyle(0x0d2244, 1);
      gfx.fillRoundedRect(x, y, w, h, 4);
      gfx.lineStyle(2, 0x44aaff, 1);
      gfx.strokeRoundedRect(x, y, w, h, 4);
    } else if (hover) {
      gfx.fillStyle(0x0a1a2e, 1);
      gfx.fillRoundedRect(x, y, w, h, 4);
      gfx.lineStyle(1, 0x2255aa, 0.8);
      gfx.strokeRoundedRect(x, y, w, h, 4);
    } else {
      gfx.fillStyle(0x060e1a, 1);
      gfx.fillRoundedRect(x, y, w, h, 4);
      gfx.lineStyle(1, 0x1a2a44, 0.6);
      gfx.strokeRoundedRect(x, y, w, h, 4);
    }
  }

  _selectCount(n) {
    this._playerCount = n;
    this._countBtns.forEach(({ bg, lbl, bx, by, BW, BH, n: bn }) => {
      bg.clear();
      this._drawCountBtn(bg, bx, by, BW, BH, bn === n);
      lbl.setColor(bn === n ? '#44aaff' : '#446688');
    });
    this._planetInfoText?.setText(this._planetInfoStr());
  }

  _planetInfoStr() {
    const p = this._playerCount;
    const total = 10 + p * 10;
    return `${total} planets  ·  ${p * 2} player  ·  ${total - p * 2} neutral`;
  }

  _onPlay() {
    // Animate play button away, reveal options panel
    this._playBtn.setVisible(false);
    this._optionsContainer.setVisible(true);

    // Fade-in
    this._optionsContainer.setAlpha(0);
    this.tweens.add({
      targets: this._optionsContainer,
      alpha: 1,
      duration: 200,
      ease: 'Linear',
    });
  }

  _startGame() {
    this.cameras.main.fadeOut(300, 8, 12, 20, (_cam, progress) => {
      if (progress === 1) {
        this.scene.start('GameScene', { playerCount: this._playerCount });
      }
    });
  }

  // ── Generic button helper ───────────────────────────────────────────────────
  _makeBtn(cx, cy, label, w, h, onClick) {
    const bg = this.add.graphics().setDepth(2);
    const drawIdle = () => {
      bg.clear();
      bg.fillStyle(0x0d2244, 1);
      bg.fillRoundedRect(cx - w/2, cy - h/2, w, h, 5);
      bg.lineStyle(2, 0x44aaff, 0.8);
      bg.strokeRoundedRect(cx - w/2, cy - h/2, w, h, 5);
    };
    const drawHover = () => {
      bg.clear();
      bg.fillStyle(0x1a3a6a, 1);
      bg.fillRoundedRect(cx - w/2, cy - h/2, w, h, 5);
      bg.lineStyle(2, 0x88ccff, 1);
      bg.strokeRoundedRect(cx - w/2, cy - h/2, w, h, 5);
    };
    drawIdle();

    const lbl = this.add.text(cx, cy, label, {
      fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#44aaff',
      letterSpacing: 3,
    }).setOrigin(0.5).setDepth(2);

    const zone = this.add.rectangle(cx, cy, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true }).setDepth(2);
    zone.on('pointerover',  drawHover);
    zone.on('pointerout',   drawIdle);
    zone.on('pointerdown',  onClick);

    const container = this.add.container(0, 0, [bg, lbl, zone]).setDepth(2);
    return container;
  }
}
