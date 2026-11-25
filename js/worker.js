/* Runs the class fight simulators off the main thread so the page stays responsive. */
importScripts('core.js');
for (const c of ['shaman', 'warrior', 'rogue', 'paladin', 'hunter', 'mage', 'warlock', 'priest', 'druid']) {
  try { importScripts('classes/' + c + '.js'); } catch (e) { /* that class has no simulator in this copy */ }
}
self.onmessage = function (e) {
  const m = e.data;
  try {
    if (m.op === 'ping') { self.postMessage({ id: m.id, ok: true, result: Object.keys(GearLab.classes) }); return; }
    if (m.op === 'weights') {
      const r = GearLab.weights(m.cls, m.cfg, m.fights, m.seed, (i, n) => self.postMessage({ id: m.id, progress: i / n }));
      self.postMessage({ id: m.id, ok: true, result: { base: clean(r.base), perPoint: r.perPoint, unit: r.unit } });
      return;
    }
    if (m.op === 'batch') {
      const out = [];
      for (let i = 0; i < m.cfgs.length; i++) {
        out.push(clean(GearLab.simulate(m.cls, m.cfgs[i], m.fights, m.seed)));
        self.postMessage({ id: m.id, progress: (i + 1) / m.cfgs.length });
      }
      self.postMessage({ id: m.id, ok: true, result: out });
      return;
    }
    self.postMessage({ id: m.id, ok: false, error: 'Unknown request' });
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) });
  }
};
function clean(r) { return { dps: r.dps, ttk: r.ttk, share: r.share || {}, info: r.info || {}, notes: r.notes || [] }; }
