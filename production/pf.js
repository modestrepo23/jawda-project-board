// Jawda Production — shared data + maths for Forecast, Runs and Fabric Stock
// Tables: pf_settings, pf_months, pf_runs, pf_fabrics, pf_lines, fabric_purchases
window.PF = (() => {
  const PF = { D: null };
  const LS = 'jawda.pf.local.v1';
  const DEF = { stock_on_hand: 0, stock_as_of: null, sellable_pct: 100, landing_days: 7, dhaka_buffer_days: 21,
    lead_days: 40, avg_yards_per_piece: 2.64, moq_design: 200, moq_colour: 80, fabric_count_date: null };
  const TABLES = { runs: 'pf_runs', fabrics: 'pf_fabrics', lines: 'pf_lines', months: 'pf_months', purchases: 'fabric_purchases' };
  const KEY = { months: 'month' };

  // ---------- dates ----------
  const d = s => new Date(s + 'T00:00:00Z');
  const iso = dt => dt.toISOString().slice(0, 10);
  PF.addDays = (s, n) => { if (!s) return null; const x = d(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
  PF.daysBetween = (a, b) => Math.round((d(b) - d(a)) / 864e5);
  PF.short = s => s ? d(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
  PF.monthName = s => d(s).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  PF.fmt = n => (Math.round(+n || 0)).toLocaleString('en-GB');

  // ---------- load ----------
  PF.load = async () => {
    if (J.sb) {
      const q = t => J.sb.from(t).select('*');
      const res = await Promise.all([q('pf_settings'), q('pf_months').order('month'), q('pf_runs').order('run_date'),
        q('pf_fabrics').order('sort'), q('pf_lines').order('sort'), q('fabric_purchases').order('entered_on')]);
      const err = res.find(r => r.error);
      if (!err) {
        J.mode = 'remote';
        PF.D = { settings: { ...DEF, ...((res[0].data[0] || {}).value || {}) }, months: res[1].data, runs: res[2].data,
          fabrics: res[3].data, lines: res[4].data, purchases: res[5].data };
        return PF.D;
      }
      PF.loadError = err.error.message;
    }
    J.mode = 'local';
    const saved = J.safe(J.get(LS), null) || window.PF_TEST_SEED || { settings: {}, months: [], runs: [], fabrics: [], lines: [], purchases: [] };
    PF.D = JSON.parse(JSON.stringify(saved));
    PF.D.settings = { ...DEF, ...PF.D.settings };
    return PF.D;
  };
  const persistLocal = () => J.set(LS, JSON.stringify(PF.D));
  PF.banner = () => J.mode === 'remote' ? '' :
    `<div class="banner">${J.sb ? `Couldn't reach the database (${J.esc(PF.loadError || 'unknown error')}). Changes are only saved on this device.` : 'Working offline – changes are only saved on this device.'}</div>`;

  // ---------- writes ----------
  PF.uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2));
  PF.saveSettings = async patch => {
    Object.assign(PF.D.settings, patch);
    if (J.mode === 'remote') {
      J.setSave('Saving…');
      const { error } = await J.sb.from('pf_settings').upsert({ id: 1, value: PF.D.settings, updated_at: new Date().toISOString() });
      if (error) { J.setSave('Not saved'); J.toast("Couldn't save: " + error.message); return false; }
      J.setSave('Saved for the team');
    } else persistLocal();
    return true;
  };
  // upsert a whole row into a collection (runs, fabrics, lines, months)
  PF.put = async (coll, row) => {
    const key = KEY[coll] || 'id';
    if (key === 'id' && !row.id) row.id = PF.uuid();
    const list = PF.D[coll]; const i = list.findIndex(r => r[key] === row[key]);
    if (i >= 0) list[i] = { ...list[i], ...row }; else list.push(row);
    if (J.mode === 'remote') {
      J.setSave('Saving…');
      const clean = { ...list[i >= 0 ? i : list.length - 1], updated_at: new Date().toISOString() };
      delete clean.created_at;
      const { error } = await J.sb.from(TABLES[coll]).upsert(clean);
      if (error) { J.setSave('Not saved'); J.toast("Couldn't save: " + error.message); return false; }
      J.setSave('Saved for the team');
    } else persistLocal();
    return true;
  };
  // patch only some fields (used for purchases so we never overwrite their other columns)
  PF.patch = async (coll, id, patch) => {
    const row = PF.D[coll].find(r => r.id === id); if (!row) return false;
    Object.assign(row, patch);
    if (J.mode === 'remote') {
      J.setSave('Saving…');
      const { error } = await J.sb.from(TABLES[coll]).update(patch).eq('id', id);
      if (error) { J.setSave('Not saved'); J.toast("Couldn't save: " + error.message); return false; }
      J.setSave('Saved for the team');
    } else persistLocal();
    return true;
  };
  PF.del = async (coll, keyVal) => {
    const key = KEY[coll] || 'id';
    PF.D[coll] = PF.D[coll].filter(r => r[key] !== keyVal);
    if (coll === 'runs') PF.D.lines = PF.D.lines.filter(l => l.run_id !== keyVal);
    if (coll === 'fabrics') PF.D.lines.forEach(l => { if (l.fabric_id === keyVal) l.fabric_id = null; });
    if (J.mode === 'remote') {
      J.setSave('Saving…');
      const { error } = await J.sb.from(TABLES[coll]).delete().eq(key, keyVal);
      if (error) { J.setSave('Not saved'); J.toast("Couldn't delete: " + error.message); return false; }
      J.setSave('Saved for the team');
    } else persistLocal();
    return true;
  };
  // debounce helper for typing
  const timers = {};
  PF.later = (key, fn, ms = 600) => { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms); };

  // ---------- maths ----------
  PF.pieces = l => Object.values(l.sizes || {}).reduce((a, b) => a + (+b || 0), 0);
  PF.yards = l => PF.pieces(l) * (+l.consumption || 0);
  PF.fabric = id => PF.D.fabrics.find(f => f.id === id);
  PF.fabricName = f => f ? `${f.name} – ${f.colour}` : '';
  PF.run = id => PF.D.runs.find(r => r.id === id);
  PF.runsSorted = () => [...PF.D.runs].sort((a, b) => a.run_date.localeCompare(b.run_date));
  PF.landing = r => PF.addDays(r.run_date, +PF.D.settings.landing_days || 0);
  PF.runLines = id => PF.D.lines.filter(l => l.run_id === id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  PF.runPieces = id => PF.runLines(id).reduce((a, l) => a + PF.pieces(l), 0);
  PF.runYards = id => PF.runLines(id).reduce((a, l) => a + PF.yards(l), 0);

  // Pieces to produce = rest of the as-of month (pro rata) + later months − stock on hand × sellable %
  PF.demand = () => {
    const s = PF.D.settings, asof = s.stock_as_of;
    let need = 0; const rows = [];
    for (const m of [...PF.D.months].sort((a, b) => a.month.localeCompare(b.month))) {
      let share = 1;
      if (asof) {
        const mEnd = PF.addDays(PF.addDays(m.month, 32).slice(0, 8) + '01', -1); // last day of month
        if (mEnd < asof) share = 0;
        else if (m.month <= asof) { const dim = +mEnd.slice(8); share = (dim - +asof.slice(8)) / dim; }
      }
      rows.push({ ...m, share, need: (+m.pieces || 0) * share }); need += (+m.pieces || 0) * share;
    }
    const usable = (+s.stock_on_hand || 0) * (+s.sellable_pct || 0) / 100;
    return { rows, gross: need, usable, toProduce: Math.max(0, need - usable) };
  };
  // Runs that count towards the plan: not yet landed by the stock date
  PF.planRuns = () => PF.runsSorted().filter(r => !PF.D.settings.stock_as_of || PF.landing(r) > PF.D.settings.stock_as_of);
  PF.plan = () => {
    const dm = PF.demand(); const runs = PF.planRuns();
    const planned = runs.filter(r => !r.is_remainder).reduce((a, r) => a + PF.runPieces(r.id), 0)
      + runs.filter(r => r.is_remainder).reduce((a, r) => a + PF.runPieces(r.id), 0);
    return { ...dm, runs, planned, unassigned: dm.toProduce - planned };
  };
  // Month by month: stock at start, pieces landing, pieces sold, stock at the end
  PF.cover = () => {
    const s = PF.D.settings, dm = PF.demand(); let stock = (+s.stock_on_hand || 0) * (+s.sellable_pct || 0) / 100;
    const runs = PF.planRuns();
    return dm.rows.filter(r => r.share > 0).map(r => {
      const mEnd = PF.addDays(PF.addDays(r.month, 32).slice(0, 8) + '01', -1);
      const landing = runs.filter(x => { const l = PF.landing(x); return l.slice(0, 7) === r.month.slice(0, 7); })
        .reduce((a, x) => a + PF.runPieces(x.id), 0);
      const start = stock; stock = stock + landing - r.need;
      return { month: r.month, start, landing, need: r.need, end: stock, mEnd };
    });
  };

  // Fabric: counted stock + purchases since the count − yards on runs since the count
  const yardsOfPurchase = p => p.measure === 'yards' ? (+p.quantity || 0) : 0;
  PF.stock = () => {
    const s = PF.D.settings, since = s.fabric_count_date;
    const runs = PF.runsSorted().filter(r => !since || r.run_date >= since);
    const out = new Map();
    for (const f of PF.D.fabrics) out.set(f.id, { f, counted: +f.in_stock || 0, bought: 0, purchases: [], used: 0, byRun: [], kg: 0 });
    for (const p of PF.D.purchases) {
      const o = out.get(p.stock_fabric_id); if (!o) continue;
      if (since && p.entered_on < since) continue;
      o.purchases.push(p); o.bought += yardsOfPurchase(p); if (p.measure === 'kg') o.kg += +p.quantity || 0;
    }
    for (const r of runs) {
      const per = new Map();
      for (const l of PF.runLines(r.id)) if (l.fabric_id && out.has(l.fabric_id)) per.set(l.fabric_id, (per.get(l.fabric_id) || 0) + PF.yards(l));
      for (const [fid, y] of per) { const o = out.get(fid); o.used += y; o.byRun.push({ run: r, yards: y }); }
    }
    const buf = +s.dhaka_buffer_days || 0, lead = +s.lead_days || 0;
    for (const o of out.values()) {
      const f = o.f; o.left = o.counted + o.bought - o.used;
      o.onOrder = +f.on_order || 0; o.planned = +f.planned_order || 0;
      o.leftAll = o.left + o.onOrder + o.planned;
      // first run the stock we hold can't cover
      let bal = o.counted + o.bought; o.shortRun = null;
      for (const br of o.byRun) { bal -= br.yards; if (bal < -0.5) { o.shortRun = br.run; break; } }
      o.needBy = f.required_by || (o.shortRun ? PF.addDays(o.shortRun.run_date, -buf) : null);
      o.orderBy = o.needBy && ['Nice', 'Sadia'].includes(f.source) ? PF.addDays(o.needBy, -lead) : null;
      o.etaLate = !!(o.needBy && f.on_order_eta && o.onOrder > 0 && f.on_order_eta > o.needBy);
      o.state = o.left >= -0.5 ? 'ok' : o.leftAll >= -0.5 ? (o.onOrder + o.left >= -0.5 ? 'ordered' : 'planned') : 'short';
    }
    return out;
  };
  PF.leftAfterRun = (stockMap, fid, runId) => {
    const o = stockMap.get(fid); if (!o) return null;
    let bal = o.counted + o.bought;
    for (const br of o.byRun) { bal -= br.yards; if (br.run.id === runId) return bal; }
    return bal;
  };

  // nav shared by the production pages
  PF.nav = active => {
    const items = [['../production/', 'Home'], ['../production-forecast/', 'Forecast'], ['../production-runs/', 'Runs'],
      ['../fabric-stock/', 'Fabric Stock'], ['../fabric-purchases/', 'Purchases'], ['../fabric-matrix/', 'Matrix']];
    return items.map(([h, t]) => `<a href="${h}"${t === active ? ' class="on" aria-current="page"' : ''}>${t}</a>`).join('');
  };
  return PF;
})();
