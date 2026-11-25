/* Priest (levelling, one mob at a time). Styles: shadow (Shadow Word: Pain, Mind Blast, Mind Flay, Devouring Plague,
   Shadow Word: Death as a finisher) and smite (Holy Fire opener, Smite, Mind Blast, Penance when talented), plus a mana saver style
   that keeps the damage over time spells and Mind Blast but shoots the wand instead of Mind Flay or Smite.
   Rules from the WoW Forever spell data and the wowsims/forever priest code:
   - Shadowform: +10% Shadow damage, Shadow spells cost 50% less, crits of Mind Blast, Pain, Flay, Plague and Death deal
     double damage (crit bonus +100%).
   - Damage over time and channelled ticks can crit on this server (periodic-can-crit flag on every priest dot).
   - Shadow Weaving: 2% more Shadow damage per stack, 5 stacks, 15 s, rolled on each landed Shadow spell.
   - Devouring Plague and Shadow Word: Death are trained by every priest. Starshards (Night Elf) and Shadowguard (Troll)
     are racial, as in wowsims/forever.
   - Wand: weapon roll only, no attack or spell power, ranged hit table, crits on spell crit for 1.5 times. */
(function (root) {
  'use strict';
  const GL = root.GearLab || (typeof require !== 'undefined' ? require('../core.js') : null);
  const U = GL.util;
  // Rank tables from tools/spelldump/priest.json. base/ppl/bl/ml/var/coef are effect 1 of each rank; for dots and
  // channels base and coef are per tick.
  // mb 8092-10947, swp 589-10894, mf 15407-18807, dp 2944-19280, swd 1309595-1309636, smite 585-10934,
  // hf 14914-15261 (tick = effect 2), pen = Penance bolt rows 402284, 1240727, 1240730, 1316993 (mana from the casts
  // 402174, 1240720, 1240721, 1316995), ss = Starshards 10797-19305, sg = Shadowguard strikes 28377-28382 (levels and
  // mana from the buffs 18137-19312).
  const D = {"mb":[{"lvl":10,"base":39,"ppl":0.6,"bl":10,"ml":15,"var":0.0976,"coef":0.429,"mana":50,"cast":1.5},{"lvl":16,"base":68,"ppl":0.9,"bl":16,"ml":21,"var":0.08,"coef":0.429,"mana":80,"cast":1.5},{"lvl":22,"base":101,"ppl":1.1,"bl":22,"ml":27,"var":0.069,"coef":0.429,"mana":110,"cast":1.5},{"lvl":28,"base":151,"ppl":1.4,"bl":28,"ml":33,"var":0.0581,"coef":0.429,"mana":150,"cast":1.5},{"lvl":34,"base":196,"ppl":1.6,"bl":34,"ml":39,"var":0.0625,"coef":0.429,"mana":185,"cast":1.5},{"lvl":40,"base":258,"ppl":1.9,"bl":40,"ml":45,"var":0.0625,"coef":0.429,"mana":225,"cast":1.5},{"lvl":46,"base":324,"ppl":2.1,"bl":46,"ml":51,"var":0.0562,"coef":0.429,"mana":265,"cast":1.5},{"lvl":52,"base":405,"ppl":2.4,"bl":52,"ml":57,"var":0.0549,"coef":0.429,"mana":310,"cast":1.5},{"lvl":58,"base":485,"ppl":2.6,"bl":58,"ml":63,"var":0.0542,"coef":0.429,"mana":350,"cast":1.5}],"swp":[{"lvl":4,"base":5,"bl":4,"coef":0.2,"mana":25},{"lvl":10,"base":10,"bl":10,"coef":0.2,"mana":50},{"lvl":18,"base":18,"bl":18,"coef":0.2,"mana":95},{"lvl":26,"base":30,"bl":26,"coef":0.2,"mana":155},{"lvl":34,"base":48,"bl":34,"coef":0.2,"mana":230},{"lvl":42,"base":71,"bl":42,"coef":0.2,"mana":305},{"lvl":50,"base":97,"bl":50,"coef":0.2,"mana":385},{"lvl":58,"base":127,"bl":58,"coef":0.2,"mana":470}],"mf":[{"lvl":20,"base":21,"bl":20,"ml":28,"coef":0.167,"mana":45},{"lvl":28,"base":34,"bl":28,"ml":36,"coef":0.167,"mana":70},{"lvl":36,"base":51,"bl":36,"ml":44,"coef":0.167,"mana":100},{"lvl":44,"base":75,"bl":44,"ml":52,"coef":0.167,"mana":135},{"lvl":52,"base":98,"bl":52,"ml":60,"coef":0.167,"mana":165},{"lvl":60,"base":130,"bl":60,"ml":68,"coef":0.167,"mana":205}],"dp":[{"lvl":20,"base":16,"bl":20,"coef":0.1,"mana":215},{"lvl":28,"base":29,"bl":28,"coef":0.1,"mana":350},{"lvl":36,"base":43,"bl":36,"coef":0.1,"mana":495},{"lvl":44,"base":61,"bl":44,"coef":0.1,"mana":645},{"lvl":52,"base":82,"bl":52,"coef":0.1,"mana":810},{"lvl":60,"base":106,"bl":60,"coef":0.1,"mana":985}],"swd":[{"lvl":32,"base":295,"ppl":1.5,"bl":32,"ml":37,"var":0.0605,"coef":0.429,"mana":175},{"lvl":40,"base":370,"ppl":1.9,"bl":40,"ml":45,"var":0.0605,"coef":0.429,"mana":205},{"lvl":48,"base":403,"ppl":2.2,"bl":48,"ml":53,"var":0.0605,"coef":0.429,"mana":250},{"lvl":56,"base":448,"ppl":2.5,"bl":56,"ml":61,"var":0.0605,"coef":0.429,"mana":340}],"smite":[{"lvl":1,"base":15,"ppl":0.1,"bl":1,"ml":6,"var":0.2667,"coef":0.429,"mana":20,"cast":1.5},{"lvl":6,"base":27,"ppl":0.3,"bl":6,"ml":11,"var":0.2143,"coef":0.571,"mana":30,"cast":2.0},{"lvl":14,"base":45,"ppl":0.5,"bl":14,"ml":19,"var":0.1379,"coef":0.714,"mana":60,"cast":2.5},{"lvl":22,"base":60,"ppl":0.7,"bl":22,"ml":27,"var":0.1429,"coef":0.714,"mana":95,"cast":2.5},{"lvl":30,"base":81,"ppl":1,"bl":30,"ml":35,"var":0.125,"coef":0.714,"mana":140,"cast":2.5},{"lvl":38,"base":94,"ppl":1.1,"bl":38,"ml":43,"var":0.1239,"coef":0.714,"mana":185,"cast":2.5},{"lvl":46,"base":126,"ppl":1.1,"bl":46,"ml":51,"var":0.118,"coef":0.714,"mana":230,"cast":2.5},{"lvl":54,"base":170,"ppl":1.3,"bl":54,"ml":59,"var":0.112,"coef":0.714,"mana":280,"cast":2.5}],"hf":[{"lvl":20,"base":54,"ppl":1.3,"bl":20,"ml":24,"var":0.2273,"coef":0.75,"mana":85,"cast":3.5,"tick":4,"tcoef":0.05},{"lvl":24,"base":63,"ppl":1.4,"bl":24,"ml":30,"var":0.2222,"coef":0.75,"mana":95,"cast":3.5,"tick":5,"tcoef":0.05},{"lvl":30,"base":80,"ppl":1.5,"bl":30,"ml":36,"var":0.2282,"coef":0.75,"mana":125,"cast":3.5,"tick":6,"tcoef":0.05},{"lvl":36,"base":92,"ppl":1.5,"bl":36,"ml":42,"var":0.2353,"coef":0.75,"mana":145,"cast":3.5,"tick":7,"tcoef":0.05},{"lvl":42,"base":106,"ppl":1.5,"bl":42,"ml":48,"var":0.2338,"coef":0.75,"mana":170,"cast":3.5,"tick":9,"tcoef":0.05},{"lvl":48,"base":139,"ppl":1.7,"bl":48,"ml":54,"var":0.2361,"coef":0.75,"mana":200,"cast":3.5,"tick":10,"tcoef":0.05},{"lvl":54,"base":173,"ppl":1.9,"bl":54,"ml":60,"var":0.2377,"coef":0.75,"mana":230,"cast":3.5,"tick":13,"tcoef":0.05},{"lvl":60,"base":208,"ppl":2,"bl":60,"ml":66,"var":0.2338,"coef":0.75,"mana":255,"cast":3.5,"tick":15,"tcoef":0.05}],"pen":[{"lvl":30,"base":42,"ppl":0.29,"bl":30,"ml":39,"coef":0.19,"mana":150},{"lvl":40,"base":50,"ppl":0.33,"bl":40,"ml":49,"coef":0.19,"mana":220},{"lvl":50,"base":68,"ppl":0.43,"bl":50,"ml":59,"coef":0.19,"mana":270},{"lvl":60,"base":92,"bl":60,"coef":0.19,"mana":385}],"ss":[{"lvl":10,"base":27,"bl":10,"ml":16,"coef":0.167,"mana":50},{"lvl":18,"base":50,"bl":18,"ml":24,"coef":0.167,"mana":85},{"lvl":26,"base":88,"bl":26,"ml":32,"coef":0.167,"mana":140},{"lvl":34,"base":127,"bl":34,"ml":40,"coef":0.167,"mana":190},{"lvl":42,"base":178,"bl":42,"ml":48,"coef":0.167,"mana":245},{"lvl":50,"base":240,"bl":50,"ml":56,"coef":0.167,"mana":300},{"lvl":58,"base":300,"bl":58,"ml":64,"coef":0.167,"mana":350}],"sg":[{"lvl":20,"base":13,"bl":20,"coef":0.267,"mana":50},{"lvl":28,"base":22,"bl":28,"coef":0.267,"mana":85},{"lvl":36,"base":33,"bl":36,"coef":0.267,"mana":120},{"lvl":44,"base":50,"bl":44,"coef":0.267,"mana":160},{"lvl":52,"base":70,"bl":52,"coef":0.267,"mana":200},{"lvl":60,"base":96,"bl":60,"coef":0.267,"mana":250}]};
  const T = {
    // Discipline
    powerInLight: 1309969, wandSpec: 14524, twinDisc: 1225132, holyPrecision: 1309957, mentalStrength: 18551,
    mentalAgility: 14520, meditation: 14521, penance: 402174,
    // Holy
    holySpec: 14889, divineFury: 18530, impHealing: 14912, searingLight: 14909, spiritualGuidance: 14901,
    // Shadow
    shadowFocus: 15260, spiritTap: 15270, impMB: 15273, impSWP: 15275, mindFlay: 15407, impMF: 1225139,
    shadowWeaving: 15257, devContagion: 1309950, earlyDemise: 1310076, darkness: 15259, shadowform: 15473,
  };
  // Talent values by rank, from talentPointsByEffect in the spell dump.
  const V = {
    powerInLight: [0, 2, 4, 6, 8, 10], wandSpec: [0, 13, 25], twinDisc: [0, 1, 2, 3, 4, 5], holyPrecision: [0, 6, 12, 18],
    mentalStrength: [0, 2, 4, 6, 8, 10], mentalAgility: [0, 3, 7, 10], meditation: [0, 17, 33, 50],
    holySpec: [0, 1, 2, 3, 4, 5], divineFury: [0, 0.1, 0.2, 0.3, 0.4, 0.5], impHealing: [0, 5, 10, 15], searingLight: [0, 2, 5],
    spiritualGuidance: [0, 1, 3, 5, 6, 8], shadowFocus: [0, 1, 2, 3, 4, 5], impMB: [0, 0.5, 1, 1.5, 2, 2.5], impSWP: [0, 1, 2],
    impMF: [0, 10, 20], shadowWeaving: [0, 0.33, 0.67, 1], devContagion: [0, 25, 50], earlyDemise: [0, 15, 30], darkness: [0, 2, 4, 6, 8, 10],
  };
  const TREES = (function () {
    // Talent ids by tree, in the order of data/talents.json (Discipline 18, Holy 17, Shadow 17).
    const order = [1309969, 14524, 1225132, 14523, 1309957, 18551, 14531, 14520, 14751, 14748, 14521, 14747, 14750, 402000, 402174, 425280, 431622, 10060,
      14913, 14908, 14889, 27900, 18530, 15237, 27811, 14892, 27789, 14912, 14909, 1328569, 1317006, 20711, 14901, 14898, 401859,
      15260, 15326, 15270, 15273, 15275, 17322, 15392, 15407, 1225139, 1326159, 15286, 15257, 15487, 1309950, 1310076, 15259, 15473];
    return [order.slice(0, 18), order.slice(18, 35), order.slice(35)];
  })();

  const rv = (arr, r) => arr[Math.max(0, Math.min(arr.length - 1, r | 0))];
  // Base mana by level: an estimate (about 1360 at 60, as for a Classic priest); the spell dump has no mana table.
  const baseMana = (L) => 110 + 1250 * Math.pow(Math.max(0, L - 1) / 59, 1.15);
  const isWand = (w) => !!(w && w.d1 && w.type === 'Wand');

  function treePoints(talents) {
    const p = [0, 0, 0];
    for (let i = 0; i < 3; i++) for (const id of TREES[i]) p[i] += (talents && talents[id]) || 0;
    return p;
  }
  function detectSpec(talents) {
    const p = treePoints(talents);
    if (p[2] > 0 && p[2] >= p[0] && p[2] >= p[1]) return { id: 'shadow', name: 'Shadow' };
    if (p[1] >= p[0] && p[1] > 0) return { id: 'smite', name: 'Holy' };
    if (p[0] > 0) return { id: 'smite', name: 'Discipline' };
    return { id: 'shadow', name: 'No talents' };
  }
  function styleOf(cfg) {
    const s = cfg && cfg.style;
    if (s === 'shadow' || s === 'smite') return s;
    return detectSpec((cfg && cfg.talents) || {}).id;
  }

  // Average of a rank's base at a level, with the roll spread by half the variance either side.
  const val = (r, L) => U.scaled(r, L);

  function derive(cfg, style) {
    const t = (k) => U.tal(cfg, T[k]);
    const L = cfg.level;
    const intT = cfg.int * (1 + rv(V.mentalStrength, t('mentalStrength')) / 100);
    const c2 = Object.assign({}, cfg, { int: intT });
    const sgSp = rv(V.spiritualGuidance, t('spiritualGuidance')) / 100 * (cfg.spi || 0);
    const spSha = U.spellPower(cfg, 'sha') + sgSp, spHol = U.spellPower(cfg, 'hol') + sgSp, spArc = U.spellPower(cfg, 'arc') + sgSp;
    const critS = U.spellCrit('Priest', c2, 0), critH = U.spellCrit('Priest', c2, rv(V.holySpec, t('holySpec')));
    const missS = Math.max(0, 0.04 - rv(V.shadowFocus, t('shadowFocus')) / 100);
    const missH = Math.max(0, 0.04 - rv(V.holyPrecision, t('holyPrecision')) / 100);
    const sf = style === 'shadow' && t('shadowform') > 0;
    const shaMult = (1 + rv(V.darkness, t('darkness')) / 100) * (sf ? 1.10 : 1);
    const holMult = 1 + rv(V.searingLight, t('searingLight')) / 100;
    const td = 1 + rv(V.twinDisc, t('twinDisc')) / 100;
    const sfCost = sf ? 0.5 : 1;
    const ma = rv(V.mentalAgility, t('mentalAgility')) / 100;
    const cmS = sf ? 2.0 : 1.5;
    const df = rv(V.divineFury, t('divineFury'));
    const mk = (list, extra) => { const r = U.pickRank(list, L); return r ? Object.assign({ r, base: val(r, L), v: r.var || 0 }, extra(r)) : null; };
    const d = {
      L, sf, critS, critH, missS, missH, spSha, spHol, spArc, intT,
      pil: rv(V.powerInLight, t('powerInLight')) / 100,
      swCh: rv(V.shadowWeaving, t('shadowWeaving')),
      ramp: 1 + rv(V.impMF, t('impMF')) / 100,
      ed: rv(V.earlyDemise, t('earlyDemise')) / 100,
      mana: baseMana(L) + Math.min(20, intT) + 15 * Math.max(0, intT - 20),
      regen: (13 + (cfg.spi || 0) / 4) / 2,
      med: rv(V.meditation, t('meditation')) / 100,
      wand: isWand(cfg.ranged) ? cfg.ranged : null,
      wandMult: 1 + rv(V.wandSpec, t('wandSpec')) / 100,
      race: cfg.race || '',
    };
    d.mb = mk(D.mb, (r) => ({ sp: spSha * r.coef, mult: shaMult, cost: r.mana * sfCost, cast: 1.5, cd: 8 - rv(V.impMB, t('impMB')) }));
    d.swp = mk(D.swp, (r) => ({ sp: spSha * r.coef, mult: shaMult * td, cost: r.mana * (1 - ma) * sfCost, ticks: 6 + rv(V.impSWP, t('impSWP')), per: 3 }));
    d.mf = t('mindFlay') > 0 ? mk(D.mf, (r) => ({ sp: spSha * r.coef, mult: shaMult * td, cost: r.mana * sfCost, ticks: 3, per: 1 })) : null;
    d.dp = mk(D.dp, (r) => ({ sp: spSha * r.coef, mult: shaMult * td, cost: r.mana * Math.max(0, 1 - ma - rv(V.devContagion, t('devContagion')) / 100) * sfCost, ticks: 8, per: 3, cd: 24 }));
    d.swd = mk(D.swd, (r) => ({ sp: spSha * r.coef, mult: shaMult * td, cost: r.mana * sfCost, cd: 18 }));
    d.smite = mk(D.smite, (r) => ({ sp: spHol * r.coef, mult: holMult, cost: r.mana * (1 - ma), cast: Math.max(1.5, r.cast - df) }));
    d.hf = mk(D.hf, (r) => ({ sp: spHol * r.coef, mult: holMult, cost: r.mana * (1 - ma), cast: Math.max(1.5, r.cast - df), tick: r.tick + spHol * r.tcoef, ticks: 5, per: 2 }));
    d.pen = t('penance') > 0 ? mk(D.pen, (r) => ({ sp: spHol * r.coef, mult: holMult * td, cost: r.mana * (1 - rv(V.impHealing, t('impHealing')) / 100), cd: 12 })) : null;
    d.ss = /night/i.test(d.race) ? mk(D.ss, (r) => ({ sp: spArc * r.coef, mult: td, cost: r.mana, ticks: 6, per: 1, cd: 30 })) : null;
    d.sg = d.race === 'Troll' ? mk(D.sg, (r) => ({ sp: spSha * r.coef, mult: shaMult * td })) : null;
    return d;
  }

  // Expected damage of one landed non-crit hit (direct spells) or one tick.
  const avgHit = (s) => (s.base + s.sp) * s.mult;

  function run(cfg, style, filler, fights, seed) {
    const R = U.rng(seed);
    const d = derive(cfg, style);
    const M = U.mob(cfg);
    const wand = d.wand;
    const useWand = filler === 'wand' && !!wand;
    const shadow = style === 'shadow';
    const mb = d.mb, swp = d.swp, mf = shadow ? d.mf : null, dp = shadow ? d.dp : null, swd = shadow ? d.swd : null;
    const smite = d.smite, hf = shadow ? null : d.hf, pen = d.pen, ss = d.ss, sg = d.sg;
    const cS = d.critS, cH = d.critH, cmS = d.sf ? 2.0 : 1.5;
    const wandMiss = Math.max(0, M.miss - (cfg.hit || 0) / 100);
    const wandAvg = wand ? (wand.d1 + wand.d2) / 2 * d.wandMult * (1 - wandMiss) * (1 + 0.5 * cS) : 0;
    const wandSpeed = wand ? Math.max(1, wand.ws) : 0;
    // Damage per second of the filler, used to judge whether a damage over time spell pays for its global cooldown.
    let fillRate = 0;
    if (useWand) fillRate = wandAvg / wandSpeed;
    else if (mf) { let s = 0; for (let i = 0; i < 3; i++) s += Math.pow(d.ramp, i); fillRate = avgHit(mf) * s / 3 * (1 + (cmS - 1) * cS) * (1 - d.missS); }
    else if (smite) fillRate = avgHit(smite) * (1 + 0.5 * cH) * (1 - d.missH) / smite.cast;
    const swpTick = swp ? avgHit(swp) * (1 + (cmS - 1) * cS) : 0;
    const dpTick = dp ? avgHit(dp) * (1 + (cmS - 1) * cS) : 0;
    const hfVal = hf ? (avgHit(hf) + hf.tick * hf.mult * 5) * (1 + 0.5 * cH) * (1 - d.missH) : 0;
    const swdHit = swd ? avgHit(swd) * (1 - swd.v / 2) : 0;
    const parts = { 'Mind Blast': 0, 'Shadow Word: Pain': 0, 'Mind Flay': 0, 'Devouring Plague': 0, 'Shadow Word: Death': 0,
      Smite: 0, 'Holy Fire': 0, Penance: 0, Starshards: 0, Shadowguard: 0, Wand: 0 };
    let est = Math.max(1, fillRate * 1.3);
    let totTime = 0, totHp = 0, wandUsed = 0, oom = 0;

    // Per fight state, shared with the helpers below.
    let hp = 0, dmg = 0, dead = false, tDeath = 0, now = 0, mana = 0, mt = 0, lastSpend = -10;
    let swSt = 0, swExp = -1;
    // Periodic slots: [next tick time, ticks left, period, kind]. 0 Pain, 1 Plague, 2 Holy Fire, 3 channel.
    const nx = [0, 0, 0, 0], lf = [0, 0, 0, 0], pd = [0, 0, 0, 0], kd = [0, 0, 0, 0], tk = [0, 0, 0, 0];
    let mobNext = 0, sgCh = 0, sgIcd = 0;
    const KIND = ['Shadow Word: Pain', 'Devouring Plague', 'Holy Fire', 'Mind Flay', 'Penance', 'Starshards'];

    const swMult = () => (swSt > 0 && now < swExp ? 1 + 0.02 * swSt : 1);
    function weave() {
      if (d.swCh > 0 && R() < d.swCh) { if (now >= swExp) swSt = 0; swSt = Math.min(5, swSt + 1); swExp = now + 15; }
    }
    function deal(x, key) {
      if (dead) return;
      parts[key] += Math.min(x, hp - dmg); // overkill is not counted in the shares
      dmg += x;
      if (dmg >= hp) { dead = true; tDeath = now; }
    }
    function regenTo(t1) {
      if (t1 <= mt) return;
      const out = Math.max(0, t1 - Math.max(mt, lastSpend + 5));
      mana = Math.min(d.mana, mana + d.regen * (out + (t1 - mt - out) * d.med));
      mt = t1;
    }
    function spend(c, tEnd) { regenTo(now); mana -= c; lastSpend = tEnd; }
    function tick(i) {
      const k = kd[i];
      let x;
      if (k === 0) x = (swp.base + swp.sp) * swp.mult * swMult();
      else if (k === 1) x = (dp.base + dp.sp) * dp.mult * swMult();
      else if (k === 2) x = hf.tick * hf.mult;
      else if (k === 3) x = (mf.base + mf.sp) * mf.mult * swMult() * Math.pow(d.ramp, tk[i]);
      else if (k === 4) { if (R() < d.missH) x = 0; else { x = (pen.base * (1 + pen.v * (R() - 0.5)) + pen.sp) * pen.mult * (pilOn() ? 1 + d.pil : 1); if (R() < cH) x *= 1.5; } }
      else x = (ss.base + ss.sp) * ss.mult;
      if (k !== 4) {
        const shadowKind = k === 0 || k === 1 || k === 3;
        if (R() < (k === 2 ? cH : cS)) x *= shadowKind ? cmS : 1.5;
      }
      tk[i]++;
      deal(x, KIND[k]);
      if (--lf[i] > 0) nx[i] += pd[i]; else nx[i] = 1e9;
    }
    const pilOn = () => (lf[0] > 0 || lf[2] > 0);
    function mobHit() {
      mobNext += M.swing;
      if (R() >= 0.9) return;
      if (sg && sgCh > 0 && now >= sgIcd) {
        sgCh--; sgIcd = now + 3.5;
        if (R() >= d.missS) deal((sg.base + sg.sp) * sg.mult * swMult(), 'Shadowguard');
      }
    }
    // Run every periodic event up to time t1, stopping at the kill.
    function advance(t1) {
      while (!dead) {
        let best = t1, bi = -1;
        for (let i = 0; i < 4; i++) if (nx[i] <= best) { best = nx[i]; bi = i; }
        if (sg && mobNext <= best) { best = mobNext; bi = 9; }
        if (bi < 0) break;
        now = best;
        if (bi === 9) mobHit(); else tick(bi);
      }
      if (!dead) now = t1;
    }
    function startDot(i, kind, ticks, per) { kd[i] = kind; lf[i] = ticks; pd[i] = per; tk[i] = 0; nx[i] = now + per; }
    function direct(s, crit, cm, miss, key, extra) {
      if (R() < miss) return false;
      let x = (s.base * (1 + s.v * (R() - 0.5)) + s.sp) * s.mult * (extra || 1);
      if (R() < crit) x *= cm;
      deal(x, key);
      return true;
    }

    for (let f = 0; f < fights; f++) {
      hp = M.hp * (0.7 + 0.6 * R());
      totHp += hp;
      dmg = 0; dead = false; tDeath = 0; now = 0; mana = d.mana; mt = 0; lastSpend = -10; swSt = 0; swExp = -1;
      for (let i = 0; i < 4; i++) { nx[i] = 1e9; lf[i] = 0; }
      mobNext = 3; sgCh = sg ? 3 : 0; sgIcd = 0;
      let mbR = 0, swdR = 0, dpR = 0, penR = 0, ssR = 0, first = true, guard = 0, usedOom = false;
      while (!dead && now < 300 && guard++ < 3000) {
        regenTo(now);
        const rem = hp - dmg, left = rem / est;
        const t0 = now;
        // Shadow Word: Death as a finisher.
        if (swd && swdR <= t0 && mana >= swd.cost && rem <= swdHit) {
          spend(swd.cost, t0); swdR = t0 + swd.cd;
          const crit = Math.min(1, cS + (rem <= 0.2 * hp ? d.ed : 0));
          if (direct(swd, crit, cmS, d.missS, 'Shadow Word: Death')) weave();
          advance(t0 + 1.5); continue;
        }
        if (pen && penR <= t0 && mana >= pen.cost) {
          spend(pen.cost, t0 + 2); penR = t0 + pen.cd;
          startDot(3, 4, 2, 1); tick(3); lf[3] = 2; nx[3] = t0 + 1;
          advance(t0 + 2); continue;
        }
        if (hf && first && mana >= hf.cost) {
          first = false;
          spend(hf.cost, t0 + hf.cast); advance(t0 + hf.cast);
          if (dead) break;
          if (direct(hf, cH, 1.5, d.missH, 'Holy Fire')) startDot(2, 2, hf.ticks, hf.per);
          continue;
        }
        first = false;
        if (mb && mbR <= t0 && mana >= mb.cost) {
          spend(mb.cost, t0 + mb.cast); advance(t0 + mb.cast);
          if (dead) break;
          mbR = now + mb.cd;
          if (direct(mb, cS, cmS, d.missS, 'Mind Blast')) weave();
          continue;
        }
        if (ss && ssR <= t0 && mana >= ss.cost && left > 2) {
          spend(ss.cost, t0 + 6); ssR = t0 + ss.cd;
          if (R() >= 0.04) startDot(3, 5, ss.ticks, ss.per);
          advance(t0 + (lf[3] > 0 ? 6 : 1.5)); continue;
        }
        if (swp && lf[0] === 0 && mana >= swp.cost && Math.min(swp.ticks, Math.floor(left / 3)) * swpTick * (1 - d.missS) > fillRate * 1.5) {
          spend(swp.cost, t0);
          if (R() >= d.missS) { startDot(0, 0, swp.ticks, swp.per); weave(); }
          advance(t0 + 1.5); continue;
        }
        if (dp && lf[1] === 0 && dpR <= t0 && mana >= dp.cost && Math.min(8, Math.floor(left / 3)) * dpTick * (1 - d.missS) > fillRate * 1.5) {
          spend(dp.cost, t0); dpR = t0 + dp.cd;
          if (R() >= d.missS) { startDot(1, 1, dp.ticks, dp.per); weave(); }
          advance(t0 + 1.5); continue;
        }
        if (hf && lf[2] === 0 && mana >= hf.cost && hfVal / hf.cast > fillRate * 1.05) {
          spend(hf.cost, t0 + hf.cast); advance(t0 + hf.cast);
          if (dead) break;
          if (direct(hf, cH, 1.5, d.missH, 'Holy Fire')) startDot(2, 2, hf.ticks, hf.per);
          continue;
        }
        if (!useWand) {
          if (mf && mana >= mf.cost) {
            spend(mf.cost, t0 + 3);
            if (R() >= d.missS) { startDot(3, 3, 3, 1); weave(); advance(t0 + 3); } else advance(t0 + 1.5);
            continue;
          }
          if (!mf && smite && mana >= smite.cost) {
            spend(smite.cost, t0 + smite.cast); advance(t0 + smite.cast);
            if (dead) break;
            direct(smite, cH, 1.5, d.missH, 'Smite', pilOn() ? 1 + d.pil : 1);
            continue;
          }
          if (!usedOom) { usedOom = true; oom++; }
        }
        if (wand) {
          wandUsed++;
          advance(t0 + wandSpeed);
          if (dead) break;
          if (R() >= wandMiss) { let x = (wand.d1 + (wand.d2 - wand.d1) * R()) * d.wandMult; if (R() < cS) x *= 1.5; deal(x, 'Wand'); }
          continue;
        }
        advance(t0 + 1); // out of mana and no wand: wait for mana
      }
      const ft = dead ? tDeath : now;
      totTime += ft > 0.5 ? ft : 0.5;
      est = totHp / totTime;
    }
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), d, wandUsed, oom: oom / fights };
  }

  function simulate(cfg, fights, seed) {
    const style = styleOf(cfg);
    const hasWand = isWand(cfg.ranged);
    const saver = cfg.style === 'wand';
    let best, filler;
    if (saver && hasWand) { best = run(cfg, style, 'wand', fights, seed); filler = 'wand'; }
    else {
      best = run(cfg, style, 'spell', fights, seed); filler = 'spell';
      if (hasWand) {
        const b = run(cfg, style, 'wand', fights, seed);
        if (b.dps > best.dps) { best = b; filler = 'wand'; }
      }
    }
    const d = best.d;
    const notes = [];
    if (cfg.style !== 'shadow' && cfg.style !== 'smite') notes.push('Spells follow the talents: ' + (style === 'shadow' ? 'shadow' : 'smite') + '.');
    if (saver && !hasWand) notes.push('Mana saver style needs a wand; without one the normal filler spell is used.');
    if (saver && hasWand) notes.push('Mana saver: damage over time spells, Mind Blast and Penance, with the wand instead of Mind Flay or Smite.');
    if (style === 'shadow' && !d.mf) notes.push('No Mind Flay talent, so Smite is the filler spell.');
    if (style === 'shadow' && !d.sf && d.L >= 40) notes.push('No Shadowform talent found, so it is left out.');
    if (!hasWand) notes.push('No wand equipped: when mana runs out the priest waits for mana instead of shooting.');
    if (best.oom > 0.05) notes.push('Mana ran out in ' + Math.round(best.oom * 100) + '% of fights.');
    notes.push('Mana regeneration is estimated as 13 + Spirit/4 every 2 s outside the five second rule; base mana is an estimate.');
    notes.push('Shadow Word: Death is used only as a finisher. Inner Focus, Power Infusion, Shadowfiend, Holy Nova and Chastise are left out.');
    if (/undead|human|dwarf|gnome/i.test(d.race)) notes.push('Racial priest spells of this race (Touch of Weakness, Feedback, Chastise) are left out.');
    if (d.ss) notes.push('Starshards (Night Elf) is cast on cooldown.');
    if (d.sg) notes.push('Shadowguard (Troll) starts each fight with 3 charges and is not recast during the fight.');
    const info = {
      Style: style === 'shadow' ? (d.sf ? 'Shadow (Shadowform)' : 'Shadow') : 'Smite',
      Filler: filler === 'wand' ? 'Wand' : (style === 'shadow' && d.mf ? 'Mind Flay' : 'Smite'),
      'Spell crit': ((style === 'shadow' ? d.critS : d.critH) * 100).toFixed(1) + '%',
      'Spell power': Math.round(style === 'shadow' ? d.spSha : d.spHol),
      'Mana pool': Math.round(d.mana),
    };
    return { dps: best.dps, ttk: best.ttk, share: best.share, info, notes };
  }

  function sampleTalents(L, styleId) {
    const shadow = [[15270, 5], [15275, 2], [15260, 3], [15407, 1], [15273, 4], [15257, 3], [1225139, 2], [1309950, 2], [15260, 2],
      [15286, 1], [15259, 5], [15473, 1], [1310076, 2], [15273, 1], [1225132, 5], [14524, 2], [15326, 5], [17322, 2], [1326159, 3]];
    const smite = [[14889, 5], [18530, 5], [15237, 1], [14913, 3], [14908, 1], [14909, 2], [14912, 3], [14901, 5], [1309969, 5],
      [14524, 2], [1225132, 5], [1309957, 1], [14520, 3], [18551, 5], [402174, 1], [14521, 3], [14531, 1]];
    const order = styleId === 'smite' ? smite : shadow;
    const out = {};
    let pts = Math.max(0, L - 9);
    for (const [id, n] of order) { const r = Math.min(n, pts); if (r > 0) out[id] = (out[id] || 0) + r; pts -= r; }
    return out;
  }

  GL.register({
    name: 'Priest',
    armor: () => 'C',
    weapons: ['Dagger', 'Mace', 'Staff'],
    rangedTypes: ['Wand'],
    shield: false,
    twoHand: true,
    dualWield: () => false,
    damageSlots: (cfg) => (cfg && isWand(cfg.ranged) ? ['Ranged'] : []),
    styles: [{ id: 'auto', name: 'Follow the talents' }, { id: 'shadow', name: 'Shadow: Pain, Mind Blast, Mind Flay' }, { id: 'smite', name: 'Smite: Holy Fire, Smite, Mind Blast' },
      { id: 'wand', name: 'Mana saver: Pain, Mind Blast, then wand' }],
    detectSpec: (talents) => detectSpec(talents || {}),
    statKeys: (cfg) => {
      const k = ['sp', 'int', 'scrit'];
      const wand = cfg && isWand(cfg.ranged);
      if (wand || U.tal(cfg || {}, T.spiritualGuidance) > 0) k.push('spi');
      if (wand) k.push('hit');
      return k;
    },
    unit: () => 'sp',
    schools: (cfg) => (styleOf(cfg || {}) === 'shadow' ? ['sha'] : ['hol']),
    simulate,
    sampleTalents,
    about: 'Levelling priest against one mob: shadow (Shadow Word: Pain, Mind Blast, Mind Flay, Devouring Plague, Shadow Word: Death to finish, Shadowform) or smite (Holy Fire opener, Smite, Mind Blast, Penance), with mana tracked; the wand fills in when it is better or mana runs out, and a mana saver style uses it as the filler.',
  });
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
