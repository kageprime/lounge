import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createLedger, userAccount, escrowAccount, rakeAccount } from '../server/ledger.js';
import { createAccounts, SIGNUP_GRANT_COIN } from '../server/accounts.js';
import { createContests } from '../server/contests.js';
import { createEconomy } from '../server/economy.js';
import { levelFromXp, cardTier, eloUpdate, dailyQuests, applyResult, claimQuest, newProfile, refreshQuests } from '../src/progression.js';

test('progression: level curve, card tiers, Elo, daily quests, and result application', () => {
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(100).level, 2);
  assert.equal(cardTier(1).id, 'bronze');
  assert.equal(cardTier(25).id, 'neon');
  assert.equal(cardTier(50).id, 'void');

  const elo = eloUpdate(1200, 1200, 1, 24);
  assert.equal(elo.a, 1212);
  assert.equal(elo.b, 1188);

  const q1 = dailyQuests('2026-10-23');
  const q2 = dailyQuests('2026-10-23');
  assert.deepEqual(q1, q2);
  assert.equal(q1.length, 3);

  let prof = refreshQuests(newProfile(), '2026-10-23');
  const res = applyResult(prof, { game: 'pool', won: true, opponentRating: 1250 }, '2026-10-23');
  assert.ok(res);
  assert.equal(res.won, true);
  assert.equal(res.reward.coins, 25);
  assert.equal(res.reward.tickets, 40);
  assert.equal(res.streak, 1);
  assert.equal(res.profile.stats.pool.played, 1);
  assert.equal(res.profile.stats.pool.won, 1);
  assert.ok(res.rating > 1200);
});

test('ledger: double-entry invariant, non-negative balances, and idempotency', () => {
  const db = openDb(':memory:');
  const ledger = createLedger(db);
  const accounts = createAccounts(db, ledger);

  const { user: u1 } = accounts.createGuest('Kage');
  const { user: u2 } = accounts.createGuest('Mira');

  assert.equal(ledger.balance(userAccount(u1.id, 'COIN')), SIGNUP_GRANT_COIN);
  assert.equal(ledger.balance(userAccount(u2.id, 'COIN')), SIGNUP_GRANT_COIN);

  // Idempotent transfer
  const tx1 = ledger.transfer({
    from: userAccount(u1.id, 'COIN'),
    to: userAccount(u2.id, 'COIN'),
    amount: 40,
    currency: 'COIN',
    idemKey: 'tx-idem-1'
  });
  assert.equal(tx1.duplicate, false);

  const tx1Dup = ledger.transfer({
    from: userAccount(u1.id, 'COIN'),
    to: userAccount(u2.id, 'COIN'),
    amount: 40,
    currency: 'COIN',
    idemKey: 'tx-idem-1'
  });
  assert.equal(tx1Dup.duplicate, true);
  assert.equal(tx1Dup.txId, tx1.txId);
  assert.equal(ledger.balance(userAccount(u1.id, 'COIN')), 60);
  assert.equal(ledger.balance(userAccount(u2.id, 'COIN')), 140);

  // Overdraft rejected
  assert.throws(() => {
    ledger.burn(u1.id, 'COIN', 999, 'overdraft');
  }, { code: 'insufficient_funds' });
  assert.equal(ledger.balance(userAccount(u1.id, 'COIN')), 60);

  const audit = ledger.auditInvariant();
  assert.equal(audit.ok, true, audit.problems.join('; '));
});

test('contests: escrow join, leave refund, settle with rake + rounding remainder, and cancel', () => {
  const db = openDb(':memory:');
  const ledger = createLedger(db);
  const accounts = createAccounts(db, ledger);
  const contests = createContests(db, ledger);

  const u1 = accounts.createGuest('A').user;
  const u2 = accounts.createGuest('B').user;
  const u3 = accounts.createGuest('C').user;
  for (const u of [u1, u2, u3]) ledger.mint(u.id, 'COIN', 500, 'topup');

  // 3 players x 500 COIN = 1500 pot; 10% rake (1000 bps) = 150; prize pool = 1350
  // Split 67% / 33% (6667 / 3333 bps) -> floor(1350*0.6667)=900, floor(1350*0.3333)=449, remainder 1 goes to rake (total rake 151)
  const c = contests.createContest({
    game: 'pool',
    currency: 'COIN',
    entryFee: 500,
    maxPlayers: 3,
    rakeBps: 1000
  });

  contests.joinContest(c.id, u1.id);
  // Idempotent second join does not double charge
  const dup = contests.joinContest(c.id, u1.id);
  assert.equal(dup.already, true);
  assert.equal(ledger.balance(userAccount(u1.id, 'COIN')), 100);

  // Join and leave while open refunds entry fee
  contests.joinContest(c.id, u2.id);
  contests.leaveContest(c.id, u2.id);
  assert.equal(ledger.balance(userAccount(u2.id, 'COIN')), 600);

  // Re-join u2 and join u3 (locks contest at maxPlayers=3)
  contests.joinContest(c.id, u2.id);
  const j3 = contests.joinContest(c.id, u3.id);
  assert.equal(j3.contest.status, 'locked');
  assert.equal(ledger.balance(escrowAccount(c.id, 'COIN')), 1500);

  const settled = contests.settleContest(c.id, [
    { userId: u1.id, shareBps: 6667 },
    { userId: u2.id, shareBps: 3333 }
  ]);
  assert.equal(settled.pot, 1500);
  assert.equal(settled.rake, 151);
  assert.equal(ledger.balance(escrowAccount(c.id, 'COIN')), 0);
  assert.equal(ledger.balance(rakeAccount('COIN')), 151);
  assert.equal(ledger.balance(userAccount(u1.id, 'COIN')), 100 + 900);
  assert.equal(ledger.balance(userAccount(u2.id, 'COIN')), 100 + 449);
  assert.equal(ledger.balance(userAccount(u3.id, 'COIN')), 100);

  // Cancel contest refunds everyone
  const c2 = contests.createContest({ game: 'pool', currency: 'COIN', entryFee: 50, maxPlayers: 4, rakeBps: 500 });
  contests.joinContest(c2.id, u1.id);
  contests.joinContest(c2.id, u3.id);
  contests.cancelContest(c2.id);
  assert.equal(ledger.balance(escrowAccount(c2.id, 'COIN')), 0);
  assert.equal(ledger.balance(userAccount(u3.id, 'COIN')), 100);

  const audit = ledger.auditInvariant();
  assert.equal(audit.ok, true, audit.problems.join('; '));
});

test('compliance: real money (USD/NGN) requires skill game + KYC + age + allowed country', () => {
  const db = openDb(':memory:');
  const realMoney = { enabled: true, allowedCountries: ['NG', 'US', 'GB'] };
  const ledger = createLedger(db, { realMoney });
  const accounts = createAccounts(db, ledger);
  const contests = createContests(db, ledger, { realMoney });

  const u = accounts.createGuest('Tunde').user;

  // Luck game (Ludo) refused for NGN even when realMoney is enabled
  assert.throws(() => {
    contests.createContest({ game: 'ludo', currency: 'NGN', entryFee: 50000, maxPlayers: 2 });
  }, { code: 'not_skill_game' });

  // Unverified user refused NGN mint
  assert.throws(() => {
    ledger.mint(u.id, 'NGN', 100000, 'deposit');
  }, { code: 'compliance' });

  // Verify user KYC + age + country NG
  db.prepare('UPDATE users SET kyc_status = ?, age_verified = 1, country = ? WHERE id = ?').run('verified', 'NG', u.id);
  ledger.mint(u.id, 'NGN', 100000, 'deposit');
  assert.equal(ledger.balance(userAccount(u.id, 'NGN')), 100000);

  const poolContest = contests.createContest({ game: 'pool', currency: 'NGN', entryFee: 50000, maxPlayers: 2, rakeBps: 1000 });
  contests.joinContest(poolContest.id, u.id);
  assert.equal(ledger.balance(userAccount(u.id, 'NGN')), 50000);
  assert.equal(ledger.balance(escrowAccount(poolContest.id, 'NGN')), 50000);

  assert.equal(ledger.auditInvariant().ok, true);
});

test('economy handler: auth, anti-abuse match duration, duplicate match rejection, shop, and daily tokens', () => {
  let clock = Date.UTC(2026, 9, 23, 14, 0, 0);
  const db = openDb(':memory:');
  const econ = createEconomy(db, { now: () => clock, fastMode: false });

  const session = { send() {} };
  const auth = econ.handle(session, { t: 'auth', name: 'Kage' });
  assert.equal(auth.ok, true);
  assert.equal(auth.wallet.COIN, 100);

  // Start pool match and try to report immediately (< 45s) -> rejected
  const start = econ.handle(session, { t: 'gameStart', game: 'pool' });
  assert.equal(start.ok, true);
  const fastRes = econ.handle(session, { t: 'result', matchId: start.matchId, won: true });
  assert.equal(fastRes.ok, false);
  assert.equal(fastRes.reason, 'too_fast');

  // Advance clock 50 seconds -> accepted
  clock += 50_000;
  const goodRes = econ.handle(session, { t: 'result', matchId: start.matchId, won: true });
  assert.equal(goodRes.ok, true);
  assert.equal(goodRes.wallet.COIN, 125);
  assert.equal(goodRes.wallet.TICKET, 40);

  // Reporting the same matchId a second time -> rejected
  const dupRes = econ.handle(session, { t: 'result', matchId: start.matchId, won: true });
  assert.equal(dupRes.ok, false);
  assert.equal(dupRes.reason, 'already_reported');

  // Spend 10 COIN on claw, then claim clawPrize
  const spend = econ.handle(session, { t: 'spend', what: 'claw' });
  assert.equal(spend.ok, true);
  assert.equal(spend.wallet.COIN, 115);

  const prize = econ.handle(session, { t: 'clawPrize', tickets: 85 });
  assert.equal(prize.ok, true);
  assert.equal(prize.wallet.TICKET, 125);

  // Second clawPrize without paying -> rejected
  const prize2 = econ.handle(session, { t: 'clawPrize', tickets: 85 });
  assert.equal(prize2.ok, false);

  // Buy Golden Neon Halo (100 TICKET)
  const buy = econ.handle(session, { t: 'buy', item: 'halo' });
  assert.equal(buy.ok, true);
  assert.equal(buy.wallet.TICKET, 25);
  assert.ok(buy.profile.inventory.includes('Golden Neon Halo'));

  assert.equal(econ.ledger.auditInvariant().ok, true);
});
