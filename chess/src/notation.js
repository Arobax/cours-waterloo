// Notation étendue : décrit un « coup » libre du mode créatif comme une liste d'opérations.
// Toutes les opérations d'un coup sont lues sur la position de DÉBUT de coup (application simultanée).
import { sqName, sqIndex, colorOf } from './rules.js';

const dist = (a, b) => Math.max(Math.abs((a >> 3) - (b >> 3)), Math.abs((a & 7) - (b & 7)));

export function diffOps(before, after) {
  const R = [], A = [];
  for (let i = 0; i < 64; i++) {
    if (before[i] === after[i]) continue;
    if (before[i]) R.push(i);
    if (after[i]) A.push(i);
  }
  const ops = [], usedR = new Set(), usedA = new Set(), cand = [];
  for (const r of R) for (const a of A) if (before[r] === after[a]) cand.push({ r, a, d: dist(r, a) });
  cand.sort((x, y) => x.d - y.d || x.r - y.r || x.a - y.a);
  for (const c of cand) if (!usedR.has(c.r) && !usedA.has(c.a)) {
    usedR.add(c.r); usedA.add(c.a); ops.push({ t: 'm', piece: before[c.r], from: c.r, to: c.a, promo: '' });
  }
  for (const r of R) {
    const p = before[r];
    if (usedR.has(r) || (p !== 'P' && p !== 'p')) continue;
    const white = p === 'P';
    if ((r >> 3) !== (white ? 1 : 6)) continue;
    const a = A.find((a) => !usedA.has(a) && (a >> 3) === (white ? 0 : 7) && Math.abs((a & 7) - (r & 7)) <= 1 && colorOf(after[a]) === colorOf(p) && 'qrbn'.includes(after[a].toLowerCase()));
    if (a !== undefined) { usedR.add(r); usedA.add(a); ops.push({ t: 'm', piece: p, from: r, to: a, promo: after[a] }); }
  }
  ops.sort((x, y) => x.from - y.from);
  for (const o of ops) o.cap = !!before[o.to] && !ops.some((q) => q.from === o.to);
  for (const a of A) if (!usedA.has(a)) ops.push({ t: 'a', piece: after[a], sq: a });
  for (const r of R) if (!usedR.has(r) && !after[r]) ops.push({ t: 'r', sq: r });
  return ops;
}

export function opToText(o) {
  if (o.t === 'm') return `${o.piece}${sqName(o.from)}${o.cap ? 'x' : '-'}${sqName(o.to)}${o.promo ? '=' + o.promo : ''}`;
  if (o.t === 'a') return `+${o.piece}${sqName(o.sq)}`;
  return `-${sqName(o.sq)}`;
}
export const opsToText = (ops) => (ops.length ? ops.map(opToText).join(',') : '--');

const RE_M = /^([KQRBNPkqrbnp])([a-h][1-8])[-x]([a-h][1-8])(?:=([QRBNqrbn]))?$/;
const RE_A = /^\+([KQRBNPkqrbnp])([a-h][1-8])$/;
const RE_R = /^-([a-h][1-8])$/;
export const isExtendedToken = (t) => t === '--' || t.split(',').every((x) => RE_M.test(x) || RE_A.test(x) || RE_R.test(x));

// Retourne {castle:'k'|'q'} ou {ops}
export function parseTurnText(text) {
  const t = text.trim();
  if (t === '--') return { ops: [] };
  if (/^(O-O|0-0)$/.test(t)) return { castle: 'k' };
  if (/^(O-O-O|0-0-0)$/.test(t)) return { castle: 'q' };
  const ops = t.split(',').map((tok) => {
    let m;
    if ((m = RE_M.exec(tok))) {
      let promo = m[4] || '';
      if (promo) promo = colorOf(m[1]) === 'w' ? promo.toUpperCase() : promo.toLowerCase();
      return { t: 'm', piece: m[1], from: sqIndex(m[2]), to: sqIndex(m[3]), promo };
    }
    if ((m = RE_A.exec(tok))) return { t: 'a', piece: m[1], sq: sqIndex(m[2]) };
    if ((m = RE_R.exec(tok))) return { t: 'r', sq: sqIndex(m[1]) };
    throw new Error(`Opération inconnue « ${tok} »`);
  });
  return { ops };
}

export function applyOps(board, ops) {
  const out = board.slice(), place = [], seen = new Set();
  for (const o of ops) {
    if (o.t === 'a') { place.push([o.sq, o.piece]); continue; }
    const sq = o.t === 'm' ? o.from : o.sq;
    if (seen.has(sq)) throw new Error(`La case ${sqName(sq)} est utilisée deux fois dans le même coup`);
    seen.add(sq);
    if (o.t === 'm') {
      if (board[sq] !== o.piece) throw new Error(`Pas de « ${o.piece} » en ${sqName(sq)}`);
      out[sq] = ''; place.push([o.to, o.promo || o.piece]);
    } else {
      if (!board[sq]) throw new Error(`Rien à retirer en ${sqName(sq)}`);
      out[sq] = '';
    }
  }
  for (const [sq, p] of place) out[sq] = p;
  return out;
}
