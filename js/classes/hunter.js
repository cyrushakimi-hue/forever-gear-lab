/* Hunter (levelling, at range with the pet holding the mob).
   Rules from the wowsims/forever source: Agility = 2 ranged attack power and 1 melee attack power, Auto Shot is the
   ranged weapon roll plus ammo dps times speed plus ranged attack power / 14 times speed, Aimed Shot, Multi-Shot and
   Sniper Shot use the normalized 2.8 s speed (Aimed Shot and Multi-Shot add a flat 9), Arcane Shot takes 15% of ranged
   attack power, each Serpent Sting tick takes 5%, Multi-Shot has a 0.5 s cast, cast times shorten with ranged haste.
   The pet's swing is built from the creature damage per second for its level (1.4 x that per 2 s swing, plus attack
   power of 0.3 x 14 x creature dps and 10% of the owner's), times 1.25 for happiness and 1.10 for a Cat.
   Summon Hawk (a Beast Mastery talent here) dive-bombs for its base plus 5% ranged attack power and leaves a hawk
   for 18 s (two at once) that swings every 2.5 s at owner ranged speed with 80% of owner ranged attack power. */
(function (root) {
  'use strict';
  const GL = root.GearLab || (typeof require !== 'undefined' ? require('../core.js') : null);
  const U = GL.util;
  // Rank tables from tools/spelldump/hunter.json: [level trained, value, mana cost (flat) or 0, cost as % of base mana or 0].
  const D = {
    hawk: [[10, 20], [18, 35], [28, 50], [38, 70], [48, 90], [58, 110], [60, 120]],            // Aspect of the Hawk 13165..14322, 25296 (book)
    mark: [[6, 26, 15], [22, 59, 30], [40, 98, 45], [58, 143, 60]],                          // Hunter's Mark 1130, 14323, 14324, 14325 (effect 2)
    arcane: [[6, 25], [12, 35], [20, 50], [28, 85], [36, 120], [44, 175], [52, 220], [60, 280]], // Arcane Shot 3044, 14281..14287, 11% base mana
    sting: [[4, 3, 15], [10, 7, 30], [18, 14, 50], [26, 26, 80], [34, 40, 115], [42, 58, 150], [50, 75, 190], [58, 100, 230], [60, 135, 250]], // Serpent Sting 1978, 13549..13555, 25295 (per 3 s tick, 15 s)
    aimed: [[20, 40, 75], [28, 70, 115], [36, 115, 160], [44, 185, 210], [52, 260, 260], [60, 350, 310]], // Aimed Shot 19434, 20900..20904, 2 s cast
    sniper: [[40, 320, 365], [48, 450, 365], [58, 590, 365]],                                // Sniper Shot 1310687, 1310785, 1310786, 4 s cast, 15 s cooldown
    summonHawk: [[25, 32], [36, 47], [48, 85], [60, 108]],                                   // Summon Hawk 1293241, 1293525..1293527, 11% base mana
    trueshot: [[25, 20], [32, 35], [40, 50], [50, 75], [60, 100]],                           // Trueshot Aura 1299346, 1299348, 19506, 20905, 20906
    raptor: [[1, 5, 10], [8, 11, 25], [16, 21, 35], [24, 30, 45], [32, 35, 55], [40, 40, 70], [48, 55, 85], [56, 70, 100]], // Raptor Strike 2973, 14260..14266, 6 s
    beast: [[30, 50], [40, 70], [50, 90], [60, 110]],                                        // Aspect of the Beast 13161, 1299445..1299447 (melee attack power)
    claw: [[1, 5, 0.4], [8, 10, 0.4], [16, 14, 0.286], [24, 19, 0.316], [32, 25, 0.32], [40, 31, 0.323], [48, 42, 0.333], [56, 51, 0.314]], // pet Claw 16827..16832, 3010, 3009 (25 focus)
    bite: [[1, 8, 0.25], [8, 17, 0.118], [16, 26, 0.154], [24, 34, 0.176], [32, 44, 0.182], [40, 54, 0.185], [48, 73, 0.192], [56, 90, 0.2]],    // pet Bite 17253, 17255..17261 (35 focus, 10 s)
  };
  const T = { deadlyAspects: 19552, focusedFire: 1223755, unleashedFury: 19616, ferocity: 19598, summonHawk: 1293241,
    bestialDisc: 19590, frenzy: 19621, lethal: 19426, impStings: 1310661, efficiency: 19416, carefulAim: 1223984,
    rapidKilling: 415405, impArcane: 19454, loneWolf: 415370, trueshot: 1299346, mortalShots: 19485, rapidRecup: 1223987,
    barrage: 19461, rws: 19507, sniper: 1310687, savageStrikes: 19159, predatorsEdge: 1310627, surefooted: 19290,
    lightningReflexes: 19168 };
  const ORDER = [19552, 19583, 1223755, 19549, 24443, 19559, 19596, 19616, 19572, 19598, 1293241, 19578, 19577, 19590, 19621, 19574,
    19498, 19407, 19426, 1310661, 19416, 1223984, 415405, 19454, 415370, 1299346, 19485, 1223987, 19461, 19503, 19507, 1310687,
    24293, 19295, 19184, 19159, 19255, 19228, 19239, 19290, 19263, 19376, 1310627, 19306, 440529, 1310532, 1310496, 1317257, 19168, 1310533];
  const TREES = [16, 16, 18];

  const pick = (list, L) => { let b = null; for (const r of list) if (r[0] <= L) b = r; return b; };
  const val = (list, L) => { const r = pick(list, L); return r ? r[1] : 0; };
  // Base mana: 1720 at level 60 from the wowsims/forever base stats; the curve below 60 is an estimate.
  const baseMana = (L) => 85 + (1720 - 85) * Math.pow(Math.max(0, L - 1) / 59, 1.3);
  // Ammo damage per second by level (wowsims/forever arrow table): Rough, Sharp, Razor, Jagged, Thorium Headed.
  const ammoDps = (L) => (L >= 52 ? 17.5 : L >= 40 ? 13 : L >= 25 ? 7.5 : L >= 10 ? 3.5 : 1.5);
  // Quiver or ammo pouch ranged haste assumed by level (10% Hunting Quiver up to 15% Ancient Sinew Wrapped Lamina).
  const quiver = (L) => (L >= 55 ? 0.15 : L >= 40 ? 0.13 : L >= 30 ? 0.12 : L >= 10 ? 0.10 : 0);

  function derive(cfg) {
    const t = (id) => U.tal(cfg, id);
    const L = cfg.level;
    const style = cfg.style === 'nopet' ? 'nopet' : 'pet';
    const pet = style === 'pet';
    const agi = (cfg.agi || 0) * (1 + 0.03 * Math.min(5, t(T.lightningReflexes)));
    const int = cfg.int || 0;
    const careful = 0.2 * Math.min(5, t(T.carefulAim));
    const gearAp = cfg.ap || 0;
    const aspect = val(D.hawk, L);
    const tsa = t(T.trueshot) ? val(D.trueshot, L) : 0;
    const rapSheet = 2 * L - 10 + 2 * agi + gearAp + (cfg.rap || 0) + careful * int;
    const rap = rapSheet + aspect + tsa;              // what the hunter and the pet see (no mark)
    const map = 2 * L - 20 + (cfg.str || 0) + agi + gearAp + careful * int;
    const cfgA = Object.assign({}, cfg, { agi });
    const lethal = Math.min(5, t(T.lethal));
    const crit = U.meleeCrit('Hunter', cfgA, lethal);
    const ferocity = 0.02 * Math.min(5, t(T.ferocity));
    const ff = pet ? 1 + 0.01 * Math.min(2, t(T.focusedFire)) : 1;
    const lw = t(T.loneWolf) > 0;
    const hunterMult = ff * (!pet && lw ? 1.2 : 1);
    const uf = 1 + 0.03 * Math.min(5, t(T.unleashedFury));
    const cdps = U.mobDps(L);                         // creature auto attack dps for the level (60.45 at 60)
    const petAp = 0.3 * 14 * cdps + 0.1 * Math.max(map, rap);
    const mh = cfg.mh && cfg.mh.d1 ? cfg.mh : null;
    const hawkLogMult = 1.15 * 1.02;
    const bm = Math.min(5, t(T.mortalShots));
    const ms = [0, 0.06, 0.12, 0.18, 0.24, 0.30][bm];
    const effic = 1 - 0.03 * Math.min(5, t(T.efficiency));
    const bmana = baseMana(L);
    const ar = pick(D.aimed, L), sn = t(T.sniper) ? pick(D.sniper, L) : null, mk = pick(D.mark, L), st = pick(D.sting, L);
    const pe = [0, 0.06, 0.12, 0.18, 0.24, 0.30][Math.min(5, t(T.predatorsEdge))];
    return {
      L, pet, lw, rap, rapSheet, map, mark: mk ? mk[1] : 0, markCost: mk ? mk[2] : 0, aspect, tsa,
      hit: (cfg.hit || 0) + Math.min(3, t(T.surefooted)),
      crit, critMult: 2 + ms,
      petCrit: Math.min(1, crit + ferocity), hawkCrit: Math.min(1, 0.5 * crit + ferocity),
      hunterMult, rws: 1 + 0.01 * Math.min(5, t(T.rws)), barrage: 1 + 0.05 * Math.min(3, t(T.barrage)),
      haste: 1 + quiver(L), ammo: ammoDps(L),
      qsChance: 0.02 * Math.min(5, t(T.deadlyAspects)),
      arcane: val(D.arcane, L), arcCost: 0.11 * bmana * effic, arcCd: 6 - 0.3 * Math.min(5, t(T.impArcane)),
      sting: st ? st[1] * (1 + [0, 0.06, 0.13, 0.20][Math.min(3, t(T.impStings))]) : 0, stingCost: st ? st[2] * effic : 0,
      aimed: ar ? ar[1] : 0, aimedCost: ar ? ar[2] * effic : 0, hasAimed: !!ar,
      hasMulti: L >= 18, multiCost: 0.139 * bmana * effic,
      sniper: sn ? sn[1] : 0, sniperCost: sn ? sn[2] * effic : 0, hasSniper: !!sn,
      hasHawk: t(T.summonHawk) > 0 && L >= 25, hawkDive: val(D.summonHawk, L), hawkCost: 0.11 * bmana,
      hawkAvg: 0.153 * cdps * 2.5 / hawkLogMult, hawkApDiv: 60 * hawkLogMult,
      hawkAp: 0.8 * (rap + (mh ? 14 * U.weaponDps(mh) : 7)), hawkMult: uf * hunterMult,
      petAvg: 1.4 * cdps, petAp, petMult: 1.25 * 1.10 * uf * ff / (pet && lw ? 1.2 : 1),
      focusRate: 10 * (1 + 0.1 * Math.min(2, t(T.bestialDisc))), frenzy: 0.2 * Math.min(5, t(T.frenzy)),
      claw: pick(D.claw, L), bite: pick(D.bite, L),
      rk: 0.1 * Math.min(2, t(T.rapidKilling)), rrSting: 0.25 * Math.min(2, t(T.rapidRecup)), rrSpend: 0.5 * Math.min(2, t(T.rapidRecup)),
      castShare: 0.25 * Math.min(2, t(T.bestialDisc)),
      maxMana: bmana + Math.max(0, int - 20) * 15 + Math.min(20, int), regen: 15 + (cfg.spi || 0) / 5,
      raptor: pick(D.raptor, L), beastAp: val(D.beast, L), raptorCrit: 0.02 * Math.min(2, t(T.savageStrikes)),
      raptorCritMult: 1 + (1 + pe) * (1 + pe), ohMult: 0.5 * (1 + [0, 0.1, 0.2, 0.3, 0.4, 0.5][Math.min(5, t(T.predatorsEdge))]),
    };
  }

  // One run of `fights` kills. cast = 'aimed' or 'multi' picks the shot used on the shared 6 s cooldown.
  function run(cfg, d, cast, fights, seed, hawks) {
    const R = U.rng(seed);
    const M = U.mob(cfg);
    const ARM = 1 - M.dr;
    const w = cfg.ranged;
    const wmin = w.d1 + d.ammo * w.ws, wspan = w.d2 - w.d1, S = w.ws;
    const rapT = d.rap + d.mark;                       // against the marked mob
    const miss = Math.max(0, M.miss - d.hit / 100);
    const tDodge = miss + M.dodge, tCrit = tDodge + d.crit;
    const pMiss = Math.max(0, M.miss - (cfg.hit || 0) / 100);
    const pAvoid = pMiss + M.dodge + M.parry;
    const useAimed = cast === 'aimed' && d.hasAimed;
    const useMulti = !useAimed && d.hasMulti;
    const castLabel = useAimed ? 'Aimed Shot' : 'Multi-Shot';
    const parts = { 'Auto Shot': 0, 'Arcane Shot': 0, 'Serpent Sting': 0, 'Pet': 0, 'Hawks': 0, 'Sniper Shot': 0 };
    parts[castLabel] = 0;
    const W = d.hunterMult;
    let totTime = 0, totHp = 0, oom = 0;
    const norm = () => wmin + wspan * R() + rapT / 14 * 2.8;
    const shot = (base) => { const r = R(); if (r < tDodge) return 0; return r < tCrit ? base * d.critMult : base; };
    for (let f = 0; f < fights; f++) {
      const hp = M.hp * (0.7 + 0.6 * R());
      totHp += hp;
      let t = 0, dmg = 0, mana = d.maxMana, lastCast = -10, regenAt = 2, castShareEnd = -1, castShareV = 0;
      let haste = d.haste, qsEnd = -1, nextAuto = 0, gcd = 0, castEnd = 0;
      let arcReady = 0, hawkReady = 0, aimReady = 0, sniperReady = 0, stingEnd = -1, stingTick = 1e9, stingLeft = 0;
      let marked = d.mark <= 0, rkUp = d.rk > 0, pending = 0, pendingAt = 1e9;
      const h0 = [-1, 1e9], h1 = [-1, 1e9];
      let petSwing = d.pet ? 2.0 : 1e9, petAct = d.pet ? 2.0 : 1e9, focus = 100, focusT = 2, biteReady = 0, frenzyEnd = -1;
      let guard = 0;
      const spend = (c) => { mana -= c; lastCast = t; };
      while (dmg < hp && guard++ < 20000) {
        const autoAt = nextAuto < castEnd ? castEnd : nextAuto;
        const actAt = gcd > castEnd ? gcd : castEnd;
        let ev = 0; t = autoAt;
        if (actAt < t) { t = actAt; ev = 1; }
        if (petSwing < t) { t = petSwing; ev = 2; }
        if (petAct < t) { t = petAct; ev = 3; }
        if (stingTick < t) { t = stingTick; ev = 4; }
        if (h0[1] < t) { t = h0[1]; ev = 5; }
        if (h1[1] < t) { t = h1[1]; ev = 6; }
        if (pendingAt < t) { t = pendingAt; ev = 7; }
        if (regenAt < t) { t = regenAt; ev = 8; }
        let d0 = 0;
        if (ev === 0) {
          if (t >= qsEnd) haste = d.haste;
          d0 = shot((wmin + wspan * R() + rapT / 14 * S) * ARM * d.rws * W);
          dmg += d0; parts['Auto Shot'] += d0;
          if (d.qsChance > 0 && R() < d.qsChance) { qsEnd = t + 12; haste = d.haste * 1.3; }
          nextAuto = t + S / haste;
        } else if (ev === 1) {
          const ch = t < qsEnd ? haste : d.haste;
          const rk = rkUp ? 1 + d.rk : 1;
          let done = true, isShot = false;
          if (!marked) {
            if (mana >= d.markCost) { spend(d.markCost); marked = true; } else done = false;
          } else if (d.sting > 0 && t >= stingEnd && dmg < hp * 0.7 && mana >= d.stingCost) {
            spend(d.stingCost);
            if (R() >= tDodge) {
              stingEnd = t + 15; stingTick = t + 3; stingLeft = 5;
              if (d.rrSting > 0) { castShareV = Math.max(castShareV, d.rrSting); castShareEnd = t + 15; }
            }
          } else if (hawks > 0 && t >= hawkReady && (hawks === 1 ? (h0[0] < t + 1 && h1[0] < t + 1) : (h0[0] < t + 3 || h1[0] < t + 3)) && mana >= d.hawkCost) {
            spend(d.hawkCost);
            pending = (d.hawkDive + 0.05 * rapT) * ARM * d.hawkMult * (R() < d.crit ? d.critMult : 1);
            pendingAt = t + 1;
            arcReady = hawkReady = t + 6;
          } else if (d.arcane > 0 && t >= arcReady && mana >= d.arcCost) {
            spend(d.arcCost); isShot = true;
            d0 = shot((d.arcane + 0.15 * rapT) * d.rws * W * rk);
            dmg += d0; parts['Arcane Shot'] += d0;
            arcReady = t + d.arcCd; if (hawkReady < t + 6) hawkReady = t + 6;
          } else if (d.hasSniper && t >= sniperReady && mana >= d.sniperCost) {
            spend(d.sniperCost); isShot = true;
            castEnd = t + 4 / ch;
            d0 = shot((norm() + d.sniper) * ARM * d.rws * W * rk);
            dmg += d0; parts['Sniper Shot'] += d0; sniperReady = t + 15;
          } else if (useAimed && t >= aimReady && mana >= d.aimedCost) {
            spend(d.aimedCost); isShot = true;
            castEnd = t + 2 / ch;
            d0 = shot((norm() + d.aimed + 9) * ARM * d.rws * d.barrage * W * rk);
            dmg += d0; parts[castLabel] += d0; aimReady = t + 6;
          } else if (useMulti && t >= aimReady && mana >= d.multiCost) {
            spend(d.multiCost); isShot = true;
            castEnd = t + 0.5 / ch;
            d0 = shot((norm() + 9) * ARM * d.rws * d.barrage * W * rk);
            dmg += d0; parts[castLabel] += d0; aimReady = t + 6;
          } else done = false;
          if (isShot && rkUp) {
            rkUp = false;
            if (d.rrSpend > 0) { castShareV = d.rrSpend; castShareEnd = t + 15; }
          }
          if (done) { gcd = t + 1.5; if (castEnd > gcd) gcd = castEnd; }
          else {
            // nothing castable now: wait for the next cooldown, or for mana
            let nx = 1e9;
            if (d.arcane > 0 && arcReady > t) nx = Math.min(nx, arcReady);
            if (hawks > 0) nx = Math.min(nx, Math.max(hawkReady, Math.min(h0[0], h1[0]) - 3, t + 0.05));
            if ((useAimed || useMulti) && aimReady > t) nx = Math.min(nx, aimReady);
            if (d.hasSniper && sniperReady > t) nx = Math.min(nx, sniperReady);
            if (d.sting > 0 && stingEnd > t) nx = Math.min(nx, stingEnd);
            if (nx >= 1e9 || nx <= t) { nx = regenAt + 0.01; oom++; }
            gcd = nx;
          }
          continue;
        } else if (ev === 2) {
          const r = R();
          let b = (d.petAvg * (0.8 + 0.4 * R()) + d.petAp / 14 * 2) * ARM * d.petMult;
          if (r < pAvoid) b = 0;
          else if (r < pAvoid + d.petCrit) { b *= 2; if (d.frenzy > 0 && R() < d.frenzy) frenzyEnd = t + 8; }
          dmg += b; parts.Pet += b;
          petSwing = t + (t < frenzyEnd ? 2 / 1.3 : 2);
        } else if (ev === 3) {
          focus = Math.min(100, focus + d.focusRate * (t - focusT)); focusT = t;
          const canBite = d.bite && t >= biteReady && focus >= 35, canClaw = d.claw && focus >= 25;
          let ab = null;
          if (canBite && canClaw) ab = R() < 0.5 ? d.bite : d.claw; else if (canBite) ab = d.bite; else if (canClaw) ab = d.claw;
          if (ab) {
            if (ab === d.bite) { focus -= 35; biteReady = t + 10; } else focus -= 25;
            const r = R();
            let b = ab[1] * (1 + ab[2] * (2 * R() - 1)) * ARM * d.petMult;
            if (r < pAvoid) b = 0;
            else if (r < pAvoid + d.petCrit) { b *= 2; if (d.frenzy > 0 && R() < d.frenzy) frenzyEnd = t + 8; }
            dmg += b; parts.Pet += b;
            petAct = t + 1.6;
          } else petAct = t + 0.8;
        } else if (ev === 4) {
          let b = (d.sting + 0.05 * rapT) * W;
          if (R() < d.crit) b *= 2;
          dmg += b; parts['Serpent Sting'] += b;
          stingLeft--; stingTick = stingLeft > 0 ? t + 3 : 1e9;
        } else if (ev === 5 || ev === 6) {
          const h = ev === 5 ? h0 : h1;
          if (t >= h[0]) { h[1] = 1e9; continue; }
          const r = R();
          let b = (d.hawkAvg * (0.78 + 0.44 * R()) + d.hawkAp * 2.5 / d.hawkApDiv) * ARM * d.hawkMult;
          if (r < pAvoid) b = 0; else if (r < pAvoid + d.hawkCrit) b *= 2;
          dmg += b; parts.Hawks += b;
          h[1] = t + 2.5 / (t < qsEnd ? haste : d.haste);
        } else if (ev === 7) {
          dmg += pending; parts.Hawks += pending; pendingAt = 1e9;
          const h = h0[0] <= h1[0] ? h0 : h1;
          h[0] = t + 18; h[1] = t;
        } else {
          let share = t - lastCast >= 5 ? 1 : d.castShare;
          if (t < castShareEnd && castShareV > share) share = castShareV;
          mana = Math.min(d.maxMana, mana + d.regen * Math.min(1, share));
          regenAt = t + 2;
        }
      }
      totTime += t > 0.5 ? t : 0.5;
    }
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), oom: oom / fights };
  }

  // Fallback with no ranged weapon: melee swings, Raptor Strike every 6 s, Aspect of the Beast from level 30, the pet.
  function runMelee(cfg, d, fights, seed) {
    const R = U.rng(seed);
    const M = U.mob(cfg);
    const ARM = 1 - M.dr;
    const w = cfg.mh && cfg.mh.d1 ? cfg.mh : { d1: 1, d2: 2, ws: 2.0 };
    const oh = cfg.oh && cfg.oh.d1 && !cfg.shield && GL.classes.Hunter.dualWield(d.L, cfg.talents) ? cfg.oh : null;
    const ap = d.map + d.beastAp;
    const miss = Math.max(0, M.miss - d.hit / 100) + (oh ? M.dualWieldMiss : 0);
    const sMiss = Math.max(0, M.miss - d.hit / 100);
    const tPar = miss + M.dodge + M.parry, tGl = tPar + M.glance, tCr = tGl + d.crit;
    const pMiss = Math.max(0, M.miss - (cfg.hit || 0) / 100), pAvoid = pMiss + M.dodge + M.parry;
    const parts = { 'Melee swings': 0, 'Raptor Strike': 0, 'Pet': 0 };
    const W = d.hunterMult;
    let totTime = 0, totHp = 0;
    const white = (wp, mult) => {
      const r = R(), b = (wp.d1 + (wp.d2 - wp.d1) * R() + ap / 14 * wp.ws) * ARM * W * mult;
      if (r < tPar) return 0; if (r < tGl) return b * M.glanceMult; return r < tCr ? b * 2 : b;
    };
    for (let f = 0; f < fights; f++) {
      const hp = M.hp * (0.7 + 0.6 * R());
      totHp += hp;
      let t = 0, dmg = 0, mana = d.maxMana, mhAt = 0, ohAt = oh ? 0.2 : 1e9, rsReady = 0, lastCast = -10, regenAt = 2;
      let petSwing = d.pet ? 1 : 1e9, guard = 0;
      while (dmg < hp && guard++ < 20000) {
        let ev = 0; t = mhAt;
        if (ohAt < t) { t = ohAt; ev = 1; }
        if (petSwing < t) { t = petSwing; ev = 2; }
        if (regenAt < t) { t = regenAt; ev = 3; }
        let b = 0;
        if (ev === 0) {
          if (d.raptor && t >= rsReady && mana >= d.raptor[2]) {
            mana -= d.raptor[2]; lastCast = t; rsReady = t + 6;
            const r = R(), base = (w.d1 + (w.d2 - w.d1) * R() + ap / 14 * w.ws + d.raptor[1]) * ARM * W;
            b = r < sMiss + M.dodge + M.parry ? 0 : (r < sMiss + M.dodge + M.parry + d.crit + d.raptorCrit ? base * d.raptorCritMult : base);
            parts['Raptor Strike'] += b;
          } else { b = white(w, 1); parts['Melee swings'] += b; }
          mhAt = t + w.ws;
        } else if (ev === 1) {
          b = white(oh, d.ohMult); parts['Melee swings'] += b; ohAt = t + oh.ws;
        } else if (ev === 2) {
          const r = R();
          b = (d.petAvg * (0.8 + 0.4 * R()) + d.petAp / 14 * 2) * ARM * d.petMult;
          if (r < pAvoid) b = 0; else if (r < pAvoid + d.petCrit) b *= 2;
          parts.Pet += b; petSwing = t + 2;
        } else {
          if (t - lastCast >= 5) mana = Math.min(d.maxMana, mana + d.regen); else mana = Math.min(d.maxMana, mana + d.regen * d.castShare);
          regenAt = t + 2;
        }
        dmg += b;
      }
      totTime += t > 0.5 ? t : 0.5;
    }
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), oom: 0 };
  }

  function simulate(cfg, fights, seed) {
    const d = derive(cfg);
    const notes = [];
    let best, cast = null;
    const hasRanged = !!(cfg.ranged && cfg.ranged.d1);
    if (!hasRanged) {
      best = runMelee(cfg, d, fights, seed);
      notes.push('No bow, gun or crossbow equipped, so this is a melee fight: weapon swings, Raptor Strike and the pet. Mongoose Bite is left out.');
    } else {
      // Try each choice the rotation has (Aimed Shot or Multi-Shot; no hawk, one hawk or two) and keep the best.
      const casts = d.hasAimed && d.hasMulti ? ['aimed', 'multi'] : [d.hasAimed ? 'aimed' : 'multi'];
      const hawkOpts = d.hasHawk ? [0, 1, 2] : [0];
      let hawks = 0;
      for (const c of casts) for (const h of hawkOpts) {
        const b = run(cfg, d, c, fights, seed, h);
        if (!best || b.dps > best.dps) { best = b; cast = c; hawks = h; }
      }
      notes.push('Ammo (' + d.ammo + ' dps) and a ' + Math.round(quiver(d.L) * 100) + '% quiver are assumed for this level.');
      if (best.oom > 0.5) notes.push('Mana runs short inside a fight at this level, so some shots wait for mana to come back.');
      if (d.hasHawk) notes.push('Summon Hawk shares its cooldown with Arcane Shot. ' + (hawks === 0 ? 'Fights here are too short for it to beat Arcane Shot, so it is not used.' : 'It is used to keep ' + hawks + ' hawk' + (hawks > 1 ? 's' : '') + ' up, Arcane Shot otherwise.'));
      best.hawks = hawks;
    }
    if (d.pet) notes.push('The pet is modelled as a Cat with full happiness, using Claw and Bite; it reaches the mob 2 s after the pull.');
    else {
      notes.push('No pet: the mob is assumed to stay at range (kited), so no time is lost in melee.');
      if (!d.lw) notes.push('Without the Lone Wolf talent, fighting with no pet gives up a lot of damage.');
    }
    if (d.pet && d.lw) notes.push('Lone Wolf is taken but a pet is out: the pet loses a sixth of its damage and the hunter gains nothing.');
    if (d.rk > 0) notes.push('Rapid Killing is assumed to carry from each kill into the first shot of the next pull.');
    return { dps: best.dps, ttk: best.ttk, share: best.share, notes,
      info: { 'Ranged attack power': Math.round(d.rap + d.mark), 'Ranged crit': (d.crit * 100).toFixed(1) + '%',
        'Shot on the 6 s cooldown': hasRanged ? (cast === 'aimed' ? 'Aimed Shot' : (d.hasMulti ? 'Multi-Shot' : 'none yet')) : 'melee',
        'Pet': d.pet ? 'Cat' : 'none', 'Hawks kept up': best.hawks || 0, 'Mana': Math.round(d.maxMana) } };
  }

  function treePoints(talents) {
    const pts = [0, 0, 0];
    let i = 0;
    for (let tr = 0; tr < 3; tr++) for (let k = 0; k < TREES[tr]; k++, i++) pts[tr] += (talents && talents[ORDER[i]]) || 0;
    return pts;
  }

  GL.register({
    name: 'Hunter',
    armor: (L) => (L >= 40 ? 'CLM' : 'CL'),
    weapons: ['Axe', 'Sword', 'Dagger', 'Staff', 'Polearm', 'Fist Weapon'],
    rangedTypes: ['Bow', 'Gun', 'Crossbow'],
    shield: false,
    twoHand: true,
    // No Dual Wield spell is in the data; Classic trains it at level 20.
    dualWield: (L) => L >= 20,
    damageSlots: () => ['Ranged'],
    styles: [{ id: 'pet', name: 'Ranged with pet' }, { id: 'nopet', name: 'Ranged, no pet (Lone Wolf)' }],
    detectSpec: (talents) => {
      const p = treePoints(talents || {});
      if (p[0] + p[1] + p[2] === 0) return { id: 'none', name: 'No talents' };
      const i = p.indexOf(Math.max.apply(null, p));
      return [{ id: 'bm', name: 'Beast Mastery' }, { id: 'mm', name: 'Marksmanship' }, { id: 'sv', name: 'Survival' }][i];
    },
    statKeys: () => ['agi', 'int', 'ap', 'rap', 'hit', 'crit'],
    unit: () => 'ap',
    schools: () => [],
    simulate,
    sampleTalents: (L, styleId) => {
      const bm = [[19552, 5], [1223755, 2], [19559, 2], [19549, 1], [19616, 5], [19598, 5], [1293241, 1], [19621, 5], [19590, 2], [19574, 1],
        [19426, 5], [1223984, 5], [1310661, 3], [415405, 2], [19454, 5], [19498, 2]];
      const mm = [[19426, 5], [1223984, 5], [1310661, 3], [415370, 1], [415405, 2], [19454, 5], [1299346, 1], [19485, 5], [19461, 3],
        [1223987, 2], [19507, 5], [1310687, 1], [19416, 5], [19498, 3], [19552, 5]];
      const order = styleId === 'nopet' ? mm : bm;
      const out = {};
      let pts = Math.max(0, L - 9);
      for (const [id, max] of order) { const r = Math.min(max, pts); if (r > 0) out[id] = r; pts -= r; }
      return out;
    },
    about: 'Levelling hunter at range: Auto Shot, Hunter\'s Mark, Serpent Sting, Arcane Shot, Aimed Shot or Multi-Shot, Sniper Shot and Summon Hawk when talented, Aspect of the Hawk, mana, and a Cat pet holding the mob (or no pet with Lone Wolf).',
  });
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
