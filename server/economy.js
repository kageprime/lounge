// Authoritative economy & progression message handler.
// Bridges WebSocket client sessions to accounts, double-entry ledger, contests, and progression rules.
import crypto from 'node:crypto';
import { inTx } from './db.js';
import { createLedger, userAccount, isRealCurrency, LedgerError } from './ledger.js';
import { realMoneyConfigFromEnv } from './compliance.js';
import { createAccounts } from './accounts.js';
import { createContests } from './contests.js';
import { applyResult, claimQuest, refreshQuests, trackEvent, GAME_INFO, dayKey } from '../src/progression.js';
import { SPEND_PRICES, SHOP_BY_ID } from '../src/catalog.js';

export const MIN_MATCH_SECONDS = {
  pool:    45,
  ludo:    60,
  proto89: 20,
  claw:    3,
  netrun:  5
};

export const DAILY_REWARDED_MATCH_CAP = 60;
export const DAILY_FREE_TOKENS = 50;

export const ECONOMY_COMMANDS = new Set([
  'auth',
  'rename',
  'gameStart',
  'result',
  'claimQuest',
  'trackEvent',
  'spend',
  'buy',
  'clawPrize',
  'dailyTokens',
  'contest.create',
  'contest.join',
  'contest.leave',
  'contest.list'
]);

export function createEconomy(db, opts = {}) {
  const now = opts.now || (() => Date.now());
  const fastMode = opts.fastMode ?? (process.env.ECON_FAST === '1');
  const realMoney = opts.realMoney || realMoneyConfigFromEnv();
  const ledger = opts.ledger || createLedger(db, { realMoney, now });
  const accounts = opts.accounts || createAccounts(db, ledger, { now });
  const contests = opts.contests || createContests(db, ledger, { realMoney, now });

  const qInsMatch = db.prepare('INSERT INTO matches (id, user_id, game, started_at, rewarded) VALUES (?, ?, ?, ?, 0)');
  const qGetMatch = db.prepare('SELECT * FROM matches WHERE id = ?');
  const qFinMatch = db.prepare('UPDATE matches SET finished_at = ?, won = ?, rewarded = ? WHERE id = ?');
  const qDailyCount = db.prepare('SELECT COUNT(*) AS n FROM matches WHERE user_id = ? AND rewarded = 1 AND finished_at >= ?');

  function getWallet(userId) {
    return {
      COIN: ledger.balance(userAccount(userId, 'COIN')),
      TICKET: ledger.balance(userAccount(userId, 'TICKET'))
    };
  }

  function pushState(session, uid, includeProfile = true) {
    if (typeof session.send !== 'function') return;
    const wallet = getWallet(uid);
    session.send({ type: 'wallet', wallet });
    if (includeProfile) {
      const profile = accounts.getProfile(uid);
      session.send({ type: 'profile', profile });
    }
  }

  function handle(session, msg) {
    if (!msg || typeof msg !== 'object') return { ok: false, error: 'bad_request' };
    const t = msg.t;
    const today = dayKey(now());

    try {
      if (t === 'auth') {
        let user = msg.token ? accounts.authenticate(msg.token) : null;
        let token = msg.token || null;
        if (!user) {
          const created = accounts.createGuest(msg.name || 'Guest');
          user = created.user;
          token = created.token;
        } else if (msg.name) {
          accounts.rename(user.id, msg.name);
          user = accounts.getUser(user.id);
        }
        session.userId = user.id;
        session.clawCredits = session.clawCredits || 0;
        let profile = accounts.getProfile(user.id);
        const refreshed = refreshQuests(profile, today);
        if (refreshed.quests.day !== profile.quests.day) {
          profile = accounts.saveProfile(user.id, { ...refreshed, inventory: profile.inventory });
        }
        return {
          ok: true,
          token,
          user: { id: user.id, name: user.name },
          wallet: getWallet(user.id),
          profile
        };
      }

      const uid = session.userId;
      if (!uid) return { ok: false, error: 'unauthenticated' };

      if (t === 'rename') {
        const clean = accounts.rename(uid, msg.name);
        if (!clean) return { ok: false, error: 'bad_name' };
        return { ok: true, name: clean };
      }

      if (t === 'gameStart') {
        const game = String(msg.game || '');
        if (!GAME_INFO[game]) return { ok: false, error: 'bad_game' };
        const matchId = 'm_' + crypto.randomBytes(8).toString('hex');
        qInsMatch.run(matchId, uid, game, now());
        return { ok: true, matchId, game };
      }

      if (t === 'result') {
        const m = qGetMatch.get(String(msg.matchId || ''));
        if (!m || m.user_id !== uid) return { ok: false, error: 'rejected', reason: 'invalid_match' };
        if (m.finished_at != null || m.rewarded) return { ok: false, error: 'rejected', reason: 'already_reported' };

        const elapsedSec = (now() - Number(m.started_at)) / 1000;
        const minSec = fastMode ? 0 : (MIN_MATCH_SECONDS[m.game] ?? 15);
        if (elapsedSec < minSec) {
          return { ok: false, error: 'rejected', reason: 'too_fast' };
        }

        const dayStart = Date.UTC(new Date(now()).getUTCFullYear(), new Date(now()).getUTCMonth(), new Date(now()).getUTCDate());
        const countToday = Number(qDailyCount.get(uid, dayStart).n);
        if (countToday >= DAILY_REWARDED_MATCH_CAP) {
          return { ok: false, error: 'rejected', reason: 'daily_cap' };
        }

        const won = !!msg.won;
        return inTx(db, () => {
          const curProf = accounts.getProfile(uid);
          const ceremony = applyResult(curProf, { game: m.game, won, opponentRating: msg.opponentRating }, today);
          if (!ceremony) return { ok: false, error: 'bad_game' };

          qFinMatch.run(now(), won ? 1 : 0, 1, m.id);
          if (ceremony.reward.coins > 0) {
            ledger.mint(uid, 'COIN', ceremony.reward.coins, 'match_reward', `result:${m.id}:COIN`, m.game);
          }
          if (ceremony.reward.tickets > 0) {
            ledger.mint(uid, 'TICKET', ceremony.reward.tickets, 'match_reward', `result:${m.id}:TICKET`, m.game);
          }
          const savedProfile = accounts.saveProfile(uid, { ...ceremony.profile, inventory: curProf.inventory });
          const wallet = getWallet(uid);
          pushState(session, uid, true);
          const { profile: _omit, ...ceremonyRest } = ceremony;
          return { ok: true, ceremony: ceremonyRest, wallet, profile: savedProfile };
        });
      }

      if (t === 'trackEvent') {
        const evType = String(msg.eventType || '');
        if (!['chat', 'emote'].includes(evType)) return { ok: false, error: 'bad_event' };
        const curProf = accounts.getProfile(uid);
        const tracked = trackEvent(curProf, { type: evType }, today);
        const saved = accounts.saveProfile(uid, { ...tracked.profile, inventory: curProf.inventory });
        if (tracked.completed.length) pushState(session, uid, true);
        return { ok: true, completed: tracked.completed, profile: saved };
      }

      if (t === 'claimQuest') {
        const qid = String(msg.id || '');
        return inTx(db, () => {
          const curProf = accounts.getProfile(uid);
          const res = claimQuest(refreshQuests(curProf, today), qid);
          if (!res.reward) return { ok: false, error: 'not_claimable' };
          if (res.reward.coins > 0) {
            ledger.mint(uid, 'COIN', res.reward.coins, 'quest_reward', `quest:${uid}:${today}:${qid}:COIN`, qid);
          }
          if (res.reward.tickets > 0) {
            ledger.mint(uid, 'TICKET', res.reward.tickets, 'quest_reward', `quest:${uid}:${today}:${qid}:TICKET`, qid);
          }
          const saved = accounts.saveProfile(uid, { ...res.profile, inventory: curProf.inventory });
          const wallet = getWallet(uid);
          pushState(session, uid, true);
          return { ok: true, reward: res.reward, wallet, profile: saved };
        });
      }

      if (t === 'spend') {
        const what = String(msg.what || '');
        const spec = SPEND_PRICES[what];
        if (!spec) return { ok: false, error: 'unknown_spend' };
        ledger.burn(uid, spec.currency, spec.amount, `spend_${what}`, msg.idemKey || null, what);
        if (what === 'claw') session.clawCredits = (session.clawCredits || 0) + 1;
        const wallet = getWallet(uid);
        pushState(session, uid, false);
        return { ok: true, what, wallet };
      }

      if (t === 'clawPrize') {
        if (!session.clawCredits || session.clawCredits < 1) {
          return { ok: false, error: 'no_claw_credit' };
        }
        session.clawCredits -= 1;
        const tickets = Math.max(25, Math.min(100, Math.floor(Number(msg.tickets) || 25)));
        ledger.mint(uid, 'TICKET', tickets, 'claw_prize', `claw:${uid}:${crypto.randomUUID()}`);
        const wallet = getWallet(uid);
        pushState(session, uid, false);
        return { ok: true, tickets, wallet };
      }

      if (t === 'buy') {
        const item = SHOP_BY_ID[String(msg.item || '')];
        if (!item) return { ok: false, error: 'unknown_item' };
        return inTx(db, () => {
          const curProf = accounts.getProfile(uid);
          if (!item.consumable && curProf.inventory.includes(item.name)) {
            return { ok: false, error: 'already_owned' };
          }
          ledger.burn(uid, item.currency, item.cost, 'shop_buy', null, item.id);
          if (item.grantCoins) {
            ledger.mint(uid, 'COIN', item.grantCoins, 'shop_exchange', null, item.id);
          }
          if (!item.consumable) {
            curProf.inventory.push(item.name);
          }
          const saved = accounts.saveProfile(uid, curProf);
          const wallet = getWallet(uid);
          pushState(session, uid, true);
          return { ok: true, item: item.id, wallet, profile: saved };
        });
      }

      if (t === 'dailyTokens') {
        const bal = ledger.balance(userAccount(uid, 'COIN'));
        if (bal >= 10) return { ok: false, error: 'balance_sufficient' };
        const idem = `daily:${uid}:${today}`;
        if (ledger.txExists(idem)) return { ok: false, error: 'already_claimed_today' };
        ledger.mint(uid, 'COIN', DAILY_FREE_TOKENS, 'daily_tokens', idem);
        const wallet = getWallet(uid);
        pushState(session, uid, false);
        return { ok: true, granted: DAILY_FREE_TOKENS, wallet };
      }

      if (t === 'contest.create') {
        const cur = String(msg.currency || 'COIN');
        if (isRealCurrency(cur)) return { ok: false, error: 'real_money_disabled' };
        const c = contests.createContest({
          game: msg.game,
          currency: cur,
          entryFee: Number(msg.entryFee),
          maxPlayers: Number(msg.maxPlayers),
          rakeBps: Number(msg.rakeBps ?? 1000),
          meta: msg.meta || {}
        });
        return { ok: true, contest: c };
      }

      if (t === 'contest.join') {
        const res = contests.joinContest(String(msg.contestId || ''), uid);
        const wallet = getWallet(uid);
        pushState(session, uid, false);
        if (opts.onContestLocked && res.contest && res.contest.status === 'locked' && !res.already) {
          try { opts.onContestLocked(res.contest); } catch (_) {}
        }
        return { ok: true, ...res, wallet };
      }

      if (t === 'contest.leave') {
        const res = contests.leaveContest(String(msg.contestId || ''), uid);
        const wallet = getWallet(uid);
        pushState(session, uid, false);
        return { ok: true, ...res, wallet };
      }

      if (t === 'contest.list') {
        return { ok: true, contests: contests.listContests(msg.limit) };
      }

      return { ok: false, error: 'unknown_command' };
    } catch (e) {
      if (e instanceof LedgerError) {
        return { ok: false, error: e.code, message: e.message };
      }
      return { ok: false, error: 'internal_error', message: e.message };
    }
  }

  return { db, ledger, accounts, contests, handle, getWallet };
}
