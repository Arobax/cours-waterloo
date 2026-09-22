(() => {
  'use strict';

  /* ============================ CONFIG ============================ */
  const CONFIG = {
    PASSWORD: 'daala',                 // mot de passe simple des modifications
    PREFIX: 'daala',
    MAIL_DOMAIN: 'proton.me',
    FUNCTIONS: ['main', 'second', 'third', 'fourth', 'fifth'],
    LOGIN_URL: 'https://mail.proton.me/',
    MAX_NUMBER: 999,
    STORAGE_KEY: 'account-manager:state:v1',
    SEED_FILE: './accounts.json'
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

  let toastTimer;
  function toast(msg, kind = 'info') {
    const t = $('#toast');
    t.textContent = msg;
    t.dataset.kind = kind;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
  }

  /* ============================= STATE ============================ */
  let state = null;

  function defaultState() {
    const active = {};
    CONFIG.FUNCTIONS.forEach(fn => { active[fn] = { number: null, address: null }; });
    active.main   = { number: '000', address: buildAddress('main', '000') };
    active.second = { number: '000', address: buildAddress('second', '000') };
    active.third  = { number: '000', address: buildAddress('third', '000') };
    active.fourth = { number: '000', address: buildAddress('fourth', '000') };
    active.fifth  = { number: '000', address: buildAddress('fifth', '000') };
    return { version: 1, updatedAt: nowISO(), active, archive: [] };
  }

  function sanitize(s) {
    if (!s || typeof s !== 'object') return defaultState();
    if (!s.active || typeof s.active !== 'object') s.active = {};
    CONFIG.FUNCTIONS.forEach(fn => {
      const a = s.active[fn];
      s.active[fn] = {
        number: a && a.number ? String(a.number) : null,
        address: a && a.address ? String(a.address) : null
      };
    });
    if (!Array.isArray(s.archive)) s.archive = [];
    s.archive = s.archive.filter(e =>
      e && CONFIG.FUNCTIONS.includes(e.function) && e.number && e.address);
    return s;
  }

  function save() {
    state.updatedAt = nowISO();
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Local storage full.', 'error');
    }
  }

  async function load() {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (raw) {
      try { state = sanitize(JSON.parse(raw)); return; } catch (_) { /* fallthrough */ }
    }
    try {
      const res = await fetch(CONFIG.SEED_FILE, { cache: 'no-store' });
      if (res.ok) { state = sanitize(await res.json()); save(); return; }
    } catch (_) { /* offline / not deployed yet */ }
    state = defaultState();
    save();
  }

  /* ============================ NUMBERING ========================= */
  function nextNumber(fn) {
    const nums = [];
    const a = state.active[fn];
    if (a && a.number) nums.push(parseInt(a.number, 10));
    state.archive
      .filter(e => e.function === fn)
      .forEach(e => nums.push(parseInt(e.number, 10)));
    const valid = nums.filter(n => Number.isFinite(n));
    const max = valid.length ? Math.max(...valid) : -1;
    return max + 1;
  }

  /* ============================= MODAL ============================ */
  let modalResolve = null;

  function openModal({ title, body = '', okLabel = 'Confirm' }) {
    return new Promise(resolve => {
      modalResolve = resolve;
      $('#modal-title').textContent = title;
      $('#modal-body').innerHTML = body;
      $('#modal-input').value = '';
      $('#modal-error').textContent = '';
      $('#modal-ok').textContent = okLabel;
      $('#modal').classList.remove('hidden');
      setTimeout(() => $('#modal-input').focus(), 0);
    });
  }

  function closeModal(result) {
    $('#modal').classList.add('hidden');
    const r = modalResolve;
    modalResolve = null;
    if (r) r(result);
  }

  $('#modal-ok').addEventListener('click', () => {
    const pwd = $('#modal-input').value;
    if (pwd !== CONFIG.PASSWORD) {
      $('#modal-error').textContent = 'Wrong password.';
      $('#modal-input').select();
      return;
    }
    closeModal({ pwd, root: $('#modal-body') });
  });
  $('#modal-cancel').addEventListener('click', () => closeModal(null));
  $('#modal-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('#modal-ok').click();
    if (e.key === 'Escape') closeModal(null);
  });
  $('#modal').addEventListener('click', e => {
    if (e.target === $('#modal')) closeModal(null);
  });

  /* ============================ RENDERING ========================= */
  function render() { renderActive(); renderArchive(); }

  function renderActive() {
    const tbody = $('#active-body');
    tbody.innerHTML = '';

    CONFIG.FUNCTIONS.forEach(fn => {
      const a = state.active[fn];
      const tr = el('tr');

      tr.appendChild(el('td', 'mono', fn));

      // Number
      const tdNum = el('td', 'mono' + (a.number ? '' : ' muted'));
      tdNum.textContent = a.number ? pad3(a.number) : '—';
      tr.appendChild(tdNum);

      // Address
      const tdAddr = el('td');
      if (a.address) {
        const link = el('a', 'addr mono', a.address);
        link.href = CONFIG.LOGIN_URL;
        link.target = '_blank';
        link.rel = 'noopener';
        tdAddr.appendChild(link);
      } else {
        tdAddr.className = 'muted';
        tdAddr.textContent = '—';
      }
      tr.appendChild(tdAddr);

      // Status
      const tdStatus = el('td');
      const actions = el('div', 'row-actions');

      if (a.number) {
        const b = el('button', 'btn btn-green', 'Functional');
        b.title = 'Archive this account and mark it obsolete';
        b.addEventListener('click', () => handleArchive(fn));
        actions.appendChild(b);
      } else {
        const bNew = el('button', 'btn btn-orange', 'New');
        bNew.title = 'Create the next account for this function';
        bNew.addEventListener('click', () => handleNew(fn));
        actions.appendChild(bNew);

        const bEdit = el('button', 'btn btn-ghost', 'Edit');
        bEdit.title = 'Fix number / address manually (error recovery)';
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

  /* ============================ ACTIONS =========================== */

  async function handleArchive(fn) {
    const a = state.active[fn];
    if (!a.number) return;

    const res = await openModal({
      title: 'Archive account',
      body: `<p>Archive <strong class="mono">${esc(a.address)}</strong> and mark it obsolete?</p>`,
      okLabel: 'Archive'
    });
    if (!res) return;

    state.archive.push({
      function: fn,
      number: a.number,
      address: a.address,
      archivedAt: nowISO(),
      status: 'obsolete'
    });

    // Un compte "waiting" reprend sa place s'il existe.
    const waiting = state.archive
      .filter(e => e.function === fn && e.status === 'waiting')
      .sort((x, y) => String(x.archivedAt || '').localeCompare(String(y.archivedAt || '')))[0];

    if (waiting) {
      state.archive = state.archive.filter(e => e !== waiting);
      state.active[fn] = { number: waiting.number, address: waiting.address };
      toast(`Restored ${waiting.address} from waiting.`, 'ok');
    } else {
      state.active[fn] = { number: null, address: null };
      toast('Account archived.', 'ok');
    }

    save(); render();
  }

  async function handleNew(fn) {
    const n = nextNumber(fn);

    if (n > CONFIG.MAX_NUMBER) {
      toast("t'as abusé la frro", 'error');
      return;
    }

    const number = pad3(n);
    const address = buildAddress(fn, number);

    const res = await openModal({
      title: 'Create account',
      body: `<p>Create <strong class="mono">${esc(address)}</strong> for function
             <strong>${esc(fn)}</strong>?</p>`,
      okLabel: 'Create'
    });
    if (!res) return;

    state.active[fn] = { number, address };
    save(); render();
    toast('Account created.', 'ok');
  }

  async function handleEdit(fn) {
    const cur = state.active[fn];
    const body = `
      <label>Number (000–999)</label>
      <input id="edit-number" class="mono" maxlength="3"
             value="${esc(cur.number ? pad3(cur.number) : '')}" placeholder="000" />
      <label>Address</label>
      <input id="edit-address" class="mono"
             value="${esc(cur.address || '')}" placeholder="${esc(buildAddress(fn, '000'))}" />
    `;

    const res = await openModal({ title: `Edit "${fn}"`, body, okLabel: 'Save' });
    if (!res) return;

    const rawNum = res.root.querySelector('#edit-number').value.trim();
    const rawAddr = res.root.querySelector('#edit-address').value.trim();

    let number = null;
    if (rawNum !== '') {
      const parsed = parseInt(rawNum, 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > CONFIG.MAX_NUMBER) {
        toast("t'as abusé la frro", 'error');
        return;
      }
      number = pad3(parsed);
    }

    let address = rawAddr || null;
    if (number && !address) address = buildAddress(fn, number);
    if (!number && address) {
      const m = address.match(/(\d{1,3})@/);
      if (m) number = pad3(parseInt(m[1], 10));
    }

    state.active[fn] = { number, address };
    save(); render();
    toast('Saved.', 'ok');
  }

  async function handleRestore(entry) {
    const fn = entry.function;
    const current = state.active[fn];

    const res = await openModal({
      title: 'Restore account',
      body: `<p>Restore <strong class="mono">${esc(entry.address)}</strong>?<br>
             The current account will be set to <em>waiting</em>.</p>`,
      okLabel: 'Restore'
    });
    if (!res) return;

    if (current.number) {
      state.archive.push({
        function: fn,
        number: current.number,
        address: current.address,
        archivedAt: nowISO(),
        status: 'waiting'
      });
    }

    state.archive = state.archive.filter(e => e !== entry);
    state.active[fn] = { number: entry.number, address: entry.address };

    save(); render();
    toast('Account restored.', 'ok');
  }

  /* ============================ EXPORT ============================ */
  function exportJSON() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'accounts.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('accounts.json downloaded — commit it to publish.', 'ok');
  }

  $('#btn-export').addEventListener('click', exportJSON);

  $('#btn-reset').addEventListener('click', async () => {
    const res = await openModal({
      title: 'Reset local state',
      body: '<p>Discard local changes and reload from <span class="mono">accounts.json</span>?</p>',
      okLabel: 'Reset'
    });
    if (!res) return;
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    location.reload();
  });

  /* ============================= BOOT ============================= */
  load().then(render);
})();