/* Druid (levelling: cat, bear or balance). Rules from the wowsims/forever source and the server's spell data:
   In Cat and Bear Form the paw takes the main-hand weapon's damage per second (Forever change): the cat swings every
   1.0 s for weapon dps x 1.0, the bear every 2.5 s for weapon dps x 2.5, both +-20% and plus attack power / 14 x speed.
   Strength gives 2 attack power; Cat Form adds 100% of Agility as attack power plus 2 per level (3025); the bear
   forms add 3 per level (1178, 9635). Energy 10 a second, cat abilities on a 1 s global cooldown. A bear's landed
   white swing gives 11.25 rage (twice on a crit), hits taken a little more. Shred needs the back, so from the front
   the cat builds with Claw. There is no Tiger's Fury on this server; Omen of Clarity is a trained spell (2 per minute,
   10 s cooldown). Balance: Wrath, Moonfire, Starfire and Insect Swarm with their coefficients from the spell store. */
(function (root) {
  'use strict';
  const GL = root.GearLab || (typeof require !== 'undefined' ? require('../core.js') : null);
  const U = GL.util;

  // ---------- rank tables (spell ids in comments; values from tools/spelldump/druid.json and wowsims spells_auto_gen) ----------
  const mk = (rows, f) => rows.map(f);
  const D = {
    // Wrath 5176 5177 5178 5179 5180 6780 8905 9912: [level, base, per level, max level, variance, sp coef, mana, cast ms]
    wrath: mk([[1, 15, 0.2, 5, 0.154, 0.429, 10, 1500], [6, 21, 0.3, 12, 0.148, 0.486, 20, 1700], [14, 30, 0.5, 20, 0.167, 0.571, 40, 2000],
      [22, 37, 0.6, 28, 0.147, 0.571, 50, 2000], [30, 45, 0.7, 36, 0.13, 0.571, 70, 2000], [38, 54, 0.9, 44, 0.122, 0.571, 80, 2000],
      [46, 68, 0.9, 52, 0.111, 0.571, 100, 2000], [54, 91, 1, 60, 0.112, 0.571, 120, 2000]],
    (r) => ({ lvl: r[0], base: r[1], ppl: r[2], bl: r[0], ml: r[3], v: r[4], coef: r[5], mana: r[6], cast: r[7] / 1000 })),
    // Moonfire 8921 8924 8925 8926 8927 8928 8929 9833 9834 9835: direct 0.15 sp, tick every 3 s 0.13 sp
    // [level, base, per level, max level, variance, tick, duration ms, mana]
    moonfire: mk([[4, 8, 0.5, 9, 0.25, 4, 9000, 25], [10, 13, 0.8, 15, 0.267, 6, 12000, 50], [16, 22, 1, 21, 0.214, 9, 12000, 75],
      [22, 32, 1.5, 27, 0.182, 13, 12000, 105], [28, 47, 1.5, 33, 0.179, 19, 12000, 150], [34, 59, 1.6, 39, 0.18, 23, 12000, 190],
      [40, 73, 1.7, 45, 0.174, 31, 12000, 235], [46, 91, 2.7, 51, 0.169, 39, 12000, 280], [52, 111, 2.1, 57, 0.164, 49, 12000, 325],
      [58, 135, 2.3, 63, 0.156, 60, 12000, 375]],
    (r) => ({ lvl: r[0], base: r[1], ppl: r[2], bl: r[0], ml: r[3], v: r[4], tick: r[5], dur: r[6] / 1000, mana: r[7] })),
    // Starfire 2912 8949 8950 8951 9875 9876 25298: coef 1.0, 3.5 s cast. [level, base, per level, max level, variance, mana]
    starfire: mk([[20, 113, 1.8, 25, 0.202, 95], [26, 154, 2.1, 32, 0.197, 135], [34, 201, 2.2, 40, 0.181, 180], [42, 277, 2.5, 48, 0.176, 230],
      [50, 372, 3, 56, 0.167, 275], [58, 471, 3.2, 64, 0.165, 315], [60, 533, 3.4, 66, 0.163, 340]],
    (r) => ({ lvl: r[0], base: r[1], ppl: r[2], bl: r[0], ml: r[3], v: r[4], mana: r[5] })),
    // Insect Swarm (talent) 5570 24974 24975 24976 24977: tick every 2 s for 12 s, 0.158 sp per tick. [level, tick, mana]
    swarm: mk([[20, 8, 45], [30, 15, 85], [40, 20, 100], [50, 25, 140], [60, 31, 160]], (r) => ({ lvl: r[0], tick: r[1], mana: r[2] })),
    // Claw 1082 3029 5201 9849 9850: 140% of (paw + flat), 45 energy
    claw: mk([[20, 27], [28, 39], [38, 57], [48, 88], [58, 115]], (r) => ({ lvl: r[0], flat: r[1] })),
    // Rake 1822 1823 1824 9904: hit and 3 ticks of 3 s, each + 6.5% attack power, no armor. 40 energy
    rake: mk([[24, 27, 20], [34, 39, 26], [44, 56, 32], [54, 76, 42]], (r) => ({ lvl: r[0], hit: r[1], tick: r[2] })),
    // Rip 1079 9492 9493 9752 9894 9896: 6 ticks of 2 s, each base + per combo point + 1.14% attack power per point (5th counts as 4th). 30 energy
    rip: mk([[20, 4, 5.5], [28, 5, 9], [36, 8, 10.5], [44, 10, 15.8], [52, 14, 22.5], [60, 19, 31.9]], (r) => ({ lvl: r[0], base: r[1], ppr: r[2] })),
    // Ferocious Bite 1328618 22568 22827 22828 22829 (rank 6, 31018, is a book and left out): base + per point + 3.7% AP per point,
    // plus damage per extra energy. 35 energy. [level, base, per point, variance, per energy]
    bite: mk([[24, 17, 30, 0.714, 0.7], [32, 27, 45, 0.727, 1.2], [40, 40, 74, 0.75, 1.8], [48, 62, 115, 0.8, 2.5], [56, 87, 160, 0.714, 3.1]],
      (r) => ({ lvl: r[0], base: r[1], ppr: r[2], v: r[3], perE: r[4] })),
    // Maul 6807 6808 6809 8972 9745 9880 9881: replaces the next swing, paw + flat, 15 rage
    maul: mk([[10, 18], [18, 27], [26, 37], [34, 49], [42, 71], [50, 101], [58, 128]], (r) => ({ lvl: r[0], flat: r[1] })),
    // Lacerate (talent) 1328617 1328616 414644 1235826 1235827: bleed tick per stack every 3 s for 15 s, up to 5 stacks,
    // hit for 10% of the paw per stack after the cast (414647). 15 rage, 1.5 s global cooldown
    lacerate: mk([[25, 4], [34, 6], [42, 10], [50, 12], [58, 15]], (r) => ({ lvl: r[0], tick: r[1] })),
    // Primal Bite (talent) 407995 1238069 1238070: paw + flat, 20 rage, 6 s cooldown, 1.5 s global cooldown
    primal: mk([[40, 42], [50, 62], [60, 77]], (r) => ({ lvl: r[0], flat: r[1] })),
  };
  const T = {
    // Balance
    impWrath: 16814, genesis: 1223081, moonglow: 16845, impMoonfire: 16821, majesty: 1223082, reach: 16819, splendor: 1223083,
    swarm: 5570, vengeance: 16909, impStarfire: 16850, grace: 16880, eclipse: 408248, moonfury: 16896, moonkin: 24858,
    // Feral
    ferocity: 16934, furor: 17056, shredding: 16966, savage: 16998, sharpened: 16942, predatory: 16972, lacerate: 1328617,
    predDisc: 1328613, bloodFrenzy: 16958, lotp: 17007, natInstinct: 1223242, rendTear: 1223246, primal: 407995, shifting: 1322605,
    // Restoration
    hotw: 17003, naturalist: 17069, natShift: 16833,
  };
  const BAL = [16814, 1223081, 16845, 16821, 1223082, 16819, 16918, 1223083, 5570, 16909, 16850, 17245, 16880, 408248, 16896, 24858];
  const FER = [16934, 17056, 17002, 16947, 16940, 16929, 16966, 16998, 1238122, 16942, 16972, 1328617, 1328613, 16958, 17007, 1223242, 1223246, 417051, 407995, 1322605];

  const CAT_LVL = 20, BEAR_LVL = 10;
  // Estimated base mana (the server data gives no table): 50 at level 1 to about 1244 at 60.
  const baseMana = (L) => 50 + 20.24 * (L - 1);
  // Bear rage from hits taken: wowsims core rage.go (2.5 x (1 - assumed armor) x damage / conversion).
  const RAGE_ARM = [[38, 0.218], [42, 0.239], [44, 0.31], [46, 0.36], [47, 0.377], [50, 0.38], [55, 0.381], [59, 0.38], [63, 0.40]];
  function rageArmor(L) {
    if (L <= RAGE_ARM[0][0]) return RAGE_ARM[0][1];
    for (let i = 1; i < RAGE_ARM.length; i++) if (L <= RAGE_ARM[i][0]) {
      const a = RAGE_ARM[i - 1], b = RAGE_ARM[i];
      return a[1] + (b[1] - a[1]) * (L - a[0]) / (b[0] - a[0]);
    }
    return 0.40;
  }
  const rageConv = (L) => 0.0091107836 * L * L + 3.225598133 * L + 4.2652911;

  function points(talents, list) {
    let n = 0;
    for (const id of list) n += (talents && talents[id]) || 0;
    return n;
  }
  // Which style actually runs for this character.
  function form(cfg) {
    const L = cfg.level;
    let st = cfg.style || 'auto';
    if (st === 'auto') st = points(cfg.talents, BAL) > points(cfg.talents, FER) ? 'balance' : 'cat';
    if (st === 'cat' && L < CAT_LVL) st = 'bear';
    if (st === 'bear' && L < BEAR_LVL) st = 'balance';
    return st;
  }

  // ---------- shared numbers ----------
  function derive(cfg, f) {
    const t = (id) => U.tal(cfg, id);
    const L = cfg.level;
    const str = cfg.str * (f === 'cat' ? 1 + 0.02 * Math.min(5, t(T.hotw)) : 1);
    const ps = L * 0.5 * Math.min(3, t(T.predatory));
    let ap = -20 + 2 * str + (cfg.ap || 0) + ((f === 'cat' || f === 'bear') ? (cfg.fap || 0) : 0);
    if (f === 'cat') ap += cfg.agi + 2 * L + ps;
    else if (f === 'bear') ap += 3 * L + ps;
    const feral = f === 'cat' || f === 'bear';
    const critTal = 2 * Math.min(2, t(T.majesty)) + (feral ? 3 * Math.min(2, t(T.sharpened)) + (t(T.lotp) ? 3 : 0) : 0);
    const intT = cfg.int * (1 + 0.02 * Math.min(5, t(T.hotw)));
    const moonkin = f === 'balance' && t(T.moonkin) > 0 && L >= 40;
    return {
      ap, str, crit: U.meleeCrit('Druid', cfg, critTal),
      spcrit: U.spellCrit('Druid', Object.assign({}, cfg, { int: intT }), 2 * Math.min(2, t(T.majesty)) + (moonkin ? 3 : 0)),
      sp: U.spellPower(cfg, 'nat'), spArc: U.spellPower(cfg, 'arc'),
      mana: baseMana(L) + Math.min(20, intT) + 15 * Math.max(0, intT - 20),
      allMult: 1 + 0.02 * Math.min(5, t(T.naturalist)),
      critMult: 2 + 0.1 * Math.min(2, t(T.natInstinct)),
      savage: 1 + 0.05 * Math.min(2, t(T.savage)),
      rend: 0.03 * Math.min(5, t(T.rendTear)),
      bf: 0.5 * Math.min(2, t(T.bloodFrenzy)),
      ferocity: Math.min(5, t(T.ferocity)),
      moonkin, omen: L >= 20,
    };
  }
  function meleeTable(cfg, M) {
    const miss = Math.max(0, M.miss - (cfg.hit || 0) / 100);
    return { miss, avoid: miss + M.dodge + M.parry };
  }
  const wdps = (cfg) => (cfg.mh && cfg.mh.d1 ? U.weaponDps(cfg.mh) : 0);

  // ---------- Cat Form ----------
  function runCat(cfg, fights, seed) {
    const R = U.rng(seed);
    const L = cfg.level, d = derive(cfg, 'cat'), M = U.mob(cfg), t_ = (id) => U.tal(cfg, id);
    const ARM = 1 - M.dr, tb = meleeTable(cfg, M);
    const tGl = tb.avoid + M.glance, tCr = tGl + d.crit;
    const pawMean = Math.max(1, wdps(cfg) * 1.0), apB = d.ap / 14;
    const claw = U.pickRank(D.claw, L), rake = U.pickRank(D.rake, L), rip = U.pickRank(D.rip, L), bite = U.pickRank(D.bite, L);
    const clawCost = 45 - d.ferocity, rakeCost = 40 - d.ferocity, ripCost = 30, biteCost = 35;
    const keepE = t_(T.predDisc) > 0;
    const hasSP = t_(T.shifting) > 0;
    const spCost = 0.55 * baseMana(L) * (1 - 0.1 * Math.min(3, t_(T.natShift)));
    const paw = () => pawMean * (0.8 + 0.4 * R()) + apB;
    const avgClaw = 1.4 * (pawMean + apB + claw.flat) * d.savage * d.allMult * ARM;
    const rakeTick = rake ? (rake.tick + 0.065 * d.ap) * d.savage * d.allMult : 0;
    const rakeHit = rake ? (rake.hit + 0.065 * d.ap) * d.savage * d.allMult : 0;
    const ripTick = (cp) => (rip.base + rip.ppr * cp + 0.0114 * Math.min(cp, 4) * d.ap) * d.allMult;
    const biteDmg = (cp, extra) => (bite.base + bite.ppr * cp + 0.037 * cp * d.ap + extra * bite.perE) * d.allMult;
    const parts = { 'White hits': 0, Claw: 0, Rake: 0, Rip: 0, 'Ferocious Bite': 0 };
    let totTime = 0, totHp = 0, estDps = (pawMean + apB) * ARM * 2.2, ripUsed = 0, rakeUsed = 0, spUsed = 0, ccUsed = 0;
    for (let f = 0; f < fights; f++) {
      const hp = M.hp * (0.7 + 0.6 * R());
      totHp += hp;
      let t = 0, dmg = 0, energy = 100, eAt = 0, cp = 0, gcd = 0, nextSwing = 0, cc = false, ccIcd = 0;
      let mana = d.mana, spReady = 0, rakeEnd = -1, rakeNext = 1e9, ripEnd = -1, ripNext = 1e9, ripT = 0, guard = 0;
      const E = () => Math.min(100, energy + 10 * (t - eAt));
      const setE = (v) => { energy = v; eAt = t; };
      const bleeding = () => t < rakeEnd || t < ripEnd;
      const omen = () => { if (d.omen && t >= ccIcd && R() < 2 / 60) { cc = true; ccIcd = t + 10; } };
      while (dmg < hp && guard++ < 4000) {
        t = Math.min(nextSwing, gcd, rakeNext, ripNext);
        if (t === rakeNext) {
          const x = rakeTick * (1 + (bleeding() ? d.rend : 0));
          dmg += x; parts.Rake += x;
          rakeNext = rakeNext + 3 <= rakeEnd + 1e-9 ? rakeNext + 3 : 1e9;
          continue;
        }
        if (t === ripNext) {
          dmg += ripT; parts.Rip += ripT;
          ripNext = ripNext + 2 <= ripEnd + 1e-9 ? ripNext + 2 : 1e9;
          continue;
        }
        if (t === nextSwing) {
          const r = R();
          let x = 0;
          if (r >= tb.avoid) {
            x = paw() * ARM * d.allMult;
            if (r < tGl) x *= M.glanceMult; else if (r < tCr) x *= 2;
            omen();
          }
          dmg += x; parts['White hits'] += x;
          nextSwing = t + 1.0;
          continue;
        }
        // global cooldown is ready: pick an ability
        const rem = hp - dmg, estRem = rem / estDps, e = E();
        let act = null, cost = 0;
        if (cp > 0 && bite && rem <= biteDmg(cp, Math.max(0, e - biteCost)) * ARM * 0.9) { act = 'bite'; cost = biteCost; }
        else if (cp >= 5) {
          const fb = bite ? biteDmg(cp, Math.max(0, e - biteCost)) * ARM : 0;
          const ripVal = rip ? ripTick(cp) * Math.min(6, Math.floor(estRem / 2)) : 0;
          if (rip && t >= ripEnd && estRem >= 8 && (!bite || ripVal > fb)) { act = 'rip'; cost = ripCost; }
          else if (bite) { act = 'bite'; cost = biteCost; }
          else if (rip) { act = 'claw'; cost = clawCost; }
        }
        if (!act) {
          const ticks = Math.min(3, Math.floor(estRem / 3));
          if (rake && t >= rakeEnd && ticks >= 2 && (rakeHit + ticks * rakeTick) / rakeCost > avgClaw / clawCost) { act = 'rake'; cost = rakeCost; }
          else { act = 'claw'; cost = clawCost; }
        }
        if (cc) cost = 0;
        if (e < cost) {
          if (hasSP && t >= spReady && mana >= spCost && e <= 60) {
            mana -= spCost; spReady = t + 8; setE(Math.min(100, e + 40)); gcd = t + 1.0; spUsed++;
            continue;
          }
          gcd = t + (cost - e) / 10 + 1e-6;
          continue;
        }
        const usedCc = cc && cost === 0;
        if (usedCc) { cc = false; ccUsed++; }
        setE(e - cost);
        gcd = t + 1.0;
        const r = R();
        const landed = r >= tb.avoid;
        const crit = landed && R() < d.crit;
        const rt = 1 + (bleeding() ? d.rend : 0);
        if (!landed) { if (!usedCc) setE(E() + 0.8 * cost); continue; }
        omen();
        if (act === 'claw') {
          let x = 1.4 * (paw() + claw.flat) * d.savage * d.allMult * ARM * rt;
          if (crit) x *= d.critMult;
          dmg += x; parts.Claw += x;
          cp = Math.min(5, cp + 1 + (crit && R() < d.bf ? 1 : 0));
        } else if (act === 'rake') {
          let x = rakeHit * rt;
          if (crit) x *= d.critMult;
          dmg += x; parts.Rake += x;
          rakeEnd = t + 9; rakeNext = t + 3; rakeUsed++;
          cp = Math.min(5, cp + 1 + (crit && R() < d.bf ? 1 : 0));
        } else if (act === 'rip') {
          ripT = ripTick(cp) * (1 + d.rend);
          ripEnd = t + 12; ripNext = t + 2; ripUsed++;
          cp = 0;
        } else {
          const extra = E();
          let x = biteDmg(cp, extra) * ARM * rt;
          if (crit) x *= d.critMult;
          dmg += x; parts['Ferocious Bite'] += x;
          if (!keepE) setE(0);
          cp = 0;
        }
      }
      const ft = Math.max(0.5, t);
      totTime += ft;
      estDps = estDps * 0.9 + 0.1 * (hp / ft);
    }
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), d,
      info: { Form: 'Cat', 'Attack power': Math.round(d.ap), 'Melee crit': (d.crit * 100).toFixed(1) + '%',
        'Rakes per fight': (rakeUsed / fights).toFixed(2), 'Rips per fight': (ripUsed / fights).toFixed(2),
        'Shifting Power per fight': (spUsed / fights).toFixed(2), 'Clearcasting per fight': (ccUsed / fights).toFixed(2) } };
  }

  // ---------- Bear Form ----------
  function runBear(cfg, fights, seed) {
    const R = U.rng(seed);
    const L = cfg.level, d = derive(cfg, 'bear'), M = U.mob(cfg), t_ = (id) => U.tal(cfg, id);
    const ARM = 1 - M.dr, tb = meleeTable(cfg, M);
    const tGl = tb.avoid + M.glance, tCr = tGl + d.crit;
    const S = 2.5, pawMean = Math.max(1, wdps(cfg) * S), apB = d.ap / 14 * S;
    const maul = U.pickRank(D.maul, L);
    const lac = t_(T.lacerate) ? U.pickRank(D.lacerate, L) : null;
    const pb = t_(T.primal) ? U.pickRank(D.primal, L) : null;
    const maulCost = 15 - d.ferocity, pbCost = 20 - d.ferocity, lacCost = 15 - Math.min(3, t_(T.shredding));
    const furor = 0.2 * Math.min(5, t_(T.furor));
    const hitTaken = 2.5 * (1 - rageArmor(L)) * M.dps * M.swing / rageConv(L) * 0.9;
    const paw = () => pawMean * (0.8 + 0.4 * R()) + apB;
    const avgPaw = pawMean + apB;
    // what one rage buys: Maul adds its flat part and Savage Fury but loses the swing's 11.25 rage
    const maulVal = ((avgPaw + maul.flat) * d.savage - avgPaw) * ARM / (maulCost + 11.25);
    const parts = { 'White hits': 0, Maul: 0, 'Primal Bite': 0, Lacerate: 0 };
    let totTime = 0, totHp = 0, estDps = avgPaw / S * ARM * 1.5;
    for (let f = 0; f < fights; f++) {
      const hp = M.hp * (0.7 + 0.6 * R());
      totHp += hp;
      let t = 0, dmg = 0, rage = R() < furor ? 10 : 0, gcd = 0, nextSwing = 0, mobSwing = 1.0, pbReady = 0;
      let stacks = 0, lacEnd = -1, lacNext = 1e9, guard = 0;
      const addRage = (x) => { rage = Math.min(100, rage + x); };
      const bleeding = () => t < lacEnd;
      while (dmg < hp && guard++ < 4000) {
        t = Math.min(nextSwing, gcd, mobSwing, lacNext);
        if (t === lacNext) {
          const x = lac.tick * stacks * d.allMult * (1 + d.rend);
          dmg += x; parts.Lacerate += x;
          lacNext = lacNext + 3 <= lacEnd + 1e-9 ? lacNext + 3 : 1e9;
          if (lacNext === 1e9) stacks = 0;
          continue;
        }
        if (t === mobSwing) { addRage(hitTaken); mobSwing = t + M.swing; continue; }
        if (t === nextSwing) {
          nextSwing = t + S;
          const reserve = pb && pbReady - t < S ? pbCost : 0;
          const rt = 1 + (bleeding() ? d.rend : 0);
          if (maul && rage >= maulCost + reserve) {
            rage -= maulCost;
            const r = R();
            if (r < tb.avoid) { rage += 0.8 * maulCost; continue; }
            let x = (paw() + maul.flat) * d.savage * d.allMult * ARM * rt;
            if (R() < d.crit) { x *= d.critMult; if (R() < d.bf) addRage(5); }
            dmg += x; parts.Maul += x;
            continue;
          }
          const r = R();
          let x = 0;
          if (r >= tb.avoid) {
            x = paw() * ARM * d.allMult;
            if (r < tGl) { x *= M.glanceMult; addRage(11.25); }
            else if (r < tCr) { x *= 2; addRage(22.5); if (R() < d.bf) addRage(5); }
            else addRage(11.25);
          }
          dmg += x; parts['White hits'] += x;
          continue;
        }
        // global cooldown ready
        const rem = hp - dmg, estRem = rem / estDps;
        let act = null, cost = 0;
        if (pb && t >= pbReady && rage >= pbCost) { act = 'pb'; cost = pbCost; }
        else if (lac && rage >= lacCost + (pb && pbReady - t < 1.5 ? pbCost : 0)) {
          const newSt = Math.min(5, stacks + 1);
          const ticks = Math.min(5, Math.floor(estRem / 3));
          const val = (avgPaw * 0.1 * newSt * ARM + lac.tick * ticks * (newSt - stacks + (stacks > 0 && lacEnd - t < 6 ? stacks * 0.5 : 0))) * d.allMult;
          if (ticks >= 1 && val / lacCost > maulVal) { act = 'lac'; cost = lacCost; }
        }
        if (!act) {
          const next = pb ? Math.max(t + 0.1, Math.min(pbReady, t + 0.5)) : t + 0.5;
          gcd = Math.min(next, nextSwing, mobSwing);
          if (gcd <= t) gcd = t + 0.1;
          continue;
        }
        rage -= cost;
        gcd = t + 1.5;
        const r = R();
        const rt = 1 + (bleeding() ? d.rend : 0);
        if (act === 'pb') pbReady = t + 6;
        if (r < tb.avoid) { rage += 0.8 * cost; continue; }
        const crit = R() < d.crit;
        if (crit && R() < d.bf) addRage(5);
        if (act === 'pb') {
          let x = (paw() + pb.flat) * d.allMult * ARM * rt;
          if (crit) x *= d.critMult;
          dmg += x; parts['Primal Bite'] += x;
        } else {
          stacks = Math.min(5, stacks + 1);
          let x = paw() * 0.1 * stacks * d.allMult * ARM * rt;
          if (crit) x *= d.critMult;
          dmg += x; parts.Lacerate += x;
          if (t >= lacEnd) lacNext = t + 3;
          lacEnd = t + 15;
          if (lacNext === 1e9) lacNext = t + 3;
        }
      }
      const ft = Math.max(0.5, t);
      totTime += ft;
      estDps = estDps * 0.9 + 0.1 * (hp / ft);
    }
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), d,
      info: { Form: L >= 40 ? 'Dire Bear' : 'Bear', 'Attack power': Math.round(d.ap), 'Melee crit': (d.crit * 100).toFixed(1) + '%' } };
  }

  // ---------- Balance (caster or Moonkin Form) ----------
  function runBalance(cfg, fights, seed) {
    const R = U.rng(seed);
    const L = cfg.level, d = derive(cfg, 'balance'), M = U.mob(cfg), t_ = (id) => U.tal(cfg, id);
    const wr = U.pickRank(D.wrath, L), mf = U.pickRank(D.moonfire, L), sf = U.pickRank(D.starfire, L);
    const is = t_(T.swarm) ? U.pickRank(D.swarm, L) : null;
    const hit = Math.min(0.99, 1 - Math.max(0.01, M.spellMiss - 0.02 * Math.min(2, t_(T.reach))));
    const all = d.allMult * (1 + 0.02 * Math.min(5, t_(T.moonfury)));
    const per = 1 + 0.02 * Math.min(5, t_(T.genesis));
    const imf = 0.05 * Math.min(2, t_(T.impMoonfire));
    const cm = 1.5 + 0.1 * Math.min(5, t_(T.vengeance));
    const manaMult = 1 - [0, 0.08, 0.17, 0.25][Math.min(3, t_(T.moonglow))];
    const wrCast = wr.cast - 0.1 * Math.min(5, t_(T.impWrath)), wrMana = wr.mana * manaMult * (1 - 0.1 * Math.min(5, t_(T.impWrath)));
    const sfCast = 3.5 - 0.1 * Math.min(5, t_(T.impStarfire));
    const ecl = [0, 0.17, 0.33, 0.5][Math.min(3, t_(T.eclipse))];
    const grace = t_(T.grace) > 0;
    const splendor = t_(T.splendor) > 0;
    const omenMult = d.moonkin ? 2 : 1;
    const spN = d.sp, spA = d.spArc;
    const wrAvg = (U.scaled(wr, L) + wr.coef * spN) * all;
    const sfAvg = sf ? (U.scaled(sf, L) + spA) * all : 0;
    const mfDir = mf ? (U.scaled(mf, L) + 0.15 * spA) * all * (1 + imf) : 0;
    const mfTick = mf ? (mf.tick + 0.13 * spA) * all * per * (1 + imf) : 0;
    const mfTicks = mf ? Math.round((mf.dur + (splendor ? 3 : 0)) / 3) : 0;
    const isTick = is ? (is.tick + 0.158 * spN) * all * per : 0;
    const isTicks = is ? 6 + (splendor ? 1 : 0) : 0;
    const roll = (avg, v) => avg * (1 + v * (R() - 0.5));
    // fallback melee in caster form when the mana runs out
    const w = cfg.mh && cfg.mh.d1 ? cfg.mh : { d1: 1, d2: 2, ws: 2.0 };
    const meleeAp = Math.max(0, -20 + 2 * cfg.str + (cfg.ap || 0));
    const tb = meleeTable(cfg, M), mCrit = U.meleeCrit('Druid', cfg, 2 * Math.min(2, t_(T.majesty)));
    const parts = { Wrath: 0, Starfire: 0, Moonfire: 0, 'Insect Swarm': 0, Melee: 0 };
    let totTime = 0, totHp = 0, estDps = wrAvg / wrCast, oomFights = 0;
    for (let f = 0; f < fights; f++) {
      const hp = M.hp * (0.7 + 0.6 * R());
      totHp += hp;
      let t = 0, dmg = 0, mana = d.mana, cc = false, ccIcd = 0, ngUntil = -1, charges = 0, chEnd = -1;
      let mfNext = 1e9, mfLeft = 0, mfEnd = -1, isNext = 1e9, isLeft = 0, isEnd = -1, free = 0, oom = false, guard = 0;
      while (dmg < hp && guard++ < 4000) {
        t = Math.min(free, mfNext, isNext);
        if (t === mfNext) { dmg += mfTick; parts.Moonfire += mfTick; mfLeft--; mfNext = mfLeft > 0 ? t + 3 : 1e9; continue; }
        if (t === isNext) { dmg += isTick; parts['Insect Swarm'] += isTick; isLeft--; isNext = isLeft > 0 ? t + 2 : 1e9; continue; }
        const rem = hp - dmg, estRem = rem / estDps;
        const haste = t < ngUntil ? 0.9 : 1;
        const gcdT = Math.max(1, 1.5 * haste);
        const can = (m) => cc || mana >= m * manaMult;
        if (oom) {
          const r = R();
          let x = 0;
          if (r >= tb.avoid) {
            x = U.swing(w, meleeAp, w.ws, R) * (1 - M.dr);
            if (r < tb.avoid + M.glance) x *= M.glanceMult; else if (r < tb.avoid + M.glance + mCrit) x *= 2;
          }
          dmg += x; parts.Melee += x; free = t + w.ws;
          continue;
        }
        let act = null, ct = 0;
        if (mf && rem <= mfDir * 0.9 && can(mf.mana)) act = 'mf';
        else if (mf && t >= mfEnd && estRem > 6 && can(mf.mana)) act = 'mf';
        else if (is && t >= isEnd && estRem > 8 && can(is.mana)) act = 'is';
        if (!act) {
          const sfT = Math.max(1, (sfCast - (charges > 0 && t < chEnd ? ecl : 0)) * haste);
          const wrT = Math.max(1, wrCast * haste);
          const sfOk = sf && can(sf.mana), wrOk = mana >= wrMana;
          if (sfOk && (!wrOk || (rem > wrAvg * 1.2 && sfAvg / sfT > wrAvg / wrT))) { act = 'sf'; ct = sfT; }
          else if (wrOk) { act = 'wr'; ct = wrT; }
          else if (sfOk) { act = 'sf'; ct = sfT; }
          else if (mf && can(mf.mana)) act = 'mf';
          else { oom = true; oomFights++; continue; }
        }
        const end = t + (ct || gcdT);
        const castLen = ct || 1.5;
        if (act === 'wr') mana -= wrMana;
        else {
          const m = act === 'sf' ? sf.mana : act === 'mf' ? mf.mana : is.mana;
          if (cc) cc = false; else mana -= m * manaMult;
        }
        if (act === 'sf' && charges > 0 && t < chEnd) charges--;
        // the cast lands at its end; dots and instants land now
        const landed = R() < hit;
        let x = 0, crit = false;
        if (act === 'wr') {
          if (landed) { x = roll(wrAvg, wr.v); if (R() < d.spcrit) { x *= cm; crit = true; } }
          parts.Wrath += x;
          if (ecl > 0) { charges = Math.min(4, (t < chEnd ? charges : 0) + 2); chEnd = end + 15; }
        } else if (act === 'sf') {
          if (landed) { x = roll(sfAvg, sf.v); if (R() < d.spcrit) { x *= cm; crit = true; } }
          parts.Starfire += x;
        } else if (act === 'mf') {
          if (landed) {
            x = roll(mfDir, mf.v); if (R() < d.spcrit + imf) { x *= cm; crit = true; }
            mfLeft = mfTicks; mfNext = t + 3; mfEnd = t + mfTicks * 3;
          }
          parts.Moonfire += x;
        } else {
          if (landed) { isLeft = isTicks; isNext = t + 2; isEnd = t + isTicks * 2; }
        }
        if (act === 'wr' || act === 'sf') {
          // damage at the end of the cast: let ticks before it happen first by deferring
          free = end;
          if (x > 0) {
            // apply now if it would not change who dies first in a meaningful way; ticks are small
            dmg += x;
          }
          if (dmg >= hp) t = end;
        } else { dmg += x; free = end; }
        if (crit && grace) ngUntil = end + 3;
        if (landed && d.omen && t >= ccIcd && R() < 2 * castLen / 60 * omenMult) { cc = true; ccIcd = t + 10; }
      }
      const ft = Math.max(0.5, t);
      totTime += ft;
      estDps = estDps * 0.9 + 0.1 * (hp / ft);
    }
    const notes = [];
    if (oomFights > fights * 0.02) notes.push('Mana ran out in ' + Math.round(oomFights / fights * 100) + '% of fights; the druid then meleed with the weapon in caster form.');
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), d, notes,
      info: { Form: d.moonkin ? 'Moonkin' : 'Caster', 'Nature spell power': Math.round(spN), 'Spell crit': (d.spcrit * 100).toFixed(1) + '%',
        'Mana pool (estimated)': Math.round(d.mana), Filler: sf ? 'Wrath or Starfire, whichever pays more per second' : 'Wrath' } };
  }

  function simulate(cfg, fights, seed) {
    const f = form(cfg);
    const asked = cfg.style || 'auto';
    const r = f === 'cat' ? runCat(cfg, fights, seed) : f === 'bear' ? runBear(cfg, fights, seed) : runBalance(cfg, fights, seed);
    const notes = (r.notes || []).slice();
    if (asked === 'cat' && f !== 'cat') notes.push('Cat Form is trained at level ' + CAT_LVL + ', so this level fights in ' + (f === 'bear' ? 'Bear Form' : 'caster form') + '.');
    if (asked === 'bear' && f !== 'bear') notes.push('Bear Form is trained at level ' + BEAR_LVL + ', so this level fights in caster form.');
    if (asked === 'auto') notes.push('Following the talents: ' + (f === 'balance' ? 'balance caster' : f === 'cat' ? 'Cat Form' : 'Bear Form') + '.');
    if (f === 'cat' || f === 'bear') {
      notes.push('Shred needs to be behind the mob, so from the front the cat builds with Claw; Enrage, Swipe and roars are left out.');
      if (f === 'cat' && U.tal(cfg, T.shifting)) notes.push('Shifting Power uses an estimated mana pool (base mana is not in the data).');
    }
    return { dps: r.dps, ttk: r.ttk, share: r.share, info: r.info, notes };
  }

  function sample(order, L) {
    const out = {};
    let pts = Math.max(0, L - 9);
    for (const [id, max] of order) { const r = Math.min(max, pts); if (r > 0) out[id] = r; pts -= r; }
    return out;
  }
  const CAT_BUILD = [[16934, 5], [16998, 2], [16942, 2], [16972, 3], [16958, 2], [1223242, 2], [1223246, 5], [1322605, 1], [17007, 1], [17056, 5],
    [16947, 3], [16929, 3], [1328617, 1], [407995, 1], [17003, 5], [17069, 5], [1223082, 2], [16814, 3]];
  const BEAR_BUILD = [[16934, 5], [16998, 2], [16929, 3], [16942, 2], [16972, 3], [1328617, 1], [16966, 3], [16958, 2], [1223242, 2], [1223246, 5],
    [407995, 1], [17007, 1], [417051, 5], [17056, 5], [17003, 5], [17069, 5], [1223082, 1]];
  const BAL_BUILD = [[16814, 5], [1223082, 2], [16845, 3], [16821, 2], [16819, 2], [5570, 1], [1223081, 5], [16909, 5], [16850, 5], [16880, 1],
    [408248, 3], [16896, 5], [24858, 1], [1223083, 1], [17069, 5], [17063, 5]];

  GL.register({
    name: 'Druid',
    armor: () => 'CL',
    weapons: ['Staff', 'Mace', 'Dagger', 'Fist Weapon'],
    rangedTypes: [],
    shield: false,
    twoHand: true,
    dualWield: () => false,
    damageSlots: (cfg) => { try { return form(cfg || { level: 60 }) === 'balance' ? [] : ['MainHand']; } catch (e) { return ['MainHand']; } },
    styles: [{ id: 'auto', name: 'Follow the talents' }, { id: 'cat', name: 'Cat Form' }, { id: 'bear', name: 'Bear Form' }, { id: 'balance', name: 'Balance caster' }],
    detectSpec: (talents) => {
      talents = talents || {};
      const b = points(talents, BAL), fe = points(talents, FER);
      if (b > fe) return { id: 'balance', name: 'Balance' };
      if (fe > 0 && (talents[1328617] || talents[407995] || talents[16929] >= 3) && !talents[1322605]) return { id: 'bear', name: 'Feral (bear)' };
      return { id: 'cat', name: fe > 0 ? 'Feral (cat)' : 'Feral' };
    },
    statKeys: (cfg) => (form(cfg || { level: 60 }) === 'balance' ? ['sp', 'int', 'scrit'] : ['str', 'agi', 'ap', 'hit', 'crit']),
    unit: (cfg) => (form(cfg || { level: 60 }) === 'balance' ? 'sp' : 'ap'),
    schools: (cfg) => (form(cfg || { level: 60 }) === 'balance' ? ['nat', 'arc'] : []),
    simulate,
    sampleTalents: (L, style) => sample(style === 'balance' ? BAL_BUILD : style === 'bear' ? BEAR_BUILD : CAT_BUILD, L),
    about: 'Levelling druid against one mob from the front: Cat Form (white swings from the weapon-based paw, Claw, Rake, Rip, Ferocious Bite, Shifting Power), Bear Form (Maul, Lacerate, Primal Bite on rage) or balance (Moonfire, Insect Swarm, Wrath and Starfire on a full mana bar).',
  });
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
