// Progression rules shared by the client (offline fallback) and the server (authoritative).
// PURE: no DOM, no Three.js, no storage. Deterministic given inputs. Unit-tested.
//
// Profile shape (plain JSON, safe to persist):
// {
//   xp: number,
//   stats:   { [game]: { played, won, streak, bestStreak } },
//   rating:  { [game]: number }            // Elo-style, starts at 1200
//   quests:  { day: 'YYYY-MM-DD', list: [{ id, progress, goal, done, claimed }] },
//   trophies: [{ id, name, tier, at }]
// }

export const GAME_INFO = {
  pool:    { name: 'Neon Billiards', short: 'Pool',    skill: true,  icon: 'pool' },
  ludo:    { name: 'Ludo',           short: 'Ludo',    skill: false, icon: 'dice' },
  proto89: { name: 'PROTO-89',       short: 'Proto89', skill: true,  icon: 'glitch' },
  claw:    { name: 'Cyber Claw',     short: 'Claw',    skill: true,  icon: 'claw' },
  netrun:  { name: 'NetRunner',      short: 'NetRun',  skill: true,  icon: 'chip' }
};

// Rewards are decided HERE (never by the game page) so a game iframe cannot mint currency.
export const REWARDS = {
  pool:    { win: { coins: 25, tickets: 40, xp: 120 }, loss: { coins: 5, tickets: 10, xp: 40 } },
  ludo:    { win: { coins: 20, tickets: 30, xp: 100 }, loss: { coins: 5, tickets: 8,  xp: 35 } },
  proto89: { win: { coins: 30, tickets: 50, xp: 150 }, loss: { coins: 0, tickets: 5,  xp: 20 } },
  claw:    { win: { coins: 0,  tickets: 0,  xp: 30 },  loss: { coins: 0, tickets: 0,  xp: 10 } },
  netrun:  { win: { coins: 40, tickets: 15, xp: 60 },  loss: { coins: 0, tickets: 0,  xp: 10 } }
};
const STREAK_BONUS_XP = 15;     // per consecutive win beyond the first, capped
const STREAK_BONUS_CAP = 5;

export function rewardFor(game, won, streakBefore = 0) {
  const table = REWARDS[game];
  if (!table) return { coins: 0, tickets: 0, xp: 0 };
  const r = { ...(won ? table.win : table.loss) };
  if (won) r.xp += STREAK_BONUS_XP * Math.min(STREAK_BONUS_CAP, Math.max(0, streakBefore));
  return r;
}

// ---------- levels ----------
// Total XP needed to REACH level n (level 1 = 0 xp). Smooth curve: 100 * (n-1)^1.5, rounded to 10.
export function xpForLevel(n) {
  if (n <= 1) return 0;
  return Math.round((100 * Math.pow(n - 1, 1.5)) / 10) * 10;
}
export const MAX_LEVEL = 99;
export function levelFromXp(xp) {
  xp = Math.max(0, Math.floor(xp || 0));
  let lv = 1;
  while (lv < MAX_LEVEL && xp >= xpForLevel(lv + 1)) lv++;
  const base = xpForLevel(lv), next = lv >= MAX_LEVEL ? base : xpForLevel(lv + 1);
  const need = next - base, into = xp - base;
  return { level: lv, into, need, progress: need > 0 ? into / need : 1 };
}

// ---------- card frame tiers (status, earned not bought) ----------
export const CARD_TIERS = [
  { id: 'bronze', name: 'Bronze', minLevel: 1,  colors: ['#b0703c', '#f0b27a'] },
  { id: 'silver', name: 'Silver', minLevel: 5,  colors: ['#8d97ad', '#e6ecf7'] },
  { id: 'gold',   name: 'Gold',   minLevel: 12, colors: ['#c98a1c', '#ffd77a'] },
  { id: 'neon',   name: 'Neon',   minLevel: 25, colors: ['#ff4d9a', '#35e0ff'] },
  { id: 'void',   name: 'Void',   minLevel: 45, colors: ['#2a0b4a', '#a37bff'] }
];
export function cardTier(level) {
  let t = CARD_TIERS[0];
  for (const c of CARD_TIERS) if (level >= c.minLevel) t = c;
  return t;
}

// ---------- rating (Elo) ----------
export const BASE_RATING = 1200;
export function eloUpdate(ra, rb, scoreA, k = 24) {
  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const delta = Math.round(k * (scoreA - ea));
  return { a: ra + delta, b: rb - delta, delta };
}
export const RANKS = [
  { id: 'rookie',  name: 'Rookie',  min: 0 },
  { id: 'bronze',  name: 'Bronze',  min: 1100 },
  { id: 'silver',  name: 'Silver',  min: 1250 },
  { id: 'gold',    name: 'Gold',    min: 1400 },
  { id: 'diamond', name: 'Diamond', min: 1600 },
  { id: 'legend',  name: 'Legend',  min: 1850 }
];
export function rankFor(rating) {
  let r = RANKS[0];
  for (const x of RANKS) if (rating >= x.min) r = x;
  return r;
}
// Fixed "house" opponents give CPU games a rating so offline play still moves your rank a little.
export const CPU_RATING = { pool: 1250, ludo: 1200, proto89: 1300 };

// ---------- daily quests ----------
export const QUEST_DEFS = [
  { id: 'win_pool_2',  text: 'Win 2 games of Pool',        goal: 2, match: e => e.type === 'result' && e.game === 'pool' && e.won,  reward: { tickets: 40, xp: 80 } },
  { id: 'play_pool_3', text: 'Play 3 games of Pool',       goal: 3, match: e => e.type === 'result' && e.game === 'pool',            reward: { tickets: 25, xp: 60 } },
  { id: 'win_ludo_1',  text: 'Win a game of Ludo',         goal: 1, match: e => e.type === 'result' && e.game === 'ludo' && e.won,  reward: { tickets: 30, xp: 70 } },
  { id: 'play_any_4',  text: 'Play 4 arcade games',        goal: 4, match: e => e.type === 'result',                                 reward: { tickets: 35, xp: 70 } },
  { id: 'win_any_3',   text: 'Win 3 games of anything',    goal: 3, match: e => e.type === 'result' && e.won,                       reward: { tickets: 50, xp: 100 } },
  { id: 'claw_2',      text: 'Play the Claw Machine twice', goal: 2, match: e => e.type === 'result' && e.game === 'claw',           reward: { tickets: 20, xp: 40 } },
  { id: 'say_5',       text: 'Send 5 chat messages',       goal: 5, match: e => e.type === 'chat',                                   reward: { tickets: 15, xp: 30 } },
  { id: 'emote_3',     text: 'Hype the room with 3 emotes', goal: 3, match: e => e.type === 'emote',                                 reward: { tickets: 15, xp: 30 } },
  { id: 'proto_1',     text: 'Boot the PROTO-89 cabinet',  goal: 1, match: e => e.type === 'result' && e.game === 'proto89',         reward: { tickets: 30, xp: 60 } },
  { id: 'streak_2',    text: 'Win 2 in a row',             goal: 1, match: (e, p) => e.type === 'result' && e.won && streakOf(p) >= 2, reward: { tickets: 45, xp: 90 } }
];
const QUEST_BY_ID = Object.fromEntries(QUEST_DEFS.map(q => [q.id, q]));
export const questDef = id => QUEST_BY_ID[id];
export const DAILY_QUEST_COUNT = 3;

function streakOf(p) {
  let best = 0;
  for (const s of Object.values(p.stats || {})) best = Math.max(best, s.streak || 0);
  return best;
}
// Tiny deterministic hash so every player gets the same quests on the same day (shared goals = chat fodder).
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export function dailyQuests(day) {
  const pool = QUEST_DEFS.map(q => q.id);
  let h = hashStr('twilight:' + day);
  const out = [];
  while (out.length < DAILY_QUEST_COUNT && pool.length) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const id = pool.splice(h % pool.length, 1)[0];
    out.push({ id, progress: 0, goal: QUEST_BY_ID[id].goal, done: false, claimed: false });
  }
  return out;
}

// ---------- profile ----------
export function newProfile() {
  return { xp: 0, stats: {}, rating: {}, quests: { day: '', list: [] }, trophies: [] };
}
export function normalizeProfile(p) {
  const n = newProfile();
  if (!p || typeof p !== 'object') return n;
  n.xp = Math.max(0, Math.floor(+p.xp || 0));
  for (const [g, s] of Object.entries(p.stats || {})) {
    if (!GAME_INFO[g] || !s) continue;
    n.stats[g] = { played: s.played | 0, won: s.won | 0, streak: s.streak | 0, bestStreak: s.bestStreak | 0 };
  }
  for (const [g, r] of Object.entries(p.rating || {})) if (GAME_INFO[g] && Number.isFinite(+r)) n.rating[g] = Math.round(+r);
  if (p.quests && typeof p.quests.day === 'string' && Array.isArray(p.quests.list)) {
    n.quests.day = p.quests.day;
    n.quests.list = p.quests.list.filter(q => q && QUEST_BY_ID[q.id]).map(q => ({
      id: q.id, goal: QUEST_BY_ID[q.id].goal, progress: Math.min(QUEST_BY_ID[q.id].goal, q.progress | 0), done: !!q.done, claimed: !!q.claimed
    }));
  }
  if (Array.isArray(p.trophies)) n.trophies = p.trophies.slice(0, 50).filter(t => t && t.id);
  return n;
}
const clone = p => JSON.parse(JSON.stringify(p));

// Make sure today's quests exist. Returns a new profile.
export function refreshQuests(profile, day = dayKey()) {
  const p = clone(profile);
  if (p.quests.day !== day) p.quests = { day, list: dailyQuests(day) };
  return p;
}

// Advance quests for a social/game event. Returns { profile, completed: [questIds] } (rewards are paid on claim).
export function trackEvent(profile, event, day = dayKey()) {
  const p = refreshQuests(profile, day);
  const completed = [];
  for (const q of p.quests.list) {
    if (q.done) continue;
    const def = QUEST_BY_ID[q.id];
    if (def.match(event, p)) {
      q.progress = Math.min(q.goal, q.progress + 1);
      if (q.progress >= q.goal) { q.done = true; completed.push(q.id); }
    }
  }
  return { profile: p, completed };
}

// Claim a finished quest. Returns { profile, reward } or { profile, reward: null } if not claimable.
export function claimQuest(profile, questId) {
  const p = clone(profile);
  const q = p.quests.list.find(x => x.id === questId);
  if (!q || !q.done || q.claimed) return { profile: p, reward: null };
  q.claimed = true;
  const reward = { coins: 0, tickets: 0, xp: 0, ...QUEST_BY_ID[questId].reward };
  p.xp += reward.xp;
  return { profile: p, reward };
}

// Apply a finished game. Returns everything the UI needs for the result ceremony.
// result: { game, won, opponentRating? }
export function applyResult(profile, result, day = dayKey()) {
  const game = result.game;
  if (!GAME_INFO[game]) return null;
  const won = !!result.won;
  let p = clone(profile);
  const s = p.stats[game] || (p.stats[game] = { played: 0, won: 0, streak: 0, bestStreak: 0 });
  const streakBefore = s.streak;
  const reward = rewardFor(game, won, streakBefore);
  const before = levelFromXp(p.xp);

  s.played++;
  if (won) { s.won++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); } else s.streak = 0;

  let ratingDelta = 0;
  const oppRating = result.opponentRating ?? CPU_RATING[game];
  if (oppRating != null) {
    const ra = p.rating[game] ?? BASE_RATING;
    const k = result.opponentRating != null ? 24 : 8;     // CPU games move rank gently
    const u = eloUpdate(ra, oppRating, won ? 1 : 0, k);
    p.rating[game] = u.a; ratingDelta = u.delta;
  }

  p.xp += reward.xp;
  const tracked = trackEvent(p, { type: 'result', game, won }, day);
  p = tracked.profile;
  const after = levelFromXp(p.xp);

  return {
    profile: p,
    reward,
    won,
    game,
    streak: s.streak,
    rating: p.rating[game] ?? null,
    ratingDelta,
    levelBefore: before,
    levelAfter: after,
    leveledUp: after.level > before.level,
    questsCompleted: tracked.completed
  };
}

export function winRate(stats) {
  return stats && stats.played ? Math.round((100 * stats.won) / stats.played) : 0;
}
export function totals(profile) {
  let played = 0, won = 0, bestStreak = 0;
  for (const s of Object.values(profile.stats || {})) { played += s.played; won += s.won; bestStreak = Math.max(bestStreak, s.bestStreak); }
  return { played, won, bestStreak, winRate: played ? Math.round((100 * won) / played) : 0 };
}
