// Double-entry ledger. Integer minor units only (COIN/TICKET whole units; USD cents; NGN kobo).
// Every transaction's entries sum to exactly 0 per currency. Cached balances are updated in the same
// SQLite transaction as the entries, and auditInvariant() re-derives them from the entries.
import crypto from 'node:crypto';
import { inTx } from './db.js';
import { canUseRealMoney } from './compliance.js';

export const CURRENCIES = {
  COIN:   { real: false },
  TICKET: { real: false },
  USD:    { real: true, minor: 2 },
  NGN:    { real: true, minor: 2 }
};
export const isRealCurrency = cur => !!(CURRENCIES[cur] && CURRENCIES[cur].real);

export class LedgerError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

export const userAccount = (uid, cur) => `user:${uid}:${cur}`;
export const mintAccount = cur => `system:mint:${cur}`;
export const sinkAccount = cur => `system:sink:${cur}`;
export const rakeAccount = cur => `system:rake:${cur}`;
export const escrowAccount = (contestId, cur) => `escrow:contest:${contestId}:${cur}`;

export function assertAmount(n, { allowZero = false } = {}) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw new LedgerError('bad_amount', `amount must be a safe integer, got ${n}`);
  if (n < 0 || (!allowZero && n === 0)) throw new LedgerError('bad_amount', `amount must be ${allowZero ? '>= 0' : '> 0'}, got ${n}`);
  return n;
}
function assertCurrency(cur) {
  if (!Object.prototype.hasOwnProperty.call(CURRENCIES, cur)) throw new LedgerError('bad_currency', `unknown currency ${cur}`);
  return cur;
}

// Derive owner / allow_negative / currency from a well-known account id.
function describeAccount(id) {
  const parts = String(id).split(':');
  const cur = parts[parts.length - 1];
  if (parts[0] === 'user' && parts.length === 3) return { owner: parts[1], currency: cur, allowNegative: 0, userId: parts[1] };
  if (parts[0] === 'system' && parts.length === 3 && ['mint', 'sink', 'rake'].includes(parts[1])) {
    return { owner: 'system', currency: cur, allowNegative: parts[1] === 'mint' ? 1 : 0 };
  }
  if (parts[0] === 'escrow' && parts[1] === 'contest' && parts.length === 4) return { owner: `contest:${parts[2]}`, currency: cur, allowNegative: 0 };
  return null;
}

/**
 * createLedger(db, { realMoney: { enabled, allowedCountries }, now })
 * realMoney config feeds the compliance gate for any real-currency entry touching a user account.
 */
export function createLedger(db, opts = {}) {
  const realMoney = opts.realMoney || { enabled: false, allowedCountries: [] };
  const now = opts.now || (() => Date.now());

  const qAcc = db.prepare('SELECT * FROM ledger_accounts WHERE id = ?');
  const qInsAcc = db.prepare('INSERT INTO ledger_accounts (id, owner, currency, allow_negative, balance) VALUES (?, ?, ?, ?, 0)');
  const qTxByIdem = db.prepare('SELECT * FROM ledger_tx WHERE idem_key = ?');
  const qInsTx = db.prepare('INSERT INTO ledger_tx (id, kind, memo, idem_key, created_at) VALUES (?, ?, ?, ?, ?)');
  const qInsEntry = db.prepare('INSERT INTO ledger_entries (tx_id, account_id, amount, currency) VALUES (?, ?, ?, ?)');
  const qSetBal = db.prepare('UPDATE ledger_accounts SET balance = balance + ? WHERE id = ?');
  const qUser = db.prepare('SELECT id, kyc_status, age_verified, country, banned FROM users WHERE id = ?');

  function ensureAccount(id, { owner, currency, allowNegative } = {}) {
    let acc = qAcc.get(id);
    if (acc) return acc;
    const d = describeAccount(id) || {};
    const cur = assertCurrency(currency ?? d.currency);
    if (d.currency && d.currency !== cur) throw new LedgerError('bad_account', `account ${id} is not ${cur}`);
    const own = owner ?? d.owner;
    if (!own) throw new LedgerError('bad_account', `cannot infer owner for ${id}`);
    qInsAcc.run(id, own, cur, (allowNegative ?? d.allowNegative) ? 1 : 0);
    return qAcc.get(id);
  }

  function balance(id) {
    const acc = qAcc.get(id);
    return acc ? Number(acc.balance) : 0;
  }

  function realMoneyCheck(accountId) {
    const d = describeAccount(accountId);
    if (!d || !d.userId) return;
    const gate = canUseRealMoney(qUser.get(d.userId), realMoney);
    if (!gate.ok) throw new LedgerError('compliance', `real money refused: ${gate.reasons.join(',')}`);
  }

  /**
   * Post a balanced multi-leg transaction.
   * entries: [{ account, amount (signed int, != 0), currency }]; must sum to 0 per currency.
   * Idempotent on idemKey: a repeat returns the original tx with duplicate:true and posts nothing.
   */
  function post({ kind, memo = null, idemKey = null, entries }) {
    if (!kind || typeof kind !== 'string') throw new LedgerError('bad_kind');
    if (!Array.isArray(entries) || entries.length < 2) throw new LedgerError('bad_entries', 'need >= 2 entries');
    const sums = {};
    for (const e of entries) {
      assertCurrency(e.currency);
      if (typeof e.amount !== 'number' || !Number.isSafeInteger(e.amount) || e.amount === 0) throw new LedgerError('bad_amount', `entry amount must be a non-zero safe integer, got ${e.amount}`);
      sums[e.currency] = (sums[e.currency] || 0) + e.amount;
    }
    for (const [cur, s] of Object.entries(sums)) if (s !== 0) throw new LedgerError('unbalanced', `${cur} entries sum to ${s}`);

    return inTx(db, () => {
      if (idemKey != null) {
        const existing = qTxByIdem.get(String(idemKey));
        if (existing) return { txId: existing.id, duplicate: true };
      }
      // Net per account so a multi-leg tx is validated on its final effect.
      const net = new Map();
      for (const e of entries) {
        const acc = ensureAccount(e.account, { currency: e.currency });
        if (acc.currency !== e.currency) throw new LedgerError('currency_mismatch', `${e.account} holds ${acc.currency}, not ${e.currency}`);
        if (isRealCurrency(e.currency)) realMoneyCheck(e.account);
        net.set(e.account, (net.get(e.account) || 0) + e.amount);
      }
      for (const [id, delta] of net) {
        const acc = qAcc.get(id);
        if (!acc.allow_negative && Number(acc.balance) + delta < 0) throw new LedgerError('insufficient_funds', `${id} would go negative`);
      }
      const txId = crypto.randomUUID();
      qInsTx.run(txId, kind, memo, idemKey == null ? null : String(idemKey), now());
      for (const e of entries) qInsEntry.run(txId, e.account, e.amount, e.currency);
      for (const [id, delta] of net) if (delta !== 0) qSetBal.run(delta, id);
      return { txId, duplicate: false };
    });
  }

  function transfer({ from, to, amount, currency, kind = 'transfer', memo = null, idemKey = null }) {
    assertAmount(amount);
    if (from === to) throw new LedgerError('bad_entries', 'from === to');
    return post({ kind, memo, idemKey, entries: [
      { account: from, amount: -amount, currency },
      { account: to, amount, currency }
    ] });
  }

  const mint = (userId, cur, amt, kind = 'mint', idemKey = null, memo = null) =>
    transfer({ from: mintAccount(cur), to: userAccount(userId, cur), amount: amt, currency: cur, kind, idemKey, memo });
  const burn = (userId, cur, amt, kind = 'burn', idemKey = null, memo = null) =>
    transfer({ from: userAccount(userId, cur), to: sinkAccount(cur), amount: amt, currency: cur, kind, idemKey, memo });

  const txExists = idemKey => !!qTxByIdem.get(String(idemKey));

  function auditInvariant() {
    const problems = [];
    for (const r of db.prepare('SELECT currency, SUM(amount) AS s FROM ledger_entries GROUP BY currency').all()) {
      if (Number(r.s) !== 0) problems.push(`currency ${r.currency} entries sum to ${r.s}`);
    }
    for (const r of db.prepare('SELECT tx_id, currency, SUM(amount) AS s FROM ledger_entries GROUP BY tx_id, currency HAVING s != 0').all()) {
      problems.push(`tx ${r.tx_id} ${r.currency} unbalanced by ${r.s}`);
    }
    const rows = db.prepare(`SELECT a.id, a.balance, a.allow_negative, COALESCE(SUM(e.amount), 0) AS s
      FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id = a.id GROUP BY a.id`).all();
    for (const r of rows) {
      if (Number(r.balance) !== Number(r.s)) problems.push(`account ${r.id} cached ${r.balance} != entries ${r.s}`);
      if (!r.allow_negative && Number(r.balance) < 0) problems.push(`account ${r.id} negative (${r.balance})`);
    }
    return { ok: problems.length === 0, problems };
  }

  return { ensureAccount, balance, post, transfer, mint, burn, txExists, auditInvariant, realMoney };
}
