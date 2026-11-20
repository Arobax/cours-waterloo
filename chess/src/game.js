// Modèle de partie : modes classique/créatif, historique, annuler/refaire, texte PGN(étendu), sauvegarde.
import * as R from './rules.js';
import * as N from './notation.js';

const STORAGE_KEY = 'chess-app:game:v1';
const TERM = { checkmate: 'échec et mat', stalemate: 'pat', insufficient: 'matériel insuffisant', fifty: 'règle des 50 coups', threefold: 'triple répétition', kinglost: 'roi absent', nokings: 'aucun roi' };

export class Game {
  constructor() { this.listeners = new Set(); this.undoStack = []; this.redoStack = []; this.reset(); }

  reset() {
    this.mode = 'classic';
    this.start = R.createStart();
    this.pos = R.clonePos(this.start);
    this.work = this.pos.board.slice();
    this.entries = [];
    this.keys = [R.positionKey(this.pos)];
    this.result = null; // {type:'resign'|'agreed', winner}
    this._legal = null;
  }

  // ----- abonnements -----
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(info = {}) { this.save(); for (const fn of this.listeners) fn(info); }

  // ----- état dérivé -----
  get legal() { return this._legal || (this._legal = R.legalMoves(this.pos)); }
  legalFrom(sq) { return this.legal.filter((m) => m.from === sq); }
  get pending() { return this.work.some((p, i) => p !== this.pos.board[i]); }
  get extended() { return this.entries.some((e) => !e.legal); }
  entryText(e) { return this.extended ? e.ext : e.san; }
  status() {
    const outcome = this.result ? { type: this.result.type, winner: this.result.winner } : R.getOutcome(this.pos, this.keys, this.legal);
    const check = { w: R.inCheckBoard(this.work, 'w'), b: R.inCheckBoard(this.work, 'b') };
    return { turn: this.pos.turn, outcome, check, blocking: !!outcome && this.mode === 'classic' };
  }
  resultTag() {
    const o = this.status().outcome;
    if (!o) return '*';
    return o.winner === 'w' ? '1-0' : o.winner === 'b' ? '0-1' : '1/2-1/2';
  }

  // ----- snapshots -----
  _snap() { return structuredClone({ pos: this.pos, work: this.work, entries: this.entries, keys: this.keys, result: this.result, start: this.start }); }
  _restore(s) { Object.assign(this, structuredClone(s)); this._legal = null; }
  _push() { this.undoStack.push(this._snap()); if (this.undoStack.length > 300) this.undoStack.shift(); this.redoStack = []; }
  get canUndo() { return this.mode === 'creative' && this.undoStack.length > 0; }
  get canRedo() { return this.mode === 'creative' && this.redoStack.length > 0; }
  undo() { if (!this.canUndo) return; this.redoStack.push(this._snap()); this._restore(this.undoStack.pop()); this.emit({ kind: 'undo' }); }
  redo() { if (!this.canRedo) return; this.undoStack.push(this._snap()); this._restore(this.redoStack.pop()); this.emit({ kind: 'redo' }); }

  // ----- validation d'un coup -----
  _commit(newBoard, move = null) {
    const before = this.pos, legal = this.legal;
    const m = move || R.findMoveByBoard(before, newBoard, legal);
    const ops = N.diffOps(before.board, newBoard);
    let after, san = null, ext = N.opsToText(ops);
    if (m) {
      after = R.makeMove(before, m);
      san = R.toSAN(before, m, legal);
      if (m.type === 'k') ext = 'O-O'; else if (m.type === 'q') ext = 'O-O-O';
    } else after = R.advanceFree(before, newBoard);
    const hl = [];
    for (const o of ops) { if (o.t === 'm') hl.push(o.from, o.to); else if (o.t === 'a') hl.push(o.sq); }
    this.entries.push({ side: before.turn, san, ext, legal: !!m, hl });
    this.pos = after; this.work = after.board.slice(); this.keys.push(R.positionKey(after)); this._legal = null;
    return { from: m ? m.from : null, to: m ? m.to : null };
  }

  // ----- classique -----
  playMove(m) {
    if (this.mode !== 'classic' || this.status().blocking) return false;
    if (!this.legal.some((x) => x.from === m.from && x.to === m.to && x.promo === m.promo)) return false;
    const real = this.legal.find((x) => x.from === m.from && x.to === m.to && x.promo === m.promo);
    this._push();
    const anim = this._commit(R.applyMoveToBoard(this.pos.board, real), real);
    this.emit({ kind: 'move', anim });
    return true;
  }

  // ----- moteur -----
  // Position à analyser : le plateau de travail (modifs non validées comprises) avec le trait courant.
  analysisPosition() {
    if (!this.pending) return this.pos;
    return { board: this.work.slice(), turn: this.pos.turn, castling: R.cleanCastling(this.work, this.pos.castling), ep: -1, half: this.pos.half, full: this.pos.full };
  }
  analysisFEN() { const pos = this.analysisPosition(); return { fen: R.toFEN(pos), issue: R.engineIssue(pos) }; }
  applyUCI(uci) {
    const pos = this.analysisPosition(), m = R.legalMoves(pos).find((x) => R.moveToUCI(x) === uci);
    if (!m) return false;
    if (this.mode === 'classic') return this.playMove(m);
    this._push(); const anim = this._commit(R.applyMoveToBoard(pos.board, m)); this.emit({ kind: 'move', anim }); return true;
  }

  // ----- créatif -----
  moveCreative(from, to) {
    if (this.mode !== 'creative' || from === to || !this.work[from]) return;
    this._push(); this.work[to] = this.work[from]; this.work[from] = ''; this.emit({ kind: 'edit' });
  }
  placeCreative(sq, piece) {
    if (this.mode !== 'creative' || this.work[sq] === piece) return;
    this._push(); this.work[sq] = piece; this.emit({ kind: 'edit' });
  }
  commitPending() {
    if (this.mode !== 'creative') return;
    this._push();
    const anim = this._commit(this.work.slice());
    this.emit({ kind: 'move', anim });
  }
  discardPending() {
    if (!this.pending) return;
    this._push(); this.work = this.pos.board.slice(); this.emit({ kind: 'edit' });
  }
  setMode(mode) { if (this.mode !== mode) { this.mode = mode; this.emit({ kind: 'mode' }); } }

  // ----- fin de partie -----
  resign() { this._push(); this.result = { type: 'resign', winner: R.opposite(this.pos.turn) }; this.emit({ kind: 'result' }); }
  agreeDraw() { this._push(); this.result = { type: 'agreed', winner: null }; this.emit({ kind: 'result' }); }
  newGame() { const mode = this.mode; this._push(); this.reset(); this.mode = mode; this.emit({ kind: 'new' }); }

  // ----- texte -----
  toText() {
    const ext = this.extended, st = this.status();
    const tag = (k, v) => `[${k} "${v}"]`;
    const h = [
      tag('Event', 'Partie locale'), tag('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.')),
      tag('Mode', this.mode === 'classic' ? 'classique' : 'creatif'), tag('Notation', ext ? 'etendue' : 'standard'),
      tag('Result', this.resultTag()),
    ];
    if (this.result) h.push(tag('Termination', this.result.type === 'resign' ? 'abandon' : 'nulle par accord'));
    else if (st.outcome) h.push(tag('Termination', TERM[st.outcome.type]));
    const startFen = R.toFEN(this.start);
    if (startFen !== R.START_FEN) h.push(tag('SetUp', '1'), tag('FEN', startFen));
    if (this.pending) h.push(tag('Pending', R.boardToPlacement(this.work)));
    const toks = [];
    this.entries.forEach((e, i) => {
      const num = this._numberOf(i);
      if (e.side === 'w') toks.push(`${num}.`); else if (i === 0) toks.push(`${num}...`);
      toks.push(this.entryText(e));
    });
    toks.push(this.resultTag());
    let line = '', body = '';
    for (const t of toks) { if ((line + ' ' + t).length > 78) { body += line + '\n'; line = t; } else line = line ? line + ' ' + t : t; }
    return h.join('\n') + '\n\n' + body + line + '\n';
  }
  _numberOf(i) {
    let full = this.start.full, turn = this.start.turn;
    for (let k = 0; k < i; k++) { if (turn === 'b') full++; turn = R.opposite(turn); }
    return full;
  }

  static fromText(text) {
    const g = new Game();
    const tags = {};
    let rest = text.replace(/^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm, (_, k, v) => { tags[k] = v; return ''; });
    if (tags.FEN) { g.start = R.fromFEN(tags.FEN); g.pos = R.clonePos(g.start); g.work = g.pos.board.slice(); g.keys = [R.positionKey(g.pos)]; }
    rest = rest.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    for (let prev = ''; prev !== rest;) { prev = rest; rest = rest.replace(/\([^()]*\)/g, ' '); }
    const toks = rest.replace(/\$\d+/g, ' ').split(/\s+/).filter(Boolean)
      .map((t) => t.replace(/^\d+\.+/, '')).filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
    g.mode = 'classic';
    toks.forEach((tok, i) => {
      const fail = (msg) => { throw new Error(`Coup n°${i + 1} « ${tok} » : ${msg}`); };
      const san = R.parseSAN(g.pos, tok, g.legal);
      if (san && !N.isExtendedToken(tok.replace(/[+#!?]+$/, ''))) { g._commit(R.applyMoveToBoard(g.pos.board, san), san); return; }
      let parsed;
      try { parsed = N.parseTurnText(tok.replace(/[!?]+$/, '')); } catch (e) { fail(san ? 'ambigu' : 'notation non reconnue'); }
      try {
        if (parsed.castle) {
          const m = g.legal.find((x) => x.type === parsed.castle);
          if (!m) fail('roque impossible'); else g._commit(R.applyMoveToBoard(g.pos.board, m), m);
        } else g._commit(N.applyOps(g.pos.board, parsed.ops));
      } catch (e) { if (e.message.startsWith('Coup n°')) throw e; fail(e.message); }
    });
    if (tags.Pending) { const b = R.parsePlacement(tags.Pending); g.work = b; }
    g.mode = tags.Mode === 'creatif' || (tags.Mode === undefined && (g.extended || g.pending)) ? 'creative' : 'classic';
    if (tags.Termination === 'abandon') g.result = { type: 'resign', winner: tags.Result === '1-0' ? 'w' : 'b' };
    else if (tags.Termination === 'nulle par accord') g.result = { type: 'agreed', winner: null };
    return g;
  }
  loadText(text) {
    const g = Game.fromText(text);
    this._push();
    for (const k of ['mode', 'start', 'pos', 'work', 'entries', 'keys', 'result']) this[k] = g[k];
    this._legal = null; this.emit({ kind: 'load' });
  }

  // ----- sauvegarde locale -----
  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: this.mode, start: this.start, pos: this.pos, work: this.work, entries: this.entries, keys: this.keys, result: this.result })); } catch { /* stockage indisponible */ }
  }
  restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d.pos || d.pos.board.length !== 64 || d.work.length !== 64) return false;
      for (const k of ['mode', 'start', 'pos', 'work', 'entries', 'keys', 'result']) this[k] = d[k];
      this._legal = null; return true;
    } catch { return false; }
  }
}
