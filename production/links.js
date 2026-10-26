// Jawda — connects samples to production run lines.
// A run line (design × fabric colour) belongs to a sample when:
//   1. it was linked by hand (pf_lines.sample_id), or
//   2. the sample's name matches the line's design – and if several samples share the name,
//      the one whose swatch is the line's fabric (swatch.stock_name = fabric name), then an approved one.
window.LINKS = (() => {
  const L = {};
  L.norm = s => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ')
    .replace(/\bwith\b/g, ' ').replace(/two[\s-]*piece( set)?/g, 'two piece').replace(/[^a-z0-9]+/g, ' ').trim();
  // a season tag (SS26, AW25…) on only one side means a different design, e.g. "Umbrella Sleeve Abaya - SS26" ≠ the Ramadan one
  const tags = s => (s.match(/\b(ss|aw|fw)\d{2}\b/g) || []).join(' ');
  const same = (a, b) => { const x = L.norm(a), y = L.norm(b); if (!x || !y || tags(x) !== tags(y)) return false; return x === y || (x.length > 8 && y.length > 8 && (x.includes(y) || y.includes(x))); };
  // samples: all samples; swatches: all swatches; fabricName: (fabric_id) => fabric name in Fabric Stock
  L.sampleFor = (line, samples, swatches, fabricName) => {
    if (line.sample_id) return samples.find(s => s.id === line.sample_id) || null;
    const c = samples.filter(s => same(s.name, line.design));
    if (c.length < 2) return c[0] || null;
    const fname = fabricName ? fabricName(line.fabric_id) : null;
    const sw = id => swatches.find(x => x.id === id);
    const byFabric = fname ? c.filter(s => (s.swatch_ids || []).some(id => (sw(id) || {}).stock_name === fname)) : [];
    const pool = byFabric.length ? byFabric : c;
    return pool.find(s => s.sample_status === 'Approved') || pool[0];
  };
  L.approved = s => !!s && s.sample_status === 'Approved';
  return L;
})();
