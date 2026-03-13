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

// ── Perk-specific icon draw functions ────────────────────────────────────────
// Shared perk names (e.g. "Rapid Scramble") always use the same icon across trees.
// Each function: (g, cx, cy, col) — draws into an existing graphics object.
export const PERK_ICONS = {
  // ── Shared cross-tree perks ──────────────────────────────────────────────
  // Rapid Scramble — lightning bolt (speed / launch rate)
  'Rapid Scramble':      (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx + 2, cy - 8, cx - 3, cy, cx + 1, cy);
    g.fillTriangle(cx - 1, cy, cx - 4, cy + 8, cx + 3, cy);
  },
  // Dense Formation — tight grid of dots
  'Dense Formation':     (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) g.fillCircle(cx + c * 5, cy + r * 5, 2);
  },
  // Afterburner — flame trail / chevron stack
  'Afterburner':         (g, cx, cy, col) => {
    g.fillStyle(col, 1);    g.fillTriangle(cx, cy - 8, cx - 5, cy + 2, cx + 5, cy + 2);
    g.fillStyle(col, 0.55); g.fillTriangle(cx, cy - 3, cx - 4, cy + 6, cx + 4, cy + 6);
    g.fillStyle(col, 0.25); g.fillTriangle(cx, cy + 2, cx - 3, cy + 9, cx + 3, cy + 9);
  },
  // Wingman Protocol — two small ships side by side
  'Wingman Protocol':    (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx - 5, cy - 8, cx - 9, cy + 4, cx - 1, cy + 4);
    g.fillTriangle(cx + 5, cy - 8, cx + 1, cy + 4, cx + 9, cy + 4);
  },
  // Ace Pilots — star badge
  'Ace Pilots':          (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI / 5) - Math.PI / 2;
      const b = a + 2 * Math.PI / 5;
      g.fillTriangle(cx, cy, cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, cx + Math.cos(b) * 3, cy + Math.sin(b) * 3);
    }
  },
  // Hunter Protocol — crosshair / targeting reticle
  'Hunter Protocol':     (g, cx, cy, col) => {
    g.lineStyle(1.5, col, 1); g.strokeCircle(cx, cy, 6);
    g.lineBetween(cx - 10, cy, cx - 7, cy); g.lineBetween(cx + 7, cy, cx + 10, cy);
    g.lineBetween(cx, cy - 10, cx, cy - 7); g.lineBetween(cx, cy + 7, cx, cy + 10);
  },
  // Reinforced Hull — shield shape
  'Reinforced Hull':     (g, cx, cy, col) => {
    g.fillStyle(col, 0.22); g.fillTriangle(cx, cy + 9, cx - 8, cy - 7, cx + 8, cy - 7);
    g.lineStyle(2, col, 1); g.strokeTriangle(cx, cy + 9, cx - 8, cy - 7, cx + 8, cy - 7);
    g.lineStyle(1, col, 0.6); g.lineBetween(cx, cy - 7, cx, cy + 4);
  },
  // Last Stand — cracked/broken shield
  'Last Stand':          (g, cx, cy, col) => {
    g.fillStyle(col, 0.15); g.fillTriangle(cx, cy + 9, cx - 8, cy - 7, cx + 8, cy - 7);
    g.lineStyle(1.5, col, 0.7); g.strokeTriangle(cx, cy + 9, cx - 8, cy - 7, cx + 8, cy - 7);
    g.lineStyle(1.5, col, 1); g.lineBetween(cx, cy - 7, cx - 2, cy); g.lineBetween(cx - 2, cy, cx + 2, cy + 5);
  },
  // First Strike — arrow striking forward
  'First Strike':        (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx, cy - 9, cx - 5, cy + 1, cx + 5, cy + 1);
    g.fillRect(cx - 2, cy + 1, 4, 7);
  },

  // ── Fighter-only perks ───────────────────────────────────────────────────
  // Swarm Tactics — cluster of small triangles
  'Swarm Tactics':       (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx,     cy - 8, cx - 3, cy - 2, cx + 3, cy - 2);
    g.fillTriangle(cx - 6, cy + 1, cx - 9, cy + 7, cx - 3, cy + 7);
    g.fillTriangle(cx + 6, cy + 1, cx + 3, cy + 7, cx + 9, cy + 7);
    g.fillStyle(col, 0.5);
    g.fillTriangle(cx - 3, cy - 1, cx - 6, cy + 5, cx, cy + 5);
    g.fillTriangle(cx + 3, cy - 1, cx, cy + 5, cx + 6, cy + 5);
  },
  // Interceptor Role — fighter with explosion burst
  'Interceptor Role':    (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx, cy - 8, cx - 5, cy + 4, cx + 5, cy + 4);
    g.lineStyle(1.5, col, 0.7);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.lineBetween(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, cx + Math.cos(a) * 10, cy + Math.sin(a) * 10); }
  },
  // Air Superiority — fighter with orbit ring
  'Air Superiority':     (g, cx, cy, col) => {
    g.fillStyle(col, 1); g.fillTriangle(cx, cy - 6, cx - 4, cy + 4, cx + 4, cy + 4);
    g.lineStyle(1.5, col, 0.6); g.strokeEllipse(cx, cy + 1, 18, 9);
  },
  // Kamikaze Protocol — skull / explosion X
  'Kamikaze Protocol':   (g, cx, cy, col) => {
    g.fillStyle(col, 0.2); g.fillCircle(cx, cy - 1, 7);
    g.lineStyle(1.5, col, 1); g.strokeCircle(cx, cy - 1, 7);
    g.lineBetween(cx - 4, cy + 5, cx + 4, cy + 8);
    g.lineBetween(cx - 3, cy + 4, cx - 3, cy + 8);
    g.lineBetween(cx + 3, cy + 4, cx + 3, cy + 8);
  },

  // ── Destroyer-only perks ─────────────────────────────────────────────────
  // Improved Barrage — 3 vertical shots
  'Improved Barrage':    (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    for (let i = -1; i <= 1; i++) { g.fillRect(cx + i * 5 - 1, cy - 8, 3, 10); g.fillTriangle(cx + i * 5, cy - 10, cx + i * 5 - 2, cy - 6, cx + i * 5 + 2, cy - 6); }
    g.lineStyle(1, col, 0.5); g.lineBetween(cx - 8, cy + 3, cx + 8, cy + 3);
  },
  // Torpedo Spread — two angled torpedoes
  'Torpedo Spread':      (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx - 6, cy - 8, cx - 10, cy + 4, cx - 2, cy + 4);
    g.fillTriangle(cx + 6, cy - 8, cx + 2, cy + 4, cx + 10, cy + 4);
    g.fillStyle(col, 0.5);
    g.fillRect(cx - 7, cy + 4, 4, 4);
    g.fillRect(cx + 3, cy + 4, 4, 4);
  },
  // Hit and Run — arrow curving away
  'Hit and Run':         (g, cx, cy, col) => {
    g.lineStyle(2, col, 1);
    g.lineBetween(cx - 8, cy + 4, cx + 2, cy - 6);
    g.lineBetween(cx + 2, cy - 6, cx + 8, cy - 2);
    g.fillStyle(col, 1);
    g.fillTriangle(cx + 8, cy - 8, cx + 4, cy - 2, cx + 10, cy + 0);
  },

  // ── Cruiser-only perks ───────────────────────────────────────────────────
  // Field Medics — cross / plus sign
  'Field Medics':        (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillRect(cx - 2, cy - 9, 4, 18);
    g.fillRect(cx - 9, cy - 2, 18, 4);
  },
  // Nanite Repair — circular arrows
  'Nanite Repair':       (g, cx, cy, col) => {
    g.lineStyle(2, col, 1); g.strokeCircle(cx, cy, 7);
    g.fillStyle(col, 1);
    g.fillTriangle(cx + 7, cy - 3, cx + 4, cy - 7, cx + 10, cy - 7);
    g.fillTriangle(cx - 7, cy + 3, cx - 4, cy + 7, cx - 10, cy + 7);
  },
  // Escort Formation — large ship shielding small ship
  'Escort Formation':    (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx + 4, cy - 8, cx, cy + 8, cx + 8, cy + 8);
    g.fillStyle(col, 0.5);
    g.fillTriangle(cx - 4, cy - 4, cx - 7, cy + 4, cx - 1, cy + 4);
    g.lineStyle(1.5, col, 0.8); g.lineBetween(cx - 2, cy - 8, cx - 2, cy + 8);
  },
  // Regeneration Field — radiating rings
  'Regeneration Field':  (g, cx, cy, col) => {
    g.lineStyle(2, col, 1);    g.strokeCircle(cx, cy, 3);
    g.lineStyle(1.5, col, 0.6); g.strokeCircle(cx, cy, 6);
    g.lineStyle(1, col, 0.3);  g.strokeCircle(cx, cy, 9);
  },
  // Shielded Core — concentric hexagon
  'Shielded Core':       (g, cx, cy, col) => {
    const hex = (r, a=0.15) => { g.lineStyle(1.5, col, a); const pts=[]; for(let i=0;i<6;i++){const an=i*Math.PI/3-Math.PI/6; pts.push({x:cx+Math.cos(an)*r,y:cy+Math.sin(an)*r});} g.strokePoints(pts, true); };
    hex(9, 0.8); hex(5, 0.5);
    g.fillStyle(col, 1); g.fillCircle(cx, cy, 2);
  },

  // ── Dreadnaught-only perks ───────────────────────────────────────────────
  // Siege Cannons — three thick barrel shapes
  'Siege Cannons':       (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillRect(cx - 1, cy - 9, 3, 12);
    g.fillStyle(col, 0.7);
    g.fillRect(cx - 6, cy - 6, 3, 9);
    g.fillRect(cx + 4, cy - 6, 3, 9);
    g.lineStyle(1, col, 0.4); g.lineBetween(cx - 8, cy + 3, cx + 9, cy + 3);
  },
  // Orbital Strike — planet with beam
  'Orbital Strike':      (g, cx, cy, col) => {
    g.fillStyle(col, 0.2); g.fillCircle(cx, cy - 2, 7);
    g.lineStyle(1.5, col, 0.9); g.strokeCircle(cx, cy - 2, 7);
    g.fillStyle(col, 1); g.fillRect(cx - 1, cy + 5, 3, 6);
    g.fillTriangle(cx, cy + 11, cx - 3, cy + 6, cx + 3, cy + 6);
  },
  // Mass Driver — single massive accelerator
  'Mass Driver':         (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillRect(cx - 2, cy - 9, 4, 14);
    g.fillStyle(col, 0.5); g.fillRect(cx - 5, cy - 4, 11, 4);
    g.fillStyle(col, 1); g.fillCircle(cx, cy + 7, 3);
  },
  // Living Fortress — castle tower
  'Living Fortress':     (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillRect(cx - 7, cy - 4, 14, 12);
    g.fillRect(cx - 7, cy - 8, 3, 5); g.fillRect(cx - 1, cy - 8, 3, 5); g.fillRect(cx + 4, cy - 8, 3, 5);
    g.fillStyle(0x080c14, 1); g.fillRect(cx - 2, cy + 1, 5, 7);
  },

  // ── Flagship-only perks ──────────────────────────────────────────────────
  // Command Aura — radiating flag/beacon
  'Command Aura':        (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx, cy - 9, cx - 6, cy - 1, cx + 6, cy - 1);
    g.fillTriangle(cx - 6, cy - 1, cx + 6, cy - 1, cx, cy + 9);
    g.fillStyle(0xffffff, 0.9); g.fillCircle(cx, cy, 2);
    g.lineStyle(1, col, 0.4); g.strokeCircle(cx, cy, 11);
  },
  // Emergency Shield — shield with lightning bolt
  'Emergency Shield':    (g, cx, cy, col) => {
    g.fillStyle(col, 0.2); g.fillTriangle(cx, cy + 9, cx - 8, cy - 6, cx + 8, cy - 6);
    g.lineStyle(2, col, 1); g.strokeTriangle(cx, cy + 9, cx - 8, cy - 6, cx + 8, cy - 6);
    g.fillStyle(col, 1);
    g.fillTriangle(cx + 2, cy - 4, cx - 2, cy + 1, cx + 1, cy + 1);
    g.fillTriangle(cx - 1, cy + 1, cx - 3, cy + 6, cx + 2, cy + 1);
  },
  // Rally Beacon — flag on pole
  'Rally Beacon':        (g, cx, cy, col) => {
    g.lineStyle(2, col, 1); g.lineBetween(cx - 3, cy - 9, cx - 3, cy + 9);
    g.fillStyle(col, 1);    g.fillTriangle(cx - 3, cy - 9, cx + 7, cy - 5, cx - 3, cy - 1);
    g.lineStyle(1, col, 0.5); g.lineBetween(cx - 7, cy + 9, cx + 5, cy + 9);
  },
  // Iron Reserve — resource chest / ingot stack
  'Iron Reserve':        (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillRect(cx - 8, cy + 2, 16, 6); g.fillRect(cx - 6, cy - 2, 12, 5); g.fillRect(cx - 4, cy - 6, 8, 5);
    g.fillStyle(0x080c14, 0.5); g.fillRect(cx - 6, cy + 3, 4, 4); g.fillRect(cx + 2, cy + 3, 4, 4);
  },
  // Naval Construction — ship under construction (girder outline)
  'Naval Construction':  (g, cx, cy, col) => {
    g.fillStyle(col, 0.5); g.fillTriangle(cx, cy - 7, cx - 7, cy + 5, cx + 7, cy + 5);
    g.lineStyle(1.5, col, 1);
    g.lineBetween(cx - 9, cy + 5, cx + 9, cy + 5);
    g.lineBetween(cx - 6, cy + 5, cx - 4, cy - 3);
    g.lineBetween(cx + 6, cy + 5, cx + 4, cy - 3);
    g.lineBetween(cx - 5, cy + 1, cx + 5, cy + 1);
  },
  // Spearhead — diamond arrowhead
  'Spearhead':           (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx, cy - 9, cx - 6, cy, cx + 6, cy);
    g.fillStyle(col, 0.6);
    g.fillTriangle(cx, cy - 3, cx - 4, cy + 5, cx + 4, cy + 5);
    g.fillStyle(col, 0.3);
    g.fillTriangle(cx - 2, cy + 3, cx - 5, cy + 9, cx + 5, cy + 9);
  },

  // ── Econ Buildings perks ─────────────────────────────────────────────────
  // Advanced Farming — leaf sprout
  'Advanced Farming':    (g, cx, cy, col) => {
    g.lineStyle(2, col, 1); g.lineBetween(cx, cy + 9, cx, cy - 2);
    g.fillStyle(col, 1);
    g.fillTriangle(cx, cy - 8, cx - 7, cy + 0, cx + 1, cy + 0);
    g.fillTriangle(cx, cy - 2, cx - 1, cy + 4, cx + 7, cy - 1);
  },
  // Efficient Smelting — anvil shape
  'Efficient Smelting':  (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillRect(cx - 7, cy + 2, 14, 6);
    g.fillRect(cx - 5, cy - 4, 10, 7);
    g.fillRect(cx - 2, cy - 8, 5, 5);
  },
  // Fusion Tap — fuel cell / cylinder
  'Fusion Tap':          (g, cx, cy, col) => {
    g.fillStyle(col, 1); g.fillEllipse(cx, cy - 6, 12, 5);
    g.fillRect(cx - 6, cy - 6, 12, 12);
    g.fillEllipse(cx, cy + 6, 12, 5);
    g.fillStyle(0x080c14, 0.6); g.fillEllipse(cx, cy - 6, 8, 3);
  },
  // Supply Network — nodes connected by lines
  'Supply Network':      (g, cx, cy, col) => {
    g.lineStyle(1.5, col, 0.7);
    g.lineBetween(cx, cy - 7, cx - 7, cy + 5); g.lineBetween(cx, cy - 7, cx + 7, cy + 5); g.lineBetween(cx - 7, cy + 5, cx + 7, cy + 5);
    g.fillStyle(col, 1);
    g.fillCircle(cx, cy - 7, 3); g.fillCircle(cx - 7, cy + 5, 3); g.fillCircle(cx + 7, cy + 5, 3);
  },
  // Megaplex — large building with star
  'Megaplex':            (g, cx, cy, col) => {
    g.fillStyle(col, 1); g.fillRect(cx - 7, cy - 4, 14, 12);
    g.fillStyle(0x080c14, 1); g.fillRect(cx - 5, cy - 2, 4, 4); g.fillRect(cx + 1, cy - 2, 4, 4);
    g.fillStyle(col, 1); g.fillTriangle(cx, cy - 10, cx - 3, cy - 5, cx + 3, cy - 5);
  },
  // Balanced Logistics — balance scales
  'Balanced Logistics':  (g, cx, cy, col) => {
    g.lineStyle(1.5, col, 1);
    g.lineBetween(cx, cy - 8, cx, cy + 6);
    g.lineBetween(cx - 8, cy - 3, cx + 8, cy - 3);
    g.lineBetween(cx - 8, cy - 3, cx - 8, cy + 1);
    g.lineBetween(cx + 8, cy - 3, cx + 8, cy + 1);
    g.fillStyle(col, 0.7); g.fillEllipse(cx - 8, cy + 3, 7, 4); g.fillEllipse(cx + 8, cy + 3, 7, 4);
    g.lineStyle(1, col, 0.4); g.lineBetween(cx - 6, cy + 8, cx + 6, cy + 8);
  },
  // Deep Excavation — drill bit
  'Deep Excavation':     (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx, cy + 9, cx - 4, cy - 2, cx + 4, cy - 2);
    g.fillRect(cx - 4, cy - 8, 8, 7);
    g.fillStyle(col, 0.5);
    g.fillRect(cx - 6, cy - 9, 12, 2);
  },
  // Bunker Economy — fortified vault door
  'Bunker Economy':      (g, cx, cy, col) => {
    g.fillStyle(col, 1); g.fillRoundedRect(cx - 8, cy - 8, 16, 16, 2);
    g.fillStyle(0x080c14, 1); g.fillCircle(cx, cy, 5);
    g.fillStyle(col, 1); g.fillCircle(cx, cy, 2);
    g.lineStyle(1.5, 0x080c14, 1);
    g.lineBetween(cx - 3, cy - 3, cx + 3, cy + 3);
    g.lineBetween(cx + 3, cy - 3, cx - 3, cy + 3);
  },
  // Trade Routes — two arrows exchanging
  'Trade Routes':        (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx + 8, cy - 4, cx + 3, cy - 8, cx + 3, cy - 1);
    g.lineStyle(2, col, 1); g.lineBetween(cx + 3, cy - 5, cx - 6, cy - 5);
    g.fillStyle(col, 1);
    g.fillTriangle(cx - 8, cy + 4, cx - 3, cy + 8, cx - 3, cy + 1);
    g.lineStyle(2, col, 1); g.lineBetween(cx - 3, cy + 5, cx + 6, cy + 5);
  },
  // Enriched Mining — asteroid with sparkle
  'Enriched Mining':     (g, cx, cy, col) => {
    g.fillStyle(col, 0.6); g.fillCircle(cx - 1, cy, 7);
    g.fillStyle(col, 1);
    g.fillTriangle(cx + 5, cy - 6, cx + 4, cy - 3, cx + 7, cy - 3);
    g.fillTriangle(cx + 7, cy - 5, cx + 4, cy - 5, cx + 4, cy - 2);
  },

  // ── Econ Ships perks ─────────────────────────────────────────────────────
  // Improved Drills — drill icon
  'Improved Drills':     (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx, cy + 9, cx - 3, cy - 2, cx + 3, cy - 2);
    g.fillRect(cx - 4, cy - 8, 8, 7);
    g.fillStyle(col, 0.5); g.fillRect(cx - 6, cy - 10, 12, 3);
    g.lineStyle(1, col, 0.7); g.lineBetween(cx - 5, cy, cx + 5, cy);
  },
  // Cargo Hold Mk II — crate with + mark
  'Cargo Hold Mk II':    (g, cx, cy, col) => {
    g.fillStyle(col, 0.2); g.fillRect(cx - 8, cy - 7, 16, 14);
    g.lineStyle(2, col, 1); g.strokeRect(cx - 8, cy - 7, 16, 14);
    g.lineStyle(1.5, col, 0.7); g.lineBetween(cx, cy - 7, cx, cy + 7); g.lineBetween(cx - 8, cy, cx + 8, cy);
  },
  // Extended Range — expanding circles
  'Extended Range':      (g, cx, cy, col) => {
    g.fillStyle(col, 1); g.fillCircle(cx, cy, 2);
    g.lineStyle(1.5, col, 0.7); g.strokeCircle(cx, cy, 5);
    g.lineStyle(1.5, col, 0.4); g.strokeCircle(cx, cy, 9);
  },
  // Dual Miner Bays — two miner ships
  'Dual Miner Bays':     (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx - 5, cy - 7, cx - 9, cy + 3, cx - 1, cy + 3);
    g.fillTriangle(cx + 5, cy - 7, cx + 1, cy + 3, cx + 9, cy + 3);
    g.fillStyle(0x080c14, 1); g.fillCircle(cx - 5, cy - 1, 2); g.fillCircle(cx + 5, cy - 1, 2);
    g.lineStyle(1, col, 0.5); g.lineBetween(cx - 2, cy + 5, cx + 2, cy + 5);
  },
  // Rich Vein Scanner — scanner sweep
  'Rich Vein Scanner':   (g, cx, cy, col) => {
    g.fillStyle(col, 0.15); g.slice(cx, cy + 2, 9, -Math.PI * 0.9, -Math.PI * 0.1, false); g.fillPath();
    g.lineStyle(1.5, col, 1); g.strokeCircle(cx, cy + 2, 9);
    g.lineStyle(2, col, 0.9); g.lineBetween(cx, cy + 2, cx - 6, cy - 5);
    g.fillStyle(col, 1); g.fillCircle(cx, cy + 2, 2);
  },
  // Deep Core Mining — multiple drill bits
  'Deep Core Mining':    (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx - 5, cy + 8, cx - 8, cy - 1, cx - 2, cy - 1);
    g.fillTriangle(cx + 5, cy + 8, cx + 2, cy - 1, cx + 8, cy - 1);
    g.fillRect(cx - 7, cy - 7, 5, 7); g.fillRect(cx + 2, cy - 7, 5, 7);
    g.fillStyle(col, 0.5); g.fillRect(cx - 9, cy - 9, 9, 2); g.fillRect(cx, cy - 9, 9, 2);
  },
  // Meteor Harvesting — meteor with catch net
  'Meteor Harvesting':   (g, cx, cy, col) => {
    g.fillStyle(col, 0.7); g.fillCircle(cx - 3, cy - 2, 5);
    g.lineStyle(1.5, col, 0.6);
    for (let i = 0; i < 5; i++) { const a = i * Math.PI / 4 + Math.PI / 4; g.lineBetween(cx - 3 + Math.cos(a) * 5, cy - 2 + Math.sin(a) * 5, cx + 5, cy + 6); }
  },
  // Scout Drones — small diamond probe
  'Scout Drones':        (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx, cy - 9, cx - 4, cy, cx + 4, cy);
    g.fillTriangle(cx - 4, cy, cx + 4, cy, cx, cy + 9);
    g.fillStyle(0x080c14, 1); g.fillCircle(cx, cy, 3);
    g.lineStyle(1, col, 0.6); g.lineBetween(cx - 8, cy - 4, cx - 5, cy - 1); g.lineBetween(cx + 8, cy - 4, cx + 5, cy - 1);
  },
  // Fuel Skimming — flame with droplet
  'Fuel Skimming':       (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillTriangle(cx, cy - 8, cx - 5, cy + 2, cx + 5, cy + 2);
    g.fillStyle(col, 0.5); g.fillTriangle(cx, cy - 3, cx - 3, cy + 5, cx + 3, cy + 5);
    g.fillStyle(col, 1); g.fillCircle(cx, cy + 7, 3);
    g.fillStyle(0x080c14, 0.5); g.fillCircle(cx, cy + 7, 1.5);
  },
  // Fleet Resupply — supply arrow to ship
  'Fleet Resupply':      (g, cx, cy, col) => {
    g.fillStyle(col, 0.6); g.fillTriangle(cx + 2, cy - 7, cx - 2, cy + 3, cx + 6, cy + 3);
    g.fillStyle(col, 1);
    g.fillTriangle(cx - 8, cy + 1, cx - 4, cy - 4, cx - 4, cy + 6);
    g.lineStyle(2, col, 0.8); g.lineBetween(cx - 4, cy + 1, cx + 2, cy + 1);
  },

  // ── Defense perks ────────────────────────────────────────────────────────
  // Flak Batteries — burst pattern
  'Flak Batteries':      (g, cx, cy, col) => {
    g.fillStyle(col, 1); g.fillCircle(cx, cy, 3);
    g.lineStyle(2, col, 0.8);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.lineBetween(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, cx + Math.cos(a) * 9, cy + Math.sin(a) * 9); }
  },
  // Reinforced Bunkers — thick walled square
  'Reinforced Bunkers':  (g, cx, cy, col) => {
    g.fillStyle(col, 1); g.fillRect(cx - 8, cy - 8, 16, 16);
    g.fillStyle(0x080c14, 1); g.fillRect(cx - 5, cy - 5, 10, 10);
    g.fillStyle(col, 0.6); g.fillRect(cx - 3, cy - 3, 6, 6);
  },
  // Missile Screen — incoming missile with X
  'Missile Screen':      (g, cx, cy, col) => {
    g.fillStyle(col, 1); g.fillTriangle(cx - 8, cy, cx - 2, cy - 3, cx - 2, cy + 3);
    g.lineStyle(2, col, 1); g.lineBetween(cx + 1, cy - 7, cx + 8, cy + 7);
    g.lineStyle(2.5, col, 1);
    g.lineBetween(cx - 1, cy - 5, cx + 6, cy + 4);
    g.lineBetween(cx + 6, cy - 5, cx - 1, cy + 4);
  },
  // Shield Grid — hex lattice
  'Shield Grid':         (g, cx, cy, col) => {
    g.lineStyle(1.5, col, 0.9);
    const pts = []; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 6; pts.push({ x: cx + Math.cos(a) * 9, y: cy + Math.sin(a) * 9 }); }
    g.strokePoints(pts, true);
    g.lineStyle(1, col, 0.4); for (const p of pts) g.lineBetween(cx, cy, p.x, p.y);
    g.fillStyle(col, 0.8); g.fillCircle(cx, cy, 2);
  },
  // Planetary Cannon — gun barrel pointing out
  'Planetary Cannon':    (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillRect(cx - 2, cy - 9, 4, 10);
    g.fillRect(cx - 6, cy - 2, 12, 5);
    g.fillStyle(col, 0.5); g.fillCircle(cx, cy + 6, 4);
    g.fillStyle(col, 1); g.fillCircle(cx, cy + 6, 2);
  },
  // Fortress World — planet with shield band
  'Fortress World':      (g, cx, cy, col) => {
    g.fillStyle(col, 0.2); g.fillCircle(cx, cy, 8);
    g.lineStyle(2, col, 0.9); g.strokeCircle(cx, cy, 8);
    g.lineStyle(2.5, col, 1); g.strokeEllipse(cx, cy, 22, 8);
  },
  // Point Defence Net — interconnected small shields
  'Point Defence Net':   (g, cx, cy, col) => {
    g.lineStyle(1, col, 0.5); g.strokeCircle(cx, cy, 9);
    g.fillStyle(col, 1);
    const pts2 = [[cx, cy-9],[cx-8,cy+5],[cx+8,cy+5]];
    for (const [px, py] of pts2) { g.fillTriangle(px, py-4, px-3, py+2, px+3, py+2); }
    g.lineStyle(1, col, 0.4);
    g.lineBetween(pts2[0][0], pts2[0][1], pts2[1][0], pts2[1][1]);
    g.lineBetween(pts2[1][0], pts2[1][1], pts2[2][0], pts2[2][1]);
    g.lineBetween(pts2[0][0], pts2[0][1], pts2[2][0], pts2[2][1]);
  },
  // Counter Battery — two cannons facing each other
  'Counter Battery':     (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillRect(cx - 9, cy - 3, 7, 4);
    g.fillRect(cx + 2, cy - 3, 7, 4);
    g.fillCircle(cx - 7, cy + 3, 3); g.fillCircle(cx + 7, cy + 3, 3);
    g.lineStyle(1.5, col, 0.6); g.lineBetween(cx, cy - 1, cx, cy + 6);
  },
  // Hardened Silos — silo with armour tick
  'Hardened Silos':      (g, cx, cy, col) => {
    g.fillStyle(col, 1);
    g.fillRect(cx - 5, cy - 6, 10, 14);
    g.fillEllipse(cx, cy - 6, 10, 5);
    g.fillStyle(0x080c14, 1); g.fillRect(cx - 3, cy, 6, 8);
    g.lineStyle(2, col, 1); g.lineBetween(cx - 4, cy + 4, cx - 1, cy + 8); g.lineBetween(cx - 1, cy + 8, cx + 5, cy + 0);
  },
  // Evacuation Drill — arrow departing from circle
  'Evacuation Drill':    (g, cx, cy, col) => {
    g.lineStyle(1.5, col, 0.7); g.strokeCircle(cx - 3, cy + 1, 6);
    g.fillStyle(col, 1);
    g.fillTriangle(cx + 8, cy - 4, cx + 3, cy - 7, cx + 8, cy - 1);
    g.lineStyle(2, col, 1); g.lineBetween(cx + 1, cy - 4, cx + 7, cy - 4);
  },
};


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
      { id: 'f_01', name: 'Rapid Scramble',     icon: PERK_ICONS['Rapid Scramble'],     desc: 'Fighters launch 30% faster from Naval Bases.' },
      { id: 'f_02', name: 'Dense Formation',    icon: PERK_ICONS['Dense Formation'],    desc: 'Each Fighter gains +1 attack damage.', tested: true },
      { id: 'f_03', name: 'Afterburner',        icon: PERK_ICONS['Afterburner'],        desc: 'Each Fighter increases stack movement speed by 2.5%.' },
      { id: 'f_04', name: 'Wingman Protocol',   icon: PERK_ICONS['Wingman Protocol'],   desc: 'Each Fighter has a 10% chance to dodge one hit per Main Strike phase.' },
      { id: 'f_05', name: 'Ace Pilots',         icon: PERK_ICONS['Ace Pilots'],         desc: 'Each Fighter deals double damage against Destroyers.' },
      { id: 'f_06', name: 'Swarm Tactics',      icon: PERK_ICONS['Swarm Tactics'],      desc: 'Each Fighter gains +1 attack when in a stack of only Fighters.' },
      { id: 'f_07', name: 'Interceptor Role',   icon: PERK_ICONS['Interceptor Role'],   desc: 'Each Fighter destroyed by Pre-Strike abilities deals its damage back to the attacker in the Pre-Strike Resolution phase.' },
      { id: 'f_08', name: 'First Strike',       icon: PERK_ICONS['First Strike'],       desc: 'Each Fighter gains a Pre-Strike of 1 damage.' },
      { id: 'f_09', name: 'Air Superiority',    icon: PERK_ICONS['Air Superiority'],    desc: 'Stack of Fighters gains +1 attack per adjacent friendly planet.' },
      { id: 'f_10', name: 'Kamikaze Protocol',  icon: PERK_ICONS['Kamikaze Protocol'],  desc: 'Each Fighter destroyed in combat has a 50% chance to deal its damage to the attacker in the Main Strike Resolution phase.' },
    ],
  },
  {
    id: 'destroyer', label: 'DESTROYER',
    color: 0xaa66ff, hex: '#aa66ff',
    icon: SHIP_ICONS.destroyer,
    root: { id: 'destroyer_root', name: 'Destroyer Wing',
            desc: 'Base destroyer doctrine — pre-strike kills 2 enemy fighters before combat.', tested: true },
    pool: [
      { id: 'd_01', name: 'Improved Barrage',  icon: PERK_ICONS['Improved Barrage'],  desc: 'Pre-strike kills 3 Fighters instead of 2.', tested: true },
      { id: 'd_02', name: 'Reinforced Hull',   icon: PERK_ICONS['Reinforced Hull'],   desc: 'Each Destroyer gains +10 HP.', tested: true },
      { id: 'd_03', name: 'Rapid Scramble',    icon: PERK_ICONS['Rapid Scramble'],    desc: 'Destroyers launch 30% faster from Destroyer Factories.' },
      { id: 'd_04', name: 'Hunter Protocol',   icon: PERK_ICONS['Hunter Protocol'],   desc: 'Each Destroyer deals +2 damage against Dreadnaughts and Flagships.' },
      { id: 'd_05', name: 'Torpedo Spread',    icon: PERK_ICONS['Torpedo Spread'],    desc: 'Each Destroyer Pre-Strike can hit non-Fighter ships for 15 damage.' },
      { id: 'd_06', name: 'Last Stand',        icon: PERK_ICONS['Last Stand'],        desc: 'Each Destroyer deals +2 damage when their stack is outnumbered.' },
      { id: 'd_07', name: 'Ace Pilots',        icon: PERK_ICONS['Ace Pilots'],        desc: 'Each Destroyer deals double damage against other Destroyers.' },
      { id: 'd_08', name: 'Dense Formation',   icon: PERK_ICONS['Dense Formation'],   desc: 'Each Destroyer gains +1 attack damage.', tested: true },
      { id: 'd_09', name: 'Wingman Protocol',  icon: PERK_ICONS['Wingman Protocol'],  desc: 'Each Destroyer has a 10% chance to dodge one hit per Main Strike phase.' },
      { id: 'd_10', name: 'Hit and Run',       icon: PERK_ICONS['Hit and Run'],       desc: 'Destroyers may retreat after Pre-Strike without entering Main Strike.' },
    ],
  },
  {
    id: 'cruiser', label: 'CRUISER',
    color: 0x44ddaa, hex: '#44ddaa',
    icon: SHIP_ICONS.cruiser,
    root: { id: 'cruiser_root', name: 'Cruiser Fleet',
            desc: 'Base cruiser doctrine — 50% repair chance on destruction.', tested: true },
    pool: [
      { id: 'c_01', name: 'Field Medics',       icon: PERK_ICONS['Field Medics'],       desc: 'Cruiser repair chance increases from 50% to 65%.' },
      { id: 'c_02', name: 'Reinforced Hull',    icon: PERK_ICONS['Reinforced Hull'],    desc: 'Each Cruiser gains +10 HP.', tested: true },
      { id: 'c_03', name: 'Nanite Repair',      icon: PERK_ICONS['Nanite Repair'],      desc: 'Repaired Cruisers return at full health.' },
      { id: 'c_04', name: 'Escort Formation',   icon: PERK_ICONS['Escort Formation'],   desc: 'Each Cruiser absorbs one hit directed at the Flagship per Main Strike round.' },
      { id: 'c_05', name: 'Regeneration Field', icon: PERK_ICONS['Regeneration Field'], desc: 'Each friendly ship in a stack with a Cruiser gains +5 HP.' },
      { id: 'c_06', name: 'Hunter Protocol',    icon: PERK_ICONS['Hunter Protocol'],    desc: 'Each Cruiser deals +5 damage against Dreadnaughts and Flagships.' },
      { id: 'c_07', name: 'Ace Pilots',         icon: PERK_ICONS['Ace Pilots'],         desc: 'Each Cruiser deals double damage against Destroyers.' },
      { id: 'c_08', name: 'Rapid Scramble',     icon: PERK_ICONS['Rapid Scramble'],     desc: 'Cruisers launch 30% faster from Cruiser Factories.' },
      { id: 'c_09', name: 'Shielded Core',      icon: PERK_ICONS['Shielded Core'],      desc: 'Each Cruiser takes −10 damage from Pre-Strike attacks.' },
      { id: 'c_10', name: 'Last Stand',         icon: PERK_ICONS['Last Stand'],         desc: 'Each Cruiser deals +2 damage when their stack is outnumbered.' },
    ],
  },
  {
    id: 'dreadnaught', label: 'DREADNAUGHT',
    color: 0xff8844, hex: '#ff8844',
    icon: SHIP_ICONS.dreadnaught,
    root: { id: 'dreadnaught_root', name: 'Dreadnaught Armada',
            desc: 'Base capital doctrine — 20 damage × 2 attacks, 50 HP.', tested: true },
    pool: [
      { id: 'dr_01', name: 'Siege Cannons',   icon: PERK_ICONS['Siege Cannons'],   desc: 'Each Dreadnaught\'s attack increases by +5 damage.' },
      { id: 'dr_02', name: 'Reinforced Hull', icon: PERK_ICONS['Reinforced Hull'], desc: 'Each Dreadnaught gains +15 HP.', tested: true },
      { id: 'dr_03', name: 'Orbital Strike',  icon: PERK_ICONS['Orbital Strike'],  desc: 'Dreadnaught stacks deal 5 Pre-Strike damage to all enemies.' },
      { id: 'dr_04', name: 'Afterburner',     icon: PERK_ICONS['Afterburner'],     desc: 'Each Dreadnaught increases stack movement speed by 10%.' },
      { id: 'dr_05', name: 'Mass Driver',     icon: PERK_ICONS['Mass Driver'],     desc: 'When a Dreadnaught is alone in a stack, its attacks count as 30 damage × 3.' },
      { id: 'dr_06', name: 'Wingman Protocol',icon: PERK_ICONS['Wingman Protocol'],desc: 'Each Dreadnaught has a 10% chance to dodge one hit per Main Strike phase.' },
      { id: 'dr_07', name: 'Last Stand',      icon: PERK_ICONS['Last Stand'],      desc: 'Each Dreadnaught deals +5 damage when their stack is outnumbered.' },
      { id: 'dr_08', name: 'Rapid Scramble',  icon: PERK_ICONS['Rapid Scramble'],  desc: 'Dreadnaughts launch 30% faster from Dreadnaught Factories.' },
      { id: 'dr_09', name: 'First Strike',    icon: PERK_ICONS['First Strike'],    desc: 'Each Dreadnaught gains a Pre-Strike of 3 damage.' },
      { id: 'dr_10', name: 'Living Fortress', icon: PERK_ICONS['Living Fortress'], desc: 'Each Dreadnaught defending a planet gains +20 HP.' },
    ],
  },
  {
    id: 'flagship', label: 'FLAGSHIP',
    color: 0xffdd44, hex: '#ffdd44',
    icon: SHIP_ICONS.flagship,
    root: { id: 'flagship_root', name: 'Command Ship',
            desc: 'Command protocols — flagship is the last unit destroyed; losing it ends the game.', tested: true },
    pool: [
      { id: 'fl_01', name: 'Command Aura',      icon: PERK_ICONS['Command Aura'],      desc: 'All ships in the Flagship\'s stack gain +1 attack.', tested: true },
      { id: 'fl_02', name: 'Emergency Shield',  icon: PERK_ICONS['Emergency Shield'],  desc: 'Flagship survives one lethal hit per battle.' },
      { id: 'fl_03', name: 'Rally Beacon',      icon: PERK_ICONS['Rally Beacon'],      desc: 'Stacks containing a Flagship have movement speed increased by 50%.' },
      { id: 'fl_04', name: 'Reinforced Hull',   icon: PERK_ICONS['Reinforced Hull'],   desc: 'Each Flagship gains +50 HP.', tested: true },
      { id: 'fl_05', name: 'Last Stand',        icon: PERK_ICONS['Last Stand'],        desc: 'Each Flagship deals +10 damage and attacks 1 additional time when their stack is outnumbered.' },
      { id: 'fl_06', name: 'First Strike',      icon: PERK_ICONS['First Strike'],      desc: 'Each Flagship gains a Pre-Strike of 20 damage.' },
      { id: 'fl_07', name: 'Iron Reserve',      icon: PERK_ICONS['Iron Reserve'],      desc: 'Each Flagship generates +5 Food, Metal, and Fuel per resource tick.' },
      { id: 'fl_08', name: 'Hunter Protocol',   icon: PERK_ICONS['Hunter Protocol'],   desc: 'Each Flagship deals +15 damage against Dreadnaughts and Flagships.' },
      { id: 'fl_09', name: 'Naval Construction',icon: PERK_ICONS['Naval Construction'],desc: 'Each Flagship produces 1 Fighter every 30 seconds.' },
      { id: 'fl_10', name: 'Spearhead',         icon: PERK_ICONS['Spearhead'],         desc: 'Each Flagship gains a Pre-Strike of 10 damage directed at an enemy Flagship, or a random ship if no enemy Flagship is present.' },
    ],
  },
  {
    id: 'econ_buildings', label: 'ECON BUILDINGS',
    color: 0x44ffdd, hex: '#44ffdd',
    icon: SHIP_ICONS.econ_buildings,
    root: { id: 'econ_buildings_root', name: 'Basic Infrastructure',
            desc: 'Standard economic building slate — Farms, Extractors, and Mines available.', tested: true },
    pool: [
      { id: 'eb_01', name: 'Advanced Farming',   icon: PERK_ICONS['Advanced Farming'],   desc: 'Farms produce +2 Food per tick instead of +1.' },
      { id: 'eb_02', name: 'Efficient Smelting', icon: PERK_ICONS['Efficient Smelting'], desc: 'Metal Extractors produce +2 Metal per tick.' },
      { id: 'eb_03', name: 'Fusion Tap',         icon: PERK_ICONS['Fusion Tap'],         desc: 'Fuel Extractors produce +2 Fuel per tick.' },
      { id: 'eb_04', name: 'Supply Network',     icon: PERK_ICONS['Supply Network'],     desc: 'Resource buildings on adjacent player-owned planets each share +1 yield with neighbours.' },
      { id: 'eb_05', name: 'Megaplex',           icon: PERK_ICONS['Megaplex'],           desc: 'All resource buildings on a fully developed planet produce triple yield.' },
      { id: 'eb_06', name: 'Balanced Logistics', icon: PERK_ICONS['Balanced Logistics'], desc: 'Planets gain +1 production of their least produced resource per tick, excluding ties.' },
      { id: 'eb_07', name: 'Deep Excavation',    icon: PERK_ICONS['Deep Excavation'],    desc: 'Each Barren planet increases base resource values by 1 for Food, Metal, and Fuel.' },
      { id: 'eb_08', name: 'Bunker Economy',     icon: PERK_ICONS['Bunker Economy'],     desc: 'Resource buildings cannot be destroyed by meteor impact.' },
      { id: 'eb_09', name: 'Trade Routes',       icon: PERK_ICONS['Trade Routes'],       desc: 'All stack movement between adjacent player-owned planets is increased by 20%.' },
      { id: 'eb_10', name: 'Enriched Mining',    icon: PERK_ICONS['Enriched Mining'],    desc: 'Asteroid Miners yield 20% more resources per trip.' },
    ],
  },
  {
    id: 'econ_ships', label: 'ECON SHIPS',
    color: 0x44ffdd, hex: '#44ffdd',
    icon: SHIP_ICONS.econ_ships,
    root: { id: 'econ_ships_root', name: 'Mining Doctrine',
            desc: 'Asteroid mining operations — Asteroid Miner unit available.', tested: true },
    pool: [
      { id: 'es_01', name: 'Improved Drills',   icon: PERK_ICONS['Improved Drills'],   desc: 'Mining time reduced from 4s to 2.5s.' },
      { id: 'es_02', name: 'Cargo Hold Mk II',  icon: PERK_ICONS['Cargo Hold Mk II'],  desc: 'Miners carry 50% more resources per trip.' },
      { id: 'es_03', name: 'Extended Range',    icon: PERK_ICONS['Extended Range'],    desc: 'Miner patrol radius increases from 160px to 240px.' },
      { id: 'es_04', name: 'Dual Miner Bays',   icon: PERK_ICONS['Dual Miner Bays'],   desc: 'Asteroid Mine buildings deploy 2 miners instead of 1.' },
      { id: 'es_05', name: 'Rich Vein Scanner', icon: PERK_ICONS['Rich Vein Scanner'], desc: 'Miners detect Rich Asteroids from twice the normal range.' },
      { id: 'es_06', name: 'Deep Core Mining',  icon: PERK_ICONS['Deep Core Mining'],  desc: 'All asteroid resource yields are doubled.' },
      { id: 'es_07', name: 'Meteor Harvesting', icon: PERK_ICONS['Meteor Harvesting'], desc: 'Miners that intercept meteors gain a 50% resource bonus on the yield.' },
      { id: 'es_08', name: 'Scout Drones',      icon: PERK_ICONS['Scout Drones'],      desc: 'Asteroid Miners reveal the contents of nearby asteroids before flying out.' },
      { id: 'es_09', name: 'Fuel Skimming',     icon: PERK_ICONS['Fuel Skimming'],     desc: 'Each asteroid mined generates +5 bonus Fuel regardless of asteroid type.' },
      { id: 'es_10', name: 'Fleet Resupply',    icon: PERK_ICONS['Fleet Resupply'],    desc: 'Depositing a full cargo load generates +2 of each resource for every friendly ship at the home planet.' },
    ],
  },
  {
    id: 'defense', label: 'DEFENSE',
    color: 0xff6688, hex: '#ff6688',
    icon: SHIP_ICONS.defense,
    root: { id: 'defense_root', name: 'Planetary Shields',
            desc: 'Orbital defense basics — planets with defensive buildings resist meteor impact.', tested: true },
    pool: [
      { id: 'de_01', name: 'Flak Batteries',    icon: PERK_ICONS['Flak Batteries'],    desc: 'Planetary defense buildings intercept meteors from 1.5× their normal range.' },
      { id: 'de_02', name: 'Reinforced Bunkers',icon: PERK_ICONS['Reinforced Bunkers'],desc: 'Meteor impact damage reduced from 30% to 20% per unit.' },
      { id: 'de_03', name: 'Missile Screen',    icon: PERK_ICONS['Missile Screen'],    desc: 'Planetary defense automatically intercepts one incoming enemy missile per battle.' },
      { id: 'de_04', name: 'Shield Grid',       icon: PERK_ICONS['Shield Grid'],       desc: 'Defending units take −1 damage per attack when at a fortified planet.' },
      { id: 'de_05', name: 'Planetary Cannon',  icon: PERK_ICONS['Planetary Cannon'],  desc: 'Defense buildings deal 2 damage per 10 seconds to enemy stacks at adjacent nodes.' },
      { id: 'de_06', name: 'Fortress World',    icon: PERK_ICONS['Fortress World'],    desc: 'A planet with a defense building cannot be captured while it is active and powered.' },
      { id: 'de_07', name: 'Point Defence Net', icon: PERK_ICONS['Point Defence Net'], desc: 'Defense buildings protect all adjacent planets from meteor impact.' },
      { id: 'de_08', name: 'Counter Battery',   icon: PERK_ICONS['Counter Battery'],   desc: 'Defense buildings return fire on Missile Carrier attacks, dealing 1 damage to the source.' },
      { id: 'de_09', name: 'Hardened Silos',    icon: PERK_ICONS['Hardened Silos'],    desc: 'Buildings on defended planets survive one meteor impact without being destroyed.' },
      { id: 'de_10', name: 'Evacuation Drill',  icon: PERK_ICONS['Evacuation Drill'],  desc: 'When a defended planet is attacked, 30% of units retreat to an adjacent friendly node automatically.' },
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

      // Root icon (tree icon, centred left)
      if (isRoot) {
        const ig = this.add.graphics().setDepth(92);
        tree.icon(ig, NX + 18, y + R(NODE_H / 2), tree.color);
        T.push(ig);
      }

      // Perk icon — top-left of non-root node
      if (!isRoot && node.icon) {
        const ig = this.add.graphics().setDepth(92);
        const iconCol = unlocked
          ? Phaser.Display.Color.HexStringToColor(tree.hex).color
          : canUnlock ? 0x4a6a80 : 0x1e3040;
        node.icon(ig, NX + 14, y + R(NODE_H / 2) - 4, iconCol);
        T.push(ig);
      }

      // Name text — integer position, resolution 2 for crispness
      const nameX  = R(isRoot ? NX + 36 : NX + 30);
      const nameCol = unlocked ? tree.hex : canUnlock ? '#aaccdd' : '#2d4055';
      const nameTxt = this._makeTxt(nameX, y + 10, node.name,
        unlocked ? 'bold 11px monospace' : '11px monospace', nameCol, 92);
      nameTxt.setWordWrapWidth(NODE_W - (isRoot ? 48 : 44));
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

      // Red ✕ WIP badge — top-right corner of every non-root, non-tested node
      if (!isRoot && !node.tested) {
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
