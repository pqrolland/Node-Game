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
  d_10:  { name: 'Afterburner',         ships: ['destroyer'],   desc: 'Each Destroyer increases stack movement speed by 5%.' },
  // Cruiser tree
  c_01:  { name: 'Field Medics',       ships: ['cruiser'],     desc: 'Repair chance on death increases from 50% to 65%.' },
  c_02:  { name: 'Reinforced Hull',    ships: ['cruiser'],     desc: '+10 HP per Cruiser.' },
  c_03:  { name: 'Nanite Repair',      ships: ['cruiser'],     desc: 'Damaged (not destroyed) Cruisers have a 30% chance to restore to full HP each phase.' },
  c_04:  { name: 'Escort Formation',   ships: ['cruiser'],     desc: 'Absorbs one hit directed at the Flagship per Main Strike round.' },
  c_05:  { name: 'Deflection Field',  ships: ['cruiser'],     desc: 'Each friendly ship in this stack gains +5 HP.' },
  c_06:  { name: 'Hunter Protocol',    ships: ['cruiser'],     desc: '+5 damage against Dreadnaughts and Flagships.' },
  c_07:  { name: 'Ace Pilots',         ships: ['cruiser'],     desc: 'Deals double damage against Destroyers.' },
  c_08:  { name: 'Rapid Scramble',     ships: ['cruiser'],     desc: 'Cruisers launch 30% faster from Cruiser Factories.' },
  c_09:  { name: 'Flak Defense',        ships: ['cruiser'],     desc: 'Each Cruiser negates 1 random incoming Pre-Strike hit.' },
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
  dr_09: { name: 'First Strike',       ships: ['dreadnaught'], desc: 'Gains a Pre-Strike hit of 5 damage.' },
  dr_10: { name: 'Living Fortress',    ships: ['dreadnaught'], desc: '+20 HP when defending a planet.' },
  // Flagship tree
  fl_01: { name: 'Command Aura',       ships: ['all'],         desc: 'All ships in this stack gain +1 attack damage.' },
  fl_02: { name: 'Emergency Shield',   ships: ['flagship'],    desc: 'Survives one lethal hit per battle.' },
  fl_03: { name: 'Afterburner',         ships: ['flagship'],    desc: 'Stacks containing a Flagship move 50% faster.' },
  fl_04: { name: 'Reinforced Hull',    ships: ['flagship'],    desc: '+50 HP per Flagship.' },
  fl_05: { name: 'Last Stand',         ships: ['flagship'],    desc: '+10 damage and 1 extra attack when the stack is outnumbered.' },
  fl_06: { name: 'First Strike',       ships: ['flagship'],    desc: 'Gains a Pre-Strike hit of 20 damage.' },
  fl_07: { name: 'Iron Reserve',       ships: ['flagship'],    desc: 'Generates +5 Food, Metal, and Fuel per resource tick.' },
  fl_08: { name: 'Hunter Protocol',    ships: ['flagship'],    desc: '+15 damage against Dreadnaughts and Flagships.' },
  fl_09: { name: 'Naval Construction', ships: ['flagship'],    desc: 'Produces 1 Fighter every 30 seconds.' },
  fl_10: { name: 'Spearhead',          ships: ['flagship'],    desc: 'Pre-Strike of 10 damage that prioritizes the enemy Flagship, or a random ship otherwise.' },
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
  // Movement: Afterburner — returns effective speed for a unit
  // f_03: +2.5% per fighter, d_10: +5% per destroyer, dr_04: +10% per dreadnaught, fl_03: +50% flat with flagship
  getAfterburnerSpeed(unit, baseSpeed) {
    let mult = 1.0;
    if (this._has(unit.team, 'f_03')) {
      const count = unit.composition?.fighter ?? 0;
      mult += count * 0.025;
    }
    if (this._has(unit.team, 'd_10')) {
      const count = unit.composition?.destroyer ?? 0;
      mult += count * 0.05;  // +5% per destroyer
    }
    if (this._has(unit.team, 'dr_04')) {
      const count = unit.composition?.dreadnaught ?? 0;
      mult += count * 0.10;
    }
    if (this._has(unit.team, 'fl_03')) {
      if ((unit.composition?.flagship ?? 0) > 0) mult += 0.50;
    }
    return Math.round(baseSpeed * mult);
  }

  // Battle start: Regeneration Field — +5 HP to every ship in a cruiser stack
  applyRegenField(unit) {
    if (!this._has(unit.team, 'c_05')) return { applied: false };
    if (!unit.unitHP || !(unit.composition?.cruiser > 0)) return { applied: false };
    const bonusPerShip = 5;
    let totalShips = 0;
    for (const type of Object.keys(unit.unitHP)) {
      const hps = unit.unitHP[type];
      if (!hps) continue;
      for (let i = 0; i < hps.length; i++) {
        if (hps[i] > 0) { hps[i] += bonusPerShip; totalShips++; }
      }
    }
    return { applied: totalShips > 0, bonusPerShip, totalShips, totalBonus: totalShips * bonusPerShip };
  }

  // Production speed — returns the effective duration for a factory building.
  // Rapid Scramble perks: f_01 (naval_base), d_03 (destroyer_factory),
  //                       c_08 (cruiser_factory), dr_08 (dreadnaught_factory)
  getRapidScrambleDuration(team, bldId, baseDuration) {
    const PERK_FOR_BLD = {
      naval_base:          'f_01',
      destroyer_factory:   'd_03',
      cruiser_factory:     'c_08',
      dreadnaught_factory: 'dr_08',
    };
    const perkId = PERK_FOR_BLD[bldId];
    if (!perkId || !this._has(team, perkId)) return baseDuration;
    return Math.round(baseDuration * 0.7);
  }

  // Returns perk info relevant to a specific building, for the building tooltip.
  getPerksForBuilding(team, bldId) {
    const PERK_FOR_BLD = {
      naval_base:          'f_01',
      destroyer_factory:   'd_03',
      cruiser_factory:     'c_08',
      dreadnaught_factory: 'dr_08',
    };
    const perkId = PERK_FOR_BLD[bldId];
    if (!perkId || !this._has(team, perkId)) return [];
    const def = PERK_CATALOGUE[perkId];
    if (!def) return [];
    return [{ id: perkId, name: def.name, desc: def.desc }];
  }

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

  // Phase 1: Anti-Fighter Barrage shot count (Improved Barrage)
  getBarrageShots(unit, baseShots) {
    if (!this._has(unit.team, 'd_01')) return baseShots;
    const destroyerCount = unit.unitHP?.destroyer?.filter(h => h > 0).length ?? 0;
    return destroyerCount * 3;
  }

  // Phase 1: Whether Torpedo Spread is active — expands barrage to hit all ship types
  hasTorpedoSpread(unit) {
    return this._has(unit.team, 'd_05');
  }

  // Phase 1: Orbital Strike — the stack deals 5 Pre-Strike damage to EVERY enemy ship.
  // Returns flat 5 (or 0 if not unlocked), regardless of dreadnaught count.
  getOrbitalStrikeDamage(unit) {
    if (!this._has(unit.team, 'dr_03')) return 0;
    if ((unit.unitHP?.dreadnaught?.filter(h => h > 0).length ?? 0) === 0) return 0;
    return 5;
  }

  // Phase 1: First Strike hits — returns [{ damage }] one entry per qualifying ship
  getFirstStrikeHits(unit) {
    const team = unit.team;
    const hits = [];
    if (this._has(team, 'f_08')) {
      const count = unit.unitHP?.fighter?.filter(h => h > 0).length ?? 0;
      for (let i = 0; i < count; i++) hits.push({ damage: 1 });
    }
    if (this._has(team, 'dr_09')) {
      const count = unit.unitHP?.dreadnaught?.filter(h => h > 0).length ?? 0;
      for (let i = 0; i < count; i++) hits.push({ damage: 5 });
    }
    if (this._has(team, 'fl_06')) {
      const count = unit.unitHP?.flagship?.filter(h => h > 0).length ?? 0;
      for (let i = 0; i < count; i++) hits.push({ damage: 20 });
    }
    return hits;
  }

  // Phase 1: Spearhead — flagship pre-strike targeting enemy flagship first, random otherwise
  // Returns [{ damage, preferType }] — _stageSpearhead uses preferType for targeting
  getSpearheadHits(unit) {
    if (!this._has(unit.team, 'fl_10')) return [];
    const count = unit.unitHP?.flagship?.filter(h => h > 0).length ?? 0;
    const hits = [];
    for (let i = 0; i < count; i++) hits.push({ damage: 10, preferType: 'flagship' });
    return hits;
  }

  // Phase 1: Shielded Core — reduce incoming pre-strike damage to cruisers by 10
  // Phase 1: Flak Defense — negates up to 1 random incoming pre-strike hit per living cruiser
  // Returns { buf: filteredBuf, negated: count }
  applyFlakDefense(unit, incomingBuf) {
    if (!this._has(unit.team, 'c_09')) return { buf: incomingBuf, negated: 0 };
    const cruiserCount = unit.unitHP?.cruiser?.filter(h => h > 0).length ?? 0;
    if (cruiserCount === 0 || incomingBuf.length === 0) return { buf: incomingBuf, negated: 0 };

    // Pick up to cruiserCount random indices to negate
    const indices = incomingBuf.map((_, i) => i).sort(() => Math.random() - 0.5);
    const negatedIndices = new Set(indices.slice(0, Math.min(cruiserCount, incomingBuf.length)));
    const buf    = incomingBuf.filter((_, i) => !negatedIndices.has(i));
    return { buf, negated: negatedIndices.size };
  }

  // Phase 3: Air Superiority — fighters gain +1 attack per adjacent friendly planet
  getAirSuperiorityBonus(unit) {
    if (!this._has(unit.team, 'f_09')) return 0;
    const nodeId = unit.currentNode;
    if (!nodeId) return 0;
    const adj = this._scene.adjacency?.get(nodeId) ?? [];
    let bonus = 0;
    for (const neighbourId of adj) {
      if (this._scene.nodeOwnership?.get(neighbourId) === unit.team) bonus++;
    }
    return bonus;
  }

  // Phase 4: Escort Formation — cruisers absorb hits aimed at flagship
  // Each living cruiser can absorb 1 hit per round targeted at the flagship.
  // Distributes redirected hits across different cruisers rather than piling onto one.
  applyEscortFormation(unit, incomingBuf) {
    if (!this._has(unit.team, 'c_04')) return { buf: incomingBuf, redirected: 0 };
    const hps = unit.unitHP?.cruiser;
    if (!hps) return { buf: incomingBuf, redirected: 0 };

    // Build pool of living cruiser indices — each can absorb one hit this round
    const availableCruisers = hps.map((h, i) => h > 0 ? i : -1).filter(i => i >= 0);
    if (availableCruisers.length === 0) return { buf: incomingBuf, redirected: 0 };

    let redirected    = 0;
    let cruiserCursor = 0;
    const buf = incomingBuf.map(hit => {
      if (hit.type !== 'flagship' || cruiserCursor >= availableCruisers.length) return hit;
      const idx = availableCruisers[cruiserCursor++];
      redirected++;
      return { ...hit, type: 'cruiser', idx };
    });
    return { buf, redirected };
  }

  // Battle start: Living Fortress — dreadnaughts defending gain +20 HP (temporary, current HP only)
  applyLivingFortress(unit) {
    if (!this._has(unit.team, 'dr_10')) return { applied: false };
    const hps = unit.unitHP?.dreadnaught;
    if (!hps || hps.length === 0) return { applied: false };
    const bonus = 20;
    let count = 0;
    for (let i = 0; i < hps.length; i++) {
      if (hps[i] > 0) { hps[i] += bonus; count++; }
    }
    return { applied: count > 0, bonus, count };
  }

  // Phase 1: Interceptor Role — fighters killed by pre-strike retaliate (50% each)
  getInterceptorHits(unit, fighterDeaths) {
    if (!this._has(unit.team, 'f_07') || fighterDeaths === 0) return { hits: [], triggered: 0, total: 0 };
    const CHANCE = 0.50;
    const hits = [];
    for (let i = 0; i < fighterDeaths; i++) {
      if (Math.random() < CHANCE) hits.push({ damage: SHIP_STATS['fighter'].damage });
    }
    return { hits, triggered: hits.length, total: fighterDeaths, chance: CHANCE };
  }

  // Phase 3: Modify attack queue — also handles Mass Driver
  buildAttackQueue(unit, enemy, baseQueue) {
    if (baseQueue.length === 0) return baseQueue;
    const team = unit.team;

    // Outnumbered check for Last Stand perks
    const myCount    = unit.stackSize  ?? 0;
    const enemyCount = enemy?.stackSize ?? 0;
    const outnumbered = myCount < enemyCount;

    // Hunter Protocol: bonus if enemy has any dreadnaughts or flagships alive
    const enemyHasHeavy = ((enemy?.unitHP?.dreadnaught?.filter(h => h > 0).length ?? 0) +
                           (enemy?.unitHP?.flagship?.filter(h => h > 0).length ?? 0)) > 0;

    // Ace Pilots target checks — only double when enemy has the relevant type
    const enemyHasDestroyer = (enemy?.unitHP?.destroyer?.filter(h => h > 0).length ?? 0) > 0;

    // Pure-fighter check for Swarm Tactics
    const pureFighters = unit.composition && SHIP_ORDER
      .filter(t => t !== 'fighter')
      .every(t => (unit.composition[t] || 0) === 0);

    // Pure-dreadnaught check for Mass Driver — exactly 1 dreadnaught in stack
    const singleDreadnaught = (unit.composition?.dreadnaught ?? 0) === 1;

    const mappedEntries = baseQueue.map(entry => {
      let dmg    = entry.damage;
      const type = entry.shipType;

      // ── Existing perks ────────────────────────────────────────────────
      if (this._has(team, 'fl_01') && (unit.unitHP?.flagship?.filter(h => h > 0).length ?? 0) > 0) dmg += 1;
      if (type === 'fighter'   && this._has(team, 'f_02')) dmg += 1;
      if (type === 'destroyer' && this._has(team, 'd_08')) dmg += 1;

      // Siege Cannons — Dreadnaught +5 damage
      if (type === 'dreadnaught' && this._has(team, 'dr_01')) dmg += 5;

      // Mass Driver — single dreadnaught in stack: replace all its attacks with 30dmg×3
      // We set damage to 30 here; the flatMap below adds the 3rd entry (base is 2 attacks)
      if (type === 'dreadnaught' && this._has(team, 'dr_05') && singleDreadnaught) dmg = Math.max(dmg, 30);

      // Hunter Protocol — bonus vs Dreadnaughts / Flagships
      if (enemyHasHeavy) {
        if (type === 'destroyer' && this._has(team, 'd_04')) dmg += 2;
        if (type === 'cruiser'   && this._has(team, 'c_06')) dmg += 5;
        if (type === 'flagship'  && this._has(team, 'fl_08')) dmg += 15;
      }

      // Last Stand — bonus when outnumbered
      if (outnumbered) {
        if (type === 'destroyer'   && this._has(team, 'd_06'))  dmg += 2;
        if (type === 'cruiser'     && this._has(team, 'c_10'))  dmg += 2;
        if (type === 'dreadnaught' && this._has(team, 'dr_07')) dmg += 5;
        if (type === 'flagship'    && this._has(team, 'fl_05')) dmg += 10;
      }

      // Swarm Tactics — Fighter +1 when stack is pure fighters
      if (type === 'fighter' && pureFighters && this._has(team, 'f_06')) dmg += 1;

      // Air Superiority — Fighter +1 per adjacent friendly planet
      if (type === 'fighter' && this._has(team, 'f_09')) {
        dmg += this.getAirSuperiorityBonus(unit);
      }

      // Ace Pilots — double damage when enemy has the relevant type alive
      if (enemyHasDestroyer) {
        if (type === 'fighter'   && this._has(team, 'f_05')) dmg *= 2;
        if (type === 'destroyer' && this._has(team, 'd_07')) dmg *= 2;
        if (type === 'cruiser'   && this._has(team, 'c_07')) dmg *= 2;
      }

      return { ...entry, damage: dmg };
    });

    let massDriveExtraAdded = false;
    return mappedEntries.flatMap(entry => {
      // Last Stand Flagship — +1 extra attack when outnumbered
      if (outnumbered && entry.shipType === 'flagship' && this._has(team, 'fl_05')) {
        return [entry, { ...entry }];
      }
      // Mass Driver — add exactly one extra attack for the single dreadnaught (base 2 + 1 = 3)
      if (entry.shipType === 'dreadnaught' && this._has(team, 'dr_05') && singleDreadnaught && !massDriveExtraAdded) {
        massDriveExtraAdded = true;
        return [entry, { ...entry }];
      }
      return [entry];
    });
  }

  // Phase 4: Emergency Shield — flagship survives first lethal hit per battle
  // Scans flagship HP entries, sets any at <=0 to 1 HP if shield hasn't fired yet.
  // Uses battle object to track per-battle usage. Returns true if it fired.
  applyEmergencyShield(unit, battle) {
    if (!this._has(unit.team, 'fl_02')) return false;
    const hps = unit.unitHP?.flagship;
    if (!hps) return false;

    // Track per-battle, per-team shield usage
    if (!battle._shieldUsed) battle._shieldUsed = {};
    if (battle._shieldUsed[unit.team]) return false;

    let fired = false;
    for (let i = 0; i < hps.length; i++) {
      if (hps[i] <= 0) {
        hps[i] = 1;
        fired = true;
        break; // only save one flagship per trigger
      }
    }
    if (fired) battle._shieldUsed[unit.team] = true;
    return fired;
  }

  // Phase 4: Wingman Protocol — roll dodge for each incoming hit on qualifying ships
  // Returns { hits: filtered buffer, dodged: count, chance: probability used }
  applyDodge(unit, incomingBuf) {
    const team = unit.team;
    const dodgeTypes = new Set();
    if (this._has(team, 'f_04'))  dodgeTypes.add('fighter');
    if (this._has(team, 'd_09'))  dodgeTypes.add('destroyer');
    if (this._has(team, 'dr_06')) dodgeTypes.add('dreadnaught');

    if (dodgeTypes.size === 0) return { hits: incomingBuf, dodged: 0, chance: 0 };

    const DODGE_CHANCE = 0.10;
    let dodged = 0;
    const hits = incomingBuf.filter(hit => {
      if (!dodgeTypes.has(hit.type)) return true;
      if (Math.random() < DODGE_CHANCE) { dodged++; return false; }
      return true;
    });
    return { hits, dodged, chance: DODGE_CHANCE };
  }

  // Phase 4: Kamikaze Protocol — dead fighters retaliate
  // fighterDeaths: number of fighters that died this resolution phase
  // Returns { hits: [{ damage }], triggered: count }
  getKamikazeHits(unit, fighterDeaths) {
    if (!this._has(unit.team, 'f_10') || fighterDeaths === 0) return { hits: [], triggered: 0 };
    const KAMIKAZE_CHANCE = 0.50;
    const KAMIKAZE_DMG    = SHIP_STATS['fighter'].damage;
    const hits = [];
    for (let i = 0; i < fighterDeaths; i++) {
      if (Math.random() < KAMIKAZE_CHANCE) hits.push({ damage: KAMIKAZE_DMG });
    }
    return { hits, triggered: hits.length, chance: KAMIKAZE_CHANCE, total: fighterDeaths };
  }

  // Phase 4: Nanite Repair — damaged (but alive) cruisers have 30% chance to heal to full
  // Returns { healed: count, eligible: count }
  applyNaniteRepair(unit) {
    if (!this._has(unit.team, 'c_03')) return { healed: 0, eligible: 0 };
    const NANITE_CHANCE = 0.30;
    const maxHP = unit.maxHP?.cruiser ?? SHIP_STATS.cruiser.hp;
    const hps   = unit.unitHP?.cruiser;
    if (!hps) return { healed: 0, eligible: 0 };

    let eligible = 0, healed = 0;
    for (let i = 0; i < hps.length; i++) {
      if (hps[i] > 0 && hps[i] < maxHP) {
        eligible++;
        if (Math.random() < NANITE_CHANCE) {
          hps[i] = maxHP;
          healed++;
        }
      }
    }
    return { healed, eligible, chance: NANITE_CHANCE };
  }

  // Phase 4: Field Medics — cruiser repair chance
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
