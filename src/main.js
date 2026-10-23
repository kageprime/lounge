// Controller: the only module that touches input, DOM and the world together.
// Humans, bots and (later) network peers all act through world.command().
import { World } from './sim.js';
import { LOUNGE, LOFT } from './layout.js';
import { spawnBots, spawnCitizenBots } from './bots.js';
import { Stage } from './stage.js';
import { Sound, TRACKS } from './audio.js';
import { OPTIONS, EMOTES, randomLoadout, sanitize } from './avatar-data.js';
import { status as assets } from './assets.js';
import { ClawGame, PRIZES } from './claw.js';
import { NetClient } from './net.js';
import { generateDistrict } from './procgen.js';
import { LifeSim, GIGS } from './lifesim.js';
import { generateCitizens, getRelationshipTier, getDialogue } from './proc-npcs.js';
import { YouTubeRadio, MIAMI_PLAYLIST } from './yt-radio.js';
import { MoonBaseStage } from './moonbase.js';

const GAMES = {
  ludo: { title: 'Ludo · Club No.9 Edition', url: 'games/ludo/index.html' },
  proto89: { title: 'PROTO-89 · Glitched Cabinet', url: 'games/proto89/index.html' },
  pool: { title: 'Neon Billiards · Club No.9 Edition', url: 'games/pool/index.html' }
};
const $ = id => document.getElementById(id), q = new URLSearchParams(location.search);
const KEY = 'lounge.profile.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const save = p => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode */ } };
const ARCADE_LAYOUT_KEY = 'lounge.layout.arcade.v1';
const LOFT_LAYOUT_KEY = 'lounge.layout.loft.v1';
const LEGACY_LAYOUT_KEY = 'lounge.layout.custom.v1';

let currentRoom = (q.get('room') === 'loft' || q.get('stage') === 'loft') ? 'loft' : 'arcade';

const loadRoomLayout = (room = currentRoom) => {
  if (room === 'loft') {
    try {
      const raw = localStorage.getItem(LOFT_LAYOUT_KEY);
      if (raw) {
        const props = JSON.parse(raw);
        if (Array.isArray(props) && props.length > 0) return { ...LOFT, props };
      }
    } catch (e) { /* fallback */ }
    return LOFT;
  }
  // Arcade
  try {
    const raw = localStorage.getItem(ARCADE_LAYOUT_KEY) || localStorage.getItem(LEGACY_LAYOUT_KEY);
    if (raw) {
      const props = JSON.parse(raw);
      if (Array.isArray(props) && props.length > 0) {
        props.forEach(p => {
          if (p.type === 'pool' && !p.game) p.game = 'pool';
          if (p.type === 'ludotable' && !p.game) p.game = 'ludo';
        });
        return { ...LOUNGE, props };
      }
    }
  } catch (e) { /* fallback */ }
  return LOUNGE;
};

const saveRoomLayout = (room, props) => {
  try {
    const key = (room === 'loft') ? LOFT_LAYOUT_KEY : ARCADE_LAYOUT_KEY;
    localStorage.setItem(key, JSON.stringify(props));
    if (room === 'arcade') localStorage.setItem(LEGACY_LAYOUT_KEY, JSON.stringify(props));
  } catch (e) { /* private */ }
};

const saveCurrentLayout = () => {
  saveRoomLayout(currentRoom, world.layout.props);
};

// Aliases for legacy compatibility
const loadLayout = () => loadRoomLayout(currentRoom);
const saveLayout = props => saveRoomLayout(currentRoom, props);

const prof = load();
prof.coins = prof.coins ?? 100;
prof.tickets = prof.tickets ?? 0;
prof.inventory = prof.inventory ?? [];
function updateWalletUI() {
  const cEl = $('coinVal'), tEl = $('ticketVal');
  if (cEl) cEl.textContent = prof.coins;
  if (tEl) tEl.textContent = prof.tickets;
}
updateWalletUI();

let activeLayout = loadRoomLayout(currentRoom);
let world = new World(activeLayout);
const lifeSim = new LifeSim();
let me = world.command({
  t: 'join',
  person: {
    id: 'me',
    human: true,
    name: prof.name || 'You',
    loadout: prof.loadout || randomLoadout(),
    x: (activeLayout.spawn ? activeLayout.spawn.x : activeLayout.w / 2) + 0.5,
    y: (activeLayout.spawn ? activeLayout.spawn.y : activeLayout.h / 2) + 0.5
  }
});

let citizens = [];
function initRoomBots(w, room) {
  if (room === 'loft') {
    spawnBots(w, 1, 42);
  } else {
    spawnBots(w, q.has('bots') ? +q.get('bots') : 6, +q.get('seed') || 7);
  }
}
initRoomBots(world, currentRoom);

const QKEY = 'lounge.quality', qParam = q.get('q');
let quality = qParam || (() => { try { return localStorage.getItem(QKEY); } catch (e) { return null; } })() || 'high';
const stage = new Stage($('stage'), $('tags'), world, quality); const sound = new Sound();

// ---------- Miami Nights YouTube Radio Engine ----------
const radio = new YouTubeRadio({ containerId: 'ytPlayer' });
let ytInited = false;
let jukeOpen = false;
let renderJuke = () => {};

function initRadioOnGesture() {
  if (!ytInited) {
    ytInited = true;
    radio.init();
  }
}
const unlock = () => { sound.unlock(); initRadioOnGesture(); };
addEventListener('pointerdown', unlock, { once: true });
addEventListener('keydown', unlock, { once: true });

radio.on('ready', () => {
  const tr = radio.getCurrentTrack();
  if (tr && $('ytTrackTitle')) $('ytTrackTitle').textContent = `${tr.artist} - ${tr.title}`;
});

radio.on('track', ({ track }) => {
  if ($('ytTrackTitle')) $('ytTrackTitle').textContent = `${track.artist} - ${track.title}`;
  if ($('lofiTrackName')) $('lofiTrackName').textContent = `Track: ${track.title} [${track.artist}]`;
  const islandTxt = $('islandText');
  if (islandTxt) islandTxt.textContent = track.title.slice(0, 16).toUpperCase();
  if (jukeOpen) renderJuke();
  stage.music = true;
  toast(`📻 Miami Nights FM: ${track.artist} - ${track.title}`);
});

radio.on('state', ({ isPlaying }) => {
  const playBtn = $('bYtPlay');
  if (playBtn) playBtn.textContent = isPlaying ? '⏸' : '▶';
  const eq = $('ytEqBars');
  if (eq) eq.classList.toggle('playing', isPlaying);
  const island = $('phoneIsland');
  if (island) island.classList.toggle('playing', isPlaying);
  const islandEq = $('islandEq');
  if (islandEq) islandEq.classList.toggle('hidden', !isPlaying);
  const rBtn = $('bRadio');
  if (rBtn) rBtn.classList.toggle('playing', isPlaying);
  if (isPlaying) {
    sound.stop();
    if (typeof stopLofiBeats === 'function') stopLofiBeats();
    if ($('bLofiToggle')) {
      $('bLofiToggle').textContent = '⏹ Stop Miami Beats';
      $('bLofiToggle').classList.remove('gold');
    }
  } else {
    if ($('bLofiToggle')) {
      $('bLofiToggle').textContent = '▶ Play Miami Beats';
      $('bLofiToggle').classList.add('gold');
    }
  }
  if (jukeOpen) renderJuke();
});

radio.on('volume', ({ volume }) => {
  const slider = $('ytVolSlider');
  if (slider && +slider.value !== volume) slider.value = volume;
});
const net = new NetClient({
  onStatus: ({ online, reason }) => {
    if (online) {
      toast('✦ Multiplayer Connected');
      net.send({ t: 'join', person: { id: 'me', human: true, name: me.name, loadout: me.loadout } });
    } else if (reason) {
      toast('Offline mode · Playing with bots');
    }
  },
  onEvent: msg => {
    if (msg.type === 'event' && msg.event) {
      const ev = msg.event;
      if (ev.id !== 'me') {
        if (ev.type === 'join' && !world.people.has(ev.id)) {
          world.command({ t: 'join', person: { id: ev.id, name: ev.name || 'Guest', loadout: ev.loadout } });
        } else if (ev.type === 'leave') {
          world.command({ t: 'leave', id: ev.id });
        } else if (ev.type === 'move') {
          world.command({ t: 'move', id: ev.id, x: ev.x, y: ev.y });
        } else if (ev.type === 'use') {
          world.command({ t: 'use', id: ev.id, use: ev.use });
        } else if (ev.type === 'stand') {
          world.command({ t: 'stand', id: ev.id });
        } else if (ev.type === 'say') {
          world.command({ t: 'say', id: ev.id, text: ev.text });
        } else if (ev.type === 'emote') {
          world.command({ t: 'emote', id: ev.id, name: ev.name });
        } else if (ev.type === 'loadout') {
          world.command({ t: 'loadout', id: ev.id, loadout: ev.loadout });
        } else if (ev.type === 'propPlaced') {
          if (!world.props.has(ev.prop.id)) world.command({ t: 'placeProp', prop: ev.prop });
        } else if (ev.type === 'propMoved') {
          world.command({ t: 'moveProp', propId: ev.prop.id, x: ev.prop.x, y: ev.prop.y, r: ev.prop.r });
        } else if (ev.type === 'propRemoved') {
          if (world.props.has(ev.id)) world.command({ t: 'removeProp', propId: ev.id });
        } else if (ev.type === 'phaseChange') {
          world.command({ t: 'setPhase', phase: ev.phase });
        }
      }
    }
  }
});
net.connect();

const cmd = c => {
  if (net.connected) net.send(c);
  return world.command({ id: 'me', ...c });
};

// ---------- toast / tip ----------
let toastT = 0; const toast = (s) => { const e = $('toast'); e.textContent = s; e.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => e.style.display = 'none', 2600); };
const verb = (r, u) =>
  u.action === 'sit' ? (r.type === 'booth' ? 'Slide into booth' : r.type === 'bench' ? 'Sit on bench' : 'Sit down') :
  u.action === 'sleep' ? 'Sleep / Rest in bed (Restore Energy)' :
  u.action === 'food' ? (r.type === 'shelf' ? 'Grab snacks (Food)' : 'Order meal (Food)') :
  u.action === 'drink' ? (r.type === 'espresso' ? 'Brew espresso (Drink)' : 'Grab cold drink (Drink)') :
  u.action === 'scavenge' ? 'Scavenge recyclables' :
  u.action === 'shop' ? 'Browse counter shop' :
  u.action === 'pc' ? 'Browse cyber terminal' :
  u.action === 'music' ? 'Pick a song' :
  u.action === 'dress' ? (r.type === 'mirror' ? 'Look in mirror (Change Outfit)' : 'Open wardrobe (Change Outfit)') :
  u.action === 'moonbase' ? 'Examine Lunar Diorama (Warp to Moon Base)' :
  u.action === 'terminal' ? (r.type === 'portal' ? 'Warp to Skyline Loft' : 'Access Subspace Terminal') :
  u.action === 'play' ? (r.type === 'claw' ? 'Play Claw Machine (10🪙)' : r.type === 'gacha' ? 'Turn Gacha (5🪙)' : (() => { const gid = r.game || (r.type === 'pool' ? 'pool' : r.type === 'ludotable' ? 'ludo' : null); return (gid && GAMES[gid]) ? 'Play ' + GAMES[gid].title.split(' ·')[0] : r.T.label + ' · coming soon'; })()) : 'Hang out';

// ---------- game portal ----------
let gameOpen = false;
let gameTimer = 0;
function openGame(id, prop) {
  const g = GAMES[id]; if (!g) return; const r = prop && world.props.get(prop); if (r) stage.focus(r.cx, r.cy, 5.5);
  clearTimeout(gameTimer); gameOpen = true; gameTimer = setTimeout(() => {          // let the camera dolly in first
    if (!gameOpen) return; $('gameTitle').textContent = g.title; $('gameFrame').src = g.url; const el = $('game'); el.classList.remove('hidden'); void el.offsetWidth; el.classList.add('in'); }, r && !q.has('fast') ? 750 : 0);
}
function closeGame() {
  if (!gameOpen) return; gameOpen = false; clearTimeout(gameTimer); const el = $('game'); el.classList.remove('in'); stage.unfocus();
  setTimeout(() => { if (!gameOpen) { $('gameFrame').src = 'about:blank'; el.classList.add('hidden'); } }, 320); cmd({ t: 'stand' });
}
$('gameClose').onclick = closeGame;

// ---------- claw machine ----------
let clawGame = null;
let clawOpen = false;

function openClawMachine(propId) {
  if (prof.coins < 10) {
    sound.deny();
    toast(`Need 10 coins to play! (Balance: ${prof.coins})`);
    cmd({ t: 'stand' });
    return;
  }
  prof.coins -= 10;
  persist();
  updateWalletUI();
  sound.coin();
  toast('10 coins inserted! Drag joystick / WASD to aim, press Space to drop');

  const r = propId && world.props.get(propId);
  if (r) stage.focus(r.cx, r.cy, 5.5);

  clawOpen = true;
  $('clawModal').classList.remove('hidden');
  const cv = $('clawCanvas');
  clawGame = new ClawGame(cv, {
    sound,
    onWin: showPrizeModal,
    onToast: (msg) => toast(msg),
    onClose: closeClawMachine
  });
  clawGame.start();
}

function closeClawMachine() {
  if (!clawOpen) return;
  clawOpen = false;
  $('clawModal').classList.add('hidden');
  if (clawGame) {
    clawGame.stop();
    clawGame = null;
  }
  stage.unfocus();
  cmd({ t: 'stand' });
}

function showPrizeModal(prize) {
  if (prize.type === 'tickets') {
    prof.tickets += prize.amount;
    toast(`+${prize.amount} Tickets!`);
  } else if (prize.type === 'cosmetic') {
    prof.inventory.push(prize.name);
    if (prize.key && prize.value) {
      const l = { ...me.loadout, [prize.key]: prize.value };
      cmd({ t: 'loadout', loadout: l });
    }
    toast(`Unlocked cosmetic: ${prize.name}`);
  } else if (prize.type === 'furniture') {
    prof.inventory.push(prize.name);
    if (prize.prop) {
      CATALOG.push({ cat: 'decor', ...prize.prop, color: prize.color });
      renderCatalog();
    }
    toast(`Unlocked furniture: ${prize.name}`);
  } else if (prize.type === 'relic') {
    prof.inventory.push(prize.name);
    toast('Uncovered a strange relic! Check the room for anomalies...');
  }
  persist();
  updateWalletUI();

  $('prizeIcon').textContent = prize.icon || '🎁';
  $('prizeName').textContent = prize.name;
  $('prizeDesc').textContent = prize.desc || `Added to your collection! (Tier: ${prize.tier.toUpperCase()})`;
  $('prizeModal').classList.remove('hidden');
}

$('prizeClaim').onclick = () => { $('prizeModal').classList.add('hidden'); };
$('clawClose').onclick = closeClawMachine;
$('bClawDrop').onclick = () => { if (clawGame) clawGame.dropClaw(); };

// ---------- virtual joystick controller ----------
const joyBase = $('joyBase'), joyStick = $('joyStick');
let joyDragging = false, joyCenter = { x: 0, y: 0 };

function handleJoyMove(cx, cy) {
  if (!joyDragging || !clawGame) return;
  const dx = cx - joyCenter.x, dy = cy - joyCenter.y;
  const maxR = 26;
  const dist = Math.hypot(dx, dy);
  const clampedDist = Math.min(dist, maxR);
  const angle = Math.atan2(dy, dx);
  const stickX = Math.cos(angle) * clampedDist;
  const stickY = Math.sin(angle) * clampedDist;
  joyStick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;
  clawGame.setJoystick(stickX / maxR, stickY / maxR);
}

function handleJoyEnd() {
  if (!joyDragging) return;
  joyDragging = false;
  joyStick.style.transform = 'translate(-50%, -50%)';
  if (clawGame) clawGame.setJoystick(0, 0);
}

if (joyBase) {
  joyBase.addEventListener('pointerdown', e => {
    joyDragging = true;
    const rc = joyBase.getBoundingClientRect();
    joyCenter = { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    joyBase.setPointerCapture(e.pointerId);
    handleJoyMove(e.clientX, e.clientY);
  });
  joyBase.addEventListener('pointermove', e => handleJoyMove(e.clientX, e.clientY));
  joyBase.addEventListener('pointerup', handleJoyEnd);
  joyBase.addEventListener('pointercancel', handleJoyEnd);
}

function updateClawKeyAim() {
  if (!clawGame || !clawOpen) return;
  const up = keys.has('w') || keys.has('arrowup');
  const down = keys.has('s') || keys.has('arrowdown');
  const left = keys.has('a') || keys.has('arrowleft');
  const right = keys.has('d') || keys.has('arrowright');
  const dx = (right ? 1 : 0) - (left ? 1 : 0);
  const dy = (down ? 1 : 0) - (up ? 1 : 0);
  clawGame.setJoystick(dx, dy);
}

// ---------- prize counter shop ----------
const PRIZE_SHOP = [
  { id: 'coins30', name: '30 Arcade Tokens', cost: 25, icon: '🪙', desc: 'Convert tickets into playable game tokens', buy: () => { prof.coins += 30; } },
  { id: 'halo', name: 'Golden Neon Halo', cost: 100, icon: '👑', desc: 'Radiant glowing halo for your avatar', buy: () => {
    prof.inventory.push('Golden Neon Halo');
    const l = { ...me.loadout, accessory: 'halo' };
    cmd({ t: 'loadout', loadout: l });
  }},
  { id: 'neon_sign', name: 'CYBER Neon Sign', cost: 150, icon: '⚡', desc: 'Exclusive neon sign prop for Decorator Mode', buy: () => {
    prof.inventory.push('CYBER Neon Sign');
    CATALOG.push({ cat: 'decor', type: 'neon', side: 'n', text: 'CYBER', color: '#54e0ee', label: 'CYBER Sign' });
    renderCatalog();
  }},
  { id: 'tape0', name: 'Cassette: Track 00', cost: 200, icon: '📼', desc: 'Cryptic tape fragment found behind a cabinet', buy: () => {
    prof.inventory.push('Cassette: Track 00');
    toast('The cassette hums faintly in your hands... [Mystery Relic]');
  }}
];

let shopOpen = false;
function renderPrizeShop() {
  const el = $('shopItems');
  if (!el) return;
  $('shopTickets').textContent = prof.tickets;
  $('shopCoins').textContent = prof.coins;
  el.innerHTML = PRIZE_SHOP.map((it, idx) => {
    const owned = (it.id === 'halo' && me.loadout.accessory === 'halo') || (it.id !== 'coins30' && prof.inventory.includes(it.name));
    const canAfford = prof.tickets >= it.cost;
    return `
      <div class="shopRow">
        <div class="shopRowLeft">
          <span class="shopRowIcon">${it.icon}</span>
          <div class="shopRowInfo">
            <b>${it.name}</b>
            <span>${it.desc}</span>
          </div>
        </div>
        <button class="shopRowBtn ${canAfford && !owned ? 'gold' : ''}" data-idx="${idx}" ${!canAfford || owned ? 'disabled' : ''}>
          ${owned ? 'Claimed' : `🎟️ ${it.cost}`}
        </button>
      </div>
    `;
  }).join('');
}

function openPrizeShop() {
  shopOpen = true;
  renderPrizeShop();
  $('shopModal').classList.remove('hidden');
}
function closePrizeShop() {
  shopOpen = false;
  $('shopModal').classList.add('hidden');
}
if ($('shopClose')) $('shopClose').onclick = closePrizeShop;
if ($('shopItems')) {
  $('shopItems').onclick = e => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const item = PRIZE_SHOP[+btn.dataset.idx];
    if (!item || prof.tickets < item.cost) return;
    prof.tickets -= item.cost;
    item.buy();
    sound.win();
    toast(`Redeemed ${item.name}!`);
    persist();
    updateWalletUI();
    renderPrizeShop();
  };
}

const bc = $('badgeCoins'), bt = $('badgeTickets');
if (bc) {
  bc.onclick = () => {
    if (prof.coins < 10) {
      prof.coins += 50;
      sound.coin();
      toast('+50 Free Daily Tokens! Enjoy the games!');
      persist();
      updateWalletUI();
      if (shopOpen) renderPrizeShop();
    } else {
      toast(`Balance: ${prof.coins}🪙 Tokens. Play games or the Claw Machine!`);
    }
  };
}
if (bt) bt.onclick = openPrizeShop;

// Standalone game postMessage listener (Rule 7)
window.addEventListener('message', ev => {
  if (ev.data && ev.data.type === 'gameReward') {
    const t = ev.data.tickets || 0, c = ev.data.coins || 0;
    if (t > 0) { prof.tickets += t; toast(`+${t} Tickets won!`); }
    if (c > 0) { prof.coins += c; toast(`+${c} Coins earned!`); }
    sound.win();
    persist();
    updateWalletUI();
  }
});

// ---------- subspace archive terminal ----------
let termOpen = false;
const TERMINAL_LOGS = [
  'CLEARANCE LEVEL 4: The Twilight Arcade is not an installation. It is an anchor.',
  '[1989-10-24] Cabinet PROTO-89: Anomalous 444Hz resonant signal detected in CRT trace. The machine appears to dream.',
  '[1989-11-03] Personnel Note: East wall drywall thickness measures 0.00m at midnight. Room expands inward.',
  '[1989-11-17] Warning: Do not calibrate jukebox track 4 while holding two brass tokens. Spatial overlap confirmed.',
  '[1989-12-14] Recovery Log: Subspace rift stabilized. Rift coordinates mapped to East Wall tile (24, 3).'
];
let termLogIdx = 0;

function appendTermLog(msg, isAlert = false) {
  const v = $('termLogView');
  if (!v) return;
  const p = document.createElement('p');
  p.className = 'tPrompt' + (isAlert ? ' alert' : '');
  p.textContent = msg;
  v.appendChild(p);
  v.scrollTop = v.scrollHeight;
}

function openTerminal(propId) {
  termOpen = true;
  const r = propId && world.props.get(propId);
  if (r) stage.focus(r.cx, r.cy, 5.5);
  $('termModal').classList.remove('hidden');
  sound.win();
  appendTermLog(`> TERMINAL INTERFACE READY // USER: [${me.name}] // LOC: (${me.x}, ${me.y})`);
}

function closeTerminal() {
  if (!termOpen) return;
  termOpen = false;
  $('termModal').classList.add('hidden');
  stage.unfocus();
  cmd({ t: 'stand' });
}

if ($('termClose')) $('termClose').onclick = closeTerminal;
if ($('termButtons')) {
  $('termButtons').onclick = e => {
    const btn = e.target.closest('.tCmdBtn');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'phase') {
      const nextPhase = world.phase === 'twilight' ? 'normal' : 'twilight';
      cmd({ t: 'setPhase', phase: nextPhase });
      sound.win();
      appendTermLog(`> REALITY PHASE SHIFT INITIATED: [${nextPhase.toUpperCase()}]`, true);
    } else if (act === 'relic') {
      if (prof.inventory.includes('Void Crown')) {
        sound.deny();
        appendTermLog('> ERROR: VOID CROWN RELIC ALREADY CLAIMED BY USER.', true);
        toast('Void Crown already claimed!');
      } else {
        prof.inventory.push('Void Crown');
        prof.tickets += 250;
        const l = { ...me.loadout, accessory: 'crown' };
        cmd({ t: 'loadout', loadout: l });
        persist();
        updateWalletUI();
        sound.win();
        toast('✦ Extracted Void Crown & +250 Tickets!');
        appendTermLog('> EXTRACTION COMPLETE: [VOID CROWN] ATTACHED. +250 TICKETS CREDITED.', true);
      }
    } else if (act === 'warp') {
      const WARP_DESTS = [
        { name: 'Arcade Row', x: 4, y: 3 },
        { name: 'Velvet Lounge', x: 13, y: 11 },
        { name: 'Pool Corner', x: 14, y: 11 },
        { name: 'Cyber Bar', x: 20, y: 8 },
        { name: 'Claw Pit', x: 10, y: 3 }
      ];
      const target = WARP_DESTS[Math.floor(Math.random() * WARP_DESTS.length)];
      appendTermLog(`> FOLDING SPACE-TIME... DESTINATION: [${target.name}]`, true);
      sound.pop();
      closeTerminal();
      cmd({ t: 'move', x: target.x, y: target.y });
      toast(`Warped to ${target.name}!`);
    } else if (act === 'logs') {
      const msg = TERMINAL_LOGS[termLogIdx % TERMINAL_LOGS.length];
      termLogIdx++;
      sound.click();
      appendTermLog('> ' + msg);
    }
  };
}

// ---------- NEON-OS Cyber Desk Terminal (Unit 101) ----------
let termPcOpen = false;
let lofiPlaying = false;
let lofiTimer = null;
const MATRIX_HEX = ['7F', '3A', '9C', 'E2', 'B4', '0D', 'F5', '1A', '8B', '2E'];
let matrixTarget = ['7F', '3A', '9C'];
let matrixSelected = [];

function initMatrixGame() {
  const shuffled = [...MATRIX_HEX].sort(() => Math.random() - 0.5);
  matrixTarget = shuffled.slice(0, 3);
  matrixSelected = [];
  if ($('matrixCodeTarget')) $('matrixCodeTarget').textContent = `TARGET: [ ${matrixTarget.join(' : ')} ]`;
  if ($('matrixStatus')) {
    $('matrixStatus').textContent = 'STATUS: ENCRYPTED SUBNET READY';
    $('matrixStatus').style.color = 'var(--gold)';
  }
  const grid = $('matrixGrid');
  if (!grid) return;
  const cells = [...matrixTarget];
  while (cells.length < 20) {
    cells.push(MATRIX_HEX[Math.floor(Math.random() * MATRIX_HEX.length)]);
  }
  cells.sort(() => Math.random() - 0.5);
  grid.innerHTML = cells.map((hex, i) => `
    <button class="matrixNode" data-idx="${i}" data-hex="${hex}">${hex}</button>
  `).join('');
}

if ($('matrixGrid')) {
  $('matrixGrid').onclick = e => {
    const btn = e.target.closest('.matrixNode');
    if (!btn) return;
    const idx = +btn.dataset.idx;
    if (matrixSelected.includes(idx)) {
      matrixSelected = matrixSelected.filter(id => id !== idx);
      btn.classList.remove('sel');
      sound.click();
    } else if (matrixSelected.length < 3) {
      matrixSelected.push(idx);
      btn.classList.add('sel');
      sound.pop();
    }
  };
}

if ($('bMatrixHack')) {
  $('bMatrixHack').onclick = () => {
    if (matrixSelected.length < 3) {
      sound.deny();
      toast('Select 3 code nodes to execute hack!');
      return;
    }
    const nodes = document.querySelectorAll('.matrixNode');
    const selectedHexes = matrixSelected.map(idx => {
      const btn = Array.from(nodes).find(n => +n.dataset.idx === idx);
      return btn ? btn.dataset.hex : '';
    });
    const success = matrixTarget.every(t => selectedHexes.includes(t));
    if (success) {
      $('matrixStatus').textContent = 'STATUS: SUBNET CRACKED! ACCESS GRANTED';
      $('matrixStatus').style.color = 'var(--green)';
      prof.coins += 40;
      prof.tickets += 15;
      persist();
      updateWalletUI();
      sound.win();
      toast('✦ NetRunner infiltration success! +40 Coins & +15 Tickets');
      setTimeout(initMatrixGame, 1800);
    } else {
      $('matrixStatus').textContent = 'STATUS: ENCRYPTION REJECTED. TRY AGAIN';
      $('matrixStatus').style.color = 'var(--red)';
      sound.deny();
      toast('Node sequence mismatch! Try again.');
    }
  };
}

function startLofiBeats() {
  sound._ctx();
  const ctx = sound.ctx;
  if (!ctx) return;
  lofiPlaying = true;
  if ($('bLofiToggle')) {
    $('bLofiToggle').textContent = '⏹ Stop Lo-Fi Beats';
    $('bLofiToggle').classList.remove('gold');
  }
  const chords = [
    [48, 55, 59, 64], // Cmaj7
    [45, 52, 57, 60], // Am7
    [50, 57, 62, 65], // Dm7
    [43, 50, 55, 59], // G7
  ];
  let chordIdx = 0;
  function playLoFiChord() {
    if (!lofiPlaying) return;
    const c = chords[chordIdx % chords.length];
    chordIdx++;
    const now = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.7);
    c.forEach(midi => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(filter);
      osc.start(now);
      osc.stop(now + 2.8);
    });
    filter.connect(gain);
    gain.connect(ctx.destination);
    lofiTimer = setTimeout(playLoFiChord, 2800);
  }
  playLoFiChord();
}

function stopLofiBeats() {
  lofiPlaying = false;
  clearTimeout(lofiTimer);
  if ($('bLofiToggle')) {
    $('bLofiToggle').textContent = '▶ Play Ambient Beats';
    $('bLofiToggle').classList.add('gold');
  }
}

if ($('bLofiToggle')) {
  $('bLofiToggle').onclick = () => {
    initRadioOnGesture();
    if (radio.isPlaying) {
      radio.pause();
    } else {
      sound.stop();
      stopLofiBeats();
      radio.play();
    }
  };
}
if ($('bLofiNext')) {
  $('bLofiNext').onclick = () => {
    initRadioOnGesture();
    sound.click();
    radio.next();
  };
}

function renderLoftInbox() {
  const list = $('pcInboxList');
  if (!list) return;
  const msgs = [
    { from: 'Kai [Arcade Regular]', time: '10:42 PM', text: 'Hey neighbor! Put up a new high score on Alien Tox today. Think you can beat it?' },
    { from: 'Roxy [Diner Chef]', time: '08:15 PM', text: 'Fresh batch of spicy tonkotsu broth ready tonight at Neon Noodle. Pop by if hungry!' },
    { from: 'Nova [Bodega Clerk]', time: '06:30 PM', text: 'Restocked iced matcha teas and neon sodas in the coolers. Don\'t forget to use your points.' },
    { from: 'Deckard [Investigator]', time: '03:12 AM', text: 'Heard electromagnetic interference near Subspace Alley. Room dimensions might be fluctuating.' },
    { from: 'BobaBot-9000', time: '12:00 PM', text: 'BEEP BOOP. SKYLINE LOFTS UNIT 101 POWER STATUS: 100% NOMINAL. COZY LEVEL: MAXIMUM.' }
  ];
  list.innerHTML = msgs.map(m => `
    <div class="inboxItem">
      <b>${m.from} · <span style="color:var(--mute);font-weight:400;">${m.time}</span></b>
      <p>${m.text}</p>
    </div>
  `).join('');
}

function openLoftPC(propId) {
  termPcOpen = true;
  const r = propId && world.props.get(propId);
  if (r) stage.focus(r.cx, r.cy, 5.5);
  initMatrixGame();
  renderLoftInbox();
  $('loftPcModal').classList.remove('hidden');
  sound.win();
}

function closeLoftPC() {
  if (!termPcOpen) return;
  termPcOpen = false;
  stopLofiBeats();
  $('loftPcModal').classList.add('hidden');
  stage.unfocus();
  cmd({ t: 'stand' });
}

if ($('pcClose')) $('pcClose').onclick = closeLoftPC;
if ($('bLoftDecorate')) $('bLoftDecorate').onclick = () => {
  closeLoftPC();
  setBuildMode(true);
};

const pcTabs = document.querySelectorAll('.pcTab');
pcTabs.forEach(tab => {
  tab.onclick = () => {
    pcTabs.forEach(t => t.classList.remove('on'));
    tab.classList.add('on');
    const target = tab.dataset.pctab;
    document.querySelectorAll('.pcTabContent').forEach(c => c.classList.add('hidden'));
    if (target === 'matrix') $('pcTabMatrix').classList.remove('hidden');
    else if (target === 'lofi') $('pcTabLofi').classList.remove('hidden');
    else if (target === 'inbox') $('pcTabInbox').classList.remove('hidden');
    else if (target === 'status') $('pcTabStatus').classList.remove('hidden');
    else if (target === 'moonbase') $('pcTabMoonbase').classList.remove('hidden');
    sound.click();
  };
});

// ---------- Moon Base Tabletop Diorama Stage & Fast Travel ----------
let moonBaseStage = null;
let moonBaseOpen = false;
let currentWarpDest = currentRoom;

function updateFastTravelUI(dest = currentRoom) {
  currentWarpDest = dest;
  const bArc = $('bTravelArcade');
  const bLoft = $('bTravelLoft');
  const bMoon = $('bTravelMoon');
  if (bArc) bArc.classList.toggle('active', dest === 'arcade');
  if (bLoft) bLoft.classList.toggle('active', dest === 'loft');
  if (bMoon) bMoon.classList.toggle('active', dest === 'moonbase');
}
updateFastTravelUI(currentRoom);

function switchRoom(destination) {
  if (destination !== 'arcade' && destination !== 'loft') return;
  if (currentRoom === destination) return;

  saveCurrentLayout();
  currentRoom = destination;
  const newLayout = loadRoomLayout(currentRoom);
  world = new World(newLayout);

  const spawn = newLayout.spawn || { x: newLayout.w / 2, y: newLayout.h / 2 };
  me = world.command({
    t: 'join',
    person: {
      id: 'me',
      human: true,
      name: prof.name || 'You',
      loadout: prof.loadout || randomLoadout(),
      x: spawn.x + 0.5,
      y: spawn.y + 0.5
    }
  });

  initRoomBots(world, currentRoom);
  bindWorldEvents(world);
  stage.setWorld(world, currentRoom);
  updateFastTravelUI(currentRoom);
}

function teleportTo(destination) {
  if (destination === 'moonbase') {
    openMoonBase('loft_diorama');
    return;
  }

  // If in Moon Base, close it first
  if (moonBaseOpen) {
    closeMoonBase();
  }

  if (destination === 'arcade') {
    sound.warp();
    if (currentRoom !== 'arcade') {
      switchRoom('arcade');
    } else {
      const targetX = 13, targetY = 14;
      world.command({ t: 'warp', id: 'me', x: targetX, y: targetY });
      stage.teleportCamera(targetX, targetY);
    }
    toast('🕹️ Quantum Teleport: Arrived at The Arcade Lounge!');
    updateFastTravelUI('arcade');
    if (typeof net !== 'undefined' && net.online) {
      net.send({ t: 'warp', id: 'me', x: me.x, y: me.y });
    }
  } else if (destination === 'loft') {
    sound.warp();
    if (currentRoom !== 'loft') {
      switchRoom('loft');
    } else {
      const targetX = 10, targetY = 11;
      world.command({ t: 'warp', id: 'me', x: targetX, y: targetY });
      stage.teleportCamera(targetX, targetY);
    }
    toast('🏠 Quantum Teleport: Arrived at Skyline Micro-Loft 101!');
    updateFastTravelUI('loft');
    if (typeof net !== 'undefined' && net.online) {
      net.send({ t: 'warp', id: 'me', x: me.x, y: me.y });
    }
  }
}

function openMoonBase(propId) {
  if (moonBaseOpen) return;
  moonBaseOpen = true;
  sound.warp();
  toast('🌌 Quantum Teleport: Warping to Artemis Moon Base Tabletop Diorama...');

  const overlay = $('moonbaseOverlay');
  const loading = $('moonbaseLoading');
  if (loading) loading.classList.add('hidden');
  if (overlay) overlay.classList.remove('hidden');

  const host = $('moonbaseStage');
  if (host) {
    host.innerHTML = '';
    try {
      moonBaseStage = new MoonBaseStage({
        container: host,
        sound,
        onToast: (msg) => toast(msg),
        onReturn: () => closeMoonBase()
      });
      setupMoonBaseToolbar();
    } catch (err) {
      console.error('Failed to initialize MoonBaseStage:', err);
      toast('❌ Error initializing Moon Base diorama: ' + err.message);
      closeMoonBase();
      return;
    }
  }
  updateFastTravelUI('moonbase');
}

function closeMoonBase() {
  if (!moonBaseOpen) return;
  moonBaseOpen = false;
  sound.warp();
  toast(currentRoom === 'loft' ? '🌌 Returning to Skyline Micro-Lofts Unit 101...' : '🌌 Returning to The Arcade Lounge...');

  const overlay = $('moonbaseOverlay');
  if (overlay) overlay.classList.add('hidden');

  if (moonBaseStage) {
    try { moonBaseStage.dispose(); } catch (e) {}
    moonBaseStage = null;
  }

  stage.unfocus();
  cmd({ t: 'stand' });
  updateFastTravelUI(currentRoom);
}

function setupMoonBaseToolbar() {
  if (!moonBaseStage) return;

  const bPause = $('bMbPause');
  if (bPause) bPause.onclick = () => {
    moonBaseStage.togglePause();
    bPause.innerHTML = `<span class="mbIcon">${moonBaseStage.isPaused ? '▶' : '⏸'}</span>`;
  };

  const bSpeed = $('bMbSpeed');
  if (bSpeed) bSpeed.onclick = () => {
    const speeds = [1.0, 2.0, 5.0];
    const curIdx = speeds.indexOf(moonBaseStage.simSpeed);
    const nextSpeed = speeds[(curIdx + 1) % speeds.length];
    moonBaseStage.setSpeed(nextSpeed);
    bSpeed.textContent = `${nextSpeed}x`;
  };

  const timeSlider = $('mbTimeSlider');
  if (timeSlider) {
    timeSlider.value = Math.floor(moonBaseStage.timeOfDay * 100);
    timeSlider.oninput = (e) => {
      moonBaseStage.autoDayCycle = false;
      moonBaseStage.timeOfDay = +e.target.value / 100;
      const bCycle = $('bMbDayCycle');
      if (bCycle) bCycle.classList.remove('on');
    };
  }

  const bCycle = $('bMbDayCycle');
  if (bCycle) bCycle.onclick = () => {
    moonBaseStage.autoDayCycle = !moonBaseStage.autoDayCycle;
    bCycle.classList.toggle('on', moonBaseStage.autoDayCycle);
  };

  if ($('bMbLaunch')) $('bMbLaunch').onclick = () => moonBaseStage.launchRocket();
  if ($('bMbHopper')) $('bMbHopper').onclick = () => moonBaseStage.callHopper();
  if ($('bMbPatrol')) $('bMbPatrol').onclick = () => moonBaseStage.triggerRoverPatrol();
  if ($('bMbMeteors')) $('bMbMeteors').onclick = () => moonBaseStage.triggerMeteorShower();
  if ($('bMbStorm')) $('bMbStorm').onclick = () => moonBaseStage.toggleDustStorm();

  const bLights = $('bMbLights');
  if (bLights) bLights.onclick = () => {
    moonBaseStage.toggleLights();
    bLights.classList.toggle('on', moonBaseStage.lightsOn);
  };

  const bLabels = $('bMbLabels');
  if (bLabels) bLabels.onclick = () => {
    moonBaseStage.toggleLabels();
    bLabels.classList.toggle('on', moonBaseStage.showLabels);
  };

  const bShadows = $('bMbShadows');
  if (bShadows) bShadows.onclick = () => {
    moonBaseStage.toggleShadows();
    bShadows.classList.toggle('on', moonBaseStage.shadowsEnabled);
  };

  const bSound = $('bMbSound');
  if (bSound) bSound.onclick = () => {
    sound.setMuted(!sound.muted);
    bSound.classList.toggle('on', !sound.muted);
  };

  if ($('bMbResetCam')) $('bMbResetCam').onclick = () => moonBaseStage.resetView();

  const bHelp = $('bMbHelp');
  const helpModal = $('moonbaseHelpModal');
  if (bHelp && helpModal) {
    bHelp.onclick = () => helpModal.classList.remove('hidden');
  }
  if ($('bMbHelpClose') && helpModal) {
    $('bMbHelpClose').onclick = () => helpModal.classList.add('hidden');
  }

  if ($('bMbReturn')) $('bMbReturn').onclick = () => closeMoonBase();
}

if ($('bWarpMoonBase')) $('bWarpMoonBase').onclick = () => {
  closeLoftPC();
  openMoonBase();
};

// ---------- district life-sim modals ----------
let mapOpen = false;
function renderDistrictMap() {
  const cv = $('districtMapCanvas');
  if (!cv) return;
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.fillStyle = '#090b14'; g.fillRect(0, 0, W, H);
  const scaleX = W / activeLayout.w, scaleY = H / activeLayout.h;

  // Streets
  g.fillStyle = '#171a2b';
  g.fillRect(1 * scaleX, 17 * scaleY, 50 * scaleX, 6 * scaleY);
  g.fillRect(25 * scaleX, 1 * scaleY, 4 * scaleX, 42 * scaleY);
  g.fillRect(47 * scaleX, 1 * scaleY, 4 * scaleX, 42 * scaleY);

  // Buildings
  if (activeLayout.buildings) {
    for (const b of activeLayout.buildings) {
      const { x, y, w: bw, h: bh } = b.bounds;
      g.fillStyle = b.color + '22';
      g.strokeStyle = b.color;
      g.lineWidth = 2;
      g.fillRect(x * scaleX, y * scaleY, bw * scaleX, bh * scaleY);
      g.strokeRect(x * scaleX, y * scaleY, bw * scaleX, bh * scaleY);
      g.fillStyle = '#ffffff';
      g.font = '700 11px Inter, sans-serif';
      g.textAlign = 'center';
      g.fillText(b.name, (x + bw / 2) * scaleX, (y + bh / 2) * scaleY);
      g.fillStyle = '#35e0ff';
      if (b.door.w) g.fillRect(b.door.x * scaleX, b.door.y * scaleY, b.door.w * scaleX, 3);
      else if (b.door.h) g.fillRect(b.door.x * scaleX, b.door.y * scaleY, 3, b.door.h * scaleY);
    }
  }

  // Citizens
  g.fillStyle = '#54e0ee';
  for (const p of world.people.values()) {
    if (p.id === 'me') continue;
    g.beginPath();
    g.arc(p.x * scaleX, p.y * scaleY, 4, 0, Math.PI * 2);
    g.fill();
  }

  // Player Pin
  g.fillStyle = '#5fe08a';
  g.shadowColor = '#5fe08a';
  g.shadowBlur = 8;
  g.beginPath();
  g.arc(me.x * scaleX, me.y * scaleY, 6, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
}

function openMap() {
  mapOpen = true;
  $('mapModal').classList.remove('hidden');
  renderDistrictMap();
  sound.click();
}
function closeMap() {
  mapOpen = false;
  $('mapModal').classList.add('hidden');
}
if ($('mapClose')) $('mapClose').onclick = closeMap;
if ($('bMap')) $('bMap').onclick = () => (mapOpen ? closeMap() : openMap());

let activeDiag = null;
function openDialogue(citizen) {
  if (!citizen) return;
  activeDiag = citizen;
  $('diagName').textContent = citizen.name;
  $('diagRole').textContent = citizen.role;
  $('diagTier').textContent = getRelationshipTier(citizen.affinity);
  $('diagFill').style.width = Math.min(100, citizen.affinity) + '%';
  $('diagSpeech').textContent = `"${getDialogue(citizen, 'talk')}"`;
  if ($('bDiagInviteLoft')) {
    $('bDiagInviteLoft').classList.toggle('hidden', citizen.affinity < 30);
  }
  $('dialogueModal').classList.remove('hidden');
  sound.pop();
}
function closeDialogue() {
  activeDiag = null;
  $('dialogueModal').classList.add('hidden');
}
if ($('diagClose')) $('diagClose').onclick = closeDialogue;
if ($('bDiagTalk')) $('bDiagTalk').onclick = () => {
  if (!activeDiag) return;
  activeDiag.affinity = Math.min(100, activeDiag.affinity + 8);
  lifeSim.socialize(15);
  $('diagTier').textContent = getRelationshipTier(activeDiag.affinity);
  $('diagFill').style.width = Math.min(100, activeDiag.affinity) + '%';
  $('diagSpeech').textContent = `"${getDialogue(activeDiag, 'talk')}"`;
  cmd({ t: 'talk', targetId: activeDiag.id, text: 'Hey there!' });
  sound.pop();
};
if ($('bDiagCompliment')) $('bDiagCompliment').onclick = () => {
  if (!activeDiag) return;
  activeDiag.affinity = Math.min(100, activeDiag.affinity + 15);
  lifeSim.socialize(20);
  $('diagTier').textContent = getRelationshipTier(activeDiag.affinity);
  $('diagFill').style.width = Math.min(100, activeDiag.affinity) + '%';
  $('diagSpeech').textContent = '"Aww, thank you! That made my entire day."';
  cmd({ t: 'emote', name: 'cheer' });
  sound.win();
};
if ($('bDiagGift')) $('bDiagGift').onclick = () => {
  if (!activeDiag) return;
  if (prof.coins < 10) { sound.deny(); toast('Need 10 coins to gift a soda!'); return; }
  prof.coins -= 10; persist(); updateWalletUI();
  activeDiag.affinity = Math.min(100, activeDiag.affinity + 25);
  lifeSim.socialize(30);
  $('diagTier').textContent = getRelationshipTier(activeDiag.affinity);
  $('diagFill').style.width = Math.min(100, activeDiag.affinity) + '%';
  $('diagSpeech').textContent = '"Wow, my favorite drink! You are the best."';
  cmd({ t: 'gift', targetId: activeDiag.id, item: 'soda' });
  sound.coin();
};
if ($('bDiagInviteLoft')) $('bDiagInviteLoft').onclick = () => {
  if (!activeDiag) return;
  activeDiag.hangoutTarget = 'loft_couch1';
  activeDiag.affinity = Math.min(100, activeDiag.affinity + 15);
  lifeSim.socialize(25);
  $('diagTier').textContent = getRelationshipTier(activeDiag.affinity);
  $('diagFill').style.width = Math.min(100, activeDiag.affinity) + '%';
  $('diagSpeech').textContent = '"I would love to hang out at Unit 101! Lead the way, neighbor."';
  toast(`✦ ${activeDiag.name} accepted your invite! Heading to Unit 101.`);
  sound.win();
};
if ($('bDiagGossip')) $('bDiagGossip').onclick = () => {
  if (!activeDiag) return;
  $('diagSpeech').textContent = `"${getDialogue(activeDiag, 'gossip')}"`;
  sound.click();
};

let gigOpen = false;
function renderGigs() {
  const list = $('gigList');
  if (!list) return;
  list.innerHTML = GIGS.map(g => {
    const isDone = lifeSim.completedGigs.has(g.id);
    const isActive = lifeSim.activeGig && lifeSim.activeGig.id === g.id;
    return `
      <div class="gigRow">
        <div class="gigRowInfo">
          <b>${g.title}</b>
          <span>${g.desc}</span>
          <div class="gigRowReward">Reward: +${g.rewardCoins}🪙 Coins · +${g.rewardTickets}🎟️ Tickets</div>
        </div>
        <button class="gigRowBtn gold" data-gig="${g.id}" ${isDone ? 'disabled' : ''}>
          ${isDone ? 'Completed ✓' : isActive ? 'In Progress…' : 'Accept Gig'}
        </button>
      </div>
    `;
  }).join('');
  list.onclick = e => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const gig = GIGS.find(g => g.id === btn.dataset.gig);
    if (!gig) return;
    lifeSim.activeGig = gig;
    toast(`Accepted: ${gig.title}! ${gig.desc}`);
    sound.click();
    renderGigs();
  };
}
function openGigs() {
  gigOpen = true; $('gigModal').classList.remove('hidden'); renderGigs(); sound.click();
}
function closeGigs() {
  gigOpen = false; $('gigModal').classList.add('hidden');
}
if ($('gigClose')) $('gigClose').onclick = closeGigs;
if ($('bGig')) $('bGig').onclick = () => (gigOpen ? closeGigs() : openGigs());

let seedOpen = false;
function openSeed() {
  seedOpen = true;
  $('seedModal').classList.remove('hidden');
  $('seedInput').value = isClassic ? '' : districtSeed;
  sound.click();
}
function closeSeed() {
  seedOpen = false;
  $('seedModal').classList.add('hidden');
}
if ($('seedClose')) $('seedClose').onclick = closeSeed;
if ($('bSeed')) $('bSeed').onclick = () => (seedOpen ? closeSeed() : openSeed());
if ($('bSeedRandom')) $('bSeedRandom').onclick = () => {
  $('seedInput').value = Math.floor(Math.random() * 90000 + 10000);
  sound.click();
};
if ($('bSeedApply')) $('bSeedApply').onclick = () => {
  const s = $('seedInput').value.trim() || '1337';
  location.search = `?seed=${encodeURIComponent(s)}`;
};
if ($('bSeedClassic')) $('bSeedClassic').onclick = () => {
  location.search = '?classic=1';
};

// ---------- decorator mode & catalog ----------
const CATALOG = [
  // Cabinets
  { cat: 'cabinets', type: 'cabinet', label: 'Alien Tox', color: '#ff4d6d' },
  { cat: 'cabinets', type: 'cabinet', label: 'Hot Lava', color: '#35e0c9' },
  { cat: 'cabinets', type: 'cabinet', label: 'XOXOXO', color: '#ffd166' },
  { cat: 'cabinets', type: 'cabinet', label: 'Police Cab', color: '#4dd0ff' },
  { cat: 'cabinets', type: 'cabinet', label: 'PROTO-89', game: 'proto89', color: '#33ff88' },
  { cat: 'cabinets', type: 'terminal', label: '1989 Mainframe', color: '#33ff88' },
  { cat: 'cabinets', type: 'claw', label: 'Claw Machine', color: '#ff6fb5' },
  { cat: 'cabinets', type: 'jukebox', label: 'Jukebox', color: '#ffb84a' },
  { cat: 'cabinets', type: 'vending', label: 'Snack Machine', color: '#e0493a' },
  { cat: 'cabinets', type: 'espresso', label: 'Espresso Bar', color: '#d35400' },
  { cat: 'cabinets', type: 'cooler', label: 'Drink Cooler', color: '#2980b9' },
  { cat: 'cabinets', type: 'shelf', label: 'Snack Shelf', color: '#f39c12' },
  { cat: 'cabinets', type: 'register', label: 'Checkout Register', color: '#34495e' },
  { cat: 'cabinets', type: 'gacha', label: 'Gacha Machine', color: '#ff4d6d' },
  // Seating
  { cat: 'seating', type: 'couch', label: 'Red Velvet', color: '#d1495b' },
  { cat: 'seating', type: 'couch', label: 'Blue Couch', color: '#2e86ab' },
  { cat: 'seating', type: 'couch', label: 'Green Couch', color: '#2f6b4a' },
  { cat: 'seating', type: 'stool', label: 'Red Stool', color: '#c0392b' },
  { cat: 'seating', type: 'stool', label: 'Cyan Stool', color: '#35e0ff' },
  { cat: 'seating', type: 'booth', label: 'Diner Booth', color: '#e74c3c' },
  { cat: 'seating', type: 'bench', label: 'Park Bench', color: '#5a3a24' },
  { cat: 'seating', type: 'bar', label: 'Bar Counter', color: '#5a3a24' },
  // Tables
  { cat: 'tables', type: 'table', label: 'Round Table', color: '#2d2438' },
  { cat: 'tables', type: 'pool', label: 'Pool Table', game: 'pool', color: '#1f6f4f' },
  { cat: 'tables', type: 'ludotable', label: 'Ludo Table', color: '#2f6b4a', game: 'ludo' },
  { cat: 'tables', type: 'bed', label: 'Loft Bed', color: '#4a69bd' },
  { cat: 'tables', type: 'desk', label: 'Cyber Desk', color: '#1e272e' },
  { cat: 'tables', type: 'diner_counter', label: 'Diner Counter', color: '#4a2f1c' },
  // Loft Furnishings (Unit 101)
  { cat: 'loft', type: 'bed', label: 'Platform Bed', color: '#4a69bd' },
  { cat: 'loft', type: 'desk', label: 'Cyber Desk', color: '#1e272e' },
  { cat: 'loft', type: 'wardrobe', label: 'Wardrobe Closet', color: '#3c6382' },
  { cat: 'loft', type: 'mirror', label: 'Wardrobe Mirror', color: '#ffb84a' },
  { cat: 'loft', type: 'couch', label: 'Cozy Sofa', color: '#eb2f06' },
  { cat: 'loft', type: 'rug', label: 'Skyline Loft Rug', color: '#6a89cc' },
  { cat: 'loft', type: 'plant', label: 'Bonsai Plant', color: '#2ed573' },
  { cat: 'loft', type: 'poster', label: 'Lo-Fi Skyline Art', side: 'n', style: 0 },
  { cat: 'loft', type: 'sconce', label: 'Neon Sconce', side: 'n', color: '#35e0ff' },
  { cat: 'loft', type: 'diorama_table', label: 'Lunar Diorama Console', color: '#38ada9' },
  // Decor
  { cat: 'decor', type: 'diorama_table', label: 'Lunar Diorama Console', color: '#38ada9' },
  { cat: 'decor', type: 'plant', label: 'Monstera' },
  { cat: 'decor', type: 'tree', label: 'Street Tree' },
  { cat: 'decor', type: 'streetlight', label: 'Street Lamp', color: '#ffd166' },
  { cat: 'decor', type: 'hydrant', label: 'Fire Hydrant', color: '#e74c3c' },
  { cat: 'decor', type: 'bin', label: 'Recycle Bin', color: '#27ae60' },
  { cat: 'decor', type: 'wardrobe', label: 'Wardrobe', color: '#3c6382' },
  { cat: 'decor', type: 'mirror', label: 'Wardrobe Mirror', color: '#ffb84a' },
  { cat: 'decor', type: 'portal', label: 'Subspace Rift', color: '#8a5cff' },
  { cat: 'decor', type: 'rug', label: 'Purple Rug', color: '#5b2a86' },
  { cat: 'decor', type: 'rug', label: 'Teal Rug', color: '#1b5a6b' },
  { cat: 'decor', type: 'neon', label: 'ARCADE Neon', side: 'n', text: 'ARCADE', color: '#ff4d9a' },
  { cat: 'decor', type: 'neon', label: 'LOUNGE Neon', side: 'n', text: 'LOUNGE', color: '#35e0ff' },
  { cat: 'decor', type: 'sconce', label: 'Amber Lamp', side: 'n', color: '#ffb84a' },
  { cat: 'decor', type: 'poster', label: 'Poster A', side: 'n', style: 0 },
  { cat: 'decor', type: 'poster', label: 'Poster B', side: 'n', style: 1 },
  { cat: 'decor', type: 'palm_tree', label: 'Miami Palm', color: '#35e0c9' },
  { cat: 'decor', type: 'retro_car', label: 'Miami Vice Car', color: '#ffffff' },
];

let buildMode = false, activeCat = 'cabinets', heldProp = null, selectedPropId = null;

function renderCatalog() {
  const items = CATALOG.filter(c => c.cat === activeCat);
  const list = $('catalogList'); if (!list) return;
  list.innerHTML = items.map((it, idx) => `
    <div class="catItem" data-idx="${idx}">
      <div class="catIcon" style="background:${it.color || '#4b3f80'}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
      </div>
      <div class="catLabel">${it.label}</div>
    </div>
  `).join('');
}

let was3D = false;
function setBuildMode(active) {
  buildMode = active;
  $('bBuild')?.classList.toggle('on', buildMode);
  $('buildBar')?.classList.toggle('hidden', !buildMode);
  if (buildMode) {
    if (stage.camMode === '3d') {
      was3D = true;
      toggleView('iso', false);
    }
    if (gameOpen) closeGame();
    $('juke').classList.add('hidden');
    closeDress();
    renderCatalog();
    toast('Build Mode active — click props to move, R to rotate, Del to remove');
  } else {
    heldProp = null; selectedPropId = null;
    stage.setGhost(null); stage.setHoverProp(null);
    if (was3D) {
      was3D = false;
      toggleView('3d', false);
    }
  }
}

function selectCatalogItem(idx) {
  const items = CATALOG.filter(c => c.cat === activeCat);
  const tpl = items[idx]; if (!tpl) return;
  const id = `${tpl.type}_${Date.now().toString(36)}`;
  heldProp = { id, ...tpl, x: Math.floor(world.layout.w / 2), y: Math.floor(world.layout.h / 2), r: 0 };
  selectedPropId = id;
  const valid = world.canPlaceProp(heldProp, heldProp.id);
  stage.setGhost(heldProp, valid);
  sound.click();
  toast(`Selected ${tpl.label} — move cursor to position, click to place`);
}

function rotateHeld() {
  if (heldProp) {
    heldProp.r = ((heldProp.r || 0) + 1) % 4;
    stage.setGhost(heldProp, world.canPlaceProp(heldProp, heldProp.id));
    sound.click();
  } else if (selectedPropId) {
    const cur = world.props.get(selectedPropId);
    if (cur) {
      const newR = ((cur.r || 0) + 1) % 4;
      cmd({ t: 'moveProp', propId: selectedPropId, x: cur.x, y: cur.y, r: newR });
      saveLayout(world.layout.props);
      sound.click();
    }
  }
}

function removeHeldOrSelected() {
  const targetId = heldProp ? (world.props.has(heldProp.id) ? heldProp.id : null) : selectedPropId;
  if (targetId && world.props.has(targetId)) {
    cmd({ t: 'removeProp', propId: targetId });
    saveLayout(world.layout.props);
    sound.pop();
    toast('Prop removed from lounge');
  }
  heldProp = null; selectedPropId = null;
  stage.setGhost(null);
}

function resetLounge() {
  const key = (currentRoom === 'loft') ? LOFT_LAYOUT_KEY : ARCADE_LAYOUT_KEY;
  try {
    localStorage.removeItem(key);
    if (currentRoom === 'arcade') localStorage.removeItem(LEGACY_LAYOUT_KEY);
  } catch (e) {}
  location.reload();
}

// ---------- world events ----------
let unsubWorldEvents = null;
function bindWorldEvents(w) {
  if (unsubWorldEvents) {
    unsubWorldEvents();
    unsubWorldEvents = null;
  }
  const handler = e => {
    if (e.type === 'propPlaced' || e.type === 'propMoved' || e.type === 'propRemoved') saveCurrentLayout();
    if (e.type === 'denied' && e.id === 'me') { sound.deny(); toast('Someone is already there'); }
    if (e.type === 'use' && e.id === 'me') {
      const r = w.props.get(e.prop);
      if (r && r.type === 'claw') {
        openClawMachine(r.id);
      } else if (e.action === 'terminal') {
        if (r && r.type === 'portal') teleportTo(currentRoom === 'arcade' ? 'loft' : 'arcade');
        else openTerminal(r?.id);
      } else if (e.action === 'pc') {
        openLoftPC(r?.id);
      } else if (e.action === 'moonbase') {
        openMoonBase(r?.id);
      } else if (e.action === 'dress') {
        openDress();
      } else if (e.action === 'sit') sound.sit();
      else if (e.action === 'music') openJuke();
      else if (e.action === 'emote') { sound.coin(); toast('Snack time!'); cmd({ t: 'emote', name: 'cheer' }); }
      else if (e.action === 'food' || e.action === 'drink' || e.action === 'sleep' || e.action === 'scavenge') {
        const res = lifeSim.interact(e.action, r?.type, e.prop);
        if (res.text) toast(res.text);
        if (res.coins) { prof.coins += res.coins; persist(); updateWalletUI(); }
        if (res.tickets) { prof.tickets += res.tickets; persist(); updateWalletUI(); }
        if (res.morning) {
          sound.win();
          stage.setAtmosphere(lifeSim.getTimeBand());
        } else if (e.action === 'sleep') sound.sit(); else sound.coin();
      } else if (e.action === 'shop') {
        openPrizeShop();
      } else if (e.action === 'play') {
        sound.coin();
        const gid = r?.game || (r?.type === 'pool' ? 'pool' : r?.type === 'ludotable' ? 'ludo' : null);
        if (gid && GAMES[gid]) openGame(gid, r.id);
        else {
          toast((r?.T?.label || 'Game') + ' — coming soon. This is where a new game plugs in.');
          cmd({ t: 'emote', name: 'cheer' });
        }
      }
    }
    if (e.type === 'phaseChange') {
      sound.setTwilight(e.phase === 'twilight');
      if (e.phase === 'twilight') {
        sound.win();
        toast('✦ The Twilight Shift has begun... Room lighting shifts and cabinets glitch.');
      } else {
        sound.pop();
        toast('✦ Morning light returns to the lounge.');
      }
    }
    if (e.type === 'say') { sound.pop(); const p = w.people.get(e.id), l = document.createElement('div'); l.innerHTML = '<b></b> <span></span>'; l.firstChild.textContent = p ? p.name : '?'; l.lastChild.textContent = e.text; $('log').appendChild(l); while ($('log').children.length > 6) $('log').firstChild.remove(); setTimeout(() => l.remove(), 14000); }
  };
  w.on(handler);
  unsubWorldEvents = () => { if (w.off) w.off(handler); };
}
bindWorldEvents(world);

// ---------- input ----------
const cv = $('stage'); let down = null, hoverReq = null, isDraggingOrbit = false, nearestUse = null, nearestCitizen = null;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, btn: e.button };
  if (e.button === 2 || e.button === 1) {
    isDraggingOrbit = true;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  }
});
cv.addEventListener('pointerup', e => {
  if (isDraggingOrbit) {
    isDraggingOrbit = false;
    down = null;
    return;
  }
  if (!down || Math.hypot(e.clientX - down.startX, e.clientY - down.startY) > 8 || down.btn !== 0) {
    down = null;
    return;
  }
  down = null;
  sound._ctx();
  if (buildMode) {
    const pk = stage.pick(e.clientX, e.clientY, true);
    if (heldProp) {
      const valid = world.canPlaceProp(heldProp, heldProp.id);
      if (valid) {
        if (world.props.has(heldProp.id)) {
          cmd({ t: 'moveProp', propId: heldProp.id, x: heldProp.x, y: heldProp.y, r: heldProp.r });
          sound.click(); toast('Moved ' + (heldProp.label || heldProp.type));
        } else {
          cmd({ t: 'placeProp', prop: { ...heldProp } });
          sound.click(); toast('Placed ' + (heldProp.label || heldProp.type));
        }
        saveLayout(world.layout.props);
        heldProp = null; selectedPropId = null; stage.setGhost(null);
      } else { sound.deny(); toast('Cannot place here (blocked or out of bounds)'); }
      return;
    }
    if (pk.prop) {
      const r = world.props.get(pk.prop);
      if (r) {
        const orig = world.layout.props.find(p => p.id === pk.prop) || r;
        heldProp = { ...orig }; selectedPropId = pk.prop;
        stage.setHoverProp(null);
        stage.setGhost(heldProp, world.canPlaceProp(heldProp, heldProp.id));
        sound.pop(); toast('Moving ' + (r.T?.label || 'prop') + ' — R to rotate, Del to remove');
      }
      return;
    }
    return;
  }
  const pk = stage.pick(e.clientX, e.clientY);
  if (pk.prop) {
    const r = world.props.get(pk.prop), free = world.freeUses(u => u.prop === pk.prop);
    if (!r.uses.length) return;
    if (!free.length) { sound.deny(); toast('All spots taken'); return; }
    free.sort((a, b) => Math.hypot(a.tile.x - me.x, a.tile.y - me.y) - Math.hypot(b.tile.x - me.x, b.tile.y - me.y));
    if (cmd({ t: 'use', use: free[0].id })) { stage.setDest(free[0].tile.x + 0.5, free[0].tile.y + 0.5); sound.dest(); }
  } else if (pk.tile) { if (cmd({ t: 'move', x: pk.tile.fx, y: pk.tile.fy })) { const p = me.path.at(-1); if (p) stage.setDest(p.x, p.y); sound.dest(); } }
});
let ptr = null; cv.addEventListener('pointermove', e => {
  const oldPtr = ptr;
  ptr = { x: e.clientX, y: e.clientY };
  if (down && (down.btn === 2 || down.btn === 1 || isDraggingOrbit || (down.btn === 0 && !buildMode && Math.hypot(e.clientX - down.startX, e.clientY - down.startY) > 12))) {
    isDraggingOrbit = true;
    if (oldPtr) {
      const dx = e.clientX - oldPtr.x, dy = e.clientY - oldPtr.y;
      stage.orbit(dx * 0.005, dy * 0.004);
    }
    return;
  }
  if (buildMode) {
    const pk = stage.pick(e.clientX, e.clientY, true);
    if (heldProp && pk.tile) {
      if (heldProp.side === 'n') { heldProp.x = pk.tile.x; heldProp.y = 0; }
      else if (heldProp.side === 'w') { heldProp.x = 0; heldProp.y = pk.tile.y; }
      else { heldProp.x = pk.tile.x; heldProp.y = pk.tile.y; }
      stage.setGhost(heldProp, world.canPlaceProp(heldProp, heldProp.id));
    } else if (!heldProp && pk.prop) {
      stage.setHoverProp(pk.prop);
      const r = world.props.get(pk.prop);
      const tip = $('tip');
      tip.textContent = 'Click to move ' + (r?.T?.label || 'prop'); tip.style.display = 'block'; cv.style.cursor = 'pointer';
    } else if (!heldProp) {
      stage.setHoverProp(null); $('tip').style.display = 'none'; cv.style.cursor = 'default';
    }
    return;
  }
  hoverReq = ptr;
});
cv.addEventListener('pointerleave', () => { ptr = null; hoverReq = null; stage.setHoverProp(null); $('tip').style.display = 'none'; });
cv.addEventListener('wheel', e => { e.preventDefault(); stage.zoomBy(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
const keys = new Set(); let moveT = 0;

// ---------- Character Smartphone (GTA VI VicePhone) ----------
let phoneOpen = false;
function togglePhone(force) {
  phoneOpen = force !== undefined ? force : !phoneOpen;
  const dev = $('phoneDevice');
  const btn = $('phoneToggleBtn');
  if (dev) {
    dev.classList.toggle('open', phoneOpen);
    dev.classList.toggle('phoneClosed', !phoneOpen);
  }
  if (btn) btn.classList.toggle('active', phoneOpen);
  if (phoneOpen) {
    if (typeof sound.phoneOpen === 'function') sound.phoneOpen(); else sound.pop();
  } else {
    if (typeof sound.phoneClose === 'function') sound.phoneClose(); else sound.click();
  }
}
function closePhone() {
  if (phoneOpen) togglePhone(false);
}

addEventListener('keydown', e => {
  const typing = e.target.tagName === 'INPUT'; if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.key.toLowerCase();
  if (k === 'enter') { e.preventDefault(); $('chatIn').focus(); return; }
  if (k === 'escape') {
    if (phoneOpen) { closePhone(); return; }
    if (gameOpen) closeGame();
    if (clawOpen) closeClawMachine();
    if (shopOpen) closePrizeShop();
    if (termOpen) closeTerminal();
    if (termPcOpen) closeLoftPC();
    if (moonBaseOpen) closeMoonBase();
    if (mapOpen) closeMap();
    if (gigOpen) closeGigs();
    if (seedOpen) closeSeed();
    if (activeDiag) closeDialogue();
    $('juke').classList.add('hidden');
    closeDress();
    if (buildMode) {
      if (heldProp) { heldProp = null; stage.setGhost(null); }
      else setBuildMode(false);
    }
    return;
  }
  if (clawOpen) {
    if (k === ' ' || k === 'space' || k === 'spacebar') {
      e.preventDefault();
      if (clawGame) clawGame.dropClaw();
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(k)) {
      keys.add(k);
      updateClawKeyAim();
      return;
    }
    return;
  }
  if (shopOpen || termOpen || termPcOpen || mapOpen || gigOpen || seedOpen || activeDiag) return;
  if (k === 'p' || (k === 'arrowup' && !phoneOpen && !clawOpen && !buildMode)) {
    e.preventDefault();
    togglePhone();
    return;
  }
  if ((k === 'arrowdown' || k === 'p') && phoneOpen) {
    e.preventDefault();
    closePhone();
    return;
  }
  if (k === 'b') { closePhone(); setBuildMode(!buildMode); return; }
  if (buildMode) {
    if (k === 'r') { rotateHeld(); return; }
    if (k === 'delete' || k === 'backspace') { removeHeldOrSelected(); return; }
    return;
  }
  if (k === '1') { teleportTo('arcade'); return; }
  if (k === '2') { teleportTo('loft'); return; }
  if (k === '3') { teleportTo('moonbase'); return; }
  if (k === '4') { cmd({ t: 'emote', name: EMOTES[3] }); sound.pop(); return; }
  if (k === 'v') { toggleView(); return; }
  if (k === 'e' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (nearestUse) {
      if (cmd({ t: 'use', use: nearestUse.u.id })) {
        stage.setDest(nearestUse.u.tile.x + 0.5, nearestUse.u.tile.y + 0.5);
        sound.dest();
        return;
      }
    }
    stage.rotate(-1);
    return;
  }
  if (k === 'q') stage.rotate(1); else if (k === 'f') toggleFollow(); else if (k === 't') { cmd({ t: 'setPhase', phase: world.phase === 'twilight' ? 'normal' : 'twilight' }); } else keys.add(k);
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (clawOpen) updateClawKeyAim();
});
function keyMove(dt) {
  moveT -= dt; if (moveT > 0 || gameOpen || buildMode || clawOpen || shopOpen || termOpen || termPcOpen) return;
  const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0), r = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  if (!f && !r) return;
  const y = stage.yawTo, ux = -Math.sin(y), uz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
  let dx = ux * f + rx * r, dz = uz * f + rz * r; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  for (const reach of [1.6, 1.1]) if (cmd({ t: 'move', x: me.x + dx * reach, y: me.y + dz * reach }) && me.path.length) { moveT = 0.1; return; }
}

function toggleView(mode, notify = true) {
  const next = mode || (stage.camMode === '3d' ? 'iso' : '3d');
  stage.setCamMode(next);
  const btn = $('bView');
  if (btn) {
    btn.classList.toggle('on', next === '3d');
    const lbl = btn.querySelector('span');
    if (lbl) lbl.textContent = next === '3d' ? '3D' : 'ISO';
  }
  const pLbl = $('pAppViewLabel');
  if (pLbl) pLbl.textContent = next === '3d' ? '3D' : 'ISO';
  if (notify) toast(next === '3d' ? '✦ 3D Space View (Drag or WASD to explore)' : 'Classic Isometric View');
}

// ---------- HUD buttons ----------
$('bRotL').onclick = () => stage.rotate(1); $('bRotR').onclick = () => stage.rotate(-1);
$('bZin').onclick = () => stage.zoomBy(0.8); $('bZout').onclick = () => stage.zoomBy(1.25);
if ($('bView')) $('bView').onclick = () => toggleView();
let following = true; stage.follow('me'); $('bFollow')?.classList.add('on');
function toggleFollow() { following = !following; stage.follow(following ? 'me' : null); $('bFollow').classList.toggle('on', following); }
$('bFollow').onclick = toggleFollow;
$('bTravelArcade')?.addEventListener('click', () => teleportTo('arcade'));
$('bTravelLoft')?.addEventListener('click', () => teleportTo('loft'));
$('bTravelMoon')?.addEventListener('click', () => teleportTo('moonbase'));
if ($('bMyLoft')) {
  $('bMyLoft').onclick = () => teleportTo('loft');
}
$('bBuild').onclick = () => setBuildMode(!buildMode);
$('bBuildDone').onclick = () => setBuildMode(false);
$('bResetLounge').onclick = resetLounge;
$('buildHeader').onclick = e => {
  const tab = e.target.closest('.bTab');
  if (tab) {
    document.querySelectorAll('.bTab').forEach(t => t.classList.remove('on'));
    tab.classList.add('on'); activeCat = tab.dataset.cat; renderCatalog();
  }
};
$('catalogList').onclick = e => {
  const item = e.target.closest('.catItem');
  if (item) selectCatalogItem(+item.dataset.idx);
};
const QS = ['high', 'med', 'low']; let autoQ = !qParam;
function setQ(v, say) {
  quality = v; stage.setQuality(v);
  if ($('bQual')) { $('bQual').dataset.q = v; $('bQual').title = 'Graphics: ' + v; }
  const pQ = $('pAppQualLabel'); if (pQ) pQ.textContent = v.charAt(0).toUpperCase() + v.slice(1);
  try { localStorage.setItem(QKEY, v); } catch (e) { /* ignore */ }
  if (say) toast('Graphics: ' + v);
}
$('bQual').onclick = () => { autoQ = false; setQ(QS[(QS.indexOf(quality) + 1) % 3], true); };
if ($('bQual')) $('bQual').dataset.q = quality;
$('bMute').onclick = () => { sound.setMuted(!sound.muted); $('bMute').style.opacity = sound.muted ? 0.4 : 1; sound._ctx(); };
$('emotes').innerHTML = [['wave', 'Wave'], ['dance', 'Dance'], ['cheer', 'Cheer'], ['think', 'Think']].map(([k, l], i) => `<button data-e="${k}"><kbd>${i + 1}</kbd> ${l}</button>`).join('');
$('emotes').onclick = e => { const b = e.target.closest('button'); if (b && EMOTES.includes(b.dataset.e)) { cmd({ t: 'emote', name: b.dataset.e }); sound.pop(); } };
$('chat').onsubmit = e => { e.preventDefault(); const v = $('chatIn').value.trim(); if (v) cmd({ t: 'say', text: v }); $('chatIn').value = ''; $('chatIn').blur(); };

// ---------- Character Smartphone Trigger & App Bindings ----------
if ($('phoneToggleBtn')) $('phoneToggleBtn').onclick = () => togglePhone();
if ($('phoneHomeBar')) $('phoneHomeBar').onclick = () => closePhone();
if ($('pAppDress')) $('pAppDress').onclick = () => { closePhone(); openDress(); };
if ($('pAppBuild')) $('pAppBuild').onclick = () => { closePhone(); setBuildMode(!buildMode); };
if ($('pAppMap')) $('pAppMap').onclick = () => { closePhone(); openMap(); };
if ($('pAppGigs')) $('pAppGigs').onclick = () => { closePhone(); openGigs(); };
if ($('pAppView')) $('pAppView').onclick = () => toggleView();
if ($('pAppQual')) $('pAppQual').onclick = () => { autoQ = false; setQ(QS[(QS.indexOf(quality) + 1) % 3], true); };

// ---------- Miami Nights Radio HUD Widget Controls ----------
if ($('bRadio')) {
  $('bRadio').onclick = () => {
    initRadioOnGesture();
    const w = $('ytRadioWidget');
    if (w) {
      if (w.classList.contains('minimized')) {
        w.classList.remove('minimized');
      } else if (!radio.isPlaying) {
        radio.play();
      } else {
        w.classList.toggle('minimized');
      }
    }
  };
}
if ($('bYtPlay')) $('bYtPlay').onclick = () => { initRadioOnGesture(); radio.toggle(); };
if ($('bYtPrev')) $('bYtPrev').onclick = () => { initRadioOnGesture(); radio.prev(); };
if ($('bYtNext')) $('bYtNext').onclick = () => { initRadioOnGesture(); radio.next(); };
if ($('bYtMinimize')) $('bYtMinimize').onclick = () => $('ytRadioWidget')?.classList.toggle('minimized');
if ($('bYtToggleVideo')) $('bYtToggleVideo').onclick = () => $('ytPlayerHost')?.classList.toggle('hidden');
if ($('ytVolSlider')) $('ytVolSlider').oninput = e => radio.setVolume(+e.target.value);
if ($('bYtCustom')) $('bYtCustom').onclick = () => {
  const input = prompt('Enter YouTube Video URL or Video ID (e.g. dQw4w9WgXcQ):');
  if (input && input.trim()) {
    initRadioOnGesture();
    const ok = radio.loadCustomVideo(input.trim());
    if (ok) toast('Loading custom YouTube track...');
    else toast('Invalid YouTube URL or ID');
  }
};

// ---------- jukebox ----------
let jukeTab = 'miami';
renderJuke = function() {
  const list = $('jukeList');
  if (!list) return;
  $('bJukeTabMiami')?.classList.toggle('on', jukeTab === 'miami');
  $('bJukeTabSynth')?.classList.toggle('on', jukeTab === 'synth');

  if (jukeTab === 'miami') {
    list.innerHTML = radio.playlist.map((t, i) => {
      const active = radio.isPlaying && radio.trackIndex === i;
      return `<button data-yt="${i}" class="${active ? 'active' : ''}">
        <span>${active ? '▶ ' : ''}${t.artist} - ${t.title}</span>
        <span class="trackMood">${t.mood || 'SYNTH'}</span>
      </button>`;
    }).join('') + `<button data-action="stop">■ Turn Off Music</button>`;
  } else {
    list.innerHTML = TRACKS.map((t, i) => {
      const active = sound.track === i;
      return `<button data-synth="${i}" class="${active ? 'active' : ''}">
        <span>${active ? '▶ ' : ''}${t}</span>
        <span class="trackMood">CHIP</span>
      </button>`;
    }).join('') + `<button data-action="stop">■ Turn Off Music</button>`;
  }
};

function openJuke() {
  jukeOpen = true;
  renderJuke();
  $('juke').classList.remove('hidden');
}

function closeJuke() {
  jukeOpen = false;
  $('juke').classList.add('hidden');
  cmd({ t: 'stand' });
}

if ($('bJukeTabMiami')) $('bJukeTabMiami').onclick = () => { jukeTab = 'miami'; renderJuke(); sound.click(); };
if ($('bJukeTabSynth')) $('bJukeTabSynth').onclick = () => { jukeTab = 'synth'; renderJuke(); sound.click(); };

if ($('jukeList')) {
  $('jukeList').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    initRadioOnGesture();
    if (b.dataset.action === 'stop') {
      sound.stop();
      radio.pause();
      if (world.phase === 'twilight') cmd({ t: 'setPhase', phase: 'normal' });
    } else if (b.dataset.yt !== undefined) {
      const idx = +b.dataset.yt;
      sound.stop();
      radio.play(idx);
    } else if (b.dataset.synth !== undefined) {
      const idx = +b.dataset.synth;
      radio.pause();
      sound.play(idx);
      if (idx === 3) cmd({ t: 'setPhase', phase: 'twilight' });
      else if (world.phase === 'twilight') cmd({ t: 'setPhase', phase: 'normal' });
    }
    renderJuke();
  };
}
$('jukeClose').onclick = closeJuke;

// ---------- customizer ----------
const COLORKEYS = ['skin', 'hairColor', 'topColor', 'bottomColor', 'shoes'], LABEL = { skin: 'Skin', hair: 'Hair', hairColor: 'Hair colour', top: 'Top', topColor: 'Top colour', bottom: 'Bottom', bottomColor: 'Bottom colour', shoes: 'Shoes', accessory: 'Accessory', body: 'Build' };
function renderDress() {
  $('dressRows').innerHTML = Object.keys(OPTIONS).map(k => `<div class="opt"><label>${LABEL[k]}</label><div class="chips">${OPTIONS[k].map(v => COLORKEYS.includes(k)
    ? `<button class="sw ${me.loadout[k] === v ? 'sel' : ''}" data-k="${k}" data-v="${v}" style="background:${v}"></button>`
    : `<button class="chip ${me.loadout[k] === v ? 'sel' : ''}" data-k="${k}" data-v="${v}">${v}</button>`).join('')}</div></div>`).join('');
}
let wasFollowing = false;
function openDress() { wasFollowing = following; $('nameIn').value = me.name; renderDress(); $('dress').classList.remove('hidden'); stage.zoomTo = 5.2; following = true; stage.follow('me'); $('bFollow').classList.add('on'); }
function closeDress() { if ($('dress').classList.contains('hidden')) return; $('dress').classList.add('hidden'); stage.zoomTo = 12; if (!wasFollowing) { following = false; stage.follow(null); $('bFollow').classList.remove('on'); } persist(); }
function persist() { save({ name: me.name, loadout: me.loadout, coins: prof.coins, tickets: prof.tickets, inventory: prof.inventory }); }
$('bDress').onclick = () => $('dress').classList.contains('hidden') ? openDress() : closeDress();
$('dressRows').onclick = e => { const b = e.target.closest('button'); if (!b) return; const l = { ...me.loadout, [b.dataset.k]: b.dataset.v }; cmd({ t: 'loadout', loadout: l }); renderDress(); sound.click(); };
$('dressRand').onclick = () => { cmd({ t: 'loadout', loadout: randomLoadout() }); renderDress(); sound.click(); };
$('dressDone').onclick = closeDress;
$('nameIn').oninput = e => { me.name = e.target.value.slice(0, 14) || 'You'; const t = stage.tags.get('me'); if (t) t.el.querySelector('.nm').textContent = me.name; };

// ---------- main loop ----------
// ---------- main loop ----------
const getCabs = () => [...world.props.values()].filter(r => r.type === 'cabinet' || r.type === 'claw'); let slow = 16, slowT = 0, stepT = 0, blipT = 0;
let hoverT = 0, last = performance.now(), acc = 0, popT = 0, first = true;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
  while (acc >= 1 / 30) { world.step(1 / 30); acc -= 1 / 30; }
  keyMove(dt);
  if ((hoverT -= dt) < 0) { hoverT = 0.15; if (ptr) hoverReq = ptr; }
  if (hoverReq && !gameOpen) {
    const pk = stage.pick(hoverReq.x, hoverReq.y); hoverReq = null; stage.setHoverProp(pk.prop);
    const r = pk.prop && world.props.get(pk.prop), tip = $('tip');
    if (r && r.uses.length) { const free = world.freeUses(u => u.prop === pk.prop); tip.textContent = free.length ? verb(r, free[0]) : r.T.label + ' · full'; tip.style.display = 'block'; cv.style.cursor = 'pointer'; } else { tip.style.display = 'none'; cv.style.cursor = 'default'; }
  }
  // Life-sim progression & clock
  lifeSim.step(dt);
  const clkStr = lifeSim.getClockString();
  const clk = $('clockVal'); if (clk) clk.textContent = clkStr;
  const pTime = $('phoneTime'); if (pTime) pTime.textContent = clkStr;
  const bnd = $('bandVal');
  if (bnd) {
    const tb = lifeSim.getTimeBand();
    bnd.textContent = tb.label.toUpperCase();
    stage.setAtmosphere(tb);
    if (lifeSim.isTwilightHour() && world.phase !== 'twilight') {
      cmd({ t: 'setPhase', phase: 'twilight' });
    } else if (!lifeSim.isTwilightHour() && world.phase === 'twilight') {
      cmd({ t: 'setPhase', phase: 'normal' });
    }
  }
  const ve = $('valEnergy'); if (ve) ve.textContent = Math.round(lifeSim.vibes.energy);
  const vh = $('valHunger'); if (vh) vh.textContent = Math.round(lifeSim.vibes.hunger);
  const vf = $('valFun'); if (vf) vf.textContent = Math.round(lifeSim.vibes.fun);
  const vs = $('valSocial'); if (vs) vs.textContent = Math.round(lifeSim.vibes.social);

  // 3D proximity interaction prompt [E]
  let nearest = null;
  for (const r of world.props.values()) {
    if (!r.uses || !r.uses.length) continue;
    for (const u of r.uses) {
      const dist = Math.hypot(u.tile.x + 0.5 - me.x, u.tile.y + 0.5 - me.y);
      if (dist <= 1.8 && !world.occ.has(u.id)) {
        if (!nearest || dist < nearest.dist) nearest = { r, u, dist };
      }
    }
  }
  nearestUse = nearest;

  let nearestCit = null;
  if (!nearestUse && citizens.length) {
    for (const c of citizens) {
      const p = world.people.get(c.id);
      if (p) {
        const dist = Math.hypot(p.x - me.x, p.y - me.y);
        if (dist <= 2.2) {
          if (!nearestCit || dist < nearestCit.dist) nearestCit = { citizen: c, p, dist };
        }
      }
    }
  }
  nearestCitizen = nearestCit;

  const pE = $('promptE');
  if (pE) {
    if (!gameOpen && !clawOpen && !shopOpen && !termOpen && !termPcOpen && !moonBaseOpen && !buildMode && !mapOpen && !gigOpen && !seedOpen && !activeDiag) {
      if (nearestUse) {
        pE.innerHTML = `<kbd>E</kbd> <span>${verb(nearestUse.r, nearestUse.u)}</span>`;
        pE.classList.remove('hidden');
      } else if (nearestCitizen) {
        pE.innerHTML = `<kbd>E</kbd> <span>Talk to ${nearestCitizen.citizen.name} [${nearestCitizen.citizen.role}]</span>`;
        pE.classList.remove('hidden');
      } else {
        pE.classList.add('hidden');
      }
    } else {
      pE.classList.add('hidden');
    }
  }
  stage.music = (sound.track >= 0) || radio.isPlaying; stage.update(dt); stage.render();
  if (moonBaseOpen && moonBaseStage) {
    moonBaseStage.tick();
    const tEl = $('mbTimeDisplay');
    if (tEl) {
      const hours = Math.floor(moonBaseStage.timeOfDay * 24);
      const mins = Math.floor((moonBaseStage.timeOfDay * 24 % 1) * 60);
      tEl.textContent = `🕒 LUNAR T+ ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }
  }
  if (autoQ && now > 4000) { slow = slow * 0.97 + dt * 1000 * 0.03; if (slow > 42 && (slowT += dt) > 3 && quality !== 'low') { slowT = 0; slow = 16; setQ(quality === 'high' ? 'med' : 'low', true); } else if (slow <= 42) slowT = 0; }
  if (me.state === 'walk') { if ((stepT -= dt) < 0) { stepT = 0.31; sound.step(); } } else stepT = 0;
  if ((blipT -= dt) < 0) { blipT = 0.35 + Math.random() * 0.5; const cabs = getCabs(); const c = cabs[Math.floor(Math.random() * cabs.length)]; if (c) { const dx = c.cx - me.x, dz = c.cy - me.y, dist = Math.hypot(dx, dz), ry = stage.yaw; sound.blipAt([523, 659, 784, 880, 1047, 1319][Math.floor(Math.random() * 6)], dist, (dx * Math.cos(ry) - dz * Math.sin(ry)) / 10); } }
  if ((popT -= dt) < 0) { popT = 1; $('pop').textContent = world.people.size + (currentRoom === 'loft' ? ' in loft' : ' in lounge'); sound.ambience(); }
  if (first) {
    first = false;
    $('loading').style.opacity = 0;
    setTimeout(() => $('loading').remove(), 600);
    if (q.get('stage') === 'moonbase' || q.get('mode') === 'moonbase') {
      setTimeout(() => openMoonBase(), 400);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.G = { assets, get world() { return world; }, stage, sound, radio, MIAMI_PLAYLIST, cmd, get me() { return me; }, get currentRoom() { return currentRoom; }, switchRoom, teleportTo, openGame, closeGame, toast, GAMES, setBuildMode, resetLounge, CATALOG, openClawMachine, closeClawMachine, openPrizeShop, closePrizeShop, openTerminal, closeTerminal, openLoftPC, closeLoftPC, openMoonBase, closeMoonBase, openJuke, closeJuke, toggleView, prof, net, lifeSim, citizens, openMap, closeMap, openDialogue, closeDialogue, openGigs, closeGigs, openSeed, closeSeed };
