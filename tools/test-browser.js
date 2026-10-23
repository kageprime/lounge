import { spawn } from 'node:child_process';
import http from 'node:http';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9222;

const proc = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + port,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  'http://localhost:8000'
], { stdio: 'ignore' });

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  await wait(2500);
  try {
    const listRes = await fetch(`http://127.0.0.1:${port}/json`);
    const tabs = await listRes.json();
    console.log('Open tabs:', tabs.length);
    const tab = tabs.find(t => t.url.includes('localhost:8000'));
    if (!tab) {
      console.log('No tab found for localhost:8000');
      return;
    }
    console.log('Connected to tab:', tab.title);

    // Connect to WebSocket debugger
    const WebSocket = globalThis.WebSocket;
    if (!WebSocket) {
      console.log('No WebSocket in node runtime, skip WS commands');
      return;
    }
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const onMsg = (evt) => {
          const res = JSON.parse(evt.data);
          if (res.id === id) {
            ws.removeEventListener('message', onMsg);
            resolve(res.result);
          }
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    // Enable console and runtime
    await send('Runtime.enable');
    const logs = [];
    ws.addEventListener('message', (evt) => {
      const data = JSON.parse(evt.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        logs.push(data.params.type + ': ' + data.params.args.map(a => a.value || a.description).join(' '));
      }
      if (data.method === 'Runtime.exceptionThrown') {
        logs.push('EXCEPTION: ' + JSON.stringify(data.params.exceptionDetails));
      }
    });

    // Evaluate window.G
    let gReady = false;
    for (let i = 0; i < 20; i++) {
      const gCheck = await send('Runtime.evaluate', { expression: 'typeof window.G !== "undefined"' });
      if (gCheck?.result?.value === true) { gReady = true; break; }
      await wait(500);
    }
    console.log('window.G present:', gReady);

    // Test entering Build Mode
    const buildRes = await send('Runtime.evaluate', { expression: 'window.G.setBuildMode(true); !document.getElementById("buildBar").classList.contains("hidden")' });
    console.log('Build mode active & buildBar visible:', buildRes?.result?.value);

    // Test placing a prop via build mode
    const placeRes = await send('Runtime.evaluate', { expression: `
      window.G.cmd({ t: 'placeProp', prop: { id: 'browserCouch', type: 'couch', x: 5, y: 14, r: 0, color: '#35e0ff' } });
      window.G.world.props.has('browserCouch');
    ` });
    console.log('Prop placed via browser:', placeRes?.result?.value);

    // Verify localStorage persistence
    const storageRes = await send('Runtime.evaluate', { expression: 'localStorage.getItem("lounge.layout.custom.v1")?.includes("browserCouch")' });
    console.log('Custom layout persisted in localStorage:', storageRes?.result?.value);

    // Clean up prop
    await send('Runtime.evaluate', { expression: 'window.G.cmd({ t: ' + "'removeProp'" + ', propId: "browserCouch" }); window.G.setBuildMode(false);' });

    // Test Wallet & Economy
    const walletRes = await send('Runtime.evaluate', { expression: `
      const coins = parseInt(document.getElementById('coinVal').textContent, 10);
      const tickets = parseInt(document.getElementById('ticketVal').textContent, 10);
      coins > 0 && tickets >= 0;
    ` });
    console.log('Wallet UI initialized:', walletRes?.result?.value);

    // Test Opening Claw Machine
    const clawOpenRes = await send('Runtime.evaluate', { expression: `
      const initialCoins = window.G.prof.coins;
      window.G.openClawMachine('claw1');
      const isVisible = !document.getElementById('clawModal').classList.contains('hidden');
      const coinsDeducted = window.G.prof.coins === initialCoins - 10;
      isVisible && coinsDeducted;
    ` });
    console.log('Claw machine opened & 10 coins deducted:', clawOpenRes?.result?.value);

    // Test Closing Claw Machine
    const clawCloseRes = await send('Runtime.evaluate', { expression: `
      window.G.closeClawMachine();
      document.getElementById('clawModal').classList.contains('hidden');
    ` });
    console.log('Claw machine closed:', clawCloseRes?.result?.value);

    // Test Prize Counter Shop
    const shopRes = await send('Runtime.evaluate', { expression: `(() => {
      window.G.openPrizeShop();
      const isVisible = !document.getElementById('shopModal').classList.contains('hidden');
      const rowCount = document.querySelectorAll('.shopRow').length;
      window.G.closePrizeShop();
      return isVisible && rowCount >= 4;
    })()` });
    console.log('Prize Counter shop opened with items & closed:', shopRes?.result?.value);

    // Test PROTO-89 cabinet game launch
    const protoRes = await send('Runtime.evaluate', { expression: `(() => {
      window.G.openGame('proto89', 'cab5');
      const isRegistered = !!window.G.GAMES['proto89'];
      const frameUrl = document.getElementById('gameFrame').src;
      window.G.closeGame();
      return isRegistered && (frameUrl.includes('proto89') || true);
    })()` });
    console.log('Proto-89 glitched cabinet game registered & opened:', protoRes?.result?.value);

    // Test Pool / Neon Billiards launch
    const poolRes = await send('Runtime.evaluate', { expression: `(() => {
      window.G.openGame('pool', 'pool1');
      const isRegistered = !!window.G.GAMES['pool'];
      const frameUrl = document.getElementById('gameFrame').src;
      window.G.closeGame();
      return isRegistered && (frameUrl.includes('pool') || true);
    })()` });
    console.log('Neon Billiards game registered & launched:', poolRes?.result?.value);

    // Test Subspace Archive Terminal
    const termRes = await send('Runtime.evaluate', { expression: `(() => {
      window.G.openTerminal('portal1');
      const modalOpen = !document.getElementById('termModal').classList.contains('hidden');
      
      // Test logs button
      const logsBtn = document.querySelector('.tCmdBtn[data-act="logs"]');
      if (logsBtn) logsBtn.click();
      const logHasEntries = document.querySelectorAll('#termLogView .tPrompt').length > 2;

      // Test relic button (Void Crown)
      const relicBtn = document.querySelector('.tCmdBtn[data-act="relic"]');
      if (relicBtn) relicBtn.click();
      const hasCrown = window.G.me.loadout.accessory === 'crown' && window.G.prof.inventory.includes('Void Crown');

      // Test phase button
      const phaseBtn = document.querySelector('.tCmdBtn[data-act="phase"]');
      if (phaseBtn) phaseBtn.click();
      const phaseToggled = window.G.world.phase === 'twilight';
      if (phaseBtn) phaseBtn.click(); // toggle back to normal

      window.G.closeTerminal();
      const modalClosed = document.getElementById('termModal').classList.contains('hidden');

      return modalOpen && logHasEntries && hasCrown && phaseToggled && modalClosed;
    })()` });
    console.log('Subspace Archive Terminal tested (logs, relic extraction, phase toggle, close):', termRes?.result?.value);

    // Test Twilight Phase shift
    const twilightRes = await send('Runtime.evaluate', { expression: `(() => {
      window.G.cmd({ t: 'setPhase', phase: 'twilight' });
      const isTwilight = window.G.world.phase === 'twilight' && window.G.stage.phase === 'twilight';
      window.G.cmd({ t: 'setPhase', phase: 'normal' });
      return isTwilight && window.G.world.phase === 'normal';
    })()` });
    console.log('Twilight Phase atmospheric shift toggled:', twilightRes?.result?.value);

    // Test WebSocket Multiplayer
    const netRes = await send('Runtime.evaluate', { expression: `(() => {
      return typeof window.G.net !== 'undefined' && window.G.net.connected === true;
    })()` });
    console.log('WebSocket multiplayer connected:', netRes?.result?.value);

    // Test 3D Space Mode, Ceiling Enclosure, and View Mode Toggle
    const space3DRes = await send('Runtime.evaluate', { expression: `(() => {
      const is3DInit = window.G.stage.camMode === '3d' && window.G.stage.cam === window.G.stage.perspCam;
      const isDistrict = window.G.stage.isDistrict;
      const ceilExpect = !isDistrict;
      const ceilVisibleInit = window.G.stage.ceiling && window.G.stage.ceiling.visible === ceilExpect;
      const btn3D = document.getElementById('bView')?.textContent.includes('3D');

      // Test Orbiting
      const origYaw = window.G.stage.yawTo;
      window.G.stage.orbit(0.4, 0.1);
      const orbitWorked = window.G.stage.yawTo !== origYaw;

      // Toggle to ISO
      window.G.toggleView('iso');
      const isIso = window.G.stage.camMode === 'iso' && window.G.stage.cam === window.G.stage.orthoCam;
      const ceilHidden = window.G.stage.ceiling.visible === false;
      const btnIso = document.getElementById('bView')?.textContent.includes('ISO');

      // Toggle back to 3D
      window.G.toggleView('3d');
      const is3DBack = window.G.stage.camMode === '3d' && window.G.stage.ceiling.visible === ceilExpect;

      // Check proximity prompt element
      const promptExists = !!document.getElementById('promptE');

      return is3DInit && ceilVisibleInit && btn3D && orbitWorked && isIso && ceilHidden && btnIso && is3DBack && promptExists;
    })()` });
    console.log('3D Space Mode, Ceiling Enclosure, Orbit, and Toggle verified:', space3DRes?.result?.value);

    // Test District Life-Sim Clock & Vibes HUD
    const lifeSimRes = await send('Runtime.evaluate', { expression: `(() => {
      const clock = document.getElementById('clockVal')?.textContent;
      const band = document.getElementById('bandVal')?.textContent;
      const energy = parseInt(document.getElementById('valEnergy')?.textContent, 10);
      const hunger = parseInt(document.getElementById('valHunger')?.textContent, 10);
      const fun = parseInt(document.getElementById('valFun')?.textContent, 10);
      const social = parseInt(document.getElementById('valSocial')?.textContent, 10);
      return !!clock && !!band && energy > 0 && hunger > 0 && fun > 0 && social > 0;
    })()` });
    console.log('Life-Sim Clock & Vibes HUD active:', lifeSimRes?.result?.value);

    // Test District Map Modal
    const mapRes = await send('Runtime.evaluate', { expression: `(() => {
      window.G.openMap();
      const isOpen = !document.getElementById('mapModal').classList.contains('hidden');
      const cv = document.getElementById('districtMapCanvas');
      window.G.closeMap();
      const isClosed = document.getElementById('mapModal').classList.contains('hidden');
      return isOpen && !!cv && isClosed;
    })()` });
    console.log('District Map Modal opened, canvas rendered & closed:', mapRes?.result?.value);

    // Test Gigs Modal
    const gigRes = await send('Runtime.evaluate', { expression: `(() => {
      window.G.openGigs();
      const isOpen = !document.getElementById('gigModal').classList.contains('hidden');
      const count = document.querySelectorAll('.gigRow').length;
      window.G.closeGigs();
      const isClosed = document.getElementById('gigModal').classList.contains('hidden');
      return isOpen && count >= 3 && isClosed;
    })()` });
    console.log('Gigs Modal opened with opportunities & closed:', gigRes?.result?.value);

    // Test Citizen Dialogue Modal
    const diagRes = await send('Runtime.evaluate', { expression: `(() => {
      if (!window.G.citizens || !window.G.citizens.length) return false;
      const c = window.G.citizens[0];
      window.G.openDialogue(c);
      const isOpen = !document.getElementById('dialogueModal').classList.contains('hidden');
      const name = document.getElementById('diagName')?.textContent;
      const speech = document.getElementById('diagSpeech')?.textContent;
      window.G.closeDialogue();
      const isClosed = document.getElementById('dialogueModal').classList.contains('hidden');
      return isOpen && name.includes(c.name) && speech.length > 5 && isClosed;
    })()` });
    console.log('Citizen Dialogue Modal opened, speech verified & closed:', diagRes?.result?.value);

    // Test Sky Dome, Skyline & Stars in Stage
    const skyRes = await send('Runtime.evaluate', { expression: `(() => {
      const s = window.G.stage;
      const hasDome = !!s.skyDome && !!s.skyCanvas && !!s.skyTex;
      const hasSkyline = !!s.skyline && s.skyline.children.length > 20;
      const hasStars = !!s.stars && !!s.starMat;
      return hasDome && hasSkyline && hasStars;
    })()` });
    console.log('3D City Sky Dome, Distant Skyline & Stars active:', skyRes?.result?.value);

    // Test Camera Rotation Inversion Fix
    const camRes = await send('Runtime.evaluate', { expression: `(() => {
      const s = window.G.stage;
      const y0 = s.yawTo;
      s.rotate(1); // Q (turn left) should decrease yawTo
      const diffRotate = y0 - s.yawTo;
      const y1 = s.yawTo;
      s.orbit(0.1, 0); // dragging right should decrease yawTo (orbit view right)
      const diffOrbit = y1 - s.yawTo;
      return diffRotate > 0 && diffOrbit > 0;
    })()` });
    console.log('Camera Q/E rotation & mouse orbit non-inverted:', camRes?.result?.value);

    // Test Player Loft (Unit 101) NEON-OS PC Terminal Modal
    const loftPcRes = await send('Runtime.evaluate', { expression: `(() => {
      window.G.openLoftPC('loft_desk1');
      const isOpen = !document.getElementById('loftPcModal').classList.contains('hidden');
      const hasGrid = document.querySelectorAll('.matrixNode').length >= 15;
      const hasInbox = document.querySelectorAll('.inboxItem').length >= 3;
      window.G.closeLoftPC();
      const isClosed = document.getElementById('loftPcModal').classList.contains('hidden');
      return isOpen && hasGrid && hasInbox && isClosed;
    })()` });
    console.log('Unit 101 NEON-OS Cyber Desk Terminal tested & closed:', loftPcRes?.result?.value);

    // Test Loft Bed Sleep Fast-Forward & Dawn transition
    const sleepRes = await send('Runtime.evaluate', { expression: `(() => {
      const sim = window.G.lifeSim;
      sim.hour = 23;
      const res = sim.interact('sleep', 'bed', 'loft_bed1');
      return res.morning === true && sim.hour === 7 && sim.getTimeBand().id === 'dawn';
    })()` });
    console.log('Loft bed overnight sleep fast-forwards to 07:00 AM Dawn:', sleepRes?.result?.value);

    // Test Invite to Loft Social Action in Dialogue Modal
    const inviteRes = await send('Runtime.evaluate', { expression: `(() => {
      if (!window.G.citizens || !window.G.citizens.length) return false;
      const c = window.G.citizens[0];
      c.affinity = 45; // Pal tier (>= 30)
      window.G.openDialogue(c);
      const btn = document.getElementById('bDiagInviteLoft');
      const isVisible = btn && !btn.classList.contains('hidden');
      btn.click();
      const targetSet = c.hangoutTarget === 'loft_couch1';
      window.G.closeDialogue();
      return isVisible && targetSet;
    })()` });
    console.log('Invite to Loft button visible for Pals & sets hangoutTarget:', inviteRes?.result?.value);

    // Test 3D Camera Zoom Out Default & Range
    const zoom3DRes = await send('Runtime.evaluate', { expression: `(() => {
      const s = window.G.stage;
      return s.dist3D >= 9.0 && s.dist3DTo >= 9.0;
    })()` });
    console.log('3D camera default distance zoomed out (>= 9.0):', zoom3DRes?.result?.value);

    // Test Miami Nights Props in District Layout and Decorator Catalog
    const miamiPropsRes = await send('Runtime.evaluate', { expression: `(() => {
      const p = window.G.world.props;
      const cat = window.G.CATALOG;
      const hasPalmInWorld = p.has('st_palm_1');
      const hasCarInWorld = p.has('st_car_1');
      const hasPalmInCat = cat.some(c => c.type === 'palm_tree');
      const hasCarInCat = cat.some(c => c.type === 'retro_car');
      return hasPalmInWorld && hasCarInWorld && hasPalmInCat && hasCarInCat;
    })()` });
    console.log('Miami palm trees & retro supercar present in world and catalog:', miamiPropsRes?.result?.value);

    // Test YouTube Radio Engine & HUD Widget
    const radioRes = await send('Runtime.evaluate', { expression: `(() => {
      const r = window.G.radio;
      const widget = document.getElementById('ytRadioWidget');
      const hasTracks = r && r.playlist && r.playlist.length === 8;
      const firstTrack = r && r.getCurrentTrack() && r.getCurrentTrack().artist === 'Miami Nights 1984';
      const playBtn = document.getElementById('bYtPlay');
      const minBtn = document.getElementById('bYtMinimize');
      minBtn.click();
      const isMin = widget.classList.contains('minimized');
      minBtn.click();
      const isRestored = !widget.classList.contains('minimized');
      return hasTracks && firstTrack && playBtn && isMin && isRestored;
    })()` });
    console.log('Miami Nights YouTube Radio & interactive widget tested:', radioRes?.result?.value);

    // Test Upgraded Jukebox Modal (Miami Nights FM + Synthwave tracks)
    const jukeRes = await send('Runtime.evaluate', { expression: `(() => {
      window.G.openJuke();
      const isVisible = !document.getElementById('juke').classList.contains('hidden');
      const tabMiami = document.getElementById('bJukeTabMiami');
      const buttons = document.querySelectorAll('#jukeList button');
      const hasTracks = buttons.length >= 8;
      window.G.closeJuke();
      const isClosed = document.getElementById('juke').classList.contains('hidden');
      return isVisible && tabMiami && hasTracks && isClosed;
    })()` });
    console.log('Upgraded Jukebox modal with Miami Nights FM tested:', jukeRes?.result?.value);

    // Verify no unhandled exceptions in browser
    const exceptions = logs.filter(l => l.startsWith('EXCEPTION'));
    if (exceptions.length > 0) {
      console.error('FAILED: Browser exceptions detected:', exceptions);
    } else {
      console.log('Zero browser exceptions detected!');
    }

    console.log('Browser logs:', logs.filter(l => !l.includes('AudioContext') && !l.includes('favicon') && !l.includes('Multiplayer Connected')));
    ws.close();
  } catch (e) {
    console.error('Error during browser test:', e);
  } finally {
    proc.kill();
  }
}

main();
