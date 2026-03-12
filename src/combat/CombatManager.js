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

export function initUnitHP(unit) {
  unit.unitHP = {};
  for (const type of SHIP_ORDER) {
    const count = unit.composition[type] || 0;
    unit.unitHP[type] = Array.from({ length: count }, () => SHIP_STATS[type].hp);
  }
}

// Reconcile unitHP with composition.
// Adds full-HP entries for any ships in composition not yet in unitHP.
// Trims excess unitHP entries if composition shrank externally.
export function syncUnitHP(unit) {
  if (!unit.unitHP) { initUnitHP(unit); return; }
  for (const type of SHIP_ORDER) {
    const count = unit.composition[type] || 0;
    if (!unit.unitHP[type]) unit.unitHP[type] = [];
    while (unit.unitHP[type].length < count) unit.unitHP[type].push(SHIP_STATS[type].hp);
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

    syncUnitHP(attacker);
    syncUnitHP(defender);

    attacker.inCombat = true;  defender.inCombat = true;
    attacker.isMoving = false; defender.isMoving = false;
    attacker.path     = [];    defender.path     = [];

    attacker.setBadgeVisible(false);
    defender.setBadgeVisible(false);

    const nodeId  = defender.currentNode;
    const node    = this._scene.nodeMap.get(nodeId);
    const overlay = this._createOverlay(attacker, defender, node);
    const battle  = { attacker, defender, nodeId, node, cooldownMs: 0, roundNumber: 0, overlay, log: [] };
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
    syncUnitHP(attacker);
    syncUnitHP(defender);

    // ── Phase 1 + 2: Pre-Strike & Resolution ─────────────────────────────
    // Count destroyers BEFORE any damage so both sides stage simultaneously.
    const atkBaseShots = (attacker.unitHP.destroyer?.filter(h => h > 0).length ?? 0) * BARRAGE_SHOTS_PER_DESTROYER;
    const defBaseShots = (defender.unitHP.destroyer?.filter(h => h > 0).length ?? 0) * BARRAGE_SHOTS_PER_DESTROYER;
    // Perk hook: Improved Barrage may increase attacker's shot count
    const atkBarrageShots = this._perks?.getBarrageShots(attacker, atkBaseShots) ?? atkBaseShots;
    const defBarrageShots = this._perks?.getBarrageShots(defender, defBaseShots) ?? defBaseShots;

    // Stage barrage damage for both sides independently
    const atkBarrageBuf = _stageBarrage(atkBarrageShots, defender.unitHP);
    const defBarrageBuf = _stageBarrage(defBarrageShots, attacker.unitHP);

    // Apply both buffers, prune dead, log results
    _applyBuffer(atkBarrageBuf, defender.unitHP);
    _applyBuffer(defBarrageBuf, attacker.unitHP);
    _pruneHP(attacker.unitHP, attacker.composition); attacker.stackSize = _stackSize(attacker.composition);
    _pruneHP(defender.unitHP, defender.composition); defender.stackSize = _stackSize(defender.composition);

    if (atkBarrageBuf.length > 0) {
      battle.log.push({ round: rnd, phase: 'prestrike',
        text: `Atk [Pre-Strike]: ${atkBarrageBuf.length / BARRAGE_SHOTS_PER_DESTROYER | 0} destroyer(s) → ${atkBarrageBuf.length} fighter(s) destroyed`,
        color: '#aa66ff' });
    }
    if (defBarrageBuf.length > 0) {
      battle.log.push({ round: rnd, phase: 'prestrike',
        text: `Def [Pre-Strike]: ${defBarrageBuf.length / BARRAGE_SHOTS_PER_DESTROYER | 0} destroyer(s) → ${defBarrageBuf.length} fighter(s) destroyed`,
        color: '#aa66ff' });
    }
    if (atkBarrageBuf.length > 0 || defBarrageBuf.length > 0) {
      ui?.logEvent(`  ↳ Anti-Fighter Barrage: atk ${atkBarrageBuf.length} / def ${defBarrageBuf.length} fighters destroyed`);
    }

    // Early exit if barrage ended the battle
    if (!_anyAlive(attacker) || !_anyAlive(defender)) {
      this._emitRoundUpdate(battle, ui, 0, 0, 0, 0, null, null);
      return;
    }

    // ── Phase 3: Main Strike ──────────────────────────────────────────────
    // Snapshot surviving counts AFTER pre-strike for accurate loss reporting.
    const atkCountAfterPS = attacker.stackSize;
    const defCountAfterPS = defender.stackSize;

    // Build attack queues from surviving ships (attacks-per-round entries each)
    const atkQueueBase = _buildAttackQueue(attacker.unitHP);
    const defQueueBase = _buildAttackQueue(defender.unitHP);
    // Perk hook: Command Aura, Dense Formation may modify damage values
    const atkQueue = this._perks?.buildAttackQueue(attacker, atkQueueBase) ?? atkQueueBase;
    const defQueue = this._perks?.buildAttackQueue(defender, defQueueBase) ?? defQueueBase;

    // Stage damage simultaneously — doomed ships excluded from further targeting
    const atkStrike = _stageDamage(atkQueue, defender.unitHP);
    const defStrike = _stageDamage(defQueue, attacker.unitHP);

    // ── Phase 4: Main Strike Resolution ──────────────────────────────────
    _applyBuffer(atkStrike, defender.unitHP);
    _applyBuffer(defStrike, attacker.unitHP);

    // Prune dead ships; run cruiser repair for this phase only
    const atkRepairChance = this._perks?.getRepairChance(attacker, 0.5) ?? 0.5;
    const defRepairChance = this._perks?.getRepairChance(defender, 0.5) ?? 0.5;
    const atkRepair = _pruneHPWithRepair(attacker.unitHP, attacker.composition, atkRepairChance);
    const defRepair = _pruneHPWithRepair(defender.unitHP, defender.composition, defRepairChance);
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
      atkRepair, defRepair);
  }

  // ── Emit round update: write log entries then notify CombatScene ──────────
  _emitRoundUpdate(battle, ui, atkQLen, defQLen, atkLost, defLost, atkRepair, defRepair) {
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

    // Cruiser repair log lines — after main strike lines
    for (const [r, side] of [[atkRepair, 'Atk'], [defRepair, 'Def']]) {
      if (!r || r.dead === 0) continue;
      if (r.repaired > 0) battle.log.push({ round: rnd, phase: 'resolution',
        text: `🔧 ${side} [Main Strike Res.]: ${r.repaired}/${r.dead} cruiser(s) repaired`,
        color: '#44ddaa' });
      if (r.failed > 0) battle.log.push({ round: rnd, phase: 'resolution',
        text: `✗ ${side} [Main Strike Res.]: ${r.failed}/${r.dead} repair failed`,
        color: '#664444' });
    }

    // Notify CombatScene — log is complete before this fires
    this._scene.game.events.emit('combatUpdate', { battle });

    // UIScene event log summary
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

// Build a damage buffer for Anti-Fighter Barrage.
// Each destroyer fires BARRAGE_SHOTS_PER_DESTROYER shots at distinct fighters.
// Staged damage is tracked to avoid wasting shots on already-doomed targets.
// Returns [{ type: 'fighter', idx, damage }]
function _stageBarrage(totalShots, targetHP) {
  const buf       = [];
  const stagedDmg = {}; // idx → total staged damage on that fighter

  for (let i = 0; i < totalShots; i++) {
    const hps    = targetHP.fighter || [];
    const viable = [];
    for (let j = 0; j < hps.length; j++) {
      if (hps[j] <= 0) continue;
      if (hps[j] - (stagedDmg[j] || 0) > 0) viable.push(j);
    }
    if (!viable.length) break;

    const idx = viable[Math.floor(Math.random() * viable.length)];
    stagedDmg[idx] = (stagedDmg[idx] || 0) + BARRAGE_DAMAGE;
    buf.push({ type: 'fighter', idx, damage: BARRAGE_DAMAGE });
  }
  return buf;
}

// Build a main-strike attack queue from a unit's HP pool.
// Each living ship contributes (attacks-per-round) entries at (damage-per-attack).
// Returns [{ shipType, damage }]
function _buildAttackQueue(unitHP) {
  const q = [];
  for (const type of SHIP_ORDER) {
    const hps  = unitHP[type] || [];
    const stat = SHIP_STATS[type];
    for (let i = 0; i < hps.length; i++) {
      if (hps[i] > 0) {
        for (let a = 0; a < stat.attacks; a++) q.push({ shipType: type, damage: stat.damage });
      }
    }
  }
  return _shuffle(q);
}

// Stage main-strike damage without applying it.
// Tracks effective HP (actual HP minus already-staged hits) per target.
// Ships whose effective HP reaches 0 are removed from the viable target pool
// so no damage is wasted on already-doomed ships.
// Returns [{ type, idx, damage }]
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
    buf.push({ type: t.type, idx: t.idx, damage: atk.damage });
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
// Returns { dead, repaired, failed } — caller logs results in desired order.
function _pruneHPWithRepair(unitHP, composition, repairChance = 0.5) {
  let result = { dead: 0, repaired: 0, failed: 0 };

  for (const type of SHIP_ORDER) {
    if (!unitHP[type]) continue;
    const dead = unitHP[type].filter(hp => hp <= 0).length;
    unitHP[type]      = unitHP[type].filter(hp => hp > 0);
    composition[type] = unitHP[type].length;

    if (type === 'cruiser' && dead > 0) {
      result.dead = dead;
      for (let i = 0; i < dead; i++) {
        if (Math.random() < repairChance) {
          unitHP[type].push(SHIP_STATS[type].hp);
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
// unitHP entries for dead ships are already pruned — only living ships remain.
function _fullHeal(unit) {
  if (!unit.unitHP) return;
  for (const type of SHIP_ORDER) {
    const hps     = unit.unitHP[type];
    const maxHP   = SHIP_STATS[type]?.hp;
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
