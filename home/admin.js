/* Panneau d'administration (chargé à l'ouverture de l'accordéon de /home). Dépend de db.js. */
window.cwAdmin = function (root) {
  const KEY = 'cw-admin-draft';
  let db, orig, sha, mf = null, warn = '', open = {};
  const info = d => !mf ? '' : mf[d]?.length ? ` — ✔ ${mf[d].length} fichier(s) détecté(s)` : ' — ⚠ dossier introuvable ou vide (au dernier déploiement)';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const get = p => p.split('.').reduce((o, k) => o?.[k], db);
  const set = (p, v) => { const k = p.split('.'), l = k.pop(); k.reduce((o, x) => o[x], db)[l] = v; };
  const rid = () => Math.random().toString(36).slice(2, 7);
  const dirty = () => JSON.stringify(db) !== JSON.stringify(orig);

  const st = document.createElement('style');
  st.textContent = `.ad{background:#fffaf4;color:#211009;border-radius:16px;padding:22px;text-align:left;font:.95rem/1.5 'DM Sans',sans-serif;margin-top:16px}
.ad *{box-sizing:border-box}.ad button{font:inherit;cursor:pointer;border:1px solid #dfc4a0;background:#fdf0e0;color:#211009;border-radius:99px;padding:6px 14px}
.ad button.go{background:#b85c38;border-color:#b85c38;color:#fff;font-weight:600}
.ad .bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;position:sticky;top:0;background:#fffaf4;padding:6px 0 14px;z-index:2}.ad .bar span{flex:1;color:#7a5a45}
.ad details{border:1px solid #dfc4a0;border-radius:12px;margin-bottom:10px;background:#fff}
.ad summary{padding:12px 16px;cursor:pointer;font:600 1.05rem 'Playfair Display',serif;color:#211009;list-style:revert}.ad summary:hover{color:#b85c38}.ad details>div{padding:0 16px 16px}
.ad .it{border:1px solid #dfc4a0;border-radius:10px;padding:12px;margin:10px 0;background:#fdf0e0}
.ad .ih{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.ad .ih button{padding:2px 10px;margin-left:4px}
.ad .f{display:inline-flex;flex-direction:column;margin:0 12px 10px 0;font-size:.8rem;color:#7a5a45;vertical-align:top}
.ad input,.ad select{font:inherit;padding:6px 10px;border:1px solid #dfc4a0;border-radius:8px;background:#fff;color:#211009;min-width:190px}
.ad input[type=color]{min-width:60px;height:36px;padding:2px}.ad .yr label{display:inline-flex;gap:4px;margin-right:12px;font-size:.85rem}.ad .yr input{min-width:0}
.ad .hn{display:block;font-size:.78rem;color:#7a5a45;margin:-4px 0 8px}
.ad .mod{position:fixed;inset:0;background:rgba(33,16,9,.6);display:flex;align-items:center;justify-content:center;z-index:50}
.ad .box{background:#fffaf4;border-radius:16px;padding:24px;width:min(580px,92vw);max-height:90vh;overflow:auto}
.ad .box ul{max-height:190px;overflow:auto;font-size:.82rem;padding-left:18px;color:#7a5a45}.ad .err{color:#b3261e}.ad .ok{color:#2e7d32}.ad .sw{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;max-width:240px}.ad .sw button{width:20px;height:20px;padding:0;border-radius:50%;border:1px solid #b9a085}`;
  document.head.append(st);

  const PAL = ['#211009', '#b85c38', '#d4804a', '#c9962b', '#7a2e2e', '#5e3a52', '#3f5f73', '#6b7a3a', '#8fa37e', '#d9a79a', '#f5e0c8', '#fdf0e0', '#fffaf4'];
  const sw = p => `<span class="sw">${PAL.map(c => `<button type="button" data-c="${c}" data-p="${p}" style="background:${c}" title="${c}"></button>`).join('')}</span>`;
  const F = (p, l, t = 'text', o) => `<label class="f"><span>${l}</span>${t === 'select'
    ? `<select data-p="${p}">${o.map(x => `<option value="${x[0]}"${get(p) === x[0] ? ' selected' : ''}>${x[1]}</option>`).join('')}</select>`
    : `<input type="${t}" data-p="${p}" value="${esc(get(p))}">`}${t === 'color' ? sw(p) : ''}</label>`;
  const L = (p, fn) => `${(get(p) || []).map((it, i) => `<div class="it"><div class="ih"><b>${esc(it.nom || it.titre || it.label || 'Sans titre')}</b><span>${['up|↑', 'dn|↓', 'rm|✕'].map(x => `<button data-a="${x.split('|')[0]}" data-p="${p}" data-i="${i}">${x.split('|')[1]}</button>`).join('')}</span></div>${fn(p + '.' + i)}</div>`).join('')}<button data-a="add" data-p="${p}">+ Ajouter</button>`;
  const mk = p => /unites$/.test(p) ? { id: 'u' + rid(), titre: 'Nouvelle unité', dossier: 'u-' + rid(), statut: 'brouillon' }
    : /matieres$/.test(p) ? { id: 'm' + rid(), titre: 'Nouvelle matière', sousTitre: '', annees: [], emoji: '📚', couleur: '#b85c38', unites: [] }
    : /disponibilites/.test(p) ? { label: 'Nouveau créneau', status: 'available', text: 'Disponible' }
    : { id: rid(), nom: 'Nouveau', lien: '/', description: '', couleurFond: '#fdf0e0', couleurTexte: '#211009', emojis: '✨' };
  const widget = p => F(p + '.nom', 'Nom') + F(p + '.lien', 'Lien (ex. /routine/)') + F(p + '.description', 'Description') + F(p + '.emojis', 'Emoji(s)') + F(p + '.couleurFond', 'Fond', 'color') + F(p + '.couleurTexte', 'Texte', 'color');
  const ST = [['available', 'Disponible'], ['partial', 'Partiel'], ['unavailable', 'Indisponible']];
  const unite = p => F(p + '.titre', 'Titre de l\'unité') + F(p + '.statut', 'Statut', 'select', [['visible', 'Visible'], ['brouillon', 'Brouillon']]) + F(p + '.dossier', 'Dossier') + `<span class="hn">Dépose les fichiers dans /syntheses/content/${esc(get(p + '.dossier'))}/${info(get(p + '.dossier'))}</span>`;
  const matiere = p => F(p + '.titre', 'Titre') + F(p + '.sousTitre', 'Sous-titre') + F(p + '.emoji', 'Emoji') + F(p + '.couleur', 'Couleur', 'color')
    + `<div class="yr">${db.syntheses.annees.map(a => `<label><input type="checkbox" data-p="${p}.annees" data-v="${esc(a)}"${(get(p + '.annees') || []).includes(a) ? ' checked' : ''}>${esc(a)}</label>`).join('')}</div><b>Unités</b>${L(p + '.unites', unite)}`;
  const person = k => `<b>${k}</b><br>${F('config.' + k + '.phone', 'Téléphone')}${F('config.' + k + '.email', 'Email')}${L('disponibilites.' + k, p => F(p + '.label', 'Créneau') + F(p + '.text', 'Texte') + F(p + '.status', 'Statut', 'select', ST))}`;
  const SEC = [['Contacts et disponibilités', () => person('damien') + '<hr>' + person('mathieu')], ['Outils', () => L('outils', widget)], ['Archives de présentations', () => L('presentations', widget)], ['Synthèses : matières et unités', () => L('syntheses.matieres', matiere)]];

  const render = () => {
    root.innerHTML = `<div class="ad"><div class="bar"><span id="st"></span><button data-a="discard">Abandonner le brouillon</button><button class="go" data-a="push">push editing</button></div>${SEC.map((s, i) => `<details data-s="${i}"${open[i] ? ' open' : ''}><summary>${s[0]}</summary><div>${s[1]()}</div></details>`).join('')}</div>`;
    status();
  };
  const status = () => { const e = root.querySelector('#st'); if (e) e.textContent = (dirty() ? 'Brouillon non poussé' : 'À jour avec le site') + warn; };
  const save = () => { try { dirty() ? localStorage.setItem(KEY, JSON.stringify({ sha, db })) : localStorage.removeItem(KEY); } catch {} status(); };

  const diff = (a, b, p, o) => {
    if (a && b && typeof a == 'object' && typeof b == 'object') new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => diff(a[k], b[k], p ? p + '.' + k : k, o));
    else if (JSON.stringify(a) !== JSON.stringify(b)) { const s = v => (JSON.stringify(v) || '').slice(0, 50); o.push(a === undefined ? `+ ${p} : ${s(b)}` : b === undefined ? `− ${p}` : `${p} : ${s(a)} → ${s(b)}`); }
    return o;
  };

  root.addEventListener('toggle', e => { if (e.target.dataset.s) open[e.target.dataset.s] = e.target.open; }, true);
  root.addEventListener('input', e => {
    const t = e.target, p = t.dataset.p; if (!p) return;
    if (t.dataset.v !== undefined) { const a = get(p) || []; set(p, t.checked ? [...a, t.dataset.v] : a.filter(x => x !== t.dataset.v)); }
    else set(p, t.value);
    save();
  });
  root.addEventListener('click', async e => {
    const w = e.target.closest('[data-c]');
    if (w) { set(w.dataset.p, w.dataset.c); root.querySelector(`input[type=color][data-p="${w.dataset.p}"]`).value = w.dataset.c; save(); return; }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a, p = b.dataset.p, i = +b.dataset.i;
    if (a === 'add') get(p).push(mk(p));
    else if (a === 'rm') { if (!confirm('Supprimer cet élément ?')) return; get(p).splice(i, 1); }
    else if (a === 'up' || a === 'dn') { const l = get(p), j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; }
    else if (a === 'discard') { if (!dirty() || !confirm('Abandonner toutes les modifications non poussées ?')) return; db = structuredClone(orig); warn = ''; }
    else if (a === 'push') return modal();
    else if (a === 'cancel') return root.querySelector('.mod')?.remove();
    save(); render();
  });

  function modal() {
    const d = diff(orig, db, '', []);
    if (!d.length) return alert('Aucune modification à envoyer.');
    const m = document.createElement('form');
    m.className = 'mod';
    m.innerHTML = `<div class="box"><h3>Envoyer ${d.length} modification(s)</h3><ul>${d.slice(0, 60).map(x => `<li>${esc(x)}</li>`).join('')}${d.length > 60 ? '<li>…</li>' : ''}</ul>
<label class="f"><span>Utilisateur</span><input name="username" value="cours-waterloo-admin" autocomplete="username" readonly></label>
<label class="f"><span>Token GitHub</span><input type="password" name="password" autocomplete="current-password" required></label>
<div id="msg" class="err"></div><button type="button" data-a="cancel">Annuler</button> <button type="submit" class="go">Envoyer</button></div>`;
    m.onsubmit = async ev => {
      ev.preventDefault();
      const f = m.elements.password, msg = m.querySelector('#msg'), tok = f.value; msg.className = ''; msg.textContent = 'Envoi…';
      try {
        const r = await fetch(DB.url, { method: 'PUT', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Mise à jour via le panneau admin', content: btoa(unescape(encodeURIComponent(JSON.stringify(db, null, 2) + '\n'))), sha, branch: DB.branch }) });
        f.value = '';
        if (!r.ok) throw new Error({ 401: 'Token invalide ou expiré.', 403: 'Droits insuffisants : le token doit avoir « Contents : lecture/écriture » sur ce repo.', 404: 'Repo ou fichier introuvable, ou token sans accès à ce repo.', 409: 'Conflit : db.json a changé entre-temps. Recharge la page.', 422: 'Conflit : db.json a changé entre-temps. Recharge la page.' }[r.status] || `Erreur GitHub ${r.status}.`);
        sha = (await r.json()).content.sha; orig = structuredClone(db); warn = ''; save();
        msg.className = 'ok'; msg.textContent = 'Envoyé. Le site se met à jour d\'ici environ une minute.';
        setTimeout(() => { m.remove(); render(); }, 2500);
      } catch (err) { msg.className = 'err'; msg.textContent = err.message === 'Failed to fetch' ? 'Réseau indisponible.' : err.message; }
    };
    root.querySelector('.ad').append(m);
  }

  (async () => {
    root.textContent = 'Chargement…';
    try {
      const r = await fetch(`${DB.url}?ref=${DB.branch}`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
      if (!r.ok) throw new Error('Lecture impossible (' + r.status + ')');
      const j = await r.json(); sha = j.sha;
      orig = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\s/g, '')))));
      try { const m = await fetch('/syntheses/content/manifest.json', { cache: 'no-store' }); if (m.ok) mf = await m.json(); } catch {}
      let d; try { d = JSON.parse(localStorage.getItem(KEY)); } catch {}
      db = d?.db || structuredClone(orig);
      if (d?.db && d.sha !== sha) warn = ' — attention : la base a changé depuis ce brouillon';
      render();
    } catch (e) { root.textContent = 'Erreur : ' + e.message; }
  })();
};
