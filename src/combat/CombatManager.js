// ══════════════════════════════════════════════════════════════════════════════
// CombatManager — round-based combat engine.
//
// ROUND STRUCTURE (fires every ROUND_COOLDOWN ms):
//
//   Phase 1 — Pre-Strike  (Anti-Fighter Barrage)
//     Each destroyer on both sides targets 2 enemy fighters simultaneously.
//     Damage is fully staged before anything is applied — neither side's
//     kills affect the other's shot count.
//
//   Phase 2 — Pre-Strike Resolution
//     Staged barrage damage applied. Dead ships pruned.
//     Cruiser repair does NOT roll here.
//
//   Phase 3 — Main Strike
//     All surviving ships generate attack queue entries based on their
//     attacks-per-round stat. Both sides' damage staged simultaneously
//     (no overkill waste — doomed ships are excluded from targeting).
//
//   Phase 4 — Main Strike Resolution
//     Damage applied. Dead ships pruned. Cruiser repair rolls for any
//     cruiser casualties this phase only.
//
//   After Combat  (once per battle, at conclusion)
//     Hook for perk effects that fire at battle end.
//     Currently a no-op placeholder; perk hooks attach here.
//
// LOG ENTRY SHAPE: { round, phase, text, color }
// ══════════════════════════════════════════════════════════════════════════════

export const ROUND_COOLDOWN = 30000;

export const SHIP_STATS = {
  fighter:     { hp: 10, damage:  5, attacks: 1 },
  destroyer:   { hp: 20, damage: 10, attacks: 1 },
  cruiser:     { hp: 20, damage: 10, attacks: 2 },
  dreadnaught: { hp: 50, damage: 20, attacks: 2 },
  flagship:    { hp: 60, damage: 20, attacks: 2 },
};

// Anti-Fighter Barrage constants
const BARRAGE_SHOTS_PER_DESTROYER = 2;
const BARRAGE_DAMAGE               = 10; // one-shots a fighter (fighter HP = 10)

export const SHIP_ORDER = ['fighter', 'destroyer', 'cruiser', 'dreadnaught', 'flagship'];

// ── HP helpers ────────────────────────────────────────────────────────────────

// Compute the correct max HP for a ship type on a given team.
// Reads base SHIP_STATS then adds any researched bonuses from perkManager.
// This is the single source of truth for max HP — never mutate SHIP_STATS.
export function computeMaxHP(type, team, perkManager) {
  let hp = SHIP_STATS[type].hp;
  if (perkManager) hp = perkManager.applyMaxHPBonus(type, team, hp);
  return hp;
}

// Ensure unit.maxHP exists, computed correctly for this unit's team.
// Safe to call multiple times — skips if already set.
export function ensureMaxHP(unit, perkManager) {
  if (unit.maxHP) return;
  unit.maxHP = {};
  for (const type of SHIP_ORDER) {
    unit.maxHP[type] = computeMaxHP(type, unit.team, perkManager);
  }
}

// Recompute unit.maxHP from scratch (call after new perk is researched).
// Also bumps current unitHP values proportionally so ships don't lose HP.
export function recomputeMaxHP(unit, perkManager) {
  for (const type of SHIP_ORDER) {
    const oldMax = unit.maxHP?.[type] ?? SHIP_STATS[type].hp;
    const newMax = computeMaxHP(type, unit.team, perkManager);
    if (!unit.maxHP) unit.maxHP = {};
    unit.maxHP[type] = newMax;
    // Top up existing ships by the bonus amount
    const bonus = newMax - oldMax;
    if (bonus > 0 && unit.unitHP?.[type]) {
      for (let i = 0; i < unit.unitHP[type].length; i++) {
        unit.unitHP[type][i] += bonus;
      }
    }
  }
}

export function initUnitHP(unit, perkManager) {
  ensureMaxHP(unit, perkManager);
  unit.unitHP = {};
  for (const type of SHIP_ORDER) {
    const count = unit.composition[type] || 0;
    unit.unitHP[type] = Array.from({ length: count }, () => unit.maxHP[type]);
  }
}

// Reconcile unitHP with composition.
// Adds full-HP entries for any ships in composition not yet in unitHP.
// Trims excess unitHP entries if composition shrank externally.
export function syncUnitHP(unit, perkManager) {
  ensureMaxHP(unit, perkManager);
  if (!unit.unitHP) { initUnitHP(unit, perkManager); return; }
  for (const type of SHIP_ORDER) {
    const count = unit.composition[type] || 0;
    if (!unit.unitHP[type]) unit.unitHP[type] = [];
    while (unit.unitHP[type].length < count) unit.unitHP[type].push(unit.maxHP[type]);
    if (unit.unitHP[type].length > count)    unit.unitHP[type] = unit.unitHP[type].slice(0, count);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default class CombatManager {
  constructor(scene) {
    this._scene   = scene;
    this._battles = [];
    this._gfx     = scene.add.graphics().setDepth(12);
  }

  // Lazy accessor — PerkManager is created after CombatManager in GameScene
  get _perks() { return this._scene.perkManager; }

  // ── Public: start a battle ────────────────────────────────────────────────
  startBattle(attacker, defender) {
    if (attacker.inCombat || defender.inCombat) return;
    if (attacker._dead   || defender._dead)    return;

    syncUnitHP(attacker, this._perks);
    syncUnitHP(defender, this._perks);

    attacker.inCombat = true;  defender.inCombat = true;
    attacker.isMoving = false; defender.isMoving = false;
    attacker.path     = [];    defender.path     = [];

    attacker.setBadgeVisible(false);
    defender.setBadgeVisible(false);

    const nodeId  = defender.currentNode;
    const node    = this._scene.nodeMap.get(nodeId);
    const overlay = this._createOverlay(attacker, defender, node);

    // Snapshot starting compositions for battle history
    const atkSnapshot = { ...attacker.composition };
    const defSnapshot = { ...defender.composition };
    const atkTeam     = attacker.team;
    const defTeam     = defender.team;
    const atkColor    = attacker.teamColorHex;
    const defColor    = defender.teamColorHex;

    const battle = {
      attacker, defender, nodeId, node,
      cooldownMs: 0, roundNumber: 0, overlay, log: [],
      atkSnapshot, defSnapshot, atkTeam, defTeam, atkColor, defColor,
    };
    this._battles.push(battle);

    overlay.hitZone.on('pointerdown', () => this._scene.game.events.emit('openCombat', { battle }));
    overlay.hitZone.on('pointerover', () => { overlay.atkBg.setAlpha(1.3); overlay.defBg.setAlpha(1.3); });
    overlay.hitZone.on('pointerout',  () => { overlay.atkBg.setAlpha(1);   overlay.defBg.setAlpha(1);   });

    this._updateOverlay(battle);
    this._fireRound(battle);
  }

  // ── Update loop ───────────────────────────────────────────────────────────
  update(delta) {
    for (let i = this._battles.length - 1; i >= 0; i--) {
      const b = this._battles[i];
      if (b.attacker._dead || b.defender._dead) { this._endBattle(b, i); continue; }

      b.cooldownMs += delta;
      if (b.cooldownMs >= ROUND_COOLDOWN) {
        b.cooldownMs = 0;
        this._fireRound(b);
        if (!_anyAlive(b.attacker) || !_anyAlive(b.defender)) {
          this._resolveBattleEnd(b, i);
        }
      }
    }
    this._drawCooldownArcs();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // _fireRound — one full round of combat
  // ══════════════════════════════════════════════════════════════════════════
  _fireRound(battle) {
    battle.roundNumber++;
    const { attacker, defender } = battle;
    const rnd = battle.roundNumber;
    const ui  = this._scene.scene.get('UIScene');

    // Reconcile HP arrays with composition (handles mid-battle reinforcements)
    syncUnitHP(attacker, this._perks);
    syncUnitHP(defender, this._perks);

    // Perk hook: Deflection Field — +5 HP to all ships in cruiser stacks, round 1 only
    // Applies to current HP only (not maxHP) so _fullHeal at battle end strips the bonus naturally
    if (rnd === 1) {
      const atkRegen = this._perks?.applyRegenField(attacker);
      const defRegen = this._perks?.applyRegenField(defender);
      // Store bonus per-type on battle so CombatScene can show accurate +N even after damage
      if (atkRegen?.applied) {
        battle.atkRegenBonus = atkRegen.bonusPerShip;
        battle.log.push({ round: rnd, phase: 'prestrike',
          text: `✨ Atk [Deflection Field]: ${atkRegen.totalShips} ships +${atkRegen.bonusPerShip} HP each (+${atkRegen.totalBonus} total)`,
          color: '#44ddaa' });
      }
      if (defRegen?.applied) {
        battle.defRegenBonus = defRegen.bonusPerShip;
        battle.log.push({ round: rnd, phase: 'prestrike',
          text: `✨ Def [Deflection Field]: ${defRegen.totalShips} ships +${defRegen.bonusPerShip} HP each (+${defRegen.totalBonus} total)`,
          color: '#44ddaa' });
      }
      // Living Fortress — dreadnaughts on the defending team gain +20 HP
      const defLiving = this._perks?.applyLivingFortress(defender);
      if (defLiving?.applied) {
        battle.defLivingBonus = defLiving.bonus;
        battle.log.push({ round: rnd, phase: 'prestrike',
          text: `🏰 Def [Living Fortress]: ${defLiving.count} dreadnaught(s) +${defLiving.bonus} HP`,
          color: '#ff8844' });
      }
    }

    // ── Phase 1 + 2: Pre-Strike & Resolution ─────────────────────────────
    // Count destroyers BEFORE any damage so both sides stage simultaneously.
    const atkBaseShots = (attacker.unitHP.destroyer?.filter(h => h > 0).length ?? 0) * BARRAGE_SHOTS_PER_DESTROYER;
    const defBaseShots = (defender.unitHP.destroyer?.filter(h => h > 0).length ?? 0) * BARRAGE_SHOTS_PER_DESTROYER;
    const atkBarrageShots = this._perks?.getBarrageShots(attacker, atkBaseShots) ?? atkBaseShots;
    const defBarrageShots = this._perks?.getBarrageShots(defender, defBaseShots) ?? defBaseShots;

    // Perk hook: Torpedo Spread — expand barrage to all ship types
    const atkTorpedo = this._perks?.hasTorpedoSpread(attacker) ?? false;
    const defTorpedo = this._perks?.hasTorpedoSpread(defender) ?? false;

    const atkBarrageBuf = _stageBarrage(atkBarrageShots, defender.unitHP, atkTorpedo);
    const defBarrageBuf = _stageBarrage(defBarrageShots, attacker.unitHP, defTorpedo);

    // Perk hook: First Strike
    const atkFirstStrike = this._perks?.getFirstStrikeHits(attacker) ?? [];
    const defFirstStrike = this._perks?.getFirstStrikeHits(defender) ?? [];
    const atkFSBuf = _stageFirstStrike(atkFirstStrike, defender.unitHP);
    const defFSBuf = _stageFirstStrike(defFirstStrike, attacker.unitHP);

    // Perk hook: Spearhead — flagship pre-strike targeting enemy flagship first
    const atkSpearhead = this._perks?.getSpearheadHits(attacker) ?? [];
    const defSpearhead = this._perks?.getSpearheadHits(defender) ?? [];
    const atkSpearBuf  = _stageSpearhead(atkSpearhead, defender.unitHP);
    const defSpearBuf  = _stageSpearhead(defSpearhead, attacker.unitHP);

    // Perk hook: Orbital Strike — flat damage to every enemy ship
    const atkOrbitalDmg = this._perks?.getOrbitalStrikeDamage(attacker) ?? 0;
    const defOrbitalDmg = this._perks?.getOrbitalStrikeDamage(defender) ?? 0;
    const atkOrbitalBuf = atkOrbitalDmg > 0 ? _stageOrbitalStrike(atkOrbitalDmg, defender.unitHP) : [];
    const defOrbitalBuf = defOrbitalDmg > 0 ? _stageOrbitalStrike(defOrbitalDmg, attacker.unitHP) : [];

    // Apply all pre-strike buffers
    // Perk hook: Flak Defense — each cruiser negates 1 random incoming pre-strike hit
    // Applied per-buffer so each source independently rolls against Flak
    const atkBarrageFlak  = this._perks?.applyFlakDefense(defender, atkBarrageBuf) ?? { buf: atkBarrageBuf, negated: 0 };
    const defBarrageFlak  = this._perks?.applyFlakDefense(attacker, defBarrageBuf) ?? { buf: defBarrageBuf, negated: 0 };
    const atkFSFlak       = this._perks?.applyFlakDefense(defender, atkFSBuf)      ?? { buf: atkFSBuf,      negated: 0 };
    const defFSFlak       = this._perks?.applyFlakDefense(attacker, defFSBuf)      ?? { buf: defFSBuf,      negated: 0 };

    // Spearhead: apply Flak Defense first, then Escort Formation (redirects flagship hits to cruisers)
    const atkSpearFlak    = this._perks?.applyFlakDefense(defender, atkSpearBuf)   ?? { buf: atkSpearBuf,   negated: 0 };
    const defSpearFlak    = this._perks?.applyFlakDefense(attacker, defSpearBuf)   ?? { buf: defSpearBuf,   negated: 0 };
    const atkSpearEscort  = this._perks?.applyEscortFormation(defender, atkSpearFlak.buf) ?? { buf: atkSpearFlak.buf, redirected: 0 };
    const defSpearEscort  = this._perks?.applyEscortFormation(attacker, defSpearFlak.buf) ?? { buf: defSpearFlak.buf, redirected: 0 };

    const atkBarrageBufFiltered = atkBarrageFlak.buf;
    const defBarrageBufFiltered = defBarrageFlak.buf;
    const atkFSBufFiltered      = atkFSFlak.buf;
    const defFSBufFiltered      = defFSFlak.buf;
    const atkSpearBufFiltered   = atkSpearEscort.buf;
    const defSpearBufFiltered   = defSpearEscort.buf;

    _applyBuffer(atkBarrageBufFiltered, defender.unitHP);
    _applyBuffer(defBarrageBufFiltered, attacker.unitHP);
    _applyBuffer(atkFSBufFiltered, defender.unitHP);
    _applyBuffer(defFSBufFiltered, attacker.unitHP);
    _applyBuffer(atkOrbitalBuf, defender.unitHP);
    _applyBuffer(defOrbitalBuf, attacker.unitHP);
    _applyBuffer(atkSpearBufFiltered, defender.unitHP);
    _applyBuffer(defSpearBufFiltered, attacker.unitHP);

    // Track total flak negations across all buffers for logging
    const defFlakNegated = atkBarrageFlak.negated + atkFSFlak.negated + atkSpearFlak.negated;
    const atkFlakNegated = defBarrageFlak.negated + defFSFlak.negated + defSpearFlak.negated;
    // Spearhead escort redirects
    const atkSpearRedirected = atkSpearEscort.redirected;
    const defSpearRedirected = defSpearEscort.redirected;

    // Perk hook: Interceptor Role — fighters killed by pre-strike retaliate before pruning
    // Count fighter deaths caused by the pre-strike buffers
    const atkInterceptDeaths = (attacker.unitHP?.fighter?.filter(h => h <= 0).length ?? 0);
    const defInterceptDeaths = (defender.unitHP?.fighter?.filter(h => h <= 0).length ?? 0);
    const atkIntercept = this._perks?.getInterceptorHits(attacker, atkInterceptDeaths) ?? { hits: [], triggered: 0 };
    const defIntercept = this._perks?.getInterceptorHits(defender, defInterceptDeaths) ?? { hits: [], triggered: 0 };
    const atkInterceptBuf = _stageFirstStrike(atkIntercept.hits, defender.unitHP);
    const defInterceptBuf = _stageFirstStrike(defIntercept.hits, attacker.unitHP);
    _applyBuffer(atkInterceptBuf, defender.unitHP);
    _applyBuffer(defInterceptBuf, attacker.unitHP);

    _pruneHP(attacker.unitHP, attacker.composition); attacker.stackSize = _stackSize(attacker.composition);
    _pruneHP(defender.unitHP, defender.composition); defender.stackSize = _stackSize(defender.composition);

    // Verbose entries for pre-strike
    for (const hit of atkBarrageBuf) battle.log.push({ round: rnd, phase: 'verbose',
      text: `  Atk destroyer [${atkTorpedo ? 'Torpedo' : 'Barrage'}] → Def ${hit.type} #${hit.idx + 1}: ${hit.damage} dmg`,
      color: '#553366' });
    for (const hit of defBarrageBuf) battle.log.push({ round: rnd, phase: 'verbose',
      text: `  Def destroyer [${defTorpedo ? 'Torpedo' : 'Barrage'}] → Atk ${hit.type} #${hit.idx + 1}: ${hit.damage} dmg`,
      color: '#553366' });
    for (const [buf, side] of [[atkFSBufFiltered, 'Atk'], [defFSBufFiltered, 'Def'],
                                       [atkOrbitalBuf, 'Atk'], [defOrbitalBuf, 'Def']]) {
      for (const hit of buf) battle.log.push({ round: rnd, phase: 'verbose',
        text: `  ${side} [${buf === atkOrbitalBuf || buf === defOrbitalBuf ? 'Orbital Strike' : 'First Strike'}] → ${side === 'Atk' ? 'Def' : 'Atk'} ${hit.type} #${hit.idx + 1}: ${hit.damage} dmg`,
        color: '#553366' });
    }
    for (const [buf, side] of [[atkSpearBufFiltered, 'Atk'], [defSpearBufFiltered, 'Def']]) {
      for (const hit of buf) battle.log.push({ round: rnd, phase: 'verbose',
        text: `  ${side} flagship [Spearhead] → ${side === 'Atk' ? 'Def' : 'Atk'} ${hit.type} #${hit.idx + 1}: ${hit.damage} dmg`,
        color: '#553366' });
    }
    for (const [buf, side] of [[atkInterceptBuf, 'Atk'], [defInterceptBuf, 'Def']]) {
      for (const hit of buf) battle.log.push({ round: rnd, phase: 'verbose',
        text: `  ${side} fighter [Interceptor] → ${side === 'Atk' ? 'Def' : 'Atk'} ${hit.type} #${hit.idx + 1}: ${hit.damage} dmg`,
        color: '#553366' });
    }

    if (atkBarrageBuf.length > 0) {
      const label = atkTorpedo ? 'Torpedo Spread' : 'Pre-Strike';
      const destroyerCount = atkBarrageShots / BARRAGE_SHOTS_PER_DESTROYER | 0;
      const targetsHit = new Set(atkBarrageBuf.map(h => h.type));
      battle.log.push({ round: rnd, phase: 'prestrike',
        text: `Atk [${label}]: ${destroyerCount} destroyer(s) → ${atkBarrageBuf.length} hit(s) on [${[...targetsHit].join(', ')}]`,
        color: '#aa66ff' });
    }
    if (defBarrageBuf.length > 0) {
      const label = defTorpedo ? 'Torpedo Spread' : 'Pre-Strike';
      const destroyerCount = defBarrageShots / BARRAGE_SHOTS_PER_DESTROYER | 0;
      const targetsHit = new Set(defBarrageBuf.map(h => h.type));
      battle.log.push({ round: rnd, phase: 'prestrike',
        text: `Def [${label}]: ${destroyerCount} destroyer(s) → ${defBarrageBuf.length} hit(s) on [${[...targetsHit].join(', ')}]`,
        color: '#aa66ff' });
    }
    if (atkBarrageBuf.length > 0 || defBarrageBuf.length > 0) {
      ui?.logEvent(`  ↳ Anti-Fighter Barrage: atk ${atkBarrageBuf.length} / def ${defBarrageBuf.length} hit(s)`);
    }
    if (atkFSBuf.length > 0) {
      const totalDmg = atkFSBuf.reduce((s, h) => s + h.damage, 0);
      battle.log.push({ round: rnd, phase: 'prestrike',
        text: `Atk [First Strike]: ${atkFirstStrike.length} ship(s) → ${totalDmg} dmg dealt`,
        color: '#aa66ff' });
    }
    if (defFSBuf.length > 0) {
      const totalDmg = defFSBuf.reduce((s, h) => s + h.damage, 0);
      battle.log.push({ round: rnd, phase: 'prestrike',
        text: `Def [First Strike]: ${defFirstStrike.length} ship(s) → ${totalDmg} dmg dealt`,
        color: '#aa66ff' });
    }
    if (atkOrbitalBuf.length > 0) {
      const drCount = attacker.unitHP?.dreadnaught?.filter(h => h > 0).length ?? 0;
      battle.log.push({ round: rnd, phase: 'prestrike',
        text: `Atk [Orbital Strike]: ${drCount} dreadnaught(s) → ${atkOrbitalBuf.length} ship(s) hit (${atkOrbitalDmg} dmg each)`,
        color: '#aa66ff' });
    }
    if (defOrbitalBuf.length > 0) {
      const drCount = defender.unitHP?.dreadnaught?.filter(h => h > 0).length ?? 0;
      battle.log.push({ round: rnd, phase: 'prestrike',
        text: `Def [Orbital Strike]: ${drCount} dreadnaught(s) → ${defOrbitalBuf.length} ship(s) hit (${defOrbitalDmg} dmg each)`,
        color: '#aa66ff' });
    }
    for (const [intercept, interceptBuf, side] of [
      [atkIntercept, atkInterceptBuf, 'Atk'],
      [defIntercept, defInterceptBuf, 'Def'],
    ]) {
      if (intercept.total > 0) {
        battle.log.push({ round: rnd, phase: 'prestrike',
          text: `💢 ${side} [Interceptor]: ${intercept.triggered}/${intercept.total} fighter(s) retaliated (50% chance)`,
          color: intercept.triggered > 0 ? '#ff8844' : '#664433' });
      }
    }
    if (atkSpearBufFiltered.length > 0) {
      const flagCount = attacker.unitHP?.flagship?.filter(h => h > 0).length ?? 0;
      const totalDmg  = atkSpearBufFiltered.reduce((s, h) => s + h.damage, 0);
      battle.log.push({ round: rnd, phase: 'prestrike',
        text: `Atk [Spearhead]: ${flagCount} flagship(s) → ${totalDmg} dmg to ${atkSpearBufFiltered[0]?.type ?? 'target'}`,
        color: '#aa66ff' });
    }
    if (defSpearBufFiltered.length > 0) {
      const flagCount = defender.unitHP?.flagship?.filter(h => h > 0).length ?? 0;
      const totalDmg  = defSpearBufFiltered.reduce((s, h) => s + h.damage, 0);
      battle.log.push({ round: rnd, phase: 'prestrike',
        text: `Def [Spearhead]: ${flagCount} flagship(s) → ${totalDmg} dmg to ${defSpearBufFiltered[0]?.type ?? 'target'}`,
        color: '#aa66ff' });
    }
    if (atkSpearRedirected > 0) battle.log.push({ round: rnd, phase: 'prestrike',
      text: `🛡 Def [Escort Formation]: ${atkSpearRedirected} Spearhead hit(s) redirected to Cruiser(s)`,
      color: '#44ddaa' });
    if (defSpearRedirected > 0) battle.log.push({ round: rnd, phase: 'prestrike',
      text: `🛡 Atk [Escort Formation]: ${defSpearRedirected} Spearhead hit(s) redirected to Cruiser(s)`,
      color: '#44ddaa' });
    if (defFlakNegated > 0) battle.log.push({ round: rnd, phase: 'prestrike',
      text: `💨 Def [Flak Defense]: ${defFlakNegated} incoming pre-strike hit(s) negated`,
      color: '#44ddaa' });
    if (atkFlakNegated > 0) battle.log.push({ round: rnd, phase: 'prestrike',
      text: `💨 Atk [Flak Defense]: ${atkFlakNegated} incoming pre-strike hit(s) negated`,
      color: '#44ddaa' });

    // Early exit if pre-strike ended the battle
    if (!_anyAlive(attacker) || !_anyAlive(defender)) {
      this._emitRoundUpdate(battle, ui, 0, 0, 0, 0, null, null, null, null, null, null, null, null, null, null, false, false, 0, 0);
      return;
    }

    // ── Phase 3: Main Strike ──────────────────────────────────────────────
    // Snapshot surviving counts AFTER pre-strike for accurate loss reporting.
    const atkCountAfterPS = attacker.stackSize;
    const defCountAfterPS = defender.stackSize;

    // Build attack queues from surviving ships (attacks-per-round entries each)
    const atkQueueBase = _buildAttackQueue(attacker.unitHP);
    const defQueueBase = _buildAttackQueue(defender.unitHP);
    // Perk hook: Command Aura, Dense Formation, Siege Cannons, Last Stand, Swarm Tactics, Hunter Protocol
    const atkQueue = this._perks?.buildAttackQueue(attacker, defender, atkQueueBase) ?? atkQueueBase;
    const defQueue = this._perks?.buildAttackQueue(defender, attacker, defQueueBase) ?? defQueueBase;

    // Stage damage simultaneously — doomed ships excluded from further targeting
    const atkStrike = _stageDamage(atkQueue, defender.unitHP);
    const defStrike = _stageDamage(defQueue, attacker.unitHP);

    // Always store verbose hit entries — rendering is gated by battle.verboseLog in CombatScene
    for (const hit of atkStrike) {
      battle.log.push({ round: rnd, phase: 'verbose',
        text: `  Atk ${hit.atkType} #${hit.atkIdx} → Def ${hit.type} #${hit.idx + 1}: ${hit.damage} dmg`,
        color: '#336644' });
    }
    for (const hit of defStrike) {
      battle.log.push({ round: rnd, phase: 'verbose',
        text: `  Def ${hit.atkType} #${hit.atkIdx} → Atk ${hit.type} #${hit.idx + 1}: ${hit.damage} dmg`,
        color: '#334466' });
    }

    // ── Phase 4: Main Strike Resolution ──────────────────────────────────
    // Perk hook: Wingman Protocol — apply dodge before damage lands
    const atkDodge = this._perks?.applyDodge(attacker, defStrike) ?? { hits: defStrike, dodged: 0, chance: 0 };
    const defDodge = this._perks?.applyDodge(defender, atkStrike) ?? { hits: atkStrike, dodged: 0, chance: 0 };

    // Snapshot fighter counts before applying damage for Kamikaze Protocol
    const atkFightersBefore = attacker.unitHP?.fighter?.filter(h => h > 0).length ?? 0;
    const defFightersBefore = defender.unitHP?.fighter?.filter(h => h > 0).length ?? 0;

    // Perk hook: Escort Formation — each side redirects hits aimed at their own flagship to cruisers
    // atkDodge.hits = defender's attacks that landed → target attacker → attacker's Escort redirects
    // defDodge.hits = attacker's attacks that landed → target defender → defender's Escort redirects
    const atkEscort = this._perks?.applyEscortFormation(attacker, atkDodge.hits) ?? { buf: atkDodge.hits, redirected: 0 };
    const defEscort = this._perks?.applyEscortFormation(defender, defDodge.hits) ?? { buf: defDodge.hits, redirected: 0 };

    _applyBuffer(atkEscort.buf, attacker.unitHP);  // defender's hits land on attacker
    _applyBuffer(defEscort.buf, defender.unitHP);  // attacker's hits land on defender

    // Perk hook: Emergency Shield — flagship survives first lethal hit per battle
    const atkShield = this._perks?.applyEmergencyShield(attacker, battle) ?? false;
    const defShield = this._perks?.applyEmergencyShield(defender, battle) ?? false;

    // Perk hook: Escort Formation — cruisers absorb hits aimed at flagship
    // Applied after dodge so we know which hits actually land
    const atkEscortRedirected = atkEscort.redirected;
    const defEscortRedirected = defEscort.redirected;

    // Perk hook: Kamikaze Protocol — count fighter deaths this phase, stage retaliatory hits
    const atkFightersAfter  = attacker.unitHP?.fighter?.filter(h => h > 0).length ?? 0;
    const defFightersAfter  = defender.unitHP?.fighter?.filter(h => h > 0).length ?? 0;
    const atkFighterDeaths  = atkFightersBefore - atkFightersAfter;
    const defFighterDeaths  = defFightersBefore - defFightersAfter;
    const atkKamikaze = this._perks?.getKamikazeHits(attacker, atkFighterDeaths) ?? { hits: [], triggered: 0 };
    const defKamikaze = this._perks?.getKamikazeHits(defender, defFighterDeaths) ?? { hits: [], triggered: 0 };
    const atkKamikazeBuf = _stageFirstStrike(atkKamikaze.hits, defender.unitHP);
    const defKamikazeBuf = _stageFirstStrike(defKamikaze.hits, attacker.unitHP);
    _applyBuffer(atkKamikazeBuf, defender.unitHP);
    _applyBuffer(defKamikazeBuf, attacker.unitHP);

    // Verbose entries for resolution phase
    // Wingman dodges
    for (const [d, side, tgt] of [[atkDodge, 'Atk', 'Atk'], [defDodge, 'Def', 'Def']]) {
      if (!d || d.dodged === 0) continue;
      battle.log.push({ round: rnd, phase: 'verbose',
        text: `  ${side} [Wingman]: ${d.dodged} hit(s) dodged`,
        color: '#334466' });
    }
    // Kamikaze retaliatory hits
    for (const [buf, side] of [[atkKamikazeBuf, 'Atk'], [defKamikazeBuf, 'Def']]) {
      for (const hit of buf) battle.log.push({ round: rnd, phase: 'verbose',
        text: `  ${side} fighter [Kamikaze] → ${side === 'Atk' ? 'Def' : 'Atk'} ${hit.type} #${hit.idx + 1}: ${hit.damage} dmg`,
        color: '#553322' });
    }

    // Prune dead ships; run cruiser repair for this phase only
    const atkRepairChance = this._perks?.getRepairChance(attacker, 0.5) ?? 0.5;
    const defRepairChance = this._perks?.getRepairChance(defender, 0.5) ?? 0.5;

    // Perk hook: Nanite Repair — runs BEFORE pruning so it can heal damaged (hp>0) cruisers
    // that took damage this round but weren't killed. After pruning, dead ships are gone.
    const atkNanite = this._perks?.applyNaniteRepair(attacker) ?? { healed: 0, eligible: 0 };
    const defNanite = this._perks?.applyNaniteRepair(defender) ?? { healed: 0, eligible: 0 };

    const atkRepair = _pruneHPWithRepair(attacker.unitHP, attacker.composition, atkRepairChance, attacker.maxHP);
    const defRepair = _pruneHPWithRepair(defender.unitHP, defender.composition, defRepairChance, defender.maxHP);

    attacker.stackSize = _stackSize(attacker.composition);
    defender.stackSize = _stackSize(defender.composition);

    // Counts lost in main strike only (not including pre-strike)
    const atkLost = atkCountAfterPS - attacker.stackSize;
    const defLost = defCountAfterPS - defender.stackSize;

    // Log repair results for UIScene
    if (atkRepair.repaired > 0) ui?.logEvent(`🔧 ${atkRepair.repaired}/${atkRepair.dead} atk cruiser(s) repaired!`);
    if (defRepair.repaired > 0) ui?.logEvent(`🔧 ${defRepair.repaired}/${defRepair.dead} def cruiser(s) repaired!`);

    // Emit round update with all results
    this._emitRoundUpdate(battle, ui,
      atkQueue.length, defQueue.length,
      atkLost, defLost,
      atkRepair, defRepair,
      atkDodge, defDodge,
      atkRepairChance, defRepairChance,
      atkKamikaze, defKamikaze,
      atkNanite, defNanite,
      atkShield, defShield,
      atkEscortRedirected, defEscortRedirected);
  }

  // ── Emit round update: write log entries then notify CombatScene ──────────
  _emitRoundUpdate(battle, ui, atkQLen, defQLen, atkLost, defLost, atkRepair, defRepair, atkDodge, defDodge, atkRepairChance, defRepairChance, atkKamikaze, defKamikaze, atkNanite, defNanite, atkShield, defShield, atkEscortR = 0, defEscortR = 0) {
    const { attacker, defender } = battle;
    const rnd = battle.roundNumber;
    const aS  = attacker.stackSize;
    const dS  = defender.stackSize;

    if (!attacker._dead) attacker.updateHealthBar();
    if (!defender._dead) defender.updateHealthBar();
    this._updateOverlay(battle);

    // Main strike log lines
    if (atkQLen > 0) battle.log.push({ round: rnd, phase: 'main',
      text: `Atk [Main Strike]: ${atkQLen} attack(s) → ${defLost} destroyed (${dS} remain)`,
      color: '#44ddaa' });
    if (defQLen > 0) battle.log.push({ round: rnd, phase: 'main',
      text: `Def [Main Strike]: ${defQLen} attack(s) → ${atkLost} destroyed (${aS} remain)`,
      color: '#44ddaa' });

    // Wingman dodge
    for (const [d, side] of [[atkDodge, 'Atk'], [defDodge, 'Def']]) {
      if (!d || d.dodged === 0) continue;
      const total = d.dodged + (d.hits?.length ?? 0);
      battle.log.push({ round: rnd, phase: 'resolution',
        text: `🛡 ${side} [Wingman]: ${d.dodged}/${total} hit(s) dodged (${Math.round(d.chance * 100)}% chance)`,
        color: '#66aaff' });
    }

    // Kamikaze Protocol — log whenever fighters died (shows 0/N when none triggered)
    for (const [k, side] of [[atkKamikaze, 'Atk'], [defKamikaze, 'Def']]) {
      if (!k || (k.total ?? 0) === 0) continue;
      const pct = Math.round((k.chance ?? 0.5) * 100);
      battle.log.push({ round: rnd, phase: 'resolution',
        text: `💥 ${side} [Kamikaze]: ${k.triggered}/${k.total ?? 0} fighter(s) retaliated (${pct}% chance)`,
        color: k.triggered > 0 ? '#ff8844' : '#664433' });
    }

    // Cruiser repair — log whenever cruisers died, even if none were repaired
    for (const [r, side, chance] of [[atkRepair, 'Atk', atkRepairChance], [defRepair, 'Def', defRepairChance]]) {
      if (!r || r.dead === 0) continue;
      const pct = chance != null ? ` (${Math.round(chance * 100)}% chance)` : '';
      battle.log.push({ round: rnd, phase: 'resolution',
        text: `🔧 ${side} [Cruiser Repair]: ${r.repaired}/${r.dead} destroyed cruiser(s) returned${pct}`,
        color: r.repaired > 0 ? '#44ddaa' : '#336644' });
    }

    // Nanite Repair — log whenever there were eligible damaged cruisers
    for (const [n, side] of [[atkNanite, 'Atk'], [defNanite, 'Def']]) {
      if (!n || n.eligible === 0) continue;
      const pct = Math.round((n.chance ?? 0.30) * 100);
      battle.log.push({ round: rnd, phase: 'resolution',
        text: `🧬 ${side} [Nanite Repair]: ${n.healed}/${n.eligible} damaged cruiser(s) restored (${pct}% chance)`,
        color: n.healed > 0 ? '#44ddaa' : '#336644' });
    }

    // Emergency Shield — log when it fires
    if (atkShield) battle.log.push({ round: rnd, phase: 'resolution',
      text: `🛡 Atk [Emergency Shield]: Flagship survived lethal hit!`, color: '#ffdd44' });
    if (defShield) battle.log.push({ round: rnd, phase: 'resolution',
      text: `🛡 Def [Emergency Shield]: Flagship survived lethal hit!`, color: '#ffdd44' });

    // Escort Formation — log when cruisers absorbed hits for flagship
    if (atkEscortR > 0) battle.log.push({ round: rnd, phase: 'resolution',
      text: `🛡 Atk [Escort Formation]: ${atkEscortR} hit(s) redirected from Flagship to Cruiser(s)`, color: '#44ddaa' });
    if (defEscortR > 0) battle.log.push({ round: rnd, phase: 'resolution',
      text: `🛡 Def [Escort Formation]: ${defEscortR} hit(s) redirected from Flagship to Cruiser(s)`, color: '#44ddaa' });

    // Notify CombatScene
    this._scene.game.events.emit('combatUpdate', { battle });

    // UIScene summary
    const atkLostTotal = (battle._atkBefore ?? aS) - aS;
    ui?.logEvent(`⚔ Rnd ${rnd}: ${atkQLen}atk/${defQLen}def — Atk -${atkLostTotal} (${aS}), Def -${defLost} (${dS})`);
  }

  // ── Public: refresh overlay after reinforcements ──────────────────────────
  refreshBattleFor(unit) {
    const battle = this._battles.find(b => b.attacker === unit || b.defender === unit);
    if (!battle) return;
    this._updateOverlay(battle);
    this._scene.game.events.emit('combatUpdate', { battle });
  }

  isInBattle(unit) {
    return this._battles.some(b => b.attacker === unit || b.defender === unit);
  }

  // ── After Combat ─────────────────────────────────────────────────────────
  // Fires once at battle conclusion. Perk hooks attach here.
  _afterCombat(battle, atkAlive, defAlive) {
    // Future: if (atkAlive && attacker.perks?.includes('veterans')) { ... }
  }

  // ── Battle resolution ─────────────────────────────────────────────────────
  _resolveBattleEnd(battle, idx) {
    const { attacker, defender } = battle;
    const scene = this._scene;
    const ui    = scene.scene.get('UIScene');

    const atkAlive = _anyAlive(attacker);
    const defAlive = _anyAlive(defender);

    this._afterCombat(battle, atkAlive, defAlive);
    this._destroyOverlay(battle);

    if (atkAlive) { _fullHeal(attacker); attacker.inCombat = false; attacker.clearHealthBar(); attacker.updateBadge(); attacker.setBadgeVisible(true); }
    if (defAlive) { _fullHeal(defender); defender.inCombat = false; defender.clearHealthBar(); defender.updateBadge(); defender.setBadgeVisible(true); }

    if (!atkAlive && !defAlive) {
      ui?.logEvent('⚔ Mutual destruction!');
      scene._handleStackDestroyed(attacker);
      scene._handleStackDestroyed(defender);
    } else if (!defAlive) {
      ui?.logEvent(`⚔ Attacker wins — ${attacker.stackSize} remain.`);
      scene._handleStackDestroyed(defender);
      scene.updateOwnership(attacker.currentNode);
    } else {
      ui?.logEvent(`⚔ Defender holds — ${defender.stackSize} remain.`);
      scene._handleStackDestroyed(attacker);
      scene.updateOwnership(defender.currentNode);
    }
    scene.updateHUD();

    // Archive completed battle for history log
    if (!this.battleHistory) this.battleHistory = [];
    this.battleHistory.push({
      log:           battle.log,
      verboseRounds: battle.verboseRounds ?? new Set(),
      nodeName:      battle.node?.label ?? battle.nodeId,
      atkSnapshot:   battle.atkSnapshot,
      defSnapshot:   battle.defSnapshot,
      atkTeam:       battle.atkTeam,
      defTeam:       battle.defTeam,
      atkColor:      battle.atkColor,
      defColor:      battle.defColor,
      rounds:        battle.roundNumber,
      outcome:       !atkAlive && !defAlive ? 'mutual' : !defAlive ? 'attacker' : 'defender',
    });
    this._scene.game.events.emit('battleHistoryUpdated', { history: this.battleHistory });

    this._battles.splice(idx, 1);
  }

  // Called when a unit is destroyed externally while in combat
  _endBattle(battle, idx) {
    const { attacker, defender } = battle;
    this._destroyOverlay(battle);
    if (!attacker._dead) { _fullHeal(attacker); attacker.inCombat = false; attacker.clearHealthBar?.(); attacker.updateBadge(); attacker.setBadgeVisible(true); }
    if (!defender._dead) { _fullHeal(defender); defender.inCombat = false; defender.clearHealthBar?.(); defender.updateBadge(); defender.setBadgeVisible(true); }
    this._battles.splice(idx, 1);
    this._scene.updateHUD();
  }

  // ── Overlay ───────────────────────────────────────────────────────────────
  _createOverlay(attacker, defender, node) {
    const scene = this._scene;
    const cx = node.x, cy = node.y;

    const atkBg      = scene.add.graphics().setDepth(12);
    const atkIconGfx = scene.add.graphics().setDepth(13);
    const atkText    = scene.add.text(cx, cy - 44, '', { font: 'bold 11px monospace', color: attacker.teamColorHex }).setOrigin(0, 0.5).setDepth(13);
    const defBg      = scene.add.graphics().setDepth(12);
    const defIconGfx = scene.add.graphics().setDepth(13);
    const defText    = scene.add.text(cx, cy - 23, '', { font: 'bold 11px monospace', color: defender.teamColorHex }).setOrigin(0, 0.5).setDepth(13);
    const hitZone    = scene.add.rectangle(cx, cy - 38, 80, 44, 0xffffff, 0).setDepth(14).setInteractive({ useHandCursor: true });

    return { atkBg, atkIconGfx, atkText, defBg, defIconGfx, defText, hitZone, cx, cy };
  }

  _updateOverlay(battle) {
    const { attacker, defender, overlay } = battle;
    if (!overlay) return;
    const { atkBg, atkIconGfx, atkText, defBg, defIconGfx, defText, cx, cy } = overlay;

    const atkStr = String(attacker._dead ? 0 : attacker.stackSize);
    const defStr = String(defender._dead ? 0 : defender.stackSize);
    const atkColNum = attacker.teamColor;
    const defColNum = defender.teamColor;

    const aTW = Math.max(12, atkStr.length * 7), aPillW = 14 + 6 + aTW + 8, aPillX = cx - aPillW / 2, aPillY = cy - 53;
    atkBg.clear();
    atkBg.fillStyle(0x080c14, 0.88); atkBg.fillRoundedRect(aPillX, aPillY, aPillW, 18, 3);
    atkBg.lineStyle(1.5, atkColNum, 0.8); atkBg.strokeRoundedRect(aPillX, aPillY, aPillW, 18, 3);
    atkIconGfx.clear(); _drawSmallIcon(atkIconGfx, _dominantType(attacker.composition), aPillX + 9, cy - 44, atkColNum);
    atkText.setText(atkStr).setPosition(aPillX + 20, cy - 44);

    const dTW = Math.max(12, defStr.length * 7), dPillW = 14 + 6 + dTW + 8, dPillX = cx - dPillW / 2, dPillY = cy - 32;
    defBg.clear();
    defBg.fillStyle(0x080c14, 0.88); defBg.fillRoundedRect(dPillX, dPillY, dPillW, 18, 3);
    defBg.lineStyle(1.5, defColNum, 0.8); defBg.strokeRoundedRect(dPillX, dPillY, dPillW, 18, 3);
    defIconGfx.clear(); _drawSmallIcon(defIconGfx, _dominantType(defender.composition), dPillX + 9, cy - 23, defColNum);
    defText.setText(defStr).setPosition(dPillX + 20, cy - 23);
  }

  _destroyOverlay(battle) {
    const o = battle.overlay;
    if (!o) return;
    this._scene.game.events.emit('closeCombat', { battle });
    o.atkBg?.destroy(); o.atkIconGfx?.destroy(); o.atkText?.destroy();
    o.defBg?.destroy(); o.defIconGfx?.destroy(); o.defText?.destroy();
    o.hitZone?.destroy();
    battle.overlay = null;
  }

  _drawCooldownArcs() {
    const g = this._gfx;
    g.clear();
    for (const b of this._battles) {
      if (!b.node) continue;
      const cx = b.node.x, cy = b.node.y, r = 38;
      const progress = Math.min(b.cooldownMs / ROUND_COOLDOWN, 1);
      g.lineStyle(4, 0x220000, 0.6);
      g.strokeCircle(cx, cy, r);
      if (progress > 0.005) {
        const start = -Math.PI / 2, end = start + progress * Math.PI * 2;
        const steps = Math.max(8, Math.round(progress * 48));
        const pts = [];
        for (let s = 0; s <= steps; s++) {
          const a = start + (s / steps) * (end - start);
          pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        const col = progress < 0.5
          ? Phaser.Display.Color.GetColor(Math.round(255 * progress * 2), Math.round(210 * (1 - progress * 0.4)), 0)
          : Phaser.Display.Color.GetColor(255, Math.round(210 * (1 - progress)), 0);
        g.lineStyle(4, col, 0.92);
        g.strokePoints(pts, false);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Pure module-level combat functions
// These operate on raw unitHP objects and composition maps, not unit instances.
// This makes them easy to test, reason about, and reuse for perk hooks.
// ══════════════════════════════════════════════════════════════════════════════

// Build a damage buffer for First Strike hits.
// hits: [{ damage }] — one entry per qualifying ship, from perk hook.
// Each hit targets a random living enemy ship.
// Returns [{ type, idx, damage }]
function _stageFirstStrike(hits, targetHP) {
  const buf = [];
  for (const hit of hits) {
    const viable = [];
    for (const type of SHIP_ORDER) {
      const hps = targetHP[type] || [];
      for (let i = 0; i < hps.length; i++) {
        if (hps[i] > 0) viable.push({ type, idx: i });
      }
    }
    if (!viable.length) break;
    const t = viable[Math.floor(Math.random() * viable.length)];
    buf.push({ type: t.type, idx: t.idx, damage: hit.damage });
  }
  return buf;
}

// Stage Spearhead hits — targets enemy flagship first, falls back to random ship
function _stageSpearhead(hits, targetHP) {
  const buf = [];
  for (const hit of hits) {
    // Prefer flagship targets
    const flagships = (targetHP.flagship || [])
      .map((hp, idx) => ({ type: 'flagship', idx, hp }))
      .filter(e => e.hp > 0);
    if (flagships.length > 0) {
      const t = flagships[Math.floor(Math.random() * flagships.length)];
      buf.push({ type: t.type, idx: t.idx, damage: hit.damage });
    } else {
      // Fall back to any living ship
      const viable = [];
      for (const type of SHIP_ORDER) {
        const hps = targetHP[type] || [];
        for (let i = 0; i < hps.length; i++) {
          if (hps[i] > 0) viable.push({ type, idx: i });
        }
      }
      if (!viable.length) break;
      const t = viable[Math.floor(Math.random() * viable.length)];
      buf.push({ type: t.type, idx: t.idx, damage: hit.damage });
    }
  }
  return buf;
}
// Returns [{ type, idx, damage }]
function _stageOrbitalStrike(damagePerShip, targetHP) {
  const buf = [];
  for (const type of SHIP_ORDER) {
    const hps = targetHP[type] || [];
    for (let i = 0; i < hps.length; i++) {
      if (hps[i] > 0) buf.push({ type, idx: i, damage: damagePerShip });
    }
  }
  return buf;
}

// Build a damage buffer for Anti-Fighter Barrage.
// If torpedoSpread is true (Torpedo Spread perk), expands target pool to all ship types
// at 15 damage per shot instead of targeting only fighters at BARRAGE_DAMAGE.
// Staged damage is tracked to avoid wasting shots on already-doomed targets.
// Returns [{ type, idx, damage }]
function _stageBarrage(totalShots, targetHP, torpedoSpread = false) {
  const buf       = [];
  const stagedDmg = {};

  for (let i = 0; i < totalShots; i++) {
    const TORPEDO_DAMAGE = 15;
    const viable = [];

    if (torpedoSpread) {
      // All living ship types are valid targets
      for (const type of SHIP_ORDER) {
        const hps = targetHP[type] || [];
        for (let j = 0; j < hps.length; j++) {
          if (hps[j] <= 0) continue;
          const key = `${type}:${j}`;
          if (hps[j] - (stagedDmg[key] || 0) > 0) viable.push({ type, idx: j, key });
        }
      }
      if (!viable.length) break;
      const t = viable[Math.floor(Math.random() * viable.length)];
      stagedDmg[t.key] = (stagedDmg[t.key] || 0) + TORPEDO_DAMAGE;
      buf.push({ type: t.type, idx: t.idx, damage: TORPEDO_DAMAGE });
    } else {
      // Original behaviour — fighters only
      const hps = targetHP.fighter || [];
      for (let j = 0; j < hps.length; j++) {
        if (hps[j] <= 0) continue;
        const key = `fighter:${j}`;
        if (hps[j] - (stagedDmg[key] || 0) > 0) viable.push({ type: 'fighter', idx: j, key });
      }
      if (!viable.length) break;
      const t = viable[Math.floor(Math.random() * viable.length)];
      stagedDmg[t.key] = (stagedDmg[t.key] || 0) + BARRAGE_DAMAGE;
      buf.push({ type: 'fighter', idx: t.idx, damage: BARRAGE_DAMAGE });
    }
  }
  return buf;
}

// Build a main-strike attack queue from a unit's HP pool.
// Each living ship contributes (attacks-per-round) entries at (damage-per-attack).
// shipIdx is the position of the ship within its type array (for verbose logging).
// Returns [{ shipType, shipIdx, damage }]
function _buildAttackQueue(unitHP) {
  const q = [];
  for (const type of SHIP_ORDER) {
    const hps  = unitHP[type] || [];
    const stat = SHIP_STATS[type];
    for (let i = 0; i < hps.length; i++) {
      if (hps[i] > 0) {
        for (let a = 0; a < stat.attacks; a++) q.push({ shipType: type, shipIdx: i + 1, damage: stat.damage });
      }
    }
  }
  return _shuffle(q);
}

// Stage main-strike damage without applying it.
// Tracks effective HP (actual HP minus already-staged hits) per target.
// Ships whose effective HP reaches 0 are removed from the viable target pool
// so no damage is wasted on already-doomed ships.
// Returns [{ atkType, atkIdx, type, idx, damage }]
function _stageDamage(attackQueue, targetHP) {
  const buf       = [];
  const stagedDmg = {}; // 'type:idx' → total damage staged so far

  for (const atk of attackQueue) {
    const viable = [];
    for (const type of SHIP_ORDER) {
      const hps = targetHP[type] || [];
      for (let i = 0; i < hps.length; i++) {
        if (hps[i] <= 0) continue;
        const key         = `${type}:${i}`;
        const effectiveHP = hps[i] - (stagedDmg[key] || 0);
        if (effectiveHP > 0) viable.push({ type, idx: i, key });
      }
    }
    if (!viable.length) break;

    const t = viable[Math.floor(Math.random() * viable.length)];
    stagedDmg[t.key] = (stagedDmg[t.key] || 0) + atk.damage;
    buf.push({ atkType: atk.shipType, atkIdx: atk.shipIdx, type: t.type, idx: t.idx, damage: atk.damage });
  }
  return buf;
}

// Apply a damage buffer to a unit's HP pool (in-place).
function _applyBuffer(buf, unitHP) {
  for (const hit of buf) {
    const hps = unitHP[hit.type];
    if (!hps || hps[hit.idx] === undefined) continue;
    hps[hit.idx] = Math.max(0, hps[hit.idx] - hit.damage);
  }
}

// Remove dead ships (hp <= 0) from unitHP and sync composition.
// Does NOT run cruiser repair — use _pruneHPWithRepair for Phase 4.
function _pruneHP(unitHP, composition) {
  for (const type of SHIP_ORDER) {
    if (!unitHP[type]) continue;
    unitHP[type]      = unitHP[type].filter(hp => hp > 0);
    composition[type] = unitHP[type].length;
  }
}

// Remove dead ships and run cruiser repair (Phase 4 only).
// repairChance: probability each dead cruiser returns (default 0.5, modified by Field Medics).
// maxHP: per-type max HP map from unit.maxHP (so repaired cruisers return at their team's HP).
// Returns { dead, repaired, failed } — caller logs results in desired order.
function _pruneHPWithRepair(unitHP, composition, repairChance = 0.5, maxHP = SHIP_STATS) {
  let result = { dead: 0, repaired: 0, failed: 0 };

  for (const type of SHIP_ORDER) {
    if (!unitHP[type]) continue;
    const dead = unitHP[type].filter(hp => hp <= 0).length;
    unitHP[type]      = unitHP[type].filter(hp => hp > 0);
    composition[type] = unitHP[type].length;

    if (type === 'cruiser' && dead > 0) {
      result.dead = dead;
      const fullHP = maxHP[type]?.hp ?? maxHP[type] ?? SHIP_STATS[type].hp;
      for (let i = 0; i < dead; i++) {
        if (Math.random() < repairChance) {
          unitHP[type].push(fullHP);
          composition[type]++;
          result.repaired++;
        }
      }
      result.failed = dead - result.repaired;
    }
  }
  return result;
}

// Restore all surviving ships to full HP after combat ends.
// Uses unit.maxHP so perk-boosted teams heal to their correct higher HP.
function _fullHeal(unit) {
  if (!unit.unitHP) return;
  ensureMaxHP(unit);
  for (const type of SHIP_ORDER) {
    const hps   = unit.unitHP[type];
    const maxHP = unit.maxHP[type];
    if (!hps || !maxHP) continue;
    for (let i = 0; i < hps.length; i++) hps[i] = maxHP;
  }
}

// Recalculate stackSize from composition
function _stackSize(composition) {
  return SHIP_ORDER.reduce((s, t) => s + (composition[t] || 0), 0);
}

function _anyAlive(unit) {
  return !unit._dead && unit.stackSize > 0;
}

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _dominantType(comp) {
  for (const t of ['flagship', 'dreadnaught', 'cruiser', 'destroyer', 'fighter']) {
    if ((comp[t] || 0) > 0) return t;
  }
  return 'fighter';
}

function _drawSmallIcon(gfx, type, cx, cy, color) {
  gfx.fillStyle(color, 1);
  switch (type) {
    case 'fighter':     gfx.fillTriangle(cx, cy-5, cx-4, cy+4, cx+4, cy+4); break;
    case 'destroyer':   gfx.fillTriangle(cx-5, cy+4, cx-1, cy-4, cx+1, cy+4); gfx.fillTriangle(cx-1, cy+4, cx+3, cy-4, cx+6, cy+4); break;
    case 'cruiser':     gfx.fillTriangle(cx-5, cy+4, cx-2, cy+4, cx+1, cy-4); gfx.fillTriangle(cx-5, cy+4, cx-2, cy-4, cx+1, cy-4); gfx.fillTriangle(cx+1, cy+4, cx+4, cy+4, cx+6, cy-4); gfx.fillTriangle(cx+1, cy+4, cx+3, cy-4, cx+6, cy-4); break;
    case 'dreadnaught': gfx.fillTriangle(cx-5, cy-4, cx+4, cy, cx-5, cy+4); gfx.fillStyle(color, 0.6); gfx.fillTriangle(cx-1, cy-4, cx+7, cy, cx-1, cy+4); gfx.fillStyle(color, 1); break;
    case 'flagship':    gfx.fillTriangle(cx, cy-6, cx-4, cy, cx+4, cy); gfx.fillTriangle(cx-4, cy, cx+4, cy, cx, cy+6); gfx.fillStyle(0xffffff, 0.9); gfx.fillCircle(cx, cy, 2); break;
  }
}
