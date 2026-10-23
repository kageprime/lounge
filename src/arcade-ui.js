// Arcade UI components: Player Card, VS splash, Result ceremony, confetti, level chip.
// DOM-only presentation helpers. They never touch the world; main.js (the controller) feeds them data + callbacks.
import { portrait } from './portrait.js';
import { GAME_INFO, cardTier, rankFor, levelFromXp, winRate, totals, BASE_RATING } from './progression.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  pool: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8v6.4"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".6" fill="currentColor"/><circle cx="15" cy="15" r=".6" fill="currentColor"/><circle cx="15" cy="9" r=".6" fill="currentColor"/><circle cx="9" cy="15" r=".6" fill="currentColor"/>'),
  glitch: svg('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M7 21h10M9 9h2M13 12h4M7 13h3"/>'),
  claw: svg('<path d="M12 3v7M8 14l4-4 4 4M8 14l-1 4M16 14l1 4"/><circle cx="12" cy="20" r="1.5"/>'),
  chip: svg('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>'),
  flame: svg('<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>'),
  star: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  bolt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  play: svg('<path d="M7 4l13 8-13 8z"/>'),
  quest: svg('<path d="M9 11l2 2 4-4"/><rect x="4" y="4" width="16" height="16" rx="3"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  events: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  gamepad: svg('<path d="M6 9h4M8 7v4M15 9h.01M18 11h.01"/><path d="M7 5h10a5 5 0 0 1 5 5v3a4 4 0 0 1-7 2.6L14 15h-4l-1 .6A4 4 0 0 1 2 13v-3a5 5 0 0 1 5-5z"/>'),
  coin: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>'),
  ticket: svg('<path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3z" transform="translate(0 2)"/><path d="M14 6v12" stroke-dasharray="2 2"/>'),
  arrowUp: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrowDown: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>')
};
export const gameIcon = g => ICON[(GAME_INFO[g] || {}).icon] || ICON.gamepad;

export const RANK_COLORS = { rookie: '#9aa0c0', bronze: '#d08a4e', silver: '#cfd6e6', gold: '#ffb84a', diamond: '#54e0ee', legend: '#ff4d9a' };
export function rankEmblem(rank, size = 34) {
  const c = RANK_COLORS[rank.id] || '#9aa0c0';
  return `<svg class="rankEmblem" width="${size}" height="${size}" viewBox="0 0 40 40" aria-label="${esc(rank.name)} rank">
    <defs><linearGradient id="rg-${rank.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".35"/></linearGradient></defs>
    <path d="M20 2l15 8.7v18.6L20 38 5 29.3V10.7z" fill="url(#rg-${rank.id})" stroke="${c}" stroke-width="1.5"/>
    <path d="M20 10l3 6.2 6.8 1-4.9 4.7 1.2 6.7L20 25.4l-6.1 3.2 1.2-6.7-4.9-4.7 6.8-1z" fill="#0c0a16" fill-opacity=".55"/>
  </svg>`;
}

// ---------- data shaping ----------
// Builds the view-model for a card from a progression profile.
export function cardModel({ name, loadout, profile, tag = 'PLAYER', crew = null }) {
  const lv = levelFromXp(profile.xp);
  const tier = cardTier(lv.level);
  let bestGame = null, bestRating = BASE_RATING;
  for (const [g, r] of Object.entries(profile.rating || {})) if (r >= bestRating || !bestGame) { bestRating = r; bestGame = g; }
  const rank = rankFor(bestRating);
  const t = totals(profile);
  const games = ['pool', 'ludo', 'proto89'].map(g => {
    const s = profile.stats?.[g] || { played: 0, won: 0 };
    return { game: g, name: GAME_INFO[g].short, played: s.played, won: s.won, wr: winRate(s), rating: profile.rating?.[g] ?? null };
  });
  return { name, loadout, tag, crew, level: lv.level, progress: lv.progress, into: lv.into, need: lv.need, tier, rank, rating: bestRating, bestGame, totals: t, games, trophies: profile.trophies || [] };
}

// Deterministic pseudo-profile for NPC regulars so clicking a bot still feels alive (clearly labelled NPC).
export function npcProfile(id) {
  let h = 2166136261; for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => ((h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0) / 4294967296);
  const xp = Math.floor(200 + rnd() * 9000);
  const mk = () => { const played = Math.floor(5 + rnd() * 120); return { played, won: Math.floor(played * (0.25 + rnd() * 0.5)), streak: Math.floor(rnd() * 3), bestStreak: Math.floor(1 + rnd() * 9) }; };
  return { xp, stats: { pool: mk(), ludo: mk(), proto89: { played: Math.floor(rnd() * 6), won: 0, streak: 0, bestStreak: 0 } }, rating: { pool: Math.floor(1050 + rnd() * 700), ludo: Math.floor(1100 + rnd() * 400) }, trophies: [] };
}

// ---------- Player Card ----------
export function cardHTML(m, { compact = false } = {}) {
  const [c1, c2] = m.tier.colors;
  const img = portrait(m.loadout, 'bust');
  const rc = RANK_COLORS[m.rank.id];
  const trophySlots = [0, 1, 2].map(i => {
    const t = m.trophies[i];
    return `<div class="pcTrophy ${t ? 'has' : ''}" title="${t ? esc(t.name) : 'Empty trophy slot · win an event'}">${ICON.trophy}</div>`;
  }).join('');
  const rows = m.games.map(g => `<div class="pcRow"><span class="pcRowIcon">${gameIcon(g.game)}</span><span class="pcRowName">${esc(g.name)}</span><span class="pcRowVal">${g.won}<i>/${g.played}</i></span><span class="pcRowWr" style="--wr:${g.wr}%">${g.played ? g.wr + '%' : '—'}</span></div>`).join('');
  return `<div class="pCard tier-${m.tier.id} ${compact ? 'compact' : ''}" style="--c1:${c1};--c2:${c2};--rc:${rc}">
    <div class="pCardInner">
      <div class="pcFoil"></div><div class="pcShine"></div>
      <div class="pcTop">
        <div class="pcLevel"><b>${m.level}</b><span>LVL</span></div>
        <div class="pcTag">${esc(m.tag)}</div>
        <div class="pcRank">${rankEmblem(m.rank)}<span>${esc(m.rank.name)}</span></div>
      </div>
      <div class="pcPortrait">${img ? `<img src="${img}" alt="">` : `<div class="pcNoImg">${ICON.user}</div>`}</div>
      <div class="pcName">${esc(m.name)}${m.crew ? `<small>[${esc(m.crew)}]</small>` : ''}</div>
      <div class="pcTierLine"><span>${esc(m.tier.name)} Card</span><span>${m.rating} SR</span></div>
      <div class="pcXp"><div style="width:${Math.round(m.progress * 100)}%"></div></div>
      ${compact ? '' : `<div class="pcStats">
        <div><b>${m.totals.won}</b><span>Wins</span></div>
        <div><b>${m.totals.winRate}%</b><span>Win rate</span></div>
        <div><b>${m.totals.bestStreak}</b><span>Best streak</span></div>
      </div>
      <div class="pcRows">${rows}</div>
      <div class="pcTrophies">${trophySlots}</div>`}
    </div>
  </div>`;
}

// Pointer-driven 3D tilt + foil shimmer. Returns a disposer.
export function tiltCard(el) {
  const card = el.querySelector('.pCard'); if (!card) return () => {};
  const inner = card.querySelector('.pCardInner');
  const move = e => {
    const r = card.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) - 0.5, y = ((e.clientY - r.top) / r.height) - 0.5;
    inner.style.transform = `rotateY(${x * 22}deg) rotateX(${-y * 18}deg)`;
    card.style.setProperty('--mx', `${(x + 0.5) * 100}%`); card.style.setProperty('--my', `${(y + 0.5) * 100}%`);
  };
  const leave = () => { inner.style.transform = ''; };
  card.addEventListener('pointermove', move); card.addEventListener('pointerleave', leave);
  return () => { card.removeEventListener('pointermove', move); card.removeEventListener('pointerleave', leave); };
}

// ---------- Level chip in the HUD ----------
export function levelChipHTML(profile) {
  const lv = levelFromXp(profile.xp), tier = cardTier(lv.level);
  return `<span class="lvChip" style="--c1:${tier.colors[0]};--c2:${tier.colors[1]}"><b>${lv.level}</b><span class="lvBar"><i style="width:${Math.round(lv.progress * 100)}%"></i></span></span>`;
}

// ---------- VS splash ----------
export function showVersus(host, { left, right, gameName, game, subtitle = 'Ranked vs House', duration = 1900, sound }) {
  host.innerHTML = `<div class="vsWrap">
    <div class="vsBg"></div><div class="vsStreak"></div>
    <div class="vsSide vsLeft">${cardHTML(left, { compact: true })}</div>
    <div class="vsMid"><div class="vsIcon">${gameIcon(game)}</div><div class="vsText">VS</div><div class="vsGame">${esc(gameName)}</div><div class="vsSub">${esc(subtitle)}</div></div>
    <div class="vsSide vsRight">${cardHTML(right, { compact: true })}</div>
  </div>`;
  host.classList.remove('hidden'); void host.offsetWidth; host.classList.add('in');
  if (sound && sound.versus) sound.versus();
  return new Promise(res => setTimeout(() => {
    host.classList.add('out');
    setTimeout(() => { host.classList.remove('in', 'out'); host.classList.add('hidden'); host.innerHTML = ''; res(); }, 380);
  }, duration));
}

// ---------- confetti ----------
export function confetti(host, { count = 140, colors = ['#ffb84a', '#ff4d9a', '#35e0ff', '#5fe08a', '#a37bff'] } = {}) {
  const cv = document.createElement('canvas'); cv.className = 'confetti'; host.appendChild(cv);
  const dpr = Math.min(2, devicePixelRatio || 1), W = host.clientWidth, H = host.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const ps = Array.from({ length: count }, () => ({ x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.42, vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 12, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, c: colors[(Math.random() * colors.length) | 0] }));
  let t0 = performance.now(), raf = 0;
  const step = now => {
    const t = (now - t0) / 1000; g.clearRect(0, 0, W, H);
    for (const p of ps) { p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.max(0, 1 - t / 3.2); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); }
    if (t < 3.3) raf = requestAnimationFrame(step); else cv.remove();
  };
  raf = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(raf); cv.remove(); };
}

// ---------- Result ceremony ----------
// c = ceremony object from progression.applyResult (or the server's identical shape)
export function showResult(host, c, { onRematch, onClose, sound, unranked = false, questName = id => id } = {}) {
  const won = c.won, g = GAME_INFO[c.game] || { name: c.game };
  const lvA = c.levelBefore, lvB = c.levelAfter;
  const ratingLine = c.ratingDelta ? `<span class="${c.ratingDelta > 0 ? 'up' : 'down'}">${c.ratingDelta > 0 ? ICON.arrowUp : ICON.arrowDown}${c.ratingDelta > 0 ? '+' : ''}${c.ratingDelta} SR</span>` : '';
  host.innerHTML = `<div class="resWrap ${won ? 'win' : 'loss'}">
    <div class="resCard">
      <div class="resGlow"></div>
      <div class="resKicker">${gameIcon(c.game)}<span>${esc(g.name)}${unranked ? ' · Unranked' : ''}</span></div>
      <div class="resTitle">${won ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="resMeta">${c.streak > 1 ? `<span class="streak">${ICON.flame}${c.streak} win streak</span>` : ''}${ratingLine}</div>
      ${unranked ? `<p class="resNote">Practice and hot-seat games don't award rewards. Play VS CPU to rank up.</p>` : `
      <div class="resRewards">
        <div class="resReward coin">${ICON.coin}<b data-to="${c.reward.coins}">0</b><span>Coins</span></div>
        <div class="resReward ticket">${ICON.ticket}<b data-to="${c.reward.tickets}">0</b><span>Tickets</span></div>
        <div class="resReward xp">${ICON.star}<b data-to="${c.reward.xp}">0</b><span>XP</span></div>
      </div>
      <div class="resLevel">
        <div class="resLvNum"><span>LVL</span><b id="resLv">${lvA.level}</b></div>
        <div class="resLvBar"><i id="resLvFill" style="width:${Math.round(lvA.progress * 100)}%"></i></div>
        <div class="resLvUp hidden" id="resLvUp">LEVEL UP!</div>
      </div>
      ${c.questsCompleted?.length ? `<div class="resQuests">${c.questsCompleted.map(q => `<div class="resQuest">${ICON.quest}<span>Quest complete: ${esc(questName(q))}</span><em>Claim in Arcade</em></div>`).join('')}</div>` : ''}`}
      <div class="resActions">
        <button class="resBtn ghost" data-act="close">Back to lounge</button>
        <button class="resBtn gold" data-act="rematch">${ICON.play}<span>Play again</span></button>
      </div>
    </div>
  </div>`;
  host.classList.remove('hidden'); void host.offsetWidth; host.classList.add('in');
  let stopConfetti = null;
  if (won) { stopConfetti = confetti(host); sound && sound.win && sound.win(); } else { sound && sound.deny && sound.deny(); }

  // Count-up rewards, then fill the XP bar (wrapping if levelled up).
  const nums = [...host.querySelectorAll('.resReward b')];
  const t0 = performance.now(), dur = 900;
  let tickT = 0;
  const count = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    nums.forEach(n => n.textContent = Math.round(+n.dataset.to * e));
    if (sound && sound.tick && now - tickT > 70 && k < 1) { tickT = now; sound.tick(); }
    if (k < 1) requestAnimationFrame(count); else fillXp();
  };
  const fill = host.querySelector('#resLvFill'), lvEl = host.querySelector('#resLv');
  const fillXp = () => {
    if (!fill) return;
    if (c.leveledUp) {
      fill.style.width = '100%';
      setTimeout(() => {
        fill.style.transition = 'none'; fill.style.width = '0%'; void fill.offsetWidth; fill.style.transition = '';
        lvEl.textContent = lvB.level; lvEl.parentElement.classList.add('pop');
        host.querySelector('#resLvUp')?.classList.remove('hidden');
        sound && sound.levelUp && sound.levelUp();
        setTimeout(() => { fill.style.width = Math.round(lvB.progress * 100) + '%'; }, 60);
      }, 650);
    } else fill.style.width = Math.round(lvB.progress * 100) + '%';
  };
  if (!unranked) requestAnimationFrame(count);

  const close = () => { if (stopConfetti) stopConfetti(); host.classList.remove('in'); setTimeout(() => { host.classList.add('hidden'); host.innerHTML = ''; }, 300); };
  host.querySelector('[data-act="close"]').onclick = () => { close(); onClose && onClose(); };
  host.querySelector('[data-act="rematch"]').onclick = () => { close(); onRematch && onRematch(); };
  return close;
}
