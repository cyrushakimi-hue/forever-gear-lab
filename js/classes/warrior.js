/* Warrior (Arms and Fury, levelling). Class module for Forever Gear Lab.
   Rules from the wowsims/forever source (sim/core/rage.go, sim/warrior/*.go) and the WoW Forever spell data:
   Str = 2 attack power, base attack power 3 x level - 20, Agility gives crit only.
   Rage from white hits does not depend on damage: 3.46 x weapon speed for a one-hander, 4.5 x speed for a
   two-hander, half for the off hand, doubled on a crit. Rage from hits taken is 2.5 x (1 - A) x damage / c(level).
   Heroic Strike replaces a main-hand swing and gives no white rage. Rend ticks add 2% of attack power. */
(function (root) {
  'use strict';
  const GL = root.GearLab || (typeof require !== 'undefined' ? require('../core.js') : null);
  const U = GL.util;

  // Rank tables. lvl = level trained, b = base value.
  const D = {
    // Heroic Strike 78, 284, 285, 1608, 11564, 11565, 11566, 11567 (rank 9, 25286, is a book and left out). Cost 15.
    hs: [{ lvl: 1, b: 11 }, { lvl: 8, b: 21 }, { lvl: 16, b: 32 }, { lvl: 24, b: 44 }, { lvl: 32, b: 58 }, { lvl: 40, b: 80 }, { lvl: 48, b: 111 }, { lvl: 56, b: 138 }],
    // Rend 772, 6546, 6547, 6548, 11572, 11573, 11574: damage per 3 s tick and tick count. Cost 10.
    rend: [{ lvl: 4, b: 5, n: 3 }, { lvl: 10, b: 7, n: 4 }, { lvl: 20, b: 9, n: 5 }, { lvl: 30, b: 11, n: 6 }, { lvl: 40, b: 14, n: 7 }, { lvl: 50, b: 18, n: 7 }, { lvl: 60, b: 21, n: 7 }],
    // Overpower 7384, 7887, 11584, 11585: normalized weapon damage plus b. Cost 5, 5 s cooldown.
    op: [{ lvl: 12, b: 5 }, { lvl: 28, b: 15 }, { lvl: 44, b: 25 }, { lvl: 60, b: 35 }],
    // Execute 5308, 20658, 20660, 20661, 20662: base damage from the data; damage per extra rage (r) is the Classic value. Cost 15.
    exec: [{ lvl: 24, b: 125, r: 3 }, { lvl: 32, b: 200, r: 6 }, { lvl: 40, b: 325, r: 9 }, { lvl: 48, b: 450, r: 12 }, { lvl: 56, b: 600, r: 15 }],
    // Slam 1240193, 1464, 8820, 11604, 11605: weapon damage plus b, 1.5 s cast, 15 s cooldown on this server. Cost 15.
    slam: [{ lvl: 20, b: 16 }, { lvl: 30, b: 32 }, { lvl: 38, b: 43 }, { lvl: 46, b: 68 }, { lvl: 54, b: 87 }],
    // Mortal Strike 12294, 21551, 21552, 21553: normalized weapon damage plus b. Cost 30, 6 s cooldown.
    ms: [{ lvl: 40, b: 85 }, { lvl: 48, b: 110 }, { lvl: 54, b: 135 }, { lvl: 60, b: 160 }],
    // Bloodthirst 23881, 23892, 23893, 23894: b plus 45% of attack power. Cost 30, 6 s cooldown.
    bt: [{ lvl: 40, b: 30 }, { lvl: 48, b: 37 }, { lvl: 54, b: 43 }, { lvl: 60, b: 48 }],
    // Battle Shout 6673, 5242, 6192, 11549, 11550, 11551 (rank 7, 25289, is a book). Cost 10.
    bs: [{ lvl: 1, base: 9, ppl: 0.3, bl: 1, ml: 11 }, { lvl: 12, base: 21, ppl: 0.3, bl: 12, ml: 21 }, { lvl: 22, base: 33, ppl: 0.3, bl: 22, ml: 31 },
      { lvl: 32, base: 51, ppl: 0.6, bl: 32, ml: 41 }, { lvl: 42, base: 78, ppl: 0.6, bl: 42, ml: 51 }, { lvl: 52, base: 111, ppl: 0.6, bl: 52, ml: 61 }],
    // Charge 100, 6178, 11578: rage gained.
    charge: [{ lvl: 4, b: 9 }, { lvl: 26, b: 12 }, { lvl: 46, b: 15 }],
  };
  const T = {
    impHS: 12282, impRend: 12286, impCharge: 12285, impOP: 12290, angerMgmt: 12296, deepWounds: 12834, spearing: 1310222,
    twoHand: 12163, impale: 16493, bloodthrill: 1289682, weaponmaster: 1290261, impSlam: 12862, ms: 12294,
    booming: 12321, cruelty: 12320, uw: 12322, furiousPrec: 1323963, enrage: 12317, dwSpec: 23584, reckless: 1329555,
    impExec: 20502, impWW: 1310315, flurry: 12319, bt: 23881, impBloodrage: 12301, focused: 29787, bastion: 16538,
  };
  // Talent tree order from data/talents.json: 17 Arms, 18 Fury, 18 Protection.
  const TREE = [
    [12282, 16462, 12286, 12285, 12295, 12290, 12296, 12834, 1310222, 12163, 16493, 1289682, 12292, 1290261, 12862, 12289, 12294],
    [12321, 12320, 1323964, 12322, 1323963, 12323, 16487, 12317, 23584, 1329555, 20502, 20500, 12328, 1323967, 20504, 1310315, 12319, 23881],
    [12301, 12298, 12962, 12297, 12797, 12287, 12975, 1310316, 12313, 12792, 12308, 1310317, 12311, 12312, 12809, 29787, 16538, 23922],
  ];
  const CYCLE = 45; // assumed seconds from one pull to the next, for Bloodrage (60 s) and Battle Shout (3 min) upkeep

  function treePoints(talents) {
    const p = [0, 0, 0];
    for (let i = 0; i < 3; i++) for (const id of TREE[i]) p[i] += (talents && talents[id]) || 0;
    return p;
  }
  function rank(list, L) { return U.pickRank(list, L); }
  const hasOH = (cfg) => !!(cfg && cfg.oh && cfg.oh.d1 && !cfg.shield && (cfg.level == null || cfg.level >= 20));
  const normSpeed = (w) => (w.twoHand ? 3.3 : (w.type === 'Dagger' ? 1.7 : 2.4));
  function stanceFor(cfg) {
    const L = cfg.level, st = cfg.style || 'auto';
    if (L < 30) return 'battle';
    if (st === 'fury') return 'berserker';
    if (st === 'arms') return 'battle';
    const p = treePoints(cfg.talents);
    return p[1] > p[0] && p[1] >= p[2] ? 'berserker' : 'battle';
  }
  // Rage conversion and the armor the game assumes for rage from hits taken (sim/core/rage.go).
  const rageConv = (L) => 0.0091107836 * L * L + 3.225598133 * L + 4.2652911;
  function takenArmor(L) {
    const rows = [[38, 0.218], [42, 0.239], [44, 0.31], [46, 0.36], [47, 0.377], [50, 0.38], [55, 0.381], [59, 0.38], [63, 0.40]];
    if (L <= rows[0][0]) return rows[0][1];
    for (let i = 1; i < rows.length; i++) if (L <= rows[i][0]) { const a = rows[i - 1], b = rows[i]; return a[1] + (b[1] - a[1]) * (L - a[0]) / (b[0] - a[0]); }
    return 0.40;
  }

  function derive(cfg) {
    const t = (id) => U.tal(cfg, id);
    const L = cfg.level;
    const stance = stanceFor(cfg);
    const bs = rank(D.bs, L);
    const shout = bs ? U.scaled(bs, L) : 0;
    const mh = cfg.mh && cfg.mh.d1 ? cfg.mh : { d1: 1, d2: 2, ws: 2.0, type: 'Fist Weapon' };
    const oh = hasOH(cfg) ? cfg.oh : null;
    const wm = Math.min(5, t(T.weaponmaster));
    const isAxe = (w) => w && (w.type === 'Axe' || w.type === 'Polearm');
    const isMace = (w) => w && (w.type === 'Mace' || w.type === 'Staff');
    const isSword = (w) => w && w.type === 'Sword';
    const baseCritPct = t(T.cruelty) + (stance === 'berserker' ? 3 : 0);
    const prot = treePoints(cfg.talents);
    return {
      L, stance, shout, mh, oh,
      ap: 3 * L - 20 + 2 * cfg.str + (cfg.ap || 0) + shout,
      critMH: U.meleeCrit('Warrior', cfg, baseCritPct + (isAxe(mh) ? wm : 0)),
      critOH: oh ? U.meleeCrit('Warrior', cfg, baseCritPct + (isAxe(oh) ? wm : 0)) : 0,
      armorIgnore: (isMace(mh) || isMace(oh)) ? 0.03 * wm : 0,
      swordMH: isSword(mh) ? 0.01 * wm : 0, swordOH: isSword(oh) ? 0.01 * wm : 0,
      twoHand: mh.twoHand ? 1 + 0.02 * Math.min(3, t(T.twoHand)) : 1,
      bastion: cfg.shield ? 1 + 0.02 * Math.min(5, t(T.bastion)) : 1,
      critMult: 2 + 0.1 * Math.min(2, t(T.impale)),
      hsCost: 15 - Math.min(3, t(T.impHS)), red: Math.min(3, t(T.focused)),
      rendMult: 1 + [0, 0.12, 0.23, 0.35][Math.min(3, t(T.impRend))],
      dwShare: [0, 0.2, 0.4, 0.6][Math.min(3, t(T.deepWounds))],
      opCrit: 0.25 * Math.min(2, t(T.impOP)),
      bloodthrill: 0.10 * Math.min(2, t(T.bloodthrill)),
      slamCast: 1.5 - 0.25 * Math.min(2, t(T.impSlam)), slamCd: 15 - 2.5 * Math.min(2, t(T.impSlam)), slamFree: t(T.impSlam) > 0,
      uw: 0.12 * Math.min(5, t(T.uw)),
      ohHit: [0, 4, 7, 10][Math.min(3, t(T.furiousPrec))] / 100,
      enrage: 0.02 * Math.min(5, t(T.enrage)),
      ohDmg: 0.5 * (1 + 0.05 * Math.min(5, t(T.dwSpec))), ohRage: 1 + 0.10 * Math.min(5, t(T.dwSpec)),
      reckless: t(T.reckless) > 0,
      execCost: 15 - [0, 3, 5][Math.min(2, t(T.impExec))],
      wwCd: 10 - Math.min(2, t(T.impWW)), wwMult: 1 + 0.15 * Math.min(2, t(T.impWW)),
      flurry: 1 + 0.10 * Math.min(3, t(T.flurry)),
      angerMgmt: t(T.angerMgmt) > 0,
      hasMS: t(T.ms) > 0 && L >= 40, hasBT: t(T.bt) > 0 && L >= 40, hasSpear: t(T.spearing) > 0,
      bloodrage: 1 + 0.25 * Math.min(2, t(T.impBloodrage)),
      chargeRage: (rank(D.charge, L) ? rank(D.charge, L).b : 0) + 3 * Math.min(2, t(T.impCharge)),
      shoutCost: 10 * (1 - 0.05 * Math.min(5, t(T.booming))),
      hs: rank(D.hs, L), rend: rank(D.rend, L), op: L >= 12 && stance === 'battle' ? rank(D.op, L) : null,
      exec: rank(D.exec, L), slam: rank(D.slam, L), ms: rank(D.ms, L), bt: rank(D.bt, L),
      ww: L >= 36 && stance === 'berserker', prot: prot[2] > prot[0] && prot[2] > prot[1],
    };
  }

  function run(cfg, fights, seed) {
    const R = U.rng(seed);
    const d = derive(cfg);
    const M = U.mob(cfg);
    const L = d.L, ap = d.ap, mh = d.mh, oh = d.oh;
    const S = mh.ws, mspan = mh.d2 - mh.d1, mavg = (mh.d1 + mh.d2) / 2, nMH = normSpeed(mh);
    const S2 = oh ? oh.ws : 1, ospan = oh ? oh.d2 - oh.d1 : 0, oavg = oh ? (oh.d1 + oh.d2) / 2 : 0, nOH = oh ? normSpeed(oh) : 1;
    const ARM = 1 - M.dr * (1 - d.armorIgnore);
    const hit = (cfg.hit || 0) / 100;
    const missY = Math.max(0, M.miss - hit);
    const missW = Math.max(0, M.miss + (oh ? M.dualWieldMiss : 0) - hit);
    const missO = Math.max(0, M.miss + M.dualWieldMiss - hit - d.ohHit);
    const avoidY = missY + M.dodge + M.parry;
    const mhRage = (mh.twoHand ? 4.5 : 3.46) * S, ohRage = 1.73 * S2 * d.ohRage;
    const takenRage = 2.5 * (1 - takenArmor(L)) * M.dps * M.swing * (d.stance === 'berserker' ? 1.1 : 1) / rageConv(L);
    const mult0 = d.twoHand * d.bastion;
    const pmh = mh.pr || null, poh = oh ? oh.pr || null : null;
    const cost = (c) => Math.max(0, c - d.red);
    const hsCost = cost(d.hsCost), msCost = cost(30), opCost = cost(5), slamCost = cost(15), rendCost = cost(10), wwCost = cost(25), spCost = cost(15);
    const execCost = cost(d.execCost);
    const strike = d.hasMS || d.hasBT;
    const reserve = strike ? 30 : (d.slam ? 15 : 10);
    const parts = { 'White hits': 0, 'Off-hand': 0, 'Heroic Strike': 0, 'Mortal Strike': 0, Bloodthirst: 0, Overpower: 0, Execute: 0,
      Slam: 0, Whirlwind: 0, 'Spearing Strike': 0, Rend: 0, 'Deep Wounds': 0, 'Weapon proc': 0 };
    let totTime = 0, totHp = 0, rageSpent = 0;
    for (let f = 0; f < fights; f++) {
      const hp = M.hp * (0.7 + 0.6 * R());
      const execHp = 0.8 * hp;
      totHp += hp;
      let t = 0, dmg = 0, rage = d.chargeRage;
      let nextMH = 0, nextOH = oh ? 0.2 : 1e9, gcd = 0, check = 0, mobSwing = 0.8;
      let flCh = 0, enrageEnd = -1, opEnd = -1, opReady = 0, msReady = 0, slamReady = 0, wwReady = 0, spReady = 0, rsReady = 0, rsCh = 0, rsEnd = -1;
      let rendEnd = -1, rendNext = 1e9, rendTick = 0;
      let dwNext = 1e9, dwLeft = 0, dwRemain = 0;
      let amNext = d.angerMgmt ? 5 : 1e9, brNext = 1e9, brLeft = 0;
      let guard = 0;
      if (L >= 10 && R() < CYCLE / 60) { rage += 10 * d.bloodrage; brNext = 1; brLeft = 10; }
      if (d.shout > 0 && R() < CYCLE / 180) { rage = Math.max(0, rage - d.shoutCost); gcd = 1.5; check = 1.5; }
      if (rage > 100) rage = 100;
      const mult = () => mult0 * (t < enrageEnd ? 1 + d.enrage : 1);
      const add = (r) => { rage += r; if (rage > 100) rage = 100; };
      const deepWound = (avgW) => {
        if (d.dwShare <= 0) return;
        dwRemain += avgW * d.dwShare;
        if (dwLeft <= 0) dwNext = t + 3;
        dwLeft = 4;
      };
      const onCrit = (avgW) => { deepWound(avgW); if (d.flurry > 1) flCh = 3; };
      // One yellow (special) attack. kind: 0 = normal, 1 = cannot be dodged or parried. Returns damage dealt.
      const yellow = (base, critExtra, kind, avgW) => {
        const r = R();
        if (r < missY) return 0;
        if (kind === 0 && r < avoidY) { if (r < missY + M.dodge) opEnd = t + 5; return 0; }
        let dm = base * ARM * mult();
        if (R() < d.critMH + critExtra) { dm *= d.critMult; onCrit(avgW); }
        return dm;
      };
      const procs = (pr, ws) => { if (pr) { const x = U.procHit(pr, ws, R, ARM, 0); if (x) { dmg += x; parts['Weapon proc'] += x; } } };
      // One white main-hand swing (or Heroic Strike in its place). Returns true when it landed.
      const swingMH = (allowHS) => {
        const flOn = flCh > 0;
        if (flOn) flCh--;
        if (rsCh > 0 && t < rsEnd) { add(5); rsCh--; }
        const execPhase = dmg >= execHp && d.exec;
        if (allowHS && d.hs && !execPhase && rage >= hsCost + reserve) {
          rage -= hsCost; rageSpent += hsCost;
          const base = mh.d1 + mspan * R() + ap / 14 * S + d.hs.b;
          const dm = yellow(base, 0, 0, mavg);
          dmg += dm; parts['Heroic Strike'] += dm;
          if (dm > 0) {
            if (R() < d.uw) add(1);
            if (t < rendEnd && R() < d.bloodthrill) opEnd = t + 5;
            if (d.swordMH && R() < d.swordMH) swingMH(false);
            procs(pmh, S);
          }
          return dm > 0;
        }
        const r = R();
        const base = (mh.d1 + mspan * R() + ap / 14 * S) * ARM * mult();
        let dm = 0, rg = mhRage;
        if (r < missW) return false;
        if (r < missW + M.dodge) { opEnd = t + 5; return false; }
        if (r < missW + M.dodge + M.parry) return false;
        if (r < missW + M.dodge + M.parry + M.glance) dm = base * M.glanceMult;
        else if (r < missW + M.dodge + M.parry + M.glance + d.critMH) { dm = base * 2; rg *= 2; onCrit(mavg); }
        else dm = base;
        dmg += dm; parts['White hits'] += dm; add(rg);
        if (R() < d.uw) add(1);
        if (t < rendEnd && R() < d.bloodthrill) opEnd = t + 5;
        procs(pmh, S);
        if (allowHS && d.swordMH && R() < d.swordMH) swingMH(false);
        return true;
      };
      const swingOH = () => {
        if (flCh > 0) flCh--;
        if (rsCh > 0 && t < rsEnd) { add(5); rsCh--; }
        const r = R();
        const base = (oh.d1 + ospan * R() + ap / 14 * S2) * d.ohDmg * ARM * mult();
        let dm = 0, rg = ohRage;
        if (r < missO) return;
        if (r < missO + M.dodge) { opEnd = t + 5; return; }
        if (r < missO + M.dodge + M.parry) return;
        if (r < missO + M.dodge + M.parry + M.glance) dm = base * M.glanceMult;
        else if (r < missO + M.dodge + M.parry + M.glance + d.critOH) { dm = base * 2; rg *= 2; deepWound(oavg); if (d.flurry > 1) flCh = 3; }
        else dm = base;
        dmg += dm; parts['Off-hand'] += dm; add(rg);
        if (R() < d.uw) add(1);
        procs(poh, S2);
        if (d.swordOH && R() < d.swordOH) swingMH(false);
      };
      const haste = () => (flCh > 0 ? d.flurry : 1);
      // Picks and uses one ability at time t. Returns the time of the next useful check.
      const act = () => {
        const execPhase = dmg >= execHp;
        let soon = 1e9;
        if (d.reckless) { if (rsReady <= t) { rsReady = t + 15; rsCh = 4; rsEnd = t + 8; gcd = t + 1; return gcd; } soon = Math.min(soon, rsReady); }
        if (execPhase && d.exec) {
          if (rage >= execCost) {
            const extra = rage - execCost;
            const dm = yellow(d.exec.b + d.exec.r * extra, 0, 0, mavg);
            rageSpent += dm > 0 ? rage : execCost;
            rage = dm > 0 ? 0 : extra;
            dmg += dm; parts.Execute += dm; gcd = t + 1.5; return gcd;
          }
          return 1e9;
        }
        if (d.op && t < opEnd) {
          if (opReady <= t && rage >= opCost) {
            rage -= opCost; rageSpent += opCost; opEnd = -1; opReady = t + 5;
            const dm = yellow(mh.d1 + mspan * R() + ap / 14 * nMH + d.op.b, d.opCrit, 1, mavg);
            dmg += dm; parts.Overpower += dm; gcd = t + 1.5; return gcd;
          }
          if (opReady > t) soon = Math.min(soon, opReady);
        }
        if (strike) {
          if (msReady <= t) {
            if (rage >= msCost) {
              rage -= msCost; rageSpent += msCost; msReady = t + 6;
              let dm;
              if (d.hasMS) { dm = yellow(mh.d1 + mspan * R() + ap / 14 * nMH + d.ms.b, 0, 0, mavg); parts['Mortal Strike'] += dm; }
              else { dm = yellow(ap * 0.45 + d.bt.b, 0, 0, mavg); parts.Bloodthirst += dm; }
              dmg += dm; gcd = t + 1.5; return gcd;
            }
          } else soon = Math.min(soon, msReady);
        }
        const msSoon = strike && msReady - t < 1.5;
        const spare = rage - (msSoon ? msCost : 0);
        if (d.rend && t >= rendEnd && dmg < 0.5 * hp && spare >= rendCost) {
          rage -= rendCost; rageSpent += rendCost;
          const r = R();
          if (r >= avoidY) { rendEnd = t + 3 * d.rend.n; rendNext = t + 3; rendTick = d.rend.b * d.rendMult; }
          else if (r < missY + M.dodge && r >= missY) opEnd = t + 5;
          gcd = t + 1.5; return gcd;
        }
        if (d.ww) {
          if (wwReady <= t) {
            if (spare >= wwCost) {
              rage -= wwCost; rageSpent += wwCost; wwReady = t + d.wwCd;
              let dm = yellow(mh.d1 + mspan * R() + ap / 14 * nMH, 0, 0, mavg) * d.wwMult;
              if (oh) dm += yellow((oh.d1 + ospan * R() + ap / 14 * nOH) * d.ohDmg, d.critOH - d.critMH, 0, oavg) * d.wwMult;
              dmg += dm; parts.Whirlwind += dm; gcd = t + 1.5; return gcd;
            }
          } else soon = Math.min(soon, wwReady);
        }
        if (d.slam) {
          if (slamReady <= t) {
            if (spare >= slamCost) {
              rage -= slamCost; rageSpent += slamCost; slamReady = t + d.slamCd;
              const dm = yellow(mh.d1 + mspan * R() + ap / 14 * S + d.slam.b, 0, 0, mavg);
              dmg += dm; parts.Slam += dm;
              if (!d.slamFree) nextMH = Math.max(nextMH, t + d.slamCast + S / haste());
              gcd = t + Math.max(d.slamCast, 1.0); return gcd;
            }
          } else soon = Math.min(soon, slamReady);
        }
        if (d.hasSpear) {
          if (spReady <= t) {
            if (spare >= spCost) {
              rage -= spCost; rageSpent += spCost; spReady = t + 20;
              const dm = yellow(0.75 * (mh.d1 + mspan * R() + ap / 14 * nMH), 0, 0, mavg);
              dmg += dm; parts['Spearing Strike'] += dm; gcd = t + 1.5; return gcd;
            }
          } else soon = Math.min(soon, spReady);
        }
        return soon;
      };
      while (dmg < hp && guard++ < 6000) {
        // Next event: 0 main hand, 1 off hand, 2 ability check, 3 mob swing, 4 Rend tick, 5 Deep Wounds tick, 6 Anger Management, 7 Bloodrage tick.
        let ev = 0; t = nextMH;
        if (nextOH < t) { t = nextOH; ev = 1; }
        const ct = Math.max(check, gcd);
        if (ct < t) { t = ct; ev = 2; }
        if (mobSwing < t) { t = mobSwing; ev = 3; }
        if (rendNext < t) { t = rendNext; ev = 4; }
        if (dwNext < t) { t = dwNext; ev = 5; }
        if (amNext < t) { t = amNext; ev = 6; }
        if (brNext < t) { t = brNext; ev = 7; }
        if (ev === 0) {
          swingMH(true);
          nextMH = t + S / haste();
        } else if (ev === 1) {
          swingOH();
          nextOH = t + S2 / haste();
        } else if (ev === 2) {
          const nxt = act();
          check = nxt > t ? nxt : t + 0.1;
          continue;
        } else if (ev === 3) {
          mobSwing = t + M.swing;
          if (R() < 0.85) { add(takenRage); if (d.enrage > 0 && R() < 0.30) enrageEnd = t + 12; }
        } else if (ev === 4) {
          const x = (rendTick + 0.02 * ap) * mult();
          dmg += x; parts.Rend += x;
          rendNext = t + 3 <= rendEnd + 0.001 ? t + 3 : 1e9;
        } else if (ev === 5) {
          const x = dwRemain / dwLeft;
          dmg += x; parts['Deep Wounds'] += x; dwRemain -= x; dwLeft--;
          dwNext = dwLeft > 0 ? t + 3 : 1e9;
        } else if (ev === 6) {
          add(1.5); amNext = t + 5;
        } else {
          add(1 * d.bloodrage); brLeft--; brNext = brLeft > 0 ? t + 1 : 1e9;
        }
        // Rage or state changed, so the rotation may have something to do again.
        if (check > t) check = t;
      }
      totTime += t > 0.5 ? t : 0.5;
    }
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), d, rpm: rageSpent / totTime * 60 };
  }

  function simulate(cfg, fights, seed) {
    const r = run(cfg, fights, seed);
    const d = r.d;
    const notes = [];
    if (d.prot) notes.push('Protection has no levelling rotation of its own here, so the Arms rotation (Battle Stance) is used.');
    if (cfg.oh && cfg.oh.d1 && !d.oh) notes.push(cfg.shield ? 'A shield is equipped, so only the main hand swings.' : 'Dual wield is trained at level 20, so the off-hand weapon does not swing yet.');
    if (d.stance === 'berserker') notes.push('Berserker Stance: no Overpower (it needs Battle Stance, and stance dancing is not modelled).');
    if (d.L >= 20) notes.push('Victory Rush is left out: it needs a kill in the last 20 s, and fights are simulated one at a time.');
    notes.push('Bloodrage is used on about ' + Math.round(Math.min(1, CYCLE / 60) * 100) + '% of pulls and Battle Shout is assumed up, from one pull every ' + CYCLE + ' s.');
    notes.push('Long cooldowns (Death Wish, Recklessness, Sweeping Strikes, Berserker Rage) and the book ranks of Heroic Strike and Battle Shout are left out.');
    const rot = [];
    if (d.hasMS) rot.push('Mortal Strike'); if (d.hasBT) rot.push('Bloodthirst');
    if (d.op) rot.push('Overpower'); if (d.ww) rot.push('Whirlwind'); if (d.slam) rot.push('Slam');
    if (d.hasSpear) rot.push('Spearing Strike'); if (d.rend) rot.push('Rend'); if (d.exec) rot.push('Execute'); if (d.hs) rot.push('Heroic Strike');
    return { dps: r.dps, ttk: r.ttk, share: r.share, notes,
      info: { Stance: d.stance === 'berserker' ? 'Berserker' : 'Battle', 'Weapons': d.oh ? 'Dual wield' : (d.mh.twoHand ? 'Two-handed' : 'One-handed'),
        'Attack power': Math.round(d.ap), 'Melee crit': (d.critMH * 100).toFixed(1) + '%', 'Rage spent per minute': Math.round(r.rpm), Abilities: rot.join(', ') } };
  }

  // Sample levelling builds, in the order points go in (tier rules respected).
  const BUILDS = {
    arms: [[12282, 3], [12286, 3], [12290, 2], [12285, 2], [12296, 1], [12834, 3], [12163, 3], [16493, 2], [1310222, 1], [1290261, 5], [1289682, 2],
      [12862, 2], [12295, 1], [12294, 1], [12320, 5], [12322, 5], [12317, 5], [1329555, 1], [20502, 2], [12321, 2]],
    fury: [[12320, 5], [12322, 5], [12317, 5], [23584, 5], [1329555, 1], [20502, 2], [1323963, 3], [12319, 3], [1310315, 1], [23881, 1], [1310315, 2],
      [12321, 5], [12282, 3], [12286, 2], [12290, 2], [12285, 2], [12296, 1], [12834, 3], [12286, 3]],
  };

  GL.register({
    name: 'Warrior',
    armor: (L) => (L >= 40 ? 'CLMP' : 'CLM'),
    weapons: ['Axe', 'Mace', 'Sword', 'Dagger', 'Staff', 'Polearm', 'Fist Weapon'],
    rangedTypes: ['Bow', 'Gun', 'Crossbow', 'Thrown'],
    shield: true,
    twoHand: true,
    // Any warrior can dual wield from level 20; an Arms-leaning build is treated as a two-hander so off-hands are not suggested.
    dualWield: (L, talents) => { if (L < 20) return false; const p = treePoints(talents || {}); return !(p[0] > p[1]); },
    damageSlots: (cfg) => (hasOH(cfg) ? ['MainHand', 'OffHand'] : ['MainHand']),
    styles: [{ id: 'auto', name: 'Follow the talents' }, { id: 'arms', name: 'Arms, Battle Stance' }, { id: 'fury', name: 'Fury, Berserker Stance' }],
    detectSpec: (talents) => {
      const p = treePoints(talents || {});
      if (p[2] > p[0] && p[2] > p[1]) return { id: 'protection', name: 'Protection' };
      return p[1] > p[0] ? { id: 'fury', name: 'Fury' } : { id: 'arms', name: 'Arms' };
    },
    statKeys: () => ['str', 'agi', 'ap', 'hit', 'crit'],
    unit: () => 'ap',
    schools: () => [],
    simulate,
    sampleTalents: (L, styleId) => {
      const order = BUILDS[styleId === 'fury' ? 'fury' : 'arms'];
      const out = {};
      let pts = Math.max(0, L - 9);
      for (const [id, max] of order) {
        const have = out[id] || 0;
        const r = Math.min(max - have, pts);
        if (r > 0) { out[id] = have + r; pts -= r; }
      }
      return out;
    },
    about: 'Levelling warrior: white swings (both hands when dual wielding) with server rage rules, Heroic Strike as a rage dump, Rend, Overpower, Mortal Strike or Bloodthirst, Whirlwind, Slam, Execute, and the Arms and Fury damage talents.',
  });
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
