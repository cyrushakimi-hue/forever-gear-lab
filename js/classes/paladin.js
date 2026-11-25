/* Paladin (Retribution, levelling). Holy and Protection talents use the same melee rotation.
   Rules from the WoW Forever spell data and the wowsims/forever paladin source:
   Str = 2 attack power, base attack power 3 * level - 20. Seals last 30 s and Judgement does NOT consume the seal
   (10 s cooldown, 6% of base mana). Seal of Righteousness adds Holy damage to every landed white swing
   (value / 100 * speed * 1.2 and 0.12 of spell power for a two-hander, 0.85 and 0.1 for a one-hander).
   Seal of Command is 7 procs a minute (1 s cooldown) for 70% weapon damage, spell power going through the percent.
   Seal of Fury is a flat Holy hit on every swing. Seal of the Crusader adds attack power and swings 1.4 times faster
   for 1/1.4 of the damage; its judgement raises Holy damage taken. Holy Strike is a baseline Holy weapon strike
   on a 10 s cooldown. Holy damage ignores armor. */
(function (root) {
  'use strict';
  const GL = root.GearLab || (typeof require !== 'undefined' ? require('../core.js') : null);
  const U = GL.util;

  // Rank tables. lvl = level trained, base + ppl * (min(level, ml) - bl), var = variance, mana = cost.
  const D = {
    // Seal of Righteousness 21084, 20287..20293. val is effect 2 of Judgement of Righteousness 20187, 20280..20286
    // (per-hit number), j/jp/jv its damage effect. SP coefficient 0.429 on the judgement.
    sor: [
      { lvl: 1, base: 108, ppl: 18, bl: 1, ml: 7, mana: 20, j: 15, jp: 1.8, jv: 0.077 },
      { lvl: 10, base: 216, ppl: 17, bl: 10, ml: 16, mana: 40, j: 26, jp: 1.9, jv: 0.077 },
      { lvl: 18, base: 352, ppl: 23, bl: 18, ml: 24, mana: 60, j: 41, jp: 2.4, jv: 0.098 },
      { lvl: 26, base: 541, ppl: 31, bl: 26, ml: 32, mana: 90, j: 60, jp: 2.8, jv: 0.10 },
      { lvl: 34, base: 785, ppl: 37, bl: 34, ml: 40, mana: 120, j: 82, jp: 3.1, jv: 0.098 },
      { lvl: 42, base: 1082, ppl: 41, bl: 42, ml: 48, mana: 140, j: 107, jp: 3.8, jv: 0.093 },
      { lvl: 50, base: 1407, ppl: 47, bl: 50, ml: 56, mana: 170, j: 137, jp: 4.1, jv: 0.088 },
      { lvl: 58, base: 1786, ppl: 47, bl: 58, ml: 64, mana: 200, j: 170, jp: 4.1, jv: 0.094 }],
    // Seal of Command talent 20375, 20915, 20918, 20919, 20920 (proc 20424: 70% weapon damage, coefficient 0.29).
    // Judgement of Command damage 20467, 20963, 20964, 20965, 20966: halved on a target that is not stunned.
    soc: [
      { lvl: 20, base: 97, ppl: 5.6, bl: 20, ml: 28, var: 0.0825, mana: 65 },
      { lvl: 30, base: 153, ppl: 6.1, bl: 30, ml: 38, var: 0.0915, mana: 110 },
      { lvl: 40, base: 214, ppl: 5.6, bl: 40, ml: 48, var: 0.0935, mana: 140 },
      { lvl: 50, base: 274, ppl: 6.1, bl: 50, ml: 58, var: 0.0949, mana: 180 },
      { lvl: 60, base: 356, ppl: 6.1, bl: 60, ml: 68, var: 0.0955, mana: 210 }],
    // Seal of Fury 1311649, 1311656, 20163, 20419, 20421, 20422, 20423. hit = flat proc (1311647, 1311654, 20231,
    // 20415..20418, coefficient 0.1). base/ppl = Judgement of Fury 1311650, 1311655, 20183, 20411..20414.
    fury: [
      { lvl: 10, hit: 6, base: 23, ppl: 1.71, bl: 10, ml: 16, var: 0.10, mana: 40 },
      { lvl: 18, hit: 9, base: 36.9, ppl: 2.16, bl: 18, ml: 24, var: 0.10, mana: 60 },
      { lvl: 26, hit: 14, base: 54, ppl: 2.52, bl: 25, ml: 31, var: 0.10, mana: 90 },
      { lvl: 34, hit: 19, base: 74, ppl: 2.79, bl: 34, ml: 40, var: 0.0976, mana: 120 },
      { lvl: 42, hit: 25, base: 96, ppl: 3.42, bl: 42, ml: 48, var: 0.0976, mana: 140 },
      { lvl: 50, hit: 32, base: 123, ppl: 3.69, bl: 50, ml: 56, var: 0.0876, mana: 170 },
      { lvl: 58, hit: 35, base: 153, ppl: 3.69, bl: 58, ml: 64, var: 0.0876, mana: 200 }],
    // Seal of the Crusader 21082, 20162, 20305..20308 (attack power), jotc = Judgement of the Crusader 21183, 20188, 20300..20303.
    cru: [
      { lvl: 6, base: 31, ppl: 0.7, bl: 6, ml: 12, mana: 25, jotc: 23 },
      { lvl: 12, base: 51, ppl: 1.1, bl: 12, ml: 20, mana: 40, jotc: 35 },
      { lvl: 22, base: 94, ppl: 1.7, bl: 22, ml: 30, mana: 65, jotc: 58 },
      { lvl: 32, base: 145, ppl: 2, bl: 32, ml: 40, mana: 90, jotc: 92 },
      { lvl: 42, base: 221, ppl: 2.2, bl: 42, ml: 50, mana: 125, jotc: 127 },
      { lvl: 52, base: 306, ppl: 2.4, bl: 52, ml: 60, mana: 160, jotc: 161 }],
    // Holy Strike 679, 678, 1866, 680, 2495, 5569, 10332, 10333: pct% of (normalized weapon + flat + 0.429 SP).
    hs: [
      { lvl: 6, base: 12, ppl: 0.1, bl: 6, ml: 11, pct: 25, mana: 5 },
      { lvl: 12, base: 17, ppl: 0.1, bl: 12, ml: 17, pct: 29, mana: 9 },
      { lvl: 20, base: 19, ppl: 0.2, bl: 20, ml: 25, pct: 32, mana: 12 },
      { lvl: 28, base: 24, ppl: 0.3, bl: 28, ml: 33, pct: 36, mana: 14 },
      { lvl: 36, base: 31, ppl: 1, bl: 36, ml: 41, pct: 39, mana: 16 },
      { lvl: 44, base: 53, ppl: 1.5, bl: 44, ml: 49, pct: 43, mana: 17 },
      { lvl: 52, base: 68, ppl: 2.8, bl: 52, ml: 57, pct: 46, mana: 19 },
      { lvl: 60, base: 93, ppl: 3.2, bl: 60, ml: 65, pct: 50, mana: 20 }],
    // Consecration 26573, 20116, 20922..20924, ticks 1280345..1280349: 8 ticks of (all + bonus), 0.042 SP per tick.
    cons: [
      { lvl: 20, base: 6, mana: 135 }, { lvl: 30, base: 10, mana: 235 }, { lvl: 40, base: 17, mana: 320 },
      { lvl: 50, base: 28, mana: 435 }, { lvl: 60, base: 39, mana: 565 }],
    // Hammer of Wrath 24275, 24274, 24239: 1 s cast, 6 s cooldown, below 20% health.
    how: [
      { lvl: 44, base: 288, ppl: 2.4, bl: 44, ml: 49, var: 0.10, mana: 295 },
      { lvl: 52, base: 388, ppl: 2.7, bl: 52, ml: 57, var: 0.10, mana: 360 },
      { lvl: 60, base: 498, ppl: 3.1, bl: 60, ml: 65, var: 0.098, mana: 425 }],
    // Holy Shock talent 1311606, 20473, 20929, 20930; damage 1311604, 25912, 25911, 25902. 10 s cooldown.
    shock: [
      { lvl: 30, base: 134, mana: 160 }, { lvl: 40, base: 182, mana: 225 }, { lvl: 48, base: 258, mana: 275 }, { lvl: 56, base: 348, mana: 325 }],
    // Retribution Aura 7294, 10298..10301: Holy damage to a mob that strikes the paladin.
    ret: [{ lvl: 16, base: 5 }, { lvl: 26, base: 8 }, { lvl: 36, base: 12 }, { lvl: 46, base: 16 }, { lvl: 56, base: 20 }],
    // Blessing of Might 19740, 19834..19838, 25291 (cast on self).
    bom: [{ lvl: 4, base: 14 }, { lvl: 12, base: 25 }, { lvl: 22, base: 40 }, { lvl: 32, base: 61 }, { lvl: 42, base: 83 }, { lvl: 52, base: 112 }, { lvl: 60, base: 133 }],
  };
  const T = { divStr: 20262, impSeals: 20224, holyConduit: 1237268, divPrec: 1310904, consGround: 1310905, holyShock: 1311606,
    divInt: 20257, precision: 20189, shieldsworn: 1328544, benediction: 20101, impJudge: 25956, conviction: 20117,
    sanctJudge: 1311074, soc: 20375, sacredArb: 1311087, twoHand: 20111, vengeance: 20049, champion: 1311084, swift: 1310994,
    unsealed: 1310735 };
  // Talent tree order from data/talents.json (17 per tree: Holy, Protection, Retribution).
  const ORDER = [20205, 20262, 20237, 1310899, 20224, 429144, 20216, 20210, 1237268, 1310904, 426065, 1328548, 1310905, 1311606, 1328550, 5923, 1310911,
    20257, 20127, 20189, 20174, 1224697, 1311015, 20487, 20150, 20143, 1310994, 20468, 20096, 1328546, 20925, 20177, 1311034, 1328544,
    20060, 20101, 25956, 20117, 1311074, 9452, 9453, 20375, 26022, 9799, 1311087, 20111, 1328370, 20066, 20049, 1311084, 1310735];
  const TREES = ['Holy', 'Protection', 'Retribution'];

  // Base mana by level: 60 at level 1 and 1512 at level 60 as in Classic; the curve between is an estimate.
  const baseMana = (L) => 60 + 1452 * Math.pow(Math.max(0, L - 1) / 59, 1.3);
  const val = (r, L) => (r ? U.scaled(r, L) : 0);

  function treePoints(talents) {
    const pts = [0, 0, 0];
    for (let i = 0; i < ORDER.length; i++) pts[Math.floor(i / 17)] += (talents && talents[ORDER[i]]) || 0;
    return pts;
  }

  function derive(cfg) {
    const t = (id) => U.tal(cfg, id);
    const L = cfg.level;
    const str = (cfg.str || 0) * (1 + 0.02 * Math.min(5, t(T.divStr)));
    const int = (cfg.int || 0) * (1 + 0.02 * Math.min(5, t(T.divInt)));
    const w = cfg.mh && cfg.mh.d1 ? cfg.mh : null;
    const twoH = !!(w && w.twoHand);
    const bene = 1 - 0.02 * Math.min(5, t(T.benediction));
    const conv = 2 * Math.min(3, t(T.conviction));
    const prec = Math.min(3, t(T.precision));
    const sj = Math.min(3, t(T.sanctJudge));
    const shield = !!cfg.shield;
    const cru = U.pickRank(D.cru, L);
    return {
      L, w, twoH,
      ap: 3 * L - 20 + 2 * str + (cfg.ap || 0) + val(U.pickRank(D.bom, L), L),
      sp: U.spellPower(cfg, 'hol') + 0.12 * Math.min(5, t(T.champion)) * int,
      crit: U.meleeCrit('Paladin', cfg, conv),
      scrit: U.spellCrit('Paladin', Object.assign({}, cfg, { int }), conv),
      hit: (cfg.hit || 0) + prec,
      shit: prec + 4 * Math.min(2, t(T.divPrec)),
      mana: baseMana(L) + Math.min(20, int) + 15 * Math.max(0, int - 20),
      jCost: 0.06 * baseMana(L) * bene,
      jCd: 10 - Math.min(2, t(T.impJudge)),
      bene, conduit: 1 - 0.2 * Math.min(2, t(T.holyConduit)),
      sjChance: [0, 0.33, 0.66, 1][sj], sjRefund: 0.2 * sj,
      impSeals: 1 + 0.03 * Math.min(5, t(T.impSeals)),
      m2: twoH ? 1 + 0.02 * Math.min(3, t(T.twoHand)) : 1,
      veng: 0.01 * Math.min(3, t(T.vengeance)),
      cg: 0.05 * Math.min(2, t(T.consGround)),
      sacred: t(T.sacredArb) > 0 ? 1.2 : 1,
      hasSoc: t(T.soc) > 0 && L >= 20, hasSwift: t(T.swift) > 0, hasShock: t(T.holyShock) > 0,
      hsCd: shield && t(T.shieldsworn) > 0 ? 6 : 10,
      sor: U.pickRank(D.sor, L), soc: U.pickRank(D.soc, L), fury: U.pickRank(D.fury, L), cru,
      cruAp: val(cru, L), jotc: cru ? cru.jotc : 0,
      hs: U.pickRank(D.hs, L), cons: U.pickRank(D.cons, L), how: U.pickRank(D.how, L),
      shock: U.pickRank(D.shock, L), ret: U.pickRank(D.ret, L),
    };
  }

  // mode: 'sor', 'soc', 'fury', 'cru', or 'cru+sor' / 'cru+soc' (judge the Crusader first, then switch seals).
  function run(cfg, mode, fights, seed) {
    const R = U.rng(seed);
    const d = derive(cfg);
    const M = U.mob(cfg);
    const L = d.L;
    const w = d.w || { d1: 1, d2: 2, ws: 2.0 };
    const wmin = w.d1, wspan = w.d2 - w.d1, S = w.ws;
    const norm = w.twoHand ? 3.3 : (w.type === 'Dagger' ? 1.7 : 2.4);
    const pr = w.pr || null;
    const ARM = 1 - M.dr;
    const miss = Math.max(0, M.miss - d.hit / 100);
    const tParry = miss + M.dodge + M.parry, tGlance = tParry + M.glance;
    const smiss = Math.max(0.01, M.spellMiss - d.shit / 100);
    const crit = d.crit, scrit = d.scrit;
    const twist = mode.indexOf('cru+') === 0;
    const main = twist ? mode.slice(4) : mode;
    const sealRank = d[main];
    const sealCost = (m) => d[m].mana * d.bene;
    // Seal of Righteousness per-hit numbers.
    const sorHand = d.twoH ? 1.2 : 0.85 - 0.2 * Math.max(0, 2.0 - S);
    const sorCoef = d.twoH ? 0.12 : 0.1;
    const sorVal = main === 'sor' ? val(d.sor, L) / 100 * S * sorHand : 0;
    const socChance = 7 * S / 60;
    const hsBase = val(d.hs, L), hsPct = d.hs ? d.hs.pct / 100 : 0;
    const consTick = d.cons ? d.cons.base : 0;
    const consCost = d.cons ? d.cons.mana * d.bene * d.conduit : 1e9;
    const howCost = d.how ? d.how.mana * d.conduit : 1e9;
    const howCast = 1;
    const retDmg = d.ret ? d.ret.base : 0;
    const parts = { 'White hits': 0, 'Seal hits': 0, Judgement: 0, 'Holy Strike': 0, 'Holy Shock': 0, Consecration: 0,
      'Hammer of Wrath': 0, 'Retribution Aura': 0, 'Weapon proc': 0 };
    let totTime = 0, totHp = 0;

    for (let f = 0; f < fights; f++) {
      const hp = M.hp * (0.7 + 0.6 * R());
      totHp += hp;
      let mana = d.mana;
      // The first seal is cast just before the pull.
      let seal = twist ? 'cru' : main;
      mana -= sealCost(seal);
      let sealExp = 30, jotc = 0;
      let t = 0, dmg = 0, nextSwing = 0, mobSwing = 1.0, gcd = 0;
      let jReady = 0, swiftReady = d.hasSwift ? 0 : 1e9, hsReady = d.hs ? 0 : 1e9, shockReady = d.hasShock && d.shock ? 0 : 1e9;
      let consReady = d.cons ? 0 : 1e9, howReady = d.how ? 0 : 1e9;
      let consEnd = -1, consNext = 1e9, consLeft = 0, socIcd = 0, stacks = 0, vengExp = 0;
      let guard = 0;
      const reserve = sealRank ? sealCost(main) + d.jCost : 0;
      while (dmg < hp && guard++ < 5000) {
        const vm = (t < vengExp ? 1 + d.veng * stacks : 1) * d.m2;
        const hm = vm * (t < consEnd ? 1 + d.cg : 1);
        const onCrit = () => { if (d.veng > 0) { stacks = Math.min(5, stacks + 1); vengExp = t + 30; } };
        const sealUp = seal && t < sealExp;
        // Which judgement is worth casting now.
        const judgeOk = sealUp && (seal !== 'cru' || !jotc);
        // Next action on the global cooldown.
        const execute = dmg >= 0.8 * hp;
        let next = 1e9, act = 0;
        const consider = (ready, id) => { const at = Math.max(gcd, ready); if (at < next) { next = at; act = id; } };
        if (twist && seal === 'cru' && jotc && mana >= sealCost(main)) consider(t, 1);
        else if (!sealUp && seal && mana >= sealCost(seal === 'cru' && twist ? main : seal)) consider(sealExp, 1);
        if (execute && d.how && mana >= howCost) consider(howReady, 2);
        if (d.hs && mana - d.hs.mana * d.bene >= reserve * 0.5) consider(hsReady, 3);
        if (shockReady < 1e9 && mana - d.shock.mana * d.bene >= reserve) consider(shockReady, 4);
        if (d.cons && mana - consCost >= reserve && hp - dmg > 8 * consTick * 3) consider(consReady, 5);
        let ev = 0, te = nextSwing;
        if (judgeOk && mana >= d.jCost && jReady < te) { te = jReady; ev = 1; }
        if (judgeOk && swiftReady < te) { te = swiftReady; ev = 6; }
        if (next < te) { te = next; ev = 2; }
        if (mobSwing < te) { te = mobSwing; ev = 3; }
        if (consNext < te) { te = consNext; ev = 4; }
        if (te < t) te = t;
        t = te;
        if (ev === 0) {
          // White swing (Seal of the Crusader: 1.4 times faster, 1/1.4 of the damage, attack power included).
          const cr = seal === 'cru' && t < sealExp;
          const ap = d.ap + (cr ? d.cruAp : 0);
          const r = R();
          let base = (wmin + wspan * R() + ap / 14 * S) * ARM * vm;
          if (cr) base /= 1.4;
          let d0 = 0, landed = false;
          if (r < tParry) d0 = 0;
          else if (r < tGlance) { d0 = base * M.glanceMult; landed = true; }
          else if (r < tGlance + crit) { d0 = base * 2; landed = true; onCrit(); }
          else { d0 = base; landed = true; }
          dmg += d0; parts['White hits'] += d0;
          nextSwing = t + (cr ? S / 1.4 : S);
          if (landed && t < sealExp) {
            let s0 = 0;
            if (seal === 'sor') {
              s0 = (sorVal + sorCoef * (d.sp + jotc)) * d.impSeals * hm;
              if (R() < crit) { s0 *= 2; onCrit(); }
            } else if (seal === 'fury') {
              s0 = (d.fury.hit + 0.1 * (d.sp + jotc)) * d.impSeals * hm;
              if (R() < crit) { s0 *= 2; onCrit(); }
            } else if (seal === 'soc' && t >= socIcd && R() < socChance) {
              socIcd = t + 1;
              if (R() >= tParry) {
                s0 = ((wmin + wspan * R() + ap / 14 * S) + 0.29 * d.sp) * 0.7 * d.impSeals * hm + 0.29 * jotc;
                if (R() < crit) { s0 *= 2; onCrit(); }
              }
            }
            dmg += s0; parts['Seal hits'] += s0;
          }
          if (landed && pr) { const p0 = U.procHit(pr, cr ? S / 1.4 : S, R, ARM, scrit); dmg += p0; parts['Weapon proc'] += p0; }
        } else if (ev === 1 || ev === 6) {
          // Judgement (or Swift Judgement, free on a 60 s cooldown). It does not consume the seal.
          if (ev === 1) { mana -= d.jCost; jReady = t + d.jCd; } else swiftReady = t + 60;
          if (d.sjChance > 0 && R() < d.sjChance) mana += d[seal].mana * (2 - d.bene) * d.sjRefund;
          if (seal === 'cru') { jotc = d.jotc; continue; }
          let d0 = 0;
          if (R() >= miss) {
            let b;
            if (seal === 'sor') b = (d.sor.j + d.sor.jp * Math.max(0, Math.min(L, d.sor.ml) - d.sor.bl)) * (1 + d.sor.jv * (2 * R() - 1));
            else if (seal === 'soc') b = val(d.soc, L) / 2 * (1 + d.soc.var * (2 * R() - 1));
            else b = val(d.fury, L) * (1 + d.fury.var * (2 * R() - 1));
            d0 = (b + 0.429 * d.sp) * d.impSeals * hm + 0.429 * jotc;
            if (R() < crit) { d0 *= 2; onCrit(); }
          }
          dmg += d0; parts.Judgement += d0;
          continue;
        } else if (ev === 2) {
          if (act === 1) {
            seal = (twist && seal === 'cru') ? main : seal;
            mana -= sealCost(seal); sealExp = t + 30; gcd = t + 1.5;
          } else if (act === 2) {
            mana -= howCost; howReady = t + 6;
            const cast = howCast - 0.2 * Math.min(5, U.tal(cfg, T.champion));
            gcd = t + Math.max(1, cast);
            if (cast > 0) nextSwing = Math.max(nextSwing, t + cast);
            let d0 = 0;
            if (R() >= miss) {
              d0 = (val(d.how, L) * (1 + d.how.var * (2 * R() - 1)) + 0.429 * d.sp) * hm + 0.429 * jotc;
              if (R() < crit) { d0 *= 2; onCrit(); }
            }
            dmg += d0; parts['Hammer of Wrath'] += d0;
          } else if (act === 3) {
            mana -= d.hs.mana * d.bene; hsReady = t + d.hsCd; gcd = t + 1.5;
            const cr = seal === 'cru' && t < sealExp;
            const ap = d.ap + (cr ? d.cruAp : 0);
            let d0 = 0;
            if (R() >= tParry) {
              d0 = hsPct * ((wmin + wspan * R() + ap / 14 * norm) + hsBase * (1 + 0.25 * (2 * R() - 1)) + 0.429 * d.sp) * d.sacred * hm + 0.429 * jotc;
              if (R() < crit) { d0 *= 2; onCrit(); }
            }
            dmg += d0; parts['Holy Strike'] += d0;
          } else if (act === 4) {
            mana -= d.shock.mana * d.bene; shockReady = t + 10; gcd = t + 1.5;
            let d0 = 0;
            if (R() >= smiss) {
              d0 = (d.shock.base * (1 + 0.076 * (2 * R() - 1)) + 0.429 * d.sp) * hm + 0.429 * jotc;
              if (R() < scrit) { d0 *= 1.5; onCrit(); }
            }
            dmg += d0; parts['Holy Shock'] += d0;
          } else if (act === 5) {
            mana -= consCost; consReady = t + 8; gcd = t + 1.5;
            consEnd = t + 8.6; consNext = t + 1; consLeft = 8;
          }
        } else if (ev === 3) {
          mobSwing = t + M.swing;
          if (retDmg > 0 && R() < 0.85) { const d0 = retDmg * hm; dmg += d0; parts['Retribution Aura'] += d0; }
        } else if (ev === 4) {
          let d0 = 0;
          if (R() >= smiss) {
            d0 = (consTick + 0.042 * d.sp) * hm + 0.042 * jotc;
            if (R() < scrit) d0 *= 1.5;
          }
          dmg += d0; parts.Consecration += d0;
          consLeft--; consNext = consLeft > 0 ? t + 1 : 1e9;
        }
      }
      totTime += t > 0.5 ? t : 0.5;
    }
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), d };
  }

  const SEAL_NAMES = { sor: 'Seal of Righteousness', soc: 'Seal of Command', fury: 'Seal of Fury', cru: 'Seal of the Crusader',
    'cru+sor': 'Crusader judged, then Righteousness', 'cru+soc': 'Crusader judged, then Command' };

  function simulate(cfg, fights, seed) {
    const d = derive(cfg);
    const modes = [];
    if (d.sor) modes.push('sor');
    if (d.hasSoc && d.soc) modes.push('soc');
    if (d.fury) modes.push('fury');
    if (d.cru) {
      modes.push('cru');
      if (d.sor) modes.push('cru+sor');
      if (d.hasSoc && d.soc) modes.push('cru+soc');
    }
    let forced = cfg.seal && modes.indexOf(cfg.seal) >= 0 ? cfg.seal : null;
    let mode = forced || modes[0], best = null;
    if (forced) best = run(cfg, forced, fights, seed);
    else {
      // Quick pass to rank the seals, then a full run of the two best.
      const quick = modes.map((m) => ({ m, dps: modes.length > 2 ? run(cfg, m, Math.max(200, Math.floor(fights / 8)), seed).dps : 0 }));
      quick.sort((a, b) => b.dps - a.dps);
      for (const q of quick.slice(0, 2)) {
        const r = run(cfg, q.m, fights, seed);
        if (!best || r.dps > best.dps) { best = r; mode = q.m; }
      }
    }
    const pts = treePoints(cfg.talents);
    const notes = [];
    if (pts[0] > pts[2] || pts[1] > pts[2]) notes.push('Holy and Protection have no rotation of their own here: the Retribution-style melee rotation runs with the talents you have.');
    notes.push('Exorcism and Holy Wrath only hit Undead and Demons on this server, so they are left out; healing, Oath of Light and Light\'s Vigil are not damage and are left out.');
    if (U.tal(cfg, T.unsealed) > 0) notes.push('Unsealed Wrath is not modelled: it only pays when you change seals in the middle of a fight.');
    notes.push('Blessing of Might on yourself and Retribution Aura are assumed. No mana comes back during a fight apart from Sanctified Judgement.');
    if (cfg.level < 10) notes.push('Below level 10 only Seal of Righteousness and Holy Strike are trained.');
    return { dps: best.dps, ttk: best.ttk, share: best.share, notes,
      info: { 'Best seal': SEAL_NAMES[mode], 'Melee crit': (d.crit * 100).toFixed(1) + '%', 'Spell crit': (d.scrit * 100).toFixed(1) + '%',
        'Attack power': Math.round(d.ap), 'Holy spell power': Math.round(d.sp), 'Mana': Math.round(d.mana) } };
  }

  GL.register({
    name: 'Paladin',
    armor: (L) => (L >= 40 ? 'CLMP' : 'CLM'),
    weapons: ['Axe', 'Mace', 'Sword', 'Polearm'],
    rangedTypes: [],
    shield: true,
    twoHand: true,
    dualWield: () => false,
    damageSlots: () => ['MainHand'],
    styles: [{ id: 'auto', name: 'Follow the talents (melee with seals and judgements)' }],
    detectSpec: (talents) => {
      const pts = treePoints(talents || {});
      let i = 2;
      if (pts[0] > pts[i]) i = 0;
      if (pts[1] > pts[i]) i = 1;
      return { id: TREES[i].toLowerCase(), name: TREES[i] };
    },
    statKeys: () => ['str', 'agi', 'int', 'ap', 'sp', 'hit', 'crit', 'scrit'],
    unit: () => 'ap',
    schools: () => ['hol'],
    simulate,
    // A typical Retribution levelling build at this level: { talent spell id: rank }.
    sampleTalents: (L) => {
      const order = [[20101, 5], [20117, 3], [25956, 2], [20375, 1], [1311074, 3], [26022, 1], [20111, 3], [1311087, 1], [9799, 1],
        [20049, 3], [9452, 2], [1311084, 5], [1310735, 1], [20262, 5], [20224, 5], [1237268, 2], [9452, 0], [26022, 1], [9453, 2], [20066, 1], [20205, 2]];
      const out = {};
      let pts = Math.max(0, L - 9);
      for (const [id, max] of order) { const r = Math.min(max, pts); if (r > 0) out[id] = (out[id] || 0) + r; pts -= r; }
      return out;
    },
    about: 'Retribution paladin: white hits, the best seal (Righteousness, Command, Fury or Crusader first), Judgement on cooldown, Holy Strike, Consecration when mana allows and Hammer of Wrath at low health.',
  });
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
