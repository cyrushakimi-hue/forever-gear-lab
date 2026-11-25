/* Shaman (enhancement, levelling). Reference class module.
   Rules from the wowsims/forever data: Str = 2 attack power, Agility gives crit only, Mental Dexterity turns Intellect
   into attack power, Rockbiter is flat attack power, Windfury is 20% for extra hits on a 1.5 s cooldown,
   Stormstrike is a normalized weapon strike every 8 s, Flurry speeds swings after a crit. */
(function (root) {
  'use strict';
  const GL = root.GearLab || (typeof require !== 'undefined' ? require('../core.js') : null);
  const U = GL.util;
  const D = {"rockbiter":[{"lvl":1,"base":29,"ppl":4.099999904632568,"bl":1,"ml":6},{"lvl":8,"base":58,"ppl":3.5,"bl":8,"ml":14},{"lvl":16,"base":88,"ppl":5,"bl":16,"ml":22},{"lvl":24,"base":129,"ppl":8.100000381469727,"bl":24,"ml":32},{"lvl":34,"base":211,"ppl":18,"bl":34,"ml":42},{"lvl":44,"base":393,"ppl":16.100000381469727,"bl":44,"ml":52},{"lvl":54,"base":554,"ppl":16.5,"bl":54,"ml":62}],"windfury":[{"lvl":30,"base":46,"ppl":7.199999809265137,"bl":30,"ml":38,"hits":2},{"lvl":40,"base":119,"ppl":12.800000190734863,"bl":40,"ml":48,"hits":2},{"lvl":50,"base":249,"ppl":8.300000190734863,"bl":50,"ml":58,"hits":2},{"lvl":60,"base":333,"ppl":12.5,"bl":60,"ml":68,"hits":2}],"earthShock":[{"lvl":4,"base":20,"ppl":0.5,"bl":4,"ml":9,"var":0.1111111119389534,"coef":0.38600000739097595,"mana":30},{"lvl":8,"base":36,"ppl":0.699999988079071,"bl":8,"ml":13,"var":0.06060606241226196,"coef":0.38600000739097595,"mana":50},{"lvl":14,"base":67,"ppl":0.8999999761581421,"bl":14,"ml":19,"var":0.06451612710952759,"coef":0.38600000739097595,"mana":85},{"lvl":24,"base":130,"ppl":1.100000023841858,"bl":24,"ml":29,"var":0.06504064798355103,"coef":0.38600000739097595,"mana":145},{"lvl":36,"base":242,"ppl":1.2999999523162842,"bl":36,"ml":41,"var":0.06034482643008232,"coef":0.38600000739097595,"mana":240},{"lvl":48,"base":383,"ppl":1.600000023841858,"bl":48,"ml":53,"var":0.05945945903658867,"coef":0.38600000739097595,"mana":345},{"lvl":60,"base":531,"ppl":3.4000000953674316,"bl":60,"ml":65,"var":0.05273069813847542,"coef":0.38600000739097595,"mana":450}],"lightningShield":[{"lvl":8,"base":13,"coef":0.2669999897480011,"mana":45},{"lvl":16,"base":24,"coef":0.2669999897480011,"mana":80},{"lvl":24,"base":40,"coef":0.2669999897480011,"mana":125},{"lvl":32,"base":64,"coef":0.2669999897480011,"mana":180},{"lvl":40,"base":96,"coef":0.2669999897480011,"mana":240},{"lvl":48,"base":134,"coef":0.2669999897480011,"mana":305},{"lvl":56,"base":178,"coef":0.2669999897480011,"mana":370}]};
  const T = { thundering: 16255, ancestral: 17485, mentalDex: 415140, eleWeapons: 16266, flurry: 16256, stormstrike: 17364,
    mentalQuick: 30812, concussion: 16035, impLS: 16261, eleFury: 16089 };

  function derive(cfg) {
    const t = (id) => U.tal(cfg, id);
    const L = cfg.level;
    const intT = cfg.int * (1 + 0.02 * t(T.ancestral));
    const md = [0, 0.33, 0.66, 1][Math.min(3, t(T.mentalDex))];
    const ew = Math.min(3, t(T.eleWeapons));
    const wfRank = U.pickRank(D.windfury, L);
    const es = U.pickRank(D.earthShock, L), ls = U.pickRank(D.lightningShield, L);
    return {
      ap: 2 * L - 20 + 2 * cfg.str + md * intT + (cfg.ap || 0),
      rb: U.scaled(U.pickRank(D.rockbiter, L), L) * (1 + [0, 0.07, 0.13, 0.20][ew]),
      wf: wfRank ? U.scaled(wfRank, L) * (1 + [0, 0.13, 0.27, 0.40][ew]) : 0,
      wfHits: wfRank ? wfRank.hits || 2 : 0, hasWf: !!wfRank,
      crit: U.meleeCrit('Shaman', cfg, t(T.thundering)),
      spcrit: U.spellCrit('Shaman', Object.assign({}, cfg, { int: intT }), t(T.thundering)),
      sp: U.spellPower(cfg, 'nat') + [0, 0.15, 0.30][Math.min(2, t(T.mentalQuick))] * intT,
      flurry: 1 + 0.06 * Math.min(5, t(T.flurry)),
      hasSS: t(T.stormstrike) > 0,
      es: es ? { base: U.scaled(es, L) * (1 + 0.01 * t(T.concussion)), v: es.var || 0.06, coef: es.coef } : null,
      ls: ls ? { base: ls.base * (1 + 0.05 * t(T.impLS)), coef: ls.coef } : null,
      spMult: 1.5 + 0.1 * t(T.eleFury),
    };
  }

  function run(cfg, imbue, fights, seed) {
    const R = U.rng(seed);
    const d = derive(cfg);
    const M = U.mob(cfg);
    const ap = d.ap + (imbue === 'rb' ? d.rb : 0);
    const w = cfg.mh && cfg.mh.d1 ? cfg.mh : { d1: 1, d2: 2, ws: 2.0 };
    const wmin = w.d1, wspan = w.d2 - w.d1, S = w.ws;
    const norm = w.twoHand ? 3.3 : (w.type === 'Dagger' ? 1.7 : 2.4);
    const ssMult = w.fx === 'Rage of Earth' ? 1.1 : 1;
    const pr = w.pr || null;
    const pchance = pr ? pr.ppm * S / 60 : 0;
    const ARM = 1 - M.dr;
    const miss = Math.max(0, M.miss - (cfg.hit || 0) / 100);
    const tParry = miss + M.dodge + M.parry, tGlance = tParry + M.glance, tCrit = tGlance + d.crit;
    const useShock = cfg.style !== 'melee' && !!d.es;
    const useLs = cfg.style !== 'melee' && !!d.ls;
    const useSS = d.hasSS;
    const SPH = 1 - M.spellMiss;
    const parts = { 'White hits': 0, Stormstrike: 0, Windfury: 0, Shocks: 0, 'Lightning Shield': 0, 'Weapon proc': 0 };
    let totTime = 0, totHp = 0;
    for (let f = 0; f < fights; f++) {
      const hp = M.hp * (0.7 + 0.6 * R());
      totHp += hp;
      let t = 0, dmg = 0, nextSwing = 0, gcd = 0, ssReady = useSS ? 0 : 1e9, shockReady = useShock ? 0 : 1e9;
      let ssDebuff = false, flCh = 0, flExp = -1, flIcd = 0, wfIcd = 0, lsCh = useLs ? 3 : 0, lsIcd = 0, mobSwing = 1.0;
      let dots = [], guard = 0;
      while (dmg < hp && guard++ < 5000) {
        t = nextSwing;
        let ev = 0;
        const first = gcd;
        let ta = ssReady;
        if (useShock) {
          let st = shockReady;
          if (useSS && !ssDebuff && ssReady <= Math.max(first, st)) st = ssReady + 1.5;
          if (st < ta) ta = st;
        }
        if (useLs && lsCh === 0 && ta > first + 1.5) ta = first;
        if (ta < first) ta = first;
        if (ta < t) { t = ta; ev = 1; }
        if (mobSwing < t) { t = mobSwing; ev = 2; }
        for (let i = 0; i < dots.length; i++) if (dots[i][0] < t) { t = dots[i][0]; ev = 3; }
        let landed = 0;
        if (ev === 0) {
          const flOn = flCh > 0 && t < flExp;
          const r = R();
          const base = (wmin + wspan * R() + ap / 14 * S) * ARM;
          let d0 = 0, gained = false;
          if (r < tParry) d0 = 0;
          else if (r < tGlance) { d0 = base * M.glanceMult; landed = 1; }
          else if (r < tCrit) { d0 = base * 2; landed = 1; if (d.flurry > 1) { flCh = 3; flExp = t + 15; gained = true; } }
          else { d0 = base; landed = 1; }
          dmg += d0; parts['White hits'] += d0;
          if (flOn && !gained && t >= flIcd) { flCh--; flIcd = t + 0.5; }
          nextSwing = t + ((flCh > 0 && t < flExp) ? S / d.flurry : S);
        } else if (ev === 1) {
          if (ssReady <= t) {
            const base = (wmin + wspan * R() + ap / 14 * norm) * ARM * ssMult;
            let d0 = 0;
            if (R() >= tParry) {
              landed = 1; ssDebuff = true;
              if (R() < d.crit) { d0 = base * 2; if (d.flurry > 1) { flCh = 3; flExp = t + 15; } } else d0 = base;
            }
            dmg += d0; parts.Stormstrike += d0; ssReady = t + 8;
          } else if (useShock && shockReady <= t) {
            let d0 = 0;
            if (R() < SPH) {
              d0 = d.es.base * (1 + d.es.v * (2 * R() - 1)) + d.es.coef * d.sp;
              if (ssDebuff) { d0 *= 1.2; ssDebuff = false; }
              if (R() < d.spcrit) d0 *= d.spMult;
            }
            dmg += d0; parts.Shocks += d0; shockReady = t + 6;
          } else if (useLs && lsCh === 0) {
            lsCh = 3;
          } else { gcd = t + 0.2; continue; }
          gcd = t + 1.5;
        } else if (ev === 2) {
          mobSwing = t + M.swing;
          if (lsCh > 0 && t >= lsIcd && R() < 0.88) {
            let d0 = 0;
            if (R() < SPH) { d0 = d.ls.base + d.ls.coef * d.sp; if (R() < d.spcrit) d0 *= d.spMult; }
            dmg += d0; parts['Lightning Shield'] += d0; lsCh--; lsIcd = t + 3.5;
          }
          continue;
        } else {
          for (let i = 0; i < dots.length; i++) {
            const o = dots[i];
            if (o[0] <= t) { dmg += o[2]; parts['Weapon proc'] += o[2]; o[1]--; o[0] += o[3]; }
          }
          dots = dots.filter((o) => o[1] > 0);
          continue;
        }
        if (landed) {
          let extra = 1;
          if (imbue === 'wf' && t >= wfIcd && R() < 0.20) {
            wfIcd = t + 1.5;
            for (let i = 0; i < d.wfHits; i++) {
              if (R() < tParry) continue;
              let b = (wmin + wspan * R() + (ap + d.wf) / 14 * S) * ARM;
              if (R() < d.crit) { b *= 2; if (d.flurry > 1) { flCh = 3; flExp = t + 15; } }
              else if (flCh > 0 && t >= flIcd) { flCh--; flIcd = t + 0.5; }
              dmg += b; parts.Windfury += b; extra++;
            }
          }
          if (pr) {
            for (let i = 0; i < extra; i++) {
              if (R() < pchance) {
                if (pr.d) {
                  let d0 = pr.d * (0.9 + 0.2 * R());
                  if (pr.ph) d0 *= ARM;
                  else { if (R() >= SPH) d0 = 0; else if (R() < d.spcrit) d0 *= 1.5; }
                  dmg += d0; parts['Weapon proc'] += d0;
                }
                if (pr.dot) { dots = dots.filter((o) => o[4] !== 1); dots.push([t + 2, 5, pr.dot / 5, 2, 1]); }
              }
            }
          }
        }
      }
      totTime += t > 0.5 ? t : 0.5;
    }
    return { dps: totHp / totTime, ttk: totTime / fights, share: U.shares(parts), d };
  }

  function simulate(cfg, fights, seed) {
    const forced = cfg.imbue;
    let best = run(cfg, forced || 'rb', fights, seed), imbue = forced || 'rb';
    if (!forced && best.d.hasWf) {
      const b = run(cfg, 'wf', fights, seed);
      if (b.dps > best.dps) { best = b; imbue = 'wf'; }
    }
    const notes = [];
    if (!best.d.hasSS) notes.push('No Stormstrike talent found, so it is left out of the fights.');
    return { dps: best.dps, ttk: best.ttk, share: best.share, notes,
      info: { 'Best weapon imbue': imbue === 'wf' ? 'Windfury' : 'Rockbiter', 'Melee crit': (best.d.crit * 100).toFixed(1) + '%', 'Attack power before imbue': Math.round(best.d.ap) } };
  }

  GL.register({
    name: 'Shaman',
    armor: (L) => (L >= 40 ? 'CLM' : 'CL'),
    weapons: ['Axe', 'Mace', 'Staff', 'Dagger', 'Fist Weapon'],
    rangedTypes: [],
    shield: true,
    twoHand: true,
    dualWield: () => false,
    damageSlots: () => ['MainHand'],
    styles: [{ id: 'shocks', name: 'Shocks and Lightning Shield' }, { id: 'melee', name: 'Melee only' }],
    detectSpec: (talents) => ({ id: 'enhancement', name: 'Enhancement' }),
    statKeys: () => ['str', 'agi', 'int', 'ap', 'sp', 'hit', 'crit'],
    unit: () => 'ap',
    schools: () => ['nat'],
    simulate,
    // A typical levelling build at this level, used by the checks: { talent spell id: rank }.
    sampleTalents: (L) => {
      const order = [[16255, 5], [17485, 5], [415140, 3], [16266, 3], [16256, 5], [17364, 1], [16261, 3], [30812, 2], [16035, 5]];
      const out = {};
      let pts = Math.max(0, L - 9);
      for (const [id, max] of order) { const r = Math.min(max, pts); if (r > 0) out[id] = r; pts -= r; }
      return out;
    },
    about: 'Enhancement shaman: white hits, Stormstrike, Windfury or Rockbiter (whichever wins), and optionally Earth Shock on cooldown with Lightning Shield kept up.',
  });
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
