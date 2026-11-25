/* Rogue (levelling, fought from the front). Rules from the wowsims/forever source and the WoW Forever spell data:
   Str and Agi each give 1 attack power, energy comes back at 10 a second, every ability has a 1 s global cooldown,
   Sinister Strike, Hemorrhage, Ghostly Strike and Mutilate use normalized weapon damage (1.7 s for daggers, 2.4 s
   otherwise), Eviscerate adds 4% of attack power per combo point, Rupture 1/2/3% per tick, Instant Poison 1% and
   procs on 20% of landed melee hits, Deadly Poison 30%. Backstab needs to be behind the target, so it is not used.
   Forever additions: Shank (off-hand strike that gives energy), Poised (first ability of a fight costs less),
   Hack and Slash (weapon type bonus), Boot Knife, Venom, Death Mark (stores damage and deals it after 6 s). */
(function (root) {
  'use strict';
  const GL = root.GearLab || (typeof require !== 'undefined' ? require('../core.js') : null);
  const U = GL.util;

  // Rank tables. lvl = level trained, b = base points.
  const D = {
    // Sinister Strike 1752, 1757, 1758, 1759, 1760, 8621, 11293, 11294: flat damage on top of the weapon, 45 energy.
    ss: [{ lvl: 1, b: 3 }, { lvl: 6, b: 6 }, { lvl: 14, b: 10 }, { lvl: 22, b: 15 }, { lvl: 30, b: 22 }, { lvl: 38, b: 33 }, { lvl: 46, b: 52 }, { lvl: 54, b: 68 }],
    // Eviscerate 2098, 6760, 6761, 6762, 8623, 8624, 11299, 11300 (rank 9, 31016, is a book and left out): b rolls by
    // +-v/2, pp per combo point, 35 energy.
    evis: [{ lvl: 1, b: 3, v: 1.333, pp: 5 }, { lvl: 8, b: 7, v: 1.143, pp: 11 }, { lvl: 16, b: 13, v: 1.077, pp: 19 }, { lvl: 24, b: 20, v: 1, pp: 31 },
      { lvl: 32, b: 30, v: 1, pp: 45 }, { lvl: 40, b: 44, v: 1, pp: 71 }, { lvl: 48, b: 68, v: 1, pp: 110 }, { lvl: 56, b: 96, v: 1, pp: 151 }],
    // Slice and Dice 5171, 6774: attack speed; lasts 6 s + 3 s per point, 25 energy.
    snd: [{ lvl: 10, haste: 0.20 }, { lvl: 42, haste: 0.30 }],
    // Rupture 1943, 8639, 8640, 11273, 11274, 11275: tick every 2 s = b + pp per point, 3 + points ticks, 25 energy.
    rup: [{ lvl: 20, b: 5, pp: 1.18 }, { lvl: 28, b: 7, pp: 1.78 }, { lvl: 36, b: 11, pp: 2.37 }, { lvl: 44, b: 16, pp: 2.96 }, { lvl: 52, b: 22, pp: 4.14 }, { lvl: 60, b: 35, pp: 4.73 }],
    // Instant Poison 8680, 8685, 8689, 11335, 11336, 11337 (nature hit, v = spread).
    ip: [{ lvl: 20, b: 15, v: 0.27 }, { lvl: 28, b: 23, v: 0.24 }, { lvl: 36, b: 33, v: 0.24 }, { lvl: 44, b: 51, v: 0.24 }, { lvl: 52, b: 71, v: 0.25 }, { lvl: 60, b: 88, v: 0.28 }],
    // Deadly Poison 2818, 2819, 11353, 11354, 25349: per stack every 3 s for 12 s, up to 5 stacks.
    dp: [{ lvl: 30, b: 6 }, { lvl: 38, b: 9 }, { lvl: 46, b: 14 }, { lvl: 54, b: 18 }, { lvl: 60, b: 23 }],
    // Shank 1329283, 1329549: 50% off-hand weapon damage, 5 energy, gives energy, 10 s cooldown, cannot miss.
    shank: [{ lvl: 24, gain: 15 }, { lvl: 44, gain: 25 }],
    // Mutilate 399960, 1241585, 1241586: each hand 90% normalized weapon damage + b, 60 energy, 2 points.
    mut: [{ lvl: 40, b: 44 }, { lvl: 50, b: 63 }, { lvl: 60, b: 88 }],
    // Death Mark 1316709, 1325756, 1325757, 1325758 (tooltip): cap = (cb + cp * points + 4% AP per point) * (1 + crit).
    dm: [{ lvl: 40, cb: 63, cp: 102 }, { lvl: 48, cb: 98, cp: 158 }, { lvl: 56, cb: 138, cp: 217 }, { lvl: 60, cb: 156, cp: 245 }],
  };
  const T = {
    remorseless: 14144, malice: 14138, ruthless: 14156, impSnd: 14165, vigor: 14983, bloodSplatter: 1329256, lethality: 14128,
    vile: 16513, impPoisons: 14113, relentless: 14179, venom: 1329328, sealFate: 14186, mutilate: 399956,
    coup: 14162, effStrikes: 13732, puncturing: 1224716, precision: 13705, composure: 1329265, flawless: 1310711,
    weapExp: 30919, aggression: 18427, dws: 13715, hackSlash: 13960, flashSteel: 1329284,
    opportunity: 14057, serrated: 14171, ghostly: 14278, hemo: 16511, bootKnife: 1329286, deathMark: 1316709,
  };
  const ORDER = [13741, 14144, 14138, 14156, 14168, 14165, 14983, 1329256, 14128, 16513, 14177, 14113, 14179, 1329328, 14174, 14186, 399956,
    14162, 13732, 13712, 1224716, 13713, 13705, 13743, 13742, 14251, 1329265, 13754, 1310711, 30919, 18427, 13715, 13877, 13960, 1329284, 13750,
    13983, 13958, 14057, 14082, 13975, 14079, 1224782, 13976, 14183, 14171, 13981, 14278, 1310728, 30894, 14185, 16511, 1329286, 1316709];
  const TREES = [17, 19, 18], TREE_NAMES = ['Assassination', 'Combat', 'Subtlety'];
  const RUP_AP = [0, 0.01, 0.02, 0.03, 0.03, 0.03];   // rupture.go
  const COUP = [1, 1.07, 1.13, 1.20];                 // Coup de Grace 14162, both effects
  const isType = (w, list) => !!(w && list.indexOf(w.type) >= 0);

  function derive(cfg) {
    const t = (id) => U.tal(cfg, id);
    const L = cfg.level;
    const mh = cfg.mh && cfg.mh.d1 ? cfg.mh : { d1: 1, d2: 2, ws: 2.0, type: 'Dagger' };
    const oh = cfg.oh && cfg.oh.d1 && !cfg.shield ? cfg.oh : null;
    const hs = Math.min(5, t(T.hackSlash));
    // Hack and Slash 13960: dagger or fist crit +1..5%, mace armor ignore 3..15%, sword or axe extra attack 1..5% (0.2 s ICD).
    const hsCrit = (w) => (isType(w, ['Dagger', 'Fist Weapon']) ? hs : 0);
    const malice = Math.min(5, t(T.malice));
    const maceIgnore = (isType(mh, ['Mace']) || isType(oh, ['Mace'])) ? 0.03 * hs : 0;
    const armorIgnore = 0.03 * Math.min(3, t(T.serrated)) + maceIgnore;
    const ss = U.pickRank(D.ss, L), ev = U.pickRank(D.evis, L), snd = U.pickRank(D.snd, L), rup = U.pickRank(D.rup, L);
    const ip = U.pickRank(D.ip, L), dp = U.pickRank(D.dp, L), sh = oh ? U.pickRank(D.shank, L) : null;
    const mut = U.pickRank(D.mut, L), dm = U.pickRank(D.dm, L);
    return {
      L, mh, oh,
      ap: 2 * L - 20 + cfg.str + cfg.agi + (cfg.ap || 0),
      critMH: U.meleeCrit('Rogue', cfg, malice + hsCrit(mh)),
      critOH: oh ? U.meleeCrit('Rogue', cfg, malice + hsCrit(oh)) : 0,
      scrit: U.spellCrit('Rogue', cfg, malice),
      arm: 1 - U.mob(cfg).dr * Math.max(0, 1 - armorIgnore),
      hit: (cfg.hit || 0) + Math.min(3, t(T.precision)),
      avoidCut: Math.min(2, t(T.weapExp)) / 100,
      emax: 100 + 5 * Math.min(2, t(T.vigor)),
      swordProc: hs > 0 ? 0.01 * hs : 0,
      mhSword: isType(mh, ['Sword', 'Axe']), ohSword: isType(oh, ['Sword', 'Axe']),
      leth: 2 + 0.1 * Math.min(2, t(T.lethality)),
      aggr: 1 + 0.05 * Math.min(3, t(T.aggression)),
      coup: COUP[Math.min(3, t(T.coup))],
      dws: 1 + 0.25 * Math.min(2, t(T.dws)),
      ruth: 0.2 * Math.min(3, t(T.ruthless)),
      relent: 0.04 * Math.min(5, t(T.relentless)),
      sealFate: [0, 0.33, 0.66, 1][Math.min(3, t(T.sealFate))],
      sndMult: 1 + 0.15 * Math.min(3, t(T.impSnd)),
      rupBonus: 1 + 0.10 * Math.min(3, t(T.serrated)),
      rupExtraTicks: t(T.bloodSplatter) ? 3 : 0,
      remorse: 0.2 * Math.min(2, t(T.remorseless)),
      punct: 0.05 * Math.min(3, t(T.puncturing)),
      opp: 1 + 0.04 * Math.min(5, t(T.opportunity)),
      vile: 1 + 0.04 * Math.min(5, t(T.vile)),
      impP: 0.02 * Math.min(5, t(T.impPoisons)),
      venom: t(T.venom) > 0,
      bootKnife: 0.2 * Math.min(5, t(T.bootKnife)),
      ssCost: 45 - [0, 3, 5][Math.min(2, t(T.effStrikes))],
      evCost: t(T.flawless) ? 20 : 35,
      poised: L >= 18 ? 10 + 5 * Math.min(2, t(T.composure)) : 0,
      ss, ev, snd, rup, ip, dp, mut, dm,
      shank: sh ? { gain: sh.gain + 3 * Math.min(5, t(T.flashSteel)), cd: 10 - 0.4 * Math.min(5, t(T.flashSteel)) } : null,
      hasGS: t(T.ghostly) > 0 && L >= 30, hasHemo: t(T.hemo) > 0 && L >= 30,
      hasMut: t(T.mutilate) > 0 && !!mut && !!oh && mh.type === 'Dagger' && oh.type === 'Dagger',
      mutTal: t(T.mutilate) > 0,
      hasDM: t(T.deathMark) > 0 && !!dm,
    };
  }

  // Which strike builds combo points for this style.
  function pickBuilder(d, style) {
    if (style === 'assassination' && d.hasMut) return 'mut';
    if (style === 'subtlety' && d.hasHemo) return 'hemo';
    return 'ss';
  }

  const NAMES = { ss: 'Sinister Strike', hemo: 'Hemorrhage', mut: 'Mutilate' };

  function run(cfg, d, opt, fights, seed) {
    const R = U.rng(seed);
    const M = U.mob(cfg);
    const ap = d.ap, ARM = d.arm, mh = d.mh, oh = d.oh, dual = !!oh;
    const builder = opt.builder;
    const mhSpan = mh.d2 - mh.d1, ohSpan = oh ? oh.d2 - oh.d1 : 0;
    const mhNorm = mh.type === 'Dagger' ? 1.7 : 2.4, ohNorm = oh && oh.type === 'Dagger' ? 1.7 : 2.4;
    const miss = Math.max(0, M.miss - d.hit / 100);
    const dodge = Math.max(0, M.dodge - d.avoidCut), parry = Math.max(0, M.parry - d.avoidCut);
    const yDodge = miss + dodge, yParry = yDodge + parry;   // yellow (special) table
    const wMiss = Math.max(0, M.miss + (dual ? M.dualWieldMiss : 0) - d.hit / 100);
    const wParry = wMiss + dodge + parry, wGlance = wParry + M.glance;
    const SPH = 1 - M.spellMiss;
    const ssBase = d.ss ? d.ss.b : 0;
    const ev = d.ev, evCost = d.evCost;
    const sndHaste = d.snd ? d.snd.haste : 0;
    const ipAvg = d.ip ? d.ip.b : 0, ipVar = d.ip ? d.ip.v : 0;
    const ohPoison = opt.deadly ? 'dp' : (d.ip ? 'ip' : '');
    const dpTick = d.dp ? d.dp.b + 0.009 / 4 * ap : 0;
    const dmCdg = d.coup;
    const mutB = d.mut ? d.mut.b : 0, mutCost = 60;
    const bCost = builder === 'mut' ? mutCost : builder === 'hemo' ? 35 : d.ssCost;
    const sh = d.shank;
    const parts = { 'White hits': 0, 'Extra attacks': 0, [NAMES[builder]]: 0, 'Ghostly Strike': 0, Shank: 0, Eviscerate: 0, Rupture: 0,
      'Death Mark': 0, 'Instant Poison': 0, 'Deadly Poison': 0, 'Weapon procs': 0 };
    const bName = NAMES[builder];
    let totTime = 0, totHp = 0, sndUsed = 0, rupUsed = 0;

    // per-fight state, shared by the helpers below
    let t = 0, dmg = 0, e = 0, eT = 0, cp = 0, hsIcd = 0, venomEnd = -1, hemoEnd = -1;
    let dpStacks = 0, dpEnd = 0, dpNext = 0, dmEnd = 0, dmStore = 0, dmCap = 0, dmRate = 0;

    const en = () => Math.min(d.emax, e + 10 * (t - eT));
    const setE = (x) => { e = Math.min(d.emax, x); eT = t; };
    function add(x, label, rate) {
      dmg += x; parts[label] += x;
      if (dmEnd > t && dmStore < dmCap) dmStore = Math.min(dmCap, dmStore + x * dmRate * rate);
    }
    function poison(hand) {
      const kind = hand === 0 ? (d.ip ? 'ip' : '') : ohPoison;
      if (!kind) return;
      const ven = venomEnd > t;
      const chance = (kind === 'ip' ? 0.2 : 0.3) + d.impP + (ven ? 0.2 : 0);
      if (R() >= chance) return;
      if (R() >= SPH) return;
      if (kind === 'ip') {
        let x = (ipAvg * (1 + ipVar * (R() - 0.5)) + 0.01 * ap) * d.vile * (ven ? 1.3 : 1);
        if (R() < d.scrit) x *= 1.5;
        add(x, 'Instant Poison', 1);
      } else if (dpStacks > 0) { dpEnd = t + 12; if (dpStacks < 5) dpStacks++; }
      else { dpStacks = 1; dpEnd = t + 12; dpNext = t + 3; }
    }
    // Everything a landed melee hit of a hand can set off: poison, weapon proc, Hack and Slash extra attack.
    function landed(hand) {
      poison(hand);
      const w = hand === 0 ? mh : oh;
      if (w.pr) { const x = U.procHit(w.pr, w.ws, R, ARM, d.scrit); if (x > 0) add(x, 'Weapon procs', 1); }
      if (d.swordProc > 0 && t >= hsIcd && (hand === 0 ? d.mhSword : d.ohSword) && R() < d.swordProc) {
        hsIcd = t + 0.2;
        white(0, 'Extra attacks');
      }
    }
    function white(hand, label) {
      const r = R();
      if (r < wParry) return;
      const w = hand === 0 ? mh : oh;
      let x = (w.d1 + (w.d2 - w.d1) * R() + ap / 14 * w.ws) * ARM;
      if (hand === 1) x *= 0.5 * d.dws;
      if (r < wGlance) x *= M.glanceMult;
      else if (r < wGlance + (hand === 0 ? d.critMH : d.critOH)) x *= 2;
      add(x, label, 1);
      landed(hand);
    }
    const yellow = () => R() >= yParry;   // true when a special lands
    const sealFate = () => { if (d.sealFate > 0 && R() < d.sealFate) cp = Math.min(5, cp + 1); };

    for (let f = 0; f < fights; f++) {
      const hp = M.hp * (0.7 + 0.6 * R());
      totHp += hp;
      t = 0; dmg = 0; e = d.emax; eT = 0; cp = 0; hsIcd = 0; venomEnd = -1; hemoEnd = -1;
      dpStacks = 0; dpEnd = 0; dpNext = 0; dmEnd = 0; dmStore = 0; dmCap = 0; dmRate = 0;
      let nextMH = 0, nextOH = dual ? 0.2 : 1e9, act = 0, sndEnd = -1, shankCd = 0, gsCd = 0, dmCd = 0;
      let rupLeft = 0, rupNext = 0, rupTick = 0, poised = d.poised, remorse = d.remorse, guard = 0;
      while (dmg < hp && guard++ < 20000) {
        let tn = nextMH, evn = 0;
        if (nextOH < tn) { tn = nextOH; evn = 1; }
        if (act < tn) { tn = act; evn = 2; }
        if (rupLeft > 0 && rupNext < tn) { tn = rupNext; evn = 3; }
        if (dpStacks > 0 && dpNext < tn) { tn = dpNext; evn = 4; }
        if (dmEnd > 0 && dmEnd < tn) { tn = dmEnd; evn = 5; }
        t = tn;
        if (evn === 0 || evn === 1) {
          white(evn, 'White hits');
          const w = evn === 0 ? mh : oh, s = sndEnd > t ? w.ws / (1 + sndHaste) : w.ws;
          if (evn === 0) nextMH = t + s; else nextOH = t + s;
          continue;
        }
        if (evn === 3) { add(rupTick * (hemoEnd > t ? 1.15 : 1), 'Rupture', 2); rupLeft--; rupNext = t + 2; continue; }
        if (evn === 4) {
          if (dpNext <= dpEnd + 1e-9) { add(dpTick * dpStacks * d.vile * (venomEnd > t ? 1.3 : 1), 'Deadly Poison', 1); dpNext = t + 3; }
          if (dpNext > dpEnd + 1e-9) dpStacks = 0;
          continue;
        }
        if (evn === 5) { dmEnd = 0; dmg += dmStore; parts['Death Mark'] += dmStore; dmStore = 0; continue; }

        // ---- choose an ability (global cooldown is ready) ----
        const rem = hp - dmg, energy = en();
        let a = '', cost = 0;
        const evisHit = ev ? (ev.b + ev.pp * cp + 0.04 * cp * ap) * d.aggr * d.coup * ARM : 0;
        if (cp > 0 && evisHit >= rem) { a = 'evis'; cost = evCost; }
        else if (sh && shankCd <= t && energy + sh.gain <= d.emax + 5 && cp < 5) { a = 'shank'; cost = 5; }
        else if (cp >= opt.sndCp && opt.sndCp > 0 && d.snd && sndEnd <= t && rem > 0.3 * hp) { a = 'snd'; cost = 25; }
        else if (cp >= 5) {
          if (d.hasDM && dmCd <= t && rem > 0.45 * hp) { a = 'dm'; cost = 25; }
          else if (opt.rup && d.rup && rupLeft <= 0 && rem > 0.5 * hp) { a = 'rup'; cost = 25; }
          else { a = 'evis'; cost = evCost; }
        } else if (d.hasGS && gsCd <= t) { a = 'gs'; cost = 40; }
        else { a = 'build'; cost = bCost; }
        if (poised > 0) cost = Math.max(0, cost - poised);
        if (energy < cost) { act = t + (cost - energy) / 10 + 1e-6; continue; }
        poised = 0;
        setE(energy - cost);
        act = t + 1.0;
        if (a === 'build' || a === 'gs') {
          if (!yellow()) { setE(e + 0.8 * cost); continue; }
          const cr = d.critMH + remorse; remorse = 0;
          if (a === 'gs') {
            gsCd = t + 20;
            let x = (mh.d1 + mhSpan * R() + ap / 14 * mhNorm) * (mh.type === 'Dagger' ? 1.8 : 1.25) * ARM;
            const c = R() < cr; if (c) x *= d.leth;
            add(x, 'Ghostly Strike', 1); cp = Math.min(5, cp + 1); if (c) sealFate(); landed(0);
          } else if (builder === 'mut') {
            cp = Math.min(5, cp + 2);
            const pm = dpStacks > 0 ? 1.2 : 1;
            let x = (mh.d1 + mhSpan * R() + ap / 14 * mhNorm + mutB) * 0.9 * d.opp * pm * ARM;
            if (R() < cr + d.punct) { x *= d.leth; sealFate(); }
            add(x, bName, 1); landed(0);
            let y = (0.5 * (oh.d1 + ohSpan * R() + ap / 14 * ohNorm) + mutB) * 0.9 * d.dws * d.opp * pm * ARM;
            if (R() < d.critOH + d.punct + (cr - d.critMH)) { y *= d.leth; sealFate(); }
            add(y, bName, 1); landed(1);
          } else {
            let x = (mh.d1 + mhSpan * R() + ap / 14 * mhNorm);
            if (builder === 'hemo') { x *= mh.type === 'Dagger' ? 1.45 : 1; hemoEnd = t + 15; } else x = (x + ssBase) * d.aggr;
            x *= ARM;
            const c = R() < cr; if (c) x *= d.leth;
            add(x, bName, 1); cp = Math.min(5, cp + 1); if (c) sealFate(); landed(0);
          }
        } else if (a === 'shank') {
          shankCd = t + sh.cd;
          let x = 0.5 * (oh.d1 + ohSpan * R() + ap / 14 * oh.ws) * 0.5 * d.dws * ARM;
          if (R() < d.critOH) x *= 2;
          add(x, 'Shank', 1); setE(e + sh.gain);
          if (d.venom) venomEnd = t + 6;
          if (d.bootKnife > 0 && R() < d.bootKnife) cp = Math.min(5, cp + 2);
          landed(1);
        } else {
          // finishers
          if (a !== 'snd' && !yellow()) { setE(e + 0.8 * cost); continue; }
          const pts = cp;
          if (a === 'snd') { sndEnd = t + (6 + 3 * pts) * d.sndMult; sndUsed++; }
          else if (a === 'evis') {
            let x = (ev.b * (1 + ev.v * (R() - 0.5)) + ev.pp * pts + 0.04 * pts * ap) * d.aggr * d.coup * ARM;
            if (R() < d.critMH) x *= 2;
            add(x, 'Eviscerate', 1); landed(0);
          } else if (a === 'rup') {
            rupLeft = 3 + pts + d.rupExtraTicks; rupNext = t + 2; rupUsed++;
            rupTick = (d.rup.b + d.rup.pp * pts + ap * RUP_AP[pts]) * d.rupBonus;
          } else if (a === 'dm') {
            dmCd = t + 10; dmEnd = t + 6; dmStore = 0; dmRate = 0.12 * pts * dmCdg;
            dmCap = (d.dm.cb + d.dm.cp * pts + 0.04 * pts * ap) * (1 + d.critMH) * dmCdg;
          }
          if (d.relent > 0 && R() < d.relent * pts) setE(e + 25);
          cp = (d.ruth > 0 && R() < d.ruth) ? 1 : 0;
        }
      }
      totTime += t > 0.5 ? t : 0.5;
    }
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), sndUsed: sndUsed / fights, rupUsed: rupUsed / fights };
  }

  function simulate(cfg, fights, seed) {
    const d = derive(cfg);
    const style = cfg.style || 'combat';
    const builder = pickBuilder(d, style);
    const deadly = builder === 'mut' && !!d.dp;
    let best = null, bestOpt = null;
    // Try Slice and Dice at 1 or 2 points or not at all, then Rupture on top of the best of those.
    const tries = [];
    for (const sndCp of d.snd ? [0, 1, 2] : [0]) tries.push({ builder, deadly, sndCp, rup: false });
    for (let i = 0; i < tries.length + (d.rup ? 1 : 0); i++) {
      const opt = i < tries.length ? tries[i] : Object.assign({}, bestOpt, { rup: true });
      const r = run(cfg, d, opt, fights, seed);
      if (!best || r.dps > best.dps) { best = r; bestOpt = opt; }
    }
    const notes = ['Fought from the front: Backstab, Ambush, Garrote and Cheap Shot need to be behind the target or in Stealth, so they are left out.',
      'Cooldowns longer than a minute (Cold Blood, Adrenaline Rush, Blade Flurry, Preparation) and Riposte, Setup and Kidney Shot are left out.'];
    if (style === 'assassination' && builder !== 'mut') notes.push(d.mutTal ? 'Mutilate needs a dagger in each hand, so Sinister Strike is used instead.' : 'No Mutilate talent found, so Sinister Strike is used.');
    if (style === 'subtlety' && builder !== 'hemo') notes.push('No Hemorrhage talent found, so Sinister Strike is used.');
    if (d.ip) notes.push(deadly ? 'Instant Poison on the main hand and Deadly Poison on the off hand.' : 'Instant Poison is assumed on ' + (d.oh ? 'both weapons.' : 'the main hand.'));
    else notes.push('No poisons before level 20.');
    if (d.L >= 60) notes.push('Eviscerate rank 9 comes from a book and is not assumed; rank 8 is used.');
    const info = {
      Builder: NAMES[builder], 'Melee crit': (d.critMH * 100).toFixed(1) + '%', 'Attack power': Math.round(d.ap),
      'Slice and Dice': bestOpt.sndCp ? 'at ' + bestOpt.sndCp + ' combo point' + (bestOpt.sndCp > 1 ? 's' : '') : 'not used',
      Rupture: bestOpt.rup ? 'used at 5 points' : 'not used', 'Max energy': d.emax,
    };
    if (d.shank) info.Shank = 'every ' + d.shank.cd.toFixed(1) + ' s, +' + d.shank.gain + ' energy';
    return { dps: best.dps, ttk: best.ttk, share: best.share, info, notes };
  }

  function build(order, L) {
    const out = {};
    let pts = Math.max(0, L - 9);
    for (const [id, max] of order) { const r = Math.min(max, pts); if (r > 0) out[id] = r; pts -= r; }
    return out;
  }
  const BUILDS = {
    combat: [[14162, 3], [13732, 2], [13705, 3], [13712, 2], [1329265, 2], [14251, 1], [13743, 2], [30919, 2], [18427, 3], [13715, 2],
      [13960, 5], [1329284, 5], [1310711, 1], [13750, 1], [14138, 5], [14156, 3], [14165, 3], [14983, 2], [14128, 2], [14144, 2]],
    assassination: [[14138, 5], [14144, 2], [14156, 3], [14165, 3], [14983, 2], [14128, 2], [1329256, 1], [16513, 5], [14113, 5], [14177, 1],
      [14179, 5], [1329328, 1], [14186, 3], [399956, 1], [14162, 3], [13732, 2], [13705, 3], [1224716, 3], [1329265, 1]],
    subtlety: [[13983, 3], [14057, 2], [14082, 2], [13975, 3], [14171, 3], [14183, 1], [13976, 1], [14278, 1], [13981, 2], [1310728, 2],
      [16511, 1], [14185, 1], [30894, 2], [14057, 3], [1329286, 5], [1316709, 1], [14138, 5], [14156, 3], [14165, 3], [14128, 2], [14983, 2], [14144, 2], [14162, 1]],
  };

  GL.register({
    name: 'Rogue',
    armor: () => 'CL',
    weapons: ['Dagger', 'Sword', 'Mace', 'Fist Weapon'],
    rangedTypes: ['Bow', 'Gun', 'Crossbow', 'Thrown'],
    shield: false,
    twoHand: false,
    dualWield: (L) => L >= 10,
    damageSlots: (cfg) => (cfg && cfg.oh && cfg.oh.d1 && !cfg.shield ? ['MainHand', 'OffHand'] : ['MainHand']),
    styles: [{ id: 'combat', name: 'Combat: Sinister Strike (swords, maces, fists or daggers)' },
      { id: 'assassination', name: 'Assassination: Mutilate with two daggers' },
      { id: 'subtlety', name: 'Subtlety: Hemorrhage, Ghostly Strike and Death Mark' }],
    detectSpec: (talents) => {
      const sum = [0, 0, 0];
      let i = 0;
      for (let tr = 0; tr < 3; tr++) for (let k = 0; k < TREES[tr]; k++, i++) sum[tr] += (talents && talents[ORDER[i]]) || 0;
      const top = sum.indexOf(Math.max(...sum));
      return { id: TREE_NAMES[top].toLowerCase(), name: TREE_NAMES[top] };
    },
    statKeys: () => ['str', 'agi', 'ap', 'hit', 'crit'],
    unit: () => 'ap',
    schools: () => [],
    simulate,
    sampleTalents: (L, styleId) => build(BUILDS[styleId] || BUILDS.combat, L),
    about: 'Levelling rogue from the front: white hits with both weapons, Sinister Strike, Hemorrhage or Mutilate, Ghostly Strike, Shank, Slice and Dice, Eviscerate, Rupture and Death Mark when they win, and Instant or Deadly Poison.',
  });
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
