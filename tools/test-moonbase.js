import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9245;
const tempProfile = path.join(os.tmpdir(), 'edge_moon_test_' + Date.now());

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
  for (let attempt = 0; attempt < 12; attempt++) {
    await wait(500);
    try {
      listRes = await fetch(`http://127.0.0.1:${port}/json`);
      if (listRes.ok) break;
    } catch (e) {}
  }
  try {
    const tabs = await listRes.json();
    const tab = tabs.find(t => t.type === 'page');
    if (!tab) {
      console.log('No tab found');
      return;
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

    await send('Runtime.enable');
    const exceptions = [];
    const logs = [];
    ws.addEventListener('message', (evt) => {
      const data = JSON.parse(evt.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        const text = data.params.type + ': ' + data.params.args.map(a => a.value || a.description).join(' ');
        logs.push(text);
        if (data.params.type === 'error') console.error('[BROWSER_ERROR]', text);
      }
      if (data.method === 'Runtime.exceptionThrown') {
        const ex = data.params.exceptionDetails.text + ' ' + (data.params.exceptionDetails.exception?.description || '');
        exceptions.push(ex);
        console.error('[BROWSER_EXCEPTION]', ex);
      }
    });

    // Wait for window.G to be ready
    console.log('1. Waiting for window.G...');
    let ready = false;
    for (let i = 0; i < 30; i++) {
      const chk = await send('Runtime.evaluate', { expression: 'typeof window.G !== "undefined"' });
      if (chk?.result?.value === true) { ready = true; break; }
      await wait(400);
    }
    console.log('1. window.G ready:', ready);

    // 2. Test Fast Travel to Arcade
    const warpArcadeRes = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const btn = document.getElementById('bTravelArcade');
        if (btn) btn.click();
        else window.G.teleportTo('arcade');
        const me = window.G.me;
        return { x: me.x, y: me.y, activeBtn: document.getElementById('bTravelArcade')?.classList.contains('active') };
      })()`
    });
    console.log('2. Fast travel to Arcade:', warpArcadeRes?.result?.value);

    // 3. Test Fast Travel to Loft
    const warpLoftRes = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const btn = document.getElementById('bTravelLoft');
        if (btn) btn.click();
        else window.G.teleportTo('loft');
        const me = window.G.me;
        return { x: me.x, y: me.y, activeBtn: document.getElementById('bTravelLoft')?.classList.contains('active') };
      })()`
    });
    console.log('3. Fast travel to Loft:', warpLoftRes?.result?.value);

    // 4. Test Fast Travel to Moon Base
    const warpMoonRes = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const btn = document.getElementById('bTravelMoon');
        if (btn) btn.click();
        else window.G.teleportTo('moonbase');
        return {
          overlayOpen: !document.getElementById('moonbaseOverlay').classList.contains('hidden'),
          activeBtn: document.getElementById('bTravelMoon')?.classList.contains('active')
        };
      })()`
    });
    console.log('4. Fast travel to Moon Base:', warpMoonRes?.result?.value);

    await wait(1000);

    // 5. Verify MoonBaseStage canvas and modules
    const stageCheck = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const stageEl = document.getElementById('moonbaseStage');
        const canvas = stageEl?.querySelector('canvas');
        const toolbar = document.getElementById('moonbaseToolbar');
        return {
          hasCanvas: !!canvas,
          canvasWidth: canvas?.width,
          canvasHeight: canvas?.height,
          toolbarVisible: toolbar && !toolbar.classList.contains('hidden')
        };
      })()`
    });
    console.log('5. MoonBaseStage Canvas & Toolbar:', stageCheck?.result?.value);

    // 6. Test Interactive Action: Rocket Launch & Hopper
    const actionsRes = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        document.getElementById('bMbLaunch')?.click();
        document.getElementById('bMbHopper')?.click();
        return { clicked: true };
      })()`
    });
    console.log('6. MoonBase actions triggered:', actionsRes?.result?.value);

    await wait(600);

    // 7. Test Return to Loft
    const returnRes = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        document.getElementById('bMbReturn')?.click();
        return {
          overlayHidden: document.getElementById('moonbaseOverlay').classList.contains('hidden'),
          loftActive: document.getElementById('bTravelLoft')?.classList.contains('active')
        };
      })()`
    });
    console.log('7. Returned from Moon Base to Loft:', returnRes?.result?.value);

    console.log('Exceptions count:', exceptions.length);
    ws.close();
    if (exceptions.length > 0) {
      process.exit(1);
    }
  } catch (e) {
    console.error('Test error:', e);
    process.exit(1);
  } finally {
    proc.kill();
  }
}

main();
