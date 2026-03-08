/**
 * MainMenuScene.js
 * Main menu — starfield, title, and four nav buttons:
 *   PLAY        → player-count options panel
 *   HOW TO PLAY → in-scene How to Play overlay
 *   SETTINGS    → greyed out, "Coming Soon" on hover
 *   ACHIEVEMENTS→ greyed out, "Coming Soon" on hover
 */

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create() {
    const { width, height } = this.scale;
    this._playerCount = 1;

    this._drawBackground(width, height);
    this._drawTitle(width, height);
    this._buildNavButtons(width, height);
    this._buildOptionsPanel(width, height);
    this._buildHowToPlay(width, height);
  }

  // ── Background ──────────────────────────────────────────────────────────────
  _drawBackground(width, height) {
    const bg = this.add.graphics();
    bg.fillStyle(0x080c14, 1);
    bg.fillRect(0, 0, width, height);
    bg.lineStyle(1, 0x1a2a44, 0.18);
    for (let x = 0; x < width;  x += 40) bg.lineBetween(x, 0, x, height);
    for (let y = 0; y < height; y += 40) bg.lineBetween(0, y, width, y);

    const starGfx = this.add.graphics();
    for (let i = 0; i < 320; i++) {
      const sx = Math.floor(Math.random() * width);
      const sy = Math.floor(Math.random() * height);
      const b  = Math.random();
      const c  = b > 0.8 ? 0xffffff : b > 0.5 ? 0xaabbdd : 0x445566;
      starGfx.fillStyle(c, b * 0.8 + 0.2);
      starGfx.fillRect(sx, sy, 1, 1);
    }

    const nebulaGfx = this.add.graphics();
    [
      { x: width * 0.2,  y: height * 0.3, r: 160, color: 0x1a2a6e, a: 0.13 },
      { x: width * 0.8,  y: height * 0.7, r: 180, color: 0x2a1a5e, a: 0.10 },
      { x: width * 0.55, y: height * 0.2, r: 120, color: 0x0e3a4a, a: 0.12 },
    ].forEach(b => { nebulaGfx.fillStyle(b.color, b.a); nebulaGfx.fillCircle(b.x, b.y, b.r); });
  }

  // ── Title ───────────────────────────────────────────────────────────────────
  _drawTitle(width, height) {
    this.add.text(width / 2, height * 0.20, 'NODE GAME', {
      fontFamily: 'monospace', fontSize: '52px', fontStyle: 'bold',
      color: '#44aaff', stroke: '#0a1a33', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(2);

    this.add.text(width / 2, height * 0.20 + 56, 'SPACE STRATEGY', {
      fontFamily: 'monospace', fontSize: '16px', color: '#2a5a88', letterSpacing: 8,
    }).setOrigin(0.5).setDepth(2);

    const rule = this.add.graphics().setDepth(2);
    rule.lineStyle(1, 0x2255aa, 0.5);
    rule.lineBetween(width / 2 - 140, height * 0.20 + 80, width / 2 + 140, height * 0.20 + 80);
  }

  // ── Nav buttons (PLAY / HOW TO PLAY / SETTINGS / ACHIEVEMENTS) ─────────────
  _buildNavButtons(width, height) {
    const CX  = width / 2 - 160;
    const TOP = height * 0.48;
    const GAP = 56;

    this._playBtn = this._makeBtn(CX, TOP,          'PLAY',         160, 44, () => this._onPlay());
    this._htpBtn  = this._makeBtn(CX, TOP + GAP,    'HOW TO PLAY',  160, 44, () => this._onHowToPlay());
    this._makeGhostedBtn(CX, TOP + GAP * 2, 'SETTINGS',     160, 44);
    this._makeGhostedBtn(CX, TOP + GAP * 3, 'ACHIEVEMENTS', 160, 44);

    this.add.text(CX, TOP + GAP * 3 + 58, 'Build your fleet.', {
      fontFamily: 'monospace', fontSize: '11px', color: '#2a4a6a',
    }).setOrigin(0.5).setDepth(2);
    this.add.text(CX, TOP + GAP * 3 + 74, 'Capture the galaxy.', {
      fontFamily: 'monospace', fontSize: '11px', color: '#2a4a6a',
    }).setOrigin(0.5).setDepth(2);
  }

  // ── Options panel (player count + Start) ────────────────────────────────────
  _buildOptionsPanel(width, height) {
    this._optionsContainer = this.add.container(0, 0).setVisible(false).setDepth(3);
    const PX = width / 2 + 40;
    const PY = height / 2 - 90;
    const c  = this._optionsContainer;

    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0a1420, 0.9);
    panelBg.fillRoundedRect(PX - 20, PY - 16, 300, 260, 6);
    panelBg.lineStyle(1, 0x2255aa, 0.6);
    panelBg.strokeRoundedRect(PX - 20, PY - 16, 300, 260, 6);
    c.add(panelBg);

    c.add(this.add.text(PX + 130, PY + 4, 'NUMBER OF PLAYERS', {
      fontFamily: 'monospace', fontSize: '11px', color: '#44aaff', letterSpacing: 2,
    }).setOrigin(0.5, 0));

    const div = this.add.graphics();
    div.lineStyle(1, 0x1a2a44, 1);
    div.lineBetween(PX - 8, PY + 24, PX + 268, PY + 24);
    c.add(div);

    this._countBtns = [];
    const COLS = 4, BW = 54, BH = 34, GAP = 10;
    const gridX = PX + 6, gridY = PY + 38;

    for (let i = 0; i < 8; i++) {
      const col = i % COLS, row = Math.floor(i / COLS);
      const bx = gridX + col * (BW + GAP);
      const by = gridY + row * (BH + GAP);
      const n  = i + 1;

      const btnBg = this.add.graphics();
      const lbl = this.add.text(bx + BW / 2, by + BH / 2, String(n), {
        fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold',
        color: n === 1 ? '#44aaff' : '#446688',
      }).setOrigin(0.5);

      this._drawCountBtn(btnBg, bx, by, BW, BH, n === 1);

      const zone = this.add.rectangle(bx + BW/2, by + BH/2, BW, BH, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this._selectCount(n));
      zone.on('pointerover', () => { if (this._playerCount !== n) { btnBg.clear(); this._drawCountBtn(btnBg, bx, by, BW, BH, false, true); } });
      zone.on('pointerout',  () => { btnBg.clear(); this._drawCountBtn(btnBg, bx, by, BW, BH, this._playerCount === n); });

      c.add(btnBg); c.add(lbl); c.add(zone);
      this._countBtns.push({ bg: btnBg, lbl, bx, by, BW, BH, n });
    }

    this._planetInfoText = this.add.text(PX + 130, PY + 148, this._planetInfoStr(), {
      fontFamily: 'monospace', fontSize: '10px', color: '#446688', align: 'center',
    }).setOrigin(0.5, 0);
    c.add(this._planetInfoText);

    const startX = PX + 130, startY = PY + 188;
    const startBg = this.add.graphics();
    const drawStartIdle  = () => { startBg.clear(); startBg.fillStyle(0x0d2244, 1); startBg.fillRoundedRect(startX - 80, startY - 18, 160, 38, 4); startBg.lineStyle(2, 0x44aaff, 0.9); startBg.strokeRoundedRect(startX - 80, startY - 18, 160, 38, 4); };
    const drawStartHover = () => { startBg.clear(); startBg.fillStyle(0x1a3a6a, 1); startBg.fillRoundedRect(startX - 80, startY - 18, 160, 38, 4); startBg.lineStyle(2, 0x88ccff, 1); startBg.strokeRoundedRect(startX - 80, startY - 18, 160, 38, 4); };
    drawStartIdle();
    c.add(startBg);
    c.add(this.add.text(startX, startY, 'START GAME', { fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#44aaff' }).setOrigin(0.5));

    const startZone = this.add.rectangle(startX, startY, 160, 38, 0xffffff, 0).setInteractive({ useHandCursor: true });
    startZone.on('pointerover',  drawStartHover);
    startZone.on('pointerout',   drawStartIdle);
    startZone.on('pointerdown',  () => this._startGame());
    c.add(startZone);

    // Back button
    const backX = PX + 130, backY = PY + 236;
    const backLbl = this.add.text(backX, backY, '← back', {
      fontFamily: 'monospace', fontSize: '11px', color: '#334466',
    }).setOrigin(0.5);
    const backZone = this.add.rectangle(backX, backY, 100, 20, 0xffffff, 0).setInteractive({ useHandCursor: true });
    backZone.on('pointerover',  () => backLbl.setColor('#7799bb'));
    backZone.on('pointerout',   () => backLbl.setColor('#334466'));
    backZone.on('pointerdown',  () => this._closeOverlay());
    c.add(backLbl); c.add(backZone);
  }

  // ── How to Play overlay ─────────────────────────────────────────────────────
  _buildHowToPlay(width, height) {
    this._htpContainer = this.add.container(0, 0).setVisible(false).setDepth(3);
    const c = this._htpContainer;

    // Full-screen dim
    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.72);
    dim.fillRect(0, 0, width, height);
    c.add(dim);

    // Panel
    const PW = 680, PH = 440;
    const PX = (width  - PW) / 2;
    const PY = (height - PH) / 2;

    const panel = this.add.graphics();
    panel.fillStyle(0x060d18, 0.98);
    panel.fillRoundedRect(PX, PY, PW, PH, 8);
    panel.lineStyle(1, 0x2255aa, 0.8);
    panel.strokeRoundedRect(PX, PY, PW, PH, 8);
    panel.lineStyle(3, 0x44aaff, 0.25);
    panel.strokeRoundedRect(PX + 3, PY + 3, PW - 6, PH - 6, 6);
    c.add(panel);

    // Title
    c.add(this.add.text(PX + PW / 2, PY + 22, 'HOW TO PLAY', {
      fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold',
      color: '#44aaff', letterSpacing: 4,
    }).setOrigin(0.5, 0));

    // Divider
    const div = this.add.graphics();
    div.lineStyle(1, 0x1a3a5a, 1);
    div.lineBetween(PX + 24, PY + 52, PX + PW - 24, PY + 52);
    c.add(div);

    // ── Two-column layout ────────────────────────────────────────────────────
    const COL1 = PX + 28;
    const COL2 = PX + PW / 2 + 10;
    const ROW1 = PY + 64;
    const SH   = 14;   // line height for body text
    const HEAD = { fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold', color: '#44aaff', letterSpacing: 2 };
    const BODY = { fontFamily: 'monospace', fontSize: '10px', color: '#7a9aba' };
    const HINT = { fontFamily: 'monospace', fontSize: '10px', color: '#446688' };

    const add = (x, y, txt, style) => { c.add(this.add.text(x, y, txt, style)); return y + SH; };
    const head = (x, y, txt) => { c.add(this.add.text(x, y, txt, HEAD)); return y + SH + 4; };

    // ── Column 1: Objective + Controls ──────────────────────────────────────
    let y1 = ROW1;
    y1 = head(COL1, y1, '⬡  OBJECTIVE');
    y1 = add(COL1, y1, 'Capture planets to expand your empire.', BODY);
    y1 = add(COL1, y1, 'Destroy enemy flagships to eliminate', BODY);
    y1 = add(COL1, y1, 'opponents. Be the last fleet standing.', BODY);
    y1 += 10;

    y1 = head(COL1, y1, '⬡  MOVING FLEETS');
    y1 = add(COL1, y1, 'Click a planet with your fleet to select it.', BODY);
    y1 = add(COL1, y1, 'Click a destination to move along the', BODY);
    y1 = add(COL1, y1, 'shortest path. Hover to preview the route.', BODY);
    y1 += 10;

    y1 = head(COL1, y1, '⬡  SPLITTING FLEETS');
    y1 = add(COL1, y1, 'Open the Node Panel (click your own planet)', BODY);
    y1 = add(COL1, y1, 'to split ships by type using the − / +', BODY);
    y1 = add(COL1, y1, 'controls, then send them to a new target.', BODY);
    y1 += 10;

    y1 = head(COL1, y1, '⬡  RESOURCES');
    y1 = add(COL1, y1, 'Food, Metal, and Fuel tick every 3 seconds', BODY);
    y1 = add(COL1, y1, 'from owned planets. Build structures to', BODY);
    y1 = add(COL1, y1, 'increase income and produce ships faster.', BODY);

    // ── Column 2: Combat + Ships ─────────────────────────────────────────────
    let y2 = ROW1;
    y2 = head(COL2, y2, '⬡  COMBAT');
    y2 = add(COL2, y2, '1. Destroyer pre-strike kills 2 enemy', BODY);
    y2 = add(COL2, y2, '   fighters before combat begins.', BODY);
    y2 = add(COL2, y2, '2. Both sides deal damage simultaneously.', BODY);
    y2 = add(COL2, y2, '   Losses hit lowest-tier ships first.', BODY);
    y2 = add(COL2, y2, '3. Destroyed cruisers have a 50% chance', BODY);
    y2 = add(COL2, y2, '   to repair and return to the stack.', BODY);
    y2 += 10;

    y2 = head(COL2, y2, '⬡  SHIP TYPES');
    const ships = [
      ['Fighter',     '1 / 1',  'Cheap — first to die'],
      ['Destroyer',   '1 / 1',  'Pre-strike: kills 2 fighters'],
      ['Cruiser',     '1 / 1',  '50% repair on death'],
      ['Dreadnaught', '4 / 4',  'Counts as 4 units'],
      ['Flagship',    '1 / 1',  'Lose it = instant defeat'],
    ];
    ships.forEach(([name, stats, note]) => {
      const nameT = this.add.text(COL2,      y2, name,  { fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#aaccff' });
      const statsT= this.add.text(COL2 + 90, y2, stats, HINT);
      const noteT = this.add.text(COL2 + 130,y2, note,  HINT);
      c.add(nameT); c.add(statsT); c.add(noteT);
      y2 += SH;
    });
    y2 += 6;

    y2 = head(COL2, y2, '⬡  TIP');
    y2 = add(COL2, y2, 'Hover any ship name in the unit manager', BODY);
    y2 = add(COL2, y2, 'or build menu for a full stat card.', BODY);

    // ── Close / Play buttons ─────────────────────────────────────────────────
    const btnY = PY + PH - 30;

    // Back to menu
    const backLbl = this.add.text(PX + 80, btnY, '← BACK TO MENU', {
      fontFamily: 'monospace', fontSize: '11px', color: '#334466',
    }).setOrigin(0.5);
    const backZone = this.add.rectangle(PX + 80, btnY, 160, 22, 0xffffff, 0).setInteractive({ useHandCursor: true });
    backZone.on('pointerover',  () => backLbl.setColor('#7799bb'));
    backZone.on('pointerout',   () => backLbl.setColor('#334466'));
    backZone.on('pointerdown',  () => this._closeOverlay());
    c.add(backLbl); c.add(backZone);

    // Play now shortcut
    const playBg = this.add.graphics();
    const drawPlayIdle  = () => { playBg.clear(); playBg.fillStyle(0x0d2244,1); playBg.fillRoundedRect(PX+PW-170, btnY-14, 150, 28, 4); playBg.lineStyle(2, 0x44aaff, 0.9); playBg.strokeRoundedRect(PX+PW-170, btnY-14, 150, 28, 4); };
    const drawPlayHover = () => { playBg.clear(); playBg.fillStyle(0x1a3a6a,1); playBg.fillRoundedRect(PX+PW-170, btnY-14, 150, 28, 4); playBg.lineStyle(2, 0x88ccff, 1); playBg.strokeRoundedRect(PX+PW-170, btnY-14, 150, 28, 4); };
    drawPlayIdle();
    const playLbl  = this.add.text(PX+PW-95, btnY, 'PLAY NOW  →', { fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#44aaff' }).setOrigin(0.5);
    const playZone = this.add.rectangle(PX+PW-95, btnY, 150, 28, 0xffffff, 0).setInteractive({ useHandCursor: true });
    playZone.on('pointerover',  drawPlayHover);
    playZone.on('pointerout',   drawPlayIdle);
    playZone.on('pointerdown',  () => { this._closeOverlay(); this._onPlay(); });
    c.add(playBg); c.add(playLbl); c.add(playZone);
  }

  // ── Greyed-out "coming soon" button ─────────────────────────────────────────
  _makeGhostedBtn(cx, cy, label, w, h) {
    const bg = this.add.graphics().setDepth(2);
    bg.fillStyle(0x080e18, 1);
    bg.fillRoundedRect(cx - w/2, cy - h/2, w, h, 5);
    bg.lineStyle(1, 0x1a2a3a, 0.7);
    bg.strokeRoundedRect(cx - w/2, cy - h/2, w, h, 5);

    this.add.text(cx, cy, label, {
      fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold',
      color: '#223344', letterSpacing: 2,
    }).setOrigin(0.5).setDepth(2);

    // "Coming soon" tooltip label (hidden by default)
    const tip = this.add.text(cx, cy - h/2 - 14, 'COMING SOON', {
      fontFamily: 'monospace', fontSize: '9px', color: '#334455', letterSpacing: 2,
    }).setOrigin(0.5).setDepth(4).setVisible(false);

    const tipBg = this.add.graphics().setDepth(3).setVisible(false);
    tipBg.fillStyle(0x0a1420, 0.9);
    tipBg.fillRoundedRect(cx - 54, cy - h/2 - 24, 108, 18, 3);
    tipBg.lineStyle(1, 0x1a2a3a, 1);
    tipBg.strokeRoundedRect(cx - 54, cy - h/2 - 24, 108, 18, 3);

    const zone = this.add.rectangle(cx, cy, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: false }).setDepth(2);
    zone.on('pointerover',  () => { tipBg.setVisible(true); tip.setVisible(true); });
    zone.on('pointerout',   () => { tipBg.setVisible(false); tip.setVisible(false); });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  _closeOverlay() {
    this._optionsContainer.setVisible(false);
    this._htpContainer.setVisible(false);
    this._playBtn.setVisible(true);
    this._htpBtn.setVisible(true);
  }

  _onPlay() {
    this._playBtn.setVisible(false);
    this._htpBtn.setVisible(false);
    this._optionsContainer.setVisible(false);
    this._htpContainer.setVisible(false);
    this._optionsContainer.setAlpha(0);
    this._optionsContainer.setVisible(true);
    this.tweens.add({ targets: this._optionsContainer, alpha: 1, duration: 200, ease: 'Linear' });
  }

  _onHowToPlay() {
    this._htpContainer.setAlpha(0);
    this._htpContainer.setVisible(true);
    this.tweens.add({ targets: this._htpContainer, alpha: 1, duration: 200, ease: 'Linear' });
  }

  _startGame() {
    this.cameras.main.fadeOut(300, 8, 12, 20, (_cam, progress) => {
      if (progress === 1) this.scene.start('GameScene', { playerCount: this._playerCount });
    });
  }

  _drawCountBtn(gfx, x, y, w, h, selected, hover = false) {
    if (selected) {
      gfx.fillStyle(0x0d2244, 1); gfx.fillRoundedRect(x, y, w, h, 4);
      gfx.lineStyle(2, 0x44aaff, 1); gfx.strokeRoundedRect(x, y, w, h, 4);
    } else if (hover) {
      gfx.fillStyle(0x0a1a2e, 1); gfx.fillRoundedRect(x, y, w, h, 4);
      gfx.lineStyle(1, 0x2255aa, 0.8); gfx.strokeRoundedRect(x, y, w, h, 4);
    } else {
      gfx.fillStyle(0x060e1a, 1); gfx.fillRoundedRect(x, y, w, h, 4);
      gfx.lineStyle(1, 0x1a2a44, 0.6); gfx.strokeRoundedRect(x, y, w, h, 4);
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
    const p = this._playerCount, total = 10 + p * 10;
    return `${total} planets  ·  ${p * 2} player  ·  ${total - p * 2} neutral`;
  }

  _makeBtn(cx, cy, label, w, h, onClick) {
    const bg = this.add.graphics().setDepth(2);
    const drawIdle  = () => { bg.clear(); bg.fillStyle(0x0d2244,1); bg.fillRoundedRect(cx-w/2,cy-h/2,w,h,5); bg.lineStyle(2,0x44aaff,0.8); bg.strokeRoundedRect(cx-w/2,cy-h/2,w,h,5); };
    const drawHover = () => { bg.clear(); bg.fillStyle(0x1a3a6a,1); bg.fillRoundedRect(cx-w/2,cy-h/2,w,h,5); bg.lineStyle(2,0x88ccff,1); bg.strokeRoundedRect(cx-w/2,cy-h/2,w,h,5); };
    drawIdle();
    const lbl  = this.add.text(cx, cy, label, { fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#44aaff', letterSpacing: 3 }).setOrigin(0.5).setDepth(2);
    const zone = this.add.rectangle(cx, cy, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true }).setDepth(2);
    zone.on('pointerover',  drawHover);
    zone.on('pointerout',   drawIdle);
    zone.on('pointerdown',  onClick);
    return this.add.container(0, 0, [bg, lbl, zone]).setDepth(2);
  }
}
