/* Warlock (levelling, one mob at a time).
   Numbers are from the WoW Forever spell dump (tools/spelldump/warlock.json) and the wowsims/forever warlock source:
   every Warlock damage-over-time spell can crit on this server (Periodic Can Crit on Corruption, Bane of Agony,
   Immolate, Siphon Life, the drains and Wrack), Bane of Agony ramps in thirds (half, full, one and a half of its base),
   Wrack is a 6 s channel that makes Corruption, Siphon Life and Bane of Agony tick twice as fast while it runs,
   Incinerate deals 25% more on a burning target, Conflagrate eats Immolate unless Shadow and Flame keeps it, and a
   demon takes a tenth of the warlock's spell power (plus Demonic Knowledge) and the warlock's spell crit. */
(function (root) {
  'use strict';
  const GL = root.GearLab || (typeof require !== 'undefined' ? require('../core.js') : null);
  const U = GL.util;
  // Rank tables (trainer ranks only, book ranks 25307, 25311 and 25309 left out). id = spell id in the dump.
  // sb Shadow Bolt 686..11661, corr Corruption 172..11672, boa Bane of Agony 980..11713, imm Immolate 348..11668
  // (base/coef = tick, dbase/dcoef = the direct hit), siph Siphon Life 18265..18881, dl Drain Life 689..11700
  // (the 5 s channel wowsims uses, not the 403677 family), inc Incinerate 412758, 1293812, 1293813,
  // conf Conflagrate 1293817..18932, wrack Wrack 1316697, fb Imp Firebolt 3110..11763, lash Lash of Pain 7814..11780,
  // coe Curse of the Elements 440892..1311680 (pct = more magic damage taken).
  const D = {"sb":[{"id":686,"lvl":1,"base":13,"ppl":0.2,"bl":1,"ml":5,"coef":0.486,"mana":25,"v":0.2857,"cast":1.7},{"id":695,"lvl":6,"base":23,"ppl":0.3,"bl":6,"ml":11,"coef":0.629,"mana":40,"v":0.2308,"cast":2.2},{"id":705,"lvl":12,"base":40,"ppl":0.6,"bl":12,"ml":17,"coef":0.8,"mana":70,"v":0.1538,"cast":2.8},{"id":1088,"lvl":20,"base":58,"ppl":0.8,"bl":20,"ml":25,"coef":0.857,"mana":110,"v":0.1304,"cast":3.0},{"id":1106,"lvl":28,"base":78,"ppl":1.2,"bl":28,"ml":33,"coef":0.857,"mana":160,"v":0.1316,"cast":3.0},{"id":7641,"lvl":36,"base":101,"ppl":1.2,"bl":36,"ml":41,"coef":0.857,"mana":210,"v":0.1198,"cast":3.0},{"id":11659,"lvl":44,"base":141,"ppl":1.4,"bl":44,"ml":49,"coef":0.857,"mana":265,"v":0.1141,"cast":3.0},{"id":11660,"lvl":52,"base":191,"ppl":1.6,"bl":52,"ml":57,"coef":0.857,"mana":315,"v":0.1102,"cast":3.0},{"id":11661,"lvl":60,"base":251,"ppl":1.8,"bl":60,"ml":65,"coef":0.857,"mana":370,"v":0.1081,"cast":3.0}],"corr":[{"id":172,"lvl":4,"base":10,"ppl":0,"bl":4,"ml":9,"coef":0.2,"mana":35,"cast":2.0,"dur":12.0,"per":3.0},{"id":6222,"lvl":14,"base":13,"ppl":0,"bl":14,"ml":19,"coef":0.2,"mana":55,"cast":2.0,"dur":15.0,"per":3.0},{"id":6223,"lvl":24,"base":22,"ppl":0,"bl":24,"ml":29,"coef":0.2,"mana":100,"cast":2.0,"dur":18.0,"per":3.0},{"id":7648,"lvl":34,"base":28,"ppl":0,"bl":34,"ml":39,"coef":0.2,"mana":160,"cast":2.0,"dur":18.0,"per":3.0},{"id":11671,"lvl":44,"base":40,"ppl":0,"bl":44,"ml":49,"coef":0.2,"mana":225,"cast":2.0,"dur":18.0,"per":3.0},{"id":11672,"lvl":54,"base":57,"ppl":0,"bl":54,"ml":59,"coef":0.2,"mana":290,"cast":2.0,"dur":18.0,"per":3.0}],"boa":[{"id":980,"lvl":8,"base":6,"ppl":0,"bl":8,"ml":0,"coef":0.133,"mana":25,"dur":24.0,"per":2.0},{"id":1014,"lvl":18,"base":10,"ppl":0,"bl":18,"ml":0,"coef":0.133,"mana":50,"dur":24.0,"per":2.0},{"id":6217,"lvl":28,"base":14,"ppl":0,"bl":28,"ml":0,"coef":0.133,"mana":90,"dur":24.0,"per":2.0},{"id":11711,"lvl":38,"base":21,"ppl":0,"bl":38,"ml":0,"coef":0.133,"mana":130,"dur":24.0,"per":2.0},{"id":11712,"lvl":48,"base":33,"ppl":0,"bl":48,"ml":0,"coef":0.133,"mana":170,"dur":24.0,"per":2.0},{"id":11713,"lvl":58,"base":46,"ppl":0,"bl":58,"ml":0,"coef":0.133,"mana":215,"dur":24.0,"per":2.0}],"imm":[{"id":348,"lvl":1,"base":3,"ppl":0,"bl":1,"ml":5,"coef":0.13,"mana":25,"cast":2.0,"dur":15.0,"per":3.0,"dbase":8,"dppl":0.7,"dcoef":0.2},{"id":707,"lvl":10,"base":6,"ppl":0,"bl":10,"ml":15,"coef":0.13,"mana":45,"cast":2.0,"dur":15.0,"per":3.0,"dbase":17,"dppl":0.8,"dcoef":0.2},{"id":1094,"lvl":20,"base":12,"ppl":0,"bl":20,"ml":25,"coef":0.13,"mana":90,"cast":2.0,"dur":15.0,"per":3.0,"dbase":32,"dppl":1.2,"dcoef":0.2},{"id":2941,"lvl":30,"base":19,"ppl":0,"bl":30,"ml":35,"coef":0.13,"mana":155,"cast":2.0,"dur":15.0,"per":3.0,"dbase":56,"dppl":1.5,"dcoef":0.2},{"id":11665,"lvl":40,"base":25,"ppl":0,"bl":40,"ml":45,"coef":0.13,"mana":220,"cast":2.0,"dur":15.0,"per":3.0,"dbase":72,"dppl":1.6,"dcoef":0.2},{"id":11667,"lvl":50,"base":38,"ppl":0,"bl":50,"ml":55,"coef":0.13,"mana":295,"cast":2.0,"dur":15.0,"per":3.0,"dbase":106,"dppl":1.9,"dcoef":0.2},{"id":11668,"lvl":60,"base":52,"ppl":0,"bl":60,"ml":65,"coef":0.13,"mana":370,"cast":2.0,"dur":15.0,"per":3.0,"dbase":146,"dppl":2.3,"dcoef":0.2}],"siph":[{"id":18265,"lvl":30,"base":11,"ppl":0,"bl":30,"ml":38,"coef":0.05,"mana":150,"dur":30.0,"per":3.0},{"id":18879,"lvl":38,"base":19,"ppl":0,"bl":38,"ml":48,"coef":0.05,"mana":205,"dur":30.0,"per":3.0},{"id":18880,"lvl":48,"base":29,"ppl":0,"bl":48,"ml":58,"coef":0.05,"mana":285,"dur":30.0,"per":3.0},{"id":18881,"lvl":58,"base":41,"ppl":0,"bl":58,"ml":68,"coef":0.05,"mana":365,"dur":30.0,"per":3.0}],"dl":[{"id":689,"lvl":14,"base":10,"ppl":0,"bl":14,"ml":19,"coef":0.1,"mana":55,"dur":5.0,"per":1.0},{"id":699,"lvl":22,"base":14,"ppl":0,"bl":22,"ml":27,"coef":0.1,"mana":85,"dur":5.0,"per":1.0},{"id":709,"lvl":30,"base":22,"ppl":0,"bl":30,"ml":35,"coef":0.1,"mana":135,"dur":5.0,"per":1.0},{"id":7651,"lvl":38,"base":28,"ppl":0,"bl":38,"ml":43,"coef":0.1,"mana":185,"dur":5.0,"per":1.0},{"id":11699,"lvl":46,"base":39,"ppl":0,"bl":46,"ml":51,"coef":0.1,"mana":240,"dur":5.0,"per":1.0},{"id":11700,"lvl":54,"base":51,"ppl":0,"bl":54,"ml":59,"coef":0.1,"mana":300,"dur":5.0,"per":1.0}],"inc":[{"id":412758,"lvl":40,"base":97,"ppl":1.1,"bl":40,"ml":49,"coef":0.714,"mana":205,"v":0.15,"cast":2.5},{"id":1293812,"lvl":50,"base":145,"ppl":1.3,"bl":50,"ml":59,"coef":0.714,"mana":265,"v":0.15,"cast":2.5},{"id":1293813,"lvl":60,"base":217,"ppl":1.4,"bl":60,"ml":69,"coef":0.714,"mana":325,"v":0.15,"cast":2.5}],"conf":[{"id":1293817,"lvl":25,"base":95,"ppl":0.9,"bl":25,"ml":30,"coef":0.429,"mana":100,"v":0.2418},{"id":1293818,"lvl":32,"base":122,"ppl":0.9,"bl":32,"ml":38,"coef":0.429,"mana":130,"v":0.2418},{"id":17962,"lvl":40,"base":146,"ppl":1,"bl":40,"ml":46,"coef":0.429,"mana":165,"v":0.2418},{"id":18930,"lvl":48,"base":194,"ppl":1.1,"bl":48,"ml":54,"coef":0.429,"mana":200,"v":0.2247},{"id":18931,"lvl":54,"base":239,"ppl":1.2,"bl":54,"ml":60,"coef":0.429,"mana":230,"v":0.2227},{"id":18932,"lvl":60,"base":282,"ppl":1.3,"bl":60,"ml":66,"coef":0.429,"mana":255,"v":0.2191}],"wrack":[{"id":1316697,"lvl":40,"base":25.2,"ppl":1.75,"bl":40,"ml":60,"coef":0.2002,"mana":200,"dur":6.0,"per":1.0}],"fb":[{"id":3110,"lvl":1,"base":6,"ppl":0.3,"bl":1,"ml":5,"coef":0.164,"mana":10,"v":0.3333,"cast":2.0},{"id":7799,"lvl":8,"base":11,"ppl":0.4,"bl":8,"ml":13,"coef":0.314,"mana":20,"v":0.1818,"cast":2.0},{"id":7800,"lvl":18,"base":15,"ppl":0.4,"bl":18,"ml":23,"coef":0.529,"mana":35,"v":0.2353,"cast":2.0},{"id":7801,"lvl":28,"base":18,"ppl":0.4,"bl":28,"ml":33,"coef":0.571,"mana":50,"v":0.2222,"cast":2.0},{"id":7802,"lvl":38,"base":25,"ppl":0.4,"bl":38,"ml":43,"coef":0.571,"mana":70,"v":0.1176,"cast":2.0},{"id":11762,"lvl":48,"base":35,"ppl":0.5,"bl":48,"ml":53,"coef":0.571,"mana":95,"v":0.1127,"cast":2.0},{"id":11763,"lvl":58,"base":44,"ppl":0.6,"bl":58,"ml":63,"coef":0.571,"mana":115,"v":0.1136,"cast":2.0}],"lash":[{"id":7814,"lvl":20,"base":16,"ppl":0,"bl":20,"ml":0,"coef":0.429,"mana":65},{"id":7815,"lvl":28,"base":22,"ppl":0,"bl":28,"ml":0,"coef":0.429,"mana":80},{"id":7816,"lvl":36,"base":30,"ppl":0,"bl":36,"ml":0,"coef":0.429,"mana":105},{"id":11778,"lvl":44,"base":36,"ppl":0,"bl":44,"ml":0,"coef":0.429,"mana":125},{"id":11779,"lvl":52,"base":43,"ppl":0,"bl":52,"ml":0,"coef":0.429,"mana":145},{"id":11780,"lvl":60,"base":50,"ppl":0,"bl":60,"ml":0,"coef":0.429,"mana":160}],"coe":[{"id":440892,"lvl":20,"pct":4,"mana":50},{"id":1311676,"lvl":30,"pct":6,"mana":100},{"id":1311677,"lvl":40,"pct":8,"mana":150},{"id":1311680,"lvl":50,"pct":10,"mana":200}]};
  const T = { supp: 18174, impCorr: 17810, impDrains: 403511, impBoa: 18827, pandemic: 427712, malev: 1310949, nightfall: 18094,
    siphon: 18265, soulSiphon: 17804, shadowMastery: 18271, wrack: 1316697,
    impImp: 18694, unholy: 18769, felVit: 18731, impSayaad: 18754, decim: 440870, soulLink: 19028, demKnow: 412732, masterDemo: 23785,
    isb: 17793, bane: 17788, cata: 17778, aftermath: 18119, ruin: 17959, agon: 17927, conflag: 1293817, fnb: 412751, snf: 426316, incin: 412758 };
  // Talent spell ids by tree, in the order of data/talents.json (17 Affliction, 19 Demonology, 16 Destruction).
  const ORDER = [18182, 18174, 17810, 18218, 437032, 403511, 18827, 17783, 18288, 427712, 1310949, 18094, 18223, 18265, 17804, 18271, 1316697,
    18703, 18694, 18697, 18769, 1235316, 18705, 18731, 1225214, 18754, 18788, 18709, 440870, 18708, 1293695, 1225217, 19028, 412732, 23785, 425464,
    17917, 17793, 17788, 1225220, 17778, 18119, 17959, 17877, 18135, 17927, 1293817, 18073, 1225228, 412751, 426316, 412758];
  const TREES = [[0, 17, 'affliction', 'Affliction'], [17, 36, 'demonology', 'Demonology'], [36, 52, 'destruction', 'Destruction']];
  const STYLES = [{ id: 'auto', name: 'Follow the talents' }, { id: 'affliction', name: 'Affliction: Corruption, Bane of Agony, Siphon Life, then Wrack, Drain Life or Shadow Bolt' },
    { id: 'destruction', name: 'Destruction: Immolate, Conflagrate, then Incinerate or Shadow Bolt' }, { id: 'wand', name: 'Every damage over time spell, then wand' }];
  const PETS = { imp: 'Imp', voidwalker: 'Voidwalker', succubus: 'Succubus', none: 'No demon' };

  function detectSpec(talents) {
    const pts = TREES.map(([a, b]) => ORDER.slice(a, b).reduce((s, id) => s + ((talents && talents[id]) || 0), 0));
    let best = 0;
    for (let i = 1; i < 3; i++) if (pts[i] > pts[best]) best = i;
    if (pts[best] === 0) return { id: 'none', name: 'No talents' };
    return { id: TREES[best][2], name: TREES[best][3] };
  }
  function resolveStyle(cfg) {
    const s = cfg.style;
    if (s === 'affliction' || s === 'destruction' || s === 'wand') return s;
    return detectSpec(cfg.talents || {}).id === 'destruction' ? 'destruction' : 'affliction';
  }
  function choosePet(cfg, style, L) {
    if (cfg.pet && PETS[cfg.pet]) return cfg.pet;
    if (style === 'destruction') return 'imp';
    return L >= 20 ? 'succubus' : (L >= 10 ? 'voidwalker' : 'imp');
  }
  const val = (r, L) => U.scaled(r, L);
  // Base mana by level: an estimate (no data for it), about 1,075 at 60.
  const baseMana = (L) => 73 + 17 * (L - 1);
  const pick = (k, L) => U.pickRank(D[k], L);

  function derive(cfg) {
    const L = cfg.level, t = (id) => U.tal(cfg, id);
    const style = resolveStyle(cfg), pet = choosePet(cfg, style, L);
    const petOut = pet !== 'none';
    const dk = petOut ? [0, 0.33, 0.67, 1][Math.min(3, t(T.demKnow))] * L : 0;
    const spS = U.spellPower(cfg, 'sha') + dk, spF = U.spellPower(cfg, 'fir') + dk;
    const gearSp = (cfg.sp || 0) + Math.max((cfg.school && cfg.school.sha) || 0, (cfg.school && cfg.school.fir) || 0);
    const crit0 = U.spellCrit('Warlock', cfg, 0);
    const md = 0.02 * Math.min(5, t(T.masterDemo)), link = t(T.soulLink) && petOut ? 1.03 : 1;
    const shaAll = (1 + 0.02 * Math.min(5, t(T.shadowMastery))) * (pet === 'succubus' ? 1 + md : 1) * link; // Shadow Mastery covers SB and every shadow dot
    const firAll = (pet === 'imp' ? 1 + md : 1) * link;
    const agon = [0, 0.03, 0.07, 0.10][Math.min(3, t(T.agon))];
    const pand = 1 + 0.5 * (1 + [0, 0.33, 0.67, 1][Math.min(3, t(T.pandemic))]);
    const ruin = 1 + 0.5 * (1 + 0.2 * Math.min(5, t(T.ruin)));
    const cata = 1 - [0, 0.03, 0.06, 0.10][Math.min(3, t(T.cata))];
    const drains = 1 + [0, 0.07, 0.13, 0.20][Math.min(3, t(T.impDrains))];
    const bane = 0.1 * Math.min(5, t(T.bane));
    const r = { style, pet, petOut, dk, spS, spF, crit0, L,
      cS: Math.min(1, crit0 + 0.01 * Math.min(5, t(T.malev))), cF: crit0, pand, ruin,
      miss: Math.max(0.01, 0.04 - 0.01 * Math.min(5, t(T.supp))),
      mana: (baseMana(L) + Math.min(20, cfg.int) + 15 * Math.max(0, cfg.int - 20)) * (1 + 0.05 * Math.min(3, t(T.felVit))),
      nf: [0, 0.02, 0.04][Math.min(2, t(T.nightfall))], isb: 0.04 * Math.min(5, t(T.isb)), decim: [0, 0.03, 0.06][Math.min(2, t(T.decim))],
      soulSiphon: 0.04 * Math.min(3, t(T.soulSiphon)), snf: 0.04 * Math.min(5, t(T.snf)), keep: 0.2 * Math.min(5, t(T.snf)) };
    const sb = pick('sb', L);
    r.sb = { avg: val(sb, L) + sb.coef * spS, v: sb.v, cast: Math.max(0, sb.cast - bane), mana: sb.mana * cata, mult: shaAll * (1 + agon) };
    const co = pick('corr', L);
    if (co) r.corr = { tick: (val(co, L) + co.coef * spS) * shaAll * (1 + 0.02 * Math.min(5, t(T.impCorr))), dur: co.dur, per: co.per, mana: co.mana,
      cast: Math.max(0, co.cast - 0.4 * Math.min(5, t(T.impCorr))) };
    const bo = pick('boa', L);
    if (bo) r.boa = { base: val(bo, L), sp: bo.coef * spS, mult: shaAll * (1 + [0, 0.05, 0.10][Math.min(2, t(T.impBoa))]), dur: bo.dur, per: bo.per, mana: bo.mana };
    const si = t(T.siphon) ? pick('siph', L) : null;
    if (si) r.siph = { tick: (val(si, L) + si.coef * spS) * shaAll, dur: si.dur, per: si.per, mana: si.mana };
    const im = pick('imm', L);
    const fd = firAll * (1 + agon);
    r.imm = { hit: (im.dbase + im.dppl * Math.max(0, Math.min(L, im.ml) - im.bl) + im.dcoef * spF) * fd * (1 + 0.1 * Math.min(5, t(T.aftermath))),
      tick: (val(im, L) + im.coef * spF) * fd, dur: im.dur, per: im.per, mana: im.mana * cata, cast: Math.max(0, im.cast - bane) };
    const cf = t(T.conflag) ? pick('conf', L) : null;
    if (cf) r.conf = { avg: (val(cf, L) + cf.coef * spF) * fd, v: cf.v, mana: cf.mana * cata, crit: Math.min(1, crit0 + [0, 0.08, 0.17, 0.25][Math.min(3, t(T.fnb))]) };
    const ic = t(T.incin) ? pick('inc', L) : null;
    if (ic) r.inc = { avg: (val(ic, L) + ic.coef * spF) * fd, v: ic.v, mana: ic.mana * cata, cast: Math.max(0, ic.cast - bane) };
    const dl = pick('dl', L);
    if (dl) r.dl = { tick: (val(dl, L) + dl.coef * spS) * shaAll * drains, dur: dl.dur, mana: dl.mana };
    const wr = t(T.wrack) ? pick('wrack', L) : null;
    if (wr) r.wrack = { tick: (val(wr, L) + wr.coef * spS) * shaAll, dur: wr.dur, mana: wr.mana };
    const ce = U.pickRank(D.coe, L);
    if (ce) r.coe = { pct: ce.pct / 100, mana: ce.mana };
    // The demon. Melee demons: wowsims' average swing (0.698 Succubus, 0.494 Voidwalker of creature dps at 2.0 s, the
    // Voidwalker's melee halved) with the creature dps of this level, attack power 3 x level + 6 plus 0.17 of the warlock's spell power.
    const pm = (1 + 0.02 * Math.min(5, t(T.unholy))) * link;
    const petSp = 0.1 * gearSp + dk;
    r.petSp = petSp;
    if (pet === 'succubus' || pet === 'voidwalker') {
      const share = pet === 'succubus' ? 0.698 : 0.494;
      r.melee = { avg: share * U.mobDps(L) * 2 + (3 * L + 6 + 0.17 * gearSp) / 14 * 2, spread: pet === 'succubus' ? 0.215 : 0.264,
        mult: pm * (pet === 'voidwalker' ? 0.5 : 1) };
    }
    if (pet === 'succubus') {
      const lr = pick('lash', L);
      if (lr) r.lash = { avg: (lr.base + lr.coef * petSp) * pm * (1 + md) * (1 + 0.1 * Math.min(3, t(T.impSayaad))), crit: Math.min(1, r.cS) };
    }
    if (pet === 'imp') {
      const fr = pick('fb', L);
      r.fb = { avg: (val(fr, L) + fr.coef * petSp) * pm * (1 + md) * (1 + 0.1 * Math.min(3, t(T.impImp))), v: fr.v || 0.1, cast: fr.cast };
    }
    const w = cfg.ranged;
    r.wand = w && w.d1 && w.type === 'Wand' ? { d1: w.d1, d2: w.d2, ws: w.ws || 1.5 } : null;
    return r;
  }

  // Bane of Agony tick k (1-based) of n: half in the first third of the duration, full in the second, 1.5 in the last.
  const ramp = (k, n) => (3 * k <= n ? 0.5 : (3 * k <= 2 * n ? 1 : 1.5));

  function run(cfg, d, fights, seed, estDps) {
    const R = U.rng(seed);
    const M = U.mob(cfg);
    const hitP = 1 - d.miss, ARM = 1 - M.dr, st = d.style;
    const useCorr = st !== 'destruction' && !!d.corr, useBoa = st !== 'destruction' && !!d.boa, useSiph = st !== 'destruction' && !!d.siph;
    const useImm = st !== 'affliction', useConf = st === 'destruction' && !!d.conf, useInc = st === 'destruction' && !!d.inc;
    const useDl = st === 'affliction' && !!d.dl, useWrack = st === 'affliction' && !!d.wrack, wandFill = st === 'wand' && !!d.wand;
    const eS = 1 + d.cS * (d.pand - 1), eSb = 1 + d.cS * (d.ruin - 1), eF = 1 + d.cF * (d.ruin - 1);
    const parts = { 'Shadow Bolt': 0, Corruption: 0, 'Bane of Agony': 0, 'Siphon Life': 0, Immolate: 0, Conflagrate: 0, Incinerate: 0,
      'Drain Life': 0, Wrack: 0, Wand: 0, Demon: 0 };
    const corr = { on: false, lab: 'Corruption', aff: 1 }, boa = { on: false, lab: 'Bane of Agony', aff: 1 }, siph = { on: false, lab: 'Siphon Life', aff: 1 },
      imm = { on: false, lab: 'Immolate', aff: 0 }, chan = { on: false, lab: '', aff: 0 };
    const dots = [corr, boa, siph, imm, chan], affl = [corr, boa, siph];
    let totTime = 0, totHp = 0, oomFights = 0, stuck = 0;
    let H = 0, hp0 = 0, now = 0, ce = 1, vulnEnd = -1, snfEnd = -1, trance = -1, petNext = 0, lashNext = 0;
    const shaDyn = () => ce * (now < vulnEnd ? 1 + d.isb : 1) * (now < snfEnd ? 1 + d.snf : 1);
    const affCount = () => (corr.on ? 1 : 0) + (boa.on ? 1 : 0) + (siph.on ? 1 : 0);
    function deal(x, lab) { H -= x; parts[lab] += x; }
    function tickDot(o) {
      let x;
      if (o === boa) x = (d.boa.base * ramp(o.k, o.n) + d.boa.sp) * d.boa.mult * shaDyn() * (R() < d.cS ? d.pand : 1);
      else if (o === imm) x = o.b * ce * (R() < d.cF ? d.ruin : 1);
      else if (o === chan) x = o.b * shaDyn() * (1 + d.soulSiphon * affCount()) * (R() < d.cS ? d.pand : 1);
      else x = o.b * shaDyn() * (R() < d.cS ? d.pand : 1);
      deal(x, o.lab);
      if (d.nf && (o === corr || o === chan) && R() < d.nf) trance = now + 10;
      o.k++;
      o.next += o.per;
      if (o.next > o.end + 1e-6) o.on = false;
    }
    function petEvent(isLash) {
      if (isLash) {
        lashNext = now + 12;
        if (R() >= hitP) return;
        deal(d.lash.avg * ce * (R() < d.lash.crit ? 1.5 : 1), 'Demon');
      } else if (d.melee) {
        petNext = now + 2;
        if (R() < 0.10) return;
        deal(d.melee.avg * (1 + d.melee.spread * (2 * R() - 1)) * ARM * d.melee.mult * (R() < d.crit0 ? 2 : 1), 'Demon');
      } else {
        petNext = now + d.fb.cast;
        if (R() >= hitP) return;
        deal(d.fb.avg * (1 + d.fb.v * (2 * R() - 1)) * ce * (R() < d.crit0 ? 1.5 : 1), 'Demon');
      }
    }
    // Runs dot ticks and demon hits up to time te. Returns true if the mob died (now = time of death).
    function advance(te) {
      for (;;) {
        let tn = te + 1, k = -1;
        for (let i = 0; i < 5; i++) { const o = dots[i]; if (o.on && o.next < tn) { tn = o.next; k = i; } }
        if (petNext < tn) { tn = petNext; k = 5; }
        if (d.lash && lashNext < tn) { tn = lashNext; k = 6; }
        if (tn > te + 1e-9) break;
        now = tn;
        if (k < 5) tickDot(dots[k]); else petEvent(k === 6);
        if (H <= 0) return true;
      }
      now = te;
      return false;
    }
    function applyDot(o, src, b, at) {
      o.on = true; o.a = at; o.end = at + src.dur; o.bp = src.per; o.per = src.per; o.next = at + src.per; o.b = b; o.k = 1; o.n = Math.round(src.dur / src.per);
    }
    function regrid(per2) {
      for (const o of affl) {
        if (!o.on) continue;
        const p = per2 ? o.bp / 2 : o.bp;
        o.per = p;
        o.next = o.a + (Math.floor((now - o.a) / p + 1e-9) + 1) * p;
        if (o.next > o.end + 1e-6) o.on = false;
      }
    }
    const ticksBefore = (first, per, end, tD) => { const last = Math.min(end, tD); return first > last ? 0 : Math.floor((last - first) / per + 1e-9) + 1; };
    const gcdT = (c) => Math.max(1.5, c);

    for (let f = 0; f < fights; f++) {
      hp0 = M.hp * (0.7 + 0.6 * R());
      totHp += hp0;
      H = hp0; now = 0; ce = 1; vulnEnd = -1; snfEnd = -1; trance = -1;
      for (const o of dots) o.on = false;
      petNext = d.petOut ? (d.fb ? d.fb.cast : 1.5) : 1e9; lashNext = 1.5;
      let mana = d.mana, confReady = 0, oom = false, dead = false;
      while (!dead && now < 300) {
        const t = now, tD = t + H / estDps;
        // Best spell that puts damage over time on the mob, by expected damage per second of the warlock's time.
        let bestA = null, bestRate = 0, bestT = 1.5;
        const consider = (id, value, time, cost) => { const rt = value / time; if (cost <= mana && rt > bestRate) { bestA = id; bestRate = rt; bestT = time; } };
        if (useCorr && !corr.on) {
          const c = d.corr.cast, land = t + c;
          consider('corr', hitP * eS * d.corr.tick * ticksBefore(land + d.corr.per, d.corr.per, land + d.corr.dur, tD), gcdT(c), d.corr.mana);
        }
        if (useBoa && !boa.on) {
          const n = Math.round(d.boa.dur / d.boa.per), m = ticksBefore(t + d.boa.per, d.boa.per, t + d.boa.dur, tD);
          let v = 0;
          for (let k = 1; k <= m; k++) v += d.boa.base * ramp(k, n) + d.boa.sp;
          consider('boa', hitP * eS * v * d.boa.mult, 1.5, d.boa.mana);
        }
        if (useSiph && !siph.on) consider('siph', hitP * eS * d.siph.tick * ticksBefore(t + d.siph.per, d.siph.per, t + d.siph.dur, tD), 1.5, d.siph.mana);
        if (useImm && !imm.on) {
          const c = d.imm.cast, land = t + c;
          consider('imm', hitP * eF * (d.imm.hit + d.imm.tick * ticksBefore(land + d.imm.per, d.imm.per, land + d.imm.dur, tD)), gcdT(c), d.imm.mana);
        }
        if (d.coe && ce === 1) consider('coe', d.coe.pct * Math.min(H, estDps * (tD - t)) * 0.85, 1.5, d.coe.mana);
        if (useConf && imm.on && t >= confReady) {
          const lost = (1 - d.keep) * eF * d.imm.tick * ticksBefore(imm.next, imm.per, imm.end, tD);
          consider('conf', hitP * (1 + d.conf.crit * (d.ruin - 1)) * d.conf.avg - lost, 1.5, d.conf.mana);
        }
        // Best filler.
        let fill = null, fillRate = 0, fillT = 1.5;
        const consF = (id, value, time, cost) => { const rt = value / time; if (cost <= mana && rt > fillRate) { fill = id; fillRate = rt; fillT = time; } };
        const low = H < 0.35 * hp0 ? 1 + d.decim : 1;
        if (wandFill) consF('wand', hitP * (d.wand.d1 + d.wand.d2) / 2 * (1 + d.crit0 * 0.5), d.wand.ws, 0);
        else {
          const sbT = now < trance ? 1.5 : gcdT(d.sb.cast);
          consF('sb', hitP * eSb * d.sb.avg * d.sb.mult * low, sbT, d.sb.mana);
          if (useInc) consF('inc', hitP * eF * d.inc.avg * (imm.on ? 1.25 : 1), gcdT(d.inc.cast), d.inc.mana);
          if (useDl) consF('dl', hitP * eS * d.dl.tick * (1 + d.soulSiphon * affCount()) * Math.min(d.dl.dur, Math.max(1, Math.floor(tD - t))) , d.dl.dur, d.dl.mana);
          if (useWrack) {
            let v = d.wrack.tick * (1 + d.soulSiphon * affCount()) * Math.min(d.wrack.dur, Math.max(1, Math.floor(tD - t)));
            for (const o of affl) {
              if (!o.on) continue;
              const hp = o.bp / 2, last = Math.min(o.end, tD, t + d.wrack.dur);
              const first = o.a + (Math.floor((t - o.a) / hp + 1e-9) + 1) * hp;
              const extra = first > last ? 0 : Math.ceil((Math.floor((last - first) / hp + 1e-9) + 1) / 2);
              v += extra * (o === boa ? (d.boa.base + d.boa.sp) * d.boa.mult : o.b);
            }
            consF('wrack', hitP * eS * v, d.wrack.dur, d.wrack.mana);
          }
        }
        let a = bestA && bestRate >= fillRate ? bestA : fill;
        if (!a) {
          oom = true;
          if (d.wand) a = 'wand';
          else {
            const nxt = Math.min(petNext, d.lash ? lashNext : 1e9, ...dots.map((o) => (o.on ? o.next : 1e9)));
            if (nxt >= 1e9) { stuck++; now = 300; break; }
            dead = advance(nxt);
            continue;
          }
        }
        if (a === 'wand') {
          dead = advance(t + d.wand.ws);
          if (dead) break;
          if (R() < hitP) deal((d.wand.d1 + (d.wand.d2 - d.wand.d1) * R()) * ce * (R() < d.crit0 ? 1.5 : 1), 'Wand');
          if (H <= 0) dead = true;
          continue;
        }
        if (a === 'dl' || a === 'wrack') {
          const s = a === 'dl' ? d.dl : d.wrack;
          mana -= s.mana;
          if (R() >= hitP) { dead = advance(t + 1.5); continue; }
          chan.on = true; chan.lab = a === 'dl' ? 'Drain Life' : 'Wrack'; chan.a = t; chan.end = t + s.dur; chan.per = 1; chan.bp = 1; chan.next = t + 1; chan.b = s.tick;
          if (a === 'wrack') regrid(true);
          dead = advance(t + s.dur);
          chan.on = false;
          if (a === 'wrack' && !dead) regrid(false);
          continue;
        }
        // Cast time, then the effect.
        const cast = a === 'corr' ? d.corr.cast : a === 'imm' ? d.imm.cast : a === 'inc' ? d.inc.cast : a === 'sb' ? (now < trance ? 0 : d.sb.cast) : 0;
        if (cast > 0) { dead = advance(t + cast); if (dead) break; }
        const land = R() < hitP;
        if (a === 'corr') { mana -= d.corr.mana; if (land) applyDot(corr, d.corr, d.corr.tick, now); }
        else if (a === 'boa') { mana -= d.boa.mana; if (land) applyDot(boa, d.boa, 0, now); }
        else if (a === 'siph') { mana -= d.siph.mana; if (land) applyDot(siph, d.siph, d.siph.tick, now); }
        else if (a === 'coe') { mana -= d.coe.mana; if (land) ce = 1 + d.coe.pct; }
        else if (a === 'imm') {
          mana -= d.imm.mana;
          if (land) { deal(d.imm.hit * ce * (R() < d.cF ? d.ruin : 1), 'Immolate'); applyDot(imm, d.imm, d.imm.tick, now); }
        } else if (a === 'conf') {
          mana -= d.conf.mana; confReady = now + 10;
          if (land) {
            deal(d.conf.avg * (1 + d.conf.v * (2 * R() - 1)) * ce * (R() < d.conf.crit ? d.ruin : 1), 'Conflagrate');
            if (d.snf) snfEnd = now + 20;
            if (R() >= d.keep) imm.on = false;
          }
        } else if (a === 'inc') {
          mana -= d.inc.mana;
          if (land) deal(d.inc.avg * (1 + d.inc.v * (2 * R() - 1)) * ce * (imm.on ? 1.25 : 1) * (R() < d.cF ? d.ruin : 1), 'Incinerate');
        } else if (a === 'sb') {
          mana -= d.sb.mana;
          if (cast === 0 && now < trance) trance = -1;
          if (land) {
            const cr = R() < d.cS;
            deal(d.sb.avg * (1 + d.sb.v * (2 * R() - 1)) * d.sb.mult * low * shaDyn() * (cr ? d.ruin : 1), 'Shadow Bolt');
            if (cr && d.isb) vulnEnd = now + 12;
          }
        }
        if (H <= 0) { dead = true; break; }
        if (cast < 1.5) dead = advance(t + 1.5);
      }
      if (oom) oomFights++;
      totTime += now > 0.5 ? now : 0.5;
    }
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), oom: oomFights / fights, stuck: stuck / fights };
  }

  function simulate(cfg, fights, seed) {
    const d = derive(cfg);
    // A first short run gives the kill speed the rotation uses to judge which damage over time spells pay off.
    const petGuess = d.melee ? d.melee.avg / 2 * 0.8 : d.fb ? d.fb.avg / d.fb.cast : 0;
    const guess = d.sb.avg * d.sb.mult / Math.max(1.5, d.sb.cast) * 1.6 + petGuess;
    const pilot = run(cfg, d, Math.min(400, fights), (seed || 1) + 7919, guess);
    const res = run(cfg, d, fights, seed, pilot.dps);
    const notes = [];
    if (cfg.style === 'wand' && !d.wand) notes.push('No wand equipped, so Shadow Bolt is the filler instead of the wand.');
    if (res.oom > 0.005) notes.push('Mana ran out in ' + Math.round(res.oom * 100) + '% of fights' + (d.wand ? ', and the wand finished them.' : '; with no wand the warlock stops casting and the demon and the damage over time spells finish the mob.'));
    if (res.stuck > 0) notes.push('Some fights could not be finished without mana and without a demon.');
    if (U.tal(cfg, 17877)) notes.push('Shadowburn is left out: it costs a Soul Shard.');
    if (U.tal(cfg, 18788)) notes.push('Demonic Sacrifice is left out: the demon is kept out for the fight.');
    if (d.pet === 'voidwalker') notes.push('Below level 20 the Voidwalker is assumed (it tanks); its melee is weak and halved on this server.');
    if (U.tal(cfg, 1293695)) notes.push('Demonic Brand is left out: the rotation does not cast Searing Pain.');
    notes.push('Life Tap is used between fights; Amplify Curse, Soul Fire and Bane of Doom (one minute or longer cooldowns or Soul Shards) are left out.');
    const sty = STYLES.find((s) => s.id === d.style);
    return { dps: res.dps, ttk: res.ttk, share: res.share, notes,
      info: { Rotation: sty ? sty.name.split(':')[0] : d.style, Demon: PETS[d.pet], 'Spell crit': (d.crit0 * 100).toFixed(1) + '%', 'Shadow spell power': Math.round(d.spS),
        'Fire spell power': Math.round(d.spF), Mana: Math.round(d.mana), 'Fights out of mana': Math.round(res.oom * 100) + '%' } };
  }

  // A normal levelling build: points spent in this order.
  const BUILDS = {
    affliction: [[17810, 5], [403511, 3], [18174, 2], [18827, 2], [18288, 1], [17783, 2], [1310949, 5], [18094, 2], [427712, 3], [18265, 1], [17804, 3],
      [18271, 5], [1316697, 1], [18174, 5], [18703, 2], [18694, 3], [18769, 5], [18754, 3]],
    destruction: [[17788, 5], [17778, 3], [18119, 2], [17959, 5], [17927, 3], [1293817, 1], [17877, 1], [412751, 3], [17793, 2], [426316, 5], [412758, 1],
      [17793, 5], [18119, 5], [18703, 2], [18694, 3], [18769, 4]],
  };
  GL.register({
    name: 'Warlock',
    armor: () => 'C',
    weapons: ['Dagger', 'Sword', 'Staff'],
    rangedTypes: ['Wand'],
    shield: false,
    twoHand: true,
    dualWield: () => false,
    damageSlots: () => [],
    styles: STYLES,
    detectSpec: (talents) => detectSpec(talents || {}),
    statKeys: () => ['sp', 'int', 'scrit'],
    unit: () => 'sp',
    schools: (cfg) => (resolveStyle(cfg || {}) === 'affliction' ? ['sha'] : ['sha', 'fir']),
    simulate,
    sampleTalents: (L, styleId) => {
      const order = BUILDS[styleId === 'destruction' ? 'destruction' : 'affliction'];
      const out = {};
      let pts = Math.max(0, L - 9);
      for (const [id, max] of order) { const have = out[id] || 0; const r = Math.min(max - have, pts); if (r > 0) { out[id] = have + r; pts -= r; } }
      return out;
    },
    about: 'Levelling warlock against one mob: damage over time spells that pay off before the mob dies (only the ticks that land count), then Shadow Bolt, Wrack, Drain Life, Incinerate or wand, with mana, cast times and the demon (Voidwalker, Succubus or Imp).',
  });
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
