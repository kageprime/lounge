import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9224;

const proc = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + port,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  'http://localhost:8000'
], { stdio: 'ignore' });

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  await wait(3000);
  try {
    const listRes = await fetch(`http://127.0.0.1:${port}/json`);
    const tabs = await listRes.json();
    const tab = tabs.find(t => t.url.includes('localhost:8000'));
    if (!tab) {
      console.error('No tab found for localhost:8000');
      proc.kill();
      process.exit(1);
    }

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

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
    await send('Page.enable');

    const logs = [];
    const errors = [];
    ws.addEventListener('message', (evt) => {
      const data = JSON.parse(evt.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        const line = data.params.type + ': ' + data.params.args.map(a => a.value || a.description).join(' ');
        logs.push(line);
        if (data.params.type === 'error') errors.push(line);
      }
      if (data.method === 'Runtime.exceptionThrown') {
        const ex = 'EXCEPTION: ' + JSON.stringify(data.params.exceptionDetails);
        logs.push(ex);
        errors.push(ex);
      }
    });

    // 1. Wait for window.G
    let gReady = false;
    for (let i = 0; i < 25; i++) {
      const gCheck = await send('Runtime.evaluate', { expression: 'typeof window.G !== "undefined"' });
      if (gCheck?.result?.value === true) { gReady = true; break; }
      await wait(400);
    }
    console.log('1. window.G ready:', gReady);

    // 2. Verify loft_diorama exists in player loft
    const dioramaCheck = await send('Runtime.evaluate', { expression: `
      window.G.world.props.has('loft_diorama');
    ` });
    console.log('2. loft_diorama in Unit 101:', dioramaCheck?.result?.value);

    // 3. Verify loft PC has Artemis tab
    const pcTabCheck = await send('Runtime.evaluate', { expression: `
      const tab = document.querySelector('.pcTab[data-pctab="moonbase"]');
      const btn = document.getElementById('bWarpMoonBase');
      !!tab && !!btn;
    ` });
    console.log('3. Loft PC Artemis Tab & Warp button present:', pcTabCheck?.result?.value);

    // 4. Test opening Moon Base stage
    const openRes = await send('Runtime.evaluate', { expression: `
      window.G.openMoonBase('loft_diorama');
      !document.getElementById('moonbaseOverlay').classList.contains('hidden');
    ` });
    console.log('4. openMoonBase triggered & overlay active:', openRes?.result?.value);

    // Wait for diorama build & initial render
    await wait(1800);

    // 5. Verify toolbar & diorama stage state
    const stageCheck = await send('Runtime.evaluate', { expression: `
      const stageEl = document.getElementById('moonbaseStage');
      const hasCanvas = stageEl && stageEl.querySelector('canvas') !== null;
      const toolbar = document.getElementById('moonbaseToolbar');
      const timeSlider = document.getElementById('mbTimeSlider');
      hasCanvas && !!toolbar && !!timeSlider;
    ` });
    console.log('5. MoonBaseStage canvas and toolbar rendered:', stageCheck?.result?.value);

    // 6. Test Interactive Triggers: Rocket launch, Hopper, Lights, Meteors
    const interactRes = await send('Runtime.evaluate', { expression: `
      document.getElementById('bMbLaunch').click();
      document.getElementById('bMbHopper').click();
      document.getElementById('bMbLights').click();
      document.getElementById('bMbMeteors').click();
      true;
    ` });
    console.log('6. Toolbar interactive actions triggered:', interactRes?.result?.value);

    await wait(1500);

    // 7. Take screenshot of the Moon Base Tabletop Diorama
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot?.data) {
      fs.writeFileSync('moonbase-stage-preview.png', Buffer.from(shot.data, 'base64'));
      console.log('7. Screenshot saved as moonbase-stage-preview.png');
    }

    // 8. Test Return back to Unit 101
    const returnRes = await send('Runtime.evaluate', { expression: `
      document.getElementById('bMbReturn').click();
      true;
    ` });
    console.log('8. Return to Unit 101 triggered:', returnRes?.result?.value);

    await wait(600);

    const closedCheck = await send('Runtime.evaluate', { expression: `
      document.getElementById('moonbaseOverlay').classList.contains('hidden');
    ` });
    console.log('9. MoonBase stage closed cleanly:', closedCheck?.result?.value);

    console.log('Console errors encountered:', errors.length);
    if (errors.length > 0) {
      console.error('Errors:', errors);
    }

    ws.close();
    proc.kill();
    process.exit(errors.length === 0 ? 0 : 1);
  } catch (err) {
    console.error('Verification failed:', err);
    proc.kill();
    process.exit(1);
  }
}

run();
