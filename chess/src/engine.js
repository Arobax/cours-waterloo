// Client Stockfish (protocole UCI via Web Worker). Un seul calcul à la fois :
//  - priorité 'move'  (meilleur coup / jeu auto) : interrompt un calcul 'eval' ;
//  - priorité 'eval'  (barre d'évaluation) : attend un calcul 'move' en cours.
// Les scores renvoyés sont toujours du point de vue des Blancs (cp > 0 = avantage Blancs ; mate > 0 = les Blancs matent).
export const DEFAULTS = { url: 'vendor/stockfish/stockfish.js', type: 'classic', evalMs: 600, moveMs: 2000, hashMb: 32 };

export function loadConfig() {
  const c = { ...DEFAULTS };
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('engine')) c.url = q.get('engine');
    if (q.get('etype')) c.type = q.get('etype');
    if (q.get('movems')) c.moveMs = +q.get('movems');
    if (q.get('evalms')) c.evalMs = +q.get('evalms');
  } catch { /* hors navigateur */ }
  return c;
}

export class Engine {
  constructor(cfg = DEFAULTS) {
    this.cfg = cfg; this.status = 'idle'; // idle | loading | ready | missing | error
    this.worker = null; this.active = null; this.next = null; this.waiters = []; this._init = null;
  }
  get available() { return this.status === 'ready'; }

  init() {
    if (this._init) return this._init;
    this.status = 'loading';
    this._init = (async () => {
      if (!this.cfg.makeWorker) {
        let ok = false;
        try { ok = (await fetch(this.cfg.url, { method: 'HEAD' })).ok; } catch { /* réseau */ }
        if (!ok) { this.status = 'missing'; throw new Error('Stockfish n’est pas installé (voir README : tools/get-stockfish.mjs).'); }
      }
      try { this.worker = this.cfg.makeWorker ? this.cfg.makeWorker() : new Worker(this.cfg.url, { type: this.cfg.type }); }
      catch (e) { throw new Error('Impossible de démarrer Stockfish : ' + e.message); }
      this.worker.onmessage = (e) => this._line(typeof e.data === 'string' ? e.data : String(e.data));
      this.worker.onerror = (e) => this._fail(e.message || 'erreur du worker');
      await this._waitFor('uci', 'uciok');
      this._send(`setoption name Hash value ${this.cfg.hashMb}`);
      await this._waitFor('isready', 'readyok');
      this.status = 'ready';
    })().catch((e) => { if (this.status !== 'missing') this.status = 'error'; throw e; });
    return this._init;
  }

  search(fen, o = {}) {
    return new Promise((resolve) => {
      const t = { fen, movetime: o.movetime, depth: o.depth, priority: o.priority || 'eval', onInfo: o.onInfo, resolve, cancelled: false, sign: fen.split(' ')[1] === 'b' ? -1 : 1, last: {} };
      if (this.status !== 'ready') return resolve({ cancelled: true });
      if (!this.active) return this._start(t);
      const drop = () => { if (this.next) this.next.resolve({ cancelled: true }); };
      if (t.priority === 'move') { drop(); this.next = t; this._cancelActive(); }
      else if (this.active.priority === 'move') { if (this.next && this.next.priority === 'move') return resolve({ cancelled: true }); drop(); this.next = t; }
      else { drop(); this.next = t; this._cancelActive(); }
    });
  }
  stop() { if (this.next) { this.next.resolve({ cancelled: true }); this.next = null; } this._cancelActive(); }
  terminate() { this.stop(); this.worker?.terminate(); this.worker = null; this.status = 'idle'; this._init = null; }

  _send(s) { this.worker.postMessage(s); }
  _waitFor(cmd, token, ms = 20000) {
    return new Promise((res, rej) => {
      const w = { token, res, rej, timer: setTimeout(() => { this.waiters = this.waiters.filter((x) => x !== w); rej(new Error('Stockfish ne répond pas')); }, ms) };
      this.waiters.push(w); this._send(cmd);
    });
  }
  _start(t) { this.active = t; this._send(`position fen ${t.fen}`); this._send(t.depth ? `go depth ${t.depth}` : `go movetime ${t.movetime || 1000}`); }
  _cancelActive() { if (this.active && !this.active.cancelled) { this.active.cancelled = true; this._send('stop'); } }
  _fail(msg) {
    this.status = 'error';
    for (const w of this.waiters) { clearTimeout(w.timer); w.rej(new Error(msg)); }
    this.waiters = [];
    for (const t of [this.active, this.next]) t?.resolve({ cancelled: true });
    this.active = this.next = null;
  }
  _line(line) {
    for (const w of this.waiters.slice()) if (line.startsWith(w.token)) { clearTimeout(w.timer); this.waiters = this.waiters.filter((x) => x !== w); w.res(); }
    const t = this.active; if (!t) return;
    if (line.startsWith('info') && / score /.test(line)) {
      const d = / depth (\d+)/.exec(line), s = / score (cp|mate) (-?\d+)/.exec(line); if (!s) return;
      const v = +s[2] * t.sign; t.last = s[1] === 'cp' ? { cp: v, depth: d ? +d[1] : 0 } : { mate: v, depth: d ? +d[1] : 0 };
      if (!t.cancelled && t.onInfo) t.onInfo(t.last);
    } else if (line.startsWith('bestmove')) {
      const m = line.split(/\s+/)[1];
      this.active = null;
      t.resolve(t.cancelled ? { cancelled: true } : { cancelled: false, best: !m || m === '(none)' || m === '0000' ? null : m, ...t.last });
      const n = this.next; this.next = null; if (n) this._start(n);
    }
  }
}
