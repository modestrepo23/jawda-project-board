// Jawda Production — shared helpers (login, storage, formatting)
window.$ = window.$ || (id => document.getElementById(id));
window.J = (() => {
  const CFG = window.JAWDA_CONFIG || {};
  const J = { sb: null, mode: 'local', CFG };
  J.get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  J.set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  J.safe = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
  J.esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  J.num = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('en-GB');
  J.today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  J.fmtDate = s => { if (!s) return ''; const d = new Date(s + 'T00:00:00'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  J.toast = m => { const t = $('toast'); if (!t) return; t.textContent = m; t.classList.add('on'); clearTimeout(J._t); J._t = setTimeout(() => t.classList.remove('on'), 2400); };
  J.setSave = m => { const el = $('saveState'); if (el) el.textContent = m; };
  J.csv = (name, header, rows) => {
    const q = x => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const text = [header.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click();
  };
  // Login with the shared team password (same as the Jawda Board), then run start()
  J.boot = async start => {
    const menuBtn = $('btnData');
    if (menuBtn) {
      menuBtn.onclick = e => { e.stopPropagation(); $('dataMenu').classList.toggle('open'); };
      document.addEventListener('click', () => $('dataMenu').classList.remove('open'));
    }
    const so = $('actSignout');
    if (so) so.onclick = async () => { if (J.sb) await J.sb.auth.signOut(); location.reload(); };
    const go = async () => { $('app').classList.remove('hidden'); await start(); };
    if (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
      J.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
      const { data: { session } } = await J.sb.auth.getSession();
      if (!session) {
        $('login').classList.remove('hidden'); $('pw').focus();
        $('loginForm').onsubmit = async e => {
          e.preventDefault(); $('loginErr').textContent = '';
          const { error } = await J.sb.auth.signInWithPassword({ email: CFG.LOGIN_EMAIL, password: $('pw').value });
          if (error) { $('loginErr').textContent = "That password didn't work."; return; }
          $('login').classList.add('hidden'); await go();
        };
        return;
      }
    }
    await go();
  };
  return J;
})();
