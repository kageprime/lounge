// Ludo · Club No.9 edition: controller + UI. Game rules live in rules.js, the die in dicetray.js, drawing in render.js.
import RAPIER from '@dimforge/rapier3d-compat';
import { Stage } from './render.js';
import { DieTray, TRAY } from './dicetray.js';
import { newGame, rollDie, applyMove, passTurn, SEAT, homeCount, isActive } from './rules.js';
import { chooseMove } from './ai.js';
import { COLOR_NAMES, COLOR_CSS, P_HOME } from './board.js';
import { Sound } from './audio.js';
import { CAMS, CAM_LABEL } from './cameras.js';
import { mulberry32 } from './rng.js';

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const G = window.G = {
  cfg: { seats: ['human', 'cpu', 'cpu', 'cpu'], diff: 'normal' },
  st: null, tray: null, stage: null, mode: 'menu', paused: false, run: 0, speed: 1, clock: 0,
  timers: [], waits: [], rollReq: null, charge: null, canRoll: false, pickMoves: null, pickResolve: null,
};
const audio = new Sound();
const seedBase = qs.has('seed') ? +qs.get('seed') : (Math.random() * 1e9) | 0;
let rng = mulberry32(seedBase), gameNo = 0;

class Cancel extends Error {}
// timers / waits run on game time (they pause with the game, speed up with fast-forward) and are cancelled on restart
const sleep = (s) => new Promise((res, rej) => G.timers.push({ t: s, res, rej }));
const until = (fn) => new Promise((res, rej) => G.waits.push({ fn, res, rej }));
function cancelAll() { for (const x of [...G.timers, ...G.waits]) x.rej(new Cancel()); G.timers = []; G.waits = []; }

// ------------------------------------------------------------------ menu
const DIFFS = ['easy', 'normal', 'hard'];
const PRESETS = {
  cpu: ['human', 'cpu', 'cpu', 'cpu'], duel: ['human', 'off', 'cpu', 'off'], local: ['human', 'off', 'human', 'off'],
  four: ['human', 'human', 'human', 'human'], watch: ['cpu', 'cpu', 'cpu', 'cpu'],
};
function renderMenu() {
  $('seats').innerHTML = G.cfg.seats.map((s, i) => `<div class="seat ${s === 'off' ? 'off' : ''}" data-i="${i}"><span class="sw" style="background:${COLOR_CSS[i]}"></span><span class="nm">${COLOR_NAMES[i].toUpperCase()}</span><span class="who ${s}">${s === 'human' ? 'HUMAN' : s === 'cpu' ? 'CPU' : 'EMPTY'}</span></div>`).join('');
  $('seats').querySelectorAll('.seat').forEach((el) => el.onclick = () => {
    const i = +el.dataset.i, order = ['human', 'cpu', 'off'], cur = G.cfg.seats[i];
    G.cfg.seats[i] = order[(order.indexOf(cur) + 1) % 3];
    if (G.cfg.seats.filter((x) => x !== 'off').length < 2) G.cfg.seats[i] = 'human';
    audio.unlock(); audio.play('tick'); renderMenu();
  });
  $('diffs').innerHTML = DIFFS.map((d) => `<button class="btn small ${G.cfg.diff === d ? 'on' : ''}" data-d="${d}">${d.toUpperCase()}</button>`).join('');
  $('diffs').querySelectorAll('button').forEach((b) => b.onclick = () => { G.cfg.diff = b.dataset.d; audio.unlock(); audio.play('tick'); renderMenu(); });
}
document.querySelectorAll('[data-preset]').forEach((b) => b.onclick = () => { G.cfg.seats = [...PRESETS[b.dataset.preset]]; audio.unlock(); audio.play('tick'); renderMenu(); });
$('start').onclick = () => { audio.unlock(); startGame(); };

// ------------------------------------------------------------------ HUD
const names = () => {
  const humans = G.st.seats.filter((s) => s === 'human').length;
  return G.st.seats.map((s, i) => (s === 'off' ? '' : s === 'cpu' ? `${COLOR_NAMES[i]}` : humans === 1 ? 'You' : COLOR_NAMES[i]));
};
let hudCache = {};
function setHtml(id, html) { if (hudCache[id] !== html) { hudCache[id] = html; $(id).innerHTML = html; } }
function updateHud() {
  const s = G.st; if (!s) return;
  setHtml('cards', s.seats.map((seat, c) => {
    if (seat === 'off') return '';
    const pips = s.tokens[c].map((p) => `<i class="pip ${p === P_HOME ? 'h' : p >= 0 ? 'b' : ''}"></i>`).join('');
    const who = seat === 'cpu' ? `CPU ${G.cfg.diff}` : 'HUMAN';
    return `<div class="pc ${s.turn === c && s.phase !== 'over' ? 'active' : ''}" style="--c:${COLOR_CSS[c]}"><div class="t"><span>${COLOR_NAMES[c].toUpperCase()}</span><small>${who}</small></div><div class="pips">${pips}</div></div>`;
  }).join(''));
  const c = s.turn, seat = s.seats[c], nm = COLOR_NAMES[c].toUpperCase();
  let what;
  if (s.phase === 'over') what = 'GAME OVER';
  else if (G.pickMoves) what = seat === 'human' ? 'PICK A PAWN' : 'CPU THINKING';
  else if (G.canRoll) what = 'YOUR THROW';
  else what = seat === 'cpu' ? 'CPU ROLLING' : 'ROLLING';
  setHtml('turn', `<span class="sw" style="background:${COLOR_CSS[c]}"></span><span>${nm}</span><small>${what}</small>`);
  const k = (x) => `<kbd>${x}</kbd>`;
  let h;
  if (G.canRoll) h = `${k('SPACE')} hold to charge, release to throw`;
  else if (G.pickMoves && seat === 'human') h = `${k('1')}-${k('4')} or click a glowing pawn to move it`;
  else h = '<span class="dim">&nbsp;</span>';
  setHtml('hints', `${h}<div class="dim">${k('C')} camera &nbsp; ${k('F')} fast &nbsp; ${k('M')} sound &nbsp; ${k('ESC')} pause</div>`);
  setHtml('camtag', `CAMERA <b>${CAM_LABEL[G.stage.rig.mode].toUpperCase()}</b>${G.speed > 1 ? ' &nbsp;<b>FAST</b>' : ''}`);
  $('turn').style.setProperty('--c', COLOR_CSS[c]);
}

let flashT = 0;
function flash(title, sub = '', color = '#ffb84a') {
  const el = $('flash'); el.hidden = false; el.style.color = color;
  el.innerHTML = `<div class="big">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}`;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; flashT = 1.6;
}

// ------------------------------------------------------------------ input: throwing
const POWER_SEGS = 14;
$('powerbar').innerHTML = '<i></i>'.repeat(POWER_SEGS);
function chargeStart() { if (!G.canRoll || G.charge || G.paused) return; G.charge = { t: 0 }; audio.unlock(); $('power').hidden = false; $('rollbtn').hidden = true; }
function chargeRelease() {
  if (!G.charge) return;
  const p = 0.22 + 0.78 * Math.min(1, G.charge.t / 0.9); G.charge = null; $('power').hidden = true;
  if (G.canRoll) { G.rollReq = p; G.canRoll = false; }
}
const rollBtn = $('rollbtn');
rollBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); rollBtn.setPointerCapture?.(e.pointerId); chargeStart(); });
rollBtn.addEventListener('pointerup', chargeRelease); rollBtn.addEventListener('pointercancel', chargeRelease);

// ------------------------------------------------------------------ input: picking a pawn
const dedupe = (moves) => { const seen = new Set(); return moves.filter((m) => { const k = m.enters ? 'in' : m.token; if (seen.has(k)) return false; seen.add(k); return true; }); };
function moveForToken(tok) {
  const ms = G.pickMoves; if (!ms) return null;
  const exact = ms.find((m) => m.token === tok);
  if (exact) return exact;
  return G.st.tokens[G.st.turn][tok] === -1 ? ms.find((m) => m.enters) || null : null;
}
function choose(m) { if (!m || !G.pickResolve) return; const r = G.pickResolve; G.pickResolve = null; audio.play('pick'); r(m); }
function ndcOf(e) { return { x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }; }
const cv = $('gl'); let drag = null;
cv.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (G.stage.rig.mode === 'orbit') { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture?.(e.pointerId); }
  if (G.pickMoves && G.st.seats[G.st.turn] === 'human' && !G.paused) {
    const pw = G.stage.pickPawn(ndcOf(e));
    if (pw && pw.c === G.st.turn) choose(moveForToken(pw.t));
  }
});
cv.addEventListener('pointermove', (e) => {
  if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; G.stage.rig.nudge(-dx * 0.006, dy * 0.004, 0); return; }
  if (G.pickMoves && G.st && G.st.seats[G.st.turn] === 'human') {
    const pw = G.stage.pickPawn(ndcOf(e)), ok = pw && pw.c === G.st.turn && moveForToken(pw.t);
    G.stage.setHover(ok ? pw.c : -1, ok ? pw.t : -1); cv.style.cursor = ok ? 'pointer' : 'default';
  } else if (cv.style.cursor !== 'default') { cv.style.cursor = 'default'; G.stage.setHover(-1, -1); }
});
cv.addEventListener('pointerup', () => { drag = null; });
cv.addEventListener('wheel', (e) => { if (G.stage.rig.mode === 'orbit') { G.stage.rig.nudge(0, 0, Math.sign(e.deltaY) * 0.08); e.preventDefault(); } }, { passive: false });

const keysDown = new Set();
addEventListener('keydown', (e) => {
  audio.unlock();
  const code = e.code;
  if (e.repeat && code !== 'ArrowLeft' && code !== 'ArrowRight' && code !== 'ArrowUp' && code !== 'ArrowDown') return;
  keysDown.add(code);
  if (G.mode === 'menu') { if (code === 'Enter' || code === 'Space') { e.preventDefault(); startGame(); } return; }
  if (G.mode === 'over') { if (code === 'Enter') startGame(); return; }
  if (code === 'Escape' || code === 'KeyP') { togglePause(); return; }
  if (G.paused) return;
  if (code === 'Space') { e.preventDefault(); chargeStart(); return; }
  const m = /^(?:Digit|Numpad)([1-4])$/.exec(code);
  if (m && G.pickMoves && G.st.seats[G.st.turn] === 'human') { choose(moveForToken(+m[1] - 1)); return; }
  if (code === 'KeyC') { G.stage.rig.next(); audio.play('tick'); }
  else if (code === 'KeyM') { audio.setMuted(!audio.muted); flash(audio.muted ? 'SOUND OFF' : 'SOUND ON', '', '#8d92a8'); }
  else if (code === 'KeyF') { G.speed = G.speed > 1 ? 1 : 2.2; G.stage.speed = G.speed; }
  else if (code === 'BracketLeft') G.stage.rig.nudge(0, 0, -0.1);
  else if (code === 'BracketRight') G.stage.rig.nudge(0, 0, 0.1);
  else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(code)) {
    if (G.stage.rig.mode !== 'orbit') G.stage.rig.set('orbit');
    G.stage.rig.nudge(code === 'ArrowLeft' ? -0.06 : code === 'ArrowRight' ? 0.06 : 0, code === 'ArrowUp' ? 0.04 : code === 'ArrowDown' ? -0.04 : 0, 0);
  }
});
addEventListener('keyup', (e) => { keysDown.delete(e.code); if (e.code === 'Space') chargeRelease(); });
addEventListener('blur', () => { G.charge = null; $('power').hidden = true; if (G.canRoll) $('rollbtn').hidden = false; });
addEventListener('resize', () => G.stage?.resize());

function togglePause(force) {
  if (G.mode !== 'play') return;
  G.paused = force ?? !G.paused; $('pause').hidden = !G.paused;
  if (G.paused) { G.charge = null; $('power').hidden = true; }
}
$('p-resume').onclick = () => togglePause(false);
$('p-restart').onclick = () => { togglePause(false); startGame(); };
$('p-menu').onclick = () => { togglePause(false); toMenu(); };
$('o-again').onclick = () => startGame();
$('o-menu').onclick = () => toMenu();

// ------------------------------------------------------------------ game flow
function toMenu() {
  G.run++; cancelAll(); G.mode = 'menu'; G.st = null; G.pickMoves = G.pickResolve = null; G.canRoll = false; G.charge = null;
  ['hud', 'over', 'pause', 'dietag'].forEach((id) => { $(id).hidden = true; });
  $('menu').hidden = false; renderMenu();
  G.stage.setAllP([[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]]); G.stage.setSelectable([]); G.stage.setActive([0, 1, 2, 3]);
}

function startGame() {
  G.run++; cancelAll(); gameNo++;
  G.tray?.dispose(); G.tray = new DieTray(RAPIER, { seed: (seedBase + gameNo * 7919) | 0 });
  rng = mulberry32((seedBase ^ (gameNo * 2654435761)) >>> 0);
  const seats = [...G.cfg.seats], active = seats.map((s, i) => (s !== 'off' ? i : -1)).filter((i) => i >= 0);
  G.st = newGame(seats, qs.has('first') ? +qs.get('first') : active[Math.floor(Math.random() * active.length)]);
  G.mode = 'play'; G.paused = false; G.pickMoves = G.pickResolve = null; G.canRoll = false; G.charge = null; G.rollReq = null; hudCache = {};
  ['menu', 'over', 'pause'].forEach((id) => { $(id).hidden = true; });
  $('hud').hidden = false; $('flash').hidden = true; $('dietag').hidden = true;
  const s = G.st;
  G.stage.setAllP(s.tokens); G.stage.setSelectable([]); G.stage.setActive(active); G.stage.setDie(null);
  if (G.stage.rig.mode === 'orbit' && G.menuOrbit) G.stage.rig.set('auto');
  G.stage.phase = 'roll';
  const my = G.run;
  playGame(my).catch((e) => { if (!(e instanceof Cancel)) { console.error(e); G.error = String(e && e.stack || e); } });
  audio.play('turn');
}

async function throwAndRead(power) {
  const tray = G.tray;
  $('dietag').hidden = true;
  tray.throwDie(power); audio.play('throw'); G.stage.phase = 'roll';
  await until(() => tray.phase === 'ready');
  return tray.face;
}

async function humanRoll() {
  G.canRoll = true; G.rollReq = null; $('rollbtn').hidden = false;
  await until(() => G.rollReq != null);
  $('rollbtn').hidden = true;
  return G.rollReq;
}

async function humanPick(moves) {
  G.pickMoves = moves; G.stage.setSelectable(moves);
  const m = await new Promise((res, rej) => { G.pickResolve = res; G.timers.push({ t: 1e9, res: () => {}, rej }); });
  return m;
}

async function playGame(run) {
  const s = G.st, stage = G.stage;
  stage.onHop = (step, pw) => audio.play('hop', { step });
  while (s.phase !== 'over') {
    const seat = s.seats[s.turn];
    stage.setTurnColor(s.turn); stage.phase = 'roll'; updateHud();
    if (s.phase === 'roll') {
      let power;
      if (seat === 'human') power = await humanRoll();
      else { await sleep(0.75); power = 0.45 + rng() * 0.55; }
      const face = await throwAndRead(power);
      await sleep(0.3);
      const ph = rollDie(s, face);
      G.lastRoll = { face, by: s.turn };
      updateHud();
      if (face === 6 && ph !== 'forfeit') audio.play('six');
      if (ph === 'forfeit') {
        flash('THREE SIXES!', 'the turn is lost', '#ff6a5a'); audio.play('nomove'); stage.doFlash(0xff3020, 0.25);
        await sleep(1.7); passTurn(s); continue;
      }
      if (ph === 'nomove') {
        flash('NO MOVE', face === 6 ? '' : 'a 6 is needed to leave the yard', '#8d92a8'); audio.play('nomove');
        await sleep(1.3); passTurn(s); continue;
      }
    }
    if (s.phase === 'pick') {
      await sleep(0.6);
      stage.phase = 'play';
      const moves = dedupe(s.moves);
      let m;
      if (moves.length === 1) { stage.setSelectable(moves); G.pickMoves = null; await sleep(0.7); m = moves[0]; }
      else if (seat === 'human') { m = await humanPick(moves); }
      else { stage.setSelectable(moves); await sleep(0.9); m = chooseMove(s, s.moves, G.cfg.diff, rng); }
      G.pickMoves = null; G.pickResolve = null; stage.setSelectable([]); stage.setHover(-1, -1);
      await doMove(m);
    }
  }
  await sleep(0.9);
  showOver();
}

async function doMove(m) {
  const s = G.st, stage = G.stage, c = m.color;
  await stage.movePawn(c, m.token, m.from, m.to);
  const r = applyMove(s, m);
  audio.play('place');
  if (m.captures.length) {
    audio.play('capture'); stage.doFlash(0xff3020, 0.3);
    flash('CAPTURED!', `${COLOR_NAMES[c]} sends ${m.captures.map((v) => COLOR_NAMES[v.color]).join(' & ')} home`, '#ff6a5a');
    await Promise.all(m.captures.map((v) => stage.sendHome(v.color, v.token)));
  }
  if (m.finishes) { audio.play('home'); if (!r.won) flash('HOME!', 'a pawn made it', '#5fe08a'); }
  updateHud();
  if (r.won) { audio.play('win'); flash(`${COLOR_NAMES[c].toUpperCase()} WINS!`, '', COLOR_CSS[c]); return; }
  if (r.bonus) {
    if (!m.captures.length && !m.finishes) flash('ROLL AGAIN', s.die === 6 ? 'a six!' : '', '#ffb84a');
    await sleep(0.55);
  } else await sleep(0.25);
}

function showOver() {
  const s = G.st; G.mode = 'over';
  const w = s.winner, nm = names();
  $('over-title').innerHTML = `<span style="color:${COLOR_CSS[w]}">${COLOR_NAMES[w].toUpperCase()}</span> WINS`;
  const rows = s.seats.map((seat, c) => (seat === 'off' ? null : c)).filter((c) => c != null).sort((a, b) => (b === w) - (a === w) || homeCount(s, b) - homeCount(s, a));
  $('over-stats').innerHTML = `<div class="os hd"><span></span><span></span><span>HOME</span><span>HITS</span><span>HIT</span><span>SIXES</span></div>` + rows.map((c) => {
    const st = s.stats[c];
    return `<div class="os ${c === w ? 'win' : ''}"><span class="sw" style="background:${COLOR_CSS[c]}"></span><span>${(nm[c] || COLOR_NAMES[c]).toUpperCase()}</span><span>${homeCount(s, c)}/4</span><span>${st.captures}</span><span>${st.captured}</span><span>${st.sixes}</span></div>`;
  }).join('');
  $('over').hidden = false; $('hud').hidden = true; $('dietag').hidden = true;
  // Standard lounge result contract (only meaningful when embedded). Ranked = exactly one human vs CPUs.
  if (window.parent && window.parent !== window) {
    const humans = s.seats.filter((x) => x === 'human').length, cpus = s.seats.filter((x) => x === 'cpu').length;
    try {
      window.parent.postMessage({
        type: 'game_result', game: 'ludo', mode: humans === 1 ? 'vs_cpu' : 'hotseat',
        ranked: humans === 1 && cpus >= 1, won: s.seats[w] === 'human' && humans === 1
      }, '*');
    } catch (e) { /* standalone */ }
  }
}

// ------------------------------------------------------------------ per-frame
const tagEls = [];
function placeTags() {
  const stage = G.stage, ms = G.pickMoves && G.st.seats[G.st.turn] === 'human' && !G.paused ? G.pickMoves : [];
  const tags = $('tags');
  while (tagEls.length < 4) { const el = document.createElement('div'); el.className = 'ptag'; el.hidden = true; tags.appendChild(el); tagEls.push(el); }
  tagEls.forEach((el, i) => {
    const m = ms[i]; if (!m) { el.hidden = true; return; }
    const pw = stage.pawn(m.color, m.token), p = stage.project(pw.grp.position.clone().add({ x: 0, y: 0.08, z: 0 }));
    el.hidden = !p.ok; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    const lab = String(m.enters ? (m.token + 1) : (m.token + 1)); if (el.textContent !== lab) el.textContent = lab;
  });
  // the number on the die
  const dt = $('dietag'), tray = G.tray;
  const shown = tray && (tray.phase === 'ready' || tray.phase === 'tidy') ? (tray.face || tray._tween?.face || 0) : 0;
  if (shown && G.mode === 'play' && !G.paused) {
    const snap = tray.snapshot(), p = stage.project(stage.trayLocal(snap.x, 0.1, snap.z));
    dt.hidden = false; dt.style.left = p.x + 'px'; dt.style.top = p.y + 'px'; dt.style.setProperty('--c', COLOR_CSS[G.lastRollColor ?? G.st.turn]);
    if (dt.dataset.f !== String(shown)) { dt.dataset.f = shown; dt.innerHTML = shown; dt.style.animation = 'none'; void dt.offsetWidth; dt.style.animation = ''; }
  } else if (!dt.hidden && !(tray && tray.phase === 'ready')) { dt.hidden = true; dt.dataset.f = ''; }
  if (!shown) { dt.hidden = true; dt.dataset.f = ''; }
}

let last = performance.now(), lastHits = 0, lastPhase = 'idle';
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - last) / 1000); last = now;
  const stage = G.stage; if (!stage) return;
  const dt = G.paused ? 0 : raw * G.speed;
  G.clock += dt;
  if (G.mode === 'menu') {                       // slow drifting camera behind the menu
    const o = stage.rig.orbit; stage.rig.mode = 'orbit'; G.menuOrbit = true;
    o.yaw = Math.sin(G.clock * 0.18) * 0.55; o.pitch = 0.78; o.dist = 1.55;
  } else if (G.menuOrbit) { G.menuOrbit = false; stage.rig.mode = 'auto'; }
  // timers and waits
  for (const x of G.timers) x.t -= dt;
  const due = G.timers.filter((x) => x.t <= 0); G.timers = G.timers.filter((x) => x.t > 0); due.forEach((x) => x.res());
  const ready = G.waits.filter((x) => x.fn()); G.waits = G.waits.filter((x) => !x.fn()); ready.forEach((x) => x.res());
  // power meter
  if (G.charge && !G.paused) {
    G.charge.t += raw; const u = Math.min(1, G.charge.t / 0.9), n = Math.round(u * POWER_SEGS);
    const segs = $('powerbar').children; for (let i = 0; i < POWER_SEGS; i++) segs[i].className = i < n ? 'on' : '';
    $('powerbar').style.setProperty('--c', u > 0.8 ? '#ff6a5a' : u > 0.45 ? '#ffb84a' : '#5fe08a');
    if (G.charge.t > 1.6) chargeRelease();
  }
  // die physics + sounds
  if (G.tray) {
    G.tray.step(dt);
    stage.setDie(G.tray.snapshot());
    if (G.tray.hits > lastHits) { audio.play('hit', { gain: 0.8 }); }
    lastHits = G.tray.hits;
    if (lastPhase === 'rolling' && G.tray.phase === 'tidy') audio.play('land');
    lastPhase = G.tray.phase;
  }
  if (G.st && G.mode !== 'menu') G.lastRollColor = G.lastRoll?.by ?? G.st.turn;
  if (flashT > 0) { flashT -= raw; if (flashT <= 0) $('flash').hidden = true; }
  stage.update(G.paused ? 0 : raw);
  const fx = $('flashfx'); fx.style.opacity = stage.flash; fx.style.background = '#' + stage.flashColor.getHexString();
  if (G.mode === 'play') { updateHud(); } 
  placeTags();
  stage.render();
}

// ------------------------------------------------------------------ boot
async function boot() {
  await RAPIER.init();
  G.stage = new Stage($('gl')).init();
  G.start = (seats, diff) => { if (seats) G.cfg.seats = seats; if (diff) G.cfg.diff = diff; startGame(); };
  G.toMenu = toMenu; G.showOver = showOver; G.togglePause = togglePause; G.choose = choose; G.chargeStart = chargeStart; G.chargeRelease = chargeRelease;
  toMenu();
  $('loading').hidden = true;
  requestAnimationFrame(frame);
  if (qs.has('demo')) { G.cfg.seats = qs.get('demo') === 'cpu' ? [...PRESETS.watch] : [...PRESETS.cpu]; startGame(); }
}
boot().catch((e) => { console.error(e); $('loading').innerHTML = 'Failed to start:<br>' + String(e.message || e); });
