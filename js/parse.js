/* Readers for the files and strings people bring to the site:
   - Auctionator.lua (SavedVariables) -> prices per realm
   - a character export (this site's addon, or the WowSims Exporter string)
   - a Wowhead item tooltip (for items missing from the bundled item list) */
(function (root) {
  'use strict';

  // ---------- Auctionator.lua ----------
  function findBytes(buf, text, from) {
    const pat = new TextEncoder().encode(text);
    outer: for (let i = from || 0; i <= buf.length - pat.length; i++) {
      for (let j = 0; j < pat.length; j++) if (buf[i + j] !== pat[j]) continue outer;
      return i;
    }
    return -1;
  }

  // Reads a Lua string literal starting at buf[i] === '"'; returns [bytes, index after the closing quote].
  function luaString(buf, i) {
    const out = [];
    i++;
    for (;;) {
      if (i >= buf.length) throw new Error('Unterminated string in the Auctionator file');
      const c = buf[i];
      if (c === 0x22) return [Uint8Array.from(out), i + 1];
      if (c === 0x5c) {
        const n = buf[i + 1];
        if (n >= 48 && n <= 57) {
          let j = i + 1, v = 0, k = 0;
          while (k < 3 && buf[j] >= 48 && buf[j] <= 57) { v = v * 10 + (buf[j] - 48); j++; k++; }
          out.push(v & 255); i = j;
        } else {
          const map = { 110: 10, 114: 13, 116: 9, 92: 92, 34: 34, 39: 39, 10: 10, 13: 10, 97: 7, 98: 8, 102: 12, 118: 11 };
          out.push(map[n] !== undefined ? map[n] : n); i += 2;
        }
      } else { out.push(c); i++; }
    }
  }

  function cbor(bytes) {
    let i = 0;
    const dec = new TextDecoder('utf-8');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    function arg(ai) {
      if (ai < 24) return ai;
      if (ai === 24) return bytes[i++];
      if (ai === 25) { const v = dv.getUint16(i); i += 2; return v; }
      if (ai === 26) { const v = dv.getUint32(i); i += 4; return v; }
      if (ai === 27) { const v = Number(dv.getBigUint64(i)); i += 8; return v; }
      throw new Error('Unsupported CBOR length');
    }
    function read() {
      const ib = bytes[i++];
      const mt = ib >> 5, ai = ib & 31;
      if (mt === 0) return arg(ai);
      if (mt === 1) return -1 - arg(ai);
      if (mt === 2 || mt === 3) { const n = arg(ai); const s = dec.decode(bytes.subarray(i, i + n)); i += n; return s; }
      if (mt === 4) { const n = arg(ai); const a = new Array(n); for (let k = 0; k < n; k++) a[k] = read(); return a; }
      if (mt === 5) { const n = arg(ai); const o = {}; for (let k = 0; k < n; k++) { const key = read(); o[String(key)] = read(); } return o; }
      if (mt === 6) { arg(ai); return read(); }
      if (ai === 20) return false;
      if (ai === 21) return true;
      if (ai === 22 || ai === 23) return null;
      if (ai === 25) { i += 2; return null; }
      if (ai === 26) { const v = dv.getFloat32(i); i += 4; return v; }
      if (ai === 27) { const v = dv.getFloat64(i); i += 8; return v; }
      throw new Error('Unsupported CBOR value');
    }
    return read();
  }

  // Returns { realms: { name: { itemKey: {m, a, h, l} } } }
  function parseAuctionator(buf) {
    const start = findBytes(buf, 'AUCTIONATOR_PRICE_DATABASE');
    if (start < 0) throw new Error('This does not look like Auctionator.lua (no price database found).');
    let end = findBytes(buf, 'AUCTIONATOR_POSTING_HISTORY', start);
    if (end < 0) end = buf.length;
    const realms = {};
    let i = start;
    for (;;) {
      const k = findBytes(buf, '["', i);
      if (k < 0 || k > end) break;
      const kEnd = findBytes(buf, '"]', k + 2);
      const name = new TextDecoder().decode(buf.subarray(k + 2, kEnd));
      let j = kEnd + 2;
      while (buf[j] === 0x20 || buf[j] === 0x3d) j++;
      if (buf[j] === 0x22) {
        const [bytes, after] = luaString(buf, j);
        try {
          const data = cbor(bytes);
          if (data && typeof data === 'object') realms[name] = data;
        } catch (e) { /* not a price blob */ }
        i = after;
      } else {
        i = j + 1;
      }
    }
    if (!Object.keys(realms).length) throw new Error('No realm price data found in this Auctionator file. Run a scan in game, then /reload.');
    return { realms };
  }

  function asMap(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }

  // Flattens one realm into { newestDay, items: { id: {price, qty, day} }, total }
  function summarizeRealm(realm) {
    const items = {};
    let newest = 0, total = 0;
    for (const key in realm) {
      const v = realm[key];
      if (!v || typeof v !== 'object' || !/^\d+$/.test(key)) continue;
      const h = asMap(v.h), a = asMap(v.a);
      let last = 0;
      for (const d in h) { const n = +d; if (n > last) last = n; }
      for (const d in a) { const n = +d; if (n > last) last = n; }
      if (!last || !v.m) continue;
      if (last > newest) newest = last;
      const lows = asMap(v.l);
      const hist = [];
      for (const d in h) hist.push([+d, lows[d] != null ? lows[d] : h[d]]);
      hist.sort((x, y) => x[0] - y[0]);
      items[key] = { price: v.m, qty: a[String(last)] || 0, day: last, hist: hist.slice(-8) };
      total++;
    }
    return { newestDay: newest, items, total };
  }

  function dayToDate(day) {
    const d = new Date(Date.UTC(2020, 0, 1));
    d.setUTCDate(d.getUTCDate() + day);
    return d;
  }

  // ---------- item tooltips (Wowhead "forever" tooltip endpoint) ----------
  const SLOT_TXT = { 'Head': 'Head', 'Neck': 'Neck', 'Shoulder': 'Shoulder', 'Back': 'Back', 'Chest': 'Chest', 'Wrist': 'Wrist', 'Hands': 'Hands', 'Waist': 'Waist', 'Legs': 'Legs', 'Feet': 'Feet', 'Finger': 'Finger', 'Trinket': 'Trinket', 'Two-Hand': 'TwoHand', 'Main Hand': 'MainHand', 'One-Hand': 'OneHand', 'Off Hand': 'OffHand', 'Held In Off-hand': 'HeldOff', 'Ranged': 'Ranged', 'Thrown': 'Thrown', 'Relic': 'Relic' };
  const STATID = { 4: 'str', 3: 'agi', 7: 'sta', 5: 'int', 6: 'spi' };
  const ARMOR = { 1: 'C', 2: 'L', 3: 'M', 4: 'P' };

  function plain(htmlText) {
    return htmlText.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
  }

  function statLines(text, st) {
    const add = (k, x) => { st[k] = Math.round(((st[k] || 0) + x) * 100) / 100; };
    let m;
    const each = (re, fn) => { re.lastIndex = 0; while ((m = re.exec(text))) fn(m); };
    each(/\+ ?(\d+) Attack Power(?! against| when| versus| in Cat)/g, (x) => add('ap', +x[1]));
    each(/\+ ?(\d+) ranged Attack Power/g, (x) => add('rap', +x[1]));
    each(/\+ ?(\d+) Attack Power in Cat, Bear/g, (x) => add('fap', +x[1]));
    each(/chance to hit with spells by ([\d.]+)%/g, (x) => add('shit', +x[1]));
    each(/damage and healing done by magical spells and effects by up to (\d+)/g, (x) => add('sp', +x[1]));
    each(/Increases damage done by magical spells and effects by up to (\d+)/g, (x) => add('sp', +x[1]));
    each(/damage done by (Nature|Fire|Frost|Shadow|Arcane|Holy) spells and effects by up to (\d+)/g, (x) => add(x[1].toLowerCase().slice(0, 3), +x[2]));
    each(/chance to hit by ([\d.]+)%/g, (x) => add('hit', +x[1]));
    each(/chance to get a critical strike by ([\d.]+)%/g, (x) => add('crit', +x[1]));
    each(/critical strike with spells by ([\d.]+)%/g, (x) => add('scrit', +x[1]));
    return st;
  }

  function parseTooltip(name, quality, tip) {
    if (!tip) return null;
    const m = /<table width="100%"><tr><td>([^<]+)<\/td>(?:<th><!--scstart(\d+):(\d+)--><span class="q1">([^<]+)<\/span>)?/.exec(tip);
    if (!m) return null;
    let slot = SLOT_TXT[m[1]];
    if (!slot) return null;
    const cls = m[2], sub = m[3], subname = m[4] || '';
    if (slot === 'OffHand' && subname === 'Shield') slot = 'Shield';
    const text = plain(tip);
    const main = text.split('Sell Price')[0];
    if (/Use: Teaches/.test(main)) return null;
    const st = {};
    let x;
    const re = /<!--stat(\d+)-->\+(\d+)/g;
    while ((x = re.exec(tip))) if (STATID[x[1]]) st[STATID[x[1]]] = (st[STATID[x[1]]] || 0) + (+x[2]);
    statLines(main.replace(/\+ ?\d+ (Strength|Agility|Stamina|Intellect|Spirit)/g, ''), st);
    const rec = { n: name, q: quality || 0, s: slot };
    if ((x = /Item Level <!--ilvl-->(\d+)/.exec(tip))) rec.il = +x[1];
    if ((x = /Requires Level <!--rlvl-->(\d+)/.exec(tip))) rec.rq = +x[1];
    if (cls === '4' && ARMOR[sub]) rec.at = ARMOR[sub];
    if (cls === '2') rec.wt = subname;
    if ((x = /<!--amr-->(\d+) Armor/.exec(tip))) rec.ar = +x[1];
    const dm = /<!--dmg-->(\d+) - (\d+)/.exec(tip), sp = /<!--spd-->([\d.]+)/.exec(tip);
    if (dm && sp) { rec.d1 = +dm[1]; rec.d2 = +dm[2]; rec.ws = +sp[1]; }
    if (Object.keys(st).length) rec.st = st;
    if (tip.indexOf('Random enchantment') >= 0) rec.rd = 1;
    if ((x = /Classes: ([A-Za-z, ]+)/.exec(text))) rec.cl = x[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (tip.indexOf('Binds when picked up') >= 0) rec.bop = 1;
    return rec;
  }

  async function fetchItem(id) {
    const r = await fetch('https://nether.wowhead.com/forever/tooltip/item/' + id);
    if (!r.ok) throw new Error('Wowhead returned ' + r.status);
    const j = await r.json();
    return parseTooltip(j.name, j.quality, j.tooltip || '');
  }

  // ---------- character export ----------
  const WOWSIMS_SLOTS = ['Head', 'Neck', 'Shoulder', 'Back', 'Chest', 'Wrist', 'Hands', 'Waist', 'Legs', 'Feet', 'Finger1', 'Finger2', 'Trinket1', 'Trinket2', 'MainHand', 'OffHand', 'Ranged'];
  const STATWORD = { Strength: 'str', Agility: 'agi', Stamina: 'sta', Intellect: 'int', Spirit: 'spi' };

  // Stats read from the in-game tooltip lines the addon exports (covers random suffixes exactly).
  function statsFromLines(lines) {
    const st = {};
    const text = (lines || []).join(' \n ');
    let m;
    const re = /\+(\d+) (Strength|Agility|Stamina|Intellect|Spirit)/g;
    while ((m = re.exec(text))) st[STATWORD[m[2]]] = (st[STATWORD[m[2]]] || 0) + (+m[1]);
    statLines(text.replace(/\+\d+ (Strength|Agility|Stamina|Intellect|Spirit)/g, ''), st);
    const out = { st };
    if ((m = /(\d+) - (\d+) Damage/.exec(text))) { out.d1 = +m[1]; out.d2 = +m[2]; }
    if ((m = /Speed ([\d.]+)/.exec(text))) out.ws = +m[1];
    if ((m = /(\d+) Armor/.exec(text))) out.ar = +m[1];
    return out;
  }

  function titleCase(s) { s = String(s || '').toLowerCase(); return s ? s[0].toUpperCase() + s.slice(1) : s; }

  function parseExport(text) {
    text = String(text || '').trim();
    if (!text) throw new Error('Paste a character export first.');
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b < 0) throw new Error('That does not look like an export. It should start with { and end with }.');
    let j;
    try { j = JSON.parse(text.slice(a, b + 1)); } catch (e) { throw new Error('The export is cut off or damaged: ' + e.message); }
    const c = { name: j.name || 'Unknown', cls: titleCase(j.class), race: titleCase(j.race === 'Scourge' ? 'Undead' : j.race), level: +j.level || 1,
      realm: j.realm || '', money: j.money != null ? +j.money : null, slots: {}, talents: {}, talentString: null, sheet: null, source: 'wowsims' };
    if (j.fgx) {
      c.source = 'addon';
      for (const it of j.items || []) {
        if (!it || !it.slot || !it.id) continue;
        c.slots[it.slot] = { id: +it.id, suffix: it.suffix ? +it.suffix : null, name: it.name || null, fromLines: it.lines ? statsFromLines(it.lines) : null };
      }
      for (const t of j.traits || []) if (t && t.spell) c.talents[t.spell] = +t.rank || 1;
      if (j.talents && typeof j.talents === 'string') c.talentString = j.talents;
      c.sheet = j.sheet && Object.keys(j.sheet).length ? j.sheet : null;
    } else {
      const items = (j.gear && j.gear.items) || [];
      items.forEach((it, i) => { if (it && it.id && WOWSIMS_SLOTS[i]) c.slots[WOWSIMS_SLOTS[i]] = { id: +it.id, suffix: it.randomSuffix ? +it.randomSuffix : null, name: null, fromLines: null }; });
      if (typeof j.talents === 'string') c.talentString = j.talents;
    }
    if (!Object.keys(c.slots).length) throw new Error('The export has no equipped items in it.');
    return c;
  }

  // "-0530303100212" style string -> { spellId: rank } using the class's talent order.
  function talentsFromString(str, order, trees) {
    const out = {};
    const parts = String(str || '').split('-');
    let base = 0;
    for (let t = 0; t < trees.length; t++) {
      const digits = parts[t] || '';
      for (let k = 0; k < digits.length && k < trees[t]; k++) {
        const r = +digits[k];
        if (r > 0) out[order[base + k]] = r;
      }
      base += trees[t];
    }
    return out;
  }


  // ---------- Lua SavedVariables (text) ----------
  // Reads "Name = { ... }" from a SavedVariables file into plain objects and arrays.
  function luaTable(text, varName) {
    const m = new RegExp(varName + '\\s*=\\s*').exec(text);
    if (!m) return null;
    let i = m.index + m[0].length;
    const n = text.length;
    function ws() {
      for (;;) {
        const c = text[i];
        if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ',' || c === ';') i++;
        else if (c === '-' && text[i + 1] === '-') { while (i < n && text[i] !== '\n') i++; }
        else break;
      }
    }
    function str() {
      const q = text[i++];
      let out = '';
      while (i < n && text[i] !== q) {
        if (text[i] === '\\') {
          const nx = text[i + 1];
          if (nx === 'n') { out += '\n'; i += 2; }
          else if (nx === 't') { out += '\t'; i += 2; }
          else if (nx === 'r') { out += '\r'; i += 2; }
          else if (nx >= '0' && nx <= '9') { let j = i + 1, d = ''; while (d.length < 3 && text[j] >= '0' && text[j] <= '9') d += text[j++]; out += String.fromCharCode(+d); i = j; }
          else { out += nx; i += 2; }
        } else out += text[i++];
      }
      i++;
      return out;
    }
    function value() {
      ws();
      const c = text[i];
      if (c === '{') return table();
      if (c === '"' || c === "'") return str();
      const num = /^-?\d+(\.\d+)?(e[-+]?\d+)?/i.exec(text.slice(i, i + 40));
      if (num) { i += num[0].length; return +num[0]; }
      if (text.startsWith('true', i)) { i += 4; return true; }
      if (text.startsWith('false', i)) { i += 5; return false; }
      if (text.startsWith('nil', i)) { i += 3; return null; }
      throw new Error('This file is not a saved-variables file the site can read.');
    }
    function table() {
      i++;
      const obj = {}, arr = [];
      let keyed = false;
      for (;;) {
        ws();
        if (i >= n) throw new Error('The file ends in the middle of a table.');
        if (text[i] === '}') { i++; break; }
        if (text[i] === '[') {
          i++;
          const k = value();
          ws(); i++; ws(); i++;
          obj[k] = value();
          keyed = true;
        } else arr.push(value());
      }
      if (!keyed) return arr;
      const keys = Object.keys(obj);
      if (!arr.length && keys.length && keys.every((k) => /^\d+$/.test(k))) return keys.sort((a, b) => a - b).map((k) => obj[k]);
      if (arr.length) obj._array = arr;
      return obj;
    }
    return value();
  }

  // GearLabExport.lua -> [{ key, label, text, time }]
  function readGearLabExport(text) {
    const db = luaTable(text, 'GearLabExportDB');
    const out = [];
    if (!db) return out;
    const chars = db.chars || {};
    for (const key in chars) {
      try {
        const j = JSON.parse(chars[key]);
        out.push({ key, label: j.name + ', level ' + j.level + ' ' + titleCase(j.class), text: chars[key], source: 'GearLabExport', time: db.time || 0 });
      } catch (e) { /* skip a damaged entry */ }
    }
    if (!out.length && typeof db.last === 'string') {
      try { const j = JSON.parse(db.last); out.push({ key: j.name, label: j.name + ', level ' + j.level + ' ' + titleCase(j.class), text: db.last, source: 'GearLabExport', time: db.time || 0 }); } catch (e) { /* nothing usable */ }
    }
    return out;
  }

  // ClaudeGear.lua (an older personal addon) -> the same list, converted to the export shape.
  function readClaudeGear(text) {
    const db = luaTable(text, 'ClaudeGearDB');
    const best = {};
    if (!db) return [];
    for (const key in db) {
      const c = db[key];
      if (key[0] === '_' || !c || typeof c !== 'object' || !c.equipped) continue;
      const name = c.name || key.split('-')[0];
      if (!best[name] || (c.time || 0) > (best[name].time || 0)) best[name] = c;
    }
    const want = /^\+\d|^Equip:|^Chance on hit|Damage|Armor|damage per second/;
    const out = [];
    for (const name in best) {
      const c = best[name];
      const items = [];
      for (const slot in c.equipped) {
        const it = c.equipped[slot];
        if (slot === 'Shirt' || slot === 'Tabard' || !it || !it.id) continue;
        const lines = (Array.isArray(it.tooltip) ? it.tooltip.slice(1) : []).map((l) => String(l).replace(/\|c[0-9a-fA-F]{8}|\|r/g, '')).filter((l) => want.test(l));
        items.push({ slot, id: it.id, name: it.name, lines });
      }
      const sh = c.sheet || {}, sheet = {};
      for (const k of ['str', 'agi', 'sta', 'int', 'spi']) if (Array.isArray(sh[k]) && sh[k].length > 1) sheet[k] = sh[k][1];
      if (typeof sh.crit === 'number') sheet.crit = Math.round(sh.crit * 100) / 100;
      const traits = (Array.isArray(c.traits) ? c.traits : []).filter((t) => t && t.spell).map((t) => ({ spell: t.spell, rank: t.rank }));
      const exp = { fgx: 1, name, realm: c.realm || '', class: c.class, race: c.race, level: c.level, money: c.money, items, sheet, traits };
      out.push({ key: name, label: name + ', level ' + c.level + ' ' + titleCase(c.class), text: JSON.stringify(exp), source: 'ClaudeGear', time: c.time || 0 });
    }
    return out;
  }

  const api = { parseAuctionator, summarizeRealm, dayToDate, parseTooltip, fetchItem, parseExport, talentsFromString, statsFromLines, luaTable, readGearLabExport, readClaudeGear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Parse = api;
})(typeof self !== 'undefined' ? self : this);
