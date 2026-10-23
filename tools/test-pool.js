import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9280;

const proc = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + port,
  '--window-size=1080,720',
  '--disable-gpu',
  'http://localhost:8000/games/pool/index.html'
], { stdio: 'ignore' });

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  await wait(2500);
  try {
    const listRes = await fetch(`http://127.0.0.1:${port}/json`);
    const tabs = await listRes.json();
    const tab = tabs.find(t => t.url.includes('/games/pool/index.html')) || tabs.find(t => t.type === 'page');
    if (!tab) {
      console.log('No pool tab found');
      return;
    }
    console.log('Connected to tab:', tab.title);

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

    await wait(2000);

    // 1. Check poolApp ready
    const appReady = await send('Runtime.evaluate', {
      expression: 'typeof window.poolApp !== "undefined" && !!window.poolApp.game'
    });
    console.log('1. PoolApp ready:', appReady?.result?.value);

    // 2. Check Balls count
    const ballsCount = await send('Runtime.evaluate', {
      expression: 'window.poolApp.game.balls.length'
    });
    console.log('2. Balls initialized:', ballsCount?.result?.value);

    // 3. Test shooting
    const shootRes = await send('Runtime.evaluate', {
      expression: `(() => {
        window.poolApp.game.aimAngle = 0;
        window.poolApp.game.power = 0.6;
        window.poolApp.game.shoot();
        return window.poolApp.game.state === 'rolling' && Math.abs(window.poolApp.game.cueBall.vx) > 0;
      })()`
    });
    console.log('3. Ball struck and rolling:', shootRes?.result?.value);

    // Wait 1.5s for balls to roll
    await wait(1500);

    // 4. Test re-rack
    const rackRes = await send('Runtime.evaluate', {
      expression: `(() => {
        window.poolApp.game.rackBalls();
        return window.poolApp.game.balls.length === 16 && window.poolApp.game.shotsCount === 0;
      })()`
    });
    console.log('4. Re-rack verified:', rackRes?.result?.value);

    // 5. Test Felt Theme Cycle
    const themeRes = await send('Runtime.evaluate', {
      expression: `(() => {
        window.poolApp.cycleFelt();
        return window.poolApp.renderer.theme;
      })()`
    });
    console.log('5. Felt Theme cycled to:', themeRes?.result?.value);

    // 6. Test Mode Cycle
    const modeRes = await send('Runtime.evaluate', {
      expression: `(() => {
        window.poolApp.cycleMode();
        return window.poolApp.game.mode;
      })()`
    });
    console.log('6. Game Mode cycled to:', modeRes?.result?.value);

    // 7. Test Hold Space to Charge Shot
    console.log('7. Testing Hold Space to Charge Shot...');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ' });
    await wait(350); // charge for 350ms
    const powerWhileHolding = await send('Runtime.evaluate', {
      expression: 'window.poolApp.game.power'
    });
    console.log('7b. Power charged while holding Space:', powerWhileHolding?.result?.value);

    // Release Space to execute strike
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ' });
    await wait(200);

    const shotRolling = await send('Runtime.evaluate', {
      expression: 'window.poolApp.game.state === "rolling"'
    });
    console.log('7c. Shot fired via Space release (rolling):', shotRolling?.result?.value);

    // 8. Re-rack for clean presentation screenshot
    await send('Runtime.evaluate', { expression: 'window.poolApp.game.rackBalls();' });
    await wait(300);

    // 9. Capture clean HUD screenshot
    const shotClean = await send('Page.captureScreenshot');
    fs.writeFileSync('pool-game-preview.png', Buffer.from(shotClean.data, 'base64'));
    console.log('9. Clean GTA-style HUD screenshot saved as pool-game-preview.png');

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
