import { Game } from './game.js';
import * as R from './rules.js';
import { SPRITE, pieceSVG, PIECE_NAMES } from './pieces.js';
import { Engine, loadConfig } from './engine.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BG = { w: '#E8EAF6', b: '#C5CAE9' }; // fond plus clair au tour des Blancs, plus foncé à celui des Noirs
const SETTINGS_KEY = 'chess-app:settings:v1';

const settings = Object.assign({ layout: 'horizontal', swap: false, evalOn: false, auto: { w: false, b: false } },
  (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } })());
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* */ } };

const ecfg = loadConfig(), engine = new Engine(ecfg);
const game = new Game();
game.restore();
$('#sprite').innerHTML = SPRITE;

const state = { sel: null, targets: new Map(), armed: null, orient: null, turnShown: null, busy: false, drag: null, dirty: false, rot: null, bgNow: BG.w, evalVal: null, evalNote: null, thinking: null, warned: false };
const boardEl = $('#board'), zone = $('#boardZone');

// ---------- orientation ----------
function computeOrient() {
  switch (settings.layout) {
    case 'horizontal': return settings.swap ? 'E' : 'W'; // Blancs à gauche (W) ou à droite (E)
    case 'vrotate': return game.pos.turn === 'w' ? 'S' : 'N';
    case 'vwhite': return 'S';
    default: return 'N';
  }
}
const cellOf = (sq, o) => { const f = sq & 7, r = sq >> 3; return o === 'S' ? [f, r] : o === 'N' ? [7 - f, 7 - r] : o === 'W' ? [7 - r, f] : [r, 7 - f]; };
const squareSize = () => boardEl.firstElementChild ? boardEl.firstElementChild.getBoundingClientRect().width : 64;

// ---------- dessin ----------
function drawBoard() {
  const o = state.orient, st = game.status(), last = game.entries.at(-1);
  boardEl.textContent = '';
  zone.className = `board-zone o-${o}`; document.body.dataset.orient = o;
  boardEl.classList.toggle('pending', game.mode === 'creative' && game.pending);
  const rowIsRank = o === 'S' || o === 'N';
  for (let sq = 0; sq < 64; sq++) {
    const [c, r] = cellOf(sq, o), f = sq & 7, rk = sq >> 3, p = game.work[sq];
    const d = document.createElement('div');
    d.className = 'sq ' + ((f + rk) % 2 === 0 ? 'l' : 'd');
    d.style.gridColumn = c + 1; d.style.gridRow = r + 1; d.dataset.i = sq; d.dataset.sq = R.sqName(sq);
    if (last && last.hl.includes(sq)) d.classList.add('last');
    if (state.sel === sq) d.classList.add('sel');
    if (state.targets.has(sq)) { d.classList.add('tgt'); if (game.work[sq] || state.targets.get(sq)[0].type === 'e') d.classList.add('cap'); }
    if (p && (p === 'K' || p === 'k') && st.check[R.colorOf(p)]) d.classList.add('check');
    if (c === 0) d.insertAdjacentHTML('beforeend', `<span class="coord a">${rowIsRank ? 8 - rk : R.FILES[f]}</span>`);
    if (r === 7) d.insertAdjacentHTML('beforeend', `<span class="coord b">${rowIsRank ? R.FILES[f] : 8 - rk}</span>`);
    if (p) {
      const s = document.createElement('span'); s.className = 'piece'; s.innerHTML = pieceSVG(p);
      s.setAttribute('aria-label', `${PIECE_NAMES[p.toLowerCase()]} ${R.colorOf(p) === 'w' ? 'blanc' : 'noir'} en ${R.sqName(sq)}`);
      if (state.drag && state.drag.from === sq && state.drag.active) s.classList.add('ghosted');
      d.append(s);
    }
    boardEl.append(d);
  }
}

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
function captured() {
  const start = { p: 8, n: 2, b: 2, r: 2, q: 1 }, cnt = { w: {}, b: {} };
  for (const p of game.work) if (p) { const c = R.colorOf(p), t = p.toLowerCase(); cnt[c][t] = (cnt[c][t] || 0) + 1; }
  const lost = { w: [], b: [] }, mat = { w: 0, b: 0 };
  for (const c of ['w', 'b']) for (const t of 'qrbnp') {
    const have = cnt[c][t] || 0; mat[c] += have * VAL[t];
    for (let i = 0; i < Math.max(0, start[t] - have); i++) lost[c].push(c === 'w' ? t.toUpperCase() : t);
  }
  return { lost, diff: mat.w - mat.b };
}
function drawPanels() {
  const st = game.status(), cap = captured(), o = st.outcome;
  for (const c of ['w', 'b']) {
    const el = $(c === 'w' ? '#panelW' : '#panelB'), active = st.turn === c && !(o && game.mode === 'classic');
    el.classList.toggle('active', active);
    let msg;
    if (o && (game.mode === 'classic' || game.result)) msg = o.winner ? (o.winner === c ? 'Victoire' : 'Défaite') : 'Nulle';
    else if (active) msg = st.check[c] ? 'Échec !' : game.mode === 'creative' && game.pending ? 'Modifs en cours…' : state.thinking === c ? 'Stockfish réfléchit…' : settings.auto[c] && game.mode === 'classic' ? 'Stockfish va jouer' : 'À vous de jouer';
    else msg = 'En attente';
    const adv = c === 'w' ? cap.diff : -cap.diff;
    el.innerHTML = `<span class="dot"></span><div class="ava">${pieceSVG(c === 'w' ? 'K' : 'k')}</div><div class="who"><b>${c === 'w' ? 'Blancs' : 'Noirs'}${settings.auto[c] ? ' · SF' : ''}</b><span class="msg">${msg}</span><div class="cap">${cap.lost[c === 'w' ? 'b' : 'w'].map(pieceSVG).join('')}${adv > 0 ? `<i>+${adv}</i>` : ''}</div></div>`;
  }
}
function placePanels(o, animate) {
  const first = { S: 'b', N: 'w', W: 'w', E: 'b' }[o];
  const els = { w: $('#panelW'), b: $('#panelB') };
  const before = animate ? { w: els.w.getBoundingClientRect(), b: els.b.getBoundingClientRect() } : null;
  els[first].style.order = 0; els[first === 'w' ? 'b' : 'w'].style.order = 2; zone.style.order = 1;
  if (before && !reduced) for (const c of ['w', 'b']) {
    const a = before[c], b = els[c].getBoundingClientRect();
    els[c].animate([{ transform: `translate(${a.left - b.left}px,${a.top - b.top}px)` }, { transform: 'none' }], { duration: 300, easing: 'ease-out' });
  }
}
function drawBanner() {
  const st = game.status(), el = $('#banner'), o = st.outcome;
  if (!o || !st.blocking) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="bcard"><h3>${outcomeTitle(o)}</h3><p>${outcomeDetail(o)}</p><button class="btn" id="bnrNew">Nouvelle partie</button></div>`;
  $('#bnrNew').onclick = askNew;
}
const name = (c) => (c === 'w' ? 'Les Blancs' : 'Les Noirs');
const outcomeTitle = (o) => ({ checkmate: 'Échec et mat', stalemate: 'Pat', insufficient: 'Nulle', fifty: 'Nulle', threefold: 'Nulle', resign: 'Abandon', agreed: 'Nulle', kinglost: 'Roi capturé', nokings: 'Plus de rois' }[o.type]);
const outcomeDetail = (o) => o.winner ? `${name(o.winner)} gagnent.` : { stalemate: 'Aucun coup légal : partie nulle.', insufficient: 'Matériel insuffisant.', fifty: 'Règle des 50 coups.', threefold: 'Triple répétition.', agreed: 'Nulle par accord.', nokings: 'Aucun roi sur le plateau.' }[o.type] || 'Partie nulle.';
function drawControls() {
  const st = game.status(), cr = game.mode === 'creative';
  document.body.dataset.mode = game.mode; document.body.dataset.layout = settings.layout;
  $$('#modeSwitch button').forEach((b) => b.classList.toggle('on', b.dataset.mode === game.mode));
  $$('#layoutChips button').forEach((b) => b.classList.toggle('on', b.dataset.layout === settings.layout));
  $('#swSwap').checked = settings.swap; $('#swSwap').closest('label').style.display = settings.layout === 'horizontal' ? '' : 'none';
  $('#swEval').checked = settings.evalOn; $('#swAutoW').checked = settings.auto.w; $('#swAutoB').checked = settings.auto.b;
  $('#evalBar').hidden = !settings.evalOn;
  $('#btnUndo').disabled = !game.canUndo; $('#btnRedo').disabled = !game.canRedo; $('#btnDiscard').disabled = !game.pending;
  $('#btnResign').disabled = $('#btnDraw').disabled = st.blocking;
  $('#btnBest').disabled = st.blocking;
  let line = '';
  if (st.outcome) line = `${outcomeTitle(st.outcome)} — ${outcomeDetail(st.outcome)}${game.mode === 'creative' ? ' (non bloquant en créatif)' : ''}`;
  else line = `Trait : ${st.turn === 'w' ? 'Blancs' : 'Noirs'}${st.check[st.turn] ? ' · échec' : ''}`;
  $('#statusLine').textContent = line;
  document.body.dataset.turn = st.turn;
  const ev = state.evalVal;
  $('#evalLabel').textContent = !settings.evalOn ? '' : state.evalNote ? '(position invalide)' : ev ? (ev.label || (ev.mate != null ? (ev.mate > 0 ? '+' : '−') + 'M' + Math.abs(ev.mate) : (ev.cp >= 0 ? '+' : '') + (ev.cp / 100).toFixed(1))) : engine.status === 'missing' ? '(absent)' : '…';
  $('#evalLabel').title = state.evalNote ? 'Stockfish ne peut pas analyser : ' + state.evalNote : '';
  const sf = $('#sfStatus'), labels = { idle: 'inactif', loading: 'chargement…', ready: 'prêt', missing: 'non installé', error: 'erreur' };
  sf.textContent = labels[engine.status]; sf.classList.toggle('ok', engine.status === 'ready');
}
function drawHistory() {
  const ol = $('#hist'); ol.textContent = '';
  const ext = game.extended; $('.side').classList.toggle('ext', ext);
  $('#notationBadge').textContent = ext ? '· notation étendue' : '· standard';
  const rows = []; let row = null;
  game.entries.forEach((e, i) => {
    const num = game._numberOf(i);
    if (e.side === 'w' || !row) { row = { num, w: null, b: null, wi: -1, bi: -1 }; rows.push(row); }
    if (e.side === 'w') { row.w = e; row.wi = i; } else { row.b = e; row.bi = i; }
  });
  const mv = (e, i) => { if (!e) return '<span class="mv"></span>'; return `<span class="mv${e.legal ? '' : ' illegal'}${i === game.entries.length - 1 ? ' last' : ''}">${esc(game.entryText(e))}</span>`; };
  for (const r of rows) {
    const li = document.createElement('li');
    li.innerHTML = ext ? `<span class="n">${r.num}.</span><span>${mv(r.w, r.wi)} ${mv(r.b, r.bi)}</span>` : `<span class="n">${r.num}.</span>${r.w ? mv(r.w, r.wi) : '<span class="mv">…</span>'}${mv(r.b, r.bi)}`;
    ol.append(li);
  }
  if (game.mode === 'creative' && game.pending) { const li = document.createElement('li'); li.innerHTML = `<span class="n"></span><span class="mv pend">modifs en cours…</span>`; ol.append(li); }
  ol.scrollTop = ol.scrollHeight;
}
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function drawText() { if (!state.dirty) $('#txt').value = game.toText(); }
function drawEval() {
  const ev = state.evalVal; let p = 50;
  if (ev) p = ev.mate != null ? (ev.mate > 0 ? 100 : 0) : 50 + 50 * Math.tanh(ev.cp / 600);
  $('#evalBar').style.setProperty('--p', p + '%');
}
function fit() {
  const stage = $('#stage'), hor = settings.layout === 'horizontal', o = state.orient || 'S';
  const pw = hor ? (innerWidth < 480 ? 58 : innerWidth < 720 ? 84 : 150) : 0;
  stage.style.setProperty('--pw', pw + 'px');
  const ev = settings.evalOn ? 24 : 0, vertBar = o === 'S' || o === 'N';
  const availW = stage.clientWidth - (hor ? 2 * pw + 24 : 0) - (vertBar ? ev : 0);
  const availH = Math.max(300, innerHeight - 56 - 40 - (hor ? 0 : 2 * 76 + 24) - (vertBar ? 0 : ev));
  const cell = Math.max(28, Math.min(88, Math.floor(Math.min(availW, availH) / 8)));
  document.documentElement.style.setProperty('--cell', cell + 'px');
}

function drawAll(orient) {
  state.orient = orient;
  drawBoard(); drawPanels(); drawControls(); drawHistory(); drawText(); drawBanner(); drawEval(); fit();
}

// ---------- tour : bulle d'expansion ----------
function bubble(turn) {
  const layer = $('#bgLayer'), target = BG[turn];
  layer.textContent = ''; layer.style.background = state.bgNow; state.bgNow = target;
  if (reduced) { layer.style.background = target; return; }
  const dot = $(`.player[data-color="${turn}"] .dot`) || $(`.player[data-color="${turn}"]`);
  const r = dot.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const R_ = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
  const b = document.createElement('div'); b.className = 'bubble';
  b.style.cssText = `left:${cx}px;top:${cy}px;width:${2 * R_}px;height:${2 * R_}px;margin:${-R_}px 0 0 ${-R_}px;background:${target}`;
  layer.append(b);
  b.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 750, easing: 'cubic-bezier(.2,.7,.25,1)' }).onfinish = () => { if (b.isConnected) { layer.style.background = target; b.remove(); } };
}

// ---------- rendu global ----------
function render(info = {}) {
  finishRotation();
  const desired = computeOrient(), prev = state.orient;
  state.sel = info.keepSel ? state.sel : null;
  state.targets = new Map();
  if (state.sel != null && game.mode === 'classic') for (const m of game.legalFrom(state.sel)) { const a = state.targets.get(m.to) || []; a.push(m); state.targets.set(m.to, a); }
  const rotate = !reduced && info.kind === 'move' && settings.layout === 'vrotate' && prev && prev !== desired && !info.instant;
  if (rotate) { drawAll(prev); startRotation(desired); } else { drawAll(desired); placePanels(desired, !!prev && prev !== desired); }
  if (state.turnShown !== game.pos.turn) {
    if (state.turnShown === null) { $('#bgLayer').style.background = BG[game.pos.turn]; state.bgNow = BG[game.pos.turn]; }
    else bubble(game.pos.turn);
    state.turnShown = game.pos.turn;
  }
  if (info.anim && info.anim.from != null && !rotate) slide(info.anim);
  syncPalette();
  setTimeout(maybeEngine, 50);
}
function slide({ from, to }) {
  const el = boardEl.querySelector(`.sq[data-i="${to}"] .piece`); if (!el || reduced) return;
  const a = cellOf(from, state.orient), b = cellOf(to, state.orient), s = squareSize();
  el.animate([{ transform: `translate(${(a[0] - b[0]) * s}px,${(a[1] - b[1]) * s}px)` }, { transform: 'none' }], { duration: 200, easing: 'ease-out' });
}
function startRotation(desired) {
  state.busy = true; state.rot = { desired, timers: [] };
  state.rot.timers.push(setTimeout(() => { void boardEl.offsetWidth; boardEl.classList.add('rotating'); }, 380));
  state.rot.timers.push(setTimeout(finishRotation, 380 + 740));
}
function finishRotation() {
  if (!state.rot) return;
  const { desired, timers } = state.rot; timers.forEach(clearTimeout); state.rot = null;
  boardEl.classList.add('no-anim'); boardEl.classList.remove('rotating');
  state.orient = desired; drawBoard(); placePanels(desired, true); fit();
  void boardEl.offsetWidth; boardEl.classList.remove('no-anim'); state.busy = false;
}

// ---------- palette créative ----------
function buildPalette() {
  const pal = $('#palette');
  pal.innerHTML = [...'KQRBNP', ...'kqrbnp'].map((p) => `<div class="pal" data-p="${p}" title="${PIECE_NAMES[p.toLowerCase()]}">${pieceSVG(p)}</div>`).join('') + `<div class="pal" data-p="" title="Gomme">⌫</div>`;
  $$('.pal', pal).forEach((el) => el.addEventListener('pointerdown', (e) => beginDrag(e, { palette: el.dataset.p })));
}
function syncPalette() { $$('.pal').forEach((el) => el.classList.toggle('on', state.armed !== null && state.armed === el.dataset.p)); }

// ---------- saisie ----------
const sqAt = (x, y) => { const e = document.elementFromPoint(x, y); const s = e && e.closest('.sq'); return s && boardEl.contains(s) ? +s.dataset.i : null; };
function canPlayFrom(sq) {
  const p = game.work[sq]; if (!p) return false;
  if (game.mode === 'creative') return true;
  return !game.status().blocking && R.colorOf(p) === game.pos.turn && !settings.auto[game.pos.turn];
}
function selectSquare(sq) {
  state.sel = sq; state.targets = new Map();
  if (sq != null && game.mode === 'classic') for (const m of game.legalFrom(sq)) { const a = state.targets.get(m.to) || []; a.push(m); state.targets.set(m.to, a); }
  drawBoard();
}
async function attemptMove(from, to) {
  const ms = game.legalFrom(from).filter((m) => m.to === to); if (!ms.length) return;
  let m = ms[0];
  if (m.type === 'p') {
    const pick = await choosePromotion(R.colorOf(m.piece)); if (!pick) { selectSquare(null); return; }
    m = ms.find((x) => x.promo.toUpperCase() === pick);
  }
  game.playMove(m);
}
function choosePromotion(color) {
  return new Promise((res) => {
    const el = document.createElement('div'); el.className = 'promo';
    el.innerHTML = '<div>' + [...'QRBN'].map((t) => `<button data-t="${t}" title="${PIECE_NAMES[t.toLowerCase()]}">${pieceSVG(color === 'w' ? t : t.toLowerCase())}</button>`).join('') + '</div>';
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); el.remove(); res(b ? b.dataset.t : null); });
    $('#boardWrap').append(el);
  });
}
function beginDrag(e, src) {
  if (e.button > 0 || state.busy) return;
  state.drag = { ...src, x: e.clientX, y: e.clientY, active: false, ghost: null, wasSel: src.from != null && state.sel === src.from };
  e.preventDefault();
}
boardEl.addEventListener('pointerdown', (e) => {
  if (state.busy || e.button > 0) return;
  const sq = sqAt(e.clientX, e.clientY); if (sq == null) return;
  if (game.mode === 'creative' && state.armed !== null) { paint(sq); state.paint = sq; return; }
  if (game.mode === 'classic' && state.sel != null && state.targets.has(sq)) { attemptMove(state.sel, sq); return; }
  if (game.mode === 'creative' && state.sel != null && state.sel !== sq) { const from = state.sel; state.sel = null; game.moveCreative(from, sq); return; }
  if (canPlayFrom(sq)) { const was = state.sel === sq; beginDrag(e, { from: sq, piece: game.work[sq] }); if (!was) selectSquare(sq); } else if (state.sel != null) selectSquare(null);
});
function paint(sq) { if (state.armed === '') game.placeCreative(sq, ''); else game.placeCreative(sq, state.armed); }
addEventListener('pointermove', (e) => {
  if (state.paint != null) { const sq = sqAt(e.clientX, e.clientY); if (sq != null && sq !== state.paint) { state.paint = sq; paint(sq); } return; }
  const d = state.drag; if (!d) return;
  if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) {
    d.active = true;
    d.ghost = document.createElement('div'); d.ghost.className = 'drag-ghost';
    d.ghost.innerHTML = d.palette != null ? (d.palette ? pieceSVG(d.palette) : '') : pieceSVG(d.piece); document.body.append(d.ghost);
    if (d.from != null) boardEl.querySelector(`.sq[data-i="${d.from}"] .piece`)?.classList.add('ghosted');
  }
  if (d.active) {
    d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
    const over = sqAt(e.clientX, e.clientY);
    $$('.sq.hover', boardEl).forEach((x) => x.classList.remove('hover'));
    if (over != null) boardEl.querySelector(`.sq[data-i="${over}"]`).classList.add('hover');
  }
});
addEventListener('pointerup', (e) => {
  state.paint = null;
  const d = state.drag; if (!d) return; state.drag = null;
  d.ghost?.remove(); $$('.sq.hover', boardEl).forEach((x) => x.classList.remove('hover'));
  const sq = sqAt(e.clientX, e.clientY);
  if (d.palette != null) {
    if (d.active) { if (sq != null) game.placeCreative(sq, d.palette); }
    else { state.armed = state.armed === d.palette ? null : d.palette; state.sel = null; syncPalette(); drawBoard(); }
    return;
  }
  if (!d.active) { if (d.wasSel) selectSquare(null); return; }
  if (game.mode === 'classic') { if (sq != null && state.targets.has(sq)) attemptMove(d.from, sq); else selectSquare(sq === d.from ? d.from : null); }
  else { state.sel = null; if (sq == null) game.placeCreative(d.from, ''); else game.moveCreative(d.from, sq); if (sq === d.from) drawBoard(); }
});
addEventListener('keydown', (e) => {
  if (e.target.matches('textarea,input')) return;
  if (e.key === 'Escape') { state.armed = null; state.sel = null; syncPalette(); drawBoard(); }
  else if (e.key === 'Enter' && game.mode === 'creative') game.commitPending();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? game.redo() : game.undo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); game.redo(); }
});

// ---------- dialogues ----------
function ask(title, text, buttons) {
  return new Promise((res) => {
    const dlg = $('#dlg'); $('#dlgTitle').textContent = title; $('#dlgText').textContent = text;
    const box = $('#dlgBtns'); box.textContent = '';
    for (const b of buttons) { const el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.value = b.value; el.textContent = b.label; box.append(el); }
    dlg.onclose = () => res(dlg.returnValue); dlg.returnValue = ''; dlg.showModal();
  });
}
const confirmBtns = (ok) => [{ label: 'Annuler', value: '', cls: 'tonal' }, { label: ok, value: 'ok', cls: 'pink' }];
async function askNew() { if (await ask('Nouvelle partie', 'La partie en cours sera remplacée (vous pourrez annuler en mode créatif).', confirmBtns('Nouvelle partie')) === 'ok') game.newGame(); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }

async function requestMode(m) {
  if (m === game.mode) return;
  if (m === 'classic' && game.pending) {
    const r = await ask('Modifications non validées', 'Le plateau contient des modifications qui ne sont pas encore un coup.', [
      { label: 'Rester en créatif', value: '', cls: 'tonal' }, { label: 'Les annuler', value: 'discard', cls: 'tonal' }, { label: 'Les valider', value: 'commit', cls: 'pink' }]);
    if (!r) return;
    if (r === 'commit') game.commitPending(); else game.discardPending();
  }
  state.armed = null; game.setMode(m);
}

// ---------- Stockfish ----------
const tellMissing = (e) => { if (!state.warned) { state.warned = true; toast(e.message); } };
async function ensureEngine() {
  if (engine.status === 'ready') return true;
  if (engine.status === 'missing' || engine.status === 'error') return false;
  try { drawControls(); await engine.init(); drawControls(); return true; } catch (e) { tellMissing(e); drawControls(); return false; }
}
const fenNow = () => game.analysisFEN().fen;
async function runBest(auto) {
  if (state.thinking) return;
  const { fen, issue } = game.analysisFEN();
  if (issue) { if (!auto) toast('Position non analysable : ' + issue); return; }
  if (!(await ensureEngine())) { if (auto) { settings.auto = { w: false, b: false }; saveSettings(); render({ keepSel: true }); } return; }
  const turn = game.pos.turn; state.thinking = turn; drawPanels();
  const r = await engine.search(fen, { movetime: ecfg.moveMs, priority: 'move' });
  state.thinking = null;
  if (r.cancelled || fenNow() !== fen) { drawPanels(); return; }
  if (!r.best) { drawPanels(); toast('Aucun coup possible'); return; }
  if (!game.applyUCI(r.best)) toast('Coup refusé : ' + r.best);
}
let autoTimer, evalTimer, evalFen = null;
function maybeEngine() { scheduleEval(); scheduleAuto(); }
function scheduleAuto() {
  clearTimeout(autoTimer);
  if (game.mode !== 'classic' || game.status().blocking || !settings.auto[game.pos.turn] || state.thinking) return;
  autoTimer = setTimeout(() => runBest(true), state.busy ? 1300 : 350);
}
function setEval(v, note = null) { state.evalVal = v; state.evalNote = note; drawEval(); drawControls(); }
function scheduleEval() {
  clearTimeout(evalTimer);
  if (!settings.evalOn) return;
  const { fen, issue } = game.analysisFEN(), o = game.pending ? null : game.status().outcome;
  if (o && o.type !== 'kinglost' && o.type !== 'nokings') { evalFen = null; return setEval({ cp: o.winner === 'w' ? 1e5 : o.winner === 'b' ? -1e5 : 0, label: o.winner === 'w' ? '1-0' : o.winner === 'b' ? '0-1' : '½-½' }); }
  if (issue) { evalFen = null; return setEval(null, issue); }
  if (fen === evalFen) return;
  evalTimer = setTimeout(async () => {
    if (!(await ensureEngine())) return setEval(null);
    evalFen = fen;
    const r = await engine.search(fen, { movetime: ecfg.evalMs, priority: 'eval', onInfo: (i) => { if (fenNow() === fen) setEval(i); } });
    if (r.cancelled) { if (evalFen === fen) evalFen = null; return; }
    if (fenNow() === fen) setEval(r.mate != null ? { mate: r.mate } : { cp: r.cp ?? 0 });
  }, 200);
}
const playBest = () => { clearTimeout(autoTimer); runBest(false); };

// ---------- branchements ----------
$$('#modeSwitch button').forEach((b) => b.onclick = () => requestMode(b.dataset.mode));
$$('#layoutChips button').forEach((b) => b.onclick = () => { settings.layout = b.dataset.layout; saveSettings(); render({ instant: true }); });
$('#swSwap').onchange = (e) => { settings.swap = e.target.checked; saveSettings(); render({ instant: true }); };
$('#swEval').onchange = (e) => { settings.evalOn = e.target.checked; evalFen = null; if (!settings.evalOn) setEval(null); saveSettings(); render({ instant: true, keepSel: true }); };
$('#swAutoW').onchange = (e) => { settings.auto.w = e.target.checked; saveSettings(); render({ keepSel: true }); };
$('#swAutoB').onchange = (e) => { settings.auto.b = e.target.checked; saveSettings(); render({ keepSel: true }); };
$('#btnNew').onclick = askNew;
$('#btnCommit').onclick = () => game.commitPending();
$('#btnDiscard').onclick = () => game.discardPending();
$('#btnUndo').onclick = () => game.undo();
$('#btnRedo').onclick = () => game.redo();
$('#btnBest').onclick = playBest;
$('#btnResign').onclick = async () => { if (await ask('Abandon', `${name(game.pos.turn)} abandonnent ?`, confirmBtns('Abandonner')) === 'ok') game.resign(); };
$('#btnDraw').onclick = async () => { if (await ask('Nulle', 'Les deux joueurs acceptent la nulle ?', confirmBtns('Accepter la nulle')) === 'ok') game.agreeDraw(); };
$('#txt').oninput = () => { state.dirty = true; $('#txtErr').textContent = ''; };
function loadFromText(text) {
  try { game.loadText(text); state.dirty = false; $('#txtErr').textContent = ''; toast('Partie chargée'); }
  catch (e) { $('#txtErr').textContent = e.message; }
}
$('#btnLoad').onclick = () => loadFromText($('#txt').value);
$('#btnCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#txt').value); toast('Copié'); } catch { $('#txt').select(); document.execCommand('copy'); toast('Copié'); } };
$('#btnExport').onclick = () => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([$('#txt').value], { type: 'text/plain;charset=utf-8' }));
  a.download = 'partie-echecs.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#btnImport').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const t = await f.text(); $('#txt').value = t; loadFromText(t); e.target.value = ''; };

game.on((info) => { if (state.thinking && info.kind !== 'edit') engine.stop(); if (info.kind === 'load' || info.kind === 'new') state.dirty = false; if (info.kind === 'mode') state.armed = null; render(info); });
new ResizeObserver(() => fit()).observe($('#stage'));
addEventListener('resize', fit);
buildPalette();
render({ instant: true });
window.chessUI = { game, settings, engine, setEval, render };
