// Pay-to-enter contests settled through escrow. Virtual currencies today; real currencies only for
// skill games and only when the compliance gate passes (enforced here AND in the ledger).
import crypto from 'node:crypto';
import { inTx } from './db.js';
import { GAME_INFO } from '../src/progression.js';
import { CURRENCIES, isRealCurrency, LedgerError, userAccount, escrowAccount, rakeAccount } from './ledger.js';
import { canUseRealMoney } from './compliance.js';

export const MAX_RAKE_BPS = 3000;

export function createContests(db, ledger, opts = {}) {
  const now = opts.now || (() => Date.now());
  const realMoney = opts.realMoney || ledger.realMoney || { enabled: false, allowedCountries: [] };

  const qGet = db.prepare('SELECT * FROM contests WHERE id = ?');
  const qIns = db.prepare(`INSERT INTO contests (id, game, currency, entry_fee, max_players, rake_bps, status, created_at, meta_json)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`);
  const qEntries = db.prepare('SELECT user_id, joined_at FROM contest_entries WHERE contest_id = ? ORDER BY joined_at, rowid');
  const qEntry = db.prepare('SELECT 1 FROM contest_entries WHERE contest_id = ? AND user_id = ?');
  const qCount = db.prepare('SELECT COUNT(*) AS n FROM contest_entries WHERE contest_id = ?');
  const qInsEntry = db.prepare('INSERT INTO contest_entries (contest_id, user_id, joined_at) VALUES (?, ?, ?)');
  const qDelEntry = db.prepare('DELETE FROM contest_entries WHERE contest_id = ? AND user_id = ?');
  const qStatus = db.prepare('UPDATE contests SET status = ?, settled_at = ? WHERE id = ?');
  const qUser = db.prepare('SELECT * FROM users WHERE id = ?');
  const qList = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM contest_entries e WHERE e.contest_id = c.id) AS players
    FROM contests c WHERE c.status IN ('open','locked') ORDER BY c.created_at DESC LIMIT ?`);

  const fail = (code, msg) => { throw new LedgerError(code, msg); };

  function getContest(id) {
    const c = qGet.get(id);
    if (!c) return null;
    return { ...c, players: qEntries.all(id).map(r => r.user_id) };
  }

  function createContest({ game, currency, entryFee, maxPlayers, rakeBps = 0, meta = {} }) {
    if (!GAME_INFO[game]) fail('bad_game', `unknown game ${game}`);
    if (!Object.prototype.hasOwnProperty.call(CURRENCIES, currency)) fail('bad_currency', `unknown currency ${currency}`);
    if (!Number.isSafeInteger(entryFee) || entryFee < 1) fail('bad_amount', 'entryFee must be a positive integer');
    if (!Number.isSafeInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 100) fail('bad_players', 'maxPlayers must be 2..100');
    if (!Number.isSafeInteger(rakeBps) || rakeBps < 0 || rakeBps > MAX_RAKE_BPS) fail('bad_rake', `rakeBps must be 0..${MAX_RAKE_BPS}`);
    if (isRealCurrency(currency)) {
      if (!GAME_INFO[game].skill) fail('not_skill_game', `${game} is not a skill game; real money refused`);
      if (!realMoney.enabled) fail('compliance', 'real money disabled');
    }
    const id = 'c_' + crypto.randomBytes(8).toString('hex');
    qIns.run(id, game, currency, entryFee, maxPlayers, rakeBps, now(), JSON.stringify(meta || {}));
    return getContest(id);
  }

  // Idempotent per user: joining twice returns { already: true } and charges nothing.
  function joinContest(contestId, userId) {
    return inTx(db, () => {
      const c = qGet.get(contestId);
      if (!c) fail('not_found', 'contest not found');
      if (qEntry.get(contestId, userId)) return { contest: getContest(contestId), already: true };
      if (c.status !== 'open') fail('closed', `contest is ${c.status}`);
      if (isRealCurrency(c.currency)) {
        if (!GAME_INFO[c.game]?.skill) fail('not_skill_game', 'real money refused for non-skill game');
        const gate = canUseRealMoney(qUser.get(userId), realMoney);
        if (!gate.ok) fail('compliance', `real money refused: ${gate.reasons.join(',')}`);
      }
      const n = Number(qCount.get(contestId).n);
      if (n >= c.max_players) fail('full', 'contest is full');
      ledger.transfer({ from: userAccount(userId, c.currency), to: escrowAccount(contestId, c.currency), amount: c.entry_fee,
        currency: c.currency, kind: 'contest_join', memo: contestId, idemKey: `contest:${contestId}:join:${userId}:${crypto.randomUUID()}` });
      qInsEntry.run(contestId, userId, now());
      if (n + 1 >= c.max_players) qStatus.run('locked', null, contestId);
      return { contest: getContest(contestId), already: false };
    });
  }

  function leaveContest(contestId, userId) {
    return inTx(db, () => {
      const c = qGet.get(contestId);
      if (!c) fail('not_found', 'contest not found');
      if (c.status !== 'open') fail('closed', `contest is ${c.status}`);
      if (!qEntry.get(contestId, userId)) fail('not_entered', 'not in contest');
      ledger.transfer({ from: escrowAccount(contestId, c.currency), to: userAccount(userId, c.currency), amount: c.entry_fee,
        currency: c.currency, kind: 'contest_refund', memo: contestId, idemKey: `contest:${contestId}:leave:${userId}:${crypto.randomUUID()}` });
      qDelEntry.run(contestId, userId);
      return { contest: getContest(contestId) };
    });
  }

  function lockContest(contestId) {
    const c = qGet.get(contestId);
    if (!c) fail('not_found', 'contest not found');
    if (c.status === 'open') qStatus.run('locked', null, contestId);
    return getContest(contestId);
  }

  /**
   * placements: [{ userId, shareBps }] — winners must be entrants, shares positive ints summing to 10000.
   * pot = escrow; rake = floor(pot * rakeBps / 1e4); each payout = floor(prizePool * share / 1e4);
   * rounding remainder goes to rake so escrow ends at exactly 0. Server-internal only.
   */
  function settleContest(contestId, placements) {
    return inTx(db, () => {
      const c = qGet.get(contestId);
      if (!c) fail('not_found', 'contest not found');
      if (c.status !== 'open' && c.status !== 'locked') fail('closed', `contest is ${c.status}`);
      if (!Array.isArray(placements) || placements.length === 0) fail('bad_placements', 'no placements');
      const seen = new Set();
      let total = 0;
      for (const p of placements) {
        if (!p || !qEntry.get(contestId, p.userId)) fail('bad_placements', `winner ${p && p.userId} not an entrant`);
        if (seen.has(p.userId)) fail('bad_placements', 'duplicate winner');
        if (!Number.isSafeInteger(p.shareBps) || p.shareBps <= 0) fail('bad_placements', 'shareBps must be positive integer');
        seen.add(p.userId); total += p.shareBps;
      }
      if (total !== 10000) fail('bad_placements', `shares sum to ${total}, expected 10000`);
      const cur = c.currency;
      const escrow = escrowAccount(contestId, cur);
      const pot = ledger.balance(escrow);
      const rake = Math.floor((pot * c.rake_bps) / 10000);
      const pool = pot - rake;
      const payouts = placements.map(p => ({ userId: p.userId, amount: Math.floor((pool * p.shareBps) / 10000) }));
      const paid = payouts.reduce((s, p) => s + p.amount, 0);
      const rakeTotal = pot - paid;   // rake + rounding remainder
      const entries = [];
      if (pot > 0) {
        entries.push({ account: escrow, amount: -pot, currency: cur });
        for (const p of payouts) if (p.amount > 0) entries.push({ account: userAccount(p.userId, cur), amount: p.amount, currency: cur });
        if (rakeTotal > 0) entries.push({ account: rakeAccount(cur), amount: rakeTotal, currency: cur });
        ledger.post({ kind: 'contest_settle', memo: contestId, idemKey: `contest:${contestId}:settle`, entries });
      }
      if (ledger.balance(escrow) !== 0) fail('escrow_nonzero', 'escrow not empty after settle');
      qStatus.run('settled', now(), contestId);
      return { contest: getContest(contestId), pot, rake: rakeTotal, payouts };
    });
  }

  function cancelContest(contestId) {
    return inTx(db, () => {
      const c = qGet.get(contestId);
      if (!c) fail('not_found', 'contest not found');
      if (c.status !== 'open' && c.status !== 'locked') fail('closed', `contest is ${c.status}`);
      const escrow = escrowAccount(contestId, c.currency);
      const refunds = [];
      for (const { user_id } of qEntries.all(contestId)) {
        ledger.transfer({ from: escrow, to: userAccount(user_id, c.currency), amount: c.entry_fee, currency: c.currency,
          kind: 'contest_refund', memo: contestId, idemKey: `contest:${contestId}:cancel:${user_id}` });
        refunds.push({ userId: user_id, amount: c.entry_fee });
      }
      if (ledger.balance(escrow) !== 0) fail('escrow_nonzero', 'escrow not empty after cancel');
      qStatus.run('cancelled', now(), contestId);
      return { contest: getContest(contestId), refunds };
    });
  }

  const listContests = (limit = 50) => qList.all(Math.max(1, Math.min(200, limit | 0)));

  return { createContest, joinContest, leaveContest, lockContest, settleContest, cancelContest, getContest, listContests };
}
