// SQLite persistence for the authoritative economy (Node >= 22.5 built-in `node:sqlite`, zero npm deps).
// openDb(':memory:') for tests; default file is data/lounge.db (override with env LOUNGE_DB).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DB_PATH = path.join(root, 'data', 'lounge.db');

// Append-only list. Never edit a shipped migration; add a new one.
const MIGRATIONS = [
  // 1: core schema
  `
  CREATE TABLE users (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    token_hash   TEXT UNIQUE NOT NULL,
    profile_json TEXT NOT NULL DEFAULT '{}',
    kyc_status   TEXT NOT NULL DEFAULT 'none',
    age_verified INTEGER NOT NULL DEFAULT 0,
    country      TEXT,
    banned       INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE ledger_accounts (
    id             TEXT PRIMARY KEY,
    owner          TEXT NOT NULL,
    currency       TEXT NOT NULL,
    allow_negative INTEGER NOT NULL DEFAULT 0,
    balance        INTEGER NOT NULL DEFAULT 0,
    CHECK (allow_negative = 1 OR balance >= 0)
  );
  CREATE INDEX ledger_accounts_owner ON ledger_accounts(owner);
  CREATE TABLE ledger_tx (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,
    memo       TEXT,
    idem_key   TEXT UNIQUE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE ledger_entries (
    tx_id      TEXT NOT NULL REFERENCES ledger_tx(id),
    account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
    amount     INTEGER NOT NULL,
    currency   TEXT NOT NULL
  );
  CREATE INDEX ledger_entries_tx ON ledger_entries(tx_id);
  CREATE INDEX ledger_entries_account ON ledger_entries(account_id);
  CREATE TABLE contests (
    id          TEXT PRIMARY KEY,
    game        TEXT NOT NULL,
    currency    TEXT NOT NULL,
    entry_fee   INTEGER NOT NULL,
    max_players INTEGER NOT NULL,
    rake_bps    INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','settled','cancelled')),
    created_at  INTEGER NOT NULL,
    settled_at  INTEGER,
    meta_json   TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE contest_entries (
    contest_id TEXT NOT NULL REFERENCES contests(id),
    user_id    TEXT NOT NULL REFERENCES users(id),
    joined_at  INTEGER NOT NULL,
    UNIQUE (contest_id, user_id)
  );
  CREATE TABLE matches (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    game        TEXT NOT NULL,
    started_at  INTEGER NOT NULL,
    finished_at INTEGER,
    won         INTEGER,
    rewarded    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX matches_user_finished ON matches(user_id, finished_at);
  `
];

export function openDb(file = process.env.LOUNGE_DB || DEFAULT_DB_PATH) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get();
  let v = row && row.v != null ? Number(row.v) : 0;
  for (; v < MIGRATIONS.length; v++) {
    inTx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(v + 1, Date.now());
    });
  }
  return v;
}

// Run fn atomically. Outermost call uses BEGIN IMMEDIATE (takes the write lock up front);
// nested calls become SAVEPOINTs so composite operations (e.g. contest join = transfer + entry row) stay atomic.
const depth = new WeakMap();
export function inTx(db, fn) {
  const d = depth.get(db) || 0;
  const sp = `sp_${d}`;
  db.exec(d === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
  depth.set(db, d + 1);
  try {
    const out = fn();
    depth.set(db, d);
    db.exec(d === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return out;
  } catch (e) {
    depth.set(db, d);
    try {
      if (d === 0) db.exec('ROLLBACK');
      else { db.exec(`ROLLBACK TO ${sp}`); db.exec(`RELEASE ${sp}`); }
    } catch (_) { /* already rolled back */ }
    throw e;
  }
}
