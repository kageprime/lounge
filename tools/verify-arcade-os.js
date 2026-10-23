import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const srvPort = 8129;
const cdpPort = 9289;
const outDir = 'C:\\Users\\kage\\.gemini\\antigravity\\brain\\838dddab-33ae-4872-b56e-006966b20bd0';

const srv = spawn(process.execPath, ['serve.mjs', String(srvPort)], {
  env: { ...process.env, ECON_FAST: '1', LOUNGE_DB: ':memory:' },
  stdio: 'ignore'
});

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  await wait(1200);
  const browser = spawn(EDGE, [
    '--headless=new',
    '--remote-debugging-port=' + cdpPort,
    '--window-size=1280,800',
    `http://localhost:${srvPort}/index.html`
  ], { stdio: 'ignore' });

  try {
    await wait(3200);
    const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
    const tabs = await listRes.json();
    const tab = tabs.find(t => t.url.includes('/index.html')) || tabs.find(t => t.type === 'page');
    if (!tab) throw new Error('No browser tab found');

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let seq = 1;
    function send(method, params = {}) {
      return new Promise(resolve => {
        const cur = seq++;
        const h = evt => {
          const res = JSON.parse(evt.data);
          if (res.id === cur) { ws.removeEventListener('message', h); resolve(res.result); }
        };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id: cur, method, params }));
      });
    }

    async function evalJS(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return r?.result?.value;
    }

    async function screenshot(file) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot?.data) {
        fs.writeFileSync(path.join(outDir, file), Buffer.from(shot.data, 'base64'));
      }
    }

    await send('Runtime.enable');
    await send('Page.enable');

    const errors = [];
    ws.addEventListener('message', evt => {
      const d = JSON.parse(evt.data);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
        errors.push(d.params.args.map(a => a.value ?? a.description).join(' '));
      }
      if (d.method === 'Runtime.exceptionThrown') {
        errors.push('EXCEPTION: ' + JSON.stringify(d.params.exceptionDetails));
      }
    });

    await wait(2500);

    // 1. Verify HUD + Verified Ledger connection
    const hudCheck = await evalJS(`({
      coins: Number(document.getElementById('coinVal')?.textContent),
      tickets: Number(document.getElementById('ticketVal')?.textContent),
      levelChip: !!document.querySelector('#hudLevelChip .lvChip'),
      authBadge: document.getElementById('arcadeAuthBadge')?.textContent
    })`);
    console.log('1. Initial HUD & Ledger State:', hudCheck);

    // 2. Set a cool streetwear loadout on 'me' and open Holographic 3D Player Card + Full-Body Stage
    await evalJS(`window.G.cmd({ t: 'loadout', loadout: { skin: '#a5673f', hair: 'fade', hairColor: '#201814', top: 'hoodie', topColor: '#35e0c9', bottom: 'jeans', bottomColor: '#2f4a8a', shoes: '#f2f2f2', accessory: 'headphones', body: 'regular' } })`);
    const inspectId = await evalJS(`[...window.G.world.people.values()].find(p => p.id !== 'me')?.id || 'me'`);
    await evalJS(`window.G.openPlayerCard(${JSON.stringify(inspectId)})`);
    await wait(300);
    await evalJS(`document.querySelector('#cardEmoteBar [data-card-emote="wave"]')?.click()`);
    await wait(450);
    await screenshot('phase1_player_card.png');
    const cardCheck = await evalJS(`({
      cardVisible: !document.getElementById('cardModal').classList.contains('hidden'),
      hasPortrait: !!document.querySelector('#cardModal .pcPortrait img')?.getAttribute('src')?.startsWith('data:image/png'),
      hasFullBodyCanvas: !!document.getElementById('cardAvatarCanvas'),
      emoteBubble: document.getElementById('cardAvatarBubble')?.textContent,
      tierClass: document.querySelector('#cardModal .pCard')?.className
    })`);
    console.log('2. Holographic Player Card:', cardCheck);
    await evalJS(`window.G.closePlayerCard()`);
    await wait(300);

    // 3. Open Unified Arcade OS Hub -> Contests & Pots, create a 25-coin Pool Showdown
    await evalJS(`window.G.openArcadeOS('contests')`);
    await wait(400);
    await evalJS(`document.getElementById('bCreatePoolCup')?.click()`);
    await wait(600);
    await screenshot('phase2_arcade_os_contests.png');
    const contestCheck = await evalJS(`({
      arcadeOpen: !document.getElementById('arcadeModal').classList.contains('hidden'),
      contestRows: document.querySelectorAll('#arcContestList .arcContestRow').length
    })`);
    console.log('3. Arcade OS Contests Tab:', contestCheck);
    await evalJS(`window.G.closeArcadeOS()`);
    await wait(300);

    // 4. Walk-up to Ludo table -> verify NO premature VS splash before menu
    await evalJS(`window.G.openGame('ludo', 'ludo0')`);
    await wait(250);
    const walkupCheck = await evalJS(`({
      vsVisibleOnWalkup: !document.getElementById('vsOverlay').classList.contains('hidden')
    })`);
    console.log('4a. Walk-up Table Access (No Premature VS):', walkupCheck);
    await evalJS(`window.G.closeGame()`);
    await wait(400);

    // 4b. Tap Obi (NPC in lounge) and click "Challenge Ludo vs Obi" -> VS Splash + Direct Boot (Menu Skipped!)
    const obiId = await evalJS(`[...window.G.world.people.values()].find(p => p.id !== 'me')?.id`);
    await evalJS(`window.G.openPlayerCard(${JSON.stringify(obiId)})`);
    await wait(200);
    await evalJS(`document.getElementById('bCardChallengeLudo')?.click()`);
    await wait(450);
    await screenshot('phase1_vs_splash.png');
    const vsCheck = await evalJS(`({
      vsVisible: !document.getElementById('vsOverlay').classList.contains('hidden'),
      vsCards: document.querySelectorAll('#vsOverlay .pCard').length,
      vsSubtitle: document.querySelector('#vsOverlay .vsSub')?.textContent
    })`);
    console.log('4b. Challenge VS Walk-out Splash:', vsCheck);

    // Wait for Ludo iframe to finish booting and verify #menu is hidden & mode === 'play'
    await wait(2200);
    await screenshot('ludo_direct_challenge_boot.png');
    const ludoBootCheck = await evalJS(`({
      ludoMode: document.getElementById('gameFrame')?.contentWindow?.G?.mode,
      ludoMenuHidden: document.getElementById('gameFrame')?.contentWindow?.document?.getElementById('menu')?.hidden,
      ludoCardsText: document.getElementById('gameFrame')?.contentWindow?.document?.getElementById('cards')?.textContent
    })`);
    console.log('4c. Ludo Direct Boot (No Menu):', ludoBootCheck);

    // Post a ranked victory result
    await evalJS(`window.postMessage({ type: 'game_result', game: 'ludo', won: true, ranked: true }, '*')`);
    await wait(1100);
    await screenshot('phase1_victory_ceremony.png');
    const resCheck = await evalJS(`({
      ceremonyVisible: !document.getElementById('resultOverlay').classList.contains('hidden'),
      title: document.querySelector('#resultOverlay .resTitle')?.textContent,
      coinsAfter: Number(document.getElementById('coinVal')?.textContent),
      ticketsAfter: Number(document.getElementById('ticketVal')?.textContent),
      xpAfter: window.G.prog.xp
    })`);
    console.log('5. Victory Result Ceremony & Ledger Payout:', resCheck);
    await evalJS(`document.getElementById('resultOverlay').classList.add('hidden'); window.G.closeGame();`);
    await wait(450);

    // 6. Connect a second live WebSocket peer ("Rival Kemi") and send a live 1v1 Pool Challenge
    const peerWs = new WebSocket(`ws://localhost:${srvPort}/ws`);
    await new Promise((res, rej) => { peerWs.onopen = res; peerWs.onerror = rej; });
    const peerMsgs = [];
    peerWs.addEventListener('message', ev => { try { peerMsgs.push(JSON.parse(ev.data)); } catch (_) {} });
    peerWs.send(JSON.stringify({ t: 'join', person: { name: 'Rival Kemi', loadout: { skin: '#7a4a2c', hair: 'locs', hairColor: '#201814', top: 'bomber', topColor: '#ff4d6d', bottom: 'cargo', bottomColor: '#2b2f44', shoes: '#ffd166', accessory: 'glasses', body: 'regular' } } }));
    peerWs.send(JSON.stringify({ t: 'auth', rid: 'r1', name: 'Rival Kemi' }));
    await wait(350);

    // Get the browser client's peer id from welcome message or world
    const browserClientId = await evalJS(`window.G.net.clientId`);
    peerWs.send(JSON.stringify({ t: 'match.challenge', rid: 'r2', game: 'pool', toClientId: browserClientId }));
    await wait(450);

    const chalBannerVisible = await evalJS(`!document.getElementById('challengeBanner').classList.contains('hidden')`);
    console.log('6. Live Challenge Banner Visible:', chalBannerVisible);

    // Click Accept Challenge in the browser
    await evalJS(`document.getElementById('bAcceptChal')?.click()`);
    await wait(500);
    await screenshot('phase3_live_1v1_match.png');

    // Wait for Pool iframe to load and receive mp_init
    await wait(1600);
    const liveMatchCheck = await evalJS(`({
      gameOpen: !document.getElementById('game').classList.contains('hidden'),
      gameTitle: document.getElementById('gameTitle')?.textContent,
      iframeOnlineMode: document.getElementById('gameFrame')?.contentWindow?.poolApp?.onlineMode,
      iframeSeat: document.getElementById('gameFrame')?.contentWindow?.poolApp?.mySeat
    })`);
    console.log('7. Live 1v1 Pool Match Synced in Iframe:', liveMatchCheck);
    peerWs.close();

    console.log('Console errors:', errors.length ? errors : 'NONE');
    ws.close();
    if (errors.length > 0) process.exitCode = 1;
  } finally {
    try { browser.kill(); } catch (_) {}
    try { srv.kill(); } catch (_) {}
  }
}

run().catch(err => {
  console.error(err);
  try { srv.kill(); } catch (_) {}
  process.exit(1);
});
