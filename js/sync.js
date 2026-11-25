/* Folder sync: lets the page read the addon files straight from the WoW folder, remember that folder,
   and put the GearLabExport addon into Interface/AddOns. Uses the browser's folder access (Chrome, Edge).
   Nothing is uploaded: the files are read in the page. */
(function (root) {
  'use strict';
  const supported = typeof root.showDirectoryPicker === 'function';
  const FILES = { auction: 'Auctionator.lua', gearLab: 'GearLabExport.lua', claudeGear: 'ClaudeGear.lua' };
  const ADDON_FILES = ['GearLabExport.toc', 'GearLabExport.lua'];

  // ---------- a tiny key-value store for the remembered folder ----------
  function idb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('forever-gear-lab', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function kvGet(key) {
    try {
      const db = await idb();
      return await new Promise((resolve) => { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => resolve(q.result || null); q.onerror = () => resolve(null); });
    } catch (e) { return null; }
  }
  async function kvSet(key, value) {
    try {
      const db = await idb();
      await new Promise((resolve) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(value, key); tx.oncomplete = resolve; tx.onerror = resolve; });
    } catch (e) { /* remembering is optional */ }
  }

  // ---------- walking folders ----------
  async function child(dir, name) {
    try { return await dir.getDirectoryHandle(name); } catch (e) { return null; }
  }
  async function walk(dir, names) {
    let h = dir;
    for (const n of names) { h = h && await child(h, n); if (!h) return null; }
    return h;
  }
  async function dirs(dir) {
    const out = [];
    try { for await (const [name, h] of dir.entries()) if (h.kind === 'directory') out.push([name, h]); } catch (e) { /* unreadable folder */ }
    return out;
  }
  async function fileOf(dir, name) {
    try { return await dir.getFileHandle(name); } catch (e) { return null; }
  }
  async function accountsUnder(accountDir, flavor) {
    const out = [];
    for (const [name, h] of await dirs(accountDir)) {
      const sv = await child(h, 'SavedVariables');
      if (sv) out.push({ flavor, account: name, dir: sv });
    }
    return out;
  }

  // Finds every SavedVariables folder reachable from the folder the player picked, whichever level they picked.
  async function locate(handle) {
    let found = [];
    const name = handle.name;
    if (name === 'SavedVariables') found.push({ flavor: '', account: 'selected folder', dir: handle });
    const here = await child(handle, 'SavedVariables');
    if (here) found.push({ flavor: '', account: name, dir: here });
    if (name === 'Account') found = found.concat(await accountsUnder(handle, ''));
    const acc1 = await walk(handle, ['Account']);
    if (acc1) found = found.concat(await accountsUnder(acc1, ''));
    const acc2 = await walk(handle, ['WTF', 'Account']);
    if (acc2) found = found.concat(await accountsUnder(acc2, name));
    for (const [n, h] of await dirs(handle)) {
      if (n[0] !== '_' || n[n.length - 1] !== '_') continue;
      const acc = await walk(h, ['WTF', 'Account']);
      if (acc) found = found.concat(await accountsUnder(acc, n));
    }
    const out = [];
    for (const a of found) {
      const files = {};
      let newest = 0;
      for (const k in FILES) {
        const fh = await fileOf(a.dir, FILES[k]);
        if (fh) { files[k] = fh; try { const f = await fh.getFile(); if (f.lastModified > newest) newest = f.lastModified; } catch (e) { /* skip */ } }
      }
      if (Object.keys(files).length) out.push(Object.assign(a, { files, newest, label: (a.flavor ? a.flavor + ' / ' : '') + a.account }));
    }
    // WoW Forever first, then the most recently written
    out.sort((x, y) => ((y.flavor === '_forever_') - (x.flavor === '_forever_')) || (y.newest - x.newest));
    return out;
  }
  async function addonsDir(handle, create) {
    const tries = [[handle, ['Interface', 'AddOns']], [await child(handle, '_forever_'), ['Interface', 'AddOns']]];
    if (handle.name === 'Interface') tries.push([handle, ['AddOns']]);
    if (handle.name === 'AddOns') return handle;
    for (const [h, path] of tries) { const d = h && await walk(h, path); if (d) return d; }
    return null;
  }

  async function readAccount(acc) {
    const out = { auction: null, gearLab: null, claudeGear: null, times: {} };
    for (const k in acc.files) {
      const f = await acc.files[k].getFile();
      out.times[k] = f.lastModified;
      out[k] = k === 'auction' ? await f.arrayBuffer() : await f.text();
    }
    return out;
  }

  // ---------- public steps ----------
  async function pick(mode) {
    const handle = await root.showDirectoryPicker({ id: 'fgl-wow', mode: mode || 'read' });
    await kvSet('folder', handle);
    return handle;
  }
  async function remembered() {
    const handle = await kvGet('folder');
    if (!handle || !handle.queryPermission) return null;
    let state = 'prompt';
    try { state = await handle.queryPermission({ mode: 'read' }); } catch (e) { /* treat as needing a click */ }
    return { handle, granted: state === 'granted' };
  }
  async function allow(handle, mode) {
    try { return (await handle.requestPermission({ mode: mode || 'read' })) === 'granted'; } catch (e) { return false; }
  }
  async function remember(handle) { await kvSet('folder', handle); }

  async function addonVersion(text) { const m = /## Version: *([^\r\n]+)/.exec(text || ''); return m ? m[1].trim() : null; }
  async function siteAddon() {
    const files = {};
    for (const n of ADDON_FILES) { const r = await fetch('addon/GearLabExport/' + n); if (!r.ok) throw new Error('The addon files are missing from this copy of the site.'); files[n] = await r.text(); }
    return { files, version: await addonVersion(files['GearLabExport.toc']) };
  }
  async function installedVersion(handle) {
    const d = await addonsDir(handle);
    if (!d) return { reachable: false, version: null };
    const g = await child(d, 'GearLabExport');
    const fh = g && await fileOf(g, 'GearLabExport.toc');
    if (!fh) return { reachable: true, version: null };
    return { reachable: true, version: await addonVersion(await (await fh.getFile()).text()) };
  }
  async function install(handle) {
    const d = await addonsDir(handle);
    if (!d) throw new Error('This folder has no Interface, AddOns folder inside it. Pick the _forever_ folder, or the World of Warcraft folder above it.');
    if (!(await allow(handle, 'readwrite'))) throw new Error('The browser did not get permission to write to that folder.');
    const addon = await siteAddon();
    const g = await d.getDirectoryHandle('GearLabExport', { create: true });
    for (const n of ADDON_FILES) {
      const fh = await g.getFileHandle(n, { create: true });
      const w = await fh.createWritable();
      await w.write(addon.files[n]);
      await w.close();
    }
    return addon.version;
  }

  // ---------- a zip of the addon, for browsers without folder access ----------
  function crc32(bytes) {
    let c, crc = -1;
    for (let i = 0; i < bytes.length; i++) {
      c = (crc ^ bytes[i]) & 255;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
      crc = (crc >>> 8) ^ c;
    }
    return (crc ^ -1) >>> 0;
  }
  async function addonZip() {
    const addon = await siteAddon();
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (const n of ADDON_FILES) {
      const name = enc.encode('GearLabExport/' + n), data = enc.encode(addon.files[n]), crc = crc32(data);
      const head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(8, 0, true);
      head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true);
      parts.push(new Uint8Array(head.buffer), name, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, ADDON_FILES.length, true); end.setUint16(10, ADDON_FILES.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  root.Sync = { supported, pick, remembered, allow, remember, locate, readAccount, installedVersion, install, addonZip, siteAddon, FILES };
})(typeof self !== 'undefined' ? self : this);
