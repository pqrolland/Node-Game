export const ROUND_COOLDOWN = 30000;

export const SHIP_STATS = {
  fighter:     { hp: 10, damage:  5, attacks: 1 },
  destroyer:   { hp: 20, damage: 10, attacks: 1 },
  cruiser:     { hp: 20, damage: 10, attacks: 2 },
  dreadnaught: { hp: 50, damage: 20, attacks: 2 },
  flagship:    { hp: 60, damage: 20, attacks: 2 },
};

export const SHIP_ORDER = ['fighter', 'destroyer', 'cruiser', 'dreadnaught', 'flagship'];

export function initUnitHP(unit) {
  unit.unitHP = {};
  for (const type of SHIP_ORDER) {
    const count = unit.composition[type] || 0;
    unit.unitHP[type] = Array.from({ length: count }, () => SHIP_STATS[type].hp);
  }
}

export function syncUnitHP(unit) {
  if (!unit.unitHP) { initUnitHP(unit); return; }
  for (const type of SHIP_ORDER) {
    const count = unit.composition[type] || 0;
    if (!unit.unitHP[type]) unit.unitHP[type] = [];
    while (unit.unitHP[type].length < count) {
      unit.unitHP[type].push(SHIP_STATS[type].hp);
    }
    unit.unitHP[type] = unit.unitHP[type].slice(0, count);
  }
}

export default class CombatManager {
  constructor(scene) {
    this._scene   = scene;
    this._battles = [];
    this._gfx     = scene.add.graphics().setDepth(12);
  }

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

    const nodeId = defender.currentNode;
    const node   = this._scene.nodeMap.get(nodeId);
    const overlay = this._createOverlay(attacker, defender, node);

    const battle = { attacker, defender, nodeId, node, cooldownMs: 0, roundNumber: 0, overlay };
    this._battles.push(battle);

    // Clicking the pill overlay opens the CombatScene detail window
    overlay.hitZone.on('pointerdown', () => {
      this._scene.game.events.emit('openCombat', { battle });
    });
    overlay.hitZone.on('pointerover', () => {
      overlay.atkBg.setAlpha(1.3);
      overlay.defBg.setAlpha(1.3);
    });
    overlay.hitZone.on('pointerout', () => {
      overlay.atkBg.setAlpha(1);
      overlay.defBg.setAlpha(1);
    });

    this._updateOverlay(battle);
    this._fireRound(battle);
  }

  _createOverlay(attacker, defender, node) {
    const scene = this._scene;
    const cx = node.x, cy = node.y;

    const atkBg      = scene.add.graphics().setDepth(12);
    const atkIconGfx = scene.add.graphics().setDepth(13);
    const atkText    = scene.add.text(cx, cy - 44, '', {
      font: 'bold 11px monospace', color: attacker.teamColorHex,
    }).setOrigin(0, 0.5).setDepth(13);

    const defBg      = scene.add.graphics().setDepth(12);
    const defIconGfx = scene.add.graphics().setDepth(13);
    const defText    = scene.add.text(cx, cy - 23, '', {
      font: 'bold 11px monospace', color: defender.teamColorHex,
    }).setOrigin(0, 0.5).setDepth(13);

    // Invisible hit zone covering both pills — clicking opens CombatScene
    const hitZone = scene.add.rectangle(cx, cy - 38, 80, 44, 0xffffff, 0)
      .setDepth(14).setInteractive({ useHandCursor: true });

    return { atkBg, atkIconGfx, atkText, defBg, defIconGfx, defText, hitZone, cx, cy };
  }

  _updateOverlay(battle) {
    const { attacker, defender, overlay } = battle;
    if (!overlay) return;
    const { atkBg, atkIconGfx, atkText, defBg, defIconGfx, defText, cx, cy } = overlay;

    const atkStr    = String(attacker._dead ? 0 : attacker.stackSize);
    const defStr    = String(defender._dead ? 0 : defender.stackSize);
    const atkType   = _dominantType(attacker.composition);
    const defType   = _dominantType(defender.composition);
    const atkColNum = attacker.teamColor;
    const defColNum = defender.teamColor;

    // Attacker pill
    const aTW    = Math.max(12, atkStr.length * 7);
    const aPillW = 14 + 6 + aTW + 8;
    const aPillX = cx - aPillW / 2;
    const aPillY = cy - 53;

    atkBg.clear();
    atkBg.fillStyle(0x080c14, 0.88);
    atkBg.fillRoundedRect(aPillX, aPillY, aPillW, 18, 3);
    atkBg.lineStyle(1.5, atkColNum, 0.8);
    atkBg.strokeRoundedRect(aPillX, aPillY, aPillW, 18, 3);

    atkIconGfx.clear();
    _drawSmallIcon(atkIconGfx, atkType, aPillX + 9, cy - 44, atkColNum);
    atkText.setText(atkStr).setPosition(aPillX + 20, cy - 44);

    // Defender pill
    const dTW    = Math.max(12, defStr.length * 7);
    const dPillW = 14 + 6 + dTW + 8;
    const dPillX = cx - dPillW / 2;
    const dPillY = cy - 32;

    defBg.clear();
    defBg.fillStyle(0x080c14, 0.88);
    defBg.fillRoundedRect(dPillX, dPillY, dPillW, 18, 3);
    defBg.lineStyle(1.5, defColNum, 0.8);
    defBg.strokeRoundedRect(dPillX, dPillY, dPillW, 18, 3);

    defIconGfx.clear();
    _drawSmallIcon(defIconGfx, defType, dPillX + 9, cy - 23, defColNum);
    defText.setText(defStr).setPosition(dPillX + 20, cy - 23);
  }

  _destroyOverlay(battle) {
    const o = battle.overlay;
    if (!o) return;
    // Tell CombatScene this battle is over
    this._scene.game.events.emit('closeCombat', { battle });
    o.atkBg?.destroy();
    o.atkIconGfx?.destroy();
    o.atkText?.destroy();
    o.defBg?.destroy();
    o.defIconGfx?.destroy();
    o.defText?.destroy();
    o.hitZone?.destroy();
    battle.overlay = null;
  }

  update(delta) {
    for (let i = this._battles.length - 1; i >= 0; i--) {
      const b = this._battles[i];

      if (b.attacker._dead || b.defender._dead) {
        this._endBattle(b, i); continue;
      }

      b.cooldownMs += delta;
      if (b.cooldownMs >= ROUND_COOLDOWN) {
        b.cooldownMs = 0;
        this._fireRound(b);
        if (!this._anyAlive(b.attacker) || !this._anyAlive(b.defender)) {
          this._resolveBattleEnd(b, i); continue;
        }
      }
    }
    this._drawCooldownArcs();
  }

  _fireRound(battle) {
    battle.roundNumber++;
    const { attacker, defender } = battle;

    syncUnitHP(attacker);
    syncUnitHP(defender);

    const atkBefore = attacker.stackSize;
    const defBefore = defender.stackSize;

    const atkQ = _shuffle(this._buildAttackQueue(attacker));
    const defQ = _shuffle(this._buildAttackQueue(defender));

    for (const atk of atkQ) {
      const t = this._pickTarget(defender);
      if (!t) break;
      defender.unitHP[t.type][t.idx] = Math.max(0, defender.unitHP[t.type][t.idx] - atk.damage);
    }
    for (const atk of defQ) {
      const t = this._pickTarget(attacker);
      if (!t) break;
      attacker.unitHP[t.type][t.idx] = Math.max(0, attacker.unitHP[t.type][t.idx] - atk.damage);
    }

    this._pruneDeadShips(attacker);
    this._pruneDeadShips(defender);

    if (!attacker._dead) attacker.updateHealthBar();
    if (!defender._dead) defender.updateHealthBar();

    this._updateOverlay(battle);

    // Notify CombatScene to refresh
    this._scene.game.events.emit('combatUpdate', { battle });

    const atkLost = atkBefore - (attacker._dead ? 0 : attacker.stackSize);
    const defLost = defBefore - (defender._dead ? 0 : defender.stackSize);
    const aS = attacker._dead ? 0 : attacker.stackSize;
    const dS = defender._dead ? 0 : defender.stackSize;

    this._scene.scene.get('UIScene')?.logEvent(
      `⚔ Rnd ${battle.roundNumber}: ${atkQ.length}atk/${defQ.length}def — ` +
      `Atk -${atkLost} (${aS}), Def -${defLost} (${dS})`
    );
  }

  _buildAttackQueue(unit) {
    const q = [];
    for (const type of SHIP_ORDER) {
      const hps  = unit.unitHP?.[type] || [];
      const stat = SHIP_STATS[type];
      for (let i = 0; i < hps.length; i++) {
        if (hps[i] > 0) {
          for (let a = 0; a < stat.attacks; a++) q.push({ damage: stat.damage });
        }
      }
    }
    return q;
  }

  _pickTarget(unit) {
    const living = [];
    for (const type of SHIP_ORDER) {
      const hps = unit.unitHP?.[type] || [];
      for (let i = 0; i < hps.length; i++) {
        if (hps[i] > 0) living.push({ type, idx: i });
      }
    }
    if (!living.length) return null;
    return living[Math.floor(Math.random() * living.length)];
  }

  _pruneDeadShips(unit) {
    for (const type of SHIP_ORDER) {
      if (!unit.unitHP?.[type]) continue;
      const dead = unit.unitHP[type].filter(hp => hp <= 0).length;
      unit.unitHP[type]      = unit.unitHP[type].filter(hp => hp > 0);
      unit.composition[type] = unit.unitHP[type].length;

      if (type === 'cruiser' && dead > 0) {
        let repaired = 0;
        for (let i = 0; i < dead; i++) {
          if (Math.random() < 0.5) {
            unit.unitHP[type].push(SHIP_STATS[type].hp);
            unit.composition[type]++;
            repaired++;
          }
        }
        if (repaired > 0) {
          this._scene.scene.get('UIScene')?.logEvent(`🔧 ${repaired} cruiser(s) repaired!`);
        }
      }
    }
    unit.stackSize = SHIP_ORDER.reduce((s, t) => s + (unit.composition[t] || 0), 0);
  }

  _anyAlive(unit) { return !unit._dead && unit.stackSize > 0; }

  _resolveBattleEnd(battle, idx) {
    const { attacker, defender } = battle;
    const scene = this._scene;
    const ui    = scene.scene.get('UIScene');

    const atkAlive = this._anyAlive(attacker);
    const defAlive = this._anyAlive(defender);

    this._destroyOverlay(battle);

    if (atkAlive) {
      attacker.inCombat = false;
      attacker.clearHealthBar();
      attacker.updateBadge();
      attacker.setBadgeVisible(true);
    }
    if (defAlive) {
      defender.inCombat = false;
      defender.clearHealthBar();
      defender.updateBadge();
      defender.setBadgeVisible(true);
    }

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

  _endBattle(battle, idx) {
    const { attacker, defender } = battle;
    this._destroyOverlay(battle);
    if (!attacker._dead) {
      attacker.inCombat = false;
      attacker.clearHealthBar?.();
      attacker.updateBadge();
      attacker.setBadgeVisible(true);
    }
    if (!defender._dead) {
      defender.inCombat = false;
      defender.clearHealthBar?.();
      defender.updateBadge();
      defender.setBadgeVisible(true);
    }
    this._battles.splice(idx, 1);
    this._scene.updateHUD();
  }

  _drawCooldownArcs() {
    const g = this._gfx;
    g.clear();

    for (const b of this._battles) {
      if (!b.node) continue;
      const cx = b.node.x, cy = b.node.y;
      const r        = 38;
      const progress = Math.min(b.cooldownMs / ROUND_COOLDOWN, 1);

      g.lineStyle(4, 0x220000, 0.6);
      g.strokeCircle(cx, cy, r);

      if (progress > 0.005) {
        const start = -Math.PI / 2;
        const end   = start + progress * Math.PI * 2;
        const steps = Math.max(8, Math.round(progress * 48));
        const pts   = [];
        for (let s = 0; s <= steps; s++) {
          const a = start + (s / steps) * (end - start);
          pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        const col = progress < 0.5
          ? Phaser.Display.Color.GetColor(
              Math.round(255 * (progress * 2)),
              Math.round(210 * (1 - progress * 0.4)), 0)
          : Phaser.Display.Color.GetColor(
              255, Math.round(210 * (1 - progress)), 0);
        g.lineStyle(4, col, 0.92);
        g.strokePoints(pts, false);
      }
    }
  }

  isInBattle(unit) {
    return this._battles.some(b => b.attacker === unit || b.defender === unit);
  }

  // Called when a combatant receives reinforcements mid-battle.
  // Updates the overlay counts and notifies CombatScene.
  refreshBattleFor(unit) {
    const battle = this._battles.find(b => b.attacker === unit || b.defender === unit);
    if (!battle) return;
    this._updateOverlay(battle);
    this._scene.game.events.emit('combatUpdate', { battle });
  }
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
  const order = ['flagship', 'dreadnaught', 'cruiser', 'destroyer', 'fighter'];
  for (const t of order) { if ((comp[t] || 0) > 0) return t; }
  return 'fighter';
}

function _drawSmallIcon(gfx, type, cx, cy, color) {
  gfx.fillStyle(color, 1);
  switch (type) {
    case 'fighter':
      gfx.fillTriangle(cx, cy - 5, cx - 4, cy + 4, cx + 4, cy + 4);
      break;
    case 'destroyer':
      gfx.fillTriangle(cx - 5, cy + 4, cx - 1, cy - 4, cx + 1, cy + 4);
      gfx.fillTriangle(cx - 1, cy + 4, cx + 3, cy - 4, cx + 6, cy + 4);
      break;
    case 'cruiser':
      gfx.fillTriangle(cx - 5, cy + 4, cx - 2, cy + 4, cx + 1, cy - 4);
      gfx.fillTriangle(cx - 5, cy + 4, cx - 2, cy - 4, cx + 1, cy - 4);
      gfx.fillTriangle(cx + 1, cy + 4, cx + 4, cy + 4, cx + 6, cy - 4);
      gfx.fillTriangle(cx + 1, cy + 4, cx + 3, cy - 4, cx + 6, cy - 4);
      break;
    case 'dreadnaught':
      gfx.fillTriangle(cx - 5, cy - 4, cx + 4, cy, cx - 5, cy + 4);
      gfx.fillStyle(color, 0.6);
      gfx.fillTriangle(cx - 1, cy - 4, cx + 7, cy, cx - 1, cy + 4);
      gfx.fillStyle(color, 1);
      break;
    case 'flagship':
      gfx.fillTriangle(cx, cy - 6, cx - 4, cy, cx + 4, cy);
      gfx.fillTriangle(cx - 4, cy, cx + 4, cy, cx, cy + 6);
      gfx.fillStyle(0xffffff, 0.9);
      gfx.fillCircle(cx, cy, 2);
      break;
  }
}
