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
  // returns [{path}] in the order given
  M.upload = async (files, folder) => {
    const out = [];
    for (const raw of files) {
      if (!raw.type.startsWith('image/')) { J.toast(`${raw.name} isn't a picture`); continue; }
      const f = await shrink(raw);
      if (J.mode !== 'remote') { out.push({ path: 'local:' + uuid(), data: await asDataUrl(f) }); continue; }
      const ext = (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const path = `${folder}/${uuid()}.${ext}`;
      J.setSave(`Uploading ${out.length + 1} of ${files.length}…`);
      const { error } = await J.sb.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false });
      if (error) { J.toast(`Couldn't upload ${raw.name}: ${error.message}`); continue; }
      out.push({ path });
    }
    return out;
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
  M.picker = (onFiles, { camera = false } = {}) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    if (camera) inp.capture = 'environment';
    inp.onchange = () => { if (inp.files.length) onFiles([...inp.files]); }; inp.click();
  };
  M.dropzone = (el, onFiles) => {
    el.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.classList.add('drag'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('drag'); const fs = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/')); if (fs.length) onFiles(fs); });
  };
  M.onPaste = getTarget => document.addEventListener('paste', e => {
    const fn = getTarget(); if (!fn) return;
    const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (fs.length) { e.preventDefault(); fn(fs); }
  });

  // ---------- full-screen viewer ----------
  let lb = null;
  M.view = (imgs, start = 0, captions = []) => {
    if (!lb) {
      lb = document.createElement('div'); lb.className = 'lightbox';
      lb.innerHTML = '<button class="lx" aria-label="Close">×</button><button class="lp" aria-label="Previous">‹</button><img alt=""><button class="ln" aria-label="Next">›</button><div class="lc"></div>';
      document.body.appendChild(lb);
      lb.onclick = e => { if (e.target === lb || e.target.classList.contains('lx')) close(); };
      document.addEventListener('keydown', e => { if (!lb.classList.contains('on')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });
      lb.querySelector('.lp').onclick = () => step(-1); lb.querySelector('.ln').onclick = () => step(1);
    }
    let i = start; const show = () => { lb.querySelector('img').src = M.src(imgs[i]); lb.querySelector('.lc').textContent = `${i + 1} of ${imgs.length}${captions[i] ? ' · ' + captions[i] : ''}`; lb.querySelector('.lp').style.visibility = lb.querySelector('.ln').style.visibility = imgs.length > 1 ? 'visible' : 'hidden'; };
    const step = d => { i = (i + d + imgs.length) % imgs.length; show(); };
    const close = () => lb.classList.remove('on');
    lb._step = step; show(); lb.classList.add('on');
  };

  M.nav = active => [['../production/', 'Home'], ['../samples/', 'Samples'], ['../swatches/', 'Swatch Collections']]
    .map(([h, t]) => `<a href="${h}"${t === active ? ' class="on" aria-current="page"' : ''}>${t}</a>`).join('');
  return M;
})();
