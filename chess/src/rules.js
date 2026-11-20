// Règles des échecs — aucun accès au DOM, utilisable dans Node et dans le navigateur.
// Plateau : tableau de 64 cases, index 0 = a8 … 63 = h1. Pièces FEN ('P' blanc, 'p' noir, '' vide).

export const FILES = 'abcdefgh';
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));
export const sqIndex = (n) => (8 - Number(n[1])) * 8 + FILES.indexOf(n[0]);
export const colorOf = (p) => (p === '' ? null : p === p.toUpperCase() ? 'w' : 'b');
export const opposite = (c) => (c === 'w' ? 'b' : 'w');

// ---------- FEN ----------
export function parsePlacement(str) {
  const rows = str.split('/');
  if (rows.length !== 8) throw new Error('Placement invalide : 8 rangées attendues');
  const board = [];
  for (const row of rows) {
    let n = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) { for (let k = 0; k < +ch; k++) board.push(''); n += +ch; }
      else if ('KQRBNPkqrbnp'.includes(ch)) { board.push(ch); n++; }
      else throw new Error(`Caractère invalide « ${ch} » dans le placement`);
    }
    if (n !== 8) throw new Error('Une rangée ne fait pas 8 cases');
  }
  return board;
}
export function boardToPlacement(board) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let s = '', e = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p) e++; else { if (e) { s += e; e = 0; } s += p; }
    }
    if (e) s += e;
    rows.push(s);
  }
  return rows.join('/');
}
export function cleanCastling(board, c) {
  let out = '';
  if (c.includes('K') && board[60] === 'K' && board[63] === 'R') out += 'K';
  if (c.includes('Q') && board[60] === 'K' && board[56] === 'R') out += 'Q';
  if (c.includes('k') && board[4] === 'k' && board[7] === 'r') out += 'k';
  if (c.includes('q') && board[4] === 'k' && board[0] === 'r') out += 'q';
  return out;
}
export function fromFEN(fen) {
  const p = fen.trim().split(/\s+/);
  if (p.length < 2) throw new Error('FEN invalide : champs manquants');
  const board = parsePlacement(p[0]);
  if (!/^[wb]$/.test(p[1])) throw new Error('FEN invalide : trait');
  const castling = cleanCastling(board, p[2] && p[2] !== '-' ? p[2] : '');
  let ep = -1;
  if (p[3] && p[3] !== '-') {
    if (!/^[a-h][36]$/.test(p[3])) throw new Error('FEN invalide : case en passant');
    ep = sqIndex(p[3]);
  }
  return { board, turn: p[1], castling, ep, half: parseInt(p[4], 10) || 0, full: parseInt(p[5], 10) || 1 };
}
export function toFEN(pos) {
  return [boardToPlacement(pos.board), pos.turn, pos.castling || '-', pos.ep >= 0 ? sqName(pos.ep) : '-', pos.half, pos.full].join(' ');
}
export const createStart = () => fromFEN(START_FEN);
export const clonePos = (pos) => ({ ...pos, board: pos.board.slice() });
export const positionKey = (pos) => toFEN(pos).split(' ').slice(0, 4).join(' ');

// ---------- Attaques ----------
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KINGD = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function isAttacked(board, sq, by) {
  const r = sq >> 3, f = sq & 7, w = by === 'w';
  const pr = w ? r + 1 : r - 1, pawn = w ? 'P' : 'p';
  if (pr >= 0 && pr < 8) for (const df of [-1, 1]) { const ff = f + df; if (ff >= 0 && ff < 8 && board[pr * 8 + ff] === pawn) return true; }
  const N = w ? 'N' : 'n', K = w ? 'K' : 'k', Q = w ? 'Q' : 'q', R = w ? 'R' : 'r', B = w ? 'B' : 'b';
  for (const [dr, df] of KNIGHT) { const rr = r + dr, ff = f + df; if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && board[rr * 8 + ff] === N) return true; }
  for (const [dr, df] of KINGD) { const rr = r + dr, ff = f + df; if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && board[rr * 8 + ff] === K) return true; }
  for (const [dirs, a, b] of [[DIAG, B, Q], [ORTH, R, Q]]) {
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
        const p = board[rr * 8 + ff];
        if (p) { if (p === a || p === b) return true; break; }
        rr += dr; ff += df;
      }
    }
  }
  return false;
}
export function inCheckBoard(board, color) {
  const k = color === 'w' ? 'K' : 'k', them = opposite(color);
  for (let i = 0; i < 64; i++) if (board[i] === k && isAttacked(board, i, them)) return true;
  return false;
}
export const isInCheck = (pos) => inCheckBoard(pos.board, pos.turn);

// ---------- Génération ----------
function pseudoMoves(pos) {
  const { board, turn } = pos, white = turn === 'w', out = [];
  const enemy = (q) => q && (q === q.toUpperCase()) !== white;
  const addPawn = (from, to, piece, captured) => {
    const row = to >> 3;
    if (row === 0 || row === 7) {
      for (const t of 'QRBN') out.push({ from, to, piece, captured, type: 'p', promo: white ? t : t.toLowerCase() });
    } else out.push({ from, to, piece, captured, type: 'n', promo: '' });
  };
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || (p === p.toUpperCase()) !== white) continue;
    const t = p.toLowerCase(), r = i >> 3, f = i & 7;
    if (t === 'p') {
      const dir = white ? -1 : 1, r1 = r + dir;
      if (r1 < 0 || r1 > 7) continue;
      if (!board[r1 * 8 + f]) {
        addPawn(i, r1 * 8 + f, p, '');
        if (r === (white ? 6 : 1) && !board[(r + 2 * dir) * 8 + f]) out.push({ from: i, to: (r + 2 * dir) * 8 + f, piece: p, captured: '', type: 'd', promo: '' });
      }
      for (const df of [-1, 1]) {
        const ff = f + df; if (ff < 0 || ff > 7) continue;
        const to = r1 * 8 + ff, q = board[to];
        if (enemy(q)) addPawn(i, to, p, q);
        else if (!q && to === pos.ep) {
          const victim = to + (white ? 8 : -8);
          if (board[victim] === (white ? 'p' : 'P')) out.push({ from: i, to, piece: p, captured: board[victim], type: 'e', promo: '' });
        }
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, df] of t === 'n' ? KNIGHT : KINGD) {
        const rr = r + dr, ff = f + df; if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
        const to = rr * 8 + ff, q = board[to];
        if (!q || enemy(q)) out.push({ from: i, to, piece: p, captured: q, type: 'n', promo: '' });
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : DIAG.concat(ORTH);
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const to = rr * 8 + ff, q = board[to];
          if (!q) out.push({ from: i, to, piece: p, captured: '', type: 'n', promo: '' });
          else { if (enemy(q)) out.push({ from: i, to, piece: p, captured: q, type: 'n', promo: '' }); break; }
          rr += dr; ff += df;
        }
      }
    }
  }
  // Roque
  const them = opposite(turn), c = pos.castling;
  const k = white ? 60 : 4, base = white ? 56 : 0, king = white ? 'K' : 'k', rook = white ? 'R' : 'r';
  if (board[k] === king && !isAttacked(board, k, them)) {
    if (c.includes(white ? 'K' : 'k') && board[k + 3] === rook && !board[k + 1] && !board[k + 2] && !isAttacked(board, k + 1, them) && !isAttacked(board, k + 2, them))
      out.push({ from: k, to: k + 2, piece: king, captured: '', type: 'k', promo: '' });
    if (c.includes(white ? 'Q' : 'q') && board[base] === rook && !board[k - 1] && !board[k - 2] && !board[k - 3] && !isAttacked(board, k - 1, them) && !isAttacked(board, k - 2, them))
      out.push({ from: k, to: k - 2, piece: king, captured: '', type: 'q', promo: '' });
  }
  return out;
}

export function applyMoveToBoard(board, m) {
  const b = board.slice(), white = m.piece === m.piece.toUpperCase();
  b[m.from] = '';
  b[m.to] = m.type === 'p' ? m.promo : m.piece;
  if (m.type === 'e') b[m.to + (white ? 8 : -8)] = '';
  else if (m.type === 'k') { b[m.to + 1] = ''; b[m.to - 1] = white ? 'R' : 'r'; }
  else if (m.type === 'q') { b[m.to - 2] = ''; b[m.to + 1] = white ? 'R' : 'r'; }
  return b;
}

export function legalMoves(pos) {
  const us = pos.turn, out = [];
  for (const m of pseudoMoves(pos)) if (!inCheckBoard(applyMoveToBoard(pos.board, m), us)) out.push(m);
  return out;
}

export function makeMove(pos, m) {
  const board = applyMoveToBoard(pos.board, m);
  let castling = pos.castling;
  const strip = (s) => { castling = castling.split('').filter((c) => !s.includes(c)).join(''); };
  if (m.piece === 'K') strip('KQ'); if (m.piece === 'k') strip('kq');
  for (const s of [m.from, m.to]) { if (s === 63) strip('K'); else if (s === 56) strip('Q'); else if (s === 7) strip('k'); else if (s === 0) strip('q'); }
  let ep = -1;
  if (m.type === 'd') {
    const foe = pos.turn === 'w' ? 'p' : 'P', f = m.to & 7;
    if ((f > 0 && board[m.to - 1] === foe) || (f < 7 && board[m.to + 1] === foe)) ep = (m.from + m.to) / 2;
  }
  return {
    board, turn: opposite(pos.turn), castling, ep,
    half: m.piece.toLowerCase() === 'p' || m.captured ? 0 : pos.half + 1,
    full: pos.full + (pos.turn === 'b' ? 1 : 0),
  };
}

// Avance « libre » (mode créatif, coup non pris en charge) : on garde les droits de roque dont les pièces n'ont pas bougé.
export function advanceFree(pos, newBoard) {
  const same = (i) => pos.board[i] === newBoard[i];
  let castling = pos.castling;
  const drop = (c, ...sq) => { if (!sq.every(same)) castling = castling.replace(c, ''); };
  drop('K', 60, 63); drop('Q', 60, 56); drop('k', 4, 7); drop('q', 4, 0);
  const unchanged = pos.board.every((p, i) => p === newBoard[i]);
  return { board: newBoard.slice(), turn: opposite(pos.turn), castling, ep: -1, half: unchanged ? pos.half + 1 : 0, full: pos.full + (pos.turn === 'b' ? 1 : 0) };
}

export function findMoveByBoard(pos, board, legal = legalMoves(pos)) {
  for (const m of legal) {
    const b = applyMoveToBoard(pos.board, m);
    let ok = true;
    for (let i = 0; i < 64; i++) if (b[i] !== board[i]) { ok = false; break; }
    if (ok) return m;
  }
  return null;
}

// ---------- SAN ----------
export function toSAN(pos, m, legal = legalMoves(pos)) {
  let s;
  if (m.type === 'k') s = 'O-O';
  else if (m.type === 'q') s = 'O-O-O';
  else {
    const t = m.piece.toUpperCase();
    if (t === 'P') {
      s = (m.captured ? FILES[m.from & 7] + 'x' : '') + sqName(m.to);
      if (m.type === 'p') s += '=' + m.promo.toUpperCase();
    } else {
      s = t;
      const others = legal.filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
      if (others.length) {
        if (!others.some((o) => (o.from & 7) === (m.from & 7))) s += FILES[m.from & 7];
        else if (!others.some((o) => (o.from >> 3) === (m.from >> 3))) s += 8 - (m.from >> 3);
        else s += sqName(m.from);
      }
      s += (m.captured ? 'x' : '') + sqName(m.to);
    }
  }
  const next = makeMove(pos, m);
  if (isInCheck(next)) s += legalMoves(next).length ? '+' : '#';
  return s;
}
export function parseSAN(pos, token, legal = legalMoves(pos)) {
  const clean = token.replace(/[+#!?]/g, '').replace(/0/g, 'O').replace(/e\.p\./, '');
  for (const m of legal) if (toSAN(pos, m, legal).replace(/[+#]/g, '') === clean) return m;
  return null;
}

// ---------- Issues de partie ----------
export function insufficientMaterial(board) {
  const pcs = board.filter((p) => p && p.toLowerCase() !== 'k');
  if (!pcs.length) return true;
  if (pcs.length === 1 && 'bnBN'.includes(pcs[0])) return true;
  if (pcs.every((p) => p.toLowerCase() === 'b')) {
    const cols = new Set();
    board.forEach((p, i) => { if (p && p.toLowerCase() === 'b') cols.add(((i >> 3) + (i & 7)) & 1); });
    return cols.size === 1;
  }
  return false;
}
export function getOutcome(pos, keys = [], legal = legalMoves(pos)) {
  const wk = pos.board.includes('K'), bk = pos.board.includes('k');
  if (!wk && !bk) return { type: 'nokings', winner: null };
  if (!wk) return { type: 'kinglost', winner: 'b' };
  if (!bk) return { type: 'kinglost', winner: 'w' };
  if (!legal.length) return isInCheck(pos) ? { type: 'checkmate', winner: opposite(pos.turn) } : { type: 'stalemate', winner: null };
  if (insufficientMaterial(pos.board)) return { type: 'insufficient', winner: null };
  if (pos.half >= 100) return { type: 'fifty', winner: null };
  const k = positionKey(pos);
  if (keys.filter((x) => x === k).length >= 3) return { type: 'threefold', winner: null };
  return null;
}

export function perft(pos, depth) {
  if (depth === 0) return 1;
  const ms = legalMoves(pos);
  if (depth === 1) return ms.length;
  let n = 0;
  for (const m of ms) n += perft(makeMove(pos, m), depth - 1);
  return n;
}

export const moveToUCI = (m) => sqName(m.from) + sqName(m.to) + (m.type === 'p' ? m.promo.toLowerCase() : '');

// Raison pour laquelle Stockfish ne peut pas analyser cette position (null si elle est exploitable).
export function engineIssue(pos) {
  const b = pos.board, n = (c) => b.filter((p) => p === c).length;
  if (n('K') !== 1 || n('k') !== 1) return 'il faut exactement un roi par camp';
  for (let i = 0; i < 8; i++) if (b[i] === 'P' || b[i] === 'p' || b[56 + i] === 'P' || b[56 + i] === 'p') return 'un pion se trouve sur la première ou la dernière rangée';
  if (inCheckBoard(b, opposite(pos.turn))) return 'le camp qui n’a pas le trait est en échec';
  if (b.filter(Boolean).length > 32) return 'plus de 32 pièces sur le plateau';
  return null;
}
