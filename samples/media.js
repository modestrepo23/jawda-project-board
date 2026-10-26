// Jawda Samples — shared data store + photos (Supabase Storage, private bucket)
window.M = (() => {
  const M = { D: {} };
  const BUCKET = 'jawda-media', LS = 'jawda.samples.local.v1';
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now() + Math.random().toString(16).slice(2));
  M.uuid = uuid;

  // ---------- data ----------
  M.load = async (tables) => {
    if (J.sb) {
      const res = await Promise.all(tables.map(t => J.sb.from(t).select('*').order('sort').order('created_at')));
      const err = res.find(r => r.error);
      if (!err) { J.mode = 'remote'; tables.forEach((t, i) => M.D[t] = res[i].data); return M.D; }
      M.loadError = err.error.message;
    }
    J.mode = 'local';
    const saved = J.safe(J.get(LS), null) || window.SAMPLES_TEST_SEED || {};
    tables.forEach(t => M.D[t] = JSON.parse(JSON.stringify(saved[t] || [])));
    return M.D;
  };
  const persist = () => { const all = J.safe(J.get(LS), null) || window.SAMPLES_TEST_SEED || {}; Object.assign(all, M.D); J.set(LS, JSON.stringify(all)); };
  M.banner = () => J.mode === 'remote' ? '' :
    `<div class="banner">${J.sb ? `Couldn't reach the database (${J.esc(M.loadError || 'unknown error')}). Changes are only saved on this device.` : 'Working offline – changes are only saved on this device.'}</div>`;
  M.put = async (table, row) => {
    if (!row.id) row.id = uuid();
    const list = M.D[table]; const i = list.findIndex(r => r.id === row.id);
    if (i >= 0) list[i] = Object.assign(list[i], row); else list.push(row);
    if (J.mode === 'remote') {
      J.setSave('Saving…');
      const clean = { ...row, updated_at: new Date().toISOString() }; delete clean.created_at;
      const { error } = await J.sb.from(table).upsert(clean);
      if (error) { J.setSave('Not saved'); J.toast("Couldn't save: " + error.message); return false; }
      J.setSave('Saved');
    } else { persist(); J.setSave('Saved on this device'); }
    return true;
  };
  M.del = async (table, id) => {
    M.D[table] = M.D[table].filter(r => r.id !== id);
    if (J.mode === 'remote') {
      const { error } = await J.sb.from(table).delete().eq('id', id);
      if (error) { J.toast("Couldn't delete: " + error.message); return false; }
    } else persist();
    return true;
  };
  const timers = {};
  M.later = (key, fn, ms = 700) => { J.setSave('Editing…'); clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms); };

  // ---------- photos ----------
  // Shrink big phone photos before upload (long edge 1800px, JPEG) so pages stay quick
  const shrink = file => new Promise(resolve => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 400 * 1024) return resolve(file);
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1800, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
  const asDataUrl = f => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
  // returns [{path,name,size,type}] in the order given. docs:true also accepts PDFs / Illustrator / Office files (tech packs)
  const DOC = /^(application\/(pdf|postscript|illustrator|vnd\.openxmlformats.*))$/;
  const extOf = f => (f.name.match(/\.([a-z0-9]{2,5})$/i) || [, (f.type.split('/')[1] || 'bin')])[1].toLowerCase().replace('jpeg', 'jpg');
  M.upload = async (files, folder, { docs = false } = {}) => {
    const out = [];
    for (const raw of files) {
      const isImg = raw.type.startsWith('image/'), isDoc = DOC.test(raw.type) || /\.(pdf|ai|eps)$/i.test(raw.name);
      if (!isImg && !(docs && isDoc)) { J.toast(docs ? `${raw.name}: use a PDF, Illustrator, Word, Excel or picture file` : `${raw.name} isn't a picture`); continue; }
      if (raw.size > 50 * 1024 * 1024) { J.toast(`${raw.name} is over 50 MB`); continue; }
      const f = isImg && !docs ? await shrink(raw) : raw;
      const meta = { name: raw.name, size: f.size, type: f.type || (/\.pdf$/i.test(raw.name) ? 'application/pdf' : 'application/octet-stream') };
      if (J.mode !== 'remote') { out.push({ path: 'local:' + uuid(), data: await asDataUrl(f), ...meta }); continue; }
      const path = `${folder}/${uuid()}.${extOf(f)}`;
      J.setSave(`Uploading ${out.length + 1} of ${files.length}…`);
      const { error } = await J.sb.storage.from(BUCKET).upload(path, f, { contentType: meta.type, upsert: false });
      if (error) { J.toast(`Couldn't upload ${raw.name}: ${error.message}`); continue; }
      out.push({ path, ...meta });
    }
    J.setSave('Saved');
    return out;
  };
  // open a private file in a new tab (view) or download it with its original name
  M.openFile = async (file, download = false) => {
    if (file.data) { const a = document.createElement('a'); a.href = file.data; if (download) a.download = file.name || 'file'; else a.target = '_blank'; a.click(); return; }
    const w = download ? null : window.open('', '_blank');
    const { data, error } = await J.sb.storage.from(BUCKET).createSignedUrl(file.path, 3600, download ? { download: file.name || true } : undefined);
    if (error) { if (w) w.close(); J.toast("Couldn't open the file: " + error.message); return; }
    if (w) w.location = data.signedUrl; else { const a = document.createElement('a'); a.href = data.signedUrl; a.click(); }
  };
  M.remove = async paths => { if (J.mode === 'remote' && paths.length) await J.sb.storage.from(BUCKET).remove(paths.filter(p => !p.startsWith('local:'))); };
  // signed links (private bucket), cached for 50 minutes
  const cache = new Map();
  M.sign = async imgs => {
    const need = [...new Set(imgs.map(i => i.path).filter(p => p && !p.startsWith('local:') && !(cache.has(p) && cache.get(p).exp > Date.now())))];
    if (need.length && J.mode === 'remote') {
      for (let i = 0; i < need.length; i += 100) {
        const { data } = await J.sb.storage.from(BUCKET).createSignedUrls(need.slice(i, i + 100), 3600);
        (data || []).forEach(d => d.signedUrl && cache.set(d.path, { url: d.signedUrl, exp: Date.now() + 50 * 60e3 }));
      }
    }
  };
  M.src = img => img ? (img.data || (cache.get(img.path) || {}).url || '') : '';

  // ---------- picking files: button, drag & drop, paste ----------
  M.picker = (onFiles, { camera = false, accept = 'image/*' } = {}) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.multiple = true;
    if (camera) inp.capture = 'environment';
    inp.onchange = () => { if (inp.files.length) onFiles([...inp.files]); }; inp.click();
  };
  M.dropzone = (el, onFiles, { docs = false } = {}) => {
    el.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('drag'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('drag'); const fs = [...e.dataTransfer.files].filter(f => docs || f.type.startsWith('image/')); if (fs.length) onFiles(fs); });
  };
  M.onPaste = getTarget => document.addEventListener('paste', e => {
    const fn = getTarget(); if (!fn) return;
    const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (fs.length) { e.preventDefault(); fn(fs); }
  });

  // ---------- full-screen viewer with zoom ----------
  // wheel / pinch / double-tap / + − buttons to zoom, drag to move around a zoomed picture
  const V = { el: null, imgs: [], caps: [], i: 0, z: 1, x: 0, y: 0 };
  const apply = () => { const im = V.el.querySelector('img'); im.style.transform = `translate(${V.x}px,${V.y}px) scale(${V.z})`; im.style.cursor = V.z > 1 ? 'grab' : 'zoom-in'; V.el.querySelector('.lz').textContent = Math.round(V.z * 100) + '%'; };
  const zoomTo = (z, cx, cy) => {
    z = Math.min(6, Math.max(1, z)); const r = V.el.querySelector('img').getBoundingClientRect();
    if (cx != null) { const ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2), k = z / V.z; V.x += ox * (1 - k); V.y += oy * (1 - k); }
    V.z = z; if (z === 1) { V.x = 0; V.y = 0; } apply();
  };
  const show = () => {
    V.z = 1; V.x = 0; V.y = 0; V.el.querySelector('img').src = M.src(V.imgs[V.i]);
    V.el.querySelector('.lc').textContent = `${V.i + 1} of ${V.imgs.length}${V.caps[V.i] ? ' · ' + V.caps[V.i] : ''}`;
    V.el.querySelector('.lp').style.visibility = V.el.querySelector('.ln').style.visibility = V.imgs.length > 1 ? 'visible' : 'hidden'; apply();
  };
  const step = d => { V.i = (V.i + d + V.imgs.length) % V.imgs.length; show(); };
  const close = () => V.el.classList.remove('on');
  function build() {
    const el = V.el = document.createElement('div'); el.className = 'lightbox';
    el.innerHTML = '<button class="lx" aria-label="Close">×</button><button class="lp" aria-label="Previous">‹</button><div class="lstage"><img alt="" draggable="false"></div><button class="ln" aria-label="Next">›</button><div class="lzoom"><button data-z="-" aria-label="Zoom out">−</button><span class="lz">100%</span><button data-z="+" aria-label="Zoom in">＋</button><button data-z="0" aria-label="Fit to screen">Fit</button></div><div class="lc"></div>';
    document.body.appendChild(el);
    const stage = el.querySelector('.lstage'), img = el.querySelector('img');
    el.addEventListener('click', e => { if (e.target === el || e.target === stage || e.target.classList.contains('lx')) close(); });
    el.querySelector('.lp').onclick = e => { e.stopPropagation(); step(-1); };
    el.querySelector('.ln').onclick = e => { e.stopPropagation(); step(1); };
    el.querySelector('.lzoom').onclick = e => { e.stopPropagation(); const b = e.target.closest('[data-z]'); if (!b) return; zoomTo(b.dataset.z === '+' ? V.z * 1.5 : b.dataset.z === '-' ? V.z / 1.5 : 1); };
    document.addEventListener('keydown', e => { if (!el.classList.contains('on')) return; if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === '+' || e.key === '=') zoomTo(V.z * 1.5); else if (e.key === '-') zoomTo(V.z / 1.5); else if (e.key === '0') zoomTo(1); });
    stage.addEventListener('wheel', e => { e.preventDefault(); zoomTo(V.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
    img.addEventListener('dblclick', e => { e.stopPropagation(); zoomTo(V.z > 1 ? 1 : 2.5, e.clientX, e.clientY); });
    img.addEventListener('click', e => e.stopPropagation());
    // drag to pan + pinch to zoom (pointer events cover mouse, touch and pen)
    const pts = new Map(); let last = null, pinch = null, tap = 0;
    img.addEventListener('pointerdown', e => { img.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = { x: e.clientX, y: e.clientY };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: V.z }; }
      if (e.pointerType === 'touch' && pts.size === 1) { const now = Date.now(); if (now - tap < 300) zoomTo(V.z > 1 ? 1 : 2.5, e.clientX, e.clientY); tap = now; } });
    img.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; zoomTo(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
      if (V.z > 1 && last) { V.x += e.clientX - last.x; V.y += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; apply(); }
      else if (V.z === 1 && last && e.pointerType === 'touch' && Math.abs(e.clientX - last.x) > 60) { step(e.clientX < last.x ? 1 : -1); last = null; } });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) last = null; };
    img.addEventListener('pointerup', up); img.addEventListener('pointercancel', up);
  }
  M.view = (imgs, start = 0, captions = []) => {
    if (!V.el) build();
    V.imgs = imgs; V.caps = captions; V.i = start; show(); V.el.classList.add('on');
  };

  M.nav = active => [['../production/', 'Home'], ['../samples/', 'Samples'], ['../swatches/', 'Swatch Collections']]
    .map(([h, t]) => `<a href="${h}"${t === active ? ' class="on" aria-current="page"' : ''}>${t}</a>`).join('');
  return M;
})();
