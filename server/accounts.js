// Guest accounts: bearer token (32 random bytes, base64url) — only its sha256 is stored.
import crypto from 'node:crypto';
import { inTx } from './db.js';
import { normalizeProfile, newProfile } from '../src/progression.js';

export const SIGNUP_GRANT_COIN = 100;
const MAX_INVENTORY = 200;

export const hashToken = token => crypto.createHash('sha256').update(String(token)).digest('hex');

export function sanitizeName(name) {
  // strip control chars and angle brackets, collapse whitespace, clamp to 14 chars
  const s = String(name ?? '').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, 14).join('').trim();
}

export function sanitizeInventory(inv) {
  if (!Array.isArray(inv)) return [];
  return inv.filter(x => typeof x === 'string' && x.length > 0 && x.length <= 64).slice(0, MAX_INVENTORY);
}

// Stored profile = progression profile (normalizeProfile) + inventory.
export function normalizeStoredProfile(p) {
  return { ...normalizeProfile(p), inventory: sanitizeInventory(p && p.inventory) };
}

export function createAccounts(db, ledger, opts = {}) {
  const now = opts.now || (() => Date.now());
  const qByHash = db.prepare('SELECT * FROM users WHERE token_hash = ?');
  const qById = db.prepare('SELECT * FROM users WHERE id = ?');
  const qIns = db.prepare('INSERT INTO users (id, name, created_at, token_hash, profile_json) VALUES (?, ?, ?, ?, ?)');
  const qRename = db.prepare('UPDATE users SET name = ? WHERE id = ?');
  const qSaveProfile = db.prepare('UPDATE users SET profile_json = ? WHERE id = ?');

  function createGuest(name) {
    const clean = sanitizeName(name) || 'Guest';
    const id = 'u_' + crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x');
    const token = crypto.randomBytes(32).toString('base64url');
    const profile = normalizeStoredProfile(newProfile());
    inTx(db, () => {
      qIns.run(id, clean, now(), hashToken(token), JSON.stringify(profile));
      ledger.ensureAccount(`user:${id}:COIN`);
      ledger.ensureAccount(`user:${id}:TICKET`);
      ledger.mint(id, 'COIN', SIGNUP_GRANT_COIN, 'signup', `signup:${id}`);
    });
    return { user: qById.get(id), token };
  }

  function authenticate(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    return qByHash.get(hashToken(token)) || null;
  }

  const getUser = id => qById.get(id) || null;

  function rename(id, name) {
    const clean = sanitizeName(name);
    if (!clean) return null;
    qRename.run(clean, id);
    return clean;
  }

  function getProfile(id) {
    const row = qById.get(id);
    if (!row) return null;
    let raw = {};
    try { raw = JSON.parse(row.profile_json || '{}'); } catch (_) { raw = {}; }
    return normalizeStoredProfile(raw);
  }

  function saveProfile(id, profile) {
    const p = normalizeStoredProfile(profile);
    qSaveProfile.run(JSON.stringify(p), id);
    return p;
  }

  return { createGuest, authenticate, getUser, rename, getProfile, saveProfile };
}
