import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createEconomy } from '../server/economy.js';
import { createMatchmaker } from '../server/matchmaker.js';
import { escrowAccount, rakeAccount, userAccount } from '../server/ledger.js';

function makeClient(id) {
  const inbox = [];
  return {
    id,
    userId: null,
    name: null,
    inbox,
    send(msg) { inbox.push(msg); }
  };
}

test('matchmaker: Pool matchmaking queue, authoritative shot physics, turn validation, and spectator feed', () => {
  const db = openDb(':memory:');
  const economy = createEconomy(db);
  const mm = createMatchmaker(economy);

  const c1 = makeClient('peer_1');
  const c2 = makeClient('peer_2');
  const spec = makeClient('peer_spec');

  economy.handle(c1, { t: 'auth', name: 'Kage' });
  economy.handle(c2, { t: 'auth', name: 'Mira' });
  economy.handle(spec, { t: 'auth', name: 'Watcher' });

  const q1 = mm.handle(c1, { t: 'match.queue', game: 'pool', propId: 'pool0' });
  assert.equal(q1.ok, true);
  assert.equal(q1.matched, false);

  const q2 = mm.handle(c2, { t: 'match.queue', game: 'pool', propId: 'pool0' });
  assert.equal(q2.ok, true);
  assert.equal(q2.matched, true);
  const sessionId = q2.session.id;

  // Both players received match.start
  assert.ok(c1.inbox.some(m => m.type === 'match.start' && m.mySeat === 1));
  assert.ok(c2.inbox.some(m => m.type === 'match.start' && m.mySeat === 2));

  // Spectator joins
  const spRes = mm.handle(spec, { t: 'match.spectate', sessionId });
  assert.equal(spRes.ok, true);

  // Player 2 cannot shoot on Player 1's turn
  const wrongTurn = mm.handle(c2, { t: 'match.shoot', sessionId, aimAngle: 0, power: 0.8 });
  assert.equal(wrongTurn.ok, false);
  assert.equal(wrongTurn.error, 'not_your_turn');

  // Player 1 breaks the rack
  const shot1 = mm.handle(c1, { t: 'match.shoot', sessionId, aimAngle: 0.02, power: 0.9, spinX: 0, spinY: 0.2 });
  assert.equal(shot1.ok, true);
  assert.equal(shot1.outcome.shotsCount, 1);

  // Spectator and Player 2 received the authoritative shot + outcome
  assert.ok(c2.inbox.some(m => m.type === 'match.shot' && m.sessionId === sessionId));
  assert.ok(spec.inbox.some(m => m.type === 'match.shot' && m.sessionId === sessionId));
});

test('matchmaker: Direct Ludo challenge, accept, and server-authoritative dice rolls & moves', () => {
  const db = openDb(':memory:');
  const economy = createEconomy(db);
  // Deterministic dice sequence: 6 (bring token out), 4 (advance token)
  const dice = [6, 4, 2];
  let dIdx = 0;
  const mm = createMatchmaker(economy, { rngDie: () => dice[dIdx++ % dice.length] });

  const c1 = makeClient('peer_1');
  const c2 = makeClient('peer_2');
  economy.handle(c1, { t: 'auth', name: 'Kage' });
  economy.handle(c2, { t: 'auth', name: 'Tunde' });
  mm.registerClient(c1);
  mm.registerClient(c2);

  const ch = mm.handle(c1, { t: 'match.challenge', game: 'ludo', toUserId: c2.userId });
  assert.equal(ch.ok, true);
  assert.ok(c2.inbox.some(m => m.type === 'challenge.invite' && m.challengeId === ch.challengeId));

  const acc = mm.handle(c2, { t: 'match.accept', challengeId: ch.challengeId });
  assert.equal(acc.ok, true);
  const sessionId = acc.session.id;

  // Player 1 rolls a 6 -> all 4 tokens in base have the identical legal move (enter at 0), or pick phase
  const r1 = mm.handle(c1, { t: 'match.roll', sessionId, power: 0.7 });
  assert.equal(r1.ok, true);
  assert.equal(r1.face, 6);

  if (r1.snapshot.phase === 'pick') {
    const mv = mm.handle(c1, { t: 'match.move', sessionId, token: 0 });
    assert.equal(mv.ok, true);
    assert.equal(mv.snapshot.tokens[0][0], 0);
  }
});

test('matchmaker: Escrow Contest auto-launches match and settles pot + rake to winner on finish', () => {
  const db = openDb(':memory:');
  let mm = null;
  const economy = createEconomy(db, {
    onContestLocked(contest) {
      const p1 = mm.clientsByUser.get(contest.players[0]);
      const p2 = mm.clientsByUser.get(contest.players[1]);
      if (p1 && p2) mm.startSession({ game: contest.game, p1, p2, contestId: contest.id });
    }
  });
  mm = createMatchmaker(economy);

  const c1 = makeClient('peer_1');
  const c2 = makeClient('peer_2');
  economy.handle(c1, { t: 'auth', name: 'Kage' });
  economy.handle(c2, { t: 'auth', name: 'Mira' });
  mm.registerClient(c1);
  mm.registerClient(c2);

  // Create 25 COIN Pool Showdown (2 players, 10% rake = 1000 bps)
  const created = economy.handle(c1, { t: 'contest.create', game: 'pool', currency: 'COIN', entryFee: 25, maxPlayers: 2, rakeBps: 1000 });
  assert.equal(created.ok, true);
  const contestId = created.contest.id;

  economy.handle(c1, { t: 'contest.join', contestId });
  economy.handle(c2, { t: 'contest.join', contestId });

  // Both players paid 25 COIN into escrow (balance 100 -> 75 COIN; escrow = 50 COIN)
  assert.equal(economy.ledger.balance(userAccount(c1.userId, 'COIN')), 75);
  assert.equal(economy.ledger.balance(userAccount(c2.userId, 'COIN')), 75);
  assert.equal(economy.ledger.balance(escrowAccount(contestId, 'COIN')), 50);

  // Match session automatically started when the 2nd player joined!
  const startMsg = c1.inbox.find(m => m.type === 'match.start');
  assert.ok(startMsg, 'match.start should fire when contest locks');
  const session = mm.sessions.get(startMsg.session.id);
  assert.ok(session);

  // Conclude match with Player 1 (seat 1) winning
  const over = mm.finishSession(session, 1, '8-ball pocketed');
  assert.ok(over);
  assert.equal(over.winnerUserId, c1.userId);
  assert.equal(over.contestSettlement.pot, 50);
  assert.equal(over.contestSettlement.rake, 5);

  // Escrow is now 0; rake is 5; Player 1 has 75 + 45 (pot) + 25 (match win reward) = 145 COIN
  assert.equal(economy.ledger.balance(escrowAccount(contestId, 'COIN')), 0);
  assert.equal(economy.ledger.balance(rakeAccount('COIN')), 5);
  assert.equal(economy.ledger.balance(userAccount(c1.userId, 'COIN')), 145);
  // Player 2 gets +5 COIN consolation reward -> 75 + 5 = 80 COIN
  assert.equal(economy.ledger.balance(userAccount(c2.userId, 'COIN')), 80);

  assert.equal(economy.ledger.auditInvariant().ok, true);
});
