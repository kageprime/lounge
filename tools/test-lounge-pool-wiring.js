import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9285;

const proc = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + port,
  '--window-size=1280,720',
  '--disable-gpu',
  'http://localhost:8000'
], { stdio: 'ignore' });

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  await wait(2500);
  try {
    const listRes = await fetch(`http://127.0.0.1:${port}/json`);
    const tabs = await listRes.json();
    const tab = tabs.find(t => t.url.includes('localhost:8000'));
    if (!tab) {
      console.log('No lounge tab found');
      return;
    }
    console.log('Connected to lounge tab:', tab.title);

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const cur = id++;
        const h = evt => {
          const res = JSON.parse(evt.data);
          if (res.id === cur) { ws.removeEventListener('message', h); resolve(res.result); }
        };
        ws.addEventListener('message', h);
        ws.send(JSON.stringify({ id: cur, method, params }));
      });
    }

    await send('Runtime.enable');
    await send('Page.enable');

    const logs = [];
    const errors = [];
    ws.addEventListener('message', evt => {
      const d = JSON.parse(evt.data);
      if (d.method === 'Runtime.consoleAPICalled') {
        const line = d.params.type + ': ' + d.params.args.map(a => a.value ?? a.description).join(' ');
        logs.push(line);
        if (d.params.type === 'error') errors.push(line);
      }
      if (d.method === 'Runtime.exceptionThrown') {
        errors.push('EXCEPTION: ' + JSON.stringify(d.params.exceptionDetails));
      }
    });

    // Wait until window.G is defined
    console.log('Waiting for window.G...');
    let ready = false;
    for (let i = 0; i < 20; i++) {
      const check = await send('Runtime.evaluate', { expression: 'typeof window.G !== "undefined"' });
      console.log('Check window.G:', JSON.stringify(check));
      if (check?.result?.value === true) { ready = true; break; }
      await wait(500);
    }
    if (!ready) {
      console.error('Timed out waiting for window.G');
      return;
    }

    // 1. Verify Pool Prop in Lounge Layout
    const poolProp = await send('Runtime.evaluate', {
      expression: '!!window.G.world.props.get("pool1") && window.G.world.props.get("pool1").game === "pool"'
    });
    console.log('1. Pool table prop1 in lounge layout with game="pool":', poolProp?.result?.value);

    // 2. Initial wallet balance
    const initialWallet = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: '({ coins: window.G.prof.coins, tickets: window.G.prof.tickets })'
    });
    console.log('2. Initial wallet:', initialWallet?.result?.value);

    // 3. Trigger openGame('pool', 'pool1')
    console.log('3. Triggering openGame("pool", "pool1")...');
    await send('Runtime.evaluate', {
      expression: 'window.G.openGame("pool", "pool1")'
    });

    await wait(2000);

    // 4. Verify game portal iframe is opened
    const portalStatus = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const modal = document.getElementById('game');
        const frame = document.getElementById('gameFrame');
        const title = document.getElementById('gameTitle');
        return {
          visible: modal && !modal.classList.contains('hidden'),
          inClass: modal && modal.classList.contains('in'),
          src: frame ? frame.src : '',
          titleText: title ? title.textContent : ''
        };
      })()`
    });
    console.log('4. Game portal iframe status:', portalStatus?.result?.value);

    await wait(1000);
    const iframeDetails = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const frame = document.getElementById('gameFrame');
        if (!frame || !frame.contentWindow) return { error: 'no frame' };
        const win = frame.contentWindow;
        const cv = win.document.getElementById('gl');
        return {
          innerW: win.innerWidth,
          innerH: win.innerHeight,
          canvasClientW: cv ? cv.clientWidth : -1,
          canvasClientH: cv ? cv.clientHeight : -1,
          canvasW: cv ? cv.width : -1,
          canvasH: cv ? cv.height : -1,
          poolApp: typeof win.poolApp !== 'undefined',
          scale: win.poolApp ? win.poolApp.renderer.scale : -1
        };
      })()`
    });
    console.log('4b. Iframe details:', iframeDetails?.result?.value);

    // 5. Capture screenshot of the pool game portal inside the lounge
    const shot1 = await send('Page.captureScreenshot');
    fs.writeFileSync('lounge-pool-portal-open.png', Buffer.from(shot1.data, 'base64'));
    console.log('5. Screenshot saved as lounge-pool-portal-open.png');

    // 6. Test postMessage reward from pool game to lounge
    console.log('6. Testing postMessage gameReward (+120 tickets, +40 coins)...');
    await send('Runtime.evaluate', {
      expression: 'window.postMessage({ type: "gameReward", tickets: 120, coins: 40 }, "*")'
    });

    await wait(600);

    const updatedWallet = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: '({ coins: window.G.prof.coins, tickets: window.G.prof.tickets })'
    });
    console.log('6. Updated wallet after reward:', updatedWallet?.result?.value);

    // 7. Close game portal via closeGame()
    console.log('7. Closing game portal and returning to lounge...');
    await send('Runtime.evaluate', {
      expression: 'document.getElementById("gameClose").click()'
    });

    await wait(800);

    const closedStatus = await send('Runtime.evaluate', {
      expression: 'document.getElementById("game").classList.contains("hidden")'
    });
    console.log('7. Portal closed cleanly:', closedStatus?.result?.value);

    // 8. Capture screenshot after returning to lounge
    const shot2 = await send('Page.captureScreenshot');
    fs.writeFileSync('lounge-pool-returned.png', Buffer.from(shot2.data, 'base64'));
    console.log('8. Screenshot saved as lounge-pool-returned.png');

    console.log('Console errors:', errors.length);
    if (errors.length > 0) console.error(errors);

    ws.close();
  } catch (e) {
    console.error('Test error:', e);
  } finally {
    proc.kill();
  }
}

main();
