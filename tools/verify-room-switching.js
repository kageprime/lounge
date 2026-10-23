import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9248;
const tempProfile = path.join(os.tmpdir(), 'edge_room_test_' + Date.now());

const proc = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + port,
  '--user-data-dir=' + tempProfile,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  'http://localhost:8000'
], { stdio: 'ignore' });

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  let listRes = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    await wait(400);
    try {
      listRes = await fetch(`http://127.0.0.1:${port}/json`);
      if (listRes.ok) break;
    } catch (e) {}
  }

  if (!listRes || !listRes.ok) {
    console.error('Failed to connect to Edge devtools port');
    proc.kill();
    process.exit(1);
  }

  try {
    const tabs = await listRes.json();
    const tab = tabs.find(t => t.type === 'page');
    if (!tab) {
      console.error('No page tab found');
      proc.kill();
      process.exit(1);
    }
    console.log('Connected to tab:', tab.title || tab.url);

    const WebSocket = globalThis.WebSocket;
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

    const consoleErrors = [];
    ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'assert')) {
        const text = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
        consoleErrors.push(text);
        console.error('Browser error:', text);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const text = msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text;
        consoleErrors.push(text);
        console.error('Browser exception:', text);
      }
    });

    await send('Runtime.enable');
    await send('Log.enable');

    async function evalCode(expr) {
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (res?.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
      }
      return res?.result?.value;
    }

    console.log('Waiting for window.G to initialize...');
    for (let i = 0; i < 30; i++) {
      await wait(300);
      const ready = await evalCode('!!(window.G && window.G.world && window.G.stage)');
      if (ready) break;
    }

    // Step 1: Initial state check
    const initialRoom = await evalCode('window.G.currentRoom');
    const initialProps = await evalCode('window.G.world.props.size');
    console.log(`Step 1 (Initial): currentRoom = "${initialRoom}", props count = ${initialProps}`);
    if (initialRoom !== 'arcade') throw new Error(`Expected initial room to be 'arcade', got '${initialRoom}'`);

    // Step 2: Teleport to Loft
    console.log('\nStep 2: Calling window.G.teleportTo("loft")...');
    await evalCode('window.G.teleportTo("loft")');
    await wait(600);

    const loftRoom = await evalCode('window.G.currentRoom');
    const loftLayoutId = await evalCode('window.G.world.layout.id');
    const hasLoftBed = await evalCode('window.G.world.props.has("loft_bed1")');
    const hasLoftDesk = await evalCode('window.G.world.props.has("loft_desk1")');
    const hasLoftDiorama = await evalCode('window.G.world.props.has("loft_diorama")');
    const hasLoftElevator = await evalCode('window.G.world.props.has("loft_elevator")');
    const stageTheme = await evalCode('window.G.stage.theme');

    console.log(`Loft verification: currentRoom = "${loftRoom}", layout.id = "${loftLayoutId}"`);
    console.log(`Props check: bed=${hasLoftBed}, desk=${hasLoftDesk}, diorama=${hasLoftDiorama}, elevator=${hasLoftElevator}, stage.theme="${stageTheme}"`);

    if (loftRoom !== 'loft') throw new Error(`Expected currentRoom 'loft', got '${loftRoom}'`);
    if (loftLayoutId !== 'loft-1') throw new Error(`Expected layout.id 'loft-1', got '${loftLayoutId}'`);
    if (!hasLoftBed || !hasLoftDesk || !hasLoftDiorama || !hasLoftElevator) {
      throw new Error('Missing expected loft furniture in 3D world');
    }

    // Step 3: Fast travel to Moon Base from Loft
    console.log('\nStep 3: Calling window.G.teleportTo("moonbase")...');
    await evalCode('window.G.teleportTo("moonbase")');
    await wait(800);

    const moonOverlayVisible = await evalCode('!document.getElementById("moonbaseOverlay").classList.contains("hidden")');
    console.log(`Moon Base overlay visible: ${moonOverlayVisible}`);
    if (!moonOverlayVisible) throw new Error('Moon Base overlay failed to become visible');

    // Step 4: Close Moon Base (returns to Loft)
    console.log('\nStep 4: Calling window.G.closeMoonBase()...');
    await evalCode('window.G.closeMoonBase()');
    await wait(600);

    const postMoonRoom = await evalCode('window.G.currentRoom');
    const overlayHidden = await evalCode('document.getElementById("moonbaseOverlay").classList.contains("hidden")');
    console.log(`After closing Moon Base: currentRoom = "${postMoonRoom}", overlayHidden = ${overlayHidden}`);
    if (postMoonRoom !== 'loft') throw new Error(`Expected to return to 'loft', got '${postMoonRoom}'`);
    if (!overlayHidden) throw new Error('Moonbase overlay should be hidden');

    // Step 5: Fast travel back to Arcade Lounge
    console.log('\nStep 5: Calling window.G.teleportTo("arcade")...');
    await evalCode('window.G.teleportTo("arcade")');
    await wait(600);

    const returnArcadeRoom = await evalCode('window.G.currentRoom');
    const arcadeLayoutId = await evalCode('window.G.world.layout.id');
    const hasPoolTable = await evalCode('window.G.world.props.has("pool1")');
    const hasLudoTable = await evalCode('window.G.world.props.has("ludo1")');
    const hasArcadePortal = await evalCode('window.G.world.props.has("portal1")');

    console.log(`Arcade return: currentRoom = "${returnArcadeRoom}", layout.id = "${arcadeLayoutId}"`);
    console.log(`Arcade props: pool1=${hasPoolTable}, ludo1=${hasLudoTable}, portal1=${hasArcadePortal}`);

    if (returnArcadeRoom !== 'arcade') throw new Error(`Expected currentRoom 'arcade', got '${returnArcadeRoom}'`);
    if (arcadeLayoutId !== 'lounge-1') throw new Error(`Expected layout.id 'lounge-1', got '${arcadeLayoutId}'`);
    if (!hasPoolTable || !hasLudoTable || !hasArcadePortal) {
      throw new Error('Missing expected arcade lounge props');
    }

    // Step 6: Console error check
    console.log('\nStep 6: Checking console errors...');
    console.log(`Console error count: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      throw new Error(`Console errors detected during room navigation:\n${consoleErrors.join('\n')}`);
    }

    console.log('\n========================================');
    console.log('✅ ALL ROOM SWITCHING & VERIFICATION TESTS PASSED!');
    console.log('========================================');

    ws.close();
    proc.kill();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    proc.kill();
    process.exit(1);
  }
}

main();
