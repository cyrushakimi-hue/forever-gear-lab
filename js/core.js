/* Forever Gear Lab core: class registry, shared rules and helpers every class simulator uses.
   Loads in a browser page, a worker and Node. Class modules live in js/classes/ and call GearLab.register(). */
(function (root) {
  'use strict';
  const GL = root.GearLab = root.GearLab || { classes: {} };

  GL.register = function (mod) { GL.classes[mod.name] = mod; return mod; };

  // ---------- random numbers (seeded, so runs repeat exactly) ----------
  function rng(seed) {
    let a = (seed || 1) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- spell ranks ----------
  // list: [{lvl, base, ppl, bl, ml, ...}] sorted by lvl. Returns the highest rank trained at this level.
  function pickRank(list, level) {
    let best = null;
    for (const r of list) if (r.lvl <= level) best = r;
    return best;
  }
  // Value of a rank at a level: base + per-level growth from its base level, capped at its max level.
  function scaled(r, level) {
    if (!r) return 0;
    const top = r.ml ? Math.min(level, r.ml) : level;
    return r.base + (r.ppl || 0) * Math.max(0, top - (r.bl || r.lvl));
  }

  // ---------- the mob (same level as the player, fought from the front). Classic-style assumptions. ----------
  const mobHp = (L) => 50 + 9 * L + 0.7 * L * L;
  const mobDr = (L) => 0.13 + 0.0043 * L;            // share of physical damage its armor removes
  const mobDps = (L) => 60.45 * Math.pow(L / 60, 1.3); // what it deals to the player before the player's armor
  function mob(cfg) {
    const L = cfg.level;
    return {
      hp: cfg.mobHp || mobHp(L), dr: cfg.mobDr != null ? cfg.mobDr : mobDr(L), dps: mobDps(L), swing: 2.0,
      miss: 0.05, dodge: 0.05, parry: 0.05, block: 0, glance: 0.10, glanceMult: 0.95, spellMiss: 0.04, dualWieldMiss: 0.19,
    };
  }

  // ---------- crit from Agility and Intellect ----------
  // Level 60 values are from the game data. Below 60 the game data was not available: the curve is an estimate.
  const AGI60 = { Warrior: 20, Paladin: 19.76, Hunter: 52.9, Rogue: 29, Priest: 20, Shaman: 19.7, Mage: 19.46, Warlock: 20, Druid: 20 };
  const AGI1 = { Warrior: 3.9, Paladin: 4.6, Hunter: 3.5, Rogue: 2.2, Priest: 11, Shaman: 9.6, Mage: 12.9, Warlock: 8.4, Druid: 7.9 };
  const INT60 = { Paladin: 59.9, Hunter: 60.6, Priest: 59.5, Shaman: 59.2, Mage: 59.5, Warlock: 60.6, Druid: 59.9 };
  const BASE_CRIT = { Warrior: 0, Paladin: 0.7, Hunter: 0, Rogue: 0, Priest: 3.0, Shaman: 1.7, Mage: 3.2, Warlock: 2.0, Druid: 0.9 };
  const BASE_SPELL_CRIT = { Paladin: 3.5, Hunter: 3.6, Priest: 0.8, Shaman: 2.3, Mage: 0.2, Warlock: 1.7, Druid: 1.8 };
  function agiPerCrit(cls, L) {
    const a1 = AGI1[cls] || 8, a60 = AGI60[cls] || 20;
    return a1 + (a60 - a1) * Math.pow(Math.max(0, L - 1) / 59, 1.27);
  }
  function intPerCrit(cls, L) {
    const i60 = INT60[cls] || 59.5;
    return 6 + (i60 - 6) * Math.pow(Math.max(0, L - 1) / 59, 1.1);
  }
  // Melee or ranged crit chance as a fraction. extra = percent from talents and other things NOT on the character sheet yet.
  // With a character sheet in the export, the sheet's crit already includes talents, so only gear changes move it.
  function meleeCrit(cls, cfg, talentPct) {
    const apc = cfg.agiPerCrit || agiPerCrit(cls, cfg.level);
    let pct;
    if (cfg.sheet && cfg.sheet.crit != null) pct = +cfg.sheet.crit + (cfg.agi - cfg.sheet.agi) / apc + ((cfg.crit || 0) - (cfg.sheet.critGear || 0));
    else pct = (BASE_CRIT[cls] || 0) + cfg.agi / apc + (cfg.crit || 0) + (talentPct || 0);
    return Math.max(0, Math.min(100, pct)) / 100;
  }
  function spellCrit(cls, cfg, talentPct) {
    const ipc = intPerCrit(cls, cfg.level);
    let pct;
    if (cfg.sheet && cfg.sheet.spellCrit != null) pct = +cfg.sheet.spellCrit + (cfg.int - cfg.sheet.int) / ipc + ((cfg.scrit || 0) - (cfg.sheet.scritGear || 0));
    else pct = (BASE_SPELL_CRIT[cls] || 0) + cfg.int / ipc + (cfg.scrit || 0) + (talentPct || 0);
    return Math.max(0, Math.min(100, pct)) / 100;
  }

  // ---------- estimated naked stats when the export has no character sheet ----------
  // Level 60 class values and race offsets are from the game data; level 1 values and the curve are estimates.
  const BASE60 = {
    Warrior: { str: 120, agi: 80, sta: 110, int: 30, spi: 45 }, Paladin: { str: 105, agi: 65, sta: 100, int: 70, spi: 75 },
    Hunter: { str: 55, agi: 125, sta: 90, int: 65, spi: 70 }, Rogue: { str: 80, agi: 130, sta: 75, int: 35, spi: 50 },
    Priest: { str: 35, agi: 40, sta: 50, int: 120, spi: 125 }, Shaman: { str: 88, agi: 52, sta: 95, int: 87, spi: 100 },
    Mage: { str: 30, agi: 35, sta: 45, int: 125, spi: 120 }, Warlock: { str: 45, agi: 50, sta: 65, int: 110, spi: 115 },
    Druid: { str: 65, agi: 60, sta: 70, int: 100, spi: 110 },
  };
  const BASE1 = {
    Warrior: { str: 23, agi: 20, sta: 22, int: 20, spi: 20 }, Paladin: { str: 22, agi: 20, sta: 22, int: 20, spi: 21 },
    Hunter: { str: 20, agi: 23, sta: 21, int: 20, spi: 21 }, Rogue: { str: 21, agi: 23, sta: 21, int: 20, spi: 20 },
    Priest: { str: 20, agi: 20, sta: 20, int: 22, spi: 23 }, Shaman: { str: 21, agi: 20, sta: 21, int: 21, spi: 22 },
    Mage: { str: 20, agi: 20, sta: 20, int: 23, spi: 22 }, Warlock: { str: 20, agi: 20, sta: 21, int: 22, spi: 22 },
    Druid: { str: 21, agi: 20, sta: 20, int: 22, spi: 22 },
  };
  const RACE = {
    Human: {}, Orc: { str: 3, agi: -3, int: -3, spi: 3, sta: 2 }, Dwarf: { str: 2, agi: -4, int: -1, spi: -1, sta: 3 },
    'Night elf': { str: -3, agi: 5, sta: -1 }, Nightelf: { str: -3, agi: 5, sta: -1 }, Undead: { str: -1, agi: -2, int: -2, spi: 5, sta: 1 },
    Tauren: { str: 5, agi: -5, int: -5, spi: 2, sta: 2 }, Gnome: { str: -5, agi: 3, int: 3, sta: -1 }, Troll: { str: 1, agi: 2, int: -4, spi: 1, sta: 1 },
  };
  const HORDE = ['Orc', 'Troll', 'Tauren', 'Undead'];
  function baseStats(cls, race, L) {
    const b60 = BASE60[cls] || BASE60.Warrior, b1 = BASE1[cls] || BASE1.Warrior, r = RACE[race] || {};
    const f = Math.pow(Math.max(0, L - 1) / 59, 1.15);
    const out = {};
    for (const k of ['str', 'agi', 'sta', 'int', 'spi']) out[k] = Math.round(b1[k] + (b60[k] - b1[k]) * f + (r[k] || 0));
    return out;
  }

  // ---------- small helpers for class modules ----------
  // Average hit of a weapon object {d1, d2, ws}; 0 if missing.
  const weaponDps = (w) => (w && w.d1 ? (w.d1 + w.d2) / 2 / w.ws : 0);
  // Roll one weapon swing's base damage (before armor): weapon roll + attack power bonus over `speed` seconds.
  const swing = (w, ap, speed, R) => w.d1 + (w.d2 - w.d1) * R() + ap / 14 * speed;
  // Shares of a damage breakdown object.
  function shares(parts) {
    let total = 0;
    for (const k in parts) total += parts[k];
    const out = {};
    for (const k in parts) out[k] = total > 0 ? parts[k] / total : 0;
    return out;
  }
  // Rank of a talent by spell id.
  const tal = (cfg, id) => (cfg.talents && cfg.talents[id]) || 0;
  // Total spell power for a school key ('fir', 'fro', 'nat', 'sha', 'arc', 'hol').
  const spellPower = (cfg, school) => (cfg.sp || 0) + ((cfg.school && cfg.school[school]) || 0);
  // A weapon proc {ppm, d, dot, ph}: expected damage for one landed hit with a weapon of speed ws.
  function procHit(pr, ws, R, armorMult, spellCritChance) {
    if (!pr || R() >= pr.ppm * ws / 60) return 0;
    let d = 0;
    if (pr.d) {
      d = pr.d * (0.9 + 0.2 * R());
      if (pr.ph) d *= armorMult;
      else if (R() < 0.04) d = 0;
      else if (R() < (spellCritChance || 0)) d *= 1.5;
    }
    return d + (pr.dot || 0);
  }

  GL.util = { rng, pickRank, scaled, mobHp, mobDr, mobDps, mob, agiPerCrit, intPerCrit, meleeCrit, spellCrit, baseStats, weaponDps, swing, shares, tal, spellPower, procHit, HORDE, RACE, BASE_CRIT, BASE_SPELL_CRIT };

  // ---------- running a class ----------
  GL.simulate = function (cls, cfg, fights, seed) {
    const m = GL.classes[cls];
    if (!m) throw new Error('No simulator for ' + cls);
    return m.simulate(cfg, fights, seed || 7);
  };

  const STEP = { str: 30, agi: 40, sta: 40, int: 30, spi: 40, ap: 60, rap: 60, sp: 40, hit: 2, crit: 2, scrit: 2 };
  // What one point of each stat is worth, in damage per second, by nudging each stat and re-running the fights.
  GL.weights = function (cls, cfg, fights, seed, onStep) {
    const m = GL.classes[cls];
    const base = m.simulate(cfg, fights, seed);
    const keys = m.statKeys(cfg);
    const slots = m.damageSlots(cfg);
    const per = {};
    const total = keys.length + slots.length;
    let i = 0;
    for (const k of keys) {
      const c2 = Object.assign({}, cfg);
      c2[k] = (cfg[k] || 0) + STEP[k];
      per[k] = (m.simulate(c2, fights, seed).dps - base.dps) / STEP[k];
      if (onStep) onStep(++i, total);
    }
    const SLOTKEY = { MainHand: 'mh', OffHand: 'oh', Ranged: 'ranged' };
    for (const s of slots) {
      const key = SLOTKEY[s], w = cfg[key];
      if (w && w.d1) {
        const w2 = Object.assign({}, w, { d1: w.d1 + 4 * w.ws, d2: w.d2 + 4 * w.ws });
        const c2 = Object.assign({}, cfg);
        c2[key] = w2;
        per['wdps_' + s] = (m.simulate(c2, fights, seed).dps - base.dps) / 4;
      }
      if (onStep) onStep(++i, total);
    }
    return { base, perPoint: per, unit: m.unit(cfg) };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GL;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
