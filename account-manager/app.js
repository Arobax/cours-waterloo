(() => {
  'use strict';

  /* ============================ CONFIG ============================ */
  // ⚠️ Remplace `owner` par ton nom d'utilisateur GitHub.
  const CONFIG = {
    PREFIX: 'daala',
    MAIL_DOMAIN: 'proton.me',
    FUNCTIONS: ['main', 'second', 'third', 'fourth', 'fifth'],
    LOGIN_URL: 'https://mail.proton.me/',
    MAX_NUMBER: 999,

    GITHUB: {
      owner: 'Arobax',
      repo:  'account-manager-data',
      branch: 'data',
      path:   'accounts.json'
    },

    LOCAL_CONFIG_KEY: 'account-manager:config'
  };

  /* ============================ HELPERS =========================== */
  const $ = (s, r = document) => r.querySelector(s);
  const pad3 = n => String(n).padStart(3, '0');
  const nowISO = () => new Date().toISOString();
  const buildAddress = (fn, num) => `${CONFIG.PREFIX}${fn}${num}@${CONFIG.MAIL_DOMAIN}`;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Base64 UTF-8 safe (l'API GitHub renvoie du base64 avec des \n)
  function b64Decode(b64) {
    const clean = b64.replace(/[\r\n\s]/g, '');
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function b64Encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  let toastTimer;
  function toast(msg, kind = 'info') {
    const t = $('#toast');
    t.textContent = msg;
    t.dataset.kind = kind;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
  }

  /* ======================== LOCAL CONFIG ========================== */
  // Non-secret uniquement : date d'expiration du PAT.
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem(CONFIG.LOCAL_CONFIG_KEY)) || {}; }
    catch { return {}; }
  }
  function saveConfig(cfg) {
    localStorage.setItem(CONFIG.LOCAL_CONFIG_KEY, JSON.stringify(cfg));
  }

  /* ============================ STATE ============================= */
  let state = null;       // contenu d'accounts.json (chargé depuis GitHub)
  let currentSha = null;  // SHA du fichier au moment du dernier GET

  function defaultState() {
    const active = {};
    CONFIG.FUNCTIONS.forEach(fn => { active[fn] = { number: null, address: null }; });
    active.main   = { number: '006', address: buildAddress('main',   '006') };
    active.second = { number: '000', address: buildAddress('second', '000') };
    active.third  = { number: '000', address: buildAddress('third',  '000') };
    active.fourth = { number: '000', address: buildAddress('fourth', '000') };
    active.fifth  = { number: '000', address: buildAddress('fifth',  '000') };
    return { version: 1, updatedAt: nowISO(), active, archive: [] };
  }

  function sanitize(s) {
    if (!s || typeof s !== 'object') return defaultState();
    if (!s.active || typeof s.active !== 'object') s.active = {};
    CONFIG.FUNCTIONS.forEach(fn => {
      const a = s.active[fn];
      s.active[fn] = {
        number:  a && a.number  ? String(a.number)  : null,
        address: a && a.address ? String(a.address) : null
      };
    });
    if (!Array.isArray(s.archive)) s.archive = [];
    s.archive = s.archive.filter(e =>
      e && CONFIG.FUNCTIONS.includes(e.function) && e.number && e.address);
    if (!s.updatedAt) s.updatedAt = nowISO();
    return s;
  }

  /* ============================ GITHUB ============================ */

  function ghUrl() {
    const g = CONFIG.GITHUB;
    return `https://api.github.com/repos/${g.owner}/${g.repo}/contents/${g.path}`;
  }

  async function ghRead() {
    const url = `${ghUrl()}?ref=${encodeURIComponent(CONFIG.GITHUB.branch)}`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/vnd.github+json' },
      cache: 'no-store'
    });
    if (res.status === 404) return { state: null, sha: null };
    if (!res.ok) throw new Error('GET ' + res.status);
    const body = await res.json();
    return { state: JSON.parse(b64Decode(body.content)), sha: body.sha };
  }

  async function ghWrite(newState, pat, sha, message) {
    const payload = {
      message: message || `Update ${CONFIG.GITHUB.path}`,
      content: b64Encode(JSON.stringify(newState, null, 2)),
      branch: CONFIG.GITHUB.branch
    };
    if (sha) payload.sha = sha;

    const res = await fetch(ghUrl(), {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + pat,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 401) throw new Error('INVALID_TOKEN');
    if (res.status === 403) throw new Error('FORBIDDEN');
    if (res.status === 409) throw new Error('CONFLICT');
    if (res.status === 422) throw new Error('CONFLICT'); // SHA obsolète ou manquant
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('HTTP ' + res.status + ' — ' + txt.slice(0, 200));
    }
    const body = await res.json();
    return { sha: body.content.sha };
  }

  /* ======================== LOAD / REFRESH ======================== */

  async function load() {
    try {
      const { state: ghState, sha } = await ghRead();
      if (ghState) {
        state = sanitize(ghState);
        currentSha = sha;
      } else {
        state = defaultState();
        currentSha = null;
        toast('accounts.json not found on GitHub — will be created on first write.', 'warn');
      }
    } catch (e) {
      toast('Failed to load from GitHub: ' + e.message, 'error');
      state = defaultState();
      currentSha = null;
    }
  }

  async function refresh() {
    try {
      const { state: ghState, sha } = await ghRead();
      if (ghState) {
        state = sanitize(ghState);
        currentSha = sha;
        render();
        toast('Refreshed from GitHub.', 'ok');
      }
    } catch (e) {
      toast('Refresh failed: ' + e.message, 'error');
    }
  }

  /* ============================ RENDERING ========================= */

  function render() { renderActive(); renderArchive(); updateBanner(); }

  function renderActive() {
    const tbody = $('#active-body');
    tbody.innerHTML = '';

    CONFIG.FUNCTIONS.forEach(fn => {
      const a = state.active[fn];
      const tr = el('tr');

      tr.appendChild(el('td', 'mono', fn));

      const tdNum = el('td', 'mono' + (a.number ? '' : ' muted'));
      tdNum.textContent = a.number ? pad3(a.number) : '—';
      tr.appendChild(tdNum);

      const tdAddr = el('td');
      if (a.address) {
        const link = el('a', 'addr mono', a.address);
        link.href = CONFIG.LOGIN_URL; link.target = '_blank'; link.rel = 'noopener';
        tdAddr.appendChild(link);
      } else { tdAddr.className = 'muted'; tdAddr.textContent = '—'; }
      tr.appendChild(tdAddr);

      const tdStatus = el('td');
      const actions = el('div', 'row-actions');

      if (a.number) {
        const b = el('button', 'btn btn-green', 'Functional');
        b.addEventListener('click', () => handleArchive(fn));
        actions.appendChild(b);
      } else {
        const bNew = el('button', 'btn btn-orange', 'New');
        bNew.addEventListener('click', () => handleNew(fn));
        actions.appendChild(bNew);
        const bEdit = el('button', 'btn btn-ghost', 'Edit');
        bEdit.addEventListener('click', () => handleEdit(fn));
        actions.appendChild(bEdit);
      }
      tdStatus.appendChild(actions);
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });
  }

  function renderArchive() {
    const tbody = $('#archive-body');
    tbody.innerHTML = '';
    const rows = [];
    CONFIG.FUNCTIONS.forEach(fn => {
      state.archive
        .filter(e => e.function === fn)
        .sort((a, b) => String(a.archivedAt || '').localeCompare(String(b.archivedAt || '')))
        .forEach(e => rows.push(e));
    });
    $('#archive-empty').classList.toggle('hidden', rows.length > 0);

    rows.forEach(entry => {
      const tr = el('tr');
      tr.appendChild(el('td', 'mono', entry.function));
      tr.appendChild(el('td', 'mono muted', pad3(entry.number)));

      const tdAddr = el('td');
      const a = el('a', 'addr mono', entry.address);
      a.href = CONFIG.LOGIN_URL; a.target = '_blank'; a.rel = 'noopener';
      tdAddr.appendChild(a);
      tr.appendChild(tdAddr);

      const d = entry.archivedAt ? new Date(entry.archivedAt) : null;
      tr.appendChild(el('td', 'muted mono',
        d && !isNaN(d) ? d.toISOString().slice(0, 10) : '—'));

      const tdStatus = el('td');
      tdStatus.appendChild(el('span', 'badge ' + (entry.status || 'obsolete'),
        entry.status || 'obsolete'));
      tr.appendChild(tdStatus);

      const tdAction = el('td');
      const b = el('button', 'btn btn-gray', 'Restore');
      b.addEventListener('click', () => handleRestore(entry));
      tdAction.appendChild(b);
      tr.appendChild(tdAction);

      tbody.appendChild(tr);
    });
  }

  /* ============================ BANDEAU =========================== */

  function updateBanner() {
    const cfg = loadConfig();
    const banner = $('#pat-banner');
    if (!banner) return;

    if (!cfg.patExpires) { banner.classList.add('hidden'); return; }

    const expires = new Date(cfg.patExpires + 'T00:00:00');
    const days = Math.ceil((expires - Date.now()) / 86400000);

    if (days > 7) { banner.classList.add('hidden'); return; }

    banner.classList.remove('hidden');
    if (days <= 0) {
      banner.className = 'banner danger';
      banner.innerHTML = `<strong>GitHub token expired.</strong>
        Writes are disabled. Renew it at
        <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">github.com/settings/tokens</a>,
        then update the expiration date in settings.`;
    } else {
      banner.className = 'banner warn';
      banner.innerHTML = `<strong>GitHub token expires in ${days} day${days > 1 ? 's' : ''}.</strong>
        Renew it at
        <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">github.com/settings/tokens</a>,
        then update the expiration date in settings.`;
    }
  }

  /* ============================== MODAL =========================== */

  let modalResolve = null;

  function openModal({ title, body = '', okLabel = 'Confirm' }) {
    return new Promise(resolve => {
      modalResolve = resolve;
      $('#modal-title').textContent = title;
      $('#modal-body').innerHTML = body;
      $('#modal-error').textContent = '';
      $('#modal-ok').textContent = okLabel;
      $('#modal').classList.remove('hidden');
      setTimeout(() => {
        const first = $('#modal-body input, #modal-body textarea');
        if (first) first.focus();
      }, 0);
    });
  }

  function closeModal(result) {
    $('#modal').classList.add('hidden');
    const r = modalResolve;
    modalResolve = null;
    if (r) r(result);
  }

  $('#modal-ok').addEventListener('click', () => {
    const pat = $('#modal-body [name="github-pat"]');
    if (pat && !pat.value.trim()) {
      $('#modal-error').textContent = 'Token required.';
      pat.focus();
      return;
    }
    closeModal({ root: $('#modal-body') });
  });
  $('#modal-cancel').addEventListener('click', () => closeModal(null));
  $('#modal-body').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const t = e.target;
      if (t.tagName === 'INPUT') { e.preventDefault(); $('#modal-ok').click(); }
    }
    if (e.key === 'Escape') closeModal(null);
  });
  $('#modal').addEventListener('click', e => {
    if (e.target === $('#modal')) closeModal(null);
  });

  /* ========================== WRITE FLOW ========================== */

  // Flow unifié : prompt PAT → mutation → PUT → gestion 401/409
  async function performWrite(describeFn, applyFn, commitMsg) {
    const prompt = describeFn();

    const bodyHtml = `
      <p>${prompt.description}</p>
      <label class="pat-label">GitHub token
        <input type="password" name="github-pat" autocomplete="current-password"
               spellcheck="false" placeholder="github_pat_..." required>
      </label>
    `;

    const res = await openModal({
      title: prompt.title,
      body: bodyHtml,
      okLabel: prompt.okLabel || 'Confirm'
    });
    if (!res) return;

    const pat = res.root.querySelector('[name="github-pat"]').value.trim();

    const previousState = JSON.parse(JSON.stringify(state));
    const previousSha = currentSha;

    applyFn(state);
    state.updatedAt = nowISO();

    try {
      const { sha } = await ghWrite(state, pat, currentSha, commitMsg);
      currentSha = sha;
      render();
      toast('Saved to GitHub.', 'ok');
    } catch (e) {
      state = previousState;
      currentSha = previousSha;

      if (e.message === 'INVALID_TOKEN') {
        toast('Invalid GitHub token.', 'error');
      } else if (e.message === 'FORBIDDEN') {
        toast('Token lacks write permission on this repo.', 'error');
      } else if (e.message === 'CONFLICT') {
        toast('Conflict detected — reloading and retrying…', 'warn');
        try {
          const { state: fresh, sha: freshSha } = await ghRead();
          state = fresh ? sanitize(fresh) : defaultState();
          currentSha = freshSha;
          applyFn(state);
          state.updatedAt = nowISO();
          const { sha } = await ghWrite(state, pat, currentSha, commitMsg);
          currentSha = sha;
          render();
          toast('Saved after conflict resolution.', 'ok');
        } catch (e2) {
          toast('Retry failed: ' + e2.message, 'error');
          render();
        }
      } else {
        toast('Write failed: ' + e.message, 'error');
        render();
      }
    }
  }

  /* ============================ ACTIONS =========================== */

  function handleArchive(fn) {
    const a = state.active[fn];
    if (!a.number) return;

    performWrite(
      () => ({
        title: 'Archive account',
        description: `Archive <strong class="mono">${esc(a.address)}</strong> and mark it obsolete?`,
        okLabel: 'Archive'
      }),
      (s) => {
        s.archive.push({
          function: fn, number: a.number, address: a.address,
          archivedAt: nowISO(), status: 'obsolete'
        });
        const waiting = s.archive
          .filter(e => e.function === fn && e.status === 'waiting')
          .sort((x, y) => String(x.archivedAt || '').localeCompare(String(y.archivedAt || '')))[0];
        if (waiting) {
          s.archive = s.archive.filter(e => e !== waiting);
          s.active[fn] = { number: waiting.number, address: waiting.address };
        } else {
          s.active[fn] = { number: null, address: null };
        }
      },
      `Archive ${fn} (${a.number})`
    );
  }

  function nextNumber(fn) {
    const nums = [];
    const a = state.active[fn];
    if (a && a.number) nums.push(parseInt(a.number, 10));
    state.archive.filter(e => e.function === fn)
      .forEach(e => nums.push(parseInt(e.number, 10)));
    const valid = nums.filter(n => Number.isFinite(n));
    return (valid.length ? Math.max(...valid) : -1) + 1;
  }

  function handleNew(fn) {
    const n = nextNumber(fn);
    if (n > CONFIG.MAX_NUMBER) { toast("t'as abusé la frro", 'error'); return; }
    const number = pad3(n);
    const address = buildAddress(fn, number);

    performWrite(
      () => ({
        title: 'Create account',
        description: `Create <strong class="mono">${esc(address)}</strong> for function <strong>${esc(fn)}</strong>?`,
        okLabel: 'Create'
      }),
      (s) => { s.active[fn] = { number, address }; },
      `Create ${fn} (${number})`
    );
  }

  function handleEdit(fn) {
    const cur = state.active[fn];
    const bodyHtml = `
      <label>Number (000–999)
        <input id="edit-number" class="mono" maxlength="3"
               value="${esc(cur.number ? pad3(cur.number) : '')}" placeholder="000">
      </label>
      <label>Address
        <input id="edit-address" class="mono"
               value="${esc(cur.address || '')}" placeholder="${esc(buildAddress(fn, '000'))}">
      </label>
      <label class="pat-label">GitHub token
        <input type="password" name="github-pat" autocomplete="current-password"
               spellcheck="false" placeholder="github_pat_..." required>
      </label>
    `;

    openModal({ title: `Edit "${fn}"`, body: bodyHtml, okLabel: 'Save' }).then(res => {
      if (!res) return;

      const rawNum  = res.root.querySelector('#edit-number').value.trim();
      const rawAddr = res.root.querySelector('#edit-address').value.trim();
      const pat     = res.root.querySelector('[name="github-pat"]').value.trim();

      let number = null;
      if (rawNum !== '') {
        const parsed = parseInt(rawNum, 10);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > CONFIG.MAX_NUMBER) {
          toast("t'as abusé la frro", 'error'); return;
        }
        number = pad3(parsed);
      }
      let address = rawAddr || null;
      if (number && !address) address = buildAddress(fn, number);
      if (!number && address) {
        const m = address.match(/(\d{1,3})@/);
        if (m) number = pad3(parseInt(m[1], 10));
      }

      const previousState = JSON.parse(JSON.stringify(state));
      const previousSha = currentSha;
      state.active[fn] = { number, address };
      state.updatedAt = nowISO();

      ghWrite(state, pat, currentSha, `Edit ${fn}`)
        .then(({ sha }) => {
          currentSha = sha; render(); toast('Saved.', 'ok');
        })
        .catch(e => {
          state = previousState; currentSha = previousSha;
          if (e.message === 'INVALID_TOKEN') toast('Invalid GitHub token.', 'error');
          else if (e.message === 'CONFLICT') toast('Conflict — click Refresh and retry.', 'error');
          else toast('Write failed: ' + e.message, 'error');
          render();
        });
    });
  }

  function handleRestore(entry) {
    const fn = entry.function;
    const current = state.active[fn];

    performWrite(
      () => ({
        title: 'Restore account',
        description: `Restore <strong class="mono">${esc(entry.address)}</strong>?<br>
          The current account will be set to <em>waiting</em>.`,
        okLabel: 'Restore'
      }),
      (s) => {
        if (current.number) {
          s.archive.push({
            function: fn, number: current.number, address: current.address,
            archivedAt: nowISO(), status: 'waiting'
          });
        }
        s.archive = s.archive.filter(e => e !== entry);
        s.active[fn] = { number: entry.number, address: entry.address };
      },
      `Restore ${fn} (${entry.number})`
    );
  }

  /* =========================== SETTINGS =========================== */

  function openSettings() {
    const cfg = loadConfig();
    const bodyHtml = `
      <label>PAT expiration date
        <input type="date" id="cfg-pat-expires" value="${esc(cfg.patExpires || '')}">
      </label>
      <p class="hint">Used only for the expiration banner. Never stored as a secret.</p>
      <p class="hint">
        Repo: <span class="mono">${esc(CONFIG.GITHUB.owner)}/${esc(CONFIG.GITHUB.repo)}@${esc(CONFIG.GITHUB.branch)}/${esc(CONFIG.GITHUB.path)}</span><br>
        To change the repo, edit <span class="mono">app.js</span>.
      </p>
    `;
    openModal({ title: 'Settings', body: bodyHtml, okLabel: 'Save' }).then(res => {
      if (!res) return;
      saveConfig({ patExpires: res.root.querySelector('#cfg-pat-expires').value });
      updateBanner();
      toast('Settings saved.', 'ok');
    });
  }

  /* ============================ WIRING ============================ */

  $('#btn-refresh').addEventListener('click', refresh);
  $('#btn-settings').addEventListener('click', openSettings);

  /* ============================= BOOT ============================= */

  load().then(render);
})();