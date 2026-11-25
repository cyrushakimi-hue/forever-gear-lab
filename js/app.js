/* Forever Gear Lab: page logic. Everything runs in the browser; uploaded files never leave it.
   Class rules and fight simulators come from js/classes/*.js through GearLab (js/core.js). */
'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GL = window.GearLab;
const U = GL.util;

const state = { items: {}, extra: {}, suf: null, cons: [], talents: {}, char: null, auction: null, realm: null, market: null, result: null, worker: null, reqId: 0, pending: {} };

const ARMOR_SLOTS = ['Head', 'Neck', 'Shoulder', 'Back', 'Chest', 'Wrist', 'Hands', 'Waist', 'Legs', 'Feet', 'Finger', 'Trinket'];
const ALL_SLOTS = ['Weapon', 'OffHand', 'Ranged'].concat(ARMOR_SLOTS);
const SLOT_LABEL = { Head: 'Head', Neck: 'Neck', Shoulder: 'Shoulder', Back: 'Back', Chest: 'Chest', Wrist: 'Wrist', Hands: 'Hands', Waist: 'Waist', Legs: 'Legs', Feet: 'Feet', Finger: 'Ring', Trinket: 'Trinket', Weapon: 'Weapon', OffHand: 'Off hand', Ranged: 'Ranged' };
const CHAR_SLOTS = { Head: ['Head'], Neck: ['Neck'], Shoulder: ['Shoulder'], Back: ['Back'], Chest: ['Chest'], Wrist: ['Wrist'], Hands: ['Hands'], Waist: ['Waist'], Legs: ['Legs'], Feet: ['Feet'], Finger: ['Finger1', 'Finger2'], Trinket: ['Trinket1', 'Trinket2'], Weapon: ['MainHand'], OffHand: ['OffHand'], Ranged: ['Ranged'] };
const ITEM_SLOTS = { Weapon: ['TwoHand', 'MainHand', 'OneHand'], OffHand: ['Shield', 'HeldOff', 'OffHand', 'OneHand'], Ranged: ['Ranged', 'Thrown', 'Relic'] };
const DAMAGE_NAME = { Weapon: 'MainHand', OffHand: 'OffHand', Ranged: 'Ranged' };
const POINT_IDX = { Head: 0, Chest: 0, Legs: 0, TwoHand: 0, Shoulder: 1, Hands: 1, Waist: 1, Feet: 1, Wrist: 2, Neck: 2, Finger: 2, Back: 2, Shield: 2, HeldOff: 2, MainHand: 3, OneHand: 3, OffHand: 3, Ranged: 4 };
const STAT_LABEL = { str: 'Str', agi: 'Agi', sta: 'Sta', int: 'Int', spi: 'Spi', ap: 'attack power', rap: 'ranged attack power', fap: 'feral attack power', sp: 'spell power', nat: 'nature power', fir: 'fire power', fro: 'frost power', sha: 'shadow power', arc: 'arcane power', hol: 'holy power', hit: '% hit', crit: '% crit', scrit: '% spell crit', shit: '% spell hit', heal: 'healing' };
const STAT_NAME = { str: 'Strength', agi: 'Agility', sta: 'Stamina', int: 'Intellect', spi: 'Spirit', ap: 'Attack power', rap: 'Ranged attack power', sp: 'Spell power', hit: '1% hit', crit: '1% crit', scrit: '1% spell crit', wdps_MainHand: '1 main-hand weapon dps', wdps_OffHand: '1 off-hand weapon dps', wdps_Ranged: '1 ranged weapon dps' };
const SCHOOLS = ['fir', 'fro', 'nat', 'sha', 'arc', 'hol'];
const PRIMARY = ['str', 'agi', 'sta', 'int', 'spi'];
// Which weapon types each class can use two-handed (Classic rules; a priest can use a one-hand mace but not a two-hand one).
const TWO_HAND_TYPES = { Priest: ['Staff'], Mage: ['Staff'], Warlock: ['Staff'], Druid: ['Staff', 'Mace'], Shaman: ['Staff', 'Axe', 'Mace'], Hunter: ['Axe', 'Sword', 'Polearm', 'Staff'],
  Paladin: ['Axe', 'Mace', 'Sword', 'Polearm'], Warrior: ['Axe', 'Mace', 'Sword', 'Polearm', 'Staff'], Rogue: [] };
// Starter weights, used only for a class whose simulator file is missing.
const FALLBACK_W = { str: 1, agi: 1, int: 0.5, ap: 0.5, sp: 0.5, hit: 8, crit: 8 };

// ---------- helpers ----------
function money(c) {
  c = Math.round(c || 0);
  const g = Math.floor(c / 10000), s = Math.floor(c / 100) % 100, k = c % 100;
  if (g) return g + 'g' + (s ? ' ' + s + 's' : '');
  if (s) return s + 's';
  return k + 'c';
}
function statText(st, w) {
  const parts = [];
  if (w && w.d1) parts.push(((w.d1 + w.d2) / 2 / w.ws).toFixed(1) + ' dps');
  for (const k in st || {}) if (st[k] && STAT_LABEL[k]) parts.push(/^(hit|crit|scrit|shit)$/.test(k) ? '+' + st[k] + STAT_LABEL[k] : '+' + st[k] + ' ' + STAT_LABEL[k]);
  return parts.join(', ');
}
function pct(x, digits) { const v = x * 100; return (v >= 0 ? '+' : '') + v.toFixed(digits == null ? 1 : digits) + '%'; }
function setStatus(id, text, kind) { const e = $(id); e.textContent = text || ''; e.className = 'status' + (kind ? ' ' + kind : ''); }
function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function getItem(id) { return state.items[id] || state.extra[id] || null; }
async function ensureItems(ids, onProgress) {
  const todo = ids.filter((i) => !getItem(i));
  let done = 0, failed = 0;
  const queue = todo.slice();
  async function work() {
    while (queue.length) {
      const id = queue.shift();
      try { const rec = await Parse.fetchItem(id); state.extra[id] = rec || { n: 'Item ' + id, s: null }; }
      catch (e) { failed++; }
      done++;
      if (onProgress) onProgress(done, todo.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, todo.length) }, work));
  if (todo.length) store('fgl-extra-items-v3', JSON.stringify(state.extra));
  return { fetched: todo.length - failed, failed };
}

// ---------- worker ----------
function call(op, payload) {
  return new Promise((resolve, reject) => {
    const id = ++state.reqId;
    state.pending[id] = { resolve, reject, onProgress: payload && payload.onProgress };
    const msg = Object.assign({ id, op }, payload || {});
    delete msg.onProgress;
    state.worker.postMessage(msg);
  });
}
function startWorker() {
  state.worker = new Worker('js/worker.js');
  state.worker.onmessage = (e) => {
    const m = e.data, p = state.pending[m.id];
    if (!p) return;
    if (m.progress != null) { if (p.onProgress) p.onProgress(m.progress); return; }
    delete state.pending[m.id];
    if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error));
  };
  return call('ping', {});
}

// ---------- character model ----------
function suffixStats(rec, suffixId) {
  const s = state.suf.suffixes[suffixId];
  const row = state.suf.points[rec.il];
  if (!s || !row || POINT_IDX[rec.s] == null) return null;
  const pts = (rec.q >= 4 ? row.e : rec.q === 3 ? row.s : row.g)[POINT_IDX[rec.s]];
  const st = {};
  for (const k in s.st) { const v = Math.round(pts * s.st[k]); if (v) st[k] = v; }
  return { name: s.n, st };
}
function equippedRecord(entry) {
  if (!entry) return null;
  const base = getItem(entry.id);
  const rec = Object.assign({ n: entry.name || ('Item ' + entry.id), st: {} }, base || {});
  rec.id = entry.id;
  rec.st = Object.assign({}, rec.st || {});
  rec.unknownStats = false;
  if (entry.fromLines) {
    rec.st = entry.fromLines.st;
    if (entry.fromLines.d1) { rec.d1 = entry.fromLines.d1; rec.d2 = entry.fromLines.d2; rec.ws = entry.fromLines.ws || rec.ws; }
    if (entry.name) rec.n = entry.name;
  } else if (rec.rd) {
    const sx = entry.suffix ? suffixStats(rec, entry.suffix) : null;
    if (sx) { for (const k in sx.st) rec.st[k] = (rec.st[k] || 0) + sx.st[k]; rec.n = rec.n + ' ' + sx.name; }
    else rec.unknownStats = true;
  }
  return rec;
}
function buildChar(c) {
  const eq = {};
  for (const slot in c.slots) eq[slot] = equippedRecord(c.slots[slot]);
  const gear = {};
  for (const slot in eq) for (const k in eq[slot].st || {}) gear[k] = (gear[k] || 0) + eq[slot].st[k];
  let totals;
  const sheet = c.sheet;
  if (sheet && sheet.str) {
    totals = {};
    for (const k of PRIMARY) totals[k] = +sheet[k] || 0;
  } else {
    const b = U.baseStats(c.cls, c.race, c.level);
    totals = {};
    for (const k of PRIMARY) totals[k] = b[k] + (gear[k] || 0);
  }
  return { eq, gear, totals, estimated: !(sheet && sheet.str) };
}
function weaponOf(rec) {
  if (!rec || !rec.d1) return null;
  return { d1: rec.d1, d2: rec.d2, ws: rec.ws, type: rec.wt || null, twoHand: rec.s === 'TwoHand', pr: rec.pr || null, fx: rec.fx || null };
}
// Simulator input for the character with some character slots swapped: changes = { MainHand: rec|null, ... }
function simConfig(model, changes, opts, extra) {
  const c = state.char;
  const t = Object.assign({}, model.totals);
  const g = Object.assign({}, model.gear);
  const eq = Object.assign({}, model.eq);
  for (const slot in changes || {}) {
    const old = model.eq[slot], neu = changes[slot];
    for (const k in (old && old.st) || {}) { g[k] = (g[k] || 0) - old.st[k]; if (k in t) t[k] -= old.st[k]; }
    for (const k in (neu && neu.st) || {}) { g[k] = (g[k] || 0) + neu.st[k]; if (k in t) t[k] += neu.st[k]; }
    eq[slot] = neu;
  }
  for (const k in extra || {}) { if (k in t) t[k] += extra[k]; else g[k] = (g[k] || 0) + extra[k]; }
  const school = {};
  for (const s of SCHOOLS) if (g[s]) school[s] = g[s];
  const cfg = { level: c.level, race: c.race, str: t.str, agi: t.agi, sta: t.sta, int: t.int, spi: t.spi,
    ap: g.ap || 0, rap: g.rap || 0, fap: g.fap || 0, sp: g.sp || 0, school, heal: g.heal || 0, hit: g.hit || 0, crit: g.crit || 0, scrit: g.scrit || 0, spellHit: g.shit || 0,
    mh: weaponOf(eq.MainHand), oh: weaponOf(eq.OffHand), ranged: weaponOf(eq.Ranged), shield: !!(eq.OffHand && eq.OffHand.s === 'Shield'),
    talents: c.talentMap || {}, style: opts.style, sheet: null };
  if (c.sheet && c.sheet.crit != null) cfg.sheet = { crit: +c.sheet.crit, spellCrit: c.sheet.spellCrit != null ? +c.sheet.spellCrit : null, agi: model.totals.agi, int: model.totals.int, critGear: model.gear.crit || 0, scritGear: model.gear.scrit || 0 };
  return cfg;
}

// ---------- what a character can use ----------
function canUse(rec, c, mod, opts, slot) {
  if (!rec || !rec.s) return false;
  if (rec.cl && rec.cl.indexOf(c.cls) < 0) return false;
  if ((rec.rq || 0) > c.level + (opts.nextLevel ? 1 : 0)) return false;
  if (rec.fac && ((rec.fac === 2) !== (U.HORDE.indexOf(c.race) >= 0))) return false;
  const armor = mod ? mod.armor(c.level) : 'CLMP';
  if (rec.at) {
    if (armor.indexOf(rec.at) < 0) return false;
    if (rec.at === 'C' && !opts.cloth && armor !== 'C' && ARMOR_SLOTS.indexOf(rec.s) >= 0 && rec.s !== 'Back') return false;
  }
  if (!mod) return true;
  const melee = ['TwoHand', 'MainHand', 'OneHand', 'OffHand'].indexOf(rec.s) >= 0;
  if (melee && rec.wt && mod.weapons.indexOf(rec.wt) < 0) return false;
  if (rec.s === 'TwoHand' && mod.twoHand === false) return false;
  if (rec.s === 'TwoHand' && rec.wt && TWO_HAND_TYPES[c.cls] && TWO_HAND_TYPES[c.cls].indexOf(rec.wt) < 0) return false;
  if (rec.s === 'Shield' && !mod.shield) return false;
  if ((rec.s === 'Ranged' || rec.s === 'Thrown') && (mod.rangedTypes || []).indexOf(rec.wt) < 0) return false;
  if (slot === 'OffHand' && (rec.s === 'OneHand' || rec.s === 'OffHand') && !mod.dualWield(c.level, c.talentMap || {})) return false;
  if (slot === 'Weapon' && rec.s === 'OffHand') return false;
  return true;
}
function value(st, W) { let v = 0; for (const k in st || {}) if (W[k]) v += W[k] * st[k]; return v; }

// ---------- the analysis ----------
async function analyse() {
  const c = state.char, mk = state.market;
  const mod = GL.classes[c.cls] || null;
  const opts = { budget: Math.max(0, parseFloat($('#budget').value) || 0) * 10000, style: $('#style').value || (mod && mod.styles[0].id), nextLevel: $('#nextLevel').checked,
    cloth: $('#cloth').checked, skipWeapon: $('#skipWeapon').checked, maxAge: Math.max(0, parseInt($('#maxAge').value, 10) || 0) };
  const prog = (t, f) => { $('#progressText').textContent = t; $('#progressBar').style.transform = 'scaleX(' + Math.max(0, Math.min(1, f || 0)).toFixed(3) + ')'; };
  $('#progress').hidden = false;
  prog('Looking up your equipped items', 0.02);
  await ensureItems(Object.values(c.slots).map((s) => s.id));
  const model = buildChar(c);
  const res = { opts, model, cls: c.cls, sim: !!mod, notes: [], mod, unitDps: 1 };

  // 1. what each stat is worth
  let W, baseDps = null, baseCfg = null;
  if (mod) {
    baseCfg = simConfig(model, {}, opts);
    prog('Simulating your character', 0.05);
    const w = await call('weights', { cls: c.cls, cfg: baseCfg, fights: 100000, seed: 11, onProgress: (p) => prog('Working out what each stat is worth', 0.05 + 0.33 * p) });
    const per = w.perPoint;
    baseDps = w.base.dps;
    const u = per[w.unit] > 0 ? per[w.unit] : baseDps / 1000;
    res.unitDps = u;
    W = {};
    for (const k in per) W[k] = per[k] / u;
    for (const s of mod.schools(baseCfg)) W[s] = W.sp || 0;
    res.base = w.base; res.unit = w.unit;
    for (const n of w.base.notes || []) res.notes.push(n);
    if (!Object.keys(c.talentMap || {}).length) res.notes.push('No talents were found in this export, so the fights assume none.');
    res.spec = mod.detectSpec(c.talentMap || {}, c.level);
  } else {
    W = Object.assign({}, FALLBACK_W);
    res.notes.push('There is no fight simulator for ' + c.cls + ' in this copy of the site, so gear is ranked with rough starter weights.');
  }
  res.W = W;

  // 2. listings per slot
  const fresh = mk.newestDay - opts.maxAge;
  const listed = {}, randoms = {};
  let unknown = 0;
  for (const id in mk.items) {
    const L = mk.items[id];
    if (L.day < fresh) continue;
    const rec = getItem(id);
    if (!rec) { unknown++; continue; }
    if (!rec.s) continue;
    const row = Object.assign({ id: +id, price: L.price, qty: L.qty, day: L.day, hist: L.hist }, rec);
    if (rec.rd) (randoms[rec.s] = randoms[rec.s] || []).push(row);
    else (listed[rec.s] = listed[rec.s] || []).push(row);
  }
  res.unknown = unknown;
  const curOff = model.eq.OffHand || null;
  const curTwo = !!(model.eq.MainHand && model.eq.MainHand.s === 'TwoHand');

  // 3. candidates per slot. Stat slots are valued by weights; weapon slots that feed damage are simulated.
  const slots = [], simJobs = [];
  const changeFor = (slot, r) => {
    if (slot === 'Weapon') return r.s === 'TwoHand' ? { MainHand: r, OffHand: null } : { MainHand: r };
    if (slot === 'OffHand') return { OffHand: r };
    if (slot === 'Ranged') return { Ranged: r };
    return null;
  };
  const feedsDamage = (slot, r) => {
    if (!mod || !DAMAGE_NAME[slot] || !r.d1) return false;
    return mod.damageSlots(simConfig(model, changeFor(slot, r), opts)).indexOf(DAMAGE_NAME[slot]) >= 0;
  };
  for (const slot of ALL_SLOTS) {
    const charSlots = CHAR_SLOTS[slot];
    let cur = null, curSlot = charSlots[0], curV = Infinity;
    for (const cs of charSlots) {
      const r = model.eq[cs];
      const v = r ? value(r.st, W) : 0;
      if (v < curV) { curV = v; cur = r || null; curSlot = cs; }
    }
    if (curV === Infinity) curV = 0;
    const equippedIds = charSlots.map((cs) => model.eq[cs] && model.eq[cs].id);
    const itemSlots = ITEM_SLOTS[slot] || [slot];
    const pool = [];
    for (const is of itemSlots) for (const r of listed[is] || []) if (equippedIds.indexOf(r.id) < 0 && canUse(r, c, mod, opts, slot)) pool.push(r);
    const S = { slot, charSlot: curSlot, cur, curV, cands: [], unknownCur: !!(cur && cur.unknownStats), simulated: false, skipped: null };
    if (slot === 'OffHand' && curTwo) { S.skipped = 'your weapon is two-handed'; slots.push(S); continue; }
    if (slot !== 'Weapon' && ITEM_SLOTS[slot] && !cur && !pool.length) { S.skipped = 'nothing usable is listed'; slots.push(S); continue; }
    const dmgKey = DAMAGE_NAME[slot] ? 'wdps_' + DAMAGE_NAME[slot] : null;
    const wW = dmgKey && W[dmgKey] ? W[dmgKey] : 0;
    const rough = (r) => value(r.st, W) + (r.d1 ? wW * ((r.d1 + r.d2) / 2 / r.ws) : 0) + (r.pr && wW ? wW * ((r.pr.d + r.pr.dot) * r.pr.ppm / 60) : 0);
    const curRough = cur ? rough(cur) : 0;
    const needSim = pool.filter((r) => feedsDamage(slot, r));
    for (const r of pool) {
      if (needSim.indexOf(r) >= 0) continue;
      let gain = value(r.st, W) - curV;
      if (slot === 'Weapon' && r.s === 'TwoHand' && curOff) gain -= value(curOff.st, W);
      if (gain > 0.3) S.cands.push(Object.assign({ gain }, r));
    }
    if (needSim.length) {
      S.simulated = true;
      const top = needSim.map((r) => Object.assign({ rough: rough(r) - (slot === 'Weapon' && r.s === 'TwoHand' && curOff ? rough(curOff) : 0) }, r))
        .filter((r) => r.rough > curRough * 0.75).sort((a, b) => b.rough - a.rough).slice(0, 14);
      for (const r of top) simJobs.push({ S, r, cfg: simConfig(model, changeFor(slot, r), opts) });
    } else if (mod && DAMAGE_NAME[slot] && mod.damageSlots(baseCfg).indexOf(DAMAGE_NAME[slot]) >= 0) S.simulated = true;
    slots.push(S);
  }
  // free weapons from quests and dungeons, for the slots that feed damage
  const free = [];
  if (mod) {
    const dmgSlots = mod.damageSlots(baseCfg);
    for (const slot of ['Weapon', 'Ranged']) {
      if (dmgSlots.indexOf(DAMAGE_NAME[slot]) < 0) continue;
      const cur = model.eq[CHAR_SLOTS[slot][0]];
      const curDps = cur && cur.d1 ? (cur.d1 + cur.d2) / 2 / cur.ws : 0;
      let list = [];
      for (const id in state.items) {
        const r = state.items[id];
        if (!r.src || !r.d1 || ITEM_SLOTS[slot].indexOf(r.s) < 0) continue;
        if ((r.rq || 0) > c.level + 5 || (r.il || 0) > c.level + 11 || (r.il || 0) < c.level - 2) continue;
        if (/^Drop: Trash|World Drop|^Crafted|^Vendor/.test(r.src)) continue;
        if (!r.bop && !/^Quest/.test(r.src)) continue;
        if (!canUse(Object.assign({}, r, { rq: 0 }), c, mod, { cloth: true }, slot)) continue;
        if (cur && +id === cur.id) continue;
        const dps = (r.d1 + r.d2) / 2 / r.ws;
        if (dps < curDps * 0.9) continue;
        list.push(Object.assign({ id: +id, slotName: slot, rough: dps * 14 + value(r.st, W) }, r));
      }
      list = list.sort((a, b) => b.rough - a.rough).slice(0, 8);
      for (const r of list) { free.push(r); simJobs.push({ free: r, cfg: simConfig(model, changeFor(slot, r), opts) }); }
    }
  }
  if (simJobs.length) {
    const out = await call('batch', { cls: c.cls, cfgs: [baseCfg].concat(simJobs.map((j) => j.cfg)), fights: 50000, seed: 5, onProgress: (p) => prog('Trying every weapon', 0.4 + 0.36 * p) });
    const b = out[0].dps;
    simJobs.forEach((j, i) => {
      const gain = (out[1 + i].dps - b) / res.unitDps;
      if (j.free) { j.free.gain = gain; return; }
      if (gain > 0.5) j.S.cands.push(Object.assign({}, j.r, { gain }));
    });
  }
  for (const S of slots) S.cands.sort((a, b) => b.gain - a.gain);
  res.freeWeapons = free.filter((r) => r.gain > 0.5).sort((a, b) => b.gain - a.gain);

  // 4. best set within the budget (one item per slot)
  const minGain = mod ? 0.0075 * baseDps / res.unitDps : 4;
  const unitCost = Math.max(100, Math.ceil(opts.budget / 4000 / 100) * 100);
  const B = Math.floor(opts.budget / unitCost);
  let best = new Map([[0, { v: 0, picks: [] }]]);
  for (const S of slots) {
    if (S.skipped || (opts.skipWeapon && S.simulated)) continue;
    const next = new Map(best);
    for (const [cost, cur] of best) {
      for (const r of S.cands) {
        if (r.gain < minGain) continue;
        const c2 = cost + Math.ceil(r.price / unitCost);
        if (c2 > B) continue;
        const v2 = cur.v + r.gain;
        const ex = next.get(c2);
        if (!ex || ex.v < v2) next.set(c2, { v: v2, picks: cur.picks.concat([[S.slot, r]]) });
      }
    }
    best = next;
  }
  let top = { v: 0, picks: [] };
  for (const [, cur] of best) if (cur.v > top.v + 1e-9) top = cur;
  const picks = {};
  for (const [slot, r] of top.picks) picks[slot] = r;
  if (picks.Weapon && picks.Weapon.s === 'TwoHand') delete picks.OffHand;
  res.slots = slots.map((S) => Object.assign({}, S, { pick: picks[S.slot] || null }));
  res.cost = Object.values(picks).reduce((a, r) => a + r.price, 0);

  // 5. random-stat greens worth searching for
  res.randoms = [];
  for (const S of res.slots) {
    if (ARMOR_SLOTS.indexOf(S.slot) < 0 || S.slot === 'Trinket') continue;
    const list = (randoms[S.slot] || []).filter((r) => state.suf.points[r.il] && canUse(r, c, mod, opts, S.slot)).sort((a, b) => (b.il - a.il) || (a.price - b.price));
    if (!list.length) continue;
    const r = list[0];
    let bestS = null;
    for (const sid of state.suf.common) {
      const sx = suffixStats(r, sid);
      if (!sx) continue;
      const v = value(sx.st, W) - S.curV;
      if (!bestS || v > bestS.gain) bestS = { gain: v, name: sx.name, st: sx.st };
    }
    const pickGain = S.pick ? S.pick.gain : 0;
    if (bestS && bestS.gain > Math.max(minGain * 0.6, pickGain + 0.5)) res.randoms.push({ slot: S.slot, base: r, suffix: bestS });
  }

  // 6. cheap buffs
  const byType = {};
  for (const k of state.cons) {
    const L = mk.items[k.id];
    if (!L || L.day < fresh || k.lv > c.level || k.t === 'potion') continue;
    const v = value(k.st, W);
    if (v <= 0) continue;
    if (!byType[k.t] || v > byType[k.t].gain + 0.01 || (Math.abs(v - byType[k.t].gain) < 0.01 && L.price < byType[k.t].price)) byType[k.t] = { gain: v, price: L.price, n: k.n, st: k.st, t: k.t };
  }
  res.cons = Object.values(byType);

  // 7. check the whole set in the simulator
  if (mod) {
    const changes = {};
    for (const S of res.slots) if (S.pick) Object.assign(changes, changeFor(S.slot, S.pick) || { [S.charSlot]: S.pick });
    const consSt = {};
    for (const k of res.cons) for (const x in k.st) consSt[x] = (consSt[x] || 0) + k.st[x];
    const cfgs = [baseCfg, simConfig(model, changes, opts), simConfig(model, changes, opts, consSt)];
    const out = await call('batch', { cls: c.cls, cfgs, fights: 150000, seed: 9, onProgress: (p) => prog('Checking the full set', 0.78 + 0.2 * p) });
    res.total = { before: out[0], after: out[1], afterCons: out[2] };
  }
  res.gainPct = (g) => (mod ? g * res.unitDps / baseDps : null);
  prog('Done', 1);
  setTimeout(() => { $('#progress').hidden = true; }, 400);
  state.result = res;
  render(res);
}

// ---------- rendering ----------
const CLASS_COLOR = { Warrior: '#c79c6e', Paladin: '#f58cba', Hunter: '#abd473', Rogue: '#fff569', Priest: '#ffffff', Shaman: '#4a9bff', Mage: '#69ccf0', Warlock: '#a99be0', Druid: '#ff7d0a' };
function coins(c) {
  c = Math.round(c || 0);
  const g = Math.floor(c / 10000), s = Math.floor(c / 100) % 100, k = c % 100;
  const parts = [], words = [];
  if (g) { parts.push(g + '<i class="g"></i>'); words.push(g + ' gold'); }
  if (s || (g && k)) { parts.push(s + '<i class="s"></i>'); words.push(s + ' silver'); }
  if (!g && (k || !s)) { parts.push(k + '<i class="c"></i>'); words.push(k + ' copper'); }
  return '<span class="money" role="img" aria-label="' + words.join(' ') + '">' + parts.join('') + '</span>';
}
function itemName(r) { return '<span class="name q' + (r.q || 1) + '">' + esc(r.n) + '</span>'; }
function gainText(res, g) { const p = res.gainPct(g); return p == null ? '+' + g.toFixed(1) + ' pts' : pct(p); }
function gainCell(res, g, max) { return '<span class="up">' + gainText(res, g) + '</span><span class="bar"><i style="width:' + Math.max(3, Math.min(100, (g / max) * 100)).toFixed(0) + '%"></i></span>'; }
function priceNote(r) {
  if (!r.hist || r.hist.length < 3) return '';
  const xs = r.hist.map((h) => h[1]).sort((a, b) => a - b);
  const med = xs[Math.floor(xs.length / 2)];
  if (r.price > med * 1.4) return ' <span class="flag" title="Usual price about ' + money(med) + '">priced above usual</span>';
  if (r.price < med * 0.6) return ' <span class="up small" title="Usual price about ' + money(med) + '">priced below usual</span>';
  return '';
}
// An item drawn the way the game's tooltip lists it: one fact per line, full stat names.
const FULL_STAT = { str: 'Strength', agi: 'Agility', sta: 'Stamina', int: 'Intellect', spi: 'Spirit' };
const SLOT_WORD = { TwoHand: 'Two-Hand', MainHand: 'Main Hand', OneHand: 'One-Hand', OffHand: 'Off Hand', HeldOff: 'Held In Off-hand', Shield: 'Off Hand', Trinket: 'Trinket', Finger: 'Finger' };
const ARMOR_WORD = { C: 'Cloth', L: 'Leather', M: 'Mail', P: 'Plate' };
const SCHOOL_WORD = { nat: 'Nature', fir: 'Fire', fro: 'Frost', sha: 'Shadow', arc: 'Arcane', hol: 'Holy' };
function tooltip(r, c, extra) {
  const st = r.st || {};
  let h = '<div class="tt">' + itemName(r);
  const left = SLOT_WORD[r.s] || r.s || '';
  const right = r.wt || (r.s === 'Shield' ? 'Shield' : ARMOR_WORD[r.at] || '');
  if (left) h += '<div class="lr"><span>' + esc(left) + '</span><span>' + esc(right) + '</span></div>';
  if (r.d1) h += '<div class="lr"><span>' + r.d1 + ' - ' + r.d2 + ' Damage</span><span>Speed ' + (+r.ws).toFixed(2) + '</span></div><div>(' + ((r.d1 + r.d2) / 2 / r.ws).toFixed(1) + ' damage per second)</div>';
  if (r.ar) h += '<div>' + r.ar + ' Armor</div>';
  for (const k of PRIMARY) if (st[k]) h += '<div>+' + st[k] + ' ' + FULL_STAT[k] + '</div>';
  if (r.rd && !PRIMARY.some((k) => st[k])) h += '<div class="eq">&lt;Random enchantment&gt;</div>';
  if (st.ap) h += '<div class="eq">Equip: +' + st.ap + ' Attack Power.</div>';
  if (st.rap) h += '<div class="eq">Equip: +' + st.rap + ' ranged Attack Power.</div>';
  if (st.sp) h += '<div class="eq">Equip: Increases damage and healing done by magical spells and effects by up to ' + st.sp + '.</div>';
  for (const k in SCHOOL_WORD) if (st[k]) h += '<div class="eq">Equip: Increases damage done by ' + SCHOOL_WORD[k] + ' spells and effects by up to ' + st[k] + '.</div>';
  if (st.heal) h += '<div class="eq">Equip: Increases healing done by spells and effects by up to ' + st.heal + '.</div>';
  if (st.hit) h += '<div class="eq">Equip: Improves your chance to hit by ' + st.hit + '%.</div>';
  if (st.crit) h += '<div class="eq">Equip: Improves your chance to get a critical strike by ' + st.crit + '%.</div>';
  if (st.scrit) h += '<div class="eq">Equip: Improves your chance to get a critical strike with spells by ' + st.scrit + '%.</div>';
  if (r.pr) h += '<div class="eq">Chance on hit: Deals about ' + Math.round((r.pr.d || 0) + (r.pr.dot || 0)) + ' extra damage.</div>';
  else if (r.fx) h += '<div class="eq">Equip: ' + esc(r.fx) + '.</div>';
  if (r.rq) h += '<div' + (r.rq > c.level ? ' class="no"' : '') + '>Requires Level ' + r.rq + '</div>';
  return h + (extra || '') + '</div>';
}

function render(res) {
  const c = state.char, mod = res.mod;
  const out = $('#results');
  out.hidden = false;
  out.className = '';
  const gainHead = res.sim ? 'Damage gain' : 'Stat value';
  const maxGain = Math.max(1, ...res.slots.map((s) => (s.cands[0] ? s.cands[0].gain : 0)));
  let h = '';

  // the answer in one sentence
  h += '<section class="plate verdict">';
  if (res.total) {
    const g = res.total.after.dps / res.total.before.dps - 1, g2 = res.total.afterCons.dps / res.total.before.dps - 1;
    if (res.cost > 0) h += 'Spend ' + coins(res.cost) + ' of your ' + coins(res.opts.budget) + ' for <b class="up">' + pct(g) + ' damage</b> <span class="tan">(' + res.total.before.dps.toFixed(0) + ' to ' + res.total.after.dps.toFixed(0) + ' dps, a kill every ' + res.total.after.ttk.toFixed(1) + ' s).</span>';
    else h += 'Nothing listed is worth buying within ' + coins(res.opts.budget) + '. <span class="tan">You deal about ' + res.total.before.dps.toFixed(0) + ' dps now.</span>';
    if (res.cons.length && g2 > g + 0.002) h += ' Food, elixir and scroll take it to <b class="up">' + pct(g2) + '</b>.';
    h += ' <a class="small" href="#trust">Simulated, not measured in game.</a>';
  } else {
    const tot = res.slots.reduce((a, s) => a + (s.pick ? s.pick.gain : 0), 0);
    h += 'Spend ' + coins(res.cost) + ' of your ' + coins(res.opts.budget) + ' for about +' + tot.toFixed(0) + ' stat value <span class="tan">(rough weights, no simulation for this class).</span>';
  }
  h += '</section>';

  // the character as simulated
  if (mod && res.base) {
    const styleName = (mod.styles.find((s) => s.id === res.opts.style) || mod.styles[0]).name;
    h += '<section class="plate sheet"><div class="who" style="color:' + (CLASS_COLOR[c.cls] || 'var(--ink)') + '">' + esc(c.name) + '<small>Level ' + c.level + ' ' + esc(c.race) + ' ' + esc(c.cls) + (res.spec ? ' · ' + esc(res.spec.name) : '') + (mod.styles.length > 1 ? ' · ' + esc(styleName) : '') + '</small></div>';
    h += '<p class="dim small" style="margin:6px 0 0;max-width:75ch">' + esc(mod.about) + '</p><dl class="statlist">';
    for (const k in res.base.info || {}) h += '<div><dt>' + esc(k) + '</dt><dd>' + esc(res.base.info[k]) + '</dd></div>';
    h += '</dl>';
    const sh = Object.entries(res.base.share || {}).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
    if (sh.length) {
      h += '<p class="tan small" style="margin:14px 0 0">Where your damage comes from now</p><div class="stack">';
      sh.forEach(([k, v], i) => { h += '<i class="s' + (i % 6) + '" style="width:' + (v * 100).toFixed(1) + '%" title="' + esc(k) + ' ' + Math.round(v * 100) + '%"></i>'; });
      h += '</div><div class="legend">';
      sh.forEach(([k, v], i) => { h += '<span><i class="s' + (i % 6) + '"></i>' + esc(k) + ' ' + Math.round(v * 100) + '%</span>'; });
      h += '</div>';
    }
    h += '</section>';
  }
  const notes = res.notes.slice();
  if (res.model.estimated && res.sim) notes.push('Base stats are estimated because this export has no character sheet. The GearLabExport addon gives exact numbers.');
  if (notes.length) h += '<ul class="plate notes">' + notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>';

  // keep or buy
  h += '<h2>Keep or buy</h2><ul class="plate slots">';
  for (const s of res.slots) {
    if (s.skipped && !s.cur) continue;
    const p = s.pick;
    if (p) {
      const better = s.simulated && res.freeWeapons.length && res.freeWeapons[0].gain > p.gain && res.freeWeapons[0].slotName === s.slot ? res.freeWeapons[0] : null;
      h += '<li class="slot buy"><div class="lab">' + SLOT_LABEL[s.slot] + '<span class="do">Buy</span></div><div class="tip">' + tooltip(p, c) + (priceNote(p) ? '<div>' + priceNote(p) + '</div>' : '') +
        (better ? '<div class="flag">A free weapon beats this: ' + esc(better.n) + ' (' + esc(better.src) + ')</div>' : '') +
        '<div class="gray">Replaces ' + (s.cur ? esc(s.cur.n) : 'an empty slot') + (s.unknownCur ? '. Its random stats are unknown, so the gain may be overstated.' : '') + '</div></div>' +
        '<div class="price">' + coins(p.price) + '<div class="gray small">' + p.qty + ' listed</div></div><div class="gain">' + gainCell(res, p.gain, maxGain) + '</div></li>';
    } else {
      let why = '';
      if (s.skipped) why = s.skipped;
      else if (res.opts.skipWeapon && s.simulated) why = 'Weapons skipped, as you asked.';
      else if (s.cands.length) why = 'Best listing: ' + esc(s.cands[0].n) + ' at ' + money(s.cands[0].price) + '. Not worth it within this budget.';
      h += '<li class="slot keep"><div class="lab">' + SLOT_LABEL[s.slot] + '<span class="do">Keep</span></div><div class="tip">' + (s.cur ? itemName(s.cur) + '<div>' + esc(statText(s.cur.st, s.cur.d1 ? s.cur : null)) + '</div>' : '<span class="gray">Empty</span>') +
        (why ? '<div class="gray">' + why + '</div>' : '') + '</div><div class="price gray">–</div><div class="gain gray">no change</div></li>';
    }
  }
  h += '</ul><p class="after"><button id="copyDiscord" class="btn">Copy as text for Discord</button> <span id="copyMsg" class="status"></span></p>';

  if (res.freeWeapons && res.freeWeapons.length) {
    h += '<h2>Free weapons from quests and dungeons</h2><p class="tan" style="max-width:75ch">Often better than anything listed. Quest rewards carry no level requirement, so check the level of the quest.</p><div class="plate scroll"><table class="ledger"><thead><tr><th>Weapon</th><th>Where</th><th class="r">' + gainHead + '</th></tr></thead><tbody>';
    for (const r of res.freeWeapons) h += '<tr><td class="tip">' + tooltip(r, c) + '</td><td class="tan">' + esc(r.src) + '</td><td class="r up">' + gainText(res, r.gain) + '</td></tr>';
    h += '</tbody></table></div>';
  }

  if (res.cons.length) {
    h += '<h2>Cheap buffs</h2><div class="plate scroll"><table class="ledger"><thead><tr><th>Type</th><th>Item</th><th class="r">Price each</th><th class="r">' + gainHead + '</th></tr></thead><tbody>';
    for (const k of res.cons) h += '<tr><td class="tan">' + k.t[0].toUpperCase() + k.t.slice(1) + '</td><td class="tip"><span class="name q1">' + esc(k.n) + '</span><div class="eq">' + esc(statText(k.st)) + '</div></td><td class="r">' + coins(k.price) + '</td><td class="r up">' + gainText(res, k.gain) + '</td></tr>';
    h += '</tbody></table></div>';
  }

  if (res.randoms.length) {
    h += '<h2>Random-stat greens to search for</h2><p class="tan" style="max-width:75ch">The scan only knows the cheapest price of any suffix, so search these names at the auction house.</p><div class="plate scroll"><table class="ledger"><thead><tr><th>Slot</th><th>Search for</th><th class="r">Any suffix from</th><th class="r">' + gainHead + '</th></tr></thead><tbody>';
    for (const x of res.randoms) h += '<tr><td class="tan">' + SLOT_LABEL[x.slot] + '</td><td class="tip"><span class="name q2">' + esc(x.base.n) + ' ' + esc(x.suffix.name) + '</span><div>' + esc(statText(x.suffix.st)) + '</div></td><td class="r">' + coins(x.base.price) + '</td><td class="r up">' + gainText(res, x.suffix.gain) + '</td></tr>';
    h += '</tbody></table></div>';
  }

  h += '<h2>Every option, slot by slot</h2><div class="tips">';
  const empty = [];
  for (const s of res.slots) {
    if (s.skipped) continue;
    if (!s.cands.length) { empty.push(SLOT_LABEL[s.slot]); continue; }
    h += '<section class="plate tipcard"><h3>' + SLOT_LABEL[s.slot] + (s.simulated ? '<small>simulated</small>' : '') + '</h3><div class="tip gray" style="padding-bottom:10px">Equipped: ' + (s.cur ? itemName(s.cur) + ' ' + esc(statText(s.cur.st, s.cur.d1 ? s.cur : null)) : 'nothing') + '</div>';
    for (const r of s.cands.slice(0, 5)) {
      h += '<div class="opt"><div class="line"><span>' + coins(r.price) + (s.pick && s.pick.id === r.id ? ' <span class="flag" style="color:var(--gold)">my pick</span>' : '') + '</span><span class="up">' + gainText(res, r.gain) + '</span></div>' + tooltip(r, c) + '</div>';
    }
    h += '</section>';
  }
  h += '</div>';
  if (empty.length) h += '<p class="dim small" style="margin-top:12px">Nothing better is listed for: ' + esc(empty.join(', ')) + '.</p>';

  h += '<h2>What each stat is worth to you</h2><p class="tan" style="max-width:75ch">' + (res.sim ? 'From the simulator, for this character and playstyle, in points of ' + (res.unit === 'sp' ? 'spell power' : 'attack power') + '.' : 'Rough starter weights.') + '</p><div class="plate weights">';
  const keys = Object.keys(res.W).filter((k) => STAT_NAME[k] && Math.abs(res.W[k]) >= 0.005).sort((a, b) => res.W[b] - res.W[a]);
  for (const k of keys) h += '<div><span>' + STAT_NAME[k] + '</span><span>' + (+res.W[k]).toFixed(2) + '</span></div>';
  h += '</div>';
  if (res.unknown) h += '<p class="dim small" style="margin-top:14px">' + res.unknown + ' listed items are not in the built-in item list (mostly materials). <button id="lookup" class="linkbtn">Look them up on Wowhead</button> <span id="lookupMsg" class="status"></span></p>';
  out.innerHTML = h;
  void out.offsetWidth;
  out.className = 'reveal';
  $('#copyDiscord').onclick = () => copyDiscord(res);
  if ($('#lookup')) $('#lookup').onclick = lookupUnknown;
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function discordText(res) {
  const c = state.char;
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  const lpad = (s, n) => (' '.repeat(n) + s).slice(-n);
  let t = '```\n' + c.name.toUpperCase() + ' - keep or buy (' + (res.spec ? res.spec.name.toLowerCase() + ' ' : '') + c.cls.toLowerCase() + ', level ' + c.level + ')\n\n';
  t += pad('Slot', 9) + pad('Do', 6) + pad('Item', 30) + lpad('Price', 8) + '\n';
  for (const s of res.slots) {
    if (!s.pick && !s.cur) continue;
    const p = s.pick;
    const name = p ? p.n + ((p.rq || 0) > c.level ? ' (lvl ' + p.rq + ')' : '') : s.cur.n;
    t += pad(SLOT_LABEL[s.slot], 9) + pad(p ? 'BUY' : 'KEEP', 6) + pad(name, 30) + lpad(p ? money(p.price) : '-', 8) + '\n';
  }
  t += lpad('TOTAL ' + money(res.cost), 53) + '\n';
  if (res.total) t += '\nDamage gain: ' + pct(res.total.after.dps / res.total.before.dps - 1) + ' from gear, ' + pct(res.total.afterCons.dps / res.total.before.dps - 1) + ' with buffs.\n';
  if (res.cons.length) t += 'Buffs: ' + res.cons.map((k) => k.n + ' (' + money(k.price) + ')').join(', ') + '\n';
  if (res.freeWeapons && res.freeWeapons.length) { const f = res.freeWeapons[0]; t += 'Free weapon to aim for: ' + f.n + ' - ' + f.src + '\n'; }
  return t + '```';
}
async function copyDiscord(res) {
  const text = discordText(res);
  try { await navigator.clipboard.writeText(text); setStatus('#copyMsg', 'Copied. Paste it into Discord.', 'ok'); }
  catch (e) { const ta = $('#discordOut'); ta.hidden = false; ta.value = text; ta.select(); setStatus('#copyMsg', 'Select the text below and copy it.', ''); }
}
async function lookupUnknown() {
  const ids = Object.keys(state.market.items).filter((i) => !getItem(i)).slice(0, 600);
  setStatus('#lookupMsg', 'Looking up ' + ids.length + ' items…');
  const r = await ensureItems(ids, (d, n) => setStatus('#lookupMsg', d + ' of ' + n));
  setStatus('#lookupMsg', 'Added ' + r.fetched + ' items. Press Find upgrades again to include them.', 'ok');
}

// ---------- character and prices ----------
function showChar() {
  const c = state.char;
  const mod = GL.classes[c.cls] || null;
  const T = state.talents[c.cls];
  c.talentMap = Object.keys(c.talents).length ? c.talents : (T && c.talentString ? Parse.talentsFromString(c.talentString, T.order, T.trees) : {});
  const spec = mod ? mod.detectSpec(c.talentMap, c.level) : null;
  const n = Object.keys(c.slots).length;
  setStatus('#charStatus', c.name + ': level ' + c.level + ' ' + c.race + ' ' + c.cls + (spec ? ', ' + spec.name : '') + '. ' + n + ' items equipped' + (c.sheet ? ', with character sheet' : '') + '.', 'ok');
  $('#classNote').textContent = mod ? '' : 'There is no simulator for ' + c.cls + ' in this copy of the site; gear will be ranked with rough weights.';
  $('#style').innerHTML = mod ? mod.styles.map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('') : '';
  $('#styleRow').hidden = !(mod && mod.styles.length > 1);
  if (T && Object.keys(c.talentMap).length) $('#talentList').textContent = 'Talents: ' + Object.keys(c.talentMap).map((id) => (T.names[id] || id) + ' ' + c.talentMap[id]).join(', ') + '.';
  else $('#talentList').textContent = 'No talents in this export, so the fights assume none.';
  ready();
}
function loadChar(text) {
  try { state.char = Parse.parseExport(text); store('fgl-export', text); showChar(); }
  catch (e) { state.char = null; setStatus('#charStatus', e.message, 'err'); $('#talentList').textContent = ''; ready(); }
}
function setChars(list) {
  state.chars = list;
  const sel = $('#charSel');
  sel.innerHTML = list.map((x, i) => '<option value="' + i + '">' + esc(x.label) + '</option>').join('');
  $('#charRow').hidden = !list.length;
  if (!list.length) return;
  const last = load('fgl-char');
  let idx = list.findIndex((x) => x.key === last);
  if (idx < 0) idx = 0;
  sel.value = String(idx);
  loadChar(list[idx].text);
}
function pickRealm(name) {
  state.realm = name;
  state.market = Parse.summarizeRealm(state.auction.realms[name]);
  const d = Parse.dayToDate(state.market.newestDay);
  const newest = Object.values(state.market.items).filter((x) => x.day === state.market.newestDay).length;
  const age = Math.round((Date.now() - d.getTime()) / 86400000);
  setStatus('#ahStatus', 'Auction prices: ' + state.market.total.toLocaleString() + ' items, last scanned ' + (age <= 0 ? 'today' : age === 1 ? 'yesterday' : age + ' days ago') + (newest < state.market.total * 0.5 ? ' (a partial scan, so some prices are older)' : '') + '.', age > 3 ? '' : 'ok');
  ready();
}
function loadAuction(buf) {
  try {
    state.auction = Parse.parseAuctionator(new Uint8Array(buf));
    const names = Object.keys(state.auction.realms).sort((a, b) => Object.keys(state.auction.realms[b]).length - Object.keys(state.auction.realms[a]).length);
    $('#realm').innerHTML = names.map((n) => '<option>' + esc(n) + '</option>').join('');
    $('#realmRow').hidden = names.length < 2;
    pickRealm(names[0]);
    return true;
  } catch (e) { state.auction = null; state.market = null; setStatus('#ahStatus', e.message, 'err'); ready(); return false; }
}
function ready() { $('#go').disabled = !(state.char && state.market); }

// ---------- folder sync ----------
function charsFrom(gearLabText, claudeGearText) {
  let list = [];
  try { if (gearLabText) list = list.concat(Parse.readGearLabExport(gearLabText)); } catch (e) { /* unreadable file */ }
  const have = new Set(list.map((x) => x.label.split(',')[0]));
  try { if (claudeGearText) for (const x of Parse.readClaudeGear(claudeGearText)) if (!have.has(x.label.split(',')[0])) list.push(x); } catch (e) { /* unreadable file */ }
  return list;
}
async function loadAccount(acc) {
  const data = await Sync.readAccount(acc);
  const got = [];
  if (data.auction) { if (loadAuction(data.auction)) got.push('auction prices'); }
  else setStatus('#ahStatus', 'No Auctionator.lua in that folder. Scan the auction house with Auctionator, then /reload.', 'err');
  const list = charsFrom(data.gearLab, data.claudeGear);
  if (list.length) { setChars(list); got.push(list.length + (list.length === 1 ? ' character' : ' characters')); }
  else if (!state.char) setStatus('#charStatus', 'No character data in that folder yet. Install the GearLabExport addon, log in, then /reload.', 'err');
  const when = Math.max(0, ...Object.values(data.times));
  const mins = Math.round((Date.now() - when) / 60000);
  const ago = mins < 2 ? 'just now' : mins < 90 ? mins + ' minutes ago' : mins < 2880 ? Math.round(mins / 60) + ' hours ago' : Math.round(mins / 1440) + ' days ago';
  setStatus('#folderStatus', 'Connected: ' + acc.label + '. Read ' + (got.join(' and ') || 'nothing usable') + '. WoW last wrote these files ' + ago + '.', got.length ? 'ok' : 'err');
}
async function syncFrom(handle) {
  state.folder = handle;
  setStatus('#folderStatus', 'Looking through ' + handle.name + '…');
  const accounts = await Sync.locate(handle);
  state.accounts = accounts;
  $('#resync').hidden = false;
  $('#connect').textContent = 'Change folder';
  $('#connect').className = 'btn';
  if (!accounts.length) {
    $('#accountRow').hidden = true;
    setStatus('#folderStatus', 'No addon files found in "' + handle.name + '". Pick the World of Warcraft folder, or its _forever_ folder.', 'err');
    return;
  }
  $('#account').innerHTML = accounts.map((a, i) => '<option value="' + i + '">' + esc(a.label) + '</option>').join('');
  $('#accountRow').hidden = accounts.length < 2;
  await loadAccount(accounts[0]);
  refreshAddonStatus();
}
async function refreshAddonStatus() {
  if (!state.folder) return;
  try {
    const site = await Sync.siteAddon();
    const inst = await Sync.installedVersion(state.folder);
    if (!inst.reachable) setStatus('#addonStatus', 'To install from here, connect the World of Warcraft folder (or _forever_), not a folder inside WTF.', '');
    else if (!inst.version) setStatus('#addonStatus', 'GearLabExport is not installed yet.', '');
    else if (inst.version !== site.version) { setStatus('#addonStatus', 'Installed version ' + inst.version + '; version ' + site.version + ' is available.', ''); $('#installAddon').textContent = 'Update the addon'; }
    else { setStatus('#addonStatus', 'GearLabExport ' + inst.version + ' is installed and up to date.', 'ok'); $('#installAddon').textContent = 'Reinstall the addon'; }
  } catch (e) { /* the addon box simply keeps its default text */ }
}
async function readPickedFiles(files) {
  let auction = null, gearLab = null, claudeGear = null;
  for (const f of files) {
    const n = f.name.toLowerCase();
    if (n === 'auctionator.lua') auction = await f.arrayBuffer();
    else if (n === 'gearlabexport.lua') gearLab = await f.text();
    else if (n === 'claudegear.lua') claudeGear = await f.text();
  }
  const got = [];
  if (auction && loadAuction(auction)) got.push('auction prices');
  const list = charsFrom(gearLab, claudeGear);
  if (list.length) { setChars(list); got.push(list.length + (list.length === 1 ? ' character' : ' characters')); }
  setStatus('#folderStatus', got.length ? 'Read ' + got.join(' and ') + ' from the files you chose.' : 'None of those files are Auctionator.lua or GearLabExport.lua.', got.length ? 'ok' : 'err');
}

async function init() {
  try {
    const [items, suf, cons, talents] = await Promise.all(['items', 'suffixes', 'consumables', 'talents'].map((n) => fetch('data/' + n + '.json').then((r) => { if (!r.ok) throw new Error(n); return r.json(); })));
    state.items = items; state.suf = suf; state.cons = cons; state.talents = talents;
    try { state.extra = JSON.parse(load('fgl-extra-items-v3') || '{}'); } catch (e) { state.extra = {}; }
    await startWorker();
    $('#loading').hidden = true;
    $('#app').hidden = false;
    $('#classList').textContent = Object.keys(GL.classes).sort().join(', ');
    $('#classAbout').innerHTML = Object.keys(GL.classes).sort().map((n) => '<li><b class="tan">' + esc(n) + ':</b> ' + esc(GL.classes[n].about) + '</li>').join('');
  } catch (e) {
    $('#loading').textContent = 'Could not load the data files. Open this page through a web server, not as a file. (' + e.message + ')';
    return;
  }

  // folder
  if (!Sync.supported) {
    $('#connect').disabled = true;
    setStatus('#folderStatus', 'This browser cannot open folders. Use Chrome or Edge, or choose the files yourself below.', '');
    $('#filesAlt').open = true;
    $('#installAddon').hidden = true;
  }
  const fail = (e) => { if (e && e.name !== 'AbortError') setStatus('#folderStatus', e.message || String(e), 'err'); };
  $('#connect').onclick = async () => { try { await syncFrom(await Sync.pick('read')); } catch (e) { fail(e); } };
  $('#resync').onclick = async () => {
    try {
      if (!state.folder) return;
      if (!(await Sync.allow(state.folder, 'read'))) { setStatus('#folderStatus', 'The browser needs your permission to read that folder again.', 'err'); return; }
      await syncFrom(state.folder);
    } catch (e) { fail(e); }
  };
  $('#account').addEventListener('change', async (e) => { try { await loadAccount(state.accounts[+e.target.value]); } catch (err) { fail(err); } });
  $('#filesInput').addEventListener('change', (e) => readPickedFiles([...e.target.files]).catch(fail));
  const dz = $('#dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); $('#filesAlt').open = true; readPickedFiles([...e.dataTransfer.files]).catch(fail); });
  $('#copyPath').onclick = async () => { try { await navigator.clipboard.writeText($('#pathText').textContent); $('#copyPath').textContent = 'Copied'; } catch (e) { $('#copyPath').textContent = 'Select the path above and copy it'; } };
  $('#installAddon').onclick = async () => {
    try {
      let h = state.folder;
      if (!h || !(await Sync.installedVersion(h)).reachable) { h = await Sync.pick('readwrite'); state.folder = h; }
      const v = await Sync.install(h);
      setStatus('#addonStatus', 'Installed GearLabExport ' + v + '. Restart WoW or type /reload, log in on each character, then press Sync again.', 'ok');
      if (h === state.folder && !state.accounts) await syncFrom(h);
    } catch (e) { if (e && e.name !== 'AbortError') setStatus('#addonStatus', e.message || String(e), 'err'); }
  };
  $('#downloadAddon').onclick = async () => {
    try {
      const url = URL.createObjectURL(await Sync.addonZip());
      const a = document.createElement('a');
      a.href = url; a.download = 'GearLabExport.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus('#addonStatus', 'Unzip it into World of Warcraft, _forever_, Interface, AddOns, so you get a GearLabExport folder there.', 'ok');
    } catch (e) { setStatus('#addonStatus', e.message || String(e), 'err'); }
  };

  // character and prices
  $('#charSel').addEventListener('change', (e) => { const x = state.chars[+e.target.value]; if (x) { store('fgl-char', x.key); loadChar(x.text); } });
  $('#exportText').addEventListener('input', (e) => { const v = e.target.value.trim(); if (v) loadChar(v); });
  $('#realm').addEventListener('change', (e) => pickRealm(e.target.value));
  try {
    const more = await fetch('data/samples/index.json').then((r) => (r.ok ? r.json() : []));
    if (more.length) {
      $('#sampleSel').innerHTML += more.map((m) => '<option value="' + esc(m.file) + '">' + esc(m.label) + '</option>').join('');
      $('#sampleRow').hidden = false;
      $('#sampleAh').hidden = false;
    }
  } catch (e) { /* no samples in this copy */ }
  $('#sampleSel').addEventListener('change', async (e) => {
    if (!e.target.value) return;
    const t = await fetch('data/samples/' + e.target.value).then((r) => r.text());
    $('#exportText').value = t.trim(); loadChar(t);
    $('#charStatus').textContent = 'Sample character. ' + $('#charStatus').textContent;
  });
  $('#sampleAh').onclick = async () => {
    setStatus('#ahStatus', 'Loading sample prices…');
    const r = await fetch('data/samples/Auctionator.lua');
    if (!r.ok) { setStatus('#ahStatus', 'No sample price file is included.', 'err'); return; }
    if (loadAuction(await r.arrayBuffer())) $('#ahStatus').textContent = 'Sample prices. ' + $('#ahStatus').textContent;
  };

  $('#go').onclick = async () => {
    $('#go').disabled = true; setStatus('#goStatus', '');
    try { await analyse(); } catch (e) { $('#progress').hidden = true; setStatus('#goStatus', e.message, 'err'); console.error(e); }
    $('#go').disabled = false;
  };

  // pick up where the player left off
  const saved = load('fgl-export');
  if (saved) { $('#exportText').value = saved; loadChar(saved); }
  if (Sync.supported) {
    const mem = await Sync.remembered();
    if (mem) {
      state.folder = mem.handle;
      $('#resync').hidden = false;
      if (mem.granted) syncFrom(mem.handle).catch(fail);
      else setStatus('#folderStatus', 'Your folder "' + mem.handle.name + '" is remembered. Press Sync again to read it.', '');
    }
  }
}
document.addEventListener('DOMContentLoaded', init);
