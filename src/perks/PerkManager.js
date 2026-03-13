// ══════════════════════════════════════════════════════════════════════════════
// PerkManager — owns all perk effect logic and per-team unlock state.
//
// PERMANENT STAT PERKS (apply once on research):
//   Reinforced Hull — +HP to affected ship type for that team's units
//
// COMBAT PHASE HOOKS (called by CombatManager each round):
//   getBarrageShots(unit, baseShots)   — Phase 1
//   buildAttackQueue(unit, baseQueue)  — Phase 3
//   getRepairChance(unit, baseChance)  — Phase 4
//
// TOOLTIP QUERY:
//   getPerksForUnit(team, shipType, composition) → [{name, desc}]
//   Returns only unlocked perks relevant to the given ship type.
// ══════════════════════════════════════════════════════════════════════════════

import { SHIP_STATS, SHIP_ORDER, recomputeMaxHP } from '../combat/CombatManager.js';

// ── Full perk catalogue: id → { name, desc, ships[] } ────────────────────────
// ships: which unit types this perk affects in tooltips.
// 'all' = shows on any ship type when flagship is present in the stack.
// []    = econ/defense perk — never appears in unit tooltips.
export const PERK_CATALOGUE = {
  // Fighter tree
  f_01:  { name: 'Rapid Scramble',     ships: ['fighter'],     desc: 'Fighters launch 30% faster from Naval Bases.' },
  f_02:  { name: 'Dense Formation',    ships: ['fighter'],     desc: 'Each Fighter gains +1 attack damage.' },
  f_03:  { name: 'Afterburner',        ships: ['fighter'],     desc: 'Each Fighter increases stack movement speed by 2.5%.' },
  f_04:  { name: 'Wingman Protocol',   ships: ['fighter'],     desc: '10% chance to dodge one hit per Main Strike phase.' },
  f_05:  { name: 'Ace Pilots',         ships: ['fighter'],     desc: 'Deals double damage against Destroyers.' },
  f_06:  { name: 'Swarm Tactics',      ships: ['fighter'],     desc: 'Gains +1 attack when the stack contains only Fighters.' },
  f_07:  { name: 'Interceptor Role',   ships: ['fighter'],     desc: 'When destroyed by Pre-Strike, deals damage back to the attacker.' },
  f_08:  { name: 'First Strike',       ships: ['fighter'],     desc: 'Gains a Pre-Strike hit of 1 damage.' },
  f_09:  { name: 'Air Superiority',    ships: ['fighter'],     desc: 'Stack gains +1 attack per adjacent friendly planet.' },
  f_10:  { name: 'Kamikaze Protocol',  ships: ['fighter'],     desc: '50% chance to deal damage to the attacker when destroyed.' },
  // Destroyer tree
  d_01:  { name: 'Improved Barrage',   ships: ['destroyer'],   desc: 'Pre-Strike kills 3 Fighters per Destroyer instead of 2.' },
  d_02:  { name: 'Reinforced Hull',    ships: ['destroyer'],   desc: '+10 HP per Destroyer.' },
  d_03:  { name: 'Rapid Scramble',     ships: ['destroyer'],   desc: 'Destroyers launch 30% faster from Destroyer Factories.' },
  d_04:  { name: 'Hunter Protocol',    ships: ['destroyer'],   desc: '+2 damage against Dreadnaughts and Flagships.' },
  d_05:  { name: 'Torpedo Spread',     ships: ['destroyer'],   desc: 'Pre-Strike can hit non-Fighter ships for 15 damage.' },
  d_06:  { name: 'Last Stand',         ships: ['destroyer'],   desc: '+2 damage when the stack is outnumbered.' },
  d_07:  { name: 'Ace Pilots',         ships: ['destroyer'],   desc: 'Deals double damage against other Destroyers.' },
  d_08:  { name: 'Dense Formation',    ships: ['destroyer'],   desc: 'Each Destroyer gains +1 attack damage.' },
  d_09:  { name: 'Wingman Protocol',   ships: ['destroyer'],   desc: '10% chance to dodge one hit per Main Strike phase.' },
  d_10:  { name: 'Hit and Run',        ships: ['destroyer'],   desc: 'May retreat after Pre-Strike without entering Main Strike.' },
  // Cruiser tree
  c_01:  { name: 'Field Medics',       ships: ['cruiser'],     desc: 'Repair chance on death increases from 50% to 65%.' },
  c_02:  { name: 'Reinforced Hull',    ships: ['cruiser'],     desc: '+10 HP per Cruiser.' },
  c_03:  { name: 'Nanite Repair',      ships: ['cruiser'],     desc: 'Repaired Cruisers return at full health.' },
  c_04:  { name: 'Escort Formation',   ships: ['cruiser'],     desc: 'Absorbs one hit directed at the Flagship per Main Strike round.' },
  c_05:  { name: 'Regeneration Field', ships: ['cruiser'],     desc: 'Each friendly ship in this stack gains +5 HP.' },
  c_06:  { name: 'Hunter Protocol',    ships: ['cruiser'],     desc: '+5 damage against Dreadnaughts and Flagships.' },
  c_07:  { name: 'Ace Pilots',         ships: ['cruiser'],     desc: 'Deals double damage against Destroyers.' },
  c_08:  { name: 'Rapid Scramble',     ships: ['cruiser'],     desc: 'Cruisers launch 30% faster from Cruiser Factories.' },
  c_09:  { name: 'Shielded Core',      ships: ['cruiser'],     desc: 'Takes −10 damage from Pre-Strike attacks.' },
  c_10:  { name: 'Last Stand',         ships: ['cruiser'],     desc: '+2 damage when the stack is outnumbered.' },
  // Dreadnaught tree
  dr_01: { name: 'Siege Cannons',      ships: ['dreadnaught'], desc: '+5 damage per attack.' },
  dr_02: { name: 'Reinforced Hull',    ships: ['dreadnaught'], desc: '+15 HP per Dreadnaught.' },
  dr_03: { name: 'Orbital Strike',     ships: ['dreadnaught'], desc: 'Stack deals 5 Pre-Strike damage to all enemies.' },
  dr_04: { name: 'Afterburner',        ships: ['dreadnaught'], desc: 'Each Dreadnaught increases stack movement speed by 10%.' },
  dr_05: { name: 'Mass Driver',        ships: ['dreadnaught'], desc: 'When alone in the stack, attacks count as 30 damage × 3.' },
  dr_06: { name: 'Wingman Protocol',   ships: ['dreadnaught'], desc: '10% chance to dodge one hit per Main Strike phase.' },
  dr_07: { name: 'Last Stand',         ships: ['dreadnaught'], desc: '+5 damage when the stack is outnumbered.' },
  dr_08: { name: 'Rapid Scramble',     ships: ['dreadnaught'], desc: 'Dreadnaughts launch 30% faster from Dreadnaught Factories.' },
  dr_09: { name: 'First Strike',       ships: ['dreadnaught'], desc: 'Gains a Pre-Strike hit of 3 damage.' },
  dr_10: { name: 'Living Fortress',    ships: ['dreadnaught'], desc: '+20 HP when defending a planet.' },
  // Flagship tree
  fl_01: { name: 'Command Aura',       ships: ['all'],         desc: 'All ships in this stack gain +1 attack damage.' },
  fl_02: { name: 'Emergency Shield',   ships: ['flagship'],    desc: 'Survives one lethal hit per battle.' },
  fl_03: { name: 'Rally Beacon',       ships: ['flagship'],    desc: 'Stacks containing a Flagship move 50% faster.' },
  fl_04: { name: 'Reinforced Hull',    ships: ['flagship'],    desc: '+50 HP per Flagship.' },
  fl_05: { name: 'Last Stand',         ships: ['flagship'],    desc: '+10 damage and 1 extra attack when the stack is outnumbered.' },
  fl_06: { name: 'First Strike',       ships: ['flagship'],    desc: 'Gains a Pre-Strike hit of 20 damage.' },
  fl_07: { name: 'Iron Reserve',       ships: ['flagship'],    desc: 'Generates +5 Food, Metal, and Fuel per resource tick.' },
  fl_08: { name: 'Hunter Protocol',    ships: ['flagship'],    desc: '+15 damage against Dreadnaughts and Flagships.' },
  fl_09: { name: 'Naval Construction', ships: ['flagship'],    desc: 'Produces 1 Fighter every 30 seconds.' },
  fl_10: { name: 'Spearhead',          ships: ['flagship'],    desc: 'Gains a Pre-Strike hit of 10 damage aimed at an enemy Flagship.' },
  // Econ Buildings — no ship types, never shown in unit tooltips
  eb_01: { name: 'Advanced Farming',   ships: [], desc: 'Farms produce +2 Food per tick instead of +1.' },
  eb_02: { name: 'Efficient Smelting', ships: [], desc: 'Metal Extractors produce +2 Metal per tick.' },
  eb_03: { name: 'Fusion Tap',         ships: [], desc: 'Fuel Extractors produce +2 Fuel per tick.' },
  eb_04: { name: 'Supply Network',     ships: [], desc: 'Adjacent owned planets each share +1 yield with neighbours.' },
  eb_05: { name: 'Megaplex',           ships: [], desc: 'All resource buildings on a fully developed planet produce triple yield.' },
  eb_06: { name: 'Balanced Logistics', ships: [], desc: 'Planets gain +1 of their least-produced resource per tick.' },
  eb_07: { name: 'Deep Excavation',    ships: [], desc: 'Each Barren planet increases base resource values by 1.' },
  eb_08: { name: 'Bunker Economy',     ships: [], desc: 'Resource buildings cannot be destroyed by meteor impact.' },
  eb_09: { name: 'Trade Routes',       ships: [], desc: 'Stack movement between adjacent owned planets is 20% faster.' },
  eb_10: { name: 'Enriched Mining',    ships: [], desc: 'Asteroid Miners yield 20% more resources per trip.' },
  // Econ Ships
  es_01: { name: 'Improved Drills',    ships: [], desc: 'Mining time reduced from 4s to 2.5s.' },
  es_02: { name: 'Cargo Hold Mk II',   ships: [], desc: 'Miners carry 50% more resources per trip.' },
  es_03: { name: 'Extended Range',     ships: [], desc: 'Miner patrol radius increases from 160px to 240px.' },
  es_04: { name: 'Dual Miner Bays',    ships: [], desc: 'Asteroid Mine buildings deploy 2 miners instead of 1.' },
  es_05: { name: 'Rich Vein Scanner',  ships: [], desc: 'Miners detect Rich Asteroids from twice the normal range.' },
  es_06: { name: 'Deep Core Mining',   ships: [], desc: 'All asteroid resource yields are doubled.' },
  es_07: { name: 'Meteor Harvesting',  ships: [], desc: 'Miners intercepting meteors gain a 50% resource bonus.' },
  es_08: { name: 'Scout Drones',       ships: [], desc: 'Miners reveal contents of nearby asteroids before flying out.' },
  es_09: { name: 'Fuel Skimming',      ships: [], desc: 'Each asteroid mined generates +5 bonus Fuel.' },
  es_10: { name: 'Fleet Resupply',     ships: [], desc: 'Full cargo deposit generates +2 of each resource per friendly ship at planet.' },
  // Defense
  de_01: { name: 'Flak Batteries',     ships: [], desc: 'Planetary defense intercepts meteors from 1.5× normal range.' },
  de_02: { name: 'Reinforced Bunkers', ships: [], desc: 'Meteor impact damage reduced from 30% to 20% per unit.' },
  de_03: { name: 'Missile Screen',     ships: [], desc: 'Planetary defense auto-intercepts one incoming enemy missile per battle.' },
  de_04: { name: 'Shield Grid',        ships: [], desc: 'Defending units take −1 damage per attack at a fortified planet.' },
  de_05: { name: 'Planetary Cannon',   ships: [], desc: 'Defense buildings deal 2 damage per 10s to enemy stacks at adjacent nodes.' },
  de_06: { name: 'Fortress World',     ships: [], desc: 'A planet with an active defense building cannot be captured.' },
  de_07: { name: 'Point Defence Net',  ships: [], desc: 'Defense buildings protect all adjacent planets from meteor impact.' },
  de_08: { name: 'Counter Battery',    ships: [], desc: 'Defense buildings return fire on Missile Carrier attacks for 1 damage.' },
  de_09: { name: 'Hardened Silos',     ships: [], desc: 'Buildings on defended planets survive one meteor impact.' },
  de_10: { name: 'Evacuation Drill',   ships: [], desc: 'When attacked, 30% of units auto-retreat to an adjacent friendly node.' },
};

// ── Reinforced Hull bonus map ─────────────────────────────────────────────────
const REINFORCED_HULL_SHIPS = {
  d_02:  { destroyer:   10 },
  c_02:  { cruiser:     10 },
  dr_02: { dreadnaught: 15 },
  fl_04: { flagship:    50 },
};

// ─────────────────────────────────────────────────────────────────────────────

export default class PerkManager {
  constructor(scene) {
    this._scene = scene;
    // team → Set<perkId>
    this._unlockedByTeam = new Map();
    // guard against double-applying HP bonuses: 'team:nodeId:shipType' → true
    this._hpBonusApplied = {};

    scene.game.events.on('researchUnlocked', ({ nodeId, team }) => {
      this.onPerkUnlocked(nodeId, team ?? 'player');
    });
  }

  // ── Called when a perk is researched ─────────────────────────────────────────
  onPerkUnlocked(nodeId, team = 'player') {
    if (!this._unlockedByTeam.has(team)) this._unlockedByTeam.set(team, new Set());
    const set = this._unlockedByTeam.get(team);
    if (set.has(nodeId)) return;
    set.add(nodeId);

    if (REINFORCED_HULL_SHIPS[nodeId]) {
      this._applyReinforcedHull(nodeId, team);
    }
  }

  // ── Tooltip query ─────────────────────────────────────────────────────────────
  // Returns [{name, desc}] for every perk unlocked by `team` that applies to
  // `shipType`. composition is the stack's composition map (optional) — used
  // to gate 'all' perks (e.g. Command Aura) on flagship presence.
  getPerksForUnit(team, shipType, composition = null) {
    const unlocked = this._unlockedByTeam.get(team);
    if (!unlocked || unlocked.size === 0) return [];

    const results = [];
    for (const nodeId of unlocked) {
      const def = PERK_CATALOGUE[nodeId];
      if (!def || def.ships.length === 0) continue;

      if (def.ships.includes('all')) {
        // 'all' perks only show if this stack has a flagship
        const hasFlagship = composition ? (composition.flagship || 0) > 0 : true;
        if (hasFlagship) results.push({ name: def.name, desc: def.desc });
        continue;
      }

      if (def.ships.includes(shipType)) {
        results.push({ name: def.name, desc: def.desc });
      }
    }
    return results;
  }

  // Returns the correct max HP for a ship type on this team.
  // Called by computeMaxHP in CombatManager — single source of truth.
  applyMaxHPBonus(type, team, baseHP) {
    const unlocked = this._unlockedByTeam.get(team);
    if (!unlocked) return baseHP;
    let hp = baseHP;
    for (const nodeId of unlocked) {
      const bonuses = REINFORCED_HULL_SHIPS[nodeId];
      if (!bonuses || bonuses[type] === undefined) continue;
      hp += bonuses[type];
    }
    return hp;
  }

  // ── Permanent stat application ────────────────────────────────────────────────
  // Called when a Reinforced Hull perk is researched.
  // Recomputes maxHP from scratch for all existing units on this team,
  // then tops up their current HP by the difference.
  _applyReinforcedHull(nodeId, team) {
    const key = `${team}:${nodeId}`;
    if (this._hpBonusApplied[key]) return;
    this._hpBonusApplied[key] = true;

    for (const unit of this._scene.units) {
      if (unit.team !== team) continue;
      recomputeMaxHP(unit, this);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Combat phase hooks
  // ══════════════════════════════════════════════════════════════════════════

  getBarrageShots(unit, baseShots) {
    if (!this._has(unit.team, 'd_01')) return baseShots;
    const destroyerCount = unit.unitHP?.destroyer?.filter(h => h > 0).length ?? 0;
    return destroyerCount * 3;
  }

  buildAttackQueue(unit, baseQueue) {
    if (baseQueue.length === 0) return baseQueue;
    const team = unit.team;

    return baseQueue.map(entry => {
      let dmg    = entry.damage;
      const type = entry.shipType;

      if (this._has(team, 'fl_01') && (unit.unitHP?.flagship?.filter(h => h > 0).length ?? 0) > 0) dmg += 1;
      if (type === 'fighter'   && this._has(team, 'f_02')) dmg += 1;
      if (type === 'destroyer' && this._has(team, 'd_08')) dmg += 1;

      return { ...entry, damage: dmg };
    });
  }

  getRepairChance(unit, baseChance) {
    return this._has(unit.team, 'c_01') ? 0.65 : baseChance;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────────
  _has(team, nodeId) {
    return this._unlockedByTeam.get(team)?.has(nodeId) ?? false;
  }

  destroy() {
    this._scene.game.events.off('researchUnlocked');
  }
}
