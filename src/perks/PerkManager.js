// ══════════════════════════════════════════════════════════════════════════════
// PerkManager — owns all perk effect logic.
//
// PERMANENT STAT PERKS (apply once on research, modify base stats for all
// current and future units belonging to the player):
//   Reinforced Hull  — +HP to affected ship type
//
// COMBAT PHASE HOOKS (called by CombatManager each round for player units):
//   _applyPreStrikeHooks  — Phase 1: modify barrage shot count
//   _applyMainStrikeHooks — Phase 3: modify attack queue entries
//   _applyRepairHooks     — Phase 4: modify repair chance
//
// Usage:
//   const pm = new PerkManager(scene);
//   // on research: pm.onPerkUnlocked(nodeId, team)
//   // in combat:   pm.getBarrageShots(unit, baseShots)
//                  pm.buildAttackQueue(unit, baseQueue)
//                  pm.getRepairChance(unit, baseChance)
// ══════════════════════════════════════════════════════════════════════════════

import { SHIP_STATS, SHIP_ORDER, syncUnitHP } from '../combat/CombatManager.js';

// Which ship type(s) each Reinforced Hull variant affects
const REINFORCED_HULL_SHIPS = {
  d_02:  { destroyer:   10 },
  c_02:  { cruiser:     10 },
  dr_02: { dreadnaught: 15 },
  fl_04: { flagship:    50 },
};

export default class PerkManager {
  constructor(scene) {
    this._scene   = scene;
    // Set of unlocked perk node IDs (player only for now)
    this._unlocked = new Set();
    // Per-type HP bonus applied so far (so we never double-apply)
    this._hpBonusApplied = {};

    // Listen for research unlocks from ResearchScene
    scene.game.events.on('researchUnlocked', ({ nodeId }) => {
      this.onPerkUnlocked(nodeId);
    });
  }

  // ── Called when a perk is researched ────────────────────────────────────────
  onPerkUnlocked(nodeId) {
    if (this._unlocked.has(nodeId)) return;
    this._unlocked.add(nodeId);

    // Permanent HP bonus — apply to SHIP_STATS and all live player units
    if (REINFORCED_HULL_SHIPS[nodeId]) {
      this._applyReinforcedHull(nodeId, REINFORCED_HULL_SHIPS[nodeId]);
    }
  }

  // ── Permanent stat application ───────────────────────────────────────────────
  _applyReinforcedHull(nodeId, bonuses) {
    for (const [shipType, hpBonus] of Object.entries(bonuses)) {
      // Guard: only apply once even if called multiple times
      const key = `${nodeId}:${shipType}`;
      if (this._hpBonusApplied[key]) continue;
      this._hpBonusApplied[key] = true;

      // Modify the canonical SHIP_STATS so all future initUnitHP calls use new HP
      SHIP_STATS[shipType].hp += hpBonus;

      // Patch every existing player unit: add the bonus HP to each living ship
      // of this type and re-sync so unitHP stays consistent
      for (const unit of this._scene.units) {
        if (unit.team !== 'player') continue;
        if (!unit.unitHP || !unit.unitHP[shipType]) continue;
        for (let i = 0; i < unit.unitHP[shipType].length; i++) {
          unit.unitHP[shipType][i] += hpBonus;
        }
        // syncUnitHP will set max HP from SHIP_STATS for any future additions
        syncUnitHP(unit);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Combat phase hooks — called by CombatManager each round.
  // Each returns a (possibly modified) value; base value passed as argument.
  // ══════════════════════════════════════════════════════════════════════════

  // Phase 1: How many barrage shots does this unit fire?
  // Base: destroyers × BARRAGE_SHOTS_PER_DESTROYER (default 2)
  getBarrageShots(unit, baseShots) {
    if (!this._isPlayer(unit)) return baseShots;
    // Improved Barrage (d_01): 3 shots per destroyer instead of 2
    if (this._has('d_01')) {
      const destroyerCount = unit.unitHP?.destroyer?.filter(h => h > 0).length ?? 0;
      // Replace the base calculation entirely: 3 shots per destroyer
      return destroyerCount * 3;
    }
    return baseShots;
  }

  // Phase 3: Given a base attack queue entry {damage}, return modified damage.
  // Also handles whole-queue modifications like Dense Formation and Command Aura.
  // Returns a NEW queue array with modified damage values.
  buildAttackQueue(unit, baseQueue) {
    if (!this._isPlayer(unit) || baseQueue.length === 0) return baseQueue;

    return baseQueue.map(entry => {
      let dmg = entry.damage;
      const type = entry.shipType; // set by modified _buildAttackQueue below

      // Command Aura (fl_01): +1 damage to ALL ships if flagship present in stack
      if (this._has('fl_01') && (unit.unitHP?.flagship?.filter(h => h > 0).length ?? 0) > 0) {
        dmg += 1;
      }

      // Dense Formation — Fighter (f_02): +1 attack per fighter when ≥5 fighters in stack
      if (type === 'fighter' && this._has('f_02')) {
        const fighterCount = unit.unitHP?.fighter?.filter(h => h > 0).length ?? 0;
        if (fighterCount >= 5) dmg += 1;
      }

      // Dense Formation — Destroyer (d_08): +1 attack per destroyer when ≥5 destroyers
      if (type === 'destroyer' && this._has('d_08')) {
        const destroyerCount = unit.unitHP?.destroyer?.filter(h => h > 0).length ?? 0;
        if (destroyerCount >= 5) dmg += 1;
      }

      return { ...entry, damage: dmg };
    });
  }

  // Phase 4: What repair chance should be used for this unit's cruisers?
  // Base: 0.5 (50%)
  getRepairChance(unit, baseChance) {
    if (!this._isPlayer(unit)) return baseChance;
    // Field Medics (c_01): 50% → 65%
    if (this._has('c_01')) return 0.65;
    return baseChance;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  _has(nodeId)        { return this._unlocked.has(nodeId); }
  _isPlayer(unit)     { return unit?.team === 'player'; }

  // Clean up listener on scene shutdown
  destroy() {
    this._scene.game.events.off('researchUnlocked');
  }
}
