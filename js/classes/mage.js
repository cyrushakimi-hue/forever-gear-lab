/* Mage (levelling, one mob at a time). Frost, fire and arcane rotations.
   Numbers from tools/spelldump/mage.json (WoW Forever) and rules from the wowsims/forever mage source:
   Ice Lance, Arcane Blast, Arcane Wrath and Pyroblast are talents here, Ice Lance shares Fire Blast's 8 s cooldown,
   Fingers of Frost and Frostbite make the target count as Frozen for Shatter and Ice Lance, Winter's Chill feeds
   Cone of Cold, Heating Up shortens Pyroblast, Arcane Blast stacks Arcane Charges (Intellect as spell damage),
   Arcane Wrath adds 5% of maximum mana as spell damage, Missile Barrage speeds up and pays for Arcane Missiles. */
(function (root) {
  'use strict';
  const GL = root.GearLab || (typeof require !== 'undefined' ? require('../core.js') : null);
  const U = GL.util;
  // Rank tables. Trainer ranks only (the level 60 book ranks 25304, 25306 and 25345 are left out).
  // frostbolt 116..10181, fireball 133..10151 (dot = fire damage per tick), fireBlast 2136..10199 (the trainer copies,
  // 8 s cooldown on the global cooldown; 400616-400623 are unused rune copies), pyroblast 11366..18809,
  // coneOfCold 120..10161, frostNova 122..10230, blastWave 11113..13021, iceLance 1312002..1240047 (coefficient 0.115
  // is the wowsims in-game measurement EV-0171, the data states none), arcaneBlast 400574..1239700 (cost 15% of base
  // mana), arcaneWrath 1326079..1326082, arcaneMissiles channels 5143..10212 with their missiles 7268..10274.
  const D = {"frostbolt":[{"id":116,"lvl":4,"base":19,"ppl":0.2,"bl":4,"ml":8,"var":0.1053,"coef":0.407,"mana":25,"cast":1.5},{"id":205,"lvl":8,"base":29,"ppl":0.3,"bl":8,"ml":12,"var":0.1212,"coef":0.489,"mana":35,"cast":1.8},{"id":837,"lvl":14,"base":46,"ppl":0.5,"bl":14,"ml":18,"var":0.1111,"coef":0.597,"mana":50,"cast":2.2},{"id":7322,"lvl":20,"base":70,"ppl":0.8,"bl":20,"ml":24,"var":0.1026,"coef":0.706,"mana":65,"cast":2.6},{"id":8406,"lvl":26,"base":104,"ppl":1.3,"bl":26,"ml":30,"var":0.0909,"coef":0.814,"mana":100,"cast":3.0},{"id":8407,"lvl":32,"base":134,"ppl":1.7,"bl":32,"ml":36,"var":0.0879,"coef":0.814,"mana":130,"cast":3.0},{"id":8408,"lvl":38,"base":181,"ppl":2,"bl":38,"ml":42,"var":0.0844,"coef":0.814,"mana":160,"cast":3.0},{"id":10179,"lvl":44,"base":244,"ppl":2.3,"bl":44,"ml":48,"var":0.0789,"coef":0.814,"mana":195,"cast":3.0},{"id":10180,"lvl":50,"base":308,"ppl":2.6,"bl":50,"ml":54,"var":0.0815,"coef":0.814,"mana":225,"cast":3.0},{"id":10181,"lvl":56,"base":386,"ppl":2.9,"bl":56,"ml":60,"var":0.0762,"coef":0.814,"mana":260,"cast":3.0}],"fireball":[{"id":133,"lvl":1,"base":18,"ppl":0.2,"bl":1,"ml":5,"var":0.4444,"coef":0.429,"mana":30,"cast":1.5,"dot":1,"dotCoef":0,"per":2.0,"ticks":2},{"id":143,"lvl":6,"base":32,"ppl":0.3,"bl":6,"ml":10,"var":0.3684,"coef":0.571,"mana":45,"cast":2.0,"dot":1,"dotCoef":0,"per":2.0,"ticks":3},{"id":145,"lvl":12,"base":51,"ppl":0.6,"bl":12,"ml":16,"var":0.3175,"coef":0.714,"mana":65,"cast":2.5,"dot":2,"dotCoef":0,"per":2.0,"ticks":3},{"id":3140,"lvl":18,"base":77,"ppl":0.9,"bl":18,"ml":22,"var":0.32,"coef":0.857,"mana":95,"cast":3.0,"dot":3,"dotCoef":0,"per":2.0,"ticks":4},{"id":8400,"lvl":24,"base":120,"ppl":1.4,"bl":24,"ml":28,"var":0.2945,"coef":1,"mana":140,"cast":3.5,"dot":4,"dotCoef":0,"per":2.0,"ticks":4},{"id":8401,"lvl":30,"base":153,"ppl":1.8,"bl":30,"ml":34,"var":0.2845,"coef":1,"mana":185,"cast":3.5,"dot":6,"dotCoef":0,"per":2.0,"ticks":4},{"id":8402,"lvl":36,"base":187,"ppl":2.3,"bl":36,"ml":40,"var":0.2712,"coef":1,"mana":220,"cast":3.5,"dot":6,"dotCoef":0,"per":2.0,"ticks":4},{"id":10148,"lvl":42,"base":235,"ppl":2.2,"bl":42,"ml":46,"var":0.2623,"coef":1,"mana":260,"cast":3.5,"dot":8,"dotCoef":0,"per":2.0,"ticks":4},{"id":10149,"lvl":48,"base":300,"ppl":2.4,"bl":48,"ml":52,"var":0.2539,"coef":1,"mana":305,"cast":3.5,"dot":10,"dotCoef":0,"per":2.0,"ticks":4},{"id":10150,"lvl":54,"base":374,"ppl":2.7,"bl":54,"ml":58,"var":0.2472,"coef":1,"mana":350,"cast":3.5,"dot":12,"dotCoef":0,"per":2.0,"ticks":4},{"id":10151,"lvl":60,"base":451,"ppl":3,"bl":60,"ml":64,"var":0.2414,"coef":1,"mana":395,"cast":3.5,"dot":14,"dotCoef":0,"per":2.0,"ticks":4}],"fireBlast":[{"id":2136,"lvl":6,"base":28,"ppl":0.6,"bl":6,"ml":11,"var":0.2857,"coef":0.429,"mana":40},{"id":2137,"lvl":14,"base":58,"ppl":1,"bl":14,"ml":19,"var":0.2188,"coef":0.429,"mana":75},{"id":2138,"lvl":22,"base":100,"ppl":1.4,"bl":22,"ml":27,"var":0.2087,"coef":0.429,"mana":115},{"id":8412,"lvl":30,"base":163,"ppl":1.8,"bl":30,"ml":35,"var":0.1838,"coef":0.429,"mana":165},{"id":8413,"lvl":38,"base":236,"ppl":2.2,"bl":38,"ml":43,"var":0.1805,"coef":0.429,"mana":220},{"id":10197,"lvl":46,"base":331,"ppl":2.6,"bl":46,"ml":51,"var":0.1708,"coef":0.429,"mana":280},{"id":10199,"lvl":54,"base":438,"ppl":3,"bl":54,"ml":59,"var":0.166,"coef":0.429,"mana":340}],"pyroblast":[{"id":11366,"lvl":20,"base":110,"ppl":1.5,"bl":20,"ml":24,"var":0.2805,"coef":1,"mana":125,"cast":6.0,"dot":11,"dotCoef":0.15,"per":3.0,"ticks":4},{"id":12505,"lvl":24,"base":134,"ppl":1.7,"bl":24,"ml":30,"var":0.2692,"coef":1,"mana":150,"cast":6.0,"dot":14,"dotCoef":0.15,"per":3.0,"ticks":4},{"id":12522,"lvl":30,"base":191,"ppl":2.1,"bl":30,"ml":36,"var":0.2474,"coef":1,"mana":195,"cast":6.0,"dot":19,"dotCoef":0.15,"per":3.0,"ticks":4},{"id":12523,"lvl":36,"base":245,"ppl":2.4,"bl":36,"ml":42,"var":0.2406,"coef":1,"mana":240,"cast":6.0,"dot":25,"dotCoef":0.15,"per":3.0,"ticks":4},{"id":12524,"lvl":42,"base":311,"ppl":2.7,"bl":42,"ml":48,"var":0.2343,"coef":1,"mana":285,"cast":6.0,"dot":31,"dotCoef":0.15,"per":3.0,"ticks":4},{"id":12525,"lvl":48,"base":394,"ppl":3,"bl":48,"ml":54,"var":0.2257,"coef":1,"mana":335,"cast":6.0,"dot":38,"dotCoef":0.15,"per":3.0,"ticks":4},{"id":12526,"lvl":54,"base":481,"ppl":3.4,"bl":54,"ml":60,"var":0.2222,"coef":1,"mana":385,"cast":6.0,"dot":46,"dotCoef":0.15,"per":3.0,"ticks":4},{"id":18809,"lvl":60,"base":583,"ppl":4.6,"bl":60,"ml":66,"var":0.2167,"coef":1,"mana":440,"cast":6.0,"dot":53,"dotCoef":0.15,"per":3.0,"ticks":4}],"coneOfCold":[{"id":120,"lvl":26,"base":97,"ppl":0.8,"bl":26,"ml":31,"var":0.0971,"coef":0.129,"mana":210},{"id":8492,"lvl":34,"base":144,"ppl":1,"bl":34,"ml":39,"var":0.0915,"coef":0.129,"mana":290},{"id":10159,"lvl":42,"base":204,"ppl":1.2,"bl":42,"ml":47,"var":0.0939,"coef":0.129,"mana":380},{"id":10160,"lvl":50,"base":267,"ppl":1.3,"bl":50,"ml":55,"var":0.0939,"coef":0.129,"mana":465},{"id":10161,"lvl":58,"base":340,"ppl":1.5,"bl":58,"ml":63,"var":0.0857,"coef":0.129,"mana":555}],"frostNova":[{"id":122,"lvl":10,"base":20,"ppl":0.5,"bl":10,"ml":15,"var":0.1,"coef":0.029,"mana":55},{"id":865,"lvl":26,"base":34,"ppl":0.5,"bl":26,"ml":31,"var":0.1143,"coef":0.029,"mana":85},{"id":6131,"lvl":40,"base":53,"ppl":0.5,"bl":40,"ml":45,"var":0.1091,"coef":0.029,"mana":115},{"id":10230,"lvl":54,"base":73,"ppl":0.5,"bl":54,"ml":59,"var":0.1067,"coef":0.029,"mana":145}],"blastWave":[{"id":11113,"lvl":30,"base":163,"ppl":1,"bl":30,"ml":36,"var":0.1882,"coef":0.129,"mana":215},{"id":13018,"lvl":36,"base":212,"ppl":1.2,"bl":36,"ml":42,"var":0.181,"coef":0.129,"mana":270},{"id":13019,"lvl":44,"base":293,"ppl":1.4,"bl":44,"ml":50,"var":0.1716,"coef":0.129,"mana":355},{"id":13020,"lvl":52,"base":389,"ppl":1.6,"bl":52,"ml":58,"var":0.1704,"coef":0.129,"mana":450},{"id":13021,"lvl":60,"base":493,"ppl":1.9,"bl":60,"ml":66,"var":0.163,"coef":0.129,"mana":545}],"iceLance":[{"id":1312002,"lvl":20,"base":28,"ppl":0.35,"bl":20,"ml":26,"var":0.1667,"coef":0.115,"mana":45},{"id":400640,"lvl":28,"base":36,"ppl":0.4,"bl":28,"ml":32,"var":0.1667,"coef":0.115,"mana":55},{"id":1240044,"lvl":34,"base":45,"ppl":0.5,"bl":34,"ml":40,"var":0.1667,"coef":0.115,"mana":70},{"id":1240045,"lvl":42,"base":79,"ppl":0.7,"bl":42,"ml":48,"var":0.1667,"coef":0.115,"mana":105},{"id":1240046,"lvl":48,"base":98,"ppl":0.7,"bl":48,"ml":56,"var":0.1667,"coef":0.115,"mana":120},{"id":1240047,"lvl":56,"base":145,"ppl":0.9,"bl":56,"ml":64,"var":0.1667,"coef":0.115,"mana":160}],"arcaneBlast":[{"id":400574,"lvl":20,"base":32,"ppl":0.5,"bl":20,"ml":28,"var":0.151,"coef":0.429,"pct":15,"cast":1.5},{"id":1239696,"lvl":30,"base":78,"ppl":0.8,"bl":30,"ml":38,"var":0.151,"coef":0.429,"pct":15,"cast":1.5},{"id":1239697,"lvl":40,"base":101,"ppl":1,"bl":40,"ml":48,"var":0.151,"coef":0.429,"pct":15,"cast":1.5},{"id":1239699,"lvl":50,"base":168,"ppl":1.3,"bl":50,"ml":58,"var":0.151,"coef":0.429,"pct":15,"cast":1.5},{"id":1239700,"lvl":60,"base":236,"ppl":1.6,"bl":60,"ml":68,"var":0.151,"coef":0.429,"pct":15,"cast":1.5}],"arcaneWrath":[{"id":1326079,"lvl":25,"base":120,"ppl":1.4,"bl":25,"ml":35,"var":0.201,"coef":1,"mana":140,"cast":3.5},{"id":1326080,"lvl":36,"base":187,"ppl":2.3,"bl":36,"ml":47,"var":0.201,"coef":1,"mana":220,"cast":3.5},{"id":1326081,"lvl":48,"base":300,"ppl":2.4,"bl":48,"ml":59,"var":0.201,"coef":1,"mana":305,"cast":3.5},{"id":1326082,"lvl":60,"base":451,"ppl":3,"bl":60,"ml":71,"var":0.201,"coef":1,"mana":395,"cast":3.5}],"arcaneMissiles":[{"id":5143,"lvl":8,"mana":85,"n":3,"base":24,"ppl":0.2,"bl":8,"ml":12,"coef":0.286,"missile":7268},{"id":5144,"lvl":16,"mana":140,"n":4,"base":34,"ppl":0.3,"bl":16,"ml":20,"coef":0.286,"missile":7269},{"id":5145,"lvl":24,"mana":235,"n":5,"base":47,"ppl":0.4,"bl":24,"ml":28,"coef":0.286,"missile":7270},{"id":8416,"lvl":32,"mana":320,"n":5,"base":66,"ppl":0.6,"bl":32,"ml":36,"coef":0.286,"missile":8419},{"id":8417,"lvl":40,"mana":410,"n":5,"base":95,"ppl":0.7,"bl":40,"ml":44,"coef":0.286,"missile":8418},{"id":10211,"lvl":48,"mana":500,"n":5,"base":130,"ppl":0.8,"bl":48,"ml":52,"coef":0.286,"missile":10273},{"id":10212,"lvl":56,"mana":595,"n":5,"base":171,"ppl":0.9,"bl":56,"ml":60,"coef":0.286,"missile":10274}]};
  const T = {
    wandSpec: 6057, arcSubtlety: 11210, arcConc: 11213, barrage: 400588, arcImpact: 11242, arcBlast: 400574,
    arcWrath: 1326079, pom: 12043, arcMind: 11232, arcInst: 15058, arcPower: 12042,
    incin: 18459, accel: 11069, ignite: 11119, pyro: 11366, impFireBlast: 11078, impScorch: 11095, heatingUp: 400624,
    moe: 29074, critMass: 11115, blastWave: 11113, firePower: 11124, combustion: 11129,
    impFrostbolt: 11070, precision: 29438, iceShards: 11207, frostbite: 11071, impNova: 11165, frostChan: 11160,
    iceLance: 1312002, shatter: 11170, impCoC: 11190, coldSnap: 12472, fof: 400647, wintersChill: 11180, iceBarrier: 11426,
  };
  // Talent trees in data/talents.json order: arcane, fire, frost.
  const TREES = [
    [6057, 11237, 28574, 11210, 29441, 11213, 400588, 11247, 11242, 400574, 11252, 11255, 18462, 1326079, 12043, 11232, 15058, 12042],
    [18459, 11069, 11119, 11100, 11103, 11083, 11108, 11366, 11078, 11095, 11094, 400624, 29074, 11115, 11113, 11124, 11129],
    [11189, 11070, 29438, 11207, 11071, 11165, 11175, 11160, 11185, 1312002, 16757, 11958, 11170, 11190, 12472, 400647, 11180, 11426],
  ];
  const SPECS = [{ id: 'arcane', name: 'Arcane' }, { id: 'fire', name: 'Fire' }, { id: 'frost', name: 'Frost' }];
  const SCHOOL = { frost: 'fro', fire: 'fir', arcane: 'arc' };

  function detectSpec(talents) {
    const pts = TREES.map((ids) => ids.reduce((a, id) => a + ((talents && talents[id]) || 0), 0));
    let best = -1, bi = 2;
    for (let i = 0; i < 3; i++) if (pts[i] > best) { best = pts[i]; bi = i; }
    if (best <= 0) return { id: 'none', name: 'No talents yet' };
    return SPECS[bi];
  }
  function styleOf(cfg) {
    const s = cfg.style || 'auto';
    if (s !== 'auto') return s;
    const sp = detectSpec(cfg.talents || {}, cfg.level).id;
    return sp === 'none' ? 'frost' : sp;
  }

  // Base mana: 1213 at level 60 is the game data (wowsims base stats); the level 1 value (100) and the curve are estimates.
  const baseMana = (L) => 100 + 1113 * Math.pow(Math.max(0, L - 1) / 59, 1.1);
  const intMana = (i) => Math.min(i, 20) + 15 * Math.max(0, i - 20);

  function derive(cfg) {
    const t = (id) => U.tal(cfg, id);
    const L = cfg.level;
    const intT = (cfg.int || 0) * (1 + 0.02 * Math.min(5, t(T.arcMind)));      // Arcane Mind 11232: 2% Intellect per point
    const ai = Math.min(3, t(T.arcInst));                                         // Arcane Instability 15058: 1% damage and crit per point
    const base = U.spellCrit('Mage', Object.assign({}, cfg, { int: intT }), ai);
    const sp = { fro: U.spellPower(cfg, 'fro'), fir: U.spellPower(cfg, 'fir'), arc: U.spellPower(cfg, 'arc') };
    const M = U.mob(cfg);
    const bm = baseMana(L);
    const gen = 1 + 0.01 * ai;
    const iceBarrier = t(T.iceBarrier) > 0 && L >= 40;
    const frostMult = gen * (iceBarrier ? 1.20 : 1);   // Frigid Power 1326891 +15% while Ice Barrier is kept up, +5% while shielded (11426)
    const frostChan = 1 - 0.05 * Math.min(3, t(T.frostChan));                     // Frost Channeling 11160
    const critMass = 2 * Math.min(3, t(T.critMass));                              // Critical Mass 11115, fire
    const arcImpact = 2 * Math.min(3, t(T.arcImpact));                            // Arcane Impact 11242, arcane
    const incin = 2 * Math.min(5, t(T.incin));                                    // Incineration 18459: Fire Blast, Ice Lance, Arcane Blast
    const cmFro = 1 + 0.5 * (1 + 0.2 * Math.min(5, t(T.iceShards)));             // Ice Shards 11207: +20% of the crit bonus per point
    const cmArc = 1 + 0.5 * (1 + 0.2 * Math.min(5, t(T.arcMind)));               // Arcane Mind 11232 effect 2
    const crit = (pct) => Math.max(0, Math.min(1, base + pct / 100));
    const accel = 0.1 * Math.min(5, t(T.accel));                                  // Accelerant 11069
    const mk = (list, school, o) => {
      const r = U.pickRank(list, L);
      if (!r) return null;
      const s = { id: r.id, b: U.scaled(r, L), v: r.var || 0, coef: r.coef || 0, sp: sp[school], school,
        mana: (r.mana || 0) + (r.pct ? bm * r.pct / 100 : 0), cast: Math.max(1.5, r.cast || 0), r,
        crit: crit(school === 'fir' ? critMass : school === 'arc' ? arcImpact : 0),
        cm: school === 'fro' ? cmFro : school === 'arc' ? cmArc : 1.5,
        mult: school === 'fro' ? frostMult : gen };
      s.baseCost = s.mana;
      if (school === 'fro') s.mana *= frostChan;
      if (o) Object.assign(s, o(s, r));
      return s;
    };
    const known = (id, lvl) => t(id) > 0 && L >= lvl;
    const d = {
      L, intT, maxMana: bm + intMana(intT), baseMana: bm, base, sp, M,
      miss: Math.max(0.01, M.spellMiss - 0.02 * Math.min(3, t(T.precision))),   // Precision 29438
      frostbolt: mk(D.frostbolt, 'fro', (s) => ({ cast: Math.max(1.5, s.cast - 0.1 * Math.min(5, t(T.impFrostbolt))) })),
      fireball: mk(D.fireball, 'fir', (s) => ({ cast: Math.max(1.5, s.cast - accel) })),
      fireBlast: mk(D.fireBlast, 'fir', (s) => ({ crit: Math.min(1, s.crit + incin / 100), cd: 8 - Math.min(2, t(T.impFireBlast)) })),
      pyro: known(T.pyro, 20) ? mk(D.pyroblast, 'fir') : null,
      blastWave: known(T.blastWave, 30) ? mk(D.blastWave, 'fir') : null,
      coc: mk(D.coneOfCold, 'fro', (s) => ({ mult: s.mult * (1 + [0, 0.12, 0.23, 0.35][Math.min(3, t(T.impCoC))]) })),   // Improved Cone of Cold 11190
      nova: mk(D.frostNova, 'fro', () => ({ cd: 25 - 2 * Math.min(2, t(T.impNova)) })),
      iceLance: known(T.iceLance, 20) ? mk(D.iceLance, 'fro', (s) => ({ crit: Math.min(1, s.crit + incin / 100) })) : null,
      arcBlast: known(T.arcBlast, 20) ? mk(D.arcaneBlast, 'arc', (s) => ({ crit: Math.min(1, s.crit + incin / 100) })) : null,
      arcWrath: known(T.arcWrath, 25) ? mk(D.arcaneWrath, 'arc', (s) => ({ cast: Math.max(1.5, s.cast - accel) })) : null,
      am: mk(D.arcaneMissiles, 'arc', (s, r) => ({ n: r.n, v: 0 })),
      shatter: [0, 0.17, 0.33, 0.50][Math.min(3, t(T.shatter))],                  // Shatter 11170
      frostbite: 0.05 * Math.min(3, t(T.frostbite)),                              // Frostbite 11071 (freeze 12494, 5 s)
      fofCharges: Math.min(2, t(T.fof)),                                          // Fingers of Frost 400647: 15% per Chill hit, 1 or 2 charges, 15 s
      wc: 0.2 * Math.min(5, t(T.wintersChill)),                                   // Winter's Chill 11180 / 12579
      ignite: 0.08 * Math.min(5, t(T.ignite)),                                    // Ignite 11119 / 412538: over 4 s in 2 ticks
      heatingUp: t(T.heatingUp) > 0,                                              // Heating Up 400624 / 400625
      moe: 0.1 * Math.min(3, t(T.moe)),                                           // Master of Elements 29074
      firePower: 0.01 * Math.min(3, t(T.firePower)),                              // Fire Power 11124
      ac: 0.02 * Math.min(5, t(T.arcConc)),                                       // Arcane Concentration 11213 / Clearcasting 12536
      barrage: 0.2 * Math.min(2, t(T.barrage)),                                   // Missile Barrage 400588 / 400589
      wandSpec: [0, 0.13, 0.25][Math.min(2, t(T.wandSpec))],                      // Wand Specialization 6057
    };
    return d;
  }

  // Actions
  const A_FBL = 1, A_IL = 2, A_COC = 3, A_NOVA = 4, A_BW = 5, A_FROST = 6, A_FIRE = 7, A_PYRO = 8, A_AW = 9, A_AB = 10, A_AM = 11;
  const LABEL = { 1: 'Fire Blast', 2: 'Ice Lance', 3: 'Cone of Cold', 4: 'Frost Nova', 5: 'Blast Wave', 6: 'Frostbolt', 7: 'Fireball',
    8: 'Pyroblast', 9: 'Arcane Wrath', 10: 'Arcane Blast', 11: 'Arcane Missiles' };
  const FREEZE_BREAK = 0.25;   // guess: chance that a landed hit breaks a Frost Nova or Frostbite freeze

  function run(cfg, d, style, useAB, fights, seed) {
    const R = U.rng(seed);
    const M = d.M, L = d.L;
    const miss = d.miss;
    const wand = cfg.ranged && cfg.ranged.type === 'Wand' && cfg.ranged.d1 ? cfg.ranged : null;
    const wandMiss = Math.max(0, M.miss - (cfg.hit || 0) / 100);
    const wandCrit = U.meleeCrit('Mage', cfg, 0);
    const parts = { Frostbolt: 0, Fireball: 0, 'Fire Blast': 0, 'Ice Lance': 0, 'Cone of Cold': 0, 'Frost Nova': 0, 'Blast Wave': 0,
      Pyroblast: 0, Ignite: 0, 'Arcane Wrath': 0, 'Arcane Blast': 0, 'Arcane Missiles': 0, Wand: 0 };
    const main = style === 'fire' ? d.fireball : style === 'frost' ? d.frostbolt : d.am;
    // per-fight state
    let hp = 0, dmg = 0, dead = false, tEnd = 0, mana = 0;
    let fbReady = 0, cocReady = 0, novaReady = 0, bwReady = 0, awReady = 0;
    let frozenUntil = -1, fof = 0, fofExp = -1, wcSt = 0, wcExp = -1, hu = 0, huExp = -1, cc = false, acIcd = 0;
    let mbExp = -1, abSt = 0, abExp = -1;
    const dots = [{ lab: 'Fireball', left: 0, next: 0, amt: 0, per: 2 }, { lab: 'Pyroblast', left: 0, next: 0, amt: 0, per: 3 },
      { lab: 'Ignite', left: 0, next: 0, amt: 0, per: 2 }];
    let oomFights = 0, wandFights = 0, totTime = 0, totHp = 0;

    function deal(x, lab, time) {
      if (dead || x <= 0) return;
      dmg += x; parts[lab] += x;
      if (dmg >= hp) { dead = true; tEnd = time; }
    }
    function advance(to) {
      while (!dead) {
        let o = null;
        for (let i = 0; i < 3; i++) { const q = dots[i]; if (q.left > 0 && q.next <= to && (!o || q.next < o.next)) o = q; }
        if (!o) return;
        deal(o.amt, o.lab, o.next);
        o.left--; o.next += o.per;
      }
    }
    const frozenAt = (time) => time < frozenUntil || (fof > 0 && time < fofExp);
    const chargeSp = (time) => (abSt > 0 && time < abExp ? abSt * 0.12 * d.intT : 0);   // Arcane Charges 400573: 12% of Intellect per stack
    const firePowerMult = () => {
      if (!d.firePower) return 1;
      let n = 0;
      for (let i = 0; i < 3; i++) if (dots[i].left > 0) n++;
      return 1 + d.firePower * Math.min(4, n);
    };
    function cost(s) {
      if (!s) return 1e9;
      if (cc) return 0;
      return s.mana;
    }
    function abCost(time) { return cc ? 0 : d.arcBlast.mana * (1 + (time < abExp ? abSt : 0)); }   // +100% cost per Arcane Charge
    function pay(c) { mana -= c; if (cc && c === 0) cc = false; }
    // One direct hit. Returns damage dealt (0 on a miss); sets lastCrit.
    let lastCrit = false, lastLanded = false;
    function hit(s, time, extraSp, mult, extraCrit) {
      lastCrit = false; lastLanded = false;
      if (R() < miss) return 0;
      lastLanded = true;
      let x = s.b * (1 + s.v * (2 * R() - 1)) + s.coef * (s.sp + chargeSp(time) + extraSp);
      x *= s.mult * mult;
      if (s.school === 'fir') x *= firePowerMult();
      let c = s.crit + extraCrit;
      if (frozenAt(time)) c += d.shatter;
      if (R() < c) { lastCrit = true; x *= s.cm; if (s.school !== 'arc' && d.moe) mana += s.baseCost * d.moe; }
      return x;
    }
    function afterLanded(time, canBreak) {
      if (d.ac && time >= acIcd && R() < d.ac) { cc = true; acIcd = time + 1; }
      if (canBreak && time < frozenUntil && R() < FREEZE_BREAK) frozenUntil = -1;
    }
    function igniteFrom(x, time) {
      if (!d.ignite || !lastCrit) return;
      const o = dots[2];
      const total = (o.left > 0 ? o.amt * o.left : 0) + x * d.ignite;
      o.left = 2; o.amt = total / 2; o.next = time + 2;
    }
    function heat(n, time) {
      if (!d.heatingUp || n <= 0) return;
      if (time >= huExp) hu = 0;
      hu = Math.min(3, hu + n); huExp = time + 20;
    }
    let granted = false;
    function chill(time) {   // a landed Chill effect (Frostbolt, Cone of Cold)
      const r = R();
      if (r < d.frostbite) { frozenUntil = Math.max(frozenUntil, time + 5); }
      if (d.fofCharges && (r < d.frostbite || r < 0.15)) { fof = d.fofCharges; fofExp = time + 15; granted = true; }
    }
    function spendFof(time) {
      if (fof > 0 && !granted && time < fofExp) fof--;
      granted = false;
    }
    function addWc(time) {
      if (d.wc && R() < d.wc) { if (time >= wcExp) wcSt = 0; wcSt = Math.min(5, wcSt + 1); wcExp = time + 15; }
    }
    function barrageRoll(chance, time) { if (d.barrage && R() < chance) mbExp = time + 15; }

    function pick(t) {
      const inMelee = t > 0;
      const can = (s) => s && mana >= cost(s);
      if (style === 'frost') {
        const fr = frozenAt(t);
        if (inMelee && d.nova && t >= novaReady && !fr && (d.shatter > 0 || d.iceLance) && can(d.nova)) return A_NOVA;
        if (d.iceLance && fr && t >= fbReady && can(d.iceLance)) return A_IL;
        if (inMelee && d.coc && t >= cocReady && can(d.coc)) return A_COC;
        if (d.fireBlast && t >= fbReady && !(d.iceLance && fr) && can(d.fireBlast)) return A_FBL;
        if (can(d.frostbolt)) return A_FROST;
        return 0;
      }
      if (style === 'fire') {
        if (inMelee && d.blastWave && t >= bwReady && can(d.blastWave)) return A_BW;
        if (d.fireBlast && t >= fbReady && can(d.fireBlast)) return A_FBL;
        if (d.pyro && can(d.pyro)) {
          const st = t < huExp ? hu : 0;
          const pc = Math.max(1.5, d.pyro.cast * (1 - 0.25 * st));
          const pd = d.pyro.b + d.pyro.coef * d.pyro.sp + 2 * (d.pyro.r.dot + d.pyro.r.dotCoef * d.pyro.sp);
          const fd = d.fireball.b + d.fireball.coef * d.fireball.sp;
          // With Heating Up, waiting for two stacks (a 3 s Pyroblast) beat casting it at any better-than-Fireball rate.
          if (d.heatingUp ? st >= 2 : pd / pc > fd / d.fireball.cast) return A_PYRO;
        }
        if (can(d.fireball)) return A_FIRE;
        return 0;
      }
      // arcane
      if (d.am && t < mbExp) return A_AM;
      if (d.arcWrath && t >= awReady && can(d.arcWrath)) return A_AW;
      if (d.fireBlast && t >= fbReady && can(d.fireBlast)) return A_FBL;
      const st = abExp > t ? abSt : 0;
      if (useAB && d.arcBlast && st < 4 && mana >= abCost(t)) return A_AB;
      if (can(d.am)) return A_AM;
      if (d.arcBlast && mana >= abCost(t)) return A_AB;
      return 0;
    }

    for (let f = 0; f < fights; f++) {
      hp = M.hp * (0.7 + 0.6 * R());
      dmg = 0; dead = false; tEnd = 0; mana = d.maxMana;
      fbReady = cocReady = novaReady = bwReady = awReady = 0;
      frozenUntil = -1; fof = 0; fofExp = -1; wcSt = 0; wcExp = -1; hu = 0; huExp = -1; cc = false; acIcd = 0;
      mbExp = -1; abSt = 0; abExp = -1; granted = false;
      for (let i = 0; i < 3; i++) { dots[i].left = 0; dots[i].next = 0; }
      let t = 0, guard = 0, oom = false;
      while (!dead && guard++ < 2000) {
        const a = oom ? 0 : pick(t);
        if (a === 0) {
          if (!oom) { oom = true; oomFights++; if (wand) wandFights++; }
          if (wand) {
            t += wand.ws; advance(t);
            if (!dead && R() >= wandMiss) {
              let x = (wand.d1 + (wand.d2 - wand.d1) * R()) * (1 + d.wandSpec);
              if (R() < wandCrit) x *= 1.5;   // assumed wand crit multiplier
              deal(x, 'Wand', t);
            }
            continue;
          }
          advance(1e9);                       // no wand: stop casting, let the burns finish
          if (!dead) tEnd = Math.max(t, ...dots.map((o) => o.next - o.per));
          break;
        }
        if (a === A_AM) {
          const s = d.am, fast = t < mbExp;
          if (fast) mbExp = -1; else pay(cost(s));
          const per = fast ? 0.5 : 1;
          if (d.ac && t >= acIcd && R() < d.ac) { cc = true; acIcd = t + 1; }
          for (let k = 1; k <= s.n && !dead; k++) {
            const tt = t + k * per;
            advance(tt); if (dead) break;
            const x = hit(s, tt, 0, 1, 0);
            if (lastLanded) { if (fof > 0 && tt < fofExp) fof--; }
            deal(x, 'Arcane Missiles', tt);
          }
          t += Math.max(1.5, s.n * per);
          continue;
        }
        const instant = a <= A_BW;
        let s = null;
        switch (a) {
          case A_FBL: s = d.fireBlast; break; case A_IL: s = d.iceLance; break; case A_COC: s = d.coc; break;
          case A_NOVA: s = d.nova; break; case A_BW: s = d.blastWave; break; case A_FROST: s = d.frostbolt; break;
          case A_FIRE: s = d.fireball; break; case A_PYRO: s = d.pyro; break; case A_AW: s = d.arcWrath; break; case A_AB: s = d.arcBlast; break;
        }
        let ct = 1.5;
        if (a === A_PYRO) ct = Math.max(1.5, s.cast * (1 - 0.25 * (t < huExp ? hu : 0)));
        else if (!instant) ct = s.cast;
        const tc = instant ? t : t + ct;      // when the damage happens
        if (a === A_AB) pay(abCost(t)); else pay(cost(s));
        if (!instant) { advance(tc); if (dead) break; }
        let x = 0;
        if (a === A_FBL) {
          x = hit(s, tc, 0, 1, 0); fbReady = tc + s.cd;
          if (lastLanded) heat(lastCrit ? 2 : 1, tc);
        } else if (a === A_IL) {
          const fr = frozenAt(tc);
          x = hit(s, tc, 0, fr ? 4 : 1, 0); fbReady = tc + 8;   // 300% more to Frozen targets; shares Fire Blast's cooldown
          if (lastLanded && fr) addWc(tc);
        } else if (a === A_COC) {
          const st = tc < wcExp ? wcSt : 0;
          x = hit(s, tc, st * 0.07 * s.sp / s.coef, 1 + 0.2 * st, 0); cocReady = tc + 10;   // Winter's Chill: +20% taken and +7% of spell damage per stack
          if (lastLanded) { wcSt = 0; wcExp = -1; }
        } else if (a === A_NOVA) {
          x = hit(s, tc, 0, 1, 0); novaReady = tc + s.cd;
          frozenUntil = tc + 8;
        } else if (a === A_BW) {
          x = hit(s, tc, 0, 1, 0); bwReady = tc + 45;
        } else if (a === A_FROST) {
          x = hit(s, tc, 0, 1, 0);
          if (lastLanded) addWc(tc);
          if (lastLanded) barrageRoll(d.barrage / 2, tc);
        } else if (a === A_FIRE) {
          x = hit(s, tc, 0, 1, 0);
          if (lastLanded) {
            const o = dots[0]; o.left = s.r.ticks; o.next = tc + o.per; o.amt = s.r.dot * s.mult;
            if (lastCrit) heat(1, tc);
            barrageRoll(d.barrage / 2, tc);
          }
        } else if (a === A_PYRO) {
          hu = 0; huExp = -1;
          x = hit(s, tc, 0, 1, 0);
          if (lastLanded) { const o = dots[1]; o.left = s.r.ticks; o.next = tc + o.per; o.amt = (s.r.dot + s.r.dotCoef * s.sp) * s.mult; }
        } else if (a === A_AW) {
          x = hit(s, tc, 0.05 * d.maxMana, 1, 0); awReady = tc + 6;   // effect 2: 5% of maximum mana as spell damage
          if (lastLanded) barrageRoll(d.barrage / 2, tc);
        } else if (a === A_AB) {
          x = hit(s, tc, 0, 1, 0);
          if (abExp <= tc) { abSt = 0; abExp = tc + 18; }
          abSt = Math.min(4, abSt + 1);
          if (lastLanded) barrageRoll(d.barrage, tc);
        }
        if (s.school === 'fir' && x > 0) igniteFrom(x, tc);
        if (lastLanded) afterLanded(tc, a !== A_NOVA);
        if (lastLanded && (a === A_FROST || a === A_COC)) chill(tc);
        if (a !== A_NOVA) spendFof(tc);
        deal(x, LABEL[a], tc);
        t = instant ? t + 1.5 : tc;
        if (!dead) advance(t);
      }
      if (!dead && !oom) tEnd = t;
      totTime += tEnd > 0.5 ? tEnd : 0.5;
      totHp += Math.min(dmg, hp);
    }
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), oom: oomFights / fights, wandShare: wandFights / fights, main };
  }

  function simulate(cfg, fights, seed) {
    const style = styleOf(cfg);
    const d = derive(cfg);
    let r = run(cfg, d, style, true, fights, seed), variant = 'Arcane Blast to 4 charges';
    if (style === 'arcane' && d.arcBlast) {
      const r2 = run(cfg, d, style, false, fights, seed);
      if (r2.dps > r.dps) { r = r2; variant = 'Arcane Missiles first'; }
    }
    const t = (id) => U.tal(cfg, id);
    const notes = [];
    if (r.oom > 0.005) notes.push('Mana ran out in ' + Math.round(r.oom * 100) + '% of fights; ' +
      (r.wandShare > 0 ? 'the wand finished them.' : 'with no wand equipped, the fight stops there and only the damage dealt counts.'));
    const long = [];
    if (t(T.combustion)) long.push('Combustion');
    if (t(T.arcPower)) long.push('Arcane Power');
    if (t(T.pom)) long.push('Presence of Mind');
    if (t(T.coldSnap)) long.push('Cold Snap');
    if (long.length) notes.push(long.join(', ') + (long.length > 1 ? ' are long cooldowns' : ' is a long cooldown') + ' and left out.');
    if (t(T.impScorch)) notes.push('Improved Scorch is left out: stacking Scorch does not pay in a short levelling fight.');
    if (style === 'frost' && d.L >= 40 && t(T.iceBarrier)) notes.push('Ice Barrier is assumed up before each pull (Frigid Power +15% and shielded +5% Frost damage).');
    if (style === 'frost' && d.nova) notes.push('Frost Nova and Frostbite freezes are assumed to break on a quarter of the hits that land while the mob is frozen.');
    if (cfg.style === 'auto' || !cfg.style) {
      const sp = detectSpec(cfg.talents || {}, d.L);
      if (sp.id === 'none') notes.push('No talents found, so the frost rotation is used.');
    }
    notes.push('Mana regeneration during a fight and the level 60 book ranks are left out.');
    const sch = SCHOOL[style] || 'fro';
    const info = {
      Style: style.charAt(0).toUpperCase() + style.slice(1),
      'Main spell': r.main ? ({ frost: 'Frostbolt', fire: 'Fireball', arcane: 'Arcane Missiles' })[style] + ' (spell ' + r.main.id + ')' : 'none',
      'Spell crit': ((r.main ? r.main.crit : d.base) * 100).toFixed(1) + '%',
      'Spell power': Math.round(d.sp[sch]),
      'Max mana': Math.round(d.maxMana),
    };
    if (style === 'arcane' && d.arcBlast) info['Arcane plan'] = variant;
    return { dps: r.dps, ttk: r.ttk, share: r.share, info, notes };
  }

  // Levelling builds in point order, [talent, rank to reach].
  const BUILDS = {
    frost: [[11070, 5], [11207, 5], [1312002, 1], [11160, 3], [11071, 1], [11170, 3], [11071, 3], [11190, 3], [400647, 2], [11180, 5],
      [11426, 1], [29438, 3], [11165, 2], [11175, 3], [16757, 2], [12472, 1], [11210, 2], [6057, 2], [11237, 1], [11213, 4]],
    fire: [[11069, 5], [11119, 5], [11366, 1], [18459, 4], [400624, 1], [29074, 3], [11078, 1], [11115, 3], [11113, 1], [11078, 2],
      [11124, 3], [11100, 2], [11129, 1], [18459, 5], [11103, 3], [11083, 3], [29438, 3], [11237, 3], [11213, 5], [11242, 2]],
    arcane: [[400588, 2], [11237, 3], [11213, 5], [400574, 1], [11242, 3], [11210, 1], [1326079, 1], [18462, 3], [11247, 1], [11232, 5],
      [15058, 3], [11237, 5], [12042, 1], [12043, 1], [11069, 5], [18459, 5], [11078, 2], [11119, 5], [29438, 2]],
  };

  GL.register({
    name: 'Mage',
    armor: () => 'C',
    weapons: ['Staff', 'Sword', 'Dagger'],
    rangedTypes: ['Wand'],
    shield: false,
    twoHand: true,
    dualWield: () => false,
    damageSlots: () => [],
    styles: [{ id: 'auto', name: 'Follow the talents' }, { id: 'frost', name: 'Frost (Frostbolt)' }, { id: 'fire', name: 'Fire (Fireball)' },
      { id: 'arcane', name: 'Arcane (Missiles, Blast, Wrath)' }],
    detectSpec,
    statKeys: () => ['sp', 'int', 'scrit'],
    unit: () => 'sp',
    schools: (cfg) => [SCHOOL[styleOf(cfg || {})] || 'fro'],
    simulate,
    sampleTalents: (L, styleId) => {
      const order = BUILDS[styleId] || BUILDS.frost;
      const out = {};
      let pts = Math.max(0, L - 9);
      for (const [id, to] of order) {
        const have = out[id] || 0, add = Math.min(pts, Math.max(0, to - have));
        if (add > 0) out[id] = have + add;
        pts -= add;
      }
      return out;
    },
    about: 'Levelling mage against one mob: Frostbolt with Frost Nova, Ice Lance, Cone of Cold and Shatter; Fireball with Fire Blast, Pyroblast, Blast Wave and Ignite; or Arcane Missiles with Arcane Blast and Arcane Wrath. Mana is tracked and a wand takes over when it runs out.',
  });
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
