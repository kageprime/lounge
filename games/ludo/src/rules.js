// Ludo rules. Pure logic, deterministic given the dice values it is fed.
//
// House rules used here (all common):
//  - A 6 brings a token out of the yard onto its start square.
//  - A 6, a capture, or getting a token home gives another roll. Three 6s in a row forfeit the third throw.
//  - Landing on a lone or stacked opponent on a non-safe loop square sends them back to their yard.
//  - Start squares and star squares are safe. The home column is private.
//  - A token must reach home with an exact roll.
//  - The first player with all four tokens home wins.

import { loopIndex, SAFE, P_BASE, P_HOME, P_LAST_LOOP } from './board.js';

export const SEAT = { HUMAN: 'human', CPU: 'cpu', OFF: 'off' };

export function newGame(seats = ['human', 'cpu', 'cpu', 'cpu'], first = null) {
  const active = seats.map((s, i) => (s !== SEAT.OFF ? i : -1)).filter((i) => i >= 0);
  if (active.length < 2) throw new Error('Ludo needs at least two players');
  return {
    seats: [...seats],
    tokens: [0, 1, 2, 3].map(() => [P_BASE, P_BASE, P_BASE, P_BASE]),
    turn: first != null && active.includes(first) ? first : active[0],
    die: null, sixes: 0,
    phase: 'roll',            // roll | pick | nomove | forfeit | over
    moves: [], winner: null, turns: 0,
    stats: [0, 1, 2, 3].map(() => ({ captures: 0, captured: 0, sixes: 0 })),
  };
}

export const isActive = (s, c) => s.seats[c] !== SEAT.OFF;
export const homeCount = (s, c) => s.tokens[c].filter((p) => p === P_HOME).length;

// Opponent tokens that would be captured if `color` landed on progress `to`
export function capturesAt(s, color, to) {
  if (to < 1 || to > P_LAST_LOOP) return [];
  const idx = loopIndex(color, to);
  if (SAFE.has(idx)) return [];
  const hit = [];
  for (let o = 0; o < 4; o++) {
    if (o === color || !isActive(s, o)) continue;
    s.tokens[o].forEach((p, j) => { if (p >= 0 && p <= P_LAST_LOOP && loopIndex(o, p) === idx) hit.push({ color: o, token: j }); });
  }
  return hit;
}

export function legalMoves(s, die, color = s.turn) {
  const out = [];
  s.tokens[color].forEach((p, i) => {
    let to;
    if (p === P_BASE) { if (die !== 6) return; to = 0; }
    else { to = p + die; if (to > P_HOME) return; }
    out.push({ color, token: i, from: p, to, captures: capturesAt(s, color, to), finishes: to === P_HOME, enters: p === P_BASE });
  });
  return out;
}

// Register a thrown die. Returns the new phase.
export function rollDie(s, die) {
  s.die = die; s.turns++;
  if (die === 6) { s.sixes++; s.stats[s.turn].sixes++; } else s.sixes = 0;
  if (s.sixes >= 3) { s.sixes = 0; s.moves = []; s.phase = 'forfeit'; return s.phase; }
  s.moves = legalMoves(s, die);
  s.phase = s.moves.length ? 'pick' : 'nomove';
  return s.phase;
}

// Play a move (one of s.moves). Returns { bonus, won, captured }
export function applyMove(s, m) {
  const c = m.color;
  s.tokens[c][m.token] = m.to;
  for (const v of m.captures) { s.tokens[v.color][v.token] = P_BASE; s.stats[c].captures++; s.stats[v.color].captured++; }
  const won = homeCount(s, c) === 4;
  const bonus = !won && (s.die === 6 || m.captures.length > 0 || m.finishes);
  s.moves = [];
  if (won) { s.phase = 'over'; s.winner = c; }
  else if (bonus) { s.phase = 'roll'; if (s.die !== 6) s.sixes = 0; }
  else passTurn(s);
  return { bonus, won, captured: m.captures };
}

export function passTurn(s) {
  let n = s.turn;
  for (let i = 0; i < 4; i++) { n = (n + 1) % 4; if (isActive(s, n)) break; }
  s.turn = n; s.sixes = 0; s.moves = []; s.phase = 'roll';
}
