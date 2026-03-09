// ══════════════════════════════════════════════════════════════════════════════
// ResearchScene — full-screen overlay, depth 90
// ══════════════════════════════════════════════════════════════════════════════
//
// POOL SYSTEM: Each tree has a POOL of 10 candidate perks.
// On game start, 6 are randomly chosen and become the active pairs for that run.
// Cost: flat 10 research points per unlock (new resource, accrues +2/tick).
// ALL perks carry tested:false → red ✕ badge shown until confirmed.
// ══════════════════════════════════════════════════════════════════════════════

// ── Icon draw functions — exact geometry from Unit.js drawShipIcon() ──────────
const SHIP_ICONS = {
  fighter: (g, cx, cy, col) => {
    g.fillStyle(col, 1); g.lineStyle(1.5, col, 1);
    g.fillTriangle(cx, cy - 10, cx - 7, cy + 7, cx + 7, cy + 7);
  },
  destroyer: (g, cx, cy, col) => {
    g.fillStyle(col, 1); g.lineStyle(1.5, col, 1);
    g.fillTriangle(cx - 10, cy + 7, cx - 1, cy - 7, cx + 1,  cy + 7);
    g.fillTriangle(cx - 1,  cy + 7, cx + 7, cy - 7, cx + 11, cy + 7);
  },
  cruiser: (g, cx, cy, col) => {
    g.fillStyle(col, 1); g.lineStyle(1.5, col, 1);
    g.fillTriangle(cx - 8, cy + 8, cx - 4, cy + 8, cx + 1, cy - 8);
    g.fillTriangle(cx - 8, cy + 8, cx - 3, cy - 8, cx + 1, cy - 8);
    g.fillTriangle(cx + 1, cy + 8, cx + 5, cy + 8, cx + 9, cy - 8);
    g.fillTriangle(cx + 1, cy + 8, cx + 5, cy - 8, cx + 9, cy - 8);
  },
  dreadnaught: (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx - 8, cy - 8, cx + 7, cy, cx - 8, cy + 8);
    g.fillStyle(col, 0.65);
    g.fillTriangle(cx - 1, cy - 8, cx + 11, cy, cx - 1, cy + 8);
  },
  flagship: (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx, cy - 11, cx - 7, cy, cx + 7, cy);
    g.fillTriangle(cx - 7, cy, cx + 7, cy, cx, cy + 11);
    g.fillStyle(0xffffff, 0.9); g.fillCircle(cx, cy, 3);
  },
  econ_buildings: (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillRect(cx - 9, cy + 1, 5, 7);
    g.fillRect(cx - 3, cy - 3, 5, 11);
    g.fillRect(cx + 3, cy - 8, 5, 16);
    g.lineStyle(1, col, 0.7);
    g.lineBetween(cx - 10, cy + 8, cx + 9, cy + 8);
  },
  econ_ships: (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx, cy - 10, cx - 7, cy, cx, cy + 10);
    g.fillTriangle(cx, cy - 10, cx + 7, cy, cx, cy + 10);
    g.fillStyle(0x080c14, 1); g.fillCircle(cx, cy, 3);
    g.fillStyle(col, 0.7); g.fillCircle(cx + 5, cy - 5, 2);
  },
  defense: (g, cx, cy, col) => {
    g.fillStyle(col, 0.2); g.fillCircle(cx, cy, 10);
    g.lineStyle(1.5, col, 0.85); g.strokeCircle(cx, cy, 10);
    g.lineStyle(1.5, col, 1);
    g.lineBetween(cx, cy - 7, cx, cy + 7);
    g.lineBetween(cx - 7, cy, cx + 7, cy);
  },
};

// ── Perk pool definitions ─────────────────────────────────────────────────────
// Each tree has a `pool` of 10 perks. 6 are randomly selected each game.
// All have tested:false → red ✕ badge shown.
// Tier is assigned based on position within the chosen 6 (pairs 1/2/3 = tier 1/2/3).

const TREE_DEFS = [
  {
    id: 'fighter', label: 'FIGHTER',
    color: 0x44aaff, hex: '#44aaff',
    icon: SHIP_ICONS.fighter,
    root: { id: 'fighter_root', name: 'Fighter Corps',
            desc: 'Base fighter doctrine — standard scramble protocols, no special rules.', tested: true },
    pool: [
      { id: 'f_01', name: 'Rapid Scramble',   desc: 'Fighters launch 30% faster from Naval Bases.' },
      { id: 'f_02', name: 'Dense Formation',  desc: 'Fighters gain +1 attack when stacked 5 or more.' },
      { id: 'f_03', name: 'Afterburner',      desc: 'Fighter movement speed increased by 25%.' },
      { id: 'f_04', name: 'Wingman Protocol', desc: 'Each fighter has a 20% chance to dodge one hit per battle.' },
      { id: 'f_05', name: 'Ace Pilots',       desc: 'Fighters deal double damage against destroyers.' },
      { id: 'f_06', name: 'Swarm Tactics',    desc: 'Fighter production rate from Naval Bases doubled.' },
      { id: 'f_07', name: 'Interceptor Role', desc: 'Fighters always strike first against incoming missiles.' },
      { id: 'f_08', name: 'Fuel Efficiency',  desc: 'Fighters cost 50% less fuel to produce.' },
      { id: 'f_09', name: 'Air Superiority',  desc: 'Fighters gain +1 attack per adjacent friendly planet.' },
      { id: 'f_10', name: 'Kamikaze Protocol',desc: 'Fighters destroyed in combat deal 1 damage to the attacker.' },
    ],
  },
  {
    id: 'destroyer', label: 'DESTROYER',
    color: 0xaa66ff, hex: '#aa66ff',
    icon: SHIP_ICONS.destroyer,
    root: { id: 'destroyer_root', name: 'Destroyer Wing',
            desc: 'Base destroyer doctrine — pre-strike kills 2 enemy fighters before combat.', tested: true },
    pool: [
      { id: 'd_01', name: 'Precision Strike',  desc: 'Pre-strike kills 3 targets instead of 2.' },
      { id: 'd_02', name: 'Reinforced Hull',   desc: 'Destroyers require 2 damage to destroy.' },
      { id: 'd_03', name: 'EMP Warhead',       desc: 'Pre-strike stuns one enemy cruiser, preventing its repair roll.' },
      { id: 'd_04', name: 'Hunter Protocol',   desc: 'Destroyers deal +2 attack against flagships.' },
      { id: 'd_05', name: 'Torpedo Spread',    desc: 'Destroyers fire two pre-strikes per battle.' },
      { id: 'd_06', name: 'Ambush Doctrine',   desc: 'Destroyers deal +2 attack when their stack is outnumbered.' },
      { id: 'd_07', name: 'Stealth Approach',  desc: 'Destroyer stacks do not trigger combat alerts when adjacent.' },
      { id: 'd_08', name: 'Long Range Guns',   desc: 'Destroyer pre-strike resolves before dreadnaught attacks.' },
      { id: 'd_09', name: 'Wolfpack',          desc: 'Each additional destroyer in a stack adds +0.5 attack (rounded).' },
      { id: 'd_10', name: 'Hit and Run',       desc: 'Destroyers may retreat after pre-strike without main combat.' },
    ],
  },
  {
    id: 'cruiser', label: 'CRUISER',
    color: 0x44ddaa, hex: '#44ddaa',
    icon: SHIP_ICONS.cruiser,
    root: { id: 'cruiser_root', name: 'Cruiser Fleet',
            desc: 'Base cruiser doctrine — 50% repair chance on destruction.', tested: true },
    pool: [
      { id: 'c_01', name: 'Field Medics',       desc: 'Cruiser repair chance increases from 50% to 65%.' },
      { id: 'c_02', name: 'Heavy Armour',       desc: 'Cruisers require 2 damage to destroy.' },
      { id: 'c_03', name: 'Nanite Repair',      desc: 'Repaired cruisers return at full health.' },
      { id: 'c_04', name: 'Escort Formation',   desc: 'Cruisers absorb one hit directed at the flagship per battle.' },
      { id: 'c_05', name: 'Regeneration Field', desc: 'All friendly ships in the stack gain +1 health.' },
      { id: 'c_06', name: 'Battle Hardened',    desc: 'Each time a cruiser repairs, it permanently gains +1 attack.' },
      { id: 'c_07', name: 'Combat Medic',       desc: 'Cruisers can repair one other ship type (not just themselves) per battle.' },
      { id: 'c_08', name: 'Rapid Response',     desc: 'Cruiser production time reduced by 20%.' },
      { id: 'c_09', name: 'Shielded Core',      desc: 'Cruisers take -1 damage from pre-strikes.' },
      { id: 'c_10', name: 'Last Stand',         desc: 'The final cruiser in a stack has a 100% repair chance.' },
    ],
  },
  {
    id: 'dreadnaught', label: 'DREADNAUGHT',
    color: 0xff8844, hex: '#ff8844',
    icon: SHIP_ICONS.dreadnaught,
    root: { id: 'dreadnaught_root', name: 'Dreadnaught Armada',
            desc: 'Base capital doctrine — 4 attack, 4 health, counts as 4 units.', tested: true },
    pool: [
      { id: 'dr_01', name: 'Siege Cannons',    desc: 'Dreadnaught attack increases to 5.' },
      { id: 'dr_02', name: 'Titan Plating',    desc: 'Dreadnaught health increases to 6.' },
      { id: 'dr_03', name: 'Orbital Strike',   desc: 'Dreadnaught deals 1 splash damage to all enemies, resolved after main combat.' },
      { id: 'dr_04', name: 'Point Defence',    desc: 'Each dreadnaught intercepts one incoming missile per battle.' },
      { id: 'dr_05', name: 'Mass Driver',      desc: 'When a dreadnaught is alone in a stack, its attack counts as 8.' },
      { id: 'dr_06', name: 'Citadel Hull',     desc: 'Dreadnaught requires 8 damage to destroy instead of 4.' },
      { id: 'dr_07', name: 'Suppression Fire', desc: 'Dreadnaught attack reduces enemy stack movement speed by 20% for 5 seconds.' },
      { id: 'dr_08', name: 'Terror',           desc: 'Enemy stacks at adjacent nodes lose 1 unit per 10 seconds while a dreadnaught is present.' },
      { id: 'dr_09', name: 'Slow Reload',      desc: 'Dreadnaught attacks last — but deals double damage on its turn.' },
      { id: 'dr_10', name: 'Living Fortress',  desc: 'A dreadnaught on a planet gives it +2 defense against captures.' },
    ],
  },
  {
    id: 'flagship', label: 'FLAGSHIP',
    color: 0xffdd44, hex: '#ffdd44',
    icon: SHIP_ICONS.flagship,
    root: { id: 'flagship_root', name: 'Command Ship',
            desc: 'Command protocols — flagship is the last unit destroyed; losing it ends the game.', tested: true },
    pool: [
      { id: 'fl_01', name: 'Command Aura',     desc: 'All ships in the flagship\'s stack gain +1 attack.' },
      { id: 'fl_02', name: 'Emergency Shield', desc: 'Flagship survives one lethal hit per battle.' },
      { id: 'fl_03', name: 'Rally Beacon',     desc: 'Friendly stacks at adjacent nodes gain +1 attack for 10 seconds after flagship arrives.' },
      { id: 'fl_04', name: 'Adaptive Armour',  desc: 'Flagship gains +1 health for every 3 battles survived.' },
      { id: 'fl_05', name: 'Fleet Admiral',    desc: 'All friendly units deal +1 damage while the flagship is alive and on the map.' },
      { id: 'fl_06', name: 'Undying Will',     desc: 'Flagship can be rebuilt once per game if destroyed (costs 300/300/300).' },
      { id: 'fl_07', name: 'Iron Reserve',     desc: 'Flagship generates +5 of each resource per tick.' },
      { id: 'fl_08', name: 'Tactical Retreat', desc: 'Flagship can disengage from combat before resolution once per battle.' },
      { id: 'fl_09', name: 'Inspiring Presence',desc: 'Cruiser repair chance increases to 65% when flagship is in the same stack.' },
      { id: 'fl_10', name: 'Spearhead',        desc: 'Flagship stack moves 50% faster when ordered to attack an enemy node.' },
    ],
  },
  {
    id: 'econ_buildings', label: 'ECON BUILDINGS',
    color: 0x44ffdd, hex: '#44ffdd',
    icon: SHIP_ICONS.econ_buildings,
    root: { id: 'econ_buildings_root', name: 'Basic Infrastructure',
            desc: 'Standard economic building slate — Farms, Extractors, and Mines available.', tested: true },
    pool: [
      { id: 'eb_01', name: 'Advanced Farming',    desc: 'Farms produce +2 food per tick instead of +1.' },
      { id: 'eb_02', name: 'Efficient Smelting',  desc: 'Metal Extractors produce +2 metal per tick.' },
      { id: 'eb_03', name: 'Fusion Tap',          desc: 'Fuel Extractors produce +2 fuel per tick.' },
      { id: 'eb_04', name: 'Supply Network',      desc: 'Resource buildings on adjacent player-owned planets each share +1 yield with neighbours.' },
      { id: 'eb_05', name: 'Megaplex',            desc: 'All resource buildings on a fully developed planet produce triple yield.' },
      { id: 'eb_06', name: 'Automated Logistics', desc: 'Resource tick fires every 2 seconds instead of 3.' },
      { id: 'eb_07', name: 'Deep Excavation',     desc: 'Each planet\'s base resource values increase by 1 across all types.' },
      { id: 'eb_08', name: 'Bunker Economy',      desc: 'Resource buildings are not destroyed by meteor impact.' },
      { id: 'eb_09', name: 'Trade Routes',        desc: 'Owning 3+ planets generates a bonus +5 of each resource per tick.' },
      { id: 'eb_10', name: 'Stockpile',           desc: 'Resource cap increased — resources can accumulate up to 9999 instead of 999.' },
    ],
  },
  {
    id: 'econ_ships', label: 'ECON SHIPS',
    color: 0x44ffdd, hex: '#44ffdd',
    icon: SHIP_ICONS.econ_ships,
    root: { id: 'econ_ships_root', name: 'Mining Doctrine',
            desc: 'Asteroid mining operations — Asteroid Miner unit available.', tested: true },
    pool: [
      { id: 'es_01', name: 'Improved Drills',    desc: 'Mining time reduced from 4s to 2.5s.' },
      { id: 'es_02', name: 'Cargo Hold Mk II',   desc: 'Miners carry 50% more resources per trip.' },
      { id: 'es_03', name: 'Extended Range',     desc: 'Miner patrol radius increases from 160px to 240px.' },
      { id: 'es_04', name: 'Dual Miner Bays',    desc: 'Asteroid Mine buildings deploy 2 miners instead of 1.' },
      { id: 'es_05', name: 'Rich Vein Scanner',  desc: 'Miners detect rich asteroids from twice the normal range.' },
      { id: 'es_06', name: 'Deep Core Mining',   desc: 'All asteroid resource yields doubled.' },
      { id: 'es_07', name: 'Meteor Harvesting',  desc: 'Miners that intercept meteors gain a 50% resource bonus on the yield.' },
      { id: 'es_08', name: 'Scout Drones',       desc: 'Asteroid Miners reveal the contents of nearby asteroids before flying out.' },
      { id: 'es_09', name: 'Fuel Skimming',      desc: 'Each asteroid mined generates +5 bonus fuel regardless of asteroid type.' },
      { id: 'es_10', name: 'Fleet Resupply',     desc: 'Depositing a full cargo load generates +2 of each resource for every friendly ship at the home planet.' },
    ],
  },
  {
    id: 'defense', label: 'DEFENSE',
    color: 0xff6688, hex: '#ff6688',
    icon: SHIP_ICONS.defense,
    root: { id: 'defense_root', name: 'Planetary Shields',
            desc: 'Orbital defense basics — planets with defensive buildings resist meteor impact.', tested: true },
    pool: [
      { id: 'de_01', name: 'Flak Batteries',     desc: 'Planetary defense buildings intercept meteors from 1.5× their normal range.' },
      { id: 'de_02', name: 'Reinforced Bunkers', desc: 'Meteor impact damage reduced from 30% to 20% per unit.' },
      { id: 'de_03', name: 'Missile Screen',     desc: 'Planetary defense automatically intercepts one incoming enemy missile per battle.' },
      { id: 'de_04', name: 'Shield Grid',        desc: 'Defending units take -1 damage per attack when at a fortified planet.' },
      { id: 'de_05', name: 'Planetary Cannon',   desc: 'Defense buildings deal 2 damage per 10 seconds to enemy stacks at adjacent nodes.' },
      { id: 'de_06', name: 'Fortress World',     desc: 'A planet with a defense building cannot be captured while it is active and powered.' },
      { id: 'de_07', name: 'Point Defence Net',  desc: 'Defense buildings protect all adjacent planets from meteor impact.' },
      { id: 'de_08', name: 'Counter Battery',    desc: 'Defense buildings return fire on Missile Carrier attacks, dealing 1 damage to the source.' },
      { id: 'de_09', name: 'Hardened Silos',     desc: 'Buildings on defended planets survive one meteor impact without being destroyed.' },
      { id: 'de_10', name: 'Evacuation Drill',   desc: 'When a defended planet is attacked, 30% of units retreat to an adjacent friendly node automatically.' },
    ],
  },
];

// ── Seeded shuffle helper ─────────────────────────────────────────────────────
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────

// ── Integer helper — all positions must land on whole pixels ─────────────────
const R = Math.round;

export default class ResearchScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ResearchScene' });
    this.unlocked     = new Set();
    this.research     = 0;
    this._visible     = false;
    this._activeTree  = 0;
    this._activeTrees = [];
    // Arrays of scene objects created per-open; destroyed on close
    this._panelObjs   = [];   // static chrome (dim, bg, title, close, tabs)
    this._treeObjs    = [];   // redrawn per tree switch
  }

  create() {
    const { width, height } = this.scale;
    const seed = this.registry.get('mapSeed') || Date.now();
    this._buildActiveTrees(seed);

    // Layout constants — all integers
    this._W  = width;
    this._H  = height;
    this._PX = 40;
    this._PY = 30;
    this._PW = width  - 80;
    this._PH = height - 60;

    // Persistent info-strip graphics (always present, cleared when hidden)
    this._infoG    = this.add.graphics().setDepth(92).setVisible(false);
    this._infoName = this._makeTxt(0, 0, '', 'bold 12px monospace', '#ffffff', 92);
    this._infoCost = this._makeTxt(0, 0, '', '11px monospace',      '#7799bb', 92);
    this._infoDesc = this._makeTxt(0, 0, '', '11px monospace',      '#7a9aba', 92);
    this._infoDesc.setWordWrapWidth(580);

    // Persistent WIP tooltip (depth 95, always on top)
    this._wipG    = this.add.graphics().setDepth(95).setVisible(false);
    this._wipText = this._makeTxt(0, 0, '', '11px monospace', '#ff9999', 95);
    this._wipText.setVisible(false);

    // Persistent RP display
    this._rpText = this._makeTxt(0, 0, '', '11px monospace', '#3366aa', 92);
    this._rpText.setVisible(false);

    this.game.events.on('openResearch',  () => this._open());
    this.game.events.on('closeResearch', () => this._close());
    this.game.events.on('researchAddRP', (amt) => this._addRP(amt));

    this._activeTrees.forEach(t => this.unlocked.add(t.root.id));
  }

  // ── Shortcut: add a text object directly to scene (no containers) ─────────
  _makeTxt(x, y, str, font, color, depth = 91) {
    return this.add.text(R(x), R(y), str, { font, color })
      .setDepth(depth)
      .setResolution(2);          // crisp at any DPR
  }

  // ── Build active trees ────────────────────────────────────────────────────
  _buildActiveTrees(seed) {
    this._activeTrees = TREE_DEFS.map((def, ti) => {
      const shuffled = seededShuffle(def.pool, seed + ti * 999);
      const chosen   = shuffled.slice(0, 6);
      return { ...def, pairs: [
        { tier: 1, cost: 10, left: chosen[0], right: chosen[1] },
        { tier: 2, cost: 10, left: chosen[2], right: chosen[3] },
        { tier: 3, cost: 10, left: chosen[4], right: chosen[5] },
      ]};
    });
  }

  // ── Open / Close ──────────────────────────────────────────────────────────
  _open() {
    this._visible = true;
    this._buildPanel();
    this._drawTree(this._activeTree);
    this._updateRPDisplay();
    this.game.events.emit('researchOpen');
  }

  _close() {
    this._visible = false;
    this._destroyObjs(this._panelObjs);
    this._destroyObjs(this._treeObjs);
    this._panelObjs = [];
    this._treeObjs  = [];
    this._clearInfo();
    this._hideWip();
    this._rpText.setVisible(false);
    this.game.events.emit('researchClosed');
  }

  _destroyObjs(arr) {
    arr.forEach(o => { if (o && o.destroy) o.destroy(); });
  }

  _addRP(amount) {
    this.research += amount;
    if (this._visible) this._updateRPDisplay();
  }

  _updateRPDisplay() {
    const { _PX: PX, _PY: PY, _PW: PW } = this;
    this._rpText
      .setPosition(R(PX + PW / 2), PY + 42)
      .setText(`${this.research} RP  (+2 / tick)`)
      .setOrigin(0.5, 0)
      .setVisible(true);
  }

  // ── Static panel chrome (dim, bg, title, close, tabs) ────────────────────
  _buildPanel() {
    this._destroyObjs(this._panelObjs);
    this._panelObjs = [];
    const P = this._panelObjs;
    const { _PX: PX, _PY: PY, _PW: PW, _PH: PH, _W: W, _H: H } = this;

    // Dim
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.82)
      .setOrigin(0, 0).setDepth(90).setInteractive();
    dim.on('pointerdown', () => this._close());
    P.push(dim);

    // Panel background
    const bg = this.add.graphics().setDepth(91);
    bg.fillStyle(0x070d1a, 1);
    bg.fillRoundedRect(PX, PY, PW, PH, 8);
    bg.lineStyle(1, 0x2255aa, 0.9);
    bg.strokeRoundedRect(PX, PY, PW, PH, 8);
    P.push(bg);

    // Title
    const title = this._makeTxt(R(PX + PW / 2), PY + 16, 'RESEARCH', 'bold 14px monospace', '#44aaff', 92)
      .setOrigin(0.5, 0);
    P.push(title);

    // RP display (repositioned when updated)
    this._updateRPDisplay();

    // Close button
    const closeG = this.add.graphics().setDepth(92);
    const CX = PX + PW - 22, CY = PY + 20;
    const drawClose = (hover) => {
      closeG.clear();
      closeG.fillStyle(hover ? 0x1a3a6a : 0x0d1a2e, 1);
      closeG.fillRoundedRect(CX - 12, CY - 12, 24, 24, 4);
      closeG.lineStyle(1, hover ? 0x44aaff : 0x2a4a6a, 0.9);
      closeG.strokeRoundedRect(CX - 12, CY - 12, 24, 24, 4);
      closeG.lineStyle(1.5, hover ? 0x88ccff : 0x4477aa, 1);
      closeG.lineBetween(CX - 5, CY - 5, CX + 5, CY + 5);
      closeG.lineBetween(CX + 5, CY - 5, CX - 5, CY + 5);
    };
    drawClose(false);
    const closeZone = this.add.rectangle(CX, CY, 28, 28, 0xffffff, 0)
      .setDepth(93).setInteractive({ useHandCursor: true });
    closeZone.on('pointerover',  () => drawClose(true));
    closeZone.on('pointerout',   () => drawClose(false));
    closeZone.on('pointerdown',  () => this._close());
    P.push(closeG, closeZone);

    // Tabs
    this._buildTabs(P);
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  _buildTabs(targetArr) {
    const arr = targetArr || this._panelObjs;
    // Remove old tab zones if rebuilding in place
    if (!targetArr) {
      this._tabZones?.forEach(z => z.destroy());
    }
    this._tabZones = [];

    const { _PX: PX, _PY: PY } = this;
    const TAB_W = 172, TAB_H = 50, GAP = 5, TAB_X = PX + 10;
    const TAB_START_Y = PY + 54;

    const tabG = this.add.graphics().setDepth(91);
    arr.push(tabG);

    this._activeTrees.forEach((tree, i) => {
      const ty     = R(TAB_START_Y + i * (TAB_H + GAP));
      const active = i === this._activeTree;
      const col    = tree.color;

      if (active) {
        tabG.fillStyle(0x0d2040, 1);
        tabG.fillRoundedRect(TAB_X, ty, TAB_W, TAB_H, 4);
        tabG.lineStyle(1, col, 0.9);
        tabG.strokeRoundedRect(TAB_X, ty, TAB_W, TAB_H, 4);
        tabG.fillStyle(col, 1);
        tabG.fillRect(TAB_X, ty + 5, 3, TAB_H - 10);
      } else {
        tabG.fillStyle(0x0a1428, 1);
        tabG.fillRoundedRect(TAB_X, ty, TAB_W, TAB_H, 4);
        tabG.lineStyle(1, 0x1a2a44, 0.7);
        tabG.strokeRoundedRect(TAB_X, ty, TAB_W, TAB_H, 4);
      }

      // Icon — direct to scene, integer coords
      const iconG   = this.add.graphics().setDepth(92);
      const iconCol = active ? col : Phaser.Display.Color.IntegerToColor(col).darken(40).color;
      tree.icon(iconG, TAB_X + 22, ty + 25, iconCol);
      arr.push(iconG);

      // Label — top line of tab, integer Y
      const lbl = this._makeTxt(TAB_X + 40, ty + 12, tree.label,
        active ? 'bold 11px monospace' : '11px monospace',
        active ? tree.hex : '#5577aa', 92);
      lbl.setOrigin(0, 0);
      arr.push(lbl);

      // Fraction — bottom line of tab
      const unlockCount = this._countUnlocked(i);
      const totalNodes  = 1 + this._activeTrees[i].pairs.length * 2;
      const badge = this._makeTxt(TAB_X + TAB_W - 10, ty + 30,
        `${unlockCount} / ${totalNodes}`,
        '10px monospace',
        active ? tree.hex : '#334466', 92);
      badge.setOrigin(1, 0);
      arr.push(badge);

      // Hit zone
      const zone = this.add.rectangle(TAB_X, ty, TAB_W, TAB_H, 0xffffff, 0)
        .setOrigin(0, 0).setDepth(93).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => { if (i !== this._activeTree) this._switchTree(i); });
      this._tabZones.push(zone);
      arr.push(zone);
    });
  }

  _countUnlocked(treeIdx) {
    const tree = this._activeTrees[treeIdx];
    let n = this.unlocked.has(tree.root.id) ? 1 : 0;
    tree.pairs.forEach(p => {
      if (this.unlocked.has(p.left.id))  n++;
      if (this.unlocked.has(p.right.id)) n++;
    });
    return n;
  }

  // Switch tree without rebuilding entire panel
  _switchTree(treeIdx) {
    this._activeTree = treeIdx;
    // Rebuild tabs in-place (destroys old tab zones, redraws graphics)
    this._destroyObjs(this._panelObjs);
    this._panelObjs = [];
    this._buildPanel();
    this._drawTree(treeIdx);
  }

  // ── Tree rendering ────────────────────────────────────────────────────────
  _drawTree(treeIdx) {
    this._activeTree = treeIdx;
    this._destroyObjs(this._treeObjs);
    this._treeObjs = [];
    this._clearInfo();
    this._hideWip();

    const tree = this._activeTrees[treeIdx];
    const { _PX: PX, _PY: PY, _PW: PW, _PH: PH } = this;
    const T = this._treeObjs;

    const TAB_AREA = 194;
    const AREA_X   = PX + TAB_AREA;
    const AREA_W   = PW - TAB_AREA - 16;
    const AREA_Y   = PY + 50;
    const AREA_H   = PH - 50 - 90;

    const NODE_W   = 184, NODE_H = 64;
    const ROOT_Y   = R(AREA_Y + 14);
    const ROW_GAP  = R((AREA_H - NODE_H - 16) / 2.8);
    const MID_X    = R(AREA_X + AREA_W / 2);
    const LEFT_X   = MID_X - 122;
    const RIGHT_X  = MID_X + 122;

    const g = this.add.graphics().setDepth(91);
    T.push(g);

    const drawNode = (node, x, y, isRoot, tier, cost) => {
      x = R(x); y = R(y);
      const unlocked  = this.unlocked.has(node.id);
      const canUnlock = !isRoot && this._canUnlock(node, tree, treeIdx);
      const NX = x - R(NODE_W / 2);

      // Box fill
      g.fillStyle(unlocked ? 0x0d2240 : 0x080e1c, 1);
      g.fillRoundedRect(NX, y, NODE_W, NODE_H, 5);
      // Box border
      g.lineStyle(1, unlocked ? tree.color : canUnlock ? tree.color : 0x1a2a3a,
                     unlocked ? 0.9 : canUnlock ? 0.5 : 0.4);
      g.strokeRoundedRect(NX, y, NODE_W, NODE_H, 5);
      // Unlocked glow + accent bar
      if (unlocked) {
        g.fillStyle(tree.color, 0.07);
        g.fillRoundedRect(NX, y, NODE_W, NODE_H, 5);
        g.fillStyle(tree.color, 1);
        g.fillRect(NX + 1, y + 5, 3, NODE_H - 10);
      }

      // Root icon
      if (isRoot) {
        const ig = this.add.graphics().setDepth(92);
        tree.icon(ig, NX + 18, y + R(NODE_H / 2), tree.color);
        T.push(ig);
      }

      // Name text — integer position, resolution 2 for crispness
      const nameX  = R(isRoot ? NX + 36 : NX + 12);
      const nameCol = unlocked ? tree.hex : canUnlock ? '#aaccdd' : '#2d4055';
      const nameTxt = this._makeTxt(nameX, y + 10, node.name,
        unlocked ? 'bold 11px monospace' : '11px monospace', nameCol, 92);
      nameTxt.setWordWrapWidth(NODE_W - (isRoot ? 48 : 28));
      T.push(nameTxt);

      // Status / cost line
      if (!isRoot) {
        const stTxt = unlocked ? '✓ RESEARCHED'
          : canUnlock ? `${cost} RP — click to unlock`
          : `${cost} RP (locked)`;
        const stCol = unlocked ? tree.hex : canUnlock ? '#4d7090' : '#1e3040';
        const st = this._makeTxt(NX + 12, y + NODE_H - 18, stTxt, '9px monospace', stCol, 92);
        T.push(st);
      }

      // Red ✕ WIP badge — top-right corner of every non-root node
      if (!isRoot) {
        const BX = NX + NODE_W - 11, BY = y + 10;
        const badgeG = this.add.graphics().setDepth(93);
        badgeG.fillStyle(0x660000, 1);
        badgeG.fillCircle(BX, BY, 8);
        badgeG.lineStyle(1, 0xff3333, 0.8);
        badgeG.strokeCircle(BX, BY, 8);
        badgeG.lineStyle(1.5, 0xff5555, 1);
        badgeG.lineBetween(BX - 4, BY - 4, BX + 4, BY + 4);
        badgeG.lineBetween(BX + 4, BY - 4, BX - 4, BY + 4);
        T.push(badgeG);

        const badgeZone = this.add.rectangle(BX, BY, 20, 20, 0xffffff, 0)
          .setDepth(94).setInteractive({ useHandCursor: true });
        badgeZone.on('pointerover', (p) => this._showWip(R(p.x), R(p.y)));
        badgeZone.on('pointermove', (p) => this._showWip(R(p.x), R(p.y)));
        badgeZone.on('pointerout',  () => this._hideWip());
        badgeZone.on('pointerdown', (p, lx, ly, e) => e.stopPropagation());
        T.push(badgeZone);
      }

      // Main click zone (narrower to avoid overlap with badge)
      const zone = this.add.rectangle(NX, y, NODE_W - 22, NODE_H, 0xffffff, 0)
        .setOrigin(0, 0).setDepth(93)
        .setInteractive({ useHandCursor: !unlocked && (isRoot || canUnlock) });
      zone.on('pointerover', () => this._showInfo(node, tree, tier, isRoot, canUnlock, unlocked, cost));
      zone.on('pointerout',  () => this._clearInfo());
      if (!isRoot && !unlocked && canUnlock) {
        zone.on('pointerdown', () => this._unlock(node, treeIdx, cost));
      }
      T.push(zone);

      return { cx: x, cy: y + NODE_H };
    };

    // Root node
    const rootB = drawNode(tree.root, MID_X, ROOT_Y, true, 0, 0);

    // Pairs + connector lines
    tree.pairs.forEach((pair, pi) => {
      const rowY     = R(ROOT_Y + 76 + pi * ROW_GAP);
      const lineTopY = pi === 0 ? rootB.cy : R(ROOT_Y + 76 + (pi - 1) * ROW_GAP) + NODE_H;
      const branchY  = rowY - 14;
      const accessible = this._canAccessTier(pi, tree);

      g.lineStyle(1, tree.color, accessible ? 0.4 : 0.12);
      g.lineBetween(MID_X, lineTopY, MID_X, branchY);
      g.lineBetween(LEFT_X, branchY, RIGHT_X, branchY);
      g.lineBetween(LEFT_X,  branchY, LEFT_X,  rowY);
      g.lineBetween(RIGHT_X, branchY, RIGHT_X, rowY);

      drawNode(pair.left,  LEFT_X,  rowY, false, pair.tier, pair.cost);
      drawNode(pair.right, RIGHT_X, rowY, false, pair.tier, pair.cost);
    });
  }

  // ── Unlock logic ──────────────────────────────────────────────────────────
  _canAccessTier(pairIdx, tree) {
    if (pairIdx === 0) return true;
    const prev = tree.pairs[pairIdx - 1];
    return this.unlocked.has(prev.left.id) || this.unlocked.has(prev.right.id);
  }

  _canUnlock(node, tree) {
    const pi = tree.pairs.findIndex(p => p.left.id === node.id || p.right.id === node.id);
    if (pi < 0 || !this._canAccessTier(pi, tree)) return false;
    const pair    = tree.pairs[pi];
    const sibling = pair.left.id === node.id ? pair.right.id : pair.left.id;
    if (this.unlocked.has(sibling)) return false;
    return this.research >= pair.cost;
  }

  _unlock(node, treeIdx, cost) {
    if (this.research < cost) return;
    this.research -= cost;
    this.unlocked.add(node.id);
    this.game.events.emit('researchUnlocked', { nodeId: node.id, treeId: this._activeTrees[treeIdx].id });
    this._drawTree(treeIdx);
    this._clearInfo();
    this._updateRPDisplay();
    // Refresh tab badges without rebuilding whole panel
    this._buildTabs();
  }

  // ── WIP tooltip ───────────────────────────────────────────────────────────
  _showWip(px, py) {
    const TW = 210, TH = 28;
    let tx = px + 12, ty = py - TH - 6;
    if (tx + TW > this._W - 10) tx = px - TW - 12;
    if (ty < 10) ty = py + 14;
    tx = R(tx); ty = R(ty);

    this._wipG.clear().setVisible(true);
    this._wipG.fillStyle(0x200808, 0.97);
    this._wipG.fillRoundedRect(tx, ty, TW, TH, 4);
    this._wipG.lineStyle(1, 0xff3333, 0.8);
    this._wipG.strokeRoundedRect(tx, ty, TW, TH, 4);

    this._wipText
      .setPosition(tx + 10, ty + 8)
      .setText('✕  Feature not yet implemented')
      .setVisible(true);
  }

  _hideWip() {
    this._wipG.clear().setVisible(false);
    this._wipText.setVisible(false);
  }

  // ── Info strip ────────────────────────────────────────────────────────────
  _showInfo(node, tree, tier, isRoot, canUnlock, unlocked, cost) {
    const { _PX: PX, _PY: PY, _PW: PW, _PH: PH } = this;
    const TAB_AREA = 194;
    const SX = R(PX + TAB_AREA), SY = R(PY + PH - 86);
    const SW = PW - TAB_AREA - 16;

    this._infoG.setVisible(true).clear();
    this._infoG.fillStyle(0x050c18, 1);
    this._infoG.fillRoundedRect(SX, SY, SW, 74, 4);
    this._infoG.lineStyle(1, tree.color, unlocked ? 0.6 : canUnlock ? 0.4 : 0.15);
    this._infoG.strokeRoundedRect(SX, SY, SW, 74, 4);

    const statusStr = unlocked  ? '  ✓ RESEARCHED'
      : isRoot    ? '  (always active)'
      : canUnlock ? `  —  ${cost} RP to unlock`
      :             `  —  ${cost} RP  (locked)`;

    this._infoName
      .setPosition(SX + 14, SY + 10)
      .setText(node.name + statusStr)
      .setColor(unlocked ? tree.hex : canUnlock ? '#aaccff' : '#334455')
      .setStyle({ font: 'bold 11px monospace' })
      .setVisible(true);

    this._infoCost
      .setPosition(SX + 14, SY + 30)
      .setText(!isRoot && !unlocked
        ? `Cost: ${cost} Research Points   ·   Current RP: ${this.research}`
        : '')
      .setStyle({ font: '10px monospace', color: '#4a6688' })
      .setVisible(true);

    this._infoDesc
      .setPosition(SX + 14, SY + 48)
      .setText(node.desc)
      .setStyle({ font: '10px monospace', color: '#7a9aba' })
      .setVisible(true);
  }

  _clearInfo() {
    this._infoG.clear().setVisible(false);
    this._infoName.setVisible(false).setText('');
    this._infoCost.setVisible(false).setText('');
    this._infoDesc.setVisible(false).setText('');
  }
}

export { TREE_DEFS };
